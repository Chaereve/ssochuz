# Báo cáo: gộp một trang quản trị + sửa lỗi sidebar & các lỗi admin

Ngày: 2026-09-23 · Nhánh: `arena/01a0cc8a-ssochuz`

## 1. Chủ trang yêu cầu

1. “Sidebar trong admin panel đang bị lỗi nghiêm trọng, không làm được gì hết.”
2. “Gộp admin lại luôn, đừng để v1 v2 gì hết.”
3. “Giải đáp thắc mắc về hình gửi về — Overflow KV (free).”
4. “Làm xong thì check bug toàn bộ kĩ lưỡng.”

## 2. Lỗi sidebar — nguyên nhân gốc và cách sửa

**Hiện tượng:** bấm nút “Thu gọn menu” xong là sidebar thành **cột trắng trống**,
không còn gì để bấm; F5 vẫn hỏng vì trạng thái nằm trong `localStorage`
(`ssochuz-admin-side`); trên máy nhỏ (≤900px) drawer mở ra cũng trống trơn theo.

**Nguyên nhân:** luật CSS thu gọn

```css
.v2app.v2collapsed .v2aside span, … {display:none}
```

ẩn TẤT CẢ `<span>` trong nav — gồm cả `span.admin-nav-icon` đang bọc icon SVG.
Rail 72px vì thế chỉ còn khoảng trống. jsdom không áp `@media` nên các bài test
cũ không thấy được lỗi này (đã đối chiếu riêng: luật trong `@media` không chạy).

**Cách sửa (src/admin/styles/admin.css):**

- Luật ẩn khi thu gọn chỉ áp cho chữ: `span:not(.admin-nav-icon)` — icon luôn còn.
- Cả khối thu gọn gói trong `@media(min-width:901px)`: drawer ≤900px **không bao
  giờ** bị trạng thái thu gọn ảnh hưởng.
- Rail thu gọn căn giữa icon (`justify-content:center`), chữ logo về `font-size:0`
  kèm chấm logo — nhãn nút vẫn nằm trong `title`/`aria-label` để trỏ chuột đọc được.
- Bump cache-buster `admin.html` → `?v=20260923a`.

**Test hồi quy:** `tests/t_admin_sidebar.js` — khoá 2 lớp (CSS tĩnh + DOM jsdom):
luật cũ không được quay lại, icon phải còn khi thu gọn, bấm tab khi thu gọn vẫn
chuyển trang, kẹt `localStorage=1` khi mở trang vẫn thoát được bằng một cú bấm.

## 3. Gộp một admin duy nhất (hết v1/v2/legacy)

- **Xoá hẳn bản cũ:** `admin.html` + `admin.js` + `src/admin.js` (legacy),
  `admin-legacy.html`.
- **Đổi tên bản mới thành tên chính thức:** `admin-v2.html → admin.html`,
  `admin-v2.js → admin.js`, `admin-v2.css → admin.css`, `admin-v2.js.map → admin.js.map`,
  source CSS `src/admin/styles/admin.css`, build script `tools/build_admin.mjs`
  (script npm: `build:admin`). Ghi chú: **lớp `.v2*` trong CSS/JSX là tên lớp nội
  bộ, giữ nguyên** để không vỡ giao diện/test — người dùng không bao giờ thấy.
- **Routing:** `/admin` mở thẳng `admin.html`; `/admin-v2`, `/admin-legacy` (+ `/`,
  + `.html`) là alias 200 về `/admin` trong `_redirects` — link cũ không chết.
  `/admin.html`, `/admin/` tự 308 về `/admin` đúng cơ chế Pages. `server.py` và
  `tests/mock_worker.mjs` cập nhật cùng một hành vi. `_headers`: `admin.js`/`admin.css`
  là `no-cache`, mọi route admin (kể cả alias) giữ `no-store + noindex`.
- **Chữ hiển thị:** bỏ pill “admin v2”, bỏ câu “admin cũ giữ ở /admin-legacy”
  ở cổng đăng nhập, bỏ nút “Mở admin cũ” trong Cài đặt, các toast/backup filename
  bỏ chữ v2.
