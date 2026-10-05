<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('library_nodes', function (Blueprint $table) {
            $table->foreignId('updated_by')->nullable()->after('owner_id')->constrained('users')->nullOnDelete();
        });
        DB::table('library_nodes')->update(['updated_by' => DB::raw('owner_id')]);
    }

    public function down(): void
    {
        Schema::table('library_nodes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('updated_by');
        });
    }
};
