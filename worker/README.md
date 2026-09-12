# Kênh đăng mới — Cloudflare Worker + KV (bỏ GitHub build)

**Mục tiêu:** sửa truyện/chương trên web quản trị ⇒ người đọc thấy **ngay** (vài giây), không commit GitHub, không đợi Cloudflare build, không tốn phút CI.

```
Admin (admin.html)  ──PUT──▶  Worker (worker/cms.js)  ──▶  Cloudflare KV
                                      │                        │
   Web (index.html / reader.html) ──GET──────────────────────────┘
                                      │
                                      ├─▶ Blogger feed   (số chương, tình trạng, ngày cập nhật, lịch ra chương)
                                      └─▶ Firebase       (views/votes thật, cache 10 phút)
```

GitHub vẫn dùng để **chứa code** (muốn deploy code mới thì mới cần build); dữ liệu thì không đi qua GitHub nữa.

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

```bash
python3 tools/push_to_kv.py --api https://chuseoz-cms.xxx.workers.dev --key "$ADMIN_KEY"
```

Lệnh này đẩy `data/registry.json` + toàn bộ `data/book/*.json` (khoảng 27 MB) lên KV theo lô 8 bộ.
Kiểm tra: `python3 tools/push_to_kv.py --api ... --health`.

## 3. Nối web vào Worker (1 dòng duy nhất)

Mở file **`cz-config.js`** ở gốc repo, dán URL Worker vào:

```js
window.CZ_API = 'https://chuseoz-cms.xxx.workers.dev';   // để '' nếu chưa dùng Worker
window.CZ_STATS_DIRECT = true;                            // thử đọc số liệu Firebase trực tiếp
```

File này được **cả 4 trang** (`index.html`, `reader.html`, `admin.html`) nạp sẵn — sửa một chỗ là toàn web đổi kênh:

- **Có** `CZ_API` → web đọc dữ liệu từ KV (luôn mới, sửa là thấy ngay, không cần deploy lại).
- **Không có / Worker lỗi** → web tự lùi về file `/data/*.json` như cũ (không bao giờ trắng trang).

Trang quản trị: mở `/admin`, mục **Kênh đăng bài** → dán URL Worker + `ADMIN_KEY` → **Kiểm tra & vào quản trị**
(khoá chỉ lưu trong localStorage của máy bạn). Vào được rồi thì:

- **Nạp dữ liệu lên KV** — bấm 1 lần để đưa 62 bộ hiện có trong repo lên KV (hoặc chạy `tools/push_to_kv.py`).
- **Đồng bộ từ Blogger** — đọc lại blogspot để cập nhật tình trạng/số chương/ngày/lịch ra chương.
- **Lưu** — ghi thẳng lên KV, người đọc thấy sau 1–2 giây.
- **Sao lưu / Phục hồi** — tải hoặc nạp lại toàn bộ dữ liệu bằng 1 file JSON.

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

Worker sẽ tự gom lại thành `GET /api/stats`. Nếu Firebase vẫn chặn, web **không hiện số nào cả** (chứ không bịa), và
bạn có thể tự nạp số liệu thật bằng `PUT /api/stats`.

## 6. Bảo mật

- `ADMIN_KEY` chỉ nằm trong localStorage của trình duyệt bạn và trong secret của Worker — **không** nằm trong code.
- Nếu lộ, đổi secret là xong (`Settings → Variables and Secrets`), hoặc tạo lại Worker.
- Nên đặt `ALLOW_ORIGIN` = domain web của bạn để người khác không gọi API từ site lạ.
- Muốn khoá đọc công khai? Đặt `READ_KEY` và thêm header khi gọi — hiện tại dữ liệu là nội dung công khai nên để mở.
