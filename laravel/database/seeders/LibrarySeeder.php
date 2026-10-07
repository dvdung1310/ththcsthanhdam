<?php

namespace Database\Seeders;

use App\Models\LibraryNode;
use App\Models\LibraryShare;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\Demo\DemoFiles;
use Database\Seeders\Demo\DemoLookup;
use Database\Seeders\Demo\DemoRoster;
use Illuminate\Database\Seeder;

class LibrarySeeder extends Seeder
{
    use DemoLookup;

    private const SKKN = [
        ['huong.vt', 'Ứng dụng mô hình STEM trong dạy học Sinh học 7', 'Sáng kiến được Hội đồng khoa học trường xếp loại A.'],
        ['ha.pt', 'Tăng cường kỹ năng nói tiếng Anh qua dự án nhỏ', null],
        ['loan.nt', 'Rèn chữ đẹp cho học sinh lớp 1 qua trò chơi', 'Áp dụng thử tại lớp 1A1, 1A2 trong học kỳ I.'],
        ['nam.tv', 'Sử dụng GeoGebra trong dạy hình học lớp 8', null],
        ['lan.bn', 'Đọc hiểu văn bản theo chủ đề cho học sinh lớp 6', null],
        ['dung.lv', 'Tổ chức trò chơi vận động trong giờ Thể dục tiểu học', null],
    ];

    public function run(): void
    {
        if (LibraryNode::where('is_system', false)->exists()) {
            $this->command?->info('Kho dữ liệu đã có dữ liệu, bỏ qua dữ liệu mẫu kho.');

            return;
        }
        mt_srand(20261);
        $principal = $this->user(DemoRoster::principal());
        $secretary = $this->user('trang.tt');
        $now = CarbonImmutable::now();

        $shared = LibraryNode::where('is_system', true)->where('name', 'Chia sẻ chung')->firstOrFail();
        foreach (range(3, 0) as $ago) {
            $month = $now->subMonths($ago);
            $this->file($shared, 'Lịch công tác tháng '.$month->month.'.pdf', $secretary, $month->startOfMonth()->subDays(2));
        }
        $this->file($shared, 'Danh bạ cán bộ giáo viên.xlsx', $secretary, $now->subMonths(2), '<p>Cập nhật số điện thoại và email công vụ của toàn trường.</p>');
        $this->file($shared, 'Thời khóa biểu học kỳ I.xlsx', $secretary, $now->subMonths(2));
        $this->file($shared, 'Ảnh lễ khai giảng.png', $secretary, $now->subMonths(1));
        $this->file($shared, 'Nội quy nhà trường.pdf', $principal, $now->subMonths(3));

        $guidance = $this->folder(null, 'Văn bản chỉ đạo', $principal, $now->subMonths(3), '<p>Văn bản của Ban giám hiệu và Phòng GD&amp;ĐT. Mọi người chỉ xem.</p>');
        $this->share($guidance, null, null, LibraryShare::READ, $principal);
        $year = $this->folder($guidance, 'Năm học '.$this->schoolYear(), $principal, $now->subMonths(3));
        foreach (['Kế hoạch năm học '.$this->schoolYear().'.pdf', 'Quy chế chuyên môn.pdf', 'Hướng dẫn kiểm tra đánh giá học sinh.pdf', 'Kế hoạch chuyển đổi số.docx'] as $offset => $name) {
            $this->file($year, $name, $principal, $now->subMonths(3)->addDays($offset * 3));
        }
        $incoming = $this->folder($guidance, 'Công văn đến', $secretary, $now->subMonths(3));
        foreach ([112, 147, 189, 203, 236] as $offset => $number) {
            $this->file($incoming, 'Công văn số '.$number.'-PGDĐT.pdf', $secretary, $now->subMonths(3)->addDays($offset * 14));
        }

        foreach (DemoRoster::UNITS as $to => $groups) {
            $this->seedUnit($to, $groups, $principal, $now);
        }

        $awards = $this->folder(null, 'Hồ sơ thi đua', $secretary, $now->subMonths(3), '<p>Tổng hợp kết quả thi đua hằng tháng. Chỉ Ban giám hiệu và tổ trưởng được xem.</p>');
        $this->share($awards, $principal->id, null, LibraryShare::EDIT, $secretary);
        foreach (array_keys(DemoRoster::UNITS) as $to) {
            $this->share($awards, $this->user(DemoRoster::leaderOf($to))->id, null, LibraryShare::READ, $secretary);
        }
        foreach (range(3, 1) as $ago) {
            $month = $now->subMonths($ago);
            $this->file($awards, 'Tổng hợp thi đua tháng '.$month->month.'.xlsx', $secretary, $month->endOfMonth()->addDays(5)->min($now));
        }
        $this->file($awards, 'Danh sách đăng ký danh hiệu thi đua.xlsx', $secretary, $now->subMonths(2));

        $initiatives = $this->folder(null, 'Sáng kiến kinh nghiệm', $principal, $now->subMonths(3));
        $this->share($initiatives, null, null, LibraryShare::READ, $principal);
        foreach (self::SKKN as $offset => [$handle, $topic, $description]) {
            $author = $this->user($handle);
            $this->file($initiatives, 'SKKN - '.$author->name.' - '.$topic.'.docx', $author, $now->subWeeks(10 - $offset), $description ? '<p>'.e($description).'</p>' : null);
        }

        $this->seedPersonal($now);
    }

