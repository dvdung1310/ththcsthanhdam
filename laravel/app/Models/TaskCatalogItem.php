<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class TaskCatalogItem extends Model
{
    protected $fillable = ['scope', 'name', 'product_type', 'task_group_id', 'score', 'conversion_factor', 'publication_status', 'department_id', 'user_id'];
    protected $casts = ['score' => 'float', 'conversion_factor' => 'float'];
    public function group() { return $this->belongsTo(TaskGroup::class, 'task_group_id'); }
    public function department() { return $this->belongsTo(Department::class); }
    public function user() { return $this->belongsTo(User::class); }
    public function users() { return $this->belongsToMany(User::class, 'task_catalog_item_user')->withTimestamps(); }
}
