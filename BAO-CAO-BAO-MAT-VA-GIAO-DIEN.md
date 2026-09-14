# Báo cáo đợt 15/09 — bảo mật · giấu mã nguồn · chuyển động · soát lại web & mobile

Tóm tắt một câu: **vá 8 lỗ hổng (1 lỗi CORS có thể cho trang lạ gọi API, 1 lỗi chèn mã
vào trang quản trị, 3 lỗi thổi số liệu/chèn mã từ dữ liệu người dùng), chặn không cho
người ngoài tải mã nguồn và tài liệu nội bộ qua đường dẫn trực tiếp, rút gọn mã phát hành,
chuyển toàn bộ chuyển động sang thang chuẩn transitions.dev, và sửa 9 điểm giao diện/mobile.**

Trạng thái kiểm thử sau khi xong: **12/12 bài đạt** (`node tests/run.js`), trong đó
`t_worker.mjs` **155/155** (trước là 142 — thêm 13 phép kiểm bảo mật).

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
