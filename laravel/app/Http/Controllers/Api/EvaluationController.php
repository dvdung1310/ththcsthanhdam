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
        $mine = $own ? Evaluation::where('teacher_id', $own)->get()->keyBy('period_id') : collect();

        return response()->json([
            'data' => $periods->map(fn (EvaluationPeriod $period) => [
                ...$this->periodData($period),
                'evaluations_count' => $period->evaluations_count,
                'my_evaluation' => ($evaluation = $mine->get($period->id)) ? [
                    'id' => $evaluation->id, 'status' => $evaluation->status, 'status_label' => self::STATUS_LABELS[$evaluation->status],
                    'total_score' => $this->visibleResult($evaluation, $period) ? $this->number($evaluation->total_score) : null,
                    'grade' => $this->visibleResult($evaluation, $period) ? $this->gradeName($period, $evaluation->grade) : null,
                ] : null,
            ])->values(),
            'abilities' => ['can_manage' => $access->manages(), 'can_score' => $access->manages() || $request->user()->hasPermission('evaluation.score')],
            'template' => ($template = EvaluationTemplate::where('is_active', true)->first()) ? ['id' => $template->id, 'name' => $template->name] : null,
        ]);
    }

    public function openPeriod(Request $request): JsonResponse
    {
        $data = $request->validate([
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
            'self_due_on' => ['nullable', 'date'],
            'unit_due_on' => ['nullable', 'date', 'after_or_equal:self_due_on'],
        ], ['unit_due_on.after_or_equal' => 'Hạn tổ chấm phải sau hạn tự chấm.']);
        abort_if(EvaluationPeriod::where('year', $data['year'])->where('month', $data['month'])->exists(), 422, 'Kỳ đánh giá tháng này đã được mở.');
        $template = EvaluationTemplate::where('is_active', true)->first();
        abort_unless($template, 422, 'Chưa có bộ tiêu chí đánh giá đang áp dụng.');

        $period = DB::transaction(function () use ($data, $template, $request) {
            $period = EvaluationPeriod::create([...$data, 'template_id' => $template->id, 'status' => EvaluationPeriod::OPEN, 'opened_by' => $request->user()->id]);
            $this->createMissingEvaluations($period);

            return $period;
        });
        $period->load('evaluations.teacher.user', 'evaluations.period');
        $period->evaluations->each(fn (Evaluation $evaluation) => $this->notify($evaluation->teacher->user, $evaluation, $this->openMessage($period), 'evaluation_opened'));

        return response()->json(['message' => "Đã mở kỳ đánh giá {$period->label()} cho {$period->evaluations->count()} giáo viên.", 'data' => $this->periodData($period)], 201);
    }

    public function updatePeriod(Request $request, EvaluationPeriod $period): JsonResponse
    {
        abort_if($period->isLocked(), 422, 'Kỳ đánh giá đã công bố.');
        $data = $request->validate([
            'self_due_on' => ['nullable', 'date'],
            'unit_due_on' => ['nullable', 'date', 'after_or_equal:self_due_on'],
        ], ['unit_due_on.after_or_equal' => 'Hạn tổ chấm phải sau hạn tự chấm.']);
        $period->update($data);
        $added = $this->createMissingEvaluations($period);

        return response()->json(['message' => $added ? "Đã cập nhật kỳ đánh giá và thêm phiếu cho {$added} giáo viên mới." : 'Đã cập nhật kỳ đánh giá.', 'data' => $this->periodData($period)]);
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
            ->sortBy(fn (Evaluation $evaluation) => $evaluation->teacher->user?->name)
            ->values();
        $criteria = $this->criteria($period);

        return response()->json([
            'period' => $this->periodData($period),
            'data' => $evaluations->map(function (Evaluation $evaluation) use ($criteria, $access) {
                $self = $this->scoring->totals($evaluation, $criteria, 'self');
                $unit = $this->scoring->totals($evaluation, $criteria, 'unit');
                $final = $this->scoring->totals($evaluation, $criteria, 'final');

                return [
                    'id' => $evaluation->id,
                    'teacher' => $this->teacherData($evaluation->teacher),
                    'is_homeroom' => $evaluation->is_homeroom,
                    'status' => $evaluation->status, 'status_label' => self::STATUS_LABELS[$evaluation->status],
                    'self_total' => $evaluation->status === Evaluation::DRAFT ? null : $self['total'],
                    'unit_total' => $this->hasUnitScores($evaluation) ? $unit['total'] : null,
                    'final_total' => $this->hasUnitScores($evaluation) ? $final['total'] : null,
                    'grade' => $this->gradeName($evaluation->period, $evaluation->grade),
                    'suggested_grade' => $evaluation->no_grade_reason ? null : $this->suggestedGrade($evaluation, $final['total'])['name'] ?? null,
                    'no_grade_reason' => $evaluation->no_grade_reason,
                    'has_violation' => $evaluation->has_violation,
                    'submitted_at' => $evaluation->submitted_at?->toIso8601String(),
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
        $criteria = $this->criteria($evaluation->period);
        $grades = collect($evaluation->period->template->grades)->pluck('code')->all();
        $data = $request->validate([
            'has_violation' => ['sometimes', 'boolean'],
            'no_grade_reason' => ['nullable', 'string', 'max:255'],
            'grade' => ['nullable', Rule::in($grades)],
            'scores' => ['sometimes', 'array'],
            'scores.*.criterion_id' => ['required', Rule::in($criteria->whereNotNull('parent_id')->pluck('id')->all())],
            'scores.*.score' => ['nullable', 'numeric', 'min:0'],
        ]);
        $this->assertWithinMax($data['scores'] ?? [], $criteria);

        DB::transaction(function () use ($evaluation, $data, $request) {
            $evaluation->update([
                'has_violation' => $data['has_violation'] ?? $evaluation->has_violation,
                'no_grade_reason' => array_key_exists('no_grade_reason', $data) ? (trim((string) $data['no_grade_reason']) ?: null) : $evaluation->no_grade_reason,
                'grade' => array_key_exists('grade', $data) ? $data['grade'] : $evaluation->grade,
                'reviewed_by' => $request->user()->id, 'reviewed_at' => now(),
            ]);
            foreach ($data['scores'] ?? [] as $row) {
                EvaluationScore::updateOrCreate(['evaluation_id' => $evaluation->id, 'criterion_id' => $row['criterion_id']], ['final_score' => $row['score']]);
            }
            $this->refreshResult($evaluation->fresh(['scores', 'period']));
        });

        return response()->json(['message' => 'Đã lưu kết quả duyệt.', 'data' => $this->detail($evaluation->fresh(), $access)]);
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
        $total = $this->hasUnitScores($evaluation) ? $this->scoring->totals($evaluation, $this->criteria($evaluation->period), 'final')['total'] : null;
        $evaluation->update(['total_score' => $total]);
    }

    private function suggestedGrade(Evaluation $evaluation, ?float $total = null): ?array
    {
        $total ??= (float) $evaluation->total_score;

        return $this->scoring->grade($evaluation->period->template->grades, $total, $evaluation->is_homeroom, $evaluation->has_violation);
    }

    private function createMissingEvaluations(EvaluationPeriod $period): int
    {
        $existing = $period->evaluations()->pluck('teacher_id');
        $previous = Evaluation::whereIn('period_id', EvaluationPeriod::where('id', '!=', $period->id)
            ->where(fn ($q) => $q->where('year', '<', $period->year)->orWhere(fn ($b) => $b->where('year', $period->year)->where('month', '<', $period->month)))
            ->orderByDesc('year')->orderByDesc('month')->limit(1)->pluck('id'))->pluck('is_homeroom', 'teacher_id');
        $teachers = $this->eligibleTeachers()->whereNotIn('id', $existing);
        foreach ($teachers as $teacher) {
            Evaluation::create(['period_id' => $period->id, 'teacher_id' => $teacher->id, 'is_homeroom' => (bool) ($previous[$teacher->id] ?? false), 'status' => Evaluation::DRAFT]);
        }

        return $teachers->count();
    }

    private function eligibleTeachers(): Collection
    {
        return Teacher::with('user')->where('employment_status', 'working')
            ->whereHas('user', fn ($u) => $u->where('status', 'active'))
            ->whereDoesntHave('user.roles', fn ($r) => $r->whereIn('code', self::EXCLUDED_ROLES)
                ->where(fn ($q) => $q->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now())))
            ->get();
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
            || $evaluation->scores->contains(fn (EvaluationScore $score) => $score->unit_score !== null || $score->final_score !== null);
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
            'final' => $showResult ? $this->scoring->totals($evaluation, $criteria, 'final') : null,
        ];
        $suggested = $showResult && ! $evaluation->no_grade_reason ? $this->suggestedGrade($evaluation, $totals['final']['total']) : null;
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
                        'final_score' => $showResult ? $this->number($score?->final_score) : null,
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
