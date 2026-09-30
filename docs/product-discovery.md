# Product discovery — ssochuz

Phương pháp: đọc mã + dữ liệu + test + README **trước**, không sửa gì. Mọi kết luận gắn nhãn `CONFIRMED` (có bằng chứng trực tiếp), `LIKELY` (suy luận mạnh), `NEEDS OWNER INPUT` (thiếu quyết định sản phẩm/kinh doanh).

## 1. Sản phẩm là gì

### 1.1 Định nghĩa một câu

> **ssochuz library** giúp **người đọc truyện chuyển thể (novel hoá từ phim/Châu Á, tiếng Việt)** **tìm – theo dõi – đọc truyện ngay trên web, lưu tiến độ và tủ truyện của riêng mình**, bằng cách **thư viện có bộ lọc/BXH/xếp hạng + trình đọc đường nhẹ chạy được khi mạng chập (PWA)** và **một trang quản trị không cần deploy khi thêm chương**, để đạt **đọc liền mạch mọi lúc, kể cả trên điện thoại**.

Các mệnh đề `CONFIRMED` trong câu trên: bộ lọc + BXH + trình đọc (`index.html`, `src/cz-home.js`, `src/cz-story.js`); lưu tiến độ/tủ truyện (localStorage + My Space, `src/cz-space.js`); PWA/offline (`sw.js`, `tests/t_pwa.js`); quản trị sửa nội dung không cần deploy (KV là bản gốc, `worker/README.md`).

`CONFIRMED` thêm về bản chất nội dung: 63 bộ, 1.216 chương, 26 bộ gắn nhãn 18+, có trường `author`/`couple`/`year`/`status` → đây là thư viện truyện **chuyển thể/bl chuyển thể**, không phải văn học mạng tự do.

`NEEDS OWNER INPUT`:
- Sản phẩm có mục tiêu **tăng trưởng độc giả** hay chỉ là **kho đọc cá nhân/cộng đồng nhỏ**? (quyết định mức đầu tư SEO/analytics).
- Truyện trong thư viện là bản do chủ trang tự viết/biên tập hay nội dung chuyển thể từ nguồn khác? (quyết định D3 — dữ liệu công khai).

### 1.2 Ma trận vai trò người dùng

| Vai trò | Mục tiêu | Quyền / khả năng | Route·feature liên quan | Pain point hiện tại | Evidence |
| --- | --- | --- | --- | --- | --- |
| **Khách (chưa đăng nhập)** | Đọc không ma sát | Đọc mọi truyện công khai, lưu tiến độ/tủ trong máy, thả tim, đánh giá, bình luận (tên khách), báo lỗi chữ, cài PWA | `/`, `/truyen/<slug>/`, `/my-space`, `/guide` | Không có điểm nghẽn lớn; khi Worker lỗi thì chương không đọc được dù có bản tĩnh (A1) | `src/cz-story.js`, `tests/t_reader.js`, `src/cz-space.js` |
| **Độc giả đã đăng nhập** (Supabase/Google) | Cá nhân hoá | Hồ sơ, tủ riêng tư/công khai, theo dõi tác giả, thông báo, push | `/profile`, `/my-space`, chuông header | Phụ thuộc Supabase (project free có thể pause) — hiện không có thông báo rõ cho người dùng khi Auth tạm hỏng | `src/cz-auth.js`, `worker/member-spaces.js`, `src/admin` `settings.auth` |
| **Chủ trang / Super Admin** | Vận hành thư viện | Toàn quyền qua `ADMIN_KEY`: sửa bộ, chương, ảnh, trang chủ, đồng bộ Blogger, quota, backup, đổi cài đặt | `/admin` (14 tab) | (a) chỉ thấy quota **ghi**, không thấy lượt đọc; (b) trạng thái "chưa tải được chương" trùng với "chưa có chương"; (c) `npm run og` phải nhớ chạy tay | `src/admin/main.jsx`, `src/admin/utils/permissions.js`, `tools/build_og.mjs` |
| **Nhân sự theo vai trò UI** (admin/editor/moderator/author) | Chia việc | **Chỉ ẩn/hiện UI**; mọi ghi KV vẫn đòi `ADMIN_KEY` | tab tương ứng trong `/admin` | Vai trò gợi niềm tin sai nếu owner tưởng là phân quyền thật | `src/admin/RolesPanel.jsx` (cảnh báo trong UI), `worker/cms.js` (RBAC phía Worker chưa có) |
| **Bot/SEO (không phải người)** | Index & thẻ chia sẻ | Nhận HTML tĩnh có OG/JSON-LD cho từng bộ | `/truyen/<slug>/` tĩnh, `sitemap.xml` (1.280 URL, gồm từng chương), `feed.xml` | Bộ mới thêm qua admin chưa chạy `npm run og` sẽ rơi về shell "Đang tải…" | `tools/build_og.mjs`, `sitemap.xml`, `truyen/<slug>/index.html` |

