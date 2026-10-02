<?php
namespace App\Events;
use App\Models\Task;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
class TaskWorkflowRealtime implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;
    public function __construct(public Task $task, public int $userId, public string $message, public string $action) {}
    public function broadcastOn(): array { return [new PrivateChannel('users.'.$this->userId)]; }
    public function broadcastAs(): string { return 'task.workflow'; }
    public function broadcastWith(): array { return ['id'=>$this->task->id,'code'=>$this->task->code,'title'=>$this->task->title,'message'=>$this->message,'action'=>$this->action,'created_at'=>now()->toIso8601String()]; }
}
