<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Evaluation;
use App\Models\EvaluationComment;
use App\Models\EvaluationCriterion;
use App\Models\EvaluationPeriod;
use App\Models\EvaluationScore;
use App\Models\EvaluationTemplate;
use App\Models\Role;
use App\Models\StoredFile;
use App\Models\Task;
use App\Models\Employee;
use App\Models\User;
use App\Notifications\EvaluationNotification;
use App\Notifications\EvaluationPeriodNotification;
use App\Services\EvaluationAccess;
use App\Services\EvaluationDirectory;
use App\Services\EvaluationScoring;
use App\Services\FileStore;
use App\Services\LeaveSummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class EvaluationController extends Controller
{
    private const STATUS_LABELS = [
        Evaluation::DRAFT => 'Chưa nộp', Evaluation::SUBMITTED => 'Đã nộp',
        Evaluation::UNIT_SCORED => 'Tổ đã chấm', Evaluation::PUBLISHED => 'Đã công bố',
    ];

    private array $criteriaCache = [];

    private array $templateCache = [];

    private ?Collection $assignableCache = null;

    private const SHEET_SCORER_RULES = [
        'sheet_scorers' => ['sometimes', 'array'],
        'sheet_scorers.*.teacher_id' => ['required', 'integer'],
        'sheet_scorers.*.user_ids' => ['present', 'array'],
        'sheet_scorers.*.user_ids.*' => ['integer', 'exists:users,id'],
        'sheet_scorers.*.column' => ['sometimes', 'in:unit,leader'],
    ];

    public function __construct(private EvaluationScoring $scoring, private FileStore $store, private EvaluationDirectory $directory, private LeaveSummary $leave) {}

    public function periods(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $own = $request->user()->employee?->id;
        $periods = EvaluationPeriod::withCount('evaluations')->orderByDesc('year')->orderByDesc('month')->get();
        $mine = $own ? Evaluation::with('scores')->where('teacher_id', $own)->get()->keyBy('period_id') : collect();

        return response()->json([
            'data' => $periods->map(fn (EvaluationPeriod $period) => [
                ...$this->periodData($period),
                'evaluations_count' => $period->evaluations_count,
                'my_evaluation' => ($evaluation = $mine->get($period->id)) ? [
                    'id' => $evaluation->id, 'status' => $evaluation->status, 'status_label' => self::STATUS_LABELS[$evaluation->status],
                    'audience' => $evaluation->audience,
                    'self_total' => $evaluation->status === Evaluation::DRAFT ? null : $this->scoring->totals($evaluation, $this->criteria($evaluation), 'self')['total'],
                    'submitted_at' => $evaluation->submitted_at?->toIso8601String(),
                    'total_score' => $this->visibleResult($evaluation, $period) ? $this->number($evaluation->total_score) : null,
                    'max_base' => (float) $this->criteria($evaluation)->whereNull('parent_id')->where('kind', '!=', EvaluationCriterion::BONUS)
                        ->filter(fn ($section) => ! $section->homeroom_only || $evaluation->is_homeroom)->sum('max_score'),
                    'is_homeroom' => (bool) $evaluation->is_homeroom,
                    'grade' => $this->visibleResult($evaluation, $period) ? $this->gradeName($evaluation, $evaluation->grade) : null,
                ] : null,
            ])->values(),
            'abilities' => ['can_manage' => $access->manages(), 'can_score' => $access->manages() || $request->user()->hasPermission('evaluation.score')],
            'template' => ($template = EvaluationTemplate::where('is_active', true)->where('audience', EvaluationTemplate::TEACHER)->first()) ? ['id' => $template->id, 'name' => $template->name] : null,
        ]);
    }

    public function roster(Request $request): JsonResponse
    {
        $data = $request->validate(['period_id' => ['nullable', 'integer', 'exists:evaluation_periods,id']]);
        $period = isset($data['period_id']) ? EvaluationPeriod::findOrFail($data['period_id']) : null;
        $evaluations = $period
            ? $period->evaluations()->with('assignedScorers:id')->withCount(['scores', 'comments'])->get()->keyBy('teacher_id')
            : collect();
        $teachers = Employee::with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')->orderByDesc('department_employee.is_primary')])
            ->where(fn ($q) => $q->where('employment_status', '!=', 'terminated')->orWhereIn('id', $evaluations->keys()))
            ->get()
            ->sort(fn (Employee $a, Employee $b) => $this->directory->compareNames($a->user?->name, $b->user?->name))
            ->values();

        return response()->json([
            'period' => $period ? $this->periodData($period) : null,
            'template' => ($template = $period ? $period->template : EvaluationTemplate::where('is_active', true)->where('audience', EvaluationTemplate::TEACHER)->first()) ? ['id' => $template->id, 'name' => $template->name] : null,
            'templates' => collect(EvaluationTemplate::AUDIENCES)->map(fn ($label, $audience) => [
                'audience' => $audience, 'label' => $label,
                'active' => ($active = EvaluationTemplate::where('is_active', true)->where('audience', $audience)->first()) ? ['id' => $active->id, 'name' => $active->name] : null,
            ])->values(),
            'scorer_ids' => $period ? $period->scorers()->pluck('users.id') : [],
            'scorer_candidates' => $this->scorerCandidates(),
            'assignable_scorers' => $this->assignableScorers(),
            'units' => Department::orderBy('name')->get(['id', 'name', 'type', 'parent_id', 'is_active'])
                ->filter(fn (Department $unit) => $unit->is_active || $teachers->contains(fn ($t) => $t->departments->contains('id', $unit->id)))
                ->map(fn (Department $unit) => ['id' => $unit->id, 'name' => $unit->name, 'type' => $unit->type, 'parent_id' => $unit->parent_id])->values(),
            'data' => $teachers->map(function (Employee $teacher) use ($evaluations, $period) {
                $evaluation = $evaluations->get($teacher->id);
                $reason = $this->ineligibleReason($teacher);
                $locked = $evaluation && $evaluation->status !== Evaluation::DRAFT;

                return [
                    'teacher_id' => $teacher->id, 'name' => $teacher->user?->name, 'code' => $teacher->employee_code,
                    'audience' => $evaluation?->audience ?? EvaluationTemplate::audienceOf($teacher->user),
                    'avatar_url' => $this->avatar($teacher->user),
                    'unit_id' => $teacher->departments->first()?->id,
                    'other_units' => $teacher->departments->slice(1)->pluck('name')->values(),
                    'roles' => $this->leadershipRoles($teacher->user),
                    'eligible' => $reason === null, 'reason' => $reason,
                    'evaluation' => $evaluation ? [
                        'id' => $evaluation->id, 'status' => $evaluation->status, 'status_label' => $this->statusLabel($evaluation),
                        'scorer_ids' => $this->assignedIds($evaluation, Evaluation::UNIT), 'leader_scorer_ids' => $this->assignedIds($evaluation, Evaluation::LEADER),
                        'has_data' => $evaluation->status !== Evaluation::DRAFT || $evaluation->scores_count > 0 || $evaluation->comments_count > 0 || filled($evaluation->duties) || filled($evaluation->results),
                    ] : null,
                    'removable' => ! $evaluation || (! $period?->isLocked() && ! $locked),
                    'lock_reason' => $locked ? 'Phiếu đã nộp hoặc đã chấm. Trả phiếu về trước khi gỡ.' : null,
                ];
            }),
        ]);
    }

    public function openPeriod(Request $request): JsonResponse
    {
        $data = $request->validate([
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
            'self_due_on' => ['nullable', 'date'],
            'unit_due_on' => ['nullable', 'date', 'after_or_equal:self_due_on'],
            'teacher_ids' => ['required', 'array', 'min:1'],
            'teacher_ids.*' => ['integer', 'distinct'],
            'scorer_ids' => ['sometimes', 'array'],
            'scorer_ids.*' => ['integer', 'distinct', 'exists:users,id'],
            ...self::SHEET_SCORER_RULES,
        ], ['unit_due_on.after_or_equal' => 'Hạn tổ chấm phải sau hạn tự chấm.', 'teacher_ids.required' => 'Chọn ít nhất một nhân sự.', 'teacher_ids.min' => 'Chọn ít nhất một nhân sự.']);
        abort_if(EvaluationPeriod::where('year', $data['year'])->where('month', $data['month'])->exists(), 422, 'Kỳ đánh giá tháng này đã được mở.');
        $teachers = $this->eligibleOnly($data['teacher_ids']);
        $templates = $this->templatesFor($teachers);
        $this->assertScorers($teachers, $data['scorer_ids'] ?? []);

        $period = DB::transaction(function () use ($data, $templates, $request, $teachers) {
            $period = EvaluationPeriod::create([
                ...collect($data)->except(['teacher_ids', 'scorer_ids'])->all(), 'template_id' => ($templates[EvaluationTemplate::TEACHER] ?? collect($templates)->first())->id,
                'status' => EvaluationPeriod::OPEN, 'opened_by' => $request->user()->id,
            ]);
            $period->scorers()->sync($data['scorer_ids'] ?? []);
            $this->addEvaluations($period, $teachers, $templates);
            $this->syncSheetScorers($period, $data['sheet_scorers'] ?? []);

            return $period;
        });
        $period->load('evaluations.teacher.user', 'evaluations.period');
        $period->evaluations->each(fn (Evaluation $evaluation) => $this->notify($evaluation->teacher->user, $evaluation, $this->openMessage($period), 'evaluation_opened'));

        return response()->json(['message' => "Đã mở kỳ đánh giá {$period->label()} với {$period->evaluations->count()} phiếu.", 'data' => $this->periodData($period)], 201);
    }

    public function updatePeriod(Request $request, EvaluationPeriod $period): JsonResponse
    {
        abort_if($period->isLocked(), 422, 'Kỳ đánh giá đã công bố. Mở lại kỳ trước khi sửa.');
        $data = $request->validate([
            'self_due_on' => ['nullable', 'date'],
            'unit_due_on' => ['nullable', 'date', 'after_or_equal:self_due_on'],
            'teacher_ids' => ['sometimes', 'array', 'min:1'],
            'teacher_ids.*' => ['integer', 'distinct'],
            'scorer_ids' => ['sometimes', 'array'],
            'scorer_ids.*' => ['integer', 'distinct', 'exists:users,id'],
            ...self::SHEET_SCORER_RULES,
        ], ['unit_due_on.after_or_equal' => 'Hạn tổ chấm phải sau hạn tự chấm.', 'teacher_ids.min' => 'Kỳ đánh giá cần ít nhất một phiếu.']);
        $current = $period->evaluations()->with('teacher.user')->get();
        $wanted = collect($data['teacher_ids'] ?? $current->pluck('teacher_id'))->map(fn ($id) => (int) $id);
        $removed = $current->reject(fn (Evaluation $evaluation) => $wanted->contains((int) $evaluation->teacher_id))->values();
        $blocked = $removed->filter(fn (Evaluation $evaluation) => $evaluation->status !== Evaluation::DRAFT);
        abort_if($blocked->isNotEmpty(), 422, 'Không gỡ được phiếu đã nộp hoặc đã chấm của: '.$blocked->map(fn ($e) => $e->teacher->user?->name)->join(', ').'. Hãy trả phiếu về trước.');
        $added = $this->eligibleOnly($wanted->diff($current->pluck('teacher_id')->map(fn ($id) => (int) $id))->values()->all());
        $templates = $this->templatesFor($added);
        $kept = Employee::with('user.roles')->whereIn('id', $wanted)->get();
        $this->assertScorers($kept, $data['scorer_ids'] ?? $period->scorers()->pluck('users.id')->all());
        $dueChanged = array_key_exists('self_due_on', $data) && ($data['self_due_on'] ?? null) !== $period->self_due_on?->toDateString();

        DB::transaction(function () use ($period, $data, $added, $removed, $templates) {
            $period->update(collect($data)->except(['teacher_ids', 'scorer_ids'])->all());
            if (array_key_exists('scorer_ids', $data)) {
                $period->scorers()->sync($data['scorer_ids']);
            }
            $this->addEvaluations($period, $added, $templates);
            $removed->each(fn (Evaluation $evaluation) => $this->deleteEvaluation($evaluation));
            if (array_key_exists('sheet_scorers', $data)) {
                $this->syncSheetScorers($period, $data['sheet_scorers']);
            }
        });
        $period->refresh();
        $removed->each(fn (Evaluation $evaluation) => $this->notifyPeriod($evaluation->teacher->user, $period->label(), "Bạn không thuộc diện đánh giá kỳ {$period->label()}.", 'evaluation_removed'));
        $period->evaluations()->with(['teacher.user', 'period'])->get()->each(function (Evaluation $evaluation) use ($added, $dueChanged, $period) {
            if ($added->contains('id', $evaluation->teacher_id)) {
                $this->notify($evaluation->teacher->user, $evaluation, $this->openMessage($period), 'evaluation_opened');
            } elseif ($dueChanged && $period->self_due_on && $evaluation->status === Evaluation::DRAFT) {
                $this->notify($evaluation->teacher->user, $evaluation, "Hạn tự chấm kỳ {$period->label()} đổi thành {$period->self_due_on->format('d/m/Y')}.", 'evaluation_due_changed');
            }
        });

        $parts = array_filter([
            $added->isNotEmpty() ? "thêm {$added->count()} phiếu" : null,
            $removed->isNotEmpty() ? "gỡ {$removed->count()} phiếu" : null,
        ]);

        return response()->json(['message' => 'Đã cập nhật kỳ đánh giá'.($parts ? ' ('.implode(', ', $parts).')' : '').'.', 'data' => $this->periodData($period)]);
    }

    public function destroyPeriod(Request $request, EvaluationPeriod $period): JsonResponse
    {
        abort_if($period->isLocked(), 422, 'Không thể xóa kỳ đánh giá đã công bố.');
        $evaluations = $period->evaluations()->with('teacher.user')->withCount(['scores', 'comments'])->get();
        $hasData = $evaluations->contains(fn (Evaluation $e) => $e->status !== Evaluation::DRAFT || $e->scores_count > 0 || $e->comments_count > 0 || filled($e->duties) || filled($e->results));
        if ($hasData) {
            abort_unless(trim((string) $request->input('confirm_label')) === $period->label(), 422, "Kỳ đã có dữ liệu chấm. Nhập đúng “{$period->label()}” để xác nhận xóa.");
        }
        $label = $period->label();
        DB::transaction(function () use ($period, $evaluations) {
            $evaluations->each(fn (Evaluation $evaluation) => $this->deleteEvaluation($evaluation));
            $period->delete();
        });
        $evaluations->each(fn (Evaluation $evaluation) => $this->notifyPeriod($evaluation->teacher->user, $label, "Kỳ đánh giá {$label} đã được hủy.", 'evaluation_period_deleted'));

        return response()->json(['message' => "Đã xóa kỳ đánh giá {$label}."]);
    }

    public function disclose(Request $request, EvaluationPeriod $period): JsonResponse
    {
        abort_unless($period->status === EvaluationPeriod::OPEN, 422, 'Kỳ đánh giá không ở trạng thái đang chấm.');
        $period->update(['status' => EvaluationPeriod::DISCLOSED, 'disclosed_at' => now()]);
        $period->evaluations()->with(['teacher.user', 'period', 'scores'])->get()->each(function (Evaluation $evaluation) use ($period) {
            $this->refreshResult($evaluation);
            $this->notify($evaluation->teacher->user, $evaluation, "Đã có kết quả dự kiến {$period->label()}. Bạn có thể xem và gửi giải trình trước khi công bố.", 'evaluation_disclosed');
        });

        return response()->json(['message' => 'Đã gửi kết quả dự kiến để nhân sự xem và giải trình.', 'data' => $this->periodData($period->fresh())]);
    }

    public function publish(Request $request, EvaluationPeriod $period): JsonResponse
    {
        abort_if($period->isLocked(), 422, 'Kỳ đánh giá đã công bố.');
        $waiting = $period->evaluations()->where('audience', EvaluationTemplate::TEACHER)->where('status', Evaluation::UNIT_SCORED)->whereNull('leader_scored_at')->count();
        abort_if($waiting > 0, 422, "Còn {$waiting} phiếu giáo viên Ban giám hiệu chưa hoàn tất chấm.");
        DB::transaction(function () use ($period, $request) {
            $period->evaluations()->with(['period', 'scores'])->get()->each(function (Evaluation $evaluation) use ($request) {
                $this->refreshResult($evaluation);
                $suggested = $evaluation->no_grade_reason ? null : $this->suggestedGrade($evaluation)['code'] ?? null;
                $evaluation->update([
                    'status' => Evaluation::PUBLISHED, 'grade' => $evaluation->no_grade_reason ? null : ($evaluation->grade ?? $suggested),
                    'reviewed_by' => $evaluation->reviewed_by ?? $request->user()->id, 'reviewed_at' => $evaluation->reviewed_at ?? now(),
                ]);
            });
            $period->update(['status' => EvaluationPeriod::PUBLISHED, 'published_at' => now()]);
        });
        $period->evaluations()->with(['teacher.user', 'period'])->get()->each(fn (Evaluation $evaluation) => $this->notify($evaluation->teacher->user, $evaluation, "Kết quả đánh giá thi đua {$period->label()} đã được công bố.", 'evaluation_published'));

        return response()->json(['message' => "Đã công bố kết quả {$period->label()}.", 'data' => $this->periodData($period->fresh())]);
    }

    public function reopen(Request $request, EvaluationPeriod $period): JsonResponse
    {
        abort_unless($period->isLocked(), 422, 'Kỳ đánh giá chưa công bố.');
        DB::transaction(function () use ($period) {
            $period->evaluations()->where('status', Evaluation::PUBLISHED)->update(['status' => Evaluation::UNIT_SCORED]);
            $period->update(['status' => EvaluationPeriod::DISCLOSED, 'published_at' => null]);
        });

        return response()->json(['message' => 'Đã mở lại kỳ đánh giá để điều chỉnh.', 'data' => $this->periodData($period->fresh())]);
    }

    public function index(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $data = $request->validate([
            'period_id' => ['required', 'integer', 'exists:evaluation_periods,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'status' => ['nullable', Rule::in(array_keys(self::STATUS_LABELS))],
            'audience' => ['nullable', Rule::in(array_keys(EvaluationTemplate::AUDIENCES))],
            'search' => ['nullable', 'string', 'max:100'],
        ]);
        $period = EvaluationPeriod::with('template')->findOrFail($data['period_id']);
        $units = $access->scopeUnitIds();
        $leadershipScorer = $access->isPeriodScorer($period->id);
        $assignedHere = $access->isAssignedIn($period->id);
        abort_if($units === [] && ! $leadershipScorer && ! $assignedHere, 403, 'Bạn không có quyền xem phiếu của người khác.');
        $me = $request->user()->id;
        $own = $request->user()->employee?->id;

        $evaluations = Evaluation::with(['teacher.user', 'teacher.departments', 'scores', 'period', 'assignedScorers:id,name'])
            ->where('period_id', $period->id)
            ->when($units !== null, fn ($q) => $q->where('teacher_id', '!=', $own ?? 0))
            ->when($units !== null && ! $leadershipScorer, fn ($q) => $q->where(fn ($scope) => $scope
                ->where(fn ($t) => $t->where('audience', EvaluationTemplate::TEACHER)->whereHas('teacher', fn ($e) => $e->inUnits($units ?: [0])))
                ->when($assignedHere, fn ($b) => $b->orWhereHas('assignedScorers', fn ($u) => $u->where('users.id', $me)))))
            ->when($data['audience'] ?? null, fn ($q, $audience) => $q->where('audience', $audience))
            ->when($data['department_id'] ?? null, fn ($q, $unit) => $q->whereHas('teacher', fn ($t) => $t->inUnits([$unit])))
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when(trim($data['search'] ?? ''), fn ($q, $search) => $q->whereHas('teacher', fn ($t) => $t->where('employee_code', 'like', "%{$search}%")->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%"))))
            ->get()
            ->filter(fn (Evaluation $evaluation) => $access->canScore($evaluation) || $access->canScoreLeader($evaluation) || $access->canReview($evaluation))
            ->sort(fn (Evaluation $a, Evaluation $b) => $this->directory->compareNames($a->teacher->user?->name, $b->teacher->user?->name))
            ->values();

        $notIncluded = $access->manages()
            ? Employee::with('user.roles')->where('employment_status', 'working')->whereNotIn('id', $period->evaluations()->pluck('teacher_id'))->get()
                ->filter(fn (Employee $teacher) => $this->ineligibleReason($teacher) === null)->map(fn (Employee $teacher) => $teacher->user?->name)->sort()->values()
            : null;

        return response()->json([
            'period' => $this->periodData($period),
            'not_included' => $notIncluded,
            'audiences' => $evaluations->pluck('audience')->unique()->values(),
            'data' => $evaluations->map(function (Evaluation $evaluation) use ($access) {
                $criteria = $this->criteria($evaluation);
                $self = $this->scoring->totals($evaluation, $criteria, 'self');
                $unit = $this->scoring->totals($evaluation, $criteria, 'unit');
                $final = $this->scoring->totals($evaluation, $criteria, 'final');
                $unitDone = $evaluation->status === Evaluation::UNIT_SCORED
                    || ($evaluation->status === Evaluation::PUBLISHED && $evaluation->scores->contains(fn (EvaluationScore $score) => $score->unit_score !== null));
                $leaderStarted = $evaluation->scores->contains(fn (EvaluationScore $score) => $score->leader_score !== null);

                return [
                    'id' => $evaluation->id,
                    'teacher' => $this->teacherData($evaluation->teacher),
                    'audience' => $evaluation->audience,
                    'is_homeroom' => $evaluation->is_homeroom,
                    'status' => $evaluation->status, 'status_label' => $this->statusLabel($evaluation),
                    'self_total' => $evaluation->status === Evaluation::DRAFT ? null : $self['total'],
                    'unit_total' => $unitDone ? $unit['total'] : null,
                    'unit_in_progress' => ! $unitDone && $evaluation->status === Evaluation::SUBMITTED && $evaluation->scores->contains(fn (EvaluationScore $score) => $score->unit_score !== null),
                    'has_leader_column' => $evaluation->hasLeaderColumn(),
                    'leader_total' => $evaluation->hasLeaderColumn() && ($evaluation->leader_scored_at || $leaderStarted) ? $this->scoring->totals($evaluation, $criteria, 'leader')['total'] : null,
                    'leader_done' => $evaluation->leader_scored_at !== null,
                    'leader_in_progress' => $evaluation->hasLeaderColumn() && ! $evaluation->leader_scored_at && $leaderStarted,
                    'final_total' => $unitDone ? $final['total'] : null,
                    'reviewed' => $evaluation->reviewed_at !== null,
                    'grade' => $this->gradeName($evaluation, $evaluation->grade),
                    'suggested_grade' => $evaluation->no_grade_reason || ! $unitDone ? null : $this->suggestedGrade($evaluation, $final['total'])['name'] ?? null,
                    'no_grade_reason' => $evaluation->no_grade_reason,
                    'has_violation' => $evaluation->has_violation,
                    'submitted_at' => $evaluation->submitted_at?->toIso8601String(),
                    'unit_scored_at' => $evaluation->unit_scored_at?->toIso8601String(),
                    ...$this->directory->placement($evaluation->teacher),
                    'comments_count' => $evaluation->comments()->count(),
                    'can_score' => $access->canScore($evaluation),
                    'can_score_leader' => $access->canScoreLeader($evaluation),
                    'can_review' => $access->canReview($evaluation),
                    'assigned_scorers' => $evaluation->assignedScorers->filter(fn (User $user) => $user->pivot->column === Evaluation::UNIT)->pluck('name')->values(),
                    'assigned_leader_scorers' => $evaluation->assignedScorers->filter(fn (User $user) => $user->pivot->column === Evaluation::LEADER)->pluck('name')->values(),
                ];
            }),
            'units' => $units === null ? Department::orderBy('name')->get(['id', 'name', 'type'])->map(fn ($d) => ['id' => $d->id, 'name' => Department::pathLabel($d->id)])->values() : Department::whereIn('id', $units)->get(['id'])->map(fn ($d) => ['id' => $d->id, 'name' => Department::pathLabel($d->id)])->values(),
        ]);
    }

    public function show(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->canView($evaluation), 403, 'Bạn không có quyền xem phiếu đánh giá này.');

        return response()->json(['data' => $this->detail($evaluation, $access)]);
    }

    public function saveSelf(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->isOwn($evaluation), 403, 'Bạn chỉ tự chấm được phiếu của mình.');
        abort_unless($this->selfEditable($evaluation), 422, 'Phiếu đã nộp, không sửa được nữa.');
        $data = $this->validateScores($request, $evaluation, 'self', true);
        $submit = $request->boolean('submit');

        DB::transaction(function () use ($evaluation, $data, $submit) {
            $evaluation->update([
                'is_homeroom' => $data['is_homeroom'] ?? $evaluation->is_homeroom,
                'duties' => $data['duties'] ?? $evaluation->duties,
                'results' => $data['results'] ?? $evaluation->results,
                ...($submit ? ['status' => Evaluation::SUBMITTED, 'submitted_at' => now()] : []),
            ]);
            $this->writeScores($evaluation, $data['scores'] ?? [], 'self');
        });
        if ($submit) {
            $this->scorers($evaluation)->each(fn (User $user) => $this->notify($user, $evaluation, "{$request->user()->name} đã nộp phiếu tự đánh giá {$evaluation->period->label()}.", 'evaluation_submitted'));
        }

        return response()->json(['message' => $submit ? 'Đã nộp phiếu tự đánh giá.' : 'Đã lưu nháp.', 'data' => $this->detail($evaluation->fresh(), $access)]);
    }

    public function saveUnit(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->canScore($evaluation), 403, 'Bạn không có quyền chấm phiếu này.');
        abort_if($evaluation->period->isLocked(), 422, 'Kỳ đánh giá đã công bố.');
        abort_if($evaluation->status === Evaluation::DRAFT && ! $access->manages(), 422, 'Người được đánh giá chưa nộp phiếu tự đánh giá.');
        abort_if($evaluation->hasLeaderColumn() && $evaluation->leader_scored_at, 422, 'Ban giám hiệu đã hoàn tất chấm, tổ không sửa điểm được nữa. Trả phiếu về nếu cần chấm lại.');
        $data = $this->validateScores($request, $evaluation, 'unit', false);
        $complete = $request->boolean('complete');

        DB::transaction(function () use ($evaluation, $data, $complete, $request) {
            $evaluation->update([
                'is_homeroom' => $data['is_homeroom'] ?? $evaluation->is_homeroom,
                ...($complete ? ['status' => Evaluation::UNIT_SCORED, 'unit_scored_by' => $request->user()->id, 'unit_scored_at' => now(), 'submitted_at' => $evaluation->submitted_at ?? now()] : []),
            ]);
            $this->writeScores($evaluation, $data['scores'] ?? [], 'unit');
            $this->refreshResult($evaluation->fresh(['scores', 'period']));
        });
        if ($complete && $evaluation->hasLeaderColumn()) {
            $this->leaderScorers($evaluation)->reject(fn (User $user) => $user->id === $request->user()->id)
                ->each(fn (User $user) => $this->notify($user, $evaluation, "Tổ đã chấm xong phiếu {$evaluation->period->label()} của {$evaluation->teacher->user?->name}. Mời Ban giám hiệu chấm.", 'evaluation_unit_scored'));
        }

        return response()->json(['message' => $complete ? 'Đã hoàn tất chấm phiếu.' : ($evaluation->scoredByLeadership() ? 'Đã lưu điểm BGH đánh giá.' : 'Đã lưu điểm tổ chấm.'), 'data' => $this->detail($evaluation->fresh(), $access)]);
    }

    public function saveLeader(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->canScoreLeader($evaluation), 403, 'Bạn không có quyền chấm cột BGH đánh giá của phiếu này.');
        abort_if($evaluation->period->isLocked(), 422, 'Kỳ đánh giá đã công bố.');
        abort_unless($evaluation->status === Evaluation::UNIT_SCORED, 422, 'Tổ chưa hoàn tất chấm phiếu này.');
        $data = $this->validateScores($request, $evaluation, 'leader', false);
        $complete = $request->boolean('complete');

        DB::transaction(function () use ($evaluation, $data, $complete, $request) {
            if ($complete) {
                $evaluation->update(['leader_scored_by' => $request->user()->id, 'leader_scored_at' => now()]);
            }
            $this->writeScores($evaluation, $data['scores'] ?? [], 'leader');
            $this->refreshResult($evaluation->fresh(['scores', 'period']));
        });

        return response()->json(['message' => $complete ? 'Ban giám hiệu đã hoàn tất chấm phiếu.' : 'Đã lưu điểm BGH đánh giá.', 'data' => $this->detail($evaluation->fresh(), $access)]);
    }

    public function returnToTeacher(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->canScore($evaluation) || $access->canScoreLeader($evaluation), 403, 'Bạn không có quyền trả phiếu này.');
        abort_if($evaluation->period->isLocked() || $evaluation->status === Evaluation::DRAFT, 422, 'Phiếu không ở trạng thái trả về được.');
        $data = $request->validate(['message' => ['required', 'string', 'max:2000']], ['message.required' => 'Nhập lý do trả phiếu.']);

        DB::transaction(function () use ($evaluation, $data, $request) {
            $evaluation->update(['status' => Evaluation::DRAFT, 'submitted_at' => null, 'unit_scored_by' => null, 'unit_scored_at' => null, 'leader_scored_by' => null, 'leader_scored_at' => null]);
            EvaluationComment::create(['evaluation_id' => $evaluation->id, 'user_id' => $request->user()->id, 'content' => 'Trả phiếu: '.$data['message']]);
        });
        $this->notify($evaluation->teacher->user, $evaluation, "Phiếu đánh giá {$evaluation->period->label()} được trả về: {$data['message']}", 'evaluation_returned');

        return response()->json(['message' => 'Đã trả phiếu về cho người tự đánh giá.', 'data' => $this->detail($evaluation->fresh(), $access)]);
    }

    public function review(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->manages(), 403, 'Bạn không có quyền duyệt phiếu đánh giá.');
        abort_if($access->isOwn($evaluation), 403, 'Bạn không duyệt được phiếu của chính mình.');
        abort_if($evaluation->period->isLocked(), 422, 'Kỳ đánh giá đã công bố.');
        $grades = collect($this->template($evaluation)->grades)->pluck('code')->all();
        $data = $request->validate([
            'has_violation' => ['sometimes', 'boolean'],
            'no_grade_reason' => ['nullable', 'string', 'max:255'],
            'grade' => ['nullable', Rule::in($grades)],
        ]);
        $approve = $request->boolean('approve', true);
        abort_if($approve && ! in_array($evaluation->status, [Evaluation::UNIT_SCORED, Evaluation::PUBLISHED], true), 422, 'Phiếu chưa được chấm xong, chưa duyệt được.');
        abort_if($approve && $evaluation->awaitsLeader(), 422, 'Ban giám hiệu chưa hoàn tất chấm phiếu này, chưa duyệt được.');

        DB::transaction(function () use ($evaluation, $data, $request, $approve) {
            $evaluation->update([
                'has_violation' => $data['has_violation'] ?? $evaluation->has_violation,
                'no_grade_reason' => array_key_exists('no_grade_reason', $data) ? (trim((string) $data['no_grade_reason']) ?: null) : $evaluation->no_grade_reason,
                'grade' => array_key_exists('grade', $data) ? $data['grade'] : $evaluation->grade,
                ...($approve ? ['reviewed_by' => $request->user()->id, 'reviewed_at' => now()] : []),
            ]);
            $this->refreshResult($evaluation->fresh(['scores', 'period']));
        });

        return response()->json(['message' => $approve ? 'Đã duyệt phiếu.' : 'Đã lưu nháp duyệt.', 'data' => $this->detail($evaluation->fresh(), $access)]);
    }

    public function assignScorers(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->manages(), 403, 'Bạn không có quyền chỉ định người chấm.');
        abort_if($access->isOwn($evaluation), 403, 'Bạn không chỉ định người chấm cho phiếu của chính mình.');
        abort_if($evaluation->period->isLocked(), 422, 'Kỳ đánh giá đã công bố.');
        $data = $request->validate([
            'user_ids' => ['present', 'array'], 'user_ids.*' => ['integer', 'distinct', 'exists:users,id'],
            'column' => ['sometimes', Rule::in([Evaluation::UNIT, Evaluation::LEADER])],
        ]);
        $column = $data['column'] ?? Evaluation::UNIT;
        $this->assignTo($evaluation, $data['user_ids'], $column);
        $names = $evaluation->scorersFor($column)->pluck('name');

        return response()->json([
            'message' => $names->isEmpty() ? 'Phiếu dùng lại người chấm mặc định.' : 'Đã chỉ định người chấm: '.$names->join(', ').'.',
            'data' => $this->detail($evaluation->fresh(), $access),
        ]);
    }

    public function comment(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->canView($evaluation), 403);
        $data = $request->validate(['content' => ['required', 'string', 'max:3000']]);
        EvaluationComment::create(['evaluation_id' => $evaluation->id, 'user_id' => $request->user()->id, 'content' => $data['content']]);
        $recipients = $access->isOwn($evaluation) ? $this->scorers($evaluation) : collect([$evaluation->teacher->user]);
        $recipients->each(fn (User $user) => $this->notify($user, $evaluation, "{$request->user()->name}: {$data['content']}", 'evaluation_comment'));

        return response()->json(['message' => 'Đã gửi.', 'data' => $this->detail($evaluation->fresh(), $access)], 201);
    }

    public function duties(Request $request, Evaluation $evaluation): JsonResponse
    {
        abort_unless($this->access($request)->canView($evaluation), 403);
        $period = $evaluation->period;
        $start = Carbon::create($period->year, $period->month, 1)->startOfDay();
        $end = $start->copy()->endOfMonth();
        $teacher = $evaluation->teacher;
        $units = $teacher->unitIds();

        $tasks = Task::where(fn ($q) => $q
            ->whereHas('employees', fn ($t) => $t->where('employees.id', $teacher->id))
            ->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', $units ?: [0])))
            ->where('status', '!=', Task::CANCELLED)
            ->whereRaw('COALESCE(starts_at, created_at) <= ?', [$end])
            ->whereRaw('COALESCE(completed_at, due_at, ?) >= ?', [$end, $start])
            ->orderBy('due_at')->get(['id', 'code', 'title', 'status', 'due_at', 'completed_at']);

        return response()->json(['data' => $tasks->map(fn (Task $task) => [
            'code' => $task->code, 'title' => $task->title, 'status' => $task->status,
            'due_at' => $task->due_at?->toIso8601String(), 'completed_at' => $task->completed_at?->toIso8601String(),
        ])]);
    }

    public function uploadEvidence(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        $criteria = $this->criteria($evaluation);
        $data = $request->validate([
            'criterion_id' => ['required', Rule::in($criteria->whereNotNull('parent_id')->where('requires_evidence', true)->pluck('id')->all())],
            'files' => ['required', 'array', 'max:10'],
            'files.*' => ['file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,jpg,jpeg,png'],
        ], ['files.*.mimes' => 'Định dạng file không được hỗ trợ.', 'files.*.max' => 'Mỗi file tối đa 20MB.']);
        abort_unless(($access->isOwn($evaluation) && $this->selfEditable($evaluation)) || ($access->canScore($evaluation) && ! $evaluation->period->isLocked()), 403, 'Bạn không thể thêm minh chứng cho phiếu này.');

        $score = EvaluationScore::firstOrCreate(['evaluation_id' => $evaluation->id, 'criterion_id' => $data['criterion_id']]);
        foreach ($request->file('files') as $uploaded) {
            $file = $this->store->store($uploaded, 'evaluations', $request->user());
            DB::table('file_attachments')->insert(['file_id' => $file->id, 'attachable_type' => EvaluationScore::class, 'attachable_id' => $score->id, 'purpose' => 'evidence', 'created_at' => now(), 'updated_at' => now()]);
        }

        return response()->json(['message' => 'Đã thêm minh chứng.', 'data' => $this->detail($evaluation->fresh(), $access)], 201);
    }

    public function removeEvidence(Request $request, Evaluation $evaluation, StoredFile $file): JsonResponse
    {
        $access = $this->access($request);
        $attachment = $this->evidenceAttachment($evaluation, $file);
        $canEdit = ($access->isOwn($evaluation) && $this->selfEditable($evaluation)) || ($access->canScore($evaluation) && ! $evaluation->period->isLocked());
        abort_unless($canEdit && ((int) $file->uploaded_by === $request->user()->id || $access->manages()), 403, 'Bạn không thể xóa minh chứng này.');
        DB::table('file_attachments')->where('id', $attachment->id)->delete();
        $this->store->releaseIfUnused($file->id);

        return response()->json(['message' => 'Đã xóa minh chứng.', 'data' => $this->detail($evaluation->fresh(), $access)]);
    }

    public function downloadEvidence(Request $request, Evaluation $evaluation, StoredFile $file)
    {
        abort_unless($this->access($request)->canView($evaluation), 403);
        $this->evidenceAttachment($evaluation, $file);
        abort_unless(Storage::disk($file->disk)->exists($file->path), 404, 'File không tồn tại.');

        return Storage::disk($file->disk)->response($file->path, $file->original_name, ['Content-Type' => $file->mime_type ?: 'application/octet-stream'], 'inline');
    }

    private function evidenceAttachment(Evaluation $evaluation, StoredFile $file): object
    {
        $attachment = DB::table('file_attachments')->where('file_id', $file->id)->where('attachable_type', EvaluationScore::class)
            ->whereIn('attachable_id', EvaluationScore::where('evaluation_id', $evaluation->id)->pluck('id'))->first();
        abort_unless($attachment, 404, 'Không tìm thấy minh chứng.');

        return $attachment;
    }

    private function validateScores(Request $request, Evaluation $evaluation, string $column, bool $withText): array
    {
        $criteria = $this->criteria($evaluation);
        $data = $request->validate([
            'is_homeroom' => ['sometimes', 'boolean'],
            ...($withText ? ['duties' => ['nullable', 'string', 'max:10000'], 'results' => ['nullable', 'string', 'max:10000']] : []),
            'scores' => ['sometimes', 'array'],
            'scores.*.criterion_id' => ['required', Rule::in($criteria->whereNotNull('parent_id')->pluck('id')->all())],
            'scores.*.score' => ['nullable', 'numeric', 'min:0'],
            'scores.*.note' => ['nullable', 'string', 'max:2000'],
        ]);
        $this->assertWithinMax($data['scores'] ?? [], $criteria);

        return $data;
    }

    private function assertWithinMax(array $rows, Collection $criteria): void
    {
        foreach ($rows as $row) {
            $criterion = $criteria->firstWhere('id', (int) $row['criterion_id']);
            if (isset($row['score']) && $row['score'] !== null && (float) $row['score'] > (float) $criterion->max_score) {
                abort(422, "Điểm tiêu chí “{$criterion->title}” tối đa {$this->number($criterion->max_score)}.");
            }
        }
    }

    private function writeScores(Evaluation $evaluation, array $rows, string $column): void
    {
        foreach ($rows as $row) {
            EvaluationScore::updateOrCreate(
                ['evaluation_id' => $evaluation->id, 'criterion_id' => $row['criterion_id']],
                [$column.'_score' => $row['score'] ?? null, $column.'_note' => trim((string) ($row['note'] ?? '')) ?: null],
            );
        }
    }

    private function refreshResult(Evaluation $evaluation): void
    {
        $evaluation->loadMissing(['scores', 'period']);
        $total = $this->hasUnitScores($evaluation) ? $this->scoring->totals($evaluation, $this->criteria($evaluation), 'final')['total'] : null;
        $evaluation->update(['total_score' => $total]);
    }

    private function suggestedGrade(Evaluation $evaluation, ?float $total = null): ?array
    {
        $total ??= (float) $evaluation->total_score;

        $evaluation->loadMissing('scores');

        return $this->scoring->grade($this->template($evaluation)->grades ?? [], $total, $evaluation->is_homeroom, $evaluation->has_violation, $this->scoring->hasZero($evaluation, $this->criteria($evaluation), 'final'));
    }

    private function addEvaluations(EvaluationPeriod $period, Collection $teachers, array $templates): void
    {
        foreach ($teachers as $teacher) {
            $audience = EvaluationTemplate::audienceOf($teacher->user);
            Evaluation::create([
                'period_id' => $period->id, 'teacher_id' => $teacher->id, 'audience' => $audience, 'template_id' => $templates[$audience]->id,
                'is_homeroom' => $audience === EvaluationTemplate::TEACHER && (bool) $teacher->user?->hasRole(Role::GVCN), 'status' => Evaluation::DRAFT,
            ]);
        }
    }

    private function templatesFor(Collection $employees): array
    {
        $needed = $employees->map(fn (Employee $employee) => EvaluationTemplate::audienceOf($employee->user))->unique();
        $active = EvaluationTemplate::where('is_active', true)->get()->keyBy('audience');
        $missing = $needed->reject(fn ($audience) => $active->has($audience));
        abort_if($missing->isNotEmpty(), 422, 'Chưa có bộ tiêu chí đang áp dụng cho: '.$missing->map(fn ($a) => EvaluationTemplate::AUDIENCES[$a])->join(', ').'.');

        return $active->all();
    }

    private function assertScorers(Collection $employees, array $scorerIds): void
    {
        abort_if($employees->isNotEmpty() && $scorerIds === [], 422, 'Chọn ít nhất một người chấm cột “BGH đánh giá”.');
    }

    private function syncSheetScorers(EvaluationPeriod $period, array $rows): void
    {
        $sheets = $period->evaluations()->with('teacher')->get()->keyBy('teacher_id');
        foreach ($rows as $row) {
            if ($evaluation = $sheets->get((int) $row['teacher_id'])) {
                $this->assignTo($evaluation, $row['user_ids'], $row['column'] ?? Evaluation::UNIT);
            }
        }
    }

    private function assignTo(Evaluation $evaluation, array $userIds, string $column = Evaluation::UNIT): void
    {
        abort_if($column === Evaluation::LEADER && ! $evaluation->hasLeaderColumn(), 422, 'Phiếu này không có cột BGH đánh giá riêng.');
        $ids = collect($userIds)->map(fn ($id) => (int) $id)->unique()->values();
        $allowed = $this->assignableScorers()->pluck('id');
        abort_if($ids->diff($allowed)->isNotEmpty(), 422, 'Có người được chọn không có quyền chấm phiếu thi đua.');
        abort_if($ids->contains((int) $evaluation->teacher->user_id), 422, 'Không thể chỉ định '.$evaluation->teacher->user?->name.' chấm phiếu của chính mình.');
        $evaluation->scorersFor($column)->sync($ids->all());
    }

    private function assignableScorers(): Collection
    {
        return $this->assignableCache ??= User::with('roles')->where('status', 'active')
            ->whereHas('roles.permissions', fn ($p) => $p->whereIn('code', ['evaluation.score', 'evaluation.manage']))
            ->orderBy('name')->get()
            ->map(fn (User $user) => ['id' => $user->id, 'name' => $user->name, 'avatar_url' => $this->avatar($user), 'roles' => $user->roleLabels(), 'employee_id' => $user->employee?->id])
            ->values();
    }

    private function scorerCandidates(): Collection
    {
        return User::with('roles')->where('status', 'active')
            ->whereHas('roles', fn ($r) => $r->whereIn('code', [Role::HIEU_TRUONG, Role::PHO_HIEU_TRUONG, Role::BAN_GIAM_HIEU, Role::THU_KY]))
            ->orderBy('name')->get()
            ->map(fn (User $user) => [
                'id' => $user->id, 'name' => $user->name, 'avatar_url' => $this->avatar($user), 'roles' => $user->roleLabels(),
                'employee_id' => $user->employee?->id, 'suggested' => $user->roles->contains('code', Role::BAN_GIAM_HIEU),
            ])->values();
    }

    private function deleteEvaluation(Evaluation $evaluation): void
    {
        $scoreIds = $evaluation->scores()->pluck('id');
        $attachments = DB::table('file_attachments')->where('attachable_type', EvaluationScore::class)->whereIn('attachable_id', $scoreIds);
        $fileIds = (clone $attachments)->pluck('file_id');
        $attachments->delete();
        DB::table('notifications')->where('data->evaluation_id', $evaluation->id)->delete();
        $evaluation->delete();
        $fileIds->unique()->each(fn ($id) => $this->store->releaseIfUnused((int) $id));
    }

    private function eligibleOnly(array $ids): Collection
    {
        $teachers = Employee::with('user.roles')->whereIn('id', $ids)->get();
        $invalid = $teachers->filter(fn (Employee $teacher) => $this->ineligibleReason($teacher) !== null);
        abort_if($invalid->isNotEmpty() || $teachers->count() !== count(array_unique($ids)), 422, 'Không thể tạo phiếu cho: '.($invalid->map(fn ($t) => $t->user?->name)->join(', ') ?: 'nhân sự không tồn tại').'.');

        return $teachers;
    }

    private function leadershipRoles(?User $user): array
    {
        if (! $user) {
            return [];
        }

        return $user->roles
            ->filter(fn (Role $role) => $role->code !== Role::GIAO_VIEN && ($role->pivot->expires_at === null || Carbon::parse($role->pivot->expires_at)->isFuture()))
            ->map(fn (Role $role) => ['name' => $role->name, 'unit_id' => $role->pivot->department_id ? (int) $role->pivot->department_id : null])
            ->values()->all();
    }

    private function ineligibleReason(Employee $teacher): ?string
    {
        $statuses = ['on_leave' => 'Nghỉ phép', 'suspended' => 'Tạm nghỉ', 'terminated' => 'Đã nghỉ việc'];
        if ($teacher->employment_status !== 'working') {
            return $statuses[$teacher->employment_status] ?? 'Không còn làm việc';
        }
        if ($teacher->user?->status !== 'active') {
            return 'Tài khoản đang bị khóa';
        }
        if (! $teacher->user->roles->contains(fn (Role $role) => in_array($role->code, [...Role::PROFILE_ROLES, Role::BAN_GIAM_HIEU], true))) {
            return 'Chưa có vai trò Giáo viên, Nhân viên hoặc Ban giám hiệu';
        }
        $role = $teacher->user->roles->first(fn (Role $role) => in_array($role->code, Role::NOT_EVALUATED, true)
            && ($role->pivot->expires_at === null || Carbon::parse($role->pivot->expires_at)->isFuture()));

        return $role ? "{$role->name} — không thuộc diện đánh giá" : null;
    }

    private function assignedIds(Evaluation $evaluation, string $column): Collection
    {
        return $evaluation->assignedScorers->filter(fn (User $user) => $user->pivot->column === $column)->pluck('id')->values();
    }

    private function leaderScorers(Evaluation $evaluation): Collection
    {
        $assigned = $evaluation->scorersFor(Evaluation::LEADER)->where('users.id', '!=', $evaluation->teacher->user_id)->get();

        return $assigned->isNotEmpty() ? $assigned : $this->defaultLeaderScorers($evaluation);
    }

    private function defaultLeaderScorers(Evaluation $evaluation): Collection
    {
        return $evaluation->period->scorers()->where('users.id', '!=', $evaluation->teacher->user_id)->get();
    }

    private function scorers(Evaluation $evaluation): Collection
    {
        $assigned = $evaluation->scorersFor(Evaluation::UNIT)->where('users.id', '!=', $evaluation->teacher->user_id)->get();
        if ($assigned->isNotEmpty()) {
            return $assigned;
        }

        return $this->defaultScorers($evaluation);
    }

    private function defaultScorers(Evaluation $evaluation): Collection
    {
        if ($evaluation->scoredByLeadership()) {
            return $evaluation->period->scorers()->where('users.id', '!=', $evaluation->teacher->user_id)->get();
        }
        $leaders = User::whereHas('roles', fn ($r) => $r->whereIn('role_user.department_id', $evaluation->teacher->unitIds() ?: [0])
            ->where(fn ($q) => $q->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now())))
            ->where('id', '!=', $evaluation->teacher->user_id)->get()
            ->filter(fn (User $user) => ! $user->hasPermission('evaluation.manage') && $user->hasPermission('evaluation.score') && ! $evaluation->teacher->user?->hasRole(Role::TO_TRUONG));

        return $leaders->isNotEmpty() ? $leaders->values() : User::whereHas('roles', fn ($r) => $r->whereIn('code', Role::SCHOOL_LEADERS))->get()
            ->filter(fn (User $user) => $user->hasPermission('evaluation.manage'))->values();
    }

    private function notifyPeriod(?User $user, string $label, string $message, string $action): void
    {
        try {
            $user?->notify(new EvaluationPeriodNotification($label, $message, $action));
        } catch (\Throwable $exception) {
            Log::error('Không thể lưu thông báo đánh giá.', ['user_id' => $user?->id, 'error' => $exception->getMessage()]);
        }
    }

    private function notify(?User $user, Evaluation $evaluation, string $message, string $action): void
    {
        if (! $user) {
            return;
        }
        try {
            $user->notify(new EvaluationNotification($evaluation->loadMissing('period'), $message, $action));
        } catch (\Throwable $exception) {
            Log::error('Không thể lưu thông báo đánh giá.', ['user_id' => $user->id, 'evaluation_id' => $evaluation->id, 'error' => $exception->getMessage()]);
        }
    }

    private function openMessage(EvaluationPeriod $period): string
    {
        return "Kỳ đánh giá thi đua {$period->label()} đã mở".($period->self_due_on ? ', hạn tự chấm '.$period->self_due_on->format('d/m/Y') : '').'.';
    }

    private function selfEditable(Evaluation $evaluation): bool
    {
        return $evaluation->status === Evaluation::DRAFT && $evaluation->period->status === EvaluationPeriod::OPEN;
    }

    private function hasUnitScores(Evaluation $evaluation): bool
    {
        return in_array($evaluation->status, [Evaluation::UNIT_SCORED, Evaluation::PUBLISHED], true)
            || $evaluation->scores->contains(fn (EvaluationScore $score) => $score->unit_score !== null);
    }

    private function visibleResult(Evaluation $evaluation, EvaluationPeriod $period): bool
    {
        return in_array($period->status, [EvaluationPeriod::DISCLOSED, EvaluationPeriod::PUBLISHED], true);
    }

    private function detail(Evaluation $evaluation, EvaluationAccess $access): array
    {
        $evaluation->load(['period.template', 'template', 'teacher.user', 'teacher.departments', 'scores', 'comments.user', 'unitScorer', 'leaderScorer', 'reviewer']);
        $period = $evaluation->period;
        $criteria = $this->criteria($evaluation);
        $isOwn = $access->isOwn($evaluation);
        $canScore = $access->canScore($evaluation);
        $canLeader = $access->canScoreLeader($evaluation);
        $hasLeader = $evaluation->hasLeaderColumn();
        $manages = $access->manages();
        $showResult = ! $isOwn || $canScore || $canLeader || $this->visibleResult($evaluation, $period);
        $scores = $evaluation->scores->keyBy('criterion_id');
        $evidence = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')
            ->where('attachable_type', EvaluationScore::class)->whereIn('attachable_id', $evaluation->scores->pluck('id'))
            ->get(['file_attachments.attachable_id', 'files.id', 'files.original_name', 'files.mime_type', 'files.size', 'files.uploaded_by'])
            ->groupBy('attachable_id');
        $totals = [
            'self' => $this->scoring->totals($evaluation, $criteria, 'self'),
            'unit' => $showResult ? $this->scoring->totals($evaluation, $criteria, 'unit') : null,
            'leader' => $showResult && $hasLeader ? $this->scoring->totals($evaluation, $criteria, 'leader') : null,
            'final' => $showResult ? $this->scoring->totals($evaluation, $criteria, 'final') : null,
        ];
        $suggested = $showResult && ! $evaluation->no_grade_reason ? $this->suggestedGrade($evaluation, $totals['final']['total']) : null;
        $selfEditable = $isOwn && $this->selfEditable($evaluation);

        return [
            'id' => $evaluation->id,
            'period' => $this->periodData($period),
            'teacher' => $this->teacherData($evaluation->teacher),
            'audience' => $evaluation->audience,
            'audience_label' => EvaluationTemplate::AUDIENCES[$evaluation->audience] ?? null,
            'scorer_label' => EvaluationTemplate::SCORER_LABELS[$evaluation->audience] ?? 'Tổ chấm',
            'template_name' => $this->template($evaluation)->name,
            'assigned_scorers' => $evaluation->scorersFor(Evaluation::UNIT)->get()->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'avatar_url' => $this->avatar($u)])->values(),
            'default_scorers' => $this->defaultScorers($evaluation)->pluck('name')->values(),
            'has_leader_column' => $hasLeader,
            'assigned_leader_scorers' => $hasLeader ? $evaluation->scorersFor(Evaluation::LEADER)->get()->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'avatar_url' => $this->avatar($u)])->values() : [],
            'default_leader_scorers' => $hasLeader ? $this->defaultLeaderScorers($evaluation)->pluck('name')->values() : [],
            'scorer_candidates' => $manages && ! $isOwn ? $this->assignableScorers()->reject(fn ($u) => $u['employee_id'] === $evaluation->teacher_id)->values() : [],
            'is_homeroom' => $evaluation->is_homeroom,
            'duties' => $evaluation->duties,
            'results' => $evaluation->results,
            'status' => $evaluation->status, 'status_label' => $this->statusLabel($evaluation),
            'submitted_at' => $evaluation->submitted_at?->toIso8601String(),
            'unit_scored_by' => $evaluation->unitScorer?->name, 'unit_scored_at' => $evaluation->unit_scored_at?->toIso8601String(),
            'leader_scored_by' => $evaluation->leaderScorer?->name, 'leader_scored_at' => $evaluation->leader_scored_at?->toIso8601String(),
            'reviewed_by' => $evaluation->reviewer?->name, 'reviewed_at' => $evaluation->reviewed_at?->toIso8601String(),
            'show_result' => $showResult,
            'has_violation' => $showResult ? $evaluation->has_violation : null,
            'no_grade_reason' => $showResult ? $evaluation->no_grade_reason : null,
            'grade' => $showResult ? $evaluation->grade : null,
            'grade_name' => $showResult ? $this->gradeName($evaluation, $evaluation->grade) : null,
            'suggested_grade' => $suggested,
            'grades' => $this->template($evaluation)->grades,
            'bonus_max' => (float) ($criteria->firstWhere(fn ($c) => $c->parent_id === null && $c->kind === EvaluationCriterion::BONUS)?->max_score ?? 0),
            'sections' => $criteria->whereNull('parent_id')->sortBy('position')->values()->map(fn (EvaluationCriterion $section) => [
                'id' => $section->id, 'code' => $section->code, 'title' => $section->title, 'max_score' => (float) $section->max_score,
                'kind' => $section->kind, 'homeroom_only' => $section->homeroom_only,
                'criteria' => $criteria->where('parent_id', $section->id)->sortBy('position')->values()->map(function (EvaluationCriterion $criterion) use ($scores, $evidence, $showResult) {
                    $score = $scores->get($criterion->id);

                    return [
                        'id' => $criterion->id, 'code' => $criterion->code, 'title' => $criterion->title, 'guidance' => $criterion->guidance, 'max_score' => (float) $criterion->max_score,
                        'requires_evidence' => $criterion->requires_evidence, 'tracks_leave' => $criterion->tracks_leave,
                        'self_score' => $this->number($score?->self_score), 'self_note' => $score?->self_note,
                        'unit_score' => $showResult ? $this->number($score?->unit_score) : null, 'unit_note' => $showResult ? $score?->unit_note : null,
                        'leader_score' => $showResult ? $this->number($score?->leader_score) : null, 'leader_note' => $showResult ? $score?->leader_note : null,
                        'evidence' => $score ? ($evidence->get($score->id) ?? collect())->map(fn ($file) => [
                            'id' => $file->id, 'name' => $file->original_name, 'mime_type' => $file->mime_type, 'size' => (int) $file->size, 'uploaded_by' => (int) $file->uploaded_by,
                        ])->values() : [],
                    ];
                }),
            ]),
            'totals' => $totals,
            'leave' => $criteria->contains('tracks_leave', true) ? $this->leave->forMonth($evaluation->teacher_id, $period->year, $period->month) : null,
            'comments' => $evaluation->comments->map(fn (EvaluationComment $comment) => [
                'id' => $comment->id, 'content' => $comment->content, 'created_at' => $comment->created_at->toIso8601String(),
                'user' => ['id' => $comment->user->id, 'name' => $comment->user->name, 'avatar_url' => $this->avatar($comment->user)],
            ]),
            'abilities' => [
                'is_own' => $isOwn,
                'can_self_score' => $selfEditable,
                'can_unit_score' => $canScore && ! $period->isLocked() && ($evaluation->status !== Evaluation::DRAFT || $manages) && ! ($hasLeader && $evaluation->leader_scored_at),
                'can_leader_score' => $canLeader && ! $period->isLocked() && $evaluation->status === Evaluation::UNIT_SCORED,
                'can_return' => ($canScore || $canLeader) && ! $period->isLocked() && $evaluation->status !== Evaluation::DRAFT,
                'awaits_leader' => $evaluation->awaitsLeader(),
                'can_review' => $access->canReview($evaluation) && ! $period->isLocked(),
                'can_comment' => ! $period->isLocked() || $manages,
                'can_add_evidence' => $selfEditable || ($canScore && ! $period->isLocked()),
                'can_assign_scorers' => $manages && ! $isOwn && ! $period->isLocked(),
            ],
        ];
    }

    private function criteria(Evaluation $evaluation): Collection
    {
        $templateId = $evaluation->template_id ?? $evaluation->period->template_id;

        return $this->criteriaCache[$templateId] ??= EvaluationCriterion::where('template_id', $templateId)->orderBy('position')->get();
    }

    private function template(Evaluation $evaluation): EvaluationTemplate
    {
        $templateId = $evaluation->template_id ?? $evaluation->period->template_id;

        return $this->templateCache[$templateId] ??= EvaluationTemplate::findOrFail($templateId);
    }

    private function statusLabel(Evaluation $evaluation): string
    {
        if ($evaluation->status !== Evaluation::UNIT_SCORED) {
            return self::STATUS_LABELS[$evaluation->status];
        }

        return $evaluation->scoredByLeadership() || $evaluation->leader_scored_at ? 'BGH đã chấm' : 'Chờ BGH chấm';
    }

    private function periodData(EvaluationPeriod $period): array
    {
        return [
            'id' => $period->id, 'year' => $period->year, 'month' => $period->month, 'label' => $period->label(), 'status' => $period->status,
            'status_label' => ['open' => 'Đang chấm', 'disclosed' => 'Chờ giải trình', 'published' => 'Đã công bố'][$period->status] ?? $period->status,
            'self_due_on' => $period->self_due_on?->toDateString(), 'unit_due_on' => $period->unit_due_on?->toDateString(),
            'disclosed_at' => $period->disclosed_at?->toIso8601String(), 'published_at' => $period->published_at?->toIso8601String(),
        ];
    }

    private function teacherData(Employee $teacher): array
    {
        $units = $teacher->relationLoaded('departments') ? $teacher->departments->filter(fn ($d) => $d->pivot->ends_on === null) : $teacher->departments()->wherePivotNull('ends_on')->get();

        return [
            'id' => $teacher->id, 'code' => $teacher->employee_code, 'name' => $teacher->user?->name, 'avatar_url' => $this->avatar($teacher->user),
            'position' => $teacher->user?->roleLabels()[0] ?? 'Giáo viên', 'units' => $units->pluck('name')->values(),
        ];
    }

    private function gradeName(Evaluation $evaluation, ?string $code): ?string
    {
        return $code ? (collect($this->template($evaluation)->grades)->firstWhere('code', $code)['name'] ?? $code) : null;
    }

    private function avatar(?User $user): ?string
    {
        return $user?->avatar_path ? route('avatars.show', ['filename' => basename($user->avatar_path)]) : null;
    }

    private function number($value): ?float
    {
        return $value === null ? null : (float) $value;
    }

    private function access(Request $request): EvaluationAccess
    {
        return $request->attributes->get('evaluation_access') ?? tap(new EvaluationAccess($request->user()), fn ($a) => $request->attributes->set('evaluation_access', $a));
    }
}
