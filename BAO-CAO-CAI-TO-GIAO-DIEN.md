# Báo cáo cải tổ giao diện & tính năng (13/09/2026)

Toàn bộ web dựng lại theo **bố cục hero landing làm chủ đạo**, dùng chung một hệ thống
giao diện cho cả 4 trang: **trang chủ · trang truyện · trang đọc · trang quản trị**.
Năm vòng chỉnh sửa liên tiếp, mỗi vòng đi sâu thêm một lượt: **gọt bớt chỗ thừa**,
**đồng bộ giữa các trang**, **truy lỗi tận gốc** (kể cả lỗi cũ mà trình duyệt không báo ra),
rồi **làm dày chỗ đọc và chỗ quản trị**.
Vòng bốn: thanh điều hướng chương ngay trên đầu trang đọc, xem theo danh sách ở thư viện dựng
lại lần hai, **tab Tổng quan** cho trang quản trị, sửa lỗi hai khung cùng hiện ở trang quản trị.
Vòng năm (bản này thêm) làm năm việc: **cắt hẳn đường dây với Blogger** — đăng bài ngay trên
web; **bỏ mục Phim / Series** cùng dữ liệu chuyển thể; **tách các mục trang chủ ra thành từng
khối riêng** thay vì gom vào một khối tab; **gọn chân trang và làm huy hiệu rõ hơn**;
và **thêm một bộ chuyển động** dùng chung cho cả bốn trang.

---

## 1. Kiến trúc (gọn hơn bản cũ)

| Tệp | Việc |
|---|---|
| `index.html` + `cz-home.js` | trang chủ (hero landing) |
| `truyen.html` + `cz-story.js` | **trang truyện + trang đọc trong cùng một trang** |
| `admin.html` + `admin.js` | trang quản trị |
| `cz-app.js` | lõi dùng chung: dữ liệu, ký ức người đọc, bộ giao diện, đầu trang/chân trang |
| `cz.css` | hệ thống giao diện (1 tệp, đổi `[data-theme]` là đổi cả web) |
| `cz-config.js` | nối web vào Worker KV (1 dòng) |

Bản cũ có `index.html` (125 KB) và `reader.html` (93 KB) — hai tệp tự chứa, chép đi chép lại
CSS/JS, sửa một chỗ phải sửa hai nơi. Bản mới: **1 trang đọc dùng chung**, mở chương không
tải lại trang, nút Back của trình duyệt trả về đúng danh sách chương.

**Đường dẫn**

```
/                     → trang chủ
/truyen/<slug>/       → thông tin truyện + danh sách chương
/truyen/<slug>/#chuong-12 → mở thẳng chương 12
/truyen/<slug>/#page-12   → link cũ, vẫn chạy
/reader?slug=<slug>&ch=5  → link đời cũ, vẫn mở đúng chương
/admin                → trang quản trị
```

`_redirects` giữ cho mọi link cũ còn sống; `sitemap.xml` + `robots.txt` sinh từ
`data/registry.json` bằng `python3 tools/build_sitemap.py --base <tên miền của bạn>`.

> ⚠ **Trong `_redirects`, đích của luật 200 không bao giờ được là tệp `.html`.**
> Cloudflare Pages tự bỏ đuôi `.html` bằng chuyển hướng 308 (`/truyen.html` → `/truyen`),
> nên viết `/truyen/* → /truyen.html 200` là tự tạo vòng lặp
> `/truyen/<slug>/ → /truyen.html → /truyen → /truyen.html → …`, người đọc bấm vào
> truyện sẽ thấy *“redirected you too many times”* (ERR_TOO_MANY_REDIRECTS).
> Viết đúng: `/truyen/* → /truyen 200`. `node tools/check_html.js` và
> `python3 tools/dev_server.py` đều tự bắt lỗi này — xem
> `BAO-CAO-SUA-LOI-TRANG-TRUYEN.md`.

---

## 2. Đã gọt bớt (bớt chỗ thừa, dồn sự chú ý vào thứ đáng đọc)

