<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_draft_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('source_node_id')->nullable()->constrained('library_nodes')->nullOnDelete();
            $table->foreignId('source_file_id')->nullable()->constrained('files')->nullOnDelete();
            $table->string('document_name');
            $table->json('analysis')->nullable();
            $table->timestamps();
        });

        Schema::create('task_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('task_draft_batches')->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->default(0);
            $table->json('payload');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_drafts');
        Schema::dropIfExists('task_draft_batches');
    }
};
