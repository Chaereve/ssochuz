# Kênh đăng + số liệu xếp hạng — Cloudflare Worker + KV (không cần GitHub build, không cần Firebase)

**Mục tiêu:** sửa truyện/chương trên web quản trị ⇒ người đọc thấy **ngay** (vài giây), không commit GitHub, không đợi Cloudflare build, không tốn phút CI.
Từ bản **1.4.0**: lượt đọc và bình chọn cũng nằm trên **KV** — **Firebase không còn cần nữa**.

```
Admin (admin.html)  ──PUT──▶  Worker (worker/cms.js)  ──▶  Cloudflare KV
                                      │                        │
   Web (index.html / truyen.html) ──GET──────────────────────────┘
                                      │
                                      ├─▶ Blogger feed   (số chương, tình trạng, ngày cập nhật, lịch ra chương)
                                      └─▶ KV `stats`     (lượt đọc + bình chọn, Worker tự đếm)
```

GitHub vẫn dùng để **chứa code** (muốn deploy code mới thì mới cần build); dữ liệu thì không đi qua GitHub nữa.

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
| GET | `/api/book/<slug>` | mở | tiêu đề + các chương của 1 bộ |
| GET | `/api/schedule` | mở | lịch ra chương |
| GET | `/api/stats` | mở | **lượt đọc/bình chọn từ KV** (tổng + hôm nay/tuần/tháng) |
| POST | `/api/view` | mở | đếm 1 lượt đọc `{slug, vid, ch}` |
| POST | `/api/vote` | mở | bầu/bỏ bầu `{slug, vote: 1|0, vid}` → trả số phiếu mới |
| PUT | `/api/registry` | cần khoá | ghi toàn bộ thư viện |
| PUT | `/api/book/<slug>` | cần khoá | ghi 1 bộ (thêm/sửa chương) |
| DELETE | `/api/book/<slug>` | cần khoá | xoá 1 bộ khỏi KV |
| POST | `/api/seed` | cần khoá | nạp hàng loạt `{registry, books}` |
| POST | `/api/sync` | cần khoá | đọc lại Blogger, ghép số chương/tình trạng/ngày |
| POST | `/api/import` | cần khoá | lấy 1 bài viết Blogger thành chương mới (bỏ quảng cáo/bình luận) |
| POST | `/api/stats/seed` | cần khoá | nạp số liệu cũ `{items:{slug:{views,votes}}}` |
| POST | `/api/stats/import-firebase` | cần khoá | tự kéo số cũ từ Firestore về KV (1 lần) |
| POST | `/api/stats/refresh` | cần khoá | ghi hết số đang đệm xuống KV |
| POST | `/api/auth/google` | cần GOOGLE_CLIENT_ID + SESSION_SECRET | đổi Google idToken → session token (HS256) |
| GET | `/api/auth/me` | có session | trả user từ session |
| GET | `/api/comments/<slug>` | mở | đọc bình luận công khai |
| POST | `/api/comments/<slug>` | cần đăng nhập | gửi bình luận (`Authorization: Bearer <session>`) |
| DELETE | `/api/comments/<slug>/<id>` | tác giả | xoá bình luận của chính mình |

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
# rồi mở http://127.0.0.1:8787/admin.html  → URL Worker: http://127.0.0.1:8787 → khoá: MOCK
```

Muốn thử cả đăng nhập Google ở máy: `GOOGLE_CLIENT_ID=... node tests/mock_worker.mjs 8787`
(nhớ thêm `http://127.0.0.1:8787` vào *Authorized JavaScript origins* trong Google Cloud Console).

Kiểm thử tự động cho worker (74 kiểm tra, không cần mạng):

```bash
node tests/t_worker.mjs        # hoặc: cd tests && node run.js  (chạy hết mọi bài)
```

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
| Đăng nhập Google báo *Invalid keyData* | worker đang chạy là **bản cũ** | dán lại `worker/cms.js` (bản 1.4.0) rồi Deploy |
| Đăng nhập Google báo *sai audience* | `GOOGLE_CLIENT_ID` trên Worker ≠ Client ID trong `cz-config.js` | sửa cho khớp 2 chỗ |
| Nút **Thích** báo *lưu trên máy bạn* | web không gọi được Worker (sai URL/CORS) | xem Console; đặt `ALLOW_ORIGIN` có domain web của bạn |
| Số liệu vẫn 0 sau khi có người đọc | chưa deploy bản 1.4.0, hoặc web gọi Worker khác | `/admin` → **Số liệu** → **Đọc lại**; `--stats` để xem KV |
| Trang chủ trắng sau khi sửa dữ liệu | 1 bộ bị sai định dạng JSON | admin → **Sao lưu** để có bản dự phòng, sửa lại bộ đó, hoặc **Phục hồi** từ file sao lưu |

Các file code (`cz-app.js`, `cz-home.js`, `cz-story.js`, `cz-config.js`, `cz.css`, `admin.js`) được đặt
`Cache-Control: no-cache` trong `_headers`, nên sửa file nào rồi deploy lại là máy người dùng nhận bản mới ngay.
Dữ liệu `/data/*.json` để cache ngắn (5 phút, riêng `data/book/*` 1 phút) vì dữ liệu đã đi qua KV.

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

**Lưu ý:** bình luận là công khai, mỗi user chỉ xoá được bình luận của mình; bản này chưa có kiểm duyệt/admin xoá.