### 1.3 Jobs-to-be-done

- Khi **tôi tò mò một bộ chuyển thể mà không muốn cài app**, tôi muốn **mở web, đọc vài chương và đóng tab**, để tôi có thể **quay lại đúng chương đang đọc dở** sau này. `CONFIRMED` (`CZ.progress` + "Đọc tiếp", `tests/t_mystats.js`)
- Khi **tôi đang đọc trên điện thoại ở chỗ mạng yếu**, tôi muốn **vẫn đọc được chương đang mở và chương kế**, để tôi có thể **không bị ngắt mạch truyện**. `LIKELY` — PWA + cache SW có, nhưng đường nhẹ không có bản tĩnh dự phòng (A1)
- Khi **tôi muốn theo dõi bộ mới ra chương**, tôi muốn **được báo**, để tôi có thể **đọc ngay khi có chương**. `CONFIRMED` (chuông + `/api/feed` + push tuỳ chọn)
- Khi **tôi là chủ trang và cần thêm 1 chương lúc nửa đêm**, tôi muốn **dán/soạn trên điện thoại rồi bấm Lưu**, để tôi có thể **không phải build/deploy**. `CONFIRMED` (`PUT /api/book/<slug>/chapter`, `tests/t_admin_chapter.js`)
- Khi **tôi quản lý nội dung**, tôi muốn **biết ngay hôm nay đã ghi bao nhiêu lượt KV và đọc tới đâu**, để tôi có thể **không đánh sập web vì quota**. `CONFIRMED` một nửa: có `writesToday`/`writeBudget`, **thiếu lượt đọc** (P1)

### 1.4 Audit value proposition trên màn hình đầu

| Tiêu chí | Đánh giá | Evidence |
| --- | --- | --- |
| Người mới hiểu web làm gì trong 5–10 giây? | **Đạt một phần**: hero hiển thị tên bộ, nhãn "Nổi bật hôm nay/Đề xuất cho bạn", thể loại, số chương, mô tả ngắn, 2 CTA rõ. Nhưng không có một câu định vị ("thư viện truyện chuyển thể tiếng Việt, đọc online, lưu tiến độ"). | `src/cz-home.js` `heroSlide()`, `index.html` hero |
| Người dùng biết hành động kế tiếp? | **Đạt**: "Đọc từ đầu/Đọc tiếp" + "Thông tin" + "Lưu vào tủ" là thứ tự ưu tiên tốt; có gợi ý phím tắt. | `src/cz-home.js` |
| CTA có phân cấp? | **Đạt**: 1 nút `pri lg`, các nút phụ `lg`, tủ truyện là toggle có `aria-pressed`. | như trên |
| Dấu hiệu tin cậy | **Khá**: số liệu thật từ KV, "không bịa số" khi không đọc được, có nhãn 18+, nhãn khóa mật mã, trạng thái "Hoàn thành/Đang cập nhật", RSS, ngày cập nhật. | `src/cz-app.js` (fbVal/không bịa), `tests/t_stats.js` |
| Đăng ký sớm | **Không**: đọc không cần tài khoản — đúng hướng. | `src/cz-auth.js` |
| Tải nhận thức | **Trung bình–cao** trên trang chủ: 8 khối (hero, số liệu, đọc tiếp/tủ, mới cập nhật, BXH + "Đáng xem", "ssochuz's choices", lịch ra chương, thư viện 24 bộ). Có nhiều điểm vào nhưng thứ tự hợp lý. | `index.html` |
| Copy gây mơ hồ | Nhỏ: "Ranking" (thuật ngữ tiếng Anh giữa UI Việt), "Top View/Top Vote", "ssochuz's choices"; tiêu đề tab truyện tĩnh là "Đang tải… · ssochuz library" nếu không có bản OG. | `index.html`, `truyen.html` |

