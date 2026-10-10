<?php

namespace App\Notifications;

use App\Notifications\Concerns\PushesToBrowser;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;

class DeviceTestNotification extends Notification
{
    use PushesToBrowser;

    public function via(object $notifiable): array
    {
        return [WebPushChannel::class];
    }

    protected function pushContent(object $notifiable): array
    {
        return [
            'title' => 'Thông báo thử',
            'body' => 'Thiết bị này đã nhận được thông báo từ TH-THCS Thanh Đàm.',
            'url' => '/profile',
            'tag' => 'device-test',
            'data' => ['test' => true],
            'ttl' => 300,
        ];
    }
}
