<?php

namespace Database\Seeders\Demo;

use App\Models\StoredFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

class DemoFiles
{
    public const MIME = [
        'pdf' => 'application/pdf',
        'png' => 'image/png',
        'txt' => 'text/plain',
        'csv' => 'text/csv',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    public static function store(string $folder, string $name, int $uploadedBy, ?string $text = null): StoredFile
    {
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $title = $text ?? pathinfo($name, PATHINFO_FILENAME);
        $contents = match ($extension) {
            'pdf' => self::pdf($title),
            'png' => self::png($title),
            'csv' => self::csv($title),
            'docx' => self::docx($title),
            'xlsx' => self::xlsx($title),
            default => $title."\n\nTài liệu mẫu của Trường TH-THCS Thanh Đàm.\n",
        };
        $path = $folder.'/'.Str::slug(pathinfo($name, PATHINFO_FILENAME)).'-'.substr(md5($folder.$name.$uploadedBy.$title), 0, 10).'.'.$extension;
        Storage::disk('local')->put($path, $contents);

        return StoredFile::create([
            'uploaded_by' => $uploadedBy, 'disk' => 'local', 'path' => $path, 'original_name' => $name,
            'mime_type' => self::MIME[$extension] ?? 'application/octet-stream',
            'size' => strlen($contents), 'checksum' => hash('sha256', $contents),
        ]);
    }

    public static function avatar(string $handle, int $seed): string
    {
        $palette = [[219, 234, 254], [220, 252, 231], [254, 243, 199], [252, 231, 243], [237, 233, 254], [224, 242, 254]];
        $accent = [[37, 99, 235], [22, 163, 74], [217, 119, 6], [219, 39, 119], [124, 58, 237], [2, 132, 199]];
        $size = 256;
        $image = imagecreatetruecolor($size, $size);
        [$r, $g, $b] = $palette[$seed % count($palette)];
        imagefill($image, 0, 0, imagecolorallocate($image, $r, $g, $b));
        [$r, $g, $b] = $accent[$seed % count($accent)];
        $color = imagecolorallocate($image, $r, $g, $b);
        imagefilledellipse($image, 128, 100, 96, 96, $color);
        imagefilledellipse($image, 128, 250, 190, 170, $color);
        ob_start();
        imagepng($image);
        $contents = ob_get_clean();
        imagedestroy($image);
        $path = 'avatars/demo-'.Str::slug($handle).'.png';
        Storage::disk('public')->put($path, $contents);

        return $path;
    }

    public static function pdf(string $title): string
    {
        $lines = [self::latin($title), 'Truong TH-THCS Thanh Dam', 'Tai lieu mau phuc vu demo he thong.'];
        $stream = 'BT /F1 18 Tf 72 720 Td ('.self::escape($lines[0]).') Tj /F1 12 Tf 0 -28 Td ('.$lines[1].') Tj 0 -18 Td ('.$lines[2].') Tj ET';

        return "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            ."3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n"
            ."4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
            .'5 0 obj<</Length '.strlen($stream).">>stream\n{$stream}\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
    }

    public static function png(string $title): string
    {
        $width = 640;
        $height = 400;
        $image = imagecreatetruecolor($width, $height);
        imagefill($image, 0, 0, imagecolorallocate($image, 245, 248, 252));
        $hash = crc32($title);
        $bar = imagecolorallocate($image, 11, 61, 145);
        $soft = imagecolorallocate($image, 188, 203, 230);
        for ($i = 0; $i < 6; $i++) {
            $value = 60 + (($hash >> ($i * 4)) & 15) * 16;
            imagefilledrectangle($image, 60 + $i * 90, $height - 50 - $value, 120 + $i * 90, $height - 50, $i % 2 ? $soft : $bar);
        }
        imagestring($image, 5, 40, 24, self::latin($title), $bar);
        ob_start();
        imagepng($image);
        $contents = ob_get_clean();
        imagedestroy($image);

        return $contents;
    }

    public static function csv(string $title): string
    {
        $rows = ["\u{FEFF}STT,Họ và tên,Lớp,Ghi chú"];
        $names = ['Nguyễn Minh Anh', 'Trần Gia Bảo', 'Lê Khánh Chi', 'Phạm Đức Duy', 'Hoàng Thu Hà', 'Vũ Quang Huy', 'Đỗ Ngọc Lan', 'Bùi Tuấn Minh'];
        foreach ($names as $index => $name) {
            $rows[] = ($index + 1).','.$name.','.(6 + $index % 4).'A'.(1 + $index % 3).','.($index % 3 ? '' : $title);
        }

        return implode("\n", $rows)."\n";
    }

    public static function docx(string $title): string
    {
        $body = '<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>'.e($title).'</w:t></w:r></w:p>'
            .'<w:p><w:r><w:t>Trường TH-THCS Thanh Đàm — tài liệu mẫu phục vụ demo hệ thống.</w:t></w:r></w:p>';

        return self::zip([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
            'word/document.xml' => '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'.$body.'</w:body></w:document>',
        ]);
    }

    public static function xlsx(string $title): string
    {
        $cell = fn ($ref, $text) => '<c r="'.$ref.'" t="inlineStr"><is><t>'.e($text).'</t></is></c>';
        $rows = '<row r="1">'.$cell('A1', $title).'</row><row r="2">'.$cell('A2', 'Họ và tên').$cell('B2', 'Điểm').'</row>';
        foreach (['Nguyễn Minh Anh', 'Trần Gia Bảo', 'Lê Khánh Chi', 'Phạm Đức Duy'] as $index => $name) {
            $row = $index + 3;
            $rows .= '<row r="'.$row.'">'.$cell('A'.$row, $name).'<c r="B'.$row.'"><v>'.(7 + $index % 3).'</v></c></row>';
        }

        return self::zip([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
            'xl/_rels/workbook.xml.rels' => '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
            'xl/worksheets/sheet1.xml' => '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'.$rows.'</sheetData></worksheet>',
        ]);
    }

    private static function zip(array $entries): string
    {
        $path = tempnam(sys_get_temp_dir(), 'demo');
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);
        foreach ($entries as $name => $contents) {
            $zip->addFromString($name, $contents);
        }
        $zip->close();
        $contents = file_get_contents($path);
        unlink($path);

        return $contents;
    }

    private static function latin(string $text): string
    {
        return Str::limit(Str::ascii($text), 60, '...');
    }

    private static function escape(string $text): string
    {
        return strtr($text, ['\\' => '\\\\', '(' => '\\(', ')' => '\\)']);
    }
}
