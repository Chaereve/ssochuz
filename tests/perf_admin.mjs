/* perf_admin.mjs · công cụ đo tốc độ admin (CHẠY THỦ CÔNG, không nằm trong run.js
   vì thời gian phụ thuộc máy): node tests/perf_admin.mjs
   Đo: boot → online, 13 tab, 10 phím tìm kiếm thư viện, 50 phím soạn chương
   (HTML lớn), nạp/Lưu chương, Lưu trang chủ, chi phí 1 render(). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const worker = (await import(pathToFileURL(path.join(ROOT, 'worker', 'cms.js')).href)).default;

class MemKV {
  constructor() { this.m = new Map(); }
  async get(k, opt) {
    const v = this.m.get(k); if (!v) return null;
    if (opt && opt.type === 'json') { try { return JSON.parse(v); } catch (e) { return null; } }
    return v;
  }
  async getWithMetadata(k, opt) {
    const v = this.m.get(k); if (!v) return { value: null, metadata: null };
    return { value: opt && opt.type === 'json' ? JSON.parse(v) : v, metadata: null };
  }
  async put(k, value) { this.m.set(k, String(value)); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    const all = [...this.m.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? all.indexOf(cursor) + 1 : 0;
    const keys = all.slice(start, start + limit).map(name => ({ name, metadata: null }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : all[start + limit - 1] };
  }
}
const env = {
  ADMIN_KEY: 'MOCK', CZ_KV: new MemKV(), ALLOW_ORIGIN: '*',
  BLOG: 'https://chuseoz.blogspot.com',
  SESSION_SECRET: 'mock-session-secret-dai-hon-32-ky-tu',
  ADMIN_EMAILS: 'owner@example.com',
};
await env.CZ_KV.put('registry', R('data/registry.json'));
for (const f of fs.readdirSync(path.join(ROOT, 'data/book'))) {
  if (!f.endsWith('.json')) continue;
  await env.CZ_KV.put('book:' + f.slice(0, -5), R('data/book/' + f));
}
await env.CZ_KV.put('_last', new Date().toISOString());

async function wFetch(url, opts = {}) {
  const req = new Request(String(url), {
    method: opts.method || 'GET', headers: opts.headers || {},
    body: ['GET', 'HEAD'].includes(opts.method || 'GET') ? undefined : opts.body,
  });
  return worker.fetch(req, env, { waitUntil() {} });
}

const html = R('admin.html').replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, '');
const realJs = R('admin-real.js');
const vc = new VirtualConsole();
const dom = new JSDOM(html, {
  url: 'https://ssochuz.pages.dev/admin',
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
});
const w = dom.window;
w.fetch = wFetch;
w.URL.createObjectURL = () => 'blob:fake';
w.URL.revokeObjectURL = () => {};
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};
w.localStorage.setItem('cz_kv_api', 'https://cms.test');
w.sessionStorage.setItem('cz_kv_key', 'MOCK');
const tBoot0 = performance.now();
w.eval(realJs);
const D = w.document;
const $ = s => D.querySelector(s);
const S = () => w.CZ_MOCKUP.state;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();
async function until(fn, ms = 5000, step = 25) {
  const t0 = now();
  while (now() - t0 < ms) { if (fn()) return now() - t0; await sleep(step); }
  return -1;
}
const out = {};
const bad = [];

/* 1 · boot → online + có dữ liệu */
out.boot_ms = +(await until(() => S().conn === 'online' && S().books.length > 0)).toFixed(1);
if (out.boot_ms < 0) bad.push('boot không online');

/* 2 · navigate 13 tab */
const ROUTES = ['dashboard', 'thu-vien', 'them-bo', 'sua-bo', 'chuong', 'binh-luan', 'bao-loi', 'phieu-bau', 'homepage-cms', 'thong-ke', 'kiem-tra-du-lieu', 'nhat-ky', 'cai-dat'];
const tNav = now();
for (const r of ROUTES) { w.CZ_MOCKUP.navigate(r); await sleep(60); }
out.nav13_ms = +(now() - tNav).toFixed(1);

