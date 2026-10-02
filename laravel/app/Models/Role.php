<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Role extends Model {
 protected $fillable=['code','name','description','is_system'];
 public function permissions(){return $this->belongsToMany(Permission::class,'permission_role');}
 public function users(){return $this->belongsToMany(User::class,'role_user')->withPivot(['department_id','expires_at'])->withTimestamps();}
}
