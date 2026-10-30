# Đề xuất · thanh tìm & lọc thư viện (một hàng, không nhãn)

Mở: `index.html` (chỉ trên máy; `/docs/*` bị `_redirects` chặn).
Dev server: <http://127.0.0.1:8081/docs/mockups/library-bar-r52/>.

Đề xuất duy nhất, hướng MangaDex/AniList:

- Bỏ nhãn chữ **Năm** / **Sắp xếp**.
- Bỏ nguyên dãy tab **Tất cả 67 · Hoàn thành 46 · Đang cập nhật 4 · Sắp ra mắt 17 · 18+ 29**
  → tình trạng thành ô chọn, số đếm nằm trong danh sách.
- Số **1–24 / 67** dời lên dòng tiêu đề "Thư viện".
- Thêm ô chọn **tình trạng**; giữ 18+, giữ "Xoá lọc" (chỉ hiện khi có lọc).
- Chỉ ô nhập có khung; mọi điều khiển còn lại là chữ cùng cỡ 13.5px.

Đo thật (Chromium): 1 hàng ở 700 / 860 / 1024 / 1180px, không tràn ngang;
mobile 390px thành 3 hàng (ô nhập · 3 ô chọn · 18+ + Xoá lọc), trước đây là 5 hàng.

`mock.css` viết đúng như thể port vào `src/cz.css`. Chốt thì port vào
`index.html` + `src/cz.css` + phần render chip trong `src/cz-home.js`.
