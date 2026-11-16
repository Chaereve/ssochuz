/* =============================================================================
   Vòng 18 · RÀ CÁC TAB CÒN LẠI CỦA ADMIN (ngoài trang chủ)

   Bài này khoá những chỗ dữ liệu THẬT không bao giờ chạm tới màn hình, hoặc
   màn hình nói sai về dữ liệu:

     S1  Thống kê · “Phiếu theo chương” LUÔN rỗng: khối đó đọc state.votes
         (danh sách NGƯỜI bầu từ /api/admin/voters) thay vì chapVotes mà
         /api/admin/stats đã trả về ⇒ có phiếu theo chương vẫn báo “chưa có”.
     S2  Thống kê · “Bộ có số liệu” đếm state.books.length (67) trong khi chỉ
         3 bộ có số liệu ⇒ KPI sai ngay dòng đầu.
     S3  Thống kê · bảng bịa thêm dòng “—” cho đủ 5 dòng ⇒ trông như có bộ
         tên “—” với 0 lượt đọc.
     S4  Thống kê · dòng “Hôm nay” luôn 0 vì loadStats đọc it.viewsDay nhưng
         vẫn giữ nguyên toàn bộ chuỗi cũ khi top có ít hơn 5 bộ.
     S5  Thống kê · chuỗi ngày (days) từ Worker bị cắt còn 14 và không vẽ
         thành biểu đồ ⇒ tab này chỉ có bảng, không có xu hướng.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const prod = R('admin.html'), real = R('admin-real.js');
const reg = JSON.parse(R('data/registry.json'));
const resp = (x, st = 200) => ({ ok: st < 400, status: st, headers: { get: () => 'application/json' }, json: async () => x, text: async () => JSON.stringify(x) });

/* Số liệu giả lập ĐÚNG dáng Worker trả về (worker/cms.js · adminStats). */
const STATS = {
  'lunar-secret': { views: 4200, votes: 31, voters: 22, viewsDay: 120, chapVotes: { '64': 12, '63': 8 } },
  'yours-ever': { views: 900, votes: 4, voters: 3, viewsDay: 20, chapVotes: { '12': 2 } },
  'chain': { views: 50, votes: 0, voters: 0, viewsDay: 1, chapVotes: {} },
};
const DAYS = [
  { day: '2026-11-08', views: 100, votes: 4 }, { day: '2026-11-09', views: 220, votes: 6 },
  { day: '2026-11-10', views: 340, votes: 9 }, { day: '2026-11-11', views: 180, votes: 2 },
];

function build(withStats) {
  const errs = [];
  const puts = [];
  const pre = '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");sessionStorage.setItem("cz_kv_key","K");}catch(e){}<\/script>';
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, pre + '<script>' + real + '</script>');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console: ' + a.join(' ')));
  const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, D = w.document;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.fetch = (u, o = {}) => {
    const p = new URL(String(u), 'https://ssochuz.pages.dev').pathname;
    if (p === '/api/registry' && (o.method || 'GET') === 'PUT') { puts.push(JSON.parse(o.body)); return Promise.resolve(resp({ ok: true })); }
    if (p === '/api/registry') return Promise.resolve(resp(reg));
    if (p === '/api/health' || p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
    if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 137, readsToday: 4021, keys: 82, groups: [] }));
    if (p === '/api/admin/stats') return Promise.resolve(resp(withStats ? { ok: true, items: STATS, days: DAYS } : { ok: true, items: {}, days: [] }));
    if (/^\/api\//.test(p)) return Promise.resolve(resp({ ok: true, items: [], comments: [], reports: [] }));
    return Promise.resolve(resp({}));
  };
  return { w, D, dom, errs, puts };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const bad = []; let checks = 0;
const ok = (c, m) => { checks++; if (!c) bad.push(m); };

(async () => {
  /* ---------------------------------------------------- CÓ SỐ LIỆU */
  const env = build(true);
  await wait(2200);
  const { w, D, errs } = env;
  const S = w.CZ_MOCKUP.state;
  S.route = 'thong-ke'; w.render();
  const view = () => D.getElementById('view').textContent.replace(/\s+/g, ' ');
  const txt = view();

  /* S1 · phiếu theo chương */
  ok(/Phiếu theo chương/.test(txt), 'Thống kê: có khối “Phiếu theo chương”');
  ok(!/Chưa có phiếu nào trong KV/.test(txt),
    'S1: có chapVotes trong /api/admin/stats thì KHÔNG được báo “chưa có phiếu”');
  ok(/Chương 64/.test(txt) && /Chương 63/.test(txt),
    'S1: hiện đúng tên chương có phiếu (Chương 64, Chương 63)');
  const chapCard = [...D.querySelectorAll('#view .card')].find(c => /Phiếu theo chương/.test(c.textContent));
  ok(chapCard && /12/.test(chapCard.textContent),
    'S1: hiện đúng SỐ phiếu của chương (64 → 12)');

  /* S2 · KPI bộ có số liệu */
  const kpis = [...D.querySelectorAll('#view .grid3 .card')].map(c => c.textContent.replace(/\s+/g, ' '));
  const first = kpis[0] || '';
  ok(/^3/.test(first.trim()) || /\b3Bộ có số liệu/.test(first),
    'S2: “Bộ có số liệu” = 3 (số bộ THẬT SỰ có số liệu), thấy: ' + first);

  /* S3 · không bịa dòng “—” */
  const rows = [...D.querySelectorAll('#view table tbody tr')].map(tr => tr.textContent.replace(/\s+/g, ' '));
  ok(rows.length === 3, 'S3: bảng chỉ có 3 dòng thật, không đệm “—” cho đủ 5 (thấy ' + rows.length + ')');
  ok(!rows.some(r => /^—/.test(r.trim())), 'S3: không có dòng tên “—”');

  /* S4 · cột Hôm nay */
  ok(rows.some(r => /120 đọc/.test(r)), 'S4: cột “Hôm nay” hiện 120 đọc của bộ có số liệu');

  /* S5 · biểu đồ chuỗi ngày */
  ok(D.querySelectorAll('#view .hp-trend-b').length === DAYS.length,
    'S5: biểu đồ xu hướng vẽ đúng ' + DAYS.length + ' cột từ days của Worker');
  ok(/4 ngày|4 ngày có số liệu|11\/0?8/.test(txt) || /Ngày có chuỗi/.test(txt),
    'S5: chuỗi ngày được dùng (nhãn “Ngày có chuỗi” phải khớp 4)');

  ok(errs.length === 0, 'ONLINE: 0 lỗi JS (' + errs.slice(0, 2).join(' | ') + ')');
  env.dom.window.close();

  /* ------------------------------------------------- KHÔNG CÓ SỐ LIỆU */
  const empty = build(false);
  await wait(1800);
  const e2 = empty, S2 = e2.w.CZ_MOCKUP.state;
  S2.route = 'thong-ke'; e2.w.render();
  const t2 = e2.D.getElementById('view').textContent.replace(/\s+/g, ' ');
  ok(/Chưa có phiếu theo chương/.test(t2), 'RỖNG: báo đúng chưa có phiếu theo chương');
  ok(/Chưa có lượt đọc nào/.test(t2), 'RỖNG: bảng số liệu báo rõ chưa có lượt đọc');
  ok(!e2.D.querySelectorAll('#view table tbody tr[data-fake]').length, 'RỖNG: không có dòng giả');
  ok(e2.errs.length === 0, 'RỖNG: 0 lỗi JS');
  empty.dom.window.close();

  console.log(JSON.stringify({ bai: 't_admin_stats_fix.js', kiemTra: checks, loi: bad.length, errors0: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
