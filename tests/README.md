# Kiểm thử giao diện (jsdom)

Bộ này chạy **trên máy**, không ảnh hưởng bản đang chạy thật.

```bash
cd tests && npm i          # cài jsdom (1 lần)
node run.js                # chạy hết
```

| Bài | Kiểm cái gì |
|---|---|
| `t_config.js` | `cz-config.js`: URL Worker dán thiếu `https://` hoặc thừa `/` vẫn phải trỏ đúng Worker (thiếu `https://` thì trình duyệt hiểu thành đường dẫn nội bộ → mọi lệnh gọi KV thất bại âm thầm); để trống thì dùng dữ liệu tĩnh |
| `t_home.js` | Trang chủ: hero (5 bộ), kệ **Đọc tiếp** (dựng từ tiến độ đọc thật trong máy), **Tủ truyện** (nút lưu trong trang truyện → mục trên trang chủ → bỏ/xoá), thanh thống kê, BXH theo dữ liệu thật, lịch ra chương, tìm kiếm, lọc tab, phân trang, mở trang truyện, **truyện 0 chương phải khoá nút đọc** |
| `t_reader.js` | Trang đọc: nạp đúng bộ theo slug trong URL, chuyển chương (nút + phím ←/→), lưu tiến độ, tủ truyện, đánh dấu, thích, cài đặt đọc (cỡ chữ/nền/phân trang), mục lục, ảnh xem lớn |
| `t_locked.js` | Truyện "Sắp ra mắt": trang đọc báo rõ *chưa có chương* + link Blogger, **không** hiện chữ mẫu hay nội dung của bộ khác |
| `mock_worker.mjs` | **Không phải bài kiểm thử** — Worker KV giả lập + máy chủ tĩnh để thử trang quản trị ngay trên máy: `node tests/mock_worker.mjs 8787` rồi mở `http://127.0.0.1:8787/admin.html` (URL Worker `http://127.0.0.1:8787`, khoá `MOCK`). Dữ liệu chỉ nằm trong RAM. |
| `cf_admin_test.js` | Trang quản trị với Worker giả lập: sai khoá phải chặn, kết nối đúng thì hiện 62 bộ, đăng chương nhanh (ghi vào KV + cập nhật registry), sửa truyện, sửa chương, tạo truyện mới, đổi tình trạng hàng loạt, lưu cài đặt/slide/lịch, số liệu Firebase bị chặn thì **không hiện số bịa**, đồng bộ Blogger |

Điều kiện đạt: mọi khoá `errors*` trong JSON kết quả phải là `[]` và tiến trình thoát mã 0.
