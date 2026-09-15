# Báo cáo · “unslop” thanh đầu trang + thẻ truyện + nhịp khối

Ngày: 2026-09-15 · Nhánh: `arena/01a0a53e-ssochuz` · Tệp sửa: `src/cz.css`
(sau đó `npm run build` sinh lại `/cz.css` đã rút gọn)

> Web này **không dùng Tailwind**. Toàn bộ giao diện là CSS viết tay chạy trên một
> bộ biến (design token) trong `:root`. Vì vậy “điều chỉnh class Tailwind” ở đây
> được thực hiện tương đương: **đổi token + ghi đè đúng những luật cần sửa**, không
> đụng vào HTML, không đổi thứ tự khối, không đổi logic thẻ.

---

## 1. Chẩn đoán — chỗ nào đang “slop”

| # | Bệnh | Biểu hiện cụ thể trong mã cũ |
|---|------|------------------------------|
| 1 | **Viên thuốc dồn đống** | 4 mục điều hướng, mỗi mục là một hộp có viền + nền + `translateY(-1px)` khi trỏ; cộng nút Tìm, công tắc nền, nút tài khoản, nút menu → 8 hộp viền chen nhau trên một thanh cao 58px. |
| 2 | **Nhấn mạnh 3 lần cho 1 trạng thái** | `.nav a.on` vừa viền accent + nền accent 10% + in đậm 700, **vừa** có gạch mực `#czInk` chạy dưới đáy. |
| 3 | **Reflow khi cuộn** | `.nav a.on { font-weight: 700 }` trong khi scroll-spy liên tục đổi `.on` → cả dãy mục xô ngang mỗi lần cuộn. |
| 4 | **Trang trí lệch tông** | Công tắc sáng/tối 64×32 màu trời `#9fcfd2` / tím `#51466f` / trăng vàng `#f2cf78` — lạc hẳn khỏi hệ “giấy #faf8f4 · mực #191410 · son #a63a52”, lại chiếm gần 1/6 bề ngang thanh. |
| 5 | **Kính mờ tự mâu thuẫn** | `.hero .foot` dùng `backdrop-filter: blur(6px)` trong khi chính đầu tệp CSS ghi “KHÔNG dùng gradient, kính mờ”. |
| 6 | **Lưới khoảng cách không nhất quán** | `gap: 22px` (header), `26px 18px` (lưới), `18px 16px` (dải), `46px` (khối), `11px`/`13px`/`9px`/`7px`/`3px` rải rác — không số nào theo lưới 4/8px. |
| 7 | **Chiều cao điều khiển lệch nhau** | Ô chọn ~45px · ô tìm kiếm 42px · nút đổi kiểu xem 40px · tab 28px · nút `.btn.sm` 35px → cùng một hàng/cùng một hộp mà mép trên không thẳng. |
| 8 | **Bóng đổ loang** | `.card:hover .th { box-shadow: 0 15px 30px rgba(0,0,0,.15) }` — không có spread âm nên quầng xám loang ra nền giấy, làm mờ cạnh bìa. |
| 9 | **Chữ bơi trong ô** | `.pill` gốc đặt `min-height: 23px`; nhãn trên bìa (`.card .th .pill`) chỉ 9.5px nên bị nhốt trong hộp cao gấp đôi cỡ chữ. |
| 10 | **Chữ nhảy khi trỏ** | `.card:hover h3 { transform: translateY(-4px) }` — bìa nhấc lên 4px, tiêu đề cũng nhấc 4px → tiêu đề rời khỏi dòng tác giả, khoảng cách thẻ tự nhiên “thở” sai. |
| 11 | **Đáy thẻ không thẳng hàng** | `.card h3` clamp 2 dòng nhưng **không** giữ chỗ → thẻ tiêu đề 1 dòng thấp hơn thẻ 2 dòng, hàng lưới răng cưa. |
| 12 | **Trùng lặp luật** | `.card .th .b18` khai báo 2 lần (7px rồi 8px), `.pill` 2 lần, `.badge-new` nền `#fff` 2 lần. |

---

## 2. Hệ quy chiếu mới (thêm vào `:root`)

```css
/* LƯỚI 4/8px — mọi khoảng cách rơi vào bội số của 4 (8 với khoảng cách giữa khối) */
--hdr-h:  60px;   /* chiều cao thanh đầu trang (cũ: 58px)                          */
--ctl:    36px;   /* điều khiển trên thanh đầu trang                               */
--ctl-lg: 40px;   /* điều khiển MỘT DÒNG trong nội dung: ô lọc, ô nhập, tab lọc     */
--sh-card: 0 10px 22px -16px rgba(30, 20, 10, .55);  /* bóng sát chân cho bìa       */
```

**Thang chiều cao điều khiển** (hết lệch mép):

| Bối cảnh | Chiều cao |
|---|---|
| Ô nhập / ô chọn / ô tìm kiếm / nút đổi kiểu xem / tab trong hộp lọc | `--ctl-lg` = 40px |
| Nút trên thanh đầu trang, nút trang, `.seg` | `--ctl` = 36px |
| Nút phụ trong tiêu đề khối (`.btn.sm`), tab nhỏ (`.tabs.sm`) | 32px |
| Điều khiển chạm trên điện thoại (≤560px) | 40px |

**Thang chữ** (không còn nhãn 9.5–11.5px lạc nhịp):

| Vai trò | Cỡ / dòng / khoảng chữ |
|---|---|
| Tiêu đề khối `h2` | 22px · 1.2 · −.018em |
| Mục điều hướng | 13.5px · 600 · +.004em (12.5px khi ≤1080px) |
| Tiêu đề thẻ `.card h3` | 14.5px serif · 1.4 · −.006em · **giữ chỗ 2 dòng** |
| Metadata (`.cb`, `.cl-meta`, `.cont .st`, `.rank .tt span`) | 12–12.5px · **1.5** · +.004em |
| Đoạn mô tả (`.hero .syn`, `.cl-syn`) | 13–16px · **1.6–1.7** |
| Nhãn trên bìa | 10–11px · 1.3 · +.03em |

---

## 3. Thanh đầu trang — giữ nguyên DOM, đổi cách nói

Cấu trúc `mountHeader()` trong `src/cz-app.js` **không sửa một ký tự**:
`logo → nav(4 mục + #czInk) → grow → Tìm ⌘K → công tắc nền → tài khoản → menu`.
Chỉ có CSS thay đổi.

