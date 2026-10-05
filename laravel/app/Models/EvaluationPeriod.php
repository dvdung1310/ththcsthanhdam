<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EvaluationPeriod extends Model
{
    public const OPEN = 'open';
    public const DISCLOSED = 'disclosed';
    public const PUBLISHED = 'published';

    protected $fillable = ['template_id', 'year', 'month', 'status', 'self_due_on', 'unit_due_on', 'opened_by', 'disclosed_at', 'published_at'];

    protected function casts(): array
    {
        return ['self_due_on' => 'date', 'unit_due_on' => 'date', 'disclosed_at' => 'datetime', 'published_at' => 'datetime'];
    }

    public function template() { return $this->belongsTo(EvaluationTemplate::class, 'template_id'); }
    public function evaluations() { return $this->hasMany(Evaluation::class, 'period_id'); }
    public function opener() { return $this->belongsTo(User::class, 'opened_by'); }

    public function label(): string
    {
        return 'Tháng '.$this->month.'/'.$this->year;
    }

    public function isLocked(): bool
    {
        return $this->status === self::PUBLISHED;
    }
}
