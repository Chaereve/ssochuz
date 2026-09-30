# Sự cố 23/09 — deploy Worker làm mất biến `SUPABASE_URL`, cả 63 bộ không đọc được

**Mức độ:** nghiêm trọng (mất khả năng đọc toàn bộ kho truyện qua Worker, ~nhiều giờ).
**Bản bị:** Worker 1.16.0 sau `npx wrangler deploy`.
**Bản vá:** 1.16.1 (tệp `worker/wrangler.toml`, `worker/overflow.js`, `worker/cms.js`, `worker/jsconfig.json`, `tests/t_worker.mjs`).

---

## 1. Hiện tượng

`/api/health` báo đúng bản mới nhưng hai cờ quan trọng tắt:

| Trường | Giá trị lúc sự cố | Nghĩa |
|---|---|---|
| `version` | `1.16.0` | deploy code thành công |
| `overflow.supabase` | `false` | Worker **mất chỗ đọc dữ liệu lớn** (bảng `ssochuz_blobs` / Storage) |
| `auth.supabase`, `auth.google` | `false` | **mất ghim project Supabase** → đăng nhập/bình luận tắt |

Hệ quả đo được lúc đó:

* `GET /api/book/lunar-secret` → **502** `không đọc được dữ liệu bộ (overflow?)`
* `GET /api/book/<slug>/toc` → **404** `chưa có dữ liệu cho khoá book:<slug>` (thử thêm 6 bộ nữa, cùng kết quả)
* Người đọc chỉ còn **đường dự phòng tĩnh** `/data/book/*.json` (bản chụp trong GitHub) → vẫn đọc được
  nhưng **nội dung đứng yên** (sửa trên `/admin` không thấy) và **bình luận/đăng nhập tắt**.

Điểm khiến sự cố khó đoán: `/api/health` vẫn `ok:true`, `books:63`, `kv:true`. Nhìn từ ngoài
không có gì “chết”, chỉ có hai cờ `false` trong một JSON dài.

## 2. Nguyên nhân

