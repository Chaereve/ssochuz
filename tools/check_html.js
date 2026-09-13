/* ============================================================================
   Soi HTML tĩnh — bắt các lỗi “im lặng” mà trình duyệt không báo:
     · thuộc tính trùng trên cùng một thẻ  (class="a" ... class="b" → cái sau bị bỏ,
       ví dụ 3 khung “Khám phá” từng quên mất lớp hide)
     · thẻ <a href> nội bộ trỏ tới tệp không có trong repo
     · data-ic="…" trỏ tới biểu tượng không có trong bộ icon của cz-app.js
     · `_redirects` trỏ về tệp .html → vòng lặp với cơ chế TỰ BỎ .html của
       Cloudflare Pages (ERR_TOO_MANY_REDIRECTS: trang truyện từng chết vì cái này)
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

/* ============================================================================
   _redirects (Cloudflare Pages) — chính chỗ này từng làm CHẾT trang truyện:
   Pages tự bỏ đuôi .html bằng chuyển hướng 308 (/truyen.html → /truyen). Nếu một
   luật proxy (200) trỏ về tệp .html thì URL sạch của nó lại khớp ngược luật khác:
       /truyen/<slug>/ → /truyen.html → 308 → /truyen → /truyen.html → …
   trình duyệt báo "redirected you too many times" (ERR_TOO_MANY_REDIRECTS).
   ========================================================================== */
function auditRedirects() {
  const f = path.join(ROOT, '_redirects');
  const raw = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  const rules = [];
  raw.split('\n').forEach((line, i) => {
    line = line.split('#')[0].trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    if (parts.length < 2) return;
    rules.push({ src: parts[0], dst: parts[1], code: parts[2] || '302', line: i + 1 });
  });
  const matches = (src, u) => src.includes('*')
    ? u.startsWith(src.slice(0, src.indexOf('*'))) && u.endsWith(src.slice(src.indexOf('*') + 1))
    : src === u;
  const asset = u => {                       // có trang/tệp thật để phục vụ không?
    const rel = String(u).replace(/^\//, '').split('?')[0];
    if (!rel) return true;
    return fs.existsSync(path.join(ROOT, rel))
      || fs.existsSync(path.join(ROOT, rel + '.html'))
      || fs.existsSync(path.join(ROOT, rel, 'index.html'));
  };

  for (const r of rules) {
    const d = r.dst.split('?')[0];
    if (/^https?:/i.test(d)) continue;                      // trỏ sang web khác
    if (r.code === '200') {
      if (/\.html?$/i.test(d)) {
        const c = d.replace(/\.html?$/i, '');
        const back = rules.find(x => matches(x.src, c));
        problems.push(`_redirects:${r.line} "${r.src} → ${r.dst} 200": Cloudflare Pages tự 308 bỏ đuôi .html thành ${c}`
          + (back ? `, mà ${c} lại khớp luật "${back.src}" ⇒ VÒNG LẶP (ERR_TOO_MANY_REDIRECTS)` : ' ⇒ URL trên trình duyệt bị đổi, mất tên truyện')
          + ` — sửa đích thành ${c}`);
      } else if (!asset(d)) {
        problems.push(`_redirects:${r.line} "${r.src} → ${r.dst} 200": không có trang/tệp nào ở ${d} ⇒ người đọc sẽ thấy 404`);
      }
    } else if (!/^(301|302|303|307|308)$/.test(r.code)) {
      problems.push(`_redirects:${r.line} mã ${r.code} lạ — Cloudflare chỉ nhận 200 (proxy) hoặc 301/302/303/307/308`);
    }
  }
  /* luật tĩnh đứng sau luật có dấu * thì bị che mất (Cloudflare dùng luật khớp đầu tiên) */
  rules.forEach((r, i) => {
    if (r.src.includes('*')) return;
    const sh = rules.slice(0, i).find(x => x.src.includes('*') && matches(x.src, r.src));
    if (sh) problems.push(`_redirects:${r.line} luật "${r.src}" bị luật "${sh.src}" (dòng ${sh.line}) che mất — đưa luật tĩnh lên trước`);
  });
  /* link truyện mà cz-app.js sinh ra (/truyen/<slug>/) phải có luật phục vụ */
  const m = fs.readFileSync(path.join(ROOT, 'cz-app.js'), 'utf8')
    .match(/function\s+storyURL\s*\([^)]*\)\s*\{\s*return\s*'([^']+)'/);
  if (m) {
    const prefix = m[1].replace(/\/$/, '');
    const sample = prefix + '/ten-truyen';
    const hit = rules.find(r => matches(r.src, sample));
    const already = n => problems.some(p => p.startsWith('_redirects:' + n));
    if (!hit) problems.push(`_redirects: thiếu luật cho ${sample}/ — cz-app.js sinh link dạng đó nên bấm vào truyện sẽ 404`);
    else if (!already(hit.line) && !/^https?:/i.test(hit.dst) && !asset(hit.dst.split('?')[0]))
      problems.push(`_redirects:${hit.line} luật ${hit.src} trỏ về ${hit.dst} nhưng không có trang/tệp nào ở đó`);
  }
  return rules.length;
}
const nRules = auditRedirects();

if (problems.length) { console.log('HTML có vấn đề:\n  · ' + problems.join('\n  · ')); process.exit(1); }
console.log('HTML tĩnh sạch: không trùng thuộc tính, liên kết và biểu tượng đều có thật');
console.log(`_redirects an toàn: ${nRules} luật, không luật nào vòng lặp với cơ chế tự bỏ .html của Pages`);
