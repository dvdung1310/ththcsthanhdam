<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Employee;
use App\Models\LeaveRecord;
use App\Models\Role;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeaveRecordController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
            'employee_id' => ['nullable', 'integer'],
            'unit_id' => ['nullable', 'integer'],
            'type' => ['nullable', Rule::in(array_keys(LeaveRecord::TYPES))],
        ]);
        $month = CarbonImmutable::createFromFormat('Y-m', $data['month'] ?? now()->format('Y-m'))->startOfMonth();
        $canViewAll = $user->hasPermission('leave.view');

        $records = LeaveRecord::with(['employee.user', 'employee.departments' => fn ($q) => $q->wherePivotNull('ends_on'), 'creator:id,name'])
            ->overlapping($month, $month->endOfMonth())
            ->whereIn('employee_id', $this->visibleEmployees($user)->select('employees.id'))
            ->when($data['employee_id'] ?? null, fn ($q, $id) => $q->where('employee_id', $id))
            ->when($data['unit_id'] ?? null, fn ($q, $id) => $q->whereIn('employee_id', Employee::inUnits([$id])->select('employees.id')))
            ->when($data['type'] ?? null, fn ($q, $type) => $q->where('type', $type))
            ->orderByDesc('starts_on')->orderByDesc('id')->get();

        $people = $canViewAll || $user->hasPermission('leave.manage')
            ? $this->visibleEmployees($user)->with(['user.roles', 'departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('employment_status', '!=', 'terminated')->get()
                ->sortBy(fn (Employee $e) => $e->user?->name)->map(fn (Employee $e) => $this->person($e))->values()
            : collect();

        return response()->json([
            'month' => $month->format('Y-m'),
            'data' => $records->map(fn (LeaveRecord $record) => $this->serialize($record, $user, $month))->values(),
            'people' => $people,
            'units' => Department::ordered($user->managedUnitIds())->values(),
            'types' => LeaveRecord::TYPES,
            'regime_kinds' => LeaveRecord::REGIME_KINDS,
            'abilities' => [
                'can_view_all' => $canViewAll,
                'can_manage' => $user->hasPermission('leave.manage'),
                'own_employee_id' => $user->employee?->id,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $this->validated($request);
        $employee = Employee::findOrFail($data['employee_id'] ?? $user->employee?->id ?? 0);
        $this->authorizeWrite($user, $employee, $data['type']);
        $record = LeaveRecord::create([...$data, 'employee_id' => $employee->id, 'created_by' => $user->id, 'updated_by' => $user->id]);

        return response()->json(['message' => 'Đã ghi nhận ngày nghỉ.', 'data' => $this->serialize($record->load(['employee.user', 'creator:id,name']), $user)], 201);
    }

    public function update(Request $request, LeaveRecord $leaveRecord): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->canEdit($user, $leaveRecord), 403, 'Bạn không sửa được bản ghi nghỉ này.');
        $data = $this->validated($request);
        $employee = Employee::findOrFail($data['employee_id'] ?? $leaveRecord->employee_id);
        $this->authorizeWrite($user, $employee, $data['type']);
        $leaveRecord->update([...$data, 'employee_id' => $employee->id, 'updated_by' => $user->id]);

        return response()->json(['message' => 'Đã cập nhật ngày nghỉ.', 'data' => $this->serialize($leaveRecord->fresh(['employee.user', 'creator:id,name']), $user)]);
    }

    public function destroy(Request $request, LeaveRecord $leaveRecord): JsonResponse
    {
        abort_unless($this->canEdit($request->user(), $leaveRecord), 403, 'Bạn không xóa được bản ghi nghỉ này.');
        $leaveRecord->delete();

        return response()->json(['message' => 'Đã xóa bản ghi nghỉ.']);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'type' => ['required', Rule::in(array_keys(LeaveRecord::TYPES))],
            'regime_kind' => ['nullable', 'required_if:type,'.LeaveRecord::REGIME, Rule::in(array_keys(LeaveRecord::REGIME_KINDS))],
            'starts_on' => ['required', 'date'],
            'start_session' => ['required', Rule::in(LeaveRecord::SESSIONS)],
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'end_session' => ['required', Rule::in(LeaveRecord::SESSIONS)],
            'sessions' => ['nullable', 'integer', 'min:1', 'max:400'],
            'reason' => ['nullable', 'string', 'max:2000'],
        ], [
            'regime_kind.required_if' => 'Vui lòng chọn loại nghỉ chế độ.',
            'ends_on.after_or_equal' => 'Ngày kết thúc phải sau hoặc trùng ngày bắt đầu.',
        ]);
        $start = CarbonImmutable::parse($data['starts_on']);
        $end = CarbonImmutable::parse($data['ends_on']);
        abort_if($start->isSameDay($end) && $data['start_session'] === 'pm' && $data['end_session'] === 'am', 422, 'Buổi kết thúc phải sau buổi bắt đầu.');
        $computed = LeaveRecord::countSessions($start, $data['start_session'], $end, $data['end_session']);
        $data['sessions'] = $data['sessions'] ?? $computed;
        abort_if($data['sessions'] < 1, 422, 'Khoảng thời gian nghỉ không có buổi làm việc nào.');
        if ($data['type'] !== LeaveRecord::REGIME) {
            $data['regime_kind'] = null;
        }

        return $data;
    }

    private function authorizeWrite(User $user, Employee $employee, string $type): void
    {
        $own = $employee->id === $user->employee?->id;
        if ($user->hasPermission('leave.manage')) {
            abort_unless($own || $this->visibleEmployees($user)->whereKey($employee->id)->exists(), 403, 'Bạn chỉ ghi nhận nghỉ cho nhân sự trong phạm vi quản lý.');

            return;
        }
        abort_unless($own, 403, 'Bạn chỉ báo nghỉ được cho chính mình.');
        abort_if($type === LeaveRecord::UNEXCUSED, 403, 'Nghỉ không phép do bộ phận quản lý ghi nhận.');
    }

    private function canEdit(User $user, LeaveRecord $record): bool
    {
        if ($user->hasPermission('leave.manage')) {
            return $this->visibleEmployees($user)->whereKey($record->employee_id)->exists() || $record->employee_id === $user->employee?->id;
        }

        return $record->employee_id === $user->employee?->id
            && $record->created_by === $user->id
            && $record->type !== LeaveRecord::UNEXCUSED
            && $record->starts_on->gte(now()->startOfMonth());
    }

    private function visibleEmployees(User $user): Builder
    {
        $query = Employee::query();
        if (! $user->hasPermission('leave.view') && ! $user->hasPermission('leave.manage')) {
            return $query->whereKey($user->employee?->id ?? 0);
        }
        $units = $user->managedUnitIds();

        return $units === null ? $query : $query->where(fn ($q) => $q->inUnits($units)->orWhere('employees.id', $user->employee?->id ?? 0));
    }

    private function person(Employee $employee): array
    {
        return [
            'id' => $employee->id, 'name' => $employee->user?->name, 'code' => $employee->employee_code,
            'avatar_url' => $employee->user?->avatar_path ? route('avatars.show', ['filename' => basename($employee->user->avatar_path)]) : null,
            'department_ids' => $employee->unitIds(),
            'roles' => $employee->user?->roles->map(fn (Role $role) => ['code' => $role->code, 'name' => $role->name, 'department_id' => $role->pivot->department_id])->values() ?? [],
        ];
    }

    private function serialize(LeaveRecord $record, User $user, ?CarbonImmutable $month = null): array
    {
        $employee = $record->employee;

        return [
            'id' => $record->id,
            'employee' => [
                'id' => $employee->id, 'name' => $employee->user?->name, 'code' => $employee->employee_code,
                'avatar_url' => $employee->user?->avatar_path ? route('avatars.show', ['filename' => basename($employee->user->avatar_path)]) : null,
                'units' => $employee->relationLoaded('departments') ? $employee->departments->map(fn ($d) => Department::pathLabel($d->id))->values() : [],
            ],
            'type' => $record->type,
            'regime_kind' => $record->regime_kind,
            'starts_on' => $record->starts_on->toDateString(),
            'start_session' => $record->start_session,
            'ends_on' => $record->ends_on->toDateString(),
            'end_session' => $record->end_session,
            'sessions' => $record->sessions,
            'sessions_in_month' => $month ? $record->sessionsWithin($month, $month->endOfMonth()) : $record->sessions,
            'reason' => $record->reason,
            'created_by' => $record->creator?->name,
            'self_reported' => $record->created_by === $employee->user_id,
            'created_at' => $record->created_at?->toIso8601String(),
            'can_edit' => $this->canEdit($user, $record),
        ];
    }
}
