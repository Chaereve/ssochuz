/* ============================================================================
   src/admin/editor/index.js · TRÌNH SOẠN CHƯƠNG (TipTap)
   ----------------------------------------------------------------------------
   Thay cho contenteditable + document.execCommand của bản cũ. execCommand đã bị
   khai tử và chính nó sinh ra đống HTML bẩn (span style, div lồng, dòng trống
   nhân đôi) mà chúng ta đang phải dọn.

   CÁCH GHÉP VÀO TRANG: module này KHÔNG dựng lại giao diện. Nó gắn vào đúng
   phần tử #edBody và thanh #edToolbar đã có sẵn trong admin.html, nên:
     · các bài kiểm thử cũ (t_admin_ui.js, cf_admin_test.js) vẫn tìm thấy DOM,
     · mã trong legacy.js vẫn đọc/ghi nội dung như trước qua cầu nối bên dưới.

   PHÍM TẮT: chỉ hoạt động KHI CON TRỎ NẰM TRONG trình soạn — đúng yêu cầu
   "không thêm phím tắt toàn trang". TipTap gắn phím vào chính vùng soạn nên
   ngoài vùng đó gõ Ctrl+B sẽ không có gì xảy ra.
   ========================================================================== */
import { Editor } from '@tiptap/core';
import { chapterExtensions } from './schema.js';
import { normalizeChapterHtml } from '../lib/html-contract.js';
import { countWords, readingMinutes } from '../lib/chapter.js';

let editor = null;
let onChange = null;

/* Ảnh lưu trên Worker ở dạng /api/img/<id>. Trong trình soạn phải hiện được
   nên đổi sang URL tuyệt đối; lúc lấy nội dung ra thì đổi ngược lại. */
function toAbsolute(html, api) {
  if (!api) return html;
  return String(html || '').replace(/(<img[^>]+src=")(\/api\/img\/)/g, '$1' + api + '$2');
}
function toRelative(html, api) {
  if (!api) return html;
  return String(html || '').split(api + '/api/img/').join('/api/img/');
}

/* Khởi tạo một lần. Gọi lại nhiều lần thì trả về bản đã có. */
function mountEditor(el, opts) {
  if (!el) return null;
  if (editor) return editor;
  const o = opts || {};
  editor = new Editor({
    element: el,
    extensions: chapterExtensions(o),
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'rte-body',
        'aria-label': 'Nội dung chương',
      },
    },
    onUpdate: () => { if (typeof onChange === 'function') onChange(); },
  });
  return editor;
}

function getEditor() { return editor; }

/* Nạp nội dung chương vào trình soạn.
   QUAN TRỌNG: chỉ CHUẨN HOÁ ĐỂ HIỂN THỊ, không tự ghi ngược lên KV. Chương cũ
   chỉ được dọn thật khi người dùng sửa rồi bấm lưu (yêu cầu mục 8). */
function setChapterHtml(html, api) {
  if (!editor) return;
  const clean = normalizeChapterHtml(html || '');
  editor.commands.setContent(toAbsolute(clean, api), false);
}

/* Lấy nội dung để lưu — đã chuẩn hoá đúng hợp đồng HTML. */
function getChapterHtml(api) {
  if (!editor) return '';
  return normalizeChapterHtml(toRelative(editor.getHTML(), api));
}

/* Thống kê cho thanh trạng thái. */
function stats(api) {
  const html = getChapterHtml(api);
  return { words: countWords(html), minutes: readingMinutes(html), chars: (editor ? editor.getText().length : 0) };
}

function setOnChange(fn) { onChange = fn; }

/* Chèn ảnh đã tải lên Worker. */
function insertImage(url, alt, api) {
  if (!editor) return;
  const src = api && /^\//.test(url) ? api + url : url;
  editor.chain().focus().setImage({ src, alt: alt || '' }).run();
}

/* Các lệnh định dạng cho thanh công cụ cũ (#edToolbar). */
const commands = {
  bold: () => editor && editor.chain().focus().toggleBold().run(),
  italic: () => editor && editor.chain().focus().toggleItalic().run(),
  underline: () => editor && editor.chain().focus().toggleUnderline().run(),
  strikeThrough: () => editor && editor.chain().focus().toggleStrike().run(),
  insertHorizontalRule: () => editor && editor.chain().focus().setHorizontalRule().run(),
  undo: () => editor && editor.chain().focus().undo().run(),
  redo: () => editor && editor.chain().focus().redo().run(),
};
function setBlock(tag) {
  if (!editor) return;
  const c = editor.chain().focus();
  if (tag === 'h2') c.setNode('heading', { level: 2 }).run();
  else if (tag === 'h3') c.setNode('heading', { level: 3 }).run();
  else if (tag === 'blockquote') c.toggleBlockquote().run();
  else if (tag === 'aside') c.setNode('authorNote').run();
  else c.setParagraph().run();
}
function setAlign(dir) {
  if (!editor) return;
  editor.chain().focus().setTextAlign(dir).run();
}
function setLink(href) {
  if (!editor) return;
  if (!href) { editor.chain().focus().unsetLink().run(); return; }
  editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
}
function isEmpty() { return !editor || editor.isEmpty; }
function focus() { if (editor) editor.commands.focus(); }

export {
  mountEditor, getEditor, setChapterHtml, getChapterHtml, stats, setOnChange,
  insertImage, commands, setBlock, setAlign, setLink, isEmpty, focus,
  toAbsolute, toRelative,
};
