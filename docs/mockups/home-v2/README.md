# Phương án nửa dưới trang chủ · vòng 27

**Mockup (tĩnh, mở trực tiếp):** `docs/mockups/home-v2/index.html`
→ local: `http://127.0.0.1:8081/docs/mockups/home-v2/index.html`
Ba phương án nằm **trong cùng một trang**, dùng nút **Desktop / Tablet / Mobile** ở thanh trên
để xem cùng một phương án ở ba bề rộng. Dữ liệu là **67 bộ thật** trong `data/registry.json`,
bìa là **ảnh thật** trong `assets/covers/` (không có bìa vẽ tay, không có số liệu bịa).

Tham khảo: **glvietsubz.net** (mỗi mục là một hàng bìa, đầu mục có “Xem thêm ›”, trên bìa chỉ
một nhãn) và **glvietsub.org** (“Xem nhiều nhất” là bảng đánh số 1…5, mục nào cũng có
“Xem toàn bộ ›”, bìa mang nhãn tiến độ).

---

## 1. Đang có gì chưa ổn (bản đang chạy, sau vòng 26)

| # | Chỗ | Vấn đề |
|---|---|---|
| 1 | Đầu mục | Mỗi mục một kiểu: chỗ có `.tab`, chỗ có `.seg`, chỗ chỉ có chữ nhỏ. Nhãn 9–11px nằm cạnh tiêu đề 21px nên hàng đầu mục bị “vụn”. |
| 2 | Đọc tiếp (7/12) | Danh sách 3 dòng nằm trong ô 7 cột ⇒ nửa phải của ô trống, mắt bị hụt. |
| 3 | Ranking (5/12) | Cột hẹp phải chứa cả bảng top-5 **và** 3 bìa “Đáng xem” ⇒ bìa nhỏ nhất trang (~104px), chữ 12px. |
| 4 | Lịch tuần | 7 cột kẻ chỉ, ngày nào không có truyện thì để trống ⇒ 2–3 cột trống liền nhau, trang bị “thủng”. |
| 5 | Khung | `.btile` + viền + nền lồng nhau ⇒ cảm giác hộp trong hộp, đúng lỗi “bớt hộp” từ vòng 25 chưa dứt. |
| 6 | Thứ tự | Mới cập nhật → Đọc tiếp → Ranking: người quay lại phải đi qua cả một dải bìa mới tới chỗ đang đọc. |

## 2. Ba phương án

### E1 · KỆ BÌA — *khuyến nghị*
Mỗi mục là **một dải ngang**, đầu mục dùng chung một mẫu duy nhất: tiêu đề serif + dòng đếm
+ “Xem thêm ›”. Không viền, không nền, chỉ khoảng trắng phân khối.

```
Đọc tiếp        3 thẻ ngang 72px bìa, có thanh tiến độ + “Đọc tiếp ►”
Mới cập nhật    6 bìa 176px, mỗi bìa MỘT nhãn “N chương”, dưới bìa: tên + tác giả
Bảng xếp hạng   bảng đánh số 1…5 (số serif, lượt/tuần, ±)  |  Đáng xem: 3 bìa 146px
Lịch ra chương  7 cột mảnh, cột “hôm nay” có nền son nhạt
Thư viện        thanh lọc D1 + lưới 6 cột 177px + phân trang
```
- Đúng nhịp glvietsubz: **hàng bìa là nhân vật chính**, quét rất nhanh “hôm nay có gì”.
- Bìa đồng cỡ 176px với lưới thư viện ⇒ mắt không phải đổi thang.
- Mobile: giữ **nguyên thứ tự 5 mục**, chỉ đổi số cột (6→4→3, lưới 6→4→2, lịch thành thẻ
  vuốt ngang 152px). Đây là điều kiện “mobile cùng cấu trúc, chỉ thu nhỏ”.

### E2 · TẠP CHÍ — *phương án dự phòng*
Hàng bìa ở trên, rồi **hai cột**: thư viện là chính (4 cột bìa ~181px), **cột phụ 306px dính**
giữ Đọc tiếp · Lịch tuần · Đáng xem luôn nhìn thấy khi cuộn lưới.
- Học glvietsub.org: cột tiện ích luôn hiện.
- Ưu: người đọc quay lại hằng ngày thấy ngay “đang đọc tới đâu”.
- Nhược: lưới thư viện hẹp còn 4 cột (mất 1/3 số bìa mỗi màn), nhiều thay đổi cấu trúc nhất;
  ở 834px cột phụ tụt xuống dưới ⇒ phải đổi thứ tự bằng `order`, dễ sinh lỗi.

