<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Evaluation extends Model
{
    public const DRAFT = 'draft';
    public const SUBMITTED = 'submitted';
    public const UNIT_SCORED = 'unit_scored';
    public const PUBLISHED = 'published';

    protected $fillable = [
        'period_id', 'teacher_id', 'is_homeroom', 'duties', 'results', 'status', 'total_score', 'grade',
        'has_violation', 'no_grade_reason', 'submitted_at', 'unit_scored_by', 'unit_scored_at', 'reviewed_by', 'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'is_homeroom' => 'boolean', 'has_violation' => 'boolean', 'total_score' => 'decimal:2',
            'submitted_at' => 'datetime', 'unit_scored_at' => 'datetime', 'reviewed_at' => 'datetime',
        ];
    }

    public function period() { return $this->belongsTo(EvaluationPeriod::class, 'period_id'); }
    public function teacher() { return $this->belongsTo(Teacher::class); }
    public function scores() { return $this->hasMany(EvaluationScore::class); }
    public function comments() { return $this->hasMany(EvaluationComment::class)->orderBy('id'); }
    public function unitScorer() { return $this->belongsTo(User::class, 'unit_scored_by'); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by'); }
}
