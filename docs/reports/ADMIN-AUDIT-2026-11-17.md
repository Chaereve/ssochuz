# Audit toàn diện Admin Panel — 17/11/2026

> Phạm vi: toàn bộ hệ thống + từng trang chức năng của admin panel.
> Phương pháp: đọc code nguồn (mockup + admin-real.js + src/admin + worker/cms.js),
> chạy toàn bộ test admin, rebuild kiểm tra tính tái lập, smoke test jsdom + HTTP thật.

---

## 1. Kiến trúc — điểm quan trọng nhất cần hiểu

Repo hiện có **HAI admin song song**, chỉ một cái đang chạy thật:

| | **Admin đang chạy (LIVE)** | **Admin di sản (DEAD)** |
|---|---|---|
| File | `admin.html` + `admin-real.js` | `admin.js` + `admin.css` + `admin-editor.js` + `admin-docx.js` |
| Nguồn | `mockup/ssochuz-admin-mockup.html` (thiết kế) + `admin-real.js` (viết tay ở gốc) | `src/admin/` (Preact + Tiptap) |
| Route | `/admin` → `admin.html` | Không route nào nạp nó |
| Test | `t_admin_real`, `t_admin_no_demo`, `t_admin_kv_chip`, `t_admin_full_data`, … | Chạy qua fixture `tests/fixtures/admin-legacy.html` |

**Hệ quả thực tế:**

- Sửa `src/admin/**` **không có bất kỳ tác dụng nào** lên trang `/admin` đang chạy.
  Mọi sửa UI phải sửa ở `mockup/ssochuz-admin-mockup.html` (hoặc `admin-real.js`) rồi chạy `npm run build`.
- `admin.html` là **file sinh ra** bởi `tools/build_admin_html.mjs`. Sửa thẳng `admin.html`
  sẽ bị lần build sau ghi đè. (Đã kiểm chứng: rebuild ra file **giống hệt** bản commit — build tái lập tốt.)
- ~1,3 MB bundle di sản (`admin.js` 202 KB + `admin.js.map` 232 KB + `admin-editor.js` 388 KB +
  `admin.css` 68 KB + `admin-docx.js` 400 KB) vẫn được deploy, vẫn có trong `_headers`,
  vẫn được test qua fixture — nhưng **không trang nào tải**. Đây là nguồn gây nhầm lẫn lớn nhất
  của repo: người mới (hoặc AI) rất dễ sửa nhầm `src/admin` rồi tưởng đã xong.
- `admin-docx.js` là ngoại lệ: live admin **có dùng** nó (đọc `.docx` qua Web Worker, `admin-real.js:832`).

---

## 2. Luồng hệ thống tổng thể

### 2.1. Đăng nhập / kết nối (màn `dang-nhap`)

- Hai đường vào: **(a)** nhập URL Worker + `ADMIN_KEY` → ghi KV thật; **(b)** chế độ tĩnh
  (đọc `/data/registry.json`, chỉ đọc, mọi nút ghi bị chặn bởi `ensureOnline()`).
- `ADMIN_KEY` chỉ nằm ở `sessionStorage` (`cz_kv_key`), URL Worker ở `localStorage` (`cz_kv_api`).
  Đóng tab là mất key. Không có secret nào trong bundle (đã quét `check_secrets.js` — sạch).
- Đăng nhập Supabase/Google **chỉ dành cho độc giả**, không cấp quyền ghi — đúng thiết kế
  (quyền ghi do Worker xác nhận qua `x-admin-key`).
- Boot: nếu đã có key lưu → tự nối lại (`/api/health` → `/api/whoami` → `loadAll()`).
  Lỗi phân loại thành `badkey` / `network` / `static` và hiện chip trạng thái khác nhau.
- **Không có RBAC ở live admin**: ai có `ADMIN_KEY` đều là super admin. Bản di sản có
  `visibleTabs()` theo role (author/moderator/editor…) nhưng live admin đã bỏ hẳn —
  tab Tác giả / Vai trò không còn tồn tại.

### 2.2. Quota KV (chống cháy trần free-tier)

- `WRITES` lấy từ `/api/admin/kv` (`writesToday`), ngưỡng 800 (cảnh báo) / 950 (nguy hiểm) / 1000 (chặn).
- Mọi hàm ghi đều qua `ensureOnline()` + tự tăng `WRITES` sau khi ghi thành công.
- Chip topbar, banner và dòng quota trên Dashboard **cùng đọc một nguồn** (đã vá ở vòng 13,
  test `t_admin_kv_chip` 121 kiểm tra khoá chặt).
