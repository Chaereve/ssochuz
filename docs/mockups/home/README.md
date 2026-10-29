# Mockup · nửa dưới trang chủ (từ “Đọc tiếp” tới cuối “Thư viện”)

Mở: `python3 -m http.server 8081 -d .` rồi vào
**/docs/mockups/home/index.html** (thư mục `/docs` bị `_redirects` chặn trên bản
thật nên mockup không bao giờ lộ ra ngoài).

- Bìa + tên truyện: **dữ liệu thật** (`data/registry.json`, bìa trong
  `/assets/covers/`).
- Lượt xem, tiến độ đọc, ngày trong tuần: số giả để thấy hình dạng thông tin.
- Thanh trên cùng: đổi khung **Desktop 1240 / Tablet 834 / Mobile 390** (khung
  dùng container query nên bố cục tự chuyển), và bỏ tick **Đã có lịch sử đọc**
  để xem trạng thái người mới.

## Phần chung — nằm trong cả ba phương án

Đây là những thứ **sửa đúng cái đang yếu**, không phụ thuộc chọn A/B/C:

| Hiện tại | Đề nghị | Vì sao |
| --- | --- | --- |
| Kệ 12 bộ nhưng desktop chỉ thấy ~7, 5 bộ giấu sau thanh cuộn ngang | Kệ **6 cột cố định** trên desktop (hết thứ bị giấu); chỉ cuộn ngang ở tablet/mobile | Thanh cuộn ngang trong lưới ảnh gần như không ai dùng — nội dung coi như mất |
| Bìa chỉ có nhãn tình trạng | Thêm **số chương** ở góc dưới phải (và “18+” góc trái) | Trả lời “dài không, đọc mất bao lâu” ngay trên kệ |
| Đầu mục chỉ có tên | Thêm **nhãn mono nhỏ + số lượng** + “Xem tất cả ›” | Người đọc biết mục này có bao nhiêu thứ trước khi bấm |
| “Đọc tiếp” là một kệ như mọi kệ khác, ẩn khi chưa có tiến độ | Thẻ rộng có **thanh tiến độ + “Ch. 34/71 · còn 37”**; khi chưa có lịch sử thì hiện **gợi ý bắt đầu** | Đây là mục hữu ích nhất của web đọc truyện — không được để trống trơn hay lẫn vào các kệ khác |
| Ranking là danh sách chữ + tab | **Số thứ tự lớn** + bìa nhỏ + lượt xem + mũi tên tăng/giảm | Quét bằng mắt nhanh hơn nhiều (cách glvietsub.org làm ở “Xem nhiều nhất”) |

## Ba phương án

| | A · Kệ sách | B · Bảng tin | C · Bento |
| --- | --- | --- | --- |
| Thứ tự | giữ nguyên như hiện tại | Mới cập nhật → Ranking → Thư viện (cột chính), phần cá nhân ở cột phụ | 1 dải bento (Đọc tiếp + Mới + Ranking) → Lịch → Thư viện |
| Điểm mạnh | ít rủi ro nhất, chỉ thay ruột từng khối | “Đang đọc gì” luôn nhìn thấy khi cuộn sâu; lưới thư viện rộng hơn | gọn nhất: một màn hình là đủ; thư viện có cột lọc riêng |
| Điểm yếu | vẫn 5 mục dài, cuộn nhiều như cũ | cột phụ hẹp (322px) nên bìa trong đó nhỏ | thay đổi nhiều nhất, cần duyệt kỹ phần lọc |
| Công dựng | ~1 buổi | ~1 buổi | ~1,5 buổi (thêm cột lọc + đếm số lượng) |
| Giữ “Đọc tiếp” ở đầu trang | ✔ | ✔ (cột phải, dính) | ✔ (ô lớn nhất trong bento) |

Chi tiết từng phương án (và lý do) nằm ngay trên khung xem trong `index.html`.

## Ghi chú kỹ thuật khi dựng thật

- Chỉ dùng `transform`/`opacity` cho chuyển động, không `backdrop-filter` trên
  lớp phủ toàn màn hình (luật số 3 đầu `src/cz.css`).
- Kệ/lưới dùng `grid-template-columns` + `aspect-ratio: 2/3` sẵn có — không
  thêm thư viện, không ảnh mới.
- Mọi số lượng (bộ, chương, lượt xem) lấy từ dữ liệu đã có; không hardcode.
- `prefers-reduced-motion` đã có luật chung, các khối mới không được lách.
