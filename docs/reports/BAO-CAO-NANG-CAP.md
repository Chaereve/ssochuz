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
- Thêm mục **“Tủ truyện của bạn”**: chỉ hiện những bộ bạn đã bấm *Tủ truyện* / *Lưu*, có thanh tiến độ,
  nút đọc tiếp, bỏ từng bộ (✕) hoặc **Xoá hết**. Không tự thêm bộ nào.
- Hiệu năng: `preconnect` tới máy chủ ảnh, ảnh bìa hero `fetchpriority=high`, ảnh còn lại `loading=lazy` +
  `content-visibility`, giữ `width/height` để không nhảy bố cục.
- Một lỗi nhỏ khi dựng dữ liệu **không còn làm trắng cả trang** (có thông báo + link tải lại).

**Trang truyện (trong trang chủ)**
- Nút đọc ghi đúng chương đang đọc dở; chương đã đọc có dấu ✓; chương hiện tại được đánh dấu.
- **Nút Tủ truyện** (lưu/bỏ lưu, sáng lên khi đã lưu) và **nút Chia sẻ** (copy link bộ truyện) — trước đây
  hai nút này bấm không có gì xảy ra; nút *Theo dõi* rỗng đã bỏ.
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
- **Chỉ còn 2 bộ lệch số chương** so với thẻ Blogger cũ, và cả hai đã được giải thích tới từng chương:
  *Chain Baby* thẻ `14/14` nhưng có **15 chương** (thêm “Chương 0” — thẻ cũ không tính phần mở đầu),
  *Cô Vợ Hờ Đanh Đá Của Tôi* thẻ `5/40` nhưng có **7 chương** (2 phần Lời Mở Đầu + 5 chương đánh số).
  Các bộ còn lại khớp (thẻ `x/y` với `y` là tổng dự kiến, `x` là số chương đã đăng).
- 3 ghi chú về **tình trạng**: thẻ ghi “Tới chương 5” / “Tới Chương 8” / “Sắp dịch”, trang truyện hiển thị “Đang cập nhật”
  và “Sắp ra mắt” — bản gốc vẫn lưu nguyên văn trong `statusRaw` của từng bộ.
- Bảng “Cách đếm chương” trong `BAO-CAO-DU-LIEU.md` tách rõ: Lời Mở Đầu / Chương 0 / chương đánh số / Ngoại truyện —
  để bất kỳ ai cũng kiểm lại được con số mà không phải tin lời.
- **Số liệu đọc/bình chọn**: **không còn lấy từ Firebase** (Firestore cũ chặn quyền đọc 403 nên số chết từ lâu).
  Từ bản worker 1.4.0, Worker **tự đếm** lượt đọc (`POST /api/view`) và bình chọn (`POST /api/vote`) rồi lưu trên KV;
  web đọc qua `GET /api/stats`. Số cũ của site Firebase nạp về KV **một lần** bằng nút *Nhập số cũ từ Firebase*
  trong `/admin` (hoặc `--import-firebase` / `--stats-seed`). Chi tiết: `worker/README.md` §5.

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
| 3 nút trong trang truyện bấm không có gì | người dùng tưởng đã lưu/theo dõi nhưng thực ra không lưu gì | đã sửa |
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
3. Deploy lại `worker/cms.js` bản 1.4.0 (bản đang chạy là 1.3.0 — chưa có `/api/view`, `/api/vote` và đăng nhập Google còn lỗi).
4. Muốn giữ số lượt đọc/phiếu cũ: `/admin` → **Số liệu** → **Nhập số cũ từ Firebase** (cần mở quyền đọc Firestore 1 lần),
   hoặc bỏ qua — web vẫn đếm số mới bình thường. Xem số bằng `python3 tools/push_to_kv.py --api ... --stats`.
4. Từ đó: viết bài trên Blogger → `/admin` → **⬇ Lấy từ Blogger & đăng**. Hết.

## 7. Còn có thể làm tiếp (nếu bạn muốn)

- Nút “Theo dõi” (nhận thông báo khi bộ có chương mới) — cần Worker gửi thông báo mới làm thật được.
- Gửi bình luận/lượt thích qua Worker để lưu chung (hiện chỉ lưu trong máy từng người).
- Chia nhỏ `data/book/*.json` thành từng chương để tải chương nhanh hơn (~27 MB hiện tại).
- Xoá code cũ không còn dùng trong theme Blogger (`blogger-theme/`) nếu bạn không cần build theme nữa.
