# ĐÁNH GIÁ KHẢ THI — 15 PHẦN YÊU CẦU vs REPO HIỆN TẠI

Ngày khảo sát: 20/09/2026 · Nhánh: `arena/01a0ba86-ssochuz` · Ngân sách: **0 đ/tháng**

Mọi dòng "ĐÃ CÓ" dưới đây đều được kiểm bằng lệnh trên repo, không suy đoán. Phần cuối nêu **ràng buộc thật sự** — và nó không phải tiền.

---

## RÀNG BUỘC QUAN TRỌNG NHẤT (đọc trước)

Không phải "có free hay không" — mà là **hạn mức ghi KV**. Cloudflare free cho **1.000 lần ghi KV/ngày**, 100.000 lần đọc. Đọc thì dư dả; **ghi mới là thứ hết**.

Hệ quả: mọi tính năng "mỗi người dùng mỗi lần đọc đều ghi" (view theo chương, thời gian đọc, tiến độ đồng bộ server, version history, real-time online) sẽ **chạm trần rất nhanh**. Repo hiện đã né đúng chỗ này: tiến độ đọc nằm ở `localStorage`, lượt xem có `seenview` chống đếm trùng.

Vì vậy bảng dưới đây chia theo **chi phí ghi KV**, không chỉ theo "free hay trả phí".

---

## A. ĐÃ CÓ SẴN — đừng làm lại

