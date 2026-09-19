# BÁO CÁO · Sửa 2 lỗi thật + bổ sung thời gian đọc & kiểm tra chương

Ngày: 19/09/2026
Phạm vi: `admin.html`, `src/admin.js`, `src/cz-app.js`, `src/cz-story.js`, `src/cz.css`
Kiểm thử: `node tests/run.js` → **44/44 bài đạt**

> Nguyên tắc của đợt này: **không viết lại**. Trang đang chạy tốt và có sẵn 44 bài
> kiểm thử; yêu cầu Next.js 14 + Prisma + CKEditor trong tài liệu sẽ thay toàn bộ
> kiến trúc tĩnh + Cloudflare Worker hiện tại. Theo đúng chỉ đạo “cái nào có rồi
> thì ưu tiên cải thiện và fix lỗi”, mọi thay đổi dưới đây nằm trong kiến trúc cũ.

---

## 1) LỖI · Hai nút lưu hứa phím tắt Ctrl+S mà trang không có

### Triệu chứng

Trong trang quản trị:

| Vị trí | Nhãn cũ |
| --- | --- |
| `admin.html:254` | `Lưu thông tin (Ctrl+S)` |
| `admin.html:333` | `Lưu toàn bộ chương (Ctrl+S)` |

Người dùng bấm **Ctrl+S thì không có gì xảy ra** — không lưu, không thông báo.

### Nguyên nhân

Không phải thiếu code. Phím tắt **đã bị bỏ có chủ đích**, ghi rõ trong
`src/admin.js`:

```
/* KHÔNG có phím tắt ở trang quản trị (yêu cầu của chủ trang 17/09/2026):
   những tổ hợp như Ctrl+S/Ctrl+K hay bấm số để đổi tab gây phiền khi gõ nội
   dung và dễ bấm nhầm. Muốn lưu hay đổi tab thì bấm nút trên giao diện. */
```

Và `tests/t_flows.js` còn **kiểm tra Ctrl+S phải KHÔNG làm gì**:

```js
if (!noShot.msgStay) shortcutFail.push('Ctrl+S vẫn tự lưu/hiện thông báo ở trang quản trị');
```

Vậy bộ kiểm thử đã cấm Ctrl+S hoạt động, trong khi giao diện vẫn mời người dùng
bấm. Sai ở **cái nhãn**, không phải ở hành vi.

### Cách sửa

Bỏ phần `(Ctrl+S)` khỏi hai nhãn. **Không** cài lại phím tắt — làm vậy sẽ đi ngược
quyết định của chủ trang và làm đỏ chính bài kiểm thử đang canh.

Ngoại lệ được giữ nguyên: `title="Đậm (Ctrl+B)"` / `Ctrl+I` / `Ctrl+U` trong thanh
định dạng. Đó là hành vi `contenteditable` của chính trình duyệt, không phải phím
tắt do trang tự cài, nên lời hứa đó là thật.

### Kiểm chứng

Bài mới trong `t_flows.js` quét mọi nút trong `#ashell` và `#scConnect`, hễ nhãn
hoặc `title` hứa `Ctrl+…` mà không thuộc nhóm B/I/U là báo lỗi:

```js
const NATIVE_TITLE = /^(Đậm|Nghiêng|Gạch chân)\s*\(Ctrl\+[BIU]\)$/i;
out.adminNoFakeShortcuts = $$a('#ashell button, #scConnect button') …
```

Chạy ngược trên bản cũ (gắn lại `(Ctrl+S)`):

```
NHÃN HỨA PHÍM TẮT KHÔNG CÓ: Lưu thông tin (Ctrl+S) · Lưu toàn bộ chương (Ctrl+S)
CÒN 2 LỖI   (exit 1)
```

---

## 2) LỖI · Nạp bản nháp làm hai con số trên cùng màn hình lệch nhau

### Triệu chứng

Trang quản trị hiện số bộ ở **hai chỗ**:

- `#libCount` trong tab Tổng quan (“bộ trong dữ liệu”)
- huy hiệu `#tabLibCt` trên tab “Thư viện”

Bấm **Dùng nháp** xong, `#libCount` đổi theo bản nháp còn huy hiệu tab vẫn giữ số
cũ đọc từ KV. Đo bằng test: nháp 3 bộ / registry KV 62 bộ →

