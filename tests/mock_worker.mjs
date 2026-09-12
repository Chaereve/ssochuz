/* Worker giả lập + máy chủ tĩnh chạy trên máy — thử kênh đăng KV trước khi lên Cloudflare.
   Chạy:  node tests/mock_worker.mjs [port]
   Mở:    http://127.0.0.1:<port>/admin.html   (khoá giả lập: MOCK)
   Dữ liệu ghi vào RAM, tắt là hết — không ảnh hưởng Cloudflare thật.
   Khoá quản trị đổi bằng biến môi trường ADMIN_KEY.                        */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

/* phục vụ file tĩnh trong repo (giống Cloudflare Pages, đủ dùng cho việc thử) */
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (/^\/truyen\/[^/]+\/?$/.test(rel)) rel = '/reader.html';      /* /truyen/<slug>/ → trang đọc */
  else if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\\/])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Không thấy ' + rel);
  }
  const d = fs.readFileSync(file);
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': d.length, 'cache-control': 'no-store' });
  res.end(d);
}

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const KEY = process.env.ADMIN_KEY || 'MOCK';
const KV = new Map();           /* giả lập Cloudflare KV */
let last = null;

const body = (req) => new Promise((res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => res(b));
});
const json = (res, obj, status = 200) => {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s), 'access-control-allow-origin': '*' });
  res.end(s);
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (!p.startsWith('/api')) return serveStatic(req, res);
  const auth = (req.headers['x-admin-key'] || '') === KEY;
  const needAuth = !(req.method === 'GET' && (p === '/' || p === '/api/health' || p === '/api/registry' || p === '/api/schedule' || p === '/api/stats' || p.startsWith('/api/book/')));
  if (needAuth && !auth) return json(res, { ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401);

  try {
    if (p === '/' || p === '/api/health') {
      return json(res, { ok: true, version: 'mock', kv: true, books: [...KV.keys()].filter((k) => k.startsWith('book:')).length, regRev: (KV.get('registry') && JSON.parse(KV.get('registry')).rev) || '', lastWrite: last });
    }
    if (p === '/api/whoami') return json(res, { ok: true, role: 'admin', version: 'mock' });
    if (p === '/api/registry') {
      if (req.method === 'PUT') { KV.set('registry', await body(req)); last = new Date().toISOString(); return json(res, { ok: true }); }
      const v = KV.get('registry');
      return v ? json(res, JSON.parse(v)) : json(res, { ok: false, error: 'KV trống' }, 404);
    }
    const m = p.match(/^\/api\/book\/(.+)$/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      const k = 'book:' + slug;
      if (req.method === 'PUT') { KV.set(k, await body(req)); last = new Date().toISOString(); return json(res, { ok: true }); }
      if (req.method === 'DELETE') { KV.delete(k); return json(res, { ok: true, deleted: slug }); }
      const v = KV.get(k);
      return v ? json(res, JSON.parse(v)) : json(res, { ok: false, error: 'chưa có' }, 404);
    }
    if (p === '/api/seed' && req.method === 'POST') {
      const d = JSON.parse(await body(req));
      let n = 0;
      if (d.registry) KV.set('registry', JSON.stringify(d.registry));
      for (const [slug, b] of Object.entries(d.books || {})) { KV.set('book:' + slug, JSON.stringify(b)); n++; }
      last = new Date().toISOString();
      return json(res, { ok: true, books: n, failed: [], registry: !!d.registry });
    }
    if (p === '/api/sync' && req.method === 'POST') return json(res, { ok: true, cards: 62, changed: 0, rev: new Date().toISOString() });
    if (p === '/api/stats/refresh') return json(res, { ok: true, cleared: 'stats' });
    if (p === '/api/stats') return json(res, { ok: true, items: {}, source: 'mock' });
    if (p === '/api/schedule') return json(res, { ok: true, items: [], note: 'mock' });
    return json(res, { ok: false, error: 'không có endpoint này', path: p }, 404);
  } catch (e) {
    return json(res, { ok: false, error: String(e && e.message || e) }, 500);
  }
}).listen(PORT, '0.0.0.0', () => console.log('Worker giả lập: http://127.0.0.1:' + PORT + '  (ADMIN_KEY=' + KEY + ')'));
