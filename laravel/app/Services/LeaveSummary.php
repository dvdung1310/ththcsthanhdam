<?php

namespace App\Services;

use App\Http\Controllers\Api\EvaluationSummaryController;
use App\Models\LeaveRecord;
use Carbon\CarbonImmutable;

class LeaveSummary
{
    public const EXCUSED_PER_SESSION = 1.0;

    public const UNEXCUSED_PER_TIME = 8.0;

    public const YEAR_WARNING_SESSIONS = 16;

    public const YEAR_REVIEW_SESSIONS = 24;

    public function forMonth(int $employeeId, int $year, int $month): array
    {
        $from = CarbonImmutable::create($year, $month, 1)->startOfMonth();
        $to = $from->endOfMonth();
        $records = LeaveRecord::where('employee_id', $employeeId)->overlapping($from, $to)->orderBy('starts_on')->get();
        $sessions = fn (string $type) => $records->where('type', $type)->sum(fn (LeaveRecord $r) => $r->sessionsWithin($from, $to));
        $excused = $sessions(LeaveRecord::EXCUSED);
        $unexcused = $records->where('type', LeaveRecord::UNEXCUSED)->count();

        $schoolYear = EvaluationSummaryController::schoolYear($year, $month);
        $yearFrom = CarbonImmutable::create($schoolYear, EvaluationSummaryController::YEAR_START_MONTH, 1);
        $yearRecords = LeaveRecord::where('employee_id', $employeeId)->whereIn('type', [LeaveRecord::EXCUSED, LeaveRecord::UNEXCUSED])
            ->overlapping($yearFrom, $to)->get();
        $yearSessions = $yearRecords->sum(fn (LeaveRecord $r) => $r->sessionsWithin($yearFrom, $to));

        $details = array_values(array_filter([
            $excused ? ['label' => "Nghỉ có phép {$excused} buổi × 1đ", 'points' => $excused * self::EXCUSED_PER_SESSION] : null,
            $unexcused ? ['label' => "Nghỉ không phép {$unexcused} lần × 8đ", 'points' => $unexcused * self::UNEXCUSED_PER_TIME] : null,
        ]));

        return [
            'excused_sessions' => $excused,
            'unexcused_count' => $unexcused,
            'regime_sessions' => $sessions(LeaveRecord::REGIME),
            'records' => $records->map(fn (LeaveRecord $r) => [
                'id' => $r->id, 'type' => $r->type, 'type_label' => LeaveRecord::TYPES[$r->type],
                'regime_kind' => $r->regime_kind ? LeaveRecord::REGIME_KINDS[$r->regime_kind] ?? $r->regime_kind : null,
                'starts_on' => $r->starts_on->toDateString(), 'start_session' => $r->start_session,
                'ends_on' => $r->ends_on->toDateString(), 'end_session' => $r->end_session,
                'sessions' => $r->sessionsWithin($from, $to), 'reason' => $r->reason,
            ])->values(),
            'suggested_deduction' => array_sum(array_column($details, 'points')),
            'details' => $details,
            'year' => [
                'label' => $schoolYear.'–'.($schoolYear + 1),
                'sessions' => $yearSessions,
                'days' => $yearSessions / 2,
                'warnings' => array_values(array_filter([
                    $yearSessions > self::YEAR_WARNING_SESSIONS ? 'Đã nghỉ trên 8 ngày (16 buổi) trong năm học: không xếp loại thi đua đợt IV.' : null,
                    $yearSessions >= self::YEAR_REVIEW_SESSIONS ? 'Đã nghỉ từ 12 ngày trong năm học: HĐTĐ xem xét theo chất lượng và hiệu quả công việc.' : null,
                ])),
            ],
        ];
    }
}
