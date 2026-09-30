# Feature blueprint — A2: Ngân sách & hiển thị lượt đọc KV

- Trạng thái: **ĐÃ THỰC HIỆN (Milestone A)** — code + test xanh; **chưa deploy Worker** (chờ owner)
- Gap: G2 · Milestone: A · Ưu tiên: P1 · Size: S–M
- Tệp liên quan: `src/shared/kv-budget.js`, `worker/cms.js`, `src/admin/quota.js`, `src/admin/components/Overview.jsx`, `src/admin/components/Layout.jsx`, `tests/t_kv_quota.mjs`

## Kết quả thực hiện (so với blueprint)

| Hạng mục | Blueprint | Thực tế đã làm |
| --- | --- | --- |
| Cách đếm | "đếm tại từng điểm đọc chính (registry/book/stats/comments) — khi implement phải rà hết các điểm để không đếm sót" | Bọc **binding `env.CZ_KV` bằng `Proxy` một lần cho mỗi request** (`meteredEnv()` đầu `handler.fetch` + `scheduled`): chỉ `get`/`getWithMetadata` tính lượt, `put`/`delete`/`list` đi thẳng. Nhờ vậy **mọi** đường đọc hiện có (registry, book, toc, chapter, stats, comments, feed, health, overflow/Supabase) đều được đếm mà không phải sửa từng hàm, và code thêm sau này cũng tự được đếm |
| Bộ đếm | theo ngày UTC | `noteKvRead()` trong RAM isolate, tự về 0 khi sang ngày UTC (không cron); `readBudget()` cho ghi đè bằng biến `KV_READ_BUDGET` (chặn trên 10.000.000) |
| Payload | `/api/admin/kv` thêm `readsToday/readBudget/readWarn/readSource`, `/api/health` thêm `stats.readsToday` | Đúng, thêm cả `readCritical` (≥ 90%). Lưu ý: blueprint tự mâu thuẫn — phần "Bảo mật" nói không lộ ra API công khai, phần "Payload" lại yêu cầu thêm vào `/api/health` (endpoint công khai). Đã theo phần Payload, **đồng nhất với `writesToday` vốn đã công khai ở `/api/health` từ trước**; số này là ước lượng, không phải dữ liệu người dùng |
| Admin | pill quota + tab Tổng quan | Pill `v2quota` có badge "đọc Nk" khi ≥ 70% + title nêu mức đọc; tab Tổng quan có tile "Lượt đọc KV hôm nay" và dòng SystemRow; Worker cũ (không có trường) → hiện `—`, **không hiện 0 giả** |
| Tự hạ tải (mục 4) | Mặc định tắt, chờ owner | **Không làm** — giữ đúng quyết định "mặc định tắt"; muốn bật thì mở ticket riêng |
| AC6 (bắt lỗi `kv_read_quota`) | "nếu phân loại được" | **Không làm**: Cloudflare trả lỗi chung khi KV hết hạn mức, Worker không có cách phân biệt chắc chắn ⇒ không bịa mã lỗi mới. A1 đã lo phần "đọc được tiếp" khi KV lỗi |

Bằng chứng kiểm thử:

- `tests/t_kv_quota.mjs` thêm **nhóm E (14 mục)** khoá 3 điều: (E1) bộ đếm cộng dồn, sang ngày UTC về 0, ngưỡng 70%/90%, trần mặc định 100.000 và chặn giá trị cấu hình sai; (E2) Worker đếm **thật** — `/api/health` và `/api/admin/kv` trả số tăng sau các lượt gọi có chạm KV, `/api/admin/kv` vẫn đòi `ADMIN_KEY`, `readSource = 'worker-estimate'`; (E3) **đếm lượt đọc không sinh lượt ghi KV nào** (đúng ràng buộc "không đốt thứ đang thiếu").
- `tests/t_admin_features.js` thêm **6 mục** cho phần hiển thị ở admin: tile "Lượt đọc KV hôm nay" có số Worker trả, tile định dạng số đúng, pill quota có badge "đọc 71k" khi ≥ 70%, pill mang class `warning`, `title` của pill nêu mức đọc + trần 100.000, dòng hệ thống nói rõ "ước lượng".
- `tests/t_admin_online.js` thêm **2 mục** canh cổng cho luật "không hiện 0 giả": khi Worker cũ không trả `readsToday`, tile phải hiện `—` kèm "Worker chưa trả readsToday".
- Đã phát hiện và sửa một lỗi trong lúc làm: `kvAudit` (`/api/admin/kv`) **chưa** trả các trường đọc ở lần code đầu — test E2 bắt được (`admin/kv trả readsToday + trần đọc` đỏ) trước khi báo cáo.
- Giới hạn đã biết: số là **ước lượng trong RAM isolate** (nhiều isolate thì mỗi isolate đếm riêng) ⇒ luôn **≤** số thật trên dashboard Cloudflare; đây là số để *nhìn*, không phải để *chặn cứng*.

