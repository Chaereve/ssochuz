# Báo cáo 16/09 — vá hẳn lỗi đăng nhập My Space + đánh giá sao, và soát "lòi ra ngoài" cho trang lẫn trang quản trị

Tóm tắt một câu: **đã tìm ra đúng căn bệnh khiến "đăng nhập xong vẫn bị lỗi" và "đánh giá sao
không lưu được" (Worker không xác thực được token Supabase đời mới — ký ES256), sửa cả hai đầu
Worker lẫn web kèm đường chữa không cần deploy lại, vá thêm một loạt điểm giao diện bị tràn/lòi
ở trang đọc, My Space và trang quản trị; toàn bộ 41 bài kiểm thử đạt.**

Trạng thái kiểm thử sau khi xong: **`node tests/run.js` → Tất cả bài kiểm thử đều đạt**
(thêm bài mới `t_auth_flow.js`; `t_worker.mjs` tăng lên **250/250** phép kiểm — thêm nhóm
*supabase-ES256 + ghim project*).

> ## ⚡ VIỆC CẦN LÀM NGAY SAU KHI MERGE (2 phút — không làm thì đăng nhập vẫn lỗi)
>
> 1. **Deploy lại Worker**: dán `worker/cms.js` (bản **1.9.8**) vào Cloudflare → Workers →
>    `chuseoz-cms` → Deploy (hoặc `npx wrangler deploy`). Kiểm tra: `https://chuseoz-cms.kimtong1906.workers.dev/api/health`
>    phải trả `"version":"1.9.8"`.
> 2. **Ghim project Supabase** — chọn 1 trong 2 cách (cách B không cần deploy lại):
>    - **Cách A**: Cloudflare → Workers → chuseoz-cms → Settings → Variables and Secrets → thêm
>      biến `SUPABASE_URL` = `https://hnyzrkdlmvelbgcowztk.supabase.co` (đây là URL công khai,
>      đang nằm sẵn trong `cz-config.js`).
>    - **Cách B**: mở `/admin` → **Cài đặt & đồng bộ** → mục **Đăng nhập người đọc (Supabase)** →
>      điền **Project URL** + **anon key** (copy từ `cz-config.js`) → **Lưu**. Worker tự đọc ghim
>      từ KV, **không cần deploy lại**.
> 3. Mở `/admin` → tab Cài đặt → bấm **Hỏi Worker** — phải thấy **"Supabase: sẵn sàng"**. Sau đó
>    đăng nhập thử ở `/my-space`: My Space mở tủ truyện, đánh giá sao lưu được, bình luận chạy.

---

## 1. Đăng nhập My Space "lỗi nghiêm trọng" — nguyên nhân thật và cách vá

### 1.1 Đã soi tận đâu ra tận đó (bằng chứng)

| Phép soát | Kết quả |
| --- | --- |
| `GET /auth/v1/authorize?provider=google&redirect_to=https://ssochuz.pages.dev/my-space` | **Đi thẳng tới trang chọn tài khoản Google** ⇒ Google provider đã bật, redirect URL đã cho phép, PKCE chạy đúng — nửa đầu luồng đăng nhập khoẻ mạnh |
| `GET https://hnyzrkdlmvelbgcowztk.supabase.co/auth/v1/.well-known/jwks.json` | Trả **khoá EC P-256 / ES256** ⇒ project ký access_token bằng **cặp khoá bất đối xứng** (hệ khoá public mới `sb_publishable_…`) |
| `GET /api/health` của Worker | `auth: { supabase:false, supabaseUrl:"", supabaseHs256:true }` ⇒ Worker **chỉ** đặt `SUPABASE_JWT_SECRET`, **không có** Project URL |
| `GET /api/registry` → `settings.auth` | Chỉ có `{"provider":"supabase"}` — chưa lưu Project URL/anon key trên KV |

### 1.2 Vậy bệnh chạy thế nào?

1. Người đọc bấm **Đăng nhập** → Google OK → Supabase trả phiên với token ký **ES256**.
2. Web gửi token đó tới `POST /api/auth/supabase` để đổi session của Worker.
3. Worker bản cũ chỉ biết verify **HS256 bằng JWT secret** — gặp token `alg: ES256` là **từ chối (401)**.
4. Web lặng lẽ giữ phiên "dự phòng" bằng token thô → tên/ảnh vẫn hiện (tưởng đã đăng nhập), nhưng
   **mọi** lệnh cần phiên đều bị Worker từ chối 401:
   - My Space: `GET /api/me/space` → *"Vui lòng đăng nhập lại."* → **"lỗi nghiêm trọng, không hoạt động"**;
   - **Đánh giá sao** (gửi kèm phiên đăng nhập): `POST /api/rate` → 401 → *"Chưa lưu được…"*;
   - Bình luận bằng tài khoản, mở quyền quản trị — cùng bệnh một nhà.

   ⇒ Giải thích trọn vẹn cả 2 lời báo của chủ trang: *My Space lỗi nghiêm trọng* và *rating sao
   không hoạt động* (khách chưa đăng nhập thì rating vốn chạy được; lỗi nằm ở người đã đăng nhập).

