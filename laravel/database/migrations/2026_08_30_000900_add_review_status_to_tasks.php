<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('tasks', fn (Blueprint $table) => $table->string('review_status',30)->default('not_requested')->after('status')->index());
        DB::table('tasks')->where('status','waiting_approval')->update(['review_status'=>'waiting_approval','status'=>'in_progress']);
        DB::table('tasks')->where('status','completed')->update(['review_status'=>'approved']);
    }
    public function down(): void { Schema::table('tasks', fn (Blueprint $table) => $table->dropColumn('review_status')); }
};