## 2. Phân tích luồng lõi

### 2.1 Flow 1 — Đọc một chương (north-star action)

| Bước | User intent | UI/action hiện tại | System behavior | Friction/risk | Missing state/feature | Success signal | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Chọn truyện | Hero/thư viện/lọc/tìm | `/api/registry` → KV, cache biên; rớt về `data/registry.json` | Nếu KV trả `{lib:[]}` thì có logic tự lành | — | Trang chủ hiện bộ | `src/cz-app.js` `registry()` |
| 2 | Mở trang truyện | `/truyen/<slug>/` | `/toc` (vài KB) → dựng mục lục | Worker cũ → rớt về tải cả bộ | — | Mục lục hiện | `tests/t_chapter_light.mjs` §1 |
| 3 | Chọn chương | Bấm chương trong lưới | `/chapter/<n>` + tải trước chương kế | — | — | Nội dung hiện trong ~1 nhịp | §2 |
| 4 | Đọc | Cỡ chữ/theme, chuyển chương | Đếm lượt đọc `POST /api/view` (1 máy/1 bộ/1 ngày) | — | — | Số lượt đọc tăng | `worker/cms.js` `postView` |
| 5 | Quay lại sau | "Đọc tiếp" | Tiến độ lưu localStorage | Tiến độ **không** đồng bộ giữa thiết bị (trừ My Space/DO) | Chưa có luồng nhập/khôi phục tiến độ đa thiết bị | Mở đúng chương | `tests/t_flows.js`, `src/cz-space.js` |
| **Thất bại** | — | — | Mất mạng/Worker 5xx/quota đọc ⇒ cờ `fail` từng chương | **Không rớt được về bản tĩnh; nút "Thử lại" gọi lại đúng API đang lỗi** | Cần nhánh "đọc bản lưu" + nhãn rõ | — | `src/cz-story.js` `ensureChapter`/`paintChapterFail` |

**Giả thuyết bỏ ngang (drop-off):**
1. Quá nhiều khối trên trang chủ trước khi tới thư viện (`LIKELY`, cần dữ liệu để xác nhận).
2. Ảnh bìa từ host ngoài chậm/chặn → thẻ truyện trống trong vài giây đầu (`LIKELY`; cover host ngoài chiếm 61/63 — xem `docs/free-tier-verification.md` §2).
3. Mất mạng/quota ⇒ trang đọc "chết" thay vì hạ cấp — xác suất thấp nhưng hậu quả lớn (`CONFIRMED` về mặt mã).

**Cải thiện đòn bẩy nhất:** biến trạng thái lỗi chương thành **hạ cấp có kiểm soát** (đọc bản lưu + nhãn), vì đó là bảo hiểm cho hàng nghìn lượt đọc mà chi phí gần bằng 0.

**Gợi ý đo lường (chỉ khi owner duyệt telemetry):** đếm `chapter_view_fail` và `fallback_served` ở phía Worker (không PII) — không cần SaaS.

