<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\LibraryNode;
use App\Models\LibraryShare;
use App\Models\Permission;
use App\Models\Role;
use App\Models\TaskCategory;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ProductionSeeder extends Seeder
{
    private const PERMISSIONS = [
        ['dashboard.view', 'Xem tổng quan', 'dashboard'],
        ['personnel.view', 'Xem nhân sự', 'personnel'],
        ['personnel.manage', 'Thêm, sửa, cho nghỉ nhân sự', 'personnel'],
        ['units.manage', 'Quản lý cơ cấu tổ, nhóm', 'personnel'],
        ['leave.view', 'Xem theo dõi nghỉ của nhân sự', 'personnel'],
        ['leave.manage', 'Ghi nhận nghỉ cho nhân sự (gồm không phép)', 'personnel'],
        ['tasks.view', 'Xem công việc', 'tasks'],
        ['tasks.assign', 'Giao và quản lý công việc', 'tasks'],
        ['tasks.update', 'Cập nhật tiến độ', 'tasks'],
        ['library.view', 'Xem dữ liệu được chia sẻ', 'library'],
        ['library.upload', 'Tạo thư mục, tải file ở gốc kho', 'library'],
        ['library.manage', 'Quản lý toàn bộ kho dữ liệu', 'library'],
        ['evaluation.view', 'Tự đánh giá thi đua', 'evaluation'],
        ['evaluation.score', 'Chấm phiếu thi đua của tổ', 'evaluation'],
        ['evaluation.manage', 'Mở kỳ, duyệt và công bố thi đua', 'evaluation'],
        ['kpi.view', 'Xem thống kê', 'kpi'],
        ['kpi.manage', 'Quản lý thống kê', 'kpi'],
        ['reports.view', 'Xem báo cáo', 'reports'],
        ['roles.manage', 'Quản lý phân quyền', 'system'],
        ['ai.assistant', 'Dùng Trợ lý AI', 'system'],
        ['ai.tasks', 'Dùng AI phân tích tài liệu giao việc', 'system'],
        ['settings.manage', 'Quản lý hệ thống', 'system'],
    ];

    private const TASK_CATEGORIES = [
        'Chuyên môn' => 'Kế hoạch dạy học, sinh hoạt chuyên môn, dự giờ, ra đề.',
        'Hành chính' => 'Hồ sơ, giấy tờ và thủ tục hành chính của nhà trường.',
        'Báo cáo' => 'Báo cáo định kỳ hoặc đột xuất gửi Ban giám hiệu.',
        'Sự kiện' => 'Tổ chức, tham gia các sự kiện và hoạt động ngoại khóa.',
        'Công tác chủ nhiệm' => 'Công việc liên quan lớp chủ nhiệm và phụ huynh.',
        'Phong trào' => 'Thi đua, phong trào của trường và các đoàn thể.',
    ];

    public function run(): void
    {
        $added = [];
        foreach (self::PERMISSIONS as [$code, $name, $module]) {
            if (Permission::updateOrCreate(['code' => $code], ['name' => $name, 'module' => $module])->wasRecentlyCreated) {
                $added[] = $code;
            }
        }
        $all = array_column(self::PERMISSIONS, 0);
        Permission::whereNotIn('code', $all)->delete();
        $leadership = array_values(array_diff($all, ['roles.manage', 'ai.assistant']));
        $staff = ['tasks.view', 'tasks.update', 'library.view'];
        $unitLeader = ['personnel.view', 'personnel.manage', 'leave.view', 'tasks.view', 'tasks.assign', 'ai.tasks', 'tasks.update', 'library.view', 'evaluation.view', 'evaluation.score'];

        $roles = [
            Role::ADMIN => ['Quản trị viên', Role::SCOPE_SYSTEM, null, $all],
            Role::HIEU_TRUONG => ['Hiệu trưởng', Role::SCOPE_SCHOOL, null, $all],
            Role::PHO_HIEU_TRUONG => ['Phó hiệu trưởng', Role::SCOPE_SCHOOL, null, $leadership],
            Role::BAN_GIAM_HIEU => ['Ban giám hiệu', Role::SCOPE_SCHOOL, null, $leadership],
            Role::THU_KY => ['Thư ký', Role::SCOPE_SCHOOL, null, ['dashboard.view', 'personnel.view', 'leave.view', 'leave.manage', 'tasks.view', 'tasks.assign', 'ai.tasks', 'library.view', 'kpi.view']],
            Role::TO_TRUONG => ['Tổ trưởng', Role::SCOPE_UNIT, Department::TYPE_TO, $unitLeader],
            Role::TO_PHO => ['Tổ phó', Role::SCOPE_UNIT, Department::TYPE_TO, $unitLeader],
            Role::NHOM_TRUONG => ['Nhóm trưởng', Role::SCOPE_UNIT, Department::TYPE_NHOM, $unitLeader],
            Role::GIAO_VIEN => ['Giáo viên', Role::SCOPE_SELF, null, ['tasks.view', 'tasks.update', 'library.view', 'evaluation.view']],
            Role::GVCN => ['Giáo viên chủ nhiệm', Role::SCOPE_SELF, null, []],
            Role::NHAN_VIEN => ['Nhân viên', Role::SCOPE_SELF, null, $staff],
        ];

        foreach ($roles as $code => [$name, $scope, $unitType, $permissions]) {
            $role = Role::updateOrCreate(['code' => $code], ['name' => $name, 'scope' => $scope, 'unit_type' => $unitType, 'is_system' => true]);
            if ($code === Role::ADMIN || $role->wasRecentlyCreated) {
                $role->permissions()->sync(Permission::whereIn('code', $permissions)->pluck('id'));
            } elseif ($grant = array_intersect($added, $permissions)) {
                $role->permissions()->syncWithoutDetaching(Permission::whereIn('code', $grant)->pluck('id'));
            }
        }

        foreach (self::TASK_CATEGORIES as $name => $description) {
            TaskCategory::firstOrCreate(['name' => $name], ['code' => strtoupper(Str::slug($name, '_')), 'description' => $description, 'is_active' => true]);
        }

        $this->seedLibrary($this->seedAdmin());
        $this->call(EvaluationTemplateSeeder::class);
    }

    private function seedLibrary(User $admin): void
    {
        $shared = LibraryNode::firstOrCreate(
            ['parent_id' => null, 'is_system' => true, 'name' => 'Chia sẻ chung'],
            ['type' => LibraryNode::FOLDER, 'owner_id' => $admin->id],
        );
        LibraryShare::firstOrCreate(
            ['node_id' => $shared->id, 'user_id' => null, 'department_id' => null],
            ['access' => LibraryShare::READ, 'granted_by' => $admin->id],
        );
    }

    private function seedAdmin(): User
    {
        $config = config('app.admin');
        $admin = User::where('email', $config['email'])->first();
        if (! $admin) {
            $password = $config['password'] ?: Str::password(16);
            $admin = User::create([
                'name' => $config['name'], 'email' => $config['email'], 'password' => $password,
                'status' => 'active', 'must_change_password' => true,
            ]);
            if (! $config['password']) {
                $this->command?->warn("Admin {$config['email']} created with generated password: {$password}");
            }
        }

        $adminRole = Role::where('code', Role::ADMIN)->firstOrFail();
        if (! $admin->roles()->whereKey($adminRole->id)->exists()) {
            $admin->roles()->attach($adminRole->id, ['assigned_by' => $admin->id]);
        }

        return $admin;
    }
}
