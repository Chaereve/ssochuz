/* ==========================================================================
   chuseoz — cấu hình chung cho MỌI trang (index / reader / admin)
   Sửa DUY NHẤT file này là đổi kênh dữ liệu cho cả web.
   --------------------------------------------------------------------------
   CZ_API : URL Worker Cloudflare (xem worker/README.md).
            · Dán URL vào đây -> web đọc dữ liệu từ KV: sửa truyện trong
              trang quản trị là người đọc thấy ngay, KHÔNG cần build/deploy.
            · Để trống '' -> web dùng file tĩnh /data/*.json trong repo
              (vẫn chạy bình thường, chỉ là phải deploy lại khi sửa dữ liệu).
   CZ_STATS_DIRECT : true = đọc số liệu xếp hạng THẲNG từ Firebase cũ
            (chuseoz-library) thay vì từ Worker. Mặc định false: lượt đọc/bình
            chọn giờ nằm trên Cloudflare KV, KHÔNG cần Firebase nữa.
            Chỉ bật true khi muốn đối chiếu với số cũ (cần mở quyền đọc Firestore).
   ========================================================================== */
window.CZ_API = 'chuseoz-cms.kimtong1906.workers.dev';   // để '' nếu chưa dùng Worker
window.CZ_STATS_DIRECT = false;                           // số xếp hạng lấy từ KV; true = đọc thẳng Firebase cũ
// Google Identity Services (đăng nhập người dùng + bình luận)
//   · Tạo OAuth Client ID kiểu "Web application" ở Google Cloud Console,
//     thêm JavaScript origin = domain web của bạn (vd https://chuseoz.pages.dev).
//   · Dán Client ID vào đây. Chi tiết: worker/README.md §7 và HUONG-DAN-DANG-NHAP-BINH-LUAN.md
window.CZ_GOOGLE_CLIENT_ID = '164350528370-3jmoj701gt07kl4v832vpb25qsfd3qh2.apps.googleusercontent.com';   // để '' sẽ tắt đăng nhập Google (bình luận hiện thông báo cấu hình)
/* Firebase: KHÔNG còn dùng để đăng nhập hay xếp hạng.
   · Đăng nhập Google: Google Identity Services + Worker (cz-auth.js).
   · Lượt đọc/bình chọn: Worker ghi lên KV (cz-app.js → /api/view, /api/vote).
   CZ_FIREBASE_PROJECT chỉ để /api/stats/import-firebase kéo số CŨ về KV 1 lần. */
window.CZ_FIREBASE_PROJECT = window.CZ_FIREBASE_PROJECT || "chuseoz-library";

/* --- chuẩn hoá URL: dán thiếu https:// hay thừa / ở cuối đều vẫn chạy đúng ---
   (thiếu https:// thì trình duyệt hiểu thành đường dẫn trong web và mọi lệnh gọi
    Worker sẽ thất bại âm thầm — web lặng lẽ quay về dữ liệu tĩnh) */
(function () {
  var u = String(window.CZ_API || '').trim().replace(/\/+$/, '');
  window.CZ_API = (u && !/^https?:\/\//i.test(u)) ? 'https://' + u : u;
})();
