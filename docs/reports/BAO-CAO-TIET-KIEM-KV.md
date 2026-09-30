# Báo cáo: tiết kiệm hạn mức Cloudflare KV (Workers Free)

**Ngày:** 23/09/2026 · **Phiên bản Worker:** 1.15.0

---

## 1. Chuyện gì đã xảy ra

Cloudflare gửi thư: tài khoản đã dùng **90% hạn mức MIỄN PHÍ của Workers KV**, quá
mốc là mọi request tới KV trả lỗi **429** cho tới 00:00 UTC.

Gói miễn phí cho **1.000 lượt GHI + 1.000 lượt LIST + 100.000 lượt ĐỌC mỗi ngày**.
Con số 1.000 lượt GHI là con số quyết định — bản cũ tiêu hết nó **trong khoảng
1–2 giờ đầu ngày**, chỉ bằng một khoá duy nhất:

```
Bản cũ:  mỗi 10 giây ghi khoá `stats` một lần (bất kể có ai xem hay không)
         6 lượt/phút × 60 × 24 = 8.640 lượt GHI/ngày   ← gấp 8,6 lần hạn mức
```

Cộng thêm hai nguồn nữa:

| Việc | Bản cũ | Vì sao |
|---|---|---|
| Mỗi lượt xem | **1 đọc + 1 ghi** (khoá `rl:view-ip:*`) | bộ đếm chống spam ghi xuống KV từng request |
| Mỗi lượt bầu | **1 đọc + 1 ghi** × 2 khoá + 1 đọc + 1 ghi khoá `stats` | ghi lại cả kho số liệu cho từng phiếu |
| Mỗi lần đọc `/api/stats` (trượt cache biên 60 giây) | **1 lượt LIST** + đọc từng bộ | bảng xếp hạng gọi KV mỗi phút → LIST cũng chỉ có 1.000/ngày |
| Mỗi lần lưu chương/bộ | +1 ghi khoá `_last` | ghi thêm một khoá chỉ để lưu mốc thời gian |

---

## 2. Đã sửa gì (bản 1.15.0)

### a) Nhịp ghi khoá `stats` tự giãn theo ngân sách trong ngày ⭐ (lớn nhất)

`worker/cms.js` + `src/shared/kv-budget.js` (mới). Số liệu vẫn gom trong RAM,
nhưng chỉ ghi khi **thật sự đáng ghi**:

- đệm đủ **25 thay đổi** → ghi ngay (web đông, số liệu không bị trễ);
- hết giờ hẹn **30 giây** → ghi nếu có **≥ 3 thay đổi**, hoặc bản trong RAM đã giữ
  quá **10 phút**, hoặc còn "tem" hạn mức của ngày;
- **tem** = ngân sách chia đều theo 24 giờ UTC. Mặc định ngân sách **240 lượt
  ghi/ngày** cho khoá `stats` (đổi bằng biến `STATS_WRITE_BUDGET`, không cần sửa code).
- Hết ngân sách thì số nằm chờ trong RAM — **người đọc vẫn thấy đủ số** vì
  `/api/stats` luôn cộng phần đang đệm, và bảng xếp hạng vốn đã lưu ở biên 60 giây.
- Ghi hỏng (429, mạng…) → nhét lại vào đệm, **không mất số**, không làm trang đọc lỗi.
- Số lượt ghi đã dùng của ngày nằm trong chính khoá `stats` (`sw`/`swd`) nên nhiều
  isolate vẫn nhìn chung một ngân sách.

Kèm theo: mọi thao tác đọc–sửa–ghi khoá `stats` đi qua **một hàng đợi chung**, nên
lượt ghi số liệu và lượt ghi phiếu không còn đè lên nhau (đây cũng là một lỗi cũ:
hai lượt ghi chồng nhau có thể nuốt số của nhau).

### b) Chống spam không đốt hạn mức

`rateLimit()` nay giữ bộ đếm **trong RAM** của isolate:

- khoá đông người qua lại (theo IP): **người đọc bình thường tốn 0 lượt ghi** —
  chỉ khi một IP có dấu hiệu bất thường (200 lượt trở lên) mới bắt đầu ghi xuống KV;
