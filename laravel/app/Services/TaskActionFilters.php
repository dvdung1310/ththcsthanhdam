<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TaskActionFilters
{
    public function apply($query, Request $request, callable $reviewScope): void
    {
        $request->validate([
            'deadline' => ['nullable', 'in:today,tomorrow,next7,soon,overdue,custom'],
            'action' => ['nullable', 'in:not_started,in_progress,soon,overdue,my_review'],
            'assigned_from' => ['nullable', 'date'], 'assigned_to' => $request->filled('assigned_from') ? ['nullable', 'date', 'after_or_equal:assigned_from'] : ['nullable', 'date'],
            'due_from' => ['nullable', 'date'], 'due_to' => $request->filled('due_from') ? ['nullable', 'date', 'after_or_equal:due_from'] : ['nullable', 'date'],
            'progress_min' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'progress_max' => $request->filled('progress_min') ? ['nullable', 'numeric', 'min:0', 'max:100', 'gte:progress_min'] : ['nullable', 'numeric', 'min:0', 'max:100'],
            'late' => ['nullable', 'in:yes,no'],
        ]);
        foreach (['teacher_id', 'created_by', 'task_catalog_item_id'] as $key) {
            if ($id = $request->integer($key)) {
                $key === 'teacher_id'
                    ? $query->where(fn ($q) => $q->whereHas('teachers', fn ($t) => $t->where('teachers.id', $id))->orWhereHas('departments', fn ($d) => $d->whereIn('departments.id', DB::table('teacher_department')->where('teacher_id', $id)->whereNull('ends_on')->select('department_id'))))
                    : $query->where($key, $id);
            }
        }
        if ($id = $request->integer('organization_id')) {
            $query->where(fn ($q) => $q->whereHas('departments', fn ($d) => $d->where('departments.id', $id))->orWhereHas('teachers', fn ($t) => $t->whereHas('departments', fn ($d) => $d->where('departments.id', $id)->whereNull('teacher_department.ends_on'))));
        }
        foreach (['review_status', 'receipt_status'] as $key) {
            if ($value = $request->string($key)->toString()) {
                $query->where($key === 'receipt_status' ? 'status' : $key, $value);
            }
        }
        foreach (['assigned' => 'created_at', 'due' => 'due_at'] as $prefix => $column) {
            if ($value = $request->input($prefix.'_from')) {
                $query->where($column, '>=', Carbon::parse($value)->startOfDay());
            }
            if ($value = $request->input($prefix.'_to')) {
                $query->where($column, '<', Carbon::parse($value)->startOfDay()->addDay());
            }
        }
        $progress = '(SELECT COALESCE(AVG(progress_percent), 0) FROM task_teacher_assignees WHERE task_id = tasks.id)';
        if ($request->filled('progress_min')) {
            $query->whereRaw($progress.' >= ?', [(float) $request->input('progress_min')]);
        }
        if ($request->filled('progress_max')) {
            $query->whereRaw($progress.' <= ?', [(float) $request->input('progress_max')]);
        }
        $action = $request->string('action')->toString();
        if (in_array($action, ['not_started', 'in_progress'])) {
            $query->where('status', $action);
        }
        if ($action === 'my_review') {
            $reviewScope($query);
        }
        $deadline = in_array($action, ['soon', 'overdue']) ? $action : $request->string('deadline')->toString();
        if (in_array($deadline, ['soon', 'overdue'])) {
            $query->whereNotIn('status', ['completed', 'cancelled']);
            $deadline === 'overdue' ? $query->where('due_at', '<', now()) : $query->where('due_at', '>=', now())->where('due_at', '<=', now()->addDay());
        } elseif (in_array($deadline, ['today', 'tomorrow', 'next7'])) {
            $from = now()->startOfDay();
            if ($deadline === 'tomorrow') {
                $from->addDay();
            }
            $query->where('due_at', '>=', $from)->where('due_at', '<', $from->copy()->addDays($deadline === 'next7' ? 7 : 1));
        }
        if ($late = $request->input('late')) {
            $condition = "((tasks.status NOT IN ('completed','cancelled') AND tasks.due_at < ?) OR EXISTS (SELECT 1 FROM task_submissions s WHERE s.task_id = tasks.id AND s.submitted_at > tasks.due_at) OR (tasks.status = 'completed' AND NOT EXISTS (SELECT 1 FROM task_submissions s WHERE s.task_id = tasks.id) AND tasks.completed_at > tasks.due_at))";
            $query->whereRaw(($late === 'no' ? 'NOT ' : '').$condition, [now()]);
        }
    }
}
