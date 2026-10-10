<?php

namespace App\Services;

use App\Models\LibraryNode;
use App\Models\LibraryShare;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class LibraryAccess
{
    public const NONE = 0;
    public const READ = 1;
    public const UPLOAD = 2;
    public const EDIT = 3;
    public const MANAGE = 4;

    private ?array $folders = null;
    private ?Collection $grants = null;
    private array $nodes = [];
    private array $folderLevels = [];
    private ?array $readableFolders = null;
    private ?array $rootIds = null;

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
        if (isset($this->folders()[$id])) {
            return $this->folderLevel($id);
        }
        $row = $node instanceof LibraryNode ? ['parent_id' => $node->parent_id, 'owner_id' => $node->owner_id] : $this->node($id);
        if (! $row) {
            return self::NONE;
        }

        return max($this->directLevel($id, $row['owner_id']), $row['parent_id'] ? $this->folderLevel($row['parent_id']) : self::NONE);
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
        if ($this->rootIds !== null) {
            return $this->rootIds;
        }
        $folders = $this->folders();
        $direct = [];
        foreach ($folders as $id => $folder) {
            if ($this->directLevel($id, $folder['owner_id']) > self::NONE) {
                $direct[$id] = true;
            }
        }
        $underDirect = function (?int $parent) use ($folders, $direct) {
            for ($seen = []; $parent && ! isset($seen[$parent]); $parent = $folders[$parent]['parent_id'] ?? null) {
                if (isset($direct[$parent])) {
                    return true;
                }
                $seen[$parent] = true;
            }

            return false;
        };
        $roots = array_keys(array_filter($direct, fn ($_, $id) => ! $underDirect($folders[$id]['parent_id']), ARRAY_FILTER_USE_BOTH));
        $files = LibraryNode::where('type', LibraryNode::FILE)
            ->where(fn ($q) => $q->where('owner_id', $this->user->id)->orWhereIn('id', $this->grants()->keys()->all() ?: [0]))
            ->get(['id', 'parent_id']);
        foreach ($files as $file) {
            if (! $underDirect($file->parent_id)) {
                $roots[] = $file->id;
            }
        }

        return $this->rootIds = $roots;
    }

    public function readableFolderIds(): ?array
    {
        if ($this->manages()) {
            return null;
        }
        if ($this->readableFolders !== null) {
            return $this->readableFolders;
        }
        $children = [];
        foreach ($this->folders() as $id => $folder) {
            $children[$folder['parent_id'] ?? 0][] = $id;
        }
        $result = [];
        $queue = array_values(array_filter($this->accessibleRootIds(), fn ($id) => isset($this->folders()[$id])));
        while ($queue) {
            $id = array_pop($queue);
            if (isset($result[$id])) {
                continue;
            }
            $result[$id] = true;
            foreach ($children[$id] ?? [] as $child) {
                $queue[] = $child;
            }
        }

        return $this->readableFolders = array_keys($result);
    }

    public function scopeReadable(Builder $query): Builder
    {
        $folders = $this->readableFolderIds();
        if ($folders === null) {
            return $query;
        }
        $files = array_values(array_filter($this->accessibleRootIds(), fn ($id) => ! isset($this->folders()[$id])));

        return $query->where(fn ($q) => $q->whereIn('library_nodes.id', $folders ?: [0])
            ->orWhereIn('library_nodes.parent_id', $folders ?: [0])
            ->orWhereIn('library_nodes.id', $files ?: [0]));
    }

    public function chain(int $id): array
    {
        $ids = [];
        if (! isset($this->folders()[$id])) {
            $row = $this->node($id);
            if (! $row) {
                return [];
            }
            $ids[] = $id;
            $id = $row['parent_id'];
        }
        while ($id && isset($this->folders()[$id]) && ! in_array($id, $ids, true)) {
            $ids[] = $id;
            $id = $this->folders()[$id]['parent_id'];
        }

        return $ids;
    }

    public function folderName(int $id): ?string
    {
        return $this->folders()[$id]['name'] ?? null;
    }

    public function isDescendantOrSelf(int $candidate, int $ancestor): bool
    {
        return in_array($ancestor, $this->chain($candidate), true);
    }

    private function folderLevel(int $id): int
    {
        if (isset($this->folderLevels[$id])) {
            return $this->folderLevels[$id];
        }
        $folder = $this->folders()[$id] ?? null;
        if (! $folder) {
            return self::NONE;
        }
        $this->folderLevels[$id] = self::NONE;

        return $this->folderLevels[$id] = max($this->directLevel($id, $folder['owner_id']), $folder['parent_id'] ? $this->folderLevel($folder['parent_id']) : self::NONE);
    }

    private function directLevel(int $nodeId, ?int $ownerId): int
    {
        return max($this->grants()->get($nodeId, self::NONE), $ownerId === $this->user->id ? self::EDIT : self::NONE);
    }

    private function folders(): array
    {
        return $this->folders ??= LibraryNode::where('type', LibraryNode::FOLDER)->get(['id', 'parent_id', 'owner_id', 'name'])
            ->mapWithKeys(fn (LibraryNode $f) => [$f->id => ['parent_id' => $f->parent_id, 'owner_id' => $f->owner_id, 'name' => $f->name]])->all();
    }

    private function node(int $id): ?array
    {
        if (! array_key_exists($id, $this->nodes)) {
            $row = LibraryNode::whereKey($id)->first(['id', 'parent_id', 'owner_id']);
            $this->nodes[$id] = $row ? ['parent_id' => $row->parent_id, 'owner_id' => $row->owner_id] : null;
        }

        return $this->nodes[$id];
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
