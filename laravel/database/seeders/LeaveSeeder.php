<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\LeaveRecord;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\Demo\DemoRoster;
use Illuminate\Database\Seeder;

class LeaveSeeder extends Seeder
{
    private const MONTHS_BACK = 4;

    private const EXCUSED_REASONS = ['Việc gia đình', 'Đi khám bệnh', 'Con ốm', 'Giải quyết thủ tục hành chính', 'Đưa người thân đi viện'];

    private const REGIME = [
        ['family', 'Đám cưới của bản thân', 6],
        ['family', 'Hiếu sự trong gia đình', 6],
        ['memorial', 'Giỗ bố', 2],
        ['other', 'Nghỉ ốm có giấy BHXH', 4],
    ];

    private array $users = [];

    public function run(): void
    {
        if (LeaveRecord::exists()) {
            return;
        }
        mt_srand(20263);
        $secretary = $this->user('trang.tt');
        $people = collect([...DemoRoster::people(), ...DemoRoster::staff()])->filter(fn ($person) => $person['status'] === 'working');
        $employees = Employee::whereIn('employee_code', $people->pluck('code'))->get()->keyBy('employee_code');
        $today = CarbonImmutable::today();

        for ($ago = self::MONTHS_BACK; $ago >= 0; $ago--) {
            $month = $today->startOfMonth()->subMonths($ago);
            if (in_array($month->month, [6, 7], true)) {
                continue;
            }
            $lastDay = $ago === 0 ? max(1, $today->day - 1) : $month->daysInMonth;
            foreach ($people as $handle => $person) {
                $employee = $employees->get($person['code']);
                if (! $employee) {
                    continue;
                }
                $roll = mt_rand(1, 100);
                if ($roll <= 22) {
                    $sessions = mt_rand(1, 3);
                    $this->record($employee, $month, $lastDay, LeaveRecord::EXCUSED, null, $sessions, self::EXCUSED_REASONS[mt_rand(0, count(self::EXCUSED_REASONS) - 1)], mt_rand(1, 100) <= 70 ? $this->user($handle) : $secretary);
                } elseif ($roll <= 26) {
                    [$kind, $reason, $sessions] = self::REGIME[mt_rand(0, count(self::REGIME) - 1)];
                    $this->record($employee, $month, $lastDay, LeaveRecord::REGIME, $kind, $sessions, $reason, mt_rand(1, 100) <= 60 ? $this->user($handle) : $secretary);
                }
            }
        }

        $previous = $today->startOfMonth()->subMonth();
        foreach ($people->keys()->filter(fn ($handle, $index) => in_array($index, [7, 23, 41], true)) as $handle) {
            if ($employee = $employees->get($people[$handle]['code'])) {
                $this->record($employee, $previous, $previous->daysInMonth, LeaveRecord::UNEXCUSED, null, 1, 'Vắng buổi trực không báo trước', $secretary);
            }
        }
    }

    private function record(Employee $employee, CarbonImmutable $month, int $lastDay, string $type, ?string $kind, int $sessions, string $reason, User $author): void
    {
        $start = $month->day(mt_rand(1, max(1, $lastDay - 2)));
        while ($start->isWeekend()) {
            $start = $start->addDay();
        }
        $startSession = $sessions % 2 === 1 && mt_rand(0, 1) ? 'pm' : 'am';
        $end = $start;
        $endSession = $startSession;
        $count = 1;
        while ($count < $sessions) {
            if ($endSession === 'am') {
                $endSession = 'pm';
            } else {
                do {
                    $end = $end->addDay();
                } while ($end->isWeekend());
                $endSession = 'am';
            }
            $count++;
        }
        if ($end->month !== $month->month || $end->gt(CarbonImmutable::today())) {
            return;
        }
        $at = $end->setTime(16, 30);
        $record = LeaveRecord::create([
            'employee_id' => $employee->id, 'type' => $type, 'regime_kind' => $kind,
            'starts_on' => $start->toDateString(), 'start_session' => $startSession, 'ends_on' => $end->toDateString(), 'end_session' => $endSession,
            'sessions' => LeaveRecord::countSessions($start, $startSession, $end, $endSession), 'reason' => $reason,
            'created_by' => $author->id, 'updated_by' => $author->id,
        ]);
        LeaveRecord::whereKey($record->id)->update(['created_at' => $at, 'updated_at' => $at]);
    }

    private function user(string $handle): User
    {
        return $this->users[$handle] ??= User::where('email', DemoRoster::email($handle))->firstOrFail();
    }
}
