<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $levels = [
            'Hiệu trưởng' => 1,
            'Hiệu phó' => 2,
            'Phó hiệu trưởng' => 2,
            'Tổ trưởng' => 3,
            'Tổ phó' => 4,
            'Giáo viên' => 6,
        ];
        foreach ($levels as $name => $level) {
            DB::table('positions')->where('name',$name)->update(['level'=>$level,'updated_at'=>now()]);
        }
        DB::table('positions')->whereNotIn('name',array_keys($levels))->where(fn($q)=>$q->where('level','<',1)->orWhere('level','>',6))->update(['level'=>5,'updated_at'=>now()]);
    }

    public function down(): void {}
};
