/* Kiểm tra chống dán nhầm secret / email riêng vào mã được gửi cho trình duyệt.
   Đây không thay thế secret scanner của GitHub, nhưng chặn các lỗi đúng với kiến
   trúc dự án: cấu hình client, registry công khai và giao diện Blogger. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const files = [
  'cz-config.js', 'index.html', 'truyen.html', 'admin.html', 'guide.html', '404.html',
  'cz-app.js', 'cz-auth.js', 'cz-home.js', 'cz-story.js', 'admin.js',
  'src/cz-app.js', 'src/cz-auth.js', 'src/cz-home.js', 'src/cz-story.js',
  'data/registry.json', 'blogger-theme/chuseoz-theme.xml'
];
const errors = [];
const checked = [];

function fail(file, message) { errors.push(file + ': ' + message); }
function decodeJwtRole(value) {
  try {
    const p = String(value).split('.')[1];
    if (!p) return '';
    const pad = p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - p.length % 4) % 4);
    const body = JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
    return String(body.role || '');
  } catch (_) { return ''; }
}

for (const file of files) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) { fail(file, 'thiếu file cần quét'); continue; }
  const text = fs.readFileSync(full, 'utf8');
  checked.push(file);

  if (/CZ_ADMIN_EMAILS\s*=/.test(text)) fail(file, 'không được đặt danh sách email quản trị ở frontend');
  if (/['"]adminEmails['"]\s*:/.test(text)) fail(file, 'registry/frontend không được chứa adminEmails');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) fail(file, 'phát hiện private key');
  if (/\bsb_secret_[A-Za-z0-9_-]{12,}/.test(text)) fail(file, 'phát hiện Supabase secret key');
  if (/\b(?:sk_live|rk_live|re)_[A-Za-z0-9_-]{16,}/.test(text)) fail(file, 'phát hiện API secret key');
  if (/sourceMappingURL\s*=/.test(text)) fail(file, 'bản phát hành không được kèm source map');

  const assignedSecret = /\b(ADMIN_KEY|SESSION_SECRET|SUPABASE_JWT_SECRET|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|RESEND_API_KEY|PRIVATE_KEY)\b\s*[:=]\s*['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(assignedSecret)) {
    if (m[2] && !/^(?:example|placeholder|your[-_]|<)/i.test(m[2])) fail(file, 'phát hiện giá trị gán cho ' + m[1]);
  }

  const sb = /CZ_SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(sb)) {
    if (decodeJwtRole(m[1]) === 'service_role') fail(file, 'đã dán nhầm JWT service_role vào khoá Supabase công khai');
  }

  /* Mã deploy không chứa địa chỉ thật. Địa chỉ ví dụ/test vẫn được phép. */
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  for (const email of emails) {
    const domain = email.toLowerCase().split('@')[1] || '';
    if (!['example.com', 'example.org', 'web.test', 'cms.test', 'test.invalid'].includes(domain)) {
      fail(file, 'email literal phải chuyển sang Secret Worker: ' + email);
    }
  }
}

/* ---------------------------------------------------------------------------
   RÀ RÒ RỈ TỆP NỘI BỘ QUA Cloudflare Pages (bổ sung 23/09 sau khi rà bằng skill
   web-app-scanner — thấy /admin.js.map và 8 tệp BAO-CAO-*.md tải thẳng được).

   Mọi tệp .map / .md ở THƯ MỤC GỐC đều nằm trong vùng Pages phát hành. Luật
   redirect của Pages luôn áp TRƯỚC khi phục vụ tệp tĩnh, nên chặn bằng _redirects
   là đủ — nhưng phải có luật. Thêm tệp nội bộ mới ở gốc mà quên thêm luật là
   kiểm tra này đỏ ngay, không đợi tới lúc người lạ tải được.
   Ngoại lệ duy nhất: THIRD-PARTY-NOTICES.md (ghi công giấy phép, cố ý công khai).
   ------------------------------------------------------------------------ */
const PUBLIC_MD = new Set(['THIRD-PARTY-NOTICES.md']);
const redirectRules = new Set(
  fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => l.trim().split(/\s+/)[0])
);
for (const name of fs.readdirSync(ROOT)) {
  if (!fs.statSync(path.join(ROOT, name)).isFile()) continue;
  const internal = name.endsWith('.map') || (name.endsWith('.md') && !PUBLIC_MD.has(name));
  if (internal && !redirectRules.has('/' + name)) {
    fail('/' + name, 'tệp nội bộ ở thư mục gốc chưa bị _redirects chặn — đang tải công khai được');
  }
}
checked.push('_redirects (chặn tệp nội bộ ở gốc)');

console.log(JSON.stringify({ checked: checked.length, errors0: errors }, null, 1));
if (errors.length) {
  console.log('CÒN ' + errors.length + ' LỖI RÒ RỈ CẤU HÌNH');
  process.exit(1);
}
console.log('Không thấy secret/email riêng trong các tệp gửi xuống trình duyệt.');
