# Đợt P1 — ĐỌC NHẸ, CACHE LÂU, HTML SẠCH (Worker 1.16.0)

**Ngày:** 24/09/2026 · Nối tiếp `BAO-CAO-TIET-KIEM-KV.md` (đợt 2: tiết kiệm hạn mức KV) và
`BAO-CAO-AUDIT-VA-KE-HOACH.md` (báo cáo rà soát kế hoạch “audit & tối ưu toàn hệ thống”).

Chủ trang đã duyệt **làm hết P1**. Báo cáo này nói rõ từng việc đã làm, số đo thật, cách tự
kiểm chứng và những gì **không** làm (kèm lý do).

---

## 0. Kết quả trong một câu

Mở một chương giờ chỉ tải **đúng chương đó (~18 KB)** thay vì cả bộ (trung bình **334 KB**, bộ
lớn **1,4 MB**); link chia sẻ kèm `?fbclid=`/`?utm_source=` **không còn phá cache** (mỗi lượt
trước đây là một lượt đọc KV); cache biên dài hơn (registry 300 giây, bộ 1.800 giây, chương 24
giờ) mà “sửa thấy ngay” **vẫn giữ nguyên**; HTML chương chuyển sang **danh sách cho phép** và đã
chạy thử trên toàn bộ **1.216 chương thật**: không mất chữ, không mất ảnh, bỏ 1.198 `onclick`
chết của Blogger. Trang quản trị (tab Bác sĩ) hiện **số lượt ghi KV thật** lấy từ `/api/health`.

---

## 1. P1-1 · Đọc 1 chương thay vì tải cả bộ

**Thêm 2 đường đọc (route mới, KHÔNG phá đường cũ):**

| Đường dẫn | Trả về |
|---|---|
| `GET /api/book/<slug>/toc` | đầu sách (tiêu đề, tác giả, couple, mô tả) + **tên** các chương đang hiện |
| `GET /api/book/<slug>/chapter/<n>` | đầu sách + mục lục + **đúng 1 chương** (n = vị trí trong danh sách ĐANG HIỆN) |

- `/api/book/<slug>` **giữ nguyên** — trang đọc vẫn rớt về đường cũ khi Worker chưa deploy bản
  mới, khi mất mạng, hoặc với `/data/book/*.json` tĩnh.
- Chương **đang ẩn / hẹn giờ** không có vị trí để gọi: mục lục không liệt kê, và mọi vị trí
  ngoài danh sách trả 404 — không có URL nào trả nội dung chưa lên sóng.
- Truyện **khoá mật mã**: chưa có `?token=` hợp lệ → 403 vỏ `{locked:true}`; có token → đi thẳng
  KV, **không** vào cache chung (không để nội dung riêng của người này lọt cho người khác).
- Trang đọc (`src/cz-story.js`) dùng `/toc` để vẽ trang truyện (mục lục + thông tin) và tải
  chương khi mở. Chương kế/trước được **tải trước** (2 chương kề, mỗi chương ~18 KB) nên bấm
  “Tiếp/Trước” vẫn hiện ngay như trước. Chương tải hỏng → hiện nút **Thử lại** thay vì trắng trang.

**Số đo (mở trang truyện `/truyen/<slug>/`):** chỉ còn **≤ 5 request** và **0 request tải cả bộ**
(mục lục vài KB thay cho JSON 334 KB). Máy đo trong `tests/t_chapter_light.mjs` chặn đúng điều này:
“mở trang truyện → KHÔNG tải cả bộ”, “KHÔNG cần tải chương nào”, “bấm Tiếp → không tải lại
chương đang xem”.

**Đo tại chỗ:** bộ lớn nhất trong repo là `by-your-side.json` (1,43 MB, 32 chương). Mở 1 chương
= 1 file JSON ~18 KB thay cho 1,43 MB — **giảm ~98 %** dữ liệu cho mỗi lượt mở.

---

## 2. P1-2 · Khoá cache bỏ tham số rác (`src/shared/cache-key.js`)

Bản cũ: **mọi URL có query đều đi thẳng KV** (để tránh bị bơm rác khoá `?_=123`). Hệ quả thật:
link chia sẻ qua Facebook/Zalo/Gmail luôn kèm `?fbclid=…`/`?utm_source=…` → **mỗi lượt mở từ link
chia sẻ là một lượt đọc KV** (bộ 334 KB, lại còn `JSON.parse` trong Worker).

Bản mới: bỏ hết tham số rác rồi mới tính khoá (`utm_*`, `fbclid`, `gclid`, `msclkid`, `igshid`,
`spm`, `ref`, `_`, `_ga`, `gbraid`… — danh sách trong `src/shared/cache-key.js`), nên mọi người
dùng **chung một bản lưu**. Tham số **THẬT** (như `token=` của truyện khoá) vẫn đi thẳng KV,
không cache.

---

## 3. P1-4 · Hạn cache dài hơn (mà vẫn “sửa thấy ngay”)

