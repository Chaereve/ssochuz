# Báo cáo · Kiểm tra toàn bộ trang admin & tinh chỉnh admin v2

Ngày: 2026-09-22 · Phạm vi: chỉ frontend admin, không đụng Worker/KV/schema.

## 1. Kết luận sau kiểm tra toàn bộ

- **Cutover đã đúng**: `/admin` và `/admin/` mở **admin v2** (qua `_redirects`, `server.py`,
  `tools/dev_server.py`); admin cũ còn nguyên ở `/admin-legacy` (file `admin-legacy.html`
  = `admin.html`) để rollback. `/admin.html` tự 308 về `/admin` như Cloudflare Pages.
- **Giao diện v2 từng vỡ ở tầng CSS**: v2 dùng vài class không tồn tại trong `cz.css`, nên
  sidebar và một số chi tiết render “trần” (không style). Đã sửa toàn bộ, liệt kê dưới đây.
- **Bản phát hành khớp mã nguồn**: `admin-v2.js`/`admin-v2.css` build lại từ `src/admin/`,
  `tools/check_src.js` xác nhận mọi bundle rút gọn khớp `src/`.
- **Kiểm thử: toàn bộ 50/50 bài trong `npm test` đều ĐẠT** (trước đó `t_admin_v2` và
  `t_adult` đỏ vì số liệu hardcode lỗi thời so với data).

## 2. Lỗi đã sửa

### Giao diện (CSS/layout)
| # | Lỗi | Sửa |
| --- | --- | --- |
| 1 | Sidebar v2 dùng `.aside` + `.admin-nav` — class không có style trong `cz.css` → sidebar vỡ, nút trần | `Layout.jsx` dùng lại `.snav` + `.admin-nav-label` + `.admin-nav-icon` như admin cũ; mobile tự thành thanh ngang cuộn ngang nhờ `cz.css` |
| 2 | Chip tình trạng dùng `st done/updating` — không có style, class `updating` không tồn tại | Đổi sang `pill run/done/soon` + chấm `.d`; fallback `statusCls` trả `run` thay vì `updating` |
| 3 | Thiếu style: `.pill.warn` (nhãn 18+), `.msgbar.info`, màu chấm `.chip.ok/.warn/.bad`, `.toast.info` | Bổ sung trong `admin-v2.css` |
| 4 | Checkbox “chọn tất cả/cột chọn” bị kéo full ô bảng | `.v2book-table input[type=checkbox]{width:auto}` |
| 5 | Bảng thư viện cuộn mà tiêu đề cột trôi | thead dính (`position:sticky`) trong `.v2table-wrap` |
| 6 | `.coverbox` của admin cũ (grid 2 cột, khung đứt nét) đè lên hộp bìa v2 → hộp bìa méo | Ghi đè bằng selector `.v2cover-preview .coverbox`, `.v2cover-inline .coverbox` |
| 7 | `.v2shell` tự đặt 260px → đè luật mobile 1 cột của `.ashell` | Bỏ override, theo đúng `.ashell` của `cz.css` |
| 8 | Không có công cụ đổi nền sáng/tối trên v2 | Thêm nút ở thanh đầu trang (gọi `CZ.themeToggle`) |
| 9 | Icon tab “Bình luận” dùng tên `comment` không tồn tại (rơi về icon info) | Đổi `chat`; tab Thư viện đổi `library` giống admin cũ |

### Chức năng (JS)
| # | Lỗi | Sửa |
| --- | --- | --- |
| 10 | Đổi chương: editor dựng từ state `html` cũ → flash nội dung chương trước | Dựng editor từ nội dung gốc của chương đang mở (`initRef`) |
| 11 | Autosave ghi “nháp ảo” ngay khi vừa đổi chương (chưa gõ gì đã hiện “có nháp”) | Chỉ ghi nháp khi nội dung khác bản gốc |
| 12 | Lưu/xoá/dời chương lỗi mạng → unhandled promise rejection (lỗi đỏ console) | Bắt lỗi, giữ nháp, toast báo lỗi (đã có sẵn phía store) |
| 13 | Thêm bộ xong form không reset → slug cũ báo “đã tồn tại” | Reset form sau khi tạo thành công (`createBook` trả kết quả) |
| 14 | Nút “Đọc dữ liệu chương” bấm không có tác dụng nếu lần đọc đầu thất bại (cache `null`) | `getBook` chỉ dùng cache khi có dữ liệu thật |
| 15 | Ô “chương?” trong Reset phiếu nhập chữ → gửi `NaN` lên Worker | Chỉ gửi số khi nhập đúng số nguyên |
| 16 | Dán/kéo ảnh vào editor mà upload lỗi → im lặng | Thêm toast báo lỗi |

