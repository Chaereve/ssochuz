/* ============================================================================
   t_admin_chapter_editor.js · VÒNG 16: TRÌNH SOẠN CHƯƠNG & XEM TRƯỚC ĐỘC GIẢ
   ----------------------------------------------------------------------------
   Kiểm tra toàn diện phần chỉnh sửa chương (/admin → tab Chương) và khung
   Xem trước độc giả khớp chuẩn hiển thị của truyen.html (src/cz-story.js):

     1. Đổi chương qua lại cập nhật thật DOM #editor (không kẹt chương đầu),
        tự giữ bản nháp khi đang gõ dở và cho phép Khôi phục nháp cục bộ.
     2. Làm sạch HTML chương theo allowlist chuẩn: bỏ spacer Blogger rỗng +
        cụm .pagination-container, giữ nguyên .chat-container / .msg.left /
        .msg.right, .ch-sep, căn lề giữa/phải, blockquote, h2/h3, ảnh /api/img/.
     3. Xem trước độc giả (#readerPreview) dựng đúng <header class="rdhead"> +
        <article class="rtext"> với HTML thật (không ép plainText mất đoạn),
        khớp 1:1 cấu trúc cleanHTML() trên truyen.html, ẩn #editor tại chỗ.
     4. Thanh công cụ định dạng (H2, H3, Trích dẫn, Căn giữa/trái, Đường kẻ,
        Ngăn cách •••, Chèn liên kết qua modal, Xoá định dạng) + tải ảnh vào
        vị trí con trỏ & chuẩn hoá URL /api/img/<id> khi lưu lên KV.
     5. Dán thông minh từ Word / Google Docs qua <template> trơ: giữ đậm /
        nghiêng / gạch chân, gỡ wrapper b[font-weight:normal], chặn 100% XSS.
     6. Hẹn giờ chương đồng bộ chuẩn ISO 8601 + nhập 1 chương & tách nhiều
        chương .txt có modal xem trước, ghi KV nguyên tử bằng 1 lệnh PUT.

   Chạy: node tests/t_admin_chapter_editor.js   (npm test gọi tự động)
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { page } = require('./mk');

const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const bad = [];
let assertions = 0;
const ok = (cond, msg) => { assertions++; if (!cond) bad.push(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BASE = 'https://cms.test';
const SLUG = 'bake-love-feelings';
const RICH_CH0_HTML = [
  '<div style="text-align: center;"><b>MỞ ĐẦU</b></div>',
  '<div style="height: 24px;"></div>',
  '<div>Đoạn mở đầu có <i>chữ nghiêng</i> và <u>gạch chân</u> cùng <a href="https://example.org/ref">liên kết ngoài</a>.</div>',
  '<p class="ch-sep">•••</p>',
  '<div class="chat-container"><div class="msg left"><b>Minh</b>Cậu tới chưa?</div><div class="msg right"><b>An</b>Mình đang đứng trước tiệm bánh!</div></div>',
  '<p><img src="/api/img/ab12cd34ef56" alt="Tiệm bánh chiều mưa" width="600" height="400"></p>',
  '<div class="pagination-container"><button onclick="window.__XSS_BTN=1">Trang tiếp</button></div>'
].join('');

const RICH_CH1_HTML = [
  '<h2>Chương 2 · Đêm mưa cuối thu</h2>',
  '<p>Đoạn riêng của chương hai, tách biệt hoàn toàn với chương mở đầu.</p>',
  '<blockquote>Ánh đèn vàng hắt lên ô cửa kính mờ hơi nước.</blockquote>'
].join('');

const registry = JSON.parse(R('data/registry.json'));
const bookSeed = JSON.parse(R('data/book/bake-love-feelings.json'));
bookSeed.chapters = [
  { t: 'Chương 1 · Tiệm bánh đầu ngõ', html: RICH_CH0_HTML, status: 'published', at: '' },
  { t: 'Chương 2 · Đêm mưa cuối thu', html: RICH_CH1_HTML, status: 'published', at: '' }
];

const KV = {
  registry: JSON.parse(JSON.stringify(registry)),
  books: { [SLUG]: JSON.parse(JSON.stringify(bookSeed)) },
  comments: [],
  reports: [],
  log: [],
  stats: { items: {}, days: [] }
};

const calls = [];
let imgSeq = 0;
const allowLine = R('worker/cms.js').match(/'access-control-allow-headers':\s*'([^']+)'/);
const ALLOWED_HEADERS = new Set(String((allowLine && allowLine[1]) || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));

function resp(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: n => (n.toLowerCase() === 'content-type' ? 'application/json' : '') },
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

function fakeFetch(url, opts = {}) {
  const u = new URL(url, 'https://ssochuz.pages.dev');
  const p = u.pathname;
  const method = opts.method || 'GET';
  const hdr = opts.headers || {};
  const illegal = Object.keys(hdr).filter(h => !ALLOWED_HEADERS.has(h.toLowerCase()));
  if (illegal.length) return Promise.reject(new TypeError('CORS header forbidden: ' + illegal.join(',')));
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ p, method, body });
  const send = (d, st) => Promise.resolve(resp(d, st));

  if (p === '/api/health') return send({ ok: true });
  if (p === '/api/whoami') return hdr['x-admin-key'] ? send({ ok: true, role: 'super_admin' }) : send({ ok: false }, 401);
  if (p === '/api/registry') {
    if (method === 'PUT') { KV.registry = JSON.parse(JSON.stringify(body)); return send({ ok: true }); }
    return send(KV.registry);
  }
  if (p === '/api/admin/kv') return send({ ok: true, writesToday: calls.filter(c => c.method !== 'GET').length, softCap: 900, hardCap: 1000 });
  if (p === '/api/admin/comments') return send({ ok: true, comments: KV.comments });
  if (p === '/api/admin/reports') return send({ ok: true, items: KV.reports });
  if (p === '/api/admin/stats') return send({ ok: true, items: KV.stats.items, days: KV.stats.days });
  if (p === '/api/admin/log') return send({ ok: true, items: KV.log });
  if (p === '/api/img' && method === 'POST') {
    imgSeq += 1;
    const id = body.id || ('chapimg00' + imgSeq);
    return send({ ok: true, id, url: '/api/img/' + id });
  }
  let m = p.match(/^\/api\/book\/([^/]+)\/chapter$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    const b = KV.books[slug] || (KV.books[slug] = { title: slug, slug, chapters: [] });
    if (!Array.isArray(b.chapters)) b.chapters = [];
    if (body.remove) b.chapters.splice(body.index, 1);
    else if (body.from !== undefined) { const [x] = b.chapters.splice(body.from, 1); b.chapters.splice(body.to, 0, x); }
    else b.chapters[body.index] = body.chapter;
    return send({ ok: true, index: body.index });
  }
  m = p.match(/^\/api\/book\/([^/]+)$/);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    if (method === 'PUT') { KV.books[slug] = JSON.parse(JSON.stringify(body)); return send({ ok: true }); }
    return KV.books[slug] ? send(KV.books[slug]) : send({ ok: false }, 404);
  }
  return send({ ok: true });
}

const rawHtml = R('admin.html');
const html = rawHtml.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, '');
const realJs = R('admin-real.js');

const jsErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => jsErrors.push('jsdomError: ' + ((e && e.message) || e)));
vc.on('error', (...a) => jsErrors.push('console.error: ' + a.join(' ')));
const dom = new JSDOM(html, {
  url: 'https://ssochuz.pages.dev/admin',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const w = dom.window;
w.addEventListener('error', e => jsErrors.push('window.error: ' + ((e && e.message) || e)));
w.fetch = (u, o) => fakeFetch(u, o);
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};
w.eval(realJs);

const D = w.document;
const $ = s => D.querySelector(s);
const $$ = s => Array.from(D.querySelectorAll(s));
const S = () => w.CZ_MOCKUP.state;
const click = sel => { const e = $(sel); if (!e) throw new Error('không thấy ' + sel); e.click(); };
function setVal(sel, v) {
  const e = typeof sel === 'string' && sel.startsWith('#') ? $(sel) : (D.getElementById(sel) || $(sel));
  if (!e) throw new Error('không thấy ' + sel);
  e.value = v;
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function selectNodeContents(el) {
  el.focus();
  const r = D.createRange();
  r.selectNodeContents(el);
  const sel = w.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  el.dispatchEvent(new w.Event('mouseup', { bubbles: true }));
  return r;
}
function placeCaretAtEnd(el) {
  el.focus();
  const r = D.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const sel = w.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  el.dispatchEvent(new w.Event('mouseup', { bubbles: true }));
  return r;
}
async function tick(n = 6) { for (let i = 0; i < n; i++) await sleep(20); }

(async () => {
  await sleep(180);

  /* ---- 1 · Đăng nhập & mở tab Chương ---- */
  setVal('gate-api', BASE);
  setVal('gate-key', 'TEST_EDITOR_KEY_V16');
  click('[data-act="connect"]');
  await tick(12);
  ok(S().conn === 'online', 'Kết nối Worker thành công (online)');

  S().selectedBook = SLUG;
  S().chapterBook = SLUG;
  S().route = 'chuong';
  w.render();
  click('[data-act="manage-chapters"]');
  await tick(10);

  const ed0 = $('#editor');
  ok(!!ed0, 'Render khung soạn thảo #editor ở tab Chương');
  ok(ed0.getAttribute('data-book') === SLUG && ed0.getAttribute('data-ch-idx') === '0', '#editor gắn đúng data-book và data-ch-idx=0');
  ok($('#chapterTitle').value === 'Chương 1 · Tiệm bánh đầu ngõ', 'Ô tiêu đề nạp đúng tên chương 1');
  ok(!ed0.querySelector('.pagination-container') && !ed0.querySelector('button'), 'Đã gỡ cụm nút .pagination-container của Blogger khỏi #editor');
  ok(!/height:\s*24px/i.test(ed0.innerHTML), 'Đã gỡ thẻ div spacer rỗng của Blogger khỏi #editor');
  ok(!!ed0.querySelector('.chat-container .msg.left') && !!ed0.querySelector('.msg.right'), 'Giữ nguyên hộp thoại .chat-container / .msg.left / .msg.right trong #editor');
  ok(!!ed0.querySelector('p.ch-sep'), 'Giữ nguyên dấu ngăn cách p.ch-sep trong #editor');
  const centeredP = Array.from(ed0.querySelectorAll('p')).find(p => /center/i.test(p.getAttribute('style') || ''));
  ok(!!centeredP && centeredP.textContent.trim() === 'MỞ ĐẦU', 'Chuyển div căn giữa thành p giữ nguyên text-align: center');
  const edImg0 = ed0.querySelector('img');
  ok(!!edImg0 && edImg0.getAttribute('src') === BASE + '/api/img/ab12cd34ef56', 'Ảnh /api/img/<id> được nối origin Worker khi hiển thị trong #editor');
  ok(w.__XSS_BTN === undefined, 'Không thực thi onclick độc hại khi nạp HTML chương');
  ok(/từ\s*·/.test(($('#chapterStats') || {}).textContent || ''), 'Hiển thị thống kê số từ / ký tự / phút đọc của chương');

  /* ---- 2 · Xem trước độc giả khớp 1:1 với truyen.html (src/cz-story.js) ---- */
  click('[data-act="toggle-preview"]');
  await tick(2);
  const pv = $('#readerPreview');
  ok(!!pv, 'Bấm Xem trước độc giả mở khung #readerPreview');
  ok($('#editor').hidden === true && !!$('#editor'), '#editor chỉ ẩn tại chỗ (hidden=true), không bị hủy khỏi DOM');
  ok(!!pv.querySelector('header.rdhead .rd-title') && pv.querySelector('.rd-title').textContent.includes('Chương 1'), 'Khung xem trước có header.rdhead chuẩn truyen.html kèm tên chương');
  const pvRtext = pv.querySelector('article.rtext');
  ok(!!pvRtext, 'Khung xem trước có article.rtext chuẩn truyen.html');
  ok(!!pvRtext.querySelector('.chat-container .msg.left') && !!pvRtext.querySelector('.msg.right'), 'Xem trước hiển thị đúng bong bóng chat (.chat-container / .msg)');
  ok(!!pvRtext.querySelector('p.ch-sep'), 'Xem trước hiển thị đúng dấu ngăn cách .ch-sep');
  const pvLink = pvRtext.querySelector('a[href="https://example.org/ref"]');
  ok(!!pvLink && pvLink.getAttribute('target') === '_blank' && pvLink.getAttribute('rel') === 'noopener nofollow', 'Xem trước gắn target=_blank + rel="noopener nofollow" giống cleanHTML() trên web');
  const pvImg = pvRtext.querySelector('img');
  ok(!!pvImg && pvImg.getAttribute('loading') === 'lazy' && pvImg.getAttribute('decoding') === 'async' && !pvImg.hasAttribute('width') && !pvImg.hasAttribute('height'), 'Xem trước chuẩn hoá thẻ img (loading=lazy, decoding=async, bỏ width/height cứng) giống cleanHTML()');

  /* Đối chiếu trực tiếp với trang đọc công khai truyen.html */
  const pubReader = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + SLUG + '/#chuong-1',
    config: { CZ_API: '' },
    fetch: (u) => {
      const pu = new URL(u, 'https://ssochuz.pages.dev').pathname;
      if (pu.endsWith('/data/registry.json') || pu === '/api/registry') return Promise.resolve(resp(KV.registry));
      if (pu.endsWith('/data/book/' + SLUG + '.json') || pu === '/api/book/' + SLUG) return Promise.resolve(resp(KV.books[SLUG]));
      return Promise.resolve(resp({ ok: false }, 404));
    }
  });
  await sleep(650);
  const pubRtext = pubReader.doc.querySelector('#rdText');
  ok(!!pubRtext && pubReader.doc.body.classList.contains('reading'), 'truyen.html dựng #rdText (.rtext) cho cùng chương 1');
  if (pubRtext) {
    ok(pubRtext.querySelectorAll('p').length === pvRtext.querySelectorAll('p').length, 'Số thẻ <p> trong Xem trước khớp 1:1 với #rtext trên truyen.html (' + pvRtext.querySelectorAll('p').length + ' vs ' + pubRtext.querySelectorAll('p').length + ')');
    ok(pubRtext.querySelectorAll('.chat-container .msg').length === pvRtext.querySelectorAll('.chat-container .msg').length, 'Số tin nhắn .msg trong Xem trước khớp 1:1 với truyen.html');
    ok(pubRtext.textContent.replace(/\s+/g, ' ').trim() === pvRtext.textContent.replace(/\s+/g, ' ').trim(), 'Văn bản hiển thị trong Xem trước khớp 1:1 với truyen.html');
  }

  /* Đóng xem trước quay về đúng #editor */
  click('[data-act="toggle-preview"]');
  await tick(2);
  ok(!$('#readerPreview') && $('#editor').hidden === false, 'Đóng xem trước trả lại #editor ngay lập tức');

  /* ---- 3 · Đổi chương qua lại cập nhật thật #editor & giữ bản nháp ---- */
  click('[data-act="chapter-select"][data-idx="1"]');
  await tick(3);
  ok(S().activeChapter === 1, 'Chuyển sang chương 2 (activeChapter=1)');
  ok($('#chapterTitle').value === 'Chương 2 · Đêm mưa cuối thu', 'Ô tiêu đề đổi sang Chương 2');
  ok($('#editor').getAttribute('data-ch-idx') === '1', '#editor cập nhật data-ch-idx=1');
  ok(!!$('#editor').querySelector('h2') && !!$('#editor').querySelector('blockquote') && !$('#editor').textContent.includes('Tiệm bánh!'), '#editor nạp đúng nội dung Chương 2, không còn kẹt nội dung Chương 1');

  /* Gõ thêm nội dung ở Chương 2 (chưa bấm Lưu KV), đổi về Chương 1 rồi quay lại Chương 2 */
  $('#editor').insertAdjacentHTML('beforeend', '<p id="unsavedPara">Đoạn gõ thêm chưa lưu lên KV.</p>');
  $('#editor').dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(620); /* chờ autosave nháp localStorage */
  ok(/Chưa lưu KV/.test($('#saveNote').textContent), '#saveNote báo trạng thái Chưa lưu KV khi đang gõ dở');
  const draftRaw = w.localStorage.getItem('cz_chapter_draft:' + SLUG + ':1');
  ok(!!draftRaw && draftRaw.includes('Đoạn gõ thêm chưa lưu lên KV.'), 'Tự động lưu bản nháp cục bộ theo đúng khoá (slug, index)');

  click('[data-act="chapter-select"][data-idx="0"]');
  await tick(3);
  ok($('#editor').textContent.includes('MỞ ĐẦU') && !$('#editor').textContent.includes('Đoạn gõ thêm chưa lưu lên KV.'), 'Quay về Chương 1 hiển thị đúng Chương 1');

  click('[data-act="chapter-select"][data-idx="1"]');
  await tick(3);
  ok($('#editor').textContent.includes('Đoạn gõ thêm chưa lưu lên KV.'), 'Quay lại Chương 2 giữ nguyên đoạn đang gõ dở chưa lưu');

  /* Giả lập xoá nhầm trong #editor rồi bấm Khôi phục nháp */
  $('#editor').innerHTML = '<p>Nội dung gõ nhầm</p>';
  click('[data-act="restore-draft"]');
  await tick(3);
  ok($('#editor').textContent.includes('Đoạn gõ thêm chưa lưu lên KV.'), 'Nút Khôi phục nháp lấy lại đúng bản nháp đã lưu ở localStorage');

  /* ---- 4 · Thanh công cụ định dạng gọn (không còn H2/H3, chèn link, đường kẻ ngang) ---- */
  ok(!$('.ed-toolbar [data-cmd="h2"]') && !$('.ed-toolbar [data-cmd="h3"]'), 'Đã gỡ nút H2 và H3 khỏi thanh công cụ chỉnh sửa chương');
  ok(!$('.ed-toolbar [data-cmd="link"]') && !$('.ed-toolbar [data-cmd="hr"]'), 'Đã gỡ nút Chèn liên kết và Đường kẻ ngang khỏi thanh công cụ chỉnh sửa chương');

  $('#editor').innerHTML = '<p id="fmtTarget">Đoạn trích thử nghiệm</p>';
  selectNodeContents($('#editor #fmtTarget'));
  click('[data-act="format"][data-cmd="quote"]');
  await tick(2);
  ok(!!$('#editor blockquote'), 'Nút Trích dẫn bọc đoạn đang chọn vào <blockquote>');

  selectNodeContents($('#editor blockquote'));
  click('[data-act="format"][data-cmd="quote"]');
  await tick(2);
  ok(!$('#editor blockquote'), 'Bấm lại Trích dẫn gỡ bọc <blockquote>');

  selectNodeContents($('#editor p'));
  click('[data-act="format"][data-cmd="align-center"]');
  await tick(2);
  ok(/center/i.test($('#editor p').style.textAlign || ''), 'Nút Căn giữa đặt text-align: center cho đoạn');

  placeCaretAtEnd($('#editor'));
  click('[data-act="insert-separator"]');
  await tick(2);
  ok(!!$('#editor p.ch-sep') && $('#editor p.ch-sep').textContent.includes('•••'), 'Nút Ngăn cách chèn <p class="ch-sep">•••</p> tại con trỏ');

  /* ---- 5 · Dán thông minh từ Word / Google Docs & chặn XSS ---- */
  placeCaretAtEnd($('#editor'));
  const gdocsHtml = '<html><body><!--StartFragment--><b style="font-weight:normal;" id="docs-internal-guid-abc"><p dir="ltr"><span style="font-weight:700;font-family:Arial">Đậm từ Docs</span> và <span style="font-style:italic;text-decoration:underline">nghiêng gạch</span></p></b><script>window.__PASTE_XSS=1</script><img src="javascript:alert(1)" onerror="window.__PASTE_XSS=2"><!--EndFragment--></body></html>';
  const pasteEv = new w.Event('paste', { bubbles: true, cancelable: true });
  pasteEv.clipboardData = {
    items: [],
    getData: type => (type === 'text/html' ? gdocsHtml : 'Đậm từ Docs và nghiêng gạch')
  };
  $('#editor').dispatchEvent(pasteEv);
  await tick(3);
  ok(pasteEv.defaultPrevented === true, 'Sự kiện dán vào #editor được xử lý bởi bộ lọc dán thông minh');
  ok(!!$('#editor strong') && $('#editor strong').textContent.includes('Đậm từ Docs'), 'Dán từ Google Docs giữ đúng chữ in đậm (<strong>) và gỡ wrapper b[font-weight:normal]');
  ok(!!$('#editor em u, #editor u em'), 'Dán từ Google Docs giữ đúng chữ in nghiêng + gạch chân');
  ok(!$('#editor script') && w.__PASTE_XSS === undefined, 'Dán HTML độc hại qua <template> trơ chặn tuyệt đối <script> và onerror');

  /* ---- 6 · Tải ảnh vào vị trí con trỏ & chuẩn hoá URL /api/img/ khi lưu KV ---- */
  placeCaretAtEnd($('#editor'));
  const imgInput = $('[data-role="chapter-image"]');
  const fakePng = new w.File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'minh-hoa-moi.png', { type: 'image/png' });
  Object.defineProperty(imgInput, 'files', { value: [fakePng], configurable: true });
  imgInput.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(12);
  const uploadedImg = Array.from($$('#editor img')).find(im => (im.getAttribute('src') || '').includes('/api/img/'));
  ok(calls.some(c => c.p === '/api/img' && c.method === 'POST'), 'Chọn ảnh chương gọi POST /api/img lên Worker');
  ok(!!uploadedImg && uploadedImg.getAttribute('src').startsWith(BASE + '/api/img/'), 'Ảnh tải lên được chèn vào #editor kèm origin Worker để xem được ngay');

  /* ---- 7 · Hẹn giờ chương chuẩn ISO 8601 & Lưu chương lên KV ---- */
  setVal('chapterStatus', 'scheduled');
  await tick(3);
  const atInp = $('#chapterAt');
  ok(!!atInp && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(atInp.value), 'Chọn trạng thái Hẹn giờ tự điền sẵn mốc datetime-local hợp lệ');
  setVal('chapterAt', '2027-12-24T20:30');
  setVal('chapterTitle', 'Chương 2 · Đêm mưa đã biên tập');

  const putCountBefore = calls.filter(c => c.p === '/api/book/' + SLUG + '/chapter' && c.method === 'PUT').length;
  click('[data-act="save-chapter"]');
  await tick(10);
  const putCountAfter = calls.filter(c => c.p === '/api/book/' + SLUG + '/chapter' && c.method === 'PUT').length;
  ok(putCountAfter === putCountBefore + 1, 'Bấm Lưu chương gửi PUT /api/book/<slug>/chapter');

  const savedChap = KV.books[SLUG].chapters[1];
  ok(savedChap.t === 'Chương 2 · Đêm mưa đã biên tập', 'KV lưu đúng tên chương mới (trường t)');
  ok(savedChap.status === 'scheduled' && savedChap.at === new Date('2027-12-24T20:30').toISOString(), 'KV lưu đúng status=scheduled và chuỗi thời gian chuẩn ISO 8601');
  ok(savedChap.html.includes('src="/api/img/') && !savedChap.html.includes('src="' + BASE + '/api/img/'), 'KV lưu URL ảnh dạng tương đối chuẩn /api/img/<id> (không dính cứng tên miền Worker)');
  ok(!w.localStorage.getItem('cz_chapter_draft:' + SLUG + ':1'), 'Sau khi lưu KV thành công, tự xoá bản nháp tạm trong localStorage');
  const bookInState = S().books.find(b => b.id === SLUG);
  ok(!!bookInState && Number(bookInState.pending) >= 1, 'Cập nhật ngay số chương hẹn giờ (pending) của bộ trong state.books');

  /* Chặn lưu nếu trong #editor còn ảnh blob:/data: chưa tải lên Worker */
  $('#editor').insertAdjacentHTML('beforeend', '<p><img src="blob:https://ssochuz.pages.dev/fake-local-blob"></p>');
  const writesBeforeGuard = calls.filter(c => c.method === 'PUT').length;
  click('[data-act="save-chapter"]');
  await tick(4);
  /* blob: bị bộ lọc URL an toàn gỡ bỏ hoặc chặn, tuyệt đối không bao giờ lọt vào KV */
  ok(!JSON.stringify(KV.books[SLUG]).includes('blob:'), 'Tuyệt đối không để lọt URL ảnh blob: cục bộ vào KV');
  void writesBeforeGuard;

  /* ---- 8 · Nhập 1 file .txt & tách nhiều chương .txt có modal xem trước ---- */
  const singleInput = $('[data-role="import-file"][data-kind="single"]');
  const singleTxt = new w.File(['Chương 2 · Bản thảo sạch\n\nĐoạn một từ file txt.\n\nĐoạn hai từ file txt.'], 'chuong-2.txt', { type: 'text/plain' });
  Object.defineProperty(singleInput, 'files', { value: [singleTxt], configurable: true });
  singleInput.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(10);
  ok($('#chapterTitle').value === 'Chương 2 · Bản thảo sạch', 'Nhập 1 file .txt tự nhận diện dòng tiêu đề chương đầu file');
  ok($('#editor').querySelectorAll('p').length === 2 && $('#editor').textContent.includes('Đoạn hai từ file txt.'), 'Nhập 1 file .txt tách đúng các đoạn <p> vào #editor');

  const multiInput = $('[data-role="import-file"][data-kind="multi"]');
  const multiContent = [
    'Chương 3: Gió đầu mùa',
    'Nội dung chương ba đoạn một.',
    '',
    'Nội dung chương ba đoạn hai.',
    '',
    'Chương 4: Hẹn ước mùa đông',
    'Nội dung chương bốn.',
    '',
    'Ngoại truyện 1: Sau cơn mưa',
    'Nội dung ngoại truyện.'
  ].join('\n');
  const multiTxt = new w.File([multiContent], 'tron-bo-3-chuong.txt', { type: 'text/plain' });
  Object.defineProperty(multiInput, 'files', { value: [multiTxt], configurable: true });
  multiInput.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick(10);

  const modalRoot = $('#modalRoot');
  ok(!!modalRoot && modalRoot.textContent.includes('3 chương') && modalRoot.textContent.includes('Ngoại truyện 1: Sau cơn mưa'), 'Nhập nhiều chương mở modal xem trước danh sách 3 chương tách được');

  const fullBookPutsBefore = calls.filter(c => c.p === '/api/book/' + SLUG && c.method === 'PUT').length;
  click('[data-act="import-confirm"]');
  await tick(12);
  const fullBookPutsAfter = calls.filter(c => c.p === '/api/book/' + SLUG && c.method === 'PUT').length;
  ok(fullBookPutsAfter === fullBookPutsBefore + 1, 'Xác nhận nhập nhiều chương chỉ tốn ĐÚNG 1 lệnh PUT /api/book/<slug> nguyên tử');
  ok(KV.books[SLUG].chapters.length === 5 && KV.books[SLUG].chapters[4].t === 'Ngoại truyện 1: Sau cơn mưa', 'KV nối thêm đủ 3 chương mới (tổng 5 chương) đúng thứ tự và nội dung');
  ok(S().chapters.length === 5, 'Danh sách chương trên giao diện cập nhật ngay lên 5 chương');

  /* ---- 9 · Chuẩn hoá cách dòng đoạn văn (không nhân đôi/nhân ba khoảng trống giữa các đoạn) ---- */
  KV.books['the-fire'] = {
    slug: 'the-fire',
    title: 'The Fire',
    chapters: [{
      t: 'Chương 1: Kiểm chứng nhịp cách dòng',
      status: 'published',
      html: [
        '<div><div>Buổi sáng thứ ba của kỳ thực tập, tòa nhà AKKR vẫn ồn ào.</div>',
        '<div><br></div>',
        '<p><br></p>',
        '<p>Nhưng đối với Phakhwan, hôm nay có chút khác biệt.</p>',
        '<p>&nbsp;</p>',
        '<br>',
        '<div style="height: 12px;"></div>',
        '<p>"Ơn trời. Bảng màu may mắn nói rằng hôm nay nên mặc màu xanh lá."<br><br>Cô mỉm cười bước vào thang máy.</p>',
        '<div class="ch-sep">* * *</div>',
        '<p><br></p>',
        '<p>Câu thơ một<br>Câu thơ hai giữ nguyên ngắt dòng mềm</p>',
        '<p><img src="/api/img/anh-1" alt="Minh hoạ"></p></div>'
      ].join('')
    }]
  };
  const chBookSel = $('[data-role="chapter-book"]');
  chBookSel.value = 'the-fire';
  chBookSel.dispatchEvent(new w.Event('change', { bubbles: true }));
  click('[data-act="manage-chapters"]');
  await tick(10);

  const edParas6 = Array.from($$('#editor > p:not(.ch-sep)'));
  const edEmptySpacers = edParas6.filter(p => !p.querySelector('img') && !(p.textContent || '').replace(/\s+/g, ''));
  ok(edEmptySpacers.length === 0, '#editor dọn sạch 100% khối rỗng (<p><br></p>, <p>&nbsp;</p>, <div><br></div>, spacer Blogger)');
  ok(edParas6.length === 6, '#editor tách đúng 5 đoạn chữ + 1 đoạn ảnh (gồm cả tách <br><br> thành 2 <p>), không sót khối rỗng: thực tế=' + edParas6.length);
  ok(!!$('#editor .ch-sep') && $('#editor .ch-sep').textContent.includes('* * *'), 'Giữ nguyên dải ngăn cách cảnh .ch-sep');
  ok(edParas6.some(p => p.innerHTML.includes('<br>') && p.textContent.includes('Câu thơ một')), 'Giữ nguyên 1 thẻ <br> ngắt dòng mềm trong thơ/thoại');

  /* Bật Xem trước độc giả và đối chiếu 1:1 với truyen.html */
  click('[data-act="toggle-preview"]');
  await tick(3);
  const pv6 = $('#readerPreview .rtext');
  const pv6Empty = Array.from(pv6.querySelectorAll('p,div')).filter(el => !el.classList.contains('ch-sep') && !el.querySelector('img') && !(el.textContent || '').replace(/\s+/g, ''));
  ok(pv6Empty.length === 0 && pv6.querySelectorAll('p:not(.ch-sep)').length === 6, 'Xem trước độc giả hiển thị đúng 6 khối <p>, 0 dòng trống thừa giữa các đoạn');

  const pubReader6 = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/the-fire/#chuong-1',
    config: { CZ_API: '' },
    fetch: (u) => {
      const pu = new URL(u, 'https://ssochuz.pages.dev').pathname;
      if (pu.endsWith('/data/registry.json') || pu === '/api/registry') return Promise.resolve(resp(KV.registry));
      if (pu.endsWith('/data/book/the-fire.json') || pu === '/api/book/the-fire') return Promise.resolve(resp(KV.books['the-fire']));
      return Promise.resolve(resp({ ok: false }, 404));
    }
  });
  await sleep(650);
  const pub6 = pubReader6.doc.querySelector('#rdText');
  const pub6Empty = Array.from(pub6.querySelectorAll('p,div')).filter(el => !el.classList.contains('ch-sep') && !el.querySelector('img') && !(el.textContent || '').replace(/\s+/g, ''));
  ok(pub6Empty.length === 0, 'truyen.html (cleanHTML) cũng dọn sạch 100% khối rỗng <p><br></p> thừa giữa các đoạn');
  ok(pub6.querySelectorAll('p').length === pv6.querySelectorAll('p').length, 'Số khối <p> khớp 1:1 giữa Xem trước /admin và truyen.html (' + pv6.querySelectorAll('p').length + ')');

  /* Đóng xem trước & kiểm chứng dán văn bản nhiều dòng trống + dán HTML từ Word/Docs */
  click('[data-act="toggle-preview"]');
  await tick(2);
  $('#editor').innerHTML = '<p><br></p>';
  placeCaretAtEnd($('#editor'));
  const plainPasteEv = new w.Event('paste', { bubbles: true, cancelable: true });
  plainPasteEv.clipboardData = {
    items: [],
    getData: type => (type === 'text/plain' ? 'Đoạn văn thứ nhất.\r\n\r\n\r\nĐoạn văn thứ hai.\n   \nĐoạn văn thứ ba.' : '')
  };
  $('#editor').dispatchEvent(plainPasteEv);
  await tick(3);
  const plainParas = Array.from($$('#editor > p')).filter(p => (p.textContent || '').trim());
  const plainSpacers = Array.from($$('#editor > p, #editor > div')).filter(el => !(el.textContent || '').replace(/\s+/g, ''));
  ok(plainParas.length === 3 && plainSpacers.length === 0, 'Dán văn bản thuần có nhiều dòng trống liên tiếp tạo đúng 3 <p> liền kề, 0 dòng trống thừa');

  $('#editor').innerHTML = '<p><br></p>';
  placeCaretAtEnd($('#editor'));
  const wordSpacerHtml = '<p class="MsoNormal">Đoạn Word A</p><p class="MsoNormal"><o:p>&nbsp;</o:p></p><br><p class="MsoNormal">Đoạn Word B<br><br>Đoạn Word C</p>';
  const wordPasteEv = new w.Event('paste', { bubbles: true, cancelable: true });
  wordPasteEv.clipboardData = {
    items: [],
    getData: type => (type === 'text/html' ? wordSpacerHtml : 'Đoạn Word A\n\nĐoạn Word B\n\nĐoạn Word C')
  };
  $('#editor').dispatchEvent(wordPasteEv);
  await tick(3);
  const wordParas = Array.from($$('#editor > p')).filter(p => (p.textContent || '').trim());
  const wordSpacers = Array.from($$('#editor > p, #editor > div')).filter(el => !(el.textContent || '').replace(/\s+/g, ''));
  ok(wordParas.length === 3 && wordSpacers.length === 0, 'Dán HTML từ Word/Docs (<p>&nbsp;</p>, <br> giữa đoạn, <br><br> trong đoạn) chuẩn hoá thành đúng 3 <p> sạch, 0 khối rỗng');

  click('[data-act="save-chapter"]');
  await tick(8);
  ok(!/<p>(?:\s|<br\s*\/?>|&nbsp;)*<\/p>/i.test(KV.books['the-fire'].chapters[0].html), 'HTML lưu lên KV không còn bất kỳ khối <p><br></p> hay <p>&nbsp;</p> rỗng nào');

  ok(jsErrors.length === 0, '0 lỗi runtime JS trong suốt bài kiểm thử: ' + jsErrors.join(' | '));

  const out = { assertions, errors0: bad };
  console.log(JSON.stringify(out, null, 1));
  process.exit(bad.length ? 1 : 0);
})();
