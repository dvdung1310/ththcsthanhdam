<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('evaluation_scores')->whereNotNull('final_score')->update(['unit_score' => DB::raw('final_score')]);

        Schema::table('evaluation_scores', function (Blueprint $table) {
            $table->dropColumn('final_score');
        });
    }

    public function down(): void
    {
        Schema::table('evaluation_scores', function (Blueprint $table) {
            $table->decimal('final_score', 6, 2)->nullable()->after('unit_score');
        });
    }
};