### Kiểm thử
- `tests/t_admin_v2.js`: bỏ hardcode “63 bộ / 1.206 chương” (data giờ là 63 bộ / 1.211
  chương) — tính trực tiếp từ `data/registry.json` nên không còn lỗi thời khi data đổi.
- `tests/t_adult.js`: registry hiện để `slides: []` (hero rơi nhánh fallback) nên bài kiểm
  tra “hero đọc nhãn reason” đỏ — trồng 1 slide có reason khi data rỗng (giữ đúng ý đồ test).

## 3. File đã thay đổi

```
src/admin/components/Layout.jsx            sidebar đúng class, nút theme, icon đúng tên
src/admin/components/BookList.jsx          pill tình trạng + key danh sách
src/admin/components/ChapterEditor.jsx     hết flash chương cũ, nháp đúng, bắt lỗi ghi
src/admin/components/NewBook.jsx           reset form sau khi tạo
src/admin/components/OperationalPanels.jsx chặn NaN, key danh sách
src/admin/components/Overview.jsx          key danh sách
src/admin/main.jsx                         createBook trả kết quả, getBook hết kẹt cache null
src/admin/utils/format.js                  statusCls fallback → run/done/soon
src/admin/utils/richTextEditor.js          toast lỗi upload ảnh khi dán/kéo
src/admin/styles/admin-v2.css              viết lại: bỏ xung đột, bổ sung style thiếu
admin-v2.css / admin-v2.js / .map          bundle build lại (npm run build:admin-v2)
admin-v2.html                              bump version cache ?v=20260922b
tests/t_admin_v2.js                        số liệu tính từ data, hết hardcode
tests/t_adult.js                           trồng slide khi registry không có slides
src/admin/PARITY-CUTOVER.md                ghi nhận đợt tinh chỉnh
```

Không đổi: `worker/cms.js`, `admin.html`, `admin-legacy.html`, `admin.js`, `_redirects`,
`_headers`, schema KV/registry/book.

## 4. Những file/lệnh cần CHẠY THỦ CÔNG

### a) Trên máy (bắt buộc khi sửa mã nguồn `src/`)
```bash
npm install                      # 1 lần: esbuild + preact + tiptap (thư mục gốc)
cd tests && npm install          # 1 lần: jsdom + playwright cho bộ test
cd ..

npm run build                    # SINH LẠI bản phát hành ở thư mục gốc từ src/
                                 # (cz-*.js, admin.js, cz.css, admin-v2.js, admin-v2.css)
                                 # → phải chạy trước khi đẩy code lên Pages

npm test                         # chạy cả 50 bài kiểm thử (đang 50/50 ĐẠT)
```

### b) Xem thử trên máy
```bash
python3 tools/dev_server.py                # http://localhost:8080 — mô phỏng Cloudflare Pages
python3 tools/dev_server.py --port 9000    # đổi cổng tùy ý
python3 server.py                          # phương án cũ, cổng 8000 (đơn giản hơn)
```
Mở `http://localhost:8080/admin` → admin v2; `/admin-legacy` → admin cũ.

### c) Kiểm thử tuỳ chọn (cần trình duyệt thật)
```bash
cd tests && npx playwright install chromium   # 1 lần, tải Chromium cho Playwright
CHROMIUM_EXECUTABLE=$(npx playwright install --dry-run 2>/dev/null; echo) # hoặc để trống
node tests/t_layout_browser.js                # cần bật server.py trước
node tests/t_space_browser.js
```

### d) Trên production (bạn chủ site tự làm, không ai khác)
1. Đẩy code lên nhánh → Cloudflare Pages tự phát hành (Pages KHÔNG chạy `npm run build`
   thay bạn — bản bundle phải được commit sẵn).
2. Mở `/admin`, tải **backup JSON** (tab Cài đặt) trước lần ghi đầu tiên.
3. Nối Worker bằng **ADMIN_KEY** rồi smoke test lần lượt: đọc registry/KV → mở một bộ →
   lưu thử metadata bộ test → upload ảnh nhỏ → khóa/bỏ khóa bộ test → backup JSON →
   kiểm tra `/admin-legacy` vẫn dùng được.
4. Theo dõi 30 ngày; nếu cần rollback: revert luật `/admin → /admin-v2` trong `_redirects`.

## 5. Ghi chú

- Backend vẫn chưa có endpoint report `PATCH id/status` và `/api/admin/kv` chưa trả
  `writesToday` — tab Báo lỗi chỉ đọc, quota hiển thị ước tính client (đã có ghi chú UI).
- `admin-v2.js.map` giữ ngoài bundle (không nhúng source) — `t_admin_v2_budget` kiểm soát.
