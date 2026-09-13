# Hướng dẫn: Bình luận & Đăng nhập Google cho người dùng

*Cập nhật: 2026-09-13 · áp dụng cho `worker/cms.js` v1.2.0 + `cz-auth.js` / `cz-story.js` mới.*

Tính năng **Đăng nhập Google** và **Bình luận** đã được viết sẵn trong code. Để chúng **thực sự chạy**, bạn chỉ cần làm 3 việc thủ công (khoảng 15–20 phút):

1. Tạo **Google OAuth Client ID** (Web).
2. Thêm 2 **biến môi trường (secret)** vào Worker.
3. **Deploy lại** Worker + frontend.

Dưới đây từng bước. Làm xong là người đọc bấm "Đăng nhập Google" → chọn tài khoản → gửi bình luận, bình luận lưu chung trên Cloudflare KV (nhìn thấy trên mọi thiết bị).

---

## 1. Tạo Google OAuth Client ID

1. Vào <https://console.cloud.google.com/apis/credentials>.
2. (Lần đầu) Chọn hoặc tạo một dự án Google Cloud.
3. Bấm **Tạo thông tin xác thực → ID khách hàng OAuth (OAuth client ID)**.
4. Loại ứng dụng: **Ứng dụng web (Web application)**.
5. **Tên**: tuỳ ý, ví dụ `chuseoz-web`.
6. **Nguồn JavaScript được phép (Authorized JavaScript origins)** — thêm domain web của bạn, **phải là https**:
   - `https://chuseoz.pages.dev` (nếu dùng Cloudflare Pages mặc định)
   - `https://tên-miền-của-bạn` (nếu đã gắn domain riêng)
   - Để thử trên máy: thêm `http://localhost` (Google cho phép localhost dù không phải https).
7. **URI chuyển hướng được phép**: để trống (ta dùng Google Identity Services, không cần redirect).
8. Bấm **Tạo** → copy **Client ID** dạng `....apps.googleusercontent.com`.

> Màn hình đồng ý (OAuth consent screen): vào **OAuth consent screen**, điền tên ứng dụng + email liên hệ.
> Nếu để trạng thái **Testing**, bạn phải thêm Google account của mình vào **Người dùng thử nghiệm (Test users)**,
> nếu không khi bấm đăng nhập sẽ báo "chưa cấp quyền". Khi đã ổn định, bấm **Publish** (trạng thái sản xuất) để mọi người vào được.

---

## 2. Điền Client ID vào web

Mở file `cz-config.js` (gốc repo), sửa dòng:

```js
window.CZ_GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';   // để '' sẽ tắt đăng nhập Google
```

Thay `YOUR_CLIENT_ID...` bằng Client ID vừa copy. Để `''` thì nút sẽ báo rõ "chưa cấu hình" (không còn giả lập local nữa).

---

## 3. Thêm secret cho Worker

Vào Cloudflare → **Workers & Pages → Worker `chuseoz-cms` → Settings → Variables and Secrets**:

| Biến | Loại | Giá trị |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Secret hoặc biến | **cùng** Client ID ở bước 2 (Worker dùng để kiểm tra `aud` của idToken) |
| `SESSION_SECRET` | **Secret** | một chuỗi ngẫu nhiên ≥ 32 ký tự, ví dụ chạy `openssl rand -hex 32` |

Hoặc bằng dòng lệnh (nếu đã có `wrangler`):

```bash
npx wrangler secret put GOOGLE_CLIENT_ID      # dán Client ID
npx wrangler secret put SESSION_SECRET        # dán chuỗi ngẫu nhiên ≥ 32 ký tự
```

> `SESSION_SECRET` là khoá ký session bình luận. Giữ kín, đừng đưa vào code. Đổi nó sẽ bắt toàn bộ người dùng đăng nhập lại (session cũ hết hiệu lực).

---

## 4. Deploy lại Worker (đã có code mới)

Code Worker mới nằm ở `worker/cms.js` (v1.2.0, đã thêm API xác thực + bình luận). Deploy lên **cùng** Worker đang trỏ `CZ_API`:

- **Cách dashboard**: mở `worker/cms.js` → dán toàn bộ nội dung → **Deploy**.
- **Cách dòng lệnh**: `npx wrangler deploy` (từ gốc repo, cần `wrangler.toml` đã khai KV).

Sau khi deploy, kiểm tra nhanh:

```bash
curl "https://chuseoz-cms.kimtong1906.workers.dev/api/health"   # version phải là 1.2.0
```

> Nếu bạn dùng Worker khác (không phải `kimtong1906`), hãy cập nhật `window.CZ_API` trong `cz-config.js`
> cho trỏ đúng Worker mới, rồi deploy lại frontend.

