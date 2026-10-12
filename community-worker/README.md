# Ssochuz Community Worker

Worker độc lập cho chapter reactions và hộp góp gạch ảo. Không sửa/không dùng `worker/wrangler.toml`; tệp đó tiếp tục là cấu hình của CMS production hiện có `chuseoz-cms`.

- Wrangler config: `community-worker/wrangler.toml`
- Entry point: `community-worker/index.js`
- Worker name: `ssochuz-community`
- D1 migration: `community-worker/migrations/0001_community.sql`
- D1 binding: `CZ_DB`
- Service binding `CMS` trỏ tới `chuseoz-cms` để xác minh Supabase JWT qua `/api/auth/me` và kiểm tra registry/TOC public. Không dùng `service_role` trong Community Worker.
- Web gọi reaction/gạch qua `CZ_COMMUNITY_API` trong `cz-config.js`. Khối theo dõi chương mới vẫn đọc endpoint TOC theo lô của CMS hiện có qua `CZ_API`.

## Tạo D1 và deploy

Chạy các lệnh từ repo root; không deploy cho tới khi thay database ID placeholder:

```bash
cd community-worker
npx wrangler d1 create ssochuz-community
# Dán database_id Wrangler vừa trả về vào community-worker/wrangler.toml:
# database_id = "REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID"
npx wrangler d1 migrations apply ssochuz-community --remote
npx wrangler deploy
```

Để lấy URL mặc định, tên Worker là `ssochuz-community`; nếu workers.dev bật thì cấu hình client trong `cz-config.js` phải trỏ tới `https://ssochuz-community.<account-subdomain>.workers.dev`. Nếu account subdomain khác, chỉ đổi `CZ_COMMUNITY_API`, không đổi URL CMS cũ.

Kiểm tra sau deploy:

```bash
curl -s https://ssochuz-community.<account-subdomain>.workers.dev/api/health
```

Health cần có `worker: "ssochuz-community"`, `d1: true`, `cmsBinding: true`. Endpoint actions là `POST /api/community/reactions` và `POST /api/community/brick`.

## Cloudflare Pages preview và ranh giới deploy

Pages của site này phục vụ các asset tĩnh đã build/commit ở repo root; không có thư mục `/functions` hoặc Wrangler config ở root. Vì vậy log Pages báo “No build command specified” / “No functions dir” là đúng với cách deploy hiện tại. Pages preview không deploy `chuseoz-cms` hoặc `ssochuz-community`; mỗi Worker được deploy riêng từ thư mục và config của chính nó.

Trong log PR #73, Pages đã validate `_redirects`/`_headers` và upload assets thành công, rồi lỗi ở bước cuối “Failed to publish your Function. Got error: Unknown internal error occurred.” Đây là lỗi của bước publish/finalize Pages sau khi static assets đã lên; không phải lỗi D1 migration hay bundle của hai Worker. Không sửa Wrangler config của CMS hoặc community để xử lý lỗi Pages này; nếu lặp lại, xem/download toàn bộ Pages deployment log để có error ID/chi tiết cho Cloudflare.
