# TÀI LIỆU BÀN GIAO — Mockup admin ssochuz library

> **Phạm vi:** thiết kế lại giao diện cho **chức năng đã có**. Không thêm màn hình, tab, thanh toán/xu, light mode, ảnh stock hay thư viện UI ngoài. Mọi tên truyện, tên người, số liệu và nội dung đều là **DỮ LIỆU MẪU**. File mockup mở bằng double-click, không cần server.

## 0 · Cấu trúc bàn giao

| File | Nội dung |
| --- | --- |
| `PHASE-1-NGHIEN-CUU.md` | Bài viết nghiên cứu Phase 1 (≤ 400 từ): JTBD, 5 giả thuyết điểm đau, 5 tham chiếu, 5 nguyên tắc, phê bình IA. |
| `ssochuz-admin-mockup.html` | **MỘT file HTML duy nhất**, tự chứa (inline CSS/JS): đăng nhập + 13 tab, 4 trạng thái/màn, biến thể khung, tương tác. Có cả nút **Tài liệu bàn giao** để đọc tài liệu này ngay trong file. |
| `TAI-LIEU-BAN-GIAO.md` | File này: Phase 2, ma trận màn hình, nhật ký quyết định, Phase 4, đề xuất thêm. |
| `README.md` | Chỉ dẫn mở file và đối chiếu tiêu chí nghiệm thu. |

**Lưu ý về số tab:** owner xác nhận site do một người tự dịch truyện đã mua và đăng, không có tác giả hay nhân sự khác. Vì vậy **bỏ 2 tab Tác giả, Vai trò** (cả nhóm Người dùng); mockup còn **13 tab / 5 nhóm**, giữ nguyên tên và thứ tự các nhóm còn lại. Trường metadata "Tác giả gốc" vẫn giữ để ghi tác giả nguyên tác.

---

## 1 · PHASE 2 — HỆ THỐNG THIẾT KẾ

### 1.1 Màu: 16 token bắt buộc tại `:root`

Tất cả màu dùng trong CSS được khai báo một lần tại `:root`. Không có hex/rgb/hsl nào nằm rải rác trong CSS (kiểm tra tĩnh: 0 literal ngoài `:root`).

| Token | Giá trị | Vai trò |
| --- | --- | --- |
| `--bg` | `#14110E` | Nền chính, tối ấm |
| `--bg2` | `#100D0B` | Sidebar sâu hơn một bậc |
| `--surf` | `#1C1814` | Mặt thẻ / bảng |
| `--surf2` | `#241F19` | Input, thead, mặt nâng |
| `--surf3` | `#2E2720` | Hover, chip, cột biểu đồ |
| `--txt` | `#F2ECE4` | Chữ chính |
| `--mut` | `#B8AC9E` | Chữ phụ |
| `--dim` | `#A79B8D` | Nhãn mono nhỏ (vẫn ≥ 4.5:1 trên mọi mặt) |
| `--acc` | `#F291B4` | **HỒNG — giá trị tạm**: chỉ hành động chính, tab chọn, focus, số đếm |
| `--acc-soft` | `#3A2230` | Nền tab đang chọn |
| `--bd` | `#332C25` | Vạch tóc |
| `--bd2` | `#4A4036` | Viền điều khiển |
| `--ok` | `#86D9AA` | Thành công |
| `--warn` | `#EFC281` | Cảnh báo |
| `--bad` | `#FF9A97` | Lỗi / nguy hiểm |
| `--ring` | `#F7BBD1` | Focus ring 2px |

Biến phái sinh (cũng tại `:root`, để mọi cặp nền/chữ đều là biến): `--ink`, `--ok-bg`, `--warn-bg`, `--bad-bg`, `--info`, `--info-bg`, `--violet`, `--violet-bg`, `--slate`, `--slate-bg`, `--neutral-bg`, `--cover-1` … `--cover-6`, `--scrim`. **Bìa truyện là ô màu CSS**, không ảnh ngoài.

### 1.2 Kiểm tra tương phản (WCAG 2.1, tối thiểu 4.5:1)

| Cặp | Tỉ lệ | Cặp | Tỉ lệ |
| --- | --- | --- | --- |
| `--txt` / `--bg` | 16.03 | `--mut` / `--bg` | 8.45 |
| `--txt` / `--surf3` | 12.54 | `--mut` / `--surf3` | 6.61 |
| `--dim` / `--bg` | 6.91 | `--dim` / `--surf3` | 5.41 |
| `--dim` / `--warn-bg` | 4.92 | `--dim` / `--ok-bg` | 5.02 |
| `--acc` / `--acc-soft` | 6.53 | `--ink` / `--acc` | 8.34 |
| `--ink` / `--ring` | 11.42 | `--ink` / `--bad` | 9.08 |
| `--ok` / `--ok-bg` | 8.14 | `--warn` / `--warn-bg` | 8.10 |
| `--bad` / `--bad-bg` | 7.26 | `--info` / `--info-bg` | 7.96 |
| `--violet` / `--violet-bg` | 7.71 | `--slate` / `--slate-bg` | 7.78 |
| `--txt` trên 6 ô bìa | 10.14 – 11.99 | `--ring` / `--bg` | 11.63 |

**Giá trị nhỏ nhất đo được: 4.92:1.**

### 1.3 Font, quy mô, component

- **Font:** `Fraunces` (serif: tiêu đề, số lớn) · `Inter` (sans: nội dung) · `IBM Plex Mono` (nhãn nhỏ in hoa). Chỉ dùng Google Fonts; có fallback hệ thống nên vẫn đọc được khi mở offline.
- **Quy mô:** lưới 8px (`--s1` … `--s5`); điều khiển 38–42px desktop, ≥ 44px mobile; bo 6/8/12px; **không bóng đổ**, không gradient; vạch tóc 1px; focus ring `2px solid var(--ring)`.
- **Component:** nút (chính / phụ / ghost / nguy hiểm), input, select, checkbox & switch tự vẽ, tab, bảng (thead dính), thẻ, badge đủ tone (`ok / warn / bad / info / violet / slate / neutral / acc`), tag chip, modal xác nhận (ví dụ gõ tên bộ; thao tác thật gõ cụm/slug theo source), toast, skeleton, empty state, banner, tooltip, pagination.
- **Icon:** SVG inline `24×24`, `stroke-width="1.75"`, `currentColor`, nét đồng nhất, không emoji.

### 1.4 Ma trận màn hình

| # | Màn (hash route) | Nội dung ưu tiên | Hành động chính |
| --- | --- | --- | --- |
| 0 | `#/dang-nhap` | Eyebrow + h2 + mô tả; Supabase / URL Worker + ADMIN_KEY / dữ liệu tĩnh chỉ đọc | Kết nối (mô phỏng) |
| 1 | `#/dashboard` | Dải 6 số liệu → Việc cần làm → Tình trạng hệ thống → biểu đồ 14 ngày → Mới cập nhật | Đọc lại dữ liệu |
| 2 | `#/thu-vien` | Tìm/lọc/sắp xếp → bảng sticky → phân trang → thanh thao tác hàng loạt | Thêm bộ |
| 3 | `#/them-bo` | Metadata → chương đầu (tuỳ chọn) → ảnh bìa | Tạo bộ |
| 4 | `#/sua-bo` | Form + cảnh báo slug → khóa mật mã → nhân bản | Lưu metadata |
| 5 | `#/chuong` | 4 hàng đợi của BỘ (Nháp / Chờ duyệt / Hẹn giờ / Chờ tới giờ) → chọn bộ → ô tiêu đề riêng → trình soạn (toolbar + đổi case + trạng thái chương) | Quản lý chương |
| 6 | `#/binh-luan` | Tìm + lọc bộ + Chỉ nghi spam + xoá 2 lần (không có Duyệt) | Đọc bình luận |
| 7 | `#/bao-loi` | 3 nhóm trạng thái + đánh dấu đã xử lý + Mở lại | Đọc báo lỗi |
| 8 | `#/phieu-bau` | Chọn nhiều → Gỡ phiếu đã chọn + reset có số chương | Reset phiếu bộ này |
| 9 | `#/homepage-cms` | Hero/slides (Desktop/Mobile) → Chuyển thể Series → lịch + ghi chú → Thông báo trang chủ | Lưu trang chủ |
| 10 | `#/thong-ke` | Số liệu KV: Views / Votes / Voters / Hôm nay + Phiếu theo chương | Đọc thống kê KV |
| 11 | `#/kiem-tra-du-lieu` | Đọc lại registry → Quét book → Audit KV → Sửa từng dòng | Đếm lại số chương |
| 12 | `#/nhat-ky` | 200 thao tác gần nhất | Đọc log |
| 13 | `#/cai-dat` | Tải backup JSON / khôi phục → nhập + đồng bộ Blogger → Flush stats cache / Đếm lại số chương | Tải backup JSON |

**Mỗi màn có 4 trạng thái** (bình thường / rỗng / đang tải skeleton / lỗi), điều khiển độc lập theo route trong bảng demo. Màn đăng nhập có biến thể riêng: rỗng = chưa cấu hình Worker, tải = đang kiểm tra kết nối, lỗi = sai ADMIN_KEY / lỗi Worker.

**Biến thể khung:** chip kết nối 5 trạng thái · quota 4 mức (ok / cảnh báo / nguy hiểm / bị chặn + banner đỏ) · sidebar thu gọn · drawer mobile 360px · modal xác nhận mạnh · giả lập khung 360px ngay trên desktop.

### 1.5 Tương tác đã chạy

Hash route 13 tab + đăng nhập · thu gọn sidebar · drawer + scrim + Esc · ô tìm gợi ý + `Ctrl+K` (↑/↓/Enter/Esc) · lọc/sắp xếp/phân trang Thư viện · chọn nhiều + thanh hàng loạt (6 lựa chọn đúng `BookList.jsx`, CSV, JSON; xoá mạnh chỉ cho từng bộ) · "Sửa bộ" chỉ mở khi có bộ được chọn · modal xác nhận thường & mạnh · toast · validate form · cảnh báo đổi slug · tự lưu nháp "Đã lưu lúc…" · thêm/xóa/di chuyển chương · **đổi case tên chương** · **dấu ngăn cách nội dung** · **ô tiêu đề chương riêng** · **nhiều dòng + couple** · **Ctrl/Cmd+S** · **Ctrl/Cmd+Alt+N** · **migration overflow KV** · import mẫu · banner quota · tài liệu bàn giao trong modal.

---

## 2 · NHẬT KÝ QUYẾT ĐỊNH

