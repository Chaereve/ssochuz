# Sửa lỗi “F5 một cái là mất sạch bìa truyện”

*Cập nhật: 16/09/2026 · nhánh `arena/01a0a9ea-ssochuz` · lỗi trên bản thật (`ssochuz.pages.dev`, Edge/Chrome)*

---

## 1. Triệu chứng

- Mở web **lần đầu** thì bìa hiện đủ. **F5** (hoặc mở lại trang) là **mất bìa hàng loạt** —
  thẻ truyện còn khung, chữ và nút, nhưng chỗ ảnh bìa thành khung xám “ssochuz”.
- Những bộ bị ảnh hưởng là **mọi bộ có bìa ở host ngoài**: `cdn-local.mebmarket.com`,
  `pbs.twimg.com`, `m.media-amazon.com`, `i.mydramalist.com`, `image.tmdb.org`…
- Console đầy hai loại dòng, cùng trỏ vào **một chỗ trong `sw.js`**:

```
sw.js:117 Uncaught (in promise) TypeError: Failed to fetch. Refused to connect because it violates the document's Content Security Policy.
    at sw.js:117:14          ← fetch(req) trong imgFirst()
pbs.twimg.com/media/HQuHMUUbYAAx7RG?format=jpg&name=4096x4096:1  GET … net::ERR_FAILED
m.media-amazon.com/images/M/MV5BMDA4…jpg:1  Failed to load resource: net::ERR_FAILED
```

## 2. Nguyên nhân — service worker bị CSP của **chính nó** chặn, không phải CSP của trang

`sw.js` có nhiệm vụ **tải hộ ảnh bìa rồi cất vào kho `ssochuz-img`** (để đọc offline còn bìa).
Nhưng service worker chịu **Content-Security-Policy của phản hồi chứa `sw.js`**, chứ không
phải CSP của trang. Mà `_headers` lại để khối `/*` — khối áp cho **mọi** đường dẫn, kể cả
`/sw.js` — mang `connect-src` chỉ mở:

```
connect-src 'self' https://*.workers.dev https://*.supabase.co https://firestore.googleapis.com https://accounts.google.com https://*.e2b.app
```

Chuỗi sự kiện:

```
<img src="https://cdn-local.mebmarket.com/…/book_detail_large.gif?2">
   └─ SW nắm quyền → imgFirst() → cache trống (chưa từng tải hộ được lần nào)
        └─ fetch(req)                    ← vi phạm connect-src của sw.js
             └─ promise reject           ← sw.js:117, console: “Refused to connect …”
                  └─ respondWith() reject → trình duyệt coi là ẢNH LỖI (net::ERR_FAILED)
                       └─ cz-app.js imgSettle() gỡ ảnh, thêm .noimg → “mất bìa”
```

Hai câu hỏi thường gặp, trả lời luôn:

- **Vì sao lần đầu vẫn thấy bìa?** Lần tải đầu tiên SW còn đang cài/`skipWaiting`, **chưa nắm
  quyền** trang → ảnh do trình duyệt tự tải nên hiện bình thường. Từ lần tải **thứ hai** trở
  đi SW đứng ra giữa, và mọi ảnh host ngoài đều lỗi. Đúng cảm giác “vào thì được, F5 là mất”.
- **Vì sao kho ảnh không cứu được?** Chưa có ảnh nào từng vào kho (lần tải hộ nào cũng hỏng),
  nên lần nào cũng là cache miss → lần nào cũng lỗi. Lỗi này có từ khi CSP được thêm vào
  `_headers` (đợt “bảo mật”): trước đó `connect-src` không chặn nên SW tải hộ được.

## 3. Đã sửa — ba lớp, từ “biết chắc mới làm” tới “thà nhường còn hơn lỗi”

| Lớp | Ở đâu | Việc gì |
|---|---|---|
| 1 | `_headers` | Thêm luật riêng cho **`/sw.js`** ở **cuối tệp**: `! Content-Security-Policy` (bỏ CSP chung) rồi đặt CSP riêng `default-src 'self'; script-src 'self'; connect-src *; img-src *; style-src 'unsafe-inline'`. Chỉ **tệp service worker** được gọi mạng ra ngoài; trang, HTML, JS, dữ liệu vẫn giữ nguyên CSP nghiêm như cũ. |
| 2 | `sw.js` | **SW tự đọc CSP của chính mình**: `fetch('/sw.js')` rồi đọc header `content-security-policy` — chỉ khi CSP thật sự mở cho mọi nơi (`*` hoặc `https:`) thì SW mới đứng ra tải hộ bìa. Chưa biết / bị chặn ⇒ **để trình duyệt tự tải**: bìa vẫn hiện, **không có request lỗi nào** trong console. |
| 3 | `sw.js` | Nếu **đang tải hộ mà vẫn bị chặn** (CSP đổi sau khi SW đã cài, mạng đứt…): trả **302 về đúng URL ảnh** để trình duyệt tự đi lấy, rồi nhớ lại (`IMG_HANDOFF[url]`, `IMG_HOST_OFF[host]` khi đang offline, `IMG_REMOTE_OK = false` khi có mạng) ⇒ lần sau SW đứng ngoài, không lặp chuyển hướng, không rác console. **Không bao giờ trả `Response.error()` cho bìa nữa.** |

