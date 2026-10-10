<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Notifications\DeviceTestNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\AnonymousNotifiable;
use NotificationChannels\WebPush\WebPushChannel;

class PushSubscriptionController extends Controller
{
    public function key(): JsonResponse
    {
        return response()->json(['public_key' => config('webpush.vapid.public_key') ?: null]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'url', 'max:2048'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
            'content_encoding' => ['nullable', 'in:aesgcm,aes128gcm'],
        ]);
        $request->user()->updatePushSubscription($data['endpoint'], $data['keys']['p256dh'], $data['keys']['auth'], $data['content_encoding'] ?? 'aes128gcm');

        return response()->json(['message' => 'Đã bật thông báo trên thiết bị này.'], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['endpoint' => ['required', 'string', 'max:2048']]);
        $request->user()->deletePushSubscription($data['endpoint']);

        return response()->json(['message' => 'Đã tắt thông báo trên thiết bị này.']);
    }

    public function test(Request $request, WebPushChannel $channel): JsonResponse
    {
        abort_unless(config('webpush.vapid.public_key') && config('webpush.vapid.private_key'), 503, 'Máy chủ chưa cấu hình Web Push.');
        $data = $request->validate(['endpoint' => ['required', 'string', 'max:2048']]);
        $subscriptions = $request->user()->pushSubscriptions()->where('endpoint', $data['endpoint'])->get();
        abort_if($subscriptions->isEmpty(), 404, 'Thiết bị này chưa đăng ký nhận thông báo.');

        $report = $channel->send((new AnonymousNotifiable)->route('WebPush', $subscriptions), new DeviceTestNotification)[0] ?? null;
        abort_if($report?->isSubscriptionExpired(), 410, 'Đăng ký nhận thông báo của thiết bị đã hết hạn.');
        abort_unless($report?->isSuccess(), 502, 'Dịch vụ thông báo của trình duyệt từ chối yêu cầu. Thử lại sau.');

        return response()->json(['message' => 'Đã gửi thông báo thử tới thiết bị này.']);
    }
}
