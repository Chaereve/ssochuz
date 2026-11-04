/* ============================================================================
   t_admin_series_page.js · VÒNG 15: CARD 12 BỘ + TRANG ĐẦY ĐỦ, CHỌN KHÔNG TRẦN
   ----------------------------------------------------------------------------
   Owner: "chỉnh lại, chỗ chuyển thể series hiển thị tối đa là 12 bộ nhưng số
   lượng đc chọn nhiều hơn, hiện nút xem thêm rồi mở ra 1 trang toàn những bộ
   chuyển thể á".

   Vòng 14 đã sửa lỗi cụt danh sách bằng cách liệt kê 67 checkbox ngay trong
   card Homepage CMS + khoá trần 12. Owner muốn gọn lại: card chỉ HIỆN TỐI ĐA
   12 bộ, nhưng SỐ LƯỢNG ĐƯỢC CHỌN KHÔNG CÒN BỊ GIỚI HẠN 12; nút "Xem thêm"
   mở MỘT TRANG toàn màn hình liệt kê TOÀN BỘ bộ trong KV (có tìm kiếm, chọn
   tất cả, lưu thẳng lên KV).

   Bài này khoá: nguồn phát hành/lớp KV · card 12 bộ · overlay 67 bộ có ảnh bìa
   thật · lọc theo tên/tác giả/slug · tick vượt 12 · chọn/bỏ tất cả · 3 bộ đếm
   đồng bộ · ghi PUT /api/registry với editorChoice > 12 · đóng bằng nút/Esc ·
   13 tab 0 lỗi JS ở cả online 67 bộ và chưa cấu hình.

   Chạy: node tests/t_admin_series_page.js   (hoặc npm test)
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const bad = [];
let checks = 0;
const ok = (c, m) => { checks++; if (!c) bad.push(m); };

const prod = R('admin.html'), real = R('admin-real.js'), mock = R('mockup/ssochuz-admin-mockup.html');
const reg = JSON.parse(R('data/registry.json'));
const bookSeed = JSON.parse(R('data/book/bake-love-feelings.json'));
const repl = JSON.parse(R('tools/admin_prod_replacements.json'));

const ds = prod.indexOf('const DOCS_HTML =');
const de = prod.indexOf("\n'</ul></div>';", ds) + "\n'</ul></div>';".length;
const prodUI = prod.slice(0, ds) + prod.slice(de);
const LIBN = reg.lib.length, CHOICE = reg.editorChoice.slice();

/* ------------------------------------------------------------ 1 · NGUỒN */
ok(/function openSeriesPage\(\)/.test(prodUI) && /function closeSeriesPage\(\)/.test(prodUI),
  'bản phát hành có openSeriesPage() / closeSeriesPage()');
ok(/function seriesPageFilter\(q\)/.test(prodUI) && /function syncSeriesCount\(\)/.test(prodUI),
  'có lọc theo từ khoá + đồng bộ bộ đếm');
