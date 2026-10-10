<?php

namespace Database\Seeders;

use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\TaskSubmission;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Notifications\TaskWorkflowNotification;
use Carbon\CarbonImmutable;
use Database\Seeders\Demo\DemoFiles;
use Database\Seeders\Demo\DemoLookup;
use Database\Seeders\Demo\DemoRoster;
use Database\Seeders\Demo\TaskCatalog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TaskSeeder extends Seeder
{
    use DemoLookup;

    private const PRIORITY_LABELS = ['low' => 'Thấp', 'normal' => 'Bình thường', 'high' => 'Cao', 'urgent' => 'Khẩn cấp'];

    private CarbonImmutable $now;

    private array $categories = [];

    private array $libraryFiles = [];

    public function run(): void
    {
        if (Task::withTrashed()->exists()) {
            $this->command?->info('Đã có công việc, bỏ qua dữ liệu mẫu công việc.');

            return;
        }
        mt_srand(20262);
        $this->now = CarbonImmutable::now()->setSecond(0);
        $this->categories = TaskCategory::pluck('id', 'name')->all();
        $shared = DB::table('library_nodes')->where('is_system', true)->whereNull('parent_id')->where('type', 'folder')->value('id');
        $this->libraryFiles = $shared ? DB::table('library_nodes')->where('type', 'file')->where('parent_id', $shared)->pluck('id')->all() : [];

        for ($ago = 11; $ago >= 1; $ago--) {
            $month = $this->now->startOfMonth()->subMonths($ago);
            $count = match ($month->month) { 7 => 0, 6 => 5, 8 => 9, default => 13 };
            for ($i = 0; $i < $count; $i++) {
                $start = $month->addDays(mt_rand(0, 24))->setTime(mt_rand(7, 16), mt_rand(0, 5) * 10);
                $state = $ago <= 2 && $this->chance(6) ? 'overdue' : ($this->chance(7) ? 'cancelled' : 'completed');
                $this->build($this->plan($this->chance(14)), $state, $start);
            }
        }

        $states = [...array_fill(0, 9, 'not_started'), ...array_fill(0, 12, 'in_progress'), ...array_fill(0, 4, 'revision'), ...array_fill(0, 4, 'overdue'),
            ...array_fill(0, 12, 'waiting'), ...array_fill(0, 13, 'completed'), ...array_fill(0, 2, 'cancelled')];
        shuffle($states);
        foreach ($states as $state) {
            $this->build($this->plan(false), $state, $this->currentStart($state));
        }
        foreach (['not_started', 'in_progress', 'in_progress', 'waiting', 'waiting', 'revision', 'completed', 'completed', 'completed', 'overdue', 'in_progress', 'completed', 'not_started', 'waiting'] as $state) {
            $this->build($this->plan(true), $state, $this->currentStart($state));
        }
    }

    private function currentStart(string $state): CarbonImmutable
    {
        $days = match ($state) {
            'not_started' => mt_rand(0, 5),
            'completed' => mt_rand(6, 24),
            'overdue' => mt_rand(10, 20),
            default => mt_rand(3, 16),
        };

        return $this->now->subDays($days)->setTime(mt_rand(7, 16), mt_rand(0, 5) * 10)->min($this->now->subHours(2));
    }

    private function plan(bool $personal): array
    {
        $templates = array_values(array_filter(TaskCatalog::TEMPLATES, fn ($template) => ($template[2] === 'personal') === $personal));
        [$title, $category, $scope, $priority, $bullets] = $this->pick($templates);
        $principal = DemoRoster::principal();
        $plan = ['title' => $title, 'category' => $category, 'priority' => $this->chance(20) ? $this->pick(array_keys(self::PRIORITY_LABELS)) : $priority,
            'bullets' => $bullets, 'employees' => [], 'units' => [], 'reviewers' => [], 'personal' => $personal, 'vars' => []];

        switch ($scope) {
            case 'school':
            case 'school-primary':
            case 'school-secondary':
                $pool = match ($scope) { 'school-primary' => DemoRoster::PRIMARY, 'school-secondary' => DemoRoster::SECONDARY, default => array_keys(DemoRoster::UNITS) };
                shuffle($pool);
                $plan['units'] = $scope === 'school' && $this->chance(40) ? array_keys(DemoRoster::UNITS) : array_slice($pool, 0, min(count($pool), mt_rand(2, 4)));
                $plan['creator'] = $this->chance(60) ? $principal : 'trang.tt';
                if ($plan['creator'] === 'trang.tt' && $this->chance(40)) {
                    $plan['reviewers'] = [$principal];
                }
                break;
            case 'to':
            case 'to-primary':
                $to = $this->pick($scope === 'to-primary' ? DemoRoster::PRIMARY : array_keys(DemoRoster::UNITS));
                $plan['units'] = [$to];
                $plan['vars']['{unit}'] = $to;
                $plan['creator'] = $this->chance(70) ? DemoRoster::leaderOf($to) : $principal;
                if ($plan['creator'] === $principal && $this->chance(60)) {
                    $plan['reviewers'] = [DemoRoster::leaderOf($to)];
                }
                break;
            case 'nhom':
                $group = $this->pick(DemoRoster::groupsWithMembers());
                $plan['units'] = [$group];
                $plan['vars']['{subject}'] = DemoRoster::people()[DemoRoster::membersOf($group)[0]]['subject'];
                $plan['creator'] = $this->chance(60) ? DemoRoster::leaderOf($group) : DemoRoster::leaderOf(DemoRoster::rootOf($group));
                break;
            case 'person':
                $to = $this->pick(array_keys(DemoRoster::UNITS));
                $plan['creator'] = $this->chance(25) ? $principal : $this->pick(DemoRoster::leadersOf($to));
                $members = array_values(array_diff(DemoRoster::membersOf($to), [$plan['creator'], $principal]));
                shuffle($members);
                $plan['employees'] = array_slice($members, 0, $this->chance(70) ? 1 : mt_rand(2, 3));
                $reviewer = DemoRoster::leaderOf($to);
                if (($plan['creator'] === $principal || $this->chance(25)) && $reviewer !== $plan['creator'] && ! in_array($reviewer, $plan['employees'], true)) {
                    $plan['reviewers'] = [$reviewer];
                }
                $plan['vars']['{subject}'] = DemoRoster::people()[$plan['employees'][0]]['subject'];
                break;
            default:
                $employee = $this->pick(array_keys(array_filter(DemoRoster::people(), fn ($person, $handle) => $person['status'] === 'working' && $handle !== $principal, ARRAY_FILTER_USE_BOTH)));
                $plan['creator'] = $employee;
                $plan['employees'] = [$employee];
                $reviewer = DemoRoster::leaderOf(DemoRoster::people()[$employee]['unit']);
                if ($reviewer !== $employee && $this->chance(50)) {
                    $plan['reviewers'] = [$reviewer];
                }
                $plan['vars']['{subject}'] = DemoRoster::people()[$employee]['subject'];
        }

        return $plan;
    }

    private function build(array $plan, string $state, CarbonImmutable $createdAt): void
    {
        $creator = $this->user($plan['creator']);
        $vars = $plan['vars'] + ['{m}' => $createdAt->month, '{w}' => mt_rand(2, 15), '{n}' => mt_rand(1, 9), '{class}' => mt_rand(6, 9).'A'.mt_rand(1, 3), '{unit}' => $plan['units'][0] ?? '', '{subject}' => ''];
        $title = Str::ucfirst(trim(strtr($plan['title'], $vars)));
        $due = $this->dueFor($state, $createdAt);
        $assignees = $this->assignees($plan);
        if (! $assignees) {
            return;
        }

        $task = Task::create([
            'code' => 'TMP-'.Str::random(8), 'title' => $title, 'description' => $this->description($title, $plan['bullets']),
            'category_id' => $this->categories[$plan['category']] ?? null, 'created_by' => $creator->id,
            'priority' => $plan['priority'], 'share_submissions' => ! ($plan['units'] || count($plan['employees']) > 1) || ! $this->chance(18),
            'status' => Task::NOT_STARTED, 'starts_at' => $createdAt, 'due_at' => $due,
        ]);
        $task->update(['code' => 'CV-'.$createdAt->format('ym').'-'.str_pad((string) $task->id, 4, '0', STR_PAD_LEFT)]);
        foreach ($plan['reviewers'] as $handle) {
            DB::table('task_reviewers')->insert(['task_id' => $task->id, 'user_id' => $this->user($handle)->id, 'created_at' => $createdAt, 'updated_at' => $createdAt]);
        }
        foreach ($plan['employees'] as $handle) {
            $task->employees()->attach($this->user($handle)->employee->id, ['assigned_by' => $creator->id, 'assigned_at' => $createdAt]);
        }
        foreach ($plan['units'] as $unit) {
            $task->departments()->attach($this->unitId($unit), ['assigned_by' => $creator->id, 'created_at' => $createdAt, 'updated_at' => $createdAt]);
        }
        if ($this->chance(25)) {
            foreach (array_slice(TaskCatalog::ATTACHMENTS, mt_rand(0, 2), mt_rand(1, 2)) as $name) {
                $this->attach($task, DemoFiles::store('task-attachments/demo', $name, $creator->id, $title), 'attachment', $createdAt);
            }
        }
        if ($this->libraryFiles && $this->chance(15)) {
            DB::table('task_library_files')->insert(['task_id' => $task->id, 'node_id' => $this->pick($this->libraryFiles)]);
        }

        $timeline = new class { public array $updates = []; public array $histories = []; };
        $this->history($timeline, null, Task::NOT_STARTED, $creator, $plan['personal'] ? 'Tự tạo công việc cá nhân' : 'Khởi tạo và giao công việc', $createdAt);
        $this->log($timeline, $creator, null, Task::NOT_STARTED, 'Đã tạo công việc.', $createdAt);
        if (! $plan['personal']) {
            $this->notify($assignees, $task, null, $createdAt, $creator);
            $this->notify($plan['reviewers'], $task, 'Bạn được chỉ định duyệt công việc: '.$title, $createdAt, $creator, 'reviewer_assigned');
        }

        $end = $this->endFor($state, $createdAt, $due);
        $span = max(3600, $end->getTimestamp() - $createdAt->getTimestamp());
        $at = fn (float $fraction) => $this->workday($createdAt->addSeconds((int) ($span * $fraction)));
        $status = Task::NOT_STARTED;

        if (! $plan['personal'] && $due && $this->chance(15) && $state !== 'not_started') {
            $newDue = $due->addDays(mt_rand(2, 5));
            $this->log($timeline, $creator, null, $status, 'Đã cập nhật công việc: hạn '.$due->format('H:i d/m/Y').' → '.$newDue->format('H:i d/m/Y').'.', $at(0.08));
            $this->notify($assignees, $task, $creator->name.' đã đổi hạn công việc '.$title.': '.$newDue->format('H:i d/m/Y').'.', $at(0.08), $creator, 'due_changed');
            $due = $newDue;
            $task->update(['due_at' => $due]);
        } elseif (! $plan['personal'] && $this->chance(8)) {
            $this->log($timeline, $creator, null, $status, 'Đã cập nhật công việc: ưu tiên Bình thường → '.self::PRIORITY_LABELS[$plan['priority']].' · sửa mô tả.', $at(0.06));
        }

        $workers = $assignees;
        shuffle($workers);
        $manager = $plan['reviewers'] ? $this->user($plan['reviewers'][0]) : $creator;

        if ($state === 'not_started') {
            $this->comments($timeline, $task, $workers, $manager, $status, $createdAt, $end, mt_rand(0, 2));
            $this->finish($task, $timeline, $status, null);

            return;
        }

        $starter = $this->user($workers[0]);
        $status = Task::IN_PROGRESS;
        $this->history($timeline, Task::NOT_STARTED, $status, $starter, 'Cập nhật trạng thái', $at(0.12));
        $this->log($timeline, $starter, $starter->employee?->id, $status, 'Đã bắt đầu thực hiện.', $at(0.12));

        if ($state === 'cancelled') {
            $this->comments($timeline, $task, $workers, $manager, $status, $at(0.15), $at(0.6), mt_rand(0, 3));
            $reason = $this->pick(TaskCatalog::CANCEL_REASONS);
            $this->history($timeline, $status, Task::CANCELLED, $creator, $reason, $at(0.7));
            $this->log($timeline, $creator, null, Task::CANCELLED, 'Hủy công việc: '.$reason, $at(0.7));
            $this->finish($task, $timeline, Task::CANCELLED, null);

            return;
        }

        $selfComplete = $plan['personal'] && ! $plan['reviewers'];
        $rounds = match ($state) {
            'completed' => $selfComplete ? 0 : ($this->chance(70) ? 1 : ($this->chance(80) ? 2 : 3)),
            'waiting', 'revision' => $this->chance(65) ? 1 : 2,
            default => 0,
        };
        $this->comments($timeline, $task, $workers, $manager, $status, $at(0.15), $at($rounds ? 0.45 : 0.95), mt_rand(0, $plan['personal'] ? 1 : 5));

        if ($selfComplete && $state === 'completed') {
            $this->history($timeline, $status, Task::COMPLETED, $starter, 'Tự đánh dấu hoàn thành', $at(1.0));
            $this->finish($task, $timeline, Task::COMPLETED, $at(1.0));

            return;
        }

        $completedAt = null;
        for ($round = 1; $round <= $rounds; $round++) {
            $last = $round === $rounds;
            $submittedAt = $at(0.45 + 0.5 * ($round - 1) / $rounds);
            $reviewAt = $last && $state === 'completed' ? $at(1.0) : $at(0.45 + 0.5 * ($round - 0.4) / $rounds);
            $submitter = $this->user($round > 1 && count($workers) > 1 && $this->chance(40) ? $workers[($round - 1) % count($workers)] : $workers[0]);
            $pending = $last && $state === 'waiting';
            $decision = $pending ? null : ($last && $state === 'revision' ? 'revision_required' : ($last ? 'approved' : 'revision_required'));
            $comment = $decision === 'revision_required' ? $this->pick(TaskCatalog::REVISION_COMMENTS) : ($decision === 'approved' && $this->chance(50) ? $this->pick(TaskCatalog::APPROVAL_COMMENTS) : null);
            $editedAt = $pending && $this->chance(20) ? $submittedAt->addMinutes(mt_rand(40, 180))->min($this->now->subMinutes(20)) : null;

            $submission = TaskSubmission::create([
                'task_id' => $task->id, 'employee_id' => $submitter->employee->id, 'version' => $round,
                'result_content' => $this->chance(85) ? $this->pick(TaskCatalog::SUBMISSION_NOTES) : null,
                'links' => $this->chance(40) ? [$this->pick(TaskCatalog::LINKS)] : [],
                'status' => $decision ?? 'submitted', 'submitted_at' => $submittedAt, 'edited_at' => $editedAt,
                'reviewed_by' => $decision ? $manager->id : null, 'reviewed_at' => $decision ? $reviewAt : null, 'review_comment' => $comment,
            ]);
            $this->stamp('task_submissions', $submission->id, $submittedAt, $editedAt ?? ($decision ? $reviewAt : $submittedAt));
            if ($this->chance(65)) {
                foreach (array_slice(TaskCatalog::SUBMISSION_FILES, mt_rand(0, 3), mt_rand(1, 2)) as $name) {
                    $this->attach($submission, DemoFiles::store('task-submissions/demo', $name, $submitter->id, $title), 'submission', $submittedAt);
                }
            }

            $this->history($timeline, $status, Task::WAITING_APPROVAL, $submitter, 'Gửi đề nghị hoàn thành', $submittedAt);
            $status = Task::WAITING_APPROVAL;
            $this->log($timeline, $submitter, $submitter->employee->id, $status, 'Đã gửi bài nộp.', $submittedAt);
            $this->notify(array_values(array_unique([$plan['creator'], ...$plan['reviewers']])), $task, $submitter->name.' đã gửi đề nghị xác nhận hoàn thành: '.$title, $submittedAt, $submitter, 'completion_submitted');
            if ($editedAt) {
                $this->log($timeline, $submitter, $submitter->employee->id, $status, 'Đã chỉnh sửa bài nộp.', $editedAt);
                $this->notify(array_values(array_unique([$plan['creator'], ...$plan['reviewers']])), $task, $submitter->name.' đã chỉnh sửa bài nộp: '.$title, $editedAt, $submitter, 'completion_updated');
            }
            if (! $decision) {
                break;
            }

            $approved = $decision === 'approved';
            $next = $approved ? Task::COMPLETED : Task::IN_PROGRESS;
            $this->history($timeline, $status, $next, $manager, $comment ?? ($approved ? 'Xác nhận hoàn thành' : 'Yêu cầu chỉnh sửa'), $reviewAt);
            $this->log($timeline, $manager, $submitter->employee->id, $next, $approved ? 'Đã xác nhận hoàn thành.' : 'Đã yêu cầu chỉnh sửa bài nộp.', $reviewAt);
            $message = ($approved ? 'Công việc đã được xác nhận hoàn thành' : 'Công việc được yêu cầu chỉnh sửa').': '.$title;
            $this->notify([$this->handleOf($submitter)], $task, $message.($comment ? '. Nhận xét: '.$comment : ''), $reviewAt, $manager, $decision);
            $status = $next;
            $completedAt = $approved ? $reviewAt : null;
            if (! $approved && ! $last) {
                $this->comments($timeline, $task, $workers, $manager, $status, $reviewAt->addMinutes(20), $at(0.45 + 0.5 * $round / $rounds), mt_rand(0, 2));
            }
        }

        if ($state === 'overdue' && $due && ! $plan['personal']) {
            foreach (array_slice($workers, 0, mt_rand(1, 2)) as $handle) {
                $sentAt = $due->addDays(1)->setTime(8, 0)->min($this->now->subHour());
                DB::table('task_reminders')->insert(['task_id' => $task->id, 'employee_id' => $this->user($handle)->employee->id, 'sent_by' => $creator->id, 'email' => $this->user($handle)->email, 'sent_at' => $sentAt, 'created_at' => $sentAt, 'updated_at' => $sentAt]);
            }
        }

        $this->finish($task, $timeline, $status, $completedAt);
    }

    private function dueFor(string $state, CarbonImmutable $createdAt): ?CarbonImmutable
    {
        if ($this->chance(5)) {
            return null;
        }
        $due = match ($state) {
            'overdue' => $this->now->subDays(mt_rand(1, 6)),
            'not_started', 'in_progress', 'waiting', 'revision' => $this->now->addDays(mt_rand(-1, 10)),
            default => $createdAt->addDays(mt_rand(4, 14)),
        };

        return $due->max($createdAt->addDay())->setTime(17, 0);
    }

    private function endFor(string $state, CarbonImmutable $createdAt, ?CarbonImmutable $due): CarbonImmutable
    {
        $limit = $this->now->subMinutes(mt_rand(30, 600));
        if (in_array($state, ['completed', 'cancelled'], true)) {
            $target = $due ? ($this->chance(15) ? $due->addDays(mt_rand(1, 3))->setTime(mt_rand(8, 16), 30) : $due->subHours(mt_rand(2, 72))) : $createdAt->addDays(mt_rand(3, 9));
            $end = $target->min($limit);
        } else {
            $end = $limit;
        }

        return $end->max($createdAt->addHours(3))->min($this->now->subMinutes(10));
    }

    private function workday(CarbonImmutable $at): CarbonImmutable
    {
        $minutes = 420 + intdiv(($at->hour * 60 + $at->minute) * 840, 1440);

        return $at->setTime(intdiv($minutes, 60), $minutes % 60)->min($this->now->subMinutes(10));
    }

    private function assignees(array $plan): array
    {
        $handles = $plan['employees'];
        foreach ($plan['units'] as $unit) {
            $handles = [...$handles, ...DemoRoster::membersOf($unit)];
        }
        $exclude = $plan['personal'] ? [] : [$plan['creator'], DemoRoster::principal(), ...$plan['reviewers']];
        $workers = array_values(array_unique(array_diff($handles, $exclude)));

        return $plan['personal'] ? $plan['employees'] : $workers;
    }

    private function description(string $title, array $bullets): string
    {
        $items = implode('', array_map(fn ($bullet) => '<li>'.e($bullet).'</li>', $bullets));

        return '<p>Thực hiện “'.e($title).'” theo kế hoạch chung của nhà trường.</p><p><b>Yêu cầu:</b></p><ul>'.$items.'</ul>'
            .($this->chance(40) ? '<p>Liên hệ văn phòng nếu cần hỗ trợ thêm.</p>' : '');
    }

    private function comments(object $timeline, Task $task, array $workers, User $manager, string $status, CarbonImmutable $from, CarbonImmutable $to, int $count): void
    {
        $span = max(600, $to->getTimestamp() - $from->getTimestamp());
        for ($i = 0; $i < $count; $i++) {
            $at = $this->workday($from->addSeconds((int) ($span * ($i + 1) / ($count + 1))));
            if ($i % 2 === 0) {
                $author = $this->user($this->pick($workers));
                $this->log($timeline, $author, $author->employee?->id, $status, $this->pick(TaskCatalog::ASSIGNEE_COMMENTS), $at);
                $this->notify([$this->handleOf($manager)], $task, $author->name.' đã gửi nhận xét về công việc '.$task->title, $at, $author, 'task_comment');
            } else {
                $this->log($timeline, $manager, null, $status, $this->pick(TaskCatalog::MANAGER_COMMENTS), $at);
            }
        }
    }

    private function finish(Task $task, object $timeline, string $status, ?CarbonImmutable $completedAt): void
    {
        $task->update(['status' => $status, 'completed_at' => $completedAt]);
        $last = collect([...$timeline->updates, ...$timeline->histories])->max('created_at');
        $created = $timeline->histories[0]['created_at'];
        DB::table('tasks')->where('id', $task->id)->update(['created_at' => $created, 'updated_at' => $last]);
        $withTask = fn (array $rows) => array_map(fn ($row) => ['task_id' => $task->id] + $row, $rows);
        DB::table('task_updates')->insert($withTask($timeline->updates));
        DB::table('task_status_histories')->insert($withTask($timeline->histories));
    }

    private function log(object $timeline, User $author, ?int $employeeId, string $status, string $content, CarbonImmutable $at): void
    {
        $at = $at->min($this->now->subMinutes(5));
        $timeline->updates[] = ['employee_id' => $employeeId, 'created_by' => $author->id, 'status' => $status, 'content' => $content, 'created_at' => $at, 'updated_at' => $at];
    }

    private function history(object $timeline, ?string $from, string $to, User $by, string $reason, CarbonImmutable $at): void
    {
        $timeline->histories[] = ['from_status' => $from, 'to_status' => $to, 'changed_by' => $by->id, 'reason' => $reason, 'created_at' => $at->min($this->now->subMinutes(5))];
    }

    private function attach(object $owner, $file, string $purpose, CarbonImmutable $at): void
    {
        $this->stamp('files', $file->id, $at);
        DB::table('file_attachments')->insert(['file_id' => $file->id, 'attachable_type' => $owner::class, 'attachable_id' => $owner->id, 'purpose' => $purpose, 'created_at' => $at, 'updated_at' => $at]);
    }

    private function notify(array $handles, Task $task, ?string $message, CarbonImmutable $at, User $actor, string $action = 'assigned'): void
    {
        if ($at->lt($this->now->subDays(45))) {
            return;
        }
        foreach (array_unique($handles) as $handle) {
            $user = $this->user($handle);
            if ($user->id === $actor->id) {
                continue;
            }
            $data = $message === null
                ? ['task_id' => $task->id, 'code' => $task->code, 'title' => $task->title, 'priority' => $task->priority, 'due_at' => $task->due_at?->toIso8601String(), 'message' => 'Bạn vừa được giao công việc mới: '.$task->title]
                : ['task_id' => $task->id, 'code' => $task->code, 'title' => $task->title, 'message' => $message, 'action' => $action];
            $read = $at->lt($this->now->subDays(3)) ? $this->chance(90) : $this->chance(35);
            DB::table('notifications')->insert([
                'id' => (string) Str::uuid(), 'type' => $message === null ? TaskAssignedNotification::class : TaskWorkflowNotification::class,
                'notifiable_type' => User::class, 'notifiable_id' => $user->id, 'data' => json_encode($data, JSON_UNESCAPED_UNICODE),
                'read_at' => $read ? $at->addHours(mt_rand(1, 30))->min($this->now) : null, 'created_at' => $at, 'updated_at' => $at,
            ]);
        }
    }

    private function handleOf(User $user): string
    {
        return Str::before($user->email, '@');
    }
}
