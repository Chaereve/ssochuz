# Áp dụng ECC vào ssochuz — quy trình tinh gọn

Nguồn đã đọc: repo [`affaan-m/ECC`](https://github.com/affaan-m/ECC) @ `main` (`c70874f`), ngày 2026-09-30. Đã đọc trực tiếp: `README.md`, `.agents/skills/product-capability/SKILL.md` (một phần), `.agents/skills/plan-canvas/SKILL.md` (một phần), `.agents/skills/tdd-workflow/SKILL.md` (một phần), `.agents/skills/e2e-testing/SKILL.md` (một phần), `.agents/skills/security-review/SKILL.md`, `.agents/skills/frontend-patterns` (chỉ tồn tại), `skills/search-first/SKILL.md`, `skills/verification-loop/SKILL.md`, `agents/code-reviewer.md`, `agents/architect.md`. **Không cài đặt gì từ ECC vào repo này.**

## 1. Nguyên tắc áp dụng

1. **Chọn lọc, không nhồi**: ECC là hệ sinh thái skill/agent cho nhiều ngôn ngữ và nhiều loại dự án. ssochuz là web tĩnh + 1 Worker JS — chỉ lấy phần trả lời được câu hỏi đang có.
2. **Không tạo file cấu hình chết**: mỗi capability chỉ được áp dụng nếu nó sinh ra một artifact cụ thể (blueprint, test, check, ADR).
3. **Không cài plugin/CLI, không dùng phần trả phí**: ECC Pro/GitHub App là dịch vụ trả phí ($19/seat/tháng theo README) → **không dùng**. Chỉ dùng nội dung trong repo mã nguồn mở.
4. **Tôn trọng quy ước ssochuz**: test chạy trên bản đã build, tiếng Việt trong tài liệu và comment, chú thích "VÁ (ngày…)" giữ nguyên.

## 2. Ma trận lựa chọn

| ECC capability / workflow | Dùng cho giai đoạn nào | Áp dụng vào ssochuz | Không áp dụng khi nào | Artifact đầu ra |
| --- | --- | --- | --- | --- |
| `search-first` (nghiên cứu trước khi viết code; ma trận Adopt/Extend/Compose/Build) | Phase 0 → 2, và mỗi lần chuẩn bị thêm dependency | Kiểm tra "repo đã có gì" trước khi thêm bất kỳ thư viện nào; ví dụ: cần nén ảnh → đã có `src/admin/utils/images.js`; cần mirror ảnh → đã có `POST /api/admin/mirror-images`; cần đo quota → đã có `/api/admin/kv` | Khi sửa lỗi nhỏ trong 1 tệp đã hiểu rõ | Mục "Alternatives and decision" trong feature blueprint + ADR |
| `architect` (phân tích hiện trạng → yêu cầu → thiết kế → trade-off) | Phase 2, và mọi thay đổi chạm dữ liệu/quota | Bảng trade-off 2+ phương án cho G1 (dự phòng tĩnh) và G2 (đo lượt đọc) | Thay đổi copy/UI thuần | `docs/features/*.md` §"Alternatives and decision" |
| `tdd-workflow` (RED → GREEN → REFACTOR) | Phase 5 (implementation), đặc biệt cho hồi quy | Viết bài đo trước: ví dụ `t_chapter_light.mjs` thêm nhánh "Worker lỗi liên tục → đọc bản lưu" **trước** khi sửa `cz-story.js`; chạy trên bản build | Khi chỉ đổi nội dung KV (không phải mã) | Test mới trong `tests/`, nằm trong `tests/run.js` |
| `verification-loop` (build → typecheck → lint → test → security grep → diff review) | Phase 5, trước mỗi lần giao việc | bản địa hoá thành: `npm run build` → `npm run check:worker` → `npm test` → `node tools/check_secrets.js` → tự review diff. **Bỏ bước lint** (repo chưa có ESLint) | Không dùng "lint" như bằng chứng chất lượng khi chưa cấu hình lint | Checklist trong completion report |
| `e2e-testing` (page object, critical path, ít mà chắc) | Phase 5, cho luồng đọc/soạn | Ưu tiên 3 luồng: mở chương → chuyển chương → quay lại đúng chỗ; soạn → lưu chương; admin khôi phục backup. Đã có `tests/t_*_browser.js` — giữ, không nhân bản thành bộ nặng | Khi đã có test jsdom tương đương và rủi ro thấp | Danh sách critical path + chạy tay có ghi lại |
| `security-review` (secrets, input validation, upload, endpoint mới) | Phase 2 và mỗi khi thêm endpoint | Trước khi thêm bất kỳ route Worker nào: rà `ADMIN_KEY`, CORS `ALLOW_ORIGIN`, allowlist HTML chương, giới hạn upload, không log PII | Khi thay đổi chỉ là CSS/copy | Mục "Security" trong feature blueprint |
| `code-reviewer` (lọc theo độ tin cậy > 80%, "HIGH/CRITICAL cần bằng chứng", cho phép 0 finding) | Phase 5, bước 5 (fresh-context review) | Áp nguyên tắc: chỉ báo lỗi nêu được dòng + kịch bản lỗi cụ thể; không báo style; được phép kết luận "không có vấn đề" | Không dùng để tự khen/kể thành tích | Mục "Fresh review" trong completion report |
| `plan-canvas` (khung kế hoạch trước khi làm) | Phase 2–3 | Dùng **nội dung** (mục tiêu → mốc → tiêu chí xong) để viết `docs/product-improvement-roadmap.md`; **không** tạo template riêng trong repo | Khi kế hoạch chỉ 1 việc rõ ràng | Roadmap + milestone checklist |
| `product-capability` (đánh giá năng lực sản phẩm) | Phase 1 | Dùng làm khung cho `docs/product-discovery.md` (định nghĩa, JTBD, mức trưởng thành) | Không thay thế việc hỏi owner về mục tiêu kinh doanh | `docs/product-discovery.md` |
| `frontend-patterns` | Phase 5 | Chỉ lấy nguyên tắc "component nhỏ, state rõ"; ssochuz dùng IIFE thuần + Preact cho admin, **không** chuyển sang React/Next | Khi định đổi framework/kiến trúc — ngoài phạm vi cho phép | — |
| `benchmark-methodology` / `eval-harness` | Chỉ khi cần so sánh trước–sau | Có ích cho A1/G2 (đo trước–sau bằng `node tools/bench_kv.mjs .` và đếm request trong test) | Không dựng harness mới cho việc nhỏ | Số đo trước/sau trong báo cáo |
| Hooks / agents tự động, plugin `ecc@ecc`, GitHub App, ECC Pro | — | **Không dùng** | — | — |

## 3. Quy trình tinh gọn đề xuất cho ssochuz (đủ nghiêm cho việc rủi ro cao)

```
Ticket nhỏ (1 tệp, không chạm dữ liệu/CSP)
  1. Đọc code liên quan + test đang canh nó
  2. Sửa trong src/ → npm run build → npm test
  3. Nếu chạm UI: kiểm 390px/1440px bằng tay; nếu chạm CSP/SW: chạy t_browser nếu có Chromium
  4. Tự review diff (nguyên tắc code-reviewer) → báo cáo ngắn

Ticket vừa/lớn (chạm Worker, dữ liệu, quota, quyền)
  1. Viết phần "contract" (feature statement, scope, acceptance criteria)
  2. Viết test đỏ trước (tdd) — trên bản build
  3. Implement + trạng thái loading/empty/error/permission
  4. verification-loop: build → check:worker → npm test → check_secrets → smoke route thật
  5. Fresh review + ghi lại số đo trước/sau (quota/byte)
  6. Cập nhật docs/features + ADR nếu đổi quyết định
```

## 4. Những gì KHÔNG lấy từ ECC (và vì sao)

| Không lấy | Lý do |
| --- | --- |
| Cài plugin/agent vào repo (`agents/`, `.agents/`) | ssochuz không dùng Claude Code làm môi trường chạy; thêm file sẽ gây nhiễu và không ai dùng |
| Quy trình test đa framework (Jest/Vitest/Playwright full) | Repo đã có bộ test jsdom + worker KV giả rất tốt, chạy nhanh, không cần thêm runner |
| Coverage bắt buộc | Sẽ khuyến khích test hình thức; ssochuz đang mạnh ở test hành vi |
| "Always search npm before writing code" cứng nhắc | Với web tĩnh + Worker, mỗi dependency mới còn phải qua CSP và bundle size; mặc định là **không thêm** |
| ECC Pro, GitHub App, marketplace plugin | Chi phí định kỳ, vi phạm ràng buộc $0/tháng |
