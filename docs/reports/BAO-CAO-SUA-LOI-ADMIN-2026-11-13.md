# Sửa lỗi admin — tab Chương & tham chiếu registry — 2026-11-13

- Nhánh: `arena/fe317592-ssochuz` (từ `main` @ `5b7dd985`)
- Phạm vi: admin thật (`admin-real.js`, trang sinh từ `mockup/ssochuz-admin-mockup.html` qua `npm run build`) — các lỗi khiến tab **Chương / Lưu chương** trỏ sai bộ, và các tham chiếu registry (lịch, Series) không được dọn khi xoá / đổi slug.
- Kết luận ngắn: **2 lỗi chức năng tái hiện được trước khi sửa và sửa dứt điểm** (Tạo bộ → Lưu chương ghi nhầm `lib[0]`; Đổi slug → Lưu chương PUT slug cũ 404), **2 lỗ hổng parity với `src/admin/utils/books.js`** (xoá bộ không gỡ tham chiếu; đổi slug không cập nhật `settings.editorChoice` + `schedule`), **1 lỗi ảnh bìa ở form Tạo bộ**, kèm bảo hiểm “dropdown không trỏ bộ chưa nạp”. Hồi kiểm bằng test mới `tests/t_admin_flow.mjs` (**52/52**) và `tests/t_admin_real.js` mở rộng; `npm test` xanh toàn bộ (109 bài), payload `adminInitial` **99,8 ≤ 100 kB** gzip (ngưỡng không đổi).

## 1. Đã chạy (bằng chứng)

| Lệnh | Kết quả |
| --- | --- |
| `npm ci` (gốc + `tests/`) | ĐẠT — `esbuild` bị xoá giữa phiên, cài lại (không phải lỗi sản phẩm) |
| Repro trước sửa (`tests/_repro_e2e.mjs`, scratch — đã xoá sau khi port vào test thật) | **A và B tái hiện được** (exit 1): Lưu chương ghi `hometown-romance-special` thay vì bộ vừa tạo; PUT `/api/book/<slug-cũ>/chapter` 404 sau đổi slug. Đối chứng C (bộ có sẵn) đạt — sửa không phá luồng cũ |
| Repro sau sửa | A ✓ C ✓ B ✓ (điểm `!x.status` trong repro là lỗi assertion của harness — `wFetch` luôn set `status: 200`; test thật assert `status === 200`) |
| `node tests/t_admin_real.js` | EXIT 0 — `loi: 0`, `errors0: []`, 36 request tới Worker giả |
| `node tests/t_admin_flow.mjs` | EXIT 0 — **52/52**, `errors: []` |
| `npm run build` | ĐẠT — `admin.html` tái sinh (225 538 byte, `admin-real.js?v=a7d4ee4142`) |
| `npm test` | **Tất cả bài kiểm thử đều đạt** (109 bài trong `run.js`, gồm `tools/audit_a11y.mjs`: 0 lỗi axe-core, payload ≤ ngưỡng) |

## 2. Lỗi đã sửa

### 2.1 (A) Tạo bộ xong, tab Chương vẫn trỏ bộ cũ ⇒ Lưu chương ghi nhầm `lib[0]`

**Tái hiện trước sửa.** `realSubmitNew` gọi `writeRegistry` (bên trong là `hydrate`) **trước** `.then` cập nhật `S.selectedBook = sl`; `hydrate` gán `S.chapterBook = S.selectedBook` với giá trị cũ (khi chưa chọn gì thì `lib[0]` = `hometown-romance-special`). Người dùng bấm ngay “Quản lý chương → Lưu chương” mà **không chọn lại bộ** ⇒ `PUT /api/book/hometown-romance-special/chapter` thay vì bộ vừa tạo; dropdown và `#editor` cũng hiển thị bộ sai.

- Sửa (2 chỗ):
  - `admin-real.js:1054` — sau khi gán `S.selectedBook = sl` trong `.then`, gọi `applyBook(sl, book)` ⇒ `BOOK_SLUG` / dropdown Chương / `#editor[data-book]` tự trỏ bộ vừa tạo.
  - `admin-real.js:182` — `hydrate`: `S.chapterBook = BOOK_SLUG || S.selectedBook` — mọi lần ghi registry (`writeRegistry` → `hydrate`) không được đẩy `chapterBook` khỏi bộ đang mở trong editor (trước đây gán trần `= S.selectedBook`).
- Test: `t_admin_real.js` mục 3 “Thêm bộ” (tạo bộ → **không** chọn lại → dropdown/editor/`data-book` = bộ mới, Lưu chương PUT bộ mới, không PUT `hometown`) + `t_admin_flow.mjs` luồng A.

### 2.2 (B) Đổi slug ⇒ tab Chương / Lưu chương vẫn dùng slug cũ (PUT 404)

