/* ============================================================================
   Kiểm thử 1.19.0 — BỘ CÔNG CỤ ĐỌC: Zen · Bionic · Terminal
   ----------------------------------------------------------------------------
   1. ZEN: ẩn đầu trang/chân trang/mục lục/nút phụ, nhớ trong localStorage,
      tắt được bằng nút hoặc phím Z.
   2. BIONIC: in đậm đầu từ nhưng KHÔNG đổi một ký tự nào của chương (đây là
      ràng buộc quan trọng nhất — dựng lại đúng chữ tiếng Việt có dấu), bỏ qua
      <pre>/<code>/tiêu đề, tắt thì trả chữ về nguyên trạng.
   3. TERMINAL: đổi sang khung giả terminal (nền tối, chữ mono), có dòng lệnh
      mô phỏng theo slug/chương, thoại nhân vật thành output, KHÔNG có ô nhập
      lệnh, không có hiệu ứng gõ từng ký tự, thoát được bằng nút.
   Chạy:  node tests/t_readtools.js
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, dataFetch, read, ROOT } = require('./mk');

const BASE = 'https://cms.test';
const wait = ms => new Promise(r => setTimeout(r, ms));
const J = (b, ok, st) => Promise.resolve({
  ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b))
});
function makeApi(log) {
  const REG = JSON.parse(read('data/registry.json'));
  return (p, opt) => {
    opt = opt || {};
    if (log) log.push((opt.method || 'GET') + ' ' + p);
    if (p === '/api/registry') return J(REG);
    const mb = p.match(/^\/api\/book\/([^/?]+)/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
    }
    if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    if (p === '/api/schedule') return J({ items: [] });
    if (p === '/api/view' && opt.method === 'POST') return J({ ok: true, counted: false });
    return undefined;
  };
}
const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const key = (w, k, opt) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opt || {})));

(async () => {
  const out = { errors0: [] };
  const err = m => out.errors0.push(m);

  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-1/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] })
  });
  const { win, doc } = p;
  const $ = s => doc.querySelector(s);
  const $$ = s => [...doc.querySelectorAll(s)];
  await wait(1800);

  /* =====================================================================
     UI regression: retired quick-hide controls/shortcut/state stay absent.
     ===================================================================== */
  const removedEntryPoints = {
    button: !$('#czPanic'),
    layer: !$('#czPanicLayer'),
    state: !Object.prototype.hasOwnProperty.call(win.CZ, 'panic')
      && !Object.prototype.hasOwnProperty.call(win.CZ, 'panicOn')
      && !Object.prototype.hasOwnProperty.call(win.CZ, 'panicOff')
      && !Object.prototype.hasOwnProperty.call(win.CZ, 'panicToggle'),
    bodyClass: !doc.body.classList.contains('panic-on')
  };
  out.removedEntryPoints = removedEntryPoints;
  if (Object.values(removedEntryPoints).some(value => !value)) err('giao diện hoặc state ẩn trang vẫn còn được đăng ký');
  const titleBeforeShortcut = doc.title;
  const pathBeforeShortcut = win.location.pathname;
  key(win, 'H', { ctrlKey: true, shiftKey: true });
  await wait(30);
  out.shortcutRemoved = doc.title === titleBeforeShortcut
    && win.location.pathname === pathBeforeShortcut
    && !doc.body.classList.contains('panic-on')
    && !$('#czPanicLayer');
  if (!out.shortcutRemoved) err('Ctrl+Shift+H vẫn kích hoạt hành vi ẩn trang');

  /* =====================================================================
     1. ZEN
     ===================================================================== */
  const zenBtn = $('#rdZen');
  if (!zenBtn) err('thanh đọc thiếu nút Zen');
  click(win, zenBtn);
  await wait(60);
  out.zen = {
    trenBody: doc.body.classList.contains('rd-zen'),
    luuMay: win.CZ.rdGet().zen,
    ariaPressed: zenBtn.getAttribute('aria-pressed')
  };
  if (!out.zen.trenBody) err('bật Zen phải gắn lớp rd-zen lên <body> (CSS mới ẩn được phần thừa)');
  if (String(out.zen.luuMay) !== '1') err('Zen phải được nhớ trong localStorage (ssochuz-reader)');
  let stored = {};
  try { stored = JSON.parse(win.localStorage.getItem('ssochuz-reader') || '{}'); } catch (e) {}
  out.zen.luuThat = stored.zen;
  if (String(stored.zen) !== '1') err('khoá ssochuz-reader thiếu zen=1');
  /* CSS phải ẩn thật: kiểm luật đã có trong tệp CSS phát hành */
  const css = fs.readFileSync(path.join(ROOT, 'cz.css'), 'utf8');
  out.zen.cssAn = /body\.rd-zen[^{]*\.rnav[^{]*\{[^}]*display:\s*none/.test(css);
  if (!out.zen.cssAn) err('CSS chưa ẩn điều hướng không thiết yếu khi bật Zen');
  click(win, zenBtn);
  await wait(40);
  if (doc.body.classList.contains('rd-zen')) err('bấm lại nút Zen phải tắt được');
  /* phím tắt Z */
  key(win, 'z'); await wait(40);
  out.zen.phimZ = doc.body.classList.contains('rd-zen');
  if (!out.zen.phimZ) err('phím Z phải bật được chế độ Zen');
  key(win, 'z'); await wait(40);

  /* =====================================================================
     2. BIONIC
     ===================================================================== */
  const txtEl = $('#rdText');
  const textTruoc = txtEl.textContent;
  /* thêm một đoạn tiếng Việt ở dạng NFD + một <pre> để thử đúng hai bẫy */
  const nfd = 'Vất vả vì vậy vẫn vững vàng ở Đắk Lắk'.normalize('NFD');
  txtEl.insertAdjacentHTML('beforeend', '<p id="bioTest">' + nfd + '</p><pre id="bioPre">code_block_giu_nguyen</pre>');
  const textCoThem = txtEl.textContent;
  win.CZ.rdSet({ bionic: 1 });
  await wait(30);
  win.eval("(function(){var e=document.getElementById('rdText');if(window.CZ&&CZ.rdGet)CZ.__b=1;})()");
  /* bật qua đúng bộ cài đặt của trang đọc (applyRD mới chạy phần bọc chữ) */
  click(win, $('#rdSet'));
  await wait(80);
  const bioOn = $('#setBody [data-set="bionic"][data-v="1"]');
  if (!bioOn) err('Cài đặt đọc thiếu công tắc Bionic');
  click(win, bioOn);
  await wait(80);
  out.bionic = {
    bat: win.CZ.rdGet().bionic,
    soTuDam: $$('#rdText .bio').length,
    chuKhongDoi: txtEl.textContent === textCoThem,
    nfdKhongVo: (($('#bioTest') || {}).textContent || '') === nfd,
    preKhongBiDam: $$('#bioPre .bio').length === 0,
    tieuDeKhongBiDam: $$('#rdText h2 .bio, #rdText h3 .bio').length === 0
  };
  if (String(out.bionic.bat) !== '1') err('không bật được Bionic');
  if (!out.bionic.soTuDam) err('Bionic phải bọc các đầu từ bằng <b>');
  if (!out.bionic.chuKhongDoi) err('Bionic KHÔNG được đổi chữ trong chương (chỉ đổi cách hiển thị)');
  if (!out.bionic.nfdKhongVo) err('Bionic làm hỏng chữ tiếng Việt ở dạng NFD (dấu bị tách khỏi nguyên âm)');
  if (!out.bionic.preKhongBiDam) err('Bionic không được áp vào khối code (<pre>)');
  const bioOff = $('#setBody [data-set="bionic"][data-v="0"]');
  click(win, bioOff);
  await wait(60);
  out.bionic.sauKhiTat = { conBold: $$('#rdText .bio').length, chuNguyen: txtEl.textContent === textCoThem };
  if (out.bionic.sauKhiTat.conBold !== 0) err('tắt Bionic phải gỡ hết thẻ <b class="bio"> đã bọc');
  if (!out.bionic.sauKhiTat.chuNguyen) err('tắt Bionic phải trả lại đúng chữ ban đầu');

  /* =====================================================================
     3. TERMINAL
     ===================================================================== */
  const termBtn = $('#rdTerm');
  if (!termBtn) err('thanh đọc thiếu nút Terminal');
  /* thêm một câu thoại + một dòng lời dẫn để kiểm đúng hai kiểu phân loại —
     phải thêm TRƯỚC khi bật Terminal, vì việc tô thoại chạy trong lúc vẽ. */
  $('#rdText').insertAdjacentHTML('beforeend',
    '<p id="ttSay">“Tôi không sao đâu, đi tiếp đi.”</p><p id="ttNarr">Cô im lặng hồi lâu rồi bước tiếp.</p>');
  click(win, termBtn);
  await wait(80);
  const top = $('#rdTermTop'), end = $('#rdTermEnd');
  out.terminal = {
    trenBody: doc.body.classList.contains('rd-term'),
    dauKhung: !!(top && !top.hidden),
    dongLenh: (top && top.textContent || '').includes('curl -s https://ssochuz.pages.dev/truyen/third-person/chuong-1'),
    dongKet: (end && !end.hidden && /process exited with code 0/.test(end.textContent)),
    lopChu: $('#rdText').classList.contains('term'),
    coODep: $$('#rdTermTop input, #rdText input, #rdText textarea').length,
    soThoai: $$('#rdText .t-out').length,
    thoaiNhanRa: $('#ttSay') ? $('#ttSay').classList.contains('t-out') : null,
    loiDanKhongPhaiThoai: $('#ttNarr') ? !$('#ttNarr').classList.contains('t-out') : null,
    luuMay: win.CZ.rdGet().term
  };
  if (!out.terminal.trenBody) err('bật Terminal phải gắn lớp rd-term lên <body>');
  if (!out.terminal.dauKhung) err('Terminal phải hiện đầu khung giả');
  if (!out.terminal.dongLenh) err('tiêu đề chương phải thành lệnh giả dạng curl theo slug + số chương');
  if (!out.terminal.dongKet) err('Terminal phải có dòng kết thúc chương');
  if (!out.terminal.lopChu) err('#rdText phải mang lớp .term');
  if (out.terminal.coODep !== 0) err('khung terminal KHÔNG được có ô nhập lệnh (không phải terminal thật)');
  if (!out.terminal.soThoai) err('câu thoại phải được đánh dấu thành output (.t-out)');
  if (out.terminal.thoaiNhanRa !== true) err('dòng mở đầu bằng dấu ngoặc kép phải thành thoại (.t-out)');
  if (out.terminal.loiDanKhongPhaiThoai !== true) err('lời dẫn thường không được tô như thoại');
  if (String(out.terminal.luuMay) !== '1') err('Terminal phải được nhớ trong localStorage');
  /* CSS: nền tối + chữ mono + dòng kết đúng mẫu; và KHÔNG có ô nhập lệnh nào trong mã */
  out.terminal.css = {
    nenToi: /body\.rd-term\s*\{[^}]*--rd-bg:\s*#0/.test(css),
    mono: /body\.rd-term \.rtext\s*\{[^}]*font-family:\s*var\(--font-mono\)/.test(css),
    dongKetTrongDOM: /process exited with code 0/.test($('#rdTermEnd') ? ($('#rdTermEnd').textContent || '') : '')
  };
  if (!out.terminal.css.nenToi || !out.terminal.css.mono) err('CSS Terminal phải là nền tối + chữ monospace');
  if (!out.terminal.css.dongKetTrongDOM) err('dòng kết “process exited…” phải nằm trong DOM (không giấu trong CSS)');
  const react = read('src/cz-react.js') + read('src/cz-story.js') + read('src/cz-brick.js') + read('src/cz-dice.js');
  out.terminal.khongThucThi = !/child_process|execSync|spawnSync|require\s*\(\s*['"](child_process|fs|os)['"]/.test(react)
    && !/eval\s*\(/.test(react) && !/new Function\s*\(/.test(react);
  if (!out.terminal.khongThucThi) err('khung terminal chỉ là giao diện — mã mới không được thực thi lệnh gì');
  const offBtn2 = $('#rdTermOff');
  if (!offBtn2) err('Terminal thiếu nút thoát rõ ràng');
  else { click(win, offBtn2); await wait(60); }
  out.terminal.sauKhiThoat = { trenBody: doc.body.classList.contains('rd-term'), luuMay: win.CZ.rdGet().term };
  if (out.terminal.sauKhiThoat.trenBody) err('bấm “Thoát terminal” phải trả về giao diện đọc thường');

  /* =====================================================================
     4. nút vòng quay trên thanh đọc (#rdDice) — thêm ở 1.19.0
     ===================================================================== */
  const diceBtn = $('#rdDice');
  out.nutVongQuay = { co: !!diceBtn, coIcon: !!(diceBtn && diceBtn.querySelector('svg')), nhan: diceBtn ? (diceBtn.getAttribute('aria-label') || '') : '' };
  if (!diceBtn) err('thanh đọc thiếu nút “Hôm nay đọc gì?”');
  else {
    click(win, diceBtn);
    await wait(80);
    out.nutVongQuay.moBang = !!$('#czDiceBox');
    if (!out.nutVongQuay.moBang) err('bấm nút vòng quay trên thanh đọc phải mở được bảng');
    const dc = $('#czDiceBox');
    if (dc && dc.querySelector('[data-close]')) { click(win, dc.querySelector('[data-close]')); await wait(200); }
  }

  /* =====================================================================
     5. Không phá trang khác: các trang không có #rdReact/#czDiceHost vẫn chạy
     ===================================================================== */
  const home = page('index.html', { url: 'https://ssochuz.pages.dev/', fetch: dataFetch({ apiBase: BASE, api: makeApi([]), log: [] }) });
  await wait(1200);
  const homeTitle = home.doc.title, homePath = home.win.location.pathname;
  key(home.win, 'Escape'); await wait(30); key(home.win, 'Escape'); await wait(30);
  key(home.win, 'H', { ctrlKey: true, shiftKey: true }); await wait(30);
  out.trangChu = {
    khongCoNut: !home.doc.querySelector('#czPanic'),
    khongCoLayer: !home.doc.querySelector('#czPanicLayer'),
    khongCoState: !Object.prototype.hasOwnProperty.call(home.win.CZ, 'panic'),
    phimTatKhongCheTrang: home.doc.title === homeTitle && home.win.location.pathname === homePath
      && !home.doc.body.classList.contains('panic-on'),
    loi: home.errors.slice(0, 2)
  };
  if (!out.trangChu.khongCoNut || !out.trangChu.khongCoLayer || !out.trangChu.khongCoState || !out.trangChu.phimTatKhongCheTrang) err('trang chủ còn entry point/state/phím tắt ẩn trang');
  if (home.errors.length) err('trang chủ phát sinh lỗi JS: ' + home.errors[0]);

  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
