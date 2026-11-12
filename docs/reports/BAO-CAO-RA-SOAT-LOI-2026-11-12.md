# Rà soát lỗi — 2026-11-12

- Nhánh: `arena/d558b6b7-ssochuz` (từ `main` @ `c6e3163`)
- Phạm vi: toàn bộ mã nguồn (`src/`, `worker/`, `tools/`, `tests/`, cấu hình Pages) — chạy hết bộ kiểm thử, typecheck Worker, các script kiểm tra, rồi đọc mã để tìm lỗi mà bộ test chưa chạm tới.
- Kết luận ngắn: **hạ tầng kiểm thử đang xanh** (60/60 bài, `npm run build` tái lập từng byte, `tsc` Worker sạch, 0 lỗi trợ năng). Rà mã + fuzz tìm thêm **3 lỗi thật ở trang “Bốc bài”**, **1 lỗ hổng bỏ qua bộ lọc HTML chương (XSS)**, **1 rò rỉ bộ nhớ ở My Space** và **1 lỗi nhật ký ở Worker**; cả 6 đã sửa kèm test khoá lại.

## 1. Đã chạy (bằng chứng)

| Lệnh | Kết quả |
| --- | --- |
| `npm ci` (gốc + `tests/`) | ĐẠT |
| `npm run build` rồi `git status` | ĐẠT — không sinh khác biệt (bundle tái lập) |
| `npm run check:worker` (tsc `checkJs`) | ĐẠT — không lỗi |
| `npm test` | **92/92 ĐẠT** (gồm các bài mới của lượt rà: `t_registry_dirty.js`, `t_admin_dirty_registry.js`, `t_sw_precache.js`, `t_dice_state.js`…) |
| `tools/check_html.js`, `check_headers.js`, `check_calls.js`, `check_css.py`, `check_og.mjs`, `check_chapter_html.mjs`, `check_chapter_routes.mjs`, `audit_data.py`, `bundle_budget.mjs` | ĐẠT — không lỗi |
| `npm audit` | **0 lỗ hổng** sau `npm audit fix` (trước đó 2 **high** trong `jsdom` bản dev: `undici`, `source-map-js`) |
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

### 2.6 `src/shared/sanitize.js` — thẻ HTML **không có `>` đóng** lọt nguyên `on*` (XSS)

Khi `<` không có `>` phía sau (hết chuỗi), bộ lọc chép nguyên phần còn lại vào đầu ra
(`out += src.slice(lt)`). Trình duyệt gặp thẻ chưa đóng ở cuối đoạn vẫn dựng phần tử khi
chuỗi được ghép thêm markup phía sau (vd đặt trong một `innerHTML` có thẻ bao), nên
`<img src=x onerror=alert(1)` ⇒ `<img>` có `onerror`, `onload`… — đúng thứ bộ lọc vừa bỏ.

- Sửa: mọi `<` không mở được thẻ hợp lệ đều được **thoát thành `&lt;`** rồi quét tiếp
  (không chép cụm thô). Lưu ý: không thể “giữ nguyên `<` khi thấy đó là chữ” — thẻ đứng
  sau có thể bị bỏ cả cụm và chữ phía sau dính liền thành thẻ mới (`<<</style>script`
  ⇒ `<script`). Hiển thị vẫn y như cũ (`<3` đọc ra `<3`).
- `htmlFacts()` nay giải mã entity cơ bản khi so “chữ hiển thị”, để `&lt;` ≡ `<`.
- `tools/check_chapter_html.mjs`: so chữ bằng hàm bóc **thẻ thật** (bắt đầu bằng chữ/slash)
  thay vì bỏ mọi cụm `<…>` — bản cũ nuốt luôn chữ `<3` của tác giả rồi báo sai là bản
  sạch “sinh thêm chữ”.
