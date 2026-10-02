<?php
namespace App\Http\Middleware;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;
class ApiTokenAuth {
 public function handle(Request $request,Closure $next):Response{
  $token=$request->bearerToken();
  if(!$token||!$user=User::where('api_token',hash('sha256',$token))->where('status','active')->first())return response()->json(['message'=>'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'],401);
  Auth::login($user);$request->setUserResolver(fn()=>$user);return $next($request);
 }
}
