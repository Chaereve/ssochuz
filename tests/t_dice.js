/* ============================================================================
   Kiểm thử 1.20.0 — TRANG RIÊNG “BỐC BÀI” (/boc-bai/)
   ----------------------------------------------------------------------------
     1. trang chủ KHÔNG còn nút “Hôm nay đọc gì?”; lối vào duy nhất là tab
        “Bốc bài” trong sidebar, dẫn tới /boc-bai/ (không mở popup);
     2. trang /boc-bai/ có sẵn bộ bài + nút Bốc + nút Xáo bài + bộ lọc
        tình trạng/18+/thể loại ngay trên trang;
     3. bộ bài là CẢ KHO truyện đọc được (không thu về nhóm đang theo dõi),
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
     1. Trang chủ không còn nút bốc bài; tab trong sidebar là lối vào duy nhất
     ===================================================================== */
  const FOLLOW = 'third-person';
  const hp = page('index.html', {
    url: 'https://ssochuz.pages.dev/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] }),
    setup: supabaseStub
  });
  await wait(1200);
  const tab = hp.doc.querySelector('#czNav a[data-k="dice"]');
  out.nut = {
    khongCoNutTrenTrangChu: !hp.doc.querySelector('[data-dice]') && !hp.doc.querySelector('.dicebtn'),
    coTabTrongSidebar: !!tab,
    href: tab ? tab.getAttribute('href') : '',
    nhan: tab ? tab.textContent.trim() : '',
    khongCoPopup: !hp.doc.querySelector('.modal.dicebox')
  };
  if (!tab) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }
  if (!out.nut.khongCoNutTrenTrangChu) err('trang chủ không được còn nút bốc bài — lối vào là tab trong sidebar');
  if (out.nut.nhan !== 'Bốc bài') err('tab trong sidebar phải mang nhãn “Bốc bài” (thấy: ' + out.nut.nhan + ')');
  if (out.nut.href !== '/boc-bai/') err('tab “Bốc bài” phải dẫn tới /boc-bai/ (thấy: ' + out.nut.href + ')');
  if (!hp.doc.querySelectorAll('#czNav a').length) err('sidebar phải có danh sách tab');
  hp.win.close();

  /* =====================================================================
     2 + 3: Trang riêng /boc-bai/, máy có theo dõi 1 truyện đang ra chương
     ===================================================================== */
  const sfxLog = [];
  const p = page('boc-bai/index.html', {
    url: 'https://ssochuz.pages.dev/boc-bai/',
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
    coBoBai: !!(box && box.querySelector('.dc-board') && box.querySelector('#dcPile')),
    coNutBoc: !!(box && box.querySelector('#dcDraw')),
    coNutXao: !!(box && box.querySelector('#dcShuffle')),
    soLat: box ? box.querySelectorAll('.dc-bk').length : 0,
    chipTinhTrang: box ? box.querySelectorAll('[data-opt="run"],[data-opt="done"]').length : 0,
    chip18: !!(box && box.querySelector('[data-opt="adult"]')),
    live: (box && box.querySelector('#dcLive') ? box.querySelector('#dcLive').textContent : ''),
    tiengKhiMo: sfxLog.slice()
  };
  if (!out.trangRieng.coKhungTrang || !out.trangRieng.coBoBai || !out.trangRieng.coNutBoc) err('trang /boc-bai/ phải có xấp bài và nút “Bốc một lá” trên trang');
  if (!out.trangRieng.khongPhaiModal) err('bốc bài phải là trang riêng chứ không phải popup modal');
  if (out.trangRieng.soLat < 3) err('xấp bài phải có các lớp lá úp phía sau');
  if (out.trangRieng.chipTinhTrang !== 2) err('bộ lọc phải có hai lựa chọn tình trạng: đang cập nhật / hoàn thành');
  if (!out.trangRieng.chip18) err('bộ lọc phải có lựa chọn “Gồm 18+”');
  if (out.trangRieng.tiengKhiMo.length) err('mở trang chưa bấm gì thì không được phát tiếng');

  /* r120: bộ bài là CẢ KHO đọc được, không thu về nhóm đang theo dõi. Máy đang
     theo dõi đúng một truyện (FOLLOW) — nếu còn kiểu “ưu tiên nhóm theo dõi”
     thì bộ bài chỉ có một lá; nay phải có nhiều lá và có cả truyện ngoài nhóm. */
  const cands = win.CZDice.candidates().map(n => n.slug);
  out.boBai = {
    ds: cands,
    soLa: cands.length,
    coTruyenTheoDoi: cands.indexOf(FOLLOW) >= 0,
    coTruyenNgoaiNhom: cands.some(s => s !== FOLLOW)
  };
  if (out.boBai.soLa < 4) err('bộ bài phải gồm nhiều truyện của cả kho, không thu về nhóm đang theo dõi (thấy: ' + cands.join(',') + ')');
  if (!out.boBai.coTruyenTheoDoi) err('truyện đang theo dõi vẫn phải nằm trong bộ bài');
  if (!out.boBai.coTruyenNgoaiNhom) err('bộ bài không được chỉ gồm truyện đang theo dõi');

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
  click(win, $('#dcDraw'));
  await wait(60);
  out.trongLucQuay = {
    live: $('#dcLive').textContent,
    nutKhoa: $('#dcDraw').disabled,
    nhan: $('#dcDraw').textContent.trim(),
    coKetQua: !$('#dcResult').hidden
  };
  if (!/Đang bốc/.test(out.trongLucQuay.live)) err('trong lúc bốc phải báo “Đang bốc…” ở vùng role=status');
  if (!out.trongLucQuay.nutKhoa) err('đang bốc thì nút phải khoá để không bấm chồng');
  if (out.trongLucQuay.coKetQua) err('chưa bốc xong đã hiện kết quả');
  await wait(2900);
  const res = $('#dcResult');
  const link = $('#dcActs [data-dice-read]');
  let pick = null;
  try { pick = JSON.parse(win.localStorage.getItem('ssochuz:dice:last:v1') || 'null'); } catch (e) { pick = null; }
  const pickRaw = win.localStorage.getItem('ssochuz:dice:last:v1');
  out.ketQua = {
    hien: res && !res.hidden,
    slug: pick,
    slugTrongMay: pickRaw,
    tieuDe: (res.querySelector('h2') || {}).textContent,
    coBia: !!$('#dcFace') && !$('#dcFace').hidden && !!$('#dcFace').querySelector('img, .dc-ph'),
    link: link ? link.getAttribute('href') : '',
    chuongMoiNhat: (res.querySelector('[data-latest]') || {}).textContent,
    nutBocLai: !!$('#dcAgain') && !$('#dcAgain').hidden,
    nutXaoBai: !!$('#dcShuffle') && !$('#dcShuffle').hidden,
    latDaLat: !!$('#dcFace') && !$('#dcFace').hidden,
    xapAn: !!$('#dcPile') && $('#dcPile').hidden,
    tieng: sfxLog.slice()
  };
  if (!out.ketQua.hien) err('quay xong phải hiện thẻ kết quả');
  if (!out.ketQua.tieuDe) err('thẻ kết quả phải có tên truyện');
  if (!out.ketQua.coBia) err('thẻ kết quả phải có bìa (hoặc chữ cái thay bìa)');
  if (!pick || out.ketQua.link.indexOf('/truyen/' + pick + '/') !== 0) err('nút “Đọc ngay” phải trỏ vào truyện vừa quay (thấy: ' + out.ketQua.link + ')');
  if (!/\/(chuong|chapter)-?\d+\/?$/.test(out.ketQua.link)) err('nút “Đọc ngay” phải trỏ tới một chương cụ thể (thấy: ' + out.ketQua.link + ')');
  if (pick === FOLLOW && out.ketQua.link.indexOf('chuong-3') < 0) err('truyện đang đọc dở phải mở đúng chương đang đọc (chuong-3)');
  if (!out.ketQua.nutBocLai) err('bốc xong phải hiện nút “Bốc lá khác”');
  if (!out.ketQua.nutXaoBai) err('bốc xong phải hiện nút “Xáo bài”');
  if (!out.ketQua.latDaLat) err('bốc xong phải lật mặt bìa ra');
  if (!out.ketQua.xapAn) err('đã bốc thì xấp bài phải ẩn đi, không chồng lên lá đã lật');
  if (out.ketQua.tieng.length) err('tính năng âm thanh hiệu ứng đã bỏ — vòng quay không được phát tiếng');

  /* bấm “Trộn truyện” sau khi quay: phải trộn sang danh sách truyện mới trên vòng quay */
  click(win, $('#dcShuffle'));
  await wait(80);
  out.tronTruyen = {
    soLaSauKhiXao: win.CZDice._S.deck.length,
    soLaKhopBoLoc: win.CZDice.candidates().length,
    live: $('#dcLive').textContent
  };
  if (out.tronTruyen.soLaSauKhiXao < 1 || out.tronTruyen.soLaSauKhiXao !== out.tronTruyen.soLaKhopBoLoc) err('bấm “Xáo bài” phải nạp lại đủ cả xấp bài khớp bộ lọc');
  if (!/Đã xáo/.test(out.tronTruyen.live)) err('bấm “Xáo bài” phải cập nhật trạng thái ở vùng role=status');

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
    soLa: win.CZDice._S.deck.length,
    coKetQuaCu: !$('#dcResult').hidden
  };
  if (out.vongMoi.soLa < 2) err('bỏ theo dõi rồi dựng lại phải còn nhiều lá để bốc (đang ' + out.vongMoi.soLa + ')');
  click(win, $('#dcDraw'));
  await wait(2900);
  let pickA = null, pickB = null;
  try { pickA = JSON.parse(win.localStorage.getItem('ssochuz:dice:last:v1') || 'null'); } catch (e) {}
  click(win, $('#dcAgain'));
  await wait(2900);
  try { pickB = JSON.parse(win.localStorage.getItem('ssochuz:dice:last:v1') || 'null'); } catch (e) {}
  out.khongLapLai = { truoc: pickA, sau: pickB, khac: pickA !== pickB, khacKetQuaCu: pickB !== pick };
  if (pickB === pickA) err('“Bốc lá khác” không được trả về đúng bộ vừa bốc khi còn lựa chọn khác');
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
     8. giảm chuyển động: ra kết quả ngay trên trang /boc-bai/
     ===================================================================== */
  const pm = page('boc-bai/index.html', {
    url: 'https://ssochuz.pages.dev/boc-bai/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null), log: [] }),
    setup(w) {
      supabaseStub(w);
      w.matchMedia = q => ({ matches: /reduced-motion/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    }
  });
  await wait(1500);
  click(pm.win, pm.doc.querySelector('#dcDraw'));
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
