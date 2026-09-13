# Kiểm thử giao diện (jsdom)

Bộ này chạy **trên máy**, không ảnh hưởng bản đang chạy thật.

```bash
cd tests && npm i          # cài jsdom (1 lần)
node run.js                # chạy hết
```

| Bài | Kiểm cái gì |
|---|---|
| `t_config.js` | `cz-config.js`: URL Worker dán thiếu `https://` hoặc thừa `/` vẫn phải trỏ đúng Worker (thiếu `https://` thì trình duyệt hiểu thành đường dẫn nội bộ → mọi lệnh gọi KV thất bại âm thầm); để trống thì dùng dữ liệu tĩnh |
| `t_html.js` | Soi HTML tĩnh + **`_redirects`**: thuộc tính trùng, `href` nội bộ trỏ tới tệp không có, `data-ic` không có trong bộ icon, và **đích của luật 200 mà là tệp `.html` thì báo vòng lặp ERR_TOO_MANY_REDIRECTS** (Cloudflare Pages tự 308 bỏ đuôi `.html`; lỗi này từng làm chết trang truyện) |
| `t_home.js` | Trang chủ: hero (5 bộ), kệ **Đọc tiếp** (dựng từ tiến độ đọc thật trong máy), **Tủ truyện** (nút lưu trong trang truyện → mục trên trang chủ → bỏ/xoá), thanh thống kê, BXH theo dữ liệu thật, lịch ra chương, tìm kiếm, lọc tab, phân trang, mở trang truyện, **truyện 0 chương phải khoá nút đọc** |
| `t_stats.js` | Số liệu Firebase thật: BXH theo lượt đọc/bình chọn, sắp xếp "đọc nhiều nhất"; Firebase bị chặn thì **không hiện số bịa** |
| `t_story.js` | Trang truyện + trang đọc: thông tin truyện, tìm/sắp xếp/nhảy chương, mở chương bằng `#chuong-N` và link cũ `#page-N`, chuyển chương (nút + phím ←/→), lưu tiến độ, tủ truyện, thích, đánh dấu, cài đặt đọc, mục lục, ảnh xem lớn, truyện "Sắp ra mắt" **khoá đọc + không lộ nội dung**, và **mọi dạng đường dẫn** (`/truyen`, `/truyen/<slug>/`, `/reader/<slug>/`, `/truyen.html?slug=…`) đều hiểu đúng tên truyện |
| `t_flows.js` | Luồng thật: cài đặt đọc, đánh dấu, xoá chương/bộ, phím tắt |
| `t_sweep.js` | Bấm hết mọi nút trong các trang xem có lỗi JS nào không |
| `mock_worker.mjs` | **Không phải bài kiểm thử** — Worker KV giả lập + máy chủ tĩnh để thử trang quản trị ngay trên máy: `node tests/mock_worker.mjs 8787` rồi mở `http://127.0.0.1:8787/admin.html` (URL Worker `http://127.0.0.1:8787`, khoá `MOCK`). Dữ liệu chỉ nằm trong RAM. |
| `cf_admin_test.js` | Trang quản trị với Worker giả lập: sai khoá phải chặn, kết nối đúng thì hiện 62 bộ, đăng chương nhanh (ghi vào KV + cập nhật registry), sửa truyện, sửa chương, tạo truyện mới, đổi tình trạng hàng loạt, lưu cài đặt/slide/lịch, số liệu Firebase bị chặn thì **không hiện số bịa**, đồng bộ Blogger |

Điều kiện đạt: mọi khoá `errors*` trong JSON kết quả phải là `[]` và tiến trình thoát mã 0.

## Xem thử y như bản deploy

```bash
python3 tools/dev_server.py            # http://localhost:8080
```

Máy chủ này mô phỏng **đúng 3 hành vi** của Cloudflare Pages: URL sạch không cần `.html`,
**tự bỏ đuôi `.html` bằng 308**, và đọc `_redirects`. Nếu `_redirects` tạo vòng lặp thì nó
trả **508 kèm đường đi** (`/truyen.html → /truyen → /truyen.html → …`) để biết sửa chỗ nào,
chứ không để trình duyệt treo "redirected you too many times" như bản thật.

