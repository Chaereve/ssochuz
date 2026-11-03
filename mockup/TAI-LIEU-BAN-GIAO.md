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

Hash route 13 tab + đăng nhập · thu gọn sidebar · drawer + scrim + Esc · ô tìm gợi ý + `Ctrl+K` (↑/↓/Enter/Esc) · lọc/sắp xếp/phân trang Thư viện · chọn nhiều + thanh hàng loạt (6 lựa chọn đúng `BookList.jsx`, CSV, JSON; xoá mạnh chỉ cho từng bộ) · "Sửa bộ" chỉ mở khi có bộ được chọn · modal xác nhận thường & mạnh · toast · validate form · cảnh báo đổi slug · tự lưu nháp "Đã lưu lúc…" · thêm/xóa/di chuyển chương · **đổi case đoạn/vùng chọn** · **ô tiêu đề chương riêng** · **nhiều dòng + couple** · **Ctrl/Cmd+S** · **Ctrl/Cmd+Alt+N** · **migration overflow KV** · import mẫu · banner quota · tài liệu bàn giao trong modal.

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
| 16 | Thêm đổi case trong trình soạn | Owner dịch truyện nên cần sửa hoa/thường nhanh cho đoạn hoặc vùng chọn mà không rời editor. |
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

---

## 3 · PHASE 4 — TỰ PHẢN BIỆN

### 3.1 Heuristic Nielsen (thang 1–5)

| # | Tiêu chí | Điểm | Cải thiện đã làm |
| --- | --- | --- | --- |
| 1 | Hiện trạng hệ thống | 5 | Chip 5 trạng thái, quota 4 mức, banner đỏ, "đã lưu lúc…", skeleton, toast. |
| 2 | Khớp thế giới thật | 5 | Vòng 4 đối chiếu `src/admin/**`: đúng tên tab, 7 trạng thái xuất bản, 4 trạng thái chương, cụm xác nhận và thuật ngữ KV/Worker. |
| 3 | Kiểm soát & tự do | 4 | Esc đóng modal/drawer/palette, "Bỏ chọn", "Nhập lại", "Thử lại", "Về bình thường". |
| 4 | Nhất quán & chuẩn | 5 | Một `:root`, một bộ nút/badge/bảng, nhịp 8px, 1 nút chính/header ở mọi màn. |
| 5 | Ngăn lỗi | 5 | Validate form, cảnh báo slug, xác nhận mạnh có gõ, xóa 2 lần, gated Sửa bộ. |
| 6 | Nhận diện thay vì nhớ | 5 | Gợi ý tìm + Ctrl+K, eyebrow nhóm, tooltip, nhãn mono rõ trên điều khiển. |
| 7 | Linh hoạt & hiệu quả | 4 | Hash route, lọc/sắp xếp/phân trang, thao tác hàng loạt, Ctrl+K / Ctrl+S / Ctrl+Alt+N. |
| 8 | Thẩm mỹ & tối giản | 4 | Không bóng, không gradient, vạch tóc, hồng có chủ đích; còn nhiều bảng đặc dữ liệu. |
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

---

## 4 · ĐỀ XUẤT THÊM (không nằm trong mockup)

- Phỏng vấn chủ site + quan sát 1 ca dịch/đăng chương để kiểm chứng 5 giả thuyết ở Phase 1.
- Lịch sử phiên bản / undo cho metadata và chương (ngoài danh sách chức năng hiện có).
- Nếu sau này có cộng tác viên: phân quyền phía server thay vì chỉ ở UI như mã nguồn hiện tại.
- Cảnh báo quota chủ động trước khi chạm 80% và báo cáo ghi theo ngày.
- Xuất nhật ký ra CSV để đối soát định kỳ; shortcut duyệt nhanh cho chủ site.
- Đo hiệu năng bảng lớn, thử 360px trên thiết bị thật và kiểm tra công nghệ hỗ trợ trước khi chuyển code production.
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
| Thêm đổi case đoạn | Select "Đổi case…" trong toolbar: CHỮ HOA / chữ thường / Chữ Hoa Mỗi Từ / Định dạng câu, áp cho vùng chọn hoặc cả đoạn, có `toLocaleUpperCase('vi')` / `toLocaleLowerCase('vi')` và cập nhật "đã lưu lúc…". |
| Ô tiêu đề chương riêng | Thêm `#chapterTitle` phía trên toolbar, bind trực tiếp với `state.chapters[active]`, cập nhật danh sách chương khi gõ. |
| Lỗi phần Mới cập nhật | Ba lỗi cùng lúc: `.scrim` hiển thị ở desktop làm mờ toàn trang (sửa `display:none` + `.app.drawer .scrim`); `.list-item .t span` đè `display:block` lên badge (đổi `>span`, badge `inline-flex`); nút demo to chèn nội dung (thu thành nút tròn 44px + tăng padding đáy 120px). |
| Tinh gọn chữ | Rút gọn ~25 chuỗi giao diện, bỏ "(mẫu)" lặp, gộp nhãn phụ dải số liệu về `MẪU`, giữ đánh dấu rõ ở eyebrow/meta/footer. |

