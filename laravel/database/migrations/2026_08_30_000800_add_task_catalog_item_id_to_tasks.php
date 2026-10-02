<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::table('tasks', fn (Blueprint $table) => $table->foreignId('task_catalog_item_id')->nullable()->after('category_id')->constrained()->nullOnDelete()); }
    public function down(): void { Schema::table('tasks', fn (Blueprint $table) => $table->dropConstrainedForeignId('task_catalog_item_id')); }
};
