<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('task_evaluations', function (Blueprint $table) {
            $table->decimal('progress_score', 8, 2)->default(0)->after('evaluator_level');
            $table->decimal('evidence_score', 8, 2)->default(0)->after('progress_score');
            $table->decimal('quality_score', 8, 2)->default(0)->after('evidence_score');
            $table->decimal('late_penalty', 8, 2)->default(0)->after('quality_score');
        });

        Schema::create('monthly_kpi_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('year');
            $table->unsignedTinyInteger('month');
            $table->decimal('general_score', 5, 2)->default(0);
            $table->text('general_notes')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['teacher_id', 'year', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monthly_kpi_scores');
        Schema::table('task_evaluations', function (Blueprint $table) {
            $table->dropColumn(['progress_score', 'evidence_score', 'quality_score', 'late_penalty']);
        });
    }
};
