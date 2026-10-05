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

        $leaders = User::whereHas('roles', fn ($q) => $q->where('role_user.department_id', $unit->id))
            ->with(['roles' => fn ($q) => $q->where('role_user.department_id', $unit->id)])->orderBy('name')->get()
            ->flatMap(fn (User $user) => $user->roles->map(fn (Role $role) => ['user_id' => $user->id, 'name' => $user->name, 'role' => $role->name]))->values();
        $members = Teacher::with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])->inUnits([$unit->id])->orderBy('employee_code')->get()
            ->map(fn (Teacher $teacher) => [
                'user_id' => $teacher->user_id,
                'name' => $teacher->user->name,
                'employee_code' => $teacher->employee_code,
                'employment_status' => $teacher->employment_status,
                'roles' => $teacher->user->roleLabels(),
                'via' => $teacher->departments->pluck('id')->contains($unit->id) ? null : $teacher->departments->filter(fn ($d) => $d->parent_id === $unit->id)->map(fn ($d) => $d->name)->join(', '),
            ])->values();

        return response()->json([
            'unit' => ['id' => $unit->id, 'name' => $unit->name, 'label' => Department::pathLabel($unit->id), 'type' => $unit->type, 'parent_id' => $unit->parent_id, 'is_active' => $unit->is_active],
            'leaders' => $leaders,
            'members' => $members,
        ]);
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
