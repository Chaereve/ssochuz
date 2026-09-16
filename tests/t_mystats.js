/* ============================================================================
   Kiểm thử N10 — THỐNG KÊ ĐỌC CÁ NHÂN (chỉ nằm trong máy)
   ----------------------------------------------------------------------------
   · localStorage khoá `ssochuz-mystats`, mỗi chương một bộ = 1 lần/ngày
   · đọc cuộn tới ≥90% chương, hoặc bấm Chương tiếp theo → +1
   · My Space hiện khối: tổng chương · chuỗi ngày đọc · hôm nay + biểu đồ 7 cột
   · KHÔNG phát sinh request/ghi KV nào (không POST lên Worker)
   Chạy:  node tests/t_mystats.js
   ========================================================================== */
const { page, dataFetch, read, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');

const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = (d, s) => d.querySelector(s);
const $$ = (d, s) => [...d.querySelectorAll(s)];
const BASE = 'https://cms.test';
const J = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });

function makeApi(log) {
  const REG = JSON.parse(read('data/registry.json'));
  return (p, opt) => {
    log.push((opt.method || 'GET') + ' ' + p);
    if (p === '/api/registry') return J(REG);
    const mb = p.match(/^\/api\/book\/(.+)$/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
    }
    if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    if (p === '/api/schedule') return J({ items: [] });
    return undefined;
  };
}

(async () => {
  const out = {};
  const log = [];

  /* ---------- 1. trang truyện: đọc tới cuối chương → thống kê +1 (≥90%) ---------- */
  const st = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-1/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(log), log })
  });
  await wait(1600);
  const sd0 = JSON.parse(st.win.localStorage.getItem('ssochuz-mystats') || '{"days":{}}');
  out.daoDau = (sd0.days || {});

  /* mô phỏng cuộn tới 90% chiều cao trang đọc */
  try { Object.defineProperty(st.win, 'scrollY', { configurable: true, get: () => 4500 }); } catch (e) {}
  Object.defineProperty(st.win.document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
  Object.defineProperty(st.win, 'innerHeight', { configurable: true, value: 500 });
  st.win.dispatchEvent(new st.win.Event('scroll'));
  await wait(120);

  const s1 = JSON.parse(st.win.localStorage.getItem('ssochuz-mystats') || '{"days":{}}');
  const s1sum = CZSummary(st.win);
  out.sauCuon = {
    total: s1sum.total,
    hasToday: Object.keys(s1.days || {}).length > 0,
    homNayTong: s1sum.today
  };
  out.khongTrungLap = s1sum.total === 1;   /* cuộn nhiều lần vẫn chỉ tính 1 lần */

  /* cuộn thêm lần nữa → vẫn 1 chương */
  st.win.dispatchEvent(new st.win.Event('scroll'));
  await wait(100);
  out.totalSauCuonLai = CZSummary(st.win).total;

  /* ---------- 2. bấm Chương tiếp theo (next) → tính 1 chương (đếm lại từ đầu) ---------- */
  try { Object.defineProperty(st.win, 'scrollY', { configurable: true, get: () => 200 }); } catch (e) {}
  st.win.dispatchEvent(new st.win.Event('scroll'));     /* hạ thanh tiến trình về 0 để khỏi tràn 90% */
  st.win.localStorage.setItem('ssochuz-mystats', '{"days":{},"total":0}');   /* đếm lại từ đầu */
  const next = $(st.doc, '#navNext');
  if (next) { next.dispatchEvent(new st.win.MouseEvent('click', { bubbles: true })); await wait(250); }
  const s2 = CZSummary(st.win);
  out.sauNext = { total: s2.total, curUrl: st.win.location.pathname };

  /* ---------- 3. mystats không phát sinh POST nào ngoài /api/view có sẵn ---------- */
  out.khongPostMoi = !log.some(u => /POST/.test(u) && !/\/api\/(view|rate\/me)/.test(u));

  /* ---------- 4. khoá đúng ngày + không ghi trùng ngày hôm sau ---------- */
  const raw = JSON.parse(st.win.localStorage.getItem('ssochuz-mystats') || '{"days":{}}');
  const days = Object.keys(raw.days || {});
  out.khoaNgay = { soNgay: days.length, mau: days[0] || '' };

  /* ---------- 5. trang chủ My Space hiện khối thống kê ---------- */
  const home = page('my-space.html', {
    setup(w) {
      w.localStorage.setItem('ssochuz-mystats', JSON.stringify({
        total: 5,
        days: {
          [DateKey(0)]: { s: { 'third-person:c1': 1 } },
          [DateKey(1)]: { s: { 'third-person:c2': 1, 'lunar-secret:c5': 1 } },
          [DateKey(2)]: { s: { 'lunar-secret:c6': 1 } },
          [DateKey(4)]: { s: { 'chain:c1': 1 } }
        }
      }));
    },
    fetch: dataFetch()
  });
  await wait(1100);
  const panel = $(home.doc, '#myStats');
  out.mySpace = {
    coKhoi: !!panel,
    tong: panel ? (panel.querySelector('.space-stat-grid strong') || {}).textContent : '',
    soO: panel ? panel.querySelectorAll('.space-stat-grid > div').length : 0,
    soCot: panel ? panel.querySelectorAll('.space-week i').length : 0,
    ngayLienTiep: panel ? (panel.querySelectorAll('.space-stat-grid strong')[2] || {}).textContent : '',
    homNay: panel ? (panel.querySelectorAll('.space-stat-grid strong')[1] || {}).textContent : ''
  };
  out.errors0 = home.errors.slice(0, 5).concat(st.errors.slice(0, 5));

  /* ================= nghiệm thu ================= */
  const errs = [];
  const eq = (name, got, want) => { if (String(got) !== String(want)) errs.push(name + ' (nhận: ' + JSON.stringify(got) + ', cần: ' + JSON.stringify(want) + ')'); };
  eq('thống kê/cuộn ≥90% tính 1 chương', out.sauCuon.total, 1);
  eq('thống kê/cuộn lại không tính trùng', out.totalSauCuonLai, 1);
  eq('thống kê/bấm next tính đúng 1 chương', out.sauNext.total, 1);
  eq('thống kê/URL chuyển đúng chương 2', out.sauNext.curUrl, '/truyen/third-person/chuong-2/');
  eq('thống kê/không POST mới lên Worker', out.khongPostMoi, true);
  eq('thống kê/lưu đúng 1 ngày khoá', out.khoaNgay.soNgay, 1);
  eq('MySpace/có khối thống kê', out.mySpace.coKhoi, true);
  eq('MySpace/4 con số', out.mySpace.soO, 4);
  eq('MySpace/tổng chương = 5', out.mySpace.tong, '5');
  eq('MySpace/chuỗi ngày đọc = 3', out.mySpace.ngayLienTiep, '3');
  eq('MySpace/hôm nay = 1', out.mySpace.homNay, '1');
  eq('MySpace/biểu đồ 7 cột', out.mySpace.soCot, 7);

  out.fail = errs;
  console.log(JSON.stringify(out, null, 1));
  console.log(errs.length ? 'CÒN ' + errs.length + ' LỖI N10' : 'N10 đạt hết');
  process.exit(errs.length ? 1 : 0);

  function CZSummary(w) {
    return (w.CZ && w.CZ.myReadSummary) ? w.CZ.myReadSummary() : { total: -1, today: -1, streak: -1, week: [] };
  }
  function DateKey(ago) {
    const d = new Date(); d.setDate(d.getDate() - ago);
    const p = n => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }
})();
