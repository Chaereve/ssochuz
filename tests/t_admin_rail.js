/* ============================================================================
   t_admin_rail.js · VÒNG 11: sidebar THU GỌN của admin.html MỚI + nhãn giao diện
   ----------------------------------------------------------------------------
   Owner báo: "nhiều mục bị lệch icon", "phần sidebar thu gọn trong admin panel
   bị lỗi". Ba lỗi nhìn thấy được trong ảnh:

     1. brand của rail có 2 icon bị đẩy về 2 mép: chấm `.dot` sát trái và nút
        `toggle-collapse` sát phải (do style="margin-left:auto" inline). Trục
        icon vì thế không trùng với 13 icon nav bên dưới.
     2. `.side-scroll` hiện thanh cuộn kiểu Windows (~15px) ⇒ content box hẹp
        lại ⇒ `justify-content:center` canh icon LỆCH TRÁI so với rail 76px.
     3. scrub() runtime đổi đuôi "· MẪU" thành "· KV" nên dính vào cả slug
        ("bake-love-feelings · KV"), eyebrow ("NỘI DUNG · KV"), card
        ("tối đa 8 · KV") — trông như dữ liệu bị lệch/kèm rác.

   Bài này khoá cả 3 bằng (a) kiểm CSS tĩnh, (b) tính toán trục icon, (c) dựng
   DOM thật trong jsdom và bấm nút thu gọn, (d) đối chiếu nhãn giữa prototype
   và bản phát hành. Prototype vẫn giữ MẪU; chỉ bản sinh là đổi.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const bad = [];
let checks = 0;
const ok = (c, m) => { checks++; if (!c) bad.push(m); };
const mock = R('mockup/ssochuz-admin-mockup.html');
const prod = R('admin.html');
const real = R('admin-real.js');

/* ---------- 1 · CSS tĩnh: một trục icon duy nhất khi thu gọn ---------- */
[mock, prod].forEach((src, i) => {
  const tag = i === 0 ? 'prototype' : 'admin.html';
  ok(/\.brand \.collapse-btn\{margin-left:auto;flex:none\}/.test(src), tag + ': nút thu gọn dùng class, không dùng inline style');
  ok(!/class="tool icon" style="margin-left:auto" data-act="toggle-collapse"/.test(src), tag + ': không còn margin-left:auto inline (CSS không override được)');
  ok(/class="tool icon collapse-btn" data-act="toggle-collapse"/.test(src), tag + ': renderSidebar() có class collapse-btn');
  ok(/Mở rộng sidebar':'Thu gọn sidebar'/.test(src), tag + ': aria-label đổi theo trạng thái thu gọn');
  ok(/\.app\.collapsed \.brand \.dot,\.app\.collapsed \.brand \.logo,/.test(src), tag + ': ẩn chấm thương hiệu + logo khi thu gọn');
  ok(/\.app\.collapsed \.brand \.collapse-btn\{margin:0 auto\}/.test(src), tag + ': nút thu gọn được canh giữa');
  ok(/\.app\.collapsed \.nav-item\{justify-content:center;padding:0;min-height:36px\}/.test(src), tag + ': 13 icon nav canh giữa');
  ok(/\.app\.collapsed \.side-scroll\{padding:10px;scrollbar-width:none;-ms-overflow-style:none\}/.test(src), tag + ': rail không còn thanh cuộn ăn chiều rộng');
  ok(/\.app\.collapsed \.side-scroll::-webkit-scrollbar\{width:0;height:0;display:none\}/.test(src), tag + ': ẩn luôn scrollbar WebKit');
  ok((src.match(/body\.force-drawer \.app\.collapsed \.brand \.dot\{display:block\}/g) || []).length === 1, tag + ': force-drawer mở lại chấm thương hiệu');
  ok(/\.app\.collapsed \.brand \.dot\{display:block\}/.test(src), tag + ': drawer ≤900px mở lại chấm thương hiệu');
});

/* ---------- 2 · Toán trục icon: tâm icon === tâm rail ---------- */
const RAIL = 76, BORDER = 1, PAD = 10, SCROLLBAR = 0;
const content = RAIL - BORDER - PAD * 2 - SCROLLBAR;
const railCentre = (RAIL - BORDER) / 2;
const iconCentre = PAD + content / 2;   // .nav-item padding:0; justify-content:center
ok(Math.abs(railCentre - iconCentre) <= 1,
  'tâm icon nav (' + iconCentre + 'px) trùng tâm rail (' + railCentre + 'px) — sai số ≤ 1px');
/* .app.collapsed .brand{padding:0} nên nút 38px + margin:0 auto nằm giữa
   đúng 75px của brand — KHÔNG cộng padding của .side-scroll vào đây. */
const BTN = 38;
const btnCentre = (RAIL - BORDER - BTN) / 2 + BTN / 2;
ok(Math.abs(btnCentre - railCentre) <= 1,
  'tâm nút thu gọn (38px, margin:0 auto) cũng trùng trục đó');
/* Đối chứng: thanh cuộn 15px cũ đẩy icon lệch ~7.5px — đúng triệu chứng ảnh. */
const oldCentre = 10 + (RAIL - BORDER - 20 - 15) / 2;
ok(Math.abs(oldCentre - railCentre) > 5, 'bài kiểm phân biệt được lỗi thanh cuộn cũ');

/* ---------- 3 · DOM thật: bấm thu gọn rồi đếm icon ---------- */
const vc = new VirtualConsole();
vc.on('jsdomError', e => bad.push('jsdomError: ' + ((e && e.message) || e)));
const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, '');
const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, D = w.document;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.scrollTo = () => {};
try { w.render(); } catch (e) { bad.push('render() lỗi: ' + e.message); }

