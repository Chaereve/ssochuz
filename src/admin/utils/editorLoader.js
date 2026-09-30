/* Tải trình soạn thảo chương (admin-editor.js ≈ 320 KB) khi CẦN — chỉ khung soạn
   chương gọi. Các màn admin khác không tốn byte nào cho Tiptap.

   - Phiên bản ?v= = sha1 của chính admin-editor.js, do tools/build_admin.mjs
     chèn lúc build (define __ADMIN_EDITOR_VER__) ⇒ đổi mã là đổi URL, không quên.
   - Gộp: nhiều khung cùng gọi chỉ chèn MỘT thẻ <script>.
   - Lỗi (mạng, hết giờ, tệp hỏng) ⇒ reject + quên lời hứa + gỡ thẻ ⇒ lần gọi sau
     (nút "Thử lại") tải lại thật, không trả lại lỗi cũ. */
const VER = typeof __ADMIN_EDITOR_VER__ === 'string' ? __ADMIN_EDITOR_VER__ : 'dev';
const TIMEOUT_MS = 30000;
let pending = null;

export function editorLibUrl() { return '/admin-editor.js?v=' + VER; }

export function loadEditorLib() {
  if (window.SsochuzEditor) return Promise.resolve(window.SsochuzEditor);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    let timer = null;
    const fail = (why) => {
      clearTimeout(timer);
      pending = null;
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error(why));
    };
    s.src = editorLibUrl();
    s.async = true;
    s.onload = () => {
      clearTimeout(timer);
      if (window.SsochuzEditor) resolve(window.SsochuzEditor);
      else fail('tệp trình soạn thảo không hợp lệ');
    };
    s.onerror = () => fail('lỗi mạng khi tải ' + s.src.replace(/^https?:\/\/[^/]+/, ''));
    timer = setTimeout(() => fail('quá ' + (TIMEOUT_MS / 1000) + ' giây'), TIMEOUT_MS);
    document.head.appendChild(s);
  });
  return pending;
}
