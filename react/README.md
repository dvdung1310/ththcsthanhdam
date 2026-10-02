# React + Vite

## Cấu hình backend khi triển khai

Trong `.env`, đặt địa chỉ backend (không thêm `/api`):

```env
VITE_API_BASE_URL=https://thanhdam.guongkinhhoangquynh.vn
```

Chạy `npm run build` và đưa thư mục `dist` lên server. Biến môi trường được
đóng gói lúc build; mỗi lần đổi địa chỉ API cần build lại. Khi chạy local,
để `VITE_API_BASE_URL=` để dùng proxy Vite và khởi động lại dev server.

Nếu frontend và backend khác domain, backend cần cho phép origin của frontend
qua CORS. Đặt `APP_URL` của Laravel đúng domain HTTPS để link tải file đúng.
Các biến `VITE_REVERB_*` là cấu hình websocket riêng; cần thay host local bằng
host Reverb thực tế khi triển khai. Không đặt khóa bí mật vào biến `VITE_*`.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
