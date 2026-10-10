<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Evaluation;
use App\Models\EvaluationCriterion;
use App\Models\EvaluationPeriod;
use App\Models\EvaluationTemplate;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class EvaluationTemplateController extends Controller
{
    private const PEOPLE = ['creator:id,name,avatar_path', 'editor:id,name,avatar_path', 'activator:id,name,avatar_path'];

    public function index(): JsonResponse
    {
        $templates = EvaluationTemplate::with(['criteria', ...self::PEOPLE])->orderByDesc('is_active')->orderByDesc('updated_at')->get();

        return response()->json([
            'data' => $templates->map(fn (EvaluationTemplate $template) => $this->summary($template))->values(),
            'audiences' => collect(EvaluationTemplate::AUDIENCES)->map(fn ($label, $value) => ['value' => $value, 'label' => $label, 'scorer_label' => EvaluationTemplate::SCORER_LABELS[$value]])->values(),
        ]);
    }

    public function show(EvaluationTemplate $template): JsonResponse
    {
        return response()->json(['data' => $this->detail($template)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('evaluation_templates', 'name')],
            'description' => ['nullable', 'string', 'max:2000'],
            'copy_from_id' => ['nullable', 'integer', 'exists:evaluation_templates,id'],
            'audience' => ['nullable', Rule::in(array_keys(EvaluationTemplate::AUDIENCES))],
        ], ['name.unique' => 'Đã có bộ tiêu chí mang tên này.']);
        $source = isset($data['copy_from_id']) ? EvaluationTemplate::with('criteria')->find($data['copy_from_id']) : null;
        $data['audience'] = $data['audience'] ?? $source?->audience ?? EvaluationTemplate::TEACHER;

        $template = DB::transaction(function () use ($data, $source, $request) {
            $template = EvaluationTemplate::create([
                'name' => trim($data['name']), 'audience' => $data['audience'], 'description' => $data['description'] ?? $source?->description,
                'is_active' => false, 'grades' => $source?->grades ?? [], 'created_by' => $request->user()->id, 'updated_by' => $request->user()->id,
            ]);
            if ($source) {
                $ids = [];
                foreach ($source->criteria->sortBy(fn ($c) => [$c->parent_id === null ? 0 : 1, $c->position]) as $criterion) {
                    $copy = $criterion->replicate(['template_id', 'parent_id']);
                    $copy->template_id = $template->id;
                    $copy->parent_id = $criterion->parent_id ? $ids[$criterion->parent_id] : null;
                    $copy->save();
                    $ids[$criterion->id] = $copy->id;
                }
            }

            return $template;
        });

        return response()->json(['message' => $source ? "Đã nhân bản thành “{$template->name}”." : "Đã tạo bộ tiêu chí “{$template->name}”.", 'data' => $this->detail($template)], 201);
    }

    public function update(Request $request, EvaluationTemplate $template): JsonResponse
    {
        $actor = $request->user();
        $locked = $this->used($template);
        $rules = [
            'name' => ['required', 'string', 'max:255', Rule::unique('evaluation_templates', 'name')->ignore($template->id)],
            'description' => ['nullable', 'string', 'max:2000'],
        ];
        if (! $locked) {
            $rules += [
                'grades' => ['present', 'array', 'max:10'],
                'grades.*.code' => ['required', 'string', 'max:20', 'distinct'],
                'grades.*.name' => ['required', 'string', 'max:100'],
                'grades.*.homeroom_min' => ['required', 'numeric', 'min:0'],
                'grades.*.regular_min' => ['required', 'numeric', 'min:0'],
                'grades.*.clean_required' => ['boolean'],
                'grades.*.requires_no_zero' => ['boolean'],
                'grades.*.condition' => ['nullable', 'string', 'max:500'],
                'sections' => ['present', 'array', 'max:20'],
                'sections.*.code' => ['required', 'string', 'max:10'],
                'sections.*.title' => ['required', 'string', 'max:255'],
                'sections.*.max_score' => ['required', 'numeric', 'min:0', 'max:1000'],
                'sections.*.kind' => ['required', Rule::in([EvaluationCriterion::SCORE, EvaluationCriterion::BONUS])],
                'sections.*.homeroom_only' => ['boolean'],
                'sections.*.criteria' => ['present', 'array', 'max:50'],
                'sections.*.criteria.*.code' => ['required', 'string', 'max:10'],
                'sections.*.criteria.*.title' => ['required', 'string', 'max:255'],
                'sections.*.criteria.*.guidance' => ['nullable', 'string', 'max:10000'],
                'sections.*.criteria.*.max_score' => ['required', 'numeric', 'min:0', 'max:1000'],
                'sections.*.criteria.*.requires_evidence' => ['boolean'],
                'sections.*.criteria.*.tracks_leave' => ['boolean'],
            ];
        }
        $data = $request->validate($rules, [
            'name.unique' => 'Đã có bộ tiêu chí mang tên này.',
            'grades.*.code.distinct' => 'Mã xếp loại bị trùng.',
            'sections.*.title.required' => 'Mục nào cũng cần tên.',
            'sections.*.criteria.*.title.required' => 'Tiêu chí nào cũng cần tên.',
        ]);

        DB::transaction(function () use ($template, $data, $locked, $actor) {
            $template->update(['name' => trim($data['name']), 'description' => $data['description'] ?? null, 'updated_by' => $actor->id] + ($locked ? [] : ['grades' => array_values($data['grades'])]));
            $template->touch();
            if ($locked) {
                return;
            }
            $template->criteria()->whereNotNull('parent_id')->delete();
            $template->criteria()->delete();
            foreach (array_values($data['sections']) as $position => $section) {
                $parent = $this->createCriterion($template, null, $section, $section['kind'], (bool) ($section['homeroom_only'] ?? false), $position);
                foreach (array_values($section['criteria']) as $childPosition => $criterion) {
                    $this->createCriterion($template, $parent, $criterion, $section['kind'], (bool) ($section['homeroom_only'] ?? false), $childPosition);
                }
            }
        });

        return response()->json(['message' => $locked ? 'Đã lưu tên và mô tả. Bộ đã dùng cho kỳ đánh giá nên không sửa được tiêu chí.' : 'Đã lưu bộ tiêu chí.', 'data' => $this->detail($template->fresh())]);
    }

    public function activate(Request $request, EvaluationTemplate $template): JsonResponse
    {
        $problems = $this->problems($template->load('criteria'));
        abort_if($problems, 422, 'Chưa áp dụng được: '.implode(' ', $problems));
        DB::transaction(function () use ($template, $request) {
            DB::table('evaluation_templates')->where('audience', $template->audience)->where('id', '!=', $template->id)->update(['is_active' => false]);
            DB::table('evaluation_templates')->where('id', $template->id)->update(['is_active' => true, 'activated_by' => $request->user()->id, 'activated_at' => now()]);
        });

        return response()->json(['message' => "Đã áp dụng “{$template->name}” cho phiếu ".($template->audience === EvaluationTemplate::LEADERSHIP ? 'Ban giám hiệu' : mb_strtolower(EvaluationTemplate::AUDIENCES[$template->audience]))." từ các kỳ mở sau.", 'data' => $this->detail($template->fresh())]);
    }

    public function destroy(EvaluationTemplate $template): JsonResponse
    {
        abort_if($template->is_active, 422, 'Không thể xóa bộ tiêu chí đang áp dụng.');
        abort_if($this->used($template), 422, 'Bộ tiêu chí đã dùng cho kỳ đánh giá nên không xóa được.');
        DB::transaction(function () use ($template) {
            $template->criteria()->whereNotNull('parent_id')->delete();
            $template->criteria()->delete();
            $template->delete();
        });

        return response()->json(['message' => 'Đã xóa bộ tiêu chí.']);
    }

    private function createCriterion(EvaluationTemplate $template, ?EvaluationCriterion $parent, array $row, string $kind, bool $homeroomOnly, int $position): EvaluationCriterion
    {
        return EvaluationCriterion::create([
            'template_id' => $template->id, 'parent_id' => $parent?->id, 'code' => trim($row['code']), 'title' => trim($row['title']),
            'guidance' => $parent ? (trim((string) ($row['guidance'] ?? '')) ?: null) : null,
            'max_score' => $row['max_score'], 'kind' => $kind, 'homeroom_only' => $homeroomOnly,
            'requires_evidence' => $parent ? (bool) ($row['requires_evidence'] ?? false) : false,
            'tracks_leave' => $parent ? (bool) ($row['tracks_leave'] ?? false) : false, 'position' => $position,
        ]);
    }

    private function problems(EvaluationTemplate $template): array
    {
        $sections = $template->criteria->whereNull('parent_id');
        $problems = [];
        if ($sections->where('kind', EvaluationCriterion::SCORE)->isEmpty()) {
            $problems[] = 'Cần ít nhất một mục chấm điểm.';
        }
        if (empty($template->grades)) {
            $problems[] = 'Cần khai báo khung xếp loại.';
        }
        foreach ($sections as $section) {
            $children = $template->criteria->where('parent_id', $section->id);
            if ($children->isEmpty()) {
                $problems[] = "Mục {$section->code} chưa có tiêu chí.";
            } elseif ($section->kind === EvaluationCriterion::SCORE && abs($children->sum(fn ($c) => (float) $c->max_score) - (float) $section->max_score) > 0.001) {
                $problems[] = "Tổng điểm các tiêu chí mục {$section->code} chưa bằng {$this->number($section->max_score)}.";
            }
        }

        return $problems;
    }

    private function summary(EvaluationTemplate $template): array
    {
        $template->loadMissing(['criteria', ...self::PEOPLE]);
        $sections = $template->criteria->whereNull('parent_id');
        $score = $sections->where('kind', EvaluationCriterion::SCORE);
        $periods = $this->usedPeriods($template);

        return [
            'id' => $template->id, 'name' => $template->name, 'description' => $template->description, 'is_active' => $template->is_active,
            'audience' => $template->audience, 'audience_label' => EvaluationTemplate::AUDIENCES[$template->audience] ?? $template->audience,
            'scorer_label' => EvaluationTemplate::SCORER_LABELS[$template->audience] ?? 'Tổ chấm',
            'sections_count' => $sections->count(),
            'criteria_count' => $template->criteria->whereNotNull('parent_id')->count(),
            'totals' => [
                'homeroom' => (float) $score->sum('max_score'),
                'regular' => (float) $score->where('homeroom_only', false)->sum('max_score'),
                'bonus' => (float) $sections->where('kind', EvaluationCriterion::BONUS)->sum('max_score'),
            ],
            'periods_count' => $periods->count(),
            'periods' => $periods->map(fn ($period) => ['id' => $period->id, 'label' => $period->label(), 'status' => $period->status])->values(),
            'created_by' => $this->person($template->creator), 'created_at' => $template->created_at?->toIso8601String(),
            'updated_by' => $this->person($template->editor), 'updated_at' => $template->updated_at?->toIso8601String(),
            'activated_by' => $this->person($template->activator), 'activated_at' => $template->activated_at?->toIso8601String(),
        ];
    }

    private function detail(EvaluationTemplate $template): array
    {
        $template->load(['criteria', ...self::PEOPLE]);
        $criteria = $template->criteria;
        $sections = $criteria->whereNull('parent_id')->sortBy('position')->values();

        return [
            ...$this->summary($template),
            'locked' => $this->used($template),
            'grades' => $template->grades ?? [],
            'problems' => $this->problems($template),
            'sections' => $sections->map(fn (EvaluationCriterion $section) => [
                'id' => $section->id, 'code' => $section->code, 'title' => $section->title, 'max_score' => (float) $section->max_score,
                'kind' => $section->kind, 'homeroom_only' => $section->homeroom_only,
                'criteria' => $criteria->where('parent_id', $section->id)->sortBy('position')->values()->map(fn (EvaluationCriterion $criterion) => [
                    'id' => $criterion->id, 'code' => $criterion->code, 'title' => $criterion->title, 'guidance' => $criterion->guidance,
                    'max_score' => (float) $criterion->max_score, 'requires_evidence' => $criterion->requires_evidence, 'tracks_leave' => $criterion->tracks_leave,
                ]),
            ]),
        ];
    }

    private function usedPeriods(EvaluationTemplate $template)
    {
        return EvaluationPeriod::where('template_id', $template->id)
            ->orWhereIn('id', Evaluation::where('template_id', $template->id)->select('period_id'))
            ->orderBy('year')->orderBy('month')->get();
    }

    private function used(EvaluationTemplate $template): bool
    {
        return Evaluation::where('template_id', $template->id)->exists()
            || ($template->audience === EvaluationTemplate::TEACHER && EvaluationPeriod::where('template_id', $template->id)->exists());
    }

    private function person(?User $user): ?array
    {
        return $user ? ['id' => $user->id, 'name' => $user->name, 'avatar_url' => $user->avatar_path ? route('avatars.show', ['filename' => basename($user->avatar_path)]) : null] : null;
    }

    private function number($value): string
    {
        return rtrim(rtrim(number_format((float) $value, 2, ',', ''), '0'), ',');
    }
}
