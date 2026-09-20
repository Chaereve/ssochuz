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

  /* =====================================================================
     TRÌNH SOẠN · thanh định dạng, liên kết, xem trước, toàn màn hình, tự lưu
     jsdom KHÔNG có document.execCommand (typeof === 'undefined'), nên không thể
     kiểm hiệu ứng định dạng thật. Ở đây gắn máy ghi để bắt ĐÚNG LỆNH admin.js
     phát ra cho trình duyệt — kiểm được phần ta viết (điều phối nút, lọc URL,
     khôi phục vùng chọn), còn phần trình duyệt tự làm thì để trình duyệt.
     ===================================================================== */
  const execCalls = [];
  D.execCommand = function (cmd, ui, val) { execCalls.push([cmd, val === undefined ? null : val]); return true; };
  const onBox = (s) => { const e = $a(s); return !!e && e.classList.contains('on'); };   /* CZ.modal tái dùng phần tử, đóng = bỏ class .on */

  const tbBtns = $$a('#edToolbar button');
  const tbHas = (k, v) => tbBtns.filter((b) => b.dataset[k] === v).length;
  out.editorTools = {
    link: tbHas('link', ''), list: tbHas('cmd', 'insertUnorderedList'), ol: tbHas('cmd', 'insertOrderedList'),
    indent: tbHas('cmd', 'indent'), outdent: tbHas('cmd', 'outdent'), unlink: tbHas('cmd', 'unlink'),
    removeFormat: tbHas('cmd', 'removeFormat'), undo: tbHas('cmd', 'undo'), redo: tbHas('cmd', 'redo'),
    alignFull: tbHas('align', 'full'),
    preview: !!$a('#chPreview'), full: !!$a('#chFull'), saveState: !!$a('#chSaveState'),
    /* §19: không được có nút chỉ-có-biểu-tượng mà không có tên đọc được */
    nutKhongTen: tbBtns.filter((b) => !b.textContent.trim() && !b.title).map((b) => b.outerHTML.slice(0, 60)),
  };

  edB.focus();
  const selR = D.createRange(); selR.selectNodeContents(edB);
  const sel0 = W.getSelection(); sel0.removeAllRanges(); sel0.addRange(selR);
  D.dispatchEvent(new W.Event('selectionchange'));
  execCalls.length = 0;
  ['insertUnorderedList', 'insertOrderedList', 'outdent', 'indent', 'unlink', 'removeFormat', 'undo', 'redo']
    .forEach((c) => clk('[data-cmd="' + c + '"]'));
  clk('[data-align="full"]'); await wait(250);
  out.editorCmds = execCalls.map((c) => c[0]);

  /* liên kết: chặn javascript: (không được phát lệnh), rồi chèn URL hợp lệ */
  clk('[data-link]'); await wait(250);
  const linkOpen = { hop: onBox('#czLink'), input: !!$a('#lkUrl'), nut: !!$a('#lkOk') };
  $a('#lkUrl').value = 'javascript:alert(1)';
  execCalls.length = 0;
  clk('#lkOk'); await wait(250);
  const linkBlocked = { vanMo: onBox('#czLink'), baoLoi: txtA('#lkErr'), khongPhatLenh: execCalls.length === 0 };
  $a('#lkUrl').value = '  https://example.com  ';
  execCalls.length = 0;
  clk('#lkOk'); await wait(300);
  const linkOk = execCalls.filter((c) => c[0] === 'createLink');
  out.editorLink = {
    mo: linkOpen.hop && linkOpen.input && linkOpen.nut,
    chanJs: linkBlocked.vanMo && linkBlocked.khongPhatLenh && /không hợp lệ/.test(linkBlocked.baoLoi),
    dongHop: !onBox('#czLink'),
    /* URL phải được CẮT khoảng trắng trước khi đưa vào href */
    chenDung: linkOk.length === 1 && linkOk[0][1] === 'https://example.com',
  };
  /* safeLink là chốt chặn dùng chung — kiểm thẳng bảng ca nguy hiểm */
  const SL = W.CZ.safeLink;
  out.editorSafeLink = {
    chan: ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', '  javascript :alert(1)',
      'data:text/html,x', 'vbscript:msgbox(1)', 'file:///etc/passwd', '', '   '].filter((u) => SL(u) !== ''),
    cho: [['https://example.com', 'https://example.com'], ['example.com', 'https://example.com'],
      ['/truyen/abc/', '/truyen/abc/'], ['#chuong-1', '#chuong-1'],
      ['http://a.com/x?b=1#c', 'http://a.com/x?b=1#c']].filter((p) => SL(p[0]) !== p[1]),
  };

  /* xem trước: phải render nội dung VÀ lọc sạch HTML bẩn */
  edB.innerHTML = '<p>Một hai ba bốn</p><a href="https://example.com">liên kết</a>' +
    '<img src="/api/img/abc.webp" onerror="alert(1)"><script>alert(9)<\/script>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(200);
  clk('#chPreview'); await wait(350);
  const pvBody = $a('#czPrev .prevbody');
  const pvOut = {
    mo: onBox('#czPrev'),
    noiDung: /Một hai ba bốn/.test(txtA('#czPrev')),
    soTu: /từ/.test(txtA('#czPrev .mf')),
    giuLienKet: !!pvBody && /<a href="https:\/\/example\.com"/i.test(pvBody.innerHTML),
    lotOnerror: !!pvBody && !/onerror/i.test(pvBody.innerHTML),
    lotScript: !!pvBody && !/<script/i.test(pvBody.innerHTML),
    anhTroWorker: !!pvBody && /src="https:\/\/cms\.test\/api\/img\//.test(pvBody.innerHTML),
  };
  clk('#czPrev [data-close]'); await wait(350);
  out.editorPreview = Object.assign(pvOut, { dongDuoc: !onBox('#czPrev') });

  /* toàn màn hình: bật, Esc tắt, aria-pressed phải theo kịp */
  clk('#chFull'); await wait(200);
  const fullOn = D.body.classList.contains('ed-full');
  const ariaOn = $a('#chFull').getAttribute('aria-pressed');
  D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
  out.editorFull = {
    bat: fullOn, ariaOn: ariaOn,
    escTat: !D.body.classList.contains('ed-full'), ariaOff: $a('#chFull').getAttribute('aria-pressed'),
  };

  /* tự lưu nháp: gõ → 2s → có bản nháp trong máy; đưa vào bộ → xoá nháp */
  edB.innerHTML = '<p>Chữ mới chưa lưu ở đâu cả và đủ dài để khác hẳn bản gốc trong bộ.</p>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(300);
  const stTruoc = txtA('#chSaveState');
  await wait(2600);
  const dKey = Object.keys(W.localStorage).filter((k) => /^cz_ch_draft:/.test(k));
  out.editorAutoSave = {
    key: dKey.length === 1 ? dKey[0] : null,
    cho: /Chưa lưu/.test(stTruoc),
    bao: /Nháp trong máy lúc/.test(txtA('#chSaveState')),
    dungNoiDung: dKey.length === 1 && /Chữ mới chưa lưu/.test(JSON.parse(W.localStorage.getItem(dKey[0])).html),
  };
  clk('#chSave'); await wait(350);
  out.editorAutoSave.xoaKhiLuu = !Object.keys(W.localStorage).some((k) => /^cz_ch_draft:/.test(k));

  /* DÁN TỪ WORD + KÉO THẢ ẢNH.
     Hai ngả này dễ hỏng âm thầm: Word nhét <o:p>, class MsoNormal, style mso-* và
     <img src="file:///C:/…"> trỏ về đĩa máy người viết (độc giả thấy ảnh vỡ).
     jsdom không có execCommand nên ta soi HTML mà admin định chèn. */
  const mkCd = (files, html, text) => ({ files: files || [], getData: (t) => (t === 'text/html' ? (html || '') : (text || '')) });
  const firePaste = (cd) => {
    const ev = new W.Event('paste', { bubbles: true, cancelable: true });
    ev.clipboardData = cd;
    edB.focus(); edB.dispatchEvent(ev);
    return ev;
  };
  const wordHtml = '<html><head><style>b{}</style></head><body>' +
    '<p class="MsoNormal">Đoạn một <o:p></o:p></p>' +
    '<p><span style="mso-bidi-font-family:Arial">Đoạn hai</span></p>' +
    '<img src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/image001.png">' +
    '<a href="javascript:alert(1)">link độc</a><script>alert(2)<\/script>' +
    '<!--[if gte vml 1]><v:shape></v:shape><![endif]--></body></html>';
  execCalls.length = 0;
  const evWord = firePaste(mkCd([], wordHtml, 'Đoạn một Đoạn hai'));
  await wait(300);
  const insWord = execCalls.find((c) => c[0] === 'insertHTML');
  const hw = insWord ? insWord[1] : '';
  out.editorPasteWord = {
    chanDanMacDinh: evWord.defaultPrevented,
    dungLenh: !!insWord,
    giuChu: /Đoạn một/.test(hw) && /Đoạn hai/.test(hw),
    sachMsoClass: !/MsoNormal/i.test(hw),
    sachMsoStyle: !/mso-/i.test(hw),
    sachOp: !/<o:p/i.test(hw),
    sachAnhFileLocal: !/file:/i.test(hw),
    sachJsLink: !/javascript:/i.test(hw),
    sachScript: !/<script/i.test(hw),
    sachCommentVml: !/v:shape/i.test(hw),
  };

  /* kéo thả: đèn báo sáng khi kéo, tắt khi thả, từ chối tệp không phải ảnh */
  const fireDrag = (type, files) => {
    const ev = new W.Event(type, { bubbles: true, cancelable: true });
    ev.dataTransfer = { types: ['Files'], files: files || [] };
    edB.dispatchEvent(ev);
    return ev;
  };
  fireDrag('dragover'); await wait(150);
  const dragOn = edB.classList.contains('dragging');
  const evDrop = fireDrag('drop', [{ name: 'bia.jpg', type: 'image/jpeg', size: 4096 }]);
  await wait(400);
  const evPdf = fireDrag('drop', [{ name: 'bao-cao.pdf', type: 'application/pdf', size: 999 }]);
  await wait(300);
  out.editorDragDrop = {
    sangDenKhiKeo: dragOn,
    tatDenSauTha: !edB.classList.contains('dragging'),
    chanMacDinh: evDrop.defaultPrevented,
    tuChoiPdf: /Chỉ nhận tệp ảnh/.test(txtA('#toasts')),
  };

  /* KHỐI MỚI: chỉ số · ký tự đặc biệt · khung cảnh báo · code · bảng.
     Khung cảnh báo cố tình dùng <aside> chứ không <div>: cả edHtml() lẫn
     cleanHTML() đều đổi <div> chỉ-chứa-chữ thành <p> mà KHÔNG xét class, nên
     <div class="callout"> sẽ mất class khi lưu. Bài này khoá lại quyết định đó. */
  const tbBtns2 = $$a('#edToolbar button');
  const has2 = (k, v) => tbBtns2.filter((b) => b.dataset[k] === v).length;
  out.editorBlocks = {
    sub: has2('cmd', 'subscript'), sup: has2('cmd', 'superscript'), special: has2('special', ''),
    callout: ['info', 'warn', 'bad'].every((k) => has2('callout', k) === 1),
    code: has2('code', ''), table: has2('table', ''),
    trow: has2('trow', ''), tcol: has2('tcol', ''), thead: has2('thead', ''),
    tdel: has2('tdel', 'row') === 1 && has2('tdel', 'col') === 1,
    khongTen: tbBtns2.filter((b) => !b.textContent.trim() && !b.title).length,
  };
  execCalls.length = 0;
  clk('[data-cmd="subscript"]'); clk('[data-cmd="superscript"]');
  const chiSo = execCalls.map((c) => c[0]);
  out.editorBlocks.chiSo = chiSo.indexOf('subscript') >= 0 && chiSo.indexOf('superscript') >= 0;

  execCalls.length = 0;
  clk('[data-callout="warn"]'); await wait(200);
  const cIns = execCalls.find((c) => c[0] === 'insertHTML');
  out.editorBlocks.khungLaAside = !!cIns && /<aside class="callout warn">/.test(cIns[1]);

  clk('[data-special]'); await wait(350);
  const spBox = $a('#czSpecial');
  out.editorBlocks.kyTu = {
    mo: !!spBox && spBox.classList.contains('on'),
    soNut: spBox ? spBox.querySelectorAll('.spch').length : 0,
    coDau: !!spBox && /©/.test(spBox.textContent) && /—/.test(spBox.textContent),
  };
  execCalls.length = 0;
  if (spBox) clk(spBox.querySelector('.spch'));
  await wait(250);
  out.editorBlocks.kyTu.chenDuoc = execCalls.some((c) => c[0] === 'insertText' && c[1].length > 0);
  if ($a('#czSpecial')) clk('#czSpecial [data-close]');
  await wait(300);

  /* bảng: thêm/xoá dòng cột bằng DOM thật, không cần execCommand */
  edB.innerHTML = '<table class="tb"><tbody>' +
    '<tr><td>a1</td><td>a2</td><td>a3</td></tr>' +
    '<tr><td>b1</td><td>b2</td><td>b3</td></tr></tbody></table>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(200);
  const pickCell = (r, c) => {
    const cell = edB.querySelectorAll('table.tb tr')[r].cells[c];
    const rg2 = D.createRange(); rg2.selectNodeContents(cell);
    const s2 = W.getSelection(); s2.removeAllRanges(); s2.addRange(rg2);
    D.dispatchEvent(new W.Event('selectionchange'));
  };
  const shape = () => { const t = edB.querySelector('table.tb'); return t ? t.rows.length + 'x' + t.rows[0].cells.length : 'KHONG'; };
  pickCell(1, 1);
  out.editorBlocks.bang = { truoc: shape() };
  clk('[data-trow]'); await wait(200); out.editorBlocks.bang.themDong = shape();
  clk('[data-tcol]'); await wait(200); out.editorBlocks.bang.themCot = shape();
  clk('[data-thead]'); await wait(200);
  out.editorBlocks.bang.dongDau = edB.querySelector('table.tb').rows[0].cells[0].tagName;
  clk('[data-tdel="col"]'); await wait(200); out.editorBlocks.bang.xoaCot = shape();
  /* sau khi xoá cột, con trỏ phải được đưa về ô còn sống để xoá dòng ăn tiếp */
  clk('[data-tdel="row"]'); await wait(200); out.editorBlocks.bang.xoaDong = shape();
  clk('[data-tdel="row"]'); await wait(200);            /* 2x3 -> 1x3, van xoa duoc */
  clk('[data-tdel="row"]'); await wait(280);            /* lan nay phai TU CHOI */
  out.editorBlocks.bang.tuChoiXoaDongCuoi = shape() === '1x3' && /chỉ còn một dòng/.test(txtA('#toasts'));

  /* <aside> phải sống sót qua edHtml() khi đưa vào bộ */
  edB.innerHTML = '<aside class="callout info"><b>Thông tin:</b> giữ nguyên nhé</aside><p>đoạn thường</p>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(250);
  clk('#chSave'); await wait(400);
  const savedCh = (BOOK.chapters.filter((c) => /giữ nguyên nhé/.test(c.html || ''))[0] || {}).html || '';
  out.editorBlocks.asideSongSot = /<aside class="callout info">/.test(savedCh) && !/<p class="callout/.test(savedCh);

  /* CHÚ THÍCH + CĂN ẢNH, và TÌM & THAY trong chương.
     Thay thế đi qua TEXT NODE chứ không thay trên innerHTML — nếu thay trên
     innerHTML thì chữ trùng tên thẻ/thuộc tính sẽ bị phá, nên bài này cố tình
     đặt data-nam="…" và thẻ <h3> chứa đúng chữ cần thay để bắt lỗi đó. */
  const tbBtns3 = $$a('#edToolbar button');
  out.editorImg = {
    nutCap: tbBtns3.filter((b) => b.dataset.cap !== undefined).length,
    nutCan: ['l', 'c', 'r'].filter((p) => tbBtns3.filter((b) => b.dataset.imgalign === p).length === 1).length,
    coUI: !!$a('#edFind') && !!$a('#edRepl') && !!$a('#edReplOne') && !!$a('#edReplAll') && !!$a('#edFindStat'),
  };
  edB.innerHTML = '<p>trước</p><p><img src="/api/img/x.webp" alt="anh"></p><p>sau</p>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(200);
  const pickNode = (el) => {
    const rg3 = D.createRange(); rg3.selectNode(el);
    const s3 = W.getSelection(); s3.removeAllRanges(); s3.addRange(rg3);
    D.dispatchEvent(new W.Event('selectionchange'));
  };
  pickNode(edB.querySelector('img'));
  clk('[data-cap]'); await wait(350);
  const capOpen = !!$a('#czCap') && $a('#czCap').classList.contains('on');
  $a('#capTxt').value = 'Bìa chương ba';
  $a('#capTxt').dispatchEvent(new W.Event('input', { bubbles: true }));
  clk('#capOk'); await wait(350);
  const figEl = edB.querySelector('figure.fig');
  out.editorImg.chuThich = {
    moHop: capOpen,
    coFigure: !!figEl,
    coCaption: !!figEl && /Bìa chương ba/.test((figEl.querySelector('figcaption') || {}).textContent || ''),
    anhVanTrong: !!figEl && !!figEl.querySelector('img'),
  };
  pickNode(edB.querySelector('figure.fig img'));
  clk('[data-imgalign="l"]'); await wait(180); const clsL = edB.querySelector('figure.fig').className;
  clk('[data-imgalign="c"]'); await wait(180); const clsC = edB.querySelector('figure.fig').className;
  clk('[data-imgalign="r"]'); await wait(180); const clsR = edB.querySelector('figure.fig').className;
  out.editorImg.can = { l: clsL, c: clsC, r: clsR,
    khongCongDon: clsL === 'fig fig-l' && clsC === 'fig fig-c' && clsR === 'fig fig-r' };
  pickNode(edB.querySelectorAll('p')[0]);
  clk('[data-cap]'); await wait(280);
  out.editorImg.baoKhiKhongAnh = /Bấm vào một ảnh/.test(txtA('#toasts'));

  /* thuộc tính data-ten="Nam" cố tình chứa ĐÚNG chữ cần thay và ĐÚNG hoa thường:
     nếu thay trên innerHTML thì thuộc tính này bị sửa theo, còn đi qua text node
     thì không — đây là chỗ phân biệt hai cách làm. */
  edB.innerHTML = '<p>Hắn nói với Nam. Nam im lặng. tên Nam lần nữa.</p>' +
    '<p data-ten="Nam">không đụng thuộc tính</p><h3>Nam là tiêu đề</h3>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(200);
  $a('#edFind').value = 'Nam';
  $a('#edFind').dispatchEvent(new W.Event('input', { bubbles: true }));
  await wait(450);
  out.editorFind = { dem: txtA('#edFindStat'), dungSo: /4 chỗ khớp/.test(txtA('#edFindStat')) };
  $a('#edRepl').value = 'Minh';
  clk('#edReplOne'); await wait(350);
  out.editorFind.thayMot = /^<p>Hắn nói với Minh\. Nam/.test(edB.innerHTML) && /3 chỗ khớp/.test(txtA('#edFindStat'));
  clk('#edReplAll'); await wait(350);
  out.editorFind.thayHet = {
    hetKhop: /không thấy/.test(txtA('#edFindStat')),
    khongConNam: !/Nam/.test(edB.textContent),
    thuocTinhNguyenVen: /data-ten="Nam"/.test(edB.innerHTML),
    theKhongBiPha: edB.querySelectorAll('p').length === 2 && edB.querySelectorAll('h3').length === 1,
  };
  $a('#edFind').value = 'zzzzkhongco';
  $a('#edFind').dispatchEvent(new W.Event('input', { bubbles: true }));
  await wait(450);
  clk('#edReplAll'); await wait(300);
  out.editorFind.baoKhiKhongThay = /Không thấy/.test(txtA('#toasts'));

  /* figure + figcaption phải sống sót qua edHtml() */
  edB.innerHTML = '<figure class="fig fig-c"><img src="/api/img/x.webp" alt="a">' +
    '<figcaption>Chú thích quan trọng</figcaption></figure><p>hết</p>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(250);
  clk('#chSave'); await wait(450);
  const savedFig = (BOOK.chapters.filter((c) => /Chú thích quan trọng/.test(c.html || ''))[0] || {}).html || '';
  out.editorImg.figSongSot = /<figure class="fig fig-c">/.test(savedFig) &&
    /<figcaption>Chú thích quan trọng<\/figcaption>/.test(savedFig);

  /* ẨN THANH ĐỊNH DẠNG · CHẾ ĐỘ TẬP TRUNG · XUẤT CHƯƠNG.
     Xuất tệp thì soi nội dung đưa cho CZ.download() — không cần tải thật. */
  out.editorView = {
    nut: !!$a('#chFocus') && !!$a('#edToolsToggle') && !!$a('#chExpHtml') && !!$a('#chExpTxt'),
    khongTen: ['#chFocus', '#edToolsToggle', '#chExpHtml', '#chExpTxt']
      .filter((s) => { const e = $a(s); return e && !e.textContent.trim() && !e.title; }).length,
  };
  clk('#edToolsToggle'); await wait(220);
  const tbAn = $a('#edToolbar').classList.contains('hide');
  const tbAria = $a('#edToolsToggle').getAttribute('aria-pressed');
  const tbLs = W.localStorage.getItem('cz_ed_tools');
  clk('#edToolsToggle'); await wait(220);
  out.editorView.thanhDinhDang = {
    anDuoc: tbAn, ariaKhiAn: tbAria, nhoTrongMay: tbLs === '0',
    hienLai: !$a('#edToolbar').classList.contains('hide') && W.localStorage.getItem('cz_ed_tools') === '1',
  };
  clk('#chFocus'); await wait(220);
  const fBat = D.body.classList.contains('ed-focus');
  const fAria = $a('#chFocus').getAttribute('aria-pressed');
  D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(220);
  out.editorView.tapTrung = {
    bat: fBat, ariaOn: fAria,
    escTat: !D.body.classList.contains('ed-focus'), ariaOff: $a('#chFocus').getAttribute('aria-pressed'),
  };
  /* Esc phải NHƯỜNG hộp thoại: đang mở hộp thì Esc đóng hộp, không thoát tập trung */
  clk('#chFocus'); await wait(180);
  W.CZ.modal('czTestEsc', '<div class="mh"><h4>t</h4></div><div class="mb">x</div>' +
    '<div class="mf"><button class="btn pri" data-close>OK</button></div>');
  await wait(220);
  D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(280);
  out.editorView.escNhuongHopThoai = !$a('#czTestEsc').classList.contains('on') && D.body.classList.contains('ed-focus');
  clk('#chFocus'); await wait(180);

  const taiXuat = [];
  const downloadGoc = W.CZ.download;
  W.CZ.download = function (ten, nd, mime) { taiXuat.push({ ten: ten, nd: String(nd), mime: mime }); };
  edB.innerHTML = '<h3>Tiêu đề nhỏ</h3><p>Đoạn <b>đậm</b> và <i>nghiêng</i>.</p>' +
    '<ul><li>mục một</li><li>mục hai</li></ul>' +
    '<pre><code>var x = 1;</code></pre>' +
    '<figure class="fig fig-c"><img src="/api/img/a.webp" alt="anh bia"><figcaption>Chú thích</figcaption></figure>' +
    '<p><a href="https://example.com">link</a></p>';
  edB.dispatchEvent(new W.Event('input', { bubbles: true }));
  $a('#chTitle').value = 'Chương Đặc Biệt 01';
  $a('#chTitle').dispatchEvent(new W.Event('input', { bubbles: true }));
  await wait(280);
  clk('#chExpHtml'); await wait(280);
  clk('#chExpTxt'); await wait(280);
  const fh = taiXuat[0] || {}, ft = taiXuat[1] || {};
  out.editorXuat = {
    html: {
      ten: fh.ten, mime: fh.mime,
      coDoctype: /^<!doctype html>/.test(fh.nd || ''),
      coTieuDe: /<h1>Chương Đặc Biệt 01<\/h1>/.test(fh.nd || ''),
      giuDinhDang: /Đoạn <b>đậm<\/b>/.test(fh.nd || ''),
      tenKhongDau: !!fh.ten && !/[^\x00-\x7F]/.test(fh.ten),
    },
    txt: {
      ten: ft.ten, mime: ft.mime,
      khongConThe: !/<[a-z]/i.test(ft.nd || ''),
      coTieuDe: /Chương Đặc Biệt 01/.test(ft.nd || ''),
      /* <li> phải tách dòng — nếu chỉ lấy textContent của <ul> thì dính liền */
      liTachDong: /• mục một/.test(ft.nd || '') && /• mục hai/.test(ft.nd || ''),
      codeNguyenVen: /var x = 1;/.test(ft.nd || ''),
      chuThichTrongNgoac: /\(Chú thích\)/.test(ft.nd || ''),
    },
  };
  /* chương rỗng thì phải báo, không được tải tệp rỗng */
  taiXuat.length = 0;
  edB.innerHTML = '';
  edB.dispatchEvent(new W.Event('input', { bubbles: true }));
  await wait(280);
  clk('#chExpTxt'); await wait(280);
  out.editorXuat.rong = { khongTai: taiXuat.length === 0, bao: /chưa có nội dung/.test(txtA('#toasts')) };
  W.CZ.download = downloadGoc;

  edB.innerHTML = keepHtml;                             /* trả lại chương thật cho test sau */
  edB.dispatchEvent(new W.Event('input', { bubbles: true })); await wait(200);

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
  /* trình soạn: mọi nút trên thanh phải tồn tại, có tên đọc được, và phát đúng lệnh */
  const etWant = ['link', 'list', 'ol', 'indent', 'outdent', 'unlink', 'removeFormat', 'undo', 'redo', 'alignFull'];
  if (out.editorTools) {
    etWant.forEach((k) => { if (out.editorTools[k] !== 1) rtFail.push('thanh định dạng thiếu nút ' + k); });
    if (!out.editorTools.preview) rtFail.push('thiếu nút xem trước');
    if (!out.editorTools.full) rtFail.push('thiếu nút toàn màn hình');
    if (!out.editorTools.saveState) rtFail.push('thiếu chỗ báo trạng thái lưu');
    if (out.editorTools.nutKhongTen.length) rtFail.push('nút không có tên đọc được: ' + out.editorTools.nutKhongTen.join(' | '));
  }
  const cmdWant = ['insertUnorderedList', 'insertOrderedList', 'outdent', 'indent', 'unlink', 'removeFormat', 'undo', 'redo', 'justifyFull'];
  if (out.editorCmds && JSON.stringify(out.editorCmds) !== JSON.stringify(cmdWant)) {
    rtFail.push('nút định dạng phát sai lệnh: ' + JSON.stringify(out.editorCmds));
  }
  if (out.editorLink && !(out.editorLink.mo && out.editorLink.chanJs && out.editorLink.dongHop && out.editorLink.chenDung)) {
    rtFail.push('chèn liên kết sai: ' + JSON.stringify(out.editorLink));
  }
  if (out.editorSafeLink && (out.editorSafeLink.chan.length || out.editorSafeLink.cho.length)) {
    rtFail.push('lọc URL sai — lẽ ra chặn: ' + JSON.stringify(out.editorSafeLink.chan) +
      ' · lẽ ra cho: ' + JSON.stringify(out.editorSafeLink.cho));
  }
  if (out.editorPreview && !(out.editorPreview.mo && out.editorPreview.noiDung && out.editorPreview.soTu &&
      out.editorPreview.giuLienKet && out.editorPreview.lotOnerror && out.editorPreview.lotScript &&
      out.editorPreview.anhTroWorker && out.editorPreview.dongDuoc)) {
    rtFail.push('xem trước sai: ' + JSON.stringify(out.editorPreview));
  }
  if (out.editorFull && !(out.editorFull.bat && out.editorFull.escTat &&
      out.editorFull.ariaOn === 'true' && out.editorFull.ariaOff === 'false')) {
    rtFail.push('toàn màn hình sai: ' + JSON.stringify(out.editorFull));
  }
  if (out.editorAutoSave && !(out.editorAutoSave.key && out.editorAutoSave.cho && out.editorAutoSave.bao &&
      out.editorAutoSave.dungNoiDung && out.editorAutoSave.xoaKhiLuu)) {
    rtFail.push('tự lưu nháp sai: ' + JSON.stringify(out.editorAutoSave));
  }
  const pw = out.editorPasteWord;
  if (pw && !(pw.chanDanMacDinh && pw.dungLenh && pw.giuChu && pw.sachMsoClass && pw.sachMsoStyle &&
      pw.sachOp && pw.sachAnhFileLocal && pw.sachJsLink && pw.sachScript && pw.sachCommentVml)) {
    rtFail.push('dán từ Word chưa sạch: ' + JSON.stringify(pw));
  }
  const dd = out.editorDragDrop;
  if (dd && !(dd.sangDenKhiKeo && dd.tatDenSauTha && dd.chanMacDinh && dd.tuChoiPdf)) {
    rtFail.push('kéo thả ảnh sai: ' + JSON.stringify(dd));
  }
  const eb = out.editorBlocks;
  if (eb) {
    ['sub', 'sup', 'special', 'code', 'table', 'trow', 'tcol', 'thead'].forEach((k) => {
      if (eb[k] !== 1) rtFail.push('thanh định dạng thiếu nút ' + k);
    });
    if (!eb.callout) rtFail.push('thiếu nút khung cảnh báo');
    if (!eb.tdel) rtFail.push('thiếu nút xoá dòng/cột');
    if (eb.khongTen) rtFail.push('có nút không tên đọc được: ' + eb.khongTen);
    if (!eb.chiSo) rtFail.push('nút chỉ số phát sai lệnh');
    if (!eb.khungLaAside) rtFail.push('khung cảnh báo không dùng <aside> — sẽ mất class khi lưu');
    if (!(eb.kyTu && eb.kyTu.mo && eb.kyTu.soNut > 50 && eb.kyTu.coDau && eb.kyTu.chenDuoc)) {
      rtFail.push('bảng ký tự đặc biệt sai: ' + JSON.stringify(eb.kyTu));
    }
    const bg = eb.bang;
    if (!(bg && bg.truoc === '2x3' && bg.themDong === '3x3' && bg.themCot === '3x4' &&
        bg.dongDau === 'TH' && bg.xoaCot === '3x3' && bg.xoaDong === '2x3' && bg.tuChoiXoaDongCuoi)) {
      rtFail.push('thao tác bảng sai: ' + JSON.stringify(bg));
    }
    if (!eb.asideSongSot) rtFail.push('<aside class="callout"> không sống sót qua edHtml()');
  }
  const ei = out.editorImg;
  if (ei) {
    if (ei.nutCap !== 1) rtFail.push('thiếu nút chú thích ảnh');
    if (ei.nutCan !== 3) rtFail.push('thiếu nút căn ảnh trái/giữa/phải');
    if (!ei.coUI) rtFail.push('thiếu ô tìm & thay trong chương');
    if (!(ei.chuThich && ei.chuThich.moHop && ei.chuThich.coFigure && ei.chuThich.coCaption && ei.chuThich.anhVanTrong)) {
      rtFail.push('chú thích ảnh sai: ' + JSON.stringify(ei.chuThich));
    }
    if (!(ei.can && ei.can.khongCongDon)) rtFail.push('căn ảnh sai: ' + JSON.stringify(ei.can));
    if (!ei.baoKhiKhongAnh) rtFail.push('bấm chú thích khi không có ảnh mà không báo gì');
    if (!ei.figSongSot) rtFail.push('<figure>/<figcaption> không sống sót qua edHtml()');
  }
  const ef = out.editorFind;
  if (ef) {
    if (!ef.dungSo) rtFail.push('đếm sai số chỗ khớp: ' + ef.dem);
    if (!ef.thayMot) rtFail.push('thay một chỗ sai');
    if (!(ef.thayHet && ef.thayHet.hetKhop && ef.thayHet.khongConNam &&
        ef.thayHet.thuocTinhNguyenVen && ef.thayHet.theKhongBiPha)) {
      rtFail.push('thay hết sai (có phá HTML?): ' + JSON.stringify(ef.thayHet));
    }
    if (!ef.baoKhiKhongThay) rtFail.push('thay chữ không tồn tại mà không báo gì');
  }
  const ev2 = out.editorView;
  if (ev2) {
    if (!ev2.nut) rtFail.push('thiếu nút tập trung / ẩn thanh định dạng / xuất chương');
    if (ev2.khongTen) rtFail.push('có nút không tên đọc được: ' + ev2.khongTen);
    const tbd = ev2.thanhDinhDang;
    if (!(tbd && tbd.anDuoc && tbd.ariaKhiAn === 'false' && tbd.nhoTrongMay && tbd.hienLai)) {
      rtFail.push('ẩn/hiện thanh định dạng sai: ' + JSON.stringify(tbd));
    }
    const tt = ev2.tapTrung;
    if (!(tt && tt.bat && tt.ariaOn === 'true' && tt.escTat && tt.ariaOff === 'false')) {
      rtFail.push('chế độ tập trung sai: ' + JSON.stringify(tt));
    }
    if (!ev2.escNhuongHopThoai) rtFail.push('Esc không nhường hộp thoại (vừa đóng hộp vừa thoát tập trung)');
  }
  const ex = out.editorXuat;
  if (ex) {
    const hx = ex.html;
    if (!(hx && hx.coDoctype && hx.coTieuDe && hx.giuDinhDang && hx.tenKhongDau && /\.html$/.test(hx.ten || ''))) {
      rtFail.push('xuất .html sai: ' + JSON.stringify(hx));
    }
    const tx = ex.txt;
    if (!(tx && tx.khongConThe && tx.coTieuDe && tx.liTachDong && tx.codeNguyenVen && tx.chuThichTrongNgoac && /\.txt$/.test(tx.ten || ''))) {
      rtFail.push('xuất .txt sai: ' + JSON.stringify(tx));
    }
    if (!(ex.rong && ex.rong.khongTai && ex.rong.bao)) rtFail.push('xuất chương rỗng mà không báo: ' + JSON.stringify(ex.rong));
  }
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
