<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EvaluationTemplate extends Model
{
    protected $fillable = ['name', 'school_year', 'is_active', 'grades', 'created_by'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'grades' => 'array'];
    }

    public function criteria() { return $this->hasMany(EvaluationCriterion::class, 'template_id')->orderBy('position'); }
    public function sections() { return $this->criteria()->whereNull('parent_id'); }
    public function periods() { return $this->hasMany(EvaluationPeriod::class, 'template_id'); }
}
