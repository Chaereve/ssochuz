# BÁO CÁO · Phím tắt “tạo chương mới” (Ctrl+N) — vì sao không hoạt động và cách sửa

Ngày: 25/09/2026

---

## 1) Triệu chứng

Ở trang quản trị `/admin` → tab **Sửa truyện** → khối **Chương**, bấm
**Ctrl+N** (hoặc Cmd+N) để thêm chương mới thì **không có gì xảy ra** —
dù nút “Thêm chương” bấm tay thì làm việc bình thường.

## 2) Nguyên nhân thật: Ctrl+N là phím TRÌNH DUYỆT GIỮ, trang web không nhận được

Mã trong repo (cả `src/admin/` lẫn bản build `admin.js` ở gốc) **đúng và
đầy đủ**: `main.jsx` có handler `keydown` trên `window`, `ChapterEditor.jsx`
đăng ký hàm “thêm chương” vào stack handler, bấm nút thì chạy. Chạy thử
bằng jsdom (môi trường không có khái niệm “phím trình duyệt giữ”):

```
chapters before: 7
after Ctrl+N:     8   ← handler chạy, chương mới được thêm
```

→ **Lỗi không phải do code, mà do trình duyệt**:

- **Chrome / Edge**: từ Chrome 4, các tổ hợp `Ctrl+T`, `Ctrl+W`, `Ctrl+N`,
  `Ctrl+Shift+T` được **giữ cho riêng giao diện trình duyệt** (“mở cửa sổ
  mới”, “mở tab mới”…). Khi bấm Ctrl+N, Chrome **không gửi sự kiện
  `keydown` cho trang** — handler JS không bao giờ được gọi,
  `preventDefault()` cũng không chặn được. Đây là giới hạn nền tảng,
  không có cách nào trong web page khắc phục (chỉ extension hoặc app
  desktop cài vào Chrome mới override được).
- **Firefox / Safari**: sự kiện `keydown` có tới trang (nên code vẫn chạy —
  chương được thêm), nhưng cửa sổ mới vẫn mở theo (không chặn được), trải
  nghiệm cũng sai.

Nói gọn: **Ctrl+N không thể là phím tắt tin cậy của một trang web.**

## 3) Cách sửa

Giữ Ctrl+N (cho trình duyệt nào có gửi sự kiện), đồng thời thêm **Ctrl/Cmd+Alt+N**
— tổ hợp không bị trình duyệt giữ — làm phím chính chạy chắc chắn trên mọi trình duyệt.

1. **`src/admin/main.jsx`** — nhánh `n` của handler `onKey` bắt cả hai:
   - `key === 'n' || e.code === 'KeyN'` (`e.code` là phím VẬT LÝ, ăn luôn
     bàn phím mà `Ctrl+Alt+N` in ra ký tự khác — ví dụ bàn phím có AltGr);
   - chỉ `preventDefault()` khi thật sự có handler đăng ký (đang ở trình sửa
     bộ) — các màn khác vẫn để Ctrl+N mở cửa sổ mới như cũ;
   - bổ sung chú thích nguyên nhân ngay trong code để lần sau không chọn
     lại phím bị giữ.
2. **`src/admin/components/ChapterEditor.jsx`**
   - nút “Thêm chương”: title đổi thành `Thêm chương mới · Ctrl/Cmd+Alt+N`;
   - thêm dòng hint ngay dưới khối Chương:
     *Phím tắt thêm chương mới: **Ctrl/Cmd+Alt+N** … Không dùng Ctrl/Cmd+N
     thường — trình duyệt GIỮ phím đó để mở cửa sổ mới…*
3. **`src/admin/components/BookEditor.jsx`** — dòng phím tắt cuối form
   metadata: `Ctrl/Cmd+Alt+N thêm chương (Ctrl/Cmd+N bị trình duyệt giữ cho
   “mở cửa sổ mới”)`.
4. **Build + cache**:
   - chạy lại `npm run build:admin` (bản `admin.js` phát hành ở gốc);
   - bump `admin.js?v=20260923b` → `?v=20260925a` trong `admin.html`.
   - Không cần bump `CZ_SW_VER` trong `sw.js`: service worker **không**
     precache `admin.js` (shell chỉ có `cz-*.js`), và `_headers` đã đặt
     `Cache-Control: no-cache` cho `/admin.js`, `no-store` cho `/admin` —
     bản mới lên web là người dùng nhận ngay, không dính cache.

## 4) Kiểm tra

