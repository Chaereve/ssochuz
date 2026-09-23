/* Admin v2 bundle budget: sourcemap không nhúng nguồn, bundle còn trong mức nhẹ cho Pages. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const js = fs.statSync(path.join(ROOT, 'admin.js')).size;
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin.js.map'), 'utf8'));
const cssRoot = fs.readFileSync(path.join(ROOT, 'admin.css'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'src/admin/styles/admin.css'), 'utf8');
const out = {
  jsBytes: js,
  mapBytes: fs.statSync(path.join(ROOT, 'admin.js.map')).size,
  cssBytes: Buffer.byteLength(cssRoot),
  cssSynced: cssRoot === cssSrc,
  sources: (map.sources || []).length,
  sourcesContent: !!map.sourcesContent,
};
console.log(JSON.stringify(out, null, 1));
assert.ok(js < 520 * 1024, 'admin.js vượt budget 520KB');
assert.strictEqual(!!map.sourcesContent, false, 'sourcemap không được chứa sourcesContent');
assert.strictEqual(cssRoot, cssSrc, 'admin.css phải khớp src/admin/styles/admin.css (chạy npm run build:admin)');
assert.ok((map.sources || []).some((s) => /src\/admin\/main\.jsx$/.test(s)), 'sourcemap thiếu source admin v2');
console.log('Đen: admin v2 bundle gọn và sourcemap không nhúng source.');
