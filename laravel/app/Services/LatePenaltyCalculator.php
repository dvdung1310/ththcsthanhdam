<?php

namespace App\Services;

use App\Models\LatePenaltyRule;
use Carbon\CarbonInterface;

class LatePenaltyCalculator
{
    public function calculate(float $score, ?CarbonInterface $dueAt, ?CarbonInterface $submittedAt, ?iterable $rules = null): array
    {
        if (! $dueAt || ! $submittedAt || $submittedAt->lessThanOrEqualTo($dueAt)) {
            return $this->result($score, 0, 0, 0);
        }

        $lateSeconds = max(1, (int) $dueAt->diffInSeconds($submittedAt));
        $lateDays = max(1, (int) ceil($lateSeconds / 86400));
        $rule = $rules === null
            ? LatePenaltyRule::query()->where('from_day', '<=', $lateDays)->where(fn ($query) => $query->whereNull('to_day')->orWhere('to_day', '>=', $lateDays))->orderByDesc('from_day')->first()
            : collect($rules)->filter(fn ($item) => $item->from_day <= $lateDays && ($item->to_day === null || $item->to_day >= $lateDays))->sortByDesc('from_day')->first();

        return $this->result($score, $lateDays, (float) ($rule?->penalty_percent ?? 0), $lateSeconds);
    }

    private function result(float $score, int $lateDays, float $percent, int $lateSeconds): array
    {
        $penalty = round($score * $percent / 100, 2);

        return [
            'late_days' => $lateDays,
            'late_seconds' => $lateSeconds,
            'penalty_percent' => $percent,
            'penalty_score' => $penalty,
            'score_before_penalty' => round($score, 2),
            'final_score' => max(0, round($score - $penalty, 2)),
        ];
    }
}
