<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use App\Notifications\Concerns\PushesToBrowser;
use Illuminate\Notifications\Notification;

class EvaluationPeriodNotification extends Notification
{
    use PushesToBrowser, Queueable;

    public function __construct(public string $periodLabel, public string $message, public string $action) {}

    public function via(object $notifiable): array
    {
        return $this->withPush(['database']);
    }

    public function toArray(object $notifiable): array
    {
        return ['title' => 'Đánh giá thi đua '.$this->periodLabel, 'message' => $this->message, 'action' => $this->action, 'link' => '/evaluations'];
    }

    protected function pushContent(object $notifiable): array
    {
        return ['title' => 'Đánh giá thi đua '.$this->periodLabel, 'body' => $this->message, 'url' => '/evaluations', 'tag' => 'evaluation-period-'.$this->action];
    }
}
