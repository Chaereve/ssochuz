# Báo cáo đợt 15/09 — bảo mật · giấu mã nguồn · chuyển động · soát lại web & mobile

Tóm tắt một câu: **vá 8 lỗ hổng (1 lỗi CORS có thể cho trang lạ gọi API, 1 lỗi chèn mã
vào trang quản trị, 3 lỗi thổi số liệu/chèn mã từ dữ liệu người dùng), chặn không cho
người ngoài tải mã nguồn và tài liệu nội bộ qua đường dẫn trực tiếp, rút gọn mã phát hành,
chuyển toàn bộ chuyển động sang thang chuẩn transitions.dev, và sửa 9 điểm giao diện/mobile.**

Trạng thái kiểm thử sau khi xong: **12/12 bài đạt** (`node tests/run.js`), trong đó
`t_worker.mjs` **155/155** (trước là 142 — thêm 13 phép kiểm bảo mật).

---

## Đợt 2 (cùng ngày 15/09) — bộ icon Solar · shimmer · công tắc nền · **vá lỗi menu mobile**

Bốn việc chủ trang yêu cầu, cộng phần soát lại cuối cùng:

| Việc | Kết quả |
| --- | --- |
| **Icon các mục trong trang lấy từ iconbuddy.com/solar** | Đổi bộ Lucide → **bộ Solar** (480 Design, CC BY 4.0 — đã ghi công ở chân trang). 70 icon `-linear` sinh tự động bằng `node tools/gen_icons_solar.mjs`; 2 icon thương hiệu Google/MoMo giữ bản vẽ tay |
| **Shimmer giống uiverse.io/Nawsome/light-husky-91** | Làm lại: một **dải sáng hẹp** (gradient 110°, sáng nhất ở 50%) trượt hết chiều ngang khối trong **1,2s**, chỉ animate `transform` — đúng công thức mẫu, mà không còn chạy `background-position` (tốn vẽ lại từng khung hình). Dải nằm **dưới nội dung** (::before) nên ảnh thật vừa hiện là tự che mất dải. Nền sáng dải 62% trắng, nền tối 10% (`--sheen`) |
| **Nút light/dark giống uiverse.io/andrew-demchenk0/honest-stingray-90** | **Công tắc trượt** đúng mẫu: rãnh 64×34, con chạy 30px trượt 30px, mặt trời quay 15s/vòng và mặt trăng lắc ±10° mỗi 5s khi trỏ vào/focus. Dùng `role="switch"`, nhãn đọc máy nói rõ đang ở nền nào, mỗi cú bấm đổi **đúng một** nhịp. Trang quản trị dùng chung công tắc này |
| **Lỗi: bấm nút menu trên mobile nhưng các mục không hiện** | Xem mục dưới — đã tìm ra **nguyên nhân thật** và vá, kèm bài kiểm thử riêng |

### Lỗi menu mobile — nguyên nhân và cách vá

Hàm `CZ.slide()` có hai nhánh. Nhánh thường thêm lớp `.slid` rồi tự chạy `max-height`;
nhánh dành cho máy bật **“giảm chuyển động”** (Android tiết kiệm pin cũng bật sẵn mục này)
**quên thêm `.slid`** — mà menu `.mnav` chỉ hiện nhờ `.slid` (`display: none` mặc định),
nên nó bật lớp `.on` mà vẫn… `display:none`: bấm nút menu không thấy mục nào.

Đã vá ba lớp, để không bao giờ tái phát:

1. `slide()` thêm `.slid` **trước khi** rẽ nhánh `reduce` (`src/cz-app.js`).
2. CSS mở menu bằng **cả** `.slid` **lẫn** `.on` (`.mnav.slid, .mnav.on { display: block }`).
3. Thêm bài kiểm thử `tests/t_mobile.js`: giả lập `prefers-reduced-motion: reduce`, bấm nút
   menu → menu phải mở, có ≥4 mục, `aria-expanded="true"`, bấm lần hai đóng được, Esc đóng được.
   (Bài `t_home.js` cũ luôn giả lập `matches:false` nên không bắt được lỗi này.)

