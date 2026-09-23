/* ============================================================================
   t_admin_chapter.js · BA B LỖI NGƯỜI DÙNG BÁO Ở KHUNG SỬA CHƯƠNG
   ----------------------------------------------------------------------------
   1. “Hẹn giờ đăng chương không xài được, không có chỗ set giờ” → chọn trạng thái
      Hẹn giờ phải hiện ô ngày/giờ; bấm +1 ngày điền sẵn; Lưu chương gửi kèm `at`
   2. “Đang gõ dở mà chuyển chương là mất chữ” → nháp localStorage phải có NGAY
      (khi đổi chương) chứ không đợi hết 0,7 giây, và quay lại chương cũ phải
      thấy lại đúng chữ vừa gõ
   3. “Bấm Lưu chương phản hồi lâu” → chỉ PUT 1 chương (/api/book/<slug>/chapter),
      KHÔNG gửi lại cả bộ
   Chạy:  node tests/t_admin_chapter.js
   ========================================================================== */
const assert = require('assert');
const { page, read, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
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
function change(win, el, value) {
  assert.ok(el, 'không thấy ô chọn');
  el.value = value;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}
function click(win, el) {
  assert.ok(el, 'không thấy nút cần bấm');
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}
const TEXT = /tự khôi phục/i;

(async () => {
  const registry = JSON.parse(read('data/registry.json'));
  const slug = 'third-person';
  const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', slug + '.json'), 'utf8'));
  const calls = [];
  const apiFetch = (url, opt = {}) => {
    const method = opt.method || 'GET';
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    calls.push({ method, path: u.pathname, body: bodyOf(opt) });
    if (u.origin !== 'https://cms.test') return response({ ok: false, error: 'unexpected origin' }, false, 404);
    if (u.pathname === '/api/health') return response({ ok: true, adminConfigured: true, kv: true });
    if (u.pathname === '/api/whoami') return response({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/registry') return response(registry);
    if (u.pathname === '/api/admin/kv') return response({ ok: true, groups: [], writesToday: 2, lastReset: '2026-09-22' });
    if (u.pathname === '/api/admin/reports') return response({ ok: true, count: 0, items: [] });
    if (u.pathname === '/api/admin/comments') return response({ ok: true, count: 0, comments: [] });
    if (u.pathname === '/api/book/' + slug + '/chapter') {
      const index = Number(bodyOf(opt).index) || 0;
      const at = bodyOf(opt).chapter && bodyOf(opt).chapter.at;
      return response({
        ok: true, slug, index, action: index >= (book.chapters || []).length ? 'append' : 'update',
        chapters: (book.chapters || []).length, live: 22, pending: at ? 1 : 0,
        schedNext: at || '', schedLabel: at ? 'Hẹn' : '', bytes: 1024, saved: '2026-09-23T10:00:00Z',
        registry: { changed: true, labelNow: '22/' + ((book.chapters || []).length || 23) },
      });
    }
    if (u.pathname === '/api/book/' + slug) return response(book);
    return response({ ok: false, error: 'missing mock ' + method + ' ' + u.pathname }, false, 404);
  };

  const p = page('admin.html', {
    fetch: apiFetch,
    url: 'https://ssochuz.pages.dev/admin.html',
    config: { CZ_API: 'https://cms.test' },
    setup(w) {
      w.FileReader = class {
        readAsText() {
          this.result = 'Chương 99: Nháp từ file\nĐoạn văn vừa nhập để thử mất chữ.';
          setTimeout(() => this.onload && this.onload({ target: this }), 0);
        }
        readAsDataURL() {
          this.result = 'data:image/png;base64,QUJD';
          setTimeout(() => this.onload && this.onload({ target: this }), 0);
        }
      };
      w.confirm = () => true;
      w.prompt = () => '';
    },
  });
  const { doc, win } = p;
  await wait(500);
  input(win, doc.querySelector('#v2Api'), 'https://cms.test');
  input(win, doc.querySelector('#v2Key'), 'test-key');
  await wait(100);
  doc.querySelector('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1200);
  assert.ok(!doc.querySelector('.v2gate'), 'chưa nối được Worker giả');

  click(win, doc.querySelector('button[data-tab="list"]'));
  await wait(150);
  const row = [...doc.querySelectorAll('.v2book-table tbody tr')].find((tr) => tr.textContent.includes(slug));
  assert.ok(row, 'không thấy dòng bộ ' + slug);
  click(win, row.querySelector('.v2actions button'));
  await wait(1200);

  const list = [...doc.querySelectorAll('#pane-edit .v2chapter-list button')];
  assert.ok(list.length >= 2, 'khung sửa chương chưa render danh sách (' + list.length + ')');
  const titleInput = doc.querySelector('#pane-edit .v2chapter-editor input.inp');
  const statusSel = doc.querySelector('#pane-edit .v2chapter-editor select.inp');
  assert.ok(titleInput && statusSel, 'thiếu ô tên chương / ô trạng thái chương');

  /* ---- 1. Nhập nội dung rồi ĐỔI CHƯƠNG NGAY (chưa hết 0,7s) → không mất chữ --- */
  const txtInput = [...doc.querySelectorAll('#pane-edit input[type="file"]')].find((el) => /\.html/.test(el.accept || ''));
  assert.ok(txtInput, 'thiếu ô Import .txt/.html');
  const file = new win.File(['x'], 'chuong.txt', { type: 'text/plain' });
  Object.defineProperty(txtInput, 'files', { configurable: true, value: [file] });
  txtInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  await wait(400);
  input(win, titleInput, 'Chương 1 — bản đang gõ dở');
  const draftKey = 'ssochuz_admin_v2_chdraft:' + slug + ':0';
  /* bấm sang chương khác rồi quay lại NGAY, trước khi debounce 0,7s kịp chạy */
  click(win, list[1]);
  await wait(120);
  const back = [...doc.querySelectorAll('#pane-edit .v2chapter-list button')][0];
  click(win, back);
  await wait(200);
  const titleBack = doc.querySelector('#pane-edit .v2chapter-editor input.inp');
  assert.strictEqual(titleBack.value, 'Chương 1 — bản đang gõ dở', 'đổi chương xong quay lại bị mất tên đang gõ');
  const prose = doc.querySelector('#pane-edit .ProseMirror');
  assert.ok(prose && /Nháp từ file/.test(prose.textContent || ''), 'nội dung vừa nhập bị mất khi đổi chương');
  const savedDraft = JSON.parse(win.localStorage.getItem(draftKey) || 'null');
  assert.ok(savedDraft && /Nháp từ file/.test(savedDraft.html || ''), 'không thấy nháp trong localStorage: ' + win.localStorage.getItem(draftKey));
  assert.ok(TEXT.test((doc.querySelector('#pane-edit .msgbar.show.info') || {}).textContent || ''), 'không hiện dải “đã tự khôi phục bản nháp”');

  /* ---- 2. Hẹn giờ: có ô ngày/giờ, có nút đặt nhanh, lưu kèm `at` ------------ */
  change(win, statusSel, 'scheduled');
  await wait(150);
  const dt = doc.querySelector('#pane-edit .v2chapter-editor input[type="datetime-local"]');
  assert.ok(dt, 'chọn Hẹn giờ mà KHÔNG có ô ngày/giờ');
  const plusDay = [...doc.querySelectorAll('#pane-edit .v2sched button')].find((b) => /\+1 ngày/.test(b.textContent));
  click(win, plusDay);
  await wait(80);
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt.value), 'nút +1 ngày không điền mốc giờ: ' + dt.value);
  const wantMs = Date.parse(dt.value);
  assert.ok(wantMs > Date.now(), 'mốc hẹn giờ không ở tương lai');

  click(win, [...doc.querySelectorAll('#pane-edit button')].find((b) => /^Lưu chương$/.test(b.textContent.trim())));
  await wait(600);
  const saveCall = calls.find((c) => c.path === '/api/book/' + slug + '/chapter');
  assert.ok(saveCall && saveCall.method === 'PUT', 'Lưu chương không gọi PUT /api/book/<slug>/chapter');
  assert.strictEqual(saveCall.body.index, 0, 'gửi sai vị trí chương');
  assert.strictEqual(saveCall.body.chapter.status, 'scheduled', 'không gửi trạng thái hẹn giờ');
  assert.ok(Date.parse(saveCall.body.chapter.at) > Date.now() - 60000, 'mốc hẹn giờ gửi lên không hợp lệ: ' + saveCall.body.chapter.at);
  assert.ok(/Nháp từ file/.test(saveCall.body.chapter.html || ''), 'nội dung gửi lên thiếu chữ vừa nhập');
  /* đường nhanh: KHÔNG gửi lại cả bộ, và không tự ghi lại registry từ admin */
  assert.ok(!calls.some((c) => c.path === '/api/book/' + slug && c.method === 'PUT'), 'vẫn gửi lại NGUYÊN bộ khi lưu 1 chương');
  assert.ok(!calls.some((c) => c.path === '/api/registry' && c.method === 'PUT'), 'vẫn ghi lại registry khi lưu 1 chương');
  assert.ok(!JSON.stringify(saveCall.body).includes('"chapters"'), 'body lưu chương vẫn kèm cả bộ chương');
  assert.strictEqual(win.localStorage.getItem(draftKey), null, 'lưu xong mà nháp cục bộ chưa được xoá');

  const out = { savedStatus: saveCall.body.chapter.status, draftFlushed: !!savedDraft, errors: p.errors };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đen: khung sửa chương giữ nháp khi đổi chương, có ô hẹn giờ và chỉ gửi 1 chương khi lưu.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
