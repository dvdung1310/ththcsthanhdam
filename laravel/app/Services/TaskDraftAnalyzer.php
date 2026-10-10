<?php

namespace App\Services;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Role;
use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use ZipArchive;

class TaskDraftAnalyzer
{
    public const MAX_TASKS = 15;

    public const MAX_DOCUMENTS = 5;

    private const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    private const REVIEWER_ROLES = [Role::HIEU_TRUONG, Role::PHO_HIEU_TRUONG, Role::BAN_GIAM_HIEU, Role::THU_KY, Role::TO_TRUONG, Role::TO_PHO, Role::NHOM_TRUONG];

    /** @param array<int, array{name: string, mime: string, contents: string}> $documents */
    public function analyze(User $user, array $documents): array
    {
        $apiKey = config('services.openai.key');
        if (! $apiKey) {
            throw new RuntimeException('AI chưa được cấu hình OPENAI_API_KEY.', 503);
        }
        $context = $this->context($user);
        $inputs = [];
        foreach (array_values($documents) as $index => $document) {
            $inputs[] = ['type' => 'input_text', 'text' => 'TÀI LIỆU SỐ '.($index + 1).': “'.$document['name'].'”'];
            $inputs[] = $this->documentInput($document['name'], $document['mime'], $document['contents']);
        }
        $names = collect($documents)->values()->map(fn ($d, $i) => ($i + 1).'. '.$d['name'])->join('; ');
        $response = Http::withToken($apiKey)->timeout(280)->post('https://api.openai.com/v1/responses', [
            'model' => config('services.openai.model', 'gpt-5'),
            'store' => false,
            'max_output_tokens' => 12000,
            'reasoning' => ['effort' => 'low'],
            'instructions' => $this->instructions(),
            'text' => ['format' => ['type' => 'json_schema', 'name' => 'task_plan', 'strict' => true, 'schema' => $this->schema()]],
            'input' => [[
                'role' => 'user',
                'content' => [
                    ...$inputs,
                    ['type' => 'input_text', 'text' => "DỮ LIỆU TRƯỜNG (chỉ dùng các id có trong đây):\n".json_encode($context['prompt'], JSON_UNESCAPED_UNICODE)
                        ."\n\nHãy đọc toàn bộ ".count($documents)." tài liệu ({$names}) như một bộ hồ sơ liên quan, rồi trả về phân tích và danh sách công việc cần giao theo đúng schema. Với mỗi việc, ghi số thứ tự các tài liệu làm căn cứ vào document_numbers."],
                ],
            ]],
        ]);
        if (! $response->successful()) {
            report(new RuntimeException('OpenAI task draft analysis failed: '.$response->status().' '.$response->body()));
            throw new RuntimeException('AI chưa đọc được tài liệu này. Vui lòng kiểm tra định dạng hoặc thử lại sau.', 502);
        }
        $text = collect($response->json('output', []))->flatMap(fn ($item) => $item['content'] ?? [])->firstWhere('type', 'output_text')['text'] ?? '';
        $plan = json_decode($text, true);
        if (! is_array($plan) || ! isset($plan['tasks'])) {
            throw new RuntimeException('AI không trả về được kế hoạch công việc cho tài liệu này.', 422);
        }

        $count = count($documents);

        return [
            'analysis' => $this->analysis($plan['document'] ?? []),
            'documents' => collect(range(1, $count))->map(fn ($number) => trim((string) (collect($plan['files'] ?? [])->firstWhere('number', $number)['kind'] ?? '')) ?: null)->all(),
            'drafts' => $this->drafts($plan['tasks'], $context, $user, $count),
        ];
    }