### 3.1 Mục điều hướng: từ “viên thuốc” thành chữ có gạch mực

```css
/* CŨ */
.nav a      { height:36px; border:1px solid var(--bd); border-radius:var(--r); padding:0 11px; }
.nav a:hover{ border-color:var(--bd2); background:var(--surf); transform:translateY(-1px); }
.nav a.on   { font-weight:700; border-color:var(--acc); background:color-mix(in srgb,var(--acc) 10%,transparent); }
.nav .ink   { bottom:-6px; }                    /* gạch mực lơ lửng giữa thanh */

/* MỚI */
.nav        { align-self:stretch; margin-right:8px; }
.nav a      { height:100%; border:0; background:none; padding:0 12px;
              font-size:13.5px; font-weight:600; letter-spacing:.004em; color:var(--mut); }
.nav a:hover, .nav a.on { color:var(--txt); }   /* chỉ đổi màu mực */
.nav a::after { left:12px; right:12px; bottom:0; height:2px; background:var(--bd2);
              transform:scaleX(0); }            /* gạch mờ khi trỏ */
.nav a:hover::after { transform:scaleX(1); opacity:1; }
.nav a.on::after    { opacity:0; }              /* mục đang xem nhường chỗ cho #czInk */
.nav .ink   { bottom:-1px; height:2px; border-radius:2px 2px 0 0; }  /* đè ĐÚNG lên đường kẻ đáy */
.nav a .i   { display:none; }                   /* desktop: chỉ chữ — bớt nhiễu */
```

Kết quả: một đường kẻ tóc duy nhất ở đáy thanh, mục đang xem được đánh dấu bằng
**đoạn mực 2px thay đúng vào chỗ đường kẻ đó** (không phải một gạch lơ lửng),
và **không còn đổi `font-weight`** → hết xô ngang khi scroll-spy nhảy mục.
Vùng bấm cao trọn 60px (trước chỉ 36px).

### 3.2 Nhịp và vách ngăn

```css
.hdr .in { height:var(--hdr-h); gap:8px; padding:0 24px; }   /* cũ: 58px · gap 22px */
.hdr .in > .grow { position:relative; flex:1 1 auto; min-width:20px; }
.hdr .in > .grow::after { content:""; position:absolute; right:0; top:50%; width:1px;
  height:20px; margin-top:-10px; background:var(--bd); }     /* vạch tóc ngăn nav ↔ tiện ích */
```

### 3.3 Cụm tiện ích: một cỡ, một kiểu viền, không nhấc

```css
.hbtn { height:var(--ctl); padding:0 12px; gap:8px; background:var(--surf);
        font-size:13px; font-weight:600; letter-spacing:.004em; }
.hbtn:hover  { color:var(--txt); border-color:var(--bd2); background:var(--surf2); }  /* bỏ translateY(-1px) */
.hbtn:active { background:var(--surf3); }
.hbtn .k { font-family:var(--font-mono); font-size:10.5px; background:var(--bg2);
           border:1px solid var(--bd); border-radius:4px; padding:0 5px; }            /* ⌘K ra dáng phím */
```

Nút tài khoản: đã đăng nhập là **trạng thái**, không phải lời mời → bỏ viền hồng
`color-mix(var(--acc) 40%)`, về viền tóc thường, tên hiển thị mực nhạt; avatar
22px có viền 1px để không “chìm” vào nút.

### 3.4 Công tắc sáng/tối — giữ cơ cấu, bỏ màu hoạt hình

Giữ đúng bộ khung Uiverse (`label > input.tsw-in + span.tsw-sl + 2 svg.tsw-icon`,
trượt bằng `translateX(100%)`, xoay 180°, ô chọn thật nằm trên cùng) để phím Space,
`aria-label` và toàn bộ kiểm thử cũ vẫn chạy. Chỉ đổi **chất liệu và kích thước**:

| | Cũ | Mới |
|---|---|---|
| Kích thước | 64×32 (mobile 52×28) | **48×26** (mobile 44×24) — đúng lưới 4px |
| Rãnh | trời xanh `#9fcfd2` → tím `#51466f` | khe lõm `var(--surf3)` + `inset 0 1px 2px` |
| Núm | chính icon tô đặc, không nền | **đĩa giấy tròn** `var(--surf)`, viền `var(--bd2)` |
| Biểu tượng | trăng vàng `#f2cf78`, nắng `#fff0a3`, `fill:currentColor` | Tabler **nét đơn sắc** `fill:none`, `var(--mut)` / `var(--txt)` |
| Focus | vòng sáng bị `overflow:hidden` cắt mất | `inset 0 0 0 2px var(--ring)` — thấy được |

Núm vẫn cách mép rãnh đúng **1px ở cả hai đầu** vì quãng trượt tính bằng
`translateX(100%)` = một đường kính núm.

### 3.5 Bốn bậc co giãn (thay cho hai mốc chồng chéo 940/760 cũ)

```
≤1080px  chữ 12.5px, logo 20px, giấu phím tắt ⌘K
≤ 980px  nút tài khoản chỉ còn avatar 36px
≤ 900px  mục điều hướng chỉ còn icon 40px (title + aria-label vẫn đủ)
≤ 760px  nút Tìm chỉ còn icon, hiện nút menu, thanh cao 56px, logo 19px
≤ 400px  thương hiệu rút còn “ssochuz”, gap 6px, grow min-width 0
```

Đã cộng lại bề ngang từng bậc: tổng rộng nhất ≈ **923px ở mốc 1080px** (chứa
1032px) → **không còn tràn** như bản cũ (ước tính ≈ 998px ngay tại mốc 941px,
tức là chip bị bóp méo đúng ở khoảng 941–1000px).

---

## 4. Thẻ truyện (D.1) — giữ nguyên vị trí ảnh · tiêu đề · metadata

