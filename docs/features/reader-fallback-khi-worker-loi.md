# Feature blueprint — A1: Đọc bản lưu khi chương không tải được

- Trạng thái: **ĐÃ THỰC HIỆN (Milestone A)** — code + test hồi quy xanh; chưa commit/deploy (chờ owner)
- Gap: G1 · Milestone: A · Ưu tiên: P1 · Size: S
- Tệp liên quan: `src/cz-story.js`, `src/cz.css`, `cz-story.js` + `cz.css` (bản build ở gốc), `tests/t_chapter_light.mjs`, `tests/run.js`

## Kết quả thực hiện (so với blueprint)

Đã code đúng phạm vi, thêm 3 sai lệch so với bản đề xuất — đều là **siết chặt hơn**, không nới lỏng:

| # | Blueprint | Thực tế đã làm | Vì sao |
| --- | --- | --- | --- |
| D1 | Chặn theo TỪNG chương: `status==='scheduled' && chưa tới mốc` | Chặn theo BỘ: bộ có `pending > 0` thì **không dùng bản lưu cho bất kỳ chương nào** | Bản lưu `data/book/*.json` **không mang** trường `status`/`at` (đã đếm: 0/1.216 chương trong `data/book/*.json` có 2 trường này) ⇒ không thể biết chương nào chưa tới mốc. Thà báo lỗi còn hơn lộ chương chưa ra |
| D2 | `fetch` bản lưu có timeout | Không thêm timeout, dựa vào timeout mạng của trình duyệt | Thêm `AbortController` là code chết nếu không có test đo được; bấm "Thử kết nối lại" đã thoát khỏi trạng thái treo |
| D3 | Nhãn nằm ngay trên tiêu đề trong `#rdText` | Nhãn nằm trong `#rdMeta` (hàng metadata dưới tiêu đề) | `#rdText` là HTML chương đã sanitize — chèn UI vào đó sẽ bị `cleanHTML()` xử lý lại. `#rdMeta` cùng vùng nhìn, không đụng nội dung chương |

Bằng chứng kiểm thử (đo trên máy, không phải suy đoán):

- `tests/t_chapter_light.mjs`: **51/51 mục đạt** — thêm 22 mục cho A1, 29 mục cũ vẫn xanh.
- **Test hồi quy chứng minh có sửa mới xanh:** tạm đặt lại `cz-story.js` bản HEAD rồi chạy → **8 mục đỏ** đúng các hành vi A1 (nội dung bản lưu, nhãn, nút nối lại, chỉ tải 1 tệp/bộ, tiêu đề theo bản lưu, nối lại lấy bản KV); khôi phục bản mới → xanh lại 51/51.
- Các mục 7 / 7b / 8 là **test canh cổng** cho 3 luật cấm (khoá mật mã chưa mở, khoá mật mã đang mở bằng token, bộ đang hẹn giờ): chúng xanh **cả trước và sau** khi sửa — đó là mục đích (khoá hành vi cấm để lần sau không ai vô tình nới).
- `npm run build` + `node tools/check_src.js` + `npm test` xanh toàn bộ (bảng tổng ở `docs/engineering-baseline.md` §3).
- **Chưa kiểm được:** trình duyệt thật (390px/1440px, bàn phím) — môi trường này không cài được Chromium (`npx playwright install chromium` lỗi `ECONNRESET`). Phần này ghi là **chưa kiểm**, không tuyên bố là đã kiểm.

## Feature statement

> Cho phép **độc giả (kể cả khách)** **vẫn đọc được chương đang mở** khi **Worker/KV tạm lỗi hoặc hết hạn mức đọc**, bằng cách **hạ cấp sang bản lưu tĩnh trong repo và nói rõ đang đọc bản lưu**, để đạt **không bị ngắt mạch truyện**.

## Problem statement

