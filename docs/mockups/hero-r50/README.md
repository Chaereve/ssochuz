# Mockup rà soát: hero trang truyện (trước / sau)

Trang để mở: `docs/mockups/hero-r50/index.html` — chỉ xem trên máy, `_redirects` đã chặn
`/docs/*` ở bản thật. Trên dev server: <http://127.0.0.1:8081/docs/mockups/hero-r50/>.

Toàn bộ ảnh là **chụp site thật**, không phải hình vẽ:

- TRƯỚC: chụp từ commit `27f7159` (đặt trong git worktree tạm, chạy dev server ở cổng 8082).
- SAU: chụp từ bản đang chạy ở cổng 8081.
- Cùng truyện `hometown-romance`, cùng khung `#shero`, chụp ở bội số 2×.

## Dựng lại ảnh

```bash
git worktree add /tmp/oldwk 27f7159          # bản cũ
(cd /tmp/oldwk && python3 tools/dev_server.py --port 8082)
# chụp 4 ảnh PNG vào /tmp/png (old-d, old-m, new-d, new-m) bằng Chromium
python3 docs/mockups/hero-r50/build_crops.py /tmp/png
```

`build_crops.py` cắt từng cặp TRƯỚC/SAU với **cùng bề ngang** để hai bên cùng tỉ lệ phóng —
nhờ vậy so chữ to nhỏ là so thật, không bị ảnh phóng to thu nhỏ đánh lừa.
