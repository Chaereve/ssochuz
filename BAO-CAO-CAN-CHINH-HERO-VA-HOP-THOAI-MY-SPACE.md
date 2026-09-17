# BÁO CÁO · CĂN CHỈNH HERO "MY SPACE / GÓC ĐỌC CỦA BẠN" VÀ HỘP THOẠI TỦ TRUYỆN

> Bản `?v=20260917b` · `CZ_SW_VER = '20260917b'`
> Sửa ở `src/` rồi chạy `npm run build` — bản rút gọn ở thư mục gốc đã sinh lại.
> Kiểm chứng: `node tests/run.js` → **41/41 bài đạt**, trong đó có bài mới
> `tests/t_space_hero.js` khoá riêng phần căn chỉnh này.

---

## 0. Vì sao mấy lần sửa trước "không thấy đổi gì"

Lần này không đổi một vài con số rồi hy vọng nó khớp. Hai lý do khiến các lần
trước không ăn:

1. **Sửa ngọn, không sửa gốc.** Vòng trang trí được căn bằng `left: 20px; top: 50%`
   trên hero, còn ảnh đại diện lại do flex xếp. Đó là **hai hệ toạ độ khác nhau**:
   chỉnh số này thì số kia lại lệch ở cỡ màn hình khác. Chừng nào còn căn bằng số
   cứng thì còn phải căn lại mãi.
2. **`.space-hero` có tới BA bộ luật** trong `cz.css` (khối cơ bản, hai khối
   `@media(max-width:700px)` cũ và khối "editorial hero"). Chúng ghi đè nhau **theo
   thứ tự trong tệp**, không theo ý người viết — nên sửa một chỗ, chỗ khác đè lại,
   và ở một dải màn hình nào đó vẫn lệch.

Cách sửa lần này: **một định nghĩa duy nhất** cho `.space-hero`, và căn chỉnh bằng
**cấu trúc** (phần tử con nằm trong phần tử cha) thay vì bằng toạ độ.

---

## 1. Hero "MY SPACE / GÓC ĐỌC CỦA BẠN" — đo lại từng lỗi

| # | Lỗi nhìn thấy | Nguyên nhân, đo bằng số | Đã sửa |
|---|---|---|---|
| 1 | Vòng tròn sau ảnh **lệch hẳn sang phải**, cắt ngang chữ | `.space-hero-orbit` đặt `left:20px; width:144px` ⇒ tâm vòng ở **x = 92px**; ảnh `112px` do flex xếp nên tâm ở **x = 56px** → lệch **36px ngang** | Vòng là **con của hộp ảnh**, `position:absolute; inset:0` ⇒ đồng tâm **theo cấu trúc**, không thể lệch |
| 2 | Vòng còn lệch nhẹ lên trên | `top:50%` tính theo **padding-box** của hero, còn ảnh căn giữa theo **content-box**; padding trên `42px` ≠ dưới `38px` ⇒ tâm vòng cao hơn tâm ảnh **2px** | Hết: cả hai cùng nằm trong một hộp, cùng một hệ toạ độ |
| 3 | Trên **điện thoại** lệch rõ nhất | `@media(max-width:600px)` dời vòng thành `left:16px; top:28px; width:104px` cho ảnh `78px` ⇒ lệch **29px ngang, 13px dọc** | Một luật duy nhất, cỡ ảnh đổi qua biến `--sp-ava`, vòng tự theo |
| 4 | Dải **601–700px**: ảnh **đè lên chữ** | Một `@media(max-width:700px)` cũ đặt `grid-template-columns: 72px` trong khi luật khác (muộn hơn trong tệp) vẫn cho ảnh `92px` ⇒ ảnh tràn khỏi cột **20px** | Xoá bộ luật trùng; `.space-hero` không còn `grid-template-columns` ở bất kỳ mốc nào |
| 5 | Rối, "không đẹp mắt" | Ba hình trang trí **trôi nổi** không neo vào lưới nào: cung tròn `280px` ở `top:-172px`, vạch chéo `420px` ở `right:-70px`, dấu `✦` + ellipse `inset:14px -8px` — tất cả bị `overflow:hidden` xén nham nhở và cắt ngang chữ | Bỏ cả ba. Giữ **một** vòng tròn đồng tâm + **một** chấm mực cạnh nhãn |
| 6 | Hero "lơ lửng", không ăn nhập với phần còn lại của trang | Hero chỉ có `border-bottom`, trong khi mọi khối khác của My Space (`.space-panel`, `.shelf-detail-panel`, `.profile-card`) đều là **hộp giấy** viền 1px bo `--space-radius` | Hero thành **một hộp giấy** đúng ngôn ngữ đó: viền 1px, bo `--space-radius`, nền giấy, `padding: 28px 32px` |
| 7 | Nút "Chỉnh sửa hồ sơ" trôi mép phải, không có ranh giới với chữ | `margin-left:auto` **vô hiệu** vì `.space-intro` đã `flex:1` chiếm hết chỗ | Cột thao tác riêng `.space-hero-side`: `align-self:stretch` + vạch dọc 1px (cùng chi tiết với `.hdr .grow::after`), nút căn giữa theo chiều cao |
| 8 | Trang **hồ sơ công khai** (`/profile`) nháy chữ lệch trước khi JS chạy | HTML tĩnh chỉ có `<p class="space-kicker">` + `<h1>` trong một hero `display:flex` ⇒ nhãn và tiêu đề **nằm ngang hàng nhau** | HTML tĩnh của `my-space.html` và `profile.html` dựng **đúng khung** JS sẽ dựng (portrait + intro) |

