# Báo cáo nâng cấp 1.5.0 — đăng nhập Supabase · thích theo chương · bình luận trong trang đọc · số chương · trang quản trị

*Cập nhật: 14/09/2026 · nhánh `arena/01a09e17-ssochuz` · Worker **v1.5.0** · 20 file đổi, ~3.200 dòng thêm*

Báo cáo này bám đúng 9 việc bạn nêu. Mỗi mục có: **bệnh cũ** → **cách đã sửa** → **bạn cần làm gì**.
Hướng dẫn chi tiết từng bước nằm ở `HUONG-DAN-DANG-NHAP-BINH-LUAN.md` (đã viết lại cho bản này).

---

## Tóm tắt 9 việc

| # | Bạn yêu cầu | Trạng thái | Bạn còn phải làm |
|---|---|---|---|
| 1 | Google báo `400 origin_mismatch` → chuyển sang Supabase | ✅ code xong cả web + Worker | tạo project Supabase, dán URL + key (10 phút) |
| 2 | Thích **theo từng chương** | ✅ xong | deploy Worker mới |
| 3 | Bấm thích mà **Top vote không nhảy** | ✅ xong (phiếu ghi KV, web cập nhật ngay) | deploy Worker mới |
| 4 | **Bình luận trong trang đọc** | ✅ xong, khách chưa đăng nhập cũng gửi được | deploy Worker mới |
| 5 | Icon **bookmark** và **lưu vào tủ** giống nhau | ✅ đã tách thành 2 icon khác hẳn | không |
| 6 | **Be My Angel 29 chương mà web hiện 30** | ✅ tìm ra nguyên nhân + 3 lớp sửa + tab **Bác sĩ dữ liệu** | bấm 2 nút trong `/admin` |
| 7 | Trang quản trị chuyên nghiệp hơn, nhiều tính năng | ✅ thêm 3 tab + cổng đăng nhập + biểu đồ + CSV | không |
| 8 | Nút **đăng nhập ở trang chủ** cho người đọc | ✅ xong | không |
| 9 | Trang quản trị **chỉ admin thấy** | ✅ ẩn link + chặn tận trang `/admin` | khai email của bạn vào `ADMIN_EMAILS` |

---

## 1. Đăng nhập: bỏ nỗi lo `origin_mismatch` bằng Supabase

**Bệnh:** Google Identity Services bắt khai đúng tuyệt đối từng *Authorized JavaScript origin*. Mở web bằng
domain khác (domain mới, `*.pages.dev`, bản xem trước, `127.0.0.1:8787`) là Google trả `400: origin_mismatch`.

**Đã sửa:**

- `cz-config.js`: thêm cấu hình công khai `CZ_SUPABASE_URL`, `CZ_SUPABASE_ANON_KEY`, `CZ_AUTH_PROVIDER`; quyền quản trị hiện chỉ nằm trong Secret `ADMIN_EMAILS` của Worker.
- `cz-auth.js` (viết lại ~430 dòng): **Supabase trước** — OAuth PKCE (Google qua Supabase), **magic link email**
  làm đường dự phòng, tự đổi `?code=…` khi quay về, giữ phiên, tự làm mới, đổi `access_token` của Supabase lấy
  **session token của Worker** (`POST /api/auth/supabase`). Đường Google cũ vẫn còn (`CZ_AUTH_PROVIDER='google'`).
- `worker/cms.js`: verify JWT Supabase **HS256 bằng `SUPABASE_JWT_SECRET`** (không cần gọi mạng) và
  **RS256/ES256 bằng JWKS** (cache 1 giờ) nếu không đặt secret; `ADMIN_EMAILS` quyết định ai là quản trị.
- `cz-app.js`: nút đăng nhập ở đầu trang mọi trang — chưa đăng nhập thì hiện chữ **Đăng nhập**, đăng nhập rồi
  thì hiện **avatar + tên**, bấm ra menu (Tủ truyện · Đang đọc dở · Trang quản trị *(chỉ admin)* · Đăng xuất).
- Chưa bật Supabase thì web **không chết**: người đọc vẫn bình luận bằng tên khách (mục 4).

**Bạn làm:** `HUONG-DAN-DANG-NHAP-BINH-LUAN.md` mục 2–4 (tạo project → đặt 3 biến cho Worker → dán URL + key
trong `/admin` → Lưu). Kiểm tra bằng nút **Hỏi Worker** ngay trong trang quản trị.

---

## 2 + 3. Thích theo từng chương, và Top vote phải nhảy số

**Bệnh:** một nút thích cho cả bộ → thích chương này xong sang chương khác bấm lại thành *bỏ* thích. Phiếu lại
chỉ nằm trong máy người đọc nên bảng xếp hạng không đổi.