| Bỏ / gộp | Vì sao |
|---|---|
| Ô lọc **Tình trạng** trong khung lọc thư viện | đã có dãy tab “Hoàn thành / Đang cập nhật / Sắp ra mắt …” ngay dưới — hai chỗ làm một việc |
| Bảng **thông tin** ở trang truyện (6 dòng) | trùng hoàn toàn với hàng nhãn ngay trên tiêu đề |
| Dòng **Chương x/y** ở hàng nhãn trang đọc | thanh đọc phía trên đã ghi; chỉ giữ số từ / số phút đọc |
| Nhãn **18+** lặp ở hero và ở thẻ truyện | hero đã có nhãn 18+ trên bìa |
| Mục **Trang chủ** trong thanh điều hướng | logo đã là đường về trang chủ; thanh còn 4 mục: Thư viện · Mới cập nhật · Xếp hạng · Lịch ra chương |
| Tiêu đề **“Xếp hạng thư viện”** trong tab Khám phá | tên tab đã nói rồi, chỉ còn dãy chọn tiêu chí |
| Dòng nguồn của **Lịch ra chương** ở trên đầu khung | đưa xuống cuối cho giống các khung khác |
| Đoạn giới thiệu lặp ở tab Kết nối của trang quản trị | giữ một chỗ, chỗ còn lại chỉ nói việc cần làm |
| Quãng trống giữa giao diện và bộ chữ | hái lại thang chữ theo từng trang (xem §5) |
| Dòng phụ ở **Danh sách chương** | “9 chương đọc được · 9/45 theo thẻ truyện” nói hai lần một ý — nay chỉ còn “đang có 9/45 chương” |
| Nút **Chương tiếp theo** ở cuối chương | trùng với thanh điều hướng ngay dưới; kiểu phân trang thì thanh lật trang đã làm việc đó — cuối chương nay chỉ còn một lời dẫn |
| Lưới **62 ô tick** khi chọn truyện cho khối hero | rối mắt; nay thêm bằng ô tìm, xếp thứ tự bằng mũi tên, bỏ từng bộ |
| Nút **Báo lỗi / bài gốc** nằm lẫn trong hàng nút | tách thành một dòng chữ nhỏ dưới hàng nút cho hàng nút không rớt dòng |
| Khung **“Không có Worker vẫn dùng được”** | gộp thành một chú thích trong phần kết nối (đã thu gọn) |
| Đoạn giới thiệu dài ở đầu trang quản trị | còn một dòng, phần việc chính lên gần màn hình đầu |
| Mọi đường dẫn **Blogger / blogspot** | menu, chân trang, nút “Bài gốc”, dẫn bình luận, ô “Lấy từ Blogger”, nút “Đồng bộ lại từ Blogger” — bạn chuyển hẳn sang đăng bài trên web |
| Mục **Phim** và **Series** | tab Chuyển thể ở trang chủ, chip lọc, nhãn chuyển thể trên thẻ truyện, dải “Cùng series”, ô chuyển thể trong trang quản trị |
| **Trường dữ liệu chết** trong `registry.json` | `series` (31 nhóm), `movies`, `adapt`/`adaptName` và 7 trường không nơi nào đọc — mỗi bộ còn 14 trường, tệp nhẹ đi hơn một nửa |
| Khối tab gộp **Khám phá** (nay đã bỏ hẳn) | bốn mục chen trong một khối tab — nay mỗi mục là **một khối riêng** trên trang, cuộn là tới |
| Dãy chip lọc **trộn nhiều cấp** | tình trạng lẫn nhãn 18+ trong một hàng — tách thành hai nhóm có nhãn riêng: **Tình trạng** · **Nhãn** |
| **Chân trang ba cột** | “quá cầu kì” — nay một hàng: logo · 6 liên kết · một dòng nguồn dữ liệu |

---

## 3. Lỗi đã sửa (đều có bài kiểm thử chặn tái phát)

