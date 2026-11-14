# Cải tiến tốc độ admin panel — 2026-11-13

- Nhánh: `arena/fe317592-ssochuz` (sau `7d13da7` + `6c08b7c`)
- Phạm vi: **hiệu năng admin thật** (`admin-real.js`, `mockup/ssochuz-admin-mockup.html` → `admin.html`) — đo trước, sửa sau, đo lại.
- Kết luận ngắn: **gõ trong trình soạn chương nhanh ~47×** (handler mỗi phím 9,45 → 0,20 ms với chương lớn), **gõ tìm kiếm −85%** (10 phím 29,3 → 4,3 ms), **boot tới trạng thái online −28%** (377 → 273 ms), **Lưu chương −49%**, **1 `render()` −44%**. `npm test` **109/109 đạt**; payload `adminInitial` vẫn **99,9 ≤ 100 kB** gzip.

## 1. Phương pháp đo

`tests/perf_admin.mjs` (mới, chạy thủ công — không vào `run.js` vì thời gian phụ thuộc máy): jsdom mở đúng `admin.html` + `admin-real.js`, Worker **thật** (`worker/cms.js`) trên KV RAM, bấm chuột/gõ sự kiện thật. Chạy: `node tests/perf_admin.mjs`.

Đo thêm riêng cost của **1 phím gõ** (dispatch `input` không kèm sửa DOM) để tách handler khỏi chi phí giả lập của jsdom.

## 2. Trước / sau (cùng máy, cùng probe)

| Mốc | Trước | Sau | Thay đổi |
| --- | ---: | ---: | --- |
| Boot → online + có dữ liệu | 377,5 ms | 272,6 ms | **−28%** |
| 10 phím trong ô tìm kiếm Thư viện | 29,3 ms | 4,3 ms | **−85%** (1 render thay vì 10) |
| 50 phím soạn chương (HTML lớn, gồm parse giả lập) | 971 ms (19,4/phím) | 366 ms (7,3/phím) | **−62%** |
| **Handler của 1 phím gõ, chương ~15 KB** (đo riêng) | **9,45 ms** | **0,20 ms** | **~47×** |
| 1 lần `render()` | 24,4 ms | 12–14 ms | ~−44% (một phần do bỏ redraw trùng) |
| Lưu chương (PUT + render) | 133,9 ms | 68,5 ms | **−49%** |
| 13 tab liên tiếp | 923,5 ms | 807,6 ms | −13% |

## 3. Đã sửa (5 chỗ, bám theo số đo)

### 3.1 Trình soạn chương: bỏ stats-parse DOM khỏi đường gõ — `admin-real.js`

**Đo được:** mỗi phím tốn ~9 ms phụ thuộc nội dung, phần lớn là `chapterPlainStats()` — `template.innerHTML = html` (**parse lại toàn bộ HTML chương**) cộng `readChapterDraft()` (JSON.parse nháp) chạy thẳng trong event `input`.

- `markEditorDirtyAndAutosave()`: gõ phím chỉ giữ `DIRTY_CHAPTER = true` + `updateSaveNoteDom()` (nhánh dirty không cần đọc nháp ⇒ rẻ); `updateChapterStatsDom` (parse ~8 ms) chuyển vào timer **550 ms** — chạy khi người dùng ngừng gõ, cùng thời điểm `snapshotLiveEditor`.
- `updateSaveNoteDom()`: khi `DIRTY_CHAPTER` thì **không** đọc nháp (nhánh hiển thị không dùng tới `draft`).
- Kiểm chứng: build admin thật **đã có sẵn** guard `window.__CZ_REAL_EDITOR__` (do `admin_prod_replacements.json` inject) tắt case `editor` + paste của mockup → sanitize mỗi phím **không** chạy trong chế độ thật (đo lại `sanitizeEditorDom` = 0 lần gọi/keystroke) — không phải chi phí cần sửa.
- Test: `t_admin_chapter_editor` — `#chapterStats` điền từ template lúc render (dòng ~219) ✓; `#saveNote` hiện “Chưa lưu KV” **tức thì** khi gõ (dòng ~274, sleep 620 ms) ✓; autosave nháp 550 ms giữ nguyên ✓.

### 3.2 Ô tìm kiếm: debounce 160 ms + giữ IME — `mockup/…-admin-mockup.html`

