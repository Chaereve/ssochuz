/* ============================================================================
   t_autosave.js · TỰ LƯU CHƯƠNG ĐANG VIẾT VÀO MÁY (IndexedDB)
   ----------------------------------------------------------------------------
   Đây là lưới an toàn chống mất bài khi đóng nhầm tab / mất điện. Bài kiểm thử
   chạy trên IndexedDB thật (fake-indexeddb cài đặt đúng chuẩn W3C) chứ không
   giả lập bằng Map, vì phần dễ sai nằm ở giao dịch và khoá chính.

   Kiểm:
     1. ghi/đọc/xoá một chương;
     2. mỗi chương một bản ghi riêng — không đè nhau (đây là lý do dùng
        IndexedDB thay cho nháp localStorage cũ: 62 bộ = 26 MB, vượt hạn mức
        ~5 MB của localStorage);
     3. bộ hẹn giờ gộp nhiều lần gõ thành MỘT lần ghi sau 2 giây;
     4. gõ liên tục vẫn bị ép ghi, không trì hoãn vô hạn;
     5. ghiNgay() lúc đóng tab;
     6. dọn nháp quá hạn;
     7. KHÔNG được lưu ADMIN_KEY.

   Chạy:  node tests/t_autosave.js
   ========================================================================== */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errs = [];
const out = {};

/* IndexedDB thật cho Node */
require(path.join(ROOT, 'tests', 'node_modules', 'fake-indexeddb', 'auto'));

const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
const built = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/admin/editor/autosave.js')],
  bundle: true, write: false, format: 'cjs', target: ['node18'],
  platform: 'node', absWorkingDir: ROOT,
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', 'require', 'indexedDB', built)(
  mod, mod.exports, require, global.indexedDB);
const AS = mod.exports;

