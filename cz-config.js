/* ==========================================================================
   chuseoz — cấu hình chung cho MỌI trang (index / reader / admin)
   Sửa DUY NHẤT file này là đổi kênh dữ liệu cho cả web.
   --------------------------------------------------------------------------
   CZ_API : URL Worker Cloudflare (xem worker/README.md).
            · Dán URL vào đây -> web đọc dữ liệu từ KV: sửa truyện trong
              trang quản trị là người đọc thấy ngay, KHÔNG cần build/deploy.
            · Để trống '' -> web dùng file tĩnh /data/*.json trong repo
              (vẫn chạy bình thường, chỉ là phải deploy lại khi sửa dữ liệu).
   CZ_STATS_DIRECT : true = nếu Worker chưa có số liệu thì thử gọi thẳng
            Firebase cũ (chuseoz-library). Cần mở quyền đọc Firestore.
   ========================================================================== */
window.CZ_API = window.CZ_API || '';
window.CZ_STATS_DIRECT = true;
