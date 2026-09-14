# Hướng dẫn: Đăng nhập (Supabase) · Bình luận · Thích theo chương · Số chương

*Cập nhật: 2026-09-14 · áp dụng cho `worker/cms.js` **v1.5.0** + `cz-auth.js` / `cz-app.js` / `cz-story.js` / `admin.js` mới.*

Tài liệu này trả lời 4 câu hỏi:

1. **Đăng nhập Google báo `400: origin_mismatch`** → chuyển sang **Supabase** (mục 1–4).
2. **Làm sao để người đọc thích từng chương và bảng xếp hạng nhảy số?** → mục 5.
3. **Bình luận ngay trong trang đọc, kể cả người chưa đăng nhập** → mục 6.
4. **"Be My Angel" có 29 chương mà web vẫn hiện 30** → mục 7 (Bác sĩ dữ liệu).

Việc **bắt buộc** chỉ có 2 thứ: dán lại `worker/cms.js` lên Cloudflare (mục 3) và deploy frontend (mục 4).
Còn Supabase thì làm được sau — chưa làm thì người đọc vẫn bình luận bằng tên khách, web không chết.

---

## 1. Vì sao Google báo `origin_mismatch`, và vì sao chọn Supabase

Google Identity Services bắt khai **đúng tuyệt đối** từng *Authorized JavaScript origin*. Chỉ cần mở web bằng
một tên miền khác (domain mới, bản `*.pages.dev` xem trước, bản chạy thử `127.0.0.1:8787`, hay xem qua link
preview của Arena) là Google trả **`400: origin_mismatch`** — và phải chờ Google Console lưu xong mới hết.

**Supabase** không vướng chuyện đó:

- Supabase lo phần nói chuyện với Google, web chỉ nhận về `access_token`.
- Thêm tên miền mới = thêm 1 dòng trong **Redirect URLs** của Supabase, có hiệu lực ngay.
- Có sẵn 2 đường dự phòng: **magic link qua email** (không cần cấu hình Google) và đăng nhập Google như cũ.
- Worker verify token bằng `JWT Secret` (HS256) nên không cần gọi mạng mỗi lần kiểm tra.

Code cũ (Google trực tiếp) **vẫn còn** trong `cz-auth.js`; đặt `CZ_AUTH_PROVIDER = 'google'` trong `cz-config.js`
nếu muốn quay lại cách đó.

---

## 2. Tạo project Supabase (~10 phút, làm 1 lần)

1. Vào <https://supabase.com/dashboard> → **New project** → chọn region **Singapore (Southeast Asia)** cho gần.
2. **Authentication → Providers → Google** → bật:
   - *Client ID* + *Client Secret* lấy từ Google Cloud Console (loại **Web application**).
   - **Authorized redirect URI** chỉ cần đúng 1 dòng mà Supabase tự đưa: `https://<project>.supabase.co/auth/v1/callback`
     (dòng này Supabase tạo sẵn, copy dán vào Google Console là xong — **không** phải khai domain của web).
   - Chưa có Client ID Google? Vẫn bật được **Email** (magic link) để đăng nhập bằng email, khỏi cần Google.
3. **Authentication → URL Configuration**:
   - **Site URL**: `https://ten-mien-that.com`
   - **Redirect URLs** — thêm tất cả những nơi có thể mở web:
     ```
     https://ten-mien-that.com/**
     https://chuseoz.pages.dev/**
     https://*.pages.dev/**
     http://localhost:8787/**
     ```
4. **Settings → API** copy 3 giá trị:
   | Giá trị | Dùng ở đâu |
   |---|---|
   | `Project URL` (vd `https://xyz.supabase.co`) | web + biến `SUPABASE_URL` của Worker |
   | `anon public` key | web (khoá công khai, cho phép lộ) |
   | `JWT Secret` | **chỉ** ở Worker (`SUPABASE_JWT_SECRET`) — không bao giờ đưa lên web |

---

## 3. Đặt biến cho Worker

Cloudflare → **Workers & Pages → `chuseoz-cms` → Settings → Variables and Secrets**:

