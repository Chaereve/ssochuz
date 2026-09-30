# BÁO CÁO: overflow (bìa → Supabase) + nhận diện chương dùng chung + truyện 0 chương

Ngày: 2026-09-23 · Nhánh: `arena/01a0cd01-ssochuz`

Báo cáo này gom 5 yêu cầu cùng một lượt làm. Mỗi mục: **bệnh → đã chữa ở đâu → cách kiểm tra**.

---

## 1. Bìa truyện đã lỡ lưu trong KV → chuyển lên Supabase Storage

**Bệnh:** KV của Cloudflare tính tiền theo lượt đọc/ghi, nhét book JSON lớn và ảnh base64 trong
KV làm quota gói miễn phí hút nhanh. Đã có luồng overflow (`worker/overflow.js`) cho dữ liệu MỚI,
nhưng dữ liệu **đã lỡ** nằm trong KV (book JSON đầy đủ, ảnh base64 — kể cả **bìa truyện**) không
có cách nào dọn ra ngoài.

**Đã chữa:**

- `worker/overflow.js` thêm:
  - `coverIdSet(registry)` — gom id ảnh đang là **bìa** (registry `thumb/slide/cover` trỏ tới
    `/api/img/<id>`);
  - `migrateOverflow(env, { limit, only })` — quét KV theo prefix, phân loại và chuyển:
    - `book:*` (JSON đầy đủ) → `persistBook` → bảng Supabase `ssochuz_blobs` (hoặc R2);
    - `img:*` được registry trỏ làm **bìa** → `persistCover` → Supabase **Storage `covers`** (URL public CDN);
    - `img:*` còn lại (ảnh trong chương) → `persistImage` → `ssochuz_blobs` / R2;
  - sau chuyển KV chỉ còn **stub** nhỏ `{overflow:…}`; lỗi từng mục được liệt kê trong `failed[]`
    và **không xoá bản base64 gốc** — chạy lại được bao nhiêu lần cũng được (idempotent);
  - `limit` ≤ 25/lần, `only: books | covers | images` để chuyển riêng từng loại.
- `worker/cms.js` thêm endpoint **`POST /api/admin/migrate-overflow`** (cần `x-admin-key`),
  version Worker nâng lên **`1.14.0`**.
- `/admin` → tab **Bác sĩ** → ô *Overflow KV* có nút **Chuyển tất cả / Chỉ bìa / Chỉ book**,
  chạy nhiều vòng tới khi xong, hiện tiến độ + tổng kết. Nút chỉ hiện khi Worker báo đã gắn
  Supabase/R2 (`overflow.supabase` hoặc `overflow.r2`).

**⚠️ BẮT BUỘC PHẢI LÀM SAU KHI MERGE:** các thay đổi trên nằm **trong Worker** nên phải deploy
lại Worker:

```bash
npx wrangler deploy
```

(hoặc dán `worker/cms.js` + `worker/overflow.js` vào dashboard rồi Deploy). Kiểm tra:
`curl https://<worker>/api/health` phải thấy `"version": "1.14.0"` và cụm `overflow`
báo `supabase: true, covers: true`. Sau đó vào `/admin` → **Bác sĩ** → bấm **Chuyển tất cả**.

---

## 2. Chương truyện tranh chỉ có ảnh bị báo “chương rỗng”

**Bệnh:** hai nơi cùng dùng luật cũ “bỏ tag HTML rồi đếm chữ”:

1. Admin → Bác sĩ → *Quét book* báo “N chương rỗng” với cả những chương **toàn ảnh**;
2. Worker `POST /api/import` **từ chối 422** bài Blogger chỉ có ảnh.

**Đã chữa:**

- `src/shared/chapters.js` thêm `chapterHasMedia(html)` (img/video/audio/iframe/figure/table/…)
  và `chapterIsEmpty(html)` = không chữ + không có media nào. Dùng **một file chung** cho web
  đọc truyện, trang admin **và** Worker.
- Admin *Quét book* giờ dùng `chapterIsEmpty` → chương chỉ-ảnh không còn bị báo oan; chương rỗng
  thật được hiện **kèm số thứ tự** (vd `2 chương rỗng (#3, #7)`).
- `importPost` dùng `chapterHasMedia` → bài chỉ-ảnh được nhận bình thường.

---

## 3. Nhận diện số chương: Lờí mở đầu / Giới thiệu nhân vật / Chương 0 KHÔNG phải Chương 1

**Bệnh:** luật tách tên chương nằm rải rác ở 4 chỗ (trang đọc, admin, tách file txt, Worker import)
và chỉ hiểu `Chương \d+`. Hệ quả: truyện có “Lờí mở đầu” hoặc “Giới thiệu nhân vật” ở đầu bị
đếm lệch — phần mở đầu bị coi là “Chương 1”, chương chính thứ 1 bị dồn thành “Chương 2”.

**Đã chữa — một bộ quy tắc duy nhất** `src/shared/chapters.js`:

- `parseChapterTitle(t)` → `{ no, has, kind, name, full }` với `kind ∈ main | open | extra`:
  - `Chương 5`, `Chap 3`, `Chapter IV`, `Hồi 2`, `Quyển 3`, `Tập 7`, số thập phân `Chương 12.5`;
  - **`Chương 0` → phần MỞ ĐẦU** (kind `open`), không tính vào số chương;
  - “Lờí mở đầu / Mở đầu / Prologue / Lờí tác giả / **Giới thiệu nhân vật** / Giới thiệu truyện /
    Nhân vật / Thông báo” → `open`;
  - “Ngoại truyện / Phụ chương / Phiên ngoại / Side story / Hậu truyện / Epilogue / Đặc biệt” → `extra`;
  - vá lỗi regex: “Epilogue: Lờí bạt” từng bị regex chương-số tóm nhầm thành số 49 — **không còn**.
