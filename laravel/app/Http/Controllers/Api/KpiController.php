<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Teacher;
use App\Services\KpiAnalytics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KpiController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return app(KpiAnalytics::class)->report($request, $this->visibilityScope($request));
    }

    /** @return array{0:string,1:array<int>|null} */
    private function visibilityScope(Request $request): array
    {
        $user = $request->user();
        if ($user->isPrincipal()) {
            return ['school', null];
        }
        $roleCodes = $user->roles()->where(fn ($q) => $q->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now()))->pluck('code');

        if ($roleCodes->intersect(['system_admin', 'school_board'])->isNotEmpty()) {
            return ['school', null];
        }

        $teacher = $user->teacher;
        if (! $teacher) {
            return ['self', []];
        }

        if ($user->isDepartmentTeacherManager() || $roleCodes->contains('department_leader')) {
            $departmentIds = $teacher->positions()->wherePivotNull('ends_on')->whereIn('positions.name', ['Tổ trưởng', 'Tổ phó'])->pluck('teacher_position.department_id')->filter()
                ->merge($user->roles()->where('roles.code', 'department_leader')->whereNotNull('role_user.department_id')->pluck('role_user.department_id'));
            if ($departmentIds->isEmpty()) {
                $departmentIds = $teacher->departments()->wherePivotNull('ends_on')->pluck('departments.id');
            }
            $departmentIds = $departmentIds->unique()->values();
            $teacherIds = Teacher::whereHas('departments', fn ($query) => $query
                ->whereIn('departments.id', $departmentIds)
                ->whereNull('teacher_department.ends_on'))
                ->pluck('id')->push($teacher->id)->unique()->values()->all();

            return ['department', $teacherIds];
        }

        return ['self', [$teacher->id]];
    }
}
