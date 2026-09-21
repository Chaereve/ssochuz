/* ============================================================================
   src/admin/main.js · ĐIỂM VÀO DUY NHẤT của trang quản trị (bản 2.0)
   ----------------------------------------------------------------------------
   VÌ SAO có tệp này: trước đây toàn bộ trang quản trị nằm trong một tệp
   src/admin.js dài 3283 dòng, build bằng esbuild với `bundle: false` (các tệp
   gọi nhau qua biến toàn cục window.CZ). Muốn dùng trình soạn thảo cài qua npm
   (TipTap) thì bắt buộc phải BUNDLE, nên admin có đường build riêng:

       src/admin/main.js  --(esbuild bundle, iife, minify)-->  /admin.js

   Các tệp cz-*.js của trang người đọc GIỮ NGUYÊN `bundle: false`.

   THỨ TỰ HAI DÒNG DƯỚI ĐÂY LÀ CÓ CHỦ Ý, ĐỪNG ĐỔI:
     1. bridge.js  dựng window.CZEditor (cầu nối sang trình soạn mới)
     2. legacy.js  là IIFE, nạp vào là chạy ngay và cần cầu nối đã sẵn sàng
   Đổi thứ tự = trang âm thầm quay về trình soạn contenteditable cũ.

   Chuyển đổi theo từng giai đoạn (xem KE-HOACH-TRANG-QUAN-TRI-V2.md):
   chuyển dần từng khu vực sang src/admin/pages/*, chỉ xoá legacy.js khi mọi
   tính năng đã chuyển xong và test xanh.
   ========================================================================== */
import './bridge.js';
import './legacy.js';
