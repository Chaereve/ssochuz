/* ============================================================================
   src/admin/editor/slash.js · MENU GÕ "/" ĐỂ CHÈN KHỐI
   ----------------------------------------------------------------------------
   Gõ "/" ở đầu một đoạn trống (hoặc sau dấu cách) sẽ mở một bảng chọn nhỏ ngay
   dưới con trỏ: Tiêu đề lớn, Trích dẫn, Danh sách, Đường phân cách, Lời tác giả…
   Gõ tiếp để lọc, ↑/↓ chọn, Enter/Tab chèn, Esc đóng.

   VÌ SAO TỰ VIẾT thay vì dùng @tiptap/suggestion + tippy.js:
     · Bản yêu cầu cấm thêm CDN và đang có ngân sách 650 kB cho /admin.js.
       tippy + popper kéo thêm ~25 kB mà ta chỉ cần đặt một hộp theo toạ độ
       con trỏ — ProseMirror đã cho sẵn view.coordsAtPos().
     · Ít phụ thuộc hơn = ít thứ phải kiểm khi nâng cấp TipTap.

   AN TOÀN / QUY ƯỚC CỦA DỰ ÁN:
     · Không phím tắt toàn trang: mọi phím đều bắt TRONG vùng soạn, và chỉ khi
       menu đang mở mới nuốt phím. Đóng menu là bàn phím trả về bình thường.
     · Không eval, không inline handler, không thẻ ngoài danh sách trắng —
       menu chỉ gọi các lệnh đã có sẵn của trình soạn.
     · jsdom không có layout nên coordsAtPos() sẽ nổ; mọi chỗ đo toạ độ đều bọc
       try/catch để bài kiểm thử chạy được mà không cần trình duyệt thật.
   ========================================================================== */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/* Danh mục khối. `tu` = các từ khoá gõ để lọc (không dấu, cho dễ gõ nhanh). */
const MUC = [
  { id: 'h2', ten: 'Tiêu đề lớn', mo: 'Mục lớn trong chương', bieu: 'H2', tu: 'tieu de lon h2 heading' },
  { id: 'h3', ten: 'Tiêu đề nhỏ', mo: 'Mục phụ', bieu: 'H3', tu: 'tieu de nho h3 heading' },
  { id: 'p', ten: 'Đoạn văn', mo: 'Chữ thường', bieu: '¶', tu: 'doan van p paragraph thuong' },
  { id: 'blockquote', ten: 'Trích dẫn', mo: 'Đoạn thụt vào, có vạch bên trái', bieu: '❝', tu: 'trich dan quote blockquote' },
  { id: 'ul', ten: 'Danh sách chấm', mo: 'Gạch đầu dòng', bieu: '•', tu: 'danh sach cham gach dau dong bullet ul' },
  { id: 'ol', ten: 'Danh sách số', mo: 'Đánh số 1. 2. 3.', bieu: '1.', tu: 'danh sach so danh so ol number' },
  { id: 'hr', ten: 'Đường phân cách', mo: 'Ngăn hai cảnh', bieu: '—', tu: 'duong phan cach ngan canh hr line' },
  { id: 'aside', ten: 'Lời tác giả', mo: 'Khối ghi chú cuối chương', bieu: '✎', tu: 'loi tac gia ghi chu note aside' },
  { id: 'img', ten: 'Chèn ảnh', mo: 'Tải ảnh từ máy lên', bieu: '🖼', tu: 'chen anh hinh image img' },
];