Ngoài ra: bản đang chạy trên web lúc chủ trang gặp lỗi **chưa có** phần vá nút menu của đợt trước
(commit đợt 1). Đẩy bản mới lên là cả hai lớp vá cùng có hiệu lực.

### Tinh chỉnh cỡ icon cho đồng bộ

Bộ Solar vẽ đầy khung hơn bộ cũ (hình chiếm ~21/24 đơn vị thay vì ~18/24), nên nếu giữ nguyên
cỡ cũ thì **mọi icon trông to hơn chữ**. Đã xử lý hai tầng:

- **Từng icon một**: đo hộp mực thật (render rồi tìm pixel có mực — `tools/measure_icons.mjs`)
  rồi bù tỉ lệ + dời tâm sao cho mọi hình đều ~20,6/24. Nhờ vậy mũi tên, dấu ×, nút ＋ không còn
  bé hẳn so với các icon khác; nét vẽ được chia ngược hệ số phóng nên mọi icon vẫn mảnh đúng 1,5.
- **Cỡ hiển thị**: `.i` từ `1.05em` → **`.94em`**, `.i-s` 15 → **13,5px**, tiêu đề mục 18 → 16px,
  dấu “đã đọc” 15 → 13,5px, nút × trong bảng quản trị 14 → 12,5px. Hộp mực sau khi tính lại **bằng
  đúng** bộ icon cũ (≈0,86em chữ) nên bố cục cũ không xô lệch.

Nhân lúc soát giao diện máy nhỏ, sửa thêm hai điểm:

- **Tablet 761–940px**: logo + 4 chip chữ + nút Tìm + công tắc + nút đăng nhập cộng lại vượt bề
  ngang màn hình nên chip bị bóp. Nay chip tự thu còn **icon** (mỗi chip đã có `title` +
  `aria-label`), vùng bấm giữ 36px; lớp phủ chọn mục tự đo lại nên vẫn khớp.
- **Điện thoại ≤560px**: công tắc thu còn 52×30 (icon 20px) cho vừa một hàng; **≤400px** tên
  thương hiệu rút còn “ssochuz” — trước đây chữ “library” tự xuống dòng làm đầu trang cao bất thường.
- Mặt trời trên nền xanh nhạt đổi sang màu navy `#183153` (**8,6:1** thay vì 1,5:1 như mẫu gốc).

### Soát lại cuối đợt (bảo mật · bug · giao diện)

| Phép soát | Kết quả |
| --- | --- |
| `node tests/run.js` | **13/13 bài đạt** (thêm `t_mobile.js`); `t_worker.mjs` **155/155** |
| `node tools/check_html.js` | HTML sạch, `_redirects` **28 luật** an toàn, không vòng lặp |
| `python3 tools/check_css.py` | **0** lớp dùng trong HTML/JS mà CSS chưa định nghĩa |
| `node tools/check_calls.js` | Không có hàm “ma” |
| Bảo mật phần mới | Không thêm miền/script ngoài nào (chỉ 1 liên kết ghi công tới `iconbuddy.com`); không `eval`, không `innerHTML` dựng từ dữ liệu người dùng; CSP và các header trong `_headers` **giữ nguyên**; hai công cụ mới nằm trong `/tools/*`, bài kiểm thử mới nằm trong `/tests/*` — đã bị luật 301 chặn sẵn, không cần thêm luật |
| Kích thước bản phát hành | 557,2 kB → **377,3 kB** (rút gọn 32%) |
| Phiên bản | Web **1.9.2**, HTML `?v=20260915e`. Worker **giữ 1.9.1** — đợt này **không sửa Worker**, nên **không cần deploy lại Worker** (nếu đợt trước đã deploy 1.9.1) |

Ghi chú kỹ thuật nhỏ: `package.json` ghim `esbuild` đúng **0.25.0** (trước để `^0.25.0`). Bản rút gọn
được so **từng byte** với `src/`, nên chỉ cần lệch phiên bản esbuild là `check_src.js` báo lỗi oan
(khác 4 ký tự như `,function(){}()` vs `,(function(){}())`). Ghim lại cho bản build lặp lại y hệt.

