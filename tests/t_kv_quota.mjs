/* ============================================================================
   t_kv_quota.mjs · HẠN MỨC KV: NHỊP GHI + BỘ ĐẾM CHỐNG SPAM KHÔNG ĐỐT QUOTA
   ----------------------------------------------------------------------------
   Vì sao có bài này: Cloudflare gửi thư cảnh báo tài khoản đã dùng 90% hạn mức
   MIỄN PHÍ của Workers KV (1.000 lượt GHI + 1.000 lượt LIST mỗi ngày). Bản cũ
   ghi khoá `stats` mỗi 10 giây bất kể có ai xem hay không — riêng một khoá đã
   8.640 lượt/ngày. Bài này khoá lại các con số đã sửa:
     A. công thức chia nhịp (src/shared/kv-budget.js) — kể cả bản cũ phải tốn
        hàng nghìn lượt/ngày, bản mới nằm dưới trần;
     B. chạy THẬT worker/cms.js: 500 người xem liên tiếp / 60 lượt bình luận
        liên tiếp của cùng một người → số lượt GHI KV phải rất nhỏ;
     C. /api/stats dùng lại bản đánh giá trong RAM → không LIST mỗi lần gọi.
   Chạy:  node tests/t_kv_quota.mjs
   Điều kiện đạt: mọi khoá "errors*" là [] và thoát mã 0.
   ========================================================================== */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(path.join(ROOT, 'worker', 'cms.js'))).default;
const budgetMod = await import(path.join(ROOT, 'src', 'shared', 'kv-budget.js'));

/* ---------------------------- KV giả (đếm thao tác) ------------------------ */
const DAY_SECONDS = 86400;
class FakeKV {
  constructor() { this.m = new Map(); this.writes = 0; this.reads = 0; this.lists = 0; this.deletes = 0; }
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
  async delete(k) { this.deletes++; this.m.delete(k); }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    this.lists++;
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? all.indexOf(cursor) + 1 : 0;
    const keys = all.slice(start, start + limit).map((name) => ({ name, metadata: (this.m.get(name) || {}).metadata }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : all[start + limit - 1] };
  }
}

