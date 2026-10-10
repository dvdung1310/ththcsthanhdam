<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskDraftSource extends Model
{
    protected $fillable = ['batch_id', 'position', 'node_id', 'file_id', 'name', 'kind'];

    public function batch() { return $this->belongsTo(TaskDraftBatch::class, 'batch_id'); }
    public function node() { return $this->belongsTo(LibraryNode::class, 'node_id'); }
    public function file() { return $this->belongsTo(StoredFile::class, 'file_id'); }

    public function storedFile(): ?StoredFile
    {
        return $this->file ?? $this->node?->file;
    }
}
