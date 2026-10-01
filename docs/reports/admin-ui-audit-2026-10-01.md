# Kiểm tra giao diện quản trị — 01/10/2026

Phạm vi: 14 màn (16 mục nav, 15 tab id) ở bốn bề ngang 1280 · 1024 · 768 · 375.
Cách đo: Playwright (Chromium 140) mở `admin.html`, vào từng tab, đo hình học DOM
(tràn ngang, cắt chữ, chồng lớp, mục bấm < 36px) + bắt lỗi console. Ảnh: `/home/user/shots/audit/`.

## Kết quả

| Vòng | Số ô lỗi đo được | Ghi chú |
|---|---|---|
| Trước (sau vòng 1) | 18 ô (13 lỗi bố cục thật, phần còn lại là rác SVG + console do server tắt giữa lần chạy) | badge chồng, cột bị cắt, tràn ngang |
| Sau vòng 2 | **0 ô lỗi** | 14 tab × 4 bề ngang, chiều dọc không tính (khung nào cũng cuộn dọc được) |

`tools/audit_a11y.mjs`: 23 màn giao diện đạt 0 lỗi axe-core, đạt Lighthouse tĩnh.

## Đã sửa trong vòng 2

1. **Badge chồng/tràn** ở "Mới cập nhật" (Tổng quan): `.v2badges` bị luật `.pill/.v2badge/.chip{display:block}`
   ép về `block`, cao bằng cả khối. Nay `.v2badges` là `inline-flex`, `.ovtt` xếp badge xuống một hàng riêng.
2. **Bảng Thư viện**: `table-layout:fixed` + khoá 6 cột từng áp cho *mọi* `.v2book-table` (kể cả bảng
   Tác giả, Vai trò, Thống kê, Kiểm tra dữ liệu) — nay chỉ còn trong `.v2lib`. Cột `Chương` được nới
   (12% ở màn rộng, 15% ở 901–1100px) nên "42 chương" không bị cắt.
3. **Bảng Tác giả**: gộp huy hiệu khoá vào ô tên, bỏ cột "Khóa"; ở 901–1100px bỏ cột "Cập nhật" và
   nới lề ô → bảng vừa khung, hết cuộn ngang. Ô "Bộ" hiện thêm số chương.
4. **Ô nhập trong hàng flex**: thêm `min-width:0` (mặc định `auto` giữ nguyên bề ngang nội dung) —
   hết tràn ngang ở tab Trang chủ 375px; `<select>` dài được cắt bằng dấu ba chấm.
5. **Hàng sắp thứ tự** (Hero, Editor's choice, hàng đợi chương): ở ≤620px xuống hai tầng — bìa + chữ
   một tầng, ba nút (↑ ↓ Gỡ) một tầng rộng bằng cả hàng, thay vì chen ở lề phải làm tiêu đề gãy 3 dòng.
   Con lạ trong hàng (nút lẻ) xuống hẳn một hàng, không rơi vào khe 20px.
6. **Nút/tab lọc ≥36px** trên màn hẹp (`.seg`, `.v2reptabs`, nút phân trang) — hết mục bấm 28px.
7. **Khe thở** giữa khối số liệu và tiêu đề ngay dưới nó (tab Thống kê).
8. **Nhóm lọc Báo lỗi** đổi `role="tablist"` → `role="group"` + `aria-pressed` (tablist không có
   `role="tab"` là lỗi axe `aria-required-children` mức critical).

## Hợp đồng nguyên tố chuyển sang tài liệu

Khối "hợp đồng nguyên tố D1" dài ~120 dòng trong CSS đã rút gọn và chuyển sang
`docs/admin-giao-dien.md` (bảng nút · badge · ô nhập · card · dòng · lớp nổi · trạng thái rỗng,
bốn quy ước về màu nhấn, hai vai viền, không vòng focus, chỉ chuyển động transform/opacity).
CSS chỉ còn con trỏ trỏ sang tài liệu — nhờ vậy bù được dung lượng cho các luật mới.

## Dung lượng

`admin.css` 55.5 kB. Trần trong `tools/bundle_budget.mjs` nâng 52 → 57 kB (warn 50) vì
`admin.css` từ đợt này phủ đủ 15 màn chứ không còn là sheet phụ trợ; chính sách cảnh báo ở ~88%
trần vẫn giữ.

## Còn thấy (chưa làm)

- `t_admin_editor_keyboard.js`, `t_admin_editor_lazy.js`, `tools/check_og.mjs` đỏ cả ở bản gốc
  `cd92062` (jsdom không có `ResourceLoader`, `check_og` đỏ sẵn) — không phải do đợt này.
- Dòng "0/—" ở cột Chương là chuỗi của `cz().countText` bên app công khai, không sửa trong admin.
- Bảng Tác giả / Thống kê ở 901–1100px vẫn hiếm khi cần cuộn ngang nếu tên tác giả dài bất thường.