| Chỗ | Triệu chứng | Cách sửa |
|---|---|---|
| **Khung “Khám phá”** | mở trang là cả 4 mục (Mới cập nhật · Xếp hạng · Lịch · Chuyển thể) hiện chồng lên nhau | 3 khung thiếu `hide` vì thẻ `<div>` bị **viết hai lần thuộc tính `class`** — trình duyệt âm thầm bỏ cái sau; gộp lại và thêm `tools/check_html.js` để không bao giờ tái diễn |
| **Ảnh bìa bị chặn** | JS văng lỗi `Cannot read properties of null (reading ‘classList’)` lặp lại nhiều lần | xử lý ảnh `onerror` rải trong HTML không an toàn khi ảnh đã bị gỡ khỏi trang; gộp một chỗ bắt `error`/`load`, thêm chốt null |
| **Chip lọc thư viện** | hiện chữ nội bộ “done” thay vì “Hoàn thành” | lấy nhãn từ chính dãy tab |
| **Đánh số chương** | danh sách ghi dòng 2 là “Chương 1”, thanh đọc ghi “Chương 2/9”, nhãn điều hướng khi đã ở chương 3 vẫn ghi “Chương 2” | số chương lấy từ **tiêu đề** (“Chương 1: …”) thay vì vị trí; chương không ghi số (Lời Mở Đầu) hiện đúng tên; nhãn “Chương 3/8” thay cho “Chương 2/9” |
| **Nút “Xuất JSON thư viện”** ở trang quản trị | bấm là văng lỗi ở môi trường không có Blob | dùng hàm tải tệp chung, có đường lùi sang `data:` |
| **Dải số trang chủ** | có lúc đứng ở “0 bộ truyện / 0 chương” | thêm lưới an toàn: trình duyệt/khung ẩn không đếm động thì điền thẳng số |
| **Nhãn số chương** | chỗ ghi “10/10 chương”, chỗ ghi “10/10”, chỗ ghi “10/10 chương chương” | một hàm dùng chung: “9/45 chương”, đủ chương thì “36 chương” |
| **Bảng xếp hạng** | mặc định sáng ở “Mới cập nhật” trong khi có số liệu thật | đọc được số Firebase là mặc định xếp theo **lượt đọc**; thêm kiểu sắp xếp “Đọc nhiều nhất” ở thư viện; nút “Thích” giữ số phiếu (“Đã thích · 56”) |
| **Trang quản trị mở lên** | chỉ có form đăng nhập, không thấy dữ liệu cho tới khi bấm | có khoá đã lưu thì tự nối lại; chưa có thì tự mở dữ liệu tĩnh ngay |
| **Xem theo danh sách** ở thư viện | lưới ép 3 cột, tên truyện rớt dòng thành một cột chữ, không có mô tả, không dùng được | mỗi bộ một hàng: bìa · tên + tình trạng · couple/tác giả/năm · mô tả 2 dòng · số chương · năm · thanh tiến độ đọc |
| **Biểu tượng trong trang quản trị** | ô `<span data-ic>` không được thay bằng hình (mũi tên/kính lúp chỗ hiện chỗ không) | thay ngay lúc mở trang, như hai trang kia |
| **Khối xám chờ** ở thư viện | mở trang là khoảng trắng tới khi dữ liệu về | hiện 12 khung xám kèm dòng “đang tải dữ liệu…” |
| **Lọc tình trạng** | ô xổ xuống rỗng, bấm không có gì (bản cũ) | đã bỏ để khỏi trùng với dãy tab |
| Nút **Xác nhận** trong hộp thoại | bấm OK mà coi như “Huỷ” | sửa `confirmBox()` trong `cz-app.js` |
| Kệ **Đọc tiếp / Tủ truyện** | xoá hết truyện rồi kệ vẫn còn thẻ cũ | xoá nội dung kệ trước khi ẩn |
| Tìm nhanh (⌘K / phím `/`) | phím Esc không đóng | thêm xử lý Esc toàn trang |
| Khi Worker KV lỗi | mỗi lần mở trang lại chờ 9 giây | lỗi một lần là ghi nhớ trong phiên, đi thẳng vào `/data` |

