<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class TaskStatsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate([
            'year' => 'nullable|integer|min:2020|max:2100', 'month' => 'nullable|integer|min:1|max:12',
            'compare' => 'nullable|in:previous,year,none', 'department_id' => 'nullable|integer',
            'employee_id' => 'nullable|integer', 'category_id' => 'nullable|integer',
        ]);
        [$scope, $visibleIds] = $this->visibility($request);
        $start = Carbon::create($v['year'] ?? now()->year, $v['month'] ?? now()->month, 1)->startOfDay();
        $compare = $v['compare'] ?? 'previous';
        $previous = $compare === 'year' ? $start->copy()->subYear() : $start->copy()->subMonth();

        $allEmployees = Employee::with(['user:id,name', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->when($visibleIds !== null, fn ($q) => $q->whereIn('id', $visibleIds))->get();
        $employees = $allEmployees->filter(fn ($t) => (empty($v['department_id']) || in_array((int) $v['department_id'], $t->unitIds(), true)) && (empty($v['employee_id']) || $t->id == $v['employee_id']))->values();
        $unitIds = $employees->flatMap(fn ($t) => $t->unitIds())->unique()->values();

        $tasks = Task::with(['employees:id', 'departments:id', 'category:id,name'])->where('status', '!=', Task::CANCELLED)
            ->where(fn ($q) => $q->whereHas('employees', fn ($t) => $t->whereIn('employees.id', $employees->pluck('id')->all() ?: [0]))->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $unitIds->all() ?: [0])))
            ->when(! empty($v['category_id']), fn ($q) => $q->where('category_id', $v['category_id']))
            ->get();
        $finishedAt = $this->finishTimes($tasks);
        $now = now();
        $inProgress = $now->gte($start) && $now->lt($start->copy()->addMonth());
        $cutoff = $inProgress ? $now : null;
        $previousEnd = $inProgress ? Carbon::createFromTimestamp(min($previous->copy()->addSeconds($start->diffInSeconds($now))->timestamp, $previous->copy()->addMonth()->timestamp)) : null;
        $inMonth = fn (Task $task, Carbon $from, ?Carbon $to = null) => $task->due_at && $task->due_at->gte($from) && $task->due_at->lt($to ?? $from->copy()->addMonth());
        $belongsTo = fn (Task $task, Employee $employee) => $task->employees->contains('id', $employee->id) || $task->departments->pluck('id')->intersect($employee->unitIds())->isNotEmpty();
        $revisions = DB::table('task_submissions')->whereIn('task_id', $tasks->pluck('id'))->where('status', 'revision_required')->selectRaw('task_id, COUNT(*) as total')->groupBy('task_id')->pluck('total', 'task_id');

        $metrics = function (Collection $cohort, ?Carbon $cutoff = null) use ($finishedAt) {
            $completed = $cohort->where('status', Task::COMPLETED);
            $onTime = $completed->filter(fn (Task $t) => ($finishedAt[$t->id] ?? null)?->lte($t->due_at));
            $due = $cutoff ? $cohort->filter(fn (Task $t) => $t->due_at->lte($cutoff) || $t->status === Task::COMPLETED) : $cohort;
            $overdue = $cohort->filter(fn (Task $t) => in_array($t->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true) && $t->due_at->isPast())->count();

            return [
                'assigned' => $cohort->count(),
                'due' => $due->count(),
                'completed' => $completed->count(),
                'on_time' => $onTime->count(),
                'late' => $completed->count() - $onTime->count(),
                'waiting' => $cohort->where('status', Task::WAITING_APPROVAL)->count(),
                'overdue' => $overdue,
                'open' => max(0, $cohort->count() - $completed->count() - $cohort->where('status', Task::WAITING_APPROVAL)->count() - $overdue),
                'completion_rate' => $due->count() ? round($completed->count() / $due->count() * 100, 1) : null,
                'on_time_rate' => $completed->count() ? round($onTime->count() / $completed->count() * 100, 1) : null,
            ];
        };
        $cohort = fn (Carbon $from, ?callable $filter = null, ?Carbon $to = null) => $tasks->filter(fn (Task $t) => $inMonth($t, $from, $to) && (! $filter || $filter($t)))->values();
        $current = fn (?callable $filter = null) => $metrics($cohort($start, $filter), $cutoff);
        $before = fn (?callable $filter = null) => $compare === 'none' ? null : $metrics($cohort($previous, $filter, $previousEnd));

        $rows = $employees->map(function (Employee $employee) use ($cohort, $start, $belongsTo, $metrics, $finishedAt, $revisions, $cutoff) {
            $own = $cohort($start, fn (Task $t) => $belongsTo($t, $employee));

            return [
                'employee_id' => $employee->id, 'employee' => $employee->user?->name, 'employee_code' => $employee->employee_code,
                'department' => $employee->departments->map(fn ($d) => Department::pathLabel($d->id))->join(', '),
                'units' => $employee->departments->map(fn ($d) => ['id' => $d->id, 'name' => $d->name, 'path' => Department::pathLabel($d->id)])->values(),
                ...$metrics($own, $cutoff),
                'tasks' => $own->map(fn (Task $t) => [
                    'id' => $t->id, 'code' => $t->code, 'title' => $t->title, 'category' => $t->category?->name,
                    'due_at' => $t->due_at?->toIso8601String(), 'status' => $t->status,
                    'is_late' => ($finishedAt[$t->id] ?? null)?->gt($t->due_at) ?? false,
                    'revision_count' => (int) ($revisions[$t->id] ?? 0),
                ])->values(),
            ];
        })->sortByDesc('assigned')->values();

        $departments = Department::ordered($unitIds->all())->map(function ($unit) use ($employees, $current, $before, $belongsTo, $unitIds) {
            $members = $employees->filter(fn (Employee $t) => in_array($unit['id'], $t->unitIds(), true));
            $ofMembers = fn (Task $t) => $members->contains(fn (Employee $m) => $belongsTo($t, $m));

            return [
                'id' => $unit['id'], 'name' => $unit['label'], 'short_name' => $unit['name'], 'type' => $unit['type'],
                'parent_id' => $unit['parent_id'] && $unitIds->contains($unit['parent_id']) ? $unit['parent_id'] : null,
                'employees' => $members->count(), ...$current($ofMembers),
                'previous' => $before($ofMembers),
            ];
        })->values();

        return response()->json([
            'scope' => $scope, 'period' => $start->format('m/Y'),
            'comparison_period' => $compare === 'none' ? null : ($inProgress ? '1–'.$previousEnd->copy()->subSecond()->format('d/m/Y') : $previous->format('m/Y')),
            'in_progress' => $inProgress, 'as_of' => $inProgress ? $now->format('d/m') : null,
            'current' => $current(), 'previous' => $before(),
            'trend' => collect(range(5, 0))->map(function ($offset) use ($start, $cohort, $metrics, $now) {
                $from = $start->copy()->subMonths($offset);
                $running = $now->gte($from) && $now->lt($from->copy()->addMonth());

                return ['period' => $from->format('m/Y'), 'year' => $from->year, 'month' => $from->month, 'in_progress' => $running, ...$metrics($cohort($from), $running ? $now : null)];
            }),
            'no_deadline_open' => $tasks->filter(fn (Task $t) => ! $t->due_at && in_array($t->status, Task::OPEN, true))->count(),
            'data' => $rows, 'departments' => $departments,
            'references' => [
                'employees' => $allEmployees->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name, 'department_ids' => $t->unitIds()])->values(),
                'departments' => Department::ordered($allEmployees->flatMap(fn ($t) => $t->unitIds())->unique()->values()->all())->map(fn ($d) => ['id' => $d['id'], 'name' => $d['label'], 'short_name' => $d['name'], 'parent_id' => $d['parent_id']])->values(),
                'task_types' => TaskCategory::orderBy('name')->get(['id', 'name']),
            ],
        ]);
    }

    public static function finishTimes(Collection $tasks): Collection
    {
        $submitted = DB::table('task_submissions')->whereIn('task_id', $tasks->pluck('id'))->selectRaw('task_id, MAX(submitted_at) as submitted_at')->groupBy('task_id')->pluck('submitted_at', 'task_id');

        return $tasks->where('status', Task::COMPLETED)->mapWithKeys(function (Task $task) use ($submitted) {
            $time = $submitted[$task->id] ?? null;

            return [$task->id => $time ? Carbon::parse($time) : $task->completed_at];
        });
    }

    private function visibility(Request $request): array
    {
        $user = $request->user();
        $unitIds = $user->managedUnitIds();
        if ($unitIds === null) {
            return ['school', null];
        }
        $employee = $user->employee;
        if ($unitIds) {
            $ids = Employee::inUnits($unitIds)->pluck('id');
            if ($employee) {
                $ids->push($employee->id);
            }

            return ['department', $ids->unique()->values()->all()];
        }

        return ['self', $employee ? [$employee->id] : []];
    }
}
