/* ============================================================================
   Kiểm thử SỐ LIỆU XẾP HẠNG — nguồn là Worker KV (không còn Firebase)
   ----------------------------------------------------------------------------
   t_home.js kiểm tra “không có số liệu thì không hiện số bịa”.
   Bài này kiểm tra “khi Worker có số thật thì web dùng đúng số đó”:
     · /api/stats (KV) → bảng xếp hạng hiện lượt đọc/phiếu, đổi tab đổi tiêu chí
     · mở chương đọc  → có gọi POST /api/view (Worker đếm lượt đọc)
     · bấm Thích      → có gọi POST /api/vote và số phiếu trên nút cập nhật theo
     · thư viện có kiểu sắp xếp “Đọc nhiều nhất” và sắp đúng
     · đường dự phòng cũ: CZ_STATS_DIRECT = true thì đọc thẳng Firestore
   Chạy:  cd tests && node t_stats.js
   ========================================================================== */
const { page, dataFetch, read, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
const BASE = 'https://cms.test';
const STATS = path.join(__dirname, '_stats.json');       /* fixture Firestore cũ */

/* số liệu y hệt dáng Worker trả về từ KV (worker/cms.js → publicStat) */
const KV_ITEMS = {
  'third-person': { views: 1234, votes: 56, viewsDay: 12, votesDay: 2, viewsWeek: 120, votesWeek: 20, viewsMonth: 400, votesMonth: 40, trendingScore: 60 },
  'hometown-romance-special': { views: 987, votes: 31, viewsDay: 3, votesDay: 0, viewsWeek: 40, votesWeek: 5, viewsMonth: 200, votesMonth: 22, trendingScore: 20 },
  'lunar-secret': { views: 450, votes: 12, viewsDay: 1, votesDay: 0, viewsWeek: 9, votesWeek: 1, viewsMonth: 60, votesMonth: 7, trendingScore: 5 },
  'co-vo-ho-anh-cua-toi': { views: 320, votes: 9, viewsDay: 0, votesDay: 0, viewsWeek: 2, votesWeek: 0, viewsMonth: 30, votesMonth: 4, trendingScore: 1 }
};
const J = (b, ok, st) => Promise.resolve({
  ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b))
});

const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = (d, s) => d.querySelector(s), $$ = (d, s) => [...d.querySelectorAll(s)];
const txt = (d, s) => { const e = $(d, s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };

/* Worker giả: registry + book + các endpoint số liệu của worker/cms.js */
function makeApi(log, votes) {
  const REG = JSON.parse(read('data/registry.json'));
  return (p, opt) => {
    log.push((opt.method || 'GET') + ' ' + p);
    if (p === '/api/registry') return J(REG);
    const mb = p.match(/^\/api\/book\/(.+)$/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false, error: 'chưa có' }, false, 404);
    }
    if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: KV_ITEMS });
    if (p === '/api/view' && opt.method === 'POST') {
      const b = JSON.parse(opt.body || '{}');
      log.push('   view: ' + b.slug + ' vid=' + (b.vid ? 'có' : 'không'));
      return J({ ok: true, counted: true, day: new Date().toISOString().slice(0, 10) });
    }
    if (p === '/api/vote' && opt.method === 'POST') {
      const b = JSON.parse(opt.body || '{}');
      const cur = votes[b.slug] === undefined ? (KV_ITEMS[b.slug] || {}).votes || 0 : votes[b.slug];
      votes[b.slug] = b.vote ? cur + 1 : Math.max(0, cur - 1);
      return J({ ok: true, slug: b.slug, votes: votes[b.slug], voted: !!b.vote });
    }
    return undefined;    /* phần còn lại để dataFetch lo (registry, book…) */
  };
}