**Tái hiện trước sửa.** `realSaveEdit` đổi slug trong registry nhưng `BOOK_SLUG` (nguồn thật duy nhất của `realSaveChapter`) và dropdown `chapterBook` giữ slug cũ ⇒ `PUT /api/book/<slug-cũ>/chapter` → 404, chương đang soạn không ghi được.

- Sửa:
  - `admin-real.js:1123` — hoist `moved` (sách vừa PUT lên slug mới); sau khi lưu, nếu tab Chương đang mở bộ bị đổi slug (hoặc chưa nạp gì) ⇒ `applyBook(sl, moved, true)` — trỏ sang slug mới, giữ chương đang soạn.
  - `admin-real.js:1087` — `renameRefs` mở rộng theo parity `src/admin/utils/books.js#renameReferences`: ngoài `slides`/`editorChoice` còn `settings.editorChoice` (dùng chung ánh xạ `ren`) và `schedule.items` (chỉ đổi `slug`, giữ `days`/`title`/`detail`).
- Test: `t_admin_real.js` mục 4 “Sửa bộ / đổi slug” (đổi slug → **không** chọn lại → Lưu chương PUT slug mới, không PUT slug cũ) + `t_admin_flow.mjs` luồng B (PUT slug mới 200, không PUT slug cũ, KV slug mới có nội dung) và E1/E2.

### 2.3 (D) Xoá bộ ⇒ trang chủ còn treo tham chiếu (Lịch, Series)

Đối chiếu với `books.js#removeBookReferences`: `realDeleteBook` trước chỉ lọc `next.lib` — `slides`, `editorChoice`, `settings.editorChoice`, `schedule.items` giữ slug đã xoá ⇒ trang chủ vẫn “kéo” bộ đã chết (dòng Series/Lịch trỏ sách không còn).

- Sửa: thêm `dropBookRefs` (`admin-real.js:1129`, parity `removeBookReferences`) gỡ slug khỏi cả 4 chỗ trước khi `PUT registry` (`:1152`); sau khi xoá, nếu tab Chương đang mở bộ vừa xoá thì dọn `BOOK_SLUG` / `BOOK` / `S.chapters` / `models['chapter-title']`, đặt `chapterBook = selectedBook` (bộ thay thế) và `loadBook` lại; nếu chỉ `chapterBook` trỏ bộ bị xoá ⇒ trỏ về `BOOK_SLUG || selectedBook`.
- Test: `t_admin_flow.mjs` luồng D — 4 tham chiếu sạch, 2 mảng Series giữ đúng 12 phần tử, `DELETE /api/book/<slug>` thật trên KV, state trỏ bộ thay thế, Lưu chương sau xoá ghi bộ thay thế và **không** PUT vào bộ đã xoá.

### 2.4 (E) Đổi slug bộ có trong Lịch / Series ⇒ registry không cập nhật hết

Gộp trong sửa `renameRefs` (2.2): trước đây chỉ `slides` + `editorChoice` — `schedule.items` và `settings.editorChoice` giữ slug cũ (phát hiện bằng đối chiếu parity với `books.js`, dữ liệu thật: `bake-love-feelings` có trong cả 2 mảng, lịch 6 mục đều có slug sách).

- Test: luồng E1 (đổi slug bộ trong lịch → `schedule.items` đổi slug, `days`/`title` giữ nguyên, book chuyển key KV, key cũ DELETE) + E2 (đổi slug `bake-love-feelings` → cả 2 mảng `editorChoice` đổi, mỗi mảng vẫn 12 phần tử).

### 2.5 Ảnh bìa ở form Tạo bộ: ghi nhầm bộ đang chọn, mất thumb, không preview

Trước: `realCoverUpload` không có nhánh `nb-cover-preview` ⇒ tải bìa ở form “Thêm bộ” rơi vào `findMeta(S.selectedBook || BOOK_SLUG)` — ghi đè thumb của bộ **cũ** đang chọn (hoặc báo “Chọn bộ trước khi tải bìa” nếu chưa chọn); `realSubmitNew` tạo meta với `thumb: ''` ⇒ URL bìa bị bỏ; form không hiện preview.

- Sửa:
  - `admin-real.js:2527` — nhánh `nb-cover-preview`: POST `/api/img` → giữ URL trong `S.models['nb-cover']` + render `<img>` preview, **không** PUT registry trước khi tạo bộ;
  - `admin-real.js:1042` — `thumb: S.models['nb-cover'] || ''` — bìa ghi cùng lúc tạo bộ;
  - `mockup/ssochuz-admin-mockup.html:1117` — `newBookHTML` render preview khi `state.models['nb-cover']` có giá trị (còn không thì ô “BÌA mẫu” như cũ);
  - `admin.html` tái build từ mockup.
- Test: `t_admin_real.js` mục 3 — tải bìa thật (`POST /api/img` → `imgqa01`), **chưa** có PUT registry trước khi bấm Tạo bộ; sau tạo: `meta.thumb` đúng URL; kết hợp kiểm “không chọn lại” (2.1).

