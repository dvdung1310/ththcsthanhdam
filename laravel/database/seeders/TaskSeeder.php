<?php
namespace Database\Seeders;
use App\Models\Department;
use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class TaskSeeder extends Seeder
{
 public function run():void{
  $admin=User::where('email',config('app.admin.email'))->firstOrFail();
  $categories=['Chuyên môn','Hành chính','Thi đua - KPI','Công tác chủ nhiệm','Sự kiện','Báo cáo'];
  foreach($categories as $i=>$name)TaskCategory::firstOrCreate(['name'=>$name],['code'=>'CV'.str_pad($i+1,2,'0',STR_PAD_LEFT),'is_active'=>true]);
  $rows=[
   ['CV-2608-0001','Hoàn thiện kế hoạch giảng dạy học kỳ I','Chuyên môn','high','in_progress','2026-09-05 17:00:00',65,'Nhóm toán'],
   ['CV-2608-0002','Rà soát hồ sơ chuyên môn đầu năm','Chuyên môn','urgent','waiting_approval','2026-08-31 17:00:00',100,'Tổ xã hội'],
   ['CV-2608-0003','Cập nhật thông tin học sinh trên hệ thống','Hành chính','normal','in_progress','2026-09-08 16:30:00',45,'Tổ tự nhiên'],
   ['CV-2608-0004','Chuẩn bị nội dung họp phụ huynh đầu năm','Công tác chủ nhiệm','high','not_started','2026-09-10 17:00:00',0,'Tổ xã hội'],
   ['CV-2608-0005','Xây dựng tiêu chí thi đua tháng 9','Thi đua - KPI','normal','completed','2026-08-27 17:00:00',100,'Nhóm toán'],
   ['CV-2608-0006','Báo cáo tình hình cơ sở vật chất','Báo cáo','urgent','in_progress','2026-08-30 11:00:00',70,'Tổ tự nhiên'],
   ['CV-2608-0007','Tổ chức hoạt động chào mừng năm học mới','Sự kiện','high','not_started','2026-09-04 17:00:00',10,'Tổ xã hội'],
   ['CV-2608-0008','Tổng hợp nhu cầu bồi dưỡng giáo viên','Báo cáo','low','completed','2026-08-25 17:00:00',100,'Tổ xã hội'],
  ];
  foreach($rows as [$code,$title,$category,$priority,$status,$due,$progress,$department]){
   $task=Task::firstOrCreate(['code'=>$code],['category_id'=>TaskCategory::where('name',$category)->value('id'),'created_by'=>$admin->id,'reviewer_id'=>$admin->id,'title'=>$title,'description'=>'Thực hiện '.$title.' theo kế hoạch chung của nhà trường.','requirements'=>'Hoàn thành đúng thời hạn, nộp đầy đủ kết quả và minh chứng liên quan.','priority'=>$priority,'status'=>$status,'starts_at'=>'2026-08-25 08:00:00','due_at'=>$due,'completed_at'=>$status==='completed'?$due:null,'maximum_score'=>100,'requires_approval'=>true]);
   $dept=Department::where('name',$department)->first();if($dept)DB::table('task_department_assignees')->updateOrInsert(['task_id'=>$task->id,'department_id'=>$dept->id],['assigned_by'=>$admin->id,'created_at'=>now(),'updated_at'=>now()]);
   $teachers=Teacher::inUnits($dept?[$dept->id]:[])->limit(2)->get();
   foreach($teachers as $teacher)DB::table('task_teacher_assignees')->updateOrInsert(['task_id'=>$task->id,'teacher_id'=>$teacher->id],['assigned_by'=>$admin->id,'assigned_at'=>now(),'status'=>$status,'progress_percent'=>$progress,'completed_at'=>$status==='completed'?$due:null,'created_at'=>now(),'updated_at'=>now()]);
  }
 }
}
