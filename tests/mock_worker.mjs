/* Worker giả lập chạy trên máy — dùng ĐÚNG code worker/cms.js thật + KV trong RAM,
   kèm máy chủ tĩnh để thử cả trang quản trị lẫn web ngoài.
   Chạy:  node tests/mock_worker.mjs [port]
   Mở:    http://127.0.0.1:<port>/admin.html   (khoá giả lập: MOCK)
   Dữ liệu ghi vào RAM, tắt là hết — không ảnh hưởng Cloudflare thật.
   Đổi khoá:  ADMIN_KEY=xxx node tests/mock_worker.mjs
   Vì chạy chính worker/cms.js nên mọi endpoint (kể cả /api/view, /api/vote,
   /api/comments) hành xử y hệt bản deploy — hết cảnh mock một đằng, thật một nẻo. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(path.join(ROOT, 'worker', 'cms.js'))).default;

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

/* ------------------------- KV trong RAM (đúng API Cloudflare KV) ---------- */
class MemKV {
  constructor() { this.m = new Map(); }
  async get(k, opt) {
    const v = this.m.get(k);
    if (!v) return null;
    if (v.exp && v.exp < Date.now()) { this.m.delete(k); return null; }
    if (opt && opt.type === 'json') { try { return JSON.parse(v.value); } catch (e) { return null; } }
    return v.value;
  }
  async getWithMetadata(k, opt) {
    const v = this.m.get(k);
    if (!v) return { value: null, metadata: null };
    return { value: opt && opt.type === 'json' ? JSON.parse(v.value) : v.value, metadata: v.metadata || null };
  }
  async put(k, value, opt) {
    this.m.set(k, { value: String(value), metadata: (opt && opt.metadata) || null, exp: opt && opt.expirationTtl ? Date.now() + opt.expirationTtl * 1000 : 0 });
  }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? all.indexOf(cursor) + 1 : 0;
    const keys = all.slice(start, start + limit).map((name) => ({ name, metadata: (this.m.get(name) || {}).metadata }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : all[start + limit - 1] };
  }
}

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const env = {
  ADMIN_KEY: process.env.ADMIN_KEY || 'MOCK',
  CZ_KV: new MemKV(),
  BLOG: process.env.BLOG || 'https://chuseoz.blogspot.com',
  ALLOW_ORIGIN: '*',
  SESSION_SECRET: process.env.SESSION_SECRET || 'mock-session-secret-dai-hon-32-ky-tu',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  FIREBASE_PROJECT: process.env.FIREBASE_PROJECT || 'chuseoz-library',
};

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (!p.startsWith('/api') && p !== '/') return serveStatic(req, res);

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const headers = {};
  Object.keys(req.headers).forEach((k) => { if (k !== 'host' && k !== 'connection' && k !== 'content-length') headers[k] = req.headers[k]; });

  const r = await worker.fetch(new Request('http://127.0.0.1:' + PORT + req.url, {
    method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  }), env, { waitUntil: () => {} });

  const out = Buffer.from(await r.arrayBuffer());
  const h = {};
  r.headers.forEach((v, k) => { h[k] = v; });
  h['content-length'] = out.length;
  res.writeHead(r.status, h);
  res.end(out);
}).listen(PORT, '0.0.0.0', () => {
  console.log('Worker giả lập (code thật, KV trong RAM): http://127.0.0.1:' + PORT);
  console.log('  ADMIN_KEY=' + env.ADMIN_KEY + (env.GOOGLE_CLIENT_ID ? '' : '   (chưa có GOOGLE_CLIENT_ID → chưa thử được đăng nhập Google)'));
});
