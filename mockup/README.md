# Mockup admin · ssochuz library

Thiết kế lại giao diện quản trị. **Chức năng đã có, không thêm sản phẩm mới.** Toàn bộ số liệu, tên truyện và tên người là **DỮ LIỆU MẪU**.

## Mở ngay

**Đã merge vào `main`** qua PR #83 (`fbbe121`), #84 (`59a6167`) và #85 (`565f28c`). Theo yêu cầu owner, **`/admin` là `admin.html` — chính giao diện thiết kế này — và đọc/ghi dữ liệu thật trên Cloudflare KV**. Không còn bản admin thứ hai.

| Cách mở | Địa chỉ |
| --- | --- |
| **Quản trị thật (mặc định)** | `https://ssochuz.pages.dev/admin` → `admin.html` (sinh từ mockup + `admin-real.js`) |
| Alias cũ gộp về một admin | `/admin-v2`, `/admin-legacy` → `/admin` |
| Bản thiết kế offline (DỮ LIỆU MẪU) | `/admin-mockup`, `/mockup/ssochuz-admin-mockup.html` |
| Trên GitHub `main` | `https://github.com/Chaereve/ssochuz/blob/main/mockup/ssochuz-admin-mockup.html` |
| Không cần mạng | Double-click `ssochuz-admin-mockup.html` — file tự chứa, không cần server, không cần build |

⚠️ **Hai chế độ, một thiết kế:**

- `admin.html` (tại `/admin`) nạp thêm `admin-real.js` → gọi Worker bằng `x-admin-key`, đổ registry / bình luận / báo lỗi / phiếu / thống kê / nhật ký / quota KV thật vào 13 tab và **ghi thật** (thêm bộ, sửa slug, lưu chương, xoá, xử lý báo lỗi, homepage CMS, backup…). URL Worker lưu ở `localStorage`, `ADMIN_KEY` chỉ ở `sessionStorage` và bị xoá khỏi state ngay sau khi nối. Không có key thì nạp `/data/registry.json` ở chế độ **chỉ đọc**.
- `ssochuz-admin-mockup.html` (double-click hoặc `/admin-mockup`) vẫn là **DỮ LIỆU MẪU**, không gọi Worker/KV/Supabase; dùng để xem thiết kế khi offline.

Sửa thiết kế thì sửa `mockup/ssochuz-admin-mockup.html`, sửa lớp dữ liệu thì sửa `admin-real.js` ở thư mục gốc, rồi chạy `npm run build` (`tools/build_admin_html.mjs` sinh lại `admin.html`; `?v=` là sha1 nội dung `admin-real.js`). URL Worker phải là `https://` và nằm trong `connect-src` của CSP hiện hành (mặc định `https://*.workers.dev`). Nếu đăng nhập bằng Supabase/Google, thêm `https://ssochuz.pages.dev/admin` vào **Redirect URLs** trong Supabase (OAuth dùng `location.pathname` làm `redirectTo`).

Google Fonts là tài nguyên ngoài duy nhất; nếu offline thì dùng fallback hệ thống, vẫn đọc được. Bấm **Tài liệu bàn giao** trong sidebar (hoặc nút docs) để xem đủ 10 vòng, trong đó có mục 11 về kiểm chéo bảo mật/kết nối và vòng 10 về nối dữ liệu thật.

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
| Không thêm/bớt chức năng | `TAI-LIEU-BAN-GIAO.md` → ma trận 13 tab + nhật ký quyết định #1, #2, #20–#24, #28–#33. |
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

**Mới ở vòng 6:** bỏ nút `Danh sách` trong trình soạn · thêm `Chèn dấu ngăn cách` (`•••` tại con trỏ) · đổi case chỉ tác động **Tên chương** · canh thẳng cột badge/nút (sửa luôn cấu trúc card Báo lỗi và lưới 2 cột). Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 9.

**Mới ở vòng 7:** dọn ghi chú — bỏ hẳn ghi chú thiết kế/chú thích lặp, giữ chỉ các dòng an toàn (gõ slug/cụm), phạm vi case, 1 dòng phím tắt và trạng thái KV; footer mỗi màn còn đúng một dòng `DỮ LIỆU MẪU`. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 10.

**Mới ở vòng 8 (kiểm chéo):** rà `src/admin/api.js`, `worker/overflow.js`, `community-worker/`, `supabase/` và đối chiếu 7 lớp dữ liệu (KV, Worker, Supabase/R2, Blogger, community-worker, dữ liệu tĩnh, Supabase Auth). Sửa 4 điểm: lọc HTML chương trước khi `render()` + chèn text thường ở sự kiện `paste` (chặn self-XSS khi dán vào `contenteditable`), khoá migration ở mọi trạng thái chưa `online`, xoá `ADMIN_KEY` khỏi state sau kết nối/reset, thêm fallback `CONN`/`QUOTA`. Thêm 51 kiểm tra mới (điều khiển chết, id trùng, chèn HTML, nhãn kết nối). Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 11.

**Vòng 9:** đưa bản thiết kế lên `/admin` dạng prototype, có bản sao tạm của admin cũ để không mất chức năng ghi KV. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 12.

**Vòng 10 (theo yêu cầu owner):** gỡ hoàn toàn bản sao tạm. `admin.html` trở thành giao diện quản trị duy nhất, được sinh từ mockup và nạp `admin-real.js` để đọc/ghi Cloudflare KV thật; mọi luật rewrite, header, link sidebar và kỳ vọng test về bản sao cũ đều bị xoá. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 13.
