<?php

namespace App\Services;

use App\Models\Evaluation;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class EvaluationAccess
{
    private array $scorerPeriods = [];

    public function __construct(private User $user) {}

    public function manages(): bool
    {
        return $this->user->hasPermission('evaluation.manage');
    }

    public function isOwn(Evaluation $evaluation): bool
    {
        return $this->user->employee && (int) $evaluation->teacher_id === $this->user->employee->id;
    }

    public function isPeriodScorer(int $periodId): bool
    {
        return $this->scorerPeriods[$periodId] ??= DB::table('evaluation_period_scorers')->where('period_id', $periodId)->where('user_id', $this->user->id)->exists();
    }

    public function canScore(Evaluation $evaluation): bool
    {
        if ($this->isOwn($evaluation)) {
            return false;
        }
        if ($evaluation->scoredByLeadership()) {
            return $this->isPeriodScorer($evaluation->period_id);
        }
        if ($this->manages()) {
            return true;
        }
        if (! $this->user->hasPermission('evaluation.score') || $evaluation->teacher->user?->hasRole(Role::TO_TRUONG)) {
            return false;
        }
        $units = $this->user->managedUnitIds();

        return $units !== null && array_intersect($evaluation->teacher->unitIds(), $units) !== [];
    }

    public function canReview(Evaluation $evaluation): bool
    {
        return $this->manages() && ! $this->isOwn($evaluation);
    }

    public function canView(Evaluation $evaluation): bool
    {
        return $this->isOwn($evaluation) || $this->manages() || $this->canScore($evaluation);
    }

    public function scopeUnitIds(): ?array
    {
        return $this->manages() ? null : ($this->user->managedUnitIds() ?: []);
    }
}
