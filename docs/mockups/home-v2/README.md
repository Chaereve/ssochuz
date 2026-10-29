# Phương án 2 · “Tạp chí” — bản 2

**Mockup:** `docs/mockups/home-v2/index.html` → `http://127.0.0.1:8081/docs/mockups/home-v2/index.html`
Nút **Desktop / Tablet / Mobile** ở thanh trên đổi bề rộng khung (1180 / 834 / 390).
Bản 1 (ba phương án E1/E2/E3) vẫn còn ở `index-r27.html` để đối chiếu.

Dữ liệu: 67 bộ thật trong `data/registry.json`, bìa thật trong `assets/covers/`.
Con số **minh hoạ cho phần trình bày**: lượt đọc tuần, điểm ★, chương đang đọc dở
(registry không có ba loại này). Ngày cập nhật, số chương, trạng thái, danh sách
`editorChoice`, lịch ra chương là **dữ liệu thật**.

---

## 1. Bản 1 sai ở đâu

| # | Chỗ | Lỗi |
|---|---|---|
| 1 | “Top tuần” | Đặt **toàn chiều rộng** thành 5 dòng ⇒ mỗi dòng dài 1100px, chữ lọt thỏm, trang bị “thủng” ở giữa. |
| 2 | Hai dải trên | `Đọc tiếp` và `Mới cập nhật` chạy hết chiều ngang, tới `Thư viện` mới tách hai cột ⇒ trục dọc gãy khúc, không có lý do bố cục. |
| 3 | Cột phụ | Chỉ có 3 khối ngắn (~780px) đứng cạnh lưới thư viện cao ~1600px ⇒ **trống gần 800px** bên phải. |
| 4 | Lặp bìa | Lưới thư viện sắp theo “Mới cập nhật” nên 6 bìa đầu lưới **trùng đúng 6 bìa** ngay phía trên; thêm 3 bộ nữa trùng với `Đọc tiếp` và `Xếp hạng` ⇒ 5 bộ lặp lại 2–3 lần trong một màn hình. |
| 5 | Cỡ bìa | `Mới cập nhật` 176px nhưng lưới 181px, cột phụ 104px ⇒ ba thang bìa lệch nhau. |
| 6 | Đầu mục | Mục toàn trang 21px, đầu mục cột phụ 16px nhưng dùng **cùng** kiểu; hàng đầu mục không có đường dẫn nhịp. |
| 7 | Sơ sài | Cột phụ 3 khối × 3–6 dòng, không có gì để mắt bám: thiếu số liệu, thiếu “hôm nay”, thiếu chân trang. |

## 2. Bản 2 làm gì

### Nhịp trang: 2 dải → 1 vùng hai cột

```
Đọc tiếp        3 thẻ ngang · 84px bìa · thanh tiến độ · %  · còn N chương
Mới cập nhật    6 bìa 174px · mỗi bìa MỘT nhãn (Ch. N / Trọn bộ N) · tác giả · ngày
───────────────────────────────────┬──────────────────────────────
THƯ VIỆN (788px)                   │ cột phụ 300px (dính khi cuộn)
 tìm · Năm · Sắp xếp · lưới/danh sách│  Xếp hạng tuần   5 dòng + ▲▼
 chip trạng thái kèm số             │  Lịch ra chương  7 dòng, “hôm nay” son
 lưới 4 cột bìa 185px               │  Đáng xem        3 dòng + ★
 12 bộ/trang · phân trang 6 trang   │  Vừa hoàn thành  3 dòng + x/y
───────────────────────────────────┴──────────────────────────────
chân trang
```

- **Đường kẻ dọc** ở mép trái cột phụ chạy hết chiều cao vùng thư viện: cột phụ
  ngắn hơn lưới vẫn đọc là “cột báo”, không phải chỗ trống.
- **Đường kẻ mảnh** nối tiêu đề mục với “Xem tất cả ›” ở cả hai dải trên — nhịp
  tạp chí, không thêm hộp.
- Ba thang bìa duy nhất: 185 (lưới) · 174 (dải mới) · 84 (đọc tiếp) + 30–36 (dòng phụ).

### Chống lặp bìa: mỗi bộ chỉ xuất hiện ở MỘT khối phía trên lưới

`Đọc tiếp` 3 bộ → `Mới cập nhật` 6 bộ → `Xếp hạng` 5 bộ → `Đáng xem` 3 → `Vừa hoàn thành` 3:
**27 bộ khác nhau**, không bộ nào lặp. Lưới mặc định sắp theo **`editorChoice` thật**
(12 bộ biên tập chọn) nên trang 1 của lưới cũng không trùng dải phía trên.

