/* ============================================================================
   t_admin_full_data.js · VÒNG 14: RÀ TOÀN BỘ ADMIN — ĐỪNG CỤT DANH SÁCH BỘ
   ----------------------------------------------------------------------------
   Owner báo: "có lỗi ở trang chỉnh homepage, dữ liệu truyện bị thiếu tùm lum,
   check kĩ toàn bộ admin panel đi tr".

   Những chỗ cụt dữ liệu trước vòng 14 (registry thật có 67 bộ, 12 editorChoice,
   6 dòng lịch, 67/67 bộ có thumb):
     • mọi ô chọn bộ dùng state.books.slice(0,8) / slice(0,6) ⇒ chỉ thấy 6–8 bộ
       đầu; 6 dòng lịch ra chương đều nhảy về bộ đầu tiên HOMETOWN ROMANCE;
     • "Chuyển thể Series" hiện 6 checkbox và tick 3 bộ đầu, trong khi KV lưu
       12 slug editorChoice thật; tick xong không ghi ra registry ⇒ mất sạch;
     • "Lưu trang chủ" chặn cứng "Cần ít nhất 1 slide" dù registry.slides=[]
       là HỢP LỆ (web tự lấy 5 bộ mới nhất) ⇒ nút luôn báo lỗi;
     • công tắc banner luôn tắt, ô thông báo luôn rỗng (gán models TRƯỚC khi
       đọc announcement), ô "Ghi chú lịch" lại nhầm sang nội dung banner và
       lúc ghi ra KV biến detail (ghi chú) thành title (tên bộ);
     • Sửa bộ / Chương / Bình luận / Cài đặt không chọn được 59 bộ còn lại;
       Phiếu bầu chỉ hỏi voters của 5 bộ đầu; Thư viện 8 bộ/trang.

   Bài này khoá 3 tầng: (1) nguồn phát hành + lớp KV thật, (2) DOM online với
   registry 67 bộ: 13 tab 0 lỗi JS, mọi select đủ bộ, Homepage CMS hiện đúng
   slug/tên/12 lựa chọn, bấm Lưu thật và soi body PUT /api/registry, (3) DOM
   chưa cấu hình không vỡ + prototype vẫn là bản thiết kế.

   Chạy: node tests/t_admin_full_data.js   (hoặc npm test)
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

const docsStart = prod.indexOf('const DOCS_HTML =');
const docsEndMark = "\n'</ul></div>';";
const docsEnd = prod.indexOf(docsEndMark, docsStart) + docsEndMark.length;
ok(docsStart > 0 && docsEnd > docsStart, 'xác định được khối DOCS_HTML');
const prodUI = prod.slice(0, docsStart) + prod.slice(docsEnd);

const LIBN = reg.lib.length;                       // 67
const CHOICE = reg.editorChoice.slice();            // 12 slug thật
const SCHED = reg.schedule.items.slice();           // 6 dòng
const NOTE = reg.schedule.note;

/* ------------------------------------------------------------ 1 · NGUỒN */
ok(LIBN >= 60 && CHOICE.length === 12 && SCHED.length === 6,
  'registry fixture có ' + LIBN + ' bộ / ' + CHOICE.length + ' editorChoice / ' + SCHED.length + ' dòng lịch');
ok(/function bookOptions\(sel,useTitle\)/.test(prodUI), 'bản phát hành có bookOptions() duyệt toàn bộ bộ');
ok(!/state\.books\.slice\(0,[68]\)/.test(prodUI), 'không còn .slice(0,8) / .slice(0,6) cụt danh sách ở bản phát hành');
ok(/var bookOpts=function\(sel\)\{return bookOptions\(sel\);\}/.test(prodUI), 'Homepage CMS dùng bookOptions()');
ok(/'\+bookOptions\(b\.id\)\+'/.test(prodUI), 'Sửa bộ dùng bookOptions()');
ok(/'\+bookOptions\(pick\)\+'/.test(prodUI), 'Chương dùng bookOptions()');
ok(/bookOptions\(state\.cmtBook,true\)/.test(prodUI), 'Bình luận dùng bookOptions() theo tên bộ');
ok(/options:state\.books\.slice\(\)\.sort/.test(prodUI), 'Cài đặt · Bộ nhận chương duyệt toàn bộ bộ');
ok((prodUI.match(/var arr=filteredBooks\(\),per=20/g) || []).length === 2, 'Thư viện 20 bộ/trang ở cả 2 chỗ');
ok(/return out\.slice\(0,12\)/.test(prodUI) && /\[b\.t,b\.a,b\.id,b\.c\]/.test(prodUI),
  'gợi ý tìm kiếm rộng hơn, tìm cả slug/couple');
