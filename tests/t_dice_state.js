/* ============================================================================
   Kiểm thử 1.20.0 — TRẠNG THÁI XẤP BÀI KHI KHUNG BỊ DỰNG LẠI
   ----------------------------------------------------------------------------
   Ba lỗi thật của trang “Bốc bài”, tìm ra khi rà mã nguồn:

   1. `flipIn()` gọi `settle()` ở nhánh “không còn #dcBoard/#dcFace”. Nhưng
      `settle` chỉ được gán bằng `var` ở DƯỚI trong chính hàm đó ⇒ lúc gọi là
      `undefined` ⇒ TypeError, `S.busy` kẹt `true`, nút “Bốc một lá” chết tới
      khi tải lại trang.
   2. `S.gen` được đọc ở 3 chỗ để bỏ hoạt ảnh cũ nhưng KHÔNG BAO GIỜ tăng ⇒ đổi
      bộ lọc giữa lúc lật thì callback cũ vẫn “đáp” lá của xấp cũ lên khung mới
      (kết quả không còn khớp bộ lọc đang chọn).
   3. `renderBox()` dựng lại `body.innerHTML` về trạng thái úp bài nhưng không
      trả `S.hasCard` về false ⇒ lượt bốc kế tiếp chạy nhánh “gập lá cũ” trên
      khung trống (chậm, không lật vào).

   Bài này khoá cả ba: không lỗi JS, `busy` luôn được mở, `gen` tăng khi dựng
   lại xấp, và lá của lượt trước không rơi vào khung vừa dựng.
   Chạy:  node tests/t_dice_state.js
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, dataFetch, read, ROOT } = require('./mk');

const BASE = 'https://cms.test';
const wait = ms => new Promise(r => setTimeout(r, ms));
const J = (b, ok, st) => Promise.resolve({
  ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b))
});
const REG = JSON.parse(read('data/registry.json'));
function makeApi() {
  return (p) => {
    if (p === '/api/registry') return J(REG);
    const mb = p.match(/^\/api\/book\/([^/?]+)/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
    }
    if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    if (p === '/api/schedule') return J({ items: [] });
    if (p === '/api/toc') return J({ ok: true, chapters: [{ t: 'Chương 1' }] });
  };
}
const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
function supabaseStub(w) {
  w.supabase = { createClient() { return { auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } }; } };
}
function open() {
  return page('boc-bai/index.html', {
    url: 'https://ssochuz.pages.dev/boc-bai/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(), log: [] }),
    setup: supabaseStub,
  });
}

(async () => {
  const out = { errors0: [] };
  const err = m => out.errors0.push(m);

  /* =====================================================================
     1. Khung bị dựng lại/thiếu #dcFace ⇒ không lỗi JS, nút không bị kẹt
     ===================================================================== */
  const p1 = open();
  await wait(1500);
  const { win, doc } = p1;
  const box = doc.querySelector('#czDiceBox');
  if (!box) { err('không mở được /boc-bai/'); console.log(JSON.stringify(out, null, 1)); process.exit(1); }

  doc.querySelector('#dcFace').remove();       /* mô phỏng khung bị thay/mất */
  click(win, box.querySelector('#dcDraw'));
  await wait(400);
  out.matKhung = {
    loiJs: p1.errors.slice(),
    busy: win.CZDice._S.busy
  };
  if (out.matKhung.loiJs.length) err('bốc khi thiếu #dcFace không được ném lỗi: ' + out.matKhung.loiJs.join(' | '));
  if (out.matKhung.busy) err('bốc hỏng phải MỞ KHOÁ nút (S.busy=false), không kẹt “Đang bốc…”');

  /* dựng lại khung: lượt bốc sau phải chạy bình thường (không chết theo) */
  win.CZDice.mount(doc.querySelector('#czDiceBox'), false);
  await wait(80);
  click(win, doc.querySelector('#dcDraw'));
  await wait(400);
  out.hoiPhuc = {
    coKetQua: !doc.querySelector('#dcResult').hidden,
    busy: win.CZDice._S.busy
  };
  if (!out.hoiPhuc.coKetQua) err('dựng lại khung rồi bốc phải ra kết quả (nút không được chết vĩnh viễn)');
  if (out.hoiPhuc.busy) err('bốc xong phải mở khoá nút');
  win.close();

  /* =====================================================================
     2. Đổi bộ lọc GIỮA lúc lật: gen tăng, lá cũ không rơi vào khung mới
     ===================================================================== */
  const p2 = open();
  await wait(1500);
  const w2 = p2.win, d2 = p2.doc;
  const box2 = d2.querySelector('#czDiceBox');
  const gen0 = w2.CZDice._S.gen;

  click(w2, box2.querySelector('#dcDraw'));
  await wait(20);                              /* đang trong hoạt ảnh lật */
  click(w2, box2.querySelector('[data-opt="adult"]'));   /* đổi bộ lọc ⇒ dựng lại */
  await wait(500);

  out.doiLocGiuaLucLat = {
    genTruoc: gen0,
    genSau: w2.CZDice._S.gen,
    coKetQua: !d2.querySelector('#dcResult').hidden,
    ketQua: (d2.querySelector('#dcResult h2') || {}).textContent || '',
    busy: w2.CZDice._S.busy,
    hasCard: w2.CZDice._S.hasCard,
    loiJs: p2.errors.slice()
  };
  if (out.doiLocGiuaLucLat.genSau <= out.doiLocGiuaLucLat.genTruoc) err('dựng lại xấp phải tăng S.gen để bỏ hoạt ảnh của lượt trước');
  if (out.doiLocGiuaLucLat.coKetQua) err('đổi bộ lọc giữa lúc lật không được để lá của xấp CŨ “đáp” lên khung mới');
  if (out.doiLocGiuaLucLat.busy) err('bỏ hoạt ảnh cũ phải mở khoá nút bốc');
  if (out.doiLocGiuaLucLat.hasCard) err('khung vừa dựng lại là trạng thái úp bài — S.hasCard phải là false');
  if (out.doiLocGiuaLucLat.loiJs.length) err('đổi bộ lọc giữa lúc lật không được ném lỗi JS: ' + out.doiLocGiuaLucLat.loiJs.join(' | '));

  /* =====================================================================
     3. Dựng lại sau khi đã bốc: trạng thái phải về úp bài, lượt sau lật vào
     ===================================================================== */
  click(w2, d2.querySelector('#dcDraw'));
  await wait(400);
  if (d2.querySelector('#dcResult').hidden) err('bốc trên khung vừa dựng lại phải ra kết quả');
  w2.CZDice.mount(box2, false);
  await wait(80);
  out.dungLai = {
    hasCard: w2.CZDice._S.hasCard,
    ketQuaAn: d2.querySelector('#dcResult').hidden
  };
  if (out.dungLai.hasCard) err('dựng lại khung phải trả S.hasCard về false');
  if (!out.dungLai.ketQuaAn) err('dựng lại khung phải ẩn thẻ kết quả cũ');

  click(w2, d2.querySelector('#dcDraw'));
  await wait(400);
  out.latVaoSauKhiDungLai = {
    coKetQua: !d2.querySelector('#dcResult').hidden,
    xapAn: d2.querySelector('#dcPile').hidden,
    faceHien: !d2.querySelector('#dcFace').hidden,
    loiJs: p2.errors.slice()
  };
  if (!out.latVaoSauKhiDungLai.coKetQua) err('sau khi dựng lại phải bốc được và ra kết quả');
  if (!out.latVaoSauKhiDungLai.faceHien) err('bốc xong phải lật mặt bìa ra');
  if (!out.latVaoSauKhiDungLai.xapAn) err('bốc xong phải ẩn xấp bài');
  if (out.latVaoSauKhiDungLai.loiJs.length) err('lượt bốc sau khi dựng lại không được ném lỗi JS');
  w2.close();

  console.log(JSON.stringify(out, null, 1));
  process.exit(out.errors0.length ? 1 : 0);
})();
