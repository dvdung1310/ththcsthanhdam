<?php

namespace Database\Seeders\Demo;

use App\Models\Role;
use Illuminate\Support\Str;

class DemoRoster
{
    public const PASSWORD = 'Teacher@123';

    public const SECONDARY = ['Tổ Tự nhiên', 'Tổ Xã hội'];

    public const PRIMARY = ['Tổ Khối 1', 'Tổ Khối 2', 'Tổ Khối 3', 'Tổ Khối 4', 'Tổ Khối 5'];

    public const UNITS = [
        'Tổ Tự nhiên' => ['Nhóm Toán', 'Nhóm Vật lý', 'Nhóm Hóa học', 'Nhóm Sinh học', 'Nhóm Tin học – Công nghệ'],
        'Tổ Xã hội' => ['Nhóm Ngữ văn', 'Nhóm Lịch sử – Địa lý', 'Nhóm Tiếng Anh', 'Nhóm GDCD'],
        'Tổ Khối 1' => [],
        'Tổ Khối 2' => [],
        'Tổ Khối 3' => [],
        'Tổ Khối 4' => [],
        'Tổ Khối 5' => [],
        'Tổ Năng khiếu' => [],
    ];

    public const STAFF = [
        ['Trịnh Thu Trang', 'trang.tt', '0900000001'],
        ['Lê Thị Kim Oanh', 'oanh.ltk', '0900000002'],
    ];

