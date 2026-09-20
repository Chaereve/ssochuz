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
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Reserved private content must never become a public static fallback.
for (const dir of ['data/book', 'truyen']) {
  if (existsSync(path.join(ROOT, dir)) && readdirSync(path.join(ROOT, dir)).some(n => n.startsWith('private-'))) {
    throw new Error('Không được phát hành nội dung private- trong ' + dir);
  }
}

/* src → thư mục gốc (đúng đường dẫn mà các trang HTML đang gọi) */
const JS = ['cz-app.js', 'cz-auth.js', 'cz-home.js', 'cz-story.js', 'cz-people.js', 'cz-space.js', 'admin.js'];
const CSS = ['cz.css'];

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

for (const f of JS) {
  if (!existsSync(path.join(ROOT, 'src', f))) throw new Error('thiếu src/' + f);
  await minify(f);
}
for (const f of CSS) await minifyCss(f);

const srcTotal = rows.reduce((a, r) => a + r[1], 0);
const outTotal = rows.reduce((a, r) => a + r[2], 0);
rows.forEach(([f, a, b]) => console.log('  ' + f.padEnd(14) + kb(a).padStart(9) + '  →  ' + kb(b).padStart(9) +
  '  (' + Math.round(100 - (b / a) * 100) + '% nhỏ hơn)'));
console.log('Tổng: ' + kb(srcTotal) + '  →  ' + kb(outTotal) + ' · đã ghi ra thư mục gốc.');
/* Ô tìm nhanh (Ctrl+K) cần tra tiêu đề của 1.199 chương, mà tiêu đề nằm rải trong
   62 file data/book/*.json (~7,7 MB) — không thể bắt trình duyệt tải hết chỉ để
   tìm. Nên sinh sẵn một bảng CHỈ TÊN CHƯƠNG (~68 kB, ~22 kB khi nén) để nạp lười
   đúng một lần rồi giữ trong bộ nhớ. */
const idx = {};
let soChuong = 0;
for (const f of readdirSync(path.join(ROOT, 'data', 'book')).filter((x) => x.endsWith('.json')).sort()) {
  const b = JSON.parse(readFileSync(path.join(ROOT, 'data', 'book', f), 'utf8'));
  if (!b.slug) continue;
  idx[b.slug] = (b.chapters || []).map((c) => String(c.t || ''));
  soChuong += idx[b.slug].length;
}
const idxTo = path.join(ROOT, 'chuong-index.json');
writeFileSync(idxTo, JSON.stringify(idx));
console.log('  Đã ghi chuong-index.json (' + Object.keys(idx).length + ' bộ · ' + soChuong +
  ' tiêu đề chương · ' + kb(statSync(idxTo).size) + ')');
/* sitemap.xml + robots.txt phải theo kịp dữ liệu. Script Python đã có sẵn từ lâu
   nhưng chưa được nối vào đây, nên thêm bộ/chương mới mà quên chạy tay là sitemap
   âm thầm cũ. Thiếu python3 thì báo rõ chứ không làm hỏng cả lần build. */
const sm = spawnSync('python3', [path.join(ROOT, 'tools', 'build_sitemap.py')], { cwd: ROOT, encoding: 'utf8' });
if (sm.status === 0) console.log('  ' + String(sm.stdout || '').trim());
else console.log('  CHƯA sinh được sitemap.xml/robots.txt (cần python3): ' +
  (sm.error ? sm.error.message : String(sm.stderr || '').trim().split('\n')[0]));
console.log('Nhớ chạy: node tests/run.js  (bài kiểm thử nạp đúng bản đã rút gọn)');
