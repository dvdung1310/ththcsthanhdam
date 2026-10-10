<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EvaluationTemplate extends Model
{
    public const TEACHER = 'teacher';
    public const STAFF = 'staff';
    public const LEADERSHIP = 'leadership';

    public const AUDIENCES = [self::TEACHER => 'Giáo viên', self::STAFF => 'Nhân viên', self::LEADERSHIP => 'Ban giám hiệu'];

    public const SCORER_LABELS = [self::TEACHER => 'Tổ chấm', self::STAFF => 'BGH đánh giá', self::LEADERSHIP => 'BGH đánh giá'];

    protected $fillable = ['name', 'audience', 'description', 'is_active', 'grades', 'created_by', 'updated_by', 'activated_by', 'activated_at'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'grades' => 'array', 'activated_at' => 'datetime'];
    }

    public function criteria() { return $this->hasMany(EvaluationCriterion::class, 'template_id')->orderBy('position'); }
    public function sections() { return $this->criteria()->whereNull('parent_id'); }
    public function periods() { return $this->hasMany(EvaluationPeriod::class, 'template_id'); }
    public function evaluations() { return $this->hasMany(Evaluation::class, 'template_id'); }

    public static function audienceOf(?User $user): string
    {
        $codes = $user?->activeRoles()->pluck('code') ?? collect();

        return match (true) {
            $codes->contains(Role::BAN_GIAM_HIEU) => self::LEADERSHIP,
            $codes->contains(Role::NHAN_VIEN) => self::STAFF,
            default => self::TEACHER,
        };
    }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function editor() { return $this->belongsTo(User::class, 'updated_by'); }
    public function activator() { return $this->belongsTo(User::class, 'activated_by'); }
}
