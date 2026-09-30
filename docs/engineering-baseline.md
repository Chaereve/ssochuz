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
| Lockfile | **Không có trong git** | `.gitignore` bỏ qua `package-lock.json` |
| CI | **Chỉ 1 workflow** | `.github/workflows/sync-kv-to-repo.yml` (chạy tay, đồng bộ KV → repo). Không có workflow chạy `npm test`/build |
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
| `npm run build` | ĐẠT | sinh `cz-*.js`, `cz.css`, `admin.js`, `admin.js.map`, `admin-docx.js` |
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

- `npm audit`: **25 moderate**, toàn bộ đến từ chuỗi `@tiptap/*` (đang dùng `^2.27.3`, bản vá nằm ở `3.31.3` — **nâng cấp breaking**). Tiptap chỉ chạy trong trang quản trị (`admin.js`), không nằm trong luồng đọc.
  - Khuyến nghị: **Deferred** — cần owner duyệt vì là major bump; trước khi làm phải có test admin hiện có (đang khá đầy đủ) + kiểm tra tay luồng soạn chương.
- `package-lock.json` bị `.gitignore` → cài đặt không tái lập; `preact`, `@tiptap/*`, `jsdom` dùng `^`.
- Phụ thuộc runtime **không** có dịch vụ trả phí: toàn bộ hạ tầng chạy trên free tier (xem `docs/free-tier-verification.md`).

## 5. Chất lượng mã (quan sát, chưa hành động)

- Quy ước rõ và kỷ luật: mọi thay đổi UI đều có chú thích "VÁ (ngày…)" kèm lý do — đây là tài sản lớn, nên giữ.
- Comment/README rất dài (đặc tả gần như tương đương test). Rủi ro: tài liệu **trôi số liệu** — xem §6.
- Không có `any`/`@ts-ignore` trong Worker (tsc `checkJs` bật và sạch).
- Frontend không có lint/format tự động. Trước khi thêm, ưu tiên CI chạy test (rẻ hơn và đang thiếu).

## 6. Lệch phiên bản giữa các nguồn

| Nguồn | Giá trị | Ghi chú |
| --- | --- | --- |
| `package.json` | `1.10.0` | dùng cho mọi thông báo npm |
| `worker/cms.js` | `VERSION = '1.17.1'` | trả về `/api/health` |
| `worker/README.md` | còn nhiều mục "1.16.1", "1.16.0" | hướng dẫn deploy |
| `tests/_stats.json` | số kiểm tra cũ | số lượng kiểm tra theo từng bài |

Không phải lỗi chức năng, nhưng gây nhiễu khi đối chiếu bản deploy (bài học từ sự cố `BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md`). **P3:** một nguồn version duy nhất + script đồng bộ.

## 7. Rủi ro hạ tầng đã nhận diện (chi tiết ở `docs/product-discovery.md` §5)

1. **KV free tier: 100.000 lượt đọc + 1.000 lượt ghi/ngày** (đã xác minh 2026-09-30). Ghi đã được ngân sách hoá (`src/shared/kv-budget.js`, `STATS_WRITE_BUDGET`); **lượt đọc đã có bộ đếm + cảnh báo 70%/90% trong Milestone A (A2)** nhưng **chưa deploy Worker** — cho tới khi deploy, `/admin` vẫn hiện `—` ở ô lượt đọc (Worker cũ không trả trường).
2. Khi vượt hạn mức đọc, KV trả lỗi ⇒ **Milestone A (A1) đã thêm dự phòng tĩnh trong trình đọc** (nhãn "đang đọc bản lưu" + nút nối lại), **chưa deploy** (cần `npm run build` + deploy Pages; Worker deploy riêng cho A2).
3. Trang quản trị là điểm yếu duy nhất về phụ thuộc mạng: bản `local` không ghi được (đúng thiết kế), nhưng trạng thái "chưa tải được chương" gộp với "chưa có chương" → dễ gây hiểu nhầm cho biên tập viên.
