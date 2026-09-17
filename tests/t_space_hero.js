/* My Space: hero "MY SPACE / GÓC ĐỌC CỦA BẠN" và hộp thoại tủ truyện phải CĂN ĐÚNG.
   ---------------------------------------------------------------------------
   Chủ trang báo hero bị lệch. Nguyên nhân không phải một con số sai mà là CÁCH căn:
   vòng trang trí neo vào hero bằng left/top cứng trong khi ảnh đại diện do flex/grid
   xếp, nên hai tâm không bao giờ khớp; cộng thêm ba bộ luật .space-hero ở ba chỗ
   trong cz.css ghi đè nhau theo thứ tự tệp (dải 601–700px đặt cột lưới 72px cho
   ảnh 92px ⇒ ảnh đè lên chữ).

   Bài này khoá hai chuyện, vì jsdom KHÔNG dàn trang nên không đo được toạ độ:
     1. CẤU TRÚC: vòng tròn phải là con của hộp ảnh (đồng tâm theo cấu trúc, không
        theo hai con số tự khớp nhau); mọi cỡ ảnh đi qua biến --sp-ava.
     2. CSS TĨNH: không còn luật nào neo .space-hero-* bằng left/top/width cứng,
        không còn .space-hero trong @media đặt grid-template-columns, hộp thoại
        không được đặt display ngoài [open] (nếu không <dialog> đóng vẫn hiện),
        và --space-* phải có ở :root vì hộp chọn tủ nằm trên trang truyện.
   Chạy: node tests/t_space_hero.js */
const assert = require('node:assert/strict');
const { page, dataFetch, read } = require('./mk');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const css = read('cz.css');
const reg = JSON.parse(read('data/registry.json')), slug = reg.lib[0].slug;
const user = { uid: 'alice', name: 'Alice', email: 'secret@test', exp: Math.floor(Date.now() / 1000) + 3600 };
const store = { id: 'a'.repeat(64), version: 3, profile: { name: 'Alice', bio: 'Mỗi ngày một câu chuyện.', avatar: '' }, shelves: [{ id: 'shelf-1', name: 'Muốn đọc', description: '', visibility: 'private', books: [slug], updatedAt: Date.now() }] };
const J = (d, s = 200) => Promise.resolve({ ok: s < 400, status: s, json: async () => structuredClone(d), text: async () => JSON.stringify(d) });
const api = (p, o = {}) => {
  if (p === '/api/auth/me') return J({ ok: true, user });
  if (p === '/api/me/space') {
    if (o.method === 'PUT') { const b = JSON.parse(o.body); if (b.profile) store.profile = b.profile; if (b.shelf) { const s = { ...b.shelf, id: b.shelf.id || 'shelf-1' }; store.shelves = store.shelves.filter((x) => x.id !== s.id).concat(s); } store.version++; }
    return J(store);
  }
  if (p.startsWith('/api/profiles/')) return J({ id: store.id, profile: store.profile, shelves: store.shelves.filter((s) => s.visibility === 'public') });
};

/* ---------- 1. CSS tĩnh: không còn cách căn nào dễ lệch ---------- */
function ruleOf(sel) {
  /* lấy thân luật đầu tiên khớp selector (đủ dùng cho các luật một dòng/khối của ta) */
  const i = css.indexOf(sel + ' {');
  const j = css.indexOf(sel + '{');
  const at = i >= 0 ? i : j;
  assert.ok(at >= 0, 'cz.css thiếu luật ' + sel);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}
function assertNoHardAnchor(sel) {
  const body = ruleOf(sel);
  for (const prop of ['left:', 'top:', 'right:', 'bottom:', 'width:', 'height:', 'margin-top:']) {
    assert.ok(!body.includes(prop), sel + ' không được neo bằng ' + prop + ' (phải đồng tâm theo cấu trúc) — đang có: ' + body.trim().slice(0, 120));
  }
}