---

## 1. Bảo mật — đã tìm và vá

| # | Lỗ hổng | Mức độ | Đã vá thế nào |
| --- | --- | --- | --- |
| 1 | **CORS so khớp sai ranh giới tên miền** — `ALLOW_ORIGIN = chuseoz.pages.dev` thì `acchuseoz.pages.dev` (trang do người khác đăng trên Cloudflare Pages) cũng được phản chiếu origin → trang lạ đọc/xoá được dữ liệu qua API nếu có khoá, và dò khoá thoải mái | Cao | So khớp theo **host** + đúng dấu chấm (`chuseoz.pages.dev`, `*.chuseoz.pages.dev`). Bỏ `access-control-allow-credentials` (web dùng header, không cookie). Bản xem trước chỉ mở cho `localhost` / `*.e2b.app` |
| 2 | **Chèn mã vào trang quản trị qua ô “link” của báo lỗi** — `POST /api/report` nhận `url` tuỳ ý, `/admin` in nút **Mở** trỏ thẳng vào đó ⇒ dán `javascript:…` là chạy mã trong phiên quản trị | Cao | Máy chủ chỉ nhận `http(s)` và phải thuộc tên miền của web (`*.pages.dev`, `*.blogspot.com`); còn lại lưu rỗng. Trang quản trị vẫn escape khi in |
| 3 | **HTML nhập từ Blogger giữ thuộc tính lạ** — `<p onclick=…>`, `<a href="javascript:…" onmouseover=…>` đi thẳng vào trang đọc | Cao | `cleanPost()` gỡ mọi thuộc tính của `p/b/strong/i/em/u`; `<a>` chỉ dựng lại khi `href` là `http(s)` (kèm `rel="noopener nofollow"`), còn lại bỏ thẻ giữ chữ |
| 4 | **Thổi số lượt đọc / phiếu bầu** — `vid` do trình duyệt gửi, đổi liên tục là mỗi lần tính một người mới ⇒ bơm số vô hạn | Cao | Thêm trần theo **IP**: lượt đọc ≤ 600/giờ (quá thì *không đếm*, không báo lỗi — người đọc sau NAT không thấy gì khác), phiếu ≤ 150/giờ |
| 5 | **Dò khoá quản trị** — `/api/whoami` không giới hạn số lần thử | Vừa | Sai quá **25 lần/10 phút/IP** → khoá tạm 10 phút. Chỉ đếm lần SAI nên chủ trang không bị chặn oan |
| 6 | **Ảnh đại diện bình luận nhận mọi chuỗi** (kể cả `javascript:`, `data:`) | Vừa | Chỉ nhận `http(s)://…` |
| 7 | **Khoá quản trị nằm trong `localStorage`** — lỗi chèn mã bất kỳ ở đâu cũng đọc được; máy dùng chung thì mở là vào được `/admin` | Vừa | Mặc định cất trong **`sessionStorage`** (đóng trình duyệt là mất); chỉ khi tích *“Ghi nhớ khoá trên máy này”* mới ghi `localStorage` |
| 8 | **Thiếu header an toàn** — không CSP, không chống nhúng iframe, không `nosniff` | Vừa | `_headers` thêm **Content-Security-Policy** (chỉ nạp mã từ chính web + Google Identity + jsDelivr/unpkg cho supabase-js + Google Fonts), `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`. Phản hồi JSON của Worker thêm `nosniff` + `no-referrer` |

### Tự kiểm tra nhanh

```bash
node tests/t_worker.mjs     # 155 phép kiểm, có cả nhóm “BẢO MẬT (bản vá 1.9.1)”
curl -s https://<worker>/api/health | grep version    # phải là 1.9.1
curl -sI https://ssochuz.pages.dev/worker/cms.js      # phải 301 về /
```

---

## 2. Giấu mã nguồn khỏi Developer Tools — làm được tới đâu