```css
/* lưới: 16px cột · 24px hàng (cũ 26px 18px — cả hai đều trật lưới) */
.grid { gap:24px 16px; grid-template-columns:repeat(auto-fill,minmax(154px,1fr)); }
@media (max-width:560px){ .grid{ gap:20px 12px; } }        /* cũ: 22px 13px */
.rail { grid-auto-columns:152px; gap:20px 16px; padding:2px 2px 16px; }
@media (min-width:1100px){ .rail{ grid-auto-columns:168px; } }   /* cũ 170px — trật lưới */

/* bìa: tỉ lệ 2/3 khoá cứng, góc 4px (sắc hơn 6px), viền tóc, bóng chỉ khi trỏ */
.card .th { aspect-ratio:2/3; border-radius:var(--r-sm); border:1px solid var(--bd);
            transition:transform var(--t) var(--ease), border-color var(--t) var(--ease),
                       box-shadow var(--t) var(--ease); }        /* cũ: transition: var(--t) — mọi thuộc tính */
.card:hover .th { transform:translateY(-2px); box-shadow:var(--sh-card); border-color:var(--bd2); }
.card:hover .th img { transform:scale(1.03); }                   /* cũ 1.04 + nhấc 4px */

/* tiêu đề GIỮ CHỖ 2 dòng → đáy mọi thẻ trong một hàng thẳng nhau */
.card h3 { line-height:1.4; letter-spacing:-.006em; margin:10px 0 4px; min-height:2.8em; }
.card:hover h3 { color:var(--acc); }                             /* BỎ transform:translateY(-4px) */
.card .cb { font-size:12px; line-height:1.5; letter-spacing:.004em; }

/* nhãn trên bìa: hết “chữ bơi trong ô”, chừa chỗ cho huy hiệu 18+ */
.card .th .pill { top:8px; left:8px; max-width:calc(100% - 48px); min-height:0;
                  padding:3px 7px; font-size:10px; line-height:1.3; letter-spacing:.03em;
                  white-space:nowrap; }
.card .th .b18  { top:8px; right:8px; }                          /* gộp 2 luật trùng 7px/8px */
.card .th .foot { inset:auto 8px 8px; gap:8px; }
.card .th .foot .ch { font-weight:750; letter-spacing:.03em; font-variant-numeric:tabular-nums;
                      text-shadow:0 1px 2px rgba(10,6,4,.45); }  /* chữ trắng đọc được trên ảnh */
.card .th .scrim { height:40%; background:linear-gradient(180deg,transparent,rgba(12,8,6,.76)); }
```

Dạng danh sách (`.card.list`) — cùng logic, đưa về lưới:

```css
.card.list        { gap:16px; padding:16px 12px; }   /* cũ: gap 18px · padding 14px 10px 14px 12px */
.card.list::before{ top:16px; bottom:16px; }         /* vạch trạng thái canh theo đệm mới */
.card.list .cl-t  { line-height:1.3; letter-spacing:-.012em; }
.card.list .cl-meta{ line-height:1.5; margin-top:4px; }
.card.list .cl-syn { line-height:1.6; margin-top:8px; }
.grid.list-view .list-head { gap:16px; padding:0 12px 8px; }   /* thẳng cột với hàng thật */
```

---

## 5. Khối & hàng lọc (D.2) — để bố cục cũ trông “có chủ ý”

```css
.sec      { margin:56px 0; }                          /* cũ 46px */
.sechead  { gap:16px; padding-bottom:12px; margin-bottom:20px; }   /* cũ 14/11/18 */
.sechead h2 { line-height:1.2; letter-spacing:-.018em; gap:8px; }
.sechead .right { gap:8px; }
@media (max-width:620px){ .sec{margin:40px 0} .sechead{gap:12px;padding-bottom:10px;margin-bottom:16px}
                          .sechead h2{font-size:20px} }

.fbox     { padding:16px; margin-bottom:24px; }       /* cũ 22px */
.fbox .row1 { gap:8px; }                              /* cũ 10px */
.fbox .tabs > button { min-height:var(--ctl-lg); padding:0 14px; }  /* tab lọc = ô lọc = 40px */
.fgroup   { align-items:center; }  .flab { padding-top:0; line-height:1.4; }
.fpick, .fcount, .fgroups { margin-top:16px; }        /* cũ 14px */
.pager    { gap:8px; margin-top:32px; }               /* cũ 6px · 34px */

/* các khối còn lại cùng nhịp */
.contcols { gap:16px; }  .cont:hover { transform:translateY(-1px); box-shadow:var(--sh-card); }
.rank     { gap:12px; padding:12px 8px 16px; }  .rank:hover { transform:translateX(2px); }
.sched    { gap:12px 16px; padding:12px; }       .sched.clk:hover { transform:translateX(2px); }
.facts .f { padding:24px 20px; }                 /* cũ 22px */
.hero .col{ padding:48px 24px 40px; gap:48px; }  .hero .footin { padding:12px 24px; }
.hero .foot { background:var(--bg); }            /* BỎ backdrop-filter:blur(6px) — hết kính mờ */
.hero .meta { gap:8px 16px; padding-bottom:16px; margin-bottom:16px; }
.hero .syn  { line-height:1.7; }
.hero .posterwrap:hover .poster { transform:translateY(-4px); }   /* bỏ rotate(-.6deg) + bóng 34/58 */
```

Ngoài ra: `-webkit-font-smoothing: antialiased` cho `body` (chữ nhỏ 12–13px sắc hơn
trên màn Retina), và `--sh-lg` hạ từ `0 24px 48px -30px` xuống `0 20px 40px -28px`
cho hộp thoại / menu thả xuống.

---

## 6. Những gì GIỮ NGUYÊN (đúng ràng buộc)

- **Thứ tự khối** trên trang chủ: Hero → Dải số → My Space → Mới cập nhật →
  Bình chọn nhiều nhất → ssochuz’s choices → Lịch ra chương → Thư viện.
- **Logic thẻ**: ảnh bìa ở trên (tỉ lệ 2/3), tiêu đề, rồi metadata — không đổi
  thứ tự, không đổi vị trí DOM.
- **Thanh đầu trang**: cùng một `mountHeader()`, cùng id (`#czNav`, `#czInk`,
  `#czJump`, `#czTheme`, `#czThemeIn`, `#czAuthBtn`, `#czAuthMenu`, `#czBurger`,
  `#czMnav`), cùng hành vi (scroll-spy, ⌘K, menu Esc, công tắc đổi đúng một nhịp).
- Không thêm thư viện, không thêm font, không đổi bảng màu, không đổi HTML.
- Chỉ đổi chuỗi phiên bản cache `?v=20260915f` → `?v=20260915g` để người đang mở
  web tải bản CSS mới (trước đó `guide.html` đã ở mức `g`, nay cả 5 trang khớp nhau).

---

## 7. Kiểm chứng

```bash
npm run build     # src/cz.css → /cz.css (rút gọn)
npm test          # 15 bài · TẤT CẢ ĐẠT
python3 tools/dev_server.py --port 8080   # xem thử
```

