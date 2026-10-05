<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $nodes = DB::table('library_nodes')->orderBy('id')->get(['id', 'parent_id', 'type', 'name']);
        foreach ($nodes->groupBy(fn ($n) => (string) $n->parent_id) as $siblings) {
            $taken = [];
            foreach ($siblings as $node) {
                $name = $node->name;
                if (isset($taken[mb_strtolower($name)])) {
                    $dot = $node->type === 'file' ? strrpos($name, '.') : false;
                    [$base, $ext] = $dot ? [substr($name, 0, $dot), substr($name, $dot)] : [$name, ''];
                    $index = 2;
                    do {
                        $name = $base.' ('.$index++.')'.$ext;
                    } while (isset($taken[mb_strtolower($name)]));
                    DB::table('library_nodes')->where('id', $node->id)->update(['name' => $name]);
                }
                $taken[mb_strtolower($name)] = true;
            }
        }
    }

    public function down(): void {}
};