/* Bỏ dấu tiếng Việt để gõ "tieu de" vẫn tìm ra "Tiêu đề". */
function boDau(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

/* Khớp theo ĐẦU TỪ, không phải "chuỗi con nằm bất kỳ đâu".
   Bẫy đã gặp: gõ "anh" (định tìm "Chèn ảnh") lại khớp cả "Danh sách chấm" vì
   "anh" nằm giữa chữ "danh". Người dùng gõ tắt luôn gõ từ ĐẦU một từ, nên chỉ
   nhận khi có từ nào bắt đầu bằng chuỗi đang gõ. */
function batDauTu(nguon, k) {
  return String(nguon || '').split(/\s+/).some((t) => t.indexOf(k) === 0);
}
function loc(q) {
  const k = boDau(q).trim();
  if (!k) return MUC;
  /* gõ nhiều chữ ("tieu de") thì mọi chữ đều phải khớp một từ nào đó */
  const tu = k.split(/\s+/).filter(Boolean);
  return MUC.filter((m) => {
    const kho = boDau(m.ten) + ' ' + m.tu;
    return tu.every((x) => batDauTu(kho, x));
  });
}

const slashKey = new PluginKey('czSlash');

/* Thực thi một mục. `onImage` do bên ngoài truyền vào vì việc chọn tệp ảnh
   nằm ở legacy.js (input#edImg), trình soạn không tự mở hộp thoại tệp. */
function chay(editor, id, onImage) {
  const c = editor.chain().focus();
  if (id === 'h2') c.setNode('heading', { level: 2 }).run();
  else if (id === 'h3') c.setNode('heading', { level: 3 }).run();
  else if (id === 'p') c.setParagraph().run();
  else if (id === 'blockquote') c.toggleBlockquote().run();
  else if (id === 'ul') c.toggleBulletList().run();
  else if (id === 'ol') c.toggleOrderedList().run();
  else if (id === 'hr') c.setHorizontalRule().run();
  else if (id === 'aside') c.setNode('authorNote').run();
  else if (id === 'img') { c.run(); if (typeof onImage === 'function') onImage(); }
}

/* --------------------------- phần giao diện ------------------------------ */
function taoHop(doc) {
  const box = doc.createElement('div');
  box.className = 'rte-slash hide';
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', 'Chèn khối');
  return box;
}

function veHop(box, dsach, chon, doc) {
  box.textContent = '';
  if (!dsach.length) {
    const t = doc.createElement('div');
    t.className = 'rte-slash-empty';
    t.textContent = 'Không có khối nào khớp';
    box.appendChild(t);
    return;
  }
  dsach.forEach((m, i) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'rte-slash-item' + (i === chon ? ' on' : '');
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', i === chon ? 'true' : 'false');
    b.dataset.id = m.id;
    const ic = doc.createElement('span');
    ic.className = 'rte-slash-ic';
    ic.textContent = m.bieu;
    const wrap = doc.createElement('span');
    wrap.className = 'rte-slash-tx';
    const t1 = doc.createElement('b'); t1.textContent = m.ten;
    const t2 = doc.createElement('i'); t2.textContent = m.mo;
    wrap.appendChild(t1); wrap.appendChild(t2);
    b.appendChild(ic); b.appendChild(wrap);
    box.appendChild(b);
  });
}

/* Tìm "/" đang mở ngay trước con trỏ. Trả về {from, q} hoặc null.
   Chỉ nhận khi "/" đứng đầu dòng hoặc sau khoảng trắng — để không bật menu
   giữa chừng khi người viết gõ "và/hoặc" hay đường dẫn "a/b". */
function docTruyVan(state) {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const truoc = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  const m = /(?:^|\s)\/([^\s/]{0,24})$/.exec(truoc);
  if (!m) return null;
  const q = m[1] || '';
  const from = $from.pos - q.length - 1;
  return { from, to: $from.pos, q };
}