`tests/t_mobile.js` soi cả `src/cz.css` lẫn `cz.css` bằng biểu thức chính quy cho
công tắc nền (`.tsw-sl`, `.tsw-in:checked ~ .tsw-icon.moon`, `.tsw-icon.sun`,
`translate(-100%) rotate(-180deg)`) — bản mới vẫn giữ đủ, đã kiểm tra trên **bản
đã rút gọn** chứ không chỉ bản nguồn.

---

## 8. Bổ sung 2026-09-15 (lần 2)

### 8.1 Đổi tên mục · “Biên tập viên chọn” → “ssochuz’s choices”

| Tệp | Chỗ sửa |
|---|---|
| `index.html` | `<h2>` của `#bien-tap` + chú thích khối |
| `admin.html` | tiêu đề thẻ “Góc biên tập viên”, dòng gợi ý, placeholder ô tìm |

Dùng dấu nháy cong `’` (U+2019) chứ không phải `'` thẳng: tiêu đề này dựng bằng
chữ có chân (Iowan Old Style / Palatino / Georgia) nên nháy thẳng đứng trông như
dấu nhấn máy chữ. `id="bien-tap"`, `#editRail` và toàn bộ luồng dữ liệu
(`editorChoice` trong registry/KV) **giữ nguyên** → không vỡ liên kết `/#bien-tap`,
không phải sửa Worker.

### 8.2 Lật nền sáng ⇄ tối hết khựng

**Đo ra bệnh thật chứ không đoán.** Bản cũ cho **cả `color` lẫn `background-color`
nội suy tuyến tính suốt .35s**. Mà `--txt` và `--bg` của hai chế độ gần như **đổi
chỗ cho nhau** (mực `#191410` trên giấy `#faf8f4` ⇄ giấy `#f2ebe0` trên mực
`#14110e`), nên đúng **giữa chặng** hai màu gặp nhau ở cùng một xám:

| đã đi được | nền | chữ | tương phản chữ/nền |
|---|---|---|---|
| 0 % | `(250,248,244)` | `(25,20,16)` | **17,2 : 1** |
| 40 % | `(158,156,152)` | `(112,106,99)` | 1,95 : 1 |
| **50 %** | `(135,132,129)` | `(134,128,120)` | **1,05 : 1** ← chữ tan vào nền |
| 60 % | `(112,109,106)` | `(155,149,141)` | 1,73 : 1 |
| 100 % | `(20,17,14)` | `(242,235,224)` | **15,9 : 1** |

Cả trang **mất chữ ~115 ms** rồi mới hiện lại — mắt đọc đúng cái đó là “khựng/đục”,
không phải chuyện thiếu khung hình. Ba lỗi chồng lên nhau, sửa cả ba:

1. **Bỏ hẳn `color` khỏi nhịp đổi nền.** Ngoài khoản tương phản kể trên, `color`
   trên `<body>` là màu **kế thừa** → bắt máy vẽ lại từng dòng chữ mỗi khung hình,
   trong khi đa số phần tử ở đây *tự đặt* `color` nên vốn không phai theo `<body>`
   → trước đó là phai lệch pha (chỗ mờ dần, chỗ giật cứng).
   ```css
   /* CŨ */ body.hpage { transition: background-color .35s linear, color .35s linear; }
   /* MỚI */ body, .hdr, .hero, .hero .foot, .facts, .ftr, .fbox, .sechead, .authcard {
              transition: background-color var(--t-theme) var(--ease-out),
                          border-color  var(--t-theme) var(--ease-out); }
   ```
2. **`.35s linear` → `--t-theme: .16s` với `--ease-out` (`cubic-bezier(.22,1,.36,1)`)**
   — dốc mạnh ngay đầu, nên nền đi được nửa đường chỉ sau **13 % thời gian**. Cửa sổ
   chữ-mờ (tương phản < 3:1) còn **~21 ms ≈ 1 khung hình**, so với **175 ms** của
   `.35s linear` (cùng công thức nội suy, chỉ khác nhịp và đường cong). `.16s` cũng
   đúng tầm `--t-fast` mà hệ thống này vẫn dành cho “đổi màu”.
3. **Phủ không đều** — trước chỉ `body.hpage/.hero/.facts/.fbox` chuyển tiếp, nên
   trang chủ thì mờ dần còn trang truyện/quản trị thì giật cứng. Nay gộp đúng các mặt
   phẳng lớn vào **một** luật, mọi trang như nhau. Danh sách cố ý ngắn: thêm phần tử
   là thêm việc cho máy yếu.

**Trang đọc** theo đúng nguyên tắc ấy (không phải ngoại lệ như bản nháp trước):
`body.reading`, `.rdbar`, `.rdprog`, cột chữ `.rdhead/.rtext/.ract/.rend/.rnav` và
ngăn kéo cài đặt đều về `--t-theme` + `--ease-out` (trước là `.35s linear` /
`.32s linear` và có giữ `color`). Cột chữ dài cả màn hình nên bỏ `color` ở đây là
chỗ giảm tải rõ nhất trên điện thoại.

**Núm công tắc:** trượt `.26s → .22s` (vật thể thật, về đích sau cú lật nền một
chút cho có đà), màu nền/viền theo `--t-theme`. Vẫn là transform — không đụng các
chữ ký mà `tests/t_mobile.js` khoá. `prefers-reduced-motion` vẫn `transition: none
!important` cho toàn bộ.

**Vẫn không dùng View Transitions** — đúng quyết định cũ ghi trong `themeToggle()`:
API đó phải chụp lại toàn trang rồi blend, trễ rõ trên điện thoại và trong trang đọc.

### 8.3 `meta[name=theme-color]` — lỗi thật, không phải thẩm mỹ

```js
/* src/cz-app.js — gọi từ themeInit(), themeToggle(); src/cz-story.js gọi cuối applyRD() */
function themeMeta() { … m.setAttribute('content', bg) }
```

Trước đây thẻ này cứng `#faf8f4`: lật sang nền tối thì **thanh địa chỉ điện thoại
vẫn trắng** — một mảng sáng nằm trên trang tối, đúng lúc đang chuyển cảnh, nên cảm
giác “lệch pha” càng rõ. Nay đọc thẳng token (`--bg`, hoặc `--rd-bg` khi đang trong
trang đọc) để lấy màu **đích** ngay frame đầu, không phải giá trị đang dở chuyển tiếp.

