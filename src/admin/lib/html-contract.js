/* ============================================================================
   src/admin/lib/html-contract.js · HỢP ĐỒNG HTML CỦA NỘI DUNG CHƯƠNG
   ----------------------------------------------------------------------------
   Module THUẦN: tự phân tích HTML bằng máy trạng thái, KHÔNG dùng DOM trình
   duyệt, KHÔNG thêm thư viện ngoài → chạy thẳng trên Node để kiểm thử.

   VÌ SAO cần: chương cũ được soạn bằng execCommand nên HTML rất bẩn (span rác,
   style màu/cỡ chữ, thẻ font, dấu vết Word `mso-*`, hàng loạt dòng trống). Nếu
   cứ thế đưa vào trình soạn mới thì mỗi lần lưu lại sinh ra một bản HTML khác
   nhau, và trang đọc mỗi lúc một kiểu. Hàm dưới đây ép mọi nội dung về đúng
   MỘT danh sách thẻ được phép.

   HAI BẢO ĐẢM BẤT BIẾN (có bài kiểm thử riêng chứng minh):
     1. Ổn định:  normalizeChapterHtml(normalizeChapterHtml(x))
                  === normalizeChapterHtml(x)
     2. Không mất chữ: toàn bộ ký tự chữ trước và sau khi dọn là như nhau.

   LƯU Ý VẬN HÀNH: chương cũ CHỈ được chuẩn hoá khi người dùng thật sự sửa rồi
   bấm lưu. Chỉ mở ra xem thì không được ghi gì lên KV.
   ========================================================================== */

/* ---- Danh sách thẻ được phép (đúng mục 7.3 của bản yêu cầu) -------------- */
const BLOCK = new Set(['p', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'hr', 'figure', 'figcaption', 'aside']);
const INLINE = new Set(['strong', 'em', 'u', 's', 'a', 'br', 'img']);
const VOID = new Set(['br', 'hr', 'img']);

/* Thẻ đổi tên về thẻ chuẩn: giữ ý nghĩa, bỏ thẻ trình bày lỗi thời. */
const RENAME = {
  div: 'p', b: 'strong', i: 'em', strike: 's', del: 's', ins: 'u',
  h1: 'h2', h4: 'h3', h5: 'h3', h6: 'h3', section: 'p', article: 'p', pre: 'p',
};

