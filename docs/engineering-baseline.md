# Engineering baseline — ssochuz

- Ngày đo: 2026-09-30 (UTC)
- Nhánh: `arena/01a0f122-ssochuz` (từ `main` @ `22f8eae`, cập nhật cuối 2026-09-27)
- Trạng thái workspace lúc đo: sạch (không có thay đổi chưa commit). Mọi lệnh dưới đây chạy trên checkout này.

## 0. Kết luận nhanh

| Hạng mục | Kết quả | Ghi chú |
| --- | --- | --- |
| Cài phụ thuộc | **ĐẠT** | `npm install` (25 cảnh báo moderate, đều nằm trong chuỗi Tiptap) + `tests/npm install` |
| Typecheck Worker | **ĐẠT** | `npm run check:worker` (tsc, `checkJs`) — không lỗi |
| Build | **ĐẠT** | `npm run build` — sinh bản rút gọn + bundle admin |
| Test (mặc định) | **1 lỗi** | `npm test`: 60 mục (5 script công cụ + 55 bài test), **59 đạt / 1 lỗi** — xem §3 |
| Test trong trình duyệt thật | **Chưa chạy** | 3 bài cần Chromium; `npx playwright install chromium` bị mạng chặn (`ECONNRESET` tới `cdn.playwright.dev`) |
| Lint | **Không có** | Repo không cấu hình ESLint/Prettier cho frontend (`package.json` không có script) |
| Lockfile | **Đã commit (G9b, 2026-09-30)** | `package-lock.json` + `tests/package-lock.json` (lockfileVersion 3); trước đó `.gitignore` bỏ qua |
| CI | **2 workflow** | `sync-kv-to-repo.yml` (chạy tay, đồng bộ KV → repo) + `ci.yml` (G9a, 2026-09-30): push/PR vào `main` ⇒ `npm ci` (gốc + `tests/`) → `npm run build` → `npm test`, Node 22, trần 15 phút. Chưa có bước `git diff --exit-code` (owner chưa chọn) |
| Chạy local | **Có script** | `python3 tools/dev_server.py` (cổng 8080, mô phỏng Cloudflare Pages) hoặc `python3 server.py` (cổng 8000) |

## 1. Workspace audit

| Câu hỏi | Trả lời | Bằng chứng |
| --- | --- | --- |
| Kiểu repo | Single repo, web tĩnh + Worker + admin SPA | `package.json`, `worker/`, `src/`, `index.html` |
| Runtime / package manager | Node 22.22.3, npm 10.9.8, Python 3.11 | `node -v`, `npm -v`; `tools/*.py` |
| Framework FE | Vanilla JS có IIFE (`cz-app.js`, `cz-home.js`, `cz-story.js`, `cz-space.js`, `cz-people.js`) | `src/*.js`; `src/README.md` |
| Admin | Preact + TipTap, bundle bằng esbuild | `src/admin/**`, `tools/build_admin.mjs` |
| Backend | Cloudflare Worker (`worker/cms.js` + 8 tệp con), KV, 2 Durable Object (SQLite) | `worker/wrangler.toml` |
| Dữ liệu | KV (registry + mỗi bộ + stats/comments…) là **bản gốc**; `data/*.json` là **bản sao lưu tĩnh** đã rút gọn | `worker/README.md`, `data/registry.json`, `tools/pull_from_kv.py` |
| Dữ liệu lớn tuỳ chọn | Supabase Postgres (`ssochuz_blobs`) + Storage bucket `covers`; R2 (đang comment) | `worker/wrangler.toml` (§overflow) |
| Auth | Supabase Auth (khuyến nghị) hoặc Google GIS; quyền admin theo `ADMIN_KEY` / `ADMIN_EMAILS` | `cz-config.js`, `worker/cms.js` (`adminEmails`, `authed`) |
| Giao diện | `src/cz.css` (243 KB nguồn) → `cz.css` (169 KB rút gọn), icon Tabler nhúng inline | `src/README.md` |
| Cron | `*/10 * * * *` (144 lượt/ngày) — nhắc chương hẹn giờ qua push | `worker/wrangler.toml` |
| Hosting | Cloudflare Pages (static) + Worker `workers.dev` | `_headers`, `_redirects`, `cz-config.js` |