### 2.2 Flow 2 — Lưu và theo dõi bộ truyện

| Bước | User intent | UI/action | System behavior | Friction/risk | Missing | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Lưu vào tủ | nút "Lưu vào tủ" (toggle, `aria-pressed`) | localStorage `ssochuz-shelf`; My Space hiển thị | Khách lưu máy này, không sync | — | `tests/t_home.js`, `src/cz-space.js` |
| 2 | Theo dõi chương mới | "Theo dõi" ở trang tác giả/couple | localStorage follow + `/api/feed` + chuông | — | — | `tests/t_follow.js`, `tests/t_people_data.js` |
| 3 | Nhận thông báo | chuông header / push | `/api/notif`, `/api/schedule`, push tuỳ chọn | Push cần quyền trình duyệt; không có hướng dẫn khi bị từ chối | Copy hướng dẫn khi denied (`LIKELY`) | `tests/t_push.js`, `sw.js` |
| 4 | Đồng bộ hồ sơ | My Space → hồ sơ | Durable Object `MEMBER_SPACES` | DO free có trần request/ngày; lỗi DO hiện báo thế nào? chưa kiểm chứng trong môi trường này | — | `worker/member-spaces.js` |

### 2.3 Flow 3 — Quản trị thêm một chương

| Bước | User intent | UI/action | System behavior | Friction/risk | Missing | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Vào admin | `/admin` + dán URL Worker + `ADMIN_KEY` | `whoami` → role; lưu phiên | Nhập tay URL/key mỗi lần trên máy mới | — | `src/admin/main.jsx` `connect()` |
| 2 | Mở bộ | tab Sửa → chọn bộ | `GET /api/book/<slug>` | **Nếu tải lỗi: hiện "Chưa có dữ liệu chương trong cache" (gộp với 'bộ rỗng')** | Cần phân biệt lỗi/trống + nút thử lại nổi bật | `src/admin/components/ChapterEditor.jsx:546` |
| 3 | Soạn | TipTap, nháp 0,7 s, nhập .txt/.docx | localStorage nháp theo chương | — | — | `tests/t_admin_chapter.js`, `t_admin_docx.js` |
| 4 | Lưu | "Lưu chương" | `PUT /api/book/<slug>/chapter` (1 lượt ghi KV) | — | — | `tests/t_schedule.mjs` |
| 5 | Đăng ngay? | trạng thái published/scheduled | Chương hẹn giờ bị ẩn khỏi API công khai | — | — | `tests/t_schedule.mjs`, `tests/t_lock.mjs` |
| 6 | Cập nhật SEO/social | — | **Không tự động**: phải chạy `npm run og` | Bộ mới không có OG → thẻ chia sẻ trống | Nên có check trong `npm test` | `tools/build_og.mjs` |

### 2.4 Flow 4 — Báo lỗi chữ

Người đọc (kể cả khách) gửi báo lỗi + ảnh chụp → KV `report` (giữ 300 mục) → tab Báo lỗi trong admin; email **tuỳ chọn** (Resend hoặc FormSubmit). `CONFIRMED` (`worker/cms.js` `postReport`/`mailReport`, `tests/t_admin_features.js`). Rủi ro: nếu owner không bật email và không mở admin thì báo lỗi nằm im — không có nhịp nhắc (`LIKELY`); đây là gợi ý cho Milestone B (không tốn tiền: hiện "báo lỗi chưa xử lý" ngay tab Tổng quan, đã có).

## 3. Feature inventory và độ trưởng thành

