<?php

namespace App\Notifications\Concerns;

use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

trait PushesToBrowser
{
    abstract protected function pushContent(object $notifiable): array;

    protected function withPush(array $channels): array
    {
        return config('webpush.vapid.public_key') && config('webpush.vapid.private_key') ? [...$channels, WebPushChannel::class] : $channels;
    }

    public function toWebPush(object $notifiable, mixed $notification): WebPushMessage
    {
        $content = $this->pushContent($notifiable);
        ['title' => $title, 'body' => $body, 'url' => $url, 'tag' => $tag] = $content;

        return (new WebPushMessage)
            ->title($title)
            ->body($body)
            ->icon('/icons/icon-192.png')
            ->badge('/icons/icon-192.png')
            ->lang('vi')
            ->tag($tag)
            ->data(['url' => $url, ...($content['data'] ?? [])])
            ->options(['TTL' => $content['ttl'] ?? 86400, 'urgency' => 'high']);
    }
}
