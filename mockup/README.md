# Mockup admin · ssochuz library

Thiết kế lại giao diện quản trị. **Chức năng đã có, không thêm sản phẩm mới.** Toàn bộ số liệu, tên truyện và tên người là **DỮ LIỆU MẪU**.

## Mở ngay

Double-click `ssochuz-admin-mockup.html` (file tự chứa, không cần server, không cần build). Google Fonts là tài nguyên ngoài duy nhất; nếu offline thì dùng fallback hệ thống, vẫn đọc được.

## Các file

| File | Vai trò |
| --- | --- |
| `PHASE-1-NGHIEN-CUU.md` | Nghiên cứu ≤ 400 từ (trình bày trước khi thiết kế). |
| `ssochuz-admin-mockup.html` | **MỘT file HTML duy nhất**: đăng nhập + 15 tab, 4 trạng thái/màn, biến thể khung, tài liệu bàn giao nhúng. |
| `TAI-LIEU-BAN-GIAO.md` | Phase 2 (token, component), nhật ký quyết định, Phase 4, đề xuất thêm. |
| `README.md` | File này. |

## Bảng điều khiển demo (góc dưới phải)

Bấm **DEMO · TRẠNG THÁI** để mở. Trong đó:

- **Trạng thái màn hiện tại**: Bình thường / Rỗng / Đang tải (skeleton) / Lỗi — lưu riêng theo từng tab.
- **Chip kết nối**: đang kiểm tra / Online / sai ADMIN_KEY / lỗi Worker / dữ liệu tĩnh chỉ đọc.
- **Quota KV**: ok / cảnh báo / nguy hiểm / bị chặn (+ banner đỏ khi hết quota ghi).
- **Khung**: sidebar thu gọn · drawer mobile 360px · giả lập khung 360px · modal xác nhận mạnh.
- **Thư viện component**: nút, input, select, checkbox, switch, tab, bảng, badge đủ tone, tag chip, skeleton, empty state, banner, tooltip, pagination, toast.
- **Đặt lại demo**: nạp lại toàn bộ dữ liệu mẫu và trạng thái.

Phím tắt: `Ctrl+K` mở bảng lệnh (↑/↓/Enter/Esc), `Esc` đóng modal / palette / drawer.

## Đối chiếu tiêu chí nghiệm thu

| Tiêu chí | Nơi kiểm tra |
| --- | --- |
| Đủ tab + màn đăng nhập, tên/thứ tự đúng | Sidebar 6 nhóm; `#/dang-nhap`. Xem ghi chú 14/15 tab bên dưới. |
| Không thêm/bớt chức năng | `TAI-LIEU-BAN-GIAO.md` → ma trận 15 màn + nhật ký quyết định #1, #2. |
| Cùng hệ thống thiết kế | `:root` trong HTML; mọi màu là biến; component dùng lại ở mọi màn. |
| Đủ trạng thái rỗng/tải/lỗi + quota/kết nối | Bảng điều khiển demo, đổi được trên từng tab. |
| Tương phản ≥ 4.5:1, bàn phím, 360px | `TAI-LIEU-BAN-GIAO.md` → Phase 4 (mục 3.2 / 3.3 / 3.4). |
| Màu là biến CSS, tên đúng chỉ định | 16 token bắt buộc tại `:root`; 0 literal màu rải rác trong CSS. |
| Gọn, thoáng, nhịp đều | Lưới 8px, bo 6/8/12px, vạch tóc, không bóng/gradient, mỗi header 1 nút chính. |

## Ghi chú

Đề bài ghi "14 tab" nhưng liệt kê 15 tên; `src/admin/components/Layout.jsx` và `docs/product-surface-map.md` của repo cũng có 15. Mockup dựng **đủ 15** (giữ nguyên 6 nhóm, tên, thứ tự) để không bớt chức năng "Thư viện". Đây là điểm cần owner xác nhận, đã ghi rõ trong "Vấn đề còn tồn tại".

Mockup **không** dùng bộ nhớ trình duyệt, không gọi Worker thật, không nhận ADMIN_KEY thật, không dùng ảnh ngoài (bìa là ô màu CSS), không có light mode.