### E3 · BẢNG — *bản nâng cấp an toàn của hiện tại*
Giữ thứ tự Đọc tiếp/Ranking trước, nhưng **bỏ khung hộp**: hai pane 7fr/5fr ngăn bằng khoảng trắng,
ranking là bảng đánh số có cột số liệu, rồi dải bìa choáng ngang, lịch, thư viện.
- Ít rủi ro nhất khi lên bản thật (gần như chỉ sửa CSS), nhưng **chưa giải quyết** ô Đọc tiếp
  7 cột bị trống và vẫn để người quay lại đi qua dải bìa mới.

## 3. So sánh

| Tiêu chí | E1 · Kệ bìa | E2 · Tạp chí | E3 · Bảng |
|---|---|---|---|
| Thứ tự mắt đọc | Đọc tiếp → Mới → Bảng → Lịch → Thư viện | Mới → Top tuần → Thư viện (+ cột phụ) | Đọc tiếp/Bảng → Mới → Lịch → Thư viện |
| “Mới cập nhật” | 6 bìa 176px, cả hàng | 6 bìa 176px, cả hàng | 6 bìa 176px, cả hàng |
| Đọc tiếp | 3 thẻ ngang, trên cùng | 3 dòng, cột phụ dính | 3 dòng, cột trái |
| Lưới thư viện | **6–7 cột (rộng nhất)** | 4–5 cột | 6–7 cột |
| Cá nhân hoá | chỉ ở đầu trang | **luôn thấy khi cuộn** | chỉ ở đầu trang |
| Ô trống / cột thủng | hết | hết | còn (Đọc tiếp 7 cột) |
| Khác bản đang chạy | nhiều (đổi thứ tự, bỏ khung) | nhiều nhất | ít nhất |
| Hợp với | người mới, quét “có gì mới” | người đọc quay lại hằng ngày | bản vá nhanh |

## 4. Nếu chọn E1 — các bước lên bản thật

1. **Đầu mục dùng chung**: một hàm `secHead(title, count, more)` sinh `.shead`; xoá `.tab`
   riêng của `#rankTabs` khỏi hàng tiêu đề (giữ `#rankTabs` làm hàng lọc riêng dưới tiêu đề,
   vẫn giữ `[data-mode]` + `aria-pressed` cho `t_ranking`).
2. **Đổi thứ tự**: `#resumeSec` lên trước `#newRail`; `.bento` bỏ `grid-column` của các ô,
   chuyển sang các dải `.sec` xếp dọc (`display:block` + `padding` thay vì lưới 12 cột).
3. **Bảng xếp hạng**: `.rankWrap` 2 cột 1.35fr/1fr ở ≥1000px, dưới đó 1 cột; “Đáng xem”
   3 bìa `minmax(146px,1fr)` thay vì 104px.
4. **Lịch**: giữ 7 cột ở ≥900px nhưng **ngày trống chỉ còn dấu “–” 11px**, không còn khung;
   ≤900px chuyển thành thẻ vuốt ngang 152px.
5. **Bỏ hộp**: `#bxh`, `#resumeSec`, `#sched` không dùng `.btile` nữa — chỉ khoảng trắng 40px
   giữa các mục; giữ `.btile` cho phần khác nếu còn dùng.
6. **Ngân sách CSS**: phần này thay thế ~5,5 kB CSS v3 hiện có, ước tính **+2,5 kB**;
   `cz.css` đang 206,0 / 215 kB ⇒ còn ~6,5 kB dư. Không thêm thư viện, không thêm font.

## 5. Kiểm tra trước khi lên bản thật

- Không cắt chữ: bìa luôn `aspect-ratio 2/3`; tiêu đề bìa cao cố định 2 dòng để dòng tác giả
  thẳng hàng; nhãn trên bìa `max-width: calc(100% - 16px)` + ellipsis.
- Mobile = cùng thứ tự, chỉ đổi số cột (6→4→3), không có mục nào biến mất.
- Giữ hợp đồng id đang test: `#resumeSec/#resumeRail`, `#newRail`, `#bxh h2`, `#rankModes`,
  `#rankTabs .tab ×3`, `#rank .rank ×5`, `#rankSummary`, `#worthRail`, `#sched`, `#libSub`.
- Chạy lại `t_home t_ranking t_stats t_adult t_quiet_home t_follow t_mobile t_pwa`,
  `audit:a11y`, `check_html.js`, `bundle_budget.mjs` trước khi commit.

---

*Chưa đụng vào `src/cz.css` / `index.html` ở vòng này: đây là bản để chọn hướng, chọn xong mới sửa thật.*
