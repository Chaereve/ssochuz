# Đợt 2 — Tên khác và các phần/thứ tự đọc

## Trạng thái / phạm vi

- PR #75 (đợt 1) đã merge, commit `f7cdb7724fac624e7e29b55e37016fd1440626f0`.
- Cloudflare Pages production thành công: deployment `c95bc292-eae5-49f7-b194-43a2d3735c1e`, URL https://ssochuz.pages.dev (immutable https://c95bc292.ssochuz.pages.dev). GitHub test check của commit merge cũng success.
- Owner xác nhận đã deploy CMS Worker đợt 1 bằng `npx wrangler deploy --keep-vars`. Không cần làm gì thêm về triển khai đợt 1; push trên thiết bị thật vẫn kiểm bằng chương phát hành thật, không tạo chương/notification thử.
- Đợt 2 chỉ metadata/tìm kiếm/liên kết phần. Không có trạng thái đọc (đợt 3), báo lỗi bôi đen (đợt 4) hay thông báo ngoại truyện.

## Dữ liệu

Các trường **tùy chọn** trên mỗi bản ghi `registry.lib[]`:

```json
{
  "aliases": ["Tên gốc", "Tên Việt khác"],
  "readingGroup": "reading-group-1",
  "readingOrder": 1,
  "partType": "main"
}
```

- `aliases`: tối đa 20 tên, mỗi tên ≤160 ký tự; mỗi dòng một tên trong admin; trim, bỏ rỗng/trùng/tên chính theo tìm kiếm không dấu. Chuỗi được escape khi hiển thị; không xem là HTML.
- `readingGroup`: ID nhóm không chứa slug/tên của phần có thể bị ẩn, không đổi theo slug.
- `readingOrder`: thứ tự bắt đầu từ 1, được gán từ danh sách đã sắp xếp.
- `partType`: `main` (Chính truyện), `extra` (Ngoại truyện), `special` (Special), `sequel` (Phần tiếp theo).
- Không có trường mới nào là bắt buộc. Bản ghi cũ không bị lỗi hoặc phải backfill.
- Một lần bấm Lưu metadata gửi một PUT registry cho cả nhóm (không ghi từng book/chapter, không enqueue push).
- Không cho chọn trùng, bỏ truyện đang sửa ra khỏi nhóm, nhóm chỉ một phần, slug không tồn tại, loại không hợp lệ, hoặc lấy thành viên từ nhóm khác. Muốn chuyển nhóm: gỡ khỏi nhóm cũ, lưu trước rồi thêm nhóm mới. Tối đa 100 phần/nhóm.
- Gỡ liên kết cả nhóm có hiệu lực khi bấm lưu; không xóa truyện/chương. Đổi slug không làm đứt nhóm. Xóa truyện làm sạch nhóm đơn lẻ còn lại. Nhân bản truyện không tự đưa bản sao vào nhóm.
- Frontend chỉ dựng liên kết từ thư viện công khai đã lọc. Draft/private/scheduled chưa tới mốc không xuất hiện trong nhóm hay link phần kế tiếp. Truyện khóa mật mã có thẻ công khai vẫn dẫn đến trang thông tin, không bỏ qua khóa.

## File chính

- Mới: `src/shared/reading-groups.js`, `src/admin/components/ReadingGroupEditor.jsx`.
- Admin: `src/admin/components/BookEditor.jsx`, `NewBook.jsx`, `BookList.jsx`; `src/admin/utils/books.js`, `src/admin/main.jsx`, `src/admin/styles/admin.css`.
- Độc giả: `src/cz-app.js`, `src/cz-home.js`, `src/cz-story.js`, `src/cz.css`.
- Build: `cz-app.js`, `cz-home.js`, `cz-story.js`, `cz.css`, `admin.js`, `admin.js.map`, `admin.css`, asset hashes trong `admin.html`.
- Cache: `sw.js`, các HTML gọi asset (gồm `404.html`, trang chủ, reader, guide, profile, My Space, tác giả/couple/vòng quay); `truyen/*/index.html` sinh lại bằng `npm run og`.
- Test mới: `tests/t_reading_groups.mjs`, `tests/t_catalog_ui.js`, `tests/t_catalog_admin.js`; cập nhật `tests/run.js`, `tests/t_worker.mjs` (kiểm Worker hiện tại bảo toàn fields, lọc draft và không gửi push).

Không sửa `worker/cms.js`, Community Worker, config/bindings, Supabase migration, KV namespace, DO, auth, follow/progress, comment/sticker/reaction/góp gạch.

## Triển khai và thứ tự

**Không cần deploy Worker, migration, SQL hay thêm/sửa biến môi trường cho đợt 2.** Worker đã triển khai hiện tại giữ các metadata tùy chọn khi PUT/GET registry; đã có test roundtrip thực thi Worker trong Node với KV giả.

