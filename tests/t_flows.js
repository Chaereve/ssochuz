/* ============================================================================
   Kiểm thử LUỒNG SỬ DỤNG THẬT (những chỗ dễ hỏng mà bài theo kịch bản bỏ sót)
   - trang đọc: đổi cài đặt đọc (nền/cỡ/rộng/giãn/font/căn đều/kiểu lật trang)
   - trang đọc: thích – lưu – đánh dấu – bình luận – chia sẻ (lưu thật vào máy)
   - danh sách chương: nhảy số chương, tìm chương (tô sáng), đổi thứ tự, phân trang
   - quản trị: xoá chương, đổi thứ tự chương, xoá bộ (đều phải qua hộp thoại xác nhận)
   - quản trị: ngắt kết nối; phím tắt Ctrl+S/K/N hoạt động đúng mục đích; các phím
     đơn (số, chữ cái) không đổi tab.
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
     2. QUẢN TRỊ (một admin duy nhất — trang Preact tại /admin): boot tự nối
        bằng phiên đã lưu, thư viện render từ worker giả. Phím tắt được hỗ trợ:
        Ctrl/Cmd+K (focus ô tìm kiếm), Ctrl/Cmd+S (lưu — không đổi tab), Ctrl/
        Cmd+N (thêm chương khi đang ở bộ). Phím đơn (1-9, 0, v, r) vẫn phải bị
        bỏ qua — không đổi tab, không gây lỗi JS.
        Luồng xoá chương/đổi thứ tự/xoá bộ của admin mới nằm ở tests/t_admin_core.js
        và tests/t_admin_writes.js — không lặp lại ở đây.
     ===================================================================== */
  const FAKE_KEY = 'khoa-test';
  /* FIX (25/09): REG/BOOK/BOOKS được workerFetch dùng mà KHÔNG BAO GIỜ khai báo
     — gọi /api/registry (đường tự nối của boot) ném ReferenceError nên admin
     đứng cổng mãi, phần test phím tắt quản trị đỏ dù web thật chạy đúng.
     Khai báo fixture thật để boot tự nối + bảng thư viện render được. */
  let REG = { rev: 'r1', lib: [
    { title: 'Bộ Thử A', slug: 'bo-thu-a', author: 'TG A', chapters: 5, pubStatus: 'public' },
    { title: 'Bộ Thử B', slug: 'bo-thu-b', author: 'TG B', chapters: 3, pubStatus: 'public' }
  ] };
  let BOOK = { slug: 'third-person', title: 'Bộ Thử B', author: 'TG B',
    chapters: [{ t: 'Chương 1', html: '<p>1</p>' }, { t: 'Chương 2', html: '<p>2</p>' }] };
  const BOOKS = { 'bo-thu-a': true, 'bo-thu-b': true, 'third-person': true };
  function workerFetch(url, opt = {}) {
    url = String(url); const method = (opt.method || 'GET').toUpperCase();
    /* headers bắt buộc phải có: api.js đọc content-type để chọn json()/text() —
       thiếu nó mọi response về dạng STRING và bảng thư viện render 0 dòng
       (mà app vẫn “vào được” → test tưởng admin hỏng, thực ra do mock). */
    const ret = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200,
      json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)),
      headers: { get: (n) => (String(n).toLowerCase() === 'content-type' ? 'application/json' : '') } });
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
    if (path.startsWith('/api/book/')) return ret({ ok: true });
    if (path === '/api/book/third-person') {
      if (method === 'GET') return ret(BOOK);
      BOOK = JSON.parse(opt.body).book || JSON.parse(opt.body); return ret({ ok: true });
    }
    return ret({ ok: false, error: 'không có ' + path }, false, 404);
  }

  const a = page('admin.html', { url: 'https://ssochuz.pages.dev/admin', fetch: workerFetch });
  const W = a.win, D = a.doc;
  const $a = s => D.querySelector(s), $$a = s => [...D.querySelectorAll(s)];
  await wait(400);
  /* Phiên lưu đúng cách app ĐỌC (vá bảo mật 23/09): URL Worker ở localStorage,
     khoá admin ở SESSIONstorage — loadSavedConnection() xoá khoá khỏi localStorage
     khi mở trang. Viết khoá vào localStorage thì boot không tự nối được. */
  W.localStorage.setItem('cz_kv_api', 'https://cms.test');
  W.sessionStorage.setItem('cz_kv_key', FAKE_KEY);
  /* boot chờ CZ_AUTH.whenSettled(); trong jsdom không tải được script Supabase
     từ CDN nên settle chỉ tới qua lưới an toàn 8 giây — CHỜ TÍCH CỰC nút .v2app
     (trước đây chờ cố định 1 giây nên phần này đỏ dù web thật chạy đúng). */
  let waited = 0;
  while (!a.doc.querySelector('.v2app') && waited < 11000) { await wait(250); waited += 250; }
  out.adminConnected = { vaoDuoc: !!$a('.v2app'), navTabs: $$a('.v2side nav button').length, waitedMs: waited };

  /* mở tab Thư viện → bảng sách render từ registry của worker giả */
  const btnList = $a('button[data-tab="list"]');
  if (btnList) btnList.dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
  await wait(400);
  out.adminLibrary = { rows: $$a('.v2book-table tbody tr').length };
  if (!out.adminLibrary.rows) console.log('THƯ VIỆN ADMIN KHÔNG RENDER DÒNG NÀO');

  /* Phím tắt quản trị: Ctrl+K focus ô tìm kiếm, Ctrl+S không đổi tab (toast
     “không có gì để lưu” vì chưa vào trình sửa bộ), các phím đơn không đổi tab */
  const tabNow = () => { const b = $a('button[data-tab].on'); return b ? b.dataset.tab : ''; };
  const tabBefore = tabNow();
  const activeBefore = D.activeElement;
  /* Ctrl+K: focus ô tìm kiếm (input trong .v2search) */
  D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  await wait(80);
  const searchFocused = !!($a('.v2search input') && $a('.v2search input') === D.activeElement);
  /* bỏ focus lại cho sạch */
  if (D.activeElement && D.activeElement.blur) D.activeElement.blur();
  /* Ctrl+S: không đổi tab; không ném lỗi */
  D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  await wait(60);
  /* phím đơn: không đổi tab */
  for (const k of [
    { key: '1' }, { key: '5' }, { key: '0' }, { key: 'v' }, { key: 'r' }
  ]) {
    D.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ bubbles: true }, k)));
    await wait(60);
  }
  await wait(200);
  out.noAdminShortcuts = { tabStay: tabNow() === tabBefore, ctrlKFocus: searchFocused };
  const shortcutFail = [];
  if (tabNow() !== tabBefore) shortcutFail.push('phím tắt vẫn đổi tab quản trị');
  if (!searchFocused) shortcutFail.push('Ctrl+K chưa focus ô tìm kiếm');
  if (shortcutFail.length) console.log('PHÍM TẮT LỖI: ' + shortcutFail.join('; '));
  out.shortcutFail = shortcutFail;
  out.errAdmin = a.errors.slice(0, 6);

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
  const bad = a.errors.length + errors.length + (out.shortcutFail || []).length;
  console.log(bad ? 'CÒN ' + bad + ' LỖI JS' : 'Không lỗi JS nào');
  process.exit(bad ? 1 : 0);
})();
