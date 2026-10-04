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

    private function visibilityScope(Request $request): array
    {
        $user = $request->user();
        $unitIds = $user->managedUnitIds();
        if ($unitIds === null) {
            return ['school', null];
        }

        $teacher = $user->teacher;
        if ($unitIds) {
            $teacherIds = Teacher::inUnits($unitIds)->pluck('id');
            if ($teacher) {
                $teacherIds->push($teacher->id);
            }

            return ['department', $teacherIds->unique()->values()->all()];
        }

        return ['self', $teacher ? [$teacher->id] : []];
    }
}
