# Mockup — cách mở trên máy

Thư mục này chỉ dùng để xem thử thiết kế. Bản thật không phục vụ `/docs/*`
(bị chuyển hướng về trang chủ), nên phải tự dựng một máy chủ tĩnh tại đây.

## Ba liên kết tượng trưng (bị .gitignore, KHÔNG nằm trong git)

Các mockup dùng đường dẫn tuyệt đối `/site/…`, `/assets/…`, `/data/…`, nên gốc
máy chủ phải là `docs/mockups/` và ba liên kết này phải trỏ về gốc repo:

```bash
cd docs/mockups
ln -sfn ../..    site    # /site/cz.css        → ../../src/cz.css  (gốc repo)
ln -sfn ../../assets assets # /assets/covers/…   → bìa trong assets/covers
ln -sfn ../../data   data   # /data/registry.json
```

Sau khi clone lại repo (hoặc dựng lại máy ảo) ba liên kết này mất, mockup sẽ
trắng trang hoặc 404 CSS — chạy lại ba lệnh trên là xong.

## Chạy

```bash
python3 -m http.server 8087 --bind 0.0.0.0 --directory docs/mockups
```

Mở:

- `http://127.0.0.1:8087/` — danh sách mockup
- `http://127.0.0.1:8087/tac-gia-r103/` — trang Tác giả bản gọn (đang chờ duyệt)
