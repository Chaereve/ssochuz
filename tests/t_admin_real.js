/* ============================================================================
   t_admin_real.js · VÒNG 10: /admin = admin.html MỚI, ĐỌC/GHI DỮ LIỆU THẬT
   ----------------------------------------------------------------------------
   Mở ĐÚNG admin.html (bản sinh từ mockup) + admin-real.js trong jsdom, dựng một
   Worker giả có KV trong RAM, rồi bấm thật các nút ghi. Bài này chứng minh:

     · không có ADMIN_KEY ⇒ về màn đăng nhập / chế độ chỉ đọc, không ghi gì;
     · có key ⇒ gọi /api/whoami với x-admin-key, đổ registry + 6 nguồn admin
       vào 13 tab (KHÔNG còn DỮ LIỆU MẪU), khoá chỉ nằm ở sessionStorage;
     · Thêm bộ / đổi slug / Lưu chương / xử lý báo lỗi / xoá bình luận /
       Lưu trang chủ đều phát sinh request ghi thật lên KV;
     · bản mockup tĩnh vẫn là prototype, không nạp admin-real.js, không fetch;
     · không còn tệp/route/link của bản admin sao chép.

   Chạy: node tests/t_admin_real.js   (npm test gọi tự động)
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- Worker giả: KV trong RAM ---------------- */
const registry = JSON.parse(R('data/registry.json'));
const bookSeed = JSON.parse(R('data/book/bake-love-feelings.json'));
const KV = {
  registry: JSON.parse(JSON.stringify(registry)),
  books: { 'bake-love-feelings': JSON.parse(JSON.stringify(bookSeed)) },
  comments: [
    { id: 'c1', uid: 'u1', name: 'Độc giả A', text: 'Hay quá!', slug: 'bake-love-feelings', ch: 1, createdAt: '2026-11-03T10:00:00Z' },
    { id: 'c2', uid: 'u2', name: 'Spam', text: 'kiếm tiền inbox https://x.test', slug: 'bake-love-feelings', ch: 2, createdAt: '2026-11-03T11:00:00Z' }
  ],
  reports: [
    { id: 'r1', done: false, text: 'Lỗi chương 3', title: 'Chương 3', slug: 'bake-love-feelings', ch: 3, name: 'Bạn đọc B' },
    { id: 'r2', done: true, text: 'Đã xong', title: 'Chương 4', slug: 'bake-love-feelings', ch: 4 }
  ],
  log: [{ at: '2026-11-03T12:00:00Z', text: 'sửa bộ bake-love-feelings', who: 'admin-key' }],
  stats: {
    items: {
      'bake-love-feelings': { views: 8420, votes: 1161, viewsDay: 120, votesDay: 8 },
      'lunar-secret': { views: 4210, votes: 640, viewsDay: 80, votesDay: 5 }
    },
    days: Array.from({ length: 14 }, (_, i) => ({ day: '2026-10-' + (20 + i), views: 40 + i * 3, votes: 2 + i }))
  },
  voters: { 'bake-love-feelings': [{ key: 'g:abc', at: '2026-11-01T10:00:00Z' }] }
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
  calls.push({ p, method, key: (opts.headers || {})['x-admin-key'] || '', body });
  const send = (d, st) => Promise.resolve(resp(d, st));
  if (p === '/api/health') return send({ ok: true });
  if (p === '/api/whoami') return (opts.headers || {})['x-admin-key'] ? send({ ok: true, role: 'super_admin' }) : send({ ok: false, error: 'thiếu key' }, 401);
  if (p === '/api/registry') {
    if (method === 'PUT') { KV.registry = JSON.parse(JSON.stringify(body)); return send({ ok: true }); }
    return send(KV.registry);   /* worker thật trả thẳng object registry */
  }
  let m = p.match(/^\/api\/book\/([^/]+)\/chapter$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    const b = KV.books[slug] || { title: slug, slug, chapters: [] };
    KV.books[slug] = b;
    if (!Array.isArray(b.chapters)) b.chapters = [];
    if (body.remove) b.chapters.splice(body.index, 1);
    else if (body.from !== undefined) { const [x] = b.chapters.splice(body.from, 1); b.chapters.splice(body.to, 0, x); }
    else b.chapters[body.index] = body.chapter;
    return send({ ok: true, index: body.index });
  }
  m = p.match(/^\/api\/book\/([^/]+)$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    if (method === 'PUT') { KV.books[slug] = body; return send({ ok: true }); }
    if (method === 'DELETE') { delete KV.books[slug]; return send({ ok: true, deleted: slug }); }
    return KV.books[slug] ? send(KV.books[slug]) : send({ ok: false, error: 'chưa có book' }, 404);
  }
  if (p === '/api/admin/comments') return send({ ok: true, comments: KV.comments });
  if (p === '/api/admin/reports') {
    if (method === 'PATCH') { const r = KV.reports.find(x => x.id === body.id); if (r) r.done = body.done; return send({ ok: true }); }
    return send({ ok: true, items: KV.reports });
  }
  if (p === '/api/admin/stats') return send({ ok: true, items: KV.stats.items, days: KV.stats.days });
  if (p === '/api/admin/log') return send({ ok: true, items: KV.log });
  if (p === '/api/admin/kv') return send({ ok: true, writesToday: 137, readsToday: 4021, keys: 82, bytes: 123456, groups: [{ prefix: 'book', keys: 67 }] });
  if (p === '/api/admin/voters') {
    const list = KV.voters[u.searchParams.get('slug')] || [];
    return send({ ok: true, book: { count: list.length, voters: list } });
  }
  if (p.startsWith('/api/comments/')) return send({ ok: true });
  if (/^\/api\/(admin\/vote-remove|admin\/votes\/reset|recount|sync|import|stats\/refresh|lock\/set|img|admin\/migrate-overflow)/.test(p)) return send({ ok: true, books: 3, covers: 4, images: 2 });
  return send({ ok: false, error: 'endpoint giả chưa có: ' + p }, 404);
}

