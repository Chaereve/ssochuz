/* ============================================================================
   t_editor_api.js · CÁC HÀM TRÌNH SOẠN MÀ MÃ CŨ GỌI CÓ THẬT SỰ CHẠY KHÔNG?
   ----------------------------------------------------------------------------
   VÌ SAO CÓ BÀI NÀY: TipTap (ProseMirror) TỰ QUẢN vùng DOM của nó. Mã quản trị
   cũ vốn viết cho contenteditable nên thao tác thẳng vào DOM:

       edIn.innerHTML = '';                          // xoá chương
       $('#edBody').insertAdjacentHTML('beforeend', html);   // nạp tệp

   Hai câu đó KHÔNG có tác dụng với trình soạn mới — tệ hơn là chúng im lặng:
   không báo lỗi, nhìn qua tưởng chạy. Lỗi thật đã gặp: xoá một chương xong thì
   chữ của chương vừa xoá VẪN nằm trong khung soạn, người dùng bấm "Lưu chương
   này" là ghi đè nội dung cũ sang chương khác.

   Bài này khoá hợp đồng của hai hàm thay thế: clear() và appendHtml().

   Chạy:  node tests/t_editor_api.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errs = [];
const out = {};

const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
const { JSDOM } = require('jsdom');

/* nạp đúng module trình soạn thật (src/admin/editor/index.js) vào jsdom */
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
  'MutationObserver', 'DOMParser', 'getComputedStyle']) global[k] = win[k];
/* jsdom không có layout: ProseMirror gọi coordsAtPos khi cuộn tới con trỏ và sẽ
   nổ. Trong bài kiểm thử ta chỉ quan tâm NỘI DUNG nên vô hiệu hoá phần cuộn. */
win.requestAnimationFrame = global.requestAnimationFrame = () => 0;
win.cancelAnimationFrame = global.cancelAnimationFrame = () => {};
win.HTMLElement.prototype.scrollIntoView = function () {};

const mod = { exports: {} };
new Function('module', 'exports', 'window', 'document', 'navigator', built)(
  mod, mod.exports, win, win.document, win.navigator);
const ED = mod.exports;

ED.mountEditor(win.document.getElementById('edBody'), {});
if (!ED.getEditor()) errs.push('không gắn được trình soạn');

/* --- 1. clear(): xoá chương phải sạch thật -------------------------------- */
ED.setChapterHtml('<p>Nội dung chương cũ</p>', '');
const truocXoa = ED.getChapterHtml('');
ED.clear();
const sauXoa = ED.getChapterHtml('');
out.xoaChuong = { truoc: truocXoa, sau: sauXoa };
if (!/Nội dung chương cũ/.test(truocXoa)) errs.push('không nạp được nội dung ban đầu');
if (/Nội dung/.test(sauXoa)) errs.push('clear() KHÔNG xoá được: vẫn còn ' + JSON.stringify(sauXoa));
if (!ED.isEmpty()) errs.push('clear() xong nhưng isEmpty() vẫn false');

/* Chứng minh vì sao cần clear(): cách cũ (innerHTML = '') là vô tác dụng.
   Nếu một ngày nào đó TipTap đổi hành vi và innerHTML lại xoá được thật thì
   bài này vẫn đạt — ta chỉ khẳng định clear() đúng, không khẳng định điều
   ngược lại. */
ED.setChapterHtml('<p>Thử cách cũ</p>', '');
win.document.getElementById('edBody').innerHTML = '';
out.cachCuVoTacDung = /Thử cách cũ/.test(ED.getChapterHtml(''));

/* --- 2. appendHtml(): nạp tệp phải CỘNG THÊM, không đè ------------------- */
ED.setChapterHtml('<p>Đoạn có sẵn.</p>', '');
ED.appendHtml('<p>Đoạn từ tệp.</p>', '');
const sauNap = ED.getChapterHtml('');
out.napTep = sauNap;
if (!/Đoạn có sẵn/.test(sauNap)) errs.push('appendHtml() làm MẤT nội dung có sẵn');
if (!/Đoạn từ tệp/.test(sauNap)) errs.push('appendHtml() không chèn được nội dung mới');
if (sauNap.indexOf('Đoạn có sẵn') > sauNap.indexOf('Đoạn từ tệp')) errs.push('appendHtml() chèn sai thứ tự (phải ở cuối)');

/* --- 3. appendHtml() vẫn phải lọc rác ------------------------------------ */
ED.setChapterHtml('<p>A.</p>', '');
ED.appendHtml('<script>alert(1)<\/script><p style="color:red">B.</p><iframe src="x"></iframe>', '');
const sauBan = ED.getChapterHtml('');
out.napTepBan = sauBan;
if (/script|iframe|color:/i.test(sauBan)) errs.push('appendHtml() để lọt thẻ/kiểu nguy hiểm: ' + sauBan);
if (!/B\./.test(sauBan)) errs.push('appendHtml() lọc quá tay, mất luôn chữ');

/* --- 4. nội dung chèn phải BỀN, không biến mất khi thao tác tiếp ---------- */
ED.setChapterHtml('<p>X.</p>', '');
ED.appendHtml('<p>Y.</p>', '');
ED.commands.bold();
ED.setBlock('h2');
const sauThaoTac = ED.getChapterHtml('');
out.benSauThaoTac = sauThaoTac;
if (!/Y\./.test(sauThaoTac)) errs.push('phần chèn biến mất sau khi thao tác tiếp');

/* --- 5. append tệp rỗng thì không được sinh đoạn trống rác --------------- */
ED.setChapterHtml('<p>Chỉ có đoạn này.</p>', '');
ED.appendHtml('', '');
ED.appendHtml('   ', '');
out.napTepRong = ED.getChapterHtml('');
if (out.napTepRong !== '<p>Chỉ có đoạn này.</p>') errs.push('nạp tệp rỗng lại thêm rác: ' + out.napTepRong);

/* --- 6. ảnh trong tệp nạp vào phải theo đúng quy ước đường dẫn ----------- */
ED.setChapterHtml('<p>Đầu.</p>', '');
ED.appendHtml('<p><img src="/api/img/xyz789" alt=""></p>', 'https://cms.test');
const raAnh = ED.getChapterHtml('https://cms.test');
out.anhSauNap = raAnh;
if (!/src="\/api\/img\/xyz789"/.test(raAnh)) errs.push('ảnh nạp từ tệp không quay về đường dẫn tương đối: ' + raAnh);

/* ------------------------------- kết quả -------------------------------- */
console.log(JSON.stringify(out, null, 2));
if (errs.length) {
  console.error('\nLỖI:\n - ' + errs.join('\n - '));
  process.exit(1);
}
console.log('\nĐạt: clear() và appendHtml() hoạt động đúng với trình soạn mới');