### Kích thước mới — tất cả đi qua biến, trên lưới 4/8px

```css
.space-page { --sp-ava: 104px; --sp-ring: 8px; --sp-gap: 24px; }
@media (max-width: 800px) { .space-page { --sp-ava: 92px;  --sp-gap: 20px; } }
@media (max-width: 600px) { .space-page { --sp-ava: 64px;  --sp-ring: 6px; --sp-gap: 14px; } }
```

Hộp ảnh luôn là `calc(var(--sp-ava) + var(--sp-ring) * 2)` vuông, ảnh `var(--sp-ava)`,
chữ cái dự phòng `calc(var(--sp-ava) * .36)`. **Đổi cỡ ảnh chỉ cần sửa một biến** —
vòng tròn, khe, cỡ chữ tự theo, không còn cặp số nào phải nhớ để căn lại.

Nhịp dọc quanh hero cũng được chốt lại cho nhất quán (trước đó `.space-guest` dùng
`margin: -8px` để "hút" lên đường kẻ của hero, `.space-status` dùng `4px … 18px`):
hero `margin: 20px 0 0` → trạng thái `14px 0 0` → khối khách `18px 0 0` → tab `26px 0 34px`.

---

## 2. Hộp thoại ("Tạo tủ truyện" ở My Space, "Chọn tủ lưu truyện" ở trang truyện)