    // name, unit, subject, extra roles [role, unit], employment status, homeroom, flags
    public const TEACHERS = [
        ['Nguyễn Thị Mai', 'Nhóm Ngữ văn', 'Ngữ văn', [[Role::HIEU_TRUONG, null]], 'working', false, []],
        ['Trần Văn Nam', 'Nhóm Toán', 'Toán học', [[Role::TO_TRUONG, 'Tổ Tự nhiên'], [Role::NHOM_TRUONG, 'Nhóm Toán']], 'working', false, ['avatar']],
        ['Lương Hoài An', 'Nhóm Toán', 'Toán học', [], 'on_leave', true, []],
        ['Nguyễn Thị Thu Hằng', 'Nhóm Toán', 'Toán học', [], 'working', true, ['avatar']],
        ['Phạm Quốc Khánh', 'Nhóm Toán', 'Toán học', [], 'working', false, []],
        ['Lê Minh Quân', 'Nhóm Vật lý', 'Vật lý', [[Role::NHOM_TRUONG, 'Nhóm Vật lý']], 'working', false, []],
        ['Đinh Thị Yến', 'Nhóm Vật lý', 'Vật lý', [], 'working', true, ['avatar']],
        ['Phan Khánh Linh', 'Nhóm Hóa học', 'Hóa học', [[Role::TO_PHO, 'Tổ Tự nhiên'], [Role::NHOM_TRUONG, 'Nhóm Hóa học']], 'working', false, []],
        ['Hồ Văn Thắng', 'Nhóm Hóa học', 'Hóa học', [], 'working', false, []],
        ['Vũ Thanh Hương', 'Nhóm Sinh học', 'Sinh học', [[Role::NHOM_TRUONG, 'Nhóm Sinh học']], 'working', false, ['avatar']],
        ['Trịnh Thị Bích Ngọc', 'Nhóm Sinh học', 'Sinh học', [], 'working', true, []],
        ['Đỗ Anh Tuấn', 'Nhóm Tin học – Công nghệ', 'Tin học', [], 'suspended', false, ['locked']],
        ['Cao Minh Đức', 'Nhóm Tin học – Công nghệ', 'Tin học', [[Role::NHOM_TRUONG, 'Nhóm Tin học – Công nghệ']], 'working', false, ['avatar']],
        ['Kiều Thị Phương', 'Nhóm Tin học – Công nghệ', 'Công nghệ', [], 'working', false, []],
        ['Bùi Ngọc Lan', 'Nhóm Ngữ văn', 'Ngữ văn', [[Role::TO_PHO, 'Tổ Xã hội'], [Role::NHOM_TRUONG, 'Nhóm Ngữ văn']], 'working', true, ['avatar']],
        ['Đoàn Thị Thảo', 'Nhóm Ngữ văn', 'Ngữ văn', [], 'working', true, []],
        ['Mai Văn Hiếu', 'Nhóm Ngữ văn', 'Ngữ văn', [], 'working', false, ['new']],
        ['Tạ Thị Quỳnh', 'Nhóm Ngữ văn', 'Ngữ văn', [], 'working', true, []],
        ['Hoàng Quốc Bảo', 'Nhóm Lịch sử – Địa lý', 'Lịch sử', [], 'on_leave', false, []],
        ['Đặng Minh Anh', 'Nhóm Lịch sử – Địa lý', 'Địa lý', [[Role::NHOM_TRUONG, 'Nhóm Lịch sử – Địa lý']], 'working', false, ['avatar']],
        ['Võ Thị Hồng Nhung', 'Nhóm Lịch sử – Địa lý', 'Lịch sử', [], 'working', true, []],
        ['Phạm Thu Hà', 'Nhóm Tiếng Anh', 'Tiếng Anh', [[Role::TO_TRUONG, 'Tổ Xã hội'], [Role::NHOM_TRUONG, 'Nhóm Tiếng Anh']], 'working', true, []],
        ['Ngô Đức Huy', 'Nhóm Tiếng Anh', 'Tiếng Anh', [], 'working', true, ['avatar']],
        ['Dương Thị Vân', 'Nhóm Tiếng Anh', 'Tiếng Anh', [], 'working', false, []],
        ['Huỳnh Thị Dung', 'Nhóm GDCD', 'Giáo dục công dân', [[Role::NHOM_TRUONG, 'Nhóm GDCD']], 'working', false, []],
        ['Lý Văn Sơn', 'Nhóm GDCD', 'Giáo dục công dân', [], 'working', false, ['new']],
        ['Nguyễn Thị Loan', 'Tổ Khối 1', 'Giáo dục tiểu học', [[Role::TO_TRUONG, 'Tổ Khối 1']], 'working', true, ['avatar']],
        ['Trần Thị Thùy Dương', 'Tổ Khối 1', 'Giáo dục tiểu học', [[Role::TO_PHO, 'Tổ Khối 1']], 'working', true, []],
        ['Lê Thị Hiền', 'Tổ Khối 1', 'Giáo dục tiểu học', [], 'working', true, []],
        ['Phạm Thị Oanh', 'Tổ Khối 1', 'Giáo dục tiểu học', [], 'working', true, ['avatar']],
        ['Vũ Thị Hạnh', 'Tổ Khối 2', 'Giáo dục tiểu học', [[Role::TO_TRUONG, 'Tổ Khối 2']], 'working', true, []],
        ['Đặng Thị Kim Thoa', 'Tổ Khối 2', 'Giáo dục tiểu học', [], 'working', true, ['avatar']],
        ['Bùi Thị Nga', 'Tổ Khối 2', 'Giáo dục tiểu học', [], 'working', true, []],
        ['Hoàng Thị Huyền', 'Tổ Khối 3', 'Giáo dục tiểu học', [[Role::TO_TRUONG, 'Tổ Khối 3']], 'working', true, []],
        ['Ngô Thị Lệ', 'Tổ Khối 3', 'Giáo dục tiểu học', [], 'working', true, ['avatar']],
        ['Phan Thị Trinh', 'Tổ Khối 3', 'Giáo dục tiểu học', [], 'on_leave', true, []],
        ['Đỗ Thị Thanh Tâm', 'Tổ Khối 4', 'Giáo dục tiểu học', [[Role::TO_TRUONG, 'Tổ Khối 4']], 'working', true, ['avatar']],
        ['Lê Văn Tùng', 'Tổ Khối 4', 'Giáo dục tiểu học', [], 'working', true, []],
        ['Nguyễn Thị Diệp', 'Tổ Khối 4', 'Giáo dục tiểu học', [], 'working', true, []],
        ['Trịnh Văn Long', 'Tổ Khối 5', 'Giáo dục tiểu học', [[Role::TO_TRUONG, 'Tổ Khối 5']], 'working', true, []],
        ['Hồ Thị Ánh', 'Tổ Khối 5', 'Giáo dục tiểu học', [], 'working', true, ['avatar']],
        ['Võ Thị Mỹ Lệ', 'Tổ Khối 5', 'Giáo dục tiểu học', [], 'working', true, []],
        ['Lương Văn Dũng', 'Tổ Năng khiếu', 'Thể dục', [[Role::TO_TRUONG, 'Tổ Năng khiếu']], 'working', false, ['avatar']],
        ['Đinh Công Phúc', 'Tổ Năng khiếu', 'Thể dục', [], 'working', false, []],
        ['Cao Thị Hoa', 'Tổ Năng khiếu', 'Âm nhạc', [], 'working', false, []],
        ['Tạ Minh Khoa', 'Tổ Năng khiếu', 'Âm nhạc', [], 'working', false, ['new']],
        ['Kiều Thị Diệu Linh', 'Tổ Năng khiếu', 'Mỹ thuật', [], 'working', false, ['avatar']],
    ];

