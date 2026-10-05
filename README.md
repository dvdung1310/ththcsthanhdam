# TH-THCS Thanh Đàm

Internal management system for TH & THCS Thanh Đàm: personnel and organisation structure, task assignment, data library and monthly teacher competition evaluation.

- `laravel/` — Laravel 12 API
- `react/` — React 19 + Vite SPA

## Requirements

- PHP 8.2+ with the `intl` (Vietnamese name sorting) and `zip` (Excel export) extensions
- Composer, Node.js 20+
- MySQL 8
- `laravel/storage` must be writable; seeding and uploads store files there

## Setup

```bash
cd laravel
composer install
cp .env.example .env
php artisan key:generate
# set DB_*, ADMIN_EMAIL, ADMIN_PASSWORD and SEED_DEMO in .env

cd ../react
npm install
npm run dev
```

## Upload limits

The app accepts files up to 20 MB each. PHP's defaults (`upload_max_filesize=2M`, `post_max_size=8M`) reject larger files before they reach Laravel. Use the settings in `laravel/deploy/php/uploads.ini`:

```ini
upload_max_filesize = 20M
post_max_size = 100M
max_file_uploads = 20
memory_limit = 256M
```

- Local (`php artisan serve`): `export PHP_INI_SCAN_DIR=":$PWD/laravel/deploy/php"` before starting the server.
- Production: copy the file into PHP-FPM's `conf.d` (e.g. `/etc/php/8.3/fpm/conf.d/99-uploads.ini`) and restart PHP-FPM. With nginx, also set `client_max_body_size 100m;`.

`GET /api/upload-limits` returns the effective limits. The UI checks files against them before uploading.

## Database seeding

`DatabaseSeeder` always runs `ProductionSeeder`. It runs `DemoSeeder` only when `APP_ENV=local` or `SEED_DEMO=true`. Every seeder is idempotent: running it again does not duplicate data.

### Production

Seeds only what the system needs to run:

- 17 permissions. Permissions removed from the catalogue are deleted, and permissions added in a release are granted once to the default roles.
- 7 system roles: Admin, Principal, Secretary, Unit leader, Unit deputy, Group leader, Teacher.
- The admin account from `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. If the password is empty, a random one is generated and printed once. The admin must change it at first sign-in.
- 6 task categories.
- The "Chia sẻ chung" library folder, readable by the whole school.
- The default monthly evaluation template, created only when no template exists.

The school enters units, people, tasks, evaluation periods and files in the app.

```bash
# .env: APP_ENV=production, SEED_DEMO=false
php artisan migrate --force
php artisan db:seed --force
```

`db:seed --force` is safe to run on every deploy. `DemoSeeder` refuses to run when `APP_ENV=production`.

### Demo

Builds on the production data and adds:

- 2 units with 5 groups, 12 teachers and 1 secretary (e.g. `mai.nt@thanhdam.edu.vn`, `nam.tv@…`, `huy.nd@…`). Every demo password is `Teacher@123`.
- 15 current tasks, plus about 2 completed tasks per month for the last 12 months, with some late completions and a few cancelled tasks.
- Sample library folders and files.
- Monthly evaluations for the last 12 months, counted back from the day you seed and skipping June and July:
  - older months are published;
  - last month is waiting for explanations;
  - the current month is open, with draft, submitted, unit-scored and approved sheets.

  Teachers have stable quality profiles, deduction notes, bonuses, violations, an unranked month, and teachers who were absent or joined mid-year.

```bash
# local machine (.env: APP_ENV=local); this wipes the database
php artisan migrate:fresh --seed

# keep existing data and only add what is missing (months that already have a period are skipped)
php artisan db:seed

# demo server (.env: APP_ENV=staging, SEED_DEMO=true)
php artisan migrate:fresh --seed --force
```
