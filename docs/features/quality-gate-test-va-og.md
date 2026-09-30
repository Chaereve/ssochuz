# Feature blueprint — Quality gate: test xanh, check OG, CI chạy test

- Trạng thái: **G4 ĐÃ XONG** (Milestone A) · **G9a ĐÃ XONG** (`.github/workflows/ci.yml`, 2026-09-30) · **G6 ĐÃ XONG** (`tools/check_og.mjs`, 2026-09-30)
- Khác với thiết kế dưới đây: (1) check là `check_og.mjs`, không tự viết lại luật mà **chạy chính `build_og.mjs` trên bản sao trong thư mục tạm rồi so byte** ⇒ tự bao cả description/og:image/JSON-LD/shell, không lệch logic theo thời gian; (2) CI chưa chạy `check:worker` và không lọc `paths` (AC6) — chạy mọi push/PR, ~8 phút, vẫn $0.
- Gap: G4, G6, G9a · Ưu tiên: P1 (G4) / P2 (G6, G9a) · Size: S
- Tệp liên quan: `tests/t_admin_features.js`, `tests/run.js`, `tools/check_*.js`, `.github/workflows/`

## Kết quả G4 (đã làm) — và một chẩn đoán SAI đã được sửa lại

Bản đề xuất này ghi nguyên nhân test đỏ là "mock thiếu nhánh `/api/book/<slug>`". **Sai.** Khi mở lại mã để sửa thì thấy mock **đã có** nhánh đó từ trước (`if (p.indexOf('/api/book/') === 0) return J(BOOK1);`) và không hề có lời gọi `GET /api/book/*` nào trong lúc test chạy. Nguyên nhân thật, xác minh bằng cách ghi lại log request của chính bài test:

1. Bước 5 tạo bộ mới "Bộ Mới Test" → `createBook()` PUT book + registry, **cache sẵn bộ rỗng vào `bookCache`** rồi chuyển sang tab Soạn.
2. Bảng Thư viện sắp xếp theo `updated` giảm dần (`src/admin/components/BookList.jsx`) ⇒ bộ vừa tạo (0 chương, `updated` = hôm nay) **đứng đầu bảng**.
3. Bước 6 bấm "Sửa" ở **hàng đầu tiên** ⇒ mở đúng bộ rỗng đó, thấy "Chưa có chương." và "0 từ" — **hành vi đúng của sản phẩm**, không phải lỗi sản phẩm, cũng không phải thiếu mock.

⇒ Sửa đúng chỗ: bài test tự lọc đúng bộ cần kiểm (`Truyện Thử 01`) trong ô tìm kiếm rồi bấm hàng chứa `thu-01`, thêm 1 mục canh cổng "tìm thấy đúng bộ cần sửa" để lần sau lọc hỏng là biết ngay. **Không sửa mã sản phẩm** vì không có lỗi sản phẩm.

Bài học giữ lại cho các blueprint sau: kết luận "mock thiếu" trong `docs/engineering-baseline.md` §3 là **giả thuyết chưa kiểm**, khi bắt tay sửa phải đo lại trước khi tin.

Không làm trong Milestone A (ngoài phạm vi owner đã duyệt): mục 1 phần "thêm assertion: API book lỗi 500 → khung soạn chương hiện **trạng thái lỗi**" — đó là hành vi của **G3** (P2, chưa làm), thêm test bây giờ sẽ tạo một bài đỏ mới đúng như thứ đang muốn dẹp.

## Feature statement

> Cho phép **đội phát triển** **tin được vào `npm test`** (xanh trên nhánh sạch, đỏ khi có hồi quy thật) và **không quên các bước sinh tệp tĩnh** (OG, sitemap), bằng cách **sửa harness + thêm 2 check tự động + 1 workflow CI**, để đạt **không có hồi quy lọt lưới vì "test vốn đã đỏ"**.

## Problem statement

- **Bằng chứng 1:** `npm test` hiện đỏ ở `tests/t_admin_features.js` (2 dòng FAIL: "hiện thời gian đọc ước tính", "danh sách chương có số từ"). Nguyên nhân thật là bài test bấm nhầm hàng trong bảng (xem mục "Kết quả G4" ở trên) — chẩn đoán "mock thiếu `/api/book/<slug>`" trong `docs/engineering-baseline.md` §3 là **sai**. Một bộ test đỏ thường trực khiến lỗi mới "hòa lẫn" vào nền đỏ.
- **Bằng chứng 2:** `tools/build_og.mjs` phải chạy tay; không có check nào bảo đảm `truyen/<slug>/index.html` tồn tại và khớp tiêu đề hiện tại của registry. Bộ mới thêm qua admin sẽ rơi về shell `truyen.html` có `<title>Đang tải…</title>` → bot/social đọc sai.
- **Bằng chứng 3:** `.github/workflows/` chỉ có workflow đồng bộ KV chạy tay; không có nơi chạy `npm test` khi push/PR.
- **Hậu quả:** hồi quy tốn công truy tìm; thẻ chia sẻ sai làm giảm lượt click; `_redirects` có thể lệch với bộ mới.

## Scope

### In scope

