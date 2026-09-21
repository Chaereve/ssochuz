/* ============================================================================
   t_editor_slash.js · MENU GÕ "/" TRONG TRÌNH SOẠN CHƯƠNG
   ----------------------------------------------------------------------------
   Kiểm hai nhóm việc:

   A. LÚC NÀO MENU ĐƯỢC PHÉP MỞ. Đây mới là phần dễ sai. Người viết truyện gõ
      "/" khá thường: "và/hoặc", "10/10", đường dẫn "a/b". Nếu menu bật lên mỗi
      lần như vậy thì trình soạn thành phiền. Quy ước: chỉ mở khi "/" đứng ở
      ĐẦU DÒNG hoặc NGAY SAU KHOẢNG TRẮNG.

   B. LỌC VÀ CHÈN. Gõ không dấu ("tieu de") vẫn phải tìm ra "Tiêu đề lớn", và
      khi chọn thì chuỗi "/tu-khoa" phải BIẾN MẤT, không được nằm lại trong
      chương.

   Chạy:  node tests/t_editor_slash.js
   ========================================================================== */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errs = [];
const out = {};

const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
const { JSDOM } = require('jsdom');

/* --- 1. phần thuần logic: nạp thẳng slash.js ----------------------------- */
const pure = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/admin/editor/slash.js')],
  bundle: true, write: false, format: 'cjs', target: ['node18'],
  platform: 'node', absWorkingDir: ROOT,
}).outputFiles[0].text;
const pm = { exports: {} };
new Function('module', 'exports', 'require', pure)(pm, pm.exports, require);
const { loc, boDau, MUC } = pm.exports;

/* bỏ dấu để gõ nhanh */
out.boDau = { 'Tiêu đề': boDau('Tiêu đề'), 'Lời tác giả': boDau('Lời tác giả') };
if (boDau('Tiêu đề') !== 'tieu de') errs.push('bỏ dấu sai: ' + boDau('Tiêu đề'));
if (boDau('Đường') !== 'duong') errs.push('chữ Đ hoa bỏ dấu sai: ' + boDau('Đường'));

/* lọc: gõ không dấu vẫn ra đúng mục */
const tim = (q) => loc(q).map((m) => m.id);
out.loc = { 'tieu de': tim('tieu de'), 'trich': tim('trich'), 'anh': tim('anh'), 'xyz': tim('xyz') };
/* gõ "anh" phải RA ĐÚNG "Chèn ảnh" — không được dính "Danh sách" (chuỗi "anh"
   nằm giữa chữ "danh"): lỗi thật đã gặp, nay khớp theo đầu từ. */
if (tim('anh').join(',') !== 'img') errs.push('gõ "anh" ra dư mục: ' + tim('anh').join(','));
if (tim('tieu de').indexOf('h2') < 0) errs.push('gõ "tieu de" không ra Tiêu đề lớn');
if (tim('trich').indexOf('blockquote') < 0) errs.push('gõ "trich" không ra Trích dẫn');
if (tim('anh').indexOf('img') < 0) errs.push('gõ "anh" không ra Chèn ảnh');
if (tim('xyz').length !== 0) errs.push('gõ chuỗi vô nghĩa vẫn ra kết quả');
if (loc('').length !== MUC.length) errs.push('để trống phải hiện đủ danh mục');

/* --- 2. dựng trình soạn thật trong jsdom --------------------------------- */
const built = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/admin/editor/index.js')],
  bundle: true, write: false, format: 'cjs', target: ['es2019'],
  platform: 'browser', absWorkingDir: ROOT,
}).outputFiles[0].text;

const dom = new JSDOM('<!doctype html><body><div id="edBody" class="rte"></div></body>',
  { url: 'https://ssochuz.pages.dev/', pretendToBeVisual: true });
const win = dom.window;
global.window = win; global.document = win.document; global.navigator = win.navigator;
for (const k of ['Node', 'Element', 'HTMLElement', 'DocumentFragment', 'Range', 'Event',
  'MutationObserver', 'DOMParser', 'getComputedStyle', 'KeyboardEvent', 'MouseEvent']) global[k] = win[k];
win.requestAnimationFrame = global.requestAnimationFrame = () => 0;
win.cancelAnimationFrame = global.cancelAnimationFrame = () => {};
win.HTMLElement.prototype.scrollIntoView = function () {};

const mod = { exports: {} };
new Function('module', 'exports', 'window', 'document', 'navigator', built)(
  mod, mod.exports, win, win.document, win.navigator);
const ED = mod.exports;

let moAnh = 0;
ED.mountEditor(win.document.getElementById('edBody'), { onImage: () => { moAnh++; } });
const editor = ED.getEditor();
if (!editor) { console.error('không gắn được trình soạn'); process.exit(1); }

const box = () => win.document.querySelector('.rte-slash');
const dangMo = () => { const b = box(); return !!b && !b.classList.contains('hide'); };
/* gõ một chuỗi vào trình soạn rồi bắn keydown "/" đúng như trình duyệt làm */
function phim(k) {
  return editor.view.someProp('handleKeyDown', (f) => f(editor.view, new win.KeyboardEvent('keydown', { key: k })));
}
/* Gõ như người thật: mỗi ký tự vừa chèn vào tài liệu vừa bắn keydown, vì plugin
   mở/cập nhật menu trong handleKeyDown. Gõ cả chuỗi rồi bắn một phím là sai —
   đó chính là chỗ bài kiểm thử bản nháp đã đo nhầm. */