Gọi ở bốn chỗ, đủ mọi đường vào/ra: `themeInit()` (tải trang), `themeToggle()`
(nút bấm), cuối `applyRD()` trong `src/cz-story.js` (vào trang đọc / đổi nền đọc),
và `exitReader()` (thoát trang đọc thì trả thanh trình duyệt về màu nền của trang,
không giữ lại màu giấy vừa đọc). `admin.html` không có thẻ này → hàm thoát sớm,
không lỗi; `404.html` không nạp JS.

### 8.4 Đã rà

```
npm run build · npm test            → 15/15 bài đạt
node tools/check_html.js            → HTML sạch, 28 luật _redirects không vòng lặp
node tools/check_calls.js           → không có hàm “ma”
python3 tools/check_css.py          → 0 lớp dùng mà CSS chưa định nghĩa
jsdom (trang chủ, dữ liệu thật /data):
  #bien-tap hiện, h2 = “ssochuz’s choices”, 6 thẻ
  header đủ: logo · 4 mục · #czInk · Tìm · công tắc · tài khoản · menu (7 mục)
  light → dark → light đúng MỘT nhịp mỗi lần, meta #faf8f4 ↔ #14110e, có ghi localStorage
  0 lỗi JS
jsdom (trang truyện → vào chương 2 → thoát):
  body.reading bật/tắt đúng, data-rd = kem, meta theo kịp, 0 lỗi JS
  (jsdom không tính được custom property nên --rd-bg rơi về màu dự phòng —
   trình duyệt thật sẽ lấy đúng màu giấy đọc)
CSS sau khi dựng: không còn luật nào cho `color` phai theo nhịp đổi nền,
  trừ núm công tắc .tsw-icon (22px, cố ý)
```

---

## 9. Bổ sung 2026-09-15 (lần 3)

Bốn việc: (1) thẻ truyện đề nhầm couple thay vì tác giả, (2) mô tả truyện bị mất
chữ + cần nút “Hiện thêm”, (3) khối thương hiệu “ssochuz library”, (4) rà lỗi.

### 9.1 Dòng dưới tên truyện là TÁC GIẢ, không phải couple

Bản cũ ưu tiên `couple` ở ba chỗ, nên **25/62 bộ** (số bộ có couple) bị đề tên cặp
đôi thay vì người viết — và vì `card()` là hàm vẽ thẻ dùng chung, lỗi này nhân ra
khắp trang chủ: dải “Mới cập nhật”, “ssochuz’s choices”, “My Space”, lưới Thư viện.

| Tệp · chỗ | Cũ | Mới |
|---|---|---|
| `src/cz-app.js` · `card()` dòng `.cb` | `n.couple ? couple : author` | `n.author \|\| n.couple \|\| ''` |
| `src/cz-app.js` · `cardList()` (xem dạng danh sách) | `[couple, (biểu thức rối), year]` | `[author, couple, year]` |
| `src/cz-home.js` · `renderRank()` dòng `.tt` | `n.couple \|\| n.author` | `n.author \|\| n.couple` |

Những chỗ **đã đúng sẵn**, không đụng: `.meta` của hero (hiện cả hai, có icon bút
= tác giả, icon người = couple), `.pcap` dưới bìa, kết quả tìm nhanh ⌘K, hero trang
truyện, danh sách truyện cùng tác giả/couple. Couple không mất đi — nó vẫn ở bộ lọc
`#fCouple`, ở hero và trong bảng thông tin của trang truyện.

> Lưu ý khi đối chiếu: “Salmonlover” trong registry hiện ra thành “SalmonLover” là
> do `authorFix()` cố tình sửa cách viết hoa tên tác giả đó, không phải lỗi.

### 9.2 Mô tả truyện: lấy lại 80% chữ đã mất + nút “Hiện thêm”

**Hai lỗi chồng nhau.**

**(a) Đường dữ liệu vứt chữ.** `tools/sync_blogger.py` chỉ làm một việc:

```python
new['syn'] = s[:300].rstrip() + '…'      # CŨ — cắt cứng, không giữ bản đầy đủ
```

Đo xong trên chính dữ liệu trong `_inbox/feed/pages_…json`:

| | số ký tự |
|---|---|
| tổng mô tả thật có trên blog | **56.480** |
| tổng mô tả còn lại trong `registry.json` | 11.424 |
| bộ bị mất chữ | **61/62** |
| độ dài mô tả đầy đủ: ngắn nhất / trung vị / dài nhất | 41 / 843 / 3.306 ký tự |

Tức **~80% nội dung giới thiệu bị bỏ**, và câu thì đứt ngang giữa một từ
(“…vô cùng ăn ý khi thưởng thức cùng…”).

**(b) Giao diện giấu luôn phần còn lại.** `.synwrap.clamp { grid-template-rows: 0fr }`
gấp **cả khối mô tả** về 0, nên bộ nào mô tả quá 260 ký tự thì trang truyện
**không hiện một chữ nào** — chỉ còn trơ nút “Xem thêm”. Đây chính là “mô tả đang
bị thiếu” nhìn thấy bằng mắt.

**Đã sửa.**

1. `syn_full_from_page()` — lấy mô tả **đầy đủ**, giữ ranh giới đoạn (`\n\n`), cắt
   đúng trước danh sách chương, lọc dòng rác (`📚 DANH SÁCH CHƯƠNG`, “Tình trạng:”,
   “Chương 12”…). Chỉ lột emoji/dấu đầu dòng, cố ý **không** lột dải `\u2000-\u206f`
   vì dải đó chứa cả `‘ ’ “ ” —` mà mô tả ở đây mở đoạn bằng ngoặc kép rất nhiều.
2. `syn_teaser()` — bản rút gọn cho thẻ/trang chủ/meta: khép ở dấu câu, không khép
   được thì mới cắt ở khoảng trắng. Đã viết lại **58/62** teaser.
3. **Mô tả đầy đủ nằm trong `data/book/<slug>.json`, không nằm trong registry.**
   Registry là mục lục mà *mọi* trang phải tải: nhét 54 KB chữ vào đó là bắt trang
   chủ tải **12,9 KB → 34,1 KB gzip (2,6 lần)**. Tệp chương vốn đã được tải khi mở
   truyện (27,2 MB cho 62 bộ) nên +56 KB chỉ là **0,2%**. `synFull` được chèn ngay
   sau `couple`, trước mảng `chapters`, để trường nhỏ không bị đẩy xuống cuối tệp.
