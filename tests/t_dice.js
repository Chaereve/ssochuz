/* ============================================================================
   Kiểm thử 1.19.0 — VÒNG QUAY “HÔM NAY ĐỌC GÌ?”
   ----------------------------------------------------------------------------
     1. nút có mặt ở thanh đầu trang chủ và ở trang chi tiết truyện;
     2. mở ra là có vòng quay + nút Quay + bộ lọc tình trạng/18+/thể loại;
     3. nguồn truyện theo thứ tự ưu tiên: đang theo dõi → mới cập nhật → cả kho,
        KHÔNG bịa truyện nào ngoài dữ liệu (mọi kết quả đều có trong registry);
     4. máy chưa xác nhận 18+ thì không bao giờ quay trúng truyện 18+;
     5. quay ~2,6 giây mới ra kết quả; kết quả có bìa + tên + chương mới nhất /
        chương đang đọc, kèm nút “Đọc ngay” trỏ đúng chương;
     6. “Quay lại” không trả về đúng bộ vừa quay khi còn lựa chọn khác;
     7. truyện vừa đọc trong 14 ngày bị loại khỏi vòng khi vẫn còn đủ lựa chọn;
     8. máy bật “giảm chuyển động” thì ra kết quả ngay (không quay 2,6 giây);
     9. không tự phát tiếng khi mới mở; bấm Quay mới có tiếng.
   Chạy:  node tests/t_dice.js
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
    if (p === '/api/toc') return J({ ok: true, chapters: [{ t: 'Chương 1' }, { t: 'Chương 2' }] });
    return undefined;
  };
}
const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const REG = JSON.parse(read('data/registry.json'));
const slugOf = t => { const m = REG.lib.filter(n => n.title === t)[0]; return m && m.slug; };

(async () => {
  const out = { errors0: [] };
  const err = m => out.errors0.push(m);

  /* =====================================================================
     1 + 2 + 3: trang chủ, máy có theo dõi 1 truyện đang ra chương
     ===================================================================== */
  /* Truyện ĐANG THEO DÕI để thử thứ tự ưu tiên. Chọn một bộ KHÔNG 18+ vì máy
     này chưa xác nhận 18+ — bộ 18+ sẽ bị lọc trước cả khi xét thứ tự ưu tiên. */
  const FOLLOW = 'third-person';
  const p = page('index.html', {
    url: 'https://ssochuz.pages.dev/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] }),
    setup(w) {
      w.localStorage.setItem('ssochuz-follow', JSON.stringify({ [FOLLOW]: 1 }));
      w.localStorage.setItem('ssochuz-prog-' + FOLLOW, '3');
    }
  });
  const { win, doc } = p;
  const $ = s => doc.querySelector(s);
  await wait(1500);

  const host = $('[data-dice]');
  const btn = host && host.querySelector('button');
  out.nut = { coHost: !!host, coNut: !!btn, nhan: btn ? btn.textContent.trim() : '' };
  if (!btn) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }
  if (!/Hôm nay đọc gì\?/.test(out.nut.nhan)) err('nút vòng quay phải có nhãn “Hôm nay đọc gì?”');

  const sfxLog = [];
  const realSfx = win.CZ.sfx;
  win.CZ.sfx = function (id) { sfxLog.push(id); };

  click(win, btn);
  await wait(80);
  const box = $('#czDiceBox');
  out.modal = {
    mo: !!box,
    coVongQuay: !!(box && box.querySelector('.dc-wheel')),
    coNutQuay: !!(box && box.querySelector('#dcSpin')),
    soLat: box ? box.querySelectorAll('.dc-slot').length : 0,
    chipTinhTrang: box ? box.querySelectorAll('[data-opt="run"],[data-opt="done"]').length : 0,
    chip18: !!(box && box.querySelector('[data-opt="adult"]')),
    live: (box && box.querySelector('#dcLive') ? box.querySelector('#dcLive').textContent : ''),
    tiengKhiMo: sfxLog.slice()
  };
  if (!out.modal.mo || !out.modal.coVongQuay || !out.modal.coNutQuay) err('bấm nút phải mở bảng có vòng quay và nút Quay');
  if (!out.modal.soLat) err('vòng quay phải có lát truyện (bìa/tên)');
  if (out.modal.soLat > 10) err('vòng quay chỉ nên có tối đa 10 lát cho dễ nhìn');
  if (out.modal.chipTinhTrang !== 2) err('bộ lọc phải có hai lựa chọn tình trạng: đang cập nhật / hoàn thành');
  if (!out.modal.chip18) err('bộ lọc phải có lựa chọn “Gồm 18+”');
  if (out.modal.tiengKhiMo.length) err('mở bảng chưa bấm gì thì không được phát tiếng');

  /* ưu tiên truyện đang theo dõi */
  const cands = win.CZDice.candidates().map(n => n.slug);
  out.theoDoi = { ds: cands, chiTheoDoi: cands.length === 1 && cands[0] === FOLLOW };
  if (!out.theoDoi.chiTheoDoi) err('khi đang theo dõi truyện có chương thì vòng quay phải ưu tiên nhóm đó (thấy: ' + cands.join(',') + ')');

  /* không bịa truyện: mọi kết quả phải có trong registry và đọc được */
  const allSlugs = REG.lib.map(n => n.slug);
  out.minhBach = cands.every(s => allSlugs.indexOf(s) >= 0);
  if (!out.minhBach) err('vòng quay trả về truyện không có trong registry (dữ liệu bịa)');
  const is18Of = s => { const n = REG.lib.filter(x => x.slug === s)[0]; return !!(n && n.is18); };
  out.loc18 = { coTruyen18: cands.some(is18Of) };
  if (out.loc18.coTruyen18) err('máy chưa xác nhận 18+ thì vòng quay không được lọt truyện 18+');

  /* bật “Gồm 18+” bằng đúng nút trên giao diện */
  click(win, box.querySelector('[data-opt="adult"]'));
  await wait(60);
  const box2 = $('#czDiceBox');
  const cands18 = win.CZDice.candidates().map(n => n.slug);
  out.bat18 = {
    chipOn: !!box2.querySelector('[data-opt="adult"].on'),
    coTruyen18: cands18.some(is18Of),
    nhoTrongMay: win.localStorage.getItem('ssochuz-dice-opt')
  };
  if (!out.bat18.chipOn) err('bấm chip “Gồm 18+” phải sáng lên');
  if (!out.bat18.nhoTrongMay || out.bat18.nhoTrongMay.indexOf('"adult":true') < 0) err('lựa chọn bộ lọc phải nhớ trong localStorage');
  click(win, box2.querySelector('[data-opt="adult"]'));    /* tắt lại cho phần sau */
  await wait(60);

  /* =====================================================================
     5. quay: ~2,6 giây, kết quả đầy đủ, nút Đọc ngay đúng chương
     ===================================================================== */
  click(win, $('#dcSpin'));
  await wait(60);
  out.trongLucQuay = {
    live: $('#dcLive').textContent,
    nutKhoa: $('#dcSpin').disabled,
    nhan: $('#dcSpin').textContent.trim(),
    coKetQua: !$('#dcResult').hidden
  };
  if (!/Đang quay/.test(out.trongLucQuay.live)) err('trong lúc quay phải báo “Đang quay…” ở vùng role=status');
  if (!out.trongLucQuay.nutKhoa) err('đang quay thì nút Quay phải khoá để không bấm chồng');
  if (out.trongLucQuay.coKetQua) err('chưa quay xong đã hiện kết quả');
  await wait(2900);
  const res = $('#dcResult');
  const link = res.querySelector('[data-dice-read]');
  let pick = null;
  try { pick = JSON.parse(win.localStorage.getItem('ssochuz-dice-last') || 'null'); } catch (e) { pick = null; }
  const pickRaw = win.localStorage.getItem('ssochuz-dice-last');
  out.ketQua = {
    hien: res && !res.hidden,
    slug: pick,
    slugTrongMay: pickRaw,
    tieuDe: (res.querySelector('h4') || {}).textContent,
    coBia: !!res.querySelector('.dc-cv img, .dc-cv .dc-ph'),
    link: link ? link.getAttribute('href') : '',
    // chương mới nhất: có hỏi mục lục (1 request) rồi mới điền
    chuongMoiNhat: (res.querySelector('[data-latest]') || {}).textContent,
    nutQuayLai: !!$('#dcAgain') && !$('#dcAgain').hidden,
    tieng: sfxLog.slice()
  };
  if (!out.ketQua.hien) err('quay xong phải hiện thẻ kết quả');
  if (!out.ketQua.tieuDe) err('thẻ kết quả phải có tên truyện');
  if (!out.ketQua.coBia) err('thẻ kết quả phải có bìa (hoặc chữ cái thay bìa)');
  if (!pick || out.ketQua.link.indexOf('/truyen/' + pick + '/') !== 0) err('nút “Đọc ngay” phải trỏ vào truyện vừa quay (thấy: ' + out.ketQua.link + ')');
  if (!/\/(chuong|chapter)-?\d+\/?$/.test(out.ketQua.link)) err('nút “Đọc ngay” phải trỏ tới một chương cụ thể (thấy: ' + out.ketQua.link + ')');
  if (pick === FOLLOW && out.ketQua.link.indexOf('chuong-3') < 0) err('truyện đang đọc dở phải mở đúng chương đang đọc (chuong-3)');
  if (!out.ketQua.nutQuayLai) err('quay xong phải hiện nút “Quay lại”');
  if (!out.ketQua.tieng.includes('pop')) err('quay xong (do người dùng bấm) nên có tiếng pop nhẹ');

  /* =====================================================================
     7. truyện vừa đọc bị loại khi vẫn còn đủ lựa chọn khác
     ===================================================================== */
  win.localStorage.removeItem('ssochuz-follow');
  win.localStorage.setItem('ssochuz-when-' + pick, String(Date.now()));
  const cands3 = win.CZDice.candidates().map(n => n.slug);
  out.boVuaDoc = { soLuong: cands3.length, conTruyenVuaDoc: cands3.indexOf(pick) >= 0 };
  if (out.boVuaDoc.conTruyenVuaDoc) err('truyện vừa đọc hôm nay phải bị loại khỏi vòng quay khi còn nhiều lựa chọn khác');
  if (!cands3.length) err('lọc xong vẫn phải còn truyện để quay');

  /* =====================================================================
     6. “Quay lại” không trả về đúng bộ vừa quay (khi còn lựa chọn khác)
     =====================================================================
     Vòng quay giữ nguyên danh sách lát trong suốt một lượt mở bảng, nên phải
     mở lại bảng (bộ lọc Theo dõi vừa bỏ) để vòng quay lấy danh sách mới. */
  const closeBtn = $('#czDiceBox').querySelector('[data-close]');
  if (closeBtn) click(win, closeBtn);
  await wait(240);
  click(win, host.querySelector('button'));
  await wait(100);
  out.vongMoi = {
    soLat: $('#czDiceBox').querySelectorAll('.dc-slot').length,
    coKetQuaCu: !$('#dcResult').hidden
  };
  if (out.vongMoi.soLat < 2) err('bỏ theo dõi rồi mở lại phải có nhiều lát để quay (đang ' + out.vongMoi.soLat + ')');
  click(win, $('#dcSpin'));
  await wait(2900);
  let pickA = null, pickB = null;
  try { pickA = JSON.parse(win.localStorage.getItem('ssochuz-dice-last') || 'null'); } catch (e) {}
  click(win, $('#dcAgain'));
  await wait(2900);
  try { pickB = JSON.parse(win.localStorage.getItem('ssochuz-dice-last') || 'null'); } catch (e) {}
  out.khongLapLai = { truoc: pickA, sau: pickB, khac: pickA !== pickB, khacKetQuaCu: pickB !== pick };
  if (pickB === pickA) err('“Quay lại” không được trả về đúng bộ vừa quay khi còn lựa chọn khác');
  if (pickB === pick) err('kết quả vừa đọc hôm nay không được quay lại trúng ngay');

  win.CZ.sfx = realSfx;
  const closer = box.querySelector('[data-close]');
  if (closer) click(win, closer);
  await wait(200);

  /* =====================================================================
     4b. thể loại: chỉ hiện khi kho có dữ liệu thể loại (58/67 bộ đang trống)
     ===================================================================== */
  const withGenre = REG.lib.filter(n => n.genre && String(n.genre).trim());
  click(win, host.querySelector('button'));
  await wait(80);
  const chips = [...$('#czDiceBox').querySelectorAll('[data-genre]')];
  out.theLoai = { soTruyenCoTheLoai: withGenre.length, soChip: chips.length, khop: (chips.length > 0) === (withGenre.length > 0) };
  if (out.theLoai.soChip && !withGenre.length) err('kho không có thể loại mà vẫn hiện chip thể loại');
  if (!out.theLoai.khop) err('chip thể loại phải ẩn khi registry chưa có dữ liệu thể loại');
  const cl = $('#czDiceBox').querySelector('[data-close]');
  if (cl) click(win, cl);
  await wait(150);

  /* =====================================================================
     8. giảm chuyển động: ra kết quả ngay
     ===================================================================== */
  const pm = page('index.html', {
    url: 'https://ssochuz.pages.dev/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] }),
    setup(w) {
      w.matchMedia = q => ({ matches: /reduced-motion/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    }
  });
  await wait(1500);
  const pb = pm.doc.querySelector('[data-dice] button');
  click(pm.win, pb);
  await wait(80);
  click(pm.win, pm.doc.querySelector('#dcSpin'));
  await wait(80);
  out.giamChuyenDong = {
    reduce: pm.win.CZ.reduce,
    coKetQua: !pm.doc.querySelector('#dcResult').hidden
  };
  if (!out.giamChuyenDong.reduce) err('bài kiểm chưa giả lập được prefers-reduced-motion');
  if (!out.giamChuyenDong.coKetQua) err('máy bật giảm chuyển động phải ra kết quả ngay, không quay 2,6 giây');

  /* =====================================================================
     1b. trang chi tiết truyện cũng có nút vòng quay
     ===================================================================== */
  const sp = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] })
  });
  await wait(1500);
  const sh = sp.doc.querySelector('[data-dice]');
  const sb = sh && sh.querySelector('button');
  out.trangTruyen = { coNut: !!sb, nhan: sb ? sb.textContent.trim() : '' };
  if (!sb) err('trang chi tiết truyện phải có nút vòng quay “Hôm nay đọc gì?”');
  if (sb) {
    click(sp.win, sb);
    await wait(80);
    out.trangTruyen.mo = !!sp.doc.querySelector('#czDiceBox');
    if (!out.trangTruyen.mo) err('bấm nút vòng quay ở trang truyện phải mở được bảng');
  }

  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
