/* ============================================================================
   mirror_covers.mjs · G7 — sao lưu bìa về TỆP TĨNH assets/covers/<khoá>.webp
   ----------------------------------------------------------------------------
   Chạy ở nơi có mạng ra ngoài (GitHub Actions: workflow "Sao lưu bìa về repo",
   hoặc máy owner). Cần ImageMagick (`convert`).

     node tools/mirror_covers.mjs [--registry <tệp|URL>] [--api <URL Worker>] [--root <thư mục>]

   Làm gì:
   1. Đọc registry: mặc định `<Worker>/api/registry` (bản công khai, KHÔNG cần
      khoá), lỗi thì dùng data/registry.json. Chỉ ĐỌC — không ghi gì lên Worker/KV.
   2. Lấy mọi link bìa (thumb/slide/cover) là http(s) tuyệt đối hoặc /api/img/…
      (ghép URL Worker y như cz-config.js), tính khoá bằng src/shared/cover-mirror.js.
   3. Ảnh chưa có tệp: tải (ưu tiên bản nhỏ từ chính CDN nguồn), đổi WebP cạnh
      ≤ 480×720, bỏ metadata. Ảnh đã có tệp: giữ nguyên, không tải lại.
   4. Viết src/shared/covers-manifest.json = các khoá đang được registry dùng VÀ
      có tệp; xoá tệp không còn bộ nào dùng (repo không phình theo thời gian).
   Sau đó chạy `npm run build` để cz-app.js mang manifest mới.

   Link chết (404) chỉ được liệt kê trong `failed` — bìa đó tiếp tục dùng link
   gốc như cũ (biên tập viên cần tải bìa mới trong /admin).
   ========================================================================== */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { coverKey } = await import(pathToFileURL(path.join(HERE, 'src/shared/cover-mirror.js')).href);
const { shrinkRemoteImageUrl } = await import(pathToFileURL(path.join(HERE, 'src/shared/image-url.js')).href);

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : ''; };
const ROOT = path.resolve(arg('root') || HERE);
const MAX_W = 480, MAX_H = 720, QUALITY = 78, MAX_BYTES = 12 * 1024 * 1024, TIMEOUT_MS = 20000;
const SITE_HOSTS = ['ssochuz.pages.dev'];

/* y hệt fix() trong cz-config.js: thiếu https:// thì thêm, bỏ / ở cuối */
function fixApi(u) {
  u = String(u || '').trim().replace(/\/+$/, '');
  return (u && !/^https?:\/\//i.test(u)) ? 'https://' + u : u;
}
function apiFromConfig() {
  const f = path.join(HERE, 'cz-config.js');
  if (!existsSync(f)) return '';
  const m = readFileSync(f, 'utf8').match(/window\.CZ_API\s*=\s*'([^']*)'/);
  return m ? fixApi(m[1]) : '';
}
const API = fixApi(arg('api') || apiFromConfig());

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'ssochuz-cover-mirror/1.0 (+https://ssochuz.pages.dev)', accept: 'image/*,*/*;q=0.5' } });
  } finally { clearTimeout(t); }
}
async function loadRegistry() {
  const src = arg('registry');
  if (src && !/^https?:\/\//i.test(src)) return { reg: JSON.parse(readFileSync(src, 'utf8')), from: src };
  const url = src || (API ? API + '/api/registry' : '');
  if (url) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) return { reg: await res.json(), from: url };
      console.error('registry ' + url + ' → HTTP ' + res.status + ', dùng data/registry.json');
    } catch (e) { console.error('không đọc được ' + url + ' (' + ((e && e.message) || e) + '), dùng data/registry.json'); }
  }
  return { reg: JSON.parse(readFileSync(path.join(HERE, 'data', 'registry.json'), 'utf8')), from: 'data/registry.json' };
}
/* link bìa → URL tuyệt đối đúng như trình duyệt thấy; '' = không sao lưu */
function absolute(u) {
  u = String(u || '').trim();
  if (/^\/api\/img\//i.test(u)) return API ? API + u : '';
  if (!/^https?:\/\//i.test(u)) return '';
  try { if (SITE_HOSTS.includes(new URL(u).hostname)) return ''; } catch (e) { return ''; }
  return u;
}
async function download(url) {
  const tried = [];
  const small = shrinkRemoteImageUrl(url, MAX_H);
  for (const u of (small ? [small, url] : [url])) {
    try {
      const res = await fetchWithTimeout(u);
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok) { tried.push(u + ' → HTTP ' + res.status); continue; }
      if (type && !type.startsWith('image/') && !type.includes('octet-stream')) { tried.push(u + ' → ' + type); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) { tried.push(u + ' → ' + buf.length + ' byte'); continue; }
      return { buf };
    } catch (e) { tried.push(u + ' → ' + ((e && e.name === 'AbortError') ? 'hết giờ' : ((e && e.message) || e))); }
  }
  return { error: tried.join(' · ') };
}

try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); }
catch (e) { console.error('Thiếu ImageMagick (convert). Ubuntu: sudo apt-get install -y imagemagick'); process.exit(1); }

