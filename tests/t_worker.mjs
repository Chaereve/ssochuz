/* ============================================================================
   t_worker.mjs · KIỂM THỬ THẬT CHO worker/cms.js (không phải bản giả lập)
   ----------------------------------------------------------------------------
   Bài này nạp thẳng worker/cms.js vào Node, gắn một KV giả (Map) + fetch giả,
   rồi gọi từng endpoint y như trình duyệt/trang quản trị gọi:
     · health / whoami / registry / book / seed           (kênh đăng KV)
     · preflight CORS (x-admin-key, x-import-mode)        (admin.js có gửi header này)
     · sync từ Blogger — dùng ĐÚNG file _inbox/live2/list-novel.html thật
     · import 1 bài viết thành chương (bỏ quảng cáo/bình luận)
     · đăng nhập Google: ký 1 idToken RS256 bằng khoá tạo lúc chạy thử,
       JWKS giả có cả dạng x5c và dạng n/e  →  worker phải verify được
     · bình luận: đăng / đọc / xoá / chặn người khác / chặn spam
     · SỐ LIỆU XẾP HẠNG trên KV: đếm lượt đọc, bình chọn, /api/stats
   Chạy:  node tests/t_worker.mjs
   Điều kiện đạt: mọi khoá "errors*" là [] và thoát mã 0.
   ========================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(path.join(ROOT, 'worker', 'cms.js'))).default;

/* ============================ KV giả (như Cloudflare KV) ==================== */
class FakeKV {
  constructor() { this.m = new Map(); this.writes = 0; }
  async get(k, opt) {
    const v = this.m.get(k);
    if (v === undefined) return null;
    if (opt && opt.type === 'json') { try { return JSON.parse(v.value); } catch (e) { return null; } }
    return v.value;
  }
  async getWithMetadata(k, opt) {
    const v = this.m.get(k);
    if (v === undefined) return { value: null, metadata: null };
    return { value: opt && opt.type === 'json' ? JSON.parse(v.value) : v.value, metadata: v.metadata || null };
  }
  async put(k, value, opt) { this.writes++; this.m.set(k, { value: String(value), metadata: (opt && opt.metadata) || null }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? all.indexOf(cursor) + 1 : 0;
    const keys = all.slice(start, start + limit).map((name) => ({ name, metadata: this.m.get(name).metadata }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : all[start + limit - 1] };
  }
}

/* ============================ fetch giả ==================================== */
let net = [];                                   /* nhật ký mọi request ra ngoài */
let routes = () => null;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  net.push(u);
  const r = routes(u, init);
  if (!r) return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  return {
    ok: (r.status || 200) < 400, status: r.status || 200,
    text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
    json: async () => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body),
  };
};

/* ============================ khoá RSA + idToken giả ======================== */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'czw-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', tmp + '/key.pem',
  '-out', tmp + '/cert.pem', '-days', '1', '-nodes', '-subj', '/CN=chuseoz-test'], { stdio: 'ignore' });
execFileSync('openssl', ['x509', '-in', tmp + '/cert.pem', '-outform', 'der', '-out', tmp + '/cert.der'], { stdio: 'ignore' });
const KEY_PEM = fs.readFileSync(tmp + '/key.pem', 'utf8');
const X5C = fs.readFileSync(tmp + '/cert.der').toString('base64');
const NE = crypto.createPublicKey(fs.readFileSync(tmp + '/cert.pem', 'utf8')).export({ format: 'jwk' });

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function idToken(over = {}, head = {}) {
  const now = Math.floor(Date.now() / 1000);
  const p = Object.assign({
    iss: 'accounts.google.com', aud: 'CLIENT_ID_TEST', sub: 'google-user-1', email: 'docgia@gmail.com',
    name: 'Người Thử', picture: 'https://lh3.googleusercontent.com/a/x', email_verified: true,
    iat: now, exp: now + 3600,
  }, over);
  const h = Object.assign({ alg: 'RS256', kid: 'kid-test', typ: 'JWT' }, head);
  const data = b64u(JSON.stringify(h)) + '.' + b64u(JSON.stringify(p));
  return data + '.' + b64u(crypto.sign('RSA-SHA256', Buffer.from(data), KEY_PEM));
}

