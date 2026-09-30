# Roadmap cải thiện sản phẩm — ssochuz

Công thức: `Priority score = (User impact × Frequency × Confidence) / Effort` (thang 1–5).
Chi tiết vấn đề và bằng chứng: `docs/product-discovery.md` (Gap ID tương ứng).

## 1. Bảng ưu tiên (đã sắp theo điểm)

| ID | Feature/improvement | Problem | Flow ảnh hưởng | Type | Impact | Freq | Conf | Effort | Score | New service needed | Free-tier status | Cost risk | Free fallback | Priority | Owner approval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1/G1 ✅ | Đọc bản lưu khi chương không tải được | Worker/KV lỗi ⇒ trang đọc chỉ có "Thử lại" dù bản tĩnh tồn tại | Đọc chương | Core-flow completion | 5 | 3 | 4 | 2 | **30** | Không | No external service required | Không | Chính `/data/book/*.json` | **P1** | Không (chỉ mã + test) |
| A2/G2 ✅ | Ngân sách + hiển thị **lượt đọc** KV | Chỉ theo dõi ghi; chạm trần 100k đọc/ngày ⇒ sập im lặng | Đọc chương, vận hành | Technical foundation / Reliability | 4 | 3 | 4 | 2 | **24** | Không (đếm trong Worker) | No external service required | Không | Dashboard Cloudflare (miễn phí) | **P1** | Có — chạm Worker + thông báo |
| G4 ✅ | Sửa harness `t_admin_features` để `npm test` xanh | Test đỏ thường trực che lỗi mới | Toàn bộ | Technical foundation | 3 | 5 | 5 | 1 | **75** | Không | No external service required | Không | — | **P1** | Không |
| G6 | Check tự động OG/JSON-LD cho mọi bộ | Quên `npm run og` ⇒ bộ mới mất thẻ chia sẻ, bot thấy "Đang tải…" | Chia sẻ/SEO | SEO | 2 | 3 | 4 | 1 | **24** | Không | No external service required | Không | — | P2 | Không |
| G9a | CI chạy `npm ci && npm test` + build check | Không có gì chặn hồi quy khi merge | Toàn bộ | Technical foundation | 4 | 5 | 4 | 2 | **40** | Không (GitHub Actions free) | Confirmed free and suitable | Không | Chạy tay `npm test` | P2 | Có (thêm workflow) |
| G7 | Mirror bìa về Supabase Storage | 61/63 bìa hotlink host ngoài ⇒ chậm/404, phải mở CSP cho `sw.js` | Landing, thẻ truyện | Reliability / Performance | 3 | 2 | 4 | 1 | **24** | Không (đã có Storage free) | Confirmed free and suitable (1 GB) | Thấp | Giữ nguyên hotlink | P2 | Có (đổi hành vi ảnh) |
| G3 | Tách trạng thái lỗi/rỗng trong khung soạn chương | "Chưa có dữ liệu chương trong cache" gộp 2 tình huống | Quản trị nội dung | UX friction removal | 3 | 2 | 3 | 1 | **18** | Không | No external service required | Không | — | P2 | Không |
| G9b | Commit lockfile để cài đặt tái lập | `package-lock.json` bị ignore | Toàn bộ | Technical foundation | 3 | 2 | 4 | 2 | **12** | Không | No external service required | Không | — | P2 | Không |
| G10 | Một nguồn version duy nhất | `package.json` 1.10.0 vs Worker 1.17.1 vs README 1.16.1 | Vận hành/deploy | Technical foundation | 2 | 3 | 5 | 1 | **30** | Không | No external service required | Không | — | P3 | Không |
| G5 | Đo lường hành vi tối thiểu (đếm phía Worker, không PII) | Không biết điểm rơi | Toàn bộ | Experiment | 3 | 3 | 2 | 2 | **9** | Có thể (Cloudflare Web Analytics) | Unknown — verification needed cho Web Analytics; đếm Worker là No external service required | Thấp | Đếm trong Worker | P3 | **Có** — quyết định về dữ liệu người dùng |
| G8 | Quyết định về `/data/book/*.json` công khai | Toàn văn (kể cả bộ 18+) tải được trực tiếp | Vận hành, pháp lý | Security/Policy | 4 | 2 | 3 | 2 | **12** | Không | No external service required | Không | Chặn theo danh sách bộ nhạy cảm | P2 | **Có — NEEDS OWNER INPUT** |
| D1 | Gom 30 báo cáo `.md` ở gốc vào `docs/reports/` | Gốc repo bừa; `_redirects` phải thêm luật mỗi lần | Đội phát triển | Technical foundation | 2 | 2 | 4 | 2 | **8** | Không | No external service required | Không | — | P3 | Có (đổi URL tài liệu) |
| D2 | Nâng cấp Tiptap 2 → 3 (vá 25 cảnh báo moderate) | Advisory `GHSA-cp6q-959q-f8rh` trong bundle admin | Quản trị | Security | 3 | 1 | 4 | 3 | **4** | Không | No external service required | Không | Ghim bản 2 + cảnh báo nội bộ | P3 | Có — **breaking major** |
| D3 | Đo hiệu năng/khả năng truy cập admin bằng công cụ thật | Chưa có Lighthouse/a11y số liệu cho admin | Quản trị | Accessibility / Performance | 3 | 2 | 2 | 2 | **6** | Không (chạy local) | No external service required | Không | — | P3 | Không |

