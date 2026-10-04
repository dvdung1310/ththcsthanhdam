<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        $users = User::with(['roles.permissions', 'teacher.departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->orderBy('name')->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'status' => $user->status,
                'teacher_code' => $user->teacher?->employee_code,
                'department_ids' => $user->teacher?->unitIds() ?? [],
                'roles' => $user->roles->map(fn (Role $role) => [
                    'id' => $role->id, 'code' => $role->code, 'name' => $role->name,
                    'department_id' => $role->pivot->department_id,
                    'label' => $role->pivot->department_id ? $role->name.' — '.Department::pathLabel((int) $role->pivot->department_id) : $role->name,
                ])->values(),
                'permissions_count' => $user->roles->flatMap->permissions->unique('id')->count(),
            ]);

        return response()->json([
            'users' => $users,
            'roles' => Role::with('permissions')->get()->sortBy(fn (Role $role) => array_search($role->code, [Role::ADMIN, Role::HIEU_TRUONG, Role::THU_KY, Role::TO_TRUONG, Role::TO_PHO, Role::NHOM_TRUONG, Role::GIAO_VIEN], true))->values(),
            'departments' => Department::ordered()->map(fn ($unit) => ['id' => $unit['id'], 'name' => $unit['label'], 'type' => $unit['type']])->values(),
        ]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'roles' => ['present', 'array'],
            'roles.*.role_id' => ['required', 'exists:roles,id'],
            'roles.*.department_id' => ['nullable', 'exists:departments,id'],
        ]);

        $roles = Role::whereIn('id', collect($data['roles'])->pluck('role_id'))->get()->keyBy('id');
        $units = Department::whereIn('id', collect($data['roles'])->pluck('department_id')->filter())->get()->keyBy('id');
        $assignments = collect($data['roles'])->map(function ($row, $index) use ($roles, $units) {
            $role = $roles[$row['role_id']];
            $unitId = $row['department_id'] ?? null;
            if ($role->requiresUnit()) {
                $unit = $unitId ? $units[$unitId] : null;
                if (! $unit || $unit->type !== $role->unit_type) {
                    throw ValidationException::withMessages(["roles.$index.department_id" => $role->unit_type === Department::TYPE_NHOM ? "Vai trò {$role->name} cần chọn một nhóm." : "Vai trò {$role->name} cần chọn một tổ."]);
                }
            } else {
                $unitId = null;
            }

            return ['role_id' => $role->id, 'department_id' => $unitId];
        })->unique(fn ($row) => $row['role_id'].'-'.$row['department_id'])->values();

        $this->guardAdminRole($request->user(), $user, $assignments->pluck('role_id'));

        DB::transaction(function () use ($user, $assignments, $request) {
            $user->roles()->detach();
            foreach ($assignments as $assignment) {
                $user->roles()->attach($assignment['role_id'], ['department_id' => $assignment['department_id'], 'assigned_by' => $request->user()->id]);
            }
        });

        return response()->json(['message' => 'Đã cập nhật phân quyền cho '.$user->name.'.']);
    }

    private function guardAdminRole(User $actor, User $target, $newRoleIds): void
    {
        $adminRoleId = Role::where('code', Role::ADMIN)->value('id');
        $hadAdmin = $target->roles()->where('roles.id', $adminRoleId)->exists();
        $willHaveAdmin = $newRoleIds->contains($adminRoleId);
        if ($hadAdmin === $willHaveAdmin) {
            return;
        }

        abort_unless($actor->hasRole(Role::ADMIN), 403, 'Chỉ Quản trị viên được cấp hoặc thu hồi vai trò Quản trị viên.');
        if ($hadAdmin) {
            $otherAdmins = DB::table('role_user')->where('role_id', $adminRoleId)->where('user_id', '!=', $target->id)->exists();
            abort_unless($otherAdmins, 422, 'Hệ thống phải còn ít nhất một Quản trị viên.');
        }
    }
}
