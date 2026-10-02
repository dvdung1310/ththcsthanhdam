<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StoredFile extends Model
{
    protected $table = 'files';
    protected $fillable = ['uploaded_by', 'disk', 'path', 'original_name', 'mime_type', 'size', 'checksum'];
}
