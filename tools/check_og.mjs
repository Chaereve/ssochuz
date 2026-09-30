/* ============================================================================
   check_og.mjs · G6 — thẻ chia sẻ tĩnh (OG/JSON-LD) phải KHỚP registry hiện tại
   ----------------------------------------------------------------------------
   Vì sao: tools/build_og.mjs chạy tay (`npm run og`). Quên chạy sau khi thêm bộ
   hoặc sửa tên/bìa/giới thiệu ⇒ bot Zalo/Facebook/Google đọc thẻ cũ, hoặc bộ mới
   rơi về shell chung có <title>Đang tải…</title>.

   Cách kiểm: KHÔNG viết lại logic của build_og (hai bản sẽ lệch nhau theo thời
   gian). Chép build_og.mjs + đúng 3 tệp đầu vào (data/registry.json, truyen.html,
   _redirects) sang thư mục tạm, chạy script ở đó, rồi so từng byte với các tệp
   đã commit. Lệch bất kỳ chỗ nào (tiêu đề, mô tả, bìa, canonical, JSON-LD, shell
   truyen.html, luật _redirects) hay thiếu/thừa thư mục truyen/<slug>/ ⇒ đỏ,
   kèm tên slug và trường bị lệch. Sửa: `npm run og` rồi commit.

   Giới hạn: chỉ thấy registry TRONG REPO (bản sao lưu). Bộ mới chỉ có trên KV
   thì cần chạy workflow "Đồng bộ KV → repo" trước, check mới thấy được.
   ========================================================================== */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = ['tools/build_og.mjs', 'data/registry.json', 'truyen.html', '_redirects'];

/* các trường đáng báo tên khi lệch — giúp biết ngay là "đổi tên bộ" hay "đổi bìa" */
const FIELDS = [
  ['title', /<title>([\s\S]*?)<\/title>/],
  ['description', /<meta name="description" content="([^"]*)">/],
  ['canonical', /<link rel="canonical" href="([^"]*)">/],
  ['og:title', /<meta property="og:title" content="([^"]*)">/],
  ['og:description', /<meta property="og:description" content="([^"]*)">/],
  ['og:image', /<meta property="og:image" content="([^"]*)">/],
  ['JSON-LD', /<script type="application\/ld\+json">([\s\S]*?)<\/script>/],
];
function fieldDiff(a, b) {
  const out = FIELDS.filter(([, re]) => ((a.match(re) || [])[1]) !== ((b.match(re) || [])[1])).map(([name]) => name);
  return out.length ? out : ['phần thân trang (truyen.html đổi mà chưa chạy lại npm run og?)'];
}
function slugDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isDirectory()).sort();
}

const errors0 = [];
const tmp = mkdtempSync(path.join(os.tmpdir(), 'cz-og-'));
let checked = 0;
try {
  for (const rel of INPUTS) {
    mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    cpSync(path.join(ROOT, rel), path.join(tmp, rel));
  }
  const run = spawnSync(process.execPath, [path.join(tmp, 'tools', 'build_og.mjs')], { encoding: 'utf8', timeout: 60000 });
  if (run.status !== 0) {
    errors0.push('build_og.mjs chạy lỗi trên bản sao: ' + String(run.stderr || run.stdout || run.error || '').trim().split('\n').slice(0, 3).join(' | '));
  } else {
    const want = slugDirs(path.join(tmp, 'truyen'));
    const have = new Set(slugDirs(path.join(ROOT, 'truyen')));
    for (const slug of want) {
      checked++;
      const repoFile = path.join(ROOT, 'truyen', slug, 'index.html');
      if (!existsSync(repoFile)) { errors0.push(slug + ': thiếu truyen/' + slug + '/index.html — bộ có trong registry nhưng chưa chạy npm run og'); continue; }
      const got = readFileSync(repoFile, 'utf8');
      const exp = readFileSync(path.join(tmp, 'truyen', slug, 'index.html'), 'utf8');
      if (got !== exp) errors0.push(slug + ': thẻ chia sẻ lệch registry ở ' + fieldDiff(got, exp).join(', ') + ' — chạy npm run og');
      /* JSON-LD phải là JSON hợp lệ kiểu Book có tên (bot Google bỏ qua cả khối nếu hỏng) */
      const ld = (got.match(FIELDS[FIELDS.length - 1][1]) || [])[1];
      try {
        const obj = JSON.parse(ld || '');
        if (obj['@type'] !== 'Book' || !String(obj.name || '').trim()) errors0.push(slug + ': JSON-LD thiếu @type Book hoặc name');
      } catch (e) {
        errors0.push(slug + ': JSON-LD không phải JSON hợp lệ (' + String((e && e.message) || e).slice(0, 80) + ')');
      }
      have.delete(slug);
    }
    for (const extra of have) errors0.push(extra + ': còn thư mục truyen/' + extra + '/ nhưng registry không có bộ này (đã xoá/đổi slug?) — xoá thư mục hoặc kiểm lại registry');
    const rdGot = readFileSync(path.join(ROOT, '_redirects'), 'utf8');
    const rdExp = readFileSync(path.join(tmp, '_redirects'), 'utf8');
    if (rdGot !== rdExp) errors0.push('_redirects: khối luật OG-BEGIN/OG-END lệch registry — chạy npm run og');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(JSON.stringify({ checked, errors0 }, null, 1));
process.exit(errors0.length ? 1 : 0);