### Script có sẵn

```bash
npm install
npm run build        # build_site (rút gọn cz-*) + build_admin (Preact/esbuild)
npm run build:worker # gộp worker thành 1 tệp để dán lên dashboard
npm run check:worker # tsc --checkJs cho worker/
npm test             # 60 mục: 5 script kiểm tra + 55 bài jsdom/worker KV giả
npm run og           # sinh truyen/<slug>/index.html (OG/JSON-LD/canonical) — CHẠY TAY
python3 tools/dev_server.py   # xem thử đúng luật Cloudflare Pages
```

`npm test` cố tình chạy trên **bản đã rút gọn** ở thư mục gốc; `tools/check_src.js` chặn lệch giữa `src/` và bản phát hành. Đây là quy ước rất tốt, giữ nguyên.

## 2. Lệnh đã chạy và kết quả (bản ghi thô)

| Lệnh | Kết quả | Ghi chú |
| --- | --- | --- |
| `npm install --ignore-scripts` | ĐẠT (~19 s) | `node_modules/` bị `.gitignore` |
| `npm run build` | ĐẠT | sinh `cz-*.js`, `cz.css`, `admin.js`, `admin.js.map`, `admin-editor.js` (Tiptap, tải khi mở khung soạn chương), `admin-docx.js` |
| `npm run check:worker` | ĐẠT | tsc im lặng |
| `npm test` | **60/60 ĐẠT** (sau Milestone A) | baseline trước khi sửa: 59/60 — chi tiết §3 |
| `npm audit --json` | 25 moderate | §4 |
| `tests: npm install` | ĐẠT (65 gói) | `jsdom` 30.x, `playwright` 1.63.0 |
| `npx playwright install chromium` | **THẤT BẠI** | `ECONNRESET` tới `cdn.playwright.dev` — môi trường sandbox chặn tải binary |

### 2.1 Build lại bundle admin — đã truy nguyên (Milestone A đo lại)

Quan sát ban đầu: sau `npm run build` trên nhánh sạch, `admin.js`/`admin.js.map` lệch **1 dòng** so với bản đã commit. Lúc đó tôi đoán là "esbuild không tái lập byte-for-byte" và khôi phục 2 tệp về HEAD.

**Đo lại trong Milestone A (2 thí nghiệm, không đoán):**

1. Build **hai lần liên tiếp** trên cùng một cây mã ⇒ `admin.js` và `admin.js.map` **giống nhau từng byte**. ⇒ esbuild **có** tái lập; không phải nhiễu ngẫu nhiên.
2. Giải nén `git archive HEAD` ra thư mục riêng (không đụng cây làm việc), dùng **cùng** `node_modules`, rồi build ⇒ `cz-story.js`/`cz.css` **giống HEAD**, nhưng `admin.js` **khác HEAD đúng 1 dòng** (dòng 103 — khối lệnh `setHardBreak` của `@tiptap/extension-hard-break`).

**Kết luận:** bundle `admin.js` đã commit **không được build từ `src/admin/**` tại HEAD** — nó cũ hơn mã nguồn một bản vá `@tiptap/*`. Vì `package-lock.json` bị `.gitignore` (`^2.27.3`), mỗi máy `npm install` ra một bản vá khác nhau ⇒ **build không tái lập giữa các máy**, chứ không phải không tái lập trên cùng máy.

