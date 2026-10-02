<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call(TeacherSeeder::class);
        $this->call(DocumentSeeder::class);
        $this->call(TaskSeeder::class);
        $this->call(RolePermissionSeeder::class);
    }
}
