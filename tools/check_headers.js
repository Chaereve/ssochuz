/* ============================================================================
   check_headers.js · soi `_headers` bằng ĐÚNG cách Cloudflare áp luật
   ----------------------------------------------------------------------------
   Vì sao cần: `_headers` không phải “luật khớp là xong”. Cloudflare (asset
   server dùng chung cho Pages/Workers) duyệt các luật KHỚP THEO THỨ TỰ TRONG
   TỆP, mỗi luật: xoá header ghi bằng `! Tên` trước, rồi mới đặt header của luật;
   header trùng tên ở luật sau thì bị NỐI BẰNG DẤU PHẨY (mà nhiều CSP nối nhau =
   phải thoả CẢ HAI, tức là luật nghiêm hơn thắng).

   Bài học có thật trong repo: sw.js phải tải hộ ảnh bìa ở host ngoài, nhưng nó
   chịu CSP của chính phản hồi chứa nó. Luật `/*` liệt kê connect-src chỉ
   'self' + workers.dev/supabase/e2b ⇒ SW gọi ảnh bìa ra host ngoài bị chặn,
   trả ảnh lỗi, trang gỡ bìa (vào trang lần đầu còn bìa, F5 là mất sạch).
   Muốn bỏ CSP đó cho riêng /sw.js thì luật `! Content-Security-Policy` PHẢI
   NẰM SAU khối `/*` trong tệp. File này mô phỏng lại để bắt đúng lỗi đó —
   kể cả khi ai đó dời khối luật đi chỗ khác.

   Chạy:  node tools/check_headers.js      (npm test cũng gọi bài này)
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = '_headers';
const errors = [];

/* ---------- 1. đọc tệp: khối đầu là đường dẫn, dòng thụt lề là header ---------- */
function parse(text) {
  const rules = [];
  let cur = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    if (!/^\s/.test(raw)) {                       /* không thụt lề ⇒ đường dẫn */
      cur = { path: line, line: i + 1, set: {}, unset: [], order: rules.length };
      rules.push(cur);
      return;
    }
    if (!cur) { errors.push(FILE + ':' + (i + 1) + ' header nằm trước mọi đường dẫn'); return; }
    if (line.startsWith('!')) {                    /* `! Tên` = bỏ header này */
      const name = line.replace(/^!\s*/, '').toLowerCase();
      if (!name) errors.push(FILE + ':' + (i + 1) + ' thiếu tên header sau dấu !');
      cur.unset.push(name);
      return;
    }
    const at = line.indexOf(':');
    if (at < 1) { errors.push(FILE + ':' + (i + 1) + ' không phải cặp "tên: giá trị"'); return; }
    const name = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (!value) { errors.push(FILE + ':' + (i + 1) + ' header "' + name + '" thiếu giá trị'); return; }
    /* trùng tên trong CÙNG một luật ⇒ nối bằng dấu phẩy (đúng như Cloudflare) */
    cur.set[name] = cur.set[name] ? cur.set[name] + ', ' + value : value;
  });
  return rules;
}

/* ---------- 2. áp luật cho 1 đường dẫn, y hệt asset server của Cloudflare -------
   Header trong Fetch API là DANH SÁCH giá trị: `! Tên` xoá sạch danh sách, rồi
   luật sau `set` = thay, luật sau nữa trùng tên = NỐI THÊM (khi đọc ra thì nối
   bằng dấu phẩy). Mô phỏng đúng như vậy nên bắt được cả trường hợp thứ tự luật
   bị đảo (CSP nghiêm của trang quay lại dính vào response của sw.js). */
function headersFor(rules, pathname) {
  const list = new Map();        /* tên → mảng giá trị */
  const seen = new Set();        /* tên đã từng được luật _headers đặt */
  rules.forEach(rule => {
    const glob = rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    if (!new RegExp('^' + glob + '$').test(pathname)) return;
    rule.unset.forEach(name => list.delete(name));           /* bỏ trước… */
    Object.entries(rule.set).forEach(([name, value]) => {    /* …rồi đặt */
      if (seen.has(name)) list.set(name, (list.get(name) || []).concat(value));
      else { list.set(name, [value]); seen.add(name); }
    });
  });
  const out = new Map();
  list.forEach((values, name) => out.set(name, values.join(', ')));
  return out;
}

