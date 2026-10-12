/* ============================================================================
   Kiểm thử 1.19.0 — REACTION STICKER CUỐI CHƯƠNG
   ----------------------------------------------------------------------------
   Yêu cầu của chủ trang, kiểm bằng máy:
     1. cuối mỗi chương có ĐÚNG 6 sticker, mỗi cái là <button> thật, có
        aria-label + ảnh WebP thật (không phải emoji Unicode làm asset chính)
        và có emoji dự phòng khi ảnh lỗi;
     2. bấm một sticker: số nhảy ngay, nút chuyển sang trạng thái đã thả, có
        hiệu ứng sticker bay (lớp .czfx) và toast “Đã thả …”;
     3. bấm lại để BỎ: số giảm, trạng thái trở lại bình thường;
     4. mỗi máy chỉ tính 1 lượt/loại/chương: đổi chương thì phiếu riêng, và
        dữ liệu nằm trong localStorage (khoá ssochuz-react-*) — ghi rõ chỗ cần
        thay bằng máy chủ;
     5. chống spam: bấm liên tiếp trong lúc cooldown không cộng thêm;
     6. nút “Xem tất cả reaction” mở bảng đầy đủ;
     7. tắt ở Cài đặt đọc thì hàng sticker biến mất, mở lại thì hiện lại;
     8. máy bật “giảm chuyển động” thì KHÔNG dựng hạt bay (vẫn đổi số).
   Chạy:  node tests/t_react.js
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
    log.push((opt.method || 'GET') + ' ' + p);
    if (p === '/api/registry') return J(REG);
    const mb = p.match(/^\/api\/book\/([^/?]+)/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
    }
    if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    if (p === '/api/schedule') return J({ items: [] });
    if (p === '/api/health') return J({ ok: true, version: '1.19.0' });
    if (p === '/api/view' && opt.method === 'POST') return J({ ok: true, counted: false });
    return undefined;
  };
}

(async () => {
  const out = { errors0: [] };
  const err = m => out.errors0.push(m);

  /* =====================================================================
     1 + 2 + 3 + 5 + 6: trang đọc, chương 1
     ===================================================================== */
  const log = [];
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-1/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(log), log })
  });
  const { win, doc } = p;
  const $ = s => doc.querySelector(s);
  const $$ = s => [...doc.querySelectorAll(s)];
  await wait(1800);

  const bar = $('#rdReact');
  if (!bar) { err('không thấy khối #rdReact ở cuối chương'); console.log(JSON.stringify(out, null, 1)); process.exit(1); }
  if (bar.hidden) err('#rdReact phải hiện khi đang đọc chương');

  const stickers = $$('#rdReact .rx');
  out.soSticker = stickers.length;
  if (stickers.length !== 6) err('phải có đúng 6 reaction sticker, đang có ' + stickers.length);

  /* vị trí: dưới nội dung chương, trên thanh chuyển chương */
  const order = ['rdText', 'rdReact', 'rdNav'].map(id => doc.getElementById(id));
  if (!(order[0] && order[1] && order[2])) err('thiếu một trong #rdText / #rdReact / #rdNav');
  else if (!(order[0].compareDocumentPosition(order[1]) & win.Node.DOCUMENT_POSITION_FOLLOWING)) {
    err('hàng reaction phải nằm SAU nội dung chương');
  } else if (!(order[1].compareDocumentPosition(order[2]) & win.Node.DOCUMENT_POSITION_FOLLOWING)) {
    err('hàng reaction phải nằm TRƯỚC thanh chuyển chương');
  }

  const first = stickers[0];
  const rxId = first.getAttribute('data-rx');
  out.stickerDau = {
    id: rxId,
    laButton: first.tagName === 'BUTTON',
    aria: first.getAttribute('aria-label'),
    coAnhThat: !!first.querySelector('img.rx-img') && /\.webp$/.test((first.querySelector('img.rx-img') || {}).getAttribute
      ? first.querySelector('img.rx-img').getAttribute('src') : ''),
    emojiDuPhong: (first.querySelector('.rx-emo') || {}).textContent || '',
    soDem: (first.querySelector('.rx-ct') || {}).textContent || ''
  };
  if (!out.stickerDau.laButton) err('sticker phải là <button> thật (bàn phím/tab phải tới được)');
  if (!out.stickerDau.aria || out.stickerDau.aria.length < 4) err('sticker thiếu aria-label rõ ràng');
  if (!out.stickerDau.coAnhThat) err('sticker phải dùng ảnh WebP thật, không lấy emoji Unicode làm asset chính');
  if (!out.stickerDau.emojiDuPhong) err('sticker thiếu emoji dự phòng (fallback_emoji)');
  if (!/^\d/.test(out.stickerDau.soDem.replace(/\./g, ''))) err('sticker phải hiện số đếm');

  /* ảnh sticker có thật trên đĩa không (không thì phải sửa asset path) */
  const src = first.querySelector('img.rx-img') && first.querySelector('img.rx-img').getAttribute('src');
  if (src && !fs.existsSync(path.join(ROOT, src.replace(/^\//, '')))) err('không thấy tệp sticker ' + src);

  /* --- bấm sticker đầu: số tăng, trạng thái đã thả, có hạt bay + toast ----- */
  const before = parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10);
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  /* ĐO NGAY: jsdom không có Web Animations nên hạt tự dọn sau ~60ms, còn trình
     duyệt thật thì hạt bay ~1 giây. Đo sau khi chờ là đo nhầm lúc đã dọn. */
  const hatNgay = $$('#czFx .czfx-p').length;
  await wait(40);
  const after = parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10);
  out.sauKhiBam = {
    truoc: before, sau: after,
    daTha: first.classList.contains('on'),
    ariaPressed: first.getAttribute('aria-pressed'),
    coHieuUngBay: hatNgay > 0,
    soHat: hatNgay,
    coToast: /Đã thả|Áo vào quần|Ngọt lịm|Đã ném gạch|Chấm khăn|Cày như trâu|Đã xin chương/.test(doc.body.textContent),
    tick: !!first.querySelector('.rx-tick')
  };
  if (after !== before + 1) err('bấm sticker phải cộng ngay 1 lượt (' + before + ' → ' + after + ')');
  if (!first.classList.contains('on')) err('sau khi bấm, sticker phải ở trạng thái đã thả');
  if (first.getAttribute('aria-pressed') !== 'true') err('aria-pressed phải là true sau khi thả');
  if (!out.sauKhiBam.coHieuUngBay) err('bấm sticker phải sinh sticker bay (lớp .czfx)');
  if (out.sauKhiBam.soHat > 20) err('mỗi lần bấm chỉ được sinh tối đa ~12 sticker bay (đang ' + out.sauKhiBam.soHat + ')');
  if (!out.sauKhiBam.coToast) err('lần đầu thả phải có toast xác nhận');

  /* --- cooldown: bấm lại ngay lập tức thì số KHÔNG đổi --------------------- */
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(30);
  const cool = parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10);
  out.chongSpam = { sau: cool, giuNguyen: cool === after };
  if (cool !== after) err('bấm liên tiếp trong lúc cooldown không được cộng thêm lượt');

  /* --- đợi hết cooldown rồi bấm lại để BỎ --------------------------------- */
  await wait(520);
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(40);
  out.sauKhiBo = {
    so: parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10),
    daTha: first.classList.contains('on')
  };
  if (out.sauKhiBo.daTha !== false) err('bấm lại phải BỎ được lượt đã thả');
  if (out.sauKhiBo.so !== before) err('bỏ lượt phải trả số về như trước (' + before + '), đang ' + out.sauKhiBo.so);

  /* --- localStorage: khoá theo slug + CHỦ SỞ HỮU (máy hoặc tài khoản) ----- */
  const mineKey = 'ssochuz-react-me-third-person__d' + win.CZ.vid();
  let mine = {};
  try { mine = JSON.parse(win.localStorage.getItem(mineKey) || '{}'); } catch (e) {}
  out.luuMay = { coKhoa: !!win.localStorage.getItem(mineKey), chuong1: (mine['1'] || []).length };
  if (mine['1'] && mine['1'].length) err('sau khi bỏ lượt, localStorage không được còn ghi nhận đã thả');
  /* thả lại để kiểm phần lưu */
  await wait(520);
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(30);
  mine = JSON.parse(win.localStorage.getItem(mineKey) || '{}');
  out.luuMay.sauKhiThaLai = (mine['1'] || []).slice();
  if (!(mine['1'] || []).includes(rxId)) err('lượt đã thả phải được ghi vào localStorage (chỗ cần thay bằng API)');

  /* đồng hồ đếm số nằm trong dữ liệu model, không cộng dồn mỗi lần vẽ lại */
  const model = win.CZReact.counts('third-person', 1);
  out.modelDem = model[rxId];
  if (model[rxId] !== after) err('CZReact.counts phải khớp số đang hiện trên nút');

  /* --- đã đăng nhập: phiếu “đã thả” theo TÀI KHOẢN, không lẫn với phiếu máy - */
  const realAuth = win.CZ_AUTH;
  win.CZ_AUTH = { user: function () { return { uid: 'u-kiem-thu' }; } };
  win.CZReact.toggle('third-person', 7, 'ngot-lim');
  const userKey = 'ssochuz-react-me-third-person__uu-kiem-thu';
  let userStore = {}, deviceStore = {};
  try { userStore = JSON.parse(win.localStorage.getItem(userKey) || '{}'); } catch (e) {}
  try { deviceStore = JSON.parse(win.localStorage.getItem(mineKey) || '{}'); } catch (e) {}
  out.theoTaiKhoan = {
    coKhoa: !!win.localStorage.getItem(userKey),
    chuong7: (userStore['7'] || []).slice(),
    mayKhongLan: !(deviceStore['7'] || []).length,
    docLaiDungNguoi: win.CZReact.mine('third-person', 7).indexOf('ngot-lim') >= 0
  };
  if (!out.theoTaiKhoan.coKhoa) err('đã đăng nhập thì phiếu “đã thả” phải nằm ở khoá theo tài khoản');
  if (out.theoTaiKhoan.chuong7.indexOf('ngot-lim') < 0) err('phiếu theo tài khoản phải ghi đúng lượt vừa thả');
  if (!out.theoTaiKhoan.mayKhongLan) err('phiếu của tài khoản không được lẫn vào phiếu của máy');
  if (!out.theoTaiKhoan.docLaiDungNguoi) err('khi đã đăng nhập, đọc lại phiếu phải thấy lượt của tài khoản');
  win.CZ_AUTH = realAuth;

  /* --- nút “Xem tất cả reaction” → bảng đầy đủ ---------------------------- */
  const all = $('#rxAll');
  if (!all) err('thiếu nút “Xem tất cả reaction”');
  else {
    all.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(80);
    const pop = $('#czReactBox');
    out.bangDayDu = { mo: !!(pop && pop.classList.contains('on')), soDong: pop ? pop.querySelectorAll('.pop-rx').length : 0 };
    if (!out.bangDayDu.mo) err('bấm “Xem tất cả reaction” phải mở bảng đầy đủ');
    if (out.bangDayDu.soDong !== 6) err('bảng đầy đủ phải có đủ 6 reaction');
    const row = pop && pop.querySelector('.pop-rx');
    if (row) {
      row.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      await wait(40);
      out.bangDayDu.bamTrongBang = row.classList.contains('on');
      if (!row.classList.contains('on')) err('bấm một dòng trong bảng phải thả được reaction đó');
    }
    const close = pop && pop.querySelector('[data-close]');
    if (close) close.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(200);
  }

  /* =====================================================================
     4. đổi chương: phiếu riêng cho từng chương
     ===================================================================== */
  const beforeCh1 = parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10);
  win.eval("document.getElementById('rdNext') && document.getElementById('rdNext').click()");
  await wait(1400);
  const bar2 = $('#rdReact');
  const st2 = bar2 && bar2.querySelector('.rx[data-rx="' + rxId + '"]');
  out.chuongKhac = {
    chuong: (mine['1'] || []).length > 0,
    khacTrangThai: st2 ? !st2.classList.contains('on') : null,
    cauHinhCtx: bar2 && bar2.__rxCtx ? bar2.__rxCtx.ch : null
  };
  if (!bar2 || !bar2.__rxCtx || bar2.__rxCtx.ch !== 2) err('sang chương 2 phải dựng lại hàng reaction cho chương 2');
  if (st2 && st2.classList.contains('on')) err('phiếu thích phải theo TỪNG chương, chương 2 chưa được thả');

  /* =====================================================================
     7. tắt/mở trong Cài đặt đọc
     ===================================================================== */
  const setBtn = $('#rdSet');
  if (setBtn) setBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(80);
  const offBtn = $('#setBody [data-set="react"][data-v="0"]');
  if (!offBtn) err('Cài đặt đọc thiếu công tắc tắt reaction sticker');
  else {
    /* <button> do paintSettings chọn theo dataset, phải bấm đúng nút Tắt */
    offBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
  await wait(60);
  const txt = doc.body.textContent;
  out.tatTrongCaiDat = {
    an: $('#rdReact').hidden,
    khongConNut: $$('#rdReact .rx').length === 0
  };
  if (!out.tatTrongCaiDat.an || !out.tatTrongCaiDat.khongConNut) err('tắt reaction trong cài đặt đọc phải ẩn hẳn hàng sticker');
  const onBtn = $('#setBody [data-set="react"][data-v="1"]') || $('#setBody [data-set="react"]');
  if (onBtn) onBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  else win.CZ.rdSet({ react: 1 });
  await wait(90);
  out.moLai = { hien: !$('#rdReact').hidden, soNut: $$('#rdReact .rx').length };
  if (out.moLai.hien !== true || out.moLai.soNut !== 6) err('mở lại reaction phải dựng lại đủ 6 sticker');

  /* =====================================================================
     8. prefers-reduced-motion: không dựng hạt bay
     ===================================================================== */
  const pm = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-1/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi([]), log: [] }),
    setup(w) {
      w.matchMedia = q => ({ matches: /reduced-motion/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    }
  });
  await wait(1600);
  const rm = pm.doc.querySelector('#rdReact .rx');
  const rmBefore = rm ? parseInt(rm.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10) : -1;
  if (rm) rm.dispatchEvent(new pm.win.MouseEvent('click', { bubbles: true }));
  await wait(80);
  out.giamChuyenDong = {
    reduce: pm.win.CZ.reduce,
    hatBay: pm.doc.querySelectorAll('#czFx .czfx-p').length,
    soSau: rm ? parseInt(rm.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10) : -1
  };
  if (!out.giamChuyenDong.reduce) err('bài kiểm chưa giả lập được prefers-reduced-motion');
  if (out.giamChuyenDong.hatBay !== 0) err('máy bật giảm chuyển động không được dựng hạt sticker bay');
  if (rm && out.giamChuyenDong.soSau !== rmBefore + 1) err('giảm chuyển động vẫn phải cộng số khi bấm');

  /* =====================================================================
     9. trang chi tiết truyện cũng có hàng reaction
     ===================================================================== */
  const sp = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi([]), log: [] })
  });
  await wait(1600);
  const sbar = sp.doc.querySelector('#storyReact');
  out.trangTruyen = {
    coKhoi: !!sbar,
    hien: !!(sbar && !sbar.hidden),
    chuong: sbar && sbar.__rxCtx ? sbar.__rxCtx.ch : null,
    soNut: sbar ? sbar.querySelectorAll('.rx').length : 0
  };
  if (!sbar || sbar.hidden || out.trangTruyen.soNut !== 6) err('trang chi tiết truyện phải có hàng reaction (6 sticker)');
  out.trangTruyen.chuongTheoTienDo = out.trangTruyen.chuong;
  if (!out.trangTruyen.chuong) err('hàng reaction ở trang truyện phải gắn với một chương cụ thể');

  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
