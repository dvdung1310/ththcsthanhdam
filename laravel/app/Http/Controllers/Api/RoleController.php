<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    private const NOT_ENFORCED = ['kpi.manage', 'reports.view', 'settings.manage'];

    public function index(): JsonResponse
    {
        $roles = Role::with('permissions:id')->withCount('users')->get()
            ->sortBy(fn (Role $role) => Role::rank($role->code))
            ->map(fn (Role $role) => [
                'id' => $role->id, 'code' => $role->code, 'name' => $role->name,
                'scope' => $role->scope, 'unit_type' => $role->unit_type,
                'users_count' => $role->users_count,
                'locked' => $role->code === Role::ADMIN,
                'permission_ids' => $role->permissions->pluck('id')->values(),
            ])->values();

        return response()->json([
            'roles' => $roles,
            'permissions' => Permission::orderBy('id')->get(['id', 'code', 'name', 'module'])
                ->map(fn (Permission $permission) => [...$permission->toArray(), 'enforced' => ! in_array($permission->code, self::NOT_ENFORCED, true)])
                ->values(),
        ]);
    }

    public function updatePermissions(Request $request, Role $role): JsonResponse
    {
        abort_if($role->code === Role::ADMIN, 403, 'Không thể thay đổi quyền của Quản trị viên.');
        $data = $request->validate([
            'permission_ids' => ['present', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);
        $role->permissions()->sync($data['permission_ids']);

        return response()->json(['message' => 'Đã cập nhật quyền cho vai trò '.$role->name.'.']);
    }
}
