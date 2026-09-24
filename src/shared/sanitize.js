/* ============================================================================
   ssochuz · LÀM SẠCH HTML CHƯƠNG THEO DANH SÁCH CHO PHÉP (allowlist)
   ----------------------------------------------------------------------------
   Vì sao: bản cũ chặn theo DANH SÁCH CẤM (script/style/iframe/object/embed +
   thuộc tính on* + javascript:/data:). Danh sách cấm luôn thiếu: `<link>`,
   `<meta http-equiv=refresh>`, `<base href>`, `<svg onload>`, `<form action>`,
   `<input>`… đều lọt. Bản này đảo lại: CHỈ những thẻ/thuộc tính có tên trong
   danh sách mới được giữ; còn lại bị bóc thẻ (giữ chữ) hoặc bỏ cả cụm.

   Danh sách KHÔNG chép từ tài liệu suông mà đọc từ dữ liệu thật: 1.216 chương
   trong `data/book/*.json` có 164.137 thẻ <div> (mỗi đoạn văn là 1 <div>),
   2.307 <p>, 1.500 <b>, 12k style (phần lớn là `height:12px` của Blogger),
   45 chương có cụm nút phân trang `<button onclick="showPage(n)">` (nút chết
   trên trang này — vì vậy <button> bị bỏ CẢ CỤM, không để lại “1 2 3 4…”).
   Thiếu <div>/<span>/class/style trong danh sách là mất hết định dạng chương.
   Chạy `node tools/check_chapter_html.mjs` để kiểm lại trên toàn bộ dữ liệu thật:
   không chương nào mất chữ, mất ảnh, hay thành rỗng.

   Bản này dùng CHUNG cho Worker (lúc ghi) — nhờ vậy dữ liệu trên KV sạch dần
   theo mỗi lần lưu. Trang đọc vẫn có lớp thứ hai (cleanHTML bằng DOM) nên an
   toàn không phụ thuộc vào một lớp duy nhất.
   ============================================================================ */

/* Thẻ được GIỮ (kèm thuộc tính đã lọc). Đọc từ dữ liệu thật + vài thẻ chuẩn
   hiếm gặp nhưng vô hại (bảng, chú thích, định nghĩa, media). */
export const SAFE_TAGS = new Set([
  'p', 'div', 'span', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark',
  'small', 'big', 'sub', 'sup', 'code', 'pre', 'kbd', 'samp', 'var', 'q', 'cite', 'abbr', 'time',
  'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'center', 'font',
  'a', 'img', 'figure', 'figcaption', 'picture', 'source', 'video', 'audio', 'track', 'canvas',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'details', 'summary',
]);

/* Thẻ bị BỎ CẢ CỤM (thẻ + mọi thứ bên trong) — nội dung không còn nghĩa hoặc
   nguy hiểm trên trang này. `button`/`input`/`select` là các nút chết của
   Blogger (“1 2 3…”, ô nhập) — giữ lại chỉ tổ rác. */
export const DROP_TAGS = new Set([
  'script', 'style', 'template', 'iframe', 'frame', 'frameset', 'noframes', 'noscript', 'object',
  'embed', 'applet', 'param', 'form', 'input', 'button', 'select', 'option', 'optgroup', 'textarea',
  'label', 'fieldset', 'legend', 'link', 'meta', 'base', 'title', 'head', 'html', 'body',
  'svg', 'math', 'dialog', 'marquee', 'blink', 'portal',
]);

/* Cụm WIDGET còn sót của Blogger: hộp phân trang `<div class="pagination-container">`
   — bên trong là các nút chết `onclick="showPage(n)"` và cả dãy số trang nằm trần
   (`1234567891011…`). Dữ liệu thật: 45 chương có cụm này ở cuối; trang đọc đã bỏ
   nút từ trước nhưng dãy số thì vẫn hiện ra — bỏ cả cụm cho sạch. */
const WIDGET_CLASS_RE = /(^|\s)(pagination-container|pagination|page-nav|pagenav|pager|paging)(\s|$)/i;

/* Thẻ rỗng (không có thẻ đóng) — khi tự dựng lại thì đóng ngay */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'source', 'track', 'col', 'input', 'meta', 'link', 'base', 'embed', 'param']);

/* Thuộc tính được GIỮ (mọi thuộc tính khác — kể cả mọi `on*` — bị bỏ). */
const SAFE_ATTRS = new Set([
  'class', 'style', 'id', 'title', 'dir', 'lang', 'align', 'role',
  'href', 'target', 'rel', 'src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding',
  'colspan', 'rowspan', 'scope', 'headers', 'start', 'reversed', 'value', 'type', 'media',
  'cite', 'datetime', 'controls', 'poster', 'preload', 'loop', 'muted', 'playsinline', 'open',
  'data-original-height', 'data-original-width',
]);

