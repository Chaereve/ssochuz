/* Worker giả lập chạy trên máy — dùng ĐÚNG code worker/cms.js thật + KV trong RAM,
   kèm máy chủ tĩnh để thử cả trang quản trị lẫn web ngoài.
   Chạy:  node tests/mock_worker.mjs [port]
   Mở:    http://127.0.0.1:<port>/admin   (một trang quản trị duy nhất, khoá giả lập: MOCK)
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

function publicOriginOf(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || ('127.0.0.1:' + PORT)).split(',')[0].trim();
  const proto = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host) ? 'http' : 'https';
  return proto + '://' + host;
}

/* phục vụ file tĩnh trong repo (giống Cloudflare Pages, đủ dùng cho việc thử) */
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  /* Cloudflare Pages proxy các URL sạch về đúng file HTML (giống _redirects) */
  if (/^\/truyen(\/[^/]*)?\/?$/.test(rel)) rel = '/truyen.html';
  else if (/^\/reader(\/[^/]*)?\/?$/.test(rel)) rel = '/truyen.html';
  else if (rel === '/admin' || rel === '/admin/' || rel === '/admin-v2' || rel === '/admin-v2/'
    || rel === '/admin-legacy' || rel === '/admin-legacy/') rel = '/admin.html';
  else if (rel === '/guide' || rel === '/guide/') rel = '/guide.html';
  else if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\\/])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Không thấy ' + rel);
  }
  /* Trình duyệt người xem KHÔNG phải máy chủ: luôn lấy location.origin
     (host xem trước https://…e2b.app), không bao giờ nhét localhost/127.0.0.1. */
  const sameOrigin = "(self.location&&self.location.origin&&!/^(https?:\\/\\/)?(localhost|127\\.|0\\.0\\.0\\.0|\\[::1\\])/i.test(self.location.origin)?self.location.origin:" + JSON.stringify(publicOriginOf(req)) + ")";
  if (rel === '/cz-config.js') {
    const js = fs.readFileSync(file, 'utf8')
      .replace(/window\.CZ_API\s*=\s*'[^']*';/, 'window.CZ_API = ' + sameOrigin + ';');
    res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
    return res.end(js);
  }
  if (rel === '/admin.html') {
    let html = fs.readFileSync(file, 'utf8');
    const inject = '<script>window.CZ_API=' + sameOrigin + ';'
      + 'try{var o=window.CZ_API;sessionStorage.setItem("cz_kv_key","MOCK");if(o)localStorage.setItem("cz_kv_api",o);}catch(e){}</script>';
    html = html.indexOf('</head>') >= 0 ? html.replace('</head>', inject + '</head>') : inject + html;
    const buf = Buffer.from(html);
    res.writeHead(200, { 'content-type': MIME['.html'], 'content-length': buf.length, 'cache-control': 'no-store' });
    return res.end(buf);
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
const HOST = process.env.HOST || '0.0.0.0';
const env = {
  ADMIN_KEY: process.env.ADMIN_KEY || 'MOCK',
  CZ_KV: new MemKV(),
  BLOG: process.env.BLOG || 'https://chuseoz.blogspot.com',
  ALLOW_ORIGIN: '*',
  SESSION_SECRET: process.env.SESSION_SECRET || 'mock-session-secret-dai-hon-32-ky-tu',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || '',
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || 'owner@example.com',
  FIREBASE_PROJECT: process.env.FIREBASE_PROJECT || 'chuseoz-library',
};

/* Nạp sẵn dữ liệu repo vào KV để bản xem trước hành xử y như production
   (web đọc KV trước, file tĩnh chỉ là đường dự phòng). Tắt bằng NO_SEED=1. */
async function seedFromRepo() {
  if (process.env.NO_SEED) return 0;
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8'));
  await env.CZ_KV.put('registry', JSON.stringify(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  const dir = path.join(ROOT, 'data/book');
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const slug = f.slice(0, -5);
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    let chaps = 0;
    try { chaps = (JSON.parse(txt).chapters || []).length; } catch (e) {}
    await env.CZ_KV.put('book:' + slug, txt, { metadata: { saved: new Date().toISOString(), chapters: chaps } });
    n++;
  }
  await env.CZ_KV.put('_last', new Date().toISOString());
  return n;
}

/* Vài phiếu mẫu để tab “Phiếu bầu” có dữ liệu mà bấm thử ngay (chỉ ở bản xem
   thử, KV nằm trong RAM nên tắt là hết). */
async function seedDemoVotes() {
  if (process.env.NO_SEED) return;
  const now = Date.now();
  const items = {
    'third-person': { 'a:may-demo-1': now - 86400e3, 'a:may-demo-2#2': now - 7200e3, 'g:demo-user-a#2': now - 5400e3, 'a:may-demo-3#3': now - 3600e3 },
    'be-my-angel': { 'g:demo-user-b': now - 43200e3, 'a:may-demo-4#5': now - 10800e3 },
    'lunar-secret': { 'a:may-demo-5': now - 600e3 }
  };
  const stats = { updatedAt: new Date().toISOString(), items: {} };
  Object.keys(items).forEach((slug) => {
    const voters = {};
    Object.keys(items[slug]).forEach((k) => { voters[k] = { t: new Date(items[slug][k]).toISOString() }; });
    const chap = {};
    Object.keys(voters).forEach((k) => {
      const m = k.match(/#(\d+)$/);
      if (m) chap[m[1]] = (Number(chap[m[1]]) || 0) + 1;
    });
    stats.items[slug] = { base: { views: 120, votes: 0 }, got: { views: 40, votes: Object.keys(voters).length },
      days: { [new Date().toISOString().slice(0, 10)]: { v: 40, o: Object.keys(voters).length } }, voters, chap,
      updatedAt: new Date().toISOString() };
  });
  await env.CZ_KV.put('stats', JSON.stringify(stats));
}

/* Vài báo lỗi mẫu để tab “Báo lỗi” trong /admin có sẵn thứ để xem khi thử máy. */
async function seedDemoReports() {
  if (process.env.NO_SEED) return;
  const now = Date.now();
  const items = [
    { at: new Date(now - 3600e3).toISOString(), slug: 'third-person', title: 'Third Person', ch: 2,
      url: '/truyen/third-person/#chuong-2', text: 'Chương 2: “cô áy” viết sai chính tả, đúng là “cô ấy”.', who: 'a:may-demo-9' },
    { at: new Date(now - 26 * 3600e3).toISOString(), slug: 'be-my-angel', title: 'Be My Angel', ch: 5,
      url: '/truyen/be-my-angel/#chuong-5', text: 'Thiếu dấu chấm cuối đoạn 3, với lại tên nhân vật bị lặp 2 lần.', who: 'docgia@gmail.com' }
  ].map((x) => Object.assign({ kind: 'Báo lỗi chữ' }, x));
  await env.CZ_KV.put('report', JSON.stringify(items));
}

async function seedDemoComments() {
  if (process.env.NO_SEED) return;
  const now = Date.now();
  await env.CZ_KV.put('cmt:third-person', JSON.stringify([
    { id: 'c1', uid: 'g:demo-a', name: 'Lan', text: 'Chương 1 hay quá, mong ra tiếp sớm.', ch: 1, createdAt: new Date(now - 7200e3).toISOString() },
    { id: 'c2', uid: 'g:demo-b', name: 'Minh', text: 'Couple này ngọt thật, đọc một mạch.', ch: 2, createdAt: new Date(now - 3600e3).toISOString() },
    { id: 'c3', uid: 'g:promo', name: 'Promo88', text: 'Click http://spam.example.com mua thuốc giảm cân ngay!!!', ch: 0, createdAt: new Date(now - 900e3).toISOString() }
  ]));
  await env.CZ_KV.put('log', JSON.stringify([
    { at: new Date(now - 120e3).toISOString(), text: 'nạp dữ liệu demo vào KV RAM', who: 'mock-worker' },
    { at: new Date(now - 60e3).toISOString(), text: 'seed báo lỗi + phiếu + bình luận', who: 'mock-worker' }
  ]));
}

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  /* '/' phục vụ luôn trang chủ (trước đây '/' trả JSON health của Worker khiến
     bản xem thử mở lên chỉ thấy JSON); muốn xem health thì vào /api/health. */
  if (!p.startsWith('/api')) return serveStatic(req, res);

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
}).listen(PORT, HOST, async () => {
  const seeded = await seedFromRepo();
  await seedDemoVotes();
  await seedDemoReports();
  await seedDemoComments();
  console.log('Worker giả lập (code thật, KV trong RAM): http://' + HOST + ':' + PORT);
  console.log('  ADMIN_KEY=' + env.ADMIN_KEY + ' · đã nạp ' + seeded + ' bộ từ repo vào KV');
  console.log('  Mở /admin — tự điền khoá MOCK, KV RAM (tắt là hết)');
  console.log('  ADMIN_EMAILS=' + env.ADMIN_EMAILS + (env.SUPABASE_URL ? ' · SUPABASE_URL=' + env.SUPABASE_URL : ' · (chưa đặt SUPABASE_URL → /api/auth/supabase sẽ báo thiếu)'));
});