```
#libCount = 3   ·   huy hiệu tab = 62
```

### Nguyên nhân

`loadRegistry()` cập nhật cả hai:

```js
$('#libCount').textContent = num(REG.lib.length);
setTabCt('tabLibCt', REG.lib.length);
```

`useDraft()` chỉ cập nhật chỗ đầu, **bỏ sót dòng `setTabCt`**.

### Cách sửa

Thêm đúng dòng còn thiếu vào `useDraft()` (`src/admin.js:2657`).

### Kiểm chứng

Bài mới trong `t_flows.js` đặt sẵn một bản nháp 3 bộ, bấm *Dùng nháp* → xác nhận,
rồi đòi hai con số phải bằng nhau **và** phải đúng bằng 3.

| | `#libCount` | huy hiệu tab | kết quả |
| --- | --- | --- | --- |
| Bản cũ | `3` | `62` | ✗ LỖI (exit 1) |
| Sau sửa | `3` | `3` | ✓ ĐẠT |

---

## 3) BỔ SUNG · Thời gian đọc ước lượng (trước đây không có ở đâu)

Tài liệu yêu cầu ở ba chỗ (§1.4 “Reading time estimate”, §2.7 “Reading time
estimate (200 words/min)”, §2.8 Stats Panel, §3.3 Chapter List). Kiểm tra bằng
`grep -rl "phút đọc"` trên toàn repo: **0 kết quả** — tính năng chưa từng có.

### Cách làm

Thêm vào `src/cz-app.js`, cạnh hàm `words()` sẵn có:

```js
var READ_WPM = 200;
function readMins(nWords) { … Math.max(1, Math.round(w / READ_WPM)); }
function readTimeText(nWords) { … }   /* “7 phút” / “1 giờ 5 phút”, rỗng khi 0 từ */
```

Tối thiểu **1 phút** khi có nội dung: chương 80 từ mà hiện “0 phút” thì người đọc
tưởng trang trắng.

Ba nơi dùng:

| Nơi | Kết quả đo được |
| --- | --- |
| Danh sách chương **ngoài web đọc** (`chapLink`) | `Mở · Lời Mở Đầu · 1 phút` |
| Danh sách chương **trong admin** (`renderChapters`) | nhãn phút mỗi dòng |
| Thanh thống kê dưới ô soạn (`chStat`) | `1.461 từ · 6.536 ký tự · đọc hết ~7 phút` |

### Hai chỗ dễ vỡ đã xử lý

**a) Không phá lưới.** `.cha` là `grid-template-columns: 30px 1fr auto`. Nhét thêm
một `<span>` nữa sẽ rơi vào **cột ngầm** và đẩy lệch cả hàng. Nên thời gian đọc và
dấu “đã đọc” được gộp vào **một** ô `.end`:

```js
'<span class="end">' + (rt ? '<span class="tm">' + esc(rt) + '</span>' : '') + done + '</span>'
```

Test khoá lại: `threeCols: chas.every(a => a.children.length === 3)`.

**b) Không tính lại mỗi lần vẽ.** Đếm từ trên HTML là việc nặng. Đo trên bộ dài
nhất kho (`by-your-side.json`, 32 chương · 1.827 KB):

```
tính words cho CẢ bộ: 48,6 ms
```

Danh sách chương vẽ lại theo **từng phím gõ tìm kiếm** (debounce 150 ms) và mỗi
lần đổi trang → 48 ms mỗi lượt là giật thấy được. Nên có `rtCache` nhớ theo số
chương, và `rtCache = {}` ngay chỗ gán lại `CHS` để không dùng số cũ của bộ khác.

### Kiểm chứng

`t_story.js` (đo thật):

```
chapReadTime = { n: 9, withTm: 9, threeCols: true, inTitle: 9,
                 sample: ["1 phút","7 phút","9 phút"] }
```

`t_flows.js` (admin): `rows: 9, rowsWithTm: 9`,
`stat: "1.461 từ · 6.536 ký tự · đọc hết ~7 phút"`.

---

## 4) BỔ SUNG · “Kiểm tra chương” trong trình soạn

Tài liệu §2.8 đòi *SEO score* trong Stats Panel. Đặt nguyên xi chữ “SEO score” cho
truyện chữ thì dễ thành con số vô nghĩa, nên làm thành khối kiểm tra **chỉ nói về
thứ máy đo được**, hiện ngay dưới ô soạn (`#chCheck`).