| # | Lỗi | Nguyên nhân | Đã sửa |
|---|---|---|---|
| 1 | Nút **Đóng dính sát tiêu đề**, mép phải bỏ trống một khoảng lớn | `.sechead` là `display:flex` nhưng **không có** `justify-content`; không ai đẩy nút sang phải | Khung đầu hộp riêng `.space-dialog-head`: `justify-content: space-between`, tiêu đề `flex:1 1 auto; min-width:0`, nút đóng `flex:none` |
| 2 | Tủ nhiều truyện thì **phải cuộn xuống đáy mới thấy nút "Lưu"** | Cả hộp `overflow-y:auto` ⇒ tiêu đề và nút lưu trôi theo nội dung | **Head – body – foot**: đầu và chân `flex:none` cố định, chỉ `.space-dialog-body` cuộn |
| 3 | Hộp thoại ở trang truyện **vuông cạnh, viền đậm** | `--space-radius`/`--space-line` khai báo trên `.space-page`, mà `#storyShelfDialog` được nối vào `<body>` của **trang truyện** (không có class đó) ⇒ `border-radius` về `0`, `border-color` về `currentColor` | Hai biến dời lên `:root` — mọi trang dùng chung một hộp |
| 4 | Nút đóng ở trang truyện **mất màu** | Dùng `.ibo`, lớp này tô màu bằng `--rd-mut/--rd-surf2/--rd-acc` **chỉ tồn tại trên `body[data-rd]`** của trang đọc | Một nút đóng duy nhất `.space-dialog-close` (34×34, viền 1px, bo 10px — cùng họ với `.icon-btn`) cho **cả hai** hộp |
| 5 | Hai hộp **hai kiểu khác nhau** (chữ "Đóng" vs dấu ✕) | Không có khung dùng chung | Cả hai dựng cùng khung head/body/foot |
| 6 | Lớp phủ **lạnh**, lệch tông giấy ấm của web | `rgba(14,16,22,.65)` + `blur(6px)`, trong khi `.modal` dùng `rgba(18,12,8,.56)` | Dùng đúng `rgba(18,12,8,.56)` + `blur(3px)` |
| 7 | Báo lỗi trong hộp ("Tên tủ không được để trống") **không có màu**, nằm lửng giữa hộp | `#shelfMessage` là `<p>` trôi giữa nội dung | Đưa xuống **chân hộp**, cùng kiểu chữ với `#profileMessage`: đỏ `--bad` khi lỗi, xanh `--ok` khi được |
| 8 | `(3/200)` đếm truyện **lẫn vào nhãn**, có ngoặc đơn | `<span id="selectedCount">` nằm trong chuỗi chữ của `<label>` | Tách thành hàng `.fl-title` + `.fl-count` như bộ đếm `0/40`, `0/500` của hồ sơ và `0/2000` của bình luận |
| 9 | Ô "Mô tả" cao **120px** cho 300 ký tự, choán hết hộp | `textarea.inp { min-height: 120px }` áp cho cả hộp thoại | `.space-dialog textarea.inp { min-height: 76px }` |
| 10 | Danh sách chọn tủ **cuộn lồng trong cuộn** | `.shelf-choice-list { max-height:280px; overflow-y:auto }` bên trong hộp cũng cuộn | Bỏ ô cuộn lồng; thân hộp cuộn một cấp |
| 11 | Máy hẹp: nút bấm nhỏ, khó chạm | `.space-dialog { padding: 20px }` rồi để nguyên mọi thứ | ≤700px: lề 16px, thông báo chiếm một dòng, hai nút **chia đều** dòng dưới |

Thêm nút **Huỷ** ở chân hộp (cùng hành động với dấu ✕, cho người quen nút chữ) và
`aria-labelledby="shelfFormTitle"` để trình đọc màn hình đọc đúng tên hộp.

### Một cái bẫy đã tránh (ghi lại để không ai vấp)

`display: flex` **không được** đặt trên `.space-dialog` trơn. `<dialog>` khi đóng được
ẩn bằng luật user-agent `dialog:not([open]) { display: none }`; luật của tác giả thắng
luật UA bất kể độ đặc hiệu, nên đặt `display:flex` trên class sẽ làm **hộp thoại hiện
ra dù chưa mở**. Toàn bộ khung flex vì thế nằm trong `.space-dialog[open]`.

---

## 3. Kiểm chứng

```bash
npm run build     # src/ → bản rút gọn ở thư mục gốc
node tests/run.js # 41/41 đạt
```

Bài mới **`tests/t_space_hero.js`** (jsdom + soi CSS tĩnh, vì jsdom không dàn trang
nên không đo toạ độ được — thay vào đó nó khoá **cấu trúc** khiến việc lệch không
thể xảy ra):

- vòng tròn phải là **con của hộp ảnh** và `inset:0`; cấm `left/top/right/bottom/width/height`
  trong luật của vòng;
