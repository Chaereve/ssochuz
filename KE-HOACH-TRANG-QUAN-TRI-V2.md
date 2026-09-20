# KẾ HOẠCH XÂY LẠI TRANG QUẢN TRỊ — SSOCHUZ LIBRARY V2

> Tài liệu Giai đoạn 0. **Chưa viết một dòng code sản phẩm nào.** Mọi thay đổi code chỉ bắt đầu sau khi bạn duyệt tài liệu này.

---

## 0. Tóm tắt nhanh

| Hạng mục | Kết luận |
| --- | --- |
| Thư viện editor đề xuất | **TipTap 3.31.3 (MIT)** — xem §4 |
| Ngân sách bundle | `/admin.js` hiện 109,6 kB minified → dự kiến **~470–520 kB**, dưới mức trần 650 kB |
| Worker | Nâng `1.10.1 → 1.11.0`, thêm `isPublic()`, `x-book-saved`, cron hẹn giờ |
| Rủi ro lớn nhất | Rò rỉ chương nháp ra `data/book/*.json` qua workflow đồng bộ KV→repo (§9.1) |
| Số câu hỏi cần bạn duyệt | **9** (§11) |
| Trạng thái baseline test | 32/33 xanh, **1 bài đỏ sẵn có từ trước**: `t_adult.js` (§1.3) |

---

## 1. Kết quả khảo sát hiện trạng

### 1.1 Kiến trúc thực tế

```
src/*.js, src/cz.css   ← mã nguồn đọc được (bị _redirects chặn phát hành)
       │  npm run build (esbuild minify, bundle: false)
       ▼
/admin.js /cz-app.js /cz.css …   ← bản phát hành commit thẳng vào repo gốc
admin.html                       ← khung HTML tĩnh, ~43,8 kB, ~180 phần tử có id
worker/cms.js                    ← Worker Cloudflare, 3081 dòng, VERSION = 1.10.1
data/registry.json, data/book/*  ← bản sao KV (62 bộ), do workflow sync-kv-to-repo.yml ghi
```

Điểm cần lưu ý: `build_site.mjs` đang chạy **`bundle: false`** — các file gọi nhau qua biến toàn cục `window.CZ`. Muốn bundle TipTap phải cho `admin.js` một đường build riêng có `bundle: true` (§5.2). `tools/check_src.js` so **từng byte** bản gốc với kết quả minify lại từ `src/`, nên đường build mới phải được phản chiếu y hệt trong `check_src.js`, nếu không `npm test` sẽ đỏ.

### 1.2 Kích thước hiện tại (đo thật)

| Tệp | src | phát hành (minified) | gzip |
| --- | ---: | ---: | ---: |
| `src/admin.js` (3283 dòng) | 185,9 kB | **109,6 kB** | 33,7 kB |
| `admin.html` | — | 43,8 kB | — |
| `src/cz.css` (3467 dòng) | 248,2 kB | 168,4 kB | 32,2 kB |
| — trong đó CSS admin | ~115 dòng khớp `admin`/`ashell` | (chưa tách) | — |

Ngân sách còn trống cho editor: **650 − 110 ≈ 540 kB** minified.

### 1.3 Baseline `npm test`

Chạy sau khi `npm install` ở gốc và `cd tests && npm i jsdom`:

```
33 bài · 32 ĐẠT · 1 LỖI
✗ t_adult.js → 'hero/slide dùng nhãn reason (nhận: "Nổi bật hôm nay", cần: "Lựa chọn của ban biên tập")'
```

Đây là **lỗi có sẵn trên commit gốc `6d1143d`**, không do tôi gây ra: `src/cz-home.js:44` dùng nhãn mặc định theo vị trí, còn `tests/t_adult.js:114` mong nhãn `reason` do test tự set được giữ lại. Lỗi nằm ở **trang người đọc**, ngoài phạm vi `/admin`.
→ **Câu hỏi Q1 (§11).**

Lưu ý phụ: `tests/package.json` khai `jsdom` nhưng `node_modules` không được commit; tôi đã cài cục bộ để chạy. Tôi đã sửa file này? **Không** — `git status` báo `tests/package.json` bị npm ghi lại thứ tự khoá khi cài; tôi sẽ hoàn nguyên file này về đúng bản gốc trước khi kết thúc Giai đoạn 0.

