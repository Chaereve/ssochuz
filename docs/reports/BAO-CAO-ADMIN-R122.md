# Báo cáo · Dựng lại giao diện quản trị (admin v3 — “Bàn biên tập”)

Ngày: 2026-11-02 · Vòng 122 · Phạm vi: `src/admin/**` (CSS + hai component), không đụng
Worker, KV, schema dữ liệu hay trang công khai.

Mockup: `docs/mockups/admin-r122/index.html`
(xem bằng `python3 -m http.server` ở gốc repo → `/docs/mockups/admin-r122/`).

## 1. Vấn đề của bản trước

Bản `admin.css` cũ không sai ở từng màn hình, nhưng nó **khai một sản phẩm khác** với
trang đọc:

| | Trang công khai (`cz.css`) | Admin cũ (`admin.css`) |
| --- | --- | --- |
| Nền | giấy ấm `#14110e` / `#1e1915` | tự khai `#0F1216`, `#11161B` (xám lạnh) |
| Nhấn | mực hồng `#e0859b` | teal `#4FB6A5` |
| Chữ | `--font-head` có chân cho tiêu đề | Inter/system cho mọi thứ |
| Rail | — | 236px | 
| Topbar | `--hdr-h: 60px` | 56px |

Cộng thêm: tệp có **45 lớp vá nối tiếp** (`v8` → `v43`) ở cuối, kể cả biến không hề
tồn tại (`--a-tx`), những luật chỉ để đè luật của `cz.css` (`.abar`, `.amain`,
`#tabs button`, `.snav`), và nhiều luật được phát lại 3–8 lần cho cùng một class
(`.v2authors`, `.v2up-preview`, `.v2switch`, `.v2form>section .fl`…). Hệ quả: sửa một
chi tiết phải thêm một lớp vá mới, và `admin.css` phình lên 78,5 kB (ngưỡng cảnh báo 70 kB).

## 2. Cách làm

Thay vì vá tiếp, `src/admin/styles/admin.css` được **viết lại một lượt** thành 5 mục:

1. **Token** — không tự định nghĩa màu nữa; `body.admin` chỉ đặt bí danh
   `--a-bg: var(--bg)`, `--a-acc: var(--acc)`… trỏ vào token của `src/cz.css`.
   Đổi tông quản trị = đổi `:root` của `cz.css`, cả hai bên đổi theo.
2. **Khung** — rail 248px (thu gọn 64px), topbar 60px (khớp `--hdr-h`), đệm tờ giấy
   28/22/16px theo ba khổ.
3. **Thành phần** — nút, ô nhập, nhãn, ô số, bảng, thanh lọc, msgbar, chân trang…
4. **Màn hình** — cổng đăng nhập, tổng quan, thư viện, sửa bộ, soạn chương, các bảng
   vận hành (bình luận/báo lỗi/phiếu/thống kê/log/cài đặt).
5. **Responsive** — ≥1280 rộng · 901–1279 hẹp vừa · ≤900 rail thành ngăn kéo.

Mọi quy tắc nằm dưới `body.admin` nên không chạm trang công khai. Hai chỗ từng phải
chống luật `cz.css` (`.abar`, `.amain`) nay **gỡ khỏi markup**, không cần luật đè nữa.

### Tinh chỉnh cấu trúc (đợt hai)

Sau khi bảng màu và khung đã thống nhất, ba chỗ còn lệch nhịp được chỉnh ở tầng
markup — chỗ mà CSS một mình không sửa được:

| Màn | Trước | Sau |
| --- | --- | --- |
| Sửa bộ | Ba tầng tiêu đề xếp chồng: khung vẽ “Sửa bộ”, trong pane vẽ “Sửa metadata: …”, rồi tới thanh tab | Khung **không** vẽ đầu trang cho tab này; pane vẽ một đầu trang duy nhất — nhãn nhóm, tên bộ làm tiêu đề, dòng phụ `slug · số chương · ngày cập nhật`, nút quay lại và huy hiệu dồn sang phải. Hai tab dính ngay dưới, đường kẻ của thanh tab thay cho đường kẻ đầu trang. |
| Chương & xuất bản | Bốn hàng đợi là bốn thẻ lớn xếp dọc; thẻ trống chiếm đúng chỗ của thẻ có việc | `.v2queues`: bốn khối cùng cỡ đứng cạnh nhau (2 cột khi đủ chỗ), **số việc hiện ở đầu thẻ**; thẻ rỗng vẫn giữ chỗ nên bố cục không nhảy |
| Tác giả | Ô tìm full-width nằm riêng một dòng, đẩy bảng xuống | Ô tìm nằm ngay trên hàng tiêu đề thẻ, cạnh con số `đang xem/tổng` |
| Tổng quan | Tiêu đề trang trùng với tên nhóm (“Tổng quan / Tổng quan”) | Tiêu đề là “Hôm nay”, nhãn nhóm phía trên vẫn là “Tổng quan” |

