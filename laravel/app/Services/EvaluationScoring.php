<?php

namespace App\Services;

use App\Models\Evaluation;
use App\Models\EvaluationCriterion;
use App\Models\EvaluationScore;
use Illuminate\Support\Collection;

class EvaluationScoring
{
    public function totals(Evaluation $evaluation, Collection $criteria, string $column): array
    {
        $scores = $evaluation->scores->keyBy('criterion_id');
        $sections = $criteria->whereNull('parent_id')->sortBy('position');
        $bySection = [];
        $base = 0.0;
        $bonus = 0.0;

        foreach ($sections as $section) {
            if ($section->homeroom_only && ! $evaluation->is_homeroom) {
                continue;
            }
            $sum = 0.0;
            foreach ($criteria->where('parent_id', $section->id) as $criterion) {
                $sum += $this->clamp((float) ($this->value($scores->get($criterion->id), $column) ?? 0), (float) $criterion->max_score);
            }
            $sum = $this->clamp($sum, (float) $section->max_score);
            $bySection[$section->id] = round($sum, 2);
            if ($section->kind === EvaluationCriterion::BONUS) {
                $bonus += $sum;
            } else {
                $base += $sum;
            }
        }

        return ['sections' => $bySection, 'base' => round($base, 2), 'bonus' => round($bonus, 2), 'total' => round($base + $bonus, 2)];
    }

    public function hasZero(Evaluation $evaluation, Collection $criteria, string $column): bool
    {
        $scores = $evaluation->scores->keyBy('criterion_id');
        $sections = $criteria->whereNull('parent_id')->where('kind', EvaluationCriterion::SCORE)
            ->reject(fn ($section) => $section->homeroom_only && ! $evaluation->is_homeroom);

        return $criteria->whereIn('parent_id', $sections->pluck('id'))
            ->contains(fn ($criterion) => (float) $criterion->max_score > 0 && (float) ($this->value($scores->get($criterion->id), $column) ?? 0) <= 0);
    }

    public function grade(array $grades, float $total, bool $isHomeroom, bool $hasViolation, bool $hasZero = false): ?array
    {
        foreach ($grades as $grade) {
            if ((($grade['clean_required'] ?? false) && $hasViolation) || (($grade['requires_no_zero'] ?? false) && $hasZero)) {
                continue;
            }
            $minimum = (float) ($isHomeroom ? $grade['homeroom_min'] : $grade['regular_min']);
            if ($total >= $minimum) {
                return $grade;
            }
        }

        return null;
    }

    public function value(?EvaluationScore $score, string $column): mixed
    {
        if (! $score) {
            return null;
        }

        return $score->{$column.'_score'};
    }

    public function clamp(float $value, float $max): float
    {
        return max(0.0, min($value, $max));
    }
}
