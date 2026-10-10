<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class TaskSubmission extends Model { protected $fillable = ['task_id','employee_id','version','result_content','links','status','submitted_at','edited_at','reviewed_by','reviewed_at','review_comment']; protected function casts(): array { return ['links'=>'array','submitted_at'=>'datetime','edited_at'=>'datetime','reviewed_at'=>'datetime']; } public function employee(){return $this->belongsTo(Employee::class);} public function reviewer(){return $this->belongsTo(User::class, 'reviewed_by');} }
