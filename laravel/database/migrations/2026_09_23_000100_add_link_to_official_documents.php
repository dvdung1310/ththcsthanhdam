<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('official_documents', function (Blueprint $table) {
            $table->string('link', 2048)->nullable()->after('summary');
        });
    }

    public function down(): void
    {
        Schema::table('official_documents', function (Blueprint $table) {
            $table->dropColumn('link');
        });
    }
};