4. `src/cz-story.js` — gộp `synFull` từ tệp chương vào `N` (bản sửa trong trang quản
   trị nằm ở registry nên được ưu tiên), tách đoạn và dựng mỗi đoạn một `<p class="syn">`.
5. Nút đổi thành **“Hiện thêm” / “Thu gọn”**, `aria-controls="synIn"`, `aria-expanded`
   đúng trạng thái. Phần hé ra là **5 dòng** (`max-height: 8.5em` = 5 × line-height
   1.7) và **nhạt dần ở cuối** để biết là còn chữ, không phải chữ bị cắt cụt.
6. Chiều cao khi bung do **JS đo thật rồi ghi inline** (`scrollHeight`), mở xong thì
   thả về `none` để đổi cỡ cửa sổ không cắt chữ. Để một con số `max-height` cố định
   thì hoặc cắt mất chữ của bộ dài nhất (3.306 ký tự ≈ 40 dòng), hoặc nhịp bung chạy
   hụt hơi vì phải nội suy qua cả khúc không nhìn thấy.
7. Đo thật: nội dung lọt trọn trong 5 dòng thì **bỏ kẹp và bỏ luôn nút** — màn hình
   rộng không bị thừa một nút vô nghĩa.
8. Tab “Giới thiệu” (`#synFull`) dựng mỗi đoạn một `<p>` (bỏ `white-space: pre-line`).
9. Hero **trang chủ** đổi sang dùng bản rút gọn `n.syn` — không đổ 3.300 ký tự lên
   trang chủ chỉ để CSS cắt còn 3 dòng.
10. `save()` trong tool đổi sang `indent=2` + xuống dòng cuối tệp, đúng dạng
    `data/registry.json` đang nằm trong kho (trước là `indent=1`: chạy sync một lần
    là xới lại cả tệp). `rev` nâng `2026-09-13a → 2026-09-15a` để máy khách bỏ bộ
    nhớ đệm cũ.

**Kết quả đo được** (jsdom, bộ `love-bound`): trước 190 ký tự một đoạn → nay
**2.005 ký tự / 13 đoạn**; bấm “Hiện thêm” → `open`, `aria-expanded="true"`, nhãn
“Thu gọn”, `max-height` 908px rồi thả về `none`; bấm lần nữa → gấp lại, nhãn về
“Hiện thêm”. Tab Giới thiệu đủ 13 đoạn, đoạn cuối trọn câu. `meta[name=description]`
là teaser khép đúng dấu chấm.

### 9.3 Khối thương hiệu “ssochuz library”

**Vì sao trông như AI slop:** một câu lót không chứa thông tin gì
(“Cảm ơn bạn đã ủng hộ và đồng hành cùng ssochuz library!”), ba liên kết, tất cả dồn
vào cột trái của khung rộng 1.180px → bỏ trống gần 70% bề ngang; logo lặp lại lần thứ
hai ở cỡ 26px (to hơn cả trên đầu trang); và một hình thoi nảy lò xo mỗi lần trỏ chuột.

**Chân trang nay xếp như trang ghi công (colophon) của một tờ báo:**

- lưới ba cột `1.7fr / 1fr / 1fr`, khoảng cách rơi đúng lưới 4/8px (`gap: 40px 32px`);
- cột thương hiệu: logo + **một câu nói thật về trang** (“Thư viện truyện chọn lọc —
  đọc ngay trong máy, giữ tiến độ từng chương, lọc theo năm, tác giả, couple và theo
  dõi lịch ra chương.”) thay cho câu cảm ơn;
- cột **Mục**: 5 đường dẫn trong trang có thật (`/`, `#moi-cap-nhat`, `#bxh`, `#lich`,
  `#thu-vien`) — trước đây chân trang không dẫn đi đâu trong trang;
- cột **Kết nối**: Hướng dẫn sử dụng, Facebook, Khảo sát truyện, Báo lỗi chữ
  (`/guide#bao-loi` — anchor có thật trong `guide.html`);
- dòng cuối tách bằng một đường kẻ tóc: `© 2026 ssochuz library` (năm lấy động) và
  `Truyện và bản dịch thuộc về tác giả tương ứng.`;
- nhãn cột dùng đúng kiểu chữ nhãn cả trang đang dùng (10,5px / 800 / .14em / in hoa),
  liên kết chỉ gạch chân 1px khi trỏ — không ô bo tròn, không nền chênh, không icon
  trang trí;
- xuống 860px thành hai cột (thương hiệu chiếm trọn hàng), xuống 520px thành một cột.

**Logo (cả đầu trang lẫn chân trang):**

- `library` thôi không còn là chữ nghiêng màu mực son — nay là dòng chữ nhỏ giãn
  khoảng cách (10,5px / 800 / .14em / in hoa, mực nhạt) nằm **chung đường chân chữ**
  với `ssochuz`, đúng kiểu manchette báo và khớp với `.eyebrow` / `.sgrp h5` sẵn có;
  căn giữa như trước làm dòng chữ nhỏ trôi lửng lơ giữa thân chữ lớn.
- “dấu son” giữ khối vuông nhưng **bỏ xoay 45° và bỏ lò xo**: 7px, viền 1px màu mực
  son, lòng trong suốt, chỉ đậm mực lên khi trỏ theo nhịp `--t-fast` — cùng nhịp với
  mọi tương tác nhỏ khác trên trang.
- Giữ nguyên `<span class="dot">` trong markup vì `admin.html` cũng dùng lớp này.

### 9.4 Hai cái bẫy tìm thấy thêm khi rà

**(a) Trang quản trị sẽ âm thầm xoá mô tả đầy đủ.** Vì mô tả đầy đủ nay nằm trong
tệp chương còn ô nhập ở trang quản trị đọc từ registry, nên lần đầu bấm “Lưu thông
tin” sau khi mở một bộ, form sẽ ghi **đúng bản rút gọn ~190 ký tự** thành `synFull`
trong registry — và vì `src/cz-story.js` ưu tiên bản trong registry, phần mô tả còn
lại biến mất mà không ai hay. Đã chặn:

