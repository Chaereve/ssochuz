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

- Thẻ Blogger ghi 14/14 nhưng dữ liệu đang dùng 15/15 — Chain Baby (bài gốc nhiều hơn/bằng)
- Thẻ Blogger ghi 5/40 nhưng dữ liệu đang dùng 7/40 — Cô Vợ Hờ Đanh Đá Của Tôi (bài gốc nhiều hơn/bằng)
- Thẻ Blogger ghi "Tới chương 5", trang truyện ghi "Đang cập nhật" — Cô Vợ Hờ Đanh Đá Của Tôi (đã lưu bản gốc ở statusRaw)
- Thẻ Blogger ghi "Tới Chương 8", trang truyện ghi "Đang cập nhật" — Third Person (đã lưu bản gốc ở statusRaw)
- Thẻ Blogger ghi "Sắp dịch", trang truyện ghi "Sắp ra mắt" — Vượt Khỏi Đường Chân Trời - endless blue beyond (Special) (đã lưu bản gốc ở statusRaw)

> Nguyên tắc: số liệu đọc/bình chọn **chỉ** lấy từ Firebase cũ (`chuseoz-library`).
> Khi chưa đọc được thì web không hiện số nào và ghi rõ lý do, không ước lượng.
