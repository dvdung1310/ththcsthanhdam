<?php
namespace App\Events;
use App\Models\Task;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
class TaskAssignedRealtime implements ShouldBroadcastNow{
 use Dispatchable,InteractsWithSockets,SerializesModels;
 public function __construct(public Task $task,public int $userId){}
 public function broadcastOn():array{return [new PrivateChannel('users.'.$this->userId)];}
 public function broadcastAs():string{return 'task.assigned';}
 public function broadcastWith():array{return ['id'=>$this->task->id,'code'=>$this->task->code,'title'=>$this->task->title,'priority'=>$this->task->priority,'due_at'=>$this->task->due_at?->toIso8601String(),'message'=>'Bạn vừa được giao công việc mới: '.$this->task->title,'created_at'=>now()->toIso8601String()];}
}
