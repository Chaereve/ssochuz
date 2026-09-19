# BÁO CÁO — NÂNG CẤP TRÌNH SOẠN (PHA 3)

Ngày: 20/09/2026 · Nhánh: `arena/01a0ba86-ssochuz` · Kiến trúc giữ nguyên: HTML tĩnh + Cloudflare Worker + KV. Không Next.js, không framework mới.

## Đã hoàn thành

**1. Thanh định dạng — thêm 10 nút, tất cả đều chạy thật**

Trước đợt này thanh chỉ có đậm/nghiêng/gạch chân/gạch giữa, H2/H3/đoạn/trích dẫn, `hr`, căn trái/giữa/phải, chèn ảnh. Đã thêm:

| Nút | Cơ chế | Ghi chú |
|---|---|---|
| Căn đều (`data-align="full"`) | bộ điều phối `data-align` sẵn có → `justifyFull` | **không cần một dòng code mới** |
| Danh sách dấu chấm / đánh số | `data-cmd` sẵn có | `ul/ol/li` đã được `edHtml()` giữ nguyên và `cleanHTML()` phía người đọc cho qua, nên hiển thị đúng ở trang đọc |
| Tăng / giảm thụt lề | `data-cmd` sẵn có | |
| **Link** | handler mới `edLink()` | hộp thoại qua `CZ.modal`, có kiểm URL |
| Bỏ link, Xoá định dạng, Hoàn tác, Làm lại | `data-cmd` sẵn có | |
| **Xem trước** | `edPreview()` | render đã lọc sạch, kèm số từ + thời gian đọc |
| **Toàn màn hình** | `edFull()` | `Esc` để thoát, có `aria-pressed` |

Mọi nút đều có nhãn đọc được cho screen reader (§19): test khẳng định `nutKhongTen = []`.

**2. Chèn liên kết an toàn — 3 lớp chặn**

`CZ.safeLink(url)` trong `src/cz-app.js` chặn `javascript:`, `data:`, `vbscript:`, `file:`; tự thêm `https://` khi thiếu giao thức; chấp nhận đường dẫn nội bộ (`/…`) và neo (`#…`). Ba lớp độc lập:

1. xét tiền tố trên chuỗi đã cắt khoảng trắng;
2. xét lại sau khi **xoá mọi khoảng trắng** (bắt `java script:`);
3. danh sách trắng cuối cùng `/^https?:\/\/[^\s]+$/` (bắt `javascript :alert(1)` vì còn khoảng trắng).

Lớp 2 và lớp 3 được chứng minh bằng thực nghiệm: khi vô hiệu lớp 1, chuỗi `'  javascript :alert(1)'` **vẫn bị chặn** nhờ lớp 3.

Phía render, `CZ.sanitize(html)` (mới, dùng chung) lặp lại việc chặn `href`/`src` nguy hiểm, lột mọi thuộc tính `on*`, bỏ `script/style/iframe/form/object/embed/link/meta/input/button`, và ép `rel="noopener nofollow"` lên thẻ `<a>`.

**3. Tự lưu nháp chương — chỉ ở máy người viết, không gọi API**

Gõ → chờ 2 s → ghi `localStorage`, kèm dòng trạng thái `Chưa lưu` → `Nháp trong máy lúc HH:MM:SS`. Nháp tách theo `slug` + số chương nên không đè nhau. Mở lại chương mà còn nháp **khác** bản trong bộ thì hiện nút “Khôi phục nháp” — **không tự nạp đè**, vì tự nạp sẽ âm thầm thay chữ người viết vừa lưu lên KV. Bấm “Lưu chương này vào bộ” thì xoá nháp (giữ lại chỉ khiến lần sau báo nháp với đúng chữ vừa lưu).

Cố ý **không** gọi API khi tự lưu: đẩy chương đang viết dở lên KV là đưa bản chưa xong cho người đọc, và mỗi lần gõ tốn một lần ghi KV.

**4. Dựng lại `sanitize` dùng chung thay vì chép blocklist**

Đã cân nhắc chép `cleanHTML()` của `src/cz-story.js` sang admin, nhưng chọn đưa `sanitize()` vào `cz-app.js` để chỉ có **một** danh sách chặn. `src/cz-story.js` **chưa** được chuyển sang dùng hàm này — xem *Rủi ro cần theo dõi*.

