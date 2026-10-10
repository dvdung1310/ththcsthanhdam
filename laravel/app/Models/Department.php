<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class Department extends Model
{
    public const TYPE_TO = 'to';
    public const TYPE_NHOM = 'nhom';

    protected $fillable = ['parent_id', 'code', 'name', 'type', 'description', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    private static ?Collection $tree = null;

    protected static function booted(): void
    {
        static::saved(fn () => self::flushTree());
        static::deleted(fn () => self::flushTree());
    }

    public function parent() { return $this->belongsTo(self::class, 'parent_id'); }
    public function children() { return $this->hasMany(self::class, 'parent_id'); }
    public function employees() { return $this->belongsToMany(Employee::class, 'department_employee')->withPivot(['is_primary', 'starts_on', 'ends_on'])->withTimestamps(); }

    public static function flushTree(): void
    {
        self::$tree = null;
    }

    public static function tree(): Collection
    {
        return self::$tree ??= self::query()->get(['id', 'parent_id', 'name', 'type', 'is_active'])->keyBy('id');
    }

    public static function withDescendants(iterable $ids): array
    {
        $tree = self::tree();
        $result = collect($ids)->map(fn ($id) => (int) $id)->unique();
        $frontier = $result;
        while ($frontier->isNotEmpty()) {
            $children = $tree->whereIn('parent_id', $frontier->all())->pluck('id')->diff($result);
            $result = $result->merge($children);
            $frontier = $children;
        }

        return $result->values()->all();
    }

    public static function withAncestors(iterable $ids): array
    {
        $tree = self::tree();
        $result = collect();
        foreach ($ids as $id) {
            $node = $tree->get((int) $id);
            while ($node && ! $result->contains($node->id)) {
                $result->push($node->id);
                $node = $node->parent_id ? $tree->get($node->parent_id) : null;
            }
        }

        return $result->values()->all();
    }

    public static function pathLabel(int $id): string
    {
        $tree = self::tree();
        $names = [];
        $node = $tree->get($id);
        while ($node) {
            array_unshift($names, $node->name);
            $node = $node->parent_id ? $tree->get($node->parent_id) : null;
        }

        return implode(' › ', $names);
    }

    public static function ordered(?array $onlyIds = null, bool $activeOnly = true): Collection
    {
        $tree = self::tree()->when($activeOnly, fn ($t) => $t->where('is_active', true));
        $rows = collect();
        foreach ($tree->whereNull('parent_id')->sortBy('name') as $root) {
            foreach ([$root, ...$tree->where('parent_id', $root->id)->sortBy('name')->all()] as $node) {
                if ($onlyIds === null || in_array($node->id, $onlyIds, true)) {
                    $rows->push(['id' => $node->id, 'parent_id' => $node->parent_id, 'name' => $node->name, 'label' => self::pathLabel($node->id), 'type' => $node->type, 'is_active' => (bool) $node->is_active]);
                }
            }
        }

        return $rows;
    }
}
