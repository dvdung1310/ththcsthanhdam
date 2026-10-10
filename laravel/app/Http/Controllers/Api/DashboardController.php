<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Task;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $unitIds = $user->managedUnitIds();
        $scope = $unitIds === null ? 'school' : ($unitIds ? 'department' : 'self');
        $employees = Employee::with(['user:id,name', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->when($scope === 'department', fn ($q) => $q->inUnits($unitIds))
            ->when($scope === 'self', fn ($q) => $q->where('id', $user->employee?->id ?? 0))->get();
        $employeeIds = $employees->pluck('id');
        $taskUnits = $scope === 'department' ? Department::withAncestors($unitIds) : $user->memberUnitIds();
        $tasks = Task::with(['employees:id,user_id', 'departments:id,name'])->where('status', '!=', Task::CANCELLED)
            ->when($scope !== 'school', fn ($q) => $q->where(fn ($b) => $b
                ->whereHas('employees', fn ($t) => $t->whereIn('employees.id', $employeeIds))
                ->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $taskUnits ?: [0]))))->get();
        $submitted = DB::table('task_submissions')->whereIn('task_id', $tasks->pluck('id'))->selectRaw('task_id, MAX(submitted_at) as submitted_at')->groupBy('task_id')->get()->keyBy('task_id');
        $start = now()->startOfMonth();
        $currentTasks = $tasks->filter(fn ($t) => $t->due_at && $t->due_at->gte($start) && $t->due_at->lt($start->copy()->addMonth()));
        $previousTasks = $tasks->filter(fn ($t) => $t->due_at && $t->due_at->gte($start->copy()->subMonth()) && $t->due_at->lt($start));
        $metrics = function ($items) use ($submitted) {
            $completed = $items->where('status', Task::COMPLETED);
            $onTime = $completed->filter(function ($task) use ($submitted) {
                $time = $submitted->get($task->id)?->submitted_at ?? $task->completed_at;

                return $time && $task->due_at && Carbon::parse($time)->lte($task->due_at);
            })->count();

            return [
                'workload' => $items->count(),
                'completion' => $items->count() ? round($completed->count() / $items->count() * 100, 1) : null,
                'on_time' => $completed->count() ? round($onTime / $completed->count() * 100, 1) : null,
            ];
        };
        $current = $metrics($currentTasks);
        $previous = $metrics($previousTasks);
        $employeeUnits = $employees->mapWithKeys(fn ($employee) => [$employee->id => $employee->unitIds()]);
        $unitMembers = [];
        foreach ($employeeUnits as $employeeId => $ids) {
            foreach ($ids as $id) {
                $unitMembers[$id][] = $employeeId;
            }
        }
        $inView = $employeeIds->flip();
        $assigneeIds = $tasks->mapWithKeys(fn ($task) => [$task->id => collect([
            ...$task->employees->pluck('id')->filter(fn ($id) => $inView->has($id)),
            ...$task->departments->flatMap(fn ($department) => $unitMembers[$department->id] ?? []),
        ])->unique()->values()]);
        $assignees = fn ($task) => $assigneeIds->get($task->id, collect());
        $working = $employees->where('employment_status', 'working')->pluck('id');
        $activeEmployees = $currentTasks->flatMap($assignees)->unique()->intersect($working)->count();
        $pending = $tasks->whereIn('status', Task::OPEN);
        $loads = $pending->flatMap($assignees)->countBy();
        $highLoad = $employees->filter(fn ($t) => ($loads->get($t->id, 0)) >= 5)->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name, 'count' => $loads->get($t->id)])->values();
        $waiting = $pending->where('status', Task::WAITING_APPROVAL);
        $overdue = $pending->filter(fn ($t) => $t->status !== Task::WAITING_APPROVAL && $t->due_at?->isPast());
        $soon = $pending->filter(fn ($t) => $t->status !== Task::WAITING_APPROVAL && $t->due_at && $t->due_at->gt(now()) && $t->due_at->lte(now()->addDay()));
        $attentionTasks = $waiting->merge($overdue)->merge($soon)->unique('id')->sortBy('due_at')->map(fn ($t) => ['id' => $t->id, 'title' => $t->title, 'code' => $t->code, 'reason' => $t->status === Task::WAITING_APPROVAL ? 'Chờ duyệt' : ($t->due_at?->isPast() ? 'Quá hạn' : 'Còn dưới 24 giờ')])->values();
        $unitIdsInView = $employeeUnits->flatten()->unique()
            ->when($scope === 'department', fn ($ids) => $ids->intersect($unitIds))->values()->all();
        $assignedCount = $currentTasks->flatMap($assignees)->countBy();
        $completedCount = $currentTasks->where('status', Task::COMPLETED)->flatMap($assignees)->countBy();
        $memberStats = fn ($employee) => [
            'id' => $employee->id, 'name' => $employee->user?->name,
            'assigned' => $assignedCount->get($employee->id, 0),
            'completed' => $completedCount->get($employee->id, 0),
        ];
        $departments = Department::ordered($unitIdsInView)->map(function ($department) use ($employees, $currentTasks, $assignees, $memberStats, $unitMembers) {
            $memberIds = $unitMembers[$department['id']] ?? [];
            $members = $employees->whereIn('id', $memberIds);
            $unitTasks = $currentTasks->filter(fn ($t) => $assignees($t)->intersect($memberIds)->isNotEmpty());
            $completed = $unitTasks->where('status', Task::COMPLETED)->count();

            return ['id' => $department['id'], 'name' => $department['label'], 'assigned' => $unitTasks->count(), 'completed' => $completed, 'completion' => $unitTasks->count() ? round($completed / $unitTasks->count() * 100, 1) : null, 'employees' => $members->map($memberStats)->values()];
        })->sortByDesc('assigned')->values();

        return response()->json([
            'scope' => $scope, 'period' => $start->format('m/Y'), 'current' => $current, 'previous' => $previous,
            'resources' => ['active' => $activeEmployees, 'total' => $working->count()],
            'attention' => ['waiting' => $waiting->count(), 'soon' => $soon->count(), 'overdue' => $overdue->count(), 'high_load' => $highLoad, 'total' => $attentionTasks->count(), 'tasks' => $attentionTasks],
            'progress' => ['completed' => $currentTasks->where('status', Task::COMPLETED)->count(), 'waiting' => $currentTasks->where('status', Task::WAITING_APPROVAL)->count(), 'in_progress' => $currentTasks->where('status', Task::IN_PROGRESS)->count(), 'not_started' => $currentTasks->where('status', Task::NOT_STARTED)->count()],
            'departments' => $departments, 'personal' => $employees->count() === 1 ? $memberStats($employees->first()) : null,
        ]);
    }
}