- Điểm yếu: `WRITES` là đếm phía client sau khi ghi — nếu ghi thất bại giữa chừng
  (book ghi được, registry fail) thì số đếm lệch. Bản di sản có cơ chế `pendingRegistry` +
  nút "Thử lại registry"; live admin **không có** — ghi registry là một phát duy nhất.

### 2.3. Mô hình dữ liệu (điểm khéo nhưng mong manh)

- Render functions của mockup đọc các mảng `SAMPLE_*` (SAMPLE_BOOKS, SAMPLE_METRICS, SAMPLE_STATS…).
  `admin-real.js` **tái sử dụng chính các mảng đó** để chứa dữ liệu thật: `clearPrototypeSeed()`
  xoá seed mẫu trước render đầu tiên, `hydrate()` đổ registry thật vào, các `load*()` đổ
  comments/reports/stats/log vào. Cách này giữ nguyên thiết kế nhưng rất khó đọc —
  sửa render mà quên là lộ số mẫu ra ngoài. Test `t_admin_no_demo` (96 kiểm) đang canh chỗ này.

### 2.4. Bảo mật

- `sanitizeEditorHtml()` 2 lớp (regex bỏ script/on*/javascript:/data:/blob: trước khi parse,
  rồi DOM allowlist) — áp cho editor, preview, paste. Đã có test chèn payload ở 14 route.
- Mọi dữ liệu người dùng đi qua `esc()` trước khi vào `innerHTML`.
- CSP trong `_headers` cho phép inline script/style (admin.html có 1 `<style>` + 2 `<script>` inline)
  nên giao diện chạy nguyên vẹn; `_redirects` chặn `/src/*`, `/worker/*`, `/tests/*`, `/tools/*`.
- `/admin` có `no-store` + `noindex`. Source map `admin.js.map` bị chặn 301 (không lộ `src/admin`).

### 2.5. Điều hướng & phím tắt

- Hash routing (`#dashboard`, `#thu-vien`, …), 13 tab / 5 nhóm + màn đăng nhập.
- Phím: `Ctrl/Cmd+K` mở palette tìm kiếm, `Ctrl/Cmd+S` lưu (theo route), `Ctrl/Cmd+N` hoặc
  `Ctrl/Cmd+Alt+N` thêm chương, `Esc` đóng modal/palette/drawer, focus-trap trong modal.
- Responsive: drawer 360px, rail thu gọn chỉ-icon, breakpoint 1100/900/640px, không tràn ngang
  (đã kiểm ở 360px trong test).

---

## 3. Từng trang chức năng (13 tab live)

### 3.1. Dashboard (`dashboard`) — ✅ tốt
- 6 ô số liệu từ KV thật (bộ / chương / 18+ / thiếu thông tin / quota ghi / lượt đọc KV),
  biểu đồ lượt đọc 14 ngày, "Việc cần làm hôm nay" (báo lỗi chưa xử lý, nghi spam, bộ đang khóa),
  "Việc nên xem lại" (ẩn khỏi trang chủ, thiếu mô tả/bìa/slug/năm, nhãn chương lệch, sắp ra mắt lâu),
  "Mới cập nhật" 12 bộ. Mọi con số đều tính từ registry/stats thật — không còn số cứng.
- Nút "Đọc lại dữ liệu" gọi `loadAll()` đầy đủ 6 nguồn.

### 3.2. Thư viện (`thu-vien`) — ✅ tốt
- Tìm theo tên/tác giả/couple/slug, lọc 6 chiều (hoàn thành, độ tuổi, xuất bản, hiển thị, khóa),
  sắp xếp, phân trang, chọn nhiều + thao tác hàng loạt (đặt hoàn thành/đang cập nhật, xuất bản,
  lưu trữ, bật/tắt 18+), xoá có xác nhận gõ slug. Bìa + badge trạng thái đầy đủ.
- Bulk ghi **một lượt registry** (không ghi từng book) — tiết kiệm quota.

### 3.3. Thêm bộ (`them-bo`) — ✅ tốt
- Form đầy đủ: tên, slug tự sinh, tác giả, couple (nhiều dòng + gợi ý), năm, thể loại, mô tả,
  trạng thái xuất bản/hiển thị, 18+, chương đầu (tuỳ chọn), ảnh bìa (upload qua `/api/img`).
  Xem trước thẻ truyện trực tiếp. Tạo xong ghi book + registry.

### 3.4. Sửa bộ (`sua-bo`) — ✅ tốt, có 1 điểm cần lưu ý
- Sửa metadata, đổi slug (tự chuyển book KV + cập nhật slides/editorChoice/schedule tham chiếu),
  khóa/mở khóa mật mã (`/api/lock/set`), nhân bản bộ (không clone lock), xoá bộ.
