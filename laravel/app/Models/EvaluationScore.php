<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EvaluationScore extends Model
{
    protected $fillable = ['evaluation_id', 'criterion_id', 'self_score', 'unit_score', 'self_note', 'unit_note'];

    protected function casts(): array
    {
        return ['self_score' => 'decimal:2', 'unit_score' => 'decimal:2'];
    }

    public function evaluation() { return $this->belongsTo(Evaluation::class); }
    public function criterion() { return $this->belongsTo(EvaluationCriterion::class, 'criterion_id'); }
}
