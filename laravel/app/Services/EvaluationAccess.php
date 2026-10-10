<?php

namespace App\Services;

use App\Models\Evaluation;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class EvaluationAccess
{
    private array $scorerPeriods = [];

    private array $assigned = [];

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

    public function assignedScorerIds(Evaluation $evaluation, string $column = Evaluation::UNIT): array
    {
        $rows = $this->assigned[$evaluation->id] ??= ($evaluation->relationLoaded('assignedScorers')
            ? $evaluation->assignedScorers->map(fn ($user) => ['id' => (int) $user->id, 'column' => $user->pivot->column])
            : DB::table('evaluation_scorers')->where('evaluation_id', $evaluation->id)->get(['user_id', 'column'])->map(fn ($row) => ['id' => (int) $row->user_id, 'column' => $row->column]))->all();

        return collect($rows)->where('column', $column)->pluck('id')->values()->all();
    }

    public function canScore(Evaluation $evaluation): bool
    {
        if ($this->isOwn($evaluation)) {
            return false;
        }
        if ($assigned = $this->assignedScorerIds($evaluation)) {
            return in_array($this->user->id, $assigned, true);
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

    public function canScoreLeader(Evaluation $evaluation): bool
    {
        if (! $evaluation->hasLeaderColumn() || $this->isOwn($evaluation)) {
            return false;
        }
        if ($assigned = $this->assignedScorerIds($evaluation, Evaluation::LEADER)) {
            return in_array($this->user->id, $assigned, true);
        }

        return $this->isPeriodScorer($evaluation->period_id) || $this->manages();
    }

    public function canReview(Evaluation $evaluation): bool
    {
        return $this->manages() && ! $this->isOwn($evaluation);
    }

    public function canView(Evaluation $evaluation): bool
    {
        return $this->isOwn($evaluation) || $this->manages() || $this->canScore($evaluation) || $this->canScoreLeader($evaluation);
    }

    public function isAssignedIn(int $periodId): bool
    {
        return DB::table('evaluation_scorers')->join('evaluations', 'evaluations.id', '=', 'evaluation_scorers.evaluation_id')
            ->where('evaluations.period_id', $periodId)->where('evaluation_scorers.user_id', $this->user->id)->exists();
    }

    public function scopeUnitIds(): ?array
    {
        return $this->manages() ? null : ($this->user->managedUnitIds() ?: []);
    }
}
