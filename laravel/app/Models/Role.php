<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    public const ADMIN = 'admin';
    public const HIEU_TRUONG = 'hieu_truong';
    public const THU_KY = 'thu_ky';
    public const TO_TRUONG = 'to_truong';
    public const TO_PHO = 'to_pho';
    public const NHOM_TRUONG = 'nhom_truong';
    public const GIAO_VIEN = 'giao_vien';

    public const SCOPE_SYSTEM = 'system';
    public const SCOPE_SCHOOL = 'school';
    public const SCOPE_UNIT = 'unit';
    public const SCOPE_SELF = 'self';

    protected $fillable = ['code', 'name', 'description', 'scope', 'unit_type', 'is_system'];

    protected $casts = ['is_system' => 'boolean'];

    public function permissions() { return $this->belongsToMany(Permission::class, 'permission_role'); }
    public function users() { return $this->belongsToMany(User::class, 'role_user')->withPivot(['department_id', 'expires_at'])->withTimestamps(); }

    public function isSchoolWide(): bool
    {
        return in_array($this->scope, [self::SCOPE_SYSTEM, self::SCOPE_SCHOOL], true);
    }

    public function requiresUnit(): bool
    {
        return $this->scope === self::SCOPE_UNIT;
    }
}
