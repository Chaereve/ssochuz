/* ============================================================================
   t_admin_no_demo.js · VÒNG 12: RÀ KĨ TOÀN BỘ /admin, GỠ SẠCH DẤU VẾT MOCKUP
   ----------------------------------------------------------------------------
   Owner phản hồi sau vòng 11: "chỉ mới khắc phục đc sidebar à … sao vẫn còn
   vài chỗ tạo lúc demo mockup z???? làm ơn coi thiệt kĩ lại toàn bộ trang
   admin hiện tại dùm t". Vòng 11 chỉ sửa rail + vài số liệu; thực tế bản phát
   hành vẫn mang theo:

     • nguyên BẢNG ĐIỀU KHIỂN DEMO (nút tròn góc dưới + aside #demo) và 2 chip
       topbar cho ĐỔI GIẢ trạng thái kết nối / quota;
     • 13 mảng SAMPLE_* với 18 "Truyện mẫu", 248 book, 6.420 chương,
       18.400 lượt đọc — lộ rõ khi chưa cấu hình URL Worker;
     • số cứng 3 báo lỗi / 2 spam / 5 khoá / 4 thiếu bìa, quota 18.400,
       "Supabase: unavailable", ngày 03/11 20:40;
     • placeholder/aria-label "… mẫu", trạng rỗng "Dữ liệu mẫu được ẩn.",
       lời dẫn "Dùng bảng điều khiển demo → Đặt lại";
     • toast / mã chết "mô phỏng", "Đã chuyển 248 book … MẪU".

   Bài này khoá 3 tầng:
     (1) MÃ NGUỒN admin.html — ngoài khối DOCS_HTML (tài liệu lịch sử, cố tình
         giữ chữ MẪU) không còn bất kỳ dấu vết prototype nào.
     (2) DOM RENDER THẬT ở CHƯA cấu hình Worker (static, KV rỗng) và ĐÃ cấu
         hình (online, 67 bộ từ registry) — quét 13 tab × 3 trạng thái × 5
         mode đăng nhập × popover × palette × modal × toast, 0 lỗi JS.
     (3) CONTRACT: prototype mockup vẫn là bản MẪU offline (không sửa thiết
         kế), bảng thay thế tools/admin_prod_replacements.json có fail-fast,
         admin-real.js dọn seed ngay tại boot() TRƯỚC render đầu tiên.

   Chạy: node tests/t_admin_no_demo.js   (hoặc npm test)
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const bad = [];
let checks = 0;
const ok = (c, m) => { checks++; if (!c) bad.push(m); };

const prod = R('admin.html');
const mock = R('mockup/ssochuz-admin-mockup.html');
const real = R('admin-real.js');
const gen = R('tools/build_admin_html.mjs');
const repl = JSON.parse(R('tools/admin_prod_replacements.json'));
const reg = JSON.parse(R('data/registry.json'));
const bookSeed = JSON.parse(R('data/book/bake-love-feelings.json'));

/* Tách đúng khối tài liệu lịch sử. MẪU trong đó là SỰ THẬT của prototype,
   không được tính là dữ liệu giả lọt vào giao diện. */
const docsStart = prod.indexOf('const DOCS_HTML =');
const docsEndMark = "\n'</ul></div>';";
const docsEnd = prod.indexOf(docsEndMark, docsStart) + docsEndMark.length;
ok(docsStart > 0 && docsEnd > docsStart, 'xác định được khối DOCS_HTML trong admin.html');
const prodUI = prod.slice(0, docsStart) + prod.slice(docsEnd);
const docsHTML = prod.slice(docsStart, docsEnd);

