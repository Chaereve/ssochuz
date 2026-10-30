# Mockup · Badge trên bìa — vòng 10 (tham khảo quy ước thiết kế)

`node docs/mockups/story-v10/gen.mjs` → `index.html`

## Đã tham khảo

- Nhãn kiểm duyệt / độ tuổi trên poster phim, bìa game, app đọc truyện dùng **ký hiệu vòng tròn
  có viền** (“18+” trong vòng tròn) — không phải chữ trần, không phải viên thuốc
  ([mẫu ký hiệu 0+/7+/12+/16+/18+/21+ dạng vòng tròn](https://www.dreamstime.com/illustration/age-rating-symbols.html),
  [bộ icon 18+ vòng tròn viền / nền đặc / viền đỏ](https://www.dreamstime.com/illustration/age-restriction-icons.html)).
- Trạng thái truyện trên các nền tảng đọc (WEBTOON, Inkverse…) luôn là **chữ**: “Completed”, “Ongoing”,
  “On hiatus” — thường đặt cạnh số tập, không đóng hộp
  ([Inkverse: “Completed · 201 episodes”](https://inkverse.co/blog/best-webtoons-of-all-time),
  [WEBTOON: Ongoing / On Hiatus / Completed](https://webtooncanvas.zendesk.com/hc/en-us/articles/32085215350932-FAQ)).

## Kết luận rút ra

Hai nhãn **khác loại** nên phải khác hình thức:

| | Loại | Cách thể hiện |
|---|---|---|
| Hoàn thành | trạng thái (chữ) | chữ in hoa nhỏ, mono, giãn chữ + chấm màu |
| 18+ | nhãn kiểm duyệt (ký hiệu) | **vòng tròn viền 25px**, chữ 8,5px bên trong |

Các bản trước sai vì bắt cả hai mặc cùng một bộ đồ (hai viên thuốc, hai ô chữ nhật, hai khối màu).

## Bốn bản

| Mã | Cách | Ghi chú |
|---|---|---|
| **C1** | Chữ trạng thái trái · vòng tròn 18+ phải, trên dải mờ đáy bìa | đúng quy ước nhất, gần D1 nhất |
| **C2** | Tab mực ôm góc dưới trái (vạch màu 2px bên trái) · vòng tròn góc phải | như nhãn dán kệ sách |
| **C3** | Bìa chỉ còn vòng tròn 18+; trạng thái rời ra cột chữ, dưới tên truyện | bìa sạch nhất |
| **C4** | Nhãn gấp mép: dải mực 27px chữ dọc ở góc trái · vòng tròn góc phải | chất bìa sách |

Kiểm ảnh chụp 1216px + 390px. Lưu ý: mock2.css có `.sc` (nhãn góc thẻ) — đã tránh đặt tên trùng.