- Test: `tests/t_sanitize.mjs` thêm 4 mẫu thẻ thiếu `>`, mẫu `<<</style>script`, và **kiểm
  bằng DOM thật (jsdom)**: đầu ra không được dựng `script/iframe/svg/...`, không còn thuộc
  tính `on*`, không còn URL `javascript:`. Fuzz 40.000 chuỗi ngẫu nhiên (atom thẻ/thuộc
  tính/entity) qua DOM: **0 mẫu nguy hiểm**. Toàn bộ 1.283 chương thật vẫn qua
  `tools/check_chapter_html.mjs` (không mất chữ, không mất ảnh).

### 2.7 `GET /api/comments?limit=-1` trả **gần hết** danh sách thay vì 1

`Math.min(parseInt(limit) || 200, 500)` chỉ kẹp trần, không kẹp đáy. `limit=-1` ⇒
`pool.slice(0, -1)` = **bỏ mục cuối, trả tất cả phần còn lại** (hàng rào duy nhất là
500). Cùng lỗi ở `adminComments` (kẹp 2.000). Người đọc chỉ cần sửa `?limit=` là tải
một lượt cả nghìn bình luận — phí băng thông và làm chậm trang.

- Sửa: `Math.max(1, Math.min(...))` ở cả `getComments` và `adminComments`.
- Test: `tests/t_worker.mjs` đăng 3 bình luận rồi gọi `?limit=-1`, đòi đúng 1 mục
  (`shown: 1`); bản cũ trả 2 ⇒ bắt được ngay. Worker: **441/441 ĐẠT**.

### 2.8 Một dòng `null` trong registry làm **sập cả trang chủ**

`CZ.slides()` và `CZ.editorChoice()` đọc thẳng `n.slug` của từng dòng `reg.lib`;
`renderSched()` đọc `it.slug` của từng mục lịch. Một dòng rác (null, số, chuỗi —
import hỏng, sửa KV tay, mảng JSON thừa dấu phẩy) ⇒ `TypeError` NGAY GIỮA lúc
dựng trang chủ, khối thư viện rơi vào khung “Chưa tải được dữ liệu truyện” dù
66 bộ khác vẫn tốt. Trang Chuyển thể Series dính cùng lỗi ở `editorChoice`.

- Sửa: hàm chung `regRows(reg)` chỉ giữ dòng là object (dùng cho `libList`,
  `slides`, `editorChoice`); `renderSched` lọc mục lịch cùng luật.
- Kèm một lỗi nhỏ cùng gốc “dữ liệu bẩn”: `chapters: -3` từng hiện nguyên xi
  nhãn **“-3/-3”** trên thẻ truyện. Nay `norm()` kẹp `chapters`/`declared` ≥ 0.
- Test: `tests/t_registry_dirty.js` (mới, có trong `npm test`) — registry có
  null/rác ở cả `lib`, `slides`, `editorChoice`, `schedule.items` + một bộ số
  chương âm: trang chủ vẫn vẽ thư viện, hero, lịch, không lỗi JS, số chương = 0.
  Đã kiểm ngược: bản cũ **rớt ngay** ở khung “Chưa tải được dữ liệu truyện”.

### 2.9 Cùng dòng rác đó làm **`/admin` không tải được dữ liệu**

Trang quản trị tự đọc lại registry (`admin-real.js`), và lớp đó cũng đọc thẳng
thuộc tính của từng dòng: `lib.map(metaToBook)` ⇒ `m.slug`; sau đó hydrate gọi
`initEditModels()` → `findMeta()` lặp `REG.lib` ⇒ gặp `null` là `TypeError`.
Hậu quả: kết nối Worker xong `/admin` báo `workererr`, Dashboard 0 bộ — đúng lúc
cần vào để dọn dữ liệu thì cửa duy nhất lại khoá. Dòng lịch thiếu `slug` còn làm
`realSaveHomepage()` từ chối lưu (“thiếu thứ hoặc bộ”), nên không tự sửa được.

- Sửa (`admin-real.js`): `hydrate()` chỉ giữ dòng là object **và có slug**, gán
  lại `REG.lib` đã sạch; `findMeta()` chống null; `initEditModels(undefined)`
  trả về sớm; lịch bỏ dòng không có slug.
