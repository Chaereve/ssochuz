# src/ — mã nguồn đọc được (KHÔNG phát hành)

Thư mục này là **bản gốc có chú thích** của giao diện. Bản mà người đọc tải về nằm ở
thư mục gốc (`/cz-app.js`, `/cz.css`…) và đã được **rút gọn** (bỏ chú thích, đổi tên
biến nội bộ, xoá khoảng trắng) để người ngoài mở Developer Tools cũng khó đọc, không
còn thấy ghi chú nội bộ (tên khoá KV, luồng quản trị, danh sách endpoint…).

| Tệp nguồn (sửa ở đây) | Bản phát hành (tự sinh) |
| --- | --- |
| `src/cz-app.js` | `/cz-app.js` |
| `src/cz-auth.js` | `/cz-auth.js` |
| `src/cz-home.js` | `/cz-home.js` |
| `src/cz-story.js` | `/cz-story.js` |
| `src/cz.css` | `/cz.css` |
| `src/admin/docx.js` (Mammoth, chỉ tải khi nhập Word) | `/admin-docx.js` — sinh bởi `npm run build:admin` |
| `src/admin/` (Preact, entry `main.jsx`) | `/admin.js` + `/admin.css` + `/admin.js.map` — sinh bởi `npm run build:admin` |

`cz-config.js` **không** rút gọn: đó là tệp cấu hình chủ web tự sửa (URL Worker,
Supabase…), nội dung vốn công khai.

## Bộ icon

Icon giao diện dùng **Tabler Icons** bản outline từ package local `@tabler/icons`
(giấy phép MIT). SVG được nhúng trực tiếp vào mã phát hành qua `var P`, nên không
có request font/CSS/icon từ bên ngoài và vẫn hoạt động khi offline. Google dùng
`brand-google` của Tabler; MoMo giữ hình thương hiệu riêng vì Tabler chưa có biểu
tượng tương ứng.

Khối `var P = { … }` trong `src/cz-app.js` **do máy sinh**, đừng sửa tay:

```bash
node tools/gen_icons_tabler.mjs
npm run build && npm test
```

Generator đọc SVG trong `@tabler/icons/categories/outline`, giữ nguyên public key
mà template đang dùng, bù scale/tâm cho mũi tên và dấu nhỏ, đồng thời chia stroke
ngược scale để nét đồng đều. CSS dùng một hộp inline chung (`.i` và `.i-s`) cho
header, nút, card, admin, trang truyện và mobile.

## Quy trình sửa mã

```bash
npm install       # chỉ cần một lần (esbuild)
# sửa src/…
npm run build     # sinh bản rút gọn ra thư mục gốc
npm test          # toàn bộ bài kiểm thử — chạy trên ĐÚNG bản đã rút gọn
```

Sửa thẳng tệp ở thư mục gốc sẽ bị **lần build sau ghi đè**. Bài `tools/check_src.js`
quét cả hai nơi nên `npm test` sẽ báo nếu hai bản lệch nhau.

## Che mã khỏi Developer Tools — làm được tới đâu

Làm được:

- Bản phát hành đã rút gọn, không kèm source map, không còn chú thích nội bộ.
- `_redirects` chặn `/src/`, `/worker/`, `/tests/`, `/tools/`, `/_inbox/`,
  `/blogger-theme/`, các tệp `.md` và `server.py` → gõ thẳng đường dẫn cũng không lấy được.
- Toàn bộ khoá bí mật (ADMIN_KEY, SESSION_SECRET, SUPABASE_JWT_SECRET,
  RESEND_API_KEY…) và danh sách email quản trị chỉ nằm trên Worker.
- `tools/check_secrets.js` quét bản phát hành để chặn dán nhầm secret/email riêng;
  `npm test` tự chạy phép quét này.
- `_headers` đặt Content-Security-Policy: kể cả khi kẻ xấu chèn được chữ vào trang
  (bình luận, báo lỗi) cũng không chạy được mã, không đọc trộm được khoá đang lưu.

Không làm được (và không nên tin là làm được):

