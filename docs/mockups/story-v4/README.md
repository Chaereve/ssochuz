# Mockup · Trang thông tin truyện — vòng 4

`node docs/mockups/story-v4/gen.mjs` → `index.html`.

**Phần đầu (C · nền bìa mờ)** — chỉ còn thứ không lặp ở đâu khác:
tiêu đề · nhãn trạng thái + tác giả · couple · năm · giới thiệu 2 dòng + “đọc đầy đủ” ·
6 nút (đọc / chương mới nhất / theo dõi / tủ truyện / chia sẻ / RSS) · tiến độ đọc.

**Đã bỏ khỏi phần đầu:** dòng nhãn “Cập nhật …”, cả hàng chip
(trạng thái · số chương · điểm ★ · lượt đọc — bốn thứ này đều có trong tab Thông tin).

**Thanh tab:** bỏ “Đang đọc chương 13/25 · 65%” (đã có thanh tiến độ ở phần đầu).

**Tab Danh sách chương:** bỏ số chương ở cuối thanh công cụ (tab đã ghi 25);
chỉ còn tìm · Cũ nhất/Mới nhất · đi tới · danh sách 4 cột · phân trang.

**Tab Thông tin:** sáu dữ kiện 2×3 (tác giả · couple · năm · số chương · cập nhật · giới hạn) —
bỏ “Tên khác” và “Tình trạng” (trạng thái đã là nhãn dưới tiêu đề); bốn ô số liệu cột phải;
cảm xúc một hàng. Không còn dòng phụ, không còn lối “đọc tiếp” (trùng nút đọc ở phần đầu).

**Truyện liên quan:** bỏ chip couple trong cột “cùng couple” (đầu cột đã ghi couple + số bộ);
bộ nào đã nằm ở cột cùng couple thì không lặp lại ở cột cùng tác giả.
