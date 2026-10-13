# Đợt 1 — Notification (2026-10-13)

Chỉ đợt 1. Chưa làm tên khác/liên kết phần/trạng thái đọc/bôi đen báo lỗi.

## Thay đổi

- Chuông lấy registry khi mở và khi tab hiện lại; đồng thời chỉ một request, tối đa một lần/60 giây/tab (kể cả thất bại). Không polling nền. `cache: no-store` bỏ HTTP/SW cache của lần kiểm tra; giữ cache biên Worker chung và URL ổn định để tiết kiệm KV.
- Tách đang tải/lỗi/rỗng. Lỗi không đổi thành “chưa có chương mới”; giữ danh sách biết từ trước. Dữ liệu theo dõi tài khoản chưa tải được cũng không rơi về danh sách khách.
- Nhãn “chương mới”, không gọi là “chưa đọc”. Mở trang thông tin truyện vẫn đánh dấu đã xem, không ghi hoàn thành đọc.
- Các trang chỉ có header nạp personal service ở chế độ **follows-only**: dùng cùng Supabase/RLS cho chuông, không thay đổi lịch sử/tiến độ/tủ My Space. Không gộp cache follow tài khoản cũ vào server để tránh hồi sinh truyện đã bỏ theo dõi trên máy khác.
- Push v2: `{scopeVersion:2, topics:[slug], account:boolean}`. Khách lưu danh sách chính xác của thiết bị. Account gửi access token Supabase; Worker xác minh, chỉ lưu UID (không lưu token). Mỗi cron kiểm tra `story_follows` bằng service-role hiện có trước khi gửi, tôn trọng bỏ theo dõi ở thiết bị khác.
- Đăng ký cũ không có scopeVersion=2 **không nhận bất cứ job nào**. Client cũ gửi đăng ký thiếu scope bị 400; client mới tự đồng bộ subscription đã có khi personal ready/follow/auth change/tab return/online. Không yêu cầu cấp quyền lại cho subscription còn sống. Scope thay thế, không cộng dồn. Logout/đang xác minh tài khoản xóa audience cũ khi thiết bị kết nối được.
- Cập nhật scope tuần tự, debounce 200ms, tránh lặp trong trang; Worker không ghi KV/rate-limit write nếu scope và khóa không đổi. Lỗi đăng ký không còn báo bật thành công.
- Supabase không sẵn sàng/thiếu service-role: **hoãn job account**, không broadcast, không vứt job. Trong mỗi cron tối đa 45 ứng viên được xét; lookup account chia sẻ ngân sách outbound 45 với gửi push, memo theo UID/truyện trong cron. Guest-only vẫn gửi tối đa 45/lượt như cũ. Cron vẫn 10 phút.

## File chính

- `src/cz-app.js` → bundle `cz-app.js`.
- `src/cz-personal.js` → bundle `cz-personal.js` (chế độ follows-only, không hồi sinh cached follow).
- `worker/cms.js`, **mới** `worker/push-audience.js`.
- `sw.js` (no-store pass-through, shell version `20261013notif1`).
- `index.html`, `truyen.html`, `my-space.html`, `profile.html`, `guide.html`, `tac-gia/index.html`, `couple/index.html`, `vong-quay/index.html`; các `truyen/*/index.html` được sinh lại bằng `npm run og` để cập nhật asset URL.
- Test: `tests/t_notif.js`, `tests/t_push.js`, `tests/t_worker.mjs`, `tests/run.js`; mới `tests/t_notification_refresh.js`, `tests/t_push_audience.mjs`, `tests/t_push_scope_ui.js`, `tests/t_follow_only.js`.
- Danh sách chính xác toàn bộ file: tab Files changed của PR (`git diff --name-only c8140d72f93a97e85751d027837fc547cde3dd1f...HEAD`).

Không đổi Community Worker/D1, sticker/comment/reaction/góp gạch, DO bindings/migrations, cấu trúc truyện hoặc cron schedule.

## Triển khai — thứ tự bắt buộc

Pages preview **không deploy CMS Worker**. Preview vẫn trỏ CMS/Supabase production theo `cz-config.js` hiện có. Không coi frontend pass là đã xong push ngoài đời. Không gọi cron/drain thủ công trên production để thử.

1. **Supabase — kiểm tra tiền đề hiện có**: bảng `public.story_follows` từ migration `supabase/migrations/202610120001_personal_reading_data.sql` đã tồn tại, RLS bật. Không có migration mới trong đợt này.
   - Nếu migration trước đây chưa được áp dụng: mở SQL Editor của đúng project, chạy **toàn bộ file trên** trước khi deploy Worker; hoặc tại máy chủ sở hữu đã đặt biến DB URL an toàn:
     ```sh
     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202610120001_personal_reading_data.sql
     ```
   - Không chạy migration khác và không đặt connection string vào repo/chat.
