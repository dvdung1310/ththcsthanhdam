<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\Teacher;
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
            'teacher_id' => 'nullable|integer', 'category_id' => 'nullable|integer',
        ]);
        [$scope, $visibleIds] = $this->visibility($request);
        $start = Carbon::create($v['year'] ?? now()->year, $v['month'] ?? now()->month, 1)->startOfDay();
        $compare = $v['compare'] ?? 'previous';
        $previous = $compare === 'year' ? $start->copy()->subYear() : $start->copy()->subMonth();

        $allTeachers = Teacher::with(['user:id,name', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->where('employment_status', 'working')->when($visibleIds !== null, fn ($q) => $q->whereIn('id', $visibleIds))->get();
        $teachers = $allTeachers->filter(fn ($t) => (empty($v['department_id']) || in_array((int) $v['department_id'], $t->unitIds(), true)) && (empty($v['teacher_id']) || $t->id == $v['teacher_id']))->values();
        $unitIds = $teachers->flatMap(fn ($t) => $t->unitIds())->unique()->values();

        $tasks = Task::with(['teachers:id', 'departments:id', 'category:id,name'])->where('status', '!=', Task::CANCELLED)
            ->where(fn ($q) => $q->whereHas('teachers', fn ($t) => $t->whereIn('teachers.id', $teachers->pluck('id')->all() ?: [0]))->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $unitIds->all() ?: [0])))
            ->when(! empty($v['category_id']), fn ($q) => $q->where('category_id', $v['category_id']))
            ->get();
        $finishedAt = $this->finishTimes($tasks);
        $inMonth = fn (Task $task, Carbon $from) => $task->due_at && $task->due_at->gte($from) && $task->due_at->lt($from->copy()->addMonth());
        $belongsTo = fn (Task $task, Teacher $teacher) => $task->teachers->contains('id', $teacher->id) || $task->departments->pluck('id')->intersect($teacher->unitIds())->isNotEmpty();
        $revisions = DB::table('task_submissions')->whereIn('task_id', $tasks->pluck('id'))->where('status', 'revision_required')->selectRaw('task_id, COUNT(*) as total')->groupBy('task_id')->pluck('total', 'task_id');

        $metrics = function (Collection $cohort) use ($finishedAt) {
            $completed = $cohort->where('status', Task::COMPLETED);
            $onTime = $completed->filter(fn (Task $t) => ($finishedAt[$t->id] ?? null)?->lte($t->due_at));

            return [
                'assigned' => $cohort->count(),
                'completed' => $completed->count(),
                'waiting' => $cohort->where('status', Task::WAITING_APPROVAL)->count(),
                'overdue' => $cohort->filter(fn (Task $t) => in_array($t->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true) && $t->due_at->isPast())->count(),
                'completion_rate' => $cohort->count() ? round($completed->count() / $cohort->count() * 100, 1) : null,
                'on_time_rate' => $completed->count() ? round($onTime->count() / $completed->count() * 100, 1) : null,
            ];
        };
        $cohort = fn (Carbon $from, ?callable $filter = null) => $tasks->filter(fn (Task $t) => $inMonth($t, $from) && (! $filter || $filter($t)))->values();

        $rows = $teachers->map(function (Teacher $teacher) use ($cohort, $start, $belongsTo, $metrics, $finishedAt, $revisions) {
            $own = $cohort($start, fn (Task $t) => $belongsTo($t, $teacher));

            return [
                'teacher_id' => $teacher->id, 'teacher' => $teacher->user?->name, 'employee_code' => $teacher->employee_code,
                'department' => $teacher->departments->map(fn ($d) => Department::pathLabel($d->id))->join(', '),
                ...$metrics($own),
                'tasks' => $own->map(fn (Task $t) => [
                    'id' => $t->id, 'code' => $t->code, 'title' => $t->title, 'category' => $t->category?->name,
                    'due_at' => $t->due_at?->toIso8601String(), 'status' => $t->status,
                    'is_late' => ($finishedAt[$t->id] ?? null)?->gt($t->due_at) ?? false,
                    'revision_count' => (int) ($revisions[$t->id] ?? 0),
                ])->values(),
            ];
        })->sortByDesc('assigned')->values();

        $departments = Department::ordered($unitIds->all())->map(function ($unit) use ($teachers, $cohort, $start, $belongsTo, $metrics) {
            $members = $teachers->filter(fn (Teacher $t) => in_array($unit['id'], $t->unitIds(), true));

            return ['id' => $unit['id'], 'name' => $unit['label'], 'teachers' => $members->count(), ...$metrics($cohort($start, fn (Task $t) => $members->contains(fn (Teacher $m) => $belongsTo($t, $m))))];
        })->values();

        return response()->json([
            'scope' => $scope, 'period' => $start->format('m/Y'), 'comparison_period' => $compare === 'none' ? null : $previous->format('m/Y'),
            'current' => $metrics($cohort($start)), 'previous' => $compare === 'none' ? null : $metrics($cohort($previous)),
            'trend' => collect(range(5, 0))->map(function ($offset) use ($start, $cohort, $metrics) {
                $from = $start->copy()->subMonths($offset);

                return ['period' => $from->format('m/Y'), ...$metrics($cohort($from))];
            }),
            'data' => $rows, 'departments' => $departments,
            'references' => [
                'teachers' => $allTeachers->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name, 'department_ids' => $t->unitIds()])->values(),
                'departments' => Department::ordered($allTeachers->flatMap(fn ($t) => $t->unitIds())->unique()->values()->all())->map(fn ($d) => ['id' => $d['id'], 'name' => $d['label']])->values(),
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
        $teacher = $user->teacher;
        if ($unitIds) {
            $ids = Teacher::inUnits($unitIds)->pluck('id');
            if ($teacher) {
                $ids->push($teacher->id);
            }

            return ['department', $ids->unique()->values()->all()];
        }

        return ['self', $teacher ? [$teacher->id] : []];
    }
}
