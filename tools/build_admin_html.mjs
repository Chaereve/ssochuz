/* ============================================================================
   build_admin_html.mjs · sinh admin.html (GIAO DIỆN QUẢN TRỊ DUY NHẤT)
   ----------------------------------------------------------------------------
   Nguồn thiết kế: mockup/ssochuz-admin-mockup.html (một file HTML tự chứa,
   13 tab / 5 nhóm / design system). Bản sinh GIỮ NGUYÊN toàn bộ CSS và hàm
   render, chỉ thêm:

     1. cầu nối window.CZ_MOCKUP ngay trước </script> của script inline;
     2. <script src="/admin-real.js?v=<sha1>"> nạp lớp đọc/ghi KV thật;
     3. đổi nhãn DỮ LIỆU MẪU → DỮ LIỆU THẬT, bỏ link sang bản admin cũ,
        đổi <title>.

   File mockup gốc KHÔNG bị sửa: mở double-click vẫn là prototype tĩnh, không
   gọi Worker. Chạy tự động từ tools/build_admin.mjs (npm run build).
   ========================================================================== */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'mockup', 'ssochuz-admin-mockup.html');
const REAL = path.join(ROOT, 'admin-real.js');
const OUT = path.join(ROOT, 'admin.html');

const BRIDGE = `
/* ---------- CẦU NỐI DỮ LIỆU THẬT (chỉ có ở admin.html, không có ở mockup) ----------
   admin-real.js chạy SAU script inline; lấy state/render và các hàm gốc qua đây rồi
   đổ dữ liệu KV thật vào giao diện. Không đổi mã render của bản thiết kế. */
window.CZ_MOCKUP = {
  state: state, render: render, toast: toast, esc: esc, cover: cover,
  navigate: navigate, getBook: getBook, initEditModels: initEditModels,
  clearErrors: clearErrors, setErr: setErr, focusFirst: focusFirst,
  openStrong: openStrong, openSimple: openSimple,
  sanitizeEditorHtml: sanitizeEditorHtml, download: download,
  SAMPLE_METRICS: SAMPLE_METRICS, SAMPLE_READS: SAMPLE_READS,
  SAMPLE_STATS: SAMPLE_STATS, SAMPLE_ISSUES: SAMPLE_ISSUES,
  SAMPLE_NOTIFS: SAMPLE_NOTIFS, SAMPLE_LOGS: SAMPLE_LOGS
};
`;

let html = readFileSync(SRC, 'utf8');
const realHash = createHash('sha1').update(readFileSync(REAL)).digest('hex').slice(0, 10);

const end = html.lastIndexOf('</script>');
if (end < 0) throw new Error('mockup không có thẻ </script> của script inline');
html = html.slice(0, end) + BRIDGE + html.slice(end);

const body = html.lastIndexOf('</body>');
if (body < 0) throw new Error('mockup không có thẻ </body>');
html = html.slice(0, body) +
  '<script src="/admin-real.js?v=' + realHash + '"></script>\n' +
  html.slice(body);

/* Nhãn: bản phát hành là dữ liệu thật, không còn "mẫu". */
html = html
  .replace('<title>ssochuz library · Admin mockup · DỮ LIỆU MẪU</title>',
    '<title>ssochuz library · Quản trị · Cloudflare KV</title>')
  .replace('<meta name="robots" content="noindex">',
    '<meta name="robots" content="noindex">\n' +
    '<link rel="icon" type="image/png" href="/ssochuz.png?v=1">\n' +
    '<link rel="apple-touch-icon" href="/ssochuz.png?v=1">\n' +
    '<link rel="manifest" href="/manifest.webmanifest">')
  .replace(/DỮ LIỆU MẪU — không phải dữ liệu thật/g, 'DỮ LIỆU THẬT TỪ CLOUDFLARE KV')
  .replace(/DỮ LIỆU MẪU/g, 'DỮ LIỆU THẬT')
  /* Màn đăng nhập / modal: prototype nói "mô phỏng, không gọi Worker thật" —
     bản phát hành gọi Worker THẬT nên phải đổi những câu này, không chỉ đổi nhãn. */
  .replace('Ghi cần đăng nhập, lưu vào KV. Mockup: không kết nối thật.',
    'Ghi cần đăng nhập, lưu trực tiếp vào Cloudflare KV.')
  .replace('Kết nối bằng ADMIN_KEY (mẫu).', 'Kết nối bằng ADMIN_KEY qua header x-admin-key.')
  .replace('Đăng nhập với Supabase (mô phỏng)', 'Đăng nhập Supabase (chỉ dành cho độc giả)')
  .replace('Kết nối (mô phỏng)', 'Kết nối và đọc KV')
  .replace('Vào Dashboard mẫu', 'Vào Dashboard (chỉ đọc)')
  .replace('không nhập key thật', 'nhập ADMIN_KEY của Worker')
  .replace('DỮ LIỆU THẬT · không lưu khoá, không gọi Worker thật.<br>Đổi chip/quota ở bảng demo góc dưới.',
    'ADMIN_KEY chỉ lưu trong phiên này (sessionStorage), không ghi vào localStorage.<br>URL Worker được nhớ trên máy; không gửi khoá cho bên thứ ba.')
  .replace('Mọi thao tác chỉ mô phỏng.', 'Thao tác này ghi trực tiếp lên Cloudflare KV.')
  .replace("ph:'Thông báo mẫu'", "ph:'Nội dung thông báo'")
  .replace("ph:'https://mau.example'", "ph:'https://…'")
  .replace("ph:'Chương 65 · tiêu đề mẫu'", "ph:'Chương 65 · tiêu đề'")
  .replace("ph:'Ghi chú lịch mẫu'", "ph:'Ghi chú lịch'")
  .replace('aria-label="Nội dung chương mẫu"', 'aria-label="Nội dung chương"')
  .replace('title="Ngày mẫu: ', 'title="Ngày: ');

/* Không còn link sang bản admin cũ; admin.html TỰ ghi KV. */
html = html.replace(
  /'<a href="\/admin[^"]*"[^>]*>[^<]*<\/a><\/div>';/g,
  "'</div>';");

html = html.replace('<body>', '<!-- admin.html được sinh từ mockup/ssochuz-admin-mockup.html bởi tools/build_admin_html.mjs; sửa thiết kế ở file mockup rồi chạy npm run build. -->\n<body>');

writeFileSync(OUT, html);
console.log('  admin.html ← mockup + admin-real.js?v=' + realHash + ' (' + Buffer.byteLength(html) + ' byte)');
