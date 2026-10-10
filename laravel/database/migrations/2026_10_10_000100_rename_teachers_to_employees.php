<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLES = [
        'teachers' => 'employees',
        'teacher_department' => 'department_employee',
        'teacher_subject' => 'employee_subject',
        'task_teacher_assignees' => 'task_employee_assignees',
    ];

    private const COLUMNS = ['department_employee', 'employee_subject', 'task_employee_assignees', 'task_submissions', 'task_updates', 'task_reminders', 'task_status_histories'];

    private const PERMISSIONS = ['teachers.view' => 'personnel.view', 'teachers.manage' => 'personnel.manage'];

    public function up(): void
    {
        foreach (self::TABLES as $from => $to) {
            Schema::rename($from, $to);
        }
        foreach (self::COLUMNS as $table) {
            Schema::table($table, fn ($t) => $t->renameColumn('teacher_id', 'employee_id'));
        }
        foreach (self::PERMISSIONS as $from => $to) {
            DB::table('permissions')->where('code', $from)->update(['code' => $to, 'module' => 'personnel']);
        }
        DB::table('employees')->where('employee_code', 'regexp', '^GV[0-9]+$')
            ->update(['employee_code' => DB::raw("CONCAT('NS', SUBSTRING(employee_code, 3))")]);
    }

    public function down(): void
    {
        DB::table('employees')->where('employee_code', 'regexp', '^NS[0-9]+$')
            ->update(['employee_code' => DB::raw("CONCAT('GV', SUBSTRING(employee_code, 3))")]);
        foreach (self::PERMISSIONS as $from => $to) {
            DB::table('permissions')->where('code', $to)->update(['code' => $from, 'module' => 'teachers']);
        }
        foreach (self::COLUMNS as $table) {
            Schema::table($table, fn ($t) => $t->renameColumn('employee_id', 'teacher_id'));
        }
        foreach (array_reverse(self::TABLES, true) as $from => $to) {
            Schema::rename($to, $from);
        }
    }
};