/* vòng tròn nằm inset:0 trong hộp ảnh ⇒ đồng tâm với ảnh ở MỌI cỡ màn hình */
const ring = ruleOf('.space-hero-ring');
assert.match(ring, /position:\s*absolute/, 'vòng tròn phải absolute trong hộp ảnh');
assert.match(ring, /inset:\s*0/, 'vòng tròn phải inset:0 để đồng tâm với ảnh');
assert.match(ring, /border-radius:\s*50%/, 'vòng tròn phải tròn');
assertNoHardAnchor('.space-hero-ring');

/* hộp ảnh = ảnh + 2×khe, tính bằng biến, không phải số cứng */
const portrait = ruleOf('.space-hero-portrait');
assert.match(portrait, /width:\s*calc\(var\(--sp-ava\) \+ var\(--sp-ring\) \* 2\)/, 'hộp ảnh phải tính từ --sp-ava/--sp-ring');
assert.match(portrait, /height:\s*calc\(var\(--sp-ava\) \+ var\(--sp-ring\) \* 2\)/, 'hộp ảnh phải vuông');
const ava = ruleOf('.space-hero-avatar');
assert.match(ava, /width:\s*var\(--sp-ava\)/, 'cỡ ảnh phải đi qua --sp-ava');
assert.match(ava, /height:\s*var\(--sp-ava\)/, 'cỡ ảnh phải đi qua --sp-ava');

/* không còn luật nào đặt cỡ ảnh/hero bằng px — chính mấy con số này từng lệch nhau */
assert.ok(!/\.space-hero-avatar\s*\{[^}]*\b(?:width|height|font-size):\s*\d/.test(css), 'không được đặt cỡ .space-hero-avatar bằng px');
assert.ok(!/\.space-hero\s*\{[^}]*\b(?:width|height|min-height):\s*\d/.test(css), 'không được đặt cỡ .space-hero bằng px');
/* dải 601–700px từng vỡ vì @media đặt cột lưới 72px cho ảnh 92px */
assert.ok(!/\.space-hero\s*\{[^}]*grid-template-columns/.test(css), '.space-hero không được đặt grid-template-columns (đã vỡ ở dải 601–700px)');
/* trang trí trôi nổi cũ đã bỏ: còn sót là còn lệch */
for (const dead of ['.space-hero-orbit', '.space-hero-rule', '.space-hero-action']) {
  assert.ok(!css.includes(dead + ' '), 'cz.css còn luật ' + dead + ' (trang trí trôi nổi đã bỏ)');
  assert.ok(!css.includes(dead + '{'), 'cz.css còn luật ' + dead);
}

/* hộp thoại: display chỉ được đặt trong [open], nếu không <dialog> đóng vẫn hiện
   (luật tác giả thắng luật UA `dialog:not([open]){display:none}`) */
assert.ok(!/(^|\})\s*\.space-dialog\s*\{[^}]*display:/.test(css), '.space-dialog không được đặt display ngoài [open]');
assert.match(ruleOf('.space-dialog[open]'), /display:\s*flex/, 'hộp thoại mở phải là flex cột');
assert.match(ruleOf('.space-dialog-head'), /justify-content:\s*space-between/, 'tiêu đề trái – nút đóng phải, không dính vào nhau');
assert.match(ruleOf('.space-dialog-body'), /overflow-y:\s*auto/, 'thân hộp tự cuộn để đầu/chân cố định');
assert.match(ruleOf('.space-dialog-foot'), /flex:\s*none/, 'chân hộp không bị co');
/* hộp chọn tủ được tạo trên trang truyện (body không có .space-page) nên biến
   --space-* phải có ở :root, nếu không viền thành currentColor và bo góc về 0 */
const root = ruleOf(':root');
assert.match(css, /:root\s*\{[^}]*--space-radius:/, '--space-radius phải khai báo ở :root');
assert.match(css, /:root\s*\{[^}]*--space-line:/, '--space-line phải khai báo ở :root');
void root;

