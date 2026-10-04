<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TaskCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TaskTypeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->ensureManager($request);

        return response()->json([
            'data' => TaskCategory::withCount('tasks')->orderBy('name')->get()->map(fn (TaskCategory $type) => [
                'id' => $type->id, 'name' => $type->name, 'description' => $type->description,
                'is_active' => $type->is_active, 'tasks_count' => $type->tasks_count,
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureManager($request);
        $data = $this->validateType($request);
        $type = TaskCategory::create([...$data, 'code' => $this->uniqueCode($data['name']), 'is_active' => true]);

        return response()->json(['message' => 'Đã thêm loại nhiệm vụ.', 'data' => $type], 201);
    }

    public function update(Request $request, TaskCategory $taskType): JsonResponse
    {
        $this->ensureManager($request);
        $data = $this->validateType($request, $taskType);
        $taskType->update($data);

        return response()->json(['message' => 'Đã cập nhật loại nhiệm vụ.', 'data' => $taskType]);
    }

    public function destroy(Request $request, TaskCategory $taskType): JsonResponse
    {
        $this->ensureManager($request);
        abort_if($taskType->tasks()->withTrashed()->exists(), 422, 'Loại nhiệm vụ đã được dùng cho công việc. Hãy ngưng sử dụng thay vì xóa.');
        $taskType->delete();

        return response()->json(['message' => 'Đã xóa loại nhiệm vụ.']);
    }

    private function validateType(Request $request, ?TaskCategory $type = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('task_categories', 'name')->ignore($type?->id)],
            'description' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
        ], [
            'name.required' => 'Vui lòng nhập tên loại nhiệm vụ.',
            'name.unique' => 'Tên loại nhiệm vụ đã tồn tại.',
        ]);
    }

    private function ensureManager(Request $request): void
    {
        abort_unless($request->user()->isSchoolWide() && $request->user()->hasPermission('tasks.assign'), 403, 'Chỉ người giao việc toàn trường được quản lý danh mục nhiệm vụ.');
    }

    private function uniqueCode(string $name): string
    {
        $base = substr(strtoupper(Str::slug($name, '_')) ?: 'LOAI', 0, 24);
        $code = $base;
        $suffix = 1;
        while (TaskCategory::where('code', $code)->exists()) {
            $code = substr($base, 0, 20).'_'.$suffix++;
        }

        return $code;
    }
}
