/* =============================================================================
   Vòng 17b · SOI LỖI THẬT của trang chỉnh Trang chủ — viết TRƯỚC khi sửa.

   Mỗi mục dưới đây là một lỗi đọc được từ mã + hành vi thật, không phải gu:
     L1  Nút “Lưu trang chủ” ở đầu trang (pagehead) và nút trong thanh tóm tắt
         trùng mục đích nhưng khác trạng thái disabled/aria.
     L2  Bấm Lưu khi đang gõ dở ô “Lý do chọn” (chưa blur) ⇒ giá trị MỚI NHẤT
         của ô đó không được ghi (handler input chỉ đổi state, nhưng nếu render
         lại giữa lúc gõ thì chữ trong DOM và state lệch nhau).
     L3  Preview ghi “Nổi bật hôm nay” cho slide bất kỳ, trong khi trang thật
         dùng nhãn đó cho slide ĐẦU — preview phải khớp thứ tự thật (5 slide).
     L4  Preview hero chỉ hiện 5 bộ “Mới cập nhật” khi KV rỗng slide: phải đúng
         thứ tự trang thật (slides → 5 bộ mới nhất theo ngày cập nhật).
     L5  Xoá hết slide rồi Lưu: trang chủ thật quay về 5 bộ mới nhất, nhưng
         thanh tóm tắt vẫn có thể hiện số cũ nếu không vẽ lại.
     L6  “Thêm dòng lịch” tạo dòng KHÔNG có thứ ⇒ bấm Lưu bị chặn ngay, người
         dùng phải tự đi bấm chip. Nên mở dòng mới với thứ gợi ý (hôm nay)
         hoặc ít nhất nói rõ ngay trong dòng.
     L7  Nhãn “tối đa 8” nhưng khi đã đủ 8 vẫn hiện ô thêm bộ (disable kèm
         giải thích) — bản hiện tại ẩn hẳn ô thêm, người dùng tưởng mất chức năng.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const prod = R('admin.html'), real = R('admin-real.js');
const baseReg = JSON.parse(R('data/registry.json'));
const resp = (x, st = 200) => ({ ok: st < 400, status: st, headers: { get: () => 'application/json' }, json: async () => x, text: async () => JSON.stringify(x) });

function build() {
  let REG = JSON.parse(JSON.stringify(baseReg));
  const puts = [], errs = [];
  const pre = '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");sessionStorage.setItem("cz_kv_key","ADMIN_KEY_QA");}catch(e){}<\/script>';
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, pre + '<script>' + real + '</script>');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push(String((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console: ' + a.join(' ')));
  const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, D = w.document;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  w.fetch = (u, o = {}) => {
    const p = new URL(String(u), 'https://ssochuz.pages.dev').pathname;
    if (p === '/api/registry' && (o.method || 'GET') === 'PUT') { const b = JSON.parse(o.body); puts.push(b); REG = b; return Promise.resolve(resp({ ok: true, rev: String(Date.now()) })); }
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
  return { w, D, dom, errs, puts };
}
const fire = (el, t) => el.dispatchEvent(new el.ownerDocument.defaultView.Event(t, { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const built = [];
  const check = async (id, label, fn) => {
    const env = build(); await wait(2200);
    const S = env.w.CZ_MOCKUP.state;
    S.route = 'homepage-cms'; env.w.render();
    let pass = false, detail = '';
    try { const r = await fn(env, S); pass = !!r.pass; detail = r.detail || ''; } catch (e) { detail = 'EX ' + e.message; }
    built.push({ id, label, pass, detail });
    env.dom.window.close();
  };

  /* L1: hai nút lưu cùng mục đích — trạng thái phải giống nhau */
  await check('L1', 'Nút Lưu ở pagehead và trong tóm tắt cùng trạng thái/khoá', (env, S) => {
    const btns = [...env.D.querySelectorAll('[data-act="save-homepage"]')];
    return { pass: btns.length >= 1, detail: 'số nút Lưu trên màn hình: ' + btns.length };
  });

  /* L2: gõ lý do rồi lưu ngay (chưa blur) — giá trị phải vào KV */
  await check('L2', 'Gõ lý do rồi Lưu ngay (chưa blur) vẫn ghi đúng chữ mới nhất', async (env, S) => {
    S.slides = [{ b: 'lunar-secret', r: '' }]; env.w.render();
    const inp = env.D.querySelector('[data-role="slide-reason"]');
    inp.value = 'Đề cử tháng 11';
    /* KHÔNG phát input: mô phỏng người dùng gõ rồi bấm Lưu bằng chuột ngay */
    env.D.querySelector('[data-act="save-homepage"]').click();
    await wait(400);
    const put = env.puts[env.puts.length - 1] || {};
    const sl = (put.slides || [])[0] || {};
    return { pass: sl.reason === 'Đề cử tháng 11', detail: 'slides[0] ghi: ' + JSON.stringify(sl) };
  });

  /* L3: preview phải đánh nhãn “Nổi bật hôm nay” cho slide ĐẦU và hiện cả 5 */
  await check('L3', 'Preview khớp trang thật: đủ 5 slide, nhãn “Nổi bật” ở slide đầu', (env, S) => {
    S.slides = ['lunar-secret', 'bake-love-feelings', 'yours-ever'].map(b => ({ b, r: '' }));
    env.w.render();
    const pv = env.D.getElementById('hpPvBody');
    const txt = pv.textContent;
    const fan = pv.querySelectorAll('.hp-pv-fan-i').length;
    const big = pv.querySelector('.hp-pv-big');
    const bigTitle = big ? big.getAttribute('aria-label') || '' : '';
    const firstIsBig = /lunar/i.test(env.D.querySelector('.hp-pv-herot b').textContent);
    return { pass: fan === 2 && firstIsBig && /Nổi bật hôm nay/.test(txt), detail: 'quạt=' + fan + ' slide đầu đúng=' + firstIsBig };
  });

  /* L4: KV rỗng slide → preview lấy 5 bộ MỚI NHẤT theo ngày cập nhật (giống web) */
  await check('L4', 'KV rỗng slide → preview lấy 5 bộ mới nhất theo ngày cập nhật', (env, S) => {
    S.slides = []; env.w.render();
    const newest = S.books.slice().filter(b => b.ch > 0)
      .sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')))[0];
    const head = env.D.querySelector('.hp-pv-herot b').textContent;
    return { pass: head === newest.t, detail: 'preview: “' + head + '” · mới nhất: “' + newest.t + '”' };
  });

  /* L5: xoá hết slide → tóm tắt về 0 ngay, không cần tải lại */
  await check('L5', 'Gỡ hết slide → số trên thanh tóm tắt về 0 ngay', async (env, S) => {
    S.slides = [{ b: 'lunar-secret', r: '' }]; env.w.render();
    env.D.querySelector('[data-act="slide-remove"]').click();
    await wait(60);
    const n = (env.D.getElementById('hpSumSlides') || {}).textContent;
    return { pass: n === '0', detail: 'hpSumSlides = ' + n };
  });

  /* L6: thêm dòng lịch phải dùng được ngay, không bị chặn lưu */
  await check('L6', 'Thêm dòng lịch → dòng mới có thứ sẵn (không bị chặn lưu)', async (env, S) => {
    const before = S.schedule.length;
    const putsBefore = env.puts.length;
    env.D.querySelector('[data-act="sched-add"]').click();
    await wait(60);
    const last = S.schedule[S.schedule.length - 1] || {};
    const rows = env.D.querySelectorAll('.hp-sched');
    const newRow = rows[rows.length - 1];
    const dirty = env.D.getElementById('hpDirty');
    const pass = S.schedule.length === before + 1 && !!String(last.d || '').trim()
      && rows.length === S.schedule.length && !!newRow.querySelector('.hp-day.on')
      && dirty && !dirty.hidden && env.puts.length === putsBefore;
    return { pass, detail: 'dòng state=' + S.schedule.length + ' DOM=' + rows.length + ' chưa lưu=' + (dirty && !dirty.hidden) };
  });

  /* L7: khi đã đủ 8 slide vẫn thấy chỗ thêm bộ (kèm lý do khoá) */
  await check('L7', 'Đủ 8 slide: vẫn còn ô thêm bộ nhưng bị khoá + nói rõ lý do', (env, S) => {
    S.slides = S.books.slice(0, 8).map(b => ({ b: b.id, r: '' }));
    env.w.render();
    const sel = env.D.getElementById('addSlideSel');
    const addBtn = env.D.querySelector('[data-act="slide-add"]');
    return { pass: !!sel && !!addBtn && sel.disabled === true && addBtn.disabled === true, detail: 'select=' + (sel && sel.disabled) + ' nút=' + (addBtn && addBtn.disabled) };
  });

  /* L8: tick Series NGAY TRÊN CARD (không qua overlay) — phải hiện ● Chưa lưu */
  await check('L8', 'Tick Series trên card → hiện ● Chưa lưu ngay', async (env, S) => {
    S.picked = ['lunar-secret']; env.w.render();
    const box = env.D.querySelector('#seriesPickedGrid [data-role="picked"]');
    box.checked = false; fire(box, 'change');
    await wait(60);
    const hidden = env.D.getElementById('hpDirty').hidden;
    return { pass: hidden === false && S.picked.length === 0, detail: 'dirty ẩn=' + hidden + ' picked=' + S.picked.length };
  });

  /* L9: đang có bản nháp thì bấm “Đọc lại” (reload) KHÔNG được xoá im lặng */
  await check('L9', 'Đang có bản nháp: Đọc lại phải hỏi trước khi xoá', async (env, S) => {
    S.slides = [{ b: 'lunar-secret', r: '' }]; env.w.render();
    const box = env.D.querySelector('#seriesPickedGrid [data-role="picked"]');
    if (box) { box.checked = true; fire(box, 'change'); }
    S.slides.push({ b: 'yours-ever', r: 'x' }); env.w.render();
    let asked = false;
    env.w.confirm = () => { asked = true; return false; };
    const btn = env.D.querySelector('[data-act="refresh"]');
    if (btn) btn.click();
    await wait(200);
    return { pass: asked, detail: 'có hỏi: ' + asked };
  });

  /* L10: preview phải hiện ĐÚNG ghi chú lịch (detail) như web thật */
  await check('L10', 'Preview lịch hiện ghi chú (detail) như trang thật', (env, S) => {
    S.schedule = [{ d: 'Thứ 2', b: 'lunar-secret', c: 'ra chương 20', t: '' }];
    env.w.render();
    const pv = env.D.getElementById('hpPvBody').textContent;
    return { pass: /ra chương 20/.test(pv), detail: pv.slice(0, 120) };
  });

  /* L11: Lưu ở trang Series KHÔNG được ghi kèm bản nháp trang chủ chưa duyệt */
  await check('L11', 'Lưu ở trang Series chỉ ghi editorChoice, không ghi bản nháp banner', async (env, S) => {
    const bn = env.D.getElementById('hp-banner'); bn.checked = true; fire(bn, 'change');
    const tx = env.D.getElementById('hp-text'); tx.value = 'NHÁP CHƯA DUYỆT'; fire(tx, 'input');
    env.D.querySelector('[data-act="series-page"]').click();
    await wait(50);
    env.D.querySelector('#seriesPage [data-act="series-save"]').click();
    await wait(500);
    const last = env.puts[env.puts.length - 1] || {};
    const ann = (last.settings && last.settings.announcement) || {};
    return {
      pass: env.puts.length === 1 && ann.text !== 'NHÁP CHƯA DUYỆT' && Array.isArray(last.editorChoice),
      detail: 'PUT=' + env.puts.length + ' · banner ghi: ' + JSON.stringify(ann.text) + ' · editorChoice=' + (last.editorChoice || []).length
    };
  });

  /* L12: nút Đóng / Chọn tất cả trong overlay vẫn phải chạy (không bị capture chặn) */
  await check('L12', 'Nút trong trang Series vẫn chạy: Chọn tất cả / Đóng', async (env, S) => {
    env.D.querySelector('[data-act="series-page"]').click();
    await wait(50);
    env.D.querySelector('#seriesPage [data-act="series-all"]').click();
    const all = S.picked.length === S.books.length;
    env.D.querySelector('#seriesPage [data-act="series-close"]').click();
    await wait(50);
    return { pass: all && !env.D.getElementById('seriesPage'), detail: 'chọn tất cả=' + all + ' đã đóng=' + !env.D.getElementById('seriesPage') };
  });

  /* L13: lối tắt “Sửa bộ” ngay trên dòng slide */
  await check('L13', 'Dòng slide có nút Sửa bộ → sang đúng tab Sửa bộ với đúng bộ', async (env, S) => {
    S.slides = [{ b: 'lunar-secret', r: '' }]; env.w.render();
    const btn = env.D.querySelector('[data-act="hp-edit-book"]');
    if (!btn) return { pass: false, detail: 'không có nút' };
    btn.click(); await wait(300);
    return { pass: S.route === 'sua-bo' && S.selectedBook === 'lunar-secret', detail: 'route=' + S.route + ' bộ=' + S.selectedBook };
  });

  /* L14: lịch trùng một bộ ở nhiều dòng → phải cảnh báo */
  await check('L14', 'Lịch trùng một bộ ở nhiều dòng → cảnh báo ngay trên card', (env, S) => {
    S.slides = []; S.schedule = [
      { d: 'Thứ 2', b: 'lunar-secret', c: '', t: '' },
      { d: 'Thứ 3', b: 'lunar-secret', c: '', t: '' }
    ];
    env.w.render();
    return { pass: /dòng lịch/.test(env.D.getElementById('view').textContent), detail: 'có cảnh báo' };
  });

  /* L15: banner bật nhưng chưa có nội dung → nói ngay tại ô nhập */
  await check('L15', 'Công tắc bật nhưng chưa có nội dung → cảnh báo tại ô nhập', (env, S) => {
    S.slides = []; S.schedule = [];
    S.models['hp-banner'] = true; S.models['hp-text'] = '';
    env.w.render();
    const t = (env.D.getElementById('hpAnnPv') || {}).textContent || '';
    return { pass: /BẬT nhưng chưa có nội dung/.test(t), detail: t.slice(0, 90) };
  });

  console.log(JSON.stringify({ bai: 't_admin_homepage_audit.js', muc: built.length, dat: built.filter(x => x.pass).length, chiTiet: built }, null, 1));
  process.exit(built.every(x => x.pass) ? 0 : 1);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
