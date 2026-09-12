# Rà soát & fix theme chuseoz — 2026-09-12

File trong thư mục này:

| File | Nội dung |
|---|---|
| `chuseoz-theme.xml` | Theme Blogger **đã fix** (327 KB) — bản để upload lại lên Blogger |
| `BAO-CAO-RO-SOAT.md` | Báo cáo này |

File gốc bạn gửi qua filebin vẫn còn nguyên ở `/home/user/_work/chuseoz-theme.goc.xml` (ngoài repo, chỉ để đối chiếu).

---

## 1. Cách rà soát

1. **So với bản build mới nhất của cùng theme**: `index.html` + `reader.html` (bản Cloudflare Pages trong repo này) sinh ra từ cùng bộ CSS/JS. Bất cứ fix nào có ở bản Cloudflare mà XML không có ⇒ XML bị cũ.
2. **Chạy thật bằng DOM ảo (jsdom)**: dựng lại trang chủ và trang đọc từ chính XML, nạp dữ liệu thật (39 chương Lunar Secret lấy từ post thật của blog) rồi bấm thử toàn bộ luồng: hero, lọc, tìm kiếm, sắp xếp, phân trang, mở trang truyện, danh sách chương, ngăn kéo, cài đặt đọc, bàn phím, tiến độ đọc.
3. **Kiểm tra 62 URL trong registry** (chạy trên GitHub Actions): 57 URL dạng `/2026/xx/...` trả 200 và có chương thật; 5 URL bị Blogger trả **429** do quét quá nhanh (không phải link chết); 17 URL dạng `/p/...` là trang tĩnh, không có chương.

## 2. Những chỗ đã fix

### A. Giao diện — XML thiếu 4 fix mới nhất đã có trong bản Cloudflare

| # | Thiếu gì | Hậu quả trước khi fix |
|---|---|---|
| 1 | `.crumb` + `.crumb svg` + `.crumb b` | Breadcrumb ở trang truyện và trang đọc bị trôi chữ 15px, icon không canh hàng, không có dấu cách đều — nhìn lệch hẳn thiết kế |
| 2 | `#footer{display:none !important}` | Footer Blogger (dòng "Powered by Blogger" + Copyright) vẫn hiện dưới đáy trang, trong khi bản mới đã ẩn |
| 3 | `overscroll-behavior:contain` + `body:has(.drawer.on){overflow:hidden}` | Trên mobile, kéo hết danh sách chương trong ngăn kéo thì trang phía sau bị cuộn theo; mở ngăn kéo vẫn cuộn được nền |
| 4 | `@keyframes vzIn` + 2 rule animation + `prefers-reduced-motion` | Chuyển giữa thư viện ↔ trang truyện bị "giật", không có hiệu ứng vào; người bật giảm chuyển động vẫn bị animate |

### B. Tính năng — phân trang danh sách chương bị hỏng

`renderPager()` cũ chỉ biết dùng `state.page` (trang của **thư viện**), nên nút số trang ở khối **Danh sách chương**:

* bấm vào **không đổi trang chương nào cả** (chỉ số trang nhảy 1 → 2 rồi đứng yên);
* âm thầm đổi `state.page` của thư viện ⇒ quay về thư viện (hoặc bấm lọc/sắp xếp) là bị nhảy sang trang khác.

Đã port đúng bản mới: `renderPager(total, el, onGo, acc)` với state riêng cho từng pager (`chPage` cho chương, `state.page` cho thư viện).

### C. Dữ liệu — `postId` bị hỏng ở 45 bộ truyện

Trong registry nhúng trong theme, 49 giá trị (mỗi block 49, tổng 98 chỗ) có dạng:

```
"postId":"1385632627804159653'}"     ← sai: dính thêm  '} 
"postId":"1385632627804159653"       ← đúng (đã fix)
```

Đây là lỗi sinh dữ liệu (script trích nhầm đoạn cuối). Hậu quả: trang truyện **không đọc được tiến độ đã lưu** vì trang đọc lưu theo `chuseoz-prog-<post id sạch>` còn thư viện lại tra `chuseoz-prog-<postId hỏng>` ⇒ luôn rơi về fallback (lấy số chương đầu của `countLabel`), nên bộ 39 chương hiện "đang đọc chương 39" và 38 chương bị tô "đã đọc" dù người đọc mới mở chương 1.

