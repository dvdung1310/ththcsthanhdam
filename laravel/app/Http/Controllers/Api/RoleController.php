<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        $users = User::with([
            'roles',
            'roles.permissions',
            'teacher.departments' => fn ($query) => $query->wherePivotNull('ends_on'),
        ])->orderBy('name')->get()->map(fn ($user) => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'status' => $user->status,
            'teacher_code' => $user->teacher?->employee_code,
            'department_ids' => $user->teacher?->departments->pluck('id')->values() ?? collect(),
            'departments' => $user->teacher?->departments->pluck('name')->values() ?? collect(),
            'roles' => $user->roles->map(fn ($role) => ['id' => $role->id, 'name' => $role->name, 'code' => $role->code, 'department_id' => $role->pivot->department_id]),
            'permissions_count' => $user->roles->flatMap->permissions->unique('id')->count(),
        ]);

        return response()->json(['users' => $users, 'roles' => Role::with('permissions')->orderBy('name')->get(), 'departments' => Department::where('is_active', true)->orderBy('name')->get(['id', 'name'])]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['roles' => ['required', 'array'], 'roles.*.role_id' => ['required', 'exists:roles,id'], 'roles.*.department_id' => ['nullable', 'exists:departments,id']]);
        DB::transaction(function () use ($user, $data) {
            $user->roles()->detach();
            foreach ($data['roles'] as $assignment) {
                $user->roles()->attach($assignment['role_id'], ['department_id' => $assignment['department_id'] ?? null, 'assigned_by' => request()->user()->id, 'created_at' => now(), 'updated_at' => now()]);
            }
        });

        return response()->json(['message' => 'Đã cập nhật phân quyền cho '.$user->name.'.']);
    }
}
