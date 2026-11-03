# Mockup admin · ssochuz library

Thiết kế lại giao diện quản trị. **Chức năng đã có, không thêm sản phẩm mới.** Toàn bộ số liệu, tên truyện và tên người là **DỮ LIỆU MẪU**.

## Mở ngay

Double-click `ssochuz-admin-mockup.html` (file tự chứa, không cần server, không cần build). Google Fonts là tài nguyên ngoài duy nhất; nếu offline thì dùng fallback hệ thống, vẫn đọc được.

## Các file

| File | Vai trò |
| --- | --- |
| `PHASE-1-NGHIEN-CUU.md` | Nghiên cứu ≤ 400 từ (trình bày trước khi thiết kế). |
| `ssochuz-admin-mockup.html` | **MỘT file HTML duy nhất**: đăng nhập + 13 tab, 4 trạng thái/màn, biến thể khung, tài liệu bàn giao nhúng. |
| `TAI-LIEU-BAN-GIAO.md` | Phase 2 (token, component), nhật ký quyết định, Phase 4, đề xuất thêm. |
| `README.md` | File này. |

## Bảng điều khiển demo (góc dưới phải)

Bấm **nút bánh răng tròn góc dưới phải** để mở. Trong đó:

- **Trạng thái màn hiện tại**: Bình thường / Rỗng / Đang tải (skeleton) / Lỗi — lưu riêng theo từng tab.
- **Chip kết nối**: đang kiểm tra / Online / sai ADMIN_KEY / lỗi Worker / dữ liệu tĩnh chỉ đọc.
- **Quota KV**: ok / cảnh báo / nguy hiểm / bị chặn (+ banner đỏ khi hết quota ghi).
- **Khung**: sidebar thu gọn · drawer mobile 360px · giả lập khung 360px · modal xác nhận mạnh.
- **Thư viện component**: nút, input, select, checkbox, switch, tab, bảng, badge đủ tone, tag chip, skeleton, empty state, banner, tooltip, pagination, toast.
- **Đặt lại demo**: nạp lại toàn bộ dữ liệu mẫu và trạng thái.

Phím tắt: `Ctrl+K` bảng lệnh (↑/↓/Enter/Esc) · `Ctrl/Cmd+S` lưu chương / metadata / tạo bộ · `Ctrl/Cmd+Alt+N` thêm chương (`Ctrl+N` thường bị Chrome/Edge giữ để mở cửa sổ mới) · `Esc` đóng modal / palette / drawer.

## Đối chiếu tiêu chí nghiệm thu

| Tiêu chí | Nơi kiểm tra |
| --- | --- |
| Đủ tab + màn đăng nhập, tên/thứ tự đúng | Sidebar 5 nhóm / 13 tab; `#/dang-nhap`. Xem ghi chú bên dưới. |
| Không thêm/bớt chức năng | `TAI-LIEU-BAN-GIAO.md` → ma trận 13 tab + nhật ký quyết định #1, #2, #20–#24, #28–#31. |
| Cùng hệ thống thiết kế | `:root` trong HTML; mọi màu là biến; component dùng lại ở mọi màn. |
| Đủ trạng thái rỗng/tải/lỗi + quota/kết nối | Bảng điều khiển demo, đổi được trên từng tab. |
| Tương phản ≥ 4.5:1, bàn phím, 360px | `TAI-LIEU-BAN-GIAO.md` → Phase 4 (mục 3.2 / 3.3 / 3.4). |
| Màu là biến CSS, tên đúng chỉ định | 16 token bắt buộc tại `:root`; 0 literal màu rải rác trong CSS. |
| Gọn, thoáng, nhịp đều | Lưới 8px, bo 6/8/12px, vạch tóc, không bóng/gradient, mỗi header 1 nút chính. |

## Ghi chú

Owner xác nhận tự dịch truyện đã mua và đăng, không có tác giả hay nhân sự khác → **bỏ 2 tab Tác giả, Vai trò** (cả nhóm Người dùng). Mockup còn **13 tab / 5 nhóm**, giữ nguyên tên và thứ tự các nhóm còn lại. Trường "Tác giả gốc" vẫn giữ để ghi tác giả nguyên tác.

Mockup **không** dùng bộ nhớ trình duyệt, không gọi Worker thật, không nhận ADMIN_KEY thật, không dùng ảnh ngoài (bìa là ô màu CSS), không có light mode.

**Mới ở vòng 3:** đổi case (vòng 6 thu hẹp lại, chỉ áp dụng tên chương) · ô tiêu đề chương riêng · sửa badge/scrim/nút demo ở card Mới cập nhật · rút gọn chữ.

**Mới ở vòng 4 (đối chiếu `src/admin/**`):** bỏ field tự bịa (Tags, Số chương, Ngày) · thêm Năm, Hiển thị, 18+, 2 ô mật mã · 4 hàng đợi của BỘ trong tab Chương + đúng 4 trạng thái chương · bỏ nút Duyệt bình luận, thêm Mở lại báo lỗi · đúng cụm xác nhận `XOÁ / ĐẾM LẠI / RESET / GỠ PHIẾU / ĐỒNG BỘ / KHÔI PHỤC` và gõ slug khi xoá bộ · đúng nhãn source ở Dashboard, Thống kê, Kiểm tra dữ liệu, Cài đặt, Homepage CMS · nhật ký chỉ còn `admin-key`. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 7.

**Mới ở vòng 5:** nhiều dòng `+ couple` (Enter thêm, × xoá, gộp bằng dấu phẩy) · card **Lưu trữ tràn** trong Kiểm tra dữ liệu (chuyển book/bìa/ảnh sang Supabase/R2, khoá khi hết quota) · `Ctrl/Cmd+S` và `Ctrl/Cmd+Alt+N`. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 8.

**Mới ở vòng 6:** bỏ nút `Danh sách` trong trình soạn · thêm `Chèn dấu ngăn cách` (`•••` tại con trỏ) · đổi case chỉ tác động **Tên chương** · rút gọn ghi chú trong panel · canh thẳng cột badge/nút (sửa luôn cấu trúc card Báo lỗi và lưới 2 cột). Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 9.
