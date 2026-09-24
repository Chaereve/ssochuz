# Báo cáo · Tiết kiệm Worker + nén/sao lưu ảnh (bản 1.17.0)

Ngày: 2026-09-24 · Nhánh: `arena/01a0d1f6-ssochuz` (phiên Arena cố định nhánh này)
Tệp sửa: `worker/cms.js`, `worker/overflow.js`, `src/shared/image-url.js` (mới),
`tools/bench_kv.mjs`, `tools/pull_from_kv.py`, `tests/t_worker.mjs`, `worker/README.md`.

Trả lời 3 câu hỏi của chủ trang: **(1) đã tối ưu cache/lượt đọc/tải chương/chỉnh sửa chưa?
(2) ảnh đã được nén và sao lưu ở cả KV – local – Supabase chưa? (3) còn bug giao diện/tính năng nào?**

---

## 1. Worker đang tốn bao nhiêu — số đo thật, không ước lượng

Công cụ đo: `node tools/bench_kv.mjs .` (chạy THẬT `worker/cms.js` trên KV giả có đếm thao tác).

> **Bug đã sửa:** lệnh này **không chạy được** trước bản 1.17.0 — README ghi
> `node tools/bench_kv.mjs .` nhưng script ghép `'.' + '/worker/cms.js'` rồi import
> tương đối với chính nó → `ERR_MODULE_NOT_FOUND: tools/worker/cms.js`. Nay đối số
> được giải về đường dẫn tuyệt đối (`path.resolve` + `pathToFileURL`).

Kết quả đo trên bản 1.17.0 (kịch bản: 600 lượt xem của 120 người × 5 bộ, 60 lần đọc
`/api/stats`, 40 phiếu + 15 đánh giá, 20 bình luận + 100 lần đọc, cron 1 giờ):

| Nhóm việc | GHI | ĐỌC | LIST |
|---|---|---|---|
| 600 lượt xem (120 người × 5 bộ) | 24 | 144 | 0 |
| 60 lần đọc `/api/stats` | 1 | 61 | 1 |
| 40 phiếu bầu + 15 đánh giá | 106 | 106 | 0 |
| 20 bình luận + 100 lần đọc | 20 | 128 | 0 |
| Cron 1 giờ (6 lần) | 0 | 6 | 0 |
| **Tổng "ngày" giả lập** | **151** | **445** | **1** |

So với hạn mức free của Cloudflare (1.000 ghi + 100.000 đọc/ngày) và so với bản cũ
(484 ghi / 674 đọc / 60 list cho kịch bản nhỏ hơn — ghi ở `worker/README.md` mục 1.15.0),
phần số liệu đã được nới rất rộng. **Chỗ còn tốn là phiếu bầu/đánh giá** (106 ghi cho 55
thao tác) — xem mục 4.

### Tải chương — chỗ tiết kiệm lớn nhất (đã có từ 1.16.0, nay đo được)

Bản 1.17.0 thêm vào `bench_kv.mjs` phép đo **100 lượt mở chương của một bộ 200 chương
(~3,6 MB)**, so đường nhẹ với đường cũ:

| | KV đọc | Byte trả về |
|---|---|---|
| Đường nhẹ `/toc` + `/chapter/<n>` | 101 | **2.194.791 (2,19 MB)** |
| Đường cũ: tải cả bộ mỗi lượt mở | 100 | **360.713.700 (360,7 MB)** |
| **Chênh** | ~ngang nhau | **giảm 99 %** |

Đọc đúng bản chất: **số lượt ĐỌC KV không giảm** (mỗi lượt mở vẫn chạm 1 khoá `book:<slug>`),
thứ giảm là **byte truyền + CPU Worker** (không còn `JSON.parse` cả bộ 3,6 MB mỗi lượt —
bản free chỉ cho 10 ms CPU/request). Số lượt đọc KV giảm là nhờ **cache biên**:
`/chapter/<n>` để `s-maxage` 24 giờ, `/toc` 30 phút, nên 1.000 người mở cùng một chương
chỉ tốn **1** lượt đọc KV, không phải 1.000.

### Những thứ đã tối ưu sẵn (không phải làm lại)

