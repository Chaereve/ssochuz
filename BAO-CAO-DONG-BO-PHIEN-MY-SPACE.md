# Báo cáo 17/09 — My Space nhận đúng phiên Google: hết "đăng nhập rồi vẫn mời đăng nhập", tên và ảnh đồng bộ

Tóm tắt một câu: **tìm ra ba bệnh thật khiến "đăng nhập Google xong My Space vẫn hiện thông báo phải
đăng nhập" và "tên/ảnh không vào trang"** — supabase-js đổi `?code=…` bất đồng bộ mà web kết luận
"khách" quá sớm, hồ sơ máy chủ mới khởi tạo bằng "Bạn đọc" + ảnh rỗng rồi đè lên danh tính Google, và
`applyServerProfile` xoá ảnh Google khi hồ sơ chưa chọn ảnh — vá cả phía web lẫn Worker (bản **1.9.9**),
kèm một loạt cải tiến cho toàn trang My Space.

Trạng thái kiểm thử sau khi xong: **`node tests/run.js` → Tất cả bài kiểm thử đều đạt** (41 mục, gồm
3 bài kiểm tra công cụ + 38 bộ kiểm thử). Riêng `t_auth_flow.js` nay có **23 phép kiểm** (thêm nhóm D:
phiên về muộn qua `onAuthStateChange`; nhóm E: hồ sơ máy chủ không được xoá ảnh Google), `t_space.js`
thêm **2 khối** (đồng bộ tài khoản; thao tác trong tủ + 409 + bàn phím), `t_member_spaces.mjs` thêm
nhóm *gieo danh tính — ảnh https — cờ `avatarOff`*.

> ## ⚡ VIỆC CẦN LÀM SAU KHI MERGE (1 phút — không bắt buộc, nhưng nên làm)
>
> 1. **Deploy lại Worker**: dán `worker/cms.js` + `worker/member-spaces.js` (bản **1.9.9**) vào
>    Cloudflare → Workers → `chuseoz-cms` → Deploy (hoặc `npx wrangler deploy`).
>    Kiểm tra: `https://chuseoz-cms.kimtong1906.workers.dev/api/health` phải trả `"version":"1.9.9"`.
> 2. Mở `/my-space` bằng tài khoản Google: tên + ảnh phải hiện **ngay** ở cả thanh đầu trang lẫn
>    phần đầu My Space; không còn lời mời đăng nhập; không cần F5 sau khi Google trả về.
> 3. **Không deploy Worker cũng không sao**: web đã tự gieo tên/ảnh vào hồ sơ ngay lần đầu mở
>    My Space. Bản 1.9.9 chỉ làm việc đó ở phía máy chủ (hồ sơ công khai có danh tính ngay từ lần
>    đăng nhập đầu, kể cả khi chủ tài khoản chưa từng mở trang).
>
> Sau khi deploy, người đang mở web sẽ thấy dải *"Đã có bản cập nhật — tải lại"*; bấm tải lại là
> nhận mã mới (`?v=20260917a`, `CZ_SW_VER` mới).

---

## 1. Ba bệnh thật và cách vá

### 1.1 "Đăng nhập Google xong rồi mà trang vẫn mời đăng nhập"

**Bệnh:** Supabase trả về `?code=…`; supabase-js đổi mã đó thành phiên **bất đồng bộ**. Bản cũ gọi
`getSession()` đúng một lần rồi kết luận ngay "không có phiên", `save(null, null)` và đứng im — người
dùng đã đăng nhập vẫn thấy khối *"Đăng nhập để mở tủ truyện"*, tên/ảnh không hiện, phải F5 mới đúng.
Bản cũ cũng không nghe `onAuthStateChange`, nên phiên về muộn **không bao giờ** được nhận.

**Vá (web):**

| # | Việc | Chi tiết |
| --- | --- | --- |
| 1 | **Máy trạng thái phiên** | `CZ_AUTH.state()` → `checking` / `in` / `out`; `settle()` chỉ chốt khi chắc chắn; `whenSettled()` + `onReady(fn)` cho trang chờ; sự kiện `cz:auth-ready` |
| 2 | **Nghe sự sống của phiên** | `bindAuthEvents()` theo `onAuthStateChange`: `SIGNED_IN` → đổi token; `TOKEN_REFRESHED` → giữ phiên Worker 30 ngày nếu đã xác thực; `SIGNED_OUT` → xoá sạch + chốt "khách" |
| 3 | **Vừa đi đăng nhập về thì phải chờ** | `justCameBack()` (URL có `code`/`token_hash`, hoặc cờ `ssochuz-auth-pending`) + `awaitSession()` thử lại `getSession()` tối đa 8 lần × 450 ms — chỉ khi **không** vừa quay về mới được kết luận "khách" |
| 4 | **Không còn nháy sai** | `#spaceGuest` để `hidden` sẵn trong HTML; trang chỉ mở lời mời khi `state() === 'out'`; đang `checking` thì hiện thẻ *"Đang kiểm tra phiên đăng nhập…"* |
| 5 | **Lỗi trả về từ Google/Supabase không bị nuốt** | `?error=`/`?error_description=` nay hiện thông báo rõ ("Đăng nhập chưa xong: …") rồi dọn URL |

