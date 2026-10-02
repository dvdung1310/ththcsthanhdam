<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class OfficialDocument extends Model
{
    use SoftDeletes;

    protected $fillable = ['document_type_id', 'file_id', 'folder_id', 'created_by', 'document_number', 'title', 'issuer', 'issued_on', 'effective_on', 'direction', 'status', 'summary', 'link'];

    protected function casts(): array
    {
        return ['issued_on' => 'date', 'effective_on' => 'date'];
    }

    public function type() { return $this->belongsTo(DocumentType::class, 'document_type_id'); }
    public function file() { return $this->belongsTo(StoredFile::class, 'file_id'); }
    public function folder() { return $this->belongsTo(DocumentFolder::class, 'folder_id'); }
    public function tasks() { return $this->belongsToMany(Task::class, 'document_task'); }
}