### 1.4 Mock Worker

```bash
node tests/mock_worker.mjs 8787   # → http://127.0.0.1:8787/admin.html  (HTTP 200)
GET /api/health → {"ok":true,"version":"1.10.1","kv":true,"books":62,…}
```
Chạy tốt, dùng làm nền cho ảnh chụp màn hình từ Giai đoạn 1.

---

## 2. Kiểm kê tính năng (Phụ lục A) — Giữ / Gộp / Bỏ

Liệt kê theo đúng các `id` có thật trong `admin.html`. **Không mục nào bị bỏ nếu bạn chưa duyệt.**

### 2.1 Vỏ trang & cổng vào

| Tính năng | id hiện tại | Đề xuất | Lý do |
| --- | --- | --- | --- |
| Chip trạng thái Worker / dữ liệu / chưa lưu | `chipConnTxt` `chipDataTxt` `dirtyTxt` | **Giữ** | đưa lên topbar mới |
| Huy hiệu quyền, đăng xuất, ngắt kết nối | `roleBadge` `btnLogout` `btnOut` | **Giữ** | |
| Công tắc sáng/tối | `btnTheme` `btnThemeIn` | **Gộp** thành 1 | hai nút cùng chức năng, gây rối |
| Nút mở nháp trong máy | `btnDraftRestore` | **Giữ, nâng cấp** | chuyển từ localStorage sang IndexedDB theo `slug+chapter.id` |
| Cổng đăng nhập Google/Supabase + ADMIN_KEY | `gate*` | **Giữ nguyên luồng** | không đụng bảo mật |
| Khối kết nối Worker + hướng dẫn 5 bước | `scConnect` `btnGuide` `btnLocal` | **Giữ** | |
| 11 tab sidebar | `#tabs` | **Giữ + thêm router hash** | hiện chưa nhớ vị trí khi F5 |

### 2.2 Tổng quan / Thư viện / Thêm bộ

| Tính năng | id | Đề xuất |
| --- | --- | --- |
| Ô số liệu, việc cần xem lại, cập nhật mới | `ovTiles` `ovTasks` `ovAuth` `ovRecent` | **Giữ**, bổ sung 3 ô mới: chương nháp lâu ngày, chương sắp hẹn giờ, phiếu/lượt đọc hôm nay |
| Tìm / lọc trạng thái / sắp xếp | `q` `fStatus` `fSort` | **Giữ**, thêm lọc 18+, khoá, có nháp; thêm sắp xếp theo lượt đọc |
| Chọn nhiều + sửa hàng loạt + xuất JSON | `ckAll` `bulkStatus` `btnBulk` `btnExport` | **Giữ**, thêm sửa hàng loạt cờ 18+ |
| Bảng thư viện | `tb` | **Giữ**, thêm chế độ thẻ ≤ 640px |
| Thêm bộ (form 1 khối) | `pane-new` | **Gộp** thành wizard 3 bước (thông tin → bìa → chương đầu), bỏ qua được bước 2–3 |

### 2.3 Workspace (gộp từ tab “Sửa bộ”)

| Tính năng | id | Đề xuất |
| --- | --- | --- |
| Thông tin bộ, bìa, upload bìa | `fTitle`…`btnCoverUp` | **Giữ** |
| Nhân bản bộ, xoá bộ | `edDup` `btnDelBook` | **Giữ** (xác nhận 2 bước) |
| Khoá mật mã | `lockPw` `btnLock` `btnUnlock` | **Giữ** nguyên, gọi `/api/lock/set` |
| Danh sách chương | `chList` | **Giữ + nâng cấp mạnh**: kéo-thả, Alt+↑/↓, chọn nhiều, nhân bản, chèn, đánh số lại, huy hiệu Nháp/Hẹn giờ/Đã đăng |
| Trình soạn `contenteditable` + `execCommand` | `edBody` `edToolbar` | **Thay** bằng TipTap (§4) |
| Mở tệp chương | `chFileBtn` `chFile` | **Giữ + mở rộng**: nhiều tệp, kéo-thả, tách chương, xem trước |
| Tìm trong chương | `chFind` `chFindGo` | **Nâng cấp** thành Tìm & thay thế |
| Lưu nháp trong máy | `btnDraft` | **Gộp** vào autosave IndexedDB tự động |
| Lưu chương / lưu toàn bộ | `chSave` `btnSaveCh` | **Giữ**, cùng dùng `PUT /api/book/<slug>` |

