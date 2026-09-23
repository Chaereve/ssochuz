/* ============================================================================
   Kiểm thử CHẶN GHI ĐÈ MẤT DỮ LIỆU (23/09) — chạy THẬT worker/cms.js (KV giả):
   · PUT registry rỗng đè lên kho đang có sách → 400, kho còn nguyên
   · PUT rỗng kèm force:true (xoá bộ cuối đã gõ slug) → ok, KV không lưu force
   · PUT rỗng lên KV đang trống (seed lần đầu) → ok
   Chạy:  node tests/t_registry_guard.mjs
   ========================================================================== */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(path.join(ROOT, 'worker', 'cms.js'))).default;

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
  async list({ prefix = '', limit = 1000 } = {}) {
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    return { keys: all.slice(0, limit).map((name) => ({ name })), list_complete: true };
  }
}
const kv = new FakeKV();
const ADMIN = 'khoa-quan-tri-dai-cho-du-24-ky-tu';
const env = { ADMIN_KEY: ADMIN, CZ_KV: kv };
const ctx = { waitUntil() {} };
async function call(method, p, { body, headers = {} } = {}) {
  const h = Object.assign({ origin: 'https://web.test' }, headers);
  if (body !== undefined && typeof body !== 'string') h['content-type'] = 'application/json';
  const req = new Request('https://cms.test' + p, {
    method, headers: h,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const res = await worker.fetch(req, env, ctx);
  const txt = await res.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
  return { status: res.status, body: j };
}
const ADMH = { 'x-admin-key': ADMIN };
const fails = [];
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + ' (nhận: ' + JSON.stringify(g) + ')'); if (!ok) fails.push(n); };

/* 1. gieo kho: PUT bản 2 bộ lên KV trống -> ok */
let r = await call('PUT', '/api/registry', { body: { rev: 't1', lib: [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }] }, headers: ADMH });
eq('seed 2 bộ -> ok', r.body && r.body.ok, true);

/* 2. PUT bản RỖNG đè lên kho 2 bộ -> 400 + kho còn nguyên */
r = await call('PUT', '/api/registry', { body: { rev: 't2', lib: [] }, headers: ADMH });
eq('PUT rỗng -> 400', r.status, 400);
const cur = await kv.get('registry', { type: 'json' });
eq('kho còn nguyên 2 bộ', cur && cur.lib && cur.lib.length, 2);

/* 3. PUT rỗng kèm force:true (xoá bộ cuối đã xác nhận) -> ok */
r = await call('PUT', '/api/registry', { body: { rev: 't3', lib: [], force: true }, headers: ADMH });
eq('PUT rỗng + force -> ok', r.body && r.body.ok, true);
const cur2 = await kv.get('registry', { type: 'json' });
eq('kho đã rỗng', cur2 && cur2.lib && cur2.lib.length, 0);
eq('KV không lưu trường force', cur2 && cur2.force, undefined);

/* 4. PUT rỗng lên KV đang trống (seed lần đầu kiểu rỗng) -> ok */
await kv.delete('registry');
r = await call('PUT', '/api/registry', { body: { rev: 't4', lib: [] }, headers: ADMH });
eq('PUT rỗng lên KV trống -> ok', r.body && r.body.ok, true);

/* 5. GET public sau khi rỗng -> lib [] (frontend sẽ rớt về tĩnh) */
r = await call('GET', '/api/registry');
eq('GET public lib rỗng', r.body && r.body.lib, []);

/* 6. PUT thiếu khoá -> 401 (không đổi) */
r = await call('PUT', '/api/registry', { body: { rev: 'x', lib: [] } });
eq('PUT thiếu khoá -> 401', r.status, 401);

console.log(fails.length ? 'CÒN ' + fails.length + ' LỖI REGISTRY-GUARD: ' + fails.join(' | ') : 'registry-guard đạt hết');
process.exit(fails.length ? 1 : 0);
