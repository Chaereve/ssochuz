# TÀI LIỆU BÀN GIAO — Mockup admin ssochuz library

> **Phạm vi:** thiết kế lại giao diện cho **chức năng đã có**. Không thêm màn hình, tab, thanh toán/xu, light mode, ảnh stock hay thư viện UI ngoài. Mọi tên truyện, tên người, số liệu và nội dung đều là **DỮ LIỆU MẪU**. File mockup mở bằng double-click, không cần server.

## 0 · Cấu trúc bàn giao

| File | Nội dung |
| --- | --- |
| `PHASE-1-NGHIEN-CUU.md` | Bài viết nghiên cứu Phase 1 (≤ 400 từ): JTBD, 5 giả thuyết điểm đau, 5 tham chiếu, 5 nguyên tắc, phê bình IA. |
| `ssochuz-admin-mockup.html` | **MỘT file HTML duy nhất**, tự chứa (inline CSS/JS): đăng nhập + 15 tab, 4 trạng thái/màn, biến thể khung, tương tác. Có cả nút **Tài liệu bàn giao** để đọc tài liệu này ngay trong file. |
| `TAI-LIEU-BAN-GIAO.md` | File này: Phase 2, ma trận màn hình, nhật ký quyết định, Phase 4, đề xuất thêm. |
| `README.md` | Chỉ dẫn mở file và đối chiếu tiêu chí nghiệm thu. |

**Lưu ý về số tab:** đề bài ghi "14 tab" nhưng danh sách liệt kê 15, và `src/admin/components/Layout.jsx` trong repo cũng có 15 (`docs/product-surface-map.md` ghi "Hoàn chỉnh, 15 tab"). Mockup dựng **đủ 15** để không bớt chức năng "Thư viện"; giữ nguyên tên, thứ tự, 6 nhóm. Đây là điểm cần owner xác nhận, đã ghi trong "Vấn đề còn tồn tại".

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
- **Component:** nút (chính / phụ / ghost / nguy hiểm), input, select, checkbox & switch tự vẽ, tab, bảng (thead dính), thẻ, badge đủ tone (`ok / warn / bad / info / violet / slate / neutral / acc`), tag chip, modal xác nhận (kể cả kiểu **gõ tên bộ để xác nhận**), toast, skeleton, empty state, banner, tooltip, pagination.
- **Icon:** SVG inline `24×24`, `stroke-width="1.75"`, `currentColor`, nét đồng nhất, không emoji.

### 1.4 Ma trận màn hình

| # | Màn (hash route) | Nội dung ưu tiên | Hành động chính |
| --- | --- | --- | --- |
| 0 | `#/dang-nhap` | Eyebrow + h2 + mô tả; Supabase / URL Worker + ADMIN_KEY / dữ liệu tĩnh chỉ đọc | Kết nối (mô phỏng) |
| 1 | `#/dashboard` | Dải 6 số liệu → Việc cần làm → Tình trạng hệ thống → biểu đồ 14 ngày → Mới cập nhật | Đọc lại dữ liệu |
| 2 | `#/thu-vien` | Tìm/lọc/sắp xếp → bảng sticky → phân trang → thanh thao tác hàng loạt | Thêm bộ |
| 3 | `#/them-bo` | Metadata → chương đầu (tuỳ chọn) → ảnh bìa | Tạo bộ |
| 4 | `#/sua-bo` | Form + cảnh báo slug → khóa mật mã → nhân bản | Lưu thay đổi |
| 5 | `#/chuong` | Nháp / chờ duyệt / lịch đăng → trình soạn chương | Soạn chương |
| 6 | `#/binh-luan` | Kiểm duyệt + nghi spam + xóa 2 lần | Đọc lại dữ liệu |
| 7 | `#/bao-loi` | Lỗi độc giả gửi + đánh dấu đã xử lý | Đọc lại dữ liệu |
| 8 | `#/phieu-bau` | Phiếu theo người đọc + gỡ + reset | Reset phiếu |
| 9 | `#/homepage-cms` | Slide → bộ được chọn → lịch ra chương | Lưu thay đổi |
| 10 | `#/tac-gia` | Tác giả + số bộ đã xuất bản | Đọc lại dữ liệu |
| 11 | `#/vai-tro` | Nhân sự + quyền truy cập theo nhóm | Lưu quyền truy cập |
| 12 | `#/thong-ke` | Top lượt đọc / thích / người bầu / hôm nay | Đọc lại dữ liệu |
| 13 | `#/kiem-tra-du-lieu` | Đối chiếu KV → kết quả quét → recount | Recount |
| 14 | `#/nhat-ky` | 200 thao tác gần nhất | Đọc lại dữ liệu |
| 15 | `#/cai-dat` | Sao lưu/khôi phục JSON → Blogger → flush stats/recount | Sao lưu JSON |