| Đã có từ | Cái gì |
|---|---|
| 1.9.5 | cache biên cho `registry`/`book`/`stats`; xoá cache đúng URL sau mỗi lần ghi |
| 1.15.0 | ngân sách ghi khoá `stats` 240/ngày (`src/shared/kv-budget.js`), gộp tổng đánh giá vào 1 khoá `rateagg` (hết LIST mỗi lần `/api/stats`), `rateLimit` đếm trong RAM |
| 1.16.0 | `/api/book/<slug>/toc` (vài KB) + `/api/book/<slug>/chapter/<n>` (1 chương); **khoá cache bỏ tham số rác** (`fbclid`, `utm_source`, `_=`) để link chia sẻ Facebook/Zalo dùng chung một bản lưu; TTL registry 300 s, bộ 1.800 s, chương 24 h (bộ có chương hẹn giờ tự hạ 60 s); bình luận cache 15 s |
| 1.16.0 | **Lưu 1 chương** (`PUT /api/book/<slug>/chapter`) thay vì gửi lại cả bộ mỗi lần bấm "Lưu chương" |
| 1.14.0 | ảnh/bìa ra khỏi KV → Supabase Storage (bìa là **302 redirect** sang CDN, không tốn KV cho mỗi lượt xem ảnh) |
| upload | **ID ảnh theo băm nội dung** → dán lại đúng tấm ảnh cũ thì Worker trả URL cũ, không ghi thêm bản sao |

### Chỉnh sửa trên trang quản trị — còn 1 chỗ nặng, cố ý chưa đụng

Mở bộ để sửa (`BookEditor`) vẫn tải **trọn bộ** bằng `GET /api/book/<slug>` (bộ lớn 1,4 MB).
Lý do chưa đổi: `ChapterEditor` giữ nguyên mảng `localBook.chapters` trong React — nháp
localStorage, kéo-thả đổi thứ tự, "Lưu cả bộ" đều đọc từ mảng đó. Chuyển sang nạp từng
chương theo yêu cầu là viết lại cơ chế nháp của component phức tạp nhất trang admin; làm
vội dễ mất chữ đang gõ. **Ghi lại đây như việc cần làm có kiểm soát**, không phải bỏ quên.
Trong lúc chờ: `/toc` + `/chapter/<n>` đã có sẵn phía Worker, chỉ cần phía admin dùng.

---

## 2. Ảnh: nén và sao lưu — cái gì ĐÃ có, cái gì THIẾU

### Đã có (kiểm tra lại từng đường upload, bản 1.17.0)

| Đường ảnh | Nén ở đâu | Hạn mức |
|---|---|---|
| Bìa truyện (admin) | `src/admin/utils/images.js` → `compressImage(kind:'cover')` | ≤ **120 KB**, cạnh dài 1000 px, WebP (rơi về JPEG), hạ chất lượng 0.82→0.5 và thu nhỏ 1→0.6 tới khi lọt hạn mức |
| Ảnh trong chương (admin, dán vào TipTap) | `compressImage(kind:'chapter')` | ≤ **260 KB**, cạnh dài 1440 px |
| Ảnh đại diện (My Space) | `src/cz-space.js` → `autoCrop256` / hộp cắt | **256×256**, JPEG 0.85 |
| Ảnh chụp màn hình báo lỗi | `src/cz-app.js` → `uploadReportImage` | cạnh dài 1800 px, WebP 0.82, chặn > 5,5 MB sau nén |

Vì KV và Supabase nhận **cùng một bản đã nén** từ trình duyệt, nên "KV và Supabase đều
nhẹ" là đúng sẵn. Worker không nén lại (Workers không có canvas; Cloudflare Images thì
phải trả phí) — nén ở trình duyệt là đúng chỗ.

### THIẾU — và đã làm trong bản này

**Phát hiện khi đo:** 63/63 bìa trong `data/registry.json` là **link ngoài**
(`images.justwatch.com`, `m.media-amazon.com`, `pbs.twimg.com`, `blogger.googleusercontent.com`),
và ảnh trong chương cũng là link Blogger. Nghĩa là:

