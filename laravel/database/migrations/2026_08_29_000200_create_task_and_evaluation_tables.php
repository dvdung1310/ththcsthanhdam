<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('disk', 30)->default('local');
            $table->string('path', 1000);
            $table->string('original_name');
            $table->string('mime_type', 150)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->string('checksum', 128)->nullable()->index();
            $table->timestamps();
        });

        Schema::create('task_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('task_categories')->nullOnDelete();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('tasks')->nullOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('task_categories')->nullOnDelete();
            $table->foreignId('academic_year_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('semester_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('reviewer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('code', 40)->unique();
            $table->string('title');
            $table->longText('description')->nullable();
            $table->longText('requirements')->nullable();
            $table->string('priority', 20)->default('normal')->index();
            $table->string('status', 30)->default('not_started')->index();
            $table->timestamp('starts_at')->nullable()->index();
            $table->timestamp('due_at')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->decimal('maximum_score', 8, 2)->default(100);
            $table->boolean('requires_approval')->default(true);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['status', 'due_at']);
        });

        Schema::create('task_teacher_assignees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('assigned_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('assigned_at')->useCurrent();
            $table->timestamp('accepted_at')->nullable();
            $table->string('status', 30)->default('assigned')->index();
            $table->decimal('progress_percent', 5, 2)->default(0);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['task_id', 'teacher_id']);
        });

        Schema::create('task_department_assignees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->constrained()->cascadeOnDelete();
            $table->foreignId('assigned_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['task_id', 'department_id']);
        });

        Schema::create('task_dependencies', function (Blueprint $table) {
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('depends_on_task_id')->constrained('tasks')->cascadeOnDelete();
            $table->string('type', 30)->default('finish_to_start');
            $table->primary(['task_id', 'depends_on_task_id']);
        });

        Schema::create('task_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->decimal('progress_percent', 5, 2)->nullable();
            $table->string('status', 30)->nullable()->index();
            $table->text('content')->nullable();
            $table->timestamps();
        });

        Schema::create('task_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->longText('result_content')->nullable();
            $table->string('status', 30)->default('submitted')->index();
            $table->timestamp('submitted_at')->useCurrent();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_comment')->nullable();
            $table->timestamps();
            $table->unique(['task_id', 'teacher_id', 'version']);
        });

        Schema::create('file_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('file_id')->constrained()->cascadeOnDelete();
            $table->string('attachable_type');
            $table->unsignedBigInteger('attachable_id');
            $table->string('purpose', 30)->default('attachment');
            $table->timestamps();
            $table->index(['attachable_type', 'attachable_id']);
        });

        Schema::create('task_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->nullable()->constrained()->nullOnDelete();
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->foreignId('changed_by')->constrained('users')->restrictOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['task_id', 'created_at']);
        });

        Schema::create('task_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('evaluator_id')->constrained('users')->restrictOnDelete();
            $table->string('evaluator_level', 30)->index(); // self, leader, school_board
            $table->decimal('score', 8, 2)->nullable();
            $table->text('comment')->nullable();
            $table->string('status', 30)->default('draft')->index();
            $table->unsignedInteger('version')->default(1);
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
            $table->unique(['task_id', 'teacher_id', 'evaluator_id', 'version'], 'task_evaluation_version_unique');
        });

        Schema::create('evaluation_score_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_evaluation_id')->constrained()->cascadeOnDelete();
            $table->decimal('old_score', 8, 2)->nullable();
            $table->decimal('new_score', 8, 2)->nullable();
            $table->text('reason')->nullable();
            $table->foreignId('changed_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('approval_steps', function (Blueprint $table) {
            $table->id();
            $table->string('approvable_type');
            $table->unsignedBigInteger('approvable_id');
            $table->unsignedInteger('step_order');
            $table->foreignId('approver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('role_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 30)->default('pending')->index();
            $table->text('comment')->nullable();
            $table->timestamp('acted_at')->nullable();
            $table->timestamps();
            $table->index(['approvable_type', 'approvable_id']);
            $table->unique(['approvable_type', 'approvable_id', 'step_order'], 'approval_step_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_steps');
        Schema::dropIfExists('evaluation_score_histories');
        Schema::dropIfExists('task_evaluations');
        Schema::dropIfExists('task_status_histories');
        Schema::dropIfExists('file_attachments');
        Schema::dropIfExists('task_submissions');
        Schema::dropIfExists('task_updates');
        Schema::dropIfExists('task_dependencies');
        Schema::dropIfExists('task_department_assignees');
        Schema::dropIfExists('task_teacher_assignees');
        Schema::dropIfExists('tasks');
        Schema::dropIfExists('task_categories');
        Schema::dropIfExists('files');
    }
};