| Tệp · chỗ | Sửa |
|---|---|
| `src/admin.js` · `openEdit()` | nạp `synFull` từ tệp chương vào ô mô tả ngay khi sách tải xong, **chỉ khi người dùng chưa gõ gì** (`dirty.meta` còn tắt) để không đè chữ |
| `src/admin.js` · lưu thông tin / tạo bộ mới / nhân bản | `slice(0, 220)` → `CZ.teaser(…, 220)` (khép ở dấu câu, không xé đôi một từ) |
| `src/admin.js` · nhân bản | bản sao mang theo `synFull` sang cả tệp chương mới — trước đây chỉ copy `chapters`, bản sao sẽ mất mô tả |
| `src/cz-app.js` | thêm `CZ.teaser(text, limit)`, cùng luật với `syn_teaser()` của tool sync |

Đo lại bằng Worker giả: mở bộ `third-person` → ô mô tả **575/575** ký tự (trước khi
sửa chỉ có ~190), bấm Lưu → `synFull` vẫn **575**, bản rút gọn **216** ký tự.

**(b) `tests/cf_admin_test.js` kiểm thử nhầm ô.** Mục “sửa thông tin bộ” gán
`#fStatus` — đó là **bộ lọc ở danh sách**, còn ô tình trạng trong form sửa là
`#edStatus`. Nên suốt thời gian qua mục đó chưa từng kiểm được việc đổi tình trạng
(`out.suaBo.status` luôn trả về giá trị cũ). Đã gán lại đúng ô: nay ra
`status: "Hoàn thành"`. Cùng mục đó giờ kiểm thêm ba điều: ô mô tả có nạp đủ chữ
không, lưu xong có mất chữ không, bản rút gọn có vượt 220 ký tự không — sai là đẩy
vào `errors`, và `tests/run.js` sẽ chấm LỖI.

### 9.5 Đã rà (lần 3)

```
npm run build                        → 546,5 kB → 350,8 kB
node tests/run.js                    → 15/15 ĐẠT
node tools/check_html.js             → HTML sạch, liên kết & biểu tượng đều có thật,
                                       28 luật _redirects không vòng lặp
node tools/check_calls.js            → không có hàm “ma”
python3 tools/check_css.py           → 0 lớp dùng mà CSS chưa định nghĩa
node tools/check_secrets.js          → không lộ secret/email trong tệp gửi xuống trình duyệt
python3 -c ast.parse(sync_blogger)   → cú pháp tool OK

jsdom trang chủ (dữ liệu thật /data):
  chân trang 3 cột · 10 liên kết thật · hết câu “Cảm ơn bạn đã ủng hộ…”
  42/42 thẻ có dòng dưới tên truyện là TÁC GIẢ (kể cả 5 bộ có couple)
  8 dòng “Bình chọn nhiều nhất” là tác giả · 0 lỗi JS
jsdom trang truyện:
  love-bound              → 2.005 ký tự / 13 đoạn (trước: 190 ký tự / 1 đoạn)
                            Hiện thêm ⇄ Thu gọn đúng, aria-expanded đúng,
                            max-height 908px rồi thả về none
  trọng-sinh-…-vượt-kho   → 3.274 ký tự / 17 đoạn, có kẹp + nút “Hiện thêm”
  my-gorgeous-wife (ngắn) → bỏ kẹp và BỎ luôn nút, không thừa một nút vô nghĩa
  tab Giới thiệu          → đủ 13 đoạn, đoạn cuối trọn câu
  meta[name=description]  → teaser khép đúng dấu chấm
jsdom trang quản trị (Worker giả):
  ô mô tả 575/575 ký tự · lưu xong vẫn 575 · bản rút gọn 216 · nhân bản ra 1 bộ
  có chương · status đổi được thành “Hoàn thành” · 0 lỗi JS
jsdom guide.html: chân trang + logo hiện đúng, 0 lỗi JS
```

---

## 10. Bổ sung 2026-09-15 (lần 4) — độ mượt của animation toàn trang

Yêu cầu: *“cải thiện độ mượt của animation toàn trang”*. Đây không phải việc thêm
hiệu ứng mới mà là **dọn những hiệu ứng đang chạy sai tầng**: trình duyệt chỉ chạy
mượt khi animation nằm trên `transform`/`opacity` (luồng compositor, không cần xếp
chỗ lại, không cần vẽ lại). Mọi thứ khác — `width`, `left`, `top`, `gap`,
`filter: blur()`, `backdrop-filter` — đều bắt luồng chính làm việc **ở từng khung
hình**, và đó chính là chỗ khựng.

### 10.1 Ba nhóm thủ phạm tìm thấy khi rà `src/cz.css` + `src/*.js`

**Nhóm 1 — thuộc tính bố cục bị animate theo khung hình (10 khai báo).**
Nặng nhất là ba vạch tiến độ: vạch cuộn trang `#sprog i` (JS ghi `style.width`
*mỗi khung hình khi cuộn*), vạch tự đổi slide `.hero .bar i` (chạy **liên tục
6–7 giây** bằng `transition: width … linear`), và tiến độ đọc `.rdprog i` (ghi
theo sự kiện cuộn, chưa dồn khung). Cộng thêm vạch chuyển trang `#nprog i`,
gạch chân `.nav .ink` / `.storytabs .ink` (animate `width`), con chạy `.tabs > .ink`
(animate cả `left, top, width, height`), vạch trạng thái `.card.list::before`
(`width`), và `gap` của cụm “Đọc tiếp”.

Hệ quả kép: ghi `width` làm bẩn bố cục, nên lần đọc `scrollHeight` ở khung hình
kế tiếp trở thành **đọc cưỡng bức** (layout thrash) ngay trong lúc người dùng
đang cuộn.

**Nhóm 2 — `filter: blur()` bị animate (18 chỗ).**
Blur không phải “thuộc tính rẻ”: trình duyệt phải dựng một buffer ngoài cỡ phần
tử rồi lọc lại từng khung. Mà các phần tử đang bị làm nhoè lại to nhất trang:
hai slide hero lúc đổi bộ (`hIn` blur 4px / `hOut` blur 5px — mỗi slide gần bằng
cả màn hình), **năm khối của trang đọc** `.rdhead/.rtext/.ract/.rend/.rnav`
(blur 2–3px mỗi lần lật chương), ruột nhóm chương `.cgroup > div` (cả lưới
chương), ảnh bìa `imgIn` (mấy chục tấm 300×450 hiện cùng lúc), `.toast`, `iswap`,
`numpop`. Kèm theo là `backdrop-filter: blur(2px)` trên lớp phủ hộp thoại/tấm
trượt/bảng nhảy chương — mờ dần 250ms nghĩa là **lọc lại cả vùng màn hình phía
sau** từng khung hình.