| Biến | Bắt buộc | Giá trị |
|---|---|---|
| `CZ_KV` (binding KV) | ✅ | namespace đã tạo |
| `ADMIN_KEY` | ✅ | chuỗi ≥ 24 ký tự, dùng ở `/admin` |
| `SESSION_SECRET` | ✅ | chuỗi ≥ 32 ký tự (`openssl rand -hex 32`) |
| `SUPABASE_URL` | nên có | `https://xyz.supabase.co` |
| `SUPABASE_JWT_SECRET` | nên có | JWT Secret ở bước 2.4 |
| `ADMIN_EMAILS` | nên có | email quản trị, cách nhau bằng dấu phẩy, vd `kimtong1906@gmail.com` |
| `GOOGLE_CLIENT_ID` | không | chỉ cần nếu dùng đường Google cũ |
| `ALLOW_ORIGIN` | không | mặc định `*` |

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_JWT_SECRET
npx wrangler secret put ADMIN_EMAILS
```

Rồi **dán toàn bộ `worker/cms.js` (v1.5.0) vào Worker → Deploy** (code đã đổi nhiều, không deploy là web gọi
các endpoint mới sẽ nhận `404 không có endpoint`).

Kiểm tra nhanh:

```bash
curl "https://chuseoz-cms.kimtong1906.workers.dev/api/health"
# mong đợi: "version":"1.5.0" và "auth":{"supabase":true,...,"session":true,"adminEmails":[...]}
```

`"supabase":false` nghĩa là Worker chưa thấy `SUPABASE_URL`.

---

## 4. Khai Supabase cho web — 2 cách

**Cách A — trong trang quản trị (khuyên dùng, đổi được ngay, không cần deploy):**

`/admin` → tab **Cài đặt & đồng bộ** → mục **Đăng nhập người đọc (Supabase)** → dán *Project URL*, *anon key*,
email quản trị → **Lưu cài đặt**. Giá trị nằm trên KV; web đọc registry là thấy.
Ngay cạnh đó có nút **Hỏi Worker** để biết Worker đã bật Supabase/`SESSION_SECRET`/`ADMIN_EMAILS` chưa.

**Cách B — trong `cz-config.js`** (phải commit + deploy lại frontend mỗi lần đổi):

```js
window.CZ_SUPABASE_URL     = 'https://xyz.supabase.co';
window.CZ_SUPABASE_ANON_KEY = 'eyJhbGciOi...';          // anon key, không phải service_role
window.CZ_ADMIN_EMAILS     = ['kimtong1906@gmail.com'];  // ai được thấy mục Quản trị
window.CZ_AUTH_PROVIDER    = 'supabase';                  // 'google' để dùng cách cũ, '' để tắt
```

Nếu cả hai nơi đều điền thì **`cz-config.js` thắng** (để khỏi bị ghi đè khi khôi phục dữ liệu cũ).

Deploy frontend: đẩy các file đã đổi lên Cloudflare Pages như bình thường
(`cz-config.js`, `cz-auth.js`, `cz-app.js`, `cz-home.js`, `cz-story.js`, `admin.js`, `cz.css`, 4 file HTML).
Mọi thẻ `<script>`/`<link>` đã đổi `?v=20260914a` nên người đọc nhận bản mới ngay, không dính cache.

**Thử:** mở web → bấm **Đăng nhập** ở góc phải → chọn Google → quay về web thấy avatar + tên.
Bấm vào avatar: nếu email nằm trong danh sách quản trị thì có thêm dòng **Trang quản trị**; nếu không thì không có.

---

## 5. Thích theo từng chương + bảng xếp hạng nhảy số

**Trước:** một nút thích cho cả bộ. Thích chương 5 xong sang chương 6 bấm lại thành *bỏ* thích — vì web nhớ
theo bộ. Và phiếu chỉ lưu trên máy người đọc nên **Top vote không đổi**.

**Giờ:**

- Mỗi chương một phiếu: `POST /api/vote {slug, ch, vote: 1|0, vid}`.
  Khoá lưu trên máy là `chuseoz-like-<slug>-<ch>` (`ch=0` là phiếu cho cả bộ ở trang giới thiệu).
- Worker đếm theo `người#chương` nên một người không bầu 2 lần cho cùng một chương, và
  `it.chap = {12: 3}` cho biết chương nào được thích nhiều.
- Nút thích hiện **số người thích chương này**, và chip đầu chương hiện **tổng phiếu của cả bộ**.
- Trả lời của `/api/vote` có `votes/votesDay/votesWeek/votesMonth` → web cập nhật **bảng xếp hạng ngay lập tức**
  (`CZ.vote()` → `applyVote()` → `notifyStats()`), không cần tải lại trang.
- Không gửi `ch` thì Worker hiểu là phiếu cho cả bộ — code cũ gọi kiểu này vẫn chạy.

**Trang quản trị → Số liệu** giờ có: biểu đồ 30 ngày (lượt đọc + phiếu), cột *Phiếu theo chương*
(vd `ch2 (5), ch3 (3)`), và nút **Xuất CSV**.

---

## 6. Bình luận trong trang đọc (khách chưa đăng nhập vẫn gửi được)

