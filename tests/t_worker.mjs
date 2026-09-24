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
  constructor() { this.m = new Map(); this.writes = 0; this.reads = 0; }
  async get(k, opt) {
    this.reads++;
    const v = this.m.get(k);
    if (v === undefined) return null;
    if (opt && opt.type === 'json') { try { return JSON.parse(v.value); } catch (e) { return null; } }
    return v.value;
  }
  async getWithMetadata(k, opt) {
    this.reads++;
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

/* ============================ cache biên giả (như caches.default) =========== */
class FakeCache {
  constructor() { this.store = new Map(); }
  static key(input) { return String((input && input.url) || input); }
  async match(input) { const r = this.store.get(FakeCache.key(input)); return r ? r.clone() : undefined; }
  async put(input, res) { this.store.set(FakeCache.key(input), res.clone ? res.clone() : res); }
  async delete(input) { return this.store.delete(FakeCache.key(input)); }
  async keys() { return [...this.store.keys()].map((u) => ({ url: u })); }
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
  '-out', tmp + '/cert.pem', '-days', '1', '-nodes', '-subj', '/CN=ssochuz-test'], { stdio: 'ignore' });
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
const ADMH = { 'x-admin-key': ADMIN };   /* header quản trị dùng chung cho mọi bài test */
const env = {
  ADMIN_KEY: ADMIN, CZ_KV: kv, BLOG: 'https://chuseoz.blogspot.com', ALLOW_ORIGIN: 'https://web.test',
  SESSION_SECRET: 'session-secret-dai-hon-32-ky-tu-cho-chac', GOOGLE_CLIENT_ID: 'CLIENT_ID_TEST',
  ADMIN_EMAILS: 'admin@example.com',
  FIREBASE_PROJECT: 'ssochuz-library', STATS_FLUSH_MS: '50',   /* bản thật gom 20 giây; test gom 50ms */
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
    eq('health/chỉ báo đã cấu hình admin', r.body && r.body.auth && r.body.auth.adminConfigured, true);
    ck('health/không lộ danh sách email quản trị', !JSON.stringify(r.body || {}).includes('admin@example.com') &&
      !Object.prototype.hasOwnProperty.call((r.body && r.body.auth) || {}, 'adminEmails'), r.body && r.body.auth, 'không có adminEmails');
    const ac = await call('GET', '/api/auth/config');
    ck('auth/config không lộ email quản trị', !JSON.stringify(ac.body || {}).includes('admin@example.com') &&
      !Object.prototype.hasOwnProperty.call(ac.body || {}, 'adminEmails'), ac.body, 'chỉ có adminConfigured');
    /* HỒI QUY: /api/health BẮT BUỘC kèm header CORS. Thiếu nó thì admin.js gọi từ
       domain khác bị trình duyệt chặn (dù status 200) và báo nhầm "Failed to fetch —
       Worker chưa deploy". Đây chính là lỗi đã gặp trên ssochuz.pages.dev. */
    eq('health/có Access-Control-Allow-Origin', r.headers.get('access-control-allow-origin'), 'https://web.test');
    eq('health/có Vary: Origin', r.headers.get('vary'), 'Origin');
    const rNoKv = await call('GET', '/api/health', { e: Object.assign({}, env, { CZ_KV: undefined }) });
    eq('health/không KV vẫn có CORS', rNoKv.headers.get('access-control-allow-origin'), 'https://web.test');
    const rRoot = await call('GET', '/');
    eq('root "/" cũng có CORS', rRoot.headers.get('access-control-allow-origin'), 'https://web.test');
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
  ck('whoami/đúng khoá → super_admin', ((await call('GET', '/api/whoami', { headers: { 'x-admin-key': ADMIN } })).body || {}).role === 'super_admin',
    ((await call('GET', '/api/whoami', { headers: { 'x-admin-key': ADMIN } })).body || {}).role, 'super_admin');
  eq('whoami/khoá dính khoảng trắng đầu-cuối vẫn dùng được', (await call('GET', '/api/whoami', { headers: { 'x-admin-key': '  ' + ADMIN + '  ' } })).status, 200);

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

    /* Dù admin/client cũ gửi nhầm email hoặc secret-like field vào registry,
       Worker phải xoá trước khi lưu và trước khi trả API công khai. */
    const privateReg = JSON.parse(JSON.stringify(REG));
    privateReg.settings = Object.assign({}, privateReg.settings, {
      auth: {
        provider: 'supabase', supabaseUrl: 'https://public.supabase.co', supabaseAnonKey: 'sb_publishable_test',
        googleClientId: 'public-client-id', adminEmails: ['admin@example.com'], serviceRoleKey: 'sb_secret_never-public'
      },
      report: { email: 'admin@example.com', form: 'https://forms.example.com/survey' }
    });
    await call('PUT', '/api/registry', { headers: ADMH, body: privateReg });
    const pubReg = await call('GET', '/api/registry');
    ck('registry/API không lộ email hoặc secret', !JSON.stringify(pubReg.body || {}).includes('admin@example.com') &&
      !JSON.stringify(pubReg.body || {}).includes('sb_secret_never-public'), pubReg.body && pubReg.body.settings, 'đã lọc');
    const rawReg = await kv.get('registry', { type: 'json' });
    ck('registry/KV không lưu email quản trị', !JSON.stringify(rawReg || {}).includes('admin@example.com') &&
      !JSON.stringify(rawReg || {}).includes('sb_secret_never-public'), rawReg && rawReg.settings, 'đã lọc trước khi lưu');
    eq('registry/vẫn giữ publishable key công khai', rawReg.settings.auth.supabaseAnonKey, 'sb_publishable_test');
    const servicePayload = b64u(JSON.stringify({ role: 'service_role' }));
    privateReg.settings.auth.supabaseAnonKey = b64u('{}') + '.' + servicePayload + '.signature';
    await call('PUT', '/api/registry', { headers: ADMH, body: privateReg });
    const noService = await kv.get('registry', { type: 'json' });
    ck('registry/chặn JWT service_role dán nhầm ô anon', !(noService.settings.auth || {}).supabaseAnonKey,
      noService.settings.auth, 'không lưu service_role');
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

    /* đặt tên theo parser dùng chung + chương chỉ-ảnh không bị từ chối */
    const page = (title, inner) => '<html><head><title>' + title + ' | chuseoz</title></head><body><div class="post-body entry-content">' + inner + '</div></body></html>';
    const LONG_TXT = '<p>Nội dung chương đủ dài để worker nhận là nội dung đọc được, không bị coi là trống trơn.</p>';
    /* 1. “Lờí mở đầu” (dài chữ) → giữ nguyên tên, KHÔNG ép “Chương N:” */
    routes = (u) => u.includes('bai-prologue.html') ? { status: 200, body: page('Lờ' + 'i mở đầu', LONG_TXT) } : null;
    const rp = await call('POST', '/api/import', { headers: ADMH, body: { slug: 'lunar-secret', url: 'https://chuseoz.blogspot.com/p/bai-prologue.html' } });
    ck('import/Lờí mở đầu giữ nguyên tên', rp.body && rp.body.ok === true && /^Lờ/.test(rp.body.added || '') && !/^Chương/.test(rp.body.added || ''), rp.body && rp.body.added, 'Lờí mở đầu');
    /* 2. “Giới thiệu nhân vật” → giữ nguyên tên */
    routes = (u) => u.includes('bai-gtnv.html') ? { status: 200, body: page('Giới thiệu nhân vật', LONG_TXT) } : null;
    const rg = await call('POST', '/api/import', { headers: ADMH, body: { slug: 'lunar-secret', url: 'https://chuseoz.blogspot.com/p/bai-gtnv.html' } });
    ck('import/GTNV giữ nguyên tên', rg.body && rg.body.ok === true && /^Giới thiệu/.test(rg.body.added || ''), rg.body && rg.body.added, 'Giới thiệu nhân vật');
    /* 3. bài chỉ có ẢNH (truyện tranh) → NHẬN được, không còn 422 */
    routes = (u) => u.includes('bai-comic.html') ? { status: 200, body: page('Chương 1: Khởi đầu', '<p><img src="https://img.test/1.jpg"><img src="https://img.test/2.jpg"></p>') } : null;
    const rc = await call('POST', '/api/import', { headers: ADMH, body: { slug: 'lunar-secret', url: 'https://chuseoz.blogspot.com/p/bai-comic.html' } });
    ck('import/chương chỉ-ảnh được nhận', rc.body && rc.body.ok === true, (rc.status + ' ' + ((rc.body && rc.body.error) || '')).slice(0, 120), 'ok 200');
    ck('import/chỉ-ảnh KHÔNG 422', rc.status !== 422, rc.status, '≠ 422');
    /* 4. bài thường chữ → gắn “Chương <số chính kế tiếp>:” (đếm qua các chương chính, bỏ mở đầu) */
    routes = (u) => u.includes('bai-normal.html') ? { status: 200, body: page('Bí mật đêm khuya', LONG_TXT) } : null;
    const rn = await call('POST', '/api/import', { headers: ADMH, body: { slug: 'lunar-secret', url: 'https://chuseoz.blogspot.com/p/bai-normal.html' } });
    const bm = await kv.get('book:lunar-secret', { type: 'json' });
    const mains = bm.chapters.filter((c) => /^Chương \d+/.test(c.t || ''));
    ck('import/bài thường → “Chương N:”', rn.body && rn.body.ok === true && /^Chương \d+: Bí mật/.test(rn.body.added || ''), rn.body && rn.body.added, 'Chương N: Bí mật…');
    /* 5. “Ngoại truyện” → giữ nguyên (không ép Chương N) */
    routes = (u) => u.includes('bai-ngoaitruyen.html') ? { status: 200, body: page('Ngoại truyện: Ngày tết', LONG_TXT) } : null;
    const rx = await call('POST', '/api/import', { headers: ADMH, body: { slug: 'lunar-secret', url: 'https://chuseoz.blogspot.com/p/bai-ngoaitruyen.html' } });
    ck('import/ngoại truyện giữ nguyên tên', rx.body && rx.body.ok === true && /^Ngoại truyện/.test(rx.body.added || ''), rx.body && rx.body.added, 'Ngoại truyện: Ngày tết');
    routes = () => null;
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

  /* ---------- 7b. đăng nhập Supabase: 401 PHẢI kèm lý do thật để web bắt bệnh ---------- */
  {
    const envSB = Object.assign({}, env, { SUPABASE_URL: 'https://sb.test' });
    routes = (u) => u.includes('/auth/v1/.well-known/jwks.json')
      ? { status: 200, body: { keys: [{ kty: 'RSA', kid: 'kid-test', n: NE.n, e: NE.e }] } } : null;
    const sbTok = (over) => {
      const now = Math.floor(Date.now() / 1000);
      const p = Object.assign({
        iss: 'https://sb.test/auth/v1', aud: 'authenticated', sub: 'sb-user-1',
        email: 'docgia@gmail.com', email_verified: true, iat: now, exp: now + 3600,
      }, over);
      const h = { alg: 'RS256', kid: 'kid-test', typ: 'JWT' };
      const data = b64u(JSON.stringify(h)) + '.' + b64u(JSON.stringify(p));
      return data + '.' + b64u(crypto.sign('RSA-SHA256', Buffer.from(data), KEY_PEM));
    };
    /* token hợp lệ → đổi được session của Worker */
    {
      const r = await call('POST', '/api/auth/supabase', { e: envSB, body: { accessToken: sbTok({}) } });
      ck('supabase/token đúng → có session', !!(r.body && r.body.ok === true && r.body.token), r.body && r.body.error, 'ok + token');
      /* token Supabase thô cũng phải dùng thẳng được ở endpoint cần Bearer */
      const raw = await call('POST', '/api/comments/lunar-secret', { e: envSB, headers: { authorization: 'Bearer ' + sbTok({}) }, body: { text: 'đọc bằng token thô', ch: 9 } });
      ck('comments/token Supabase thô → đăng được', !!(raw.body && raw.body.ok === true), raw.body && raw.body.error, 'ok');
      await call('DELETE', '/api/comments/lunar-secret/' + ((raw.body && raw.body.comment && raw.body.comment.id) || 'x'), { e: envSB, headers: { authorization: 'Bearer ' + sbTok({}) } });
    }
    /* sai issuer (Worker đặt SUPABASE_URL nhầm project) → 401 phải chỉ rõ cả 2 URL */
    {
      const r = await call('POST', '/api/auth/supabase', { e: envSB, body: { accessToken: sbTok({ iss: 'https://project-khac.supabase.co/auth/v1' }) } });
      eq('supabase/sai issuer → 401', r.status, 401);
      ck('supabase/401 nêu issuer thật của token', /project-khac\.supabase\.co/.test((r.body && r.body.error) || ''), r.body && r.body.error, 'có URL trong error');
      eq('supabase/401 kèm SUPABASE_URL đang cấu hình', r.body && r.body.supabaseUrl, 'https://sb.test');
    }
    /* token rác → 401 kèm lý do (không được trả lỗi chung chung) */
    {
      const r = await call('POST', '/api/auth/supabase', { e: envSB, body: { accessToken: 'token-rac' } });
      eq('supabase/token rác → 401', r.status, 401);
      ck('supabase/401 có lý do', /sai định dạng/.test((r.body && r.body.error) || ''), r.body && r.body.error, 'nêu định dạng');
    }
    /* bình luận với Bearer rác → 401 kèm LÝ DO trong body (web hiển thị được bệnh thật,
       không còn báo nhầm "phiên hết hạn") và KHÔNG âm thầm ghi thành khách */
    {
      const r = await call('POST', '/api/comments/lunar-secret', { e: envSB, headers: { authorization: 'Bearer token-rac' }, body: { text: 'thử bình luận', vid: 'may-test' } });
      eq('comments/Bearer rác → 401', r.status, 401);
      ck('comments/401 kèm lý do thật', /sai định dạng/.test((r.body && r.body.error) || ''), r.body && r.body.error, 'có lý do từ Worker');
    }
    routes = () => null;
  }

  /* ---------- 7c. Supabase ES256 + GHIM PROJECT từ KV (bản 1.9.8) ----------
     Project dùng khoá public mới (`sb_publishable_…`) → access_token ký bằng
     cặp khoá bất đối xứng ES256, JWKS nằm ở /auth/v1/.well-known/jwks.json.
     Worker KHÔNG có biến SUPABASE_URL thì phải đọc ghim từ
     registry.settings.auth.supabaseUrl (quản trị Lưu ở /admin) — sửa ghim
     không cần deploy lại Worker. Không ghim gì cả → 500 kèm hướng dẫn rõ. */
  {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pubJwk = publicKey.export({ format: 'jwk' });
    /* chữ ký ECDSA của Node là DER; JWT ES256 dùng raw r||s (32+32 byte) */
    const derToRaw = (sig) => {
      let o = 2;
      if (sig[1] & 0x80) o += sig[1] & 0x7f;
      const rLen = sig[o + 1], r = sig.slice(o + 2, o + 2 + rLen);
      const sLen = sig[o + 2 + rLen + 1], s = sig.slice(o + 2 + rLen + 2);
      const pad = (b) => (b.length >= 32 ? b.slice(-32) : Buffer.concat([Buffer.alloc(32 - b.length), b]));
      return Buffer.concat([pad(r), pad(s)]);
    };
    const esTok = (over = {}, issBase = 'https://sbpin.supabase.co') => {
      const now = Math.floor(Date.now() / 1000);
      const p = Object.assign({
        iss: issBase + '/auth/v1', aud: 'authenticated', sub: 'sb-es-user',
        email: 'docgia.es@gmail.com', email_verified: true, iat: now, exp: now + 3600,
      }, over);
      const h = { alg: 'ES256', kid: 'ec-kid', typ: 'JWT' };
      const data = b64u(JSON.stringify(h)) + '.' + b64u(JSON.stringify(p));
      return data + '.' + b64u(derToRaw(crypto.sign('sha256', Buffer.from(data), privateKey)));
    };
    const serveEsJwks = () => {
      routes = (u) => u.includes('/auth/v1/.well-known/jwks.json')
        ? { status: 200, body: { keys: [{ kty: 'EC', crv: 'P-256', kid: 'ec-kid', use: 'sig', alg: 'ES256', x: pubJwk.x, y: pubJwk.y }] } } : null;
    };

    /* (1) chưa ghim project ở đâu cả → 500 kèm HƯỚNG DẪN đặt ghim
       (xoá ghim do phần test registry phía trên lưu trước) */
    {
      const before = (await call('GET', '/api/registry')).body;
      const clean = JSON.parse(JSON.stringify(before));
      clean.settings = clean.settings || {};
      clean.settings.auth = { provider: 'supabase' };
      await call('PUT', '/api/registry', { headers: ADMH, body: clean });
      const r = await call('POST', '/api/auth/supabase', { e: env, body: { accessToken: esTok({}) } });
      eq('supabase-ES256/chưa ghim project → 500', r.status, 500);
      ck('supabase-ES256/500 hướng dẫn cách ghim', /ghim project Supabase/.test((r.body && r.body.error) || '') && /Cài đặt & đồng bộ|SUPABASE_URL/.test(((r.body && r.body.hint) || '') + ((r.body && r.body.error) || '')), r.body, 'nêu đủ 2 cách');
    }
    /* (2) quản trị Lưu Project URL vào registry (đúng việc /admin làm) → ghim từ KV */
    {
      const cur = (await call('GET', '/api/registry')).body;
      const reg = JSON.parse(JSON.stringify(cur));
      reg.settings = reg.settings || {};
      reg.settings.auth = { provider: 'supabase', supabaseUrl: 'https://sbpin.supabase.co', supabaseAnonKey: 'sb_publishable_test' };
      const put = await call('PUT', '/api/registry', { headers: ADMH, body: reg });
      eq('supabase-ES256/Lưu registry có ghim → ok', put.status, 200);
      const h = await call('GET', '/api/health');
      eq('supabase-ES256/health nhận ghim từ KV', h.body && h.body.auth && h.body.auth.supabase, true);
      eq('supabase-ES256/health ghi rõ nguồn ghim KV', h.body && h.body.auth && h.body.auth.supabaseKv, true);
      eq('supabase-ES256/health trả URL ghim', h.body && h.body.auth && h.body.auth.supabaseUrl, 'https://sbpin.supabase.co');
    }
    /* (3) token ES256 đúng → verify bằng JWKS của project đã ghim, có session */
    {
      serveEsJwks();
      const r = await call('POST', '/api/auth/supabase', { e: env, body: { accessToken: esTok({}) } });
      ck('supabase-ES256/verify ES256 qua ghim KV → session', !!(r.body && r.body.ok === true && r.body.token), r.body && r.body.error, 'ok + token');
      /* token ES256 thô cũng phải qua được userFromReq ở endpoint cần Bearer */
      const cmt = await call('POST', '/api/comments/lunar-secret', { e: env, headers: { authorization: 'Bearer ' + esTok({}) }, body: { text: 'bình luận bằng token ES256', vid: 'may-es' } });
      ck('supabase-ES256/endpoint Bearer nhận token thô', !!(cmt.body && cmt.body.ok === true), cmt.body && cmt.body.error, 'ok');
      await call('DELETE', '/api/comments/lunar-secret/' + ((cmt.body && cmt.body.comment && cmt.body.comment.id) || 'x'), { e: env, headers: { authorization: 'Bearer ' + esTok({}) } });
      /* token do project KHÁC cấp → chặn, lỗi nêu cả hai URL */
      const bad = await call('POST', '/api/auth/supabase', { e: env, body: { accessToken: esTok({ iss: 'https://project-khac.supabase.co/auth/v1' }) } });
      eq('supabase-ES256/token project khác → 401', bad.status, 401);
      ck('supabase-ES256/401 nêu cả project thật lẫn project của token', /project-khac\.supabase\.co/.test((bad.body && bad.body.error) || '') && /sbpin\.supabase\.co/.test((bad.body && bad.body.error) || ''), bad.body && bad.body.error, '2 URL trong error');
      /* chữ ký hỏng phải bị chặn (đảm bảo verify thật, không bỏ qua) */
      const junk = await call('POST', '/api/auth/supabase', { e: env, body: { accessToken: esTok({}).slice(0, -4) + 'AAAA' } });
      eq('supabase-ES256/chữ ký sai → 401', junk.status, 401);
      routes = () => null;
    }
    /* (4) quản trị xoá ghim → Worker lại từ chối rõ ràng (không kẹt cache 60s) */
    {
      const cur = (await call('GET', '/api/registry')).body;
      const reg = JSON.parse(JSON.stringify(cur));
      reg.settings.auth = { provider: 'supabase' };
      await call('PUT', '/api/registry', { headers: ADMH, body: reg });
      const h = await call('GET', '/api/health');
      eq('supabase-ES256/xoá ghim → health mất ghim ngay', h.body && h.body.auth && h.body.auth.supabase, false);
    }
  }

  /* ---------- 8. session + bình luận ---------- */
  {
    eq('auth/me/thiếu token → 401', (await call('GET', '/api/auth/me')).status, 401);
    const me = await call('GET', '/api/auth/me', { headers: { authorization: 'Bearer ' + TOKEN } });
    eq('auth/me/có token → email', me.body && me.body.user && me.body.user.email, 'docgia@gmail.com');
    /* khách chưa đăng nhập vẫn bình luận được, nhưng phải kèm mã máy (vid) */
    eq('comments/khách thiếu vid → 400', (await call('POST', '/api/comments/lunar-secret', { body: { text: 'hay' } })).status, 400);
    eq('comments/khách thiếu nội dung → 400', (await call('POST', '/api/comments/khach-thu', { body: { text: '  ', vid: 'may-khach' } })).status, 400);
    {
      const g1 = await call('POST', '/api/comments/khach-thu', { body: { text: 'khách bình luận', vid: 'may-khach', name: 'Khách Ẩn Danh' } });
      ck('comments/khách đăng được', !!(g1.body && g1.body.ok === true && g1.body.guest === true), g1.body && g1.body.error, 'ok + guest:true');
      const glist = ((await call('GET', '/api/comments/khach-thu')).body || {}).comments || [];
      eq('comments/khách có nhãn guest', glist[0] && glist[0].guest, true);
      eq('comments/khách giữ tên đã nhập', glist[0] && glist[0].name, 'Khách Ẩn Danh');
      eq('comments/khách uid là mã ẩn danh', String(glist[0] && glist[0].uid).slice(0, 2), 'g:');
      /* khách bị chặn spam chặt hơn tài khoản: 2 bình luận/chương/10 phút */
      const gcodes = [];
      for (let i = 0; i < 4; i++) gcodes.push((await call('POST', '/api/comments/khach-thu', { body: { text: 'spam khách ' + i, vid: 'may-khach' } })).status);
      ck('comments/chặn spam khách (có 429)', gcodes.includes(429), gcodes, 'có 429');
      /* khách không có phiên → không xoá được bình luận */
      const gid = glist[0] && glist[0].id;
      eq('comments/khách xoá → 401', (await call('DELETE', '/api/comments/khach-thu/' + gid)).status, 401);
      /* quản trị (ADMIN_KEY) xoá được bình luận khách */
      eq('comments/admin-key xoá bình luận khách → 200',
        (await call('DELETE', '/api/comments/khach-thu/' + gid, { headers: { 'x-admin-key': env.ADMIN_KEY } })).status, 200);
    }
    const auth = { authorization: 'Bearer ' + TOKEN };
    const p1 = await call('POST', '/api/comments/lunar-secret', { headers: auth, body: { text: 'Chương này hay quá!' } });
    const CID = (p1.body && p1.body.comment && p1.body.comment.id) || '';
    ck('comments/đăng được', !!(p1.body && p1.body.ok === true && CID), p1.body && p1.body.error, 'có comment.id');
    const pReply = await call('POST', '/api/comments/lunar-secret', { headers: auth, body: { text: 'Mình cũng nghĩ vậy!', parentId: CID } });
    const RID = (pReply.body && pReply.body.comment && pReply.body.comment.id) || '';
    ck('comments/trả lời được bình luận khác', !!(pReply.body && pReply.body.ok && pReply.body.reply && RID), pReply.body && pReply.body.error, 'reply:true + id');
    eq('comments/reply giữ parentId', pReply.body && pReply.body.comment && pReply.body.comment.parentId, CID);
    const threaded = ((await call('GET', '/api/comments/lunar-secret')).body || {}).comments || [];
    ck('comments/đọc lại có quan hệ cha-con', threaded.some((c) => c.id === RID && c.parentId === CID), threaded, 'reply.parentId = CID');
    eq('comments/reply parent không tồn tại → 400', (await call('POST', '/api/comments/lunar-secret', { headers: auth, body: { text: 'reply mồ côi', parentId: 'khong-co' } })).status, 400);
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
    /* phiếu đặt lúc ẩn danh vẫn gỡ được sau khi đăng nhập (gửi kèm vid) — hết bệnh "bỏ thích mà số không giảm" */
    const un = await call('POST', '/api/vote', { headers: auth, body: { slug: 'lunar-secret', vote: 0, vid: 'khach-1' } });
    eq('vote/đăng nhập gỡ được phiếu ẩn danh → 0', un.body && un.body.votes, 0);
    await call('POST', '/api/vote', { body: { slug: 'lunar-secret', vote: 1, vid: 'khach-2' } });  /* để 1 phiếu cho mục seed bên dưới */
    const s = await call('GET', '/api/stats');
    eq('stats/đọc lại số phiếu', ((s.body.items || {})['lunar-secret'] || {}).votes, 1);
    /* từ 1.9.5: stats lưu ở biên 60 giây (tiết kiệm lượt đọc KV), trình duyệt luôn
       hỏi lại (max-age=0) nên vẫn thấy số mới sau mỗi lần ghi nhờ purge */
    ck('stats/header cache s-maxage=60 + max-age=0', String((s.headers || {}).get ? s.headers.get('cache-control') : '') === 'public, max-age=0, s-maxage=60',
      (s.headers || {}).get ? s.headers.get('cache-control') : '', 'public, max-age=0, s-maxage=60');
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

  /* ---------- 9b. QUẢN TRỊ PHIẾU BẦU: gỡ phiếu từng người + reset ---------- */
  {
    const authH = { authorization: 'Bearer ' + TOKEN };
    /* bầu thêm: 1 tài khoản (phiếu bộ + phiếu chương 3), 2 khách (chương 3 và 4) */
    await call('POST', '/api/vote', { headers: authH, body: { slug: 'lunar-secret', vote: 1, vid: 'may-q1' } });
    await call('POST', '/api/vote', { headers: authH, body: { slug: 'lunar-secret', vote: 1, vid: 'may-q1', ch: 3 } });
    await call('POST', '/api/vote', { body: { slug: 'lunar-secret', vote: 1, vid: 'khach-q3', ch: 3 } });
    await call('POST', '/api/vote', { body: { slug: 'lunar-secret', vote: 1, vid: 'khach-q4', ch: 4 } });
    const before = (await call('GET', '/api/stats')).body.items['lunar-secret'];

    eq('voters/thiếu khoá quản trị → 401',
      (await call('GET', '/api/admin/voters?slug=lunar-secret')).status, 401);
    eq('voters/thiếu slug → 400', (await call('GET', '/api/admin/voters', { headers: ADMH })).status, 400);
    const v = await call('GET', '/api/admin/voters?slug=lunar-secret', { headers: ADMH });
    const vb = (v.body && v.body.book) || { count: 0, voters: [] };
    const vc = (v.body && v.body.chapters) || {};
    ck('voters/liệt kê được phiếu cả bộ', vb.count >= 2, vb.count, '>= 2');
    eq('voters/phiếu chương 3 có 2 người', (vc['3'] || {}).count, 2);
    eq('voters/phiếu chương 4 có 1 người', (vc['4'] || {}).count, 1);
    ck('voters/có nhãn loại người bầu (tài khoản / thiết bị)',
      ((vc['3'] || {}).voters || []).every((x) => !!x.kindLabel && !!x.key),
      ((vc['3'] || {}).voters || []).map((x) => x.kindLabel), 'mỗi dòng có kindLabel');
    ck('voters/khoá phiếu chương có hậu tố #3',
      ((vc['3'] || {}).voters || []).every((x) => String(x.key).endsWith('#3')),
      ((vc['3'] || {}).voters || []).map((x) => x.key), 'khoá kết thúc bằng #3');

    /* gỡ 1 phiếu chương 3 */
    const one = ((vc['3'] || {}).voters || [])[0] || {};
    eq('vote-remove/khoá sai chương → 400',
      (await call('POST', '/api/admin/vote-remove', { headers: { 'x-admin-key': ADMIN }, body: { slug: 'lunar-secret', ch: 4, keys: [one.key] } })).status, 400);
    eq('vote-remove/thiếu khoá quản trị → 401',
      (await call('POST', '/api/admin/vote-remove', { body: { slug: 'lunar-secret', ch: 3, keys: [one.key] } })).status, 401);
    const rm = await call('POST', '/api/admin/vote-remove', { headers: { 'x-admin-key': ADMIN }, body: { slug: 'lunar-secret', ch: 3, keys: [one.key] } });
    eq('vote-remove/gỡ đúng 1 phiếu', (rm.body || {}).removed, 1);
    eq('vote-remove/tổng phiếu giảm 1', (rm.body || {}).total, before.votes - 1);
    const v2 = await call('GET', '/api/admin/voters?slug=lunar-secret', { headers: ADMH });
    eq('vote-remove/chương 3 còn 1 người', ((((v2.body || {}).chapters || {})['3'] || {}).count), 1);

    /* reset phiếu của MỘT bộ: về 0, xoá cả phiếu chương, GIỮ lượt đọc */
    const rs = await call('POST', '/api/admin/votes/reset', { headers: { 'x-admin-key': ADMIN }, body: { slug: 'lunar-secret' } });
    eq('reset/báo ok', (rs.body || {}).ok, true);
    const after = (await call('GET', '/api/stats')).body.items['lunar-secret'];
    eq('reset/phiếu về 0', after.votes, 0);
    eq('reset/xoá phiếu từng chương', Object.keys(after.chapVotes || {}).length, 0);
    eq('reset/GIỮ lượt đọc', after.views, before.views);
    const v3 = await call('GET', '/api/admin/voters?slug=lunar-secret', { headers: ADMH });
    eq('reset/không còn người bầu nào', (((v3.body || {}).voters) || 0), 0);

    /* reset toàn bộ (không gửi slug) — mọi bộ về 0 */
    await call('POST', '/api/vote', { body: { slug: 'third-person', vote: 1, vid: 'khach-z' } });
    const rAll = await call('POST', '/api/admin/votes/reset', { headers: { 'x-admin-key': ADMIN }, body: {} });
    ck('reset toàn bộ/báo ok + có số bộ', !!(rAll.body && rAll.body.ok), rAll.body && rAll.body.error, 'ok');
    const st2 = (await call('GET', '/api/stats')).body.items;
    eq('reset toàn bộ/third-person về 0', (st2['third-person'] || {}).votes, 0);
    eq('reset toàn bộ/thiếu khoá → 401', (await call('POST', '/api/admin/votes/reset', { body: {} })).status, 401);
  }

  /* ---------- 9b2. ĐÁNH GIÁ SAO (N11) — tách khỏi bình chọn cũ ---------- */
  {
    const auth = { authorization: 'Bearer ' + TOKEN };
    const r1 = await call('POST', '/api/rate', { headers: auth, body: { slug: 'lunar-secret', rating: 4 } });
    eq('rating/lần đầu 4 sao', [r1.status, r1.body && r1.body.rating, r1.body && r1.body.ratingCount], [200, 4, 1]);
    /* cùng người gửi lại → SỬA điểm, số lượt vẫn 1 */
    const r2 = await call('POST', '/api/rate', { headers: auth, body: { slug: 'lunar-secret', rating: 5 } });
    eq('rating/sửa điểm không tăng lượt', [r2.body && r2.body.rating, r2.body && r2.body.ratingCount, r2.body && r2.body.ratingAvg], [5, 1, 5]);
    /* người thứ 2 (khách) 3 sao → trung bình (5+3)/2 = 4 */
    const r3 = await call('POST', '/api/rate', { body: { slug: 'lunar-secret', rating: 3, vid: 'khach-rate-1' } });
    eq('rating/người thứ 2', [r3.body && r3.body.ratingCount, r3.body && r3.body.ratingAvg], [2, 4]);
    /* /api/stats kèm sẵn trung bình + số lượt (không cần request riêng) */
    const s = await call('GET', '/api/stats');
    const it = (s.body.items || {})['lunar-secret'] || {};
    eq('rating/stats có trung bình + lượt', [it.rating, it.ratingCount], [4, 2]);
    /* gỡ điểm → số lượt giảm, trung bình còn lại của khách */
    const r4 = await call('POST', '/api/rate', { headers: auth, body: { slug: 'lunar-secret', rating: 0 } });
    eq('rating/gỡ điểm ok', [r4.body && r4.body.rating, r4.body && r4.body.ratingCount], [0, 1]);
    /* dữ liệu nằm trong key riêng rate:/rateagg — không đụng key vote cũ.
       Tổng đánh giá của MỌI bộ nằm trong MỘT khoá `rateagg` (bản 1.15.0): nhờ
       vậy /api/stats không phải LIST + đọc từng bộ mỗi lần trượt cache biên
       (LIST chỉ có 1.000 lượt/ngày ở gói miễn phí). */
    const aggRaw = kv.m.get('rateagg');
    const aggBlob = aggRaw ? JSON.parse(aggRaw.value) : null;
    eq('rating/gộp tổng vào 1 khoá rateagg',
      !!(aggBlob && aggBlob.a && aggBlob.a['lunar-secret'] && aggBlob.a['lunar-secret'].n === 1), true);
    eq('rating/không còn khoá rateagg:<slug> riêng lẻ', [...kv.m.keys()].some((k) => k.startsWith('rateagg:')), false);
    eq('rating/có key rate:<slug>:<uid>', [...kv.m.keys()].filter((k) => k.startsWith('rate:')).length >= 1, true);
    /* điểm lạ → 400 */
    eq('rating/6 sao → 400', (await call('POST', '/api/rate', { body: { slug: 'lunar-secret', rating: 6, vid: 'x' } })).status, 400);
    eq('rating/0.5 sao → 400', (await call('POST', '/api/rate', { body: { slug: 'lunar-secret', rating: 3.5, vid: 'x' } })).status, 400);
    eq('rating/thiếu slug → 400', (await call('POST', '/api/rate', { body: { rating: 3, vid: 'x' } })).status, 400);
  }

  /* ---------- 9c. BÁO LỖI CHỮ: gửi thẳng tới ban biên tập ---------- */
  {
    /* chưa đặt RESEND_API_KEY → vẫn nhận báo lỗi, chỉ là chưa gửi được email */
    const r1 = await call('POST', '/api/report', { body: { slug: 'lunar-secret', title: 'Lunar Secret', ch: 7, url: 'https://web.test/truyen/lunar-secret/#chuong-7', text: 'Chương 7 sai chính tả chỗ “cô ấy” thành “cô áy”.', vid: 'may-bao-loi' } });
    eq('báo lỗi/nhận được → ok', (r1.body || {}).ok, true);
    eq('báo lỗi/chưa cấu hình mail → mailed:false', (r1.body || {}).mailed, false);
    ck('báo lỗi/nói rõ lý do chưa gửi mail', String((r1.body || {}).note || '').length > 0 &&
      !JSON.stringify(r1.body || {}).includes('admin@example.com'), (r1.body || {}).note, 'có lý do nhưng không lộ email');
    const rep = await call('GET', '/api/admin/reports', { headers: ADMH });
    eq('báo lỗi/lưu vào KV', (((rep.body || {}).items || [])[0] || {}).slug, 'lunar-secret');
    eq('báo lỗi/giữ số chương', (((rep.body || {}).items || [])[0] || {}).ch, 7);
    ck('báo lỗi/có link kèm theo', /#chuong-7/.test(String((((rep.body || {}).items || [])[0] || {}).url)), (((rep.body || {}).items || [])[0] || {}).url, 'có #chuong-7');
    const lg = await call('GET', '/api/admin/log', { headers: ADMH });
    ck('báo lỗi/có ghi nhật ký', ((lg.body || {}).items || []).some((x) => /báo lỗi mới/.test(x.text)), (lg.body || {}).items && (lg.body.items[0] || {}).text, 'có dòng báo lỗi');
    /* nội dung quá ngắn thì từ chối */
    eq('báo lỗi/quá ngắn → 400', (await call('POST', '/api/report', { body: { slug: 'lunar-secret', text: 'x' } })).status, 400);

    /* PATCH báo lỗi: đánh dấu đã xử lý / mở lại (tính năng admin v2 mới) */
    const rep2 = await call('GET', '/api/admin/reports', { headers: ADMH });
    const first = ((rep2.body || {}).items || []).find((x) => /cô áy/.test(x.text));
    ck('báo lỗi/mỗi báo lỗi có id ổn định', !!first && !!first.id, first && first.id, 'có id');
    ck('báo lỗi/trả số chưa xử lý (open)', typeof (rep2.body || {}).open === 'number', (rep2.body || {}).open, 'open');
    const openBefore = (rep2.body || {}).open;
    const p1 = await call('PATCH', '/api/admin/reports', { headers: ADMH, body: { id: first.id, done: true } });
    eq('báo lỗi/PATCH đánh dấu xử lý → ok', (p1.body || {}).ok, true);
    eq('báo lỗi/PATCH → open giảm 1', (p1.body || {}).open, openBefore - 1);
    const rep3 = await call('GET', '/api/admin/reports', { headers: ADMH });
    eq('báo lỗi/sau PATCH → done:true', (((rep3.body || {}).items || []).find((x) => x.id === first.id) || {}).done, true);
    const p2 = await call('PATCH', '/api/admin/reports', { headers: ADMH, body: { id: first.id, done: false } });
    eq('báo lỗi/PATCH mở lại → open tăng', (p2.body || {}).open, openBefore);
    eq('báo lỗi/PATCH id lạ → 404', (await call('PATCH', '/api/admin/reports', { headers: ADMH, body: { id: 'khong-ton-tai', done: true } })).status, 404);
    eq('báo lỗi/PATCH thiếu id → 400', (await call('PATCH', '/api/admin/reports', { headers: ADMH, body: {} })).status, 400);
    eq('báo lỗi/PATCH không khoá → 401', (await call('PATCH', '/api/admin/reports', { body: { id: first.id, done: true } })).status, 401);

    /* /api/admin/kv trả quota thật: writesToday + lastReset + quotaSupported */
    const kv = await call('GET', '/api/admin/kv', { headers: ADMH });
    ck('kv audit/trả writesToday', typeof (kv.body || {}).writesToday === 'number' && (kv.body || {}).writesToday > 0,
      (kv.body || {}).writesToday, 'số nguyên dương (đã có ghi hôm nay)');
    ck('kv audit/trả lastReset (đầu ngày)', /^\d{4}-\d{2}-\d{2}T00:00:00/.test(String((kv.body || {}).lastReset || '')),
      (kv.body || {}).lastReset, 'đầu ngày ISO');
    eq('kv audit/quotaSupported:true', (kv.body || {}).quotaSupported, true);
    /* có cấu hình Resend → gọi api.resend.com; ở đây chặn mạng nên phải KHÔNG ném lỗi ra ngoài */
    const e2 = Object.assign({}, env, { RESEND_API_KEY: 'k-test', MAIL_FROM: 'ssochuz <bao-loi@web.test>' });
    const r2 = await call('POST', '/api/report', { e: e2, body: { slug: 'lunar-secret', title: 'Lunar Secret', ch: 8, text: 'Chương 8 bị lặp cả đoạn cuối.', vid: 'may-bao-loi-2' } });
    eq('báo lỗi/có mail key → vẫn trả ok (không nổ 500)', (r2.body || {}).ok, true);
    eq('báo lỗi/không gửi được thì mailed:false', (r2.body || {}).mailed, false);
    ck('báo lỗi/không gửi được thì nói rõ lý do', String((r2.body || {}).note || '').length > 0, (r2.body || {}).note, 'có lý do');
    /* MAIL_TO: gửi bằng FormSubmit (không cần khoá) — chặn mạng để không gửi thư thật khi chạy test */
    const realFetch = globalThis.fetch;
    let mailCall = null;
    globalThis.fetch = async (url, opt) => {
      mailCall = { url: String(url), body: JSON.parse((opt || {}).body || '{}') };
      return { ok: true, status: 200, json: async () => ({ success: 'true', message: 'Email sent' }) };
    };
    try {
      const r3 = await call('POST', '/api/report', { e: Object.assign({}, env, { MAIL_TO: 'admin@web.test' }), body: { slug: 'third-person', title: 'Third Person', ch: 2, text: 'Chương 2 thiếu dấu chấm cuối đoạn.', vid: 'may-mail-1' } });
      eq('báo lỗi/MAIL_TO gửi được → mailed:true', (r3.body || {}).mailed, true);
      ck('báo lỗi/response công khai không lộ MAIL_TO', !JSON.stringify(r3.body || {}).includes('admin@web.test'), r3.body, 'không có địa chỉ nhận');
      ck('báo lỗi/gọi đúng FormSubmit', /formsubmit\.co\/ajax\/admin%40web\.test/.test(String(mailCall && mailCall.url)), mailCall && mailCall.url, 'formsubmit.co/ajax/admin@web.test');
      ck('báo lỗi/thư có nội dung + link', !!(mailCall && mailCall.body['Nội dung báo lỗi'] && /Third Person/.test(mailCall.body._subject)), mailCall && mailCall.body._subject, 'có tiêu đề');
      /* lần đầu FormSubmit đòi xác nhận → phải nói rõ cho người đọc biết */
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: 'false', message: 'Please confirm your email address to activate the form' }) });
      const r4 = await call('POST', '/api/report', { e: Object.assign({}, env, { MAIL_TO: 'admin@web.test' }), body: { slug: 'third-person', title: 'Third Person', ch: 4, text: 'Chương 4 lặp tên nhân vật.', vid: 'may-mail-2' } });
      ck('báo lỗi/chưa xác nhận → nói rõ cách xác nhận', /Confirm|Activate|xác nhận/i.test(String((r4.body || {}).note)), (r4.body || {}).note, 'hướng dẫn xác nhận');
      ck('báo lỗi/xác nhận cũng không lộ MAIL_TO', !JSON.stringify(r4.body || {}).includes('admin@web.test'), r4.body, 'không có địa chỉ nhận');
      eq('báo lỗi/chưa xác nhận thì mailed:false', (r4.body || {}).mailed, false);
      /* Resend có khoá mà thiếu MAIL_FROM → phải nói rõ thiếu gì */
      const r5 = await call('POST', '/api/report', { e: Object.assign({}, env, { RESEND_API_KEY: 'k-test' }), body: { slug: 'third-person', text: 'Chương 1 sai dấu câu ở đoạn 2.', vid: 'may-mail-3' } });
      ck('báo lỗi/thiếu MAIL_FROM → nói rõ', /MAIL_FROM/.test(String((r5.body || {}).note)), (r5.body || {}).note, 'nhắc MAIL_FROM');
    } finally {
      globalThis.fetch = realFetch;
    }

    /* danh sách báo lỗi cần khoá quản trị */
    eq('báo lỗi/danh sách thiếu khoá → 401', (await call('GET', '/api/admin/reports')).status, 401);
    eq('báo lỗi/lọc theo từ khoá', (((await call('GET', '/api/admin/reports?q=nhân vật', { headers: ADMH })).body || {}).count), 1);
    eq('báo lỗi/lọc từ khoá lạ → 0', (((await call('GET', '/api/admin/reports?q=khong-co-gi', { headers: ADMH })).body || {}).count), 0);

    /* HỒI QUY — bệnh thật mà chủ trang gặp: bản ≤ 1.10.0 trả 200 OK + đúng dữ liệu
       cho /api/admin/reports nhưng QUÊN `cors` → trình duyệt chặn response, tab
       Báo lỗi chỉ báo "Failed to fetch" dù Worker, KV, ADMIN_KEY đều đúng.
       Thiếu `cors` ở MỘT endpoint thì chỉ endpoint đó chết, nên phải test thẳng
       header của từng endpoint chứ không tin "admin kết nối OK là ổn". */
    eq('báo lỗi/admin/reports PHẢI có Access-Control-Allow-Origin', rep.headers.get('access-control-allow-origin'), 'https://web.test');
    eq('báo lỗi/admin/reports PHẢI có Vary: Origin', rep.headers.get('vary'), 'Origin');
    eq('báo lỗi/admin/reports không cho cache biên giữ (danh sách có email người đọc)', rep.headers.get('cache-control'), 'no-store');
    eq('báo lỗi/admin/reports lúc 401 cũng phải có CORS', (await call('GET', '/api/admin/reports')).headers.get('access-control-allow-origin'), 'https://web.test');
    eq('báo lỗi/admin/reports lúc chưa gắn KV cũng có CORS', (await call('GET', '/api/admin/reports', { headers: ADMH, e: Object.assign({}, env, { CZ_KV: undefined }) })).headers.get('access-control-allow-origin'), 'https://web.test');
  }

  /* ---------- 9g. BẢO MẬT (bản vá 1.9.1) ---------- */
  {
    /* CORS: chỉ phản chiếu đúng tên miền trong ALLOW_ORIGIN, đúng ranh giới dấu chấm.
       Lỗi cũ: origin.endsWith("chuseoz.pages.dev") nên "acchuseoz.pages.dev" cũng lọt. */
    const r1 = await call('GET', '/api/health', { headers: { origin: 'https://acchuseoz.pages.dev' } });
    ck('CORS/không phản chiếu tên miền na ná', r1.headers.get('access-control-allow-origin') !== 'https://acchuseoz.pages.dev',
      r1.headers.get('access-control-allow-origin'), 'không phải origin của kẻ lạ');
    const r2 = await call('GET', '/api/health', { headers: { origin: 'https://ac.web.test' } });
    eq('CORS/vẫn cho tên miền con hợp lệ', r2.headers.get('access-control-allow-origin'), 'https://ac.web.test');
    const r3 = await call('GET', '/api/health', { headers: { origin: 'https://web.test' } });
    eq('CORS/không gửi allow-credentials', r3.headers.get('access-control-allow-credentials'), null);

    /* QUÉT MỌI ENDPOINT (kể cả đường lỗi 401/404/500/503): response nào trả về
       trình duyệt cũng PHẢI mang access-control-allow-origin. Một handler quên
       `cors` không để lại dấu hiệu nào ngoài "Failed to fetch" ở đúng một ô của
       trang quản trị — khó soi lắm, nên khoá chặt bằng danh sách dưới đây:
       thêm endpoint mới là thêm một dòng vào đây. */
    const CORS_SWEEP = [
      ['GET', '/api/', 0], ['GET', '/api/health', 0], ['GET', '/api/whoami', 0], ['GET', '/api/whoami', 1],
      ['GET', '/api/registry', 0], ['GET', '/api/schedule', 0], ['GET', '/api/stats', 0], ['GET', '/feed.xml', 0],
      ['GET', '/api/book/lunar-secret', 0], ['GET', '/api/book/khong-tai-day', 0],
      ['GET', '/api/auth/config', 0], ['GET', '/api/auth/me', 0],
      ['GET', '/api/comments/lunar-secret', 0], ['GET', '/api/img/khong-co-anh-nay-nhe', 0],
      ['GET', '/api/admin/reports', 0], ['GET', '/api/admin/reports', 1], ['GET', '/api/admin/comments', 1],
      ['GET', '/api/admin/log', 1], ['GET', '/api/admin/stats', 1], ['GET', '/api/admin/kv', 1],
      ['GET', '/api/admin/voters?slug=lunar-secret', 1], ['GET', '/api/chua-co-endpoint-dau', 0],
      ['POST', '/api/report', 0], ['POST', '/api/lock', 0], ['POST', '/api/vote', 0], ['PUT', '/api/registry', 0],
    ];
    for (const [meth, ep, needKey] of CORS_SWEEP) {
      const rr = await call(meth, ep, { headers: needKey ? ADMH : {}, body: meth === 'GET' ? undefined : {} });
      ck('CORS/quét ' + meth + ' ' + ep, rr.headers.get('access-control-allow-origin') === 'https://web.test',
        rr.headers.get('access-control-allow-origin') + ' (HTTP ' + rr.status + ')', 'https://web.test');
    }

    /* Dò khoá quản trị: 25 lần sai / 10 phút là khoá tạm */
    let last = null;
    for (let i = 0; i < 26; i++) last = await call('GET', '/api/whoami', { headers: { 'x-admin-key': 'sai-khoa-' + i } });
    eq('khoá/sai 26 lần → 429', last.status, 429);
    eq('khoá/vẫn dùng được khoá đúng sau đó', (await call('GET', '/api/whoami', { headers: ADMH })).status, 200);

    /* Link kèm báo lỗi: javascript:/data: phải bị bỏ (trang quản trị in ra nút “Mở”) */
    await call('POST', '/api/report', { body: { slug: 'third-person', title: 'Third Person', ch: 1, text: 'Kiểm tra link độc hại trong báo lỗi.', url: 'javascript:alert(document.cookie)', vid: 'sec-1' } });
    const rp = (await call('GET', '/api/admin/reports', { headers: ADMH })).body || {};
    const row = (rp.items || []).find((x) => /độc hại/.test(String(x.text || ''))) || {};
    eq('báo lỗi/link javascript: bị bỏ', row.url, '');
    await call('POST', '/api/report', { body: { slug: 'third-person', title: 'Third Person', ch: 1, text: 'Link https hợp lệ phải giữ nguyên.', url: 'https://ssochuz.pages.dev/truyen/third-person/', vid: 'sec-2' } });
    const rp2 = (await call('GET', '/api/admin/reports', { headers: ADMH })).body || {};
    const row2 = (rp2.items || []).find((x) => /giữ nguyên/.test(String(x.text || ''))) || {};
    eq('báo lỗi/link https giữ nguyên', row2.url, 'https://ssochuz.pages.dev/truyen/third-person/');
  }

  /* ---------- 9h. HTML nhập từ Blogger: bỏ thuộc tính lạ ---------- */
  {
    const dirty = `<html><head><title>Chương 9: Thử</title></head><body>
      <div class="post-body entry-content">
        <p onclick="alert(1)">Đoạn văn đủ dài để worker nhận là nội dung đọc được, có thuộc tính lạ.</p>
        <p><a href="javascript:alert(2)" onmouseover="alert(3)">bấm thử</a> và <a href="https://vidu.test/x">link thật</a></p>
        <p><img src="javascript:alert(4)" onerror="alert(5)">Ảnh có URL độc hại cũng phải bị bỏ.</p>
        <p>Đoạn thứ ba cho đủ độ dài tối thiểu của bài viết hợp lệ.</p>
      </div></body></html>`;
    routes = (u) => {
      if (/ssochuz-test-blog\.blogspot\.com/.test(u)) return { status: 200, body: dirty };
      return null;
    };
    const r = await call('POST', '/api/import', {
      e: Object.assign({}, env, { BLOG: 'https://ssochuz-test-blog.blogspot.com' }),
      headers: { 'x-admin-key': ADMIN, 'x-import-mode': 'append' },
      body: { slug: 'lunar-secret', url: 'https://ssochuz-test-blog.blogspot.com/2026/01/bai-thu.html' },
    });
    eq('nhập Blogger/thêm được chương', (r.body || {}).ok, true);
    const book = (await call('GET', '/api/book/lunar-secret')).body || {};
    const lastCh = (book.chapters || [])[(book.chapters || []).length - 1] || {};
    ck('nhập Blogger/bỏ onclick, onmouseover', !/onclick|onmouseover/i.test(String(lastCh.html || '')), String(lastCh.html || '').slice(0, 120), 'không còn thuộc tính lạ');
    ck('nhập Blogger/bỏ href và src javascript:', !/javascript:/i.test(String(lastCh.html || '')), String(lastCh.html || '').slice(0, 120), 'không còn javascript:');
    ck('nhập Blogger/giữ link https + rel an toàn', /href="https:\/\/vidu\.test\/x"[^>]*rel="noopener nofollow"/.test(String(lastCh.html || '')), String(lastCh.html || '').slice(-160), 'link thật giữ nguyên');
    routes = () => null;
  }

  /* ---------- 9i. ảnh đại diện bình luận phải là link http(s) ---------- */
  {
    const t = (await call('POST', '/api/auth/google', { body: { credential: idToken() } })).body || {};
    const h = { authorization: 'Bearer ' + t.token };
    await call('POST', '/api/comments/third-person', { headers: h, body: { text: 'Bình luận kèm ảnh bậy.', ch: 1, vid: 'pic-1', picture: 'javascript:alert(1)' } });
    const got = (await call('GET', '/api/comments/third-person')).body || {};
    const c = (got.items || got.comments || []).find((x) => /ảnh bậy/.test(String(x.text || ''))) || {};
    ck('bình luận/ảnh javascript: bị bỏ', !/^javascript:/i.test(String(c.picture || '')),
      c.picture, 'rỗng hoặc link http(s) khác');
  }

  /* ---------- 9j. chặn thổi lượt đọc: đổi mã máy liên tục vẫn bị chặn theo IP ----------
     Trần là 1.800 lượt/6 giờ cho mỗi IP (bản cũ 600 lượt/giờ) — cùng tốc độ chặn
     nhưng mỗi IP chỉ tốn 1 lượt GHI KV cho cả buổi, tiết kiệm hạn mức. */
  {
    let counted = 0, refused = 0;
    for (let i = 0; i < 1850; i++) {
      const r = await call('POST', '/api/view', { body: { slug: 'third-person', vid: 'may-' + i } });
      if ((r.body || {}).counted) counted++; else refused++;
    }
    ck('lượt đọc/có trần theo IP', counted <= 1801 && refused > 0, { counted, refused }, 'counted ≤ 1801 và có lần bị từ chối');
  }

  /* ---------- 10. lặt vặt ---------- */
  eq('404/đường dẫn lạ', (await call('GET', '/api/khong-co')).status, 404);
  eq('500/không KV mà đọc registry', (await call('GET', '/api/registry', { e: Object.assign({}, env, { CZ_KV: undefined }) })).status, 503);

  /* ---------- 11. CACHE BIÊN: đọc nhiều, KV chỉ tốn 1 lần ---------- */
  {
    const realCaches = globalThis.caches;
    const fake = new FakeCache();
    globalThis.caches = { default: fake };
    try {
      await call('PUT', '/api/registry', { headers: ADMH, body: { rev: 'cache-t1', lib: [{ title: 'Cache Truyện', slug: 'cache-truyen', chapters: 1 }] } });
      await call('PUT', '/api/book/cache-truyen', { headers: ADMH, body: { title: 'Cache Truyện', slug: 'cache-truyen', chapters: [{ t: 'Chương 1', html: '<p>x</p>' }] } });
      const rd = () => kv.reads;
      /* registry: lần 1 MISS đọc KV đúng 1 lần, lần 2 HIT không chạm KV */
      let r0 = rd();
      const g1 = await call('GET', '/api/registry');
      eq('cache/registry lần 1 MISS + đọc KV 1 lần', [g1.headers.get('x-cz-cache'), rd() - r0], ['MISS', 1]);
      /* 1.16.0: registry để 300 giây (mọi lần ghi đều purge đúng URL) */
      eq('cache/registry header s-maxage=300 (khớp EDGE_TTL.registry)', (g1.headers.get('cache-control') || '').includes('s-maxage=300'), true);
      r0 = rd();
      const g2 = await call('GET', '/api/registry');
      eq('cache/registry lần 2 HIT + không đọc KV', [g2.headers.get('x-cz-cache'), rd() - r0, ((g2.body && g2.body.lib) || []).length], ['HIT', 0, 1]);
      /* trúng cache mà origin khác vẫn nhận đúng CORS của mình (không nhận nhầm) */
      const g3 = await call('GET', '/api/registry', { headers: { origin: 'https://app.web.test' } });
      eq('cache/HIT đắp CORS mới theo origin', [g3.headers.get('x-cz-cache'), g3.headers.get('access-control-allow-origin')], ['HIT', 'https://app.web.test']);
      /* quá hạn dùng → MISS và đọc lại KV */
      const gk = 'https://cms.test/api/registry';
      const stored = await fake.match(gk);
      const gh = new Headers(stored.headers);
      gh.set('x-cz-cached-at', String(Date.now() - 400000));
      fake.store.set(gk, new Response(await stored.text(), { status: 200, headers: gh }));
      r0 = rd();
      const g4 = await call('GET', '/api/registry');
      eq('cache/registry quá hạn → MISS + đọc lại KV', [g4.headers.get('x-cz-cache'), rd() - r0], ['MISS', 1]);
      /* 1.16.0 — CHUẨN HOÁ KHOÁ CACHE (src/shared/cache-key.js):
         link chia sẻ kèm ?fbclid=/?utm_source=/?_=… nay dùng CHUNG bản lưu với
         URL sạch. Bản cũ mỗi lượt mở từ Facebook là một lượt đọc KV cả bộ. */
      r0 = rd();
      const g5 = await call('GET', '/api/registry?_=' + Date.now() + '&fbclid=xyz&utm_source=facebook');
      eq('cache/query rác → HIT chung bản lưu, KHÔNG đọc KV', [g5.headers.get('x-cz-cache'), rd() - r0], ['HIT', 0]);
      ck('cache/không lưu khoá rác riêng', ![...fake.store.keys()].some((u) => u.includes('fbclid')), [...fake.store.keys()], 'không key nào chứa fbclid');
      /* tham số THẬT (token truyện khoá) vẫn phải đi thẳng KV, không cache */
      r0 = rd();
      const g5b = await call('GET', '/api/book/cache-truyen?token=abc');
      eq('cache/tham số thật (token) → BYPASS + đọc KV', [g5b.headers.get('x-cz-cache'), rd() - r0 >= 1], ['BYPASS', true]);

      /* book: MISS rồi HIT, hạn 300 giây */
      r0 = rd();
      const b1 = await call('GET', '/api/book/cache-truyen');
      eq('cache/book lần 1 MISS + đọc KV 1 lần', [b1.headers.get('x-cz-cache'), rd() - r0], ['MISS', 1]);
      /* 1.16.0: bộ thường để 1.800 giây; bộ có chương hẹn giờ hạ còn 60
         (header nội bộ x-cz-ttl) để chương vẫn lên sóng đúng mốc giờ. */
      /* Bản lưu TRONG Worker để 1.800 giây (x-cz-ttl, mình xoá được khi ghi);
         s-maxage gửi ra ngoài bị chặn trần 600 giây vì tầng cache khác thì
         mình không xoá được — sửa xong cùng lắm 10 phút là nơi khác thấy. */
      eq('cache/book s-maxage=600 (trần ngoài)', (b1.headers.get('cache-control') || '').includes('s-maxage=600'), true);
      eq('cache/book x-cz-ttl=1800 (bộ thường)', b1.headers.get('x-cz-ttl'), '1800');
      r0 = rd();
      const b2 = await call('GET', '/api/book/cache-truyen');
      eq('cache/book lần 2 HIT + không đọc KV', [b2.headers.get('x-cz-cache'), rd() - r0], ['HIT', 0]);
      /* link chia sẻ kèm tham số rác dùng CHUNG bản lưu của bộ (1.16.0) */
      r0 = rd();
      const b2b = await call('GET', '/api/book/cache-truyen?fbclid=xyz&utm_source=facebook&_=' + Date.now());
      eq('cache/book từ link Facebook → HIT chung bản lưu', [b2b.headers.get('x-cz-cache'), rd() - r0], ['HIT', 0]);
      /* lỗi không lưu: GET bộ không có → 404 và lần sau vẫn đọc lại KV */
      await call('GET', '/api/book/khong-co-bo-nay');
      r0 = rd();
      eq('cache/404 không lưu (lần sau vẫn đọc KV)', [(await call('GET', '/api/book/khong-co-bo-nay')).status, rd() - r0 >= 1], [404, true]);
      /* PUT book → cả book lẫn registry đều bị xoá cache */
      await call('PUT', '/api/book/cache-truyen', { headers: ADMH, body: { title: 'Cache Truyện Sửa', slug: 'cache-truyen', chapters: [{ t: 'Chương 1', html: '<p>y</p>' }] } });
      r0 = rd();
      const b3 = await call('GET', '/api/book/cache-truyen');
      eq('cache/PUT book → book MISS + thấy chữ mới', [b3.headers.get('x-cz-cache'), rd() - r0 >= 1, b3.body && b3.body.title], ['MISS', true, 'Cache Truyện Sửa']);
      r0 = rd();
      const g6 = await call('GET', '/api/registry');
      eq('cache/PUT book → registry cũng MISS', [g6.headers.get('x-cz-cache'), rd() - r0 >= 1], ['MISS', true]);
      /* stats: MISS rồi HIT; lượt đọc không xoá, bình chọn thì xoá */
      r0 = rd();
      const s1 = await call('GET', '/api/stats');
      eq('cache/stats lần 1 MISS + đọc KV', [s1.headers.get('x-cz-cache'), rd() - r0 >= 1], ['MISS', true]);
      eq('cache/stats header s-maxage=60', (s1.headers.get('cache-control') || '').includes('s-maxage=60'), true);
      r0 = rd();
      const s2 = await call('GET', '/api/stats');
      eq('cache/stats lần 2 HIT + không đọc KV', [s2.headers.get('x-cz-cache'), rd() - r0], ['HIT', 0]);
      await call('POST', '/api/view', { body: { slug: 'cache-truyen', vid: 'may-cache-9' } });
      eq('cache/lượt đọc không xoá cache stats', (await call('GET', '/api/stats')).headers.get('x-cz-cache'), 'HIT');
      await call('POST', '/api/vote', { body: { slug: 'cache-truyen', vote: 1, vid: 'may-cache-1' } });
      r0 = rd();
      const s3 = await call('GET', '/api/stats');
      eq('cache/bình chọn → stats MISS + đọc lại KV', [s3.headers.get('x-cz-cache'), rd() - r0 >= 1], ['MISS', true]);
      eq('cache/sau bình chọn vẫn HIT lại được', (await call('GET', '/api/stats')).headers.get('x-cz-cache'), 'HIT');
      /* nút làm mới số liệu của admin cũng xoá cache biên */
      await call('POST', '/api/stats/refresh', { headers: ADMH });
      eq('cache/stats/refresh → stats MISS', (await call('GET', '/api/stats')).headers.get('x-cz-cache'), 'MISS');
    } finally {
      globalThis.caches = realCaches;
    }
  }

  /* ---- 11b. MỤC LỤC NHẸ + ĐỌC 1 CHƯƠNG (1.16.0): /toc và /chapter/<n> ----
     Vì sao: mở 1 chương mà phải tải cả bộ (trung bình 334 KB) là tốn nhất cả
     trang — mỗi lượt mở là 1 lượt đọc KV + JSON.parse cả bộ trong Worker. */
  {
    const realCaches = globalThis.caches;
    const fake = new FakeCache();
    globalThis.caches = { default: fake };
    try {
      await call('PUT', '/api/book/lite-truyen', {
        headers: ADMH,
        body: {
          title: 'Lite Truyện', slug: 'lite-truyen', author: 'TG Lite', synFull: 'Mô tả đầy đủ.',
          chapters: [
            { t: 'Lời mở đầu', html: '<p>Mở đầu.</p>' },
            { t: 'Chương 1', html: '<p>Nội dung một.</p>' },
            { t: 'Chương 2', html: '<p>Nội dung hai.</p>', status: 'scheduled', at: new Date(Date.now() + 86400000).toISOString() },
            { t: 'Chương 3 ẩn', html: '<p>Đang ẩn.</p>', status: 'hidden' },
            { t: 'Ngoại truyện 1', html: '<p>Ngoại truyện.</p>' },
          ],
        },
      });
      const rd = () => kv.reads;
      /* mục lục: chỉ TÊN chương đang hiện, không kèm nội dung */
      let r0 = rd();
      const t1 = await call('GET', '/api/book/lite-truyen/toc');
      eq('toc/lần 1 MISS + đọc KV 1 lần', [t1.headers.get('x-cz-cache'), rd() - r0], ['MISS', 1]);
      eq('toc/đủ 3 chương đang hiện (bỏ hẹn giờ + ẩn)', (t1.body.chapters || []).map((c) => c.t), ['Lời mở đầu', 'Chương 1', 'Ngoại truyện 1']);
      eq('toc/total = số chương đang hiện', t1.body.total, 3);
      eq('toc/pending = số chương đang bị giữ', t1.body.pending, 2);
      ck('toc/KHÔNG kèm nội dung chương (nhẹ)', !JSON.stringify(t1.body).includes('Nội dung một'), JSON.stringify(t1.body).slice(0, 80), 'không có html');
      ck('toc/kèm đầu sách cho trang truyện', t1.body.title === 'Lite Truyện' && t1.body.author === 'TG Lite' && t1.body.synFull === 'Mô tả đầy đủ.', [t1.body.title, t1.body.author, t1.body.synFull], 'đủ title/author/synFull');
      eq('toc/bộ còn chương hẹn giờ → x-cz-ttl=60 (chương tự lên sóng)', t1.headers.get('x-cz-ttl'), '60');
      eq('toc/lần 2 HIT, không đọc KV', [(await call('GET', '/api/book/lite-truyen/toc')).headers.get('x-cz-cache'), rd() - r0], ['HIT', 1]);
      /* đọc 1 chương: vị trí 1-based trong danh sách ĐANG HIỆN */
      r0 = rd();
      const c1 = await call('GET', '/api/book/lite-truyen/chapter/2');
      eq('chapter/lần 1 MISS + đọc KV 1 lần', [c1.headers.get('x-cz-cache'), rd() - r0], ['MISS', 1]);
      eq('chapter/vị trí 2 = “Chương 1” (Lời mở đầu chiếm vị trí 1)', [c1.body.index, c1.body.chapter.t], [2, 'Chương 1']);
      eq('chapter/có nội dung + KHÔNG kèm chương khác', [c1.body.chapter.html, JSON.stringify(c1.body).includes('Ngoại truyện.')], ['<p>Nội dung một.</p>', false]);
      eq('chapter/kèm mục lục cho trang đọc dựng danh sách', (c1.body.chapters || []).length, 3);
      eq('chapter/sourceIndex = vị trí trong bản gốc trên KV', c1.body.sourceIndex, 1);
      eq('chapter/lần 2 HIT, không đọc KV', [(await call('GET', '/api/book/lite-truyen/chapter/2')).headers.get('x-cz-cache'), rd() - r0], ['HIT', 1]);
      /* chương đang hẹn giờ/ẩn KHÔNG có vị trí để gọi: vị trí đếm theo danh
         sách đang hiện, nên không có URL nào trả về nội dung chưa lên sóng. */
      const c3 = await call('GET', '/api/book/lite-truyen/chapter/3');
      eq('chapter/vị trí 3 = chương đang hiện thứ 3 (bỏ qua hẹn giờ + ẩn)', [c3.status, c3.body.chapter.t], [200, 'Ngoại truyện 1']);
      const c4 = await call('GET', '/api/book/lite-truyen/chapter/4');
      eq('chapter/vị trí ngoài danh sách đang hiện → 404', c4.status, 404);
      const bodies = [t1.text, c1.text, c3.text].join(' ');
      ck('chapter/không lộ chương hẹn giờ (Chương 2)', !bodies.includes('Nội dung hai'), bodies.length, 'không có “Nội dung hai”');
      ck('chapter/không lộ chương ẩn', !bodies.includes('Đang ẩn'), bodies.length, 'không có “Đang ẩn”');
      eq('chapter/vị trí ngoài danh sách → 404', (await call('GET', '/api/book/lite-truyen/chapter/99')).status, 404);
      eq('chapter/bộ không tồn tại → 404', (await call('GET', '/api/book/khong-co-bo-lite/chapter/1')).status, 404);
      eq('toc/bộ không tồn tại → 404', (await call('GET', '/api/book/khong-co-bo-lite/toc')).status, 404);
      /* link chia sẻ kèm tham số rác vẫn dùng chung bản lưu */
      r0 = rd();
      const junk = await call('GET', '/api/book/lite-truyen/chapter/2?fbclid=abc&utm_source=facebook');
      eq('chapter/link Facebook → HIT chung bản lưu, không đọc KV', [junk.headers.get('x-cz-cache'), rd() - r0], ['HIT', 0]);
      /* SỬA CHƯƠNG → xoá đúng mục cache của chương đó + mục lục */
      await call('PUT', '/api/book/lite-truyen/chapter', {
        headers: ADMH, body: { index: 1, chapter: { t: 'Chương 1', html: '<p>Nội dung một (đã sửa).</p>' } },
      });
      const c2 = await call('GET', '/api/book/lite-truyen/chapter/2');
      eq('chapter/sửa chương → MISS + thấy chữ mới ngay', [c2.headers.get('x-cz-cache'), c2.body.chapter.html], ['MISS', '<p>Nội dung một (đã sửa).</p>']);
      eq('chapter/sửa chương → mục lục cũng MISS', (await call('GET', '/api/book/lite-truyen/toc')).headers.get('x-cz-cache'), 'MISS');
      /* ĐỔI THỨ TỰ → vị trí mọi chương có thể đổi: xoá cả chùm */
      await call('PUT', '/api/book/lite-truyen/chapter', { headers: ADMH, body: { from: 0, to: 2 } });
      const c3b = await call('GET', '/api/book/lite-truyen/chapter/1');
      eq('chapter/đổi thứ tự → MISS (vị trí đã đổi)', [c3b.headers.get('x-cz-cache'), c3b.body.chapter.t], ['MISS', 'Chương 1']);
      /* XOÁ chương → mục lục và các vị trí sau đổi hết */
      await call('PUT', '/api/book/lite-truyen/chapter', { headers: ADMH, body: { index: 0, remove: true } });
      const t2 = await call('GET', '/api/book/lite-truyen/toc');
      eq('toc/xoá chương → MISS + còn 2 chương', [t2.headers.get('x-cz-cache'), t2.body.total], ['MISS', 2]);
      /* bộ KHÔNG còn chương hẹn giờ → hạn dài (1.800 giây) cho mục lục */
      const t3 = await call('GET', '/api/book/cache-truyen/toc');
      eq('toc/bộ không hẹn giờ → x-cz-ttl=1800', t3.headers.get('x-cz-ttl'), '1800');
      /* bộ khoá mật mã: chưa có token → 403 vỏ, có token → trả nội dung (BYPASS) */
      await call('PUT', '/api/book/lite-khoa', { headers: ADMH, body: { title: 'Lite Khoá', slug: 'lite-khoa', chapters: [{ t: 'Chương 1', html: '<p>Bí mật.</p>' }] } });
      await call('POST', '/api/lock/set', { headers: ADMH, body: { slug: 'lite-khoa', password: 'mat-ma-du-dai-123' } });
      const lk = await call('GET', '/api/book/lite-khoa/chapter/1');
      eq('chapter/bộ khoá, chưa mở → 403 không kèm nội dung', [lk.status, lk.body && lk.body.locked, JSON.stringify(lk.body || {}).includes('Bí mật')], [403, true, false]);
      const lktoc = await call('GET', '/api/book/lite-khoa/toc');
      eq('toc/bộ khoá, chưa mở → 403', lktoc.status, 403);
      const unlock = await call('POST', '/api/lock', { body: { slug: 'lite-khoa', password: 'mat-ma-du-dai-123' } });
      const tok = (unlock.body || {}).token || '';
      ck('lock/mở được khoá để thử tiếp', !!tok, unlock.body, 'có token');
      const lk2 = await call('GET', '/api/book/lite-khoa/chapter/1?token=' + encodeURIComponent(tok));
      eq('chapter/bộ khoá + token → trả nội dung, không cache', [lk2.status, lk2.headers.get('x-cz-cache'), lk2.body.chapter.html], [200, 'BYPASS', '<p>Bí mật.</p>']);
      ck('chapter/bộ khoá + token KHÔNG lưu vào cache chung', ![...fake.store.keys()].some((u) => u.includes('token=')), [...fake.store.keys()].slice(0, 5), 'không key nào chứa token');
    } finally {
      globalThis.caches = realCaches;
    }
  }

  /* ---------- 11c. BÌNH LUẬN: cache biên 15 giây + purge khi có bình luận mới --- */
  {
    const realCaches = globalThis.caches;
    const fake = new FakeCache();
    globalThis.caches = { default: fake };
    try {
      const rd = () => kv.reads;
      let r0 = rd();
      const k1 = await call('GET', '/api/comments/lite-truyen?limit=200');
      ck('comments/có bản lưu ở biên', k1.headers.get('x-cz-cache') === 'MISS', k1.headers.get('x-cz-cache'), 'MISS');
      eq('comments/lần 1 MISS + đọc KV', [k1.headers.get('x-cz-cache'), rd() - r0 >= 1], ['MISS', true]);
      r0 = rd();
      const k2 = await call('GET', '/api/comments/lite-truyen?limit=200');
      eq('comments/lần 2 HIT + không đọc KV', [k2.headers.get('x-cz-cache'), rd() - r0], ['HIT', 0]);
      const k3 = await call('GET', '/api/comments/lite-truyen?limit=200&fbclid=x');
      eq('comments/link Facebook → HIT chung bản lưu', [k3.headers.get('x-cz-cache'), k2.headers.get('x-cz-cache')], ['HIT', 'HIT']);
      const k4 = await call('GET', '/api/comments/lite-truyen?limit=50');
      ck('comments/limit khác → khoá riêng (không lẫn bản 200)', rd() - r0 >= 1, rd() - r0, 'đọc KV lại');
      const post = await call('POST', '/api/comments/lite-truyen', { body: { vid: 'may-cmt-1', name: 'Khách', text: 'Bình luận thử.' } });
      ck('comments/đăng được bình luận', post.status === 200 && post.body && post.body.ok !== false, post.body, 'ok');
      const k5 = await call('GET', '/api/comments/lite-truyen?limit=200');
      eq('comments/bình luận mới → MISS, thấy ngay', [k5.headers.get('x-cz-cache'), (k5.body.comments || []).length >= 1], ['MISS', true]);
      ck('comments/không lưu khoá có tham số lạ', ![...fake.store.keys()].some((u) => u.includes('limit=50') && u.includes('&x=')), [...fake.store.keys()].length, 'không khoá rác');
    } finally {
      globalThis.caches = realCaches;
    }
  }

  /* ---------- 12. RSS FEED: /feed.xml + /feed.xml?slug= ---------- */
  {
    const realCaches = globalThis.caches;
    const fake = new FakeCache();
    globalThis.caches = { default: fake };
    try {
      await call('PUT', '/api/registry', {
        headers: ADMH,
        body: {
          rev: 'feed-t1',
          lib: [
            { title: 'Truyện A & Bờ', slug: 'truyen-a', author: 'TG A', syn: 'Mô tả A <hay>', chapters: 3, updated: '2026-09-10' },
            { title: 'Truyện B', slug: 'truyen-b', author: 'TG B', syn: 'Mô tả B', chapters: 1, updated: '2026-09-15' },
          ],
        },
      });
      await call('PUT', '/api/book/truyen-a', {
        headers: ADMH,
        body: {
          title: 'Truyện A & Bờ', slug: 'truyen-a',
          chapters: [
            { t: 'Chương 1: Mở <đầu>', html: '<p>Đoạn 1 &amp; đoạn 2.</p><p>Thêm chữ cho dài thêm một chút để kiểm tra đoạn mô tả trong feed.</p>' },
            { t: 'Chương 2', html: '<p>Nội dung chương hai.</p>' },
            { t: 'Chương 3: Kết & mở', html: '<p>Kết thúc.</p>' },
          ],
        },
      });
      await call('PUT', '/api/book/truyen-b', {
        headers: ADMH,
        body: { title: 'Truyện B', slug: 'truyen-b', chapters: [{ t: 'Chương 1', html: '<p>Chỉ một chương.</p>' }] },
      });
      const items = (txt) => (String(txt).match(/<item>/g) || []).length;
      const bal = (txt, t) => {
        const open = (String(txt).match(new RegExp('<' + t + '[ >]', 'g')) || []).length;
        const close = (String(txt).match(new RegExp('</' + t + '>', 'g')) || []).length;
        return open === close && open > 0;
      };
      /* --- feed chung --- */
      const f1 = await call('GET', '/feed.xml');
      eq('feed/chung status 200 + content-type rss', [f1.status, (f1.headers.get('content-type') || '').split(';')[0]], [200, 'application/rss+xml']);
      eq('feed/chung lần 1 MISS', f1.headers.get('x-cz-cache'), 'MISS');
      eq('feed/chung header s-maxage=600', (f1.headers.get('cache-control') || '').includes('s-maxage=600'), true);
      eq('feed/chung có 4 items (3+1)', items(f1.text), 4);
      ck('feed/chung link thẳng URL chương', f1.text.includes('<link>https://ssochuz.pages.dev/truyen/truyen-a/chuong-3/</link>'), f1.text.slice(0, 400), 'link /truyen/<slug>/chuong-<n>/');
      ck('feed/chung thoát ký tự XML', f1.text.includes('Truyện A &amp; Bờ') && !/Truyện A & Bờ/.test(f1.text), f1.text.slice(0, 300), '&amp; &lt; &gt;');
      ck('feed/chung description không còn thẻ HTML', !/<\/?p[ >]/.test(f1.text), f1.text.slice(0, 300), 'đoạn văn thuần');
      ck('feed/chung có atom self + language vi', f1.text.includes('rel="self"') && f1.text.includes('<language>vi-vn</language>'), f1.text.slice(0, 400), 'atom:link + vi-vn');
      ck('feed/chung pubDate RFC 822', /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/.test(f1.text), (f1.text.match(/<pubDate>[^<]*<\/pubDate>/) || [''])[0], 'Wed, 10 Sep 2026 … GMT');
      ck('feed/chung XML cân thẻ', f1.text.startsWith('<?xml') && bal(f1.text, 'rss') && bal(f1.text, 'channel') && bal(f1.text, 'item'), 'đầu: ' + f1.text.slice(0, 60), '<?xml … <rss> <channel> <item> cân nhau');
      ck('feed/chung bộ mới cập nhật đứng trước', f1.text.indexOf('truyen-b/chuong-1') < f1.text.indexOf('truyen-a/chuong-3'), 'vị trí truyen-b < truyen-a', 'mới trước');
      const rd = () => kv.reads;
      let r0 = rd();
      const f2 = await call('GET', '/feed.xml');
      eq('feed/chung lần 2 HIT + không đọc KV', [f2.headers.get('x-cz-cache'), rd() - r0], ['HIT', 0]);
      /* --- feed riêng từng bộ --- */
      const fs1 = await call('GET', '/feed.xml?slug=truyen-a');
      eq('feed/riêng status + 3 items', [fs1.status, items(fs1.text)], [200, 3]);
      ck('feed/riêng chỉ có truyện A', !fs1.text.includes('truyen-b/'), fs1.text.slice(0, 200), 'không lẫn bộ khác');
      ck('feed/riêng chương mới đứng trước', fs1.text.indexOf('chuong-3') < fs1.text.indexOf('chuong-2'), 'vị trí c3 < c2', 'mới trước');
      eq('feed/riêng lần 2 HIT', (await call('GET', '/feed.xml?slug=truyen-a')).headers.get('x-cz-cache'), 'HIT');
      eq('feed/tham số rác vẫn HIT cùng khoá', (await call('GET', '/feed.xml?slug=truyen-a&utm=x')).headers.get('x-cz-cache'), 'HIT');
      ck('feed/không lưu khoá rác', ![...fake.store.keys()].some((u) => u.includes('utm=')), [...fake.store.keys()], 'không key nào chứa utm=');
      eq('feed/slug lạ → 404', (await call('GET', '/feed.xml?slug=khong-co')).status, 404);
      eq('feed/slug bậy → 400', (await call('GET', '/feed.xml?slug=../x')).status, 400);
      /* --- ghi chương mới → feed mất cache + thấy chương mới --- */
      await call('PUT', '/api/book/truyen-a', {
        headers: ADMH,
        body: {
          title: 'Truyện A & Bờ', slug: 'truyen-a',
          chapters: [
            { t: 'Chương 1', html: '<p>1.</p>' }, { t: 'Chương 2', html: '<p>2.</p>' },
            { t: 'Chương 3', html: '<p>3.</p>' }, { t: 'Chương 4: Mới toanh', html: '<p>4.</p>' },
          ],
        },
      });
      const f3 = await call('GET', '/feed.xml');
      eq('feed/PUT book → feed chung MISS', f3.headers.get('x-cz-cache'), 'MISS');
      ck('feed/thấy chương mới ngay', f3.text.includes('chuong-4'), f3.text.slice(0, 200), 'chuong-4');
      eq('feed/PUT book → feed riêng MISS', (await call('GET', '/feed.xml?slug=truyen-a')).headers.get('x-cz-cache'), 'MISS');
      /* --- SITE_BASE custom --- */
      const fc = await call('GET', '/feed.xml?slug=truyen-b', { e: Object.assign({}, env, { SITE_BASE: 'https://vidu.test' }) });
      ck('feed/SITE_BASE custom', fc.text.includes('https://vidu.test/truyen/truyen-b/chuong-1/'), fc.text.slice(0, 300), 'link theo SITE_BASE');
    } finally {
      globalThis.caches = realCaches;
    }
  }

  /* ---------- 13. WEB PUSH "RA CHƯƠNG MỚI" ---------- */
  {
    const b64u = (b) => Buffer.from(b).toString('base64url');
    /* khoá VAPID riêng cho bài test */
    const vp = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const vpub = vp.publicKey.export({ type: 'spki', format: 'der' }).slice(-65);
    const vprv = vp.privateKey.export({ type: 'sec1', format: 'der' }).slice(7, 39);
    const envPush = Object.assign({}, env, {
      VAPID_PUBLIC: b64u(vpub), VAPID_PRIVATE: b64u(vprv), SITE_BASE: 'https://web.test',
    });
    /* 1 trình duyệt giả (cặp ECDH + auth secret của PushManager) */
    const cli = crypto.createECDH('prime256v1');
    cli.generateKeys();
    const cliPub = b64u(cli.getPublicKey());
    const cliAuth = b64u(crypto.randomBytes(16));
    const subBody = (ep) => ({ endpoint: ep, keys: { p256dh: cliPub, auth: cliAuth } });
    /* giải mã bản tin aes128gcm (RFC 8291) để đối chiếu với payload gốc */
    const decryptPush = (bodyBytes, ecdh, authB64) => {
      const b = Buffer.from(bodyBytes);
      const salt = b.subarray(0, 16);
      const rs = b.readUInt32BE(16);
      const idlen = b[20];
      const srvPub = b.subarray(21, 21 + idlen);
      const ct = b.subarray(21 + idlen);
      const shared = ecdh.computeSecret(srvPub);
      const auth = Buffer.from(authB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const prk = crypto.createHmac('sha256', auth).update(shared).digest();
      const hkdf1 = (info) => crypto.createHmac('sha256', prk)
        .update(Buffer.concat([Buffer.from(info, 'utf8'), Buffer.from([1])])).digest();
      const cek = hkdf1('Content-Encoding: aes128gcm\0').subarray(0, 16);
      const nonce = hkdf1('Content-Encoding: nonce\0').subarray(0, 12);
      const dec = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
      dec.setAuthTag(ct.subarray(ct.length - 16));
      const pt = Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]);
      let end = pt.length;
      while (end > 0 && pt[end - 1] === 0) end--;
      return { text: pt.subarray(0, end - 1).toString('utf8'), delim: pt[end - 1], rs };
    };
    const pushKeys = () => [...kv.m.keys()].filter((k) => k.startsWith('push:'));
    const getQ = async () => (await kv.get('pushq', { type: 'json' })) || [];
    const scheduled = async (e) => {
      await worker.scheduled({}, e || envPush, ctx);
      await Promise.all(waits.splice(0));
    };
    /* dọn sạch sub/queue cũ (nếu bài test chạy lại trên cùng KV giả) */
    pushKeys().forEach((k) => kv.m.delete(k));
    kv.m.delete('pushq');

    /* --- đăng ký / huỷ --- */
    const s1 = await call('POST', '/api/push-sub', { e: envPush, body: subBody('https://push.test/sub1') });
    eq('push/đăng ký ok', [s1.status, !!(s1.body && s1.body.ok), pushKeys().length], [200, true, 1]);
    eq('push/thiếu endpoint → 400', (await call('POST', '/api/push-sub', { e: envPush, body: { keys: {} } })).status, 400);
    const badKeys = subBody('https://push.test/bad');
    badKeys.keys.p256dh = 'ngan';
    eq('push/khoá ngắn → 400', (await call('POST', '/api/push-sub', { e: envPush, body: badKeys })).status, 400);
    const un = await call('POST', '/api/push-sub', { e: envPush, body: { endpoint: 'https://push.test/sub1', remove: true } });
    eq('push/huỷ đăng ký', [(un.body && un.body.removed), pushKeys().length], [true, 0]);

    /* --- admin lưu chương mới → vào hàng đợi --- */
    await call('POST', '/api/push-sub', { e: envPush, body: subBody('https://push.test/may-1') });
    await call('PUT', '/api/registry', {
      headers: ADMH, e: envPush,
      body: { rev: 'push-t1', lib: [{ title: 'Truyện Push', slug: 'truyen-push', chapters: 2, updated: '2026-09-16' }] },
    });
    const book2 = { title: 'Truyện Push', slug: 'truyen-push', chapters: [{ t: 'Chương 1', html: '<p>1</p>' }, { t: 'Chương 2', html: '<p>2</p>' }] };
    await call('PUT', '/api/book/truyen-push', { headers: ADMH, e: envPush, body: book2 });
    let q = await getQ();
    eq('push/PUT tăng 2 chương → 1 job chương mới nhất', [q.length, q[0] && q[0].ch, q[0] && q[0].slug], [1, 2, 'truyen-push']);
    /* sửa chữ (không tăng chương) → không báo */
    await call('PUT', '/api/book/truyen-push', {
      headers: ADMH, e: envPush,
      body: { title: 'Truyện Push', slug: 'truyen-push', chapters: [{ t: 'Chương 1', html: '<p>1 sửa</p>' }, { t: 'Chương 2', html: '<p>2</p>' }] },
    });
    eq('push/sửa chữ không tăng chương → không thêm job', (await getQ()).length, 1);
    kv.m.delete('pushq');

    /* --- cron drain: gửi thật, giải mã được, VAPID verify được --- */
    await call('PUT', '/api/book/truyen-push', {
      headers: ADMH, e: envPush,
      body: { title: 'Truyện Push', slug: 'truyen-push', chapters: [{ t: 'Chương 1', html: '<p>1</p>' }, { t: 'Chương 2', html: '<p>2</p>' }, { t: 'Chương 3: Tin vui', html: '<p>3</p>' }] },
    });
    const caps = [];
    routes = (u, init) => {
      if (String(u).startsWith('https://push.test/')) {
        caps.push({ u: String(u), init });
        const code = u.includes('chet404') ? 404 : u.includes('chet410') ? 410 : 201;
        return { status: code, body: '' };
      }
      return null;
    };
    await scheduled();
    routes = () => null;
    eq('push/cron gửi đúng 1 tin tới sub', caps.length, 1);
    const hdrs = (caps[0] && caps[0].init.headers) || {};
    ck('push/header aes128gcm + vapid', hdrs['content-encoding'] === 'aes128gcm' && /^vapid t=[^,]+, k=.+/.test(hdrs.authorization || ''), hdrs, 'vapid t=…, k=…');
    /* verify chữ ký JWT VAPID bằng public key */
    const jwt = (hdrs.authorization || '').match(/^vapid t=([^,]+),/) || [];
    let vapidOk = false, vapidAud = '';
    try {
      const parts = String(jwt[1] || '').split('.');
      const vb = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      vapidAud = vb.aud;
      const vk = crypto.createPublicKey({
        key: { kty: 'EC', crv: 'P-256', x: b64u(vpub.slice(1, 33)), y: b64u(vpub.slice(33, 65)) }, format: 'jwk',
      });
      /* WebCrypto ký ra raw R||S (đúng chuẩn JWS); Node verify cần DER nên đổi dạng */
      const raw = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const derInt = (x) => {
        while (x.length > 1 && x[0] === 0) x = x.subarray(1);
        if (x[0] & 0x80) x = Buffer.concat([Buffer.from([0]), x]);
        return Buffer.concat([Buffer.from([2, x.length]), x]);
      };
      const seq = Buffer.concat([derInt(raw.subarray(0, 32)), derInt(raw.subarray(32, 64))]);
      const der = Buffer.concat([Buffer.from([0x30, seq.length]), seq]);
      vapidOk = crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), vk, der);
    } catch (e) { vapidOk = false; }
    eq('push/JWT VAPID ký đúng + aud là push service', [vapidOk, vapidAud], [true, 'https://push.test']);
    /* giải mã body và đối chiếu payload */
    const pt = decryptPush(caps[0].init.body, cli, cliAuth);
    let pay = null;
    try { pay = JSON.parse(pt.text); } catch (e) { pay = null; }
    eq('push/giải mã đúng + nội dung đúng mẫu', [pt.delim, pay && pay.title, pay && pay.body, pay && pay.url],
      [2, '📖 Truyện Push', 'Chương 3: Tin vui đã ra mắt!', 'https://web.test/truyen/truyen-push/chuong-3/']);
    eq('push/job xong → hàng đợi rỗng', (await getQ()).length, 0);

    /* --- sub chết (404/410) thì xoá --- */
    await call('POST', '/api/push-sub', { e: envPush, body: subBody('https://push.test/chet404') });
    await call('POST', '/api/push-sub', { e: envPush, body: subBody('https://push.test/chet410') });
    eq('push/có 3 subs trước drain', pushKeys().length, 3);
    await call('PUT', '/api/book/truyen-push', {
      headers: ADMH, e: envPush,
      body: { title: 'Truyện Push', slug: 'truyen-push', chapters: [{ t: 'C1', html: '<p>1</p>' }, { t: 'C2', html: '<p>2</p>' }, { t: 'C3', html: '<p>3</p>' }, { t: 'Chương 4', html: '<p>4</p>' }] },
    });
    const caps2 = [];
    routes = (u, init) => {
      if (String(u).startsWith('https://push.test/')) {
        caps2.push(String(u));
        const code = u.includes('chet404') ? 404 : u.includes('chet410') ? 410 : 201;
        return { status: code, body: '' };
      }
      return null;
    };
    await scheduled();
    routes = () => null;
    eq('push/gửi cả 3 (kể cả sub sắp chết)', caps2.length, 3);
    eq('push/xoá 2 sub chết, giữ sub sống', pushKeys().length, 1);

    /* --- tối đa 45 tin/invocation --- */
    for (let i = 0; i < 50; i++) {
      await kv.put('push:t' + i, JSON.stringify({ endpoint: 'https://push.test/b' + i, keys: { p256dh: cliPub, auth: cliAuth } }));
    }
    await kv.put('pushq', JSON.stringify([{
      id: 'batch1', slug: 'truyen-push', ch: 5, chapTitle: 'Chương 5', title: 'Truyện Push',
      url: 'https://web.test/truyen/truyen-push/chuong-5/', at: new Date().toISOString(), sent: {},
    }]));
    let n1 = 0;
    routes = (u) => (String(u).startsWith('https://push.test/') ? (n1++, { status: 201, body: '' }) : null);
    await scheduled();
    routes = () => null;
    q = await getQ();
    eq('push/invocation 1 gửi đúng 45 tin', n1, 45);
    eq('push/job chưa xong (còn sub chưa gửi)', [q.length, q[0] && q[0].done !== true], [1, true]);
    let n2 = 0;
    routes = (u) => (String(u).startsWith('https://push.test/') ? (n2++, { status: 201, body: '' }) : null);
    await scheduled();
    routes = () => null;
    eq('push/invocation 2 gửi nốt 6 tin (50+1 sub sống)', n2, 6);
    eq('push/xong hết → hàng đợi rỗng', (await getQ()).length, 0);
    pushKeys().forEach((k) => kv.m.delete(k));
    kv.m.delete('pushq');

    /* --- chưa cấu hình VAPID / hàng đợi rỗng → cron không làm gì --- */
    await kv.put('pushq', JSON.stringify([{ id: 'x', slug: 's', ch: 1, chapTitle: 'C1', title: 'T', url: 'https://web.test/', sent: {} }]));
    let n3 = 0;
    routes = (u) => (String(u).startsWith('https://push.test/') ? (n3++, { status: 201, body: '' }) : null);
    await scheduled(Object.assign({}, env, { VAPID_PUBLIC: '', VAPID_PRIVATE: '' }));
    routes = () => null;
    eq('push/thiếu VAPID → không gửi, job còn nguyên', [n3, (await getQ()).length], [0, 1]);
    kv.m.delete('pushq');
    await scheduled();
    eq('push/hàng đợi rỗng → cron êm', true, true);
  }

  /* ---------- 14. BÌA TRUYỆN → Supabase Storage (kind=cover) ---------- */
  {
    const bin = Buffer.from('524946462400000057454250565038201c000000080000003001000024000000ff00000000', 'hex');
    const b64 = bin.toString('base64');
    const envCover = Object.assign({}, env, {
      SUPABASE_URL: 'https://sbcover.test',
      SUPABASE_SERVICE_ROLE: 'service-role-test',
    });
    const h = await call('GET', '/api/health', { e: envCover });
    eq('cover/health.overflow.covers khi đã gắn secret', h.body && h.body.overflow && h.body.overflow.covers, true);
    eq('cover/health.overflow.supabase', h.body && h.body.overflow && h.body.overflow.supabase, true);

    const noSecret = await call('POST', '/api/img', {
      headers: ADMH, body: { data: b64, type: 'image/webp', kind: 'cover' },
    });
    ck('cover/chưa secret → KV /api/img', !!(noSecret.body && noSecret.body.ok && /^\/api\/img\//.test(noSecret.body.url)), noSecret.body && noSecret.body.url, '/api/img/…');

    const storageCalls = [];
    routes = (u, init) => {
      const url = String(u);
      storageCalls.push({ url, method: (init && init.method) || 'GET' });
      if (url.includes('/storage/v1/object/covers/')) return { status: 200, body: { Key: 'covers/x' } };
      if (url.includes('/storage/v1/bucket')) return { status: 200, body: { name: 'covers' } };
      return { status: 404, body: '' };
    };
    const up = await call('POST', '/api/img', {
      e: envCover, headers: ADMH, body: { data: b64, type: 'image/webp', kind: 'cover' },
    });
    ck('cover/Storage → URL public', !!(up.body && up.body.ok && /\/storage\/v1\/object\/public\/covers\//.test(up.body.url)), up.body, 'https://sbcover.test/storage/v1/object/public/covers/…');
    eq('cover/overflow supabase-storage', up.body && up.body.overflow, 'supabase-storage');
    ck('cover/POST object lên Storage', storageCalls.some((c) => c.method === 'POST' && /\/storage\/v1\/object\/covers\//.test(c.url)), storageCalls, 'POST /storage/v1/object/covers/');
    const stub = kv.m.get('img:' + up.body.id);
    ck('cover/KV chỉ stub (không base64 lớn)', !!(stub && stub.value && stub.value.charAt(0) === '{' && /supabase-storage/.test(stub.value) && stub.value.length < 800), stub && stub.value && stub.value.slice(0, 160), 'JSON stub');
    const g = await call('GET', '/api/img/' + up.body.id, { e: envCover });
    eq('cover/GET /api/img → 302 Location public', [g.status, g.headers.get('location')], [302, up.body.url]);
    eq('cover/302 có CORS', g.headers.get('access-control-allow-origin'), 'https://web.test');

    /* ảnh chương (không kind) không đi Storage */
    storageCalls.length = 0;
    const chap = await call('POST', '/api/img', {
      e: envCover, headers: ADMH, body: { data: b64, type: 'image/webp' },
    });
    ck('ảnh chương/không POST Storage', !storageCalls.some((c) => /\/storage\/v1\/object\/covers\//.test(c.url)), storageCalls, 'không covers');
    ck('ảnh chương/vẫn /api/img', !!(chap.body && /^\/api\/img\//.test(chap.body.url)), chap.body && chap.body.url, '/api/img/…');
    eq('ảnh chương/KV raw base64', kv.m.get('img:' + chap.body.id) && kv.m.get('img:' + chap.body.id).value, b64);

    /* Storage từ chối → 502, không giả lưu KV */
    routes = (u) => String(u).includes('/storage/v1/') ? { status: 500, body: 'nope' } : { status: 404, body: '' };
    const keysBefore = new Set(kv.m.keys());
    const fail = await call('POST', '/api/img', {
      e: envCover, headers: ADMH, body: { data: b64, type: 'image/webp', kind: 'cover' },
    });
    eq('cover/Storage lỗi → 502', fail.status, 502);
    ck('cover/502 không ok', fail.body && fail.body.ok === false, fail.body, 'ok:false');
    ck('cover/không giả ghi KV khi Storage fail', [...kv.m.keys()].filter((k) => k.startsWith('img:') && !keysBefore.has(k)).length === 0,
      [...kv.m.keys()].filter((k) => k.startsWith('img:') && !keysBefore.has(k)), []);
    routes = () => null;
  }

  /* ---------- 15. MIGRATE OVERFLOW: book/ảnh CŨ trong KV → Supabase ----------
     KV lúc này còn dữ liệu rác của các bài trước → so TƯƠNG ĐỐI trên các key cố
     định, lặp nhiều vòng (giới hạn mỗi lô) cho tới khi key fixture xong. */
  {
    const bin = Buffer.from('524946462400000057454250565038201c000000080000003001000024000000ff00000000', 'hex');
    const b64 = bin.toString('base64');
    const envMig = Object.assign({}, env, {
      SUPABASE_URL: 'https://sbmig.test',
      SUPABASE_SERVICE_ROLE: 'service-role-test',
    });
    const sbCalls = [];
    const blobRows = {};   /* Supabase PostgREST giả: key → row json */
    routes = (u, init) => {
      const url = String(u);
      const method = (init && init.method) || 'GET';
      sbCalls.push({ url, method, body: (init && init.body) || '' });
      if (url.includes('/rest/v1/ssochuz_blobs')) {
        if (method === 'POST') {
          try { const row = JSON.parse(String((init && init.body) || '{}')); if (row && row.key) blobRows[row.key] = row; } catch (e) {}
          return { status: 201, body: '' };
        }
        const m = /key=eq\.([^&]+)/.exec(url);
        const row = m && blobRows[decodeURIComponent(m[1])];
        return { status: 200, body: row ? [row] : [] };
      }
      if (url.includes('/storage/v1/object/covers/')) return { status: 200, body: { Key: 'covers/x' } };
      if (url.includes('/storage/v1/bucket')) return { status: 200, body: { name: 'covers' } };
      return { status: 404, body: '' };
    };
    /* gieo dữ liệu cũ trong KV */
    await kv.put('registry', JSON.stringify({
      rev: 'mig', lib: [
        { slug: 'mig-book', title: 'Bộ Migration', chapters: 1, countLabel: '1/?', thumb: '/api/img/covmigfix0001' },
        { slug: 'other-book', title: 'Bộ Khác', chapters: 0, thumb: 'https://lh3.googleusercontent.com/x' },
      ],
    }));
    await kv.put('book:mig-book', JSON.stringify({ title: 'Bộ Migration', slug: 'mig-book', chapters: [{ t: 'Chương 1', html: '<p>nội dung đủ dài để không chửi</p>' }] }));
    await kv.put('img:covmigfix0001', b64);
    await kv.put('img:chap-mig', b64);
    await kv.put('img:stub-mig', JSON.stringify({ overflow: 'supabase', type: 'image/webp', bytes: 1 }));

    const isStubKV = (key) => { const v = kv.m.get(key); return !!(v && v.value.charAt(0) === '{' && /overflow/.test(v.value)); };
    const runUntilDone = async (body, max) => {
      let r, rounds = 0;
      do { r = await call('POST', '/api/admin/migrate-overflow', { e: envMig, headers: ADMH, body: body || {} }); rounds++; }
      while (r.body && r.body.done === false && rounds < (max || 40));
      return r;
    };

    eq('mig/không khoá → 401', (await call('POST', '/api/admin/migrate-overflow', { e: envMig, body: {} })).status, 401);
    const noCfg = await call('POST', '/api/admin/migrate-overflow', { headers: ADMH, body: {} });
    ck('mig/env thường (không supabase/r2) → báo thiếu cấu hình', noCfg.body && noCfg.body.ok === false && /Chưa cấu hình overflow/i.test(noCfg.body.error || ''), noCfg.body && noCfg.body.error, 'lỗi CONFIG liệt kê SUPABASE_SERVICE_ROLE');

    const r = await runUntilDone({ limit: 25 });
    ck('mig/chạy đến done thì dừng sạch', !!(r.body && r.body.ok === true && r.body.done === true), r.body && r.body.done, true);

    /* KV sau migration: 3 key fixture đều thành stub */
    ck('mig/book KV còn stub nhỏ', isStubKV('book:mig-book'), (kv.m.get('book:mig-book') || {}).value && (kv.m.get('book:mig-book') || {}).value.slice(0, 120), 'JSON stub');
    const cStub = (kv.m.get('img:covmigfix0001') || {}).value || '';
    ck('mig/bìa KV → stub supabase-storage (URL public covers)', /supabase-storage/.test(cStub) && /\/storage\/v1\/object\/public\/covers\/covmigfix0001\./.test(cStub), cStub.slice(0, 200), 'supabase-storage stub');
    const iStub = (kv.m.get('img:chap-mig') || {}).value || '';
    ck('mig/ảnh chương KV → stub blobs', /"overflow"\s*:\s*"supabase"/.test(iStub), iStub.slice(0, 120), 'blobs stub');
    ck('mig/stub có sẵn giữ nguyên', (kv.m.get('img:stub-mig') || {}).value === JSON.stringify({ overflow: 'supabase', type: 'image/webp', bytes: 1 }), (kv.m.get('img:stub-mig') || {}).value, 'stub nguyên bản');

    /* request ra Supabase đúng chỗ */
    const blobPosts = sbCalls.filter((c) => c.method === 'POST' && /\/rest\/v1\/ssochuz_blobs/.test(c.url));
    ck('mig/POST blobs cho book + ảnh', blobPosts.some((c) => /book:mig-book/.test(c.body)) && blobPosts.some((c) => /img:chap-mig/.test(c.body)),
      blobPosts.map((c) => (c.body || '').slice(0, 60)), 'book:mig-book + img:chap-mig');
    ck('mig/bìa POST lên Storage covers', sbCalls.some((c) => c.method === 'POST' && /\/storage\/v1\/object\/covers\/covmigfix0001\./.test(c.url)),
      sbCalls.filter((c) => /object\/covers/.test(c.url)).map((c) => c.method + ' ' + c.url.slice(-40)), '…/object/covers/covmigfix0001.webp');

    /* GET /api/book sau stub: blob store trả lại đủ chương */
    const bg = await call('GET', '/api/book/mig-book', { e: envMig });
    ck('mig/GET book sau stub vẫn đủ chương', !!(bg.body && Array.isArray(bg.body.chapters) && bg.body.chapters.length === 1), bg.body && bg.body.chapters && bg.body.chapters.length, 1);
    ck('mig/GET ảnh stub → 302 ra URL public covers', await (async () => {
      const g = await call('GET', '/api/img/covmigfix0001', { e: envMig });
      return g.status === 302 && /\/storage\/v1\/object\/public\/covers\/covmigfix0001\./.test(g.headers.get('location') || '');
    })(), (await call('GET', '/api/img/covmigfix0001', { e: envMig })).status, '302');

    /* only=books không chạm ảnh */
    await kv.put('img:mig-i2', b64);
    await kv.put('book:mig-b2', JSON.stringify({ title: 'B2', slug: 'mig-b2', chapters: [{ t: 'C1', html: '<p>x</p>' }] }));
    await runUntilDone({ limit: 25, only: 'books' });
    ck('mig/only=books: b2 thành stub', isStubKV('book:mig-b2'), (kv.m.get('book:mig-b2') || {}).value && (kv.m.get('book:mig-b2') || {}).value.slice(0, 80), 'stub');
    ck('mig/only=books: giữ nguyên ảnh base64', (kv.m.get('img:mig-i2') || {}).value === b64, ((kv.m.get('img:mig-i2') || {}).value || '').slice(0, 30), b64.slice(0, 30));

    /* Supabase Storage chết → failed kể tên key, KHÔNG mất base64 trong KV */
    await kv.put('img:covmigfix0001fix-002', b64);
    await kv.put('registry', JSON.stringify({ rev: 'mig3', lib: [{ slug: 'mig-book', title: 'Bộ Migration', chapters: 1, thumb: '/api/img/covmigfix0001fix-002' }] }));
    routes = (u, init) => {
      const url = String(u);
      if (url.includes('/storage/v1/')) return { status: 500, body: 'boom' };
      if (url.includes('/rest/v1/ssochuz_blobs')) {
        const m = /key=eq\.([^&]+)/.exec(url);
        const row = m && blobRows[decodeURIComponent(m[1])];
        return { status: 200, body: row ? [row] : [] };
      }
      return { status: 404, body: '' };
    };
    /* Storage chỉ dùng cho bìa; ảnh chương ivẫn post blobs (storage fail nhưng supabase ok). */
    let rf = null, guard2 = 0;
    do { rf = await call('POST', '/api/admin/migrate-overflow', { e: envMig, headers: ADMH, body: { limit: 10 } }); guard2++; }
    while (rf.body && rf.body.done === false && guard2 < 40 && !(rf.body.failed || []).some((f) => String(f.key).includes('covmigfix0001fix-002')));
    ck('mig/Storage chết → failed có tên key', (rf.body.failed || []).some((f) => String(f.key).includes('covmigfix0001fix-002')), rf.body && rf.body.failed, 'img:covmigfix0001fix-002 fail');
    ck('mig/Storage chết → giữ nguyên base64 (không mất data)', (kv.m.get('img:covmigfix0001fix-002') || {}).value === b64, ((kv.m.get('img:covmigfix0001fix-002') || {}).value || '').slice(0, 30), b64.slice(0, 30));
    routes = () => null;
  }

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
