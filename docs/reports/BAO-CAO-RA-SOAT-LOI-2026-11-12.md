# Rà soát lỗi — 2026-11-12

- Nhánh: `arena/d558b6b7-ssochuz` (từ `main` @ `c6e3163`)
- Phạm vi: toàn bộ mã nguồn (`src/`, `worker/`, `tools/`, `tests/`, cấu hình Pages) — chạy hết bộ kiểm thử, typecheck Worker, các script kiểm tra, rồi đọc mã để tìm lỗi mà bộ test chưa chạm tới.
- Kết luận ngắn: **hạ tầng kiểm thử đang xanh** (60/60 bài, `npm run build` tái lập từng byte, `tsc` Worker sạch, 0 lỗi trợ năng). Rà mã tìm thêm **3 lỗi thật ở trang “Bốc bài”**, **1 rò rỉ bộ nhớ ở My Space** và **1 lỗi nhật ký ở Worker**; cả 5 đã sửa kèm test khoá lại.

## 1. Đã chạy (bằng chứng)

| Lệnh | Kết quả |
| --- | --- |
| `npm ci` (gốc + `tests/`) | ĐẠT |
| `npm run build` rồi `git status` | ĐẠT — không sinh khác biệt (bundle tái lập) |
| `npm run check:worker` (tsc `checkJs`) | ĐẠT — không lỗi |
| `npm test` | **60/60 ĐẠT** (61 bài sau khi thêm `t_dice_state.js`) |
| `tools/check_html.js`, `check_headers.js`, `check_calls.js`, `check_css.py`, `check_og.mjs`, `check_chapter_html.mjs`, `check_chapter_routes.mjs`, `audit_data.py`, `bundle_budget.mjs` | ĐẠT — không lỗi |
| `npm audit` | 2 lỗ hổng **high** — đều nằm trong `jsdom` (devDependency, chỉ dùng lúc test: `undici`, `source-map-js`), **không có gói nào lên production |
| ESLint (cấu hình tạm, `no-use-before-define`, `no-redeclare`, `require-atomic-updates`…) | Chỉ ra đúng 1 lỗi runtime thật: `settle()` ở `src/cz-dice.js` (mục 2.1); còn lại là cảnh báo/biến thừa |

## 2. Lỗi đã sửa

### 2.1 `src/cz-dice.js` — gọi `settle()` khi biến chưa được gán ⇒ nút “Bốc một lá” chết

`flipIn()` có nhánh “không còn `#dcBoard`/`#dcFace`” gọi `settle()`, nhưng `settle` chỉ được gán bằng `var` **ở dưới trong cùng hàm** ⇒ lúc gọi là `undefined` ⇒ `TypeError`, `S.busy` kẹt `true`, nút bốc bị khoá vĩnh viễn cho tới khi tải lại trang.

- Sửa: nhánh đó gọi `setBusy(false)` rồi thoát.
- Test: `tests/t_dice_state.js` (mục 1). Trước khi sửa bài test bắt được `TypeError: b is not a function` và `busy: true`; sau khi sửa 0 lỗi, nút mở khoá và lượt bốc sau chạy bình thường.

### 2.2 `src/cz-dice.js` — `S.gen` không bao giờ tăng ⇒ lá của xấp CŨ “đáp” lên khung mới

Ba chỗ so `gen !== S.gen` để bỏ hoạt ảnh của lượt trước, nhưng `S.gen` chỉ được khởi tạo `0` và không nơi nào tăng. Đổi bộ lọc giữa lúc lật (hoặc khung bị dựng lại) ⇒ callback cũ vẫn gọi `land()` và hiện lá của xấp cũ, không khớp bộ lọc đang chọn; trạng thái `hasCard` cũng sai theo.

- Sửa: `refreshPool()` tăng `S.gen` (mọi lần dựng lại xấp/đổi bộ lọc).
- Test: `t_dice_state.js` (mục 2) — kiểm `gen` tăng, `#dcResult` vẫn ẩn, `hasCard=false`, `busy=false`. Trước khi sửa bài test bắt được lá cũ hiện ra (`"Like A Palette"`).

