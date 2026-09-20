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
  /* ============ CỤM 11 · KỆ PHÂN LOẠI · GHI CHÚ · HUY HIỆU · THỬ THÁCH ============
     Cả bốn chỉ đọc/ghi localStorage. Trang mới, seed sẵn dữ liệu — kể cả trường
     hợp NGƯỜI DÙNG CŨ: shelf có slug mà CHƯA có khoá phân loại nào. */
  {
    const DK = (ago) => { const d = new Date(); d.setDate(d.getDate() - ago); const p = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); };
    const days = {};
    for (let i = 0; i < 12; i++) days[DK(i)] = { s: {} };
    let dem = 0;
    for (let i = 0; i < 12; i++) for (let j = 1; j <= 5; j++) { days[DK(i)].s['third-person:c' + (i * 5 + j)] = 1; dem++; }
    days[DK(0)].s['lunar-secret:c1'] = 1; dem++;
    const u = page('my-space.html', {
      fetch: dataFetch(), css: true,
      setup(w) {
        w.localStorage.setItem('ssochuz-mystats', JSON.stringify({ total: dem, days }));
        w.localStorage.setItem('ssochuz-shelf', JSON.stringify(['third-person', 'lunar-secret', 'chain']));
        w.localStorage.setItem('ssochuz-prog-lunar-secret', '7');
        w.localStorage.setItem('ssochuz-shelf-cat', JSON.stringify({ 'third-person': 'done' }));
        w.localStorage.setItem('ssochuz-note-chain', 'cho chương mới');
      }
    });
    await wait(1300);
    const d = u.doc, w = u.win;
    const q = s => d.querySelector(s), qa = s => [...d.querySelectorAll(s)];
    const shelf = () => q('#localShelf');
    out.c11 = {};

    /* ---- 1. kệ phân loại: chip + đếm + tương thích dữ liệu cũ ---- */
    const chips = () => qa('#localShelf .shchip');
    out.c11.chip = {
      soChip: chips().length,
      nhan: chips().map(c => c.textContent.trim().replace(/\s+/g, ' ')),
      chipDangBat: (q('#localShelf .shchip.on') || {}).dataset ? q('#localShelf .shchip.on').dataset.cat : null,
      /* third-person được phân loại sẵn là "done"; lunar-secret có tiến độ → reading;
         chain chưa phân loại, chưa tiến độ → want. Đó là luật tương thích ngược. */
      catCuaTungBo: qa('#localShelf .local-book').map(b => b.dataset.cat).sort().join(','),
      soHang: qa('#localShelf .local-book').length
    };
    /* lọc theo nhóm */
    out.c11.coKeMay = chips().length > 0;
    /* thiếu kệ thì vẫn phải BÁO LỖI CÓ TÊN chứ không được crash giữa chừng */
    if (!out.c11.coKeMay) { out.c11.locTheoNhom = {}; out.c11.select = {}; out.c11.doiNhom = {}; out.c11.ghiChu = {}; }
    if (out.c11.coKeMay) {
    const chipDone = chips().find(c => c.dataset.cat === 'done');
    chipDone.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(300);
    out.c11.locTheoNhom = {
      conLai: qa('#localShelf .local-book').length,
      dungNhom: qa('#localShelf .local-book').every(b => b.dataset.cat === 'done'),
      chipOn: (q('#localShelf .shchip.on') || {}).dataset ? q('#localShelf .shchip.on').dataset.cat : null
    };
    chips().find(c => c.dataset.cat === 'all').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(300);

    /* ---- 2. đổi nhóm bằng select → phải ghi vào localStorage ---- */
    const sel = q('#localShelf [data-cat-set="chain"]');
    out.c11.select = { coSelect: !!sel, giaTri: sel ? sel.value : null, soLuaChon: sel ? sel.options.length : 0 };
    sel.value = 'want';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await wait(300);
    out.c11.doiNhom = {
      trongMay: w.localStorage.getItem('ssochuz-shelf-cat'),
      trenGiaoDien: (q('#localShelf .local-book[data-cat="want"]') || {}).dataset ? true : false,
      shelfKhongDoi: w.localStorage.getItem('ssochuz-shelf') === JSON.stringify(['third-person', 'lunar-secret', 'chain'])
    };

    /* ---- 3. ghi chú riêng ---- */
    const ta = q('#localShelf [data-note="third-person"]');
    const taCoSan = q('#localShelf [data-note="chain"]');
    out.c11.ghiChu = {
      coO: !!ta,
      docDuChuCu: taCoSan ? taCoSan.value === 'cho chương mới' : false,
      maxlength: ta ? ta.getAttribute('maxlength') : null
    };
    ta.value = 'thích cặp phụ';
    ta.dispatchEvent(new w.Event('change', { bubbles: true }));
    await wait(250);
    out.c11.ghiChu.luuTrongMay = w.localStorage.getItem('ssochuz-note-third-person');
    /* xoá trắng thì phải xoá khoá, không để lại chuỗi rỗng */
    ta.value = '';
    ta.dispatchEvent(new w.Event('change', { bubbles: true }));
    await wait(250);
    out.c11.ghiChu.xoaHet = w.localStorage.getItem('ssochuz-note-third-person') === null;
    }

    /* ---- 4. huy hiệu + thử thách theo quý (tab Thống kê) ---- */
    q('#tab-stats').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(500);
    const bd = qa('#myStats .badge');
    const du = bd.filter(b => b.classList.contains('on'));
    const ngay = new Date(), quy = Math.floor(ngay.getMonth() / 3) + 1;
    out.c11.huyHieu = {
      soHuyHieu: bd.length,
      soDaDat: du.length,
      tenDaDat: du.map(b => b.querySelector('span').textContent),
      coTienDo: bd.filter(b => !b.classList.contains('on')).every(b => /^\d+\/\d+$/.test(b.querySelector('b').textContent))
    };
    const chal = q('#myStats .space-challenge');
    out.c11.thuThach = {
      coKhoi: !!chal,
      dungQuy: chal ? new RegExp('quý ' + quy + '/' + ngay.getFullYear()).test(chal.textContent) : false,
      coThanh: !!q('#myStats .chalbar i'),
      beRongThanh: q('#myStats .chalbar i') ? q('#myStats .chalbar i').style.width : null,
      noiRoKhongThuong: chal ? /không có phần thưởng/.test(chal.textContent) : false
    };
    out.c11.loiJs = u.errors.filter(e => !/Not implemented/.test(String(e))).slice(0, 3);
  }

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

  eq('C11/my-space.html CÓ kệ máy (#localShelf)', out.c11.coKeMay, true);
  eq('C11/có 5 chip nhóm (Tất cả + 4)', out.c11.chip.soChip, 5);
  eq('C11/3 truyện trong kệ', out.c11.chip.soHang, 3);
  eq('C11/tương thích ngược: done,reading,want', out.c11.chip.catCuaTungBo, 'done,reading,want');
  eq('C11/lọc “Đã xong” còn 1 bộ', out.c11.locTheoNhom.conLai, 1);
  eq('C11/lọc đúng nhóm', out.c11.locTheoNhom.dungNhom, true);
  eq('C11/select có 4 lựa chọn', out.c11.select.soLuaChon, 4);
  eq('C11/đổi nhóm ghi vào localStorage', /"chain":"want"/.test(out.c11.doiNhom.trongMay || ''), true);
  eq('C11/đổi nhóm KHÔNG phá mảng shelf cũ', out.c11.doiNhom.shelfKhongDoi, true);
  eq('C11/có ô ghi chú', out.c11.ghiChu.coO, true);
  eq('C11/đọc lại ghi chú cũ', out.c11.ghiChu.docDuChuCu, true);
  eq('C11/ghi chú giới hạn 2000 ký tự', out.c11.ghiChu.maxlength, '2000');
  eq('C11/lưu ghi chú vào localStorage', out.c11.ghiChu.luuTrongMay, 'thích cặp phụ');
  eq('C11/xoá trắng thì xoá luôn khoá', out.c11.ghiChu.xoaHet, true);
  eq('C11/có 11 huy hiệu', out.c11.huyHieu.soHuyHieu, 11);
  eq('C11/61 chương + 12 ngày + 2 bộ = 4 huy hiệu', out.c11.huyHieu.soDaDat, 4);
  eq('C11/chưa đạt thì hiện tiến độ n/dích', out.c11.huyHieu.coTienDo, true);
  eq('C11/có khối thử thách quý', out.c11.thuThach.coKhoi, true);
  eq('C11/đúng quý hiện tại', out.c11.thuThach.dungQuy, true);
  eq('C11/nói rõ không có phần thưởng', out.c11.thuThach.noiRoKhongThuong, true);
  eq('C11/không lỗi JS', out.c11.loiJs.length, 0);

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
