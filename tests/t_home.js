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

  /* ---------- Bàn đọc: đang đọc dở + tủ truyện ---------- */
  out.banHidden0 = $('#ban-doc').hidden;
  const a = LIB.find(n => n.chapters > 3), b = LIB.filter(n => n.chapters > 3)[1];
  LS.setItem('chuseoz-prog-' + a.slug, '2'); LS.setItem('chuseoz-when-' + a.slug, String(Date.now()));
  LS.setItem('chuseoz-prog-' + b.slug, '3'); LS.setItem('chuseoz-when-' + b.slug, String(Date.now() - 5000));
  win.dispatchEvent(new win.Event('pageshow'));
  await wait(200);
  out.banDoc = {
    hidden: $('#ban-doc').hidden, rows: $$('#contRow .cont').length,
    sub: txt('#banSub'), first: txt('#contRow .cont b'), count: txt('#banDocCount'),
    shelfShown: !$('#shelfRow').classList.contains('hide')
  };
  /* chuyển sang tủ truyện */
  LS.setItem('chuseoz-shelf', JSON.stringify([a.slug]));
  win.dispatchEvent(new win.Event('pageshow')); await wait(200);
  out.banShelfCount = txt('#banShelfCount');
  click($$('#banTabs .tab')[1]); await wait(150);
  out.banShelf = { rows: $$('#shelfRow .cont').length, title: txt('#shelfRow .cont b'), clearLabel: txt('#banClear') };
  click($$('#shelfRow [data-rm]')[0]); await wait(200);
  out.shelfAfterRemove = { rows: $$('#shelfRow .cont').length, ls: LS.getItem('chuseoz-shelf') };
  click($$('#banTabs .tab')[0]); await wait(150);
  out.banBackToDoc = !$('#contRow').classList.contains('hide');

  out.errors1 = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
