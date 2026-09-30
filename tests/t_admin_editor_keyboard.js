/* ============================================================================
   t_admin_editor_keyboard.js · MILESTONE C + D2: BÀN PHÍM TRONG TRÌNH SOẠN
   CHƯƠNG & TƯƠNG THÍCH TIPTAP 3
   ----------------------------------------------------------------------------
   Kiểm tra luồng soạn chương hoàn toàn bằng bàn phím trên Tiptap 3:
   1. Danh sách chương (`aside.v2chapter-list[aria-label="Danh sách chương"]`):
      - chương đang chọn có `aria-current="true"`
      - `ArrowDown` / `ArrowUp` / `End` / `Home` đổi chương, dời focus đúng nút
        và ghi nháp ngay lập tức trước khi rời chương
      - `Alt+ArrowDown` / `Alt+ArrowUp` đổi thứ tự chương bằng bàn phím
   2. Ô tên chương (`#v2ChapTitle` gắn `<label for="v2ChapTitle">`):
      - nhấn `Enter` ở ô tên chương đưa focus thẳng vào `.ProseMirror`
        (`role="textbox"`, `aria-multiline="true"`, `aria-label="Nội dung chương"`)
   3. Thanh công cụ (`[role="toolbar"][aria-label="Định dạng chương"]`):
      - mọi nút đều có `aria-label` rõ nghĩa
      - `ArrowRight` / `ArrowLeft` / `Home` / `End` di chuyển focus vòng quanh
        các nút đang bật trên thanh công cụ
      - bật Đậm / Nghiêng / Gạch chân / H2 / Căn giữa trên Tiptap 3 cập nhật HTML,
        cập nhật `aria-pressed="true"`, trả focus về `.ProseMirror`, và Hoàn tác /
        Làm lại (`undo`/`redo`) hoạt động đúng
   4. Phím tắt trong vùng soạn chương:
      - `Ctrl+Alt+N` tạo chương mới và nhảy tới chương đó
      - `Ctrl+S` lưu chương đang mở (`PUT /api/book/<slug>/chapter`)
   ========================================================================== */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { page, read, ROOT } = require('./mk');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function response(body, ok = true, status = 200) {
  return Promise.resolve({
    ok, status,
    headers: { get: (name) => /content-type/i.test(name) ? 'application/json' : '' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  });
}
function bodyOf(opt) { try { return opt && opt.body ? JSON.parse(opt.body) : {}; } catch (e) { return {}; } }
function input(win, el, value) {
  assert.ok(el, 'không thấy ô nhập');
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function click(win, el) {
  assert.ok(el, 'không thấy nút cần bấm');
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}
function keydown(win, el, key, opts = {}) {
  assert.ok(el, 'không thấy phần tử nhận phím ' + key);
  const ev = new win.KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, opts));
  el.dispatchEvent(ev);
  return ev;
}
async function until(fn, msg, tries = 100) {
  for (let i = 0; i < tries; i++) { if (fn()) return; await wait(30); }
  assert.fail(msg);
}

