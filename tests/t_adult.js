/* ============================================================================
   Kiểm thử N12 — VÁ GIAO DIỆN NHẸ
   ----------------------------------------------------------------------------
   · hero slide đọc nhãn `reason` (riêng từng slide) nếu có
   · BXH "Bình chọn nhiều nhất" 0 phiếu → xếp theo lượt đọc, hoặc ẩn khối
   · modal xác nhận 18+ + đặt lại xác nhận (ssochuz-confirmed18)
   Chạy:  node tests/t_adult.js
   ========================================================================== */
const { page, dataFetch, read, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
const BASE = 'https://cms.test';
const J = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = (d, s) => d.querySelector(s), $$ = (d, s) => [...d.querySelectorAll(s)];
const REG = JSON.parse(read('data/registry.json'));

/* registry giả: bộ third-person là 18+ (giống dữ liệu thật là 18+... cần kiểm) */
function mkReg() {
  const r = JSON.parse(JSON.stringify(REG));
  const n = r.lib.find(x => x.slug === 'third-person');
  if (n) n.is18 = true;
  return r;
}

function api(p, opt, statsItems) {
  opt = opt || {};
  if (p === '/api/registry') return J(mkReg());
  const mb = p.match(/^\/api\/book\/(.+)$/);
  if (mb) {
    const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
    return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
  }
  if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: statsItems || {} });
  if (p === '/api/view' && opt.method === 'POST') return J({ ok: true, counted: true });
  return undefined;
}

(async () => {
  const out = {};

  /* ---------- 1. modal 18+ chặn đọc khi chưa xác nhận ---------- */
  const noConfirm = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: (p, o) => api(p, o, { 'third-person': { views: 30, votes: 0 } }) })
  });
  await wait(1600);
  const bpri = $(noConfirm.doc, '#shero .btn-row a.btn.pri, #shero .btn-row button');
  const gateBtn = $(noConfirm.doc, '#adultGate');
  out.gate = { coNutXacNhan: !!gateBtn, coLinkDoc: !!$(noConfirm.doc, '#shero .btn-row a.btn.pri[href*="/chuong-"]') };
  if (gateBtn) gateBtn.dispatchEvent(new noConfirm.win.MouseEvent('click', { bubbles: true })); await wait(200);
  out.modal18Hien = !!$(noConfirm.doc, '#cz18plus.on') || !!$(noConfirm.doc, '#cz18plus');
  const okBtn = $(noConfirm.doc, '#cz18ok');
  if (okBtn) okBtn.dispatchEvent(new noConfirm.win.MouseEvent('click', { bubbles: true })); await wait(400);
  out.daXacNhan = !!noConfirm.doc.body.classList.contains('reading');
  out.local = noConfirm.win.localStorage.getItem('ssochuz-confirmed18');

  /* ---------- 2. đặt lại xác nhận 18+ ---------- */
  const confirmed = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: (p, o) => api(p, o, { 'third-person': { views: 30, votes: 0 } }) }),
    setup(w) { try { w.localStorage.setItem('ssochuz-confirmed18', String(Date.now())); } catch (e) {} }
  });
  await wait(1600);
  out.nutDatLai = !!$(confirmed.doc, '#reset18');
  const rBtn = $(confirmed.doc, '#reset18');
  if (rBtn) rBtn.dispatchEvent(new confirmed.win.MouseEvent('click', { bubbles: true })); await wait(200);
  out.datLaiXoaLocal = !confirmed.win.localStorage.getItem('ssochuz-confirmed18');

  /* ---------- 3. hero có nhãn reason riêng + BXH 0 phiếu → đọc nhiều nhất ---------- */
  const home = page('index.html', {
    config: { CZ_API: BASE },
    fetch: dataFetch({
      api: (p, o) => {
        if (p === '/api/registry') return J(mkRegWithReason());
        if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: statsAllViews() });
        return undefined;
      }
    })
  });
  await wait(1300);
  out.heroReason = $$(home.doc, '#stage .slide.on .eyebrow').map(e => e.textContent.trim());
  out.rankTitle = ($(home.doc, '#bxh .sechead h2') || {}).textContent || '';
  out.rankTabs = $$(home.doc, '#rankTabs .tab').length;
  out.rankRows = $$(home.doc, '#rank .rank').length;

  /* ---------- 4. BXH không có phiếu lẫn lượt đọc → ẩn hẳn ---------- */
  const home0 = page('index.html', {
    config: { CZ_API: BASE },
    fetch: dataFetch({
      api: (p, o) => {
        if (p === '/api/registry') return J(mkRegWithReason());
        if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
        return undefined;
      }
    })
  });
  await wait(1300);
  out.rankHiddenWhenEmpty = !!(home0.doc.querySelector('#bxh[hidden]'));

  out.errors0 = [...noConfirm.errors, ...confirmed.errors, ...home.errors, ...home0.errors].slice(0, 6);

  /* ================= nghiệm thu ================= */
  const errs = [];
  const eq = (n, g, w) => { if (String(g) !== String(w)) errs.push(n + ' (nhận: ' + JSON.stringify(g) + ', cần: ' + JSON.stringify(w) + ')'); };
  eq('18+/chưa xác nhận hiện nút chặn', out.gate.coNutXacNhan, true);
  eq('18+/không có link Đọc thẳng', out.gate.coLinkDoc, false);
  eq('18+/bấm mở modal xác nhận', out.modal18Hien, true);
  eq('18+/xác nhận xong vào trang đọc', out.daXacNhan, true);
  eq('18+/ghi nhớ khoác ssochuz-confirmed18', !!out.local, true);
  eq('18+/có nút Đặt lại xác nhận', out.nutDatLai, true);
  eq('18+/đặt lại xoá ghi nhớ', out.datLaiXoaLocal, true);
  eq('hero/slide dùng nhãn reason', out.heroReason.join('|'), 'Lựa chọn của ban biên tập');
  eq('Ranking giữ đúng tên dù không có phiếu', out.rankTitle, 'Ranking');
  eq('Ranking luôn có ba kỳ', out.rankTabs, 3);
  eq('Không lấy tổng view thay view kỳ còn thiếu', out.rankRows, 0);
  eq('Ranking rỗng vẫn cho chọn hạng mục', out.rankHiddenWhenEmpty, false);

  out.fail = errs;
  console.log(JSON.stringify(out, null, 1));
  console.log(errs.length ? 'CÒN ' + errs.length + ' LỖI N12' : 'N12 thành phần đạt hết');
  process.exit(errs.length ? 1 : 0);

  function mkRegWithReason() {
    const r = JSON.parse(JSON.stringify(REG));
    r.slides = (r.slides || []).map((x, i) => {
      const s = typeof x === 'string' ? { slug: x } : { ...x };
      if (i === 0) s.reason = 'Lựa chọn của ban biên tập';
      return s;
    });
    return r;
  }

  function statsAllViews() {
    const items = {};
    (REG.lib || []).forEach(x => { items[x.slug] = { views: 100 + (REG.lib.indexOf(x) * 3), votes: 0 }; });
    return items;
  }
})();
