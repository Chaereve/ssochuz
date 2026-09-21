/* ============================================================================
   src/admin/editor/bubble.js · THANH ĐỊNH DẠNG NỔI KHI BÔI ĐEN CHỮ
   ----------------------------------------------------------------------------
   Bôi đen một đoạn chữ thì hiện ngay một thanh nhỏ phía trên vùng chọn:
   Đậm · Nghiêng · Gạch chân · Gạch ngang · Liên kết · H2 · H3 · Trích dẫn.
   Thanh công cụ trên đầu (#edToolbar) vẫn giữ nguyên — cái này chỉ là lối tắt
   cho thao tác hay dùng nhất, đỡ phải đưa chuột lên đầu trang.

   VÌ SAO TỰ VIẾT (giống slash.js): @tiptap/extension-bubble-menu kéo theo
   tippy.js + popper (~25 kB) chỉ để đặt một cái hộp, trong khi ProseMirror đã
   có sẵn coordsAtPos(). Dự án lại cấm thêm CDN và đang giữ ngân sách 650 kB.

   NÚT ĐANG BẬT: nút nào đang áp dụng cho vùng chọn thì sáng lên (.on) —
   người viết nhìn là biết đoạn đang đậm hay đang là H2, không phải đoán.

   AN TOÀN: không eval, không inline handler; chỉ gọi lệnh có sẵn của trình
   soạn. Dùng mousedown + preventDefault để bấm nút KHÔNG làm mất vùng chọn.
   ========================================================================== */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const bubbleKey = new PluginKey('czBubble');

/* Mỗi nút: id, nhãn hiển thị, mô tả (title), cách bật/tắt và cách hỏi trạng thái. */
const NUT = [
  { id: 'bold', nhan: 'B', mo: 'Đậm (Ctrl+B)', kieu: 'b' },
  { id: 'italic', nhan: 'I', mo: 'Nghiêng (Ctrl+I)', kieu: 'i' },
  { id: 'underline', nhan: 'U', mo: 'Gạch chân (Ctrl+U)', kieu: 'u' },
  { id: 'strike', nhan: 'S', mo: 'Gạch ngang', kieu: 's' },
  { sep: true },
  { id: 'link', nhan: '🔗', mo: 'Chèn / sửa liên kết' },
  { sep: true },
  { id: 'h2', nhan: 'H2', mo: 'Tiêu đề lớn' },
  { id: 'h3', nhan: 'H3', mo: 'Tiêu đề nhỏ' },
  { id: 'blockquote', nhan: '❝', mo: 'Trích dẫn' },
];

/* Vùng chọn hiện tại có đang mang định dạng này không (để làm sáng nút). */
function dangBat(editor, id) {
  try {
    if (id === 'h2') return editor.isActive('heading', { level: 2 });
    if (id === 'h3') return editor.isActive('heading', { level: 3 });
    if (id === 'strike') return editor.isActive('strike');
    return editor.isActive(id);
  } catch (e) { return false; }
}

/* Bấm một nút. Nhóm khối (h2/h3/trích dẫn) bật lại lần nữa thì về đoạn thường
   — giống hành vi quen thuộc của Word/Notion. */
function bam(editor, id, hoiLienKet) {
  const c = editor.chain().focus();
  if (id === 'bold') c.toggleBold().run();
  else if (id === 'italic') c.toggleItalic().run();
  else if (id === 'underline') c.toggleUnderline().run();
  else if (id === 'strike') c.toggleStrike().run();
  else if (id === 'blockquote') c.toggleBlockquote().run();
  else if (id === 'h2') { if (editor.isActive('heading', { level: 2 })) c.setParagraph().run(); else c.setNode('heading', { level: 2 }).run(); }
  else if (id === 'h3') { if (editor.isActive('heading', { level: 3 })) c.setParagraph().run(); else c.setNode('heading', { level: 3 }).run(); }
  else if (id === 'link') {
    const cu = (editor.getAttributes('link') || {}).href || '';
    const moi = typeof hoiLienKet === 'function' ? hoiLienKet(cu) : null;
    /* null = người dùng bấm Huỷ → không đụng gì. Chuỗi rỗng = gỡ liên kết. */
    if (moi === null || moi === undefined) { c.run(); return; }
    if (!String(moi).trim()) { c.extendMarkRange('link').unsetLink().run(); return; }
    c.extendMarkRange('link').setLink({ href: String(moi).trim() }).run();
  }
}