const app = D.querySelector('.app');
ok(!!app, 'có .app');
const toggle = D.querySelector('.brand [data-act="toggle-collapse"]');
ok(!!toggle, 'có nút thu gọn trong brand');
if (toggle) {
  ok(toggle.classList.contains('collapse-btn'), 'nút thu gọn có class collapse-btn');
  ok(!(toggle.getAttribute('style') || '').includes('margin-left'), 'nút thu gọn KHÔNG có inline margin');
  ok(toggle.getAttribute('aria-label') === 'Thu gọn sidebar', 'aria-label lúc mở rộng');
  toggle.click();
  ok(app.classList.contains('collapsed'), 'bấm xong .app có class collapsed');
  /* render() dựng lại #sidebar nên phải lấy lại nút, không giữ tham chiếu cũ. */
  const toggle2 = D.querySelector('.brand [data-act="toggle-collapse"]');
  ok(!!toggle2 && toggle2.getAttribute('aria-label') === 'Mở rộng sidebar', 'aria-label đổi sau khi thu gọn');
}
const brandIcons = D.querySelectorAll('#sidebar .brand svg.ic');
ok(brandIcons.length === 1, 'brand khi thu gọn có ĐÚNG 1 icon (cũ: chấm + burger lệch 2 mép), hiện ' + brandIcons.length);
ok(!!D.querySelector('#sidebar .brand .dot'), 'chấm thương hiệu vẫn nằm trong DOM nhưng bị CSS ẩn');
const items = D.querySelectorAll('#sidebar .nav-item');
ok(items.length === 13, '13 mục nav, hiện ' + items.length);
let iconBad = 0, tipBad = 0, labelBad = 0;
items.forEach(it => {
  if (it.querySelectorAll('svg.ic').length !== 1) iconBad++;
  if (!it.getAttribute('title')) tipBad++;
  if (it.querySelector('.tx') && !/\.app\.collapsed \.nav-item>\.tx/.test(prod)) labelBad++;
});
ok(iconBad === 0, 'mỗi mục nav đúng 1 icon svg.ic (sai ' + iconBad + ')');
ok(tipBad === 0, 'mỗi icon khi thu gọn vẫn có title tooltip (thiếu ' + tipBad + ')');
ok(labelBad === 0, 'nhãn chữ được ẩn bằng CSS chứ không xoá khỏi DOM');
ok(!D.querySelector('#sidebar [style*="margin-left"]'), 'sidebar không còn inline margin đẩy icon lệch');

