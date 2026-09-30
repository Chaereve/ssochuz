# Product surface map — ssochuz

Bản đồ các bề mặt **thật sự có trong repo** (không kê các trang không tồn tại). Cột "Evidence" trỏ tới tệp/route đã kiểm.

| Surface | Route / entry point | User role | User intent | Main action | Data involved | Current state | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Landing / thư viện | `/` | Khách, độc giả | Tìm truyện để đọc | Bấm "Đọc từ đầu/Đọc tiếp", lọc/tìm, lưu tủ | `registry.json` (KV → `data/registry.json`) + `/api/stats` | Hoàn chỉnh: hero, dải số liệu, BXH (view/vote × ngày/tuần/tháng), lịch ra chương, thư viện 24 bộ/trang, đọc tiếp, tủ truyện | `index.html`, `src/cz-home.js`, `tests/t_home.js` |
| Trang truyện | `/truyen/<slug>/` (tĩnh `truyen/<slug>/index.html`) | Khách, độc giả | Xem thông tin, chọn chương, đánh giá | Đọc chương, thả tim, đánh giá sao, bình luận, lưu tủ, theo dõi | `/api/book/<slug>/toc`, `/api/rate/*`, `/api/comments/*` | Hoàn chỉnh, có OG/JSON-LD tĩnh cho bot | `truyen.html`, `truyen/<slug>/index.html`, `src/cz-story.js`, `tools/build_og.mjs` |
| Trình đọc | `/truyen/<slug>/chuong-<n>/` | Khách, độc giả | Đọc chương | Chuyển chương, chỉnh cỡ chữ/theme, báo lỗi chữ | `/api/book/<slug>/chapter/<n>`, `/api/view` | Hoàn chỉnh (đường nhẹ), có state Đang tải / Không tải được + Thử lại | `src/cz-story.js`, `tests/t_chapter_light.mjs` |
| My Space | `/my-space` | Độc giả (một phần cần đăng nhập) | Quản lý việc đọc cá nhân | Đọc tiếp, tủ truyện, thống kê đọc, hồ sơ | `localStorage` + Durable Object `MEMBER_SPACES` | Hoàn chỉnh; guest vẫn dùng được phần lưu máy | `my-space.html`, `src/cz-space.js`, `worker/member-spaces.js`, `tests/t_space_browser.js` |
| Hồ sơ công khai | `/profile` | Độc giả đã đăng nhập | Chia sẻ hồ sơ | Sửa hồ sơ/ảnh đại diện, tủ riêng tư ↔ công khai | Durable Object `MEMBER_SPACES` | Hoàn chỉnh; có chốt không lộ email/nháp | `profile.html`, `src/cz-space.js` |
| Tác giả | `/tac-gia/` | Khách, độc giả | Xem theo tác giả | Lọc theo tác giả, theo dõi | registry + `localStorage` follow | Hoàn chỉnh | `tac-gia/index.html`, `src/cz-people.js`, `tests/t_people_data.js` |
| Couple | `/couple/` | Khách, độc giả | Xem theo cặp nhân vật | Lọc, lưu tủ | registry | Hoàn chỉnh | `couple/index.html`, `tests/t_people.js` |
| Hướng dẫn | `/guide` | Khách | Biết cách dùng web/cài app | Đọc hướng dẫn PWA | tĩnh | Hoàn chỉnh | `guide.html` |
| Đăng nhập | `/api/auth/*` (Worker) + Supabase OAuth | Độc giả | Bình luận, lưu hồ sơ | Đăng nhập Google/Supabase | Supabase Auth (JWT RS256) | Hoàn chỉnh, có test ký thật | `src/cz-auth.js`, `worker/cms.js`, `tests/t_worker.mjs` |
| Bình luận / đánh giá | tab "Đánh giá" | Khách (bình luận), đã đăng nhập (tên) | Phản hồi | Gửi bình luận, thả tim, chấm sao | KV `comments:*`, `rate:*`; Giscus tuỳ chọn | Hoàn chỉnh, có chống spam + kiểm duyệt | `worker/cms.js`, `tests/t_rating.js`, `tests/t_rating_withdraw.js` |
| Báo lỗi chữ | nút trong trình đọc | Khách, độc giả | Báo lỗi nội dung | Gửi báo lỗi (kèm ảnh chụp) | KV `report`, email tuỳ chọn | Hoàn chỉnh; email là **tuỳ chọn**, không chặn luồng | `worker/cms.js` (`postReport`), `BAO-CAO-SUA-LOI-BAO-LOI*`… |
| Thông báo trong app | chuông header | Độc giả | Biết chương mới/truyện đang theo dõi | Mở thông báo | `/api/feed`, `/api/notif`, `/api/schedule` | Hoàn chỉnh | `src/cz-app.js`, `tests/t_notif.js`, `tests/t_feed.js` |
| Web Push | đăng ký push | Độc giả | Nhận chương mới | Bật thông báo đẩy | VAPID công khai + secret Worker | Hoàn chỉnh nhưng **tuỳ chọn** | `cz-config.js`, `sw.js`, `tests/t_push.js` |
| PWA / offline | `manifest.webmanifest`, `sw.js` | Khách, độc giả | Cài app, đọc khi mạng chập | Cài app, đọc bản lưu | Cache SW, `data/*.json` | Hoàn chỉnh ở mức tài liệu tĩnh; có nhánh "giữ nhường" cho ảnh bìa host ngoài | `sw.js`, `tests/t_sw_img.js`, `tests/t_pwa.js` |
| Trang quản trị | `/admin` (alias `/admin-v2`, `/admin-legacy`; `/admin.html` → 308) | Quản trị (ADMIN_KEY) / nhân sự theo vai trò UI | Soạn, sửa, kiểm duyệt | Sửa bộ/chương, upload ảnh, đồng bộ Blogger, xem quota, khôi phục backup | Worker KV + Supabase Storage | Hoàn chỉnh, 15 tab; có RBAC **chỉ ở UI** | `admin.html`, `src/admin/**`, `tests/t_admin_*.js` |
| Soạn chương | tab Sửa → khung Chương | Quản trị | Viết/sửa chương dài | TipTap, nháp tự lưu, hẹn giờ, nhập .txt/.docx nhiều chương | KV `book:<slug>`, `PUT /api/book/<slug>/chapter` | Hoàn chỉnh; DOCX đọc trong Web Worker | `src/admin/components/ChapterEditor.jsx`, `tests/t_admin_docx.js`, `tests/t_docx_content.js` |
| Kiểm duyệt | tab Bình luận / Báo lỗi | Quản trị, kiểm duyệt viên | Xử lý phản hồi | Đánh dấu spam/đã xử lý | KV `comments:*`, `report`, log | Hoàn chỉnh | `src/admin/components/OperationalPanels.jsx`, `tests/t_admin_features.js` |
| Sao lưu / khôi phục | tab Cài đặt | Quản trị | Khôi phục dữ liệu | Nhập JSON backup | `/api/registry`, `/api/book/<slug>` | Hoàn chỉnh, có chặn ghi đè rỗng | `tests/t_registry_guard.mjs`, `tests/t_admin_features.js` |
| Đồng bộ KV → repo | GitHub Actions (chạy tay) | Quản trị | Sao lưu repo | Chạy workflow | `tools/pull_from_kv.py` + `ADMIN_KEY` secret | Có, chạy tay (schedule bị comment) | `.github/workflows/sync-kv-to-repo.yml` |
| RSS | `<worker>/feed.xml` (+ `?slug=`) | Độc giả, bot | Theo dõi chương mới | Đọc feed | registry + book | Có | `worker/cms.js` (`feed`), `truyen.html` `<link rel=alternate>` |
| 404 | `404.html` | Mọi vai trò | Tìm đường | Quay về thư viện | tĩnh | Có | `404.html` |
| **Thanh toán** | — | — | — | — | — | **Not present** (không có cổng thanh toán; chỉ có cấu hình ủng hộ ở `settings.donation`) | `data/registry.json` → `settings.donation` |
| **Trang quản trị độc giả** | — | — | — | — | — | **Not present** — tab "Độc giả" ghi rõ "Chưa có API danh sách độc giả trên KV" | `src/admin/components/UsersPanel.jsx` |
| **Tìm kiếm toàn văn** | — | — | — | — | — | **Not present** (tìm theo metadata truyện) | `index.html` `#q` |
| **Onboarding nhiều bước** | — | — | — | — | — | **Not present** (không có tour/hướng dẫn lần đầu; có `/guide`) | không có tệp |

## Ghi chú kiến trúc dữ liệu (để tránh hiểu sai khi đọc code)

- **KV là bản gốc** cho dữ liệu truyện; repo `data/*.json` chỉ là bản sao lưu tĩnh do người chạy workflow/pull sinh ra. Vì vậy số liệu trong repo có thể **cũ hơn** KV — điều này hợp lệ và đã được ghi trong `_inbox`/`worker/README.md`.
- Trang đọc dùng **đường nhẹ**: `/api/book/<slug>/toc` + `/api/book/<slug>/chapter/<n>` (cache biên). Đường cũ `/api/book/<slug>` (tải cả bộ, trung bình 439 KB theo đo trong repo, lớn nhất 1,87 MB) chỉ còn là đường lùi.
- `data/` là dữ liệu **công khai có chủ đích** (đường lùi tĩnh khi Worker lỗi) — không phải rò rỉ secret. Đây là **quyết định sản phẩm cần owner xác nhận lại** vì nội dung truyện nằm trong đó (xem roadmap mục D3).
