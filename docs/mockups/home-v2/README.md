# Nửa dưới trang chủ · bản 3 “dải bìa” (theo glvietsubz.net)

**Mockup:** `docs/mockups/home-v2/index.html` → `http://127.0.0.1:8081/docs/mockups/home-v2/index.html`
Hai bản trước còn ở `index-r27.html` (ba phương án) — bản này thay hẳn cách bố cục.

## Nguyên tắc

Bám đúng cách glvietsubz.net xếp trang: **một cột, chỉ có các dải bìa**, không cột phụ,
không hộp, không thẻ. Ba thứ dùng lại y nguyên cho mọi mục:

1. **Đầu mục**: tiêu đề bên trái · số lượng nhỏ bên cạnh · “Xem thêm ›” bên phải.
2. **Lưới bìa**: `repeat(6, 1fr)` — **cùng một cỡ bìa trên toàn trang**, kể cả lưới thư viện.
3. **Một bìa**: nhãn duy nhất ở góc trái (trạng thái / số chương / số sao / số hạng),
   `18+` ở góc phải, dưới bìa là **tên 2 dòng + một dòng phụ**.

Mỗi mục cách nhau bằng **đường kẻ 1px + 36px khoảng trắng**. Không có gì khác.

## Các dải

| Dải | Số bìa | Nhãn trên bìa | Dòng phụ |
|---|---|---|---|
| Đọc tiếp | 6 | `Ch. 44/71` + thanh tiến độ trong bìa | Còn 27 chương |
| Mới cập nhật | 12 | `Ch. N` / `Trọn bộ N` | Tác giả · ngày |
| Xếp hạng tuần | 6 | số thứ tự lớn ở góc bìa (1–2 màu son) | 12.480 lượt tuần này |
| Đáng xem | 6 | `★ 4.8` | 31 đánh giá |
| Lịch ra chương | — | 7 cột theo thứ, cột “hôm nay” tô son | 7 mục thật trong registry |
| Thư viện | 12/trang | `Ch. N` / `Trọn bộ N` | tác giả · ngày |

**30 bộ khác nhau** ở bốn dải bìa phía trên — không bìa nào lặp lại. Lưới thư viện mặc định
sắp theo `editorChoice` thật rồi tới mới cập nhật, nên trang 1 cũng không trùng dải trên.

## Co giãn

Bố cục tính theo **bề rộng khung** (`@container`): 6 cột → 4 cột (≤900) → 3 cột (≤620);
lịch 7 cột → thẻ vuốt ngang ở ≤620. Khung hẹp cỡ nào cũng không vỡ. Nút
Desktop/Tablet/Mobile đổi `--fw`; thanh trên hiện **“khung Npx”** để biết đang xem cỡ thật.

## Lên bản thật

1. `index.html`: bỏ `.bento` 12 cột, thay bằng sáu `<section class="rail">` xếp dọc.
2. Giữ hợp đồng id: `#resumeSec/#resumeRail` (6), `#newRail` (12), `#bxh` + `#rank .rank` (5–6),
   `#worthRail` (6), `#sched` (7 cột), `#thu-vien` (12/trang + `#libSub`).
3. Một component bìa dùng chung cho cả sáu mục — chỉ khác nhãn và dòng phụ.
4. CSS: `cz.css` thêm ~4,5 kB (rail + card + week + filters), xoá ~5 kB CSS v3 cũ
   (`.btile`, `.bhead`, `.ranklist`, `.week…`) ⇒ gần như hoà; đang 206,0 / 215 kB.
5. Media query thật: 900 / 620px.

## Dữ liệu

Bìa, tên, tác giả, số chương, trạng thái, ngày cập nhật, `editorChoice`, 7 mục lịch: **thật**.
Lượt đọc, điểm sao, chương đang đọc dở: **số minh hoạ** (registry không có ba loại này).
