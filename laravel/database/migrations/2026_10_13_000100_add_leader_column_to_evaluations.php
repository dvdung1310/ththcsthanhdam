<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('evaluation_scores', function (Blueprint $table) {
            $table->decimal('leader_score', 6, 2)->nullable()->after('unit_note');
            $table->text('leader_note')->nullable()->after('leader_score');
        });
        Schema::table('evaluations', function (Blueprint $table) {
            $table->foreignId('leader_scored_by')->nullable()->after('unit_scored_at')->constrained('users')->nullOnDelete();
            $table->timestamp('leader_scored_at')->nullable()->after('leader_scored_by');
        });
        Schema::table('evaluation_scorers', function (Blueprint $table) {
            $table->string('column', 10)->default('unit')->after('user_id');
            $table->unique(['evaluation_id', 'user_id', 'column']);
        });
        Schema::table('evaluation_scorers', function (Blueprint $table) {
            $table->dropUnique(['evaluation_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::table('evaluation_scorers', function (Blueprint $table) {
            $table->unique(['evaluation_id', 'user_id']);
        });
        Schema::table('evaluation_scorers', function (Blueprint $table) {
            $table->dropUnique(['evaluation_id', 'user_id', 'column']);
            $table->dropColumn('column');
        });
        Schema::table('evaluations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('leader_scored_by');
            $table->dropColumn('leader_scored_at');
        });
        Schema::table('evaluation_scores', function (Blueprint $table) {
            $table->dropColumn(['leader_score', 'leader_note']);
        });
    }
};
