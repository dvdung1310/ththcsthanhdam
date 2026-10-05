<?php

namespace App\Services;

use App\Models\LibraryNode;
use App\Models\LibraryShare;
use App\Models\User;
use Illuminate\Support\Collection;

class LibraryAccess
{
    public const NONE = 0;
    public const READ = 1;
    public const UPLOAD = 2;
    public const EDIT = 3;
    public const MANAGE = 4;

    private ?Collection $tree = null;
    private ?Collection $grants = null;
    private ?Collection $ownerMap = null;

    public function __construct(private User $user) {}

    public function manages(): bool
    {
        return $this->user->hasPermission('library.manage');
    }

    public function canWriteRoot(): bool
    {
        return $this->manages() || $this->user->hasPermission('library.upload');
    }

    public function level(LibraryNode|int|null $node): int
    {
        if ($node === null) {
            return $this->canWriteRoot() ? self::UPLOAD : self::READ;
        }
        if ($this->manages()) {
            return self::MANAGE;
        }
        $id = $node instanceof LibraryNode ? $node->id : $node;
        $best = self::NONE;
        foreach ($this->chain($id) as $nodeId) {
            $best = max($best, $this->directLevel($nodeId));
        }

        return $best;
    }

    public function can(LibraryNode|int|null $node, int $required): bool
    {
        return $this->level($node) >= $required;
    }

    public function isOwner(LibraryNode $node): bool
    {
        return $node->owner_id === $this->user->id;
    }

    public function canDelete(LibraryNode $node): bool
    {
        return ! $node->is_system && ($this->manages() || $this->isOwner($node));
    }

    public function accessibleRootIds(): array
    {
        $direct = $this->tree()->keys()->filter(fn ($id) => $this->directLevel($id) > self::NONE);

        return $direct->filter(function ($id) use ($direct) {
            $parent = $this->tree()->get($id);
            while ($parent) {
                if ($direct->contains($parent)) {
                    return false;
                }
                $parent = $this->tree()->get($parent);
            }

            return true;
        })->values()->all();
    }

    public function accessibleIds(): ?array
    {
        if ($this->manages()) {
            return null;
        }
        $roots = $this->accessibleRootIds();

        return $this->tree()->keys()->filter(fn ($id) => array_intersect($this->chain($id), $roots) !== [])->values()->all();
    }

    public function chain(int $id): array
    {
        $ids = [];
        while ($id && ! in_array($id, $ids, true)) {
            $ids[] = $id;
            $id = $this->tree()->get($id);
        }

        return $ids;
    }

    public function isDescendantOrSelf(int $candidate, int $ancestor): bool
    {
        return in_array($ancestor, $this->chain($candidate), true);
    }

    private function directLevel(int $nodeId): int
    {
        $grant = $this->grants()->get($nodeId, self::NONE);
        $owner = $this->owners()->get($nodeId) === $this->user->id ? self::EDIT : self::NONE;

        return max($grant, $owner);
    }

    private function tree(): Collection
    {
        return $this->tree ??= LibraryNode::query()->pluck('parent_id', 'id');
    }

    private function owners(): Collection
    {
        return $this->ownerMap ??= LibraryNode::query()->pluck('owner_id', 'id');
    }

    private function grants(): Collection
    {
        if ($this->grants) {
            return $this->grants;
        }
        $units = $this->user->memberUnitIds();

        return $this->grants = LibraryShare::query()
            ->where(fn ($q) => $q->where('user_id', $this->user->id)
                ->orWhereIn('department_id', $units ?: [0])
                ->orWhere(fn ($b) => $b->whereNull('user_id')->whereNull('department_id')))
            ->get(['node_id', 'access'])
            ->groupBy('node_id')
            ->map(fn ($rows) => $rows->max(fn ($row) => LibraryShare::LEVELS[$row->access] ?? self::NONE));
    }
}
