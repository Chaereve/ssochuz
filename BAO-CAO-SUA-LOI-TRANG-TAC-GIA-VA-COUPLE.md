# Vá lần 2 — trang Tác giả / Couple vẫn báo “Chưa tải được dữ liệu”

*Cập nhật: 23/09/2026 · nhánh `arena/01a0cdca-ssochuz` · lỗi trên máy người đọc thật*

## 1. Chẩn đoán lần trước SAI ở đâu

PR #57 kết luận nguyên nhân là “KV trả `{lib: []}` rồi web nhận luôn bản rỗng”.
Phần đó có thật và đã vá, nhưng **không phải thứ đang làm hỏng trang trên máy
người đọc**. Bằng chứng đo được ngay lúc kiểm tra lại:

| Kiểm tra | Kết quả |
| --- | --- |
| `GET https://chuseoz-cms.kimtong1906.workers.dev/api/health` | `books: 63`, `regRev: 2026-09-23 09:52`, `kv: true` |
| `GET /api/registry` (Worker) | đủ 63 bộ, mỗi bộ có `author`/`couple` |
| `data/registry.json` (file tĩnh) | `rev 2026-09-23 09:52`, `lib` = 63 bộ |
| `cz-app.js?v=20260922a` đang deploy | **đã chứa** bản vá `hasLib` của PR #57 |

Cả ba nguồn dữ liệu đều lành. Vậy mà trang vẫn trắng ⇒ lỗi nằm ở **client**,
không nằm ở dữ liệu.

## 2. Nguyên nhân thật: `libCache` đóng băng ở bản rỗng

```
CZPeople.init('author')
  → CZ.mountShell()            (cz-people.js)
    → mountHeader()            (cz-app.js)
      → paintNotif()
        → notifItems()
          → findLib(slug)
            → CZ.lib()  ←── chạy TRƯỚC khi registry về
```

`libList()` thấy `memo.reg === null` nên tính ra danh sách **rỗng** rồi nhớ vào
`libCache`. Registry về sau đó có đủ 63 bộ, nhưng **không có chỗ nào xoá
`libCache`** khi registry đổi — nó chỉ bị xoá khi số chương được đối chiếu lại.
Thế là `paint()` đọc mãi bản rỗng:

```js
if (!lib.length) { … ‘Chưa tải được dữ liệu — thử tải lại trang.’ … return; }
```

**Điều kiện dính lỗi:** `notifItems()` chỉ đi tới `findLib()` khi
`ssochuz-follow` khác rỗng — tức **người đọc có theo dõi ít nhất 1 bộ**. Đó đúng
là máy của chủ trang. Trình duyệt ẩn danh/bot không theo dõi bộ nào thì
`findLib()` không chạy, trang vẫn hiện đủ — vì thế soi bằng công cụ bên ngoài
thấy “trang chạy tốt” còn người dùng thật thì không.

Trace thật, dựng lại trên code chưa vá (`console.error` gắn trong `libList`):

```
[PROBE] TINH MOI memo.reg=null     ← CZ.lib() chạy trước registry
[PROBE] cache do dai=0   ×6        ← đóng băng ở bản rỗng
KET QUA cards=0 | sub=Đang tải… | loi=true
```

Cùng kịch bản đó trên bản đã vá:

```
[PROBE] TINH MOI memo.reg=null
[PROBE] cache do dai=0   ×3
[PROBE] TINH MOI memo.reg=lib=63   ← registry về là tính lại ngay
KET QUA cards=39 | sub=39 tác giả | loi=false
```

## 3. Đã sửa

**`src/cz-app.js`**
- `setReg(reg, src)` — mọi chỗ gán registry đều đi qua đây và **xoá `libCache`**.
  Đây là vá gốc: danh sách không bao giờ đóng băng ở bản rỗng nữa.
- `registry(force)` — bản rỗng không bị memo cứng; `force` bỏ qua memo, bỏ qua
  cache `ssochuz-reg` và dỡ luôn cờ cấm Worker 10 phút.
- `CZ.purgeRegistry()` — dọn ba kho có thể đang giữ bản rỗng: `ssochuz-reg`,
  `ssochuz-fallback`, và các mục `/api/registry` + `/data/registry.json` trong
  cache của service worker (không đụng tệp tĩnh khác).

**`src/cz-people.js`**
- Thư viện trắng ⇒ **tự dọn ba kho rồi đọc lại đúng 1 lần** trước khi báo lỗi.
- Vẫn trắng mới báo, và báo kèm **nút “Thử lại” chạy thật** (trước đây là ngõ
  cụt: chỉ biết bảo người đọc tải lại trang) + ghi rõ nguồn dữ liệu đang dùng.
  Dòng đếm không còn đứng ở “Đang tải…” khi đã biết là lỗi.

**Cache-busting** — `?v=20260922a` → `?v=20260923a` ở 72 tệp HTML (kể cả
`admin.html` còn sót `?v=20260917f`), `sw.js` đổi PRECACHE và tăng
`CZ_SW_VER` `20260917d` → `20260923a`. Không tăng phiên bản thì máy người đọc
còn giữ `cz-app.js` cũ trong kho shell của service worker và tiếp tục chạy bản
chưa vá — chính là kiểu “đã sửa mà vẫn lỗi”.

## 4. Kiểm chứng

Bài mới `tests/t_people_data.js` (đã đăng ký vào `tests/run.js`), 6 tình huống:

| # | Tình huống | Chưa vá | Đã vá |
| --- | --- | --- | --- |
| A | `/tac-gia/`, có theo dõi truyện, registry về sau `init()` | `cards=0`, “Chưa tải được dữ liệu” | **39 tác giả** |
| B | `/couple/` như trên | `cards=0` | **24 couple** |
| C | Worker trả `{lib: []}` | — | rớt tĩnh, đủ 39 |
| D | localStorage + cache service worker nhiễm bản rỗng | — | đủ 39 |
| E | Mất cả Worker lẫn file tĩnh | ngõ cụt, đứng ở “Đang tải…” | báo lỗi + nút “Thử lại”; bấm xong hiện đủ 39 |
| F | Gọi `CZ.lib()` trước khi registry về | `after=0` | **`after=63`** |

Trên code chưa vá bài này in ra 13 dòng lỗi (đúng triệu chứng người dùng báo);
trên bản đã vá `errors* = []`.

`node tests/run.js`: **50/52 bài đạt**, trong đó có `t_people_data.js`,
`t_people.js`, `t_pwa.js` (precache khớp `?v=` mới), `check_src.js` (bản rút gọn
ở gốc khớp `src/`).

Hai bài **lỗi sẵn từ trước**, không liên quan vá này và cũng **không** phải do
vá này gây ra (chạy trước khi sửa đã lỗi y hệt): `t_admin_core.js:56` “chưa
render danh sách chương” và `t_admin_writes.js:106` “không gọi lock/set đúng
slug/password” — cả hai thuộc bundle admin Preact. Nói rõ thêm: câu “toàn bộ
`node tests/run.js` đạt” trong báo cáo PR #57 là **không đúng**.

## 5. Sau khi deploy

Trang tự lành, không cần bấm gì. Nếu máy nào vẫn trắng: bấm **Thử lại** — nút
này dọn cache cũ rồi đọc thẳng Worker, bỏ qua cả cờ cấm 10 phút.
