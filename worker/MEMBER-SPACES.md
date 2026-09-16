# My Space, hồ sơ công khai và tủ truyện

## Triển khai

Cập nhật đồng thời Pages (HTML/CSS/JS và service worker) và Worker:

```
npx wrangler deploy --config worker/wrangler.toml
```

Cấu hình đã thêm binding Durable Object `MEMBER_SPACES`, lớp `MemberSpaces`, migration SQLite `member-spaces-v1`. Giữ nguyên KV, các secret đăng nhập và binding `PRIVATE_BOOKS` của lần trước. Không chỉ dán riêng cms.js vào dashboard: Worker có các module cần bundle.

Chưa deploy trong phiên làm việc này. Nếu chưa có binding, API báo 503 rõ ràng, không giả báo lưu thành công và không đưa tủ riêng tư vào JSON tĩnh.

## API và quyền truy cập

- `GET /api/me/space`: cần Bearer hợp lệ còn hạn; trả hồ sơ và toàn bộ tủ **của chính người đăng nhập**.
- `PUT /api/me/space`: cần Bearer, `{version, profile}` hoặc `{version, shelf}` hoặc `{version, deleteShelf}`. Server suy ra object từ UID đã xác minh, không nhận owner/uid từ body hoặc query. `version` tránh lưu đè thay đổi từ tab khác (409).
- `GET /api/profiles/<id>`: chỉ trả tên, bio, avatar và các tủ `public`. Không trả email, UID thô, version, tủ riêng tư, số tủ riêng tư, lịch sử hay thống kê đọc. Public id là SHA-256 có namespace của UID, không dùng email hay tên làm định danh.
- Tủ private/public nằm trong **cùng một Durable Object**, đọc/ghi tuần tự. Không có bản sao public KV eventual-consistency bị trễ khi chuyển về private. Mọi response hồ sơ `private, no-store`; service worker bỏ qua API hồ sơ và request có Authorization.
- Mỗi tài khoản: tối đa 24 tủ, mỗi tủ 200 slug từ namespace công khai; không cho chứa mã `private-`. Tủ mới mặc định riêng tư ở UI, server yêu cầu visibility hợp lệ.
- Ảnh do người dùng chọn được crop giữa/resize 256px trên máy, gửi JPEG; server chỉ nhận data PNG/JPEG/WebP có chữ ký ảnh, giới hạn độ dài. Không nhận SVG, JavaScript hoặc URL remote để tránh tải tài nguyên tuỳ ý. Request body giới hạn 300 KB, tốc độ ghi 120 lần/giờ bằng giới hạn KV hiện có.
- Chỉ tên hiển thị có thể sửa (không phải unique username dùng để đăng nhập); public id không thay đổi khi đổi tên. Người chưa lưu hồ sơ chưa có trang công khai.
- Bấm tên người đã đăng nhập trong bình luận mở profile. Bình luận mới dùng tên/ảnh đã lưu ở server nếu có; bình luận cũ giữ snapshot tên/ảnh lúc gửi nhưng link đến hồ sơ hiện tại.

## Dữ liệu cũ và dữ liệu theo tài khoản

Tủ đã bấm Lưu, lịch sử đọc và thống kê cũ **vẫn chỉ nằm trong trình duyệt**. My Space liệt kê đầy đủ lịch sử các bộ trong thư viện, không còn giới hạn 8 mục như trang chủ cũ. Nút tạo tủ từ danh sách trên thiết bị sao chép danh sách lên tài khoản **khi người dùng chủ động chọn**. Không tự upload lịch sử/thống kê, không tự biến tủ cũ thành public.

Các tủ mới và hồ sơ server dùng được trên thiết bị khác sau khi đăng nhập. Tủ trên thiết bị là dữ liệu của trình duyệt, không phải két riêng của tài khoản: khi dùng máy chung, hãy dọn dữ liệu sau khi đọc. Đăng xuất xoá nội dung tủ server khỏi giao diện ngay, nhưng giữ dữ liệu thiết bị có nhãn rõ ràng.

Đổi public → private ngừng cung cấp dữ liệu trong các request sau. Không thể thu hồi nội dung người khác đã xem/chụp/lưu. UI và guide ghi rõ giới hạn này.

## Sao và rút đánh giá

Giao diện theo hành vi mẫu Rating editable/showValue: sao đặc có thể chọn, giá trị cá nhân ngay cạnh hàng sao, toast thành công sau khi Worker xác nhận lưu. Triển khai bằng JavaScript thuần, không nhập React/ReUI/Sonner. Dùng nút với radio semantics, phím mũi tên/Home/End, reduced-motion. Sao tô màu là lựa chọn của người dùng; số trung bình là dòng riêng.

`POST /api/rate/me {slug,vid}` đọc số sao của danh tính hiện tại. `POST /api/rate {slug,vid,rating:0}` rút sao, tính lại tổng/số lượt; giữ đánh giá cũ trên UI nếu ghi lỗi. Bearer không hợp lệ không được âm thầm chuyển thành khách. Danh tính và rate-limit vẫn theo hệ thống rating KV hiện có: khách gắn với mã trình duyệt, người đăng nhập gắn với UID. Không tự gộp đánh giá khách vào tài khoản. Không tuyên bố cơ chế này chống mọi cách gian lận; kiểm thử đồng thời và kiểm toán production vẫn cần thiết cho dịch vụ tải lớn.

## Kiểm tra

- `node tests/t_member_spaces.mjs`: Worker thật + DO giả lập, xác thực, cách ly 2 người, public/private, cache headers, xung đột version, dữ liệu xấu, xoá tủ và quyền rút sao.
- `node tests/t_space.js`: tạo/sửa tủ, hồ sơ, escape HTML, logout, dữ liệu thiết bị.
- `node tests/t_rating_withdraw.js`: lựa chọn cá nhân, rút sao, bàn phím, lỗi ghi giữ giá trị cũ.
- `node tests/run.js`: toàn bộ bộ kiểm thử.
- `CHROMIUM_EXECUTABLE=... node tests/t_space_browser.js` (cần chạy server.py): Chromium thật với dịch vụ giả, kiểm tra upload/resize avatar, lưu lỗi, private/public, trang hồ sơ, rút sao ở 1440/390/320px. Không ghi production.