- Nhờ vậy lần “Lưu trang chủ” kế tiếp **ghi lại registry đã sạch** (dòng rác bị
  loại) — sửa được dữ liệu ngay trong trang quản trị.
- Test: `tests/t_admin_dirty_registry.js` (mới, trong `npm test`) — Worker giả
  trả registry có null/rác ở `lib`, `slides`, `editorChoice`, `schedule.items`;
  đòi `/admin` kết nối được, chỉ còn 1 bộ hợp lệ, tab Thư viện hiện đúng, và
  PUT `/api/registry` ghi lên **không còn dòng rác**. Kiểm ngược: bản cũ rớt.

### 2.10 Registry bẩn bị **dọn ngay lúc ghi** — phòng bệnh, không chỉ chữa

§2.8–2.9 chỉ chặn hậu quả ở phía đọc: dòng rác vẫn nằm trong KV, và mỗi lần
import hỏng / sửa KV tay là lại phải trông vào các lớp đọc tự lọc. Cửa ghi của
registry giờ dọn luôn:

- `worker/cms.js`: thêm `cleanRegistry()` + `registryRowOk()` / `registryRefOk()`
  / `registrySchedOk()`, dùng trong `registryJSON()` — tức **mọi** đường ghi
  registry (`PUT /api/registry`, `/api/seed`, `/api/sync`, nút Lưu của admin)
  đều đi qua một bộ lọc.
  - `lib`: chỉ giữ object có `slug` khác rỗng (sách phải là object; chuỗi
    trong `lib` là dòng hỏng).
  - `slides`, `editorChoice` (cả `settings.editorChoice`): giữ chuỗi slug
    (dạng cũ) hoặc object có `slug`.
  - `schedule.items`: giữ dòng có `slug` (admin ghi) **hoặc** `title`
    (`syncBlogger` đọc từ trang Blogger, trang chủ ghép bộ theo tên) — bỏ oan
    dòng title là mất lịch vừa sync.
- `putKV` dọn **trước** hàng rào “không cho ghi registry rỗng đè lên kho đang
  có sách”, nên một bản chỉ toàn dòng rác bị coi là bản rỗng ⇒ **400**, kho còn
  nguyên. Response có `dropped: {total, lib, slides, editorChoice, schedule}`
  để admin biết đã bỏ bao nhiêu dòng.
- `admin-real.js` (đồng bộ với bộ lọc trên): hydrate giữ dòng lịch chỉ có
  `title` kèm tên bộ, và `currentRegistryFromState()` ghi lại dòng đó dưới dạng
  `{days, title, detail}` thay vì `slug: ''` — bấm “Lưu trang chủ” **không còn
  nuốt mất** lịch cũ do sync về.
- Test: `tests/t_registry_guard.mjs` thêm 3 nhóm kiểm tra (dòng rác bị bỏ + báo
  `dropped`; bản chỉ toàn dòng rác ⇒ 400, kho nguyên; lần ghi sau tự làm sạch
  bản cũ đang bẩn), `tests/t_admin_dirty_registry.js` thêm dòng lịch chỉ có
  `title` phải sống sót qua “Lưu trang chủ”. Dữ liệu thật `data/registry.json`
  (67 bộ, 12 editorChoice, 6 dòng lịch): **0 dòng bị bỏ**.

### 2.11 `sw.js` precache `cz-react.js` — tệp đã chết từ r90

Khối cảm xúc/reaction bị gỡ khỏi trang đọc từ r90 (chính `tests/t_react.js` đang
giữ điều đó), nhưng `PRECACHE` của service worker vẫn còn
`'/cz-react.js?v=20261014feat1'`. Vì precache là “cố gắng hết sức”
(`cache.add(...).catch(() => {})`), cái chết này **không báo gì**: mỗi lần cài
SW vẫn tải thêm 17 kB và kho shell ôm mãi một bản sao không ai gọi.

