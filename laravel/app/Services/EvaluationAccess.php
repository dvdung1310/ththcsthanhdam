<?php

namespace App\Services;

use App\Models\Evaluation;
use App\Models\Role;
use App\Models\User;

class EvaluationAccess
{
    public function __construct(private User $user) {}

    public function manages(): bool
    {
        return $this->user->hasPermission('evaluation.manage');
    }

    public function isOwn(Evaluation $evaluation): bool
    {
        return $this->user->teacher && (int) $evaluation->teacher_id === $this->user->teacher->id;
    }

    public function canScore(Evaluation $evaluation): bool
    {
        if ($this->manages()) {
            return true;
        }
        if (! $this->user->hasPermission('evaluation.score') || $this->isOwn($evaluation) || $evaluation->teacher->user?->hasRole(Role::TO_TRUONG)) {
            return false;
        }
        $units = $this->user->managedUnitIds();

        return $units !== null && array_intersect($evaluation->teacher->unitIds(), $units) !== [];
    }

    public function canView(Evaluation $evaluation): bool
    {
        return $this->isOwn($evaluation) || $this->canScore($evaluation);
    }

    public function scopeUnitIds(): ?array
    {
        return $this->manages() ? null : ($this->user->managedUnitIds() ?: []);
    }
}
