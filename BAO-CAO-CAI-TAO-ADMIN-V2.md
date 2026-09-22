# Báo cáo · Cải tạo admin v2 theo Novelist + FICTBASE (kèm kiểm bug toàn bộ)

Ngày: 2026-09-23 · Tham chiếu: plugin WordPress [Novelist](https://vi.wordpress.org/plugins/novelist/)
(quản lý "Books" gọn gàng, CSV import, form metadata đầy đủ) và
[FICTBASE](https://vi.wordpress.org/plugins/fictbase/) (dashboard truyện + chapter editor
đếm từ/thời gian đọc + tags chip + analytics 30 ngày + lịch phát chương).

## 1. Những tính năng "không hoạt động/hoạt động kém" đã chẩn đoán & sửa

| Tính năng | Bệnh gốc | Đã xử lý |
| --- | --- | --- |
| Overview: "Bộ có số liệu / Lượt đọc (KV) / Phiếu thích (KV)" | **Luôn = 0** — không ai từng nạp `/api/admin/stats` vào store | `loadOperationalCounts` nạp stats thật; tiles hiện đúng số KV |
| Báo lỗi: chỉ đọc, không có "đã xử lý" | Worker chưa có endpoint PATCH | Thêm `PATCH /api/admin/reports` (Worker 1.11.0) + nút "Xử lý xong/Mở lại" + 3 tab lọc + Tổng quan đếm "chưa xử lý" |
| Quota KV luôn "ước tính client" | `/api/admin/kv` không trả writesToday | Worker tự đếm từ metadata ghi + log hôm nay, trả `writesToday/lastReset/quotaSupported` → pill quota giờ là số thật |
| Thư viện 63 bộ trong 1 bảng dài, không có bìa | Khó đọc | Thêm bìa thu nhỏ 34×46, phân trang 24/trang, lọc nhanh 18+/đang khóa, tìm cả theo tag |
| Thêm bộ xong form giữ nguyên, không có tags | Thiếu field, UX dở | Form tự reset; thêm ô **Tags** kiểu FICTBASE (chip gợi ý từ thẻ đã dùng, chống trùng, tối đa 12) |
| Soạn chương: không biết chương dài ngắn | Thiếu thông tin | Danh sách chương hiện số từ; dòng thống kê thêm **~phút đọc** (220 từ/phút); nhập **1 file .txt nhiều chương** (tách theo dòng "Chương X") thay cho .docx import của FICTBASE Pro |
| Backup chỉ tải xuống, không khôi phục được | Mất công cụ phục hồi | Thêm "Khôi phục từ backup JSON" (kiểm shape, xác nhận gõ KHÔI PHỤC, tính quota từng lượt ghi) |
| Bình luận: không lọc spam nhanh | Phải đọc tay | Nút "Chỉ nghi spam (n)" — dùng đúng bộ lọc nghi spam của Tổng quan |
| Thống kê: chỉ bảng phẳng | Thiếu trực quan | Biểu đồ cột **lượt đọc 30 ngày** (Overview xem 14 ngày) + bảng **phiếu theo chương** top 10 từng bộ |
| Trang truyện không hiện tags | Field mới | `cz-story.js` vẽ hàng chip `.stags` dưới metadata hero (cz.css có sẵn style) |

## 2. Kiến trúc & ràng buộc giữ nguyên

- Không dịch vụ trả phí, không secret vào bundle, không đổi KV schema (tags là trường mới
  trong metadata registry — Worker chỉ bóc `postId/count/canRead` nên tags tự sống sót).
- Admin v2 vẫn ghi qua đúng endpoint cũ (PUT registry/book, lock, img…); báo lỗi PATCH là
  endpoint admin mới duy nhất, yêu cầu `x-admin-key` như các endpoint admin khác.
- CORS Worker thêm `PATCH` vào `access-control-allow-methods`.

## 3. Điểm mới ở Worker (bắt buộc deploy lại Worker để có)

- `PATCH /api/admin/reports` `{id, done}` — đánh dấu đã xử lý/mở lại; `GET` trả thêm `id`
  (hash ổn định theo nội dung — báo lỗi cũ không cần migrate), `open`, `done`.
- `GET /api/admin/kv` trả thêm `writesToday`, `lastReset`, `quotaSupported`.
- `VERSION = 1.11.0` (xem ở `/api/health` sau khi dán bản mới).

## 4. Kiểm bug toàn bộ (giao diện → tính năng)

- **Suite đầy đủ `npm test`: 51/51 bài ĐẠT** (thêm bài mới `t_admin_v2_features.js`).
- `t_worker.mjs`: 293/293 kiểm tra (12 kiểm tra mới cho PATCH + quota).
- Bài mới `t_admin_v2_features.js` chạy trọn tuyến trên jsdom: kết nối online → tiles số
  liệu thật → biểu đồ 14 cột → PATCH báo lỗi + lọc → lọc spam bình luận → phân trang/bìa/
  lọc 18+ → tags chip lưu vào registry PUT → thời gian đọc + số từ chương → khôi phục
  backup (PUT registry + book) → tách .txt 2 chương → trang truyện hiện tags, 0 lỗi JS.
- Quét computed-style các thành phần mới (chart, thumb 34×46, tag pill, tab lọc, quota) — sạch.
- Test sửa theo: `t_admin_v2.js` (phân trang 24/trang + pager), `t_pwa.js` đã tự bắt lỗi lệch
  version `sw.js` ↔ HTML (đã đồng bộ `v=20260922a` mọi trang + sw.js).
- Version: package `1.10.0`, Worker `1.11.0`, cache-bust `?v=20260922a` (web) /
  `admin-v2.*?v=20260922c` (admin).

## 5. File thay đổi chính

```
worker/cms.js                       PATCH báo lỗi + quota writesToday + VERSION 1.11.0 + CORS PATCH
src/admin/api.js                    patchReport()
src/admin/main.jsx                  nạp stats thật, markReport, restoreBackup
src/admin/components/Overview.jsx   tiles thật + biểu đồ 14 ngày + đếm "chưa xử lý"
src/admin/components/BookList.jsx   bìa, phân trang, lọc 18+/khóa, tìm theo tag
src/admin/components/NewBook.jsx    tags + reset form
src/admin/components/BookEditor.jsx tags
src/admin/components/TagsField.jsx  MỚI — ô nhập tags chip
src/admin/components/ChapterEditor.jsx  giờ đọc, số từ/chương, nhập .txt nhiều chương
src/admin/components/OperationalPanels.jsx  báo lỗi PATCH + lọc, spam filter, BarsChart, phiếu theo chương, khôi phục backup
src/admin/utils/*                   readTime, splitChaptersTxt, parseTags, allTags, spamSuspects dùng chung
src/cz-story.js + src/cz.css        hiện tags ở trang truyện
admin-v2.* / cz.css / cz-story.js   bundle build lại; version ?v= đồng bộ mọi HTML + sw.js
tests/*                             t_worker (+12), t_admin_v2 (phân trang), t_admin_v2_features MỚI
```

## 6. Lệnh cần chạy thủ công (không đổi so với báo cáo trước)

```bash
npm install && cd tests && npm install && cd ..   # 1 lần
npm run build                                     # sinh lại bundle từ src/ — BẮT BUỘC trước khi đẩy
npm test                                          # 51/51 đạt
python3 tools/dev_server.py                       # xem thử http://localhost:8080/admin
```

Deploy production (bạn chủ site tự làm):

1. Commit + đẩy nhánh → Pages phát hành phần tĩnh.
2. **Dán `worker/cms.js` (1.11.0) vào Cloudflare Worker rồi Deploy** — nếu không, PATCH báo
   lỗi và quota thật sẽ chưa có (admin vẫn chạy, chỉ thiếu 2 tính năng mới đó).
3. Mở `/admin` → kiểm tra `/api/health` hiện `version 1.11.0` → vào tab Báo lỗi bấm thử
   "Xử lý xong" → vào Tổng quan xem biểu đồ + quota pill.
4. Backup JSON trước khi khôi phục/khắc phục dữ liệu thật.