- Sửa (`sw.js`): bỏ mục `cz-react.js` khỏi `PRECACHE`, sửa chú thích, tăng
  `CZ_SW_VER` `20261104v16` → `20261112v17` (đổi shell mà không tăng version
  thì trình duyệt giữ kho cũ, đúng như cảnh báo đầu tệp).
- Test mới `tests/t_sw_precache.js` (trong `npm test`), khoá 4 điều: mỗi
  `cz-*.js`/`cz.css` trong `PRECACHE` phải (1) có tệp thật ở gốc, (2) có ít
  nhất một trang HTML thật nạp nó, (3) trùng **đúng** chuỗi `?v=` với trang
  (lệch version là kho shell lưu URL mà trang không hỏi ⇒ offline vẫn trượt),
  (4) `CZ_SW_VER` đúng dạng ngày và `C_SHELL` ghép từ nó. Kiểm ngược: trả
  `cz-react.js` về `PRECACHE` thì bài này rớt đúng dòng đó.
- `tests/t_v16.js` ghim cứng `CZ_SW_VER == '20261104v16'`, nên lần tăng version
  hợp lệ này làm nó rớt oan. Đã đổi thành “đúng dạng + không lùi so với mốc
  vòng 16” — giữ đúng ý định (đổi shell phải đánh version mới) mà không khoá
  cứng một chuỗi sẽ lỗi thời.

### 2.12 `npm audit` 2 lỗ hổng **high** — chỉ trong devDependency

`source-map-js@1.2.1` và `undici@8.11.2` (đi kèm `jsdom` bản dev). Đã chạy
`npm audit fix` (không `--force`): lên `undici@8.12.4`, `source-map-js@1.2.2`,
**0 lỗ hổng**; `package-lock.json` chỉ đổi 6 dòng (đều là bản vá trong phạm vi
`^` có sẵn, không thêm gói mới). `npm run build` cho ra bundle **y hệt**
(cùng `?v=`, cùng kích thước), `tools/audit_a11y.mjs` và các bài jsdom vẫn đạt.

### 2.13 `CZ.registry(true)` không bỏ qua memo — chú thích nói một đằng, mã làm một nẻo

`src/cz-app.js` ghi rõ `registry(true)` là “đọc lại từ đầu, bỏ qua memo”, nhưng
điều kiện cũ `memo.reg && (!force || hasLib(memo.reg))` vẫn trả memo khi memo
đang có sách. Trang tác giả/couple gọi `purgeRegistry()` rồi mới `registry(true)`
nên người đọc không thấy lỗi; ai gọi thẳng `CZ.registry(true)` (API công khai
của `CZ`) thì không có tác dụng gì.

- Sửa: `if (!force && memo.reg) return …` — `force` giờ là force, vẫn bỏ qua cả
  localStorage như cũ.
- Test: `tests/t_people_data.js` thêm mục G đếm số lượt gọi `/api/registry`:
  `registry()` thường **không** gọi lại (dùng memo), `registry(true)` **phải**
  gọi lại.

### 2.14 Token Supabase: issuer so bằng **tiền tố** thay vì so khớp tuyệt đối

`worker/cms.js` kiểm `String(payload.iss).indexOf(base) !== 0`, nên hai kiểu
issuer đội lốt đều lọt: `https://sb.test.evil.test/auth/v1` (host của kẻ tấn
công chỉ cần *bắt đầu bằng* URL project) và `https://evil.test/?x=https://sb.test`
(nhét URL vào query). Chưa khai thác được vì chữ ký vẫn phải khớp JWKS của
project đã ghim, nhưng đây là lớp duy nhất còn hở nếu khoá bị lộ.

- Sửa: thêm `supabaseIssuerOk(iss, base)` — chấp nhận đúng 2 dạng thật của
  GoTrue (`<url>/auth/v1`, `<url>`), có/không scheme, tha dấu `/` cuối; ngoài
  danh sách là 401.
- Test: `tests/t_worker.mjs` thêm 3 kiểm tra (đội lốt hậu tố host → 401, nhét
  URL vào query → 401, `/` cuối vẫn nhận), tổng 445 kiểm tra Worker.