- **Test:** xoá 3 bài của bản cũ (`t_admin_ui.js`, `cf_admin_test.js`,
  `t_doctor.js` — soi trùng tiêu đề chương là tính năng riêng của bản legacy);
  đổi tên suite `t_admin_v2_* → t_admin_*` và trỏ hết vào trang mới;
  `t_devserver.js` cập nhật kỳ kỳ vọng merge; `check_src.js`/`build_site.mjs`
  tách `admin.js` (bundle Preact) khỏi danh sách rút gọn thường; cập nhật
  `src/README.md`, `tests/README.md`, `worker/README.md`, `PARITY-CUTOVER.md`.

## 4. Lỗi thật bắt được khi quét bug toàn bộ (sweep lần đầu phủ tới admin mới)

`tests/t_sweep.js` trước giờ chỉ quét trang legacy — sau khi gộp, nó quét trang
Preact và bắt ngay 3 lỗi có từ trước, tất cả đều làm **sập trắng trang quản trị**:

1. **Tab “Tác giả” crash toàn app** — `UsersPanel` gọi `genreNameOf()` vốn
   **không tồn tại** ở đâu trong repo (`ReferenceError` lúc render → màn hình trắng
   ngay khi bấm sidebar). Port hàm vào `src/admin/utils/books.js`
   (genre → category → tag đầu → couple — dùng dữ liệu thật, không bịa thể loại).
2. **Khóa mật mã ở chế độ tĩnh** — `saveLock` không catch khi `onLock` ném lỗi
   (main đã toast rồi rethrow) → unhandled rejection làm crash tiến trình test /
   lỗi console trang thật. Vá: catch + chỉ tự báo lỗi cục bộ “chưa khớp”.
3. **Nút “link” trong soạn chương** — `window.prompt` ở môi trường không cài trả
   `undefined` (không phải `null`) → `url.trim()` văng. Vá: kiểm tra `url == null`.

Cùng nhóm lỗi: `HomepageCMS.save` không catch lỗi lưu trang chủ (quota hết /
Worker từ chối → rejection bỏ hoang, người dùng không thấy gì). Vá: bắt + toast.

Sweep giờ bấm hết mọi nút của admin (không Worker) với **0 lỗi JS**.

## 5. Overflow KV (free) — panel này nói gì (trả lời thắc mắc kèm hình)

Panel nằm ở **Cài đặt** (và bản rút gọn ở **Kiểm tra dữ liệu**). Nó phản ánh
`/api/health → overflow` của Worker (`worker/overflow.js`):

- **“Supabase: connected”** = Worker ĐÃ GẮN secret `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE`. **Không đồng nghĩa bảng đã có** — chưa chạy SQL tạo
  bảng `public.ssochuz_blobs` thì mọi lần ghi overflow vẫn lỗi.
- **Khi ghi overflow lỗi/chưa gắn:** bản đầy đủ tự rớt về **KV** (fallback) —
  không mất dữ liệu, chỉ là chưa đỡ được KV. Đó là ý “KV fallback”.
- **Bìa truyện** (upload qua tab Sửa bộ): Storage bucket public `covers` của
  Supabase (1 GB free, bucket tự tạo lần upload đầu), KV chỉ còn “stub” nhỏ kèm URL.
- **Ảnh chương:** khi connected, base64 của ảnh cũng overflow sang
  `ssochuz_blobs`/R2 (chữ cũ “Ảnh chương vẫn KV” là SAI — đã sửa panel);
  chỉ nằm KV khi chưa gắn hoặc ghi lỗi.
- **R2: unavailable** = chưa tạo binding `CZ_R2` — tuỳ chọn, 10 GB free; có gắn
  thì Worker ghi song song cả hai nơi, đọc ưu tiên R2 rồi mới Supabase.
- **Việc cần làm nếu muốn đỡ cho KV:** chạy đúng khối SQL trong panel MỘT LẦN
  (Supabase SQL Editor). RLS enable là đúng — Worker dùng `service_role` vốn đi
  quanh RLS, client không bao giờ giữ khoá này.

## 6. Kết quả kiểm thử

- Suite đầy đủ `node tests/run.js` (toàn bộ bài của repo) chạy lại sau khi gộp —
  tất cả đạt (xem output CI/terminal).
- Các bài mới/đổi: `t_admin_sidebar.js` (mới), `t_admin_core/online/writes/upload/
  budget/features.js` (đổi tên + trỏ trang mới), `t_devserver.js`, `t_mobile.js`
  (khối đổi nền admin viết lại cho trang Preact), `t_sweep.js` (phủ trang mới).