/* id trùng với id của trang đọc/admin sẽ làm $() bắt nhầm phần tử của web —
   bỏ những id này, giữ id còn lại (dữ liệu thật có id kiểu `btn-3`, vô hại). */
const RESERVED_ID_RE = /^(cz[-_]?[A-Z]|rd$|rd[A-Z]|nav[A-Z]|chap(Sec|Grid|Count|Q|Go|Jump|Pager|Sort)$|toc(Sheet|List|Sub|Btn)$|pane-|story(Tabs|Hero)$|main$|lockGate$|set(Sheet|Panel)$|shero$|crumb$|hdr$|ftr$|lightbox$|giscus$)/;

/* Giá trị URL: chỉ http(s), mailto/tel, đường dẫn nội bộ. Chặn javascript:,
   data:, blob:, vbscript:, file: — kể cả khi viết hoa lộn xộn hoặc chèn ký tự
   điều khiển giữa chữ (jav\0ascript:). */
export function safeUrlValue(raw) {
  const v = String(raw == null ? '' : raw).replace(/[\u0000-\u001F\u007F\s]+/g, '').trim();
  if (!v) return '';
  if (/^(https?:|mailto:|tel:|\/\/)/i.test(v)) return String(raw).trim();
  if (/^[#/?]/.test(v)) return String(raw).trim();            /* #neo, ?query, /api/img/… */
  if (/^\.{0,2}\//.test(v)) return String(raw).trim();
  return '';
}
/* srcset: từng mục "url 2x" — mục nào URL không an toàn thì bỏ mục đó */
export function safeSrcsetValue(raw) {
  const parts = String(raw == null ? '' : raw).split(',');
  const keep = [];
  for (const p of parts) {
    const piece = String(p).trim();
    if (!piece) continue;
    const m = piece.match(/^(\S+)(\s+[\d.]+[wx])?$/);
    if (!m || !safeUrlValue(m[1])) continue;
    keep.push(m[1] + (m[2] || ''));
  }
  return keep.join(', ');
}
/* style: giữ định dạng thường ngày (height:12px, text-align:center, font-size…),
   bỏ mọi thứ có thể chạy mã hoặc che trang (expression, javascript:, url() lạ,
   position:fixed, @import). */
export function safeStyleValue(raw) {
  let v = String(raw == null ? '' : raw);
  if (!v) return '';
  v = v.replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (/expression\s*\(|javascript:|vbscript:|-moz-binding|behaviou?r\s*:|@import|@charset/i.test(v)) return '';
  /* url(...) chỉ cho http(s) hoặc đường dẫn nội bộ */
  v = v.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (all, q, u) => {
    const ok = safeUrlValue(u);
    return ok ? 'url(' + q + ok + q + ')' : '';
  });
  v = v.replace(/\bposition\s*:\s*fixed/gi, 'position:static');
  v = v.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return v.replace(/\s+/g, ' ').trim();
}
function escAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* Bóc một thẻ mở thành { name, attrs: [['href','x'], …], selfClose } */
function parseTag(body) {
  const m = /^([a-zA-Z][a-zA-Z0-9:-]*)/.exec(body);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const rest = body.slice(m[0].length).replace(/\/\s*$/, '');
  const attrs = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let a;
  while ((a = re.exec(rest))) {
    const an = a[1].toLowerCase();
    const av = a[3] !== undefined ? a[3] : (a[4] !== undefined ? a[4] : (a[5] !== undefined ? a[5] : ''));
    attrs.push([an, av]);
  }
  return { name, attrs, selfClose: /\/\s*$/.test(body) };
}
/* Dựng lại thẻ mở từ danh sách thuộc tính an toàn */
function buildOpen(tag) {
  const isA = tag.name === 'a';
  const out = [];
  let hadBlankTarget = false;
  let hasRel = false;
  for (const [n, v] of tag.attrs) {
    if (!SAFE_ATTRS.has(n)) continue;
    if (n === 'href' || n === 'src' || n === 'poster' || n === 'cite') {
      const u = safeUrlValue(v);
      if (!u) continue;
      out.push(n + '="' + escAttr(u) + '"');
      continue;
    }
    if (n === 'srcset') { const s = safeSrcsetValue(v); if (s) out.push('srcset="' + escAttr(s) + '"'); continue; }
    if (n === 'style') { const s = safeStyleValue(v); if (s) out.push('style="' + escAttr(s) + '"'); continue; }
    if (n === 'id') { if (!v || RESERVED_ID_RE.test(v)) continue; out.push('id="' + escAttr(v) + '"'); continue; }
    if (n === 'target') { if (!/^_(blank|self|parent|top)$/i.test(v)) continue; if (/^_blank$/i.test(v)) hadBlankTarget = true; out.push('target="_blank"'); continue; }
    if (n === 'rel') { hasRel = true; out.push('rel="' + escAttr(v.replace(/[^\w\s-]/g, '')) + '"'); continue; }
    if (n === 'type') {
      /* chỉ cho type hợp lệ của <ol>/<source>/<track>/<video>/<audio> */
      if (!/^[a-z0-9/+-]{1,40}$/i.test(v)) continue;
      out.push('type="' + escAttr(v) + '"');
      continue;
    }
    out.push(n + '="' + escAttr(v) + '"');
  }
  if (isA && hadBlankTarget && !hasRel) out.push('rel="noopener noreferrer nofollow"');
  const nm = tag.name === 'font' ? 'span' : tag.name;      /* <font> cũ → <span> (CSS lo) */
  return '<' + nm + (out.length ? ' ' + out.join(' ') : '') + '>';
}

/* Làm sạch một chuỗi HTML chương. Không ném lỗi với dữ liệu hỏng. */
export function sanitizeChapterHtml(html) {
  const src = String(html == null ? '' : html);
  if (!src) return '';
  if (src.length > 4 * 1024 * 1024) return '';             /* chặn chuỗi vô lý */
  let out = '';
  let i = 0;
  let dropDepth = 0;                                       /* >0: đang trong cụm bị bỏ */
  const stack = [];                                        /* {name, drop, keep} */
  const recount = () => { dropDepth = 0; for (const f of stack) if (f.drop) dropDepth++; };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { if (!dropDepth) out += src.slice(i); break; }
    if (lt > i && !dropDepth) out += src.slice(i, lt);
    /* chú thích / khai báo / PI: bỏ */
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
      const end = src.indexOf('>', lt);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) { if (!dropDepth) out += src.slice(lt); break; }   /* '<' lơ lửng → coi là chữ */
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;
    const closing = raw.charAt(0) === '/';
    const tag = parseTag(closing ? raw.slice(1) : raw);
    if (!tag) continue;
    if (closing) {
      /* tìm frame gần nhất cùng tên để đóng cho khớp */
      let at = -1;
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === tag.name) { at = k; break; }
      if (at < 0) continue;                                 /* thẻ đóng mồ côi */
      const frame = stack[at];
      stack.length = at;
      recount();
      if (!frame.drop && frame.keep && !dropDepth) out += '</' + (tag.name === 'font' ? 'span' : tag.name) + '>';
      continue;
    }
    if (DROP_TAGS.has(tag.name)) { stack.push({ name: tag.name, drop: true, keep: false }); dropDepth++; continue; }
    const cls = (tag.attrs.find((a) => a[0] === 'class') || [])[1] || '';
    if (cls && WIDGET_CLASS_RE.test(cls)) { stack.push({ name: tag.name, drop: true, keep: false }); dropDepth++; continue; }
    if (!SAFE_TAGS.has(tag.name) || dropDepth) {
      /* thẻ lạ, hoặc đang nằm trong cụm bị bỏ: bóc thẻ, GIỮ chữ bên trong
         (chữ trong cụm bị bỏ thì bị bỏ luôn vì dropDepth > 0) */
      stack.push({ name: tag.name, drop: false, keep: false });
      continue;
    }
    out += buildOpen(tag);
    if (!VOID_TAGS.has(tag.name) && !tag.selfClose) stack.push({ name: tag.name, drop: false, keep: true });
    continue;
  }
  return out;
}

/* Số liệu để bài kiểm tra so sánh trước/sau (đếm thẻ + chữ) */
export function htmlFacts(html) {
  const s = String(html == null ? '' : html);
  const tags = {};
  const re = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/g;
  let m;
  while ((m = re.exec(s))) { const t = m[1].toLowerCase(); tags[t] = (tags[t] || 0) + 1; }
  const text = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const imgs = (s.match(/<img\b/gi) || []).length;
  const scripts = (s.match(/<script\b/gi) || []).length + (s.match(/\son[a-z]+\s*=/gi) || []).length +
    (s.match(/(?:href|src)\s*=\s*["']?\s*(?:javascript|data|vbscript):/gi) || []).length;
  return { tags, text, textLen: text.length, imgs, scripts };
}
