# Ranking, Đáng xem và tóm tắt đầy đủ

## Thay đổi

- Menu và khối xếp hạng đổi tên thành **Ranking**, giữ đường dẫn `/#bxh` để không hỏng liên kết cũ.
- Hai hạng mục Top View / Top Vote, mỗi mục có Ngày / Tuần / Tháng. Mặc định Top View / Tuần.
- Sắp xếp đúng số `viewsDay/Week/Month` hoặc `votesDay/Week/Month`, hiển thị chính con số dùng để xếp hạng. Không pha tổng lượt, độ mới hay trending. Không có số trong kỳ thì hiện trạng thái trống, không đổi hạng mục hoặc lấy tổng số thay thế.
- Kỳ giữ nguyên quy ước Worker: ngày UTC hiện tại; tuần 7 ngày, tháng 31 ngày gần nhất. Cách tính được ghi trên giao diện và guide. Top Vote dùng tổng lượt thích của bộ và các chương theo mô hình dữ liệu hiện tại, không tính sao.
- **Đáng xem** là dãy truyện dưới Ranking, sắp điểm sao trung bình giảm dần, bằng điểm thì ưu tiên nhiều đánh giá hơn. Bằng cả hai thì dùng slug để thứ tự ổn định. Hiện tối đa 12 bộ, bỏ bộ chưa có đánh giá.
- Cập nhật lại khi số liệu thay đổi; bỏ listener vẽ Ranking hai lần cho cùng một sự kiện.
- Mở tóm tắt ngay tại chỗ, không xoá nút dựa vào đo chiều cao khi bố cục chưa sẵn sàng; cập nhật nhãn bằng span riêng thay vì SVG; giữ trạng thái mở khi hero được dựng lại. Đọc được cả `synFull` và trường `syn` trong tệp nội dung, giữ đoạn văn và escape HTML.
- Sửa bỏ thích ngày cũ: trừ đúng ngày đã thích, không trừ nhầm số hôm nay. Không sửa hồi tố dữ liệu sai đã lưu từ các phiên bản trước.
- Tăng phiên bản URL asset và service worker để người dùng nhận JS/CSS mới.

## Kiểm thử đã chạy

`npm run build`: thành công.

`node tests/run.js`: **35 bài/script đạt**, gồm kiểm tra source khớp bản build, secret, headers, 238 kiểm tra Worker hiện có, admin, reader, đăng chương, tìm kiếm, mobile, PWA, cache/fallback, theo dõi, thông báo, đánh giá, truyện riêng tư và quét thao tác nút.

Bài mới:
- `t_ranking.js`: 6 tổ hợp hạng mục/kỳ, dùng chính số kỳ thay tổng, thứ tự sao và số người đánh giá, cập nhật dữ liệu, focus bàn phím, dữ liệu trống/lỗi.
- `t_ranking_worker.mjs`: biên 1/7/31 ngày và bỏ thích đúng ngày gốc.
- `t_synopsis.js`: nguồn đầy đủ và trường cũ, mở/thu gọn, nhãn/trạng thái, nội dung cuối, escape HTML.

Trình duyệt Chromium thật qua Playwright:
- `tests/t_layout_browser.js`, chạy với server.py và binary Chromium chỉ dùng để kiểm thử.
- 1440 / 768 / 390 / 320 px: thao tác đủ 6 tổ hợp Ranking, dãy sao, đo chiều cao mở và đóng tóm tắt, kiểm tra không còn mask khi mở.
- Kiểm tra không tràn ngang trang chủ, truyện, tác giả, couple, guide và cổng admin; kiểm tra reduced-motion; không có pageerror JavaScript trong các luồng này.
- Đã xem ảnh chụp Ranking desktop và mobile. Ảnh/bên thứ ba được thay bằng fixture, không dùng đợt này để kết luận về tình trạng hotlink ảnh production.

## Giới hạn và triển khai

- Các bài kiểm thử dùng dữ liệu/mock dịch vụ; không thực hiện ghi hoặc đăng nhập thật lên Cloudflare/Supabase production. Kiểm tra Chromium admin ở mức cổng vào/bố cục; luồng quản trị được kiểm tra bằng bộ mock admin hiện có.
- Chưa deploy lên web thật. Cần cập nhật Pages và Worker để nhận cả giao diện lẫn sửa lỗi bỏ thích. Cấu hình Durable Object từ thay đổi truyện riêng tư của lượt trước vẫn cần được giữ nguyên.
- Kiểm thử đạt không phải cam kết rằng mọi thiết bị, mạng hoặc dịch vụ bên thứ ba đều không còn lỗi.
