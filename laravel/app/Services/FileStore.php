<?php

namespace App\Services;

use App\Models\LibraryNode;
use App\Models\StoredFile;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class FileStore
{
    public function store(UploadedFile $uploaded, string $folder, User $actor): StoredFile
    {
        $checksum = hash_file('sha256', $uploaded->getRealPath());
        $size = $uploaded->getSize();
        $existing = StoredFile::where('checksum', $checksum)->where('size', $size)->where('disk', 'local')->first();
        $path = $existing && Storage::disk('local')->exists($existing->path) ? $existing->path : $uploaded->store($folder, 'local');

        return StoredFile::create([
            'uploaded_by' => $actor->id, 'disk' => 'local', 'path' => $path,
            'original_name' => $uploaded->getClientOriginalName(), 'mime_type' => $uploaded->getMimeType(),
            'size' => $size, 'checksum' => $checksum,
        ]);
    }

    public function releaseIfUnused(?int $fileId): void
    {
        if (! $fileId) {
            return;
        }
        $file = StoredFile::find($fileId);
        if (! $file) {
            return;
        }
        $inUse = LibraryNode::where('file_id', $file->id)->exists()
            || DB::table('file_attachments')->where('file_id', $file->id)->exists();
        if ($inUse) {
            return;
        }
        $file->delete();
        if (! StoredFile::where('disk', $file->disk)->where('path', $file->path)->exists()) {
            Storage::disk($file->disk)->delete($file->path);
        }
    }
}
