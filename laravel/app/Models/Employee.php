<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use SoftDeletes;

    protected $fillable = ['user_id', 'employee_code', 'employment_status'];

    public function user() { return $this->belongsTo(User::class); }
    public function departments() { return $this->belongsToMany(Department::class, 'department_employee')->withPivot(['is_primary', 'starts_on', 'ends_on'])->withTimestamps(); }
    public function subjects() { return $this->belongsToMany(Subject::class, 'employee_subject')->withPivot(['is_primary', 'starts_on', 'ends_on'])->withTimestamps(); }

    public function directUnitIds(): array
    {
        $units = $this->relationLoaded('departments')
            ? $this->departments->filter(fn ($d) => $d->pivot->ends_on === null)
            : $this->departments()->wherePivotNull('ends_on')->get();

        return $units->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    public function unitIds(): array
    {
        return Department::withAncestors($this->directUnitIds());
    }

    public function scopeInUnits(Builder $query, iterable $unitIds): Builder
    {
        $ids = Department::withDescendants($unitIds);

        return $query->whereHas('departments', fn ($d) => $d->whereIn('departments.id', $ids ?: [0])->whereNull('department_employee.ends_on'));
    }
}