/* ---------------------------------------------------------------- 1 · NGUỒN */
ok(/^const SAMPLE_BOOKS = \[\];/m.test(prodUI), 'seed SAMPLE_BOOKS rỗng (không mang 18 bộ mẫu)');
ok(/^const SAMPLE_METRICS = \[/m.test(prodUI) && !/\{n:'248'/.test(prodUI), 'seed SAMPLE_METRICS về 0, không còn 248');
ok(/^const SAMPLE_STATS = \{ reads:\[\], likes:\[\], voters:\[\], today:\[\] \};/m.test(prodUI), 'seed SAMPLE_STATS rỗng');
[
  'Truyện mẫu', 'Tác giả mẫu', 'Couple mẫu', 'Độc giả mẫu', 'Chương mẫu',
  'Bản nháp mẫu', 'Lý do slide mẫu', 'Ghi chú mẫu', '18.400', '6.420',
  '03/11 20:40', '20:40:12', 'truyen-mau-', 'mau.example/bai-mau',
  'ten-worker.workers.dev', 'Lingling x Orm', 'Supabase: unavailable',
  'R2: unavailable', 'KV chỉ còn stub', 'Dữ liệu mẫu được ẩn',
  'Dùng bảng điều khiển demo', 'Đặt lại demo', 'BẢNG ĐIỀU KHIỂN DEMO',
  'Đổi mức quota', 'Đổi trạng thái kết nối trong bảng demo',
  'Giả lập khung 360px', 'Dữ liệu mẫu.', 'Đây là dữ liệu mẫu',
  'Mockup: không mở trang web thật', 'Ví dụ design system',
  'Chương 65 · tiêu đề mẫu', 'Bảng thư viện mẫu', 'Ô màu bìa mẫu',
  'Chọn file backup JSON mẫu', 'Tải ảnh bìa mẫu', 'ẢNH<br>MẪU'
].forEach(s => ok(!prodUI.includes(s), 'admin.html (ngoài docs): không còn "' + s + '"'));
ok(!/data-act="demo"/.test(prod), 'admin.html: không còn data-act="demo"');
ok(!/id="demoToggle"/.test(prod) && !/id="demo"/.test(prod), 'admin.html: gỡ hẳn #demoToggle + #demo khỏi DOM');
ok(!/function renderDemo\(/.test(prodUI), 'admin.html: gỡ hẳn renderDemo()/renderDemoContent()');
ok(!/\.demo-toggle\{|\.demo\{|\.demo-hd\{/.test(prodUI), 'admin.html: gỡ CSS của bảng demo');
ok(!/savedAt:'20:40:12'/.test(prodUI) && !/hpNote:'Lịch có thể/.test(prodUI), 'state khởi tạo không còn giờ/ghi chú mẫu');
ok(!/picked:\['b01'/.test(prodUI), 'state.picked không còn id bộ mẫu');
ok(!/Chương 65 · tiêu đề mẫu|ph:'truyen-mau-|ph:'https:\/\/mau\.example/.test(prodUI), 'placeholder/aria-label sạch');

/* Nhãn prototype vẫn đúng ở bản thiết kế offline + tài liệu lịch sử. */
ok(/id="demoToggle"/.test(mock) && /id="demo"/.test(mock), 'prototype mockup GIỮ nguyên bảng demo (file thiết kế)');
ok(/BẢNG ĐIỀU KHIỂN DEMO · MOCKUP/.test(mock), 'prototype mockup giữ tiêu đề MẪU');
ok(/Truyện mẫu 01/.test(mock), 'prototype mockup giữ SAMPLE_BOOKS');
ok(/MẪU/.test(docsHTML), 'tài liệu bàn giao lịch sử vẫn giữ chữ MẪU (có chủ đích)');
ok(/· MẪU/.test(mock) && !/· MẪU/.test(prod), 'prototype có · MẪU, bản phát hành không');
ok(/id="docsTitle">Tài liệu bàn giao · Quản trị ssochuz/.test(prod), 'modal tài liệu đổi tiêu đề, không còn chữ Mockup');

/* Bảng thay thế có kiểm tra fail-fast — mockup đổi tay không được vá sót. */
ok(Array.isArray(repl) && repl.length >= 60, 'bảng admin_prod_replacements.json có ≥ 60 mục, hiện ' + repl.length);
ok(/throw new Error\('build_admin_html: mẫu prototype không còn khớp/.test(gen), 'generator fail-fast khi một mẫu prototype biến mất');
ok(/scrubProto\(/.test(gen) && /DOCS_BLOCK/.test(gen), 'generator dọn mã chết NGOÀI khối tài liệu');
ok(repl.every(r => r.from && typeof r.to === 'string'), 'mọi mục thay thế có from/to hợp lệ');

/* Lớp KV thật: dọn seed tại boot trước render đầu tiên + ép demo đóng. */
ok(/function clearPrototypeSeed\(\)/.test(real), 'admin-real.js có clearPrototypeSeed()');
ok(/if \(STARTED\) return; STARTED = true;\s*\n\s*clearPrototypeSeed\(\);\s*\n\s*window\.render\(\);/.test(real),
  'clearPrototypeSeed() chạy TRƯỚC window.render() đầu tiên trong boot()');
ok(/S\.demoOpen = false;/.test(real) && /panel\.hidden = true/.test(real),
  'mỗi lần render ép bảng demo đóng + rỗng');
ok(/clearPrototypeSeed\(\);/.test(real.slice(real.indexOf('function hydrate(reg)'), real.indexOf('function hydrate(reg)') + 900)),
  'hydrate() vẫn gọi clearPrototypeSeed() (no-op, không dọn mất dữ liệu thật)');
ok(!/request header/i.test(real) && /var headers = \{\};/.test(real),
  'giữ nguyên fix preflight vòng 10: không gửi custom request header');

/* ---------------------------------------------------------------- 2 · DOM */
const ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip', 'alt', 'value'];
const MARKERS = [
  [/MẪU/, 'MẪU'], [/mockup/i, 'mockup'], [/\bdemo\b/i, 'demo'],
  [/mô phỏng/i, 'mô phỏng'], [/dữ liệu mẫu/i, 'dữ liệu mẫu'],
  [/truyện mẫu/i, 'truyện mẫu'], [/tác giả mẫu/i, 'tác giả mẫu'],
  [/couple mẫu/i, 'couple mẫu'], [/chương mẫu/i, 'chương mẫu'],
  [/\bbộ mẫu\b/i, 'bộ mẫu'], [/phiếu mẫu/i, 'phiếu mẫu'],
  [/slide mẫu/i, 'slide mẫu'], [/input mẫu/i, 'input mẫu'],
  [/truyen-mau-/i, 'truyen-mau-'], [/mau\.example/i, 'mau.example'],
  [/ten-worker/i, 'ten-worker'], [/18\.400/, '18.400'], [/6\.420/, '6.420'],
  [/248 book/i, '248 book'], [/248 bộ/i, '248 bộ'],
  [/supabase: unavailable/i, 'Supabase: unavailable'],
  [/đổi mức quota/i, 'Đổi mức quota'],
  [/đổi trạng thái kết nối/i, 'đổi trạng thái kết nối'],
  [/bảng điều khiển/i, 'bảng điều khiển'],
  [/giả lập khung 360px/i, 'giả lập khung 360px'],
  [/03\/11 20:40/, '03/11 20:40'], [/20:40:12/, '20:40:12'],
  [/dữ liệu mẫu được ẩn/i, 'Dữ liệu mẫu được ẩn'],
  [/reset phiếu đã xoá/i, 'Reset phiếu đã xoá'],
  [/chương 65 · tiêu đề mẫu/i, 'Chương 65 · tiêu đề mẫu'],
  [/lý do slide mẫu/i, 'Lý do slide mẫu']
];
function firstBad(s) {
  for (const [re, name] of MARKERS) if (re.test(s)) return name + ' → ' + s.replace(/\s+/g, ' ').slice(0, 110);
  return null;
}

const TABS = ['dashboard', 'thu-vien', 'them-bo', 'sua-bo', 'chuong', 'binh-luan',
  'bao-loi', 'phieu-bau', 'homepage-cms', 'thong-ke', 'kiem-tra-du-lieu',
  'nhat-ky', 'cai-dat'];

function buildDom(online) {
  const pre = online
    ? '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");' +
      'sessionStorage.setItem("cz_kv_key","ADMIN_KEY_QA");}catch(e){}<\/script>'
    : '';
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/,
    pre + '<script>' + real + '</script>');
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, {
    url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window, D = w.document;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};

  if (online) {
    const KV = {
      comments: [{ id: 'c1', uid: 'u1', name: 'Bạn đọc thật', text: 'Chương hay quá', slug: 'bake-love-feelings', ch: 1, createdAt: '2026-11-03T10:00:00Z' }],
      reports: [{ id: 'r1', done: false, text: 'Lỗi chương 3', title: 'Chương 3', slug: 'bake-love-feelings', ch: 3, name: 'Bạn đọc thật' }],
      log: [{ at: '2026-11-03T12:00:00Z', text: 'sửa bộ thật', who: 'admin-key' }],
      stats: { items: { 'bake-love-feelings': { views: 5432, votes: 987, viewsDay: 120 } }, days: Array.from({ length: 14 }, (_, i) => ({ day: '2026-10-' + (20 + i), views: 40 + i * 3 })) },
      voters: { 'bake-love-feelings': [{ key: 'g:abc', at: '2026-11-01T10:00:00Z' }] }
    };
    const resp = (x, st = 200) => ({ ok: st < 400, status: st,
      headers: { get: n => n === 'content-type' ? 'application/json' : '' },
      json: async () => x, text: async () => JSON.stringify(x) });
    w.fetch = (u, o = {}) => {
      const url = new URL(String(u), 'https://ssochuz.pages.dev');
      const p = url.pathname;
      if (p === '/api/health') return Promise.resolve(resp({ ok: true }));
      if (p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
      if (p === '/api/registry') return Promise.resolve(resp(reg));
      if (p === '/api/admin/comments') return Promise.resolve(resp({ ok: true, comments: KV.comments }));
      if (p === '/api/admin/reports') return Promise.resolve(resp({ ok: true, items: KV.reports }));
      if (p === '/api/admin/stats') return Promise.resolve(resp({ ok: true, items: KV.stats.items, days: KV.stats.days }));
      if (p === '/api/admin/log') return Promise.resolve(resp({ ok: true, items: KV.log }));
      if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 137, readsToday: 4021, keys: 82, bytes: 123456, groups: [{ prefix: 'book', keys: 67 }] }));
      if (p === '/api/admin/voters') return Promise.resolve(resp({ ok: true, book: { count: 1, voters: KV.voters[url.searchParams.get('slug')] || [] } }));
      const m = p.match(/^\/api\/book\/([^/]+)$/);
      if (m) return Promise.resolve(resp(m[1] === 'bake-love-feelings' ? bookSeed : { title: m[1], slug: m[1], chapters: [] }));
      if (p === '/data/registry.json') return Promise.resolve(resp(reg));
      if (p.startsWith('/data/book/')) return Promise.resolve(resp(bookSeed));
      return Promise.resolve(resp({ ok: true }));
    };
  }
  return { w, D, errs, dom };
}

function scanRoots(D, w, label) {
  const roots = ['view', 'login', 'topbar', 'sidebar', 'quotaBanner', 'toasts', 'modalRoot'];
  const inDocs = !!D.getElementById('docsTitle');
  roots.forEach(id => {
    if (id === 'modalRoot' && inDocs) return;   // tài liệu lịch sử: cố tình giữ
    const root = D.getElementById(id);
    if (!root) return;
    const tw = D.createTreeWalker(root, w.NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = tw.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (t) { const b = firstBad(t); if (b) bad.push(label + ' · TEXT · ' + b); }
    }
    root.querySelectorAll('[' + ATTRS.join('],[') + ']').forEach(el => {
      ATTRS.forEach(a => {
        const v = el.getAttribute(a);
        if (v) { const b = firstBad(v); if (b) bad.push(label + ' · ATTR ' + a + ' · ' + b); }
      });
    });
  });
}

async function runMode(online) {
  const tag = online ? 'ONLINE' : 'CHƯA CẤU HÌNH';
  const { w, D, errs, dom } = buildDom(online);
  await new Promise(r => setTimeout(r, online ? 2200 : 200));
  const S = w.CZ_MOCKUP && w.CZ_MOCKUP.state;
  ok(!!S, tag + ': lấy được state qua CZ_MOCKUP');
  if (!S) { dom.window.close(); return; }

  ok(S.conn === (online ? 'online' : 'static'), tag + ': trạng thái kết nối = ' + (online ? 'online' : 'static') + ' (thực ' + S.conn + ')');
  ok(S.books.length === (online ? (reg.lib || []).length : 0),
    tag + ': state.books = ' + (online ? reg.lib.length + ' bộ KV thật' : '0 (không lộ 18 bộ mẫu)'));
  ok(S.comments.length === 0 && S.reports.length === 0 && S.votes.length === 0 || online,
    tag + ': chưa cấu hình → không có bình luận/báo lỗi/phiếu mẫu');
  ok(S.demoOpen === false, tag + ': demoOpen luôn false');
  ok(!D.getElementById('demo') && !D.getElementById('demoToggle'), tag + ': không còn #demo / #demoToggle trong DOM');
  ok(D.querySelectorAll('[data-act="demo"]').length === 0, tag + ': không còn data-act="demo"');
  ok(!D.querySelector('.chip[data-act]') && !D.querySelector('.quota[data-act]'),
    tag + ': chip kết nối/quota là nhãn, không phải nút đổi trạng thái giả');

  const before = bad.length;
  TABS.forEach(t => { S.route = t; w.render(); scanRoots(D, w, tag + ' · tab ' + t); });
  ok(bad.length === before, tag + ': 13 tab sạch dấu vết prototype (' + (bad.length - before) + ' lỗi)');

  ['loading', 'error', 'empty'].forEach(mode => {
    S.modes = {}; TABS.forEach(t => S.modes[t] = mode);
    S.route = 'thu-vien'; w.render(); scanRoots(D, w, tag + ' · mode ' + mode);
  });
  S.modes = {};
  S.route = 'dang-nhap'; w.render(); scanRoots(D, w, tag + ' · login');
  ['checking', 'badkey', 'workererr', 'static', 'normal'].forEach(mode => {
    S.modes = { 'dang-nhap': mode }; w.render(); scanRoots(D, w, tag + ' · login ' + mode);
  });
  S.modes = {}; S.route = 'dashboard';
  ['notifOpen', 'accountOpen', 'suggestOpen', 'paletteOpen', 'demoOpen'].forEach(k => {
    S[k] = true; w.render(); scanRoots(D, w, tag + ' · ' + k);
    ok(S.demoOpen === false, tag + ': render() ép demoOpen=false dù bật ' + k);
    S[k] = false;
  });
  try { w.CZ_MOCKUP.openStrong({ title: 'Xoá', phrase: 'XOÁ', act: 'noop' }); w.render(); scanRoots(D, w, tag + ' · modal xác nhận mạnh'); } catch (e) { bad.push(tag + ': openStrong lỗi ' + e.message); }
  ok(errs.length === 0, tag + ': 0 lỗi JS (' + errs.slice(0, 2).join(' | ') + ')');
  dom.window.close();
}

(async () => {
  await runMode(false);
  await runMode(true);

  /* Các thông báo trạng rỗng mới (không còn nhắc tới dữ liệu mẫu / bảng demo). */
  ok(/Chưa có dữ liệu trong KV\./.test(prod), 'trạng rỗng dùng "Chưa có dữ liệu trong KV."');
  ok(/Chưa có phiếu nào trong KV\./.test(prod), 'trạng rỗng phiếu bầu dùng câu KV thật');
  ok(/Chưa có bộ nào trong KV<\/h3>/.test(prod), 'tab Sửa bộ có guard khi KV rỗng');
  ok(!/Dùng bảng điều khiển demo/.test(prod), 'không còn lời dẫn mở bảng demo');

  console.log(JSON.stringify({ bai: 't_admin_no_demo.js / vòng 12', loi: bad.length,
    kiemTra: checks, errors0: bad }, null, 1));
  if (bad.length) { console.log('CÒN LỖI:\n - ' + bad.slice(0, 40).join('\n - ')); process.exit(1); }
})().catch(e => { console.error('CRASH', e); process.exit(2); });
