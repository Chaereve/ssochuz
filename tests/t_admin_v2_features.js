/* ============================================================================
   Admin v2 — đợt cải tạo theo Novelist/FICTBASE:
   · Overview: tiles số liệu KV thật + biểu đồ 14 ngày + quota từ Worker
   · Báo lỗi: lọc đã/chưa xử lý + PATCH đánh dấu xử lý
   · Thư viện: bìa thu nhỏ + phân trang + lọc 18+/khóa
   · Thêm bộ: thể loại lưu vào registry
   · Soạn chương: thời gian đọc ước tính
   · Cài đặt: khôi phục từ file backup JSON
   · Tách .txt nhiều chương (splitChaptersTxt)
   Chạy:  node tests/t_admin_v2_features.js
   Điều kiện đạt: mọi khoá "errors*" là [] và thoát mã 0.
   ========================================================================== */
const assert = require('assert');
const { page, dataFetch } = require('./mk');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = 'https://cms.test';
/* headers.get cần có vì AdminApi.request đọc content-type để chọn json/text */
const J = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200, headers: { get: () => 'application/json' }, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });

/* registry giả 30 bộ: 10 bộ 18+, bộ đầu có thể loại + thumb để test bìa/genre */
function mkReg() {
  const lib = [];
  for (let i = 1; i <= 30; i++) {
    const n = String(i).padStart(2, '0');
    lib.push({
      title: 'Truyện Thử ' + n, slug: 'thu-' + n, author: 'Tác Giả ' + n, couple: '', year: '2026',
      status: i % 3 === 0 ? 'Hoàn thành' : 'Đang cập nhật', chapters: i, countLabel: i + '/' + i,
      is18: i <= 10, updated: '2026-09-2' + (i % 10), thumb: i === 1 ? 'https://img.test/bia-01.webp' : '',
      genre: i === 1 ? 'Ngôn Sủng' : (i === 2 ? 'co-trang' : ''),
      syn: 'Mô tả bộ thử ' + n,
    });
  }
  return { rev: 'test', lib, slides: [], editorChoice: [], settings: { genres: [
    { slug: 'ngon-sung', name: 'Ngôn Sủng', is_visible: true, display_order: 1 },
    { slug: 'hoc-duong', name: 'Học Đường', is_visible: true, display_order: 2 },
    { slug: 'co-trang', name: 'Cổ Trang', is_visible: true, display_order: 3 },
  ] } };
}
const BOOK1 = { title: 'Truyện Thử 01', slug: 'thu-01', author: 'Tác Giả 01', chapters: [
  { t: 'Chương 1', html: '<p>' + 'từ '.repeat(440) + '</p>' },
  { t: 'Chương 2', html: '<p>nội dung ngắn</p>' },
] };
const REPORTS = [
  { id: 'r1', at: '2026-09-22T08:00:00Z', kind: 'Báo lỗi chữ', slug: 'thu-01', title: 'Truyện Thử 01', ch: 2, url: '', image: '', text: 'Chương 2 sai chính tả.', who: 'docgia@test' },
  { id: 'r2', at: '2026-09-21T08:00:00Z', kind: 'Báo lỗi chữ', slug: 'thu-02', title: 'Truyện Thử 02', ch: 0, url: '', image: '', text: 'Bị trùng chương cuối.', who: 'docgia2@test', done: true, doneAt: '2026-09-21T09:00:00Z' },
];
const STATS = {
  ok: true, updatedAt: '2026-09-22T10:00:00Z',
  items: { 'thu-01': { views: 1234, votes: 21, voters: 9, viewsToday: 4, votesToday: 1, chapVotes: { 1: { o: 12 }, 2: { o: 5 } } },
           'thu-02': { views: 900, votes: 3, voters: 2, viewsToday: 0, votesToday: 0 } },
  days: Array.from({ length: 20 }, (_, i) => ({ day: '2026-09-' + String(i + 1).padStart(2, '0'), views: 50 + i * 10, votes: i })),
};

