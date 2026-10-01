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

## Bộ kiểm thử (chạy chốt trên bản đã dựng)

`node tests/run.js`: **65 bài đạt, 3 bài đỏ** — cả ba đỏ đều có sẵn ở bản gốc
`cd92062` (đã kiểm lại bằng worktree sạch): `tools/check_og.mjs`,
`t_admin_editor_lazy.js` (jsdom không có `ResourceLoader`), `t_admin_editor_keyboard.js`
(4/4 lần đỏ ở cả hai bản, lỗi mô phỏng bàn phím trong jsdom).
`tools/audit_a11y.mjs`: 23 màn, 0 lỗi axe-core.

## Còn thấy (chưa làm)

- `t_admin_editor_keyboard.js`, `t_admin_editor_lazy.js`, `tools/check_og.mjs` đỏ cả ở bản gốc
  `cd92062` (jsdom không có `ResourceLoader`, `check_og` đỏ sẵn) — không phải do đợt này.
- Dòng "0/—" ở cột Chương là chuỗi của `cz().countText` bên app công khai, không sửa trong admin.
- Bảng Tác giả / Thống kê ở 901–1100px vẫn hiếm khi cần cuộn ngang nếu tên tác giả dài bất thường.

---

# Vòng 3 — cấu trúc lại nội dung các màn còn cứng

Sau vòng 2, danh sách "Còn thấy" còn bốn việc; vòng này làm ba việc đầu.

## Đã làm

1. **Sửa bộ (`edit`) — màn rộng chia hai cột.** Trước đây ở 1920px toàn bộ form
   metadata trải hết bề ngang (ô nhập dài ~1.600px, rất khó đọc). Nay từ 1280px:
   khung rộng tối đa 1.180px, cột metadata bên trái, khối "Khóa mật mã" bên phải;
   vùng soạn chương và "Khu vực nguy hiểm" vẫn chiếm trọn bề ngang. Nút "← Thư viện"
   gộp vào hàng tiêu đề (bớt một hàng trống). Thanh hành động dính đáy đổi sang nền
   đục + đường kẻ trên để chữ không chồng lên vùng chọn ảnh bìa.
2. **Tựa trang Sửa bộ** đổi thành "Sửa bộ" (đúng nhãn điều hướng), tên bộ xuống dòng
   mô tả — trước đây h2 và tiêu đề trong card cùng in một tên bộ hai lần.
3. **Nhật ký** dựng lại: hàng lọc (tìm theo việc/người/kết quả + `Tất cả`/`Có lỗi`
   kèm số), bộ đếm số dòng, và mỗi dòng log có cột giờ riêng; dòng lỗi nhuộm nền nhạt.
   Bỏ tiêu đề "Nhật ký" lặp với đầu trang.
4. **Cài đặt** chia thành bốn mục có tựa + mô tả: *Kết nối & hạn mức* ·
   *Sao lưu & khôi phục* · *Nhập & đồng bộ Blogger* · *Overflow KV & bảo trì*.
   Bỏ khối `savebar` cuối trang (đã có thanh hành động trong mục), thẻ không còn bị
   kéo cao bằng nhau.
5. **Thư viện** nhớ chế độ Bảng/Lưới giữa các lần mở (`localStorage`).
6. **Bớt thanh thông báo trùng**: màn hình vẫn có thanh "Chế độ dữ liệu tĩnh" của
   Layout, nên bỏ notice cùng nội dung ở `main.jsx`; thanh của Layout nay nói luôn
   "chỉ ghi khi nối Worker bằng ADMIN_KEY".
7. **Bảng Tác giả 901–1100px, breadcrumb trên màn hẹp**: mục bấm dưới 32px đã nâng
   lên 32px (đường dẫn "Thư viện › Sửa bộ" bấm được bằng ngón tay).

## Kết quả đo

- 15 tab × 5 bề ngang (1920 · 1280 · 1024 · 768 · 375) = 75 ảnh: **0 ô lỗi**.
  (Vòng này bổ sung màn `edit` vào bộ quét — trước đó chỉ có 14 tab.)
- `tools/audit_a11y.mjs`: 23 màn, 0 lỗi axe-core.
- `node tests/run.js`: 65 bài đạt, 3 bài đỏ — vẫn đúng ba bài đỏ có sẵn từ bản gốc
  (`check_og`, `t_admin_editor_lazy`, `t_admin_editor_keyboard`); không phát sinh bài mới.
- `admin.css` 56.0 kB (98% trần 57 kB) — phần thêm được bù bằng cách gỡ luật chết
  (`.v2table-wrap`, `.savebar`, sáu tông `.tone-*` không ai dùng) và rút gọn chú thích.

## Còn thấy (sau vòng 3)

- `t_admin_editor_keyboard.js`, `t_admin_editor_lazy.js`, `tools/check_og.mjs` vẫn đỏ
  ở cả bản gốc (môi trường jsdom / OG build có sẵn) — không do các đợt này.
- Chưa có bảng chọn nhiều dòng ở chế độ Lưới (chọn nhiều chỉ có ở chế độ Bảng).
- Trần `admin.css` 57 kB đã dùng 98%: lần thêm luật tiếp theo nên đi kèm việc gỡ luật cũ.