1. Kiểm tra Pages preview của PR đợt 2.
2. Owner duyệt preview. Chưa tự merge hoặc làm đợt 3.
3. Sau khi được cho phép merge: Pages tự deploy frontend từ main. Kiểm tra Pages success ở đúng commit.
4. Muốn sử dụng trên dữ liệu thật: trong admin nhập tên khác và chọn nhóm, bấm Lưu metadata. Không cần cập nhật repo JSON thủ công; KV là nguồn thật. Chưa nhập dữ liệu mới thì phần nhóm/tên khác được ẩn như trước.
5. Sao lưu KV về repo/OG theo quy trình hiện có nếu muốn bản fallback chứa các metadata mới. Đây không phải migration và không bắt buộc để online hoạt động.

Rebuild tại máy local:

```sh
npm ci
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --prefix tests
npm run og
npm run build
npm run check:worker
npm test
git diff --check
```

Repo không có script lint độc lập; đã chạy checkJs Worker, các checker của `npm test`, build và `git diff --check`. Không nâng dependencies hoặc thêm dịch vụ.

## Hướng dẫn kiểm tra preview (không làm mất dữ liệu thật)

**Preview dùng CMS/KV production theo cấu hình hiện có.** Không nhập dữ liệu giả rồi bấm Lưu online chỉ để thử. Các dữ liệu A/B/draft trong test chỉ tồn tại trong bộ nhớ, không được thêm vào registry thật. Có thể chọn chế độ tĩnh trong admin và dùng **Lưu nháp phiên** để kiểm UI nhóm mà không ghi KV; nháp này không tự xuất hiện ở trang độc giả và mất khi rời phiên.

Nếu owner chủ động cập nhật metadata thật (nội dung đã xác nhận):

1. Admin → Thư viện → Sửa: nhập 2 tên khác, mỗi dòng một tên. Lưu rồi mở lại xem tên còn đủ.
2. Trang chủ: tìm bằng tên khác (thử không dấu/khác hoa thường), kết quả đúng truyện và ghi “Tên khác khớp: …”. Thử cả lưới/danh sách và ô tìm nhanh Ctrl/Cmd+K.
3. Admin → Sửa → Các phần & thứ tự đọc: chọn ít nhất 2 truyện. Đổi loại của từng phần; dùng ↑/↓ đổi thứ tự; Lưu metadata. Mở một thành viên khác: nhóm/thứ tự phải nhất quán.
4. Trang thông tin truyện: thấy “Các phần & thứ tự đọc”, nhãn loại và phần hiện tại. Bấm liên kết sang đúng truyện.
5. Mở chương cuối hiện có của phần trước: có nút “Phần tiếp theo: …” dẫn đến trang thông tin phần kế tiếp (không tự chuyển chương/đánh dấu đọc xong). Các chương giữa và phần cuối nhóm không có nút này.
6. Truyện không có metadata mới: giữ giao diện/luồng cũ. Không đưa phần chưa công khai vào liên kết. Gỡ nhóm không xóa nội dung, giữ follow/tủ/tiến độ.

Test A/B an toàn không dùng dữ liệu production:

```sh
node tests/t_reading_groups.mjs
node tests/t_catalog_ui.js
node tests/t_catalog_admin.js
node tests/t_worker.mjs
```

## Kết quả và giới hạn

- `npm test`: **83/83 bộ đạt**, gồm toàn bộ hồi quy đợt 1 và tính năng cũ.
- `npm run build`, `npm run check:worker`, `git diff --check`: đạt. Test admin chạy bundle thật; kiểm một PUT registry, mở lại dữ liệu, lỗi validation không ghi, gỡ liên kết.
- axe-core trong suite kiểm các màn cũ; riêng giao diện mới được test DOM/keyboard controls trong jsdom, chưa khẳng định đã kiểm thị giác trên mọi điện thoại thật.
- Admin CSS gần budget mềm có sẵn; vẫn dưới trần kiểm thử. npm audit phụ thuộc gốc hiện báo 4 advisory có sẵn (3 moderate, 1 high); đợt này không đổi dependency/lockfile. Không dùng `audit fix --force` ngoài phạm vi.
- Link phần tiếp theo ở chương cuối **hiện có**, không khẳng định phần trước đã hoàn thành; thông tin tình trạng truyện vẫn giữ như cũ.
- Registry dùng cơ chế lưu hiện có: tránh hai admin sửa cùng lúc vì có thể ghi đè snapshot. Nên sao lưu trước khi chỉnh nhóm lớn. Không thêm cơ chế concurrency mới ngoài phạm vi.
- Rollback frontend sẽ ẩn các tính năng mới; các trường tùy chọn có thể giữ trong KV, không cần xóa dữ liệu/bảng hoặc đổi Worker. Bản frontend mới đọc được dữ liệu cũ.