ok(/id="hpPickedCount"/.test(prodUI), 'Series có bộ đếm đã chọn');
ok(/state\.models\['hp-banner'\]\?' checked'/.test(prodUI), 'công tắc banner đọc trạng thái thật');
ok(/state\.models\['hp-note'\]\|\|state\.hpNote/.test(prodUI), 'ghi chú lịch đọc schedule.note');
ok(/Vẫn lưu được lịch, Series và thông báo/.test(prodUI), 'trạng rỗng slide nói rõ vẫn lưu được');

ok(/REG\.editorChoice/.test(real) && /next\.editorChoice = picked/.test(real),
  'admin-real.js đọc VÀ ghi editorChoice');
ok(/next\.settings\.editorChoice = picked\.slice\(\)/.test(real), 'đồng bộ settings.editorChoice');
ok(/S\.models\['hp-banner'\] = !!ann\.enabled/.test(real), 'banner lấy announcement.enabled');
ok(/S\.hpNote = \(REG\.schedule && REG\.schedule\.note\)/.test(real), 'ghi chú lịch lấy schedule.note');
ok(/c: x\.detail \|\| x\.note \|\| ''/.test(real), 'ghi chú dòng lịch KHÔNG nhầm title (tên bộ)');
ok(/note: val\('hp-note'\) \|\| S\.hpNote \|\| ''/.test(real), 'ghi ngược schedule.note');
ok(!/Cần ít nhất 1 slide trước khi lưu/.test(real), 'bỏ chặn cứng "Cần ít nhất 1 slide"');
ok(/STATS_ITEMS/.test(real) && /hot\.length \? hot/.test(real) && /flat\.slice\(0, 200\)/.test(real),
  'loadVoters() hỏi MỌI bộ có phiếu qua /api/admin/stats, không chỉ 5 bộ đầu');
ok(/data-cover="1"/.test(real) && /data-fb-text/.test(real), 'ảnh bìa thật có fallback (CSP cấm onerror inline)');
ok(/addEventListener\('error'/.test(real), 'có listener thay ảnh bìa hỏng bằng ô dự phòng');
ok(Array.isArray(repl) && repl.length >= 140, 'bảng thay thế ≥ 140 mục, hiện ' + repl.length);
ok(/state\.books\.slice\(0,8\)/.test(mock), 'prototype giữ nguyên thiết kế (không sửa file MẪU)');

/* ------------------------------------------------------------------ DOM */
const resp = (x, st = 200) => ({ ok: st < 400, status: st,
  headers: { get: n => n === 'content-type' ? 'application/json' : '' },
  json: async () => x, text: async () => JSON.stringify(x) });

function build(online) {
  let REG = JSON.parse(JSON.stringify(reg));
  const puts = [], errs = [];
  const pre = online
    ? '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");' +
      'sessionStorage.setItem("cz_kv_key","ADMIN_KEY_QA");}catch(e){}<\/script>'
    : '';
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/,
    pre + '<script>' + real + '</script>');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, D = w.document;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  if (online) w.fetch = (u, o = {}) => {
    const url = new URL(String(u), 'https://ssochuz.pages.dev'), p = url.pathname;
    if (p === '/api/registry' && (o.method || 'GET') === 'PUT') {
      const body = JSON.parse(o.body);
      puts.push(body); REG = body;
      return Promise.resolve(resp({ ok: true, rev: String(Date.now()) }));
    }
    if (p === '/api/registry') return Promise.resolve(resp(REG));
    if (p === '/api/health') return Promise.resolve(resp({ ok: true }));
    if (p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
    if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 137, readsToday: 4021, keys: 82, bytes: 123456, groups: [] }));
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

const TABS = ['dashboard','thu-vien','them-bo','sua-bo','chuong','binh-luan',
  'bao-loi','phieu-bau','homepage-cms','thong-ke','kiem-tra-du-lieu','nhat-ky','cai-dat'];

function fire(el, type) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event(type, { bubbles: true }));
}

