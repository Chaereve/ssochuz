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
| `src/admin.js` | `/admin.js` |
| `src/cz.css` | `/cz.css` |

`cz-config.js` **không** rút gọn: đó là tệp cấu hình chủ web tự sửa (URL Worker,
Supabase…), nội dung vốn công khai.

## Quy trình sửa mã

```bash
npm install       # chỉ cần một lần (esbuild)
# sửa src/…
npm run build     # sinh bản rút gọn ra thư mục gốc
npm test          # 11 bài kiểm thử — chạy trên ĐÚNG bản đã rút gọn
```

Sửa thẳng tệp ở thư mục gốc sẽ bị **lần build sau ghi đè**. Bài `tools/check_src.js`
quét cả hai nơi nên `npm test` sẽ báo nếu hai bản lệch nhau.

## Che mã khỏi Developer Tools — làm được tới đâu

Làm được:

- Bản phát hành đã rút gọn, không kèm source map, không còn chú thích nội bộ.
- `_redirects` chặn `/src/`, `/worker/`, `/tests/`, `/tools/`, `/_inbox/`,
  `/blogger-theme/`, các tệp `.md` và `server.py` → gõ thẳng đường dẫn cũng không lấy được.
- Toàn bộ khoá bí mật (ADMIN_KEY, SESSION_SECRET, RESEND_API_KEY…) chỉ nằm trên Worker;
  mã trong trình duyệt không chứa gì để lộ.
- `_headers` đặt Content-Security-Policy: kể cả khi kẻ xấu chèn được chữ vào trang
  (bình luận, báo lỗi) cũng không chạy được mã, không đọc trộm được khoá đang lưu.

Không làm được (và không nên tin là làm được):

- Mã chạy trong trình duyệt thì **luôn** đọc được bằng DevTools → Sources. Rút gọn chỉ
  làm việc đọc tốn công, không phải chặn hẳn.
- Chặn phím F12 / chuột phải **không** che được gì (còn tắt mở được, còn URL ảnh/API
  nằm ở tab Network) mà lại làm web khó dùng, dễ mất người đọc → không làm.

Muốn kín hơn nữa thì chuyển logic cần giấu xuống Worker (chạy trên máy chủ), chứ không
phải giấu mã ở trình duyệt.
