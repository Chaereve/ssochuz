# Hướng dẫn việc làm TAY sau khi merge bản 1.17.0

Dành cho người không quen dòng lệnh. Làm **theo thứ tự**, mỗi bước đều có cách kiểm tra
"đã được chưa". Tổng thời gian: ~20 phút (phần chờ là chính).

> **Vì sao phải làm tay:** Worker chạy trên Cloudflare, ảnh nằm trên Supabase, khoá
> `ADMIN_KEY` là secret — ba thứ đó **không nằm trong repo** nên không ai (kể cả agent)
> bấm hộ được. Repo chỉ chứa code; code muốn có tác dụng thì phải **deploy**.

---

## Bước 0 · Merge PR

1. Mở <https://github.com/Chaereve/ssochuz/pull/60> → **Merge pull request** → **Confirm merge**.
2. Kiểm tra: <https://github.com/Chaereve/ssochuz/commits/main> — commit trên cùng phải là
   commit của bản 1.17.0 (tiêu đề có chữ "1.17.0").

> **Về nhánh:** phiên làm việc Arena này bị **cố định vào nhánh `arena/01a0d1f6-ssochuz`**
> nên tôi không tạo nhánh tên khác được (mọi công việc ở nhánh khác sẽ không gắn với phiên).
> Toàn bộ bản 1.16.1 + 1.17.0 nằm trên nhánh đó, đã push, chính là PR #60.

## Bước 1 · Kéo code mới về máy

Mở Terminal (Mac: gõ `terminal` trong Spotlight · Windows: PowerShell trong thư mục repo):

```bash
cd <thư-mục-ssochuz>
git checkout main
git pull
git log -1 --oneline          # phải thấy chữ 1.17.0
```

**Đã được chưa:** dòng in ra có `1.17.0`.

## Bước 2 · Deploy Worker (bắt buộc — không deploy thì mọi thứ dưới đây vô nghĩa)

```bash
cd worker
npx wrangler deploy
```

Lần đầu nó có thể hỏi đăng nhập Cloudflare → bấm link, cho phép, quay lại Terminal.

**Kiểm tra (quan trọng nhất cả bản hướng dẫn này):** mở
`https://chuseoz-cms.kimtong1906.workers.dev/api/health` và nhìn **4 chỗ**:

| Trường | Phải là | Nếu sai thì |
|---|---|---|
| `version` | `"1.17.0"` | deploy chưa ăn — chạy lại `npx wrangler deploy` |
| `overflow.supabase` | `true` | đọc `overflow.missing` ngay bên cạnh: nó **kể tên biến thiếu**. Thiếu `SUPABASE_SERVICE_ROLE` → `npx wrangler secret put SUPABASE_SERVICE_ROLE` |
| `overflow.urlVia` | `"env"` | nếu là `"kv"` nghĩa là đang chạy bằng Project URL lưu ở `/admin` (vẫn đọc được, nhưng nên để `SUPABASE_URL` trong `wrangler.toml` — bản này đã ghi sẵn) |
| `auth.supabase` | `true` | mở `/admin` → Cài đặt & đồng bộ → Đăng nhập → dán Project URL + anon key → Lưu |

> **Đừng chỉ nhìn `version`.** Sự cố 23/09 là đúng bài này: version mới, `books:63`,
> `kv:true` — nhưng `overflow.supabase:false` nên cả 63 bộ không đọc được.
> Chi tiết: `BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md`.

**Thử một chương thật:** mở
`https://chuseoz-cms.kimtong1906.workers.dev/api/book/lunar-secret/chapter/1`
→ phải ra JSON có `"ok":true` và `"html":"…"`. Nếu ra 502 thì đọc `missing` + `hint`
trong chính JSON đó — nó nói rõ thiếu biến nào và 2 cách chữa.

## Bước 3 · Sao lưu ảnh bìa đang là link ngoài (việc nên làm sớm nhất)

63/63 bìa hiện là link justwatch/amazon/twimg/blogger. Chạy **thử** trước, không ghi gì:

```bash
export ADMIN_KEY='<Secret ADMIN_KEY của Worker>'     # Windows: $env:ADMIN_KEY='...'
curl -s -X POST "https://chuseoz-cms.kimtong1906.workers.dev/api/admin/mirror-images" \
  -H "content-type: application/json" -H "x-admin-key: $ADMIN_KEY" \
  -d '{"dryRun":true,"limit":8}' | python3 -m json.tool
```

Đọc kết quả: `scanned` = số ảnh thấy, `mirrored` = số ảnh sẽ lưu,
`items[].shrunk:true` = đã hỏi được CDN bản nhỏ hơn, `failed[]` = ảnh không tải được.

Ưng ý thì chạy **thật** (mỗi lần tối đa 25 ảnh, chạy lặp tới khi `done:true`):