| # | Quyết định | Lý do |
| --- | --- | --- |
| 1 | Bỏ 2 tab Tác giả, Vai trò | Owner tự dịch và đăng truyện đã mua; không có tác giả hay nhân sự khác nên nhóm Người dùng không còn đối tượng dùng. |
| 2 | Giữ 5 nhóm còn lại, tên, thứ tự | Đây là thiết kế lại giao diện cho chức năng đã có, không sắp xếp lại sản phẩm. |
| 3 | Mỗi header có đúng một hành động chính, ở cùng góc | Giảm chi phí quét mắt, tránh hai nút chính cạnh nhau trên màn hẹp. |
| 4 | Dải 6 số liệu không bọc card, chỉ vạch tóc | Phát huy phong cách hiện có; card chồng card tạo nhiễu trên dashboard. |
| 5 | Hồng chỉ cho việc chính / tab chọn / focus / số đếm | Màu nhấn hiếm mới có ý nghĩa; tránh biến mọi badge thành tín hiệu khẩn. |
| 6 | Chip kết nối + pill quota + banner nằm trên khung | Trạng thái hệ thống là thông tin toàn cục, không nên lặp trong từng card. |
| 7 | Xoá / recount / reset / khôi phục gõ đúng cụm hoặc slug | Theo `main.jsx`: `XOÁ`, `ĐẾM LẠI`, `RESET`, `GỠ PHIẾU`, `ĐỒNG BỘ`, `KHÔI PHỤC`; xoá bộ và bỏ khóa gõ đúng slug. |
| 8 | Xóa bình luận xác nhận hai lần | Thao tác kiểm duyệt nhạy cảm; hai bước tách "bấm nhầm" khỏi "đồng ý xóa". |
| 9 | "Sửa bộ" làm mờ và chặn khi chưa chọn bộ | Phản ánh đúng ràng buộc thật, giải thích bằng tooltip + toast thay vì im lặng. |
| 10 | Trạng thái rỗng/tải/lỗi điều khiển theo từng màn | Người review kiểm tra mọi màn mà không phải sửa dữ liệu mẫu. |
| 11 | Bảng điều khiển demo tách khỏi sản phẩm, đặt ở góc | Biến thể khung là công cụ duyệt thiết kế, không phải tính năng admin. |
| 12 | Bìa là ô màu CSS; mọi dữ liệu gắn nhãn MẪU | Tránh ảnh ngoài/ảnh stock và không gây hiểu nhầm số liệu là thật. |
| 13 | Bảng cuộn ngang trong `.table-wrap` tại 360px | Giữ thead dính và đủ cột dữ liệu mà không làm tràn ngang cả trang. |
| 14 | Không dùng bộ nhớ trình duyệt, không gọi Worker thật | Mockup mở bằng double-click phải an toàn và không phụ thuộc hạ tầng. |
| 15 | Nhúng luôn tài liệu bàn giao vào modal trong HTML | Một file duy nhất vẫn tự chứa toàn bộ nghiên cứu, token, tự phản biện và đề xuất. |
| 16 | Đổi case chỉ áp dụng tên chương | Vòng 3 đặt select trong toolbar cho đoạn/vùng chọn; vòng 6 owner muốn nội dung không bị đổi nên select chuyển lên cạnh ô Tên chương. |
| 17 | Ô tiêu đề chương tách riêng | Khớp `ChapterEditor.jsx` của bản gốc: `title` là field riêng, nội dung là field riêng. |
| 18 | Sửa 3 lỗi ở card Mới cập nhật | Scrim desktop che mờ cả trang; `.list-item .t span` đè `display:block` làm badge full-width; nút demo chèn nội dung. |
| 19 | Tinh gọn chữ | Bỏ câu giải thích lặp, rút nhãn dài, giữ một dòng MẪU chung. |
| 20 | Đối chiếu lại toàn bộ chức năng với `src/admin/**` | Owner báo vài tính năng không khớp bản gốc; rà từng component thay vì chỉ khớp tên tab và màu. |
| 21 | Bỏ field không có trong schema | `metaFromForm` xoá `tags`; không có Số chương / Ngày sửa tay. Thay bằng Năm, Hiển thị, 18+, 2 ô mật mã. |
| 22 | Tab Chương là 4 hàng đợi của BỘ | `ChaptersHub` lọc theo `pubStatus` + `pending`; trạng thái riêng của CHƯƠNG là Xuất bản / Hẹn giờ / Ẩn / Nháp. |
| 23 | Bỏ Duyệt bình luận, thêm Mở lại báo lỗi | `CommentsPanel` chỉ lọc nghi spam và xoá 2 bước; `ReportsPanel` cho mở lại. |
| 24 | Đúng cụm xác nhận và tên hành động | `main.jsx`: `XOÁ`, `ĐẾM LẠI`, `RESET`, `GỠ PHIẾU`, `ĐỒNG BỘ`, `KHÔI PHỤC`; xoá bộ / bỏ khóa gõ slug. |
| 25 | Nhiều dòng `+ couple` | `NewBook.jsx` / `BookEditor.jsx` có nút thêm, Enter thêm dòng và × xoá; gộp bằng dấu phẩy thay vì một ô duy nhất. |
| 26 | Thêm migration overflow KV | `DoctorPanel` chuyển book/bìa/ảnh sang Supabase/R2; gắn trực tiếp với bài toán quota free-tier nên đưa vào Kiểm tra dữ liệu. |
| 27 | `Ctrl+S` và `Ctrl+Alt+N` | `main.jsx` lưu màn gần nhất và thêm chương; `Ctrl+N` thường bị Chrome/Edge giữ nên bản chắc chắn là `Ctrl/Cmd+Alt+N`. |
| 28 | Bỏ Danh sách trong trình soạn | Owner yêu cầu bỏ; toolbar gọn còn In đậm, In nghiêng, Tiêu đề, Trích dẫn, Liên kết, Ảnh. Bảng Danh sách chương ngoài editor vẫn giữ. |
| 29 | Thêm dấu ngăn cách nội dung | Nút `Chèn dấu ngăn cách` chèn một đoạn `•••` căn giữa tại con trỏ, tách hai phần nội dung mà không cần gõ ký tự. |
| 30 | Đổi case chỉ áp dụng tên chương | Select nằm cạnh ô Tên chương và chỉ ghi vào `state.chapters[active].t`; nội dung chương, vùng chọn không bị động tới. |
| 31 | Ghi chú gọn, cột thẳng | Rút câu ghi chú trong panel; lưới 2 cột bằng nhau và cột cố định cho mọi hàng danh sách nên badge, nút không còn lệch. |
| 32 | Chỉ giữ ghi chú có ích | Vòng 7 bỏ ghi chú thiết kế, chú thích lặp và câu giải thích lại nhãn; giữ an toàn (gõ slug/cụm), phạm vi đổi case, phím tắt và trạng thái đọc/ghi KV. |
| 33 | Một dòng MẪU cho mỗi màn | Footer rút còn `DỮ LIỆU MẪU` và render đúng một lần; eyebrow và meta đã đánh dấu nên không lặp câu dài. |
| 34 | Lọc HTML chương trước khi render lại | Vòng 8 phát hiện `state.editorSeed` lấy từ `contenteditable` rồi đưa thẳng vào `innerHTML`: dán HTML lạ có thể chạy handler. `sanitizeEditorHtml()` chặn script, `on*`, `javascript:/data:/blob:` và chỉ giữ thẻ soạn thảo; sự kiện `paste` chèn text thường vì `onerror` chạy trước `input`. |
| 35 | Khoá migration theo `online` | `DoctorPanel` thật chỉ chạy khi `state.online`; mockup trước đó khoá mỗi `static` nên `checking` / `badkey` / `workererr` vẫn bấm được. Gộp `conn !== online` với quota `blocked`. |
| 36 | Không giữ ADMIN_KEY trong state | Ô mật khẩu chỉ để minh hoạ; xoá ngay sau connect, đăng nhập Supabase, chế độ tĩnh và Đặt lại demo. |
| 37 | Fallback trạng thái kết nối/quota | `CONN` và `QUOTA` có phương án dự phòng để một giá trị demo lạ không làm vỡ chip, Dashboard hay màn đăng nhập. |
| 38 | Đưa bản thiết kế lên `/admin` | Owner muốn mở `/admin` là thấy bản thiết kế ngay. Vòng 9 đổi bằng 1 dòng rewrite trong `_redirects`; vòng 10 chuyển sang `admin.html` sinh từ mockup và nối dữ liệu thật. |
| 39 | Một admin, dữ liệu thật | Owner yêu cầu gỡ hoàn toàn bản sao tạm: chỉ còn `admin.html` tại `/admin`, chính giao diện thiết kế này đọc/ghi Cloudflare KV. Mockup tĩnh giữ lại làm bản thiết kế offline, không nạp lớp KV. |

---

## 3 · PHASE 4 — TỰ PHẢN BIỆN

### 3.1 Heuristic Nielsen (thang 1–5)

| # | Tiêu chí | Điểm | Cải thiện đã làm |
| --- | --- | --- | --- |
| 1 | Hiện trạng hệ thống | 5 | Chip 5 trạng thái, quota 4 mức, banner đỏ, "đã lưu lúc…", skeleton, toast. |
| 2 | Khớp thế giới thật | 5 | Vòng 4 đối chiếu `src/admin/**`: đúng tên tab, 7 trạng thái xuất bản, 4 trạng thái chương, cụm xác nhận và thuật ngữ KV/Worker. |
| 3 | Kiểm soát & tự do | 4 | Esc đóng modal/drawer/palette, "Bỏ chọn", "Nhập lại", "Thử lại", "Về bình thường". |
| 4 | Nhất quán & chuẩn | 5 | Một `:root`, một bộ nút/badge/bảng, nhịp 8px, 1 nút chính/header; vòng 6 cho lưới 2 cột bằng nhau và cột badge/nút cố định ở mọi hàng. |
| 5 | Ngăn lỗi | 5 | Validate form, cảnh báo slug, xác nhận mạnh có gõ, xóa 2 lần, gated Sửa bộ; vòng 8 lọc HTML chương, khoá migration khi chưa `online`, không giữ ADMIN_KEY. |
| 6 | Nhận diện thay vì nhớ | 5 | Gợi ý tìm + Ctrl+K, eyebrow nhóm, tooltip, nhãn mono rõ trên điều khiển. |
| 7 | Linh hoạt & hiệu quả | 4 | Hash route, lọc/sắp xếp/phân trang, thao tác hàng loạt, Ctrl+K / Ctrl+S / Ctrl+Alt+N. |
| 8 | Thẩm mỹ & tối giản | 4 | Không bóng, không gradient, vạch tóc, hồng có chủ đích; vòng 7 bỏ ghi chú thừa, còn nhiều bảng đặc dữ liệu. |
| 9 | Sửa lỗi & phục hồi | 4 | Màn lỗi có nguyên nhân + Thử lại + lối tới Cài đặt; skeleton và empty state rõ. |
| 10 | Trợ giúp & tài liệu | 4 | Tài liệu ngay trong modal, nhật ký quyết định, chú thích MẪU ở mọi màn. |

### 3.2 Kiểm tra tương phản

Đầy đủ ở mục 1.2. **Tất cả cặp chữ/nền ≥ 4.5:1**, nhỏ nhất 4.92:1 (`--dim` trên `--warn-bg`). Không dùng màu literal ngoài `:root`.

### 3.3 Kiểm tra bàn phím

| Kiểm tra | Kết quả |
| --- | --- |
| Thứ tự Tab | Theo thứ tự DOM: skip link → sidebar → topbar → nội dung → demo. |
| Skip link | Có, hiện khi focus. |
| `Ctrl+K` | Mở/đóng bảng lệnh; ↑/↓ chọn, Enter mở, Esc đóng. |
| `Ctrl/Cmd+S` | Lưu chương (tab Chương), metadata (Sửa bộ) hoặc tạo bộ (Thêm bộ); màn khác hiện "Không có gì để lưu". |
| `Ctrl/Cmd+Alt+N` | Thêm chương mới. Cũng bắt `Ctrl/Cmd+N`, nhưng Chrome/Edge giữ tổ hợp đó để mở cửa sổ mới nên bản Alt là đường chắc chắn. |
| `Ctrl/Cmd+N` ngoài trình soạn | Không `preventDefault`; để nguyên hành vi native của trình duyệt. |
| Enter trong ô Couple | Thêm một dòng Couple mới và focus vào dòng đó. |
| Modal | `role="dialog"`, `aria-modal`, focus vào ô gõ / nút xác nhận, bẫy Tab, Esc đóng, focus được khôi phục. |
| Điều khiển tự vẽ | Checkbox/switch vẫn là `<input>` thật, focusable, có `:focus-visible` trên phần tử vẽ. |
| ARIA | `aria-current`, `aria-selected`, `aria-expanded`, `aria-live`, `aria-label`, `role="listbox"/"option"`. |
| Focus ring | `2px solid var(--ring)` + offset 2px trên mọi phần tử. |

