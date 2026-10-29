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
  vạch tiến trình 2 px; mobile đổi thành dải bìa cuộn ngang.
- **B · “Kệ trưng”** (giấy) — bìa lớn đóng khung + **mục lục 01–05** bên cạnh trên một trục số,
  bỏ hẳn thumbnail nhỏ trong danh sách (thứ làm bản trước trông vụn); tổng cao ~440 px.
- **C · “Đèn rọi”** (tối, ấn tượng nhất) — `perspective`, bìa chính + hai bìa kế `rotateY 15°`
  bấm được (có `role`/`tabindex`/Enter-Space), phản chiếu `mask-image` tĩnh, quầng sáng lấy từ chính bìa,
  parallax con trỏ ≤2,5° và tắt khi `prefers-reduced-motion`.

Kiểm chứng: jsdom **69/69** (3 khối, quạt/mục lục/ticks đủ 5, đổi truyện → tiêu đề + bìa + `aria-current` +
vùng `aria-live`, nút Tạm dừng, bìa hai bên bấm/kbd, chip khổ & giao diện, 5 bìa có thật trong `assets/covers`).

**Đang chờ chọn A / B / C** — sau đó mới đụng `src/cz-hero.js` (hiện vẫn là bản full-bleed V0).
