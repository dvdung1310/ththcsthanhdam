<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('task_groups', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->string('task_nature')->nullable();
            $table->text('product_characteristics')->nullable();
            $table->decimal('maximum_score', 10, 2);
            $table->timestamps();
        });

        Schema::create('task_catalog_items', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 20)->index();
            $table->string('name');
            $table->string('product_type', 30);
            $table->foreignId('task_group_id')->constrained('task_groups')->restrictOnDelete();
            $table->decimal('score', 10, 2);
            $table->string('publication_status', 30)->default('draft');
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        DB::table('task_groups')->insert([
            ['code' => 'N1', 'name' => 'Nhóm nhiệm vụ N1', 'task_nature' => 'Nhiệm vụ thường xuyên', 'product_characteristics' => 'Sản phẩm theo yêu cầu chuyên môn', 'maximum_score' => 100, 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'N2', 'name' => 'Nhóm nhiệm vụ N2', 'task_nature' => 'Nhiệm vụ trọng tâm', 'product_characteristics' => 'Sản phẩm có phạm vi và mức độ phức tạp cao', 'maximum_score' => 200, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('task_catalog_items');
        Schema::dropIfExists('task_groups');
    }
};