    private function seedUnit(string $to, array $groups, User $principal, CarbonImmutable $now): void
    {
        $leaders = DemoRoster::leadersOf($to);
        $leader = $this->user($leaders[0]);
        $folder = $this->folder(null, $to, $principal, $now->subMonths(3), '<p>Tài liệu chung của '.e($to).'.</p>');
        $this->share($folder, null, $this->unitId($to), LibraryShare::READ, $principal);
        foreach ($leaders as $handle) {
            $this->share($folder, $this->user($handle)->id, null, LibraryShare::EDIT, $principal);
        }

        $plans = $this->folder($folder, 'Kế hoạch', $leader, $now->subMonths(3));
        foreach (range(2, 0) as $ago) {
            $month = $now->subMonths($ago);
            $this->file($plans, 'Kế hoạch '.$to.' tháng '.$month->month.'.docx', $leader, $month->startOfMonth()->addDays(1)->min($now));
        }
        $minutes = $this->folder($folder, 'Biên bản sinh hoạt chuyên môn', $leader, $now->subMonths(3));
        foreach (range(3, 1) as $ago) {
            $month = $now->subMonths($ago);
            $this->file($minutes, 'Biên bản họp tổ tháng '.$month->month.'.pdf', $leader, $month->day(20));
        }

        if ($groups) {
            $exams = $this->folder($folder, 'Đề kiểm tra', $leader, $now->subMonths(3));
            foreach ($groups as $group) {
                $members = DemoRoster::membersOf($group, false);
                if (! $members) {
                    continue;
                }
                $groupLeader = $this->user(DemoRoster::leaderOf($group));
                $groupFolder = $this->folder($exams, $group, $groupLeader, $now->subMonths(2));
                $this->share($groupFolder, null, $this->unitId($group), LibraryShare::EDIT, $leader);
                $subject = DemoRoster::people()[$members[0]]['subject'];
                $grade = mt_rand(6, 9);
                $this->file($groupFolder, 'Đề kiểm tra giữa kỳ I - '.$subject.' '.$grade.'.docx', $groupLeader, $now->subWeeks(mt_rand(3, 8)));
                $this->file($groupFolder, 'Ma trận đề - '.$subject.' '.$grade.'.xlsx', $this->user($this->pick($members)), $now->subWeeks(mt_rand(2, 7)));
            }
        } elseif (str_starts_with($to, 'Tổ Khối')) {
            $lessons = $this->folder($folder, 'Giáo án mẫu', $leader, $now->subMonths(2));
            $this->share($lessons, null, $this->unitId($to), LibraryShare::EDIT, $leader);
            $this->file($lessons, 'Giáo án Tiếng Việt tuần '.mt_rand(5, 9).'.docx', $leader, $now->subWeeks(5));
            $this->file($lessons, 'Giáo án Toán tuần '.mt_rand(5, 9).'.docx', $this->user($this->pick(DemoRoster::membersOf($to))), $now->subWeeks(3));
            $this->file($folder, 'Ảnh hoạt động trải nghiệm.png', $leader, $now->subWeeks(2));
        } else {
            $this->file($folder, 'Kế hoạch hội khỏe Phù Đổng.docx', $leader, $now->subWeeks(6));
            $this->file($folder, 'Ảnh văn nghệ chào mừng 20-11.png', $leader, $now->subWeeks(1));
        }
    }

    private function seedPersonal(CarbonImmutable $now): void
    {
        $people = array_keys(array_filter(DemoRoster::people(), fn ($person) => $person['status'] === 'working'));
        foreach (array_slice($people, 1, 40, true) as $index => $handle) {
            if ($index % 6 !== 1) {
                continue;
            }
            $owner = $this->user($handle);
            $folder = $this->folder(null, 'Tài liệu cá nhân - '.$owner->name, $owner, $now->subMonths(2));
            $subject = DemoRoster::people()[$handle]['subject'];
            $draft = $this->file($folder, 'Bản nháp giáo án '.$subject.'.docx', $owner, $now->subWeeks(mt_rand(1, 6)));
            $this->file($folder, 'Danh sách học sinh cần hỗ trợ.csv', $owner, $now->subWeeks(mt_rand(1, 6)));
            if ($index % 12 === 1) {
                $colleague = $this->pick(array_values(array_diff(DemoRoster::membersOf(DemoRoster::people()[$handle]['tổ']), [$handle])));
                $this->share($draft, $this->user($colleague)->id, null, LibraryShare::READ, $owner);
            } else {
                $this->share($folder, $this->user(DemoRoster::leaderOf(DemoRoster::people()[$handle]['unit']))->id, null, LibraryShare::READ, $owner);
            }
        }
    }

    private function folder(?LibraryNode $parent, string $name, User $owner, CarbonImmutable $at, ?string $description = null): LibraryNode
    {
        $node = LibraryNode::create(['parent_id' => $parent?->id, 'type' => LibraryNode::FOLDER, 'name' => $name, 'owner_id' => $owner->id, 'description' => $description]);
        $this->stamp('library_nodes', $node->id, $at);

        return $node;
    }

    private function file(?LibraryNode $parent, string $name, User $owner, CarbonImmutable $at, ?string $description = null): LibraryNode
    {
        $stored = DemoFiles::store('library/demo', $name, $owner->id);
        $this->stamp('files', $stored->id, $at);
        $node = LibraryNode::create(['parent_id' => $parent?->id, 'type' => LibraryNode::FILE, 'name' => $name, 'file_id' => $stored->id, 'owner_id' => $owner->id, 'description' => $description]);
        $this->stamp('library_nodes', $node->id, $at);

        return $node;
    }

    private function share(LibraryNode $node, ?int $userId, ?int $departmentId, string $access, User $by): void
    {
        LibraryShare::updateOrCreate(['node_id' => $node->id, 'user_id' => $userId, 'department_id' => $departmentId], ['access' => $access, 'granted_by' => $by->id]);
    }
}