**Kiểm chứng vòng 3 bằng Chromium thật (không chỉ jsdom):** badge gọn còn 103/90/38px trên một dòng · scrim desktop `display:none` · đổi case `upper` ra chữ hoa tiếng Việt đúng · ô tiêu đề gõ xong cập nhật cả state lẫn danh sách · 13 tab / 5 nhóm · viewport 360px có `scrollWidth = 360` (không tràn ngang) · 0 lỗi JS.

## 7 · ĐỐI CHIẾU VỚI MÃ NGUỒN GỐC (VÒNG 4)

Owner báo "một vài tính năng không đúng với tính năng gốc". Rà lại `src/admin/components/*`, `src/admin/utils/books.js`, `src/shared/schedule.js`, `src/admin/main.jsx` và `src/admin/PARITY-CUTOVER.md`. **13 tab / 5 nhóm, đổi case đoạn và ô tiêu đề chương riêng giữ nguyên**; các chỗ lệch dưới đây đã sửa.

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

**Giữ theo yêu cầu riêng của owner (không có trong source):** đổi case đoạn/vùng chọn, ô tiêu đề chương riêng, 13 tab / 5 nhóm. **Giữ theo brief thiết kế:** lọc/sắp xếp/phân trang, 4 trạng thái mỗi màn, một nút chính cố định, tag chip trong bộ component, modal ví dụ "gõ tên bộ".

**Kiểm chứng vòng 4:** `node --check` đạt · 136/136 kiểm tra cấu trúc (14 route × 4 trạng thái, 13 nav, 14 hành động chính, 5 chip, 4 quota, khung, `Ctrl+K`, docs) · 122/122 kiểm tra đối chiếu source · 0 lỗi JS · render bằng Chromium thật ở desktop và 360px.

## 8 · BỔ SUNG VÒNG 5 THEO YÊU CẦU

| Yêu cầu | Đã làm | Tinh chỉnh cho phù hợp |
| --- | --- | --- |
| Nhiều dòng `+ couple` | Block Couple ở **Thêm bộ** và **Sửa bộ**, khớp `NewBook.jsx` / `BookEditor.jsx` | Nút ghost nhỏ cạnh nhãn; `Enter` thêm dòng và focus dòng mới; `×` chỉ hiện khi có ≥ 2 dòng hoặc dòng có chữ; gợi ý từ `datalist` lấy couple có sẵn. Giá trị gộp `", "` vào `state.models['nb-c' / 'eb-c']` nên `submitNew` / `commitEdit` / CSV không đổi. Không thêm câu giải thích dài. |
| Migration overflow KV | Card **Lưu trữ tràn (tuỳ chọn)** trong **Kiểm tra dữ liệu** | Chọn vì đây là chức năng quan trọng với free-tier: nó chính là cách giảm áp lực ghi/đọc KV mà chip quota đang cảnh báo. 3 nút `Chuyển tất cả / Chỉ bìa / Chỉ book`, xác nhận thường như `DoctorPanel`, kết quả gọn 1 dòng; tự khoá khi `static` hoặc quota `blocked`. **Cài đặt** chỉ thêm một câu trạng thái, không chép khối SQL của source để tránh nhiễu. |
| `Ctrl+S`, `Ctrl+N` | Handler trong `keydown`, đúng `main.jsx` | `Ctrl/Cmd+S` lưu chương / metadata / tạo bộ, màn khác báo "Không có gì để lưu". `Ctrl/Cmd+N` **và** `Ctrl/Cmd+Alt+N` thêm chương (bắt cả `e.code === 'KeyN'` cho bàn phím AltGr); ở màn khác không `preventDefault` để trình duyệt vẫn mở cửa sổ mới. Ghi chú ngắn dưới trình soạn và form Sửa bộ, có chú thích vì sao cần Alt. |

Toast được gom tối đa 3 cái để không che nội dung khi bấm phím tắt liên tục.

**Kiểm chứng vòng 5:** `node --check` đạt · 136/136 cấu trúc · 122/122 đối chiếu source · kiểm tra bổ sung cho couple / migration / phím tắt đều đạt · 0 lỗi JS · Chromium thật ở desktop và 360px không tràn ngang. Phase 1 vẫn 398 từ.
