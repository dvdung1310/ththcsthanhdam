<?php
namespace App\Notifications;
use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
class TaskWorkflowNotification extends Notification
{
    use Queueable;
    public function __construct(public Task $task, public string $message, public string $action) {}
    public function via(object $notifiable): array { return ['database']; }
    public function toArray(object $notifiable): array { return ['task_id'=>$this->task->id,'code'=>$this->task->code,'title'=>$this->task->title,'message'=>$this->message,'action'=>$this->action]; }
}
