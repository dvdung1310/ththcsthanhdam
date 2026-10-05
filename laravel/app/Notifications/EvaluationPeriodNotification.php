<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EvaluationPeriodNotification extends Notification
{
    use Queueable;

    public function __construct(public string $periodLabel, public string $message, public string $action) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return ['title' => 'Đánh giá thi đua '.$this->periodLabel, 'message' => $this->message, 'action' => $this->action, 'link' => '/evaluations'];
    }
}