Hệ quả cho Milestone A: bản build trong cây làm việc hiện tại mang theo bản vá `@tiptap/*` mà `npm install` mới giải ra (không đổi API, `check_src.js` + `check_secrets.js` + toàn bộ `npm test` xanh); đây là điều **phải** chấp nhận khi deploy vì đổi giao diện admin A2 bắt buộc phải build lại.

Hệ quả cho G9a (CI) và G9b (lockfile): `git diff --exit-code` sau `npm run build` **chỉ dùng được sau khi commit lockfile** (G9b); trước đó CI phải coi bước này là best-effort và chỉ kiểm các tệp `cz-*` (đúng như ghi chú trong blueprint G9a).

## 3. Bộ test: 1 bài lỗi → đã sửa xong trong Milestone A

Baseline (trước khi sửa):

```
✗ LỖI  t_admin_features.js
FAIL Soạn chương/hiện thời gian đọc ước tính  → "0 từ · 0 ký tự · ~1 phút đọc…"
FAIL Soạn chương/danh sách chương có số từ     → "Chưa có chương."
```

**Chẩn đoán trong bản báo cáo đầu là SAI** ("mock thiếu nhánh `/api/book/<slug>`"). Khi bắt tay sửa (Milestone A, G4) mới đo lại bằng log request của chính bài test: mock **đã có** nhánh `/api/book/` và bài test **không hề gọi** `GET /api/book/*`. Nguyên nhân thật: bước 5 của bài test tạo bộ mới "Bộ Mới Test"; `createBook()` cache sẵn **bộ rỗng** vào `bookCache`; bảng Thư viện xếp theo `updated` giảm dần nên bộ rỗng đó **đứng đầu bảng**; bước 6 bấm "Sửa" ở hàng đầu ⇒ mở đúng bộ rỗng ⇒ "Chưa có chương." là **hành vi đúng**.

Đã sửa bằng cách cho bài test lọc đúng bộ `thu-01` trước khi bấm sửa (không sửa mã sản phẩm). Kết quả: **60/60 bài đạt**, exit code 0.

Điểm quan trọng đã kiểm tra để loại trừ rủi ro mất dữ liệu:

- `ChapterEditor` không có nút ghi nào ở trạng thái "chưa có dữ liệu" (chỉ có nút tải lại + copy trung tính).
- `saveBookChapters()` chỉ chạy khi có `localBook` (`src/admin/main.jsx`), nên **không thể PUT một bộ rỗng** khi tải hỏng.
- Worker còn chặn `PUT registry` rỗng đè lên kho đang có (`worker/cms.js`, lỗi "từ chối ghi registry rỗng…"; test `t_registry_guard.mjs`).

## 4. Phụ thuộc và cảnh báo bảo mật

- ~~`npm audit`: **25 moderate**, toàn bộ đến từ chuỗi `@tiptap/*`~~ → **đã xử lý ở D2 (2026-09-30)**: nâng `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-text-align` lên `^3.31.4` (gỡ `@tiptap/extension-link` và `@tiptap/extension-underline` vì đã tích hợp sẵn trong `starter-kit` v3). `npm audit` đạt **`0 vulnerabilities`**.
- ~~`package-lock.json` bị `.gitignore` → cài đặt không tái lập~~ → **đã xử lý ở G9b**: 2 lockfile đã commit, cài bằng `npm ci`. Sau `npm ci && npm run build`, bản build trùng khớp (`git status` sạch) ⇒ bước `git diff --exit-code` trong CI (G9a) đã dùng được.
- Phụ thuộc runtime **không** có dịch vụ trả phí: toàn bộ hạ tầng chạy trên free tier (xem `docs/free-tier-verification.md`).

## 5. Chất lượng mã (quan sát, chưa hành động)

- Quy ước rõ và kỷ luật: mọi thay đổi UI đều có chú thích "VÁ (ngày…)" kèm lý do — đây là tài sản lớn, nên giữ.
- Comment/README rất dài (đặc tả gần như tương đương test). Rủi ro: tài liệu **trôi số liệu** — xem §6.
- Không có `any`/`@ts-ignore` trong Worker (tsc `checkJs` bật và sạch).
- Frontend không có lint/format tự động. Trước khi thêm, ưu tiên CI chạy test (rẻ hơn và đang thiếu).

