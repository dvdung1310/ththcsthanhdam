<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_conversations', function (Blueprint $table) {
            $table->timestamp('last_message_at')->nullable()->after('context_scope');
            $table->index(['user_id', 'last_message_at']);
        });
    }

    public function down(): void
    {
        Schema::table('ai_conversations', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'last_message_at']);
            $table->dropColumn('last_message_at');
        });
    }
};
