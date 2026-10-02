<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 20)->nullable()->unique()->after('email');
            $table->string('avatar_path')->nullable()->after('password');
            $table->string('status', 20)->default('active')->index()->after('avatar_path');
            $table->timestamp('last_login_at')->nullable()->after('status');
        });

        Schema::create('academic_years', function (Blueprint $table) {
            $table->id();
            $table->string('name', 20)->unique();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->boolean('is_current')->default(false)->index();
            $table->timestamps();
        });

        Schema::create('semesters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->string('name', 50);
            $table->unsignedTinyInteger('sequence');
            $table->date('starts_on');
            $table->date('ends_on');
            $table->timestamps();
            $table->unique(['academic_year_id', 'sequence']);
        });

        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->string('type', 30)->index(); // school, board, professional_group, office, grade
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('subjects', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('positions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->unsignedInteger('level')->default(0);
            $table->boolean('is_manager')->default(false)->index();
            $table->timestamps();
        });

        Schema::create('teachers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('employee_code', 30)->unique();
            $table->date('date_of_birth')->nullable();
            $table->string('gender', 20)->nullable();
            $table->string('identity_number', 30)->nullable()->unique();
            $table->string('address')->nullable();
            $table->date('hired_on')->nullable();
            $table->string('qualification')->nullable();
            $table->string('employment_status', 30)->default('working')->index();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('teacher_department', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->timestamps();
            $table->unique(['teacher_id', 'department_id', 'starts_on'], 'teacher_department_period_unique');
        });

        Schema::create('teacher_subject', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->timestamps();
            $table->unique(['teacher_id', 'subject_id', 'starts_on'], 'teacher_subject_period_unique');
        });

        Schema::create('teacher_position', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('position_id')->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->timestamps();
            $table->unique(['teacher_id', 'position_id', 'starts_on'], 'teacher_position_period_unique');
        });

        Schema::create('teacher_work_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->string('event_type', 50)->index();
            $table->string('title');
            $table->text('description')->nullable();
            $table->date('effective_on')->index();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_system')->default(false);
            $table->timestamps();
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('name');
            $table->string('module', 50)->index();
            $table->timestamps();
        });

        Schema::create('permission_role', function (Blueprint $table) {
            $table->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->primary(['permission_id', 'role_id']);
        });

        Schema::create('role_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->unique(['role_id', 'user_id', 'department_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_user');
        Schema::dropIfExists('permission_role');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('teacher_work_histories');
        Schema::dropIfExists('teacher_position');
        Schema::dropIfExists('teacher_subject');
        Schema::dropIfExists('teacher_department');
        Schema::dropIfExists('teachers');
        Schema::dropIfExists('positions');
        Schema::dropIfExists('subjects');
        Schema::dropIfExists('departments');
        Schema::dropIfExists('semesters');
        Schema::dropIfExists('academic_years');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['phone', 'avatar_path', 'status', 'last_login_at']);
        });
    }
};