`npx wrangler deploy` **thay toàn bộ biến thường (plain vars) của Worker bằng đúng nội dung
`[vars]` trong `worker/wrangler.toml`**. Biến đặt tay trên dashboard
(Workers & Pages → Settings → **Variables and Secrets**) mà không có trong `wrangler.toml`
thì **bị xoá**. Secret (`ADMIN_KEY`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE`…) thì wrangler
**giữ nguyên** — nên Worker vẫn đăng nhập quản trị được, vẫn “khoẻ”, chỉ mất mỗi project URL.

`SUPABASE_URL` lúc đó chỉ đặt tay trên dashboard ⇒ deploy 1.16.0 xoá mất ⇒
`worker/overflow.js` không dựng được `<SUPABASE_URL>/rest/v1/ssochuz_blobs` ⇒
mọi bộ đang ở dạng **stub trong KV** (bản 1.14.0 đẩy nội dung sang overflow) không materialize được.

Bằng chứng khớp với giả thuyết này:

1. Trước deploy, Worker **có** `SUPABASE_URL`: 23/09 ~10:22 Worker upload bìa lên Supabase
   Storage (`/storage/v1/object/covers/…`) — việc này bắt buộc phải có `SUPABASE_URL`.
2. `/api/health` sau deploy báo `auth.supabaseKv:false` → trước đó Worker **chỉ** biết project
   qua biến môi trường, không có ghim trong KV để rơi về.
3. Secret không mất (admin vẫn vào được) → đúng đặc điểm “wrangler giữ secret, xoá plain var”.

## 3. Cách khôi phục ngay (chọn 1, hiệu lực trong ~1 phút)

**A — Dashboard (không cần deploy lại):** Workers & Pages → `chuseoz-cms` → Settings →
**Variables and Secrets** → Add → name `SUPABASE_URL`, value
`https://hnyzrkdlmvelbgcowztk.supabase.co`, Type **Text** → Save.

**B — Deploy lại:** `cd worker && npx wrangler deploy` — từ 1.16.1 biến này **đã nằm trong
`wrangler.toml`** nên deploy không làm mất nữa.

Nếu `overflow.supabase` vẫn `false` sau đó: thiếu **secret** →
`cd worker && npx wrangler secret put SUPABASE_SERVICE_ROLE`.

Kiểm tra: `GET /api/health` phải có `overflow.supabase:true`; thử một chương bằng
`GET /api/book/<slug>/chapter/1`.

> Trạng thái production lúc viết báo cáo này (đo lại ngày 24/09): `version:1.16.0`,
> `overflow.supabase:true`, `auth.supabase:true`, `auth.supabaseEnv:true`, `books:63`,
> `/api/book/lunar-secret/toc` → 200 (39 chương), `/api/book/lunar-secret/chapter/1` → 200
> kèm nội dung. Nghĩa là **kho truyện đã sống lại**; việc còn thiếu là vá để **deploy lần
> sau không tái diễn** — chính là bản 1.16.1 này.

## 4. Đã vá gì trong 1.16.1

1. **`SUPABASE_URL` ghi thẳng vào `worker/wrangler.toml` `[vars]`** kèm cảnh báo “đừng xoá”.
   Đây là URL công khai (web cũng nhúng nó trong `cz-config.js`), không phải secret →
   ghi vào repo là đúng chỗ và không lộ gì thêm.
2. **Đường cứu hộ không cần deploy:** thiếu biến mà quản trị đã lưu **Project URL** ở
   `/admin` → Cài đặt & đồng bộ thì Worker tự dùng ghim đó cho **cả phần đọc/ghi overflow**
   (`sbPinUrl` / `resolveEnv` trong `worker/overflow.js`, dùng chung ghim với phần đăng nhập,
   cache 60 giây, chỉ nhận host `*.supabase.co|in|net`).
3. **Lỗi đọc bộ nói rõ thiếu biến nào:** 502 kèm `missing` (tên biến), `tried` (lý do từng
   đường: `supabase: HTTP 401 …`, `r2: không có khoá …`, `chưa cấu hình overflow nào — thiếu …`)
   và `hint` (2 cách chữa). Hết cảnh `"(overflow?)"`.
4. **`/toc` và `/chapter/<n>` phân biệt 404 với 502:** “chưa có bộ” → 404;
   “có bộ mà không đọc được” → 502. Bản 1.16.0 trả 404 cho cả hai.
5. **Chặn ghi đè khi chưa đọc được:** `PUT /api/book/<slug>/chapter`, `POST /api/lock/set`,
   import Blogger đều **502** thay vì coi bộ unreadable là “bộ chưa có” rồi ghi lại bộ rỗng
   (đây là đường mất trắng kho truyện nếu ai bấm Lưu trong lúc mất biến).
6. **`/api/health` tự chẩn đoán:** thêm `overflow.supabaseUrl`, `overflow.urlVia` (`env`/`kv`),
   `overflow.missing` — mở một cái là biết thiếu gì và URL đang lấy từ đâu.
7. **Vá phụ:** `npm run check:worker` đỏ khi `worker/cms.bundle.js` (tệp gộp do
   `npm run build:worker` sinh, không commit) đang tồn tại — `worker/jsconfig.json` nay
   `exclude` tệp đó. Đã đo: **trước vá exit 2 với 5 lỗi trong `cms.bundle.js`; sau vá exit 0**
   với cùng tệp gộp 194 KB trên đĩa.

## 5. Kiểm chứng

* `node tests/t_worker.mjs` — **394/394** kiểm tra đạt (thêm 21 kiểm tra mới ở mục
  *16. MẤT BIẾN SUPABASE_URL*: `wrangler.toml` có biến, cứu hộ bằng ghim KV cho
  `/toc` `/chapter` `/api/book`, 502 nêu tên biến, 404 vẫn đúng cho bộ không tồn tại,
  admin không ghi đè được bộ unreadable).
* Kiểm tra bài test **không rỗng**: chạy đúng bài đó trên code CHƯA vá → **16 kiểm tra đỏ**
  đúng như sự cố thật (`/toc` → 404 `chưa có dữ liệu cho khoá book:ovl-dead`,
  `/api/book` → 502 `không đọc được dữ liệu bộ (overflow?)`).
* `npm run check:worker` → exit 0 (kể cả khi `cms.bundle.js` đang tồn tại).
* `node tests/run.js` → **58/58 bài đạt**, exit 0 (`Tất cả bài kiểm thử đều đạt`).
  Lưu ý: báo cáo mới này phải có dòng chặn trong `_redirects` như mọi báo cáo nội bộ
  khác, nếu không `tools/check_secrets.js` đỏ (“tệp nội bộ ở thư mục gốc chưa bị
  `_redirects` chặn”) — đã thêm.
* Chạy thật Worker qua `tests/mock_worker.mjs 8791` (63 bộ nạp từ `data/`):
  `/api/health` → `"version": "1.16.1"` kèm `overflow.missing:["SUPABASE_URL","SUPABASE_SERVICE_ROLE"]`,
  `urlVia:""`; `/api/book/hometown-romance-special/toc` → 200 (10 chương);
  `/api/book/hometown-romance-special/chapter/1` → 200 (9.555 ký tự HTML);
  `/api/book/bo-khong-co/toc` → 404.

## 6. Việc vận hành rút ra (để không tái diễn)

1. **Mọi biến thường của Worker phải nằm trong `wrangler.toml`.** Dashboard chỉ dùng để
   chữa cháy; thêm biến mới mà chỉ bấm dashboard thì lần deploy sau mất.
2. **Secret thì dùng `wrangler secret put`** (wrangler giữ), không ghi vào repo.
3. **Sau mỗi lần deploy, mở `/api/health` và nhìn `overflow.supabase` + `auth.supabase`**,
   không chỉ nhìn `version`. Nay có thêm `overflow.missing` kể tên biến thiếu.
4. **Đừng bấm Lưu chương / import Blogger khi `/api/health` báo `overflow.supabase:false`** —
   1.16.1 đã chặn bằng 502, nhưng đừng dựa vào đó mà làm liều.
5. Dự phòng cuối cùng vẫn là `/data/book/*.json` trong GitHub: web tự rơi về đó khi Worker
   không đọc được, nên người đọc không thấy trang trắng — nhưng nội dung đứng yên.