| **Trang quản trị: hai khung chồng nhau** | mở trang là khung *Tổng quan* và khung *Thư viện* cùng hiện, cuộn xuống thấy bảng dữ liệu dính ngay dưới phần tổng quan | khung Thư viện thiếu `hide` (bản cũ mặc định mở Thư viện) — nay `#pane-list` có `hide` và `boot()` gọi `show('overview')` |
| **Cuối chương: hai hàng chuyển chương** | vừa dòng “Hết chương · chương kế tiếp” vừa nút chuyển chương lặp lại | giữ **một** hàng nút ở `#rdNav`, thêm cặp nút ←/→ lên thanh trên; hết chương chỉ còn một dòng nhắc |
| **Thanh trên trang đọc** | muốn sang chương kế phải cuộn xuống cuối | thêm ←/→ cạnh nhãn chương, chương đầu/chương cuối thì nút đó mờ đi |
| **Xem theo danh sách (lần hai)** | hàng vẫn dễ rối: tình trạng nằm chung dòng tên, nhãn số chương dính sát nút, không có dòng tiêu đề cột | mỗi hàng có vạch màu tình trạng ở lề trái, cột phải xếp dọc *tình trạng → số chương → năm*, nút đổi thành “Đọc tiếp” / “Xem truyện”, thêm dòng tiêu đề **Bộ truyện · Tình trạng · chương** |
| **Xem theo danh sách trên điện thoại** | dòng tiêu đề cột chữ dính liền nhau, cột tình trạng · số chương bị giấu nên hàng nào cũng giống hàng nào | máy nhỏ: ẩn dòng tiêu đề cột (hai cột thì nó vô nghĩa), đưa tình trạng + số chương + năm xuống thành một dòng dưới mô tả |
| **Thanh trên trang đọc trên điện thoại** | tên truyện co lại còn một chữ “T…”, nhãn chương rớt thành ba dòng số | thanh đọc một hàng gọn: nút về trang truyện · tên truyện + số chương · ←/→ · mục lục · cài đặt · chia sẻ (đánh dấu và chế độ tập trung để ở hàng nút cuối chương) |
| **Nút trong trang quản trị** | “Ngắt kết nối” hiện cả khi chưa nối gì; thanh trên ở điện thoại chen chúc, ô số liệu dài một cột | nút chỉ hiện khi đã nối; thanh trên xuống dòng, ô số liệu chia hai cột |
| **Bảng xếp hạng / Bàn đọc khi ảnh hỏng** | ảnh bìa bị gỡ khỏi trang là hàng co lại, tên truyện còn “Thi…”, tác giả rớt ba dòng | ảnh nằm trong khung cố định (`.rk-th`, `.ct-th`): gỡ ảnh thì cột vẫn đứng yên |
| **Thanh trên ở máy nhỏ** | viết lại chân trang làm mất luôn luật ẩn menu của máy nhỏ — nút burger bấm không ra gì | trả luật về đúng khối `@media (max-width:760px)`; `check_css.py` báo ngay lớp `searchbtn-txt` mồ côi |
| **Huy hiệu “Mới”** | nằm đè lên nhãn tình trạng trên thẻ hẹp | đưa xuống chân ảnh bìa, đứng cạnh nhãn số chương |
| **Ô “Link bài gốc” trong trang quản trị** | bỏ ô mà quên chỗ đọc → `saveMeta` văng lỗi khi lưu | kiểm thử `cf_admin_test` bắt được; gỡ nốt chỗ đọc và hai trường dữ liệu thừa |
| **Nhãn nhóm lọc** | “TÌNH TRẠNG” rớt thành hai dòng | cột nhãn đủ rộng, không xuống dòng |

**Kiểm thử tự động**: `cd tests && node run.js` → **8/8 bài đạt** (~85 giây), không lỗi JS nào.

