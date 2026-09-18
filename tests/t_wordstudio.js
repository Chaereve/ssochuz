/* ============================================================================
   Kiểm thử PHÒNG SOẠN KIỂU WORD (Word Studio) trong trang quản trị
   - ribbon đủ 5 nhóm + nút/data-attr, bấm không lỗi dù jsdom thiếu execCommand
   - cỡ chữ bọc <span>, giãn dòng đặt lên đoạn, chèn bảng, hộp link đóng/mở
   - tìm & thay thế trong chương: đánh dấu, đếm, thay 1 chỗ / tất cả
   - thu/phóng, lọc chương, qua lại chương có giữ chữ, xuất file, dán từ Word
   - thu/mở sidebar, nút thao tác nhanh, tiêu đề theo tab, ảnh bìa thư viện
   ========================================================================== */
const { page, dataFetch } = require('./mk');

const BASE = 'https://cms.test';
const KEY = 'khoa-quan-tri-dai-cho-du-24-ky-tu';
const sleep0 = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));

const fsSync = require('fs');
const disk = (rel) => JSON.parse(fsSync.readFileSync(__dirname + '/../data/' + rel, 'utf8'));
function api(path, opt) {
  opt = opt || {};
  const h = opt.headers || {};
  const auth = h['x-admin-key'] === KEY;
  const ret = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200,
    json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
  if (path === '/api/health') return ret({ ok: true, version: '9.9', kv: true, books: 1, novels: 1,
    regRev: 'x', auth: { supabase: true, session: true } });
  if (path === '/api/whoami') return auth ? ret({ ok: true, admin: true, via: 'key' })
    : ret({ ok: false, error: 'sai key' }, false, 401);
  if (path === '/api/registry') return ret(disk('registry.json'));
  const mb = path.match(/^\/api\/book\/([\w.\-]+)$/);
  if (mb) {
    if (!auth) return ret({ ok: false, error: 'sai key' }, false, 401);
    if ((opt.method || 'GET') !== 'GET') return ret({ ok: true });
    try { return ret(disk('book/' + mb[1] + '.json')); } catch (e) { return ret({ ok: false }, false, 404); }
  }
  return undefined;
}