| Đường đọc | Trước | Nay | Vì sao an toàn |
|---|---|---|---|
| `/api/registry` | 60 s | **300 s** | mọi lần ghi đều xoá đúng URL |
| `/api/book/<slug>` | 300 s | **1.800 s** | như trên |
| bộ **còn chương hẹn giờ** | 300 s | **60 s** | chương phải lên sóng đúng mốc giờ |
| `/api/book/<slug>/toc` | — | 1.800 s | sửa chương là xoá mục lục |
| `/api/book/<slug>/chapter/<n>` | — | **24 giờ** | sửa/đổi thứ tự/xoá chương đều xoá đúng mục, xoá cả chùm khi vị trí đổi |
| `/api/comments/<slug>` | không cache | **15 s** | có bình luận mới là xoá ngay |

Cơ chế mới đáng chú ý: mỗi mục cache tự khai **hạn riêng** bằng header nội bộ `x-cz-ttl`. Nhờ vậy
cùng một route mà bộ **có** chương hẹn giờ dùng 60 giây, bộ **không** dùng 24 giờ — không phải
hy sinh độ mới của tính năng hẹn giờ để đổi lấy hạn dài.

---

## 4. P1-3 · Làm sạch HTML theo DANH SÁCH CHO PHÉP (`src/shared/sanitize.js`)

Bản cũ chặn theo **danh sách cấm** — luôn thiếu: `<link>`, `<meta http-equiv=refresh>`,
`<base href>`, `<svg onload>`, `<form action>`, `<input>`, `<template>`, `srcdoc`… đều lọt.
Bản mới **chỉ giữ** những thẻ/thuộc tính có tên trong danh sách; thẻ lạ bị bóc (giữ chữ), thẻ
nguy hiểm bị bỏ cả cụm; URL `javascript:`/`data:`/`vbscript:` (kể cả viết lộn chữ hoặc chèn ký
tự điều khiển) bị chặn; `style` bị soi riêng (`expression()`, `url(javascript:)`, `position:fixed`).

**Đã chạy thử trên toàn bộ dữ liệu thật** — `node tools/check_chapter_html.mjs`:

| | Kết quả |
|---|---|
| Bộ / chương | 63 bộ, **1.216 chương** |
| HTML | 21.220.919 → 21.128.588 byte (**bỏ 92 KB**) |
| Chữ | chỉ mất **3.194 ký tự** — toàn bộ nằm trong cụm **nút phân trang chết của Blogger** (`<button onclick="showPage(n)">1</button>2 3 4…`, 45 chương) |
| Ảnh | 4 → **4** (không mất ảnh nào) |
| Bỏ được | 2.396 thẻ `<button>` chết, 137 `<div>` rác, **1.198 thuộc tính `onclick`** |
| Lỗi | **0** (không chương nào mất chữ, mất ảnh, thành rỗng, hay sinh chữ lạ) |

Thêm 51 phép thử tấn công/bảo toàn định dạng trong `tests/t_sanitize.mjs`.

> **Lưu ý quan trọng:** danh sách cho phép **phải** giữ `<div>/<span>/class/style` — dữ liệu thật
> có **164.137 thẻ `<div>`** (mỗi đoạn văn là một `<div>`); nếu chép danh sách “sạch sẽ” từ tài
> liệu (chỉ p/br/h2/strong/em…) thì cả 63 bộ mất hết định dạng. Đây chính là lý do phải chạy thử
> trên dữ liệu thật trước khi deploy.
>
> HTML **đã nằm trên KV** chỉ được làm sạch lại khi chương đó được lưu lại (không tự viết lại
> toàn kho để khỏi tốn lượt ghi KV). Trang đọc vẫn có lớp thứ hai (`cleanHTML` bằng DOM) nên an
> toàn không phụ thuộc một lớp duy nhất.

---

## 5. P1-5 · Admin thấy số hạn mức KV thật

Tab **Bác sĩ** → ô “KV write quota” nay đọc thẳng từ `/api/health` (Worker tính sẵn):
`stats.writesToday` / `writeBudget` (240) và số thay đổi **đang đệm** trong RAM; dòng dưới vẫn là
số thao tác quản trị theo nhật ký KV. **Không polling** — chỉ đọc lúc nối/đọc lại.

---

## 6. P1-6 · Bình luận có cache biên 15 giây

`GET /api/comments/<slug>` nay lưu 15 giây ở biên (khoá cache giữ `ch` + `limit`, bỏ tham số
rác — `?fbclid=` dùng chung bản lưu). Đăng/xoá bình luận **xoá cache ngay** nên người vừa bình
luận vẫn thấy bình luận của mình tức thì (có bài kiểm chứng trong `tests/t_worker.mjs`).

---

## 7. Những việc KHÔNG làm (và vì sao)