## Feature statement

> Cho phép **chủ trang** **nhìn thấy mức dùng lượt ĐỌC KV (ước lượng) và được cảnh báo trước khi chạm trần 100.000/ngày**, bằng cách **đếm tại Worker và trả về `/api/admin/kv` + `/api/health`**, để đạt **không đánh sập đường đọc vì hết hạn mức**.

## Problem statement

- **Vấn đề:** hạn mức miễn phí KV là **100.000 lượt đọc/ngày**; vượt là lỗi. Trong khi phần **ghi** đã được ngân sách hoá rất kỹ (`src/shared/kv-budget.js`, `STATS_WRITE_BUDGET`), phần **đọc** không có gì: không đếm, không hiển thị, không cảnh báo.
- **Bằng chứng:** `src/admin/quota.js` chỉ có `writesToday/limit`; `worker/cms.js` `/api/admin/kv` trả `writesToday`; không có biến nào theo dõi đọc. Sự cố quota ghi (thư 90% của Cloudflare) đã từng xảy ra và đã có báo cáo riêng (`BAO-CAO-TIET-KIEM-KV.md`) — đọc chưa có "bảo hiểm" tương tự.
- **Hậu quả:** chủ trang chỉ biết khi người đọc báo lỗi; không có dữ liệu để quyết định (ví dụ tăng cache, giảm preload, hoặc chấp nhận).
- **Vì sao chưa đủ:** dashboard Cloudflare có số liệu, nhưng phải mở ngoài web và không gắn với ngữ cảnh quota ghi trong admin.

## Scope

### In scope

1. **Đếm tại Worker (RAM, không thêm lượt ghi KV):** bộ đếm `readsByDay` theo `UTC day` cho các route đọc KV thật (`/api/registry`, `/api/book/*`, `/api/stats`, `/api/comments/*`, `/api/feed`…). Đếm ở **mỗi lần thực sự đọc KV**, không đếm request (request có thể được phục vụ từ cache biên).
2. Trả về: `/api/admin/kv` thêm `readsToday`, `readBudget` (mặc định 100.000), `readWarn` (bool ≥ 70%), `readSource: 'worker-estimate'`; `/api/health` thêm `stats.readsToday`.
3. Admin: ô "quota" hiện tại (`src/admin/quota.js`) hiển thị thêm dòng đọc; màu cảnh báo ở 70%/90%; tab Tổng quan thêm 1 dòng "Đọc KV hôm nay".
4. **Tự hạ tải khi gần trần (tùy chọn, owner quyết):** khi `readsToday ≥ 90%`, `/toc` và `/chapter/<n>` trả header `x-cz-degraded: 1` để web biết mà **không preload chương kế** (giảm ~2 lượt đọc/người). Mặc định: **tắt** trong phiên bản đầu.
5. Test: `tests/t_kv_quota.mjs` thêm nhóm kiểm tra (đếm đúng khi đọc KV, không đếm khi phục vụ từ cache, số âm/trôi ngày UTC, ngưỡng cảnh báo).

### Out of scope

- Không dùng Cloudflare Analytics GraphQL API (cần token mới — tránh thêm secret và phụ thuộc).
- Không gửi email/thông báo ngoài web.
- Không chặn cứng người đọc khi chạm trần (đó là hành vi của chính nền tảng KV — xem A1 để hạ cấp mềm).

### Dependencies

- `src/shared/kv-budget.js` đã có khuôn mẫu ngân sách theo ngày UTC → tái sử dụng, không tạo module mới.
- `worker/cms.js` có sẵn `/api/admin/kv`, `/api/health`, `logAct`.
- Owner: xác nhận có muốn nhánh tự hạ tải (mục 4) hay không.

## User stories và acceptance criteria

```text
Là chủ trang,
tôi muốn biết hôm nay web đã đọc KV bao nhiêu phần trăm hạn mức,
để tôi có thể xử lý trước khi người đọc gặp lỗi.
```

| # | Given | When | Then |
| --- | --- | --- | --- |
| AC1 | Worker vừa đọc KV 1 lần cho `/api/book/x/toc` | Gọi `/api/admin/kv` | `readsToday` tăng đúng 1 |
| AC2 | Request được phục vụ từ cache biên (không chạm KV) | Gọi lại route đó | `readsToday` **không** tăng |
| AC3 | `readsToday = 0` lúc nửa đêm UTC | Qua 00:00 UTC | Bộ đếm về 0 (không cần cron) |
| AC4 | `readsToday ≥ 70%` | Mở `/admin` | Pill quota có cảnh báo; tab Tổng quan hiện dòng đọc |
| AC5 | Nhiều isolate cùng chạy | Xem số | Chấp nhận sai số (ghi rõ `worker-estimate` trong payload + UI copy "ước lượng") |
| AC6 | KV lỗi vì hết hạn mức | Gọi `/api/book/x/chapter/1` | Trả lỗi có `error: 'kv_read_quota'` (nếu phân loại được) để A1 hạ cấp mềm |
| AC7 | Không có KV binding (dev) | Gọi `/api/health` | Không lỗi; trường đọc là 0 và có ghi chú |