### Cân lại phân bổ

| | Bản 1 | Bản 2 |
|---|---|---|
| Cột phụ | 780px cạnh 1600px lưới | 1150px cạnh 1260px |
| Khoảng trống cuối cột phụ | ~800px | ~110px, có đường kẻ dọc đỡ |
| Bìa lặp trên màn hình đầu | 5 bộ | 0 |
| Thang bìa | 3 thang lệch | 3 thang có chủ đích |

### Nội dung cột phụ (đủ để không sơ sài)

1. **Xếp hạng tuần** — số thứ tự serif (1 son), bìa 36, tên 2 dòng, `12.480 lượt ▲3`.
   ▲ xanh / ▼ đỏ như bảng xếp hạng của WEBTOON.
2. **Lịch ra chương** — 7 dòng theo thứ, ngày thật của tuần minh hoạ (02–08/11/2026),
   dòng “hôm nay” tô son; bộ nào ra nhiều thứ thì hiện ở từng thứ.
3. **Đáng xem** — 3 dòng, điểm ★ bên phải.
4. **Vừa hoàn thành** — 3 dòng, `10/10` màu xanh.

### Lưới thư viện

Giữ nguyên thanh lọc D1 đã chốt (vòng 23): tìm kiếm + Năm + Sắp xếp + lưới/danh sách,
hàng chip trạng thái **kèm số lượng thật** (67 / 46 / 4 / 17 / 29), đếm `1–12 / 67`,
phân trang 6 trang. Lọc và tìm chạy thật trong mockup (gõ “nguoi” ra 2 bộ, gõ “Lunar” ra 1).

## 3. Lên bản thật — 7 bước

1. `index.html`: bỏ `.bento` 12 cột; thay bằng hai `<section class="band">` (Đọc tiếp,
   Mới cập nhật) rồi `<section class="band">` chứa `.side` = `.pane` + `.railCol`.
2. `#resumeSec` lên trước, `#newRail` giữ 6 bìa; `#bxh` chuyển vào cột phụ thành danh
   sách 5 dòng (`#rank .rank` vẫn đủ 5, `#rankSummary` giữ nguyên, `sr-only`).
3. `#sched` chuyển vào cột phụ (7 dòng), `#worthRail` 3 dòng, thêm khối “Vừa hoàn thành”.
4. `#thu-vien` giữ D1, đổi `grid-template-columns` sang `auto-fill minmax(170px, 1fr)`,
   phân trang 12 bộ/trang, thêm `#libSub` hiện “1–12 / 67”.
5. Sắp xếp mặc định của lưới = `editorChoice` rồi tới `updated`; nhãn select = “Đề xuất”.
6. CSS: thay ba nhóm `body[data-w=…]` của mockup bằng media query **1100 / 900 / 620px**;
   xoá CSS v3 cũ không dùng (`.btile`, `.bhead`, `.ranklist`, `.week…`).
7. Ngân sách: phần mới ~6 kB, phần xoá ~5,5 kB ⇒ **gần như hoà**; `cz.css` đang
   206,0/215 kB. Không thêm thư viện, không thêm font, không ảnh mới.

## 4. Điểm phải kiểm lại khi lên bản thật

- Không cắt chữ: bìa `aspect-ratio 2/3`; tên bìa cao cố định 2 dòng để dòng tác giả
  thẳng hàng; nhãn trên bìa `max-width: calc(100% - 16px)` + ellipsis.
- Mobile (390): cùng thứ tự, chỉ đổi số cột (6→4→3; lưới 4→2), cột phụ xuống dưới
  thành 1 cột, thanh lọc tự xuống dòng.
- Tablet (834): cột phụ xuống dưới thành **lưới 2 cột** (4 khối), lưới thư viện 4 cột bìa 150.
- Hợp đồng id đang test: `#resumeSec/#resumeRail`, `#newRail`, `#bxh h2`, `#rankModes`,
  `#rankTabs .tab ×3`, `#rank .rank ×5`, `#rankSummary`, `#worthRail`, `#sched`, `#libSub`.
- Chạy `t_home t_ranking t_stats t_adult t_quiet_home t_follow t_mobile t_pwa`,
  `audit:a11y`, `check_html.js`, `bundle_budget.mjs` trước khi commit.
