<?php
namespace App\Notifications;
use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
class TaskAssignedNotification extends Notification{
 use Queueable;
 public function __construct(public Task $task){}
 public function via(object $notifiable):array{return ['database'];}
 public function toMail(object $notifiable):MailMessage{return (new MailMessage)->subject('[THCS Thanh Đạm] Công việc mới: '.$this->task->title)->greeting('Xin chào '.$notifiable->name.',')->line('Bạn vừa được giao một công việc mới trên hệ thống.')->line('Mã công việc: '.$this->task->code)->line('Nội dung: '.$this->task->title)->line('Mức ưu tiên: '.$this->task->priority)->line('Hạn hoàn thành: '.$this->task->due_at?->format('d/m/Y H:i'))->action('Mở hệ thống quản lý',config('app.url'))->line('Vui lòng kiểm tra yêu cầu và cập nhật tiến độ đúng hạn.');}
 public function toArray(object $notifiable):array{return ['task_id'=>$this->task->id,'code'=>$this->task->code,'title'=>$this->task->title,'priority'=>$this->task->priority,'due_at'=>$this->task->due_at?->toIso8601String(),'message'=>'Bạn vừa được giao công việc mới: '.$this->task->title];}
}