| Feature | Vấn đề người dùng | Vai trò | Entry point | Giá trị | Maturity | Gaps | Ưu tiên | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Trình đọc đường nhẹ | Mở chương nhanh, không tốn quota | Độc giả | Trang truyện/đọc | Cao | **4 — Reliable** | Thiếu nhánh dự phòng tĩnh khi Worker lỗi (A1) | P1 | `tests/t_chapter_light.mjs` |
| Thư viện + lọc + tìm + phân trang | Tìm bộ phù hợp | Độc giả | `/` | Cao | **5 — Excellent** | — | — | `tests/t_home.js` |
| BXH + đánh giá sao | Chọn bộ đáng đọc | Độc giả | `/` | Cao | **4** | — | — | `tests/t_ranking*.js`, `t_rating*.js` |
| My Space (tiến độ/tủ/thống kê) | Không mất chỗ đang đọc | Độc giả | `/my-space` | Cao | **4** | Không đồng bộ đa thiết bị cho khách | P3 | `tests/t_space*.js` |
| Tài khoản + hồ sơ công khai | Danh tính, chia sẻ | Độc giả | `/profile` | Trung bình | **4** | Phụ thuộc Supabase free (pause) | P3 | `worker/member-spaces.js` |
| Bình luận/đánh giá/phản hồi | Cộng đồng | Cả hai | tab Đánh giá | Trung bình | **4** | — | — | `tests/t_worker.mjs` |
| Thông báo + RSS + push | Theo dõi chương mới | Độc giả | chuông, feed | Trung bình | **4** | — | — | `tests/t_notif.js`, `t_push.js` |
| PWA/offline | Đọc khi mạng chập | Độc giả | cài app | Cao | **3 — Usable** | Không đảm bảo chương chưa từng mở | P2 | `sw.js`, `tests/t_sw_img.js` |
| Admin sửa nội dung không deploy | Vận hành nhanh | Chủ trang | `/admin` | Cao | **5** | — | — | `tests/t_admin_*.js` |
| Soạn chương (TipTap, DOCX, hẹn giờ) | Nhập nội dung khối lớn | Chủ trang | tab Sửa | Cao | **5** | Trạng thái tải lỗi gộp với rỗng | P2 | `ChapterEditor.jsx`, `t_docx_content.js` |
| Kiểm duyệt + log + quota ghi | Giữ chất lượng & an toàn hạ tầng | Chủ trang | `/admin` | Trung bình | **4** | Chỉ đo **ghi**, không đo **đọc** | P1 | `src/admin/quota.js` |
| Backup/khôi phục + chặn ghi đè | Không mất dữ liệu | Chủ trang | tab Cài đặt | Cao | **4** | — | — | `t_registry_guard.mjs` |
| SEO/OG tĩnh từng bộ | Chia sẻ link đẹp, được index | Bot, độc giả | `/truyen/<slug>/` | Cao | **4** | Chạy tay, không có check | P2 | `tools/build_og.mjs` |
| Đồng bộ Blogger | Nhập chương cũ | Chủ trang | tab Đồng bộ | Trung bình | **4** | — | — | `tests/t_worker.mjs` §sync |
| Truyện khóa mật mã + riêng tư | Nội dung giới hạn | Độc giả quen | `/truyen/<slug>/` | Trung bình | **4** | — | — | `tests/t_lock*.js`, `t_private*.js` |
| Analytics hành vi | Hiểu người dùng | Chủ trang | — | Trung bình | **0 — Absent** | Không có; hiện chỉ có số liệu thô | P2 (cần owner duyệt) | `worker/cms.js` `/api/stats` |

## 4. Phân tích khoảng trống