**Mỗi màn có 4 trạng thái** (bình thường / rỗng / đang tải skeleton / lỗi), điều khiển độc lập theo route trong bảng demo. Màn đăng nhập có biến thể riêng: rỗng = chưa cấu hình Worker, tải = đang kiểm tra kết nối, lỗi = sai ADMIN_KEY / lỗi Worker.

**Biến thể khung:** chip kết nối 5 trạng thái · quota 4 mức (ok / cảnh báo / nguy hiểm / bị chặn + banner đỏ) · sidebar thu gọn · drawer mobile 360px · modal xác nhận mạnh · giả lập khung 360px ngay trên desktop.

### 1.5 Tương tác đã chạy

Hash route 15 tab + đăng nhập · thu gọn sidebar · drawer + scrim + Esc · ô tìm gợi ý + `Ctrl+K` (↑/↓/Enter/Esc) · lọc/sắp xếp/phân trang Thư viện · chọn nhiều + thanh hàng loạt (đổi trạng thái, 18+, CSV, JSON, xóa mạnh) · "Sửa bộ" chỉ mở khi có bộ được chọn · modal xác nhận thường & mạnh · toast · validate form · cảnh báo đổi slug · tự lưu nháp "Đã lưu lúc…" · thêm/xóa/di chuyển chương · import mẫu · banner quota · tài liệu bàn giao trong modal.

---

## 2 · NHẬT KÝ QUYẾT ĐỊNH

| # | Quyết định | Lý do |
| --- | --- | --- |
| 1 | Dựng 15 tab dù đề bài ghi "14 tab" | Danh sách liệt kê và `Layout.jsx` đều có 15; bớt một tab sẽ bớt chức năng Thư viện đã mô tả chi tiết. |
| 2 | Giữ nguyên 6 nhóm, tên, thứ tự | Đây là thiết kế lại giao diện cho chức năng đã có, không phải sắp xếp lại sản phẩm. |
| 3 | Mỗi header có đúng một hành động chính, ở cùng góc | Giảm chi phí quét mắt, tránh hai nút chính cạnh nhau trên màn hẹp. |
| 4 | Dải 6 số liệu không bọc card, chỉ vạch tóc | Phát huy phong cách hiện có; card chồng card tạo nhiễu trên dashboard. |
| 5 | Hồng chỉ cho việc chính / tab chọn / focus / số đếm | Màu nhấn hiếm mới có ý nghĩa; tránh biến mọi badge thành tín hiệu khẩn. |
| 6 | Chip kết nối + pill quota + banner nằm trên khung | Trạng thái hệ thống là thông tin toàn cục, không nên lặp trong từng card. |
| 7 | Xóa / recount / reset / khôi phục bắt gõ chính xác | Ma sát có chủ đích tỉ lệ rủi ro mất dữ liệu; xóa một bộ bắt gõ đúng tên bộ. |
| 8 | Xóa bình luận xác nhận hai lần | Thao tác kiểm duyệt nhạy cảm; hai bước tách "bấm nhầm" khỏi "đồng ý xóa". |
| 9 | "Sửa bộ" làm mờ và chặn khi chưa chọn bộ | Phản ánh đúng ràng buộc thật, giải thích bằng tooltip + toast thay vì im lặng. |
| 10 | Trạng thái rỗng/tải/lỗi điều khiển theo từng màn | Người review kiểm tra mọi màn mà không phải sửa dữ liệu mẫu. |
| 11 | Bảng điều khiển demo tách khỏi sản phẩm, đặt ở góc | Biến thể khung là công cụ duyệt thiết kế, không phải tính năng admin. |
| 12 | Bìa là ô màu CSS; mọi dữ liệu gắn nhãn MẪU | Tránh ảnh ngoài/ảnh stock và không gây hiểu nhầm số liệu là thật. |
| 13 | Bảng cuộn ngang trong `.table-wrap` tại 360px | Giữ thead dính và đủ cột dữ liệu mà không làm tràn ngang cả trang. |
| 14 | Không dùng bộ nhớ trình duyệt, không gọi Worker thật | Mockup mở bằng double-click phải an toàn và không phụ thuộc hạ tầng. |
| 15 | Nhúng luôn tài liệu bàn giao vào modal trong HTML | Một file duy nhất vẫn tự chứa toàn bộ nghiên cứu, token, tự phản biện và đề xuất. |

---

## 3 · PHASE 4 — TỰ PHẢN BIỆN

### 3.1 Heuristic Nielsen (thang 1–5)

