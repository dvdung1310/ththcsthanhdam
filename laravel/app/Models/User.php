<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;

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

    private ?Collection $activeRolesCache = null;

    public function roles() { return $this->belongsToMany(Role::class, 'role_user')->withPivot(['department_id', 'expires_at', 'assigned_by'])->withTimestamps(); }
    public function teacher() { return $this->hasOne(Teacher::class); }

    public function activeRoles(): Collection
    {
        return $this->activeRolesCache ??= $this->roles()->with('permissions')
            ->where(fn ($q) => $q->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now()))
            ->get();
    }

    public function flushAccessCache(): void
    {
        $this->activeRolesCache = null;
        $this->unsetRelation('roles');
    }

    public function hasRole(string ...$codes): bool
    {
        return $this->activeRoles()->whereIn('code', $codes)->isNotEmpty();
    }

    public function permissionCodes(): Collection
    {
        return $this->activeRoles()->flatMap->permissions->pluck('code')->unique()->values();
    }

    public function hasPermission(string $permission): bool
    {
        return $this->permissionCodes()->contains($permission);
    }

    public function isSchoolWide(): bool
    {
        return $this->activeRoles()->contains(fn (Role $role) => $role->isSchoolWide());
    }

    public function accessScope(): string
    {
        if ($this->isSchoolWide()) {
            return 'school';
        }

        return $this->managedUnitIds() ? 'unit' : 'self';
    }

    public function managedUnitIds(): ?array
    {
        if ($this->isSchoolWide()) {
            return null;
        }
        $ids = $this->activeRoles()->filter(fn (Role $role) => $role->requiresUnit())
            ->pluck('pivot.department_id')->filter();

        return Department::withDescendants($ids);
    }

    public function memberUnitIds(): array
    {
        return $this->teacher?->unitIds() ?? [];
    }

    public function roleLabels(): array
    {
        return $this->activeRoles()
            ->sortBy(fn (Role $role) => array_search($role->code, [Role::ADMIN, Role::HIEU_TRUONG, Role::THU_KY, Role::TO_TRUONG, Role::TO_PHO, Role::NHOM_TRUONG, Role::GIAO_VIEN], true))
            ->map(fn (Role $role) => $role->pivot->department_id ? $role->name.' — '.Department::pathLabel((int) $role->pivot->department_id) : $role->name)
            ->values()->all();
    }
}
