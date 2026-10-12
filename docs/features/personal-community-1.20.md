# Ssochuz 1.20 — dữ liệu cá nhân và tương tác cộng đồng

Tài liệu triển khai cho phần theo dõi/tiến độ, hai khối cá nhân trang chủ, random picker, reaction chương, góp gạch ảo và sticker picker trong comments hiện có. Web vẫn là site tĩnh; không thêm framework, backend hay database độc lập.

## 1. Nguồn dữ liệu và luồng

```text
Reader browser
  ├─ Supabase Auth access token ── RLS/Postgres: story_follows, reading_progress
  ├─ Bearer Supabase JWT (claim sub) ── Cloudflare Worker ── D1: reactions + bricks + totals
  ├─ POST /api/community/tocs ── Worker/KV-or-overflow: TOC public, batches ≤20
  └─ comments/stickers ── CZ.comments + Worker/KV comments đang có

Guest/offline: localStorage có version ── merge khi đăng nhập, không dùng service_role.
```

- **Supabase Postgres** là source of truth của follow và reading progress khi đã đăng nhập. Browser dùng client publishable/anon key + phiên người dùng; mọi bảng bật RLS theo `auth.uid()`. Không dùng hoặc phát hành `service_role` ở frontend.
- **Cloudflare D1** là source of truth của reaction action rows, brick action rows và aggregate totals. Writes là prepared statements trong `D1.batch()`; D1 unique keys/transaction bảo vệ toggle/one-per-day khi đồng thời.
- **KV** hiện hữu vẫn phục vụ registry/book/comments và cache/metadata của site; không dùng KV làm kho action mới. **KV không bắt buộc cho community aggregate.** Endpoint TOC đọc dữ liệu sách công khai qua đường đọc Worker hiện có, tối đa 20 slug/request.
- **localStorage** chỉ phục vụ guest/offline và cache cá nhân có UID, prefix `ssochuz:` + version `:v1`. Dữ liệu reaction/gạch không được lưu tại đây. Dữ liệu legacy được đọc để migrate nhưng không ghi lại bằng key cũ.
- Random picker giữ tùy chọn/kết quả gần nhất ở `ssochuz:dice:options:v1` và `ssochuz:dice:last:v1`.

### Guest/server merge và tách tài khoản

`src/cz-personal.js` parse JSON an toàn, chuẩn hoá slug/chapter/timestamps và chống timestamp local far-future. Khi đăng nhập:

1. Đọc guest keys + cache theo UID, rồi query các row chỉ thuộc user hiện hành qua Supabase RLS.
2. Follow chỉ insert nếu story chưa có trên server; row follow đã tồn tại trên server (kể cả mốc mới hơn) không bị guest/cache ghi đè.
3. Progress chỉ upsert nếu `updated_at` local mới hơn row server (khi timestamp bằng nhau, dùng chapter/completion/scroll để phân định).
4. Query lại server sau khi merge; chỉ sau khi hoàn tất mới dọn guest keys. Nếu lỗi/đang chuyển tài khoản thì không trộn data của UID khác.

Tiến độ được debounce khoảng 650 ms theo UID + story. Reader chỉ cập nhật sau khi sang chương, hoàn tất, hoặc vị trí thay đổi đủ lớn/đủ thời gian; không ghi mỗi scroll event.

## 2. Schema Supabase cá nhân

Áp file `supabase/migrations/202610120001_personal_reading_data.sql` trong SQL Editor của **project Supabase hiện có** (hoặc quy trình migration đang dùng ở repo):

### `public.story_follows`

- PK `(user_id, story_id)`; `user_id` tham chiếu `auth.users(id)` với `ON DELETE CASCADE`.
- Lưu `last_seen_chapter_index`, `created_at`, `last_seen_at`.
- CHECK giới hạn slug/chapter; RLS `SELECT/INSERT/UPDATE/DELETE` chỉ khi `user_id = auth.uid()`.

### `public.reading_progress`

- PK `(user_id, story_id)`; `user_id` tham chiếu Auth user.
- Lưu `chapter_id`, `chapter_index`, `scroll_percent`, `completed_at`, `updated_at`.
- RLS CRUD chỉ hàng của `auth.uid()`; trigger bỏ qua UPDATE có `updated_at` không mới hơn row đang có, tránh thiết bị cũ ghi đè tiến độ mới hơn.

