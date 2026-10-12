# Lịch sử blueprint — 1.19.0: Bộ tương tác & trải nghiệm đọc

> **Cập nhật 1.20.0 (2026-10-12):** blueprint dưới đây ghi trạng thái thiết kế/client-only ở bản 1.19.0, không còn là mô tả trạng thái hiện tại. Repo đã chuyển reaction/gạch sang Cloudflare D1, dữ liệu follow/progress sang Supabase RLS, và picker sticker gắn vào comments hiện có. Hướng dẫn/schema/endpoints hiện hành: [`personal-community-1.20.md`](personal-community-1.20.md) và [`worker/README.md`](../../worker/README.md). Migration cloud chưa được áp dụng/deploy trong workspace này.

- Trạng thái lịch sử tại bản 1.19.0: client-only; endpoint máy chủ mới ở mức đề xuất trong §7.
- Phiên bản của blueprint: **1.19.0** (không phải phiên bản app hiện hành).
- Tệp khi thiết kế: `src/cz-react.js`, `src/cz-brick.js`, `src/cz-dice.js`, `src/cz-app.js`, `src/cz-story.js`, `src/cz.css`, `truyen.html`, `index.html`, sticker assets, `cz-config.js`, `sw.js`, tests.

## 0. Sáu tính năng trong một bản

| # | Tính năng | Chỗ dùng | Nhớ ở đâu |
| --- | --- | --- | --- |
| 1 | Reaction sticker cuối chương | cuối chương đọc (`#rdReact`) + trang truyện (`#storyReact`) | `ssochuz-react-*` (localStorage) |
| 2 | Ẩn nhanh “Sếp tới” | nút trên thanh đầu trang (mọi trang) | không nhớ (chủ ý) |
| 3 | Zen | nút `#rdZen` / phím `Z` | `ssochuz-reader.zen` |
| 4 | Bionic | Cài đặt đọc | `ssochuz-reader.bionic` |
| 5 | Vòng quay “Hôm nay đọc gì?” | `[data-dice]` ở trang chủ, trang truyện, thanh đọc, Cài đặt đọc | `ssochuz-dice-opt`, `ssochuz-dice-last` |
| 6 | Hộp góp gạch “Đòi nợ tác giả” | trang chi tiết truyện đang cập nhật (`#storyBrick`) | `ssochuz-brick-<slug>` |
| (tắt được từng thứ) | công tắc `react · bionic · term · zen · brick · sfx` trong Cài đặt đọc | `ssochuz-reader` |
| + | Terminal / Hacker CLI | nút `#rdTerm` / phím `T` | `ssochuz-reader.term` |
| + | Âm thanh hiệu ứng | dùng chung cho sticker / gạch / vòng quay | `ssochuz-reader.sfx` |

Mọi công tắc đọc đều nằm trong **Cài đặt đọc** (`#setSheet`, nhóm “Tương tác & kiểu đọc”): `react`, `bionic`, `term`, `zen`, `brick`, `sfx`. Nút “Về mặc định” (`#setReset`) trả về `react:1, bionic:0, zen:0, term:0, brick:1, sfx:1` — trùng đúng `RD_DEF` trong `src/cz-app.js`. Tắt một công tắc là ăn **ngay** trong lượt đó (hộp gạch và hàng sticker nằm ngoài `#rdText` nên được đồng bộ riêng, không phải tải lại trang).

## 1. Reaction sticker cuối chương

**Vì sao:** nút Thích cũ chỉ là một icon tim, không nói được người đọc đang nghĩ gì. Sáu sticker Việt hoá thay cảm giác đó, bấm là sticker bay lên như reaction livestream.

**Năm mảnh tách rời** (một tệp `src/cz-react.js`, chia khối rõ ràng):

| Mảnh | Việc |
| --- | --- |
| `reactionConfig` (`REACTIONS`) | danh sách sticker — **chỉ sửa ở đây** |
| `useReactions` (nhóm hàm đếm/`toggle`/`pull`/`qPush`) | kho dữ liệu, chống spam, hàng chờ đồng bộ |
| `ReactionSticker` | một nút: ảnh + số + tooltip + trạng thái đã thả |
| `ReactionBar` | hàng sticker + nút “Xem tất cả reaction” |
| `ReactionPopover` | bảng đầy đủ (mở bằng `CZ.modal` → có sẵn Esc/scrim/focus) |
| `ReactionAnimationLayer` | lớp `.czfx` cố định, mỗi sticker bay là một `<span>` tự dọn |

