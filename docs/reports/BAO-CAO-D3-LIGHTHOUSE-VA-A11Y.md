# Báo cáo hoàn tất G10, Milestone C (D3), D1, D2, tối ưu sao lưu bìa & dọn workflow `tmp-*`

Ngày thực hiện: `2026-09-30` · Phiên bản đồng bộ: **`1.18.0`**

---

## 1. G10 — Hợp nhất số phiên bản về một nguồn duy nhất (`1.18.0`)

- **Vấn đề trước đây**: `package.json` (`1.0.0`), `worker/cms.js` (`VERSION = '1.18.0'`), và `worker/README.md` (`1.14.0`) mỗi nơi ghi một số phiên bản khác nhau.
- **Giải pháp**:
  1. Tạo `src/shared/version.js` xuất hằng số `export const VERSION = '1.18.0';`.
  2. `worker/cms.js` và `tools/build_worker.mjs` nhập trực tiếp `VERSION` từ `../src/shared/version.js` (cập nhật `worker/jsconfig.json` bao gồm `../src/shared/*.js`).
  3. Tạo `tools/check_version.mjs` kiểm tra (và hỗ trợ `--write` để đồng bộ) phiên bản giữa `src/shared/version.js`, `package.json`, `package-lock.json`, `worker/cms.js` và `worker/README.md`.
  4. Tích hợp `tools/check_version.mjs` vào `tests/run.js` và `npm run check:version`.

---

## 2. Milestone C & D3 — Đo Lighthouse tĩnh, trợ năng `axe-core`, bàn phím trình soạn thảo & cảnh báo dung lượng build

### 2.1. Kiểm toán trợ năng (`axe-core`) & Lighthouse tĩnh (`tools/audit_a11y.mjs`)
- Tích hợp `axe-core@^4.13.0` chạy tự động trên **24 màn giao diện** (7 trạng thái của 6 trang công khai + cổng đăng nhập admin + 14 tab quản trị + màn soạn truyện/chương Tiptap 3).
- **Các lỗi trợ năng đã phát hiện và khắc phục triệt để (`0 violations` / `612 passes`)**:
  - `src/cz-app.js`: Thêm liên kết bỏ qua điều hướng (`a.skip[href="#main"]`), gắn `id="main"` cho `<main>`, gắn `aria-label="Điều hướng chính"` cho `#czNav`, `aria-label="Đường dẫn trang"` cho `nav.crumb`, và bổ sung `role="presentation"` / `role="menuitem" aria-disabled="true"` trong `#czNotifMenu` (`role="menu"`).
  - `src/cz-story.js`: Bỏ `role="dialog"` không hợp lệ trên thẻ `<aside class="pan">`, gắn `role="heading" aria-level="2"` cho tiêu đề tấm trượt (`#tocSheet`, `#setSheet`), gắn `aria-label` phân biệt `#rdCrumb` / `#rdNav`, và `role="dialog" aria-label="Xem ảnh chương"` cho `#lightbox`.
  - `src/cz-space.js`: Bỏ `aria-pressed` không hợp lệ trên các nút `[role="tab"]` (giữ `aria-selected`).
  - `src/admin/components/*`: Chuyển `.v2gate` sang `<main>`, điền tiêu đề cột `Thao tác` cho bảng (`BookList.jsx`, `UsersPanel.jsx`, `RolesPanel.jsx`), gắn `aria-label` cho toàn bộ ô `<select>` và `<input type="file">` (`OperationalPanels.jsx`, `RolesPanel.jsx`, `ImageUploader.jsx`, `ChapterEditor.jsx`).
- **Dung lượng tải ban đầu (Lighthouse Performance)**:
  - Trang chủ (`index.html` + CSS + JS): **317.8 kB** raw / **82.1 kB** gzip (ngưỡng `< 140 kB` gzip).
  - Trang đọc truyện (`truyen.html` + CSS + JS): **360.7 kB** raw / **96.4 kB** gzip (ngưỡng `< 160 kB` gzip).
  - Trang quản trị (`admin.html` + CSS + JS): **404.0 kB** raw / **103.2 kB** gzip (ngưỡng `< 190 kB` gzip).