- **Vấn đề người dùng:** bấm chương, thấy "Không tải được Chương N. Có thể mạng đang chập hoặc máy chủ bận." + nút "Thử lại"; bấm bao nhiêu lần cũng lỗi nếu nguyên nhân là phía Worker (`src/cz-story.js` `ensureChapter()` → `fail = true` → `paintChapterFail()`), trong khi bản lưu tĩnh `/data/book/<slug>.json` vẫn nằm trong repo và vẫn tải được từ Pages.
- **Bằng chứng:**
  - Đường nhẹ `CZ.chapter()` trả `null` khi không `ok` và **không** có nhánh dự phòng (`src/cz-app.js`, `lightFetch`/`chapter`).
  - Đường cũ `CZ.book()` **có** dự phòng: khi Worker không trả được thì `jget('/data/book/<slug>.json')` (`src/cz-app.js` ~dòng 239). Đường nhẹ mất tính chất này.
  - KV free tier: 100.000 lượt đọc/ngày, "vượt ⇒ thao tác lỗi" (`docs/free-tier-verification.md` §1) — không có cảnh báo trong code.
  - Repo đã từng có 2 sự cố thật làm mất đường đọc (mất biến `SUPABASE_URL`; đốt quota ghi) — xem `BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md`, `BAO-CAO-TIET-KIEM-KV.md`.
- **Hậu quả nếu không giải quyết:** mỗi lần Worker/KV quá tải, người đọc thấy web "hỏng" dù bản dự phòng miễn phí đã có sẵn; lượt đọc và niềm tin mất, mà chủ trang không có tín hiệu nào trên UI.
- **Vì sao giải pháp hiện tại chưa đủ:** nút "Thử lại" chỉ lặp lại đúng lời gọi đang lỗi; không phân biệt lỗi tạm thời với lỗi kéo dài; không tận dụng bản tĩnh.

## Scope

### In scope

1. Khi `CZ.chapter(slug, n)` thất bại **và** bộ không thuộc diện "khóa mật mã/riêng tư", thử lấy chương tương ứng từ `/data/book/<slug>.json` **một lần cho mỗi bộ trong phiên** (không lặp lại cho từng chương).
2. Nếu bản tĩnh có chương đó: hiển thị nội dung bình thường + **dải nhãn nhỏ** "Đang đọc bản lưu · nội dung có thể chậm hơn bản mới" kèm nút "Thử kết nối lại" (không chặn đọc).
3. Nếu bản tĩnh không có (bộ mới chỉ nằm trên KV): giữ nguyên trạng thái lỗi hiện tại, nhưng copy nói rõ hai khả năng (mạng/ máy chủ) và nút thử lại — như hiện nay.
4. Giữ nguyên: truyện khóa mật mã và truyện riêng tư **không bao giờ** đọc từ bản tĩnh (luật đã có trong `CZ.book()`), chương hẹn giờ chưa tới mốc không được lộ.
5. Bản lưu được ghi nhớ theo bộ trong phiên (RAM). Không ghi localStorage (tránh phình dung lượng).

### Out of scope

- Không đổi API Worker, không thêm route.
- Không đổi cơ chế cache SW (`sw.js`).
- Không thêm chỉ báo dự phòng toàn cục ở header (việc này đụng quyết định "fallback im lặng" của owner — xem `src/cz-app.js` `paintFallback()`); nếu owner muốn, tách ticket riêng.
- Không thêm telemetry.

### Dependencies

- Dữ liệu: `/data/book/<slug>.json` phải tồn tại và đúng định dạng `{ chapters: [{t, html}] }` — có (63 tệp), và workflow `sync-kv-to-repo` cập nhật định kỳ.
- Quyết định owner: nhãn "bản lưu" hiển thị ở đâu (đầu chương hay thanh trên cùng của trang đọc).

## User stories và acceptance criteria

```text
Là độc giả đang đọc dở một bộ,
tôi muốn chương vẫn hiện ra khi máy chủ dữ liệu gặp sự cố,
để tôi có thể tiếp tục đọc mà không phải chờ.
```

| # | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | Bộ công khai có bản tĩnh; `/chapter/<n>` trả lỗi (5xx/mạng/quota) | Người đọc mở chương `n` | Nội dung chương `n` (bản tĩnh) hiển thị; có nhãn "Đang đọc bản lưu"; nút "Thử kết nối lại" hoạt động và khi Worker trở lại thì nạp bản mới |
| AC2 | Bộ công khai **không** có bản tĩnh (mới tạo trên KV) | Mở chương | Trạng thái lỗi hiện có + nút "Thử lại" (không được trắng trang) |
| AC3 | Bộ khóa mật mã hoặc `private-*` | Mở chương khi chưa mở khóa | Không gọi `/data/book/*`; vẫn là chốt mật mã / thông báo riêng tư |
| AC4 | Chương hẹn giờ chưa tới mốc | Mở chương đó | Không hiển thị nội dung (kể cả từ bản tĩnh) — giữ đúng hành vi ẩn chương hẹn giờ |
| AC5 | Bản tĩnh đã tải một lần trong phiên | Chuyển sang chương khác cũng lỗi | Dùng lại bản tĩnh trong RAM, không tải lại 439 KB mỗi chương |
| AC6 | Đang đọc bản lưu | Bấm "Thử kết nối lại" và Worker đã hồi phục | Nội dung đổi sang bản KV, nhãn biến mất, số chương/tiêu đề cập nhật |
| AC7 | Không có Worker (chế độ tĩnh, `CZ_API=''`) | Mở trang đọc | Hành vi hiện tại không đổi (đường cũ vẫn chạy) |
| AC8 | Mobile 390px và bàn phím | Đọc bản lưu | Nhãn không che nội dung; nút có `role="status"`/`aria-live="polite"` cho thông báo, focus không nhảy |

## UX specification

- **Entry point:** không đổi (trang đọc hiện tại).
- **Trạng thái:** `loading` (đang có: `paintChapterWait`), `error` (đang có: `paintChapterFail`), **mới**: `served-from-snapshot` — nội dung + nhãn.
- **Nhãn:** dải nhỏ ngay trên tiêu đề chương trong `#rdText` (không phải toast, không phải modal): biểu tượng `database`, chữ "Đang đọc bản lưu — nội dung có thể chậm hơn bản mới nhất", nút `Thử kết nối lại` cỡ nhỏ.
- **Microcopy:** tránh từ kỹ thuật ("Worker", "KV"). Dùng "bản lưu", "bản mới nhất".
- **Không** hiện nhãn khi đọc bản KV (mặc định).
- **Accessibility:** nhãn là `role="status"` (không cướp focus); nút có nhãn rõ; độ tương phản theo token màu hiện có trong `cz.css`; `prefers-reduced-motion` không ảnh hưởng vì không thêm animation.
- **Mobile:** nhãn xuống dòng, không đẩy thanh điều hướng chương ra khỏi màn hình.

## Technical design

- **Điểm sửa chính:** `src/cz-story.js`
  - `ensureChapter(pos, cb)`: khi `r` không hợp lệ → thay vì `c.fail = true` ngay, gọi `snapshotChapter(pos)`; chỉ đặt `fail` nếu cả hai đường đều thất bại.
  - Thêm `snapshotChapter(pos)` + cache `snapshotBook` (Promise theo slug trong phiên) đọc `/data/book/<slug>.json` qua `fetch` với timeout; **không** dùng localStorage.
  - Điều kiện chặn: `SLUG.startsWith('private-')`, `meta.locked`, hoặc chương có `status==='scheduled' && chưa tới mốc` (dùng `src/shared/schedule.js` đã có logic `isChapterPending`).
- **API contract:** không đổi. Bản tĩnh là tài liệu công khai sẵn có.
- **State mới:** `c.src = 'kv' | 'snapshot'` để `paintChapter()` vẽ nhãn; `snapshotLoaded[slug]` giữ `{chapters}` hoặc `'missing'`.
- **Error handling:** bản tĩnh 404/JSON hỏng → coi như "không có bản lưu" → giữ trạng thái lỗi cũ.
- **Performance:** tải bản tĩnh 1 lần/bộ/phiên chỉ khi đã lỗi; không ảnh hưởng đường đọc bình thường (0 request thêm). Kích thước TB 439 KB, lớn nhất 1,87 MB — chỉ chấp nhận khi đã lỗi.
- **Security:** không thay đổi CSP; không thêm host; vẫn `esc()` khi chèn `t`/`html` như hiện có (bản tĩnh đã sanitize từ Worker trước khi ghi).
- **Backward compatibility:** Worker cũ/không có Worker vẫn chạy; nhánh mới chỉ kích hoạt khi lỗi.
- **Test plan:** thêm mục 6 vào `tests/t_chapter_light.mjs`:
  1. `failAlways` cho `/chapter/*` + có `/data/book/light-truyen.json` → nội dung hiện + có nhãn;
  2. không có bản tĩnh → trạng thái lỗi cũ;
  3. bộ `locked: true` → không gọi `/data/book/*` (đếm request);
  4. chương scheduled chưa tới mốc → không hiện;
  5. hồi phục: cho `/chapter` chạy lại, bấm "Thử kết nối lại" → nhãn biến mất;
  6. không lỗi JS.