- các khoá còn lại: **1 lượt ghi cho cả cửa sổ** thay vì 1 lượt mỗi request;
- chạm trần → từ chối luôn trong RAM, kẻ spam càng gửi càng ít tốn;
- hạn mức lượt xem theo IP nay là 1.800 lượt / **6 giờ** (cùng tốc độ chặn như
  600 lượt/giờ, nhưng một IP chỉ tốn 1 lượt ghi cho cả buổi);
- KV lỗi → **cho qua**, không chặn người đọc bình thường.

### c) Tổng đánh giá sao gộp về MỘT khoá

Bản cũ: mỗi bộ một khoá `rateagg:<slug>` → mỗi lần `/api/stats` trượt cache biên
là **1 lượt LIST + N lượt đọc**. Nay tất cả nằm trong **một khoá `rateagg`**
`{ v:1, m:1, a: { <slug>: { sum, n } } }`:

- dữ liệu cũ **tự được gộp** trong lần đọc đầu tiên (đúng 1 lượt LIST, đánh dấu `m:1`);
- bản trong RAM dùng lại 60 giây → `/api/stats` thường **không chạm KV** cho phần sao;
- chấm điểm mới = 1 lượt ghi khoá tổng (bản cũ: 1 đọc + 1 ghi khoá riêng).

### d) Bỏ hẳn khoá `_last`

Mỗi thao tác lưu trước đây ghi thêm khoá `_last` (mốc thời gian ghi gần nhất).
Nay `/api/health` đọc mốc đó **từ metadata của chính `registry`** — bớt 1 lượt ghi
cho mỗi lần lưu chương/bộ/registry/đồng bộ/nạp dữ liệu.

### e) Lưu cả chuyển hướng 302 vào cache biên

Ảnh bìa/ảnh chương nằm trên Supabase Storage thì Worker trả 302. Bản cũ **không
lưu 302 vào cache** → mỗi lượt xem một tấm bìa là một lượt đọc KV (trang chủ 60
bìa × mỗi lần mở trang). Nay 302 được lưu ở biên với TTL 1 năm (URL ảnh là bất
biến vì id tính theo nội dung).

### f) Bớt một lượt đọc/ghi cho mỗi lượt bầu

`postVote` không còn gọi `flushStats()` trước mỗi phiếu (phần lượt xem đang đệm
khác trường với phần phiếu nên đợt ghi sau vẫn cộng đủ).

### g) Nhìn được hạn mức ngay trong `/api/health`

`stats.writesToday` (số lượt ghi khoá `stats` hôm nay), `stats.writeBudget` (trần
đang đặt), `stats.buffered` (số thay đổi đang chờ ghi).

---

## 3. Đo thật — trước và sau

Chạy **đúng `worker/cms.js`** trên một KV giả có đếm thao tác, cùng một kịch bản:
250 lượt xem (50 người đọc × 5 bộ), 40 phiếu bầu, 15 đánh giá sao, 20 bình luận,
100 lần đọc bình luận, 60 lần đọc `/api/stats`, 6 lần cron.

| Nhóm việc | Bản CŨ (đang chạy) | Bản mới | Giảm |
|---|---|---|---|
| 250 lượt xem | **295 ghi** / 295 đọc | **10 ghi** / 60 đọc | **29,5×** ghi |
| 60 lần đọc `/api/stats` | 0 ghi / 60 đọc / **60 LIST** | 1 ghi / 61 đọc / **1 LIST** | **60×** list |
| 40 phiếu + 15 đánh giá | 165 ghi / 165 đọc | 106 ghi / 106 đọc | 1,6× |
| 20 bình luận + 100 lần đọc | 24 ghi / 148 đọc | 20 ghi / 128 đọc | 1,2× |
| **TỔNG** | **484 ghi / 674 đọc / 60 list** | **137 ghi / 361 đọc / 1 list** | **3,5× / 1,9× / 60×** |

Đổi ra "một lượt xem tốn bao nhiêu lượt ghi": **1,18 → 0,04** (bớt ~29 lần).
Riêng khoá `stats`: bản cũ **8.640 lượt/ngày** khi web có người đọc, bản mới
**tối đa 243 lượt/ngày** (240 + 3 lượt dự trữ) và **0 lượt** nếu web vắng.

Ước lượng một ngày 3.000 lượt xem + 150 phiếu + 60 đánh giá + 50 bình luận (bản mới):

