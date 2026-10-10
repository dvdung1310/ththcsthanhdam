<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
class AuthController extends Controller {
 public function login(Request $request):JsonResponse{
  $data=$request->validate(['email'=>['required','email'],'password'=>['required','string']]);
  $user=User::where('email',$data['email'])->where('status','active')->first();
  if(!$user||!Hash::check($data['password'],$user->password))return response()->json(['message'=>'Email hoặc mật khẩu không chính xác.'],422);
  $plain=Str::random(80);$user->update(['api_token'=>hash('sha256',$plain),'last_login_at'=>now()]);
  return response()->json(['message'=>'Đăng nhập thành công.','token'=>$plain,'user'=>$this->userData($user)]);
 }
 public function me(Request $request):JsonResponse{return response()->json(['user'=>$this->userData($request->user())]);}
 public function logout(Request $request):JsonResponse{$request->user()->update(['api_token'=>null]);return response()->json(['message'=>'Đã đăng xuất.']);}
 public function updateAvatar(Request $request):JsonResponse{
  $data=$request->validate(['avatar'=>['required','image','mimes:jpg,jpeg,png,webp','max:2048']],['avatar.required'=>'Vui lòng chọn ảnh đại diện.','avatar.image'=>'Tệp đã chọn phải là hình ảnh.','avatar.mimes'=>'Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WebP.','avatar.max'=>'Ảnh đại diện không được vượt quá 2 MB.']);
  $user=$request->user();
  $oldPath=$user->avatar_path;
  $path=$data['avatar']->store('avatars','public');
  if (! $path) return response()->json(['message'=>'Kh?ng l?u ???c ?nh. Vui l?ng ki?m tra quy?n ghi th? m?c storage tr?n server.'], 500);
  try {
   $user->update(['avatar_path'=>$path]);
  } catch (\Throwable $exception) {
   Storage::disk('public')->delete($path);
   throw $exception;
  }
  if($oldPath)Storage::disk('public')->delete($oldPath);
  return response()->json(['message'=>'Đã cập nhật ảnh đại diện.','user'=>$this->userData($user)]);
 }
 public function changePassword(Request $request):JsonResponse{
  $data=$request->validate(['current_password'=>['required'],'password'=>['required','confirmed','min:8']]);
  if(!Hash::check($data['current_password'],$request->user()->password))return response()->json(['message'=>'Mật khẩu hiện tại không đúng.'],422);
  $request->user()->update(['password'=>$data['password'],'must_change_password'=>false]);return response()->json(['message'=>'Đã đổi mật khẩu thành công.']);
 }
 private function userData(User $user):array{
  $labels=$user->roleLabels();
  return [
   'id'=>$user->id,'name'=>$user->name,'email'=>$user->email,'must_change_password'=>$user->must_change_password,
   'roles'=>$user->activeRoles()->map(fn($r)=>['id'=>$r->id,'code'=>$r->code,'name'=>$r->name,'department_id'=>$r->pivot->department_id])->values(),
   'role_labels'=>$labels,
   'permissions'=>$user->permissionCodes(),
   'access_scope'=>$user->accessScope(),
   'has_ai_assistant'=>$user->hasPermission('ai.assistant'),
   'current_position'=>$labels[0]??null,
   'avatar_url'=>$user->avatar_path?route('avatars.show', ['filename' => basename($user->avatar_path)]):null,
  ];
 }
}
