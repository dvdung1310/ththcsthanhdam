<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const ROLES = ['giao_vien', 'gvcn', 'nhan_vien', 'to_truong', 'to_pho', 'nhom_truong'];

    private const PERMISSIONS = ['dashboard.view', 'kpi.view'];

    public function up(): void
    {
        DB::table('permission_role')
            ->whereIn('role_id', DB::table('roles')->whereIn('code', self::ROLES)->select('id'))
            ->whereIn('permission_id', DB::table('permissions')->whereIn('code', self::PERMISSIONS)->select('id'))
            ->delete();
    }

    public function down(): void
    {
        $roles = DB::table('roles')->whereIn('code', array_diff(self::ROLES, ['gvcn']))->pluck('id');
        $permissions = DB::table('permissions')->whereIn('code', self::PERMISSIONS)->pluck('id');
        foreach ($roles as $role) {
            foreach ($permissions as $permission) {
                DB::table('permission_role')->insertOrIgnore(['role_id' => $role, 'permission_id' => $permission]);
            }
        }
    }
};
