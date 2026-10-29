# Hero banner dùng chung — “Nổi bật hôm nay / Did You Know” (2026-10-29)

> Trạng thái: đã làm trên nhánh `arena/8c2df8a1-ssochuz`. `npm run build` + `npm test`
> xanh (1 bài lỗi **có sẵn từ trước**, không liên quan: xem §7).
> Phiên bản sản phẩm **không đổi** (`1.20.0`) — đây là thay đổi giao diện, không phải bản phát hành.

## 1. Hiện trạng trước khi sửa (khảo sát)

| Câu hỏi | Trả lời (bằng chứng) |
| --- | --- |
| Hero chính nằm ở đâu? | `index.html` → `<section class="hero" id="hero">`, dựng bằng JS trong `src/cz-home.js` (`heroSlide/paintSlide/heroPaint/goSlide/heroInit`) |
| “Did You Know / Nổi bật hôm nay” là khối riêng? | **Không.** Đó là **nhãn `eyebrow` của slide đầu** trong hero (`n._reason \|\| 'Nổi bật hôm nay'`, `src/cz-home.js`). Trang chỉ có **một** khối hero; không có section thứ hai để so sánh “Style A / Style B”. “Did You Know” là tên một bộ truyện trong registry (`/truyen/did-you-know/`) |
| Hai section có dùng chung component? | Không — chỉ có một khối, và nó **chưa** là component (markup + logic nằm lẫn trong `cz-home.js`) |
| CSS dùng kiểu gì? | Một tệp `src/cz.css` (CSS thuần, BEM-lite, biến `--*` trong `:root` và `[data-theme="dark"]`) |
| Có carousel library? | Không. `package.json` không có Swiper/Embla/… → giữ đúng tinh thần “không thêm dependency”, viết carousel bằng 40 dòng |
| Design token ở đâu? | `src/cz.css` §1 `:root` + `[data-theme="dark"]` (`--acc`, `--bg`, `--txt`, `--mut`, `--r*`, `--t*`, `--ease*`) |
| Ảnh nào đang có? | `thumb`/`slide` của registry → bìa dọc 480×600 (mirror ở `/assets/covers/*.webp`). **Không có** ảnh ngang/banner trong API → xem §6 |
| 4 ảnh tham chiếu | `reference-1-hero-desktop.png` … `reference-4-competitor-mobile.png` **không có trong repo** → không đối chiếu được từng pixel (xem §8) |

## 2. Kết quả

- Hero đổi từ **thẻ dọc** (áp phích 2:3 bên phải + số “01” mờ + nền phẳng) sang **banner full-bleed**:
  ảnh nền `<img>` phủ toàn section, hai lớp gradient, nội dung một cột bên trái,
  dải thumbnail góc dưới-phải (desktop), dot pagination (mobile).
- Toàn bộ phần dựng/vận hành nằm trong **một component dùng chung**: `CZ.heroBanner(root, props)`
  (`src/cz-hero.js`). `src/cz-home.js` chỉ còn nhiệm vụ **đổi dữ liệu truyện → `HeroBannerItem[]`**.
- Giữ nguyên: số chương, tác giả, couple, ngày cập nhật, tình trạng, 18+, “MỚI”, mật mã,
  tiến độ đang đọc, CTA “Đọc từ đầu / Đọc tiếp / Nhập mật mã”, “Thông tin”, **“Lưu vào tủ”**,
  gợi ý phím tắt, autoplay + vạch đếm thời gian, vuốt ngang, ← →.
- Thêm (đúng yêu cầu): nút **Tạm dừng / Tiếp tục** cho autoplay (WCAG 2.2.2 — trước đây hero
  tự chuyển slide mà không có cách dừng), live region “Mục x / y”, `aria-current`/`aria-selected`,
  `prefers-reduced-motion` (không autoplay, không crossfade), ảnh lỗi vẫn đọc được chữ.

## 3. Tệp thay đổi

| Tệp | Vì sao |
| --- | --- |
| `src/cz-hero.js` **(mới)** | Component `CZ.heroBanner`: nhận `items` qua props, dựng markup, crossfade, autoplay + pause/play, bàn phím, vuốt, live region, fallback |
| `src/cz-home.js` | Bỏ ~180 dòng dựng/vận hành hero; thêm `heroItem()` (map dữ liệu truyện → `HeroBannerItem`) và `mountHero()` |
| `src/cz.css` §5 | Viết lại khối hero: `--hb-*` (bảng màu “trên ảnh”, khai báo một lần), ảnh nền full-bleed, gradient, CTA pill, thumbnail 16:10, dot, responsive 1023/639/380px; thêm `.sr-only`; khôi phục `.eyebrow` (trước nằm trong khối hero cũ) |
| `index.html` | `<section id="hero">` rỗng (component tự dựng); nạp thêm `/cz-hero.js`; `?v=` của `cz-home.js` |
| `src/cz-app.js` | Icon `pause` (Tabler `player-pause`) do `tools/gen_icons_tabler.mjs` sinh — cặp play/pause cùng bộ nét |
| `tools/gen_icons_tabler.mjs` | Thêm `pause: 'player-pause'` vào MAP |
| `tools/build_site.mjs`, `tools/check_src.js` | Thêm `cz-hero.js` vào danh sách rút gọn / so khớp |
| `tools/bundle_budget.mjs` | Trần riêng cho `cz-hero.js` (warn 12,5 kB · max 16 kB; thực tế 12,0 kB) |
| `sw.js` | `CZ_SW_VER` mới + precache `/cz-hero.js?v=20261029hero1`, `cz-home.js?v=20261029hero1` |
| `_headers` | `no-cache` cho `/cz-hero.js` |
| `tests/t_hero.js` **(mới)**, `tests/run.js`, `tests/README.md`, `tests/t_home.js` | Bài kiểm thử cho banner (xem §7) + cập nhật khoá báo cáo cũ `hasBlurBg` → `hasMediaBg/hasDarkScrim/playBtn` |

## 4. Component, props, state

```js
CZ.heroBanner(rootEl, {
  items, initialIndex, autoPlay, autoPlayInterval,
  showThumbnails, showDots, loop
});
```

- **Không đọc registry/localStorage/URL.** Mọi thứ đi qua `items` (hợp đồng `HeroBannerItem`
  ghi ở đầu `src/cz-hero.js`), nên cùng một component dùng được cho hero trang chủ và cho
  bất kỳ khối “nổi bật” nào khác (thêm một dòng `CZ.heroBanner(root, { items })`).
- Trường **mở rộng có chủ đích** so với bản gốc của yêu cầu: `href` (link tiêu đề),
  `badges[].tone/dot/icon`, `meta[].strong/title`, `progress {current,total,percent,label}`,
  `primaryCta.disabled`, `secondaryCtas[].pressed/title/onClick(btn, item, api)`.
  Chúng chỉ để **giữ đủ dữ liệu cũ** (tình trạng, 18+, tiến độ, “Lưu vào tủ”) mà không phải
  nhét HTML vào props.
- **State carousel** nằm trong component (`this.index`, `this.userPaused`, `this.hovered`,
  `this.focused`, `this.timer`). Trang chủ không giữ state slide nào; `pageshow` chỉ gọi
  `mountHero()` và component giữ lại `index` cũ.
- API công khai nhỏ: `goTo/next/prev`, `paint`, `actionLabel(btn, label, pressed)` (đổi nhãn
  “Lưu vào tủ” ⇄ “Đã lưu” + `aria-pressed`), `destroy()`.

## 5. Quyết định mặc định đã chọn

