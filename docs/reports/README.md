# Kho báo cáo kỹ thuật & hướng dẫn nội bộ (`docs/reports/`)

Thư mục này gom toàn bộ 32 file báo cáo (`BAO-CAO-*.md`) và hướng dẫn cài đặt (`HUONG-DAN-*.md`) từng nằm ở thư mục gốc của kho mã nguồn (hoàn tất hạng mục **D1**), giúp thư mục gốc chỉ giữ đúng các tệp phục vụ Cloudflare Pages và cấu hình dự án.

Mọi đường dẫn `/docs/*` đều được chặn công khai qua `_redirects` (`/docs/* / 301`) và được kiểm tra tự động trong `tools/check_secrets.js`.

## 1. Hướng dẫn cài đặt & vận hành
- [`HUONG-DAN-DANG-NHAP-BINH-LUAN.md`](./HUONG-DAN-DANG-NHAP-BINH-LUAN.md) — Hướng dẫn 3 bước cấu hình đăng nhập Google / Supabase và bình luận.
- [`HUONG-DAN-GHEP-CLOUDFLARE-WORKER.md`](./HUONG-DAN-GHEP-CLOUDFLARE-WORKER.md) — Hướng dẫn nối Cloudflare Worker (`worker/cms.js`) với KV.
- [`HUONG-DAN-SUA-TRUYEN.md`](./HUONG-DAN-SUA-TRUYEN.md) — Hướng dẫn biên tập truyện và chương trong trang quản trị `/admin`.

## 2. Báo cáo kiểm toán, kiến trúc & lộ trình
- [`BAO-CAO-D3-LIGHTHOUSE-VA-A11Y.md`](./BAO-CAO-D3-LIGHTHOUSE-VA-A11Y.md) — **Mới (v1.18.0)**: Báo cáo hoàn tất G10 (một nguồn phiên bản), Milestone C / D3 (Lighthouse tĩnh, trợ năng `axe-core`, bàn phím trình soạn thảo, cảnh báo dung lượng build), D1 (gom báo cáo về `docs/reports/`), D2 (nâng Tiptap 2 → 3 vá 25 cảnh báo bảo mật), tối ưu workflow sao lưu ảnh bìa và dọn 9 workflow `tmp-*`.
- [`BAO-CAO-AUDIT-VA-KE-HOACH.md`](./BAO-CAO-AUDIT-VA-KE-HOACH.md) — Báo cáo kiểm toán tổng thể và kế hoạch cải tiến toàn dự án.
- [`BAO-CAO-TOAN-DIEN.md`](./BAO-CAO-TOAN-DIEN.md) — Báo cáo tổng hợp các đợt nâng cấp G1–G9 và bảo mật S1–S11.
- [`BAO-CAO-KIEM-TRA-TOAN-BO-WEB.md`](./BAO-CAO-KIEM-TRA-TOAN-BO-WEB.md) — Báo cáo rà soát toàn bộ trang công khai và quản trị.
- [`BAO-CAO-NANG-CAP-TRANG-QUAN-TRI.md`](./BAO-CAO-NANG-CAP-TRANG-QUAN-TRI.md) — Báo cáo nâng cấp trang quản trị hợp nhất `/admin`.
- [`BAO-CAO-SUA-10-DIEM-QUAN-TRI.md`](./BAO-CAO-SUA-10-DIEM-QUAN-TRI.md) — Báo cáo xử lý 10 điểm vận hành trang quản trị.
- [`BAO-CAO-SUA-6-DIEM-CON-LAI.md`](./BAO-CAO-SUA-6-DIEM-CON-LAI.md) — Báo cáo hoàn thiện 6 điểm tồn đọng sau đợt kiểm toán.
