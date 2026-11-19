/* ============================================================================
   t_admin_couple_clear.js · OPTION "KHÔNG CÓ COUPLE" trong Sửa bộ / Tạo bộ
   ---------------------------------------------------------------------------
   coupleBlock có 2 nút: "+ Thêm couple" và "Không có couple". Bấm
   "Không có couple" gộp couple về 1 dòng trống, couple ghi '' khi lưu —
   giúp những truyện KHÔNG có couple có lựa chọn rõ ràng để giữ trống thay
   vì chỉ để ô input trống mơ hồ. Bài này chứng minh:
     · Sửa bộ: bấm "Không có couple" ⇒ model couple = '' ⇒ PUT registry
       couple = '' (thay cho couple cũ);
     · Tạo bộ: bấm "Không có couple" ⇒ tạo bộ có couple = '';
     · couple hiện có vẫn hiển thị đúng khi vào Sửa bộ.
   Chạy: node tests/t_admin_couple_clear.js
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
const CURRENT_COUPLE = registry.lib.find(m => m.slug === TARGET).couple;

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

  /* ---- 1 · Sửa bộ: couple hiện có, bấm "Không có couple" ⇒ couple = '' ---- */
  nav('sua-bo');
  w.selectBook(TARGET); w.render();
  await tick(4);
  ok(S().couples.eb && S().couples.eb.length === 1 && S().couples.eb[0] === CURRENT_COUPLE,
    'vào Sửa bộ couple hiện đúng: ' + JSON.stringify(S().couples.eb));
  const coupleRow = w.document.querySelector('[data-role="couple-row"][data-form="eb"]');
  ok(coupleRow && coupleRow.value === CURRENT_COUPLE, 'ô couple hiển thị giá trị hiện tại');

  const clearBtn = w.document.querySelector('[data-act="couple-clear"][data-form="eb"]');
  ok(!!clearBtn, 'có nút "Không có couple" trong Sửa bộ');
  click('[data-act="couple-clear"][data-form="eb"]');
  await tick(3);
  ok(S().couples.eb && S().couples.eb.length === 1 && S().couples.eb[0] === '',
    'bấm "Không có couple" ⇒ couples.eb = [\"\"] (trống)');
  ok(S().models['eb-c'] === '', 'model eb-c = "" sau khi clear');

  const mark = calls.length;
  click('[data-act="save-edit"]');
  await tick(10);
  const puts = calls.slice(mark).filter(c => c.method === 'PUT' && c.p === '/api/registry');
  ok(puts.length >= 1, 'Lưu bộ phát sinh PUT /api/registry');
  const putBody = puts.length ? puts[puts.length - 1].body : {};
  const saved = (putBody.lib || []).find(m => m.slug === TARGET);
  ok(saved && saved.couple === '', 'PUT registry ghi couple = "" (xóa couple cũ)');

  /* ---- 2 · Tạo bộ: bấm "Không có couple" ⇒ tạo bộ couple = '' ---- */
  nav('them-bo');
  await tick(2);
  const nbClear = w.document.querySelector('[data-act="couple-clear"][data-form="nb"]');
  ok(!!nbClear, 'có nút "Không có couple" trong Tạo bộ');
  setVal('nb-t', 'Bộ QA Không Couple');
  setVal('nb-slug', 'bo-qa-khong-couple');
  setVal('nb-a', 'Tác giả QA');
  click('[data-act="couple-clear"][data-form="nb"]');
  await tick(2);
  ok(S().models['nb-c'] === '', 'Tạo bộ: model nb-c = "" sau clear');
  click('[data-act="submit-new"]');
  await tick(12);
  const metaNew = KV.registry.lib.find(m => m.slug === 'bo-qa-khong-couple');
  ok(!!metaNew, 'tạo bộ có meta trong registry');
  ok(metaNew && metaNew.couple === '', 'meta.couple = "" (không có couple)');

  ok(errors.length === 0, '0 lỗi JS: ' + errors.join(' | '));

  if (bad.length) {
    console.log(JSON.stringify({ bai: 't_admin_couple_clear.js', loi: bad.length, errors: bad }, null, 2));
    process.exit(1);
  }
  console.log('Đen: option "Không có couple" clear couple và lưu đúng lên registry.');
})().catch(e => {
  console.log(JSON.stringify({ bai: 't_admin_couple_clear.js', loi: [String(e && e.stack || e)], errors: bad }, null, 2));
  process.exit(1);
});