### 1.2 "Tên và ảnh không đồng bộ"

**Bệnh A — hồ sơ máy chủ sinh ra đã vô danh.** Durable Object khởi tạo hồ sơ bằng
`{ name: "Bạn đọc", avatar: "" }`, mà trang lại ưu tiên hồ sơ máy chủ ⇒ người vừa đăng nhập thấy tên
chung chung; nếu chỉ sửa mô tả rồi bấm Lưu thì "Bạn đọc" bị ghi vĩnh viễn.

**Vá:** `displayProfile()` chỉ để hồ sơ máy chủ thắng khi người dùng **đã thực sự lưu** (`version > 0`);
Worker 1.9.9 gieo tên/ảnh tài khoản đã xác thực vào hồ sơ mới qua header `x-cz-name`/`x-cz-pic`; web
tự gieo khi hồ sơ còn `version 0` (nên **vẫn đúng kể cả khi Worker chưa cập nhật bản mới**); nếu máy
chủ đã gieo sẵn đúng danh tính thì web không ghi lại — giữ `version 0` để tên/ảnh còn đi theo tài khoản.

**Bệnh B — lưu hồ sơ là ảnh Google bị xoá.** `applyServerProfile` cũ gán `picture = avatar || ''`, nên
hồ sơ còn `avatar` rỗng là ảnh Google trên thanh đầu trang bị xoá ngay khi mở My Space.

**Vá:** chỉ thay ảnh khi máy chủ có quyết định thật (`avatar` khác rỗng **hoặc** cờ `avatarOff`); không
có gì đổi thì không gọi `save()` (chống vòng lặp auth → fetch → auth). Cờ `pictureSet` trong
`ssochuz-profile-<uid>` giữ đúng ý "người dùng đã chủ động bỏ ảnh" qua các lần tải lại.

### 1.3 "Bỏ ảnh" và "Đăng xuất" để lại rác

- **Bỏ ảnh** giờ là một quyết định có tên: `avatarOff` đi kèm hồ sơ; Durable Object phân ba ca rõ ràng —
  có ảnh mới → dùng ảnh đó; ảnh rỗng + `avatarOff` → xoá hẳn; ảnh rỗng mà không có cờ (khách cũ chỉ gửi
  tên) → **giữ ảnh cũ**, không xoá oan.
- **Ảnh tài khoản** nhận cả `https://…` (ảnh Google, ≤ 2048 ký tự) lẫn `data:image/…` tự cắt (≤ 250 000
  ký tự, có kiểm tra magic bytes) — trước chỉ nhận `data:`.
- **Đăng xuất** xoá sạch phần phụ thuộc tài khoản: danh sách tủ, khung hồ sơ (disabled), tên/mô tả/ảnh
  xem trước, liên kết hồ sơ công khai, thông báo — không còn sót tên người cũ trên máy dùng chung.
- **Hết phiên (401)** có ba nút chữa cháy đúng thứ tự: *Thử lại* → *Kiểm tra lại phiên* (gọi
  `CZ_AUTH.refresh()`) → *Đăng xuất & đăng nhập lại*, kèm câu giải thích vì sao.

---

## 2. Cải tiến phần còn lại của trang

