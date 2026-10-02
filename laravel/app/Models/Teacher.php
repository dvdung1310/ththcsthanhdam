<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Teacher extends Model
{
    use SoftDeletes;

    protected $fillable = ['user_id', 'employee_code', 'employment_status'];

    public function user() { return $this->belongsTo(User::class); }
    public function departments() { return $this->belongsToMany(Department::class, 'teacher_department')->withPivot(['is_primary', 'starts_on', 'ends_on'])->withTimestamps(); }
    public function subjects() { return $this->belongsToMany(Subject::class, 'teacher_subject')->withPivot(['is_primary', 'starts_on', 'ends_on'])->withTimestamps(); }
    public function positions() { return $this->belongsToMany(Position::class, 'teacher_position')->withPivot(['department_id', 'starts_on', 'ends_on'])->withTimestamps(); }
}