* kho của mình **không giữ byte nào** của chúng → host kia gỡ ảnh là **mất bìa vĩnh viễn**,
  bản "local" trong repo cũng chỉ là link chết;
* mình **không kiểm soát dung lượng** của chúng (có host trả 400–900 KB cho một cái thẻ 400 px).

**Đã thêm 2 thứ:**

**(a) `POST /api/admin/mirror-images` — sao lưu ảnh ngoài về kho của mình**
(`worker/overflow.js` → `mirrorImages`, luật URL ở `src/shared/image-url.js`)

* hỏi **chính CDN đó** một bản nhỏ hơn bằng cách sửa URL theo luật riêng của host
  (googleusercontent `/s1600/`→`/s800-rw/`, justwatch `/s718/`→`/s800/`,
  amazon `_UX600_`→`_UX800_QL80_`, twimg `?format=webp&name=medium`, wikimedia `/600px-`),
  mốc mặc định **800 px cho bìa / 1200 px cho ảnh chương** — vẫn rõ trên màn hình 2x mà nhẹ hơn;
* không chắc luật của host thì **giữ nguyên URL gốc** (thà không nén còn hơn làm hỏng ảnh);
* ngửi **magic bytes** để nhận JPEG/PNG/WebP (không tin `Content-Type`), quá 8 MB thì bỏ qua;
* ghi vào **Supabase Storage `covers`/`images`** (không có Supabase thì KV như đường cũ)
  rồi **viết lại link** trong `registry.thumb/slide/cover` và HTML chương;
* **id theo băm của URL** → chạy lại không tải lại, không tạo bản sao;
* chạy theo lô (`limit`, mặc định 8, tối đa 25) cho vừa số subrequest của Worker;
  `dryRun:true` chỉ báo cáo; lỗi từng ảnh nằm trong `failed[]`, không đụng ảnh còn lại.

**(b) `tools/pull_from_kv.py --images` — sao lưu ảnh về MÁY (local)**

* gom mọi `/api/img/<id>` mà web thật đang dùng (bìa trong registry + ảnh trong HTML chương),
  tải từng ảnh về `_backup/img/<id>.<đuôi>` — **theo cả 302** nên ảnh đang nằm trên
  Supabase Storage cũng tải được;
* đuôi tệp đặt theo **magic bytes**; ảnh đã có và **đúng bằng byte** thì bỏ qua
  (chạy lại mỗi ngày không ghi lại cả kho);
* `--images-only` để chỉ sao lưu ảnh (không kéo book), `--images-into <thư mục>` để đổi chỗ,
  `--dry` để xem trước;
* `_backup/` đã thêm vào `.gitignore` — muốn giữ bản sao lưu **trong git** thì bỏ dòng đó
  rồi commit thư mục (đánh đổi: repo phình theo dung lượng ảnh).

### Đo được ngay lúc viết báo cáo

Chạy thật `tools/pull_from_kv.py` (hàm `backup_images`) chống vào Worker thật
(`tests/mock_worker.mjs`, khoá `MOCK`): upload 1 ảnh PNG 51 byte →
`collect_img_ids` gom đúng 2 id từ registry + HTML chương → tải về
`/tmp/imgbackup/<id>.png`, **byte khớp ảnh gốc**, chạy lần 2 báo `1 không đổi · 0 lỗi`.

---

## 3. Bug đã tìm ra và sửa trong đợt này

| # | Bug | Bằng chứng | Sửa |
|---|---|---|---|
| 1 | `tools/bench_kv.mjs` **không chạy được** với đúng cú pháp README (`ERR_MODULE_NOT_FOUND: tools/worker/cms.js`) | chạy trước khi sửa: văng traceback | giải đối số bằng `path.resolve` + `pathToFileURL` |
| 2 | `mirrorImagesRun` trả `Response` mà route đọc `r.rewrites` → **không bao giờ purge cache registry**, thẻ truyện còn trỏ link cũ tới hết TTL | `npm run check:worker` → `worker/cms.js(382,26): error TS2339: Property 'rewrites' does not exist on type 'Response'` | purge ngay trong handler, truyền `org` vào |
| 3 | Viết lại HTML chương **không chạy** vì `items[]` không mang `slug` → `touched` rỗng | bài test `mirror/HTML chương đã viết lại link` đỏ (link cũ còn nguyên) | thêm `slug: t.slug` vào cả 2 chỗ push item |
| 4 | Fixture ảnh trong `tests/t_worker.mjs` là header **`WEHP`** (sai 1 ký tự: `57454850` thay vì `57454250`) — trước giờ vô hại vì không có chỗ nào ngửi magic bytes, nhưng mirror ngửi nên từ chối đúng | `sniffImageType` trả `''` cho fixture đó | dùng header WebP đúng trong bài mirror, ghi chú lại chỗ fixture cũ |