## File đã thay đổi

15 file, +444 / −47.

| File | Thay đổi |
|---|---|
| `src/admin.js` | +188 · `edLink()`, `edKeepRange()/edUseRange()/edLinkAt()`, `edPreview()`, `edFull()`, `autoSave()/autoSchedule()/autoDrop()/autoOffer()/saveState()`, nối handler nút và `selectionchange` |
| `src/cz-app.js` | +41 · `sanitize()`, `safeLink()`, `SANITIZE_DROP`, export |
| `src/cz.css` | +18 · `.savestate` (+4 trạng thái), `.prevbody`, `body.ed-full` |
| `admin.html` | +26 · 10 nút thanh định dạng, `#chPreview`, `#chFull`, `#chSaveState` |
| `tests/t_flows.js` | +140 · 7 nhóm assertion mới + nối vào `rtFail` |
| `sw.js`, `404.html`, `guide.html`, `index.html`, `truyen.html`, `admin.html`, `my-space.html`, `profile.html` | bump `?v=20260917d/f` → `?v=20260920a` |
| `admin.js`, `cz-app.js`, `cz.css` (thư mục gốc) | bản rút gọn do `npm run build` sinh ra |

Không thêm file framework, không thêm thư viện.

## API đã thêm/sửa

**Không có.** Không route nào trong `worker/cms.js` bị đụng tới. Toàn bộ tính năng mới chạy ở trình duyệt.

## KV key hoặc schema đã thay đổi

**Không có.** Không đổi định dạng KV, dữ liệu cũ đọc lại y nguyên (test `t_worker.mjs`, `t_private.mjs`, `t_member_spaces.mjs` vẫn đạt).

Khoá mới nằm ở **localStorage của trình duyệt**, không phải KV:

- `cz_ch_draft:<slug>:<số chương>` → `{"at":<ms>,"html":"…","t":"…"}` — nháp chương đang viết.

## Test

`npm test` → **44/44 ĐẠT, exit 0** (`Tất cả bài kiểm thử đều đạt`). Số bài không đổi; `t_flows.js` nặng thêm 7 nhóm assertion.

Thêm vào `tests/t_flows.js`: `editorTools`, `editorCmds`, `editorLink`, `editorSafeLink`, `editorPreview`, `editorFull`, `editorAutoSave`. Tất cả được nối vào `rtFail` → `out.editorFail` → `out.tong.trinhSoan`, nên **hỏng là bài đỏ chứ không chỉ in ra**.

Kết quả đo được:

```
editorTools   = link/list/ol/indent/outdent/unlink/removeFormat/undo/redo/alignFull = 1 (đủ), nutKhongTen = []
editorCmds    = ["insertUnorderedList","insertOrderedList","outdent","indent","unlink","removeFormat","undo","redo","justifyFull"]
editorLink    = {mo:true, chanJs:true, dongHop:true, chenDung:true}
editorSafeLink= {chan:[], cho:[]}          // 9 URL phải chặn, 5 URL phải cho — đúng cả 14
editorPreview = 8/8 true (có lọc onerror, lọc script, ảnh trỏ về Worker)
editorFull    = {bat:true, ariaOn:"true", escTat:true, ariaOff:"false"}
editorAutoSave= {key:"cz_ch_draft:third-person:1", cho:true, bao:true, dungNoiDung:true, xoaKhiLuu:true}
editorFail    = []
```

**Negative control (chứng minh test thật, không phải test luôn xanh):** vô hiệu cả hai lớp đầu của `safeLink()` → `t_flows.js` **exit 1**, `editorFail` nổ đúng hai dòng, `editorSafeLink.chan` liệt kê 6 URL nguy hiểm lọt qua. Đã khôi phục `src/cz-app.js` và xác nhận **giống hệt từng byte** với bản trước (`diff -q`).

**Một lần test bắt lỗi thật của chính đợt này:** sau khi bump `?v=` ở 5 trang, `t_pwa.js` đỏ vì precache trong `sw.js` lệch version. Đã sửa `sw.js` và phát hiện thêm `guide.html` + `404.html` bị sót.

Cổng kiểm: `check_src` **ĐẠT** · `check_secrets` **ĐẠT** · `check_headers` **ĐẠT**.

## Build

`npm run build` → `node tools/build_site.mjs`, **exit 0**:

