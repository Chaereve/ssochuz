# Kênh đăng mới — Cloudflare Worker + KV (bỏ GitHub build)

**Mục tiêu:** sửa truyện/chương trên web quản trị ⇒ người đọc thấy **ngay** (vài giây), không commit GitHub, không đợi Cloudflare build, không tốn phút CI.

```
Admin (admin.html)  ──PUT──▶  Worker (worker/cms.js)  ──▶  Cloudflare KV
                                      │                        │
   Web (index.html / truyen.html) ──GET──────────────────────────┘
                                      │
                                      ├─▶ Blogger feed   (số chương, tình trạng, ngày cập nhật, lịch ra chương)
                                      └─▶ Firebase       (views/votes thật, cache 10 phút)
```

GitHub vẫn dùng để **chứa code** (muốn deploy code mới thì mới cần build); dữ liệu thì không đi qua GitHub nữa.

**Worker v1.1.0 — danh sách API** (đây là những gì bản này hỗ trợ, không hơn):

| Method | Đường dẫn | Ai gọi | Việc |
|---|---|---|---|
| GET | `/api/health` | mở | phiên bản, KV có sẵn không, số bộ, rev, lần ghi cuối |
| GET | `/api/whoami` | cần khoá | kiểm tra `ADMIN_KEY` đúng hay sai |
| GET | `/api/registry` | mở | toàn bộ thư viện (62 bộ + slides + lịch + series) |
| GET | `/api/book/<slug>` | mở | tiêu đề + các chương của 1 bộ |
| GET | `/api/schedule` | mở | lịch ra chương |
| GET | `/api/stats` | mở | views/votes thật từ Firebase (cache 10 phút) |
| PUT | `/api/registry` | cần khoá | ghi toàn bộ thư viện |
| PUT | `/api/book/<slug>` | cần khoá | ghi 1 bộ (thêm/sửa chương) |
| DELETE | `/api/book/<slug>` | cần khoá | xoá 1 bộ khỏi KV |
| POST | `/api/seed` | cần khoá | nạp hàng loạt `{registry, books}` |
| POST | `/api/sync` | cần khoá | đọc lại Blogger, ghép số chương/tình trạng/ngày |
| POST | `/api/import` | cần khoá | lấy 1 bài viết Blogger thành chương mới (bỏ quảng cáo/bình luận) |
| POST | `/api/stats/refresh` | cần khoá | xoá cache số liệu để đọc lại ngay |
| POST | `/api/auth/google` | cần GOOGLE_CLIENT_ID + SESSION_SECRET | đổi Google idToken → session token (HS256) |
| GET  | `/api/auth/me`      | có session | trả user từ session (làm mới thông tin) |
| GET  | `/api/comments/<slug>` | mở | đọc bình luận công khai |
| POST | `/api/comments/<slug>` | cần đăng nhập | gửi bình luận (gửi kèm `Authorization: Bearer <session>`) |
| DELETE | `/api/comments/<slug>/<id>` | tác giả | xoá bình luận của chính mình |

## 1. Tạo Worker (5 phút, làm 1 lần)

**Cách A — dán trên dashboard (không cần cài gì):**

1. Vào <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Worker** → đặt tên `chuseoz-cms` → **Deploy**.
2. **Edit code** → xoá hết code mẫu → dán toàn bộ nội dung `worker/cms.js` → **Deploy**.
3. Vào tab **Settings** → **Variables and Secrets**:
   - `ADMIN_KEY` (chọn **Secret**) — đặt một chuỗi dài, ví dụ 40 ký tự ngẫu nhiên. Đây là mật khẩu để ghi dữ liệu.
   - `BLOG` = `https://chuseoz.blogspot.com`
   - `FIREBASE_PROJECT` = `chuseoz-library`
   - `ALLOW_ORIGIN` = `*` (hoặc domain web của bạn, cách nhau bằng dấu phẩy)
4. Tab **Bindings** → **Add** → **KV namespace** → **Create new namespace** tên `chuseoz-kv` → **Variable name**: `CZ_KV` → Save → Deploy lại.
5. Ghi lại URL Worker, dạng `https://chuseoz-cms.<tên-tài-khoản>.workers.dev`.

