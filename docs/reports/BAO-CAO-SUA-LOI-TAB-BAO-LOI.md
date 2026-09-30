# Báo cáo · Sửa lỗi tab **Báo lỗi** trong trang quản trị báo “Failed to fetch”

Bản **Worker 1.10.1** · ngày 18/09/2026 · liên quan PR #48 (lần sửa trước đó chưa đúng bệnh)

---

## 1. Triệu chứng chủ trang gặp

Vào `/admin` → tab **Báo lỗi chữ người đọc gửi** → dòng đỏ:

> Không đọc được báo lỗi: **Failed to fetch** — không nối được Worker tại
> `https://chuseoz-cms.kimtong1906.workers.dev` (CORS, URL sai, Worker chưa deploy, hoặc KV id
> trong wrangler.toml còn là `DAN_ID_KV_VAO_DAY`).

Trong khi đó **mọi thứ khác của trang quản trị vẫn chạy bình thường**: thư viện 62 bộ, sửa chương,
số liệu, nhật ký, bình luận, ảnh bìa. Đã kiểm tra URL Worker, `ADMIN_KEY`, KV, `ALLOW_ORIGIN`,
`RESEND_API_KEY`/`MAIL_TO` theo hướng dẫn — vẫn lỗi.

**Dấu hiệu nhận biết bệnh này:** *chỉ một* tab/endpoint lỗi, các tab khác OK. Nếu là sai URL,
Worker chưa deploy, thiếu KV hay sai khoá thì **tất cả** cùng chết, không chết riêng cái nào.

## 2. Nguyên nhân thật (đo trên Worker đang chạy)

Mở `https://chuseoz-cms.kimtong1906.workers.dev/api/health`:

```json
{"ok":true,"version":"1.10.0","kv":true,"books":62,"adminConfigured":true,
 "regRev":"2026-09-18 01:14","novels":62,"auth":{"mail":true,"session":true,"supabase":true}}
```

→ Worker **sống**, KV **đã gắn**, đã cấu hình khoá quản trị **và** gửi thư. Không có gì sai cả.

Lỗi nằm ở `worker/cms.js`, hàm `adminReports()` (endpoint `GET /api/admin/reports`):

```js
return json({ ok: true, items: …, count: …, mail: hasMail });   // ← thiếu { cors }
```

Mọi handler khác trong Worker đều trả `{ cors }`; riêng handler này quên. Hệ quả:

1. Worker vẫn trả **HTTP 200 + đúng dữ liệu** (nên `curl` vẫn thấy báo lỗi, email vẫn gửi được,
   KV vẫn lưu đủ 300 báo lỗi gần nhất);
2. nhưng response **không có** `access-control-allow-origin`;
3. trang admin nằm ở origin khác (`ssochuz.pages.dev`), nên **trình duyệt** chặn không cho
   JavaScript đọc response;
4. `fetch()` khi đó chỉ ném `TypeError: Failed to fetch` — **không có mã HTTP, không có lý do**.

Vì câu chữ “Failed to fetch” giống hệt bệnh “Worker chết / sai URL”, mọi hướng dẫn kiểm tra
(URL, KV id, deploy) đều đúng mà không chữa được bệnh. Đây là lỗi **một dòng**, sửa ở Worker,
không phải ở trang quản trị.

## 3. Đã sửa gì

| Tệp | Thay đổi |
|---|---|
| `worker/cms.js` | `adminReports()` trả đủ `{ cors, headers: { 'cache-control': 'no-store' } }` (`no-store` vì danh sách này chứa email người đọc — không được cho cache biên giữ hộ). `VERSION` → **1.10.1**. |
| `worker/cms.js` | Thêm **lớp bảo hiểm `ensureCors()`** ở lối vào Worker: response nào thiếu header CORS thì tự đắp thêm; lỗi lọt ra ngoài `try/catch` cũng được trả thành JSON 500 **có CORS** thay vì trang lỗi 1101 của Cloudflare. Từ giờ một handler quên `cors` không còn thành bug “im lặng” nữa. |
| `src/admin.js` (+ bản rút gọn `admin.js`) | Tab Báo lỗi **tự chẩn đoán**: khi `fetch` chết kiểu mạng, admin thử `GET /api/health`; nếu health OK thì dòng đỏ nói thẳng “không phải sai URL/chưa deploy/thiếu KV/sai KEY — Worker bản ≤ 1.10.0 thiếu header CORS, dán `worker/cms.js` rồi Deploy”, kèm số phiên bản Worker đang chạy. `api()` gắn thêm `httpStatus` vào error để phân biệt 404 (Worker bản cũ chưa có endpoint) với 401 (sai khoá). |
| `worker/README.md` | Mục 7c thêm bước **1b** (“chỉ MỘT tab báo Failed to fetch”); mục 5f thêm mẹo `curl` để phân bệnh; có mục “Có gì mới ở bản 1.10.1”. |
| `tests/t_worker.mjs` | 6 kiểm tra hồi quy: `/api/admin/reports` **bắt buộc** có `access-control-allow-origin`, `Vary: Origin`, `no-store` (cả ở nhánh 401 và nhánh chưa gắn KV) + **quét 26 endpoint** (kể cả đường lỗi 401/404/400) đòi mỗi response đều có CORS. |
| `tests/cf_admin_test.js` | Giả lập đúng cảnh “Worker 200 OK nhưng bị trình duyệt chặn vì thiếu CORS” → bắt trang quản trị phải nhận ra `health OK` và hướng dẫn dán Worker bản mới; hết chặn thì đọc lại được. |