```
✓ t_config      cấu hình Worker
✓ t_html        soi HTML tĩnh: thuộc tính trùng, liên kết hỏng, biểu tượng thiếu
✓ t_home        trang chủ: hero, số liệu, bàn đọc, bốn khối riêng, thư viện
✓ t_stats       số liệu Firebase thật: xếp hạng theo lượt đọc/bình chọn
✓ t_story       trang truyện + trang đọc (kể cả đánh số chương)
✓ t_flows       luồng người dùng: cài đặt đọc, phím tắt, ảnh, sáng/tối, quản trị
✓ t_sweep       bấm hết mọi nút trên cả 4 trang, không lỗi JS nào
✓ cf_admin_test trang quản trị với Worker giả
```

Kèm ba công cụ dò lỗi im lặng, chạy độc lập:

```
node tools/check_html.js    HTML: thuộc tính trùng · liên kết hỏng · thiếu biểu tượng
node tools/check_calls.js   JS: gọi hàm không tồn tại (lỗi chỉ hiện khi bấm trúng)
python3 tools/check_css.py  lớp CSS dùng mà chưa định nghĩa / định nghĩa mà không dùng
```

---

## 4. Từng trang có gì

**Trang chủ — hero landing (`/`)**
Khối mở đầu lớn chạy 5 bìa truyện (tự chuyển 8 giây, có nút chọn), nút “Đọc tiếp / Trang truyện /
Lưu vào tủ”. Bên dưới: dải số liệu thật, kệ **My Space** (Đang đọc dở · Tủ truyện, chỉ
hiện khi bạn đã đọc/lưu), rồi **bốn khối riêng** — *Mới cập nhật · Xếp hạng · Lịch ra chương* —
mỗi mục một khối, cuộn là tới, không gom vào một khối tab; sau đó là **Thư viện truyện**: tìm
kiếm, lọc năm/tác giả/couple, nhóm **Tình trạng** và nhóm **Nhãn** tách riêng, kiểu sắp xếp
(có “Đọc nhiều nhất”), xem lưới/danh sách, phân trang.

**Trang truyện (`/truyen/<slug>/`)**
Bìa lớn + nhãn (tình trạng · số chương · tác giả · couple · năm · cập nhật), nút đọc, lưu vào tủ,
chia sẻ, báo lỗi chữ; danh sách chương có tìm, sắp xếp cũ/mới, nhảy số chương, dấu đã đọc/đã đánh
dấu; dải liên quan theo couple / tác giả; bình luận khi gắn giscus, chưa gắn thì phần bình luận
được giấu (không dẫn đi đâu nữa).

**Trang đọc (trong cùng trang truyện)**
Nền Sáng/Kem/Xám/Tối, 4 cỡ chữ, 3 độ rộng, 3 giãn dòng, chữ có chân/không chân, căn đều,
chế độ **lật trang** hoặc **cuộn**, thanh tiến độ theo chương, mục lục trong ngăn kéo,
chế độ tập trung, tự ẩn thanh công cụ sau 3 giây, phím ←/→/Space/B/F/L/`?`/Esc, vuốt trên
điện thoại, Thích · Lưu vào tủ · Đánh dấu · Bình luận · Báo lỗi · Chia sẻ, ảnh trong bài bấm ra
xem lớn. Đổi cỡ chữ / nền / kiểu xem giữa chừng thì **giữ nguyên chỗ đang đọc**.
Mọi lựa chọn lưu trong máy nên mở lại là y như cũ.

**Danh sách thư viện (xem theo hàng)**
Dòng tiêu đề cột, vạch màu tình trạng ở lề trái từng hàng (hoàn thành / đang cập nhật / sắp ra mắt),
bìa, tên truyện + slug, tác giả · couple, mô tả ngắn, huy hiệu **Mới** cho bộ vừa lên chương, rồi
tới cột phải: nhãn tình trạng, số chương, năm và nút **Đọc tiếp** (bộ đang đọc dở) hay **Xem truyện**. Quét một lượt là thấy bộ nào
cần đọc tiếp, bộ nào chưa ra chương nào.

