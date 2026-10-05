<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('evaluation_templates', function (Blueprint $table) {
            $table->renameColumn('school_year', 'description');
        });
        Schema::table('evaluation_templates', function (Blueprint $table) {
            $table->text('description')->nullable()->change();
            $table->unique('name');
        });
        Schema::table('evaluation_criteria', function (Blueprint $table) {
            $table->boolean('requires_evidence')->default(false)->after('homeroom_only');
        });
        DB::table('evaluation_criteria')->whereNotNull('parent_id')->where('kind', 'bonus')->update(['requires_evidence' => true]);
    }

    public function down(): void
    {
        Schema::table('evaluation_criteria', function (Blueprint $table) {
            $table->dropColumn('requires_evidence');
        });
        Schema::table('evaluation_templates', function (Blueprint $table) {
            $table->dropUnique(['name']);
        });
        Schema::table('evaluation_templates', function (Blueprint $table) {
            $table->renameColumn('description', 'school_year');
        });
    }
};