const { reg, from } = await loadRegistry();
const lib = (reg && reg.lib) || [];
if (!lib.length) { console.error('registry không có bộ nào (' + from + ')'); process.exit(1); }

const dir = path.join(ROOT, 'assets', 'covers');
mkdirSync(dir, { recursive: true });
const wanted = new Map();   /* khoá → { url, slug } */
for (const n of lib) {
  if (!n) continue;
  for (const f of ['thumb', 'slide', 'cover', 'cover_image_url']) {
    const url = absolute(n[f]);
    if (url && !wanted.has(coverKey(url))) wanted.set(coverKey(url), { url, slug: n.slug || '' });
  }
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'cz-mirror-'));
const summary = { registry: from, api: API, referenced: wanted.size, downloaded: 0, kept: 0, removed: 0, failed: [], bytes: 0, mirrored: 0 };
try {
  for (const [key, item] of wanted) {
    const out = path.join(dir, key + '.webp');
    if (existsSync(out)) { summary.kept++; continue; }
    const got = await download(item.url);
    if (!got.buf) { summary.failed.push({ slug: item.slug, url: item.url, error: got.error }); continue; }
    const src = path.join(tmp, key + '.src');
    writeFileSync(src, got.buf);
    try {
      /* [0] = khung đầu (GIF động), '>' = chỉ thu nhỏ, không phóng to */
      execFileSync('convert', [src + '[0]', '-auto-orient', '-resize', MAX_W + 'x' + MAX_H + '>', '-strip', '-quality', String(QUALITY), 'webp:' + out], { stdio: ['ignore', 'ignore', 'pipe'] });
      summary.downloaded++;
    } catch (e) {
      if (existsSync(out)) unlinkSync(out);
      summary.failed.push({ slug: item.slug, url: item.url, error: 'đổi WebP lỗi: ' + String((e && e.stderr) || e).slice(0, 160) });
    }
  }
  const keys = [...wanted.keys()].filter((k) => existsSync(path.join(dir, k + '.webp'))).sort();
  for (const f of readdirSync(dir)) {
    if (f === '.gitkeep') continue;
    if (!keys.includes(f.replace(/\.webp$/, ''))) { unlinkSync(path.join(dir, f)); summary.removed++; }
  }
  for (const k of keys) summary.bytes += statSync(path.join(dir, k + '.webp')).size;
  summary.mirrored = keys.length;
  mkdirSync(path.join(ROOT, 'src', 'shared'), { recursive: true });
  writeFileSync(path.join(ROOT, 'src', 'shared', 'covers-manifest.json'), JSON.stringify({ keys }, null, 2) + '\n');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(JSON.stringify(summary, null, 1));
