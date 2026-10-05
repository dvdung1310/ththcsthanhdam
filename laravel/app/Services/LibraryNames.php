<?php

namespace App\Services;

use App\Models\LibraryNode;

class LibraryNames
{
    public static function existing(?int $parentId, string $name, ?int $ignoreId = null): ?LibraryNode
    {
        return LibraryNode::where('parent_id', $parentId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($name))])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->first();
    }

    public static function available(?int $parentId, string $name, bool $isFile, ?int $ignoreId = null): string
    {
        [$base, $ext] = self::split($name, $isFile);
        $candidate = trim($name);
        $index = 2;
        while (self::existing($parentId, $candidate, $ignoreId)) {
            $candidate = $base.' ('.$index++.')'.$ext;
        }

        return $candidate;
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
