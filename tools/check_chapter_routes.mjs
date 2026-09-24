/* ============================================================================
   check_chapter_routes.mjs · THỬ 2 ĐƯỜNG ĐỌC MỚI TRÊN DỮ LIỆU THẬT
   ----------------------------------------------------------------------------
   Vì sao: `GET /api/book/<slug>/toc` và `GET /api/book/<slug>/chapter/<n>` là
   đường trang đọc dùng để mở chương (~18 KB) thay vì tải cả bộ (334 KB). Bài
   kiểm thử `tests/t_worker.mjs` chạy chúng trên dữ liệu GIẢ; bài này chạy trên
   chính `data/book/*.json` của chủ trang — nơi có bộ 1,8 MB, chương 87 KB, cụm
   nút Blogger, chương chỉ có ảnh…

   Điều kiện đạt (mỗi bộ lấy mẫu):
     · /toc trả 200 và có ĐÚNG số chương của bộ,
     · /chapter/<n> trả 200,
     · nội dung + tên chương KHỚP TỪNG KÝ TỰ với chương thứ n trong file,
     · mở 1 chương tốn ít hơn 15 % dung lượng cả bộ (đo bằng byte thật).

   Chạy:  node tools/check_chapter_routes.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(path.join(ROOT, 'worker', 'cms.js'))).default;

class FakeKV {
  constructor() { this.m = new Map(); this.reads = 0; this.writes = 0; }
  async get(k, opt) { this.reads++; const v = this.m.get(k); if (v === undefined) return null; return opt && opt.type === 'json' ? JSON.parse(v.value) : v.value; }
  async getWithMetadata(k, opt) { this.reads++; const v = this.m.get(k); if (v === undefined) return { value: null, metadata: null }; return { value: opt && opt.type === 'json' ? JSON.parse(v.value) : v.value, metadata: v.metadata || null }; }
  async put(k, value, opt) { this.writes++; this.m.set(k, { value: String(value), metadata: (opt && opt.metadata) || null }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', limit = 1000 } = {}) {
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort().slice(0, limit);
    return { keys: all.map((name) => ({ name })), list_complete: true };
  }
}
class FakeCache {
  constructor() { this.store = new Map(); }
  static key(i) { return String((i && i.url) || i); }
  async match(i) { const r = this.store.get(FakeCache.key(i)); return r ? r.clone() : undefined; }
  async put(i, r) { this.store.set(FakeCache.key(i), r.clone()); }
  async delete(i) { return this.store.delete(FakeCache.key(i)); }
}
/* Worker gọi ra ngoài (Blogger, Supabase) — bài này chỉ đo đường đọc nên chặn hết */
globalThis.caches = { default: new FakeCache() };
globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => '', json: async () => ({}) });

const kv = new FakeKV();
const env = {
  ADMIN_KEY: 'k'.repeat(30), CZ_KV: kv, ALLOW_ORIGIN: 'https://web.test',
  SESSION_SECRET: 's'.repeat(40), STATS_FLUSH_MS: '50',
};
const ctx = { waitUntil: () => {} };
const call = async (p) => {
  const res = await worker.fetch(new Request('https://cms.test' + p, { headers: { origin: 'https://web.test' } }), env, ctx);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { body = null; }
  return { status: res.status, headers: res.headers, text, body };
};

const dir = path.join(ROOT, 'data', 'book');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
/* lấy mẫu trải đều theo dung lượng: bộ lớn nhất, vài bộ cỡ vừa, bộ nhỏ nhất,
   cộng 1 bộ có cụm nút phân trang Blogger (chỗ dễ sai nhất) */
const sized = files.map((f) => ({ f, size: fs.statSync(path.join(dir, f)).size })).sort((a, b) => b.size - a.size);
const blogger = files.find((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('pagination-container'));
const picks = [...new Set([sized[0], sized[8], sized[20], sized[35], sized[sized.length - 1],
  blogger && sized.find((x) => x.f === blogger)].filter(Boolean).map((x) => x.f))];

const errors = [];
const rows = [];
for (const f of picks) {
  const slug = f.replace(/\.json$/, '');
  const book = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (!Array.isArray(book.chapters) || !book.chapters.length) continue;
  await kv.put('book:' + slug, JSON.stringify(book));
  const fullBytes = Buffer.byteLength(JSON.stringify(book));

  const toc = await call('/api/book/' + slug + '/toc');
  if (toc.status !== 200) { errors.push(slug + ': /toc trả ' + toc.status); continue; }
  if ((toc.body.chapters || []).length !== book.chapters.length) {
    errors.push(slug + ': /toc có ' + (toc.body.chapters || []).length + ' chương, file có ' + book.chapters.length);
  }
  if (JSON.stringify(toc.body).includes('<div')) errors.push(slug + ': /toc có kèm cả nội dung chương (đáng lẽ chỉ tên)');

  /* thử chương giữa, chương cuối và chương đầu */
  const mids = [...new Set([1, Math.ceil(book.chapters.length / 2), book.chapters.length])];
  let worst = 0;
  for (const n of mids) {
    const ch = await call('/api/book/' + slug + '/chapter/' + n);
    if (ch.status !== 200) { errors.push(slug + ' #' + n + ': /chapter trả ' + ch.status); continue; }
    const src = book.chapters[n - 1];
    if (String((ch.body.chapter || {}).html) !== String((src && src.html) || '')) errors.push(slug + ' #' + n + ': nội dung KHÔNG khớp chương ' + n + ' trong file');
    if (String((ch.body.chapter || {}).t) !== String((src && src.t) || '').trim()) errors.push(slug + ' #' + n + ': tên chương KHÔNG khớp (' + JSON.stringify((ch.body.chapter || {}).t) + ' ≠ ' + JSON.stringify(String(src.t).trim()) + ')');
    worst = Math.max(worst, Buffer.byteLength(ch.text));
  }
  if (worst / fullBytes > 0.15) errors.push(slug + ': mở 1 chương tốn ' + (worst / fullBytes * 100).toFixed(1) + '% cả bộ (đáng lẽ < 15 %)');
  rows.push({
    slug, chuong: book.chapters.length,
    ca_bo_kb: +(fullBytes / 1024).toFixed(0), toc_kb: +(Buffer.byteLength(toc.text) / 1024).toFixed(1),
    mot_chuong_kb: +(worst / 1024).toFixed(1), ti_le: (worst / fullBytes * 100).toFixed(1) + '%',
  });
}

console.log(JSON.stringify({ soBoThu: rows.length, chiTiet: rows, loi: errors, soLoi: errors.length }, null, 1));
if (errors.length) { console.error('ĐƯỜNG ĐỌC NHẸ CÓ LỖI TRÊN DỮ LIỆU THẬT'); process.exit(1); }
console.log('Đường đọc nhẹ (/toc + /chapter/<n>) đúng trên dữ liệu thật: mở 1 chương chỉ tốn vài phần trăm dung lượng cả bộ.');