```bash
curl -s -X POST "https://chuseoz-cms.kimtong1906.workers.dev/api/admin/mirror-images" \
  -H "content-type: application/json" -H "x-admin-key: $ADMIN_KEY" \
  -d '{"limit":25}' | python3 -m json.tool
```

Lặp lại lệnh đó tới khi thấy `"done": true` và `"mirrored": 0`. Chạy lại bao nhiêu lần
cũng được — **không tạo bản sao** (id theo băm URL), ảnh đã lưu thì bỏ qua.

Sau đó kéo ảnh trong chương về luôn (nặng hơn, làm dần mỗi ngày một ít):

```bash
curl -s -X POST ".../api/admin/mirror-images" -H "content-type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" -d '{"only":"chapters","limit":25}' | python3 -m json.tool
```

**Đã được chưa:** mở trang chủ, bìa vẫn hiện (lúc này là ảnh từ
`…supabase.co/storage/v1/object/public/covers/…` thay vì link justwatch).
Mở `/admin` → tab **Bác sĩ** → ô *Overflow KV* phải ghi `Supabase: connected`.

## Bước 4 · Sao lưu dữ liệu + ảnh về máy (local)

```bash
export ADMIN_KEY='<Secret ADMIN_KEY>'
python3 tools/pull_from_kv.py --images          # kéo registry + book + mọi ảnh về _backup/img/
```

* `data/registry.json` và `data/book/*.json` cập nhật theo KV → **commit được**:
  `git add data && git commit -m "đồng bộ KV → repo" && git push`
* ảnh nằm ở `_backup/img/` — **thư mục này đang bị `.gitignore`** để repo không phình.
  Muốn giữ ảnh **trong git** (backup chống mất máy) thì xoá dòng `_backup/` trong
  `.gitignore` rồi `git add _backup && git commit`.
* Ngày nào cũng chạy được: ảnh đã đúng bằng byte thì script bỏ qua, chỉ tải cái mới.
* Chỉ muốn sao lưu ảnh cho nhanh: `python3 tools/pull_from_kv.py --images-only`.

**Đã được chưa:** `ls _backup/img | wc -l` ra số ảnh > 0; mở 1 tệp thấy ảnh hiện được.

## Bước 5 · Kiểm tra web sau deploy (3 phút)

| Mở | Phải thấy |
|---|---|
| Trang chủ | bìa hiện đủ, không ô trắng |
| Một trang truyện → bấm vào 1 chương | chữ hiện trong ~1 giây, không "Đang tải…" treo |
| `/admin` → tab **Bác sĩ** | `Supabase: connected`, số bộ đúng 63 |
| `/admin` → sửa 1 chương → **Lưu chương** | báo lưu xong, ra trang đọc F5 thấy chữ mới |
| Nút Đăng nhập | đăng nhập được (nếu `auth.supabase:true`) |
| `view-source` trang chủ | không thấy lỗi 404 đỏ trong tab Network |

## Bước 6 · Nếu hỏng thì lùi lại thế nào

* **Web lỗi sau deploy:** `git revert <commit>` → `git push` → `cd worker && npx wrangler deploy`.
* **Chỉ Worker lỗi, web vẫn chạy:** web tự rơi về dữ liệu tĩnh `/data/book/*.json`
  (nội dung đứng yên nhưng không trắng trang) — bình tĩnh làm Bước 2 lại.
* **Mất biến `SUPABASE_URL` lần nữa:** Cách A trong
  `BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md` (thêm biến trên dashboard, hiệu lực ngay)
  hoặc `cd worker && npx wrangler deploy` (biến đã nằm trong `wrangler.toml`).
* **Muốn kiểm tra trước khi đụng production:** `node tests/mock_worker.mjs 8787`
  → mở `http://127.0.0.1:8787/admin` — Worker thật, KV trong RAM, không đụng dữ liệu thật.

## Việc nên làm hằng tuần (5 phút)

```bash
export ADMIN_KEY='<Secret ADMIN_KEY>'
python3 tools/pull_from_kv.py --images     # bản sao lưu KV + ảnh về máy
node tests/run.js                          # 58 bài kiểm thử — phải "Tất cả bài kiểm thử đều đạt"
```

## Việc còn treo (đã ghi trong báo cáo, chưa làm)

1. **Trang admin nạp bộ theo chương** (dùng `/toc` + `/chapter/<n>`) — mở bộ lớn để sửa
   hiện vẫn tải 1,4 MB. Cần viết lại cơ chế nháp của `ChapterEditor` nên chưa làm vội.
2. **2 bài kiểm thử trình duyệt thật** (`t_layout_browser.js`, `t_space_browser.js`) cần
   Chromium: `CHROMIUM_EXECUTABLE=/đường/dẫn/chromium node tests/t_layout_browser.js`.
3. **Nén lại ảnh cũ trong chương**: chạy `only:'chapters'` nhiều vòng cho tới khi
   `failed` chỉ còn link thật sự chết.