```
lượt xem    : 3.000/25 = 120 lượt ghi (đệm 25 thay đổi/lần) + 0 lượt cho bộ đếm IP
phiếu bầu   : 150 × 2   = 300 lượt ghi (bộ đếm + số liệu)
đánh giá    :  60 × 3   = 180 lượt ghi (bộ đếm + khoá tổng + điểm của người đó)
bình luận   :  50       =  50 lượt ghi
đọc số liệu : 300 lượt ĐỌC, 0 LIST
────────────────────────────────────────────
tổng ≈ 650 lượt GHI / ~1.000 lượt ĐỌC / ~0 LIST  → nằm trong 1.000 ghi + 100.000 đọc
```

Bản cũ với **cùng lượng truy cập đó** cần khoảng **3.500+ lượt ghi** — tức là
vượt trần ngay sau khoảng **850 lượt xem**.

---

## 4. Cách tự kiểm chứng

```bash
# 1) Đo lại số thao tác KV (chạy thật worker/cms.js)
node tools/bench_kv.mjs .                 # bản mới
git archive HEAD | tar -x -C /tmp/oldrepo # bản cũ (nếu muốn so sánh tại chỗ)
node tools/bench_kv.mjs /tmp/oldrepo --flushms=1

# 2) Bài kiểm thử riêng cho hạn mức KV (34 kiểm tra)
node tests/t_kv_quota.mjs

# 3) Toàn bộ kiểm thử
node tests/run.js
```

Trên web thật: mở `https://<worker>/api/health` → `stats.writesToday` /
`stats.writeBudget` cho biết đã ghi bao nhiêu lượt cho khoá `stats` hôm nay.
Bảng điều khiển Cloudflare → Workers & Pages → KV → tab **Metrics** để xem
Reads/Writes/Deletes/List theo ngày.

---

## 5. Đổi lại thì mất gì (nói thẳng)

- **Số lượt đọc trên bảng xếp hạng có thể trễ vài phút** lúc web vắng (khi đệm
  chưa đủ 25 thay đổi và ngân sách trong ngày đã dùng gần hết). Lúc web đông thì
  ghi theo đệm 25 thay đổi nên gần như tức thời. **Phiếu bầu và đánh giá sao vẫn
  ghi ngay lập tức** — không bị ảnh hưởng.
- **Hạn mức chống spam chính xác theo từng isolate** thay vì toàn cầu. Với quy mô
  web này là đánh đổi đúng (KV vốn đã "eventual" 60 giây). Muốn siết tuyệt đối
  thì phải dùng Durable Object (tính năng trả phí ở mức dùng nhiều).
- **Các khoá `rateagg:<slug>` cũ vẫn nằm trong KV** nhưng không ai đọc nữa (đã gộp
  vào `rateagg`). Không xoá để tránh tốn thêm lượt xoá — dung lượng không đáng kể.

---

## 6. Còn lại những gì có thể tốn hạn mức (theo dõi khi web lớn lên)

| Nguồn | Ước lượng | Ghi chú |
|---|---|---|
| Ghi khoá `stats` | ≤ 243/ngày | đã có trần cứng, tự chỉnh bằng `STATS_WRITE_BUDGET` |
| Bộ đếm spam theo người | ~2 lượt/phiếu, 3 lượt/đánh giá, 1 lượt/bình luận | chỉ khi người dùng thao tác |
| Bộ đếm theo IP | 0 lượt cho người đọc bình thường | chỉ ghi khi IP vượt 200 lượt/6 giờ |
| Đọc KV | ~1 lượt cho mỗi lần `/api/stats` trượt cache biên (60 giây) + 1 lượt cho mỗi lần đọc bình luận | 100.000 lượt/ngày là rất rộng |
| LIST | ~0 | chỉ 1 lượt duy nhất cho lần gộp `rateagg` đầu tiên |
| Worker | mỗi request đều tính vào 100.000 request/ngày | cache biên 60 giây đã gánh phần lớn |

**Ngưỡng cần để mắt:**

- **> 800 lượt phiếu bầu + đánh giá trong một ngày** → gần trần 1.000 lượt ghi.
  Lúc đó nên xem lại `postVote` (gộp phiếu vào đệm như lượt xem) hoặc chuyển số
  liệu sang Durable Object / D1.
- **Tổng request qua Worker > 70.000/ngày** → cân nhắc tăng TTL cache biên cho
  `/api/book/*` (đang 300 giây) và `/api/registry` (đang 60 giây).
