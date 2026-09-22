/* Build admin-v2 static bundle: Preact + TipTap, then copy source CSS to root. */
import { copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kb = (n) => (n / 1024).toFixed(1) + 'kb';

copyFileSync(path.join(ROOT, 'src/admin/styles/admin-v2.css'), path.join(ROOT, 'admin-v2.css'));

await build({
  entryPoints: [path.join(ROOT, 'src/admin/main.jsx')],
  bundle: true,
  minify: true,
  outfile: path.join(ROOT, 'admin-v2.js'),
  format: 'iife',
  globalName: 'SsochuzAdminV2',
  sourcemap: 'external',
  sourcesContent: false,
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  target: ['es2019'],
});

console.log('  admin-v2.css   ' + kb(statSync(path.join(ROOT, 'admin-v2.css')).size));
console.log('  admin-v2.js    ' + kb(statSync(path.join(ROOT, 'admin-v2.js')).size));
console.log('  admin-v2.js.map ' + kb(statSync(path.join(ROOT, 'admin-v2.js.map')).size));
