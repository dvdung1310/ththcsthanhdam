<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('late_penalty_rules', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('from_day');
            $table->unsignedInteger('to_day')->nullable();
            $table->decimal('penalty_percent', 5, 2);
            $table->timestamps();
        });

        DB::table('late_penalty_rules')->insert([
            ['from_day' => 1, 'to_day' => 1, 'penalty_percent' => 5, 'created_at' => now(), 'updated_at' => now()],
            ['from_day' => 2, 'to_day' => 3, 'penalty_percent' => 10, 'created_at' => now(), 'updated_at' => now()],
            ['from_day' => 4, 'to_day' => null, 'penalty_percent' => 20, 'created_at' => now(), 'updated_at' => now()],
        ]);

        Schema::table('task_evaluations', function (Blueprint $table) {
            $table->unsignedInteger('late_days')->default(0)->after('late_penalty');
            $table->decimal('late_penalty_percent', 5, 2)->default(0)->after('late_days');
            $table->decimal('score_before_penalty', 8, 2)->default(0)->after('late_penalty_percent');
        });
    }

    public function down(): void
    {
        Schema::table('task_evaluations', function (Blueprint $table) {
            $table->dropColumn(['late_days', 'late_penalty_percent', 'score_before_penalty']);
        });
        Schema::dropIfExists('late_penalty_rules');
    }
};
