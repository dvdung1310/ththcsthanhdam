<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskDraftBatch extends Model
{
    protected $fillable = ['created_by', 'source_node_id', 'source_file_id', 'document_name', 'analysis'];

    protected $casts = ['analysis' => 'array'];

    public function drafts() { return $this->hasMany(TaskDraft::class, 'batch_id')->orderBy('position')->orderBy('id'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function sourceNode() { return $this->belongsTo(LibraryNode::class, 'source_node_id'); }
    public function sourceFile() { return $this->belongsTo(StoredFile::class, 'source_file_id'); }
}
