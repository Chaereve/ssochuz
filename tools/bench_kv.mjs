/* ============================================================================
   bench_kv.mjs · ĐO SỐ THAO TÁC KV CỦA WORKER (dùng cho việc tiết kiệm hạn mức)
   ----------------------------------------------------------------------------
   Chạy THẬT worker/cms.js trên một KV giả có đếm thao tác, mô phỏng một buổi
   web có khách rồi in ra số lượt GHI / ĐỌC / LIST / XOÁ theo từng nhóm việc.

     · bản mới (bản đang làm việc):  node tools/bench_kv.mjs .                       ,
     · bản CŨ để so sánh:            git archive HEAD | tar -x -C /tmp/oldrepo
                                     node tools/bench_kv.mjs /tmp/oldrepo --flushms=1
     · số lượt xem mô phỏng:         BENCH_VIEWS=50 node tools/bench_kv.mjs .

   --flushms=1 chỉ dùng cho bản CŨ: ép nó ghi khoá `stats` ngay mỗi lượt xem để
   đo đúng chi phí lúc web đang có người đọc (bản mới không cần cờ này).
   Kết quả đã đo (23/09, cùng một kịch bản 250 lượt xem + 40 phiếu + 15 đánh giá
   + 20 bình luận + 100 lần đọc bình luận + 60 lần đọc /api/stats):
     bản CŨ: 484 ghi / 674 đọc / 60 list
     bản mới: 137 ghi / 361 đọc /  1 list
   ========================================================================== */
const ROOT = (process.argv[2] || new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const worker = (await import(ROOT + '/worker/cms.js')).default;
/* bản CŨ ghi `stats` mỗi 10 giây; muốn mô phỏng trọn một ngày thì phải tua
   đồng hồ — ở đây đo số thao tác cho 1.800 lượt xem thật, rồi suy ra cả ngày. */

class KV {
  constructor() { this.m = new Map(); this.w = 0; this.r = 0; this.l = 0; this.d = 0; }
  async get(k, o) {
    this.r++; const v = this.m.get(k); if (v === undefined) return null;
    if (o && o.type === 'json') { try { return JSON.parse(v.value); } catch (e) { return null; } }
    return v.value;
  }
  async getWithMetadata(k, o) {
    this.r++; const v = this.m.get(k); if (v === undefined) return { value: null, metadata: null };
    return { value: o && o.type === 'json' ? JSON.parse(v.value) : v.value, metadata: v.metadata || null };
  }
  async put(k, v, o) { this.w++; this.m.set(k, { value: String(v), metadata: (o && o.metadata) || null }); }
  async delete(k) { this.d++; this.m.delete(k); }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    this.l++;
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    const s = cursor ? all.indexOf(cursor) + 1 : 0;
    const keys = all.slice(s, s + limit).map((name) => ({ name, metadata: (this.m.get(name) || {}).metadata }));
    const done = s + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : all[s + limit - 1] };
  }
}

const kv = new KV();
const env = { ADMIN_KEY: 'k'.repeat(30), CZ_KV: kv, ALLOW_ORIGIN: '*' };
/* bản CŨ: ghi `stats` mỗi 10 giây (FLUSH_MS). Truyền --flushms=1 để bắt nó ghi
   ngay mỗi lượt xem, đo ĐÚNG chi phí của nó trong lúc web có người đọc. */
const fm = (process.argv.find((a) => a.startsWith('--flushms=')) || '').split('=')[1];
if (fm) env.STATS_FLUSH_MS = fm;
const waits = []; const ctx = { waitUntil: (p) => waits.push(Promise.resolve(p)) };
const nowait = { waitUntil: () => {} };   /* Cloudflare: hẹn giờ ghi chạy nền, không giữ request */
async function call(m, p, body, headers, useCtx) {
  const h = Object.assign({ origin: 'https://web.test' }, headers || {});
  if (body !== undefined) h['content-type'] = 'application/json';
  const req = new Request('https://cms.test' + p, { method: m, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await worker.fetch(req, env, useCtx || ctx);
  if (!useCtx) await Promise.all(waits.splice(0));
  return res;
}

/* dữ liệu nền: 60 bộ + registry */
const lib = [];
for (let i = 0; i < 60; i++) lib.push({ title: 'Bộ ' + i, slug: 'bo-' + i, chapters: 20, countLabel: '20/20', updated: '2026-09-20' });
kv.m.set('registry', { value: JSON.stringify({ rev: '2026-09-23 10:00', lib }), metadata: { saved: new Date().toISOString() } });
for (let i = 0; i < 60; i++) kv.m.set('book:bo-' + i, { value: JSON.stringify({ title: 'Bộ ' + i, slug: 'bo-' + i, chapters: Array.from({ length: 20 }, (_, k) => ({ t: 'Chương ' + (k + 1), html: '<p>chữ</p>' })) }), metadata: {} });

const snap = () => ({ w: kv.w, r: kv.r, l: kv.l, d: kv.d });
const diff = (a, b) => ({ ghi: b.w - a.w, doc: b.r - a.r, list: b.l - a.l, xoa: b.d - a.d });
const stages = {};
let s;

/* 1) 120 người đọc × 5 lượt xem = 600 lượt xem */
s = snap();
const V_LOOP = Number(process.env.BENCH_VIEWS || 120);
for (let v = 0; v < V_LOOP; v++) {
  const ip = '203.0.113.' + (v % 250);
  for (let k = 0; k < 5; k++) await call('POST', '/api/view', { slug: 'bo-' + (k % 12), vid: 'may-' + v + '-' + k }, { 'cf-connecting-ip': ip }, nowait);
  if (v % 30 === 0) process.stderr.write('  … đã mô phỏng ' + (v * 5) + '/' + (V_LOOP * 5) + ' lượt xem\n');
}
stages['lượt xem (' + (V_LOOP * 5) + ' lượt, ' + V_LOOP + ' người đọc × 5 bộ)'] = diff(s, snap());

/* 2) 200 lượt đọc /api/stats */
s = snap();
for (let i = 0; i < 60; i++) await call('GET', '/api/stats');
stages['60 lần đọc /api/stats'] = diff(s, snap());

/* 3) 40 phiếu bầu + 15 lượt đánh giá sao */
s = snap();
for (let i = 0; i < 40; i++) await call('POST', '/api/vote', { slug: 'bo-' + (i % 12), vote: 1, vid: 'may-vote-' + (i % 20) });
for (let i = 0; i < 15; i++) await call('POST', '/api/rate', { slug: 'bo-' + (i % 12), rating: (i % 5) + 1, vid: 'may-rate-' + i });
stages['40 phiếu bầu + 15 đánh giá'] = diff(s, snap());

/* 4) 20 bình luận + 100 lần đọc bình luận */
s = snap();
for (let i = 0; i < 20; i++) await call('POST', '/api/comments/bo-1', { text: 'bình luận ' + (i % 3), vid: 'may-cmt-' + (i % 4) });
for (let i = 0; i < 100; i++) await call('GET', '/api/comments/bo-1?limit=200&ch=0');
stages['20 bình luận + 100 lần đọc'] = diff(s, snap());

/* 5) Cron 1 ngày (144 lần - mỗi 10 phút) */
s = snap();
for (let i = 0; i < 6; i++) { await worker.scheduled({}, env, ctx); await Promise.all(waits.splice(0)); }
stages['Cron 1 giờ (6 lần)'] = diff(s, snap());

console.log(JSON.stringify(stages, null, 1));
console.log('TỔNG KV trong "ngày" giả lập:', JSON.stringify({ ghi: kv.w, doc: kv.r, list: kv.l, xoa: kv.d }));
