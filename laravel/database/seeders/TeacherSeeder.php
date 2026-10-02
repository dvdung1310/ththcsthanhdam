<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Position;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TeacherSeeder extends Seeder
{
    public function run(): void
    {
        $records = [
            ['GV001','Nguyễn Thị Mai','mai.nt@thanhdam.edu.vn','0912345678','Tổ Ngữ văn','Ngữ văn','Hiệu trưởng','working',94.2],
            ['GV002','Trần Văn Nam','nam.tv@thanhdam.edu.vn','0988234567','Tổ Toán','Toán học','Tổ trưởng','working',96.5],
            ['GV003','Lê Minh Quân','quan.lm@thanhdam.edu.vn','0905111232','Tổ KHTN','Vật lý','Giáo viên','working',92.1],
            ['GV004','Phạm Thu Hà','ha.pt@thanhdam.edu.vn','0977420688','Tổ Ngoại ngữ','Tiếng Anh','Tổ trưởng','working',91.3],
            ['GV005','Hoàng Quốc Bảo','bao.hq@thanhdam.edu.vn','0934822199','Tổ Xã hội','Lịch sử','Giáo viên','on_leave',90.4],
            ['GV006','Vũ Thanh Hương','huong.vt@thanhdam.edu.vn','0966321455','Tổ KHTN','Sinh học','Giáo viên','working',88.7],
            ['GV007','Đỗ Anh Tuấn','tuan.da@thanhdam.edu.vn','0903734211','Tổ Toán','Tin học','Giáo viên','suspended',82.6],
            ['GV008','Bùi Ngọc Lan','lan.bn@thanhdam.edu.vn','0918287613','Tổ Ngữ văn','Ngữ văn','Giáo viên','working',89.8],
            ['GV009','Ngô Đức Huy','huy.nd@thanhdam.edu.vn','0982520311','Tổ Ngoại ngữ','Tiếng Anh','Giáo viên','working',87.9],
            ['GV010','Đặng Minh Anh','anh.dm@thanhdam.edu.vn','0938460722','Tổ Xã hội','Địa lý','Giáo viên','working',86.4],
            ['GV011','Phan Khánh Linh','linh.pk@thanhdam.edu.vn','0975317266','Tổ KHTN','Hóa học','Tổ phó','working',90.8],
            ['GV012','Lương Hoài An','an.lh@thanhdam.edu.vn','0908215778','Tổ Toán','Toán học','Giáo viên','on_leave',84.5],
        ];

        DB::transaction(function () use ($records) {
            $admin = User::firstOrCreate(['email' => 'admin@thanhdam.edu.vn'], ['name' => 'Quản trị hệ thống', 'phone' => '0900000000', 'password' => Hash::make('ChangeMe123!'), 'status' => 'active']);
            $year = DB::table('academic_years')->where('name', '2026-2027')->first();
            if (! $year) {
                $yearId = DB::table('academic_years')->insertGetId(['name' => '2026-2027', 'starts_on' => '2026-08-01', 'ends_on' => '2027-05-31', 'is_current' => true, 'created_at' => now(), 'updated_at' => now()]);
            } else $yearId = $year->id;
            $frameworkId = DB::table('kpi_frameworks')->where('code', 'KPI-GV-2026')->value('id')
                ?? DB::table('kpi_frameworks')->insertGetId(['academic_year_id' => $yearId, 'code' => 'KPI-GV-2026', 'name' => 'KPI giáo viên 2026-2027', 'version' => 1, 'is_active' => true, 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
            $periodId = DB::table('evaluation_periods')->where('name', 'Tháng hiện tại 2026')->value('id')
                ?? DB::table('evaluation_periods')->insertGetId(['academic_year_id' => $yearId, 'name' => 'Tháng hiện tại 2026', 'type' => 'month', 'starts_on' => '2026-08-01', 'ends_on' => '2026-08-31', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);

            foreach ($records as [$code,$name,$email,$phone,$departmentName,$subjectName,$positionName,$status,$kpi]) {
                $user = User::firstOrCreate(['email' => $email], ['name' => $name, 'phone' => $phone, 'password' => Hash::make(Str::random(32)), 'status' => 'active']);
                $teacher = Teacher::withTrashed()->firstOrCreate(['employee_code' => $code], ['user_id' => $user->id, 'employment_status' => $status]);
                if ($teacher->trashed()) $teacher->restore();
                $teacher->update(['user_id' => $user->id, 'employment_status' => $status]);
                $department = Department::firstOrCreate(['name' => $departmentName], ['code' => strtoupper(Str::slug($departmentName, '_')), 'type' => 'professional_group', 'is_active' => true]);
                $subject = Subject::firstOrCreate(['name' => $subjectName], ['code' => strtoupper(Str::slug($subjectName, '_')), 'is_active' => true]);
                $positionLevel = ['Hiệu trưởng'=>1,'Hiệu phó'=>2,'Phó hiệu trưởng'=>2,'Tổ trưởng'=>3,'Tổ phó'=>4,'Giáo viên'=>6][$positionName] ?? 5;
                $position = Position::firstOrCreate(['name' => $positionName], ['code' => strtoupper(Str::slug($positionName, '_')), 'level' => $positionLevel, 'is_manager' => $positionName !== 'Giáo viên']);
                $department->update(['name' => $departmentName, 'type' => 'professional_group', 'is_active' => true]);
                $subject->update(['name' => $subjectName, 'is_active' => true]);
                $position->update(['name' => $positionName, 'level' => $positionLevel, 'is_manager' => $positionName !== 'Giáo viên']);
                DB::table('teacher_department')->updateOrInsert(['teacher_id' => $teacher->id, 'department_id' => $department->id, 'starts_on' => '2026-08-01'], ['is_primary' => true, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('teacher_subject')->updateOrInsert(['teacher_id' => $teacher->id, 'subject_id' => $subject->id, 'starts_on' => '2026-08-01'], ['is_primary' => true, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('teacher_position')->updateOrInsert(['teacher_id' => $teacher->id, 'position_id' => $position->id, 'starts_on' => '2026-08-01'], ['department_id' => $department->id, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('teacher_kpi_results')->updateOrInsert(['teacher_id' => $teacher->id, 'evaluation_period_id' => $periodId, 'kpi_framework_id' => $frameworkId], ['base_score' => $kpi, 'final_score' => $kpi, 'classification' => $kpi >= 90 ? 'Xuất sắc' : ($kpi >= 85 ? 'Tốt' : 'Đạt'), 'status' => 'approved', 'calculated_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            }
        });
    }
}
