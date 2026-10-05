<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Role;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class UnitController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $unitIds = $request->user()->managedUnitIds();
        $memberships = DB::table('teacher_department')->whereNull('ends_on')->get(['teacher_id', 'department_id']);
        $members = fn (int $id) => $memberships->whereIn('department_id', Department::withDescendants([$id]))->pluck('teacher_id')->unique()->count();

        return response()->json([
            'units' => Department::ordered($unitIds, false)->map(fn ($unit) => [...$unit, 'members' => $members($unit['id'])])->values(),
            'can_configure' => $unitIds === null && $request->user()->hasPermission('teachers.manage'),
        ]);
    }

    public function show(Request $request, Department $unit): JsonResponse
    {
        $managed = $request->user()->managedUnitIds();
        abort_unless($managed === null || in_array($unit->id, $managed, true), 403, 'Bạn không phụ trách đơn vị này.');

        return response()->json($this->detail($unit, $request->user()));
    }

    public function leaderCandidates(Request $request, Department $unit): JsonResponse
    {
        $this->ensureCanAssign($request);
        $scope = Department::withDescendants([$unit->id]);
        $held = DB::table('role_user')->where('department_id', $unit->id)->join('roles', 'roles.id', '=', 'role_user.role_id')->pluck('roles.code', 'role_user.user_id');

        $teachers = Teacher::with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->where('employment_status', 'working')->whereHas('user', fn ($q) => $q->where('status', 'active'))->get()
            ->map(fn (Teacher $teacher) => [
                'user_id' => $teacher->user_id,
                'name' => $teacher->user->name,
                'employee_code' => $teacher->employee_code,
                'avatar_url' => $this->avatar($teacher->user),
                'units' => $teacher->departments->map(fn ($d) => Department::pathLabel($d->id))->values(),
                'roles' => $teacher->user->roleLabels(),
                'in_unit' => $teacher->departments->pluck('id')->intersect($scope)->isNotEmpty(),
                'unit_role' => $held[$teacher->user_id] ?? null,
            ])
            ->sortBy(fn (array $row) => [! $row['in_unit'], $row['name']])->values();

        return response()->json(['data' => $teachers]);
    }

    public function assignLeader(Request $request, Department $unit): JsonResponse
    {
        $this->ensureCanAssign($request);
        $slots = collect($this->slots($unit))->keyBy('code');
        $data = $request->validate([
            'role_code' => ['required', Rule::in($slots->keys()->all())],
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'replace_user_id' => ['nullable', 'integer', 'exists:users,id'],
        ], ['role_code.in' => 'Chức vụ này không áp dụng cho đơn vị đã chọn.']);
        $user = User::with('teacher')->findOrFail($data['user_id']);
        abort_unless($user->teacher, 422, 'Chỉ giáo viên mới giữ được chức vụ trong tổ, nhóm.');
        abort_if($user->teacher->employment_status !== 'working' || $user->status !== 'active', 422, "{$user->name} hiện không làm việc hoặc tài khoản bị khóa.");
        $role = Role::where('code', $data['role_code'])->firstOrFail();
        $unitRoleIds = Role::whereIn('code', $slots->keys())->pluck('id');

        DB::transaction(function () use ($unit, $user, $role, $data, $unitRoleIds, $request) {
            if (in_array($role->code, Role::SINGLE_HOLDER, true)) {
                DB::table('role_user')->where('role_id', $role->id)->where('department_id', $unit->id)->where('user_id', '!=', $user->id)->delete();
            }
            if (! empty($data['replace_user_id']) && (int) $data['replace_user_id'] !== $user->id) {
                DB::table('role_user')->where('role_id', $role->id)->where('department_id', $unit->id)->where('user_id', $data['replace_user_id'])->delete();
            }
            DB::table('role_user')->where('user_id', $user->id)->where('department_id', $unit->id)->whereIn('role_id', $unitRoleIds)->where('role_id', '!=', $role->id)->delete();
            DB::table('role_user')->updateOrInsert(
                ['role_id' => $role->id, 'user_id' => $user->id, 'department_id' => $unit->id],
                ['assigned_by' => $request->user()->id, 'expires_at' => null, 'created_at' => now(), 'updated_at' => now()],
            );
            $this->ensureMembership($user->teacher, $unit);
        });

        return response()->json(['message' => "Đã giao {$role->name} {$unit->name} cho {$user->name}.", 'data' => $this->detail($unit->fresh(), $request->user())]);
    }

    public function removeLeader(Request $request, Department $unit): JsonResponse
    {
        $this->ensureCanAssign($request);
        $data = $request->validate([
            'role_code' => ['required', Rule::in(array_column($this->slots($unit), 'code'))],
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ], ['role_code.in' => 'Chức vụ này không áp dụng cho đơn vị đã chọn.']);
        $role = Role::where('code', $data['role_code'])->firstOrFail();
        DB::table('role_user')->where('role_id', $role->id)->where('department_id', $unit->id)->where('user_id', $data['user_id'])->delete();
        $name = User::whereKey($data['user_id'])->value('name');

        return response()->json(['message' => "Đã gỡ {$role->name} của {$name}.", 'data' => $this->detail($unit, $request->user())]);
    }

    private function detail(Department $unit, User $actor): array
    {
        $scope = Department::withDescendants([$unit->id]);
        $leaders = User::with(['teacher', 'roles' => fn ($q) => $q->where('role_user.department_id', $unit->id)])
            ->whereHas('roles', fn ($q) => $q->where('role_user.department_id', $unit->id))->orderBy('name')->get()
            ->flatMap(fn (User $user) => $user->roles->map(fn (Role $role) => [
                'user_id' => $user->id, 'name' => $user->name, 'role' => $role->name, 'role_code' => $role->code,
                'employee_code' => $user->teacher?->employee_code, 'avatar_url' => $this->avatar($user),
            ]))->values();
        $members = Teacher::with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])->inUnits([$unit->id])->orderBy('employee_code')->get()
            ->map(fn (Teacher $teacher) => [
                'user_id' => $teacher->user_id,
                'name' => $teacher->user->name,
                'employee_code' => $teacher->employee_code,
                'avatar_url' => $this->avatar($teacher->user),
                'employment_status' => $teacher->employment_status,
                'roles' => $teacher->user->roleLabels(),
                'group_ids' => $teacher->departments->pluck('id')->intersect($scope)->reject(fn ($id) => $id === $unit->id)->values(),
                'via' => $teacher->departments->pluck('id')->contains($unit->id) ? null : $teacher->departments->filter(fn ($d) => $d->parent_id === $unit->id)->map(fn ($d) => $d->name)->join(', '),
            ])->values();

        return [
            'unit' => ['id' => $unit->id, 'name' => $unit->name, 'label' => Department::pathLabel($unit->id), 'type' => $unit->type, 'parent_id' => $unit->parent_id, 'is_active' => $unit->is_active],
            'leaders' => $leaders,
            'slots' => $this->slots($unit),
            'can_assign' => $this->canAssign($actor),
            'members' => $members,
        ];
    }

    private function slots(Department $unit): array
    {
        $codes = $unit->type === Department::TYPE_TO ? [Role::TO_TRUONG, Role::TO_PHO] : [Role::NHOM_TRUONG];

        return Role::whereIn('code', $codes)->get()->sortBy(fn (Role $role) => array_search($role->code, $codes, true))
            ->map(fn (Role $role) => ['code' => $role->code, 'name' => $role->name, 'single' => in_array($role->code, Role::SINGLE_HOLDER, true)])->values()->all();
    }

    private function ensureMembership(Teacher $teacher, Department $unit): void
    {
        $scope = Department::withDescendants([$unit->id]);
        $inScope = DB::table('teacher_department')->where('teacher_id', $teacher->id)->whereNull('ends_on')->whereIn('department_id', $scope)->exists();
        if ($inScope) {
            return;
        }
        $hasPrimary = DB::table('teacher_department')->where('teacher_id', $teacher->id)->whereNull('ends_on')->where('is_primary', true)->exists();
        DB::table('teacher_department')->insert([
            'teacher_id' => $teacher->id, 'department_id' => $unit->id, 'is_primary' => ! $hasPrimary,
            'starts_on' => now()->toDateString(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function canAssign(User $actor): bool
    {
        return $actor->hasPermission('roles.manage') && $actor->managedUnitIds() === null;
    }

    private function ensureCanAssign(Request $request): void
    {
        abort_unless($this->canAssign($request->user()), 403, 'Bạn không có quyền giao chức vụ.');
    }

    private function avatar(?User $user): ?string
    {
        return $user?->avatar_path ? route('avatars.show', ['filename' => basename($user->avatar_path)]) : null;
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureSchoolManager($request);
        $data = $this->validateUnit($request);
        $unit = Department::create([
            'name' => $data['name'], 'parent_id' => $data['parent_id'] ?? null,
            'code' => $this->uniqueCode('departments', $data['name']),
            'type' => empty($data['parent_id']) ? Department::TYPE_TO : Department::TYPE_NHOM, 'is_active' => true,
        ]);

        return response()->json(['message' => $unit->type === Department::TYPE_TO ? 'Đã thêm tổ.' : 'Đã thêm nhóm.', 'data' => $unit], 201);
    }

    public function update(Request $request, Department $unit): JsonResponse
    {
        $this->ensureSchoolManager($request);
        $data = $this->validateUnit($request, $unit);
        $parentId = $unit->type === Department::TYPE_NHOM ? ($data['parent_id'] ?? $unit->parent_id) : null;
        $unit->update(['name' => $data['name'], 'parent_id' => $parentId, 'is_active' => $data['is_active'] ?? $unit->is_active]);

        return response()->json(['message' => 'Đã cập nhật đơn vị.', 'data' => $unit]);
    }

    public function destroy(Request $request, Department $unit): JsonResponse
    {
        $this->ensureSchoolManager($request);
        abort_if($unit->children()->exists(), 422, 'Không thể xóa tổ đang có nhóm. Hãy xóa hoặc chuyển các nhóm trước.');
        abort_if(DB::table('teacher_department')->where('department_id', $unit->id)->whereNull('ends_on')->exists(), 422, 'Không thể xóa đơn vị đang có giáo viên.');
        abort_if(DB::table('task_department_assignees')->where('department_id', $unit->id)->exists(), 422, 'Đơn vị đã được giao công việc. Hãy ngưng hoạt động thay vì xóa.');
        abort_if(DB::table('role_user')->where('department_id', $unit->id)->exists(), 422, 'Đơn vị đang được dùng trong phân quyền. Hãy gỡ vai trò trước.');
        $unit->delete();

        return response()->json(['message' => 'Đã xóa đơn vị.']);
    }

    private function validateUnit(Request $request, ?Department $unit = null): array
    {
        $parentId = $request->input('parent_id');

        return $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('departments', 'name')->where(fn ($q) => $parentId ? $q->where('parent_id', $parentId) : $q->whereNull('parent_id'))->ignore($unit?->id)],
            'parent_id' => ['nullable', 'integer', Rule::exists('departments', 'id')->whereNull('parent_id')->where('type', Department::TYPE_TO), Rule::notIn(array_filter([$unit?->id]))],
            'is_active' => ['nullable', 'boolean'],
        ], [
            'name.required' => 'Vui lòng nhập tên đơn vị.',
            'name.unique' => 'Tên này đã tồn tại trong cùng cấp.',
            'parent_id.exists' => 'Nhóm chỉ có thể thuộc một tổ.',
        ]);
    }

    private function ensureSchoolManager(Request $request): void
    {
        abort_unless($request->user()->managedUnitIds() === null, 403, 'Chỉ người có phạm vi toàn trường được thay đổi cơ cấu tổ, nhóm.');
    }

    private function uniqueCode(string $table, string $name): string
    {
        $base = strtoupper(Str::slug($name, '_')) ?: 'ITEM';
        $code = substr($base, 0, 24);
        $suffix = 1;
        while (DB::table($table)->where('code', $code)->exists()) {
            $code = substr($base, 0, 20).'_'.$suffix++;
        }

        return $code;
    }
}
