# Truyện riêng tư — triển khai và giới hạn

## Triển khai

- Deploy Worker và Pages cùng đợt. Worker giờ có module `private-books.js`: không chỉ copy riêng `cms.js` vào dashboard.
- Từ gốc repo: `npx wrangler deploy --config worker/wrangler.toml`. Kiểm tra đường dẫn main theo vị trí cấu hình (đã chỉnh thành `cms.js`). Giữ nguyên KV và các secret quản trị hiện có.
- Cấu hình thêm binding `PRIVATE_BOOKS`, lớp `PrivateBooks`, migration SQLite `private-books-v1` đã nằm trong wrangler.toml. Không có binding thì endpoint riêng tư trả 503, không mở kho công khai dự phòng.
- Chạy `node tests/t_private.mjs` và `node tests/t_worker.mjs` trước triển khai. Sau triển khai, thử bằng hai trình duyệt: đúng/sai mật khẩu, tải lại, đường dẫn GET trực tiếp, không có quyền quản trị.

## Cách dùng

Admin → Biên tập → Truyện riêng tư. Chọn mã `private-ten-truyen`, mật khẩu ngẫu nhiên ít nhất 16 ký tự (khuyến nghị sinh bằng password manager), và tệp JSON dưới 1,9 MB:

```json
{"title":"Tên truyện","chapters":[{"t":"Chương 1","html":"<p>Nội dung</p>"}]}
```

Lưu rồi gửi đường dẫn được hiển thị và mật khẩu qua kênh riêng. Lưu cùng mã sẽ thay toàn bộ nội dung và mật khẩu, cần giữ bản gốc ở nơi an toàn. Kho riêng tư chưa tích hợp trình biên tập chương, danh sách thư viện hoặc xuất bản hàng loạt; đây là luồng riêng, không phải nút khóa cho các bộ công khai hiện có.

## Ranh giới bảo mật

- Chương chỉ nằm trong Durable Object, không KV `book:`, repo, registry, feed hay JSON tĩnh. Không được tự đưa nội dung riêng tư vào các luồng nhập/xuất công khai khác.
- Mật khẩu băm PBKDF2-SHA256, salt ngẫu nhiên 128-bit, 100.000 vòng; không lưu mật khẩu thuần. Mật khẩu gửi trong POST qua HTTPS, không query string và không localStorage. Không log request body trên Cloudflare.
- GET không trả chương; POST phải kiểm tra mật khẩu ở máy chủ, response `private, no-store`. Frontend không fallback cho mã `private-`. POST không được service worker cache. Không cấp token lâu dài; tải lại cần nhập mật khẩu.
- Durable Object tuần tự hóa kiểm tra và lưu số lần thử: 20 lần sai / 15 phút / truyện, không dựa IP hoặc KV eventual consistency. Đúng mật khẩu đặt lại bộ đếm. Giới hạn toàn truyện chống dò phân tán nhưng có thể bị lạm dụng gây khóa tạm thời; cân nhắc bổ sung Cloudflare WAF/Turnstile khi triển khai thực tế.
- Đổi mật khẩu không thu hồi nội dung đã tải vào trình duyệt. Người có mật khẩu vẫn có thể copy, chụp ảnh, chia sẻ mật khẩu. Không có cơ chế web nào bảo đảm ngăn tuyệt đối những hành vi này.
- Không thể biến dữ liệu đã công khai thành bí mật hồi tố. Với truyện cũ: cần gỡ bản Blogger, JSON tĩnh, bản preview/deployment cũ và cache CDN/service worker, đánh giá cả lịch sử repo công khai. Những bản người khác đã tải không thể thu hồi. Vì vậy UI chỉ chấp nhận quy trình xuất bản riêng tư cho nội dung chưa công khai; checkbox là xác nhận của người đăng, không phải bằng chứng máy chủ có thể xác minh.
- Đây là kiểm thử tự động nội bộ, không thay thế kiểm toán bảo mật độc lập. Chưa deploy thay đổi này lên Cloudflare trong phiên làm việc.
