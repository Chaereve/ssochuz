/* ============================================================================
   t_editor_bubble.js · THANH ĐỊNH DẠNG NỔI KHI BÔI ĐEN CHỮ
   ----------------------------------------------------------------------------
   Phần dễ sai của một bubble menu KHÔNG phải là vẽ cái hộp, mà là:

     · hiện/ẩn đúng lúc — chỉ khi đang bôi đen CHỮ, không hiện khi con trỏ chỉ
       nhấp nháy (nếu không thì nó che chữ suốt lúc gõ);
     · bấm nút mà KHÔNG mất vùng bôi đen (mất là lệnh định dạng vô tác dụng —
       nên nút phải chặn mousedown);
     · nút sáng đúng trạng thái, để người viết biết đoạn đang đậm hay đang H2;
     · liên kết: bấm Huỷ thì không được đụng gì, để trống thì gỡ liên kết.

   Chạy:  node tests/t_editor_bubble.js
   ========================================================================== */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errs = [];
const out = {};

const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
const { JSDOM } = require('jsdom');

const built = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src/admin/editor/index.js')],
  bundle: true, write: false, format: 'cjs', target: ['es2019'],
  platform: 'browser', absWorkingDir: ROOT,
}).outputFiles[0].text;

/* jsdom KHÔNG có layout engine: getClientRects/coordsAtPos luôn ném lỗi khi
   ProseMirror cuộn tới con trỏ. Đó là giới hạn của môi trường kiểm thử, không
   phải lỗi sản phẩm (trình duyệt thật có layout). Nuốt riêng loại lỗi này để
   stderr còn sạch mà báo lỗi THẬT. */
const vc = new (require('jsdom').VirtualConsole)();
vc.on('jsdomError', (e) => {
  if (!/getClientRects|coordsAtPos|getBoundingClientRect/.test(String(e && e.message))) {
    console.error('jsdom:', e && e.message);
  }
});
const dom = new JSDOM('<!doctype html><body><div id="edBody" class="rte"></div></body>',
  { url: 'https://ssochuz.pages.dev/', pretendToBeVisual: true, virtualConsole: vc });
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

/* hoiLienKet giả lập: trả về giá trị ta đặt sẵn để kiểm từng nhánh */
let traLoiLienKet = null;
let soLanHoi = 0;
ED.mountEditor(win.document.getElementById('edBody'), {
  hoiLienKet: (cu) => { soLanHoi++; out.hrefCuKhiHoi = cu; return traLoiLienKet; },
});
const editor = ED.getEditor();
if (!editor) { console.error('không gắn được trình soạn'); process.exit(1); }

/* jsdom không có khái niệm focus thật cho ProseMirror → ép hasFocus() = true,
   vì ta đang kiểm LOGIC hiện/ẩn theo vùng chọn, không kiểm focus của trình duyệt. */
editor.view.hasFocus = () => true;

const thanh = () => win.document.querySelector('.rte-bubble');
const dangHien = () => { const b = thanh(); return !!b && !b.classList.contains('hide'); };
const nut = (id) => win.document.querySelector('.rte-bubble [data-id="' + id + '"]');
/* bấm đúng như trình duyệt: mousedown (thanh dùng mousedown để giữ vùng chọn) */
function bam(id) {
  const b = nut(id);
  if (!b) { errs.push('không có nút ' + id); return; }
  b.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}
function chon(from, to) {
  editor.commands.setTextSelection({ from, to });
  /* update() của plugin chạy khi view cập nhật; gọi thẳng cho chắc */
  editor.view.dispatch(editor.state.tr);
}

/* --- 1. hiện/ẩn đúng lúc -------------------------------------------------- */
editor.commands.setContent('<p>Một câu văn để thử.</p>', false);
chon(1, 1);                       /* con trỏ nháy, không bôi đen */
out.conTroNhay_hien = dangHien();
if (dangHien()) errs.push('con trỏ chỉ nhấp nháy mà thanh đã hiện (sẽ che chữ lúc gõ)');

chon(1, 4);                       /* bôi đen "Một" */
out.boiDenChu_hien = dangHien();
if (!dangHien()) errs.push('bôi đen chữ mà thanh không hiện');

/* Bôi đen vùng CHỈ có khoảng trắng thì không hiện.
   Lưu ý khi đọc số: TipTap gộp "A   B" thành "A B" (schema không giữ khoảng
   trắng thừa), nên phải chọn đúng ô trống giữa hai chữ — vị trí 2..3. Bản nháp
   bài này chọn 2..5, tức là đã trùm luôn chữ "B", nên hiện thanh là ĐÚNG. */
editor.commands.setContent('<p>A B</p>', false);
out.chuoiSauKhiChuanHoa = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ');
chon(2, 3);
out.vungChonLaKhoangTrang = JSON.stringify(editor.state.doc.textBetween(2, 3, ' '));
out.boiDenKhoangTrang_hien = dangHien();
if (dangHien()) errs.push('bôi đen toàn khoảng trắng mà vẫn hiện');

/* Esc phải ẩn */
editor.commands.setContent('<p>Một câu văn để thử.</p>', false);
chon(1, 4);
editor.view.someProp('handleKeyDown', (f) => f(editor.view, new win.KeyboardEvent('keydown', { key: 'Escape' })));
out.escAn = !dangHien();
if (dangHien()) errs.push('Esc không ẩn được thanh');

