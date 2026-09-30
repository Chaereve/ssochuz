# Hướng dẫn việc làm TAY sau bản 1.17.1 (sự cố bảng `ssochuz_blobs` trống, 24/09)

Dành cho người không quen dòng lệnh. Làm **theo thứ tự**; mỗi bước có mục **"Đã được chưa"**
để tự kiểm tra. Tổng thời gian khoảng 25 phút.

> **Đọc trước:** bản 1.17.1 **chỉ sửa thông báo lỗi 502**: lần sau hỏng, Worker tự dò Supabase
> và nói đúng bệnh. Nó **không đem dữ liệu về**. Muốn web đọc được truyện lại thì phải làm
> **Bước 1**. Bước này không cần chờ merge, làm được ngay bây giờ.

## Tóm tắt 1 phút

| # | Việc | Khi nào | Mất |
|---|---|---|---|
| 1 | **Cứu dữ liệu:** kéo về, rồi đẩy 63 bộ lên KV | **ngay**, nếu web còn lỗi | 5 phút |
| 2 | Tìm chỉnh sửa có thể đã mất | ngay sau Bước 1 | 5 phút |
| 3 | Merge PR #61 | lúc nào cũng được | 1 phút |
| 4 | Kéo code mới về máy, deploy Worker | ngay sau Bước 3 | 3 phút |
| 5 | Đóng "cửa" Supabase và tìm vì sao bảng bị xoá | **trong hôm nay** (log chỉ giữ 1 ngày) | 10 phút |
| ↻ | Sao lưu KV → repo bằng nút trên GitHub | sau mỗi buổi đăng/sửa truyện | 1 phút |

## Chuẩn bị (1 lần)

* **Mở Terminal.** Mac: gõ `terminal` trong Spotlight. Windows: mở **Git Bash** (cài kèm Git).
  Đừng dùng PowerShell, để còn dán được y nguyên các lệnh dưới đây.
* **Có sẵn `ADMIN_KEY`** của Worker, tức chuỗi bí mật đã đặt bằng `wrangler secret put ADMIN_KEY`.
* **Mọi lệnh đều chạy trong thư mục repo:** `cd <thư-mục-ssochuz>`.
* Windows mà báo `python3: command not found` thì gõ `python` thay cho `python3`.

---

## Bước 1 · Cứu dữ liệu (làm ngay, không cần chờ merge)

**Có cần làm không?** Mở link này trên trình duyệt:
<https://chuseoz-cms.kimtong1906.workers.dev/api/book/lunar-secret/toc?fresh=1>

* Thấy `"ok":true` và `"total":39` → dữ liệu đã được cứu. **Bỏ qua** bước này, sang Bước 2.
* Thấy `"ok":false` → làm tiếp. Dán **từng khối** lệnh, bấm Enter, đợi chạy xong mới dán khối sau.

**1a. Chuẩn bị**

```bash
git checkout main
git pull
export ADMIN_KEY='dán-ADMIN_KEY-vào-giữa-hai-dấu-nháy'
```

**1b. Kéo về trước.** Lệnh này lấy registry và những bộ **còn đọc được** trên web về máy, để bước
1c không ghi đè chúng bằng bản sao lưu cũ hơn.

```bash
python3 tools/pull_from_kv.py
```

Thấy **nhiều dòng `✗ … HTTP 502 — bỏ qua, file repo giữ nguyên`**, và dòng `xong: …` báo có `lỗi`:
**đó là bình thường.** Đấy là các bộ đang hỏng; script bỏ qua chúng và **không đụng** vào bản sao lưu trong repo.
Chỉ khi thấy `ADMIN_KEY không đúng` thì mới cần dán lại khoá (khối 1a) rồi chạy lại 1b.

**1c. Đẩy lên.** Lệnh này ghi cả 63 bộ từ repo thẳng vào KV, không đi qua Supabase.

```bash
python3 tools/push_to_kv.py --api https://chuseoz-cms.kimtong1906.workers.dev --key "$ADMIN_KEY"
```

Lệnh chạy khoảng 1 phút và in ra:

* vài dòng `lô 8 bộ -> 200 …`;
* một dòng `registry + 7 bộ cuối -> 200 …`;
* dòng `tổng dữ liệu đẩy lên: …` (khoảng 26 MB).

