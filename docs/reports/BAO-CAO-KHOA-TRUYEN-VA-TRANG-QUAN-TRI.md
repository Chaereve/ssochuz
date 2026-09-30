# Báo cáo khóa truyện, dựng lại trang quản trị & trình soạn chương (17/09/2026)

Bản **v1.10.0** làm đúng 5 việc theo yêu cầu: **(1)** khóa mật mã từng bộ truyện —
thẻ và giới thiệu vẫn công khai, chỉ chương đòi mật mã; **(2)** dựng lại trang quản trị
thành sườn sidebar + trình soạn chương chuyên nghiệp (định dạng chữ, lên ảnh, mở tệp);
**(3)** phân quyền rõ ràng: một mức quyền duy nhất nhưng nói đúng nguồn xác nhận
(Google hay khoá), thao tác nguy hiểm phải **bấm hai lần**; **(4)** bỏ 3 tab thừa
(Đăng chương nhanh, Truyện riêng tư, Trợ giúp — đã hỏi và được duyệt); **(5)** dọn dữ
liệu: xoá trường `postId` chết, avatar tự mở hộp cắt khi tải. Kết quả: **44 bài kiểm
thử đều đạt**, build gọn (tổng 488.8 kB).

---

## 1. Khóa mật mã bộ truyện (luật lk1 — đã chốt với bạn)

**Người đọc thấy gì:**

- Thẻ truyện ở **trang chủ, thư viện, hero, xem nhiều** vẫn hiện bình thường — thêm
  huy hiệu **ổ khóa** nhỏ cạnh tên (icon `lock`, có `title` giải thích).
- **Giới thiệu (synopsis) vẫn công khai** — ai cũng đọc được ở trang thông tin.
- **Danh sách chương + nội dung bị che** sau cửa "cần mật mã". Sai mật mã thì báo lỗi,
  đúng thì mở ra bình thường. Token sống 6 giờ trong tab — đóng tab là phải nhập lại.

**Bên kỹ thuật (Worker v1.10.0):**

| Hạng mục | Cách làm |
|---|---|
| Lưu mật mã | Băm **PBKDF2** (salt 16 byte ngẫu nhiên) ngay trên Worker — không nơi nào giữ bản chữ thường, kể cả trang quản trị |
| Token cho người đọc | `POST /api/lock` → token **HMAC 6 giờ** (ký bằng `SESSION_SECRET`, thiếu thì `ADMIN_KEY`), giữ trong `sessionStorage` theo slug |
| Đọc chương | `GET /api/book/<slug>?token=…` — URL có query **bỏ qua cache biên** (tránh bộ khóa dính cache cho người không có token) |
| Quản trị | `POST /api/lock/set {slug, password}` — mật mã rỗng = bỏ khóa; 8–256 ký tự |
| Trữ lượng | Mỗi bộ khóa chỉ thêm ~200 byte (salt+hash) vào bản ghi chương — không tốn thêm khoá KV |
| Phòng lộ | Bộ khóa bị **loại khỏi feed** (`/feed.xml`); bản tĩnh `data/*.json` chưa từng có chương nên không lộ; quản trị đọc trọn bộ nhưng **đi thẳng KV, không bao giờ qua cache biên** (nếu qua cache thì bộ khóa lộ cho người đọc chung URL) |

**Trang quản trị** có hẳn thẻ **"Khóa mật mã"** trong tab Sửa bộ: huy hiệu trạng thái
(đang có mật mã / chưa khóa), hai ô nhập mật mã + nhập lại, nút *Khóa / đổi* và *Bỏ
khóa* — cả hai đều phải **bấm hai lần**.

## 2. Dựng lại trang quản trị (admin.html + admin.js + cz.css)

### Sườn mới
- **`.ashell`**: cột điều hướng trái (mặt bàn) + nội dung. Trên **điện thoại** cột điều
  hướng thành **thanh tab ngang cuộn** dính ngay dưới thanh trên; **bảng thư viện thành
  thẻ có nhãn** ở màn ≤ 620px (không còn phải luồn chuột ngang).
- **11 tab** nhóm thành 3 khối rõ việc: **Làm việc** (Tổng quan · Thư viện · Thêm bộ ·
  Sửa bộ) · **Chất lượng** (Bình luận · Báo lỗi · Kiểm tra dữ liệu) · **Vận hành**
  (Thống kê · Phiếu bầu · Nhật ký · Cài đặt). Phím tắt **1–0** theo đúng thứ tự tab,
  giữ `V` (tối/sáng), `R` (soi lại), `Ctrl+S` (lưu).
- **Bỏ 3 tab** đã được duyệt: *Đăng chương nhanh* (gộp vào trình soạn), *Truyện riêng
  tư* (endpoint `/api/private/*` trên Worker **vẫn giữ** cho tương thích), *Trợ giúp*.

### Phân quyền & an toàn thao tác
- **Huy hiệu quyền** ở thanh trên: `🛡 quản trị · Google` (đăng nhập tài khoản trong
  `ADMIN_EMAILS`) hoặc `🔑 quản trị · khoá` (dán `ADMIN_KEY`) — **một mức quyền duy
  nhất** (theo quyết định), nhưng ai nhìn cũng biết quyền này đến từ đâu.
- **Xác nhận hai bước** cho 5 thao tác nguy hiểm: *Xoá bộ · Reset phiếu bầu · Nạp
  repo→KV · Phục hồi từ file · Nạp chương repo→KV*. Lần bấm thứ nhất nút chuyển sang
  trạng thái **đỏ nhấp nháy "bấm lần nữa"** (tự huỷ sau 8 giây), lần thứ hai mới chạy
  (reset phiếu vẫn còn hộp thoại thứ ba vì nó không hoàn tác được). Xoá từng chương
  nhỏ hơn nên giữ hộp thoại xác nhận một bước như cũ.
