/* ============================================================================
   /admin với registry CÓ DÒNG RÁC — vẫn mở được để sửa dữ liệu
   ----------------------------------------------------------------------------
   Bối cảnh (lượt rà 2026-11-12): lớp đọc registry của /admin gọi
   `lib.map(metaToBook)`; `metaToBook(null)` đọc `m.slug` ⇒ TypeError ngay khi
   đổ dữ liệu. Nghĩa là dòng rác (import hỏng / sửa KV tay) làm web sập thư
   viện, và cũng làm LUÔN trang quản trị không tải được — đúng lúc cần vào để
   dọn dữ liệu. `schedule.items` có null cũng vậy.

   Bài này khoá lại:
     · /admin kết nối được, S.books chỉ giữ dòng hợp lệ, mở tab Thư viện OK;
     · slide/lịch rác bị bỏ;
     · bấm “Lưu trang chủ” ghi lại registry ĐÃ SẠCH (không còn null).
   Chạy:  node tests/t_admin_dirty_registry.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GOOD = { slug: 'good-story', title: 'Truyện Tốt', chapters: 3, thumb: 'https://x.test/a.webp', syn: 'mô tả', status: 'Đang cập nhật' };
let REGISTRY = {
  rev: '2026-11-12 09:00',
  lib: [null, GOOD, 0, 'rác', { slug: '', title: 'thiếu slug' }],
  editorChoice: [null, { slug: 'good-story' }],
  slides: [null, { slug: 'good-story', reason: 'lý do' }, 5],
  schedule: { items: [null, { slug: 'good-story', days: 'Thứ 2' }, { days: '' },
    /* dòng CHỈ có title: dạng syncBlogger ghi ra, trang chủ ghép bộ theo tên */
    { days: 'Thứ 3', title: 'Truyện Cũ', detail: 'ra sớm' }], note: '' },
  settings: { announcement: { text: '', href: '', enabled: false } },
};
const puts = [];
const resp = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (n) => (String(n).toLowerCase() === 'content-type' ? 'application/json' : '') },
  json: async () => data, text: async () => JSON.stringify(data),
});
function fakeFetch(url, opts = {}) {
  const u = new URL(String(url), 'https://ssochuz.pages.dev');
  const p = u.pathname, method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  const send = (d, st) => Promise.resolve(resp(d, st));
  if (p === '/api/health') return send({ ok: true });
  if (p === '/api/whoami') return send({ ok: true, role: 'super_admin' });
  if (p === '/api/registry') {
    if (method === 'PUT') { puts.push(body); REGISTRY = body; return send({ ok: true }); }
    return send(REGISTRY);
  }
  if (p === '/api/book/good-story' || p === '/api/book/good-story/toc') {
    return send({ ok: true, slug: 'good-story', title: 'Truyện Tốt', chapters: [{ t: 'Chương 1', html: '<p>một</p>' }] });
  }
  if (p === '/api/admin/comments') return send({ ok: true, comments: [] });
  if (p === '/api/admin/reports') return send({ ok: true, items: [] });
  if (p === '/api/admin/stats') return send({ ok: true, items: {}, days: [] });
  if (p === '/api/admin/log') return send({ ok: true, items: [] });
  if (p === '/api/admin/kv') return send({ ok: true, writesToday: 0, readsToday: 0, keys: 0, bytes: 0, groups: [] });
  if (p === '/api/admin/voters') return send({ ok: true, book: { count: 0, voters: [] } });
  return send({ ok: false, error: 'endpoint giả chưa có: ' + p }, 404);
}

const html = R('admin.html').replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, '');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + ((e && e.message) || e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.fetch = (u, o) => fakeFetch(u, o);
w.addEventListener('error', (e) => errors.push('window.error: ' + ((e && e.message) || e)));
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};
w.eval(R('admin-real.js'));

const $ = (s) => w.document.querySelector(s);
const S = () => w.CZ_MOCKUP.state;
function setVal(id, v) {
  const e = w.document.getElementById(id);
  if (!e) throw new Error('không thấy #' + id);
  e.value = v;
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await sleep(25); };

(async () => {
  await sleep(150);
  setVal('gate-api', 'https://worker.test');
  setVal('gate-key', 'ADMIN_KEY_QA');
  $('[data-act="connect"]').click();
  await tick(14);

  ok(errors.length === 0, '0 lỗi JS khi nạp /admin với registry rác: ' + errors.slice(0, 3).join(' | '));
  ok(S().conn === 'online', 'không kết nối được Worker (đang ' + S().conn + ')');
  ok(S().books.length === 1 && S().books[0].id === 'good-story',
    'S.books phải chỉ còn 1 bộ hợp lệ, đang: ' + JSON.stringify(S().books.map((b) => b.id)));
  ok(w.CZ_MOCKUP.SAMPLE_METRICS[0].n === '1', 'Dashboard đếm sai số bộ (' + w.CZ_MOCKUP.SAMPLE_METRICS[0].n + ')');
  ok(S().slides.length === 1 && S().slides[0].b === 'good-story', 'slide rác vẫn lọt: ' + JSON.stringify(S().slides));
  ok(S().schedule.length === 2 && S().schedule[0].b === 'good-story', 'lịch rác vẫn lọt / mất dòng title: ' + JSON.stringify(S().schedule));
  ok(S().schedule[1] && S().schedule[1].b === '' && S().schedule[1].t === 'Truyện Cũ',
    'dòng lịch chỉ có title phải được giữ kèm tên bộ: ' + JSON.stringify(S().schedule[1]));

  /* mở tab Thư viện: trước đây hydrate đã ném lỗi nên tab rỗng */
  S().route = 'thu-vien';
  w.render();
  await tick(4);
  ok(/Truyện Tốt/.test($('#view').textContent || ''), 'tab Thư viện không hiện bộ hợp lệ');

  /* Lưu trang chủ ⇒ registry ghi lại KHÔNG còn dòng rác */
  w.saveHomepage();
  await tick(10);
  const last = puts[puts.length - 1];
  ok(!!last, 'không có lệnh PUT /api/registry nào khi bấm Lưu trang chủ');
  ok(last && Array.isArray(last.lib) && last.lib.every((m) => m && typeof m === 'object' && m.slug),
    'registry ghi lên vẫn còn dòng rác: ' + JSON.stringify(last && last.lib));
  ok(last && last.lib.length === 1, 'registry ghi lên phải còn đúng 1 bộ, đang ' + (last && last.lib.length));
  ok(last && Array.isArray(last.schedule && last.schedule.items) && last.schedule.items.every((x) => x && (x.slug || x.title)),
    'lịch ghi lên vẫn còn dòng rác: ' + JSON.stringify(last && last.schedule && last.schedule.items));
  ok(last && last.schedule.items.length === 2, 'Lưu trang chủ đã nuốt mất dòng lịch cũ: ' + JSON.stringify(last && last.schedule && last.schedule.items));
  ok(last && last.schedule.items[1] && last.schedule.items[1].title === 'Truyện Cũ' && !last.schedule.items[1].slug,
    'dòng lịch cũ mất title hoặc bị ghi slug rỗng: ' + JSON.stringify(last && last.schedule.items[1]));

  dom.window.close();
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  console.log(JSON.stringify({
    errors0: [],
    checked: '/admin với registry có null/rác: kết nối được, chỉ giữ bộ hợp lệ, tab Thư viện hiện đúng, Lưu trang chủ ghi registry đã sạch',
  }));
})().catch((e) => { console.error(e.stack || e.message || e); process.exit(1); });
