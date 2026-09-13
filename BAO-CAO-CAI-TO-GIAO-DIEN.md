# Báo cáo cải tổ giao diện & tính năng (13/09/2026)

Toàn bộ web được dựng lại theo **bố cục hero landing làm chủ đạo**, dùng chung một hệ thống
giao diện cho cả 4 trang: **trang chủ · trang truyện · trang đọc · trang quản trị**.

---

## 1. Kiến trúc mới (gọn hơn bản cũ)

| Tệp | Việc |
|---|---|
| `index.html` + `cz-home.js` | trang chủ (hero landing) |
| `truyen.html` + `cz-story.js` | **trang truyện + trang đọc trong cùng một trang** |
| `admin.html` + `admin.js` | trang quản trị |
| `cz-app.js` | lõi dùng chung: dữ liệu, ký ức người đọc, bộ giao diện, đầu trang/chân trang |
| `cz.css` | hệ thống giao diện (1 tệp, đổi `[data-theme]` là đổi cả web) |
| `cz-config.js` | nối web vào Worker KV (1 dòng) |

Bản cũ có `index.html` (125 KB) và `reader.html` (93 KB) — hai tệp tự chứa, chép đi chép lại
CSS/JS, sửa một chỗ phải sửa hai nơi. Bản mới: **1 trang đọc dùng chung**, mở chương không
tải lại trang, nút Back của trình duyệt trả về đúng danh sách chương.

**Đường dẫn**

```
/                     → trang chủ
/truyen/<slug>/       → thông tin truyện + danh sách chương
/truyen/<slug>/#chuong-12 → mở thẳng chương 12
/truyen/<slug>/#page-12   → link cũ, vẫn chạy
/reader?slug=<slug>&ch=5  → link đời cũ, vẫn mở đúng chương
/admin                → trang quản trị
```

`_redirects` giữ cho mọi link cũ còn sống; `sitemap.xml` + `robots.txt` sinh từ
`data/registry.json` bằng `python3 tools/build_sitemap.py --base <tên miền của bạn>`.

---

## 2. Đã sửa trong lần này (lỗi thật, kiểm chứng bằng kiểm thử tự động)

| Chỗ | Triệu chứng | Cách sửa |
|---|---|---|
| Ô lọc **Tình trạng** ở thư viện | ô xổ xuống rỗng, bấm không có gì | nạp 4 lựa chọn, nối vào bộ lọc + chip + nút “Xoá tất cả lọc” |
| Nút **Xác nhận** trong hộp thoại | bấm OK mà hộp thoại coi như “Huỷ” (xoá bộ, xoá chương không chạy) | sửa `confirmBox()` trong `cz-app.js`, thêm `closeModal()` |
| Kệ **Đọc tiếp / Tủ truyện** | xoá hết truyện rồi kệ vẫn còn thẻ cũ | xoá nội dung kệ trước khi ẩn |
| Danh sách chương | trang tô sáng “Từ đầu” nhưng lại xếp chương mới nhất lên trước | mặc định xếp từ chương 1 |
| Tìm nhanh (⌘K / phím `/`) | mở rồi bấm ra ngoài, phím Esc không đóng | thêm xử lý Esc toàn trang |
| Ảnh bìa / ảnh trong bài | ảnh bị chặn hotlink ⇒ hiện icon ảnh vỡ | ảnh bìa để lại khung có nền + chữ mờ; ảnh trong bài đổi thành khung viền giữ chỗ |
| Trang quản trị → **Ngắt kết nối** | hiện lại trang “Kênh đăng bài” rồi mới tải lại | bỏ bước hiện thừa |
| Đầu trang khi mở trang | trắng đầu trang tới khi tải xong dữ liệu | dựng đầu trang/chân trang ngay, dữ liệu về sau |
| Khi Worker KV lỗi/chặn | mỗi lần mở trang lại chờ tối đa 9 giây rồi mới lùi về dữ liệu tĩnh | lỗi một lần là ghi nhớ trong phiên, các trang sau đi thẳng vào `/data` |

Kiểm thử: `cd tests && node run.js` → **4/4 bài đạt** (cấu hình Worker · trang chủ · trang truyện
+ trang đọc · trang quản trị với Worker giả), không lỗi JS nào.

