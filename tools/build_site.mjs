/* ============================================================================
   build_site.mjs · rút gọn mã phát hành (chạy trên máy, không cần cho Pages)
   ----------------------------------------------------------------------------
   VÌ SAO: người đọc có thể mở Developer Tools và đọc thẳng mã nguồn web. Bản
   phát hành vì thế chỉ để lại mã ĐÃ RÚT GỌN (bỏ chú thích, đổi tên biến nội bộ,
   xoá khoảng trắng) — đọc được nhưng rất khó hiểu, và không còn lộ ghi chú nội
   bộ (tên khoá KV, luồng quản trị, đường dẫn API…).

   Quan trọng: mã nguồn ĐỌC ĐƯỢC nằm trong src/ (bị _redirects chặn không cho
   phát hành). Sửa ở src/ rồi chạy `npm run build` — KHÔNG sửa file ở thư mục gốc
   vì lần build sau sẽ ghi đè.

   Chạy:  npm run build        (cần: npm install — chỉ esbuild)
   ========================================================================== */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { adminBuildOptions, ADMIN_BUDGET_BYTES } from './admin_build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Reserved private content must never become a public static fallback.
for (const dir of ['data/book', 'truyen']) {
  if (existsSync(path.join(ROOT, dir)) && readdirSync(path.join(ROOT, dir)).some(n => n.startsWith('private-'))) {
    throw new Error('Không được phát hành nội dung private- trong ' + dir);
  }
}

/* src → thư mục gốc (đúng đường dẫn mà các trang HTML đang gọi) */
const JS = ['cz-app.js', 'cz-auth.js', 'cz-home.js', 'cz-story.js', 'cz-people.js', 'cz-space.js'];
const CSS = ['cz.css'];

/* Trang quản trị có đường build RIÊNG: nó dùng trình soạn thảo cài qua npm
   (TipTap) nên bắt buộc phải BUNDLE, trong khi các tệp cz-*.js của trang người
   đọc vẫn gọi nhau qua window.CZ nên giữ nguyên bundle:false.
   tools/check_src.js phải dùng ĐÚNG bộ tham số này, nếu không phép so từng byte
   sẽ báo lệch. Hai nơi cùng đọc từ adminBuildOptions() để không bao giờ lệch. */
const ADMIN_OUT = 'admin.js';

const kb = (n) => (n / 1024).toFixed(1) + ' kB';
const rows = [];

async function minify(file) {
  const from = path.join(ROOT, 'src', file);
  const to = path.join(ROOT, file);
  const before = statSync(from).size;
  const out = await build({
    entryPoints: [from],
    write: false,
    minify: true,
    bundle: false,          /* các tệp gọi nhau qua biến toàn cục (window.CZ…) */
    legalComments: 'none',
    target: ['es2019'],
    charset: 'utf8',
    banner: { js: '/* ssochuz · bản rút gọn — sửa ở src/ rồi chạy npm run build */' },
  });
  const code = out.outputFiles[0].text;
  writeFileSync(to, code + '\n');
  rows.push([file, before, Buffer.byteLength(code)]);
  /* chỉ cảnh báo khi ai đó sửa nhầm bản ở thư mục gốc rồi build lại */
  return code;
}

async function minifyCss(file) {
  const from = path.join(ROOT, 'src', file);
  const to = path.join(ROOT, file);
  const before = statSync(from).size;
  const out = await build({ entryPoints: [from], write: false, minify: true, loader: { '.css': 'css' } });
  const code = out.outputFiles[0].text;
  writeFileSync(to, code + '\n');
  rows.push([file, before, Buffer.byteLength(code)]);
}

/* Trang quản trị: bundle riêng + canh ngân sách 650 kB. */
async function buildAdmin() {
  const entry = path.join(ROOT, 'src/admin/main.js');
  if (!existsSync(entry)) throw new Error('thiếu src/admin/main.js');
  const before = srcTreeSize(path.join(ROOT, 'src/admin'));
  const out = await build(adminBuildOptions(ROOT));
  const code = out.outputFiles[0].text;
  const bytes = Buffer.byteLength(code);
  writeFileSync(path.join(ROOT, ADMIN_OUT), code + '\n');
  rows.push([ADMIN_OUT, before, bytes]);
  if (bytes > ADMIN_BUDGET_BYTES) {
    throw new Error('admin.js ' + kb(bytes) + ' vượt ngân sách ' + kb(ADMIN_BUDGET_BYTES) +
      ' — xem lại thư viện đang gom vào bundle');
  }
  console.log('  admin.js: ' + kb(bytes) + ' / ngân sách ' + kb(ADMIN_BUDGET_BYTES) +
    ' (còn trống ' + kb(ADMIN_BUDGET_BYTES - bytes) + ')');
}

/* tổng dung lượng mã nguồn admin, chỉ để in cho dễ so sánh */
function srcTreeSize(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    n += st.isDirectory() ? srcTreeSize(p) : st.size;
  }
  return n;
}

for (const f of JS) {
  if (!existsSync(path.join(ROOT, 'src', f))) throw new Error('thiếu src/' + f);
  await minify(f);
}
await buildAdmin();
for (const f of CSS) await minifyCss(f);

const srcTotal = rows.reduce((a, r) => a + r[1], 0);
const outTotal = rows.reduce((a, r) => a + r[2], 0);
rows.forEach(([f, a, b]) => console.log('  ' + f.padEnd(14) + kb(a).padStart(9) + '  →  ' + kb(b).padStart(9) +
  '  (' + Math.round(100 - (b / a) * 100) + '% nhỏ hơn)'));
console.log('Tổng: ' + kb(srcTotal) + '  →  ' + kb(outTotal) + ' · đã ghi ra thư mục gốc.');
console.log('Nhớ chạy: node tests/run.js  (bài kiểm thử nạp đúng bản đã rút gọn)');
