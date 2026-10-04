<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('task_kpi_scores');
        Schema::dropIfExists('evaluation_score_histories');
        Schema::dropIfExists('task_evaluations');
        Schema::dropIfExists('task_dependencies');
        Schema::dropIfExists('monthly_kpi_scores');
        Schema::dropIfExists('late_penalty_rules');

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_catalog_item_id');
            $table->dropConstrainedForeignId('parent_id');
            $table->dropConstrainedForeignId('academic_year_id');
            $table->dropConstrainedForeignId('semester_id');
            $table->dropColumn(['maximum_score', 'requires_approval', 'review_status']);
        });

        Schema::dropIfExists('task_catalog_item_user');
        Schema::dropIfExists('task_catalog_items');
        Schema::dropIfExists('task_groups');

        Schema::table('task_teacher_assignees', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropColumn(['accepted_at', 'status', 'progress_percent', 'completed_at']);
        });

        Schema::table('task_updates', function (Blueprint $table) {
            $table->dropColumn('progress_percent');
        });
    }

    public function down(): void
    {
        Schema::table('task_updates', function (Blueprint $table) {
            $table->decimal('progress_percent', 5, 2)->nullable();
        });

        Schema::table('task_teacher_assignees', function (Blueprint $table) {
            $table->timestamp('accepted_at')->nullable();
            $table->string('status', 30)->default('assigned')->index();
            $table->decimal('progress_percent', 5, 2)->default(0);
            $table->timestamp('completed_at')->nullable();
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->decimal('maximum_score', 8, 2)->default(100);
            $table->boolean('requires_approval')->default(true);
            $table->string('review_status', 30)->default('not_requested');
        });
    }
};