- Bình luận nằm trên **KV của Worker**, không phải Giscus/GitHub → hiện được ở **bất kỳ đâu**: tab *Đánh giá*
  của trang truyện **và** khung cuối trang đọc (`#rdCmts`).
- Mỗi bình luận gắn `ch` = chương đang đọc. Trong trang đọc có 2 nút lọc: **chương này** / **tất cả**.
- Người đọc có tài khoản: tên + ảnh lấy thẳng từ tài khoản, xoá được bình luận của mình.
- **Người chưa đăng nhập vẫn gửi được** (bình luận gắn nhãn *khách*), kèm `vid` là mã máy ẩn danh web tự sinh,
  và ô nhập tên được nhớ trong máy để lần sau khỏi gõ. Lý do: bật Supabase là việc của chủ trang, không thể bắt
  người đọc mất quyền bình luận chỉ vì trang chưa cấu hình xong.
- Chặn spam: tài khoản đã đăng nhập **3** bình luận/chương/10 phút và **12** bình luận/10 phút;
  khách **2** và **6**.
- **Kiểm duyệt:** `/admin` → tab **Bình luận** — xem toàn bộ (mọi bộ), tìm theo chữ, lọc theo bộ,
  xoá bất kỳ bình luận nào, xuất JSON. Mọi lần xoá đều ghi vào **Nhật ký**.

Giscus vẫn còn ở tab *Đánh giá* nếu bạn muốn giữ bình luận GitHub song song; nó không xung đột.

---

## 7. Số chương sai (bệnh "Be My Angel": repo 29 chương, web hiện 30)

**Nguyên nhân thật:** web đọc **KV trước**, file trong repo chỉ là đường dự phòng. Bạn sửa
`data/book/be-my-angel.json` và `data/registry.json` (đúng 29) nhưng **bản trên KV vẫn là bản cũ 30 chương**,
nên web hiện 30. Không phải lỗi giao diện.

**Ba lớp đã sửa:**

1. **Tự chữa ở web** (`CZ.reconcileCount`): khi mở trang truyện, web so số chương thật trong kho chương với con
   số registry đưa xuống, và **dùng số thật** (ghi vào `chuseoz-realcounts`). Người đọc thấy đúng ngay cả khi KV cũ.
2. **Worker tự giữ nhãn đúng**: `PUT /api/book/<slug>`, `/api/seed`, `/api/import`, `/api/sync` đều tính lại
   `chapters` + `countLabel` (`29/29`) sau khi ghi. Bộ 0 chương thì bỏ qua, không xoá nhãn Blogger đang có.
3. **`POST /api/recount`**: đếm lại toàn bộ 62 bộ từ chương thật trong KV rồi sửa registry, trả về danh sách
   `fixed` (bộ nào đã sửa, nhãn cũ → nhãn mới), `missing` (registry nói có chương mà KV trống), `orphan`.

**Cách chữa dứt điểm bằng giao diện** — `/admin` → tab **Bác sĩ dữ liệu** (phím `6`):

Tab này đối chiếu **3 nguồn** cho từng bộ: `registry` (con số đang hiện ngoài web) ↔ `KV` (bản người đọc thật sự
nhận) ↔ `repo` (file trên GitHub), rồi liệt kê đúng bộ đang lệch, vd:

> **Be My Angel** — `be-my-angel` · registry **29** · KV **30** · repo **29**
> · Số chương ngoài web ≠ số chương thật · **KV lệch file trong repo GitHub** (bạn sửa repo nhưng chưa nạp lên KV)

Bốn nút:

| Nút | Làm gì | Khi nào dùng |
|---|---|---|
| **Quét lại** | soi 62 bộ, ~10 giây | mỗi lần nghi số chương sai |
| **↑ Nạp chương từ repo lên KV** | `PUT /api/book/<slug>` cho những bộ đang lệch — **chữa gốc** | KV lệch repo (đúng bệnh Be My Angel) |
| **Đếm lại số chương trên KV** | `POST /api/recount` | registry lệch KV |
| **Sửa nhãn trong registry** | sửa `chapters` + `countLabel` theo số thật vừa soi | muốn sửa nhanh phía web |

Ngoài số chương, tab này còn bắt được: chương **đăng trùng tiêu đề**, chương **rỗng không có chữ**, bộ **thiếu
ảnh bìa / mô tả / tác giả / couple / năm**, bộ **không có chương ở đâu cả**, và nhãn sai định dạng.
Có nút **Xuất báo cáo** (JSON) để lưu lại hoặc gửi cho người khác xem.

> Sau khi nạp/đếm lại, nếu web vẫn hiện số cũ thì đó là **cache trình duyệt**: Ctrl+F5,
> hoặc `/admin` → **Cài đặt** → *Xoá cache số liệu*.

