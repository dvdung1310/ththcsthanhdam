<?php

namespace App\Notifications;

use App\Models\Evaluation;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EvaluationNotification extends Notification
{
    use Queueable;

    public function __construct(public Evaluation $evaluation, public string $message, public string $action) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $period = $this->evaluation->period;

        return [
            'evaluation_id' => $this->evaluation->id,
            'title' => 'Đánh giá thi đua '.$period->label(),
            'message' => $this->message,
            'action' => $this->action,
            'link' => '/evaluations/'.$this->evaluation->id,
        ];
    }
}