Migration cấp quyền cho `authenticated`, revoke `anon`; không chứa project secret. Client gửi UID đang xác thực từ phiên Supabase, còn RLS là ranh giới thực sự — không tin UID local/body để cấp quyền.

## 3. Schema D1 community

Migration: `worker/migrations/0001_community.sql`. Binding: `CZ_DB` (Cloudflare D1), tên database `ssochuz-community`.

- `community_reactions`: một row/user/story/chapter/sticker; PK ngăn bản ghi trùng; `active` là 0/1; sticker ID có CHECK allowlist; chapter 1–100000.
- `community_reaction_totals`: aggregate `(story_id, chapter_index, sticker_id)`, CHECK `total >= 0`. SQLite triggers insert/toggle/delete action để điều chỉnh aggregate nguyên tử.
- `community_bricks`: UNIQUE `(story_id, user_id, day_utc)`, sticker cố định `sso-brick`.
- `community_brick_totals`: một aggregate/story; trigger insert/delete giữ tổng không âm.
- Request dùng `prepare(...).bind(...)`; endpoint chỉ SELECT aggregate/by-current-user, không scan toàn action history và không dùng KV làm source of truth.
- Request body/query **không nhận user ID**. Worker decode claim `sub`, rồi `userFromReq()` xác minh chữ ký, audience, expiry và issuer Supabase project đã ghim. D1 ghi đúng `sub` đã xác minh.

## 4. Worker endpoints

Mọi endpoint là `POST`, dùng CORS theo `ALLOW_ORIGIN` trong `worker/wrangler.toml` (không wildcard + credentials; `Authorization` được cho phép). `CZ_API` trong `cz-config.js` trỏ cùng Worker hiện tại.

### `POST /api/community/tocs`

Public read, không cần D1/Auth. Body `{ "storyIds": ["slug-a", "slug-b"] }`; tối đa 20 ID hợp lệ. Trả `items` chỉ cho truyện public, gồm `storyId`, `chapterCount`, `updatedAt`, và tối đa 10 chapter gần nhất (`index`, `title`). Dùng một POST theo lô cho khối theo dõi trang chủ; response cache client 5 phút.

### `POST /api/community/reactions`

Body tối đa 4096 byte:

- Summary: `{ "storyId": "slug", "chapterIndex": 1 }`; Bearer tùy chọn để nhận thêm `mine`.
- Toggle: `{ "action": "toggle", "storyId": "slug", "chapterIndex": 1, "stickerId": "sso-love-it" }`; **bắt buộc Bearer Supabase JWT**. Sticker ID phải có trong `src/shared/stickers.js` allowlist.

Response summary/toggle gồm `totals` theo sticker và `mine`; toggle thêm `stickerId`, `active`. Cùng một user có thể bật/tắt từng sticker ở từng chapter. Worker rate limit best-effort 60 toggle/phút/user; UI có cooldown ngắn. Animation/audio chỉ chạy sau khi server xác nhận; reduced-motion tắt animation.

### `POST /api/community/brick`

- Summary: `{ "storyId": "slug" }`; Bearer tùy chọn; trả `{ total, givenToday }`.
- Góp: `{ "action": "give", "storyId": "slug" }`; cần Supabase JWT. D1 UNIQUE cho phép đúng một viên ảo mỗi UTC ngày/user/story; request lặp trả 409 và không tăng tổng. Worker best-effort rate limit 30 lần/giờ/user.

**Mã lỗi chính:** 400 JSON/slug/chapter/sticker không hợp lệ hoặc chapter chưa xuất bản; 401 thiếu/sai Bearer cho action (hay Bearer sai ở summary); 404 truyện không public/không tồn tại; 409 đã góp hôm nay; 429 vượt rate limit; 503 chưa bind D1. Reader không bị hỏng nếu endpoint community lỗi.

## 5. Sticker assets và comments

Registry duy nhất: `src/shared/stickers.js`, bundled sang browser bridge `cz-stickers.js` và Worker. Mỗi entry có ID, label, alt, category, quick flag, fallback emoji và URL thumb/full. Không sửa/đổi tên/chuyển vị trí ảnh gốc trong `public/stickers/sso/`.

