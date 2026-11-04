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

**Nếu báo "Không nối được Worker":** kiểm tra URL có `https://` và đúng domain Worker, `ADMIN_KEY` đúng, và Worker có `ALLOW_ORIGIN` chứa origin của trang. Lớp `admin-real.js` chỉ gửi đúng 4 header mà `worker/cms.js` cho phép trong preflight CORS (`content-type`, `x-admin-key`, `x-import-mode`, `authorization`) — đừng thêm header tuỳ tiện, vì trình duyệt sẽ gửi `OPTIONS` và bị từ chối trước cả `/api/health`. Mở tab Network/Console để thấy lý do cụ thể.

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

**Vòng 11 (sửa giao diện theo 3 ảnh owner gửi):** rail sidebar thu gọn giờ có **đúng một icon ở đầu** và 13 icon nav canh cùng một trục — bỏ `margin-left:auto` inline, ẩn chấm thương hiệu/logo, ẩn thanh cuộn Windows đang làm icon lệch trái ~7,5px. Bản phát hành cắt đuôi `· KV` dính vào slug/eyebrow, dùng giờ thật thay `03/11 20:40`, đổi placeholder "mẫu", và tính số liệu Thống kê / Kiểm tra dữ liệu từ KV thay vì hằng số mockup. Riêng bản prototype tĩnh vẫn giữ MẪU. Bài kiểm `tests/t_admin_rail.js` (54 kiểm) khoá cả trục icon lẫn nhãn; chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 14.

**Vòng 10 (theo yêu cầu owner):** gỡ hoàn toàn bản sao tạm. `admin.html` trở thành giao diện quản trị duy nhất, được sinh từ mockup và nạp `admin-real.js` để đọc/ghi Cloudflare KV thật; mọi luật rewrite, header, link sidebar và kỳ vọng test về bản sao cũ đều bị xoá. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 13.

**Vòng 12 (rà kĩ toàn bộ admin, gỡ sạch dấu vết mockup):** owner báo "chỉ mới khắc phục đc sidebar à … sao vẫn còn vài chỗ tạo lúc demo mockup z????". Bản phát hành `admin.html` giờ **không còn** bảng điều khiển demo (nút tròn + aside + 2 chip topbar đổi giả trạng thái/quota), **không còn** 13 mảng `SAMPLE_*` (18 "Truyện mẫu", 248 book, 6.420 chương, 18.400 lượt đọc lộ ra khi chưa cấu hình Worker), **không còn** số cứng 3 báo lỗi / 2 spam / 5 khoá, "Supabase: unavailable", ngày `03/11 20:40`, placeholder/aria-label "mẫu", toast "mô phỏng" hay lời dẫn "Dùng bảng điều khiển demo → Đặt lại". Mọi số liệu tính từ KV; `clearPrototypeSeed()` chạy trước render đầu tiên; `editBookHTML()` có guard khi KV rỗng. Toàn bộ khác biệt prototype → bản phát hành nằm trong `tools/admin_prod_replacements.json` (94 mục ở vòng 12 · 128 mục sau vòng 13 · 141 mục ở vòng 14 · 145 mục sau vòng 15, generator **fail-fast** nếu mockup đổi làm sót chỗ nào). Bài kiểm `tests/t_admin_no_demo.js` (96 kiểm) quét 13 tab × 3 trạng thái × 5 mode đăng nhập ở **cả hai** chế độ (chưa cấu hình / online 67 bộ KV), 0 lỗi JS. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 15. Riêng bản prototype tĩnh và modal tài liệu lịch sử vẫn giữ MẪU có chủ đích.

