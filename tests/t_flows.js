/* ============================================================================
   Kiểm thử LUỒNG SỬ DỤNG THẬT (những chỗ dễ hỏng mà bài theo kịch bản bỏ sót)
   - trang đọc: đổi cài đặt đọc (nền/cỡ/rộng/giãn/font/căn đều/kiểu lật trang)
   - trang đọc: thích – lưu – đánh dấu – bình luận – chia sẻ (lưu thật vào máy)
   - danh sách chương: nhảy số chương, tìm chương (tô sáng), đổi thứ tự, phân trang
   - quản trị: xoá chương, đổi thứ tự chương, xoá bộ (đều phải qua hộp thoại xác nhận)
   - quản trị: ngắt kết nối, phím tắt Ctrl+S
   Chạy:  cd tests && node t_flows.js
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const log = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};

  /* =====================================================================
     1. TRANG ĐỌC
     ===================================================================== */
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    fetch: dataFetch({ apiBase: 'https://cms.test', log })
  });
  const { win, doc, errors } = p;
  const LS = win.localStorage;
  const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
  const txt = s => { const e = $(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
  const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
  const key = (k, opt) => doc.dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opt || {})));
  await wait(1200);

  /* --- vào chương 2 --- */
  win.location.hash = '#chuong-2'; await wait(400);
  out.reader = { reading: doc.body.classList.contains('reading'), head: txt('#rdHead'), sub: txt('#rdSub') };

  /* --- cài đặt đọc --- */
  click('#rdSet'); await wait(200);
  const setRows = $$('#setBody .srow2');
  out.setRows = setRows.map(r => r.querySelector('span').textContent.trim());
  const pick = (rowLabel, label) => {
    const row = $$('#setBody .srow2').find(r => (r.querySelector('span') || {}).textContent.trim() === rowLabel);
    if (!row) return 'MISSING hàng ' + rowLabel;
    const b = [...row.querySelectorAll('.opts button')].find(x => x.textContent.trim() === label);
    if (!b) return 'MISSING ' + label;
    b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    return 'ok';
  };
  out.pickTheme = pick('Nền đọc', 'Tối');
  await wait(120);
  out.pickSize = pick('Cỡ chữ', 'Rất lớn');
  await wait(120);
  out.pickWidth = pick('Độ rộng cột chữ', 'Hẹp');
  await wait(120);
  out.pickFont = pick('Kiểu chữ', 'Sans');
  await wait(120);
  out.pickJust = pick('Căn đều hai bên', 'Bật');
  await wait(120);
  out.pickMode = pick('Kiểu xem', 'Phân trang');
  await wait(250);
  out.settings = {
    ls: JSON.parse(LS.getItem('ssochuz-reader') || '{}'),
    bodyRd: doc.body.dataset.rd,
    sizeVar: win.document.documentElement.style.getPropertyValue('--rd-size'),
    widthVar: win.document.documentElement.style.getPropertyValue('--rd-w'),
    navMid: txt('#rdNav .mid small'),
    textClasses: doc.querySelector('#rdText').className,
    justify: (win.document.documentElement.style.getPropertyValue('--rd-line') || '') + ' / ' + (doc.querySelector('#rdText').classList.contains('just') ? 'just' : 'no-just')
  };
  click('#setSheet .ph .ibo'); await wait(150);   /* đóng ngăn kéo */

  /* --- lật trang: còn 1 trang thì “trang sau” = chương sau --- */
  click('#navNext'); await wait(350);
  out.afterTurn = { hash: win.location.hash, sub: txt('#rdSub') };

  /* --- thích / lưu / đánh dấu --- */
  click('#actLike'); await wait(120);
  click('#actSave'); await wait(120);
  click('#actMark'); await wait(120);
  out.marks = {
    like: LS.getItem('ssochuz-like-third-person'),
    shelf: LS.getItem('ssochuz-shelf'),
    mark: LS.getItem('ssochuz-mark-third-person'),
    markBtnOn: $('#rdMark').classList.contains('on'),
    saveLabel: txt('#actSave span'),
    likeLabel: txt('#actLike span')
  };
  click('#actLike'); await wait(120);           /* bỏ thích lại */
  out.unlike = LS.getItem('ssochuz-like-third-person');

  /* --- phím tắt --- */
  key('ArrowRight'); await wait(300);
  out.afterKeyRight = txt('#rdSub');
  key('ArrowLeft'); await wait(300);
  out.afterKeyLeft = txt('#rdSub');
  key('b'); await wait(150);
  out.markToggled = txt('#rdToast');
  key('f'); await wait(150);
  out.focusMode = doc.body.classList.contains('rd-focus');
  key('f'); await wait(120);
  key('Escape'); await wait(250);
  out.afterEsc = { reading: doc.body.classList.contains('reading'), hash: win.location.hash || '(trống)' };

  /* --- danh sách chương: tìm + nhảy số + đổi thứ tự + phân trang --- */
  const cq = $('#chapQ');
  cq.value = 'kẹo'; cq.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(250);
  out.chapSearch = { rows: $$('#chapGrid .cha').length, hit: txt('#chapGrid mark.hit'), text: txt('#chapGrid .cha') };
  cq.value = ''; cq.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(200);
  const jump = $('#chapJump');
  jump.value = '4'; jump.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(320);
  out.chapJump = { hash: win.location.hash, sub: txt('#rdSub'), cleared: jump.value === '' };
  key('Escape'); await wait(220);
  click($$('#chapGrid .cha')[3]); await wait(300);
  out.chapClickOpens = { reading: doc.body.classList.contains('reading'), sub: txt('#rdSub') };
  key('Escape'); await wait(200);
  out.sortUI = { active: txt('#chapSort .on'), topGone: !$('#chapTop') };
  click($$('#chapSort button')[0]); await wait(200);
  out.sortNewFirst = txt('#chapGrid .cha .nm');
  click($$('#chapSort button')[1]); await wait(200);
  out.sortOldFirst = txt('#chapGrid .cha .nm');
  out.story = {
    chapCount: txt('#chapCount'),
    relSeries: $$('#relSeries a').length,
    relCouple: $$('#relCouple a').length
  };
  out.errStory = errors.slice(0, 5);
  out.logCount = log.length;

  /* --- thanh công cụ tự ẩn sau 3 giây, chạm là hiện lại --- */
  win.location.hash = '#chuong-2'; win.location.hash = ''; await wait(200);
  win.location.hash = '#chuong-2'; await wait(100);
  out.hideBefore = doc.body.classList.contains('rd-hide');
  await wait(3400);
  out.hideAfter3s = doc.body.classList.contains('rd-hide');
  doc.dispatchEvent(new win.MouseEvent('pointermove', { bubbles: true })); await wait(150);
  out.hideWoken = !doc.body.classList.contains('rd-hide');

  /* --- nút “Mặc định” trong cài đặt đọc --- */
  click('#rdSet'); await wait(200);
  click('#setReset'); await wait(200);
  out.resetSettings = JSON.parse(LS.getItem('ssochuz-reader') || '{}');
  click('#setSheet .ph .ibo'); await wait(150);
  /* --- phím ? hiện trợ giúp --- */
  key('?'); await wait(150);
  out.helpToast = /chuyển chương/.test(txt('#rdToast'));
  key('Escape'); await wait(200);

  /* =====================================================================
     2. QUẢN TRỊ — xoá chương, đổi thứ tự, xoá bộ, ngắt kết nối
     ===================================================================== */
  const FAKE_KEY = 'khoa-test';
  function workerFetch(url, opt = {}) {
    url = String(url); const method = (opt.method || 'GET').toUpperCase();
    const ret = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200,
      json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
    const H = (opt.headers || {});
    const auth = H['x-admin-key'] === FAKE_KEY;
    const path = url.replace(/^https:\/\/cms\.test/, '').split('?')[0];
    if (path === '/api/health') return ret({ ok: true, version: '1.1.0', books: 62, novels: 62, regRev: 'r1', kv: true });
    if (path === '/api/whoami') return auth ? ret({ ok: true, role: 'admin' }) : ret({ ok: false, error: 'sai khoá' }, false, 401);
    if (!auth) return ret({ ok: false, error: 'unauthorized' }, false, 401);
    if (path === '/api/registry') {
      if (method === 'GET') return ret(REG);
      REG = JSON.parse(opt.body).registry || JSON.parse(opt.body); return ret({ ok: true, rev: 'r2' });
    }
    if (method === 'DELETE') { delete BOOKS[path.replace('/api/book/', '')]; return ret({ ok: true }); }
    if (path === '/api/book/third-person') {
      if (method === 'GET') return ret(BOOK);
      BOOK = JSON.parse(opt.body).book || JSON.parse(opt.body); return ret({ ok: true });
    }
    if (path.startsWith('/api/book/')) return ret({ ok: true });
    return ret({ ok: false, error: 'không có ' + path }, false, 404);
  }
  const BOOKS = {};
  let REG = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data/registry.json'), 'utf8'));
  REG = JSON.parse(JSON.stringify(REG));
  let BOOK = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data/book/third-person.json'), 'utf8'));
  BOOK = JSON.parse(JSON.stringify(BOOK));

  const a = page('admin.html', { url: 'https://ssochuz.pages.dev/admin', fetch: workerFetch });
  const W = a.win, D = a.doc;
  const $a = s => D.querySelector(s), $$a = s => [...D.querySelectorAll(s)];
  const clk = s => { const e = typeof s === 'string' ? $a(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); return 'ok'; };
  const txtA = s => { const e = $a(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
  await wait(500);
  W.localStorage.setItem('cz_kv_api', 'https://cms.test');
  W.localStorage.setItem('cz_kv_key', FAKE_KEY);
  clk('#inApi'); $a('#inApi').value = 'https://cms.test';
  clk('#inKey'); $a('#inKey').value = FAKE_KEY;
  clk('#btnConnect'); await wait(700);
  out.adminConnected = { appShown: !$a('#scApp').classList.contains('hide'), rows: $$a('#tb tbody tr').length };

  /* mở “Sửa bộ & chương” của third-person */
  const row = $$a('#tb tbody tr').find(r => /Third Person/i.test(r.textContent));
  out.adminFoundRow = !!row;
  if (row) { clk([...row.querySelectorAll('button')].find(b => /sửa/i.test(b.textContent)) || row); await wait(600); }
  out.adminEditOpen = { pane: !$a('#pane-edit').classList.contains('hide'), head: txtA('#edHead'), chaps: $$a('#chList .row2').length };
  const before = BOOK.chapters.length;

  /* đổi thứ tự: đưa chương cuối xuống? (đưa lên) */
  const rows = $$a('#chList .row2');
  out.adminReorder = { hasBtn: !!rows[2] && !!rows[2].querySelector('[data-up]'), beforeList: rows.slice(0, 3).map(r => txtA.call ? r.querySelector('.nm').textContent.trim() : '') };
  clk(rows[2].querySelector('[data-up]')); await wait(250);
  out.adminReorderAfter = $$a('#chList .row2').slice(0, 3).map(r => r.querySelector('.nm').textContent.trim());
  out.adminReorderUnchanged = JSON.stringify(out.adminReorder.beforeList) === JSON.stringify(out.adminReorderAfter);
  clk('#btnSaveCh'); await wait(600);
  out.adminReorderSaved = { msg: txtA('#msg').slice(0, 70), n: BOOK.chapters.length, firstNow: BOOK.chapters[0].t };

  /* xoá 1 chương (qua hộp thoại xác nhận) */
  clk($$a('#chList .row2')[0]); await wait(200);
  const titleBefore = $a('#chTitle').value;
  clk('#chDel'); await wait(300);
  out.confirmOpen = !!$a('#czConfirm');
  clk('#czOk'); await wait(300);
  out.adminChDel = {
    before: before, after: $$a('#chList .row2').length,
    chon: titleBefore, deleted: !BOOK.chapters.some(c => c.t === titleBefore),
    firstRow: txtA('#chList .row2 .nm'), lastBadge: txtA('#chList .row2:last-child .pill')
  };
  $a('#chTitle').value = 'Chương thử'; $a('#chBody').value = 'nội dung';
  clk('#chNew'); await wait(200);
  out.adminChNew = { n: $$a('#chList .row2').length };

  /* xoá bộ (qua hộp thoại xác nhận) */
  const libBefore = REG.lib.length;
  clk('#btnDelBook'); await wait(300);
  clk('#czOk'); await wait(700);
  out.adminDelBook = { before: libBefore, after: REG.lib.length, gone: !REG.lib.some(x => x.slug === 'third-person'), msg: txtA('#msg').slice(0, 60) };

  /* ngắt kết nối không được làm treo trang */
  clk('#btnOut'); await wait(300);
  out.adminDisconnect = { key: W.localStorage.getItem('cz_kv_key') };

  /* phím tắt Ctrl+S không gây lỗi */
  D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  await wait(200);
  out.errAdmin = a.errors.slice(0, 6);
  out.afterShortcutMsg = txtA('#msg').slice(0, 60);

  /* =====================================================================
     3. ẢNH TRONG CHƯƠNG + ĐỔI TÔNG MÀU + MENU ĐIỆN THOẠI
     ===================================================================== */
  const img = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/co-vo-ho-anh-cua-toi/#chuong-2',
    fetch: dataFetch({ apiBase: 'https://cms.test' })
  });
  await wait(1300);
  const D2 = img.doc;
  const q2 = s2 => D2.querySelector(s2);
  out.imgChap = {
    imgs: D2.querySelectorAll('#rdText img').length,
    lazy: (D2.querySelector('#rdText img') || {}).getAttribute ? D2.querySelector('#rdText img').getAttribute('loading') : ''
  };
  const im = D2.querySelector('#rdText img');
  if (im) {
    im.dispatchEvent(new img.win.MouseEvent('click', { bubbles: true }));
    await wait(120);
    out.lightboxOpen = q2('#lightbox').classList.contains('on');
    q2('#lightbox').dispatchEvent(new img.win.MouseEvent('click', { bubbles: true }));
    await wait(120);
    out.lightboxClosed = !q2('#lightbox').classList.contains('on');
  }
  /* đổi sáng/tối ở đầu trang: có nhớ không */
  const tb = D2.querySelector('#czTheme');
  tb.dispatchEvent(new img.win.MouseEvent('click', { bubbles: true })); await wait(120);
  out.theme = { attr: D2.documentElement.getAttribute('data-theme'), ls: img.win.localStorage.getItem('ssochuz-theme') };
  tb.dispatchEvent(new img.win.MouseEvent('click', { bubbles: true })); await wait(120);
  out.themeBack = D2.documentElement.getAttribute('data-theme');
  /* menu điện thoại */
  const bg = D2.querySelector('#czBurger');
  bg.dispatchEvent(new img.win.MouseEvent('click', { bubbles: true })); await wait(120);
  out.burger = D2.querySelector('#czMnav').classList.contains('on');
  bg.dispatchEvent(new img.win.MouseEvent('click', { bubbles: true })); await wait(120);
  out.burgerClosed = !D2.querySelector('#czMnav').classList.contains('on');
  out.errImg = img.errors.slice(0, 5);

  out.tong = { loiTrangDoc: out.errStory.length, loiQuanTri: out.errAdmin.length, loiTrangAnh: out.errImg.length };
  console.log(JSON.stringify(out, null, 1));
  const bad = a.errors.length + errors.length;
  console.log(bad ? 'CÒN ' + bad + ' LỖI JS' : 'Không lỗi JS nào');
  process.exit(0);
})();