**Sáu sticker mặc định:** `mu-bao-hiem` (Đội mũ bảo hiểm gấp · 🪖), `ngot-lim` (Tiểu đường rồi · 🧁), `gach-da` (Gửi gạch đá cho tác giả · 🧱), `cham-kem` (Chầm kẽm · 😭), `cay-nhu-trau` (Cày như trâu · 🐂), `xin-chuong` (Cho xin chương nữa · 🙏).

**Thêm / đổi sticker:** 1) thả ảnh vào `assets/stickers/<id>.webp` (128 px là đủ; `python3 tools/make_stickers.py` tải lại từ Fluent Emoji, ghi nguồn vào `assets/stickers/CREDITS.txt`), 2) thêm một mục vào `REACTIONS` với đủ trường `id, label, short_label, asset_light, asset_dark, fallback_emoji, animation_type, color, max_particles`, 3) xong — không phải sửa component nào. Ảnh lỗi/trình duyệt chặn thì tự rơi về `fallback_emoji`.

**Chi tiết đã làm theo yêu cầu**

- Ảnh WebP 128 px (`loading="lazy" decoding="async"`), **không** lấy emoji Unicode làm asset chính; emoji chỉ là lớp dự phòng.
- Kích thước 48 px desktop / 44 px mobile (vùng bấm ≥ 44 px), bóng nhẹ, hover nhấc + scale trong khoảng 1.05–1.1 kèm nhãn, đã thả = viền màu + dấu ✓ + số đếm.
- Bấm: sticker chính 0.9 → 1.1 → 1, 5–12 sticker nhỏ bay lên với lệch/rotation ngẫu nhiên, mờ dần rồi tự xoá DOM; số nhảy ngay và có “pop”; lần đầu thả có toast.
- Chỉ dùng `transform`/`opacity`; `prefers-reduced-motion` thì **không dựng hạt bay** (số vẫn cộng); không chặn cuộn.
- Chống spam theo thiết bị: cooldown 420 ms mỗi sticker, trần 30 lượt/phút, hàng chờ đồng bộ tối đa 60 mục (`CZReact._cfg` công khai để test đọc).
- Mỗi người 1 lượt/loại/**chương**; phiếu theo chương (`{"3": ["gach-da"]}`), đổi chương là phiếu khác.
- Phiếu “tôi đã thả gì” thuộc về **người, không phải máy**: đã đăng nhập (`CZ_AUTH`) thì khoá `ssochuz-react-me-<slug>__u<uid>` (đổi máy vẫn còn phiếu, hai người chung máy không thấy phiếu của nhau); chưa đăng nhập thì `…__d<mã máy>` (`CZ.vid()`). Số đếm vẫn theo máy vì đó là phần đóng góp của máy này.
- Mỗi sticker là một `<button>` thật: `aria-label` (“Đội mũ bảo hiểm gấp — 35 lượt”), `aria-pressed`, focus nhìn thấy được, Enter/Space chạy (listener bàn phím dùng chung một chỗ).
- Nút “Xem tất cả reaction” mở bảng đầy đủ khi hàng sticker bị chật (mobile cuộn ngang).

**Không đổi:** bình luận, đánh giá sao, nút lưu tủ truyện… vẫn nguyên.

## 2. Ẩn nhanh “Sếp tới / Bố mẹ gõ cửa”

- Nút `#czPanic` trên thanh đầu trang (mọi trang, kể cả trang chủ) + **Esc hai lần trong 500 ms** + **Ctrl+Shift+H**.
- Lớp `#czPanicLayer` giả Google Docs: tiêu đề tab “Ghi chú ôn tập HK2 — Google Tài liệu”, favicon SVG inline, thanh địa chỉ đổi về `/` (`history.replaceState`), nút “Thoát” + kbd Esc.
- Trong lúc ẩn: `document.title`/favicon đổi, thanh đọc ẩn, `CZ.setProgress` không ghi gì, phím tắt đọc (←/→/Space…) bị nuốt.
- Thoát: Esc, nút “Thoát”, Ctrl+Shift+H, hoặc Back (`popstate`) — trả lại tiêu đề, favicon, đường dẫn, vị trí cuộn.
- Chủ ý **không** ghi trạng thái ẩn vào localStorage (F5 là về bình thường).

## 3. Zen

- Nút `#rdZen` (icon `yoga`) trên thanh đọc, phím `Z`.
- `<body class="rd-zen">` → CSS ẩn thanh đọc, breadcrumb, điều hướng chương, chân trang; chỉ còn nội dung + vài nút thiết yếu; thanh công cụ tự hiện khi di chuột/chạm rồi tự ẩn tiếp (không nhảy bố cục trên mobile vì dùng chồng lớp cố định).
- Nhớ trong `ssochuz-reader.zen`; nút có `aria-pressed`.

## 4. Bionic

- Công tắc trong Cài đặt đọc; phần bọc chữ chạy **sau khi** chương đã vẽ (`applyBionic()` gọi từ `paintChapter`).
- In đậm 1–3 ký tự đầu mỗi từ bằng `<b class="bio">`: từ ≤ 3 ký tự đậm 1, ≤ 8 đậm 2, còn lại 3.
- **Không đổi chữ gốc:** không chuẩn hoá NFC, không `slice()` giữa cụm dấu; từ được nhận diện gồm cả dấu kết hợp (`\p{M}`) nên tiếng Việt ở dạng NFD vẫn nguyên điểm mã (`tests/t_readtools.js` khoá điều này).
- Bỏ qua `<pre>`, `<code>`, `h1`–`h4`, `script`, `textarea` (in đậm nửa từ ở đó chỉ làm chữ xấu đi). Tắt là gỡ sạch thẻ đã bọc, trả lại đúng chuỗi cũ.

## 5. Vòng quay “Hôm nay đọc gì?”

- Nút sinh tự động cho **mọi** phần tử `[data-dice]`: thanh đầu trang chủ, trang chi tiết truyện, thanh đọc (`#rdDice`), và mục trong Cài đặt đọc (`#setDice`).
- Nguồn truyện theo thứ tự ưu tiên: **đang theo dõi** → **mới cập nhật** → **cả thư viện**; chỉ lấy truyện đọc được (`canRead`, không khoá mật mã) từ `CZ.lib()` — không có dữ liệu truyện nào viết cứng trong tệp này.
- Bộ lọc: tình trạng (đang cập nhật / hoàn thành — luôn còn ít nhất một), “Gồm 18+” (mặc định bỏ qua 18+), thể loại (chip tự ẩn khi registry chưa có `genre` — hiện chỉ 9/67 bộ có).
- Bỏ truyện vừa đọc trong 14 ngày (`CZ.lastReadAt`) **nếu vẫn còn ≥ 4 lựa chọn**; không lặp kết quả vừa quay khi còn phương án khác.
- Vòng quay tối đa 10 lát, quay 2,6 s bằng `transform` trên `conic-gradient`; `prefers-reduced-motion` thì chốt kết quả ngay.
- Kết quả: bìa + tên + tác giả/couple + tình trạng + “Đọc ngay” (đúng chương đang đọc dở nếu có) + “Trang truyện” + “Quay lại”; chương mới nhất lấy từ `CZ.toc()` **sau** khi có kết quả (1 request, không tải trước).
- Trạng thái “Đang quay…” nằm ở vùng `role="status"`; đang quay thì nút bị khoá.

## 6. Hộp góp gạch “Đòi nợ tác giả”

- Chỉ hiện với truyện **đang cập nhật** (`statusCls === 'run'`, chưa khoá mật mã); truyện đã hoàn thành thì khối bị ẩn và để trống.
- Tắt được bằng công tắc **Hộp góp gạch** trong Cài đặt đọc (khoá `brick`, mặc định bật).
- Nút “Gửi gạch giục chương mới”: viên gạch rơi vào xô (`bkDrop`), đống gạch nhún (`bkPile`), số đếm nhảy, tiếng “cạch” (`CZ.sfx('brick')` — **chỉ sau cú bấm**), toast xác nhận.
- Tiến độ: `… / 5.000 viên gạch` + thanh `role="progressbar"` có `aria-valuemin/max/now`; khẩu hiệu “Đã gom đủ 5.000 viên gạch xây nhà cho nhóm dịch/tác giả.”
- Đủ mốc thì đổi câu **“Nhà đã xây xong — giờ đòi chương mới!”** và tự mở mốc kế tiếp (5.000 → 10.000 → …).
- Chống spam: 6 s giữa hai viên, tối đa 20 viên/ngày/máy; chạm trần thì chặn kèm lời nhắn.
- Số tổng khi **chưa** có máy chủ là con số minh hoạ ổn định theo slug (900–3.900) + phần của máy này — nói thật với người đọc bằng câu “lưu trên máy bạn”. Cắm `CZ_BRICK_API` là phần minh hoạ biến mất, số lấy từ máy chủ.

## 7. Terminal / Hacker CLI

- Công tắc trong Cài đặt đọc / nút `#rdTerm` / phím `T`. `<body class="rd-term">` + `#rdText.term`, nền tối, chữ monospace, dòng đầu `user@ssochuz:~/truyen/<slug>$ curl -s https://<host>/truyen/<slug>/chuong-<n>`, dòng meta có giờ và số chương, dòng kết `process exited with code 0 — chapter complete` + con trỏ nhấp nháy.
- Lời dẫn là log hệ thống, câu thoại (mở đầu bằng `“`, `"`, `'` hoặc gạch đầu dòng) được tô như output (`.t-out`).
- **Chỉ là giao diện:** không có ô nhập lệnh, không `eval`, không `child_process`, không gõ từng ký tự cho cả chương — `tests/t_readtools.js` khoá cả ba điều này.
- Nút “Thoát terminal” rõ ràng; nhớ trong `ssochuz-reader.term`.

## 8. Nối máy chủ sau này (TODO(API))

Hai cổng đã có sẵn trong `cz-config.js` (mặc định **rỗng** = chạy hoàn toàn trong máy):

```js
window.CZ_REACT_API = '';   // ví dụ: 'https://<worker>/api/react'
window.CZ_BRICK_API = '';   // ví dụ: 'https://<worker>/api/brick'
```

Điền URL là client tự đổi hành vi (`CZ.hasAPI` phải bật, tức đã có Worker trong `CZ_API`): bỏ số minh hoạ, lấy số thật, gửi lên máy chủ, mất mạng thì xếp hàng và báo “Chưa đồng bộ được lượt thả — đã lưu trên máy bạn.”

### Hợp đồng API (chưa làm ở Worker)

```text
GET  /api/react?slug=<slug>&ch=<n>&vid=<mã máy>[&uid=<id người dùng>]
  → { ok:true, slug, chapter_id, counts:{ "<reaction_id>": <số> }, mine:["mu-bao-hiem", …],
      next_at?: <ISO>, eta?: <ISO> }

POST /api/react    { reaction_id, reaction_type, story_id, chapter_id, on:0|1, count:1,
                     user_id, device_id, created_at }
  → { ok:true, counts:{…}, mine:[…], next_at?: <ISO> }

GET  /api/brick?slug=<slug>&vid=<mã máy>
  → { ok:true, slug, count:<tổng cả nhà>, mine:<viên của máy này>, goal:<mốc đang gom>, at:<ISO> }

POST /api/brick    { story_id, brick_count:1, user_or_device_id, last_brick_at }
  → { ok:true, count, mine, goal, next_at:<ISO> }
```

### Lược đồ dữ liệu đề xuất (chưa tạo)

Hai bảng/namespace, đều khoá theo truyện + chương + người gửi để chống spam ở phía máy chủ (client không bao giờ được là nơi chống spam duy nhất):

```sql
-- reaction: mỗi lượt thả là MỘT dòng, không đếm dồn trong một ô
CREATE TABLE reaction (
  reaction_id   TEXT NOT NULL,      -- 'mu-bao-hiem' | 'ngot-lim' | …
  story_id      TEXT NOT NULL,      -- slug truyện
  chapter_id    INTEGER NOT NULL,   -- số chương
  reaction_type TEXT NOT NULL,      -- = reaction_id (giữ cả hai cho tương lai)
  user_id       TEXT,               -- uid nếu đã đăng nhập
  device_id     TEXT NOT NULL,      -- ssochuz-vid
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reaction_id, story_id, chapter_id, device_id)   -- 1 lượt/loại/chương/máy
);
CREATE INDEX reaction_by_chapter ON reaction (story_id, chapter_id);

-- Đếm nhanh cho hàng sticker (một dòng/số cho mỗi loại + chương)
CREATE TABLE reaction_count (
  story_id   TEXT NOT NULL,
  chapter_id INTEGER NOT NULL,
  reaction_id TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL,
  PRIMARY KEY (story_id, chapter_id, reaction_id)
);

-- gạch: quy tắc 1 viên/người/ngày nằm ở UNIQUE, không nằm ở niềm tin
CREATE TABLE brick (
  story_id            TEXT NOT NULL,
  user_or_device_id   TEXT NOT NULL,
  brick_count         INTEGER NOT NULL DEFAULT 1,
  last_brick_at       TIMESTAMP NOT NULL,
  PRIMARY KEY (story_id, user_or_device_id, DATE(last_brick_at))   -- 1 viên/ngày/máy
);

CREATE TABLE brick_count (
  story_id     TEXT PRIMARY KEY,
  brick_count  INTEGER NOT NULL DEFAULT 0,
  goal         INTEGER NOT NULL DEFAULT 5000,
  last_brick_at TIMESTAMP
);
```

**Ở hạ tầng hiện có (Cloudflare KV + Durable Object)** thì thay vì SQL, dùng đúng hình dạng khoá KV:

```text
react:<slug>:<ch>                        → { counts:{…}, updatedAt }   (1 khoá/chương, đọc 1 lần)
react:me:<slug>:<ch>:<uid|device_id>     → { ids:[…] }                 (1 khoá/người/chương)
brick:<slug>                       → { count, goal, updatedAt }
brick:me:<slug>:<uid|device_id>:<ngày>   → { n }                       (chống spam theo ngày)
```

Client đã gửi kèm `user_id` (khi đăng nhập) **và** `device_id` trong mọi thao tác, nên máy chủ có thể chọn khoá theo tài khoản rồi gộp thiết bị về sau mà không phải đổi phía web.

Vì sao **chưa** làm ở Worker: (1) mỗi lượt thả/góp là một lượt **ghi** KV — thứ đang bị ngân sách hoá chặt (`src/shared/kv-budget.js`, xem `docs/features/do-luong-luot-doc-kv.md`); (2) chống spam theo thiết bị/ngày ở KV cần thêm khoá phụ và TTL, tức thêm lượt đọc; (3) chưa có cơ chế chống lạm dụng phía máy chủ (rate limit theo IP) nên mở công khai sẽ thành kênh ghi rác. Client đã sẵn hợp đồng + hàng chờ để khi Worker có endpoint thì chỉ việc điền URL trong `cz-config.js`.

## 9. Giấy phép asset

Sticker: Microsoft Fluent Emoji 3D (**MIT**, Copyright (c) Microsoft Corporation) — nhúng lại thành WebP 128 px trong `assets/stickers/`, nguồn từng tệp ở `assets/stickers/CREDITS.txt`, nội dung giấy phép ở `THIRD-PARTY-NOTICES.md`. Không hotlink (CSP `img-src` chặn) — ảnh nằm trong kho.

## 10. Kiểm thử

| Bài | Khoá điều gì |
| --- | --- |
| `tests/t_react.js` | đúng 6 sticker là `<button>` thật có ảnh WebP + emoji dự phòng, vị trí dưới nội dung trên thanh chuyển chương, thả/bỏ, chống spam, phiếu theo chương, `localStorage` theo máy **và theo tài khoản khi đã đăng nhập**, bảng đầy đủ, tắt/mở trong Cài đặt đọc, giảm chuyển động |
| `tests/t_readtools.js` | ẩn nhanh (tiêu đề/favicon/đường dẫn, không ghi tiến độ đọc, Esc×2, Ctrl+Shift+H), Zen, Bionic (không đổi chữ, NFD, `<pre>`), Terminal (lệnh giả, không ô nhập, không eval, thoát được) |
| `tests/t_brick.js` | chỉ truyện đang ra, nội dung hộp, cooldown + trần/ngày, mốc 5.000 → 10.000, tiếng chỉ sau cú bấm, **tắt/mở bằng công tắc trong Cài đặt đọc**, không gọi `/api/brick` khi chưa cắm, gọi đúng khi cắm |
| `tests/t_dice.js` | nút ở trang chủ + trang truyện, ưu tiên theo dõi, lọc 18+/tình trạng/thể loại, quay 2,6 s, “Đọc ngay” đúng chương, bỏ truyện vừa đọc, “Quay lại” không trùng, giảm chuyển động |

## 11. Rủi ro đã biết

- Số liệu reaction/gạch **chỉ đúng trên máy người đọc** cho tới khi có máy chủ — câu chữ trong toast nói rõ điều này.
- Vòng quay lấy tối đa 10 lát ngẫu nhiên mỗi lượt mở; bộ lọc thể loại gần như luôn ẩn vì registry thiếu `genre`.
- Terminal/Bionic đều thao tác trên DOM chương **sau khi** vẽ; nếu tương lai có chương nhúng HTML lạ thì hai lớp này vẫn chỉ đi qua `textContent` (không `innerHTML` hoá nội dung chương).
- `prefers-reduced-motion` tắt hạt bay/tiếng/vòng quay: đúng yêu cầu, nhưng nghĩa là máy đó không có “wow” — số đếm vẫn đủ để biết mình vừa thả gì.
