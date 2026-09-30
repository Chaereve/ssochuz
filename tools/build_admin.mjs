/* Build admin static bundle (một trang quản trị duy nhất): Preact + TipTap,
   rồi copy source CSS ra thư mục gốc. Sửa src/admin/ rồi chạy npm run build:admin. */
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { evaluateBundleFile } from './bundle_budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kb = (n) => (n / 1024).toFixed(1) + 'kb';

copyFileSync(path.join(ROOT, 'src/admin/styles/admin.css'), path.join(ROOT, 'admin.css'));

/* Trình soạn thảo chương (Tiptap/ProseMirror) build TRƯỚC thành tệp riêng, tải khi
   mở khung soạn chương (src/admin/utils/editorLoader.js). ?v= của nó = sha1 nội
   dung, chèn vào admin.js qua define ⇒ đổi mã trình soạn thảo là đổi URL, không
   phải nâng tay. */
await build({
  entryPoints: [path.join(ROOT, 'src/admin/editor-entry.js')],
  bundle: true,
  minify: true,
  outfile: path.join(ROOT, 'admin-editor.js'),
  format: 'iife',
  target: ['es2019'],
});
const editorVer = createHash('sha1').update(readFileSync(path.join(ROOT, 'admin-editor.js'))).digest('hex').slice(0, 10);

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
  define: { __ADMIN_EDITOR_VER__: JSON.stringify(editorVer) },
});

const fmtAdmin = (f, extra = '') => {
  const bytes = statSync(path.join(ROOT, f)).size;
  const ev = evaluateBundleFile(f, bytes);
  const tag = ev.maxKb ? ('  (' + ev.pct + '% trần ' + ev.maxKb + ' kB' + (extra ? ' · ' + extra : '') + ')') : (extra ? '  (' + extra + ')' : '');
  return '  ' + f.padEnd(16) + kb(bytes).padStart(8) + tag;
};
console.log(fmtAdmin('admin.css'));
console.log(fmtAdmin('admin.js'));
console.log(fmtAdmin('admin.js.map'));
console.log(fmtAdmin('admin-editor.js', '?v=' + editorVer));

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
console.log(fmtAdmin('admin-docx.js'));

for (const f of ['admin.css', 'admin.js', 'admin-editor.js', 'admin-docx.js']) {
  const ev = evaluateBundleFile(f, statSync(path.join(ROOT, f)).size);
  if (ev.status === 'warn' || ev.status === 'exceeded') {
    console.warn('  ⚠ CẢNH BÁO DUNG LƯỢNG: ' + ev.message);
  }
}