### 2.3 `src/cz-dice.js` — dựng lại khung không trả `S.hasCard` về `false`

`renderBox()` dựng lại `body.innerHTML` về trạng thái úp bài nhưng giữ `S.hasCard = true` của lượt trước ⇒ lượt bốc kế tiếp chạy nhánh “gập lá cũ” trên khung trống (chậm, không lật vào).

- Sửa: `renderBox()` đặt `S.hasCard = false; S.pick = null;` ngay sau `refreshPool()`.
- Test: `t_dice_state.js` (mục 3).

### 2.4 `src/cz-space.js` — rò rỉ `blob:` URL khi chọn ảnh đại diện

`avatarSource = URL.createObjectURL(file)` rồi bị gán đè bằng data URL (ảnh đã cắt, hoặc ảnh tự cắt 256 px) mà không `revokeObjectURL` ⇒ mỗi lần chọn ảnh để lại một blob sống tới khi đóng tab.

- Sửa: gọi `releaseAvatarSource()` trước khi thay bằng data URL; nhánh tự cắt vẫn giữ `avatarSource = avatar` để nút “Căn chỉnh” hoạt động như trước.

### 2.5 `worker/cms.js` — `PUT /api/book/<slug>/chapter` khi xoá trả `index: -1`

Nhánh `remove: true` không gán `idx` ⇒ response trả `index: -1` và nhật ký ghi “lưu chương <slug> #0” thay vì vị trí vừa xoá.

- Sửa: `idx = index` trước khi `splice`.
- Test: thêm một dòng vào `tests/t_schedule.mjs` (`chapter/xoá → index trả đúng chương vừa xoá`).

## 3. Ghi nhận, chưa sửa (không phải lỗi chức năng, cần chủ trang quyết)

1. **`npm audit` 2 lỗ hổng high** — `undici` + `source-map-js` nằm trong `jsdom` (devDependency). Không lên production; chỉ ảnh hưởng máy chạy test. Nếu muốn sạch báo cáo: nâng `jsdom`, hoặc chấp nhận vì đây là công cụ test.
2. **CSP có `'unsafe-inline'` trong `script-src`** (`_headers`) — cần cho các script nội tuyến hiện tại; nghĩa là CSP không chặn được script chèn qua lỗ hổng HTML. Muốn siết phải bỏ dần script nội tuyến (việc lớn, ngoài phạm vi lượt rà này).
3. **`CZ.registry(true)`**: chú thích nói `force` “đọc lại từ đầu, bỏ qua memo”, nhưng điều kiện `memo.reg && (!force || hasLib(memo.reg))` vẫn trả memo khi memo có sách. Hiện không gây lỗi vì nút “Thử lại” gọi `purgeRegistry()` trước (dọn memo), nên chỉ là chú thích chưa khớp mã.
4. **Kiểm issuer token Supabase** so bằng tiền tố (`iss` bắt đầu bằng `base`). Chữ ký đã được kiểm bằng JWKS của project đã ghim nên không khai thác được, nhưng nếu muốn chặt thì nên so khớp tuyệt đối `base + '/auth/v1'`.
5. **Dữ liệu lịch sử `'YYYY-MM-DD HH:mm'`** (không có múi giờ) được `Date.parse` hiểu theo múi giờ của máy chạy: Worker (UTC) và trình quản trị (giờ VN) lệch nhau 7 giờ. Chỉ ảnh hưởng chương hẹn giờ nhập từ bản cũ; dữ liệu mới luôn lưu ISO UTC.

## 4. Cách chạy lại

```bash
npm ci && (cd tests && npm ci)
npm run build          # bản phát hành ở gốc phải khớp src/
npm run check:worker
npm test               # 61 bài, gồm t_dice_state.js mới
node tests/t_dice_state.js   # riêng phần trạng thái xấp bài
```
