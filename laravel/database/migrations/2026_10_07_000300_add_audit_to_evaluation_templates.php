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
            $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->foreignId('activated_by')->nullable()->after('updated_by')->constrained('users')->nullOnDelete();
            $table->timestamp('activated_at')->nullable()->after('activated_by');
        });
        DB::table('evaluation_templates')->update(['updated_by' => DB::raw('created_by')]);
        DB::table('evaluation_templates')->where('is_active', true)->update(['activated_by' => DB::raw('created_by'), 'activated_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('evaluation_templates', function (Blueprint $table) {
            $table->dropConstrainedForeignId('activated_by');
            $table->dropConstrainedForeignId('updated_by');
            $table->dropColumn('activated_at');
        });
    }
};
