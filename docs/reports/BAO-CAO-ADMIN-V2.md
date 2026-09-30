# Báo cáo triển khai · Admin panel ssochuz (tagless, miễn phí)

Ngày: 2026-09-22 · Nhánh: `arena/01a0ca53-ssochuz` · Site công khai không đổi kiến trúc (Pages tĩnh + Worker KV).

Admin nằm **trong cùng repo**, route **`/admin`** (admin-v2). Admin cũ giữ ở `/admin-legacy` để đối chiếu. Không dịch vụ trả phí, không subscription, không secret/service-role trong bundle trình duyệt.

---

## 1. Mục tiêu đã làm

Xây lại trang quản trị **thật** (không mock): quản lý bộ/chương, bìa bền, xuất bản, người dùng, **chỉ thể loại (không tags)**, bình luận/báo lỗi, homepage CMS, thống kê, cài đặt, nhật ký. Quyền Super Admin / Admin / Editor / Moderator / Author. Giao diện sidebar + topbar + breadcrumb + tìm + toast, sáng/tối.

Ràng buộc giữ nguyên:

- Không phá website công khai.
- Tái sử dụng Pages + Worker KV, endpoint cũ.
- Không tags (không bảng, menu, ô nhập, lọc, API tags).
- Không lưu `blob:` / `data:` làm bìa.
- Không bịa số liệu analytics.
- Không hiện “đã lưu” khi Worker chưa ghi.
- TipTap sẵn có — không thêm editor mới.
- ADMIN_KEY / vai trò do Worker quyết; client không được tin role tự khai.

---

## 2. Kiến trúc

| Tầng | Vai trò |
| --- | --- |
| `src/admin/*` + Preact + TipTap | UI admin-v2 |
| `tools/build_admin_v2.mjs` | Bundle `admin-v2.js` / `admin-v2.css` (esbuild IIFE) |
| `worker/cms.js` **1.12.0** | KV, auth, registry công khai vs admin, sanitize HTML chương |
| `src/cz-app.js` / `cz-home.js` / `cz-story.js` | Bìa bền + 1 pill thể loại trên site công khai |

Luồng ghi: form admin → `AdminApi` (ADMIN_KEY) → Worker → KV. GET registry **không** khóa thì `publicRegistryJSON` (ẩn private + chưa xuất bản). GET có ADMIN_KEY trả đủ lib + `settings.staff`.

---

## 3. Module admin

Sidebar nhóm: Tổng quan · Nội dung (Thư viện / Thêm bộ / Sửa bộ / Chương / Thể loại) · Cộng đồng (Bình luận / Báo lỗi / Phiếu) · Trang chủ · Người dùng (Tác giả / Vai trò) · Hệ thống (Thống kê / Kiểm tra dữ liệu / Nhật ký / Cài đặt).

| Tab | Việc làm |
| --- | --- |
| Dashboard | Tile bộ/chương, lượt đọc & phiếu **từ KV** (0 nếu chưa có), việc cần làm “Báo lỗi chưa xử lý”, biểu đồ 14 ngày, quota KV |
| Thư viện | Bảng + lưới, bìa `BookCover`, 24/trang, sắp `updated` mới nhất, lọc tình trạng / 18+ / thể loại / xuất bản, bulk |
| Thêm / Sửa bộ | Metadata, **GenreSelect**, bìa `ImageUploader`, tách **hoàn thành** vs **xuất bản** vs **hiển thị**, khóa 2 ô mật mã, nhân bản, TipTap chương |
| Chương | Hub danh sách + editor: toolbar, Upload ảnh, số từ, ~phút đọc (220 wpm), nhập .txt nhiều chương |
| Thể loại | `GenreManager` — CRUD slug/tên trong `settings.genres`. **Không tags** |
| Homepage CMS | Slide, editor’s choice, thông báo, lịch |
| Tác giả / Vai trò | UsersPanel + RolesPanel; staff trong `settings.staff` |
| Bình luận / Báo lỗi | Lọc spam, xoá (xác nhận), PATCH xử lý xong |
| Phiếu | Xem voter, gỡ / reset (xác nhận mạnh) |
| Thống kê | Số KV thật, biểu đồ 30 ngày; trống nếu chưa có |
| Doctor / Log / Settings | Quét book, audit KV, recount, flush stats, import/sync Blogger, backup + khôi phục JSON |

Chrome: sidebar thu gọn, drawer mobile, topbar search, quota pill, theme, toast, breadcrumb.

---

## 4. Bìa — không blob

1. Chọn file → nén → `POST /api/img`.
2. Lưu URL bền `/api/img/<id>` (prefix `apiBase` khi online).
3. `persistableCover` **từ chối** `blob:` / `data:`.
4. `CZ.coverSrc` bỏ blob, prefix `/api/img/` tương đối.
5. `BookCover` dùng chung admin + (cùng quy ước) site.

Homepage vẫn hiện bìa sau F5 vì URL nằm trong registry/KV, không phải object URL trình duyệt.

Lưu trữ Worker/KV theo free tier (không quảng cáo “unlimited”; nếu dùng Supabase storage thì trần ~1 GB).

---

## 5. Thể loại, không tags

