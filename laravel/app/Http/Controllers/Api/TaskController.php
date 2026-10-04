<?php

namespace App\Http\Controllers\Api;

use App\Events\TaskAssignedRealtime;
use App\Events\TaskWorkflowRealtime;
use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\OfficialDocument;
use App\Models\StoredFile;
use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\TaskSubmission;
use App\Models\TaskUpdate;
use App\Models\Teacher;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Notifications\TaskReminderNotification;
use App\Notifications\TaskWorkflowNotification;
use App\Services\TaskActionFilters;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::with(['category', 'creator', 'reviewer', 'teachers.user', 'departments', 'documents.type', 'documents.file'])
            ->withCount(['teachers', 'departments', 'submissions'])
            ->when($request->string('search')->toString(), fn ($q, $search) => $q->where(fn ($b) => $b->where('code', 'like', "%{$search}%")->orWhere('title', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%")))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->string('priority')->toString(), fn ($q, $priority) => $q->where('priority', $priority))
            ->when($request->integer('category_id'), fn ($q, $category) => $q->where('category_id', $category))
            ->latest('created_at');
        $this->limitToAccessible($query, $request);
        app(TaskActionFilters::class)->apply($query, $request, fn ($q) => $this->reviewQueue($q, $request));
        $paginator = $query->paginate(min(max($request->integer('per_page', 10), 5), 100));
        $paginator->getCollection()->transform(fn (Task $task) => [...$this->serialize($task), ...$this->abilities($request, $task)]);
        $base = $this->limitToAccessible(Task::query(), $request);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()],
            'stats' => [
                'total' => (clone $base)->count(),
                'pending' => (clone $base)->whereIn('status', Task::OPEN)->count(),
                'not_started' => (clone $base)->where('status', Task::NOT_STARTED)->count(),
                'in_progress' => (clone $base)->where('status', Task::IN_PROGRESS)->count(),
                'waiting_approval' => (clone $base)->where('status', Task::WAITING_APPROVAL)->count(),
                'completed' => (clone $base)->where('status', Task::COMPLETED)->count(),
                'cancelled' => (clone $base)->where('status', Task::CANCELLED)->count(),
                'overdue' => (clone $base)->whereIn('status', [Task::NOT_STARTED, Task::IN_PROGRESS])->where('due_at', '<', now())->count(),
                'soon' => (clone $base)->whereIn('status', [Task::NOT_STARTED, Task::IN_PROGRESS])->whereBetween('due_at', [now(), now()->addDay()])->count(),
                'my_review' => $this->reviewQueue(clone $base, $request)->count(),
            ],
        ]);
    }

    public function referenceData(Request $request): JsonResponse
    {
        $user = $request->user();
        $unitIds = $user->managedUnitIds();
        $unitOption = fn ($unit) => ['id' => $unit['id'], 'name' => $unit['label'], 'parent_id' => $unit['parent_id'], 'type' => $unit['type']];
        $avatar = fn (?User $u) => $u?->avatar_path ? route('avatars.show', ['filename' => basename($u->avatar_path)]) : null;
        $canAssign = $user->hasPermission('tasks.assign');
        $activeRoles = fn ($q) => $q->where(fn ($r) => $r->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now()));
        $roles = fn (?User $u) => $u ? $u->roles->map(fn ($role) => ['code' => $role->code, 'name' => $role->name, 'department_id' => $role->pivot->department_id])->values() : [];

        return response()->json([
            'categories' => TaskCategory::where('is_active', true)->orderBy('name')->get(['id', 'name', 'description']),
            'filter_categories' => TaskCategory::orderBy('name')->get(['id', 'name']),
            'filter_teachers' => Teacher::with('user')->where('employment_status', 'working')->when($unitIds !== null, fn ($q) => $q->where(fn ($b) => $b->where('id', $user->teacher?->id ?? 0)->orWhere(fn ($m) => $m->inUnits($unitIds))))->get()->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name]),
            'filter_departments' => Department::ordered($unitIds === null ? null : array_values(array_unique([...$unitIds, ...$user->memberUnitIds()])))->map($unitOption)->values(),
            'teachers' => $canAssign ? Teacher::with(['user.roles' => $activeRoles, 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('employment_status', 'working')->when($unitIds !== null, fn ($q) => $q->inUnits($unitIds))->orderBy('employee_code')->get()->map(fn ($t) => ['id' => $t->id, 'name' => $t->user->name, 'code' => $t->employee_code, 'avatar_url' => $avatar($t->user), 'department_ids' => $t->unitIds(), 'roles' => $roles($t->user)]) : [],
            'departments' => $canAssign ? Department::ordered($unitIds)->map($unitOption)->values() : [],
            'reviewers' => User::with(['roles' => $activeRoles, 'teacher.departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('status', 'active')->orderBy('name')->get()->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'avatar_url' => $avatar($u), 'department_ids' => $u->teacher?->unitIds() ?? [], 'roles' => $roles($u)]),
            'current_teacher' => $user->teacher ? ['id' => $user->teacher->id, 'name' => $user->name, 'avatar_url' => $avatar($user)] : null,
            'can_assign' => $canAssign,
            'documents' => OfficialDocument::with(['type', 'file'])->latest('issued_on')->limit(200)->get()->map(fn ($document) => [
                'id' => $document->id, 'document_number' => $document->document_number,
                'title' => $document->title, 'issuer' => $document->issuer,
                'issued_on' => $document->issued_on?->format('Y-m-d'), 'type' => $document->type?->name,
                'has_file' => (bool) $document->file_id,
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateTask($request);
        $this->ensureAssignmentScope($request, $data);
        $task = DB::transaction(function () use ($request, $data) {
            $task = Task::create([...$this->taskAttributes($data), 'code' => $this->nextCode(), 'created_by' => $request->user()->id, 'status' => Task::NOT_STARTED]);
            $this->syncAssignees($task, $data, $request->user());
            $task->documents()->sync($data['document_ids'] ?? []);
            $this->storeAttachments($request, $task);
            $this->recordStatus($task, null, Task::NOT_STARTED, 'Khởi tạo và giao công việc', $request->user());

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
        $request->merge(['teacher_ids' => [$teacher->id], 'department_ids' => []]);
        $data = $this->validateTask($request);
        abort_if(($data['reviewer_id'] ?? null) === $request->user()->id, 422, 'Người duyệt phải là người khác.');
        $task = DB::transaction(function () use ($request, $data) {
            $task = Task::create([...$this->taskAttributes($data), 'code' => $this->nextCode(), 'created_by' => $request->user()->id, 'status' => Task::NOT_STARTED]);
            $this->syncAssignees($task, $data, $request->user());
            $task->documents()->sync($data['document_ids'] ?? []);
            $this->storeAttachments($request, $task);
            $this->recordStatus($task, null, Task::NOT_STARTED, 'Tự tạo công việc cá nhân', $request->user());

            return $task;
        });
        $this->notifyReviewer($task);

        return response()->json(['message' => 'Đã tạo công việc cá nhân thành công.', 'data' => $this->serialize($this->loadTask($task))], 201);
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        $this->ensureTaskAccess($request, $task);
        $task = $this->loadTask($task);
        $updates = DB::table('task_updates')->leftJoin('users', 'users.id', '=', 'task_updates.created_by')->where('task_id', $task->id)->whereNotNull('task_updates.content')->latest('task_updates.created_at')->select('task_updates.*', 'users.name as creator_name', 'users.avatar_path as creator_avatar_path')->get()->map(function ($update) use ($task, $request) {
            $update->author_role = $this->authorRole($task, (int) $update->created_by);
            $update->can_edit = $update->created_by === $request->user()->id && in_array($update->author_role, ['reviewer', 'assigner']);
            $update->creator_avatar_url = $update->creator_avatar_path ? route('avatars.show', ['filename' => basename($update->creator_avatar_path)]) : null;
            unset($update->creator_avatar_path);

            return $update;
        });
        $attachments = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')->where('attachable_type', Task::class)->where('attachable_id', $task->id)->select('files.id', 'files.original_name', 'files.mime_type', 'files.size')->get();
        $submissions = TaskSubmission::with('teacher.user')->where('task_id', $task->id)->latest('submitted_at')->latest('id')->get()->map(fn (TaskSubmission $submission) => [
            'id' => $submission->id,
            'version' => $submission->version,
            'submitter' => $submission->teacher?->user?->name,
            'submitter_avatar_url' => $submission->teacher?->user?->avatar_path ? route('avatars.show', ['filename' => basename($submission->teacher->user->avatar_path)]) : null,
            'result_content' => $submission->result_content,
            'links' => $submission->links ?? [],
            'files' => DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')->where('attachable_type', TaskSubmission::class)->where('attachable_id', $submission->id)->select('files.id', 'files.original_name', 'files.mime_type', 'files.size')->get(),
            'status' => $submission->status,
            'submitted_at' => $submission->submitted_at?->toIso8601String(),
            'review_comment' => $submission->review_comment,
            'reviewed_at' => $submission->reviewed_at?->toIso8601String(),
        ]);

        return response()->json(['data' => [...$this->serialize($task), ...$this->abilities($request, $task), 'description' => $task->description, 'submissions' => $submissions, 'latest_submission' => $submissions->first(), 'updates' => $updates, 'attachments' => $attachments]]);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canManageTask($request, $task), 403, 'Bạn không được sửa công việc này.');
        abort_if(in_array($task->status, Task::CLOSED, true), 422, 'Công việc đã kết thúc, không thể sửa.');
        $data = $this->validateTask($request);
        $this->ensureAssignmentScope($request, $data);
        DB::transaction(function () use ($request, $data, $task) {
            $task->update($this->taskAttributes($data));
            $this->syncAssignees($task, $data, $request->user());
            $task->documents()->sync($data['document_ids'] ?? []);
            $this->storeAttachments($request, $task);
            $this->removeAttachments($task, $data['remove_attachment_ids'] ?? []);
        });

        return response()->json(['message' => 'Đã cập nhật công việc thành công.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function updatePersonal(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->isPersonalTaskFor($request, $task), 403, 'Bạn chỉ được sửa công việc cá nhân do chính mình tạo.');
        abort_if(in_array($task->status, Task::CLOSED, true), 422, 'Công việc đã kết thúc, không thể sửa.');
        $request->merge(['teacher_ids' => [$request->user()->teacher->id], 'department_ids' => []]);
        $data = $this->validateTask($request);
        abort_if(($data['reviewer_id'] ?? null) === $request->user()->id, 422, 'Người duyệt phải là người khác.');
        DB::transaction(function () use ($request, $data, $task) {
            $task->update($this->taskAttributes($data));
            $task->documents()->sync($data['document_ids'] ?? []);
            $this->storeAttachments($request, $task);
            $this->removeAttachments($task, $data['remove_attachment_ids'] ?? []);
        });

        return response()->json(['message' => 'Đã cập nhật công việc cá nhân thành công.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canManageTask($request, $task), 403, 'Bạn không được xóa công việc này.');
        $task->delete();

        return response()->json(['message' => 'Đã xóa công việc thành công.']);
    }

    public function destroyPersonal(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->isPersonalTaskFor($request, $task), 403, 'Bạn chỉ được xóa công việc cá nhân do chính mình tạo.');
        $task->delete();

        return response()->json(['message' => 'Đã xóa công việc cá nhân.']);
    }

    public function progress(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canUpdateProgress($request, $task), 403, 'Bạn không thể cập nhật trạng thái công việc này.');
        $data = $request->validate([
            'status' => ['required', Rule::in([Task::NOT_STARTED, Task::IN_PROGRESS])],
            'content' => ['nullable', 'string', 'max:2000'],
        ]);
        $old = $task->status;
        DB::transaction(function () use ($task, $data, $old, $request) {
            $task->update(['status' => $data['status']]);
            $task->updates()->create(['teacher_id' => $request->user()->teacher?->id, 'created_by' => $request->user()->id, 'status' => $data['status'], 'content' => $data['content'] ?? null]);
            if ($old !== $data['status']) {
                $this->recordStatus($task, $old, $data['status'], $data['content'] ?? 'Cập nhật trạng thái', $request->user());
            }
        });
        if (! empty($data['content'])) {
            $this->notify(collect([$task->reviewer ?: $task->creator]), $task, $request->user()->name.' đã cập nhật công việc '.$task->title.': '.$data['content'], 'progress_comment', $request->user());
        }

        return response()->json(['message' => 'Đã cập nhật trạng thái công việc.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function submitCompletion(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canSubmit($request, $task), 403, 'Bạn không thể gửi đề nghị hoàn thành cho công việc này.');
        $teacher = $request->user()->teacher;
        $data = $request->validate([
            'comment' => ['nullable', 'string', 'max:3000'],
            'links' => ['nullable', 'array', 'max:20'],
            'links.*' => ['required', 'url:http,https', 'max:2048'],
            'submission_files' => ['nullable', 'array', 'max:20'],
            'submission_files.*' => ['file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,jpg,jpeg,png,zip,rar'],
        ]);
        $links = collect($data['links'] ?? [])->filter()->unique()->values()->all();
        $version = ((int) $task->submissions()->max('version')) + 1;
        $old = $task->status;
        DB::transaction(function () use ($task, $teacher, $request, $data, $links, $version, $old) {
            $submission = $task->submissions()->create(['teacher_id' => $teacher->id, 'version' => $version, 'result_content' => $data['comment'] ?? null, 'links' => $links, 'status' => 'submitted', 'submitted_at' => now()]);
            foreach ($request->file('submission_files', []) as $uploaded) {
                $file = $this->storeFile($uploaded, 'task-submissions', $request->user());
                DB::table('file_attachments')->insert(['file_id' => $file->id, 'attachable_type' => TaskSubmission::class, 'attachable_id' => $submission->id, 'purpose' => 'submission', 'created_at' => now(), 'updated_at' => now()]);
            }
            $task->update(['status' => Task::WAITING_APPROVAL]);
            $task->updates()->create(['teacher_id' => $teacher->id, 'created_by' => $request->user()->id, 'status' => Task::WAITING_APPROVAL, 'content' => $data['comment'] ?? 'Đã gửi bài nộp.']);
            $this->recordStatus($task, $old, Task::WAITING_APPROVAL, 'Gửi đề nghị hoàn thành', $request->user());
        });
        $this->notify(collect([$task->creator, $task->reviewer]), $task, $request->user()->name.' đã gửi đề nghị xác nhận hoàn thành: '.$task->title, 'completion_submitted', $request->user());

        return response()->json(['message' => 'Đã gửi đề nghị hoàn thành và thông báo cho người giao việc, người duyệt.']);
    }

    public function reviewCompletion(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canReviewTask($request, $task), 403, 'Bạn không có quyền duyệt công việc này.');
        $data = $request->validate([
            'decision' => ['required', Rule::in(['approved', 'revision_required'])],
            'comment' => ['nullable', 'string', 'max:3000'],
        ]);
        $approved = $data['decision'] === 'approved';
        $status = $approved ? Task::COMPLETED : Task::IN_PROGRESS;
        $comment = $data['comment'] ?? null;
        $submission = $task->submissions()->latest('submitted_at')->latest('id')->first();
        DB::transaction(function () use ($task, $submission, $request, $data, $status, $comment, $approved) {
            $submission?->update(['status' => $data['decision'], 'reviewed_by' => $request->user()->id, 'reviewed_at' => now(), 'review_comment' => $comment]);
            $task->update(['status' => $status, 'completed_at' => $approved ? now() : null]);
            $task->updates()->create(['teacher_id' => $submission?->teacher_id, 'created_by' => $request->user()->id, 'status' => $status, 'content' => $comment]);
            $this->recordStatus($task, Task::WAITING_APPROVAL, $status, $comment ?? ($approved ? 'Xác nhận hoàn thành' : 'Yêu cầu chỉnh sửa'), $request->user());
        });
        $message = $approved ? 'Công việc đã được xác nhận hoàn thành' : 'Công việc được yêu cầu chỉnh sửa';
        $this->notify($this->assigneeUsers($task), $task, $message.': '.$task->title.($comment ? '. Nhận xét: '.$comment : ''), $data['decision'], $request->user());

        return response()->json(['message' => $message.'.']);
    }

    public function complete(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canSelfComplete($request, $task), 403, 'Chỉ việc cá nhân không có người duyệt mới tự đánh dấu hoàn thành được.');
        $old = $task->status;
        DB::transaction(function () use ($task, $request, $old) {
            $task->update(['status' => Task::COMPLETED, 'completed_at' => now()]);
            $this->recordStatus($task, $old, Task::COMPLETED, 'Tự đánh dấu hoàn thành', $request->user());
        });

        return response()->json(['message' => 'Đã đánh dấu hoàn thành.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function cancel(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canCancel($request, $task), 403, 'Bạn không có quyền hủy công việc này.');
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:2000']]);
        $old = $task->status;
        DB::transaction(function () use ($task, $request, $data, $old) {
            $task->update(['status' => Task::CANCELLED, 'completed_at' => null]);
            $this->recordStatus($task, $old, Task::CANCELLED, $data['reason'] ?? 'Hủy công việc', $request->user());
            if (! empty($data['reason'])) {
                $task->updates()->create(['created_by' => $request->user()->id, 'status' => Task::CANCELLED, 'content' => 'Hủy công việc: '.$data['reason']]);
            }
        });
        if (! $this->isPersonalTaskFor($request, $task)) {
            $this->notify($this->assigneeUsers($task), $task, 'Công việc đã bị hủy: '.$task->title.(! empty($data['reason']) ? '. Lý do: '.$data['reason'] : ''), 'cancelled', $request->user());
        }

        return response()->json(['message' => 'Đã hủy công việc.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function sendReminder(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canManageTask($request, $task), 403, 'Bạn không có quyền nhắc công việc này.');
        abort_unless(in_array($task->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true), 422, 'Chỉ nhắc được công việc chưa thực hiện hoặc đang thực hiện.');
        $teachers = $this->assigneeTeachers($task)->filter(fn (Teacher $teacher) => filled($teacher->user?->email))->values();
        abort_if($teachers->isEmpty(), 422, 'Người thực hiện chưa có địa chỉ email hợp lệ.');
        foreach ($teachers as $index => $teacher) {
            $teacher->user->notify((new TaskReminderNotification($task))->delay(now()->addSeconds($index * 5)));
            DB::table('task_reminders')->insert(['task_id' => $task->id, 'teacher_id' => $teacher->id, 'sent_by' => $request->user()->id, 'email' => $teacher->user->email, 'sent_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        }
        $round = (int) DB::table('task_reminders')->where('task_id', $task->id)->selectRaw('COUNT(*) as reminder_count')->groupBy('teacher_id')->pluck('reminder_count')->max();

        return response()->json(['message' => 'Đã đưa '.$teachers->count().' email nhắc việc vào hàng chờ.', 'queued_count' => $teachers->count(), 'reminder_count' => $round]);
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

    public function updateComment(Request $request, Task $task, TaskUpdate $update): JsonResponse
    {
        $this->ensureTaskAccess($request, $task);
        abort_unless($update->task_id === $task->id, 404);
        abort_unless($update->created_by === $request->user()->id && in_array($this->authorRole($task, (int) $update->created_by), ['reviewer', 'assigner'], true), 403, 'Bạn chỉ được sửa nhận xét do chính mình tạo với vai trò giao việc hoặc kiểm duyệt.');
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
        $isAssignee = $this->isTaskAssignee($request, $task);
        $task->updates()->create(['teacher_id' => $isAssignee ? $request->user()->teacher->id : null, 'created_by' => $request->user()->id, 'status' => $task->status, 'content' => $data['content']]);
        $recipients = $isAssignee ? collect([$task->reviewer ?: $task->creator]) : $this->assigneeUsers($task);
        $this->notify($recipients, $task, $request->user()->name.' đã gửi nhận xét về công việc '.$task->title.': '.$data['content'], 'task_comment', $request->user());

        return response()->json(['message' => 'Đã lưu nhận xét và gửi thông báo.']);
    }

    private function validateTask(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'category_id' => ['nullable', Rule::exists('task_categories', 'id')->where('is_active', true)],
            'reviewer_id' => ['nullable', Rule::exists('users', 'id')->where('status', 'active')],
            'priority' => ['required', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'starts_at' => ['nullable', 'date'],
            'due_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'teacher_ids' => ['required_without:department_ids', 'array'],
            'teacher_ids.*' => ['integer', 'exists:teachers,id'],
            'department_ids' => ['required_without:teacher_ids', 'array'],
            'department_ids.*' => ['integer', 'exists:departments,id'],
            'document_ids' => ['nullable', 'array'],
            'document_ids.*' => ['integer', 'exists:official_documents,id'],
            'attachments' => ['nullable', 'array'],
            'attachments.*' => ['file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png,zip'],
            'remove_attachment_ids' => ['nullable', 'array'],
            'remove_attachment_ids.*' => ['integer', 'exists:files,id'],
        ]);
    }

    private function taskAttributes(array $data): array
    {
        return collect($data)->only(['title', 'description', 'category_id', 'reviewer_id', 'priority', 'starts_at', 'due_at'])->all();
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
            abort_if($teacherIds->diff(Teacher::inUnits($unitIds)->pluck('id'))->isNotEmpty(), 403, 'Bạn chỉ được giao việc cho giáo viên trong đơn vị mình quản lý.');
        }
    }

    private function abilities(Request $request, Task $task): array
    {
        return [
            'is_reviewer' => $task->reviewer_id === $request->user()->id,
            'is_personal' => $this->isPersonal($task),
            'can_manage' => $this->canManageTask($request, $task),
            'can_edit_personal' => $this->isPersonalTaskFor($request, $task),
            'can_update_progress' => $this->canUpdateProgress($request, $task),
            'can_submit_completion' => $this->canSubmit($request, $task),
            'can_review_completion' => $this->canReviewTask($request, $task),
            'can_self_complete' => $this->canSelfComplete($request, $task),
            'can_cancel' => $this->canCancel($request, $task),
        ];
    }

    private function canManageTask(Request $request, Task $task): bool
    {
        if ($this->isPersonal($task) || $this->isTaskAssignee($request, $task) || ! $request->user()->hasPermission('tasks.assign')) {
            return false;
        }

        return $this->hasSchoolWideTaskAuthority($request) || $task->created_by === $request->user()->id;
    }

    private function canUpdateProgress(Request $request, Task $task): bool
    {
        return in_array($task->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true)
            && $request->user()->hasPermission('tasks.update')
            && $this->isTaskAssignee($request, $task);
    }

    private function canSubmit(Request $request, Task $task): bool
    {
        if (! $this->canUpdateProgress($request, $task) || $task->reviewer_id === $request->user()->id) {
            return false;
        }

        return ! ($this->isPersonal($task) && ! $task->reviewer_id);
    }

    private function canReviewTask(Request $request, Task $task): bool
    {
        if ($task->status !== Task::WAITING_APPROVAL) {
            return false;
        }
        if ($task->reviewer_id === $request->user()->id) {
            return true;
        }
        if ($this->isTaskAssignee($request, $task)) {
            return false;
        }

        return $task->created_by === $request->user()->id || $this->hasSchoolWideTaskAuthority($request);
    }

    private function canSelfComplete(Request $request, Task $task): bool
    {
        return $this->isPersonalTaskFor($request, $task) && ! $task->reviewer_id && ! in_array($task->status, Task::CLOSED, true);
    }

    private function canCancel(Request $request, Task $task): bool
    {
        if (in_array($task->status, Task::CLOSED, true)) {
            return false;
        }

        return $this->canManageTask($request, $task) || $this->isPersonalTaskFor($request, $task);
    }

    private function reviewQueue($query, Request $request)
    {
        $user = $request->user();
        $units = $user->memberUnitIds();

        return $query->where('status', Task::WAITING_APPROVAL)
            ->where(fn ($q) => $q->where('reviewer_id', $user->id)->orWhere(function ($b) use ($user, $units, $request) {
                $b->whereDoesntHave('teachers', fn ($t) => $t->where('teachers.id', $user->teacher?->id ?? 0))
                    ->whereDoesntHave('departments', fn ($d) => $d->whereIn('departments.id', $units ?: [0]));
                if (! $this->hasSchoolWideTaskAuthority($request)) {
                    $b->where('created_by', $user->id);
                }
            }));
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

    private function isPersonal(Task $task): bool
    {
        $task->loadMissing(['teachers', 'departments', 'creator.teacher']);

        return $task->departments->isEmpty()
            && $task->teachers->count() === 1
            && $task->teachers->first()->id === $task->creator?->teacher?->id;
    }

    private function isPersonalTaskFor(Request $request, Task $task): bool
    {
        return $task->created_by === $request->user()->id && $this->isPersonal($task);
    }

    private function authorRole(Task $task, int $userId): string
    {
        return $userId === $task->reviewer_id ? 'reviewer' : ($userId === $task->created_by ? 'assigner' : 'assignee');
    }

    private function assigneeTeachers(Task $task): Collection
    {
        $task->loadMissing(['teachers.user', 'departments']);
        $teachers = $task->teachers;
        if ($task->departments->isNotEmpty()) {
            $teachers = $teachers->concat(Teacher::with('user')->where('employment_status', 'working')->inUnits($task->departments->pluck('id'))->whereNotIn('id', $teachers->pluck('id'))->get());
        }

        return $teachers->unique('id')->values();
    }

    private function assigneeUsers(Task $task): Collection
    {
        return $this->assigneeTeachers($task)->pluck('user')->filter()->values();
    }

    private function notify(Collection $recipients, Task $task, string $message, string $type, ?User $actor = null): void
    {
        $recipients->filter()->unique('id')->reject(fn (User $user) => $user->id === $actor?->id)->each(function (User $recipient) use ($task, $message, $type) {
            try {
                $recipient->notify(new TaskWorkflowNotification($task, $message, $type));
            } catch (\Throwable $exception) {
                Log::error('Không thể lưu thông báo công việc.', ['user_id' => $recipient->id, 'task_id' => $task->id, 'error' => $exception->getMessage()]);
            }
            try {
                TaskWorkflowRealtime::dispatch($task, $recipient->id, $message, $type);
            } catch (\Throwable $exception) {
                Log::warning('Không thể phát thông báo realtime.', ['user_id' => $recipient->id, 'error' => $exception->getMessage()]);
            }
        });
    }

    private function notifyAssignees(Task $task): void
    {
        $this->assigneeUsers($task)->unique('id')->each(function (User $user) use ($task) {
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

    private function notifyReviewer(Task $task): void
    {
        if ($task->reviewer && ! $this->assigneeUsers($task)->contains('id', $task->reviewer->id)) {
            $this->notify(collect([$task->reviewer]), $task, 'Bạn được chỉ định duyệt công việc: '.$task->title, 'reviewer_assigned');
        }
    }

    private function syncAssignees(Task $task, array $data, User $actor): void
    {
        $existing = $task->teachers()->pluck('teachers.id')->all();
        $teacherData = [];
        foreach ($data['teacher_ids'] ?? [] as $id) {
            $teacherData[$id] = in_array((int) $id, $existing, true) ? [] : ['assigned_by' => $actor->id, 'assigned_at' => now()];
        }
        $departmentData = [];
        foreach ($data['department_ids'] ?? [] as $id) {
            $departmentData[$id] = ['assigned_by' => $actor->id];
        }
        $task->teachers()->sync($teacherData);
        $task->departments()->sync($departmentData);
    }

    private function storeFile($uploaded, string $folder, User $actor): StoredFile
    {
        return StoredFile::create(['uploaded_by' => $actor->id, 'disk' => 'local', 'path' => $uploaded->store($folder), 'original_name' => $uploaded->getClientOriginalName(), 'mime_type' => $uploaded->getMimeType(), 'size' => $uploaded->getSize(), 'checksum' => hash_file('sha256', $uploaded->getRealPath())]);
    }

    private function storeAttachments(Request $request, Task $task): void
    {
        foreach ($request->file('attachments', []) as $uploaded) {
            $file = $this->storeFile($uploaded, 'task-attachments', $request->user());
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

    private function recordStatus(Task $task, ?string $from, string $to, string $reason, User $actor): void
    {
        DB::table('task_status_histories')->insert(['task_id' => $task->id, 'from_status' => $from, 'to_status' => $to, 'changed_by' => $actor->id, 'reason' => $reason, 'created_at' => now()]);
    }

    private function nextCode(): string
    {
        return 'CV-'.now()->format('ym').'-'.str_pad((int) Task::withTrashed()->max('id') + 1, 4, '0', STR_PAD_LEFT);
    }

    private function loadTask(Task $task): Task
    {
        return $task->load(['category', 'creator.teacher', 'reviewer', 'teachers.user', 'departments', 'documents.type', 'documents.file'])->loadCount(['teachers', 'departments', 'submissions']);
    }

    private function serialize(Task $task): array
    {
        $assignees = $this->assigneeTeachers($task);
        $reminders = DB::table('task_reminders')->where('task_id', $task->id)->select('teacher_id', DB::raw('COUNT(*) as reminder_count'), DB::raw('MAX(sent_at) as last_reminded_at'))->groupBy('teacher_id')->get()->keyBy('teacher_id');
        $latest = $task->submissions()->latest('submitted_at')->latest('id')->first(['status', 'submitted_at']);
        $finishedAt = $task->status === Task::COMPLETED ? ($latest?->submitted_at ?? $task->completed_at) : null;

        return [
            'id' => $task->id, 'code' => $task->code, 'title' => $task->title,
            'category_id' => $task->category_id, 'category' => $task->category?->name,
            'priority' => $task->priority, 'status' => $task->status,
            'needs_revision' => $task->status === Task::IN_PROGRESS && $latest?->status === 'revision_required',
            'starts_at' => $task->starts_at?->format('Y-m-d\TH:i'), 'due_at' => $task->due_at?->format('Y-m-d\TH:i'),
            'completed_at' => $task->completed_at?->toIso8601String(),
            'created_at' => $task->created_at?->toIso8601String(),
            'reviewer_id' => $task->reviewer_id, 'reviewer' => $task->reviewer?->name,
            'created_by' => $task->created_by, 'creator' => $task->creator?->name,
            'teacher_ids' => $task->teachers->pluck('id'), 'department_ids' => $task->departments->pluck('id'),
            'document_ids' => $task->documents->pluck('id'),
            'documents' => $task->documents->map(fn ($document) => ['id' => $document->id, 'document_number' => $document->document_number, 'title' => $document->title, 'issuer' => $document->issuer, 'issued_on' => $document->issued_on?->format('Y-m-d'), 'type' => $document->type?->name, 'file_name' => $document->file?->original_name, 'download_url' => $document->file ? route('documents.download', $document) : null]),
            'assignees' => $assignees->map(fn (Teacher $t) => ['id' => $t->id, 'name' => $t->user->name, 'avatar_url' => $t->user->avatar_path ? route('avatars.show', ['filename' => basename($t->user->avatar_path)]) : null, 'direct' => $task->teachers->contains('id', $t->id), 'reminder_count' => (int) ($reminders->get($t->id)?->reminder_count ?? 0), 'last_reminded_at' => $reminders->get($t->id)?->last_reminded_at])->values(),
            'departments' => $task->departments->map(fn ($d) => Department::pathLabel($d->id))->values(),
            'assignee_count' => $assignees->count(), 'department_count' => $task->departments->count(),
            'submission_count' => $task->submissions_count ?? $task->submissions()->count(),
            'is_overdue' => $task->due_at?->isPast() && in_array($task->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true),
            'is_late' => $finishedAt !== null && $task->due_at !== null && $finishedAt->gt($task->due_at),
        ];
    }
}
