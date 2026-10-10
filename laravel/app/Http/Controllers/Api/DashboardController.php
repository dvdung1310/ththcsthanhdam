<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Evaluation;
use App\Models\EvaluationPeriod;
use App\Models\EvaluationTemplate;
use App\Models\LeaveRecord;
use App\Models\Task;
use App\Models\TaskDraft;
use App\Models\User;
use App\Services\EvaluationAccess;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    private const LIST_LIMIT = 6;

    private const EVALUATION_STATUS = [
        Evaluation::DRAFT => 'Chưa nộp', Evaluation::SUBMITTED => 'Đã nộp, chờ chấm',
        Evaluation::UNIT_SCORED => 'Đã chấm', Evaluation::PUBLISHED => 'Đã công bố',
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $unitIds = $user->managedUnitIds();
        $scope = $unitIds === null ? 'school' : ($unitIds ? 'department' : 'self');
        $period = EvaluationPeriod::whereIn('status', [EvaluationPeriod::OPEN, EvaluationPeriod::DISCLOSED])->orderByDesc('year')->orderByDesc('month')->first();

        return response()->json([
            'scope' => $scope,
            'today' => now()->format('Y-m-d'),
            'name' => $user->name,
            'personal' => $user->employee ? $this->personal($user, $period) : null,
            'queue' => $this->queue($user, $period),
            'health' => $scope === 'self' ? null : $this->health($user, $scope, $unitIds, $period),
            'people' => $this->people($user, $scope, $unitIds, $period),
        ]);
    }

    private function personal(User $user, ?EvaluationPeriod $period): array
    {
        $employee = $user->employee;
        $tasks = $this->assignedTo($employee)->whereIn('status', [...Task::OPEN])->orderByRaw('due_at is null')->orderBy('due_at')->get(['id', 'code', 'title', 'status', 'due_at']);
        $working = $tasks->where('status', '!=', Task::WAITING_APPROVAL);
        $overdue = $working->filter(fn (Task $t) => $t->due_at?->isPast());
        $soon = $working->filter(fn (Task $t) => $t->due_at && $t->due_at->isFuture() && $t->due_at->lte(now()->addDays(3)));
        $sheet = $period && $user->hasPermission('evaluation.view') ? Evaluation::where('period_id', $period->id)->where('teacher_id', $employee->id)->first() : null;
        $month = CarbonImmutable::now()->startOfMonth();
        $leave = LeaveRecord::where('employee_id', $employee->id)->overlapping($month, $month->endOfMonth())->orderBy('starts_on')->get();

        return [
            'employee_id' => $employee->id,
            'tasks' => [
                'open' => $working->count(), 'overdue' => $overdue->count(), 'soon' => $soon->count(),
                'waiting' => $tasks->where('status', Task::WAITING_APPROVAL)->count(),
                'items' => $working->take(self::LIST_LIMIT)->map(fn (Task $t) => $this->taskItem($t))->values(),
            ],
            'evaluation' => $sheet ? [
                'id' => $sheet->id, 'period' => $period->label(), 'status' => $sheet->status,
                'status_label' => self::EVALUATION_STATUS[$sheet->status] ?? $sheet->status,
                'self_due_on' => $period->self_due_on?->toDateString(),
                'period_status' => $period->status,
            ] : null,
            'leave' => [
                'month' => $month->format('m/Y'),
                'excused_sessions' => $leave->where('type', LeaveRecord::EXCUSED)->sum(fn (LeaveRecord $r) => $r->sessionsWithin($month, $month->endOfMonth())),
                'unexcused' => $leave->where('type', LeaveRecord::UNEXCUSED)->count(),
                'regime_sessions' => $leave->where('type', LeaveRecord::REGIME)->sum(fn (LeaveRecord $r) => $r->sessionsWithin($month, $month->endOfMonth())),
            ],
        ];
    }

    private function queue(User $user, ?EvaluationPeriod $period): array
    {
        $employeeId = $user->employee?->id ?? 0;
        $schoolWide = $user->isSchoolWide() && $user->hasPermission('tasks.assign');
        $review = Task::with('employees.user:id,name')->where('status', Task::WAITING_APPROVAL)
            ->where(fn ($q) => $q->whereHas('reviewers', fn ($r) => $r->where('users.id', $user->id))->orWhere(function ($b) use ($user, $employeeId, $schoolWide) {
                $b->whereNot(fn ($own) => $own->where('created_by', $user->id)->doesntHave('departments')->whereHas('employees', fn ($t) => $t->where('employees.id', $employeeId))->has('employees', '=', 1));
                if (! $schoolWide) {
                    $b->where('created_by', $user->id);
                }
            }))
            ->orderBy('due_at')->get(['id', 'code', 'title', 'status', 'due_at']);

        $scoring = collect();
        if ($period && ($user->hasPermission('evaluation.score') || $user->hasPermission('evaluation.manage') || $period->scorers()->where('users.id', $user->id)->exists())) {
            $access = new EvaluationAccess($user);
            $scoring = Evaluation::with(['teacher.user:id,name', 'teacher.departments', 'assignedScorers:id'])->where('period_id', $period->id)
                ->whereIn('status', [Evaluation::SUBMITTED, Evaluation::UNIT_SCORED])->get()
                ->map(function (Evaluation $e) use ($access) {
                    if ($e->status === Evaluation::SUBMITTED && $access->canScore($e)) {
                        return ['id' => $e->id, 'name' => $e->teacher->user?->name, 'column' => $e->scoredByLeadership() ? 'BGH đánh giá' : 'Tổ chấm'];
                    }
                    if ($e->status === Evaluation::UNIT_SCORED && $e->awaitsLeader() && $access->canScoreLeader($e)) {
                        return ['id' => $e->id, 'name' => $e->teacher->user?->name, 'column' => 'BGH đánh giá'];
                    }

                    return null;
                })->filter()->sortBy('name')->values();
        }

        return [
            'review' => ['count' => $review->count(), 'items' => $review->take(self::LIST_LIMIT)->map(fn (Task $t) => [...$this->taskItem($t), 'assignees' => $t->employees->pluck('user.name')->filter()->take(2)->values()])->values()],
            'scoring' => $period && $scoring->isNotEmpty() ? ['period_id' => $period->id, 'period' => $period->label(), 'count' => $scoring->count(), 'items' => $scoring->take(self::LIST_LIMIT)] : null,
            'drafts' => $user->hasPermission('ai.tasks') ? TaskDraft::whereHas('batch', fn ($q) => $q->where('created_by', $user->id))->count() : null,
        ];
    }

    private function health(User $user, string $scope, ?array $unitIds, ?EvaluationPeriod $period): array
    {
        $start = now()->startOfMonth();
        $tasks = $this->scopedTasks($user, $scope, $unitIds)->whereBetween('due_at', [$start, $start->copy()->endOfMonth()])->get(['id', 'status', 'due_at']);
        $completed = $tasks->where('status', Task::COMPLETED)->count();
        $due = $tasks->filter(fn (Task $t) => $t->due_at->lte(now()) || $t->status === Task::COMPLETED)->count();
        $waiting = $tasks->where('status', Task::WAITING_APPROVAL)->count();
        $overdue = $tasks->filter(fn (Task $t) => in_array($t->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true) && $t->due_at->isPast())->count();

        $evaluation = null;
        if ($period && ($user->hasPermission('evaluation.manage') || $user->hasPermission('evaluation.score'))) {
            $sheets = $period->evaluations()->when($scope === 'department', fn ($q) => $q->whereHas('teacher', fn ($t) => $t->inUnits($unitIds)))->get(['id', 'status', 'audience', 'leader_scored_at']);
            $evaluation = [
                'id' => $period->id, 'label' => $period->label(), 'status' => $period->status,
                'status_label' => $period->status === EvaluationPeriod::DISCLOSED ? 'Chờ giải trình' : 'Đang chấm',
                'self_due_on' => $period->self_due_on?->toDateString(), 'unit_due_on' => $period->unit_due_on?->toDateString(),
                'total' => $sheets->count(),
                'submitted' => $sheets->where('status', '!=', Evaluation::DRAFT)->count(),
                'scored' => $sheets->whereIn('status', [Evaluation::UNIT_SCORED, Evaluation::PUBLISHED])->count(),
                'awaiting_leader' => $sheets->filter(fn (Evaluation $e) => $e->audience === EvaluationTemplate::TEACHER && $e->status === Evaluation::UNIT_SCORED && ! $e->leader_scored_at)->count(),
            ];
        }

        return [
            'period' => $start->format('m/Y'),
            'tasks' => [
                'assigned' => $tasks->count(), 'completed' => $completed, 'waiting' => $waiting, 'overdue' => $overdue,
                'open' => max(0, $tasks->count() - $completed - $waiting - $overdue),
                'completion_rate' => $due ? round($completed / $due * 100, 1) : null,
            ],
            'evaluation' => $evaluation,
        ];
    }

    private function people(User $user, string $scope, ?array $unitIds, ?EvaluationPeriod $period): array
    {
        $today = CarbonImmutable::today();
        $leave = null;
        if ($scope !== 'self' && ($user->hasPermission('leave.view') || $user->hasPermission('leave.manage'))) {
            $visible = Employee::query()->when($scope === 'department', fn ($q) => $q->inUnits($unitIds))->select('employees.id');
            $records = LeaveRecord::with('employee.user:id,name')->whereIn('employee_id', $visible)->overlapping($today, $today->addDays(6))->orderBy('starts_on')->get();
            $current = $records->filter(fn (LeaveRecord $r) => $r->starts_on->lte($today) && $r->ends_on->gte($today));
            $leave = [
                'today' => $current->map(fn (LeaveRecord $r) => [
                    'name' => $r->employee?->user?->name, 'type' => $r->type, 'type_label' => LeaveRecord::TYPES[$r->type] ?? $r->type,
                    'until' => $r->ends_on->toDateString(), 'sessions' => $r->sessions,
                ])->values(),
                'week' => $records->pluck('employee_id')->unique()->count(),
            ];
        }

        $tasks = $scope === 'self' && $user->employee ? $this->assignedTo($user->employee) : $this->scopedTasks($user, $scope, $unitIds);
        $upcoming = $tasks->whereIn('status', [Task::NOT_STARTED, Task::IN_PROGRESS])->whereBetween('due_at', [now(), $today->addDays(7)->endOfDay()])
            ->orderBy('due_at')->limit(30)->get(['id', 'code', 'title', 'status', 'due_at'])
            ->map(fn (Task $t) => ['kind' => 'task', 'date' => $t->due_at->toDateString(), ...$this->taskItem($t)]);
        if ($period && $period->status === EvaluationPeriod::OPEN) {
            foreach (['self_due_on' => 'Hạn tự chấm', 'unit_due_on' => 'Hạn chấm phiếu'] as $field => $label) {
                if ($period->{$field} && $period->{$field}->between($today, $today->addDays(7))) {
                    $upcoming->push(['kind' => 'evaluation', 'date' => $period->{$field}->toDateString(), 'title' => "{$label} {$period->label()}", 'period_id' => $period->id]);
                }
            }
        }

        return [
            'leave' => $leave,
            'upcoming' => $upcoming->sortBy([['date', 'asc'], ['kind', 'desc']])->values(),
        ];
    }

    private function assignedTo(Employee $employee): Builder
    {
        $units = $employee->unitIds() ?: [0];

        return Task::query()->where('status', '!=', Task::CANCELLED)
            ->where(fn ($q) => $q->whereHas('employees', fn ($t) => $t->where('employees.id', $employee->id))->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $units)));
    }

    private function scopedTasks(User $user, string $scope, ?array $unitIds): Builder
    {
        $query = Task::query()->where('status', '!=', Task::CANCELLED);
        if ($scope === 'school') {
            return $query;
        }
        $employeeIds = $scope === 'department' ? Employee::inUnits($unitIds)->pluck('id') : collect([$user->employee?->id ?? 0]);
        $taskUnits = $scope === 'department' ? Department::withAncestors($unitIds) : $user->memberUnitIds();

        return $query->where(fn ($q) => $q->whereHas('employees', fn ($t) => $t->whereIn('employees.id', $employeeIds))->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $taskUnits ?: [0])));
    }

    private function taskItem(Task $task): array
    {
        return [
            'id' => $task->id, 'code' => $task->code, 'title' => $task->title, 'status' => $task->status,
            'due_at' => $task->due_at?->toIso8601String(),
            'overdue' => in_array($task->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true) && (bool) $task->due_at?->isPast(),
        ];
    }
}
