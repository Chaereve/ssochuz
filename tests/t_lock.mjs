/* ============================================================================
   t_lock.mjs · KIỂM THỬ KHÓA TRUYỆN BẰNG MẬT MÃ + ẢNH + KIỂM KHO KV
   ----------------------------------------------------------------------------
   Nạp thẳng worker/cms.js vào Node với KV giả (Map) — y hệt t_worker.mjs:
     · POST /api/lock/set          khóa / đổi / bỏ khóa (chỉ admin)
     · GET  /api/book/<slug>       bộ khóa: KHÔNG lộ chương/synFull/salt-hash
     · POST /api/lock              mật mã sai → 403, đúng → token 6 giờ
     · token sai slug / hết hạn    → vẫn bị chặn
     · PUT  /api/book + POST /api/seed giữ nguyên khóa khi lưu chương/nạp lại
     · feed RSS                     không bao giờ chứa chương của bộ khóa
     · POST /api/img + GET /api/img/<id>   upload ảnh (admin) + đọc (mở)
     · GET  /api/admin/kv           kiểm kho theo tiền tố khoá
   Chạy:  node tests/t_lock.mjs
   Điều kiện đạt: mọi khoá "errors*" là [] và thoát mã 0.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(path.join(ROOT, 'worker', 'cms.js'))).default;

/* KV giả (Map) — như Cloudflare KV (trừ expirationTtl) */
class FakeKV {
  constructor() { this.m = new Map(); }
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
  async put(k, value, opt) { this.m.set(k, { value: String(value), metadata: (opt && opt.metadata) || null }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? all.indexOf(cursor) + 1 : 0;
    const keys = all.slice(start, start + limit).map((name) => ({ name, metadata: this.m.get(name).metadata }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : all[start + limit - 1] };
  }
}
const kv = new FakeKV();
const _env = {
  ADMIN_KEY: 'a'.repeat(32), CZ_KV: kv, ALLOW_ORIGIN: 'https://web.test',
  SESSION_SECRET: 'session-secret-dai-hon-32-ky-tu-cho-chac',
};
const _w = { env: _env, kv };
globalThis.caches = undefined;   /* tắt cache biên — kiểm tra thẳng KV */

let pass = 0; const fails = [];
async function t(name, fn) {
  try { await fn(); pass++; }
  catch (e) { fails.push(name + ': ' + (e && e.message || e)); }
}
async function call(method, p, { body, headers = {}, admin = false } = {}) {
  const h = Object.assign({ origin: 'https://web.test' }, headers);
  if (admin) h['x-admin-key'] = _w.env.ADMIN_KEY;
  if (body !== undefined && typeof body !== 'string') h['content-type'] = 'application/json';
  const req = new Request('https://cms.test' + p, {
    method, headers: h,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const res = await worker.fetch(req, _w.env, { waitUntil: () => {} });
  const txt = await res.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
  return { status: res.status, ok: res.ok, body: j, text: txt, headers: res.headers };
}
const putSeed = (name) => call('POST', '/api/seed', {
  admin: true,
  body: {
    registry: { rev: 'test', lib: [{ title: name, slug: 'ma-duong-bi-khoa', author: 'A', status: 'Đang cập nhật', chapters: 2, thumb: '', syn: 'Giới thiệu công khai của bộ khóa.' }] },
    books: { 'ma-duong-bi-khoa': { title: name, slug: 'ma-duong-bi-khoa', chapters: [
      { t: 'Chương 1', html: '<p>CHUONG MOT - NOI DUNG BI MAT</p>' },
      { t: 'Chương 2', html: '<p>CHUONG HAI - NOI DUNG BI MAT</p>' },
    ] } },
  },
});

/* ============================ 1. KHÓA TRUYỆN =============================== */
await t('seed dữ liệu nền (2 chương + registry)', async () => {
  const r = await putSeed('Ma Đường Bị Khóa');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.ok);
});

await t('khóa cần quyền quản trị (401 khi không có khoá)', async () => {
  const r = await call('POST', '/api/lock/set', { body: { slug: 'ma-duong-bi-khoa', password: 'matma-choi-123' } });
  assert.equal(r.status, 401);
});

await t('mật mã ngắn hơn 8 ký tự bị từ chối', async () => {
  const r = await call('POST', '/api/lock/set', { admin: true, body: { slug: 'ma-duong-bi-khoa', password: 'ngan-qu' } });
  assert.equal(r.status, 400, JSON.stringify(r.body));
});

await t('khóa thành công: book có salt+hash, registry có cờ lock:1', async () => {
  const r = await call('POST', '/api/lock/set', { admin: true, body: { slug: 'ma-duong-bi-khoa', password: 'matma-choi-123' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ok: true, slug: 'ma-duong-bi-khoa', locked: true });
  const book = kv.m.get('book:ma-duong-bi-khoa');
  const bj = JSON.parse(book.value);
  assert.ok(Array.isArray(bj.lock.salt) && bj.lock.salt.length === 16, 'thiếu salt 128-bit');
  assert.ok(Array.isArray(bj.lock.hash) && bj.lock.hash.length === 32, 'thiếu hash PBKDF2 256-bit');
  assert.ok(!JSON.stringify(book.value).includes('matma-choi-123'), 'lộ mật mã thuần!');
  const reg = JSON.parse(kv.m.get('registry').value);
  const n = reg.lib.find((x) => x.slug === 'ma-duong-bi-khoa');
  assert.equal(n.lock, 1, 'registry thiếu cờ lock:1');
});

await t('bộ khóa KHÔNG lộ chương khi chưa có token', async () => {
  const r = await call('GET', '/api/book/ma-duong-bi-khoa');
  assert.equal(r.status, 200);
  assert.equal(r.body.locked, true);
  assert.deepEqual(r.body.chapters, []);
  const txt = r.text;
  assert.ok(!txt.includes('NOI DUNG BI MAT'), 'lộ nội dung chương!');
  assert.ok(!txt.includes('"salt"') && !txt.includes('"hash"'), 'lộ salt/hash!');
  assert.ok(!txt.includes('Giới thiệu công khai'), 'lộ synFull (registry có syn riêng)');
});

await t('mật mã sai → 403, đúng → token + exp', async () => {
  const bad = await call('POST', '/api/lock', { body: { slug: 'ma-duong-bi-khoa', password: 'sai-toan-12345' } });
  assert.equal(bad.status, 403);
  const ok = await call('POST', '/api/lock', { body: { slug: 'ma-duong-bi-khoa', password: 'matma-choi-123' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.token && ok.body.exp > Math.floor(Date.now() / 1000) + 3 * 3600, 'token/hạn dùng lạ');
  global.__token = ok.body.token;
});

await t('token đúng mở được trọn bộ (kèm locked:true, không kèm lock hash)', async () => {
  const r = await call('GET', '/api/book/ma-duong-bi-khoa?token=' + encodeURIComponent(global.__token));
  assert.equal(r.status, 200);
  assert.equal(r.body.locked, true);
  assert.equal(r.body.chapters.length, 2);
  assert.ok(r.body.chapters[0].html.includes('NOI DUNG BI MAT'));
  assert.ok(!r.body.lock, 'token trả về cả salt/hash!');
});

await t('token của bộ khác KHÔNG mở được bộ này', async () => {
  /* registry gộp cả 2 bộ — seed thay TOÀN bộ registry nên không được bỏ bộ khóa */
  await call('POST', '/api/seed', { admin: true, body: {
    registry: { rev: 't', lib: [
      { title: 'Ma Đường Bị Khóa', slug: 'ma-duong-bi-khoa', chapters: 2, status: 'Đang cập nhật', lock: 1 },
      { title: 'Bộ Khác', slug: 'bo-khac', chapters: 1, status: 'Hoàn thành' },
    ] },
    books: { 'bo-khac': { title: 'Bộ Khác', slug: 'bo-khac', chapters: [{ t: 'C1', html: 'x' }] } },
  } });
  const r2 = await call('POST', '/api/lock/set', { admin: true, body: { slug: 'bo-khac', password: 'bo-khac-matma' } });
  assert.equal(r2.status, 200);
  const tok2 = (await call('POST', '/api/lock', { body: { slug: 'bo-khac', password: 'bo-khac-matma' } })).body.token;
  const r = await call('GET', '/api/book/ma-duong-bi-khoa?token=' + encodeURIComponent(tok2));
  assert.equal(r.body.locked, true);
  assert.deepEqual(r.body.chapters, []);
});

await t('quản trị (X-Admin-Key) đọc TRỌN bộ khóa — kể cả salt/hash, không qua cache biên', async () => {
  const r = await call('GET', '/api/book/ma-duong-bi-khoa', { admin: true });
  assert.equal(r.status, 200);
  assert.ok(r.body.chapters && r.body.chapters.length >= 1, JSON.stringify(r.body).slice(0, 200));
  assert.ok(r.body.lock && Array.isArray(r.body.lock.hash), 'bản admin thiếu lock (khôi phục sau PUT)');
  assert.match(r.headers.get('cache-control'), /no-store/);
  /* và đáp ứng công khai (không key) vẫn là vỏ */
  const pub = await call('GET', '/api/book/ma-duong-bi-khoa');
  assert.deepEqual(pub.body.chapters, []);
});

await t('token giả/tự chế bị chặn (HMAC không khớp)', async () => {
  const fake = 'a'.repeat(43) + '.' + (Math.floor(Date.now() / 1000) + 3600);
  const r = await call('GET', '/api/book/ma-duong-bi-khoa?token=' + encodeURIComponent(fake));
  assert.deepEqual(r.body.chapters, []);
});

await t('đổi mật mã: mật mã cũ mất hiệu lực', async () => {
  const r = await call('POST', '/api/lock/set', { admin: true, body: { slug: 'ma-duong-bi-khoa', password: 'matma-moi-456' } });
  assert.equal(r.status, 200);
  const old = await call('POST', '/api/lock', { body: { slug: 'ma-duong-bi-khoa', password: 'matma-choi-123' } });
  assert.equal(old.status, 403, 'mật mã cũ vẫn mở được!');
  const nw = await call('POST', '/api/lock', { body: { slug: 'ma-duong-bi-khoa', password: 'matma-moi-456' } });
  assert.equal(nw.status, 200);
});

await t('lưu chương (PUT book) KHÔNG làm mất khóa', async () => {
  const book = { title: 'Ma Đường Bị Khóa', slug: 'ma-duong-bi-khoa', chapters: [
    { t: 'Chương 1', html: '<p>cập nhật mới</p>' }, { t: 'Chương 2', html: '<p>CHUONG HAI</p>' },
  ] };
  const r = await call('PUT', '/api/book/ma-duong-bi-khoa', { admin: true, body: book });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const bj = JSON.parse(kv.m.get('book:ma-duong-bi-khoa').value);
  assert.ok(bj.lock && bj.lock.salt, 'khóa bị mất sau khi lưu chương!');
  const reg = JSON.parse(kv.m.get('registry').value);
  assert.equal(reg.lib.find((x) => x.slug === 'ma-duong-bi-khoa').lock, 1);
});

await t('seed lại dữ liệu KHÔNG làm mất khóa', async () => {
  const r = await call('POST', '/api/seed', { admin: true, body: { books: { 'ma-duong-bi-khoa': { title: 'Ma Đường Bị Khóa', slug: 'ma-duong-bi-khoa', chapters: [{ t: 'C1', html: 'nạp lại' }] } } } });
  assert.equal(r.status, 200);
  const bj = JSON.parse(kv.m.get('book:ma-duong-bi-khoa').value);
  assert.ok(bj.lock, 'khóa bị mất sau khi seed!');
});

await t('feed RSS không chứa chương của bộ khóa (feed chung + feed riêng)', async () => {
  const all = await call('GET', '/feed.xml');
  assert.equal(all.status, 200);
  assert.ok(!all.text.includes('NOI DUNG BI MAT'), 'feed chung lộ chương khóa!');
  const one = await call('GET', '/feed.xml?slug=ma-duong-bi-khoa');
  assert.equal(one.status, 404);
});

await t('bỏ khóa (password rỗng): chương công khai, cờ registry biến mất', async () => {
  const r = await call('POST', '/api/lock/set', { admin: true, body: { slug: 'ma-duong-bi-khoa', password: '' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ok: true, slug: 'ma-duong-bi-khoa', locked: false });
  const bj = JSON.parse(kv.m.get('book:ma-duong-bi-khoa').value);
  assert.ok(!bj.lock, 'vẫn còn khóa sau khi bỏ khóa!');
  const reg = JSON.parse(kv.m.get('registry').value);
  const n = reg.lib.find((x) => x.slug === 'ma-duong-bi-khoa');
  assert.ok(!('lock' in n), 'registry vẫn giữ cờ lock!');
  const r2 = await call('GET', '/api/book/ma-duong-bi-khoa');
  assert.equal(r2.body.chapters.length, 1);
  assert.ok(!r2.body.locked);
});

await t('nhập mật mã cho bộ KHÔNG có khóa → 400 rõ ràng', async () => {
  const r = await call('POST', '/api/lock', { body: { slug: 'ma-duong-bi-khoa', password: 'matma-moi-456' } });
  assert.equal(r.status, 400);
});

/* ============================ 2. ẢNH TRONG CHƯƠNG =========================== */
await t('upload ảnh cần quyền quản trị', async () => {
  const r = await call('POST', '/api/img', { body: { data: 'aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q=', type: 'image/png' } });
  assert.equal(r.status, 401);
});

await t('loại file lạ bị từ chối', async () => {
  const r = await call('POST', '/api/img', { admin: true, body: { data: 'aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q=', type: 'text/html' } });
  assert.equal(r.status, 400);
});

await t('upload WebP (base64) → có URL; đọc lại đúng bytes + content-type', async () => {
  /* WebP thật tối thiểu: RIFF....WEBP — đủ để worker nhận (không rã ảnh, chỉ lưu base64) */
  const bin = Buffer.from('52 49 46 46 24 00 00 00 57 45 42 50 56 50 38 20 1c 00 00 00 08 00 00 00 30 01 00 00 24 00 00 00 ff 00 00 00 00'.replace(/ /g, ''), 'hex');
  const b64 = bin.toString('base64');
  const r = await call('POST', '/api/img', { admin: true, body: { data: b64, type: 'image/webp' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^\/api\/img\/[A-Za-z0-9-]{12,64}$/);
  assert.equal(r.body.bytes, bin.length);
  const g = await call('GET', r.body.url);
  assert.equal(g.status, 200);
  assert.equal(g.headers.get('content-type'), 'image/webp');
  assert.match(g.headers.get('cache-control'), /immutable/);
  assert.equal(kv.m.get('img:' + r.body.id).value, b64);
  global.__imgUrl = r.body.url;
});

await t('ảnh không tồn tại → 404, id rác → 404 (không lỗi 500)', async () => {
  const r = await call('GET', '/api/img/' + 'x'.repeat(32));
  assert.equal(r.status, 404);
  const r2 = await call('GET', '/api/img/short');
  assert.equal(r2.status, 404);
});

await t('base64 dính data: prefix vẫn nhận (trình duyệt hay gửi dạng này)', async () => {
  const bin = Buffer.from('52 49 46 46 24 00 00 00 57 45 42 50 56 50 38 20 1c 00 00 00 08 00 00 00 30 01 00 00 24 00 00 00 ff 00 00 00 00'.replace(/ /g, ''), 'hex');
  const r = await call('POST', '/api/img', { admin: true, body: { data: 'data:image/webp;base64,' + bin.toString('base64'), type: 'image/webp' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

await t('kind=cover chưa gắn Storage → vẫn KV /api/img (không giả URL Storage)', async () => {
  const bin = Buffer.from('52 49 46 46 24 00 00 00 57 45 42 50 56 50 38 20 1c 00 00 00 08 00 00 00 30 01 00 00 24 00 00 00 ff 00 00 00 00'.replace(/ /g, ''), 'hex');
  const r = await call('POST', '/api/img', { admin: true, body: { data: bin.toString('base64'), type: 'image/webp', kind: 'cover' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^\/api\/img\/[A-Za-z0-9-]{12,64}$/);
  assert.equal(kv.m.get('img:' + r.body.id).value, bin.toString('base64'));
});

/* ============================ 3. KIỂM KHO KV ================================ */
await t('GET /api/admin/kv nhóm đúng tiền tố + cần admin', async () => {
  const noAuth = await call('GET', '/api/admin/kv');
  assert.equal(noAuth.status, 401);
  const r = await call('GET', '/api/admin/kv', { admin: true });
  assert.equal(r.status, 200, JSON.stringify(r.body && r.body.error));
  assert.ok(r.body.keys > 0);
  assert.ok(r.body.groups.length >= 3);
  /* book + registry + img phải có mặt */
  const names = r.body.groups.map((g) => g.prefix).join(',');
  assert.ok(names.includes('book'), names);
  assert.ok(names.includes('registry'), names);
  assert.ok(names.includes('img'), names);
  const bookG = r.body.groups.find((g) => g.prefix === 'book');
  assert.ok(bookG && bookG.keys >= 2 && bookG.bytes > 0, JSON.stringify(bookG));
});

/* ============================ 4. CHUẨN HOÁ REGISTRY ========================= */
await t('PUT /api/registry tự bóc trường cũ postId/count/canRead', async () => {
  const reg = { rev: 't2', lib: [{ title: 'X', slug: 'x-cua-toi', author: '', status: 'Đang cập nhật', chapters: 1, count: '1/1', canRead: true, postId: '998877' }] };
  const r = await call('PUT', '/api/registry', { admin: true, body: reg });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const stored = JSON.parse(kv.m.get('registry').value);
  const n = stored.lib.find((x) => x.slug === 'x-cua-toi');
  assert.ok(!('postId' in n) && !('count' in n) && !('canRead' in n), JSON.stringify(n));
});

const out = { tongSo: pass + fails.length, dat: pass, loi: fails, errors0: fails };
console.log(JSON.stringify(out, null, ' '));
process.exit(fails.length ? 1 : 0);
