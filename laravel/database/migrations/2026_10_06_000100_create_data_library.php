<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('document_task');
        Schema::dropIfExists('official_documents');
        Schema::dropIfExists('document_folders');
        Schema::dropIfExists('document_types');
        Schema::dropIfExists('resource_versions');
        Schema::dropIfExists('resource_permissions');
        Schema::dropIfExists('shared_resources');
        Schema::dropIfExists('resource_categories');

        Schema::create('library_nodes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('library_nodes')->restrictOnDelete();
            $table->string('type', 10)->index();
            $table->string('name');
            $table->foreignId('file_id')->nullable()->constrained('files')->restrictOnDelete();
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->longText('description')->nullable();
            $table->boolean('is_system')->default(false);
            $table->timestamps();
            $table->index(['parent_id', 'type', 'name']);
        });

        Schema::create('library_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('node_id')->constrained('library_nodes')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('access', 10);
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['user_id', 'node_id']);
            $table->index(['department_id', 'node_id']);
        });

        Schema::create('task_library_files', function (Blueprint $table) {
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('node_id')->constrained('library_nodes')->cascadeOnDelete();
            $table->primary(['task_id', 'node_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_library_files');
        Schema::dropIfExists('library_shares');
        Schema::dropIfExists('library_nodes');
    }
};
