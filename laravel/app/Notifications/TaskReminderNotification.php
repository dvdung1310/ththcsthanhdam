<?php

namespace App\Notifications;

use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use App\Notifications\Concerns\PushesToBrowser;
use Illuminate\Notifications\Notification;

class TaskReminderNotification extends Notification implements ShouldQueue
{
    use PushesToBrowser, Queueable;

    public function __construct(public Task $task) {}

    public function via(object $notifiable): array
    {
        return $this->withPush(['mail']);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('[THCS Thanh Đạm] Nhắc thực hiện công việc: '.$this->task->title)
            ->greeting('Xin chào '.$notifiable->name.',')
            ->line('Bạn có một công việc chưa thực hiện trên hệ thống.')
            ->line('Mã công việc: '.$this->task->code)
            ->line('Nội dung: '.$this->task->title)
            ->line('Hạn hoàn thành: '.($this->task->due_at?->format('d/m/Y H:i') ?? 'Không thời hạn'))
            ->action('Mở hệ thống quản lý', config('app.url'))
            ->line('Vui lòng kiểm tra và bắt đầu thực hiện công việc đúng hạn.');
    }

    protected function pushContent(object $notifiable): array
    {
        return ['title' => 'Nhắc thực hiện: '.$this->task->code, 'body' => $this->task->title, 'url' => '/tasks/'.$this->task->code, 'tag' => 'task-'.$this->task->id];
    }
}
