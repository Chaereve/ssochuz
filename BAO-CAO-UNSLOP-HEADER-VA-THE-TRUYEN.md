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
  Bình chọn nhiều nhất → Biên tập viên chọn → Lịch ra chương → Thư viện.
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