## 6. Lệch phiên bản giữa các nguồn — ĐÃ XỬ LÝ (G10)

| Nguồn | Giá trị đồng bộ | Ghi chú |
| --- | --- | --- |
| `src/shared/version.js` | `VERSION = '1.18.0'` | Nguồn phiên bản duy nhất (single source of truth) |
| `package.json` / `package-lock.json` | `1.18.0` | Đồng bộ tự động & kiểm tra bằng `tools/check_version.mjs` |
| `worker/cms.js` | nhập `VERSION` từ `../src/shared/version.js` | trả về `/api/health` (`1.18.0`) |
| `worker/README.md` | `1.18.0` | hướng dẫn deploy |

Đã hoàn tất ở **G10**: `tools/check_version.mjs` chạy trong `npm test` đảm bảo mọi nguồn khớp đúng `src/shared/version.js` (tránh lặp lại sự cố kiểu `docs/reports/BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md`).

## 6b. Cache tĩnh `?v=` + service worker — bước bắt buộc mỗi lần đổi `cz-*`/`admin.js`

Phát hiện khi chuẩn bị release Milestone A: đổi `src/cz-story.js`/`src/cz.css` mà **không** đổi `?v=` thì người đã từng mở web vẫn nhận bản JS cũ từ kho shell của service worker (chiến lược stale-while-revalidate: lần mở đó trả bản cũ, lần sau mới có bản mới) ⇒ tính năng mới tới tay người đọc **chậm một nhịp tải trang** và không có tín hiệu "đã có bản cập nhật".

Quy ước ghi ngay trong đầu `sw.js`: *mỗi lần đổi `?v=` tĩnh (`cz.css`/`cz-*.js`) thì sửa cả `PRECACHE` + tăng `CZ_SW_VER`*. Milestone A đã bump: `20260924a` → **`20260930a`** cho `cz.css` + `cz-*.js` (72 tệp HTML, gồm cả 63 thẻ OG trong `truyen/<slug>/index.html`) và `admin.js` `20260926b` → `20260930a`. `admin-docx.js` giữ `20260926b` vì tệp đó không đổi.

`tests/t_pwa.js` canh việc này: nó đối chiếu `PRECACHE` trong `sw.js` với `?v=` trong 5 trang chính ⇒ bump lệch là test đỏ ngay.

## 6c. Chạy npm test trên Windows (Git Bash) — 5 lỗi môi trường

Owner chạy `npm test` trên Windows (Git Bash) thấy đỏ trong khi trên Linux xanh 60/60. Cả 5 nguyên nhân đều là **môi trường**, không phải lỗi sản phẩm; đã vá và merge ở PR #66 (**CONFIRMED** bằng `grep` trên `main`).