**Dòng lô nào cũng phải có số `200`.**

> ⚠️ **Đừng** nối 1b và 1c bằng `&&`. Lệnh 1b cố ý báo lỗi khi có bộ hỏng, nên `&&` sẽ chặn mất 1c.
> ⚠️ **Đừng** thêm `--only <slug>` khi cứu cả loạt, vì đường đó thử ghi vào Supabase trước.

**Đã được chưa:**

1. Mở lại link `…/lunar-secret/toc?fresh=1`: phải thấy `"ok":true`, `"total":39`.
2. Chạy lại `python3 tools/pull_from_kv.py`: dòng bắt đầu bằng `xong:` phải kết thúc bằng
   **`0 lỗi`** (cả 63 bộ đều đọc được). Nếu vẫn còn dòng `✗ … HTTP 502` thì bộ đó **không có** trong bản sao lưu
   (thường là bộ tạo sau 17:01 ngày 23/09). Ghi tên bộ đó lại, nó cần được dựng lại riêng.
3. Mở web, bấm vào 2–3 truyện, đọc thử 1 chương.

**1d. Lưu bản vừa kéo vào repo**

```bash
node tools/check_secrets.js
git add data
git commit -m "đồng bộ KV → repo sau sự cố 24/09"
git push
```

* Dòng cuối của `check_secrets` phải là `Không thấy secret/email riêng…`. Nếu nó báo `LỖI RÒ RỈ` thì
  **dừng lại, đừng commit**.
* `git commit` báo `nothing to commit` cũng là bình thường, nghĩa là không có gì mới.

---

## Bước 2 · Tìm chỉnh sửa có thể đã mất

Bản sao lưu trong repo là của **17:01 ngày 23/09** (giờ VN), lần chạy cuối của workflow
"Đồng bộ KV → repo". Những chương **sửa hoặc đăng sau mốc đó** cho các bộ bị hỏng đã mất cùng
bảng Supabase, và bản sao lưu cũng không có chúng.