| Mục yêu cầu | Bằng chứng trong repo |
|---|---|
| **1.1** Bold/Italic/Underline/Strike | `data-cmd` trong `admin.html` |
| **1.2** Clear formatting | `data-cmd="removeFormat"` (vừa thêm) |
| **1.3** Căn trái/giữa/phải/đều | `data-align` left/center/right/**full** |
| **1.4** Bullet list, Numbered list, Increase/Decrease indent | `insertUnorderedList`, `insertOrderedList`, `indent`, `outdent` |
| **1.5** Upload ảnh, Insert link, Unlink | `POST /api/img` (nén WebP trong trình duyệt), `edLink()`, `unlink` |
| **1.7** Horizontal line, Blockquote | `insertHorizontalRule`, `formatBlock blockquote` |
| **1.8** H2/H3/P | `formatBlock` |
| **1.9** Undo/Redo, Word count, Reading time, Fullscreen | `undo`, `redo`, `CZ.words()`, `CZ.readTimeText()`, `edFull()` |
| **1.10** Auto-save draft, Manual save, Save status indicator | `autoSave()` 2 s, `#chSave`, `#chSaveState` |
| **1.11** Sticky toolbar, Keyboard tooltip | `.rte-tools { position: sticky }`, title `(Ctrl+B)` |
| **2.1** Rate limiting đăng nhập | `rl:adm:` — **25 lần/10 phút**, trả 429 (`worker/cms.js:826`) |
| **2.2/2.11** Dashboard + Analytics | 11 tab: `overview, list, new, edit, cmts, reports, votes, stats, log, doctor, settings` |
| **2.10** Comment moderation, Report queue | tab `cmts` (`#cmList/#cmQ/#cmExport`) + tab `reports` |
| **2.12** Site settings, donation config | tab `settings`, `#dMomo` |
| **2.14** Activity log | KV key `log` + tab `log` (`worker/cms.js:1534`) |
| **3.4** Reading settings (font/size/line/width/theme/justify/fullscreen), word count, reading time | `t_flows.js` đo được 9 mục trong `#setSheet` |
| **3.4** Auto-save reading progress | `localStorage`, không tốn KV |
| **4.5** Comment: like, pin, spoiler | có trong `cz-story.js` (9× like, 6× pin, 1× spoiler) |
| **7.4** Reduced motion | `prefers-reduced-motion` đã tôn trọng |
| **11.1** PWA: installable, offline, precache | `manifest.webmanifest` + `sw.js` (cache-first, stale-while-revalidate, 14 chỗ offline) |
| **11.1** Push notifications | **đã làm trọn vẹn, tự viết VAPID** bằng WebCrypto: aes128gcm + ký ES256 (`worker/cms.js:528-618`) — không dùng thư viện trả phí nào |
| **12.1** XSS protection | `CZ.sanitize()` + `cleanHTML()` (blocklist, lột `on*`, chặn `javascript:`) |
| **12.1** Rate limiting nhiều endpoint | **10 khoá** `rl:*`: `adm`, `cmt`, `img`, `lock`, `login`, `push`, `rate`, `report`, `space`, `vote` — vượt là trả 429 |
| **15.1** Sitemap, robots.txt, OG tags | `sitemap.xml` (213 KB, đã sinh), `robots.txt` có `Disallow: /admin`, 4 thẻ `og:` |
| **6.1** Export data CSV | `CZ.download('ssochuz-stats-….csv')` (`src/admin.js:3512`) |
| **8.4** Donations | MoMo + QR đã có sẵn config trong admin settings |

Ngoài ra có **tab "Bác sĩ dữ liệu"** (`#pane-doctor`) soi cùng lúc 3 nguồn (registry / kho chương / KV) để bắt lệch số — thứ này trong danh sách yêu cầu **không có**.

---

## B. LÀM ĐƯỢC, $0 — xếp theo "đáng làm nhất"

### B1. Đáng làm ngay (rẻ, lợi rõ)

| Mục | Việc phải làm | Ghi KV |
|---|---|---|
| **4.5 Trả lời bình luận (thread)** | **Worker đã hỗ trợ sẵn** `parentId`, thread nhiều tầng, tự dọn reply mồ côi (`worker/cms.js:3025-3067`). Nhưng `cz-story.js` có **0** chỗ nào dùng — trang đọc **chưa có nút Trả lời**. Chỉ thiếu UI. | 0 (dùng route cũ) |
| **12.1 Security headers** | `_headers` hiện **chỉ có `Cache-Control`** — thiếu toàn bộ `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`. Thêm ~6 dòng vào `_headers`. | 0 |
| **15.1 Canonical URL + JSON-LD** | `index.html`/`truyen.html` **không có** `rel="canonical"`, **không có** `application/ld+json`. Thêm `BookSeries`/`Chapter` schema giúp rich snippet. | 0 |
| **1.2 Subscript/Superscript** | 2 nút `data-cmd="subscript"`/`"superscript"` — **không cần dòng JS mới**, bộ điều phối có sẵn | 0 |
| **1.9 Special characters** | Bảng ký tự + `insertText`. Thuần trình duyệt | 0 |
| **1.9 Select all / Copy / Paste** | Trình duyệt tự có (Ctrl+A/C/V). **Không được thêm nút giả** | 0 |
| **1.11 Collapsible toolbar** | Toggle class + lưu trạng thái vào `localStorage` | 0 |
| **7.1 Skip to content link, focus indicator** | Thuần CSS/HTML | 0 |
| **3.4 Prefetch chương kế** | `<link rel="prefetch">` khi đọc gần cuối chương | 0 (chỉ đọc) |

### B2. Làm được, công vừa

| Mục | Ghi chú |
|---|---|
| **1.2 Font family / Font size / Màu chữ / Highlight** | `fontName`, `fontSize`, `foreColor`, `hiliteColor` đều qua `execCommand`. **Lưu ý:** màu chữ trong truyện là con dao hai lưỡi — trang đọc có 3 nền (sáng/tối/kem) và người dùng tự đổi cỡ chữ; màu cố định sẽ vỡ tương phản ở nền khác. Nên giới hạn bảng màu an toàn hoặc chỉ cho highlight. |
| **1.3 Text direction LTR/RTL** | `dir` attribute — dễ, nhưng chỉ cần khi thật sự có độc giả Ả Rập/Do Thái |
| **1.4 Checklist (todo)** | `input[type=checkbox]` **đang bị `cleanHTML()` và `CZ.sanitize()` chặn** (nằm trong danh sách `input`). Muốn có thì phải mở ngoại lệ có kiểm soát — cân nhắc kỹ vì đây là lỗ XSS kinh điển |
| **1.5 Image caption / alignment** | Rẻ hơn tôi tưởng: `figure`/`figcaption` **đã đi qua được cả hai bộ lọc** (blocklist không chặn), và `edHtml()` còn chủ động bảo vệ `figure` khỏi bị chuẩn hoá (`src/admin.js`, dòng `if (d.querySelector('div,p,ul,ol,…,figure,h1…')) return;`). Chỉ thiếu nút bấm + CSS. Resize bằng handle thì phải tự viết (không có `execCommand`) |
| **1.6 Tables (insert/add/delete row-col, header)** | **Làm được, miễn phí, không thư viện.** `<table>` đã sống sót qua cả bộ lọc lẫn `edHtml()`. Nhưng merge/split cell là việc nặng và dễ sinh HTML hỏng. Đề xuất: chỉ làm insert + thêm/xoá dòng cột + header row, **bỏ merge/split** |
| **1.7 Callout boxes (info/warn/success/error)** | **Có một vướng thật:** `edHtml()` đổi mọi `<div>` chỉ chứa chữ thành `<p>`, nên `<div class="callout">chữ</div>` sẽ **mất class** khi lưu. Phải thêm điều kiện giữ lại `<div>` có `class` (hoặc dùng `<aside>`). Bộ lọc phía người đọc thì không chặn |
| **1.7 Code block** | `<pre><code>` đi qua được bộ lọc. **Syntax highlight** thì dùng highlight.js (MIT, free) hoặc bỏ highlight — không bắt buộc |
| **1.9 Find & Replace** | Đã có `#chFind` (tìm). Thêm thay thế = duyệt text node, thuần trình duyệt |
| **1.9 Export .html / .txt / Print** | `Blob` + `CZ.download()` (đã có sẵn hàm), `window.print()`. §25 cho phép rõ |
| **1.10 Compare versions (diff)** | Diff thuần JS được (thuật toán LCS). Nhưng **phải có bản cũ để so** — xem B3 |
| **2.1 Remember me / show-hide password / loading spinner** | Thuần UI |
| **2.2 Stats cards + charts** | Vẽ chart **không cần thư viện**: `<svg>` tự vẽ line/bar. Đã có `/api/stats` và `stats_cache`. Pie/area cũng vẽ được |
| **2.3/2.4 Sidebar collapsible, breadcrumb, Ctrl+K search** | Thuần UI. **Riêng Ctrl+K:** trang quản trị hiện **cố ý không có phím tắt** (yêu cầu của chủ trang 17/09/2026, có test `adminNoFakeShortcuts` khẳng định) — muốn thêm phải **bỏ yêu cầu cũ một cách có ý thức** |
| **2.5 Bulk actions, inline edit, export CSV** | `CZ.download` + `text/csv` đã có. Bulk = lặp qua các slug đã chọn, 1 PUT mỗi bộ |
| **3.2 Grid/List toggle, filters, sort** | Client-side trên registry — đã có sẵn phần lớn |
| **5.1 Search stories/users/chapters + autocomplete + highlight** | Đang là search client-side (`#q`, debounce 160 ms, `src/cz-home.js:557`). Mở rộng được vì registry đã tải sẵn ở client |
| **5.3 Browse by genre/status/word count/rating** | Lọc client-side trên registry |
| **7.2 Bottom nav mobile, swipe gestures** | Thuần JS/CSS |
| **9.1 Localized dates/numbers** | `toLocaleString('vi-VN')` — đang dùng rồi |
| **15.2 Share buttons (FB/X/Reddit)** | Chỉ là link `sharer.php`. `shareChapter()` đã có ở `cz-story.js:1377` — mở rộng thêm mạng xã hội |
| **14.1 ESLint + Prettier + GitHub Actions CI** | Free. **Lưu ý:** repo hiện **không có** `lint`/`typecheck` script; thêm vào là thay đổi quy trình, cần chủ trang đồng ý |
| **14.2 README, CHANGELOG, docs** | Free, chỉ tốn công viết |

### B3. Làm được nhưng **phải đánh đổi**

| Mục | Đánh đổi |
|---|---|
| **1.10 Version history / Restore / Compare** | §11 của spec cũ nói rõ *"Không tạo hệ thống versioning giả"*. Làm **thật** được, nhưng mỗi lần lưu = thêm 1 ghi KV. Với trần 1.000 ghi/ngày thì chỉ đủ cho vài chục lần lưu. Cách làm chấp nhận được: giữ **tối đa 3 bản** ngay trong object của bộ truyện (không thêm key), và chỉ chụp khi nội dung đổi >5%. Vẫn tốn ghi — phải chấp nhận |
| **1.10 Auto-save mỗi 30 giây lên server** | Hiện đang auto-save **2 giây vào localStorage, không gọi API** — cố ý. Đổi sang ghi KV định kỳ sẽ đốt hạn mức ghi mà không thêm giá trị cho độc giả. **Khuyến nghị: giữ nguyên** |
| **2.2 Real-time notifications panel / "ai đang đọc"** | Không có WebSocket miễn phí ở đây. Polling thì mỗi lần poll là 1 đọc KV — 1.000 người × 30 s = hết hạn mức đọc trong chưa tới 1 giờ. **Không nên làm** |
| **2.11 Unique visitors / Bounce rate / Session duration** | §17 cấm khẳng định các số này. Muốn có thật thì phải gắn analytics ngoài — mà §25 cấm analytics trả phí. **Đánh dấu "chưa khả dụng"**, không giả lập |
| **6.1 Reader demographics / Drop-off points** | Cần thu thập và **lưu** dữ liệu từng phiên → ghi KV. Không kham nổi ở free. Device/browser thì suy ra được từ `User-Agent` mà không lưu, nhưng **không được** gọi đó là thống kê nhân khẩu |
| **12.1 Password hashing / 2FA** | Repo **không tự quản lý mật khẩu** — auth đi qua Supabase và Google (`authSupabase`, `authGoogle`, 40 lần nhắc supabase trong `cz-auth.js`). 2FA vì thế thuộc về Supabase, không phải việc của Worker. Muốn tự làm 2FA thì phải tự quản mật khẩu → tự gánh bcrypt/argon2 + reset + verify email. **Không khuyến nghị** |
| **9.1 Multi-language UI** | Làm được (tự viết dictionary, không cần next-i18next). Nhưng repo đang hardcode `lang="vi"` và toàn bộ chuỗi tiếng Việt nằm rải trong JS — tách ra là **đụng vào hầu hết file**. Chỉ nên làm khi thật sự cần bản tiếng Anh |

---

## C. KHÔNG LÀM ĐƯỢC VỚI $0 (hoặc thiếu khả năng backend)

| Mục | Lý do |
|---|---|
| **8.2 Premium membership (Stripe/PayPal)** | §25 cấm. Stripe/PayPal cần tài khoản merchant + phí giao dịch. Không có "free" |
| **8.3 Pay per chapter / Virtual currency** | Cần cổng thanh toán. Như trên |
| **8.1 Google AdSense** | *Về mặt kỹ thuật* chỉ là dán script — **nhưng** cần được AdSense duyệt, và site phải có nội dung gốc + traffic. Đây là ràng buộc kinh doanh, không phải kỹ thuật. Nếu chủ trang đã có tài khoản AdSense thì dán được; agent không tự đăng ký thay được |
| **13.1/13.2 Transactional emails (welcome, reset password, digest)** | Cloudflare **không gửi email được** từ Worker ở gói free (Email Workers cần trả phí); §25 cấm Resend. **Không có đường nào $0.** Phải đánh dấu `NOT IMPLEMENTED — requires paid service` |
| **13.3 In-app messaging (nhắn tin riêng)** | Cần lưu hội thoại + realtime. Ghi KV quá đắt |
| **10.1–10.4 AI features (auto description, grammar, plagiarism, dịch, kiểm duyệt ảnh)** | §25 cấm OpenAI/Claude/Gemini. Không có model chạy free trong Worker (giới hạn CPU/bộ nhớ) |
| **5.1 Full-text search trong nội dung 1.198 chương** | §25 cấm Algolia/Elasticsearch. KV không có full-text index. Tự build index trong Worker thì vượt trần CPU free. **Chỉ tìm được tiêu đề/tác giả/tag** (đang làm được) |
| **6.2 Real-time dashboard, DAU/WAU/MAU, retention, churn, MRR/ARR/LTV** | Cần kho dữ liệu sự kiện + realtime. §17 cấm khẳng định nếu không đo được thật |
| **11.2 Native app (React Native/Flutter)** | Ngoài phạm vi hoàn toàn; cần tài khoản Apple ($99/năm) và Google ($25) |
| **12.3 Point-in-time recovery, off-site backup** | KV free **không có** snapshot/rollback. Tự làm được bản "tải toàn bộ JSON về máy" (đã có `/api/admin/kv` + export) — đó là backup thủ công, **không phải** point-in-time |
| **12.1 DDoS protection** | Cloudflare có sẵn ở tầng edge, không phải việc của code. Không cần làm gì |
| **14.3 Sentry / Datadog / RUM** | §25 cấm. Thay thế $0: đọc `console` + tab `log` sẵn có |
| **9.3 CDN edge locations** | Cloudflare Pages đã tự phân phối edge. Không cần làm gì |
| **4.1 GitHub login** | Tự viết OAuth được và free — nhưng cần tạo OAuth App và lưu client secret trong Worker secret. **Làm được nếu chủ trang cấp client ID/secret**, agent không tự tạo được |

---

## D. ĐỀ XUẤT THỨ TỰ LÀM (nếu tiếp tục)

Đợt 1 — **rẻ, không rủi ro, không tốn KV**:
1. Security headers trong `_headers` (đang trống trơn — đây là lỗ thật)
2. Nút trả lời bình luận (Worker **đã sẵn sàng**, chỉ thiếu UI)
3. `rel="canonical"` + JSON-LD `BookSeries`/`Chapter`
4. Subscript/Superscript + Special characters + Collapsible toolbar

Đợt 2 — **giá trị cho người viết**:
5. Image caption/alignment + `<figure>`
6. Callout boxes + code block
7. Find & Replace (đã có Find)
8. Export .html/.txt + Print

Đợt 3 — **cần chủ trang quyết trước**:
9. Tables (chốt: bỏ merge/split)
10. Version history (chốt: có phá quy tắc §11 không)
11. Charts tự vẽ bằng SVG cho tab stats
12. Ctrl+K (chốt: có bỏ yêu cầu "không phím tắt" không)

---

## E. NHỮNG GÌ TÔI CHƯA KIỂM CHỨNG

Nói rõ để không hiểu nhầm:

- **Chưa mở trình duyệt thật.** Mọi kết luận ở trên đến từ đọc mã nguồn và chạy test jsdom. Giao diện trên điện thoại chưa được xem.
- **Chưa đo hạn mức KV thực tế đang dùng.** Con số "1.000 ghi/ngày" là hạn mức gói free của Cloudflare, không phải số tôi đo từ tài khoản của chủ trang. Muốn biết còn bao nhiêu thì phải xem dashboard Cloudflare.
- **Chưa kiểm tra `_redirects`**, chưa xem nội dung `manifest.webmanifest` chi tiết, chưa chạy Lighthouse.
- **AdSense**: tôi không biết chủ trang đã có tài khoản chưa — mục này bỏ ngỏ, không kết luận.
