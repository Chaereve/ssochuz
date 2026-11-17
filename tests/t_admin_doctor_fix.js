/* =============================================================================
   Vòng 18b · TAB “KIỂM TRA DỮ LIỆU” — nơi quản lý sức khoẻ dữ liệu

     D1  Nút “Sửa” trên từng dòng CHỈ hiện toast “Hãy sửa bộ đó trong Thư viện
         → Sửa bộ…” rồi đứng yên. Đây là bảng để SỬA, bấm mà không đi đâu là
         nút chết ⇒ phải mở đúng bộ trong tab Sửa bộ.
     D2  Cột “Book” luôn “—” vì dữ liệu quét chỉ có chuỗi “chapters = 0”, không
         có số chương THẬT đọc từ /api/book ⇒ người quản lý không biết registry
         ghi 0 hay book thật sự 0 chương.
     D3  Không có nút “Sửa tất cả”: 12 dòng “Chưa có chương” phải bấm 12 lần.
     D4  Bảng không lọc/sắp xếp được theo mức độ; 12 dòng cùng một loại vẫn
         đọc hết.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const prod = R('admin.html'), real = R('admin-real.js');
const reg = JSON.parse(R('data/registry.json'));
const resp = (x, st = 200) => ({ ok: st < 400, status: st, headers: { get: () => 'application/json' }, json: async () => x, text: async () => JSON.stringify(x) });

function build() {
  const errs = [];
  const pre = '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");sessionStorage.setItem("cz_kv_key","K");}catch(e){}<\/script>';
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, pre + '<script>' + real + '</script>');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console: ' + a.join(' ')));
  const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, D = w.document;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  w.fetch = (u) => {
    const p = new URL(String(u), 'https://ssochuz.pages.dev').pathname;
    if (p === '/api/registry') return Promise.resolve(resp(reg));
    if (p === '/api/health' || p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
    if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 137, readsToday: 4021, keys: 82, groups: [] }));
    /* book THẬT có 3 chương trong khi registry ghi 0 → phải nhìn thấy sự lệch */
    if (/^\/api\/book\//.test(p)) return Promise.resolve(resp({ slug: 'x', title: 'x', chapters: [{}, {}, {}] }));
    if (/^\/api\//.test(p)) return Promise.resolve(resp({ ok: true, items: [], comments: [], reports: [] }));
    return Promise.resolve(resp({}));
  };
  return { w, D, dom, errs };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const bad = []; let checks = 0;
const ok = (c, m) => { checks++; if (!c) bad.push(m); };

(async () => {
  const env = build();
  await wait(2200);
  const { w, D, errs } = env;
  const S = w.CZ_MOCKUP.state;
  S.route = 'kiem-tra-du-lieu'; w.render();

  const rows = [...D.querySelectorAll('#view tbody tr')];
  ok(rows.length > 0, 'có bảng vấn đề để sửa (' + rows.length + ' dòng)');

  /* D1 · nút Sửa phải dẫn tới đúng bộ */
  const first = rows[0];
  const book = first.querySelector('td').textContent.trim();
  const fix = first.querySelector('[data-act="fix-row"]');
  ok(!!fix, 'D1: mỗi dòng có nút “Sửa”');
  fix.click(); await wait(400);
  ok(S.route === 'sua-bo', 'D1: bấm “Sửa” mở tab Sửa bộ (route=' + S.route + ')');
  const sel = S.selectedBook;
  ok(!!sel, 'D1: đã chọn đúng bộ để sửa (selectedBook=' + sel + ')');

  /* D2 · cột Book hiện số chương THẬT */
  S.route = 'kiem-tra-du-lieu'; w.render();
  const r2 = [...D.querySelectorAll('#view tbody tr')];
  const cells = r2[0] ? [...r2[0].children].map(td => td.textContent.trim()) : [];
  ok(cells.some(c => /3 chương/.test(c)),
    'D2: cột Book hiện số chương thật từ /api/book (thấy: ' + JSON.stringify(cells) + ')');
  ok(!cells.slice(2, 4).every(c => c === '—'),
    'D2: cột Registry/Book không còn rỗng cả hai');

  /* D2b · dòng lệch phải NÓI RÕ lệch thế nào, không chỉ hiện 2 số */
  const rowTxt = r2[0] ? r2[0].textContent : '';
  ok(/registry ghi 0 nhưng book có 3/.test(rowTxt),
    'D2b: dòng lệch có ghi chú giải thích (thấy: ' + rowTxt.slice(0, 90) + ')');

  /* D3 · sửa hàng loạt cùng một loại vấn đề */
  const bulk = D.querySelector('#view [data-act="fix-all"]');
  ok(!!bulk, 'D3: có nút sửa cả nhóm (“Sửa tất cả dòng cùng loại”)');

  /* D4 · lọc theo mức độ */
  const filter = D.querySelector('#view [data-role="issue-filter"]');
  ok(!!filter, 'D4: có bộ lọc vấn đề');

  ok(errs.length === 0, '0 lỗi JS (' + errs.slice(0, 2).join(' | ') + ')');
  env.dom.window.close();

  console.log(JSON.stringify({ bai: 't_admin_doctor_fix.js', kiemTra: checks, loi: bad.length, errors0: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
