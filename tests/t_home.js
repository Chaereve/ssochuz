/* ============================================================================
   Kiểm thử TRANG CHỦ (bố cục hero landing)
   - dựng được hero / số liệu / thư viện / BXH / lịch / chuyển thể
   - thẻ truyện trỏ đúng /truyen/<slug>/ (mở tab mới được, không phải # ảo)
   - tìm kiếm, lọc, phân trang chạy thật
   - kệ “Đọc tiếp” + “Tủ truyện” dựng từ dữ liệu trong máy
   - KHÔNG hiện số lượt đọc khi Firebase bị chặn (không bịa số)
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const p = page('index.html', { fetch: dataFetch() });
const { win, doc, errors } = p;
const LS = win.localStorage;
const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
const txt = s => { const e = $(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LIB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/registry.json'), 'utf8')).lib;

(async () => {
  await wait(900);
  const out = { errors0: errors.slice(0, 5) };

  /* ---------- hero ---------- */
  out.hero = {
    slides: $$('#stage .slide').length,
    showing: $$('#stage .slide.on').length,
    title: (($('#stage .slide.on h1') || {}).textContent || '').trim(),
    cta: $$('#stage .slide.on .btn-row a, #stage .slide.on .btn-row button').map(b => b.textContent.trim()),
    readHref: ($('#stage .slide.on .btn-row a') || {}).getAttribute ? $('#stage .slide.on .btn-row a').getAttribute('href') : '',
    dots: $$('#hDots button').length,
    strip: $$('#hStrip button').length
  };
  click($$('#hDots button')[1]); await wait(120);
  out.heroAfterDot = (($('#stage .slide.on h1') || {}).textContent || '').trim() === (LIB.find(n => n.slug === p.win.CZ.slides(p.win.CZ._memo.reg)[1].slug) || {}).title;

  /* ---------- số liệu + thư viện ---------- */
  out.facts = { n: $$('#facts .f').length, labels: $$('#facts .f span').map(e => e.textContent.trim()) };
  out.cards = { n: $$('#grid .card').length, pager: txt('#pager'), firstHref: ($('#grid .card') || {}).getAttribute('href') };
  out.cardsAreRealLinks = /^\/truyen\/[^/]+\/$/.test(out.cards.firstHref || '');

  /* ---------- tìm kiếm + lọc ---------- */
  const q = $('#q');
  q.value = 'chain'; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(300);
  out.search = { n: $$('#grid .card').length, fcount: txt('#fcount'), chip: txt('#fpick') };
  q.value = ''; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(300);
  const tabs = $$('#tabs .tab');
  click(tabs[2]); await wait(200);
  out.tabFilter = { label: tabs[2].textContent.trim(), n: $$('#grid .card').length };
  click(tabs[0]); await wait(200);
  /* lọc theo ô “Tình trạng” (trước đây là ô chết, không có lựa chọn nào) */
  const st = $('#fStatus');
  out.statusSel = { options: [...st.options].map(o => o.textContent), n0: $$('#grid .card').length };
  st.value = 'done'; st.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(220);
  out.statusFilter = { n: $$('#grid .card').length, chip: txt('#fpick'), fcount: txt('#fcount') };
  st.value = ''; st.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(200);
  const sel = $('#fSort');
  sel.value = 'az'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(200);
  out.sortAZ = (($('#grid .card h3') || {}).textContent || '').trim();
  sel.value = 'new'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(150);

  /* ---------- tìm nhanh (⌘K / phím /) ---------- */
  click('#czJump'); await wait(200);
  const jb = doc.querySelector('#czJumpBox');
  const ji = doc.querySelector('#czJumpInput');
  ji.value = 'third'; ji.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(200);
  out.jump = {
    open: !!jb && jb.classList.contains('on'),
    results: jb ? jb.querySelectorAll('#czJumpRes a').length : 0,
    first: jb && jb.querySelector('#czJumpRes a') ? jb.querySelector('#czJumpRes a').textContent.trim() : ''
  };
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(120);
  out.jumpClosedByEsc = !jb.classList.contains('on');

  /* ---------- BXH: Firebase bị chặn thì không hiện số ---------- */
  out.rank = { rows: $$('#rank .rank').length, src: txt('#rankSrc'), tabs: $$('#rankTabs .tab').map(b => b.textContent.trim()) };
  out.rankHasNoFakeNumbers = !/lượt|phiếu/.test(txt('#rank'));
  click($$('#rankTabs .tab')[2]); await wait(120);
  out.rankNew = txt('#rank .rank');
  out.sched = { rows: $$('#sched .sched').length, src: txt('#schedSrc') };
  out.ladder = { tabs: $$('#ltabs .tab').map(b => b.textContent.trim()), rows: $$('#lcontent .srow').length };
  out.newRail = $$('#newRail .card').length;

  /* ---------- kệ “Đọc tiếp” ---------- */
  out.continueHidden0 = $('#doc-tiep').hidden;
  const a = LIB.find(n => n.chapters > 3), b = LIB.filter(n => n.chapters > 3)[1];
  LS.setItem('chuseoz-prog-' + a.slug, '2'); LS.setItem('chuseoz-when-' + a.slug, String(Date.now()));
  LS.setItem('chuseoz-prog-' + b.slug, '3'); LS.setItem('chuseoz-when-' + b.slug, String(Date.now() - 5000));
  /* trang chủ dựng lại kệ khi quay lại tab */
  win.dispatchEvent(new win.Event('pageshow'));
  await wait(200);
  out.continue = { hidden: $('#doc-tiep').hidden, rows: $$('#contRow .cont').length, sub: txt('#contSub'), first: txt('#contRow .cont b') };

  /* ---------- tủ truyện (chỉ chứa bộ người dùng tự lưu) ---------- */
  out.shelfHidden0 = $('#tu-truyen').hidden;
  LS.setItem('chuseoz-shelf', JSON.stringify([a.slug]));
  win.dispatchEvent(new win.Event('pageshow')); await wait(200);
  out.shelf = { hidden: $('#tu-truyen').hidden, rows: $$('#shelfRow .cont').length, title: txt('#shelfRow .cont b') };
  click($$('#shelfRow [data-rm]')[0]); await wait(200);
  out.shelfAfterRemove = { rows: $$('#shelfRow .cont').length, ls: LS.getItem('chuseoz-shelf') };

  out.errors1 = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
