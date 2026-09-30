# Xác minh free tier của hạ tầng đang dùng — ssochuz

Ngày kiểm: **2026-09-30**. Nguồn: tài liệu pricing chính thức (bên dưới). Mọi con số dưới đây là **điều kiện thật** để sản phẩm chạy được với **$0/tháng**; không có dịch vụ nào trong danh sách này yêu cầu thẻ tín dụng khi ở gói Free.

## 1. Bảng xác minh

| Dịch vụ | Vai trò trong ssochuz | Hạn mức miễn phí (xác minh 2026-09-30) | Cần thẻ? | Tự nâng cấp / vượt hạn mức | Rủi ro cho ssochuz | Nguồn |
| --- | --- | --- | --- | --- | --- | --- |
| Cloudflare Pages | Host web tĩnh | Băng thông tĩnh không tính phí/không giới hạn (static assets) | Không | Không auto-upgrade | Rất thấp | [developers.cloudflare.com/workers/platform/pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Cloudflare Workers (Free) | Toàn bộ API (`worker/cms.js`) | **100.000 request/ngày**, CPU 10 ms/lượt gọi, log 200k dòng/ngày giữ 3 ngày | Không | Vượt hạn mức ⇒ request lỗi, **không tự tính tiền** khi chưa nâng gói | Trung bình (lưu lượng) | như trên |
| Workers KV (Free) | Registry, book, stats, comments, report | **100.000 lượt đọc/ngày · 1.000 lượt ghi/ngày · 1.000 xoá/ngày · 1.000 LIST/ngày · 1 GB lưu** — reset 00:00 UTC | Không | Vượt bất kỳ mục nào ⇒ **các thao tác thuộc loại đó lỗi** cho tới khi reset | **Cao** (đọc) | [developers.cloudflare.com/kv/platform/pricing](https://developers.cloudflare.com/kv/platform/pricing/) |
| Cloudflare Durable Objects + SQLite (Free) | Truyện riêng tư (`PRIVATE_BOOKS`), My Space (`MEMBER_SPACES`) | 100.000 request/ngày · 13.000 GB-s/ngày · 5 triệu dòng đọc/ngày · 100.000 dòng ghi/ngày · 5 GB lưu | Không | Vượt ⇒ thao tác lỗi; không tự tính tiền | Thấp–trung bình | [developers.cloudflare.com/durable-objects/platform/pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| Cloudflare Cron Triggers | Nhắc chương hẹn giờ (`*/10 * * * *` = 144 lượt/ngày) | Nằm trong hạn mức request của Worker | Không | Tính vào 100k request/ngày (không đáng kể) | Rất thấp | `worker/wrangler.toml` + pricing Workers |
| Supabase Free | Postgres `ssochuz_blobs` (overflow), Storage `covers`, Supabase Auth | 500 MB database · 1 GB file storage · 5 GB egress · 50.000 MAU · **project bị tạm dừng sau 1 tuần không hoạt động** · tối đa 2 project active | Không | Vượt hạn mức ⇒ chặn, **không tự tính tiền** | Trung bình: (a) pause khi vắng, (b) 5 GB egress/tháng | [supabase.com/pricing](https://supabase.com/pricing) |

**Kết luận:** kiến trúc hiện tại đúng tinh thần "free-tier-first" và **không có đường phát sinh chi phí tự động** (không bật billing, không auto-scale, không pay-as-you-go). Đây là điều kiện nên giữ như một bất biến của dự án → ADR `docs/decisions/0001-bat-bien-ha-tang-mien-phi.md`.

## 2. Đối chiếu với mức dùng thực tế (ước lượng từ repo)

| Chỉ số | Số đo | Nguồn | Nhận xét so với hạn mức |
| --- | --- | --- | --- |
| Số bộ | 63 | `data/registry.json` | — |
| Tổng chương | 1.216 | `data/book/*.json` | — |
| Dung lượng bản tĩnh | 27 MB (63 tệp, TB 439 KB, lớn nhất 1,87 MB) | `data/book/` | KV 1 GB: bản KV là bản gốc; overflow đã có đường Supabase/R2 |
| Ảnh bìa | 63 bộ, chủ yếu **hotlink host ngoài** (mebmarket 37, mydramalist 11, twimg 7, amazon 4, justwatch 1, tmdb 1, Worker/Supabase 2) | `data/registry.json` | Supabase Storage 1 GB free: dư sức chứa nếu mirror; hiện phụ thuộc host ngoài |
| Ghi KV mỗi ngày | Có ngân sách cứng trong code: `STATS_WRITE_BUDGET` mặc định 240 lượt ghi `stats`/ngày, chia theo giờ UTC; đệm 25 thay đổi hoặc 30 giây | `src/shared/kv-budget.js`, `worker/README.md` | An toàn: << 1.000 lượt ghi/ngày |
| Đọc KV | **Không có ngân sách/cảnh báo trong code** | `src/admin/quota.js` chỉ theo dõi `writesToday` | Rủi ro chính — xem §3 |
| Request Worker | Không đo được trong repo (cần dashboard Analytics) | `worker/wrangler.toml` bật `[observability]` | Cần owner xem dashboard định kỳ |

## 3. Rủi ro quota đã xác minh là **thật**

1. **Đọc KV 100k/ngày** là trần dễ chạm nhất khi web đông: mỗi lượt mở chương ≈ 1 đọc `/chapter/<n>` (+1 cho `/toc` khi mở trang truyện), cộng `/api/registry`, `/api/stats`, `/api/feed`. Cache biên đã giảm mạnh (theo `worker/README.md`: 100 lượt mở chương giảm từ 360 MB xuống 2,19 MB qua cache `/chapter/<n>`), nhưng **không có cơ chế chặn mềm hay hiển thị mức dùng đọc**.
2. Khi chạm trần, KV trả lỗi và **đường đọc nhẹ không có phương án dự phòng tĩnh** ⇒ người đọc thấy "Không tải được… Thử lại" liên tục dù repo có sẵn `/data/book/<slug>.json`. Đây là mục A1 của roadmap.
3. **Supabase pause sau 1 tuần vắng** chỉ ảnh hưởng overflow/ảnh/đăng nhập; truyện vẫn đọc được từ KV và bản tĩnh → chấp nhận được, nhưng cần ghi rõ trong trạng thái lỗi của admin (đã có `overflow.missing`, `urlVia` trong `/api/health`).

## 4. Dịch vụ **không** được thêm trong kế hoạch này

| Muốn có | Giải pháp đầy đủ (tốn tiền) | Phương án miễn phí an toàn | Đánh đổi UX | Khuyến nghị |
| --- | --- | --- | --- | --- |
| Analytics hành vi (funnel đọc, drop-off) | SaaS analytics/heatmap | **Cloudflare Web Analytics** (không cookie, không cần thẻ) **hoặc** đếm phía Worker (KV/in-memory) như `/api/stats` đang làm | Ít chiều phân tích, không session replay | Chỉ làm sau khi owner duyệt (mục D2) |
| Tìm kiếm toàn văn | Algolia/Elastic | Duyệt client trên registry (63 bộ, vài chục KB) hoặc thêm trường từ khoá vào registry | Không tìm được trong thân chương | Giữ nguyên, không cần dịch vụ |
| Chuyển đổi/nén ảnh | Cloudflare Images ($) | Nén **trước khi upload** bằng canvas trong trình duyệt (đang làm: bìa ≤ 120 KB) + mirror về Supabase Storage | Ảnh chương giới hạn 260 KB/1440 px | Giữ nguyên |
| Email thông báo | Resend/SendGrid gói trả phí | Đang có 2 đường miễn phí: Resend free (cần tên miền) **hoặc FormSubmit** (không cần khoá) | Gửi chậm, không đảm bảo như dịch vụ trả phí | Giữ là **tuỳ chọn**, không đưa vào luồng bắt buộc |
| Nền tảng AI (tóm tắt, gợi ý) | API AI trả phí | Không làm ở giai đoạn này; nếu cần gợi ý thì dùng luật/heuristic thuần trên registry | Ít "thông minh" | Không khuyến nghị |

## 5. Cách kiểm tra định kỳ (miễn phí)

1. `/api/health` — phiên bản Worker, `overflow.*`, `auth.*`, `stats.writesToday/writeBudget/buffered` (đã có).
2. Cloudflare dashboard → Workers & Pages → KV/Worker metrics (miễn phí) để xem **lượt đọc** và request/ngày.
3. Supabase dashboard → Usage (miễn phí) để theo dõi egress/storage trước khi chạm 5 GB/1 GB.
4. Khi bất kỳ chỉ số nào > 70% hạn mức: coi như sự kiện vận hành, xử lý theo `docs/features/reader-fallback-khi-worker-loi.md`.
