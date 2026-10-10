<?php

namespace App\Notifications;

use App\Models\Evaluation;
use Illuminate\Bus\Queueable;
use App\Notifications\Concerns\PushesToBrowser;
use Illuminate\Notifications\Notification;

class EvaluationNotification extends Notification
{
    use PushesToBrowser, Queueable;

    public function __construct(public Evaluation $evaluation, public string $message, public string $action) {}

    public function via(object $notifiable): array
    {
        return $this->withPush(['database']);
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

    protected function pushContent(object $notifiable): array
    {
        return ['title' => 'Đánh giá thi đua '.$this->evaluation->period->label(), 'body' => $this->message, 'url' => '/evaluations/'.$this->evaluation->id, 'tag' => 'evaluation-'.$this->evaluation->id];
    }
}
