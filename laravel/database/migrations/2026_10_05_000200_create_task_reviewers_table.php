<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_reviewers', function (Blueprint $table) {
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['task_id', 'user_id']);
        });

        DB::table('tasks')->whereNotNull('reviewer_id')->orderBy('id')->each(function ($task) {
            DB::table('task_reviewers')->insert(['task_id' => $task->id, 'user_id' => $task->reviewer_id, 'created_at' => now(), 'updated_at' => now()]);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewer_id');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('reviewer_id')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
        });

        DB::table('task_reviewers')->orderBy('task_id')->each(function ($row) {
            DB::table('tasks')->where('id', $row->task_id)->whereNull('reviewer_id')->update(['reviewer_id' => $row->user_id]);
        });

        Schema::dropIfExists('task_reviewers');
    }
};
