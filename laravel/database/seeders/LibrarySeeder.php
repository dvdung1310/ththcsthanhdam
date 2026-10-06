<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\LibraryNode;
use App\Models\LibraryShare;
use App\Models\StoredFile;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LibrarySeeder extends Seeder
{
    private array $users = [];

    public function run(): void
    {
        $shared = LibraryNode::where('is_system', true)->where('name', 'Chia sẻ chung')->firstOrFail();
        $principal = $this->user('mai.nt');

        $this->file($shared, 'Lịch công tác tháng 10.pdf', 'admin', $this->pdf('Lich cong tac thang 10'));
        $this->file($shared, 'Danh bạ giáo viên.txt', 'trang.tt', "Danh bạ giáo viên năm học 2026-2027\n");

        $guidance = $this->folder(null, 'Văn bản chỉ đạo', $principal);
        $this->share($guidance, null, null, LibraryShare::READ, $principal);
        $this->file($guidance, 'Hướng dẫn nhiệm vụ năm học 2026-2027.pdf', 'mai.nt', $this->pdf('Huong dan nhiem vu nam hoc'));
        $this->file($guidance, 'Quy chế chuyên môn.txt', 'mai.nt', "Quy chế chuyên môn của nhà trường.\n");

        foreach (['Tổ tự nhiên' => ['nam.tv', 'linh.pk'], 'Tổ xã hội' => ['ha.pt', 'lan.bn']] as $unitName => [$leader, $deputy]) {
            $unit = Department::where('name', $unitName)->firstOrFail();
            $folder = $this->folder(null, $unitName, $principal);
            $this->share($folder, null, $unit->id, LibraryShare::READ, $principal);
            $this->share($folder, $this->user($leader)->id, null, LibraryShare::EDIT, $principal);
            $this->share($folder, $this->user($deputy)->id, null, LibraryShare::EDIT, $principal);
            $plans = $this->folder($folder, 'Kế hoạch', $this->user($leader));
            $this->file($plans, 'Kế hoạch tổ học kỳ I.txt', $leader, "Kế hoạch hoạt động {$unitName} học kỳ I.\n");
            $this->folder($folder, 'Đề kiểm tra', $this->user($leader));
        }

        $report = $this->file(null, 'Báo cáo nhân sự đầu năm.txt', 'mai.nt', "Báo cáo tình hình nhân sự đầu năm học.\n");
        $this->share($report, $this->user('trang.tt')->id, null, LibraryShare::READ, $principal);

        $planFile = LibraryNode::where('name', 'Kế hoạch tổ học kỳ I.txt')->whereHas('parent.parent', fn ($q) => $q->where('name', 'Tổ tự nhiên'))->first();
        Task::where('code', 'CV-DEMO-001')->first()?->libraryFiles()->syncWithoutDetaching(array_filter([$planFile?->id, LibraryNode::where('name', 'Hướng dẫn nhiệm vụ năm học 2026-2027.pdf')->value('id')]));
    }

    private function folder(?LibraryNode $parent, string $name, User $owner): LibraryNode
    {
        return LibraryNode::firstOrCreate(['parent_id' => $parent?->id, 'type' => LibraryNode::FOLDER, 'name' => $name], ['owner_id' => $owner->id]);
    }

    private function file(?LibraryNode $parent, string $name, string $owner, string $contents): LibraryNode
    {
        $existing = LibraryNode::where('parent_id', $parent?->id)->where('type', LibraryNode::FILE)->where('name', $name)->first();
        if ($existing) {
            return $existing;
        }
        $user = $this->user($owner);
        $path = 'library/demo/'.Str::slug(pathinfo($name, PATHINFO_FILENAME)).'-'.substr(md5(($parent?->id ?? 0).$name), 0, 8).'.'.pathinfo($name, PATHINFO_EXTENSION);
        Storage::disk('local')->put($path, $contents);
        $file = StoredFile::create([
            'uploaded_by' => $user->id, 'disk' => 'local', 'path' => $path, 'original_name' => $name,
            'mime_type' => str_ends_with($name, '.pdf') ? 'application/pdf' : 'text/plain',
            'size' => strlen($contents), 'checksum' => hash('sha256', $contents),
        ]);

        return LibraryNode::create(['parent_id' => $parent?->id, 'type' => LibraryNode::FILE, 'name' => $name, 'file_id' => $file->id, 'owner_id' => $user->id]);
    }

    private function share(LibraryNode $node, ?int $userId, ?int $departmentId, string $access, User $by): void
    {
        LibraryShare::updateOrCreate(['node_id' => $node->id, 'user_id' => $userId, 'department_id' => $departmentId], ['access' => $access, 'granted_by' => $by->id]);
    }

    private function user(string $handle): User
    {
        $email = $handle === 'admin' ? config('app.admin.email') : $handle.'@thanhdam.edu.vn';

        return $this->users[$handle] ??= User::where('email', $email)->firstOrFail();
    }

    private function pdf(string $text): string
    {
        $stream = "BT /F1 18 Tf 72 720 Td ({$text}) Tj ET";

        return "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            ."3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n"
            ."4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
            .'5 0 obj<</Length '.strlen($stream).">>stream\n{$stream}\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
    }
}
