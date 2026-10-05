<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Task;
use App\Models\TaskCategory;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class TaskSeeder extends Seeder
{
    private array $users = [];

    public function run(): void
    {
        $tasks = [
            ['Xây dựng kế hoạch chuyên môn học kỳ I', 'Chuyên môn', 'mai.nt', [], 'high', Task::NOT_STARTED, 7 * 24, [], ['Tổ tự nhiên']],
            ['Rà soát chương trình môn học theo khung mới', 'Chuyên môn', 'mai.nt', [], 'normal', Task::IN_PROGRESS, 3 * 24, [], ['Tổ xã hội'], ['updates' => [['ha.pt', 'Đã họp tổ, đang tổng hợp ý kiến các thành viên.']]]],
            ['Chuẩn bị tiết dạy minh họa cấp trường', 'Chuyên môn', 'mai.nt', ['nam.tv', 'quan.lm'], 'urgent', Task::WAITING_APPROVAL, 2 * 24, ['huong.vt', 'tuan.da'], [], ['submissions' => [['huong.vt', 'Đã hoàn thiện giáo án và slide, gửi kèm link.', ['https://drive.google.com/demo-tiet-day'], null, -6]]]],
            ['Nộp hồ sơ cá nhân năm học 2026-2027', 'Hành chính', 'trang.tt', [], 'normal', Task::COMPLETED, -5 * 24, [], ['Tổ tự nhiên', 'Tổ xã hội'], ['submissions' => [['bao.hq', 'Đã nộp đủ hồ sơ.', [], 'approved', -6 * 24]]]],
            ['Tổng hợp nhu cầu thiết bị thí nghiệm', 'Báo cáo', 'nam.tv', [], 'high', Task::IN_PROGRESS, -2 * 24, [], ['Nhóm lý']],
            ['Ra đề kiểm tra giữa kỳ môn Toán', 'Chuyên môn', 'nam.tv', [], 'high', Task::COMPLETED, -4 * 24, ['an.lh'], [], ['submissions' => [['an.lh', 'Gửi đề và đáp án.', [], 'approved', -3 * 24]]]],
            ['Báo cáo kết quả khảo sát đầu năm', 'Báo cáo', 'nam.tv', [], 'normal', Task::IN_PROGRESS, 4 * 24, [], ['Nhóm toán', 'Nhóm sinh'], ['submissions' => [['huong.vt', 'Bản báo cáo lần 1.', [], 'revision_required', -24, 'Cần bổ sung số liệu khối 8.']]]],
            ['Lập danh sách học sinh tham gia hội thao', 'Sự kiện', 'ha.pt', [], 'normal', Task::WAITING_APPROVAL, 24, ['bao.hq', 'huy.nd'], [], ['submissions' => [['huy.nd', 'Danh sách đã chốt với các lớp.', [], null, -3]]]],
            ['Họp phụ huynh đầu năm — chuẩn bị nội dung', 'Công tác chủ nhiệm', 'ha.pt', [], 'urgent', Task::NOT_STARTED, 20, [], ['Tổ xã hội']],
            ['Kiểm kê phòng máy tin học', 'Hành chính', 'linh.pk', [], 'low', Task::NOT_STARTED, 10 * 24, ['tuan.da'], []],
            ['Tổ chức chuyên đề hóa học thực tiễn', 'Phong trào', 'mai.nt', [], 'normal', Task::CANCELLED, 6 * 24, [], ['Tổ tự nhiên']],
            ['Tự học bồi dưỡng chuyên đề STEM', 'Chuyên môn', 'huong.vt', [], 'normal', Task::IN_PROGRESS, 14 * 24, ['huong.vt'], []],
            ['Hoàn thiện sáng kiến kinh nghiệm', 'Chuyên môn', 'huong.vt', ['nam.tv'], 'high', Task::WAITING_APPROVAL, 5 * 24, ['huong.vt'], [], ['submissions' => [['huong.vt', 'Bản thảo sáng kiến, nhờ tổ trưởng góp ý.', [], null, -12]]]],
            ['Sắp xếp lại tủ hồ sơ lớp chủ nhiệm', 'Công tác chủ nhiệm', 'an.lh', [], 'low', Task::COMPLETED, -24, ['an.lh'], []],
            ['Cập nhật tủ sách tham khảo của tổ', 'Chuyên môn', 'nam.tv', [], 'low', Task::IN_PROGRESS, null, [], ['Tổ tự nhiên']],
        ];

        foreach ($tasks as $index => $row) {
            $this->createTask($index + 1, ...$row);
        }
    }

    private function createTask(int $number, string $title, string $type, string $creator, array $reviewers, string $priority, string $status, ?int $dueInHours, array $teachers, array $units, array $extra = []): void
    {
        $code = 'CV-DEMO-'.str_pad($number, 3, '0', STR_PAD_LEFT);
        if (Task::withTrashed()->where('code', $code)->exists()) {
            return;
        }
        $creatorUser = $this->user($creator);
        $createdAt = now()->subDays(8)->addHours($number);
        $due = $dueInHours === null ? null : now()->addHours($dueInHours)->setTime(17, 0);
        $submissions = $extra['submissions'] ?? [];
        $completedAt = $status === Task::COMPLETED ? ($submissions ? now()->addHours(end($submissions)[4])->addHour() : ($due?->copy()->subHours(5) ?? now()->subDay())) : null;

        $task = Task::create([
            'code' => $code, 'title' => $title, 'description' => 'Thực hiện "'.$title.'" theo kế hoạch chung của nhà trường.',
            'category_id' => TaskCategory::where('name', $type)->value('id'), 'created_by' => $creatorUser->id,
            'priority' => $priority, 'status' => $status,
            'starts_at' => $createdAt, 'due_at' => $due, 'completed_at' => $completedAt,
        ]);
        DB::table('tasks')->where('id', $task->id)->update(['created_at' => $createdAt, 'updated_at' => now()]);
        $task->reviewers()->attach(array_map(fn ($handle) => $this->user($handle)->id, $reviewers));

        foreach ($teachers as $email) {
            $task->teachers()->attach($this->user($email)->teacher->id, ['assigned_by' => $creatorUser->id, 'assigned_at' => $createdAt]);
        }
        foreach ($units as $name) {
            $task->departments()->attach(Department::where('name', $name)->value('id'), ['assigned_by' => $creatorUser->id]);
        }

        DB::table('task_status_histories')->insert(['task_id' => $task->id, 'from_status' => null, 'to_status' => Task::NOT_STARTED, 'changed_by' => $creatorUser->id, 'reason' => 'Khởi tạo và giao công việc', 'created_at' => $createdAt]);
        if ($status !== Task::NOT_STARTED) {
            DB::table('task_status_histories')->insert(['task_id' => $task->id, 'from_status' => Task::NOT_STARTED, 'to_status' => $status, 'changed_by' => $creatorUser->id, 'reason' => 'Dữ liệu mẫu', 'created_at' => now()->subHours(2)]);
        }

        foreach ($extra['updates'] ?? [] as [$email, $content]) {
            $user = $this->user($email);
            $task->updates()->create(['teacher_id' => $user->teacher?->id, 'created_by' => $user->id, 'status' => $status, 'content' => $content]);
        }

        foreach ($submissions as $version => $submission) {
            [$email, $content, $links, $state, $hoursAgo] = $submission;
            $user = $this->user($email);
            $task->submissions()->create([
                'teacher_id' => $user->teacher->id, 'version' => $version + 1, 'result_content' => $content, 'links' => $links,
                'status' => $state ?? 'submitted', 'submitted_at' => now()->addHours($hoursAgo),
                'reviewed_by' => $state ? ($reviewers ? $this->user($reviewers[0])->id : $creatorUser->id) : null,
                'reviewed_at' => $state ? now()->addHours($hoursAgo + 1) : null,
                'review_comment' => $submission[5] ?? null,
            ]);
        }
    }

    private function user(string $handle): User
    {
        return $this->users[$handle] ??= User::with('teacher')->where('email', $handle.'@thanhdam.edu.vn')->firstOrFail();
    }
}
