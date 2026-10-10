<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_draft_sources', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('task_draft_batches')->cascadeOnDelete();
            $table->unsignedTinyInteger('position')->default(0);
            $table->foreignId('node_id')->nullable()->constrained('library_nodes')->nullOnDelete();
            $table->foreignId('file_id')->nullable()->constrained('files')->nullOnDelete();
            $table->string('name');
            $table->string('kind', 100)->nullable();
            $table->timestamps();
        });

        foreach (DB::table('task_draft_batches')->get() as $batch) {
            DB::table('task_draft_sources')->insert([
                'batch_id' => $batch->id, 'position' => 0, 'node_id' => $batch->source_node_id, 'file_id' => $batch->source_file_id,
                'name' => $batch->document_name, 'created_at' => $batch->created_at, 'updated_at' => $batch->updated_at,
            ]);
        }

        Schema::table('task_draft_batches', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_node_id');
            $table->dropConstrainedForeignId('source_file_id');
        });
    }

    public function down(): void
    {
        Schema::table('task_draft_batches', function (Blueprint $table) {
            $table->foreignId('source_node_id')->nullable()->after('created_by')->constrained('library_nodes')->nullOnDelete();
            $table->foreignId('source_file_id')->nullable()->after('source_node_id')->constrained('files')->nullOnDelete();
        });
        foreach (DB::table('task_draft_sources')->where('position', 0)->get() as $source) {
            DB::table('task_draft_batches')->where('id', $source->batch_id)->update(['source_node_id' => $source->node_id, 'source_file_id' => $source->file_id]);
        }
        Schema::dropIfExists('task_draft_sources');
    }
};
