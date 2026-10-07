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
        $filters = $this->filters($request);
        $summary = $this->build($filters);
        $all = collect($summary['teachers']);
        $rows = $this->rows($all, $filters);

        return response()->json([
            ...$summary,
            'teachers' => $rows->all(),
            'overview' => $this->overview($rows, $summary['grades']),
            'facets' => ['teams' => $this->facet($all, 'team'), 'groups' => $this->facet($all, 'group', true)],
        ]);
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
        $teachers = $this->rows(collect($summary['teachers']), $filters);
        $periods = collect($summary['periods']);
        $grades = $summary['grades'];
        $columnsByYear = $summary['all_years'];
        $timeColumns = $columnsByYear ? collect($summary['year_columns']) : $periods;

        $sheet = new XlsxWriter();
        $columns = 4 + $timeColumns->count() + count($grades) + 4;
        $sheet->widths([5, 7, 26, 20, ...array_fill(0, $timeColumns->count(), 13), ...array_fill(0, count($grades), 8), 8, 8, 9, 9]);
        $sheet->addRow(['TRƯỜNG TH & THCS THANH ĐÀM'], XlsxWriter::PLAIN);
        $sheet->addRow(['HỘI ĐỒNG THI ĐUA KHEN THƯỞNG'], XlsxWriter::PLAIN);
        $row = $sheet->addRow(['BẢNG TỔNG HỢP KẾT QUẢ THI ĐUA HẰNG THÁNG'], XlsxWriter::TITLE);
        $sheet->merge($row, 1, $columns);
        $row = $sheet->addRow([$summary['range_label']], XlsxWriter::CENTER);
        $sheet->merge($row, 1, $columns);
        $sheet->addRow([$this->scopeNote($filters)], XlsxWriter::NOTE);
        $sheet->addRow([]);

        $sheet->addRow([
            'STT', 'Hạng', 'Họ và tên', 'Tổ / nhóm',
            ...($columnsByYear ? $timeColumns->map(fn (array $y) => 'Năm học '.$y['label']) : $periods->map(fn (array $p) => $p['label'].($p['official'] ? '' : ' (chưa công bố)'))),
            ...array_map(fn (array $g) => $g['short'], $grades),
            'KXL', 'Vi phạm', 'Số tháng', 'Điểm TB',
        ], XlsxWriter::HEADER);

        foreach ($teachers as $index => $teacher) {
            $sheet->addRow([
                ['value' => $index + 1, 'style' => XlsxWriter::CELL_CENTER],
                ['value' => $teacher['rank'] ?? '', 'style' => XlsxWriter::CELL_CENTER],
                $teacher['name'],
                trim(($teacher['team']['name'] ?? '').($teacher['group'] ? ' / '.$teacher['group']['name'] : '')),
                ...($columnsByYear
                    ? $timeColumns->map(fn (array $y) => ['value' => isset($teacher['years'][$y['value']]) ? $this->number($teacher['years'][$y['value']]['average']).' ('.$teacher['years'][$y['value']]['months'].' th)' : '—', 'style' => XlsxWriter::CELL_CENTER])
                    : $periods->map(fn (array $p) => ['value' => $this->cellText($teacher['cells'][$p['id']] ?? null), 'style' => XlsxWriter::CELL_CENTER])),
                ...array_map(fn (array $g) => ['value' => $teacher['stats']['counts'][$g['key']] ?? 0, 'style' => XlsxWriter::CELL_CENTER], $grades),
                ['value' => $teacher['stats']['no_grade'], 'style' => XlsxWriter::CELL_CENTER],
                ['value' => $teacher['stats']['violations'], 'style' => XlsxWriter::CELL_CENTER],
                ['value' => $teacher['stats']['months'].'/'.$periods->where('official', true)->count(), 'style' => XlsxWriter::CELL_CENTER],
                ['value' => $teacher['stats']['average'] ?? '', 'style' => XlsxWriter::CELL_CENTER],
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
        $name = 'tong-hop-thi-dua-'.($columnsByYear ? 'tat-ca' : $summary['school_year'].'-'.($summary['school_year'] + 1))
            .($periods->isEmpty() ? '' : '-t'.Str::after($periods->first()['label'], 'T').'-t'.Str::after($periods->last()['label'], 'T'))
            .'.xlsx';
        $name = str_replace('/', '-', $name);

        return response()->download($path, $name, ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])->deleteFileAfterSend();
    }

    private function filters(Request $request): array
    {
        $data = $request->validate([
            'school_year' => ['nullable', 'regex:/^(all|\d{4})$/'],
            'from' => ['nullable', 'date_format:Y-m'],
            'to' => ['nullable', 'date_format:Y-m'],
            'team' => ['nullable', 'integer'],
            'group' => ['nullable', 'integer'],
            'q' => ['nullable', 'string', 'max:100'],
            'homeroom' => ['nullable', 'in:yes,no'],
            'grades' => ['nullable', 'string', 'max:100'],
            'grade_scope' => ['nullable', 'in:any,latest'],
            'violation' => ['nullable', 'in:yes,no'],
            'min' => ['nullable', 'numeric'],
            'max' => ['nullable', 'numeric'],
            'status' => ['nullable', 'in:working,on_leave,suspended'],
            'top' => ['nullable', 'integer', 'in:3,10,20'],
        ]);
        $data['grades'] = array_values(array_filter(explode(',', $data['grades'] ?? '')));

        return $data;
    }

    private function build(array $filters): array
    {
        $all = EvaluationPeriod::get(['year', 'month', 'status']);
        $years = $all->map(fn ($p) => self::schoolYear($p->year, $p->month))->unique()->sortDesc()->values();
        $published = fn (int $y) => $all->filter(fn ($p) => $p->status === EvaluationPeriod::PUBLISHED && self::schoolYear($p->year, $p->month) === $y)->count();
        $fallback = null;
        if (empty($filters['school_year']) && $years->count() > 1 && $published($years->first()) < 2) {
            $fallback = ['school_year' => $years->first(), 'label' => $years->first().'–'.($years->first() + 1), 'published' => $published($years->first())];
        }
        $allYears = ($filters['school_year'] ?? null) === 'all';
        $year = $allYears ? null : (int) ($filters['school_year'] ?? ($fallback ? $years->get(1) : $years->first()) ?? self::schoolYear((int) now()->year, (int) now()->month));
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;

        $yearPeriods = EvaluationPeriod::with('template')->get()
            ->filter(fn (EvaluationPeriod $p) => $allYears || self::schoolYear($p->year, $p->month) === $year)
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

        $homeroom = match ($filters['homeroom'] ?? null) { 'yes' => true, 'no' => false, default => null };
        $teachers = $evaluations->groupBy('teacher_id')->map(function (Collection $sheets) use ($periodById, $gradeKeys, $maxBase, $grades, $homeroom) {
            $teacher = $sheets->first()->teacher;
            $cells = [];
            foreach ($sheets as $sheet) {
                $cells[$sheet->period_id] = $this->cell($sheet, $periodById[$sheet->period_id], $gradeKeys, $maxBase);
            }

            $latest = $sheets->sortByDesc(fn (Evaluation $sheet) => $this->key($periodById[$sheet->period_id]))->first();
            $byYear = collect($cells)->filter(fn (array $c) => $c['official'] && $c['total'] !== null && ($homeroom === null || $c['is_homeroom'] === $homeroom))
                ->groupBy(fn (array $c, $periodId) => self::schoolYear($periodById[$periodId]->year, $periodById[$periodId]->month), true)
                ->map(fn (Collection $items) => ['average' => round($items->avg('total'), 2), 'months' => $items->count()]);

            return [
                'id' => $teacher->id, 'name' => $teacher->user?->name, 'code' => $teacher->employee_code, 'avatar_url' => $this->avatar($teacher->user),
                'employment_status' => $teacher->employment_status, 'is_homeroom' => (bool) $latest->is_homeroom,
                'in_frame' => $homeroom === null || $sheets->contains(fn (Evaluation $sheet) => (bool) $sheet->is_homeroom === $homeroom),
                ...$this->directory->placement($teacher),
                'cells' => $cells,
                'years' => $byYear->all(),
                'stats' => $this->stats($cells, $grades, $homeroom),
            ];
        })->sort(fn (array $a, array $b) => $this->directory->compareNames($a['name'], $b['name']))->values();

        return [
            'school_years' => $years->when($year, fn ($list) => $list->push($year))->unique()->sortDesc()->values()->map(fn (int $y) => ['value' => $y, 'label' => $y.'–'.($y + 1)]),
            'school_year' => $allYears ? 'all' : $year,
            'all_years' => $allYears,
            'year_columns' => $periods->groupBy(fn (EvaluationPeriod $p) => self::schoolYear($p->year, $p->month))->sortKeys()
                ->map(fn (Collection $items, int $y) => ['value' => $y, 'label' => $y.'–'.($y + 1), 'months' => $items->count(), 'official' => $items->where('status', EvaluationPeriod::PUBLISHED)->count()])->values(),
            'mixed_scale' => collect($maxBase)->map(fn (array $base) => $base['homeroom'].'/'.$base['regular'])->unique()->count() > 1,
            'range_label' => $this->rangeLabel($year, $periods),
            'periods' => $periods->map(fn (EvaluationPeriod $p) => [
                'id' => $p->id, 'key' => $this->key($p), 'label' => 'T'.$p->month.'/'.$p->year, 'full_label' => $p->label(),
                'status' => $p->status, 'official' => $p->status === EvaluationPeriod::PUBLISHED,
            ])->values(),
            'year_periods' => $yearPeriods->map(fn (EvaluationPeriod $p) => ['key' => $this->key($p), 'label' => 'T'.$p->month.'/'.$p->year])->values(),
            'grades' => $grades,
            'mixed_grades' => $mixed,
            'fallback' => $fallback,
            'homeroom' => $filters['homeroom'] ?? null,
            'teachers' => $teachers->all(),
        ];
    }

    private function cell(Evaluation $sheet, EvaluationPeriod $period, array $gradeKeys, array $maxBase): array
    {
        if ($period->status !== EvaluationPeriod::PUBLISHED) {
            return ['evaluation_id' => $sheet->id, 'official' => false, 'pending_label' => self::PENDING_LABELS[$period->status] ?? $period->status, 'is_homeroom' => (bool) $sheet->is_homeroom];
        }
        $max = $maxBase[$period->id][$sheet->is_homeroom ? 'homeroom' : 'regular'] ?: null;
        $total = $sheet->total_score === null ? null : (float) $sheet->total_score;
        $gradeKey = $sheet->grade ? ($gradeKeys[$period->template_id][$sheet->grade] ?? null) : null;

        return [
            'evaluation_id' => $sheet->id, 'official' => true,
            'total' => $total, 'max' => $max,
            'grade_key' => $gradeKey, 'grade_name' => $gradeKey ? $this->gradeName($period, $sheet->grade) : null,
            'no_grade_reason' => $sheet->no_grade_reason, 'has_violation' => (bool) $sheet->has_violation, 'is_homeroom' => (bool) $sheet->is_homeroom,
        ];
    }

    private function stats(array $cells, array $grades, ?bool $homeroom = null): array
    {
        $official = collect($cells)->where('official', true)->filter(fn (array $c) => $homeroom === null || $c['is_homeroom'] === $homeroom);
        $totals = $official->pluck('total')->filter(fn ($v) => $v !== null);

        return [
            'months' => $official->count(),
            'counts' => collect($grades)->mapWithKeys(fn (array $g) => [$g['key'] => $official->where('grade_key', $g['key'])->count()])->all(),
            'no_grade' => $official->filter(fn (array $c) => $c['no_grade_reason'] || ! $c['grade_key'])->count(),
            'violations' => $official->where('has_violation', true)->count(),
            'average' => $totals->isEmpty() ? null : round($totals->avg(), 2),
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

    private function rows(Collection $teachers, array $filters): Collection
    {
        $keyword = mb_strtolower(trim($filters['q'] ?? ''));
        $grades = $filters['grades'] ?? [];
        $scope = $teachers->filter(fn (array $row) => $row['in_frame']
            && (empty($filters['team']) || in_array((int) $filters['team'], $row['unit_ids'], true))
            && (empty($filters['group']) || in_array((int) $filters['group'], $row['unit_ids'], true)));
        $rows = $this->rank($scope->values())->filter(function (array $row) use ($filters, $keyword, $grades) {
            $average = $row['stats']['average'];
            $official = collect($row['cells'])->where('official', true)
                ->filter(fn (array $c) => ($filters['homeroom'] ?? null) === null || $c['is_homeroom'] === ($filters['homeroom'] === 'yes'));
            $gradeOf = fn (array $c) => $c['no_grade_reason'] || ! $c['grade_key'] ? 'kxl' : $c['grade_key'];
            $gradeHit = ! $grades || (($filters['grade_scope'] ?? 'any') === 'latest'
                ? ($official->last() && in_array($gradeOf($official->last()), $grades, true))
                : $official->contains(fn (array $c) => in_array($gradeOf($c), $grades, true)));

            return ($keyword === '' || str_contains(mb_strtolower($row['name'].' '.$row['code']), $keyword))
                && $gradeHit
                && (empty($filters['violation']) || ($row['stats']['violations'] > 0) === ($filters['violation'] === 'yes'))
                && (! isset($filters['min']) || ($average !== null && $average >= (float) $filters['min']))
                && (! isset($filters['max']) || ($average !== null && $average <= (float) $filters['max']))
                && (empty($filters['status']) || $row['employment_status'] === $filters['status']);
        });

        return $rows->filter(fn (array $row) => empty($filters['top']) || ($row['rank'] !== null && $row['rank'] <= (int) $filters['top']))->values();
    }

    private function rank(Collection $rows): Collection
    {
        $first = fn (array $row, int $index) => array_values($row['stats']['counts'])[$index] ?? 0;
        $key = fn (array $row) => [-($row['stats']['average'] ?? 0), -$first($row, 0), -$first($row, 1), $row['stats']['violations']];
        $scored = $rows->filter(fn (array $row) => $row['stats']['average'] !== null)
            ->sort(fn (array $a, array $b) => $key($a) <=> $key($b) ?: $this->directory->compareNames($a['name'], $b['name']))->values();
        $result = [];
        $previous = null;
        foreach ($scored as $index => $row) {
            $rank = $previous && $key($previous['row']) === $key($row) ? $previous['rank'] : $index + 1;
            $result[] = [...$row, 'rank' => $rank];
            $previous = ['row' => $row, 'rank' => $rank];
        }
        foreach ($rows->filter(fn (array $row) => $row['stats']['average'] === null) as $row) {
            $result[] = [...$row, 'rank' => null];
        }

        return collect($result);
    }

    private function overview(Collection $rows, array $grades): array
    {
        $averages = $rows->pluck('stats.average')->filter(fn ($v) => $v !== null);
        $topKey = $grades[0]['key'] ?? null;

        return [
            'teachers' => $rows->count(),
            'average' => $averages->isEmpty() ? null : round($averages->avg(), 2),
            'top_grade' => $grades[0]['short'] ?? null,
            'top_grade_teachers' => $topKey ? $rows->filter(fn (array $row) => ($row['stats']['counts'][$topKey] ?? 0) > 0)->count() : 0,
            'violation_teachers' => $rows->filter(fn (array $row) => $row['stats']['violations'] > 0)->count(),
            'unscored' => $rows->filter(fn (array $row) => $row['stats']['average'] === null)->count(),
        ];
    }

    private function facet(Collection $rows, string $field, bool $withTeam = false): array
    {
        return $rows->filter(fn (array $row) => $row[$field])
            ->map(fn (array $row) => [...$row[$field], ...($withTeam ? ['team_id' => $row['team']['id'] ?? null] : [])])
            ->unique('id')->sortBy('name', SORT_LOCALE_STRING)->values()->all();
    }

    private function scopeNote(array $filters): string
    {
        $frame = match ($filters['homeroom'] ?? null) { 'yes' => ' Chỉ tính các tháng chủ nhiệm.', 'no' => ' Chỉ tính các tháng không chủ nhiệm.', default => '' };

        return 'Chỉ tính các tháng đã công bố.'.$frame.' Ô "—": không có phiếu tháng đó; KXL: không xếp loại; Điểm TB: trung bình tổng điểm các tháng được chấm. Bảng xếp hạng chỉ để tham khảo, hệ thống không tự xếp danh hiệu.';
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

    private function rangeLabel(?int $year, Collection $periods): string
    {
        $label = $year ? 'Năm học '.$year.'–'.($year + 1) : 'Tất cả các năm';
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
