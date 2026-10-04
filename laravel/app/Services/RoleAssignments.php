<?php

namespace App\Services;

use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RoleAssignments
{
    public function normalize(array $rows, bool $isTeacher): Collection
    {
        $roles = Role::whereIn('id', collect($rows)->pluck('role_id'))->get()->keyBy('id');
        $units = Department::whereIn('id', collect($rows)->pluck('department_id')->filter())->get()->keyBy('id');

        return collect($rows)->map(function ($row, $index) use ($roles, $units, $isTeacher) {
            $role = $roles[$row['role_id']];
            $unitId = $row['department_id'] ?? null;
            if (! $isTeacher && ($role->requiresUnit() || $role->code === Role::GIAO_VIEN)) {
                throw ValidationException::withMessages(["roles.$index.role_id" => "Vai trò {$role->name} chỉ dành cho nhân sự là giáo viên."]);
            }
            if ($role->requiresUnit()) {
                $unit = $unitId ? $units[$unitId] ?? null : null;
                if (! $unit || $unit->type !== $role->unit_type) {
                    throw ValidationException::withMessages(["roles.$index.department_id" => $role->unit_type === Department::TYPE_NHOM ? "Vai trò {$role->name} cần chọn một nhóm." : "Vai trò {$role->name} cần chọn một tổ."]);
                }
            } else {
                $unitId = null;
            }

            return ['role_id' => $role->id, 'department_id' => $unitId, 'requires_unit' => $role->requiresUnit()];
        })->unique(fn ($row) => $row['role_id'].'-'.$row['department_id'])->values();
    }

    public function guardAdmin(User $actor, ?User $target, Collection $newRoleIds): void
    {
        $adminRoleId = Role::where('code', Role::ADMIN)->value('id');
        $hadAdmin = $target?->roles()->where('roles.id', $adminRoleId)->exists() ?? false;
        $willHaveAdmin = $newRoleIds->contains($adminRoleId);
        if ($hadAdmin === $willHaveAdmin) {
            return;
        }

        abort_unless($actor->hasRole(Role::ADMIN), 403, 'Chỉ Quản trị viên được cấp hoặc thu hồi vai trò Quản trị viên.');
        if ($hadAdmin) {
            $this->ensureAnotherAdmin($target);
        }
    }

    public function ensureAnotherAdmin(User $target): void
    {
        $others = DB::table('role_user')->join('roles', 'roles.id', '=', 'role_user.role_id')->join('users', 'users.id', '=', 'role_user.user_id')
            ->where('roles.code', Role::ADMIN)->where('users.status', 'active')->where('role_user.user_id', '!=', $target->id)->exists();
        abort_unless($others, 422, 'Hệ thống phải còn ít nhất một Quản trị viên đang hoạt động.');
    }

    public function sync(User $user, Collection $assignments, User $actor): void
    {
        $user->roles()->detach();
        foreach ($assignments as $assignment) {
            $user->roles()->attach($assignment['role_id'], ['department_id' => $assignment['department_id'], 'assigned_by' => $actor->id]);
        }
        $user->flushAccessCache();
    }
}
