<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('roles')->where('code', 'gvcn')->value('id') ?? DB::table('roles')->insertGetId([
            'code' => 'gvcn', 'name' => 'Giáo viên chủ nhiệm', 'scope' => 'self', 'is_system' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $latest = DB::table('evaluation_periods')->orderByDesc('year')->orderByDesc('month')->value('id');
        if (! $latest) {
            return;
        }
        $assigned = DB::table('role_user')->where('role_id', $roleId)->pluck('user_id');
        $users = DB::table('evaluations')->join('employees', 'employees.id', '=', 'evaluations.teacher_id')
            ->where('evaluations.period_id', $latest)->where('evaluations.is_homeroom', true)
            ->whereNotIn('employees.user_id', $assigned)->pluck('employees.user_id')->unique();
        DB::table('role_user')->insert($users->map(fn ($id) => [
            'role_id' => $roleId, 'user_id' => $id, 'department_id' => null, 'created_at' => now(), 'updated_at' => now(),
        ])->all());
    }

    public function down(): void
    {
        $roleId = DB::table('roles')->where('code', 'gvcn')->value('id');
        if ($roleId) {
            DB::table('role_user')->where('role_id', $roleId)->delete();
            DB::table('permission_role')->where('role_id', $roleId)->delete();
            DB::table('roles')->where('id', $roleId)->delete();
        }
    }
};
