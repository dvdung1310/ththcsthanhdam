<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Role;
use App\Models\Subject;
use App\Models\Employee;
use App\Models\User;
use Database\Seeders\Demo\DemoFiles;
use Database\Seeders\Demo\DemoRoster;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DemoSeeder extends Seeder
{
    private const JOINED_ON = '2025-08-01';

    public function run(): void
    {
        if (app()->isProduction()) {
            $this->command?->error('DemoSeeder không chạy trên môi trường production.');

            return;
        }

        DB::transaction(function () {
            $admin = User::where('email', config('app.admin.email'))->firstOrFail();
            $units = $this->seedUnits();
            $roles = Role::pluck('id', 'code');

            $index = 0;
            foreach (DemoRoster::people() as $handle => $person) {
                $user = $this->account($person['name'], $handle, $person['phone'], ! in_array('locked', $person['flags'], true));
                if (in_array('avatar', $person['flags'], true) && ! $user->avatar_path) {
                    $user->update(['avatar_path' => DemoFiles::avatar($handle, $index)]);
                }
                $index++;
                $employee = Employee::firstOrCreate(['user_id' => $user->id], ['employee_code' => $person['code'], 'employment_status' => $person['status']]);
                $subject = Subject::firstOrCreate(['name' => $person['subject']], ['code' => strtoupper(Str::slug($person['subject'], '_')), 'is_active' => true]);
                $startsOn = in_array('new', $person['flags'], true) ? now()->subMonths(5)->startOfMonth()->toDateString() : self::JOINED_ON;

                DB::table('department_employee')->updateOrInsert(
                    ['employee_id' => $employee->id, 'department_id' => $units[$person['unit']], 'starts_on' => $startsOn],
                    ['is_primary' => true, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()],
                );
                DB::table('employee_subject')->updateOrInsert(
                    ['employee_id' => $employee->id, 'subject_id' => $subject->id, 'starts_on' => $startsOn],
                    ['is_primary' => true, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()],
                );

                $this->assignRole($user, $roles[Role::GIAO_VIEN], null, $admin);
                if ($person['homeroom']) {
                    $this->assignRole($user, $roles[Role::GVCN], null, $admin);
                }
                foreach ($person['roles'] as [$roleCode, $roleUnit]) {
                    $this->assignRole($user, $roles[$roleCode], $roleUnit ? $units[$roleUnit] : null, $admin);
                }
            }

            foreach (DemoRoster::staff() as $handle => $person) {
                $user = $this->account($person['name'], $handle, $person['phone'], true);
                if (in_array('avatar', $person['flags'], true) && ! $user->avatar_path) {
                    $user->update(['avatar_path' => DemoFiles::avatar($handle, $index)]);
                }
                $index++;
                $employee = Employee::firstOrCreate(['user_id' => $user->id], ['employee_code' => $person['code'], 'employment_status' => $person['status']]);
                DB::table('department_employee')->updateOrInsert(
                    ['employee_id' => $employee->id, 'department_id' => $units[DemoRoster::OFFICE], 'starts_on' => self::JOINED_ON],
                    ['is_primary' => true, 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()],
                );
                $this->assignRole($user, $roles[Role::NHAN_VIEN], null, $admin);
                foreach ($person['roles'] as [$roleCode, $roleUnit]) {
                    $this->assignRole($user, $roles[$roleCode], $roleUnit ? $units[$roleUnit] : null, $admin);
                }
            }
        });

        $this->call([LibrarySeeder::class, TaskSeeder::class, LeaveSeeder::class, EvaluationHistorySeeder::class]);
    }

    private function account(string $name, string $handle, string $phone, bool $active): User
    {
        return User::firstOrCreate(['email' => DemoRoster::email($handle)], [
            'name' => $name, 'phone' => $phone, 'password' => DemoRoster::PASSWORD,
            'status' => $active ? 'active' : 'inactive', 'must_change_password' => false,
        ]);
    }

    private function seedUnits(): array
    {
        $ids = [];
        foreach ([...DemoRoster::UNITS, DemoRoster::OFFICE => []] as $toName => $groups) {
            $to = Department::firstOrCreate(['name' => $toName, 'parent_id' => null], ['code' => strtoupper(Str::slug($toName, '_')), 'type' => Department::TYPE_TO, 'is_active' => true]);
            $this->describe($to);
            $ids[$toName] = $to->id;
            foreach ($groups as $groupName) {
                $group = Department::firstOrCreate(['name' => $groupName, 'parent_id' => $to->id], ['code' => strtoupper(Str::slug($groupName, '_')), 'type' => Department::TYPE_NHOM, 'is_active' => true]);
                $this->describe($group);
                $ids[$groupName] = $group->id;
            }
        }

        return $ids;
    }

    private function describe(Department $unit): void
    {
        if (! $unit->description && isset(DemoRoster::DESCRIPTIONS[$unit->name])) {
            $unit->update(['description' => DemoRoster::DESCRIPTIONS[$unit->name]]);
        }
    }

    private function assignRole(User $user, int $roleId, ?int $unitId, User $admin): void
    {
        $exists = $user->roles()->where('roles.id', $roleId)->wherePivot('department_id', $unitId)->exists();
        if (! $exists) {
            $user->roles()->attach($roleId, ['department_id' => $unitId, 'assigned_by' => $admin->id]);
        }
    }
}