| Gap ID | Loại gap | Ảnh hưởng | Bằng chứng | Tác động người dùng | Giải pháp đề xuất | Scope | Rủi ro | Ưu tiên |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | Thiếu chức năng (dự phòng) | Người đọc, flow đọc | `src/cz-story.js` `ensureChapter` + `paintChapterFail`; không có nhánh `/data/book/*` | Không đọc được chương dù bản lưu tồn tại | Đọc bản lưu + nhãn rõ, giữ nguyên luật truyện khóa/riêng tư | FE + test | Thấp (không đổi API) | **P1** |
| G2 | Thiếu khả năng quan sát | Chủ trang | `src/admin/quota.js` chỉ `writesToday` | Không biết khi nào chạm trần **đọc** ⇒ sập im lặng | Ước lượng lượt đọc ở Worker (in-memory/KV nhẹ) + hiện trên Overview; cảnh báo khi >70% | Worker + admin | Thấp–TB | **P1** |
| G3 | Chức năng chưa hoàn chỉnh | Chủ trang | `ChapterEditor.jsx:546` | Biên tập viên tưởng bộ rỗng, mất thời gian | Tách 3 trạng thái: đang tải / lỗi (thử lại) / rỗng thật | FE + test | Thấp | P2 |
| G4 | Khoảng trống công cụ | Đội phát triển | `npm test` đỏ ở `t_admin_features.js` | Bộ test đỏ thường trực ⇒ dễ bỏ qua lỗi mới | Bổ sung mock `/api/book/<slug>` + giữ xanh | Test | Thấp | P2 |
| G5 | Khả năng khám phá/đo lường | Chủ trang | không có telemetry | Không biết điểm rơi | Chỉ thêm khi owner duyệt; ưu tiên đếm phía Worker | — | TB (riêng tư) | P2 |
| G6 | Vận hành nội dung | Chủ trang, bot | `tools/build_og.mjs` chạy tay | Bộ mới thiếu thẻ OG/JSON-LD | Check trong `npm test`: mọi slug có `truyen/<slug>/index.html` khớp tiêu đề | Tool + test | Thấp | P2 |
| G7 | Phụ thuộc ngoài | Người đọc | 61/63 bìa hotlink host ngoài | Bìa chậm/không tải; CSP phải mở cho `sw.js` | Mirror bìa về Supabase Storage (đã có `POST /api/admin/mirror-images`) | Vận hành | Thấp | P2 |
| G8 | Rủi ro pháp lý/nội dung | Chủ trang | `_redirects` không chặn `/data/**`; `data/book/*.json` chứa toàn văn | Toàn văn có thể tải trực tiếp, kể cả bộ 18+ | **Quyết định của owner**: giữ (đường lùi offline) / chặn / chỉ chặn bộ 18+ và bộ khóa | Vận hành + `_redirects` | Cao (bản chất nội dung) | P2 — **NEEDS OWNER INPUT** |
| G9 | Chất lượng mã | Đội phát triển | `.gitignore` bỏ `package-lock.json`; không CI test | Cài đặt không tái lập, không chạy test tự động | Commit lockfile; thêm workflow `npm ci && npm test` | Hạ tầng | Thấp | P2 |
| G10 | Lệch phiên bản | Đội phát triển | `package.json` 1.10.0 vs Worker 1.17.1 | Khó đối chiếu bản deploy | 1 nguồn version + script | Tool | Thấp | P3 |

## 5. Ràng buộc đã xác nhận (để mọi đề xuất sau không vi phạm)

1. **Không deploy lại web khi sửa nội dung**: KV là bản gốc; mọi thay đổi nội dung phải qua `/admin`, không hard-code vào HTML.
2. **Bản phát hành ở thư mục gốc là sản phẩm của `npm run build`** — không sửa tay; `tools/check_src.js` canh việc này.
3. **Không có chỗ cho dữ liệu giả**: UI đã có nguyên tắc "không bịa số" (`src/cz-app.js`), phải giữ.
4. **RBAC hiện chỉ ở UI**; mọi ghi dữ liệu phải qua `ADMIN_KEY`/Worker. Không được tuyên bố "phân quyền" trong copy.
5. **Hạn mức KV ghi 1.000/ngày** là ràng buộc cứng đã có ngân sách; mọi feature mới phải nêu rõ số lượt ghi/đọc phát sinh.
6. **Truyện khóa mật mã/riêng tư không bao giờ được rớt về bản tĩnh** (sẽ lộ nội dung) — luật này có trong `CZ.book()` và phải được giữ trong mọi nhánh dự phòng mới.
