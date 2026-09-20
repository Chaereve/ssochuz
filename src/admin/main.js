/* ============================================================================
   src/admin/main.js · ĐIỂM VÀO DUY NHẤT của trang quản trị (bản 2.0)
   ----------------------------------------------------------------------------
   VÌ SAO có tệp này: trước đây toàn bộ trang quản trị nằm trong một tệp
   src/admin.js dài 3283 dòng, build bằng esbuild với `bundle: false` (các tệp
   gọi nhau qua biến toàn cục window.CZ). Muốn dùng trình soạn thảo cài qua npm
   (TipTap) thì bắt buộc phải BUNDLE, nên admin có đường build riêng:

       src/admin/main.js  --(esbuild bundle, iife, minify)-->  /admin.js

   Các tệp cz-*.js của trang người đọc GIỮ NGUYÊN `bundle: false`.

   Chuyển đổi theo từng giai đoạn (xem KE-HOACH-TRANG-QUAN-TRI-V2.md):
   - Giai đoạn 1: main.js nạp legacy.js (mã cũ, nguyên vẹn) để trang quản trị
     chạy y như trước, đồng thời mở sẵn hạ tầng module mới.
   - Giai đoạn 2-3: chuyển dần từng khu vực sang src/admin/pages/*.
   - Chỉ xoá legacy.js khi mọi tính năng đã chuyển xong và test xanh.
   ========================================================================== */

/* Hạ tầng thuần (chạy được cả trên Node) — nạp sẵn để các khu vực mới dùng. */
import { normalizeChapterHtml } from './lib/html-contract.js';
import { isPublic, countWords, readingMinutes } from './lib/chapter.js';

/* Mã quản trị hiện hành. Đây là IIFE, nạp vào là tự chạy. */
import './legacy.js';

/* Cầu nối cho các module sẽ viết ở giai đoạn sau + cho bài kiểm thử trình duyệt.
   KHÔNG lộ bất kỳ khoá bí mật nào ở đây — chỉ là hàm thuần xử lý chữ. */
const w = typeof window !== 'undefined' ? window : null;
if (w) {
  w.CZAdmin = Object.assign(w.CZAdmin || {}, {
    normalizeChapterHtml,
    isPublic,
    countWords,
    readingMinutes,
  });
}
