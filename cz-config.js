/* ==========================================================================
   ssochuz — cấu hình chung cho MỌI trang (index / reader / admin)
   Sửa DUY NHẤT file này là đổi kênh dữ liệu + nhà cung cấp đăng nhập cho cả web.
   --------------------------------------------------------------------------
   CZ_API : URL Worker Cloudflare (xem worker/README.md).
            · Dán URL vào đây -> web đọc dữ liệu từ KV: sửa truyện trong
              trang quản trị là người đọc thấy ngay, KHÔNG cần build/deploy.
            · Để trống '' -> web dùng file tĩnh /data/*.json trong repo
              (vẫn chạy bình thường, chỉ là phải deploy lại khi sửa dữ liệu).
   CZ_STATS_DIRECT : true = đọc số liệu xếp hạng THẲNG từ Firebase cũ
            (chuseoz-library) thay vì từ Worker. Mặc định false: lượt đọc/bình
            chọn giờ nằm trên Cloudflare KV, KHÔNG cần Firebase nữa.

   --------------------------------------------------------------------------
   ĐĂNG NHẬP — mặc định dùng SUPABASE (không còn lỗi origin_mismatch của Google)
   --------------------------------------------------------------------------
   Vì sao đổi: Google Identity Services bắt khai "JavaScript origins" trong
   Google Cloud Console, thiếu một origin là báo `Lỗi 400: origin_mismatch`.
   Supabase làm phần đó thay mình: chỉ cần thêm domain web vào
   Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.

   3 bước để bật đăng nhập (xem HUONG-DAN-DANG-NHAP-BINH-LUAN.md):
     1. Tạo project ở https://supabase.com → Authentication → Providers → Google
        (dán Client ID/Secret của Google; Supabase tự lo redirect URI).
     2. Authentication → URL Configuration:
          Site URL          = https://<domain-web-của-bạn>
          Redirect URLs     = https://<domain-web-của-bạn>/**  (thêm cả bản xem trước)
     3. Project Settings → API: dán `Project URL` và `anon public` key xuống đây.
        (anon key là khoá CÔNG KHAI — an toàn khi đặt ở frontend, quyền thật nằm
         trong Row Level Security / phía Worker.)

   Có thể dán trong file này HOẶC mở trang /admin → tab "Cài đặt & đồng bộ" →
   mục "Đăng nhập (Supabase)" rồi lưu: cấu hình nằm trên KV, không cần deploy lại.
   ========================================================================== */
window.CZ_API = 'chuseoz-cms.kimtong1906.workers.dev';   // để '' nếu chưa dùng Worker
window.CZ_STATS_DIRECT = false;                           // số xếp hạng lấy từ KV; true = đọc thẳng Firebase cũ

/* --- NHÀ CUNG CẤP ĐĂNG NHẬP ---------------------------------------------
   'supabase' = dùng Supabase Auth (khuyến nghị)
   'google'   = dùng Google Identity Services trực tiếp (cách cũ, hay lỗi origin)
   ''         = tắt đăng nhập (bình luận sẽ báo cần đăng nhập)                 */
window.CZ_AUTH_PROVIDER = 'supabase';

/* --- SUPABASE (bắt buộc khi CZ_AUTH_PROVIDER = 'supabase') --------------- */
window.CZ_SUPABASE_URL = 'https://hnyzrkdlmvelbgcowztk.supabase.co';          // ví dụ https://abcdefghijk.supabase.co
window.CZ_SUPABASE_ANON_KEY = 'sb_publishable_G-a-An_7qBDMixg3G4kVDA_iwSon3O5';     // Project Settings → API → anon public

/* --- GOOGLE (dùng khi CZ_AUTH_PROVIDER = 'google', hoặc làm nút dự phòng) -- */
window.CZ_GOOGLE_CLIENT_ID = '164350528370-3jmoj701gt07kl4v832vpb25qsfd3qh2.apps.googleusercontent.com';

/* --- AI ĐƯỢC VÀO TRANG QUẢN TRỊ ------------------------------------------
   Người thường đăng nhập vẫn chỉ là người đọc: mục "Quản trị" bị ẨN hoàn toàn
   và /admin chặn ngay từ cửa. Thêm email vào đây để cấp quyền (không phân biệt
   hoa thường). Cũng có thể đặt biến ADMIN_EMAILS trong Worker để khớp cả hai phía. */
window.CZ_ADMIN_EMAILS = ['kimtong1906@gmail.com','freshstation01@gmail.com','chuseoz.ofc@gmail.com'];

/* Firebase: KHÔNG còn dùng để đăng nhập hay xếp hạng.
   CZ_FIREBASE_PROJECT chỉ để /api/stats/import-firebase kéo số CŨ về KV 1 lần. */
window.CZ_FIREBASE_PROJECT = window.CZ_FIREBASE_PROJECT || "chuseoz-library";

/* --- chuẩn hoá URL: dán thiếu https:// hay thừa / ở cuối đều vẫn chạy đúng ---
   (thiếu https:// thì trình duyệt hiểu thành đường dẫn trong web và mọi lệnh gọi
    Worker sẽ thất bại âm thầm — web lặng lẽ quay về dữ liệu tĩnh) */
(function () {
  function fix(u) {
    u = String(u || '').trim().replace(/\/+$/, '');
    return (u && !/^https?:\/\//i.test(u)) ? 'https://' + u : u;
  }
  window.CZ_API = fix(window.CZ_API);
  window.CZ_SUPABASE_URL = fix(window.CZ_SUPABASE_URL);
  /* danh sách email quản trị: luôn là mảng chữ thường, cắt khoảng trắng */
  var a = window.CZ_ADMIN_EMAILS;
  if (typeof a === 'string') a = a.split(',');
  window.CZ_ADMIN_EMAILS = (Array.isArray(a) ? a : [])
    .map(function (x) { return String(x || '').trim().toLowerCase(); })
    .filter(Boolean);
})();
