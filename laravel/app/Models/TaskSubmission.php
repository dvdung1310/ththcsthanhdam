<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class TaskSubmission extends Model { protected $fillable = ['task_id','teacher_id','version','result_content','links','status','submitted_at','reviewed_by','reviewed_at','review_comment']; protected function casts(): array { return ['links'=>'array','submitted_at'=>'datetime','reviewed_at'=>'datetime']; } public function teacher(){return $this->belongsTo(Teacher::class);} }
