<?php

namespace App\Services;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Evaluation;
use App\Models\EvaluationCriterion;
use App\Models\EvaluationPeriod;
use App\Models\EvaluationTemplate;
use App\Models\LeaveRecord;
use App\Models\LibraryNode;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AssistantTools
{
    public const LIMIT = 20;

    public const TASK_STATUSES = [
        Task::NOT_STARTED => 'Chưa thực hiện', Task::IN_PROGRESS => 'Đang thực hiện', Task::WAITING_APPROVAL => 'Chờ duyệt',
        Task::COMPLETED => 'Hoàn thành', Task::CANCELLED => 'Đã hủy',
    ];

    public const PRIORITIES = ['low' => 'Thấp', 'normal' => 'Bình thường', 'high' => 'Cao', 'urgent' => 'Khẩn'];

    public const EMPLOYMENT = ['working' => 'Đang làm việc', 'on_leave' => 'Nghỉ phép', 'suspended' => 'Tạm nghỉ', 'terminated' => 'Đã nghỉ việc'];

    private const EVALUATION_STATUSES = [
        Evaluation::DRAFT => 'Chưa nộp', Evaluation::SUBMITTED => 'Đã nộp', Evaluation::UNIT_SCORED => 'Tổ đã chấm', Evaluation::PUBLISHED => 'Đã công bố',
    ];

    private const PERIOD_STATUSES = [EvaluationPeriod::OPEN => 'Đang chấm', EvaluationPeriod::DISCLOSED => 'Đã gửi kết quả dự kiến', EvaluationPeriod::PUBLISHED => 'Đã công bố'];

    private const DENIED = 'Người hỏi không có quyền xem dữ liệu này trên hệ thống.';

    private ?EvaluationAccess $evaluationAccess = null;

    private array $criteria = [];

    public function __construct(private User $user, private EvaluationScoring $scoring) {}

    public static function definitions(): array
    {
        $string = ['type' => ['string', 'null']];
        $integer = ['type' => ['integer', 'null']];
        $tool = fn (string $name, string $description, array $properties) => [
            'type' => 'function', 'name' => $name, 'description' => $description, 'strict' => true,
            'parameters' => ['type' => 'object', 'properties' => (object) $properties, 'required' => array_keys($properties), 'additionalProperties' => false],
        ];

        return [
            $tool('search_tasks', 'Tìm công việc người hỏi được xem. Trả về tối đa 20 việc và tổng số khớp.', [
                'search' => [...$string, 'description' => 'Từ khóa trong mã CV hoặc tên việc'],
                'status' => ['type' => ['string', 'null'], 'enum' => [...array_keys(self::TASK_STATUSES), 'open', null], 'description' => 'open = chưa xong (chưa thực hiện, đang thực hiện, chờ duyệt)'],
                'overdue' => ['type' => ['boolean', 'null'], 'description' => 'true = chỉ việc đã quá hạn mà chưa nộp'],
                'unit' => [...$string, 'description' => 'Tên tổ/nhóm được giao'],
                'person' => [...$string, 'description' => 'Tên người thực hiện'],
                'due_within_days' => [...$integer, 'description' => 'Chỉ việc chưa xong có hạn trong N ngày tới'],
            ]),
            $tool('task_detail', 'Chi tiết một công việc theo mã CV (mô tả, mốc thời gian, người làm, người duyệt, file đính kèm, tiến độ).', [
                'code' => ['type' => 'string', 'description' => 'Mã công việc, ví dụ CV-2610-0197'],
            ]),
            $tool('school_snapshot', 'Số liệu tổng về công việc trong phạm vi người hỏi được xem.', []),
            $tool('unit_overview', 'Danh sách tổ/nhóm kèm mô tả, sĩ số, số việc đang mở và quá hạn.', [
                'unit' => [...$string, 'description' => 'Tên tổ/nhóm cần xem; null = tất cả'],
            ]),
            $tool('search_people', 'Tra cứu nhân sự: họ tên, mã, vai trò, tổ/nhóm, trạng thái, GVCN, ngày vào trường, trình độ. Không có thông tin liên hệ.', [
                'search' => [...$string, 'description' => 'Tên hoặc mã nhân sự'],
                'unit' => [...$string, 'description' => 'Tên tổ/nhóm'],
                'role' => [...$string, 'description' => 'Tên vai trò, ví dụ Tổ trưởng, Giáo viên chủ nhiệm'],
                'status' => ['type' => ['string', 'null'], 'enum' => [...array_keys(self::EMPLOYMENT), null]],
            ]),
            $tool('people_workload', 'Khối lượng công việc theo người: số việc đang mở, đã xong, quá hạn.', [
                'person' => [...$string, 'description' => 'Tên người cần xem; null = nhiều người nhất'],
                'unit' => [...$string, 'description' => 'Tên tổ/nhóm'],
            ]),
            $tool('evaluation_status', 'Tình hình kỳ đánh giá thi đua một tháng: trạng thái kỳ, hạn chấm, số phiếu theo từng trạng thái.', [
                'month' => [...$string, 'description' => 'Tháng dạng YYYY-MM; null = kỳ gần nhất'],
            ]),
            $tool('evaluation_scores', 'Điểm thi đua từng phiếu trong một tháng: điểm tự chấm, điểm chốt, xếp loại, vi phạm.', [
                'month' => [...$string, 'description' => 'Tháng dạng YYYY-MM; null = kỳ gần nhất'],
                'person' => [...$string, 'description' => 'Tên người'],
                'unit' => [...$string, 'description' => 'Tên tổ/nhóm'],
                'grade' => [...$string, 'description' => 'Tên xếp loại, ví dụ Xuất sắc'],
            ]),
            $tool('leave_summary', 'Ai nghỉ trong một khoảng ngày (loại nghỉ, ngày, buổi).', [
                'from' => [...$string, 'description' => 'Từ ngày YYYY-MM-DD; null = hôm nay'],
                'to' => [...$string, 'description' => 'Đến ngày YYYY-MM-DD; null = bằng from'],
                'person' => [...$string, 'description' => 'Tên người'],
            ]),
            $tool('search_library', 'Tìm file/thư mục trong Kho dữ liệu theo tên. Chỉ trả tên, vị trí, dung lượng, chủ sở hữu, ngày cập nhật — không đọc nội dung file.', [
                'query' => ['type' => 'string', 'description' => 'Từ khóa trong tên file/thư mục'],
                'type' => ['type' => ['string', 'null'], 'enum' => ['file', 'folder', null]],
            ]),
        ];
    }

    public function run(string $name, array $args): array
    {
        $args = array_map(fn ($value) => is_string($value) ? (trim($value) === '' ? null : trim($value)) : $value, $args);

        return match ($name) {
            'search_tasks' => $this->searchTasks($args),
            'task_detail' => $this->taskDetail($args),
            'school_snapshot' => $this->schoolSnapshot(),
            'unit_overview' => $this->unitOverview($args),
            'search_people' => $this->searchPeople($args),
            'people_workload' => $this->peopleWorkload($args),
            'evaluation_status' => $this->evaluationStatus($args),
            'evaluation_scores' => $this->evaluationScores($args),
            'leave_summary' => $this->leaveSummary($args),
            'search_library' => $this->searchLibrary($args),
            default => ['error' => 'Không có công cụ này.'],
        };
    }

    public function scopeLabel(): string
    {
        $units = $this->user->managedUnitIds();

        if ($units === null) {
            return 'toàn trường';
        }
        $tops = Department::whereIn('id', $units)->get(['id', 'parent_id'])->reject(fn (Department $unit) => in_array($unit->parent_id, $units, true));

        return $tops->isEmpty() ? 'cá nhân' : 'tổ/nhóm phụ trách: '.$tops->map(fn (Department $unit) => Department::pathLabel($unit->id))->join(', ');
    }

    private function searchTasks(array $args): array
    {
        if (! $this->user->hasPermission('tasks.view')) {
            return ['error' => self::DENIED];
        }
        $query = $this->visibleTasks();
        if ($args['search'] ?? null) {
            $query->where(fn ($q) => $q->where('code', 'like', "%{$args['search']}%")->orWhere('title', 'like', "%{$args['search']}%"));
        }
        $status = $args['status'] ?? null;
        if ($status === 'open') {
            $query->whereIn('status', Task::OPEN);
        } elseif ($status) {
            $query->where('status', $status);
        }
        if ($args['overdue'] ?? false) {
            $query->whereIn('status', [Task::NOT_STARTED, Task::IN_PROGRESS])->where('due_at', '<', now());
        }
        if ($days = $args['due_within_days'] ?? null) {
            $query->whereIn('status', Task::OPEN)->whereBetween('due_at', [now(), now()->addDays(min(max((int) $days, 1), 90))]);
        }
        if ($args['unit'] ?? null) {
            $units = $this->matchUnits($args['unit']);
            if (! $units) {
                return ['error' => "Không tìm thấy tổ/nhóm “{$args['unit']}”."];
            }
            $query->where(fn ($q) => $q->whereHas('departments', fn ($d) => $d->whereIn('departments.id', $units))->orWhereHas('employees', fn ($e) => $e->inUnits($units)));
        }
        if ($args['person'] ?? null) {
            $query->whereHas('employees.user', fn ($u) => $u->where('name', 'like', "%{$args['person']}%"));
        }
        $total = (clone $query)->count();
        $tasks = $query->with(['employees.user:id,name', 'departments:id,name', 'reviewers:id,name', 'category:id,name'])
            ->orderByRaw($status === 'open' || ($args['overdue'] ?? false) || ($args['due_within_days'] ?? null) ? 'due_at IS NULL, due_at' : 'created_at DESC')
            ->limit(self::LIMIT)->get();

        return ['total' => $total, 'shown' => $tasks->count(), 'tasks' => $tasks->map(fn (Task $task) => $this->taskRow($task))->all()];
    }

    private function taskDetail(array $args): array
    {
        if (! $this->user->hasPermission('tasks.view')) {
            return ['error' => self::DENIED];
        }
        $task = $this->visibleTasks()->where('code', strtoupper((string) ($args['code'] ?? '')))
            ->with(['employees.user:id,name', 'departments:id,name', 'reviewers:id,name', 'category:id,name', 'creator:id,name', 'libraryFiles:id,name'])
            ->withCount('submissions')->first();
        if (! $task) {
            return ['error' => 'Không tìm thấy công việc này trong phạm vi người hỏi được xem.'];
        }
        $attachments = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')
            ->where('attachable_type', Task::class)->where('attachable_id', $task->id)->pluck('files.original_name');
        $updates = $task->updates()->latest()->limit(5)->get(['status', 'content', 'created_at'])
            ->map(fn ($update) => ['at' => $update->created_at?->format('Y-m-d H:i'), 'status' => self::TASK_STATUSES[$update->status] ?? $update->status, 'note' => Str::limit($this->plain($update->content), 300)]);

        return [
            ...$this->taskRow($task),
            'description' => Str::limit($this->plain($task->description), 2000),
            'requirements' => Str::limit($this->plain($task->requirements), 1000) ?: null,
            'created_by' => $task->creator?->name,
            'created_at' => $task->created_at?->format('Y-m-d'),
            'submissions' => $task->submissions_count,
            'attachments' => $attachments->all(),
            'library_files' => $task->libraryFiles->pluck('name')->all(),
            'recent_updates' => $updates->all(),
        ];
    }

    private function schoolSnapshot(): array
    {
        if (! $this->user->hasPermission('tasks.view')) {
            return ['error' => self::DENIED];
        }
        $base = $this->visibleTasks();
        $open = [Task::NOT_STARTED, Task::IN_PROGRESS];

        return [
            'scope' => $this->scopeLabel(),
            'total' => (clone $base)->count(),
            'by_status' => collect(self::TASK_STATUSES)->mapWithKeys(fn ($label, $status) => [$label => (clone $base)->where('status', $status)->count()])->all(),
            'overdue' => (clone $base)->whereIn('status', $open)->where('due_at', '<', now())->count(),
            'due_within_3_days' => (clone $base)->whereIn('status', $open)->whereBetween('due_at', [now(), now()->addDays(3)])->count(),
            'completed_this_month' => (clone $base)->where('status', Task::COMPLETED)->where('completed_at', '>=', now()->startOfMonth())->count(),
        ];
    }

    private function unitOverview(array $args): array
    {
        if (! $this->user->hasPermission('personnel.view')) {
            return ['error' => self::DENIED];
        }
        $units = Department::ordered($this->user->managedUnitIds());
        if ($args['unit'] ?? null) {
            $ids = $this->matchUnits($args['unit']);
            $units = $units->filter(fn ($unit) => in_array($unit['id'], $ids, true));
        }
        if ($units->isEmpty()) {
            return ['error' => 'Không có tổ/nhóm phù hợp trong phạm vi người hỏi.'];
        }
        $descriptions = Department::whereIn('id', $units->pluck('id'))->pluck('description', 'id');
        $members = DB::table('department_employee')->whereNull('ends_on')->get(['employee_id', 'department_id']);

        return ['units' => $units->values()->map(function ($unit) use ($descriptions, $members) {
            $scope = Department::withDescendants([$unit['id']]);
            $tasks = $this->visibleTasks()->where(fn ($q) => $q->whereHas('departments', fn ($d) => $d->whereIn('departments.id', $scope))->orWhereHas('employees', fn ($e) => $e->inUnits($scope)));

            return array_filter([
                'name' => $unit['label'], 'type' => $unit['type'] === Department::TYPE_TO ? 'Tổ' : 'Nhóm',
                'description' => $descriptions[$unit['id']] ?? null,
                'members' => $members->whereIn('department_id', $scope)->pluck('employee_id')->unique()->count(),
                'open_tasks' => (clone $tasks)->whereIn('status', Task::OPEN)->count(),
                'overdue_tasks' => (clone $tasks)->whereIn('status', [Task::NOT_STARTED, Task::IN_PROGRESS])->where('due_at', '<', now())->count(),
            ], fn ($value) => $value !== null);
        })->all()];
    }

    private function searchPeople(array $args): array
    {
        if (! $this->user->hasPermission('personnel.view')) {
            return ['error' => self::DENIED];
        }
        $scope = $this->user->managedUnitIds();
        $query = Employee::with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->whereHas('user')->when($scope !== null, fn ($q) => $q->inUnits($scope));
        if ($args['search'] ?? null) {
            $query->where(fn ($q) => $q->where('employee_code', 'like', "%{$args['search']}%")->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$args['search']}%")));
        }
        if ($args['unit'] ?? null) {
            $units = $this->matchUnits($args['unit']);
            if (! $units) {
                return ['error' => "Không tìm thấy tổ/nhóm “{$args['unit']}”."];
            }
            $query->inUnits($units);
        }
        $query->where('employment_status', $args['status'] ?? 'working');
        $people = $query->get()->map(fn (Employee $employee) => [
            'name' => $employee->user->name,
            'code' => $employee->employee_code,
            'roles' => $employee->user->roleLabels(),
            'units' => $employee->departments->map(fn ($d) => Department::pathLabel($d->id))->values()->all(),
            'status' => self::EMPLOYMENT[$employee->employment_status] ?? $employee->employment_status,
            'homeroom' => $employee->user->roles->contains('code', Role::GVCN),
            'hired_on' => $employee->hired_on ? CarbonImmutable::parse($employee->hired_on)->toDateString() : null,
            'qualification' => $employee->qualification,
        ]);
        if ($role = $args['role'] ?? null) {
            $people = $people->filter(fn ($person) => collect($person['roles'])->contains(fn ($label) => Str::contains(Str::lower($label), Str::lower($role))));
        }
        $people = $people->sortBy(fn ($person) => Str::afterLast($person['name'], ' ').' '.$person['name'])->values();

        return ['scope' => $this->scopeLabel(), 'total' => $people->count(), 'people' => $people->take(30)->all()];
    }

    private function peopleWorkload(array $args): array
    {
        $own = $this->user->employee?->id;
        $scope = $this->user->hasPermission('kpi.view') ? $this->user->managedUnitIds() : [];
        $employees = Employee::query()->whereHas('user')->where('employment_status', '!=', 'terminated');
        if ($scope !== null) {
            $employees->where(fn ($q) => $q->when($scope, fn ($b) => $b->inUnits($scope))->orWhere('employees.id', $own ?? 0));
        }
        if ($args['unit'] ?? null) {
            $employees->inUnits($this->matchUnits($args['unit']) ?: [0]);
        }
        if ($args['person'] ?? null) {
            $employees->whereHas('user', fn ($u) => $u->where('name', 'like', "%{$args['person']}%"));
        }
        $ids = $employees->pluck('employees.id');
        if ($ids->isEmpty()) {
            return ['scope' => $scope === [] ? 'chỉ bản thân (không có quyền xem Thống kê)' : $this->scopeLabel(), 'people' => []];
        }
        $rows = DB::table('task_employee_assignees as a')->join('tasks as t', 't.id', '=', 'a.task_id')->join('employees as e', 'e.id', '=', 'a.employee_id')->join('users as u', 'u.id', '=', 'e.user_id')
            ->whereNull('t.deleted_at')->whereIn('a.employee_id', $ids)
            ->selectRaw("u.name, SUM(t.status IN ('not_started','in_progress','waiting_approval')) as open_tasks, SUM(t.status = 'completed') as completed_tasks, SUM(t.status IN ('not_started','in_progress') AND t.due_at < ?) as overdue_tasks", [now()])
            ->groupBy('a.employee_id', 'u.name')->orderByDesc('open_tasks')->limit(self::LIMIT)->get()
            ->map(fn ($row) => ['name' => $row->name, 'open' => (int) $row->open_tasks, 'completed' => (int) $row->completed_tasks, 'overdue' => (int) $row->overdue_tasks]);
        if ($rows->isEmpty() && $scope === [] && $this->user->employee) {
            $rows->push(['name' => $this->user->name, 'open' => 0, 'completed' => 0, 'overdue' => 0]);
        }

        return ['scope' => $scope === [] ? 'chỉ bản thân (không có quyền xem Thống kê)' : $this->scopeLabel(), 'people' => $rows->all()];
    }

    private function evaluationStatus(array $args): array
    {
        if (! $this->canEvaluate()) {
            return ['error' => self::DENIED];
        }
        $period = $this->period($args['month'] ?? null);
        if (! $period) {
            return ['error' => 'Chưa có kỳ đánh giá cho tháng này.'];
        }
        $sheets = $this->visibleSheets($period);
        $own = $sheets->first(fn (Evaluation $sheet) => $this->access()->isOwn($sheet));

        return [
            'period' => $period->label(),
            'period_status' => self::PERIOD_STATUSES[$period->status] ?? $period->status,
            'self_due_on' => $period->self_due_on?->toDateString(),
            'unit_due_on' => $period->unit_due_on?->toDateString(),
            'visible_sheets' => $sheets->count(),
            'by_status' => collect(self::EVALUATION_STATUSES)->mapWithKeys(fn ($label, $status) => [$label => $sheets->where('status', $status)->count()])->all(),
            'awaiting_leadership' => $sheets->filter(fn (Evaluation $sheet) => $sheet->status !== Evaluation::DRAFT && $sheet->awaitsLeader())->count(),
            'my_sheet' => $own ? self::EVALUATION_STATUSES[$own->status] : null,
        ];
    }

    private function evaluationScores(array $args): array
    {
        if (! $this->canEvaluate()) {
            return ['error' => self::DENIED];
        }
        $period = $this->period($args['month'] ?? null);
        if (! $period) {
            return ['error' => 'Chưa có kỳ đánh giá cho tháng này.'];
        }
        $sheets = $this->visibleSheets($period)->load(['scores', 'teacher.user:id,name', 'teacher.departments' => fn ($q) => $q->wherePivotNull('ends_on')]);
        if ($args['unit'] ?? null) {
            $units = $this->matchUnits($args['unit']);
            $sheets = $sheets->filter(fn (Evaluation $sheet) => $sheet->teacher?->departments->pluck('id')->intersect($units)->isNotEmpty());
        }
        if ($person = $args['person'] ?? null) {
            $sheets = $sheets->filter(fn (Evaluation $sheet) => Str::contains(Str::lower((string) $sheet->teacher?->user?->name), Str::lower($person)));
        }
        $released = in_array($period->status, [EvaluationPeriod::DISCLOSED, EvaluationPeriod::PUBLISHED], true);
        $rows = $sheets->map(function (Evaluation $sheet) use ($released) {
            $final = $released || ! $this->access()->isOwn($sheet);
            $template = $sheet->template ?? $sheet->period->template;

            return [
                'name' => $sheet->teacher?->user?->name,
                'units' => $sheet->teacher?->departments->map(fn ($d) => Department::pathLabel($d->id))->values()->all(),
                'audience' => EvaluationTemplate::AUDIENCES[$sheet->audience] ?? $sheet->audience,
                'status' => self::EVALUATION_STATUSES[$sheet->status] ?? $sheet->status,
                'self_total' => $sheet->status === Evaluation::DRAFT ? null : $this->scoring->totals($sheet, $this->criteria($sheet), 'self')['total'],
                'final_total' => $final && $sheet->total_score !== null ? (float) $sheet->total_score : null,
                'grade' => $final && $sheet->grade ? (collect($template?->grades)->firstWhere('code', $sheet->grade)['name'] ?? $sheet->grade) : null,
                'has_violation' => $final ? (bool) $sheet->has_violation : null,
            ];
        });
        if ($grade = $args['grade'] ?? null) {
            $rows = $rows->filter(fn ($row) => $row['grade'] && Str::contains(Str::lower($row['grade']), Str::lower($grade)));
        }
        $rows = $rows->sortByDesc(fn ($row) => $row['final_total'] ?? $row['self_total'] ?? -1)->values();

        return [
            'period' => $period->label(),
            'period_status' => self::PERIOD_STATUSES[$period->status] ?? $period->status,
            'note' => $released ? null : 'Kỳ đang chấm: điểm chốt và xếp loại trên phiếu của chính người hỏi chưa được công bố.',
            'total' => $rows->count(),
            'sheets' => $rows->take(self::LIMIT)->all(),
        ];
    }

    private function leaveSummary(array $args): array
    {
        $from = $this->date($args['from'] ?? null) ?? CarbonImmutable::today();
        $to = $this->date($args['to'] ?? null) ?? $from;
        if ($to->lt($from)) {
            [$from, $to] = [$to, $from];
        }
        $visible = Employee::query();
        $units = $this->user->managedUnitIds();
        if (! $this->user->hasPermission('leave.view') && ! $this->user->hasPermission('leave.manage')) {
            $visible->whereKey($this->user->employee?->id ?? 0);
            $scope = 'chỉ bản thân';
        } elseif ($units !== null) {
            $visible->where(fn ($q) => $q->inUnits($units)->orWhere('employees.id', $this->user->employee?->id ?? 0));
            $scope = $this->scopeLabel();
        }
        $records = LeaveRecord::with('employee.user:id,name')
            ->whereIn('employee_id', $visible->select('employees.id'))
            ->whereDate('starts_on', '<=', $to)->whereDate('ends_on', '>=', $from)
            ->when($args['person'] ?? null, fn ($q, $name) => $q->whereHas('employee.user', fn ($u) => $u->where('name', 'like', "%{$name}%")))
            ->orderBy('starts_on')->limit(30)->get();

        return [
            'from' => $from->toDateString(), 'to' => $to->toDateString(),
            'scope' => $scope ?? 'toàn trường',
            'records' => $records->map(fn (LeaveRecord $record) => [
                'name' => $record->employee?->user?->name,
                'type' => LeaveRecord::TYPES[$record->type] ?? $record->type,
                'regime_kind' => $record->regime_kind ? (LeaveRecord::REGIME_KINDS[$record->regime_kind] ?? $record->regime_kind) : null,
                'starts_on' => CarbonImmutable::parse($record->starts_on)->toDateString().($record->start_session ? ' ('.($record->start_session === 'am' ? 'sáng' : 'chiều').')' : ''),
                'ends_on' => CarbonImmutable::parse($record->ends_on)->toDateString().($record->end_session ? ' ('.($record->end_session === 'am' ? 'sáng' : 'chiều').')' : ''),
                'sessions' => $record->sessions,
            ])->all(),
        ];
    }

    private function searchLibrary(array $args): array
    {
        if (! $this->user->hasPermission('library.view')) {
            return ['error' => self::DENIED];
        }
        $keyword = (string) ($args['query'] ?? '');
        $access = new LibraryAccess($this->user);
        $nodes = $access->scopeReadable(LibraryNode::query())
            ->when($keyword !== '', fn ($q) => $q->where('library_nodes.name', 'like', "%{$keyword}%"))
            ->when($args['type'] ?? null, fn ($q, $type) => $q->where('type', $type === 'folder' ? LibraryNode::FOLDER : LibraryNode::FILE))
            ->with(['file:id,size', 'owner:id,name'])->orderByDesc('updated_at')->limit(self::LIMIT)->get();

        return ['shown' => $nodes->count(), 'items' => $nodes->map(fn (LibraryNode $node) => [
            'name' => $node->name,
            'type' => $node->isFolder() ? 'Thư mục' : 'File',
            'folder' => $node->parent_id ? collect(array_reverse($access->chain($node->parent_id)))->map(fn ($id) => $access->folderName($id))->filter()->join(' › ') : 'Gốc kho',
            'size_kb' => $node->file?->size ? round($node->file->size / 1024) : null,
            'owner' => $node->owner?->name,
            'updated_at' => $node->updated_at?->toDateString(),
        ])->all()];
    }

    private function visibleTasks(): Builder
    {
        return Task::query()->visibleTo($this->user);
    }

    private function taskRow(Task $task): array
    {
        $assignees = $task->employees->map(fn ($employee) => $employee->user?->name)->filter()->values();

        return array_filter([
            'code' => $task->code,
            'title' => Str::limit($task->title, 200),
            'status' => self::TASK_STATUSES[$task->status] ?? $task->status,
            'overdue' => in_array($task->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true) && $task->due_at?->isPast(),
            'priority' => self::PRIORITIES[$task->priority] ?? $task->priority,
            'type' => $task->category?->name,
            'starts_at' => $task->starts_at?->format('Y-m-d H:i'),
            'due_at' => $task->due_at?->format('Y-m-d H:i'),
            'completed_at' => $task->completed_at?->format('Y-m-d H:i'),
            'units' => $task->departments->pluck('name')->all() ?: null,
            'assignees' => $assignees->take(8)->all() ?: null,
            'more_assignees' => $assignees->count() > 8 ? $assignees->count() - 8 : null,
            'reviewers' => $task->reviewers->pluck('name')->all() ?: null,
        ], fn ($value) => $value !== null && $value !== false);
    }

    private function matchUnits(string $name): array
    {
        $needle = Str::lower(Str::ascii($name));
        $ids = Department::query()->get(['id', 'name'])
            ->filter(fn (Department $unit) => Str::contains(Str::lower(Str::ascii($unit->name)), $needle))
            ->pluck('id')->all();

        return $ids ? Department::withDescendants($ids) : [];
    }

    private function canEvaluate(): bool
    {
        return $this->user->hasPermission('evaluation.view') || $this->user->hasPermission('evaluation.score') || $this->user->hasPermission('evaluation.manage');
    }

    private function access(): EvaluationAccess
    {
        return $this->evaluationAccess ??= new EvaluationAccess($this->user);
    }

    private function period(?string $month): ?EvaluationPeriod
    {
        $query = EvaluationPeriod::with('template');
        if ($month && preg_match('/^(\d{4})-(\d{1,2})$/', $month, $parts)) {
            return $query->where('year', (int) $parts[1])->where('month', (int) $parts[2])->first();
        }

        return $query->orderByDesc('year')->orderByDesc('month')->first();
    }

    private function visibleSheets(EvaluationPeriod $period): Collection
    {
        $sheets = $period->evaluations()->with(['period.template', 'template'])->get();

        return $this->access()->manages() ? $sheets : $sheets->filter(fn (Evaluation $sheet) => $this->access()->canView($sheet))->values();
    }

    private function criteria(Evaluation $sheet): Collection
    {
        $templateId = $sheet->template_id ?? $sheet->period->template_id;

        return $this->criteria[$templateId] ??= EvaluationCriterion::where('template_id', $templateId)->orderBy('position')->get();
    }

    private function plain(?string $html): string
    {
        $text = html_entity_decode(strip_tags(preg_replace(['/<\/(p|li|h\d|div)>/i', '/<br\s*\/?>/i'], "\n", (string) $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim(preg_replace("/\n{3,}/", "\n\n", $text));
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