---

## 8. Trang quản trị: ai vào được

`/admin` giờ có **cổng**. Hai cách qua cổng:

1. **Đăng nhập bằng email quản trị** (email đó phải nằm trong `CZ_ADMIN_EMAILS` của `cz-config.js`
   hoặc `ADMIN_EMAILS` của Worker hoặc `registry.settings.auth.adminEmails`).
2. **Nhập đúng `ADMIN_KEY`** của Worker (dành cho lúc chưa bật Supabase).

Người đọc thường:

- Không thấy mục **Quản trị** ở đầu trang, trong menu tài khoản, lẫn menu điện thoại.
- Mở thẳng `/admin` thì thấy cổng đăng nhập, **không thấy dữ liệu nào** — kể cả dữ liệu tĩnh trong repo.
- Đăng nhập bằng tài khoản không nằm trong danh sách thì cổng báo rõ: *"Tài khoản X không nằm trong danh sách
  quản trị"*, và liệt kê những email đang được phép để bạn biết chỗ thêm.

Thanh trên của `/admin` hiện avatar + tên + huy hiệu **quản trị** + nút **Đăng xuất**.

Các tab (phím tắt là số tương ứng): Tổng quan `1` · Thư viện `2` · Đăng nhanh `3` · Thêm bộ `4` · Sửa bộ `5` ·
**Bác sĩ dữ liệu `6`** · **Bình luận `7`** · Số liệu `8` · **Nhật ký `9`** · Cài đặt `0`.
Tab **Tổng quan** có ô *Tình trạng hệ thống* báo 3 thứ hay hỏng nhất (đăng nhập, số chương, Worker) kèm nút tới thẳng chỗ sửa.

---

## 9. Chạy thử trên máy trước khi deploy

```bash
node tests/mock_worker.mjs 8787     # worker THẬT + KV trong RAM, tự nạp 62 bộ từ data/
```

Mở `http://127.0.0.1:8787/admin.html` → URL Worker `http://127.0.0.1:8787` → khoá `MOCK`.
Muốn thử đăng nhập thật thì chạy kèm biến:

```bash
SUPABASE_URL=https://xyz.supabase.co \
SUPABASE_JWT_SECRET=... ADMIN_EMAILS=ban@gmail.com \
node tests/mock_worker.mjs 8787
```

```bash
cd tests && node run.js             # 10 bài kiểm thử giao diện + 83 kiểm tra cho worker
```

---

## Nếu gặp trục trặc

| Hiện tượng | Nguyên nhân | Sửa |
|---|---|---|
| Google báo **`400: origin_mismatch`** | dùng đường Google trực tiếp, chưa khai origin | chuyển sang Supabase (mục 2–4), thêm domain vào **Redirect URLs** |
| Nút Đăng nhập báo *chưa cấu hình* | chưa điền Supabase URL + anon key | `/admin` → Cài đặt → mục *Đăng nhập người đọc*, hoặc điền `cz-config.js` |
| Đăng nhập xong vẫn không thấy mục **Quản trị** | email không nằm trong danh sách quản trị | thêm email vào `ADMIN_EMAILS` (Worker) hoặc `CZ_ADMIN_EMAILS` |
| `/api/auth/supabase` báo *Worker chưa đặt SUPABASE_URL* | thiếu biến môi trường | đặt biến (mục 3) rồi Deploy lại Worker |
| *token Supabase không hợp lệ* | `SUPABASE_JWT_SECRET` sai, hoặc token hết hạn | copy lại JWT Secret; người đọc bấm đăng nhập lại |
| `404 không có endpoint /api/recount` | Worker đang chạy là **bản cũ** | dán lại `worker/cms.js` v1.5.0 → Deploy |
| Web hiện **sai số chương** | KV còn giữ bản cũ | mục 7: *Bác sĩ dữ liệu* → Nạp chương từ repo lên KV → Đếm lại |
| Bấm **Thích** mà Top vote không nhảy | web đang chạy JS cũ trong cache | Ctrl+F5; kiểm tra `?v=` ở thẻ `<script>` đã đổi chưa |
| Bình luận báo *"không nhận được mã máy"* | `cz-app.js` trong cache là bản cũ | Ctrl+F5 |
| Bình luận báo *"bạn bình luận hơi nhanh"* | chạm trần chống spam | chờ 10 phút (3 bình luận/chương với tài khoản, 2 với khách) |
| Ô bình luận báo *Chưa nối Worker* | `CZ_API` trống/sai | điền `window.CZ_API` đúng Worker rồi deploy lại |
