<?php

namespace Database\Seeders;

use App\Models\DocumentType;
use App\Models\OfficialDocument;
use App\Models\User;
use Illuminate\Database\Seeder;

class DocumentSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::where('email', config('app.admin.email'))->firstOrFail();
        $records = [
            ['123/PGDĐT-GDTHCS','Hướng dẫn thực hiện nhiệm vụ giáo dục THCS năm học 2026-2027','Hướng dẫn','Phòng Giáo dục và Đào tạo','2026-08-25','incoming','active'],
            ['58/KH-THCSTĐ','Kế hoạch tổ chức khai giảng năm học 2026-2027','Kế hoạch','Trường THCS Thanh Đạm','2026-08-22','outgoing','active'],
            ['412/QĐ-UBND','Quyết định ban hành khung thời gian năm học 2026-2027','Quyết định','UBND Thành phố','2026-08-18','incoming','active'],
            ['46/TB-THCSTĐ','Thông báo phân công chuyên môn học kỳ I','Thông báo','Trường THCS Thanh Đạm','2026-08-15','internal','active'],
            ['287/SGDĐT-TCCB','Hướng dẫn công tác thi đua, khen thưởng năm học mới','Công văn','Sở Giáo dục và Đào tạo','2026-08-12','incoming','active'],
            ['39/KH-THCSTĐ','Kế hoạch bồi dưỡng chuyên môn cho giáo viên','Kế hoạch','Trường THCS Thanh Đạm','2026-08-08','outgoing','active'],
            ['176/PGDĐT-KHTC','Hướng dẫn quản lý và sử dụng ngân sách nhà trường','Hướng dẫn','Phòng Giáo dục và Đào tạo','2026-07-28','incoming','active'],
            ['31/TB-THCSTĐ','Thông báo lịch nghỉ hè và trực trường','Thông báo','Trường THCS Thanh Đạm','2026-05-25','internal','expired'],
        ];
        foreach ($records as [$number,$title,$typeName,$issuer,$issuedOn,$direction,$status]) {
            $type = DocumentType::firstOrCreate(['name' => $typeName], ['code' => strtoupper(substr(md5($typeName), 0, 10))]);
            OfficialDocument::firstOrCreate(['document_number' => $number, 'issuer' => $issuer, 'issued_on' => $issuedOn], ['document_type_id' => $type->id, 'created_by' => $admin->id, 'title' => $title, 'direction' => $direction, 'status' => $status, 'effective_on' => $issuedOn, 'summary' => $title.'. Văn bản được cập nhật trong kho dữ liệu dùng chung của nhà trường.']);
        }
    }
}
