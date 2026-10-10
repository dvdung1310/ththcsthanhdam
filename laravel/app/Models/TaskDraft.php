<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskDraft extends Model
{
    protected $fillable = ['batch_id', 'position', 'payload'];

    protected $casts = ['payload' => 'array'];

    public function batch() { return $this->belongsTo(TaskDraftBatch::class, 'batch_id'); }
}
