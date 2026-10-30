# Mockup · Trang thông tin truyện — vòng 3

`node docs/mockups/story-v3/gen.mjs` → `index.html`.

Thay đổi so với vòng 2:

- Phần đầu giữ **C · nền bìa mờ**, siết gọn như v2.
- **Bỏ hẳn** khối “Thông tin truyện” nằm dưới danh sách chương — dữ kiện của bộ truyện
  (tác giả · couple · năm · tình trạng · số chương · cập nhật · giới hạn · tên khác) chỉ nằm
  trong **tab Thông tin**, cùng bốn ô số liệu và hàng cảm xúc.
- **Tab bấm được**: Danh sách chương (mặc định) · Thông tin · Bình luận; tích “hiện cả ba mục”
  trên thanh công cụ để xem cùng lúc.
- Tab **Danh sách chương** chỉ còn: thanh công cụ một hàng (tìm · Cũ nhất/Mới nhất · đi tới ·
  số chương) + danh sách 4 cột (số mono + tên chương thật) + phân trang.
- **Cùng couple / cùng tác giả** nằm ngoài tab, sát đáy, hai cột ngăn bằng một đường kẻ,
  mỗi bộ một dòng bìa 30px.

Dữ liệu thật: `data/registry.json`, `data/book/hometown-romance.json`, `assets/covers`.
