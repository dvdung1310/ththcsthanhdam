<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up():void{Schema::table('users',function(Blueprint $table){$table->string('api_token',64)->nullable()->unique()->after('remember_token');$table->boolean('must_change_password')->default(true)->after('api_token');});}
 public function down():void{Schema::table('users',fn(Blueprint $table)=>$table->dropColumn(['api_token','must_change_password']));}
};