| Nhóm | Đã làm |
| --- | --- |
| Đầu trang | Hero lấy tên/ảnh tài khoản ngay khi biết phiên; thẻ trạng thái có `data-kind` (đang tải / lỗi / xong) và **rỗng thì biến mất hẳn**; bảng *"Vì sao?"* (`#spaceDiag`) đọc `CZ_AUTH.diagnose()` + lỗi đổi token gần nhất để tự chẩn đoán |
| Tab | Đồng bộ với `#hash` (mở thẳng `/my-space#history` được), mũi tên trái/phải + Home/End, `aria-selected`/`tabIndex` đúng chuẩn |
| Tủ truyện | Nút **Bỏ khỏi tủ** ngay dưới bìa (không phải mở hộp *Sửa tủ*); hộp chọn truyện lọc theo tên/tác giả/couple và có nút *Hiện thêm* khi thư viện dài |
| Xung đột | Tab khác đã ghi trước (409): nạp lại dữ liệu, giữ nguyên bản nháp và nói rõ *"bấm Lưu lần nữa"* — không im lặng mất thao tác |
| Lịch sử | Bìa truyện, thanh tiến độ, nhãn *đã hết*, nút *Xoá* từng bộ (chỉ xoá tiến độ của bộ đó) |
| Thống kê | Bốn ô số + biểu đồ 7 ngày vẽ từ `CZ.myReadSummary()` |
| Hồ sơ | Đếm ký tự (40/500) có cảnh báo đỏ khi tới hạn; kéo–thả ảnh; *Di chuyển & cắt ảnh*; **Dùng ảnh Google**; **Bỏ ảnh**; nút chép liên kết hồ sơ công khai; thông báo lỗi/thành công theo `data-kind` |
| Hồ sơ công khai | Trang `/profile?id=…` viết lại: 404 rõ ràng khi chưa có hồ sơ, tiêu đề trang theo tên người đọc, chỉ hiện tủ `public` |
| CSS | `[hidden] { display: none !important }` đặt **cuối** tệp (xem mục 4); thẻ trạng thái, lưới lịch sử, khung chọn truyện, quy tắc điện thoại |
| Cache | Toàn bộ HTML + `sw.js` sang `?v=20260917a`; `Cache-Control: no-cache` thêm cho `/cz-space.js` và `/cz-people.js` (trước đó hai tệp này chỉ trông vào `?v=`) |
| Hồ sơ riêng tư | Bốn báo cáo cũ (`RANKING-VA-TOM-TAT`, `SUA-LOI-BIA-TRUYEN`, `SUA-LOI-DANG-NHAP-VA-GIAO-DIEN`, `UNSLOP-HEADER-VA-THE-TRUYEN`) nay được chuyển hướng về `/` như các báo cáo khác — không còn phơi ra ngoài |

**Giới hạn máy chủ vẫn giữ nguyên** (đã có kiểm thử): tên ≤ 40, mô tả ≤ 500, tủ ≤ 24, mỗi tủ ≤ 200
truyện, tên tủ ≤ 60 / mô tả tủ ≤ 300, slug chỉ `[a-z0-9-]`, PUT một thay đổi mỗi lần và khoá theo
`version` (409 khi lệch).

---

## 3. Bằng chứng trước / sau (kịch bản dựng lại trong `tests/`)

| Tình huống | Trước | Sau |
| --- | --- | --- |
| Vừa quay về từ Google, phiên về sau vài nhịp | `#spaceGuest` hiện, hero "My Space" | `#spaceGuest` ẩn, hero hiện tên tài khoản |
| Token Google đã xác thực, mở My Space lần đầu | Hero "Bạn đọc", ảnh Google bị xoá | Hero tên thật + ảnh Google, hồ sơ được gieo một lần |
| Hồ sơ máy chủ `{name:"Bạn đọc", avatar:""}` | `applyServerProfile` xoá ảnh tài khoản | Không đổi gì, không ghi đè |
| Bấm **Bỏ ảnh** rồi tải lại | Ảnh Google quay lại | Vẫn trống, cờ `avatarOff` được nhớ |
| Tab khác ghi trước (409) | Thao tác im lặng thất bại | Nạp lại + báo rõ, bản nháp còn nguyên |

---

## 4. Kiểm thử và giới hạn

- `node tests/run.js` → **tất cả đạt**; `node tests/t_auth_flow.js` → `{"dat":23,"errors0":[]}`;
  `node tests/t_space.js` → 3 khối đạt; `node tests/t_member_spaces.mjs` → đạt (Worker + Durable Object
  thật, có kiểm tra gieo danh tính, ảnh https, cờ `avatarOff`, 409, giới hạn ảnh).
- **Chưa chụp được ảnh giao diện thật**: máy này không cài được Chromium
  (`npx playwright install chromium` tải thất bại), nên phần kiểm tra giao diện dựa trên jsdom +
  `getComputedStyle` (có bắt được lỗi ẩn/hiện) và soát HTML/CSS tĩnh.
- **Một ghi chú kỹ thuật đáng nhớ:** jsdom không xếp `!important` theo thứ tự ưu tiên như trình duyệt
  (nó lấy khai báo **cuối tệp**). Vì vậy `[hidden] { display: none !important }` được đặt ở **cuối**
  `cz.css`: trình duyệt thật không đổi hành vi (vốn `!important` thắng bất kể vị trí), còn bài kiểm thử
  phản ánh đúng điều người dùng thấy.
- Nhắc lại nguyên nhân gốc đã vá hôm 16/09 (Worker 1.9.8): token Supabase đời mới ký **ES256**, Worker
  phải được **ghim project** (`SUPABASE_URL` hoặc lưu ở `/admin`). Nếu `/api/health` báo
  `supabase:false`, xem lại bước ghim trước khi đổ lỗi cho giao diện.
