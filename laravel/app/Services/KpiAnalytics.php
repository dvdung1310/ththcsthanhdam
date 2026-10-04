<?php

namespace App\Services;

use App\Models\Department;
use App\Models\Task;
use App\Models\TaskCatalogItem;
use App\Models\Teacher;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class KpiAnalytics
{
    public function report(Request $request, array $visibility)
    {
        $v = $request->validate([
            'year' => 'nullable|integer|min:2020|max:2100', 'month' => 'nullable|integer|min:1|max:12',
            'compare' => 'nullable|in:previous,year,none', 'department_id' => 'nullable|integer',
            'teacher_id' => 'nullable|integer', 'task_catalog_item_id' => 'nullable|integer',
        ]);
        [$scope, $visibleIds] = $visibility;
        $start = Carbon::create($v['year'] ?? now()->year, $v['month'] ?? now()->month, 1)->startOfDay();
        $previous = ($v['compare'] ?? 'previous') === 'year' ? $start->copy()->subYear() : $start->copy()->subMonth();
        $allTeachers = Teacher::with(['user:id,name', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->where('employment_status', 'working')->when($visibleIds !== null, fn ($q) => $q->whereIn('id', $visibleIds))->get();
        $teachers = $allTeachers->filter(fn ($t) => (empty($v['department_id']) || in_array((int) $v['department_id'], $t->unitIds(), true)) && (empty($v['teacher_id']) || $t->id == $v['teacher_id']))->values();
        $ids = $teachers->pluck('id');
        $departments = $teachers->flatMap(fn ($t) => $t->unitIds())->unique();
        $tasks = Task::with(['teachers', 'departments', 'catalogItem'])->where('status', '!=', 'cancelled')
            ->where(fn ($q) => $q->whereHas('teachers', fn ($t) => $t->whereIn('teachers.id', $ids))->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $departments)))
            ->when(! empty($v['task_catalog_item_id']), fn ($q) => $q->where('task_catalog_item_id', $v['task_catalog_item_id']))->get();
        // Empty or out-of-scope filters must never expand visibility.
        if ($ids->isEmpty()) {
            $tasks = collect();
        }
        $latest = DB::table('task_evaluations')->where('status', 'approved')->selectRaw('MAX(id) as id')->groupBy('task_id', 'teacher_id');
        $scores = DB::table('task_evaluations as e')->joinSub($latest, 'latest', fn ($j) => $j->on('latest.id', '=', 'e.id'))
            ->join('tasks as t', 't.id', '=', 'e.task_id')->leftJoin('task_catalog_items as ci', 'ci.id', '=', 't.task_catalog_item_id')
            ->whereNull('t.deleted_at')->where('t.status', 'completed')->whereIn('e.teacher_id', $ids)
            ->when(! empty($v['task_catalog_item_id']), fn ($q) => $q->where('t.task_catalog_item_id', $v['task_catalog_item_id']))
            ->select('e.*', DB::raw('COALESCE(ci.score,t.maximum_score) as maximum_score'), DB::raw('COALESCE(t.completed_at,e.submitted_at,e.updated_at) as scored_at'))->get();
        $submissions = DB::table('task_submissions')->whereIn('task_id', $tasks->pluck('id'))->orderBy('submitted_at')->orderBy('id')->get()->groupBy('task_id');
        $inPeriod = fn ($date, $from) => $date && Carbon::parse($date)->gte($from) && Carbon::parse($date)->lt($from->copy()->addMonth());
        $periodScores = fn ($from) => $scores->filter(fn ($s) => $inPeriod($s->scored_at, $from));
        $kpi = function ($items) {
            $values = $items->groupBy('teacher_id')->map(fn ($g) => $g->sum('maximum_score') > 0 ? min(10, $g->sum('score') / $g->sum('maximum_score') * 10) : null)->filter(fn ($n) => $n !== null);

            return $values->isEmpty() ? null : round($values->avg(), 2);
        };
        $metrics = function ($from) use ($tasks, $submissions, $inPeriod, $periodScores, $kpi) {
            $cohort = $tasks->filter(fn ($t) => $inPeriod($t->due_at, $from));
            $completed = $cohort->where('status', 'completed');
            $onTime = $completed->filter(function ($t) use ($submissions) {
                $date = $submissions->get($t->id, collect())->last()?->submitted_at ?? $t->completed_at;

                return $date && Carbon::parse($date)->lte($t->due_at);
            });
            $reviewed = $tasks->filter(fn ($t) => $submissions->get($t->id, collect())->contains(fn ($s) => in_array($s->status, ['approved', 'revision_required']) && $inPeriod($s->reviewed_at, $from)));
            $firstApproved = $reviewed->filter(fn ($t) => $submissions->get($t->id)->first()?->status === 'approved');
            $items = $periodScores($from);

            return ['kpi' => $kpi($items), 'on_time' => $completed->count() ? round($onTime->count() / $completed->count() * 100, 1) : null,
                'completion' => $cohort->count() ? round($completed->count() / $cohort->count() * 100, 1) : null,
                'first_approval' => $reviewed->count() ? round($firstApproved->count() / $reviewed->count() * 100, 1) : null,
                'late_penalty' => round($items->sum('late_penalty'), 2), 'task_count' => $cohort->count(), 'evaluated_teachers' => $items->pluck('teacher_id')->unique()->count()];
        };
        $currentScores = $periodScores($start);
        $rows = $teachers->map(function ($teacher) use ($currentScores, $tasks, $inPeriod, $start, $submissions) {
            $items = $currentScores->where('teacher_id', $teacher->id);
            $maximum = $items->sum('maximum_score');
            $work = $tasks->filter(fn ($t) => ($t->teachers->contains('id', $teacher->id) || collect($teacher->unitIds())->intersect($t->departments->pluck('id'))->isNotEmpty()) && ($inPeriod($t->due_at, $start) || $items->contains('task_id', $t->id)));

            return ['teacher_id' => $teacher->id, 'teacher' => $teacher->user?->name, 'employee_code' => $teacher->employee_code,
                'department' => $teacher->departments->map(fn ($d) => Department::pathLabel($d->id))->join(', '), 'department_ids' => collect($teacher->unitIds()),
                'task_count' => $work->count(), 'task_earned' => round($items->sum('score'), 2), 'task_maximum' => $maximum,
                'final_score' => $maximum > 0 ? round(min(10, $items->sum('score') / $maximum * 10), 2) : null,
                'late_penalty' => round($items->sum('late_penalty'), 2),
                'tasks' => $work->map(function ($t) use ($items, $submissions) {
                    $e = $items->firstWhere('task_id', $t->id);

                    return ['id' => $t->id, 'code' => $t->code, 'title' => $t->title, 'task_type' => $t->catalogItem?->name, 'product' => $t->catalogItem?->product_type,
                        'due_at' => $t->due_at?->toIso8601String(), 'status' => $t->status, 'score' => $e ? (float) $e->score : null,
                        'maximum_score' => (float) ($t->catalogItem?->score ?? $t->maximum_score), 'late_penalty' => (float) ($e->late_penalty ?? 0),
                        'late_penalty_percent' => (float) ($e->late_penalty_percent ?? 0), 'comment' => $e?->comment,
                        'revision_count' => $submissions->get($t->id, collect())->where('status', 'revision_required')->count()];
                })->values()];
        })->sortByDesc('final_score')->values();
        $departmentRows = Department::ordered($departments->values()->all())->map(function ($d) use ($rows) {
            $members = $rows->filter(fn ($r) => $r['department_ids']->contains($d['id']));
            $evaluated = $members->whereNotNull('final_score');

            return ['id' => $d['id'], 'name' => $d['label'], 'kpi' => $evaluated->isEmpty() ? null : round($evaluated->avg('final_score'), 2), 'teachers' => $members->count(), 'late_penalty' => round($members->sum('late_penalty'), 2)];
        })->sortByDesc('kpi')->values();
        $loss = round($currentScores->sum(fn ($e) => max(0, $e->maximum_score - $e->score - $e->late_penalty)), 2);
        $late = round($currentScores->sum('late_penalty'), 2);
        $trend = collect(range(5, 0))->map(function ($offset) use ($start, $periodScores, $kpi) {
            $from = $start->copy()->subMonths($offset);

            return ['period' => $from->format('m/Y'), 'kpi' => $kpi($periodScores($from))];
        });

        return response()->json(['scope' => $scope, 'period' => $start->format('m/Y'), 'comparison_period' => $previous->format('m/Y'),
            'current' => $metrics($start), 'previous' => ($v['compare'] ?? 'previous') === 'none' ? null : $metrics($previous),
            'trend' => $trend, 'losses' => [['name' => 'Trễ hạn', 'points' => $late], ['name' => 'Giảm điểm chấm (chưa phân loại nguyên nhân)', 'points' => $loss]],
            'data' => $rows, 'departments' => $departmentRows,
            'references' => ['teachers' => $allTeachers->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name, 'department_ids' => $t->unitIds()])->values(),
                'departments' => Department::ordered($allTeachers->flatMap(fn ($t) => $t->unitIds())->unique()->values()->all())->map(fn ($d) => ['id' => $d['id'], 'name' => $d['label']])->values(),
                'task_types' => TaskCatalogItem::orderBy('name')->get(['id', 'name'])]]);
    }
}
