<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EvaluationComment extends Model
{
    protected $fillable = ['evaluation_id', 'user_id', 'content'];

    public function evaluation() { return $this->belongsTo(Evaluation::class); }
    public function user() { return $this->belongsTo(User::class); }
}