/* ---------- 2. cấu trúc thật trong trang (jsdom) ---------- */
(async () => {
  const p = page('my-space.html', {
    config: { CZ_API: 'https://cms.test' }, url: 'https://ssochuz.pages.dev/my-space', css: true,
    fetch: dataFetch({ api }),
    setup(w) {
      w.localStorage.setItem('ssochuz-user', JSON.stringify(user));
      w.localStorage.setItem('ssochuz-auth-token', 'mock-token');
      w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    }
  });
  await wait(500);
  const $ = (s) => p.doc.querySelector(s);

  /* hero: [hộp ảnh (vòng + ảnh)] [chữ] [thao tác] */
  const hero = $('#spaceHero');
  assert.ok(hero && !hero.hidden, 'hero phải hiện khi đã đăng nhập');
  const portraitEl = $('.space-hero-portrait');
  assert.ok(portraitEl, 'hero phải có hộp ảnh .space-hero-portrait');
  assert.equal(portraitEl.parentElement, hero, 'hộp ảnh phải là con trực tiếp của hero');
  const ringEl = $('.space-hero-portrait > .space-hero-ring');
  assert.ok(ringEl, 'vòng tròn phải nằm TRONG hộp ảnh (đồng tâm theo cấu trúc)');
  assert.ok($('.space-hero-portrait > .space-avatar.space-hero-avatar'), 'ảnh phải nằm TRONG hộp ảnh');
  assert.ok(hero.querySelector('.space-hero-orbit') === null, 'không còn .space-hero-orbit');
  assert.ok(hero.querySelector('.space-hero-rule') === null, 'không còn .space-hero-rule');
  assert.ok($('.space-intro > .space-hero-label > .space-kicker'), 'nhãn phải nằm trong khối chữ');
  assert.equal($('#spaceHero h1').textContent, 'Alice', 'hero hiện tên tài khoản');
  assert.ok($('.space-hero-side > .btn'), 'nút "Chỉnh sửa hồ sơ" nằm trong cột thao tác');
  /* jsdom có tính getComputedStyle cho luật không nằm trong @media */
  const cs = p.win.getComputedStyle(portraitEl);
  assert.equal(cs.display, 'grid', 'hộp ảnh phải là grid để căn ảnh vào giữa');
  assert.equal(p.win.getComputedStyle(ringEl).borderRadius, '50%', 'vòng tròn phải tròn');

  /* hộp thoại tủ truyện: đầu – thân – chân, nút đóng bên phải, nút lưu ở chân */
  const dlg = $('#shelfDialog');
  assert.ok(dlg, 'phải còn #shelfDialog');
  const head = dlg.querySelector('.space-dialog-head'), body = dlg.querySelector('.space-dialog-body'), foot = dlg.querySelector('.space-dialog-foot');
  assert.ok(head && body && foot, 'hộp thoại phải có đủ head/body/foot');
  assert.equal(head.querySelector('#closeShelf') && head.lastElementChild.id, 'closeShelf', 'nút đóng phải ở cuối hàng tiêu đề');
  assert.ok(head.querySelector('#shelfFormTitle'), 'tiêu đề phải ở đầu hàng');
  for (const id of ['#shelfName', '#shelfDescription', '#shelfVisibility', '#shelfSearch', '#shelfPicker', '#shelfPickerInfo']) {
    assert.ok(body.querySelector(id), id + ' phải nằm trong thân hộp (phần cuộn)');
  }
  for (const id of ['#shelfMessage', '#cancelShelf', '#saveShelf']) {
    assert.ok(foot.querySelector(id), id + ' phải nằm ở chân hộp (luôn thấy được)');
  }
  assert.equal($('#selectedCount').textContent, '0/200', 'bộ đếm theo kiểu 0/200, không còn ngoặc đơn');
  assert.equal($('#selectedCount').className, 'fl-count', 'bộ đếm dùng đúng kiểu chữ .fl-count');

  /* mở hộp: chọn 1 truyện rồi lưu — bộ đếm và dữ liệu phải khớp */
  $('#newShelf').click();
  assert.equal(dlg.open, true, 'bấm + phải mở hộp');
  const cb = $('#shelfPicker [data-book="' + slug + '"]');
  assert.ok(cb, 'danh sách chọn truyện phải có trong thân hộp');
  cb.checked = true; cb.dispatchEvent(new p.win.Event('change', { bubbles: true }));
  assert.equal($('#selectedCount').textContent, '1/200', 'chọn truyện phải cập nhật bộ đếm');
  $('#shelfName').value = 'Tủ thử nghiệm';
  await $('#shelfForm').onsubmit({ preventDefault() {} });
  assert.equal(dlg.open, false, 'lưu xong hộp phải đóng');
  assert.equal(store.shelves[store.shelves.length - 1].name, 'Tủ thử nghiệm');

  /* nút Huỷ và dấu ✕ cùng một hành động, không cần JS riêng cho từng nút */
  $('#openNewShelf').click();
  assert.equal(dlg.open, true);
  $('#cancelShelf').click();
  assert.equal(dlg.open, false, 'nút Huỷ phải đóng hộp');
  $('#openNewShelf').click();
  $('#closeShelf').click();
  assert.equal(dlg.open, false, 'dấu ✕ phải đóng hộp');

  /* ---------- 3. hồ sơ công khai: cùng một hero, không có cột thao tác ---------- */
  const pub = page('profile.html', {
    config: { CZ_API: 'https://cms.test' }, url: 'https://ssochuz.pages.dev/profile?id=' + store.id, css: true,
    fetch: dataFetch({ api })
  });
  await wait(400);
  const ph = pub.doc.querySelector('#spaceHero');
  assert.ok(pub.doc.querySelector('.space-hero-portrait > .space-hero-ring'), 'hồ sơ công khai cũng phải có vòng đồng tâm trong hộp ảnh');
  assert.equal(ph.querySelector('.space-hero-side'), null, 'hồ sơ công khai không có nút "Chỉnh sửa hồ sơ"');
  assert.ok(!ph.textContent.includes('secret@test'), 'không lộ email');
  /* HTML tĩnh (chưa chạy JS) phải cùng khung với bản JS dựng, nếu không chữ
     nhãn và tiêu đề hiện ngang hàng nhau trong tích tắc đầu tiên */
  const staticHero = read('profile.html').match(/<div id="spaceHero"[\s\S]*?<\/h1>/);
  assert.ok(staticHero && staticHero[0].includes('space-hero-portrait') && staticHero[0].includes('space-intro'),
    'HTML tĩnh của profile.html phải dựng sẵn khung hero (portrait + intro)');
  const staticSpace = read('my-space.html').match(/<div id="spaceHero"[\s\S]*?<\/h1>/);
  assert.ok(staticSpace && staticSpace[0].includes('space-hero-portrait') && staticSpace[0].includes('space-intro'),
    'HTML tĩnh của my-space.html phải dựng sẵn khung hero (portrait + intro)');

  /* ---------- 4. hộp "Chọn tủ lưu truyện" trên trang truyện cùng một khung ---------- */
  const story = read('cz-story.js');
  for (const cls of ['space-dialog-head', 'space-dialog-body', 'space-dialog-foot', 'space-dialog-close']) {
    assert.ok(story.includes(cls), 'cz-story.js phải dựng hộp chọn tủ với .' + cls);
  }
  assert.ok(story.includes('class="space-dialog-close"'), 'nút đóng hộp chọn tủ phải dùng .space-dialog-close');
  assert.ok(!story.includes('class="ibo" type="button" data-close-shelf-modal'),
    'nút đóng hộp chọn tủ không được dùng .ibo (biến --rd-* chỉ có ở trang đọc)');

  assert.deepEqual(p.errors, []);
  assert.deepEqual(pub.errors, []);
  p.dom.window.close(); pub.dom.window.close();
  console.log('My Space hero + hộp thoại: vòng đồng tâm theo cấu trúc, cỡ ảnh qua --sp-ava, head/body/foot đúng chỗ, bộ đếm 0/200, hồ sơ công khai cùng khung — đạt');
})().catch((e) => { console.error(e); process.exit(1); });
