<?php

namespace App\Services;

use App\Models\LibraryNode;

class LibraryNames
{
    public static function existing(?int $parentId, string $name, ?int $ignoreId = null): ?LibraryNode
    {
        $key = self::key($name);

        return self::siblings($parentId, $ignoreId)->first(fn (LibraryNode $node) => self::key($node->name) === $key);
    }

    public static function available(?int $parentId, string $name, bool $isFile, ?int $ignoreId = null): string
    {
        [$base, $ext] = self::split($name, $isFile);
        $taken = self::siblings($parentId, $ignoreId)->map(fn (LibraryNode $node) => self::key($node->name))->flip();
        $candidate = trim($name);
        $index = 2;
        while ($taken->has(self::key($candidate))) {
            $candidate = $base.' ('.$index++.')'.$ext;
        }

        return $candidate;
    }

    public static function key(string $name): string
    {
        $name = trim($name);

        return mb_strtolower(class_exists(\Normalizer::class) ? (\Normalizer::normalize($name) ?: $name) : $name);
    }

    private static function siblings(?int $parentId, ?int $ignoreId)
    {
        return LibraryNode::where('parent_id', $parentId)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->get();
    }

    public static function copyName(?int $parentId, string $name, bool $isFile): string
    {
        [$base, $ext] = self::split($name, $isFile);

        return self::available($parentId, $base.' - Bản sao'.$ext, $isFile);
    }

    public static function split(string $name, bool $isFile): array
    {
        $name = trim($name);
        $dot = $isFile ? strrpos($name, '.') : false;
        if ($dot === false || $dot === 0) {
            return [$name, ''];
        }

        return [substr($name, 0, $dot), substr($name, $dot)];
    }
}