const kv = new FakeKV();
const ADMIN = 'khoa-quan-tri-dai-cho-du-24-ky-tu';
const env = {
  ADMIN_KEY: ADMIN, CZ_KV: kv, BLOG: 'https://chuseoz.blogspot.com', ALLOW_ORIGIN: 'https://web.test',
  SESSION_SECRET: 'session-secret-dai-hon-32-ky-tu-cho-chac',
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(Promise.resolve(p)) };
async function call(method, p, { body, headers = {}, e = env } = {}, useCtx = ctx) {
  const h = Object.assign({ origin: 'https://web.test' }, headers);
  if (body !== undefined && typeof body !== 'string') h['content-type'] = 'application/json';
  const req = new Request('https://cms.test' + p, {
    method, headers: h,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  let res;
  try { res = await worker.fetch(req, e, useCtx); }
  catch (err) { await Promise.all(waits.splice(0)); return { status: 500, body: { error: String(err.message) }, headers: new Headers() }; }
  if (useCtx === ctx) await Promise.all(waits.splice(0));
  const txt = await res.text();
  let j = null; try { j = JSON.parse(txt); } catch (err) { j = null; }
  return { status: res.status, body: j, headers: res.headers };
}

const checks = [];
const ck = (name, ok, got, want) => checks.push({ name, ok: !!ok, got, want });
const eq = (name, got, want) => ck(name, JSON.stringify(got) === JSON.stringify(want), got, want);
const errors = [];

(async () => {
  /* ---------- A. công thức chia nhịp (src/shared/kv-budget.js) ---------- */
  {
    const b = budgetMod;
    eq('nhịp/mặc định: 240 lượt ghi + 3 lượt cho phép vượt', [b.statsBudget({}), b.dayFlushCeiling({})], [240, 243]);
    ck('nhịp/bản CŨ (ghi mỗi 10 giây, không ai xem) vượt trần',
      Math.round(DAY_SECONDS / 10) > b.KV_FLUSH.budget, Math.round(DAY_SECONDS / 10), '< 240');
    /* web đông: đệm đủ `events` thay đổi là ghi ngay, không chờ hạn mức */
    eq('nhịp/đệm đủ 25 thay đổi → ghi ngay', b.flushOnTimer({ ops: 25, heldMs: 0, used: 0, credits: 0 }), true);
    /* đầu ngày: còn “tem” dự trữ (slack) nên vài lượt lẻ vẫn được ghi ngay */
    eq('nhịp/đầu ngày: vài lượt lẻ vẫn ghi được (có dự trữ)', b.flushOnTimer({ ops: 1, heldMs: 1000, used: 0, credits: 0 }), true);
    /* đã tiêu hết cả phần dự trữ → 1 lượt lẻ phải NẰM CHỜ trong RAM */
    eq('nhịp/hết dự trữ, 1 lượt lẻ → chờ trong RAM', b.flushOnTimer({ ops: 1, heldMs: 1000, used: b.KV_FLUSH.slack, credits: 0 }), false);
    /* giữa ngày với ngân sách 240: 12:00 UTC → tem 120 → ghi được */
    const noon = Date.UTC(2026, 8, 23, 12, 0, 0);
    eq('nhịp/giữa ngày: tem cho phép ghi', b.flushOnTimer({ ops: 1, heldMs: 1000, used: 0, credits: b.budgetCredits({}, noon) }), true);
    /* cuối ngày mà đã xài hết tem → nằm chờ, trừ khi giữ quá 10 phút */
    eq('nhịp/hết ngân sách + chưa gấp → chờ', b.flushOnTimer({ ops: 1, heldMs: 60000, used: 240, credits: 0 }), false);
    eq('nhịp/giữ 10 phút → ghi cho khỏi mất số', b.flushOnTimer({ ops: 1, heldMs: b.KV_FLUSH.holdMs, used: 240, credits: 0 }), true);
    eq('nhịp/đêm UTC: tem chia theo giờ', Math.round(b.budgetCredits({}, Date.UTC(2026, 8, 23, 6, 0, 0))), 60);
    ck('nhịp/giây tới mốc reset nằm trong ngày', b.secondsToUtcMidnight(Date.UTC(2026, 8, 23, 23, 0, 0)) === 3600,
      b.secondsToUtcMidnight(Date.UTC(2026, 8, 23, 23, 0, 0)), 3600);
    /* một ngày bình thường (chỉ ghi theo nhịp) không vượt trần */
    const perDay = 86400 / b.KV_FLUSH.timerMs;
    ck('nhịp/cả ngày theo nhịp ≤ trần', perDay <= b.dayFlushCeiling({}), perDay, '≤ 243');
  }

  /* ---------- B. chống spam trong RAM: 500 lượt xem, 60 lượt bình luận ----------
     Dùng ctx KHÔNG chờ (đúng như Cloudflare: hẹn giờ ghi chạy nền) để đo đúng
     phần ghi đồng bộ — bản cũ tốn 1 đọc + 1 ghi KV cho MỖI lượt xem (1.000
     lượt là hết sạch hạn mức ngày), bản mới chỉ ghi khi đệm đủ 25 thay đổi. */
  {
    kv.writes = 0; kv.reads = 0; kv.lists = 0;
    const before = kv.writes;
    const ctxNoWait = { waitUntil: () => {} };
    let counted = 0;
    for (let i = 0; i < 500; i++) {
      const r = await call('POST', '/api/view', { body: { slug: 'quota-truyen', vid: 'may-' + i } }, ctxNoWait);
      if (r.body && r.body.counted) counted++;
    }
    ck('xem/500 lượt khác máy đều được đếm', counted === 500, counted, 500);
    /* 500 lượt → đệm đầy 20 lần (mỗi lần 25 thay đổi) = 20 lượt ghi + vài lượt
       cho bộ đếm IP. Bản cũ: 500 lượt GHI + 500 lượt ĐỌC cho riêng việc này. */
    ck('xem/500 lượt chỉ tốn ≤25 lượt ghi KV', kv.writes - before <= 25, kv.writes - before, '≤ 25');
    ck('xem/bộ đếm IP nằm trong RAM (đọc KV ≤ 30 lượt)', kv.reads <= 30, kv.reads, '≤ 30');
  }
  {
    /* bình luận: cùng một người, hạn mức 2 lượt/10 phút cho khách → bị chặn
       trong RAM, KHÔNG tốn thêm lượt ghi nào cho các lần bị chặn */
    kv.writes = 0;
    const codes = [];
    for (let i = 0; i < 60; i++) {
      const r = await call('POST', '/api/comments/quota-truyen', { body: { text: 'bình luận thử ' + i, vid: 'may-cmt' } });
      codes.push(r.status);
    }
    ck('bình luận/chặn spam vẫn hoạt động', codes.includes(429), codes.slice(0, 6), 'có 429');
    ck('bình luận/60 lần gửi không đốt lượt ghi', kv.writes <= 8, kv.writes, '≤ 8');
  }
  {
    /* bình chọn: 60 lượt bầu của cùng một máy (hạn mức 400/giờ) — số lượt ghi
       chỉ còn 1 lượt cho bộ đếm ở lượt đầu + ghi số liệu khi phiếu đổi */
    kv.writes = 0; kv.reads = 0;
    const r0 = await call('POST', '/api/vote', { body: { slug: 'quota-truyen', vote: 1, vid: 'may-vote' } });
    const r1 = await call('POST', '/api/vote', { body: { slug: 'quota-truyen', vote: 1, vid: 'may-vote' } });
    ck('bầu/phiếu đầu ghi số liệu', !!(r0.body && r0.body.changed), r0.body && r0.body.changed, true);
    ck('bầu/bầu lại không đổi → không ghi thêm', !!(r1.body && r1.body.changed === false), r1.body && r1.body.changed, false);
    ck('bầu/2 lượt chỉ tốn ≤4 lượt ghi KV', kv.writes <= 4, kv.writes, '≤ 4');
  }

  /* ---------- C. /api/stats: đánh giá gộp 1 khoá, bản RAM 60 giây ---------- */
  {
    /* C1. dữ liệu CŨ (mỗi bộ một khoá `rateagg:<slug>`) phải được gộp về 1 khoá,
       chỉ tốn ĐÚNG một lượt LIST — sau đó không bao giờ LIST nữa. */
    kv.m.set('rateagg:legacy-a', { value: JSON.stringify({ sum: 5, n: 1 }), metadata: null });
    kv.m.set('rateagg:legacy-b', { value: JSON.stringify({ sum: 8, n: 2 }), metadata: null });
    kv.lists = 0; kv.reads = 0;
    const s0 = await call('GET', '/api/stats');
    const it0 = (s0.body || {}).items || {};
    eq('gộp khoá cũ/điểm bộ A giữ nguyên', [(it0['legacy-a'] || {}).rating, (it0['legacy-a'] || {}).ratingCount], [5, 1]);
    eq('gộp khoá cũ/điểm bộ B giữ nguyên', [(it0['legacy-b'] || {}).rating, (it0['legacy-b'] || {}).ratingCount], [4, 2]);
    eq('gộp khoá cũ/chỉ 1 lượt LIST cho cả lần gộp', kv.lists, 1);
    const blob = JSON.parse((kv.m.get('rateagg') || {}).value || '{}');
    eq('gộp khoá cũ/đánh dấu đã gộp (m:1)', [blob.v, blob.m], [1, 1]);
    const listsAfter = kv.lists;
    const readsAfter = kv.reads;
    for (let i = 0; i < 5; i++) await call('GET', '/api/stats');
    ck('stats/5 lần đọc không LIST thêm', kv.lists === listsAfter, kv.lists - listsAfter, 0);
    ck('stats/bản RAM 60 giây: mỗi lần đọc chỉ tốn 1 lượt đọc KV (khoá `stats`)',
      kv.reads - readsAfter <= 5, kv.reads - readsAfter, '≤ 5');

    /* C2. chấm điểm mới: ghi 1 khoá duy nhất, không LIST, không khoá lẻ */
    kv.writes = 0; kv.lists = 0;
    const r1 = await call('POST', '/api/rate', { body: { slug: 'quota-truyen', rating: 4, vid: 'may-rate' } });
    eq('đánh giá/nhận điểm', [r1.status, r1.body && r1.body.rating, r1.body && r1.body.ratingCount], [200, 4, 1]);
    eq('đánh giá/không LIST lượt nào', kv.lists, 0);
    ck('đánh giá/≤ 4 lượt ghi (khoá điểm + khoá tổng + bộ đếm) — bản cũ tốn 6', kv.writes <= 4, kv.writes, '≤ 4');
    /* khoá rateagg:<slug> của bản CŨ vẫn nằm đó nhưng KHÔNG ai đọc nữa (đã gộp
       vào `rateagg`); chấm điểm mới tuyệt đối không sinh thêm khoá lẻ nào */
    eq('đánh giá/không sinh khoá rateagg:<slug> mới', [...kv.m.keys()].filter((k) => k === 'rateagg:quota-truyen').length, 0);
    const s = await call('GET', '/api/stats');
    const it = ((s.body || {}).items || {})['quota-truyen'] || {};
    eq('stats/vẫn trả đủ điểm + lượt', [it.rating, it.ratingCount], [4, 1]);
  }

  /* ---------- D. thông tin hạn mức cho trang quản trị ---------- */
  {
    const h = await call('GET', '/api/health');
    const st = (h.body || {}).stats || {};
    ck('health/có số lượt ghi khoá stats hôm nay', typeof st.writesToday === 'number', st.writesToday, 'number');
    eq('health/có trần ngân sách', st.writeBudget, 240);
    ck('health/không còn khoá _last', kv.m.has('_last') === false, [...kv.m.keys()].includes('_last'), false);
    ck('health/mốc ghi lấy từ metadata registry', typeof (h.body || {}).lastWrite === 'string', (h.body || {}).lastWrite, 'string');
  }

  const out = {
    tongSo: checks.length,
    dat: checks.filter((c) => c.ok).length,
    chiTiet: checks.map((c) => (c.ok ? '✓ ' : '✗ ') + c.name + (c.ok ? '' : '  (nhận: ' + JSON.stringify(c.got) + ', cần: ' + JSON.stringify(c.want) + ')')),
    errors: errors.concat(checks.filter((c) => !c.ok).map((c) => c.name)),
  };
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.errors.length ? 1 : 0);
})();
