const { page, dataFetch } = require('./mk');
const p = page('index.html', { fetch: dataFetch() });
const { win, doc, errors } = p;
const LS = win.localStorage;
const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
const txt = s => { const e = $(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await wait(700);
  const out = { errors0: errors.slice(0, 4) };
  out.continueHidden0 = !$('#secContinue') || $('#secContinue').hidden;
  out.hero = $$('#stage .slide').length;
  out.heroBtns = [...$$('#stage .slide.on .btns button')].map(b => b.textContent.trim());
  
  // giả lập đã đọc: đặt tiến độ cho 2 bộ
  const lib = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data/registry.json'), 'utf8')).lib;
  const a = lib.find(n => n.chapters > 3), b = lib.filter(n => n.chapters > 3)[1];
  LS.setItem('chuseoz-prog-' + a.slug, '2'); LS.setItem('chuseoz-when-' + a.slug, String(Date.now()));
  LS.setItem('chuseoz-prog-' + b.slug, '3'); LS.setItem('chuseoz-when-' + b.slug, String(Date.now() - 5000));
  win.renderContinue();
  out.continueHidden2 = $('#secContinue').hidden;
  out.continueRows = $$('#contRow .cont').length;
  out.continueCols = win.getComputedStyle($("#contRow")).gridTemplateColumns.split(' ').length;
  out.continueFirst = txt('#contRow .cont b');
  out.continueSub = txt('#contSub');
  out.continueHref = $$('#contRow .cont')[0].getAttribute('data-cont');
  out.statsTiles = $$('#stats .stat').length;
  out.ranktabs = $$('#ranktabs button').map(b => b.textContent.trim());
  out.rank1 = $$('#rank .rank').slice(0, 2).map(r => r.textContent.trim().replace(/\s+/g, ' '));
  out.rankSrc = txt('#rankSrc');
  out.sched = $$('#sched .sched').length;
  out.schedSrc = txt('#schedSrc');
  out.cards = $$('#grid .card').length;
  out.pager = txt('#pager');
  // mở trang truyện
  const card = $$('#grid .card').find(c => c.dataset.t === a.title) || $$('#grid .card')[0];
  click(card); await wait(250);
  out.book = { view: $('#app').dataset.view, title: txt('#dTitle'), btn: txt('#dwrap .btn.primary'), blog: $('#dBlog').getAttribute('href') };
  out.chaps = $$('#chapgrid .cha').length;
  out.ringVisible = !$('#dRing').hidden;
  // tab BXH
  click($$('#ranktabs button')[2]); out.rankNew = $$('#rank .rank')[0].textContent.trim().replace(/\s+/g, ' ');
  // tìm kiếm
  const q = $('#q1'); click($('#dBack')); await wait(80);
  q.value = 'chain'; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(220);
  out.search = { n: $$('#grid .card').length, fcount: txt('#fcount') };
  q.value = ''; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(220);
  // lọc + phân trang
  const tabs = $$('#tabs .tab'); click(tabs[1]); await wait(120);
  out.tabsLabel = tabs.map(t => t.textContent.trim()).join('|');
  // tủ truyện: nút trong trang truyện + mục trên trang chủ
  click($('#dBack')); await wait(120);
  out.shelfHiddenFirst = $('#secShelf').hidden;
  q.value = 'love on hire'; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(220);
  click($$('#grid .card')[0]); await wait(260);
  out.shelfBtnBefore = $('#dShelfBtn').classList.contains('on');
  click('#dShelfBtn'); await wait(120);
  out.shelfBtnAfter = { on: $('#dShelfBtn').classList.contains('on'), ls: LS.getItem('chuseoz-shelf'), toast: txt('#toastS') };
  click('#dBack'); await wait(200);
  out.shelfSection = { hidden: $('#secShelf').hidden, rows: $$('#shelfRow .cont').length, sub: txt('#shelfSub'), title: txt('#shelfRow .cont b') };
  click($$('#shelfRow .cont')[0]); await wait(200);
  out.shelfOpens = $('#app').dataset.view;
  click('#dBack'); await wait(150);
  q.value = ''; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(200);
  click($$('#shelfRow [data-rm]')[0]); await wait(200);
  out.shelfAfterRemove = { rows: $$('#shelfRow .cont').length, hidden: $('#secShelf').hidden, ls: LS.getItem('chuseoz-shelf') };

  // truyện 0 chương: phải khoá đọc
  click(tabs[0]); await wait(80);
  q.value = 'my boss'; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(200);
  const locked = $$('#grid .card')[0];
  out.lockedCardText = locked ? locked.textContent.trim().slice(0, 40) : '<none>';
  click(locked); await wait(220);
  out.locked = { title: txt('#dTitle'), btn: txt('#dwrap .btn.primary'), disabled: !!$('#dwrap .btn.primary').disabled,
                 chapMsg: txt('#chapgrid .empty'), blog: !!$('#dBlog') };
  out.lockedChip = txt('#dwrap .stpill') || '';
  click($('#dBack')); await wait(100);
  // truyện 18+ có hỏi tuổi không
  const a18 = $$('#grid .card').find(c => /18\+/.test(c.textContent));
  out.has18card = !!a18;
  out.errors1 = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
