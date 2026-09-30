# BÁO CÁO · Sửa lỗi link truyện 404 + bỏ hết phím tắt ở trang quản trị

Ngày: 17/09/2026

---

## 1) "Một số bộ truyện bị lỗi link, không truy cập được" — NGUYÊN NHÂN THẬT

### 1a. Cloudflare Pages bỏ im lặng phần lớn luật ĐỘNG trong `_redirects`

Trạng cũ: `_redirects` có **221 luật**, trong đó **71 luật động** (luật có dấu `*`):
6 luật giấu tệp nội bộ + `guide/*`, cộng **62 luật `/truyen/<slug>/*`** (mỗi bộ
một luật để mở trang đọc `/truyen/<slug>/chuong-N/`), cộng 2 luật chung
`/truyen/*`, `/reader/*` nằm CUỐI tệp.

Cloudflare Pages chỉ áp đúng **một số luật động đầu tệp** (đo thực tế trên
ssochuz.pages.dev: luật số ~18–21 còn chạy, luật số ~46 đã bị bỏ), phần còn
lại bị **bỏ im lặng, không báo lỗi anywhere**. Hậu quả:

| URL | Trước | Sau sửa |
|---|---|---|
| `/truyen/chain/chuong-2/` (chain ~ luật 18) | 200 ✓ | 200 ✓ |
| `/truyen/enemies-with-benefits/chuong-2/` (~ luật 46) | **404** | 200 ✓ |
| `/truyen/<slug>/chuong-N/` của ~40 bộ cuối danh sách | **404** | 200 ✓ |
| `/reader/<slug>/` (link đời cũ) | **404** | 200 ✓ |
| `/truyen/<slug>/` (trang từng bộ) | 200 ✓ (tệp tĩnh) | 200 ✓ |
| bộ mới chỉ có trên KV, chưa deploy tệp | 404 | 200 (vào thẳng trang đọc được) |

### 1b. Bộ "Vượt Khỏi Đường Chân Trời - endless blue beyond (Special)" lệch slug

- Repo: `vuot-khoi-uong-chan-troi-endless-blue_01775777241` (dấu gạch dưới `_`)
- KV (dữ liệu thật mà người đọc thấy): `vuot-khoi-uong-chan-troi-endless-blue-01775777241` (dấu gạch ngang `-`)

Trang chủ/ thư viện lấy slug từ KV nên sinh link `-01775777241/` → URL này
không có tệp tĩnh, không có luật riêng → **404 thật**. Link ngược lại
(`_01775777241/`) thì mở trang nhưng **không có chương** vì kho chương trên KV
đếm theo slug gạch ngang.

### Cách sửa

1. **Đồng bộ repo theo KV** (chiều ngược sẽ làm hỏng link đang live):
   - đổi tên `truyen/vuot-..._01775777241/` → `truyen/vuot-...-01775777241/`;
   - đổi tên `data/book/vuot-..._01775777241.json` + trường `slug` trong tệp;
   - sửa `slug` trong `data/registry.json`;
   - chạy lại `npm run og` (sinh lại 62 trang `truyen/<slug>/index.html` + khối
     luật OG) và `tools/build_sitemap.py` (sitemap.xml).
   - Thêm **301 từ slug cũ → slug mới** (kể cả link chương cũ) để link đã chia
     sẻ / đã lập chỉ mục không 404.
