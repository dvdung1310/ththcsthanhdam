<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EvaluationTemplate extends Model
{
    protected $fillable = ['name', 'description', 'is_active', 'grades', 'created_by', 'updated_by', 'activated_by', 'activated_at'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'grades' => 'array', 'activated_at' => 'datetime'];
    }

    public function criteria() { return $this->hasMany(EvaluationCriterion::class, 'template_id')->orderBy('position'); }
    public function sections() { return $this->criteria()->whereNull('parent_id'); }
    public function periods() { return $this->hasMany(EvaluationPeriod::class, 'template_id'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function editor() { return $this->belongsTo(User::class, 'updated_by'); }
    public function activator() { return $this->belongsTo(User::class, 'activated_by'); }
}