### 1.3 Đã vá (Worker 1.9.8)

| # | Việc | Chi tiết |
| --- | --- | --- |
| 1 | **Worker tự "ghim" project Supabase** | `supabasePin()`: lấy Project URL theo thứ tự — biến `SUPABASE_URL` trên Worker → Project URL quản trị lưu trong KV (`registry.settings.auth.supabaseUrl`). Token **ES256/RS256** được verify bằng **JWKS của đúng project đã ghim**; đường HS256 giữ nguyên cho project cũ |
| 2 | **Đổi ghim không cần deploy** | Lưu ở `/admin` là Worker dùng ngay (cache ghim tự xoá sau mỗi lần Lưu registry, TTL 60 giây). `/api/health` + `/api/auth/config` trả `supabaseEnv` / `supabaseKv` để biết ghim đang lấy từ đâu |
| 3 | **Vẫn giữ nguyên tắc an ninh** | Không ghim project nào cả → từ chối **rõ ràng** (kèm hướng dẫn 2 cách ghim). Worker cố tình KHÔNG chấp nhận "project nào cũng được": nếu thế thì kẻ xấu tự tạo project Supabase riêng, tự ký token mang **email quản trị** là lên được quyền admin. Sai issuer → 401 nêu cả hai URL như cũ |
| 4 | **401 của My Space nói đúng bệnh** | `GET /api/me/space` trả kèm lý do thật (hết hạn / Worker chưa ghim…) + `hint` cho chủ trang, thay cho câu "Vui lòng đăng nhập lại." chung chung |
| 5 | **Web bớt "im lặng lạ thường"** | `cz-auth.js`: lý do đổi-token thất bại được ghi vào `CZ_AUTH._verify`; ngay khi quay về từ Google mà Worker từ chối thì hiện toast rõ ràng một lần duy nhất (không spam mỗi lần mở trang) |

### 1.4 Đã vá (web — `cz-auth.js`, `cz-space.js`)

| # | Lỗi | Vá thế nào |
| --- | --- | --- |
| 6 | **Link đăng nhập qua email không bao giờ có hiệu lực**: Supabase trả về `?token_hash=…&type=magiclink` nhưng web không gọi `verifyOtp` — bấm link xong vẫn như chưa đăng nhập; F5 còn báo "link hết hiệu lực" vì `token_hash` không bao giờ được dọn khỏi URL | Thêm `consumeMagicLink()`: đổi `token_hash` lấy phiên trước khi đọc session; `cleanURL()` giờ xoá cả `token_hash` + `type` |
| 7 | My Space lỗi phiên thì người dùng bí: chỉ có nút "Thử lại" (thử lại vẫn lỗi) | Thêm nút **"Đăng xuất & đăng nhập lại"** ngay dưới thông báo lỗi + kèm lý do thật từ Worker; phiên dự phòng vẫn giữ tên/ảnh nên không "văng" ra khách đột ngột |
| 8 | Đánh giá sao lỗi chỉ báo "Chưa lưu được…" | Khi người dùng **đã đăng nhập** mà máy chủ từ chối phiên (`CZ_AUTH._verify` có lý do) thì báo đúng bệnh: *"Máy chủ chưa xác nhận được phiên đăng nhập của bạn… Đăng xuất rồi Đăng nhập lại"* |
| 9 | Trang quản trị không nhìn thấy bệnh cấu hình | Thêm hàng cảnh báo đỏ trong **Tổng quan** ("Worker chưa ghim project Supabase — đăng nhập sẽ lỗi 401") khi web đã bật Supabase mà health báo chưa ghim; chip trạng thái ở tab Cài đặt nói rõ ghim lấy từ biến Worker hay từ KV |

---

## 2. Giao diện còn chỗ "lòi ra ngoài" — đã soi và vá

