<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AvatarStorageTest extends TestCase
{
    public function test_avatar_can_be_read_without_a_public_storage_link(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('avatars/example.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII='));

        $this->get('/api/avatars/example.png')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->get('/api/avatars/missing.png')->assertNotFound();
    }

    public function test_avatar_endpoint_does_not_expose_other_public_files(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('secret.txt', 'private');

        $this->get('/api/avatars/secret.txt')->assertNotFound();
        $this->get('/api/avatars/../secret.txt')->assertNotFound();
    }
}