/* 3 · gõ tìm kiếm thư viện — 10 phím */
w.CZ_MOCKUP.navigate('thu-vien'); await sleep(80);
const qi = $('[data-role="lib-q"]');
if (!qi) bad.push('thiếu ô lib-q');
else {
  const t0 = now();
  for (let i = 0; i < 10; i++) {
    qi.value = 'bo-' + 'abcdefghij'.slice(0, i + 1);
    qi.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  out.lib10keystroke_ms = +(now() - t0).toFixed(1);
}

/* 4 · soạn chương — nạp bộ nhiều chương rồi gõ 50 phím trên HTML lớn */
w.selectBook('bake-love-feelings');
await until(() => $('#editor') && $('#editor').getAttribute('data-book') === 'bake-love-feelings', 4000);
w.CZ_MOCKUP.navigate('chuong'); await sleep(80);
const ed = $('#editor');
if (!ed) bad.push('thiếu #editor');
else {
  /* mô phỏng chương lớn: ~120 đoạn */
  const big = Array.from({ length: 120 }, (_, i) => '<p>Đoạn ' + i + ' nội dung thử nghiệm gõ nhanh với HTML khá dài để đo chi phí sanitize mỗi phím.</p>').join('');
  ed.innerHTML = big;
  const t0 = now();
  for (let i = 0; i < 50; i++) {
    ed.innerHTML = big + '<p>' + 'x'.repeat(i + 1) + '</p>';
    ed.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  out.editor50keystroke_ms = +(now() - t0).toFixed(1);
  out.editor_per_key_ms = +(out.editor50keystroke_ms / 50).toFixed(2);
}

/* 5 · loadBook (bake) — đo lại sau khi đã nạp (cache kh) */
{
  const t0 = now();
  w.selectBook('bake-love-feelings');
  const ok = await until(() => S().chapterBook === 'bake-love-feelings' && $('#editor') && $('#editor').getAttribute('data-book') === 'bake-love-feelings');
  out.reloadBook_ms = +ok.toFixed(1);
}

/* 6 · Lưu chương (PUT) */
{
  w.CZ_MOCKUP.navigate('chuong'); await sleep(60);
  const ed2 = $('#editor');
  if (ed2) ed2.innerHTML = '<p>Nội dung lưu thử nghiệm.</p>';
  const t0 = now();
  $('[data-act="save-chapter"]').click();
  const r = await until(() => S().savedAt !== '' || $('#saveNote') && /Đã lưu KV/.test($('#saveNote').textContent), 5000);
  out.saveChapter_ms = +r.toFixed(1);
  if (r < 0) bad.push('saveChapter không xong');
}

/* 7 · Lưu trang chủ (registry PUT + hydrate + render) */
{
  w.CZ_MOCKUP.navigate('homepage-cms'); await sleep(60);
  const t0 = now();
  $('[data-act="save-homepage"]').click();
  const r = await until(() => {
    const n = $('#toasts');
    return n && /lưu trang chủ|Đã lưu/i.test(n.textContent);
  }, 5000);
  out.saveHomepage_ms = +r.toFixed(1);
  if (r < 0) bad.push('saveHomepage không thấy toast');
}

/* 8 · render lặp: 20 lần render tab dashboard (tính chi phí 1 render) */
{
  w.CZ_MOCKUP.navigate('dashboard'); await sleep(60);
  const t0 = now();
  for (let i = 0; i < 20; i++) w.CZ_MOCKUP.render();
  out.render20_ms = +(now() - t0).toFixed(1);
  out.render_ms = +(out.render20_ms / 20).toFixed(2);
}

console.log(JSON.stringify({ bai: 'perf_admin.mjs · đo tốc độ admin', ...out, bad }, null, 1));
w.close();
process.exit(bad.length ? 1 : 0);
