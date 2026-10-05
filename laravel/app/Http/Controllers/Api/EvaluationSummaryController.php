<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Evaluation;
use App\Models\EvaluationCriterion;
use App\Models\EvaluationPeriod;
use App\Models\Teacher;
use App\Models\User;
use App\Services\EvaluationDirectory;
use App\Services\XlsxWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class EvaluationSummaryController extends Controller
{
    public const YEAR_START_MONTH = 8;

    private const PENDING_LABELS = [
        EvaluationPeriod::OPEN => 'Đang chấm',
        EvaluationPeriod::DISCLOSED => 'Chờ công bố',
    ];

    public function __construct(private EvaluationDirectory $directory) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->build($this->filters($request)));
    }

    public function teacher(Request $request, Teacher $teacher): JsonResponse
    {
        $summary = $this->build($this->filters($request) + ['teacher_id' => $teacher->id]);

        return response()->json([...$summary, 'teacher' => $summary['teachers'][0] ?? null, 'teachers' => null]);
    }

    public function export(Request $request): BinaryFileResponse
    {
        $filters = $this->filters($request);
        $summary = $this->build($filters);
        $teachers = collect($summary['teachers'])->filter(fn (array $row) => $this->matches($row, $filters))->values();
        $periods = collect($summary['periods']);
        $grades = $summary['grades'];

        $sheet = new XlsxWriter();
        $columns = 3 + $periods->count() + count($grades) + 3;
        $sheet->widths([5, 26, 20, ...array_fill(0, $periods->count(), 13), ...array_fill(0, count($grades), 8), 8, 8, 10]);
        $sheet->addRow(['TRƯỜNG TH & THCS THANH ĐÀM'], XlsxWriter::PLAIN);
        $sheet->addRow(['HỘI ĐỒNG THI ĐUA KHEN THƯỞNG'], XlsxWriter::PLAIN);
        $row = $sheet->addRow(['BẢNG TỔNG HỢP KẾT QUẢ THI ĐUA HẰNG THÁNG'], XlsxWriter::TITLE);
        $sheet->merge($row, 1, $columns);
        $row = $sheet->addRow([$summary['range_label']], XlsxWriter::CENTER);
        $sheet->merge($row, 1, $columns);
        $sheet->addRow(['Chỉ tính các tháng đã công bố. Ô "—": không có phiếu tháng đó; KXL: không xếp loại; TB: điểm trung bình theo % điểm tối đa (GVCN 100, không CN 80).'], XlsxWriter::NOTE);
        $sheet->addRow([]);

        $sheet->addRow([
            'STT', 'Họ và tên', 'Tổ / nhóm',
            ...$periods->map(fn (array $p) => $p['label'].($p['official'] ? '' : ' (chưa công bố)')),
            ...array_map(fn (array $g) => $g['short'], $grades),
            'KXL', 'Vi phạm', 'TB (%)',
        ], XlsxWriter::HEADER);

        foreach ($teachers as $index => $teacher) {
            $sheet->addRow([
                ['value' => $index + 1, 'style' => XlsxWriter::CELL_CENTER],
                $teacher['name'],
                trim(($teacher['team']['name'] ?? '').($teacher['group'] ? ' / '.$teacher['group']['name'] : '')),
                ...$periods->map(fn (array $p) => ['value' => $this->cellText($teacher['cells'][$p['id']] ?? null), 'style' => XlsxWriter::CELL_CENTER]),
                ...array_map(fn (array $g) => ['value' => $teacher['stats']['counts'][$g['key']] ?? 0, 'style' => XlsxWriter::CELL_CENTER], $grades),
                ['value' => $teacher['stats']['no_grade'], 'style' => XlsxWriter::CELL_CENTER],
                ['value' => $teacher['stats']['violations'], 'style' => XlsxWriter::CELL_CENTER],
                ['value' => $teacher['stats']['average_percent'] ?? '', 'style' => XlsxWriter::CELL_CENTER],
            ]);
        }

        $sheet->addRow([]);
        $half = intdiv($columns, 2);
        $row = $sheet->addRow([...array_fill(0, $half, ''), 'Thanh Đàm, ngày …… tháng …… năm ……'], XlsxWriter::CENTER);
        $sheet->merge($row, $half + 1, $columns);
        $row = $sheet->addRow(['THƯ KÝ HỘI ĐỒNG', ...array_fill(0, $half - 1, ''), 'CHỦ TỊCH HỘI ĐỒNG'], XlsxWriter::CENTER);
        $sheet->merge($row, 1, $half);
        $sheet->merge($row, $half + 1, $columns);

        $path = tempnam(sys_get_temp_dir(), 'tdx');
        $sheet->save($path, 'Tổng hợp');
        $name = 'tong-hop-thi-dua-'.$summary['school_year'].'-'.($summary['school_year'] + 1)
            .($periods->isEmpty() ? '' : '-t'.Str::after($periods->first()['label'], 'T').'-t'.Str::after($periods->last()['label'], 'T'))
            .'.xlsx';
        $name = str_replace('/', '-', $name);

        return response()->download($path, $name, ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])->deleteFileAfterSend();
    }

    private function filters(Request $request): array
    {
        $data = $request->validate([
            'school_year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'from' => ['nullable', 'date_format:Y-m'],
            'to' => ['nullable', 'date_format:Y-m'],
            'team' => ['nullable', 'integer'],
            'group' => ['nullable', 'integer'],
            'q' => ['nullable', 'string', 'max:100'],
        ]);

        return $data;
    }

    private function build(array $filters): array
    {
        $years = EvaluationPeriod::get(['year', 'month'])->map(fn ($p) => self::schoolYear($p->year, $p->month))->unique()->sortDesc()->values();
        $year = (int) ($filters['school_year'] ?? $years->first() ?? self::schoolYear((int) now()->year, (int) now()->month));
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;

        $yearPeriods = EvaluationPeriod::with('template')->get()
            ->filter(fn (EvaluationPeriod $p) => self::schoolYear($p->year, $p->month) === $year)
            ->sortBy(fn (EvaluationPeriod $p) => $this->key($p))
            ->values();
        $periods = $yearPeriods->filter(fn (EvaluationPeriod $p) => (! $from || $this->key($p) >= $from) && (! $to || $this->key($p) <= $to))->values();

        [$grades, $gradeKeys, $mixed] = $this->mergeGrades($periods);
        $maxBase = $this->maxBases($periods);

        $evaluations = Evaluation::with(['teacher.user', 'teacher.departments'])
            ->whereIn('period_id', $periods->pluck('id'))
            ->when($filters['teacher_id'] ?? null, fn ($q, $id) => $q->where('teacher_id', $id))
            ->get();
        $periodById = $periods->keyBy('id');

        $teachers = $evaluations->groupBy('teacher_id')->map(function (Collection $sheets) use ($periodById, $gradeKeys, $maxBase, $grades) {
            $teacher = $sheets->first()->teacher;
            $cells = [];
            foreach ($sheets as $sheet) {
                $cells[$sheet->period_id] = $this->cell($sheet, $periodById[$sheet->period_id], $gradeKeys, $maxBase);
            }

            return [
                'id' => $teacher->id, 'name' => $teacher->user?->name, 'code' => $teacher->employee_code, 'avatar_url' => $this->avatar($teacher->user),
                ...$this->directory->placement($teacher),
                'cells' => $cells,
                'stats' => $this->stats($cells, $grades),
            ];
        })->sort(fn (array $a, array $b) => $this->directory->compareNames($a['name'], $b['name']))->values();

        return [
            'school_years' => $years->push($year)->unique()->sortDesc()->values()->map(fn (int $y) => ['value' => $y, 'label' => $y.'–'.($y + 1)]),
            'school_year' => $year,
            'range_label' => $this->rangeLabel($year, $periods),
            'periods' => $periods->map(fn (EvaluationPeriod $p) => [
                'id' => $p->id, 'key' => $this->key($p), 'label' => 'T'.$p->month.'/'.$p->year, 'full_label' => $p->label(),
                'status' => $p->status, 'official' => $p->status === EvaluationPeriod::PUBLISHED,
            ])->values(),
            'year_periods' => $yearPeriods->map(fn (EvaluationPeriod $p) => ['key' => $this->key($p), 'label' => 'T'.$p->month.'/'.$p->year])->values(),
            'grades' => $grades,
            'mixed_grades' => $mixed,
            'teachers' => $teachers->all(),
        ];
    }

    private function cell(Evaluation $sheet, EvaluationPeriod $period, array $gradeKeys, array $maxBase): array
    {
        if ($period->status !== EvaluationPeriod::PUBLISHED) {
            return ['evaluation_id' => $sheet->id, 'official' => false, 'pending_label' => self::PENDING_LABELS[$period->status] ?? $period->status];
        }
        $max = $maxBase[$period->id][$sheet->is_homeroom ? 'homeroom' : 'regular'] ?: null;
        $total = $sheet->total_score === null ? null : (float) $sheet->total_score;
        $gradeKey = $sheet->grade ? ($gradeKeys[$period->template_id][$sheet->grade] ?? null) : null;

        return [
            'evaluation_id' => $sheet->id, 'official' => true,
            'total' => $total, 'max' => $max, 'percent' => $total !== null && $max ? round($total / $max * 100, 1) : null,
            'grade_key' => $gradeKey, 'grade_name' => $gradeKey ? $this->gradeName($period, $sheet->grade) : null,
            'no_grade_reason' => $sheet->no_grade_reason, 'has_violation' => (bool) $sheet->has_violation, 'is_homeroom' => (bool) $sheet->is_homeroom,
        ];
    }

    private function stats(array $cells, array $grades): array
    {
        $official = collect($cells)->where('official', true);
        $percents = $official->pluck('percent')->filter(fn ($v) => $v !== null);

        return [
            'months' => $official->count(),
            'counts' => collect($grades)->mapWithKeys(fn (array $g) => [$g['key'] => $official->where('grade_key', $g['key'])->count()])->all(),
            'no_grade' => $official->filter(fn (array $c) => $c['no_grade_reason'] || ! $c['grade_key'])->count(),
            'violations' => $official->where('has_violation', true)->count(),
            'average_percent' => $percents->isEmpty() ? null : round($percents->avg(), 1),
        ];
    }

    private function mergeGrades(Collection $periods): array
    {
        $columns = [];
        $keys = [];
        $mixed = false;
        $first = true;
        foreach ($periods->pluck('template')->filter()->unique('id') as $template) {
            foreach ($template->grades ?? [] as $grade) {
                $name = $this->normalize($grade['name'] ?? '');
                $index = collect($columns)->search(fn (array $c) => in_array($grade['code'], $c['codes'], true));
                if ($index === false) {
                    $index = collect($columns)->search(fn (array $c) => $c['match'] === $name);
                }
                if ($index === false) {
                    $mixed = $mixed || ! $first;
                    $columns[] = ['key' => 'g'.(count($columns) + 1), 'name' => $grade['name'], 'short' => $this->short($grade['name']), 'codes' => [$grade['code']], 'match' => $name];
                    $index = count($columns) - 1;
                } elseif (! in_array($grade['code'], $columns[$index]['codes'], true)) {
                    $columns[$index]['codes'][] = $grade['code'];
                }
                $keys[$template->id][$grade['code']] = $columns[$index]['key'];
            }
            $first = false;
        }

        return [array_map(fn (array $c) => ['key' => $c['key'], 'name' => $c['name'], 'short' => $c['short']], $columns), $keys, $mixed];
    }

    private function maxBases(Collection $periods): array
    {
        $sections = EvaluationCriterion::whereIn('template_id', $periods->pluck('template_id')->unique())->whereNull('parent_id')->get()->groupBy('template_id');

        return $periods->mapWithKeys(function (EvaluationPeriod $p) use ($sections) {
            $base = ($sections[$p->template_id] ?? collect())->where('kind', '!=', EvaluationCriterion::BONUS);

            return [$p->id => [
                'homeroom' => (float) $base->sum('max_score'),
                'regular' => (float) $base->where('homeroom_only', false)->sum('max_score'),
            ]];
        })->all();
    }

    private function matches(array $row, array $filters): bool
    {
        $keyword = mb_strtolower(trim($filters['q'] ?? ''));

        return (empty($filters['team']) || in_array((int) $filters['team'], $row['unit_ids'], true))
            && (empty($filters['group']) || in_array((int) $filters['group'], $row['unit_ids'], true))
            && ($keyword === '' || str_contains(mb_strtolower($row['name'].' '.$row['code']), $keyword));
    }

    private function cellText(?array $cell): string
    {
        if (! $cell) {
            return '—';
        }
        if (! $cell['official']) {
            return $cell['pending_label'];
        }
        $grade = $cell['no_grade_reason'] || ! $cell['grade_name'] ? 'KXL' : $this->short($cell['grade_name']);
        $total = $cell['total'] === null ? '' : $this->number($cell['total']);

        return trim($grade.($grade && $total !== '' ? ' · ' : '').$total.($cell['has_violation'] ? ' (VP)' : ''));
    }

    private function number(float $value): string
    {
        return floor($value) == $value ? (string) (int) $value : rtrim(number_format($value, 2, ',', ''), '0');
    }

    private function rangeLabel(int $year, Collection $periods): string
    {
        $label = 'Năm học '.$year.'–'.($year + 1);
        if ($periods->isEmpty()) {
            return $label;
        }

        return $label.' · Từ tháng '.$periods->first()->month.'/'.$periods->first()->year.' đến tháng '.$periods->last()->month.'/'.$periods->last()->year;
    }

    private function gradeName(EvaluationPeriod $period, string $code): string
    {
        return collect($period->template->grades ?? [])->firstWhere('code', $code)['name'] ?? $code;
    }

    private function short(string $name): string
    {
        return trim(Str::before($name, '(')) ?: $name;
    }

    private function normalize(string $name): string
    {
        return Str::slug($name, '_');
    }

    private function key(EvaluationPeriod $period): string
    {
        return sprintf('%04d-%02d', $period->year, $period->month);
    }

    private function avatar(?User $user): ?string
    {
        return $user?->avatar_path ? route('avatars.show', ['filename' => basename($user->avatar_path)]) : null;
    }

    public static function schoolYear(int $year, int $month): int
    {
        return $month >= self::YEAR_START_MONTH ? $year : $year - 1;
    }
}