| # | Triệu chứng trên Windows | Nguyên nhân | Bản vá |
| --- | --- | --- | --- |
| 1 | Bài so khớp nội dung đỏ hàng loạt | Git for Windows (`core.autocrlf=true`) checkout ra CRLF, test so chuỗi theo `\n` | `.gitattributes`: `* text=auto eol=lf` (+ đánh dấu `binary` cho ảnh/font/docx) |
| 2 | `ERR_UNSUPPORTED_ESM_URL_SCHEME` khi `import()` | Truyền đường dẫn `C:\...` thẳng vào `import()` | `pathToFileURL(...).href` trong 6 bài (`tests/mock_worker.mjs`, `t_kv_quota.mjs`, `t_lock.mjs`, `t_registry_guard.mjs`, `t_schedule.mjs`, `t_worker.mjs`) + `tools/check_chapter_routes.mjs` |
| 3 | `t_devserver` treo/đỏ không rõ lý do | Windows thường không có lệnh `python3`; stderr bị nuốt; chờ hết số lượt kể cả khi tiến trình đã chết | `tests/t_devserver.js` dò lần lượt `python3`/`python`/`py`, ép `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1`, giữ stderr để in khi lỗi, `ready()` thoát sớm khi tiến trình đã thoát |
| 4 | Máy chủ xem thử chết ngay khi khởi động | Console Windows dùng bảng mã cũ (cp1258/cp1252/cp437), `print()` dòng có dấu/ký tự `·` ⇒ `UnicodeEncodeError` | `tools/dev_server.py`: `make_output_safe()` — `reconfigure(errors='replace')` cho stdout/stderr, **không** đổi bảng mã; gọi đầu `main()` |
| 5 | `t_admin_chapter` lúc xanh lúc đỏ | Kiểm tra ngay sau một chuỗi nhịp bất đồng bộ (nhập file → `insertContent` → effect Preact → ghi nháp localStorage), máy chậm thì chưa kịp | `tests/t_admin_chapter.js`: `until(fn, msg)` chờ có hạn điều kiện thay cho kiểm tra tức thì |

Bằng chứng khi vá (tái hiện trên Linux):

- (a) Ép checkout CRLF (`git -c core.autocrlf=true` + checkout lại) ⇒ đúng **7** lỗi như owner báo; có `.gitattributes` ⇒ hết.
- (b) `PYTHONIOENCODING=ascii python3 tools/dev_server.py --port 8899` trước khi vá ⇒ `UnicodeEncodeError` (traceback trỏ vào dòng `print` thông báo khởi động); sau khi vá ⇒ khởi động bình thường, `curl` trả **HTTP 200**.
- (c) `t_admin_chapter` chạy lặp **20/20** lượt xanh; cố ý phá hàm ghi nháp ⇒ đỏ đúng ở kiểm tra tương ứng (không phải test luôn xanh).

Hậu kiểm 2026-09-30: chính `tests/t_admin_chapter.js` và `tests/t_devserver.js` trong PR #66 lại được commit bằng CRLF kèm CR lẻ (`\r\r\n`), nên git coi là nhị phân (`git ls-files --eol` ⇒ `i/-text`) và `.gitattributes` **không** chuẩn hoá được. Đã đổi về LF (diff bỏ qua khoảng trắng rỗng — không đổi logic) và bỏ track `tools/__pycache__/*.pyc` lọt vào cùng PR. Kiểm lại: `git ls-files --eol | grep -v -E '\.(png|jpe?g|webp|gif|ico|woff2?|docx)$' | grep 'i/-text'` phải rỗng.

## 7. Rủi ro hạ tầng đã nhận diện (chi tiết ở `docs/product-discovery.md` §5)

1. **KV free tier: 100.000 lượt đọc + 1.000 lượt ghi/ngày** (đã xác minh 2026-09-30). Ghi đã được ngân sách hoá (`src/shared/kv-budget.js`, `STATS_WRITE_BUDGET`); **lượt đọc đã có bộ đếm + cảnh báo 70%/90% trong Milestone A (A2)** nhưng **chưa deploy Worker** — cho tới khi deploy, `/admin` vẫn hiện `—` ở ô lượt đọc (Worker cũ không trả trường).
2. Khi vượt hạn mức đọc, KV trả lỗi ⇒ **Milestone A (A1) đã thêm dự phòng tĩnh trong trình đọc** (nhãn "đang đọc bản lưu" + nút nối lại), **chưa deploy** (cần `npm run build` + deploy Pages; Worker deploy riêng cho A2).
3. Trang quản trị là điểm yếu duy nhất về phụ thuộc mạng: bản `local` không ghi được (đúng thiết kế). ~~Trạng thái "chưa tải được chương" gộp với "chưa có chương"~~ → **đã tách ở G3** (2026-09-30).
