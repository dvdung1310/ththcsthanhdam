<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentFolder extends Model
{
    protected $fillable = ['parent_id', 'created_by', 'name'];

    public function parent() { return $this->belongsTo(self::class, 'parent_id'); }
    public function children() { return $this->hasMany(self::class, 'parent_id'); }
    public function documents() { return $this->hasMany(OfficialDocument::class, 'folder_id'); }
}
