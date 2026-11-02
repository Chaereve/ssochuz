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

## Mockup quản trị (vòng 122) — dùng đường dẫn TƯƠNG ĐỐI

`admin-r122/index.html` tự chứa CSS (chép `src/admin/styles/admin.css` + token
của `cz.css`) và trỏ ảnh bằng `../../../assets/…`, nên mở được bằng máy chủ đặt
ở **gốc repo**, không cần ba liên kết trên:

```bash
python3 -m http.server 8090 --bind 0.0.0.0      # ở gốc repo
# http://127.0.0.1:8090/docs/mockups/admin-r122/
```

File này không phải hình vẽ lại: mỗi “màn hình” là markup admin **chụp từ
chính app** (jsdom) rồi dán vào trang cùng bảng CSS thật.
