# BÁO CÁO · HẸN GIỜ ĐĂNG CHƯƠNG, NHÁP KHÔNG MẤT CHỮ, LƯU NHANH, TIẾT KIỆM ẢNH

Ngày 23/09/2026 · nhánh `arena/01a0cedc-ssochuz`

Bốn việc chủ trang báo, tất cả đều đã vá và có kiểm thử tự động:

1. **Hẹn giờ đăng chương không xài được, không có chỗ set giờ**
2. **Đang gõ dở mà chuyển chương thì mất chữ (nháp tự động chưa chạy)**
3. **Bấm “Lưu chương” phản hồi lâu**
4. **Ảnh tải lên ăn hết dung lượng Supabase (gói free 500 MB database)**

---

## 1. Hẹn giờ đăng chương — giờ có ô chọn ngày/giờ và Worker biết chờ

**Gốc bệnh:** ô “Trạng thái chương” trong khung sửa chương đã có lựa chọn “Hẹn giờ”
từ trước, nhưng **không có ô nhập giờ**, và Worker **chưa từng đọc trạng thái của
chương** — chọn “Hẹn giờ” rồi lưu thì chương vẫn hiện ra ngoài web ngay lập tức.

**Cách vá (luật nằm đúng một chỗ: `src/shared/schedule.js`, dùng chung Worker + admin):**

| Việc | Ở đâu |
| --- | --- |
| Ô `datetime-local` + nút nhanh **+1 giờ / +1 ngày / +1 tuần** | `src/admin/components/ChapterEditor.jsx` |
| Chọn “Hẹn giờ” mà chưa có mốc → tự điền sẵn 20:00 hôm nay (hoặc +1 giờ nếu đã qua) | như trên |
| Nhãn trong danh sách chương: “Hẹn 25/09 20:00”, “Đã tới giờ · đang hiện”, “Đang ẩn” | `src/shared/schedule.js` → `scheduleLabelOf()` |
| Lọc chương chưa tới giờ khỏi `/api/book/<slug>` công khai, RSS, số chương | `worker/cms.js` → `publicBookShape()`, `chapLen()`, `getFeed()` |
| Đúng mốc giờ → cập nhật registry + báo đẩy “chương mới” | `worker/cms.js` → `publishDueChapters()` (chạy trong cron 10 phút/lần) |
| Tab **Chương → “Chương đang chờ tới giờ”** (bộ nào, mấy chương, còn ~N giờ) | `src/admin/components/ChaptersHub.jsx` |

Quy ước dữ liệu nằm ngay trong object chương, không thêm bảng mới:

```jsonc
{ "t": "Chương 12", "html": "<p>…</p>", "status": "scheduled", "at": "2026-09-25T13:00:00.000Z" }
```

- `status`: `published` (mặc định) · `scheduled` (hẹn giờ) · `hidden` (ẩn) · `draft`
  (nhãn ghi chú, vẫn hiện như cũ).
- Chương **chưa lên sóng** = `hidden`, hoặc `scheduled` **có mốc giờ ở tương lai**.
- Chương chọn `scheduled` mà **chưa có giờ** vẫn coi như đang hiện — dữ liệu cũ
  không bị ẩn oan.

**Nội dung chương hẹn giờ nằm sẵn trong book JSON trên KV, nhưng Worker lọc nên
độc giả không thể đọc trước** — kể cả mở DevTools. Đây là lý do lọc ở Worker chứ
không lọc bằng JavaScript phía trình duyệt.

## 2. Nháp không mất chữ khi đổi chương

**Gốc bệnh:** nháp cục bộ có, nhưng ghi sau 900 ms; đổi chương là state bị thay
ngay nên phần vừa gõ chưa kịp vào nháp → mất. Bản nháp có sẵn còn phải bấm nút
“Khôi phục nháp” mới thấy, nên rất dễ tưởng là mất hẳn.

**Cách vá (`src/admin/components/ChapterEditor.jsx`):**

- `flushDraft()` ghi nháp **ngay, không debounce**, được gọi trước khi:
  đổi chương · đóng tab (`beforeunload`, `pagehide`) · ẩn trang
  (`visibilitychange`) · rời khung sửa chương.
- Giá trị đang gõ được cập nhật vào `liveRef` **ngay trong handler** (không chờ
  nhịp render) — gõ chữ rồi bấm đổi chương trong cùng một nhịp vẫn không mất.
- Nháp có sẵn của chương **tự khôi phục khi mở**, kèm dải thông báo
  “Đã tự khôi phục bản nháp lúc …” và nút **Bỏ thay đổi chưa lưu**.