- **`tests/t_admin_core.js`** (bài có sẵn mở đúng trình sửa bộ): thêm đoạn
  bấm phím thật qua `KeyboardEvent` rồi đếm số nút trong `.v2chapter-list`:

  ```
  "addChapterShortcut": { "chapsBefore": 7, "chapsAfterCtrlN": 8, "chapsAfterCtrlAltN": 9 }
  ```

  → Ctrl+N: +1 chương ✓ · Ctrl+Alt+N: +1 chương ✓ · chương mới tự mở
  (hàng cuối tô sáng) ✓. Jsdom gửi được cả hai phím nên bài test giữ chặt
  “dây chuyền” handler; phần trình duyệt giữ phím thì không test được —
  chính vì vậy trong UI phải chỉ dẫn rõ dùng **Ctrl+Alt+N**.
- Chạy lại TOÀN BỘ bộ test `node tests/run.js`: ✅ (xem mục 5).
- Đối chiếu `admin.js` build ra bằng build test riêng (esbuild cùng tham số)
  trước và sau khi sửa: trước đó hai bản **giống hệt** → chứng minh bản
  phát hành đã đồng bộ với source, loại trừ khả năng “code sửa rồi nhưng
  bản deploy chưa build”.

## 5) Rà bộ test: phát hiện + sửa lỗi SẴN CÓ của `tests/t_flows.js`

Khi chạy toàn bộ `node tests/run.js`, bài `t_flows.js` đỏ — kiểm tra trên cây
sạch (chưa có sửa Ctrl+N) thì **vẫn đỏ y hệt** → không phải do sửa này, mà là
bug của chính bài test, tích tụ từ sau vá bảo mật 23/09:

| Lỗi trong `t_flows.js` | Hệ quả | Cách sửa |
|---|---|---|
| `workerFetch` tham chiếu `REG`, `BOOK`, `BOOKS` nhưng KHÔNG BAO GIỜ khai báo | gọi `/api/registry` (đường tự nối của boot) ném `ReferenceError` → admin đứng cổng mãi | khai báo fixture thật (2 bộ + 1 book có chương) |
| khoá admin viết vào `localStorage`, trong khi `loadSavedConnection()` (vá 23/09) chỉ đọc từ **sessionStorage** và xoá trong localStorage | boot không tự nối được dù mock có fetch | viết `cz_kv_key` vào `W.sessionStorage` |
| mock fetch thiếu `headers` (content-type) | `api.js` đọc mọi response dạng STRING → bảng thư viện render 0 dòng | thêm `headers.get('content-type') = 'application/json'` |
| chờ cố định 1 giây rồi kiểm tra, trong khi boot phải chờ `CZ_AUTH.whenSettled()` — trong jsdom script Supabase CDN không tải được nên settle chỉ tới qua lưới an toàn **8 giây** | kiểm tra lúc app chưa kịp vào | **chờ tích cực** nút `.v2app` (tối đa 11 giây) |

Sau sửa: `adminConnected: { vaoDuoc: true, navTabs: 15 }`, `adminLibrary.rows: 2`,
`shortcutFail: []`, "Không lỗi JS nào" — các khẳng định phím tắt Ctrl+K/Ctrl+S
của bài này giờ chạy trên app THẬT đã nối worker (trước đó âm thầm chết từ lúc
chưa vào được app).

## 6) Chạy bộ test

`node tests/run.js` — toàn bộ 51 bài đạt, không có lỗi JS.

## 7) Hướng dẫn dùng (gửi chủ web)

| Muốn làm | Phím | Ghi chú |
|---|---|---|
| Thêm chương mới | **Ctrl+Alt+N** (Mac: **Cmd+Option+N**) | dùng phím này — chạy chắc chắn |
| Thêm chương mới | Ctrl+N | Chrome/Edge: KHÔNG được (bị trình duyệt mở cửa sổ mới); Firefox/Safari: được, nhưng cửa sổ mới vẫn mở |
| Lưu chương / metadata | Ctrl+S (Mac: Cmd+S) | không đổi |
| Nhảy ô tìm kiếm | Ctrl+K (Mac: Cmd+K) | không đổi |
| Bấm tay | nút **“Thêm chương”** bên phải khối Chương | luôn chạy |

Lưu ý sau khi merge/deploy: vào `/admin`, bấm **Ctrl+Shift+R** một lần để
trang tải `admin.js` bản mới (bản đã ghi `?v=20260925a`).