### 3.4 Kiểm tra 360px

| Hạng mục | Kết quả |
| --- | --- |
| Drawer | Rộng `min(360px, 100vw)`, scrim + Esc đóng; có công tắc mở drawer 360px cả trên desktop. |
| Thanh trên | Gập 2 hàng, ô tìm full width, nhãn nút ẩn, cụm tools tự xuống dòng, chip/quota gọn tối đa 132px + ellipsis. |
| Dải số liệu | 2 cột, vạch tóc, không card. |
| Card / lưới | 1 cột; `.grid2`, `.grid3`, `.split`, `.todo` đều gập. |
| Hàng danh sách | Báo lỗi / Bình luận gập thành 2 dòng: nội dung full width, badge trái + nút phải; cột nút rộng cố định nên mọi dòng thẳng hàng. |
| Vùng bấm | Nút, input, tab, pagination ≥ 44px. |
| Bảng | Cuộn ngang **bên trong** `.table-wrap`; `body { overflow-x: hidden }` → không tràn ngang trang. |
| Demo | Panel thành bottom sheet tràn chiều ngang có padding; có công tắc "Giả lập khung 360px". |
| Đăng nhập | 1 cột, ẩn cột brand, form co về `min(430px, 100%)`, vẫn có eyebrow + h2 + mô tả ngắn. |

### 3.5 Vấn đề còn tồn tại

1. Chưa phỏng vấn chủ site thật: 5 điểm đau vẫn là **GIẢ THUYẾT** (đã cập nhật theo mô hình một người dịch và đăng).
2. Chưa có dữ liệu KV thật; skeleton là tĩnh, chưa mô phỏng độ trễ mạng theo thời gian thực.
3. Chưa chạy trình đọc màn hình thật (NVDA / VoiceOver); mới kiểm tra cấu trúc ARIA bằng tay.
4. Bảng 10.000+ bản ghi chưa đo hiệu năng; phân trang mới có 18 bộ mẫu.
5. Màu hồng là **giá trị tạm**, cần thử lại với bìa thật (hiện là ô màu CSS) trước khi chốt token.
6. Đã bỏ 2 tab theo xác nhận owner; nếu sau này có cộng tác viên cần khôi phục nhóm Người dùng và rà soát lại phân quyền.
7. Ở 360px bảng vẫn phải cuộn ngang trong vùng bảng; chưa thử ngón tay cái trên thiết bị thật.
8. Import `.docx`/`.html` mới mô phỏng bằng tên file, chưa parse nội dung (đúng tinh thần mockup, không code production).
9. Chưa dựng 2 biến thể phụ của source: chuyển **Bảng/Lưới** ở Thư viện và toolbar đủ **15 nút** của TipTap. Các mục còn lại (nhiều dòng Couple, migration overflow, Ctrl+S / Ctrl+Alt+N) đã bổ sung ở vòng 5.
10. Vòng 8 mới đối chiếu **tĩnh** mã nguồn; chưa gọi Worker / KV / Supabase / R2 / Blogger thật nên chưa kiểm được CORS, timeout 12/120/29 giây, header `x-admin-key` và đường rớt về KV khi overflow lỗi.

---

## 4 · ĐỀ XUẤT THÊM (không nằm trong mockup)

- Phỏng vấn chủ site + quan sát 1 ca dịch/đăng chương để kiểm chứng 5 giả thuyết ở Phase 1.
- Lịch sử phiên bản / undo cho metadata và chương (ngoài danh sách chức năng hiện có).
- Nếu sau này có cộng tác viên: phân quyền phía server thay vì chỉ ở UI như mã nguồn hiện tại.
- Cảnh báo quota chủ động trước khi chạm 80% và báo cáo ghi theo ngày.
- Xuất nhật ký ra CSV để đối soát định kỳ; shortcut duyệt nhanh cho chủ site.
- Đo hiệu năng bảng lớn, thử 360px trên thiết bị thật và kiểm tra công nghệ hỗ trợ trước khi chuyển code production.
- Dựng staging có Worker + KV + Supabase/R2 + Blogger để kiểm chứng CORS, `x-admin-key`, timeout và migration overflow trước khi nối bản thật.
- Chốt giá trị `--acc` sau khi thử trên bìa thật và trên màn hình hiệu chuẩn thấp.

> Các mục trên **không** được dựng trong HTML, đúng yêu cầu "đề xuất ngoài phạm vi ghi riêng".

## 5 · CẬP NHẬT SAU VÒNG RÀ SOÁT THỨ 2

- Thêm `eyebrow` dùng chung; màn đăng nhập cũng có eyebrow + h2 + mô tả ngắn như 13 tab, và eyebrow mọi trang đều ghi rõ **DỮ LIỆU MẪU**.
- Trạng thái đang tải của màn đăng nhập nay có nhãn `ĐANG TẢI` + skeleton, thống nhất với 13 tab.
- Sửa khung 360px: cụm nút trên thanh trên được phép xuống dòng, chip kết nối và pill quota gọn còn tối đa 132px; áp dụng cả cho công tắc "Giả lập khung 360px" trên desktop.
- Dọn bản `renderDemo()` trùng tên không còn dùng; giữ một nguồn duy nhất cho bảng điều khiển demo.
- Kiểm chứng vòng 2 (trước khi bỏ 2 tab): **142/142 kiểm tra tự động đạt, 0 lỗi JS** trên 16 route × 4 trạng thái, 15 lần bấm nav. Con số 16 route / 15 tab là lịch sử, không còn đúng với mockup hiện tại (14 route / 13 tab).

## 6 · CẬP NHẬT THEO PHẢN HỒI CỦA OWNER (VÒNG 3)

| Phản hồi | Đã làm |
| --- | --- |
| Bỏ Vai trò và Tác giả | Xoá cả nhóm Người dùng khỏi `NAV`, `PAGES`, `BODY`, dữ liệu mẫu và handler liên quan; còn 13 tab / 5 nhóm. Đổi nhãn field thành "Tác giả gốc" để không nhầm với người đăng. |
| Thêm đổi case (vòng 6 thu hẹp cho tên chương) | Vòng 3: select "Đổi case…" trong toolbar, CHỮ HOA / chữ thường / Chữ Hoa Mỗi Từ / Định dạng câu, áp cho vùng chọn hoặc cả đoạn, có `toLocaleUpperCase('vi')` / `toLocaleLowerCase('vi')`. Vòng 6: select chuyển lên cạnh ô Tên chương, chỉ đổi tên. |
| Ô tiêu đề chương riêng | Thêm `#chapterTitle` phía trên toolbar, bind trực tiếp với `state.chapters[active]`, cập nhật danh sách chương khi gõ. |
| Lỗi phần Mới cập nhật | Ba lỗi cùng lúc: `.scrim` hiển thị ở desktop làm mờ toàn trang (sửa `display:none` + `.app.drawer .scrim`); `.list-item .t span` đè `display:block` lên badge (đổi `>span`, badge `inline-flex`); nút demo to chèn nội dung (thu thành nút tròn 44px + tăng padding đáy 120px). |
| Tinh gọn chữ | Rút gọn ~25 chuỗi giao diện, bỏ "(mẫu)" lặp, gộp nhãn phụ dải số liệu về `MẪU`, giữ đánh dấu rõ ở eyebrow/meta/footer. |

**Kiểm chứng vòng 3 bằng Chromium thật (không chỉ jsdom):** badge gọn còn 103/90/38px trên một dòng · scrim desktop `display:none` · đổi case `upper` ra chữ hoa tiếng Việt đúng · ô tiêu đề gõ xong cập nhật cả state lẫn danh sách · 13 tab / 5 nhóm · viewport 360px có `scrollWidth = 360` (không tràn ngang) · 0 lỗi JS.

## 7 · ĐỐI CHIẾU VỚI MÃ NGUỒN GỐC (VÒNG 4)

Owner báo "một vài tính năng không đúng với tính năng gốc". Rà lại `src/admin/components/*`, `src/admin/utils/books.js`, `src/shared/schedule.js`, `src/admin/main.jsx` và `src/admin/PARITY-CUTOVER.md`. **13 tab / 5 nhóm, đổi case (vòng 6 thu hẹp cho tên chương) và ô tiêu đề chương riêng giữ nguyên**; các chỗ lệch dưới đây đã sửa.

| Nguồn | Mockup trước | Đã sửa |
| --- | --- | --- |
| `utils/books.js` · `PUB_STATUSES` | `Hẹn lịch`, `Đã xuất bản` | `Hẹn giờ`, `Xuất bản`; select dùng đúng 7 nhãn gốc |
| `utils/books.js` · `VISIBILITIES` | Không có ô Hiển thị | Công khai / Không liệt kê (chỉ link) / Riêng tư |
| `utils/books.js` · `metaFromForm` | Cột Tags, ô Tags, tìm theo tag | Bỏ hết; schema xoá `tags`, tìm theo tên / tác giả / couple / slug |
| `NewBook.jsx`, `BookEditor.jsx` | Số chương, Ngày sửa tay | Bỏ; thêm Năm, Hiển thị, switch 18+, 2 ô mật mã (tối thiểu 8 ký tự) |
| `Layout.jsx` · `connChip` | `Online`, `Lỗi Worker` | `Cloudflare KV · Online`, `Lỗi kết nối Worker`, `Đang kiểm tra kết nối` |
| `Layout.jsx` · `quotaLevel` | 780 / 960 | Ngưỡng cảnh báo 800, nguy hiểm 950, chặn 1000 |
| `utils/overview.js`, `Overview.jsx` | KPI tự đặt; việc "Slug thay đổi gần đây" | Đúng nhãn Bộ truyện / Chương đã đăng / Gắn 18+ / Thiếu thông tin; việc Đang ẩn, Thiếu bìa, Thiếu mô tả; thêm dòng Doctor và Lưu trữ tràn đúng nội dung |
| `ChaptersHub.jsx` | 3 tab trạng thái CHƯƠNG | 4 hàng đợi của BỘ: Nháp, Chờ duyệt, Hẹn giờ, Chờ tới giờ + chọn bộ để quản lý chương |
| `shared/schedule.js` · `CHAPTER_STATUSES` | Chờ duyệt là trạng thái chương | Xuất bản / Hẹn giờ / Ẩn / Nháp + ô "Chương lên sóng lúc" |
| `ChapterEditor.jsx` | `.docx` đơn, Lưu nháp, Hẹn đăng | Import `.txt/.html`; nhiều chương `.txt/.docx`; `Lưu chương`; `Xoá chương` gõ `XOÁ` |
| `OperationalPanels.jsx` · `CommentsPanel` | Nút Duyệt, trạng thái Chờ duyệt | Bỏ; tìm + lọc bộ + Chỉ nghi spam + Xoá 2 bước (`XOÁ`) |
| `OperationalPanels.jsx` · `ReportsPanel` | Nút bị khoá sau khi xử lý | Thêm `Mở lại` và 3 nhóm Tất cả / Chưa xử lý / Đã xử lý |
| `OperationalPanels.jsx` · `VotesPanel` | Gỡ từng phiếu | Chọn nhiều → `Gỡ phiếu đã chọn`; Reset có ô số chương |
| `OperationalPanels.jsx` · `StatsPanel` | "Top lượt thích" | Số liệu KV: Views / Votes / Voters / Hôm nay + Phiếu theo chương |
| `HomepageCMS.jsx` | "Bộ được chọn", thiếu banner | Chuyển thể Series, Desktop/Mobile, Ghi chú lịch, Thông báo trang chủ |
| `OperationalPanels.jsx` · `DoctorPanel` | `Recount` | Đọc lại registry, Quét book, Audit KV, Sửa từng dòng, Đếm lại số chương từ KV |
| `OperationalPanels.jsx` · `SettingsPanel` | Sao lưu JSON, Flush stats, Recount | Tải backup JSON, Flush stats cache, Đếm lại số chương, Đồng bộ metadata Blogger |
| `main.jsx` · log | "Nhân sự mẫu 01–04" | `admin-key` ở mọi dòng: một chủ site tự dịch và đăng |
| `BookList.jsx` | Xoá hàng loạt | 6 lựa chọn thao tác lô đúng source; xoá mạnh chỉ áp cho từng bộ |