- cỡ ảnh/hộp ảnh phải đi qua `--sp-ava`/`--sp-ring`; **cấm** `px` cứng;
- `.space-hero` **không được** có `grid-template-columns` ở bất kỳ đâu (đúng lỗi vỡ 601–700px);
- không còn `.space-hero-orbit` / `.space-hero-rule` / `.space-hero-action`;
- hộp thoại phải có head/body/foot, nút đóng ở cuối hàng tiêu đề, `#saveShelf`/`#cancelShelf`/`#shelfMessage`
  ở chân hộp, `.space-dialog` không đặt `display` ngoài `[open]`, `--space-*` phải có ở `:root`;
- HTML tĩnh của `my-space.html`/`profile.html` phải dựng sẵn cùng khung hero;
- `cz-story.js` phải dựng hộp chọn tủ bằng `.space-dialog-head/body/foot/close`, không dùng `.ibo`;
- chạy thật luồng mở hộp → chọn truyện → bộ đếm `1/200` → lưu → hộp đóng; nút Huỷ và dấu ✕ đều đóng hộp.

Chạy ngược bài này trên **bản cũ** (`git show HEAD:cz.css`) để chắc nó không phải
bài kiểm thử "luôn đạt": nó **bắt được 6/7** lỗi liệt kê ở trên.

---

## 4. Tệp đã đổi

| Tệp | Đổi gì |
|---|---|
| `src/cz.css` | Viết lại hero (một định nghĩa duy nhất, biến `--sp-*`), xoá 3 bộ luật `.space-hero` trùng, khung head/body/foot cho hộp thoại, `--space-*` lên `:root`, nhịp dọc quanh hero, `.space-count` bỏ padding lệch `9px/4px`, `.space-head-tools` thay style inline |
| `src/cz-space.js` | `hero()` dựng `[hộp ảnh (vòng + ảnh)] [chữ] [cột thao tác]`; bộ đếm `0/200` qua `pickedCount()`; nối nút **Huỷ** |
| `src/cz-story.js` | Hộp "Chọn tủ lưu truyện" dựng cùng khung head/body/foot, nút đóng `.space-dialog-close`, bỏ style inline, nút "Xong" dời xuống chân hộp |
| `my-space.html` | Khung hộp thoại mới (`#closeShelf` ở đầu, `#shelfMessage`/`#cancelShelf`/`#saveShelf` ở chân), hero tĩnh đúng khung, `.space-head-tools` thay `style="…"` |
| `profile.html` | Hero tĩnh đúng khung (hết nháy chữ lệch trước khi JS chạy) |
| `tests/t_space_hero.js` | Bài kiểm thử mới |
| `tests/run.js` | Thêm bài mới vào danh sách chạy |
| 62 HTML + `sw.js` | `?v=20260917a` → `?v=20260917b`, `CZ_SW_VER` tăng để trình duyệt **thật sự** tải CSS mới (không đổi `?v=` thì người đọc vẫn xem bản cũ trong cache — đúng cảm giác "sửa mà không đổi gì") |

---

## 5. Còn gì nên làm tiếp (chưa làm trong bản này)

- `tests/t_space_browser.js` vẫn kiểm tra `#localShelf` — khối "danh sách lưu trên
  thiết bị" đã bị bỏ ở bản trước, nên bài đó **đã lỗi thời** (không nằm trong
  `tests/run.js`, chỉ chạy tay với Chromium). Nên viết lại theo khung mới, đo luôn
  toạ độ thật của vòng tròn và ảnh (`boundingBox`) ở 1440/834/700/640/390/320px —
  đó là phép đo trực tiếp cho chữ "lệch", jsdom không làm được.
- Trang `/profile` công khai có thể dùng lại `.space-hero-side` cho nút "My Space
  của tôi ↗" (hiện nằm ở `.space-section-head` bên dưới) để hai trang cùng một nhịp.