### 2.2. Kiểm tra dùng bàn phím trong trình soạn thảo (`tests/t_admin_editor_keyboard.js`)
- Danh sách chương (`aside.v2chapter-list`): hỗ trợ `ArrowUp` / `ArrowDown` / `Home` / `End` chuyển chương (tự động ghi nháp trước khi rời chương), `Alt+ArrowUp` / `Alt+ArrowDown` đổi thứ tự chương, và gắn `aria-current="true"` cho chương đang mở.
- Ô tên chương (`#v2ChapTitle` nối với `<label for="v2ChapTitle">`): nhấn `Enter` chuyển thẳng tiêu điểm (`focus`) vào vùng soạn thảo `.ProseMirror` (`role="textbox" aria-multiline="true" aria-label="Nội dung chương"`).
- Thanh công cụ định dạng (`role="toolbar" aria-label="Định dạng chương"`): mọi nút đều có `aria-label` và `aria-pressed`; hỗ trợ `ArrowLeft` / `ArrowRight` / `Home` / `End` di chuyển vòng quanh các nút; kích hoạt nút trả focus về `.ProseMirror`.
- Phím tắt trong vùng soạn thảo: `Ctrl/Cmd+Alt+N` tạo chương mới, `Ctrl/Cmd+S` lưu chương đang mở.

### 2.3. Cảnh báo khi file build to lên (`tools/bundle_budget.mjs`)
- Thiết lập ngưỡng cảnh báo mềm (`warnKb`) và trần cứng (`maxKb`) cho toàn bộ 11 tệp phát hành (`cz-*.js`, `cz.css`, `admin.css`, `admin.js`, `admin-editor.js`, `admin-docx.js`).
- `npm run build` in tỷ lệ `% trần` bên cạnh từng tệp và phát cảnh báo `⚠ CẢNH BÁO DUNG LƯỢNG` ngay khi vượt `warnKb`; `tests/t_admin_budget.js` chặn CI nếu vượt `maxKb`.

---

## 3. D1 — Dọn 32 file `.md` ở thư mục gốc vào `docs/reports/`

- Di chuyển toàn bộ 29 file `BAO-CAO-*.md` và 3 file `HUONG-DAN-*.md` vào `docs/reports/` (chỉ giữ `THIRD-PARTY-NOTICES.md` ở gốc).
- Rút gọn 32 dòng chặn lẻ trong `_redirects` thành 1 quy tắc `/docs/* / 301` và cập nhật `tools/check_secrets.js` để ngăn file `BAO-CAO-*` / `HUONG-DAN-*` phát sinh lại ở thư mục gốc.

---

## 4. D2 — Nâng cấp Tiptap 2 lên Tiptap 3 (`^3.31.4`)

- Nâng `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-text-align` từ `^2.27.3` lên `^3.31.4` (gỡ 2 gói rời `@tiptap/extension-link` và `@tiptap/extension-underline` vì đã tích hợp sẵn trong `@tiptap/starter-kit` v3).
- Cập nhật `src/admin/utils/richTextEditor.js` (`StarterKit.configure({ link: ..., trailingNode: false })`, kiểm tra `ed.isDestroyed`) và `src/admin/components/ChapterEditor.jsx` (`setContent(..., { emitUpdate: false })`, `setEditable(!importSaving, false)`).
- Kết quả `npm audit`: **`0 vulnerabilities`** (đã vá toàn bộ 25 cảnh báo bảo mật moderate của nhánh Tiptap 2 / ProseMirror cũ).

---

## 5. Việc nhỏ & Dọn dẹp GitHub Actions

- **Tối ưu `.github/workflows/mirror-covers.yml`**: Tắt trigger cập nhật `man-db` (`sudo rm -f /var/lib/man-db/auto-update`) và cài ImageMagick với `--no-install-recommends`, giảm thời gian bước cài đặt từ **4 phút 14 giây** xuống **~10–15 giây** (toàn bộ job còn dưới 1 phút).
- **Dọn 9 workflow `tmp-*` cũ**: Thêm bước tự động xoá các lượt chạy lịch sử (`workflow_runs`) của các workflow `tmp-*` (`.github/workflows/tmp-*.yml`) trong `.github/workflows/ci.yml` với quyền `actions: write` để trang Actions sạch hoàn toàn sau khi tất cả các lần chạy `tmp-*` bị xoá.
