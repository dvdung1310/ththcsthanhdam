<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class TaskGroup extends Model
{
    protected $fillable = ['code', 'name', 'task_nature', 'product_characteristics', 'maximum_score'];
    protected $casts = ['maximum_score' => 'float'];
    public function catalogItems() { return $this->hasMany(TaskCatalogItem::class); }
}
