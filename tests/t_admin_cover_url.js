/* ============================================================================
   t_admin_cover_url.js · BẢO VỆ COVER URL KHI LƯU / TẠO BỘ
   ---------------------------------------------------------------------------
   Lỗi từng có: form Sửa bộ / Tạo bộ chỉ có ô TẢI FILE ảnh bìa, không có ô
   dán URL. realSaveEdit lại ghi luôn thumb = base.thumb || '' nên một URL bìa
   sai (domain chết) không thể sửa qua giao diện và mỗi lần lưu lại ghi nguyên
   bản sai. Bài này chứng minh:
     · form Sửa bộ có ô "Đường dẫn ảnh bìa (URL)" (#eb-cover), được khởi
       đúng thumb hiện tại từ registry;
     · thay URL trong ô → bấm Lưu ⇒ PUT /api/registry ghi thumb/slide mới;
     · gõ URL bìa vào form Tạo bộ (#nb-cover) → tạo bộ ⇒ meta.thumb = URL;
     · tải file ảnh lên vẫn ghi đè được URL bìa (hình vẫn đi qua /api/img).
   Chạy: node tests/t_admin_cover_url.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const registry = JSON.parse(R('data/registry.json'));
const bookSeed = JSON.parse(R('data/book/bake-love-feelings.json'));
const TARGET = 'bake-love-feelings';
const CURRENT_THUMB = registry.lib.find(m => m.slug === TARGET).thumb;
const NEW_THUMB = 'https://cdn-local.mebmarket.com/meb/server1/999999/Thumbnail/cover.jpg?fix';
const NEW_THUMB_NEW = 'https://cdn-local.mebmarket.com/meb/server1/111111/Thumbnail/new.jpg?fix';

const KV = {
  registry: JSON.parse(JSON.stringify(registry)),
  books: { [TARGET]: JSON.parse(JSON.stringify(bookSeed)) },
  comments: [], reports: [], log: [],
  stats: { items: {}, days: [] },
  voters: {}
};
const calls = [];
function resp(data, status = 200) {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: n => (n.toLowerCase() === 'content-type' ? 'application/json' : '') },
    json: async () => data, text: async () => JSON.stringify(data)
  };
}
function fakeFetch(url, opts) {
  opts = opts || {};
  const u = new URL(url, 'https://ssochuz.pages.dev');
  const p = u.pathname, method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ p, method, body });
  const send = (d, st) => Promise.resolve(resp(d, st));
  if (p === '/api/health') return send({ ok: true });
  if (p === '/api/whoami') return (opts.headers || {})['x-admin-key'] ? send({ ok: true, role: 'super_admin' }) : send({ ok: false, error: 'thiếu key' }, 401);
  if (p === '/api/registry') {
    if (method === 'PUT') { KV.registry = JSON.parse(JSON.stringify(body)); return send({ ok: true }); }
    return send(KV.registry);
  }
  let m = p.match(/^\/api\/book\/([^/]+)\/chapter$/);
  if (m) { const slug = decodeURIComponent(m[1]); const b = KV.books[slug] || { title: slug, slug, chapters: [] }; KV.books[slug] = b; if (!Array.isArray(b.chapters)) b.chapters = []; return send({ ok: true }); }
  m = p.match(/^\/api\/book\/([^/]+)$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    if (method === 'PUT') { KV.books[slug] = body; return send({ ok: true }); }
    if (method === 'DELETE') { delete KV.books[slug]; return send({ ok: true, deleted: slug }); }
    return KV.books[slug] ? send(KV.books[slug]) : send({ ok: false, error: 'chưa có book' }, 404);
  }
  if (p === '/api/admin/kv') return send({ ok: true, writesToday: 3, readsToday: 10, keys: 10, bytes: 1000, groups: [] });
  if (p === '/api/admin/comments') return send({ ok: true, comments: KV.comments });
  if (p === '/api/admin/reports') return send({ ok: true, items: KV.reports });
  if (p === '/api/admin/stats') return send({ ok: true, items: KV.stats.items, days: KV.stats.days });
  if (p === '/api/admin/log') return send({ ok: true, items: KV.log });
  if (p === '/api/admin/voters') return send({ ok: true, book: { count: 0, voters: [] } });
  if (p === '/api/img' && method === 'POST') return send({ ok: true, id: 'imgcov01', url: '/api/img/imgcov01' });
  if (/^\/api\/(recount|sync|import|stats\/refresh|lock\/set|admin\/migrate-overflow)/.test(p)) return send({ ok: true });
  return send({ ok: false, error: 'endpoint giả chưa có: ' + p }, 404);
}

const rawHtml = R('admin.html');
const html = rawHtml.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, '');
const realJs = R('admin-real.js');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + ((e && e.message) || e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.addEventListener('error', e => errors.push('window.error: ' + ((e && e.message) || e)));
w.fetch = (u, o) => fakeFetch(u, o);
w.URL.createObjectURL = () => 'blob:fake';
w.URL.revokeObjectURL = () => {};
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};
w.eval(realJs);

const $ = s => w.document.querySelector(s);
const S = () => w.CZ_MOCKUP.state;
const click = sel => { const e = $(sel); if (!e) throw new Error('không thấy ' + sel); e.click(); };
function setVal(id, v) {
  const e = w.document.getElementById(id);
  if (!e) throw new Error('không thấy #' + id);
  e.value = v;
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
async function tick(n = 4) { for (let i = 0; i < n; i++) await sleep(25); }
function nav(id) { S().route = id; w.render(); }

(async () => {
  await sleep(200);
  setVal('gate-api', 'https://ten-worker.workers.dev');
  setVal('gate-key', 'ADMIN_KEY_QA');
  click('[data-act="connect"]');
  await tick(12);
  ok(S().conn === 'online', 'kết nối Worker ⇒ online');

  /* ---- 1 · Sửa bộ: ô URL bìa hiện đúng thumb, thay URL rồi lưu ---- */
  nav('sua-bo');
  w.selectBook(TARGET); w.render();
  await tick(4);
  const coverIn = w.document.getElementById('eb-cover');
  ok(!!coverIn, 'form Sửa bộ có ô URL bìa #eb-cover');
  ok(coverIn && coverIn.value === CURRENT_THUMB,
    '#eb-cover khởi đúng thumb hiện tại (thấy ' + (coverIn && coverIn.value) + ')');

  setVal('eb-cover', NEW_THUMB);
  await tick(2);
  const pv = w.document.getElementById('eb-cover-preview');
  ok(pv && pv.innerHTML.indexOf(NEW_THUMB) >= 0, 'gõ URL ⇒ xem trước ảnh bìa đổi theo');

  const mark = calls.length;
  click('[data-act="save-edit"]');
  await tick(10);
  const puts = calls.slice(mark).filter(c => c.method === 'PUT' && c.p === '/api/registry');
  ok(puts.length >= 1, 'Lưu bộ phát sinh PUT /api/registry');
  const putBody = puts.length ? puts[puts.length - 1].body : {};
  const saved = (putBody.lib || []).find(m => m.slug === TARGET);
  ok(saved && saved.thumb === NEW_THUMB, 'PUT registry ghi thumb mới (thấy ' + (saved && saved.thumb) + ')');
  ok(saved && saved.slide === NEW_THUMB, 'slide cũng theo thumb mới');

  /* Lưu lại không đổi URL ⇒ vẫn giữ thumb đã sửa (không bị quay lại cũ). */
  const mark2 = calls.length;
  click('[data-act="save-edit"]');
  await tick(10);
  const puts2 = calls.slice(mark2).filter(c => c.method === 'PUT' && c.p === '/api/registry');
  const put2 = puts2.length ? puts2[puts2.length - 1].body : {};
  const saved2 = (put2.lib || []).find(m => m.slug === TARGET);
  ok(saved2 && saved2.thumb === NEW_THUMB, 'lưu tiếp không đổi URL ⇒ thumb giữ nguyên, không bị ghi lại cũ');

  /* ---- 2 · Tạo bộ: dán URL bìa trực tiếp ---- */
  nav('them-bo');
  await tick(2);
  const nbCover = w.document.getElementById('nb-cover');
  ok(!!nbCover, 'form Tạo bộ có ô URL bìa #nb-cover');
  setVal('nb-t', 'Bộ QA Cover URL');
  setVal('nb-slug', 'bo-qa-cover-url');
  setVal('nb-a', 'Tác giả QA');
  setVal('nb-cover', NEW_THUMB_NEW);
  click('[data-act="submit-new"]');
  await tick(12);
  const metaNew = KV.registry.lib.find(m => m.slug === 'bo-qa-cover-url');
  ok(!!metaNew, 'tạo bộ có meta trong registry');
  ok(metaNew && metaNew.thumb === NEW_THUMB_NEW, 'meta.thumb nhận URL bìa dán trực tiếp (thấy ' + (metaNew && metaNew.thumb) + ')');

  /* ---- 3 · Tải file ảnh lên vẫn ghi đè URL bìa ---- */
  nav('sua-bo');
  w.selectBook(TARGET); w.render();
  await tick(4);
  const covIn = w.document.querySelector('[data-role="cover-upload"][data-target="eb-cover-preview"]');
  ok(!!covIn, 'form Sửa bộ có ô tải ảnh bìa');
  const covFile = new w.File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'bia-qa.png', { type: 'image/png' });
  Object.defineProperty(covIn, 'files', { value: [covFile], configurable: true });
  covIn.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(14);
  ok(S().models['eb-cover'] === 'https://ten-worker.workers.dev/api/img/imgcov01',
    'tải file ⇒ model eb-cover = URL Worker thật (thấy ' + S().models['eb-cover'] + ')');
  const cu = w.document.getElementById('eb-cover');
  ok(cu && cu.value === 'https://ten-worker.workers.dev/api/img/imgcov01',
    'ô URL bìa tự cập nhật theo URL tải lên');

  ok(errors.length === 0, '0 lỗi JS: ' + errors.join(' | '));

  if (bad.length) {
    console.log(JSON.stringify({ bai: 't_admin_cover_url.js', loi: bad.length, errors: bad }, null, 2));
    process.exit(1);
  }
  console.log('Đen: cover URL có thể sửa/dán trực tiếp và lưu đúng lên registry.');
})().catch(e => {
  console.log(JSON.stringify({ bai: 't_admin_cover_url.js', loi: [String(e && e.stack || e)], errors: bad }, null, 2));
  process.exit(1);
});