```
cz-app.js      152.6 kB  →    88.2 kB  (42% nhỏ hơn)
cz-story.js    109.1 kB  →    60.9 kB  (44% nhỏ hơn)
admin.js       194.9 kB  →   116.0 kB  (40% nhỏ hơn)
cz.css         245.0 kB  →   170.1 kB  (31% nhỏ hơn)
Tổng: 831.6 kB  →  508.4 kB · đã ghi ra thư mục gốc.
```

`npm run lint` và `npm run typecheck` **không tồn tại** trong repo này (`package.json` chỉ có `build`, `og`, `test`) — không phải bỏ sót.

## Giới hạn chưa triển khai

- **Hiệu ứng định dạng thật (đậm, danh sách, tạo thẻ `<a>`) CHƯA kiểm chứng được trong harness.** jsdom **không có** `document.execCommand` — đo trực tiếp: `typeof document.execCommand === 'undefined'`, gọi thì ném `D.execCommand is not a function`. Đây là giới hạn môi trường, áp dụng cả cho các nút Đậm/Nghiêng có sẵn từ trước. Test vì vậy gắn máy ghi để bắt **đúng lệnh `admin.js` phát ra** (`createLink` với `https://example.com` đã cắt khoảng trắng) — kiểm được phần ta viết, còn phần trình duyệt tự làm thì để trình duyệt. Cần mở trình duyệt thật để xác nhận lần cuối.
- **Bản nháp chỉ nằm trong một trình duyệt trên một máy.** Không đồng bộ giữa các thiết bị, không khôi phục được nếu người viết xoá dữ liệu trang. Đây là lựa chọn có chủ đích (§25: chỉ dùng API miễn phí, không dịch vụ trả phí).
- **Không làm lịch sử phiên bản.** Theo §11 — “Không tạo hệ thống versioning giả”. Chỉ có một bản nháp duy nhất mỗi chương, ghi đè lên chính nó.
- **Vẫn dùng `document.execCommand`** (đã bị đánh dấu deprecated). Chưa thay bằng Selection/Range API vì đó là viết lại toàn bộ trình soạn, vượt phạm vi “cải thiện cái đã có”.
- `src/cz-story.js` **vẫn giữ blocklist `cleanHTML()` riêng**, chưa chuyển sang `CZ.sanitize()`. Hai danh sách hiện **giống nhau** nhưng là hai bản.
- **Chưa kiểm tra trên thiết bị thật.** CSS `.prevbody` và `body.ed-full` viết theo biến sẵn có và đã soát cú pháp, nhưng chưa mở trên điện thoại.

## Rủi ro cần theo dõi

1. **Hai blocklist song song.** `cleanHTML()` (`src/cz-story.js`) và `CZ.sanitize()` (`src/cz-app.js`) hiện trùng nội dung. Nếu sau này chỉ sửa một bên thì chỗ còn lại hở. Nên hợp nhất ở đợt sau — cần test trang đọc trước và sau.
2. **`document.execCommand` deprecated.** Trình duyệt vẫn hỗ trợ nhưng có thể bỏ. Khi đó toàn bộ thanh định dạng chết cùng lúc, không chết rải rác.
3. **`?v=` phải bump ở 7 file HTML + `sw.js` cùng lúc.** Quên `sw.js` thì service worker phục vụ bản cũ; quên `guide.html`/`404.html` thì `t_pwa.js` đỏ. Đây là việc thủ công, dễ sót — nên cân nhắc sinh tự động trong `tools/build_site.mjs`.
4. **Nháp localStorage có thể phình.** Mỗi chương một khoá, không có hạn mức. Với bộ nhiều chương và ảnh base64 dán thẳng, `localStorage` (thường 5 MB) có thể đầy — khi đó hiện `Không lưu được nháp trong máy (bộ nhớ trình duyệt đầy)`, không âm thầm mất chữ.
5. **Chế độ toàn màn hình dùng `position: fixed` + `z-index: 70`.** Nếu sau này thêm thành phần có `z-index` cao hơn ở trang quản trị thì sẽ chồng lên nhau.
6. **`selectionchange` chạy trên toàn `document`** mỗi lần đổi vùng chọn. Đã giới hạn bằng `ed.contains(r.startContainer)` nên chỉ tốn một phép kiểm, nhưng là listener toàn cục.
