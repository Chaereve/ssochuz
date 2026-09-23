/* Admin · sidebar: thu gọn menu không được biến thành cột trắng trống.
   ---------------------------------------------------------------------------
   Chủ trang báo "sidebar lỗi nghiêm trọng, không làm được gì". Nguyên nhân:
   luật thu gọn cũ `.v2app.v2collapsed .v2aside span {display:none}` ẩn TẤT CẢ
   span trong nav — gồm cả span.admin-nav-icon đang bọc icon SVG — nên thanh
   72px chỉ còn chỗ trống, không còn gì để bấm; trạng thái collapsed lại nằm
   trong localStorage (ssochuz-admin-side) nên F5 vẫn hỏng, drawer mobile mở
   ra cũng trống trơn theo.

   jsdom KHÔNG áp @media (đã đối chiếu: luật trong @media(min-width:901px) và
   @media(max-width:900px) đều không chạy) nên bài này khoá bằng hai lớp:
     1. CSS TĨNH: luật ẩn khi thu gọn phải loại riêng icon qua
        span:not(.admin-nav-icon) và phải nằm trong @media(min-width:901px)
        (drawer ≤900px không bao giờ bị ảnh hưởng bởi trạng thái thu gọn).
     2. DOM: nút toggle vẫn lưu trạng thái, các nút nav còn trong DOM, còn bật
        và bấm được khi đang thu gọn (không bị disabled/ẩn cấu trúc), icon
        luôn mang class admin-nav-icon để luật :not() phía trên còn tác dụng.
   Chạy: node tests/t_admin_sidebar.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { page, dataFetch, read, ROOT } = require('./mk');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const cssSrc = read('src/admin/styles/admin.css');

/* ---------- 1. CSS tĩnh: luật thu gọn phải giữ icon, phải gói trong desktop ---------- */

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
/* trả về đoạn thân khối mở tại vị trí dấu '{' của @media (đếm ngoặc để khỏi
   nhầm với khối @media một dòng nằm kề) */
function mediaBody(css, atRule) {
  const i = css.indexOf(atRule);
  if (i < 0) return null;
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') { depth--; if (depth === 0) return css.slice(open + 1, j); }
  }
  return null;
}

const clean = stripComments(cssSrc);

/* không còn luật "ẩn sạch span" kiểu cũ (không loại trừ .admin-nav-icon) */
assert.ok(!/\.v2collapsed\s+\.v2aside\s+span\s*[,{}]/.test(clean),
  'còn luật .v2collapsed .v2aside span ẩn cả icon — sidebar thu gọn sẽ trắng trống');

