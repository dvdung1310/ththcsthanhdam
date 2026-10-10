<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LibraryNode;
use App\Models\StoredFile;
use App\Models\Task;
use App\Models\TaskDraft;
use App\Models\TaskDraftBatch;
use App\Models\TaskDraftSource;
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
    private const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

    public function __construct(private TaskDraftAnalyzer $analyzer, private FileStore $store) {}

    public function index(Request $request): JsonResponse
    {
        $batches = TaskDraftBatch::with(['drafts', 'sources.node.file', 'sources.file'])->where('created_by', $request->user()->id)->latest()->get();

        return response()->json(['data' => $batches->map(fn (TaskDraftBatch $batch) => $this->serialize($batch))->values()]);
    }

    public function analyze(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'node_ids' => ['nullable', 'array', 'max:'.TaskDraftAnalyzer::MAX_DOCUMENTS],
            'node_ids.*' => ['integer', 'distinct', Rule::exists('library_nodes', 'id')->where('type', LibraryNode::FILE)],
            'files' => ['nullable', 'array', 'max:'.TaskDraftAnalyzer::MAX_DOCUMENTS],
            'files.*' => ['file', 'max:20480', 'mimes:pdf,docx,doc,txt,jpg,jpeg,png,webp'],
        ], ['files.*.mimes' => 'Chỉ hỗ trợ PDF, Word, ảnh hoặc văn bản thuần.', 'files.*.max' => 'Mỗi file tối đa 20MB.']);
        $nodes = LibraryNode::with('file')->whereIn('id', $data['node_ids'] ?? [])->get()->sortBy(fn ($node) => array_search($node->id, $data['node_ids'], true))->values();
        $uploads = $request->file('files', []);
        $count = $nodes->count() + count($uploads);
        abort_if($count === 0, 422, 'Chọn ít nhất một tài liệu.');
        abort_if($count > TaskDraftAnalyzer::MAX_DOCUMENTS, 422, 'Mỗi lần phân tích tối đa '.TaskDraftAnalyzer::MAX_DOCUMENTS.' tài liệu.');
        $access = new LibraryAccess($user);
        foreach ($nodes as $node) {
            abort_unless($access->can($node, LibraryAccess::READ), 403, "Bạn không có quyền xem file “{$node->name}”.");
            abort_unless($node->file && Storage::disk($node->file->disk)->exists($node->file->path), 422, "File “{$node->name}” không tồn tại.");
        }
        $total = $nodes->sum(fn ($node) => (int) $node->file->size) + collect($uploads)->sum(fn ($upload) => $upload->getSize());
        abort_if($total > self::MAX_TOTAL_BYTES, 422, 'Tổng dung lượng các tài liệu tối đa 30MB.');
        @set_time_limit(320);

        $documents = [
            ...$nodes->map(fn (LibraryNode $node) => ['name' => $node->name, 'mime' => $node->file->mime_type ?: 'application/octet-stream', 'contents' => Storage::disk($node->file->disk)->get($node->file->path), 'node' => $node])->all(),
            ...array_map(fn ($upload) => ['name' => $upload->getClientOriginalName(), 'mime' => $upload->getMimeType() ?: 'application/octet-stream', 'contents' => file_get_contents($upload->getRealPath()), 'upload' => $upload], $uploads),
        ];

        try {
            $result = $this->analyzer->analyze($user, $documents);
        } catch (RuntimeException $exception) {
            $status = in_array($exception->getCode(), [422, 502, 503], true) ? $exception->getCode() : 502;

            return response()->json(['message' => $exception->getMessage()], $status);
        }
        abort_if($result['drafts']->isEmpty(), 422, 'AI không tìm thấy công việc nào cần giao trong các tài liệu này.');

        $batch = DB::transaction(function () use ($user, $documents, $result) {
            $batch = TaskDraftBatch::create([
                'created_by' => $user->id,
                'document_name' => $result['analysis']['title'] ?: $documents[0]['name'],
                'analysis' => $result['analysis'],
            ]);
            $sourceIds = [];
            foreach ($documents as $index => $document) {
                $stored = isset($document['upload']) ? $this->store->store($document['upload'], 'task-drafts', $user) : null;
                $sourceIds[$index + 1] = $batch->sources()->create([
                    'position' => $index, 'node_id' => isset($document['node']) ? $document['node']->id : null, 'file_id' => $stored?->id,
                    'name' => $document['name'], 'kind' => $result['documents'][$index] ?? null,
                ])->id;
            }
            foreach ($result['drafts'] as $position => $payload) {
                $numbers = $payload['source_numbers'] ?? [];
                unset($payload['source_numbers']);
                $payload['source_ids'] = array_values(array_filter(array_map(fn ($number) => $sourceIds[$number] ?? null, $numbers)));
                $batch->drafts()->create(['position' => $position, 'payload' => $payload]);
            }

            return $batch;
        });

        return response()->json([
            'message' => 'AI đã gợi ý '.$result['drafts']->count().' công việc từ '.count($documents).' tài liệu. Hãy rà soát trước khi tạo.',
            'data' => $this->serialize($batch->load(['drafts', 'sources.node.file', 'sources.file'])),
        ], 201);
    }

    public function storeDraft(Request $request, TaskDraftBatch $batch): JsonResponse
    {
        $this->own($request->user(), $batch);
        $payload = $this->validatePayload($request);
        $draft = $batch->drafts()->create([
            'position' => (int) $batch->drafts()->max('position') + 1,
            'payload' => [...$this->blank(), 'source_ids' => $batch->sources()->pluck('id')->all(), ...$payload],
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

    public function source(Request $request, TaskDraftSource $source)
    {
        $this->own($request->user(), $source->batch);
        $file = $source->storedFile();
        abort_unless($file && Storage::disk($file->disk)->exists($file->path), 404, 'Tài liệu nguồn không còn tồn tại.');

        return Storage::disk($file->disk)->response($file->path, $source->name, ['Content-Type' => $file->mime_type ?: 'application/octet-stream'], 'inline');
    }

    private function deleteBatch(TaskDraftBatch $batch): void
    {
        $fileIds = $batch->sources()->pluck('file_id')->filter();
        $batch->delete();
        $fileIds->each(fn ($id) => $this->store->releaseIfUnused((int) $id));
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'title' => ['sometimes', 'nullable', 'string', 'max:'.Task::TITLE_MAX],
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
            'source_ids' => ['sometimes', 'array'],
            'source_ids.*' => ['integer'],
        ], ['title.max' => 'Tên công việc tối đa '.Task::TITLE_MAX.' ký tự.']);
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

    private function draft(TaskDraft $draft, ?array $allSources = null): array
    {
        $payload = [...$this->blank(), ...$draft->payload];
        if (! array_key_exists('source_ids', $draft->payload)) {
            $payload['source_ids'] = $allSources ?? $draft->batch?->sources()->pluck('id')->all() ?? [];
        }

        return ['id' => $draft->id, 'position' => $draft->position, 'payload' => $payload, 'updated_at' => $draft->updated_at?->toIso8601String()];
    }

    private function serialize(TaskDraftBatch $batch): array
    {
        return [
            'id' => $batch->id,
            'document_name' => $batch->document_name,
            'analysis' => $batch->analysis ?? [],
            'sources' => $batch->sources->map(function (TaskDraftSource $source) {
                $file = $source->storedFile();

                return [
                    'id' => $source->id, 'name' => $source->name, 'kind' => $source->kind,
                    'origin' => $source->node_id ? 'library' : 'upload',
                    'available' => (bool) $file, 'mime_type' => $file?->mime_type, 'size' => $file?->size,
                    'url' => "/api/task-draft-sources/{$source->id}/file",
                ];
            })->values(),
            'drafts' => $batch->drafts->map(fn (TaskDraft $draft) => $this->draft($draft, $batch->sources->pluck('id')->all()))->values(),
            'created_at' => $batch->created_at?->toIso8601String(),
            'updated_at' => $batch->updated_at?->toIso8601String(),
        ];
    }
}
