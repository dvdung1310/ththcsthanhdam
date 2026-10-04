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

class TeacherController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $unitIds = $request->user()->managedUnitIds();
        $query = Teacher::query()
            ->with(['user', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->when($unitIds !== null, fn ($q) => $q->inUnits($unitIds))
            ->when($request->string('search')->toString(), function ($q, $search) {
                $q->where(fn ($builder) => $builder->where('employee_code', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($user) => $user->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")));
            })
            ->when($request->integer('unit_id'), fn ($q, $unitId) => $q->inUnits([$unitId]))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('employment_status', $this->statusToDatabase($status)))
            ->orderBy('employee_code');

        $lifetimeKpi = $this->lifetimeKpiMap();
        $paginator = $query->paginate(min(max($request->integer('per_page', 20), 1), 1000))->withQueryString();
        $paginator->getCollection()->transform(fn (Teacher $teacher) => $this->serialize($teacher, $lifetimeKpi->get($teacher->id, 0)));

        $all = Teacher::query()->when($unitIds !== null, fn ($q) => $q->inUnits($unitIds));
        $leaderRoles = [Role::HIEU_TRUONG, Role::THU_KY, Role::TO_TRUONG, Role::TO_PHO, Role::NHOM_TRUONG];

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'stats' => [
                'total' => (clone $all)->count(),
                'working' => (clone $all)->where('employment_status', 'working')->count(),
                'leaders' => (clone $all)->whereHas('user.roles', fn ($q) => $q->whereIn('code', $leaderRoles))->count(),
                'average_kpi' => round((float) $lifetimeKpi->only((clone $all)->pluck('id')->all())->avg(), 1),
            ],
            'management_scope' => $unitIds === null ? 'school' : 'department',
        ]);
    }

    public function units(Request $request): JsonResponse
    {
        $unitIds = $request->user()->managedUnitIds();
        $members = DB::table('teacher_department')->whereNull('ends_on')->selectRaw('department_id, COUNT(*) as total')->groupBy('department_id')->pluck('total', 'department_id');

        return response()->json([
            'units' => Department::ordered($unitIds, false)->map(fn ($unit) => [...$unit, 'members' => (int) ($members[$unit['id']] ?? 0)])->values(),
            'can_configure' => $unitIds === null && $request->user()->hasPermission('teachers.manage'),
        ]);
    }

    public function storeUnit(Request $request): JsonResponse
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

    public function updateUnit(Request $request, Department $unit): JsonResponse
    {
        $this->ensureSchoolManager($request);
        $data = $this->validateUnit($request, $unit);
        $parentId = $unit->type === Department::TYPE_NHOM ? ($data['parent_id'] ?? $unit->parent_id) : null;
        $unit->update(['name' => $data['name'], 'parent_id' => $parentId, 'is_active' => $data['is_active'] ?? $unit->is_active]);

        return response()->json(['message' => 'Đã cập nhật đơn vị.', 'data' => $unit]);
    }

    public function destroyUnit(Request $request, Department $unit): JsonResponse
    {
        $this->ensureSchoolManager($request);
        abort_if($unit->children()->exists(), 422, 'Không thể xóa tổ đang có nhóm. Hãy xóa hoặc chuyển các nhóm trước.');
        abort_if(DB::table('teacher_department')->where('department_id', $unit->id)->whereNull('ends_on')->exists(), 422, 'Không thể xóa đơn vị đang có giáo viên.');
        abort_if(DB::table('task_department_assignees')->where('department_id', $unit->id)->exists(), 422, 'Đơn vị đã được giao công việc. Hãy ngưng hoạt động thay vì xóa.');
        abort_if(DB::table('role_user')->where('department_id', $unit->id)->exists(), 422, 'Đơn vị đang được dùng trong phân quyền. Hãy gỡ vai trò trước.');
        $unit->delete();

        return response()->json(['message' => 'Đã xóa đơn vị.']);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateTeacher($request);
        $this->ensureUnitsInScope($request, $data['unit_ids']);
        $teacher = DB::transaction(function () use ($data, $request) {
            $user = User::create([
                'name' => $data['name'], 'email' => $data['email'], 'phone' => $data['phone'],
                'password' => $data['password'], 'status' => 'active', 'must_change_password' => true,
            ]);
            $teacher = Teacher::create(['user_id' => $user->id, 'employee_code' => $data['code'], 'employment_status' => $this->statusToDatabase($data['status'])]);
            $user->roles()->attach(Role::where('code', Role::GIAO_VIEN)->value('id'), ['assigned_by' => $request->user()->id]);
            $this->syncUnits($teacher, $data['unit_ids']);

            return $teacher;
        });

        return response()->json(['message' => 'Đã thêm giáo viên.', 'data' => $this->serialize($this->loadTeacher($teacher))], 201);
    }

    public function show(Request $request, Teacher $teacher): JsonResponse
    {
        $this->ensureTeacherInScope($request, $teacher);

        return response()->json(['data' => $this->serialize($this->loadTeacher($teacher))]);
    }

    public function update(Request $request, Teacher $teacher): JsonResponse
    {
        $this->ensureTeacherInScope($request, $teacher);
        $data = $this->validateTeacher($request, $teacher);
        $this->ensureUnitsInScope($request, $data['unit_ids']);
        DB::transaction(function () use ($teacher, $data) {
            $teacher->user->update(array_filter(['name' => $data['name'], 'email' => $data['email'], 'phone' => $data['phone'], 'password' => $data['password'] ?? null], fn ($value) => $value !== null));
            $teacher->update(['employee_code' => $data['code'], 'employment_status' => $this->statusToDatabase($data['status'])]);
            $this->syncUnits($teacher, $data['unit_ids']);
        });

        return response()->json(['message' => 'Đã cập nhật giáo viên.', 'data' => $this->serialize($this->loadTeacher($teacher))]);
    }

    public function destroy(Request $request, Teacher $teacher): JsonResponse
    {
        $this->ensureTeacherInScope($request, $teacher);
        DB::transaction(function () use ($teacher) {
            $teacher->update(['employment_status' => 'terminated']);
            $teacher->delete();
            $teacher->user()->update(['status' => 'inactive']);
        });

        return response()->json(['message' => 'Đã xóa giáo viên.']);
    }

    private function validateTeacher(Request $request, ?Teacher $teacher = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:30', Rule::unique('teachers', 'employee_code')->ignore($teacher?->id)],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($teacher?->user_id)],
            'phone' => ['required', 'string', 'max:20', Rule::unique('users', 'phone')->ignore($teacher?->user_id)],
            'unit_ids' => ['nullable', 'array'],
            'unit_ids.*' => ['integer', Rule::exists('departments', 'id')->where('is_active', true)],
            'status' => ['required', Rule::in(['Đang làm việc', 'Nghỉ phép', 'Tạm nghỉ'])],
            'password' => [$teacher ? 'nullable' : 'required', 'string', 'min:8'],
        ]);
        $data['unit_ids'] = collect($data['unit_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values()->all();

        return $data;
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

    private function ensureTeacherInScope(Request $request, Teacher $teacher): void
    {
        $unitIds = $request->user()->managedUnitIds();
        if ($unitIds === null) {
            return;
        }
        abort_if(array_intersect($teacher->directUnitIds(), $unitIds) === [], 403, 'Bạn chỉ được quản lý giáo viên trong đơn vị của mình.');
    }

    private function ensureUnitsInScope(Request $request, array $unitIds): void
    {
        $managed = $request->user()->managedUnitIds();
        if ($managed === null) {
            return;
        }
        abort_if($unitIds === [] || array_diff($unitIds, $managed) !== [], 403, 'Bạn chỉ được phân giáo viên vào đơn vị mình quản lý.');
    }

    private function ensureSchoolManager(Request $request): void
    {
        abort_unless($request->user()->managedUnitIds() === null, 403, 'Chỉ người có phạm vi toàn trường được thay đổi cơ cấu tổ, nhóm.');
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

    private function loadTeacher(Teacher $teacher): Teacher
    {
        return $teacher->load(['user', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')]);
    }

    private function serialize(Teacher $teacher, ?float $kpi = null): array
    {
        $units = $teacher->departments->map(fn ($d) => ['id' => $d->id, 'label' => Department::pathLabel($d->id)])->values();

        return [
            'id' => $teacher->id, 'code' => $teacher->employee_code, 'name' => $teacher->user->name,
            'email' => $teacher->user->email, 'phone' => $teacher->user->phone,
            'units' => $units,
            'unit_ids' => $units->pluck('id'),
            'unit_path_ids' => $teacher->unitIds(),
            'department' => $units->pluck('label')->join(', ') ?: 'Chưa thuộc tổ/nhóm',
            'roles' => $teacher->user->roleLabels(),
            'status' => $this->statusToVietnamese($teacher->employment_status),
            'avatar_url' => $teacher->user->avatar_path ? route('avatars.show', ['filename' => basename($teacher->user->avatar_path)]) : null,
            'kpi' => $kpi ?? $this->lifetimeKpiMap($teacher->id)->get($teacher->id, 0),
        ];
    }

    private function lifetimeKpiMap(?int $teacherId = null)
    {
        $latestApproved = DB::table('task_evaluations')->where('status','approved')
            ->selectRaw('MAX(id) as id')->groupBy('task_id','teacher_id');
        return DB::table('task_evaluations as e')
            ->joinSub($latestApproved, 'latest', fn ($join) => $join->on('latest.id', '=', 'e.id'))
            ->join('tasks as t', 't.id', '=', 'e.task_id')
            ->leftJoin('task_catalog_items as ci', 'ci.id', '=', 't.task_catalog_item_id')
            ->whereNull('t.deleted_at')
            ->when($teacherId, fn ($query) => $query->where('e.teacher_id', $teacherId))
            ->groupBy('e.teacher_id')
            ->select('e.teacher_id', DB::raw('SUM(e.score) as earned'), DB::raw('SUM(COALESCE(ci.score, t.maximum_score)) as maximum'))
            ->get()->mapWithKeys(function ($row) {
                $maximum = (float) $row->maximum;
                $score = $maximum > 0 ? min(100, (float) $row->earned / $maximum * 100) : 0;
                return [(int) $row->teacher_id => round($score, 1)];
            });
    }

    private function statusToDatabase(string $status): string
    {
        return ['Đang làm việc' => 'working', 'Nghỉ phép' => 'on_leave', 'Tạm nghỉ' => 'suspended'][$status] ?? $status;
    }

    private function statusToVietnamese(string $status): string
    {
        return ['working' => 'Đang làm việc', 'on_leave' => 'Nghỉ phép', 'suspended' => 'Tạm nghỉ', 'terminated' => 'Đã nghỉ việc'][$status] ?? $status;
    }
}