**Giữ theo yêu cầu riêng của owner (không có trong source):** đổi case tên chương, dấu ngăn cách nội dung, ô tiêu đề chương riêng, 13 tab / 5 nhóm. **Giữ theo brief thiết kế:** lọc/sắp xếp/phân trang, 4 trạng thái mỗi màn, một nút chính cố định, tag chip trong bộ component, modal ví dụ "gõ tên bộ".

**Kiểm chứng vòng 4:** `node --check` đạt · 136/136 kiểm tra cấu trúc (14 route × 4 trạng thái, 13 nav, 14 hành động chính, 5 chip, 4 quota, khung, `Ctrl+K`, docs) · 122/122 kiểm tra đối chiếu source · 0 lỗi JS · render bằng Chromium thật ở desktop và 360px.

## 8 · BỔ SUNG VÒNG 5 THEO YÊU CẦU

| Yêu cầu | Đã làm | Tinh chỉnh cho phù hợp |
| --- | --- | --- |
| Nhiều dòng `+ couple` | Block Couple ở **Thêm bộ** và **Sửa bộ**, khớp `NewBook.jsx` / `BookEditor.jsx` | Nút ghost nhỏ cạnh nhãn; `Enter` thêm dòng và focus dòng mới; `×` chỉ hiện khi có ≥ 2 dòng hoặc dòng có chữ; gợi ý từ `datalist` lấy couple có sẵn. Giá trị gộp `", "` vào `state.models['nb-c' / 'eb-c']` nên `submitNew` / `commitEdit` / CSV không đổi. Không thêm câu giải thích dài. |
| Migration overflow KV | Card **Lưu trữ tràn (tuỳ chọn)** trong **Kiểm tra dữ liệu** | Chọn vì đây là chức năng quan trọng với free-tier: nó chính là cách giảm áp lực ghi/đọc KV mà chip quota đang cảnh báo. 3 nút `Chuyển tất cả / Chỉ bìa / Chỉ book`, xác nhận thường như `DoctorPanel`, kết quả gọn 1 dòng; tự khoá khi `static` hoặc quota `blocked`. **Cài đặt** chỉ thêm một câu trạng thái, không chép khối SQL của source để tránh nhiễu. |
| `Ctrl+S`, `Ctrl+N` | Handler trong `keydown`, đúng `main.jsx` | `Ctrl/Cmd+S` lưu chương / metadata / tạo bộ, màn khác báo "Không có gì để lưu". `Ctrl/Cmd+N` **và** `Ctrl/Cmd+Alt+N` thêm chương (bắt cả `e.code === 'KeyN'` cho bàn phím AltGr); ở màn khác không `preventDefault` để trình duyệt vẫn mở cửa sổ mới. Ghi chú ngắn dưới trình soạn và form Sửa bộ, có chú thích vì sao cần Alt. |

Toast được gom tối đa 3 cái để không che nội dung khi bấm phím tắt liên tục.

**Kiểm chứng vòng 5:** `node --check` đạt · 136/136 cấu trúc · 122/122 đối chiếu source · kiểm tra bổ sung cho couple / migration / phím tắt đều đạt · 0 lỗi JS · Chromium thật ở desktop và 360px không tràn ngang. Phase 1 vẫn 398 từ.

## 9 · TINH CHỈNH VÒNG 6 THEO PHẢN HỒI

| Phản hồi | Đã làm | Tinh chỉnh |
| --- | --- | --- |
| Bỏ Danh sách trong trình chỉnh sửa | Xoá nút `Danh sách` khỏi toolbar trình soạn | Giữ In đậm / In nghiêng / Tiêu đề / Trích dẫn / Liên kết / Ảnh. **Bảng Danh sách chương** ngoài trình soạn vẫn có, đúng `ChapterEditor.jsx`. |
| Thêm dấu ngăn cách nội dung | Nút `Chèn dấu ngăn cách` chèn `<p class="ch-sep">•••</p>` vào nội dung | Chèn tại con trỏ, hoặc cuối chương nếu chưa có caret; dùng được cả khi đang Xem trước (tự tắt preview); cập nhật "đã lưu lúc…" và toast. Không sửa nội dung cũ. |
| Đổi case chỉ dành cho tên chương | Select `Đổi case tên…` chuyển từ toolbar lên cạnh ô **Tên chương** | `applyCase()` chỉ đọc/ghi `#chapterTitle`, `state.chapters[active].t` và nhãn dòng trong Danh sách chương. Bỏ hết nhánh `execCommand('insertText')` / đổi đoạn / vùng chọn; `transformCase()` giữ nguyên 4 chế độ. |
| Tinh gọn câu từ ghi chú | Rút ~40 câu ghi chú, hint và mô tả header trong toàn admin panel | Giữ đủ cụm xác nhận (`XOÁ`, `KHÔI PHỤC`, `gõ đúng slug`), nhãn `MẪU`, trạng thái KV/Worker; bỏ câu giải thích lặp. Ví dụ: "Báo lỗi có thể mở lại; trạng thái ghi vào KV qua Worker." → "Mở lại được · trạng thái ghi KV.". |
| Canh chỉnh nút, ô, chữ; Báo lỗi còn lệch ô | Sửa cấu trúc card **Báo lỗi** (`.card-bd` bị lồng trong `.card-hd`), đổi `.grid2` thành 2 cột bằng nhau, cấp cột cố định cho mọi hàng danh sách | Badge + nút thẳng cột ở Báo lỗi, Bình luận, 4 hàng đợi Chương và Danh sách chương; nhãn `DỮ LIỆU MẪU` về đúng header; 360px ở Báo lỗi hết tràn ngang (trước đó `scrollWidth = 754`). |

**Kiểm chứng vòng 6:** `node --check` đạt · 136/136 cấu trúc · 122/122 đối chiếu source · 85/85 vòng 5 · 124/124 vòng 6–7 · 0 lỗi JS · 0 màu literal ngoài `:root` · Chromium thật ở desktop và 360px: 14 route `scrollWidth = 360`, 0 page error · Phase 1 vẫn 398 từ.

## 10 · DỌN GHI CHÚ (VÒNG 7)

Owner: *"ghi chú vẫn còn rối quá, cái nào cần thì giữ, ko thì bỏ đi, chỗ nào dài thì tinh gọn lại"*. Rà toàn bộ ghi chú, hint, caption và mô tả xác nhận trong admin panel.

| Xử lý | Nội dung |
| --- | --- |
| **Bỏ hẳn** | Ghi chú thiết kế ở Thư viện (`thead dính · thao tác lô…`, `Bảng, badge, tag chip dùng chung.`) · 3 chú thích ảnh bìa · `* bắt buộc · form có kiểm tra lỗi` · giải thích Nhân bản bộ / thứ tự badge · 4 hint trạng thái chương + gợi ý giờ · dòng liệt kê tính năng import · ghi chú phím tắt ở Sửa bộ · ghi chú Báo lỗi và Thống kê · 2 đoạn giải thích migration · 2 đoạn ở Cài đặt · footer bị render 2 lần ở Thư viện. |
| **Giữ lại** | `Bỏ khóa gõ đúng slug.` · `Ghi đè gõ KHÔI PHỤC.` · `Cụm cần gõ:` · `Xoá 2 bước · Không có chức năng duyệt.` · `Chỉ đổi tên chương.` · một dòng `Ctrl/Cmd+S lưu · Ctrl/Cmd+Alt+N thêm chương.` · `Chỉ đọc · “Sửa” ghi KV.` · trạng thái `Supabase: unavailable · R2: unavailable · Bìa/Ảnh: KV.` và `Đang khoá · chưa nối Worker hoặc hết quota.` · kết quả chuyển, `200 thao tác · x/200`, nhãn loading/empty/error. |
| **Tinh gọn** | Footer mỗi màn còn đúng **một** dòng `DỮ LIỆU MẪU` · 3 banner quota (`Quota 800/1000 · …`, `HẾT QUOTA GHI KV · …`) · các mô tả modal xác nhận · mô tả trạng thái rỗng/lỗi · tooltip sidebar, chân bảng lệnh, nhãn 18+ · 3 toast dài. |
| **Không đổi** | Eyebrow, `h2`, mô tả ngắn, nhãn `MẪU` trên dữ liệu, cụm xác nhận trong modal và toàn bộ chức năng đã chốt ở vòng 1–6. |

**Kiểm chứng vòng 7:** 136/136 cấu trúc · 122/122 đối chiếu source · 85/85 vòng 5 · **124/124 vòng 6–7** (gồm kiểm tra 19 chuỗi ghi chú đã bỏ, footer đúng 1 lần, đúng 1 ghi chú phím tắt trên Chương, 0 ghi chú trên Báo lỗi) · 0 lỗi JS · 0 màu literal ngoài `:root` · Chromium thật 14 route ở 360px `scrollWidth = 360`, 0 page error · Phase 1 vẫn 398 từ.

---

## 11 · KIỂM CHỨC NĂNG, GIAO DIỆN, BẢO MẬT, KẾT NỐI (VÒNG 8)

Owner yêu cầu rà lại audit, bug tính năng, giao diện, bảo mật và kết nối với các bên dữ liệu. Đọc trực tiếp `src/admin/api.js`, `src/admin/quota.js`, `src/admin/components/AuthGate.jsx`, `src/admin/components/OperationalPanels.jsx`, `worker/overflow.js`, `community-worker/`, `supabase/` rồi đối chiếu từng nhãn, từng điều kiện khoá trong mockup. **Ranh giới:** đây là prototype — mọi kết nối là mô phỏng; lỗi thật là lỗi trong chính cách mockup render, khoá và giữ dữ liệu.

### 11.1 Đối chiếu các bên dữ liệu

