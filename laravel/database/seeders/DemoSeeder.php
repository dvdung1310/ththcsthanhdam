<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Role;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DemoSeeder extends Seeder
{
    private const PASSWORD = 'Teacher@123';

    private const UNITS = [
        'Tổ tự nhiên' => ['Nhóm toán', 'Nhóm lý', 'Nhóm hóa', 'Nhóm sinh', 'Nhóm công nghệ'],
        'Tổ xã hội' => [],
    ];

    private const TEACHERS = [
        ['GV001', 'Nguyễn Thị Mai', 'mai.nt@thanhdam.edu.vn', '0912345678', 'Tổ xã hội', 'Ngữ văn', 'working', 94.2, [[Role::HIEU_TRUONG, null]]],
        ['GV002', 'Trần Văn Nam', 'nam.tv@thanhdam.edu.vn', '0988234567', 'Nhóm toán', 'Toán học', 'working', 96.5, [[Role::TO_TRUONG, 'Tổ tự nhiên']]],
        ['GV003', 'Lê Minh Quân', 'quan.lm@thanhdam.edu.vn', '0905111232', 'Nhóm lý', 'Vật lý', 'working', 92.1, [[Role::NHOM_TRUONG, 'Nhóm lý']]],
        ['GV004', 'Phạm Thu Hà', 'ha.pt@thanhdam.edu.vn', '0977420688', 'Tổ xã hội', 'Tiếng Anh', 'working', 91.3, [[Role::TO_TRUONG, 'Tổ xã hội']]],
        ['GV005', 'Hoàng Quốc Bảo', 'bao.hq@thanhdam.edu.vn', '0934822199', 'Tổ xã hội', 'Lịch sử', 'on_leave', 90.4, []],
        ['GV006', 'Vũ Thanh Hương', 'huong.vt@thanhdam.edu.vn', '0966321455', 'Nhóm sinh', 'Sinh học', 'working', 88.7, []],
        ['GV007', 'Đỗ Anh Tuấn', 'tuan.da@thanhdam.edu.vn', '0903734211', 'Nhóm công nghệ', 'Tin học', 'suspended', 82.6, []],
        ['GV008', 'Bùi Ngọc Lan', 'lan.bn@thanhdam.edu.vn', '0918287613', 'Tổ xã hội', 'Ngữ văn', 'working', 89.8, [[Role::TO_PHO, 'Tổ xã hội']]],
        ['GV009', 'Ngô Đức Huy', 'huy.nd@thanhdam.edu.vn', '0982520311', 'Tổ xã hội', 'Tiếng Anh', 'working', 87.9, []],
        ['GV010', 'Đặng Minh Anh', 'anh.dm@thanhdam.edu.vn', '0938460722', 'Tổ xã hội', 'Địa lý', 'working', 86.4, []],
        ['GV011', 'Phan Khánh Linh', 'linh.pk@thanhdam.edu.vn', '0975317266', 'Nhóm hóa', 'Hóa học', 'working', 90.8, [[Role::TO_PHO, 'Tổ tự nhiên'], [Role::NHOM_TRUONG, 'Nhóm hóa']]],
        ['GV012', 'Lương Hoài An', 'an.lh@thanhdam.edu.vn', '0908215778', 'Tổ tự nhiên', 'Toán học', 'on_leave', 84.5, []],
    ];

    public function run(): void
    {
        DB::transaction(function () {
            $admin = User::where('email', config('app.admin.email'))->firstOrFail();
            $units = $this->seedUnits();
            $roles = Role::pluck('id', 'code');

            $secretary = User::firstOrCreate(['email' => 'trang.tt@thanhdam.edu.vn'], ['name' => 'Trịnh Thu Trang', 'phone' => '0900000001', 'password' => self::PASSWORD, 'status' => 'active']);
            $this->assignRole($secretary, $roles[Role::THU_KY], null, $admin);

            $yearId = DB::table('academic_years')->where('name', '2026-2027')->value('id')
                ?? DB::table('academic_years')->insertGetId(['name' => '2026-2027', 'starts_on' => '2026-08-01', 'ends_on' => '2027-05-31', 'is_current' => true, 'created_at' => now(), 'updated_at' => now()]);
            $frameworkId = DB::table('kpi_frameworks')->where('code', 'KPI-GV-2026')->value('id')
                ?? DB::table('kpi_frameworks')->insertGetId(['academic_year_id' => $yearId, 'code' => 'KPI-GV-2026', 'name' => 'KPI giáo viên 2026-2027', 'version' => 1, 'is_active' => true, 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);
            $periodId = DB::table('evaluation_periods')->where('name', 'Tháng hiện tại 2026')->value('id')
                ?? DB::table('evaluation_periods')->insertGetId(['academic_year_id' => $yearId, 'name' => 'Tháng hiện tại 2026', 'type' => 'month', 'starts_on' => '2026-08-01', 'ends_on' => '2026-08-31', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);

            foreach (self::TEACHERS as [$code, $name, $email, $phone, $unitName, $subjectName, $status, $kpi, $assignments]) {
                $user = User::firstOrCreate(['email' => $email], ['name' => $name, 'phone' => $phone, 'password' => self::PASSWORD, 'status' => 'active']);
                $teacher = Teacher::firstOrCreate(['employee_code' => $code], ['user_id' => $user->id, 'employment_status' => $status]);
                $subject = Subject::firstOrCreate(['name' => $subjectName], ['code' => strtoupper(Str::slug($subjectName, '_')), 'is_active' => true]);

                DB::table('teacher_department')->updateOrInsert(['teacher_id' => $teacher->id, 'department_id' => $units[$unitName], 'starts_on' => '2026-08-01'], ['is_primary' => true, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('teacher_subject')->updateOrInsert(['teacher_id' => $teacher->id, 'subject_id' => $subject->id, 'starts_on' => '2026-08-01'], ['is_primary' => true, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('teacher_kpi_results')->updateOrInsert(['teacher_id' => $teacher->id, 'evaluation_period_id' => $periodId, 'kpi_framework_id' => $frameworkId], ['base_score' => $kpi, 'final_score' => $kpi, 'classification' => $kpi >= 90 ? 'Xuất sắc' : ($kpi >= 85 ? 'Tốt' : 'Đạt'), 'status' => 'approved', 'calculated_at' => now(), 'created_at' => now(), 'updated_at' => now()]);

                $this->assignRole($user, $roles[Role::GIAO_VIEN], null, $admin);
                foreach ($assignments as [$roleCode, $roleUnit]) {
                    $this->assignRole($user, $roles[$roleCode], $roleUnit ? $units[$roleUnit] : null, $admin);
                }
            }
        });

        $this->call([DocumentSeeder::class, TaskSeeder::class]);
    }

    private function seedUnits(): array
    {
        $ids = [];
        foreach (self::UNITS as $toName => $groups) {
            $to = Department::firstOrCreate(['name' => $toName, 'parent_id' => null], ['code' => strtoupper(Str::slug($toName, '_')), 'type' => Department::TYPE_TO, 'is_active' => true]);
            $ids[$toName] = $to->id;
            foreach ($groups as $groupName) {
                $group = Department::firstOrCreate(['name' => $groupName, 'parent_id' => $to->id], ['code' => strtoupper(Str::slug($groupName, '_')), 'type' => Department::TYPE_NHOM, 'is_active' => true]);
                $ids[$groupName] = $group->id;
            }
        }

        return $ids;
    }

    private function assignRole(User $user, int $roleId, ?int $unitId, User $admin): void
    {
        $exists = $user->roles()->where('roles.id', $roleId)->wherePivot('department_id', $unitId)->exists();
        if (! $exists) {
            $user->roles()->attach($roleId, ['department_id' => $unitId, 'assigned_by' => $admin->id]);
        }
    }
}
