<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const GRANT = ['nhan_vien' => ['evaluation.view'], 'thu_ky' => ['tasks.update']];

    private const REVOKE = ['to_truong' => ['personnel.manage'], 'to_pho' => ['personnel.manage'], 'nhom_truong' => ['personnel.manage']];

    public function up(): void
    {
        $this->each(self::GRANT, fn ($role, $permission) => DB::table('permission_role')->insertOrIgnore(['role_id' => $role, 'permission_id' => $permission]));
        $this->each(self::REVOKE, fn ($role, $permission) => DB::table('permission_role')->where(['role_id' => $role, 'permission_id' => $permission])->delete());
    }

    public function down(): void
    {
        $this->each(self::GRANT, fn ($role, $permission) => DB::table('permission_role')->where(['role_id' => $role, 'permission_id' => $permission])->delete());
        $this->each(self::REVOKE, fn ($role, $permission) => DB::table('permission_role')->insertOrIgnore(['role_id' => $role, 'permission_id' => $permission]));
    }

    private function each(array $map, callable $apply): void
    {
        foreach ($map as $roleCode => $codes) {
            $role = DB::table('roles')->where('code', $roleCode)->value('id');
            foreach (DB::table('permissions')->whereIn('code', $codes)->pluck('id') as $permission) {
                if ($role) {
                    $apply($role, $permission);
                }
            }
        }
    }
};
