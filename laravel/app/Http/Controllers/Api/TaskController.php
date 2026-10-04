<?php

namespace App\Http\Controllers\Api;

use App\Events\TaskAssignedRealtime;
use App\Events\TaskWorkflowRealtime;
use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\OfficialDocument;
use App\Models\StoredFile;
use App\Models\Task;
use App\Models\TaskCatalogItem;
use App\Models\TaskCategory;
use App\Models\TaskSubmission;
use App\Models\TaskUpdate;
use App\Models\Teacher;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Notifications\TaskWorkflowNotification;
use App\Notifications\TaskReminderNotification;
use App\Services\LatePenaltyCalculator;
use App\Services\TaskActionFilters;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::with(['category', 'catalogItem', 'creator', 'reviewer', 'teachers.user', 'departments', 'documents.type', 'documents.file'])
            ->withCount(['teachers', 'departments', 'submissions'])
            ->when($request->string('search')->toString(), fn ($q, $search) => $q->where(fn ($b) => $b->where('code', 'like', "%{$search}%")->orWhere('title', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%")))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->string('priority')->toString(), fn ($q, $priority) => $q->where('priority', $priority))
            ->when($request->integer('category_id'), fn ($q, $category) => $q->where('category_id', $category))
            ->when($request->string('product_type')->toString(), fn ($q, $productType) => $q->whereHas('catalogItem', fn ($item) => $item->where('product_type', $productType)))
            ->when($request->integer('department_id'), fn ($q, $department) => $q->whereHas('departments', fn ($d) => $d->where('departments.id', $department)))
            ->latest('created_at');
        $this->limitToAccessible($query, $request);
        app(TaskActionFilters::class)->apply($query, $request, fn ($q) => $this->reviewQueue($q, $request));
        $perPage = min(max($request->integer('per_page', 10), 5), 100);
        $paginator = $query->paginate($perPage);
        $taskIds = $paginator->getCollection()->pluck('id');
        $evaluations = DB::table('task_evaluations')->whereIn('task_id', $taskIds)->where('status', 'approved')->latest('id')->get()->unique('task_id')->keyBy('task_id');
        $paginator->getCollection()->transform(function ($task) use ($request, $evaluations) {
            $evaluation = $evaluations->get($task->id);
            $maximumScore = (float) ($task->catalogItem?->score ?? $task->maximum_score);
            $maximumConversion = (float) ($task->catalogItem?->conversion_factor ?? 0);
            $earnedConversion = $evaluation && $maximumScore > 0 ? round(((float) $evaluation->score / $maximumScore) * $maximumConversion, 2) : null;

            return [...$this->serialize($task), 'review_status' => $task->review_status, 'evaluation_score' => $evaluation ? (float) $evaluation->score : null, 'evaluation_score_before_penalty' => $evaluation ? (float) $evaluation->score_before_penalty : null, 'late_penalty' => $evaluation ? (float) $evaluation->late_penalty : 0, 'late_penalty_percent' => $evaluation ? (float) $evaluation->late_penalty_percent : 0, 'late_days' => $evaluation ? (int) $evaluation->late_days : 0, 'evaluation_max_score' => $maximumScore, 'evaluation_conversion' => $earnedConversion, 'evaluation_max_conversion' => $maximumConversion, 'is_reviewer' => $task->reviewer_id === $request->user()->id, 'can_manage' => $this->canManageTask($request, $task), 'can_review_completion' => $this->canReviewTask($request, $task), 'can_edit_personal' => $this->isPersonalTaskFor($request, $task)];
        });
        $base = $this->limitToAccessible(Task::query(), $request);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()],
            'stats' => [
                'total' => (clone $base)->count(),
                'pending' => (clone $base)->whereNotIn('status', ['completed', 'cancelled'])->count(),
                'not_started' => (clone $base)->where('status', 'not_started')->count(),
                'soon' => (clone $base)->whereNotIn('status', ['completed', 'cancelled'])->where('due_at', '>=', now())->where('due_at', '<=', now()->addDay())->count(),
                'my_review' => $this->reviewQueue(clone $base, $request)->count(),
                'in_progress' => (clone $base)->where('status', 'in_progress')->count(),
                'completed' => (clone $base)->where('status', 'completed')->count(),
                'overdue' => (clone $base)->whereNotIn('status', ['completed', 'cancelled'])->where('due_at', '<', now())->count(),
                'waiting_approval' => (clone $base)->where('review_status', 'waiting_approval')->count(),
            ],
        ]);
    }

    public function referenceData(Request $request): JsonResponse
    {
        $user = $request->user();
        $unitIds = $user->managedUnitIds();
        $unitOption = fn ($unit) => ['id' => $unit['id'], 'name' => $unit['label'], 'parent_id' => $unit['parent_id'], 'type' => $unit['type']];

        return response()->json([
            'categories' => TaskCategory::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'filter_teachers' => Teacher::with('user')->where('employment_status', 'working')->when($unitIds !== null, fn ($q) => $q->where(fn ($b) => $b->where('id', $user->teacher?->id ?? 0)->orWhere(fn ($m) => $m->inUnits($unitIds))))->get()->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name]),
            'catalog_items' => TaskCatalogItem::with('group:id,code,name,maximum_score')->where('publication_status', 'published')->orderBy('name')->get()->map(fn ($item) => ['id' => $item->id, 'name' => $item->name, 'product' => $item->product_type, 'score' => (float) $item->score, 'conversion' => (float) $item->conversion_factor, 'scope' => $item->scope, 'group' => $item->group?->code]),
            'product_types' => TaskCatalogItem::where('publication_status', 'published')->whereNotNull('product_type')->where('product_type', '!=', '')->distinct()->orderBy('product_type')->pluck('product_type')->values(),
            'filter_catalog_items' => TaskCatalogItem::orderBy('name')->get(['id', 'name']),
            'filter_departments' => Department::ordered($unitIds === null ? null : array_values(array_unique([...$unitIds, ...$user->memberUnitIds()])))->map($unitOption)->values(),
            'teachers' => Teacher::with(['user', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('employment_status', 'working')->when($unitIds !== null, fn ($q) => $q->inUnits($unitIds))->orderBy('employee_code')->get()->map(fn ($t) => ['id' => $t->id, 'name' => $t->user->name, 'code' => $t->employee_code, 'avatar_url' => $t->user->avatar_path ? route('avatars.show', ['filename' => basename($t->user->avatar_path)]) : null, 'department_ids' => $t->unitIds()]),
            'departments' => Department::ordered($unitIds)->map($unitOption)->values(),
            'reviewers' => User::with(['teacher.departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('status', 'active')->orderBy('name')->get()->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'avatar_url' => $u->avatar_path ? route('avatars.show', ['filename' => basename($u->avatar_path)]) : null, 'department_ids' => $u->teacher?->unitIds() ?? []]),
            'current_teacher' => $request->user()->teacher
                ? ['id' => $request->user()->teacher->id, 'name' => $request->user()->name, 'avatar_url' => $request->user()->avatar_path ? route('avatars.show', ['filename' => basename($request->user()->avatar_path)]) : null]
                : null,
            'documents' => OfficialDocument::with(['type', 'file'])->latest('issued_on')->limit(200)->get()->map(fn ($document) => [
                'id' => $document->id, 'document_number' => $document->document_number,
                'title' => $document->title, 'issuer' => $document->issuer,
                'issued_on' => $document->issued_on?->format('Y-m-d'), 'type' => $document->type?->name,
                'has_file' => (bool) $document->file_id,
            ]),
        ]);
    }

    public function sendReminder(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canManageTask($request, $task), 403, 'Bạn không có quyền nhắc công việc này.');
        abort_unless($task->status === 'not_started', 422, 'Chỉ có thể gửi nhắc việc cho công việc chưa thực hiện.');

        $task->loadMissing(['teachers.user', 'departments']);
        $teachers = $task->teachers;
        if ($task->departments->isNotEmpty()) {
            $teachers = $teachers->merge(Teacher::with('user')
                ->where('employment_status', 'working')
                ->inUnits($task->departments->pluck('id'))
                ->get());
        }
        $teachers = $teachers->unique('id')->filter(fn (Teacher $teacher) => filled($teacher->user?->email))->values();
        abort_if($teachers->isEmpty(), 422, 'Nhóm thực hiện chưa có giáo viên với địa chỉ email hợp lệ.');

        foreach ($teachers as $index => $teacher) {
            $teacher->user->notify((new TaskReminderNotification($task))->delay(now()->addSeconds($index * 5)));
            DB::table('task_reminders')->insert(['task_id' => $task->id, 'teacher_id' => $teacher->id, 'sent_by' => $request->user()->id, 'email' => $teacher->user->email, 'sent_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        }
        $round = (int) DB::table('task_reminders')
            ->where('task_id', $task->id)
            ->selectRaw('COUNT(*) as reminder_count')
            ->groupBy('teacher_id')
            ->pluck('reminder_count')
            ->max();

        return response()->json(['message' => 'Đã đưa '.$teachers->count().' email nhắc việc vào hàng chờ.', 'queued_count' => $teachers->count(), 'reminder_count' => $round]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateTask($request);
        $this->ensureAssignmentScope($request, $data);
        $task = DB::transaction(function () use ($request, $data) {
            $task = Task::create([...$data, 'code' => $this->nextCode(), 'created_by' => $request->user()->id, 'status' => 'not_started']);
            $this->syncAssignees($task, $data);
            $task->documents()->sync($data['document_ids'] ?? []);
            $this->storeAttachments($request, $task);
            $this->recordStatus($task, null, 'not_started', 'Khởi tạo và giao công việc');

            return $task;
        });
        $this->notifyAssignees($task);
        $this->notifyReviewer($task);

        return response()->json(['message' => 'Đã giao công việc thành công.', 'data' => $this->serialize($this->loadTask($task))], 201);
    }

    public function storePersonal(Request $request): JsonResponse
    {
        $teacher = $request->user()->teacher;
        abort_unless($teacher, 422, 'Tài khoản của bạn chưa được liên kết với hồ sơ giáo viên.');

        // Never trust an assignee supplied by the browser for a personal task.
        $request->merge(['teacher_ids' => [$teacher->id], 'department_ids' => []]);
        $data = $this->validateTask($request);
        $task = DB::transaction(function () use ($request, $data) {
            $task = Task::create([...$data, 'code' => $this->nextCode(), 'created_by' => $request->user()->id, 'status' => 'not_started']);
            $this->syncAssignees($task, $data);
            $task->documents()->sync($data['document_ids'] ?? []);
            $this->storeAttachments($request, $task);
            $this->recordStatus($task, null, 'not_started', 'Tự tạo công việc cá nhân');

            return $task;
        });

        $this->notifyReviewer($task);

        return response()->json(['message' => 'Đã tạo công việc cá nhân thành công.', 'data' => $this->serialize($this->loadTask($task))], 201);
    }

    private function notifyAssignees(Task $task): void
    {
        $task->load(['teachers.user', 'departments']);
        $users = $task->teachers->pluck('user')->filter();
        $departmentIds = $task->departments->pluck('id');

        if ($departmentIds->isNotEmpty()) {
            $departmentUsers = Teacher::with('user')
                ->where('employment_status', 'working')
                ->inUnits($departmentIds)
                ->get()->pluck('user')->filter();
            $users = $users->merge($departmentUsers);
        }

        $users->unique('id')->each(function (User $user) use ($task) {
            try {
                $user->notify(new TaskAssignedNotification($task));
            } catch (\Throwable $exception) {
                Log::error('Không thể gửi thông báo giao việc.', ['user_id' => $user->id, 'task_id' => $task->id, 'error' => $exception->getMessage()]);
            }

            try {
                TaskAssignedRealtime::dispatch($task, $user->id);
            } catch (\Throwable $exception) {
                Log::warning('Reverb chưa sẵn sàng; thông báo vẫn được lưu.', ['user_id' => $user->id, 'task_id' => $task->id, 'error' => $exception->getMessage()]);
            }
        });
    }

    private function assigneeUsers(Task $task)
    {
        $task->loadMissing(['teachers.user', 'departments']);
        $users = $task->teachers->pluck('user')->filter();
        $departmentIds = $task->departments->pluck('id');
        if ($departmentIds->isNotEmpty()) {
            $users = $users->merge(Teacher::with('user')->where('employment_status', 'working')->inUnits($departmentIds)->get()->pluck('user')->filter());
        }

        return $users;
    }

    private function notifyReviewer(Task $task): void
    {
        $reviewer = $task->reviewer;
        if (! $reviewer || $this->assigneeUsers($task)->contains('id', $reviewer->id)) {
            return;
        }
        $message = 'Bạn được chỉ định kiểm duyệt công việc mới: '.$task->title;
        $reviewer->notify(new TaskWorkflowNotification($task, $message, 'reviewer_assigned'));
        try {
            TaskWorkflowRealtime::dispatch($task, $reviewer->id, $message, 'reviewer_assigned');
        } catch (\Throwable $exception) {
            Log::warning('Không thể phát thông báo người kiểm duyệt realtime.', ['error' => $exception->getMessage()]);
        }
    }

    public function show(Task $task): JsonResponse
    {
        $this->ensureTaskAccess(request(), $task);
        $task = $this->loadTask($task);
        $updates = DB::table('task_updates')->leftJoin('users', 'users.id', '=', 'task_updates.created_by')->where('task_id', $task->id)->whereNotNull('task_updates.content')->latest('task_updates.created_at')->select('task_updates.*', 'users.name as creator_name', 'users.avatar_path as creator_avatar_path')->get()->map(function ($update) use ($task) {
            $update->author_role = $update->created_by === $task->reviewer_id ? 'reviewer' : ($update->created_by === $task->created_by ? 'assigner' : 'assignee');
            $update->can_edit = $update->created_by === request()->user()->id && in_array($update->author_role, ['reviewer', 'assigner']);
            $update->creator_avatar_url = $update->creator_avatar_path ? route('avatars.show', ['filename' => basename($update->creator_avatar_path)]) : null;
            unset($update->creator_avatar_path);

            return $update;
        });
        $attachments = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')->where('attachable_type', Task::class)->where('attachable_id', $task->id)->select('files.id', 'files.original_name', 'files.mime_type', 'files.size')->get();
        $submissions = TaskSubmission::with('teacher.user')->where('task_id', $task->id)->latest('submitted_at')->get()->map(function (TaskSubmission $submission) {
            $files = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')
                ->where('attachable_type', TaskSubmission::class)->where('attachable_id', $submission->id)
                ->select('files.id', 'files.original_name', 'files.mime_type', 'files.size')->get();

            return [
                'id' => $submission->id,
                'version' => $submission->version,
                'submitter' => $submission->teacher?->user?->name,
                'submitter_avatar_url' => $submission->teacher?->user?->avatar_path ? route('avatars.show', ['filename' => basename($submission->teacher->user->avatar_path)]) : null,
                'result_content' => $submission->result_content,
                'links' => $submission->links ?? [],
                'files' => $files,
                'status' => $submission->status,
                'submitted_at' => $submission->submitted_at?->toIso8601String(),
                'review_comment' => $submission->review_comment,
                'reviewed_at' => $submission->reviewed_at?->toIso8601String(),
            ];
        });
        $isAssignee = $this->isTaskAssignee(request(), $task);
        if ($task->review_status === 'waiting_approval') {
            $isAssignee = false;
        }
        $canReview = $this->canReviewTask(request(), $task);
        $evaluation = DB::table('task_evaluations')->where('task_id', $task->id)->where('status', 'approved')->latest('id')->first();
        $catalogScore = (float) ($task->catalogItem?->score ?? $task->maximum_score);
        $conversionFactor = (float) ($task->catalogItem?->conversion_factor ?? 0);
        $earnedConversion = $evaluation && $catalogScore > 0 ? round(((float) $evaluation->score / $catalogScore) * $conversionFactor, 2) : null;
        $latestSubmittedAt = $task->submissions()->latest('submitted_at')->value('submitted_at');
        $penaltyReferenceTime = $latestSubmittedAt ? Carbon::parse($latestSubmittedAt) : ($task->completed_at ?? now());
        $latePenaltyPreview = app(LatePenaltyCalculator::class)->calculate($catalogScore, $task->due_at, $penaltyReferenceTime);
        if ($evaluation && (float) $evaluation->late_penalty > 0) {
            $latePenaltyPreview['late_days'] = (int) $evaluation->late_days;
            $latePenaltyPreview['penalty_percent'] = (float) $evaluation->late_penalty_percent;
            $latePenaltyPreview['penalty_score'] = (float) $evaluation->late_penalty;
            $latePenaltyPreview['score_before_penalty'] = (float) $evaluation->score_before_penalty;
            $latePenaltyPreview['final_score'] = (float) $evaluation->score;
        }

        return response()->json(['data' => [...$this->serialize($task), 'is_reviewer' => $task->reviewer_id === request()->user()->id, 'can_manage' => $this->canManageTask(request(), $task), 'can_submit_completion' => $isAssignee && ! in_array($task->status, ['waiting_approval', 'completed', 'cancelled']), 'can_review_completion' => $canReview, 'submissions' => $submissions, 'latest_submission' => $submissions->first(), 'evaluation' => $evaluation, 'late_penalty_preview' => $latePenaltyPreview, 'task_catalog_item_id' => $task->task_catalog_item_id, 'task_type' => $task->catalogItem?->name, 'product' => $task->catalogItem?->product_type, 'catalog_score' => $catalogScore, 'conversion' => $conversionFactor, 'earned_conversion' => $earnedConversion, 'description' => $task->description, 'updates' => $updates, 'attachments' => $attachments]]);
    }

    public function viewAttachment(Request $request, Task $task, StoredFile $file)
    {
        $this->ensureTaskAccess($request, $task);
        $attached = DB::table('file_attachments')->where('attachable_type', Task::class)->where('attachable_id', $task->id)->where('file_id', $file->id)->exists();
        abort_unless($attached && Storage::disk($file->disk)->exists($file->path), 404, 'Không tìm thấy file đính kèm.');

        return Storage::disk($file->disk)->response($file->path, $file->original_name, ['Content-Type' => $file->mime_type, 'Content-Disposition' => 'inline; filename="'.addslashes($file->original_name).'"']);
    }

    public function viewSubmissionAttachment(Request $request, Task $task, TaskSubmission $submission, StoredFile $file)
    {
        $this->ensureTaskAccess($request, $task);
        abort_unless($submission->task_id === $task->id, 404);
        $attached = DB::table('file_attachments')->where('attachable_type', TaskSubmission::class)->where('attachable_id', $submission->id)->where('file_id', $file->id)->exists();
        abort_unless($attached && Storage::disk($file->disk)->exists($file->path), 404, 'Không tìm thấy file bài nộp.');

        return Storage::disk($file->disk)->response($file->path, $file->original_name, ['Content-Type' => $file->mime_type, 'Content-Disposition' => 'inline; filename="'.addslashes($file->original_name).'"']);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $this->ensureCanManageAssignment($request, $task);
        $data = $this->validateTask($request);
        $this->ensureAssignmentScope($request, $data);
        DB::transaction(function () use ($request, $data, $task) {
            $task->update($data);
            $this->syncAssignees($task, $data);
            $task->documents()->sync($data['document_ids'] ?? []);
            $this->storeAttachments($request, $task);
            $this->removeAttachments($task, $data['remove_attachment_ids'] ?? []);
        });

        return response()->json(['message' => 'Đã cập nhật công việc thành công.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function updatePersonal(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->isPersonalTaskFor($request, $task), 403, 'Bạn chỉ được sửa công việc cá nhân do chính mình tạo.');
        $teacher = $request->user()->teacher;
        $request->merge(['teacher_ids' => [$teacher->id], 'department_ids' => []]);
        $data = $this->validateTask($request);

        DB::transaction(function () use ($request, $data, $task) {
            $task->update($data);
            $this->syncAssignees($task, $data);
            $task->documents()->sync($data['document_ids'] ?? []);
            $this->storeAttachments($request, $task);
            $this->removeAttachments($task, $data['remove_attachment_ids'] ?? []);
        });

        return response()->json(['message' => 'Đã cập nhật công việc cá nhân thành công.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        $this->ensureCanManageAssignment($request, $task);
        $task->delete();

        return response()->json(['message' => 'Đã xóa công việc thành công.']);
    }

    public function progress(Request $request, Task $task): JsonResponse
    {
        $this->ensureTaskAccess($request, $task);
        $data = $request->validate(['status' => ['required', Rule::in(['not_started', 'in_progress', 'waiting_approval', 'completed', 'cancelled'])], 'progress_percent' => ['required', 'numeric', 'min:0', 'max:100'], 'content' => ['nullable', 'string', 'max:2000']]);
        $oldStatus = $task->status;
        DB::transaction(function () use ($task, $data, $oldStatus, $request) {
            $task->update(['status' => $data['status'], 'completed_at' => $data['status'] === 'completed' ? now() : null]);
            $task->updates()->create(['created_by' => $request->user()->id, 'progress_percent' => $data['progress_percent'], 'status' => $data['status'], 'content' => $data['content'] ?? null]);
            DB::table('task_teacher_assignees')->where('task_id', $task->id)->update(['status' => $data['status'], 'progress_percent' => $data['progress_percent'], 'completed_at' => $data['status'] === 'completed' ? now() : null, 'updated_at' => now()]);
            $this->recordStatus($task, $oldStatus, $data['status'], $data['content'] ?? 'Cập nhật tiến độ');
        });
        if (! empty($data['content'])) {
            $recipient = $task->reviewer ?: $task->creator;
            $notice = $request->user()->name.' đã cập nhật công việc '.$task->title.': '.$data['content'];
            $recipient?->notify(new TaskWorkflowNotification($task, $notice, 'progress_comment'));
            if ($recipient) {
                try {
                    TaskWorkflowRealtime::dispatch($task, $recipient->id, $notice, 'progress_comment');
                } catch (\Throwable $exception) {
                    Log::warning('Không thể phát cập nhật realtime.', ['error' => $exception->getMessage()]);
                }
            }
        }

        return response()->json(['message' => 'Đã cập nhật tiến độ công việc.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function submitCompletion(Request $request, Task $task): JsonResponse
    {
        $this->ensureTaskAccess($request, $task);
        $teacher = $request->user()->teacher;
        abort_unless($teacher && $task->reviewer_id !== $request->user()->id, 403, 'Chỉ người nhận việc mới có thể gửi đề nghị hoàn thành.');
        abort_if($task->review_status === 'waiting_approval', 422, 'Công việc đang chờ người kiểm duyệt xác nhận.');
        $data = $request->validate([
            'comment' => ['nullable', 'string', 'max:3000'],
            'links' => ['nullable', 'array', 'max:20'],
            'links.*' => ['required', 'url:http,https', 'max:2048'],
            'submission_files' => ['nullable', 'array', 'max:20'],
            'submission_files.*' => ['file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,jpg,jpeg,png,zip,rar'],
        ]);
        $links = collect($data['links'] ?? [])->filter()->unique()->values()->all();
        $version = ((int) $task->submissions()->where('teacher_id', $teacher->id)->max('version')) + 1;
        DB::transaction(function () use ($task, $teacher, $request, $data, $links, $version) {
            $submission = $task->submissions()->create(['teacher_id' => $teacher->id, 'version' => $version, 'result_content' => $data['comment'] ?? null, 'links' => $links, 'status' => 'submitted', 'submitted_at' => now()]);
            foreach ($request->file('submission_files', []) as $uploaded) {
                $path = $uploaded->store('task-submissions');
                $file = StoredFile::create(['uploaded_by' => $request->user()->id, 'disk' => 'local', 'path' => $path, 'original_name' => $uploaded->getClientOriginalName(), 'mime_type' => $uploaded->getMimeType(), 'size' => $uploaded->getSize(), 'checksum' => hash_file('sha256', $uploaded->getRealPath())]);
                DB::table('file_attachments')->insert(['file_id' => $file->id, 'attachable_type' => TaskSubmission::class, 'attachable_id' => $submission->id, 'purpose' => 'submission', 'created_at' => now(), 'updated_at' => now()]);
            }
            $task->update(['review_status' => 'waiting_approval']);
            $task->updates()->create(['teacher_id' => $teacher->id, 'created_by' => $request->user()->id, 'progress_percent' => 100, 'status' => $task->status, 'content' => $data['comment'] ?? 'Đã gửi bài nộp.']);
            DB::table('task_teacher_assignees')->where('task_id', $task->id)->where('teacher_id', $teacher->id)->update(['progress_percent' => 100, 'updated_at' => now()]);
        });
        $notice = $request->user()->name.' đã gửi đề nghị xác nhận hoàn thành: '.$task->title;
        collect([$task->creator, $task->reviewer])->filter()->unique('id')->each(function (User $recipient) use ($task, $notice) {
            $recipient->notify(new TaskWorkflowNotification($task, $notice, 'completion_submitted'));
            try {
                TaskWorkflowRealtime::dispatch($task, $recipient->id, $notice, 'completion_submitted');
            } catch (\Throwable $exception) {
                Log::warning('Không thể phát thông báo hoàn thành realtime.', ['user_id' => $recipient->id, 'error' => $exception->getMessage()]);
            }
        });

        return response()->json(['message' => 'Đã gửi đề nghị hoàn thành và thông báo cho người giao việc, người duyệt.']);
    }

    public function reviewCompletion(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canReviewTask($request, $task), 403, 'Bạn không có quyền xác nhận hoặc chấm điểm công việc này.');
        $data = $request->validate([
            'decision' => ['required', Rule::in(['approved', 'revision_required'])], 'comment' => ['nullable', 'string', 'max:3000'],
            'score' => ['required_if:decision,approved', 'nullable', 'numeric', 'min:0', 'max:'.($task->catalogItem?->score ?? $task->maximum_score)],
        ]);
        $submission = $task->submissions()->latest('submitted_at')->first();
        $newStatus = $data['decision'] === 'approved' ? 'completed' : 'in_progress';
        $reviewComment = $data['comment'] ?? null;
        DB::transaction(function () use ($task, $submission, $request, $data, $newStatus, $reviewComment) {
            $old = $task->status;
            $submission?->update(['status' => $data['decision'], 'reviewed_by' => $request->user()->id, 'reviewed_at' => now(), 'review_comment' => $reviewComment]);
            $task->update(['status' => $newStatus, 'review_status' => $data['decision'], 'completed_at' => $newStatus === 'completed' ? now() : null]);
            $task->updates()->create(['teacher_id' => $submission?->teacher_id, 'created_by' => $request->user()->id, 'progress_percent' => $newStatus === 'completed' ? 100 : null, 'status' => $newStatus, 'content' => $reviewComment]);
            if ($data['decision'] === 'approved') {
                $teacherId = $submission?->teacher_id ?? $task->teachers()->value('teachers.id');
                if ($teacherId) {
                    $penalty = app(LatePenaltyCalculator::class)->calculate((float) $data['score'], $task->due_at, $submission?->submitted_at);
                    $total = $penalty['final_score'];
                    $previous = DB::table('task_evaluations')->where('task_id', $task->id)->where('teacher_id', $teacherId)->latest('version')->first();
                    $evaluationId = DB::table('task_evaluations')->insertGetId(['task_id' => $task->id, 'teacher_id' => $teacherId, 'evaluator_id' => $request->user()->id, 'evaluator_level' => 'leader', 'progress_score' => 0, 'evidence_score' => 0, 'quality_score' => 0, 'late_penalty' => $penalty['penalty_score'], 'late_days' => $penalty['late_days'], 'late_penalty_percent' => $penalty['penalty_percent'], 'score_before_penalty' => $penalty['score_before_penalty'], 'score' => $total, 'comment' => $reviewComment, 'status' => 'approved', 'version' => ((int) ($previous->version ?? 0)) + 1, 'submitted_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
                    $penaltyNote = $penalty['penalty_score'] > 0 ? "Trễ {$penalty['late_days']} ngày, trừ {$penalty['penalty_percent']}% = {$penalty['penalty_score']} điểm." : null;
                    DB::table('evaluation_score_histories')->insert(['task_evaluation_id' => $evaluationId, 'old_score' => $previous?->score, 'new_score' => $total, 'reason' => collect([$reviewComment, $penaltyNote])->filter()->join(' '), 'changed_by' => $request->user()->id, 'created_at' => now()]);
                }
                DB::table('task_teacher_assignees')->where('task_id', $task->id)->update(['status' => 'completed', 'progress_percent' => 100, 'completed_at' => now(), 'updated_at' => now()]);
                $this->recordStatus($task, $old, 'completed', $reviewComment ?? 'Xác nhận hoàn thành');
            } else {
                DB::table('task_teacher_assignees')->where('task_id', $task->id)->update(['status' => 'in_progress', 'completed_at' => null, 'updated_at' => now()]);
                $this->recordStatus($task, $old, 'in_progress', $reviewComment ?? 'Yêu cầu làm lại');
            }
        });
        $message = $data['decision'] === 'approved' ? 'Công việc đã được xác nhận hoàn thành' : 'Công việc được yêu cầu chỉnh sửa';
        $notice = $message.': '.$task->title.($reviewComment ? '. Nhận xét: '.$reviewComment : '');
        $recipients = $submission?->teacher?->user ? collect([$submission->teacher->user]) : $this->assigneeUsers($task);
        $recipients->unique('id')->each(function (User $recipient) use ($task, $notice, $data) {
            $recipient->notify(new TaskWorkflowNotification($task, $notice, $data['decision']));
            try {
                TaskWorkflowRealtime::dispatch($task, $recipient->id, $notice, $data['decision']);
            } catch (\Throwable $exception) {
                Log::warning('Không thể phát thông báo duyệt realtime.', ['error' => $exception->getMessage()]);
            }
        });

        return response()->json(['message' => $message.' và đã gửi thông báo cho người nhận việc.']);
    }

    public function updateComment(Request $request, Task $task, TaskUpdate $update): JsonResponse
    {
        $this->ensureTaskAccess($request, $task);
        abort_unless($update->task_id === $task->id, 404);
        $role = $update->created_by === $task->reviewer_id ? 'reviewer' : ($update->created_by === $task->created_by ? 'assigner' : 'assignee');
        abort_unless($update->created_by === $request->user()->id && in_array($role, ['reviewer', 'assigner']), 403, 'Bạn chỉ được sửa nhận xét do chính mình tạo với vai trò giao việc hoặc kiểm duyệt.');
        $data = $request->validate(['content' => ['nullable', 'string', 'max:3000']]);
        if (blank($data['content'] ?? null)) {
            return response()->json(['message' => 'Không có nhận xét để lưu.']);
        }
        TaskSubmission::where('task_id', $task->id)->where('reviewed_by', $request->user()->id)->where('review_comment', $update->content)->update(['review_comment' => $data['content'], 'updated_at' => now()]);
        $update->update(['content' => $data['content']]);

        return response()->json(['message' => 'Đã cập nhật nhận xét.']);
    }

    public function storeComment(Request $request, Task $task): JsonResponse
    {
        $this->ensureTaskAccess($request, $task);
        $data = $request->validate(['content' => ['nullable', 'string', 'max:3000']]);
        if (blank($data['content'] ?? null)) {
            return response()->json(['message' => 'Đã xử lý mà không kèm nhận xét.']);
        }
        $teacher = $request->user()->teacher;
        $isAssignee = $this->isTaskAssignee($request, $task);
        $task->updates()->create(['teacher_id' => $isAssignee ? $teacher->id : null, 'created_by' => $request->user()->id, 'status' => $task->status, 'content' => $data['content']]);
        $recipients = $isAssignee ? collect([$task->reviewer ?: $task->creator])->filter() : $this->assigneeUsers($task);
        $notice = $request->user()->name.' đã gửi nhận xét về công việc '.$task->title.': '.$data['content'];
        $recipients->unique('id')->each(function (User $recipient) use ($task, $notice) {
            $recipient->notify(new TaskWorkflowNotification($task, $notice, 'task_comment'));
            try {
                TaskWorkflowRealtime::dispatch($task, $recipient->id, $notice, 'task_comment');
            } catch (\Throwable $exception) {
                Log::warning('Không thể phát nhận xét realtime.', ['error' => $exception->getMessage()]);
            }
        });

        return response()->json(['message' => 'Đã lưu nhận xét và gửi thông báo.']);
    }

    private function validateTask(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string'],
            'category_id' => ['nullable', 'exists:task_categories,id'], 'task_catalog_item_id' => ['required', 'exists:task_catalog_items,id'], 'reviewer_id' => ['nullable', 'exists:users,id'],
            'priority' => ['required', Rule::in(['low', 'normal', 'high', 'urgent'])], 'starts_at' => ['nullable', 'date'],
            'due_at' => ['required', 'date', 'after_or_equal:starts_at'], 'maximum_score' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'requires_approval' => ['nullable', 'boolean'], 'teacher_ids' => ['required_without:department_ids', 'array'], 'teacher_ids.*' => ['integer', 'exists:teachers,id'],
            'department_ids' => ['required_without:teacher_ids', 'array'], 'department_ids.*' => ['integer', 'exists:departments,id'],
            'document_ids' => ['nullable', 'array'], 'document_ids.*' => ['integer', 'exists:official_documents,id'],
            'attachments' => ['nullable', 'array'], 'attachments.*' => ['file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png,zip'],
            'remove_attachment_ids' => ['nullable', 'array'], 'remove_attachment_ids.*' => ['integer', 'exists:files,id'],
        ]);
    }

    private function ensureTaskAccess(Request $request, Task $task): void
    {
        abort_unless($this->limitToAccessible(Task::whereKey($task->id), $request)->exists(), 403, 'Bạn không được phân công công việc này.');
    }

    private function limitToAccessible($query, Request $request)
    {
        $user = $request->user();
        if ($user->isSchoolWide()) {
            return $query;
        }
        $managed = $user->managedUnitIds() ?? [];
        $units = array_values(array_unique([...$user->memberUnitIds(), ...$managed]));

        return $query->where(fn ($q) => $q
            ->whereHas('teachers', fn ($t) => $t->where('teachers.id', $user->teacher?->id ?? 0))
            ->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $units ?: [0]))
            ->when($managed, fn ($b) => $b->orWhereHas('teachers', fn ($t) => $t->inUnits($managed)))
            ->orWhere('created_by', $user->id)
            ->orWhere('reviewer_id', $user->id));
    }

    private function ensureAssignmentScope(Request $request, array $data): void
    {
        $unitIds = $request->user()->managedUnitIds();
        if ($unitIds === null) {
            return;
        }

        $requestedUnits = collect($data['department_ids'] ?? [])->map(fn ($id) => (int) $id);
        abort_if($requestedUnits->diff($unitIds)->isNotEmpty(), 403, 'Bạn chỉ được giao việc trong đơn vị mình quản lý.');

        $teacherIds = collect($data['teacher_ids'] ?? [])->map(fn ($id) => (int) $id);
        if ($teacherIds->isNotEmpty()) {
            $allowedTeacherIds = Teacher::inUnits($unitIds)->pluck('id');
            abort_if($teacherIds->diff($allowedTeacherIds)->isNotEmpty(), 403, 'Bạn chỉ được giao việc cho giáo viên trong đơn vị mình quản lý.');
        }
    }

    private function ensureCanManageAssignment(Request $request, Task $task): void
    {
        abort_unless($this->canManageTask($request, $task), 403, 'Bạn không được sửa hoặc xóa công việc mình là người thực hiện.');
    }

    private function canManageTask(Request $request, Task $task): bool
    {
        if ($this->isTaskAssignee($request, $task) || ! $request->user()->hasPermission('tasks.assign')) {
            return false;
        }

        return $this->hasSchoolWideTaskAuthority($request) || $task->created_by === $request->user()->id;
    }

    private function reviewQueue($query, Request $request)
    {
        $user = $request->user();
        $departments = $user->memberUnitIds();

        return $query->where('review_status', 'waiting_approval')->where('status', '!=', 'cancelled')
            ->where(fn ($q) => $q->where('reviewer_id', $user->id)->orWhere(function ($b) use ($user, $departments, $request) {
                $b->whereDoesntHave('teachers', fn ($t) => $t->where('teachers.id', $user->teacher?->id ?? 0))
                    ->whereDoesntHave('departments', fn ($d) => $d->whereIn('departments.id', $departments));
                if (! $this->hasSchoolWideTaskAuthority($request)) {
                    $b->where('created_by', $user->id);
                }
            }));
    }

    private function canReviewTask(Request $request, Task $task): bool
    {
        if ($task->status === 'cancelled') {
            return false;
        }

        // A designated reviewer may also be an assignee (for example, a department
        // leader who both performs and evaluates the task). Reviewer authority wins.
        if ($task->reviewer_id === $request->user()->id) {
            return true;
        }

        if ($this->isTaskAssignee($request, $task)) {
            return false;
        }

        return $this->hasSchoolWideTaskAuthority($request)
            || $task->created_by === $request->user()->id;
    }

    private function isTaskAssignee(Request $request, Task $task): bool
    {
        $teacher = $request->user()->teacher;
        if (! $teacher) {
            return false;
        }
        $task->loadMissing(['teachers', 'departments']);
        if ($task->teachers->contains('id', $teacher->id)) {
            return true;
        }

        return $task->departments->pluck('id')->intersect($teacher->unitIds())->isNotEmpty();
    }

    private function hasSchoolWideTaskAuthority(Request $request): bool
    {
        return $request->user()->isSchoolWide() && $request->user()->hasPermission('tasks.assign');
    }

    private function isPersonalTaskFor(Request $request, Task $task): bool
    {
        $teacher = $request->user()->teacher;
        if (! $teacher || $task->created_by !== $request->user()->id) {
            return false;
        }

        $task->loadMissing(['teachers', 'departments']);

        return $task->departments->isEmpty()
            && $task->teachers->count() === 1
            && $task->teachers->contains('id', $teacher->id);
    }

    private function syncAssignees(Task $task, array $data): void
    {
        $teacherData = [];
        foreach ($data['teacher_ids'] ?? [] as $id) {
            $teacherData[$id] = ['assigned_by' => $this->systemUser()->id, 'assigned_at' => now(), 'status' => $task->status, 'progress_percent' => 0, 'created_at' => now(), 'updated_at' => now()];
        }
        $departmentData = [];
        foreach ($data['department_ids'] ?? [] as $id) {
            $departmentData[$id] = ['assigned_by' => $this->systemUser()->id, 'created_at' => now(), 'updated_at' => now()];
        }
        $task->teachers()->sync($teacherData);
        $task->departments()->sync($departmentData);
    }

    private function storeAttachments(Request $request, Task $task): void
    {
        foreach ($request->file('attachments', []) as $uploaded) {
            $path = $uploaded->store('task-attachments');
            $file = StoredFile::create(['uploaded_by' => $this->systemUser()->id, 'disk' => 'local', 'path' => $path, 'original_name' => $uploaded->getClientOriginalName(), 'mime_type' => $uploaded->getMimeType(), 'size' => $uploaded->getSize(), 'checksum' => hash_file('sha256', $uploaded->getRealPath())]);
            DB::table('file_attachments')->insert(['file_id' => $file->id, 'attachable_type' => Task::class, 'attachable_id' => $task->id, 'purpose' => 'attachment', 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    private function removeAttachments(Task $task, array $fileIds): void
    {
        if (! $fileIds) {
            return;
        }
        $files = StoredFile::whereIn('id', $fileIds)->whereIn('id', DB::table('file_attachments')->where('attachable_type', Task::class)->where('attachable_id', $task->id)->pluck('file_id'))->get();
        foreach ($files as $file) {
            Storage::disk($file->disk)->delete($file->path);
            DB::table('file_attachments')->where('file_id', $file->id)->where('attachable_type', Task::class)->where('attachable_id', $task->id)->delete();
            $file->delete();
        }
    }

    private function recordStatus(Task $task, ?string $from, string $to, string $reason): void
    {
        DB::table('task_status_histories')->insert(['task_id' => $task->id, 'from_status' => $from, 'to_status' => $to, 'changed_by' => $this->systemUser()->id, 'reason' => $reason, 'created_at' => now()]);
    }

    private function nextCode(): string
    {
        $next = (int) Task::withTrashed()->max('id') + 1;

        return 'CV-'.now()->format('ym').'-'.str_pad($next, 4, '0', STR_PAD_LEFT);
    }

    private function systemUser(): User
    {
        return User::firstOrCreate(['email' => 'admin@thanhdam.edu.vn'], ['name' => 'Quản trị hệ thống', 'phone' => '0900000000', 'password' => Str::random(40), 'status' => 'active']);
    }

    private function loadTask(Task $task): Task
    {
        return $task->load(['category', 'catalogItem.group', 'creator', 'reviewer', 'teachers.user', 'departments', 'documents.type', 'documents.file'])->loadCount(['teachers', 'departments', 'submissions']);
    }

    private function serialize(Task $task): array
    {
        $progress = round((float) ($task->teachers->avg(fn ($t) => (float) $t->pivot->progress_percent) ?? 0), 1);
        $departmentIds = $task->departments->pluck('id');
        if ($departmentIds->isNotEmpty()) {
            $departmentTeachers = Teacher::with('user')
                ->where('employment_status', 'working')
                ->inUnits($departmentIds)
                ->get();
            $extraTeachers = $departmentTeachers
                ->whereNotIn('id', $task->teachers->pluck('id'))
                ->each(fn (Teacher $teacher) => $teacher->setRelation('pivot', (object) ['progress_percent' => 0]));
            $task->setRelation('teachers', $task->teachers->concat($extraTeachers)->values());
        }
        $reminders = DB::table('task_reminders')
            ->where('task_id', $task->id)
            ->select('teacher_id', DB::raw('COUNT(*) as reminder_count'), DB::raw('MAX(sent_at) as last_reminded_at'))
            ->groupBy('teacher_id')
            ->get()
            ->keyBy('teacher_id');

        return ['id' => $task->id, 'code' => $task->code, 'title' => $task->title, 'category_id' => $task->category_id, 'category' => $task->category?->name, 'task_catalog_item_id' => $task->task_catalog_item_id, 'task_type' => $task->catalogItem?->name, 'product' => $task->catalogItem?->product_type, 'priority' => $task->priority, 'status' => $task->status, 'starts_at' => $task->starts_at?->format('Y-m-d\TH:i'), 'due_at' => $task->due_at?->format('Y-m-d\TH:i'), 'maximum_score' => (float) $task->maximum_score, 'requires_approval' => $task->requires_approval, 'reviewer_id' => $task->reviewer_id, 'reviewer' => $task->reviewer?->name, 'creator' => $task->creator?->name, 'progress' => $progress, 'teacher_ids' => $task->teachers->pluck('id'), 'department_ids' => $task->departments->pluck('id'), 'document_ids' => $task->documents->pluck('id'), 'documents' => $task->documents->map(fn ($document) => ['id' => $document->id, 'document_number' => $document->document_number, 'title' => $document->title, 'issuer' => $document->issuer, 'issued_on' => $document->issued_on?->format('Y-m-d'), 'type' => $document->type?->name, 'file_name' => $document->file?->original_name, 'download_url' => $document->file ? route('documents.download', $document) : null]), 'assignees' => $task->teachers->map(fn ($t) => ['id' => $t->id, 'name' => $t->user->name, 'avatar_url' => $t->user->avatar_path ? route('avatars.show', ['filename' => basename($t->user->avatar_path)]) : null, 'progress' => (float) $t->pivot->progress_percent, 'reminder_count' => (int) ($reminders->get($t->id)?->reminder_count ?? 0), 'last_reminded_at' => $reminders->get($t->id)?->last_reminded_at]), 'departments' => $task->departments->map(fn ($d) => Department::pathLabel($d->id)), 'assignee_count' => $task->teachers_count ?? $task->teachers->count(), 'department_count' => $task->departments_count ?? $task->departments->count(), 'submission_count' => $task->submissions_count ?? 0, 'is_overdue' => $task->due_at?->isPast() && ! in_array($task->status, ['completed', 'cancelled'])];
    }
}
