/* ============================================================================
   Kiểm thử 1.19.0 — HỘP GÓP GẠCH “Đòi nợ tác giả”
   ----------------------------------------------------------------------------
     1. CHỈ hiện với truyện ĐANG CẬP NHẬT: truyện đã hoàn thành thì ẩn hẳn;
     2. đủ thứ người đọc cần thấy: số gạch hiện có, mốc đang gom, thanh tiến độ
        (có aria), câu khẩu hiệu, số gạch của riêng máy này, nút gửi;
     3. bấm gửi: gạch rơi (hiệu ứng), số nhảy, toast, và ghi vào localStorage;
     4. chống spam: bấm liên tiếp không cộng thêm (cooldown), quá trần trong
        ngày thì chặn kèm lời nhắn;
     5. đủ mốc thì đổi câu “Nhà đã xây xong — giờ đòi chương mới!”;
     6. tiếng “cạch” chỉ kêu SAU cú bấm của người dùng (không tự phát);
     7. dữ liệu nằm trong localStorage — chỗ sẽ thay bằng /api/brick.
   Chạy:  node tests/t_brick.js
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, dataFetch, read, ROOT } = require('./mk');

const BASE = 'https://cms.test';
const RUN = 'co-vo-ho-danh-da-cua-toi';   /* truyện đang cập nhật trong registry */
const DONE = 'third-person';              /* truyện đã hoàn thành */
const wait = ms => new Promise(r => setTimeout(r, ms));
const J = (b, ok, st) => Promise.resolve({
  ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b))
});
function makeApi(log, calls) {
  const REG = JSON.parse(read('data/registry.json'));
  return (p, opt) => {
    opt = opt || {};
    if (log) log.push((opt.method || 'GET') + ' ' + p);
    if (calls) calls.push({ url: p, opt: opt });
    if (p === '/api/registry') return J(REG);
    const mb = p.match(/^\/api\/book\/([^/?]+)/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
    }
    if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    if (p === '/api/schedule') return J({ items: [] });
    return undefined;
  };
}
/* bản sao đúng công thức băm trong cz-brick.js — để bài kiểm biết trước con số */
function seed(slug) {
  let h = 2166136261;
  const s = String(slug || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 900 + (h % 3000);
}
const today = () => { const t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); };
const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  const out = { errors0: [] };
  const err = m => out.errors0.push(m);

  /* =====================================================================
     truyện ĐANG CẬP NHẬT: hộp gạch hiện đầy đủ
     ===================================================================== */
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + RUN + '/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null, null), log: [] })
  });
  const { win, doc } = p;
  const $ = s => doc.querySelector(s);
  await wait(1800);

  const box = $('#storyBrick');
  out.coHop = !!box;
  if (!box) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }
  if (box.hidden) err('truyện đang cập nhật phải hiện hộp góp gạch');
  out.truyenDangRa = out.coHop && !box.hidden;

  const send = box.querySelector('#bkSend');
  const tot0 = parseInt((box.querySelector('[data-bk-total]') || {}).textContent.replace(/\./g, ''), 10);
  const seedN = seed(RUN);
  out.noiDung = {
    nutGui: !!(send && /gạch/i.test(send.textContent)),
    tong: tot0,
    moc: (box.querySelector('[data-bk-goal]') || {}).textContent,
    cuaMay: (box.querySelector('[data-bk-mine]') || {}).textContent,
    coThanhTienDo: !!box.querySelector('[data-bk-bar][role="progressbar"]'),
    aria: (() => { const b = box.querySelector('[data-bk-bar]'); return b ? [b.getAttribute('aria-valuemin'), b.getAttribute('aria-valuemax'), b.getAttribute('aria-valuenow')] : null; })(),
    khauHieu: (box.querySelector('[data-bk-motto]') || {}).textContent,
    coXoGaCh: !!box.querySelector('.bk-bucket'),
    tongKhopSeed: tot0 === seedN
  };
  if (!out.noiDung.nutGui) err('hộp gạch thiếu nút “Gửi gạch giục chương mới”');
  if (!out.noiDung.tongKhopSeed) err('số gạch ban đầu phải khớp con số minh hoạ khi chưa có máy chủ (mong ' + seedN + ', thấy ' + tot0 + ')');
  if (!/viên gạch/.test(out.noiDung.moc || '')) err('phải hiện mốc đang gom dạng “… / 5.000 viên gạch”');
  if (!out.noiDung.coThanhTienDo) err('hộp gạch phải có thanh tiến độ có role=progressbar');
  if (!out.noiDung.aria || out.noiDung.aria[1] !== '5000') err('thanh tiến độ phải khai aria-valuemax = 5000');
  if (!/5\.000 viên gạch xây nhà/.test(out.noiDung.khauHieu || '')) err('thiếu câu “Đã gom đủ 5.000 viên gạch xây nhà cho nhóm dịch/tác giả”');
  if (!out.noiDung.cuaMay) err('phải hiện số gạch máy này đã góp');
  if (!out.noiDung.coXoGaCh) err('thiếu hình cái xô đựng gạch');

  /* =====================================================================
     6. KHÔNG tự phát tiếng: phải bấm mới kêu
     ===================================================================== */
  const sfxLog = [];
  const realSfx = win.CZ.sfx;
  win.CZ.sfx = function (id) { sfxLog.push(id); };
  await wait(50);
  out.tiengTruocKhiBam = sfxLog.slice();
  if (sfxLog.length) err('chưa bấm gì mà đã phát tiếng — phải im lặng lúc tải trang');

  /* =====================================================================
     3. bấm gửi một viên
     ===================================================================== */
  click(win, send);
  const dropNgay = !!box.querySelector('[data-bk-drop].go');
  const pileBump = !!box.querySelector('[data-bk-pile].bump');
  await wait(60);
  const tot1 = parseInt(box.querySelector('[data-bk-total]').textContent.replace(/\./g, ''), 10);
  let st = {};
  try { st = JSON.parse(win.localStorage.getItem('ssochuz-brick-' + RUN) || '{}'); } catch (e) {}
  out.sauKhiBam = {
    truoc: tot0, sau: tot1,
    coHoaRoi: dropNgay, coDocDay: pileBump,
    luuMay: st,
    cuaMay: parseInt((box.querySelector('[data-bk-mine]') || {}).textContent.replace(/\./g, ''), 10),
    toast: /góp 1 viên gạch|lưu trên máy bạn|tổng/i.test(doc.body.textContent),
    tieng: sfxLog.slice()
  };
  if (tot1 !== tot0 + 1) err('bấm gửi phải cộng ngay 1 viên (' + tot0 + ' → ' + tot1 + ')');
  if (!dropNgay || !pileBump) err('bấm gửi phải có hiệu ứng viên gạch rơi + đống gạch nhún');
  if (st.n !== 1 || st.today !== 1) err('viên gạch phải được ghi vào localStorage (n=1, today=1)');
  if (!st.day) err('bản ghi gạch phải có mốc ngày để chặn spam theo ngày');
  if (!out.sauKhiBam.tieng.includes('brick')) err('sau cú bấm của người dùng phải kêu tiếng “cạch” (sfx brick)');
  if (!out.sauKhiBam.toast) err('bấm gửi phải có toast xác nhận');

  /* =====================================================================
     4. chống spam: cooldown + trần trong ngày
     ===================================================================== */
  click(win, send);
  await wait(40);
  const tot2 = parseInt(box.querySelector('[data-bk-total]').textContent.replace(/\./g, ''), 10);
  out.cooldown = { sau: tot2, giuNguyen: tot2 === tot1, coLoiNhac: /Từ từ|đang nằm trong tay bạn/.test(doc.body.textContent) };
  if (!out.cooldown.giuNguyen) err('bấm liên tiếp trong lúc cooldown không được cộng thêm viên nào');
  if (!out.cooldown.coLoiNhac) err('bấm quá nhanh phải có lời nhắn nhắc chờ');
  /* đặt sẵn trạng thái “hôm nay đã đủ 20 viên” rồi bấm → phải chặn */
  win.localStorage.setItem('ssochuz-brick-' + RUN, JSON.stringify({ n: 1, day: today(), today: 20, at: 0 }));
  click(win, send);
  await wait(40);
  out.tranNgay = {
    tong: parseInt(box.querySelector('[data-bk-total]').textContent.replace(/\./g, ''), 10),
    chan: /đủ 20 viên|để mai/.test(doc.body.textContent)
  };
  if (out.tranNgay.tong !== tot1) err('quá 20 viên/ngày thì không được cộng thêm');
  if (!out.tranNgay.chan) err('chạm trần trong ngày phải báo cho người đọc biết');

  /* =====================================================================
     5. đủ mốc → câu “Nhà đã xây xong”
     ===================================================================== */
  const need = 5000 - seedN;        /* tổng = 5.000 → mốc kế tiếp 10.000 */
  win.localStorage.setItem('ssochuz-brick-' + RUN, JSON.stringify({ n: need, day: today(), today: 1, at: 0 }));
  click(win, send);
  await wait(60);
  out.duMoc = {
    tong: box.querySelector('[data-bk-total]').textContent,
    moc: box.querySelector('[data-bk-goal]').textContent,
    khauHieu: box.querySelector('[data-bk-motto]').textContent,
    ariaMax: box.querySelector('[data-bk-bar]').getAttribute('aria-valuemax')
  };
  if (!/Nhà đã xây xong/.test(out.duMoc.khauHieu)) err('đủ mốc 5.000 phải đổi câu “Nhà đã xây xong — giờ đòi chương mới!”');
  if (out.duMoc.ariaMax !== '10000') err('qua mốc 5.000 phải tự mở mốc kế tiếp (aria-valuemax = 10000)');
  win.CZ.sfx = realSfx;

  /* =====================================================================
     1b. tắt/mở được ở Cài đặt đọc (mọi thứ ảnh hưởng trải nghiệm đều có công tắc)
     ===================================================================== */
  click(win, $('#rdSet'));
  await wait(80);
  const offB = $('#setBody [data-set="brick"][data-v="0"]');
  if (!offB) err('Cài đặt đọc thiếu công tắc tắt hộp góp gạch');
  else {
    click(win, offB);
    await wait(80);
    out.tatTrongCaiDat = { an: box.hidden, rong: !box.innerHTML.trim(), luuMay: win.CZ.rdGet().brick };
    if (!out.tatTrongCaiDat.an || !out.tatTrongCaiDat.rong) err('tắt hộp gạch trong Cài đặt đọc phải ẩn và dọn hộp');
    if (String(out.tatTrongCaiDat.luuMay) !== '0') err('lựa chọn tắt hộp gạch phải nhớ trong ssochuz-reader');
    const onB = $('#setBody [data-set="brick"][data-v="1"]');
    if (onB) click(win, onB);
    await wait(90);
    out.moLai = { hien: !box.hidden, coNut: !!box.querySelector('#bkSend') };
    if (!out.moLai.hien || !out.moLai.coNut) err('bật lại hộp gạch phải dựng lại ngay, không cần tải trang');
  }
  const closeSheet = $('#setSheet');
  if (closeSheet) { click(win, closeSheet); await wait(150); }

  /* =====================================================================
     1. truyện ĐÃ HOÀN THÀNH: không có hộp gạch
     ===================================================================== */
  const p2 = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + DONE + '/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null, null), log: [] })
  });
  await wait(1700);
  const box2 = p2.doc.querySelector('#storyBrick');
  out.truyenHoanThanh = { coKhoi: !!box2, an: !!(box2 && box2.hidden), rong: !!(box2 && !box2.innerHTML.trim()) };
  if (box2 && !box2.hidden) err('truyện đã hoàn thành KHÔNG được hiện hộp góp gạch');
  if (box2 && box2.innerHTML.trim()) err('truyện đã hoàn thành nên để hộp gạch trống, không dựng nội dung');

  /* =====================================================================
     7. máy chủ: chưa cắm thì tuyệt đối không gọi /api/brick; cắm rồi thì gọi
     ===================================================================== */
  const calls = [];
  const p3 = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + RUN + '/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null, calls), log: [] })
  });
  await wait(1500);
  out.khongGoiApi = !calls.some(c => /\/api\/brick/.test(c.url));
  if (!out.khongGoiApi) err('chưa cắm CZ_BRICK_API thì không được gọi /api/brick');

  const calls2 = [];
  const p4 = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + RUN + '/',
    config: { CZ_API: BASE, CZ_BRICK_API: BASE + '/api/brick' },
    fetch: dataFetch({ apiBase: BASE, api: makeApi(null, calls2), log: [] })
  });
  await wait(1500);
  const send4 = p4.doc.querySelector('#bkSend');
  if (send4) click(p4.win, send4);
  await wait(120);
  const post = calls2.filter(c => c.opt && c.opt.method === 'POST' && /\/api\/brick/.test(c.url));
  out.khiCoApi = {
    goiGet: calls2.some(c => /\/api\/brick/.test(c.url)),
    soLanPost: post.length,
    than: post.length ? JSON.parse(post[0].opt.body) : null
  };
  if (!out.khiCoApi.goiGet) err('cắm CZ_BRICK_API phải lấy số gạch thật từ máy chủ (GET /api/brick)');
  if (!out.khiCoApi.soLanPost) err('cắm CZ_BRICK_API phải gửi viên gạch lên máy chủ (POST /api/brick)');
  const b = out.khiCoApi.than || {};
  if (b.story_id !== RUN || b.brick_count !== 1 || !b.user_or_device_id || !b.last_brick_at) {
    err('thân request phải có story_id, brick_count, user_or_device_id, last_brick_at');
  }

  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
