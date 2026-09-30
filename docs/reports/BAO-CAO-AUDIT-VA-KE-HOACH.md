# Rà soát kế hoạch "audit & tối ưu toàn hệ thống" — cái nào làm được trên trang này

**Ngày:** 23/09/2026 · Trạng thái: **báo cáo audit (chưa code thêm gì theo kế hoạch)** — theo
đúng luật của kế hoạch là "audit trước, chờ duyệt rồi mới sửa".

---

## 0. Kết luận trong một câu

**Làm được phần lớn, nhưng khoảng một phần ba kế hoạch KHÔNG áp dụng cho trang này**,
vì kế hoạch giả định nội dung truyện nằm trong **PostgreSQL của Supabase** — thực tế nội
dung đang nằm trên **Cloudflare KV**, còn Supabase chỉ giữ vai trò **đăng nhập (Auth)** và
**kho ảnh (Storage, tuỳ chọn)**. Các mục kiểu "kiểm tra RLS bảng books/chapters", "index
`book_id + chapter_number`", "tránh `select('*')`", "bảng revision", "cột view_count"…
**không có gì để sửa vì những bảng/cột đó không tồn tại** ở trang này.

Đổi lại, kế hoạch có 5–6 việc **rất đáng làm** và đều làm được trong repo hiện tại
(mục E bên dưới). Riêng chuyện hạn mức KV (thư 90% của Cloudflare) thì **đã xử lý xong
hôm nay** — xem `BAO-CAO-TIET-KIEM-KV.md`.

---

## A. Bản đồ kiến trúc thật của trang (đọc từ mã nguồn, không đoán)

```
Người đọc
  │
  ├─ trang tĩnh: Cloudflare Pages  (index.html, truyen.html, cz-*.js, cz.css, data/*.json)
  │     · 63 bộ truyện trong data/ = 20,5 MB, JSON mỗi bộ trung bình 334 KB, lớn nhất 1,4 MB
  │     · data/ chỉ là BẢN DỰ PHÒNG khi Worker/KV không đọc được
  │     · chỉ 3/1.216 chương có ảnh, ảnh đều nằm ngoài (blogger.googleusercontent.com)
  │
  └─ dữ liệu động: Cloudflare Worker `worker/cms.js` (MỘT worker, mọi API)
        ├─ KV `CZ_KV`  ← nguồn sự thật của nội dung
        │     registry            danh mục 63 bộ (53 KB)
        │     book:<slug>         nội dung từng bộ (JSON, có thể là stub overflow)
        │     stats               lượt đọc + phiếu bầu (1 khoá, tự đếm)
        │     rateagg             tổng đánh giá sao MỌI bộ (vừa gộp hôm nay)
        │     rate:<slug>:<who>   điểm sao của riêng từng người
        │     cmt:<slug>          bình luận từng bộ
        │     img:<id>            ảnh (base64) hoặc stub trỏ Storage/R2
        │     report / log / push:* / pushq / rl:* / schedule_cache
        ├─ R2 `CZ_R2` (tuỳ chọn)      overflow book/ảnh — binding đã khai trong wrangler.toml
        ├─ Durable Objects            MemberSpaces (hồ sơ + tủ truyện mỗi người),
        │                             PrivateBooks (truyện riêng tư, khoá mật mã)
        ├─ Supabase                   chỉ: Auth (kiểm JWT) + Storage bucket `covers`/`images`
        │                             + bảng `ssochuz_blobs` (key, value, mime) cho overflow
        └─ Cron `*/10 * * * *`        chương hẹn giờ lên sóng + rút hàng đợi thông báo đẩy
```

**Những thứ KHÔNG tồn tại** (kế hoạch giả định có): bảng Postgres `books`, `chapters`,
`users`, `bookmarks`, `history`, `comments`, `view_count`, `revision`; thư viện Supabase JS
truy vấn bảng từ trình duyệt; file migration SQL (**0 file `.sql` trong repo**);
framework/bundler kiểu React/Next (frontend là JS thuần + Preact chỉ cho trang quản trị);
Pages Functions (không có, chỉ có Worker riêng).

---

## B. Route nào chạm Supabase (kiểm tra bằng grep, không phải liệt kê ước lượng)