| Việc | Vì sao không làm |
|---|---|
| Chuyển nội dung sang D1 / Postgres | KV + R2/Storage đang đủ; chuyển đổi tốn thời gian, rủi ro dữ liệu, không giải quyết vấn đề nào đang có |
| Prerender từng chương ra file tĩnh | 1.216 chương × nhiều bộ dễ chạm trần 20.000 file của Pages; cache biên cho kết quả tương đương mà không phải deploy lại mỗi lần sửa |
| “Sửa RLS / index / `select('*')`” | Trang này **không có bảng Postgres** nào cho nội dung (nội dung ở KV) — không có gì để sửa |
| Đổi hợp đồng API cũ | `/api/book/<slug>` giữ nguyên; mọi thứ mới chỉ là **thêm** |

---

## 8. Đã kiểm thử những gì

- `tests/t_chapter_light.mjs` (**mới**, 29 kiểm tra): trang đọc dùng đường nhẹ, không tải cả bộ,
  chỉ tải chương cần, tải trước chương kề, Worker cũ thì tự rớt về đường cũ, chương lỗi có nút thử lại.
- `tests/t_sanitize.mjs` (**mới**, 51 kiểm tra): 27 mẫu tấn công + 10 mẫu giữ nguyên định dạng.
- `tools/check_chapter_html.mjs` (**mới**): chạy trên 1.216 chương thật (mục 4).
- `tests/t_worker.mjs`: **373 kiểm tra** (thêm 43 cho 2 route mới, khoá cache, purge, bình luận).
- `tests/t_kv_quota.mjs` 34 · `tests/t_lock.mjs` 26 (khoá/bỏ khoá xoá đúng cache mục lục) ·
  `t_pwa.js` (phiên bản `?v=` khớp `sw.js`) · `npm run check:worker` (TypeScript) ·
  `npm run build:worker` tự kiểm tra tệp gộp · toàn bộ `node tests/run.js` (65 tệp kiểm thử, đều ĐẠT).

Lệnh tự kiểm chứng trên máy:

```bash
node tools/check_chapter_html.mjs     # làm sạch HTML trên 1.216 chương thật
cd tests && node t_chapter_light.mjs  # trang đọc dùng đường nhẹ
cd tests && node t_sanitize.mjs       # 51 mẫu tấn công/định dạng
node tests/run.js                     # toàn bộ bài kiểm thử
```

---

## 9. CẦN CHỦ DỰ ÁN LÀM — deploy Worker (2 cách, chọn 1)

**Cách A — dòng lệnh (khuyên dùng, cần Node):**

```bash
cd worker && npx wrangler deploy      # wrangler tự gộp 9 tệp con
```

**Cách B — dán trong bảng điều khiển Cloudflare (không cần cài gì):**

```bash
npm run build:worker                  # sinh worker/cms.bundle.js (1 tệp, 190 KB, đã gộp)
```

rồi Cloudflare → **Workers & Pages** → Worker `chuseoz-cms` → **Edit code** → xoá code cũ →
**dán toàn bộ `worker/cms.bundle.js`** → **Deploy**.

> **Đừng dán `worker/cms.js`** — tệp đó còn 9 dòng `import` (overflow, Durable Object, mã dùng
> chung) mà bảng điều khiển không tự gộp: dán vào là Worker lỗi và mất cả My Space lẫn truyện
> riêng tư. `npm run build:worker` đã tự kiểm tra (không còn `import`, còn đủ `MemberSpaces`,
> `PrivateBooks`, `export default`) nên dán là chạy.

Cả hai cách: mở `https://<worker>/api/health` phải thấy `"version": "1.16.0"`.

**Chưa deploy thì:** trang đọc vẫn chạy bình thường (tự rớt về đường tải cả bộ như cũ) — chỉ là
chưa được hưởng phần nhanh/nhẹ và KV vẫn tốn như trước.

**Sau khi deploy**, xem lại Cloudflare → Workers & Pages → KV → Metrics sau 1 ngày: lượt **ghi**
phải tụt mạnh so với trước (ngân sách số liệu ≤ 243 lượt/ngày), lượt **đọc** cũng giảm vì link
chia sẻ không còn phá cache và cache sống lâu hơn.

---

## 10. Việc còn lại (chỉ khi cần)

- **P2**: phân trang bình luận rõ hơn (`limit` ≤ 500), nén ảnh khi import từ Blogger.
- **Trần hạn mức ghi còn lại là phiếu bầu/đánh giá/bình luận** (mỗi cái là 1 lượt ghi thật, không
  đệm). Ngân sách ghi số liệu 240/ngày cộng phần này vẫn dưới 1.000 lượt/ngày nếu mỗi ngày dưới
  ~600 lượt bầu + đánh giá + bình luận. Vượt mức đó thì bước tiếp theo là **đệm phiếu bầu theo
  đợt** đúng như đang làm với lượt đọc — cùng cơ chế `kv-budget.js`, mình làm được khi cần.
- **`s-maxage` bị chặn trần 600 giây** cho mọi đường: bản lưu TRONG Worker (thứ xoá được mỗi lần
  ghi) để 24 giờ, còn các tầng cache trung gian không xoá được thì tối đa 10 phút.
