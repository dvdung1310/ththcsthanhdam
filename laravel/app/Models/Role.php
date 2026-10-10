<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    public const ADMIN = 'admin';
    public const HIEU_TRUONG = 'hieu_truong';
    public const PHO_HIEU_TRUONG = 'pho_hieu_truong';
    public const BAN_GIAM_HIEU = 'ban_giam_hieu';
    public const THU_KY = 'thu_ky';
    public const TO_TRUONG = 'to_truong';
    public const TO_PHO = 'to_pho';
    public const NHOM_TRUONG = 'nhom_truong';
    public const GIAO_VIEN = 'giao_vien';
    public const GVCN = 'gvcn';
    public const NHAN_VIEN = 'nhan_vien';

    public const ORDER = [
        self::ADMIN, self::HIEU_TRUONG, self::PHO_HIEU_TRUONG, self::BAN_GIAM_HIEU, self::THU_KY,
        self::TO_TRUONG, self::TO_PHO, self::NHOM_TRUONG, self::GIAO_VIEN, self::GVCN, self::NHAN_VIEN,
    ];

    public const PROFILE_ROLES = [self::GIAO_VIEN, self::NHAN_VIEN];

    public const NOT_EVALUATED = [self::ADMIN];

    public const SCHOOL_LEADERS = [self::HIEU_TRUONG, self::PHO_HIEU_TRUONG, self::BAN_GIAM_HIEU, self::THU_KY];

    public const SINGLE_HOLDER = [self::TO_TRUONG, self::NHOM_TRUONG];

    public const SCOPE_SYSTEM = 'system';
    public const SCOPE_SCHOOL = 'school';
    public const SCOPE_UNIT = 'unit';
    public const SCOPE_SELF = 'self';

    protected $fillable = ['code', 'name', 'description', 'scope', 'unit_type', 'is_system'];

    protected $casts = ['is_system' => 'boolean'];

    public function permissions() { return $this->belongsToMany(Permission::class, 'permission_role'); }
    public function users() { return $this->belongsToMany(User::class, 'role_user')->withPivot(['department_id', 'expires_at'])->withTimestamps(); }

    public static function rank(?string $code): int
    {
        $index = array_search($code, self::ORDER, true);

        return $index === false ? count(self::ORDER) : $index;
    }

    public function isSchoolWide(): bool
    {
        return in_array($this->scope, [self::SCOPE_SYSTEM, self::SCOPE_SCHOOL], true);
    }

    public function requiresUnit(): bool
    {
        return $this->scope === self::SCOPE_UNIT;
    }
}