**Nhóm 3 — hai animation vô hạn chạy bằng paint.**
`@keyframes rankBar` cho 8 thanh xếp hạng cùng lớn lên bằng `width` lúc vẽ bảng
(8 animation layout song song ngay thời điểm bận nhất), và `@keyframes scan`
quét `background-position` suốt lúc tải chương — đúng lúc đang dựng nội dung
chương mới. Ngoài ra handler cuộn của trang đọc chạy **mỗi sự kiện cuộn** (có
thể nhiều lần trong một khung hình) chứ không dồn về một khung.

### 10.2 Đã sửa

| Thủ phạm | Cách xử lý |
| --- | --- |
| `#sprog i`, `.hero .bar i`, `.rdprog i`, `#nprog i` | `width: 100%` cố định + `transform: scaleX(0)`, `transform-origin: 0 50%`; JS ghi `scaleX(tỉ lệ)` thay vì `width: %` |
| `.nav .ink`, `.storytabs .ink` | nền `width: 100px`; JS đặt `translateX(offsetLeft) scaleX(offsetWidth / 100)` |
| `.tabs > .ink` | vị trí sang `translate3d(x, y, 0)`; **giữ** `width/height` (khung có viền 1px + bo góc, scale không đều sẽ làm viền méo) |
| `.card.list::before` | dày lên bằng `transform: scaleX(1.5)` |
| `.card.list .cl-go` | bỏ animate `gap`; mũi tên trượt `translateX(6px)` (bù đúng phần gap đã bỏ) |
| `@keyframes rankBar` | `scaleX(0) → scaleX(var(--w))`; `--w` đổi từ `62%` sang tỉ lệ `0.62` |
| `@keyframes scan` | thành khối `::after` rộng 45% trượt `translateX`; giữ nguyên thứ tự vẽ bằng `.rdbar.loading .rdprog i { z-index: 1 }`; đổi 900ms → 1.3s để **tốc độ quét y như cũ** (dải mới đi 166% chiều rộng thay vì 110%) |
| `hIn`, `hOut`, `chapIn`, `imgIn`, `iswap`, `numpop` | bỏ hẳn `filter: blur()`, chỉ còn trượt + mờ |
| `.cgroup > div`, `.toast`, năm khối `#rd` | bỏ `filter` khỏi transition và khỏi trạng thái; `.toast` bỏ luôn `will-change: …, filter` |
| lớp phủ `.modal/.sheet/.jump` | bỏ `backdrop-filter`, nền đậm lên `.5 → .56` và `.45 → .5` |
| handler cuộn trang đọc | bọc `requestAnimationFrame` + khoá `rdTick` (nhả khoá ở **đầu** khung hình nên `return` giữa chừng không kẹt); thêm chặn null cho `#rdProgFill` |
| `.btn` | giữ `filter` trong transition vì đó là `brightness(1.12)` lúc trỏ — phép nhân màu, không dựng buffer như blur |

Token `--mo-blur` không còn ai dùng nên bị bỏ hẳn; “hiến pháp chuyển động” ở đầu
`src/cz.css` được viết lại thành **ba điều cấm** (không animate thuộc tính bố cục
cho thứ chạy lặp; không animate `filter: blur()`; không `backdrop-filter` trên lớp
phủ có transition) để lần sau không ai thêm lại.

### 10.3 Trước / sau (đo trên `src/cz.css`, cùng một bộ tiêu chí)

```
chỉ số                                     TRƯỚC    SAU
khai báo transition chạy compositor           84     88
khai báo transition animate thuộc tính
   bố cục THEO KHUNG HÌNH (width/left/top/gap) 10      3
khai báo transition có `filter`                  6      1   (chỉ .btn brightness)
`filter: blur(` trong tệp                       18      1   (còn lại là nền hero TĨNH)
`backdrop-filter`                                2      0
@keyframes còn animate thuộc tính đắt          8/23   0/23
chỗ JS ghi style.width                          14      2   (còn lại: gợn sóng đặt
chỗ JS ghi style.left / style.top                4      2    theo toạ độ bấm + cỡ
                                                             con chạy tab có viền)
handler cuộn trang đọc                       mỗi sự kiện  1 lần/khung hình (rAF)
```

Ba chỗ `width/height` còn animate đều **một lần mỗi cú bấm** và có lý do giữ:
`.tabs > .ink` (viền 1px sẽ méo nếu scale không đều) và `.hero .dots button`
(chấm 2px lớn lên là để **đẩy** các chấm bên cạnh — scale sẽ đè lên nhau). Cùng
nhóm “một lần, phải giữ luồng” là `max-height` của `.slid`/`.synwrap` và
`grid-template-rows` của `.cgroup`: thứ gấp/mở trong luồng thì không thể thay
bằng transform. `box-shadow` lúc trỏ (14 chỗ) giữ nguyên vì chỉ một phần tử bị
trỏ tại một thời điểm, và `.card .th` đang `overflow: hidden` nên không thể dời
bóng sang pseudo-element bên trong.

### 10.4 Kiểm chứng

```
npm run build                        → 551.0 kB → 350.7 kB, ghi lại đủ 6 tệp gốc
node tests/run.js                    → 15/15 ĐẠT
node tools/check_html.js             → HTML sạch, 28 luật _redirects không vòng lặp
node tools/check_calls.js            → không có hàm “ma”
python3 tools/check_css.py           → 0 lớp dùng mà CSS chưa định nghĩa
node tools/check_secrets.js          → không lộ secret
/smoke_anim.js (67 phép kiểm)        → ĐẠT HẾT
   · tra cz.css + cz-*.js ĐÃ NÉN (esbuild đổi ::before→:before,
     translateX(0)→translate(0), translate3d(0,0,0)→translateZ(0), from/to→0%/100%)
   · 12 @keyframes chỉ còn transform/opacity
   · THỰC THI biểu thức JS với số giả: scaleX ∈ [0,1] cả khi h = 0, cuộn quá đáy,
     y < 0, số lẻ; tiến độ phân trang/theo chương ∈ [0,1] cả khi danh sách rỗng;
     --w = w/100 với w = 100/62/7/1/0
   · gạch chân đúng mẫu số: nền CSS 100px ↔ JS chia 100
cache-buster                         → v=20260915j (20 chỗ / 5 tệp HTML)
```

Không đổi một thẻ HTML nào, không đổi cấu trúc luật CSS nào — chỉ đổi **thuộc
tính được animate** và chỗ JS ghi giá trị của chúng.
