<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiMessage extends Model
{
    public const USER = 'user';
    public const ASSISTANT = 'assistant';

    protected $fillable = ['ai_conversation_id', 'role', 'content'];

    public function conversation() { return $this->belongsTo(AiConversation::class, 'ai_conversation_id'); }
}
