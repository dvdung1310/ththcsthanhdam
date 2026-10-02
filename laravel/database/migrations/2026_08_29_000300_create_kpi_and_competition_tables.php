<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('evaluation_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('semester_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('type', 20)->index(); // month, quarter, semester, year
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('status', 20)->default('draft')->index();
            $table->timestamps();
        });

        Schema::create('kpi_frameworks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->string('code', 40)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->boolean('is_active')->default(true)->index();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('kpi_criteria', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('kpi_criteria')->nullOnDelete();
            $table->string('code', 50)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('measurement_type', 30)->default('score');
            $table->string('calculation_method', 30)->default('manual');
            $table->decimal('maximum_score', 8, 2)->default(100);
            $table->text('formula')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('kpi_framework_criteria', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kpi_framework_id')->constrained()->cascadeOnDelete();
            $table->foreignId('kpi_criterion_id')->constrained()->cascadeOnDelete();
            $table->decimal('weight', 6, 2);
            $table->decimal('target_value', 12, 2)->nullable();
            $table->decimal('maximum_score', 8, 2)->default(100);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['kpi_framework_id', 'kpi_criterion_id'], 'framework_criterion_unique');
        });

        Schema::create('kpi_framework_scopes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kpi_framework_id')->constrained()->cascadeOnDelete();
            $table->foreignId('position_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->index(['position_id', 'department_id', 'subject_id']);
        });

        Schema::create('teacher_kpi_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('evaluation_period_id')->constrained()->cascadeOnDelete();
            $table->foreignId('kpi_framework_id')->constrained()->restrictOnDelete();
            $table->decimal('base_score', 10, 2)->default(0);
            $table->decimal('bonus_score', 10, 2)->default(0);
            $table->decimal('penalty_score', 10, 2)->default(0);
            $table->decimal('final_score', 10, 2)->default(0)->index();
            $table->string('classification', 30)->nullable()->index();
            $table->string('status', 20)->default('calculating')->index();
            $table->timestamp('calculated_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->unique(['teacher_id', 'evaluation_period_id', 'kpi_framework_id'], 'teacher_period_framework_unique');
        });

        Schema::create('teacher_kpi_criterion_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_kpi_result_id')->constrained()->cascadeOnDelete();
            $table->foreignId('kpi_framework_criterion_id')->constrained()->restrictOnDelete();
            $table->decimal('actual_value', 12, 2)->nullable();
            $table->decimal('raw_score', 10, 2)->default(0);
            $table->decimal('weighted_score', 10, 2)->default(0);
            $table->text('notes')->nullable();
            $table->json('calculation_details')->nullable();
            $table->timestamps();
            $table->unique(['teacher_kpi_result_id', 'kpi_framework_criterion_id'], 'teacher_criterion_score_unique');
        });

        Schema::create('task_kpi_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('kpi_criterion_id')->constrained()->restrictOnDelete();
            $table->foreignId('evaluation_period_id')->constrained()->cascadeOnDelete();
            $table->foreignId('task_evaluation_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('score', 10, 2);
            $table->decimal('weight', 6, 2)->default(100);
            $table->foreignId('scored_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['task_id', 'teacher_id', 'kpi_criterion_id', 'evaluation_period_id'], 'task_teacher_criterion_period_unique');
        });

        Schema::create('kpi_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_kpi_result_id')->constrained()->cascadeOnDelete();
            $table->string('type', 20)->index(); // bonus, penalty
            $table->decimal('score', 10, 2);
            $table->string('reason');
            $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('classification_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kpi_framework_id')->constrained()->cascadeOnDelete();
            $table->string('classification', 30);
            $table->decimal('minimum_score', 10, 2);
            $table->decimal('maximum_score', 10, 2)->nullable();
            $table->unsignedInteger('rank_order');
            $table->timestamps();
            $table->unique(['kpi_framework_id', 'classification']);
        });

        Schema::create('teacher_rankings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('evaluation_period_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('teacher_kpi_result_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('school_rank')->nullable();
            $table->unsignedInteger('department_rank')->nullable();
            $table->decimal('score', 10, 2);
            $table->string('classification', 30)->nullable();
            $table->timestamps();
            $table->unique(['evaluation_period_id', 'teacher_id']);
        });

        Schema::create('reward_nominations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('evaluation_period_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('nominated_by')->constrained('users')->restrictOnDelete();
            $table->string('reward_type');
            $table->text('reason');
            $table->string('status', 20)->default('proposed')->index();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reward_nominations');
        Schema::dropIfExists('teacher_rankings');
        Schema::dropIfExists('classification_rules');
        Schema::dropIfExists('kpi_adjustments');
        Schema::dropIfExists('task_kpi_scores');
        Schema::dropIfExists('teacher_kpi_criterion_scores');
        Schema::dropIfExists('teacher_kpi_results');
        Schema::dropIfExists('kpi_framework_scopes');
        Schema::dropIfExists('kpi_framework_criteria');
        Schema::dropIfExists('kpi_criteria');
        Schema::dropIfExists('kpi_frameworks');
        Schema::dropIfExists('evaluation_periods');
    }
};
