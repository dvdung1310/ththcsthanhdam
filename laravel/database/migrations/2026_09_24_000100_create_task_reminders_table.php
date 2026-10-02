<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sent_by')->constrained('users')->restrictOnDelete();
            $table->string('email');
            $table->timestamp('sent_at');
            $table->timestamps();
            $table->index(['task_id', 'teacher_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_reminders');
    }
};
