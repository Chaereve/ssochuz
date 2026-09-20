/* ============================================================================
   t_html_contract.js · HỢP ĐỒNG HTML CHƯƠNG (không cần jsdom — module thuần)
   ----------------------------------------------------------------------------
   Hai bảo đảm bắt buộc:
     1. Ổn định (idempotent): dọn hai lần bằng dọn một lần.
     2. Không mất chữ: mọi ký tự chữ trước/sau đều còn nguyên.
   Ngoài ra kiểm: chỉ còn thẻ trong danh sách trắng, không nhân đôi dòng trống,
   chặn javascript:/data:, ảnh Worker về dạng tương đối, và chạy thật trên toàn
   bộ 62 bộ truyện trong data/book để chắc không bộ nào bị nuốt chữ.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const errs = [];
const out = {};

/* Module nguồn viết bằng ESM. Dịch sang CommonJS bằng chính esbuild của repo
   để bài kiểm thử chạy được dưới `node tests/run.js` (CJS). */
function loadContract() {
  const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
  const r = esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'src/admin/lib/html-contract.js')],
    bundle: true, write: false, format: 'cjs', target: ['node18'], platform: 'node',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', r.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}
function loadChapter() {
  const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
  const r = esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'src/admin/lib/chapter.js')],
    bundle: true, write: false, format: 'cjs', target: ['node18'], platform: 'node',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', r.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

const { normalizeChapterHtml } = loadContract();
const { htmlToText } = loadChapter();

/* chữ so sánh: bỏ hết khoảng trắng để không bắt lỗi vì cách xuống dòng */
const letters = (h) => htmlToText(h).replace(/\s+/g, '');

const ALLOWED = new Set(['p', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'hr',
  'strong', 'em', 'u', 's', 'a', 'br', 'figure', 'img', 'figcaption', 'aside']);

function tagsOf(html) {
  const s = new Set();
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b/g;
  let m; while ((m = re.exec(html))) s.add(m[1].toLowerCase());
  return [...s];
}

function check(name, input, fn) {
  const once = normalizeChapterHtml(input);
  const twice = normalizeChapterHtml(once);
  if (once !== twice) errs.push(name + ': KHÔNG ổn định — dọn hai lần ra khác dọn một lần');
  if (letters(input) !== letters(once)) {
    errs.push(name + ': MẤT CHỮ\n    trước: ' + letters(input).slice(0, 160) +
      '\n    sau  : ' + letters(once).slice(0, 160));
  }
  const bad = tagsOf(once).filter((t) => !ALLOWED.has(t));
  if (bad.length) errs.push(name + ': còn thẻ ngoài danh sách trắng: ' + bad.join(', '));
  if (fn) { const e = fn(once); if (e) errs.push(name + ': ' + e); }
  return once;
}

/* ---------------- 1. Trường hợp cơ bản ---------------- */
out.div = check('div → p', '<div>Xin chào</div><div>Dòng hai</div>',
  (h) => h.includes('<div') ? 'vẫn còn <div>' : null);

out.spanRac = check('bóc span/style rác',
  '<p><span style="color:#f00;font-size:22px;font-family:Arial">Chữ đỏ</span> thường</p>',
  (h) => /color|font-size|font-family|<span/.test(h) ? 'còn sót style/span' : null);

out.dongTrong = check('gộp dòng trống',
  '<p>Một</p><p></p><p><br></p><p>&nbsp;</p><div><br></div><p>Hai</p>',
  (h) => {
    const empties = (h.match(/<p>\s*(<br>)?\s*<\/p>/g) || []).length;
    return empties ? 'còn ' + empties + ' đoạn trống' : null;
  });

out.nhieuBr = check('nhiều <br> liên tiếp → 1',
  '<p>Trên<br><br><br><br>Dưới</p>',
  (h) => /(<br>\s*){2,}/.test(h) ? 'còn <br> nhân đôi' : null);

out.textAlign = check('chỉ giữ text-align',
  '<p style="text-align:center;color:red;margin:40px">Giữa</p>',
  (h) => (!/text-align:center/.test(h) ? 'mất text-align' :
    (/color|margin/.test(h) ? 'còn style rác' : null)));

