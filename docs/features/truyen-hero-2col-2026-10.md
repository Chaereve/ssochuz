# Trang truyện · dựng lại hero thành hai cột (2026-10)

Bản dựng lại **có chủ đích** phần đầu trang truyện, xuất phát từ một vòng Impeccable
review (`critique` + `audit` + detector `impeccable detect`). Không đổi brand:
vẫn nền than ấm `--bg`, mực son `--acc`, chữ `--txt`.

## Vì sao

| Lỗi tìm được | Bằng chứng |
|---|---|
| Chữ nằm trên ảnh bìa, contrast 1.5:1 | veil `rgba(10,7,5,.28)` ở mép phải + `rgba(255,255,255,.62)` = **1.54:1**, `syn` 72% = **1.64:1** — fail WCAG 1.4.3 |
| Focus ring 2.12:1 | `--ring: rgba(224,133,155,.4)` trên `--bg` |
| 6 cấp chữ gần nhau | 11 / 11.5 / 12 / 12.5 / 13 / 13.5 px trong cùng một thẻ |
| Hiệu ứng chồng tầng | `blur(26px)` + scrim + hover lift + 4 tầng shadow |
| Mobile 4 hàng nút | nút chính → 2 nút → 1 nút → cụm icon |
| Tóm tắt bị mask làm mờ | `max-height: 3.4em` nhưng mask fade vẫn 58% → dòng 2 mờ nửa chừng |

## Đã làm

**Markup** (`src/cz-story.js` → `renderStory()`)

```
.in  (grid 260px | 1fr, gap 32)
├── .cvCol   .cover > img + .b18 + .lock-cover + .nw-bookmark
│            .cvSt  (tình trạng: chấm màu + chữ 13px, NẰM DƯỚI ảnh)
└── .txtC    h1 → .meta (15px) → .metaSub (13px) → tóm tắt 3 dòng
             → .prog → .btn-row (CTA chính · Theo dõi · ⋯) → .editable-rating
```

- Không còn `hBg` / `hVeil` / `cvGrad`: **không một chữ nào nằm trên ảnh**.
- Việc phụ (Chương mới nhất · Tủ truyện · Chia sẻ · RSS · Đặt lại xác nhận 18+) vào menu
  `details.amore` — vẫn đủ chức năng, không chiếm chỗ của CTA.
- Thêm icon `dots` (ba chấm) vào bộ icon dùng chung, không nhập thư viện mới.

**CSS** (`src/cz.css`)

| | Trước | Sau |
|---|---|---|
| Bìa | 172px, hover lift + scale + 2 shadow | **260px** (220 / 180 / ≤620: `min(2/3·36svh,100%)`), radius 10, **1 shadow**, không hover |
| Khối chữ | chữ trắng trên ảnh | **`--surf2`, padding 24, radius 10**, không gradient |
| Thang chữ | 6 bậc 11–13.5 | **4 bậc: 32 / 15 / 13 / 11** |
| Title | serif hệ thống | **Fraunces 32px/700, −.01em, clamp 3 dòng** |
| Tình trạng | mono IN HOA + glow trên bìa | 13px thường, chấm `--ok/--warn/--acc`, **không glow** |
| Tiến độ | mono IN HOA 10px + % | “Đã đọc 13/25 chương · 52%” 13px + thanh 2px |
| Tóm tắt | mask fade | `-webkit-line-clamp: 3`, **không mask** |
| Focus ring | `rgba(acc,.4)` | **`--ring: #e0859b`** + khe nền 2px → 6.14:1 trên thẻ |
| Mobile | 4 hàng nút | **CTA 48px full-width + Theo dõi + ⋯** |
| Rộng 800 | trang cuộn ngang 1076px | `.storylab` cột `minmax(0,1fr)`; `.rx-row` tự cuộn trong thẻ |

## Đo lại (Chromium, dev server 8081)

| | 1216×1000 | 390×844 |
|---|---|---|
| Bìa | 260×390 | 225×338 (giữ 2:3, không crop) |
| Khối chữ | 740×392 | 343×453 |
| CTA chính | y=373, 40px | **y=724, 48px — trong màn 844px** |
| Tràn ngang | không | `scrollWidth 375 < 390` |
| Đáy hero | 556px | 925px |

Tiêu đề dài thử bằng `ngot-ngao-la-may-bay-ang-cay-moi-la-tinh`: h1 giữ 2 dòng, CTA vẫn ở y=728.

## Ghi chú kỹ thuật

- `.lg` của bản cũ vẫn còn rule trong `@media (max-width: 430px)` với specificity cao hơn,
  nên CTA mobile phải khai báo lại kèm `.lg` mới đúng 48px / 15px.
- `.rreact .rx-row` được chặn tràn ngang ở ≤620px (lỗi có sẵn, hàng sticker từng đẩy cả trang
  cuộn ngang 1003px).
- `h4` trong 2 sheet “Mục lục” / “Cài đặt đọc” đổi thành `h2` để hết nhảy bậc heading.
- `cz.css` 214.1 / 215 kB (219 289 byte) — vẫn **giảm** so với 219 653 byte của bản trước
  dù thêm rule hero/focus, nhờ xoá veil, mask, blur, hover và ba tầng shadow.