### 2.15 Hàng đợi push: trần 45 lượt kiểm/invocation làm **chết đói** sub không cần backend

`drainPushQueue()` dùng chung `PUSH_BATCH = 45` cho hai thứ: số tin gửi và số
lượt *kiểm người nhận* (`pushAudience`). Sub kiểu tài khoản (`scopeVersion 2` +
`ownerId`) phải tra Supabase; khi `SUPABASE_SERVICE_ROLE` chưa đặt hoặc backend
sập, mỗi lượt tra trả `null` (hoãn, đúng chủ ý “fail closed”). Nhưng sub được
duyệt theo **thứ tự khoá KV**, nên chỉ cần 45 sub-tài khoản đứng trước là trần
hết sạch: sub chỉ cần chủ đề (`topics`) — vốn không cần backend — **không bao
giờ** nhận được tin, dù chỉ cần gửi một cái. Job cũng không bao giờ `done`.

- Sửa (`worker/cms.js`): duyệt sub **không cần backend trước**, sub-tài khoản
  sau (`needsBackend()`), giữ nguyên trần 45 và nguyên tắc fail-closed; thêm
  `stat.deferred` + ghi vào log hoạt động để nhìn ra “hoãn N lượt kiểm” thay vì
  im lặng.
- Test: `tests/t_worker.mjs` — 50 sub-tài khoản + 1 sub chủ đề, không cấu hình
  Supabase: sub chủ đề **phải** nhận đúng 1 tin. Kiểm ngược: bản cũ gửi 0.

## 3. Ghi nhận, chưa sửa (không phải lỗi chức năng, cần chủ trang quyết)

1. **`src/cz-react.js` (16,9 kB) giờ không còn ai nạp** — khối cảm xúc gỡ từ r90, `PRECACHE` đã bỏ (mục 2.11), nhưng mã nguồn + tệp build ở gốc vẫn còn. Xoá hẳn thì phải sửa `tools/build_site.mjs`, `tools/check_src.js`, `tools/bundle_budget.mjs` và tài liệu — để chủ trang quyết vì đây là gỡ tính năng, không phải sửa lỗi.
2. **CSP có `'unsafe-inline'` trong `script-src`** (`_headers`) — cần cho các script nội tuyến hiện tại; nghĩa là CSP không chặn được script chèn qua lỗ hổng HTML. Muốn siết phải bỏ dần script nội tuyến (việc lớn, ngoài phạm vi lượt rà này).
3. **Hạn mức chống spam của `community-worker` là best effort** — bộ đếm nằm trong bộ nhớ **một isolate** (`rateWindows`), mỗi isolate đếm riêng, isolate bị thu hồi là về 0. Chặn cứng phải đếm trong D1 (thêm bảng + index) hoặc dùng rate limiting của Cloudflare cho route `/api/community/*` — cả hai đụng hạ tầng production nên chỉ ghi nhận, đã viết rõ trong `community-worker/README.md`.
4. **Dữ liệu lịch sử `'YYYY-MM-DD HH:mm'`** (không có múi giờ) được `Date.parse` hiểu theo múi giờ của máy chạy: Worker (UTC) và trình quản trị (giờ VN) lệch nhau 7 giờ. Chỉ ảnh hưởng chương hẹn giờ nhập từ bản cũ; dữ liệu mới luôn lưu ISO UTC.

## 4. Cách chạy lại

```bash
npm ci && (cd tests && npm ci)
npm run build          # bản phát hành ở gốc phải khớp src/
npm run check:worker
npm test               # 92 bài, gồm t_registry_dirty.js / t_admin_dirty_registry.js / t_sw_precache.js
node tests/t_dice_state.js   # riêng phần trạng thái xấp bài
node tests/t_sanitize.mjs    # riêng bộ lọc HTML (có kiểm bằng DOM thật)
node tools/check_chapter_html.mjs   # chạy bộ lọc trên 1.283 chương thật
```
