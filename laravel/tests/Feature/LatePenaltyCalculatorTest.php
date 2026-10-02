<?php

namespace Tests\Feature;

use App\Services\LatePenaltyCalculator;
use Carbon\Carbon;
use Tests\TestCase;

class LatePenaltyCalculatorTest extends TestCase
{
    public function test_it_does_not_deduct_for_an_on_time_submission(): void
    {
        $result = app(LatePenaltyCalculator::class)->calculate(80, Carbon::parse('2026-09-15 17:00'), Carbon::parse('2026-09-15 16:59'));

        $this->assertSame(0, $result['late_days']);
        $this->assertSame(0.0, $result['penalty_score']);
        $this->assertSame(80.0, $result['final_score']);
    }

    public function test_it_rounds_partial_days_up_and_applies_the_configured_percentage(): void
    {
        $rules = [
            (object) ['from_day' => 1, 'to_day' => 1, 'penalty_percent' => 5],
            (object) ['from_day' => 2, 'to_day' => 3, 'penalty_percent' => 10],
        ];

        $oneDay = app(LatePenaltyCalculator::class)->calculate(80, Carbon::parse('2026-09-15 17:00'), Carbon::parse('2026-09-15 18:00'), $rules);
        $threeDays = app(LatePenaltyCalculator::class)->calculate(80, Carbon::parse('2026-09-15 17:00'), Carbon::parse('2026-09-18 16:00'), $rules);

        $this->assertSame(1, $oneDay['late_days']);
        $this->assertSame(4.0, $oneDay['penalty_score']);
        $this->assertSame(76.0, $oneDay['final_score']);
        $this->assertSame(3, $threeDays['late_days']);
        $this->assertSame(8.0, $threeDays['penalty_score']);
        $this->assertSame(72.0, $threeDays['final_score']);
    }

    public function test_even_one_second_or_one_minute_late_uses_the_first_penalty_level(): void
    {
        $rules = [(object) ['from_day' => 1, 'to_day' => 1, 'penalty_percent' => 5]];
        $deadline = Carbon::parse('2026-09-15 17:00:00');

        foreach (['2026-09-15 17:00:01', '2026-09-15 17:01:00'] as $submittedAt) {
            $result = app(LatePenaltyCalculator::class)->calculate(100, $deadline, Carbon::parse($submittedAt), $rules);

            $this->assertSame(1, $result['late_days']);
            $this->assertSame(5.0, $result['penalty_percent']);
            $this->assertSame(5.0, $result['penalty_score']);
            $this->assertSame(95.0, $result['final_score']);
        }
    }
}