**Đã sửa:**

- Worker: `POST /api/vote {slug, ch, vote, vid}` — voter key `người#chương`, đếm riêng
  `it.chap = {12: 3}`, vẫn trả `votes/votesDay/votesWeek/votesMonth/chapVotes`. **Không gửi `ch`** thì hiểu là
  phiếu cho cả bộ → code cũ và test cũ vẫn chạy.
- Web: `CZ.vote(slug, on, ch)` → `applyVote()` sửa số trong bộ nhớ ngay → `notifyStats()` → **bảng xếp hạng vẽ lại
  không cần tải trang**. Khoá trên máy đổi thành `chuseoz-like-<slug>-<ch>`.
- Nút thích trong trang đọc hiện **số người thích chương này**; chip đầu chương hiện **tổng phiếu cả bộ**;
  trang giới thiệu truyện vẫn có nút thích cho cả bộ.
- `/admin` → **Số liệu**: biểu đồ cột 30 ngày (lượt đọc + phiếu), cột *Phiếu theo chương* (`ch2 (5), ch3 (3)`),
  nút **Xuất CSV**.

**Kiểm chứng:** `tests/t_reader.js` — thích chương 2, sang chương 3 thấy *chưa thích*, thích tiếp → Worker có
`{"2":1,"3":1}`; bỏ thích chương 3 → `{"2":1,"3":0}`, chương 2 vẫn còn; bấm thích ở trang chủ → dòng
**Top vote** đổi `56 phiếu` → `57 phiếu`.

---

## 4. Bình luận ngay trong trang đọc

**Bệnh:** bình luận chỉ có ở trang giới thiệu truyện (Giscus), muốn nói về chương đang đọc phải thoát ra ngoài.

**Đã sửa:**

- Module bình luận dùng chung `CZ.comments.mount(host, {slug, ch, title, chLabel, compact, chapterFilter, hint, onChanged})`
  trong `cz-app.js` → **một code, hai chỗ hiện**: tab *Đánh giá* của trang truyện **và** khung `#rdCmts` cuối trang đọc.
- Bình luận gắn `ch` = chương đang đọc, đọc bằng `GET /api/comments/<slug>?ch=12`, có 2 nút lọc
  **chương này / tất cả**, tiêu đề hiện **tên chương thật** ("Bình luận Chương 2", không phải số thứ tự nội bộ).
- Nút **Bình luận chương này** trong dải nút cuối chương → cuộn xuống khung và đặt con trỏ vào ô viết.
- **Khách chưa đăng nhập vẫn gửi được** (nhãn *khách*), kèm `vid` là mã máy ẩn danh và ô nhập tên được nhớ trong máy.
- Chặn spam 2 lớp: **3** bình luận/chương/10 phút + **12** bình luận/10 phút (tài khoản); **2** và **6** (khách).
- Xoá: tác giả xoá của mình; **quản trị** (ADMIN_KEY hoặc email quản trị) xoá của bất kỳ ai, có ghi nhật ký.
- Số bình luận hiện trên tab *Đánh giá* và cập nhật khi gửi/xoá.

**Kiểm chứng:** `tests/t_reader.js` (gửi bình luận có `"ch":3` + `"vid"`, hiện trong danh sách, lọc theo chương)
và `tests/t_worker.mjs` (khách thiếu `vid` → 400, khách bị chặn spam, admin-key xoá được bình luận khách).

---

## 5. Hai icon khác nhau

| Nút | Icon | Ý |
|---|---|---|
| **Lưu vào tủ** | 🗄 tủ sách (khung + 3 quyển sách, nét `M4 20h16`) | thêm cả **bộ truyện** vào *Tủ truyện* ở trang chủ |
| **Đánh dấu** | 🔖 thẻ đánh dấu (`M6 4h12v14l-6-3-6 3V4z`) | đánh dấu **một chương** để quay lại, hiện dấu ✓ trong mục lục |

Hai icon này khác nhau cả hình lẫn chữ nhãn, và lưu ở hai chỗ khác nhau
(`chuseoz-shelf` = danh sách bộ, `chuseoz-mark-<slug>` = danh sách chương).
`tests/t_reader.js` so trực tiếp nội dung SVG của hai nút để chắc chắn không bao giờ trùng lại.

---

## 6. "Be My Angel có 29 chương mà web vẫn hiện 30"

**Nguyên nhân thật (đã xác minh bằng cách đối chiếu cả 3 nguồn):**

- `data/book/be-my-angel.json` → **29** chương ✅
- `data/registry.json` → `chapters: 29`, `countLabel: "29/29"` ✅
- **Cloudflare KV → 30** ❌ ← bản cũ chưa được nạp lại

