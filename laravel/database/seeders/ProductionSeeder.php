<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\LibraryNode;
use App\Models\LibraryShare;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ProductionSeeder extends Seeder
{
    private const PERMISSIONS = [
        ['dashboard.view', 'Xem tổng quan', 'dashboard'],
        ['teachers.view', 'Xem giáo viên', 'teachers'],
        ['teachers.manage', 'Quản lý giáo viên', 'teachers'],
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
        ['settings.manage', 'Quản lý hệ thống', 'system'],
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
        $unitLeader = ['dashboard.view', 'teachers.view', 'teachers.manage', 'tasks.view', 'tasks.assign', 'tasks.update', 'library.view', 'evaluation.view', 'evaluation.score', 'kpi.view'];

        $roles = [
            Role::ADMIN => ['Quản trị viên', Role::SCOPE_SYSTEM, null, $all],
            Role::HIEU_TRUONG => ['Hiệu trưởng', Role::SCOPE_SCHOOL, null, $all],
            Role::THU_KY => ['Thư ký', Role::SCOPE_SCHOOL, null, ['dashboard.view', 'teachers.view', 'tasks.view', 'tasks.assign', 'library.view', 'kpi.view']],
            Role::TO_TRUONG => ['Tổ trưởng', Role::SCOPE_UNIT, Department::TYPE_TO, $unitLeader],
            Role::TO_PHO => ['Tổ phó', Role::SCOPE_UNIT, Department::TYPE_TO, $unitLeader],
            Role::NHOM_TRUONG => ['Nhóm trưởng', Role::SCOPE_UNIT, Department::TYPE_NHOM, $unitLeader],
            Role::GIAO_VIEN => ['Giáo viên', Role::SCOPE_SELF, null, ['dashboard.view', 'tasks.view', 'tasks.update', 'library.view', 'evaluation.view', 'kpi.view']],
        ];

        foreach ($roles as $code => [$name, $scope, $unitType, $permissions]) {
            $role = Role::updateOrCreate(['code' => $code], ['name' => $name, 'scope' => $scope, 'unit_type' => $unitType, 'is_system' => true]);
            if ($code === Role::ADMIN || $role->wasRecentlyCreated) {
                $role->permissions()->sync(Permission::whereIn('code', $permissions)->pluck('id'));
            } elseif ($grant = array_intersect($added, $permissions)) {
                $role->permissions()->syncWithoutDetaching(Permission::whereIn('code', $grant)->pluck('id'));
            }
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
