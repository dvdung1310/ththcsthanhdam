<?php

namespace App\Providers;

use App\Services\UploadLimits;
use Illuminate\Foundation\Console\ServeCommand;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        ServeCommand::$passthroughVariables[] = 'PHP_INI_SCAN_DIR';
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $file = fn (string $attribute, $validator) => Arr::get($validator->getData(), $attribute);
        $name = fn (UploadedFile $upload) => '“'.$upload->getClientOriginalName().'”';

        Validator::replacer('uploaded', function ($message, $attribute, $rule, $parameters, $validator) use ($file, $name) {
            $upload = $file($attribute, $validator);

            return $upload instanceof UploadedFile
                ? 'Không tải lên được '.$name($upload).': '.UploadLimits::failureReason($upload).'.'
                : $message;
        });
        Validator::replacer('max', function ($message, $attribute, $rule, $parameters, $validator) use ($file, $name) {
            $upload = $file($attribute, $validator);

            return $upload instanceof UploadedFile
                ? $name($upload).' vượt quá dung lượng cho phép '.UploadLimits::megabytes((int) $parameters[0] * 1024).'.'
                : $message;
        });
        Validator::replacer('mimes', function ($message, $attribute, $rule, $parameters, $validator) use ($file, $name) {
            $upload = $file($attribute, $validator);

            return $upload instanceof UploadedFile
                ? $name($upload).' không đúng định dạng cho phép ('.implode(', ', $parameters).').'
                : $message;
        });
    }
}
