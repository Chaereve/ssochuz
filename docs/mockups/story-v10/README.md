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

## Vòng 10b · sửa bố cục lệch

Ảnh chụp cho thấy dòng `hProg` **thụt vào 49px** so với `.hC` (1134px), tức dải tiến độ không
thẳng mép trên/dưới với bìa. Nguyên nhân: `.hProg { display: flex }` — nó là con trực tiếp của
`.hC` nhưng `.hProg span` vẫn dính `text-transform` cũ, còn hàng thì bị `margin` của khối trên đẩy vào.
Đã sửa:

- `.hProg` bỏ `display:flex` khỏi ngữ cảnh container, cho `align-items:center` + `margin: 18px 0 0`,
  giữ `border-top` chạy hết bề ngang 1082px bằng `.inC`.
- Bìa canh **đỉnh** với tiêu đề (trước canh giữa nên bìa thấp hơn chữ 13px).
- Hàng 4 nút canh **đáy** với bìa (`margin-top:auto` trong cột chữ) → bìa và cụm nút thẳng đáy nhau,
  không còn mảng trống 60px dưới nút.
- Tiêu đề serif thụt `-2px` để canh quang học với mép bìa.

## Vòng 10c · 18+ lên góc trên

Theo yêu cầu: vòng tròn 18+ dời từ **góc dưới phải** lên **góc trên trái** bìa
(góc trên phải đang là băng rôn “MỚI” nên không đặt được). Dải đáy bìa giờ chỉ còn
**● Hoàn thành**, canh trái.

Vòng tròn có **quầng tối cục bộ** (`rgba(8,6,4,.58)` + blur 4px) để đọc được trên bìa sáng;
mobile hạ còn 19px, cách mép 5px. Khoảng thở ở hàng nút giảm 18px → 10px để phần đầu bớt rỗng.

## Đã port vào site thật (C1)

| Việc | Chỗ sửa |
|---|---|
| Trạng thái rời khỏi hàng meta, thành chữ trên dải mờ đáy bìa | `src/cz-story.js` → `renderStory()`: bỏ `span.pill.<statusCls>`, thêm `span.cvGrad` + `span.cvSt.<statusCls>` trong `.cover` |
| 18+ thành vòng tròn viền ở góc trên trái | `src/cz.css`: khối `.shero .cover .cvGrad / .cvSt / .b18` (thay dòng `top/left: 10px` cũ) |
| Nhãn hạ cỡ trên mobile | `@media (max-width: 900px)`: vòng 20px, chữ 8px, chấm 4px |

Class `.b18` vẫn dùng chung với thẻ lưới (ở đó vẫn là pill đỏ); chỉ trong `.shero .cover` mới đổi
thành vòng tròn. Bìa không ảnh (`.cover.noimg`) được đẩy chữ tên truyện lên 32px để không đè dải
tình trạng. Đo lại ở 1216px: bìa 236×354, vòng 30px cách mép 10px, dải tình trạng cao 46% đáy.

## Port toàn bộ thẻ hero C1 (không chỉ nhãn)

Sau khi so lại với mockup, trang thật vẫn là bố cục cũ → port luôn khung `C1`:
`src/cz-story.js` dựng `#shero > .hC` (nền là chính bìa phóng to + mờ, `.hVeil` phủ tối),
`.in` = 172px bìa | cột chữ `.txtC` (h1 → hàng tác giả `·` → sao đánh giá → tóm tắt 2 dòng
→ hàng nút canh đáy), dải tiến độ `.prog` chạy hết bề ngang thẻ ở đáy.

- Hàng meta đổi từ pill + icon sang **chữ nhỏ ngăn bằng “·”**; dấu `·` do CSS chèn trước
  từng `.mi` nên khi xuống dòng không bị lửng lơ ở cuối dòng.
- Nút chính trong hero là **mực son đặc** (`--acc`, chữ nâu đậm), nút phụ trên nền ảnh.
- Sao đánh giá thu còn một hàng 16px + nhãn 12px (bắt buộc giữ, mockup không có).
- `≤900px`: bìa 150px; `≤620px`: bìa 132px bên trái, tiêu đề canh giữa theo chiều cao bìa,
  hàng meta + phần còn lại xuống hết bề ngang thẻ, nút xếp một cột.

## Hàng nút: đúng 4 nút chính như bản vẽ, việc phụ thu thành icon

Bản vẽ chỉ có **Đọc từ đầu · Chương mới nhất · Theo dõi · Tủ truyện**. Trang thật còn
Chia sẻ / RSS / Đặt lại xác nhận 18+ nên hàng nút bị xuống hai dòng, nặng mặt thẻ.
Nay ba việc phụ gom vào `.btn-utils` cuối hàng dưới dạng **nút vuông 38px chỉ có icon**
(`share`, `rss`, `refresh`), có `title` + `aria-label` để vẫn rõ nghĩa; mobile thì nhóm này
xuống một hàng riêng canh phải, nút chính chiếm trọn một hàng, các nút còn lại chia đôi.
Thêm glyph `rss` vào bộ icon (`src/cz-app.js`) — trước đó nút RSS rơi về icon “info”.
