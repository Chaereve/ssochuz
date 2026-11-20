/* ============================================================================
   t_admin_updated_guard.js · ĐĂNG CHƯƠNG XONG, NGÀY CẬP NHẬT KHÔNG ĐƯỢC LÙI
   ----------------------------------------------------------------------------
   Lỗi người dùng báo (20/11): đăng chương hôm qua, mở web vẫn thấy ngày cũ.

   Nguyên nhân còn sót sau khi sửa Worker: khu quản trị giữ registry trong BỘ
   NHỚ (ảnh chụp lúc mở trang). Worker đã bump `updated` khi chương lên sóng,
   nhưng thao tác ghi registry kế tiếp (Lưu trang chủ / đổi mốc lịch / lưu cả
   bộ…) lại PUT nguyên bản trong RAM ⇒ đẩy NGÀY CŨ trở lại KV.

   Ca kiểm này dựng đúng tình huống đó:
     · KV (nguồn sự thật) có `third-person`.updated = hôm nay
     · registry admin đang giữ trong RAM = 2026-01-15
     · bấm một thao tác ghi registry (Lưu trang chủ)
     · đọc body PUT /api/registry:
         – phải gửi `updated` MỚI (không phải 2026-01-15)
         – ngày không được lùi cho BẤT KỲ bộ nào
         – `countLabel` admin vừa sửa tay vẫn được giữ (không bị KV đè)
   Chạy: node tests/t_admin_updated_guard.js
   ========================================================================== */
const assert = require('assert');
const { page, read } = require('./mk');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function response(body, ok = true, status = 200) {
  return Promise.resolve({
    ok, status,
    headers: { get: (name) => (/content-type/i.test(name) ? 'application/json' : '') },
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
function todayVN(ms) {
  return new Date((ms || Date.now()) + 7 * 3600000).toISOString().slice(0, 10);
}

(async () => {
  const TODAY = todayVN();
  /* Registry trong KV = nguồn sự thật, đã được Worker bump ngày hôm nay */
  const registryKv = JSON.parse(read('data/registry.json'));
  const targetSlug = 'third-person';
  const metaKv = registryKv.lib.find((b) => b.slug === targetSlug);
  assert.ok(metaKv, 'registry mẫu thiếu ' + targetSlug);
  metaKv.updated = TODAY;

  /* Registry admin đang giữ trong RAM: ngày CŨ, nhãn chương chủ trang vừa sửa */
  const registryRam = JSON.parse(JSON.stringify(registryKv));
  const metaRam = registryRam.lib.find((b) => b.slug === targetSlug);
  metaRam.updated = '2026-01-15';
  metaRam.countLabel = '40/40';

  const puts = [];
  let serveRam = true;                 /* sau khi admin đã nạp, KV vẫn là bản mới */
  const apiFetch = (url, opt = {}) => {
    const method = opt.method || 'GET';
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    if (u.origin !== 'https://cms.test') return response({ ok: false, error: 'unexpected origin' }, false, 404);
    if (u.pathname === '/api/health') return response({ ok: true, adminConfigured: true, kv: true });
    if (u.pathname === '/api/whoami') return response({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/admin/kv') return response({ ok: true, groups: [], writesToday: 1, lastReset: TODAY });
    if (u.pathname === '/api/admin/reports') return response({ ok: true, count: 0, items: [] });
    if (u.pathname === '/api/admin/comments') return response({ ok: true, count: 0, comments: [] });
    if (u.pathname === '/api/admin/stats') return response({ ok: true, items: {}, days: [] });
    if (u.pathname === '/api/registry') {
      if (method === 'PUT') { puts.push(bodyOf(opt)); return response({ ok: true, key: 'registry' }); }
      return response(JSON.parse(JSON.stringify(serveRam ? registryRam : registryKv)));
    }
    return response({ ok: false, error: 'missing mock ' + method + ' ' + u.pathname }, false, 404);
  };

  const p = page('admin.html', { fetch: apiFetch, url: 'https://ssochuz.pages.dev/admin.html', config: { CZ_API: 'https://cms.test' } });
  const { doc, win } = p;
  await wait(400);
  win.CZ.confirm = () => Promise.resolve(true);
  win.prompt = () => 'LUU';
  input(win, doc.querySelector('#v2Api'), 'https://cms.test');
  input(win, doc.querySelector('#v2Key'), 'test-key');
  await wait(100);
  doc.querySelector('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1200);
  assert.ok(!doc.querySelector('.v2gate'), 'chưa nối được online');

  /* từ giờ KV trả bản MỚI (Worker đã bump) — RAM thì vẫn là bản cũ */
  serveRam = false;

  /* thao tác ghi registry đơn giản nhất: Lưu trang chủ ở tab Trang chủ */
  click(win, doc.querySelector('button[data-tab="homepage"]'));
  await wait(400);
  const saveBtn = [...doc.querySelectorAll('button')].find((b) => /Lưu trang chủ/.test(b.textContent));
  assert.ok(saveBtn, 'không thấy nút Lưu trang chủ');
  saveBtn.disabled = false;
  click(win, saveBtn);
  for (let i = 0; i < 100 && !puts.length; i++) await wait(50);
  assert.ok(puts.length > 0, 'bấm Lưu trang chủ mà không PUT /api/registry');

  const sent = puts[puts.length - 1];
  const sentMeta = (sent.lib || []).find((b) => b.slug === targetSlug);
  assert.ok(sentMeta, 'body PUT thiếu ' + targetSlug);
  assert.strictEqual(sentMeta.updated, TODAY, 'PUT đẩy NGÀY CŨ trở lại KV (' + sentMeta.updated + ' thay vì ' + TODAY + ')');

  /* ngày chỉ tiến: không bộ nào lùi so với KV */
  const kvDay = new Map(registryKv.lib.map((b) => [b.slug, String(b.updated || '').slice(0, 10)]));
  (sent.lib || []).forEach((b) => {
    const want = kvDay.get(b.slug);
    if (!want) return;
    assert.ok(String(b.updated || '').slice(0, 10) >= want, 'bộ ' + b.slug + ' bị lùi ngày: ' + b.updated + ' < ' + want);
  });

  /* sửa tay của chủ trang không bị KV đè */
  assert.strictEqual(sentMeta.countLabel, '40/40', 'nhãn chương admin vừa sửa bị ghi đè từ KV');

  assert.deepStrictEqual(p.errors, []);
  console.log(JSON.stringify({ slug: targetSlug, ramDay: '2026-01-15', sentDay: sentMeta.updated, puts: puts.length, errors: p.errors }, null, 1));
  console.log('Đen: ghi registry từ admin không kéo lùi ngày cập nhật mà Worker vừa bump.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
