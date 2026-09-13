/* ============================================================================
   Kiểm thử TRANG TRUYỆN + TRANG ĐỌC (/truyen/<slug>/)
   - thông tin truyện, danh sách chương, tìm/sắp xếp/nhảy chương
   - mở chương bằng #chuong-N và bằng link cũ #page-N
   - chuyển chương (nút + phím), lưu tiến độ thật vào máy
   - cài đặt đọc (cỡ chữ / nền / mở-đóng) và mục lục
   - tủ truyện / thích / đánh dấu
   - truyện 0 chương: khoá nút đọc, nói rõ “sắp ra mắt”, không lộ nội dung
   - Firebase bị chặn thì KHÔNG hiện số lượt đọc
   - mọi dạng đường dẫn tới được trang này: /truyen/<slug>/, /truyen, /reader/<slug>/,
     /truyen.html?slug=… — dạng nào cũng phải hiểu đúng tên truyện, không được lấy
     chữ "truyen"/"reader" trong đường dẫn làm slug
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const log = [];
const p = page('truyen.html', {
  url: 'https://chuseoz.pages.dev/truyen/third-person/',
  fetch: dataFetch({ apiBase: 'https://cms.test', log })
});
const { win, doc, errors } = p;
const LS = win.localStorage;
const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
const txt = s => { const e = $(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await wait(1200);
  const out = { errors0: errors.slice(0, 5) };

  /* ---------- thông tin truyện ---------- */
  out.story = {
    title: doc.title,
    h1: txt('#shero h1'),
    crumb: txt('#crumb'),
    meta: txt('#shero .meta'),
    actions: $$('#shero .btn-row > *').map(b => b.textContent.trim()),
    readHref: ($('#shero .btn-row a.btn.pri') || {}).getAttribute ? $('#shero .btn-row a.btn.pri').getAttribute('href') : '',
    infoRows: $$('#shero .info .r').length,
    chapCount: txt('#chapCount')
  };
  out.chapters = { n: $$('#chapGrid .cha').length, first: txt('#chapGrid .cha') };
  /* tìm chương */
  const cq = $('#chapQ');
  cq.value = 'kẹo'; cq.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(250);
  out.chapSearch = { n: $$('#chapGrid .cha').length, text: txt('#chapGrid .cha') };
  cq.value = ''; cq.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(220);
  /* sắp xếp */
  out.chapFirstDefault = txt('#chapGrid .cha');
  click($$('#chapSort button')[0]); await wait(150);
  out.chapNewFirst = txt('#chapGrid .cha');
  click($$('#chapSort button')[1]); await wait(120);

  /* ---------- mở chương bằng hash ---------- */
  win.location.hash = '#chuong-3';
  await wait(450);
  out.reading = {
    on: doc.body.classList.contains('reading'),
    head: txt('#rdHead'),
    sub: txt('#rdSub'),
    blocks: $$('#rdText > *').length,
    crumb: txt('#rdCrumb'),
    nav: $$('#rdNav button').map(b => b.textContent.trim()),
    acts: $$('#rdActs > *').map(b => b.textContent.trim()),
    progress: LS.getItem('chuseoz-prog-third-person')
  };

  /* ---------- chuyển chương bằng nút + phím ---------- */
  click('#navNext'); await wait(400);
  out.afterNext = { head: txt('#rdHead'), progress: LS.getItem('chuseoz-prog-third-person') };
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(300);
  out.afterKey = txt('#rdHead');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await wait(300);
  out.afterKeyBack = txt('#rdHead');

  /* ---------- thích / lưu / đánh dấu ---------- */
  click('#actLike'); click('#actSave'); click('#actMark'); await wait(120);
  out.marks = {
    like: LS.getItem('chuseoz-like-third-person'),
    shelf: LS.getItem('chuseoz-shelf'),
    mark: LS.getItem('chuseoz-mark-third-person')
  };

  /* ---------- cài đặt đọc ---------- */
  click('#rdSet'); await wait(150);
  out.settings = { open: $('#setSheet').classList.contains('on'), rows: $$('#setBody .srow2').length };
  const sizeOpts = $$('#setBody button[data-set="size"]');
  click(sizeOpts[3]); await wait(120);
  const themeOpts = $$('#setBody button[data-set="theme"]');
  click(themeOpts[3]); await wait(120);
  const modeOpts = $$('#setBody button[data-set="mode"]');
  click(modeOpts[1]); await wait(200);
  out.readerPref = LS.getItem('chuseoz-reader');
  out.rdState = { theme: doc.body.dataset.rd, mode: win.CZ.rdGet().mode, size: win.CZ.rdGet().size };
  click($$('#setSheet [data-shut]')[0]); await wait(80);

  /* ---------- mục lục ---------- */
  click('#rdToc'); await wait(150);
  out.toc = { open: $('#tocSheet').classList.contains('on'), rows: $$('#tocList a').length, name: txt('#tocName') };
  click($$('#tocSheet [data-shut]')[0]); await wait(80);

  /* ---------- không có số liệu thì không hiện số ---------- */
  out.noFakeStats = !/lượt đọc/.test(txt('#rdActs')) && !!(win.CZ._memo.stats && !win.CZ._memo.stats.on);

  /* ---------- thoát về trang truyện ---------- */
  click('#rdBack'); await wait(250);
  out.back = { reading: doc.body.classList.contains('reading'), hash: win.location.hash, chapNow: txt('#chapGrid .cha.now') };

  /* ---------- link cũ #page-N ---------- */
  const r2 = page('truyen.html', { url: 'https://chuseoz.pages.dev/truyen/lunar-secret/#page-5', fetch: dataFetch() });
  await wait(1500);
  out.legacy = {
    errors: r2.errors.slice(0, 3),
    reading: r2.doc.body.classList.contains('reading'),
    head: (r2.doc.querySelector('#rdHead') || {}).textContent,
    progress: r2.win.localStorage.getItem('chuseoz-prog-lunar-secret')
  };

  /* ---------- truyện 0 chương (“Sắp ra mắt”) ---------- */
  const r3 = page('truyen.html', { url: 'https://chuseoz.pages.dev/truyen/my-boss/', fetch: dataFetch() });
  await wait(1400);
  const body3 = r3.doc.body.textContent.replace(/\s+/g, ' ').trim();
  out.locked = {
    errors: r3.errors.slice(0, 3),
    h1: (r3.doc.querySelector('#shero h1') || {}).textContent,
    readLocked: !!r3.doc.querySelector('#shero .btn-row button[disabled]'),
    saysSoon: /chưa có chương|sắp ra mắt/i.test(body3),
    hasBlogLink: /blogspot\.com/.test(r3.doc.body.innerHTML),
    noContent: (r3.doc.querySelector('#rdText') || {}).innerHTML === ''
  };
  r3.win.location.hash = '#chuong-1'; await wait(250);
  out.lockedAfterHash = r3.doc.body.classList.contains('reading');

  
  /* ---------- link cũ /reader?slug=…&ch=… vẫn mở đúng chương ---------- */
  const r4 = page('truyen.html', {
    url: 'https://chuseoz.pages.dev/reader?slug=third-person&ch=3',
    fetch: dataFetch({ apiBase: 'https://cms.test' }),
    config: { CZ_API: '' }
  });
  await wait(700);
  out.cuReader = {
    errors: r4.errors.slice(0, 3),
    title: (r4.doc.querySelector('#rdHead') || {}).textContent,
    sub: (r4.doc.querySelector('#rdSub') || {}).textContent,
    reading: r4.doc.body.classList.contains('reading')
  };

  /* ---------- số chương hiển thị lấy từ TIÊU ĐỀ, không lấy vị trí ----------
     “Third Person” mở đầu bằng “Lời Mở Đầu” nên vị trí 2 thực ra là “Chương 1”. */
  const r5 = page('truyen.html', {
    url: 'https://chuseoz.pages.dev/truyen/third-person/#chuong-2',
    fetch: dataFetch({ apiBase: 'https://cms.test' })
  });
  await wait(900);
  const rows5 = [...r5.doc.querySelectorAll('#chapGrid .cha')].slice(0, 3)
    .map(a => a.querySelector('.no').textContent + '|' + a.querySelector('.nm').textContent);
  click5(r5, '#rdBar button[title]');   /* mở ngăn kéo mục lục */
  await wait(200);
  const toc5 = [...r5.doc.querySelectorAll('#tocList a')].slice(0, 3)
    .map(a => a.querySelector('.no').textContent + '|' + a.querySelector('.nm').textContent);
  out.danhSoChuong = {
    tieuDe: r5.doc.querySelector('#rdHead').textContent,
    nhanChuong: r5.doc.querySelector('#rdSub').textContent,
    crumb: r5.doc.querySelector('#rdCrumb').textContent.replace(/\s+/g, ' ').trim(),
    luoi3DongDau: rows5,
    mucLuc3DongDau: toc5,
    loi: r5.errors.slice(0, 3)
  };
  function click5(pp, sel, txt) {
    const el = txt ? [...pp.doc.querySelectorAll(sel)].find(e => e.textContent.includes(txt)) : pp.doc.querySelector(sel);
    if (el) el.dispatchEvent(new pp.win.MouseEvent('click', { bubbles: true }));
    return !!el;
  }

  /* ---------- các dạng đường dẫn Cloudflare Pages có thể đưa tới ----------
     Pages proxy /truyen/<slug>/ về trang truyện mà GIỮ NGUYÊN URL, nhưng cũng có
     lúc người đọc vào thẳng /truyen, /truyen.html?slug=… hoặc link /reader/<slug>/
     đời cũ. Dạng nào cũng phải hiểu đúng, không được lấy chữ "truyen" làm tên truyện. */
  const r6 = page('truyen.html', { url: 'https://ssochuz.pages.dev/truyen', fetch: dataFetch() });
  const r7 = page('truyen.html', { url: 'https://ssochuz.pages.dev/reader/lunar-secret/', fetch: dataFetch() });
  const r8 = page('truyen.html', { url: 'https://ssochuz.pages.dev/truyen.html?slug=third-person', fetch: dataFetch() });
  await wait(1400);
  const h1 = pp => (pp.doc.querySelector('#shero h1') || {}).textContent || '';
  out.duongDan = {
    khongCoSlug: { h1: h1(r6), noiRo: /thiếu tên truyện/i.test(r6.doc.body.textContent), loi: r6.errors.slice(0, 3) },
    readerCoSlug: { h1: h1(r7), head: (r7.doc.querySelector('#rdHead') || {}).textContent, loi: r7.errors.slice(0, 3) },
    htmlVoiQuery: { h1: h1(r8), loi: r8.errors.slice(0, 3) },
    khongNhamTenTruyen: !/“truyen”|“reader”/.test(h1(r6) + h1(r7) + h1(r8))
  };

out.errors1 = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
