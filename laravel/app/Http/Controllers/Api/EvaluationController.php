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
use App\Models\Teacher;
use App\Models\User;
use App\Notifications\EvaluationNotification;
use App\Notifications\EvaluationPeriodNotification;
use App\Services\EvaluationAccess;
use App\Services\EvaluationScoring;
use App\Services\FileStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class EvaluationController extends Controller
{
    private const EXCLUDED_ROLES = [Role::ADMIN, Role::HIEU_TRUONG, Role::THU_KY];

    private const STATUS_LABELS = [
        Evaluation::DRAFT => 'Chưa nộp', Evaluation::SUBMITTED => 'Đã nộp',
        Evaluation::UNIT_SCORED => 'Tổ đã chấm', Evaluation::PUBLISHED => 'Đã công bố',
    ];

    private array $criteriaCache = [];

    public function __construct(private EvaluationScoring $scoring, private FileStore $store) {}

    public function periods(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $own = $request->user()->teacher?->id;
        $periods = EvaluationPeriod::withCount('evaluations')->orderByDesc('year')->orderByDesc('month')->get();
        $mine = $own ? Evaluation::with('scores')->where('teacher_id', $own)->get()->keyBy('period_id') : collect();

        return response()->json([
            'data' => $periods->map(fn (EvaluationPeriod $period) => [
                ...$this->periodData($period),
                'evaluations_count' => $period->evaluations_count,
                'my_evaluation' => ($evaluation = $mine->get($period->id)) ? [
                    'id' => $evaluation->id, 'status' => $evaluation->status, 'status_label' => self::STATUS_LABELS[$evaluation->status],
                    'self_total' => $evaluation->status === Evaluation::DRAFT ? null : $this->scoring->totals($evaluation, $this->criteria($period), 'self')['total'],
                    'submitted_at' => $evaluation->submitted_at?->toIso8601String(),
                    'total_score' => $this->visibleResult($evaluation, $period) ? $this->number($evaluation->total_score) : null,
                    'grade' => $this->visibleResult($evaluation, $period) ? $this->gradeName($period, $evaluation->grade) : null,
                ] : null,
            ])->values(),
            'abilities' => ['can_manage' => $access->manages(), 'can_score' => $access->manages() || $request->user()->hasPermission('evaluation.score')],
            'template' => ($template = EvaluationTemplate::where('is_active', true)->first()) ? ['id' => $template->id, 'name' => $template->name] : null,
        ]);
    }

    public function roster(Request $request): JsonResponse
    {
        $data = $request->validate(['period_id' => ['nullable', 'integer', 'exists:evaluation_periods,id']]);
        $period = isset($data['period_id']) ? EvaluationPeriod::findOrFail($data['period_id']) : null;
        $evaluations = $period
            ? $period->evaluations()->withCount(['scores', 'comments'])->get()->keyBy('teacher_id')
            : collect();
        $teachers = Teacher::with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')->orderByDesc('teacher_department.is_primary')])
            ->where(fn ($q) => $q->where('employment_status', '!=', 'terminated')->orWhereIn('id', $evaluations->keys()))
            ->get()
            ->sort(fn (Teacher $a, Teacher $b) => $this->compareNames($a->user?->name, $b->user?->name))
            ->values();

        return response()->json([
            'period' => $period ? $this->periodData($period) : null,
            'template' => ($template = $period ? $period->template : EvaluationTemplate::where('is_active', true)->first()) ? ['id' => $template->id, 'name' => $template->name] : null,
            'units' => Department::orderBy('name')->get(['id', 'name', 'type', 'parent_id', 'is_active'])
                ->filter(fn (Department $unit) => $unit->is_active || $teachers->contains(fn ($t) => $t->departments->contains('id', $unit->id)))
                ->map(fn (Department $unit) => ['id' => $unit->id, 'name' => $unit->name, 'type' => $unit->type, 'parent_id' => $unit->parent_id])->values(),
            'data' => $teachers->map(function (Teacher $teacher) use ($evaluations, $period) {
                $evaluation = $evaluations->get($teacher->id);
                $reason = $this->ineligibleReason($teacher);
                $locked = $evaluation && $evaluation->status !== Evaluation::DRAFT;

                return [
                    'teacher_id' => $teacher->id, 'name' => $teacher->user?->name, 'code' => $teacher->employee_code,
                    'avatar_url' => $this->avatar($teacher->user),
                    'unit_id' => $teacher->departments->first()?->id,
                    'other_units' => $teacher->departments->slice(1)->pluck('name')->values(),
                    'roles' => $this->leadershipRoles($teacher->user),
                    'eligible' => $reason === null, 'reason' => $reason,
                    'evaluation' => $evaluation ? [
                        'id' => $evaluation->id, 'status' => $evaluation->status, 'status_label' => self::STATUS_LABELS[$evaluation->status],
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
        ], ['unit_due_on.after_or_equal' => 'Hạn tổ chấm phải sau hạn tự chấm.', 'teacher_ids.required' => 'Chọn ít nhất một giáo viên.', 'teacher_ids.min' => 'Chọn ít nhất một giáo viên.']);
        abort_if(EvaluationPeriod::where('year', $data['year'])->where('month', $data['month'])->exists(), 422, 'Kỳ đánh giá tháng này đã được mở.');
        $template = EvaluationTemplate::where('is_active', true)->first();
        abort_unless($template, 422, 'Chưa có bộ tiêu chí đánh giá đang áp dụng.');
        $teachers = $this->eligibleOnly($data['teacher_ids']);

        $period = DB::transaction(function () use ($data, $template, $request, $teachers) {
            $period = EvaluationPeriod::create([
                ...collect($data)->except('teacher_ids')->all(), 'template_id' => $template->id, 'status' => EvaluationPeriod::OPEN, 'opened_by' => $request->user()->id,
            ]);
            $this->addEvaluations($period, $teachers);

            return $period;
        });
        $period->load('evaluations.teacher.user', 'evaluations.period');
        $period->evaluations->each(fn (Evaluation $evaluation) => $this->notify($evaluation->teacher->user, $evaluation, $this->openMessage($period), 'evaluation_opened'));

        return response()->json(['message' => "Đã mở kỳ đánh giá {$period->label()} cho {$period->evaluations->count()} giáo viên.", 'data' => $this->periodData($period)], 201);
    }

    public function updatePeriod(Request $request, EvaluationPeriod $period): JsonResponse
    {
        abort_if($period->isLocked(), 422, 'Kỳ đánh giá đã công bố. Mở lại kỳ trước khi sửa.');
        $data = $request->validate([
            'self_due_on' => ['nullable', 'date'],
            'unit_due_on' => ['nullable', 'date', 'after_or_equal:self_due_on'],
            'teacher_ids' => ['sometimes', 'array', 'min:1'],
            'teacher_ids.*' => ['integer', 'distinct'],
        ], ['unit_due_on.after_or_equal' => 'Hạn tổ chấm phải sau hạn tự chấm.', 'teacher_ids.min' => 'Kỳ đánh giá cần ít nhất một giáo viên.']);
        $current = $period->evaluations()->with('teacher.user')->get();
        $wanted = collect($data['teacher_ids'] ?? $current->pluck('teacher_id'))->map(fn ($id) => (int) $id);
        $removed = $current->reject(fn (Evaluation $evaluation) => $wanted->contains((int) $evaluation->teacher_id))->values();
        $blocked = $removed->filter(fn (Evaluation $evaluation) => $evaluation->status !== Evaluation::DRAFT);
        abort_if($blocked->isNotEmpty(), 422, 'Không gỡ được phiếu đã nộp hoặc đã chấm của: '.$blocked->map(fn ($e) => $e->teacher->user?->name)->join(', ').'. Hãy trả phiếu về trước.');
        $added = $this->eligibleOnly($wanted->diff($current->pluck('teacher_id')->map(fn ($id) => (int) $id))->values()->all());
        $dueChanged = array_key_exists('self_due_on', $data) && ($data['self_due_on'] ?? null) !== $period->self_due_on?->toDateString();

        DB::transaction(function () use ($period, $data, $added, $removed) {
            $period->update(collect($data)->except('teacher_ids')->all());
            $this->addEvaluations($period, $added);
            $removed->each(fn (Evaluation $evaluation) => $this->deleteEvaluation($evaluation));
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

        return response()->json(['message' => 'Đã gửi kết quả dự kiến để giáo viên xem và giải trình.', 'data' => $this->periodData($period->fresh())]);
    }

    public function publish(Request $request, EvaluationPeriod $period): JsonResponse
    {
        abort_if($period->isLocked(), 422, 'Kỳ đánh giá đã công bố.');
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
            'search' => ['nullable', 'string', 'max:100'],
        ]);
        $period = EvaluationPeriod::with('template')->findOrFail($data['period_id']);
        $units = $access->scopeUnitIds();
        abort_if($units === [], 403, 'Bạn không có quyền xem phiếu của người khác.');
        $own = $request->user()->teacher?->id;

        $evaluations = Evaluation::with(['teacher.user', 'teacher.departments', 'scores', 'period'])
            ->where('period_id', $period->id)
            ->when($units !== null, fn ($q) => $q->whereHas('teacher', fn ($t) => $t->inUnits($units))->where('teacher_id', '!=', $own ?? 0))
            ->when($data['department_id'] ?? null, fn ($q, $unit) => $q->whereHas('teacher', fn ($t) => $t->inUnits([$unit])))
            ->when($data['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when(trim($data['search'] ?? ''), fn ($q, $search) => $q->whereHas('teacher', fn ($t) => $t->where('employee_code', 'like', "%{$search}%")->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%"))))
            ->get()
            ->filter(fn (Evaluation $evaluation) => $access->canScore($evaluation))
            ->sort(fn (Evaluation $a, Evaluation $b) => $this->compareNames($a->teacher->user?->name, $b->teacher->user?->name))
            ->values();
        $criteria = $this->criteria($period);

        $notIncluded = $access->manages()
            ? Teacher::with('user.roles')->where('employment_status', 'working')->whereNotIn('id', $period->evaluations()->pluck('teacher_id'))->get()
                ->filter(fn (Teacher $teacher) => $this->ineligibleReason($teacher) === null)->map(fn (Teacher $teacher) => $teacher->user?->name)->sort()->values()
            : null;

        return response()->json([
            'period' => $this->periodData($period),
            'not_included' => $notIncluded,
            'data' => $evaluations->map(function (Evaluation $evaluation) use ($criteria, $access) {
                $self = $this->scoring->totals($evaluation, $criteria, 'self');
                $unit = $this->scoring->totals($evaluation, $criteria, 'unit');
                $unitDone = $evaluation->status === Evaluation::UNIT_SCORED
                    || ($evaluation->status === Evaluation::PUBLISHED && $evaluation->scores->contains(fn (EvaluationScore $score) => $score->unit_score !== null));

                return [
                    'id' => $evaluation->id,
                    'teacher' => $this->teacherData($evaluation->teacher),
                    'is_homeroom' => $evaluation->is_homeroom,
                    'status' => $evaluation->status, 'status_label' => self::STATUS_LABELS[$evaluation->status],
                    'self_total' => $evaluation->status === Evaluation::DRAFT ? null : $self['total'],
                    'unit_total' => $unitDone ? $unit['total'] : null,
                    'unit_in_progress' => ! $unitDone && $evaluation->status === Evaluation::SUBMITTED && $evaluation->scores->contains(fn (EvaluationScore $score) => $score->unit_score !== null),
                    'reviewed' => $evaluation->reviewed_at !== null,
                    'grade' => $this->gradeName($evaluation->period, $evaluation->grade),
                    'suggested_grade' => $evaluation->no_grade_reason || ! $unitDone ? null : $this->suggestedGrade($evaluation, $unit['total'])['name'] ?? null,
                    'no_grade_reason' => $evaluation->no_grade_reason,
                    'has_violation' => $evaluation->has_violation,
                    'submitted_at' => $evaluation->submitted_at?->toIso8601String(),
                    'unit_scored_at' => $evaluation->unit_scored_at?->toIso8601String(),
                    ...$this->placement($evaluation->teacher),
                    'comments_count' => $evaluation->comments()->count(),
                    'can_score' => $access->canScore($evaluation),
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
        abort_if($evaluation->status === Evaluation::DRAFT && ! $access->manages(), 422, 'Giáo viên chưa nộp phiếu tự đánh giá.');
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

        return response()->json(['message' => $complete ? 'Đã hoàn tất chấm phiếu.' : 'Đã lưu điểm tổ chấm.', 'data' => $this->detail($evaluation->fresh(), $access)]);
    }

    public function returnToTeacher(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->canScore($evaluation), 403, 'Bạn không có quyền trả phiếu này.');
        abort_if($evaluation->period->isLocked() || $evaluation->status === Evaluation::DRAFT, 422, 'Phiếu không ở trạng thái trả về được.');
        $data = $request->validate(['message' => ['required', 'string', 'max:2000']], ['message.required' => 'Nhập lý do trả phiếu.']);

        DB::transaction(function () use ($evaluation, $data, $request) {
            $evaluation->update(['status' => Evaluation::DRAFT, 'submitted_at' => null, 'unit_scored_by' => null, 'unit_scored_at' => null]);
            EvaluationComment::create(['evaluation_id' => $evaluation->id, 'user_id' => $request->user()->id, 'content' => 'Trả phiếu: '.$data['message']]);
        });
        $this->notify($evaluation->teacher->user, $evaluation, "Phiếu đánh giá {$evaluation->period->label()} được trả về: {$data['message']}", 'evaluation_returned');

        return response()->json(['message' => 'Đã trả phiếu về cho giáo viên.', 'data' => $this->detail($evaluation->fresh(), $access)]);
    }

    public function review(Request $request, Evaluation $evaluation): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->manages(), 403, 'Bạn không có quyền duyệt phiếu đánh giá.');
        abort_if($evaluation->period->isLocked(), 422, 'Kỳ đánh giá đã công bố.');
        $grades = collect($evaluation->period->template->grades)->pluck('code')->all();
        $data = $request->validate([
            'has_violation' => ['sometimes', 'boolean'],
            'no_grade_reason' => ['nullable', 'string', 'max:255'],
            'grade' => ['nullable', Rule::in($grades)],
        ]);
        $approve = $request->boolean('approve', true);
        abort_if($approve && ! in_array($evaluation->status, [Evaluation::UNIT_SCORED, Evaluation::PUBLISHED], true), 422, 'Tổ chưa hoàn tất chấm phiếu này, chưa duyệt được.');

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
            ->whereHas('teachers', fn ($t) => $t->where('teachers.id', $teacher->id))
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
        $criteria = $this->criteria($evaluation->period);
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
        $criteria = $this->criteria($evaluation->period);
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
        $total = $this->hasUnitScores($evaluation) ? $this->scoring->totals($evaluation, $this->criteria($evaluation->period), 'unit')['total'] : null;
        $evaluation->update(['total_score' => $total]);
    }

    private function suggestedGrade(Evaluation $evaluation, ?float $total = null): ?array
    {
        $total ??= (float) $evaluation->total_score;

        return $this->scoring->grade($evaluation->period->template->grades, $total, $evaluation->is_homeroom, $evaluation->has_violation);
    }

    private function addEvaluations(EvaluationPeriod $period, Collection $teachers): void
    {
        if ($teachers->isEmpty()) {
            return;
        }
        $previous = Evaluation::whereIn('period_id', EvaluationPeriod::where('id', '!=', $period->id)
            ->where(fn ($q) => $q->where('year', '<', $period->year)->orWhere(fn ($b) => $b->where('year', $period->year)->where('month', '<', $period->month)))
            ->orderByDesc('year')->orderByDesc('month')->limit(1)->pluck('id'))->pluck('is_homeroom', 'teacher_id');
        foreach ($teachers as $teacher) {
            Evaluation::create(['period_id' => $period->id, 'teacher_id' => $teacher->id, 'is_homeroom' => (bool) ($previous[$teacher->id] ?? false), 'status' => Evaluation::DRAFT]);
        }
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
        $teachers = Teacher::with('user.roles')->whereIn('id', $ids)->get();
        $invalid = $teachers->filter(fn (Teacher $teacher) => $this->ineligibleReason($teacher) !== null);
        abort_if($invalid->isNotEmpty() || $teachers->count() !== count(array_unique($ids)), 422, 'Không thể tạo phiếu cho: '.($invalid->map(fn ($t) => $t->user?->name)->join(', ') ?: 'giáo viên không tồn tại').'.');

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

    private function ineligibleReason(Teacher $teacher): ?string
    {
        $statuses = ['on_leave' => 'Nghỉ phép', 'suspended' => 'Tạm nghỉ', 'terminated' => 'Đã nghỉ việc'];
        if ($teacher->employment_status !== 'working') {
            return $statuses[$teacher->employment_status] ?? 'Không còn làm việc';
        }
        if ($teacher->user?->status !== 'active') {
            return 'Tài khoản đang bị khóa';
        }
        $role = $teacher->user->roles->first(fn (Role $role) => in_array($role->code, self::EXCLUDED_ROLES, true)
            && ($role->pivot->expires_at === null || Carbon::parse($role->pivot->expires_at)->isFuture()));

        return $role ? "{$role->name} — không thuộc diện đánh giá" : null;
    }

    private function scorers(Evaluation $evaluation): Collection
    {
        $leaders = User::whereHas('roles', fn ($r) => $r->whereIn('role_user.department_id', $evaluation->teacher->unitIds() ?: [0])
            ->where(fn ($q) => $q->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now())))
            ->where('id', '!=', $evaluation->teacher->user_id)->get()
            ->filter(fn (User $user) => ! $user->hasPermission('evaluation.manage') && (new EvaluationAccess($user))->canScore($evaluation));

        return $leaders->isNotEmpty() ? $leaders->values() : User::whereHas('roles', fn ($r) => $r->whereIn('code', [Role::HIEU_TRUONG, Role::THU_KY]))->get()
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

    private function placement(Teacher $teacher): array
    {
        $current = $teacher->departments->filter(fn ($d) => $d->pivot->ends_on === null)->sortByDesc(fn ($d) => (int) $d->pivot->is_primary)->values();
        $primary = $current->first();
        $tree = Department::tree();
        $team = $primary ? $tree->get($primary->id) : null;
        while ($team?->parent_id && $tree->has($team->parent_id)) {
            $team = $tree->get($team->parent_id);
        }

        return [
            'team' => $team ? ['id' => $team->id, 'name' => $team->name] : null,
            'group' => $primary && $primary->id !== $team?->id ? ['id' => $primary->id, 'name' => $primary->name] : null,
            'unit_ids' => Department::withAncestors($current->pluck('id')),
        ];
    }

    private function compareNames(?string $a, ?string $b): int
    {
        static $collator = null;
        $collator ??= new \Collator('vi_VN');
        $key = fn (?string $name) => [Str::afterLast(trim($name ?? ''), ' '), $name ?? ''];
        [$givenA, $fullA] = $key($a);
        [$givenB, $fullB] = $key($b);

        return $collator->compare($givenA, $givenB) ?: $collator->compare($fullA, $fullB);
    }

    private function visibleResult(Evaluation $evaluation, EvaluationPeriod $period): bool
    {
        return in_array($period->status, [EvaluationPeriod::DISCLOSED, EvaluationPeriod::PUBLISHED], true);
    }

    private function detail(Evaluation $evaluation, EvaluationAccess $access): array
    {
        $evaluation->load(['period.template', 'teacher.user', 'teacher.departments', 'scores', 'comments.user', 'unitScorer', 'reviewer']);
        $period = $evaluation->period;
        $criteria = $this->criteria($period);
        $isOwn = $access->isOwn($evaluation);
        $canScore = $access->canScore($evaluation);
        $manages = $access->manages();
        $showResult = ! $isOwn || $canScore || $this->visibleResult($evaluation, $period);
        $scores = $evaluation->scores->keyBy('criterion_id');
        $evidence = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')
            ->where('attachable_type', EvaluationScore::class)->whereIn('attachable_id', $evaluation->scores->pluck('id'))
            ->get(['file_attachments.attachable_id', 'files.id', 'files.original_name', 'files.mime_type', 'files.size', 'files.uploaded_by'])
            ->groupBy('attachable_id');
        $totals = [
            'self' => $this->scoring->totals($evaluation, $criteria, 'self'),
            'unit' => $showResult ? $this->scoring->totals($evaluation, $criteria, 'unit') : null,
        ];
        $suggested = $showResult && ! $evaluation->no_grade_reason ? $this->suggestedGrade($evaluation, $totals['unit']['total']) : null;
        $selfEditable = $isOwn && $this->selfEditable($evaluation);

        return [
            'id' => $evaluation->id,
            'period' => $this->periodData($period),
            'teacher' => $this->teacherData($evaluation->teacher),
            'is_homeroom' => $evaluation->is_homeroom,
            'duties' => $evaluation->duties,
            'results' => $evaluation->results,
            'status' => $evaluation->status, 'status_label' => self::STATUS_LABELS[$evaluation->status],
            'submitted_at' => $evaluation->submitted_at?->toIso8601String(),
            'unit_scored_by' => $evaluation->unitScorer?->name, 'unit_scored_at' => $evaluation->unit_scored_at?->toIso8601String(),
            'reviewed_by' => $evaluation->reviewer?->name, 'reviewed_at' => $evaluation->reviewed_at?->toIso8601String(),
            'show_result' => $showResult,
            'has_violation' => $showResult ? $evaluation->has_violation : null,
            'no_grade_reason' => $showResult ? $evaluation->no_grade_reason : null,
            'grade' => $showResult ? $evaluation->grade : null,
            'grade_name' => $showResult ? $this->gradeName($period, $evaluation->grade) : null,
            'suggested_grade' => $suggested,
            'grades' => $period->template->grades,
            'bonus_max' => (float) ($criteria->firstWhere(fn ($c) => $c->parent_id === null && $c->kind === EvaluationCriterion::BONUS)?->max_score ?? 0),
            'sections' => $criteria->whereNull('parent_id')->sortBy('position')->values()->map(fn (EvaluationCriterion $section) => [
                'id' => $section->id, 'code' => $section->code, 'title' => $section->title, 'max_score' => (float) $section->max_score,
                'kind' => $section->kind, 'homeroom_only' => $section->homeroom_only,
                'criteria' => $criteria->where('parent_id', $section->id)->sortBy('position')->values()->map(function (EvaluationCriterion $criterion) use ($scores, $evidence, $showResult) {
                    $score = $scores->get($criterion->id);

                    return [
                        'id' => $criterion->id, 'code' => $criterion->code, 'title' => $criterion->title, 'guidance' => $criterion->guidance, 'max_score' => (float) $criterion->max_score,
                        'requires_evidence' => $criterion->requires_evidence,
                        'self_score' => $this->number($score?->self_score), 'self_note' => $score?->self_note,
                        'unit_score' => $showResult ? $this->number($score?->unit_score) : null, 'unit_note' => $showResult ? $score?->unit_note : null,
                        'evidence' => $score ? ($evidence->get($score->id) ?? collect())->map(fn ($file) => [
                            'id' => $file->id, 'name' => $file->original_name, 'mime_type' => $file->mime_type, 'size' => (int) $file->size, 'uploaded_by' => (int) $file->uploaded_by,
                        ])->values() : [],
                    ];
                }),
            ]),
            'totals' => $totals,
            'comments' => $evaluation->comments->map(fn (EvaluationComment $comment) => [
                'id' => $comment->id, 'content' => $comment->content, 'created_at' => $comment->created_at->toIso8601String(),
                'user' => ['id' => $comment->user->id, 'name' => $comment->user->name, 'avatar_url' => $this->avatar($comment->user)],
            ]),
            'abilities' => [
                'is_own' => $isOwn,
                'can_self_score' => $selfEditable,
                'can_unit_score' => $canScore && ! $period->isLocked() && ($evaluation->status !== Evaluation::DRAFT || $manages),
                'can_return' => $canScore && ! $period->isLocked() && $evaluation->status !== Evaluation::DRAFT,
                'can_review' => $manages && ! $period->isLocked(),
                'can_comment' => ! $period->isLocked() || $manages,
                'can_add_evidence' => $selfEditable || ($canScore && ! $period->isLocked()),
            ],
        ];
    }

    private function criteria(EvaluationPeriod $period): Collection
    {
        return $this->criteriaCache[$period->template_id] ??= EvaluationCriterion::where('template_id', $period->template_id)->orderBy('position')->get();
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

    private function teacherData(Teacher $teacher): array
    {
        $units = $teacher->relationLoaded('departments') ? $teacher->departments->filter(fn ($d) => $d->pivot->ends_on === null) : $teacher->departments()->wherePivotNull('ends_on')->get();

        return [
            'id' => $teacher->id, 'code' => $teacher->employee_code, 'name' => $teacher->user?->name, 'avatar_url' => $this->avatar($teacher->user),
            'position' => $teacher->user?->roleLabels()[0] ?? 'Giáo viên', 'units' => $units->pluck('name')->values(),
        ];
    }

    private function gradeName(EvaluationPeriod $period, ?string $code): ?string
    {
        return $code ? (collect($period->loadMissing('template')->template->grades)->firstWhere('code', $code)['name'] ?? $code) : null;
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
