/* Điểm vào của admin-editor.js (tools/build_admin.mjs): gói Tiptap/ProseMirror
   thành tệp riêng, đặt lên window để utils/editorLoader.js lấy khi mở khung soạn
   chương. admin.js không import file này. */
import { createRichTextEditor } from './utils/richTextEditor.js';

window.SsochuzEditor = { createRichTextEditor };
