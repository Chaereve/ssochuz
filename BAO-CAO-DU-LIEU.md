# Soát dữ liệu truyện — chuseoz

Chạy bằng `python3 tools/audit_data.py` · rev dữ liệu: `2026-09-12b` · nguồn: dữ liệu thật 100% từ chuseoz.blogspot.com (list-novel + /p/ + bài post), không có số liệu tự đặt

| Mục | Số |
|---|---|
| Số bộ trong thư viện | 62 |
| Thẻ truyện đối chiếu được từ Blogger | 62 |
| Tổng chương có nội dung thật | 1198 |
| Bộ chưa có chương (khoá đọc) | 17 |
| Số bộ trong bảng xếp hạng dùng số tự đặt | 0 |
| Lỗi cần sửa | 0 |

## Lỗi

Không có lỗi nào.

## Chênh lệch giữa thẻ Blogger (cũ) và trang truyện (đang dùng)

- **Chain Baby** — thẻ Blogger ghi `14/14`, dữ liệu có **15 chương thật** (1 Lời Mở Đầu/Chương 0 + 14 chương đánh số + 0 Ngoại truyện). Lệch do cách đếm của thẻ cũ.
- **Cô Vợ Hờ Đanh Đá Của Tôi** — thẻ Blogger ghi `5/40`, dữ liệu có **7 chương thật** (2 Lời Mở Đầu/Chương 0 + 5 chương đánh số + 0 Ngoại truyện). Lệch do cách đếm của thẻ cũ.
- **Cô Vợ Hờ Đanh Đá Của Tôi** — tình trạng: thẻ ghi "Tới chương 5", trang truyện hiển thị "Đang cập nhật" (bản gốc lưu ở `statusRaw`).
- **Third Person** — tình trạng: thẻ ghi "Tới Chương 8", trang truyện hiển thị "Đang cập nhật" (bản gốc lưu ở `statusRaw`).
- **Vượt Khỏi Đường Chân Trời - endless blue beyond (Special)** — tình trạng: thẻ ghi "Sắp dịch", trang truyện hiển thị "Sắp ra mắt" (bản gốc lưu ở `statusRaw`).

## Cách đếm chương (vì sao nhãn trên thẻ Blogger hay lệch với số chương đọc được)

| Truyện | Thẻ Blogger | Tổng chương | Lời Mở Đầu / Chương 0 | Chương đánh số | Ngoại truyện |
|---|---|---|---|---|---|
| Chain Baby | 14/14 | 15 | 1 | 14 | 0 |
| Cô Vợ Hờ Đanh Đá Của Tôi | 5/40 | 7 | 2 | 5 | 0 |

> Nguyên tắc: số liệu đọc/bình chọn **chỉ** lấy từ Firebase cũ (`chuseoz-library`).
> Khi chưa đọc được thì web không hiện số nào và ghi rõ lý do, không ước lượng.