    private static ?array $people = null;

    public static function handle(string $name): string
    {
        $parts = preg_split('/\s+/', trim($name));
        $given = array_pop($parts);
        $initials = implode('', array_map(fn ($part) => mb_substr($part, 0, 1), $parts));

        return Str::lower(Str::ascii($given).'.'.Str::ascii($initials));
    }

    public static function email(string $handle): string
    {
        return $handle.'@thanhdam.edu.vn';
    }

    public static function people(): array
    {
        if (self::$people !== null) {
            return self::$people;
        }
        $people = [];
        $used = array_column(self::STAFF, 1);
        foreach (self::TEACHERS as $index => [$name, $unit, $subject, $roles, $status, $homeroom, $flags]) {
            $handle = self::handle($name);
            for ($n = 2; in_array($handle, $used, true); $n++) {
                $handle = self::handle($name).$n;
            }
            $used[] = $handle;
            $people[$handle] = [
                'handle' => $handle, 'name' => $name, 'code' => sprintf('NS%03d', $index + 1), 'unit' => $unit, 'tổ' => self::rootOf($unit),
                'subject' => $subject, 'roles' => $roles, 'status' => $status, 'homeroom' => $homeroom, 'flags' => $flags,
                'phone' => '09'.str_pad((string) ((12345678 + $index * 7919) % 100000000), 8, '0', STR_PAD_LEFT),
            ];
        }

        return self::$people = $people;
    }

    public static function rootOf(string $unit): string
    {
        foreach (self::UNITS as $to => $groups) {
            if ($unit === $to || in_array($unit, $groups, true)) {
                return $to;
            }
        }

        return $unit;
    }

    public static function principal(): string
    {
        return self::holder(Role::HIEU_TRUONG, null);
    }

    public static function holder(string $role, ?string $unit): ?string
    {
        foreach (self::people() as $handle => $person) {
            foreach ($person['roles'] as [$code, $roleUnit]) {
                if ($code === $role && $roleUnit === $unit) {
                    return $handle;
                }
            }
        }

        return null;
    }

    public static function leaderOf(string $unit): string
    {
        $to = self::rootOf($unit);

        return ($unit !== $to ? self::holder(Role::NHOM_TRUONG, $unit) : null) ?? self::holder(Role::TO_TRUONG, $to);
    }

    public static function leadersOf(string $to): array
    {
        return array_values(array_filter([self::holder(Role::TO_TRUONG, $to), self::holder(Role::TO_PHO, $to)]));
    }

    public static function membersOf(string $unit, bool $workingOnly = true): array
    {
        return array_keys(array_filter(self::people(), fn ($person) => ($person['unit'] === $unit || $person['tổ'] === $unit)
            && (! $workingOnly || $person['status'] === 'working')));
    }

    public static function groupsWithMembers(): array
    {
        $groups = [];
        foreach (self::UNITS as $groupList) {
            foreach ($groupList as $group) {
                if (count(self::membersOf($group)) >= 2) {
                    $groups[] = $group;
                }
            }
        }

        return $groups;
    }
}
