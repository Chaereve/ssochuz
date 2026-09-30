# G7 — Chuyển bìa về Supabase Storage: kế hoạch (CHƯA THỰC HIỆN)

> Trạng thái: kế hoạch, chờ owner duyệt. Ngày: 2026-09-30. Chưa upload/ghi gì.

## 1. Hiện trạng

- **CONFIRMED** (`data/registry.json`, trường `lib[].thumb`, bản sao lưu trong repo): 63 bìa, trong đó 61 là hotlink host ngoài — `cdn-local.mebmarket.com` 37 · `i.mydramalist.com` 11 · `pbs.twimg.com` 7 · `m.media-amazon.com` 4 · `images.justwatch.com` 1 · `image.tmdb.org` 1. Còn 2 bìa đã nằm trong kho riêng (1 Worker, 1 Supabase). KV mới là bản gốc, nên số thật có thể đã khác — bước dry-run (§3) sẽ cho con số chính xác.
- **CONFIRMED — phần code đã có sẵn, không cần viết thêm:** Worker ≥ 1.17.0 có `POST /api/admin/mirror-images` (`worker/cms.js` → `mirrorImages` trong `worker/overflow.js`, có test trong `tests/t_worker.mjs`, tài liệu ở `worker/README.md`). Endpoint này:
  - đọc `registry` trong KV, lấy các bìa **chưa** nằm trong kho riêng;
  - tải ảnh về, thu nhỏ bằng luật của chính CDN nguồn (cạnh dài ≤ 800 px, `MIRROR_EDGE.cover`);
  - ghi vào Supabase Storage bucket `covers` (không có cấu hình Supabase thì ghi vào KV), kèm một stub `img:<id>` trong KV;
  - đặt `id` = hàm băm URL ⇒ **chạy lại không tạo bản trùng**, chạy được nhiều lần cho tới khi xong;
  - viết lại `thumb`/`slide`/`cover` trong registry, purge cache `/api/registry`, ghi nhật ký hoạt động;
  - có `dryRun: true` để chỉ tải thử, **không ghi** gì.
- **CONFIRMED:** trang `/admin` **chưa có nút** gọi endpoint này (`grep mirror src/admin` rỗng) ⇒ hiện chỉ gọi bằng `curl` kèm `x-admin-key`.

## 2. Chi phí ($0) và hạn mức

| Hạng mục | Ước lượng | Hạn mức free | Kết luận |
| --- | --- | --- | --- |
| Supabase Storage | 61 × ~40–120 KB ≈ **3–7 MB** | 1 GB | Không đáng kể (**LIKELY**, kích thước thật có sau dry-run: `bytesIn`) |
| KV ghi | ~1 stub/bìa + 1 lần ghi registry/lô ≈ **65 lượt, một lần duy nhất** | 1.000/ngày | Chiếm ~7% hạn mức một ngày |
| KV đọc | ~1/bìa + registry | 100.000/ngày | Không đáng kể |
| **Supabase egress** | Người đọc tải bìa **từ Supabase** thay vì từ host ngoài | **5 GB/tháng** | **NEEDS OWNER INPUT** — xem dưới |

Rủi ro egress: trang chủ lazy-load bìa và trình duyệt/SW có cache, nhưng giả sử một khách mới cuộn hết thư viện tải ~63 × 80 KB ≈ 5 MB thì 5 GB ≈ **~1.000 khách mới cuộn hết/tháng**. Vượt hạn mức thì Supabase **chặn chứ không tự tính tiền** (`docs/free-tier-verification.md`). Khi đó bìa lỗi — và vì Supabase Storage còn phục vụ ảnh trong chương, ảnh chương cũng lỗi theo. Hiện egress bìa đang do host ngoài chịu, miễn phí cho ta.

Cách giảm (chọn trước khi chạy): truyền `edge: 400` thay vì 800 mặc định ⇒ thẻ truyện vẫn đủ nét (thẻ hiển thị nhỏ hơn nhiều so với 400 px) và dung lượng mỗi ảnh giảm khoảng 3–4 lần. Trước khi chạy, owner xem Supabase dashboard → Usage để biết egress hiện tại.

## 3. Các bước (owner chạy — sandbox không gọi mạng ra ngoài được)

Điều kiện: Worker đang chạy ≥ 1.17.0 (`/api/health`). Không cần deploy thêm gì.

```bash
W=https://chuseoz-cms.kimtong1906.workers.dev
K='<ADMIN_KEY — không dán vào chat/commit>'

# 1) Dry-run: không ghi gì, xem số bìa, kích thước, bìa nào tải lỗi
curl -s -X POST "$W/api/admin/mirror-images" -H "x-admin-key: $K" \
  -H 'content-type: application/json' -d '{"only":"covers","limit":25,"edge":400,"dryRun":true}'

# 2) Chạy thật theo lô 25 (tối đa của endpoint) cho tới khi "done": true — khoảng 3 lô
curl -s -X POST "$W/api/admin/mirror-images" -H "x-admin-key: $K" \
  -H 'content-type: application/json' -d '{"only":"covers","limit":25,"edge":400}'
```

Đạt khi: kết quả `"done": true`, `failed` rỗng (hoặc chỉ gồm các ảnh đã 404 sẵn ở nguồn — những bìa đó phải tải lên lại bằng tay trong `/admin`); trang chủ (Ctrl+F5) hiện đủ bìa; F12 → Network lọc `mebmarket|mydramalist|twimg|amazon` ⇒ không còn request nào. Sau đó chạy workflow "Đồng bộ KV → repo" để `data/registry.json` trong repo cũng trỏ về link mới.

Rollback: stub `img:*` và file trong Storage có thể giữ lại. Muốn quay về hotlink thì khôi phục `data/registry.json` bản trước (git) rồi đẩy registry lên KV qua `/admin`. Lưu ý: link ngoài nào đã chết thì quay về cũng vẫn 404.

## 4. Cần owner quyết

1. **NEEDS OWNER INPUT:** chấp nhận rủi ro egress 5 GB/tháng (§2)? Nếu chấp nhận thì dùng `edge` 400 hay giữ mặc định 800?
2. Có cần thêm nút "Sao lưu bìa ngoài" trong `/admin` không? (Là việc code nhỏ, thuộc Milestone B, phải có test hồi quy.) Nếu không thì chạy bằng `curl` một lần như trên là đủ.
3. Bìa mới về sau: biên tập viên dán link ngoài thì lại thành hotlink. Có muốn chặn hoặc tự sao lưu khi lưu không? (Đổi hành vi admin — cần duyệt riêng.)
