<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Evaluation;
use App\Models\EvaluationPeriod;
use App\Models\EvaluationTemplate;
use App\Models\LeaveRecord;
use App\Models\LibraryNode;
use App\Models\Task;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        $today = CarbonImmutable::today();
        $employees = Employee::with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('employment_status', 'working')->get();
        $leave = LeaveRecord::with('employee.user:id,name')->overlapping($today, $today->addDays(6))->orderBy('starts_on')->get();
        $absentToday = $leave->filter(fn (LeaveRecord $r) => $r->starts_on->lte($today) && $r->ends_on->gte($today))->values();
        $tasks = $this->monthTasks();
        $period = EvaluationPeriod::whereIn('status', [EvaluationPeriod::OPEN, EvaluationPeriod::DISCLOSED])->orderByDesc('year')->orderByDesc('month')->first();
        $evaluation = $period ? $this->periodProgress($period) : null;
        $units = $this->units($employees, $tasks['by_unit']);

        return response()->json([
            'today' => $today->toDateString(),
            'personnel' => [
                'total' => $employees->count(),
                'by_audience' => collect(EvaluationTemplate::AUDIENCES)->map(fn ($label, $audience) => [
                    'audience' => $audience, 'label' => $label,
                    'count' => $employees->filter(fn (Employee $e) => EvaluationTemplate::audienceOf($e->user) === $audience)->count(),
                ])->values(),
                'absent_today' => $absentToday->count(),
                'absent_week' => $leave->pluck('employee_id')->unique()->count(),
                'absent' => $absentToday->map(fn (LeaveRecord $r) => [
                    'name' => $r->employee?->user?->name, 'type' => $r->type, 'type_label' => LeaveRecord::TYPES[$r->type] ?? $r->type,
                    'until' => $r->ends_on->toDateString(),
                ]),
                'units' => $units,
            ],
            'tasks' => $tasks['summary'],
            'evaluation' => $evaluation,
            'library' => $this->library($today),
            'results' => $this->results(),
            'attention' => $this->attention($tasks['summary'], $evaluation, $units, $today),
        ]);
    }

    private function monthTasks(): array
    {
        $start = now()->startOfMonth();
        $tasks = Task::with(['employees:id', 'departments:id'])->where('status', '!=', Task::CANCELLED)
            ->whereBetween('due_at', [$start, $start->copy()->endOfMonth()])->get(['id', 'status', 'due_at']);
        $isOverdue = fn (Task $t) => in_array($t->status, [Task::NOT_STARTED, Task::IN_PROGRESS], true) && $t->due_at->isPast();
        $completed = $tasks->where('status', Task::COMPLETED)->count();
        $due = $tasks->filter(fn (Task $t) => $t->due_at->lte(now()) || $t->status === Task::COMPLETED)->count();
        $staleWaiting = Task::where('status', Task::WAITING_APPROVAL)->whereHas('submissions', fn ($q) => $q->where('submitted_at', '<', now()->subDays(3)))->count();

        return [
            'summary' => [
                'period' => $start->format('m/Y'),
                'assigned' => $tasks->count(), 'completed' => $completed,
                'waiting' => $tasks->where('status', Task::WAITING_APPROVAL)->count(),
                'overdue' => $tasks->filter($isOverdue)->count(),
                'overdue_all' => Task::whereIn('status', [Task::NOT_STARTED, Task::IN_PROGRESS])->where('due_at', '<', now())->count(),
                'stale_waiting' => $staleWaiting,
                'completion_rate' => $due ? round($completed / $due * 100, 1) : null,
            ],
            'by_unit' => $tasks,
        ];
    }

    private function units(Collection $employees, Collection $tasks): Collection
    {
        return Department::ordered()->whereNull('parent_id')->map(function ($unit) use ($employees, $tasks) {
            $ids = Department::withDescendants([$unit['id']]);
            $members = $employees->filter(fn (Employee $e) => array_intersect($e->unitIds(), $ids) !== []);
            $memberIds = $members->pluck('id');
            $own = $tasks->filter(fn (Task $t) => $t->employees->pluck('id')->intersect($memberIds)->isNotEmpty() || $t->departments->pluck('id')->intersect($ids)->isNotEmpty());
            $due = $own->filter(fn (Task $t) => $t->due_at->lte(now()) || $t->status === Task::COMPLETED)->count();

            return [
                'id' => $unit['id'], 'name' => $unit['name'], 'members' => $members->count(),
                'tasks' => $own->count(),
                'completion_rate' => $due ? round($own->where('status', Task::COMPLETED)->count() / $due * 100, 1) : null,
                'due' => $due,
            ];
        })->filter(fn ($unit) => $unit['members'] > 0)->sortByDesc('members')->values();
    }

    private function periodProgress(EvaluationPeriod $period): array
    {
        $sheets = $period->evaluations()->get(['id', 'status', 'audience', 'leader_scored_at']);

        return [
            'id' => $period->id, 'label' => $period->label(), 'status' => $period->status,
            'status_label' => $period->status === EvaluationPeriod::DISCLOSED ? 'Chờ giải trình' : 'Đang chấm',
            'self_due_on' => $period->self_due_on?->toDateString(), 'unit_due_on' => $period->unit_due_on?->toDateString(),
            'total' => $sheets->count(),
            'submitted' => $sheets->where('status', '!=', Evaluation::DRAFT)->count(),
            'scored' => $sheets->whereIn('status', [Evaluation::UNIT_SCORED, Evaluation::PUBLISHED])->count(),
            'awaiting_leader' => $sheets->filter(fn (Evaluation $e) => $e->audience === EvaluationTemplate::TEACHER && $e->status === Evaluation::UNIT_SCORED && ! $e->leader_scored_at)->count(),
        ];
    }

    private function library(CarbonImmutable $today): array
    {
        $files = LibraryNode::where('type', LibraryNode::FILE);

        return [
            'files' => (clone $files)->count(),
            'bytes' => (int) DB::table('library_nodes')->join('files', 'files.id', '=', 'library_nodes.file_id')->where('library_nodes.type', LibraryNode::FILE)->sum('files.size'),
            'new_week' => (clone $files)->where('created_at', '>=', $today->subDays(6))->count(),
            'folders' => LibraryNode::where('type', LibraryNode::FOLDER)->count(),
        ];
    }

    private function results(): ?array
    {
        $periods = EvaluationPeriod::where('status', EvaluationPeriod::PUBLISHED)->orderByDesc('year')->orderByDesc('month')->limit(2)->get();
        if ($periods->isEmpty()) {
            return null;
        }
        $summary = function (EvaluationPeriod $period) {
            $sheets = $period->evaluations()->with('template:id,grades')->get(['id', 'template_id', 'grade', 'total_score', 'no_grade_reason']);
            $names = $sheets->mapWithKeys(fn (Evaluation $e) => collect($e->template?->grades ?? [])->pluck('name', 'code')->all());
            $order = $sheets->flatMap(fn (Evaluation $e) => collect($e->template?->grades ?? [])->pluck('code'))->unique()->values();
            $counts = $sheets->whereNotNull('grade')->countBy('grade');
            $scored = $sheets->whereNotNull('total_score');

            return [
                'id' => $period->id, 'label' => $period->label(), 'total' => $sheets->count(),
                'grades' => $order->map(fn ($code) => ['code' => $code, 'name' => $names[$code] ?? $code, 'count' => $counts->get($code, 0)])->values(),
                'no_grade' => $sheets->whereNull('grade')->count(),
                'average' => $scored->isEmpty() ? null : round($scored->avg(fn (Evaluation $e) => (float) $e->total_score), 1),
            ];
        };

        return ['current' => $summary($periods[0]), 'previous' => isset($periods[1]) ? $summary($periods[1]) : null];
    }

    private function attention(array $tasks, ?array $evaluation, Collection $units, CarbonImmutable $today): array
    {
        $items = [];
        if ($tasks['overdue_all'] > 0) {
            $items[] = ['tone' => 'bad', 'text' => "{$tasks['overdue_all']} công việc đã quá hạn nhưng chưa nộp", 'link' => ['tasks' => ['action' => 'overdue']]];
        }
        if ($tasks['stale_waiting'] > 0) {
            $items[] = ['tone' => 'warn', 'text' => "{$tasks['stale_waiting']} công việc đã nộp quá 3 ngày vẫn chờ duyệt", 'link' => ['tasks' => ['status' => 'waiting_approval']]];
        }
        if ($evaluation) {
            $left = $evaluation['self_due_on'] ? $today->diffInDays(CarbonImmutable::parse($evaluation['self_due_on']), false) : null;
            $missing = $evaluation['total'] - $evaluation['submitted'];
            if ($evaluation['status'] === EvaluationPeriod::OPEN && $missing > 0 && $left !== null && $left <= 3) {
                $items[] = ['tone' => $left < 0 ? 'bad' : 'warn', 'text' => ($left < 0 ? 'Đã quá hạn tự chấm' : "Còn {$left} ngày tới hạn tự chấm")." {$evaluation['label']}, {$missing} phiếu chưa nộp", 'link' => ['route' => "/evaluations?tab=board&period={$evaluation['id']}&status=draft"]];
            }
            if ($evaluation['awaiting_leader'] > 0) {
                $items[] = ['tone' => 'warn', 'text' => "{$evaluation['awaiting_leader']} phiếu giáo viên đang chờ Ban giám hiệu chấm", 'link' => ['route' => "/evaluations?tab=board&period={$evaluation['id']}"]];
            }
        }
        $month = $today->startOfMonth();
        $unexcused = LeaveRecord::where('type', LeaveRecord::UNEXCUSED)->overlapping($month, $month->endOfMonth())->count();
        if ($unexcused > 0) {
            $items[] = ['tone' => 'bad', 'text' => "{$unexcused} lượt nghỉ không phép trong tháng", 'link' => ['route' => '/personnel/leave']];
        }
        $weakest = $units->filter(fn ($u) => $u['due'] >= 3 && $u['completion_rate'] !== null)->sortBy('completion_rate')->first();
        if ($weakest && $tasks['completion_rate'] !== null && $weakest['completion_rate'] <= $tasks['completion_rate'] - 10) {
            $items[] = ['tone' => 'warn', 'text' => "{$weakest['name']} có tỷ lệ hoàn thành thấp nhất: {$weakest['completion_rate']}% (toàn trường {$tasks['completion_rate']}%)", 'link' => ['route' => '/stats']];
        }

        return $items;
    }
}