async function main() {
  /* ------------------------------------------------ ONLINE · 67 bộ KV THẬT */
  const on = build(true);
  await new Promise(r => setTimeout(r, 2300));
  const { w, D, errs, puts } = on;
  const S = w.CZ_MOCKUP && w.CZ_MOCKUP.state;
  ok(!!S, 'ONLINE: lấy được state');
  ok(S && S.conn === 'online', 'ONLINE: đã nối Worker');
  ok(S && S.books.length === LIBN, 'ONLINE: state.books = ' + LIBN + ' bộ (thực ' + (S && S.books.length) + ')');
  ok(S && JSON.stringify(S.picked) === JSON.stringify(CHOICE),
    'ONLINE: S.picked = 12 editorChoice thật, KHÔNG phải 3 bộ đầu');
  ok(S && S.hpNote === NOTE, 'ONLINE: S.hpNote = schedule.note thật');
  ok(S && S.models['hp-banner'] === !!reg.settings.announcement.enabled,
    'ONLINE: model banner khớp announcement.enabled');
  ok(S && S.models['hp-text'] === (reg.settings.announcement.text || ''),
    'ONLINE: nội dung thông báo được nạp (trước đây luôn rỗng)');
  ok(S && S.schedule.length === SCHED.length, 'ONLINE: ' + SCHED.length + ' dòng lịch');
  ok(S && S.schedule.every(function (x, i) { return x.b === SCHED[i].slug; }),
    'ONLINE: mọi dòng lịch giữ đúng slug KV');
  ok(S && S.schedule.every(function (x) { return x.c === ''; }),
    'ONLINE: ghi chú dòng lịch rỗng đúng KV (trước bị nhầm thành tên bộ)');

  /* 13 tab: không lỗi JS, view không trống */
  TABS.forEach(function (tab) {
    const before = errs.length;
    try { S.route = tab; w.render(); } catch (e) { errs.push(tab + ': ' + e.message); }
    const v = D.getElementById('view');
    ok(!!v && (v.textContent || '').trim().length > 0, 'ONLINE · ' + tab + ': view có nội dung');
    ok(errs.length === before, 'ONLINE · ' + tab + ': 0 lỗi JS');
  });

  /* Thư viện: 20 bộ/trang + ảnh bìa thật + fallback ảnh hỏng */
  S.route = 'thu-vien'; w.render();
  ok(D.querySelectorAll('#view tbody tr').length === 20, 'Thư viện: 20 bộ/trang (trước 8)');
  const imgs = [...D.querySelectorAll('#view img.cover')];
  ok(imgs.length === 20, 'Thư viện: 20 ảnh bìa THẬT từ registry.thumb');
  ok(imgs.length > 0 && /^https:\/\//.test(imgs[0].getAttribute('src') || ''),
    'ảnh bìa dùng URL https thật: ' + (imgs[0] && imgs[0].getAttribute('src')));
  ok(imgs.length > 0 && imgs[0].getAttribute('alt').indexOf('Bìa ') === 0, 'ảnh bìa có alt rõ ràng');
  if (imgs[0]) {
    imgs[0].dispatchEvent(new w.Event('error'));
    ok(D.querySelectorAll('#view .cover.cv-miss').length === 1,
      'ảnh bìa hỏng → thay bằng ô dự phòng (không cần onerror inline)');
    ok((D.querySelector('#view .cover.cv-miss') || {}).textContent === 'HOM',
      'ô dự phòng hiện 3 chữ đầu tên bộ thật');
  }

  /* Mọi ô chọn bộ đều đủ 67 */
  const expect = {
    'sua-bo': ['[data-role="switch-book"]', LIBN],
    'chuong': ['[data-role="chapter-book"]', LIBN],
    'binh-luan': ['[data-role="cmt-book"]', LIBN + 1],
    'cai-dat': ['#st-slug', LIBN]
  };
  Object.keys(expect).forEach(function (tab) {
    S.route = tab; w.render();
    const sel = D.querySelector('#view ' + expect[tab][0]);
    ok(sel && sel.options.length === expect[tab][1],
      tab + ': ô chọn bộ có ' + expect[tab][1] + ' tuỳ chọn (thực ' + (sel && sel.options.length) + ')');
  });

  /* ---------------------------------------------- HOMEPAGE CMS · lỗi owner */
  S.route = 'homepage-cms'; w.render();
  const schedSel = [...D.querySelectorAll('[data-role="sched-book"]')];
  ok(schedSel.length === SCHED.length, 'Homepage: ' + SCHED.length + ' ô chọn bộ trong lịch');
  schedSel.forEach(function (sel, i) {
    ok(sel.options.length === LIBN, 'Homepage · lịch dòng ' + (i + 1) + ': đủ ' + LIBN + ' bộ');
    ok(sel.value === SCHED[i].slug,
      'Homepage · lịch dòng ' + (i + 1) + ': hiện đúng ' + SCHED[i].slug + ' (thực ' + sel.value + ')');
    ok((sel.selectedOptions[0] || {}).textContent !== 'HOMETOWN ROMANCE - SPECIAL',
      'Homepage · lịch dòng ' + (i + 1) + ': KHÔNG còn nhảy về bộ đầu tiên');
  });
  const addSel = D.getElementById('addSlideSel');
  ok(addSel && addSel.options.length === LIBN, 'Homepage · Thêm slide: đủ ' + LIBN + ' bộ');
  const boxes = [...D.querySelectorAll('[data-role="picked"]')];
  const checked = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.dataset.id; }).sort();
  ok(boxes.length === LIBN, 'Homepage · Series: liệt kê ' + LIBN + ' bộ (trước 6)');
  ok(checked.length === CHOICE.length && JSON.stringify(checked) === JSON.stringify(CHOICE.slice().sort()),
    'Homepage · Series: tick đúng 12 editorChoice thật');
  const cnt = D.getElementById('hpPickedCount');
  ok(cnt && cnt.textContent === '12', 'Homepage · Series: bộ đếm = 12');
  const banner = D.getElementById('hp-banner');
  ok(banner && banner.checked === !!reg.settings.announcement.enabled,
    'Homepage · công tắc banner phản ánh KV');
  ok((D.getElementById('hp-note') || {}).value === NOTE, 'Homepage · ghi chú lịch = schedule.note');
  ok(/Vẫn lưu được lịch, Series và thông báo/.test(D.getElementById('view').textContent),
    'Homepage · trạng rỗng slide nói rõ vẫn lưu được');

  /* BẤM LƯU THẬT với slides=[] — trước đây luôn báo "Cần ít nhất 1 slide" */
  const saveBtn = D.querySelector('[data-act="save-homepage"]');
  ok(!!saveBtn, 'Homepage: có nút Lưu trang chủ');
  saveBtn.click();
  await new Promise(r => setTimeout(r, 400));
  const toasts = (D.getElementById('toasts') || {}).textContent || '';
  ok(puts.length === 1, 'Lưu trang chủ: ghi đúng 1 PUT /api/registry (0 slide vẫn lưu)');
  ok(!/Cần ít nhất 1 slide/.test(toasts), 'Lưu trang chủ: KHÔNG còn báo lỗi slide');
  ok(/Đã lưu lịch, Series và thông báo/.test(toasts), 'Lưu trang chủ: báo đã lưu');
  if (puts.length) {
    const b = puts[0];
    ok(b.lib && b.lib.length === LIBN, 'PUT: giữ nguyên ' + LIBN + ' bộ');
    ok(Array.isArray(b.slides) && b.slides.length === 0, 'PUT: slides=[] hợp lệ, không bị ép thêm slide');
    ok(b.schedule && b.schedule.note === NOTE, 'PUT: schedule.note không mất');
    ok(b.schedule && b.schedule.items.length === SCHED.length, 'PUT: 6 dòng lịch');
    ok(b.schedule && b.schedule.items.every(function (x, i) { return x.slug === SCHED[i].slug; }),
      'PUT: 6 slug lịch giữ nguyên');
    ok(b.schedule && b.schedule.items.every(function (x) { return x.detail === ''; }),
      'PUT: detail (ghi chú) rỗng đúng KV, không bị ghi đè bởi title');
    ok(b.schedule && b.schedule.items.every(function (x, i) { return x.title === SCHED[i].title; }),
      'PUT: title (tên bộ) giữ nguyên');
    ok(JSON.stringify(b.editorChoice) === JSON.stringify(CHOICE), 'PUT: editorChoice = 12 slug thật');
    ok(b.settings && JSON.stringify(b.settings.editorChoice) === JSON.stringify(CHOICE),
      'PUT: settings.editorChoice đồng bộ');
    ok(b.settings && b.settings.announcement && b.settings.announcement.enabled === reg.settings.announcement.enabled,
      'PUT: announcement.enabled không bị tắt ngoài ý muốn');
  }
  ok(errs.length === 0, 'ONLINE: 0 lỗi JS (' + errs.slice(0, 2).join(' | ') + ')');

  /* Tương tác thật: tick Series, đổi bộ lịch, bật banner, sửa thông báo/ghi chú */
  S.route = 'homepage-cms'; w.render();
  const off = CHOICE[0], extra = 'yours-ever';
  const boxOff = D.querySelector('[data-role="picked"][data-id="' + off + '"]');
  const boxOn = D.querySelector('[data-role="picked"][data-id="' + extra + '"]');
  if (boxOff) { boxOff.checked = false; fire(boxOff, 'change'); }
  if (boxOn) { boxOn.checked = true; fire(boxOn, 'change'); }
  ok(S.picked.indexOf(off) < 0 && S.picked.indexOf(extra) >= 0,
    'tick Series cập nhật state.picked (bỏ ' + off + ', thêm ' + extra + ')');
  ok((D.getElementById('hpPickedCount') || {}).textContent === String(S.picked.length),
    'bộ đếm Series cập nhật ngay khi tick');
  const s0 = D.querySelector('[data-role="sched-book"]');
  if (s0) { s0.value = 'lunar-secret'; fire(s0, 'change'); }
  ok(S.schedule[0].b === 'lunar-secret', 'đổi ô chọn bộ lịch cập nhật state.schedule');
  const bn = D.getElementById('hp-banner'); if (bn) { bn.checked = true; fire(bn, 'change'); }
  const tx = D.getElementById('hp-text'); if (tx) { tx.value = 'Bảo trì 20:00'; fire(tx, 'input'); }
  const nt = D.getElementById('hp-note'); if (nt) { nt.value = 'Lịch mới'; fire(nt, 'input'); }
  D.querySelector('[data-act="save-homepage"]').click();
  await new Promise(r => setTimeout(r, 400));
  const last = puts[puts.length - 1];
  ok(last && last.editorChoice.indexOf(extra) >= 0 && last.editorChoice.indexOf(off) < 0,
    'PUT sau tick: editorChoice phản ánh lựa chọn mới');
  ok(last && last.schedule.items[0].slug === 'lunar-secret', 'PUT sau đổi: slug lịch dòng 1 đã cập nhật');
  ok(last && last.settings.announcement.enabled === true, 'PUT sau bật: banner enabled=true');
  ok(last && last.settings.announcement.text === 'Bảo trì 20:00', 'PUT sau sửa: nội dung thông báo được ghi');
  ok(last && last.schedule.note === 'Lịch mới', 'PUT sau sửa: schedule.note được ghi');
  ok(errs.length === 0, 'sau tương tác: 0 lỗi JS');
  on.dom.window.close();

  /* -------------------------------------------------- CHƯA CẤU HÌNH WORKER */
  const off2 = build(false);
  await new Promise(r => setTimeout(r, 300));
  const { w: w2, D: D2, errs: errs2 } = off2;
  const S2 = w2.CZ_MOCKUP && w2.CZ_MOCKUP.state;
  ok(!!S2 && S2.conn === 'static', 'CHƯA CẤU HÌNH: conn=static');
  ok(S2 && S2.books.length === 0, 'CHƯA CẤU HÌNH: 0 bộ, không lộ dữ liệu giả');
  TABS.forEach(function (tab) {
    const before = errs2.length;
    try { S2.route = tab; w2.render(); } catch (e) { errs2.push(tab + ': ' + e.message); }
    ok(errs2.length === before, 'CHƯA CẤU HÌNH · ' + tab + ': 0 lỗi JS');
  });
  S2.route = 'homepage-cms'; w2.render();
  ok(/Chưa có bộ nào trong KV\./.test((D2.getElementById('view') || {}).textContent || ''),
    'CHƯA CẤU HÌNH · Homepage: báo rõ KV rỗng thay vì im lặng');
  ok(errs2.length === 0, 'CHƯA CẤU HÌNH: 0 lỗi JS tổng (' + errs2.slice(0, 2).join(' | ') + ')');
  off2.dom.window.close();

  console.log(JSON.stringify({ bai: 't_admin_full_data.js / vòng 14', loi: bad.length,
    kiemTra: checks, boKV: LIBN, editorChoice: CHOICE.length, errors0: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