### Ngưỡng lấy từ dữ liệu thật, không đặt theo cảm tính

Đo trên **1.198 chương có nội dung** trong `data/book/` ngày 19/09/2026:

| Chỉ số | Số đo | Ngưỡng chọn |
| --- | --- | --- |
| từ/chương | trung vị **3.087** · p5 = 1.572 · p95 = 6.455 · max 17.612 | ngắn < **600** · dài > **8.000** |
| ký tự/đoạn | trung vị **92** · p90 = 266 · **p99 = 459** · max 1.160 | “tường chữ” > **500** |
| tỉ lệ đoạn có thoại | trung vị **0,51** · p10 = 0,33 | báo khi < **0,15** và > 800 từ |

Cả kho chỉ 7 chương dưới 400 từ và 0,20% số đoạn dài hơn 600 ký tự → các ngưỡng này
chỉ kêu với **ngoại lệ thật**, không spam.

### Ranh giới cố ý

`references/webnovel_quality_checklist.md` của repo
[Tomsawyerhu/Chinese-WebNovel-Skill](https://github.com/Tomsawyerhu/Chinese-WebNovel-Skill)
liệt kê nhiều mục **máy không chấm được**: “mở đầu có抓手 không”, “chương kết có
dừng đúng nhịp thay đổi không”, “thông tin có trực đổ không”. Đó là phán đoán của
người viết. Khối này **không** giả vờ chấm điểm “chất lượng” chung chung — chỉ báo
độ dài, ngắt đoạn, thoại. Ghi rõ trong chú thích mã nguồn để người sau không nới
thành một con điểm rỗng.

### Kiểm chứng (`t_flows.js`, chạy trên chương thật của *Third Person*)

| Tình huống | Hiện ra |
| --- | --- |
| Chương 50 từ | `Chương ngắn (50 từ) — cả kho này trung bình 3.087 từ/chương.` |
| 3 đoạn > 500 ký tự | `3 đoạn dài hơn 500 ký tự — khó đọc trên điện thoại, nên tách đoạn ngắn hơn.` |
| Chương rỗng | `Chương chưa có chữ.` |
| Chương thật 1.461 từ | `Độ dài và ngắt đoạn ổn so với mặt bằng của kho.` |

Test còn giữ nguyên nội dung chương sau khi thử (`keepHtml`) để các bài xoá/sắp xếp
chương phía sau không bị ảnh hưởng.

---

## 5) Sửa luôn một phép đo sai trong chính bộ kiểm thử

Khi thêm các test trên, `out.adminChDel.deleted` lật từ `true` sang `false` dù danh
sách chương vẫn mất đúng dòng đã xoá (`after: 8`).

Nguyên nhân **nằm ở bài test, không ở sản phẩm**: worker giả trong `t_flows.js`
trả object **bằng tham chiếu** (`json: () => Promise.resolve(b)`), nên khi admin
chưa bấm *Lưu toàn bộ chương* thì `BOOK` của test và của admin là **cùng một
object**. Vừa có một lần PUT là worker giả gán `BOOK = JSON.parse(opt.body)` — biến
của test trỏ sang object MỚI, còn lệnh `splice` xảy ra trên object cũ.

Đã đổi sang đo trên **danh sách chương đang hiện** (đúng thứ người quản trị nhìn),
và cho nó **làm bài đỏ** — trước đây khoá này chỉ in ra chứ không tính vào lỗi.

---

## Kiểm chứng tổng

```
npm run build      # 818,9 kB → 502,0 kB, ghi bản rút gọn ra thư mục gốc
node tests/run.js  # 44/44 ✓ ĐẠT · “Tất cả bài kiểm thử đều đạt”
```

Mỗi lỗi đều được **chạy ngược trên bản cũ** để chắc test không rỗng:

| Test | Bản cũ | Sau sửa |
| --- | --- | --- |
| `adminNoFakeShortcuts` | 2 nhãn bị bắt, exit 1 | `[]`, exit 0 |
| `adminDraftBadge.agree` | `false` (3 vs 62), exit 1 | `true` (3 vs 3), exit 0 |
| `chapReadTime.withTm` | không có `.tm` | `9/9` |