- Quick reactions, animation và brick dùng `/stickers/sso/full/*.webp`; picker/comments dùng thumbnail. Ảnh sticker không thuộc quick set `loading="lazy"`; lỗi tải hiện emoji fallback.
- `_redirects` ánh xạ URL `/stickers/sso/{full,thumb}/*` đến file gốc dưới `public/stickers/sso/`; `_headers` cache alias dài hạn. Service worker precache shell + sticker quick set, không kéo toàn bộ picker assets về trước.
- Sticker picker là phần bổ sung cho `CZ.comments.mount()` và route `/api/comments/:slug` đang có. Comment/reply có sticker kèm chữ hoặc sticker-only; Worker allowlist ID trước khi lưu/đọc public comment. Không tạo comments backend mới.
- Buttons có accessible label, `aria-expanded`, focus chuyển tới sticker đầu tiên; nút/touch target ít nhất 44 px; layout responsive và reduced-motion được tôn trọng.

## 6. Setup và deploy

### Một lần cho mỗi môi trường

1. Chạy Supabase migration trên project hiện tại theo §2. Không tạo project/database thứ hai.
2. Từ repo root: `cd worker && npx wrangler d1 create ssochuz-community`.
3. Chép `database_id` Cloudflare trả về vào `worker/wrangler.toml`, thay `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID` ở binding `CZ_DB`. Không deploy với placeholder.
4. Áp migration: `cd worker && npx wrangler d1 migrations apply ssochuz-community --remote`.
5. Xác nhận `SUPABASE_URL` trỏ đúng project Supabase. Project dùng khóa JWT HS256 cần Worker secret `SUPABASE_JWT_SECRET`; RS256/ES256 dùng JWKS. Giữ `ALLOW_ORIGIN` tối thiểu chỉ gồm web thật và preview cần dùng; `Authorization` đã có trong CORS headers.

### Build/verify/deploy

```bash
# tại repo root
npm ci
npm ci --prefix tests
npm run build
npm run build:worker
npm run check:worker
npm run og
npm test

# Worker (sau khi D1 binding/migration đã sẵn sàng)
cd worker && npx wrangler deploy
```

Deploy static Pages từ repo root theo quy trình hiện tại. `npm run build` sinh `cz-stickers.js`/`cz-personal.js` và bundles khác; `npm run og` đồng bộ `truyen/<slug>/index.html` + vùng OG trong `_redirects` với `truyen.html`. Service worker/version query phải cùng bộ phát hành.

Kiểm tra sau deploy:

```bash
curl -s https://<worker>/api/health
curl -i -X POST https://<worker>/api/community/reactions \
  -H 'Origin: https://ssochuz.pages.dev' -H 'Content-Type: application/json' \
  --data '{"storyId":"third-person","chapterIndex":1}'
```

Health phải có `version: 1.20.0`, `community.d1: true`; summary reaction phải HTTP 200 và có CORS origin chính xác. Action cần JWT Supabase hợp lệ. Kiểm tra asset: `curl -I https://<site>/stickers/sso/full/sso-love-it.webp` và `curl -I https://<site>/stickers/sso/thumb/sso-love-it.webp` đều phải HTTP 200 (`image/webp`). Supabase migration, D1 migration và Worker deploy không tự chạy trong `npm test`.

## 7. Giới hạn/chưa triển khai

- Quà virtual là optional, hiện **chưa triển khai**; không có thanh toán/coin/tiền thật.
- Brick là aggregate ảo, không ghi danh tính người góp ra UI công khai; reaction không có leaderboard user.
- Rate limiter trong Worker là best-effort theo isolate; D1 unique/transaction vẫn bảo vệ tính duy nhất/aggregate khi có request đồng thời.
- Trang chủ lấy chapter count/TOC từ Worker hiện có; giới hạn 20 slug/lô và tối đa 10 chapter title gần nhất.
- Sticker picker chỉ hỗ trợ comments hiện có; không migrate comments ra khỏi KV.
- Chưa áp migration lên project Supabase/D1 thật và chưa deploy Worker/Pages trong lần triển khai mã này; người triển khai cần làm các bước §6 trước khi bật production.

## 0. Deploy bản 1.20.0 — 2 cách, chọn 1

> ### ⚠ TRƯỚC KHI DEPLOY: đọc 3 dòng này (sự cố thật ngày 23/09)