/* ============================================================================
   Kiểm thử 1.20.0 — TRANG RIÊNG VÒNG QUAY “HÔM NAY ĐỌC GÌ?” (/vong-quay/)
   ----------------------------------------------------------------------------
     1. nút ở thanh đầu trang chủ và trang chi tiết truyện dẫn sang trang riêng
        /vong-quay/ (không mở popup);
     2. trang /vong-quay/ có sẵn vòng quay + nút Quay + nút Trộn truyện + bộ lọc
        tình trạng/18+/thể loại ngay trên trang;
     3. nguồn truyện theo thứ tự ưu tiên: đang theo dõi → mới cập nhật → cả kho,
        KHÔNG bịa truyện nào ngoài dữ liệu (mọi kết quả đều có trong registry);
     4. máy chưa xác nhận 18+ thì không bao giờ quay trúng truyện 18+;
     5. quay ~2,6 giây mới ra kết quả; kết quả có bìa + tên + chương mới nhất /
        chương đang đọc, kèm nút “Đọc ngay” trỏ đúng chương;
     6. “Quay lại” không trả về đúng bộ vừa quay khi còn lựa chọn khác;
     7. truyện vừa đọc trong 14 ngày bị loại khỏi vòng khi vẫn còn đủ lựa chọn;
     8. máy bật “giảm chuyển động” thì ra kết quả ngay (không quay 2,6 giây);
     9. không tự phát tiếng khi mới mở; bấm Quay / Trộn mới có tiếng.
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
function supabaseStub(w) {
  w.supabase = { createClient() { return { auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } }; } };
}
const REG = JSON.parse(read('data/registry.json'));

(async () => {
  const out = { errors0: [] };
  const err = m => out.errors0.push(m);

  /* =====================================================================
     1. Trang chủ có nút dẫn tới trang riêng /vong-quay/ (không mở popup)
     ===================================================================== */
  const FOLLOW = 'third-person';
  const hp = page('index.html', {
    url: 'https://ssochuz.pages.dev/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] }),
    setup: supabaseStub
  });
  await wait(1200);
  const host = hp.doc.querySelector('[data-dice]');
  const btn = host && host.querySelector('.dicebtn');
  out.nut = {
    coHost: !!host,
    coNut: !!btn,
    href: btn ? btn.getAttribute('href') : '',
    nhan: btn ? btn.textContent.trim() : '',
    khongCoPopup: !hp.doc.querySelector('.modal.dicebox')
  };
  if (!btn) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }
  if (!/Hôm nay đọc gì\?/.test(out.nut.nhan)) err('nút vòng quay phải có nhãn “Hôm nay đọc gì?”');
  if (out.nut.href !== '/vong-quay/') err('nút vòng quay phải dẫn sang trang riêng /vong-quay/');
  hp.win.close();

  /* =====================================================================
     2 + 3: Trang riêng /vong-quay/, máy có theo dõi 1 truyện đang ra chương
     ===================================================================== */
  const sfxLog = [];
  const p = page('vong-quay/index.html', {
    url: 'https://ssochuz.pages.dev/vong-quay/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] }),
    setup(w) {
      supabaseStub(w);
      w.localStorage.setItem('ssochuz-follow', JSON.stringify({ [FOLLOW]: 1 }));
      w.localStorage.setItem('ssochuz-prog-' + FOLLOW, '3');
    }
  });
  const { win, doc } = p;
  const $ = s => doc.querySelector(s);
  await wait(1500);

  const realSfx = win.CZ.sfx;
  win.CZ.sfx = function (id) { sfxLog.push(id); };

  const box = $('#czDiceBox.dicepage-box');
  out.trangRieng = {
    coKhungTrang: !!box,
    khongPhaiModal: !doc.querySelector('.modal.dicebox'),
    coVongQuay: !!(box && box.querySelector('.dc-wheel')),
    coNutQuay: !!(box && box.querySelector('#dcSpin')),
    coNutTron: !!(box && box.querySelector('#dcShuffle')),
    soLat: box ? box.querySelectorAll('.dc-slot').length : 0,
    chipTinhTrang: box ? box.querySelectorAll('[data-opt="run"],[data-opt="done"]').length : 0,
    chip18: !!(box && box.querySelector('[data-opt="adult"]')),
    live: (box && box.querySelector('#dcLive') ? box.querySelector('#dcLive').textContent : ''),
    tiengKhiMo: sfxLog.slice()
  };
  if (!out.trangRieng.coKhungTrang || !out.trangRieng.coVongQuay || !out.trangRieng.coNutQuay) err('trang /vong-quay/ phải có vòng quay và nút Quay ngay trên trang');
  if (!out.trangRieng.khongPhaiModal) err('vòng quay phải là trang riêng chứ không phải popup modal');
  if (!out.trangRieng.soLat) err('vòng quay phải có lát truyện (bìa/tên)');
  if (out.trangRieng.soLat > 10) err('vòng quay chỉ nên có tối đa 10 lát cho dễ nhìn');
  if (out.trangRieng.chipTinhTrang !== 2) err('bộ lọc phải có hai lựa chọn tình trạng: đang cập nhật / hoàn thành');
  if (!out.trangRieng.chip18) err('bộ lọc phải có lựa chọn “Gồm 18+”');
  if (out.trangRieng.tiengKhiMo.length) err('mở trang chưa bấm gì thì không được phát tiếng');

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
  const cands18 = win.CZDice.candidates().map(n => n.slug);
  out.bat18 = {
    chipOn: !!box.querySelector('[data-opt="adult"].on'),
    coTruyen18: cands18.some(is18Of),
    nhoTrongMay: win.localStorage.getItem('ssochuz:dice:options:v1')
  };
  if (!out.bat18.chipOn) err('bấm chip “Gồm 18+” phải sáng lên');
  if (!out.bat18.nhoTrongMay || out.bat18.nhoTrongMay.indexOf('"adult":true') < 0) err('lựa chọn bộ lọc phải nhớ trong localStorage');
  click(win, box.querySelector('[data-opt="adult"]'));
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
  try { pick = JSON.parse(win.localStorage.getItem('ssochuz:dice:last:v1') || 'null'); } catch (e) { pick = null; }
  const pickRaw = win.localStorage.getItem('ssochuz:dice:last:v1');
  out.ketQua = {
    hien: res && !res.hidden,
    slug: pick,
    slugTrongMay: pickRaw,
    tieuDe: (res.querySelector('h4') || {}).textContent,
    coBia: !!res.querySelector('.dc-cv img, .dc-cv .dc-ph'),
    link: link ? link.getAttribute('href') : '',
    chuongMoiNhat: (res.querySelector('[data-latest]') || {}).textContent,
    nutQuayLai: !!$('#dcAgain') && !$('#dcAgain').hidden,
    nutTronTruyen: !!$('#dcShuffle') && !$('#dcShuffle').hidden,
    latDuocChon: !!box.querySelector('.dc-slot.is-pick'),
    tieng: sfxLog.slice()
  };
  if (!out.ketQua.hien) err('quay xong phải hiện thẻ kết quả');
  if (!out.ketQua.tieuDe) err('thẻ kết quả phải có tên truyện');
  if (!out.ketQua.coBia) err('thẻ kết quả phải có bìa (hoặc chữ cái thay bìa)');
  if (!pick || out.ketQua.link.indexOf('/truyen/' + pick + '/') !== 0) err('nút “Đọc ngay” phải trỏ vào truyện vừa quay (thấy: ' + out.ketQua.link + ')');
  if (!/\/(chuong|chapter)-?\d+\/?$/.test(out.ketQua.link)) err('nút “Đọc ngay” phải trỏ tới một chương cụ thể (thấy: ' + out.ketQua.link + ')');
  if (pick === FOLLOW && out.ketQua.link.indexOf('chuong-3') < 0) err('truyện đang đọc dở phải mở đúng chương đang đọc (chuong-3)');
  if (!out.ketQua.nutQuayLai) err('quay xong phải hiện nút “Quay lại”');
  if (!out.ketQua.nutTronTruyen) err('quay xong phải hiện nút “Trộn truyện”');
  if (!out.ketQua.latDuocChon) err('quay xong phải đánh dấu nổi bật bìa trúng trên vòng quay');
  if (out.ketQua.tieng.length) err('tính năng âm thanh hiệu ứng đã bỏ — vòng quay không được phát tiếng');

  /* bấm “Trộn truyện” sau khi quay: phải trộn sang danh sách truyện mới trên vòng quay */
  click(win, $('#dcShuffle'));
  await wait(80);
  out.tronTruyen = {
    soLatSauKhiTron: box.querySelectorAll('.dc-slot').length,
    live: $('#dcLive').textContent
  };
  if (out.tronTruyen.soLatSauKhiTron < 2) err('bấm “Trộn truyện” phải nạp danh sách truyện mới lên vòng quay');
  if (!/Đã trộn/.test(out.tronTruyen.live)) err('bấm “Trộn truyện” phải cập nhật trạng thái đã trộn vòng quay');

  /* =====================================================================
     7. truyện vừa đọc bị loại khi vẫn còn đủ lựa chọn khác
     ===================================================================== */
  await win.CZPersonal.toggleFollow(FOLLOW);
  win.CZPersonal.setProgress(pick, 1, 25, false);
  const cands3 = win.CZDice.candidates().map(n => n.slug);
  out.boVuaDoc = { soLuong: cands3.length, conTruyenVuaDoc: cands3.indexOf(pick) >= 0 };
  if (out.boVuaDoc.conTruyenVuaDoc) err('truyện vừa đọc hôm nay phải bị loại khỏi vòng quay khi còn nhiều lựa chọn khác');
  if (!cands3.length) err('lọc xong vẫn phải còn truyện để quay');

  /* =====================================================================
     6. “Quay lại” không trả về đúng bộ vừa quay (khi còn lựa chọn khác)
     ===================================================================== */
  win.CZDice.mount(box, false);
  await wait(80);
  out.vongMoi = {
    soLat: box.querySelectorAll('.dc-slot').length,
    coKetQuaCu: !$('#dcResult').hidden
  };
  if (out.vongMoi.soLat < 2) err('bỏ theo dõi rồi dựng lại phải có nhiều lát để quay (đang ' + out.vongMoi.soLat + ')');
  click(win, $('#dcSpin'));
  await wait(2900);
  let pickA = null, pickB = null;
  try { pickA = JSON.parse(win.localStorage.getItem('ssochuz:dice:last:v1') || 'null'); } catch (e) {}
  click(win, $('#dcAgain'));
  await wait(2900);
  try { pickB = JSON.parse(win.localStorage.getItem('ssochuz:dice:last:v1') || 'null'); } catch (e) {}
  out.khongLapLai = { truoc: pickA, sau: pickB, khac: pickA !== pickB, khacKetQuaCu: pickB !== pick };
  if (pickB === pickA) err('“Quay lại” không được trả về đúng bộ vừa quay khi còn lựa chọn khác');
  if (pickB === pick) err('kết quả vừa đọc hôm nay không được quay lại trúng ngay');

  win.CZ.sfx = realSfx;

  /* =====================================================================
     4b. thể loại: chỉ hiện khi kho có dữ liệu thể loại
     ===================================================================== */
  const withGenre = REG.lib.filter(n => n.genre && String(n.genre).trim());
  const chips = [...box.querySelectorAll('[data-genre]')];
  out.theLoai = { soTruyenCoTheLoai: withGenre.length, soChip: chips.length, khop: (chips.length > 0) === (withGenre.length > 0) };
  if (out.theLoai.soChip && !withGenre.length) err('kho không có thể loại mà vẫn hiện chip thể loại');
  if (!out.theLoai.khop) err('chip thể loại phải ẩn khi registry chưa có dữ liệu thể loại');
  win.close();

  /* =====================================================================
     8. giảm chuyển động: ra kết quả ngay trên trang /vong-quay/
     ===================================================================== */
  const pm = page('vong-quay/index.html', {
    url: 'https://ssochuz.pages.dev/vong-quay/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] }),
    setup(w) {
      supabaseStub(w);
      w.matchMedia = q => ({ matches: /reduced-motion/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    }
  });
  await wait(1500);
  click(pm.win, pm.doc.querySelector('#dcSpin'));
  await wait(80);
  out.giamChuyenDong = {
    reduce: pm.win.CZ.reduce,
    coKetQua: !pm.doc.querySelector('#dcResult').hidden
  };
  if (!out.giamChuyenDong.reduce) err('bài kiểm chưa giả lập được prefers-reduced-motion');
  if (!out.giamChuyenDong.coKetQua) err('máy bật giảm chuyển động phải ra kết quả ngay, không quay 2,6 giây');
  pm.win.close();

  /* =====================================================================
     1b. trang chi tiết truyện / trang đọc KHÔNG hiện nút vòng quay
         (chỉ hiện ở trang chủ theo yêu cầu)
     ===================================================================== */
  const sp = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] }),
    setup: supabaseStub,
  });
  await wait(1500);
  const sh = sp.doc.querySelector('[data-dice]');
  const rdDice = sp.doc.querySelector('#rdDice');
  out.trangTruyen = {
    coNut: !!(sh || rdDice)
  };
  if (out.trangTruyen.coNut) err('nút “Hôm nay đọc gì?” chỉ được hiện ở trang chủ, không hiện ở trang truyện/trang đọc');
  sp.win.close();

  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