Trước: mỗi phím ở `lib-q` / `cmt-q` gọi `render()` → dựng lại nguyên trang (sidebar + topbar + view + modal), **thay cả `<input>` đang gõ** ⇒ mỗi phím bị render phá vfocus, gõ Telex/IME giữa chừng bị đứt.

- Sửa: cập nhật `state` ngay; `render()` + khôi phục focus/caret lùi **160 ms sau phím cuối**; `compositionstart/end` — đang composition thì không render, composition xong mới render.
- Sau sửa: 8 phím = 5,4 ms dispatch, `state` cập nhật tức thì, sau debounce focus vẫn nằm ở ô tìm kiếm, bộ lọc chạy đúng.
- Test: không bài nào gõ trực tiếp `lib-q`/`cmt-q` (flow D set state + `render()` chủ động) → toàn bộ suite xanh.

### 3.3 Boot: gộp sóng mạng — `admin-real.js`

Trước: `whoami` → (mới) `registry` → batch 5 API → `voters` = **4 sóng tuần tự**.

- Sửa: `registry` (API **công khai**) khởi chạy **cùng** `whoami`; `loadVoters` ghim sau `loadStats` **bên trong** `Promise.allSettled` (vẫn chờ đúng điều kiện `STATS_ITEMS`) thay vì một sóng riêng.
- `loadAll(regP)` nhận lời hứa registry có sẵn; các đường khác (`reload`, sau `connect`) gọi `loadAll()` không đối số như cũ.
- `regP.catch(function(){})` nuốt unhandled khi `whoami` fail trước; fail registry khi online vẫn rơi vào catch cũ (điều kiện giữ nguyên).
- Kết quả: boot377 → 273 ms (giảm1 sóng + render trùng nhờ3.4).

### 3.4 `setConn`: bỏ redraw khi trạng thái không đổi — `admin-real.js`

`if (S.conn === c) return;` — các lần gọi lại cùng trạng thái (chuỗi connect/refresh) không kích hoạt thêm một `render()` toàn trang.

### 3.5 Không sửa gì thêm có chủ đích

- **`render()` tái lập nguyên trang** (sidebar+topbar+view mỗi lần):12–24 ms cho đổi tab là chấp nhận được; đụng vào đây rủi ro cao (toàn bộ mockup dựa trên mô hình này) — để lại nếu sau này cần.
- **`loadBook`/Lưu chương**: phần còn lại là RTT Worker + `htmlForStorage` một lần khi lưu — không còn nút thắt cục bộ.

## 4. Payload (ngưỡng giữ nguyên)

Các tối ưu thêm ~0,7 kB gzip → ban đầu vượt `100,0` (100,5). Đã nén lại: scheduler tìm kiếm viết gọn (bỏ flush phụ), tỉa comment mới +3 comment cũ (lý do đã ghi trong báo cáo & test) → **62,7 + 37,2 = 99,9 ≤ 100**; tổng byte thô **102 329 / 102 400**. `admin.html` ?v=`7b31488bf3` (225 861 byte).

## 5. Chứng nhận

| Lệnh | Kết quả |
| --- | --- |
| `node tests/perf_admin.mjs` | boot273 ms · lib10=4,3–5,7 ms · editor7–8/phím · render ~12–14 ms |
| `node tests/t_admin_chapter_editor.js` | EXIT 0 —73 assert (stats, note, nháp) |
| `node tests/t_admin_real.js` | EXIT 0 — `loi: 0`, `errors0: []` |
| `node tests/t_admin_flow.mjs` | EXIT 0 —52/52 |
| `npm test` | **Tất cả bài kiểm thử đều đạt** (109 bài, gồm audit axe + payload) |

## 6. Cách chạy lại

```bash
node tests/perf_admin.mjs    # so sánh số liệu (chênh lệch giữa máy là bình thường)
npm test                     #109/109
```

## 7. File đã sửa

| File | Thay đổi |
| --- | --- |
| `admin-real.js` | stats/note vào timer gõ, draft-gate, boot song song registry, `loadAll(regP)` + voters trong batch, `setConn` guard |
| `mockup/ssochuz-admin-mockup.html` | debounce `lib-q`/`cmt-q`160 ms + guard IME |
| `admin.html` | tái build (`?v=7b31488bf3`) |
| `tests/perf_admin.mjs` | **mới** — công cụ đo (chạy thủ công) |
