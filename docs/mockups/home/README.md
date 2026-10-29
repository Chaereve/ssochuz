# Mockup · Phương án C + 3 cách bày Thư viện

**Mở:** máy chủ xem thử ở cổng 8080 →

```
http://localhost:8080/docs/mockups/home/
```

(`/docs/*` bị `_redirects` chặn trên bản thật — `tools/dev_server.py` chỉ mở đường
này **trên máy**, xem `serve_mockup()`. `tools/check_secrets.js` vẫn canh đúng luật
chặn đó.)

Trang TĨNH: CSS nhúng trong `<style>`, 67 bìa thật nằm sẵn trong HTML — tắt JS
vẫn thấy đủ. JS chỉ là lớp tiện xem (đổi bề rộng khung, bấm chip lọc, chọn ô chọn,
tắt/bật “Đã có lịch sử đọc”).

Sinh lại sau khi sửa `gen.mjs` / `mock.css`:

```bash
node docs/mockups/home/gen.mjs
```

## Vì sao thư viện bị làm lại

Bản trước có **hai** cơ chế lọc cùng lúc (chip tình trạng + cột lọc bên trái) và
**bốn** ô chọn ngang — cùng một việc bày ở nhiều nơi nên rối, mà vẫn không trả lời
được “đang lọc gì”. Ba cách dưới đây đều chỉ dùng **một** cơ chế.

## Số liệu thật (67 bộ)

| | |
| --- | --- |
| Hoàn thành | 46 |
| Sắp ra mắt | 17 |
| Đang cập nhật | 4 |
| 18+ | 29 |
| Năm 2025 / 2026 / 2023 | 19 / 18 / 11 |
| Couple nhiều nhất | 2 bộ |

⇒ **Bỏ bộ lọc “Couple”** (và tác giả): mỗi couple chỉ 1–2 bộ, lọc theo danh sách
dài không ai dùng — gõ tên vào ô tìm là ra. Năm mới là bộ lọc có nghĩa.

## Ba cách

| | D1 · Hai tầng | D2 · Một hàng | D3 · Mở ra khi cần |
| --- | --- | --- | --- |
| Chiều cao | 2 dòng (~78px) | 1 dòng (~44px) | 1 dòng (~44px) |
| Thấy ngay | 4 tình trạng + 18+ (có số) | không (phải mở ô chọn) | không (phải mở tấm) |
| Số cú bấm để lọc | **1** | 2 | 2 |
| Ghép nhiều điều kiện | có (tình trạng + 18+ + năm) | không | có |
| Máy hẹp | chip xuống dòng | ô chọn cuộn được | tấm mở toàn ngang |

**Đề xuất: D1.** Thư viện 67 bộ, tình trạng là thứ người đọc lọc nhiều nhất — cho
nó một tầng riêng có số lượng là đáng. D2 chỉ hơn D1 đúng một dòng (~34px) nhưng
giấu toàn bộ số lượng; D3 sạch nhất khi chưa lọc nhưng thêm một cú bấm mỗi lần và
người mới sẽ không biết có bộ lọc.

## Ghi chú kỹ thuật khi dựng thật

- Chỉ `transform`/`opacity` cho chuyển động; không `backdrop-filter` trên lớp phủ
  toàn màn hình (luật số 3 đầu `src/cz.css`).
- Lưới dùng `grid-template-columns` + `aspect-ratio: 2/3` sẵn có.
- Lưới thư viện dựng **đủ 67 bộ** trong HTML rồi JS ẩn/hiện 18 bộ khớp: lọc luôn
  tính từ toàn thư viện, không phải từ 18 bộ đang hiện.
- Mọi số lượng lấy từ `data/registry.json`; không hardcode.
- `prefers-reduced-motion` đã có luật chung, khối mới không được lách.

## Đã dựng thật (30/10/2026) — D1

Thanh lọc D1 đã vào trang chủ thật (`index.html` + `src/cz-home.js` + `src/cz.css`):

- Lớp: `.libd / .libbar / .srch / .dd / .librow / .libchips / .lcount / .seg.vseg`;
  chip dựng bằng JS (`renderChips()`) với số đếm lấy từ `CZ.lib()`, **không** hardcode.
- Hai ô `Năm` và `Sắp xếp` vẫn là `<select>` thật (bàn phím, đọc màn hình, danh sách
  quen thuộc của hệ điều hành) nhưng khoác áo `.dd` — không dựng dropdown tự chế.
- Chip tình trạng là **chọn-một**, `18+` là **công tắc riêng**: bấm “Hoàn thành” rồi
  “18+” ra đúng 4 bộ. Số trên chip luôn tính trên toàn thư viện (67/46/4/17/29).
- Bỏ ô chọn Tác giả/Couple; liên kết chia sẻ `?author=…` · `?couple=…` vẫn lọc được
  (nhận cả tên lẫn slug) và vẫn hiện link “Xem tất cả truyện của …”.
- Hàng `.fpick` chỉ còn những điều kiện *không nhìn thấy được* (từ khoá, năm) + nút
  “Xoá lọc”; đang lọc gì thì chip đã nói rồi.
