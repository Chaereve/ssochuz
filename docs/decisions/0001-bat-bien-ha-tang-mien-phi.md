# ADR 0001 — Bất biến hạ tầng miễn phí của ssochuz

- Ngày: 2026-09-30
- Trạng thái: **Đề xuất** (chờ owner xác nhận; các ràng buộc bên dưới được suy ra từ hạ tầng và code hiện có, không phải thay đổi mới)
- Người soạn: phiên đánh giá sản phẩm (Arena agent)

## Bối cảnh

ssochuz chạy hoàn toàn trên free tier: Cloudflare Pages (web tĩnh), Cloudflare Workers + KV + Durable Objects SQLite (API và dữ liệu), Supabase Free (overflow Postgres, Storage ảnh bìa, Auth), GitHub Actions (sao lưu). Số liệu hạn mức đã được xác minh ngày 2026-09-30 trong `docs/free-tier-verification.md`.

Repo đã có 2 sự cố thật liên quan hạn mức/ cấu hình: đốt hạn mức ghi KV (`BAO-CAO-TIET-KIEM-KV.md`) và mất biến `SUPABASE_URL` khi deploy làm hỏng đường đọc (`BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md`). Vì vậy các ràng buộc dưới đây cần được coi là **bất biến**, không phải "khuyến nghị".

## Quyết định

1. **Ngân sách hạ tầng: $0/tháng.** Không thêm dịch vụ yêu cầu thẻ, không bật billing, không dùng free trial tự chuyển sang trả phí, không auto-scale/auto-top-up.
2. **Mọi thay đổi phải nêu rõ chi phí hạn mức**: số lượt **ghi** KV phát sinh (trần 1.000/ngày), số lượt **đọc** KV ước tính (trần 100.000/ngày), số request Worker (100.000/ngày), và dung lượng Supabase (500 MB DB / 1 GB Storage / 5 GB egress).
3. **Giữ nguyên nền tảng**: Cloudflare Pages + Workers (KV/DO) + Supabase Free. Đổi nhà cung cấp hoặc thêm dịch vụ ngoài chỉ khi có phê duyệt riêng của owner.
4. **Dữ liệu truyện trong `data/*.json` là đường lùi tĩnh có chủ đích** (không phải secret). Thay đổi chính sách công khai dữ liệu là **quyết định của owner** (G8).
5. **Không thêm telemetry/AI/email thành phần bắt buộc** của luồng lõi; mọi thứ loại này là tuỳ chọn và phải có nhánh không phụ thuộc nó.
6. **Đo trước – sửa sau**: mọi thay đổi liên quan quota/đường đọc phải ghi số đo trước/sau (ví dụ `node tools/bench_kv.mjs .` hoặc đếm request trong test).

## Hệ quả

- Tích cực: chi phí vận hành bằng 0, không rủi ro hóa đơn; buộc thiết kế tiết kiệm (cache biên, ngân sách ghi, đọc nhẹ từng chương) — những thứ này cũng làm web nhanh hơn.
- Tiêu cực: có trần cứng; khi đông người đọc, phải hạ cấp mềm thay vì tăng hạn mức. Trần đọc KV 100k/ngày là giới hạn thực tế cần theo dõi (Milestone A2).
- Việc nâng lên Workers Paid ($5/tháng) là phương án dự phòng **chỉ khi** vượt trần thật và có phê duyệt; không tự thực hiện.
