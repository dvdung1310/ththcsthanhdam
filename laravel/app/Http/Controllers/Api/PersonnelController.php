<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Role;
use App\Models\Teacher;
use App\Models\User;
use App\Services\RoleAssignments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PersonnelController extends Controller
{
    private const EMPLOYMENT_STATUSES = ['working', 'on_leave', 'suspended'];

    public function __construct(private RoleAssignments $assignments) {}

    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $unitIds = $actor->managedUnitIds();
        $users = User::with(['roles', 'teacher' => fn ($q) => $q->withTrashed(), 'teacher.departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->when($unitIds !== null, fn ($q) => $q->whereHas('teacher', fn ($t) => $t->inUnits($unitIds)))
            ->orderBy('name')->get();

        return response()->json([
            'data' => $users->map(fn (User $user) => $this->serialize($user))->values(),
            'roles' => Role::all()->sortBy(fn (Role $role) => $this->roleOrder($role->code))->map(fn (Role $role) => $role->only(['id', 'code', 'name', 'scope', 'unit_type']))->values(),
            'units' => Department::ordered($unitIds)->values(),
            'can_manage' => $actor->hasPermission('teachers.manage'),
            'can_assign_roles' => $this->canAssignRoles($actor),
            'can_view_evaluations' => $actor->hasPermission('evaluation.manage'),
            'management_scope' => $unitIds === null ? 'school' : 'department',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $this->validatePerson($request);
        $this->authorizeWrite($actor, null, $data);

        [$user, $added] = DB::transaction(function () use ($actor, $data) {
            $user = User::create([
                'name' => $data['name'], 'email' => $data['email'], 'phone' => $data['phone'] ?? null,
                'password' => $data['password'], 'status' => $data['is_active'] ? 'active' : 'inactive', 'must_change_password' => true,
            ]);
            if ($data['is_teacher']) {
                Teacher::create(['user_id' => $user->id, 'employee_code' => $data['employee_code'], 'employment_status' => $data['employment_status']]);
            }
            $roles = array_key_exists('roles', $data)
                ? $data['roles']
                : ($data['is_teacher'] ? [['role_id' => Role::where('code', Role::GIAO_VIEN)->value('id')]] : []);

            return [$user, $this->applyRolesAndUnits($actor, $user, $data, $roles)];
        });

        return response()->json(['message' => $this->savedMessage('Đã thêm nhân sự.', $added), 'data' => $this->serialize($this->reload($user))], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $data = $this->validatePerson($request, $user);
        $this->authorizeWrite($actor, $user, $data);

        $added = DB::transaction(function () use ($actor, $user, $data) {
            $user->update(array_filter([
                'name' => $data['name'], 'email' => $data['email'], 'phone' => $data['phone'] ?? null,
                'password' => $data['password'] ?? null, 'status' => $data['is_active'] ? 'active' : 'inactive',
            ], fn ($value) => $value !== null));
            if (! $data['is_active']) {
                $user->update(['api_token' => null]);
            }
            if ($data['is_teacher']) {
                $teacher = Teacher::withTrashed()->firstOrNew(['user_id' => $user->id]);
                $teacher->fill(['employee_code' => $data['employee_code'], 'employment_status' => $data['employment_status']])->save();
                if ($teacher->trashed()) {
                    $teacher->restore();
                }
            }
            $roles = array_key_exists('roles', $data) ? $data['roles'] : null;

            return $this->applyRolesAndUnits($actor, $user->fresh(), $data, $roles);
        });

        return response()->json(['message' => $this->savedMessage('Đã cập nhật nhân sự.', $added), 'data' => $this->serialize($this->reload($user))]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_if($actor->id === $user->id, 422, 'Bạn không thể tự xóa tài khoản của mình.');
        $this->ensureTargetInScope($actor, $user);
        if ($user->hasRole(Role::ADMIN)) {
            abort_unless($actor->hasRole(Role::ADMIN), 403, 'Chỉ Quản trị viên được xóa Quản trị viên.');
            $this->assignments->ensureAnotherAdmin($user);
        }

        DB::transaction(function () use ($user) {
            if ($teacher = $user->teacher) {
                $teacher->update(['employment_status' => 'terminated']);
                $teacher->delete();
            }
            $user->update(['status' => 'inactive', 'api_token' => null]);
        });

        return response()->json(['message' => 'Đã cho nghỉ và khóa tài khoản '.$user->name.'.']);
    }

    private function applyRolesAndUnits(User $actor, User $user, array $data, ?array $roles): array
    {
        if ($roles !== null) {
            $assignments = $this->assignments->normalize($roles, $data['is_teacher']);
            $this->assignments->ensureOnePositionPerUnit($assignments);
            $this->assignments->guardAdmin($actor, $user, $assignments->pluck('role_id'));
            $this->assignments->resolveSingleHolders($user, $assignments, (bool) ($data['replace_holders'] ?? false));
            $this->assignments->sync($user, $assignments, $actor);
        }
        if (! $data['is_teacher']) {
            return [];
        }

        $teacher = $user->teacher()->first();
        $roleUnits = $user->roles()->whereNotNull('role_user.department_id')->pluck('role_user.department_id')->map(fn ($id) => (int) $id)->all();
        $managed = $actor->managedUnitIds();
        $outOfScope = $managed === null ? [] : array_diff($teacher->directUnitIds(), $managed);
        $units = array_values(array_unique([...$data['unit_ids'], ...$outOfScope]));
        $missing = array_values(array_diff(array_unique($roleUnits), Department::withAncestors($units)));
        $added = $roles === null ? [] : array_values(array_diff($missing, Department::withAncestors($teacher->directUnitIds())));
        $this->syncUnits($teacher, [...$units, ...$missing]);

        return array_map(fn ($id) => Department::pathLabel((int) $id), $added);
    }

    private function validatePerson(Request $request, ?User $user = null): array
    {
        $teacherId = $user ? Teacher::withTrashed()->where('user_id', $user->id)->value('id') : null;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user?->id)],
            'phone' => ['nullable', 'string', 'max:20', Rule::unique('users', 'phone')->ignore($user?->id)],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8'],
            'is_active' => ['required', 'boolean'],
            'employee_code' => ['nullable', 'string', 'max:30', Rule::unique('teachers', 'employee_code')->ignore($teacherId)],
            'employment_status' => ['nullable', Rule::in(self::EMPLOYMENT_STATUSES)],
            'unit_ids' => ['nullable', 'array'],
            'unit_ids.*' => ['integer', Rule::exists('departments', 'id')->where('is_active', true)],
            'roles' => ['sometimes', 'array'],
            'roles.*.role_id' => ['required', 'exists:roles,id'],
            'roles.*.department_id' => ['nullable', 'exists:departments,id'],
            'replace_holders' => ['nullable', 'boolean'],
        ], [
            'employee_code.unique' => 'Mã giáo viên đã tồn tại.',
            'email.unique' => 'Email đã được sử dụng.',
            'phone.unique' => 'Số điện thoại đã được sử dụng.',
        ]);
        $data['unit_ids'] = collect($data['unit_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values()->all();
        $data['is_teacher'] = array_key_exists('roles', $data)
            ? collect($data['roles'])->pluck('role_id')->map(fn ($id) => (int) $id)->contains((int) Role::where('code', Role::GIAO_VIEN)->value('id'))
            : ($user ? (bool) $user->teacher : true);
        if ($data['is_teacher'] && (blank($data['employee_code'] ?? null) || blank($data['employment_status'] ?? null))) {
            throw ValidationException::withMessages(['employee_code' => 'Vui lòng nhập mã giáo viên và trạng thái công tác.']);
        }
        abort_if($user?->teacher && ! $data['is_teacher'], 422, 'Không thể bỏ vai trò Giáo viên của nhân sự đã có dữ liệu công việc. Hãy cho nghỉ việc thay vì vậy.');
        abort_if(! $data['is_teacher'] && $data['unit_ids'] !== [], 422, 'Chỉ giáo viên mới thuộc tổ, nhóm.');

        return $data;
    }

    private function authorizeWrite(User $actor, ?User $target, array $data): void
    {
        if (array_key_exists('roles', $data)) {
            abort_unless($this->canAssignRoles($actor), 403, 'Bạn không có quyền gán vai trò.');
        }
        if ($target) {
            $this->ensureTargetInScope($actor, $target);
            if ($actor->id === $target->id && ! $data['is_active']) {
                abort(422, 'Bạn không thể tự khóa tài khoản của mình.');
            }
            if (! $data['is_active'] && $target->hasRole(Role::ADMIN)) {
                $this->assignments->ensureAnotherAdmin($target);
            }
        }

        $managed = $actor->managedUnitIds();
        if ($managed === null) {
            return;
        }
        abort_unless($data['is_teacher'], 403, 'Bạn chỉ được quản lý giáo viên trong đơn vị của mình.');
        abort_if($data['unit_ids'] === [] || array_diff($data['unit_ids'], $managed) !== [], 403, 'Bạn chỉ được phân giáo viên vào đơn vị mình quản lý.');
    }

    private function ensureTargetInScope(User $actor, User $target): void
    {
        $managed = $actor->managedUnitIds();
        if ($managed === null) {
            return;
        }
        $teacher = $target->teacher;
        abort_unless($teacher && array_intersect($teacher->directUnitIds(), $managed) !== [], 403, 'Bạn chỉ được quản lý giáo viên trong đơn vị của mình.');
    }

    private function canAssignRoles(User $actor): bool
    {
        return $actor->hasPermission('roles.manage') && $actor->managedUnitIds() === null;
    }

    private function syncUnits(Teacher $teacher, array $unitIds): void
    {
        $current = DB::table('teacher_department')->where('teacher_id', $teacher->id)->whereNull('ends_on')->pluck('department_id')->map(fn ($id) => (int) $id)->all();
        $today = now()->toDateString();
        $removed = array_diff($current, $unitIds);
        if ($removed) {
            DB::table('teacher_department')->where('teacher_id', $teacher->id)->whereIn('department_id', $removed)->whereNull('ends_on')->update(['ends_on' => $today, 'updated_at' => now()]);
        }
        foreach (array_values(array_diff($unitIds, $current)) as $index => $unitId) {
            DB::table('teacher_department')->updateOrInsert(
                ['teacher_id' => $teacher->id, 'department_id' => $unitId, 'starts_on' => $today],
                ['is_primary' => $current === [] && $index === 0, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    private function reload(User $user): User
    {
        return User::with(['roles', 'teacher' => fn ($q) => $q->withTrashed(), 'teacher.departments' => fn ($q) => $q->wherePivotNull('ends_on')])->findOrFail($user->id);
    }

    private function serialize(User $user): array
    {
        $teacher = $user->teacher;
        $units = $teacher ? $teacher->departments->map(fn ($d) => ['id' => $d->id, 'label' => Department::pathLabel($d->id)])->values() : collect();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'is_active' => $user->status === 'active',
            'avatar_url' => $user->avatar_path ? route('avatars.show', ['filename' => basename($user->avatar_path)]) : null,
            'is_teacher' => (bool) $teacher,
            'teacher_id' => $teacher?->id,
            'employee_code' => $teacher?->employee_code,
            'employment_status' => $teacher?->employment_status,
            'units' => $units,
            'unit_ids' => $units->pluck('id'),
            'unit_path_ids' => $teacher ? $teacher->unitIds() : [],
            'roles' => $user->roles->sortBy(fn (Role $role) => $this->roleOrder($role->code))->map(fn (Role $role) => [
                'role_id' => $role->id, 'code' => $role->code, 'name' => $role->name,
                'department_id' => $role->pivot->department_id,
                'label' => $role->pivot->department_id ? $role->name.' — '.Department::pathLabel((int) $role->pivot->department_id) : $role->name,
            ])->values(),
        ];
    }

    private function savedMessage(string $message, array $added): string
    {
        return $added ? $message.' Đã tự thêm vào: '.implode(', ', $added).'.' : $message;
    }

    private function roleOrder(string $code): int
    {
        return (int) array_search($code, [Role::ADMIN, Role::HIEU_TRUONG, Role::THU_KY, Role::TO_TRUONG, Role::TO_PHO, Role::NHOM_TRUONG, Role::GIAO_VIEN], true);
    }
}