---

## 3. Từng trang có gì

**Trang chủ — hero landing (`/`)**
Khối mở đầu lớn chạy 5 bìa truyện (tự chuyển 8 giây, có nút chọn), nút “Đọc từ chương 1 /
Chi tiết truyện / Lưu”. Bên dưới: dải số liệu thật, kệ **Đọc tiếp** và **Tủ truyện** (chỉ hiện
khi bạn đã đọc/lưu), **Mới cập nhật**, **Bảng xếp hạng** (3 kiểu xem, khi Firebase bị chặn thì
ghi rõ lý do chứ không hiện số ước lượng), **Lịch ra chương**, **Phân cấp chuyển thể**
(Series/Movie/Chưa chuyển thể) và **Thư viện truyện**: tìm kiếm, lọc tình trạng – năm – tác giả –
couple, 7 tab, 6 kiểu sắp xếp, xem dạng lưới/danh sách, phân trang.

**Trang truyện (`/truyen/<slug>/`)**
Bìa lớn + thông tin, nút đọc, lưu vào tủ, chia sẻ, bài gốc; danh sách chương có tìm, sắp xếp
cũ/mới, nhảy số chương, đánh dấu chương đã đọc; dải liên quan theo series / couple / tác giả;
bình luận (khi gắn giscus) hoặc dẫn về Blogger.

**Trang đọc (trong cùng trang truyện)**
Nền Sáng/Kem/Xám/Tối, 4 cỡ chữ, 3 độ rộng, 3 giãn dòng, chữ có chân/không chân, căn đều,
chế độ **lật trang** hoặc **cuộn**, thanh tiến độ theo chương, mục lục trong ngăn kéo,
chế độ tập trung, tự ẩn thanh công cụ sau 3 giây, phím ←/→/Space/B/F/L/`?`/Esc, vuốt trên
điện thoại, Thích · Lưu vào tủ · Đánh dấu · Bình luận · Báo lỗi · Chia sẻ, ảnh trong bài bấm ra
xem lớn. Mọi lựa chọn lưu trong máy nên mở lại là y như cũ.

**Trang quản trị (`/admin`)**
7 tab: Kênh đăng bài · Cài đặt · Đăng nhanh · Thêm bộ · Sửa bộ · Số liệu · Trợ giúp.
Ưu tiên đọc/ghi qua Worker + KV (sửa là người đọc thấy sau 1–2 giây), khi mất mạng thì đọc
`/data/*.json` và giữ bản nháp trong máy, có sao lưu/phục hồi 1 tệp JSON.

---

## 4. Cần bạn làm (theo thứ tự)

1. **Deploy**: gộp PR này vào `main` (Cloudflare Pages tự build). Sau đó mở thử
   `/`, một trang truyện, `/admin`.
2. **Sitemap**: chạy `python3 tools/build_sitemap.py --base https://<tên-miền-thật>` rồi commit
   lại `sitemap.xml` + `robots.txt` (bản trong repo đang dùng `https://chuseoz.pages.dev`).
3. **Số liệu thật (lượt đọc / bình chọn)**: hiện Firebase `chuseoz-library` còn chặn quyền đọc
   nên web **không hiện số nào** (cố ý, không đoán số). Mở quyền đọc cho Firestore là bảng xếp
   hạng có số ngay, không cần sửa code.
4. **Bình luận**: điền `settings.giscus.repo` + `repoId` trong tab *Cài đặt* của trang quản trị
   nếu muốn bình luận ngay trên web (chưa có thì web dẫn về bài gốc Blogger).

---

## 5. Còn lại / giới hạn đã biết

- Số chương ở trang đọc tính theo **vị trí trong danh sách** (1…9), còn tiêu đề chương là chữ
  tác giả đặt. Với bộ có “Lời Mở Đầu” (không đánh số) thì: vị trí 3 = *Chương 2: Hạt Mầm*.
  Đây là dữ liệu thật từ Blogger, web không tự sửa tên chương.
- 17/62 bộ chưa có chương (“Sắp ra mắt”) — nút đọc bị khoá, có dẫn sang Blogger.
- Trang quản trị cần `ADMIN_KEY`; khoá chỉ nằm trong localStorage của máy bạn.
