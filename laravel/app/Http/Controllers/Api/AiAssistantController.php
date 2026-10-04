<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\Teacher;
use App\Models\Department;
use App\Models\OfficialDocument;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

class AiAssistantController extends Controller
{
    public function summarizeDocument(Request $request, OfficialDocument $document): JsonResponse
    {
        $apiKey = config('services.openai.key');
        if (! $apiKey) return response()->json(['message' => 'AI chưa được cấu hình OPENAI_API_KEY.'], 503);
        $document->load('file');
        if (! $document->file || ! Storage::disk($document->file->disk)->exists($document->file->path)) {
            return response()->json(['message' => 'Tài liệu chưa có file hoặc file không tồn tại.'], 422);
        }

        $mime = $document->file->mime_type ?: 'application/octet-stream';
        $contents = Storage::disk($document->file->disk)->get($document->file->path);
        $dataUrl = 'data:'.$mime.';base64,'.base64_encode($contents);
        $fileInput = str_starts_with($mime, 'image/')
            ? ['type' => 'input_image', 'image_url' => $dataUrl, 'detail' => 'high']
            : ['type' => 'input_file', 'filename' => $document->file->original_name, 'file_data' => $dataUrl];

        $response = Http::withToken($apiKey)->timeout(120)->post('https://api.openai.com/v1/responses', [
            'model' => config('services.openai.model', 'gpt-5'),
            'store' => false,
            'max_output_tokens' => 3000,
            'reasoning' => ['effort' => 'low'],
            'instructions' => 'Bạn là trợ lý phân tích tài liệu của Trường TH-THCS Thanh Đàm. Nội dung thực tế bên trong file là nguồn chính xác duy nhất. Tên file và tiêu đề bản ghi chỉ là metadata tham khảo, có thể bị đặt sai. Luôn tóm tắt nội dung thật đọc được trong file; tuyệt đối không từ chối hoặc yêu cầu người dùng tải lại chỉ vì metadata không khớp. Nếu phát hiện không khớp, vẫn hoàn thành bản tóm tắt và ghi ngắn gọn sự khác biệt trong mục Lưu ý về tài liệu. Không suy đoán. Trả lời bằng tiếng Việt rõ ràng, súc tích và phải hoàn thành đầy đủ, không dừng giữa câu.',
            'input' => [[
                'role' => 'user',
                'content' => [
                    $fileInput,
                    ['type' => 'input_text', 'text' => "Hãy đọc toàn bộ nội dung thực tế trong file đính kèm và tóm tắt theo đúng các mục: **Mục đích**, **Các ý chính**, **Mốc thời gian, số liệu và đối tượng quan trọng**, **Việc cần thực hiện**, **Lưu ý về tài liệu**. Tiêu đề bản ghi tham khảo là “{$document->title}” và tên file là “{$document->file->original_name}”; nếu chúng không khớp nội dung thật thì không được dừng tóm tắt, chỉ nêu sự khác biệt tại mục Lưu ý. Tiêu đề từng mục phải in đậm bằng cú pháp **...**; nội dung dùng danh sách gạch đầu dòng, ngắn gọn và không thêm thông tin ngoài file."],
                ],
            ]],
        ]);

        if (! $response->successful()) {
            report(new \RuntimeException('OpenAI document summary failed: '.$response->status().' '.$response->body()));
            return response()->json(['message' => 'AI chưa thể đọc file này. Vui lòng kiểm tra định dạng hoặc thử lại sau.'], 502);
        }
        $output = collect($response->json('output', []))->flatMap(fn ($item) => $item['content'] ?? [])->firstWhere('type', 'output_text');
        $summary = trim($output['text'] ?? '');
        if ($summary === '') return response()->json(['message' => 'AI không trích xuất được nội dung từ file này.'], 422);

        return response()->json(['summary' => $summary, 'generated_at' => now()->toIso8601String()]);
    }