Web đọc **KV trước**, file trong repo chỉ là đường dự phòng. Nên bạn sửa file đúng rồi mà web vẫn hiện 30.

**Đã sửa 3 lớp:**

1. **Web tự chữa** — `CZ.reconcileCount(slug, soChuongThat)`: mở trang truyện là so số chương thật trong kho
   chương với con số registry đưa xuống, và **dùng số thật** (nhớ trong `chuseoz-realcounts`).
   Test: cố tình làm registry nói 30 → trang truyện vẫn hiện *"Đang có 29 chương"*, lưới chương có đúng 29 dòng.
2. **Worker tự giữ nhãn đúng** — `PUT /api/book/<slug>`, `/api/seed`, `/api/import`, `/api/sync` đều tính lại
   `chapters` + `countLabel` sau khi ghi. Bộ **0 chương thì bỏ qua** để không xoá mất nhãn Blogger đang có.
3. **`POST /api/recount`** — đếm lại 62 bộ từ chương thật trong KV, sửa registry, trả về
   `fixed` (nhãn cũ → mới), `missing`, `orphan`. Chạy thử trên bản xem trước: sửa được 2 bộ có nhãn sai
   (`7/40` → `7/7`, `9/45` → `9/9`).

**Chữa dứt điểm bằng giao diện:** `/admin` → tab **Bác sĩ dữ liệu** → *Soi dữ liệu* →
**↑ Nạp chương từ repo lên KV** → **Đếm lại số chương trên KV**. Xong thì KV = repo = registry = 29/29.

---

## 7. Trang quản trị: thêm 3 tab, biểu đồ, CSV, nhật ký

| Tab | Phím | Làm gì |
|---|---|---|
| **Bác sĩ dữ liệu** | `6` | đối chiếu registry ↔ KV ↔ repo cho 62 bộ; bắt số chương lệch, chương trùng tiêu đề, chương rỗng, thiếu bìa/mô tả/tác giả/couple/năm; 4 nút sửa + xuất báo cáo JSON |
| **Bình luận** | `7` | mọi bình luận trên KV: tìm theo chữ, lọc theo bộ, xoá bất kỳ cái nào (có xác nhận), xuất JSON, đếm theo ngày/người gửi |
| **Nhật ký** | `9` | 200 thao tác gần nhất: ai, lúc nào, làm gì (nạp KV, đếm lại, xoá bình luận, ghi bộ…) |

Cải tiến ở các tab cũ:

- **Tổng quan**: thêm ô *Tình trạng hệ thống* (đăng nhập đã bật chưa · số chương có lệch không · Worker nối chưa)
  kèm nút tới thẳng chỗ sửa; thêm 3 ô số liệu thật (bộ có số liệu · lượt đọc · phiếu).
- **Số liệu**: biểu đồ SVG 30 ngày, cột phiếu theo chương, xuất CSV, đọc qua `/api/admin/stats`
  (Worker cũ thì tự rơi về `/api/stats`, không báo lỗi).
- **Cài đặt**: thêm mục **Đăng nhập người đọc (Supabase)** — lưu thẳng lên KV nên đổi cấu hình **không cần deploy**;
  nút **Hỏi Worker** cho biết Supabase/`SESSION_SECRET`/`ADMIN_EMAILS` đã đủ chưa.
- Thanh trên: avatar + tên + huy hiệu **quản trị** + **Đăng xuất**; mọi khung đang chờ đều có con xoay và câu
  trạng thái tiếng Việt rõ ràng; phím tắt đổi thành `1…9, 0`.

---

## 8 + 9. Nút đăng nhập ở trang chủ, và quản trị thì chỉ admin thấy

- **Nút Đăng nhập** nằm ở đầu trang **mọi trang** (trang chủ, trang truyện, trang đọc) và trong menu điện thoại —
  người chưa đăng nhập cũng thấy.
- Khu **Không gian của tôi** ở trang chủ có thẻ `#banAuth`: chưa đăng nhập thì mời đăng nhập, đăng nhập rồi thì
  hiện tủ truyện + đọc tiếp.
- **Mục Quản trị chỉ hiện khi email đăng nhập nằm trong danh sách quản trị** — kiểm tra ở cả 3 chỗ:
  menu tài khoản trên desktop, menu điện thoại, và thanh điều hướng.
- Mở thẳng `/admin` thì gặp **cổng**: chưa qua cổng thì **không thấy dữ liệu nào**, kể cả dữ liệu tĩnh trong repo
  (nút *Xem dữ liệu tĩnh* cũng bị chặn). Đăng nhập bằng tài khoản không có quyền thì cổng nói rõ
  *"Tài khoản X không có quyền quản trị"* nhưng không tiết lộ các email đang được phép.
