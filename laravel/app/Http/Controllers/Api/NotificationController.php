<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = $request->user()->notifications()->latest()->paginate(15);
        return response()->json([
            'data' => collect($notifications->items())->map(fn ($notification) => [
                'id' => $notification->id, 'type' => class_basename($notification->type),
                'data' => $notification->data, 'read_at' => $notification->read_at?->toIso8601String(),
                'created_at' => $notification->created_at?->toIso8601String(),
            ]),
            'unread_count' => $request->user()->unreadNotifications()->count(),
            'meta' => ['current_page' => $notifications->currentPage(), 'last_page' => $notifications->lastPage(), 'total' => $notifications->total()],
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    { return response()->json(['unread_count' => $request->user()->unreadNotifications()->count()]); }

    public function markRead(Request $request, string $notification): JsonResponse
    {
        $request->user()->notifications()->whereKey($notification)->firstOrFail()->markAsRead();
        return response()->json(['message' => 'Đã đánh dấu thông báo là đã đọc.']);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();
        return response()->json(['message' => 'Đã đọc tất cả thông báo.']);
    }
}
