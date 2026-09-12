const { page, dataFetch } = require('./mk');
const log = [];
const p = page('reader.html', {
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
  await wait(800);
  const out = { errors0: errors.slice(0, 5) };
  out.title = doc.title;
  out.novel = txt('#barTitle');
  out.paras = $$('#rtext p').length;
  out.head = txt('#cTitle');
  out.readTime = txt('#rTime');
  out.progNow = txt('#pgNow');
  out.resumeHidden = $('#resumeBox').hidden;
  // chuyển chương (trước đây lỗi ReferenceError: reduce)
  click('#btnNext'); await wait(500);
  out.afterNext = { head: txt('#cTitle'), paras: $$('#rtext p').length, prev: txt('#prevName'), next: txt('#nextName') };
  out.progSaved = Object.keys(LS).filter(k => k.startsWith('chuseoz-prog'));
  // tủ truyện
  click('#btnSave'); await wait(60);
  out.shelf = LS.getItem('chuseoz-shelf');
  out.saveOn = $('#btnSave').classList.contains('on');
  // đánh dấu / thích
  click('#btnMark'); click('#btnLike'); await wait(40);
  out.markOn = $('#btnMark').classList.contains('on');
  out.likeOn = $('#btnLike').classList.contains('on');
  out.likeText = txt('#btnLike');
  out.likeLS = LS.getItem('chuseoz-like-third-person');
  // cài đặt: cỡ chữ, nền, chế độ
  click('#btnSet'); await wait(120);
  out.settingsOn = $('#settings').classList.contains('on');
  const fs = $('#setFs') || $('#rngFs') || $('#fsRange');
  out.settingIds = $$('#settings input,#settings button,#settings [data-set]').map(e => e.id || e.dataset.set || e.className).slice(0, 10).join(',');
  if (fs) { fs.value = '22'; fs.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(80); }
  out.readerPref = LS.getItem('chuseoz-reader-demo');
  out.lsAfterSet = Object.keys(LS).filter(k => k.startsWith('chuseoz-')).join(',');
  // số liệu thật: khi Firebase bị chặn thì KHÔNG hiện số
  out.statsOn = !!(win.CZ_STATS && win.CZ_STATS.on);
  out.viewText = txt('#vView, #stViews, .statview');
  // mục lục
  click('#btnChaps'); await wait(150);
  out.drawerOn = $('#drawer').classList.contains('on');
  out.tocRows = $$('#dList a,#dList [data-ch]').length;
  // phím tắt
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(300);
  out.afterKey = txt('#cTitle');
  out.lightboxP = $$('#lightbox img').length;
  out.rStats = txt('#rStats');
  out.errors1 = errors.slice(0, 6);
  out.requested = [...new Set(log.filter(u => u.includes('/data/') || u.includes('cms.test')))].slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
