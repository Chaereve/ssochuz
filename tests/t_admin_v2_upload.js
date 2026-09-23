/* Admin v2 upload smoke: nén ảnh phía client rồi POST /api/img, tự điền URL bìa. */
const assert = require('assert');
const { page, read } = require('./mk');
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
  assert.ok(el, 'missing input');
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function click(win, el) {
  assert.ok(el, 'missing click target');
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}

(async () => {
  const registry = JSON.parse(read('data/registry.json'));
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
    if (u.pathname === '/api/img') return response({ ok: true, id: 'mock-img-123', url: '/api/img/mock-img-123', bytes: 16 });
    return response({ ok: false, error: 'missing mock ' + u.pathname }, false, 404);
  };

  const p = page('admin-v2.html', {
    fetch: apiFetch,
    url: 'https://ssochuz.pages.dev/admin-v2.html',
    config: { CZ_API: 'https://cms.test' },
    setup(w) {
      w.FileReader = class {
        readAsDataURL() {
          this.result = 'data:image/png;base64,QUJDREVGR0hJSktMTU5PUA==';
          setTimeout(() => this.onload && this.onload({ target: this }), 0);
        }
      };
      w.Image = class {
        constructor() { this.naturalWidth = 640; this.naturalHeight = 360; }
        set src(value) { this._src = value; setTimeout(() => this.onload && this.onload(), 0); }
        get src() { return this._src; }
      };
      w.HTMLCanvasElement.prototype.getContext = function () {
        return { fillStyle: '', fillRect() {}, drawImage() {} };
      };
      w.HTMLCanvasElement.prototype.toDataURL = function (type) {
        return 'data:' + (type || 'image/webp') + ';base64,QUJDREVGR0hJSktMTU5PUA==';
      };
    },
  });
  const { doc, win } = p;
  await wait(500);
  input(win, doc.querySelector('#v2Api'), 'https://cms.test');
  input(win, doc.querySelector('#v2Key'), 'test-key');
  await wait(100);
  doc.querySelector('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1200);
  assert.ok(!doc.querySelector('.v2gate'), 'chưa nối online');

  click(win, doc.querySelector('button[data-tab="new"]'));
  await wait(150);
  const fileInput = doc.querySelector('#pane-new input[type="file"]');
  const file = new win.File(['fake image bytes'], 'cover.png', { type: 'image/png' });
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
  fileInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  await wait(800);
  const imgCall = calls.find((c) => c.path === '/api/img');
  assert.ok(imgCall && imgCall.method === 'POST', 'chưa POST /api/img');
  assert.strictEqual(imgCall.body.type, 'image/webp');
  assert.strictEqual(imgCall.body.kind, 'cover');
  assert.ok(/QUJD/.test(imgCall.body.data), 'body ảnh không phải base64 đã nén');
  const filled = [...doc.querySelectorAll('#pane-new input.inp')].some((el) => el.value === 'https://cms.test/api/img/mock-img-123');
  assert.ok(filled, 'URL ảnh chưa tự điền vào ô bìa');
  const out = { imagePost: imgCall.body.type, filled, errors: p.errors };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đen: admin v2 upload ảnh bìa đi qua /api/img và điền URL.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
