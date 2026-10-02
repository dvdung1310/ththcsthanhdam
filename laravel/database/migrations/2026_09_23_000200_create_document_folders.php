<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_folders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('document_folders')->nullOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->string('name');
            $table->timestamps();
            $table->unique(['parent_id', 'name']);
        });
        Schema::table('official_documents', function (Blueprint $table) {
            $table->foreignId('folder_id')->nullable()->after('file_id')->constrained('document_folders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('official_documents', fn (Blueprint $table) => $table->dropConstrainedForeignId('folder_id'));
        Schema::dropIfExists('document_folders');
    }
};
