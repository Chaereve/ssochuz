# Admin v2 — parity audit và cutover checklist

Ngày lập: 2026-09-22  
Phạm vi: chỉ đổi frontend/static routing; không đổi Worker, KV schema, registry/book JSON schema.

## Bổ sung 2026-09-22 (cuộc tinh chỉnh UI sau cutover)

Cutover route đã chạy đúng (`/admin` → admin v2, `/admin-legacy` giữ admin cũ). Đợt này sửa các
lỗi giao diện/chức năng còn sót của v2, thêm chi tiết xem `BAO-CAO-ADMIN-V2-TINH-CHINH.md`:

- Sidebar v2 giờ dùng đúng hệ class `.snav`/`.admin-nav-label`/`.admin-nav-icon` của `cz.css`
  (trước đây class `.aside`/`.admin-nav` không có style nào → sidebar vỡ hoàn toàn).
- Pill tình trạng truyện đổi `st done/updating` → `pill run/done/soon` khớp `cz.css`.
- Bổ sung style thiếu: `.pill.warn`, `.msgbar.info`, màu chấm `.chip.ok/.warn/.bad`, 
  checkbox bảng, thead dính khi cuộn bảng thư viện, hộp bìa v2 không bị `.coverbox` cũ đè.
- Soạn chương: hết flash nội dung chương cũ khi đổi chương; autosave nháp chỉ ghi khi
  thật sự sửa chữ; lưu/xoá/dời chương không còn unhandled rejection.
- Thêm bộ: form tự xoá sau khi tạo thành công; nút "Đọc dữ liệu chương" hoạt động lại khi
  lần đọc đầu thất bại; nút đổi nền sáng/tối ở thanh đầu trang.
- Test: `t_admin_v2.js` tính số liệu từ `data/registry.json` thay vì hardcode;
  `t_adult.js` trồng slide khi registry không còn `slides` (data đã đổi theo thời gian).

## Quyết định cutover

- `/admin` và `/admin/` mở **admin v2**.
- `/admin-v2` vẫn giữ như alias để đối chiếu/log/debug.
- Admin cũ được giữ tại `/admin-legacy` ít nhất 30 ngày sau cutover.
- `admin.html` và `admin.js` không bị xoá; chỉ đổi route sạch qua `_redirects`/dev server.
- Mọi thao tác ghi production vẫn cần `ADMIN_KEY` nhập trong giao diện; đăng nhập Supabase/Google hiện chỉ đủ vào chế độ frontend/static.

## Parity audit theo tab legacy

| Module legacy | Admin v2 | Mức parity | Ghi chú |
| --- | --- | --- | --- |
| Tổng quan | `Overview` | Đủ dùng | Đối chiếu số bộ/chương/18+/việc cần làm, quota pill. |
| Thư viện/List | `BookList` | Đủ dùng | Tìm/lọc/sắp xếp/bulk status/18+/export CSV/JSON/xoá có xác nhận mạnh. |
| Thêm bộ | `NewBook` | Đủ dùng | Tạo metadata, chương đầu, upload bìa qua `/api/img`. |
| Sửa metadata | `BookEditor` | Đủ dùng | Sửa title/slug/author/couple/status/count/date/thumb/synopsis, đổi slug có chuyển book KV. |
| Sửa chương | `ChapterEditor` | Đủ dùng | TipTap, toolbar, import txt/html, autosave local draft, preview, add/delete/move/save, upload ảnh. |
| Khóa mật mã | `BookEditor` lock panel | Đủ dùng | `POST /api/lock/set`, lock/unlock có xác nhận; lock hash không vào registry. |
| Nhân bản bộ | `duplicateBook` | Đủ dùng | Clone metadata + chapters, không clone lock/hash. |
| Doctor dữ liệu | `DoctorPanel` | Cơ bản đủ dùng | Audit KV, scan book, phát hiện lệch số chương/chương rỗng/thiếu book; recount có confirm. |
| Bình luận | `CommentsPanel` | Đủ dùng | Đọc `/api/admin/comments`, fallback gom từng `/api/comments/:slug`, xoá có double-confirm. |
| Báo lỗi | `ReportsPanel` | Đọc được | Worker hiện chưa có report `id/status/PATCH`, nên v2 chưa đánh dấu đã xử lý. |
| Stats | `StatsPanel` | Đủ dùng đọc | Đọc `/api/admin/stats`, top views/votes/voters/today. |
| Votes | `VotesPanel` | Đủ dùng | Đọc voters, gỡ phiếu, reset phiếu có confirm mạnh. |
| Log | `LogPanel` | Đủ dùng | Đọc `/api/admin/log`. |
| Settings/Sync | `SettingsPanel` | Đủ dùng | Backup JSON, import Blogger, sync Blogger, flush stats, recount, link legacy. |

## Hạn chế cần biết trước khi bỏ admin cũ

1. **Reports chỉ đọc:** backend hiện không có endpoint report `PATCH id/status`, nên không có trạng thái “đã xử lý”.
2. **Quota server-side chưa đầy đủ:** `/api/admin/kv` có thể không trả `writesToday/lastReset`; v2 có client estimate + warning/critical toast.
3. **RBAC admin API chưa có:** Supabase/Google login không thay thế `ADMIN_KEY` cho thao tác ghi.
4. **Manual smoke với Worker thật vẫn cần:** người quản trị tự nhập `ADMIN_KEY`; không ghi/nhận key trong repo/chat.

## Checklist trước deploy/cutover

- [x] Build `npm run build` sinh legacy bundle + admin v2 bundle.
- [x] `/admin` route sang admin v2.
- [x] `/admin-legacy` route sang admin cũ.
- [x] `/admin`, `/admin-v2`, `/admin-legacy` có `no-store` + `noindex`.
- [x] Tests static/online-read/online-write/upload/bundle/header/devserver pass.
- [ ] Tải backup production từ admin v2 Settings trước lần ghi production đầu tiên.
- [ ] Chủ site tự nhập `ADMIN_KEY` và smoke test Worker thật:
  - [ ] đọc registry/KV,
  - [ ] mở một book,
  - [ ] lưu thử metadata trên một bộ test,
  - [ ] upload ảnh nhỏ,
  - [ ] lock/unlock bộ test,
  - [ ] backup JSON,
  - [ ] kiểm tra `/admin-legacy` vẫn dùng được.
- [ ] Theo dõi 30 ngày; nếu ổn mới tính xoá/ẩn legacy sâu hơn.

## Rollback

Nếu admin v2 gặp lỗi production:

1. Mở `/admin-legacy` để vận hành tiếp ngay.
2. Nếu cần đưa `/admin` về admin cũ, revert các rule cutover trong `_redirects`:
   - bỏ `/admin  /admin-v2  200`,
   - bỏ `/admin/ /admin-v2 200`.
3. Không cần đổi KV schema hay dữ liệu vì admin v2 ghi qua endpoint cũ và shape cũ.
