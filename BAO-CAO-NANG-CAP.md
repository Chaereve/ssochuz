# Báo cáo nâng cấp chuseoz

*Cập nhật: 12/09/2026 · commit `9bf309d` · nhánh `arena/01a0968c-ssochuz`*

---

## 1. Chỗ đăng bài mới — không còn đi qua GitHub

Trước đây: sửa dữ liệu → commit → GitHub Actions → Cloudflare build → deploy (vài phút, tốn phút CI).
Bây giờ: **trang quản trị ghi thẳng lên Cloudflare KV qua Worker** → người đọc thấy sau 1–2 giây.

```
/admin  ──PUT──▶  Worker (worker/cms.js)  ──▶  Cloudflare KV
                        ▲                          │
   index.html / reader.html ──GET───────────────────┘
```

### Bạn cần làm 1 lần (khoảng 5 phút, hướng dẫn chi tiết trong `worker/README.md`)

1. Cloudflare → **Workers & Pages** → tạo Worker `chuseoz-cms` → dán `worker/cms.js` → Deploy.
2. **Settings → Variables and Secrets**: `ADMIN_KEY` (Secret, chuỗi dài), `BLOG=https://chuseoz.blogspot.com`,
   `FIREBASE_PROJECT=chuseoz-library`, `ALLOW_ORIGIN=<domain web của bạn>`.
3. **Settings → Bindings → KV namespace**, tên biến đúng chữ **`CZ_KV`**.
4. Mở `cz-config.js`, dán `window.CZ_API = 'https://chuseoz-cms.xxx.workers.dev'` → deploy lại **một lần**
   (sau đó sửa dữ liệu không cần deploy nữa).
5. Vào `/admin` → dán URL Worker + `ADMIN_KEY` → **Kiểm tra & kết nối** → bấm **↑ Nạp dữ liệu lên KV**
   (hoặc chạy `python3 tools/push_to_kv.py --api ... --key ...`).

### Làm được gì trong `/admin`

| Việc | Cách làm | Hiện trên web |
|---|---|---|
| Đăng chương mới | tab **Đăng chương nhanh** → dán nội dung → Đăng | vài giây |
| Đăng mà không cần copy–paste | tab đó → **⬇ Lấy từ Blogger & đăng** (dán link, hoặc để trống để lấy bài mới nhất khớp tên truyện) | vài giây |
| Sửa lại bài đã đăng | **⬇ Lấy & thay chương cuối** | vài giây |
| Sửa thông tin bộ (bìa, mô tả, 18+, tình trạng) | tab **Thư viện** → *Sửa* → Lưu | vài giây |
| Sửa/xoá/đổi thứ tự chương | tab **Sửa truyện** (↑ ↓ ✎, `Ctrl+S`) | vài giây |
| Đổi tình trạng nhiều bộ cùng lúc | tab **Thư viện** → tick chọn → Áp dụng | vài giây |
| Thêm bộ mới | tab **Thêm bộ** | vài giây |
| Slide trang chủ + lịch ra chương | tab **Cài đặt** | vài giây |
| Số liệu thật (lượt đọc/bình chọn) | tab **Số liệu** → Đọc lại & xoá cache | vài giây |
| Sao lưu / phục hồi toàn bộ | tab **Cài đặt** | — |

Phím tắt: `1…6` đổi tab, `Ctrl+K` tìm nhanh, `Ctrl+S` lưu.
Nếu chưa nối Worker, admin vẫn xem được dữ liệu và có thể **Xuất JSON** để nạp thủ công.

---

## 2. Giao diện · animation · hiệu năng từng trang

**Trang chủ**
- Thêm kệ **“Đọc tiếp”**: chỉ hiện những bộ bạn thực sự đang đọc dở, kèm thanh tiến độ và nút nhảy đúng chương kế tiếp
  (dữ liệu lấy từ tiến độ đọc trong máy — không phải số đoán).
- Thanh thống kê đếm số khi cuộn tới; các mục trong trang hiện dần; thẻ truyện hiện theo nhịp.
- Hiệu năng: `preconnect` tới máy chủ ảnh, ảnh bìa hero `fetchpriority=high`, ảnh còn lại `loading=lazy` +
  `content-visibility`, giữ `width/height` để không nhảy bố cục.
- Một lỗi nhỏ khi dựng dữ liệu **không còn làm trắng cả trang** (có thông báo + link tải lại).

**Trang truyện (trong trang chủ)**
- Nút đọc ghi đúng chương đang đọc dở; chương đã đọc có dấu ✓; chương hiện tại được đánh dấu.
- Tìm chương, sắp xếp, phân trang, liên kết bài gốc Blogger.

**Trang đọc**
- Sửa lỗi **chuyển chương bị đứng** (biến `reduce` bị thiếu — lỗi này làm chết nút chương sau / phím →).
- Bỏ chữ mẫu “Lunar Secret / 39 chương · đã đọc 11/39” khỏi khung tĩnh.
- **Truyện chưa có chương** giờ báo rõ “đang ở trạng thái Sắp ra mắt” + link theo dõi trên Blogger, thay vì khung đọc rỗng.
- **Tủ truyện**, **copy link chia sẻ**, **báo lỗi chương** (mở đúng phần bình luận bài gốc) hoạt động thật.
- Thanh tiến độ đọc, thời gian đọc tính từ nội dung thật, tuỳ chỉnh cỡ chữ/nền/kiểu chữ/độ rộng/phân trang.

