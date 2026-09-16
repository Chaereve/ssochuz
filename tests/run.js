/* Chạy toàn bộ kiểm thử giao diện (jsdom).
   Cài 1 lần:   cd tests && npm i
   Chạy:        node tests/run.js
   Mỗi bài in ra JSON; mọi khoá "errors*" phải là [] thì mới coi là đạt.
     t_config.js       cấu hình Worker (thiếu https://, thừa /, để trống)
     t_html.js         HTML tĩnh + _redirects (đích .html ⇒ vòng lặp ERR_TOO_MANY_REDIRECTS)
     t_mobile.js       MÁY NHỎ: menu mở được cả khi máy bật “giảm chuyển động”, công tắc
                       sáng/tối đổi đúng một nhịp, bộ icon Tabler được chuẩn hoá
     t_home.js         trang chủ: hero, thư viện, lọc/tìm, kệ đọc tiếp, tủ truyện
     t_stats.js        số liệu Firebase thật: BXH theo lượt đọc/bình chọn, sắp xếp “đọc nhiều nhất”
     t_story.js        trang truyện + trang đọc: chuyển chương, cài đặt, truyện 0 chương
     t_reader.js       yêu cầu của chủ trang: thích theo chương, BXH nhảy số, bình luận
                       trong trang đọc (khách cũng gửi được), icon tủ/thẻ khác nhau,
                       số chương tự sửa, nút đăng nhập ở trang chủ, ẩn mục Quản trị
     t_flows.js        luồng thật: cài đặt đọc, đánh dấu, xoá chương/bộ, phím tắt
     t_doctor.js       Bác sĩ dữ liệu · soi trùng tiêu đề chương (KHÔNG cần jsdom): tách
                       "đăng trùng" (giống cả chữ) với "đặt nhầm tên/số" (khác chữ, nhảy số chương),
                       rồi quét toàn bộ data/book coi còn bộ nào lặp tiêu đề không
     t_sweep.js        bấm hết mọi nút trong trang xem có lỗi JS nào không
     cf_admin_test.js  trang quản trị với Worker giả (đăng chương, sửa, cài đặt, số liệu)
     t_worker.mjs      CHẠY THẬT worker/cms.js (KV giả trong RAM): kênh đăng, sync
                       Blogger, đăng nhập Google, bình luận, đếm lượt đọc/bình chọn
                       + nhóm BẢO MẬT (CORS đúng ranh giới tên miền, chặn dò khoá,
                       link javascript:, ảnh đại diện lạ, HTML nhập từ Blogger)
     check_src.js      bản phát hành ở gốc (đã rút gọn) có khớp src/ không
     check_secrets.js  không dán nhầm secret/email riêng vào tệp public */
const path = require('path'), { spawnSync } = require('child_process');
const cands = (process.env.CZ_TEST_MODULES || '').split(path.delimiter).filter(Boolean)
  .concat([path.join(__dirname, 'node_modules'), path.join(__dirname, '..', 'node_modules')]);
const env = Object.assign({}, process.env, { NODE_PATH: cands.join(path.delimiter) });
const files = [path.join('..', 'tools', 'check_src.js'), path.join('..', 'tools', 'check_secrets.js'), 't_worker.mjs', 't_config.js', 't_html.js', 't_follow.js', 't_pwa.js', 't_preload.js', 't_home.js', 't_mobile.js', 't_stats.js', 't_story.js', 't_reader.js', 't_flows.js', 't_doctor.js', 't_sweep.js', 'cf_admin_test.js'];
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