**Cách B — bằng dòng lệnh (nếu đã có Node + wrangler):**

```bash
npx wrangler kv namespace create CZ_KV        # dán id vào worker/wrangler.toml
npx wrangler secret put ADMIN_KEY             # nhập mật khẩu
npx wrangler deploy
```

## 2. Nạp dữ liệu hiện có lên KV (1 lần)

> **Không biết chạy lệnh?** Bỏ qua cả mục này — mở `https://<web-của-bạn>/admin`, dán URL Worker + `ADMIN_KEY`,
> bấm **Kiểm tra & kết nối**, rồi bấm **↑ Nạp dữ liệu lên KV**. Nút này làm y hệt lệnh bên dưới
> (đọc `data/registry.json` + 62 bộ trong `data/book/`, đẩy lên KV, có thanh tiến trình `12/62`).
> Lệnh dòng lệnh chỉ dành cho ai thích chạy trên máy.

```bash
python3 tools/push_to_kv.py --api https://chuseoz-cms.xxx.workers.dev --key "$ADMIN_KEY"
```

Lệnh này đẩy `data/registry.json` + toàn bộ `data/book/*.json` (khoảng 27 MB) lên KV theo lô 8 bộ.

```bash
python3 tools/push_to_kv.py --api https://... --health     # Worker có sống không, KV đã có gì
python3 tools/push_to_kv.py --api https://... --key "$ADMIN_KEY" --auth   # khoá có đúng không
python3 tools/push_to_kv.py --api https://... --key "$ADMIN_KEY" --verify # so từng bộ: KV vs repo
```

`--verify` in ra từng bộ lệch số chương giữa KV và repo — chạy sau khi nạp để chắc chắn không thiếu bộ nào.

Không có Python cũng không sao: trong trang quản trị đã có nút **Nạp toàn bộ lên KV** làm đúng việc này.

### Nếu muốn chạy lệnh trên máy — từng bước

1. **Cài Python 3** (nếu chưa có): tải ở <https://www.python.org/downloads/> → khi cài nhớ tích **Add python.exe to PATH**.
2. **Lấy code về máy**: trên GitHub mở repo → nút **Code** → **Download ZIP** → giải nén
   (hoặc `git clone https://github.com/Chaereve/ssochuz.git` nếu đã có Git).
3. **Mở cửa sổ lệnh ngay trong thư mục vừa giải nén**:
   - Windows: mở thư mục trong File Explorer → bấm vào thanh địa chỉ → gõ `cmd` → Enter.
   - macOS: chuột phải thư mục → **Services** → **New Terminal at Folder**.
4. **Dán lệnh** (thay URL Worker của bạn và mật khẩu `ADMIN_KEY` bạn đã đặt ở bước 1):

   ```bash
   # Windows (cmd)
   python tools\push_to_kv.py --api https://chuseoz-cms.xxx.workers.dev --key "mật-khẩu-của-bạn"

   # macOS / Linux
   python3 tools/push_to_kv.py --api https://chuseoz-cms.xxx.workers.dev --key "mật-khẩu-của-bạn"
   ```

5. **Dấu hiệu thành công** — in ra 8 dòng `lô 8 bộ -> 200 ...` và kết thúc bằng:

   ```
   registry + 6 bộ cuối -> 200 {"ok": true, "books": 6, "failed": [], "registry": true}
   tổng dữ liệu đẩy lên: 26.0 MB
   {'ok': True, 'kv': True, 'books': 62, 'regRev': '2026-09-12b', ...}
   ```

   Con số phải là **`books: 62`**. Nếu thấy `401` → sai/thiếu `ADMIN_KEY`; nếu `kv: False` → chưa bind KV với tên `CZ_KV`.

6. **Kiểm tra lại**: `--verify` in `xong — 0 bộ lệch`. Sau khi nạp, mới cần dán URL Worker vào `cz-config.js` (mục 3).

### Thử toàn bộ kênh đăng trước khi lên Cloudflare

Muốn xem tận mắt nút *Nạp dữ liệu lên KV* / *Đăng chương nhanh* hoạt động ra sao mà chưa cần tạo Worker:

```bash
node tests/mock_worker.mjs 8787          # cần Node.js, không cần cài gì thêm
# rồi mở http://127.0.0.1:8787/admin.html  → URL Worker: http://127.0.0.1:8787 → khoá: MOCK
```