## UX specification

- **Vị trí:** pill quota hiện có ở sidebar/tab Tổng quan (không thêm khối mới).
- **Copy:** "Đọc KV hôm nay: 12.4k/100k (12%) · ước lượng". Khi ≥70%: chữ màu cảnh báo + tooltip "Nên giảm tải: tạm tắt preload chương kế hoặc chờ reset 00:00 UTC".
- **Trạng thái:** `unknown` khi Worker cũ chưa trả trường (ẩn dòng, không hiện 0 giả) — nhất quán nguyên tắc "không bịa số".
- **Accessibility:** dòng chữ thường, không dựa vào màu đơn thuần (kèm chữ "cảnh báo").

## Technical design

- **Worker:** mở rộng module ngân sách dùng chung (`src/shared/kv-budget.js`) bằng `dayKeyUTC()` sẵn có; thêm `readsToday` vào object trả `/api/admin/kv` và `stats` của `/api/health`. Đếm ở hàm bọc KV (`kvGet`) nếu có, hoặc tại từng điểm đọc chính (registry/book/stats/comments) — khi implement phải rà hết các điểm để không đếm sót.
- **Không thêm lượt ghi KV**: bộ đếm sống trong RAM isolate; số liệu "chính thức" vẫn nằm ở dashboard Cloudflare.
- **Tương thích ngược:** client cũ không đọc trường mới → không vỡ; Worker cũ không có trường → admin ẩn dòng.
- **Hiệu năng:** thêm ~1 phép tăng số nguyên mỗi lượt đọc; không thêm I/O.
- **Bảo mật:** số liệu nằm sau `ADMIN_KEY` (như `/api/admin/kv` hiện tại); không lộ ra API công khai.
- **Test plan:** `tests/t_kv_quota.mjs` (KV giả có đếm `get`); thêm test cho ngưỡng và reset ngày; giữ toàn bộ test cũ xanh.
- **Rollback:** đổi trong `worker/cms.js` + `src/shared/kv-budget.js`; rollback = deploy Worker bản trước (client không phụ thuộc trường mới).

## Alternatives and decision

| Option | Benefits | Drawbacks | Complexity | Recommendation |
| --- | --- | --- | --- | --- |
| **A. Đếm tại Worker (đề xuất)** | 0 lượt ghi KV, hiện ngay trong admin, không cần secret mới | Chỉ là ước lượng theo isolate; không phải số của Cloudflare | Thấp | **Chọn** |
| B. Cloudflare GraphQL Analytics API | Số chính xác theo tài khoản | Cần API token mới (thêm secret), thêm phụ thuộc + quota riêng | Trung bình | Deferred |
| C. Ghi bộ đếm vào KV | Chính xác hơn giữa các isolate | Tốn lượt **ghi** KV — đúng thứ đang thiếu hụt (1.000/ngày) | Thấp | Không chọn |
| D. Chỉ dựa dashboard Cloudflare | Không sửa gì | Không gắn với UI, dễ quên | Rất thấp | Không đủ |

## Free-tier feasibility

| Concern | Assessment | Evidence / assumption | Mitigation |
| --- | --- | --- | --- |
| New paid dependency required? | No | Chỉ sửa Worker hiện có | — |
| Requires credit card? | No | Không thêm dịch vụ | — |
| Auto-billing risk? | No | Không bật billing | — |
| Free-tier quota sufficient? | Yes | Bộ đếm trong RAM, không I/O mới | — |
| Risk of quota exhaustion | Low | Bản thân tính năng là để giảm rủi ro này | Cảnh báo 70%/90% |
| Data/storage growth risk | Low | Không lưu dữ liệu người dùng | Chỉ số nguyên theo ngày |
| Bandwidth/compute risk | Low | < 1 µs CPU/lượt đọc | — |
| Free fallback available? | Yes | Dashboard Cloudflare (miễn phí) | Ghi trong docs vận hành |
| Works locally without paid API? | Yes | Test chạy trên KV giả | — |
| Owner approval required? | **Yes** | Chạm Worker + thêm field công khai trong `/api/health`; mục 4 (tự hạ tải) đổi hành vi đọc | Chỉ làm sau khi owner chốt mục 4 |
