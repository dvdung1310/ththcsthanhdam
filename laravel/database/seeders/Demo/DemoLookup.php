<?php

namespace Database\Seeders\Demo;

use App\Models\Department;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

trait DemoLookup
{
    private array $usersByHandle = [];

    private array $unitIds = [];

    protected function user(string $handle): User
    {
        $email = $handle === 'admin' ? config('app.admin.email') : DemoRoster::email($handle);

        return $this->usersByHandle[$handle] ??= User::with('teacher')->where('email', $email)->firstOrFail();
    }

    protected function unitId(string $name): int
    {
        return $this->unitIds[$name] ??= Department::where('name', $name)->value('id');
    }

    protected function pick(array $items): mixed
    {
        return $items[mt_rand(0, count($items) - 1)];
    }

    protected function chance(int $percent): bool
    {
        return mt_rand(1, 100) <= $percent;
    }

    protected function stamp(string $table, int $id, CarbonImmutable $at, ?CarbonImmutable $updated = null): void
    {
        DB::table($table)->where('id', $id)->update(['created_at' => $at, 'updated_at' => $updated ?? $at]);
    }

    protected function schoolYear(): string
    {
        $now = CarbonImmutable::now();
        $start = $now->month >= 8 ? $now->year : $now->year - 1;

        return $start.'-'.($start + 1);
    }
}
