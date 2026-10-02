<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'avatar_path',
        'status',
        'api_token',
        'must_change_password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'api_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'must_change_password' => 'boolean',
        ];
    }

    public function roles() { return $this->belongsToMany(Role::class, 'role_user')->withPivot(['department_id','expires_at'])->withTimestamps(); }
    public function teacher() { return $this->hasOne(Teacher::class); }
    public function hasPermission(string $permission): bool
    {
        if ($this->isPrincipal()) return true;
        if (in_array($permission, ['teachers.manage', 'tasks.assign'], true) && $this->isDepartmentTeacherManager()) return true;
        return $this->roles()->whereHas('permissions', fn($q) => $q->where('code',$permission))->exists();
    }

    public function isPrincipal(): bool
    {
        return $this->teacher?->positions()
            ->wherePivotNull('ends_on')
            ->where('positions.code', 'HIEU_TRUONG')
            ->exists() ?? false;
    }

    public function isDepartmentTeacherManager(): bool
    {
        return $this->teacher?->positions()
            ->wherePivotNull('ends_on')
            ->whereIn('positions.name', ['Tổ trưởng', 'Tổ phó'])
            ->exists() ?? false;
    }
}