/* --- 2. bấm nút KHÔNG được làm mất vùng bôi đen -------------------------- */
editor.commands.setContent('<p>Một câu văn để thử.</p>', false);
chon(1, 4);
const b = nut('bold');
const ev = new win.MouseEvent('mousedown', { bubbles: true, cancelable: true });
b.dispatchEvent(ev);
out.chanMousedown = ev.defaultPrevented;
if (!ev.defaultPrevented) errs.push('nút không chặn mousedown → bấm là mất vùng bôi đen, lệnh vô tác dụng');
const selSauBam = editor.state.selection;
out.vungChonConNguyen = { from: selSauBam.from, to: selSauBam.to };
if (selSauBam.empty) errs.push('bấm nút xong vùng bôi đen biến mất');

/* --- 3. định dạng áp dụng đúng + nút sáng đúng --------------------------- */
out.sauKhiBamDam = ED.getChapterHtml('');
if (!/<strong>Một<\/strong>/.test(out.sauKhiBamDam)) errs.push('bấm Đậm không ra <strong>: ' + out.sauKhiBamDam);
if (!nut('bold').classList.contains('on')) errs.push('đang đậm mà nút B không sáng');
if (nut('italic').classList.contains('on')) errs.push('không nghiêng mà nút I lại sáng');

/* bấm lần nữa = bỏ đậm */
bam('bold');
out.bamLanNuaBoDam = ED.getChapterHtml('');
if (/<strong>/.test(out.bamLanNuaBoDam)) errs.push('bấm Đậm lần hai không bỏ được đậm');

/* --- 4. khối: H2 bật rồi bật lại thì về đoạn thường ---------------------- */
editor.commands.setContent('<p>Tên cảnh</p>', false);
chon(1, 5);
bam('h2');
out.batH2 = ED.getChapterHtml('');
if (!/<h2/.test(out.batH2)) errs.push('bấm H2 không thành tiêu đề: ' + out.batH2);
if (!nut('h2').classList.contains('on')) errs.push('đang là H2 mà nút H2 không sáng');
bam('h2');
out.tatH2 = ED.getChapterHtml('');
if (/<h2/.test(out.tatH2)) errs.push('bấm H2 lần hai không trả về đoạn thường: ' + out.tatH2);

/* --- 5. liên kết: huỷ / đặt / gỡ ---------------------------------------- */
editor.commands.setContent('<p>Đọc thêm tại đây</p>', false);
chon(1, 5);
soLanHoi = 0;
traLoiLienKet = null;                       /* người dùng bấm Huỷ */
bam('link');
out.huyLienKet = ED.getChapterHtml('');
if (/<a /.test(out.huyLienKet)) errs.push('bấm Huỷ mà vẫn tạo liên kết: ' + out.huyLienKet);
if (soLanHoi !== 1) errs.push('không gọi hộp hỏi liên kết');

traLoiLienKet = 'https://ssochuz.pages.dev';
bam('link');
out.datLienKet = ED.getChapterHtml('');
if (!/href="https:\/\/ssochuz\.pages\.dev"/.test(out.datLienKet)) errs.push('không đặt được liên kết: ' + out.datLienKet);

/* đang đứng trong liên kết thì hộp phải nhận được href cũ */
chon(2, 4);
traLoiLienKet = '';                          /* để trống = gỡ */
bam('link');
out.hrefCuTruyenVao = out.hrefCuKhiHoi;
if (out.hrefCuKhiHoi !== 'https://ssochuz.pages.dev') errs.push('không truyền href cũ vào hộp: ' + out.hrefCuKhiHoi);
out.goLienKet = ED.getChapterHtml('');
if (/<a /.test(out.goLienKet)) errs.push('để trống mà không gỡ được liên kết: ' + out.goLienKet);
if (!/Đọc thêm tại đây/.test(out.goLienKet)) errs.push('gỡ liên kết làm mất chữ: ' + out.goLienKet);

/* --- 6. liên kết nguy hiểm phải bị schema chặn --------------------------- */
editor.commands.setContent('<p>Bấm vào đây</p>', false);
chon(1, 4);
traLoiLienKet = 'javascript:alert(1)';
bam('link');
out.chanJavascript = ED.getChapterHtml('');
if (/javascript:/i.test(out.chanJavascript)) errs.push('LỌT liên kết javascript: ' + out.chanJavascript);

/* --- 7. DOM của thanh không được lọt vào nội dung chương ----------------- */
editor.commands.setContent('<p>Chương bình thường.</p>', false);
out.khongLotNoiDung = ED.getChapterHtml('');
if (/rte-bubble/.test(out.khongLotNoiDung)) errs.push('DOM thanh nổi lọt vào nội dung: ' + out.khongLotNoiDung);

console.log(JSON.stringify(out, null, 2));
if (errs.length) {
  console.error('\nLỖI:\n - ' + errs.join('\n - '));
  process.exit(1);
}
console.log('\nĐạt: thanh nổi hiện đúng lúc, giữ vùng chọn, nút sáng đúng, liên kết an toàn');