    private function instructions(): string
    {
        return 'Bạn là trợ lý lập kế hoạch công việc của Trường TH-THCS Thanh Đàm (Hà Nội). '
            .'Đọc kỹ các văn bản (công văn, kế hoạch, thông báo, yêu cầu báo cáo, phụ lục, mẫu biểu…) — có thể gồm nhiều tài liệu liên quan nhau — và xác định các công việc nhà trường cần giao để thực hiện. '
            .'Không tạo trùng việc khi nhiều tài liệu nói cùng một nội dung; phụ lục/mẫu biểu là căn cứ của việc chứ không phải việc riêng. '
            .'Mỗi công việc phải cụ thể, giao được cho người/tổ cụ thể, có hạn hoàn thành bám theo mốc trong văn bản (hạn nội bộ nên sớm hơn hạn nộp lên cấp trên 1–3 ngày làm việc). '
            .'Chỉ chọn người thực hiện, tổ/nhóm, người duyệt và loại nhiệm vụ từ danh sách id được cung cấp; không bịa id. '
            .'Ưu tiên giao cho tổ/nhóm khi việc áp dụng cho cả tổ; dùng all_homeroom=true khi việc dành cho tất cả giáo viên chủ nhiệm. '
            .'Cân nhắc số việc đang mở của từng người để tránh dồn việc. Người duyệt thường là người phụ trách mảng (Ban giám hiệu hoặc tổ trưởng), không trùng người thực hiện. '
            .'Ngày dùng định dạng YYYY-MM-DD; nếu văn bản không nêu thì để null. Không gộp quá nhiều việc vào một; tối đa '.self::MAX_TASKS.' việc. '
            .'Viết tiếng Việt, ngắn gọn, đúng nội dung văn bản; không thêm yêu cầu không có trong văn bản.';
    }

