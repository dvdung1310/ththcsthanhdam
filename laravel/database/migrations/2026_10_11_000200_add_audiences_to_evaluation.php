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
            $table->string('audience', 20)->default('teacher')->after('name');
            $table->index(['audience', 'is_active']);
        });
        Schema::table('evaluation_criteria', function (Blueprint $table) {
            $table->boolean('tracks_leave')->default(false)->after('requires_evidence');
        });
        Schema::table('evaluations', function (Blueprint $table) {
            $table->string('audience', 20)->default('teacher')->after('teacher_id');
            $table->foreignId('template_id')->nullable()->after('audience')->constrained('evaluation_templates')->restrictOnDelete();
        });
        Schema::create('evaluation_period_scorers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('period_id')->constrained('evaluation_periods')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['period_id', 'user_id']);
        });

        DB::table('evaluations')->update(['template_id' => DB::raw('(SELECT template_id FROM evaluation_periods WHERE evaluation_periods.id = evaluations.period_id)')]);
        DB::table('evaluation_criteria')->whereNotNull('parent_id')->where('title', 'like', 'Ngày, giờ công%')->update(['tracks_leave' => true]);
    }

    public function down(): void
    {
        Schema::dropIfExists('evaluation_period_scorers');
        Schema::table('evaluations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('template_id');
            $table->dropColumn('audience');
        });
        Schema::table('evaluation_criteria', fn (Blueprint $table) => $table->dropColumn('tracks_leave'));
        Schema::table('evaluation_templates', function (Blueprint $table) {
            $table->dropIndex(['audience', 'is_active']);
            $table->dropColumn('audience');
        });
    }
};