- `ADMIN_KEY` vẫn chỉ sống trong tab (sessionStorage) — chưa bao giờ xuống localStorage.

### Trình soạn chương chuyên nghiệp (tab Sửa bộ)
- **Khung soạn contenteditable** thay ô textarea trần, kèm **thanh định dạng**:
  *đậm · nghiêng · gạch chân · gạch ngang* | *H2 · H3 · đoạn thường · trích dẫn ·
  đường phân cách* | *canh trái · giữa · phải*. `Ctrl+B/I/U` và `Tab` (thụt dòng) hoạt
  động tự nhiên.
- **Lên ảnh ngay trong chương**: chọn ảnh từ máy → **tự nén WebP trong trình duyệt**
  (cạnh lớn ≤ 1400px, quality 0.82) → `POST /api/img` → lưu KV → chèn vào vị trí con
  trỏ. Ảnh "chữa lành": nội dung lưu đường dẫn **tương đối** `/api/img/<id>` (không
  dính cứng tên miền Worker), trang đọc và trình soạn tự viết ra URL tuyệt đối khi
  hiển thị.
- **Mở tệp chương** `.txt / .md / .html` từ máy (lõi `textToHtml` cũ: dòng trống = đoạn
  mới, tên tệp thành tiêu đề nếu trống).
- Đếm **từ / ký tự** theo thời gian thực; danh sách chương 2 cột (trái) + soạn (phải);
  *Lưu chương này* / *Lưu toàn bộ chương* / *Xoá chương*; tìm chữ trong toàn bộ bộ giữ
  nguyên, bấm kết quả nhảy đúng chương.
- **Ảnh bìa**: ô xem trước khổ 2:3 + nút *Lên ảnh bìa…* cùng đường `/api/img`, URL tự
  điền vào ô, ghi nhớ trước khi bấm *Lưu thông tin*.

### Kiểm tra dữ liệu
- Tab **Kiểm tra dữ liệu** thêm thẻ **Kiểm kho KV** (`GET /api/admin/kv`): tổng số
  khoá + dung lượng, rồi **bảng tỉ trọng theo nhóm** (`book:`, `img:`, `cmt:`,
  `voters`, …) sắp theo nhóm phình nhất — trả lời thẳng câu "KV to vì thứ gì".
- Bảng thư viện có **huy hiệu ổ khóa** cạnh tên bộ đang khóa; nút nạp chương repo→KV
  cũng vào danh sách xác nhận hai bước.

## 3. My Space — ảnh đại diện

Bấm **Tải ảnh** (hoặc kéo-thả) → hộp **"Cắt ảnh"** **tự mở ngay** — kéo/đổi tiêu điểm,
phóng to, rồi *Dùng ảnh này*. Bấm *Huỷ* thì tự cắt vuông 256 px ở giữa (không mất
ảnh). Nút *Di chuyển & cắt ảnh* cũ vẫn còn để căn lại sau.

## 4. Dọn dữ liệu

- `data/registry.json`: xoá **62 trường `postId`** (di sản Blogger/Firebase — worker
  đã tự strip khi PUT, web chỉ còn đọc làm fallback). Không ảnh hưởng gì ngoài giảm
  ~124 dòng file.
- Bản ghi bộ: trường `count` chết (sao của `countLabel`) không còn được ghi khi lưu.

## 5. Kiểm thử & vận hành

**44 bài kiểm thử, tất cả đạt** (chạy `node tests/run.js`):

| Nhóm | Bài | Kiểm gì |
|---|---|---|
| Mới | `t_lock.mjs` (23 bước) | băm khóa, token 6h, token giả/chai, đọc đúng/sai token, bộ khóa không lộ qua feed/registry/tĩnh, admin đọc trọn bộ khóa, ảnh b64 + giới hạn, kiểm kho KV, nhật ký khóa |
| Mới | `t_lock_ui.js` | cửa khóa trên web: không rò chữ khi khóa, sai mật mã báo lỗi, đúng mật mã mở chương + xoá cửa, mở thẳng URL chương khi khóa, thẻ khóa ở trang chủ |
| Mới | `t_admin_ui.js` | sườn 11 tab (không còn quick/private/help), huy hiệu "khoá", trình soạn + thanh định dạng + đếm từ, vòng đời URL ảnh (lưu tương đối / hiện tuyệt đối), khóa qua UI + chặn mật mã ngắn, kiểm kho KV vẽ đúng 5 nhóm, **xác nhận 2 bước** (lần 1 chưa xoá, lần 2 mới xoá) |
| Sửa | `cf_admin_test.js`, `t_flows.js` | soạn chương bằng trình soạn mới, mở tệp `.txt`, xoá bộ/reset phiếu qua xác nhận 2 bước |
| Cũ | 38 bài còn lại | không lỗi lùi (regression) — đọc, bình luận, phiếu, My Space, đăng nhập, fallback, mobile… |

Build: `npm run build` xanh — tổng **488.8 kB** (cz.css 169 kB, admin.js 102 kB).

**Trước khi deploy thật**, nhớ:
1. Dán `worker/cms.js` bản 1.10.0 vào Worker rồi **Deploy** (phần khóa + ảnh + kiểm
   kho KV đều nằm ở Worker).
2. Web build từ repo này (đã build sẵn trong thư mục gốc).
3. Muốn khóa bộ nào: *Trang quản trị → Sửa bộ → thẻ Khóa mật mã*.