2. **CMS Worker — kiểm tra secret có sẵn** (tại repo đã checkout commit PR):
   ```sh
   npm ci
   npm run check:worker
   npm run build:worker
   cd worker
   npx wrangler secret list
   ```
   Cần secret `SUPABASE_SERVICE_ROLE` của đúng project để cron đọc `story_follows`; thường đã có cho overflow. Chỉ nếu chưa có:
   ```sh
   npx wrangler secret put SUPABASE_SERVICE_ROLE
   ```
   Nhập secret bằng prompt CLI/dashboard, tuyệt đối không ở frontend. Giữ nguyên `VAPID_PRIVATE`, `SESSION_SECRET`, `ADMIN_KEY`, các secret/bindings khác. `SUPABASE_URL`/`VAPID_PUBLIC` đã có trong `worker/wrangler.toml`; không sinh lại cặp VAPID.
3. **Deploy CMS trước frontend production**, giữ biến dashboard bổ sung:
   ```sh
   # đang ở worker/
   npx wrangler deploy --keep-vars
   ```
   Dùng file cấu hình **`worker/wrangler.toml`**, không deploy `community-worker/`. Không đổi ID KV, Durable Objects, cron. Worker mới bỏ qua subscription cũ ngay; người dùng nhận lại push sau khi frontend mới đồng bộ scope. Nếu dùng dashboard Edit code thay vì CLI: `npm run build:worker` sinh `worker/cms.bundle.js` (gitignored), dán toàn bộ bundle và giữ nguyên bindings/exports DO.
4. **Frontend**: xem Pages preview của PR; sau owner duyệt mới merge để Pages production deploy. Preview đang chạy frontend mới có thể kiểm với Worker mới sau bước 3. Không merge tự động. Nếu chưa deploy Worker, việc đăng ký push scoped chưa có hiệu lực an toàn ở backend cũ; không bấm bật push để thử production.
5. **Kiểm tra vận hành**: xem deployment commit Worker, giữ Cron `*/10 * * * *`. Không chỉ dựa vào `/api/health` version (đợt này không tăng version sản phẩm). Xem log cron khi có chương phát hành thật; không tạo chương giả/notification giả cho độc giả.

Không có credential Cloudflare/Supabase trong sandbox; agent không tự deploy Worker hay thay đổi dữ liệu production.

## Test ngắn trên preview

- Khách: mở chuông → tải → danh sách/rỗng. Đóng/mở liên tục, quay lại tab: DevTools Network `GET /api/registry` với cache no-store tối đa 1 lần/phút trong cùng tab. Chờ >60s rồi mở lại/tab return có request mới.
- Offline trong DevTools, đợi >60s, mở chuông: báo lỗi, không giả “chưa có chương mới”. Online lại và qua cooldown: lấy lại dữ liệu.
- Đăng nhập: chuông dùng follow tài khoản trên trang chủ, truyện, My Space, tác giả/couple. Logout không lộ follow tài khoản cũ. My Space vẫn giữ cách hoạt động lịch sử/tủ trước đợt này.
- Bấm vào truyện có cập nhật: badge giảm; tiến độ đọc không tự thành hoàn tất.
- **A/B/push test an toàn, không mạng thật**:
  ```sh
  node tests/t_notification_refresh.js
  node tests/t_push_scope_ui.js
  node tests/t_follow_only.js
  node tests/t_push_audience.mjs
  node tests/t_worker.mjs
  ```
  KV/fetch/PushManager/Supabase giả; Worker chạy thật trong Node, ký/giải mã push với khóa test sinh trong bộ nhớ. Test có guest A/not-B, account A/not-B, legacy skip, auth rejection, backend offline deferral, unsubscribe/logout, cap cron 45.

## Giới hạn / rollback

- Pages check xanh chỉ xác nhận build/deploy frontend. Backend và quyền nhận push trên trình duyệt thật cần chủ trang kiểm tra sau deploy. Không phát thông báo test tới độc giả.
- KV eventual consistency + cache biên registry có thể trễ; chuông không realtime. Tần suất giới hạn theo tab, không khóa liên-tab.
- Thiết bị logout/bỏ follow khi hoàn toàn offline không thể xóa ngay subscription trên server; đồng bộ lại lúc online. Tin đã bàn giao cho nhà cung cấp push trước đó không thể thu hồi.
- Chỉ scope v2 được gửi; subscriber chưa quay lại web tạm không nhận push (chủ đích tránh broadcast). Job account được giữ khi backend lỗi; cần xử lý cấu hình/outage để hàng đợi chạy tiếp.
- Nếu rollback frontend, **giữ Worker lọc scope v2**. Không rollback về Worker gửi đại trà khi cron còn bật. Trường hợp khẩn cấp cần rollback Worker: tạm tắt Cron trên Cloudflare trước, kiểm tra lại audience rồi mới bật lại. Không xóa KV/DO/Supabase để rollback.

## Kết quả kiểm tra local

- `npm run build`: đạt (frontend + admin; không thay đổi thiết kế).
- `npm run check:worker`: đạt (TypeScript checkJs).
- `npm run build:worker`: đạt; bundle không commit, giữ export Durable Objects.
- `git diff --check`: đạt. Repo không có script lint riêng; không tự thêm framework lint trong đợt này.
- `npm test`: **80/80 bộ đạt**, gồm CMS, comment/sticker, reaction, góp gạch, follow, reader, cron, KV, DO, admin, PWA, test mới; axe-core **25 màn, 0 lỗi**.
- Không gọi endpoint ghi/cron production, không gửi push thật. Kiểm chứng E2E Cloudflare Worker + thiết bị thật còn phụ thuộc bước triển khai của chủ trang.
