<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Position;
use App\Models\Role;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TeacherController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $departmentIds = $this->managedDepartmentIds($request);
        $query = Teacher::query()
            ->with(['user', 'departments' => fn ($q) => $q->wherePivotNull('ends_on'), 'positions' => fn ($q) => $q->wherePivotNull('ends_on')])
            ->when($departmentIds !== null, fn ($q) => $q->whereHas('departments', fn ($d) => $d->whereIn('departments.id',$departmentIds)->whereNull('teacher_department.ends_on')))
            ->when($request->string('search')->toString(), function ($q, $search) {
                $q->where(function ($builder) use ($search) {
                    $builder->where('employee_code', 'like', "%{$search}%")
                        ->orWhereHas('user', fn ($user) => $user->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))
                        ;
                });
            })
            ->when($request->string('department')->toString(), fn ($q, $department) => $q->whereHas('departments', fn ($d) => $d->where('name', $department)->whereNull('teacher_department.ends_on')))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('employment_status', $this->statusToDatabase($status)))
            ->orderBy('employee_code');

        $lifetimeKpi = $this->lifetimeKpiMap();
        $paginator = $query->paginate(min(max($request->integer('per_page', 20), 1), 1000))->withQueryString();
        $paginator->getCollection()->transform(fn (Teacher $teacher) => $this->serialize($teacher, $lifetimeKpi->get($teacher->id, 0)));

        $all = Teacher::query()->when($departmentIds !== null, fn ($q) => $q->whereHas('departments', fn ($d) => $d->whereIn('departments.id',$departmentIds)->whereNull('teacher_department.ends_on')));
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
                'leaders' => (clone $all)->whereHas('positions', fn ($q) => $q->where('is_manager', true)->whereNull('teacher_position.ends_on'))->count(),
                'average_kpi' => round((float) $lifetimeKpi->only((clone $all)->pluck('id')->all())->avg(), 1),
            ],
            'filters' => [
                'departments' => Department::where('is_active', true)->when($departmentIds !== null,fn($q)=>$q->whereIn('id',$departmentIds))->orderBy('name')->pluck('name'),
            ],
            'management_scope' => $departmentIds === null ? 'school' : 'department',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateTeacher($request);
        $this->ensureRequestedDepartment($request, $data['department']);
        $this->ensureRequestedPosition($request, $data['position']);
        $teacher = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'], 'email' => $data['email'], 'phone' => $data['phone'],
                'password' => $data['password'], 'status' => 'active', 'must_change_password' => true,
            ]);
            $teacher = Teacher::create(['user_id' => $user->id, 'employee_code' => $data['code'], 'employment_status' => $this->statusToDatabase($data['status'])]);
            if ($role = Role::where('code', 'teacher')->first()) {
                $user->roles()->attach($role->id, ['assigned_by' => request()->user()?->id, 'created_at' => now(), 'updated_at' => now()]);
            }
            $this->syncOrganization($teacher, $data);
            return $teacher;
        });

        return response()->json(['message' => 'Đã thêm giáo viên.', 'data' => $this->serialize($this->loadTeacher($teacher))], 201);
    }

    public function configuration(Request $request): JsonResponse
    {
        $departmentIds = $this->managedDepartmentIds($request);
        return response()->json([
            'departments' => Department::where('type', 'professional_group')->when($departmentIds !== null,fn($q)=>$q->whereIn('id',$departmentIds))->orderBy('name')->get(['id', 'name', 'code', 'is_active']),
            'positions' => Position::when($departmentIds !== null,fn($q)=>$q->where('level','>',$this->managerPositionLevel($request)))->orderBy('level')->orderBy('name')->get(['id', 'name', 'code', 'level', 'is_manager']),
            'can_configure' => $departmentIds === null,
        ]);
    }

    public function storeDepartment(Request $request): JsonResponse
    {
        $this->ensureSchoolManager($request);
        $data = $request->validate(['name'=>['required','string','max:255','unique:departments,name']], ['name.required'=>'Vui lòng nhập tên tổ chuyên môn.','name.unique'=>'Tên tổ chuyên môn này đã tồn tại.','name.max'=>'Tên tổ chuyên môn không được vượt quá 255 ký tự.']);
        $department = Department::create(['name'=>$data['name'],'code'=>$this->uniqueCode('departments',$data['name']),'type'=>'professional_group','is_active'=>true]);
        return response()->json(['message'=>'Đã thêm tổ chuyên môn.','data'=>$department], 201);
    }

    public function updateDepartment(Request $request, Department $department): JsonResponse
    {
        $this->ensureSchoolManager($request);
        abort_unless($department->type === 'professional_group', 404);
        $data = $request->validate(['name'=>['required','string','max:255',Rule::unique('departments','name')->ignore($department->id)]], ['name.required'=>'Vui lòng nhập tên tổ chuyên môn.','name.unique'=>'Tên tổ chuyên môn này đã tồn tại.','name.max'=>'Tên tổ chuyên môn không được vượt quá 255 ký tự.']);
        $department->update(['name'=>$data['name']]);
        return response()->json(['message'=>'Đã cập nhật tổ chuyên môn.','data'=>$department]);
    }

    public function destroyDepartment(Request $request, Department $department): JsonResponse
    {
        $this->ensureSchoolManager($request);
        abort_if(DB::table('teacher_department')->where('department_id',$department->id)->exists(), 422, 'Không thể xóa tổ chuyên môn đang có giáo viên.');
        $department->delete();
        return response()->json(['message'=>'Đã xóa tổ chuyên môn.']);
    }

    public function storePosition(Request $request): JsonResponse
    {
        $this->ensureSchoolManager($request);
        $data = $request->validate(['name'=>['required','string','max:255','unique:positions,name'],'level'=>['required','integer','min:1','max:6'],'is_manager'=>['nullable','boolean']], ['name.required'=>'Vui lòng nhập tên chức vụ.','name.unique'=>'Tên chức vụ này đã tồn tại.','name.max'=>'Tên chức vụ không được vượt quá 255 ký tự.']);
        $position = Position::create(['name'=>$data['name'],'code'=>$this->uniqueCode('positions',$data['name']),'level'=>$data['level'],'is_manager'=>$data['is_manager']??false]);
        return response()->json(['message'=>'Đã thêm chức vụ.','data'=>$position], 201);
    }

    public function updatePosition(Request $request, Position $position): JsonResponse
    {
        $this->ensureSchoolManager($request);
        $data = $request->validate(['name'=>['required','string','max:255',Rule::unique('positions','name')->ignore($position->id)],'level'=>['required','integer','min:1','max:6'],'is_manager'=>['nullable','boolean']], ['name.required'=>'Vui lòng nhập tên chức vụ.','name.unique'=>'Tên chức vụ này đã tồn tại.','name.max'=>'Tên chức vụ không được vượt quá 255 ký tự.']);
        $position->update(['name'=>$data['name'],'level'=>$data['level'],'is_manager'=>$data['is_manager']??false]);
        return response()->json(['message'=>'Đã cập nhật chức vụ.','data'=>$position]);
    }

    public function destroyPosition(Request $request, Position $position): JsonResponse
    {
        $this->ensureSchoolManager($request);
        abort_if(DB::table('teacher_position')->where('position_id',$position->id)->exists(), 422, 'Không thể xóa chức vụ đang được sử dụng.');
        $position->delete();
        return response()->json(['message'=>'Đã xóa chức vụ.']);
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
        $this->ensureRequestedDepartment($request, $data['department']);
        $this->ensureRequestedPosition($request, $data['position']);
        DB::transaction(function () use ($teacher, $data) {
            $teacher->user->update(array_filter(['name' => $data['name'], 'email' => $data['email'], 'phone' => $data['phone'], 'password' => $data['password'] ?? null], fn($value) => $value !== null));
            $teacher->update(['employee_code' => $data['code'], 'employment_status' => $this->statusToDatabase($data['status'])]);
            $this->syncOrganization($teacher, $data);
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
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:30', Rule::unique('teachers', 'employee_code')->ignore($teacher?->id)],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($teacher?->user_id)],
            'phone' => ['required', 'string', 'max:20', Rule::unique('users', 'phone')->ignore($teacher?->user_id)],
            'department' => ['required', 'string', 'max:255'],
            'position' => ['required', 'string', 'max:255'],
            'status' => ['required', Rule::in(['Đang làm việc', 'Nghỉ phép', 'Tạm nghỉ'])],
            'password' => [$teacher ? 'nullable' : 'required', 'string', 'min:8'],
        ]);
    }

    /** @return array<int>|null Null means school-wide access. */
    private function managedDepartmentIds(Request $request): ?array
    {
        $user = $request->user();
        if ($user->isPrincipal()) return null;
        $hasSchoolPermission = $user->roles()->whereHas('permissions',fn($q)=>$q->where('code','teachers.manage'))->exists();
        if ($hasSchoolPermission && ! $user->isDepartmentTeacherManager()) return null;

        $teacher = $user->teacher;
        if (! $teacher || ! $user->isDepartmentTeacherManager()) return [];

        $ids = DB::table('teacher_position')->join('positions','positions.id','=','teacher_position.position_id')
            ->where('teacher_position.teacher_id',$teacher->id)->whereNull('teacher_position.ends_on')
            ->whereIn('positions.name',['Tổ trưởng','Tổ phó'])->whereNotNull('teacher_position.department_id')
            ->pluck('teacher_position.department_id');
        if ($ids->isEmpty()) $ids = $teacher->departments()->wherePivotNull('ends_on')->pluck('departments.id');
        return $ids->map(fn($id)=>(int)$id)->unique()->values()->all();
    }

    private function ensureTeacherInScope(Request $request, Teacher $teacher): void
    {
        $departmentIds = $this->managedDepartmentIds($request);
        if ($departmentIds === null) return;
        abort_unless($teacher->departments()->wherePivotNull('ends_on')->whereIn('departments.id',$departmentIds)->exists(),403,'Bạn chỉ được quản lý giáo viên trong tổ của mình.');
    }

    private function ensureRequestedDepartment(Request $request, string $departmentName): void
    {
        $departmentIds = $this->managedDepartmentIds($request);
        if ($departmentIds === null) return;
        abort_unless(Department::whereIn('id',$departmentIds)->where('name',$departmentName)->exists(),403,'Bạn chỉ được phân giáo viên vào tổ của mình.');
    }

    private function ensureRequestedPosition(Request $request, string $positionName): void
    {
        if ($this->managedDepartmentIds($request) === null) return;
        abort_unless(Position::where('name',$positionName)->where('level','>',$this->managerPositionLevel($request))->exists(),403,'Bạn không được chọn chức vụ ngang cấp hoặc cấp trên.');
    }

    private function managerPositionLevel(Request $request): int
    {
        return (int) ($request->user()->teacher?->positions()->wherePivotNull('ends_on')->whereIn('positions.name',['Tổ trưởng','Tổ phó'])->min('positions.level') ?? 6);
    }

    private function ensureSchoolManager(Request $request): void
    {
        abort_unless($this->managedDepartmentIds($request) === null,403,'Chỉ quản trị viên hoặc Ban giám hiệu được thay đổi cấu hình toàn trường.');
    }

    private function syncOrganization(Teacher $teacher, array $data): void
    {
        $department = Department::firstOrCreate(['name' => $data['department']], ['code' => $this->uniqueCode('departments', $data['department']), 'type' => 'professional_group', 'is_active' => true]);
        $position = Position::firstOrCreate(['name' => $data['position']], ['code' => $this->uniqueCode('positions', $data['position']), 'level' => 6, 'is_manager' => $data['position'] !== 'Giáo viên']);
        $this->replaceCurrentPivot('teacher_department', 'department_id', $teacher->id, $department->id, ['is_primary' => true]);
        $this->replaceCurrentPivot('teacher_position', 'position_id', $teacher->id, $position->id, ['department_id' => $department->id]);
    }

    private function replaceCurrentPivot(string $table, string $targetColumn, int $teacherId, int $targetId, array $extra): void
    {
        $current = DB::table($table)->where('teacher_id', $teacherId)->whereNull('ends_on')->first();
        if ($current && (int) $current->{$targetColumn} === $targetId) {
            DB::table($table)->where('id', $current->id)->update([...$extra, 'updated_at' => now()]);
            return;
        }
        if ($current) DB::table($table)->where('id', $current->id)->update(['ends_on' => now()->subDay()->toDateString(), 'updated_at' => now()]);
        DB::table($table)->insert(['teacher_id' => $teacherId, $targetColumn => $targetId, ...$extra, 'starts_on' => now()->toDateString(), 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function uniqueCode(string $table, string $name): string
    {
        $base = strtoupper(Str::slug($name, '_')) ?: 'ITEM';
        $code = substr($base, 0, 24);
        $suffix = 1;
        while (DB::table($table)->where('code', $code)->exists()) $code = substr($base, 0, 20).'_'.$suffix++;
        return $code;
    }

    private function loadTeacher(Teacher $teacher): Teacher
    {
        return $teacher->load(['user', 'departments' => fn ($q) => $q->wherePivotNull('ends_on'), 'positions' => fn ($q) => $q->wherePivotNull('ends_on')]);
    }

    private function serialize(Teacher $teacher, ?float $kpi = null): array
    {
        return [
            'id' => $teacher->id, 'code' => $teacher->employee_code, 'name' => $teacher->user->name,
            'email' => $teacher->user->email, 'phone' => $teacher->user->phone,
            'department' => $teacher->departments->first()?->name ?? 'Chưa phân tổ',
            'position' => $teacher->positions->first()?->name ?? 'Giáo viên',
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