- ⚠️ **Lưu ý:** đổi slug là thao tác nhiều bước (ghi book mới → xoá book cũ → ghi registry).
  Nếu fail giữa chừng có thể để lại book mồ côi. Bản di sản xử lý kỹ hơn (G3b).
  Live admin chưa có cơ chế bù trừ tương đương.

### 3.5. Chương (`chuong`) — ⚠️ yếu nhất trong 13 tab
- Trình soạn là **contenteditable + `execCommand`** (bold/italic/underline/H2/H3/quote/list/
  căn giữa/link/ảnh/ngăn cách), **không phải Tiptap** như bản di sản. Hệ quả:
  undo/redo phụ thuộc trình duyệt, paste HTML phức tạp dễ vỡ cấu trúc, không có
  kiểm tra từ/đọc theo thời gian thực như Tiptap.
- Điểm cộng: sanitize 2 lớp, chặn blob:/data: chưa upload, nháp cục bộ theo từng chương
  (localStorage), hẹn giờ/ẩn chương, nhập `.txt`/`.docx` nhiều chương (qua `admin-docx.js`),
  upload ảnh vào vị trí con trỏ, preview độc giả, lưu 1 chương qua `PUT /api/book/:slug/chapter`
  (nhanh, 1 lượt ghi thay vì ghi cả bộ).
- ⚠️ `loadBook()` **không có trạng thái lỗi/thử lại**: book 404 hoặc 500 thì editor im lặng
  ở trạng thái cũ, không báo rõ như bản di sản (G3 tách "tải lỗi" vs "chưa có dữ liệu").
  Đây là lỗ hổng UX lớn nhất còn lại của live admin.

### 3.6. Bình luận (`binh-luan`) — ✅ tốt
- Đọc `/api/admin/comments`, lọc theo bộ + từ khóa + chỉ nghi spam (link/lặp ký tự/IN HOA),
  xoá có double-confirm (gõ XOÁ). Hiển thị chương mà bình luận thuộc về.

### 3.7. Báo lỗi (`bao-loi`) — ✅ tốt
- Đọc `/api/admin/reports`, lọc theo trạng thái, đánh dấu đã xử lý / mở lại qua
  `PATCH /api/admin/reports`. Đếm "chưa xử lý" đẩy lên chuông thông báo topbar.

### 3.8. Phiếu bầu (`phieu-bau`) — ✅ tốt
- Đọc voters theo bộ (`/api/admin/voters`), gỡ phiếu đã chọn theo nhóm chương
  (`/api/admin/vote-remove`), reset phiếu bộ/chương (`/api/admin/votes/reset`) — đều có xác nhận mạnh.
- Chỉ hỏi voters của những bộ **thật sự có phiếu** (lấy từ stats) — không bắn hàng chục request.

### 3.9. Homepage CMS (`homepage-cms`) — ✅ tốt (đã qua 2 vòng vá lớn)
- Hero slides (tối đa 8, sắp xếp/gỡ/thêm, xem trước desktop/mobile), Chuyển thể Series (12 bộ),
  lịch ra chương, banner thông báo. **Sửa tại chỗ, chỉ ghi KV khi bấm Lưu** (1 lượt ghi) —
  bản cũ ghi sau mỗi lần bấm nên mất phần đang sửa dở (đã vá ở vòng 17).
- Chặn mềm có chỉ đích: lịch thiếu thứ/bộ thì báo rõ dòng nào, không chặn lưu phần còn lại.
- `slides: []` là hợp lệ (web tự lấy 5 bộ mới nhất) — không bắt buộc có slide.

### 3.10. Thống kê (`thong-ke`) — ✅ tốt
- Top lượt đọc / phiếu thích / người bầu / hôm nay, biểu đồ 14 ngày, "Phiếu theo chương"
  đọc đúng `chapVotes` từ `/api/admin/stats` (đã vá ở vòng 18 — trước đó đọc nhầm state nên luôn rỗng).

### 3.11. Kiểm tra dữ liệu (`kiem-tra-du-lieu`) — ✅ tốt
- Audit KV (key/byte theo prefix), quét book (thiếu book, lệch số chương, chương rỗng —
  chương chỉ có ảnh không bị báo oan), nút "Sửa" mở **đúng bộ** cần sửa (đã vá vòng 18b),
  đếm lại số chương (`/api/recount`, xác nhận gõ ĐẾM LẠI), chuyển overflow sang Supabase/R2
  (`/api/admin/migrate-overflow`).

