# Sửa lỗi bấm vào trang truyện thì "redirected you too many times"

*Cập nhật: 13/09/2026 · nhánh `arena/01a09972-ssochuz` · lỗi trên bản thật `ssochuz.pages.dev`*

---

## 1. Triệu chứng

Bấm vào bất kỳ bộ truyện nào (link dạng `ssochuz.pages.dev/truyen/<tên-truyện>/`) là trình duyệt báo:

> **This page isn't working right now**
> `ssochuz.pages.dev` redirected you too many times.
> Try deleting the cookies for this site. — `ERR_TOO_MANY_REDIRECTS`

Trang chủ, `/admin` vẫn vào bình thường → lỗi nằm riêng ở đường dẫn `/truyen/…`.

## 2. Nguyên nhân — hai tính năng đúng, ghép lại thành vòng lặp

File `_redirects` (bản cũ) viết thế này:

```
/truyen/*      /truyen.html   200      ← proxy: mở truyen.html nhưng GIỮ nguyên URL
/truyen        /truyen.html   200
```

Một mình nó không sai. Vấn đề là **Cloudflare Pages còn tự làm một việc nữa**: tự bỏ đuôi
`.html` bằng chuyển hướng **308**. Gõ `/admin.html` là Pages nhảy sang `/admin` rồi mới
phục vụ trang — mình đã kiểm tra ngay trên bản thật và thấy đúng như vậy.

Hai thứ đó cắn nhau:

```
/truyen/third-person/   ──(_redirects proxy)──▶  /truyen.html
/truyen.html            ──(Pages tự bỏ .html, 308)──▶  /truyen
/truyen                 ──(_redirects proxy)──▶  /truyen.html      ⟲ quay lại bước 2
/truyen.html            ──(308)──▶  /truyen                        ⟲ …
```

Cứ thế đến khi trình duyệt đếm quá 20 lần nhảy thì bỏ cuộc và báo
`ERR_TOO_MANY_REDIRECTS`. **Trang truyện chết hoàn toàn, không bộ nào vào được.**

Đây là lỗi kinh điển khi mang `_redirects` viết theo kiểu Netlify sang Cloudflare Pages
(Netlify phục vụ đích `.html` tại chỗ, còn Pages thì 308 bỏ đuôi `.html`).

## 3. Đã sửa

| File | Sửa gì |
|---|---|
| `_redirects` | **Đích của mọi luật 200 đổi từ `/truyen.html` → `/truyen`** (URL sạch — Pages tự phục vụ `truyen.html` và trả 200, không nhảy đi đâu nữa nên không thể lặp). Bỏ luật `/truyen → /truyen.html` vì chính nó khép vòng lặp. Kèm chú thích cảnh báo ngay trong file. |
| `_headers` | Thêm luật cho `/truyen` và `/truyen/*`: URL người đọc không kết thúc bằng `.html` nên luật `/*.html` cũ không với tới → trang truyện không bị dính cache, sửa xong là thấy ngay. |
| `cz-story.js` | Đọc tên truyện chắc chắn hơn: `/truyen` (không có slug) thì lấy `?slug=` thay vì hiểu nhầm chữ "truyen" là tên truyện; link đời cũ `/reader/<slug>/` nay mở đúng bộ; trang lỗi có thêm nút **Tải lại trang** và tiêu đề tab không còn kẹt ở "Đang tải…". |
| `tools/dev_server.py` | Máy chủ xem thử nay mô phỏng **đúng 3** hành vi của Pages (URL sạch · tự bỏ `.html` bằng 308 · `_redirects`), tự đếm số lần nhảy và **trả 508 kèm đường đi** nếu `_redirects` tạo vòng lặp — thay vì để trình duyệt treo như bản deploy. Khởi động cũng in cảnh báo nếu có luật sai. |
| `tools/check_html.js` | Thêm phần soi `_redirects`: đích `.html` ⇒ báo vòng lặp; đích không có tệp thật ⇒ báo 404; luật tĩnh bị luật `*` che mất; thiếu luật cho link `/truyen/<slug>/` mà `cz-app.js` sinh ra. Chạy trong `tests/t_html.js`. |
| `tests/t_story.js` | Thêm ca kiểm tra 3 dạng đường dẫn: `/truyen`, `/reader/<slug>/`, `/truyen.html?slug=…`. |
| `BAO-CAO-CAI-TO-GIAO-DIEN.md` | Ghi chú cảnh báo để lần sau không viết lại đích `.html`. |

## 4. Kiểm chứng

Bản cũ và bản mới chạy song song trên máy (`python3 tools/dev_server.py`), đo bằng `curl`:

| Đường dẫn | Bản cũ (lỗi) | Bản mới |
|---|---|---|
| `/truyen/third-person/` | **508** — `/truyen.html → /truyen → /truyen.html → …` | **200**, 0 lần nhảy, URL giữ nguyên |
| `/truyen/third-person` | 508 | 200 |
| `/truyen` | 508 | 200 |
| `/truyen.html` | 508 | 200 |
| `/reader?slug=third-person&ch=3` | 508 | 200, mở thẳng Chương 2: Hạt Mầm |
| `/admin.html` | 308 → `/admin` | 308 → `/admin` (giữ nguyên, đúng như Pages thật) |
| `/` | 200 | 200 |