| # | Tiêu chí | Điểm | Cải thiện đã làm |
| --- | --- | --- | --- |
| 1 | Hiện trạng hệ thống | 5 | Chip 5 trạng thái, quota 4 mức, banner đỏ, "đã lưu lúc…", skeleton, toast. |
| 2 | Khớp thế giới thật | 5 | Đúng tên tab, nhãn trạng thái, thứ tự badge, thuật ngữ KV/Worker của mã nguồn. |
| 3 | Kiểm soát & tự do | 4 | Esc đóng modal/drawer/palette, "Bỏ chọn", "Nhập lại", "Thử lại", "Về bình thường". |
| 4 | Nhất quán & chuẩn | 5 | Một `:root`, một bộ nút/badge/bảng, nhịp 8px, 1 nút chính/header ở mọi màn. |
| 5 | Ngăn lỗi | 5 | Validate form, cảnh báo slug, xác nhận mạnh có gõ, xóa 2 lần, gated Sửa bộ. |
| 6 | Nhận diện thay vì nhớ | 5 | Gợi ý tìm + Ctrl+K, eyebrow nhóm, tooltip, nhãn mono rõ trên điều khiển. |
| 7 | Linh hoạt & hiệu quả | 4 | Hash route, lọc/sắp xếp/phân trang, thao tác hàng loạt, phím tắt bảng lệnh. |
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

1. Chưa phỏng vấn chủ site / biên tập viên thật: 5 điểm đau vẫn là **GIẢ THUYẾT**.
2. Chưa có dữ liệu KV thật; skeleton là tĩnh, chưa mô phỏng độ trễ mạng theo thời gian thực.
3. Chưa chạy trình đọc màn hình thật (NVDA / VoiceOver); mới kiểm tra cấu trúc ARIA bằng tay.
4. Bảng 10.000+ bản ghi chưa đo hiệu năng; phân trang mới có 18 bộ mẫu.
5. Màu hồng là **giá trị tạm**, cần thử lại với bìa thật (hiện là ô màu CSS) trước khi chốt token.
6. Chênh lệch "14 tab / 15 tab" cần owner xác nhận; mockup chọn không bớt chức năng.
7. Ở 360px bảng vẫn phải cuộn ngang trong vùng bảng; chưa thử ngón tay cái trên thiết bị thật.
8. Import `.docx`/`.html` mới mô phỏng bằng tên file, chưa parse nội dung (đúng tinh thần mockup, không code production).

---

## 4 · ĐỀ XUẤT THÊM (không nằm trong mockup)

- Phỏng vấn 3 biên tập viên + quan sát 2 ca duyệt để kiểm chứng 5 giả thuyết ở Phase 1.
- Lịch sử phiên bản / undo cho metadata và chương (ngoài danh sách chức năng hiện có).
- Phân quyền phía server thay vì chỉ ở UI như mã nguồn hiện tại.
- Cảnh báo quota chủ động trước khi chạm 80% và báo cáo ghi theo ngày.
- Xuất nhật ký ra CSV để đối soát định kỳ; shortcut duyệt nhanh cho kiểm duyệt viên.
- Đo hiệu năng bảng lớn, thử 360px trên thiết bị thật và kiểm tra công nghệ hỗ trợ trước khi chuyển code production.
- Chốt giá trị `--acc` sau khi thử trên bìa thật và trên màn hình hiệu chuẩn thấp.

> Các mục trên **không** được dựng trong HTML, đúng yêu cầu "đề xuất ngoài phạm vi ghi riêng".

## 5 · CẬP NHẬT SAU VÒNG RÀ SOÁT THỨ 2

- Thêm `eyebrow` dùng chung; màn đăng nhập cũng có eyebrow + h2 + mô tả ngắn như 15 tab, và eyebrow mọi trang đều ghi rõ **DỮ LIỆU MẪU**.
- Trạng thái đang tải của màn đăng nhập nay có nhãn `ĐANG TẢI` + skeleton, thống nhất với 15 tab.
- Sửa khung 360px: cụm nút trên thanh trên được phép xuống dòng, chip kết nối và pill quota gọn còn tối đa 132px; áp dụng cả cho công tắc "Giả lập khung 360px" trên desktop.
- Dọn bản `renderDemo()` trùng tên không còn dùng; giữ một nguồn duy nhất cho bảng điều khiển demo.
- Kiểm chứng lại: **142/142 kiểm tra tự động đạt, 0 lỗi JS** trên 16 route × 4 trạng thái, 15 lần bấm nav, 16 hành động chính, 5 chip kết nối, 4 mức quota, 3 biến thể khung, `Ctrl+K`, modal tài liệu, xác nhận mạnh và đăng nhập.