    public function ask(Request $request): JsonResponse
    {
        $this->ensurePrincipal($request);
        $data = $request->validate(['question'=>['required','string','max:2000'],'history'=>['nullable','array','max:10'],'history.*.role'=>['required','in:user,assistant'],'history.*.content'=>['required','string','max:3000']]);
        $apiKey = config('services.openai.key');
        if (! $apiKey) return response()->json(['message'=>'Trợ lý AI chưa được cấu hình OPENAI_API_KEY.'],503);
        $history = collect($data['history'] ?? [])->map(fn($message)=>['role'=>$message['role'],'content'=>$message['content']])->all();
        $response = Http::withToken($apiKey)->timeout(60)->post('https://api.openai.com/v1/responses',[
            'model'=>config('services.openai.model','gpt-5'),
            'instructions'=>'Bạn là trợ lý nội bộ dành riêng cho Hiệu trưởng Trường TH-THCS Thanh Đàm. Chỉ trả lời bằng tiếng Việt, ngắn gọn, chính xác. Dữ liệu hệ thống mới nhất được cung cấp trong câu hỏi là nguồn sự thật và luôn thay thế mọi số liệu cũ trong lịch sử hội thoại; không tự bịa số liệu. Nếu dữ liệu chưa đủ, hãy nói rõ.',
            'input'=>[...$history,['role'=>'user','content'=>"DỮ LIỆU HỆ THỐNG HIỆN TẠI:\n".json_encode($this->schoolContext(),JSON_UNESCAPED_UNICODE)."\n\nCÂU HỎI:\n".$data['question']]],
        ]);
        if (! $response->successful()) return response()->json(['message'=>'Không thể kết nối trợ lý AI lúc này.'],502);
        $payload = $response->json();
        $outputText = collect($payload['output'] ?? [])->flatMap(fn($item)=>$item['content'] ?? [])->firstWhere('type','output_text');
        $answer = $outputText['text'] ?? null;
        return response()->json(['answer'=>$answer ?: 'AI chưa trả về nội dung.','generated_at'=>now()->toIso8601String()]);
    }

    private function schoolContext(): array
    {
        $recent = Task::with(['creator:id,name', 'reviewers:id,name', 'category:id,name'])->latest()->limit(20)->get()->map(fn ($task) => ['code' => $task->code, 'title' => $task->title, 'type' => $task->category?->name, 'status' => $task->status, 'due_at' => $task->due_at?->toIso8601String(), 'completed_at' => $task->completed_at?->toIso8601String(), 'creator' => $task->creator?->name, 'reviewers' => $task->reviewers->pluck('name')->join(', ')]);
        $teachers = Teacher::with(['user', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('employment_status', 'working')->get()->map(fn ($teacher) => ['name' => $teacher->user?->name, 'department' => $teacher->departments->map(fn ($d) => Department::pathLabel($d->id))->join(', '), 'roles' => $teacher->user?->roleLabels() ?? []]);
        $workload = DB::table('task_teacher_assignees as a')->join('tasks as t', 't.id', '=', 'a.task_id')->join('teachers as te', 'te.id', '=', 'a.teacher_id')->join('users as u', 'u.id', '=', 'te.user_id')->whereNull('t.deleted_at')
            ->select('u.name', DB::raw("SUM(t.status IN ('not_started','in_progress','waiting_approval')) as open_tasks"), DB::raw("SUM(t.status = 'completed') as completed_tasks"), DB::raw("SUM(t.status IN ('not_started','in_progress') AND t.due_at < NOW()) as overdue_tasks"))
            ->groupBy('u.id', 'u.name')->orderByDesc('open_tasks')->limit(20)->get();

        return ['generated_at' => now()->toIso8601String(), 'task_stats' => ['total' => Task::count(), 'not_started' => Task::where('status', Task::NOT_STARTED)->count(), 'in_progress' => Task::where('status', Task::IN_PROGRESS)->count(), 'waiting_approval' => Task::where('status', Task::WAITING_APPROVAL)->count(), 'completed' => Task::where('status', Task::COMPLETED)->count(), 'overdue' => Task::whereIn('status', [Task::NOT_STARTED, Task::IN_PROGRESS])->where('due_at', '<', now())->count()], 'recent_tasks' => $recent, 'working_teachers' => $teachers, 'teacher_count' => $teachers->count(), 'teacher_workload' => $workload];
    }

    private function ensurePrincipal(Request $request): void
    {
        abort_unless($request->user()->hasRole(Role::HIEU_TRUONG),403,'Trợ lý AI chỉ dành cho Hiệu trưởng.');
    }
}