ok(/\.series-page\{position:fixed;inset:0/.test(prodUI) && /\.series-grid\{/.test(prodUI),
  'CSS trang toàn màn hình + lưới bộ (dùng token :root)');
ok(/case 'series-page':openSeriesPage\(\);break;/.test(prodUI), 'nút Xem thêm được nối vào handler');
ok(/data-act="series-save"/.test(prodUI) && /data-act="series-all"/.test(prodUI) && /data-act="series-none"/.test(prodUI),
  'trang có Lưu / Chọn tất cả / Bỏ chọn tất cả');
ok(/id="seriesPickedGrid"/.test(prodUI) && /state\.picked\.slice\(0,12\)/.test(prodUI),
  'card Homepage CMS cứng tối đa 12 bộ');
ok(/Xem thêm · tất cả '/.test(prodUI), 'nhãn nút Xem thêm có tổng số bộ thật');
ok(!/S\.picked\.length >= 12/.test(real) && !/Chuyển thể Series tối đa 12 bộ/.test(real),
  'admin-real.js KHÔNG còn chặn 12 lựa chọn');
ok(/var picked = S\.picked\.slice\(\);/.test(real) && /next\.editorChoice = picked/.test(real),
  'ghi nguyên vẹn lựa chọn (có thể > 12) ra editorChoice');
ok(/seriesPageCount/.test(real) && /seriesPageFootCount/.test(real),
  'listener change cập nhật cả bộ đếm trên trang');
ok(!/state\.books\.slice\(0,6\)/.test(prodUI) && /function bookOptions\(/.test(prodUI),
  'giữ nguyên fix vòng 14: ô chọn bộ vẫn đủ 67');
ok(/state\.books\.slice\(0,8\)/.test(mock), 'prototype mockup vẫn là bản thiết kế, không đụng');
ok(Array.isArray(repl) && repl.length >= 145, 'bảng thay thế ≥ 145 mục, hiện ' + repl.length);

/* ------------------------------------------------------------------ DOM */
const resp = (x, st = 200) => ({ ok: st < 400, status: st,
  headers: { get: n => n === 'content-type' ? 'application/json' : '' },
  json: async () => x, text: async () => JSON.stringify(x) });

function build(online) {
  let REG = JSON.parse(JSON.stringify(reg));
  const puts = [], errs = [];
  const pre = online
    ? '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");' +
      'sessionStorage.setItem("cz_kv_key","ADMIN_KEY_QA");}catch(e){}<\/script>' : '';
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/,
    pre + '<script>' + real + '</script>');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, D = w.document;
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
  if (online) w.fetch = (u, o = {}) => {
    const p = new URL(String(u), 'https://ssochuz.pages.dev').pathname;
    if (p === '/api/registry' && (o.method || 'GET') === 'PUT') {
      const body = JSON.parse(o.body); puts.push(body); REG = body;
      return Promise.resolve(resp({ ok: true, rev: String(Date.now()) }));
    }
    if (p === '/api/registry') return Promise.resolve(resp(REG));
    if (p === '/api/health') return Promise.resolve(resp({ ok: true }));
    if (p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
    if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 137, readsToday: 4000, keys: 82, groups: [] }));
    if (p === '/api/admin/comments') return Promise.resolve(resp({ ok: true, comments: [] }));
    if (p === '/api/admin/reports') return Promise.resolve(resp({ ok: true, items: [] }));
    if (p === '/api/admin/stats') return Promise.resolve(resp({ ok: true, items: {}, days: [] }));
    if (p === '/api/admin/log') return Promise.resolve(resp({ ok: true, items: [] }));
    if (p === '/api/admin/voters') return Promise.resolve(resp({ ok: true, book: { count: 0, voters: [] } }));
    if (/^\/api\/book\//.test(p)) return Promise.resolve(resp(bookSeed));
    if (p === '/data/registry.json') return Promise.resolve(resp(REG));
    return Promise.resolve(resp({ ok: true }));
  };
  return { w, D, dom, errs, puts };
}
const fire = (el, t) => el.dispatchEvent(new el.ownerDocument.defaultView.Event(t, { bubbles: true }));
const TABS = ['dashboard','thu-vien','them-bo','sua-bo','chuong','binh-luan',
  'bao-loi','phieu-bau','homepage-cms','thong-ke','kiem-tra-du-lieu','nhat-ky','cai-dat'];

async function main() {
  /* ------------------------------------------------------ ONLINE · KV 67 BỘ */
  const on = build(true);
  await new Promise(r => setTimeout(r, 2300));
  const { w, D, errs, puts } = on;
  const S = w.CZ_MOCKUP && w.CZ_MOCKUP.state;
  ok(!!S && S.conn === 'online' && S.books.length === LIBN, 'ONLINE: ' + LIBN + ' bộ từ KV');
  ok(!!S && S.picked.length === CHOICE.length, 'ONLINE: 12 editorChoice thật');

  S.route = 'homepage-cms'; w.render();
  const card = [...D.querySelectorAll('#seriesPickedGrid [data-role="picked"]')];
  ok(card.length === 12, 'card: đúng 12 checkbox (trước 67)');
  ok(card.filter(x => x.checked).length === 12, 'card: cả 12 đều đã chọn');
  ok(card.every(x => CHOICE.indexOf(x.dataset.id) >= 0), 'card: 12 bộ đều là editorChoice thật');
  ok((D.getElementById('hpPickedCount') || {}).textContent === '12', 'card: bộ đếm = 12');
  const more = D.querySelector('[data-act="series-page"]');
  ok(!!more && more.textContent.indexOf('tất cả ' + LIBN + ' bộ') >= 0,
    'nút Xem thêm ghi rõ tổng ' + LIBN + ' bộ');
  ok(!D.getElementById('seriesPage'), 'trang Series chưa mở lúc đầu');

  /* ---------------------------------------------------- MỞ TRANG ĐẦY ĐỦ */
  more.click();
  const host = D.getElementById('seriesPage');
  ok(!!host, 'bấm Xem thêm → trang Series mở ra');
  ok(host && host.getAttribute('role') === 'dialog', 'trang có role=dialog + aria-label');
  ok(host && host.getAttribute('aria-label').indexOf('Chuyển thể Series') >= 0, 'aria-label mô tả đúng');
  ok(D.body.classList.contains('series-page-open'), 'body khoá cuộn khi trang mở');
  ok(host && host.querySelector('h2').textContent === 'Chuyển thể Series', 'trang có tiêu đề riêng');
  const cards = [...host.querySelectorAll('.series-card')];
  const boxes = [...host.querySelectorAll('[data-role="picked"]')];
  ok(cards.length === LIBN, 'trang liệt kê TOÀN BỘ ' + LIBN + ' bộ');
  ok(boxes.length === LIBN, 'trang có ' + LIBN + ' checkbox');
  ok(boxes.filter(x => x.checked).length === 12, 'trang tick đúng 12 editorChoice');
  ok(host.querySelectorAll('img.cover').length === LIBN, 'trang hiện ' + LIBN + ' ảnh bìa THẬT');
  ok(host.querySelectorAll('img.cover')[0].getAttribute('src').indexOf('https://') === 0,
    'ảnh bìa lấy URL thật từ registry.thumb');
  ok(!!host.querySelector('[data-role="series-q"]'), 'trang có ô tìm kiếm');
  ok(!!host.querySelector('[data-act="series-close"]') && !!host.querySelector('[data-act="series-save"]'),
    'trang có nút Quay lại / Lưu lựa chọn');
  ok((D.getElementById('seriesPageCount') || {}).textContent === '12' &&
     (D.getElementById('seriesPageFootCount') || {}).textContent === '12',
    '2 bộ đếm trên trang = 12');

  /* Tìm kiếm — không render lại nên giữ focus */
  const q = host.querySelector('[data-role="series-q"]');
  const visible = () => [...host.querySelectorAll('.series-card')].filter(x => x.style.display !== 'none').length;
  q.value = 'lunar'; fire(q, 'input');
  ok(visible() === 1, 'lọc "lunar" → 1 bộ (có thể có "lunar" trong slug/tên)');
  ok((host.querySelector('[data-series-visible]') || {}).textContent === '1', 'số "đang hiện" cập nhật');
  q.value = 'bake-love-feelings'; fire(q, 'input');
  ok(visible() === 1, 'lọc theo slug "bake-love-feelings" → 1 bộ');
  q.value = 'zzzz-khong-co'; fire(q, 'input');
  ok(visible() === 0, 'từ khoá lạ → 0 bộ, không vỡ');
  q.value = ''; fire(q, 'input');
  ok(visible() === LIBN, 'xoá từ khoá → hiện lại ' + LIBN + ' bộ');

  /* CHỌN VƯỢT 12 — không còn bị từ chối */
  const add = host.querySelector('[data-role="picked"][data-id="yours-ever"]');
  ok(!!add && !add.checked, 'yours-ever chưa được chọn');
  add.checked = true; fire(add, 'change');
  ok(S.picked.length === 13, 'tick thêm → 13 lựa chọn (KHÔNG bị chặn bởi trần 12)');
  ok(add.checked === true, 'checkbox vẫn giữ trạng thái đã tick');
  ok((D.getElementById('seriesPageCount') || {}).textContent === '13' &&
     (D.getElementById('seriesPageFootCount') || {}).textContent === '13' &&
     (D.getElementById('hpPickedCount') || {}).textContent === '13',
    'cả 3 bộ đếm đồng bộ = 13');
  const rm = host.querySelector('[data-role="picked"][data-id="' + CHOICE[0] + '"]');
  rm.checked = false; fire(rm, 'change');
  ok(S.picked.length === 12 && S.picked.indexOf(CHOICE[0]) < 0, 'bỏ tick 1 bộ → về 12');

  /* Chọn tất cả / bỏ tất cả */
  host.querySelector('[data-act="series-all"]').click();
  ok(S.picked.length === LIBN, 'Chọn tất cả → ' + LIBN + ' lựa chọn');
  ok(host.querySelectorAll('[data-role="picked"]:checked').length === LIBN, 'mọi checkbox được tick');
  ok((D.getElementById('seriesPageCount') || {}).textContent === String(LIBN), 'bộ đếm = ' + LIBN);
  host.querySelector('[data-act="series-none"]').click();
  ok(S.picked.length === 0, 'Bỏ chọn tất cả → 0');
  ok(host.querySelectorAll('[data-role="picked"]:checked').length === 0, 'mọi checkbox bỏ tick');

  /* Chọn 20 (>12) rồi LƯU THẲNG LÊN KV */
  const chosen = reg.lib.slice(0, 20).map(m => m.slug);
  host.querySelectorAll('[data-role="picked"]').forEach(cb => {
    const want = chosen.indexOf(cb.dataset.id) >= 0;
    if (cb.checked !== want) { cb.checked = want; fire(cb, 'change'); }
  });
  ok(S.picked.length === 20, 'chọn 20 bộ (> 12) thành công');
  host.querySelector('[data-act="series-save"]').click();
  await new Promise(r => setTimeout(r, 400));
  ok(puts.length === 1, 'Lưu lựa chọn → 1 PUT /api/registry');
  if (puts.length) {
    const b = puts[0];
    ok(b.editorChoice && b.editorChoice.length === 20, 'PUT: editorChoice = 20 (vượt 12)');
    ok(b.settings && b.settings.editorChoice && b.settings.editorChoice.length === 20,
      'PUT: settings.editorChoice = 20, đồng bộ');
    ok(JSON.stringify(b.editorChoice.slice().sort()) === JSON.stringify(chosen.slice().sort()),
      'PUT: đúng 20 slug đã tick (trang sắp A–Z nên so sánh dạng tập hợp)');
    ok(b.lib && b.lib.length === LIBN && b.schedule.items.length === 6,
      'PUT: không làm mất thư viện / lịch vòng 14');
  }
  ok(!D.getElementById('seriesPage'), 'Lưu xong tự đóng trang');
  ok(!D.body.classList.contains('series-page-open'), 'body mở khoá cuộn sau khi đóng');
  S.route = 'homepage-cms'; w.render();
  ok(D.querySelectorAll('#seriesPickedGrid [data-role="picked"]').length === 12,
    'card vẫn chỉ hiện 12 bộ dù đã chọn 20');
  ok((D.getElementById('hpPickedCount') || {}).textContent === '20', 'bộ đếm card = 20');
  ok(/… và 8 bộ nữa/.test((D.getElementById('view') || {}).textContent || ''),
    'card báo rõ còn 8 bộ nữa, dẫn vào trang');

  /* Đóng bằng Esc + bằng nút Quay lại */
  D.querySelector('[data-act="series-page"]').click();
  const h2 = D.getElementById('seriesPage');
  h2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!D.getElementById('seriesPage'), 'Esc đóng trang');
  D.querySelector('[data-act="series-page"]').click();
  D.querySelector('#seriesPage [data-act="series-close"]').click();
  ok(!D.getElementById('seriesPage'), 'nút Quay lại đóng trang');

  /* 13 tab 0 lỗi JS sau mọi thao tác */
  TABS.forEach(t => {
    const before = errs.length;
    try { S.route = t; w.render(); } catch (e) { errs.push(t + ': ' + e.message); }
    ok(errs.length === before, 'ONLINE · ' + t + ': 0 lỗi JS');
  });
  ok(errs.length === 0, 'ONLINE: 0 lỗi JS tổng (' + errs.slice(0, 2).join(' | ') + ')');
  on.dom.window.close();

  /* --------------------------------------------------- CHƯA CẤU HÌNH */
  const off = build(false);
  await new Promise(r => setTimeout(r, 300));
  const { w: w2, D: D2, errs: errs2 } = off, S2 = w2.CZ_MOCKUP && w2.CZ_MOCKUP.state;
  ok(!!S2 && S2.conn === 'static' && S2.books.length === 0, 'CHƯA CẤU HÌNH: 0 bộ, không lộ dữ liệu giả');
  S2.route = 'homepage-cms'; w2.render();
  ok(D2.querySelectorAll('#seriesPickedGrid [data-role="picked"]').length === 0,
    'CHƯA CẤU HÌNH: card rỗng, không crash');
  const m2 = D2.querySelector('[data-act="series-page"]');
  ok(!!m2, 'CHƯA CẤU HÌNH: vẫn có nút Xem thêm');
  m2.click();
  ok(/Chưa có bộ nào trong KV/.test((D2.getElementById('seriesPage') || {}).textContent || ''),
    'CHƯA CẤU HÌNH: trang báo rõ KV rỗng');
  ok(D2.querySelectorAll('#seriesPage .series-card').length === 0, 'CHƯA CẤU HÌNH: 0 card giả');
  D2.querySelector('#seriesPage [data-act="series-close"]').click();
  TABS.forEach(t => {
    const before = errs2.length;
    try { S2.route = t; w2.render(); } catch (e) { errs2.push(t + ': ' + e.message); }
    ok(errs2.length === before, 'CHƯA CẤU HÌNH · ' + t + ': 0 lỗi JS');
  });
  ok(errs2.length === 0, 'CHƯA CẤU HÌNH: 0 lỗi JS tổng');
  off.dom.window.close();

  console.log(JSON.stringify({ bai: 't_admin_series_page.js / vòng 15', loi: bad.length,
    kiemTra: checks, boKV: LIBN, errors0: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