- **Rollback:** 1 commit trong `src/cz-story.js` + `src/cz.css`; revert + `npm run build` là xong (không đụng dữ liệu, không đụng Worker).

## Alternatives and decision

| Option | Benefits | Drawbacks | Complexity | Recommendation |
| --- | --- | --- | --- | --- |
| **A. Dự phòng tĩnh trong trình đọc (đề xuất)** | Dùng tài sản đã có; 0 chi phí; không đổi API; cứu được cả khi KV hết hạn mức | Bản lưu có thể cũ; thêm ~40 dòng + test | Thấp | **Chọn** |
| B. Để SW (`sw.js`) phục vụ `/api/book/*` từ cache khi mạng lỗi | Không cần sửa JS trang | SW đã có luật "nhường" cho ảnh; cache API có thể trả bản cũ mà người đọc không biết; khó hiển thị nhãn | Trung bình | Không chọn (rủi ro im lặng) |
| C. Worker tự trả bản tĩnh khi KV lỗi (fallback phía server) | Một chỗ xử lý | Cần Worker đọc tệp tĩnh — Worker không phục vụ asset Pages; phải nhúng dữ liệu vào bundle (nặng) hoặc thêm R2 | Cao | Không chọn giai đoạn này |
| D. Không làm gì; chỉ cải thiện copy lỗi | Rẻ nhất | Vẫn không đọc được khi hạ tầng lỗi | Rất thấp | Không đủ |

## Free-tier feasibility

| Concern | Assessment | Evidence / assumption | Mitigation |
| --- | --- | --- | --- |
| New paid dependency required? | No | Chỉ dùng `fetch` + tệp có sẵn | — |
| Requires credit card? | No | Không thêm dịch vụ | — |
| Auto-billing risk? | No | Không có billing | — |
| Free-tier quota sufficient? | Yes | Pages phục vụ tệp tĩnh không tính request vào hạn mức Worker; băng thông tĩnh không tính phí | Bản tĩnh chỉ tải khi có lỗi |
| Risk of quota exhaustion | Low | Chỉ tải khi đường KV lỗi; 1 lần/bộ/phiên | Cache trong RAM theo phiên |
| Data/storage growth risk | Low | Không thêm dữ liệu | — |
| Bandwidth/compute risk | Low | 439 KB TB/bộ, chỉ khi lỗi | Giới hạn 1 lần/bộ/phiên |
| Free fallback available? | Yes | Chính tính năng này | — |
| Works locally without paid API? | Yes | `python3 tools/dev_server.py` phục vụ `/data/*` | — |
| Owner approval required? | No (chỉ mã + test) | Không đổi dữ liệu/quyền/hạ tầng | — |

## Định nghĩa hoàn thành (cho người implement sau)

- [x] AC1–AC8 có test hoặc có ghi chú lý do không test được.
  - AC1, AC5, AC6: mục 6 của `tests/t_chapter_light.mjs` (nội dung + nhãn + 1 tệp/bộ + nút nối lại).
  - AC2: mục 8 (không có bản lưu/hẹn giờ → giữ trạng thái lỗi cũ, không trắng trang).
  - AC3: mục 7 và 7b (khoá mật mã chưa mở **và** đang mở bằng token → 0 request `/data/book/*`).
  - AC4: mục 8 — thoả bằng cách siết hơn (D1 ở bảng trên).
  - AC7: `tests/t_chapter_light.mjs` mục 1–5 + `tests/t_fallback.js` (chế độ tĩnh không đổi).
  - AC8: nhãn có `role="status"`, nút là `<button>` chuẩn (Tab tới được) — test jsdom kiểm DOM, **chưa kiểm bằng trình duyệt thật**.
- [x] `npm run build` + `npm test` xanh; `node tools/check_src.js` xanh.
- [ ] Kiểm tay 390px/1440px + bàn phím (Tab tới nút "Thử kết nối lại") — **chưa làm được trong môi trường này** (không có Chromium). Cần người chạy thử trên máy thật trước khi deploy.
- [x] Không có request `/data/book/*` nào phát sinh trong luồng đọc bình thường (đếm bằng test: mục 1–5 + 7 + 7b + 8 đều 0).
- [x] `tests/README.md`: không cần sửa (không thêm tệp test mới, chỉ thêm mục trong `t_chapter_light.mjs`).
