<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends Model
{
    use SoftDeletes;

    protected $fillable = ['parent_id', 'category_id', 'task_catalog_item_id', 'academic_year_id', 'semester_id', 'created_by', 'reviewer_id', 'code', 'title', 'description', 'requirements', 'priority', 'status', 'review_status', 'starts_at', 'due_at', 'completed_at', 'maximum_score', 'requires_approval'];

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'due_at' => 'datetime', 'completed_at' => 'datetime', 'requires_approval' => 'boolean'];
    }

    public function category() { return $this->belongsTo(TaskCategory::class, 'category_id'); }
    public function catalogItem() { return $this->belongsTo(TaskCatalogItem::class, 'task_catalog_item_id'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewer_id'); }
    public function teachers() { return $this->belongsToMany(Teacher::class, 'task_teacher_assignees')->withPivot(['status', 'progress_percent', 'assigned_at', 'completed_at'])->withTimestamps(); }
    public function departments() { return $this->belongsToMany(Department::class, 'task_department_assignees')->withTimestamps(); }
    public function documents() { return $this->belongsToMany(OfficialDocument::class, 'document_task'); }
    public function updates() { return $this->hasMany(TaskUpdate::class); }
    public function submissions() { return $this->hasMany(TaskSubmission::class); }
}