- Qua cổng bằng 1 trong 2 cách: **đăng nhập email quản trị** hoặc **nhập đúng ADMIN_KEY**.

**Bạn làm:** khai email của bạn bằng Secret `ADMIN_EMAILS` trên Worker. Không đặt email quản trị trong
`cz-config.js`, registry hay trang `/admin`, vì các nội dung đó có thể đọc được từ trình duyệt.

---

## Kiểm thử

```bash
cd tests && node run.js
```

**10/10 bài đạt** · `worker/cms.js` **83/83 kiểm tra**.

| Bài | Mới trong bản này |
|---|---|
| `t_worker.mjs` | 83 kiểm tra (thêm 8): vote theo chương, bình luận có `ch`, khách thiếu `vid` → 400, khách bị chặn spam, admin-key xoá bình luận khách, `/api/recount` |
| **`t_reader.js`** *(mới)* | thích theo chương, Top vote nhảy số, bình luận trong trang đọc + gửi kèm `ch`/`vid`, khách bình luận được, 2 icon khác nhau, số chương tự sửa (registry 30 → hiện 29), nút đăng nhập trang chủ, ẩn mục Quản trị với người đọc thường |
| `cf_admin_test.js` | cổng đóng với người đọc thường (0 dòng dữ liệu), cổng mở với email quản trị + huy hiệu, Bác sĩ bắt đúng bệnh `registry 29 · KV 30 · repo 29` rồi chữa bằng *Nạp repo lên KV* → 29/29, kiểm duyệt bình luận (tìm/lọc/xoá/nhật ký), nhật ký, biểu đồ + phiếu theo chương, lưu cấu hình Supabase |
| `mock_worker.mjs` | khởi động **tự nạp 62 bộ từ `data/` vào KV** (web đọc KV như production), sửa route `/truyen/<slug>` → `truyen.html`, thêm `/admin`, `/guide`, nhận `SUPABASE_URL`/`ADMIN_EMAILS` |
| `mk.js` | thêm hook `setup(win)` để giả lập phiên đăng nhập trong test |

Bản xem trước đã chạy thử thật bằng `mock_worker.mjs` (Worker thật + KV trong RAM): `/api/recount` sửa
`7/40`→`7/7`, `9/45`→`9/9`; vote chương 5 rồi chương 6 cho `{"5":1,"6":1}`; bình luận khách lọc theo `?ch=5`;
admin xoá bình luận và nhật ký ghi lại.

---

## Việc của bạn, theo thứ tự

1. **Dán `worker/cms.js` (v1.5.0) vào Cloudflare Worker → Deploy.** Không làm bước này thì web gọi các endpoint
   mới sẽ nhận `404 không có endpoint` (thích theo chương, bình luận theo chương, bác sĩ dữ liệu đều cần Worker mới).
2. Đặt biến cho Worker: `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `ADMIN_EMAILS` (giữ nguyên `ADMIN_KEY`,
   `SESSION_SECRET`, binding `CZ_KV`).
3. Tạo project Supabase + bật Google, khai **Redirect URLs** (10 phút — `HUONG-DAN-DANG-NHAP-BINH-LUAN.md` mục 2).
4. `/admin` → **Cài đặt & đồng bộ** → mục *Đăng nhập người đọc* → dán URL + anon key + email quản trị → **Lưu**
   → bấm **Hỏi Worker** để chắc chắn Worker đã sẵn sàng.
5. `/admin` → **Bác sĩ dữ liệu** → *Soi dữ liệu* → **↑ Nạp chương từ repo lên KV** → **Đếm lại số chương trên KV**.
   Đây là bước chữa dứt điểm số chương sai (Be My Angel và mọi bộ khác).
6. Deploy frontend (đẩy nhánh này lên Cloudflare Pages).
7. Thử: đăng nhập → thích 2 chương khác nhau → bình luận trong trang đọc → xem Top vote nhảy số.

---

## Còn có thể làm tiếp

- **Kiểm duyệt chủ động**: duyệt bình luận trước khi hiện (cờ `pending`), chặn theo từ khoá, khoá người dùng theo `uid`.
- **Thông báo**: email/Telegram khi có chương mới hoặc bình luận mới.
- **Thích bình luận** (upvote) và trả lời theo luồng.
- **Supabase RLS**: nếu muốn lưu tiến độ đọc/tủ truyện lên Supabase thay vì localStorage (đổi máy vẫn còn).
- **Ảnh bìa**: tab Bác sĩ đã liệt kê bộ thiếu bìa — có thể thêm nút tự sinh bìa chữ.