| Route / hàm | Chạm gì | Ai gọi |
|---|---|---|
| `POST /api/auth/supabase` | `GET <project>/auth/v1/.well-known/jwks.json` (kiểm chữ ký JWT) | web, khi đăng nhập |
| `userFromReq()` (mọi route cần Bearer) | JWKS, có cache khoá trong RAM | bình luận, đánh giá, tủ truyện |
| `POST /api/img` (kind=cover) | `POST /storage/v1/object/covers/…` | trang quản trị |
| `POST /api/img` (ảnh chương) | `POST /storage/v1/object/images/…` | trang quản trị |
| `GET /api/img/<id>` | không gọi Supabase — chỉ trả **302** về URL public của Storage (nay đã cache biên) | người đọc |
| `POST /api/admin/migrate-overflow` | PostgREST bảng `ssochuz_blobs` + Storage (1 lần, khi chủ trang bấm) | trang quản trị |
| `GET /api/health` | không gọi Supabase (đọc ghim project trong KV) | trang quản trị |

→ **Trình duyệt không truy vấn Postgres.** Vì vậy chuyện "RLS" gần như không có bề mặt:
PostgREST chỉ được Worker gọi bằng `SUPABASE_SERVICE_ROLE` (secret nằm phía Worker,
`check_secrets.js` chặn việc dán secret vào tệp public).

---

## C. Nơi thật sự tốn quota (số liệu đo được, không phải phỏng đoán)

| Nguồn | Trước | Sau bản 1.15.0 | Ghi chú |
|---|---|---|---|
| KV — khoá `stats` | **8.640 lượt ghi/ngày** (mỗi 10 giây) | **≤ 243/ngày** (trần 240 + dự trữ), 0 nếu vắng khách | nguyên nhân chính của thư 90% |
| KV — mỗi lượt xem | 1 đọc + 1 ghi | **0 ghi** cho người đọc thường | bộ đếm trong RAM |
| KV — mỗi lượt bầu | ~6 thao tác | ~2 thao tác | |
| KV — mỗi lần đọc `/api/stats` trượt cache | **1 LIST** + N đọc | 0 LIST, 1 đọc | tổng sao gộp 1 khoá |
| Supabase Postgres | chỉ bảng `ssochuz_blobs` (overflow), ~20 MB nếu đã chuyển hết | — | **cần xác nhận trên dashboard** |
| Supabase Storage | ảnh chương + bìa (nếu đã chuyển) | — | ảnh rất ít (3 chương có ảnh) |
| Supabase egress | JWKS (nhỏ, cache 1 giờ) + ảnh Storage khi có người xem | — | ảnh public qua CDN Supabase |
| Worker | mỗi lần mở trang đọc cần **cả bộ JSON** (334 KB trung bình) | — | nặng CPU/băng thông, xem P1-1 |

**Điểm đáng chú ý nhất về mặt hiệu năng còn lại:** mở **một chương** hiện tải **cả bộ
truyện** (`GET /api/book/<slug>` trả toàn bộ chương trong 1 JSON). Với bộ 1,4 MB, mỗi lần
mở trang đọc là 1,4 MB — chậm trên 3G và tốn CPU Worker. Kế hoạch gọi đúng chỗ này
(route chapter riêng + cache dài) và đây là việc **đáng làm nhất** tiếp theo.

---

## D. Rủi ro bảo mật / dữ liệu — trạng thái thật

| Việc | Trạng thái |
|---|---|
| Secret lọt vào frontend | **Đã có lưới**: `tools/check_secrets.js` quét mọi tệp public + chặn email/secret literal; `SUPABASE_SERVICE_ROLE` chỉ ở Worker |
| Source map / báo cáo nội bộ bị tải công khai | Có luật trong `_redirects`; **hôm nay phát hiện 1 báo cáo cũ bị sót** (`BAO-CAO-HEN-GIO-VA-ANH.md`) và đã chặn |
| XSS trong HTML chương | `sanitizeChapterHtml()` (bỏ script/iframe/on*/javascript:) + có bài kiểm thử riêng. **Nhưng là danh sách CẤM (denylist)**, kế hoạch muốn **danh sách CHO PHÉP (allowlist)** — xem P1-3 |
| Ảnh trong chương từ domain lạ | Chưa giới hạn domain; chỉ admin nhập được, ảnh nhập từ Blogger đã lọc `http(s)` |
| Chương nháp/hẹn giờ lọt ra ngoài | Đã chặn: Worker lọc ở `getBookPublic`, RSS, và cả số chương — có 39 bài kiểm thử (`t_schedule.mjs`) |
| Truyện khoá mật mã | Token HMAC 6 giờ, PBKDF2 100.000 vòng, không lưu chương khi chưa mở; truyện riêng tư dùng Durable Object |
| Cache biên chứa dữ liệu riêng | Admin đi thẳng KV (`private, no-store`), cache chỉ lưu bản công khai đã lọc |
| Chống spam | Đã có; hôm nay chuyển bộ đếm sang RAM + vẫn giữ trần (xem báo cáo KV) |
| RLS | **Không có bề mặt**: trình duyệt không truy vấn bảng nào |
| View count ghi DB mỗi lượt đọc | **Không xảy ra** — số liệu nằm ở KV và gom theo đợt |