const cho = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* --- 1. ghi / đọc / xoá ------------------------------------------------ */
  await AS.luu('bo-thu-nghiem', 0, 'Chương 1', '<p>Nội dung đang viết dở</p>');
  const d1 = await AS.doc('bo-thu-nghiem', 0);
  out.ghiRoiDoc = d1 && { title: d1.title, html: d1.html, coMocGio: !!d1.at };
  if (!d1) errs.push('ghi xong đọc lại không thấy');
  else {
    if (d1.html !== '<p>Nội dung đang viết dở</p>') errs.push('nội dung đọc ra sai: ' + d1.html);
    if (d1.title !== 'Chương 1') errs.push('tiêu đề đọc ra sai: ' + d1.title);
    if (!d1.at) errs.push('thiếu mốc thời gian');
  }

  /* --- 2. mỗi chương một bản ghi, không đè nhau -------------------------- */
  await AS.luu('bo-thu-nghiem', 1, 'Chương 2', '<p>Chương hai</p>');
  await AS.luu('bo-khac', 0, 'Chương 1', '<p>Bộ khác</p>');
  const a = await AS.doc('bo-thu-nghiem', 0);
  const b = await AS.doc('bo-thu-nghiem', 1);
  const c = await AS.doc('bo-khac', 0);
  out.khongDeNhau = { c1: a.html, c2: b.html, boKhac: c.html };
  if (a.html === b.html) errs.push('hai chương cùng bộ đè lên nhau');
  if (c.html !== '<p>Bộ khác</p>') errs.push('hai bộ khác nhau đè lên nhau');

  /* xoá một chương không được đụng chương khác */
  await AS.xoa('bo-thu-nghiem', 0);
  out.sauKhiXoa = { daXoa: await AS.doc('bo-thu-nghiem', 0), conLai: !!(await AS.doc('bo-thu-nghiem', 1)) };
  if (await AS.doc('bo-thu-nghiem', 0)) errs.push('xoá rồi vẫn còn');
  if (!(await AS.doc('bo-thu-nghiem', 1))) errs.push('xoá chương 1 làm mất luôn chương 2');

  /* --- 3. gộp nhiều lần gõ thành MỘT lần ghi ----------------------------- */
  let soLanGhi = 0;
  const bo = AS.taoBoLuu({ tre: 60, epSau: 100000, onLuu: () => { soLanGhi++; } });
  for (let i = 0; i < 12; i++) { bo.dat('bo-gõ', 0, 'T', '<p>ký tự ' + i + '</p>'); await cho(5); }
  await cho(160);
  out.gopLanGo = { soLanGoPhim: 12, soLanGhiThat: soLanGhi };
  if (soLanGhi !== 1) errs.push('gõ 12 lần phải ghi ĐÚNG 1 lần, thực tế ' + soLanGhi);
  const cuoi = await AS.doc('bo-gõ', 0);
  if (!cuoi || !/ký tự 11/.test(cuoi.html)) errs.push('không ghi lần gõ CUỐI: ' + (cuoi && cuoi.html));

  /* --- 4. gõ liên tục vẫn bị ép ghi -------------------------------------- */
  let epGhi = 0;
  const bo2 = AS.taoBoLuu({ tre: 50, epSau: 120, onLuu: () => { epGhi++; } });
  const t0 = Date.now();
  while (Date.now() - t0 < 260) { bo2.dat('bo-lien-tuc', 0, 'T', '<p>x</p>'); await cho(10); }
  await cho(80);
  out.epGhiKhiGoLienTuc = epGhi;
  if (epGhi < 1) errs.push('gõ liên tục 260ms mà chưa lần nào bị ép ghi');

  /* --- 5. ghiNgay(): đóng tab giữa chừng --------------------------------- */
  const bo3 = AS.taoBoLuu({ tre: 100000 });   /* hẹn giờ rất lâu */
  bo3.dat('bo-dong-tab', 0, 'T', '<p>Chữ vừa gõ xong thì đóng tab</p>');
  out.conChoTruocKhiDong = bo3.dangCho();
  await bo3.ghiNgay();
  const d5 = await AS.doc('bo-dong-tab', 0);
  out.ghiNgayKhiDongTab = d5 && d5.html;
  if (!d5 || !/đóng tab/.test(d5.html)) errs.push('ghiNgay() không cứu được chữ khi đóng tab');

  /* huỷ thì KHÔNG được ghi (đã bấm Lưu rồi) */
  const bo4 = AS.taoBoLuu({ tre: 40 });
  bo4.dat('bo-huy', 0, 'T', '<p>không nên ghi</p>');
  bo4.huy();
  await cho(90);
  out.huyThiKhongGhi = !(await AS.doc('bo-huy', 0));
  if (await AS.doc('bo-huy', 0)) errs.push('đã huỷ mà vẫn ghi');

  /* --- 6. dọn nháp quá hạn ----------------------------------------------- */
  await AS.luu('bo-cu', 0, 'T', '<p>cũ</p>');
  /* lùi mốc thời gian 30 ngày */
  const db = await new Promise((res) => { const r = indexedDB.open('ssochuz-admin', 1); r.onsuccess = () => res(r.result); });
  await new Promise((res) => {
    const gd = db.transaction('nhap-chuong', 'readwrite');
    const kho = gd.objectStore('nhap-chuong');
    const g = kho.get('bo-cu#0');
    g.onsuccess = () => { const v = g.result; v.at = Date.now() - 30 * 86400000; kho.put(v); };
    gd.oncomplete = res;
  });
  const daDon = await AS.don(7);
  out.donNhapQuaHan = { soBanDon: daDon, conBoCu: !!(await AS.doc('bo-cu', 0)), conBoMoi: !!(await AS.doc('bo-dong-tab', 0)) };
  if (await AS.doc('bo-cu', 0)) errs.push('nháp 30 ngày tuổi không bị dọn');
  if (!(await AS.doc('bo-dong-tab', 0))) errs.push('dọn nhầm cả nháp còn mới');

  /* --- 7. tuyệt đối không lưu khoá quản trị ------------------------------ */
  const tatCa = await AS.tatCa();
  const chuoi = JSON.stringify(tatCa);
  out.soBanGhiConLai = tatCa.length;
  out.truongTrongBanGhi = Object.keys(tatCa[0] || {}).sort().join(',');
  if (/adminKey|admin_key|ADMIN_KEY|cz_kv_key/i.test(chuoi)) errs.push('có dấu vết khoá quản trị trong nháp');
  const choPhep = ['ma', 'slug', 'idx', 'title', 'html', 'at'].sort().join(',');
  if (tatCa[0] && Object.keys(tatCa[0]).sort().join(',') !== choPhep) {
    errs.push('bản ghi có trường lạ: ' + Object.keys(tatCa[0]).sort().join(','));
  }

  console.log(JSON.stringify(out, null, 2));
  if (errs.length) {
    console.error('\nLỖI:\n - ' + errs.join('\n - '));
    process.exit(1);
  }
  console.log('\nĐạt: tự lưu ghi đúng chương, gộp lần gõ, cứu được lúc đóng tab, không lưu khoá');
})().catch((e) => { console.error('LỖI CHẠY BÀI:', e && e.stack || e); process.exit(1); });