**Đã làm:**

1. **Rút gọn bản phát hành.** Mã đọc được chuyển vào `src/`, `npm run build` sinh bản
   rút gọn ra thư mục gốc (`508 kB → 339 kB`): mất toàn bộ chú thích tiếng Việt mô tả hệ
   thống (tên khoá KV, danh sách endpoint, luồng quản trị), mất tên biến/hàm nội bộ,
   không có source map. `node tools/check_src.js` báo nếu hai bản lệch nhau.
2. **Chặn tải trực tiếp các phần nội bộ.** `_redirects` đưa `/src/*`, `/worker/*`,
   `/tests/*`, `/tools/*`, `/_inbox/*`, `/blogger-theme/*`, `server.py` và các tệp `.md`
   về trang chủ bằng 301 — luật redirect luôn được áp **trước** khi phục vụ tệp tĩnh
   (Cloudflare Pages chỉ nhận 3xx/200 trong `_redirects`, không nhận mã 404).
3. **Không còn gì bí mật trong trình duyệt.** `ADMIN_KEY`, `SESSION_SECRET`,
   `RESEND_API_KEY`… chỉ nằm trên Worker; mã gửi cho trình duyệt không chứa khoá nào.
4. **Trang 404 riêng** thay cho trang mặc định của Cloudflare (trước đây lộ cả thương
   hiệu “Nothing is here yet”).
5. **Đổi nhãn giao diện còn tiếng Anh** (Library / Latest / Top vote / Schedule / Theme /
   Search / My Space) sang tiếng Việt — theo đúng yêu cầu “giao diện là tiếng Việt”.

**Không làm được (và không nên giả vờ là làm được):**

- Mã chạy trong trình duyệt thì **luôn** đọc được bằng DevTools → Sources. Rút gọn làm
  việc đọc tốn công, **không** phải chặn hẳn. Muốn kín hơn thì chuyển logic xuống Worker.
- Chặn F12 / chuột phải **không** che được gì: vẫn mở lại được, vẫn thấy URL ảnh và API ở
  tab Network; đổi lại thì làm web khó dùng và mất người đọc. Nên không làm.
- Repo GitHub của web đang là **private**, nên mã không lộ qua đường GitHub.

---

## 3. Chuyển động theo transitions.dev

Đã học 32 tệp của thư viện `transitions-dev` (`npx transitions-dev add --free`) và áp
đúng nguyên tắc của nó vào `cz.css`:

- **Thang token dùng chung** (`:root`): đường cong mở `cubic-bezier(.22,1,.36,1)`, đường
  cong đóng `cubic-bezier(.4,0,1,1)`, nhịp `150ms / 250ms / 350ms / 450ms`, quãng dịch
  `16px`, nhoè `2px`, thu `0.96`. Không nơi nào tự đặt nhịp riêng.
- **MỞ chậm – ĐÓNG nhanh** cho hộp thoại, bảng tệp lệnh, tấm trượt bên, gấp/mở nhóm chương,
  “Xem thêm”: JS gỡ `.on` sau đúng nhịp đóng nên đóng có animation chứ không biến mất khô.
- **Chỉ chạy trên `transform` / `opacity` / `filter`** (không animation thuộc tính gây
  dựng lại bố cục), `will-change` đặt đúng chỗ và chỉ trên lớp đang chuyển.
- **Gấp/mở bằng `grid-template-rows: 0fr → 1fr`** thay vì đo chiều cao bằng JS; ruột mờ +
  nhoè dần.
- **Có animation mới cho**: đổi icon tại chỗ (mặt trời ⇄ mặt trăng, mũi tên xem thêm),
  số vừa đổi (`numrun`), lỗi rung nhẹ (`shake`), ảnh bìa hiện dần, dấu tick vẽ dần khi gửi
  thành công, thông báo nổi trồi lên.
- **`prefers-reduced-motion: reduce`**: một luật toàn cục tắt mọi animation/chuyển động —
  trạng thái vẫn hiện đúng, chỉ bỏ phần di chuyển.