### D. Đồng bộ mốc "đang đọc tới đâu"

* `nowChapter()` giờ tra **cả** khoá theo `postId` **và** theo `slug` (bản Cloudflare lưu theo slug, bản Blogger lưu theo post id — nhờ vậy cả hai đều khớp).
* Nút **"Đọc chương N"** lấy số từ `nowChapter()` thay vì `countLabel`. Trước đây lưới chương có thể đánh dấu "Bạn đang đọc tới đây" ở chương 12 mà nút lại ghi "Đọc chương 39" — giờ hai chỗ luôn khớp.
* Nhãn `#dChcount` đổi "9/45 · bản xem trước minh hoạ 45 chương" → "9/45 · 45 chương" cho khớp bản mới.

## 3. Kiểm chứng sau khi fix

* XML hợp lệ (parse OK), 2 block registry vẫn là JSON hợp lệ (62 bộ / 31 series / 5 slide), `postId` lỗi còn lại = 0.
* jsdom, trang chủ: bấm trang 2 của danh sách chương → **lưới chương đổi** (`changed: true`), pager thư viện vẫn ở trang 1/6.
* jsdom, có tiến độ đã lưu (chương 20): `Đọc chương 20`, lưới chương đánh dấu `now` đúng chương 20 và 7 chương trước đó là "đã đọc".
* jsdom, trang đọc: 39 chương nạp đúng từ post thật, chuyển chương, ngăn kéo, cài đặt đọc, phân trang kiểu sách, đánh dấu/thích/lưu/chia sẻ/báo lỗi đều chạy, **0 lỗi JS**.

## 4. Còn tồn (chưa đụng tới — chờ bạn quyết)

1. **17 bộ chưa có post riêng** (My Boss, Beside the Dragon, My Wife…): registry trỏ vào trang `/p/<slug>.html`, mà trong theme mới các trang đó chỉ hiện "Trang này thuộc giao diện cũ…" ⇒ bấm "Đọc chương" là đi vào ngõ cụt. Nên hoặc là đăng post chương cho các bộ đó, hoặc khoá nút "Đọc chương" khi bộ chưa có chương (`postId` rỗng).
2. **Menu header**: chỉ `Movie` và `Series` có tác dụng (nhảy tới khối Phân cấp chuyển thể); `Thư viện`, `BXH`, `Lịch ra chương` là thẻ `<a>` không có `href` nên bấm không làm gì, dưới 900px thì cả menu bị ẩn.
3. **`data/registry.json` của bản Cloudflare cũng dính lỗi `postId` `'}`** (49 chỗ) và bản Cloudflare lưu tiến độ theo *slug* ⇒ nên sửa ở script sinh dữ liệu (bỏ mọi ký tự không phải số khi trích post id) rồi build lại cả 2 bên.
4. **Widget ẩn còn sót trong theme**: `HTML1` / `HTML2` ("Truyện mới update" với link giả `LINK_BÀI_VIẾT_1`, JS phân trang demo) — đang để `visible='false'` nên không hiện, nhưng có thể xoá cho nhẹ file.
5. **Nhớ port 2 fix ở mục D** ngược lại vào `index.html` / `reader.html` (hoặc vào template nguồn) để hai bản không lệch nhau lần nữa; tốt nhất là build XML bằng `build_theme` thay vì sửa tay.

## 5. Cách upload lại lên Blogger

1. Blogger → **Chủ đề (Theme)** → ⋮ (cạnh "Tùy chỉnh") → **Sao lưu (Backup)** — lưu bản đang chạy để có đường lùi.
2. Cùng menu ⋮ → **Khôi phục (Restore)** → **Tải lên (Upload)** → chọn `chuseoz-theme.xml` trong thư mục này.
3. Mở trang chủ + một trang đọc để kiểm tra: breadcrumb nhỏ đúng cỡ, hết footer Blogger ở đáy, bấm trang 2 ở "Danh sách chương" phải đổi danh sách, mở ngăn kéo không cuộn được nền.
