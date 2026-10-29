# Mockup · nửa dưới trang chủ (từ “Đọc tiếp” tới cuối “Thư viện”)

**Mở:** máy chủ xem thử đang chạy ở cổng 8080 →

```
http://localhost:8080/docs/mockups/home/
```

(`/docs/*` bị `_redirects` chặn trên bản thật — `tools/dev_server.py` chỉ mở
đường này **trên máy**, xem `serve_mockup()`. `tools/check_secrets.js` vẫn canh
đúng luật chặn đó, nên tài liệu nội bộ không lộ ra ngoài.)

## Trang này là trang TĨNH

`index.html` **đã chứa sẵn toàn bộ nội dung** (CSS nhúng trong `<style>`, 67 bìa
thật). Tắt JS vẫn thấy đủ mọi khối — bản trước dựng toàn bộ bằng JS nên mở ra chỉ
có khung rỗng, đó là lỗi.

JS chỉ là lớp tiện xem: đổi bề rộng khung (Máy tính / Tablet 834 / Điện thoại
390), bấm chip lọc, bấm cột lọc ở phương án C, tắt/bật “Đã có lịch sử đọc”.

Sinh lại trang sau khi sửa `gen.mjs` hoặc `mock.css`:

```bash
node docs/mockups/home/gen.mjs
```

Nguồn dữ liệu: `data/registry.json` + `assets/covers/*.webp` (bìa thật). Lượt
xem, tiến độ đọc, ngày trong tuần là số giả để thấy hình dạng thông tin.

## Phần chung — nằm trong cả ba phương án

| Hiện tại | Đề nghị | Vì sao |
| --- | --- | --- |
| Kệ 12 bộ nhưng desktop chỉ thấy ~7, 5 bộ giấu sau thanh cuộn ngang | Kệ **6 cột cố định** trên desktop; chỉ cuộn ngang ở tablet/mobile | Thanh cuộn ngang trong lưới ảnh gần như không ai dùng — nội dung coi như mất |
| Bìa chỉ có nhãn tình trạng | Thêm **số chương** góc dưới phải, “18+” góc trái | Trả lời “dài không, đọc mất bao lâu” ngay trên kệ |
| Đầu mục chỉ có tên | **Nhãn mono nhỏ + số lượng** + “Xem tất cả ›” | Biết mục này có bao nhiêu thứ trước khi bấm |
| “Đọc tiếp” là một kệ như mọi kệ khác | Thẻ rộng có **thanh tiến độ + “Ch. 34/71 · còn 37”**; chưa có lịch sử thì hiện **gợi ý bắt đầu** | Mục hữu ích nhất của web đọc truyện — không để trống trơn |
| Ranking là danh sách chữ | **Số thứ tự lớn** + bìa nhỏ + lượt xem + mũi tên tăng/giảm | Quét bằng mắt nhanh hơn (cách glvietsub.org làm ở “Xem nhiều nhất”) |

## Ba phương án

| | A · Kệ sách | B · Bảng tin | C · Bento |
| --- | --- | --- | --- |
| Thứ tự | giữ nguyên như hiện tại | Mới cập nhật → Ranking → Thư viện; phần cá nhân ở cột phụ | dải bento (Đọc tiếp + Mới + Ranking) → Lịch → Thư viện |
| Mạnh | ít rủi ro nhất | “đang đọc gì” luôn trong tầm mắt | gọn nhất, lọc tốt nhất |
| Yếu | vẫn 5 mục dài | cột phụ 322px nên bìa nhỏ | thay đổi nhiều nhất |
| Công dựng | ~1 buổi | ~1 buổi | ~1,5 buổi |

Chi tiết từng phương án nằm ngay trên khung xem trong `index.html`.

## Ghi chú kỹ thuật khi dựng thật

- Chỉ `transform`/`opacity` cho chuyển động; không `backdrop-filter` trên lớp
  phủ toàn màn hình (luật số 3 đầu `src/cz.css`).
- Kệ/lưới dùng `grid-template-columns` + `aspect-ratio: 2/3` sẵn có — không
  thêm thư viện, không ảnh mới.
- Mọi số lượng lấy từ dữ liệu đã có; không hardcode.
- Lưới thư viện dựng **đủ 67 bộ** trong HTML rồi JS ẩn/hiện 18 bộ khớp: lọc luôn
  tính từ toàn thư viện, không phải từ 18 bộ đang hiện.
- `prefers-reduced-motion` đã có luật chung, khối mới không được lách.