> Ghi chú trước đây nói bản sao lưu là của 24/09 lúc 12:24. Điều đó **không đúng**: con số ấy
> đọc từ một bản clone "nông", nơi commit gần nhất trông như đã chạm vào mọi tệp. Commit đó (`1d09673`,
> merge PR #59) thật ra không đổi tệp nào trong `data/book`.

**Cách tìm:**

1. Vào `/admin`, mở tab **Nhật ký**, bấm **Đọc log**. Giờ ở đây hiện theo giờ VN.
2. Tìm các dòng `lưu chương …`, `lưu bộ …`, `nhập chương từ Blogger …` có giờ **sau 17:01
   ngày 23/9**.
3. Mở từng bộ đó, xem chương mới nhất còn không. Thiếu thì đăng lại từ nơi bạn soạn (bản nháp
   trên máy, Blogger…).

---

## Bước 3 · Merge PR #61

Mở <https://github.com/Chaereve/ssochuz/pull/61>, bấm **Merge pull request**, rồi **Confirm merge**.

**Đã được chưa:** PR hiện nhãn tím **Merged**.

---

## Bước 4 · Kéo code mới về máy và deploy Worker

Bước này **bắt buộc**: merge xong mà chưa deploy thì Worker vẫn chạy bản cũ.

```bash
git checkout main
git pull
grep "const VERSION" worker/cms.js
cd worker
npx wrangler deploy
cd ..
```

* Lệnh `grep` phải in ra `const VERSION = '1.17.1';`.
* Lần đầu, `npx` có thể hỏi `Ok to proceed? (y)`: gõ `y` rồi Enter.
* Có thể phải đăng nhập Cloudflare: trình duyệt tự mở, bấm **Allow**, rồi quay lại Terminal.

**Đã được chưa:** mở <https://chuseoz-cms.kimtong1906.workers.dev/api/health?fresh=1> và nhìn 3 chỗ:

| Trường | Phải là | Nếu sai |
|---|---|---|
| `version` | `"1.17.1"` | deploy chưa ăn: chạy lại `cd worker && npx wrangler deploy` |
| `overflow.supabase` | `true` | xem trường `overflow.missing` ngay bên cạnh |
| `overflow.missing` | `[]` | có chữ `SUPABASE_SERVICE_ROLE`: chạy `cd worker && npx wrangler secret put SUPABASE_SERVICE_ROLE` |

Sau đó mở trang chủ và 1 chương. Chữ hiện bình thường là xong.

---

## Bước 5 · Đóng "cửa" Supabase và tìm vì sao bảng bị xoá (nên làm TRONG HÔM NAY)

**Đã loại trừ:**

* **Không phải do code Worker.** Lệnh xoá duy nhất tới bảng `ssochuz_blobs` chỉ chạy khi bạn tự
  xoá **1 bộ** trong `/admin`, mỗi lần đúng 1 dòng. Khi đó bộ cũng biến mất khỏi KV, trong khi ở
  đây cả 63 bộ vẫn còn.
* **Không phải do Supabase tạm dừng project.** Gói Free tạm dừng project sau 1 tuần không hoạt
  động nhưng **giữ nguyên dữ liệu**. Hơn nữa, project đang dừng thì không trả lời được như Worker đã thấy.
* **Không phải do hướng dẫn sau merge 1.17.** Trong đó không có bước nào đụng tới bảng này.

**Khi nào:** lúc viết báo cáo 1.16.1 (commit lúc 13:28 ngày 24/09), bộ `lunar-secret` vẫn đọc
được. Đến 15:54 thì mất. Vậy dữ liệu bị xoá **từ bên ngoài Worker**, **trong vài giờ trước 15:54
ngày 24/09** (giờ VN). Hãy soi log cả buổi trưa và đầu chiều hôm đó. Nếu log hiện giờ UTC thì
lấy giờ VN trừ 7 tiếng: 15:54 VN = 08:54 UTC.

**5a. Kiểm tra "cửa" có bị mở không (1 phút, quan trọng nhất).** Anon key trong `cz-config.js` là
khoá công khai: ai mở web cũng thấy. Nếu bảng **chưa bật Row Level Security (RLS)** thì cầm khoá
đó là xoá được cả bảng. Vào Supabase Dashboard, chọn project `hnyzrkdlmvelbgcowztk`, mở
**SQL Editor**, rồi chạy **từng câu**:

```sql
select relrowsecurity from pg_class where relname = 'ssochuz_blobs';
```

```sql
select policyname, roles, cmd from pg_policies where tablename = 'ssochuz_blobs';
```

* **Câu 1 phải ra `true`.** Nếu ra `false` thì **rất có thể đây là nguyên nhân**. Chạy ngay câu dưới
  để khoá cửa:

  ```sql
  alter table public.ssochuz_blobs enable row level security;
  ```

  Worker cần khoá **secret** (`sb_secret_…`); khoá này bỏ qua RLS nên vẫn đọc/ghi bình thường.
  Không chắc trước đây đã dán đúng loại khoá thì đặt lại cho chắc:
  `cd worker && npx wrangler secret put SUPABASE_SERVICE_ROLE`. Lỡ sai loại khoá cũng không mất
  dữ liệu: Supabase từ chối thì Worker tự cất bản đầy đủ về KV.

* **Câu 2 nên không ra dòng nào**, vì Worker không cần policy nào cả. Có dòng nào, dù cột `roles`
  ghi `anon`, `authenticated` hay `public`, thì đó là cửa mở cho khách hoặc cho bất kỳ người đọc
  nào đã đăng nhập. Chụp màn hình để làm bằng chứng, rồi xoá policy đó bằng câu dưới, thay chữ
  trong ngoặc kép bằng tên ở cột `policyname`:

  ```sql
  drop policy "tên-policy" on public.ssochuz_blobs;
  ```

**5b. Xem log.** Gói Free chỉ giữ log **1 ngày** ([supabase.com/pricing](https://supabase.com/pricing)),
nên phải xem trong hôm nay:

1. Mở mục **Logs** ở thanh bên trái Dashboard, xem log **API** và **Postgres** trong khung giờ ở trên.
2. Tìm `DELETE`, `TRUNCATE` hoặc `DROP` có chữ `ssochuz_blobs`. Nếu có, ghi lại giờ và vai trò
   (`anon` hay `service_role`).

**5c. Xem ai có quyền:** mở **Organization settings → Team**, xem còn ai khác vào được project không.

Tìm ra hay không cũng nên ghi lại cho lần sau. Muốn có backup tự động thì phải lên gói Pro
(backup hằng ngày). Gói Free không có backup nào ngoài bản sao lưu trong repo.

---

## Không cần làm (ít nhất là lúc này)

* **Nút "chuyển data sang Supabase"** trong `/admin` (migrate-overflow): sau Bước 1, cả 63 bộ nằm
  trọn trong KV, nên việc đọc truyện **không còn phụ thuộc Supabase**. Chưa làm xong Bước 5 thì
  đừng chuyển về.
* Bộ nào bạn **sửa và lưu** trong `/admin` sẽ tự được cất sang Supabase như thiết kế. Điều đó bình
  thường, miễn là có sao lưu đều (mục ngay dưới).

## ↻ Việc đều đặn: sao lưu (chính thứ đã cứu bạn lần này)

Không cần Terminal: vào GitHub, mở tab **Actions**, chọn **Đồng bộ KV → repo**, bấm **Run workflow**.
Workflow kéo KV về repo rồi tự commit. Nếu có bộ đang lỗi thì nó **dừng lại, không commit gì**
và hiện dấu ✗ đỏ. Đó là tín hiệu để mở link của bộ đó ra xem (bảng ở mục sau).

* Nên bấm **sau mỗi buổi đăng/sửa truyện.** Lần bấm gần nhất trước sự cố là 17:01 ngày 23/09.
  Chỉ cần bấm thêm một lần vào sáng 24/09 thì phần có thể mất ở Bước 2 đã ít hơn nhiều.
* Muốn nó tự chạy mỗi đêm (00:17 giờ VN): mở `.github/workflows/sync-kv-to-repo.yml` trên
  GitHub (biểu tượng bút chì). Tìm 2 dòng đang bắt đầu bằng `#`:

  ```yaml
    # schedule:
    #   - cron: '17 17 * * *'   # 17:17 UTC = 00:17 giờ VN mỗi đêm
  ```

  Sửa cho **giống hệt** như dưới đây. Chữ `schedule:` phải thẳng cột với chữ `workflow_dispatch:`
  ở phía trên; lệch 1 dấu cách là workflow hỏng. Sửa xong bấm **Commit changes**.

  ```yaml
    schedule:
      - cron: '17 17 * * *'   # 17:17 UTC = 00:17 giờ VN mỗi đêm
  ```

## Nếu lần sau lại gặp lỗi 502 (thứ mới của 1.17.1)

Mở link bị lỗi và đọc 2 trường trong JSON:

* **`codes`**: mã bệnh;
* **`hint`**: việc cần làm, đã điền sẵn tên bộ.

| `codes` | Nghĩa | Làm gì |
|---|---|---|
| `sb-table-empty` | bảng Supabase rỗng hoàn toàn | SQL Editor chạy `select count(*) from ssochuz_blobs;`. Ra **0** thì bảng trống thật: làm lại Bước 1. Ra **> 0** thì khoá sai loại: `cd worker && npx wrangler secret put SUPABASE_SERVICE_ROLE`, dán khoá `sb_secret_…` |
| `sb-row-missing` | bảng còn dữ liệu, chỉ mất 1 bộ | `python3 tools/push_to_kv.py --api https://chuseoz-cms.kimtong1906.workers.dev --key "$ADMIN_KEY" --only <slug>` |
| `sb-http` | Supabase từ chối (401/403) | đặt lại `SUPABASE_SERVICE_ROLE` như trên |
| `sb-unreachable` | Worker không gọi được Supabase | kiểm tra `SUPABASE_URL` trong `worker/wrangler.toml` |
| `missing` có tên biến | Worker thiếu biến | làm đúng theo `hint` |

## Nếu hỏng thì lùi thế nào

Bản 1.17.1 chỉ đổi thông báo lỗi 502, gần như không có gì để hỏng. Nếu vẫn muốn quay về bản trước,
có 2 cách:

* chạy `cd worker && npx wrangler rollback`;
* hoặc vào Cloudflare Dashboard → **Workers & Pages** → `chuseoz-cms` → **Deployments** → ⋯ →
  **Rollback**.

Lùi code **không** đụng tới dữ liệu trong KV, nên những gì đã cứu ở Bước 1 vẫn nguyên.
