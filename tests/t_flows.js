/* ============================================================================
   Kiểm thử LUỒNG SỬ DỤNG THẬT (những chỗ dễ hỏng mà bài theo kịch bản bỏ sót)
   - trang đọc: đổi cài đặt đọc (nền/cỡ/rộng/giãn/font/căn đều/kiểu lật trang)
   - trang đọc: thích – lưu – đánh dấu – bình luận – chia sẻ (lưu thật vào máy)
   - danh sách chương: nhảy số chương, tìm chương (tô sáng), đổi thứ tự, phân trang
   - quản trị: xoá chương, đổi thứ tự chương, xoá bộ (đều phải qua hộp thoại xác nhận)
   - quản trị: ngắt kết nối; quản trị KHÔNG được có phím tắt (yêu cầu của chủ trang)
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
  /* Bản nháp đặt TRƯỚC khi nối Worker để loadRegistry() → paintDraftChip() kịp
     hiện nút. Nháp chỉ giữ 3 bộ trong khi registry trên KV có 62 — đủ để thấy
     hai con số trên màn hình có theo kịp nhau hay không. */
  const draftReg = JSON.parse(JSON.stringify(REG));
  draftReg.lib = draftReg.lib.slice(0, 3);
  W.localStorage.setItem('cz_admin_draft', JSON.stringify({ at: Date.now(), reg: draftReg, books: {} }));
  clk('#inApi'); $a('#inApi').value = 'https://cms.test';
  clk('#inKey'); $a('#inKey').value = FAKE_KEY;
  clk('#btnConnect'); await wait(700);
  out.adminConnected = { appShown: !$a('#scApp').classList.contains('hide'), rows: $$a('#tb tbody tr').length };
  out.adminDraftChip = {
    shown: !$a('#btnDraftUse').classList.contains('hide'),
    /* vừa nối Worker xong: cả hai chỗ đều đếm theo registry trên KV */
    libCount: txtA('#libCount'), tabBadge: txtA('#tabLibCt')
  };

  /* mở “Sửa bộ & chương” của third-person */
  const row = $$a('#tb tbody tr').find(r => /Third Person/i.test(r.textContent));
  out.adminFoundRow = !!row;
  if (row) { clk([...row.querySelectorAll('button')].find(b => /sửa/i.test(b.textContent)) || row); await wait(600); }
  out.adminEditOpen = { pane: !$a('#pane-edit').classList.contains('hide'), head: txtA('#edHead'), chaps: $$a('#chList .row2').length };
  const before = BOOK.chapters.length;

  /* thời gian đọc trong trang quản trị: mỗi dòng chương + thanh thống kê dưới ô soạn.
     Người viết cần biết chương dài bao lâu để giữ độ dài đều tay giữa các chương. */
  const chRows = $$a('#chList .row2');
  clk(chRows[1] || chRows[0]); await wait(300);      /* mở một chương có nội dung */
  out.adminReadTime = {
    rows: chRows.length,
    rowsWithTm: chRows.filter(r => r.querySelector('.tm')).length,
    stat: txtA('#chStat'),
    statHasTime: /đọc hết ~\d+ (phút|giờ)/.test(txtA('#chStat'))
  };
  if (chRows.length && out.adminReadTime.rowsWithTm !== chRows.length) {
    console.log('ADMIN THIẾU THỜI GIAN ĐỌC: ' + out.adminReadTime.rowsWithTm + '/' + chRows.length + ' dòng chương');
  }
  if (!out.adminReadTime.statHasTime) console.log('THANH THỐNG KÊ THIẾU THỜI GIAN ĐỌC: ' + out.adminReadTime.stat);

  /* “kiểm tra chương” dưới ô soạn: chỉ báo thứ ĐO ĐƯỢC (độ dài, tường chữ,
     chương rỗng), ngưỡng lấy từ 1.198 chương thật. Máy không chấm văn nên
     bài này cũng chỉ kiểm đúng những thứ máy hứa. */
  const edB = $a('#edBody');
  const keepHtml = edB.innerHTML;                       /* giữ nguyên để test sau không bị ảnh hưởng */
  const chkOf = () => txtA('#chCheck');
  edB.innerHTML = Array(50).fill('chữ').join(' ');
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(150);
  const shortNote = chkOf();
  edB.innerHTML = '<p>' + 'a'.repeat(900) + '</p><p>' + 'b'.repeat(900) + '</p><p>“' +
    Array(900).fill('nói').join(' ') + '”</p>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(150);
  const wallNote = chkOf();
  edB.innerHTML = '';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(150);
  const emptyNote = chkOf();
  edB.innerHTML = keepHtml;                             /* trả lại chương thật */
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(200);
  out.chapCheck = {
    short: shortNote, wall: wallNote, empty: emptyNote,
    restored: chkOf(),
    shortOk: /Chương ngắn/.test(shortNote),
    wallOk: /đoạn dài hơn 500 ký tự/.test(wallNote),
    emptyOk: /chưa có chữ/.test(emptyNote),
    /* chương thật ~1.400 từ, đoạn ngắn → không được báo động gì.
       Kiểm theo ĐÚNG chữ trong thông báo (“đoạn dài hơn 500 ký tự”), không phải
       chữ “tường” vốn chỉ có trong chú thích mã nguồn. */
    quietOnGoodChapter: ['Chương ngắn', 'đoạn dài hơn', 'chưa có chữ', 'rất dài']
      .every(function (s) { return chkOf().indexOf(s) < 0; })
  };
  if (!out.chapCheck.shortOk) console.log('KHÔNG BÁO CHƯƠNG NGẮN: ' + shortNote);
  if (!out.chapCheck.wallOk) console.log('KHÔNG BÁO TƯỜNG CHỮ: ' + wallNote);
  if (!out.chapCheck.emptyOk) console.log('KHÔNG BÁO CHƯƠNG RỖNG: ' + emptyNote);

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
  const titlesBefore = $$a('#chList .row2 .nm').map(e => e.textContent.trim());
  clk('#chDel'); await wait(300);
  out.confirmOpen = !!$a('#czConfirm');
  clk('#czOk'); await wait(300);
  const titlesAfter = $$a('#chList .row2 .nm').map(e => e.textContent.trim());
  out.adminChDel = {
    before: before, after: $$a('#chList .row2').length,
    chon: titleBefore,
    /* Đo trên DANH SÁCH CHƯƠNG mà người quản trị đang nhìn, KHÔNG soi biến BOOK
       của worker giả. Worker giả trả object bằng THAM CHIẾU, nên chừng nào admin
       chưa bấm “Lưu toàn bộ chương” thì BOOK của test và của admin là cùng một
       object; vừa có một lần PUT là biến BOOK bị gán sang object MỚI và phép soi
       cũ đọc phải bản chụp từ trước lúc xoá (báo “chưa xoá” dù danh sách đã mất
       đúng dòng đó). */
    deleted: titlesAfter.indexOf(titleBefore) < 0 && titlesAfter.length === titlesBefore.length - 1,
    firstRow: txtA('#chList .row2 .nm'), lastBadge: txtA('#chList .row2:last-child .pill')
  };
  if (!out.adminChDel.deleted) console.log('XOÁ CHƯƠNG KHÔNG ĂN: ' + JSON.stringify(titlesAfter).slice(0, 160));
  clk('#chNew'); await wait(200);
  $a('#chTitle').value = 'Chương thử'; $a('#edBody').innerHTML = '<p>nội dung</p>';
  out.adminChNew = { n: $$a('#chList .row2').length };

  /* xoá bộ — xác nhận 2 bước trên chính nút (arm2): lần 1 "vũ trang", lần 2 chạy */
  const libBefore = REG.lib.length;
  clk('#btnDelBook'); await wait(150);
  clk('#btnDelBook'); await wait(700);
  out.adminDelBook = { before: libBefore, after: REG.lib.length, gone: !REG.lib.some(x => x.slug === 'third-person'), msg: txtA('#msg').slice(0, 60) };

  /* HỒI QUY · nạp bản nháp phải sửa CẢ HAI con số trên màn hình.
     Bản cũ chỉ cập nhật #libCount, còn huy hiệu trên tab “Thư viện” vẫn đếm theo
     registry vừa đọc từ KV → sau khi dùng nháp, cùng một màn hình hiện hai số
     khác nhau (loadRegistry() có setTabCt('tabLibCt'), useDraft() thì bỏ sót).
     Đặt ở CUỐI khối quản trị: nháp chỉ có 3 bộ nên nếu nạp sớm, các bài phía sau
     (tìm bộ Third Person, mở danh sách chương) sẽ không còn dữ liệu để chạy. */
  clk('#btnDraftUse'); await wait(300);
  clk('#czOk'); await wait(600);
  out.adminDraftBadge = {
    libCount: txtA('#libCount'),
    tabBadge: txtA('#tabLibCt'),
    agree: txtA('#libCount') === txtA('#tabLibCt'),
    applied: txtA('#libCount') === '3' && txtA('#tabLibCt') === '3'
  };
  if (!out.adminDraftBadge.agree) console.log('LỆCH SỐ BỘ SAU KHI NẠP NHÁP: #libCount=' +
    txtA('#libCount') + ' · tab=' + txtA('#tabLibCt'));

  /* HỒI QUY · nhãn nút KHÔNG được hứa phím tắt mà trang không có.
     Chủ trang đã bỏ mọi phím tắt ở trang quản trị (17/09/2026) và bài này ở dưới
     còn kiểm tra Ctrl+S phải KHÔNG làm gì — nhưng hai nút lưu vẫn ghi “(Ctrl+S)”
     nên người dùng bấm theo thì chẳng có chuyện gì xảy ra.
     Ngoại lệ duy nhất: B/I/U trong ô soạn (title “Đậm (Ctrl+B)”…) là hành vi
     contenteditable của chính trình duyệt, không phải phím tắt do trang tự cài. */
  const NATIVE_TITLE = /^(Đậm|Nghiêng|Gạch chân)\s*\(Ctrl\+[BIU]\)$/i;
  out.adminNoFakeShortcuts = $$a('#ashell button, #scConnect button')
    .map(b => ({ t: (b.textContent || '').trim().replace(/\s+/g, ' '), a: b.getAttribute('title') || '' }))
    .filter(x => /Ctrl\s*\+|Phím tắt/i.test(x.t + ' ' + x.a) && !NATIVE_TITLE.test(x.a))
    .map(x => (x.t || '(không chữ)') + ' · title="' + x.a + '"');
  if (out.adminNoFakeShortcuts.length) console.log('NHÃN HỨA PHÍM TẮT KHÔNG CÓ: ' + out.adminNoFakeShortcuts.join(' · '));

  /* ngắt kết nối không được làm treo trang */
  clk('#btnOut'); await wait(300);
  out.adminDisconnect = { key: W.localStorage.getItem('cz_kv_key') };

  /* quản trị KHÔNG có phím tắt (yêu cầu của chủ trang): Ctrl+S, Ctrl+K, số/chữ
     đơn lẻ đều phải bị bỏ qua — không lưu, không đổi tab, không gây lỗi JS */
  const visiblePanes = () => $$a('#ashell [id^="pane-"]:not(.hide)').map(e => e.id).join(',');
  const panesBefore = visiblePanes();
  const msgBefore = txtA('#msg');
  for (const k of [
    { key: 's', ctrlKey: true }, { key: 's', metaKey: true }, { key: 'k', ctrlKey: true },
    { key: '1' }, { key: '5' }, { key: '0' }, { key: 'v' }, { key: 'r' }
  ]) {
    D.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ bubbles: true }, k)));
    await wait(60);
  }
  await wait(200);
  const noShot = { panesStay: visiblePanes() === panesBefore, msgStay: txtA('#msg') === msgBefore };
  out.noAdminShortcuts = noShot;
  const shortcutFail = [];
  if (!noShot.panesStay) shortcutFail.push('bấm số/chữ ngoài ô nhập vẫn đổi tab quản trị');
  if (!noShot.msgStay) shortcutFail.push('Ctrl+S vẫn tự lưu/hiện thông báo ở trang quản trị');
  if (shortcutFail.length) console.log('PHÍM TẮT VẪN CÒN: ' + shortcutFail.join('; '));
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

  const rtFail = [];
  if (out.adminReadTime && out.adminReadTime.rows && out.adminReadTime.rowsWithTm !== out.adminReadTime.rows) {
    rtFail.push('danh sách chương ở trang quản trị thiếu thời gian đọc');
  }
  if (out.adminReadTime && !out.adminReadTime.statHasTime) {
    rtFail.push('thanh thống kê dưới ô soạn thiếu thời gian đọc');
  }
  if (out.chapCheck && !(out.chapCheck.shortOk && out.chapCheck.wallOk && out.chapCheck.emptyOk && out.chapCheck.quietOnGoodChapter)) {
    rtFail.push('kiểm tra chương báo sai: ' + JSON.stringify(out.chapCheck).slice(0, 220));
  }
  /* xoá chương từng chỉ được in ra chứ không làm bài đỏ — giờ tính luôn */
  if (out.adminChDel && !out.adminChDel.deleted) rtFail.push('xoá chương không mất khỏi danh sách');
  out.editorFail = rtFail;
  out.tong = {
    loiTrangDoc: out.errStory.length, loiQuanTri: out.errAdmin.length, loiTrangAnh: out.errImg.length,
    leSoBoSauNhapNhap: out.adminDraftBadge && !out.adminDraftBadge.agree ? 1 : 0,
    nhanHuaPhimTat: (out.adminNoFakeShortcuts || []).length,
    trinhSoan: rtFail.length
  };
  console.log(JSON.stringify(out, null, 1));
  /* các hồi quy mới cũng phải làm bài đỏ, không chỉ in ra cho vui:
     · #libCount và huy hiệu tab “Thư viện” lệch nhau sau khi nạp nháp
     · nhãn nút còn hứa phím tắt mà trang quản trị không cài
     · trình soạn: thiếu thời gian đọc, hoặc “kiểm tra chương” báo sai */
  const bad = a.errors.length + errors.length + (out.shortcutFail || []).length
    + (out.adminDraftBadge && out.adminDraftBadge.agree ? 0 : 1)
    + ((out.adminNoFakeShortcuts || []).length ? 1 : 0)
    + rtFail.length;
  console.log(bad ? 'CÒN ' + bad + ' LỖI' : 'Không lỗi nào');
  process.exit(bad ? 1 : 0);
})();
