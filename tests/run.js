/* Chạy toàn bộ kiểm thử giao diện (jsdom).
   Cài 1 lần:   cd tests && npm i
   Chạy:        node tests/run.js
   Mỗi bài in ra JSON; mọi khoá "errors*" phải là [] thì mới coi là đạt.
     t_config.js       cấu hình Worker (thiếu https://, thừa /, để trống)
     t_html.js         HTML tĩnh + _redirects (đích .html ⇒ vòng lặp ERR_TOO_MANY_REDIRECTS)
     t_space_hero.js   MY SPACE: hero "Hồ sơ của bạn" phải CĂN ĐÚNG — vòng tròn là
                       con của hộp ảnh (đồng tâm theo cấu trúc, không neo left/top cứng),
                       mọi cỡ ảnh đi qua --sp-ava, không còn .space-hero trong @media đặt
                       cột lưới; hộp thoại tủ truyện có head/body/foot (nút lưu luôn thấy
                       được) và không đặt display ngoài [open]
     t_mobile.js       MÁY NHỎ: menu mở được cả khi máy bật “giảm chuyển động”, công tắc
                       sáng/tối đổi đúng một nhịp, bộ icon Tabler được chuẩn hoá
     t_home.js         trang chủ: hero, thư viện, lọc/tìm, kệ đọc tiếp, tủ truyện
     t_stats.js        số liệu Firebase thật: BXH theo lượt đọc/bình chọn, sắp xếp “đọc nhiều nhất”
     t_story.js        trang truyện + trang đọc: chuyển chương, cài đặt, truyện 0 chương
     t_reader.js       yêu cầu của chủ trang: thích theo chương, BXH nhảy số, bình luận
                       trong trang đọc (khách cũng gửi được), icon tủ/thẻ khác nhau,
                       số chương tự sửa, nút đăng nhập ở trang chủ, ẩn mục Quản trị
     t_flows.js        luồng thật: cài đặt đọc, đánh dấu, ảnh chương; admin: tự nối
                       phiên đã lưu + không có phím tắt toàn cục
     t_mystats.js      N10 thống kê đọc cá nhân (localStorage, không tốn request/KV)
     t_rating.js       N11 đánh giá sao (chỉ trang truyện, retry 1 lần khi ghi trượt)
     t_adult.js        N12 vá giao diện: nhãn hero, BXH phụ số liệu, chốt 18+
     t_fallback.js     N13 phao cứu sinh: bỏ preconnect Firestore, retry 1 lần rồi rớt tĩnh
     t_people_data.js  DỮ LIỆU trang tác giả/couple: người đọc có theo dõi truyện
                       (ssochuz-follow khác rỗng) thì registry về SAU init() —
                       libCache không được đóng băng ở bản rỗng; cache/localStorage
                       nhiễm bản rỗng vẫn tự lành; mất sạch nguồn thì báo lỗi kèm
                       nút “Thử lại” chạy thật chứ không đứng ở “Đang tải…”
     t_sweep.js        bấm hết mọi nút trong trang xem có lỗi JS nào không
     t_schedule.mjs    HẸN GIỜ CHƯƠNG + LƯU 1 CHƯƠNG + DUNG LƯỢNG ẢNH: chương hẹn
                       giờ tương lai KHÔNG lọt ra /api/book công khai, RSS, số chương;
                       cron tới mốc tự cập nhật registry + báo đẩy; PUT /api/book/<slug>/chapter
                       (lưu/xoá/đổi thứ tự 1 chương — nút Lưu chương); ảnh có ID theo
                       nội dung không ghi thêm bản sao, ảnh chương đi Supabase Storage
     t_worker.mjs      CHẠY THẬT worker/cms.js (KV giả trong RAM): kênh đăng, sync
                       Blogger, đăng nhập Google, bình luận, đếm lượt đọc/bình chọn
                       + nhóm BẢO MẬT (CORS đúng ranh giới tên miền, chặn dò khoá,
                       link javascript:, ảnh đại diện lạ, HTML nhập từ Blogger)
     t_registry_guard.mjs  CHẶN GHI ĐÈ MẤT DỮ LIỆU: PUT registry rỗng đè lên kho
                       đang có sách → 400; kèm force:true (xoá bộ cuối) → ok
     t_kv_quota.mjs    HẠN MỨC KV (thư cảnh báo 90% của Cloudflare): nhịp ghi khoá
                       `stats` tự giãn theo ngân sách ngày (bản cũ ghi mỗi 10 giây
                       = 8.640 lượt/ngày > 1.000 lượt miễn phí), 500 lượt xem /
                       60 lần gửi bình luận không đốt lượt ghi, tổng đánh giá gộp
                       về 1 khoá `rateagg` (hết LIST mỗi lần /api/stats trượt cache)
     check_src.js      bản phát hành ở gốc (đã rút gọn) có khớp src/ không
     check_secrets.js  không dán nhầm secret/email riêng vào tệp public
     check_headers.js  _headers áp theo THỨ TỰ trong tệp: /sw.js phải được gọi mạng
                       ra ngoài (tải hộ ảnh bìa host ngoài), trang vẫn giữ CSP nghiêm
     t_sw_img.js       chạy THẬT sw.js trong phạm vi giả: tự đọc CSP của mình — CSP mở
                       thì tải hộ + cache ảnh bìa, CSP chặn thì để trình duyệt tải (không
                       request lỗi nào), bị chặn bất ngờ thì nhường 302 — không bao giờ
                       trả ảnh lỗi (đúng lỗi "vào trang lần đầu còn bìa, F5 là mất bìa")
     t_devserver.js    bật THẬT tools/dev_server.py rồi gọi HTTP: /truyen, /truyen/,
                       /truyen/<slug>/, /reader/<slug>/, /admin, /admin-v2,
                       /admin-legacy, /admin.html (308)… phải giống Cloudflare Pages
                       (không 404/508), và bộ bắt vòng lặp _redirects vẫn phải trả 508
                       khi luật sai
     t_admin_chapter.js  khung sửa chương: nháp localStorage ghi NGAY khi đổi chương
                       (không mất chữ đang gõ), ô ngày/giờ cho “Hẹn giờ” + nút
                       +1 ngày, và “Lưu chương” chỉ PUT 1 chương (không gửi lại
                       cả bộ, không ghi lại registry từ admin)
     t_admin_upload.js  nén ảnh theo hạn mức dung lượng (bìa ≤ 120 KB) + ID theo
                       nội dung để KHÔNG lưu thêm bản sao ảnh trùng
     t_admin_sidebar.js  sidebar admin: thu gọn menu phải là rail CHỈ-ICON vẫn bấm
                       được (luật cũ ẩn cả span.admin-nav-icon ⇒ cột trắng trống, mà
                       trạng thái dính localStorage nên F5 vẫn hỏng); drawer ≤900px
                       không bao giờ bị trạng thái thu gọn làm trống */