---

## 4. Soát lại giao diện web + mobile — 9 điểm đã sửa

| # | Điểm | Vì sao là lỗi |
| --- | --- | --- |
| 1 | **Hộp thoại cao hơn màn hình thì không cuộn được** (form báo lỗi trên điện thoại) | `.modal` là lớp phủ `fixed` không có `overflow` ⇒ nút *Gửi báo lỗi* nằm ngoài tầm với. Nay chính lớp phủ cuộn được, hộp thoại chừa lề dưới, màn hình thấp bớt lề trên |
| 2 | **Chữ gợi ý quá nhạt** — `--dim` chỉ đạt **2,7:1** (chuẩn là 4,5:1), gần như không đọc được | Sáng `#9a9086 → #756b61` (4,5:1), tối `#837a6d → #8a8174` (4,5:1) |
| 3 | **Chữ 9–10,5px trên điện thoại** (huy hiệu 18+, pill, nhãn lọc, trục biểu đồ) | Nâng sàn 11px ở khổ ≤ 560px |
| 4 | **Nút cao 26–36px, dễ bấm trượt** | `.hbtn`, `.nav a`, `.pg`, `.ibo` → 40px; `.mv`, `.qclr` → 34px; hàng tab ≥ 40px |
| 5 | **Nhãn nút dài tràn ra ngoài màn hình** (`white-space: nowrap` trên `.btn`) | Ở khổ ≤ 560px cho phép xuống dòng, canh giữa |
| 6 | **Menu điện thoại chỉ đóng được bằng cách bấm lại đúng nút** | Thêm đóng bằng `Esc`, bấm ra ngoài, và trả tiêu điểm về nút menu |
| 7 | **Nút menu không báo trạng thái cho trình đọc màn hình** | `aria-expanded` + `aria-controls` được cập nhật khi mở/đóng |
| 8 | **Thông báo nổi không được đọc lên** | Hộp thông báo có `role="status" aria-live="polite"` |
| 9 | **Ô báo lỗi không giới hạn ký tự** (máy chủ cắt ở 4000, người viết không biết) | `maxlength="4000"` + đếm “còn N ký tự” khi gần hết |

Thêm: khi mở hộp thoại, tiêu điểm được đưa vào ô đầu tiên và khi đóng thì trả về nút đã
mở hộp thoại (người dùng bàn phím không bị lạc).

**Đã kiểm bằng máy:** 12 bài kiểm thử (jsdom) chạy trên **đúng bản đã rút gọn**; bài
`t_sweep.js` bấm hết mọi nút trên các trang để bắt lỗi JS; bài `t_home.js` nay kiểm cả
hành vi menu điện thoại (mở → `aria-expanded=true`, `Esc` → đóng, bấm ra ngoài → đóng).

---

## 5. Việc cần làm để lên sóng

1. **Worker 1.9.1**: dán lại `worker/cms.js` vào Cloudflare → Deploy, rồi mở `/api/health`
   xem `version` đã là `1.9.1`.
2. **Web**: đẩy thư mục gốc lên như thường lệ (Pages tự deploy theo GitHub). Nhớ rằng các
   tệp `cz-*.js`, `admin.js`, `cz.css` ở thư mục gốc là **bản rút gọn tự sinh** — sửa mã thì
   sửa trong `src/` rồi `npm run build`.
3. **Tuỳ chọn**: vào `/admin` một lần, để khoá quản trị nằm trong `sessionStorage` (đừng
   tích “Ghi nhớ” trên máy chung).

## 6. Còn lại

- **Icon web**: đang chờ tệp ảnh. Link Filebin (`filebin.net/thvquluq4adymq5r`) không tải
  được từ môi trường này (máy chủ Filebin chặn/kết nối bị cắt), nên nhờ chủ trang **đính
  kèm ảnh `ssochuz.png` ngay trong khung chat**. Có ảnh là chạy
  `python3 tools/make_icons.py <ảnh>` và đổi `?v=2` → `?v=3` ở các thẻ icon.