- `node tools/check_html.js` → *"HTML tĩnh sạch"* + *"`_redirects` an toàn: 5 luật, không luật nào vòng lặp"*;
  khi dán lại `_redirects` cũ thì nó **bắt đúng 5 luật lỗi** và thoát mã 1.
- Cả 8 bài kiểm thử jsdom (`cd tests && node run.js`) đều đạt; trang truyện vẫn render đủ
  bìa, 9 chương, tab, phần "Cùng couple/Cùng tác giả".

## 5. Bạn cần làm

1. **Deploy lại** (push lên nhánh Cloudflare Pages đang theo dõi, hoặc kéo-thả thư mục repo
   vào Pages). Không cần đổi cài đặt gì trong dashboard.
2. Mở thử một bộ truyện **trong cửa sổ ẩn danh** (Incognito). Lý do: 308 là chuyển hướng
   vĩnh viễn nên trình duyệt có thể đã **cache** lần nhảy hỏng trước đó; cửa sổ ẩn danh bỏ
   qua cache. Nếu bản thường vẫn còn lỗi thì xoá cookie/cache của riêng
   `ssochuz.pages.dev` rồi tải lại — bản thân server đã hết lặp.
3. Nếu sau này thêm trang mới cần URL đẹp: trong `_redirects` chỉ được trỏ về **URL sạch**
   (`/ten-trang`), không trỏ về `/ten-trang.html`. `node tools/check_html.js` sẽ nhắc.

---

## 6. Cập nhật 16/09/2026 — máy chủ xem thử phục vụ đúng trang truyện (404/508)

Sau khi sửa vòng lặp trên bản deploy, **máy chủ xem thử trên máy vẫn không mở được trang truyện**
(kiểm chứng trên bản `HEAD` sạch, không liên quan tới các thay đổi sau đó):

| Đường dẫn | Trước | Sau |
|---|---|---|
| `/truyen` | **404** | 200 (phục vụ `truyen.html`) |
| `/truyen/` | **404** | 200 |
| `/truyen.html` | **404** | 200 |
| `/truyen/third-person` | **508** | 200 |
| `/truyen/third-person/` | **508** | 200 (đúng trang của bộ đó) |
| `/truyen/third-person/?ch=3` | **508** | 200 (query giữ nguyên) |
| `/reader/third-person/` | **404** | 200 |

Hai lỗi, cả hai đều ở `tools/dev_server.py` — phần mô phỏng Cloudflare Pages:

1. **`/truyen` bị 404** — `find_file()` gặp thư mục `truyen/` (chứa các trang truyện con, **không**
   có `index.html`) rồi bỏ cuộc luôn, quên mất tệp `truyen.html` nằm ngay cạnh. Thứ tự đúng của
   Pages (html_handling = auto-trailing-slash): thư mục có `index.html` → phục vụ nó; thư mục
   **không** có `index.html` → vẫn thử `tên.html` trước khi trả 404.
2. **`/truyen/<slug>/` bị 508** — mỗi bộ có luật `/truyen/<slug>/ → /truyen/<slug>/ 200`
   (**tự trỏ về chính nó**, sinh ra khi mọi bộ đều có luật riêng). Pages coi đó là *không viết lại
   gì* rồi phục vụ tệp thật; máy chủ xem thử lại hiểu là vòng lặp nên trả 508. Nay luật tự-trỏ-về-mình
   được coi là không viết lại — nhưng **bộ bắt vòng lặp thật vẫn còn nguyên** (luật kiểu
   `/truyen/* → /truyen.html 200` vẫn trả 508 kèm đường đi, xem mục 2).

Sửa gọn trong đúng hai chỗ: `Handler.find_file()` (thêm nhánh thư-mục-không-có-index → `tên.html`)
và `Handler.route()` (bỏ qua luật tự trỏ về chính nó, so sánh theo **đường dẫn** nên `?ch=3` vẫn
vào tới trang).

| File | Sửa gì |
|---|---|
| `tools/dev_server.py` | Hai nhánh trên, kèm chú thích ngay tại chỗ để lần sau không “tối ưu” ngược lại. |
| `tests/t_devserver.js` **(mới)** | Bật thật máy chủ rồi gọi HTTP kiểm 18 đường dẫn (kể cả `?ch=3` và link đời cũ), kiểm nội dung đúng bộ truyện, `admin.html` → 308 → `/admin`, đường dẫn lạ → 404; và dựng **thư mục tạm** có `_redirects` sai như bản cũ để chắc rằng **508 vẫn bật** khi luật thật sự lặp. Chạy trong `npm test`. |
| `tests/run.js`, `tests/README.md` | Đưa bài mới vào danh sách chạy và ghi lại mô tả. |

Kiểm chứng: chạy bài mới với `tools/dev_server.py` **bản cũ** thì báo đúng 9 đường dẫn hỏng
(`/truyen` 404, `/truyen/third-person/` 508…) và 2 lỗi nội dung; với bản mới thì đạt hết.

> ⚠ Đây chỉ là **công cụ xem thử trên máy** — bản deploy không chạy python, `_redirects`/`_headers`
> và Pages mới là thứ quyết định. Sửa này để bạn nhìn thấy đúng những gì người đọc sẽ thấy.