- Supabase `publishable/anon key`, Google Client ID, URL Worker và dữ liệu truyện là
  giá trị công khai bắt buộc để trình duyệt hoạt động. Chúng không phải secret; quyền
  thật phải được chặn bằng RLS/kiểm tra token phía Worker.
- Mã chạy trong trình duyệt thì **luôn** đọc được bằng DevTools → Sources. Rút gọn chỉ
  làm việc đọc tốn công, không phải chặn hẳn.
- Chặn phím F12 / chuột phải **không** che được gì (còn tắt mở được, còn URL ảnh/API
  nằm ở tab Network) mà lại làm web khó dùng, dễ mất người đọc → không làm.

Muốn kín hơn nữa thì chuyển logic cần giấu xuống Worker (chạy trên máy chủ), chứ không
phải giấu mã ở trình duyệt.

## Nhập nhiều chương từ Word

Trong khung sửa chương, bấm **Nhập nhiều chương** rồi chọn một file `.txt`
hoặc `.docx` (tối đa **20 MiB**, nhận được file **12 MB**). Đặt mỗi tiêu đề
`Chương 1`, `Chương 2: Tên chương`, `Lời mở đầu`, `Ngoại truyện`… trên một dòng
riêng trong Word. Kiểm tra danh sách chương và nội dung mẫu ở phần xem trước,
chọn nối cuối hoặc thay thế rồi xác nhận. Chưa xác nhận thì chưa ghi dữ liệu.
File `.doc` cũ phải được lưu lại thành `.docx` trước.

DOCX được đọc trong **Web Worker trên máy người dùng**, không gửi tài liệu sang
dịch vụ chuyển đổi và không tải nguyên file lên API. Giữ chữ **đậm**, *nghiêng*,
kết hợp đậm + nghiêng, gạch chân và ngắt đoạn/xuống dòng. HTML được dựng lại bằng
allowlist, gộp các run liền nhau cùng định dạng; loại thuộc tính Word, font/màu,
link và ảnh nhúng (không tạo base64). Bảng/danh sách được đọc theo thứ tự thành
đoạn văn, không giữ bố cục Word. Thêm ảnh riêng bằng **Upload ảnh** nếu cần.

Preview hiển thị dung lượng file gốc và JSON chương sau tối ưu. File nhiều ảnh
thường nhỏ đi rất nhiều; file chủ yếu là văn bản có thể không nhỏ hơn file DOCX
đã nén. Không cắt chữ để ép dung lượng. Giới hạn giải nén là **64 MiB** để bảo vệ
RAM; cả bộ sau nối/thay thế tối đa **24 MiB JSON UTF-8**, khớp giới hạn Worker/KV.
Nếu vượt giới hạn sẽ báo trước, không gửi dữ liệu thiếu. Lưu cả bộ có timeout
120 giây; request khác vẫn 12 giây. Có thể huỷ đọc file; rời editor sẽ dừng worker.

Nếu không có tiêu đề nhận diện được, toàn bộ văn bản thành một chương. Tiêu đề
không có nội dung được bỏ qua kèm cảnh báo. Thay thế toàn bộ yêu cầu xác nhận cả
việc xoá nháp cũ; nháp chỉ xoá sau khi lưu thành công để không tự khôi phục đè
chương mới.

`admin-docx.js` chỉ tải khi chọn DOCX, cần phát hành cùng `admin.js`/`admin.html`.
Chạy `npm run build:admin` sau khi sửa. Kiểm thử:

- `node tests/t_admin_docx.js`: preview, ghi nối/thay thế, lỗi/retry, nháp cũ.
- `node tests/t_docx_content.js`: worker_threads chạy bundle thật; định dạng,
  an toàn HTML, file >12 MiB có ảnh, file văn bản ~14 MiB/100 chương, huỷ, giới hạn.
- `node tests/t_docx_browser.js`: Chromium thật, CSP và Web Worker thật, lưu rồi
  đọc lại định dạng; chạy riêng sau khi cài Chromium của Playwright hoặc đặt
  `CHROMIUM_EXECUTABLE_PATH`. Hai bài đầu nằm trong `npm test`.