/* ============================ gọi worker =================================== */
const kv = new FakeKV();
const ADMIN = 'khoa-quan-tri-dai-cho-du-24-ky-tu';
const env = {
  ADMIN_KEY: ADMIN, CZ_KV: kv, BLOG: 'https://chuseoz.blogspot.com', ALLOW_ORIGIN: 'https://web.test',
  SESSION_SECRET: 'session-secret-dai-hon-32-ky-tu-cho-chac', GOOGLE_CLIENT_ID: 'CLIENT_ID_TEST',
  FIREBASE_PROJECT: 'chuseoz-library', STATS_FLUSH_MS: '50',   /* bản thật gom 20 giây; test gom 50ms */
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(Promise.resolve(p)) };
async function call(method, p, { body, headers = {}, e = env } = {}) {
  const h = Object.assign({ origin: 'https://web.test' }, headers);
  if (body !== undefined && typeof body !== 'string') h['content-type'] = 'application/json';
  const req = new Request('https://cms.test' + p, {
    method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  let res;
  try {
    res = await worker.fetch(req, e, ctx);
  } catch (err) {
    /* Worker thật sẽ trả trang lỗi 1101; ở đây coi như 500 để bài test chạy tiếp */
    await Promise.all(waits.splice(0));
    return { status: 500, ok: false, body: { ok: false, error: 'worker ném lỗi ra ngoài try/catch: ' + err.message }, text: '', headers: new Headers() };
  }
  await Promise.all(waits.splice(0));            /* chờ các waitUntil như Workers làm */
  const txt = await res.text();
  let j = null; try { j = JSON.parse(txt); } catch (err) { j = null; }
  return { status: res.status, ok: res.ok, body: j, text: txt, headers: res.headers };
}

/* ============================ bộ kiểm tra ================================== */
const checks = [];
const ck = (name, ok, got, want) => checks.push({ name, ok: !!ok, got, want });
const eq = (name, got, want) => ck(name, JSON.stringify(got) === JSON.stringify(want), got, want);

/* trang danh sách Blogger THẬT (để kiểm tra parseCards đúng thẻ div.truyen-card) */
const LIST_HTML = fs.readFileSync(path.join(ROOT, '_inbox/live2/list-novel.html'), 'utf8');
const POST_HTML = `<html><head><title>Chương 5: Gặp lại | chuseoz</title></head><body>
  <div class="post-body entry-content">
    <p>Đoạn mở đầu của chương mới, đủ dài để worker chấp nhận là nội dung đọc được.</p>
    <ins class="adsbygoogle" data-ad-client="x"></ins>
    <p>Đoạn thứ hai có <b>chữ đậm</b> và một ảnh.</p>
    <img src="https://img.test/a.jpg" />
    <div class="post-footer"><div class="comments">bình luận facebook</div></div>
  </div></body></html>`;

(async () => {
  /* ---------- 1. health: KV chưa gắn phải báo rõ, không nổ 500 ---------- */
  {
    const r = await call('GET', '/api/health', { e: Object.assign({}, env, { CZ_KV: undefined }) });
    eq('health/không KV → 200', r.status, 200);
    ck('health/không KV → kv:false', !!(r.body && r.body.kv === false), r.body && (r.body.kv !== undefined ? r.body.kv : r.body.error), false);
  }
  {
    const r = await call('GET', '/api/health');
    ck('health/có KV → ok:true', !!(r.body && r.body.ok === true), r.body && r.body.ok, true);
    ck('health/có version', !!(r.body && r.body.version), r.body && r.body.version, 'chuỗi');
  }

  /* ---------- 2. preflight CORS phải cho phép header admin.js gửi -------- */
  {
    const r = await call('OPTIONS', '/api/import', {
      headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-admin-key,x-import-mode' },
    });
    eq('cors/preflight → 204', r.status, 204);
    const ah = String(r.headers.get('access-control-allow-headers') || '').toLowerCase();
    ck('cors/cho phép x-admin-key', ah.includes('x-admin-key'), ah, 'có x-admin-key');
    ck('cors/cho phép x-import-mode (admin.js gửi khi lấy từ Blogger)', ah.includes('x-import-mode'), ah, 'có x-import-mode');
    ck('cors/cho phép authorization', ah.includes('authorization'), ah, 'có authorization');
    eq('cors/allow-origin theo Origin', r.headers.get('access-control-allow-origin'), 'https://web.test');
  }

  /* ---------- 3. khoá quản trị ---------- */
  eq('whoami/thiếu khoá → 401', (await call('GET', '/api/whoami')).status, 401);
  eq('whoami/sai khoá → 401', (await call('GET', '/api/whoami', { headers: { 'x-admin-key': 'sai' } })).status, 401);
  ck('whoami/đúng khoá → admin', ((await call('GET', '/api/whoami', { headers: { 'x-admin-key': ADMIN } })).body || {}).role === 'admin',
    ((await call('GET', '/api/whoami', { headers: { 'x-admin-key': ADMIN } })).body || {}).role, 'admin');

  /* ---------- 4. registry / book / seed ---------- */
  const REG = { rev: '2026-09-13z', lib: [
    { title: 'Lunar Secret', slug: 'lunar-secret', author: 'Purple Moon', couple: 'Ginny x Jayna', year: '2014', status: 'Hoàn thành', chapters: 2, countLabel: '2/2', updated: '2026-09-10' },
    { title: 'Third Person', slug: 'third-person', author: 'A', couple: 'B x C', year: '2025', status: 'Đang cập nhật', chapters: 1, countLabel: '1/9', updated: '2026-09-12' },
  ] };
  eq('registry/PUT thiếu khoá → 401', (await call('PUT', '/api/registry', { body: REG })).status, 401);
  {
    const r = await call('PUT', '/api/registry', { body: REG, headers: { 'x-admin-key': ADMIN } });
    ck('registry/PUT có khoá → ok', !!(r.body && r.body.ok === true), r.body && r.body.error, 'ok');
  }
  {
    const r = await call('GET', '/api/registry');
    eq('registry/GET trả đúng dữ liệu', r.body && r.body.rev, '2026-09-13z');
    eq('registry/GET có 2 bộ', r.body && (r.body.lib || []).length, 2);
    ck('registry/GET etag không phải chữ "undefined"', r.headers.get('etag') !== 'undefined', r.headers.get('etag'), 'etag hợp lệ hoặc trống');
  }
  eq('book/GET chưa có → 404', (await call('GET', '/api/book/lunar-secret')).status, 404);
  {
    await call('PUT', '/api/book/lunar-secret', { body: { title: 'Lunar Secret', slug: 'lunar-secret', chapters: [{ t: 'Chương 1', html: '<p>a</p>' }] }, headers: { 'x-admin-key': ADMIN } });
    const r = await call('GET', '/api/book/lunar-secret');
    eq('book/PUT rồi GET → 1 chương', r.body && (r.body.chapters || []).length, 1);
    eq('book/DELETE thiếu khoá → 401', (await call('DELETE', '/api/book/lunar-secret')).status, 401);
    await call('DELETE', '/api/book/lunar-secret', { headers: { 'x-admin-key': ADMIN } });
    eq('book/DELETE rồi GET → 404', (await call('GET', '/api/book/lunar-secret')).status, 404);
  }
  {
    const r = await call('POST', '/api/seed', {
      headers: { 'x-admin-key': ADMIN },
      body: { registry: REG, books: { 'lunar-secret': { slug: 'lunar-secret', chapters: [] }, 'third-person': { slug: 'third-person', chapters: [] } } },
    });
    eq('seed/2 bộ', r.body && r.body.books, 2);
    const h = await call('GET', '/api/health');
    eq('health/đếm 2 bộ', h.body && h.body.books, 2);
  }

  /* ---------- 5. sync từ Blogger (thẻ div.truyen-card thật) ---------- */
  {
    routes = (u) => u.includes('/p/list-novel.html') ? { status: 200, body: LIST_HTML }
      : u.includes('/feeds/pages/default') ? { status: 200, body: { feed: { entry: [{ content: { $t: '<p>Thứ 2, 3: Lunar Secret</p><p>Lịch có thể thay đổi nếu có việc đột xuất.</p>' } }] } } } : null;
    const r = await call('POST', '/api/sync', { headers: { 'x-admin-key': ADMIN }, body: {} });
    ck('sync/đọc được 62 thẻ truyện từ HTML thật', !!(r.body && r.body.cards === 62), r.body && r.body.cards, 62);
    ck('sync/có trường thay đổi', !!((r.body && r.body.changed) > 0), r.body && r.body.changed, '> 0');
    const reg = await kv.get('registry', { type: 'json' });
    const ls = (reg.lib || []).find((n) => n.slug === 'lunar-secret');
    eq('sync/ghép ảnh bìa vào bộ', !!(ls && ls.thumb), true);
    eq('sync/ghép tác giả', ls && ls.author, 'Purple Moon');
    eq('sync/ghép nhãn đếm', ls && ls.countLabel, '39/39');
    eq('sync/lịch ra chương', (reg.schedule && reg.schedule.items || []).length > 0, true);
  }

  /* ---------- 6. import 1 bài viết thành chương ---------- */
  {
    routes = (u) => u.includes('bai-viet.html') ? { status: 200, body: POST_HTML } : null;
    eq('import/thiếu khoá → 401', (await call('POST', '/api/import', { body: { slug: 'lunar-secret', url: 'https://chuseoz.blogspot.com/p/bai-viet.html' } })).status, 401);
    const r = await call('POST', '/api/import', {
      headers: { 'x-admin-key': ADMIN }, body: { slug: 'lunar-secret', url: 'https://chuseoz.blogspot.com/p/bai-viet.html' },
    });
    ck('import/thêm chương', r.body.ok === true && r.body.chapters === 1, r.body, { ok: true, chapters: 1 });
    const b = await kv.get('book:lunar-secret', { type: 'json' });
    const html = (b.chapters[0] || {}).html || '';
    ck('import/bỏ quảng cáo <ins>', !/adsbygoogle|<ins/i.test(html), html.slice(0, 80), 'không còn <ins>');
    ck('import/bỏ khối bình luận', !/bình luận facebook/i.test(html), html.slice(0, 80), 'không còn bình luận');
    ck('import/giữ ảnh', /<img[^>]+img\.test\/a\.jpg/.test(html), html.slice(0, 120), 'có <img>');
    ck('import/giữ chữ đậm', /<b>chữ đậm<\/b>/.test(html), html.slice(0, 120), 'có <b>');
    const r2 = await call('POST', '/api/import', {
      headers: { 'x-admin-key': ADMIN, 'x-import-mode': 'replace-last' }, body: { slug: 'lunar-secret', url: 'https://chuseoz.blogspot.com/p/bai-viet.html' },
    });
    eq('import/replace-last không thêm chương', r2.body && r2.body.chapters, 1);
    eq('import/link không phải blogspot → 400',
      (await call('POST', '/api/import', { headers: { 'x-admin-key': ADMIN }, body: { slug: 'lunar-secret', url: 'https://evil.test/x' } })).status, 400);
  }

  /* ---------- 7. đăng nhập Google (idToken ký thật bằng khoá RSA) ---------- */
  let TOKEN = '';
  {
    /* (a) JWKS chỉ có x5c — đúng như Google trả về */
    routes = (u) => u.includes('/oauth2/v3/certs') ? { status: 200, body: { keys: [{ kty: 'RSA', kid: 'kid-x5c', use: 'sig', alg: 'RS256', x5c: [X5C] }] } } : null;
    const r = await call('POST', '/api/auth/google', { body: { credential: idToken({}, { kid: 'kid-x5c' }) } });
    ck('google/verify bằng x5c → có session', !!(r.body && r.body.ok === true && r.body.token), r.body && r.body.error, 'token');
    TOKEN = (r.body && r.body.token) || '';
    ck('google/trả exp để web tự hết hạn', !!(r.body && r.body.user && r.body.user.exp), r.body && (r.body.error || r.body.user), 'có exp');
  }
  {
    /* (b) JWKS chỉ có n/e */
    routes = (u) => u.includes('/oauth2/v3/certs') ? { status: 200, body: { keys: [{ kty: 'RSA', kid: 'kid-ne', n: NE.n, e: NE.e }] } } : null;
    const r = await call('POST', '/api/auth/google', { body: { credential: idToken({ sub: 'google-user-2', email: 'b@gmail.com' }, { kid: 'kid-ne' }) } });
    ck('google/verify bằng n/e → có session', !!(r.body && r.body.ok === true), r.body && r.body.error, 'token');
  }
  {
    routes = (u) => u.includes('/oauth2/v3/certs') ? { status: 200, body: { keys: [{ kty: 'RSA', kid: 'kid-test', n: NE.n, e: NE.e, x5c: [X5C] }] } } : null;
    eq('google/sai audience → 401', (await call('POST', '/api/auth/google', { body: { credential: idToken({ aud: 'khac' }) } })).status, 401);
    eq('google/hết hạn → 401', (await call('POST', '/api/auth/google', { body: { credential: idToken({ exp: Math.floor(Date.now() / 1000) - 10 }) } })).status, 401);
    eq('google/sai issuer → 401', (await call('POST', '/api/auth/google', { body: { credential: idToken({ iss: 'https://evil.test' }) } })).status, 401);
    const bad = idToken().split('.'); bad[1] = b64u(JSON.stringify({ sub: 'x', aud: 'CLIENT_ID_TEST', exp: 9999999999 }));
    eq('google/chữ ký không khớp → 401', (await call('POST', '/api/auth/google', { body: { credential: bad.join('.') } })).status, 401);
    eq('google/thiếu credential → 400', (await call('POST', '/api/auth/google', { body: {} })).status, 400);
  }

  /* ---------- 8. session + bình luận ---------- */
  {
    eq('auth/me/thiếu token → 401', (await call('GET', '/api/auth/me')).status, 401);
    const me = await call('GET', '/api/auth/me', { headers: { authorization: 'Bearer ' + TOKEN } });
    eq('auth/me/có token → email', me.body && me.body.user && me.body.user.email, 'docgia@gmail.com');
    eq('comments/đăng khi chưa vào → 401', (await call('POST', '/api/comments/lunar-secret', { body: { text: 'hay' } })).status, 401);
    const auth = { authorization: 'Bearer ' + TOKEN };
    const p1 = await call('POST', '/api/comments/lunar-secret', { headers: auth, body: { text: 'Chương này hay quá!' } });
    const CID = (p1.body && p1.body.comment && p1.body.comment.id) || '';
    ck('comments/đăng được', !!(p1.body && p1.body.ok === true && CID), p1.body && p1.body.error, 'có comment.id');
    eq('comments/đọc lại 1 bình luận', ((await call('GET', '/api/comments/lunar-secret')).body || {}).count, 1);
    /* người khác (token khác uid) không được xoá */
    routes = (u) => u.includes('/oauth2/v3/certs') ? { status: 200, body: { keys: [{ kty: 'RSA', kid: 'kid-test', n: NE.n, e: NE.e }] } } : null;
    const other = ((await call('POST', '/api/auth/google', { body: { credential: idToken({ sub: 'nguoi-khac', email: 'khac@gmail.com' }) } })).body || {}).token || '';
    eq('comments/người khác xoá → 403',
      (await call('DELETE', '/api/comments/lunar-secret/' + CID, { headers: { authorization: 'Bearer ' + other } })).status, 403);
    eq('comments/tác giả xoá → 200',
      (await call('DELETE', '/api/comments/lunar-secret/' + CID, { headers: auth })).status, 200);
    eq('comments/xoá xong còn 0', ((await call('GET', '/api/comments/lunar-secret')).body || {}).count, 0);
    /* spam: quá 3 bình luận/10 phút thì bị chặn (429) */
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await call('POST', '/api/comments/lunar-secret', { headers: auth, body: { text: 'spam ' + i } })).status);
    ck('comments/chặn spam (có 429)', codes.includes(429), codes, 'có 429');
    eq('comments/thiếu nội dung → 400', (await call('POST', '/api/comments/lunar-secret', { headers: auth, body: { text: '   ' } })).status, 400);
  }

  /* ---------- 9. SỐ LIỆU XẾP HẠNG TRÊN KV (không cần Firebase) ---------- */
  {
    net = [];
    routes = (u) => u.includes('firestore.googleapis.com') ? { status: 403, body: { error: { code: 403 } } } : null;
    const v1 = await call('POST', '/api/view', { body: { slug: 'lunar-secret', vid: 'may-1', ch: 1 } });
    ck('view/đếm được', !!(v1.body && v1.body.ok === true), v1.body && (v1.body.error || v1.body.ok), true);
    await call('POST', '/api/view', { body: { slug: 'lunar-secret', vid: 'may-1', ch: 2 } });   /* cùng máy → không đếm lại */
    await call('POST', '/api/view', { body: { slug: 'lunar-secret', vid: 'may-2', ch: 1 } });
    await call('POST', '/api/view', { body: { slug: 'third-person', vid: 'may-2', ch: 1 } });
    const s = await call('GET', '/api/stats');
    eq('stats/nguồn là KV', s.body && s.body.source, 'kv');
    const it = (s.body && s.body.items) || {};
    eq('stats/lunar-secret 2 lượt đọc (đã khử trùng lặp)', (it['lunar-secret'] || {}).views, 2);
    eq('stats/third-person 1 lượt đọc', (it['third-person'] || {}).views, 1);
    ck('stats/có viewsToday', ((it['lunar-secret'] || {}).viewsDay || 0) === 2, (it['lunar-secret'] || {}).viewsDay, 2);
    ck('stats/không gọi Firebase nữa', net.filter((u) => u.includes('firestore')).length === 0,
      net.filter((u) => u.includes('firestore')), []);
  }
  {
    /* hẹn giờ ghi: 1 lượt đọc lẻ loi cũng phải xuống KV dù không ai gọi /api/stats */
    await call('POST', '/api/view', { body: { slug: 'schedule-check', vid: 'may-9' } });
    const raw = await kv.get('stats', { type: 'json' });
    const it = (raw && raw.items && raw.items['schedule-check']) || {};
    eq('view/lượt đọc lẻ loi vẫn được ghi (hẹn giờ)', (it.got || {}).views, 1);
  }
  {
    const auth = { authorization: 'Bearer ' + TOKEN };
    const v = await call('POST', '/api/vote', { headers: auth, body: { slug: 'lunar-secret', vote: 1 } });
    eq('vote/bầu 1 phiếu', v.body && v.body.votes, 1);
    const v2 = await call('POST', '/api/vote', { headers: auth, body: { slug: 'lunar-secret', vote: 1 } });
    eq('vote/bầu lại không tăng', v2.body && v2.body.votes, 1);
    const v3 = await call('POST', '/api/vote', { headers: auth, body: { slug: 'lunar-secret', vote: 0 } });
    eq('vote/bỏ phiếu → 0', v3.body && v3.body.votes, 0);
    const an = await call('POST', '/api/vote', { body: { slug: 'lunar-secret', vote: 1, vid: 'khach-1' } });
    eq('vote/khách không cần đăng nhập', an.body && an.body.votes, 1);
    const s = await call('GET', '/api/stats');
    eq('stats/đọc lại số phiếu', ((s.body.items || {})['lunar-secret'] || {}).votes, 1);
    eq('vote/slug lạ → 400', (await call('POST', '/api/vote', { body: { vote: 1 } })).status, 400);
  }
  {
    /* nạp số cũ (từ Firebase/file) vào KV — lấy max, không ghi đè số mới */
    const r = await call('POST', '/api/stats/seed', {
      headers: { 'x-admin-key': ADMIN },
      body: { items: { 'lunar-secret': { views: 450, votes: 12 }, 'third-person': { views: 1234, votes: 56 } } },
    });
    eq('stats/seed nhận 2 bộ', r.body && r.body.updated, 2);
    const s = await call('GET', '/api/stats');
    eq('stats/số cũ + số mới', ((s.body.items || {})['lunar-secret'] || {}).views, 452);
    eq('stats/số phiếu cũ + mới', ((s.body.items || {})['lunar-secret'] || {}).votes, 13);
    eq('stats/seed thiếu khoá → 401', (await call('POST', '/api/stats/seed', { body: { items: {} } })).status, 401);
    eq('stats/refresh → ok', ((await call('POST', '/api/stats/refresh', { headers: { 'x-admin-key': ADMIN } })).body || {}).ok, true);
  }

  /* ---------- 10. lặt vặt ---------- */
  eq('404/đường dẫn lạ', (await call('GET', '/api/khong-co')).status, 404);
  eq('500/không KV mà đọc registry', (await call('GET', '/api/registry', { e: Object.assign({}, env, { CZ_KV: undefined }) })).status, 503);

  fs.rmSync(tmp, { recursive: true, force: true });

  const bad = checks.filter((c) => !c.ok);
  const out = {
    tongSo: checks.length,
    dat: checks.length - bad.length,
    loi: bad.map((c) => c.name + ' (nhận: ' + JSON.stringify(c.got) + ', cần: ' + JSON.stringify(c.want) + ')'),
    errors0: bad.map((c) => c.name),
  };
  console.log(JSON.stringify(out, null, 1));
  console.log(bad.length ? 'CÒN ' + bad.length + ' LỖI TRONG WORKER' : 'Worker đạt hết ' + checks.length + ' kiểm tra');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.log(JSON.stringify({ errors0: ['ngoại lệ khi chạy: ' + (e && e.stack || e)] }, null, 1));
  process.exit(1);
});