/* ---------- 3. các trường hợp phải đúng -------------------------------------- */
const rules = parse(fs.readFileSync(path.join(ROOT, FILE), 'utf8'));
const say = (pathname, headers) => ({ path: pathname, headers });

const swRuleLine = (rules.find(r => r.path === '/sw.js') || {}).line;
const allRuleLine = (rules.find(r => r.path === '/*') || {}).line;
const sw = headersFor(rules, '/sw.js');
const swCsp = sw.get('content-security-policy') || '';

if (swRuleLine && allRuleLine && swRuleLine < allRuleLine) {
  errors.push(FILE + ':' + swRuleLine + ' luật /sw.js phải nằm SAU khối /* (dòng ' + allRuleLine +
    ') — Cloudflare áp theo thứ tự trong tệp, dời lên trên là CSP chung quay lại áp cho sw.js');
}
/* 1. sw.js phải được gọi mạng ra ngoài (tải hộ ảnh bìa host ngoài cho kho offline) */
if (!swRuleLine) errors.push(FILE + ': thiếu luật /sw.js (Content-Type + no-cache + CSP riêng)');
else {
  if (!/connect-src \*/.test(swCsp)) {
    const found = /connect-src[^;]*/.exec(swCsp);
    errors.push(FILE + ': CSP của /sw.js phải mở "connect-src *" (đang là "' +
      (found ? found[0].trim() : 'không có connect-src') +
      '") ⇒ SW không tải hộ được ảnh bìa ở host ngoài (mebmarket, twimg, amazon…)');
  }
  if (/workers\.dev|supabase\.co/.test(swCsp)) {
    errors.push(FILE + ': CSP nghiêm của trang vẫn dính vào response của /sw.js ⇒ thiếu/đặt sai chỗ "! Content-Security-Policy"');
  }
  if (!/no-cache/.test(sw.get('cache-control') || '')) errors.push(FILE + ': /sw.js phải Cache-Control: no-cache');
  if (!/javascript/.test(sw.get('content-type') || '')) errors.push(FILE + ': /sw.js phải Content-Type: application/javascript');
}
/* 2. nhưng trang và mọi tệp khác KHÔNG được nới CSP theo */
['/', '/index.html', '/truyen/ten-truyen', '/admin'].forEach(p => {
  const csp = headersFor(rules, p).get('content-security-policy') || '';
  if (!/default-src 'self'/.test(csp)) errors.push(FILE + ': ' + p + ' thiếu CSP default-src \'self\' (trang phải giữ nghiêm)');
  if (!/script-src 'self'/.test(csp)) errors.push(FILE + ': ' + p + ' thiếu script-src \'self\'');
  if (/connect-src \*/.test(csp)) errors.push(FILE + ': ' + p + ' bị nới connect-src * (chỉ /sw.js mới được nới)');
  if (/default-src 'none'/.test(csp)) errors.push(FILE + ': ' + p + ' có CSP của service worker lọt sang trang');
});
/* 3. các header an toàn vẫn còn nguyên cho trang */
['/', '/truyen/ten-truyen'].forEach(p => {
  const h = headersFor(rules, p);
  ['x-content-type-options', 'referrer-policy', 'x-frame-options', 'strict-transport-security'].forEach(name => {
    if (!h.has(name)) errors.push(FILE + ': ' + p + ' mất header an toàn ' + name);
  });
});
/* 4. manifest: đúng MIME để máy cài app đọc được */
const mf = headersFor(rules, '/manifest.webmanifest').get('content-type') || '';
if (!/application\/manifest\+json/.test(mf)) errors.push(FILE + ': manifest.webmanifest thiếu Content-Type application/manifest+json');

console.log(JSON.stringify({
  errors0: errors,
  luat: rules.length,
  viDu: [say('/sw.js', { csp: swCsp.slice(0, 120), 'cache-control': sw.get('cache-control') }),
         say('/', { csp: (headersFor(rules, '/').get('content-security-policy') || '').slice(0, 120) })],
}, null, 1));
if (errors.length) {
  console.log('CÒN ' + errors.length + ' LỖI TRONG ' + FILE);
  process.exit(1);
}
console.log('_headers an toàn: ' + rules.length + ' luật, /sw.js được gọi mạng ra ngoài để tải hộ ảnh bìa, trang vẫn giữ CSP nghiêm');