### 3.12. Nhật ký (`nhat-ky`) — ✅ tốt
- 200 thao tác gần nhất từ `/api/admin/log` (ai, lúc nào, kết quả, lỗi).

### 3.13. Cài đặt (`cai-dat`) — ✅ tốt
- Backup JSON (registry + comments + reports + stats + settings + schedule — đủ, đã vá vòng 18c),
  khôi phục từ backup (ghi đè, xác nhận KHÔI PHỤC), nhập chương từ Blogger, đồng bộ metadata
  Blogger, flush stats cache, đếm lại số chương, hướng dẫn SQL overflow.

---

## 4. Kết quả kiểm thử (đã chạy thật)

**Live admin — tất cả ĐẠT:**

| Bài | Kiểm tra | Kết quả |
|---|---|---|
| `t_admin_real` (vòng 10) | 112 request tới Worker giả, ghi thật 6 luồng | ✅ 0 lỗi |
| `t_admin_no_demo` (vòng 12) | 96 kiểm — không còn dữ liệu mẫu | ✅ 0 lỗi |
| `t_admin_kv_chip` (vòng 13) | 121 kiểm — chip quota thật | ✅ 0 lỗi |
| `t_admin_full_data` (vòng 14) | 144 kiểm — 13 tab đọc đủ dữ liệu | ✅ 0 lỗi |
| `t_admin_stats_fix` (vòng 18) | 15 kiểm — phiếu theo chương | ✅ 0 lỗi |
| `t_admin_doctor_fix` (vòng 18b) | 10 kiểm — sửa đúng bộ | ✅ 0 lỗi |
| `t_admin_settings` (vòng 18c) | 17 kiểm — backup đủ | ✅ 0 lỗi |
| `t_admin_moderation` (vòng 18d) | 18 kiểm — kiểm duyệt | ✅ 0 lỗi |
| `t_admin_series_page` (vòng 15) | 97 kiểm — trang Series | ✅ 0 lỗi |
| `t_admin_homepage_ux` (vòng 17) | 71 kiểm — sửa tại chỗ | ✅ 0 lỗi |
| `t_admin_homepage_audit` (vòng 17b) | 15 lỗi thật đã vá | ✅ 0 lỗi |
| `t_admin_chapter_editor` | 73 assertions | ✅ 0 lỗi |
| `t_admin_flow` | 52 kiểm — đổi slug, tham chiếu | ✅ 0 lỗi |
| `t_admin_rail` / `t_admin_sidebar` / `t_admin_dirty_registry` | rail, sidebar, registry bẩn | ✅ 0 lỗi |

**Di sản (qua fixture) — tất cả ĐẠT:** `t_admin_core`, `t_admin_online`, `t_admin_writes`,
`t_admin_chapter`, `t_admin_chapter_state`, `t_admin_book_integrity`, `t_admin_editor_lazy`,
`t_admin_editor_keyboard`, `t_admin_upload`, `t_admin_features`.

**Kiểm tra khác:**
- Rebuild `admin.html` từ mockup + admin-real → **giống hệt** bản commit (tái lập tốt).
- `check_secrets.js` — sạch. `check_version.mjs` — đồng bộ 1.20.0.
- Smoke jsdom: `/admin` render dashboard, 0 lỗi JS. HTTP: `/admin` 200, 274 KB.
- ⚠️ `t_admin_budget` và `t_admin_docx` cần `npm install` ở thư mục gốc (esbuild/mammoth)
  nên chưa chạy được trong môi trường này — không phải lỗi code.
- ⚠️ `tools/audit_a11y.mjs` lỗi thiếu `axe-core` ở `node_modules` gốc — cần `npm install` gốc.

---

## 5. Vấn đề tồn đọng (theo mức độ)

### 🔴 Cao
1. **Hai admin song song gây nhầm lẫn nghiêm trọng.** `src/admin/` (Preact) là code chết
   nhưng trông như nguồn chính. Mọi người sửa nhầm chỗ sẽ không thấy thay đổi.
   → Cần quyết định: xoá hẳn `src/admin` + bundle di sản, hoặc ghi rõ cảnh báo trong
   `src/README.md` + đầu `tools/build_admin.mjs` (đã có một phần).
2. **Tab Chương không có trạng thái lỗi tải.** Book 404/500 → editor im lặng, không "Thử lại".
   Bản di sản đã giải quyết (G3) nhưng live admin chưa có. Rủi ro: admin tưởng đang sửa
   bản mới trong khi thực ra đang sửa bản cũ/rỗng.

### 🟡 Trung bình
3. **Trình soạn contenteditable yếu hơn Tiptap** (undo, paste, danh sách lồng nhau).
   Chấp nhận được nếu không cần tính năng giàu, nhưng cần biết giới hạn.