## 4. Chủ trang cần làm gì (bắt buộc, mới hết lỗi)

Mã trong repo đã sửa, nhưng **Worker trên Cloudflare vẫn đang chạy bản cũ** → phải deploy lại:

1. Cloudflare dashboard → **Workers & Pages** → `chuseoz-cms` → tab **Code (Quick edit)**.
2. Mở tệp **`cms.js`** và dán **toàn bộ** nội dung `worker/cms.js` của repo (bản 1.10.1) vào, đè hết
   nội dung cũ. **Giữ nguyên** `member-spaces.js` và `private-books.js` (Worker gồm 3 mô-đun).
   Không cần sửa `wrangler.toml`, không cần động tới secret nào.
   > Nếu quen dùng máy: `cd worker && npx wrangler deploy`. Lưu ý `wrangler deploy` sẽ lấy `[vars]`
   > trong `wrangler.toml` **đè** biến đang đặt trong dashboard — đã đổi `ALLOW_ORIGIN` (thêm custom
   > domain) ở dashboard thì sửa lại `wrangler.toml` cho khớp trước khi deploy, kẻo mất CORS cả site.
3. Bấm **Save and Deploy**.
4. Kiểm chứng: mở <https://chuseoz-cms.kimtong1906.workers.dev/api/health> phải thấy
   `"version": "1.10.1"`.
5. Về trang `/admin`: bấm **Ctrl+Shift+R** (tải lại hết cache) rồi vào tab **Báo lỗi** → **Đọc lại**.

Sau bước 4 thì danh sách báo lỗi trong KV (tối đa 300 bản gần nhất) hiện ra ngay; nút **Xuất JSON** và **Mở** (nhảy đúng
chương bị báo) hoạt động. Trang web (`ssochuz.pages.dev`) chỉ cần deploy lại khi muốn có dòng chẩn
đoán mới ở bước 3 — **còn lỗi “Failed to fetch” thì chỉ cần bước 1–4 là hết**.

### Chưa muốn deploy ngay? Đọc tạm bằng terminal

```bash
curl -s -H "x-admin-key: <ADMIN_KEY>" \
  "https://chuseoz-cms.kimtong1906.workers.dev/api/admin/reports" | head -c 2000
# hoặc đọc thẳng từ KV, bỏ qua Worker (--remote = bản đang chạy thật; id lấy trong worker/wrangler.toml):
npx wrangler kv key get report --namespace-id c1e0e450c37f4a0abf804bf354c412d9 --remote > bao-loi.json
# hoặc: Cloudflare dashboard → Storage & Databases → KV → CZ_KV → key `report` → View
```

Báo lỗi **không mất**: mỗi lần người đọc bấm Gửi là Worker lưu vào khoá `report` của KV (giữ 300 bản
gần nhất) và gửi email — bằng chứng: `curl` ở trên in ra JSON có `items`. Mất mỗi cái tab xem.

## 5. Kết quả kiểm thử

```
node tests/t_worker.mjs   → Worker đạt hết 281 kiểm tra (thêm 6 kiểm tra CORS mới)
node tests/run.js         → Tất cả bài kiểm thử đều đạt (41 bài, gồm cf_admin_test.js + t_admin_ui.js)
node tools/check_src.js   → Bản phát hành (rút gọn) khớp mã nguồn src/
```

Đã thử ngược: xoá `{ cors, … }` ở `adminReports` → test đỏ đúng 4 dòng (`báo lỗi/admin/reports
PHẢI có Access-Control-Allow-Origin`, `…Vary: Origin`, `…no-store`, `CORS/quét GET /api/admin/reports`);
tắt riêng `ensureCors` → vẫn đỏ; giữ `ensureCors` → endpoint “quên CORS” vẫn chạy.
