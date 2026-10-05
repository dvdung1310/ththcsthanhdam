<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LibraryNode extends Model
{
    public const FOLDER = 'folder';
    public const FILE = 'file';

    protected $fillable = ['parent_id', 'type', 'name', 'file_id', 'owner_id', 'description', 'is_system'];

    protected function casts(): array
    {
        return ['is_system' => 'boolean'];
    }

    public function parent() { return $this->belongsTo(self::class, 'parent_id'); }
    public function children() { return $this->hasMany(self::class, 'parent_id'); }
    public function file() { return $this->belongsTo(StoredFile::class, 'file_id'); }
    public function owner() { return $this->belongsTo(User::class, 'owner_id'); }
    public function shares() { return $this->hasMany(LibraryShare::class, 'node_id'); }
    public function tasks() { return $this->belongsToMany(Task::class, 'task_library_files', 'node_id', 'task_id'); }

    public function isFolder(): bool
    {
        return $this->type === self::FOLDER;
    }
}
