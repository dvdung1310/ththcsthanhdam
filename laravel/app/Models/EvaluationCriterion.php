<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EvaluationCriterion extends Model
{
    public const SCORE = 'score';
    public const BONUS = 'bonus';

    protected $fillable = ['template_id', 'parent_id', 'code', 'title', 'guidance', 'max_score', 'kind', 'homeroom_only', 'position'];

    protected function casts(): array
    {
        return ['max_score' => 'decimal:2', 'homeroom_only' => 'boolean'];
    }

    public function template() { return $this->belongsTo(EvaluationTemplate::class, 'template_id'); }
    public function parent() { return $this->belongsTo(self::class, 'parent_id'); }
    public function children() { return $this->hasMany(self::class, 'parent_id')->orderBy('position'); }

    public function isSection(): bool
    {
        return $this->parent_id === null;
    }
}
