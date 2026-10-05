<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class TaskHistorySeeder extends Seeder
{
    private const MONTHS_BACK = 12;

    private const SEASONAL = [
        1 => ['Sơ kết học kỳ I', 'Báo cáo', 'mai.nt'],
        2 => ['Tổ chức hoạt động mừng Xuân cho học sinh', 'Sự kiện', 'ha.pt'],
        3 => ['Hội thi giáo viên dạy giỏi cấp trường', 'Phong trào', 'mai.nt'],
        4 => ['Ra đề kiểm tra cuối học kỳ II', 'Chuyên môn', 'nam.tv'],
        5 => ['Tổng kết năm học và bình xét thi đua', 'Báo cáo', 'mai.nt'],
        8 => ['Chuẩn bị cơ sở vật chất cho năm học mới', 'Hành chính', 'trang.tt'],
        9 => ['Tổ chức lễ khai giảng năm học mới', 'Sự kiện', 'mai.nt'],
        10 => ['Ra đề kiểm tra giữa học kỳ I', 'Chuyên môn', 'nam.tv'],
        11 => ['Hội giảng chào mừng ngày Nhà giáo Việt Nam 20/11', 'Phong trào', 'ha.pt'],
        12 => ['Ôn tập và tổ chức kiểm tra cuối học kỳ I', 'Chuyên môn', 'nam.tv'],
    ];

    private const ROUTINE = [
        ['Báo cáo công tác chủ nhiệm tháng {m}', 'Công tác chủ nhiệm', 'ha.pt', ['huy.nd', 'lan.bn']],
        ['Kiểm tra hồ sơ chuyên môn tháng {m}', 'Chuyên môn', 'nam.tv', ['quan.lm', 'huong.vt', 'linh.pk']],
        ['Nộp kế hoạch dạy học tháng {m}', 'Hành chính', 'trang.tt', ['anh.dm', 'huy.nd']],
    ];

    private const ASSIGNEES = [
        'Báo cáo' => ['Tổ tự nhiên', 'Tổ xã hội'],
        'Sự kiện' => ['Tổ xã hội'],
        'Phong trào' => ['Tổ tự nhiên', 'Tổ xã hội'],
        'Chuyên môn' => ['Tổ tự nhiên'],
        'Hành chính' => ['Tổ xã hội'],
    ];

    private array $users = [];

    public function run(): void
    {
        $today = CarbonImmutable::now();
        for ($ago = self::MONTHS_BACK; $ago >= 1; $ago--) {
            $month = $today->startOfMonth()->subMonths($ago);
            if (in_array($month->month, [6, 7], true)) {
                continue;
            }
            mt_srand(crc32('task'.$month->format('Y-m')));
            $number = 1;
            if ($seasonal = self::SEASONAL[$month->month] ?? null) {
                [$title, $category, $creator] = $seasonal;
                $this->createTask($month, $number++, $title, $category, $creator, [], self::ASSIGNEES[$category] ?? [], 'high');
            }
            $routine = self::ROUTINE[mt_rand(0, count(self::ROUTINE) - 1)];
            $this->createTask($month, $number++, str_replace('{m}', $month->month, $routine[0]), $routine[1], $routine[2], $routine[3], [], 'normal');
            if (in_array($month->month, [3, 11], true)) {
                $this->createTask($month, $number++, 'Khảo sát nhu cầu bồi dưỡng tháng '.$month->month, 'Báo cáo', 'trang.tt', ['huong.vt'], [], 'low', Task::CANCELLED);
            }
        }
    }

    private function createTask(CarbonImmutable $month, int $number, string $title, string $category, string $creator, array $teachers, array $units, string $priority, string $status = Task::COMPLETED): void
    {
        $code = 'CV-LS-'.$month->format('ym').'-'.$number;
        if (Task::withTrashed()->where('code', $code)->exists()) {
            return;
        }
        $creatorUser = $this->user($creator);
        $createdAt = $month->day(mt_rand(2, 8))->setTime(mt_rand(7, 10), 0);
        $due = $month->day(min($month->daysInMonth, mt_rand(15, 26)))->setTime(17, 0);
        $late = mt_rand(1, 100) <= 20;
        $completedAt = $status === Task::COMPLETED ? ($late ? $due->addDays(mt_rand(1, 3)) : $due->subDays(mt_rand(0, 4))->setTime(mt_rand(8, 16), 0)) : null;

        $task = Task::create([
            'code' => $code, 'title' => $title, 'description' => 'Thực hiện "'.$title.'" theo kế hoạch tháng '.$month->month.' của nhà trường.',
            'category_id' => TaskCategory::where('name', $category)->value('id'), 'created_by' => $creatorUser->id,
            'priority' => $priority, 'status' => $status, 'starts_at' => $createdAt, 'due_at' => $due, 'completed_at' => $completedAt,
        ]);
        $closedAt = $completedAt ?? $createdAt->addDays(3);
        DB::table('tasks')->where('id', $task->id)->update(['created_at' => $createdAt, 'updated_at' => $closedAt]);

        foreach ($teachers as $handle) {
            $task->teachers()->attach($this->user($handle)->teacher->id, ['assigned_by' => $creatorUser->id, 'assigned_at' => $createdAt]);
        }
        foreach ($units as $name) {
            if ($unitId = Department::where('name', $name)->value('id')) {
                $task->departments()->attach($unitId, ['assigned_by' => $creatorUser->id]);
            }
        }

        DB::table('task_status_histories')->insert([
            ['task_id' => $task->id, 'from_status' => null, 'to_status' => Task::NOT_STARTED, 'changed_by' => $creatorUser->id, 'reason' => 'Khởi tạo và giao công việc', 'created_at' => $createdAt],
            ['task_id' => $task->id, 'from_status' => Task::NOT_STARTED, 'to_status' => $status, 'changed_by' => $creatorUser->id, 'reason' => $status === Task::CANCELLED ? 'Kế hoạch thay đổi, dừng thực hiện' : 'Đã hoàn thành', 'created_at' => $closedAt],
        ]);

        if ($status !== Task::COMPLETED) {
            return;
        }
        foreach ($teachers as $handle) {
            $user = $this->user($handle);
            $submittedAt = $completedAt->subHours(mt_rand(2, 30));
            $task->submissions()->create([
                'teacher_id' => $user->teacher->id, 'version' => 1, 'result_content' => 'Đã hoàn thành "'.$title.'".', 'links' => [],
                'status' => 'approved', 'submitted_at' => $submittedAt,
                'reviewed_by' => $creatorUser->id, 'reviewed_at' => $completedAt, 'review_comment' => null,
            ]);
        }
    }

    private function user(string $handle): User
    {
        return $this->users[$handle] ??= User::with('teacher')->where('email', $handle.'@thanhdam.edu.vn')->firstOrFail();
    }
}
