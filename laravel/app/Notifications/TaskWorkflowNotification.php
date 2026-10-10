<?php
namespace App\Notifications;
use App\Models\Task;
use Illuminate\Bus\Queueable;
use App\Notifications\Concerns\PushesToBrowser;
use Illuminate\Notifications\Notification;
class TaskWorkflowNotification extends Notification
{
    use PushesToBrowser, Queueable;
    public function __construct(public Task $task, public string $message, public string $action) {}
    public function via(object $notifiable): array { return $this->withPush(['database']); }
    public function toArray(object $notifiable): array { return ['task_id'=>$this->task->id,'code'=>$this->task->code,'title'=>$this->task->title,'message'=>$this->message,'action'=>$this->action]; }

    protected function pushContent(object $notifiable): array
    {
        return ['title' => $this->task->code.' · '.$this->task->title, 'body' => $this->message, 'url' => '/tasks/'.$this->task->code, 'tag' => 'task-'.$this->task->id];
    }
}