- `nextMainChapterNo(chapters)` — số chương chính kế tiếp (bỏ qua mở đầu/ngoại truyện),
  dùng cho gợi ý tên chương mới trong admin và worker import.
- Web đọc truyện (`CZ.chapInfo`, mục lục, ô nhảy chương), admin (thêm chương, nhãn “Mở đầu”/
  “Ngoại truyện” trong danh sách chương), tách `.txt` nhiều chương (`splitChaptersTxt`), và Worker
  import **đều dùng chung một parser**.

---

## 4. Truyện mới tạo (0 chương) không thấy ở trang chủ & không đồng bộ

**Bệnh (2 nguồn gốc):**

1. `POST /api/book` mới tạo cho `chapters: []` — nhưng phía web (`CZ.book`) coi mảng rỗng là
   “lỗi” và **rơi về file tĩnh** `/data/book/<slug>.json` (không tồn tại) → trang truyện báo lỗi
   “Chưa tải được nội dung”, trông như truyện “không tồn tại”. Dữ liệu cũng vì thế không được
   làm mới (`reconcileCount` không chạy).
2. Form **Tạo truyện mới** trong admin mặc định `pubStatus: 'draft'` — và web ẩn mọi truyện nháp
   khỏi trang chủ → nhiều truyện “tạo rồi mà không thấy” vì quên đổi trạng thái.

**Đã chữa:**

- `CZ.book`: Worker trả book có `chapters` là mảng (kể cả **rỗng**) thì **dùng luôn**, không rơi
  về file tĩnh → trang truyện hiện đúng vỏ “Sắp ra mắt”, đồng bộ/recount được dữ liệu.
- Form tạo truyện mặc định **`pubStatus: 'published'`**; nhãn “Nháp” ghi rõ **(ẩn khỏi trang chủ)**;
  hint dưới select nhắc mặc định là Xuất bản.
- `listedPublicly` (web) cũng ẩn truyện **bị từ chối duyệt** (`rejected`) nhất quán với nháp/chờ duyệt.
- `/admin` → Tổng quan thêm việc “**Đang ẩn khỏi trang chủ**” liệt kê các bộ bị chặn do
  Nháp/chờ duyệt/lưu trữ/riêng tư → mở thẳng sang phần sửa trạng thái. Đây là lý do phổ biến nhất
  khiến “truyện tạo rồi mà không thấy”.

---

## 5. Soát kỹ trang quản trị + trang đọc, sửa các lỗi phát hiện

- **Trang đọc**: `chapSplit` chuyển sang parser chung — “Chương 1” không còn bị nhảy nhầm sang
  phần mở đầu; khối nhóm “Mở đầu”/“Ngoại truyện” giữ nguyên; tìm chương theo số chính xác hơn.
- **Admin → Sửa bộ → danh sách chương**: thêm nhãn kèm **“Mở đầu” / “Ngoại truyện”** ngay trên
  từng dòng chương để nhìn ra ngay chương “khác loại”, khỏi lẫn với chương chính.
- **Nhãn trạng thái xuất bản** (books.js) ghi rõ luôn hậu quả: `Nháp (ẩn khỏi trang chủ)`,
  `Chờ duyệt (ẩn khỏi trang chủ)`, `Hẹn giờ (tới giờ mới hiện)`, `Từ chối (ẩn khỏi trang chủ)`,
  `Lưu trữ (ẩn khỏi trang chủ)`.
- **Bác sĩ → Quét book**: câu báo “N chương rỗng” giờ kèm số thứ tự chương để nhảy tới sửa nhanh.
- **Build**: `cz-app.js` giờ `import` module chung nên `build_site.mjs`/`check_src.js` bật
  `bundle: true` (esbuild, định dạng iife) — các file khác giữ nguyên cách gọi nhau qua `window.CZ…`.

---

## Kiểm thử

- `test mới: tests/t_chapters.js` — corpus 23 tiêu đề (so **song song** parser chạy Node vs bản đã
  minify trong jsdom), trang truyện gom nhóm/nhãn số, bộ 0 chương vẫn mở được, `splitChaptersTxt`
  nhận chuẩn tiêu đề mở đầu/ngoại truyện; đã đăng ký trong `tests/run.js`.
- `tests/t_worker.mjs` section 15 — fake Supabase (postgrest + storage): migrate chuyển book/bìa/
  ảnh vào đúng nơi, idempotent, `only=books`, Storage chết → `failed[]` + giữ nguyên base64;
  section 6 — import “Lờí mở đầu/GTNV/Ngoại truyện” giữ tên, chương chỉ-ảnh được nhận.
  Toàn bộ: **329 kiểm tra trong file worker test đều đạt**.
- `npm test` đầy đủ: **toàn bộ đều đạt**.

## Việc còn lại (vận hành, không thuộc code)

1. **`npx wrangler deploy`** — bắt buộc trước khi dùng endpoint migrate / import mới.
2. Vào `/admin` → Cài đặt & đồng bộ: xác nhận `SUPABASE_SERVICE_ROLE` đã gắn trong Worker
   (chỉ phía Worker — tuyệt đối không dán vào web/public).
3. `/admin` → Bác sĩ → **Chuyển tất cả** để dọn KV cũ (chạy xong số book/ảnh/bìa còn lại trong KV
   sẽ về 0 — health vẫn đếm stub như bình thường).
