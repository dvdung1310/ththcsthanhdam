<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('task_catalog_item_user', function (Blueprint $table) {
            $table->foreignId('task_catalog_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['task_catalog_item_id', 'user_id']);
        });

        DB::table('task_catalog_items')->whereNotNull('user_id')->orderBy('id')->each(function ($item) {
            DB::table('task_catalog_item_user')->insert([
                'task_catalog_item_id' => $item->id,
                'user_id' => $item->user_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_catalog_item_user');
    }
};
