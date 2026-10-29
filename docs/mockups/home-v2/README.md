# Nửa dưới trang chủ · bản 4

**Mockup:** `docs/mockups/home-v2/index.html` → `http://127.0.0.1:8081/docs/mockups/home-v2/index.html`

## Trang có gì

| Khối | Kiểu | Nội dung |
|---|---|---|
| **Đọc tiếp** | dải **cuộn ngang** 10 bìa | nhãn `Ch. 44/71`, thanh tiến độ trong bìa, dòng phụ “Còn 27 chương” |
| **Mới cập nhật** | dải **cuộn ngang** 18 bìa | nhãn `Ch. N` / `Trọn bộ N`, tác giả · ngày |
| **Xếp hạng tuần** ⎪ **Đáng xem** | **hai cột song song**, mỗi cột 5 dòng | số thứ tự · bìa 42px · tên · dòng phụ; cột phải là `▲3` / `▼1` và `★4.8` |
| **Thư viện** | thanh lọc + lưới 6 cột + phân trang 18 bộ/trang | đếm `1–18 / 67`, “Trang 1 / 4” |

Lịch ra chương **tạm gác** (theo yêu cầu) — không có trong bản này, sẽ làm lại sau.

## Ba thứ dùng chung

1. **Đầu mục**: tiêu đề · số lượng · (nút `‹ ›` nếu là dải cuộn) · “Xem thêm ›”.
2. **Bìa**: cùng một cỡ trên toàn trang (6 cột, ≤900px còn 4, ≤620px còn 3). Một nhãn
   ở góc trái, `18+` góc phải, tên 2 dòng, một dòng phụ.
3. **Danh sách hàng** (hai cột phải): `26px số · 42px bìa · tên + phụ · số liệu`.

## Chi tiết đã làm

- **Dải cuộn**: kéo chuột / vuốt / shift+lăn đều được, `scroll-snap` để bìa dừng ngay mép,
  thanh cuộn mảnh, hai nút `‹ ›` tự khoá khi tới đầu/cuối (mỗi lần nhảy 2 bìa).
- **Hai cột**: đường kẻ dọc 1px giữa hai cột; dòng đầu tiên có số màu son. Ở khung ≤620px
  hai cột xếp dọc và chuyển đường kẻ dọc thành kẻ ngang.
- **Thư viện**: ô tìm kiếm 40px có trạng thái focus, chip lọc chỉ hiện viền khi đang chọn,
  đường kẻ mảnh dưới hàng lọc, lưới 3 hàng × 6 bìa mỗi trang, phân trang + “Trang 1 / 4”,
  và nút **“Đọc ngay ›”** hiện khi rê chuột lên bìa.

## Dữ liệu

Bìa, tên, tác giả, số chương, trạng thái, ngày cập nhật, `editorChoice`: **thật** (67 bộ).
Lượt đọc, thứ hạng tăng/giảm, điểm sao, chương đang đọc dở: **số minh hoạ**.

## Lên bản thật

1. `#resumeSec` và `#newRail` → hai `<div class="track">` cuộn ngang (giữ nguyên hợp đồng id).
2. `#bxh` và `#worthRail` đặt trong một `.twoside` hai cột; mỗi cái render 5 hàng theo mẫu
   `.prow` ở trên (vẫn giữ `#rank .rank`, `#rankSummary`, `.worth-score` cho test).
3. `#thu-vien` giữ D1, đổi sang 18 bộ/trang + `#libSub` hiện `1–18 / 67`.
4. `#sched` tách ra khỏi trang chủ ở bản này, làm lại sau rồi gắn lại.
5. CSS: thêm ~4 kB (track/arrows/prow/library), xoá ~4,5 kB CSS v3 cũ ⇒ gần như hoà.
