<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LatePenaltyRule extends Model
{
    protected $fillable = ['from_day', 'to_day', 'penalty_percent'];

    protected function casts(): array
    {
        return ['from_day' => 'integer', 'to_day' => 'integer', 'penalty_percent' => 'float'];
    }
}