### 2.6 Bảo hiểm: dropdown không được trỏ bộ chưa nạp + bỏ fallback che lỗi

Trước: `chapter-pick` / `manage` / `selectBook` nạp sách thất bại (404 / thiếu tệp tĩnh) vẫn để `S.chapterBook` trỏ bộ không nạp được; 5 cửa chốt `realSaveChapter` / `realChapterAdd` / `realChapterDelete` / `realChapterMove` / `realImportFile` nhận slug qua `BOOK_SLUG || chapterBook || selectedBook` — fallback này che mất triệu chứng chọn nhầm và có thể ghi vào đích sai.

- Sửa:
  - `revertChapterBook()` (`admin-real.js:858`) — khi `loadBook` / `loadStaticBook` fail (`.then` trả falsy hoặc `.catch`), trả `chapterBook` về `BOOK_SLUG` (nguồn thật) và báo “Không tải được dữ liệu chương của bộ này.”;
  - 5 cửa chốt trên nhận slug **chỉ** từ `BOOK_SLUG`; thiếu thì báo “Chưa nạp dữ liệu chương — chọn bộ rồi bấm Quản lý chương.” (test kiểm bằng PUT đi đâu, không phụ thuộc chữ báo).
- Test: các luồng A/B/D của `t_admin_flow.mjs` (mỗi luồng có bước Lưu chương sau thao tác) + toàn bộ mục chương của `t_admin_real.js`.

### 2.7 Payload `adminInitial` vượt ngưỡng sau khi sửa — đã nén về 99,8 kB

`tools/audit_a11y.mjs` đo gzip(`admin.html` + `admin-real.js`) ≤ 100 kB. Lần chạy đầu sau khi vá: **100,2 > 100** (code bảo hiểm + parity làm `admin-real.js` phình ~1 kB gzip). **Không nâng ngưỡng** — nén phần có thể: rút gọn comment, gộp hàm con `ren` (`renameRefs`) và `keep` (`dropBookRefs`), bỏ hàm trung gian thử nghiệm (gzip ưa chuỗi lặp lại — gộp 5 câu báo trùng thành một hàm lại nặng hơn) → **62,6 + 37,2 = 99,8 ≤ 100**. Ngưỡng giữ nguyên.

## 3. Test mới & mở rộng

- **`tests/t_admin_flow.mjs` (mới)** — hồi kiểm hồi quy cho đúng các lỗi trên: 5 luồng A (Tạo bộ), B (Đổi slug), C (đối chứng bộ có sẵn), D (Xoá bộ + dọn tham chiếu), E1/E2 (đổi slug trong lịch / Series). Mở đúng `admin.html` + `admin-real.js` (bóc `<script src>` rồi `eval`, giống harness `t_admin_real`), Worker giả có KV RAM (`MemKV`) + `wFetch` ghi lại toàn bộ request. Output `{ bai, dat, loi, errors }` — `errors: []` để `run.js` không báo nhầm; lỗi harness → exit 2. **52/52.**
- **`tests/t_admin_real.js` (mở rộng, +49 dòng)** — mục 3: ảnh bìa + tạo bộ + không chọn lại; mục 4: đổi slug + không chọn lại; route `/api/img` POST có handler riêng **trước** catch-all (trước bị 404 giả → `src=/api/img/undefined`).
- **`tests/run.js`** — đăng ký `t_admin_flow.mjs` vào mảng `files` (sau `t_admin_real.js`) + mô tả ở header.

## 4. Cách chạy lại

```bash
npm ci && (cd tests && npm ci)   # deps bị xoá giữa phiên
npm run build                    # tái sinh admin.html từ mockup + admin-real.js
node tests/t_admin_real.js       # EXIT 0, loi: 0, errors0: []
node tests/t_admin_flow.mjs      # 52/52, errors: []
npm test                         # tất cả 109 bài
```

## 5. File đã sửa

| File | Thay đổi |
| --- | --- |
| `admin-real.js` | 17 điểm sửa chức năng: hydrate `chapterBook`, `applyBook` sau tạo/đổi slug, `renameRefs` parity, `dropBookRefs` + dọn state khi xoá, `revertChapterBook`, 5 cửa chốt slug chỉ nhận `BOOK_SLUG`, nhánh bìa `nb-cover-preview`, `thumb` lúc tạo (sau đó nén comment/helper cho ngưỡng payload) |
| `mockup/ssochuz-admin-mockup.html` | preview ảnh bìa form Tạo bộ khi `state.models['nb-cover']` có giá trị |
| `admin.html` | tái build (`npm run build`) |
| `tests/t_admin_real.js` | mục 3/4 mở rộng + route `/api/img` POST |
| `tests/t_admin_flow.mjs` | **mới** — 5 luồng hồi kiểm, 52 kiểm định |
| `tests/run.js` | đăng ký test mới + mô tả header |