---

## E. Kế hoạch theo mức ưu tiên (chỉ những việc thật sự áp dụng được)

### P0 — nên làm ngay (đều là việc vận hành, không cần sửa code)

1. **Deploy Worker bản 1.15.0** (`cd worker && npx wrangler deploy`) — nếu chưa deploy thì
   mọi tối ưu KV hôm nay chưa có tác dụng. Kiểm tra: `curl <worker>/api/health` thấy
   `"version": "1.15.0"`.
2. **Đặt cảnh báo hạn mức** trên Cloudflare (Notifications → Workers KV) và Supabase
   (Billing → usage alerts) — làm trên dashboard, 0 dòng code.
3. **Xác nhận cấu hình overflow**: đã đặt `SUPABASE_SERVICE_ROLE` chưa, R2 binding
   `CZ_R2` đã hoạt động chưa; nếu chưa thì base64 vẫn nằm trong KV (không sai, chỉ tốn
   dung lượng KV 1 GB — hiện rất nhỏ vì chỉ 3 chương có ảnh).

### P1 — tối ưu đáng làm (mình làm được trong repo, có kiểm thử)

1. **Route đọc 1 chương** `GET /api/book/<slug>/chapter/<n>` (+ bản public đã lọc nháp/hẹn
   giờ) với cache biên **dài (1–7 ngày)** và purge theo URL khi admin sửa chương.
   Lợi: payload mỗi lần mở chương từ ~334 KB → vài chục KB; ít CPU Worker; đọc nhanh hơn
   trên mobile. **Giữ nguyên** `/api/book/<slug>` cũ nên không phá gì (đây là "thêm route",
   không phải đổi API contract).
2. **Chuẩn hoá cache key**: URL có `?utm_source=…&fbclid=…` hiện **bị BYPASS cache biên**
   (mỗi lần dán link là 1 lượt đọc KV). Bỏ/thứ tự hoá các tham số rác đó → cache dùng chung.
3. **Sanitizer theo allowlist**: cho phép `p, br, h2, h3, strong, em, blockquote, ul, ol, li,
   a, img` như kế hoạch, chặn mọi thứ khác + allowlist domain ảnh. Việc này phải làm kèm
   bài kiểm thử trên **1.216 chương thật** để chắc chắn không mất định dạng cũ.
4. **Tăng TTL cache** cho `/api/registry` (60 → 300 giây) và `/api/book/*` (300 → 3.600
   giây) — an toàn vì mọi lần ghi đã tự purge đúng URL.
5. **Hiện số liệu hạn mức trong admin** (tab Bác sĩ): `stats.writesToday`, `writeBudget`,
   `buffered` (Worker đã trả sẵn ở `/api/health`) + số bộ/chương. Không polling, chỉ đọc khi
   mở tab.
6. **`GET /api/comments/<slug>` cache biên 10–15 giây** cho khách vãng lai, purge khi có
   bình luận mới — giảm lượt đọc KV khi chương có nhiều bình luận.

### P2 — chỉ khi cần

- Giới hạn độ dài/độ sâu bình luận + phân trang rõ hơn (hiện `limit` ≤ 500).
- Nén ảnh chương trong lúc import từ Blogger.
- Dọn `data/book/*.json` cũ trong repo (đã có bản KV) — cẩn thận: đây là **đường dự phòng**,
  không nên xoá khi chưa chắc.

### Những mục của kế hoạch mình **không** làm và lý do

