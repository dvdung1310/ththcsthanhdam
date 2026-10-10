<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LibraryNode;
use App\Models\StoredFile;
use App\Models\TaskDraft;
use App\Models\TaskDraftBatch;
use App\Models\User;
use App\Services\FileStore;
use App\Services\LibraryAccess;
use App\Services\TaskDraftAnalyzer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use RuntimeException;

class TaskDraftController extends Controller
{
    public function __construct(private TaskDraftAnalyzer $analyzer, private FileStore $store) {}

    public function index(Request $request): JsonResponse
    {
        $batches = TaskDraftBatch::with(['drafts', 'sourceNode.file', 'sourceFile'])->where('created_by', $request->user()->id)->latest()->get();

        return response()->json(['data' => $batches->map(fn (TaskDraftBatch $batch) => $this->serialize($batch))->values()]);
    }

    public function analyze(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'node_id' => ['nullable', 'integer', 'required_without:file', Rule::exists('library_nodes', 'id')->where('type', LibraryNode::FILE)],
            'file' => ['nullable', 'file', 'required_without:node_id', 'max:20480', 'mimes:pdf,docx,doc,txt,jpg,jpeg,png,webp'],
        ], ['file.mimes' => 'Chỉ hỗ trợ PDF, Word, ảnh hoặc văn bản thuần.', 'file.max' => 'File tối đa 20MB.']);
        @set_time_limit(200);

        $node = null;
        $stored = null;
        if (isset($data['node_id'])) {
            $node = LibraryNode::with('file')->findOrFail($data['node_id']);
            abort_unless((new LibraryAccess($user))->can($node, LibraryAccess::READ), 403, 'Bạn không có quyền xem file này.');
            abort_unless($node->file && Storage::disk($node->file->disk)->exists($node->file->path), 422, 'File không tồn tại.');
            [$name, $mime, $contents] = [$node->name, $node->file->mime_type ?: 'application/octet-stream', Storage::disk($node->file->disk)->get($node->file->path)];
        } else {
            $upload = $request->file('file');
            [$name, $mime, $contents] = [$upload->getClientOriginalName(), $upload->getMimeType() ?: 'application/octet-stream', file_get_contents($upload->getRealPath())];
        }

        try {
            $result = $this->analyzer->analyze($user, $name, $mime, $contents);
        } catch (RuntimeException $exception) {
            $status = in_array($exception->getCode(), [422, 502, 503], true) ? $exception->getCode() : 502;

            return response()->json(['message' => $exception->getMessage()], $status);
        }
        abort_if($result['drafts']->isEmpty(), 422, 'AI không tìm thấy công việc nào cần giao trong tài liệu này.');

        $batch = DB::transaction(function () use ($request, $user, $node, &$stored, $name, $result) {
            if (! $node) {
                $stored = $this->store->store($request->file('file'), 'task-drafts', $user);
            }
            $batch = TaskDraftBatch::create([
                'created_by' => $user->id, 'source_node_id' => $node?->id, 'source_file_id' => $stored?->id,
                'document_name' => $name, 'analysis' => $result['analysis'],
            ]);
            foreach ($result['drafts'] as $position => $payload) {
                $batch->drafts()->create(['position' => $position, 'payload' => $payload]);
            }

            return $batch;
        });

        return response()->json([
            'message' => 'AI đã gợi ý '.$result['drafts']->count().' công việc. Hãy rà soát trước khi tạo.',
            'data' => $this->serialize($batch->load(['drafts', 'sourceNode.file', 'sourceFile'])),
        ], 201);
    }

    public function storeDraft(Request $request, TaskDraftBatch $batch): JsonResponse
    {
        $this->own($request->user(), $batch);
        $payload = $this->validatePayload($request);
        $draft = $batch->drafts()->create([
            'position' => (int) $batch->drafts()->max('position') + 1,
            'payload' => [...$this->blank(), ...$payload],
        ]);

        return response()->json(['message' => 'Đã thêm bản nháp.', 'data' => $this->draft($draft)], 201);
    }

    public function update(Request $request, TaskDraft $draft): JsonResponse
    {
        $this->own($request->user(), $draft->batch);
        $draft->update(['payload' => [...$this->blank(), ...$draft->payload, ...$this->validatePayload($request)]]);
        $draft->batch->touch();

        return response()->json(['message' => 'Đã lưu bản nháp.', 'data' => $this->draft($draft)]);
    }

    public function destroy(Request $request, TaskDraft $draft): JsonResponse
    {
        $batch = $draft->batch;
        $this->own($request->user(), $batch);
        $draft->delete();
        $remaining = $batch->drafts()->count();
        if (! $remaining) {
            $this->deleteBatch($batch);
        }

        return response()->json(['message' => 'Đã xóa bản nháp.', 'batch_deleted' => ! $remaining]);
    }

    public function destroyBatch(Request $request, TaskDraftBatch $batch): JsonResponse
    {
        $this->own($request->user(), $batch);
        $this->deleteBatch($batch);

        return response()->json(['message' => 'Đã xóa toàn bộ bản nháp của tài liệu.']);
    }

    public function source(Request $request, TaskDraftBatch $batch)
    {
        $this->own($request->user(), $batch);
        $file = $batch->sourceFile ?? $batch->sourceNode?->file;
        abort_unless($file && Storage::disk($file->disk)->exists($file->path), 404, 'Tài liệu nguồn không còn tồn tại.');

        return Storage::disk($file->disk)->response($file->path, $batch->document_name, ['Content-Type' => $file->mime_type ?: 'application/octet-stream'], 'inline');
    }

    private function deleteBatch(TaskDraftBatch $batch): void
    {
        $fileId = $batch->source_file_id;
        $batch->delete();
        $this->store->releaseIfUnused($fileId);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'employee_ids' => ['sometimes', 'array'],
            'employee_ids.*' => ['integer'],
            'department_ids' => ['sometimes', 'array'],
            'department_ids.*' => ['integer'],
            'reviewer_ids' => ['sometimes', 'array'],
            'reviewer_ids.*' => ['integer'],
            'starts_at' => ['sometimes', 'nullable', 'string', 'max:20'],
            'due_at' => ['sometimes', 'nullable', 'string', 'max:20'],
            'priority' => ['sometimes', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'category_id' => ['sometimes', 'nullable', 'integer'],
            'share_submissions' => ['sometimes', 'boolean'],
        ]);
    }

    private function blank(): array
    {
        return [
            'title' => '', 'description' => '', 'employee_ids' => [], 'department_ids' => [], 'reviewer_ids' => [],
            'starts_at' => now()->format('Y-m-d').'T07:30', 'due_at' => null, 'priority' => 'normal', 'category_id' => null,
            'share_submissions' => true, 'ai_reason' => null,
        ];
    }

    private function own(User $user, ?TaskDraftBatch $batch): void
    {
        abort_unless($batch && $batch->created_by === $user->id, 404, 'Không tìm thấy bản nháp.');
    }

    private function draft(TaskDraft $draft): array
    {
        return ['id' => $draft->id, 'position' => $draft->position, 'payload' => [...$this->blank(), ...$draft->payload], 'updated_at' => $draft->updated_at?->toIso8601String()];
    }

    private function serialize(TaskDraftBatch $batch): array
    {
        $file = $batch->sourceFile ?? $batch->sourceNode?->file;

        return [
            'id' => $batch->id,
            'document_name' => $batch->document_name,
            'analysis' => $batch->analysis ?? [],
            'source' => [
                'kind' => $batch->source_node_id ? 'library' : 'upload',
                'node_id' => $batch->source_node_id,
                'available' => (bool) $file,
                'mime_type' => $file?->mime_type,
                'size' => $file?->size,
                'url' => "/api/task-draft-batches/{$batch->id}/source",
            ],
            'drafts' => $batch->drafts->map(fn (TaskDraft $draft) => $this->draft($draft))->values(),
            'created_at' => $batch->created_at?->toIso8601String(),
            'updated_at' => $batch->updated_at?->toIso8601String(),
        ];
    }
}
