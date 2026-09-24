/* ============================================================================
   build_worker.mjs · GỘP WORKER THÀNH MỘT TỆP ĐỂ DÁN VÀO CLOUDFLARE
   ----------------------------------------------------------------------------
   VÌ SAO: `worker/cms.js` import thêm 8 tệp (`./overflow.js`, `./private-books.js`,
   `./member-spaces.js`, `../src/shared/*.js`). Cách deploy chuẩn là `npx wrangler
   deploy` (wrangler tự gộp). Nhưng nếu deploy bằng bảng điều khiển Cloudflare
   (Workers & Pages → chọn Worker → Edit code → dán) thì phải dán MỘT tệp — và
   dán 9 tệp bằng tay là kiểu gì cũng sót.

   Tệp này gộp tất cả lại thành `worker/cms.bundle.js` (đã .gitignore — là bản
   sinh tự động, không commit; ai cần thì chạy lại lệnh dưới):
     · một tệp duy nhất, không còn `import` nào,
     · giữ đủ Durable Object (`MemberSpaces`, `PrivateBooks`) và `export default`,
     · gộp cho Cloudflare Workers (không phải trình duyệt).

   Chạy:  npm run build:worker
   Xong:  mở https://<worker>/api/health thấy đúng "version" của worker/cms.js là đã lên bản mới.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'worker', 'cms.js');
const OUTDIR = path.join(ROOT, 'worker');
const OUT = path.join(OUTDIR, 'cms.bundle.js');

const src = readFileSync(ENTRY, 'utf8');
const ver = (src.match(/const VERSION = '([^']+)'/) || [])[1] || '?';
const date = (src.match(/const BUILD = '([^']+)'/) || [])[1] || '';

const out = await build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: ['es2022'],
  mainFields: ['module', 'main'],
  conditions: ['worker', 'browser'],
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
});

const code = out.outputFiles[0].text;
mkdirSync(OUTDIR, { recursive: true });
writeFileSync(OUT, code + '\n');

/* kiểm tra chứ không tin: tệp gộp mà còn `import`/`require` là dán vào Cloudflare
   sẽ lỗi ngay, còn thiếu Durable Object là mất My Space / truyện riêng tư. */
const problems = [];
if (/^\s*import\s/m.test(code)) problems.push('còn câu import (chưa gộp hết)');
if (/require\(/.test(code)) problems.push('còn require()');
if (!/export\s*\{[^}]*MemberSpaces/.test(code)) problems.push('thiếu export MemberSpaces');
if (!/export\s*\{[^}]*PrivateBooks/.test(code)) problems.push('thiếu export PrivateBooks');
/* esbuild đổi tên thành `export { cms_default as default }` — nhận cả hai kiểu */
if (!/export\s+default|as\s+default\b/.test(code)) problems.push('thiếu export default (fetch/scheduled)');
if (!code.includes(ver)) problems.push('không thấy số phiên bản ' + ver);

const kb = (n) => (n / 1024).toFixed(1) + ' kB';
console.log('  worker/cms.js + 8 tệp  →  worker/cms.bundle.js');
console.log('  ' + kb(statSync(ENTRY).size) + '  →  ' + kb(Buffer.byteLength(code)) +
  '  · phiên bản ' + ver + (date ? ' (' + date + ')' : ''));
if (problems.length) {
  console.error('LỖI gộp worker: ' + problems.join(' · '));
  process.exit(1);
}
console.log('Tệp gộp sẵn sàng để dán vào Cloudflare (Workers & Pages → Worker → Edit code).');
