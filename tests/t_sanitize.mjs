/* ============================================================================
   t_sanitize.mjs · LÀM SẠCH HTML CHƯƠNG — thử tấn công + giữ định dạng
   ----------------------------------------------------------------------------
   Vì sao có bài này: bộ làm sạch là ranh giới an toàn giữa trang quản trị và
   trình duyệt người đọc. Bài kiểm tra này cố tình "tấn công" bằng các mẫu đã
   biết, rồi kiểm lại rằng HTML THẬT của chương (mỗi đoạn là một <div>, ảnh,
   class/style của Blogger) không bị mất.
   Chạy:  cd tests && node t_sanitize.mjs
   Điều kiện đạt: mọi khoá "errors*" là [] và thoát mã 0.
   ========================================================================== */
import { sanitizeChapterHtml, safeUrlValue, safeStyleValue } from '../src/shared/sanitize.js';

const checks = [];
const ck = (name, ok, got, want) => checks.push({ name, ok: !!ok, got, want });

/* ---- 1. mẫu tấn công: phải bị bóc SẠCH ---- */
const attacks = [
  ['script thường', '<p>a</p><script>alert(1)</script>'],
  ['script viết hoa', '<SCRIPT SRC=//evil/x.js></SCRIPT>'],
  ["script lồng trong thuộc tính", '<img src="x" alt="</script><script>alert(1)</script>">'],
  ['img onerror', '<img src="x" onerror="alert(1)">'],
  ['svg onload', '<svg onload="alert(1)"><circle /></svg>'],
  ['body onload', '<body onload="alert(1)">a</body>'],
  ['a javascript:', '<a href="javascript:alert(1)">bấm</a>'],
  ['a javascript lộn chữ', '<a href="JaVaScRiPt:alert(1)">bấm</a>'],
  ['a javascript chèn ký tự điều khiển', '<a href="java\tscript:alert(1)">bấm</a>'],
  ['a data:', '<a href="data:text/html;base64,PHNjcmlwdD4=">bấm</a>'],
  ['a vbscript', '<a href="vbscript:msgbox(1)">bấm</a>'],
  ['img data:', '<img src="data:image/svg+xml;base64,PHN2Zz4=">'],
  ['iframe', '<iframe src="//evil"></iframe>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['object/embed', '<object data="x"><embed src="y"></object>'],
  ['style tag', '<style>body{display:none}</style><p>a</p>'],
  ['style url javascript', '<div style="background:url(javascript:alert(1))">a</div>'],
  ['style expression', '<div style="width:expression(alert(1))">a</div>'],
  ['style position fixed', '<div style="position:fixed;top:0">a</div>'],
  ['link stylesheet', '<link rel="stylesheet" href="//evil/x.css">'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=//evil">'],
  ['base href', '<base href="//evil/">'],
  ['form + input', '<form action="//evil"><input name="p" type="password"><button>Gửi</button></form>'],
  ['template', '<template><script>alert(1)</script></template>'],
  ['comment nhúng script', '<!-- <script>alert(1)</script> --><p>a</p>'],
  ['html entity script', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['nút Blogger chết', '<div class="pagination-container"><button onclick="showPage(1)">1</button><button onclick="showPage(2)">2</button></div>'],
];
for (const [name, html] of attacks) {
  const out = sanitizeChapterHtml(html);
  const lower = out.toLowerCase();
  const bad = /<script|<iframe|<object|<embed|<style|<link|<meta|<base|<form|<input|<button|<template|<svg/.test(lower) ||
    /\son[a-z]+\s*=/.test(lower) ||
    /(href|src)\s*=\s*["']?\s*(javascript|data|vbscript):/.test(lower) ||
    /expression\s*\(/.test(lower) || /position\s*:\s*fixed/.test(lower);
  ck('tấn công bị chặn: ' + name, !bad, out, 'không còn mẫu nguy hiểm');
}
/* chữ trong cụm bị bỏ KHÔNG được sót lại (nút chết “1 2 3…” là rác) */
ck('nút phân trang Blogger bị bỏ cả chữ', sanitizeChapterHtml('<div class="pagination-container"><button>1</button><button>2</button></div>') === '', sanitizeChapterHtml('<div class="pagination-container"><button>1</button><button>2</button></div>'), '');
/* chữ của đoạn văn THẬT vẫn còn */
ck('chữ trong <div> đoạn văn vẫn còn', sanitizeChapterHtml('<div>Đoạn văn thật.</div>').includes('Đoạn văn thật.'), sanitizeChapterHtml('<div>Đoạn văn thật.</div>'), 'còn chữ');

/* ---- 2. HTML THẬT của chương: định dạng + ảnh + link phải giữ ---- */
const keep = [
  ['đoạn văn bằng <div>', '<div>Một</div><div>Hai</div>', '<div>Một</div><div>Hai</div>'],
  ['<p> + <b> + <i>', '<p><b>đậm</b> và <i>nghiêng</i></p>', '<p><b>đậm</b> và <i>nghiêng</i></p>'],
  ['class Blogger giữ nguyên', '<div class="separator">a</div>', '<div class="separator">a</div>'],
  ['style an toàn giữ nguyên', '<div style="height: 12px;">a</div>', '<div style="height: 12px;">a</div>'],
  ['ảnh https giữ nguyên', '<img src="https://blogger.googleusercontent.com/a.jpg" alt="x" loading="lazy">', '<img src="https://blogger.googleusercontent.com/a.jpg" alt="x" loading="lazy">'],
  ['ảnh nội bộ Worker giữ nguyên', '<img src="/api/img/abc123def456">', '<img src="/api/img/abc123def456">'],
  ['link https + target', '<a href="https://a.test/x" target="_blank">nguồn</a>', '<a href="https://a.test/x" target="_blank" rel="noopener noreferrer nofollow">nguồn</a>'],
  ['danh sách', '<ul><li>một</li></ul>', '<ul><li>một</li></ul>'],
  ['hr', '<hr>', '<hr>'],
  ['id vô hại giữ nguyên', '<div id="btn-3">a</div>', '<div id="btn-3">a</div>'],
];
for (const [name, input, want] of keep) {
  const out = sanitizeChapterHtml(input);
  ck('giữ nguyên: ' + name, out === want, out, want);
}
/* id trùng với id của trang đọc → bỏ (chống $() bắt nhầm phần tử của web) */
const dupId = sanitizeChapterHtml('<div id="rdText">a</div><div id="czHeader">b</div>');
ck('bỏ id trùng với trang đọc', !dupId.includes('id='), dupId, 'không còn id');

/* ---- 3. hàm phụ ---- */
ck('safeUrlValue: https ok', safeUrlValue('https://a.test/x') === 'https://a.test/x', safeUrlValue('https://a.test/x'), 'giữ');
ck('safeUrlValue: javascript: bị bỏ', safeUrlValue('javascript:alert(1)') === '', safeUrlValue('javascript:alert(1)'), '');
ck('safeUrlValue: ký tự điều khiển bị bỏ', safeUrlValue('java\u0000script:alert(1)') === '', safeUrlValue('java\u0000script:alert(1)'), '');
ck('safeUrlValue: #neo giữ', safeUrlValue('#phan-2') === '#phan-2', safeUrlValue('#phan-2'), 'giữ');
ck('safeStyleValue: màu ok', safeStyleValue('color: red; text-align: center') === 'color: red; text-align: center', safeStyleValue('color: red; text-align: center'), 'giữ');
ck('safeStyleValue: expression bị bỏ cả chuỗi', safeStyleValue('width: expression(alert(1))') === '', safeStyleValue('width: expression(alert(1))'), '');
ck('safeStyleValue: position fixed → static', safeStyleValue('position: fixed; top: 0') === 'position:static; top: 0', safeStyleValue('position: fixed; top: 0'), 'static');

/* ---- 4. dữ liệu hỏng không làm nổ hàm ---- */
ck('rỗng → rỗng', sanitizeChapterHtml('') === '' && sanitizeChapterHtml(null) === '', [sanitizeChapterHtml(''), sanitizeChapterHtml(null)], ['', '']);
ck('thẻ mở lơ lửng', typeof sanitizeChapterHtml('<div>a') === 'string', sanitizeChapterHtml('<div>a'), 'chuỗi');
ck('dấu < lơ lửng giữ làm chữ', sanitizeChapterHtml('a < b').includes('a < b'), sanitizeChapterHtml('a < b'), 'giữ chữ');
ck('chuỗi rất lớn bị chặn', sanitizeChapterHtml('a'.repeat(5 * 1024 * 1024)) === '', 'chặn', '');

const bad = checks.filter((c) => !c.ok);
console.log(JSON.stringify({
  tongSo: checks.length,
  dat: checks.length - bad.length,
  loi: bad.map((c) => c.name + ' (nhận: ' + JSON.stringify(c.got) + ', cần: ' + JSON.stringify(c.want) + ')'),
}, null, 1));
process.exit(bad.length ? 1 : 0);