| # | Chỗ lỗi | Nguyên nhân | Đã vá |
| --- | --- | --- | --- |
| 1 | **Trang đọc tràn ngang khi chương có ảnh/embed/table** (nghiêm trọng nhất về giao diện) | `.rtext img` không có `max-width` — ảnh nhập từ Blogger mang size gốc (1000–1600px) chọc thủng cột chữ 720px trên cả máy tính lẫn điện thoại | `.rtext img, video → max-width:100%; height:auto`; `iframe/embed/object → max-width:100%`; `table → display:block + cuộn ngang trong khung`; `pre` bẻ dòng; toàn khối `.rtext` bẻ được chữ dài (URL) |
| 2 | **Thanh đầu trang quản trị bị cắt/lòi** | `.abar .in` khoéc `height:60px + flex-wrap:nowrap + overflow-x:auto`: máy 1024–1400px đầy chip/nút là thanh cuộn ngang bị chính chiều cao 60px cắt lòi; khoảng 621–850px lại "wrap" mà vẫn khoéc 60px nên hàng thứ hai **đè lên nội dung bên dưới** | Chuyển sang `min-height:60px; flex-wrap:wrap` — đủ chỗ thì một hàng như cũ, hết chỗ thì xuống hàng, không bao giờ tràn; hạ mốc sticky của cột tab dọc (`top:116px`) cho dải máy hẹp để tab không lún sau bar |
| 3 | Chữ dài không có dấu cách đẩy vỡ khối admin | URL Worker trong ô hint, slug trong nhật ký/phiếu bầu, tên bộ dài trong tiêu đề nhóm phiếu | `overflow-wrap:anywhere` cho `.hint code`, `.note code`, `.logrow`, `.vgroup-head b`, `.modrow .mslug`, `.gate .who b`, `.whoami`… |
| 4 | **My Space — ô chọn truyện vào tủ**: tên truyện dài đẩy checkbox lệch khung | `label` flex không có `min-width:0` cho cột tên | `.shelf-picker label span { flex:1; min-width:0; overflow-wrap:anywhere }` |
| 5 | **Trang truyện**: tên bộ/ tác giả/couple dài (vd "Vượt Khỏi Đường Chân Trời - endless blue beyond (Special)") làm lệch hàng thông tin | `.shero h1`, `.info .r b` không bẻ chữ | Thêm `overflow-wrap:anywhere` + `min-width:0` cho khối hero và bảng thông tin |
| 6 | **Khối đánh giá sao trên màn ≤360px**: 5 sao + số điểm + nút rút bị ép tràn mép | Cỡ sao 36px + giá trị + nút quá chật | Màn ≤360px: sao 32px, icon 22px, gap 8px — cả khối vừa một cột gọn |
| 7 | Ảnh trong bình luận/báo lỗi/doctor có thể phóng quá khung | Thiếu chặn chung | `.cmt-body img, .reprow img, .docrow img → max-width:100%` |

Bảng/ô xem trước chương, danh sách bình luận… vốn đã có khung cuộn riêng nên giữ nguyên. Các bài
kiểm bố cục Chromium (`t_layout_browser.js`, `t_space_browser.js`) vẫn chạy khi có Chromium trên máy.

---

## 3. Kiểm thử — thêm gì, chạy ra sao

| Bài | Nội dung mới |
| --- | --- |
| `t_worker.mjs` (**250/250**) | Nhóm *supabase-ES256 + ghim project*: token ES256 ký thật (EC P-256, chữ ký DER→raw) + JWKS giả đúng dạng Supabase → đổi được session; **chưa ghim ở đâu cả → 500 kèm hướng dẫn đủ 2 cách**; Lưu Project URL qua `PUT /api/registry` (đúng việc /admin làm) → health báo ghim từ KV ngay; token do **project khác** cấp → 401 nêu cả hai URL; chữ ký sai → 401; xoá ghim → health mất ghim ngay (không kẹt cache) |
| `t_auth_flow.js` (**mới**, 10 phép) | Link email `?token_hash=` phải gọi `verifyOtp` rồi dọn URL; Worker từ chối đổi token thì web giữ phiên dự phòng + ghi lý do vào `CZ_AUTH._verify`; My Space gặp 401 thì có đủ nút "Thử lại" + "Đăng xuất & đăng nhập lại" và status nêu đúng lý do máy chủ trả |

Kèm theo: kiểm tra lại `check_html` / `check_css` / `check_calls` / `check_headers` / `check_secrets`
đều sạch; bản phát hành đã build lại (`npm run build`), các trang gắn `?v=20260916a`, `sw.js` cập nhật
precache theo đúng version mới (`t_pwa` chớp đúng lệch version nếu quên).

---

## 4. Sau khi deploy — tự kiểm 3 phút

```bash
# 1. Worker là bản mới + đã ghim project?
curl -s https://chuseoz-cms.kimtong1906.workers.dev/api/health | grep -o '"version":"[^"]*"'
#    → "version":"1.9.8"
curl -s https://chuseoz-cms.kimtong1906.workers.dev/api/auth/config
#    → "supabase":true và "supabaseUrl" là URL project (không rỗng)

# 2. Trên web: /my-space → Đăng nhập bằng Google →
#    · My Space hiện tủ truyện, không còn thông báo lỗi;
#    · Trang truyện: bấm sao → toast "Đã đánh giá N trên 5 sao", số lượt tăng;
#    · Bình luận trong trang đọc bằng tài khoản → gửi được.
```

Nếu `auth.config` vẫn trả `supabase:false` → ghim chưa lưu: làm lại bước 2 ở đầu báo cáo
(cách B nhanh nhất — lưu trong `/admin`, không cần deploy lại).
