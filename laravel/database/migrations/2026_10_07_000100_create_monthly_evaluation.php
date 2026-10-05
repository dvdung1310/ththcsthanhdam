<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $legacy = [
            'teacher_rankings', 'reward_nominations', 'classification_rules', 'teacher_kpi_criterion_scores',
            'kpi_adjustments', 'teacher_kpi_results', 'kpi_framework_criteria', 'kpi_framework_scopes',
            'kpi_frameworks', 'kpi_criteria', 'approval_steps', 'evaluation_periods',
        ];
        foreach ($legacy as $table) {
            Schema::dropIfExists($table);
        }

        Schema::create('evaluation_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('school_year', 20);
            $table->boolean('is_active')->default(false);
            $table->json('grades');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('evaluation_criteria', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->constrained('evaluation_templates')->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('evaluation_criteria')->cascadeOnDelete();
            $table->string('code', 10);
            $table->string('title');
            $table->longText('guidance')->nullable();
            $table->decimal('max_score', 6, 2);
            $table->string('kind', 10)->default('score');
            $table->boolean('homeroom_only')->default(false);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
            $table->index(['template_id', 'parent_id', 'position']);
        });

        Schema::create('evaluation_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->constrained('evaluation_templates')->restrictOnDelete();
            $table->unsignedSmallInteger('year');
            $table->unsignedTinyInteger('month');
            $table->string('status', 20)->default('open');
            $table->date('self_due_on')->nullable();
            $table->date('unit_due_on')->nullable();
            $table->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('disclosed_at')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->unique(['year', 'month']);
        });

        Schema::create('evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('period_id')->constrained('evaluation_periods')->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_homeroom')->default(false);
            $table->longText('duties')->nullable();
            $table->longText('results')->nullable();
            $table->string('status', 20)->default('draft');
            $table->decimal('total_score', 6, 2)->nullable();
            $table->string('grade', 20)->nullable();
            $table->boolean('has_violation')->default(false);
            $table->string('no_grade_reason')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('unit_scored_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('unit_scored_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->unique(['period_id', 'teacher_id']);
            $table->index(['period_id', 'status']);
        });

        Schema::create('evaluation_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('evaluation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('criterion_id')->constrained('evaluation_criteria')->cascadeOnDelete();
            $table->decimal('self_score', 6, 2)->nullable();
            $table->decimal('unit_score', 6, 2)->nullable();
            $table->decimal('final_score', 6, 2)->nullable();
            $table->text('self_note')->nullable();
            $table->text('unit_note')->nullable();
            $table->timestamps();
            $table->unique(['evaluation_id', 'criterion_id']);
        });

        Schema::create('evaluation_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('evaluation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('content');
            $table->timestamps();
            $table->index(['evaluation_id', 'id']);
        });
    }

    public function down(): void
    {
        foreach (['evaluation_comments', 'evaluation_scores', 'evaluations', 'evaluation_periods', 'evaluation_criteria', 'evaluation_templates'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