### 2.4 Các tab còn lại

| Tab | id chính | Đề xuất |
| --- | --- | --- |
| Bình luận | `cmQ` `cmBook` `cmList` `cmExport` | **Giữ**, thêm hiển thị ngữ cảnh + nhảy đúng chương |
| Báo lỗi | `rpQ` `rpList` `rpExport` | **Giữ**, thêm cuộn tới đoạn được báo + đánh dấu đã xử lý (lưu trong `settings`) |
| Phiếu bầu | `voBook` `voChap` `voRemove` `rsRun` | **Giữ toàn bộ**, reset giữ xác nhận 2 bước + cảnh báo |
| Thống kê | `btnStats` `btnStatsCsv` `stChart` | **Giữ**, biểu đồ 30 ngày |
| Bác sĩ dữ liệu | `docRun` `docFixKv` `docPullRepo` `docRecount` `docFixReg` `docExport` `kvRun` | **Giữ 100%**, tách logic ra module thuần `src/admin/lib/doctor.js` để `t_doctor.js` gọi trực tiếp; **bắt buộc bỏ qua chương nháp khi so số** |
| Nhật ký | `logList` | **Giữ**, thêm lọc loại/bộ/người + thời gian tương đối |
| Cài đặt | `slidePick` `editPick` `sSched` `aProvider` `sGiscus*` `btnSeed` `btnBackup` `btnRestore` | **Giữ**, riêng 5 mục dưới cần bạn quyết |

### 2.5 Năm ứng viên cần bạn quyết (KHÔNG tự bỏ)

| Ứng viên | Hiện trạng đo được | Đề xuất của tôi | Câu hỏi |
| --- | --- | --- | --- |
| Nhập số Firebase | `btnStatsFb` → `POST /api/stats/import-firebase`; README Worker ghi `FIREBASE_PROJECT` **“KHÔNG cần nữa”** | Giữ nút nhưng đẩy vào mục “Công cụ một lần” thu gọn | Q2 |
| Giscus | `sGiscusRepo`/`sGiscusId`; trang truyện đã có bình luận riêng qua `/api/comments` | Giữ nguyên ô cấu hình | Q3 |
| Google Identity cũ | `aProvider` có option `google` (`/api/auth/google`) | Giữ, đánh dấu “cách cũ” | Q4 |
| Đồng bộ + Nhập Blogger | `POST /api/sync`, `/api/import` | Giữ API, gom UI vào “Công cụ một lần” | Q5 |
| Nút “Kiểm tra” cũ | `btnHealth`, `aCheck` trùng chức năng chip Worker | Gộp còn 1 nút trong Cài đặt | Q6 |
| Textarea lịch ra chương | `sSched` (văn bản thô) | Thay bằng bảng, **vẫn ghi ra đúng khoá `settings.schedule` cũ** | Q7 |

---

## 3. Kiến trúc thông tin & router

```
#/tong-quan
#/thu-vien                    ?q=&status=&18=&sort=
#/them-bo                     (wizard 3 bước)
#/bo/<slug>                   → Workspace, thẻ Thông tin
#/bo/<slug>/chuong/<n>        → Workspace, thẻ Soạn chương
#/binh-luan?slug=…&ch=…
#/bao-loi?q=…
#/phieu-bau?slug=…
#/thong-ke
#/bac-si
#/nhat-ky
#/cai-dat
```

Quy tắc: mọi thay đổi bộ lọc dùng `history.replaceState`, mọi điều hướng dùng `location.hash`. F5 quay lại đúng chương đang sửa. Route cũ không có hash → chuyển về `#/tong-quan`.

