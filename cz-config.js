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
window.CZ_API = 'chuseoz-cms.kimtong1906.workers.dev';   // để '' nếu chưa dùng Worker
window.CZ_STATS_DIRECT = true;                            // thử đọc số liệu Firebase trực tiếp
// Firebase Auth - chỉ Google (điền apiKey khi bật Auth trong console, để {} nếu chưa dùng)
window.CZ_FIREBASE_CONFIG = window.CZ_FIREBASE_CONFIG || {
  apiKey: "", // dán apiKey từ Firebase Console > Project settings > General
  authDomain: "chuseoz-library.firebaseapp.com",
  projectId: "chuseoz-library",
  appId: "" // optional
};
window.CZ_FIREBASE_PROJECT = window.CZ_FIREBASE_PROJECT || "chuseoz-library";

/* --- chuẩn hoá URL: dán thiếu https:// hay thừa / ở cuối đều vẫn chạy đúng ---
   (thiếu https:// thì trình duyệt hiểu thành đường dẫn trong web và mọi lệnh gọi
    Worker sẽ thất bại âm thầm — web lặng lẽ quay về dữ liệu tĩnh) */
(function () {
  var u = String(window.CZ_API || '').trim().replace(/\/+$/, '');
  window.CZ_API = (u && !/^https?:\/\//i.test(u)) ? 'https://' + u : u;
})();