1. **G4 — Harness (ĐÃ XONG):** sửa bài test chọn đúng hàng `thu-01` thay vì hàng đầu bảng; 2 dòng FAIL chuyển xanh, `npm test` xanh toàn bộ. Assertion "API book lỗi 500 → khung soạn chương hiện trạng thái lỗi" **hoãn sang G3** (xem mục "Kết quả G4").
2. **G6 — Check OG:** `tools/check_og.js` (không cần dependency mới): với mỗi `slug` trong `data/registry.json`, kiểm
   - `truyen/<slug>/index.html` tồn tại;
   - có `<link rel="canonical">` trỏ đúng `/truyen/<slug>/`;
   - `<title>` **khớp** `lib[].title` hiện tại (phát hiện trường hợp quên chạy `npm run og` sau khi sửa tên bộ);
   - `_redirects` có luật riêng cho slug đó (khối OG-BEGIN/OG-END) và luật chung `/truyen/*` vẫn nằm **sau**.
   Thêm vào `tests/run.js` (chạy cùng bộ test, không cần mạng).
3. **G9a — CI:** `.github/workflows/test.yml`: `npm ci` (sau khi G9b commit lockfile) → `npm run build` → `npm run check:worker` → `npm test`; chỉ chạy khi push nhánh/PR tới `main` và thay đổi trong `src/`, `worker/`, `tests/`, `tools/`, `data/`, `*.html`. **Không** chạy browser test (nặng, cần Chromium).
   - Lưu ý: `npm run build` ghi lại tệp ở thư mục gốc → CI phải kiểm `git diff --exit-code` để bắt trường hợp build khác bản commit (bundle admin hiện không tái lập byte-for-byte — xem `docs/engineering-baseline.md` §2.1; nếu không thể đạt, ghi rõ trong CI là "best-effort" và chỉ kiểm các tệp cz-*).

### Out of scope

- Không thêm ESLint/Prettier (chưa cần; ưu tiên test và CI trước).
- Không chạy Playwright trong CI (chi phí thời gian/độ ổn định chưa tương xứng).
- Không đổi cách sinh sitemap (`tools/build_sitemap.py` đã ổn).

### Dependencies

- Owner: đồng ý thêm workflow GitHub Actions (miễn phí cho repo public; repo hiện public).
- G9b (commit `package-lock.json`) là điều kiện để dùng `npm ci` — nếu chưa làm G9b thì CI dùng `npm install` và đánh dấu là tạm.

## User stories và acceptance criteria

```text
Là người sửa mã,
tôi muốn `npm test` xanh và được chạy tự động khi mở PR,
để tôi có thể biết ngay thay đổi của mình có phá gì không.
```

| # | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | Nhánh sạch | `npm test` | 60/60 bài đạt, exit code 0 — **đã đạt 2026-09-30** (`npm test` trên nhánh `arena/01a0f122-ssochuz`) |
| AC2 | Sửa `src/admin/components/ChapterEditor.jsx` làm chương không tải được | `npm test` | Có bài đỏ chỉ đích danh (assertion mới của G4) |
| AC3 | Registry có bộ mới chưa chạy `npm run og` | `npm test` | Bài `check_og.js` đỏ kèm tên slug thiếu |
| AC4 | Đổi tên một bộ trong registry, không chạy `npm run og` | `npm test` | Bài đỏ vì `<title>` lệch |
| AC5 | Mở PR sửa `worker/cms.js` | CI | Job chạy build + check:worker + npm test; đỏ thì chặn merge |
| AC6 | PR chỉ sửa `docs/` | CI | Không chạy (theo `paths`) để tiết kiệm |

## Technical design

- `tools/check_og.js` theo đúng khuôn các check khác: in JSON `{checked, errors0}` và `process.exit(1)` khi có lỗi (để `tests/run.js` nhận diện).
- `tests/run.js`: thêm `path.join('..','tools','check_og.js')` vào danh sách.
- Workflow dùng `actions/checkout@v4`, `actions/setup-node@v4` (`node-version: 22`, `cache: npm`), thời lượng kỳ vọng < 5 phút; không lưu artifact lớn.
- Không thêm secret nào mới (test chạy offline; browser test vẫn chạy tay).

## Alternatives and decision

| Option | Benefits | Drawbacks | Complexity | Recommendation |
| --- | --- | --- | --- | --- |
| **A. Sửa harness + check OG + CI nhẹ (đề xuất)** | Rẻ, chặn hồi quy thật, không cần dịch vụ | Cần owner đồng ý workflow | Thấp | **Chọn** |
| B. Chỉ sửa harness | Nhanh nhất | Không chặn được hồi quy sau này | Rất thấp | Không đủ |
| C. Bật đầy đủ Playwright + Lighthouse trong CI | Phủ rộng | Thời gian/độ ổn định kém, dễ đỏ giả | Cao | Deferred (Milestone C) |
| D. Bỏ hẳn bài test đang đỏ | Xanh ngay | Mất phủ luồng soạn chương | Thấp | Không chấp nhận |

## Free-tier feasibility

| Concern | Assessment | Evidence / assumption | Mitigation |
| --- | --- | --- | --- |
| New paid dependency required? | No | Node/tsc/esbuild đã có | — |
| Requires credit card? | No | GitHub Actions free cho repo public | — |
| Auto-billing risk? | No | Không bật tính năng trả phí của Actions | — |
| Free-tier quota sufficient? | Yes | 1 job nhẹ < 5 phút/lần push; GitHub free 2.000 phút/tháng cho private, không giới hạn cho public | Giới hạn bằng `paths`, không matrix |
| Risk of quota exhaustion | Low | — | — |
| Data/storage growth risk | Low | Không artifact | — |
| Bandwidth/compute risk | Low | — | — |
| Free fallback available? | Yes | Chạy `npm test` ở máy | — |
| Works locally without paid API? | Yes | Test thuần offline | — |
| Owner approval required? | Yes (thêm workflow) | `.github/workflows/` là hạ tầng dự án | Chỉ thêm sau khi owner đồng ý |