Kèm theo: `isImgRes()` chỉ lưu ảnh vào kho khi đúng là ảnh (vài CDN trả trang HTML 200 khi
chặn hotlink — lưu vào là bìa hỏng vĩnh viễn); `CZ_SW_VER` tăng lên `20260917m` để trình duyệt
nhận bản mới.

| File | Nội dung |
|---|---|
| `_headers` | Luật `/sw.js` như trên (kèm chú thích **vì sao phải nằm sau khối `/*`**). |
| `sw.js` | `cspAllowsRemote()`, `imgProbe()` (dò CSP một lần mỗi lần SW khởi động, `cache: 'force-cache'` nên không tốn request), `imgHandoff()`, `imgSkip()`, `isImgRes()` + khối chú thích “ẢNH BÌA” giải thích cả ba lớp. |
| `tools/check_headers.js` **(mới)** | Mô phỏng **đúng cách Cloudflare áp `_headers`**: duyệt theo thứ tự trong tệp, `! Tên` xoá header, header trùng tên thì **nối bằng dấu phẩy** (nhiều CSP nối nhau = phải thoả **cả hai**, tức luật nghiêm hơn thắng). Bắt đúng bẫy: khối `/sw.js` dời lên trước `/*` ⇒ CSP nghiêm quay lại dính vào response của `sw.js`. Kiểm luôn trang còn CSP nghiêm + manifest đúng MIME. Chạy trong `npm test`. |
| `tests/t_sw_img.js` **(mới)** | **Chạy thật `sw.js`** trong phạm vi giả (vm + `self`/`caches`/`fetch`/`navigator.onLine`), 8 tình huống: CSP mở → tải hộ + lưu kho + lần sau đọc cache; CSP chặn → **0 request ảnh**, SW đứng ngoài; không đọc được CSP → đứng ngoài; không có CSP (máy chạy thử) → tải hộ; bị chặn bất ngờ → 302 rồi đứng ngoài; đang offline → nhớ riêng từng host; CDN trả HTML 200 → không lưu; trang HTML/`/data`/request ghi vẫn đi đúng đường cũ. |
| `tests/t_pwa.js` | Thêm nhóm kiểm tra tĩnh: phần xử lý ảnh không được có `Response.error()`, phải có tự-dò-CSP + nhường-302 + nhớ host; `_headers` phải có luật `/sw.js` với `! Content-Security-Policy` + `connect-src *` **và phải nằm sau khối `/*`**. |
| `tests/run.js`, `tests/README.md` | Đưa 2 bài mới vào danh sách chạy và ghi lại mô tả. |

### Vì sao phải để luật `/sw.js` ở **cuối** tệp `_headers`

