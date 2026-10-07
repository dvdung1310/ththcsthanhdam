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

Builds on the production data and adds a school of about 50 people. Every demo password is `Teacher@123`.

- **Units:** Tổ Tự nhiên and Tổ Xã hội with 9 subject groups, Tổ Khối 1–5 for primary classes, and Tổ Năng khiếu.
- **People:** 47 teachers (`GV001`–`GV047`) and 2 secretaries.
  - Every unit has a leader; larger units also have deputies and group leaders, and some people hold two roles.
  - Some teachers are on leave or new this year, one is suspended with a locked account, and about a third have a photo.
  - The principal is `mai.nt@thanhdam.edu.vn` and the secretary is `trang.tt@…`. Leaders include `nam.tv@…`, `ha.pt@…` and `loan.nt@…`; teachers include `huong.vt@…` and `hang.ntt@…`. Logins are the given name plus the initials of the other names.
- **Tasks:** about 190 tasks over the last 12 months, assigned to the whole school, a unit, a group or individuals, plus personal tasks.
  - Current tasks cover every status: not started, in progress, overdue, waiting for approval, needing revision, completed and cancelled.
  - Tasks have submissions with several versions, revisions, edits before review and approvals, discussions mixed with activity entries, deadline changes, attachments and linked library files.
  - Some tasks hide submissions between assignees. Reminders and unread notifications are included.
- **Library:** about 180 items, including guidance documents, a folder per unit with plans, minutes and exam papers per group, awards records, teaching initiatives and some personal folders.
  - Files are small generated PDF, PNG, TXT, CSV, DOCX and XLSX files, with shares to everyone, to units and to individuals.
- **Evaluations:** monthly evaluations for every teacher for the last 12 months, counted back from the day you seed and skipping June and July:
  - older months are published;
  - last month is waiting for explanations;
  - the current month is open, with draft, submitted, unit-scored and approved sheets.

  Each teacher has a stable quality profile derived from the roster, with deduction notes, bonuses, violations, an unranked month, and teachers who were absent or joined mid-year.

The demo data lives in `database/seeders/Demo/` (`DemoRoster` for people and units, `TaskCatalog` for task texts). Tasks and library items are only seeded into an empty database.

```bash
# local machine (.env: APP_ENV=local); this wipes the database
php artisan migrate:fresh --seed

# keep existing data and only add what is missing (months that already have a period are skipped)
php artisan db:seed

# demo server (.env: APP_ENV=staging, SEED_DEMO=true)
php artisan migrate:fresh --seed --force
```