| Bên / lớp | Mã nguồn thật | Mockup |
| --- | --- | --- |
| **Cloudflare KV** | `PUT /api/registry`, `/api/book/<slug>`, `/api/book/<slug>/chapter`; quota 1.000 ghi và 100.000 đọc/ngày, `writesToday` + `lastReset`. | Chip 5 trạng thái đúng nhãn `Layout.jsx`, 4 mức 800 / 950 / 1000, banner đỏ, dòng đọc 18.400 / 100.000; mọi thao tác ghi gắn `MẪU`. |
| **Worker CMS** | `AdminApi` gửi `x-admin-key`, `mode:cors`, `cache:no-store`; `/api/health`, `/api/whoami`; timeout 12s, 120s cho `putBook`, 29s cho `migrate-overflow`. | Không `fetch`. URL và `ADMIN_KEY` là placeholder; chip `Sai ADMIN_KEY` / `Lỗi kết nối Worker` diễn đúng thông điệp `classifyConnError`. |
| **Supabase + R2** | Overflow: bìa → Storage bucket `covers`, book/ảnh chương → bảng `ssochuz_blobs` hoặc binding `CZ_R2`; chưa gắn `SUPABASE_SERVICE_ROLE` thì báo `unavailable`, ghi lỗi rớt về KV. | Dòng `Supabase: unavailable · R2: unavailable · Bìa/Ảnh: KV` và 3 nút `Chuyển tất cả` / `Chỉ bìa` / `Chỉ book` đúng `only = "" / covers / books`. |
| **Blogger** | `POST /api/sync` cập nhật registry từ `list-novel`, KV vẫn là nguồn thắng; `POST /api/import` nhận URL bài. | Nhập URL có validate, xác nhận gõ `ĐỒNG BỘ`, import mô phỏng; không chép SQL hay cấu hình thật. |
| **community-worker** | Bình luận, báo lỗi, phiếu bầu; admin đọc `/api/admin/comments`, `/reports` (có `PATCH`), `/stats`, `/log`, `/voters`. | Đúng thao tác hẹp: xoá bình luận 2 bước, `Mở lại` báo lỗi, `GỠ PHIẾU` / `RESET`; không có Duyệt bình luận hay bulk export. |
| **Dữ liệu tĩnh** | `fetch('/data/registry.json')`, `/data/book/<slug>.json` — chỉ đọc, thay đổi chỉ lưu trong phiên. | Chip `Dữ liệu tĩnh · Chỉ đọc`; migration và nút ghi bị khoá, không dùng `localStorage` / `sessionStorage`. |
| **Supabase Auth** | `cz-auth.js` / `cz-config.js` phục vụ đăng nhập độc giả (Google hoặc Supabase); ghi KV vẫn cần `ADMIN_KEY` qua Worker. | Nút `Đăng nhập với Supabase (mô phỏng)` tách khỏi form `ADMIN_KEY` để không gợi ý hai cơ chế uỷ quyền là một. |

### 11.2 Lỗi thật tìm thấy và đã sửa

| Mức | Phát hiện | Sửa |
| --- | --- | --- |
| **Bảo mật** | `state.editorSeed` lấy từ `contenteditable` rồi đưa thẳng vào `innerHTML` của `#editor`: dán `<img onerror>` hoặc `<script>` là chạy lại khi `render()`. | Thêm `sanitizeEditorHtml()` 2 lớp: regex bỏ `script` / `on*` / `srcdoc` / `javascript:data:blob:` **trước khi parse**, rồi DOM allowlist chỉ giữ thẻ soạn thảo; dùng cho editor, Xem trước, `plainText()`, mọi lần đọc nội dung và sự kiện `paste` của `contenteditable`. |
| **Kết nối** | 3 nút migration vẫn bấm được ở `checking`, `badkey`, `workererr` dù `DoctorPanel` thật khoá khi `!state.online`. | `blocked = conn !== 'online' || quota === 'blocked'`; kiểm tra đủ 5 trạng thái và mức hết quota. |
| **Bảo mật** | `ADMIN_KEY` gõ vào form nằm lại trong `state.models` sau `Kết nối` và cả sau `Đặt lại demo`, hiện lại ở ô mật khẩu. | `delete state.models['gate-key']` trong `connect`, `login-supabase`, `static-mode`, `resetDemo`; reset cũng xoá `gate-api`. |
| **Ổn định** | `CONN[state.conn]` / `QUOTA[state.quota]` không có fallback → giá trị demo lạ làm vỡ chip, Dashboard, màn đăng nhập. | Thêm `|| CONN.online` / `|| QUOTA.ok` ở cả 4 chỗ đọc. |

### 11.3 Bảo mật đã kiểm

0 `fetch` / XHR / WebSocket / `eval` / `new Function` / `document.write` / `localStorage` / `sessionStorage` / `indexedDB` / cookie trong code chạy. Tài nguyên ngoài duy nhất là 3 link Google Fonts có fallback hệ thống. Ô `ADMIN_KEY` là `type=password` và nhắc không nhập key thật; URL chỉ dùng `mau.example` và `ten-worker.workers.dev`, không có tenant thật hay service role. Mọi dữ liệu mẫu, `title`/`desc`/`phrase` của modal và URL người dùng đi qua `esc()`; sự kiện `paste` trong trình soạn chỉ chèn text thường. Thử chèn payload vào tên bộ, bình luận, báo lỗi, chương, slide, couple, ghi chú và nội dung editor ở **14 route × 4 trạng thái** đều không tạo handler hay thẻ script; cũng kiểm không có điều khiển chết, id trùng, `undefined`/`NaN` hay nút thiếu tên truy cập được.

### 11.4 Kiểm chứng vòng 8

**51/51** kiểm tra mới · 136/136 cấu trúc · 122/122 đối chiếu source · 85/85 vòng 5 · 124/124 vòng 6–7 · 0 lỗi JS · 0 màu literal ngoài `:root` · Chromium thật 14 route ở 360px `scrollWidth = 360`, 0 page error · dán HTML chứa `onerror` vào trình soạn cho **0 handler, 0 lỗi thực thi** · Phase 1 vẫn 398 từ.

---

## 12 · ĐƯA MOCKUP LÊN `/ADMIN` (VÒNG 9)

Owner muốn mở `/admin` là thấy bản thiết kế ngay. Thay bằng **cấu hình route**, không sửa `src/admin/**` hay bundle production.

| Thay đổi | Chi tiết |
| --- | --- |
| **Route** | `_redirects`: `/admin` rewrite `200` tới `/mockup/ssochuz-admin-mockup` (URL sạch, không `.html` để tránh 308 lặp). `/admin-v2`, `/admin-legacy`, `/admin-mockup` đều về bản thiết kế; `/admin.html` và `/admin/` vẫn 308 về `/admin`. |
| **Bản sao tạm** | Vòng 9 giữ một bản sao của admin cũ để không mất chức năng ghi KV trong lúc thiết kế chưa port. Vòng 10 đã gỡ bản sao đó vì `admin.html` mới tự ghi KV. |
| **Header** | `_headers` giữ `no-store` + `noindex` cho các route quản trị và alias bản thiết kế; thêm `no-cache` cho `admin-real.js`. CSP của site đã cho phép inline script/style và Google Fonts nên giao diện chạy nguyên vẹn. |
| **Kiểm thử** | Cập nhật `tests/t_devserver.js` và `tools/check_headers.js` theo từng vòng. Chạy `npm run build` và toàn bộ `npm test`; dev server thật trả đúng các route. |
| **Ranh giới** | Vòng 9 chỉ là prototype: không gọi Worker/KV/Supabase, mọi thao tác ghi chỉ mô phỏng. Ranh giới này bị gỡ ở vòng 10 khi `admin.html` nạp `admin-real.js`. `cz-auth.js` dùng `location.pathname` làm `redirectTo` nên nếu đăng nhập Supabase/Google, thêm `https://ssochuz.pages.dev/admin` vào **Redirect URLs**. |

**Kiểm chứng vòng 9:** `npm run build` đạt · toàn bộ `npm test` đạt · `node --check` đạt · 14/14 smoke (13 tab, 14 route × 4 trạng thái, điều khiển chết, chèn HTML, khoá migration) · 0 lỗi JS · dev server thật `/admin` = bản thiết kế, `/` = trang chủ.

---

## 13 · MỘT `ADMIN.HTML`, DỮ LIỆU THẬT (VÒNG 10)

Owner yêu cầu gỡ hoàn toàn bản sao tạm: chỉ còn **`admin.html` tại `/admin`**, và chính giao diện thiết kế này đọc/ghi Cloudflare KV. Bản mockup tĩnh vẫn mở bằng double-click (hoặc `/admin-mockup`) nhưng **không nạp lớp dữ liệu thật**.