Thứ tự điểm không thay thế phán đoán: A1/A2 là P1 dù điểm thấp hơn G4, vì hậu quả người dùng lớn hơn.

## 2. Milestone

### Milestone A — "Đọc không gãy khi hạ tầng chập" ✅ **ĐÃ THỰC HIỆN (code + test xanh; chưa commit/deploy)**

> Trạng thái 2026-09-30: A1, A2, G4 và test hồi quy **đã xong, đã commit + push** lên nhánh `arena/01a0f122-ssochuz` và mở PR [#65](https://github.com/Chaereve/ssochuz/pull/65). `npm run check:worker`, `npm run build`, `node tools/check_src.js`, `npm test` (60/60) đều xanh.
>
> **Đã deploy thử (frontend):** Cloudflare Pages tự dựng bản xem trước từ nhánh — Deploy successful, xem ở https://76a7131b.ssochuz.pages.dev (hoặc link theo nhánh https://arena-01a0f122-ssochuz.ssochuz.pages.dev). Bản xem trước gọi Worker **production (1.17.x)**, mà CORS của Worker cho phép mọi tên miền con của `ssochuz.pages.dev` nên vẫn nối được; ô "Lượt đọc KV" trên bản xem trước sẽ hiện `—` cho tới khi deploy Worker 1.18.0.
> Việc còn lại trước khi coi là "xong ngoài đời": (a) **merge PR #65** để bản build A1 lên production; (b) **deploy Worker 1.18.0** (`cd worker && npx wrangler deploy`, hoặc dán `worker/cms.js` vào Cloudflare → Deploy) — việc này **phải làm từ tài khoản Cloudflare của owner**, sandbox không có credential nên không deploy hộ được; (c) kiểm tay 390px/1440px + bàn phím cho nhãn "đang đọc bản lưu" (sandbox không cài được Chromium).

- **Outcome người dùng:** trong mọi tình huống Worker/KV lỗi hoặc quá hạn mức, người đọc vẫn mở được chương đang đọc (từ bản lưu) và hiểu rõ vì sao nội dung có thể chậm hơn KV; chủ trang nhìn thấy mức dùng **đọc** trước khi chạm trần.
- **Scope:** A1 (dự phòng tĩnh trong trình đọc) · A2 (đếm + hiển thị lượt đọc, cảnh báo 70%) · G4 (harness xanh) · test hồi quy cho A1/A2.
- **Non-goals:** không đổi API công khai; không thêm dịch vụ; không redesign UI; không thêm telemetry người dùng; không nâng Tiptap.
- **Phụ thuộc/rủi ro:** phải giữ luật "truyện khóa mật mã/riêng tư **không** rớt về bản tĩnh" (`CZ.book()`); bản tĩnh có thể cũ hơn KV → bắt buộc có nhãn "bản lưu"; A2 phải không phát sinh lượt ghi KV mới (đếm trong RAM, hợp nhất khi ghi `stats` sẵn có).
- **Acceptance criteria (tóm tắt):** (1) khi `/chapter/<n>` trả lỗi liên tục và có bản tĩnh, người đọc thấy nội dung chương + nhãn bản lưu + nút thử lại; (2) bộ khóa/riêng tư không bao giờ lộ bản tĩnh; (3) `npm test` xanh toàn bộ; (4) `/api/health` hoặc `/api/admin/kv` trả số lượt đọc ước lượng và admin hiện nó.
- **Test/release:** `npm test` + chạy tay 3 kịch bản (mạng chặn Worker, 5xx, chặn đọc KV giả) + smoke trên `tools/dev_server.py`; release theo cách hiện có (commit → deploy Pages; Worker deploy thủ công `npx wrangler deploy`).
- **Rollback:** mỗi thay đổi một commit; A1 nằm trong `src/cz-story.js` (rollback = revert commit rồi `npm run build`); A2 nằm trong `worker/cms.js` + admin (rollback = deploy bản Worker trước; Worker cũ vẫn tương thích vì chỉ thêm route/field).
- **Size:** **S–M**. **Free-tier compliance:** không dịch vụ mới, không lượt ghi KV mới, không billing.
- **Approval checkpoint:** owner duyệt blueprint A1 (`docs/features/reader-fallback-khi-worker-loi.md`) và A2 trước khi code.

### Milestone B — "Nhìn thấy sự thật về dữ liệu và vận hành"

- **Outcome:** chủ trang biết ngay khi một phần hệ thống đang chạy ở chế độ dự phòng; biên tập viên không nhầm "lỗi tải" với "bộ rỗng"; thẻ chia sẻ luôn đúng.
- **Scope:** G3 · G6 · G7 (mirror bìa) · G9a (CI) · G9b (lockfile) · quyết định G8.
- **Non-goals:** không đổi cấu trúc dữ liệu; không thêm analytics.
- **Size:** S–M. **Owner approval:** có (G7 đổi nguồn ảnh, G8 là quyết định nội dung/pháp lý).
- **Tiến độ (2026-09-30):** G9b xong (lockfile đã commit) · G9a xong (`.github/workflows/ci.yml`) · **G8 đã quyết: GIỮ `/data/book/*.json` công khai như hiện tại** (owner chọn; đây cũng là bản lưu tĩnh mà A1 dùng khi Worker/KV lỗi) — đừng mở lại · G7: đã có kế hoạch, chờ owner duyệt rủi ro egress (`docs/features/g7-mirror-bia-ke-hoach.md`) · **G3 xong**: khung soạn chương tách tải lỗi (role=alert + Thử lại) khỏi bộ chưa có dữ liệu (404); sửa kèm nút "Đọc dữ liệu chương" không làm gì (thiếu `onLoad`) và mở 1 bộ bắn 3 GET `/api/book` (nay 1) — `tests/t_admin_chapter_state.js` · **G6 xong**: `tools/check_og.mjs` trong `npm test` (sinh lại OG vào thư mục tạm rồi so byte); lần chạy đầu bắt được `co-vo-ho-anh-cua-toi` lệch mô tả ⇒ đã `npm run og`. · **G3b xong** (phát hiện khi làm G3, lỗi có từ trước): `getBook` nuốt mọi lỗi tải thành `null` ⇒ (1) **quét toàn vẹn → Sửa "Thiếu book" ghi đè bộ RỖNG lên bộ đang có chương** (mất dữ liệu, không hỏi lại); (2) đổi slug ⇒ registry sang slug mới, chương mồ côi dưới `book:<cũ>`; (3) nhân bản ⇒ bản sao rỗng. Nay `getBook` ném lỗi khi tải hỏng (404 vẫn `null`), quét ghi dòng "Không đọc được book (lỗi tải)" không tự sửa, và Sửa "Thiếu book" đọc lại Worker, chỉ ghi khi đúng 404 — `tests/t_admin_book_integrity.js` (mutation test 3/3 đỏ đúng chỗ). **Milestone B: còn G7 chờ owner.** Lưu ý ngân sách: `admin.js` 509,6/520 KB (`t_admin_budget.js`).

### Milestone C — "Chất lượng và khả năng truy cập đo được"

- **Outcome:** có số liệu Lighthouse/a11y cho các trang chính và admin; bàn phím đi hết được luồng soạn chương; test trình duyệt thật trở thành tuỳ chọn chạy được ở máy dev.
- **Scope:** D3 · bổ sung kiểm tra bàn phím cho editor · script đo bundle size (`npm run build` in ra bảng đã có — thêm ngưỡng cảnh báo).
- **Non-goals:** không thêm dịch vụ đo từ xa.
- **Size:** M.

### Milestone D — "Nền móng dài hạn"

- **Outcome:** giảm nợ kỹ thuật: version thống nhất (G10), tài liệu gom về `docs/` (D1), quyết định nâng Tiptap 3 (D2) có kế hoạch rollback.
- **Size:** M. **Owner approval:** có với D2 (breaking).

## 3. Deferred / requires budget or owner decision

| Item | Free-tier status | Vì sao chưa làm | Cần gì để mở khoá |
| --- | --- | --- | --- |
| Analytics hành vi (funnel, drop-off) bằng Cloudflare Web Analytics | `Unknown — verification needed` (phải xác minh điều khoản + không thẻ + không auto-upgrade) | Chạm dữ liệu người dùng; cần owner quyết định | Owner duyệt; khi đó viết báo cáo xác minh free tier riêng và phương án thay thế (đếm phía Worker) |
| Tìm kiếm toàn văn | `Not feasible at $0` nếu dùng hosted search | 63 bộ, duyệt client đủ nhanh | Chỉ làm nếu owner muốn; phương án $0: thêm trường từ khoá vào registry |
| Nâng cấp Tiptap lên v3 | `No external service required` nhưng là breaking major | Rủi ro hồi quy editor | Owner duyệt + kế hoạch test thủ công admin |
| Nâng cấp Cloudflare Workers Paid ($5/tháng) để tăng hạn mức | `Paid / approval required` | Vi phạm ngân sách $0 | Chỉ khi vượt trần thật và owner chấp thuận chi phí |
| Chuyển sang R2 (10 GB free) cho overflow ảnh/chương | `Confirmed free and suitable` (đã ghi trong `wrangler.toml`, đang comment) | Không cần khi Supabase còn dư | Owner bật khi Supabase gần 1 GB |
| Email thông báo thành kênh bắt buộc | `Unknown — verification needed` (Resend free/FormSubmit chưa xác minh SLA) | Hiện đang là tuỳ chọn, không chặn luồng | Giữ tuỳ chọn; chỉ nâng cấp nếu owner muốn |

## 4. Những gì **không** nằm trong roadmap này

- Đổi framework/router/backend/database/hosting (ngoài phạm vi cho phép).
- Redesign nhận diện thương hiệu.
- Feature AI, OCR, dịch máy, tóm tắt tự động (chi phí + quyền nội dung).
- Thanh toán/quảng cáo.