Dữ liệu ghi vào RAM của tiến trình đó, tắt là hết — Cloudflare thật không bị ảnh hưởng.

## 3. Nối web vào Worker (1 dòng duy nhất)

Mở file **`cz-config.js`** ở gốc repo, dán URL Worker vào:

```js
window.CZ_API = 'https://chuseoz-cms.xxx.workers.dev';   // để '' nếu chưa dùng Worker
window.CZ_STATS_DIRECT = true;                            // thử đọc số liệu Firebase trực tiếp
```

File này được **cả 3 trang** (`index.html`, `truyen.html`, `admin.html`) nạp sẵn — sửa một chỗ là toàn web đổi kênh:

- **Có** `CZ_API` → web đọc dữ liệu từ KV (luôn mới, sửa là thấy ngay, không cần deploy lại).
- Dán URL kiểu nào cũng được — `chuseoz-cms.xxx.workers.dev`, `https://chuseoz-cms.xxx.workers.dev`
  hay thừa dấu `/` ở cuối đều tự chuẩn hoá. **Đừng quên `https://`** nếu bạn tự sửa chỗ khác:
  thiếu nó, trình duyệt coi URL là đường dẫn trong web và web sẽ lặng lẽ quay về dữ liệu tĩnh.
- **Không có / Worker lỗi** → web tự lùi về file `/data/*.json` như cũ (không bao giờ trắng trang).

Trang quản trị: mở `/admin`, mục **Kênh đăng bài** → dán URL Worker + `ADMIN_KEY` → **Kiểm tra & kết nối**
(khoá chỉ lưu trong localStorage của máy bạn). Vào được rồi thì:

- **Nạp dữ liệu lên KV** — bấm 1 lần để đưa 62 bộ hiện có trong repo lên KV (hoặc chạy `tools/push_to_kv.py`).
- **Đồng bộ từ Blogger** — đọc lại blogspot để cập nhật tình trạng/số chương/ngày/lịch ra chương.
- **Lưu** — ghi thẳng lên KV, người đọc thấy sau 1–2 giây.
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

Nhờ vậy quy trình quen thuộc của bạn vẫn giữ nguyên: viết bài trên Blogger → vào `/admin` → bấm 1 nút.

Trong tab **Sửa truyện** còn có: đổi thứ tự chương (↑ ↓), sửa/xoá từng chương (✎), *Văn bản → HTML*,
xem trước, và `Ctrl+S` để lưu nhanh.

## 4. Những việc làm được sau khi nối

| Việc | Cách làm | Thời gian thấy trên web |
|---|---|---|
| Sửa thông tin 1 bộ (tình trạng, số chương, bìa, mô tả, 18+) | admin → **Lưu** | vài giây |
| Sửa nội dung chương | admin → **Nội dung** → Lưu | vài giây |
| Thêm bộ mới | admin → **Thêm bộ** | vài giây |
| Cập nhật số chương/tình trạng/ngày từ blogspot | admin → **Đồng bộ Blogger** (hoặc `--sync`) | vài giây |
| Số liệu thật (views/votes) | Worker tự lấy từ Firebase, cache 10 phút | 10 phút |
| Lịch ra chương | Worker đọc trang `/p/lich-ra-chuong.html` | 30 phút |
| Deploy **code** mới (giao diện) | vẫn qua GitHub → Cloudflare Pages | chỉ khi cần |

## 5. Số liệu thật từ Firebase (không còn số bịa)

