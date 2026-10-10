<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('library_nodes', function (Blueprint $table) {
            $table->index(['parent_id', 'type', 'created_at']);
            $table->index(['parent_id', 'type', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::table('library_nodes', function (Blueprint $table) {
            $table->dropIndex(['parent_id', 'type', 'created_at']);
            $table->dropIndex(['parent_id', 'type', 'updated_at']);
        });
    }
};