/* Thẻ bị xoá CẢ NỘI DUNG (nguy hiểm hoặc vô nghĩa trong chương truyện). */
const DROP_TREE = new Set(['script', 'style', 'iframe', 'object', 'embed', 'video', 'audio',
  'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'noscript', 'svg', 'canvas']);

/* Thẻ bị bóc vỏ nhưng GIỮ chữ bên trong (span/font rác chính là đây). */
const UNWRAP = new Set(['span', 'font', 'small', 'big', 'center', 'tt', 'abbr', 'mark',
  'sup', 'sub', 'code', 'label', 'main', 'header', 'footer', 'nav', 'figcaption-x']);

/* Thẻ của BẢNG: bỏ vỏ nhưng phải giữ chữ trong ô, nếu không sẽ mất nội dung
   thật ở những chương từng được dựng bằng bảng. */
const TABLE_UNWRAP = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col']);

/* ---- Tiện ích chữ -------------------------------------------------------- */
function escapeText(s) {
  return String(s).replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, '&amp;')
    .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* Chỉ giữ duy nhất text-align (trái/phải/giữa/đều) — mọi style khác bỏ hết. */
function keepTextAlign(style) {
  const m = /(?:^|;)\s*text-align\s*:\s*(left|right|center|justify)\s*(?:;|$)/i.exec(String(style || ''));
  return m ? 'text-align:' + m[1].toLowerCase() : '';
}

/* Ảnh tải lên nằm trên Worker. Lưu đường dẫn TƯƠNG ĐỐI /api/img/<id> để đổi
   tên miền Worker không làm chết ảnh trong hàng nghìn chương. */
function normalizeImgSrc(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  if (/^\s*(javascript|data|vbscript):/i.test(s)) return '';   /* chặn data: theo yêu cầu */
  const m = /^https?:\/\/[^/]+(\/api\/img\/[A-Za-z0-9_-]+)$/i.exec(s);
  if (m) return m[1];
  return s;
}
function safeHref(href) {
  const s = String(href || '').trim();
  if (!s) return '';
  if (/^\s*(javascript|data|vbscript):/i.test(s)) return '';
  return s;
}

/* ---- Phân tích thuộc tính ------------------------------------------------ */
function parseAttrs(raw) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let m;
  while ((m = re.exec(raw))) {
    let v = m[2] == null ? '' : m[2];
    if (/^["']/.test(v)) v = v.slice(1, -1);
    out[m[1].toLowerCase()] = v;
  }
  return out;
}

/* Lọc thuộc tính theo từng thẻ. Không thẻ nào được giữ class lạ, id, on*… */
function filterAttrs(tag, attrs) {
  const keep = [];
  const align = keepTextAlign(attrs.style);
  if (tag === 'a') {
    const href = safeHref(attrs.href);
    /* Link mất đích (href rỗng hoặc javascript:) thì KHÔNG còn là link nữa —
       bóc vỏ giữ chữ. Để lại `<a>` trơ sẽ khiến lần dọn sau bọc thêm <p>, làm
       hàm mất tính ổn định. */
    if (!href) return 'unwrap';
    keep.push(['href', href]);
  } else if (tag === 'img') {
    const src = normalizeImgSrc(attrs.src);
    if (!src) return null;                         /* ảnh không có nguồn ⇒ bỏ hẳn */
    keep.push(['src', src]);
    if (attrs.alt) keep.push(['alt', attrs.alt]);
  } else if (tag === 'aside') {
    keep.push(['class', 'note']);                  /* aside chỉ có đúng một lớp */
  }
  /* text-align chỉ có nghĩa với khối */
  if (align && BLOCK.has(tag) && tag !== 'aside') keep.push(['style', align]);
  return keep;
}

function renderOpen(tag, keep) {
  let s = '<' + tag;
  for (const [k, v] of keep) s += ' ' + k + '="' + escapeAttr(v) + '"';
  return s + '>';
}

/* ---- Máy trạng thái: HTML → cây nút ------------------------------------- */
function parse(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  const src = String(html == null ? '' : html);
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0, m;

  const top = () => stack[stack.length - 1];
  const addText = (t) => { if (t) top().children.push({ tag: '#text', text: t }); };

  while ((m = re.exec(src))) {
    addText(src.slice(last, m.index));
    last = re.lastIndex;
    if (m[0].startsWith('<!--')) continue;          /* chú thích: bỏ, giữ chữ xung quanh */

    const closing = m[0][1] === '/';
    const tag = (m[1] || '').toLowerCase();
    if (closing) {
      /* đóng thẻ: tìm ngược lên, bỏ qua thẻ đóng thừa (HTML bẩn rất hay có) */
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const attrs = parseAttrs(m[2] || '');
    const selfClose = /\/\s*$/.test(m[2] || '') || VOID.has(tag) || VOID.has(RENAME[tag]);
    const node = { tag, attrs, children: [] };
    top().children.push(node);
    if (!selfClose && !DROP_TREE.has(tag)) stack.push(node);
    else if (DROP_TREE.has(tag) && !selfClose) {
      /* nhảy tới thẻ đóng tương ứng để bỏ cả cụm (script/style/table…) */
      const close = new RegExp('</' + tag + '\\s*>', 'i');
      close.lastIndex = re.lastIndex;
      const rest = src.slice(re.lastIndex);
      const mm = close.exec(rest);
      if (mm) { re.lastIndex = last = re.lastIndex + mm.index + mm[0].length; }
    }
  }
  addText(src.slice(last));
  return root;
}

/* ---- Dựng lại HTML sạch từ cây ------------------------------------------ */
function build(node, ctx) {
  let out = '';
  for (const c of node.children) {
    if (c.tag === '#text') {
      /* &nbsp; chuẩn hoá thành khoảng trắng thường; giữ nguyên chữ. */
      let t = c.text.replace(/&nbsp;|\u00a0/gi, ' ');
      if (!ctx.inBlock) t = t.replace(/\s+/g, ' ');
      out += escapeText(t);
      continue;
    }
    let tag = RENAME[c.tag] || c.tag;
    if (DROP_TREE.has(c.tag)) continue;
    /* Ô bảng: bỏ vỏ bảng nhưng chữ trong ô phải thành đoạn văn để không dính
       liền nhau thành một khối chữ khó đọc. */
    if (TABLE_UNWRAP.has(c.tag)) {
      const innerTbl = build(c, { inBlock: true });
      if (!innerTbl.trim()) continue;
      out += (c.tag === 'td' || c.tag === 'th' || c.tag === 'caption')
        ? (hasBlockChild(c) ? innerTbl : '<p>' + innerTbl + '</p>')
        : innerTbl;
      continue;
    }
    if (UNWRAP.has(c.tag) || (!BLOCK.has(tag) && !INLINE.has(tag))) {
      out += build(c, ctx);                          /* bóc vỏ, giữ chữ bên trong */
      continue;
    }
    /* <div> lồng nhau: nếu bên trong đã có khối thì đừng tạo <p> bọc khối */
    if (c.tag === 'div' || c.tag === 'section' || c.tag === 'article') {
      if (hasBlockChild(c)) { out += build(c, ctx); continue; }
    }
    /* Thẻ inline bọc cả KHỐI (Google Docs hay sinh <b style=font-weight:normal>
       bao quanh <p>) ⇒ bỏ vỏ inline, nếu không sẽ ra <strong><p>…</p></strong>
       là HTML không hợp lệ. */
    if (INLINE.has(tag) && tag !== 'br' && tag !== 'img' && hasBlockChild(c)) {
      out += build(c, ctx);
      continue;
    }
    const keep = filterAttrs(tag, c.attrs || {});
    if (keep === null) continue;                     /* bỏ hẳn cả nút (ảnh hỏng) */
    if (keep === 'unwrap') { out += build(c, ctx); continue; }  /* bỏ vỏ, giữ chữ */
    if (VOID.has(tag)) { out += renderOpen(tag, keep); continue; }
    const inner = build(c, { inBlock: BLOCK.has(tag) });
    out += renderOpen(tag, keep) + inner + '</' + tag + '>';
  }
  return out;
}

function hasBlockChild(node) {
  for (const c of node.children || []) {
    if (c.tag === '#text') continue;
    const t = RENAME[c.tag] || c.tag;
    if (BLOCK.has(t) && t !== 'figcaption') return true;
    if (UNWRAP.has(c.tag) && hasBlockChild(c)) return true;
  }
  return false;
}

/* ---- Dọn sau khi dựng ---------------------------------------------------- */
function tidy(html) {
  let s = html;

  /* nhiều <br> liên tiếp ⇒ 1; <br> sát mép khối ⇒ bỏ */
  s = s.replace(/(?:\s*<br>\s*){2,}/g, '<br>');
  s = s.replace(/<br>\s*(<\/(?:p|h2|h3|blockquote|li|figcaption|aside)>)/g, '$1');
  s = s.replace(/(<(?:p|h2|h3|blockquote|li|figcaption|aside)(?:\s[^>]*)?>)\s*<br>/g, '$1');

  /* khối rỗng (kể cả chỉ chứa khoảng trắng) ⇒ bỏ hẳn, chống nhân đôi dòng trống */
  let prev;
  do {
    prev = s;
    s = s.replace(/<(p|h2|h3|blockquote|figcaption|aside)(?:\s[^>]*)?>\s*<\/\1>/g, '');
    s = s.replace(/<li(?:\s[^>]*)?>\s*<\/li>/g, '');
    s = s.replace(/<(ul|ol)(?:\s[^>]*)?>\s*<\/\1>/g, '');
    s = s.replace(/<figure(?:\s[^>]*)?>\s*<\/figure>/g, '');
  } while (s !== prev);

  /* khoảng trắng giữa các khối: đúng một dấu xuống dòng cho dễ đọc */
  s = s.replace(/>\s+</g, '><');
  s = s.replace(/(<\/(?:p|h2|h3|blockquote|ul|ol|figure|aside)>|<hr>)(?=<)/g, '$1\n');
  return s.trim();
}

/* Chữ trần nằm ngoài mọi khối ⇒ bọc vào <p> để nội dung luôn có cấu trúc.
   `img` và `hr` đứng một mình ở cấp cao nhất được coi là ĐÃ có cấu trúc: nếu
   bọc thêm <p> thì lần dọn sau lại sinh ra kết quả khác ⇒ mất tính ổn định. */
function wrapLooseText(html) {
  const parts = html.split(/(<\/?(?:p|h2|h3|blockquote|ul|ol|li|hr|img|figure|figcaption|aside)(?:\s[^>]*)?>)/);
  let depth = 0, out = '';
  for (const part of parts) {
    if (!part) continue;
    if (/^<\//.test(part)) { depth = Math.max(0, depth - 1); out += part; continue; }
    if (/^<(?:hr|img)\b/.test(part)) { out += part; continue; }   /* thẻ rỗng: không tăng độ sâu */
    if (/^</.test(part)) { depth++; out += part; continue; }
    if (depth === 0 && part.trim()) out += '<p>' + part.trim() + '</p>';
    else out += part;
  }
  return out;
}

/* ==========================================================================
   HÀM CHÍNH
   ========================================================================== */
function normalizeChapterHtml(html) {
  const raw = String(html == null ? '' : html);
  if (!raw.trim()) return '';
  const tree = parse(raw);
  let out = build(tree, { inBlock: false });
  out = wrapLooseText(out);
  out = tidy(out);
  return out;
}

export { normalizeChapterHtml, keepTextAlign, normalizeImgSrc };
