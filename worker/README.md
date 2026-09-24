# Kênh đăng + số liệu xếp hạng — Cloudflare Worker + KV (không cần GitHub build, không cần Firebase)

**Mục tiêu:** sửa truyện/chương trên web quản trị ⇒ người đọc thấy **ngay** (vài giây), không commit GitHub, không đợi Cloudflare build, không tốn phút CI.
Từ bản **1.4.0**: lượt đọc và bình chọn cũng nằm trên **KV** — **Firebase không còn cần nữa**.
Từ bản **1.7.0**: số liệu vote/view đồng bộ NHANH và chính xác — `/api/stats` cộng cả phần đang đệm
nên lượt đọc hiện ngay; bỏ phiếu nhận cả khoá đăng nhập lẫn khoá máy nên **gỡ vote luôn giảm đúng**;
web đổi tên thương hiệu **ssochuz** (khoá localStorage tự chuyển, không mất dữ liệu).
Từ bản **1.9.5**: 3 đường đọc nhiều (`registry`/`book`/`stats`) có **cache biên** —
hàng trăm người cùng đọc một phút thì KV chỉ tốn 1 lượt đọc; web chỉ gửi 1 POST `/api/view`
mỗi máy/truyện/ngày (khoá `ssochuz-viewsent-…`), “sửa thấy ngay” vẫn giữ nhờ tự xoá cache sau mỗi lần ghi.
Từ bản **1.9.6**: có **RSS feed** — `GET /feed.xml` (30 chương mới nhất)
và `GET /feed.xml?slug=<slug>` (chương mới của 1 bộ), chuẩn RSS 2.0, cache biên 10 phút,
mỗi lần ghi chương tự xoá cache nên chương mới lên feed ngay.
Từ bản **1.10.1**: MỌI response của Worker đều được **bảo đảm mang header CORS** (kể cả lúc
Worker ném lỗi) — hết cảnh "một tab của /admin báo *Failed to fetch* trong khi mọi tab khác
vẫn chạy". Đây chính là bệnh của tab **Báo lỗi** ở bản ≤ 1.10.0 (xem mục 7c).
Từ bản **1.9.8**: **vá hẳn bệnh "đăng nhập xong vẫn 401"** — project Supabase
dùng khoá public `sb_publishable_…` ký token bằng **ES256**, Worker phải **ghim đúng project**
(biến `SUPABASE_URL` hoặc Project URL lưu ở `/admin` → Cài đặt & đồng bộ → Lưu) rồi verify bằng
JWKS. Đổi ghim **không cần deploy lại**. My Space/bình luận/đánh giá sao hoạt động lại bình thường.
Trước đó, bản **1.9.7**: có **thông báo đẩy "ra chương mới"** (Web Push + VAPID) —
bấm "Theo dõi" thì web hỏi bật thông báo, admin lưu chương mới là subscriber nhận tin
trong ≤10 phút qua Cron Trigger, bấm vào mở thẳng URL chương.
Từ bản **1.14.0**: dữ liệu lớn đi qua **overflow** (bảng Supabase `ssochuz_blobs` / R2 / Supabase Storage
`covers`) thay vì nhét hết trong KV, và có **`POST /api/admin/migrate-overflow`** để chuyển cả book/ảnh
CŨ đang nằm trong KV sang overflow (kể cả **bìa truyện** → Storage `covers`). Trang admin tab **Bác sĩ**
có nút chuyển kèm tiến độ. Cùng bản: import Blogger chấp nhận **chương chỉ có ảnh** (truyện tranh) và
đặt tên chương theo **parser chung** (`src/shared/chapters.js`) — “Lờí mở đầu”, “Giới thiệu nhân vật”,
“Ngoại truyện”, “Chương 0” **không còn bị tính nhầm là Chương 1**.
Từ bản **1.16.1**: **deploy không còn làm mất `SUPABASE_URL`** — biến này nằm trong
`worker/wrangler.toml` (wrangler deploy thay toàn bộ biến thường bằng nội dung tệp đó, nên
biến đặt tay trên dashboard bị xoá — sự cố 23/09 làm cả 63 bộ không đọc được); thiếu biến thì
Worker tự dùng Project URL đã lưu ở `/admin`; lỗi đọc bộ **nêu tên biến thiếu** thay vì
“không đọc được dữ liệu bộ (overflow?)”; `/toc` phân biệt **404 chưa có bộ** với **502 có mà
không đọc được**; và admin **không ghi đè được** bộ đang unreadable.
Chi tiết: `BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md`.
Từ bản **1.16.0**: **đọc nhẹ + cache lâu** — thêm `GET /api/book/<slug>/toc` (mục lục vài KB)
và `GET /api/book/<slug>/chapter/<n>` (đúng 1 chương), trang đọc dùng 2 đường này thay cho việc
tải **cả bộ cho mỗi lượt mở chương** (trung bình 334 KB, bộ lớn 1,4 MB); **khoá cache biên bỏ
tham số rác** (`?fbclid=`, `?utm_source=`, `?_=`) nên link chia sẻ qua Facebook/Zalo dùng chung
một bản lưu thay vì mỗi lượt là một lần đọc KV; hạn cache nâng lên (registry 300 giây, bộ 1.800
giây, chương 24 giờ — bộ còn **chương hẹn giờ** tự hạ còn 60 giây để chương lên sóng đúng mốc);
bình luận có cache biên 15 giây; và **HTML chương được làm sạch theo danh sách cho phép**
(`src/shared/sanitize.js`, đã chạy thử trên toàn bộ 1.216 chương thật — không mất chữ, không mất
ảnh, bỏ 1.198 `onclick` chết của Blogger).
Trước đó, bản **1.6.0**: đăng nhập qua **Supabase** (hết lỗi `origin_mismatch` của Google), thích **theo từng chương**, bình luận **ngay trong trang đọc** (khách chưa đăng nhập vẫn gửi được), và có `/api/recount` để **chữa dứt điểm số chương sai**.

```
Admin (admin.html)  ──PUT──▶  Worker (worker/cms.js)  ──▶  Cloudflare KV
                                      │                        │
   Web (index.html / truyen.html) ──GET──────────────────────────┘
                                      │
                                      ├─▶ Blogger feed   (số chương, tình trạng, ngày cập nhật, lịch ra chương)
                                      └─▶ KV `stats`     (lượt đọc + bình chọn, Worker tự đếm)
```

GitHub vẫn dùng để **chứa code** (muốn deploy code mới thì mới cần build); dữ liệu thì không đi qua GitHub nữa.

## Có gì mới ở bản 1.17.0 — sao lưu ảnh ngoài về kho + đo được mức tốn Worker

| | |
|---|---|
| **Bệnh** | 63/63 bìa trong `data/registry.json` là **link ngoài** (justwatch/amazon/twimg/blogger): host kia gỡ ảnh là **mất bìa**, repo chỉ giữ link chết; và mình không kiểm soát dung lượng ảnh của họ |
| **Chữa 1 — sao lưu** | `POST /api/admin/mirror-images` (cần `x-admin-key`): tải ảnh ngoài về, ghi **Supabase Storage `covers`/`images`** (không có Supabase thì KV), rồi **viết lại link** trong `registry.thumb/slide/cover` + HTML chương. `body: {limit? (≤25, mặc định 8), only?: 'covers'\|'chapters', edge?, dryRun?}` |
| **Chữa 2 — nhẹ mà vẫn rõ** | Hỏi **chính CDN đó** bản nhỏ hơn bằng cách sửa URL theo luật host (`src/shared/image-url.js`): googleusercontent `/s1600/`→`/s800-rw/`, justwatch `/s718/`→`/s800/`, amazon `_UX600_`→`_UX800_QL80_`, twimg `?format=webp&name=medium`, wikimedia `/600px-`. Mốc mặc định **800 px bìa / 1200 px ảnh chương**. Không chắc luật của host thì **giữ URL gốc** |
| **An toàn** | id theo **băm của URL** → chạy lại không tải lại, không tạo bản sao; ngửi **magic bytes** (không tin `Content-Type`); > 8 MB thì bỏ qua; `dryRun:true` chỉ báo cáo; lỗi từng ảnh nằm trong `failed[]`, không đụng ảnh còn lại |
| **Sao lưu về máy** | `python3 tools/pull_from_kv.py --images` — gom mọi `/api/img/<id>` web đang dùng, tải về `_backup/img/` (theo cả 302 nên ảnh trên Supabase cũng tải được), ảnh đã đúng bằng byte thì bỏ qua. `--images-only` cho nhanh, `--images-into <thư mục>` để đổi chỗ |
| **Đo được** | `tools/bench_kv.mjs` **đã sửa** (trước đây chạy đúng cú pháp README là văng `ERR_MODULE_NOT_FOUND`). Nay đo thêm **100 lượt mở chương** của bộ 200 chương: đường nhẹ 2,19 MB vs đường cũ 360,7 MB (**giảm 99 %** byte; số lượt đọc KV giảm là nhờ cache biên 24 giờ của `/chapter/<n>`) |
| **Ảnh upload vẫn nén ở trình duyệt** | bìa ≤ 120 KB/1000 px, ảnh chương ≤ 260 KB/1440 px, đại diện 256², ảnh báo lỗi 1800 px (`src/admin/utils/images.js`, `src/cz-space.js`, `src/cz-app.js`). Worker không nén lại — Workers không có canvas, Cloudflare Images thì trả phí |
| **Test** | `tests/t_worker.mjs` **+23 kiểm tra** (mục 17) — tổng **417**. `npm run check:worker` bắt được 1 bug thật (route đọc `.rewrites` trên `Response`) |
| **Chi tiết** | `BAO-CAO-TIET-KIEM-WORKER-VA-SAO-LUU-ANH.md` |

## Có gì mới ở bản 1.16.1 — deploy không còn làm mất `SUPABASE_URL`

| | |
|---|---|
| **Bệnh** | Deploy 1.16.0 xong, `/api/health` vẫn báo version mới nhưng `overflow.supabase:false` và `auth.supabase:false` — **cả 63 bộ không đọc được**: `/api/book/<slug>` → 502, `/api/book/<slug>/toc` → 404. Nguyên nhân: `wrangler deploy` thay toàn bộ biến thường bằng nội dung `wrangler.toml`, mà `SUPABASE_URL` khi đó chỉ đặt tay trên dashboard ⇒ bị xoá. Người đọc chỉ còn đường tĩnh `/data/book/*.json` (nội dung đứng yên, bình luận/đăng nhập tắt) |
| **Chữa 1 — hết bị xoá** | `SUPABASE_URL = "https://hnyzrkdlmvelbgcowztk.supabase.co"` nằm trong `[vars]` của `worker/wrangler.toml` (URL công khai, không phải secret) kèm cảnh báo ngay phía trên. Deploy bao nhiêu lần cũng còn |
| **Chữa 2 — đường cứu hộ, không cần deploy** | Thiếu biến mà quản trị đã lưu **Project URL** ở `/admin` → Cài đặt & đồng bộ → Đăng nhập thì Worker tự dùng ghim đó (`registry.settings.auth.supabaseUrl`) cho **cả phần đọc/ghi overflow**, dùng chung một ghim với phần đăng nhập (`sbPinUrl` trong `worker/overflow.js`, cache 60 giây). Chỉ nhận đúng host `*.supabase.co|in|net` nên URL lạ trong registry không trở thành nơi gửi service-role key |
| **Chữa 3 — lỗi nói rõ bệnh** | Lỗi đọc bộ hết cảnh `"không đọc được dữ liệu bộ (overflow?)"`. Nay 502 kèm `missing` (tên biến thiếu), `tried` (lý do từng đường: `supabase: HTTP 401 …`, `r2: không có khoá …`, `chưa cấu hình overflow nào — thiếu SUPABASE_URL + SUPABASE_SERVICE_ROLE`) và `hint` (2 cách chữa). `/api/health` có thêm `overflow.supabaseUrl`, `overflow.urlVia` (`env`/`kv`), `overflow.missing` |
| **Chữa 4 — 404 ≠ 502** | `/toc` và `/chapter/<n>` phân biệt **“chưa có bộ” (404)** với **“có mà không đọc được” (502)**. Bản 1.16.0 trả 404 cho cả hai nên 63 bộ đang có trông như bị xoá |
| **Chữa 5 — không cho ghi đè khi chưa đọc được** | `PUT /api/book/<slug>/chapter`, `POST /api/lock/set`, `POST /api/import` (import Blogger) **từ chối 502** khi bộ có trên KV mà Worker không đọc được. Trước đó chúng thấy `null` là coi như “bộ chưa có” rồi **ghi lại bộ rỗng/1 chương** — đúng cách mất trắng kho truyện khi đang mất biến |
| **Vá phụ** | `npm run check:worker` hết đỏ khi `worker/cms.bundle.js` đang tồn tại (tệp gộp do `npm run build:worker` sinh ra, tsc soi nhầm): `worker/jsconfig.json` nay `exclude` nó |
| **Test** | `tests/t_worker.mjs` thêm 21 kiểm tra mục **16. MẤT BIẾN SUPABASE_URL** (tổng 394). Chạy trên code CHƯA vá thì 16 kiểm tra đỏ đúng như sự cố thật (`/toc` → 404, `/api/book` → `"(overflow?)"`), vá xong thì xanh hết |
| **Chi tiết** | `BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md` |

