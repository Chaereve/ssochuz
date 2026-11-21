# Báo cáo sửa lỗi · Bình luận chương này bị lẫn vào chương khác (mỏ neo chTitle)

**Ngày:** 2026-11-21 · **Nhánh:** `arena/6799b761-ssochuz`

## Hiện tượng

Độc giả mở chương X thấy bình luận của chương Y nằm trong khung bình luận cuối
chương; bình luận đã viết cho một chương lại xuất hiện dưới chương bên cạnh.

## Gốc bệnh

Bình luận lưu `ch` = **vị trí trong danh sách chương đang hiện**, nhưng danh
sách này KHÔNG ổn định theo thời gian:

- chương **hẹn giờ / ẩn** lên sóng giữa danh sách → `publicBookShape` bỏ bộ lọc
  pending ⇒ mọi vị trí sau điểm đó dịch chuyển 1 đơn vị;
- admin **xoá / đảo / chèn chương** (ChapterEditor: `splice` xoá, kéo thả đổi
  thứ tự) → toàn bộ vị trí sau điểm đổi trôi theo;
- sự cố trước đó “Lưu bộ trong admin kéo lùi số chương” (PR #112) cũng từng làm
  danh sách chương thay đổi ngoài ý muốn.

Mọi bình luận gửi trước thời điểm đổi dính vào **chương khác** — đúng hiện
tượng bị báo. (Cơ chế “vị trí ≠ số trên tiêu đề” đã được xử lý trước đây qua
`chLabels`; đây là lỗ hổng còn lại: vị trí không bền.)

## Cách sửa — MỎ NEO TÊN CHƯƠNG (`chTitle`)

1. **Gửi kèm tên chương đầy đủ lúc bình luận** (`chTitle`, ≤200 ký tự, thuần
   văn bản): client `makePayload` gửi lên; Worker `postComment` lưu; trả lời
   kế thừa `chTitle` của bình luận cha (như `finalCh`).
2. **Neo lại khi hiển thị** (`posOf` trong `CZ.comments`): ưu tiên tìm chương
   HIỆN TẠI đúng tên đã lưu (khi trùng tên chọn vị trí gần `ch` cũ nhất);
   không tìm thấy (chương đã xoá/đổi tên) → chỉ hiện ở tab **Tất cả** với đúng
   tên đã lưu, KHÔNG dính vào chương nào khác. Bình luận cũ chưa có `chTitle`
   giữ nguyên hành xử theo vị trí.
3. **Nhãn + đếm nhất quán**: badge lấy nhãn của chương đã neo; con số trên tab
   lọc = số dòng đang hiện (trước lấy `byChapter` theo vị trí cũ).
4. **Admin kiểm duyệt** hiện `chTitle` (“Chương 3: Thịt Viên…”) thay vì
   “chương 4” (vị trí trong kho chương) — sửa cả nguồn `mockup/ssochuz-admin-mockup.html`
   vì `admin.html` được sinh lại từ đó khi build.

## Phạm vi sửa

| Tệp | Thay đổi |
| --- | --- |
| `src/cz-app.js` → `cz-app.js` | `chTitle`/`chTitles`, `posOf`, `labelOf`, lọc `rowsFor`, đếm tab, payload, `setChapter(c, label, title)` |
| `src/cz-story.js` → `cz-story.js` | bảng `chTitles()`, `chapTitle(i)`, truyền vào 2 khung bình luận |
| `worker/cms.js` | `postComment` nhận/lưu `chTitle`, reply kế thừa; `publicComment` trả về |
| `admin-real.js` | `loadComments` giữ `ct` (chTitle) |
| `mockup/ssochuz-admin-mockup.html` → `admin.html` | dòng meta ưu tiên tên chương đã lưu |
| `tests/t_comment_anchor.js` | test mới: neo khi kho chương đổi thứ tự, chương xoá chỉ hiện ở “Tất cả”, trả lời kế thừa neo, gửi kèm `chTitle` |

## Kiểm chứng

- `node tests/t_comment_anchor.js` — đạt (mô phỏng `ch` trôi so với tên chương).
- `node tests/run.js` — toàn bộ bài kiểm thử đều đạt (gồm `t_comment_chapter`,
  `t_reader`, `t_worker` 474 kiểm tra, `t_admin_moderation`).
- `npm run build` + `npm run check:worker` — sạch.

## Ghi chú còn lại (ngoài phạm vi)

- **Phiếu thích / lượt đọc theo chương** cũng lưu theo vị trí nên chịu cùng cơ
  chế trôi khi kho chương đổi thứ tự — chưa xử lý trong lần này.
- Bình luận **cũ** (trước bản này, chưa có `chTitle`) không có mỏ neo nên không
  thể tự chữa; các bình luận đã bị trôi do các lần sửa chương trước vẫn nằm
  nguyên vị trí hiển thị hiện tại. Bình luận mới gửi từ bản này trở đi được bảo vệ.