## 4. Còn gì nên làm tiếp (chưa làm, nói rõ)

1. **Admin nạp bộ theo chương** (dùng `/toc` + `/chapter/<n>` khi mở `BookEditor`) — giảm
   1,4 MB → ~20 KB mỗi lần mở bộ để sửa. Cần viết lại cơ chế nháp của `ChapterEditor`.
2. **Phiếu bầu/đánh giá còn 106 ghi cho 55 thao tác** — có thể đệm theo lô như khoá `stats`
   đang làm, nhưng phải giữ "gỡ vote giảm đúng ngay" nên cần thiết kế lại khoá.
3. **Nén lại ảnh đang nằm sẵn trong kho**: mirror chỉ lo ảnh MỚI tải về; ảnh cũ đã upload
   thì đã nén từ đầu, còn ảnh cũ **nhập từ Blogger** thì vẫn là link ngoài — chạy
   `POST /api/admin/mirror-images {only:'chapters'}` nhiều vòng để kéo dần về.
4. **Cloudflare Images** (trả phí) mới tái mã hoá được ảnh bất kỳ; nếu sau này nâng gói thì
   `fetchRemoteImage` là chỗ duy nhất cần thêm nhánh `cf.image`.

## 5. Kiểm chứng

* `node tests/t_worker.mjs` → **417/417** kiểm tra (thêm 23 kiểm tra mục
  *17. SAO LƯU ẢNH NGOÀI VỀ KHO*: 401 khi thiếu quyền, `dryRun` không ghi,
  hỏi CDN bản nhỏ `/s800/` trước, link mới trỏ Storage, registry viết lại,
  bỏ qua bìa đã trong kho, chạy lại 0 ảnh mới + **0 lần gọi mạng**, ảnh chương
  lưu + HTML viết lại, host chết thì `failed[]` kể tên và **không đụng HTML gốc**).
* `npm run check:worker` → exit 0 (chính nó bắt được bug #2).
* `node tools/bench_kv.mjs .` → chạy được, in số ở mục 1.
* `node tests/run.js` → **58/58 bài đạt**, exit 0 (`Tất cả bài kiểm thử đều đạt`).
  Trong đó phần **giao diện** chạy bằng jsdom: `t_space.js`, `t_space_hero.js`, `t_mobile.js`,
  `t_html.js`, `t_home.js`, `t_quiet_home.js`, `t_story.js`, `t_reader.js`, `t_sweep.js`
  (bấm hết mọi nút trong trang xem có lỗi JS không), `t_lock_ui.js`, `t_private_ui.js`,
  `t_admin_*` (7 bài cho trang quản trị) — tất cả xanh.
* **Chưa kiểm được ở môi trường này:** 2 bài trình duyệt thật `t_layout_browser.js` và
  `t_space_browser.js` (Playwright) **không nằm trong `tests/run.js`** và cần
  `CHROMIUM_EXECUTABLE` + `server.py`; máy chạy báo cáo này không có Chromium nên
  **chưa chạy**. Muốn soát layout thật thì chạy tay theo ghi chú đầu tệp đó.
* `tools/check_html.js` → sạch (không trùng thuộc tính, link và icon đều có thật,
  `_redirects` 187 luật không vòng lặp). `tools/check_css.py` / `tools/check_calls.js`
  là công cụ **liệt kê để xem** (exit 0): 298 class "không thấy dùng" phần lớn là tên
  class nằm trong `admin.js` đã rút gọn/JSX mà script không quét, và 159 mục của
  `check_calls.js` là hàm nội bộ của TipTap — không phải bug.