(async () => {
  const out = {};
  const p = page('admin.html', { fetch: dataFetch({ api, apiBase: BASE }) });
  const doc = p.doc, win = p.win;
  const $ = (s) => doc.querySelector(s), $$ = (s) => [...doc.querySelectorAll(s)];
  const click = (s) => { const e = typeof s === 'string' ? $(s) : s;
    if (!e) return 'MISSING ' + s;
    e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
  const change = (s, v) => { const e = $(s); if (!e) return 'MISSING ' + s;
    e.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true })); /* như bấm thật: lưu vùng chọn trước */
    e.value = v; e.dispatchEvent(new win.Event('change', { bubbles: true })); return 'ok'; };
  const input = (s, v) => { const e = $(s); if (!e) return 'MISSING ' + s;
    e.value = v; e.dispatchEvent(new win.Event('input', { bubbles: true })); return 'ok'; };
  await wait(350);
  doc.querySelector('#inApi').value = BASE;
  doc.querySelector('#inKey').value = KEY;
  click('#btnConnect');
  await wait(900);

  /* ---------- 1. khung + ribbon ---------- */
  const groups = $$('.wgroup .wcap').map(e => e.textContent.trim());
  out.khung = {
    authed: doc.querySelector('#ashell').classList.contains('authed'),
    nhomRibbon: groups.join('|'),
    du5Nhom: groups.length === 5,
    coTrangGiay: !!doc.querySelector('#wPage #edBody'),
    coTrangThai: !!doc.querySelector('#chStat') && !!doc.querySelector('#edZoomVal'),
    nutUndo: !!doc.querySelector('#edToolbar [data-cmd="undo"]'),
    nutBang: !!doc.querySelector('#edToolbar [data-table]'),
    nutThayThe: !!doc.querySelector('#edToolbar [data-replace]'),
    nutToanManHinh: !!doc.querySelector('#edToolbar [data-full]')
  };
  /* tiêu đề + thao tác nhanh theo tab */
  click('[data-goto="list"]'); await wait(120);
  out.khung.tieuDeTab = doc.querySelector('.smain .phead h1').textContent;
  out.khung.anhBiaBang = $$('#tb .cellth').length > 0;
  click('[data-goto="overview"]'); await wait(120);

  /* ---------- 2. mở bộ + chương ---------- */
  click('[data-goto="list"]'); await wait(150);
  click(doc.querySelector('#tb [data-edit="third-person"]'));
  await wait(800);
  click($$('#chList .row2')[0]);
  await wait(250);
  const ed = $('#edBody');
  out.chuong = {
    moDuoc: !!ed && CH_OK(),
    demChu: String($('#chStat').textContent || ''),
    meta: String($('#chMeta').textContent || ''),
    nutTruocTat: !!$('#chPrev').disabled
  };
  function CH_OK() { return doc.querySelectorAll('#chList .row2').length > 0; }

  /* ---------- 3. bấm hết nút ribbon (không được lỗi) ---------- */
  ed.innerHTML = '<p>Con mèo mun rượt con chuột nhắt trong đêm mưa phùn.</p><p>Đoạn thứ hai có chữ mèo nữa.</p>';
  ed.dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(120);
  const sel = win.getSelection();
  sel.removeAllRanges();
  const r0 = doc.createRange();
  r0.selectNodeContents(ed.querySelector('p'));
  sel.addRange(r0);
  const ribbonBtns = $$('#edToolbar button');
  let clicked = 0;
  for (const b of ribbonBtns) {
    if (b.disabled) continue;
    if (b.dataset.img !== undefined) continue;   /* mở hộp chọn file — bỏ qua trong jsdom */
    b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    clicked++;
    await wait(15);
  }
  /* đóng các hộp đã mở + trả các chế độ xem về tắt để các mục sau đo từ trạng thái sạch */
  click('#edFindX'); click('#edLinkX');
  if (ed.classList.contains('show-marks')) click('#edToolbar [data-marks]');
  if ($('#wPage').classList.contains('preview')) click('#edToolbar [data-preview]');
  if ($('#wdoc').classList.contains('focus')) click('#edToolbar [data-focus]');
  if ($('#wdoc').classList.contains('full')) click('#edToolbar [data-full]');
  if ($('#edToolbar [data-pastetxt]').classList.contains('on')) click('#edToolbar [data-pastetxt]');
  await wait(120);
  out.ribbon = { soNut: ribbonBtns.length, daBam: clicked,
    loiSauKhiBam: p.errors.slice(0, 3) };

  /* ---------- 4. cỡ chữ / giãn dòng / bảng ---------- */
  ed.innerHTML = '<p>Chữ cần phóng to cho dễ đọc.</p>';
  sel.removeAllRanges();
  const r1 = doc.createRange();
  r1.selectNodeContents(ed.querySelector('p'));
  sel.addRange(r1);
  change('#edSize', '24');
  await wait(120);
  out.coChu = { bocSpan: ed.innerHTML.indexOf('font-size: 24px') >= 0 || ed.innerHTML.indexOf('font-size:24px') >= 0 };
  change('#edLine', '2.2');
  await wait(120);
  out.coChu.gianDong = ed.innerHTML.indexOf('line-height') >= 0;
  change('#edFont', 'Arial,Helvetica,sans-serif');
  await wait(120);
  click('#edToolbar [data-table]');
  await wait(120);
  out.coChu.coBang = !!ed.querySelector('table.edtable');

  /* ---------- 5. hộp link ---------- */
  click('#edToolbar [data-link]');
  await wait(150);
  const popHien = !$('#edLinkPop').classList.contains('hide');
  input('#edLinkUrl', 'example.com/truyen');
  click('#edLinkOk');
  await wait(120);
  out.link = { moDuoc: popHien, dongSauKhiChen: $('#edLinkPop').classList.contains('hide') };

  /* ---------- 6. tìm & thay thế ---------- */
  ed.innerHTML = '<p>Mèo mun rượt chuột. Mèo kêu meo meo. Chuột chũi chạy.</p>';
  ed.dispatchEvent(new win.Event('input', { bubbles: true }));
  click('#edToolbar [data-find]');
  await wait(150);
  out.tim = { moDuoc: !$('#edFindBar').classList.contains('hide') };
  input('#edFindQ', 'mèo');
  await wait(400);
  out.tim.soVet = $$('#edBody mark.ed-hit').length;
  out.tim.dem = String($('#edFindCt').textContent || '');
  click('#edFindNext'); await wait(100);
  out.tim.sauKhiTiep = String($('#edFindCt').textContent || '');
  input('#edRepQ', 'MÈO');
  click('#edRepAll'); await wait(150);
  out.tim.sauKhiThay = ed.textContent;
  out.tim.hetVet = $$('#edBody mark.ed-hit').length === 0;
  click('#edFindX'); await wait(100);

  /* ---------- 7. thu/phóng + chế độ xem ---------- */
  click('#edZoomIn'); click('#edZoomIn'); await wait(80);
  out.xem = { phong120: $('#edZoomVal').textContent };
  click('#edZoomVal'); await wait(80);
  out.xem.ve100 = $('#edZoomVal').textContent;
  click('#edToolbar [data-marks]'); await wait(60);
  out.xem.kyHieu = ed.classList.contains('show-marks');
  click('#edToolbar [data-marks]'); await wait(60);
  click('#edToolbar [data-preview]'); await wait(60);
  out.xem.xemThu = $('#wPage').classList.contains('preview');
  click('#edToolbar [data-preview]'); await wait(60);
  click('#edToolbar [data-focus]'); await wait(60);
  out.xem.tapTrung = $('#wdoc').classList.contains('focus');
  click('#edToolbar [data-focus]'); await wait(60);
  click('#edToolbar [data-full]'); await wait(80);
  out.xem.toanManHinh = $('#wdoc').classList.contains('full');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(80);
  out.xem.escThoat = !$('#wdoc').classList.contains('full');

  /* ---------- 8. lọc + qua lại chương (giữ chữ) ---------- */
  const tongChuong = $$('#chList .row2').length;
  input('#chListQ', 'zzz-khong-co-chuong-nao');
  await wait(150);
  out.dsChuong = { tong: tongChuong, locRong: $$('#chList .row2[data-i]').length };
  input('#chListQ', '');
  await wait(150);
  out.dsChuong.boLoc = $$('#chList .row2').length;
  click($$('#chList .row2')[0]); await wait(200);
  ed.innerHTML = '<p>Chữ gõ dở ở chương 1.</p>';
  ed.dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(100);
  click('#chNext'); await wait(250);
  out.dsChuong.quaChuong2 = String($('#chMeta').textContent || '');
  click('#chPrev'); await wait(250);
  out.dsChuong.giuChu = ed.innerHTML.indexOf('Chữ gõ dở') >= 0;
  out.dsChuong.tuLuu = String($('#edSaved').textContent || '').length > 0;

  /* ---------- 9. dán từ Word + xuất file ---------- */
  const dt = { getData: (t) => t === 'text/html'
    ? '<p class="MsoNormal" style="mso-margin:1pt"><b>Chữ Word</b><o:p></o:p></p><!--x-->'
    : 'Chữ Word' };
  const pev = new win.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pev, 'clipboardData', { value: dt });
  ed.dispatchEvent(pev);
  await wait(150);
  out.dan = { sachMso: ed.innerHTML.indexOf('Mso') < 0 && ed.innerHTML.indexOf('Chữ Word') >= 0 };
  click('#edToolbar [data-pastetxt]'); await wait(60);
  out.dan.batDanChu = !!doc.querySelector('#edToolbar [data-pastetxt].on');
  click('#edToolbar [data-pastetxt]'); await wait(60);
  click('#edToolbar [data-exp="txt"]'); await wait(120);
  click('#edToolbar [data-exp="html"]'); await wait(120);
  out.xuat = { khongLoi: true };

  /* ---------- 9b. dai mau + dinh top ---------- */
  input('#edColor', '#ff0000');
  doc.querySelector('#edColor').dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(80);
  out.mau = {
    daiDoiMau: String(doc.querySelector('#edColorSw').style.background || '').length > 0,
    ribbonDinhTop: doc.querySelector('#edToolbar').style.top
  };

  /* ---------- 10. sidebar thu gọn ---------- */
  click('#navToggle'); await wait(80);
  out.nav = { thuDuoc: $('#ashell').classList.contains('nav-min') };
  click('#navToggle'); await wait(80);
  out.nav.moLai = !$('#ashell').classList.contains('nav-min');

  out.errors = p.errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  const hard = [];
  if (!out.khung.authed) hard.push('chưa vào được app');
  if (!out.khung.du5Nhom) hard.push('ribbon thiếu nhóm: ' + out.khung.nhomRibbon);
  if (!out.khung.coTrangGiay || !out.khung.coTrangThai) hard.push('thiếu trang giấy / thanh trạng thái');
  if (out.khung.tieuDeTab !== 'Thư viện') hard.push('tiêu đề tab chưa đổi: ' + out.khung.tieuDeTab);
  if (!out.khung.anhBiaBang) hard.push('bảng thư viện thiếu ảnh bìa');
  if (!out.chuong.moDuoc) hard.push('không mở được chương');
  if (!/từ/.test(out.chuong.demChu) || !/ký tự/.test(out.chuong.demChu)) hard.push('đếm chữ sai: ' + out.chuong.demChu);
  if (!out.chuong.meta) hard.push('thiếu nhãn Chương n/N');
  if (!out.coChu.bocSpan) hard.push('cỡ chữ không bọc span');
  if (!out.coChu.gianDong) hard.push('giãn dòng không đặt lên đoạn');
  if (!out.coChu.coBang) hard.push('không chèn được bảng');
  if (!out.link.moDuoc || !out.link.dongSauKhiChen) hard.push('hộp link lỗi');
  if (!out.tim.moDuoc) hard.push('không mở được thanh tìm');
  if (out.tim.soVet !== 2) hard.push('đánh dấu sai, cần 2 vệt: ' + out.tim.soVet);
  if (!/1\/2/.test(out.tim.dem)) hard.push('đếm tìm sai: ' + out.tim.dem);
  if (!/2\/2/.test(out.tim.sauKhiTiep)) hard.push('đi tiếp sai: ' + out.tim.sauKhiTiep);
  if (!out.tim.hetVet || out.tim.sauKhiThay.indexOf('MÈO') < 0) hard.push('thay tất cả sai');
  if (out.xem.phong120 !== '120%') hard.push('phóng sai: ' + out.xem.phong120);
  if (out.xem.ve100 !== '100%') hard.push('về 100% sai');
  if (!out.xem.kyHieu || !out.xem.xemThu || !out.xem.tapTrung) hard.push('chế độ xem lỗi');
  if (!out.xem.toanManHinh || !out.xem.escThoat) hard.push('toàn màn hình / Esc lỗi');
  if (out.dsChuong.locRong !== 0) hard.push('lọc chương sai');
  if (out.dsChuong.boLoc !== out.dsChuong.tong) hard.push('bỏ lọc sai');
  if (!/Chương 2/.test(out.dsChuong.quaChuong2)) hard.push('nút chương sau sai: ' + out.dsChuong.quaChuong2);
  if (!out.dsChuong.giuChu) hard.push('qua chương mất chữ đang gõ');
  if (!out.dan.sachMso) hard.push('dán Word chưa sạch');
  if (!out.dan.batDanChu) hard.push('nút dán chữ không bật');
  if (!out.nav.thuDuoc || !out.nav.moLai) hard.push('thu/mở sidebar lỗi');
  if (!out.mau.daiDoiMau) hard.push('dải màu không đổi theo màu đã chọn');
  if (!/\d+px/.test(out.mau.ribbonDinhTop)) hard.push('ribbon chưa dính top theo thanh trên: ' + out.mau.ribbonDinhTop);
  if (out.errors.length) hard.push('có lỗi JS: ' + out.errors.join(' | '));
  if (hard.length) { console.log('TRẮNG: ' + hard.join(' · ')); process.exit(1); }
  console.log('Đen: phòng soạn Word hoạt động đúng.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
