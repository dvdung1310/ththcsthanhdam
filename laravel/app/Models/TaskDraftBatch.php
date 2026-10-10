<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskDraftBatch extends Model
{
    protected $fillable = ['created_by', 'document_name', 'analysis'];

    protected $casts = ['analysis' => 'array'];

    public function drafts() { return $this->hasMany(TaskDraft::class, 'batch_id')->orderBy('position')->orderBy('id'); }
    public function sources() { return $this->hasMany(TaskDraftSource::class, 'batch_id')->orderBy('position'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
