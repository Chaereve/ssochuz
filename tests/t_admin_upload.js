/* Admin v2 upload smoke: nén ảnh phía client (có HẠN MỨC dung lượng) rồi POST
   /api/img kèm ID theo nội dung (Worker thấy ID cũ thì không ghi thêm bản sao),
   sau đó tự điền URL bìa. Supabase free chỉ 500 MB database nên hạn mức nén là
   thứ phải giữ bằng kiểm thử, không chỉ bằng lời hứa trong ghi chú. */
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

  const p = page('admin.html', {
    fetch: apiFetch,
    url: 'https://ssochuz.pages.dev/admin.html',
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
      /* Ảnh giả “nặng” đúng theo chất lượng: 190 KB ở q=0.82 — hạ tới q=0.5 thì
         còn ~116 KB, vừa hạn mức bìa 120 KB. Nếu mã nén ngừng hạ chất lượng,
         phép kiểm bên dưới sẽ bắt được ngay (ảnh gửi lên vượt hạn mức). */
      w.HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
        const q = Math.min(0.92, Number(quality) || 0.82);
        const want = Math.round(190 * 1024 * (q / 0.82));
        return 'data:' + (type || 'image/webp') + ';base64,QUJD' + 'A'.repeat(Math.max(0, Math.ceil((want - 6) / 3) * 4));
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
  /* 1) ID = băm NỘI DUNG: dán lại cùng ảnh thì Worker trả URL cũ, khỏi tốn chỗ */
  assert.ok(/^h[0-9a-f]{32}$/.test(imgCall.body.id || ''), 'không gửi ID nội dung ảnh: ' + imgCall.body.id);
  /* 2) hạn mức dung lượng bìa 120 KB phải được tôn trọng (nén hạ chất lượng dần) */
  const sentBytes = Math.floor(String(imgCall.body.data).replace(/=+$/, '').length * 3 / 4);
  assert.ok(sentBytes <= 120 * 1024 + 8, 'ảnh bìa gửi lên vượt hạn mức 120 KB: ' + Math.round(sentBytes / 1024) + ' KB');
  const filled = [...doc.querySelectorAll('#pane-new input.inp')].some((el) => el.value === 'https://cms.test/api/img/mock-img-123');
  assert.ok(filled, 'URL ảnh chưa tự điền vào ô bìa');
  /* 3) hàm băm + hạn mức dùng chung: ổn định, đúng định dạng, không phình */
  const images = await import('../src/admin/utils/images.js');
  const idA = await images.contentId('QUJDREVG');
  const idB = await images.contentId('QUJDREVG');
  assert.strictEqual(idA, idB, 'contentId không ổn định');
  assert.ok(/^h[0-9a-f]{32}$/.test(idA), 'contentId sai định dạng: ' + idA);
  assert.ok(images.IMAGE_BUDGET.cover.maxBytes <= 160 * 1024, 'hạn mức bìa quá rộng');
  assert.ok(images.IMAGE_BUDGET.chapter.maxBytes <= 320 * 1024, 'hạn mức ảnh chương quá rộng');
  assert.strictEqual(images.formatBytes(2048), '2 KB');

  const out = { imagePost: imgCall.body.type, filled, idHash: /^h[0-9a-f]{32}$/.test(imgCall.body.id || ''), sentKB: Math.round(sentBytes / 1024), errors: p.errors };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đen: admin v2 upload ảnh bìa đi qua /api/img và điền URL.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