**Vòng 13 (chip KV gọn, icon thẳng trục, quota lấy số thật):** owner gửi ảnh `● Cloudflare KV · Online` + `KV 120/1000` và hỏi sao chưa sửa gì mà vẫn hiện. **Online là thật** (`/api/whoami` → `setConn('online')`), còn **120/1000 là hằng cứng của prototype** (`QUOTA.ok.txt`) bị sót từ vòng 12; `WRITES` lấy từ `/api/admin/kv` trước đó chỉ dùng để chọn màu. Giờ gộp thành **1 chip** `#czKvChip`: online hiện `writesToday/1000`, chưa nối hiện `Đang nối` / `Chỉ đọc`, banner quota và dòng Quota ghi KV trên Dashboard cùng đọc `state.kvWrites` do `admin-real.js` đẩy xuống trước mọi render. Chấm icon 6px canh `align-self:center` cùng trục với chữ, bỏ `letter-spacing` và giới hạn 132px gây cắt `…`. Các nhãn cổng đăng nhập / trạng thái / placeholder / mô tả tab được rút gọn; **không đụng văn bản chương thật trong KV** hay lịch sử MẪU trong tài liệu. Bài kiểm `tests/t_admin_kv_chip.js` (121 kiểm) khoá online 137, quota cao 850, chưa cấu hình và parse-time. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 16.

**Vòng 14 (rà toàn bộ admin, sửa Homepage CMS, hết cụt dữ liệu truyện):** owner báo "có lỗi ở trang chỉnh homepage, dữ liệu truyện bị thiếu tùm lum". **Lỗi** là nút **Lưu trang chủ** chặn cứng "Cần ít nhất 1 slide" dù `registry.slides=[]` là hợp lệ (web tự lấy 5 bộ mới nhất) → bỏ chặn. **Thiếu tùm lum** là do mọi ô chọn bộ (slide, lịch, Sửa bộ, Chương, Bình luận, Cài đặt) chỉ lấy 6–8 bộ đầu của 67 bộ ⇒ 6 dòng lịch đều nhảy về `HOMETOWN ROMANCE - SPECIAL`; Series hiện 6 checkbox, tick 3 bộ đầu thay vì 12 `editorChoice` thật và không ghi ra KV; công tắc banner luôn tắt, ô thông báo luôn rỗng, ô ghi chú lịch nhầm nội dung banner; `loadVoters()` chỉ hỏi 5 bộ. Giờ dùng `bookOptions()` duyệt toàn bộ registry (sắp A–Z, giữ slug lạ), Series liệt kê 67 bộ và ghi đồng bộ `editorChoice`/`settings.editorChoice`, banner/ghi chú đọc đúng `announcement`/`schedule.note`, Thư viện 20 bộ/trang, ảnh bìa thật có fallback khi URL hỏng. Bài kiểm `tests/t_admin_full_data.js` (140 kiểm) bấm **Lưu trang chủ** thật rồi soi body `PUT /api/registry`. Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 17.

**Vòng 15 (Chuyển thể Series gọn lại, chọn không giới hạn, có trang riêng):** owner muốn card Homepage CMS **hiển thị tối đa 12 bộ** nhưng **số lượng được chọn nhiều hơn 12**, kèm nút **Xem thêm** mở **1 trang toàn những bộ chuyển thể**. Card giờ có tối đa 12 checkbox (ưu tiên bộ đã chọn) + bộ đếm tổng và dòng `… và N bộ nữa`; bỏ hoàn toàn trần 12 ở `hydrate()` / `currentRegistryFromState()` / listener `change`, nên `editorChoice` lẫn `settings.editorChoice` ghi nguyên vẹn 13, 20 hay 67 slug. Nút mở overlay `#seriesPage` toàn màn hình (vẫn 13 tab / 5 nhóm, không thêm route): tiêu đề riêng, ô tìm tên/tác giả/slug, lưới **67 bộ có ảnh bìa thật**, `Chọn tất cả` / `Bỏ chọn tất cả`, 3 bộ đếm đồng bộ, **`Lưu lựa chọn lên KV`** gọi thẳng `realSaveHomepage()`, đóng bằng Quay lại / Đóng / Esc. Giữ nguyên mọi fix vòng 14. Bài kiểm `tests/t_admin_series_page.js` (95 kiểm) và `tests/t_admin_full_data.js` (144 kiểm). Chi tiết ở `TAI-LIEU-BAN-GIAO.md` → mục 18.