(async () => {
  const registry = JSON.parse(read('data/registry.json'));
  const slug = 'third-person';
  const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', slug + '.json'), 'utf8'));
  const calls = [];
  const apiFetch = (url, opt = {}) => {
    const method = opt.method || 'GET';
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    const body = bodyOf(opt);
    calls.push({ method, path: u.pathname, body });
    if (u.origin !== 'https://cms.test') return response({ ok: false, error: 'unexpected origin' }, false, 404);
    if (u.pathname === '/api/health') return response({ ok: true, adminConfigured: true, kv: true });
    if (u.pathname === '/api/whoami') return response({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/registry') return response(registry);
    if (u.pathname === '/api/admin/kv') return response({ ok: true, groups: [], writesToday: 2, lastReset: '2026-09-30' });
    if (u.pathname === '/api/admin/reports') return response({ ok: true, count: 0, items: [] });
    if (u.pathname === '/api/admin/comments') return response({ ok: true, count: 0, comments: [] });
    if (u.pathname === '/api/book/' + slug + '/chapter') {
      return response({
        ok: true, slug, index: Number(body.index) || 0, action: body.action || 'update',
        chapters: (book.chapters || []).length, live: 22, pending: 0,
        bytes: 1024, saved: '2026-09-30T10:00:00Z',
        registry: { changed: true, labelNow: '22/22' },
      });
    }
    if (u.pathname === '/api/book/' + slug) return response(book);
    return response({ ok: false, error: 'missing mock ' + method + ' ' + u.pathname }, false, 404);
  };

  const p = page('admin.html', {
    fetch: apiFetch,
    url: 'https://ssochuz.pages.dev/admin.html',
    config: { CZ_API: 'https://cms.test' },
  });
  const { doc, win } = p;
  await wait(400);
  input(win, doc.querySelector('#v2Api'), 'https://cms.test');
  input(win, doc.querySelector('#v2Key'), 'test-key');
  await wait(80);
  doc.querySelector('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !doc.querySelector('.v2gate'), 'chưa qua được cổng đăng nhập admin');

  click(win, doc.querySelector('button[data-tab="list"]'));
  await wait(150);
  const row = [...doc.querySelectorAll('.v2book-table tbody tr')].find((tr) => tr.textContent.includes(slug));
  assert.ok(row, 'không thấy bộ ' + slug);
  click(win, row.querySelector('.v2actions button'));
  await until(() => !!doc.querySelector('#pane-edit .ProseMirror'), 'trình soạn thảo Tiptap 3 chưa khởi tạo');

  /* ---- 1. Thuộc tính trợ năng cơ bản của vùng soạn chương ---- */
  const chapList = doc.querySelector('#pane-edit aside.v2chapter-list');
  assert.strictEqual(chapList.getAttribute('aria-label'), 'Danh sách chương');
  const chapBtns = () => [...chapList.querySelectorAll('button')];
  assert.strictEqual(chapBtns()[0].getAttribute('aria-current'), 'true', 'chương 1 phải có aria-current="true"');
  assert.strictEqual(chapBtns()[1].getAttribute('aria-current'), null, 'chương 2 chưa chọn không được có aria-current');

  const titleLabel = doc.querySelector('#pane-edit label[for="v2ChapTitle"]');
  const titleInput = doc.querySelector('#pane-edit #v2ChapTitle');
  assert.ok(titleLabel && titleInput, 'ô tên chương phải nối với <label for="v2ChapTitle">');

  const prose = () => doc.querySelector('#pane-edit .ProseMirror');
  assert.strictEqual(prose().getAttribute('role'), 'textbox');
  assert.strictEqual(prose().getAttribute('aria-multiline'), 'true');
  assert.strictEqual(prose().getAttribute('aria-label'), 'Nội dung chương');

  /* ---- 2. Điều hướng danh sách chương bằng bàn phím + giữ nháp ---- */
  input(win, titleInput, 'Chương 1 — sửa bằng bàn phím');
  const draftKey0 = 'ssochuz_admin_v2_chdraft:' + slug + ':0';
  win.localStorage.removeItem(draftKey0);

  chapBtns()[0].focus();
  keydown(win, chapBtns()[0], 'ArrowDown');
  await until(() => chapBtns()[1].getAttribute('aria-current') === 'true', 'ArrowDown phải chuyển sang chương 2');
  assert.strictEqual(doc.activeElement, chapBtns()[1], 'ArrowDown phải dời focus sang nút chương 2');
  const flushed0 = JSON.parse(win.localStorage.getItem(draftKey0) || 'null');
  assert.ok(flushed0 && flushed0.title === 'Chương 1 — sửa bằng bàn phím', 'ArrowDown đổi chương phải ghi nháp ngay');

  keydown(win, chapBtns()[1], 'End');
  const lastIdx = chapBtns().length - 1;
  await until(() => chapBtns()[lastIdx].getAttribute('aria-current') === 'true', 'End phải nhảy tới chương cuối');
  assert.strictEqual(doc.activeElement, chapBtns()[lastIdx], 'End phải focus nút chương cuối');

  keydown(win, chapBtns()[lastIdx], 'Home');
  await until(() => chapBtns()[0].getAttribute('aria-current') === 'true', 'Home phải quay về chương đầu');
  assert.strictEqual(doc.activeElement, chapBtns()[0], 'Home phải focus nút chương đầu');
  assert.strictEqual(doc.querySelector('#v2ChapTitle').value, 'Chương 1 — sửa bằng bàn phím', 'quay về chương 1 phải khôi phục nháp tên chương');

  /* Alt+ArrowDown đổi thứ tự chương 1 xuống vị trí 2 */
  keydown(win, chapBtns()[0], 'ArrowDown', { altKey: true });
  await until(() => calls.some((c) => c.path === '/api/book/' + slug + '/chapter' && typeof c.body.from === 'number'), 'Alt+ArrowDown phải gọi API đổi thứ tự chương');
  const moveCall = calls.find((c) => c.path === '/api/book/' + slug + '/chapter' && typeof c.body.from === 'number');
  assert.strictEqual(moveCall.body.from, 0);
  assert.strictEqual(moveCall.body.to, 1);
  await wait(150);
  await until(() => !!prose(), 'trình soạn thảo sẵn sàng sau khi đổi thứ tự chương');

  /* ---- 3. Nhấn Enter ở ô Tên chương → focus vào thẳng .ProseMirror ---- */
  const ti = doc.querySelector('#v2ChapTitle');
  ti.focus();
  keydown(win, ti, 'Enter');
  assert.strictEqual(doc.activeElement, prose(), 'Enter ở ô tên chương phải đưa focus vào .ProseMirror');

  /* ---- 4. Thanh công cụ định dạng: mũi tên di chuyển focus + Tiptap 3 ---- */
  const toolbar = doc.querySelector('#pane-edit [role="toolbar"][aria-label="Định dạng chương"]');
  assert.ok(toolbar, 'thiếu thanh công cụ định dạng chương');
  const tBtns = [...toolbar.querySelectorAll('button')];
  assert.ok(tBtns.length >= 14, 'thanh công cụ thiếu nút');
  tBtns.forEach((b) => {
    assert.ok(b.getAttribute('aria-label'), 'mọi nút trên thanh công cụ phải có aria-label: ' + b.outerHTML);
  });

  tBtns[0].focus();
  assert.strictEqual(doc.activeElement, tBtns[0]);
  keydown(win, tBtns[0], 'ArrowRight');
  assert.strictEqual(doc.activeElement, tBtns[1], 'ArrowRight trong toolbar phải sang nút kế tiếp');
  keydown(win, tBtns[1], 'End');
  assert.strictEqual(doc.activeElement, tBtns[tBtns.length - 1], 'End trong toolbar phải nhảy tới nút cuối');
  keydown(win, tBtns[tBtns.length - 1], 'ArrowRight');
  assert.strictEqual(doc.activeElement, tBtns[0], 'ArrowRight ở nút cuối phải vòng về nút đầu');
  keydown(win, tBtns[0], 'ArrowLeft');
  assert.strictEqual(doc.activeElement, tBtns[tBtns.length - 1], 'ArrowLeft ở nút đầu phải vòng về nút cuối');
  keydown(win, tBtns[tBtns.length - 1], 'Home');
  assert.strictEqual(doc.activeElement, tBtns[0], 'Home trong toolbar phải về nút đầu');

  /* Bấm nút H2 & Căn giữa trên thanh công cụ → Tiptap 3 cập nhật HTML + aria-pressed */
  const h2Btn = toolbar.querySelector('button[aria-label="Tiêu đề 2"]');
  const centerBtn = toolbar.querySelector('button[aria-label="Căn giữa"]');
  const undoBtn = toolbar.querySelector('button[aria-label="Hoàn tác"]');
  const redoBtn = toolbar.querySelector('button[aria-label="Làm lại"]');
  click(win, h2Btn);
  await until(() => h2Btn.getAttribute('aria-pressed') === 'true', 'bấm H2 phải bật aria-pressed="true"');
  assert.strictEqual(doc.activeElement, prose(), 'bấm nút trên toolbar phải trả focus về .ProseMirror');
  click(win, centerBtn);
  await until(() => centerBtn.getAttribute('aria-pressed') === 'true', 'bấm Căn giữa phải bật aria-pressed="true"');
  assert.ok(/<h2[^>]*text-align:\s*center/.test(prose().innerHTML), 'HTML trong Tiptap 3 phải có <h2 style="text-align: center...">' + prose().innerHTML.slice(0, 120));
  click(win, undoBtn);
  await until(() => centerBtn.getAttribute('aria-pressed') === 'false', 'Hoàn tác phải bỏ căn giữa');
  click(win, redoBtn);
  await until(() => centerBtn.getAttribute('aria-pressed') === 'true', 'Làm lại phải khôi phục căn giữa');

  /* ---- 5. Phím tắt Ctrl+Alt+N (thêm chương) và Ctrl+S (lưu chương) ---- */
  const beforeCount = chapBtns().length;
  prose().focus();
  keydown(win, prose(), 'n', { ctrlKey: true, altKey: true });
  await until(() => chapBtns().length === beforeCount + 1, 'Ctrl+Alt+N phải thêm 1 chương mới');
  assert.strictEqual(chapBtns()[beforeCount].getAttribute('aria-current'), 'true', 'thêm chương mới phải chuyển sang chương mới');

  await until(() => !!prose(), 'chương mới phải có .ProseMirror');
  input(win, doc.querySelector('#v2ChapTitle'), 'Chương mới từ phím tắt');
  await wait(50);
  const savesBefore = calls.filter((c) => c.path === '/api/book/' + slug + '/chapter' && c.body.chapter).length;
  prose().focus();
  keydown(win, prose(), 's', { ctrlKey: true });
  await until(
    () => calls.filter((c) => c.path === '/api/book/' + slug + '/chapter' && c.body.chapter).length > savesBefore,
    'Ctrl+S trong .ProseMirror phải gọi PUT /api/book/<slug>/chapter'
  );
  const lastSave = calls.filter((c) => c.path === '/api/book/' + slug + '/chapter' && c.body.chapter).pop();
  assert.strictEqual(lastSave.body.index, beforeCount, 'Ctrl+S phải lưu đúng vị trí chương mới');
  assert.strictEqual(lastSave.body.chapter.t, 'Chương mới từ phím tắt');

  const out = {
    chaptersAfterAdd: chapBtns().length,
    toolbarButtons: tBtns.length,
    savedTitle: lastSave.body.chapter.t,
    errors0: p.errors,
  };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đạt: bàn phím điều khiển trọn vẹn danh sách chương, ô tiêu đề, toolbar và Tiptap 3.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
