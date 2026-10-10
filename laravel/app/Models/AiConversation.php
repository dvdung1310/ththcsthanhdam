<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiConversation extends Model
{
    public const TITLE_MAX = 120;

    protected $fillable = ['user_id', 'title', 'last_message_at'];

    protected function casts(): array
    {
        return ['last_message_at' => 'datetime'];
    }

    public function user() { return $this->belongsTo(User::class); }
    public function messages() { return $this->hasMany(AiMessage::class)->orderBy('id'); }
}