| Vấn đề | Chọn | Lý do |
| --- | --- | --- |
| Autoplay | Component mặc định **tắt** (`autoPlay: false`). Trang chủ truyền `autoPlay: true` để **giữ hành vi cũ** (8 giây/slide) | Bỏ autoplay là bỏ một tính năng đang chạy; nhưng nay có nút **Tạm dừng/Tiếp tục**, dừng khi rê chuột, khi focus bàn phím, khi tab bị ẩn, và tắt hẳn khi `prefers-reduced-motion` (WCAG 2.2.2) |
| Mobile | Ẩn mô tả (`.syn`), ẩn gợi ý phím, **CTA chính giữ chữ**, “Thông tin” + “Lưu vào tủ” thu thành **nút icon 44×44** (nhãn vẫn ở `aria-label`) | Đủ chỗ cho tiêu đề + 1 CTA; **không mất** chức năng lưu tủ |
| Desktop | Giữ gợi ý phím tắt (đã có từ trước, không phá bố cục) | Yêu cầu: chỉ đưa vào tooltip nếu gây rối |
| Màu | Dùng token theme cho CTA (`--acc`); bảng màu “trên ảnh” (`--hb-*`) khai báo **một lần** trong khối `.hero` | Không hardcode rải rác; `--acc` của theme sáng (#a63a52) quá tối trên nền ảnh nên eyebrow/dot dùng `--hb-acc` (#ff9db1) |
| Ảnh nền | `<img>` thật + `blur(2px)` tĩnh | Bìa là áp phích dọc 480×600 → phủ ngang phải phóng ~3×; blur tĩnh giữ ảnh trông như phông nền điện ảnh. Có `srcSet/sizes/width/height` sẵn: khi API có ảnh ngang thì **không phải sửa CSS** |
| Nền tảng CSS | Giữ gradient (dù hệ thống ghi “không gradient”) | Đây là ngoại lệ **có chủ đích** cho banner ảnh — gradient là lớp bảo đảm tương phản chữ trên ảnh, không phải trang trí |

## 6. Dữ liệu còn thiếu từ API (không tự bịa)

1. **Không có ảnh ngang/backdrop.** Registry chỉ có `thumb`/`slide` (bìa dọc). Component đã
   nhận `backgroundImage.srcSet/sizes/width/height` → đề xuất thêm trường `banner` (16:9 hoặc
   21:9) vào registry + `tools/mirror_covers.mjs`; khi đó chỉ cần truyền vào là hết phóng ảnh.
2. **Không có thumbnail riêng.** Đang dùng chính bìa làm thumbnail (đúng hợp đồng: thiếu
   `thumbnail` thì lấy `backgroundImage.src`).
3. **Không có thể loại** trong hero: registry hiện không có trường `genre` cho bộ truyện
   (`buildFilters` chỉ dựng Năm/Tác giả/Couple), nên hàng meta **không** hiện thể loại —
   không bịa nhãn. Nếu CMS thêm `genre`, thêm một dòng vào `meta[]` trong `heroItem()`.
4. **Không có mô tả dài/ngắn riêng**: dùng `syn` (đã cắt sẵn ở registry) + line-clamp 3 dòng.

## 7. Kiểm thử

```bash
npm run build      # 0 cảnh báo MỚI (cảnh báo admin.css là có sẵn từ trước)
node tests/t_hero.js      # 22 kiểm tra — PASS
node tests/t_home.js      # PASS
node tools/audit_a11y.mjs # 25 màn: 0 lỗi axe-core — PASS
npm test                  # xanh, trừ t_admin_editor_lazy.js (lỗi CÓ SẴN: jsdom 30 không
                          # export ResourceLoader; đã kiểm lại trên HEAD sạch → lỗi y hệt)
```

`tests/t_hero.js` khoá lại: cấu trúc banner (không còn `.poster`/`.idx`/`.bg`), ảnh đầu
`fetchpriority="high"` + mục kế nạp sẵn + mục xa `data-src`, đổi slide thì tiêu đề /
`aria-labelledby` / `aria-current` / `aria-selected` / live region phải đổi theo,
← → khi focus trong khối (không cướp phím lúc đang gõ, không dời focus), “Lưu vào tủ” ghi
`localStorage` + `aria-pressed`, và fallback khi props rỗng / 1 mục / thiếu `thumbnail`.

Chưa chạy được trong môi trường này: `tests/t_layout_browser.js` (cần Chromium; tải binary
bị chặn). Vì vậy các mốc 375/390/414/768/820/1023/1280/1440/1920 mới kiểm bằng **đọc CSS +
`.hero{overflow:hidden}`**, chưa đo bằng trình duyệt thật.

## 8. Việc còn lại (cần owner xác nhận)

- 4 ảnh tham chiếu không có trong repo → chưa đối chiếu thị giác được. Cần dán ảnh vào
  `docs/reports/` (hoặc mở bản xem thử) để chỉnh tỷ lệ gradient/kích thước tiêu đề.
- Nếu muốn **tách** “Did You Know” thành một khối riêng (thay vì là slide đầu của hero như
  hiện tại) thì chỉ cần thêm `<section id="…">` và một dòng `CZ.heroBanner(root, {items})` —
  component đã sẵn sàng, không phải viết lại markup.
- Có thể nâng phiên bản lên `1.21.0` bằng `node tools/check_version.mjs --write 1.21.0`
  nếu muốn đánh dấu bản phát hành.

## 9. Phản hồi 2026-10-29 (bản này chưa đạt) — 4 hướng khác + mockup

Người duyệt cho rằng bản full-bleed ở trên **chưa đạt**. Nguyên nhân kỹ thuật đã xác định:
kho chỉ có **bìa dọc 480×600**, phủ lên banner 2,4:1 là phóng ~3 lần ⇒ nhoè, mất chủ thể;
`blur(2px)` chỉ che phần vỡ hạt chứ không tạo ra chủ thể.

Mockup so sánh 5 hướng (bấm được thumbnail, đổi được cỡ màn hình 1440/820/390, sáng/tối):

```
python3 -m http.server 8090 -d .      # rồi mở /docs/mockups/hero/index.html
```

| Hướng | Lấy gì làm chủ thể | Cần ảnh ngang? | Giữ hero tối? | Chi phí |
| --- | --- | --- | --- | --- |
| **V0** bản hiện tại | Ảnh nền (bìa phóng to) | Không (nhưng nên có) | Có | đã xong |
| **V1** đèn nền theo bìa ⭐ | **Bìa thật** + quầng sáng loang màu từ chính bìa | Không | Có | sửa CSS + 1 cột poster |
| **V2** sân khấu 16:9 | Khung ảnh ngang + thẻ giấy | **Có** | Không (nền sáng) | cao (CMS + mirror) |
| **V3** báo in | Chữ + bìa đóng khung, mục lục 01–05 | Không | Không (nền giấy) | thấp |
| **V4** bộ bài | 5 bìa xoè quạt | Không | Có | trung bình |

Đề xuất: **V1** mặc định (sửa đúng chỗ sai: bìa là chủ thể, không phóng bìa), **V3** nếu muốn
rẻ nhất và đúng chất tạp chí in; **V2** chỉ sau khi registry có trường `banner` 16:9;
**V4** để dành A/B.

Ghi chú về mockup: `docs/mockups/hero/art/*.jpg` là **ảnh minh hoạ 16:9** chỉ dùng cho V2
(dữ liệu thật **không có** ảnh ngang) — mọi chỗ khác đều dùng đúng bìa trong
`/assets/covers`. Dữ liệu chữ lấy từ `data/registry.json`. Thư mục `docs/` đã bị
`_redirects` chặn nên mockup không lên bản thật.

## 10. Phản hồi 2026-10-29 (lần 2) — chọn V4, làm lại cho “đẹp hơn, gọn gàng, ấn tượng hơn”

Người duyệt chọn **V4 (“bộ bài”)** nhưng yêu cầu bản V4 đầu tiên phải gọn và có nhịp hơn.
Bản V4 cũ rối ở 5 điểm, tất cả đều đã xử lý:

| V4 cũ | Bản làm lại |
| --- | --- |
| 5 bìa xoè nhưng không cùng một tâm | Quạt xếp theo **khoảng cách tới bìa đang chọn** (`--fan-unit`), đổi slide nào cũng đúng nhịp |
| Mỗi bìa dán nhãn “01” nền đen | Một dòng chữ mono **số + tác giả** dưới bìa đang chọn |
| Dòng hint chữ trôi nổi | Bỏ; nhãn trên bìa thay thế |
| 4–5 viên pill viền tranh nhau | **Chấm trạng thái + chữ** trên một hàng meta |
| Dot / thumbnail làm phân trang | **Ticks 5 nhịp** bấm được + `01 / 05` + prev/next |

Ba biến thể trong `docs/mockups/hero/v4-options.html` (dữ liệu + bìa **thật**, không ảnh minh hoạ):

- **A · “Sạp báo”** (tối) — quạt 5 bìa có tâm, tự chuyển 7 s kèm nút Tạm dừng (WCAG 2.2.2) và
  vạch tiến trình 2 px; mobile **giữ nguyên bố cục** (chữ trên, quạt 3 bìa dưới — chỉ thu nhỏ, không đổi kiểu điều hướng).
- **B · “Kệ trưng”** (giấy) — bìa lớn đóng khung + **mục lục 01–05** bên cạnh trên một trục số,
  bỏ hẳn thumbnail nhỏ trong danh sách (thứ làm bản trước trông vụn); tổng cao ~440 px.
- **C · “Đèn rọi”** (tối, ấn tượng nhất) — `perspective`, bìa chính + hai bìa kế `rotateY 15°`
  bấm được (có `role`/`tabindex`/Enter-Space), phản chiếu `mask-image` tĩnh, quầng sáng lấy từ chính bìa,
  parallax con trỏ ≤2,5° và tắt khi `prefers-reduced-motion`.

Kiểm chứng: jsdom **69/69** (3 khối, quạt/mục lục/ticks đủ 5, đổi truyện → tiêu đề + bìa + `aria-current` +
vùng `aria-live`, nút Tạm dừng, bìa hai bên bấm/kbd, chip khổ & giao diện, 5 bìa có thật trong `assets/covers`).

**Chốt 2026-10-29:** người duyệt chọn **A · “Sạp báo”**, kèm yêu cầu mobile phải cùng bố cục với desktop
(đã sửa: bỏ dải cuộn ngang, quạt 3 bìa + ticks + prev/next + nhãn số–tác giả giữ nguyên).
Bước tiếp theo: port A vào `src/cz-hero.js` (hiện vẫn là bản full-bleed V0).

## 11. ĐÃ PORT A VÀO COMPONENT THẬT (2026-10-29)

Hero chạy thật giờ là hướng **A · “Sạp báo”**. Bản full-bleed (V0) đã bị gỡ khỏi
`src/cz-hero.js` và `src/cz.css` §5 — không còn `.hb-media/.hb-bg/.hb-scrim` phủ
ảnh bìa dọc lên khung ngang.

**Bố cục** — **≥640 HAI CỘT** (chữ | quạt 5 bìa): bìa luôn nằm một bên như mockup,
kể cả ở mốc tablet 820. **<640** mới xếp một cột nhưng vẫn cùng thứ tự và cùng
kiểu điều hướng: chữ → quạt → ticks/‹ ›/⏸. Không có kiểu điều hướng thứ hai cho
điện thoại (bản mockup trước dùng “dải cuộn ngang” — đã bỏ theo yêu cầu
“mobile cùng một layout”).

> Lần đầu ship, `cz.css` bị giữ nguyên `?v=` cũ nên service worker vẫn phục vụ
> bản CSS cũ (hero hiện ra như khối chữ + ảnh bìa xếp dọc). Đã đổi `?v=` của
> `cz.css` ở toàn bộ 76 tệp HTML + `sw.js` (`20261029hero3`) — đổi CSS là **bắt
> buộc** phải đổi `?v=`.

**Vị trí quạt nằm trong CSS**: mỗi bìa mang `data-pos` (0 = đang chọn, 1..4 xoay
vòng hai bên) và đọc `--x/--y/--r/--s`; JS chỉ đổi `data-pos`. Đổi breakpoint chỉ
sửa `--cover-w` / `--fan-unit` — không có toạ độ px nào trong JS.

### Tệp đã thay đổi + lý do

| Tệp | Vì sao |
| --- | --- |
| `src/cz-hero.js` | Viết lại theo A: quạt bìa là điều hướng, chữ 1 cột, ticks thay dot/thumbnail. Thêm `caption` vào hợp đồng dữ liệu; giữ nguyên API `CZ.heroBanner(root, props)` và `HeroBanner.destroy()`. **Sửa lỗi cộng dồn listener**: `bind()` ghi nhớ listener và `destroy()` gỡ sạch (trước đây mount lại cùng `<section>` là mỗi lần bấm tiến 2 mục). Bỏ `hydrate()` vì bìa nằm sẵn trong DOM: bìa đầu `fetchpriority=high`, còn lại `loading=lazy`. |
| `src/cz.css` (§5) | Viết lại khối HERO: bảng màu `--hb-*` khai báo một lần, accent dẫn xuất từ `--acc` bằng `color-mix` (không hardcode), layout grid 2→1 cột, quạt `data-pos`, ticks, nhãn `fancap`. Gỡ toàn bộ CSS của ảnh nền full-bleed / dải thumbnail / dot. |
| `src/cz-home.js` | `heroItem()`: bỏ 4 icon trong hàng meta (nay là chữ + dấu chấm, đúng bản đã duyệt), bỏ nút phụ “Thông tin” (còn **một** nút phụ: Lưu vào tủ), thêm `caption: author`, bỏ `backgroundImage` (ảnh bìa lấy từ `thumbnail`). |
| `index.html` | Cập nhật chú thích khối hero + đổi `?v=` của `cz-hero.js`/`cz-home.js`. |
| `sw.js` | `CZ_SW_VER` + precache khớp `?v=` mới (bài `t_pwa.js` khoá điều này). |
| `tests/t_hero.js` | Viết lại theo cấu trúc mới: 5 slide + 5 bìa + 5 ticks, `data-pos` của bìa đang chọn = 0, đổi truyện bằng bìa/ticks/nút sau, aria + live region, bàn phím, Lưu vào tủ, fallback props (1 mục / 0 mục / thiếu thumbnail), và **mount lại không cộng dồn listener**. |
| `tests/README.md` | Mô tả lại bài `t_hero.js`. |
| `docs/mockups/hero/v4-options.html` | A trên mobile nay 5 bìa/`--fan-unit:68px` cho khớp bản đã port. |

### Kiểm chứng

```
npm run build                 # cz-hero.js 11,3 kB (trần 16) · cz.css 193 kB (trần 215)
node tests/run.js             # 46/47 ĐẠT — chỉ t_admin_editor_lazy.js lỗi (có từ trước)
npm run audit:a11y            # 25 màn, 0 lỗi axe-core
node tools/check_src.js       # bản phát hành khớp src/
node tests/t_hero.js          # “Hero banner đạt hết”
```

Xem thử: `python3 tools/dev_server.py` → http://localhost:8080

## 12. Ghép banner với phần ngay dưới — mockup 4 phương án (2026-10-29)

Sau khi banner “bộ bài” lên trang thật, chỗ nối giữa banner và phần dưới lộ ra vấn đề:
banner (nền tối, mono 11px) → dải số nền giấy (serif 30px, 4 ô kẻ dọc) → tiêu đề mục
(serif 22px) là **ba hệ chữ và ba nhịp dọc khác nhau** (44 / 22 / 38 px).

Mockup: `docs/mockups/hero/area-options.html` (dữ liệu + bìa thật, không ảnh minh hoạ):

```
python3 -m http.server 8090 -d .    # → /docs/mockups/hero/area-options.html
```

| Phương án | Cách ghép | Đổi gì |
| --- | --- | --- |
| **P0** hiện tại | banner → dải số giấy 4 ô → tiêu đề mục | mốc so sánh |
| **P1** “Một khối” ⭐ | dải số **nằm trong banner** (cùng nền tối, kẻ tóc trắng 10%), trang giấy bắt đầu ở tiêu đề mục | ~25 dòng CSS, **không** đổi markup |
| **P2** “Thẻ nổi” | banner bo 20px thành tấm thẻ trên nền giấy; dải số thành thẻ giấy đè mép dưới 34px | thêm wrapper + ~35 dòng CSS |
| **P3** “Masthead” | số liệu thu về **một hàng chữ** (21px + nhãn 10px, phân cách dấu chấm, “cập nhật 29-09”) | nhẹ nhất, bớt ~60px chiều cao |

**Đã đồng bộ ở cả 4 phương án** (phần “các element khác” trong banner):
trạng thái chỉ còn **chấm + chữ** (bỏ pill viền); tối đa **một** nhãn phụ (18+);
“Có mật mã” chuyển vào **CTA** (“Nhập mật mã để đọc”) thay vì nhãn thứ ba; tiêu đề
**cắt 2 dòng** nên banner cao cố định; nhãn dưới bìa luôn `01 · tác giả`;
ticks + `01 / 05` + ‹ › ⏸ luôn **một hàng**; chỉ dùng hai cỡ chữ số (serif cho số,
mono cho nhãn) và ba mốc nhịp dọc 24 / 38 / 44 px.

Trạng thái: **chờ chọn P1 / P2 / P3** rồi mới sửa `src/cz.css` (§5 và §6 `.facts`) và
`src/cz-home.js` (`renderFacts`) theo phương án đó.

## 13. Cột chữ kế bên quạt bìa — 4 cách làm gọn (2026-10-29)

Người dùng chỉ đúng phạm vi: **cột chữ nằm cạnh quạt bìa**, không phải phần dưới banner
(§12 để riêng, chưa chọn phương án). Đo trên trang thật:

| # | Vấn đề | Số đo |
| --- | --- | --- |
| 1 | Nhịp dọc phẳng | `.hero .info{gap:15px}` cho cả 5 tầng ⇒ 15/15/15/15 |
| 2 | Meta là “câu văn” 5–7 mục | PLS LOVE có 7 mục, tự xuống 2 dòng ở 1280–1440px, dấu chấm rơi đầu dòng |
| 3 | Nút chính cao hơn nút lưu | `13+13+14.5×1.62+2 ≈ 51,5px` vs vòng tròn `44px` ⇒ lệch tâm ~3,7px |
| 4 | Ngày cập nhật ở cuối câu 7 mục | thông tin phụ nhất lại xa nhất; hàng điều khiển không có ngày |
| 5 | Không có đường phân tầng | content ↔ controls cách nhau 22px, không kẻ |
| 6 | Cột chữ 520px trong cột lưới ~533px | mép phải chữ so le mép trái bìa |

Mockup (chỉ đổi cột chữ, giữ nguyên quạt/nền/cỡ bìa): `docs/mockups/hero/col-options.html`

| | Cách làm | Đổi gì |
| --- | --- | --- |
| **C0** | hiện tại | mốc so sánh |
| **C1** ⭐ | **“Một cột, hai tầng”** — tầng 1 = trạng thái · 18+ · số chương; tầng 2 = tác giả · couple (nhạt hơn); “Có mật mã” chuyển vào nhãn nút; ngày về hàng điều khiển; nút cùng `height:44px`; kẻ tóc trước hàng điều khiển; nhịp 12/16/7/15/22/24 | ~28 dòng CSS + sửa dựng meta/foot trong `cz-hero.js` |
| **C2** | “Kệ nhãn” — trạng thái lên cùng hàng eyebrow; thông tin thành lưới 4 ô có nhãn mono (CHƯƠNG/TÁC GIẢ/COUPLE/CẬP NHẬT) | +1 khối lưới, cao hơn C1 ~26px |
| **C3** | “Gộp một hàng” — CTA + lưu + │ + ticks + `01 / 05` + ‹ › ⏸ trên một trục, bỏ hàng điều khiển thứ hai | thấp hơn ~54px, nhưng ở 390px phải xuống 2 dòng |

Đã kiểm bằng jsdom: 87/87 (4 khung mount, 5 truyện × mỗi khung, `data-pos` xoay đúng,
`aria-current` chỉ ở mục đang chọn, `01 / 05` + `.fancap` + `Cập nhật <ngày>` đổi theo,
nút lưu `aria-pressed`, live region, 5 bìa thật trong `assets/covers`).

Trạng thái: **chờ chọn C1/C2/C3** rồi mới sửa `src/cz-hero.js` + `src/cz.css` §5.

## 14. C2 “kệ nhãn” — bản đã chỉnh (2026-10-29)

Người dùng chọn **C2** nhưng nêu 3 lỗi: badge trạng thái, vài thông tin dư, mobile chưa ổn.
Bản chỉnh: `docs/mockups/hero/c2-refine.html` (badge S1/S2/S3 đổi được, khổ 1440/820/390,
so sánh mobile cũ ↔ mới cạnh nhau).

**Badge trạng thái** — bỏ cặp “● Đang cập nhật” đứng cùng hàng với nhãn mục; badge đứng
**một dòng riêng**, ba kiểu để chọn:

| | Kiểu | Dáng |
| --- | --- | --- |
| **S1** ⭐ | Con dấu | mono 10px, giãn chữ `.18em`, gạch đầu 3px, không nền/viền |
| **S2** | Viên mảnh | pill bo tròn, viền theo màu trạng thái, nền 11% |
| **S3** | Chấm + chữ | chấm 7px + chữ 12,5px, đứng riêng dòng |

**Bỏ thông tin dư**

| Thành phần | Xử lý |
| --- | --- |
| Nhãn “Nổi bật hôm nay” / “Đề xuất cho bạn” | bỏ (cả khu vực đã tên đó; nhãn dài ngắn theo truyện ⇒ mép trái so le) |
| Ô COUPLE | chỉ hiện khi truyện có couple; ẩn hẳn ở mobile |
| “42 chương” | còn `42`, đơn vị nằm ở nhãn `CHƯƠNG` |
| Chip “Có mật mã” | chuyển vào nhãn nút “Nhập mật mã để đọc” |

**Mobile 390** — badge + 18+ một hàng; h1 29px, `max-width:100%` (không cắt giữa từ);
kệ 2 cột `12px / 18px`, `dt 9px` `dd 13px`; mô tả ẩn; nút 42px; hàng điều khiển một hàng
(ticks trái `20/30px`, `‹ › ⏸` dồn phải bằng `margin-left:auto`).

Kiểm bằng jsdom: 27/27. Trạng thái: **chờ chọn S1/S2/S3** rồi vào `src/cz-hero.js` +
`src/cz.css` §5.

## 15. Đã làm thật: C2 “kệ nhãn” + badge S1 (2026-10-29)

Chốt theo yêu cầu: **phương án C2 + badge kiểu S1 “con dấu”**. Đã vào mã nguồn, không
còn là mockup (`docs/mockups/hero/c2-refine.html` giữ làm tham chiếu).

### Cấu trúc mới của cột chữ (một slide)

```
.head   ●  HOÀN THÀNH      18+
h1      Third Person
.spec   CHƯƠNG 42 · TÁC GIẢ SIIX · COUPLE Garn x Mimie · CẬP NHẬT 29-09
.syn    mô tả 2 dòng
.btns   [Đọc từ đầu] [⌐ lưu]
.foot   ─── (kẻ tóc)  ticks · 01 / 05 · ‹ › ⏸
```

Ba thay đổi so với bản “một hàng meta”:

1. **Badge thành “con dấu”** — mono 10px, giãn chữ `.18em`, gạch đầu 3px, màu theo
   trạng thái, **đứng một dòng riêng** trên tiêu đề. 18+ vẫn là chip đỏ (`.hb-b18`).
   “Có mật mã” bị bỏ khỏi hàng badge: nó đã nằm trong nhãn nút “Nhập mật mã để đọc”.
2. **Thông tin thành lưới `<dl>`** — `.spec` 4 ô `dt/dd`; ô nào không có dữ liệu thì
   **không dựng** (không còn “—”): truyện không có couple chỉ còn 3 ô. Số chương in
   “42” (đơn vị ở nhãn), số dùng `font-variant-numeric: tabular-nums`.
3. **Nhịp dọc bằng margin, không bằng `gap`** — 10 · 14 · 18 · 16 · 20 · 22px; nút chính
   `height:44px` bằng đúng vòng tròn “Lưu vào tủ” (trước lệch ~7,5px vì `line-height:1.62`);
   hàng điều khiển có kẻ tóc `1px` phía trên, `‹ › ⏸` dạt phải bằng `margin-left:auto`.

### Mobile 390 (và 640–1023 giữ 2 cột như desktop)

- `.head` một hàng (badge + 18+), h1 25–31px `max-width:100%`;
- `.spec` 2 cột `12px / 18px`, `dt 9px` / `dd 13px`, **ẩn ô COUPLE** (`.sm-hide`);
- ẩn mô tả; nút padding `0 16px`, vẫn cao 44px; ticks `20/30px`, vùng bấm nới `-14px`;
- `.info` và `.foot` dùng chung `--hb-w` (520px → 400px tablet → `none` mobile) nên mép
  phải của chữ và của hàng điều khiển trùng nhau.

### Bỏ gì

`item.eyebrow` và nhãn mục “Nổi bật hôm nay / Đề xuất cho bạn” **đã bỏ khỏi hero**
(kể cả trường `_reason` của ban biên tập). Muốn giữ “Lựa chọn của ban biên tập” thì nên
đưa nó thành một dòng nhỏ RIÊNG dưới tiêu đề, đừng ghép lại vào hàng badge.

### Tệp đã sửa

| Tệp | Vì sao |
| --- | --- |
| `src/cz-hero.js` | bỏ `eyebrow`/`meta`, thêm `statusHTML` · `extraBadgesHTML` · `factsOf` · `factsHTML`; slide mới |
| `src/cz-home.js` | `heroItem()` bỏ `eyebrow`, thêm `facts` (Chương/Tác giả/Couple ẩn mobile/Cập nhật) |
| `src/cz.css` | §5.3 thay “một hàng meta” bằng “kệ nhãn”; nhịp bằng margin; nút 44px; kẻ tóc + mũi tên dạt phải; `--hb-w`; media 2 cột/1 cột + spec 2 cột |
| `tests/t_hero.js` | khoá cấu trúc mới: badge trong `.head`, 3–4 ô, không lặp “chương”, không chip mật mã, bỏ ô couple khi trống |
| `tests/t_adult.js` | thay kiểm “nhãn reason” bằng “có badge trạng thái + không còn eyebrow” |
| `*.html` (76) + `sw.js` | `cz.css?v=20261029hero4`, `CZ_SW_VER='20261029hero4'` |

### Kiểm

`t_hero` “Hero banner đạt hết” · `t_home` · `t_adult` N12 · `t_lock_ui` · `t_pwa` ·
`tests/run.js` 1 bài lỗi (chỉ `t_admin_editor_lazy.js`, hỏng từ trước) ·
`audit:a11y` 25 màn 0 lỗi axe · `check_src` khớp · `check_css` không lỗi cú pháp ·
`cz.css` 193,6 kB (90 % trần 215 kB).

## 16. Vòng chỉnh 3: điều khiển, nút, hệ chữ, nền bìa (2026-10-29)

Năm điểm người dùng nêu sau khi xem bản thật trên dev server.

### 1. Hàng điều khiển (`‹ › ⏸`) không còn nhảy xuống dòng riêng

Trước: `.foot` cho `flex-wrap: wrap` + `.nav{margin-left:auto}` ⇒ ở ~860px nút ›⏸ bị
đẩy xuống **hàng thứ hai**, canh lệch. Nay `.foot{flex-wrap:nowrap}` và thứ tự cố định
`ticks → số đếm → ‹ › ⏸`, số đếm ở giữa, cụm nút dạt phải. Ở 390px vẫn vừa một hàng
(ticks 110 + số 45 + nút 106 + 3 khoảng 10 ≈ 281 < 354).

### 2. Nút đẹp hơn, phân cấp rõ

| Nút | Trước | Nay |
| --- | --- | --- |
| ‹ › | 34px, viền mảnh, nền `--hb-glass` | 36px, nền trắng 5%, viền trắng 26%; hover nền 14% + viền 55%; nhấn `scale(.94)` |
| ⏸ | 34px, **giống hệt** nút ‹ › | 32px, **không viền**, nền 7%, màu `--hb-dim` ⇒ đọc là điều khiển phụ |

### 3. Nút “Lưu vào tủ” → nút **“i”** (thông tin truyện)

`secondaryCtas` trong `cz-home.js` đổi thành link 44px tròn, icon `info`, `aria-label`
“Thông tin truyện”, dẫn về `/truyen/<slug>/`. Lưu vào tủ vẫn còn nguyên ở trang truyện
và ở thẻ truyện; ở banner thì người đọc cần lối tắt sang trang thông tin hơn.
(`tests/t_hero.js` đổi mục 4 từ “Lưu vào tủ” sang “nút i”.)

### 4. Một hệ chữ duy nhất trong banner

| Vai trò | Cỡ / giãn | Màu |
| --- | --- | --- |
| Nhãn ô (`CHƯƠNG`, `TÁC GIẢ`…) | mono **10px** / .14em, in hoa | `--hb-dim` |
| Giá trị ô (`42`, `SIIX`, `29-09`) | 13.5px / **600**, số `tabular-nums` | `--hb-fg` |
| Số đếm (`01 / 05`) | mono **10px** / .14em, phần đang xem `<b>` | số `--hb-fg`, `/05` dim |
| Nhãn dưới bìa (`01 · SIIX`) | mono **10px** / .14em | số `--hb-fg`, tác giả dim |

Trước đây là 10.5 / 11 / 13.5 với ba độ đậm khác nhau, và `.spec dd.soft{font-weight:500}`
làm tác giả nhạt hơn số chương ⇒ “format chữ không thống nhất”. Nay số và chữ cùng 600,
chỉ số là `tabular-nums`. Kệ nhãn ở tablet cũng **giữ 4 cột** (trước bị 2×2 nên trông lệch).

### 5. Nền: bìa NGANG mờ + nửa gradient

`.hb-bgs` chứa 5 lớp `.hb-scene`, mỗi truyện một lớp, mờ dần khi đổi (`.55s`):

- **Có bìa ngang** (`item.backdrop`, lấy từ `n.slide` khi khác `n.thumb` — hiện 3/67 bộ):
  `<img class="pic">` phóng 120 %, `blur(30px) saturate(1.05) brightness(.6)`.
- **Không có**: `washFromCover()` vẽ bìa dọc vào canvas 12×18, lấy màu trung bình nửa
  trên/nửa dưới rồi hạ sáng (×.46 / ×.62) ⇒ gán `--hb-bg-a/--hb-bg-b`, nền thành gradient
  **lấy từ chính bìa**. Kết quả cache theo `src`; canvas “bẩn” (ảnh khác nguồn) thì bỏ qua.
- `.veil` phủ lên: nửa **trái** gần đặc (chữ trắng đọc được trên mọi bìa), nửa **phải**
  để ảnh lộ ra sau quạt; mobile đổi sang gradient dọc (chữ ở trên, quạt ở dưới).
- Bỏ hai quầng sáng `.hero::before`; giữ hạt phim `.hero::after` (opacity .04).

### Tệp đã sửa

| Tệp | Vì sao |
| --- | --- |
| `src/cz-hero.js` | dựng `.hb-bgs`/`.hb-scene` + `bgHTML`, `washFromCover` (canvas lấy màu bìa, có cache), đổi nền theo slide; số đếm tách `<b>` |
| `src/cz-home.js` | `secondaryCtas` → nút “i” thông tin truyện; thêm `backdrop` (bìa ngang từ `slide`); bỏ `inShelf` không dùng |
| `src/cz.css` | §5.1 nền mới; nút ‹ › ⏸ phân cấp; `.foot` một hàng; hệ chữ 10/13.5 + 600; kệ nhãn 4 cột ở tablet; veil dọc ở mobile |
| `tests/t_hero.js` | mục 4 đổi sang nút “i”; thêm kiểm lớp nền (5 lớp, 1 hiện, có `.veil`/`.wash`) và kiểm hàng điều khiển (thứ tự ticks→count→nav, 3 nút, `<b>01</b>`) |
| `sw.js` + 76 HTML | `?v=20261029hero5` (cz.css, cz-hero, cz-home, PRECACHE) |

### Kiểm

`t_hero` “Hero banner đạt hết” · `t_home` · `t_adult` N12 · `t_lock_ui` · `t_pwa` ·
`tests/run.js` 1 bài lỗi (`t_admin_editor_lazy.js`, hỏng từ trước) · `audit:a11y` 25 màn
0 lỗi axe · `check_src` khớp · `cz.css` 194,9 kB (91 % trần 215 kB).

---

## 17. Vòng 3 — cột chữ bên cạnh quạt bìa (2026-10-29)

Yêu cầu: “chỉnh mấy cái kế bên chỗ sạp báo bìa” — tức **cột chữ nằm cạnh quạt bìa**
(không phải các mục bên dưới hero). Ba việc: hàng nhãn phải đứng yên, hệ chữ phải
cùng một thang, và điện thoại không được để ô trống lẻ loi.

### 1. Hàng nhãn KHÔNG còn nhảy ngang khi đổi truyện

`<dl class="spec">` trước đây dùng `grid-template-columns: repeat(4, minmax(0, auto))`.
Cột `auto` co theo nội dung ⇒ mỗi lần đổi truyện, bề rộng cột đổi theo
(`42` → `1.2K`, `SIIX` → `Takling Kaemjai`) nên **cả hàng nhãn dịch ngang**, và truyện
thiếu COUPLE thì ô CẬP NHẬT tụt vào cột 3.

Nay:

- lưới `repeat(4, minmax(0, 1fr))` — 4 cột chia đều, khe 18px;
- mỗi ô mang `data-slot` (`ch` / `au` / `cp` / `up`) do `cz-home.js` gán, CSS ghim
  `grid-column` tương ứng ⇒ thiếu dữ liệu thì **để trống ô**, không kéo ô sau lên lấp;
- component vẫn dựng được `facts` **không có** `slot` (rơi về lưới tự động) nên chỗ
  khác dùng `CZ.heroBanner` không phải sửa theo.

### 2. Một thang chữ cho mọi nhãn

| Chỗ | Trước | Sau |
| --- | --- | --- |
| Con dấu trạng thái (`.hb-st`) | mono 10px, giãn **.18em** | mono 10px, giãn **.14em** (cùng nhịp với `dt`, `count`, `fancap`) |
| Nhãn 18+ (`.hb-b18`) | sans **9.5px**, đậm 800, giãn .06em | mono **10px**, đậm 700, giãn .08em |
| Thanh tiến trình đọc (`.prog`) | 12.5px | **13px** (cùng thang với `dd` 13.5) |

### 3. Điện thoại: ô CẬP NHẬT trải hết dòng

Ở 2 cột, `CHƯƠNG / TÁC GIẢ` chiếm dòng 1, `COUPLE` ẩn, nên `CẬP NHẬT` nằm lẻ ở cột 1
dòng 2 và chừa một ô trống bên phải. Nay `data-slot="up"` chiếm `grid-column: 1 / -1`
⇒ kệ nhãn thành 2 tầng gọn: hai ô trên, một ô rộng dưới.

### 4. Ba mép phải thẳng hàng + nhịp dọc có thang

Cột chữ có ba mép phải khác nhau: kệ nhãn 100 % (≈511px), mô tả bị chặn `46ch`
(≈350px), hàng nút co theo nút. Mắt đọc thấy “lởm chởm” dù từng dòng đều đúng.

- `.syn` bỏ `max-width: 46ch` ⇒ mép phải của mô tả, kệ nhãn và hàng nút **thẳng nhau**;
- nhịp dọc đổi sang thang bội số 2px, mỗi tầng một khoảng: con dấu → tiêu đề **12**,
  tiêu đề → kệ nhãn **20** (+14 đệm sau đường kẻ), kệ nhãn → mô tả **14**,
  mô tả → hàng nút **22** (trước là 14/18/16/20, không theo thang nào);
- nút chính `min-width: 168px` + căn giữa nhãn ⇒ dưới tiêu đề 50px nút không còn
  “lọt thỏm”;
- điện thoại: tiêu đề cho **3 dòng** (tên truyện Việt hay dài, trước bị cắt ở 2 dòng),
  nhãn ô 9 → 9,5px.

### Tệp đã sửa

| Tệp | Vì sao |
| --- | --- |
| `src/cz-home.js` | `facts` mang thêm `slot: ch/au/cp/up` |
| `src/cz-hero.js` | `factsHTML()` ghi `data-slot`; tài liệu hoá hợp đồng `facts` |
| `src/cz.css` | §5.3 lưới 4 cột chia đều + ghim cột; `.hb-st` .14em; `.hb-b18` mono 10px; `.prog` 13px; mobile `up` trải dòng; `.syn` hết chặn 46ch; nhịp 12/20/14/22; nút chính ≥168px; mobile tiêu đề 3 dòng |
| `sw.js` + 76 HTML | `?v=20261029hero7` (cz.css, cz-hero, cz-home, PRECACHE) |

### Kiểm

`t_hero` “Hero banner đạt hết” · `t_home` · `t_pwa` · `check_src` khớp ·
`cz.css` 195,3 kB (91 % trần 215 kB) · `cz-hero.js` 13,1 kB (82 % trần 16 kB).

---

## 18. Vòng 4 — sạp báo to hơn, nền có chiều sâu, banner thấp lại (2026-10-29)

Ba yêu cầu từ ảnh chụp thật: (1) quạt bìa to và đẹp hơn, (2) nền sau vẫn tối và
“phẳng”, (3) bố cục gọn lại, hạ chiều cao banner.

### 1. Quạt bìa: to hơn, xoè từ GỐC, có “đất” dưới chân

| Thông số | Trước | Sau |
| --- | --- | --- |
| Bề rộng bìa `--cover-w` | `clamp(150px, 14vw, 208px)` | `clamp(168px, **16.4vw**, 242px)` |
| Khoảng cách bìa `--fan-unit` | `clamp(84px, 7.4vw, 116px)` | `clamp(90px, 7.6vw, 112px)` |
| Độ xoè của bìa ngoài (× unit) | `1.835` | **`1.5`** |
| Góc xoay / hạ bậc | 6° / 11°, y 12 / 30 | 7° / 13°, y 10 / 26 |
| Gốc xoay | tâm bìa | **`transform-origin: 50% 92%`** — xoay quanh chân như bìa cắm trên kệ |

Bìa to hơn 16 % nhưng xoè hẹp hơn ⇒ cả quạt vẫn gọn trong cột (≈578×477 px ở
1440, trước ≈523×449). Thêm ba thứ để “đẹp”:

- **viền + ánh giấy**: `border-radius: 10px`, viền trắng 16 %, inner highlight 1px
  trên đỉnh, một vệt chéo `::after` mô phỏng ánh bóng giấy in;
- **bóng đổ theo tầng**: bìa giữa `0 40px 70px -28px`, bìa bên cạnh nhẹ hơn;
- **bóng “đất”**: `.fan::after` — ellipse mờ 26px dưới chân quạt, quạt có điểm tựa
  thay vì lơ lửng;
- bìa không chọn sáng hơn (brightness .5 → **.62**), bìa đang chọn có quầng accent
  lớn hơn (56px thay 40px).

### 2. Nền: sáng hơn + có hình khối, không còn một tảng gradient

- **Màu lấy từ bìa sáng hơn**: hệ số hạ sáng `×.46 / ×.62` → **`×.62 / ×.84`**
  (vẫn tối hơn bìa thật để chữ trắng còn đọc được).
- **`.ghost`** (mới): chính bìa dọc của truyện, phóng `height: 136%`, `blur(46px)`,
  opacity .6, mask radial cho mép tan vào nền ⇒ nền có **hình khối và màu của bộ
  truyện**. Dùng lại đúng URL bìa trong quạt nên **không thêm byte nào**.
- **`.glow`** (mới): quầng sáng màu accent ngay sau quạt, `mix-blend-mode: screen`
  — như đèn rọi vào sạp báo.
- **`.veil` nhẹ lại**: mép trái .97 → **.88**, mép phải .30 → **.10**, sọc dọc
  trên/dưới .55/.60 → **.34/.42**. Nền sáng rõ mà chữ vẫn đủ tương phản (axe 0 lỗi).
- **`.hb-scene` ẩn hẳn khi không phải lớp đang xem** (`visibility` + delay) để 5 ảnh
  mờ không cùng được vẽ.

### 3. Bố cục: chiều cao do QUẠT quyết định

Lỗ hổng lớn giữa nút và hàng ticks trong ảnh chụp là do **slide cao nhất trong 5
truyện** kéo `.stage` lên; cột chữ ngắn hơn thì phần dư nằm lại giữa nút và pager.

- `.hb-col { align-self: stretch }` + `.stage { flex: 1; align-content: center }`:
  chữ canh giữa phần còn lại, **pager dính đáy cột**, phần dư dồn ra hai đầu;
- `h1` giữ chỗ 2 dòng (`min-height: 2.08em`), `.syn` giữ 2 dòng (`3.24em`) ⇒ đổi
  truyện chữ không nhảy;
- `.hb-grid`: đệm `52/44` → **`34/30`**, `min-height` `clamp(500,62vh,600)` →
  **`clamp(420px,50vh,486px)`**, khe `44` → **`36`**, tỉ lệ cột `.94/1.06` → **`.9/1.1`**;
- kệ nhãn: cột theo **tỉ lệ** `.62 / 1 / 1.24 / .86` + khe 16 ⇒ tên couple
  (“Mingming x Nepjune”) không còn xuống dòng, mà vị trí nhãn vẫn đứng yên.

Ở 1440 px, banner từ **≈668 px xuống ≈541 px** trong khi bìa vẫn to hơn.

### Tệp đã sửa

| Tệp | Vì sao |
| --- | --- |
| `src/cz-hero.js` | `bgHTML()` thêm `.ghost` + `.glow`; hệ số hạ sáng màu bìa .62/.84 |
| `src/cz.css` | §5.1 nền (ghost/glow/veil nhẹ, scene ẩn khi mờ); §5.2 khung gọn + cột bìa rộng; §5.3 kệ nhãn theo tỉ lệ; §5.5 pager dính đáy; §5.6 quạt to hơn, xoay từ gốc, bóng đất; responsive |
| `sw.js` + 76 HTML | `?v=20261029hero8` |

### Kiểm

`t_hero` “Hero banner đạt hết” · `t_home` · `t_pwa` · `check_src` khớp ·
`audit:a11y` 25 màn 0 lỗi axe · `cz.css` 196,7 kB (92 % trần 215 kB) ·
`cz-hero.js` 13,2 kB (83 % trần 16 kB).

---

## 19. Vòng 5 — gộp thanh điều khiển, tên truyện hết bị cắt, quạt & nền “xịn” hơn (2026-10-29)

Năm góp ý từ ảnh chụp: dòng dưới quạt rối và dư; nền chưa ấn tượng, bìa chưa rõ;
tên truyện bị cắt cụt; còn khoảng trống thừa dưới banner; quạt cần to và “thật” hơn.

### 1. Dòng điều khiển: ba cụm rời → MỘT thanh gộp dưới quạt

Trước: `5 vạch ticks` + `02 / 05` + `‹ › ⏸` nằm ở cột chữ, **cộng thêm** dòng
`02 · KRATAI DUEAN` dưới bìa. Ticks trùng với chính quạt (bấm bìa là chọn được),
số đếm trùng với nhãn dưới bìa ⇒ hàng vừa rối vừa dư.

Nay một viên kính mờ nằm ngay dưới bìa đang chọn:

```
‹    02 / 05 · KRATAI DUEAN    ›    ⏸
```

- bỏ hẳn `.ticks` (5 vạch) và `.fancap` rời; `.fanbar` thay cả hai;
- `.count` vẫn tách `<b>02</b>` để in đậm phần đang xem;
- tác giả `#hWho` lấy từ `item.caption`, không có thì thêm lớp `no-who` để bỏ luôn
  dấu chấm và khoảng trống;
- cột chữ **không còn hàng điều khiển** ⇒ banner thấp đi và không còn dòng trơ trọi
  bên dưới nút “Đọc từ đầu”.

### 2. Tên truyện: hết cắt cụt

`h1` bị `max-width: 13ch` + `line-clamp: 2` nên “Vượt Khỏi Đường Chân Trời…”
thành “Vượt Khỏi / Đường Ch…”. Nay `max-width: 100%`, **3 dòng**, cỡ
`clamp(32px, 3.1vw, 46px)` (nhỏ hơn 50px một nhịp để 3 dòng vẫn gọn), giữ
`min-height: 2.12em` để đổi truyện chữ không nhảy.

### 3. Nền: bìa hiện rõ hơn

| Lớp | Trước | Sau |
| --- | --- | --- |
| `.ghost` (bìa dọc phóng lớn) | blur 46px, opacity .60, cao 136 % | **blur 26px, opacity .82, cao 152 %** |
| mask của `.ghost` | dừng ở 46 % | rộng hơn (52 %), mép tan ở 82 % |
| `.glow` (quầng accent) | opacity .75, 34 % accent | **opacity .90, 42 % accent** |

Bìa sau quạt giờ đọc ra được hình khối/màu của truyện thay vì một tảng tối.

### 4. Quạt: to hơn + “bìa sách thật”

| Thông số | Trước | Sau |
| --- | --- | --- |
| `--cover-w` | `clamp(168px, 16.4vw, 242px)` | **`clamp(176px, 17.5vw, 262px)`** |
| `--fan-unit` | `clamp(90px, 7.6vw, 112px)` | `clamp(92px, 7.8vw, 118px)` |
| Độ xoè bìa ngoài | `1.45 × unit` | **`1.34 × unit`** (dày hơn, sát nhau hơn) |
| Nghiêng 3D | không | **`perspective: 1400px` + `rotateY(±9°/±15°)`** |

Chi tiết làm bìa “thật”:

- **gáy sách** `::before`: dải tối 13 % bên trái + đường gấp sáng 1px;
- **mép giấy** `::after`: tối 4 % sát mép phải + inner shadow sáng, cộng vệt ánh
  giấy chéo 20 %;
- `border-radius: 5px 9px 9px 5px` (gáy vuông, mép ngoài bo) thay vì bo đều 10px;
- bóng đổ sâu hơn (`0 34px 58px -32px`), bìa đang chọn giữ vòng accent + quầng 56px.

### 5. Chiều cao banner

`.hb-grid`: đệm `34/30` → **`26/20`**, `min-height` `clamp(420,50vh,486)` →
**`clamp(400px,46vh,452px)`**; hàng điều khiển rời khỏi cột chữ. Ở 1440 px banner
còn **≈519 px** (đỉnh trước đó ≈541 px, bản gốc ≈668 px), bìa vẫn to hơn.

### Tệp đã sửa

| Tệp | Vì sao |
| --- | --- |
| `src/cz-hero.js` | `fanBarHTML()` thay `controlsHTML()` + `ticksHTML()`; bỏ `.fancap`; `paint()` cập nhật `#hWho`, `no-who`; ẩn nút khi chỉ 1 mục |
| `src/cz.css` | §5.5 thanh gộp (kính mờ, arrow 28px); bỏ `.foot`/`.ticks`/`.fancap`; `h1` 3 dòng; `.ghost`/`.glow` rõ hơn; quạt to + gáy/mép giấy/`rotateY`; khung gọn |
| `tests/t_hero.js` | cấu trúc mới: `.fanbar` (thứ tự ‹ → số đếm → · → tác giả → › → ⏸), không còn ticks, thanh nằm trong quạt, cột chữ không còn hàng điều khiển; đổi mục bằng bìa thay ticks |
| `sw.js` + 76 HTML | `?v=20261029hero9` |

### Kiểm

`t_hero` “Hero banner đạt hết” · `t_home` · `t_adult` N12 · `t_lock_ui` · `t_pwa` ·
`audit:a11y` 25 màn 0 lỗi axe · `check_src` khớp · `cz.css` 196,6 kB (91 % trần) ·
`cz-hero.js` 12,5 kB (78 % trần).

---

## 20. Vòng 6 — banner thấp lại thật, player thành “mép kệ”, bìa to hơn nữa (2026-10-29)

### 1. Chỗ trống dưới banner: tìm ra thủ phạm

Không phải `.hb-grid` (banner vẫn còn ~150px trống dưới nút) mà là **`.hero`**:
section có `min-height: clamp(500px, 62vh, 600px)` từ bản dựng đầu, trong khi nội
dung thật chỉ ~460px — phần dư nằm lại giữa `.hb-grid` và mép dưới section.

- `.hero min-height`: `clamp(500px, 62vh, 600px)` → **`clamp(380px, 42vh, 480px)`**
  (chỉ còn là chiều cao **dự phòng** trước khi JS dựng, để nội dung bên dưới
  không nhảy);
- `.hb-grid`: đệm `26/20` → **`22/16`**, `min-height` `clamp(400,46vh,452)` →
  **`clamp(360px, 38vh, 420px)`**, khe `36` → **`32`**, tỉ lệ cột `.9/1.1` → **`.84/1.16`**
  (nhường bề ngang cho quạt).

Ở 1271 px: banner **≈650 px → ≈554 px**, và quạt thì **to hơn 31 %** thay vì nhỏ đi.

### 2. Player: viên kính lơ lửng → dải ngang kiểu “mép kệ”

Bản trước là một viên pill nằm chồng lên đáy quạt, trông như dán lên ảnh; ‹ › ⏸
dồn cục một chỗ nên không rõ chiều.

Nay là **dải ngang hết bề rộng cột bìa**, có đường kẻ mảnh phía trên đóng vai
**mép kệ** cho bìa đứng lên, và bố trí đúng chiều đọc:

```
‹            01 / 05 · SIIX            ›      ⏸
└ mép trái   └ canh giữa              mép phải  └ điều khiển phụ
```

- `‹` sát mép trái, `›` sát mép phải (mắt đọc trái → phải), cụm `số đếm · tác giả`
  canh giữa bằng `margin: 0 auto`;
- bỏ nền tròn đặc của mũi tên — chỉ hiện nền khi hover/focus, nên dải nhẹ và đều;
- ⏸ nhỏ hơn (26px), nép cuối dải vì là điều khiển phụ;
- quạt cao `1.5 × bề rộng bìa + 78px`: 78px đó là làn cho dải điều khiển, bìa
  không còn chồng lên thanh.

### 3. Bìa to thêm một nhịp

`--cover-w`: `clamp(176px, 17.5vw, 262px)` → **`clamp(196px, 22.5vw, 292px)`**;
`--fan-unit` không khai báo rời nữa mà **suy ra** `calc(var(--cover-w) * .42)` để
mọi mốc responsive tự co theo bìa; độ xoè bìa ngoài `1.28` → **`1.22`** (bìa to
hơn nhưng quạt vẫn không chạm cột chữ). Mốc tablet `clamp(140px, 19vw, 200px)`,
điện thoại `118px`, ≤380 `102px`.

### Tệp đã sửa

| Tệp | Vì sao |
| --- | --- |
| `src/cz-hero.js` | thanh điều khiển có thêm cụm giữa `.fanbar-mid` (số đếm · tác giả) để canh giữa dải |
| `src/cz.css` | `.hero`/`.hb-grid` thấp lại; dải điều khiển ngang + mép kệ; bìa `clamp(196–292px)`, `--fan-unit` suy ra, xoè 1.22; quạt `1.5w + 78px`; bìa đặt ở 47% |
| `tests/t_hero.js` | cấu trúc dải mới: `‹ → (.fanbar-mid: số đếm · chấm · tác giả) → › → ⏸` |
| `sw.js` + 76 HTML | `?v=20261029hero10` |

### Kiểm

`t_hero` “Hero banner đạt hết” · `t_home` · `t_adult` N12 · `t_lock_ui` · `t_pwa` ·
`audit:a11y` 25 màn 0 lỗi axe · `check_src` khớp · `cz.css` 196,3 kB · `cz-hero.js` 12,6 kB.

---

## 21. Vòng 7 — bỏ mô tả, bố cục chữ đứng yên, làm lại dải chuyển và viền bìa (2026-10-29)

### 1. Banner chỉ còn: nhãn trạng thái · tên truyện · kệ nhãn · nút

Bỏ hẳn hai thứ khỏi slide:

- `<p class="syn">` — mô tả bị cắt 2 dòng nên đọc không hết ý mà vẫn chiếm chỗ;
- `.prog` (thanh “đang đọc chương …”) — chỉ hiện với truyện người dùng đang đọc,
  tức là **chiều cao cột chữ đổi theo từng người**, kéo nút và mọi thứ bên dưới
  nhảy chỗ. Trạng thái đọc vẫn còn: nút chính đổi thành “Đọc tiếp”.

Hàm `progressHTML()` trong component cũng bị xoá (không còn nơi dùng).

**Vị trí cố định** bằng ba chốt:

| Phần | Cách chốt |
| --- | --- |
| Tiêu đề | `h1` cao **cố định 3 dòng** (`3.18em`), chữ dồn **đáy** hộp qua `.hb-t` (`-webkit-line-clamp: 3`) ⇒ tên 1 dòng hay 3 dòng thì kệ nhãn vẫn nằm đúng một chỗ |
| Kệ nhãn | `dd` **một dòng** (`white-space: nowrap` + `text-overflow: ellipsis`) ⇒ hàng nhãn không cao thấp theo tên tác giả/couple |
| Nút | `.btn-row` cao 44px cố định, cách kệ nhãn 22px |

Thêm: bỏ chốt cũ `.hero { min-height: 510px }` ở `@media (max-width: 700px)` —
nó đè lên chiều cao nội dung và tạo lại khoảng trống dưới banner trên điện thoại.

### 2. Dải chuyển: bỏ đường kẻ, gom thành cụm giữa

Đường kẻ `border-top` của `.fanbar` chạy **ngang qua chân các bìa** (bìa có`z-index`
1–6, thanh là 8) nên nhìn như một vạch kẻ lạc vào ảnh — đó là lý do “kì”.

Nay: không kẻ, không nền, không khung; chỉ một cụm canh giữa dưới quạt:

```
        ‹     02 / 05 · REVERSE     ›        ⏸
```

- `‹` `›` là hai nút tròn 30px **trong suốt**, chỉ hiện nền khi hover/focus;
- ⏸ tách khỏi cụm 8px (điều khiển phụ), nhỏ hơn (26px);
- làn dành cho cụm dưới chân bìa tăng `78px → 96px` ⇒ bìa không bao giờ chồng lên nút.

### 3. Viền bìa: bỏ “sticker”, dùng cạnh tối + bóng

- bỏ `border: 1px solid rgba(255,255,255,.18)` và **vòng `0 0 0 2px var(--hb-acc)`**
  của bìa đang chọn (chính là viền hồng nhìn kì trong ảnh);
- thay bằng `inset 0 0 0 1px rgba(0,0,0,.45)` (cạnh tối) + bóng mềm
  `0 26px 48px -30px rgba(0,0,0,.92)`;
- gáy: dải tối 13 % → **9 %**, bỏ đường gấp sáng; mép giấy 4 % → 3 %;
- vệt ánh giấy chéo 20 % → **10 %** (bìa không còn bị “bợt trắng” ở góc);
- bìa đang chọn: sáng đầy đủ + scale 1.05 + bóng sâu hơn + quầng ấm 38 % accent
  (rất nhẹ), không có đường kẻ màu.

### Tệp đã sửa

| Tệp | Vì sao |
| --- | --- |
| `src/cz-hero.js` | bỏ `.syn` + `.prog` khỏi slide, xoá `progressHTML()`; `h1` bọc `.hb-t` để khoá 3 dòng và dồn đáy |
| `src/cz.css` | hộp tiêu đề cố định 3 dòng; `dd` một dòng; bỏ rule `.syn`/`.prog`; `.fanbar` bỏ kẻ, canh giữa; làn chân quạt 96px; viền bìa mới; bỏ `min-height: 510px` cũ ở ≤700px |
| `sw.js` + 76 HTML | `?v=20261029hero11` |

### Kiểm

`t_hero` “Hero banner đạt hết” · `t_home` · `t_adult` N12 · `t_lock_ui` · `t_pwa` ·
`audit:a11y` 25 màn 0 lỗi axe · `check_src` khớp · `cz.css` 195,5 kB · `cz-hero.js` 12,2 kB.

---

## 22. Vòng 8 — bố cục POSTER: chữ dồn đáy, quạt giữ phần trên (2026-10-29)

Ảnh chụp cho thấy hai lỗi rõ:

1. **Lỗ hổng giữa nhãn trạng thái và tên truyện** — do vòng trước ép `h1` thành hộp
   cao 3 dòng và dồn chữ xuống đáy hộp: tên 1 dòng thì 2 dòng trống nằm ngay dưới nhãn;
2. **“Garn x Mi…”** — kệ nhãn bị khoá một dòng + `text-overflow: ellipsis`, mà ở bố
   cục tablet (4 cột trong 400px) cột COUPLE chỉ ~89px nên tên bị cắt.

### Đã sửa

- `h1`: bỏ hộp cứng 3 dòng, chỉ giữ **chỗ 2 dòng** (`min-height: 2.12em`), chữ nằm ở
  ĐẦU hộp ⇒ hết lỗ hổng; tên dài hiếm khi quá 3 dòng và chỉ đẩy mọi thứ xuống 1 dòng;
- tiêu đề to hơn: `clamp(34px, 3.6vw, 54px)` (tablet `clamp(28px, 4vw, 42px)`);
- kệ nhãn: bỏ `nowrap`/`ellipsis`, cho **xuống dòng** và chừa sẵn 2 dòng
  (`min-height: 2.7em`) ⇒ không cắt tên, chiều cao hàng vẫn bằng nhau;
- **tablet chuyển kệ nhãn sang 2×2** (`CHƯƠNG | TÁC GIẢ` / `COUPLE | CẬP NHẬT`) —
  4 cột trong 400px là quá chật;
- **bố cục poster (phương án đã chọn)**: `.hb-col { justify-content: flex-end }` +
  `.stage { flex: 0 0 auto }` ⇒ cả khối chữ dồn xuống ĐÁY cột, đáy hàng nút trùng
  đáy dải điều khiển bên quạt; khoảng trống dồn lên trên cho nền “thở”;
- quạt: làn chân `84px → 70px` (dải điều khiển sát bìa hơn), mũi tên 30 → **32px**,
  icon ⏸ 14px.

### Tệp đã sửa

`src/cz.css` (các mục trên) · `sw.js` + 76 HTML: `?v=20261029hero13`.

### Kiểm

`t_hero` đạt hết · `t_home` · `t_adult` N12 · `t_pwa` · `audit:a11y` 25 màn 0 lỗi axe ·
`check_src` khớp.

---

## 23. Vòng 8 — hero theo theme, điều khiển quạt làm lại, bỏ đường kẻ thừa (2026-10-29)

Ba điểm người dùng nêu từ ảnh chụp (khổ ~1000 CSS px, tức bố cục tablet):

### 1. “Trang chỉ còn dạng tối” — hero khoá cứng nền than

Hero cũ đặt `--hb-void: #0a090b` và mọi màu chữ/đường kẻ/màn che bằng hằng số
tối, nên bật nền sáng thì cả trang đổi mà riêng màn đầu vẫn tối ⇒ cảm giác mất
chế độ sáng. Nay:

- `.hero` khai báo **bộ token nền SÁNG** (`--hb-void: #f7f2ea`, chữ `#1b1512`,
  `--hb-veil: 247, 242, 234`, `--hb-shade: 96, 74, 48`, `--hb-pic`, `--hb-ghost`,
  `--hb-blend`, `--hb-track`, `--hb-hover`…);
- `[data-theme="dark"] .hero` chỉ **ghi đè token** — không lặp lại bố cục;
- mọi chỗ từng hardcode màu đã chuyển sang token: màn che `.veil` (12 chỗ),
  `.pic` filter, `.ghost` opacity, `.glow` blend/opacity, `.bar` track, hover nút,
  bóng `.fan::after`, bóng bìa, gradient `.noimg`, dừng cuối của `.hb-scene`.

Thêm thành phần mới trong hero: dùng token, **đừng viết màu trực tiếp**.

### 2. Điều khiển chuyển truyện: bỏ dải chữ, tách theo chức năng

Gốc của cảm giác “dư thừa/kì”: quạt bìa **đã là bộ chọn** (bấm bìa nào mở truyện
đó) nên 5 vạch ticks chỉ là bản sao; tên tác giả đã có trong kệ nhãn; và cả dải
chữ nằm dưới chân quạt mà không cùng hàng với thứ gì.

Nay:

```
‹  [ bìa … bìa ]  ›               ← hai mép quạt, ngang tầm bìa
                     01 / 05  ⏸    ← góc trên-phải, cao ngang nhãn trạng thái
```

- `#hPrev/#hNext` thành nút kính tròn 44px (tablet 40, mobile 38) ở **hai mép
  quạt**, luôn hiện (cảm ứng không có hover), sáng lên khi trỏ/focus;
- `#hCount` + `#hPlay` gom vào `.fanbar` ở góc trên-phải (mono 10px, `⏸` 28px);
- **bỏ** `.ticks`, `.fanbar-mid`, `.fanbar-dot`, `.who` (tên tác giả) — không
  còn vạch đếm trùng và không còn dòng chữ dưới chân quạt;
- làn chân quạt 70px → 0: `.fan` cao `calc(--cover-w * 1.64 + 50px)`, bìa đặt
  `top: 52%` ⇒ chừa ~40px phía trên cho cụm góc, đáy bìa vẫn nằm trong khung;
- cột chữ bỏ luôn hàng điều khiển dưới cùng ⇒ banner thấp hơn ~50px, hết khoảng
  trống dưới hàng nút.

### 3. Đường kẻ ngang phía trên nhãn trạng thái

Đường kẻ 1px `--hb-line` duy nhất trong cột chữ là `border-top` của `.spec`.
Trên nền có ảnh bìa mờ, một sợi trắng nằm lơ lửng ngay dưới tên truyện đọc ra
như vết gạch thừa (nhất là khi cột chữ dồn đáy theo bố cục poster — nó tách
khỏi cụm chữ). Đã **bỏ hẳn đường kẻ**: `.spec` chỉ còn `margin-top: 24px`,
tách tầng bằng khoảng thở. Cột chữ giờ không có đường kẻ nào.

### Tệp đã sửa

`src/cz.css` (token sáng/tối, khối 5.5 mới, `.spec` bỏ viền, kích thước `.fan`) ·
`src/cz-hero.js` (`fanHTML`/`fanBarHTML` mới, bỏ `.who`) ·
`tests/t_hero.js` (khoá cấu trúc mới) · `sw.js` + 76 HTML: `?v=20261029hero14`.

### Kiểm

`t_hero` đạt hết (gồm: ‹ › ở hai mép quạt, cụm góc chỉ còn `count + ⏸`, không
ticks, không lặp tên tác giả) · `t_home` · `t_adult` N12 · `t_lock_ui` · `t_pwa`
· `audit:a11y` 25 màn 0 lỗi axe · `check_src` khớp · `cz.css` 196.6 kB (91 % trần).

---

## 24. Vòng 9 — sửa đúng đường kẻ (lỗi trùng tên lớp), bỏ hẳn ‹ › (2026-10-29)

### 1. Đường kẻ “lạ” phía trên nhãn trạng thái — nguyên nhân thật

Không phải quy tắc nào của hero. Hero dựng khối chữ bằng `<div class="info">`,
mà `cz.css` có một quy tắc **dùng chung cho trang truyện**:

```css
.info { border-top: 1px solid var(--bd); }   /* khối thông tin trang truyện */
```

Lớp trùng tên ⇒ hero “thừa hưởng” một sợi 1px ngay trên nhãn trạng thái, rộng
đúng bằng cột chữ. Vòng trước t đi tìm trong khối hero nên không thấy, rồi lại
xoá nhầm đường kẻ **của kệ nhãn** (dưới tên truyện) — đường duy nhất đáng giữ.

Nay:

- `.hero .info` → **`.hero .hb-info`** (đổi tên, không vá bằng `border-top: 0`
  để sau này không ai dựng lại đúng cái bẫy đó); markup cũng đổi theo;
- trả lại `border-top` cho `.spec` (`margin: 20px 0 0; padding: 14px 0 0`);
- quy ước mới ghi trong CSS: **lớp nào của hero cũng mang tiền tố `hb-`**.

### 2. Bỏ hẳn nút ‹ ›

Người dùng: “cái nút chuyển qua lại xấu quá, bỏ luôn đi”. Đã bỏ khỏi markup
(`fanHTML` không còn dựng `#hPrev/#hNext`, `mount` không còn ẩn chúng).

Cách chuyển truyện còn lại — đủ và không thêm nút:

- **bấm bìa** trong quạt (bộ chọn chính, có `aria-current`);
- **← →** khi focus ở trong hero (`role="group"`, `aria-roledescription="carousel"`);
- **tự chuyển** (bật/tắt bằng ⏸).

Góc trên-phải vẫn giữ `01 / 05` + `⏸` (định vị + dừng tự chuyển).

### Tệp đã sửa

`src/cz.css` (đổi tên `.hb-info`, trả lại đường kẻ `.spec`, xoá `.arrow.edge`) ·
`src/cz-hero.js` (đổi tên lớp, bỏ 2 nút) · `tests/t_hero.js` (khoá: không có
`#hPrev/#hNext/.arrow.edge`; đổi slide bằng bấm bìa + ← →) ·
`sw.js` + 76 HTML: `?v=20261029hero15`.

### Kiểm

`t_hero` đạt hết · `t_home` · `t_adult` N12 · `t_pwa` · `audit:a11y` 25 màn 0
lỗi axe · `check_src` khớp.

---

## 25. Vòng 10 — BỎ HẲN CHẾ ĐỘ SÁNG (web chỉ còn nền tối) — 2026-10-29

Yêu cầu: “bỏ hoàn toàn light mode”. Đây không phải chỉnh hero mà là đổi mô hình
màu của cả web — hero chỉ là chỗ lộ ra rõ nhất.

### Đã làm

- **CSS**: bảng màu tối chuyển từ `[data-theme="dark"]` vào thẳng `:root`
  (`--bg:#14110e`, `--txt:#f2ebe0`, `--acc:#e0859b`…, `color-scheme: dark`);
  xoá `[data-theme="dark"]`, `[data-theme="light"]` và 6 luật phụ thuộc theme
  (`.nw-bookmark`, `.b18`, `.badge-new`, `.badge-newchap`, `.editable-rating`,
  `.hero`) — các giá trị tối của chúng gộp về quy tắc gốc.
- **Hero**: một bộ token tối duy nhất; không còn nhánh sáng.
- **Header**: bỏ công tắc sáng/tối (`#czTheme/#czThemeIn`) khỏi markup và toàn
  bộ handler (`paintTheme`, `change`); xoá luôn khối CSS `.tsw*` (rãnh, núm,
  icon trượt) cùng 3 luật responsive của nó.
- **Trang quản trị**: bỏ `ThemeButton` khỏi `src/admin/components/Layout.jsx`.
- **Lõi**: `themeInit()` khoá `<html>` ở `data-theme="dark"` và **không đọc
  localStorage** nữa ⇒ máy nào từng lưu “light” cũng vào thẳng nền tối;
  `themeToggle()` giữ làm hàm rỗng (trả `'dark'`) cho nơi còn gọi;
  `themeMeta()` luôn đặt `theme-color = #14110e`.
- **HTML (85 tệp)**: `data-theme="dark"`, `theme-color` → `#14110e`, bỏ script
  “chống nháy nền” (không còn gì để nháy). `manifest.webmanifest`:
  `theme_color`/`background_color` → `#14110e`.

### Kiểm

`t_mobile` (khoá: không còn `#czTheme`, `data-theme` luôn `dark`, không ghi
`ssochuz-theme`, CSS không còn `.tsw*` và `[data-theme="light"]`, trang quản trị
không còn nút đổi nền) · `t_flows` · `t_home` · `t_hero` · `t_lock_ui` · `t_pwa`
· `audit:a11y` 25 màn 0 lỗi axe · `check_src` khớp · `check:version` 1.20.0.

`sw.js` + 76 HTML: `?v=20261029hero16`.