2. **Tái cấu trúc `_redirects`** cho khớp giới hạn thật của Pages:
   - luật **TĨNH** (không có `*`) đứng trước: giấu tệp nội bộ, 301 slug cũ,
     URL sạch (`/truyen.html`, `/truyen/`, `/reader…`, `/my-space/`, `/profile/`,
     `/guide…`), và **2 luật tĩnh cho mỗi bộ truyện** (`/truyen/<slug>` và
     `/truyen/<slug>/`) do `tools/build_og.mjs` sinh — nhiệm vụ giữ trang từng
     bộ KHÔNG trúng luật chung, để bot Zalo/FB/Telegram vẫn đọc thẻ OG trong
     `truyen/<slug>/index.html`;
   - luật **ĐỘNG** dồn về cuối, giảm từ 71 xuống **10 luật**:
     6 luật giấu thư mục nội bộ + `/guide/*` + 301 slug cũ kèm đường dẫn con +
     **`/truyen/* → /truyen 200`** + `/reader/* → /truyen 200`.
   - Đánh đổi đã cân nhắc: URL chương `/truyen/<slug>/chuong-N/` giờ mở bằng
     shell chung (không có thẻ OG riêng từng chương như thiết kế cũ) — nhưng
     thiết kế cũ thì **404 với ~2/3 số bộ**, nên "chạy được" thắng "đẹp".
     Trang TRUYỆN (URL được chia sẻ nhiều nhất) vẫn giữ nguyên OG đầy đủ.
3. `tools/build_og.mjs`: không còn sinh luật `/truyen/<slug>/*` (nguyên nhân
   nổ luật động); chỉ sinh 2 luật tĩnh mỗi bộ. Có ghi chú trong mã.
4. `tests/t_chapter_url.js` (mục F): đổi kỳ vọng sang luật chung mới.
   `tests/t_devserver.js`: giữ nguyên — mô phỏng dev_server vẫn khớp Pages.

> **Nhớ:** thêm bộ truyện mới thì chạy `npm run og` + `python3 tools/build_sitemap.py`
> trước khi deploy, để trang bộ mới có tệp tĩnh + thẻ OG. KV-only (chưa deploy)
> vẫn đọc được nhờ luật `/truyen/*` — nhưng chưa có OG cho bot.

---

## 2) "Đừng thêm bất kì phím tắt nào ở admin panel"

Đã **xoá toàn bộ phím tắt** trong `src/admin.js`:

- `Ctrl/Cmd+S` tự lưu, `Ctrl/Cmd+K` nhảy ô tìm kiếm;
- bấm số `1–9, 0` để đổi tab, `v` (phiếu bầu), `r` (báo lỗi).

Muốn lưu/đổi tab: bấm nút trên giao diện như bình thường. Giữ lại (không phải
phím tắt, là thao tác gõ chữ thường): Enter trong ô URL/khoá để kết nối, Enter
trong ô tìm chương, Tab chèn 2 dấu cách trong ô soạn chương.

Kèm theo:

- `tests/t_flows.js`: thay bài test Ctrl+S cũ bằng bài test **ngược lại** —
  bấm `Ctrl+S, Ctrl+K, 1, 5, 0, v, r` ngoài ô nhập thì phải KHÔNG đổi tab,
  KHÔNG tự lưu (khoá yêu cầu của chủ trang bằng kiểm thử).
- Sửa luôn 1 lỗi thật bắt được khi chạy test quản trị: xoá một bộ đang nằm
  trong **lịch cập nhật** thì "Lưu cài đặt" văng lỗi
  `Lịch có slug không tồn tại`. Giờ đây: xoá bộ → tự lecken dòng lịch của bộ đó;
  nếu lịch còn dòng lạ thì lưu vẫn chạy, chỉ toast cảnh báo và bỏ dòng lạ.

---

## Kiểm thử

`node tests/run.js` — **44/44 bài ĐẠT** (trước khi sửa: `cf_admin_test.js` lỗi
do lỗi lịch ở trên).

Các đường dẫn chính đã bấm thử (máy chủ xem thử mô phỏng Pages):
`/`, `/truyen`, `/truyen/`, `/truyen.html`, `/truyen/<slug>/`,
`/truyen/<slug>/chuong-N/`, `/truyen/<slug cũ>/` (301 → slug mới),
`/truyen/<slug cũ>/chuong-1/` (301 giữ nguyên số chương), `/reader/<slug>/`,
`/admin`, `/guide`… đều đúng mã 200/301/404 như mong đợi.