- Danh sách chương hiện nhãn “· có nháp” để biết chương nào còn bản chưa lưu.
- Autosave sau khi ngừng gõ: **0,7 giây**; lưu lên Worker thành công thì xoá nháp.

## 3. Lưu chương nhanh hơn

**Gốc bệnh:** “Lưu chương” trước đây gửi lại **nguyên bộ** (mọi chương, có bộ vài
MB) rồi ghi lại cả registry.

**Cách vá:** thêm đường riêng chỉ gửi **một chương**:

```
PUT /api/book/<slug>/chapter
{ "index": 11, "chapter": { "t": "…", "html": "…", "status": "scheduled", "at": "…" } }
{ "index": 11, "remove": true }     // xoá chương
{ "from": 3, "to": 1 }              // đổi thứ tự (kéo-thả / Lên / Xuống)
```

Worker đọc bộ trên KV, ghép đúng một chương, ghi book + cập nhật registry **song
song**, rồi trả về số chương mới để admin vá ngay con số trong bộ nhớ — không
phải tải lại registry. Bấm “Lưu chương” xong có dòng “Đã lưu lên Worker trong …”.

## 4. Ảnh nhẹ hơn — tiết kiệm 500 MB database Supabase

**Gốc bệnh:** ảnh thô từ điện thoại 3–8 MB được gửi nguyên lên; mỗi lần dán cùng
một tấm ảnh lại tạo thêm một bản sao (ID ngẫu nhiên).

**Cách vá:**

- Nén ngay trên trình duyệt trước khi gửi (`src/admin/utils/images.js`):
  thu nhỏ cạnh dài (**bìa 1000px**, **ảnh chương 1440px**), hạ chất lượng theo bậc
  `0.82 → 0.74 → 0.66 → 0.58 → 0.5` và thu nhỏ thêm nếu cần, cho tới khi lọt
  **hạn mức bìa ≈ 120 KB**, **ảnh chương ≈ 260 KB**. WebP (rơi về JPEG nếu trình
  duyệt không mã hoá được WebP).
- **ID theo nội dung ảnh** (băm SHA-256): dán lại đúng tấm ảnh cũ thì Worker thấy
  ID đã có và trả URL cũ, **không ghi thêm bản sao** — đây là chỗ tiết kiệm nhiều
  nhất. Giao diện báo “Ảnh này đã có trong kho — dùng lại, không tốn thêm chỗ”.
- **Ảnh trong chương giờ đi Supabase Storage (bucket `images`)** thay vì nhét
  base64 vào KV/bảng `ssochuz_blobs` nằm trong Postgres 500 MB; Storage free 1 GB
  tính riêng. Storage lỗi thì tự rơi về đường cũ, không làm hỏng việc đăng bài.
  Bìa vẫn dùng bucket `covers`.
- Nút **Kiểm tra dữ liệu → chuyển overflow** vẫn dùng được để mang ảnh cũ sang
  Storage (`migrateOverflow` nay đưa ảnh chương vào bucket `images`).

---

## Kiểm thử tự động

```
node tests/run.js          # toàn bộ 53 bài — hiện đạt hết
node tests/t_schedule.mjs  # hẹn giờ + lưu 1 chương + dung lượng ảnh (Worker thật, KV giả)
node tests/t_admin_chapter.js  # khung sửa chương: nháp, ô hẹn giờ, đường lưu 1 chương
node tests/t_admin_upload.js   # nén ≤ hạn mức + ID theo nội dung
```

`t_schedule.mjs` kiểm cả những chuyện hiểm: chương hẹn giờ **không** lọt ra
`/api/book` công khai, RSS, số chương; cron tới mốc thì tự sửa registry và đánh
dấu `notified`; upload lại cùng ảnh chỉ có **một** khoá `img:<id>`; Storage chết
thì ảnh vẫn lưu được.

## Vài điều cần biết khi dùng

- **“Ẩn” giờ ẩn thật.** Trước đây chọn “Ẩn” chỉ là cái nhãn, chương vẫn hiện ngoài
  web; nay chương Ẩn không còn được trả về cho độc giả.
- Nên **hẹn giờ / ẩn chương CUỐI bộ**. Nếu hẹn giờ một chương ở giữa bộ, các
  chương sau sẽ tạm dịch số thứ tự với những truyện không ghi số trong tên chương
  (14% số chương trong kho); khung sửa chương có dòng nhắc khi gặp trường hợp này.
- Sau khi deploy Worker, nên bấm **Kiểm tra dữ liệu → chuyển overflow** vài lần để
  bê ảnh cũ sang Storage; mỗi lần chỉ làm một lô nhỏ cho tới khi `done: true`.
