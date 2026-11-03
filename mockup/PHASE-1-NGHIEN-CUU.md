# PHASE 1 · NGHIÊN CỨU

*Nguồn: `Layout.jsx`, `Badges.jsx`, `docs/product-surface-map.md`, ảnh admin thật. Suy luận dưới đây là GIẢ THUYẾT; số liệu mockup là MẪU.*

## Người dùng & JTBD
Chủ site (desktop, tự dịch truyện đã mua và đăng, có ADMIN_KEY): muốn biết việc cần làm và quota KV trước khi ghi; muốn thấy hậu quả khi đổi slug, khóa, khôi phục; muốn đối chiếu KV rồi recount an toàn; muốn soạn chương không mất nháp, đổi case nhanh và biết nháp đã lưu lúc nào. Không có tác giả hay nhân sự khác đăng chung.

## 5 điểm đau (GIẢ THUYẾT)
1. 13 tab phẳng; "Sửa bộ" phụ thuộc lựa chọn ẩn.
2. Worker và quota rải rác → ghi khi sắp bị chặn.
3. Xóa, recount, reset dùng chung một kiểu xác nhận.
4. Bảng dài, nhiều badge, thead và thanh lô mất khi cuộn.
5. Tự lưu nháp thiếu tín hiệu "đã lưu lúc…".

## Tham chiếu (mỗi sản phẩm 1 mẫu)
| Sản phẩm | Mẫu đáng học | Áp dụng |
| --- | --- | --- |
| Linear | Ctrl+K điều hướng | Ô tìm gợi ý + 13 tab |
| Ghost CMS | "Đã lưu lúc…" + xem trước | Trình soạn chương |
| Airtable | thead dính, chọn nhiều, thanh lô | Thư viện |
| MangaDex author | nháp → chờ duyệt → lịch đăng | Tab Chương |
| Cloudflare | chip trạng thái, pill hạn mức, banner đỏ | Khung trên |

## 5 nguyên tắc
1. Một màn = một quyết định; nút chính cố định góc phải (Thư viện → Thêm bộ).
2. Hồng chỉ cho việc chính, tab chọn, focus, số đếm; mỗi header đúng một nút chính.
3. Trạng thái đặt trên khung; card không lặp chip kết nối hay quota.
4. Ma sát tỉ lệ rủi ro: xóa, recount, reset phải gõ tên bộ.
5. Nhịp 8px, serif cho số, mono cho nhãn, vạch tóc thay bóng (dải số liệu không card).

## Phê bình IA
Giữ 5 nhóm, tên, thứ tự. Nổi bật Dashboard, Báo lỗi, Bình luận bằng số đếm; giữ Thêm bộ, Chương ngay dưới Thư viện; làm mờ Sửa bộ đến khi có bộ được chọn; đẩy Nhật ký, Kiểm tra dữ liệu, Cài đặt xuống cuối nhóm Hệ thống; eyebrow thay breadcrumb. Bỏ nhóm Người dùng (Tác giả, Vai trò) theo xác nhận owner: một người dịch và đăng, không có tác giả hay nhân sự khác.