- Đã **xóa** `TagsField.jsx`. Không `.v2tags`, không API tags.
- Sách: một `genre` (slug). Danh mục: `settings.genres`.
- `metaFromForm` / `newBookRecord` **xóa** `tags`.
- Hero trang truyện `.stags` = **một** pill `CZ.genreLabel(n)`.
- Test features đổi tags → genre (`#pane-new select.inp`, assert `tags == null`).

---

## 6. Xuất bản vs hoàn thành vs hiển thị

Ba trục độc lập:

| Trường | Ý nghĩa | Mặc định thiếu field |
| --- | --- | --- |
| `status` | Hoàn thành: Đang cập nhật / Hoàn thành / Sắp ra mắt | như cũ |
| `pubStatus` | draft / pending_review / scheduled / published / archived | `published` (sách cũ); **sách mới = `draft`** |
| `visibility` | public / unlisted / private | `public` |

Worker `isPubliclyListed`: ẩn `private` và chưa xuất bản khỏi GET công khai. `unlisted` vẫn trong registry (link trực tiếp) nhưng `CZ.libList` / `listedPublicly` không đưa vào kệ. Hẹn giờ: ẩn cho đến khi `publishedAt` đã qua.

---

## 7. RBAC

Worker `/api/whoami` với ADMIN_KEY: `{ role: 'super_admin', permissions: ['*'] }`. Role client chỉ **ẩn tab**; mọi ghi KV vẫn cần khóa. Không tin role gửi từ browser.

| Vai trò | Tab / perm (UI) |
| --- | --- |
| Super Admin | Tất cả (`*`) |
| Admin | books, chapters, covers, users, genres, comments, reports, homepage, analytics, settings, audit |
| Editor | books, chapters, covers, genres, homepage, analytics |
| Moderator | comments, reports, users:restrict |
| Author | books/chapters/covers của mình |

Staff lưu `settings.staff`. Public GET **strip** staff/roles; PUT **không** strip (tránh mất nhân sự).

---

## 8. Site công khai

- `coverSrc` / `bookCover` / `genreLabel` trên `cz-app`.
- Home dùng `coverSrc`.
- Story hero: thể loại, không hàng tag cũ.
- `libList` lọc `listedPublicly`; `findLib` vẫn mở unlisted bằng URL.

`tools/check_src.js` bắt buộc bản minify gốc khớp `src/cz-*`.

---

## 9. Kiểm thử

`npm run build` rồi các bài admin-v2:

| Bài | Kết quả |
| --- | --- |
| `t_admin_v2.js` | ĐẠT — gate, overview, list 24, edit Third Person, 2 nút Upload bìa/ảnh, lock, doctor, slug `/truyen/…/` |
| `t_admin_v2_online.js` | ĐẠT |
| `t_admin_v2_writes.js` | ĐẠT — lock/set, xoá cmt, vote-remove/reset, flush, import/sync/recount |
| `t_admin_v2_upload.js` | ĐẠT — POST `/api/img`, điền URL bền |
| `t_admin_v2_features.js` | ĐẠT — genre, không tags, pager, 18+, đọc-time, backup, story stags |
| `t_admin_v2_budget.js` | ĐẠT — `admin-v2.js` **452.9 kb** &lt; 520 kb, CSS 16.0 kb, map không nhúng source |
| `t_worker.mjs` | ĐẠT — whoami `super_admin` |
| `cf_admin_test.js` | ĐẠT (admin legacy) |
| `check_src` / `check_secrets` / `check_headers` | ĐẠT |

`npm test` (`tests/run.js`) chạy tuần tự ~50 bài; từng bài còn lại sau timeout máy (writes → features → cf_admin) đều ĐẠT khi chạy riêng. Không thêm jsdom vào `package.json` (cài một lần `--no-save` cho runner).

---

## 10. File chính

```
src/admin/main.jsx
src/admin/components/{Layout,Overview,BookList,NewBook,BookEditor,ChapterEditor,
  BookCover,ImageUploader,GenreSelect,GenreManager,HomepageCMS,
  UsersPanel,RolesPanel,ChaptersHub,OperationalPanels}.jsx
src/admin/utils/{books,cover,genres,permissions}.js
src/admin/styles/admin-v2.css          → admin-v2.css
src/cz-app.js, src/cz-home.js, src/cz-story.js
worker/cms.js                          VERSION 1.12.0
tests/t_admin_v2_features.js, t_worker.mjs
(đã xóa) src/admin/components/TagsField.jsx
```

Bundle: `admin-v2.js` 452.9 kb, `admin-v2.css` 16.0 kb.

---

## 11. Deploy

```bash
npm run build
npm test
```

1. Đẩy nhánh → Cloudflare Pages phát hành phần tĩnh (`/admin`, `admin-v2.*`, `cz-*.js`).
2. **Dán `worker/cms.js` 1.12.0 vào Worker rồi Deploy** — nếu không, registry công khai chưa ẩn private/nháp, whoami chưa `super_admin`.
3. Mở `/admin` → nối ADMIN_KEY → `/api/health` hiện `1.12.0`.
4. Thử upload bìa, F5 trang chủ: bìa còn. Tạo bộ mới phải ở **nháp** cho đến khi xuất bản.

Không claim unlimited storage. Backup JSON trước khi khôi phục/đếm lại trên KV thật.
