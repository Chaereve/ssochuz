# Nháp = chưa xuất bản (chương)

Ngày: 17/11/2026 · Trạng thái: đã làm

## Người dùng báo gì

> “tab chương đang bị 1 cái là mặc định set public chương chưa đăng, đáng ra là
> để nháp xong admin chỉnh mới xuất bản á”

Hai lỗi chồng lên nhau, cùng một gốc:

1. **Mặc định sai.** Bấm **+ Thêm** chương, nhập nhiều chương từ tệp `.txt/.docx`,
   hoặc tạo bộ mới có sẵn “chương đầu” ⇒ chương được ghi với
   `status: 'published'`. Vừa lưu là độc giả đã thấy ngoài web, kể cả khi nội
   dung còn trống hoặc chưa ai đọc lại.
2. **“Nháp” không có tác dụng.** `isChapterPending()` trong
   `src/shared/schedule.js` chỉ giữ `hidden` và `scheduled` tương lai; `draft`
   chỉ là **nhãn ghi chú** — chọn Nháp rồi bấm Lưu thì chương vẫn hiện.
   Người viết tưởng đang để nháp, độc giả đã đọc được.

## Luật mới

| Trạng thái chương | Độc giả thấy? | Ghi chú |
|---|---|---|
| `published` | có, ngay khi lưu | |
| `scheduled` + mốc giờ tương lai | chưa, tới giờ mới hiện | cron tự cập nhật số chương |
| `scheduled` không có mốc giờ | có | giữ nguyên hành vi cũ cho dữ liệu cũ |
| `hidden` | không | vẫn nằm trong bộ |
| **`draft`** | **không** | **chỉ admin thấy; phải chủ động Xuất bản** |
| không có trường `status` (dữ liệu cũ) | có | không được “mất chương của người ta” |

Một chỗ duy nhất định nghĩa luật: `isChapterPending()` trong
`src/shared/schedule.js`. Worker (`/api/book`, `/api/book/<slug>/chapter/<n>`,
`/feed.xml`, số chương trong registry, push) và admin đều dùng chung.

## Thay đổi ở admin (`/admin` → tab Chương)

- **+ Thêm** ⇒ chương mới ghi `status: 'draft'`; thông báo nói rõ “độc giả chưa
  thấy”.
- **Nhập nhiều chương .txt/.docx** ⇒ tất cả vào dạng nháp.
- **Tạo bộ mới** có “chương đầu” ⇒ chương đó cũng là nháp; `countLabel` là
  `0/1` (đếm chương đang hiện), không phải `1/1`.
- **Bộ chưa có chương nào** ⇒ ô Trạng thái mặc định là **Nháp**.
- Dưới ô Trạng thái có câu giải thích theo từng trạng thái.
- Danh sách chương hiện nhãn **Nháp** và tiêu đề đếm “N chương · M nháp”.
- Nút **Xuất bản ngay** (chỉ hiện khi chương chưa xuất bản): lưu nội dung hiện
  tại **và** đặt `published` trong **một** lượt ghi KV — không bắt Lưu rồi đổi
  trạng thái rồi Lưu lần nữa (quota ghi chỉ 1.000 lượt/ngày).

## Worker

- `PUT /api/book/<slug>/chapter` và `PUT /api/book/<slug>` chuẩn hoá trạng thái
  qua allowlist `published | scheduled | hidden | draft`. Trạng thái lạ (gõ tay
  trong JSON, dữ liệu cũ) quy về trạng thái đang có — không âm thầm đổi chương
  đang ẩn thành hiện hoặc ngược lại.
- `pending` trong registry (và `pendingChapters` ở bản công khai) giờ gồm cả
  chương nháp, nên web hiện đúng “còn chương chưa lên sóng”.

## Kiểm thử

`tests/t_chapter_draft.js` (41 kiểm tra, chạy trong `npm test`):
luật dùng chung (draft bị giữ, dữ liệu cũ vẫn hiện, đếm chương đang hiện) ·
admin (Thêm ⇒ PUT `status: 'draft'`, ô trạng thái + gợi ý, nhãn Nháp, bộ 0
chương mặc định Nháp, Xuất bản ngay ⇒ đúng 1 lượt PUT `published`, bộ mới ⇒
chương đầu nháp) · worker thật (chương nháp không lọt `/api/book` công khai,
`/feed.xml`, số chương registry; admin vẫn thấy; trạng thái rác được chuẩn hoá).

## Lưu ý khi triển khai

Chương nào đang mang `status: 'draft'` trong KV (kể cả những chương trước đây
chỉ được gắn nhãn cho có) sẽ **ẩn khỏi web** sau khi deploy Worker mới. Đây là
đúng nghĩa của Nháp. Muốn đưa lên sóng: tab Chương → chọn chương → **Xuất bản
ngay**. Muốn rà nhanh: tab Kiểm tra dữ liệu hoặc danh sách chương có nhãn Nháp.
