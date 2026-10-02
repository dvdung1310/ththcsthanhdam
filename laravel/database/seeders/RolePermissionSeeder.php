<?php
namespace Database\Seeders;
use App\Models\Permission;use App\Models\Role;use App\Models\User;use Illuminate\Database\Seeder;use Illuminate\Support\Facades\Hash;
class RolePermissionSeeder extends Seeder{
 public function run():void{
  $permissions=[
   ['dashboard.view','Xem tổng quan','dashboard'],['teachers.view','Xem giáo viên','teachers'],['teachers.manage','Quản lý giáo viên','teachers'],
   ['tasks.view','Xem công việc','tasks'],['tasks.assign','Giao và quản lý công việc','tasks'],['tasks.update','Cập nhật tiến độ','tasks'],
   ['documents.view','Xem văn bản','documents'],['documents.manage','Quản lý văn bản','documents'],['kpi.view','Xem KPI','kpi'],['kpi.manage','Quản lý KPI','kpi'],
   ['reports.view','Xem báo cáo','reports'],['roles.manage','Quản lý phân quyền','system'],['settings.manage','Quản lý hệ thống','system']
  ];foreach($permissions as [$code,$name,$module])Permission::updateOrCreate(['code'=>$code],['name'=>$name,'module'=>$module]);
  $roles=[
   'system_admin'=>['Quản trị hệ thống',array_column($permissions,0)],
   'school_board'=>['Ban giám hiệu',array_column($permissions,0)],
   'department_leader'=>['Tổ trưởng',['dashboard.view','teachers.view','tasks.view','tasks.assign','tasks.update','documents.view','documents.manage','kpi.view','reports.view']],
   'teacher'=>['Giáo viên',['dashboard.view','tasks.view','tasks.update','documents.view','kpi.view']],
  ];
  foreach($roles as $code=>[$name,$codes]){$role=Role::updateOrCreate(['code'=>$code],['name'=>$name,'is_system'=>true]);$role->permissions()->sync(Permission::whereIn('code',$codes)->pluck('id'));}
  $admin=User::where('email','admin@thanhdam.edu.vn')->first();if($admin){$admin->update(['password'=>Hash::make('Admin@123'),'must_change_password'=>false]);$admin->roles()->syncWithoutDetaching([Role::where('code','system_admin')->value('id')=>['assigned_by'=>$admin->id]]);}
  User::whereNotNull('email')->where('email','!=','admin@thanhdam.edu.vn')->each(function(User $user)use($admin){$user->update(['password'=>Hash::make('Teacher@123'),'must_change_password'=>false]);$code=$user->email==='mai.nt@thanhdam.edu.vn'?'school_board':(in_array($user->email,['nam.tv@thanhdam.edu.vn','ha.pt@thanhdam.edu.vn'])?'department_leader':'teacher');$user->roles()->sync([Role::where('code',$code)->value('id')=>['assigned_by'=>$admin?->id]]);});
 }
}