**Trang quản trị** — giao diện mới, tiếng Việt, có trạng thái “có thay đổi chưa lưu”, cảnh báo khi rời trang, toast.

---

## 3. Dữ liệu truyện — lấy từ blogspot cũ, không có số tự đặt

Chạy `python3 tools/audit_data.py --md BAO-CAO-DU-LIEU.md` (báo cáo đầy đủ ở `BAO-CAO-DU-LIEU.md`):

| Mục | Số |
|---|---|
| Số bộ trong thư viện | 62 |
| Thẻ truyện đối chiếu được từ Blogger | 62 |
| Tổng chương có nội dung thật | 1198 |
| Bộ chưa có chương (giữ “Sắp ra mắt”, khoá nút đọc) | 17 |
| Số bộ trong BXH dùng số tự đặt | **0** |
| Lỗi cần sửa | **0** |

- Số chương khai báo == số chương thật trong `data/book/*.json` == số chương hiện trên trang: **0 lệch / 62 bộ**.
- Mọi bộ đều có `statusRaw` (nguyên văn tình trạng trên thẻ Blogger) để đối chiếu về sau.
- **5 chênh lệch** giữa thẻ Blogger (cũ) và trang truyện (đang dùng) đã được ghi lại rõ ràng trong báo cáo —
  ví dụ thẻ ghi `14/14` nhưng trang đã có 15 chương, hoặc thẻ ghi “Tới Chương 8” trong khi trang ghi “Đang cập nhật”.
  Bộ nào chưa có chương thì hiện “Sắp ra mắt”, không bịa số.
- **Số liệu đọc/bình chọn**: chỉ lấy từ Firebase cũ (`chuseoz-library`). Hiện Firestore đang chặn quyền đọc (403) nên web
  **không hiện số nào** và ghi rõ lý do; BXH tạm xếp theo số chương + ngày cập nhật.
  Mở quyền đọc theo mục 5 trong `worker/README.md` là số thật hiện ngay (cache 10 phút).

---

## 4. Lỗi đã tìm và sửa

| Lỗi | Ảnh hưởng | Trạng thái |
|---|---|---|
| Trang đọc thiếu biến `reduce` | chuyển chương/nút kế tiếp bị lỗi JS, không sang chương | đã sửa |
| Chữ mẫu “Lunar Secret… 39 chương · đã đọc 11/39” | hiện số sai cho bộ trống, gây hiểu là số thật | đã sửa |
| Truyện 0 chương vẫn mở khung đọc rỗng | người đọc tưởng lỗi | đã sửa (báo rõ + link Blogger) |
| `id` trùng `dReadFrom` (hero và trang truyện) | nút đọc trong trang truyện cập nhật nhầm chỗ | đã sửa |
| `id` trùng `fStatus` (bộ lọc và ô sửa) | bộ lọc tình trạng ở admin lấy sai giá trị | đã sửa |
| `id` trùng `listName` (nút và mục lục) | tên bộ trong mục lục bị ghi đè | đã sửa |
| `/truyen/<slug>/` phụ thuộc `cz-data.js` | mạng chập là trang đọc chết | đã thêm bản dự phòng |
| 6 workflow tạm còn sót | chạy tốn CI, commit rác mỗi lần chạy | đã xoá |
| `data/book/*` không khớp registry | nguy cơ hiện sai số chương | đã soát: 0 lệch |

---

## 5. Kiểm thử

`tests/` chạy trên máy bằng jsdom — 4 bài, đều đạt:

```bash
cd tests && npm i     # 1 lần
node run.js
```

✓ `t_home.js` (kệ Đọc tiếp, BXH, lọc/tìm/phân trang, mở trang truyện, truyện 0 chương phải khoá nút đọc)
✓ `t_reader.js` (nạp đúng bộ theo URL, chuyển chương bằng nút và phím, lưu tiến độ, tủ truyện, cài đặt đọc)
✓ `t_locked.js` (truyện “Sắp ra mắt” báo đúng, không lộ nội dung bộ khác)
✓ `cf_admin_test.js` (sai khoá phải chặn; đăng chương nhanh; lấy từ Blogger; sửa truyện/chương; thêm truyện;
đổi tình trạng hàng loạt; lưu slide/lịch; Firebase bị chặn thì **không hiện số bịa**; đồng bộ Blogger)

---

## 6. Việc của bạn (theo thứ tự)

1. Dán URL Worker vào `cz-config.js` (bước 4 ở mục 1) — đây là bước duy nhất phải deploy lại code.
2. Vào `/admin` → **Nạp dữ liệu lên KV** → kiểm tra `python3 tools/push_to_kv.py --api ... --verify`.
3. Mở quyền đọc Firestore (`chuseoz-library`) theo mục 5 của `worker/README.md` → bấm **Đọc lại & xoá cache** để có số thật.
4. Từ đó: viết bài trên Blogger → `/admin` → **⬇ Lấy từ Blogger & đăng**. Hết.

## 7. Còn có thể làm tiếp (nếu bạn muốn)

- Nút “Tủ truyện” riêng trên trang chủ (hiện chỉ lọc theo tiến độ đọc trong máy).
- Gửi bình luận/lượt thích qua Worker để lưu chung (hiện chỉ lưu trong máy từng người).
- Chia nhỏ `data/book/*.json` thành từng chương để tải chương nhanh hơn (~27 MB hiện tại).
- Xoá code cũ không còn dùng trong theme Blogger (`blogger-theme/`) nếu bạn không cần build theme nữa.
