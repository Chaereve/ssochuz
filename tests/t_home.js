/* ============================================================================
   Kiểm thử TRANG CHỦ (bố cục hero landing)
   - dựng được hero / số liệu / bàn đọc / khám phá (4 tab) / thư viện
   - thẻ truyện trỏ đúng /truyen/<slug>/ (link thật, không phải # ảo)
   - tìm kiếm, lọc, sắp xếp, phân trang chạy thật
   - “Bàn đọc” gộp đang-đọc-dở + tủ truyện, xoá được từng bộ
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
    strip: $$('#hStrip button').length,
    hasBlurBg: !!$('#hero .bg')
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
  /* tình trạng lọc bằng dãy tab ngay trên lưới — không còn ô “Tình trạng” trùng lặp */
  out.statusSel = { conOLoc: !!$('#fStatus'), n0: $$('#grid .card').length };
  const stTab = $$('#tabs .tab').find(b => /Hoàn thành/.test(b.textContent));
  click(stTab); await wait(220);
  out.statusFilter = { n: $$('#grid .card').length, chip: txt('#fpick'), fcount: txt('#fcount') };
  click($$('#tabs .tab')[0]); await wait(200);
  const sel = $('#fSort');
  out.sortOptions = [...sel.options].map(o => o.textContent);
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

  /* ---------- Khám phá: 4 tab, mở đúng nội dung ---------- */
  out.exp = { tabs: $$('#expTabs button').map(b => b.textContent.trim()), visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id) };
  click($$('#expTabs button')[1]); await wait(120);
  out.expRank = { visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id), rows: $$('#rank .rank').length };
  click($$('#expTabs button')[2]); await wait(120);
  out.expSched = { visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id), rows: $$('#sched .sched').length };
  click($$('#expTabs button')[3]); await wait(120);
  out.expAdapt = { visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id), tabs: $$('#ltabs .tab').map(b => b.textContent.trim()), rows: $$('#lcontent .srow').length };
  /* link cũ #bxh vẫn mở đúng tab */
  p.win.location.hash = '#bxh'; await wait(150);
  out.expHashLink = { visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id) };

  /* ---------- BXH: Firebase bị chặn thì không hiện số ---------- */
  out.rank = { rows: $$('#rank .rank').length, src: txt('#rankSrc'), tabs: $$('#rankTabs .tab').map(b => b.textContent.trim()) };
  out.rankHasNoFakeNumbers = !/lượt|phiếu/.test(txt('#rank'));
  const rc = $$('#rankTabs .tab');
  click(rc[rc.length - 1]); await wait(120);
  out.rankChap = txt('#rank .rank');
  out.sched = { rows: $$('#sched .sched').length, src: txt('#schedSrc') };
  out.newRail = { n: $$('#newRail .card').length, sub: txt('#newSub') };

  /* My Space is now a separate page; its history/shelves are covered in t_space.js. */
  out.spaceSeparate = !$('#ban-doc') && !!doc.querySelector('a[href="/my-space"]');
  if (!out.spaceSeparate) errors.push('My Space must link to its own page, not render on home');

  /* ---------- menu điện thoại: mở/đóng, Esc, bấm ra ngoài, có báo trạng thái ---------- */
  {
    const burger = $('#czBurger'), mnav = $('#czMnav');
    const key = (k) => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));
    const st = () => ({ expanded: burger.getAttribute('aria-expanded'), open: mnav.classList.contains('on'), label: burger.getAttribute('aria-label') });
    out.menuDau = st();
    click(burger); await wait(60);
    out.menuMo = st();
    key('Escape'); await wait(60);
    out.menuEsc = st();
    click(burger); await wait(60);
    click($('#hdr') || doc.body); await wait(60);
    out.menuBamNgoai = st();
    out.menuCo = { ariaControls: burger.getAttribute('aria-controls'), soLink: $$('#czMnav a').length, nhan: $$('#czNav a .nav-lbl').map(e => e.textContent.trim()) };
  }

  out.errors1 = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