4. **Không có RBAC / tab Tác giả / Vai trò** ở live admin. Mọi người có key đều toàn quyền.
   Nếu sau này muốn phân quyền (editor/moderator), phải làm lại từ đầu.
5. **Đổi slug không có bù trừ khi fail giữa chừng** — có thể để lại book mồ côi trên KV.
6. **Mô hình `SAMPLE_*` chứa dữ liệu thật** — dễ vỡ khi sửa render. Cần comment rõ hoặc
   tách thành `LIVE_*` ở vòng refactor sau.

### 🟢 Thấp
7. Bundle di sản vẫn deploy (~1,3 MB) — tốn dung lượng Pages, không ảnh hưởng tốc độ
   vì không được tải, nhưng nên dọn.
8. `audit_a11y` cần `npm install` gốc mới chạy được.
9. `admin.html` là file sinh — cần kỷ luật "không sửa tay admin.html".

---

## 6. Kết luận

Hệ thống admin **đang chạy tốt**: 13/13 tab đọc/ghi KV thật, không còn dữ liệu mẫu,
quota được canh, bảo mật editor có sanitize 2 lớp, toàn bộ test admin đều đạt,
build tái lập được. Hai việc nên làm sớm nhất là **(1)** xử lý dứt khoát admin di sản
để tránh sửa nhầm, và **(2)** bổ sung trạng thái lỗi/thử lại cho tab Chương.

---

## 7. Bổ sung cùng ngày · Nháp phải là chưa xuất bản

Trong lúc rà tab Chương theo yêu cầu, phát hiện một lỗi nghiệp vụ (không nằm trong
danh sách vấn đề ở mục 5) và đã sửa:

- **Triệu chứng:** chương mới (`+ Thêm`), chương nhập từ tệp `.txt/.docx`, chương đầu
  của bộ mới đều được ghi `status: 'published'` — lưu là độc giả thấy ngay. Tệ hơn,
  chọn trạng thái **Nháp** rồi lưu thì chương **vẫn hiện** ngoài web, vì
  `isChapterPending()` chỉ giữ `hidden` và `scheduled` tương lai.
- **Đã sửa:** `draft` giờ là *chưa xuất bản* ở cả 3 tầng (luật dùng chung
  `src/shared/schedule.js`, admin `admin-real.js` + mockup, worker `worker/cms.js`);
  chương mới/nhập tệp/bộ mới mặc định Nháp; thêm nút **Xuất bản ngay** ghi 1 lượt KV;
  trạng thái lạ được chuẩn hoá bằng allowlist thay vì lọt xuống tầng đọc.
- **Kiểm thử:** `tests/t_chapter_draft.js` — 41 kiểm tra (luật, admin DOM, worker thật),
  cùng toàn bộ bài admin/schedule cũ vẫn đạt.
- **Chi tiết + lưu ý triển khai:** `docs/features/nhap-chuong-chua-xuat-ban.md`.

Lưu ý vận hành: chương nào đang mang `status: 'draft'` trong KV sẽ ẩn khỏi web sau khi
deploy — đúng nghĩa Nháp. Duyệt lại ở tab Chương (nhãn **Nháp**, đếm "· n nháp") rồi
bấm **Xuất bản ngay** cho những chương cần lên sóng.

---

## 8. Rà soát "giữ / bổ sung / bỏ" và cải thiện giao diện (cùng ngày, lượt 2)

Yêu cầu: *"kiểm tra admin còn thiếu tính năng gì, cái nào nên bỏ, cải thiện giao diện"*.
Lần này rà **admin.html (bản phát hành)**, không chỉ mockup — nhiều con số cứng trong
mockup đã được `tools/admin_prod_replacements.json` thay bằng số đếm thật lúc build,
nên chỉ những gì còn trong `admin.html` mới là lỗi thật của sản phẩm.

### 8.1 Đã sửa trong lượt này

