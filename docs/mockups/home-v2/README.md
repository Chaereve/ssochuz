# Nửa dưới trang chủ · bản 4

**Mockup:** `docs/mockups/home-v2/index.html` → `http://127.0.0.1:8081/docs/mockups/home-v2/index.html`

## Trang có gì

| Khối | Kiểu | Nội dung |
|---|---|---|
| **Đọc tiếp** | dải **cuộn ngang** 10 bìa | nhãn `Ch. 44/71`, thanh tiến độ trong bìa, dòng phụ “Còn 27 chương” |
| **Mới cập nhật** | dải **cuộn ngang** 18 bìa | nhãn `Ch. N` / `Trọn bộ N`, tác giả · ngày |
| **Xếp hạng tuần** ⎪ **Đáng xem** | **hai cột song song**, mỗi cột 5 dòng | số thứ tự · bìa 42px · tên · dòng phụ; cột phải là `▲3` / `▼1` và `★4.8` |
| **Thư viện** | thanh lọc + lưới 6 cột + phân trang 18 bộ/trang | đếm `1–18 / 67`, “Trang 1 / 4” |

Lịch ra chương **tạm gác** (theo yêu cầu) — không có trong bản này, sẽ làm lại sau.

## Ba thứ dùng chung

1. **Đầu mục**: tiêu đề · số lượng · (nút `‹ ›` nếu là dải cuộn) · “Xem thêm ›”.
2. **Bìa**: cùng một cỡ trên toàn trang (6 cột, ≤900px còn 4, ≤620px còn 3). Một nhãn
   ở góc trái, `18+` góc phải, tên 2 dòng, một dòng phụ.
3. **Danh sách hàng** (hai cột phải): `26px số · 42px bìa · tên + phụ · số liệu`.

## Chi tiết đã làm

- **Dải cuộn**: kéo chuột / vuốt / shift+lăn đều được, `scroll-snap` để bìa dừng ngay mép,
  thanh cuộn mảnh, hai nút `‹ ›` tự khoá khi tới đầu/cuối (mỗi lần nhảy 2 bìa).
- **Hai cột**: đường kẻ dọc 1px giữa hai cột; dòng đầu tiên có số màu son. Ở khung ≤620px
  hai cột xếp dọc và chuyển đường kẻ dọc thành kẻ ngang.
- **Số thứ tự (vị trí)**: huy hiệu tròn 38px, số serif 16px; hạng 1 nền son nhạt + viền son
  + quầng sáng, hạng 2 màu hồng phấn, hạng 3 sáng hơn phần còn lại; rê chuột vào hàng thì
  huy hiệu sáng lên.
- **Số liệu bên phải**: `▲3` màu xanh lá, `▼1` màu đỏ, `★4.8` màu vàng — mỗi loại một viên
  nền màu nhạt, dấu nhỏ (10px) và số đậm (13px) để đọc được ngay.
- **Thanh lọc thư viện**: ô tìm 42px bo 12, viền son + quầng sáng khi focus, nút ✕ xoá nhanh
  (chỉ hiện khi có chữ); hai dropdown cùng chiều cao, nhãn mờ “Năm / Sắp xếp” đứng trước giá
  trị; chip lọc 32px, chip đang chọn có viền son + quầng.
- **Rê chuột lên bìa**: ảnh tối đi (`brightness .58`) và phóng nhẹ 3%, nút **“Đọc ngay ›”**
  nền son nổi lên giữa bìa; tên truyện đổi màu son.
- **Lưới thư viện**: 3 hàng × 6 bìa mỗi trang (18 bộ), phân trang kèm “Trang 1 / 4”.

## Bản 6 · dải bìa kiểu glvietsubz

Bỏ hẳn khối hai cột (Xếp hạng + Đáng xem nằm cạnh nhau) — **Đáng xem giờ là một mục riêng**,
cùng một ngôn ngữ với các mục khác: đầu mục = tên + “Xem thêm ›”, dưới là **dải 6 bìa**.

| Mục | Cách làm |
|---|---|
| Đọc tiếp | dải bìa cuộn ngang, 10 bộ, nhãn “Ch. x/y” + thanh tiến độ mảnh |
| Mới cập nhật | dải 18 bìa, một nhãn trạng thái mỗi bìa, dòng dưới = tên gốc · ngày |
| Xếp hạng tuần | dải 6 bìa, **số hạng serif 34px đè góc dưới-trái bìa** (hạng 1 màu son), dưới: `12.480 lượt tuần ▲3` |
| Đáng xem | dải 6 bìa, **nhãn ★ 4.8 trên bìa**, dưới: `31 đánh giá · Truyện tranh` |
| Thư viện | ô tìm 38px bo 9 · dropdown có nhãn mờ · chip 30px · nút lưới/danh sách · lưới 6 cột |

Không còn đường kẻ giữa các mục (chỉ còn khoảng thở 44px), không khung lồng khung.

## Chốt kiểu (vòng này)

| Chỗ | Chốt |
|---|---|
| Số hạng | **A** — số serif lớn đè góc dưới-trái bìa, hạng 1 màu son |
| ▲▼ | **A** — dấu trước số (`▲3`) |
| Thanh lọc | **A** — có viền; dropdown + nút lưới/danh sách nằm trong một hàng `.lrow` `flex:none`, chữ `nowrap` (không rớt dòng), mọi thứ cao đúng 38px |
| Nút rê chuột | làm lại — ba kiểu ở `hover.html` |

### Ba kiểu nút khi rê chuột (`hover.html`)

| Kiểu | Mô tả |
|---|---|
| A · nút tròn son + **sách mở** | bìa tối đi, nút tròn 46px màu son có biểu tượng **sách mở** (không dùng tam giác play), dưới là “Đọc ngay” 10px in hoa giãn chữ — **đang dùng trong trang chính** |
| B · chữ lớn + gạch son | không nút: chữ “Đọc ngay” serif 20px trên bìa tối, gạch son 46px trượt ra, viền son 2px ôm bìa |
| C · thanh son từ đáy | dải son đặc cao 34px trượt lên từ đáy, chữ đậm màu nền |

Đánh dấu bằng class trên khung chứa: `.hvA` / `.hvB` / `.hvC`; trong trang chính đặt ở `<body>`.

**Trang biến thể:**## Dữ liệu

Bìa, tên, tác giả, số chương, trạng thái, ngày cập nhật, `editorChoice`: **thật** (67 bộ).
Lượt đọc, thứ hạng tăng/giảm, điểm sao, chương đang đọc dở: **số minh hoạ**.

## Lên bản thật

1. `#resumeSec` và `#newRail` → hai `<div class="track">` cuộn ngang (giữ nguyên hợp đồng id).
2. `#bxh` và `#worthRail` đặt trong một `.twoside` hai cột; mỗi cái render 5 hàng theo mẫu
   `.prow` ở trên (vẫn giữ `#rank .rank`, `#rankSummary`, `.worth-score` cho test).
3. `#thu-vien` giữ D1, đổi sang 18 bộ/trang + `#libSub` hiện `1–18 / 67`.
4. `#sched` tách ra khỏi trang chủ ở bản này, làm lại sau rồi gắn lại.
5. CSS: thêm ~4 kB (track/arrows/prow/library), xoá ~4,5 kB CSS v3 cũ ⇒ gần như hoà.
