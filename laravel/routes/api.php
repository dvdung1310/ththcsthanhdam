<?php
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\LibraryController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TaskTypeController;
use App\Http\Controllers\Api\PersonnelController;
use App\Http\Controllers\Api\UnitController;
use App\Http\Controllers\Api\TaskStatsController;
use App\Http\Controllers\Api\AiAssistantController;
use Illuminate\Support\Facades\Route;
use Illuminate\Broadcasting\BroadcastController;
Route::post('auth/login',[AuthController::class,'login']);
Route::middleware('api.token')->group(function(){
 Route::get('dashboard',[\App\Http\Controllers\Api\DashboardController::class,'index'])->middleware('permission:dashboard.view');
 Route::post('broadcasting/auth',[BroadcastController::class,'authenticate']);
 Route::get('notifications',[NotificationController::class,'index']);Route::get('notifications/unread-count',[NotificationController::class,'unreadCount']);Route::post('notifications/read-all',[NotificationController::class,'markAllRead']);Route::post('notifications/{notification}/read',[NotificationController::class,'markRead']);
 Route::get('auth/me',[AuthController::class,'me']);Route::post('auth/logout',[AuthController::class,'logout']);Route::post('auth/change-password',[AuthController::class,'changePassword']);Route::post('auth/avatar',[AuthController::class,'updateAvatar']);
 Route::post('ai-assistant/ask',[AiAssistantController::class,'ask']);
 Route::middleware('permission:library.view')->group(function(){
  Route::get('library',[LibraryController::class,'index']);Route::get('library/targets',[LibraryController::class,'targets']);Route::get('library/share-options',[LibraryController::class,'shareOptions']);
  Route::post('library/folders',[LibraryController::class,'storeFolder']);Route::post('library/upload',[LibraryController::class,'upload']);Route::post('library/paste',[LibraryController::class,'paste']);Route::post('library/share-file',[LibraryController::class,'shareFile']);
  Route::put('library/nodes/{node}',[LibraryController::class,'update']);Route::delete('library/nodes/{node}',[LibraryController::class,'destroy']);Route::get('library/nodes/{node}/download',[LibraryController::class,'download'])->name('library.download');
  Route::get('library/nodes/{node}/shares',[LibraryController::class,'shares']);Route::put('library/nodes/{node}/shares',[LibraryController::class,'updateShares']);Route::post('library/nodes/{node}/ai-summary',[AiAssistantController::class,'summarizeLibraryFile']);
  Route::get('my-files',[LibraryController::class,'myFiles']);Route::get('my-files/{file}/download',[LibraryController::class,'downloadMyFile']);
 });
 Route::get('personnel',[PersonnelController::class,'index'])->middleware('permission:teachers.view');Route::post('personnel',[PersonnelController::class,'store'])->middleware('permission:teachers.manage');Route::put('personnel/{user}',[PersonnelController::class,'update'])->middleware('permission:teachers.manage');Route::delete('personnel/{user}',[PersonnelController::class,'destroy'])->middleware('permission:teachers.manage');
 Route::get('units',[UnitController::class,'index'])->middleware('permission:teachers.view');Route::get('units/{unit}',[UnitController::class,'show'])->middleware('permission:teachers.view');Route::post('units',[UnitController::class,'store'])->middleware('permission:teachers.manage');Route::put('units/{unit}',[UnitController::class,'update'])->middleware('permission:teachers.manage');Route::delete('units/{unit}',[UnitController::class,'destroy'])->middleware('permission:teachers.manage');
 Route::get('tasks-reference-data',[TaskController::class,'referenceData'])->middleware('permission:tasks.view');Route::get('tasks',[TaskController::class,'index'])->middleware('permission:tasks.view');Route::get('tasks/{task}',[TaskController::class,'show'])->middleware('permission:tasks.view');Route::post('tasks',[TaskController::class,'store'])->middleware('permission:tasks.assign');Route::post('personal-tasks',[TaskController::class,'storePersonal'])->middleware('permission:tasks.update');Route::match(['put','patch'],'personal-tasks/{task}',[TaskController::class,'updatePersonal'])->middleware('permission:tasks.update');Route::match(['put','patch'],'tasks/{task}',[TaskController::class,'update'])->middleware('permission:tasks.assign');Route::delete('tasks/{task}',[TaskController::class,'destroy'])->middleware('permission:tasks.assign');Route::post('tasks/{task}/progress',[TaskController::class,'progress'])->middleware('permission:tasks.update');Route::post('tasks/{task}/remind',[TaskController::class,'sendReminder'])->middleware('permission:tasks.assign');Route::post('tasks/{task}/cancel',[TaskController::class,'cancel'])->middleware('permission:tasks.view');Route::post('tasks/{task}/complete',[TaskController::class,'complete'])->middleware('permission:tasks.update');Route::delete('personal-tasks/{task}',[TaskController::class,'destroyPersonal'])->middleware('permission:tasks.update');
 Route::get('tasks/{task}/attachments/{file}',[TaskController::class,'viewAttachment'])->middleware('permission:tasks.view');
 Route::get('tasks/{task}/library-files/{node}',[TaskController::class,'viewLibraryFile'])->middleware('permission:tasks.view')->name('tasks.library-file');
 Route::get('tasks/{task}/submissions/{submission}/attachments/{file}',[TaskController::class,'viewSubmissionAttachment'])->middleware('permission:tasks.view');
 Route::post('tasks/{task}/submit-completion',[TaskController::class,'submitCompletion'])->middleware('permission:tasks.update');Route::post('tasks/{task}/review-completion',[TaskController::class,'reviewCompletion'])->middleware('permission:tasks.view');
 Route::put('tasks/{task}/comments/{update}',[TaskController::class,'updateComment'])->middleware('permission:tasks.view');
 Route::post('tasks/{task}/comments',[TaskController::class,'storeComment'])->middleware('permission:tasks.view');
 Route::get('task-types',[TaskTypeController::class,'index'])->middleware('permission:tasks.assign');Route::post('task-types',[TaskTypeController::class,'store'])->middleware('permission:tasks.assign');Route::put('task-types/{taskType}',[TaskTypeController::class,'update'])->middleware('permission:tasks.assign');Route::delete('task-types/{taskType}',[TaskTypeController::class,'destroy'])->middleware('permission:tasks.assign');
 Route::get('task-stats',[TaskStatsController::class,'index'])->middleware('permission:kpi.view');
 Route::get('roles',[RoleController::class,'index'])->middleware('permission:roles.manage');Route::put('roles/{role}/permissions',[RoleController::class,'updatePermissions'])->middleware('permission:roles.manage');
});

// Serve only avatars so ZIP deployments do not depend on a storage symlink.
Route::get('avatars/{filename}', function (string $filename) {
    $disk = \Illuminate\Support\Facades\Storage::disk('public');
    $path = 'avatars/'.$filename;
    abort_unless($disk->exists($path), 404);
    return $disk->response($path, null, [
        'Cache-Control' => 'public, max-age=86400',
        'X-Content-Type-Options' => 'nosniff',
    ]);
})->where('filename', '[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)')->name('avatars.show');