out.dinhDang = check('giữ đậm/nghiêng/gạch/link',
  '<p><b>đậm</b> <i>nghiêng</i> <u>gạch</u> <strike>bỏ</strike> <a href="https://a.vn">link</a></p>',
  (h) => {
    const need = ['<strong>', '<em>', '<u>', '<s>', 'href="https://a.vn"'];
    const miss = need.filter((x) => !h.includes(x));
    return miss.length ? 'thiếu: ' + miss.join(' ') : null;
  });

out.nguyHiem = check('chặn script/iframe/on*/javascript:',
  '<p onclick="x()">an toàn</p><script>alert(1)</script><iframe src="x"></iframe>' +
  '<a href="javascript:alert(1)">bấm</a><img src="data:image/png;base64,AAA">',
  (h) => {
    if (/script|iframe|onclick|javascript:/i.test(h)) return 'còn thứ nguy hiểm';
    if (/data:/i.test(h)) return 'còn ảnh data:';
    return null;
  });

out.anhWorker = check('ảnh Worker tuyệt đối → /api/img/<id>',
  '<figure><img src="https://cms.example.workers.dev/api/img/abc123" alt="bìa"><figcaption>Chú thích</figcaption></figure>',
  (h) => (!h.includes('src="/api/img/abc123"') ? 'chưa đổi về đường dẫn tương đối' :
    (!h.includes('<figcaption>') ? 'mất figcaption' : null)));

out.bang = check('bỏ vỏ bảng nhưng GIỮ chữ trong ô',
  '<table><tr><td>Ô một</td><td>Ô hai</td></tr></table>',
  (h) => {
    if (/<table|<td|<tr/.test(h)) return 'còn thẻ bảng';
    if (!h.includes('Ô một') || !h.includes('Ô hai')) return 'mất chữ trong ô';
    return null;
  });

/* Emoticon `<3` và dấu `<` trong truyện KHÔNG được coi là thẻ. Đây là lỗi thật
   từng gặp khi rà 1202 chương: chữ sau `<3"` bị nuốt sạch. */
out.emoticon = check('emoticon <3 không nuốt chữ phía sau',
  '<div>yêu cậu &lt;3"</div><div>Câu tiếp theo phải còn nguyên.</div>',
  (h) => !h.includes('Câu tiếp theo phải còn nguyên.') ? 'mất câu sau emoticon' : null);
if (!normalizeChapterHtml('<div>a <3"</div><div>Còn đây</div>').includes('Còn đây')) {
  errs.push('emoticon <3 thô làm mất chữ phía sau');
}

out.linkBan = check('link javascript: bị bóc vỏ, giữ chữ',
  '<p>xem <a href="javascript:alert(1)">chỗ này</a> nhé</p>',
  (h) => {
    if (/<a\b/.test(h)) return 'vẫn còn thẻ <a> trơ';
    if (!h.includes('chỗ này')) return 'mất chữ của link';
    return null;
  });

out.chuTran = check('chữ trần được bọc <p>',
  'Chữ không có thẻ nào cả',
  (h) => !/^<p>/.test(h) ? 'chưa bọc <p>' : null);

out.aside = check('lời tác giả giữ class note',
  '<aside class="note">Lời tác giả</aside>',
  (h) => !h.includes('<aside class="note">') ? 'mất aside.note' : null);

out.rong = normalizeChapterHtml('') === '' ? 'ok' : 'LỖI';
if (out.rong !== 'ok') errs.push('chuỗi rỗng phải trả về rỗng');

/* ---------------- 2. Dán từ Word / Google Docs / Notion ---------------- */
const WORD = '<p class="MsoNormal" style="mso-margin-top-alt:auto;line-height:150%">' +
  '<span style=\'font-size:12.0pt;font-family:"Times New Roman",serif;mso-fareast-language:EN-US\'>' +
  'Đoạn văn dán từ Word.</span></p><!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->';
out.word = check('dán Word', WORD, (h) => {
  if (/mso-|MsoNormal|<span|<xml|<o:/i.test(h)) return 'còn rác Word';
  if (!h.includes('Đoạn văn dán từ Word.')) return 'mất chữ';
  return null;
});