(async () => {
  const out = {};

  /* ---------- 1. trang chủ: BXH lấy số từ KV ---------- */
  const log = [], votes = {};
  const p = page('index.html', {
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(log, votes), log })
  });
  await wait(1500);
  out.stats = {
    on: !!(p.win.CZ._memo.stats && p.win.CZ._memo.stats.on),
    nguon: (p.win.CZ._memo.stats || {}).source,
    soBo: Object.keys((p.win.CZ._memo.stats || {}).items || {}).length
  };
  out.rankTabs = $$(p.doc, '#rankTabs .tab').map(b => b.textContent.trim());
  out.rankTop = $$(p.doc, '#rank .rank').slice(0, 3).map(r => ({
    ten: r.querySelector('.tt b').textContent.trim(),
    so: r.querySelector('.v').textContent.trim()
  }));
  out.rankCoSoThat = /lượt đọc/.test(txt(p.doc, '#rank'));
  p.doc.querySelector('[data-mode="votes"]').click();
  out.khongUocLuong = !/ước lượng/.test(txt(p.doc, '#rank'));

  /* đổi tab Tháng → vẫn có số, thứ tự có thể đổi theo phiếu tháng */
  const tabs = $$(p.doc, '#rankTabs .tab');
  const monthTab = tabs.find(b => /Tháng/.test(b.textContent));
  if (monthTab) { monthTab.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true })); await wait(250); }
  out.rankThang = $$(p.doc, '#rank .rank').slice(0, 3).map(r => r.querySelector('.tt b').textContent.trim());

  /* ---------- 2. thư viện: sắp xếp “Đọc nhiều nhất” ---------- */
  const sel = $(p.doc, '#fSort');
  out.sortOptions = [...sel.options].map(o => o.textContent);
  out.hasViewsSort = out.sortOptions.includes('Đọc nhiều nhất');
  sel.value = 'views'; sel.dispatchEvent(new p.win.Event('change', { bubbles: true })); await wait(300);
  out.viewsFirst = (($(p.doc, '#grid .card h3') || {}).textContent || '').trim();
  sel.value = 'new'; sel.dispatchEvent(new p.win.Event('change', { bubbles: true })); await wait(150);
  out.errors0 = p.errors.slice(0, 5);

  /* ---------- 3. trang đọc: đếm lượt đọc + bấm Thích gửi lên KV ---------- */
  const log2 = [], votes2 = {};
  const st = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/#chuong-2',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(log2, votes2), log: log2 })
  });
  await wait(1600);
  const acts = $(st.doc, '#rdActs');
  out.readerChip = {
    coChip: !!acts && /lượt đọc/.test(acts.textContent),
    text: acts ? (acts.querySelector('.chip') || {}).textContent : '',
    likeBtn: acts ? (acts.querySelector('#actLike span') || {}).textContent : ''
  };
  out.goiApiView = log2.filter(u => u.startsWith('POST /api/view')).length;
  out.viewCoVid = log2.some(u => /view: third-person vid=có/.test(u));

  /* bấm Thích → gửi /api/vote, nhãn cập nhật số phiếu Worker trả về (56 → 57) */
  const like = $(st.doc, '#actLike');
  if (like) { like.dispatchEvent(new st.win.MouseEvent('click', { bubbles: true })); await wait(300); }
  out.readerLike = like ? like.textContent.trim() : '';
  out.goiApiVote = log2.filter(u => u.startsWith('POST /api/vote')).length;
  out.soPhieuSauKhiBau = votes2['third-person'];
  out.errStory = st.errors.slice(0, 4);

  /* ---------- 4. đường dự phòng cũ: đọc thẳng Firestore ---------- */
  const old = page('index.html', {
    config: { CZ_API: BASE, CZ_STATS_DIRECT: true },
    fetch: dataFetch({ apiBase: BASE, api: (p2) => (p2 === '/api/stats' ? J({ ok: false, error: 'chưa có số trên KV' }, false, 404) : undefined), stats: STATS })
  });
  await wait(1500);
  out.fallbackFirebase = {
    on: !!(old.win.CZ._memo.stats && old.win.CZ._memo.stats.on),
    nguon: (old.win.CZ._memo.stats || {}).source,
    soBo: Object.keys((old.win.CZ._memo.stats || {}).items || {}).length,
    errors: old.errors.slice(0, 3)
  };

  console.log(JSON.stringify(out, null, 1));
  const bad = p.errors.length + st.errors.length + old.errors.length;
  console.log(bad ? 'CÒN ' + bad + ' LỖI JS' : 'Không lỗi JS nào');
  process.exit(0);
})();