| Thay đổi | Chi tiết |
| --- | --- |
| **Sinh HTML** | `tools/build_admin_html.mjs` sinh `admin.html` từ `mockup/ssochuz-admin-mockup.html`: giữ nguyên CSS, 13 tab, 5 nhóm và mọi hàm render; chèn cầu nối `window.CZ_MOCKUP` rồi nạp `admin-real.js?v=<sha1>`. `npm run build` gọi lại mỗi lần. |
| **Kết nối** | `admin-real.js` `fetch` tới Worker với header `x-admin-key`, `cache: 'no-store'`, timeout 12 / 120 / 29 giây. URL Worker lưu ở `localStorage` (`cz_kv_api`), `ADMIN_KEY` chỉ ở `sessionStorage` (`cz_kv_key`) và bị xoá khỏi `state.models` ngay sau khi nối. |
| **Đọc** | `GET /api/registry`, `GET /api/book/<slug>`, `GET /api/admin/{comments,reports,stats,log,kv,voters}` đổ vào `state` → Dashboard, Thư viện, Chương, Bình luận, Báo lỗi, Phiếu bầu, Thống kê, Nhật ký và quota hiện số liệu KV thật. |
| **Ghi** | Thêm bộ · sửa metadata / đổi slug · xoá bộ · lưu / thêm / xoá / đổi thứ tự chương · xoá bình luận · xử lý báo lỗi · gỡ / reset phiếu · slide / lịch / banner · bulk · recount · migration · nhập chương · khôi phục backup đều gọi API thật, giữ nguyên xác nhận mạnh (gõ slug hoặc cụm in hoa). |
| **Chế độ đọc** | Không có `ADMIN_KEY` hoặc bật *Dữ liệu tĩnh* thì nạp `/data/registry.json` (chỉ đọc); mọi nút ghi báo rõ cần nối Worker. Không hardcode khoá, URL Worker hay tenant trong tệp client. |
| **Preflight CORS** | `worker/cms.js` chỉ cho phép `content-type / x-admin-key / x-import-mode / authorization`. `admin-real.js` **KHÔNG** gửi `cache-control` làm header: header lạ bắt trình duyệt gửi `OPTIONS` rồi bị từ chối ⇒ `Failed to fetch` ngay ở `/api/health`, màn đăng nhập kẹt ở "Lỗi kết nối Worker" (lỗi owner báo sau khi merge #86). Việc không cache nằm ở tuỳ chọn `cache: 'no-store'` của `fetch`, đúng như `src/admin/api.js`. `tests/t_admin_real.js` đọc thẳng danh sách allow-headers từ `worker/cms.js` và giả lập preflight bị từ chối để chặn hồi quy. |
| **Dọn dẹp** | Xoá tệp bản sao tạm, luật rewrite `/admin → mockup`, header và mọi kỳ vọng test/docs về bản sao. `/admin` giờ do Cloudflare Pages tự phục vụ `admin.html`; `/admin.html` và `/admin/` vẫn 308 về `/admin`; `/admin-v2` + `/admin-legacy` về `/admin`; `/admin-mockup` vẫn là prototype offline. |

**Kiểm chứng vòng 10:** `npm run build` đạt · toàn bộ `npm test` đạt · `node --check admin-real.js` đạt · jsdom bấm thật các luồng ghi với Worker giả (tạo bộ, sửa slug, lưu chương, xoá, xử lý báo lỗi) · 0 lỗi JS · 0 secret trong tệp client · dev server `/admin` = `admin.html` mới, bản sao cũ = 404. Sau phản hồi lỗi đăng nhập: bỏ header `cache-control`, thêm bài kiểm mô phỏng preflight bị từ chối (tái tạo lỗi ⇒ 24 kiểm đỏ, bản sửa ⇒ 0 lỗi).

---

## 14 · SỬA RAIL THU GỌN VÀ NHÃN GIAO DIỆN (VÒNG 11)

Owner gửi 3 ảnh chụp `https://ssochuz.pages.dev/admin` với nhận xét **"nhiều mục bị lệch icon"** và **"phần sidebar thu gọn trong admin panel bị lỗi"**. Soi ra 3 nguyên nhân chỉ có ở bản phát hành; bản prototype tĩnh vẫn giữ nguyên thiết kế đã duyệt ở vòng 1–9.

| Lỗi | Nguyên nhân | Sửa |
| --- | --- | --- |
| **Lệch trục icon** | Khi thu gọn, `.brand` vẫn giữ chấm thương hiệu `.dot` sát mép trái và nút thu gọn bị đẩy sang mép phải bởi `style="margin-left:auto"` **inline** (CSS thường không override được inline). Hai icon này không trùng trục với 13 icon nav bên dưới. | Đổi inline style thành class `.collapse-btn`; ẩn `.dot` và `.logo` khi `.app.collapsed`; nút lấy `margin:0 auto`. Brand lúc thu gọn còn **đúng một icon**, canh giữa 37,5px như mọi icon nav. `aria-label` đổi `Thu gọn` / `Mở rộng` theo trạng thái. |
| **Icon bị đẩy trái** | `.side-scroll` hiện thanh cuộn kiểu Windows (~15px), làm content box hẹp lại nên `justify-content:center` canh icon lệch ~7,5px sang trái so với rail 76px. | `scrollbar-width:none` + `::-webkit-scrollbar` ẩn (vẫn cuộn bằng wheel/cảm ứng), `padding:10px`, `nav-item min-height:36px`, nhịp nhóm `8px` để 13 tab vừa màn laptop. Drawer `≤900px` và `force-drawer` mở lại chấm, chữ, thanh cuộn và padding như cũ. |
| **Nhãn dư `KV`** | `scrub()` runtime thay chữ `MẪU` bằng `KV` nên đuôi prototype dính vào dữ liệu thật: slug `bake-love-feelings · KV`, eyebrow `NỘI DUNG · KV`, card `tối đa 8 · KV`. | `tools/build_admin_html.mjs` **cắt đuôi** prototype ở bản sinh thay vì đổi chữ; placeholder chứa "mẫu" đổi thành gợi ý thật; meta lấy giờ thật qua `#czClock`. `scrub()` cố tình **KHÔNG** sửa chữ "mẫu" viết thường (có thể là tên bộ thật trong KV) và bỏ qua tài liệu lịch sử (`#docsTitle`). |
| **Số liệu giả** | `statsHTML()` có hằng `18 / 8.420 / 1.161 / 30`, `doctorHTML()` có `248 / 0 / 4 / 2`, card "Phiếu theo chương" có 4 dòng bịa — tất cả nằm cứng trong mockup. | Bản phát hành tính từ `state.books`, `SAMPLE_STATS`, `SAMPLE_ISSUES` và `state.votes` (nạp từ `/api/admin/voters`); không có phiếu thì hiện trạng rỗng. `hydrate()` dọn mảng mẫu **đúng một lần** để một GET con lỗi không bao giờ lộ dữ liệu giả như thể đó là KV thật. |
| **Kiểm thử** | Không có bài nào khoá trục icon của rail mới. | Thêm `tests/t_admin_rail.js` (54 kiểm): CSS tĩnh ở cả prototype lẫn bản sinh, tính toán trục icon, jsdom bấm thật nút thu gọn rồi đếm icon/tooltip, đối chiếu nhãn và số liệu giả; đưa vào `npm test`. |

**Kiểm chứng vòng 11:** `npm run build` đạt · toàn bộ `npm test` đạt · `tests/t_admin_rail.js` 54/54 · `tests/t_admin_real.js` 0 lỗi · 49 biến `:root` / 0 màu literal / 0 emoji giữ nguyên · 13 tab / 5 nhóm không đổi.

## 15 · RÀ TOÀN BỘ ADMIN, GỠ SẠCH DẤU VẾT PROTOTYPE (VÒNG 12)

Sau vòng 11 owner phản hồi: **"chỉ mới khắc phục đc sidebar à … sao vẫn còn vài chỗ tạo lúc demo mockup z???? làm ơn coi thiệt kĩ lại toàn bộ trang admin hiện tại dùm t"**. Vòng 11 chỉ sửa rail + vài số liệu; yêu cầu mới là rà **toàn bộ** `/admin` hiện tại, không phải 3 tấm ảnh.

| Nhóm | Còn sót trước vòng 12 | Đã xử lý |
| --- | --- | --- |
| **Bảng điều khiển prototype** | Nút tròn góc dưới + `<aside id="demo">`, 2 chip topbar `data-act="demo"` đổi **giả** trạng thái kết nối/quota, nút "Đổi mức quota", nút "Đặt lại demo" trong trạng rỗng của Phiếu bầu, `renderDemo()` / `renderDemoContent()` + CSS `.demo-*`. | Gỡ hẳn khỏi DOM bản sinh (không chỉ `hidden`), xoá luôn 2 hàm và rule CSS; `admin-real.js` ép `state.demoOpen=false` và dọn `#demo` ở mọi lần `render()`/`redraw()`. Chẳng còn `data-act="demo"` nào để bấm. |
| **Dữ liệu giả lộ khi chưa có URL Worker** | 13 mảng `SAMPLE_*`: 18 bộ "Truyện mẫu 01…18", `6.420` chương, `248` book, `18.400` lượt đọc, nhật ký `03/11 20:40`, `8.420` / `1.161`. `clearPrototypeSeed()` cũ chỉ chạy **bên trong** `hydrate()`, tức chỉ khi đã có Worker; mở `/admin` lần đầu chưa cấu hình là hiện ngay 18 bộ giả, và dù đã cấu hình vẫn có một nháy giả trước `loadAll()`. | Bản sinh thay các mảng bằng **cấu trúc rỗng cùng kiểu** (`SAMPLE_METRICS` 6 số 0, `SAMPLE_READS=[1]`, `SAMPLE_STATS` 4 mảng rỗng) để mọi hàm render vẫn chạy. `clearPrototypeSeed()` được tách ra và gọi **TRƯỚC `window.render()` đầu tiên** trong `boot()`; `hydrate()` gọi lại (no-op) nên không dọn mất dữ liệu thật giữa chừng. |
| **Hằng số / trạng thái bịa** | Dashboard: 3 báo lỗi, 2 spam, 5 khoá, 4 thiếu bìa, 3 thiếu mô tả, "3 bộ mới", "Quota đọc KV: 18.400 / 100.000", "Supabase: unavailable · R2: unavailable", "KV chỉ còn stub", "Đã chuyển … 248 book …", ngày `03/11 20:40`, label `21/10 / 28/10 / 03/11`. | Đếm từ `state.reports` / `state.comments` / `state.books` / `state.votes` / `SAMPLE_METRICS` do Worker trả; quota đọc lấy `readsToday`; biểu đồ dùng `v/(max||1)` để KV rỗng không chia cho 0; nhãn trục đổi thành "14 ngày trước / 7 ngày trước / Hôm nay". |
| **Nhãn & mã chết** | `placeholder`/`aria-label` chứa "mẫu", trạng rỗng "Dữ liệu mẫu được ẩn." / "Dữ liệu mẫu.", "Reset phiếu đã xoá toàn bộ phiếu mẫu. Dùng bảng điều khiển demo → Đặt lại", "Đã lưu lúc … (mẫu)", hàng chục toast `(mô phỏng)` trong handler bị lớp KV chặn, `document.title` và footer `sample-note`. | Dọn sạch **ngoài khối `DOCS_HTML`** bằng `scrubProto()`; trạng rỗng dùng "Chưa có dữ liệu trong KV."; bỏ footer prototype; thêm guard cho `editBookHTML()` khi `state.selectedBook=null` (trước đó `slugOf(undefined)` làm vỡ tab Sửa bộ ở chế độ chưa cấu hình). |
| **Cách làm / chống tái diễn** | Các vòng trước vá lẻ tẻ bằng `.replace()` rải rác trong generator, dễ sót khi mockup đổi. | Toàn bộ khác biệt nằm trong **`tools/admin_prod_replacements.json`** (94 mục ở vòng 12 · 128 mục sau vòng 13 · 141 mục ở vòng 14 · 145 mục sau vòng 15, mỗi mục có `note` giải thích). Generator áp tuần tự và **throw ngay** nếu một chuỗi nguồn không còn khớp; các mục đã được chain cũ xử lý đánh dấu `optional`. `scrubProto()` tách riêng khối tài liệu lịch sử để không ghi đè lịch sử vòng 1–11. |
| **Kiểm thử** | Không có bài nào quét toàn bộ 13 tab ở cả 2 chế độ. | `tests/t_admin_no_demo.js` (**96 kiểm**): (1) mã nguồn `admin.html` ngoài `DOCS_HTML`, (2) DOM render thật **chưa cấu hình Worker** (`conn=static`, 0 bộ) và **online** (67 bộ từ `registry.json`) quét 13 tab × 3 trạng thái × 5 mode đăng nhập × popover × palette × modal, 0 lỗi JS, (3) contract: prototype vẫn là bản MẪU offline, tài liệu lịch sử giữ chữ MẪU, bảng thay thế có fail-fast, `clearPrototypeSeed()` chạy trước render đầu. |

**Kiểm chứng vòng 12:** `npm run build` đạt · toàn bộ `npm test` đạt · `tests/t_admin_no_demo.js` 96/96 · `tests/t_admin_rail.js` 54/54 · 13 tab / 5 nhóm / 49 biến `:root` / 0 màu literal / 0 emoji giữ nguyên · luồng đọc/ghi KV thật, CORS preflight, `ADMIN_KEY` session-only, sanitizer và gating không đổi.

## 16 · CHIP KV GỌN, ICON THẲNG TRỤC, SỐ QUOTA LẤY TỪ WORKER (VÒNG 13)

Owner gửi ảnh 2 pill ở topbar kèm: **"vẫn còn lệch icon và 1 số chỗ bố cục bị dài dòng, thiếu chuyên nghiệp và gọn gàng / sao t chưa sửa j mà kv worker lại hiện như hình"**.

**Trả lời câu hỏi "sao chưa sửa gì mà vẫn hiện"**: chữ `Online` là **thật** — `admin-real.js` gọi `/api/whoami` rồi `setConn('online')`. Còn `KV 120/1000` là **hằng số cứng của prototype** (`QUOTA.ok.txt = 'KV write 120/1000'`). Vòng 12 đã gỡ nút đổi trạng thái demo nhưng để sót các hằng `txt`/`banner` của `QUOTA`; `renderTopbar()` vẫn đọc `q.txt` và `q.banner`, trong khi `WRITES` lấy từ `/api/admin/kv` chỉ được dùng để **chọn màu** qua `setQuota()`. Vì vậy giao diện release tự dựng ra đúng 2 pill đó — không phải do chủ trang chỉnh sửa, cũng không phải Worker mock cục bộ còn chạy (đã tắt từ vòng 12). `admin.html` có `?v=` mới là do chính bản build vòng 12, không phải ai sửa tay.

| Nhóm | Trước vòng 13 | Đã xử lý |
| --- | --- | --- |
| **2 pill / icon lệch** | `● Cloudflare KV · Online` + `KV 120/1000`; chấm 7px với `letter-spacing:.02em` lệch nhẹ khỏi trục chữ; 2 pill có 2 kiểu padding/gap riêng; chip bị `max-width:132px` + ellipsis cắt dấu ba chấm. | Gộp thành **1 chip** `#czKvChip` (chấm · `KV` · số hoặc nhãn trạng thái). `.chip` cao 28px / gap 6px, bỏ `letter-spacing`; chấm 6px `align-self:center;margin:0`; `b`, `.chip-num`, `.chip-state` đều `align-self:center;line-height:1`. Xoá CSS `.quota`, sửa 2 media query và đồng bộ chip màn đăng nhập. |
| **Số quota giả** | `QUOTA.ok.txt = 120/1000`, `warn = 800/1000`, `bad = 950/1000`, `blocked = 1000/1000 · bị chặn`, banner cứng tương ứng; Dashboard `Quota ghi KV` đọc `.txt`. | `QUOTA` chỉ còn `tone`. `admin-real.js` đẩy `WRITES`/`READS` từ `/api/admin/kv` vào `state.kvWrites`/`state.kvReads` tại `clearPrototypeSeed()` (boot), `setQuota()`, `redraw()` và **trước** `origRender()`. Chip, banner (ngưỡng 800 / 1000, tự in số thật) và sysrow Dashboard cùng một nguồn. |
| **Tự nhận Online** | `state.conn` khởi tạo `'online'`, nên render parse-time khẳng định đã nối dù chưa gọi `/api/whoami`. | Mặc định `'checking'` → chip `KV Đang nối`; chuyển `Online` chỉ sau khi `whoami` trả `ok`. Khi chưa cấu hình: `KV Chỉ đọc`, không hiện số ghi. `title`/`aria-label` giữ đủ `Cloudflare KV · … · N/1000 lượt ghi hôm nay`. |
| **Chữ dài dòng** | `Đăng nhập Supabase (chỉ dành cho độc giả)`, `Xem dữ liệu tĩnh, chỉ đọc`, `Vào Dashboard (chỉ đọc)`, `Kết nối bằng ADMIN_KEY qua header x-admin-key.`, `Lỗi độc giả gửi · xử lý, mở lại.`, `Tìm tên, tác giả gốc, couple, slug…`, `Dữ liệu tĩnh · Chỉ đọc`, `Worker: Dữ liệu tĩnh · Chỉ đọc`, trạng tải/lỗi/rỗng và chân thẻ bảo mật dài. | `CONN` rút thành `Đang nối / Online / Sai khoá / Mất kết nối / Chỉ đọc` (sysrow thành `Worker: Chỉ đọc`); cổng đăng nhập gọn, phần giải thích chuyển vào `title`; placeholder `Tìm tên, tác giả…` **đúng** với `searchData()` (chỉ tìm tên + tác giả, trước đó hứa cả couple/slug); mô tả tab, 3 dòng giới thiệu, popover và card Tình trạng hệ thống rút gọn; toast Supabase trong `admin-real.js` cũng ngắn lại. |
| **Giữ nguyên có chủ đích** | — | Văn bản chương **thật trong KV** (`Lingling x Orm`, `Tác giả gốc`, `Độc giả`, `giải pháp`, câu trích dẫn dài, id phiếu `a:may-demo-5`) **không bị cắt**; lịch sử `MẪU` trong `DOCS_HTML` và bản prototype `mockup/ssochuz-admin-mockup.html` vẫn nguyên (file thiết kế offline). |
| **Kiểm thử** | Không có bài nào khoá nguồn số quota hay trục icon của chip. | `tests/t_admin_kv_chip.js` (**121 kiểm**): (1) nguồn `admin.html` ngoài `DOCS_HTML`, CSS canh trục; (2) DOM online `writesToday=137` → chip/sysrow `137/1000`, banner im lặng; (3) DOM quota cao `850` → banner tự sinh; (4) DOM chưa cấu hình → `KV Chỉ đọc`; (5) DOM **parse-time** chưa nạp `admin-real.js` → `KV Đang nối`, không flash `120/1000`; (6) contract `admin-real.js` + prototype vẫn MẪU. |

**Kiểm chứng vòng 13:** `npm run build` đạt · toàn bộ `npm test` đạt · `tests/t_admin_kv_chip.js` 121/121 · `tests/t_admin_no_demo.js` 96/96 · `tests/t_admin_rail.js` 54/54 · `tests/t_admin_real.js` 0 lỗi · 13 tab / 5 nhóm / 49 biến `:root` / 0 màu literal / 0 emoji · CORS preflight, `ADMIN_KEY` session-only, sanitizer và gating không đổi.

## 17 · RÀ TOÀN BỘ ADMIN, SỬA HOMEPAGE CMS, HẾT CỤT DỮ LIỆU TRUYỆN (VÒNG 14)

Owner báo: **"check lại, có lỗi ở trang chỉnh homepage, dữ liệu truyện bị thiếu tùm lum, check kĩ toàn bộ admin panel đi tr"**. Rà lại toàn bộ 13 tab với registry thật (`lib` 67 bộ, `editorChoice` 12 slug, `schedule.items` 6 dòng, 67/67 bộ có `thumb`), ở **cả hai** chế độ (online KV / chưa cấu hình).

| Nhóm | Trước vòng 14 | Đã xử lý |
| --- | --- | --- |
| **Lỗi Homepage CMS** | `realSaveHomepage()` chặn cứng `Cần ít nhất 1 slide trước khi lưu`. `registry.slides = []` là hợp lệ (web tự lấy 5 bộ mới nhất) nên bấm **Lưu trang chủ** luôn báo lỗi, không ghi được lịch / Series / thông báo. | Bỏ chặn; vẫn kiểm tra dòng lịch thiếu `days`/`slug`. Toast ghi rõ `Đã lưu lịch, Series và thông báo lên KV · không có slide, web tự lấy 5 bộ mới nhất.` |
| **Ô chọn bộ cụt** | Homepage `bookOpts`, Sửa bộ `switch-book`, Chương `chapter-book`, Bình luận `cmt-book` dùng `state.books.slice(0,8)`; Cài đặt `st-slug` dùng `slice(0,6)`. Với 67 bộ ⇒ 59 bộ không chọn được. 6 dòng lịch có slug ngoài 8 bộ đầu nên **tất cả select nhảy về `HOMETOWN ROMANCE - SPECIAL`** — và một lần change/save là ghi đè mất slug thật. | Thêm `bookOptions(sel,useTitle)`: duyệt **toàn bộ** `state.books`, sắp A–Z theo `localeCompare('vi')`, chèn option `(không còn trong KV)` nếu slug đang lưu biến mất để không tự nhảy. Dùng chung cho 5 màn hình. Thư viện `per=8` → `per=20` ở cả `libraryHTML()` lẫn `currentPageBooks()`. |
| **Chuyển thể Series** | Card hiện 6 checkbox, tick 3 bộ đầu (`S.picked = lib.slice(0,3)`), bỏ qua 12 slug `editorChoice` thật; tick xong **không ghi ra registry** ⇒ mất sạch khi chuyển tab. | `hydrate()` đọc `REG.editorChoice` (fallback `settings.editorChoice`), chuẩn hoá object→slug, giới hạn 12. Card liệt kê 67 bộ trong khung cuộn + bộ đếm `#hpPickedCount`. Listener `change` cập nhật `S.picked` với trần 12. `currentRegistryFromState()` ghi cả `editorChoice` lẫn `settings.editorChoice`. |
| **Banner / ghi chú lịch** | `S.models['hp-text']` / `['hp-href']` được gán **trước** khi đọc `announcement` ⇒ 2 ô luôn rỗng; `hp-banner` không có `checked` ⇒ công tắc luôn tắt (save sẽ TẮT banner đang bật). `S.hpNote` lấy `announcement.text` thay vì `schedule.note`; ô ghi chú lịch không được ghi ngược. `S.schedule` map `c: x.detail || x.title` ⇒ ghi chú rỗng biến thành **tên bộ**, rồi ghi đè `detail` trong KV. | Gán models **sau** khi đọc `ann`; `S.models['hp-banner'] = !!ann.enabled` + attribute `checked`; `S.hpNote = REG.schedule.note`; `c: x.detail || x.note || ''` (giữ `title` riêng). `currentRegistryFromState()` ghi `schedule.note`, `updated`, `announcement.enabled/text/href`. |
| **Ảnh bìa / phiếu bầu / tìm kiếm** | `window.cover` đã vẽ ảnh thật nhưng không có `decoding`/`referrerpolicy`, không chặn URL lạ và không có dự phòng khi ảnh hỏng (CSP `script-src-attr 'none'` cấm `onerror` inline). `loadVoters()` chỉ hỏi 5 bộ đầu ⇒ tab Phiếu bầu thiếu phiếu 62 bộ. `searchData()` chỉ tìm tên + tác giả, cắt 8 gợi ý. | `window.cover` chỉ nhận `https://`, thêm `decoding="async"`, `referrerpolicy`, `data-cover` + `data-fb-text`; listener `error` capture thay ảnh hỏng bằng `.cover.cv-miss` chứ 3 chữ đầu tên bộ. `loadVoters()` đọc `STATS_ITEMS` từ `/api/admin/stats` rồi **chỉ hỏi những bộ có phiếu** (fallback 12, trần 40, gộp 200 phiếu) — đủ dữ liệu mà không bắn 67 request kiểu `flushStats`+`readStats` mỗi lần mở admin. `searchData()` tìm cả slug/couple, 12 gợi ý. |
| **Kiểm thử** | Không có bài nào soi số lượng tuỳ chọn hay body ghi homepage. | `tests/t_admin_full_data.js` (**140 kiểm**): nguồn `admin.html` + `admin-real.js`, 13 tab × 2 chế độ 0 lỗi JS, 67 tuỳ chọn ở mọi select, 6 slug lịch đúng, 12 editorChoice, 20 ảnh bìa thật + fallback, bấm **Lưu trang chủ** thật và soi `PUT /api/registry` (giữ 67 bộ / `slides=[]` / 6 slug / `detail` rỗng / `title` nguyên / note / editorChoice / announcement), rồi tick Series · đổi lịch · bật banner · sửa thông báo và kiểm tra lần ghi tiếp. |

**Kiểm chứng vòng 14:** `npm run build` đạt · toàn bộ `npm test` đạt · `tests/t_admin_full_data.js` 140/140 · `tests/t_admin_no_demo.js` 96/96 · `tests/t_admin_rail.js` 54/54 · `tests/t_admin_kv_chip.js` 121/121 · `tests/t_admin_real.js` 0 lỗi (33 request tới Worker giả, không tăng vọt) · 13 tab / 5 nhóm / 49 biến `:root` / 0 màu literal / 0 emoji · prototype và tài liệu lịch sử vẫn MẪU có chủ đích.

## 18 · CHUYỂN THỂ SERIES: CARD GỌN 12, CHỌN KHÔNG TRẦN, TRANG RIÊNG (VÒNG 15)

Owner: **"chỉnh lại, chỗ chuyển thể series hiển thị tối đa là 12 bộ nhưng số lượng đc chọn nhiều hơn, hiện nút xem thêm rồi mở ra 1 trang toàn những bộ chuyển thể á"**.

Vòng 14 đã sửa triệt để lỗi cụt danh sách (card liệt kê **67** checkbox, tick đúng 12 `editorChoice`, ghi ra KV) nhưng owner muốn **gọn** hơn: card chỉ **hiển thị tối đa 12 bộ**, trong khi **số lượng được chọn không bị giới hạn 12**; mọi thao tác quản lý lựa chọn dời sang **một trang riêng** mở bằng nút **Xem thêm**.

| Thành phần | Hành vi vòng 15 |
| --- | --- |
| **Card Homepage CMS** | `shownIds = state.picked.slice(0,12)` rồi điền thêm các bộ khác cho đủ 12 (dùng bảng `byId`, KHÔNG dùng `getBook()` vì hàm này fallback về bộ đầu khi slug lạ). Grid `#seriesPickedGrid` có tối đa 12 checkbox. Header `đã chọn <b id="hpPickedCount">N</b> / 67 bộ` in **tổng đang chọn**, không phải số ô. Nếu `N > 12` hiện `… và N−12 bộ nữa. Mở trang Chuyển thể Series để xem hết.` |
| **Bỏ trần 12** | `hydrate()` bỏ `.slice(0,12)` (thay bằng khử trùng slug); `currentRegistryFromState()` ghi `S.picked.slice()` nguyên vẹn ra `editorChoice` + `settings.editorChoice`; listener `change` bỏ nhánh `S.picked.length >= 12` và toast `Chuyển thể Series tối đa 12 bộ.`. Tick thứ 13, 20 hay 67 đều hợp lệ và web public hiện đúng. |
| **Nút Xem thêm** | `data-act="series-page"`, nhãn `Xem thêm · tất cả 67 bộ` (số lấy `state.books.length`). `case 'series-page':openSeriesPage();break;` trong handler click — không nằm trong `REAL_CLICK` của `admin-real.js` nên không bị chặn. |
| **Trang Chuyển thể Series** | Overlay `#seriesPage` toàn màn hình (`position:fixed;inset:0;z-index:200`, `role="dialog"`, `aria-label`), nằm **ngoài** `#view` nên không bị `render()` ghi đè; **không thêm route/tab** → NAV vẫn 13 tab / 5 nhóm. Gồm: nút `← Quay lại Homepage CMS`, `h2` riêng, ô tìm `[data-role="series-q"]` (tên + tác giả + slug, lọc bằng `display:none` nên giữ focus), lưới 67 `.series-card` với `cover(b,'lg')` ảnh bìa thật, `Chọn tất cả` / `Bỏ chọn tất cả`, 2 bộ đếm, `Đóng` và **`Lưu lựa chọn lên KV`** (`series-save` → `saveHomepage()` = `realSaveHomepage()` rồi đóng). Đóng thêm bằng **Esc**. CSS dùng toàn token `:root` (`--surf`, `--bd2`, `--head`…), không màu literal. |
| **Đồng bộ bộ đếm** | `admin-real.js` chặn sự kiện `change` ở capture (`stopPropagation`) nên hàm inline `syncSeriesCount()` không chạy được từ checkbox; listener cập nhật trực tiếp cả `hpPickedCount`, `seriesPageCount`, `seriesPageFootCount`. `series-all` / `series-none` gọi `syncSeriesCount()` sau khi gán `state.picked`. |
| **Chế độ chưa cấu hình** | Card rỗng nhưng vẫn có nút; trang mở ra hiện `Chưa có bộ nào trong KV`, 0 thẻ giả, 0 lỗi JS. |

**Kiểm chứng vòng 15:** `npm run build` đạt · toàn bộ `npm test` đạt · `tests/t_admin_series_page.js` **95/95** (card 12 · trang 67 · lọc · tick vượt 12 · chọn/bỏ tất cả · `PUT` với `editorChoice=20` · đóng bằng nút/Esc · 13 tab × 2 chế độ) · `tests/t_admin_full_data.js` **144/144** · `t_admin_no_demo.js` 96/96 · `t_admin_rail.js` 54/54 · `t_admin_kv_chip.js` 121/121 · E2E HTTP qua Worker RAM đạt · 13 tab / 5 nhóm / 49 biến `:root` / 0 màu literal / 0 emoji · prototype và tài liệu lịch sử vẫn MẪU có chủ đích.

> **Phạm vi cố tình giữ lại:** `mockup/ssochuz-admin-mockup.html` (prototype offline, route `/admin-mockup`) vẫn mang nhãn MẪU và bảng điều khiển thiết kế; modal **Tài liệu bàn giao** trong `admin.html` vẫn kể lại lịch sử các vòng với chữ MẪU. Đó là tài liệu, không phải dữ liệu giả lọt vào giao diện quản trị. Chỉ `/admin` (`admin.html`) là bản phát hành đọc/ghi Cloudflare KV.

## 19 · TRANG CHỦ GỌN HƠN, RANKING HAI Ô, ĐỒNG BỘ ADMIN ↔ WEB (VÒNG 16)

Owner: **"sạp báo ở trang chủ đang khá bự, nhỏ lại chút (trên deskstop)"**, **"nhiều chức năng trong admin panel chưa đồng bộ so với dữ liệu hiển thị thật của trang, fix đi"**, **"chỗ ranking và đáng xem ko giống những gì t mong muốn, t muốn bạn làm tựa tựa kiểu hình 3 của trang glvietsubz.net"**, **"Dựng mockup preview cho t xem + nút xem thêm ở chỗ chuyển thể nha"**.

"Sạp báo" = HERO **BỘ BÀI** (`src/cz-hero.js` + CSS 579–731). "Hình 3" được hiểu là bố cục tham chiếu trong ảnh `image-9.png` (khung **Hôm Nay Xem Gì** của glvietsubz.net: số thứ tự mảnh lớn · bìa dọc nhỏ · tên + phụ đề · con số lệch phải, đặt trong ô tối song song với nội dung chính). **Lấy cảm hứng bố cục, không chép màu / chữ / ảnh / dữ liệu của trang khác**; toàn bộ tiêu đề, bìa và số liệu vẫn là dữ liệu thật trong `data/registry.json` và KV.

| # | Thay đổi | Chi tiết |
| --- | --- | --- |
| **1** | **Sạp báo nhỏ lại, chỉ desktop** | `@media (min-width: 1024px)`: `--cover-w` từ `clamp(196px,22.5vw,292px)` xuống `clamp(176px,18vw,244px)`; khung `.hero` từ ~561px xuống ~466px @1280, `.hb-grid` và `h1` hạ theo. **Mọi luật tablet (640–1023px) và điện thoại (≤639px) giữ nguyên** — owner dặn rõ "trên deskstop". |
| **2** | **Ranking / Đáng xem thành 2 ô** | `index.html` gom `#bxh` + `#dang-xem` vào `.rankpair` (1,06fr / 1fr, 1 cột ≤900px). Mỗi ô là `.rankbox` có viền + nền `--surf`; số thứ tự 30px (đầu 34px), bìa 52×76, tên tối đa 2 dòng, con số lệch phải. **Thanh hồng `.bar` chạy dài dưới mỗi hàng bị ẩn**, thay bằng một đường tóc `--bd` ngăn hàng; triệt tiêu luôn các luật hover/animation `!important` cũ. Bỏ đường kẻ/trống lớn trong ảnh hiện trạng `image-8.png`. |
| **3** | **Nút Xem thêm ở Chuyển thể Series** | `#bien-tap .sechead` có `<a class="btm" href="/chuyen-the">Xem thêm ›</a>`. Trang mới `chuyen-the.html` + `src/cz-series.js` đọc `CZ.editorChoice(reg)` và vẽ **TOÀN BỘ** bằng `CZ.card()` (trang chủ vẫn `slice(0,8)`). Vòng 15 cho admin chọn không giới hạn; trước vòng 16 các bộ thứ 9+ không có đường ra public. `_redirects` có 2 luật URL sạch (đích `/chuyen-the`, **không** trỏ `.html` để tránh vòng lặp 308); `sw.js` tăng `CZ_SW_VER` lên `20261104v16` và precache `/chuyen-the` + `/cz-series.js`. |
| **4** | **Mockup preview** | `mockup/home-preview.html`: nạp `/data/registry.json` thật + chính `/cz.css` đã sửa, dựng lại sạp báo thu nhỏ, cặp Ranking/Đáng xem, dải Chuyển thể 8 tấm và banner. Bản preview **không bịa số liệu**: dùng số chương / năm / trạng thái thật vì lượt đọc và điểm sao chỉ có khi nối KV. |

### 4 chức năng admin từng ghi ra KV nhưng web bỏ qua (đã sửa)

| Chức năng trong Homepage CMS | Khoá KV | Lỗi trước vòng 16 | Cách sửa |
| --- | --- | --- | --- |
| **Bật banner + Nội dung thông báo + Link** | `settings.announcement.{enabled,text,href}` | `admin-real.js` ghi đủ 3 ô từ vòng 14, nhưng **không một dòng nào trong `src/` đọc khoá này** ⇒ công tắc vô tác dụng, web không bao giờ hiện thông báo. | `renderAnnouncement(reg)` trong `src/cz-home.js` gọi ngay trong `boot(reg)`: chỉ hiện khi bật **và** có chữ; link chỉ nhận `/…` hoặc `http(s)://…` (chặn `javascript:`/`data:`), có `[hidden]` mặc định nên không có dữ liệu giả. CSS `.announce` dùng toàn token `:root`. |
| **Lý do giới thiệu (mỗi slide)** | `slides[].reason` | `CZ.slides()` gắn thành `n._reason`, nhưng `heroItem()` không đọc ⇒ ô nhập liệu mất tích trên web. | `heroItem()` thêm viên nhãn `tone:'acc'` (cắt 60 ký tự) cạnh tình trạng; `cz-hero.js` đã có sẵn nhánh `extraBadgesHTML()` nên không sửa component. |
| **Ghi chú của Lịch ra chương** | `schedule.items[].detail` | `renderSched()` chỉ dùng `detail` khi **không** tìm được bộ; dữ liệu thật luôn có `slug` nên ghi chú biến mất. | Ghép `rowNote` vào dòng phụ của cả hàng thường lẫn tấm tiêu điểm, cùng nhịp với số chương / tình trạng. `schedule.note` (`#lichNote`) và `#lichToday` vốn đã hoạt động — rà soát xác nhận **không** có lỗi hàm trùng tên, giữ nguyên. |
| **Chuyển thể Series chọn > 8 bộ** | `editorChoice` + `settings.editorChoice` | Vòng 15 bỏ trần 12, admin có thể lưu 20–67 slug; `renderEditorChoice()` vẫn `slice(0,8)` ⇒ 12+ bộ không bao giờ thấy trên web. | Nút **Xem thêm** public mở `/chuyen-the` liệt kê toàn bộ (xem mục 3). Trang chủ vẫn gọn 8 tấm, bộ đếm admin khớp với trang riêng. |

> **Đã rà và cố tình KHÔNG "sửa" 2 chỗ tưởng lệch:** (a) thêm/xoá chương **không** cần admin ghi lại registry — `worker/cms.js → putChapter()` đã gọi `syncCountToRegistry()` (cập nhật `chapters`, `countLabel`, `pending`, `schedNext`), và `tests/t_admin_chapter.js` khoá riêng việc "Lưu chương chỉ PUT 1 chương, không ghi registry"; (b) đặt/bỏ khoá mật mã cũng **không** cần ghi cờ từ admin — `setLock()` trên Worker gọi `setLockFlag(env, slug, 0|1)`. Thêm lần ghi thứ hai ở admin vừa tốn quota vừa phá hợp đồng đã kiểm thử.

**Kiểm chứng vòng 16:** `npm run build` đạt · `tests/t_v16.js` (cấu trúc + 6 màn jsdom chạy thật: banner bật/tắt/link lạ, lý do slide, ghi chú lịch, 20 thẻ trang riêng vs 8 thẻ trang chủ) · `t_pwa.js` · `t_html.js` (173 luật `_redirects`) · `t_home.js` · `t_hero.js` · `t_ranking.js` · `t_devserver.js` · `t_admin_no_demo.js` · `t_admin_full_data.js` · `t_admin_series_page.js` · `check_src` / `check_og` / `check_version` · toàn bộ `npm test` · `audit:a11y` · E2E HTTP qua Worker KV RAM. Giữ nguyên: 13 tab / 5 nhóm, 49 biến `:root` / 0 màu literal / 0 emoji, không dữ liệu mẫu, `admin.html` chỉ sinh qua `tools/admin_prod_replacements.json` fail-fast.

