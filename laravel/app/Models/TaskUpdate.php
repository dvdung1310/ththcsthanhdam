<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class TaskUpdate extends Model { protected $fillable = ['task_id','teacher_id','created_by','status','content']; }