| # | Vấn đề (đã xác minh trên admin.html) | Cách sửa |
|---|---|---|
| 1 | **Tab Nhật ký vô dụng**: worker chỉ lưu `{at,text,who}` ⇒ 5 cột mà "Thao tác" và "Đối tượng" in *cùng một chuỗi*, "Kết quả" luôn "Thành công"; không lọc, không tìm, không phân trang. | `logAct(env,text,req,meta)` ghi thêm `kind` + `target` (18 điểm gọi đã gắn loại). Bảng còn **4 cột có nghĩa** (Thời gian · Người · Hành động · Đối tượng), thêm **lọc theo loại**, **tìm chữ**, phân trang 20 dòng, dùng nút **Đọc lại duy nhất ở đầu tab**, giờ dạng `dd/mm/yyyy hh:mm`. Bản ghi cũ không có `kind/target` vẫn đọc được (suy loại từ câu chữ, cột Đối tượng để "—" thay vì lặp lại câu). |
| 2 | **Tab Chương không có tìm/lọc**: 38 chương của một bộ chỉ cuộn tay; không biết đang lọc gì; đổi bộ phải mở `<select>` 67 dòng. | Thêm **ô tìm chương** (tên hoặc số chương, cập nhật tại chỗ nên không mất focus), **5 nút lọc trạng thái** kèm số đếm, bộ đếm "x/tổng chương · n nháp", **chip 6 bộ mới cập nhật** + **hàng đợi xuất bản** (Nháp / Chờ duyệt / Hẹn giờ / Chưa lên sóng) bấm được để sang Thư viện đúng bộ lọc. |
| 3 | **Tab Chương không có trạng thái tải**: `loadBook` lỗi thì im lặng, khung soạn hiện dữ liệu cũ ⇒ biên tập viên tưởng bộ trống. | `CHAPTER_LOAD` (`loading/ok/error`, `missing` khi 404). 404 ⇒ "Bộ này chưa có dữ liệu chương" (không phải lỗi, có nút Mở Sửa bộ); lỗi 500/mạng ⇒ hộp `role="alert"` **"Không tải được dữ liệu chương"** + lý do + **Thử lại**. Đổi bộ lỗi KHÔNG còn tự quay về bộ cũ (trước đây revert làm giấu lỗi). |
| 4 | **Nhãn ngày ISO** `2026-11-11` trên trục biểu đồ; ô "Ngày có chuỗi" fallback về `SAMPLE_READS` khi KV rỗng ⇒ hiện "1" dù chưa có ngày nào. | `dayLabel()` → `11/11`; ô đếm hiện `0` khi đã nối Worker mà chưa có dữ liệu. |
| 5 | **Bình luận**: không biết bình luận thuộc **chương nào**; ghi chú "Xoá (2 lần) · Không có chức năng duyệt" nằm lẫn dưới danh sách; nút ghi "Xoá (2 lần)" như một nhãn kỹ thuật. | Dòng bình luận hiện `Bộ · chương N · slug · ngày`; nút gọn **Xoá** + tooltip/aria-label nói rõ xác nhận 2 bước; ghi chú chuyển lên đầu tab, nói hậu quả thật ("xoá vĩnh viễn trên KV, xoá cả câu trả lời"). Dùng nút **Đọc lại** chung ở đầu tab, không giữ nút tải lại trùng trong card. |
| 6 | **Thư viện** thiếu thông tin quyết định: không thấy bộ nào vừa cập nhật, không thấy lượt đọc; trạng thái rỗng không có lối đi. | Thêm cột **Cập nhật** (`dd/mm`) và **Đọc** (`/api/admin/stats`), trạng thái rỗng có nút **Thêm bộ**, và mỗi dòng có nút **Chương** mở thẳng tab Chương đúng bộ. |
| 7 | **Trùng lặp thao tác nguy hiểm**: "Đếm lại số chương" nằm ở cả Cài đặt và Kiểm tra dữ liệu. | Bỏ ở Cài đặt, để lại **một chỗ duy nhất** (Kiểm tra dữ liệu) + câu giải thích lý do. |

Kiểm thử: `tests/t_admin_real.js` thêm 33 kiểm tra cho các luồng trên (tìm/lọc chương,
404 vs 500, Thử lại, lọc/tìm nhật ký, nút Chương ở Thư viện) — **0 lỗi**;
`tests/t_chapter_draft.js` thêm 4 kiểm tra cho `kind/target` của nhật ký — **45/45**.

### 8.2 Giữ nguyên (đã đúng, không nên "cải thiện" thêm)

- **13 tab + route ẩn `dang-nhap`**: phân nhóm Nội dung / Cộng đồng / Hệ thống hợp lý, không gộp.
- **Xác nhận mạnh** (gõ `XOÁ` / `ĐẾM LẠI` / slug) cho thao tác phá huỷ: giữ, vì mọi thao tác đều ghi thẳng KV.
- **Chip quota + banner đỏ** khi gần trần ghi KV, **chip KV** trên topbar: giữ.
- **Nháp = chưa xuất bản** (mục 7) và nút **Xuất bản ngay**: giữ.
- **Bảng Thư viện 20 dòng/trang**: mockup để 8 là cố ý cho prototype, bản phát hành đã là 20 — *không* phải lỗi.
- **Số đếm trên Dashboard** ("Việc cần làm hôm nay", "Đang ẩn khỏi trang chủ"…): đã là số thật từ `state`, không phải số cứng — *không* phải lỗi.
- `/api/admin/voters` + `/api/admin/vote-remove`: **đã** được dùng (tab Phiếu bầu có ô chọn bộ, cột Phạm vi, gỡ theo phiếu, reset theo chương).

