<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends Model
{
    use SoftDeletes;

    public const NOT_STARTED = 'not_started';
    public const IN_PROGRESS = 'in_progress';
    public const WAITING_APPROVAL = 'waiting_approval';
    public const COMPLETED = 'completed';
    public const CANCELLED = 'cancelled';

    public const OPEN = [self::NOT_STARTED, self::IN_PROGRESS, self::WAITING_APPROVAL];
    public const CLOSED = [self::COMPLETED, self::CANCELLED];

    protected $fillable = ['category_id', 'created_by', 'code', 'title', 'description', 'requirements', 'priority', 'status', 'starts_at', 'due_at', 'completed_at'];

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'due_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public function category() { return $this->belongsTo(TaskCategory::class, 'category_id'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function reviewers() { return $this->belongsToMany(User::class, 'task_reviewers')->withTimestamps(); }
    public function teachers() { return $this->belongsToMany(Teacher::class, 'task_teacher_assignees')->withPivot(['assigned_by', 'assigned_at'])->withTimestamps(); }
    public function departments() { return $this->belongsToMany(Department::class, 'task_department_assignees')->withTimestamps(); }
    public function libraryFiles() { return $this->belongsToMany(LibraryNode::class, 'task_library_files', 'task_id', 'node_id'); }
    public function updates() { return $this->hasMany(TaskUpdate::class); }
    public function submissions() { return $this->hasMany(TaskSubmission::class); }

    public function resolveRouteBinding($value, $field = null)
    {
        if ($field || ctype_digit((string) $value)) {
            return parent::resolveRouteBinding($value, $field);
        }

        return $this->where('code', $value)->firstOrFail();
    }
}