### Wireframe desktop (≥ 1100px)

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◎ ssochuz · Quản trị   ● Worker  ● Dữ liệu  ● Chưa lưu   ☾  ↗Web  ⎋  │
├────────────┬──────────────────────────────────────────────────────────┤
│ ☰ Tổng quan│ Thư viện › Chain › Chương 12            [Lưu lên KV]     │
│   Thư viện │┌──────────┬─────────────────────────────┬──────────────┐ │
│   Thêm bộ  ││ Chương   │ ╭─────────────────────────╮ │ Thuộc tính   │ │
│   ─────────││ 1 …  ✓   │ │  vùng soạn, max 720px   │ │ Tiêu đề      │ │
│   Bình luận││ 2 …  ✓   │ │  ⠿ + khối · / slash     │ │ ○Nháp ○Hẹn   │ │
│   Báo lỗi  ││ 12 … ✎   │ │                         │ │ Ngày đăng    │ │
│   Phiếu bầu││ 13 …  ◷  │ ╰─────────────────────────╯ │ 1.240 từ     │ │
│   Thống kê ││ [+ chương]│ 1.240 từ · ~5 phút đọc     │ Ghi chú      │ │
│   Bác sĩ   │└──────────┴─────────────────────────────┴──────────────┘ │
│   Nhật ký  │                                                          │
│   Cài đặt  │                                                          │
└────────────┴──────────────────────────────────────────────────────────┘
```

### Wireframe mobile (360px)

```
┌──────────────────────┐   Cột trái + cột phải → sheet kéo lên.
│ ☰  Chương 12    [⋯] │   Thanh định dạng nổi ĐÁY màn hình,
├──────────────────────┤   cách bàn phím bằng env(safe-area-inset-bottom).
│                      │   Không thanh nào che chữ đang gõ.
│   vùng soạn 100%     │   Nút Lưu luôn thấy ở topbar.
│                      │
├──────────────────────┤
│ B I U  H2 “ • — 🖼 / │
└──────────────────────┘
```

---

## 4. So sánh TipTap và Quill 2 — số đo thật

Tôi đã cài cả hai vào sandbox tạm và bundle bằng **chính esbuild 0.25.0 của repo** (`--bundle --minify --target=es2019`):

| | **TipTap 3.31.3** | **Quill 2.0.3** |
| --- | ---: | ---: |
| Giấy phép | MIT | BSD-3-Clause |
| Bundle minified (bộ mở rộng cần dùng¹) | **392,8 kB** | **206,3 kB** |
| Bundle gzip | 123,5 kB | 60,7 kB |
| `/admin.js` dự kiến sau khi ghép | **~500 kB** (77% ngân sách) | ~315 kB (48%) |
| Mô hình dữ liệu | ProseMirror schema — **chỉ sinh được thẻ đã khai báo** | Delta → HTML, cần lớp chuyển đổi riêng |
| Ép HTML contract (§7) | Khai schema là xong; dán bẩn bị schema loại ngay | Phải tự viết matcher `clipboard.addMatcher` cho từng trường hợp |
| Slash menu `/` | `@tiptap/suggestion` có sẵn | tự viết hoàn toàn |
| Bubble menu | extension chính thức | tự viết |
| Kéo-thả khối, nút `+` | `Dropcursor`/`Gapcursor` + NodeView | không có khái niệm khối → rất khó |
| `<figure><figcaption>` | NodeView tuỳ biến | Blot tuỳ biến, phức tạp hơn |
| `<aside class="note">` | Node tuỳ biến, dễ | Blot tuỳ biến |
| Tìm & thay thế | extension cộng đồng hoặc ~120 dòng tự viết | ~150 dòng tự viết |
| Undo/redo, IME tiếng Việt | ProseMirror history, IME tốt | ổn |

¹ TipTap đo với `core + pm + starter-kit + link + image + underline + text-align + placeholder`. Con số sẽ **giảm** khi tôi bỏ các node không dùng (`codeBlock`, `code`) khỏi StarterKit — ước tính còn ~350–370 kB.

### Quyết định đề xuất: **TipTap**

Lý do: yêu cầu §7.3 của bạn là một **HTML contract nghiêm ngặt** (danh sách trắng thẻ, chỉ cho `text-align`, cấm span/class rác). ProseMirror ép điều đó **ở tầng schema** — về mặt kiến trúc là không thể sinh ra HTML ngoài danh sách trắng, kể cả khi dán từ Word. Quill rẻ hơn 186 kB nhưng toàn bộ slash menu, bubble menu, kéo-thả khối, figure/figcaption, aside phải viết tay, và Delta→HTML là một điểm rò rỉ định dạng nữa cần test riêng. Ngân sách 650 kB **đủ chỗ** cho TipTap (~500 kB, dư ~150 kB). Nếu số đo thực tế ở Giai đoạn 2 vượt 620 kB, phương án B là hạ xuống Quill 2 và tôi sẽ báo trước khi làm.
→ **Câu hỏi Q8 (§11).**

Ghi chú: cả hai đều cài qua **npm và bundle nội bộ**, không CDN, không nới CSP.

---

## 5. Kiến trúc module đề xuất

### 5.1 Cây thư mục

```
src/admin/
├── main.js                  điểm vào duy nhất (esbuild bundle)
├── app/
│   ├── router.js            hash router + khôi phục vị trí
│   ├── shell.js             topbar, sidebar, breadcrumb, chip trạng thái
│   ├── store.js             REG, BOOKS, cờ dirty, phát sự kiện
│   └── api.js               bọc fetch, gắn X-Admin-Key, timeout, 409
├── pages/
│   ├── overview.js  library.js  new-book.js
│   ├── workspace/
│   │   ├── index.js         bố cục 3 cột
│   │   ├── chapter-list.js  kéo-thả, Alt+↑↓, chọn nhiều
│   │   ├── editor.js        khởi tạo TipTap
│   │   ├── inspector.js     thuộc tính chương: nháp, hẹn giờ, ghi chú
│   │   ├── preview.js       DÙNG LẠI cleanHTML() + .rtext (không viết renderer mới)
│   │   └── import.js        nhập tệp + tách chương
│   ├── comments.js  reports.js  votes.js  stats.js
│   └── doctor.js    log.js   settings.js
├── editor/
│   ├── schema.js            danh sách trắng thẻ §7.3
│   ├── slash-menu.js  bubble-menu.js  find-replace.js
│   ├── paste.js             làm sạch Word/Docs/Notion
│   └── image.js             upload → /api/img
└── lib/
    ├── html-contract.js     normalizeChapterHtml() — THUẦN, chạy được trên Node
    ├── doctor-core.js       logic bác sĩ dữ liệu — THUẦN
    ├── chapter.js           isPublic(), đếm từ, thời gian đọc
    ├── autosave.js          IndexedDB theo slug + chapter.id
    └── split.js             tách 1 tệp thành nhiều chương