### 8.3 Nên bổ sung (chưa làm — cần đổi dữ liệu/worker, ghi lại để quyết định)

1. **Duyệt/ẩn bình luận** thay vì chỉ xoá: cần thêm trạng thái `hidden` vào `cmt:<slug>` và cho trang đọc lọc ra. Hiện worker chỉ có xoá (kèm xoá dây chuyền câu trả lời).
2. **Trả lời bình luận từ admin**: worker đã hỗ trợ `parentId`, nhưng admin chưa có ô trả lời (phải vào web).
3. **Chuẩn hoá 58/67 bộ thiếu `pubStatus`/`visibility`** trong registry: bộ lọc "xuất bản" hiện dựa trên giá trị mặc định (`published`/`public`) nên đúng nhưng gây hiểu nhầm "đã đặt". Nên có một lần ghi bù (backfill) thay vì thêm cảnh báo lặp lại trong từng tab.
4. **RBAC / nhiều vai trò**: hiện chỉ một `ADMIN_KEY` (hoặc người có `role: admin`). Muốn phân quyền biên tập/kiểm duyệt thì phải thêm bảng vai trò ở Worker — ngoài phạm vi một lượt sửa giao diện.
5. **Sửa nhanh inline ở Thư viện** (đổi trạng thái/tình trạng ngay trên dòng) và **cột "Lượt đọc theo tuần"**: đã có dữ liệu trong `/api/admin/stats`, chỉ cần thêm UI.
6. **Editor contenteditable** vẫn yếu hơn Tiptap (undo, dán ảnh, heading) — nâng cấp là dự án riêng.

### 8.4 Nên bỏ / đã bỏ

- ~~Cột "Kết quả" trong Nhật ký~~ (luôn "Thành công" — không mang thông tin).
- ~~Cột "Bộ được bầu" trong bảng Phiếu bầu~~: bảng đã lọc theo đúng một bộ nên cột này lặp lại ô chọn bộ phía trên. *(ghi nhận, chưa xoá vì cần đối chiếu ảnh chụp cũ của owner)*
- ~~Nút "Đếm lại số chương" thứ hai ở Cài đặt~~ (đã bỏ ở 8.1 mục 7).
- ~~Khối "BẢNG ĐIỀU KHIỂN DEMO · MOCKUP"~~: build đã gỡ từ vòng 12 — không còn trong admin.html.
- **Không nên bỏ**: "Lưu trữ tràn (tuỳ chọn)" (worker có `/api/admin/migrate-overflow` thật), "Sao lưu/khôi phục JSON" (đã gom 6 khoá KV), "Kiểm tra dữ liệu" (đối chiếu registry ↔ book thật).

### 8.5 Kiểm tra sâu lần nữa · 17/11/2026

Theo yêu cầu kiểm tra lại bằng thực thi, lần này đối chiếu từng listener riêng trên **`admin.html` bản phát hành** (sau build/replacements), rồi kiểm tra tương tác bằng jsdom. Audit trước đó chỉ xác định có `case` ở đâu đó trong file nên đã bỏ sót case đặt nhầm event listener.

| Lỗi phát hiện | Nguyên nhân và sửa | Xác nhận hồi quy |
|---|---|---|
| Nút **Mở bộ** trên dòng Báo lỗi bấm không làm gì; nếu bộ đã bị xoá thì cũng không có thông báo rõ. | `open-report-book` nằm trong listener `input`, không phải `click`; chuyển sang `click`, kiểm tra slug còn trong registry, nếu không thì báo toast và điều hướng sang Thư viện. | jsdom: bộ còn tồn tại mở đúng tab Sửa bộ; slug đã mất mở Thư viện và hiện toast. |
| Nút **Bỏ lọc** Báo lỗi không hoạt động. | `clear-rep-book` cũng nằm nhầm listener `input`; chuyển sang `click`. | jsdom: bấm nút xoá `state.repBook` và trả lại đủ dòng. |
| Đổi bộ ở **Phiếu bầu** không lọc lại bảng, trong khi thao tác Gỡ/Reset đọc bộ đang chọn. | `vote-book` nằm trong listener `click`, không phải `change`; chuyển sang `change`, đồng thời reset trang và lựa chọn phiếu. Đây là rủi ro thao tác nhầm bộ. | Hồi quy với hai bộ có phiếu: đổi select bằng `change` cập nhật state và bảng chỉ còn phiếu của bộ mới. |
| Hai select lọc **Báo lỗi** và **Kiểm tra dữ liệu** không được xử lý theo chuẩn `change`. | `rep-book` và `issue-filter` chỉ nằm trong listener `input`; chuyển cả hai vào `change`. | Test chọn bộ lọc Báo lỗi để chỉ còn dòng đúng bộ; test mức độ Kiểm tra dữ liệu để state và số dòng hiển thị khớp. |
| Có hai nút đọc lại trong mỗi card **Bình luận/Nhật ký**, ngoài nút đầu tab. | Bỏ nút card và hai handler không còn dùng (`reload-comments`, `reload-log`); giữ một nút chung ở đầu tab. | `t_admin_real.js` xác nhận Nhật ký dùng nút đầu tab; không còn handler/nút trùng. |

