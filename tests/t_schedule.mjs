/* ============================================================================
   t_schedule.mjs · HẸN GIỜ ĐĂNG CHƯƠNG + LƯU 1 CHƯƠNG + TIẾT KIỆM DUNG LƯỢNG ẢNH
   ----------------------------------------------------------------------------
   Chạy THẬT worker/cms.js trên KV giả:
     · PUT /api/book/<slug>/chapter  — lưu/xoá/đổi thứ tự MỘT chương (nút Lưu chương)
     · chương hẹn giờ tương lai KHÔNG lọt ra /api/book công khai, /feed.xml, số chương
     · cron publishDueChapters: tới mốc thì cập nhật registry + đánh dấu notified
     · POST /api/img: ID theo nội dung → upload lại cùng ảnh không ghi thêm bản sao;
       ảnh chương đi Supabase Storage bucket `images`, Storage chết thì rơi về KV
   Chạy:  node tests/t_schedule.mjs
   Điều kiện đạt: mọi khoá "errors*" là [] và thoát mã 0.
   ========================================================================== */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(path.join(ROOT, 'worker', 'cms.js'))).default;

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
class FakeCache {
  constructor() { this.store = new Map(); }
  async match() { return undefined; }
  async put() {}
  async delete() { return true; }
  async keys() { return []; }
}

let routes = () => null;
const net = [];
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

const kv = new FakeKV();
const ADMIN = 'khoa-quan-tri-dai-cho-du-24-ky-tu';
const ADMH = { 'x-admin-key': ADMIN };
const env = {
  ADMIN_KEY: ADMIN, CZ_KV: kv, BLOG: 'https://chuseoz.blogspot.com', ALLOW_ORIGIN: 'https://web.test',
  SITE_BASE: 'https://ssochuz.pages.dev',
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
  try { res = await worker.fetch(req, e, ctx); }
  catch (err) {
    await Promise.all(waits.splice(0));
    return { status: 500, ok: false, body: { ok: false, error: 'worker ném lỗi: ' + err.message }, headers: new Headers() };
  }
  await Promise.all(waits.splice(0));
  const txt = await res.text();
  let j = null; try { j = JSON.parse(txt); } catch (err) { j = null; }
  return { status: res.status, ok: res.ok, body: j, text: txt, headers: res.headers };
}

const checks = [];
const ck = (name, ok, got, want) => checks.push({ name, ok: !!ok, got, want });
const eq = (name, got, want) => ck(name, JSON.stringify(got) === JSON.stringify(want), got, want);

const H = (h) => new Date(Date.now() + h * 3600000).toISOString();
const b64 = Buffer.from('524946462400000057454550565038201c000000080000003001000024000000ff00000000', 'hex').toString('base64');