### Thay đổi ở markup

| Tệp | Thay đổi | Lý do |
| --- | --- | --- |
| `components/Layout.jsx` | Bỏ thanh breadcrumb `Admin › Thư viện`; đầu trang còn **nhãn nhóm (eyebrow) + tiêu đề + một câu mô tả** | Breadcrumb lặp đúng hai chữ đã có ngay dưới nó |
| `components/Layout.jsx` | `<header class="v2top abar">` → `v2top`, `<main class="amain v2main">` → `v2main` | Hai class đó của `cz.css` ép `max-width`/`padding` riêng, chỉ sinh ra luật chống luật |
| `components/Layout.jsx` | Chân sidebar: một câu giải thích thay cho dòng nhắc cũ | Nói rõ điều kiện ghi KV thay vì “Ghi KV chỉ khi đã nối ADMIN_KEY” |
| `components/Overview.jsx` | Dải số liệu **không bọc trong thẻ**; thêm hàng tiêu đề nhỏ + nút “Đọc lại dữ liệu”; ô quota/lượt đọc ghi rõ nguồn | Số liệu là phần mở đầu trang, không phải một khối nội dung; “0” trần không cho biết Worker có counter hay không |

## 3. Những gì **không** đổi

- Tên và cấu trúc class mà test bám: `v2app`, `v2side`, `v2side-toggle`, `v2side-close`,
  `v2quota` (+ `warning/critical/blocked`), `v2search` + `v2search-suggest`, `v2pane`,
  `v2filters`, `v2book-table` (kèm `data-lb` cho thẻ trên điện thoại), `v2chapter-editor`,
  `v2gate`, `msgbar`, `tile`, `card2`, `v2authors`, `v2itemrow`, `v2donepill`,
  `v2reptabs`, `v2okbtn` — danh sách đầy đủ ở `docs/reports/ADMIN-CSS-INVENTORY.md`.
- Luật thu gọn rail vẫn nằm trong `@media(min-width:901px)` với
  `.v2app.v2collapsed .snav button{justify-content:center…}` (test `t_admin_sidebar.js`
  đọc thẳng CSS), và mọi nút điều hướng vẫn bọc nhãn trong `<span>` (icon nằm trong
  `svg.admin-nav-icon`).
- Hành vi: tab, phím tắt Ctrl+K/S/N, quota, ghi KV, soạn chương, nhập .docx, xuất bản.

## 4. Kiểm chứng

| Hạng mục | Kết quả |
| --- | --- |
| `node tests/run.js` | **39/39 tệp ĐẠT** |
| `node tools/audit_a11y.mjs` | **24 màn hình, 0 vi phạm axe-core**, đạt chuẩn Lighthouse tĩnh |
| `node tools/check_src.js` | bản phát hành khớp `src/` |
| `node tools/check_html.js` | HTML sạch, `_redirects` 169 luật không vòng lặp |
| `node tools/check_version.mjs` | phiên bản thống nhất 1.20.0 |
| `admin.css` | **78,5 kB → 66,4 kB** (79% trần 84 kB) |
| `admin.js` | 201,0 kB (77% trần 260 kB); gzip khởi tạo 113 kB (trần 190) |

## 5. Ghi chú cho lần sửa sau

- Thêm luật mới thì thêm **vào đúng mục 1–5**, không nối vá ở cuối tệp.
- Đừng viết mã màu rời trong `admin.css`; đổi ở `:root` của `src/cz.css`.
- `.v2overview .tiles` là lưới 5 cột cố định (4/3/2/1 theo khổ) — đúng 10 ô số, không
  dùng `auto-fit` để tránh hàng cuối lẻ.
- Kiểm tra tương phản khi đổi tông: `--dim` đã được nâng lên `#8a8174` vì lý do này.
