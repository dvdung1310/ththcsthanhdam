<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LibraryShare extends Model
{
    public const READ = 'read';
    public const EDIT = 'edit';
    public const LEVELS = [self::READ => 1, self::EDIT => 3];

    protected $fillable = ['node_id', 'user_id', 'department_id', 'access', 'granted_by'];

    public function node() { return $this->belongsTo(LibraryNode::class, 'node_id'); }
    public function user() { return $this->belongsTo(User::class); }
    public function department() { return $this->belongsTo(Department::class); }
}