(async () => {
  /* ---------- 0. dựng registry + 1 bộ 1 chương ---------- */
  await kv.put('registry', JSON.stringify({
    rev: 'sched', lib: [{ slug: 'hb', title: 'Hẹn Giờ', chapters: 1, countLabel: '1/1', updated: '2026-09-20' }],
  }));
  await kv.put('book:hb', JSON.stringify({ title: 'Hẹn Giờ', slug: 'hb', chapters: [{ t: 'Chương 1', html: '<p>nội dung một</p>' }] }));

  /* ---------- 1. quyền + dữ liệu vào ---------- */
  eq('chapter/thiếu khoá → 401', (await call('PUT', '/api/book/hb/chapter', { body: { index: 0, chapter: { t: 'x' } } })).status, 401);
  eq('chapter/bộ không có → 404', (await call('PUT', '/api/book/khong-co/chapter', { headers: ADMH, body: { index: 0, chapter: { t: 'x', html: '<p>x</p>' } } })).status, 404);
  eq('chapter/vị trí sai → 400', (await call('PUT', '/api/book/hb/chapter', { headers: ADMH, body: { index: 99, chapter: { t: 'x', html: '<p>x</p>' } } })).status, 400);
  eq('chapter/chương rỗng → 400', (await call('PUT', '/api/book/hb/chapter', { headers: ADMH, body: { index: 1, chapter: { t: '  ', html: '<p></p>' } } })).status, 400);

  /* ---------- 2. thêm chương HẸN GIỜ ở tương lai ---------- */
  const at = H(2);
  const add = await call('PUT', '/api/book/hb/chapter', {
    headers: ADMH, body: { index: 1, chapter: { t: 'Chương 2', html: '<p>chưa tới giờ</p>', status: 'scheduled', at } },
  });
  eq('hẹn giờ/thêm chương → 200', add.status, 200);
  eq('hẹn giờ/action append', add.body && add.body.action, 'append');
  eq('hẹn giờ/tổng chương (kể cả chờ)', add.body && add.body.chapters, 2);
  eq('hẹn giờ/số chương ĐANG HIỆN', add.body && add.body.live, 1);
  eq('hẹn giờ/số chương đang chờ', add.body && add.body.pending, 1);
  eq('hẹn giờ/registry ghi schedNext', (await kv.get('registry', { type: 'json' })).lib[0].schedNext, at);

  const pub = await call('GET', '/api/book/hb');
  eq('hẹn giờ/công khai chỉ thấy chương đã tới giờ', pub.body && pub.body.chapters.length, 1);
  eq('hẹn giờ/công khai báo số chương đang chờ', pub.body && pub.body.pendingChapters, 1);
  const adm = await call('GET', '/api/book/hb', { headers: ADMH });
  eq('hẹn giờ/admin vẫn thấy đủ 2 chương', adm.body && adm.body.chapters.length, 2);
  const regAfter = (await kv.get('registry', { type: 'json' })).lib[0];
  eq('hẹn giờ/registry: chapters = số đang hiện', regAfter.chapters, 1);
  eq('hẹn giờ/registry: nhãn đếm gồm cả chương chờ', regAfter.countLabel, '1/2');

  /* RSS không được lộ chương chưa tới giờ */
  const feed = await call('GET', '/feed.xml?slug=hb');
  eq('hẹn giờ/RSS chỉ có 1 chương', (feed.text.match(/<item>/g) || []).length, 1);

  /* ---------- 3. chương ẨN + hẹn giờ đã qua + hẹn giờ thiếu mốc ---------- */
  await call('PUT', '/api/book/hb/chapter', { headers: ADMH, body: { index: 2, chapter: { t: 'Chương 3', html: '<p>ẩn</p>', status: 'hidden' } } });
  eq('ẩn/chương hidden không ra công khai', (await call('GET', '/api/book/hb')).body.chapters.length, 1);

  await call('PUT', '/api/book/hb/chapter', { headers: ADMH, body: { index: 3, chapter: { t: 'Chương 4', html: '<p>đã qua giờ</p>', status: 'scheduled', at: H(-1) } } });
  eq('hẹn giờ/mốc đã qua → hiện ngay', (await call('GET', '/api/book/hb')).body.chapters.length, 2);

  await call('PUT', '/api/book/hb/chapter', { headers: ADMH, body: { index: 4, chapter: { t: 'Chương 5', html: '<p>chọn hẹn giờ mà quên điền giờ</p>', status: 'scheduled', at: '' } } });
  const legacy = await call('GET', '/api/book/hb');
  ck('hẹn giờ/thiếu mốc giờ KHÔNG ẩn mất chương (dữ liệu cũ)', legacy.body.chapters.length === 3, legacy.body.chapters.length, 3);

  /* ---------- 4. xoá + đổi thứ tự bằng đường 1 chương ---------- */
  const del = await call('PUT', '/api/book/hb/chapter', { headers: ADMH, body: { index: 4, remove: true } });
  eq('chapter/xoá → action delete', del.body && del.body.action, 'delete');
  eq('chapter/xoá → còn 4 chương', del.body && del.body.chapters, 4);
  const mv = await call('PUT', '/api/book/hb/chapter', { headers: ADMH, body: { from: 3, to: 1 } });
  eq('chapter/đổi thứ tự → action move', mv.body && mv.body.action, 'move');
  const afterMove = JSON.parse((await kv.get('book:hb')) || '{}');
  eq('chapter/đổi thứ tự đúng vị trí', afterMove.chapters[1].t, 'Chương 4');

  /* ---------- 5. cron: tới mốc thì tự cập nhật registry + báo đẩy ---------- */
  {
    /* giả lập đã tới mốc: chương hẹn giờ nằm cuối bộ, registry còn ghi pending */
    const past = new Date(Date.now() - 60000).toISOString();
    await kv.put('book:hb', JSON.stringify({
      title: 'Hẹn Giờ', slug: 'hb',
      chapters: [
        { t: 'Chương 1', html: '<p>một</p>' },
        { t: 'Chương 2', html: '<p>hai</p>', status: 'scheduled', at: past },
      ],
    }));
    const reg = await kv.get('registry', { type: 'json' });
    reg.lib[0].chapters = 1; reg.lib[0].countLabel = '1/2'; reg.lib[0].pending = 1; reg.lib[0].schedNext = past;
    await kv.put('registry', JSON.stringify(reg));
    await worker.scheduled({}, env, ctx);
    await Promise.all(waits.splice(0));      /* cron chạy trong waitUntil — phải đợi */
    const r2 = (await kv.get('registry', { type: 'json' })).lib[0];
    eq('cron/hết chờ → chapters = 2', r2.chapters, 2);
    ck('cron/hết chờ → xoá pending/schedNext', !r2.pending && !r2.schedNext, { pending: r2.pending, schedNext: r2.schedNext }, 'không còn');
    const b2 = JSON.parse((await kv.get('book:hb')) || '{}');
    eq('cron/chương đã lên sóng được đánh dấu notified', !!(b2.chapters[1] && b2.chapters[1].notified), true);
    eq('cron/công khai thấy đủ 2 chương', (await call('GET', '/api/book/hb')).body.chapters.length, 2);
    eq('cron/không cần VAPID vẫn chạy', net.filter((u) => /push\.test/.test(u)).length, 0);
  }

  /* ---------- 6. ảnh: ID theo nội dung → không ghi bản sao thứ hai ---------- */
  {
    const id = 'h' + 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const first = await call('POST', '/api/img', { headers: ADMH, body: { data: b64, type: 'image/webp', id } });
    eq('ảnh id/ lần đầu ghi mới', [!!first.body.ok, first.body.id, first.body.dedupe], [true, id, false]);
    const writesAfterFirst = [...kv.m.keys()].filter((k) => k === 'img:' + id).length;
    const second = await call('POST', '/api/img', { headers: ADMH, body: { data: b64, type: 'image/webp', id } });
    eq('ảnh id/ lần hai dùng lại URL cũ', [!!second.body.ok, second.body.dedupe, second.body.url === first.body.url], [true, true, true]);
    eq('ảnh id/chỉ có 1 khoá trong KV', [...kv.m.keys()].filter((k) => k === 'img:' + id).length, writesAfterFirst);
    const bad = await call('POST', '/api/img', { headers: ADMH, body: { data: b64, type: 'image/webp', id: 'x' } });
    ck('ảnh id/ id rác thì tự sinh id mới', !!bad.body.ok && /^[a-z0-9-]{12,64}$/.test(bad.body.id) && bad.body.id !== 'x', bad.body.id, 'id hợp lệ');
  }

  /* ---------- 7. ảnh chương (không kind) → Storage bucket `images` ---------- */
  {
    const envSb = Object.assign({}, env, { SUPABASE_URL: 'https://sbstor.test', SUPABASE_SERVICE_ROLE: 'service-role-test' });
    const calls = [];
    routes = (u) => {
      const url = String(u);
      calls.push(url);
      if (url.includes('/storage/v1/object/images/')) return { status: 200, body: { Key: 'images/x' } };
      if (url.includes('/storage/v1/bucket')) return { status: 200, body: { name: 'images' } };
      return { status: 404, body: '' };
    };
    const up = await call('POST', '/api/img', { e: envSb, headers: ADMH, body: { data: b64, type: 'image/webp', kind: 'chapter' } });
    ck('ảnh chương/Storage images → URL public',
      !!(up.body && up.body.ok && /\/storage\/v1\/object\/public\/images\//.test(up.body.url)), up.body && up.body.url, '…/public/images/…');
    eq('ảnh chương/overflow supabase-storage', up.body && up.body.overflow, 'supabase-storage');
    ck('ảnh chương/POST đúng bucket images', calls.some((u) => /\/storage\/v1\/object\/images\//.test(u)), calls, 'POST images/');
    const stub = (kv.m.get('img:' + up.body.id) || {}).value || '';
    ck('ảnh chương/KV chỉ stub nhỏ', stub.charAt(0) === '{' && stub.length < 800, stub.slice(0, 120), 'JSON stub');
    const g = await call('GET', '/api/img/' + up.body.id, { e: envSb });
    eq('ảnh chương/GET → 302 ra Storage', [g.status, /\/public\/images\//.test(g.headers.get('location') || '')], [302, true]);

    /* Storage chết → RƠI VỀ đường cũ (KV base64), không làm hỏng upload */
    routes = (u) => (String(u).includes('/storage/v1/') ? { status: 500, body: 'boom' } : { status: 404, body: '' });
    const fb = await call('POST', '/api/img', { e: envSb, headers: ADMH, body: { data: b64, type: 'image/webp', kind: 'chapter' } });
    ck('ảnh chương/Storage lỗi → vẫn lưu được (fallback)', !!(fb.body && fb.body.ok && /^\/api\/img\//.test(fb.body.url)), fb.body, '/api/img/…');
    eq('ảnh chương/fallback giữ base64 trong KV', (kv.m.get('img:' + fb.body.id) || {}).value, b64);
    routes = () => null;
  }

  const bad = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({
    tongSo: checks.length,
    dat: checks.length - bad.length,
    loi: bad.map((c) => c.name + ' (nhận: ' + JSON.stringify(c.got) + ', cần: ' + JSON.stringify(c.want) + ')'),
    errors0: bad.map((c) => c.name),
  }, null, 1));
  console.log(bad.length ? 'CÒN ' + bad.length + ' LỖI HẸN GIỜ/ẢNH' : 'Hẹn giờ + ảnh đạt hết ' + checks.length + ' kiểm tra');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.log(JSON.stringify({ errors0: ['ngoại lệ khi chạy: ' + (e && e.stack || e)] }, null, 1));
  process.exit(1);
});
