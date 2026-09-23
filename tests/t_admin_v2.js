/* Admin v2: auth gate + Overview/List/New/Edit metadata/chapter editor render bằng kiến trúc Preact. */
const assert = require('assert');
const { page, dataFetch } = require('./mk');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* số liệu kỳ vọng tính từ registry thật trong repo — không hardcode để không lỗi thời */
const reg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'registry.json'), 'utf8'));
const viNum = (n) => (Number(n) || 0).toLocaleString('vi-VN');
const libCount = (reg.lib || []).length;
const chapCount = (reg.lib || []).reduce((sum, b) => sum + (Number(b.chapters) || 0), 0);

(async () => {
  const out = {};
  const p = page('admin-v2.html', { fetch: dataFetch(), url: 'https://ssochuz.pages.dev/admin-v2.html' });
  const { doc, win } = p;
  const click = (sel) => {
    const el = typeof sel === 'string' ? doc.querySelector(sel) : sel;
    assert.ok(el, 'missing ' + sel);
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  };
  const input = (sel, value) => {
    const el = doc.querySelector(sel);
    assert.ok(el, 'missing ' + sel);
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
  };
  await wait(500);
  out.gate = !!doc.querySelector('.v2gate');
  click('.v2gate-actions .btn.ghost');
  await wait(800);
  const tiles = [...doc.querySelectorAll('.tile')].map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  out.overview = { tiles: tiles.slice(0, 6), recent: doc.querySelectorAll('.ovrec').length };
  assert.ok(tiles.some((text) => new RegExp('^' + viNum(libCount) + 'Bộ truyện').test(text)), 'sai số bộ overview');
  assert.ok(tiles.some((text) => new RegExp('^' + viNum(chapCount) + 'Chương đã đăng').test(text)), 'sai số chương overview');

  click('button[data-tab="list"]');
  await wait(200);
  out.list = { rows: doc.querySelectorAll('.v2book-table tbody tr').length };
  /* danh sách có phân trang 24 bộ/trang → trang 1 nhiều nhất 24 dòng */
  const PAGE = 24;
  assert.ok(out.list.rows === Math.min(PAGE, libCount), 'số dòng trang 1 sai: ' + out.list.rows);
  assert.ok(!!doc.querySelector('.v2pager'), 'thiếu phân trang khi bộ > 24');

  click(doc.querySelector('.v2book-table tbody tr .v2actions button'));
  await wait(1200);
  out.edit = doc.querySelector('#pane-edit h3').textContent.trim();
  out.chapterEditor = {
    chapters: doc.querySelectorAll('.v2chapter-list button').length,
    toolbar: doc.querySelectorAll('.v2tipbar button').length,
    tiptap: !!doc.querySelector('.ProseMirror'),
    uploadButtons: [...doc.querySelectorAll('button')].filter((el) => /Upload (ảnh|bìa)/.test(el.textContent)).length,
    lockPanel: !!doc.querySelector('.v2lock-panel'),
    duplicate: [...doc.querySelectorAll('button')].some((el) => /Nhân bản bộ/.test(el.textContent))
  };
  assert.ok(/Sửa metadata:/.test(out.edit));
  assert.ok(out.chapterEditor.chapters > 0, 'chưa render danh sách chương');
  assert.ok(out.chapterEditor.tiptap, 'TipTap chưa gắn ProseMirror');
  assert.ok(out.chapterEditor.uploadButtons >= 2, 'thiếu nút upload bìa/ảnh');
  assert.ok(out.chapterEditor.lockPanel, 'thiếu panel khóa mật mã');
  assert.ok(out.chapterEditor.duplicate, 'thiếu nút nhân bản bộ');

  click('button[data-tab="classify"]');
  await wait(150);
  out.classify = !!doc.querySelector('#pane-classify');
  assert.ok(out.classify, 'tab Phân loại chưa render');
  assert.ok(/Phân loại theo thể loại/.test(doc.querySelector('#pane-classify').textContent), 'thiếu tiêu đề Phân loại');
  assert.ok(!!doc.querySelector('button[data-tab="genres"]'), 'thiếu menu Thể loại (CRUD)');
  assert.ok([...doc.querySelectorAll('#tabs button')].some((el) => /Phân loại/.test(el.textContent)), 'thiếu menu Phân loại');
  assert.ok(!doc.querySelector('#pane-classify .v2tags'), 'Phân loại không được dùng tags');

  click('button[data-tab="doctor"]');
  await wait(100);
  out.doctor = !!doc.querySelector('#pane-doctor');
  assert.ok(out.doctor, 'tab Kiểm tra dữ liệu chưa render');
  const scanBtn = [...doc.querySelectorAll('#pane-doctor button')].find((el) => /Quét book/.test(el.textContent));
  click(scanBtn);
  await wait(1800);
  out.doctorScan = /book đã quét/.test(doc.querySelector('#pane-doctor').textContent);
  assert.ok(out.doctorScan, 'Doctor chưa quét book tĩnh');
  for (const [tab, pane] of [['cmts', 'comments'], ['reports', 'reports'], ['stats', 'stats'], ['votes', 'votes'], ['log', 'log'], ['settings', 'settings']]) {
    click('button[data-tab="' + tab + '"]');
    await wait(100);
    out[pane] = !!doc.querySelector('#pane-' + tab);
    assert.ok(out[pane], 'tab ' + tab + ' chưa render');
  }

  click('button[data-tab="new"]');
  await wait(100);
  input('#pane-new input.inp', 'Test New Story');
  await wait(100);
  out.newPreview = doc.querySelector('#pane-new code').textContent;
  assert.strictEqual(out.newPreview, '/truyen/test-new-story/');
  out.errors = p.errors;
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đen: admin v2 render đúng dữ liệu nền.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
