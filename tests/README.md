# Kiểm thử giao diện (jsdom)

Bộ này chạy **trên máy**, không ảnh hưởng bản đang chạy thật.

```bash
cd tests && npm i          # cài jsdom (1 lần)
node run.js                # chạy hết
```

| Bài | Kiểm cái gì |
|---|---|
| `t_worker.mjs` | **Chạy thật `worker/cms.js`** (KV giả trong RAM, không cần mạng): health khi chưa bind KV **+ hồi quy: health PHẢI kèm header CORS**, khoá quản trị, preflight CORS (`x-admin-key`, `x-import-mode`), registry/book/seed, **sync Blogger bằng đúng file `_inbox/live2/list-novel.html`**, import 1 bài viết thành chương (bỏ quảng cáo/bình luận), **đăng nhập Google với idToken RS256 ký thật** (JWKS dạng `x5c` và dạng `n/e`, sai aud/exp/chữ ký phải chặn), **đăng nhập Supabase với JWT ký thật** (đúng token đổi được session, sai issuer → 401 nêu cả 2 URL, token rác → 401 kèm lý do, **verify lặp lại nhiều lần với cùng kid không được vỡ cache**), bình luận (đăng/đọc/xoá/chặn spam, **Bearer rác → 401 kèm lý do thật**), **đếm lượt đọc + bình chọn trên KV** và `/api/stats`. 100 kiểm tra |
| `check_src.js` | Bản phát hành ở thư mục gốc (đã rút gọn) có **khớp** `src/` không — sửa thẳng tệp ở gốc hoặc quên `npm run build` là bài này báo lỗi |
| `check_secrets.js` | Quét các tệp gửi xuống trình duyệt/Blogger: chặn private key, Supabase `sb_secret_`/`service_role`, secret gán cứng, source map, email thật và danh sách `adminEmails` công khai |
| `check_headers.js` | Soi `_headers` bằng **đúng cách Cloudflare áp luật**: duyệt theo thứ tự trong tệp, `! Tên` xoá header, header trùng tên bị **nối bằng dấu phẩy** (nhiều CSP nối nhau = phải thoả cả hai). Nhờ đó bắt được bẫy: CSP nghiêm của khối `/*` dính vào response của `/sw.js` ⇒ service worker không tải hộ được ảnh bìa ở host ngoài ⇒ **mất bìa khi F5**. Đồng thời kiểm trang vẫn giữ CSP nghiêm, manifest đúng MIME |
| `t_sw_img.js` | **Chạy thật `sw.js`** trong phạm vi giả (self/caches/fetch/`navigator.onLine`), 8 tình huống: SW **tự đọc CSP của chính tệp mình** (header `content-security-policy` của phản hồi `sw.js`) — CSP mở (`connect-src *`) thì phải **tải hộ ảnh bìa + lưu kho `ssochuz-img` + lần sau đọc từ cache**; CSP chặn, chưa đọc được CSP, hay đang offline thì phải **để trình duyệt tự tải** (0 request lỗi, không chặn lại lần sau); bị chặn bất ngờ thì nhường **302** về đúng URL; CDN trả trang HTML 200 thì **không lưu** vào kho ảnh; trang HTML/`/data`/request ghi vẫn đi đúng đường cũ |
| `t_config.js` | `cz-config.js`: URL Worker dán thiếu `https://` hoặc thừa `/` vẫn phải trỏ đúng Worker (thiếu `https://` thì trình duyệt hiểu thành đường dẫn nội bộ → mọi lệnh gọi KV thất bại âm thầm); để trống thì dùng dữ liệu tĩnh |
| `t_html.js` | Soi HTML tĩnh + **`_redirects`**: thuộc tính trùng, `href` nội bộ trỏ tới tệp không có, `data-ic` không có trong bộ icon, và **đích của luật 200 mà là tệp `.html` thì báo vòng lặp ERR_TOO_MANY_REDIRECTS** (Cloudflare Pages tự 308 bỏ đuôi `.html`; lỗi này từng làm chết trang truyện) |
| `t_home.js` | Trang chủ: hero (5 bộ), kệ **Đọc tiếp** (dựng từ tiến độ đọc thật trong máy), **Tủ truyện** (nút lưu trong trang truyện → mục trên trang chủ → bỏ/xoá), thanh thống kê, BXH theo dữ liệu thật, lịch ra chương, tìm kiếm, lọc tab, phân trang, mở trang truyện, **truyện 0 chương phải khoá nút đọc** |
| `t_mobile.js` | **Máy nhỏ + chuyển động**: giả lập `prefers-reduced-motion: reduce` rồi bấm nút menu — menu phải mở ra và có đủ mục (lỗi từng gặp: nhánh giảm chuyển động quên thêm `.slid` nên menu vẫn `display:none`); công tắc sáng/tối đổi đúng **một** nhịp mỗi cú bấm, có nhớ trong `localStorage`, nhãn đọc máy nói đúng trạng thái; soi CSS: `.mnav` mở bằng cả `.slid` lẫn `.on`, shimmer theo mẫu uiverse dùng dải trượt bằng `transform`, icon Tabler được chuẩn hoá và không còn `fill="none"` |
| `t_stats.js` | Số liệu xếp hạng từ **Worker KV**: `/api/stats` → BXH hiện lượt đọc/phiếu thật, có kiểu sắp xếp "Đọc nhiều nhất"; mở chương thì **có gọi `POST /api/view`**, bấm Thích thì **có gọi `POST /api/vote`** và số phiếu trên nút cập nhật theo; kèm đường dự phòng cũ (`CZ_STATS_DIRECT = true` → đọc thẳng Firestore) |
| `t_story.js` | Trang truyện + trang đọc: thông tin truyện, tìm/sắp xếp/nhảy chương, mở chương bằng `#chuong-N` và link cũ `#page-N`, chuyển chương (nút + phím ←/→), lưu tiến độ, tủ truyện, thích, đánh dấu, cài đặt đọc, mục lục, ảnh xem lớn, truyện "Sắp ra mắt" **khoá đọc + không lộ nội dung**, và **mọi dạng đường dẫn** (`/truyen`, `/truyen/<slug>/`, `/reader/<slug>/`, `/truyen.html?slug=…`) đều hiểu đúng tên truyện |
| `t_reader.js` | Thích **theo từng chương**, BXH nhảy số, bình luận/reply trong trang đọc (khách cũng gửi được), icon tủ/thẻ khác nhau, số chương tự sửa; mục **Quản trị chỉ hiện sau khi Worker trả `admin:true`**, không dùng danh sách email ở frontend; báo lỗi mất mạng chỉ cho copy, không nhúng email nhận |
| `t_flows.js` | Luồng thật: cài đặt đọc, đánh dấu, xoá chương/bộ, phím tắt |
| `t_doctor.js` | **Không cần jsdom** — bóc hàm của *Bác sĩ dữ liệu* ngay trong `admin.js` rồi chạy trên Node: trùng tiêu đề chương phải tách ra 2 loại **ngược nhau** (cùng tên + cùng chữ = đăng trùng → xoá 1 bản; cùng tên nhưng khác chữ = đặt nhầm tên/nhầm số → chỉ sửa tên, kèm chỉ ra số chương bị nhảy như `thiếu Chương 17`), so nội dung phải bỏ `<style>/<script>`, thẻ và dấu câu (`<p>` vs `<div>` không được tính là khác), chương rỗng thì phải nói "chưa so được" thay vì khẳng định, và **quét toàn bộ `data/book`** coi còn bộ nào lặp tiêu đề không (hồi quy bệnh Be My Angel) |
| `t_sweep.js` | Bấm hết mọi nút trong các trang xem có lỗi JS nào không |
| `mock_worker.mjs` | **Không phải bài kiểm thử** — chạy **chính `worker/cms.js`** với KV trong RAM + máy chủ tĩnh, để thử trang quản trị và web ngay trên máy: `node tests/mock_worker.mjs 8787` rồi mở `http://127.0.0.1:8787/admin.html` (URL Worker `http://127.0.0.1:8787`, khoá `MOCK`). Vì dùng code thật nên mọi endpoint (`/api/view`, `/api/vote`, `/api/comments`, `/api/recount`, `/api/admin/*`…) hành xử y hệt bản deploy. Khi khởi động **tự nạp 62 bộ từ `data/` vào KV** và thêm vài phiếu bầu mẫu (tab **Phiếu bầu** có sẵn dữ liệu để bấm thử); `/cz-config.js` được phục vụ lại theo **host đang gọi**, nên mở qua link xem trước nào thì web cũng tự trỏ về đúng máy chủ đó. Đường dẫn `/` mở **trang chủ** (xem tình trạng Worker ở `/api/health`). nên web đọc KV chứ không rơi xuống file tĩnh — đúng như production. Muốn bỏ thì `NO_SEED=1`. Đặt thêm `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `ADMIN_EMAILS` để thử đăng nhập thật. Dữ liệu chỉ nằm trong RAM. |
| `cf_admin_test.js` | Trang quản trị với Worker giả lập: sai khoá phải chặn, kết nối đúng thì hiện 62 bộ, đăng chương nhanh (ghi vào KV + cập nhật registry), sửa truyện, sửa chương, tạo truyện mới, đổi tình trạng hàng loạt, lưu cài đặt/slide/lịch, KV chưa có lượt đọc thì **không hiện số bịa**, đồng bộ Blogger. **Bản 1.5.0 thêm:** người đọc thường mở `/admin` thì **cổng đóng** (không thấy dữ liệu, kể cả dữ liệu tĩnh); đăng nhập bằng email quản trị thì cổng mở + hiện huy hiệu; **Bác sĩ dữ liệu** bắt đúng bệnh "Be My Angel: registry 29 · KV 30 · repo 29" rồi chữa bằng *Nạp chương từ repo lên KV* → KV còn 29, registry thành `29/29`; **kiểm duyệt bình luận** (tìm, lọc, xoá của khách, có hộp xác nhận, ghi nhật ký); **nhật ký hoạt động**; **biểu đồ 30 ngày** + phiếu theo từng chương; **lưu cấu hình Supabase** vào `registry.settings.auth` |

Điều kiện đạt: mọi khoá `errors*` trong JSON kết quả phải là `[]` và tiến trình thoát mã 0.

`t_worker.mjs` và `mock_worker.mjs` **không cần jsdom** — chỉ cần Node 18+:

```bash
node tests/t_worker.mjs          # 100 kiểm tra cho worker/cms.js
node tests/mock_worker.mjs 8787  # worker thật + KV trong RAM, mở admin.html để bấm thử
```

## Xem thử y như bản deploy

```bash
python3 tools/dev_server.py            # http://localhost:8080
```

Máy chủ này mô phỏng **đúng 3 hành vi** của Cloudflare Pages: URL sạch không cần `.html`,
**tự bỏ đuôi `.html` bằng 308**, và đọc `_redirects`. Nếu `_redirects` tạo vòng lặp thì nó
trả **508 kèm đường đi** (`/truyen.html → /truyen → /truyen.html → …`) để biết sửa chỗ nào,
chứ không để trình duyệt treo "redirected you too many times" như bản thật.

