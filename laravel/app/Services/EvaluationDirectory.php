<?php

namespace App\Services;

use App\Models\Department;
use App\Models\Employee;
use Collator;
use Illuminate\Support\Str;

class EvaluationDirectory
{
    private ?Collator $collator = null;

    public function placement(Employee $teacher): array
    {
        $current = $teacher->departments->filter(fn ($d) => $d->pivot->ends_on === null)->sortByDesc(fn ($d) => (int) $d->pivot->is_primary)->values();
        $primary = $current->first();
        $tree = Department::tree();
        $team = $primary ? $tree->get($primary->id) : null;
        while ($team?->parent_id && $tree->has($team->parent_id)) {
            $team = $tree->get($team->parent_id);
        }

        return [
            'team' => $team ? ['id' => $team->id, 'name' => $team->name] : null,
            'group' => $primary && $primary->id !== $team?->id ? ['id' => $primary->id, 'name' => $primary->name] : null,
            'unit_ids' => Department::withAncestors($current->pluck('id')),
        ];
    }

    public function compareNames(?string $a, ?string $b): int
    {
        $this->collator ??= new Collator('vi_VN');
        $key = fn (?string $name) => [Str::afterLast(trim($name ?? ''), ' '), $name ?? ''];
        [$givenA, $fullA] = $key($a);
        [$givenB, $fullB] = $key($b);

        return $this->collator->compare($givenA, $givenB) ?: $this->collator->compare($fullA, $fullB);
    }
}
