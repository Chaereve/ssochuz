# Mockup · thanh tìm & lọc ở thư viện

Mở: `docs/mockups/library-bar-r51/index.html` (chỉ trên máy; `_redirects` đã chặn `/docs/*`).
Trên dev server: <http://127.0.0.1:8081/docs/mockups/library-bar-r51/>.

- `img/` — ảnh chụp **site thật** sau khi bỏ công tắc kiểu xem (desktop 1216, mobile 390).
- `mock.js` — HTML của ba phương án, dựng lại đúng class của site (`.libbar`, `.srch`, `.dd`,
  `.librow`, `.libchips`, `.chip`, `.lcount`).
- `mock.css` — chỉ phần CSS riêng của từng phương án (`.barB`, `.barC`, `.barD`, `.sheetSketch`)
  và bản sao công tắc `.seg.vseg` để khung “Hiện tại” vẫn đúng như bản cũ. **Không** nằm trong `src/`.
- `frame.html` — khổ 360px cho bản mobile, nhúng bằng iframe để media query chạy theo bề ngang khung.

Chốt phương án nào thì port phần tương ứng vào `index.html` + `src/cz.css`.
