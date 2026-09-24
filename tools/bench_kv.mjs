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
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LỖI ĐÃ SỬA: trước đây `node tools/bench_kv.mjs .` (đúng cú pháp ghi trong
   README) cho ROOT='.' rồi import './worker/cms.js' TƯƠNG ĐỐI VỚI TỆP NÀY
   → tools/worker/cms.js → ERR_MODULE_NOT_FOUND, công cụ đo không chạy được.
   Nay đối số luôn được giải về đường dẫn tuyệt đối theo thư mục đang đứng. */
const ROOT = path.resolve(process.argv[2] || new URL('..', import.meta.url).pathname);
const worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'cms.js')).href)).default;
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

/* 6) TẢI CHƯƠNG (bản 1.16.0): 100 lượt mở chương, so ĐƯỜNG NHẸ (/toc + đúng 1
   chương) với ĐƯỜNG CŨ (tải cả bộ cho mỗi lượt mở). Đo cả số byte trả về — đây
   là phần người đọc đụng nhiều nhất và cũng là phần tốn CPU Worker nhất
   (JSON.parse cả bộ 1,4 MB mỗi lượt). Bench không có `caches` nên mỗi lần gọi
   là một lần chạm KV thật: đúng bằng chi phí mỗi lần TRƯỢT cache biên. */
{
  const N = 100;
  const big = 'bo-7';
  /* bộ thật cỡ lớn: 200 chương, mỗi chương ~18 KB chữ (bằng chương trung bình
     trong kho 1.216 chương thật) — bộ ~3,6 MB, sát bộ lớn nhất đang có */
  kv.m.set('book:' + big, {
    value: JSON.stringify({
      title: 'Bộ lớn', slug: big,
      chapters: Array.from({ length: 200 }, (_, k) => ({ t: 'Chương ' + (k + 1), html: '<p>' + ('chữ '.repeat(4500)) + '</p>' })),
    }), metadata: {},
  });
  const bytesOf = async (res) => (await res.clone().text()).length;

  s = snap();
  let lightBytes = 0;
  for (let i = 0; i < N; i++) {
    if (i === 0) lightBytes += await bytesOf(await call('GET', '/api/book/' + big + '/toc'));
    lightBytes += await bytesOf(await call('GET', '/api/book/' + big + '/chapter/' + ((i % 200) + 1)));
  }
  const light = diff(s, snap());
  light.byteTraVe = lightBytes;

  s = snap();
  let heavyBytes = 0;
  for (let i = 0; i < N; i++) heavyBytes += await bytesOf(await call('GET', '/api/book/' + big));
  const heavy = diff(s, snap());
  heavy.byteTraVe = heavyBytes;

  stages['100 lượt mở chương — ĐƯỜNG NHẸ /toc + /chapter/<n> (1.16.x)'] = light;
  stages['100 lượt mở chương — ĐƯỜNG CŨ tải cả bộ'] = heavy;
  stages['→ tiết kiệm được'] = {
    ghi: heavy.ghi - light.ghi, doc: heavy.doc - light.doc, list: heavy.list - light.list, xoa: 0,
    byteTraVe: heavyBytes - lightBytes,
    ghiChu: 'byte giảm ' + (100 - Math.round(lightBytes / heavyBytes * 100)) + '% cho cùng 100 lượt mở chương',
  };
}

console.log(JSON.stringify(stages, null, 1));
console.log('TỔNG KV trong "ngày" giả lập:', JSON.stringify({ ghi: kv.w, doc: kv.r, list: kv.l, xoa: kv.d }));