**Báo động giả đã loại trừ:** lần quét select cũ báo bốn bộ lọc Thư viện “không tác dụng”. Kiểm tra bằng dữ liệu registry thật cho thấy các lựa chọn trong lượt quét không khớp dữ liệu (ví dụ lọc riêng tư trả 0), còn khi chọn các điều kiện có dữ liệu thì 18+, khóa, hiển thị và A–Z cập nhật đúng. Đã đưa hồi quy 18+, khóa, hiển thị kết hợp và A–Z vào `t_admin_real.js`.

**Kết quả kiểm tra ban đầu:** `t_admin_real.js` đạt (0 lỗi, 138 request Worker giả); audit jsdom 13 tab đạt 0 lỗi JS; năm `tools/check_*.mjs` đều đạt; build `admin.html` chạy lại được. Lần chạy đầu chưa có các gói `axe-core`, `esbuild`, `mammoth`; `t_follow_only.js` cũng được sửa dùng đường dẫn theo `__dirname` để chạy được cả khi gọi từ runner.

**Kiểm tra cuối trước merge (sau `npm ci`):** toàn bộ test trong `tests/run.js` đạt, ngoại trừ `tools/audit_a11y.mjs` thất bại đúng một ngưỡng: payload gzip admin **129 kB**, giới hạn **125 kB**. Trong audit trợ năng vẫn có **585 lượt đạt, 0 vi phạm axe**; các trang home/reader nằm trong ngân sách. Đây là lỗi ngân sách đã tồn tại ở commit cha (admin HTML + `admin-real.js`: **128.67 kB gzip** theo cách cộng của audit); commit hiện tại tăng khoảng **0.39 kB** lên 129.06 kB, nên không phải lỗi mới làm vượt ngưỡng nhưng vẫn làm tăng nhẹ payload. Không hạ ngưỡng kiểm thử để che lỗi; ghi nhận đây là việc cần xử lý/duyệt ngoại lệ trước khi coi pipeline hoàn toàn xanh. Các test admin mục tiêu, test moderation/doctor/flow/homepage/chapter draft, 5 `tools/check_*.mjs`, `check_src`, `check_secrets`, `check_headers` đều đạt; build tái lập ra `admin.html` 282601 byte, `admin-real.js?v=c22f1bbe85`.

### 8.6 Xử lý ngân sách payload admin

Không tăng trần kiểm thử. Phần `DOCS_HTML` là tài liệu lịch sử dài, chỉ cần khi admin mở **Tài liệu bàn giao**, nên build `admin.html` nay tách nó thành `admin-docs.html`; modal chỉ GET `/admin-docs` khi được mở. Mockup vẫn giữ tài liệu nhúng để mở offline như trước. `_headers` đặt `no-store` và `noindex` cho cả URL sạch lẫn tệp `.html`.

- Payload đầu admin giảm từ **129.06 kB xuống 109.7 kB gzip**, thấp hơn trần 125 kB **15.3 kB**; giảm khoảng **19.4 kB** mà không bỏ tính năng tài liệu.
- `t_admin_real.js` kiểm tra không tải fragment lúc vào admin, mở modal mới tải đúng một lần và nội dung hiện đầy đủ; `t_devserver.js` kiểm tra `/admin-docs` phục vụ đúng fragment.
- Cập nhật các kiểm tra nguồn cũ để xác minh tài liệu ở file riêng. `npm run build` tái lập được; chạy lại **toàn bộ `tests/run.js`: tất cả bài đạt**, bao gồm audit 24 màn, 585 lượt axe, 0 vi phạm và không còn Lighthouse budget issue.
