<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;

class UploadLimits
{
    public const APP_MAX_FILE_KB = 20480;

    public static function maxFileBytes(): int
    {
        return min(self::APP_MAX_FILE_KB * 1024, self::iniBytes('upload_max_filesize'));
    }

    public static function maxRequestBytes(): int
    {
        return self::iniBytes('post_max_size');
    }

    public static function maxFiles(): int
    {
        return (int) ini_get('max_file_uploads') ?: 20;
    }

    public static function toArray(): array
    {
        return ['max_file_bytes' => self::maxFileBytes(), 'max_request_bytes' => self::maxRequestBytes(), 'max_files' => self::maxFiles()];
    }

    public static function failureReason(UploadedFile $file): string
    {
        return match ($file->getError()) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'file vượt quá giới hạn '.self::megabytes(self::maxFileBytes()).' mỗi file của máy chủ',
            UPLOAD_ERR_PARTIAL => 'quá trình tải bị gián đoạn, vui lòng thử lại',
            UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE, UPLOAD_ERR_EXTENSION => 'máy chủ không lưu được file tạm, hãy báo quản trị viên',
            default => 'không đọc được file',
        };
    }

    public static function megabytes(int $bytes): string
    {
        $value = $bytes / 1024 / 1024;

        return rtrim(rtrim(number_format($value, $value < 10 ? 1 : 0, ',', ''), '0'), ',').' MB';
    }

    private static function iniBytes(string $key): int
    {
        $value = trim((string) ini_get($key));
        if ($value === '' || $value === '0' || $value === '-1') {
            return PHP_INT_MAX;
        }
        $number = (float) $value;

        return (int) match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 ** 3,
            'm' => $number * 1024 ** 2,
            'k' => $number * 1024,
            default => $number,
        };
    }
}