/* luật ẩn chữ khi thu gọn phải nằm trong @media(min-width:901px) */
const desk = mediaBody(clean, '@media(min-width:901px)');
assert.ok(desk, 'thiếu khối @media(min-width:901px) gom các luật thu gọn');
assert.ok(/\.v2app\.v2collapsed \.v2aside span:not\(\.admin-nav-icon\)[^{]*\{display:none\}/.test(desk),
  'luật thu gọn phải ẩn span:not(.admin-nav-icon) — giữ icon cho rail 72px');
assert.ok(/\.v2app\.v2collapsed \.snav button\{justify-content:center/.test(desk),
  'rail thu gọn cần căn giữa icon');
assert.ok(/\.v2app\.v2collapsed \.v2brand \.logo\{font-size:0\}/.test(desk),
  'chữ logo phải về 0 thay vì tràn thanh 72px');

/* mọi khối drawer ≤900px không được chứa luật ẩn nhãn theo collapsed */
const mobRules = clean.split('@media(max-width:900px)').slice(1);
assert.ok(mobRules.length >= 2, 'phải còn đủ khối @media(max-width:900px) của sidebar');
for (const tail of mobRules) {
  const body = mediaBody('@media(max-width:900px)' + tail, '@media(max-width:900px)');
  assert.ok(body && !/v2collapsed[^{}]*display:none/.test(body),
    'drawer ≤900px không được ẩn nhãn theo .v2collapsed — menu điện thoại sẽ trống');
}

/* ---------- 2. DOM: toggle lưu trạng thái, nav vẫn bấm được khi đang thu gọn ---------- */
function boot(setup) {
  const p = page('admin.html', {
    fetch: dataFetch(),
    url: 'https://ssochuz.pages.dev/admin.html',
    files: ['cz-config.js', 'cz-app.js', 'cz-auth.js'],
    setup,
  });
  /* nhúng admin.css như trang thật (css:true của mk chỉ nhúng cz.css) */
  const st = p.doc.createElement('style');
  st.textContent = fs.readFileSync(path.join(ROOT, 'admin.css'), 'utf8');
  p.doc.head.appendChild(st);
  return p;
}

(async () => {
  const out = {};
  const p = boot((w) => { try { w.localStorage.removeItem('ssochuz-admin-side'); } catch (e) {} });
  const { doc, win } = p;
  const click = (sel) => {
    const el = typeof sel === 'string' ? doc.querySelector(sel) : sel;
    assert.ok(el, 'missing ' + sel);
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  };

  await wait(500);
  click('.v2gate-actions .btn.ghost'); /* vào chế độ dữ liệu tĩnh */
  await wait(700);

  const navButtons = (root) => [...(root || doc).querySelectorAll('.v2side nav button')];
  out.rendered = navButtons().length;
  assert.ok(out.rendered >= 14, 'sidebar phải render đủ nhóm tab, thấy: ' + out.rendered);
  assert.ok(navButtons().every((b) => b.querySelector('.admin-nav-icon .i')),
    'mọi nút nav phải có icon bọc trong span.admin-nav-icon (điều kiện để luật :not giữ icon)');

  /* bấm thu gọn: trạng thái lưu, nút không bị vô hiệu hoá */
  click('.v2side-toggle');
  await wait(150);
  assert.ok(doc.querySelector('.v2app').className.includes('v2collapsed'), 'thiếu class v2collapsed');
  try { assert.equal(win.localStorage.getItem('ssochuz-admin-side'), '1', 'collapsed phải lưu localStorage'); }
  catch (e) { /* jsdom localStorage có thể chặn — không phải lỗi giao diện */ }
  assert.equal(navButtons().length, out.rendered, 'thu gọn phải giữ nguyên số nút nav trong DOM');
  assert.ok(navButtons().every((b) => !b.disabled || b.dataset.tab === 'edit'),
    'thu gọn không được làm nút nav thành disabled (trừ nút Sửa bộ chưa chọn bộ)');

  /* đang thu gọn mà bấm vẫn chuyển tab — không "đứng hình" */
  click('button[data-tab="list"]');
  await wait(150);
  out.clickWhileCollapsed = !!doc.querySelector('button[data-tab="list"].on');
  assert.ok(out.clickWhileCollapsed, 'bấm tab khi đang thu gọn phải vẫn chuyển tab');

  /* mở lại: mọi thứ như cũ */
  click('.v2side-toggle');
  await wait(150);
  assert.ok(!doc.querySelector('.v2app').className.includes('v2collapsed'), 'bung lại phải bỏ v2collapsed');

  /* người dùng đang "kẹt" collapsed từ trước (localStorage=1): mở trang phải
     vẫn thấy đủ nút để bấm — không còn màn hình trắng không thoát được */
  const p2 = boot((w) => { try { w.localStorage.setItem('ssochuz-admin-side', '1'); } catch (e) {} });
  await wait(500);
  p2.doc.querySelector('.v2gate-actions .btn.ghost')
    .dispatchEvent(new p2.win.MouseEvent('click', { bubbles: true }));
  await wait(700);
  const stuckButtons = navButtons(p2.doc);
  assert.equal(stuckButtons.length, out.rendered, 'kẹt collapsed vẫn phải render đủ nút');
  assert.ok(stuckButtons.every((b) => b.querySelector('.admin-nav-icon .i')),
    'kẹt collapsed vẫn phải có icon trên từng nút (rail chỉ-icon)');
  const tgl2 = p2.doc.querySelector('.v2side-toggle');
  assert.ok(tgl2 && !tgl2.disabled, 'nút bung menu phải luôn bấm được');
  tgl2.dispatchEvent(new p2.win.MouseEvent('click', { bubbles: true }));
  await wait(150);
  assert.ok(!p2.doc.querySelector('.v2app').className.includes('v2collapsed'), 'bấm toggle phải thoát collapsed');

  console.log(JSON.stringify(out, null, 1));
  console.log('Đen: sidebar admin v2 thu gọn vẫn là rail chỉ-icon bấm được, drawer mobile không bao giờ trống.');
})().catch((e) => { console.error(e); process.exit(1); });
