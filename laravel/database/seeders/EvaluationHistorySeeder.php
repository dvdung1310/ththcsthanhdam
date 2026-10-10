<?php

namespace Database\Seeders;

use App\Models\Evaluation;
use App\Models\EvaluationComment;
use App\Models\EvaluationCriterion;
use App\Models\EvaluationPeriod;
use App\Models\EvaluationScore;
use App\Models\EvaluationTemplate;
use App\Models\Role;
use App\Models\StoredFile;
use App\Models\Employee;
use App\Models\User;
use App\Services\EvaluationScoring;
use Carbon\CarbonImmutable;
use Database\Seeders\Demo\DemoRoster;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class EvaluationHistorySeeder extends Seeder
{
    private const MONTHS_BACK = 12;
    private const SUMMER = [6, 7];

    private const DEDUCTION_NOTES = [
        'I' => ['Đi muộn họp hội đồng ngày {d}/{m}.', 'Không mặc áo trắng thứ Hai ngày {d}/{m}.', 'Nghỉ việc riêng có phép 1 buổi ngày {d}/{m}.'],
        'II' => ['Nộp kế hoạch bài dạy tuần {w} muộn 1 ngày.', 'Cập nhật sổ điểm điện tử muộn.', 'Lịch báo giảng chưa khớp sổ đầu bài tuần {w}.'],
        'III' => ['Dự giờ chưa đủ số tiết quy định.', 'Chấm trả bài kiểm tra muộn.', 'Tiết dạy được góp ý chưa đạt yêu cầu.'],
        'IV' => ['Chưa nhận xét sổ đầu bài tuần {w}.', 'Lớp vi phạm nền nếp 2 lần trong tuần {w}.', 'Báo cáo sĩ số lớp muộn.'],
        'V' => ['Không tham gia trực ngày {d}/{m}.', 'Nộp báo cáo hoạt động ngoài giờ muộn.'],
    ];

    private const EXPLANATIONS = [
        ['Em xin giải trình tiêu chí II: kế hoạch bài dạy tuần 2 em đã gửi qua nhóm Zalo đúng hạn, chỉ nộp bản in muộn. Mong tổ xem xét lại.', 'Tổ đã kiểm tra tin nhắn, sẽ điều chỉnh lại điểm tiêu chí II.'],
        ['Buổi trực ngày 12 em đã đổi ca với đồng nghiệp và có báo tổ trưởng, em xin được xem xét lại.', 'Đã xác nhận việc đổi ca, tổ đồng ý điều chỉnh.'],
        ['Em đi muộn họp hội đồng do đưa học sinh bị ốm đến trạm y tế, có báo trước với Ban giám hiệu.', 'Ban giám hiệu đã xác nhận, không trừ điểm nội dung này.'],
        ['Em đã bổ sung minh chứng giải học sinh cấp phường, nhờ tổ xem giúp em.', 'Đã nhận minh chứng, điểm cộng được giữ nguyên.'],
    ];

    private const BONUS_NOTES = [
        'Bồi dưỡng học sinh đạt giải cấp phường.',
        'Tham gia hội diễn văn nghệ chào mừng 20/11.',
        'Sáng kiến kinh nghiệm được xếp loại B cấp trường.',
        'Tổ chức hoạt động trải nghiệm cho học sinh hiệu quả.',
        'Dạy tiết tích hợp tiếng Anh tại lớp thí điểm.',
    ];

    private array $users = [];
    private array $profiles = [];
    private array $violations = [];
    private array $noGrade = [];
    private Collection $criteria;
    private Collection $sections;
    private array $grades;

    public function __construct(private EvaluationScoring $scoring) {}

    public function run(): void
    {
        $template = EvaluationTemplate::where('is_active', true)->first();
        if (! $template) {
            $this->command?->warn('Chưa có bộ tiêu chí đang áp dụng, bỏ qua dữ liệu đánh giá mẫu.');

            return;
        }
        $this->criteria = EvaluationCriterion::where('template_id', $template->id)->orderBy('position')->get();
        $this->sections = $this->criteria->whereNull('parent_id')->sortBy('position')->values();
        $this->grades = $template->grades ?? [];
        $this->buildProfiles();
        $teachers = Employee::with('user', 'departments')->whereIn('employee_code', array_keys($this->profiles))->get()->keyBy('employee_code');

        $today = CarbonImmutable::now();
        for ($ago = self::MONTHS_BACK; $ago >= 0; $ago--) {
            $month = $today->startOfMonth()->subMonths($ago);
            if ($ago > 0 && in_array($month->month, self::SUMMER, true)) {
                continue;
            }
            if (EvaluationPeriod::where('year', $month->year)->where('month', $month->month)->exists()) {
                continue;
            }
            DB::transaction(fn () => $this->seedMonth($template, $month, $ago, $teachers));
        }
    }

    private function seedMonth(EvaluationTemplate $template, CarbonImmutable $month, int $ago, Collection $teachers): void
    {
        $status = $ago === 0 ? EvaluationPeriod::OPEN : ($ago === 1 ? EvaluationPeriod::DISCLOSED : EvaluationPeriod::PUBLISHED);
        $next = $month->addMonth();
        $lastDay = $month->daysInMonth;
        $period = EvaluationPeriod::create([
            'template_id' => $template->id, 'year' => $month->year, 'month' => $month->month, 'status' => $status,
            'self_due_on' => $month->day(min(25, $lastDay))->toDateString(), 'unit_due_on' => $month->day(min(28, $lastDay))->toDateString(),
            'opened_by' => $this->user(DemoRoster::principal())->id,
            'disclosed_at' => $status === EvaluationPeriod::OPEN ? null : $this->past($next->day(2)->setTime(9, 0)),
            'published_at' => $status === EvaluationPeriod::PUBLISHED ? $next->day(5)->setTime(16, 0) : null,
        ]);
        $this->stamp('evaluation_periods', $period->id, $month->setTime(8, 0));

        $position = 0;
        foreach ($this->profiles as $code => [$deduction, $bonusChance, $homeroom, $absentWithin, $joinedAgo]) {
            $teacher = $teachers->get($code);
            if (! $teacher || ($absentWithin !== null && $ago <= $absentWithin) || ($joinedAgo !== null && $ago > $joinedAgo)) {
                continue;
            }
            mt_srand(crc32($code.$month->format('Y-m')));
            $stage = $ago > 0 ? 'scored' : ['draft', 'partial', 'submitted', 'scored', 'reviewed'][$position % 5];
            $position++;
            $this->seedSheet($period, $teacher, $month, $ago, $stage, $deduction, $bonusChance, $homeroom);
        }

        $explainers = array_keys(array_filter($this->profiles, fn ($profile) => $profile[0] >= 2.5 && $profile[3] === null));
        if ($ago === 1) {
            foreach (array_slice($explainers, 0, 3) as $index => $code) {
                $this->explain($period, $code, self::EXPLANATIONS[$index][0], self::EXPLANATIONS[$index][1]);
            }
        }
        if ($ago === 2 && isset($explainers[3])) {
            $this->explain($period, $explainers[3], self::EXPLANATIONS[3][0], self::EXPLANATIONS[3][1]);
        }
    }

    private function seedSheet(EvaluationPeriod $period, Employee $teacher, CarbonImmutable $month, int $ago, string $stage, float $deduction, float $bonusChance, bool $homeroom): void
    {
        $code = $teacher->employee_code;
        $violation = in_array([$code, $ago], $this->violations, true);
        $noGrade = collect($this->noGrade)->first(fn ($row) => $row[0] === $code && $row[1] === $ago)[2] ?? null;
        $lastDay = $month->daysInMonth;
        $submittedAt = $this->past($month->day(min($lastDay, mt_rand(18, $deduction > 6 ? 27 : 25)))->setTime(mt_rand(7, 21), mt_rand(0, 59)));
        $unitScoredAt = $this->past($month->day(min($lastDay, mt_rand(27, 28)))->setTime(mt_rand(8, 17), mt_rand(0, 59)));
        $leader = $this->leaderFor($teacher);

        $evaluation = Evaluation::create([
            'period_id' => $period->id, 'teacher_id' => $teacher->id, 'is_homeroom' => $homeroom,
            'duties' => $stage === 'draft' ? null : $this->duties($teacher, $homeroom),
            'results' => in_array($stage, ['draft', 'partial'], true) ? null : 'Hoàn thành nhiệm vụ được giao trong tháng.',
            'status' => match ($stage) {
                'draft', 'partial' => Evaluation::DRAFT,
                'submitted' => Evaluation::SUBMITTED,
                default => $period->status === EvaluationPeriod::PUBLISHED ? Evaluation::PUBLISHED : Evaluation::UNIT_SCORED,
            },
            'has_violation' => $violation,
            'no_grade_reason' => $noGrade,
            'submitted_at' => in_array($stage, ['draft', 'partial'], true) ? null : $submittedAt,
            'unit_scored_by' => in_array($stage, ['scored', 'reviewed'], true) ? $leader->id : null,
            'unit_scored_at' => in_array($stage, ['scored', 'reviewed'], true) ? $unitScoredAt : null,
        ]);
        $this->stamp('evaluations', $evaluation->id, $month->day(1)->setTime(8, 5));
        if ($stage === 'draft') {
            return;
        }

        [$self, $unit] = $this->scores($month, $deduction, $bonusChance, $homeroom, $violation);
        $now = now();
        $rows = [];
        foreach ($this->applicable($homeroom) as $index => $criterion) {
            if ($stage === 'partial' && $index > 6) {
                break;
            }
            $hasUnit = in_array($stage, ['scored', 'reviewed'], true);
            $rows[] = [
                'evaluation_id' => $evaluation->id, 'criterion_id' => $criterion->id,
                'self_score' => $self[$criterion->id]['score'], 'self_note' => $self[$criterion->id]['note'],
                'unit_score' => $hasUnit ? $unit[$criterion->id]['score'] : null, 'unit_note' => $hasUnit ? $unit[$criterion->id]['note'] : null,
                'created_at' => $now, 'updated_at' => $now,
            ];
        }
        DB::table('evaluation_scores')->insert($rows);
        if (! in_array($stage, ['scored', 'reviewed'], true)) {
            $this->attachEvidence($evaluation, $ago);

            return;
        }

        $evaluation->load('scores');
        $total = $this->scoring->totals($evaluation, $this->criteria, 'unit')['total'];
        $published = $period->status === EvaluationPeriod::PUBLISHED;
        $reviewed = $published || $stage === 'reviewed' || ($period->status === EvaluationPeriod::DISCLOSED && mt_rand(0, 1) === 1);
        $grade = $noGrade ? null : ($this->scoring->grade($this->grades, $total, $homeroom, $violation)['code'] ?? null);
        $evaluation->update([
            'total_score' => $total,
            'grade' => $published ? $grade : null,
            'reviewed_by' => $reviewed ? $this->user(DemoRoster::principal())->id : null,
            'reviewed_at' => $reviewed ? $this->past($published ? $month->addMonth()->day(4)->setTime(10, 0) : $unitScoredAt->addDay()) : null,
        ]);
        $this->attachEvidence($evaluation, $ago);
    }

    private function scores(CarbonImmutable $month, float $deduction, float $bonusChance, bool $homeroom, bool $violation): array
    {
        $criteria = $this->applicable($homeroom);
        $base = $criteria->filter(fn ($c) => $this->section($c)->kind !== EvaluationCriterion::BONUS)->values();
        $bonus = $criteria->filter(fn ($c) => $this->section($c)->kind === EvaluationCriterion::BONUS)->values();
        $self = $criteria->mapWithKeys(fn ($c) => [$c->id => ['score' => $this->section($c)->kind === EvaluationCriterion::BONUS ? 0.0 : (float) $c->max_score, 'note' => null]])->all();

        $target = max(0, $deduction + (mt_rand(-10, 10) / 10) * min(3, $deduction) + ($violation ? 6 : 0));
        $target = round($target * 2) / 2;
        $guard = 0;
        while ($target > 0 && $guard++ < 40) {
            $criterion = $base[mt_rand(0, $base->count() - 1)];
            $step = min($target, [0.5, 1, 2][mt_rand(0, 2)], $self[$criterion->id]['score']);
            if ($step <= 0) {
                continue;
            }
            $self[$criterion->id]['score'] -= $step;
            $self[$criterion->id]['note'] = trim(($self[$criterion->id]['note'] ?? '').' '.$this->note($this->section($criterion)->code, $month));
            $target -= $step;
        }
        if ($bonus->isNotEmpty() && mt_rand(1, 100) <= $bonusChance * 100) {
            $criterion = $bonus[mt_rand(0, $bonus->count() - 1)];
            $self[$criterion->id] = ['score' => (float) min($criterion->max_score, mt_rand(1, 3)), 'note' => self::BONUS_NOTES[mt_rand(0, count(self::BONUS_NOTES) - 1)]];
        }

        $unit = array_map(fn ($row) => ['score' => $row['score'], 'note' => null], $self);
        $roll = mt_rand(1, 100);
        if ($roll <= 30) {
            $criterion = $base[mt_rand(0, $base->count() - 1)];
            if ($unit[$criterion->id]['score'] >= 0.5) {
                $unit[$criterion->id]['score'] -= 0.5;
                $unit[$criterion->id]['note'] = 'Tổ xác minh: '.lcfirst($this->note($this->section($criterion)->code, $month));
            }
        } elseif ($roll <= 40) {
            $deducted = $base->first(fn ($c) => $self[$c->id]['score'] < (float) $c->max_score);
            if ($deducted) {
                $unit[$deducted->id]['score'] = min((float) $deducted->max_score, $unit[$deducted->id]['score'] + 0.5);
                $unit[$deducted->id]['note'] = 'Tổ chấp nhận giải trình, điều chỉnh lại 0,5 điểm.';
            }
        }
        foreach ($bonus as $criterion) {
            if ($unit[$criterion->id]['score'] >= 2 && mt_rand(1, 100) <= 25) {
                $unit[$criterion->id]['score'] -= 1;
                $unit[$criterion->id]['note'] = 'Minh chứng chưa đủ cho mức cộng tối đa.';
            }
        }

        return [$self, $unit];
    }

    private function attachEvidence(Evaluation $evaluation, int $ago): void
    {
        if ($ago !== 0) {
            return;
        }
        $score = EvaluationScore::where('evaluation_id', $evaluation->id)->where('self_score', '>', 0)
            ->whereIn('criterion_id', $this->criteria->whereNotNull('parent_id')->filter(fn ($c) => $c->requires_evidence)->pluck('id'))
            ->first();
        if (! $score) {
            return;
        }
        $teacher = $evaluation->teacher()->with('user')->first();
        $name = 'Minh chứng điểm cộng - '.$teacher->employee_code.'.pdf';
        $path = 'evaluations/demo/'.strtolower($teacher->employee_code).'-'.$evaluation->period_id.'.pdf';
        $contents = $this->pdf('Minh chung diem cong '.$teacher->employee_code);
        Storage::disk('local')->put($path, $contents);
        $file = StoredFile::create([
            'uploaded_by' => $teacher->user_id, 'disk' => 'local', 'path' => $path, 'original_name' => $name,
            'mime_type' => 'application/pdf', 'size' => strlen($contents), 'checksum' => hash('sha256', $contents),
        ]);
        DB::table('file_attachments')->insert(['file_id' => $file->id, 'attachable_type' => EvaluationScore::class, 'attachable_id' => $score->id, 'purpose' => 'evidence', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function explain(EvaluationPeriod $period, string $code, string $question, string $answer): void
    {
        $evaluation = Evaluation::where('period_id', $period->id)->whereHas('teacher', fn ($q) => $q->where('employee_code', $code))->with('teacher.departments')->first();
        if (! $evaluation) {
            return;
        }
        $replier = $this->leaderFor($evaluation->teacher);
        $asked = $this->past(CarbonImmutable::create($period->year, $period->month)->addMonth()->day(3)->setTime(9, 30));
        $first = EvaluationComment::create(['evaluation_id' => $evaluation->id, 'user_id' => $evaluation->teacher->user_id, 'content' => $question]);
        $reply = EvaluationComment::create(['evaluation_id' => $evaluation->id, 'user_id' => $replier->id, 'content' => $answer]);
        $this->stamp('evaluation_comments', $first->id, $asked);
        $this->stamp('evaluation_comments', $reply->id, $this->past($asked->addHours(3)));
    }

    private function applicable(bool $homeroom): Collection
    {
        return $this->criteria->whereNotNull('parent_id')
            ->filter(fn ($c) => $homeroom || ! $this->section($c)->homeroom_only)
            ->sortBy(fn ($c) => [$this->section($c)->position, $c->position])
            ->values();
    }

    private function section(EvaluationCriterion $criterion): EvaluationCriterion
    {
        return $this->sections->firstWhere('id', $criterion->parent_id);
    }

    private function note(string $sectionCode, CarbonImmutable $month): string
    {
        $pool = self::DEDUCTION_NOTES[$sectionCode] ?? ['Chưa hoàn thành đúng yêu cầu.'];

        return strtr($pool[mt_rand(0, count($pool) - 1)], ['{d}' => mt_rand(2, 26), '{m}' => $month->month, '{w}' => mt_rand(1, 4)]);
    }

    private function duties(Employee $teacher, bool $homeroom): string
    {
        $subject = DB::table('employee_subject')->join('subjects', 'subjects.id', '=', 'employee_subject.subject_id')->where('employee_id', $teacher->id)->value('subjects.name') ?? 'chuyên môn';

        return "- Giảng dạy môn {$subject} theo phân công.\n- Sinh hoạt chuyên môn tổ, dự giờ đồng nghiệp."
            .($homeroom ? "\n- Chủ nhiệm lớp, theo dõi nền nếp và liên hệ phụ huynh." : '');
    }

    private function leaderFor(Employee $teacher): User
    {
        $person = collect(DemoRoster::people())->firstWhere('code', $teacher->employee_code);
        $leader = $person ? DemoRoster::holder(Role::TO_TRUONG, $person['tổ']) : null;
        if (! $leader || $leader === $person['handle']) {
            $leader = DemoRoster::principal();
        }

        return $this->user($leader);
    }

    private function buildProfiles(): void
    {
        foreach (DemoRoster::people() as $handle => $person) {
            if (array_intersect(array_column($person['roles'], 0), Role::NOT_EVALUATED)) {
                continue;
            }
            mt_srand(crc32('profile'.$person['code']));
            $roll = mt_rand(1, 100);
            $deduction = match (true) {
                $person['status'] === 'suspended' => 16.0,
                $roll <= 60 => mt_rand(1, 6) / 2,
                $roll <= 85 => mt_rand(6, 12) / 2,
                default => mt_rand(12, 18) / 2,
            };
            $bonus = round(max(0.05, 0.75 - $deduction * 0.08), 2);
            $absent = match ($person['status']) { 'on_leave' => mt_rand(1, 3), 'suspended' => 4, default => null };
            $joined = in_array('new', $person['flags'], true) ? 5 : null;
            $this->profiles[$person['code']] = [$deduction, $bonus, $person['homeroom'], $absent, $joined];
        }
        $ranked = collect($this->profiles)->filter(fn ($profile) => $profile[3] === null || $profile[3] < 5)->sortByDesc(fn ($profile) => $profile[0])->keys()->values();
        $this->violations = [[$ranked[0], 5], [$ranked[1] ?? $ranked[0], 9]];
        $suspended = collect(DemoRoster::people())->firstWhere('status', 'suspended');
        if ($suspended) {
            $this->noGrade = [[$suspended['code'], 6, 'Không thực hiện nhiệm vụ chuyên đề được giao, không có lý do chính đáng.']];
        }
    }

    private function stamp(string $table, int $id, CarbonImmutable $at): void
    {
        DB::table($table)->where('id', $id)->update(['created_at' => $at, 'updated_at' => $at]);
    }

    private function past(CarbonImmutable $at): CarbonImmutable
    {
        return $at->isFuture() ? CarbonImmutable::now()->subMinutes(30) : $at;
    }

    private function user(string $handle): User
    {
        return $this->users[$handle] ??= User::where('email', DemoRoster::email($handle))->firstOrFail();
    }

    private function pdf(string $text): string
    {
        $stream = "BT /F1 16 Tf 72 720 Td ({$text}) Tj ET";

        return "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            ."3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n"
            ."4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
            .'5 0 obj<</Length '.strlen($stream).">>stream\n{$stream}\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
    }
}