```

`lib/*` và `editor/schema.js` **không chạm DOM trình duyệt** → test Node gọi trực tiếp.

### 5.2 Thay đổi build (không phá `check_src`)

`tools/build_site.mjs`: `admin.js` chuyển sang nhánh riêng
`{ entryPoints:['src/admin/main.js'], bundle:true, format:'iife', minify:true, target:['es2019'] }`.
`tools/check_src.js` phải được sửa **cùng lúc, cùng tham số** để so byte vẫn khớp. Các file `cz-*.js` giữ nguyên `bundle:false`.

CSS: tạo `src/admin.css` riêng, build ra `/admin.css`, và **gỡ ~115 dòng admin khỏi `cz.css`** ở Giai đoạn 4 → trang người đọc **nhẹ đi**, không phình.

---

## 6. Thiết kế Worker 1.11.0

### 6.1 Trường chương mới (đều tuỳ chọn, không đổi `{t, html}`)

`id` `draft` `publishAt` `note` `updatedAt` `words`. Trường lạ do bản cũ ghi vào **được giữ nguyên**, không strip.

### 6.2 `isPublic`

```js
const isPublic = (ch, now = Date.now()) =>
  !ch.draft && (!ch.publishAt || Date.parse(ch.publishAt) <= now);
```

Áp cho **7 điểm thoát** đã rà trong `cms.js`:

| Điểm | Vị trí đo được | Việc cần làm |
| --- | --- | --- |
| `GET /api/book/<slug>` công khai | `cms.js:1167` | lọc chương chưa public (admin có key → trả đủ) |
| Đếm chương vào registry | `PUT /api/book` `cms.js:1438` | chỉ đếm chương public |
| `POST /api/recount` | `cms.js:1470` | như trên |
| `/feed.xml` | `cms.js:978–1070` | bỏ chương chưa public |
| Push thông báo | `cms.js:625–700` | không push chương nháp |
| Sitemap / OG | `tools/build_sitemap.py`, `tools/build_og.mjs` | dùng dữ liệu đã lọc |
| Đồng bộ KV → repo | `.github/workflows/sync-kv-to-repo.yml` | **ghi bản đã lọc** (§9.1) |

### 6.3 Hẹn giờ

Hàng đợi KV `sched:<slug>:<chapterId>` + `scheduled(event)` cron. Khi tới hạn: hiện công khai → cập nhật `chapters`/`countLabel` → push 1 lần (cờ chống lặp) → `edgePurge` book + registry + feed → ghi nhật ký → xoá khỏi hàng đợi.
**Độ trễ tối đa = chu kỳ cron (đề xuất 5 phút) + TTL cache biên** (`EDGE_TTL.registry/feed`). Tôi sẽ ghi con số chính xác vào báo cáo Giai đoạn 2 và hiển thị ngay trong UI hẹn giờ: *“Chương sẽ hiện trong vòng ~X phút sau giờ hẹn.”* Cron cần khai trong `wrangler.toml` — bạn sẽ phải dán Worker mới lên Cloudflare, tôi sẽ viết hướng dẫn.

### 6.4 Chống ghi đè

`PUT /api/book/<slug>` đọc header `x-book-saved`. Lệch → `409 {conflict:true, savedOnServer:"…"}`. Thiếu header → **giữ nguyên hành vi cũ** (bản admin cũ vẫn chạy).

### 6.5 Sao lưu

`btnBackup` sinh 2 lựa chọn: bản công khai (mặc định) và bản đầy đủ có nháp → tên tệp bắt buộc chứa `-full-` kèm cảnh báo đỏ.

---

## 7. `normalizeChapterHtml()` — hợp đồng HTML

Module thuần `src/admin/lib/html-contract.js`, tự viết parser nhỏ (không phụ thuộc DOM, không thêm dependency). Bảo đảm: idempotent, `<div>`→`<p>`, gộp dòng trống, chỉ giữ `style="text-align:…"`, đổi URL ảnh Worker tuyệt đối → `/api/img/<id>`, **không mất một ký tự chữ nào** (test so sánh `textContent` trước/sau).

**Quy tắc vàng:** chương cũ chỉ được chuẩn hoá khi người dùng *thực sự sửa và bấm lưu*. Mở xem → KV **không đổi một byte**.

---

## 8. Danh sách test mới

| Tệp | Kiểm |
| --- | --- |
| `tests/t_html_contract.js` | idempotent · không mất chữ · không nhân đôi dòng trống · chỉ còn thẻ trong danh sách trắng |
| `tests/t_paste_clean.js` | dán Word (`mso-*`), Google Docs (`<b style=font-weight:normal>`), Notion, HTML web |
| `tests/t_split_import.js` | tách `Chương N`/`Chapter N`/`#`/`---`/regex · sắp xếp theo số trong tên tệp |
| `tests/t_editor_ui.js` | slash menu · bubble menu · phím tắt **chỉ** chạy trong editor · mobile 360px không tràn ngang · a11y bàn phím |
| `tests/t_autosave.js` | IndexedDB theo `slug+id` · mất mạng vẫn khôi phục đủ chữ · hộp thoại chọn bản |
| mở rộng `tests/t_worker.mjs` | public không thấy nháp · admin thấy nháp · nháp không được đếm · nháp không push · `409` · cron hẹn giờ |
| mở rộng `tests/t_doctor.js` | không báo lệch giả vì chương nháp |
| mở rộng `tests/t_feed.js` | feed không có chương nháp |

Ảnh chụp bắt buộc: Thư viện · Workspace desktop · Workspace mobile · Xem trước · Slash menu · Nhập & tách tệp · Xung đột 409 · Cài đặt lịch.

---

## 9. Rủi ro dữ liệu và cách giảm

| # | Rủi ro | Mức | Cách giảm |
| --- | --- | --- | --- |
| R1 | **Chương nháp lọt vào `data/book/*.json`** qua `.github/workflows/sync-kv-to-repo.yml` rồi lên Pages — repo công khai, coi như lộ vĩnh viễn | **Cao** | Lọc ở *nguồn* trong Worker, thêm test chặn, thêm bước kiểm trong workflow từ chối commit nếu thấy `draft:true` |
| R2 | `check_src` đỏ vì đổi cách build `admin.js` | Cao | Sửa `build_site.mjs` và `check_src.js` **trong cùng một commit** |
| R3 | 62 bộ × chương cũ sinh bởi `execCommand` có HTML lạ → TipTap schema **âm thầm nuốt nội dung** khi mở | **Cao** | Chạy `normalizeChapterHtml` trên toàn bộ `data/book/*.json` ở chế độ khô, so `textContent`, báo cáo bộ nào lệch **trước** khi bật editor mới |
| R4 | Đổi thứ tự chương làm lệch bình luận/phiếu/lượt đọc (đang gắn theo số thứ tự) | Cao | Hộp thoại cảnh báo bắt buộc, liệt kê số bình luận/phiếu bị ảnh hưởng |
| R5 | Bundle vượt 650 kB | Trung bình | Đo mỗi lần build; ngưỡng 620 kB thì báo và cân nhắc Quill |
| R6 | Cron Cloudflare trễ / không được bật | Trung bình | UI nói rõ độ trễ; nút “Đăng ngay” thủ công làm phương án dự phòng |
| R7 | Hai tab cùng sửa | Trung bình | `x-book-saved` + 409 + xem khác biệt |
| R8 | CSS admin nằm chung `cz.css`, tách ra có thể vỡ trang đọc | Trung bình | Tách ở Giai đoạn 4, đối chiếu ảnh chụp trước/sau |
| R9 | `.docx` cần thư viện nặng (mammoth ~140 kB) | Thấp | Đo ở Giai đoạn 2, nếu vượt ngân sách sẽ báo trước khi bỏ — **không tự bỏ** |

---

## 10. Lộ trình

| Giai đoạn | Nội dung | Điều kiện xong |
| --- | --- | --- |
| **0** | Tài liệu này | bạn duyệt |
| **1** | `src/admin/`, build bundle, `admin.css`, router, cổng đăng nhập, Tổng quan, Thư viện, wizard, Workspace cơ bản, editor sửa+lưu được | toàn bộ test **cũ** xanh |
| **2** | Editor đầy đủ, dán/nhập, ảnh, nháp, autosave, hẹn giờ, tìm-thay thế, xem trước, 409, html-contract, Worker 1.11.0, bịt rò rỉ nháp | test mới xanh |
| **3** | Bình luận, Báo lỗi, Phiếu bầu, Thống kê, Bác sĩ, Nhật ký, Cài đặt; **chỉ khi đó mới xoá `src/admin.js` cũ** | đủ tính năng, test xanh |
| **4** | Mobile, a11y, hiệu năng, tách CSS, cache version, sw.js, README, `_redirects`, `THIRD-PARTY-NOTICES.md`, `package.json → 2.0.0`, `BAO-CAO-TRANG-QUAN-TRI-V2.md`, hướng dẫn 1 trang | nghiệm thu §12 của bạn |

Mỗi giai đoạn đều kèm: build xanh · test xanh · báo cáo thay đổi · danh sách file đã sửa · việc còn lại · ảnh chụp giao diện.

---

## 11. Chín câu hỏi cần bạn duyệt

| # | Câu hỏi | Đề xuất của tôi |
| --- | --- | --- |
| **Q1** | `t_adult.js` đã đỏ sẵn từ trước ở **trang người đọc**. Tôi sửa luôn trong Giai đoạn 1, hay để nguyên và ghi nhận là nợ cũ? | Sửa luôn, 1 dòng ở `cz-home.js` |
| **Q2** | Giữ nút **Nhập số Firebase**? | Giữ, thu vào “Công cụ một lần” |
| **Q3** | Giữ cấu hình **Giscus**? | Giữ |
| **Q4** | Giữ **Google Identity cũ**? | Giữ, ghi “cách cũ” |
| **Q5** | Giữ **Đồng bộ / Nhập Blogger**? | Giữ API, gom UI |
| **Q6** | Gộp `btnHealth` + `aCheck` thành 1 nút? | Đồng ý gộp |
| **Q7** | Thay textarea lịch bằng bảng (vẫn ghi đúng khoá cũ)? | Đồng ý |
| **Q8** | Chốt **TipTap** (~500 kB) hay ưu tiên nhẹ với **Quill 2** (~315 kB)? | TipTap |
| **Q9** | Chu kỳ cron hẹn giờ: **5 phút** (chính xác hơn) hay 15 phút (ít tốn quota)? | 5 phút |

---

Giai đoạn 0 đã hoàn tất. Tôi đang chờ bạn duyệt kế hoạch trước khi viết code.