    private function schema(): array
    {
        $nullableString = ['type' => ['string', 'null']];
        $ids = ['type' => 'array', 'items' => ['type' => 'integer']];

        return [
            'type' => 'object',
            'additionalProperties' => false,
            'required' => ['document', 'files', 'tasks'],
            'properties' => [
                'files' => ['type' => 'array', 'items' => [
                    'type' => 'object', 'additionalProperties' => false, 'required' => ['number', 'kind'],
                    'properties' => ['number' => ['type' => 'integer'], 'kind' => ['type' => 'string', 'description' => 'Loại của từng tài liệu: Công văn, Kế hoạch, Phụ lục, Mẫu biểu…']],
                ]],
                'document' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['kind', 'title', 'issuer', 'number', 'issued_on', 'summary', 'deadlines'],
                    'properties' => [
                        'kind' => ['type' => 'string', 'description' => 'Loại văn bản, ví dụ: Công văn, Kế hoạch, Thông báo, Yêu cầu báo cáo'],
                        'title' => ['type' => 'string'],
                        'issuer' => $nullableString,
                        'number' => $nullableString,
                        'issued_on' => $nullableString,
                        'summary' => ['type' => 'array', 'items' => ['type' => 'string']],
                        'deadlines' => ['type' => 'array', 'items' => [
                            'type' => 'object', 'additionalProperties' => false, 'required' => ['date', 'label'],
                            'properties' => ['date' => $nullableString, 'label' => ['type' => 'string']],
                        ]],
                    ],
                ],
                'tasks' => ['type' => 'array', 'items' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['title', 'requirements', 'document_numbers', 'unit_ids', 'employee_ids', 'all_homeroom', 'reviewer_user_id', 'start_date', 'due_date', 'category_id', 'priority', 'reason'],
                    'properties' => [
                        'title' => ['type' => 'string'],
                        'requirements' => ['type' => 'array', 'items' => ['type' => 'string']],
                        'document_numbers' => ['type' => 'array', 'items' => ['type' => 'integer']],
                        'unit_ids' => $ids,
                        'employee_ids' => $ids,
                        'all_homeroom' => ['type' => 'boolean'],
                        'reviewer_user_id' => ['type' => ['integer', 'null']],
                        'start_date' => $nullableString,
                        'due_date' => $nullableString,
                        'category_id' => ['type' => ['integer', 'null']],
                        'priority' => ['type' => 'string', 'enum' => self::PRIORITIES],
                        'reason' => ['type' => 'string', 'description' => 'Một câu giải thích vì sao gợi ý việc và cách phân công này'],
                    ],
                ]],
            ],
        ];
    }

    private function documentInput(string $name, string $mime, string $contents): array
    {
        if (str_starts_with($mime, 'image/')) {
            return ['type' => 'input_image', 'image_url' => 'data:'.$mime.';base64,'.base64_encode($contents), 'detail' => 'high'];
        }
        if ($mime === 'application/pdf' || str_ends_with(strtolower($name), '.pdf')) {
            return ['type' => 'input_file', 'filename' => $name, 'file_data' => 'data:application/pdf;base64,'.base64_encode($contents)];
        }
        if (str_contains($mime, 'wordprocessingml') || str_ends_with(strtolower($name), '.docx')) {
            return ['type' => 'input_text', 'text' => "NỘI DUNG TÀI LIỆU “{$name}”:\n".$this->docxText($contents)];
        }
        if (str_starts_with($mime, 'text/')) {
            return ['type' => 'input_text', 'text' => "NỘI DUNG TÀI LIỆU “{$name}”:\n".mb_substr($contents, 0, 200000)];
        }
        throw new RuntimeException('Chỉ hỗ trợ file PDF, Word (.docx), ảnh hoặc văn bản thuần. File .doc cũ hãy lưu lại thành .docx hoặc PDF.', 422);
    }

    private function docxText(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'docx');
        file_put_contents($path, $contents);
        $zip = new ZipArchive();
        $xml = $zip->open($path) === true ? (string) $zip->getFromName('word/document.xml') : '';
        $zip->close();
        @unlink($path);
        $xml = preg_replace(['/<w:tab[^>]*\/>/', '/<\/w:p>/', '/<\/w:tc>/'], ["\t", "\n", " | "], $xml);
        $text = trim(html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8'));
        if ($text === '') {
            throw new RuntimeException('Không đọc được nội dung file Word này.', 422);
        }

        return mb_substr(preg_replace("/\n{3,}/", "\n\n", $text), 0, 200000);
    }

    private function context(User $user): array
    {
        $scope = $user->managedUnitIds();
        $units = Department::ordered($scope);
        $employees = Employee::with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->where('employment_status', 'working')->whereHas('user', fn ($q) => $q->where('status', 'active'))
            ->when($scope !== null, fn ($q) => $q->inUnits($scope))->get();
        $open = DB::table('task_employee_assignees as a')->join('tasks as t', 't.id', '=', 'a.task_id')->whereNull('t.deleted_at')
            ->whereIn('t.status', [Task::NOT_STARTED, Task::IN_PROGRESS, Task::WAITING_APPROVAL])
            ->groupBy('a.employee_id')->selectRaw('a.employee_id, COUNT(*) as open_count')->pluck('open_count', 'employee_id');
        $reviewers = User::with('roles')->where('status', 'active')
            ->whereHas('roles', fn ($q) => $q->whereIn('code', self::REVIEWER_ROLES))->orderBy('name')->get();
        $categories = TaskCategory::where('is_active', true)->orderBy('name')->get(['id', 'name', 'description']);
        $today = CarbonImmutable::today();

        return [
            'units' => $units->pluck('id')->map(fn ($id) => (int) $id)->all(),
            'employees' => $employees->keyBy('id'),
            'homeroom' => $employees->filter(fn (Employee $e) => $e->user->roles->contains('code', Role::GVCN))->pluck('id')->map(fn ($id) => (int) $id)->values()->all(),
            'reviewers' => $reviewers->keyBy('id'),
            'categories' => $categories->pluck('id')->map(fn ($id) => (int) $id)->all(),
            'prompt' => [
                'today' => $today->toDateString(),
                'weekday_today' => $today->locale('vi')->dayName,
                'school_year' => ($today->month >= 8 ? $today->year : $today->year - 1).'-'.($today->month >= 8 ? $today->year + 1 : $today->year),
                'units' => $units->map(fn ($u) => ['id' => $u['id'], 'name' => $u['label'], 'type' => $u['type']])->values(),
                'employees' => $employees->map(fn (Employee $e) => [
                    'id' => $e->id, 'name' => $e->user->name,
                    'roles' => $e->user->roleLabels(),
                    'units' => $e->departments->map(fn ($d) => Department::pathLabel($d->id))->values(),
                    'open_tasks' => (int) ($open[$e->id] ?? 0),
                ])->values(),
                'reviewers' => $reviewers->map(fn (User $u) => ['user_id' => $u->id, 'name' => $u->name, 'roles' => $u->roleLabels()])->values(),
                'categories' => $categories->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'description' => $c->description])->values(),
            ],
        ];
    }

    private function analysis(array $document): array
    {
        return [
            'kind' => trim((string) ($document['kind'] ?? '')) ?: 'Văn bản',
            'title' => trim((string) ($document['title'] ?? '')),
            'issuer' => $document['issuer'] ?? null,
            'number' => $document['number'] ?? null,
            'issued_on' => $this->date($document['issued_on'] ?? null)?->toDateString(),
            'summary' => array_values(array_filter(array_map('trim', $document['summary'] ?? []))),
            'deadlines' => collect($document['deadlines'] ?? [])->map(fn ($d) => ['date' => $this->date($d['date'] ?? null)?->toDateString(), 'label' => trim((string) ($d['label'] ?? ''))])
                ->filter(fn ($d) => $d['label'] !== '')->values()->all(),
        ];
    }

    private function drafts(array $tasks, array $context, User $user, int $documentCount): Collection
    {
        $today = CarbonImmutable::today();

        return collect($tasks)->take(self::MAX_TASKS)->map(function (array $task) use ($context, $user, $today, $documentCount) {
            $numbers = collect($task['document_numbers'] ?? [])->map(fn ($n) => (int) $n)->filter(fn ($n) => $n >= 1 && $n <= $documentCount)->unique()->sort()->values();
            $employeeIds = collect($task['employee_ids'] ?? [])->map(fn ($id) => (int) $id)
                ->merge(($task['all_homeroom'] ?? false) ? $context['homeroom'] : [])
                ->filter(fn ($id) => $context['employees']->has($id))->unique()->values();
            $unitIds = collect($task['unit_ids'] ?? [])->map(fn ($id) => (int) $id)->filter(fn ($id) => in_array($id, $context['units'], true))->unique()->values();
            $assigneeUsers = $employeeIds->map(fn ($id) => $context['employees'][$id]->user_id);
            $reviewer = (int) ($task['reviewer_user_id'] ?? 0);
            $reviewerIds = $context['reviewers']->has($reviewer) && ! $assigneeUsers->contains($reviewer) && ! ($reviewer === $user->id && $assigneeUsers->contains($user->id)) ? [$reviewer] : [];
            $start = $this->date($task['start_date'] ?? null);
            $start = $start && $start->gte($today) ? $start : $today;
            $due = $this->date($task['due_date'] ?? null);
            $due = $due && $due->gte($start) ? $due : null;
            $category = (int) ($task['category_id'] ?? 0);
            $points = array_values(array_filter(array_map('trim', $task['requirements'] ?? [])));

            return [
                'title' => mb_substr(trim((string) ($task['title'] ?? '')) ?: 'Công việc mới', 0, Task::TITLE_MAX),
                'description' => $points ? '<p><strong>Yêu cầu:</strong></p><ul>'.implode('', array_map(fn ($p) => '<li>'.e($p).'</li>', $points)).'</ul>' : '',
                'employee_ids' => $employeeIds->all(),
                'department_ids' => $unitIds->all(),
                'reviewer_ids' => $reviewerIds,
                'starts_at' => $start->format('Y-m-d').'T07:30',
                'due_at' => $due ? $due->format('Y-m-d').'T17:00' : null,
                'priority' => in_array($task['priority'] ?? '', self::PRIORITIES, true) ? $task['priority'] : 'normal',
                'category_id' => in_array($category, $context['categories'], true) ? $category : null,
                'share_submissions' => true,
                'ai_reason' => trim((string) ($task['reason'] ?? '')) ?: null,
                'source_numbers' => ($numbers->isEmpty() ? collect(range(1, $documentCount)) : $numbers)->all(),
            ];
        })->values();
    }

    private function date(?string $value): ?CarbonImmutable
    {
        if (! $value || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }
        try {
            return CarbonImmutable::createFromFormat('!Y-m-d', $value);
        } catch (\Throwable) {
            return null;
        }
    }
}