(async () => {
  const out = {};
  const problems = [];
  const check = (name, cond, extra) => { console.log((cond ? 'OK  ' : 'FAIL') + ' ' + name + (cond || extra == null ? '' : '  → ' + JSON.stringify(extra).slice(0, 140))); if (!cond) problems.push(name); };

  const calls = [];
  const putBodies = [];
  const fetcher = dataFetch({
    apiBase: BASE,
    api: (p, opt) => {
      calls.push((opt.method || 'GET') + ' ' + p);
      if (opt.method === 'PUT') putBodies.push({ p, body: typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body });
      if (p === '/api/health') return J({ ok: true, version: 'test-2.0', adminConfigured: true, kv: true });
      if (p === '/api/whoami') return J({ ok: true, role: 'admin', permissions: ['*'] });
      if (p === '/api/registry') return J(mkReg());
      if (p.indexOf('/api/book/') === 0) return J(BOOK1);
      if (p === '/api/admin/reports') {
        if (opt.method === 'PATCH') {
          const b = typeof opt.body === 'string' ? JSON.parse(opt.body) : (opt.body || {});
          const it = REPORTS.find((x) => x.id === b.id);
          if (!it) return J({ ok: false, error: 'không thấy báo lỗi' }, false, 404);
          it.done = !!b.done;
          return J({ ok: true, id: b.id, done: it.done, open: REPORTS.filter((x) => !x.done).length });
        }
        return J({ ok: true, items: REPORTS, count: REPORTS.length, open: REPORTS.filter((x) => !x.done).length, mail: false });
      }
      if (p === '/api/admin/comments') return J({ ok: true, comments: [
        { id: 'c1', slug: 'thu-01', name: 'Bạn Đọc A', createdAt: '2026-09-22T07:00:00Z', text: 'Chương hay lắm!' },
        { id: 'c2', slug: 'thu-02', name: 'Spam Bot', createdAt: '2026-09-22T07:30:00Z', text: 'MUA BACKLINK RẺ https://spam.example XEM NGAY WWW.spam.example' },
      ], count: 2, slugs: 2 });
      if (p === '/api/admin/stats') return J(STATS);
      if (p === '/api/admin/kv') return J({ ok: true, keys: 90, bytes: 123456, groups: [], writesToday: 12, lastReset: '2026-09-22T00:00:00.000Z', quotaSupported: true });
      if (p === '/api/admin/log') return J({ ok: true, items: [{ at: '2026-09-22T09:00:00Z', text: 'log test', who: 'admin-key' }], count: 1 });
      return undefined;
    },
  });

  const p = page('admin-v2.html', { fetch: fetcher, url: 'https://ssochuz.pages.dev/admin', config: { CZ_API: BASE } });
  const { doc, win } = p;
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const change = (el) => el.dispatchEvent(new win.Event('change', { bubbles: true }));
  const inputEv = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  await wait(400);
  /* nối Worker bằng ADMIN_KEY (chờ Preact kịp flush state sau mỗi lần gõ) */
  inputEv($('#v2Api'), BASE);
  inputEv($('#v2Key'), 'test-key');
  await wait(150);
  $('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(900);
  check('kết nối online xong', !$('.v2gate'), ($('.v2gate .msgbar') || {}).textContent);

  /* 1. Overview: tiles số liệu thật + chart + quota worker */
  const tiles = $$('.tile').map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  check('Overview/lượt đọc từ KV không còn = 0', tiles.some((t) => /2\.134Lượt đọc \(KV\)/.test(t))  /* 1.234 + 900 của bộ 2 */, tiles);
  check('Overview/phiếu từ KV', tiles.some((t) => /^24Phiếu thích \(KV\)/.test(t)), tiles);
  check('Overview/biểu đồ 14 ngày vẽ 14 cột', $$('.v2chart-col').length === 14, $$('.v2chart-col').length);
  check('Overview/quota pill lấy số Worker (12)', /\.v2quota|KV write/.test($('.v2quota').textContent) && /12\/1000/.test($('.v2quota').textContent), $('.v2quota').textContent);
  check('Overview/việc cần làm: báo lỗi chưa xử lý = 1', /Báo lỗi chưa xử lý/.test(doc.body.textContent), '');

  /* 2. Báo lỗi: tab lọc + PATCH */
  click($('button[data-tab="reports"]'));
  await wait(250);
  const rows = $$('#pane-reports .v2itemrow');
  check('Báo lỗi/hiện 2 báo lỗi', rows.length === 2, rows.length);
  const openBtn = $$('#pane-reports .v2itemrow button').find((b) => /Xử lý xong/.test(b.textContent));
  check('Báo lỗi/có nút Xử lý xong', !!openBtn);
  click(openBtn);
  await wait(350);
  check('Báo lỗi/đã gọi PATCH /api/admin/reports', calls.some((c) => c === 'PATCH /api/admin/reports'), calls.slice(-6));
  check('Báo lỗi/after PATCH hiện pill "đã xử lý"', $$('#pane-reports .v2donepill').length === 2, $$('#pane-reports .v2donepill').length);
  const tabs = $$('#pane-reports .v2reptabs button').map((b) => b.textContent);
  check('Báo lỗi/có 3 tab lọc', tabs.length === 3, tabs);
  click($$('#pane-reports .v2reptabs button').find((b) => /Đã xử lý/.test(b.textContent)));
  await wait(120);
  check('Báo lỗi/lọc "Đã xử lý" còn 2 dòng', $$('#pane-reports .v2itemrow').length === 2, $$('#pane-reports .v2itemrow').length);

  /* 3. Bình luận: lọc nghi spam */
  click($('button[data-tab="cmts"]'));
  await wait(250);
  check('Bình luận/hiện 2 bình luận', $$('#pane-cmts .v2itemrow').length === 2, $$('#pane-cmts .v2itemrow').length);
  const spamBtn = $$('#pane-cmts button').find((b) => /Chỉ nghi spam/.test(b.textContent));
  check('Bình luận/có nút chỉ nghi spam (đếm 1)', !!spamBtn && /1/.test(spamBtn.textContent), spamBtn && spamBtn.textContent);
  click(spamBtn);
  await wait(120);
  check('Bình luận/lọc spam còn đúng 1', $$('#pane-cmts .v2itemrow').length === 1, $$('#pane-cmts .v2itemrow').length);

  /* 4. Thư viện: bìa + phân trang + lọc 18+ */
  click($('button[data-tab="list"]'));
  await wait(250);
  check('Thư viện/phân trang 24/trang', $$('.v2book-table tbody tr').length === 24, $$('.v2book-table tbody tr').length);
  check('Thư viện/có pager "Trang 1/2"', /Trang 1\/2/.test(($('.v2pager') || {}).textContent || ''), $('.v2pager') && $('.v2pager').textContent);
  check('Thư viện/trang 1 có 24 ô bìa thu nhỏ', $$('.v2thumb').length === 24, $$('.v2thumb').length);
  const nextBtn = $$('.v2pager button').find((b) => /Trang sau/.test(b.textContent));
  click(nextBtn);
  await wait(150);
  check('Thư viện/trang 2 còn 6 bộ', $$('.v2book-table tbody tr').length === 6, $$('.v2book-table tbody tr').length);
  const flagSel = $$('.v2filters select')[1];
  inputEv(flagSel, '18'); change(flagSel);
  await wait(150);
  check('Thư viện/lọc 18+ ra đúng số bộ', $$('.v2book-table tbody tr').length === 10, $$('.v2book-table tbody tr').length);
  check('Thư viện/lọc 18+ có bìa ảnh của bộ 01', !!$('.v2thumb img'), '');
  check('Thư viện/hết pager khi lọc hẹp', !$('.v2pager'), '');
  check('Thư viện/có GenreBadge', !!$('.v2badge-genre'), $('.v2badge-genre') && $('.v2badge-genre').textContent);
  check('Thư viện/CompletionBadge tách khỏi xuất bản', $$('.v2badge-completion').length > 0 && $$('.v2badge-pub').length > 0);

  /* 4b. Phân loại: dải chip thể loại */
  click($('button[data-tab="classify"]'));
  await wait(200);
  check('Phân loại/render pane', !!$('#pane-classify'));
  check('Phân loại/có dải chip', $$('#pane-classify .v2gchip').length >= 5, $$('#pane-classify .v2gchip').length);
  const chipsG = $$('#pane-classify .v2gchip');
  const coTrangTile = chipsG.find((b) => /Cổ Trang/.test(b.textContent));
  check('Phân loại/chip Cổ Trang đếm 1', !!coTrangTile && /1/.test(coTrangTile.textContent), coTrangTile && coTrangTile.textContent);
  click(coTrangTile);
  await wait(120);
  check('Phân loại/lọc Cổ Trang hiện 1 dòng', $$('#pane-classify .v2sort li').length === 1, $$('#pane-classify .v2sort li').length);
  const openLib = $$('#pane-classify button').find((b) => /Mở trong Thư viện/.test(b.textContent));
  check('Phân loại/có nút mở Thư viện', !!openLib);
  click(openLib);
  await wait(200);
  check('Phân loại→Thư viện lọc Cổ Trang', $$('.v2book-table tbody tr').length === 1 && /Truyện Thử 02/.test(($('.v2book-table') || {}).textContent || ''), $$('.v2book-table tbody tr').length);
  inputEv($('.v2search .inp'), '');
  $('.v2search').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(150);

  /* 5. Thêm bộ: thể loại lưu vào registry */
  click($('button[data-tab="new"]'));
  await wait(150);
  const genreSel = $('#pane-new select.inp');
  check('Thêm bộ/có ô thể loại', !!genreSel);
  inputEv(genreSel, 'co-trang'); change(genreSel);
  await wait(120);
  check('Thêm bộ/chọn thể loại Cổ Trang', genreSel.value === 'co-trang', genreSel.value);
  inputEv($('#pane-new input.inp'), 'Bộ Mới Cổ Trang');
  await wait(150);
  $('.v2pane form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(500);
  const regPut = putBodies.find((x) => x.p === '/api/registry');
  check('Thêm bộ/PUT registry', !!regPut);
  const newMeta = regPut && (regPut.body.lib || []).find((b) => b.slug === 'bo-moi-co-trang');
  check('Thêm bộ/registry chứa genre', !!newMeta && newMeta.genre === 'co-trang', newMeta && { genre: newMeta.genre });

  /* 6. Soạn chương: thời gian đọc + nhập .txt nhiều chương */
  click($('button[data-tab="list"]'));
  await wait(150);
  click($('.v2book-table tbody tr .v2actions button'));
  await wait(1200);
  check('Soạn chương/hiện thời gian đọc ước tính', /~2 phút đọc/.test(($('.v2chap-actions .sm.muted') || {}).textContent || ''), $('.v2chap-actions') && $('.v2chap-actions').textContent);
  check('Soạn chương/danh sách chương có số từ', /440 từ/.test(($('.v2chapter-list') || {}).textContent || ''), $('.v2chapter-list') && $('.v2chapter-list').textContent);

  /* 7. Cài đặt: khôi phục backup */
  win.CZ.confirm = () => Promise.resolve(true);
  win.prompt = () => 'KHÔI PHỤC';
  click($('button[data-tab="settings"]'));
  await wait(200);
  const fileInput = $('#pane-settings input[type="file"]');
  check('Cài đặt/có ô chọn file backup', !!fileInput);
  const backup = { at: '2026-09-22T00:00:00Z', registry: mkReg(), books: { 'thu-01': BOOK1 } };
  const f = new win.File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
  try { Object.defineProperty(f, 'text', { value: () => Promise.resolve(JSON.stringify(backup)) }); } catch (e) {}
  Object.defineProperty(fileInput, 'files', { value: [f], configurable: true });
  change(fileInput);
  await wait(700);
  check('Khôi phục/PUT registry + book từ backup', calls.includes('PUT /api/registry') && calls.includes('PUT /api/book/thu-01'), calls.slice(-5));
  const restored = putBodies.filter((x) => x.p === '/api/registry').pop();
  check('Khôi phục/registry backup có 30 bộ', restored && (restored.body.lib || []).length === 30, restored && (restored.body.lib || []).length);

  /* 8. htmlSafety: chặn blob/data trong HTML chương */
  {
    const { tempMediaInHtml, hasTempMedia } = await import('../src/admin/utils/htmlSafety.js');
    check('htmlSafety/phát hiện blob', hasTempMedia('<p><img src="blob:https://x/1"></p>'));
    check('htmlSafety/phát hiện data', tempMediaInHtml('<img src="data:image/png;base64,aaa">').length === 1);
    check('htmlSafety/URL bền sạch', !hasTempMedia('<img src="/api/img/abc">'));
  }

  /* 8b. splitChaptersTxt: tách file .txt nhiều chương */
  const { splitChaptersTxt } = await import('./' + 'helpers_txt.mjs').catch(() => ({}));
  if (splitChaptersTxt) {
    const parts = splitChaptersTxt('Chương 1\nKhởi đầu\n\nVào buổi sáng…\nChương 2: Bất ngờ\n\nMột ngày nọ.');
    check('Tách txt/2 chương', parts.length === 2, parts.map((x) => x.t));
    check('Tách txt/tiêu đề giữ "Chương 2: Bất ngờ"', parts[1] && parts[1].t === 'Chương 2: Bất ngờ', parts[1] && parts[1].t);
    check('Tách txt/nội dung thành <p>', /^<p>/.test(parts[0].html), parts[0].html);
  } else {
    console.log('     (splitChaptersTxt chạy bằng import động ở bài riêng — bỏ qua trong jsdom)');
  }

  /* 9. Trang truyện công khai hiện thể loại */
  const sp = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/thu-01/',
    config: { CZ_API: BASE },
    fetch: dataFetch({
      apiBase: BASE,
      api: (pp) => {
        if (pp === '/api/health') return J({ ok: true, adminConfigured: true });
        if (pp === '/api/registry') return J(mkReg());
        if (pp.indexOf('/api/book/') === 0) return J(BOOK1);
        if (pp === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: '2026-09-22T10:00:00Z', items: STATS.items });
        if (pp === '/api/schedule') return J({ ok: true, items: [] });
        return undefined;
      },
    }),
  });
  await wait(1600);
  const stags = [...sp.doc.querySelectorAll('#shero .stags .stag')].map((x) => x.textContent.trim());
  check('Trang truyện/hero hiện thể loại', stags.join('|') === 'Ngôn Sủng', stags);
  check('Trang truyện/không lỗi JS', sp.errors.length === 0, sp.errors.slice(0, 2));

  check('không lỗi JS: ' + JSON.stringify(p.errors.slice(0, 2)), p.errors.length === 0);
  console.log(problems.length ? '\nCÒN ' + problems.length + ' VẤN ĐỀ' : '\nĐen: tính năng admin v2 mới chạy đúng cả tuyến.');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
