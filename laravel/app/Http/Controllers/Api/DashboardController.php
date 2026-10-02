<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\Teacher;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $roles = $user->roles()->where(fn ($q) => $q->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now()))->get();
        $scope = 'self';
        $departmentIds = collect();
        if ($user->isPrincipal() || $roles->pluck('code')->intersect(['system_admin', 'school_board'])->isNotEmpty()) {
            $scope = 'school';
        } elseif ($user->isDepartmentTeacherManager() || $roles->contains('code', 'department_leader')) {
            $scope = 'department';
            $departmentIds = $roles->where('code', 'department_leader')->pluck('pivot.department_id')->filter();
            if ($user->teacher) {
                $departmentIds = $departmentIds->merge($user->teacher->positions()->wherePivotNull('ends_on')->whereIn('positions.name', ['Tổ trưởng', 'Tổ phó'])->pluck('teacher_position.department_id')->filter());
                if ($departmentIds->isEmpty()) {
                    $departmentIds = $user->teacher->departments()->wherePivotNull('ends_on')->pluck('departments.id');
                }
            }
        }
        $departmentIds = $departmentIds->unique()->values();
        $teachers = Teacher::with(['user:id,name', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->where('employment_status', 'working')
            ->when($scope === 'department', fn ($q) => $q->whereHas('departments', fn ($d) => $d->whereIn('departments.id', $departmentIds)->whereNull('teacher_department.ends_on')))
            ->when($scope === 'self', fn ($q) => $q->where('id', $user->teacher?->id ?? 0))->get();
        $teacherIds = $teachers->pluck('id');
        $personalDepartments = $scope === 'self' ? ($user->teacher?->departments()->wherePivotNull('ends_on')->pluck('departments.id') ?? collect()) : collect();
        $tasks = Task::with(['teachers:id,user_id', 'departments:id,name'])->where('status', '!=', 'cancelled')
            ->when($scope !== 'school', fn ($q) => $q->where(fn ($b) => $b
                ->whereHas('teachers', fn ($t) => $t->whereIn('teachers.id', $teacherIds))
                ->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $scope === 'department' ? $departmentIds : $personalDepartments))))->get();
        $submitted = DB::table('task_submissions')->whereIn('task_id', $tasks->pluck('id'))->selectRaw('task_id, MAX(submitted_at) as submitted_at')->groupBy('task_id')->get()->keyBy('task_id');
        $start = now()->startOfMonth();
        $currentTasks = $tasks->filter(fn ($t) => $t->due_at && $t->due_at->gte($start) && $t->due_at->lt($start->copy()->addMonth()));
        $previousTasks = $tasks->filter(fn ($t) => $t->due_at && $t->due_at->gte($start->copy()->subMonth()) && $t->due_at->lt($start));
        $metrics = function ($items) use ($submitted) {
            $completed = $items->where('status', 'completed');
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
        $latest = DB::table('task_evaluations')->where('status', 'approved')->selectRaw('MAX(id) as id')->groupBy('task_id', 'teacher_id');
        $scores = DB::table('task_evaluations as e')->joinSub($latest, 'latest', fn ($j) => $j->on('latest.id', '=', 'e.id'))
            ->join('tasks as t', 't.id', '=', 'e.task_id')->leftJoin('task_catalog_items as ci', 'ci.id', '=', 't.task_catalog_item_id')
            ->whereNull('t.deleted_at')->where('t.status', 'completed')->whereIn('e.teacher_id', $teacherIds)
            ->whereRaw('COALESCE(t.completed_at, e.submitted_at) >= ?', [$start->copy()->subMonth()])
            ->whereRaw('COALESCE(t.completed_at, e.submitted_at) < ?', [$start->copy()->addMonth()])
            ->select('e.task_id', 'e.teacher_id', 'e.score', 't.title', 't.code', DB::raw('COALESCE(ci.score, t.maximum_score) as maximum_score'), DB::raw('COALESCE(t.completed_at, e.submitted_at) as scored_at'))->get();
        $teacherKpi = function ($from, $to) use ($scores, $teachers) {
            $groups = $scores->filter(fn ($s) => Carbon::parse($s->scored_at)->gte($from) && Carbon::parse($s->scored_at)->lt($to))->groupBy('teacher_id');

            return $teachers->map(function ($teacher) use ($groups) {
                $items = $groups->get($teacher->id, collect());
                $maximum = $items->sum('maximum_score');

                return ['id' => $teacher->id, 'name' => $teacher->user?->name, 'score' => $maximum > 0 ? round(min(10, $items->sum('score') / $maximum * 10), 2) : null, 'tasks' => $items->values()];
            });
        };
        $kpi = $teacherKpi($start, $start->copy()->addMonth());
        $previousKpi = $teacherKpi($start->copy()->subMonth(), $start);
        $current['kpi'] = $kpi->whereNotNull('score')->isNotEmpty() ? round($kpi->whereNotNull('score')->avg('score'), 2) : null;
        $previous['kpi'] = $previousKpi->whereNotNull('score')->isNotEmpty() ? round($previousKpi->whereNotNull('score')->avg('score'), 2) : null;
        $assignees = function ($task) use ($teachers) {
            return $teachers->filter(fn ($teacher) => $task->teachers->contains('id', $teacher->id) || $teacher->departments->pluck('id')->intersect($task->departments->pluck('id'))->isNotEmpty())->pluck('id');
        };
        $activeTeachers = $currentTasks->flatMap($assignees)->unique()->count();
        $pending = $tasks->where('status', '!=', 'completed');
        $loads = $pending->flatMap($assignees)->countBy();
        $highLoad = $teachers->filter(fn ($t) => ($loads->get($t->id, 0)) >= 5)->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name, 'count' => $loads->get($t->id)])->values();
        $waiting = $pending->where('review_status', 'waiting_approval');
        $overdue = $pending->filter(fn ($t) => $t->due_at?->isPast());
        $soon = $pending->filter(fn ($t) => $t->due_at && $t->due_at->gt(now()) && $t->due_at->lte(now()->addDay()));
        $attentionTasks = $waiting->merge($overdue)->merge($soon)->unique('id')->sortBy('due_at')->map(fn ($t) => ['id' => $t->id, 'title' => $t->title, 'code' => $t->code, 'reason' => $t->due_at?->isPast() ? 'Quá hạn' : ($t->review_status === 'waiting_approval' ? 'Chờ duyệt' : 'Còn dưới 24 giờ')])->values();
        $departments = $teachers->flatMap->departments->unique('id')->when($scope === 'department', fn ($items) => $items->whereIn('id', $departmentIds));
        $departmentKpi = $departments->map(function ($department) use ($teachers, $kpi) {
            $ids = $teachers->filter(fn ($t) => $t->departments->contains('id', $department->id))->pluck('id');
            $rows = $kpi->whereIn('id', $ids)->values();

            return ['id' => $department->id, 'name' => $department->name, 'score' => $rows->whereNotNull('score')->isNotEmpty() ? round($rows->whereNotNull('score')->avg('score'), 2) : null, 'teachers' => $rows];
        })->sortByDesc('score')->values();

        return response()->json([
            'scope' => $scope, 'period' => $start->format('m/Y'), 'current' => $current, 'previous' => $previous,
            'resources' => ['active' => $activeTeachers, 'total' => $teachers->count()],
            'attention' => ['waiting' => $waiting->count(), 'soon' => $soon->count(), 'overdue' => $overdue->count(), 'high_load' => $highLoad, 'total' => $attentionTasks->count(), 'tasks' => $attentionTasks],
            'progress' => ['completed' => $currentTasks->where('status', 'completed')->count(), 'in_progress' => $currentTasks->where('status', 'in_progress')->count(), 'not_started' => $currentTasks->where('status', 'not_started')->count()],
            'departments' => $departmentKpi, 'personal_kpi' => $kpi->first(),
        ]);
    }
}
