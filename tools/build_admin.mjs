/* Build admin static bundle (một trang quản trị duy nhất): Preact + TipTap,
   rồi copy source CSS ra thư mục gốc. Sửa src/admin/ rồi chạy npm run build:admin. */
import { copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kb = (n) => (n / 1024).toFixed(1) + 'kb';

copyFileSync(path.join(ROOT, 'src/admin/styles/admin.css'), path.join(ROOT, 'admin.css'));

await build({
  entryPoints: [path.join(ROOT, 'src/admin/main.jsx')],
  bundle: true,
  minify: true,
  outfile: path.join(ROOT, 'admin.js'),
  format: 'iife',
  globalName: 'SsochuzAdmin',
  sourcemap: 'external',
  sourcesContent: false,
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  target: ['es2019'],
});

console.log('  admin.css      ' + kb(statSync(path.join(ROOT, 'admin.css')).size));
console.log('  admin.js       ' + kb(statSync(path.join(ROOT, 'admin.js')).size));
console.log('  admin.js.map   ' + kb(statSync(path.join(ROOT, 'admin.js.map')).size));

// Bộ đọc DOCX tải riêng khi cần, giữ nguyên budget của admin.js.
await build({
  entryPoints: [path.join(ROOT, 'src/admin/docx.js')],
  bundle: true,
  minify: true,
  outfile: path.join(ROOT, 'admin-docx.js'),
  format: 'iife',
  target: ['es2019'],
  legalComments: 'inline',
});
console.log('  admin-docx.js  ' + kb(statSync(path.join(ROOT, 'admin-docx.js')).size));
