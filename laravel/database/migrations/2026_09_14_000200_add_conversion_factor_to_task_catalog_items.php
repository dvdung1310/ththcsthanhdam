<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_catalog_items', function (Blueprint $table) {
            $table->decimal('conversion_factor', 8, 2)->default(1)->after('score');
        });

        DB::table('task_catalog_items')->orderBy('id')->each(function ($item) {
            DB::table('task_catalog_items')->where('id', $item->id)->update([
                'conversion_factor' => round(((float) $item->score) / 10, 2),
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('task_catalog_items', function (Blueprint $table) {
            $table->dropColumn('conversion_factor');
        });
    }
};