| Mục trong kế hoạch | Vì sao không áp dụng |
|---|---|
| RLS, index `book_id+chapter_number`, `select(*)`, bảng revision, cột view_count | Không có bảng Postgres như vậy ở trang này (nội dung ở KV) |
| Chuyển sang D1 | Không cần: KV + R2 + Storage đã đủ; chuyển đổi tốn thời gian và rủi ro |
| Prerender mỗi chương khi publish (Option B) | Mỗi lần đăng chương phải deploy lại Pages; 1.216 chương × nhiều bộ dễ chạm trần 20.000 file; mà lợi ích không bằng cache biên đã có. **Chọn Option A** (đọc động + cache dài + purge) |
| Signed URL cho ảnh chương | Phá cache CDN, không cần vì ảnh vốn công khai |
| Sửa RLS "cho chắc" | Không có gì để sửa; đụng vào còn dễ làm vỡ đăng nhập |

---

## F. Danh sách tệp dự kiến sửa/thêm (nếu chủ trang duyệt P1)

| Tệp | Việc |
|---|---|
| `worker/cms.js` | thêm route đọc 1 chương; chuẩn hoá cache key; TTL mới; cache bình luận; purge |
| `src/shared/cache-key.js` *(mới)* | hàm bỏ tham số rác (utm_, fbclid, gclid, ref) dùng chung |
| `src/shared/sanitize.js` *(mới, tuỳ chọn)* | bản allowlist cho HTML chương, dùng chung Worker + admin |
| `src/cz-app.js` | trang đọc gọi route chương mới, **vẫn có đường lùi** về `/api/book/<slug>` cũ |
| `src/admin/components/OperationalPanels.jsx` | hiện số liệu hạn mức KV trong tab Bác sĩ |
| `tests/t_worker.mjs`, `tests/t_kv_quota.mjs`, `tests/t_reader.js` | kiểm thử cho các phần trên |
| `_headers`, `_redirects` | nếu thêm tệp nội bộ mới ở gốc thì phải chặn (đã có luật tự kiểm) |

---

## G. Xác nhận về migration / schema / hợp đồng API

- **Không có migration DB, không đổi schema** — vì không có bảng Postgres nào liên quan.
- **Không đổi hợp đồng API cũ**: route mới là *thêm*, `/api/book/<slug>` giữ nguyên; trang
  đọc sẽ tự lùi về đường cũ nếu route mới lỗi.
- **Rủi ro có thể chạm production**: (1) TTL cache dài hơn → nếu cơ chế purge hỏng thì bản
  sửa chậm thấy (đã có sẵn purge theo URL và bài kiểm thử `cache/*` trong `t_worker.mjs`);
  (2) sanitizer allowlist → nếu luật quá chặt có thể mất định dạng chương cũ ⇒ phải chạy thử
  trên toàn bộ 1.216 chương trước khi deploy.
- **Không xoá dữ liệu, không reset, không xoá RLS/policy.**

---

## CẦN CHỦ DỰ ÁN THỰC HIỆN (những thứ mình không có quyền truy cập)

1. **Cloudflare → Workers & Pages → KV → Metrics**: xem Reads/Writes/Deletes/List theo ngày
   (sau khi deploy bản mới, con số ghi phải tụt mạnh).
2. **Cloudflare → Workers & Pages → Workers**: xác nhận request/ngày so với trần 100.000.
3. **Cloudflare → R2**: đã tạo bucket và gắn binding `CZ_R2` cho Worker chưa?
4. **Supabase → Reports/Usage**: Database size (trần 500 MB), Egress, Storage — gửi mình con
   số thật thì mình mới nói được còn bao xa mới chạm trần.
5. **Supabase → SQL Editor**, chạy 2 câu này và gửi kết quả:
   ```sql
   select pg_size_pretty(pg_database_size(current_database())) as db_size;
   select count(*) as so_dong, pg_size_pretty(sum(length(value))::bigint) as tong_byte
   from ssochuz_blobs;
   ```
   (nếu bảng chưa tồn tại → overflow chưa bật, cứ nói mình biết.)
6. **Quyết định**: duyệt P1 hay không, và trong P1 thì làm mục nào trước (mình đề xuất
   P1-1 route đọc 1 chương → P1-2 cache key → P1-4 TTL → P1-5 hiện số liệu → P1-3 sanitizer
   → P1-6 cache bình luận).