function SlashMenu(opts) {
  const o = opts || {};
  return Extension.create({
    name: 'czSlash',
    addProseMirrorPlugins() {
      const editor = this.editor;
      let box = null;
      let mo = false;      /* menu đang mở */
      let ds = MUC;        /* danh sách đang hiện */
      let chon = 0;
      let vung = null;     /* {from,to} của chuỗi "/..." */

      function dong() {
        mo = false; vung = null; chon = 0;
        if (box) box.classList.add('hide');
      }

      function datViTri(view) {
        if (!box || !vung) return;
        try {
          const c = view.coordsAtPos(vung.from);
          const hop = view.dom.getBoundingClientRect();
          /* đặt theo toạ độ trong khung soạn (khung có position:relative) */
          box.style.left = Math.max(4, c.left - hop.left) + 'px';
          box.style.top = (c.bottom - hop.top + 6) + 'px';
        } catch (e) { /* jsdom không có layout — bỏ qua, chỉ ảnh hưởng vị trí */ }
      }

      function capNhat(view) {
        const tv = docTruyVan(view.state);
        if (!tv) { if (mo) dong(); return; }
        vung = { from: tv.from, to: tv.to };
        ds = loc(tv.q);
        if (chon >= ds.length) chon = 0;
        mo = true;
        if (box) {
          veHop(box, ds, chon, view.dom.ownerDocument);
          box.classList.remove('hide');
          datViTri(view);
        }
      }

      function chonMuc(view, i) {
        if (!ds.length || !vung) { dong(); return; }
        const m = ds[Math.max(0, Math.min(i, ds.length - 1))];
        const { from, to } = vung;
        dong();
        /* xoá chuỗi "/tu-khoa" rồi mới chèn khối */
        editor.chain().focus().deleteRange({ from, to }).run();
        chay(editor, m.id, o.onImage);
      }

      return [
        new Plugin({
          key: slashKey,
          view(view) {
            box = taoHop(view.dom.ownerDocument);
            /* gắn vào cha của vùng soạn để không nằm trong nội dung chương */
            /* Đặt hộp vào #edBody (.rte) — chính là cha của vùng ProseMirror.
               Khung này cuộn được và có position:relative nên hộp bám theo nội
               dung khi cuộn, thay vì trôi lại giữa màn hình. */
            const neo = view.dom.parentNode;
            if (neo) neo.appendChild(box);
            box.addEventListener('mousedown', (e) => {
              /* mousedown chứ không phải click: giữ con trỏ trong trình soạn */
              e.preventDefault();
              const b = e.target && e.target.closest ? e.target.closest('[data-id]') : null;
              if (!b) return;
              const i = ds.findIndex((x) => x.id === b.dataset.id);
              chonMuc(view, i < 0 ? 0 : i);
            });
            return {
              update(v) { if (mo) capNhat(v); },
              destroy() { if (box && box.parentNode) box.parentNode.removeChild(box); box = null; },
            };
          },
          props: {
            /* Bắt phím CHỈ khi menu đang mở → không đụng gì tới phím tắt sẵn có. */
            handleKeyDown(view, event) {
              if (!mo) {
                /* mở menu ngay khi vừa gõ "/" hợp lệ */
                if (event.key === '/') { setTimeout(() => capNhat(view), 0); }
                return false;
              }
              const k = event.key;
              if (k === 'Escape') { dong(); return true; }
              if (k === 'ArrowDown') { chon = ds.length ? (chon + 1) % ds.length : 0; veHop(box, ds, chon, view.dom.ownerDocument); return true; }
              if (k === 'ArrowUp') { chon = ds.length ? (chon - 1 + ds.length) % ds.length : 0; veHop(box, ds, chon, view.dom.ownerDocument); return true; }
              if (k === 'Enter' || k === 'Tab') { chonMuc(view, chon); return true; }
              return false;
            },
            handleClick() { if (mo) dong(); return false; },
            /* gạch chân nhẹ chuỗi "/..." đang gõ cho dễ thấy */
            decorations(state) {
              if (!mo || !vung) return null;
              try {
                return DecorationSet.create(state.doc, [
                  Decoration.inline(vung.from, vung.to, { class: 'rte-slash-q' }),
                ]);
              } catch (e) { return null; }
            },
          },
        }),
      ];
    },
  });
}

export { SlashMenu, MUC, loc, boDau, docTruyVan };
