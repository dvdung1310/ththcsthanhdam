<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\LatePenaltyRule;
use App\Models\TaskCatalogItem;
use App\Models\TaskGroup;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskConfigurationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'groups' => TaskGroup::orderBy('code')->get(),
            'catalog_items' => TaskCatalogItem::with(['group:id,code,name,maximum_score', 'department:id,name', 'users:id,name'])->latest()->get(),
            'departments' => Department::ordered()->map(fn ($unit) => ['id' => $unit['id'], 'name' => $unit['label']])->values(),
            'users' => User::where('status', 'active')->orderBy('name')->get(['id', 'name']),
            'late_penalty_rules' => LatePenaltyRule::orderBy('from_day')->get(),
        ]);
    }

    public function storeLatePenaltyRule(Request $request): JsonResponse
    {
        $rule = LatePenaltyRule::create($this->validateLatePenaltyRule($request));
        return response()->json(['message' => 'Đã thêm mức trừ điểm hoàn thành muộn.', 'data' => $rule], 201);
    }

    public function updateLatePenaltyRule(Request $request, LatePenaltyRule $latePenaltyRule): JsonResponse
    {
        $latePenaltyRule->update($this->validateLatePenaltyRule($request, $latePenaltyRule));
        return response()->json(['message' => 'Đã cập nhật mức trừ điểm hoàn thành muộn.', 'data' => $latePenaltyRule]);
    }

    public function destroyLatePenaltyRule(Request $request, LatePenaltyRule $latePenaltyRule): JsonResponse
    {
        $latePenaltyRule->delete();
        return response()->json(['message' => 'Đã xóa mức trừ điểm hoàn thành muộn.']);
    }

    public function storeGroup(Request $request): JsonResponse
    {
        $group = TaskGroup::create($this->validateGroup($request));
        return response()->json(['message' => 'Đã thêm phân nhóm nhiệm vụ.', 'data' => $group], 201);
    }

    public function updateGroup(Request $request, TaskGroup $taskGroup): JsonResponse
    {
        $taskGroup->update($this->validateGroup($request, $taskGroup));
        return response()->json(['message' => 'Đã cập nhật phân nhóm nhiệm vụ.', 'data' => $taskGroup]);
    }

    public function destroyGroup(Request $request, TaskGroup $taskGroup): JsonResponse
    {
        if ($taskGroup->catalogItems()->exists()) return response()->json(['message' => 'Nhóm đang được sử dụng trong danh mục nhiệm vụ.'], 422);
        $taskGroup->delete();
        return response()->json(['message' => 'Đã xóa phân nhóm nhiệm vụ.']);
    }

    public function storeItem(Request $request): JsonResponse
    {
        $data = $this->validateItem($request);
        $userIds = $data['user_ids'] ?? [];
        unset($data['user_ids']);
        $item = TaskCatalogItem::create($data);
        $item->users()->sync($userIds);
        return response()->json(['message' => 'Đã thêm nhiệm vụ vào danh mục.', 'data' => $item], 201);
    }

    public function updateItem(Request $request, TaskCatalogItem $taskCatalogItem): JsonResponse
    {
        $data = $this->validateItem($request);
        $userIds = $data['user_ids'] ?? [];
        unset($data['user_ids']);
        $taskCatalogItem->update($data);
        $taskCatalogItem->users()->sync($userIds);
        return response()->json(['message' => 'Đã cập nhật nhiệm vụ.', 'data' => $taskCatalogItem]);
    }

    public function destroyItem(Request $request, TaskCatalogItem $taskCatalogItem): JsonResponse
    {
        $taskCatalogItem->delete();
        return response()->json(['message' => 'Đã xóa nhiệm vụ khỏi danh mục.']);
    }

    private function validateGroup(Request $request, ?TaskGroup $group = null): array
    {
        return $request->validate([
            'code' => ['required', 'string', 'max:30', Rule::unique('task_groups')->ignore($group?->id)],
            'name' => ['required', 'string', 'max:255'],
            'task_nature' => ['nullable', 'string', 'max:255'],
            'product_characteristics' => ['nullable', 'string', 'max:2000'],
            'maximum_score' => ['required', 'numeric', 'min:0'],
        ]);
    }


    private function validateItem(Request $request): array
    {
        $data = $request->validate([
            'scope' => ['required', Rule::in(['school', 'department'])],
            'name' => ['required', 'string', 'max:255'],
            'product_type' => ['required', 'string', 'max:255'],
            'task_group_id' => ['required', 'exists:task_groups,id'],
            'score' => ['required', 'numeric', 'min:0'],
            'conversion_factor' => ['required', 'numeric', 'min:0'],
            'publication_status' => ['required', Rule::in(['draft', 'published', 'inactive'])],
            'department_id' => ['nullable', 'exists:departments,id'],
            'user_id' => ['nullable', 'exists:users,id'],
            'user_ids' => ['nullable', 'array'],
            'user_ids.*' => ['integer', 'exists:users,id'],
        ]);
        $group = TaskGroup::findOrFail($data['task_group_id']);
        abort_if($data['score'] > $group->maximum_score, 422, 'Điểm không được vượt quá điểm tối đa của phân nhóm.');
        if ($data['scope'] === 'school') { $data['department_id'] = null; $data['user_id'] = null; $data['user_ids'] = []; }
        return $data;
    }

    private function validateLatePenaltyRule(Request $request, ?LatePenaltyRule $current = null): array
    {
        $data = $request->validate([
            'from_day' => ['required', 'integer', 'min:1'],
            'to_day' => ['nullable', 'integer', 'gte:from_day'],
            'penalty_percent' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);
        $overlaps = LatePenaltyRule::query()
            ->when($current, fn ($query) => $query->whereKeyNot($current->id))
            ->where('from_day', '<=', $data['to_day'] ?? PHP_INT_MAX)
            ->where(fn ($query) => $query->whereNull('to_day')->orWhere('to_day', '>=', $data['from_day']))
            ->exists();
        abort_if($overlaps, 422, 'Khoảng ngày trễ bị trùng với một mức đã cấu hình.');
        return $data;
    }
}
