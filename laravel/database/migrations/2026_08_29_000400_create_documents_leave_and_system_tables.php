<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resource_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('resource_categories')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('type', 30)->default('shared_data');
            $table->timestamps();
        });

        Schema::create('shared_resources', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->nullable()->constrained('resource_categories')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('file_id')->constrained()->restrictOnDelete();
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('resource_type', 50)->index();
            $table->string('visibility', 20)->default('restricted')->index();
            $table->unsignedInteger('version')->default(1);
            $table->json('tags')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->fullText(['title', 'description']);
        });

        Schema::create('resource_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shared_resource_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('role_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->cascadeOnDelete();
            $table->boolean('can_view')->default(true);
            $table->boolean('can_download')->default(true);
            $table->boolean('can_edit')->default(false);
            $table->boolean('can_delete')->default(false);
            $table->timestamps();
        });

        Schema::create('resource_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shared_resource_id')->constrained()->cascadeOnDelete();
            $table->foreignId('file_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->text('change_notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['shared_resource_id', 'version']);
        });

        Schema::create('document_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('official_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_type_id')->constrained()->restrictOnDelete();
            $table->foreignId('file_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->string('document_number', 100)->index();
            $table->string('title');
            $table->string('issuer');
            $table->date('issued_on')->index();
            $table->date('effective_on')->nullable();
            $table->string('direction', 20)->default('incoming')->index();
            $table->string('status', 20)->default('active')->index();
            $table->longText('summary')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['document_number', 'issuer', 'issued_on'], 'official_document_unique');
        });

        Schema::create('document_task', function (Blueprint $table) {
            $table->foreignId('official_document_id')->constrained()->cascadeOnDelete();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->string('relation_type', 30)->default('source');
            $table->primary(['official_document_id', 'task_id']);
        });

        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->string('leave_type', 30)->index();
            $table->dateTime('starts_at')->index();
            $table->dateTime('ends_at')->index();
            $table->decimal('number_of_days', 6, 2)->default(0);
            $table->unsignedInteger('number_of_periods')->default(0);
            $table->text('reason');
            $table->string('status', 30)->default('draft')->index();
            $table->foreignId('submitted_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('classes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('homeroom_teacher_id')->nullable()->constrained('teachers')->nullOnDelete();
            $table->string('code', 30);
            $table->string('name');
            $table->unsignedTinyInteger('grade_level')->index();
            $table->timestamps();
            $table->unique(['academic_year_id', 'code']);
        });

        Schema::create('teaching_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('semester_id')->constrained()->cascadeOnDelete();
            $table->foreignId('class_id')->constrained('classes')->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->restrictOnDelete();
            $table->foreignId('teacher_id')->constrained()->restrictOnDelete();
            $table->unsignedTinyInteger('day_of_week');
            $table->unsignedTinyInteger('period_number');
            $table->string('room', 50)->nullable();
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->timestamps();
            $table->index(['teacher_id', 'day_of_week', 'period_number']);
        });

        Schema::create('substitute_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('leave_request_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('teaching_schedule_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('absent_teacher_id')->constrained('teachers')->restrictOnDelete();
            $table->foreignId('substitute_teacher_id')->nullable()->constrained('teachers')->nullOnDelete();
            $table->foreignId('class_id')->constrained('classes')->restrictOnDelete();
            $table->foreignId('subject_id')->constrained()->restrictOnDelete();
            $table->date('teaching_date')->index();
            $table->unsignedTinyInteger('period_number');
            $table->string('type', 20)->default('substitute')->index(); // substitute, makeup
            $table->string('status', 30)->default('pending')->index();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('assigned_by')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->string('title')->nullable();
            $table->text('message')->nullable();
            $table->json('data');
            $table->timestamp('read_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('event_type', 100);
            $table->boolean('in_app')->default(true);
            $table->boolean('email')->default(false);
            $table->boolean('sms')->default(false);
            $table->unsignedInteger('remind_before_minutes')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'event_type']);
        });

        Schema::create('ai_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title')->nullable();
            $table->json('context_scope')->nullable();
            $table->timestamps();
        });

        Schema::create('ai_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ai_conversation_id')->constrained()->cascadeOnDelete();
            $table->string('role', 20);
            $table->longText('content');
            $table->json('referenced_records')->nullable();
            $table->unsignedInteger('prompt_tokens')->nullable();
            $table->unsignedInteger('completion_tokens')->nullable();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event', 50)->index();
            $table->string('auditable_type');
            $table->unsignedBigInteger('auditable_id');
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
            $table->index(['auditable_type', 'auditable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('ai_messages');
        Schema::dropIfExists('ai_conversations');
        Schema::dropIfExists('notification_preferences');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('substitute_assignments');
        Schema::dropIfExists('teaching_schedules');
        Schema::dropIfExists('classes');
        Schema::dropIfExists('leave_requests');
        Schema::dropIfExists('document_task');
        Schema::dropIfExists('official_documents');
        Schema::dropIfExists('document_types');
        Schema::dropIfExists('resource_versions');
        Schema::dropIfExists('resource_permissions');
        Schema::dropIfExists('shared_resources');
        Schema::dropIfExists('resource_categories');
    }
};
