<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('library_shares')->where('access', 'upload')->update(['access' => 'edit', 'updated_at' => now()]);
    }

    public function down(): void
    {
    }
};
