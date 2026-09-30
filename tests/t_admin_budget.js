/* Bundle budget (Milestone C + Admin v2): sourcemap không nhúng nguồn, mọi tệp
   phát hành đều nằm trong trần dung lượng (tools/bundle_budget.mjs), và hàm
   cảnh báo kích hoạt đúng khi chạm ngưỡng warnKb / maxKb. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..');

(async () => {
  const { BUNDLE_BUDGETS, evaluateBundleFile } = await import(pathToFileURL(path.join(ROOT, 'tools/bundle_budget.mjs')).href);

  const js = fs.statSync(path.join(ROOT, 'admin.js')).size;
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin.js.map'), 'utf8'));
  const cssRoot = fs.readFileSync(path.join(ROOT, 'admin.css'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(ROOT, 'src/admin/styles/admin.css'), 'utf8');

  const report = {};
  const errors0 = [];
  for (const file of Object.keys(BUNDLE_BUDGETS)) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) { errors0.push('thiếu tệp build: ' + file); continue; }
    const ev = evaluateBundleFile(file, fs.statSync(full).size);
    report[file] = { kb: ev.kb, warnKb: ev.warnKb, maxKb: ev.maxKb, pct: ev.pct, status: ev.status };
    if (ev.status === 'exceeded') errors0.push(ev.message);
  }

  /* tự kiểm hàm cảnh báo: dưới warnKb → ok; giữa warnKb..maxKb → warn; vượt maxKb → exceeded */
  assert.strictEqual(evaluateBundleFile('admin.js', 100 * 1024).status, 'ok');
  assert.strictEqual(evaluateBundleFile('admin.js', (BUNDLE_BUDGETS['admin.js'].warnKb + 1) * 1024).status, 'warn');
  assert.strictEqual(evaluateBundleFile('admin.js', (BUNDLE_BUDGETS['admin.js'].maxKb + 1) * 1024).status, 'exceeded');

  const out = {
    jsBytes: js,
    mapBytes: fs.statSync(path.join(ROOT, 'admin.js.map')).size,
    cssBytes: Buffer.byteLength(cssRoot),
    cssSynced: cssRoot === cssSrc,
    sources: (map.sources || []).length,
    sourcesContent: !!map.sourcesContent,
    budgets: report,
    errors0,
  };
  console.log(JSON.stringify(out, null, 1));
  assert.strictEqual(errors0.length, 0, errors0.join(' · '));
  assert.strictEqual(!!map.sourcesContent, false, 'sourcemap không được chứa sourcesContent');
  assert.strictEqual(cssRoot, cssSrc, 'admin.css phải khớp src/admin/styles/admin.css (chạy npm run build:admin)');
  assert.ok((map.sources || []).some((s) => /src\/admin\/main\.jsx$/.test(s)), 'sourcemap thiếu source admin v2');
  console.log('Đạt: mọi tệp build nằm trong trần dung lượng và sourcemap không nhúng source.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
