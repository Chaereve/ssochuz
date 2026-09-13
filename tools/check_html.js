/* ============================================================================
   Soi HTML tĩnh — bắt các lỗi “im lặng” mà trình duyệt không báo:
     · thuộc tính trùng trên cùng một thẻ  (class="a" ... class="b" → cái sau bị bỏ,
       ví dụ 3 khung “Khám phá” từng quên mất lớp hide)
     · thẻ <a href> nội bộ trỏ tới tệp không có trong repo
     · data-ic="…" trỏ tới biểu tượng không có trong bộ icon của cz-app.js
   Chạy:  node tools/check_html.js      (thoát 1 nếu có lỗi)
   ========================================================================== */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'truyen.html', 'admin.html'];

/* --- bỏ phần trong dấu nháy để không soi nhầm thẻ nằm trong data-URI --- */
function stripValues(html) {
  return html.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}
function tags(html) {
  const out = [];
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  while ((m = re.exec(html))) out.push({ name: m[1], attrs: m[2], at: m.index });
  return out;
}
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

const problems = [];
for (const f of PAGES) {
  const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const clean = stripValues(raw);
  for (const t of tags(clean)) {
    const names = (t.attrs.match(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=/g) || []).map(s => s.replace(/\s*=$/, '').toLowerCase());
    const dup = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    if (dup.length) problems.push(`${f}:${lineOf(clean, t.at)} thẻ <${t.name}> trùng thuộc tính ${dup.join(', ')}`);
  }
  /* liên kết nội bộ phải có thật */
  for (const m of raw.matchAll(/href="(\/[^"#?]*)"/g)) {
    const p = m[1], rel = p.replace(/^\//, '');
    const ok = p === '/' || fs.existsSync(path.join(ROOT, rel)) ||
      (p.endsWith('/') ? fs.existsSync(path.join(ROOT, rel, 'index.html')) : fs.existsSync(path.join(ROOT, rel + '.html')));
    if (!ok) problems.push(`${f}: href="${p}" không trỏ tới trang/tệp nào`);
  }
  /* biểu tượng dùng trong HTML phải có trong bộ icon */
  const iconsSrc = fs.readFileSync(path.join(ROOT, 'cz-app.js'), 'utf8');
  for (const m of raw.matchAll(/data-ic="([a-z0-9-]+)"/g)) {
    const re = new RegExp('(^|\\s)' + m[1] + ":\\s*'", 'm');
    if (!re.test(iconsSrc)) problems.push(`${f}: data-ic="${m[1]}" không có trong bộ icon`);
  }
}

if (problems.length) { console.log('HTML có vấn đề:\n  · ' + problems.join('\n  · ')); process.exit(1); }
console.log('HTML tĩnh sạch: không trùng thuộc tính, liên kết và biểu tượng đều có thật');