## Có gì mới ở bản 1.15.0 — tiết kiệm hạn mức KV (Cloudflare gửi thư 90% quota)

| | |
|---|---|
| **Bệnh** | Gói miễn phí của Workers KV chỉ cho **1.000 lượt GHI + 1.000 lượt LIST/ngày**. Bản ≤ 1.14.0 ghi khoá `stats` **mỗi 10 giây bất kể có ai xem hay không** = 8.640 lượt/ngày → tiêu hết hạn mức trong 1–2 giờ đầu ngày, sau đó mọi thao tác ghi (số liệu, phiếu bầu, lưu chương) lỗi 429. Cộng thêm: mỗi lượt xem = 1 đọc + 1 ghi khoá `rl:*`; mỗi lần `/api/stats` trượt cache biên = **1 lượt LIST** (`rateagg:*`); mỗi lần lưu = thêm 1 ghi khoá `_last` |
| **Chữa 1 — nhịp ghi thông minh** | `src/shared/kv-budget.js` là nguồn duy nhất cho các con số: ghi khi đệm đủ **25 thay đổi**, hoặc hết hẹn **30 giây** mà có ≥3 thay đổi / giữ quá **10 phút** / còn “tem” hạn mức. Ngân sách mặc định **240 lượt ghi khoá `stats`/ngày** (`STATS_WRITE_BUDGET`), chia đều theo giờ UTC; số đã dùng lưu trong chính khoá `stats` (`sw`/`swd`) để nhiều isolate nhìn chung một ngân sách. Hết ngân sách thì số **nằm chờ trong RAM** — `/api/stats` vẫn cộng phần đang đệm nên người đọc thấy đủ, còn ghi hỏng thì nhét lại đệm (không mất số, không làm trang đọc lỗi) |
| **Chữa 2 — chống spam không đốt quota** | Bộ đếm `rateLimit` nằm trong RAM isolate: khoá theo IP chỉ ghi KV khi IP vượt **200 lượt** (người đọc bình thường tốn 0 lượt ghi), các khoá khác 1 lượt ghi/cửa sổ, chạm trần thì từ chối luôn trong RAM. Hạn mức lượt xem theo IP nay 1.800/6 giờ (cùng tốc độ chặn, ít lượt ghi hơn) |
| **Chữa 3 — gộp tổng đánh giá** | Mọi bộ nằm trong **một khoá `rateagg`** `{v:1, m:1, a:{slug:{sum,n}}}` thay vì mỗi bộ một khoá; dữ liệu cũ tự gộp trong lần đọc đầu (1 lượt LIST, đánh dấu `m:1`); bản trong RAM dùng lại 60 giây nên `/api/stats` thường **không chạm KV** cho phần sao |
| **Chữa 4 — bỏ `_last`** | `/api/health` lấy mốc ghi từ `metadata.saved` của chính `registry` → mỗi lần lưu bớt 1 lượt ghi |
| **Chữa 5 — cache cả 302** | Ảnh bìa/ảnh chương trên Supabase Storage: Worker trả 302 và **302 nay được lưu ở cache biên** (URL ảnh bất biến) → mỗi lượt xem bìa trước đây là 1 lượt đọc KV, nay gần như 0 |
| **Chữa 6 — bầu nhanh hơn** | `postVote` không còn `flushStats()` trước mỗi phiếu (đọc số liệu đệm khác trường với phiếu); mọi lượt đọc–sửa–ghi khoá `stats` đi qua **một hàng đợi chung** nên hai lượt ghi chồng nhau không nuốt số của nhau |
| **Theo dõi** | `/api/health` → `stats.writesToday`, `stats.writeBudget`, `stats.buffered` |
| **Đo được** | `node tools/bench_kv.mjs .` chạy thật `worker/cms.js` trên KV giả có đếm thao tác. Cùng kịch bản 250 lượt xem + 40 phiếu + 15 đánh giá + 20 bình luận + 100 lần đọc bình luận + 60 lần đọc `/api/stats`: **bản cũ 484 ghi / 674 đọc / 60 list → bản mới 137 ghi / 361 đọc / 1 list** (lượt xem: 1,18 → 0,04 lượt ghi mỗi lượt xem) |
| **Đổi lại** | Số lượt đọc trên bảng xếp hạng có thể trễ vài phút lúc web vắng (phiếu bầu và đánh giá sao **vẫn ghi ngay**); hạn mức chống spam chính xác theo từng isolate (muốn tuyệt đối thì phải dùng Durable Object) |
| **Test** | `tests/t_kv_quota.mjs` (34 kiểm tra: công thức chia nhịp, 500 lượt xem/60 lần bình luận không đốt lượt ghi, gộp `rateagg` chỉ 1 lượt LIST, `/api/health`) |
| **Quan trọng** | Nằm TRONG Worker → phải **`npx wrangler deploy`** (xem mục 0). Kiểm tra: `curl <worker>/api/health` thấy `"version": "1.16.1"` |

## 0. Deploy bản 1.16.1 — 2 cách, chọn 1 (ai cũng làm được trong 2 phút)

