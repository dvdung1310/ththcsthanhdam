<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class TaskCategory extends Model { protected $fillable = ['parent_id','code','name','description','is_active']; }
