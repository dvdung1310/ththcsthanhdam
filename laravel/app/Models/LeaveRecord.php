<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class LeaveRecord extends Model
{
    public const EXCUSED = 'excused';
    public const UNEXCUSED = 'unexcused';
    public const REGIME = 'regime';

    public const TYPES = [self::EXCUSED => 'Có phép', self::UNEXCUSED => 'Không phép', self::REGIME => 'Nghỉ chế độ'];

    public const REGIME_KINDS = ['maternity' => 'Thai sản', 'family' => 'Hiếu hỉ', 'memorial' => 'Giỗ tứ thân phụ mẫu', 'other' => 'Chế độ khác'];

    public const SESSIONS = ['am', 'pm'];

    protected $fillable = ['employee_id', 'type', 'regime_kind', 'starts_on', 'start_session', 'ends_on', 'end_session', 'sessions', 'reason', 'created_by', 'updated_by'];

    protected $casts = ['starts_on' => 'date', 'ends_on' => 'date', 'sessions' => 'integer'];

    public function employee() { return $this->belongsTo(Employee::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }

    public function scopeOverlapping(Builder $query, CarbonInterface $from, CarbonInterface $to): Builder
    {
        return $query->whereDate('starts_on', '<=', $to)->whereDate('ends_on', '>=', $from);
    }

    public static function countSessions(CarbonInterface $start, string $startSession, CarbonInterface $end, string $endSession): int
    {
        $count = 0;
        for ($day = CarbonImmutable::parse($start->toDateString()); $day->lte($end); $day = $day->addDay()) {
            if ($day->isWeekend()) {
                continue;
            }
            $first = $day->isSameDay($start);
            $last = $day->isSameDay($end);
            $count += (int) ! ($first && $startSession === 'pm') + (int) ! ($last && $endSession === 'am');
        }

        return $count;
    }

    public function sessionsWithin(CarbonInterface $from, CarbonInterface $to): int
    {
        if ($this->starts_on->gte($from) && $this->ends_on->lte($to)) {
            return $this->sessions;
        }
        $start = $this->starts_on->max($from);
        $end = $this->ends_on->min($to);
        if ($start->gt($end)) {
            return 0;
        }

        return self::countSessions($start, $start->isSameDay($this->starts_on) ? $this->start_session : 'am', $end, $end->isSameDay($this->ends_on) ? $this->end_session : 'pm');
    }
}
