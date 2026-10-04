<?php
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TaskConfigurationController;
use App\Http\Controllers\Api\PersonnelController;
use App\Http\Controllers\Api\UnitController;
use App\Http\Controllers\Api\KpiController;
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
 Route::post('documents/{document}/ai-summary',[AiAssistantController::class,'summarizeDocument'])->middleware('permission:documents.manage');
 Route::get('personnel',[PersonnelController::class,'index'])->middleware('permission:teachers.view');Route::post('personnel',[PersonnelController::class,'store'])->middleware('permission:teachers.manage');Route::put('personnel/{user}',[PersonnelController::class,'update'])->middleware('permission:teachers.manage');Route::delete('personnel/{user}',[PersonnelController::class,'destroy'])->middleware('permission:teachers.manage');
 Route::get('units',[UnitController::class,'index'])->middleware('permission:teachers.view');Route::get('units/{unit}',[UnitController::class,'show'])->middleware('permission:teachers.view');Route::post('units',[UnitController::class,'store'])->middleware('permission:teachers.manage');Route::put('units/{unit}',[UnitController::class,'update'])->middleware('permission:teachers.manage');Route::delete('units/{unit}',[UnitController::class,'destroy'])->middleware('permission:teachers.manage');
 Route::get('documents',[DocumentController::class,'index'])->middleware('permission:documents.view');Route::get('documents/{document}',[DocumentController::class,'show'])->middleware('permission:documents.view');Route::get('documents/{document}/download',[DocumentController::class,'download'])->middleware('permission:documents.view')->name('documents.download');Route::post('documents',[DocumentController::class,'store'])->middleware('permission:documents.manage');Route::match(['put','patch'],'documents/{document}',[DocumentController::class,'update'])->middleware('permission:documents.manage');Route::delete('documents/{document}',[DocumentController::class,'destroy'])->middleware('permission:documents.manage');
 Route::post('document-folders',[DocumentController::class,'storeFolder'])->middleware('permission:documents.manage');Route::put('document-folders/{folder}',[DocumentController::class,'updateFolder'])->middleware('permission:documents.manage');Route::delete('document-folders/{folder}',[DocumentController::class,'destroyFolder'])->middleware('permission:documents.manage');
 Route::post('data-library/paste',[DocumentController::class,'paste'])->middleware('permission:documents.manage');
 Route::get('tasks-reference-data',[TaskController::class,'referenceData'])->middleware('permission:tasks.view');Route::get('tasks',[TaskController::class,'index'])->middleware('permission:tasks.view');Route::get('tasks/{task}',[TaskController::class,'show'])->middleware('permission:tasks.view');Route::post('tasks',[TaskController::class,'store'])->middleware('permission:tasks.assign');Route::post('personal-tasks',[TaskController::class,'storePersonal'])->middleware('permission:tasks.update');Route::match(['put','patch'],'personal-tasks/{task}',[TaskController::class,'updatePersonal'])->middleware('permission:tasks.update');Route::match(['put','patch'],'tasks/{task}',[TaskController::class,'update'])->middleware('permission:tasks.assign');Route::delete('tasks/{task}',[TaskController::class,'destroy'])->middleware('permission:tasks.assign');Route::post('tasks/{task}/progress',[TaskController::class,'progress'])->middleware('permission:tasks.update');Route::post('tasks/{task}/remind',[TaskController::class,'sendReminder'])->middleware('permission:tasks.assign');
 Route::get('tasks/{task}/attachments/{file}',[TaskController::class,'viewAttachment'])->middleware('permission:tasks.view');
 Route::get('tasks/{task}/submissions/{submission}/attachments/{file}',[TaskController::class,'viewSubmissionAttachment'])->middleware('permission:tasks.view');
 Route::post('tasks/{task}/submit-completion',[TaskController::class,'submitCompletion'])->middleware('permission:tasks.update');Route::post('tasks/{task}/review-completion',[TaskController::class,'reviewCompletion'])->middleware('permission:tasks.view');
 Route::put('tasks/{task}/comments/{update}',[TaskController::class,'updateComment'])->middleware('permission:tasks.view');
 Route::post('tasks/{task}/comments',[TaskController::class,'storeComment'])->middleware('permission:tasks.view');
 Route::get('task-configuration',[TaskConfigurationController::class,'index'])->middleware('permission:tasks.assign');Route::post('task-groups',[TaskConfigurationController::class,'storeGroup'])->middleware('permission:tasks.assign');Route::match(['put','patch'],'task-groups/{taskGroup}',[TaskConfigurationController::class,'updateGroup'])->middleware('permission:tasks.assign');Route::delete('task-groups/{taskGroup}',[TaskConfigurationController::class,'destroyGroup'])->middleware('permission:tasks.assign');Route::post('task-catalog-items',[TaskConfigurationController::class,'storeItem'])->middleware('permission:tasks.assign');Route::match(['put','patch'],'task-catalog-items/{taskCatalogItem}',[TaskConfigurationController::class,'updateItem'])->middleware('permission:tasks.assign');Route::delete('task-catalog-items/{taskCatalogItem}',[TaskConfigurationController::class,'destroyItem'])->middleware('permission:tasks.assign');
 Route::post('late-penalty-rules',[TaskConfigurationController::class,'storeLatePenaltyRule'])->middleware('permission:tasks.assign');Route::match(['put','patch'],'late-penalty-rules/{latePenaltyRule}',[TaskConfigurationController::class,'updateLatePenaltyRule'])->middleware('permission:tasks.assign');Route::delete('late-penalty-rules/{latePenaltyRule}',[TaskConfigurationController::class,'destroyLatePenaltyRule'])->middleware('permission:tasks.assign');
 Route::get('kpi-report',[KpiController::class,'index'])->middleware('permission:kpi.view');
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