function taoThanh(doc) {
  const box = doc.createElement('div');
  box.className = 'rte-bubble hide';
  box.setAttribute('role', 'toolbar');
  box.setAttribute('aria-label', 'Định dạng nhanh đoạn đang chọn');
  NUT.forEach((n) => {
    if (n.sep) {
      const s = doc.createElement('span');
      s.className = 'rte-bubble-sep';
      s.setAttribute('aria-hidden', 'true');
      box.appendChild(s);
      return;
    }
    const b = doc.createElement('button');
    b.type = 'button';
    b.dataset.id = n.id;
    b.title = n.mo;
    b.setAttribute('aria-label', n.mo);
    if (n.kieu) {
      const t = doc.createElement(n.kieu);
      t.textContent = n.nhan;
      b.appendChild(t);
    } else {
      b.textContent = n.nhan;
    }
    box.appendChild(b);
  });
  return box;
}

function BubbleMenu(opts) {
  const o = opts || {};
  return Extension.create({
    name: 'czBubble',
    addProseMirrorPlugins() {
      const editor = this.editor;
      let box = null;
      let hien = false;

      function an() {
        if (!hien) return;
        hien = false;
        if (box) box.classList.add('hide');
      }

      function veTrangThai() {
        if (!box) return;
        box.querySelectorAll('[data-id]').forEach((b) => {
          const on = dangBat(editor, b.dataset.id);
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }

      function datViTri(view) {
        if (!box) return;
        try {
          const { from, to } = view.state.selection;
          const d = view.coordsAtPos(from);
          const c = view.coordsAtPos(to);
          const khung = view.dom.parentNode.getBoundingClientRect();
          const rong = box.offsetWidth || 240;
          /* canh giữa vùng chọn, đặt phía TRÊN để không che chữ đang đọc */
          let x = (d.left + c.left) / 2 - khung.left - rong / 2;
          x = Math.max(4, x);
          const y = Math.min(d.top, c.top) - khung.top - box.offsetHeight - 8;
          box.style.left = x + 'px';
          /* sát mép trên thì lật xuống dưới vùng chọn */
          box.style.top = (y < 4 ? (Math.max(d.bottom, c.bottom) - khung.top + 8) : y) + 'px';
        } catch (e) { /* jsdom không có layout — chỉ ảnh hưởng vị trí */ }
      }

      function capNhat(view) {
        const st = view.state;
        const sel = st.selection;
        /* Chỉ hiện khi: đang bôi đen thật (không phải con trỏ nháy), vùng chọn
           là chữ, và trình soạn đang được focus. Bôi đen ảnh hay khoảng trắng
           thuần thì không hiện cho đỡ vướng. */
        const coChu = !sel.empty && String(st.doc.textBetween(sel.from, sel.to, ' ')).trim().length > 0;
        if (!coChu || !view.hasFocus()) { an(); return; }
        hien = true;
        if (box) {
          box.classList.remove('hide');
          veTrangThai();
          datViTri(view);
        }
      }

      return [
        new Plugin({
          key: bubbleKey,
          view(view) {
            box = taoThanh(view.dom.ownerDocument);
            const neo = view.dom.parentNode;
            if (neo) neo.appendChild(box);
            box.addEventListener('mousedown', (e) => {
              /* GIỮ vùng chọn: mặc định bấm ra ngoài là mất bôi đen, mà mất
                 bôi đen thì lệnh định dạng chẳng còn gì để áp dụng. */
              e.preventDefault();
              const b = e.target && e.target.closest ? e.target.closest('[data-id]') : null;
              if (!b) return;
              bam(editor, b.dataset.id, o.hoiLienKet);
              veTrangThai();
            });
            return {
              update(v) { capNhat(v); },
              destroy() { if (box && box.parentNode) box.parentNode.removeChild(box); box = null; },
            };
          },
          props: {
            handleKeyDown(view, event) {
              /* Esc đóng thanh; không nuốt phím nào khác. */
              if (hien && event.key === 'Escape') { an(); return true; }
              return false;
            },
            handleDOMEvents: {
              blur: () => { an(); return false; },
            },
          },
        }),
      ];
    },
  });
}

export { BubbleMenu, NUT, dangBat };