---

## 5. Deploy lại frontend

Deploy các file đã đổi lên Cloudflare Pages (GitHub → build như bình thường):
`cz-config.js`, `cz-auth.js`, `cz-story.js`, `cz.css`.

`_headers` đã đặt `Cache-Control: no-cache` cho mấy file này nên người dùng nhận bản mới ngay.

---

## 6. Thử nghiệm

1. Mở một truyện → tab **Đánh giá**.
2. Bấm **Đăng nhập Google** → chọn tài khoản → ô nhập bình luận hiện ra (có avatar + nút Gửi).
3. Gửi một bình luận → nó hiện ngay, số trên tab "Đánh giá" tăng lên.
4. F5 trang → bình luận vẫn còn (lưu trên KV, không phải trên máy).
5. Tự bấm **✕** trên bình luận của mình → xoá được. Bình luận của người khác không có nút ✕.

---

## Cách hoạt động (để bạn yên tâm)

```
Trình duyệt (cz-auth.js)
  └─ Google Identity Services → idToken (JWT, ký bằng khoá của Google)
        └─ POST /api/auth/google ─▶ Worker
                                      ├─ xác thực chữ ký bằng khoá công khai Google (cache 1h)
                                      ├─ kiểm tra aud == GOOGLE_CLIENT_ID, iss, exp
                                      └─ cấp session token (HS256, ký bằng SESSION_SECRET)
        └─ lưu session token vào localStorage
Gửi bình luận:
  └─ POST /api/comments/<slug>  kèm header  Authorization: Bearer <session>
        └─ Worker kiểm tra session → lưu vào KV (khoá cmt:<slug>, mới nhất ở đầu, tối đa 500/bộ)
Đọc bình luận:
  └─ GET /api/comments/<slug>  (công khai, không cần đăng nhập)
```

### API mới trên Worker (v1.2.0)

| Method | Đường dẫn | Việc |
|---|---|---|
| POST | `/api/auth/google` | đổi Google idToken → session token (cần `GOOGLE_CLIENT_ID`, `SESSION_SECRET`) |
| GET | `/api/auth/me` | trả về user từ session (dùng làm mới thông tin) |
| GET | `/api/comments/<slug>` | danh sách bình luận (công khai) |
| POST | `/api/comments/<slug>` | gửi bình luận (cần đăng nhập) |
| DELETE | `/api/comments/<slug>/<id>` | xoá bình luận (chỉ tác giả) |

---

## Lưu ý & mở rộng

- **Moderation**: bản này chưa có kiểm duyệt/xoá bởi admin. Nếu cần admin xoá bình luận vi phạm,
  có thể thêm header `X-Admin-Key` vào worker và cho phép admin xoá — báo mình để bổ sung.
- **Chống spam**: chưa giới hạn tần suất. Với lưu lượng nhỏ thì ổn; nếu bị spam, mình có thể thêm
  giới hạn mỗi user (ví dụ 1 bình luận/10s) trong `postComment`.
- **Nút Thích**: vẫn lưu **trên máy từng người** (localStorage), chưa đồng bộ chung. Nâng cấp thành
  lưu chung qua Worker tương tự bình luận được (có thể làm sau).
- **Đăng nhập Google yêu cầu HTTPS**: không chạy được trên `file://`. Dùng domain thật hoặc `localhost` khi test.
- **ALLOW_ORIGIN**: nếu bạn đặt domain cụ thể (không dùng `*`), nhớ thêm domain web vào biến đó,
  nếu không trình duyệt bị chặn CORS khi gọi API.

---

## Nếu gặp trục trặc

| Hiện tượng | Nguyên nhân | Sửa |
|---|---|---|
| Bấm đăng nhập báo "Chưa cấu hình Google Client ID" | `CZ_GOOGLE_CLIENT_ID` để trống | điền Client ID (bước 2) |
| Báo "xác thực Google thất bại: idToken sai audience" | `GOOGLE_CLIENT_ID` trên Worker khác với Client ID web | điền **cùng** một Client ID vào cả 2 nơi |
| Báo "Worker chưa đặt secret SESSION_SECRET" | thiếu biến môi trường | thêm `SESSION_SECRET` (bước 3) + deploy lại |
| Ô Đánh giá báo "Chưa nối Worker" | `CZ_API` trống/sai | điền `window.CZ_API` đúng Worker |
| Đăng nhập hiện "chưa cấp quyền cho app này" | OAuth consent đang Testing, chưa thêm bạn vào Test users | thêm tài khoản vào Test users hoặc Publish |
| Bình luận không hiện sau F5 | chưa deploy Worker mới / KV chưa gắn | deploy `cms.js` v1.2.0, kiểm tra `CZ_KV` |