Cloudflare (asset server dùng chung cho Pages) áp các luật **theo thứ tự trong tệp**, mỗi luật:
xoá header ghi bằng `! Tên` trước, rồi mới `set` header của luật đó; header trùng tên ở luật
sau bị **nối bằng dấu phẩy**. Nếu để khối `/sw.js` **trên** khối `/*` thì kết quả là:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src *; …, default-src 'self'; … connect-src 'self' https://*.workers.dev …
```

— hai policy nối nhau nghĩa là **phải thoả cả hai**, mà luật nghiêm vẫn cấm `connect-src` ra
host ngoài ⇒ SW lại bị chặn ⇒ mất bìa host ngoài khỏi kho offline. `tools/check_headers.js`
kiểm đúng thứ tự này nên lần sau dời nhầm là bài kiểm thử báo lỗi ngay.

## 4. Kiểm chứng

- **Bài kiểm thử mới bắt đúng bệnh cũ.** Chạy `node tests/t_sw_img.js` với **`sw.js` bản cũ**
  (`git show HEAD:sw.js`) thì đổ đúng lỗi người dùng gặp, **đúng dòng 117**:

  ```
  TypeError: Failed to fetch
      at blocked (tests/t_sw_img.js:125:38)
      at fetchImpl (tests/t_sw_img.js:91:12)
      at fetch (tests/t_sw_img.js:103:71)
      at evalmachine.<anonymous>:117:14        ← đúng dòng 117 như console
  ```

  Với `sw.js` bản mới: **đạt hết 8 tình huống** (CSP chặn ⇒ 0 request ảnh; CSP mở ⇒ 200 + nằm
  trong kho `ssochuz-img` + lần sau đọc từ cache; bị chặn bất ngờ ⇒ 302 và không thử lại).
- **`node tools/check_headers.js`**: đúng thứ tự ⇒ `_headers an toàn: 18 luật…`; thử dời khối
  `/sw.js` lên trước `/*` ⇒ báo 2 lỗi (thứ tự + CSP nghiêm dính vào `sw.js`); xoá dòng
  `! Content-Security-Policy` ⇒ báo đúng lỗi đó.
- **`node tests/run.js`** (25 bài, gồm worker thật `worker/cms.js`): tất cả đều đạt.
- CSP của trang **không bị nới theo**: `/`, `/admin`, `/truyen/<slug>` vẫn có
  `default-src 'self'` + `script-src 'self'` + danh sách `connect-src` như cũ (bài kiểm thử
  trong `check_headers.js` khẳng định điều này).

## 5. Vì sao lần này chắc ăn

1. **Biết chắc mới làm:** SW chỉ đứng ra tải hộ bìa host ngoài khi **đọc được** CSP của chính
   nó và thấy CSP mở. Nếu `_headers` chưa có tác dụng (hoặc nền tảng không hỗ trợ cú pháp `!`),
   SW **không thử** ⇒ ảnh do trình duyệt tải như khi không có service worker ⇒ **bìa luôn hiện,
   console sạch**.
2. **Nếu vẫn bị chặn bất ngờ:** SW nhường bằng 302 và tự tắt phần tải hộ ⇒ cùng lắm **một** lần
   hụt mỗi phiên, các ảnh sau đi thẳng ra trình duyệt.
3. **Không bao giờ trả ảnh lỗi:** bỏ hẳn kiểu `Response.error()` cho ảnh bìa — đúng thứ đã gỡ
   bìa khỏi trang.
4. **Mất gì khi CSP vẫn chặn?** Chỉ mất phần **cache offline cho ảnh host ngoài** (trình duyệt
   vẫn tự cache theo header của CDN, nên offline vẫn thường còn bìa). Bìa **không** mất nữa.

## 6. Bạn cần làm

1. **Deploy lại** (đẩy nhánh này lên Pages như mọi lần). Không cần đổi cài đặt gì trong dashboard.
2. Mở web, khi thanh **“Đã có bản cập nhật — tải lại”** hiện thì bấm **Tải lại** (hoặc đóng hết
   tab rồi mở lại). Chỉ cần **một lần**: tab đang mở vẫn do SW cũ giữ cho tới khi SW mới kích hoạt.
3. Kiểm tra nhanh CSP của tệp service worker trên bản thật:

   ```bash
   curl -sI https://ssochuz.pages.dev/sw.js | grep -i content-security-policy
   ```

   - Thấy `connect-src *` (hoặc không có dòng CSP nào): đúng như mong đợi — SW tải hộ bìa và
     **cache được để đọc offline**.
   - Vẫn thấy danh sách `connect-src 'self' https://*.workers.dev …`: luật `!` chưa có tác dụng
     trên nền tảng — **bìa vẫn hiện đủ** (lớp 2 và 3), chỉ mất cache offline cho ảnh host ngoài;
     báo lại để chuyển sang phương án proxy ảnh qua Worker (khi đó ảnh là cùng host nên cache
     offline chắc chắn được).
4. Mở thử một bộ truyện trong **cửa sổ ẩn danh** để chắc chắn không dính bản cũ (SW và kho ảnh
   cũ vẫn nằm trong máy cho tới khi bản mới kích hoạt).

## 7. Ghi chú kỹ thuật, để lần sau không dẫm lại

- **CSP của service worker = CSP của chính phản hồi chứa `sw.js`**, không phải CSP của trang.
  Muốn SW nói chuyện với host nào thì `connect-src` của **`/sw.js`** phải mở host đó (thông báo
  lỗi của trình duyệt ghi “document's Content Security Policy” rất dễ gây hiểu nhầm là lỗi của trang).
- Trình duyệt vẫn kiểm CSP của trang cho **cả** yêu cầu ban đầu và phản hồi SW trả về — nên mở
  `connect-src` cho `sw.js` **không** nới gì cho trang.
- **SW đọc được CSP của chính mình**: `fetch(location.href)` rồi xem header — nhờ vậy SW “biết
  mình được phép gì” thay vì cứ thử rồi lỗi. `fetch` do SW gọi không quay lại `fetch` handler của
  chính nó (`service-workers mode: none`), nên không có chuyện đệ quy.
- `_headers` là **danh sách có thứ tự**, không phải “khớp là xong”: `! Tên` phải đứng **sau**
  luật đã đặt header đó; trùng tên thì bị nối bằng dấu phẩy.
- Thêm một tầng nào đứng giữa ảnh: **đừng bao giờ trả `Response.error()`/ảnh lỗi** cho ảnh bìa.
  Nhường cho trình duyệt (302) luôn là phương án an toàn — bìa phải hiện trước, cache offline
  là chuyện sau.
