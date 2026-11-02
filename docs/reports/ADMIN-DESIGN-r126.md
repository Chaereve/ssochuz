# Admin r126 — “Bàn biên tập”

Bản làm lại toàn bộ giao diện quản trị (tháng 11/2026). Thay cho giao diện nền tối
r123c. Tài liệu này là nguồn tham chiếu khi thêm màn hình mới: dùng đúng token,
đúng cỡ chữ, đúng nhịp khoảng cách thì không cần nghĩ lại từ đầu.

## 1. Vì sao đổi

Người dùng phản hồi hai lần liên tiếp: giao diện cũ “trông như trang web gắn thêm
bảng” chứ không ra công cụ quản trị. Nguyên nhân nằm ở khung, không ở màu:

- Sidebar và nội dung cùng một nền tối, không có ranh giới giữa “điều hướng” và
  “bàn làm việc”.
- Mỗi khối nội dung lại là một cái hộp có viền, hộp lồng hộp.
- Nhãn in hoa rải chữ xuất hiện ở gần như mọi chỗ, làm mọi thứ có cùng trọng lượng.

Bản này đảo lại: **nền sáng, mặt thẻ trắng, một vạch tóc, thứ bậc bằng chữ và
khoảng thở**. Có tham khảo cách Linear, Notion, shadcn/ui và các CMS xuất bản tổ
chức màn hình: một kết luận cho mỗi màn, bảng dữ liệu là trung tâm, hành động
chính luôn ở cùng một chỗ.

## 2. Token (khối `body.admin` trong `src/admin/styles/admin.css`)

| Nhóm | Token | Giá trị | Dùng cho |
|---|---|---|---|
| Canvas | `--a-bg` | `#f7f5f2` | nền trang, giấy ấm |
| Mặt | `--a-surf` | `#ffffff` | thẻ, bảng, ô nhập |
| Mặt lõm | `--a-surf2` | `#f3f0ec` | hàng hover, thanh công cụ, mặt lõm |
| Mặt lõm hơn | `--a-surf3` | `#e9e4dd` | rãnh tiến độ, nền mục đang chọn |
| Mực | `--a-txt` | `#1a1714` | chữ chính, nút chính |
| Phụ | `--a-mut` | `#54504a` | mô tả, nhãn |
| Mờ | `--a-dim` | `#6e6860` | chú thích nhỏ, slug |
| Nhấn | `--a-acc` | `#b8334f` | liên kết, mục đang chọn, gạch tab |
| Trang trí | `--a-mark` | `#e0859b` | chấm logo, cột biểu đồ, vạch tiến độ |
| Vạch tóc | `--a-bd` / `--a-bd2` | `#e7e2db` / `#d4cdc4` | đường kẻ / viền ô nhập |
| Trạng thái | `--a-ok/warn/bad/info/violet` | xanh/rêu/hổ phách/lam/tím | chỉ dùng cho ngữ nghĩa trạng thái |

Hồng `#e0859b` của trang công khai chỉ còn làm **dấu trang trí** (chấm, cột biểu
đồ, thanh tiến độ) vì độ tương phản của nó trên nền trắng chỉ 2,2:1. Chữ và liên
kết dùng `#b8334f` (6,4:1). Mực `#1a1714` đạt 16,8:1.

## 3. Cỡ chữ và hình khối

- Tiêu đề trang: serif của site (`--font-head`), 31px / 500, chỉ một dòng.
- Tiêu đề thẻ: serif 16px / 600. Không dùng lại đúng chữ của tiêu đề trang.
- Thân: sans 13,5px / 1,55. Nhãn: 12px. Chú thích: 11,5px.
- Số liệu: sans 27px / 600, `font-variant-numeric: tabular-nums`.
- Bo góc theo một gốc `--a-r` = 10px: nút và ô nhập **8px** (gốc − 2), thẻ
  **14px** (gốc + 4), chip trạng thái tròn 999px.
- Một lớp bóng duy nhất `--a-shadow` (1px, 5% mực) cho thẻ; `--a-shadow-lg` chỉ
  cho hộp nổi (gợi ý tìm kiếm, menu tài khoản).

## 4. Khung

```
┌ rail 248px ─────────┬ thanh trên 60px: breadcrumb · tìm kiếm · quota · chuông · tài khoản
│ logo + thu gọn      │
│ [+ Thêm bộ truyện]  │  đầu trang: tiêu đề serif · mô tả · hành động chính
│ nhóm điều hướng     │
│ …                   │  canvas tối đa 1240px, canh giữa, lề 32px
│ chân: kết nối, quota│
└─────────────────────┴──────────────────────────────────────────────────────
```

- **Rail** nền `--a-bg2`, một vạch tóc bên phải. Mục đang chọn là **mặt trắng có
  viền** (không phải dải màu), icon chuyển sang màu nhấn. Số đếm là chữ thường,
  không phải viên thuốc.
- **Breadcrumb** thay cho nhãn nhóm lặp lại dưới tiêu đề: `Quản trị / Nội dung /
  Thư viện`. Điện thoại chỉ giữ mục cuối.
- **Hành động chính** cùng một vị trí ở mọi màn nhờ `HEAD_ACTIONS` trong
  `Layout.jsx`; rail có thêm nút “Thêm bộ truyện”.
- **Thu gọn** còn rail 76px chỉ icon. Luật ẩn chữ nằm trong `@media(min-width:901px)`
  và **phải** loại trừ `.admin-nav-icon` (xem `tests/t_admin_sidebar.js`).

## 5. Thành phần

| Thành phần | Quy tắc |
|---|---|
| Nút chính | nền mực `--a-txt`, chữ trắng. Không dùng hồng cho khối lớn. |
| Nút phụ | mặt trắng, viền `--a-bd2`, bóng 1px. |
| Nút ghost | không viền, chỉ đổi nền khi hover. |
| Ô nhập | cao 34px, viền `--a-bd2`, focus đổi viền nhấn + vòng 3px `--a-ring`. |
| Chip trạng thái | chữ đậm cùng tông trên nền `color-mix(currentColor 9%, transparent)`. |
| Thẻ | trắng, viền tóc, bo 14px, padding 18/20. **Không lồng thẻ trong thẻ.** |
| Bảng | đầu bảng nền `--a-bg2`, hàng 46px, hover `--a-surf2`, không kẻ dọc. |
| Tab | gạch chân 2px màu nhấn, không viền hộp. |
| Trạng thái rỗng | viền đứt, nền `--a-bg2`, một câu + một hành động. |
| Biểu đồ | cột hồng phấn bo đỉnh, điểm phiếu màu nhấn, nhãn ngày 10px. |

## 6. Những điều không được làm lại

- Không quay lại nền tối cho admin (đã bị từ chối hai lần).
- Không thêm bóng đổ nặng, gradient, quầng sáng — dấu hiệu “giao diện máy sinh”.
- Không đặt hai tiêu đề cùng chữ trên một màn (tiêu đề trang và tiêu đề thẻ).
- Không đổi tên class mà test đang dùng (`docs/reports/ADMIN-CSS-INVENTORY.md`).
- Không sửa tay `admin.css` ở thư mục gốc — luôn `npm run build:admin`.
