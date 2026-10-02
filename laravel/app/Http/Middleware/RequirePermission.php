<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
class RequirePermission {
 public function handle(Request $request,Closure $next,string $permission):Response{
  if(!$request->user()?->hasPermission($permission))return response()->json(['message'=>'Bạn không có quyền thực hiện thao tác này.'],403);
  return $next($request);
 }
}