/* ---------------- nạp đúng admin.html ---------------- */
const rawHtml = R('admin.html');
ok(/<script src="\/admin-real\.js\?v=[a-f0-9]+"><\/script>/.test(rawHtml), 'admin.html nạp admin-real.js kèm ?v= sha1');
ok(!/admin-cu|adminRoot|Admin thật · ghi KV/.test(rawHtml), 'admin.html sạch link/nhãn bản admin sao chép');
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
function confirmStrong(phrase) {
  const input = $('#confirmPhrase');
  if (input) { input.value = phrase; input.dispatchEvent(new w.Event('input', { bubbles: true })); }
  const btn = $('[data-act="confirm-ok"]'); if (btn) btn.click();
}

(async () => {
  await sleep(200);   /* boot() + hashchange của navigate('dang-nhap') */
  ok(!!w.CZ_MOCKUP && !!S(), 'admin.html có cầu nối CZ_MOCKUP');
  ok(S().route === 'dang-nhap', 'không có ADMIN_KEY ⇒ màn đăng nhập');
  const GATE = w.document.getElementById('login').textContent;
  ok(!/MẪU|mẫu|mô phỏng|không gọi Worker thật/.test(GATE), 'màn đăng nhập không còn nhãn prototype');
  ok(/Cloudflare KV/.test(GATE), 'màn đăng nhập nói rõ ghi Cloudflare KV');
  ok(errors.length === 0, '0 lỗi JS khi nạp: ' + errors.join(' | '));

  /* ---- 1 · kết nối & khoá ---- */
  setVal('gate-api', 'https://ten-worker.workers.dev');
  setVal('gate-key', 'ADMIN_KEY_QA');
  click('[data-act="connect"]');
  await tick(12);
  ok(S().conn === 'online', 'kết nối Worker ⇒ online (đang ' + S().conn + ')');
  ok(calls.some(c => c.p === '/api/whoami' && c.key === 'ADMIN_KEY_QA'), 'gọi /api/whoami kèm x-admin-key');
  ok(w.sessionStorage.getItem('cz_kv_key') === 'ADMIN_KEY_QA', 'ADMIN_KEY chỉ ở sessionStorage');
  ok(!w.localStorage.getItem('cz_kv_key'), 'ADMIN_KEY không nằm ở localStorage');
  ok(w.localStorage.getItem('cz_kv_api') === 'https://ten-worker.workers.dev', 'URL Worker lưu ở localStorage');
  ok(!Object.prototype.hasOwnProperty.call(S().models, 'gate-key'), 'ADMIN_KEY bị xoá khỏi state.models');

  /* ---- 2 · đổ dữ liệu thật ---- */
  const libCount = registry.lib.length;
  ok(w.CZ_MOCKUP.SAMPLE_METRICS[0].n === String(libCount), 'Dashboard hiện đúng ' + libCount + ' bộ từ KV');
  ok(S().books.length === libCount && S().books.some(b => b.t === registry.lib[0].title), 'state.books = registry.lib thật');
  ok(!/DỮ LIỆU MẪU|MẪU|mẫu|mô phỏng/.test(w.document.getElementById('view').textContent), '#view không còn nhãn prototype');
  ok(S().comments.length === 2 && S().comments[0].r === 'Độc giả A', 'bình luận từ /api/admin/comments');
  ok(S().reports.length === 2 && S().reports[0].by === 'Bạn đọc B', 'báo lỗi từ /api/admin/reports');
  ok(w.CZ_MOCKUP.SAMPLE_LOGS.length === 1 && /sửa bộ/.test(w.CZ_MOCKUP.SAMPLE_LOGS[0].x), 'nhật ký từ /api/admin/log');
  ok(w.CZ_MOCKUP.SAMPLE_READS.length === 14, 'chuỗi 14 ngày từ /api/admin/stats');
  ok(w.CZ_MOCKUP.SAMPLE_METRICS[4].n === '137', 'quota ghi thật từ /api/admin/kv');
  ok(S().votes.length === 1 && S().votes[0].k === 'g:abc', 'phiếu bầu đọc được dạng book.voters của Worker');
  const TABS = ['dashboard', 'thu-vien', 'them-bo', 'sua-bo', 'chuong', 'binh-luan', 'bao-loi', 'phieu-bau', 'homepage-cms', 'thong-ke', 'kiem-tra-du-lieu', 'nhat-ky', 'cai-dat'];
  const STALE = /MẪU|mẫu|mô phỏng|DỮ LIỆU MẪU/;
  TABS.forEach(t => {
    try {
      nav(t);
      ok(!!$('#view'), 'render tab ' + t);
      ['view', 'sidebar', 'topbar', 'modalRoot'].forEach(id => {
        const el = w.document.getElementById(id);
        if (el) ok(!STALE.test(el.textContent || ''), 'tab ' + t + '/' + id + ' không còn nhãn prototype');
      });
    } catch (e) { ok(false, 'render tab ' + t + ': ' + e.message); }
  });
  ok(errors.length === 0, '0 lỗi JS khi đổ dữ liệu + mở 13 tab: ' + errors.join(' | '));

  /* ---- 3 · Thêm bộ ---- */
  nav('them-bo');
  setVal('nb-t', 'Bộ QA Vòng 10'); setVal('nb-slug', 'bo-qa-vong-10');
  setVal('nb-a', 'Tác giả QA'); setVal('nb-sum', 'Mô tả thật.');
  setVal('nb-chapter', 'Nội dung chương đầu.');
  click('[data-act="submit-new"]');
  await tick(12);
  ok(!!KV.books['bo-qa-vong-10'], 'PUT /api/book/<slug> tạo book thật');
  ok(!!KV.registry.lib.find(m => m.slug === 'bo-qa-vong-10'), 'PUT /api/registry thêm meta thật');
  ok((KV.books['bo-qa-vong-10'].chapters || []).length === 1, 'chương đầu được ghi');

  /* ---- 4 · Sửa bộ / đổi slug ---- */
  nav('sua-bo');
  w.selectBook('bo-qa-vong-10'); w.render();
  setVal('eb-t', 'Bộ QA Đã Đổi'); setVal('eb-slug', 'bo-qa-da-doi');
  click('[data-act="save-edit"]');
  await tick(6); confirmStrong('ĐỔI SLUG'); await tick(14);
  ok(!!KV.books['bo-qa-da-doi'], 'book được ghi ở slug mới');
  ok(!!KV.registry.lib.find(m => m.slug === 'bo-qa-da-doi') && !KV.registry.lib.find(m => m.slug === 'bo-qa-vong-10'), 'registry đổi slug, slug cũ bị gỡ');

  /* ---- 5 · Lưu chương ---- */
  nav('chuong');
  w.selectBook('bake-love-feelings'); await tick(4); w.render();
  ok(S().chapters.length === bookSeed.chapters.length, 'danh sách chương nạp từ GET /api/book/<slug> thật');
  const ed = $('#editor'); if (ed) ed.innerHTML = '<p>QA ghi chương thật</p>';
  setVal('chapterTitle', 'Chương QA 1');
  click('[data-act="save-chapter"]'); await tick(10);
  const ch = (KV.books['bake-love-feelings'].chapters || [])[S().activeChapter];
  ok(ch && /QA ghi chương thật/.test(ch.html || ''), 'PUT /api/book/<slug>/chapter ghi nội dung thật');

  /* ---- 6 · báo lỗi / bình luận / homepage / kiểm tra ---- */
  nav('bao-loi');
  const rpt = $('[data-act="toggle-report"]'); if (rpt) { rpt.click(); await tick(8); }
  ok(calls.some(c => c.p === '/api/admin/reports' && c.method === 'PATCH') && KV.reports[0].done === true, 'PATCH báo lỗi đổi trạng thái trên KV');

  nav('binh-luan');
  const del = $('[data-act="delete-comment"]');
  if (del) {
    del.click(); await tick(3);
    const b1 = $('[data-act="confirm-ok"]'); if (b1) b1.click(); await tick(3);
    confirmStrong('XOÁ'); await tick(8);
    ok(calls.some(c => c.method === 'DELETE' && c.p.startsWith('/api/comments/')), 'xoá bình luận gọi DELETE thật');
  } else ok(false, 'thiếu nút xoá bình luận');

  nav('homepage-cms');
  const hp = $('[data-act="save-homepage"]'); if (hp) { hp.click(); await tick(8); }
  ok(calls.filter(c => c.p === '/api/registry' && c.method === 'PUT').length >= 2, 'Lưu trang chủ PUT registry thật');
  nav('kiem-tra-du-lieu');
  ok(w.CZ_MOCKUP.SAMPLE_ISSUES.length > 0, 'Kiểm tra dữ liệu quét registry thật');
  ok(errors.length === 0, '0 lỗi JS ở các luồng ghi: ' + errors.join(' | '));

  /* ---- 7 · không có key ⇒ chặn ghi ---- */
  const n0 = calls.length;
  S().conn = 'static';
  nav('them-bo');
  setVal('nb-t', 'Không được ghi'); setVal('nb-slug', 'khong-duoc-ghi'); setVal('nb-a', 'QA');
  click('[data-act="submit-new"]'); await tick(4);
  ok(!KV.books['khong-duoc-ghi'] && !calls.slice(n0).some(c => c.method === 'PUT'), 'chế độ chỉ đọc không phát sinh PUT');

  /* ---- 8 · dọn dẹp bản sao ---- */
  ok(!fs.existsSync(path.join(ROOT, 'admin-cu.html')), 'admin-cu.html đã bị xoá');
  ok(!/\/admin-cu/.test(R('_headers')), '_headers không còn luật bản sao');
  ok(!/^\/admin\s+\/mockup/m.test(R('_redirects')), '_redirects không còn rewrite /admin → mockup');
  ok(/admin-real\.js/.test(R('_headers')), '_headers có rule cho admin-real.js');
  ok(!/ADMIN_KEY_QA|ten-worker/.test(realJs), 'admin-real.js không hardcode key/URL Worker');

  /* ---- 9 · prototype vẫn là bản MẪU ---- */
  const mockHtml = R('mockup/ssochuz-admin-mockup.html');
  const e2 = [];
  const vc2 = new VirtualConsole();
  vc2.on('jsdomError', x => e2.push(String((x && x.message) || x)));
  const dom2 = new JSDOM(mockHtml, { url: 'https://ssochuz.pages.dev/admin-mockup', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc2 });
  dom2.window.fetch = () => { e2.push('PROTOTYPE_CALLED_FETCH'); return Promise.reject(new Error('no')); };
  await sleep(120);
  ok(typeof dom2.window.CZ_MOCKUP === 'undefined', 'prototype không có CZ_MOCKUP');
  ok(!/<script[^>]+src="\/admin-real\.js/.test(mockHtml), 'prototype không nạp admin-real.js');
  ok(!e2.some(x => x.indexOf('PROTOTYPE_CALLED_FETCH') >= 0), 'prototype không gọi fetch');
  ok(e2.length === 0, 'prototype 0 lỗi JS: ' + e2.join(' | '));

  console.log(JSON.stringify({
    bai: 't_admin_real.js / vòng 10',
    dat: 0, loi: bad.length,
    soRequestToiWorkerGia: calls.length,
    errors0: bad.concat(errors)
  }, null, 1));
  if (bad.length) console.log('CÒN LỖI:\n - ' + bad.join('\n - '));
  w.close(); dom2.window.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => {
  console.log(JSON.stringify({ errors0: ['harness: ' + (e && e.stack || e)] }, null, 1));
  process.exit(2);
});
