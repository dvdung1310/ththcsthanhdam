# Lưu ảnh trên server

Ảnh đại diện nằm trong `laravel/storage/app/public/avatars`. Code phục vụ ảnh qua `/api/avatars/{filename}`, không cần liên kết `public/storage`.

Sau khi cập nhật code, chạy trong thư mục Laravel trên server:

```sh
php artisan optimize:clear
```

Đặt `APP_URL` trong `.env` thành địa chỉ HTTPS thực tế của backend. Web server phải trỏ vào thư mục `laravel/public` và chuyển request `/api/*` đến Laravel.

Tài khoản chạy PHP cần quyền ghi `storage` và `bootstrap/cache`. Trên Linux, quản trị viên cần đặt chủ sở hữu hoặc nhóm phù hợp và cấp quyền ghi cho tài khoản PHP; không cần cấp quyền 777.

Khi giải nén ZIP cập nhật, giữ nguyên `.env` và toàn bộ `storage/app` trên server để không mất ảnh và file đính kèm. ZIP từ máy Windows có thể chứa liên kết storage trỏ về máy cũ; endpoint ảnh mới không dùng liên kết này.

Nếu giao diện và API khác địa chỉ, đặt `VITE_API_BASE_URL` thành địa chỉ backend trước khi build React. Ảnh tối đa 2 MB; giới hạn PHP `upload_max_filesize` phải đáp ứng mức này và `post_max_size` phải lớn hơn dung lượng toàn bộ request.