const path = require('path'), { spawnSync } = require('child_process');
const cands = (process.env.CZ_TEST_MODULES || '').split(path.delimiter).filter(Boolean)
  .concat([path.join(__dirname, 'node_modules'), path.join(__dirname, '..', 'node_modules')]);
const env = Object.assign({}, process.env, { NODE_PATH: cands.join(path.delimiter) });
const files = [path.join('..', 'tools', 'check_src.js'), path.join('..', 'tools', 'check_secrets.js'), path.join('..', 'tools', 'check_headers.js'), 't_worker.mjs', 't_kv_quota.mjs', 't_schedule.mjs', 't_registry_guard.mjs', 't_private.mjs', 't_member_spaces.mjs', 't_space.js', 't_space_hero.js', 't_auth_flow.js', 't_rating_withdraw.js', 't_private_ui.js', 't_config.js', 't_html.js', 't_follow.js', 't_feed.js', 't_push.js', 't_people.js', 't_people_data.js', 't_notif.js', 't_pwa.js', 't_sw_img.js', 't_devserver.js', 't_preload.js', 't_view.js', 't_chapter_url.js',
  't_chapters.js', 't_home.js', 't_mobile.js', 't_stats.js', 't_ranking.js', 't_quiet_home.js', 't_ranking_worker.mjs', 't_synopsis.js', 't_story.js', 't_reader.js', 't_flows.js', 't_sweep.js', 't_mystats.js', 't_rating.js', 't_adult.js', 't_fallback.js', 't_lock.mjs', 't_lock_ui.js', 't_admin_core.js', 't_admin_online.js', 't_admin_writes.js', 't_admin_chapter.js', 't_admin_upload.js', 't_admin_budget.js', 't_admin_features.js', 't_admin_sidebar.js'];
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 180000, env });
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim().split('\n').slice(0, 3).join(' | ');
  const badErr = (out.match(/"errors\d*":\s*\[[^\]]/g) || []).length;
  const ok = r.status === 0 && !badErr;
  if (!ok) bad++;
  console.log((ok ? '✓ ĐẠT  ' : '✗ LỖI  ') + f + (err ? '  → ' + err : ''));
  if (!ok) console.log((out + '\n' + err).slice(0, 1200));
}
console.log(bad ? '\n' + bad + ' bài lỗi' : '\nTất cả bài kiểm thử đều đạt');
process.exit(bad ? 1 : 0);