const GDOCS = '<b style="font-weight:normal" id="docs-internal-guid-1">' +
  '<p dir="ltr" style="line-height:1.38;margin-top:0pt"><span style="font-weight:700">Tiêu đề đậm</span>' +
  '<span style="font-weight:400"> và chữ thường</span></p></b>';
out.gdocs = check('dán Google Docs', GDOCS, (h) => {
  if (/docs-internal-guid|<span|line-height/.test(h)) return 'còn rác Google Docs';
  if (!h.includes('Tiêu đề đậm')) return 'mất chữ';
  /* <b> bao ngoài <p> phải bị bóc — không được sinh <strong><p> */
  if (/<(strong|em|u|s)>\s*<(p|h2|h3|ul|ol|blockquote)/.test(h)) return 'thẻ inline bọc khối';
  return null;
});

const NOTION = '<div class="notion-text-block" data-block-id="abc"><div style="color:rgb(55,53,47)">' +
  'Khối chữ Notion</div></div><ul class="bulleted-list"><li style="list-style-type:disc">Mục một</li></ul>';
out.notion = check('dán Notion', NOTION, (h) => {
  if (/notion|data-block-id|rgb\(/.test(h)) return 'còn rác Notion';
  if (!h.includes('Mục một')) return 'mất mục danh sách';
  if (!h.includes('<ul>')) return 'mất danh sách';
  return null;
});

/* ---------------- 3. Chạy thật trên toàn bộ kho chương ---------------- */
/* Đây là phép thử quan trọng nhất trước khi bật trình soạn mới: 62 bộ truyện
   có sẵn phải đi qua bộ dọn mà KHÔNG mất một chữ nào. */
const bookDir = path.join(ROOT, 'data/book');
let nBook = 0, nChap = 0;
const lost = [];          /* mất CHỮ THẬT — không bao giờ được phép */
const widget = [];        /* chỉ mất số của nút phân trang — chấp nhận được */
const unstable = [];
for (const f of fs.readdirSync(bookDir).filter((x) => x.endsWith('.json'))) {
  let book;
  try { book = JSON.parse(fs.readFileSync(path.join(bookDir, f), 'utf8')); } catch (e) { continue; }
  nBook++;
  for (const [i, ch] of (book.chapters || []).entries()) {
    nChap++;
    const src = ch.html || '';
    const a = normalizeChapterHtml(src);
    const b = normalizeChapterHtml(a);
    if (a !== b && unstable.length < 5) unstable.push(f + ' · chương ' + (i + 1));

    const before = letters(src), after = letters(a);
    if (before === after) continue;

    /* Phần chữ biến mất là gì? Một số chương cũ nhúng widget phân trang
       (<button>1</button>…<button>14</button>) — đó là giao diện, không phải
       nội dung truyện, bỏ đi là ĐÚNG. Mọi trường hợp khác là lỗi thật. */
    let k = 0; while (k < before.length && before[k] === after[k]) k++;
    const diff = before.slice(k);
    const chiLaSoTrang = /^[0-9]*$/.test(diff) && /<button/i.test(src);
    if (chiLaSoTrang) {
      if (widget.length < 5) widget.push(f + ' · chương ' + (i + 1) + ' (bỏ ' + diff.length + ' ký tự nút phân trang)');
    } else if (lost.length < 5) {
      lost.push(f + ' · chương ' + (i + 1) + ' → ' + JSON.stringify(diff.slice(0, 120)));
    }
  }
}
out.khoChuong = {
  soBo: nBook, soChuong: nChap,
  mucChuThat: lost,
  boWidgetPhanTrang: widget.length ? widget : 'không có',
  khongOnDinh: unstable,
};
if (lost.length) errs.push('kho chương thật bị MẤT CHỮ: ' + lost.join(' | '));
if (unstable.length) errs.push('kho chương thật KHÔNG ổn định: ' + unstable.join(' | '));

out.errors0 = errs;
console.log(JSON.stringify(out, null, 1));
console.log(errs.length ? 'CÒN ' + errs.length + ' LỖI HỢP ĐỒNG HTML' : 'Hợp đồng HTML đạt hết');
process.exit(errs.length ? 1 : 0);
