/* ============================================================================
   sw.js · PRECACHE phải là shell THẬT, không phải danh sách đồ cổ
   ----------------------------------------------------------------------------
   Bối cảnh (lượt rà 2026-11-12): khối cảm xúc `cz-react.js` bị gỡ khỏi trang
   đọc từ r90, nhưng `PRECACHE` của service worker vẫn giữ
   `/cz-react.js?v=20261014feat1`. Hậu quả:
     · mỗi lần cài SW tải thêm 17 kB tệp không trang nào dùng;
     · `cache.add` mãi mãi giữ một bản sao chết trong kho shell (24/7 offline).
   Không bài nào bắt được vì precache lỗi cũng `.catch(() => {})` — im lặng.

   Bài này khoá lại 4 điều:
     1. Mọi `/cz-*.js` và `/cz.css` trong PRECACHE phải có tệp thật ở gốc;
     2. Phải có ÍT NHẤT một trang HTML thật (bỏ docs/, mockup/, tests/) nạp nó
        — không nạp thì đừng precache;
     3. Chuỗi `?v=` trong PRECACHE phải TRÙNG với chuỗi trang dùng, nếu không
        kho shell lưu một URL mà trang không bao giờ hỏi ⇒ offline vẫn trượt;
     4. `CZ_SW_VER` phải khớp mẫu ngày + hậu tố, và `C_SHELL` phải ghép từ nó
        (đổi PRECACHE mà quên tăng version là trình duyệt giữ shell cũ).
   Chạy:  node tests/t_sw_precache.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };

const sw = R('sw.js');
const arrText = (sw.match(/var PRECACHE = \[([\s\S]*?)\n\];/) || [])[1] || '';
ok(!!arrText, 'không đọc được mảng PRECACHE trong sw.js');
const precache = (arrText.match(/'[^']+'/g) || []).map((x) => x.slice(1, -1));
ok(precache.length > 10, 'PRECACHE đọc ra quá ít mục (' + precache.length + ')');

/* 4. version shell */
const ver = (sw.match(/var CZ_SW_VER = '([^']+)';/) || [])[1];
ok(/^\d{8}[a-z0-9]+$/i.test(String(ver)), 'CZ_SW_VER không đúng dạng YYYYMMDD + hậu tố: ' + ver);
ok(sw.includes("var C_SHELL = 'ssochuz-shell-' + CZ_SW_VER;"), 'C_SHELL không còn ghép từ CZ_SW_VER');

/* Gom mọi tham chiếu script/css trong các trang HTML thật (bỏ docs/mockup/tests) */
function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', 'docs', 'mockup', 'tests', '.git', 'data', 'worker', 'src', 'tools'].includes(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}
const pages = walk(ROOT, []);
ok(pages.length > 50, 'quét được quá ít trang HTML (' + pages.length + ')');
const refs = new Set();
for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  (html.match(/cz-[a-z]*\.js\?v=[0-9a-z]+|cz\.css\?v=[0-9a-z]+/g) || []).forEach((m) => refs.add(m));
}

const assets = precache.filter((u) => /^\/cz-[a-z]*\.js(\?|$)|^\/cz\.css(\?|$)/.test(u));
ok(assets.length > 5, 'PRECACHE không còn mục cz-*.js nào (' + assets.length + ')');

assets.forEach((u) => {
  const file = u.replace(/^\//, '').split('?')[0];
  ok(fs.existsSync(path.join(ROOT, file)), 'PRECACHE có ' + u + ' nhưng không có tệp ' + file + ' ở gốc');
  const key = u.replace(/^\//, '');
  const bare = key.split('?')[0];
  ok(refs.has(key), 'PRECACHE nhớ ' + key + ' nhưng KHÔNG trang nào nạp đúng phiên bản đó '
    + '(trang đang dùng: ' + ([...refs].filter((r) => r.startsWith(bare)).join(', ') || 'không có') + ')');
});

/* Danh sách ngược: tệp cz-*.js ở gốc không trang nào nạp thì đừng nằm trong shell */
const shellFiles = new Set(assets.map((u) => u.replace(/^\//, '').split('?')[0]));

console.log(JSON.stringify({
  errors0: bad,
  checked: 'PRECACHE sw.js: ' + assets.length + ' tệp cz-*.js/cz.css có tệp thật, có trang nạp, '
    + 'trùng ?v= với trang; CZ_SW_VER ' + ver + ' khớp mẫu ngày',
  shell: [...shellFiles].sort(),
}));
if (bad.length) { bad.forEach((b) => console.error('✗ ' + b)); process.exit(1); }