Site cũ (`chuseoz-library`) lưu views/votes trong Firestore collection `novelData`. Hiện đọc công khai đang bị **403**, nên vào
<https://console.firebase.google.com/project/chuseoz-library/firestore/rules> dán rules sau rồi **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /novelData/{doc} {
      allow read: if true;                 // cho web đọc số liệu
      allow write: if request.auth != null; // chỉ tài khoản đã đăng nhập mới ghi
    }
    match /voters/{doc} { allow read, write: if request.auth != null; }
    match /users/{doc}  { allow read, write: if request.auth != null; }
  }
}
```

Worker sẽ tự gom lại thành `GET /api/stats` (cache 10 phút). Nếu Firebase vẫn chặn, web **không hiện số nào cả**
(chứ không bịa số) — bảng xếp hạng khi đó tự xếp theo số chương + ngày cập nhật và ghi rõ nguồn.

Sau khi Publish rules, vào `/admin` → **Số liệu** → **Đọc lại & xoá cache** để thấy số ngay, không phải chờ 10 phút.

## 5b. Khi có trục trặc

| Hiện tượng | Nguyên nhân thường gặp | Cách sửa |
|---|---|---|
| admin báo *Không nối được: ADMIN_KEY không đúng* | chưa đặt secret `ADMIN_KEY`, hoặc gõ sai khoá | Settings → Variables and Secrets → đặt lại `ADMIN_KEY` (Secret) rồi Deploy |
| admin báo *KV chưa gắn* | chưa bind namespace | Settings → Bindings → KV namespace, **Variable name** phải đúng chữ `CZ_KV` |
| Lưu xong nhưng web vẫn dữ liệu cũ | chưa dán URL Worker vào `cz-config.js` | dán `window.CZ_API = 'https://...'` rồi deploy lại **một lần** (sau đó sửa dữ liệu không cần deploy nữa) |
| Bấm “Đọc lại & xoá cache” mà vẫn 0 số | Firebase còn chặn quyền đọc | làm lại mục 5, kiểm tra bằng cách mở thẳng link Firestore REST |
| Trang chủ trắng sau khi sửa dữ liệu | 1 bộ bị sai định dạng JSON | admin → **Sao lưu** để có bản dự phòng, sửa lại bộ đó, hoặc **Phục hồi** từ file sao lưu |

Các file code (`cz-app.js`, `cz-home.js`, `cz-story.js`, `cz-config.js`, `cz.css`, `admin.js`) được đặt
`Cache-Control: no-cache` trong `_headers`, nên sửa file nào rồi deploy lại là máy người dùng nhận bản mới ngay,
không bị giữ bản cũ trong cache. Dữ liệu `/data/*.json` để cache ngắn (5 phút, riêng `data/book/*` 1 phút)
vì dữ liệu đã đi qua KV.

## 6. Bảo mật

- `ADMIN_KEY` chỉ nằm trong localStorage của trình duyệt bạn và trong secret của Worker — **không** nằm trong code.
- Nếu lộ, đổi secret là xong (`Settings → Variables and Secrets`), hoặc tạo lại Worker.
- Nên đặt `ALLOW_ORIGIN` = domain web của bạn để người khác không gọi API từ site lạ.
- Muốn khoá đọc công khai? Đặt `READ_KEY` và thêm header khi gọi — hiện tại dữ liệu là nội dung công khai nên để mở.

## 7. Bình luận & đăng nhập Google (người dùng)

Từ v1.2.0, web có **đăng nhập Google thật** (Google Identity Services) và **bình luận lưu chung trên KV**.
Không còn giả lập local — nút Đăng nhập chỉ bật khi đã cấu hình đủ.

**Biến môi trường thêm (Settings → Variables and Secrets):**

| Biến | Loại | Dùng để |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Secret/biến | Client ID OAuth Web app — Worker kiểm tra `aud` của idToken |
| `SESSION_SECRET` | **Secret** | ký session token bình luận (HS256), ≥ 32 ký tự |

**Phía web (`cz-config.js`):**

```js
window.CZ_GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';   // để '' tắt đăng nhập
```

**Quy trình xác thực:** trình duyệt lấy idToken từ Google → `POST /api/auth/google` → Worker xác thực chữ ký
bằng khoá công khai Google (cache 1h) + kiểm tra `aud`/`iss`/`exp` → cấp session token → lưu localStorage.
Gửi bình luận kèm header `Authorization: Bearer <session>`. Chi tiết từng bước (tạo Client ID, consent screen,
test) xem **`HUONG-DAN-DANG-NHAP-BINH-LUAN.md`** ở gốc repo.

**Lưu ý:** bình luận là công khai, mỗi user chỉ xoá được bình luận của mình; bản này chưa có kiểm duyệt/admin xoá
và chưa giới hạn tần suất (thêm sau nếu cần). Đăng nhập Google yêu cầu HTTPS (localhost được phép khi test).