**Trang quản trị (`/admin`)**
Dãy tab theo kiểu bảng điều khiển (dính dưới thanh trên khi cuộn), phím **1…8** đổi tab:
**Tổng quan** · Thư viện · Đăng chương nhanh · Thêm bộ · Sửa bộ & chương · Cài đặt & đồng bộ ·
Số liệu thật · Trợ giúp. Tab Tổng quan mở sẵn mỗi lần vào: bảy ô số liệu, mục **Việc nên xem lại**
(thiếu mô tả, thiếu ảnh bìa, thiếu couple, thiếu năm, nhãn số chương lệch, bộ “sắp ra mắt” đã lâu) — mỗi việc kèm sẵn vài tên bộ và nút **Xem danh sách** để lọc thẳng
ra bảng Thư viện rồi bấm **Bỏ lọc** quay về; dưới cùng là **Mới cập nhật**. Phần nối Worker thu gọn
một khối, chỉ mở khi cần. Ưu tiên đọc/ghi qua Worker + KV (sửa là người đọc thấy sau 1–2 giây);
chưa nối Worker vẫn xem và sửa được `/data/*.json`, thay đổi giữ nháp trong máy, có sao lưu /
phục hồi 1 tệp JSON. Danh sách chương xếp trên xuống dưới, số `#n` là thứ tự dữ liệu (số người
đọc thấy là số trong tiêu đề chương), có nhãn “mới nhất” và nút lên/xuống/sửa bằng biểu tượng.
Chọn nhiều dòng rồi dùng ô **việc cần làm** ở thanh trên để đổi tình trạng hoặc gắn/bỏ nhãn 18+
cho cả loạt. Ô **Đăng chương nhanh** nay có nút **Mở từ tệp trên máy** (nhận `.txt`, `.md`,
`.html`): mở tệp là tiêu đề + nội dung tự vào ô soạn, `.html` thì hiểu thẳng thẻ, tệp chữ thì
tách đoạn giúp — không còn phải dán link Blogger.

---

## 5. Một hệ thống, bốn trang

- **Cùng một khung**: bề ngang chuẩn 1180px, trang chủ 1220px, trang đọc 1080px (mắt đỡ quét
  ngang), trang quản trị 1400px (bảng dữ liệu cần chỗ) — cùng lề, cùng nhịp dọc.
- **Cùng một bộ chữ**: tiêu đề chữ có chân, thân bài không chân, nhãn nhỏ in hoa giãn chữ.
- **Cùng một tông giấy**: nền `#faf8f4`, đường kẻ mảnh 1px, màu mực làm điểm nhấn `#a63a52`;
  sáng/tối đổi ở một biến, cả 4 trang đổi theo và nhớ lựa chọn của bạn.
- **Cùng một cách nói**: “9/45 chương”, “còn 6 chương”, “mới nhất”, “Sắp ra mắt” — không chỗ
  nào dùng chữ hay khoá dữ liệu riêng.
- **Cùng một hành vi**: chip lọc bấm ra là bỏ được, tab nào cũng nhớ, mọi nút đều có phản hồi,
  mọi thay đổi đọc/ghi đều báo bằng một dòng trạng thái.

---

## 6. Chuyển động & tiểu tiết (vòng năm)

Một bộ chuyển động dùng chung, đặt trong `cz.css` (§11) + `cz-app.js`, tôn trọng thiết lập
“giảm chuyển động” của hệ điều hành — bật là mọi hiệu ứng tự tắt, chỉ còn đổi màu.