function goChuoi(text) {
  for (const c of text) { phim(c); editor.commands.insertContent(c); }
}
function go(text) {
  editor.commands.setContent('<p></p>', false);
  editor.commands.focus();
  goChuoi(text);
}
const cho = () => new Promise((r) => setTimeout(r, 5));

(async () => {
  /* --- A. lúc nào được mở --------------------------------------------- */
  const canhMo = [
    ['đầu dòng', '/', true],
    ['sau khoảng trắng', 'Chào bạn /', true],
    ['dính vào chữ', 'và/', false],
    ['giữa số', '10/', false],
    ['đường dẫn', 'thu-muc/a/', false],
  ];
  out.khiNaoMo = {};
  for (const [ten, text, phaiMo] of canhMo) {
    go(text);
    await cho();
    const m = dangMo();
    out.khiNaoMo[ten] = m;
    if (m !== phaiMo) errs.push('"' + text + '" → menu ' + (m ? 'MỞ' : 'đóng') + ', đáng lẽ ' + (phaiMo ? 'MỞ' : 'đóng'));
    editor.commands.setContent('<p></p>', false);
  }

  /* --- B. Esc phải đóng ------------------------------------------------ */
  go('/');
  await cho();
  out.moTruocEsc = dangMo();
  if (!dangMo()) errs.push('gõ "/" không mở được menu');
  phim('Escape');
  out.escDong = !dangMo();
  if (dangMo()) errs.push('Esc không đóng được menu');

  /* --- C. chọn mục thì "/tu-khoa" phải biến mất ------------------------ */
  go('/');
  await cho();
  phim('Enter');
  await cho();
  /* Chèn thêm chữ rồi mới đo: khối rỗng bị normalizeChapterHtml bỏ đi (đúng),
     nên phải có nội dung thì mới thấy được thẻ. */
  editor.commands.insertContent('Tên cảnh');
  const sauChon = ED.getChapterHtml('');
  out.chonMucDau = sauChon;
  /* Đo trên CHỮ, không đo trên HTML: thẻ đóng "</h2>" cũng chứa dấu "/". */
  if (/\//.test(editor.getText())) errs.push('còn sót dấu "/" trong chữ: ' + editor.getText());
  if (!/<h2/.test(sauChon)) errs.push('chọn mục đầu (Tiêu đề lớn) nhưng không thành h2: ' + sauChon);

  /* --- D. gõ lọc rồi chọn: "/trich" → blockquote ----------------------- */
  go('/trich');
  await cho();
  out.moKhiDangLoc = dangMo();
  if (!dangMo()) errs.push('gõ "/trich" mà menu không mở');
  phim('Enter');
  await cho();
  editor.commands.insertContent('Lời của nhân vật');
  const raTrich = ED.getChapterHtml('');
  out.locRoiChon = raTrich;
  if (/trich|\//.test(editor.getText())) errs.push('chuỗi lọc còn sót lại trong chữ: ' + editor.getText());
  if (!/<blockquote/.test(raTrich)) errs.push('"/trich" không cho ra trích dẫn: ' + raTrich);

  /* --- E. mục "Chèn ảnh" phải gọi ngược ra trang quản trị -------------- */
  go('/anh');
  await cho();
  phim('Enter');
  await cho();
  out.goiChenAnh = moAnh;
  if (moAnh !== 1) errs.push('mục "Chèn ảnh" không gọi onImage (số lần = ' + moAnh + ')');

  /* --- F. menu KHÔNG được lọt vào nội dung chương ----------------------- */
  editor.commands.setContent('<p>Chương bình thường.</p>', false);
  const html = ED.getChapterHtml('');
  out.khongLotNoiDung = html;
  if (/rte-slash/.test(html)) errs.push('DOM của menu lọt vào nội dung chương: ' + html);

  /* --- G. khi menu ĐÓNG thì phím trả về bình thường --------------------- */
  editor.commands.setContent('<p></p>', false);
  editor.commands.focus();
  /* someProp trả về giá trị của handler ĐẦU TIÊN khác undefined; các plugin
     khác của TipTap (danh sách, gõ tắt…) cũng nhận Enter nên someProp có thể
     true vì lý do khác. Ta chỉ cần khẳng định: menu KHÔNG mở và plugin của ta
     không giữ trạng thái nào. */
  phim('Enter');
  out.dongThiKhongNuotPhim = !dangMo();
  if (dangMo()) errs.push('menu tự mở khi không gõ "/"');

  console.log(JSON.stringify(out, null, 2));
  if (errs.length) {
    console.error('\nLỖI:\n - ' + errs.join('\n - '));
    process.exit(1);
  }
  console.log('\nĐạt: menu "/" mở đúng lúc, lọc được tiếng Việt không dấu, chèn sạch');
})();