/* ---------- 3b · Prototype tĩnh vẫn render được sau khi sửa CSS/JS ---------- */
{
  const vc2 = new VirtualConsole();
  const perr = [];
  vc2.on('jsdomError', e => perr.push(String((e && e.message) || e)));
  const dm = new JSDOM(mock, { url: 'file:///admin-mockup.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc2 });
  const w2 = dm.window, D2 = w2.document;
  let fetched = 0;
  w2.fetch = () => { fetched++; return Promise.reject(new Error('prototype không được gọi mạng')); };
  w2.HTMLElement.prototype.scrollIntoView = function () {};
  w2.scrollTo = () => {};
  try {
    w2.render();
    const t2 = D2.querySelector('.brand [data-act="toggle-collapse"]');
    if (t2) { t2.click(); }
    ['dashboard', 'thu-vien', 'homepage-cms', 'thong-ke', 'cai-dat'].forEach(r => {
      w2.CZ_MOCKUP && (w2.CZ_MOCKUP.state.route = r, w2.render());
    });
  } catch (e) { perr.push('render: ' + e.message); }
  ok(perr.length === 0, 'prototype mockup render 5 tab + thu gọn: 0 lỗi JS (' + perr.join(' | ') + ')');
  ok(fetched === 0, 'prototype mockup không gọi fetch (vẫn là bản tĩnh)');
  ok(!!D2.querySelector('#sidebar .collapse-btn'), 'prototype cũng có nút thu gọn dạng class');
  ok(/· MẪU/.test(D2.getElementById('view').textContent || ''), 'prototype vẫn hiện nhãn MẪU');
}

/* ---------- 4 · Nhãn: prototype MẪU, bản phát hành sạch ---------- */
ok(/· MẪU/.test(mock), 'prototype mockup vẫn giữ nhãn · MẪU');
ok(!/· MẪU/.test(prod), 'admin.html không còn đuôi · MẪU');
ok(!/· KV/.test(prod), 'admin.html không còn đuôi · KV (lỗi owner báo)');
ok(/id="czClock"/.test(prod), 'meta có đồng hồ thật thay cho 03/11 20:40 tĩnh');
ok(/LÚC ' \+ CLOCK/.test(real), 'admin-real.js điền giờ thật vào #czClock');
ok(!/replace\(\/\\bmẫu\\b\/g/.test(real), 'scrub() KHÔNG sửa chữ "mẫu" thường (có thể là tên bộ thật trong KV)');
ok(/replace\(\/\\s\*·\\s\*MẪU\/g, ''\)/.test(real), 'scrub() cắt đuôi · MẪU thay vì đổi thành · KV');
ok(/getElementById\('docsTitle'\)/.test(real), 'tài liệu lịch sử vòng 1–9 không bị scrub');
ok(/Bộ có số liệu',String\(state\.books\.length\)/.test(prod), 'Thống kê tính số bộ thật, không còn 18 cứng');
ok(/bộ trong registry',String\(state\.books\.length\)/.test(prod), 'Kiểm tra dữ liệu tính số bộ thật, không còn 248 cứng');
ok(/Chưa có phiếu nào trong KV/.test(prod), 'card Phiếu theo chương hết 4 dòng số liệu bịa');

console.log(JSON.stringify({ bai: 't_admin_rail.js / vòng 11', loi: bad.length, kiemTra: checks, errors0: bad }, null, 1));
if (bad.length) { console.log('CÒN LỖI:\n - ' + bad.join('\n - ')); process.exit(1); }