| Nhóm | Có gì |
|---|---|
| **Trỏ & bấm** | nút nhấc nhẹ + đổ bóng khi trỏ, lún xuống khi bấm, **gợn sóng** ngay chỗ con trỏ; thẻ truyện nhấc lên, ảnh bìa phóng rất nhẹ; liên kết đổi màu mượt (0,18–0,26 giây) |
| **Nhập liệu** | ô nhập sáng viền khi trỏ vào, nhãn nhích lên khi gõ; nút “xoá ô tìm kiếm” hiện đúng lúc |
| **Cuộn trang** | bốn khối trang chủ **hiện dần khi cuộn tới**; cuộn mượt khi bấm neo; thanh trên **thu nhỏ lại rồi trượt đi** khi cuộn xuống, hiện lại ngay khi cuộn lên; vạch tiến độ đọc trang ở mép trên |
| **Đổi trang** | bấm một liên kết là vạch tiến độ chạy trước, nội dung trang mới **hiện dần** thay vì nhảy khô |
| **Hộp thoại & ngăn kéo** | nền mờ dần kèm **làm nhoè nhẹ**, hộp thoại bật lên từ giữa (phóng nhẹ), ngăn kéo trượt vào; hộp tìm nhanh (⌘K) cùng kiểu |
| **Mở/đóng** | menu máy nhỏ và các khối gấp mở/đóng **theo chiều cao**, không giật cục |
| **Huy hiệu** | nhãn tình trạng có nền màu nhạt theo trạng thái, nhãn **18+** chuyển sắc đỏ nổi bật, huy hiệu **Mới** cho bộ vừa lên chương, số đếm trong tab thành viên thuốc |

---

## 6b. Hệ thống hiệu ứng (vòng sáu) — theo đúng “nhịp” đã thống nhất

Một bảng nhịp duy nhất trong `cz.css`, áp cho cả bốn trang:

| Nhịp | Dùng ở đâu |
|---|---|
| `cubic-bezier(.25, 1, .5, 1)` | mọi chuyển động chính: trượt, nhấc, mở/đóng |
| 0,18 – 0,26 giây | phản hồi nhỏ: trỏ, bấm, đổi màu chữ, gợn sóng |
| 0,4 – 0,45 giây | đổi bố cục, đổi trang, chuyển chương |

**Trang chủ & thư viện**

- Thẻ truyện khi trỏ: ảnh bìa phóng **1,04**, bóng đổ hạ xuống và nhoè `0 15px 30px rgba(0,0,0,.15)`,
  tiêu đề **nhích lên 4px** rồi đổi sang màu nhấn; bấm thì lún nhẹ.
- Băng nổi bật: banner cũ **mờ dần rồi trượt sang trái**, banner mới **vào từ phải** và hiện dần, kèm
  **nhoè chuyển động rất nhẹ** (2–5px) cho cảm giác như phim.
- Lúc danh sách đang tải: khung xám có **vệt sáng chạy từ trái sang phải**.

**Trang truyện**

- Gạch chân của ba thẻ *Giới thiệu / Danh sách chương / Đánh giá* **trượt ngang** từ thẻ cũ sang thẻ
  mới chứ không tắt đi bật lại (đo được: khớp đúng mép thẻ đang mở).
- Nội dung mỗi thẻ **hiện dần và nhích lên 10px**.
- Nút lưu vào tủ / thả tim: **phồng lên 1,3 rồi nảy về 1**, màu tô dần trong 0,2 giây.
- Bộ dài: mỗi nhóm 24 chương **mở/đóng theo chiều cao mượt** (`grid-template-rows`), không cắt cụt.

**Trang đọc**

- Đổi chương theo đúng hai kiểu đọc: **cuộn liên tục** thì nội dung **mờ dần rồi hiện lại** (không đẩy
  chữ sang ngang vì mắt đang ở giữa trang) + vệt quét mảnh trên thanh trên; **phân trang** thì chương cũ
  **trượt sang trái + mờ**, chương mới **vào từ phải + nhoè nhẹ** — bố cục **không nhảy** ở cả hai kiểu.
- Thanh công cụ nổi: cuộn xuống thì **trượt lên khỏi màn hình**, vừa cuộn lên là **về ngay**; đứng yên
  3 giây cũng tự ẩn cho đỡ vướng.