> ### ⚠ TRƯỚC KHI DEPLOY: đọc 3 dòng này (sự cố thật ngày 23/09)
>
> `npx wrangler deploy` **thay TOÀN BỘ biến thường** của Worker bằng đúng nội dung `[vars]`
> trong `worker/wrangler.toml`. Biến nào đặt tay trên dashboard (Settings → **Variables and
> Secrets**) mà **không có trong `wrangler.toml`** thì **BỊ XOÁ** sau mỗi lần deploy.
> Secret (`ADMIN_KEY`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE`…) thì wrangler **giữ**.
> Đó chính xác là điều đã làm cả 63 bộ truyện không đọc được sau khi deploy 1.16.0:
> `SUPABASE_URL` đặt tay bị xoá ⇒ Worker mất chỗ đọc overflow. Toàn bộ sự cố + cách phòng:
> **`BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md`**. Từ 1.16.1 `SUPABASE_URL` nằm sẵn trong
> `wrangler.toml` nên deploy không làm mất nữa; nếu vẫn thiếu, Worker tự dùng Project URL
> đã lưu ở `/admin` → Cài đặt & đồng bộ (không cần deploy lại).
> **Thêm biến mới cho Worker? Ghi vào `wrangler.toml` (biến thường) hoặc dùng
> `npx wrangler secret put` (secret) — đừng chỉ bấm trên dashboard.**

**Cách A — dòng lệnh (khuyên dùng, cần Node):**

```bash
cd worker && npx wrangler deploy          # wrangler tự gộp 9 tệp con
```
Kiểm tra: mở `https://<worker>/api/health` phải thấy `"version": "1.16.1"`,
và **`overflow.supabase` phải `true`** (nếu `false` thì xem `overflow.missing` — nó kể
tên biến đang thiếu; `overflow.urlVia` cho biết URL lấy từ `env` hay từ ghim `kv`).

**Cách B — dán trong bảng điều khiển Cloudflare (không cần cài gì):**

1. Trên máy, chạy `npm run build:worker` → sinh **`worker/cms.bundle.js`** (một tệp duy nhất
   190 KB, đã gộp sẵn 9 tệp con; tệp này không commit, ai cần thì chạy lại lệnh).
2. Cloudflare → **Workers & Pages** → chọn Worker `chuseoz-cms` → **Edit code**.
3. Xoá hết code cũ, **dán toàn bộ** `worker/cms.bundle.js`, bấm **Deploy**.
4. Mở `/api/health` xem `"version"` (bản này: `1.16.1`).

> **Đừng dán `worker/cms.js`.** Tệp đó có 9 dòng `import` (overflow, Durable Object, mã dùng chung
> `src/shared/…`) — bảng điều khiển không tự gộp, dán vào là Worker báo lỗi và **mất cả My Space
> lẫn truyện riêng tư**. `npm run build:worker` đã kiểm tra hộ: tệp gộp không còn `import`, còn đủ
> `MemberSpaces`, `PrivateBooks`, `export default`.
>
> Chưa deploy cũng KHÔNG sao: web tự rớt về đường cũ (tải cả bộ) — chỉ là chưa được phần nhẹ/nhanh
> và KV vẫn tốn như trước.

## Có gì mới ở bản 1.14.0 — overflow cho book/ảnh (kể cả bìa cũ) + parser chương dùng chung

| | |
|---|---|
| **Bệnh 1** | KV Cloudflare tính theo số lượt đọc/ghi — nhét book JSON lớn + ảnh base64 trong KV nhanh phá quota gói miễn phí. Riêng **bìa truyện đã lỡ lưu base64 trong KV** thì tới giờ KHÔNG có cách nào đưa lên Supabase Storage |
| **Chữa 1** | Worker ghi dữ liệu lớn qua `worker/overflow.js`: book JSON → bảng **`ssochuz_blobs`** (Supabase) / R2; ảnh thường → `ssochuz_blobs`; **bìa → Supabase Storage bucket `covers`** (URL public CDN). Trong KV chỉ còn **stub** nhỏ `{overflow:…}` — đọc vẫn ra đủ nội dung nhờ `readBook/readImage` tự materialize. Endpoint mới **`POST /api/admin/migrate-overflow`** (cần `x-admin-key`) quét KV theo lô (`limit` ≤ 25, tuỳ chọn `only: books/covers/images`) và chuyển toàn bộ dữ liệu CŨ — bìa được nhận diện qua `registry.thumb/slide/cover` trỏ tới `/api/img/<id>` nên đi đúng về Storage `covers`. Lỗi từng mục (vd Supabase chết) KHÔNG xoá bản base64 gốc trong KV, và trả `failed[]` kể tên |
| **Admin** | `/admin` → tab **Bác sĩ** → ô *Overflow KV* hiện có nút **Chuyển tất cả / Chỉ bìa / Chỉ book** (hiện khi `/api/health` báo overflow.supabase/r2) chạy nhiều vòng tới khi `done`, có hiển thị tiến độ + tổng kết số mục đã chuyển |
| **Bệnh 2** | Nhập chương từ Blogger: bài **toàn ảnh** (webtoon) bị từ chối “không có nội dung đọc được” vì quy tắc ≥40 chữ; tiêu đề kỳ lạ cũng bị ép thành “Chương N: …” |
| **Chữa 2** | `importPost` dùng `chapterTextOf/chapterHasMedia` — bài có ảnh/figure/table/… được nhận dù không có chữ. Đặt tên chương dùng chung parser `src/shared/chapters.js`: tiêu đề đã có số → giữ nguyên; “Lờí mở đầu / Giới thiệu nhân vật / Thông báo / Ngoại truyện” → giữ nguyên tên (không ép “Chương N:”); còn lại → “Chương \<số chính kế tiếp\>: \<tiêu đề\>” — **mở đầu và Chương 0 không được đếm là Chương 1** |
| **Quan trọng** | Những thay đổi này nằm TRONG Worker → phải **`npx wrangler deploy`** (hoặc dán `worker/cms.js` + `worker/overflow.js`) trước khi dùng. Kiểm tra: `curl <worker>/api/health` phải thấy `"version": "1.14.0"` và `overflow.{supabase,covers}` |
| **Bảo mật** | `SUPABASE_SERVICE_ROLE` chỉ nằm phía Worker (không bao giờ gửi xuống trình duyệt) — đã có test khóa (`check_secrets`) |
| **Test** | `tests/t_worker.mjs` mục 15: fake Supabase (postgrest + storage) → migrate chuyển book + bìa + ảnh, idempotent (chạy lại `moved 0`), `only=books`, Storage chết → `failed[]` + giữ nguyên base64; mục 6: import “Lờí mở đầu/GTNV/Ngoại truyện” giữ tên, chương chỉ-ảnh được nhận |

## Có gì mới ở bản 1.10.1 — sửa dứt điểm tab **Báo lỗi** báo "Failed to fetch"

| | |
|---|---|
| **Bệnh** | Trang `/admin` nối Worker bình thường (thư viện, số liệu, nhật ký, bình luận đều chạy) **nhưng riêng tab Báo lỗi** hiện: `Không đọc được báo lỗi: Failed to fetch — không nối được Worker…`. Làm đủ mọi hướng dẫn (đúng URL, đúng `ADMIN_KEY`, KV đã bind, `ALLOW_ORIGIN` đã có domain) mà vẫn lỗi |
| **Nguyên nhân thật** | `GET /api/admin/reports` trả **200 OK + đúng dữ liệu** nhưng handler quên truyền `cors` vào `json()` → response **không có** `access-control-allow-origin`. Trình duyệt chặn không cho trang khác origin đọc response, `fetch()` chỉ ném `TypeError: Failed to fetch` — nhìn y hệt bệnh "URL sai / Worker chưa deploy", nên càng chữa càng lệch |
| **Chữa** | (1) `adminReports` trả đủ `{ cors, 'cache-control': 'no-store' }`; (2) thêm **lớp bảo hiểm** `ensureCors()` ở lối vào Worker: response nào thiếu header CORS thì tự đắp thêm, và lỗi lọt ra ngoài `try/catch` cũng được trả thành JSON 500 **có CORS** thay vì trang lỗi 1101 của Cloudflare. Quên `cors` ở handler mới vì thế không còn thành bug "im lặng" nữa |
| **Nhận biết đã chữa** | Mở `<worker>/api/health` phải thấy `"version": "1.10.1"`. Từ bản này, tab Báo lỗi còn lỗi là lỗi thật (thiếu `ADMIN_KEY`, chưa có báo lỗi nào trong KV…), không phải do CORS |
| **Test khoá bệnh** | `tests/t_worker.mjs` có mục *CORS/quét endpoint*: gọi hết mọi endpoint (cả đường 401/404/500) và bắt buộc từng response phải có `access-control-allow-origin`. `tests/cf_admin_test.js` giả lập đúng cảnh "bị chặn CORS" và đòi trang quản trị **tự chẩn đoán** (health OK ⇒ dán `worker/cms.js` mới rồi Deploy) |

## Có gì mới ở bản 1.9.8 — ghim project Supabase, hết bệnh "đăng nhập xong vẫn 401"

| | |
|---|---|
| **Bệnh** | Người đọc đăng nhập Google **thành công** nhưng My Space báo lỗi, đánh giá sao/bình luận bị từ chối 401, quyền quản trị không mở. Nguyên nhân: project dùng khoá `sb_publishable_…` → access_token ký **ES256**; Worker chỉ đặt `SUPABASE_JWT_SECRET` (HS256) nên verify luôn thất bại, mọi endpoint cần Bearer đều 401 |
| **Chữa** | Worker đọc **ghim project** theo thứ tự: biến `SUPABASE_URL` → Project URL quản trị lưu trong KV (`registry.settings.auth.supabaseUrl`, điền ở `/admin` → Cài đặt & đồng bộ → Đăng nhập → Lưu). Token ES256/RS256 được verify bằng JWKS của đúng project đó; token của project **khác** bị chặn kèm lỗi nêu cả hai URL |
| **Không cần deploy khi đổi ghim** | `PUT /api/registry` (nút Lưu trong /admin) tự invalidate cache ghim; `/api/health` + `/api/auth/config` trả `supabaseEnv` / `supabaseKv` để biết ghim đang lấy từ đâu |
| **Bảo mật** | Không ghim project nào cả thì **từ chối rõ ràng** (500/401 kèm hướng dẫn) — Worker cố tình KHÔNG chấp nhận "project nào cũng được", vì kẻ xấu tự tạo project riêng, tự ký token mang email quản trị là lên được quyền admin |
| **Kiểm thử** | `t_worker.mjs` thêm nhóm *supabase-ES256*: token ES256 ký thật + JWKS giả → session ok; không ghim → 500 hướng dẫn; token project khác → 401 nêu 2 URL; xoá ghim → health mất ghim ngay |

Sau khi deploy: `curl https://<worker>/api/health` phải trả `version: 1.9.8`, và
`auth.supabaseUrl` phải là URL project thật (không rỗng).

## Có gì mới ở bản 1.9.7 — thông báo đẩy "ra chương mới" (Web Push)

| Thành phần | Việc |
|---|---|
| `POST /api/push-sub` | nhận subscription từ trình duyệt, lưu key `push:<hash>` (1 ghi/thiết bị); `{remove:true}` để huỷ |
| `PUT /api/book` + `POST /api/import` | tăng số chương → ghi job vào key `pushq` (sửa chữ không báo; chỉ ghi khi đang có subscriber) |
| Cron `*/10 * * * *` | drain hàng đợi, tối đa 45 tin/invocation (free giới hạn 50 subrequest); push trả 404/410 → xoá sub |
| Service worker | hiện "📖 Tên truyện — Chương n: … đã ra mắt!", bấm vào mở thẳng URL chương |

Mã hoá `aes128gcm` + ký VAPID (ES256) tự làm bằng WebCrypto, không thêm thư viện.
Cấu hình lần đầu (làm 1 lần):
1. Khoá công khai đã nằm sẵn trong `wrangler.toml` (`VAPID_PUBLIC`) và `cz-config.js`.
2. Đặt khoá riêng: `npx wrangler secret put VAPID_PRIVATE` rồi dán khoá (nhận riêng, không commit).
3. Cron đã nằm trong `wrangler.toml` (`[triggers]`), deploy là tự chạy.
4. Deploy: `npx wrangler deploy`, kiểm tra `/api/health` trả `version: 1.9.7`.
Muốn tự sinh cặp khoá mới: `node -e "const {generateKeyPairSync}=require('node:crypto');const{publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const u=b=>b.toString('base64url');console.log('PUB:',u(publicKey.export({type:'spki',format:'der'}).slice(-65)));console.log('PRV:',u(privateKey.export({type:'sec1',format:'der'}).slice(7,39)))"`
rồi thay `VAPID_PUBLIC` (2 file trên) + đặt lại secret `VAPID_PRIVATE`.

## Có gì mới ở bản 1.9.6 — RSS feed chương mới

| Endpoint | Việc |
|---|---|
| `GET /feed.xml` | RSS 2.0: 30 chương mới nhất toàn web, mỗi item link thẳng URL chương `/truyen/<slug>/chuong-<n>/` |
| `GET /feed.xml?slug=<slug>` | RSS 2.0: tối đa 50 chương mới nhất của 1 bộ (mới trước) |

Feed reader (Feedly, Inoreader…) poll nhiều lần mỗi ngày nên feed được cache biên 10 phút
(`s-maxage=600`, kiểm chứng bằng header `x-cz-cache`); mỗi lần làm mới feed chung chỉ đọc
tối đa 13 khoá KV (1 registry + 12 bộ mới cập nhật nhất) nên tốn chưa tới 2k lượt đọc/ngày.
Mỗi lần ghi chương (PUT/DELETE book, import, seed, sync…) đều tự xoá cache feed nên chương
mới lên feed ngay. Link trong feed dựng từ biến `SITE_BASE` (mặc định
`https://ssochuz.pages.dev`). Web tĩnh trỏ tới feed bằng thẻ
`<link rel="alternate" type="application/rss+xml">` (trong `<head>` + file OG từng truyện)
và nút RSS ở footer + trang truyện. Sau khi deploy, kiểm tra bằng
[W3C Feed Validator](https://validator.w3.org/feed/) rồi thêm URL feed vào Feedly.

## Có gì mới ở bản 1.9.5 — cache biên + đếm lượt đọc tiết kiệm quota

| Trước | Sau |
|---|---|
| Mỗi lượt tải trang đọc KV 2–3 lần (`registry` + `stats` + `book`, URL nào cũng gắn `?_=…` phá cache) | `GET /api/registry` (60 giây), `/api/book/<slug>` (300 giây), `/api/stats` (60 giây) phục vụ từ **cache biên**, KV chỉ tốn 1 lượt đọc cho cả phút cao điểm; URL ổn định, không `?_=…` |
| `/api/stats` trả `no-store` vì sợ “vote rồi mà số không đổi” | Vẫn thấy số mới ngay nhờ 2 lớp: Worker **tự xoá cache sau mỗi lần ghi** (bình chọn, nhập chương, seed…), web **vẽ số mới ngay khi bấm** (lạc quan) |
| Tải lại trang là gửi lại POST `/api/view` (Worker tự khử trùng lặp, nhưng vẫn tốn request) | Web kiểm tra `localStorage ssochuz-viewsent-<slug>-<yyyymmdd>` **trước** khi POST — mỗi máy/truyện/ngày chỉ 1 request; khoá cũ `ssochuz-viewed-…` vẫn được đọc để không đếm trùng khi chuyển bản |

Header `x-cz-cache` (`HIT`/`MISS`/`BYPASS`) trên 3 đường GET để kiểm chứng bằng DevTools.
Sau khi cập nhật phải deploy lại `worker/cms.js` và kiểm tra `/api/health` trả `version: 1.9.5`.
URL có query (`?_=…` của bản web cũ) đi thẳng KV, không đọc/ghi cache.

## Có gì mới ở bản 1.9.3 — vá sanitization ảnh nhập từ Blogger

`cleanPost()` chỉ giữ ảnh có URL `http(s)` hợp lệ, bỏ URL có userinfo, control character,
quote hoặc scheme như `javascript:`/`data:`. Bài kiểm thử Worker có cả trường hợp ảnh độc
hại; sau khi cập nhật phải deploy lại `worker/cms.js` và kiểm tra `/api/health` trả `version: 1.9.3`.

## Có gì mới ở bản 1.9.2 — giao diện (CHỈ tệp tĩnh, **không cần deploy lại Worker**)

| Trước | Sau |
|---|---|
| Icon bộ cũ | Đổi sang **Tabler Icons outline** từ package local `@tabler/icons` (MIT). Mỗi icon được **bù tỉ lệ riêng** để hộp mực đồng đều; SVG nhúng inline, không gọi font/icon từ xa. Sinh tự động: `node tools/gen_icons_tabler.mjs` |
| Khối chờ (lưới truyện, trang đọc) chạy shimmer bằng `background-position` | Làm lại theo mẫu uiverse.io/Nawsome/light-husky-91: một **dải sáng hẹp** trượt hết chiều ngang khối trong 1,2s — chỉ animate `transform` nên máy yếu vẫn mượt; dải nằm dưới nội dung nên ảnh thật vừa hiện là tự che mất dải. Màu dải theo tông: `--sheen` 62% ở nền sáng, 10% ở nền tối |
| Nút đổi nền sáng/tối hình mặt trăng | **Công tắc trượt** chuyển thể từ `uiverse.io/catraco/brown-termite-67`: cấu trúc `back` + icon cùng cấp, biểu tượng trượt/xoay và đổi tông trời. Bản desktop thu còn 64×32, điện thoại 52×28 để vừa thanh đầu trang; vùng checkbox trong suốt phủ kín rãnh nên chuột, chạm và phím Space đều dùng được. Có `role="switch"` + nhãn đọc máy nói đúng trạng thái, đổi đúng **một** nhịp mỗi cú bấm |
| **Lỗi**: máy bật “giảm chuyển động” (Android tiết kiệm pin cũng bật) thì bấm nút menu trên điện thoại **không thấy mục nào** | Hàm `CZ.slide()` thiếu thêm lớp `.slid` ở nhánh reduced-motion — mà menu chỉ hiện nhờ lớp đó, nên nó vẫn `display:none`. Nay thêm `.slid` **trước** khi rẽ nhánh, và CSS mở menu bằng **cả** `.slid` **lẫn** `.on` để không bao giờ kẹt lại. Có bài kiểm thử riêng: `tests/t_mobile.js` (giả lập `prefers-reduced-motion: reduce` rồi bấm nút menu) |

## Có gì mới ở bản 1.9.1 — vá bảo mật + giấu mã nguồn khỏi Developer Tools

| Lỗ hổng | Cách vá |
|---|---|
| **CORS so khớp sai ranh giới tên miền**: `ALLOW_ORIGIN = chuseoz.pages.dev` khiến `acchuseoz.pages.dev` (trang của người khác) cũng được phản chiếu origin → trang lạ gọi được API | So khớp theo **host** và đúng dấu chấm: chỉ `chuseoz.pages.dev` và `*.chuseoz.pages.dev`. Bỏ luôn `access-control-allow-credentials` (web xác thực bằng header, không dùng cookie). Bản xem trước chỉ mở cho `localhost` và `*.e2b.app` |
| **Dò khoá quản trị**: gọi `/api/whoami` bao nhiêu lần cũng được để thử `X-Admin-Key` | Sai khoá quá **25 lần / 10 phút / IP** thì khoá tạm 10 phút (chỉ đếm lần SAI, nên chủ trang không bao giờ bị chặn oan) |
| **Link độc hại lọt vào trang quản trị**: `POST /api/report` nhận `url` tuỳ ý, trang `/admin` in ra nút “Mở” → dán `javascript:` là chạy mã trong phiên quản trị | `url` chỉ nhận `http(s)` và phải thuộc tên miền của web (hoặc `*.pages.dev`, `*.blogspot.com`); còn lại lưu rỗng |
| **HTML nhập từ Blogger giữ thuộc tính lạ**: `<p onclick=…>`, `<a href="javascript:…">` | `cleanPost()` gỡ hết thuộc tính của `p/b/strong/i/em/u`; thẻ `<a>` chỉ được dựng lại khi `href` là `http(s)` (kèm `rel="noopener nofollow"`), còn lại bỏ thẻ giữ chữ |
| **Ảnh đại diện bình luận nhận mọi chuỗi** (kể cả `javascript:`) | Chỉ nhận `http(s)://…` |
| **Thổi số lượt đọc / phiếu bầu**: đổi mã máy (`vid`) liên tục là mỗi lần tính một người mới | Thêm trần theo IP: lượt đọc ≤ 600/giờ (quá thì **không đếm** chứ không báo lỗi), phiếu ≤ 150/giờ |
| **Mã nguồn và hệ thống lộ qua Developer Tools** | Bản phát hành được **rút gọn** (bỏ chú thích, đổi tên biến, không source map); mã đọc được nằm ở `src/` và bị `_redirects` chặn (`/src/*`, `/worker/*`, `/tests/*`, `/tools/*`, `/_inbox/*`, `*.md` → 301 về trang chủ); `_headers` thêm **Content-Security-Policy** cùng `nosniff`, `frame-ancestors`, `Referrer-Policy` |
| **Khoá quản trị nằm trong `localStorage`** (đọc được nếu có lỗi chèn mã, còn lại trên máy dùng chung) | Mặc định cất trong `sessionStorage` (đóng trình duyệt là mất); chỉ khi tích *“Ghi nhớ khoá trên máy này”* mới ghi `localStorage` |

Chi tiết đầy đủ và cách tự kiểm tra: `BAO-CAO-BAO-MAT-VA-GIAO-DIEN.md`.

## Có gì mới ở bản 1.9.0 — báo lỗi chữ gửi thẳng vào email quản trị

| Trước | Sau |
|---|---|
| Người đọc bấm **Báo lỗi chữ** → hộp thoại hiện nội dung rồi bắt tự gửi (rất mất thời gian) | Bấm **Gửi báo lỗi** là xong: `POST /api/report` nhận nội dung → **lưu vào KV** và gửi email phía Worker. Mất mạng thì hộp thoại cho copy; địa chỉ nhận không bao giờ gửi xuống trình duyệt |
| Muốn xem lại báo lỗi phải vào KV bằng tay | Tab **Báo lỗi** trong `/admin` (phím `R`) liệt kê 300 báo lỗi gần nhất, bấm **Mở** là nhảy đúng chương, có nút copy và nút trả lời người báo. Endpoint `GET /api/admin/reports?q=` |
| Icon web tự vẽ tay, chỗ dày chỗ mảnh | Toàn bộ icon SVG đổi sang **Tabler Icons outline** (package local, giấy phép MIT), cùng lưới 24×24 nên nhìn đồng bộ. Google dùng icon thương hiệu của Tabler; MoMo giữ hình thương hiệu riêng vì Tabler chưa có biểu tượng tương ứng. |

**Bật gửi email — chọn 1 trong 2 cách (không đặt gì cũng không sao, xem cuối mục):**

**Cách 1 — nhanh nhất, không cần khoá (khuyên dùng):** thêm **1 biến** trong
Workers & Pages → Worker của bạn → Settings → Variables and Secrets:

| Biến | Ví dụ | Ý nghĩa |
|---|---|---|
| `MAIL_TO` | `owner@example.com` | **Secret** chứa địa chỉ nhận thư báo lỗi — Worker gửi qua [FormSubmit](https://formsubmit.co); không đặt trong frontend/registry |

Lần gửi **đầu tiên**, FormSubmit sẽ gửi 1 thư *“Confirm your email”* tới địa chỉ đó —
mở hộp thư bấm **Confirm/Activate** một lần là từ đó mọi báo lỗi về thẳng hộp thư (hộp thoại
ngoài web cũng nhắc đúng câu này). Sau khi xác nhận, thử lại bằng cách gửi 1 báo lỗi bất kỳ.

**Cách 2 — thư đẹp, dùng tên miền riêng:** đăng ký [Resend](https://resend.com) (miễn phí 100 mail/ngày) rồi thêm:

| Biến | Ví dụ | Ý nghĩa |
|---|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxx` | khoá API của Resend (đặt dạng **Secret**) |
| `MAIL_FROM` | `ssochuz library <bao-loi@ten-mien-cua-ban>` | địa chỉ gửi — phải là tên miền đã xác thực trong Resend |

Có `RESEND_API_KEY` + `MAIL_FROM` thì Worker dùng Resend; chỉ có `MAIL_TO` thì dùng FormSubmit.

Chưa đặt gì thì tính năng **vẫn chạy**: báo lỗi được lưu và hiện đầy đủ ở tab **Báo lỗi**,
chỉ là không có email. Mở `<worker>/api/health` xem `auth.mail` — `true` là đã bật gửi email.

## Có gì mới ở bản 1.8.0 — quản trị phiếu bầu (gỡ từng người · reset)

| Việc | Endpoint | Ghi chú |
|---|---|---|
| Xem **ai đã bầu** một bộ (cả bộ + từng chương) | `GET /api/admin/voters?slug=<slug>` | trả `book`, `chapters`, `chapVotes`, `total`, `counted`, `base`; mỗi người kèm `key`, `kind` (`Tài khoản` / `Thiết bị` / `Địa chỉ IP`) và `at` (lúc bầu, có từ bản này) |
| **Gỡ phiếu của người được chọn** | `POST /api/admin/vote-remove` | `{slug, ch, keys: [...]}` — `ch = 0` là phiếu cả bộ, `ch = 12` là phiếu chương 12. Trừ đúng số phiếu khỏi tổng (ưu tiên phần web đếm, hết thì trừ số cũ) và trừ vào lịch sử ngày để biểu đồ không đứng số cũ |
| **Reset dữ liệu bầu** | `POST /api/admin/votes/reset` | `{slug?, ch?}` — không có `slug` = **mọi bộ**; không có `ch` = xoá cả phiếu bộ lẫn phiếu chương. **Lượt đọc, bình luận giữ nguyên** |

Trang quản trị đã có tab **Phiếu bầu** (phím `V`): chọn bộ → danh sách người bầu chia theo
“cả bộ / từng chương” → tick rồi bấm **Gỡ phiếu đã chọn**; cuối tab có ô **Reset dữ liệu bầu**
(chọn phạm vi: một bộ hay tất cả, và có thể chỉ xoá phiếu của một chương).

> Ô tick hoạt động cả với phiếu **đặt lúc chưa đăng nhập**: mỗi phiếu lưu theo khoá máy (`a:<vid>`)
> hoặc khoá tài khoản (`g:<hash>`), nên gỡ bằng cách nào cũng ra đúng người. Muốn dọn sạch số liệu
> thử nghiệm thì dùng Reset; xong người đọc thấy số mới ngay (không phải chờ cache).

## Có gì mới ở bản 1.6.0 (chẩn đoán ADMIN_KEY + trả lời bình luận)

| Trước | Sau |
|---|---|
| `/api/health` trả 200 nhưng **thiếu header CORS** → trang `/admin` gọi từ domain khác bị trình duyệt chặn, fetch ném `Failed to fetch`, admin báo nhầm "Worker chưa deploy / KV id còn là placeholder" | `/api/health` (và `/`) trả kèm `Access-Control-Allow-Origin` như mọi endpoint khác. Kiểm tra: mở `<worker>/api/health` phải thấy `"version": "1.8.0"` |
| Cache khoá công khai Supabase **cất nhầm kiểu**: lần verify token THỨ HAI trở đi (cùng isolate) ném lỗi `SubtleCrypto.verify: not a CryptoKey` → `POST /api/auth/supabase` và bình luận đều **401** dù token hoàn toàn hợp lệ | Cache cất đúng `{key, algo, alg}`; verify ổn định từ lần đầu đến lần thứ n (đã có test hồi quy) |
| Bình luận bị 401 chỉ báo chung chung "Phiên đăng nhập hết hạn", không phân biệt được **hết hạn thật** với **Worker cấu hình sai** | Mọi 401 của `/api/auth/supabase`, `/api/auth/me`, `/api/comments/*` kèm **lý do thật** trong body (`token sai issuer…`, `chưa đặt SUPABASE_JWT_SECRET…`, `phiên hết hạn…`); web hiển thị đúng nguyên nhân, `cz-auth.js` ghi lý do ra console |
| Khó biết Worker đặt `SUPABASE_URL` có đúng project không | 401 của `/api/auth/supabase` trả kèm `supabaseUrl` đang cấu hình; lỗi sai issuer nêu cả URL của token lẫn URL của Worker |

> **Đang gặp lỗi 401/CORS khi bình luận?** Deploy lại bản mới nhất (`npx wrangler deploy`) rồi mở
> `https://<worker>/api/health` — nếu `version` chưa phải `1.9.1` thì bản chạy trên mạng vẫn là bản cũ.
> Xem thêm mục **7c** bên dưới để bắt bệnh theo từng thông báo.

## Có gì mới ở bản 1.5.0

| Trước | Sau |
|---|---|
| Đăng nhập Google báo **`400 origin_mismatch`** (phải khai đúng redirect URI cho từng tên miền, kể cả bản xem trước) | Đổi token **Supabase** sang session của Worker (`POST /api/auth/supabase`). Supabase dùng PKCE + trang redirect riêng nên thêm tên miền chỉ mất 1 dòng trong dashboard Supabase |
| Chỉ có **1 nút thích cho cả bộ** | Thích **theo từng chương**: `POST /api/vote {slug, ch, vote, vid}`; phiếu lưu theo `người#chương`, bộ đếm `it.chap = {12: 3}` |
| Bấm thích xong **bảng xếp hạng không đổi** | Vote ghi thẳng vào KV `stats` + chuỗi ngày, và `/api/vote` trả `votes/votesDay/votesWeek/votesMonth` để web vẽ lại Top vote ngay |
| Bình luận chỉ hiện ở trang giới thiệu truyện (Giscus) | Bình luận nằm trên KV, lọc theo chương (`GET /api/comments/<slug>?ch=12`), hiện cả trong trang đọc |
| Chưa đăng nhập thì **không bình luận được** | Khách gửi được bình luận kèm `vid` (mã máy ẩn danh) — chặn spam chặt hơn (2 bình luận/chương/10 phút, 6 bình luận/10 phút) |
| **Số chương hiện sai** dù đã sửa file (vd "Be My Angel" repo 29 chương, web vẫn hiện 30) vì KV còn giữ bản cũ | `POST /api/recount` đếm lại từ chương thật trong KV rồi sửa `chapters` + `countLabel` trong registry; `PUT /api/book/<slug>` tự sửa nhãn sau khi ghi; `/admin` → tab **Bác sĩ dữ liệu** soi registry ↔ KV ↔ repo |
| Không biết ai vừa làm gì trên KV | `log` (tối đa 200 dòng) + `GET /api/admin/log` |
| Quản trị phải dò từng bộ để tìm bình luận xấu | `GET /api/admin/comments` (mọi bộ, có phân trang) + xoá bằng ADMIN_KEY |

## Biến môi trường (Settings → Variables and Secrets)

| Biến | Bắt buộc | Dùng làm gì |
|---|---|---|
| `CZ_KV` (binding KV) | ✅ | nơi chứa registry, chương, bình luận, số liệu |
| `ADMIN_KEY` | ✅ | khoá cho `/admin` ghi dữ liệu (dài ≥ 24 ký tự) |
| `SESSION_SECRET` | ✅ | ký session token HS256 (dài ≥ 32 ký tự) |
| `SUPABASE_URL` | **bắt buộc cho đăng nhập** (hoặc ghim bằng KV, xem §7b) | vd `https://xyz.supabase.co` — Worker lấy JWKS verify token ES256/RS256 và chặn token của project lạ. Từ 1.9.8 đặt thiếu vẫn được bù bằng Project URL lưu ở `/admin`, nhưng nên đặt cho chắc |
| `SUPABASE_JWT_SECRET` | tuỳ | chỉ cần khi project còn ký JWT HS256 (bản cũ). Project dùng khoá `sb_publishable_…` ký ES256 → thứ quan trọng là `SUPABASE_URL`/ghim KV, secret này bỏ trống cũng được |
| `ADMIN_EMAILS` (Secret) | nên có | danh sách email quản trị, phân cách bằng dấu phẩy. API chỉ trả cờ `admin: true`, không trả danh sách địa chỉ |
| `GOOGLE_CLIENT_ID` | không | đường cũ: đăng nhập thẳng bằng Google Identity Services |
| `ALLOW_ORIGIN` | nên có | danh sách chính xác các tên miền web; không dùng `*` ở production |
| `SITE_BASE` | không | gốc dựng link chương trong `/feed.xml` (mặc định `https://ssochuz.pages.dev`) |
| `VAPID_PUBLIC` | cần cho push | khoá công khai VAPID base64url (không nhạy cảm, nằm trong `wrangler.toml`) |
| `VAPID_PRIVATE` (Secret) | cần cho push | khoá riêng VAPID base64url (`wrangler secret put VAPID_PRIVATE`) |
| `BLOG` | không | feed Blogger cho nút "Đồng bộ Blogger" |
| `FIREBASE_PROJECT` | không | chỉ dùng khi muốn kéo số liệu cũ từ Firestore (1 lần) |
| `MAIL_TO` (Secret) | không | email nhận báo lỗi chữ phía Worker; không đặt trong registry/frontend |
| `RESEND_API_KEY` | không | đường chuyên nghiệp: khoá API resend.com (miễn phí 100 mail/ngày) |
| `MAIL_FROM` | không | địa chỉ gửi của Resend, vd `ssochuz library <bao-loi@ten-mien-cua-ban>` |
| `STATS_FLUSH_MS` | không | **chỉ để thử nghiệm**: ép ghi số liệu sau từng này mili-giây (bài kiểm thử dùng). Bản chạy thật tự giãn nhịp theo ngân sách ngày |
| `STATS_WRITE_BUDGET` | không | trần lượt GHI khoá `stats` mỗi ngày (mặc định 240, trong hạn mức 1.000 ghi/ngày của gói miễn phí) |

## Danh sách API bản 1.6.0 (bổ sung cho bảng ở dưới)

| Method | Đường dẫn | Ai gọi | Việc |
|---|---|---|---|
| POST | `/api/vote` | mở | `{slug, ch?, vote: 1|0, vid}` — `ch` là số chương (bỏ `ch` = bầu cho cả bộ, như bản cũ). Trả `{votes, total, chapVotes, votesDay/Week/Month, voted, changed}` |
| GET | `/api/comments/<slug>?ch=12` | mở | bình luận của riêng chương 12 + `byChapter` (số bình luận từng chương) |
| POST | `/api/comments/<slug>` | mở | `{text, ch?, vid, name?, parentId?}` — `parentId` trả lời bình luận khác; reply tự giữ chương của cha |
| DELETE | `/api/comments/<slug>/<id>` | tác giả hoặc quản trị | ADMIN_KEY / email quản trị xoá được của bất kỳ ai |
| POST | `/api/recount` | cần khoá | đếm lại số chương thật trong KV, sửa `chapters` + `countLabel` của registry. Trả `{books, fixed[], missing[], orphan[]}` |
| GET | `/api/admin/comments?limit=&slug=&q=` | cần khoá | mọi bình luận trên KV để kiểm duyệt |
| GET | `/api/admin/log` | cần khoá | 200 thao tác gần nhất (ai, lúc nào, làm gì) |
| GET | `/api/admin/stats` | cần khoá | số liệu chi tiết + chuỗi 60 ngày + phiếu theo từng chương |
| POST | `/api/report` | mở | nhận báo lỗi chữ `{slug, title, ch, url, text, vid}`; lưu KV + gửi email quản trị (nếu có Resend); chặn spam 6 lần/giờ mỗi máy |
| GET | `/api/admin/reports?q=` | cần khoá | 300 báo lỗi gần nhất (lọc theo từ khoá) |
| GET | `/api/admin/voters?slug=` | cần khoá | ai đã bầu bộ này: phiếu cả bộ + từng chương, kèm khoá người bầu |
| POST | `/api/admin/vote-remove` | cần khoá | gỡ phiếu của người được chọn `{slug, ch, keys}` |
| POST | `/api/admin/votes/reset` | cần khoá | reset phiếu `{slug?, ch?}` (không `slug` = mọi bộ; không `ch` = cả bộ + từng chương) |
| POST | `/api/auth/supabase` | mở | đổi `access_token` của Supabase → session token của Worker |
| GET | `/api/auth/config` | mở | web đọc để biết Supabase/Google đã bật chưa, ai là quản trị |

## Có gì mới ở bản 1.4.0 (sửa những thứ đang hỏng)

| Trước | Sau |
|---|---|
| Đăng nhập Google **luôn thất bại** (`xác thực Google thất bại: Invalid keyData`) → không ai bình luận được | Verify idToken bằng khoá `n/e` của Google; nếu JWKS chỉ có `x5c` thì tự tách khoá công khai ra khỏi chứng chỉ |
| **Đồng bộ Blogger** không đổi gì (đọc 0 thẻ truyện vì trang dùng `<div class="truyen-card">`, code lại tìm `<article>`) | Đọc đúng 62 thẻ: tên, slug, ảnh bìa, nhãn đếm, tình trạng, 18+ |
| Nút **Lấy từ Blogger & đăng (thay chương cuối)** bị trình duyệt chặn (preflight thiếu `x-import-mode`) | CORS cho phép `x-import-mode` |
| Số liệu xếp hạng chết vì Firestore trả **403** | Lượt đọc/bình chọn đếm thẳng trên KV, không phụ thuộc Firebase |
| Lỗi trong worker lọt ra ngoài `try/catch` → Cloudflare trả trang lỗi **1101** khó đoán | Mọi handler được `await`, lỗi luôn trả JSON kèm lý do |
| Chưa gắn KV thì `/api/health` nổ 500 | Trả `{"ok":true,"kv":false}` + hướng dẫn bind |
| Bình luận/đăng nhập/bình chọn không giới hạn tần suất | Chặn spam: 3 bình luận/10 phút, 40 lần bầu/giờ, 30 lần đăng nhập/10 phút |

## Danh sách API (bản này hỗ trợ đúng những gì liệt kê ở đây)

| Method | Đường dẫn | Ai gọi | Việc |
|---|---|---|---|
| GET | `/api/health` | mở | phiên bản, KV có sẵn không, số bộ, rev, lần ghi cuối, tổng số liệu |
| GET | `/api/whoami` | cần khoá | kiểm tra `ADMIN_KEY` đúng hay sai |
| GET | `/api/registry` | mở | toàn bộ thư viện (62 bộ + slides + lịch + series) |
| GET | `/api/book/<slug>` | mở | tiêu đề + các chương của 1 bộ (bản đầy đủ — trang đọc cũ, admin, RSS) |
| GET | `/api/book/<slug>/toc` | mở | **mục lục nhẹ**: đầu sách + tên các chương ĐANG HIỆN (không kèm nội dung) |
| GET | `/api/book/<slug>/chapter/<n>` | mở | **đúng 1 chương** (n = vị trí trong danh sách đang hiện) + mục lục; chương ẩn/hẹn giờ trả 404 |
| GET | `/api/schedule` | mở | lịch ra chương |
| GET | `/api/comments/<slug>` | mở | bình luận của 1 bộ (`?ch=` lọc theo chương, `?limit=`), cache biên 15 giây |
| GET | `/api/stats` | mở | **lượt đọc/bình chọn + đánh giá sao từ KV** (tổng + hôm nay/tuần/tháng + `rating`/`ratingCount`) |
| GET | `/feed.xml` | mở | RSS 2.0: 30 chương mới nhất toàn web (cache biên 10 phút) |
| GET | `/feed.xml?slug=<slug>` | mở | RSS 2.0: chương mới của 1 bộ (tối đa 50, mới trước) |
| POST | `/api/push-sub` | mở | đăng ký (`{endpoint, keys}`) / huỷ (`{endpoint, remove:true}`) nhận thông báo đẩy |
| Cron | `*/10 * * * *` | — | drain key `pushq`, tối đa 45 tin/invocation, xoá sub chết (404/410) |
| POST | `/api/view` | mở | đếm 1 lượt đọc `{slug, vid, ch}` |
| POST | `/api/vote` | mở | bầu/bỏ bầu `{slug, ch?, vote: 1|0, vid}` → trả số phiếu mới (kèm `chapVotes`) |
| POST | `/api/rate` | mở | đánh giá sao `{slug, rating: 1..5}` (0 = gỡ điểm) — 1 người 1 điểm, sửa được; lưu `rate:<slug>:<uid>` + `rateagg:<slug>` |
| PUT | `/api/registry` | cần khoá | ghi toàn bộ thư viện |
| PUT | `/api/book/<slug>` | cần khoá | ghi 1 bộ (thêm/sửa chương) |
| DELETE | `/api/book/<slug>` | cần khoá | xoá 1 bộ khỏi KV |
| POST | `/api/seed` | cần khoá | nạp hàng loạt `{registry, books}` |
| POST | `/api/sync` | cần khoá | đọc lại Blogger, ghép số chương/tình trạng/ngày |
| POST | `/api/import` | cần khoá | lấy 1 bài viết Blogger thành chương mới (bỏ quảng cáo/bình luận) |
| POST | `/api/stats/seed` | cần khoá | nạp số liệu cũ `{items:{slug:{views,votes}}}` |
| POST | `/api/stats/import-firebase` | cần khoá | tự kéo số cũ từ Firestore về KV (1 lần) |
| POST | `/api/stats/refresh` | cần khoá | ghi hết số đang đệm xuống KV |
| POST | `/api/report` | mở | báo lỗi chữ ở trang đọc (lưu KV + gửi email cho quản trị) |
| GET | `/api/admin/reports` | cần khoá | danh sách báo lỗi để xem lại trong `/admin` |
| GET | `/api/admin/voters?slug=` | cần khoá | danh sách người đã bầu (cả bộ + từng chương) |
| POST | `/api/admin/vote-remove` | cần khoá | gỡ phiếu của người được chọn |
| POST | `/api/admin/votes/reset` | cần khoá | reset dữ liệu bầu |
| POST | `/api/auth/google` | cần GOOGLE_CLIENT_ID + SESSION_SECRET | đổi Google idToken → session token (HS256) |
| GET | `/api/auth/me` | có session | trả user từ session |
| GET | `/api/comments/<slug>` | mở | đọc bình luận công khai (`?ch=12` để lọc theo chương) |
| POST | `/api/comments/<slug>` | mở | gửi `{text, ch?, vid, parentId?}`; `parentId` trả lời bình luận khác và tự giữ chương của cha |
| DELETE | `/api/comments/<slug>/<id>` | tác giả hoặc quản trị | xoá bình luận của chính mình (ADMIN_KEY xoá được mọi cái) |

## 1. Tạo Worker (5 phút, làm 1 lần)

**Cách A — dán trên dashboard (không cần cài gì):**

1. Vào <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Worker** → đặt tên `chuseoz-cms` → **Deploy**.
2. **Edit code** → xoá hết code mẫu → dán toàn bộ nội dung `worker/cms.js` → **Deploy**.
   (Worker đang chạy là bản cũ? Dán lại rồi Deploy — file trong repo này là bản chuẩn.)
3. Vào tab **Settings** → **Variables and Secrets**:
   - `ADMIN_KEY` (chọn **Secret**) — chuỗi dài, ví dụ 40 ký tự ngẫu nhiên. Đây là mật khẩu để ghi dữ liệu.
   - `SESSION_SECRET` (**Secret**) — chuỗi ngẫu nhiên ≥ 32 ký tự, để ký phiên bình luận/đăng nhập.
   - `GOOGLE_CLIENT_ID` — Client ID OAuth kiểu *Web application* (bắt buộc nếu muốn đăng nhập/bình luận).
   - `BLOG` = `https://chuseoz.blogspot.com`
   - `ALLOW_ORIGIN` = `*` (hoặc domain web của bạn, cách nhau bằng dấu phẩy)
   - `FIREBASE_PROJECT` = `chuseoz-library` — **tuỳ chọn**, chỉ dùng khi muốn kéo số liệu cũ về KV.
4. Tab **Bindings** → **Add** → **KV namespace** → **Create new namespace** tên `chuseoz-kv` → **Variable name**: `CZ_KV` → Save → Deploy lại.
5. Ghi lại URL Worker, dạng `https://chuseoz-cms.<tên-tài-khoản>.workers.dev`.

**Cách B — bằng dòng lệnh (nếu đã có Node + wrangler):**

```bash
npx wrangler kv namespace create CZ_KV        # dán id trả về vào worker/wrangler.toml (thay chỗ DAN_ID_KV_VAO_DAY)
npx wrangler secret put ADMIN_KEY             # nhập mật khẩu
npx wrangler secret put SESSION_SECRET        # chuỗi ≥ 32 ký tự
npx wrangler secret put GOOGLE_CLIENT_ID      # Client ID OAuth Web app
npx wrangler deploy
```

> `worker/wrangler.toml` đang để sẵn `id = "DAN_ID_KV_VAO_DAY"`. **Phải thay bằng id thật** trước khi
> `npx wrangler deploy`, không thì wrangler báo lỗi namespace. Không chắc id nào thì dùng Cách A.

## 2. Nạp dữ liệu hiện có lên KV (1 lần)

> **Không biết chạy lệnh?** Bỏ qua cả mục này — mở `https://<web-của-bạn>/admin`, dán URL Worker + `ADMIN_KEY`,
> bấm **Kiểm tra & kết nối**, rồi bấm **↑ Nạp dữ liệu lên KV**. Nút này làm y hệt lệnh bên dưới
> (đọc `data/registry.json` + 62 bộ trong `data/book/`, đẩy lên KV, có thanh tiến trình `12/62`).

```bash
python3 tools/push_to_kv.py --api https://chuseoz-cms.xxx.workers.dev --key "$ADMIN_KEY"
```

Lệnh này đẩy `data/registry.json` + toàn bộ `data/book/*.json` (khoảng 27 MB) lên KV theo lô 8 bộ.

```bash
python3 tools/push_to_kv.py --api https://... --health     # Worker có sống không, KV đã có gì
python3 tools/push_to_kv.py --api https://... --key "$ADMIN_KEY" --auth   # khoá có đúng không
python3 tools/push_to_kv.py --api https://... --key "$ADMIN_KEY" --verify # so từng bộ: KV vs repo
python3 tools/push_to_kv.py --api https://... --stats      # xem lượt đọc/bình chọn đang có trên KV
```

`--verify` in ra từng bộ lệch số chương giữa KV và repo — chạy sau khi nạp để chắc chắn không thiếu bộ nào.

### Thử toàn bộ kênh đăng trước khi lên Cloudflare

`tests/mock_worker.mjs` **chạy chính `worker/cms.js`** với KV trong RAM (không phải bản chép lại),
kèm máy chủ tĩnh — nên thử ở đây y hệt bản deploy:

```bash
node tests/mock_worker.mjs 8787          # cần Node.js, không cần cài gì thêm
# rồi mở http://127.0.0.1:8787/admin  → URL Worker: http://127.0.0.1:8787 → khoá: MOCK
# /admin-v2, /admin-legacy cũng vào cùng trang /admin (đã gộp một admin)
```

Muốn thử cả đăng nhập Google ở máy: `GOOGLE_CLIENT_ID=... node tests/mock_worker.mjs 8787`
(nhớ thêm `http://127.0.0.1:8787` vào *Authorized JavaScript origins* trong Google Cloud Console).

Kiểm thử tự động cho worker (100 kiểm tra, không cần mạng):

```bash
node tests/t_worker.mjs        # hoặc: cd tests && node run.js  (chạy hết mọi bài)
```

## 3a. Nếu `/admin` báo “sai hoặc thiếu X-Admin-Key”

Thông báo này chỉ nói rằng `GET /api/whoami` không chấp nhận khoá. Có ba trường hợp khác nhau:

1. **Mở `<URL Worker>/api/health` trên tab mới.** Bản Worker mới phải trả `version: "1.7.0"` và
   `adminConfigured: true`. Nếu `adminConfigured: false`, bạn đang đặt `ADMIN_KEY` ở nhầm Worker/
   Pages hoặc chưa bấm **Deploy** sau khi tạo secret.
2. Trong Cloudflare → **Workers & Pages → chuseoz-cms → Settings → Variables and Secrets**,
   tạo/chỉnh đúng loại **Secret** tên chính xác `ADMIN_KEY` (phân biệt hoa thường), rồi bấm
   **Save and deploy**. Đây là khoá riêng cho Worker, **không phải** `SESSION_SECRET`, Supabase
   anon key hay `SUPABASE_JWT_SECRET`.
3. Dùng đúng URL của Worker đang có secret đó, không dùng URL Pages và không thêm `/api`:

   ```bash
   curl -i https://<worker>.workers.dev/api/health
   curl -i -H 'X-Admin-Key: KHOA_CUA_BAN' https://<worker>.workers.dev/api/whoami
   ```

   Lệnh thứ hai phải trả `{"ok":true,"role":"admin"}`. Nếu health sống nhưng whoami báo
   `ADMIN_KEY không khớp secret đang chạy`, khoá đã nhập không phải secret của Worker đó hoặc
   secret bị lưu kèm dấu nháy (`"..."`) ở Dashboard. Dán lại **phần giá trị bên trong**, rồi
   deploy lại. Web tự bỏ khoảng trắng ở đầu/cuối khi nhập.

Sau khi sửa, hãy mở lại `/admin` bằng cửa sổ ẩn danh hoặc xoá khoá cũ trong localStorage rồi nhập
lại. Bản admin mới kiểm tra health trước nên sẽ nói rõ Worker thiếu secret hay khoá không khớp.

## 3. Nối web vào Worker (1 dòng duy nhất)

Mở file **`cz-config.js`** ở gốc repo, dán URL Worker vào:

```js
window.CZ_API = 'https://chuseoz-cms.xxx.workers.dev';   // để '' nếu chưa dùng Worker
window.CZ_STATS_DIRECT = false;                           // số xếp hạng lấy từ KV (đúng mặc định)
```

File này được **cả 3 trang** (`index.html`, `truyen.html`, `admin.html`) nạp sẵn — sửa một chỗ là toàn web đổi kênh:

- **Có** `CZ_API` → web đọc dữ liệu từ KV (luôn mới, sửa là thấy ngay, không cần deploy lại).
- Dán URL kiểu nào cũng được — `chuseoz-cms.xxx.workers.dev`, `https://chuseoz-cms.xxx.workers.dev`
  hay thừa dấu `/` ở cuối đều tự chuẩn hoá. **Đừng quên `https://`** nếu bạn tự sửa chỗ khác.
- **Không có / Worker lỗi** → web tự lùi về file `/data/*.json` như cũ (không bao giờ trắng trang).
- `CZ_STATS_DIRECT = true` chỉ dành cho việc **đối chiếu** với Firestore cũ (cần mở quyền đọc).

Trang quản trị: mở `/admin`, mục **Kênh đăng bài** → dán URL Worker + `ADMIN_KEY` → **Kiểm tra & kết nối**
(khoá chỉ lưu trong localStorage của máy bạn). Vào được rồi thì:

- **Nạp dữ liệu lên KV** — bấm 1 lần để đưa 62 bộ hiện có trong repo lên KV (hoặc chạy `tools/push_to_kv.py`).
- **Đồng bộ từ Blogger** — đọc lại blogspot để cập nhật tình trạng/số chương/ngày/lịch ra chương.
- **Lưu** — ghi thẳng lên KV, người đọc thấy 1–2 giây.
- **Sao lưu / Phục hồi** — tải hoặc nạp lại toàn bộ dữ liệu bằng 1 file JSON.

## 3b. Đăng chương mới trong ~30 giây (việc hay làm nhất)

1. Mở `/admin` → **Đăng nhanh** (phím `2`).
2. Chọn truyện ở ô **Truyện**, dán nội dung chương vào ô lớn
   (mỗi đoạn cách nhau 1 dòng trống; dán nhiều chương thì ngăn giữa các chương bằng một dòng `---CHAP---`).
3. Bấm **Đăng chương lên KV**.
4. Người đọc mở trang là thấy ngay — không commit, không build, không đợi Pages.

Ô **Tình trạng chương** hiện số từ và số phút đọc ngay khi bạn dán, để kiểm tra nội dung dán đủ chưa.

**Không muốn copy–paste?** Trong cùng tab đó có khối *Hoặc lấy thẳng từ Blogger*:

- **⬇ Lấy từ Blogger & đăng** — dán link bài viết, hoặc **để trống** để Worker tự tìm bài mới nhất khớp tên truyện.
  Worker tải bài, bỏ quảng cáo/bình luận/nút chia sẻ, giữ chữ + ảnh, rồi ghép vào cuối bộ và cập nhật số chương.
- **⬇ Lấy & thay chương cuối** — dùng khi bạn vừa sửa lại bài đăng cũ trên Blogger (không tạo chương trùng).

## 4. Những việc làm được sau khi nối

| Việc | Cách làm | Thời gian thấy trên web |
|---|---|---|
| Sửa thông tin 1 bộ (tình trạng, số chương, bìa, mô tả, 18+) | admin → **Lưu** | vài giây |
| Sửa nội dung chương | admin → **Nội dung** → Lưu | vài giây |
| Thêm bộ mới | admin → **Thêm bộ** | vài giây |
| Cập nhật số chương/tình trạng/ngày từ blogspot | admin → **Đồng bộ Blogger** (hoặc `--sync`) | vài giây |
| Lượt đọc / bình chọn | Worker tự đếm khi người đọc mở chương / bấm **Thích** | ≤ 20 giây |
| Bảng xếp hạng Ngày/Tuần/Tháng | Worker trả số theo từng khoảng từ KV | ngay |
| Lịch ra chương | Worker đọc trang `/p/lich-ra-chuong.html` | 30 phút |
| Deploy **code** mới (giao diện) | vẫn qua GitHub → Cloudflare Pages | chỉ khi cần |

## 5. Số liệu xếp hạng nằm trên KV — **không cần Firebase nữa**

Trả lời ngắn cho câu hỏi *"còn cần Firebase không?"*: **không**. Firestore cũ (`chuseoz-library/novelData`)
đang chặn quyền đọc (403) nên web không hiện số nào; nay Worker tự đếm và tự giữ số trên KV.
Firebase chỉ còn 1 việc **tuỳ chọn**: kéo số lượt đọc/phiếu **cũ** về KV một lần (mục 5c).

### 5a. Worker đếm như thế nào

- **Lượt đọc** — web gọi `POST /api/view {slug, vid, ch}` mỗi lần mở chương.
  `vid` là mã ngẫu nhiên trong localStorage của máy người đọc (không phải định danh).
  1 máy · 1 bộ · 1 ngày = **1 lượt**; Worker còn khử trùng lặp thêm một lần nữa theo IP nếu web không gửi `vid`.
  Số được **đệm trong RAM** rồi ghi xuống KV mỗi ~20 giây để không đụng trần ghi của KV (gói free 1.000 lần ghi/ngày).
- **Bình chọn** — nút **Thích** gọi `POST /api/vote {slug, vote: 1|0, vid}` (kèm session Google nếu đã đăng nhập).
  Mỗi người 1 phiếu, bấm lại là **bỏ phiếu**; số phiếu ghi ngay nên ai mở web cũng thấy cùng con số.
- **Lưu trữ** — một khoá KV tên `stats`:
  ```jsonc
  { "updatedAt": "…", "items": { "lunar-secret": {
      "base":   { "views": 450, "votes": 12 },   // số cũ mang sang (nạp 1 lần)
      "got":    { "views": 1,   "votes": 1  },   // số web đếm được từ khi dùng Worker
      "days":   { "2026-09-13": { "v": 1, "o": 1 } },  // giữ 45 ngày → xếp hạng ngày/tuần/tháng
      "voters": { "a:vb3x9k2m": 1 }              // để 1 người chỉ 1 phiếu
  } } }
  ```
  Số hiện ra = `base + got`. Xem bằng `python3 tools/push_to_kv.py --api https://... --stats`
  hoặc `/admin` → tab **Số liệu**.
- Muốn chính xác tuyệt đối ở lưu lượng rất lớn thì nâng bộ đếm lên **Durable Object**; với quy mô web này
  KV rẻ và đủ dùng (đếm hụt vài lượt khi Cloudflare tái khởi động isolate là chấp nhận được).

### 5b. Người đọc thấy gì

- Trang truyện: chip **"1.234 lượt đọc"**, nút **Thích · 56**.
- Trang chủ: bảng xếp hạng **Ngày / Tuần / Tháng** xếp theo phiếu của đúng khoảng đó
  (có cộng một phần tổng phiếu để bộ chưa có hoạt động trong kỳ không tụt về 0),
  và kiểu sắp xếp **"Đọc nhiều nhất"** trong thư viện.
- **Chưa có số nào** → web **không hiện số** (không bịa), bảng xếp hạng tự xếp theo số chương + ngày cập nhật.

### 5c. Giữ số liệu cũ của site Firebase (làm 1 lần, không bắt buộc)

Cách 1 — trong `/admin` → tab **Số liệu** → **Nhập số cũ từ Firebase**.
Cách 2 — dòng lệnh:

```bash
python3 tools/push_to_kv.py --api https://... --key "$ADMIN_KEY" --import-firebase
```

Cả hai đều đọc Firestore, nên **phải mở quyền đọc 1 lần** — vào
<https://console.firebase.google.com/project/chuseoz-library/firestore/rules> dán rồi **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /novelData/{doc} { allow read: if true; }
    match /voters/{doc}    { allow read, write: if request.auth != null; }
    match /users/{doc}     { allow read, write: if request.auth != null; }
  }
}
```

Không muốn mở Firebase? Nạp bằng file JSON cũng được (chạy lại bao nhiêu lần cũng không cộng dồn):

```bash
python3 tools/push_to_kv.py --api https://... --key "$ADMIN_KEY" --stats-seed so-lieu-cu.json
# so-lieu-cu.json: {"lunar-secret":{"views":450,"votes":12}, "third-person":{"views":1234,"votes":56}}
```

Sau khi nạp xong thì **tắt Firebase luôn cũng được** — web không gọi tới nữa.

## 5d. Khi có trục trặc

| Hiện tượng | Nguyên nhân thường gặp | Cách sửa |
|---|---|---|
| admin báo *Không nối được: ADMIN_KEY không đúng* | chưa đặt secret `ADMIN_KEY`, hoặc gõ sai khoá | Settings → Variables and Secrets → đặt lại `ADMIN_KEY` (Secret) rồi Deploy |
| admin báo *KV chưa gắn* / API trả 503 | chưa bind namespace | Settings → Bindings → KV namespace, **Variable name** phải đúng chữ `CZ_KV` |
| Lưu xong nhưng web vẫn dữ liệu cũ | chưa dán URL Worker vào `cz-config.js` | dán `window.CZ_API = 'https://...'` rồi deploy lại **một lần** |
| Bấm **Đồng bộ Blogger** mà không đổi gì | trang blogspot đổi cấu trúc thẻ | Worker giờ đọc `<div class="truyen-card">`; nếu đổi nữa thì sửa `parseCards()` trong `worker/cms.js` |
| Đăng nhập Google báo *Invalid keyData* | worker đang chạy là **bản cũ** | dán lại `worker/cms.js` (bản 1.5.0) rồi Deploy |
| Google báo **`400: origin_mismatch`** | redirect URI chưa khai trong Google Cloud Console | dùng Supabase thay (mục 7b): thêm tên miền vào Supabase → Authentication → URL Configuration là xong, không phải chờ Google duyệt |
| Web hiện **sai số chương** dù file trong repo đã đúng | KV còn giữ bản cũ, mà web thì đọc KV trước | `/admin` → **Bác sĩ dữ liệu** → *Soi dữ liệu* → *Nạp chương từ repo lên KV* → *Đếm lại số chương trên KV*; hoặc gọi thẳng `POST /api/recount` kèm `x-admin-key` |
| Bác sĩ báo **KV lệch file trong repo** dù truyện đã lên web (`KV` > `repo`) | chương được đăng **ngay trong trang quản trị** (`PUT /api/book/<slug>` chỉ ghi KV, không tự sửa file GitHub) — người đọc không bị ảnh hưởng | `/admin` → **Bác sĩ dữ liệu** → *↓ Lưu file repo từ KV* → bỏ file vào `data/book/` → commit. **Đừng** bấm *Nạp chương từ repo lên KV* ở chiều này: bản repo ít chương hơn sẽ ghi đè và **xoá mất chương đã đăng** |
| Bấm **Thích** mà Top vote không nhảy | web đang đọc bản JS cũ trong cache | Ctrl+F5; kiểm tra `?v=` ở cuối thẻ `<script>` trong HTML đã đổi chưa |
| Bình luận báo *"không nhận được mã máy"* | web gửi thiếu `vid` (bản JS cũ) | Ctrl+F5 để lấy `cz-app.js` mới |
| Đăng nhập Google báo *sai audience* | `GOOGLE_CLIENT_ID` trên Worker ≠ Client ID trong `cz-config.js` | sửa cho khớp 2 chỗ |
| Nút **Thích** báo *lưu trên máy bạn* | web không gọi được Worker (sai URL/CORS) | xem Console; đặt `ALLOW_ORIGIN` có domain web của bạn |
| Số liệu vẫn 0 sau khi có người đọc | chưa deploy bản 1.4.0, hoặc web gọi Worker khác | `/admin` → **Số liệu** → **Đọc lại**; `--stats` để xem KV |
| Trang chủ trắng sau khi sửa dữ liệu | 1 bộ bị sai định dạng JSON | admin → **Sao lưu** để có bản dự phòng, sửa lại bộ đó, hoặc **Phục hồi** từ file sao lưu |

Các file code (`cz-app.js`, `cz-home.js`, `cz-story.js`, `cz-config.js`, `cz.css`, `admin.js`) được đặt
`Cache-Control: no-cache` trong `_headers`, nên sửa file nào rồi deploy lại là máy người dùng nhận bản mới ngay.
Dữ liệu `/data/*.json` để cache ngắn (5 phút, riêng `data/book/*` 1 phút) vì dữ liệu đã đi qua KV.

### 5e. Gỡ phiếu của một người / reset số liệu bầu

Mở `/admin` → tab **Phiếu bầu** (hoặc bấm phím `V`).

1. Chọn bộ ở ô bên phải (gõ vào ô tìm để lọc danh sách).
2. Danh sách chia thành **Phiếu cho cả bộ** và từng **Chương N**; mỗi dòng là một người,
   có nhãn *Tài khoản* / *Thiết bị* / *Địa chỉ IP* và thời điểm bầu.
3. Tick người cần gỡ (hoặc **Chọn cả nhóm** / **chọn tất cả**) → **Gỡ phiếu đã chọn**.
   Số phiếu ngoài web giảm ngay, phiếu theo chương cũng trừ theo.
4. Muốn xoá sạch làm lại: ô **Reset dữ liệu bầu** ở cuối tab — chọn *Chỉ bộ đang chọn* hay
   *Tất cả bộ trong thư viện*, và có thể giới hạn ở một chương. **Lượt đọc không bị ảnh hưởng.**

Gọi thẳng bằng curl khi cần (khoá là `ADMIN_KEY` của Worker):

```bash
# xem ai đã bầu
curl -H "x-admin-key: $ADMIN_KEY" "https://<worker>/api/admin/voters?slug=third-person"

# gỡ 2 phiếu ở chương 12
curl -X POST -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
     -d '{"slug":"third-person","ch":12,"keys":["a:may-abc#12","g:9f2c1d#12"]}' \
     https://<worker>/api/admin/vote-remove

# reset toàn bộ phiếu của một bộ (giữ lượt đọc)
curl -X POST -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
     -d '{"slug":"third-person"}' https://<worker>/api/admin/votes/reset
```

### 5f. Nhận báo lỗi chữ từ người đọc

1. Người đọc vào trang đọc → cuối chương bấm **Báo lỗi chữ** → ghi chỗ sai → **Gửi báo lỗi** (một lần bấm, không copy gì).
2. Worker lưu vào KV (`report`, giữ 300 báo lỗi gần nhất) và gửi email kèm tên bộ, chương, link, người gửi —
   điền `MAIL_TO` là có thư ngay (FormSubmit, miễn phí), hoặc `RESEND_API_KEY` + `MAIL_FROM` nếu muốn dùng Resend.
3. Xem lại trong `/admin` → tab **Báo lỗi** (phím `R`). Bấm **Mở** để nhảy tới đúng chương.

```bash
# đọc danh sách báo lỗi gần nhất
curl -H "x-admin-key: $ADMIN_KEY" "https://<worker>/api/admin/reports?q=chính tả"
```

> **Mẹo phân bệnh nhanh:** chạy đúng câu `curl` ở trên (curl không bị chặn CORS như trình duyệt).
> Nếu curl in ra danh sách báo lỗi mà tab **Báo lỗi** vẫn đỏ chữ `Failed to fetch` → dữ liệu có
> sẵn, khoá đúng, Worker sống — chỉ có điều Worker đang chạy bản ≤ 1.10.0 **thiếu header CORS**
> ở endpoint này. Cách chữa: mục **7c, bước 1b** (dán `worker/cms.js` mới → Deploy).

## 6. Bảo mật

- `ADMIN_KEY` chỉ nằm trong localStorage của trình duyệt bạn và trong secret của Worker — **không** nằm trong code.
  Nếu lộ, đổi secret là xong (`Settings → Variables and Secrets`), hoặc tạo lại Worker.
- Nên đặt `ALLOW_ORIGIN` = domain web của bạn để người khác không gọi API từ site lạ.
- Chống spam bằng KV (khoá tự hết hạn): 3 bình luận/10 phút/người, 40 lần bầu/giờ, 30 lần đăng nhập/10 phút/IP.
- Session bình luận là JWT HS256 ký bằng `SESSION_SECRET`, hạn 30 ngày; đổi secret là mọi phiên cũ hết hiệu lực.
- Muốn khoá đọc công khai? Đặt `READ_KEY` và thêm header khi gọi — hiện tại dữ liệu là nội dung công khai nên để mở.

## 7. Bình luận & đăng nhập Google (người dùng)

Web dùng **Google Identity Services** (không dùng Firebase Auth): trình duyệt lấy idToken từ Google →
`POST /api/auth/google` → Worker xác thực chữ ký bằng khoá công khai Google (cache theo `kid`) + kiểm tra
`aud`/`iss`/`exp` → cấp session token → lưu localStorage. Gửi bình luận kèm header `Authorization: Bearer <session>`.

**Biến môi trường cần có:** `GOOGLE_CLIENT_ID`, `SESSION_SECRET` (≥ 32 ký tự).
**Phía web (`cz-config.js`):**

```js
window.CZ_GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';   // để '' tắt đăng nhập
```

Chi tiết từng bước (tạo Client ID, consent screen, test) xem **`HUONG-DAN-DANG-NHAP-BINH-LUAN.md`** ở gốc repo.
Đăng nhập Google yêu cầu HTTPS (localhost/127.0.0.1 được phép khi test).

**Lưu ý:** bình luận là công khai. Tác giả xoá được bình luận của mình; **quản trị** (ADMIN_KEY hoặc email trong `ADMIN_EMAILS`) xoá được của bất kỳ ai, và xem toàn bộ ở `/admin` → tab **Bình luận**.

## 7b. Đăng nhập bằng Supabase (khuyên dùng — hết lỗi `origin_mismatch`)

Google Identity Services bắt khai **đúng** từng redirect URI, nên mỗi lần đổi tên miền (hoặc mở bản xem trước) là bị
`400: origin_mismatch`. Supabase không vướng chuyện đó: nó dùng luồng PKCE và một trang redirect duy nhất.

**1. Tạo project Supabase** → <https://supabase.com/dashboard> → *New project* (chọn region Singapore cho gần).

**2. Bật Google làm nhà cung cấp** → *Authentication* → *Providers* → **Google** → bật →
dán *Client ID* + *Client Secret* lấy từ Google Cloud Console (ứng dụng loại **Web**, không cần khai redirect URI của web mình —
chỉ cần `https://<project>.supabase.co/auth/v1/callback`, Supabase tự tạo sẵn).

**3. Khai tên miền web** → *Authentication* → *URL Configuration*:
- **Site URL**: `https://ten-mien-that.com`
- **Redirect URLs**: thêm tất cả những nơi có thể mở web — `https://ten-mien-that.com/**`, bản Pages tạm `https://*.pages.dev/**`, và `http://localhost:8787/**` khi test.

**4. Lấy 2 giá trị công khai** → *Settings* → *API*: `Project URL` và `publishable/anon key`.
Hai giá trị này bắt buộc xuất hiện trong trình duyệt và không phải bí mật. **Tuyệt đối không** dán `service_role`, secret key hoặc JWT Secret vào web/registry; JWT Secret chỉ đặt ở Worker.

**5. Dán vào web** — 1 trong 2 cách:
- `cz-config.js` (commit lên GitHub, đổi là phải deploy lại):
  ```js
  window.CZ_SUPABASE_URL = 'https://xyz.supabase.co';
  window.CZ_SUPABASE_ANON_KEY = 'sb_publishable_...';
  // Không đặt email quản trị hay secret trong file này.
  ```
- hoặc `/admin` → **Cài đặt & đồng bộ** → mục *Đăng nhập người đọc (Supabase)* → **Lưu** (lưu trên KV, đổi được ngay, không cần deploy).
  `cz-config.js` thắng nếu cả hai nơi đều điền.

**6. Đặt biến cho Worker:** `SUPABASE_URL`; đặt `SUPABASE_JWT_SECRET`, `ADMIN_EMAILS` và `SESSION_SECRET` dưới dạng **Secret**. Danh sách quản trị chỉ tồn tại ở đây.

> ### ⚠️ Bắt buộc từ bản 1.9.8 — Worker phải GHIM đúng project Supabase
>
> Project mới của Supabase (dùng khoá public `sb_publishable_…`) ký access_token bằng **cặp khoá
> bất đối xứng ES256** (xem `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`).
> Đặt mỗi mình `SUPABASE_JWT_SECRET` là **KHÔNG đủ** — verify HS256 luôn thất bại, hậu quả là
> người đọc đăng nhập Google xong vẫn bị **mọi** API trả 401: My Space báo "Vui lòng đăng nhập
> lại", đánh giá sao/bình luận không lưu được. Đây đúng là bệnh "My Space lỗi nghiêm trọng".
>
> Worker cần biết **Project URL** — 1 trong 2 cách, làm xong là chạy ngay, không cần deploy lại:
> 1. Dashboard Cloudflare → Workers → `chuseoz-cms` → Settings → Variables → thêm
>    `SUPABASE_URL = https://<ref>.supabase.co` (vd `https://hnyzrkdlmvelbgcowztk.supabase.co`).
> 2. Hoặc mở `/admin` → **Cài đặt & đồng bộ** → mục *Đăng nhập người đọc (Supabase)* →
>    điền **Project URL + anon key** → **Lưu** (Worker đọc ghim từ KV).
>
> Nhờ ghim, Worker verify ES256/RS256 bằng JWKS của đúng project — và **chặn** token do project
> khác tự ý cấp (nếu không ghim thì kẻ xấu tự tạo project riêng, tự ký token mang email quản trị
> là vào được trang quản trị, nênWorker cố tình không chấp nhận "project nào cũng được").

**Luồng chạy thật:** người đọc bấm *Đăng nhập* → Supabase mở Google → quay về web với `access_token` →
`POST /api/auth/supabase` → Worker verify chữ ký (HS256 bằng JWT Secret, hoặc RS256/ES256 bằng JWKS của
project đã ghim) → cấp session token của Worker → web lưu lại, dùng cho bình luận/bầu chọn. Kiểm tra nhanh:
`/admin` → tab **Cài đặt** → nút *Hỏi Worker* (phải thấy "Supabase: sẵn sàng"), hoặc `curl https://<worker>/api/auth/config`
— `supabase` phải là `true`, kèm `supabaseEnv` (ghim bằng biến) / `supabaseKv` (ghim bằng KV).

Chưa bật Supabase thì web tự quay về đường Google cũ (nếu có `GOOGLE_CLIENT_ID`), và người đọc vẫn bình luận được bằng tên khách.

## 7c. Bắt bệnh nhanh: 401 khi bình luận / "Failed to fetch" ở trang quản trị

Mở DevTools (F12) → tab Network/Console rồi đối chiếu:

**1. `/admin` báo "Không nối được: Failed to fetch…":**
- Mở `https://<worker>/api/health` trên tab mới. Nếu trang JSON hiện ra bình thường
  mà admin vẫn lỗi → Worker đang chạy **bản cũ thiếu CORS của /api/health** (sửa từ 1.5.1) → deploy lại.
- Nếu tab mới cũng không mở được → Worker chưa deploy, sai URL, hoặc bị tắt ở dashboard.

**1b. Chỉ MỘT tab (thường là *Báo lỗi*) báo "Failed to fetch", các tab khác vẫn chạy:**
→ KHÔNG phải bệnh kết nối. Worker vẫn trả 200 OK, chỉ thiếu `access-control-allow-origin`
nên trình duyệt chặn trang admin đọc response. Bản ≤ **1.10.0** quên header này ở
`GET /api/admin/reports`. Cách chữa duy nhất: mở Worker → **Quick Edit** → dán TOÀN BỘ
tệp `worker/cms.js` bản mới → **Save and Deploy** (không cần đụng `ADMIN_KEY`, KV,
`wrangler.toml` hay URL trong ô Kết nối). Kiểm tra lại bằng cách mở `<worker>/api/health`
— phải thấy `"version": "1.10.1"` — rồi bấm **Đọc lại** ở tab Báo lỗi.
(Từ 1.10.1 trang quản trị tự làm bước chẩn đoán này: nếu `api/health` vẫn OK mà endpoint
kia chết, dòng đỏ sẽ nói thẳng là do Worker bản cũ.)

**2. `POST /api/auth/supabase` trả 401 — đọc chữ trong `error`:**

| Thấy chữ này | Bệnh | Cách chữa |
|---|---|---|
| `token Supabase ký ES256/RS256 … mà Worker chưa ghim project` / `/api/auth/supabase` trả 500 "chưa ghim project" | Project ký bằng khoá bất đối xứng (khoá `sb_publishable_…`) mà Worker chưa biết Project URL — **đây là lỗi "đăng nhập xong vẫn 401" của bản 1.9.7 trở xuống** | Đặt biến `SUPABASE_URL` trên Worker **hoặc** `/admin` → Cài đặt & đồng bộ → Đăng nhập → điền Project URL + anon key → Lưu (xem §7b) |
| `token sai issuer — token do "https://A…" cấp nhưng Worker đang đặt SUPABASE_URL="https://B…"` | Worker ghim **nhầm project** Supabase | Đặt lại `SUPABASE_URL` đúng project (hoặc sửa Project URL ở `/admin` rồi Lưu) |
| `ký HS256 mà Worker chưa đặt SUPABASE_JWT_SECRET` | Project Supabase đời cũ ký JWT bằng secret | `npx wrangler secret put SUPABASE_JWT_SECRET` (JWT Secret trong Supabase → Settings → API) |
| `không đọc được JWKS của Supabase` | URL ghim sai/không tồn tại | Sửa lại URL cho đúng |
| `phiên đăng nhập đã hết hạn` | access_token quá 1 giờ | Đăng nhập lại (web tự làm khi bấm Đăng nhập) |
| `chữ ký token Supabase không hợp lệ` | URL đúng project nhưng khoá không khớp (project vừa xoay khoá, hoặc token bị sửa) | Đăng nhập lại cho có token mới; Supabase → JWT Keys giữ nguyên khoá cũ trong thời gian chuyển tiếp |

**3. Gửi bình luận báo "Không xác thực được phiên đăng nhập — <lý do>":**
- Lý do thật nằm ngay sau dấu gạch ngang (từ 1.5.1). Nếu là `Worker chưa đặt SUPABASE_URL…`
  hoặc `sai issuer` → chữa theo bảng trên. Nếu là `phiên … hết hạn` → bấm Đăng nhập lại.
- Console có dòng `[cz-auth] Worker không đổi được session (401): …` cho biết vì sao
  bước đổi token thất bại — web vẫn giữ token Supabase thô, nên chỉ cần sửa cấu hình
  Worker là bình luận chạy lại mà không cần đăng nhập lại.

**4. Check nhanh cấu hình Worker:** `GET /api/health` → khối `auth`:
`supabase: true` (đã đặt SUPABASE_URL), `session: true` (đã đặt SESSION_SECRET),
`supabaseHs256: true` (đã đặt SUPABASE_JWT_SECRET — chỉ cần với project cũ).

### Kiểm tra kiểu JavaScript trong trình soạn thảo

Mở **toàn bộ repository**, không chỉ sao chép riêng `worker/`: `cms.js` còn
import `../src/shared/chapters.js`. Từ thư mục gốc chạy:

```sh
npm install
npm run check:worker
```

`worker/jsconfig.json` bật kiểm tra cho các module Worker và file chương dùng
chung, dùng module resolution `Bundler` và kiểu Cloudflare Workers (không trộn
DOM của trình duyệt). Nếu VS Code vẫn giữ lỗi cũ sau khi cài dependencies,
chọn **TypeScript: Select TypeScript Version → Use Workspace Version**, rồi
**TypeScript: Restart TS Server**. Không cần tắt kiểm tra JS hay thêm `@ts-nocheck`.
