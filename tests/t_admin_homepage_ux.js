/* =============================================================================
   Vòng 17 · TRANG CHỦ: sửa tại chỗ — xem trước — lưu một lần.

   Chủ trang: “trang chỉnh homepage khó chỉnh và quản lý quá”. Bài này khoá lại
   đúng những thứ làm nên bản mới, và khoá luôn những gì KHÔNG được phép mất:

     · bố cục 2 cột: cột sửa (4 khối) ↔ cột “Xem trước” dựng từ state đang sửa
     · thanh tóm tắt dính: số slide / Series / dòng lịch / banner + ● Chưa lưu
     · thao tác chỉ đổi state: thêm/nhích/gỡ slide, chip thứ, banner, ghi chú
       ⇒ 0 lượt PUT; bấm Lưu ⇒ ĐÚNG 1 lượt PUT
     · Hoàn tác trả về đúng dữ liệu đang lưu trên KV
     · lịch thiếu thứ ⇒ chặn lưu và nói rõ DÒNG NÀO thiếu gì
     · dữ liệu ghi ra KV giữ nguyên hợp dạng cũ (slides/editorChoice/schedule/
       announcement) để cz-home.js đọc được y như trước
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const prod = R('admin.html'), real = R('admin-real.js');
const baseReg = JSON.parse(R('data/registry.json'));
const resp = (x, st = 200) => ({
  ok: st < 400, status: st, headers: { get: () => 'application/json' },
  json: async () => x, text: async () => JSON.stringify(x),
});

function build() {
  let REG = JSON.parse(JSON.stringify(baseReg));
  const puts = [], errs = [];
  const pre = '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");' +
    'sessionStorage.setItem("cz_kv_key","ADMIN_KEY_QA");}catch(e){}<\/script>';
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/,
    pre + '<script>' + real + '</script>');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, {
    url: 'https://ssochuz.pages.dev/admin',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window, D = w.document;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  w.fetch = (u, o = {}) => {
    const p = new URL(String(u), 'https://ssochuz.pages.dev').pathname;
    if (p === '/api/registry' && (o.method || 'GET') === 'PUT') {
      const b = JSON.parse(o.body); puts.push(b); REG = b;
      return Promise.resolve(resp({ ok: true, rev: String(Date.now()) }));
    }
    if (p === '/api/registry') return Promise.resolve(resp(REG));
    if (p === '/api/health') return Promise.resolve(resp({ ok: true }));
    if (p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
    if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 137, readsToday: 4021, keys: 82, groups: [] }));
    if (p === '/api/admin/comments') return Promise.resolve(resp({ ok: true, comments: [] }));
    if (p === '/api/admin/reports') return Promise.resolve(resp({ ok: true, items: [] }));
    if (p === '/api/admin/stats') return Promise.resolve(resp({ ok: true, items: {}, days: [] }));
    if (p === '/api/admin/log') return Promise.resolve(resp({ ok: true, items: [] }));
    if (p === '/api/admin/voters') return Promise.resolve(resp({ ok: true, book: { count: 0, voters: [] } }));
    if (/^\/api\/book\//.test(p)) return Promise.resolve(resp({ title: 'x', slug: 'x', chapters: [] }));
    if (p === '/data/registry.json') return Promise.resolve(resp(REG));
    return Promise.resolve(resp({ ok: true }));
  };
  return { w, D, dom, errs, puts, get REG() { return REG; } };
}

const fire = (el, t) => el.dispatchEvent(new el.ownerDocument.defaultView.Event(t, { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));
const fails = []; let checks = 0;
function ok(cond, label) { checks++; if (!cond) fails.push(label); }

(async () => {
  const on = build();
  await wait(2200);
  const { w, D, errs, puts } = on;
  const S = w.CZ_MOCKUP.state;
  const view = () => D.getElementById('view');
  const txt = () => (view() || {}).textContent || '';
  const goHome = () => { S.route = 'homepage-cms'; w.render(); };

  /* ------------------------------------------------ BỐ CỤC & THANH TÓM TẮT */
  goHome();
  ok(!!D.querySelector('.hp-wrap'), 'bố cục mới: có .hp-wrap');
  ok(D.querySelectorAll('.hp-cols .hp-main > .hp-block').length === 4,
    'cột sửa có đúng 4 khối: Hero · Series · Lịch · Thông báo');
  ok(!!D.querySelector('.hp-cols .hp-side .hp-pv'), 'cột phải có khung Xem trước');
  ok(!!D.getElementById('hpDirty') && D.getElementById('hpDirty').hidden === true,
    'vừa nạp: ● Chưa lưu đang ẩn');
  /* Vòng 17b: chưa có thay đổi thì KHÔNG hiện nút Hoàn tác (đỡ một nút chết
     trên màn hình); nó xuất hiện cùng ● Chưa lưu. */
  ok(!D.getElementById('hpReset'), 'vừa nạp: chưa hiện nút Hoàn tác (không có gì để hoàn tác)');
  ['hpSumSlides', 'hpSumSeries', 'hpSumSched', 'hpSumBanner'].forEach(id => {
    ok(!!D.getElementById(id), 'thanh tóm tắt có ô ' + id);
  });
  ok(/Tóm tắt trang chủ/.test(txt()), 'thanh tóm tắt có nhãn rõ ràng');

  /* ------------------------------------------------------- XEM TRƯỚC THẬT */
  ok(/Nổi bật hôm nay/.test((D.getElementById('hpPvBody') || {}).textContent || ''),
    'xem trước dựng hero từ dữ liệu thật (KV chưa có slide → 5 bộ mới nhất)');
  ok(!D.querySelector('.hp-pv-ann'), 'banner tắt → xem trước KHÔNG có banner');

  /* ------------------------------------------- THAO TÁC CHỈ ĐỔI STATE */
  const q = D.getElementById('hpSlideQ');
  ok(!!q, 'ô thêm slide có ô tìm kiếm');
  q.value = 'lunar'; fire(q, 'input');
  const sel = D.getElementById('addSlideSel');
  ok(sel.value === 'lunar-secret', 'tìm "lunar" → ô chọn tự nhảy tới bộ khớp (' + sel.value + ')');
  const optHidden = [...sel.options].filter(o => o.value && !o.hidden).map(o => o.value);
  ok(optHidden.length === 1, 'lọc tại chỗ: chỉ còn 1 bộ hiện (thấy ' + optHidden.length + ')');
  q.value = ''; fire(q, 'input');
  ok([...sel.options].filter(o => o.value && !o.hidden).length === [...sel.options].filter(o => o.value).length,
    'xoá từ khoá → hiện lại toàn bộ bộ');

  sel.value = 'lunar-secret';
  D.querySelector('[data-act="slide-add"]').click(); await wait(30);
  ok(S.slides.length === 1 && S.slides[0].b === 'lunar-secret', 'Thêm slide → state.slides có 1 dòng');
  ok(puts.length === 0, 'thêm slide KHÔNG ghi KV (thấy ' + puts.length + ' PUT)');
  ok(!!D.querySelector('.hp-row'), 'danh sách slide vẽ lại ngay');
  ok(/Nổi bật hôm nay/.test(D.querySelector('.hp-row').textContent), 'slide đầu mang nhãn Nổi bật hôm nay');

  const sel2 = D.getElementById('addSlideSel');
  sel2.value = 'lunar-secret';
  D.querySelector('[data-act="slide-add"]').click(); await wait(30);
  ok(S.slides.length === 1, 'thêm trùng bộ bị chặn (vẫn 1 slide)');

  S.picked = ['lunar-secret'];
  w.render();
  sel2 && (sel2.value = 'bake-love-feelings');
  const sel3 = D.getElementById('addSlideSel'); sel3.value = 'bake-love-feelings';
  D.querySelector('[data-act="slide-add"]').click(); await wait(30);
  ok(S.slides.length === 2, 'thêm bộ thứ hai → 2 slide');
  D.querySelectorAll('[data-act="slide-move"][data-dir="1"]')[0].click(); await wait(30);
  ok(S.slides[0].b === 'bake-love-feelings', 'nút ↓ đưa slide 2 lên đầu (không cần ghi KV)');
  ok(D.querySelector('[data-act="slide-move"][data-dir="-1"]').disabled === true,
    'slide đầu: nút ↑ bị khoá');
  ok(puts.length === 0, 'nắm thứ tự slide cũng không ghi KV');

  /* ----------------------------------------------------------- CHIP THỨ */
  const chips1 = D.querySelectorAll('.hp-sched')[0].querySelectorAll('.hp-day');
  ok(chips1.length === 7, 'mỗi dòng lịch có 7 chip thứ (T2…CN)');
  const edited = S.schedule[0];
  const before = edited.d;
  const tokensBefore = w.hpDaysOf(before);
  const chipOff = [...chips1].find(c => c.classList.contains('on'));
  if (chipOff) { chipOff.click(); await wait(20); }
  ok(w.hpDaysOf(edited.d).length === tokensBefore.length - 1,
    'bấm chip đang bật → bỏ thứ đó (' + before + ' → ' + edited.d + ')');
  const chipOn = [...D.querySelectorAll('.hp-sched')[S.schedule.indexOf(edited)].querySelectorAll('.hp-day')].find(c => !c.classList.contains('on'));
  chipOn.click(); await wait(20);
  ok(w.hpDaysOf(edited.d).length === tokensBefore.length,
    'bấm chip đang tắt → thêm thứ đó (' + edited.d + ')');
  ok(/^(T[2-7]|CN)$/.test(w.hpDaysOf(edited.d)[0]), 'chip ghi đúng token CZ dùng (T2…CN)');
  ok(w.hpDaysText(['T2', 'T5']) === 'Thứ 2, Thứ 5', 'đọc ra chuỗi KV quen thuộc: "Thứ 2, Thứ 5"');
  ok(puts.length === 0, 'đổi lịch bằng chip cũng không ghi KV');

  /* ------------------------------------------------------- BANNER + GHI CHÚ */
  const bn = D.getElementById('hp-banner');
  bn.checked = true; fire(bn, 'change');
  ok(!D.querySelector('.hp-pv-ann'), 'bật công tắc nhưng chưa có nội dung → banner vẫn không hiện');
  ok(/chưa có nội dung/.test((D.getElementById('hpAnnPv') || {}).textContent || ''),
    'nói rõ vì sao banner chưa hiện');
  const tx = D.getElementById('hp-text'); tx.value = 'Bảo trì 20:00'; fire(tx, 'input');
  ok(!!D.querySelector('.hp-pv-ann'), 'có nội dung → xem trước hiện banner ngay');
  ok(/Bảo trì 20:00/.test((D.getElementById('hpPvBody') || {}).textContent || ''),
    'nội dung banner đúng trong xem trước');
  ok((D.getElementById('hpSumBanner') || {}).textContent === 'bật', 'tóm tắt: Banner bật');
  const nt = D.getElementById('hp-note'); nt.value = 'Lịch mới'; fire(nt, 'input');
  ok(S.models['hp-note'] === 'Lịch mới', 'ghi chú lịch vào state.models');

  ok(D.getElementById('hpDirty').hidden === false, 'có thay đổi → hiện ● Chưa lưu');
  ok(!!D.getElementById('hpReset'), 'có thay đổi → nút Hoàn tác xuất hiện');
  ok(puts.length === 0, 'tới đây vẫn 0 lượt ghi KV');

  /* -------------------------------------------------------- KHUNG XEM TRƯỚC */
  D.querySelector('[data-act="hp-preview"][data-v="mobile"]').click(); await wait(20);
  ok(!!D.querySelector('.hp-pv.mob'), 'nút Điện thoại thu khung xem trước');
  ok(D.querySelector('[data-act="hp-preview"][data-v="mobile"]').getAttribute('aria-pressed') === 'true',
    'nút đang chọn có aria-pressed=true');
  D.querySelector('[data-act="hp-preview"][data-v="desktop"]').click(); await wait(20);
  ok(!D.querySelector('.hp-pv.mob'), 'nút Máy tính mở lại khung rộng');

  /* ------------------------------------------------------------- HOÀN TÁC */
  D.getElementById('hpReset').click(); await wait(40);
  ok(S.slides.length === 0, 'Hoàn tác: slide về đúng dữ liệu KV (0)');
  ok(S.schedule[0].d === before, 'Hoàn tác: lịch về "' + before + '"');
  ok(S.models['hp-note'] === (baseReg.schedule.note || ''), 'Hoàn tác: ghi chú lịch về như cũ');
  ok(D.getElementById('hpDirty').hidden === true, 'Hoàn tác: ● Chưa lưu tắt');
  ok(puts.length === 0, 'Hoàn tác không ghi KV');

  /* ------------------------------------------------- LƯU: ĐÚNG MỘT LƯỢT */
  S.slides = [{ b: 'lunar-secret', r: 'Đề cử tháng 11' }, { b: 'bake-love-feelings', r: '' }];
  S.picked = ['lunar-secret', 'bake-love-feelings'];
  S.schedule = [{ d: 'Chủ nhật', b: 'bake-love-feelings', c: 'CN', t: '' },
    { d: 'Thứ 3', b: 'bake-love-feelings', c: 'T3', t: '' },
    { d: 'Thứ 5, Thứ 2', b: 'lunar-secret', c: 'ra chương 20', t: '' }];
  S.models['hp-banner'] = true;
  S.models['hp-text'] = 'Bảo trì 20:00';
  S.models['hp-note'] = 'Lịch mới';
  w.render();
  D.querySelector('[data-act="save-homepage"]').click();
  await wait(500);
  ok(puts.length === 1, 'Lưu trang chủ → ĐÚNG 1 lượt PUT (thấy ' + puts.length + ')');
  const b = puts[0] || {}, it = (b.schedule && b.schedule.items) || [];
  /* Hợp dạng cũ: có lý do → {slug, reason}; không có lý do → chỉ slug (đúng thứ
     cz-home.js `slides()` đọc, không sinh khoá reason rỗng thừa). */
  const sl = Array.isArray(b.slides) ? b.slides : [];
  const slugOf = x => (typeof x === 'string' ? x : (x && x.slug) || '');
  ok(sl.length === 2 && slugOf(sl[0]) === 'lunar-secret' && slugOf(sl[1]) === 'bake-love-feelings',
    'PUT slides: đúng 2 slug theo thứ tự đã xếp: ' + JSON.stringify(b.slides));
  ok(sl[0] && sl[0].reason === 'Đề cử tháng 11', 'PUT slides: lý do chọn slide được ghi');
  ok(sl[1] && !sl[1].reason, 'PUT slides: slide không có lý do thì không sinh khoá reason rỗng');
  ok(JSON.stringify(b.editorChoice) === JSON.stringify(['lunar-secret', 'bake-love-feelings']),
    'PUT editorChoice đúng thứ tự đã chọn');
  ok(it.length === 3 && it[0].slug === 'lunar-secret' && it[0].days === 'Thứ 5, Thứ 2' && it[1].detail === 'T3' && it[2].detail === 'CN',
    'PUT lịch: slug + days đúng chuỗi KV');
  ok(it[0] && it[0].detail === 'ra chương 20', 'PUT lịch: detail = ghi chú dòng');
  ok(it[0] && /Lunar/i.test(String(it[0].title)), 'PUT lịch: tự điền title từ bộ đã chọn');
  ok(b.schedule && b.schedule.note === 'Lịch mới', 'PUT: schedule.note đúng');
  ok(b.settings && b.settings.announcement && b.settings.announcement.enabled === true &&
    b.settings.announcement.text === 'Bảo trì 20:00', 'PUT: announcement {enabled, text} đúng');
  ok(b.lib && b.lib.length === baseReg.lib.length, 'PUT: không làm mất thư viện (' + baseReg.lib.length + ' bộ)');
  await wait(200);
  ok(D.getElementById('hpDirty').hidden === true, 'lưu xong: ● Chưa lưu tắt');
  ok((D.getElementById('hpSumSlides') || {}).textContent === '2', 'lưu xong: tóm tắt slide = 2');

  /* --------------------------------------------- LỊCH THIẾU THỨ → CHẶN LƯU */
  S.schedule = [{ d: '', b: 'lunar-secret', c: '', t: '' }, { d: 'Thứ 5', b: 'lunar-secret', c: '', t: '' }];
  w.render();
  D.querySelector('[data-act="save-homepage"]').click(); await wait(350);
  const toastTxt = (D.getElementById('toasts') || {}).textContent || (D.body.textContent || '');
  ok(/dòng 2 thiếu thứ/.test(toastTxt), 'lịch thiếu thứ: báo đúng DÒNG NÀO thiếu gì (' +
    toastTxt.trim().slice(-70) + ')');
  ok(puts.length === 1, 'lịch lỗi → không ghi KV thêm');
  ok(/Chưa chọn thứ/.test(txt()), 'dòng lịch thiếu thứ hiện cảnh báo ngay trên card');

  /* ------------------------------------ KHÔNG CÒN NÚT GHI KV THEO TỪNG CÚ BẤM */
  const src = real;
  ok(!/realSlideChange[\s\S]{0,1600}?writeRegistry\(currentRegistryFromState\(\)\)/.test(
    src.slice(src.indexOf('function realSlideChange'), src.indexOf('function realSaveHomepage'))),
    'mã nguồn: realSlideChange KHÔNG còn gọi writeRegistry (sửa ≠ ghi)');

  ok(errs.length === 0, 'ONLINE: 0 lỗi JS (' + errs.slice(0, 2).join(' | ') + ')');
  on.dom.window.close();

  /* ---------------------------------------------- CHƯA NỐI WORKER (TĨNH) */
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/,
    '<script>' + real + '</script>');
  const vc2 = new VirtualConsole(); const errs2 = [];
  vc2.on('jsdomError', e => errs2.push(String((e && e.message) || e)));
  const dom2 = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc2 });
  const w2 = dom2.window, D2 = w2.document;
  w2.HTMLElement.prototype.scrollIntoView = () => {}; w2.scrollTo = () => {};
  w2.fetch = () => Promise.resolve(resp({}, 404));
  await wait(600);
  const S2 = w2.CZ_MOCKUP.state;
  S2.route = 'homepage-cms'; w2.render();
  ok(!!D2.querySelector('.hp-wrap'), 'TĨNH: trang vẫn dựng bố cục mới');
  ok(/Chưa có bộ nào để dựng hero/.test((D2.getElementById('hpPvBody') || {}).textContent || ''),
    'TĨNH: xem trước báo rõ chưa có bộ, không vẽ dữ liệu giả');
  ok(/Chưa có bộ nào trong KV/.test(D2.getElementById('view').textContent),
    'TĨNH: card Series nói rõ KV rỗng');
  ok(!!D2.querySelector('[data-act="series-page"]'), 'TĨNH: vẫn có nút mở trang Series');
  ok(errs2.length === 0, 'TĨNH: 0 lỗi JS (' + errs2.slice(0, 2).join(' | ') + ')');
  dom2.window.close();

  console.log(JSON.stringify({
    bai: 't_admin_homepage_ux.js / vòng 17',
    kiemTra: checks, loi: fails.length, errors0: fails,
  }, null, 1));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
