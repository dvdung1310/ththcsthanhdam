<?php

namespace App\Http\Controllers\Api;

use App\Events\TaskAssignedRealtime;
use App\Events\TaskWorkflowRealtime;
use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\LibraryNode;
use App\Models\Role;
use App\Models\StoredFile;
use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\TaskSubmission;
use App\Models\TaskUpdate;
use App\Models\Employee;
use App\Models\TaskDraft;
use App\Models\User;
use App\Services\FileStore;
use App\Services\LibraryAccess;
use App\Notifications\TaskAssignedNotification;
use App\Notifications\TaskReminderNotification;
use App\Notifications\TaskWorkflowNotification;
use App\Services\TaskActionFilters;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    private const SUBMISSION_ACTIVITY = ['Đã gửi bài nộp.', 'Đã chỉnh sửa bài nộp', 'Đã yêu cầu chỉnh sửa bài nộp.'];

    private const ACTIVITY_PREFIXES = ['Đã gửi bài nộp.', 'Đã chỉnh sửa bài nộp', 'Đã xác nhận hoàn thành.', 'Đã yêu cầu chỉnh sửa bài nộp.', 'Đã bật chia sẻ bài nộp', 'Đã tắt chia sẻ bài nộp', 'Đã tạo công việc', 'Đã cập nhật công việc:', 'Đã bắt đầu thực hiện', 'Hủy công việc: '];

    private const PRIORITY_LABELS = ['low' => 'Thấp', 'normal' => 'Bình thường', 'high' => 'Cao', 'urgent' => 'Khẩn cấp'];

    public function index(Request $request): JsonResponse
    {
        $query = Task::with(['category', 'creator', 'reviewers', 'employees.user', 'departments', 'libraryFiles.file'])
            ->withCount(['employees', 'departments', 'submissions'])
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
        $unitOption = fn ($unit) => ['id' => $unit['id'], 'name' => $unit['label'], 'short_name' => $unit['name'], 'parent_id' => $unit['parent_id'], 'type' => $unit['type']];
        $avatar = fn (?User $u) => $u?->avatar_path ? route('avatars.show', ['filename' => basename($u->avatar_path)]) : null;
        $canAssign = $user->hasPermission('tasks.assign');
        $activeRoles = fn ($q) => $q->where(fn ($r) => $r->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now()));
        $roles = fn (?User $u) => $u ? $u->roles->map(fn ($role) => ['code' => $role->code, 'name' => $role->name, 'department_id' => $role->pivot->department_id])->values() : [];

        return response()->json([
            'categories' => TaskCategory::where('is_active', true)->orderBy('name')->get(['id', 'name', 'description']),
            'filter_categories' => TaskCategory::orderBy('name')->get(['id', 'name']),
            'filter_employees' => Employee::with('user')->where('employment_status', 'working')->when($unitIds !== null, fn ($q) => $q->where(fn ($b) => $b->where('id', $user->employee?->id ?? 0)->orWhere(fn ($m) => $m->inUnits($unitIds))))->get()->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name]),
            'filter_departments' => Department::ordered($unitIds === null ? null : array_values(array_unique([...$unitIds, ...$user->memberUnitIds()])))->map($unitOption)->values(),
            'employees' => $canAssign ? Employee::with(['user.roles' => $activeRoles, 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('employment_status', 'working')->when($unitIds !== null, fn ($q) => $q->inUnits($unitIds))->orderBy('employee_code')->get()->map(fn ($t) => ['id' => $t->id, 'name' => $t->user->name, 'code' => $t->employee_code, 'avatar_url' => $avatar($t->user), 'department_ids' => $t->unitIds(), 'roles' => $roles($t->user)]) : [],
            'departments' => $canAssign ? Department::ordered($unitIds)->map($unitOption)->values() : [],
            'units' => Department::ordered()->map($unitOption)->values(),
            'reviewers' => User::with(['roles' => $activeRoles, 'employee.departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('status', 'active')->orderBy('name')->get()->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'employee_id' => $u->employee?->id, 'avatar_url' => $avatar($u), 'department_ids' => $u->employee?->unitIds() ?? [], 'roles' => $roles($u)]),
            'current_employee' => $user->employee ? ['id' => $user->employee->id, 'user_id' => $user->id, 'name' => $user->name, 'avatar_url' => $avatar($user)] : null,
            'current_user_id' => $user->id,
            'can_assign' => $canAssign,
            'can_browse_library' => $user->hasPermission('library.view'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateTask($request);
        $draft = $this->ownedDraft($request);
        $this->ensureAssignmentScope($request, $data);
        $task = DB::transaction(function () use ($request, $data, $draft) {
            $task = Task::create([...$this->taskAttributes($data), 'code' => $this->nextCode(), 'created_by' => $request->user()->id, 'status' => Task::NOT_STARTED]);
            $this->syncAssignees($task, $data, $request->user());
            $this->syncReviewers($task, $data);
            $this->syncLibraryFiles($request, $task, $data);
            $this->storeAttachments($request, $task);
            if ($draft) {
                $this->consumeDraft($task, $draft);
            }
            $this->recordStatus($task, null, Task::NOT_STARTED, 'Khởi tạo và giao công việc', $request->user());
            $task->updates()->create(['created_by' => $request->user()->id, 'status' => Task::NOT_STARTED, 'content' => 'Đã tạo công việc.']);

            return $task;
        });
        $this->notifyAssignees($task);
        $this->notifyReviewers($task);

        return response()->json(['message' => 'Đã giao công việc thành công.', 'data' => $this->serialize($this->loadTask($task))], 201);
    }

    public function storePersonal(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;
        abort_unless($employee, 422, 'Tài khoản của bạn chưa được liên kết với hồ sơ nhân sự.');
        $request->merge(['employee_ids' => [$employee->id], 'department_ids' => []]);
        $data = $this->validateTask($request);
        $task = DB::transaction(function () use ($request, $data) {
            $task = Task::create([...$this->taskAttributes($data), 'code' => $this->nextCode(), 'created_by' => $request->user()->id, 'status' => Task::NOT_STARTED]);
            $this->syncAssignees($task, $data, $request->user());
            $this->syncReviewers($task, $data);
            $this->syncLibraryFiles($request, $task, $data);
            $this->storeAttachments($request, $task);
            $this->recordStatus($task, null, Task::NOT_STARTED, 'Tự tạo công việc cá nhân', $request->user());
            $task->updates()->create(['created_by' => $request->user()->id, 'status' => Task::NOT_STARTED, 'content' => 'Đã tạo công việc.']);

            return $task;
        });
        $this->notifyReviewers($task);

        return response()->json(['message' => 'Đã tạo công việc cá nhân thành công.', 'data' => $this->serialize($this->loadTask($task))], 201);
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        $this->ensureTaskAccess($request, $task);
        $task = $this->loadTask($task);
        $updates = DB::table('task_updates')->leftJoin('users', 'users.id', '=', 'task_updates.created_by')->where('task_id', $task->id)->whereNotNull('task_updates.content')->latest('task_updates.created_at')->latest('task_updates.id')->select('task_updates.*', 'users.name as creator_name', 'users.avatar_path as creator_avatar_path')->get()->map(function ($update) use ($task, $request) {
            $update->author_role = $this->authorRole($task, (int) $update->created_by);
            $update->kind = Str::startsWith($update->content, self::ACTIVITY_PREFIXES) ? 'activity' : 'comment';
            $update->can_edit = $update->created_by === $request->user()->id && in_array($update->author_role, ['reviewer', 'assigner']);
            $update->creator_avatar_url = $update->creator_avatar_path ? route('avatars.show', ['filename' => basename($update->creator_avatar_path)]) : null;
            unset($update->creator_avatar_path);

            return $update;
        });
        $attachments = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')->where('attachable_type', Task::class)->where('attachable_id', $task->id)->select('files.id', 'files.original_name', 'files.mime_type', 'files.size')->get();
        $canShareSubmissions = $task->status === Task::COMPLETED && $request->user()->hasPermission('library.view');
        $allSubmissions = TaskSubmission::with(['employee.user', 'reviewer:id,name'])->where('task_id', $task->id)->latest('submitted_at')->latest('id')->get();
        [$visible, $hidden] = $allSubmissions->partition(fn (TaskSubmission $submission) => $this->canViewSubmission($request, $task, $submission));
        $hiddenEmployees = $hidden->pluck('employee_id')->filter()->diff([$request->user()->employee?->id])->map(fn ($id) => (int) $id);
        $updates = $updates->reject(fn ($update) => $update->kind === 'comment'
            ? $hidden->contains(fn (TaskSubmission $submission) => $this->isSubmissionCopy($update, $submission))
            : $hiddenEmployees->contains((int) $update->employee_id) && Str::startsWith($update->content, self::SUBMISSION_ACTIVITY))->values();
        $latestSubmission = $allSubmissions->first();
        $submissions = $visible->values()->map(fn (TaskSubmission $submission) => [
            'can_edit' => $this->canEditSubmission($request, $task, $submission),
            'edited_at' => $submission->edited_at?->toIso8601String(),
            'id' => $submission->id,
            'version' => $submission->version,
            'employee_id' => $submission->employee_id,
            'submitter' => $submission->employee?->user?->name,
            'submitter_avatar_url' => $submission->employee?->user?->avatar_path ? route('avatars.show', ['filename' => basename($submission->employee->user->avatar_path)]) : null,
            'result_content' => $submission->result_content,
            'links' => $submission->links ?? [],
            'files' => DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')->where('attachable_type', TaskSubmission::class)->where('attachable_id', $submission->id)->select('files.id', 'files.original_name', 'files.mime_type', 'files.size', 'files.uploaded_by')->get()
                ->map(fn ($file) => [...(array) $file, 'can_share' => $canShareSubmissions && ((int) $file->uploaded_by === $request->user()->id || $request->user()->hasPermission('library.manage'))]),
            'status' => $submission->status,
            'submitted_at' => $submission->submitted_at?->toIso8601String(),
            'review_comment' => $submission->review_comment,
            'reviewed_at' => $submission->reviewed_at?->toIso8601String(),
            'reviewer' => $submission->reviewer?->name,
        ]);

        return response()->json(['data' => [...$this->serialize($task), ...$this->abilities($request, $task), 'creator_card' => $task->creator ? $this->personCard($task->creator) : null, 'reviewer_cards' => $task->reviewers->map(fn (User $u) => $this->personCard($u))->values(), 'description' => $task->description, 'submissions' => $submissions, 'latest_submission' => $latestSubmission && $visible->contains('id', $latestSubmission->id) ? $submissions->first() : null, 'updates' => $updates, 'attachments' => $attachments]]);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canManageTask($request, $task), 403, 'Bạn không được sửa công việc này.');
        $data = $this->validateTask($request);
        $this->ensureAssignmentScope($request, $data);
        $before = $this->taskSnapshot($task);
        $assignedBefore = $this->assigneeUsers($task)->pluck('id')->all();
        $added = DB::transaction(function () use ($request, $data, $task) {
            $task->update($this->taskAttributes($data));
            $this->syncAssignees($task, $data, $request->user());
            $this->syncLibraryFiles($request, $task, $data);
            $this->storeAttachments($request, $task);
            $this->removeAttachments($task, $data['remove_attachment_ids'] ?? []);

            return $this->syncReviewers($task, $data);
        });
        $this->notifyReviewers($task, $added);
        $this->logTaskChanges($request, $task, $before);
        $this->notifyAssignees($task, [...$assignedBefore, $request->user()->id]);

        return response()->json(['message' => 'Đã cập nhật công việc thành công.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function updatePersonal(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->isPersonalTaskFor($request, $task), 403, 'Bạn chỉ được sửa công việc cá nhân do chính mình tạo.');
        $request->merge(['employee_ids' => [$request->user()->employee->id], 'department_ids' => []]);
        $data = $this->validateTask($request);
        $before = $this->taskSnapshot($task);
        $added = DB::transaction(function () use ($request, $data, $task) {
            $task->update($this->taskAttributes($data));
            $this->syncLibraryFiles($request, $task, $data);
            $this->storeAttachments($request, $task);
            $this->removeAttachments($task, $data['remove_attachment_ids'] ?? []);

            return $this->syncReviewers($task, $data);
        });
        $this->notifyReviewers($task, $added);
        $this->logTaskChanges($request, $task, $before);

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
            $started = $old === Task::NOT_STARTED && $data['status'] === Task::IN_PROGRESS;
            $task->updates()->create(['employee_id' => $request->user()->employee?->id, 'created_by' => $request->user()->id, 'status' => $data['status'], 'content' => $data['content'] ?? ($started ? 'Đã bắt đầu thực hiện.' : null)]);
            if ($old !== $data['status']) {
                $this->recordStatus($task, $old, $data['status'], $data['content'] ?? 'Cập nhật trạng thái', $request->user());
            }
        });
        if (! empty($data['content'])) {
            $this->notify($this->reviewersOrCreator($task), $task, $request->user()->name.' đã cập nhật công việc '.$task->title.': '.$data['content'], 'progress_comment', $request->user());
        }

        return response()->json(['message' => 'Đã cập nhật trạng thái công việc.', 'data' => $this->serialize($this->loadTask($task))]);
    }

    public function submitCompletion(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canSubmit($request, $task), 403, 'Bạn không thể gửi đề nghị hoàn thành cho công việc này.');
        $employee = $request->user()->employee;
        $data = $request->validate([
            'comment' => ['nullable', 'string', 'max:3000'],
            'links' => ['nullable', 'array', 'max:20'],
            'links.*' => ['required', 'url:http,https', 'max:2048'],
            'submission_files' => ['nullable', 'array', 'max:20'],
            'submission_files.*' => ['file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,jpg,jpeg,png,zip,rar'],
        ], ['links.*.url' => 'Link “:input” không hợp lệ, cần bắt đầu bằng http:// hoặc https://.']);
        $links = collect($data['links'] ?? [])->filter()->unique()->values()->all();
        abort_if(blank($data['comment'] ?? null) && $links === [] && ! $request->hasFile('submission_files'), 422, 'Cần ít nhất một: file, link hoặc ghi chú.');
        $version = ((int) $task->submissions()->max('version')) + 1;
        $old = $task->status;
        DB::transaction(function () use ($task, $employee, $request, $data, $links, $version, $old) {
            $submission = $task->submissions()->create(['employee_id' => $employee->id, 'version' => $version, 'result_content' => $data['comment'] ?? null, 'links' => $links, 'status' => 'submitted', 'submitted_at' => now()]);
            foreach ($request->file('submission_files', []) as $uploaded) {
                $file = $this->storeFile($uploaded, 'task-submissions', $request->user());
                DB::table('file_attachments')->insert(['file_id' => $file->id, 'attachable_type' => TaskSubmission::class, 'attachable_id' => $submission->id, 'purpose' => 'submission', 'created_at' => now(), 'updated_at' => now()]);
            }
            $task->update(['status' => Task::WAITING_APPROVAL]);
            $task->updates()->create(['employee_id' => $employee->id, 'created_by' => $request->user()->id, 'status' => Task::WAITING_APPROVAL, 'content' => 'Đã gửi bài nộp.']);
            $this->recordStatus($task, $old, Task::WAITING_APPROVAL, 'Gửi đề nghị hoàn thành', $request->user());
        });
        $this->notify(collect([$task->creator])->concat($task->reviewers), $task, $request->user()->name.' đã gửi đề nghị xác nhận hoàn thành: '.$task->title, 'completion_submitted', $request->user());

        return response()->json(['message' => 'Đã gửi đề nghị hoàn thành và thông báo cho người giao việc, người duyệt.']);
    }

    public function updateSubmission(Request $request, Task $task, TaskSubmission $submission): JsonResponse
    {
        abort_unless($submission->task_id === $task->id, 404);
        abort_unless($submission->employee_id && $submission->employee_id === $request->user()->employee?->id, 403, 'Bạn chỉ được sửa bài nộp của chính mình.');
        abort_unless($this->canEditSubmission($request, $task, $submission), 422, 'Bài nộp đã được xử lý, không sửa được nữa.');
        $data = $request->validate([
            'comment' => ['nullable', 'string', 'max:3000'],
            'links' => ['nullable', 'array', 'max:20'],
            'links.*' => ['required', 'url:http,https', 'max:2048'],
            'submission_files' => ['nullable', 'array', 'max:20'],
            'submission_files.*' => ['file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,jpg,jpeg,png,zip,rar'],
            'remove_file_ids' => ['nullable', 'array'],
            'remove_file_ids.*' => ['integer'],
        ], ['links.*.url' => 'Link “:input” không hợp lệ, cần bắt đầu bằng http:// hoặc https://.']);
        $links = collect($data['links'] ?? [])->filter()->unique()->values()->all();
        $attached = DB::table('file_attachments')->where('attachable_type', TaskSubmission::class)->where('attachable_id', $submission->id)->pluck('file_id')->map(fn ($id) => (int) $id);
        $removed = $attached->intersect(collect($data['remove_file_ids'] ?? [])->map(fn ($id) => (int) $id))->values();
        $keepsFiles = $attached->count() > $removed->count() || $request->hasFile('submission_files');
        abort_if(blank($data['comment'] ?? null) && $links === [] && ! $keepsFiles, 422, 'Cần ít nhất một: file, link hoặc ghi chú.');

        DB::transaction(function () use ($request, $task, $submission, $data, $links, $removed) {
            $locked = TaskSubmission::whereKey($submission->id)->lockForUpdate()->first();
            abort_unless($locked->status === 'submitted' && $task->fresh()->status === Task::WAITING_APPROVAL, 422, 'Bài nộp đã được xử lý, không sửa được nữa.');
            $locked->update(['result_content' => $data['comment'] ?? null, 'links' => $links, 'edited_at' => now()]);
            foreach ($request->file('submission_files', []) as $uploaded) {
                $file = $this->storeFile($uploaded, 'task-submissions', $request->user());
                DB::table('file_attachments')->insert(['file_id' => $file->id, 'attachable_type' => TaskSubmission::class, 'attachable_id' => $locked->id, 'purpose' => 'submission', 'created_at' => now(), 'updated_at' => now()]);
            }
            foreach ($removed as $fileId) {
                DB::table('file_attachments')->where('file_id', $fileId)->where('attachable_type', TaskSubmission::class)->where('attachable_id', $locked->id)->delete();
                app(FileStore::class)->releaseIfUnused($fileId);
            }
            $task->updates()->create(['employee_id' => $locked->employee_id, 'created_by' => $request->user()->id, 'status' => Task::WAITING_APPROVAL, 'content' => 'Đã chỉnh sửa bài nộp.']);
        });
        $this->notify(collect([$task->creator])->concat($task->reviewers), $task, $request->user()->name.' đã chỉnh sửa bài nộp: '.$task->title, 'completion_updated', $request->user());

        return response()->json(['message' => 'Đã cập nhật bài nộp và thông báo cho người duyệt.']);
    }

    public function updateSubmissionSharing(Request $request, Task $task): JsonResponse
    {
        abort_unless($this->canManageTask($request, $task), 403, 'Bạn không được đổi cài đặt bài nộp của công việc này.');
        $share = $request->validate(['share_submissions' => ['required', 'boolean']])['share_submissions'];
        if ((bool) $task->share_submissions !== (bool) $share) {
            $task->update(['share_submissions' => $share]);
            $task->updates()->create(['created_by' => $request->user()->id, 'status' => $task->status, 'content' => $share ? 'Đã bật chia sẻ bài nộp giữa người thực hiện.' : 'Đã tắt chia sẻ bài nộp giữa người thực hiện.']);
        }

        return response()->json(['message' => $share ? 'Người thực hiện đã xem được bài nộp của nhau.' : 'Bài nộp giờ chỉ người duyệt và người giao xem được.']);
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
            $task->updates()->create(['employee_id' => $submission?->employee_id, 'created_by' => $request->user()->id, 'status' => $status, 'content' => $approved ? 'Đã xác nhận hoàn thành.' : 'Đã yêu cầu chỉnh sửa bài nộp.']);
            $this->recordStatus($task, Task::WAITING_APPROVAL, $status, $comment ?? ($approved ? 'Xác nhận hoàn thành' : 'Yêu cầu chỉnh sửa'), $request->user());
        });
        $message = $approved ? 'Công việc đã được xác nhận hoàn thành' : 'Công việc được yêu cầu chỉnh sửa';
        $submitter = $submission?->employee?->user;
        $withComment = $task->share_submissions ? $this->assigneeUsers($task) : collect([$submitter]);
        $this->notify($withComment, $task, $message.': '.$task->title.($comment ? '. Nhận xét: '.$comment : ''), $data['decision'], $request->user());
        if (! $task->share_submissions) {
            $this->notify($this->assigneeUsers($task)->reject(fn (User $user) => $user->id === $submitter?->id), $task, $message.': '.$task->title, $data['decision'], $request->user());
        }

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
        $employees = $this->assigneeEmployees($task)->filter(fn (Employee $employee) => filled($employee->user?->email))->values();
        abort_if($employees->isEmpty(), 422, 'Người thực hiện chưa có địa chỉ email hợp lệ.');
        foreach ($employees as $index => $employee) {
            $employee->user->notify((new TaskReminderNotification($task))->delay(now()->addSeconds($index * 5)));
            DB::table('task_reminders')->insert(['task_id' => $task->id, 'employee_id' => $employee->id, 'sent_by' => $request->user()->id, 'email' => $employee->user->email, 'sent_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        }
        $round = (int) DB::table('task_reminders')->where('task_id', $task->id)->selectRaw('COUNT(*) as reminder_count')->groupBy('employee_id')->pluck('reminder_count')->max();

        return response()->json(['message' => 'Đã đưa '.$employees->count().' email nhắc việc vào hàng chờ.', 'queued_count' => $employees->count(), 'reminder_count' => $round]);
    }

    public function viewLibraryFile(Request $request, Task $task, LibraryNode $node)
    {
        $this->ensureTaskAccess($request, $task);
        abort_unless($task->libraryFiles()->where('library_nodes.id', $node->id)->exists(), 404);
        $node->loadMissing('file');
        abort_unless($node->file && Storage::disk($node->file->disk)->exists($node->file->path), 404, 'File không tồn tại.');

        return Storage::disk($node->file->disk)->response($node->file->path, $node->name, ['Content-Type' => $node->file->mime_type ?: 'application/octet-stream'], 'inline');
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
        abort_unless($this->canViewSubmission($request, $task, $submission), 403, 'Bài nộp này chỉ người duyệt và người giao xem được.');
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
        $task->updates()->create(['employee_id' => $isAssignee ? $request->user()->employee->id : null, 'created_by' => $request->user()->id, 'status' => $task->status, 'content' => $data['content']]);
        $recipients = $isAssignee ? $this->reviewersOrCreator($task) : $this->assigneeUsers($task);
        $this->notify($recipients, $task, $request->user()->name.' đã gửi nhận xét về công việc '.$task->title.': '.$data['content'], 'task_comment', $request->user());

        return response()->json(['message' => 'Đã lưu nhận xét và gửi thông báo.']);
    }

    private function validateTask(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:'.Task::TITLE_MAX],
            'description' => ['nullable', 'string'],
            'category_id' => ['nullable', Rule::exists('task_categories', 'id')->where('is_active', true)],
            'reviewer_ids' => ['nullable', 'array', 'max:10'],
            'reviewer_ids.*' => ['integer', 'distinct', Rule::exists('users', 'id')->where('status', 'active')],
            'priority' => ['required', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'share_submissions' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'due_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'employee_ids' => ['required_without:department_ids', 'array'],
            'employee_ids.*' => ['integer', 'exists:employees,id'],
            'department_ids' => ['required_without:employee_ids', 'array'],
            'department_ids.*' => ['integer', 'exists:departments,id'],
            'library_file_ids' => ['nullable', 'array'],
            'library_file_ids.*' => ['integer', Rule::exists('library_nodes', 'id')->where('type', LibraryNode::FILE)],
            'attachments' => ['nullable', 'array'],
            'attachments.*' => ['file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png,zip'],
            'remove_attachment_ids' => ['nullable', 'array'],
            'remove_attachment_ids.*' => ['integer', 'exists:files,id'],
        ], ['title.max' => 'Tên công việc tối đa '.Task::TITLE_MAX.' ký tự.']);
        $reviewerIds = collect($data['reviewer_ids'] ?? [])->map(fn ($id) => (int) $id);
        abort_if($reviewerIds->contains($request->user()->id) && in_array($request->user()->employee?->id, array_map('intval', $data['employee_ids'] ?? []), true), 422, 'Bạn không thể tự duyệt công việc của chính mình.');
        abort_if($reviewerIds->isNotEmpty() && Employee::whereIn('id', $data['employee_ids'] ?? [])->whereIn('user_id', $reviewerIds)->exists(), 422, 'Người duyệt không được đồng thời là người thực hiện được chọn.');

        return $data;
    }

    private function taskAttributes(array $data): array
    {
        return collect($data)->only(['title', 'description', 'category_id', 'priority', 'share_submissions', 'starts_at', 'due_at'])->all();
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
            ->whereHas('employees', fn ($t) => $t->where('employees.id', $user->employee?->id ?? 0))
            ->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $units ?: [0]))
            ->when($managed, fn ($b) => $b->orWhereHas('employees', fn ($t) => $t->inUnits($managed)))
            ->orWhere('created_by', $user->id)
            ->orWhereHas('reviewers', fn ($r) => $r->where('users.id', $user->id)));
    }

    private function ensureAssignmentScope(Request $request, array $data): void
    {
        $unitIds = $request->user()->managedUnitIds();
        if ($unitIds === null) {
            return;
        }
        $requestedUnits = collect($data['department_ids'] ?? [])->map(fn ($id) => (int) $id);
        abort_if($requestedUnits->diff($unitIds)->isNotEmpty(), 403, 'Bạn chỉ được giao việc trong đơn vị mình quản lý.');
        $employeeIds = collect($data['employee_ids'] ?? [])->map(fn ($id) => (int) $id);
        if ($employeeIds->isNotEmpty()) {
            abort_if($employeeIds->diff(Employee::inUnits($unitIds)->pluck('id'))->isNotEmpty(), 403, 'Bạn chỉ được giao việc cho nhân sự trong đơn vị mình quản lý.');
        }
    }

    private function abilities(Request $request, Task $task): array
    {
        return [
            'is_reviewer' => $this->isReviewer($task, $request->user()->id),
            'is_personal' => $this->isPersonal($task),
            'can_manage' => $this->canManageTask($request, $task),
            'can_view_all_submissions' => $this->canViewAllSubmissions($request, $task),
            'can_edit_personal' => $this->isPersonalTaskFor($request, $task),
            'can_update_progress' => $this->canUpdateProgress($request, $task),
            'can_submit_completion' => $this->canSubmit($request, $task),
            'can_review_completion' => $this->canReviewTask($request, $task),
            'can_self_complete' => $this->canSelfComplete($request, $task),
            'can_cancel' => $this->canCancel($request, $task),
        ];
    }

    private function taskSnapshot(Task $task): array
    {
        $task->refresh()->load(['employees.user', 'departments', 'reviewers', 'libraryFiles', 'category']);
        $attachments = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')
            ->where('attachable_type', Task::class)->where('attachable_id', $task->id)->pluck('files.original_name', 'files.id');

        return [
            'title' => $task->title,
            'description' => trim((string) $task->description),
            'starts_at' => $task->starts_at?->format('H:i d/m/Y'),
            'due_at' => $task->due_at?->format('H:i d/m/Y'),
            'priority' => $task->priority,
            'category' => $task->category?->name,
            'share' => (bool) $task->share_submissions,
            'assignees' => [
                ...$task->departments->mapWithKeys(fn ($unit) => ['u'.$unit->id => $unit->name])->all(),
                ...$task->employees->mapWithKeys(fn (Employee $employee) => ['t'.$employee->id => $employee->user?->name])->all(),
            ],
            'reviewers' => $task->reviewers->mapWithKeys(fn (User $user) => [$user->id => $user->name])->all(),
            'files' => [
                ...$task->libraryFiles->mapWithKeys(fn (LibraryNode $node) => ['l'.$node->id => $node->name])->all(),
                ...$attachments->mapWithKeys(fn ($name, $id) => ['a'.$id => $name])->all(),
            ],
        ];
    }

    private function logTaskChanges(Request $request, Task $task, array $before): void
    {
        $after = $this->taskSnapshot($task);
        $changes = [];
        $moved = fn (?string $from, ?string $to, string $empty) => ($from ?? $empty).' → '.($to ?? $empty);
        if ($before['title'] !== $after['title']) {
            $changes[] = 'đổi tên thành “'.$after['title'].'”';
        }
        if ($before['due_at'] !== $after['due_at']) {
            $changes[] = 'hạn '.$moved($before['due_at'], $after['due_at'], 'không thời hạn');
        }
        if ($before['starts_at'] !== $after['starts_at']) {
            $changes[] = 'bắt đầu '.$moved($before['starts_at'], $after['starts_at'], 'chưa đặt');
        }
        if ($before['priority'] !== $after['priority']) {
            $changes[] = 'ưu tiên '.(self::PRIORITY_LABELS[$before['priority']] ?? $before['priority']).' → '.(self::PRIORITY_LABELS[$after['priority']] ?? $after['priority']);
        }
        if ($before['category'] !== $after['category']) {
            $changes[] = 'loại '.$moved($before['category'], $after['category'], 'không phân loại');
        }
        foreach (['assignees' => 'người thực hiện', 'reviewers' => 'người duyệt', 'files' => 'file'] as $key => $label) {
            $addedNames = array_values(array_diff_key($after[$key], $before[$key]));
            $removedNames = array_values(array_diff_key($before[$key], $after[$key]));
            if ($addedNames) {
                $changes[] = 'thêm '.$label.' '.$this->nameList($addedNames);
            }
            if ($removedNames) {
                $changes[] = 'bỏ '.$label.' '.$this->nameList($removedNames);
            }
        }
        if ($before['description'] !== $after['description']) {
            $changes[] = 'sửa mô tả';
        }
        if ($before['share'] !== $after['share']) {
            $changes[] = $after['share'] ? 'bật xem chéo bài nộp' : 'tắt xem chéo bài nộp';
        }
        if (! $changes) {
            return;
        }
        $task->updates()->create(['created_by' => $request->user()->id, 'status' => $task->status, 'content' => 'Đã cập nhật công việc: '.implode(' · ', $changes).'.']);
        if ($before['due_at'] !== $after['due_at'] && ! $this->isPersonal($task)) {
            $this->notify($this->assigneeUsers($task), $task, $request->user()->name.' đã đổi hạn công việc '.$task->title.': '.($after['due_at'] ?? 'không thời hạn').'.', 'due_changed', $request->user());
        }
    }

    private function nameList(array $names): string
    {
        $names = array_filter($names);

        return count($names) > 3 ? implode(', ', array_slice($names, 0, 3)).' và '.(count($names) - 3).' mục khác' : implode(', ', $names);
    }

    private function canViewAllSubmissions(Request $request, Task $task): bool
    {
        return $task->share_submissions
            || $task->created_by === $request->user()->id
            || $this->isReviewer($task, $request->user()->id)
            || $this->hasSchoolWideTaskAuthority($request);
    }

    private function canViewSubmission(Request $request, Task $task, TaskSubmission $submission): bool
    {
        return $this->canViewAllSubmissions($request, $task) || ($submission->employee_id !== null && $submission->employee_id === $request->user()->employee?->id);
    }

    private function isSubmissionCopy(object $update, TaskSubmission $submission): bool
    {
        if ((int) $update->employee_id !== (int) $submission->employee_id) {
            return false;
        }
        $at = Carbon::parse($update->created_at);

        return collect([$submission->submitted_at, $submission->reviewed_at])->filter()->contains(fn ($moment) => abs($moment->diffInSeconds($at)) <= 5);
    }

    private function canManageTask(Request $request, Task $task): bool
    {
        if ($this->isPersonal($task) || ! $request->user()->hasPermission('tasks.assign')) {
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
        if (! $this->canUpdateProgress($request, $task) || $this->isReviewer($task, $request->user()->id)) {
            return false;
        }

        return ! ($this->isPersonal($task) && ! $this->hasReviewers($task));
    }

    private function canEditSubmission(Request $request, Task $task, TaskSubmission $submission): bool
    {
        return $submission->status === 'submitted'
            && $task->status === Task::WAITING_APPROVAL
            && $submission->employee_id !== null
            && $submission->employee_id === $request->user()->employee?->id
            && ! $task->submissions()->where('version', '>', $submission->version)->exists();
    }

    private function canReviewTask(Request $request, Task $task): bool
    {
        if ($task->status !== Task::WAITING_APPROVAL) {
            return false;
        }
        if ($this->isReviewer($task, $request->user()->id)) {
            return true;
        }
        if ($this->isPersonalTaskFor($request, $task)) {
            return false;
        }

        return $task->created_by === $request->user()->id || $this->hasSchoolWideTaskAuthority($request);
    }

    private function canSelfComplete(Request $request, Task $task): bool
    {
        return $this->isPersonalTaskFor($request, $task) && ! $this->hasReviewers($task) && ! in_array($task->status, Task::CLOSED, true);
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
        $employeeId = $user->employee?->id ?? 0;

        return $query->where('status', Task::WAITING_APPROVAL)
            ->where(fn ($q) => $q->whereHas('reviewers', fn ($r) => $r->where('users.id', $user->id))->orWhere(function ($b) use ($user, $employeeId, $request) {
                $b->whereNot(fn ($own) => $own->where('created_by', $user->id)->doesntHave('departments')->whereHas('employees', fn ($t) => $t->where('employees.id', $employeeId))->has('employees', '=', 1));
                if (! $this->hasSchoolWideTaskAuthority($request)) {
                    $b->where('created_by', $user->id);
                }
            }));
    }

    private function isTaskAssignee(Request $request, Task $task): bool
    {
        $employee = $request->user()->employee;
        if (! $employee) {
            return false;
        }
        $task->loadMissing(['employees', 'departments']);
        if ($task->employees->contains('id', $employee->id)) {
            return true;
        }

        return $task->departments->pluck('id')->intersect($employee->unitIds())->isNotEmpty();
    }

    private function hasSchoolWideTaskAuthority(Request $request): bool
    {
        return $request->user()->isSchoolWide() && $request->user()->hasPermission('tasks.assign');
    }

    private function isPersonal(Task $task): bool
    {
        $task->loadMissing(['employees', 'departments', 'creator.employee']);

        return $task->departments->isEmpty()
            && $task->employees->count() === 1
            && $task->employees->first()->id === $task->creator?->employee?->id;
    }

    private function isPersonalTaskFor(Request $request, Task $task): bool
    {
        return $task->created_by === $request->user()->id && $this->isPersonal($task);
    }

    private function authorRole(Task $task, int $userId): string
    {
        return $this->isReviewer($task, $userId) ? 'reviewer' : ($userId === $task->created_by ? 'assigner' : 'assignee');
    }

    private function personCard(User $user): array
    {
        $role = $user->activeRoles()->sortBy(fn (Role $r) => Role::rank($r->code))->first();
        $unit = $role?->pivot->department_id ? Department::find($role->pivot->department_id)?->name : null;

        return [
            'id' => $user->id, 'name' => $user->name,
            'avatar_url' => $user->avatar_path ? route('avatars.show', ['filename' => basename($user->avatar_path)]) : null,
            'role' => $role ? $role->name.($unit ? ' · '.$unit : '') : null,
        ];
    }

    private function isReviewer(Task $task, int $userId): bool
    {
        $task->loadMissing('reviewers');

        return $task->reviewers->contains('id', $userId);
    }

    private function hasReviewers(Task $task): bool
    {
        $task->loadMissing('reviewers');

        return $task->reviewers->isNotEmpty();
    }

    private function reviewersOrCreator(Task $task): Collection
    {
        $task->loadMissing(['reviewers', 'creator']);

        return $task->reviewers->isNotEmpty() ? $task->reviewers : collect([$task->creator]);
    }

    private function syncReviewers(Task $task, array $data): array
    {
        $changes = $task->reviewers()->sync(collect($data['reviewer_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values()->all());
        $task->unsetRelation('reviewers');

        return $changes['attached'];
    }

    private function assigneeEmployees(Task $task): Collection
    {
        $task->loadMissing(['employees.user', 'employees.departments', 'departments']);
        $employees = $task->employees;
        if ($task->departments->isNotEmpty()) {
            $employees = $employees->concat(Employee::with(['user', 'departments'])->where('employment_status', 'working')->inUnits($task->departments->pluck('id'))->whereNotIn('id', $employees->pluck('id'))->get());
        }

        return $employees->unique('id')->values();
    }

    private function assigneeUsers(Task $task): Collection
    {
        return $this->assigneeEmployees($task)->pluck('user')->filter()->values();
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

    private function notifyAssignees(Task $task, array $exceptIds = []): void
    {
        $this->assigneeUsers($task)->unique('id')->reject(fn (User $user) => in_array($user->id, $exceptIds, true))->each(function (User $user) use ($task) {
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

    private function notifyReviewers(Task $task, ?array $onlyIds = null): void
    {
        $task->loadMissing('reviewers');
        $assignees = $this->assigneeUsers($task)->pluck('id');
        $recipients = $task->reviewers->filter(fn (User $u) => ($onlyIds === null || in_array($u->id, $onlyIds, true)) && ! $assignees->contains($u->id));
        $this->notify($recipients->values(), $task, 'Bạn được chỉ định duyệt công việc: '.$task->title, 'reviewer_assigned');
    }

    private function syncAssignees(Task $task, array $data, User $actor): void
    {
        $existing = $task->employees()->pluck('employees.id')->all();
        $employeeData = [];
        foreach ($data['employee_ids'] ?? [] as $id) {
            $employeeData[$id] = in_array((int) $id, $existing, true) ? [] : ['assigned_by' => $actor->id, 'assigned_at' => now()];
        }
        $departmentData = [];
        foreach ($data['department_ids'] ?? [] as $id) {
            $departmentData[$id] = ['assigned_by' => $actor->id];
        }
        $task->employees()->sync($employeeData);
        $task->departments()->sync($departmentData);
    }

    private function storeFile($uploaded, string $folder, User $actor): StoredFile
    {
        return app(FileStore::class)->store($uploaded, $folder, $actor);
    }

    private function syncLibraryFiles(Request $request, Task $task, array $data): void
    {
        $ids = collect($data['library_file_ids'] ?? [])->map(fn ($id) => (int) $id)->unique();
        $existing = $task->exists ? $task->libraryFiles()->pluck('library_nodes.id') : collect();
        $added = $ids->diff($existing);
        $access = new LibraryAccess($request->user());
        $allowed = $added->isEmpty() ? collect() : LibraryNode::whereIn('id', $added)->where('type', LibraryNode::FILE)->get()->filter(fn (LibraryNode $node) => $access->can($node, LibraryAccess::READ))->pluck('id');
        abort_if($added->diff($allowed)->isNotEmpty(), 422, 'Chỉ gắn được file trong Kho dữ liệu mà bạn có quyền xem.');
        $task->libraryFiles()->sync($ids->all());
    }

    private function ownedDraft(Request $request): ?TaskDraft
    {
        $id = $request->validate(['draft_id' => ['nullable', 'integer']])['draft_id'] ?? null;
        if (! $id) {
            return null;
        }
        $draft = TaskDraft::with('batch.sources.node')->find($id);
        abort_unless($draft && $draft->batch->created_by === $request->user()->id, 404, 'Bản nháp không còn tồn tại.');

        return $draft;
    }

    private function consumeDraft(Task $task, TaskDraft $draft): void
    {
        $batch = $draft->batch;
        $wanted = collect($draft->payload['source_ids'] ?? null);
        $sources = $batch->sources->when(array_key_exists('source_ids', $draft->payload), fn ($all) => $all->whereIn('id', $wanted));
        foreach ($sources as $source) {
            if ($source->file_id && ! DB::table('file_attachments')->where('attachable_type', Task::class)->where('attachable_id', $task->id)->where('file_id', $source->file_id)->exists()) {
                DB::table('file_attachments')->insert(['file_id' => $source->file_id, 'attachable_type' => Task::class, 'attachable_id' => $task->id, 'purpose' => 'attachment', 'created_at' => now(), 'updated_at' => now()]);
            }
            if ($source->node) {
                $task->libraryFiles()->syncWithoutDetaching([$source->node->id]);
            }
        }
        $draft->delete();
        if (! $batch->drafts()->exists()) {
            $batch->delete();
        }
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
            DB::table('file_attachments')->where('file_id', $file->id)->where('attachable_type', Task::class)->where('attachable_id', $task->id)->delete();
            app(FileStore::class)->releaseIfUnused($file->id);
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
        return $task->load(['category', 'creator.employee', 'reviewers', 'employees.user', 'departments', 'libraryFiles.file'])->loadCount(['employees', 'departments', 'submissions']);
    }

    private function serialize(Task $task): array
    {
        $assignees = $this->assigneeEmployees($task);
        $reminders = DB::table('task_reminders')->where('task_id', $task->id)->select('employee_id', DB::raw('COUNT(*) as reminder_count'), DB::raw('MAX(sent_at) as last_reminded_at'))->groupBy('employee_id')->get()->keyBy('employee_id');
        $latest = $task->submissions()->latest('submitted_at')->latest('id')->first(['status', 'submitted_at']);
        $finishedAt = $task->status === Task::COMPLETED ? ($latest?->submitted_at ?? $task->completed_at) : null;

        return [
            'id' => $task->id, 'code' => $task->code, 'title' => $task->title,
            'category_id' => $task->category_id, 'category' => $task->category?->name,
            'priority' => $task->priority, 'status' => $task->status, 'share_submissions' => (bool) $task->share_submissions,
            'needs_revision' => $task->status === Task::IN_PROGRESS && $latest?->status === 'revision_required',
            'starts_at' => $task->starts_at?->format('Y-m-d\TH:i'), 'due_at' => $task->due_at?->format('Y-m-d\TH:i'),
            'completed_at' => $task->completed_at?->toIso8601String(),
            'finished_at' => $finishedAt?->toIso8601String(),
            'created_at' => $task->created_at?->toIso8601String(),
            'reviewer_ids' => $task->reviewers->pluck('id')->values(),
            'reviewers' => $task->reviewers->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->values(),
            'created_by' => $task->created_by, 'creator' => $task->creator?->name,
            'employee_ids' => $task->employees->pluck('id'), 'department_ids' => $task->departments->pluck('id'),
            'library_file_ids' => $task->libraryFiles->pluck('id'),
            'library_files' => $task->libraryFiles->map(fn (LibraryNode $node) => ['id' => $node->id, 'name' => $node->name, 'size' => $node->file?->size, 'mime_type' => $node->file?->mime_type, 'download_url' => route('tasks.library-file', ['task' => $task->id, 'node' => $node->id])])->values(),
            'assignees' => $assignees->map(fn (Employee $t) => ['id' => $t->id, 'name' => $t->user->name, 'avatar_url' => $t->user->avatar_path ? route('avatars.show', ['filename' => basename($t->user->avatar_path)]) : null, 'direct' => $task->employees->contains('id', $t->id), 'reminder_count' => (int) ($reminders->get($t->id)?->reminder_count ?? 0), 'last_reminded_at' => $reminders->get($t->id)?->last_reminded_at])->values(),
            'departments' => $task->departments->map(fn ($d) => Department::pathLabel($d->id))->values(),
            'units' => $task->departments->map(fn ($d) => [
                'id' => $d->id, 'name' => Department::pathLabel($d->id), 'short_name' => $d->name,
                'members' => $assignees->filter(fn (Employee $t) => in_array($d->id, $t->unitIds(), true))->map(fn (Employee $t) => ['id' => $t->id, 'name' => $t->user->name])->values(),
            ])->values(),
            'assignee_count' => $assignees->count(), 'department_count' => $task->departments->count(),
            'submission_count' => $task->submissions_count ?? $task->submissions()->count(),
            'is_overdue' => $task->due_at?->isPast() && in_array($task->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true),
            'is_late' => $finishedAt !== null && $task->due_at !== null && $finishedAt->gt($task->due_at),
        ];
    }
}
