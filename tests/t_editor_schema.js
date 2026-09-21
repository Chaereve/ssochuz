/* ============================================================================
   t_editor_schema.js · TRÌNH SOẠN MỚI CÓ LÀM HỎNG CHƯƠNG CŨ KHÔNG?
   ----------------------------------------------------------------------------
   Đây là bài kiểm thử chặn RỦI RO LỚN NHẤT của việc đổi trình soạn: 62 bộ với
   1202 chương hiện có đều do execCommand sinh ra, HTML rất bẩn. TipTap dùng
   schema — thẻ nào không khai báo thì KHÔNG tồn tại được — nên nếu khai thiếu
   một thứ gì đó, mở chương ra là chữ BIẾN MẤT, và bấm lưu là mất thật trên KV.

   Bài này nạp trình soạn thật (bản đã bundle) vào jsdom rồi cho TOÀN BỘ chương
   thật đi qua vòng: HTML cũ → dọn → nạp vào TipTap → lấy ra → dọn.
   Điều kiện đạt: KHÔNG chương nào mất chữ.

   Chạy:  node tests/t_editor_schema.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const errs = [];
const out = {};

function loadPure(rel) {
  const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
  const r = esbuild.buildSync({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true, write: false, format: 'cjs', target: ['node18'], platform: 'node',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', r.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

const { normalizeChapterHtml } = loadPure('src/admin/lib/html-contract.js');
const { htmlToText } = loadPure('src/admin/lib/chapter.js');
const letters = (h) => htmlToText(h).replace(/\s+/g, '');

/* --- dựng trình soạn thật trong jsdom ------------------------------------ */
const { JSDOM } = require('jsdom');
const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));

/* bundle riêng phần schema để nạp vào jsdom (không kéo theo legacy.js) */
const shim = path.join(ROOT, 'tests', '_editor_shim.js');
fs.writeFileSync(shim,
  "import { Editor } from '@tiptap/core';\n" +
  "import { chapterExtensions } from '../src/admin/editor/schema.js';\n" +
  "window.__mkEditor = (el) => new Editor({ element: el, extensions: chapterExtensions({}), content: '<p></p>' });\n");
let bundled;
try {
  bundled = esbuild.buildSync({
    entryPoints: [shim], bundle: true, write: false, format: 'iife',
    target: ['es2019'], absWorkingDir: ROOT,
  }).outputFiles[0].text;
} finally {
  fs.unlinkSync(shim);
}

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
dom.window.eval(bundled);
const editor = dom.window.__mkEditor(dom.window.document.getElementById('host'));

/* --- 1. các thẻ trong hợp đồng phải sống sót qua schema ------------------- */
const canGiu = [
  ['đoạn văn', '<p>Chữ thường</p>'],
  ['tiêu đề H2', '<h2>Tiêu đề lớn</h2>'],
  ['tiêu đề H3', '<h3>Tiêu đề nhỏ</h3>'],
  ['in đậm', '<p><strong>đậm</strong></p>'],
  ['in nghiêng', '<p><em>nghiêng</em></p>'],
  ['gạch chân', '<p><u>gạch chân</u></p>'],
  ['gạch ngang', '<p><s>gạch ngang</s></p>'],
  ['trích dẫn', '<blockquote><p>lời trích</p></blockquote>'],
  ['danh sách chấm', '<ul><li>một</li><li>hai</li></ul>'],
  ['danh sách số', '<ol><li>một</li><li>hai</li></ol>'],
  ['đường kẻ', '<p>trên</p><hr><p>dưới</p>'],
  ['liên kết', '<p><a href="https://ssochuz.pages.dev">link</a></p>'],
  ['ảnh', '<img src="/api/img/abc123" alt="minh hoạ">'],
  ['căn giữa', '<p style="text-align:center">giữa</p>'],
  ['lời tác giả', '<aside class="note">lời tác giả</aside>'],
];
out.giuDinhDang = {};
for (const [ten, html] of canGiu) {
  editor.commands.setContent(normalizeChapterHtml(html), false);
  const ra = normalizeChapterHtml(editor.getHTML());
  out.giuDinhDang[ten] = ra;
  if (letters(html) !== letters(ra)) errs.push('mất chữ ở ' + ten + ': ' + JSON.stringify(ra));
}
/* kiểm vài thẻ phải còn đúng tên */
const phaiCon = [
  ['tiêu đề H2', '<h2>'], ['in đậm', '<strong>'], ['trích dẫn', '<blockquote>'],
  ['danh sách chấm', '<ul>'], ['đường kẻ', '<hr>'], ['ảnh', '<img'],
  ['căn giữa', 'text-align:center'], ['lời tác giả', '<aside class="note">'],
];
for (const [ten, can] of phaiCon) {
  if (String(out.giuDinhDang[ten] || '').indexOf(can) < 0) {
    errs.push(ten + ': schema nuốt mất ' + can + ' (nhận: ' + out.giuDinhDang[ten] + ')');
  }
}

/* --- 2. thứ NGUY HIỂM phải bị schema loại --------------------------------- */
const phaiLoai = [
  ['script', '<p>an toàn</p><script>alert(1)</script>'],
  ['iframe', '<p>an toàn</p><iframe src="https://x.test"></iframe>'],
  ['màu chữ', '<p><span style="color:red">đỏ</span></p>'],
  ['cỡ chữ', '<p><span style="font-size:40px">to</span></p>'],
  ['bảng', '<table><tr><td>ô</td></tr></table>'],
];
out.loaiBo = {};
for (const [ten, html] of phaiLoai) {
  editor.commands.setContent(normalizeChapterHtml(html), false);
  const ra = normalizeChapterHtml(editor.getHTML());
  out.loaiBo[ten] = ra;
  if (/<script|<iframe|color:|font-size|<table|<span/.test(ra)) errs.push(ten + ' không bị loại: ' + ra);
}

/* --- 3. CHẠY THẬT TOÀN BỘ KHO CHƯƠNG -------------------------------------- */
const bookDir = path.join(ROOT, 'data/book');
let nBook = 0, nChap = 0;
const mat = [];
for (const f of fs.readdirSync(bookDir).filter((x) => x.endsWith('.json'))) {
  let book;
  try { book = JSON.parse(fs.readFileSync(path.join(bookDir, f), 'utf8')); } catch (e) { continue; }
  nBook++;
  for (const [i, ch] of (book.chapters || []).entries()) {
    nChap++;
    const sach = normalizeChapterHtml(ch.html || '');
    editor.commands.setContent(sach, false);
    const ra = normalizeChapterHtml(editor.getHTML());
    if (letters(sach) !== letters(ra) && mat.length < 6) {
      const a = letters(sach), b = letters(ra);
      let k = 0; while (k < a.length && a[k] === b[k]) k++;
      mat.push(f + ' · chương ' + (i + 1) + ' → ' + JSON.stringify(a.slice(k, k + 100)));
    }
  }
}
out.khoChuong = { soBo: nBook, soChuong: nChap, matChu: mat };
if (mat.length) errs.push('TRÌNH SOẠN LÀM MẤT CHỮ CHƯƠNG THẬT: ' + mat.join(' | '));

out.errors0 = errs;
console.log(JSON.stringify(out, null, 1));
console.log(errs.length ? 'CÒN ' + errs.length + ' LỖI SCHEMA TRÌNH SOẠN' : 'Trình soạn giữ nguyên nội dung ' + nChap + ' chương');
process.exit(errs.length ? 1 : 0);
