# Rà soát bảo mật — 23/09/2026

*Phạm vi: repo `Chaereve/ssochuz` + bản đang chạy `ssochuz.pages.dev` / Worker
`chuseoz-cms.kimtong1906.workers.dev`. Chủ repo yêu cầu tự đánh giá hệ thống của mình.*

Phương pháp: dùng bộ skill [`ptn1411/skill`](https://github.com/ptn1411/skill) —
hai skill `web-app-scanner` (mục *Pre-deploy source audit*) và
`sbom-supply-chain-auditor`. **Không chạy mù**: tải `deploy_audit.py` +
`analyze_supply_chain.py` về, đọc mã trước (chỉ import thư viện chuẩn
`argparse/json/re/math/pathlib/collections/typing/urllib.parse`; không `socket`,
`requests`, `subprocess`, `eval`, `exec`; chỉ `write_text` vào thư mục `--out`)
rồi mới chạy. Phần rà Worker/CSP/`_redirects`/luồng bình luận là làm tay, vì
hai script đó không phủ.

Kết quả thô: `deploy_audit.py` → 323 finding (322 sink `innerHTML` mức *review-required*,
1 báo thiếu thư mục build — **dương tính giả**, repo này coi thư mục gốc là bản build);
`analyze_supply_chain.py` → 1265 finding, gần hết là noise từ `node_modules`.
Dưới đây là phần đã xác minh lại từng cái.

---

## Đã xác nhận trên bản chạy thật — ĐÃ SỬA

### 1. CAO — `admin.js.map` tải công khai được, lộ nguyên văn mã quản trị

```
GET https://ssochuz.pages.dev/admin.js.map   →  200, 695.837 byte
```

Source map liệt kê `sources` gồm **`src/admin/api.js`, `src/admin/store.js`,
`src/admin/quota.js`, `src/admin/utils/permissions.js`, `src/admin/utils/books.js`**
và toàn bộ component — tức khôi phục lại đúng bản mã đọc được mà quy trình build
cố tình rút gọn. `tools/build_site.mjs` ghi rõ bản phát hành phải “đã rút gọn,
không chứa secret/email quản trị”; tệp này phá đúng chính sách đó.

`_redirects` đã chặn `/src/*`, `/worker/*`, `/tools/*`, `/tests/*` nhưng **không
có luật cho `/admin.js.map`**. `admin.js` không kèm dòng `sourceMappingURL` nên
DevTools không tự nạp — nhưng gõ thẳng URL là lấy được, không cần đăng nhập.

**Sửa:** thêm `/admin.js.map / 301` vào `_redirects` (luật redirect của Pages áp
trước khi phục vụ tệp tĩnh). Muốn triệt để hơn thì ngừng phát hành tệp này: bỏ
`sourcemap` trong `tools/build_admin.mjs` hoặc xoá khỏi repo.

### 2. CAO — 8 báo cáo nội bộ mô tả chi tiết cơ chế bảo mật, tải công khai được

```
GET https://ssochuz.pages.dev/BAO-CAO-KHOA-TRUYEN-VA-TRANG-QUAN-TRI.md  →  200
```

Danh sách chặn trong `_redirects` liệt kê từng tệp `.md` bằng tay và **thiếu 8 tệp**:
`BAO-CAO-ADMIN-V2-TINH-CHINH`, `BAO-CAO-ADMIN-V2`, `BAO-CAO-CAI-TAO-ADMIN-V2`,
`BAO-CAO-CAN-CHINH-HERO-VA-HOP-THOAI-MY-SPACE`, `BAO-CAO-GOP-ADMIN-MOT-TRANG`,
`BAO-CAO-KHOA-TRUYEN-VA-TRANG-QUAN-TRI`, `BAO-CAO-OVERFLOW-VA-NHAN-DIEN-CHUONG`,
`BAO-CAO-SUA-LOI-TAB-BAO-LOI`.

Nội dung công khai gồm: khoá truyện băm **PBKDF2** (salt 16 byte), token đọc
**HMAC 6 giờ ký bằng `SESSION_SECRET`, thiếu thì `ADMIN_KEY`**, endpoint
`POST /api/lock/set {slug,password}`, `GET /api/book/<slug>?token=…`,
`GET /api/admin/kv`, nhóm `/api/private/*`, cơ chế phân quyền `ADMIN_EMAILS`,
và việc `ADMIN_KEY` chỉ nằm trong `sessionStorage`. Không có secret thật
(`tools/check_secrets.js` vẫn đạt), nhưng đây là bản đồ tấn công miễn phí.

**Sửa:** thêm 9 luật chặn (8 tệp `.md` + `/admin.js.map`).

### 3. Chốt chặn để không tái diễn

`tools/check_secrets.js` thêm bước: **mọi tệp `.map`/`.md` ở thư mục gốc phải có
luật chặn trong `_redirects`** (ngoại lệ duy nhất `THIRD-PARTY-NOTICES.md` —
ghi công giấy phép, cố ý công khai). Đã thử: bỏ luật `/admin.js.map` là bài kiểm
đỏ ngay, `exit=1`. Bài này chạy trong `node tests/run.js`.

---

## Đã rà, KHÔNG phải lỗ hổng

| Hạng mục | Kết quả |
| --- | --- |
| So sánh `ADMIN_KEY` (`worker/cms.js:873`) | So **constant-time**: kiểm độ dài rồi XOR tích luỹ — không lộ độ dài khoá qua thời gian |
| Dò khoá quản trị | Có giới hạn: vượt ngưỡng trả `429 “sai khoá quản trị quá nhiều lần — thử lại sau 10 phút”` |
| Bình luận (nội dung người dùng) | `esc(c.text)`, `esc(c.name)`, `esc(c.email)`; `profileId` chỉ được nối vào `href` sau khi khớp `/^[a-f0-9]{64}$/` |
| Avatar từ Supabase | `esc(o.picture)` trong `<img src>`; `javascript:` không thực thi được ở `img src` |
| Khoá công khai trong `cz-config.js` | `CZ_SUPABASE_ANON_KEY` (loại `sb_publishable_`), VAPID, Google Client ID — **công khai theo thiết kế**; `check_secrets.js` đã chốt không cho dán `sb_secret_`/JWT `service_role` |
| `/api/registry` công khai | Worker có `isSafePublishableKey()` chặn JWT `service_role` và `sb_secret_` lọt ra registry |
| `_redirects` open-redirect | 182 luật, mọi đích đều nội bộ; `tests/t_html.js` có bộ bắt vòng lặp |
| `/src/*`, `/worker/*`, `/tools/*`, `/tests/*`, `/_inbox/*` | Đã chặn 301 |
| `.github/workflows/sync-kv-to-repo.yml` | Chỉ `workflow_dispatch`, đọc `secrets.ADMIN_KEY`, `permissions: contents: write` vừa đủ |

## Còn lại — cần anh quyết, tôi chưa tự sửa

### 4. TRUNG BÌNH — `@tiptap` dính GHSA-cp6q-959q-f8rh (prototype pollution → DOM XSS)

`npm audit`: **25 moderate**, cùng một advisory
[GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh) —
`mergeAttributes()` biến khoá `__proto__` thành thẻ DOM thực thi được.

- Đang cài: `@tiptap/core 2.27.3` (`package.json` khai `^2.27.3`); npm báo vùng bị ảnh hưởng `<=3.30.3`, bản vá `3.31.3` — **nhảy major**.
- Nơi dùng: `src/admin/components/ChapterEditor.jsx` (trình soạn chương trong `/admin`).
- Bối cảnh rủi ro: chỉ quản trị (đã qua `ADMIN_KEY`/`ADMIN_EMAILS`) mới đưa nội dung vào trình soạn, nên đường khai thác thực tế hẹp — nhưng CSP đang để `script-src 'unsafe-inline'` (xem mục 6) nên nếu kết hợp được thì thành XSS thật.
- **Chưa tự nâng** vì nhảy 2.x → 3.x có thể đổi API trình soạn và làm hỏng việc đăng chương. Anh gật thì tôi nâng + chạy lại `t_admin_*`.

### 5. THẤP — `tools/pull_from_kv.py` không lọc `slug` trước khi ghép đường dẫn

Dòng 146: `path = os.path.join(a.books, slug + '.json')` với `slug` lấy thẳng từ
registry trên KV. Slug kiểu `../../_redirects` sẽ ghi ra ngoài `data/book/`, và
workflow có `git add … _redirects` nên tệp đó **sẽ bị commit**.

Xếp THẤP vì muốn trồng slug độc thì kẻ tấn công **đã phải có `ADMIN_KEY`**
(chỉ admin ghi được registry) — tức không phải bước leo thang. Vẫn nên vá một
dòng phòng hờ: `slug = re.sub(r'[^a-z0-9\-]', '', slug.lower())` và bỏ qua nếu rỗng.

### 6. THẤP — CSP cho phép `script-src 'unsafe-inline'`

`_headers` đang đặt `script-src 'self' 'unsafe-inline' …` vì các trang HTML có
`<script>` nội tuyến (đoạn áp tông màu chống nháy nền). Hệ quả: nếu có một chỗ
nào lọt HTML, CSP không chặn được script. Muốn siết thì chuyển các đoạn nội
tuyến sang tệp ngoài rồi dùng `nonce`/`hash` — việc này đụng mọi trang nên tôi
để riêng một lượt.

---

## Việc cần làm sau khi merge

1. Merge → Cloudflare Pages tự deploy → `_redirects` mới có hiệu lực.
2. Kiểm lại bằng chính hai URL từng hở:
   ```bash
   curl -sI https://ssochuz.pages.dev/admin.js.map | head -1        # kỳ vọng 301
   curl -sI https://ssochuz.pages.dev/BAO-CAO-ADMIN-V2.md | head -1 # kỳ vọng 301
   ```
3. **Lưu ý:** chặn bằng `_redirects` chỉ ngừng *phục vụ*, tệp vẫn nằm trong
   repo và trong deployment. Source map của các bản cũ **vẫn còn trong cache/CDN
   và trong lịch sử Git** — nếu coi mã admin là nhạy cảm thì nên đổi
   `ADMIN_KEY` + `SESSION_SECRET` và cân nhắc dừng phát hành `.map` hẳn.