- Đổi tông nền đọc: `background-color` và `color` **chuyển trong 0,4 giây**, không chớp sáng.

**Lỗi tìm thấy và đã sửa trong vòng này**

- Bấm tab trong thư viện (Hoàn thành / Đang cập nhật / Sắp ra mắt) lọc đúng nhưng **dãy tab không đổi
  trạng thái** — giờ tab, gạch chân trượt và `aria-selected` chạy theo bộ lọc.
- Ô **Đi tới chương**: gõ số chương nhìn thấy trên danh sách lại nhảy lệch một chương ở truyện có
  “Lời Mở Đầu”; giờ dò đúng số in trên tên chương, thêm nút **Đi** và nhận phím Enter.
- Bìa hỏng hoặc thiếu ảnh: khung bìa **hiện tên truyện** thay vì để trống trơn (trước đó còn có thể
  ném lỗi JS khi ảnh lỗi sau khi trang vẽ lại).

---

## 7. Cần bạn làm (theo thứ tự)

1. **Deploy**: gộp PR này vào `main` (Cloudflare Pages tự build). Sau đó mở thử `/`, một trang
   truyện, `/admin`.
2. **Sitemap**: chạy `python3 tools/build_sitemap.py --base https://<tên-miền-thật>` rồi commit
   lại `sitemap.xml` + `robots.txt` (bản trong repo đang dùng `https://chuseoz.pages.dev`).
3. **Số liệu thật (lượt đọc / bình chọn)**: hiện Firebase `chuseoz-library` còn chặn quyền đọc nên
   web **không hiện số nào** (cố ý, không đoán số — và bảng xếp hạng tự chuyển sang xếp theo ngày
   cập nhật / số chương). Mở quyền đọc cho Firestore là có số ngay, không cần sửa code.
4. **Bình luận**: điền `settings.giscus.repo` + `repoId` trong tab *Cài đặt* nếu muốn bình luận
   ngay trên web (chưa gắn thì web giấu phần bình luận, không dẫn đi đâu nữa).

---

## 8. Còn lại / giới hạn đã biết

- **Số chương** hiện lấy từ tiêu đề chương (“Chương 1: Học Sinh Mới” → Chương 1). Chương nào
  không ghi số (Lời Mở Đầu, Ngoại truyện…) thì hiện đúng tên, không gán số. Nếu sau này bạn muốn
  đánh số lại toàn bộ theo thứ tự đăng, chỉ cần đổi một hàm `chapSplit()` trong `cz-story.js`.
- 17/62 bộ chưa có chương (“Sắp ra mắt”) — nút đọc chỉ bị khoá, không dẫn đi đâu nữa.
- Ảnh bìa lấy từ `images.justwatch.com`; nếu host chặn hotlink thì thẻ truyện để lại khung giấy
  có chữ “chuseoz” mờ, không hiện icon ảnh vỡ.
- Trang quản trị cần `ADMIN_KEY`; khoá chỉ nằm trong localStorage của máy bạn.
- Số ở tab **Tổng quan** đếm từ chính nguồn đang mở — đã nối Worker thì là số trên KV, chưa nối thì
  là `/data/*.json` trong repo; nút **Đọc lại dữ liệu** nạp lại nguồn đang dùng.
- Mục **Việc nên xem lại** chỉ là gợi ý dọn dữ liệu (thiếu mô tả / bìa / couple / năm, nhãn số chương
  lệch, bộ “sắp ra mắt” quá 45 ngày) — không phải lỗi, bấm vào là ra danh sách để sửa.
- Ảnh chụp màn hình trong bài này không kèm theo repo; muốn xem lại giao diện thì mở
  `python3 tools/dev_server.py --port 8080` rồi vào `http://localhost:8080/`.
- Phần **Worker** còn hai cửa `/api/import` + `/api/sync` của luồng Blogger cũ và `tools/sync_blogger.py`
  — web không gọi tới nữa, cứ để đó cũng vô hại; muốn dọn hẳn thì xoá theo, web không phụ thuộc.
