/* Admin v2 online-mode smoke: nối Worker giả bằng ADMIN_KEY và đọc các module KV. */
const assert = require('assert');
const { page, read } = require('./mk');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function json(body, ok = true, status = 200) {
  return Promise.resolve({
    ok, status,
    headers: { get: (name) => /content-type/i.test(name) ? 'application/json' : '' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

(async () => {
  const registry = JSON.parse(read('data/registry.json'));
  const calls = [];
  const apiFetch = (url, opt = {}) => {
    const method = opt.method || 'GET';
    calls.push(method + ' ' + url);
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    if (u.origin !== 'https://cms.test') return json({ ok: false, error: 'unexpected url ' + url }, false, 404);
    if (u.pathname === '/api/health') return json({ ok: true, adminConfigured: true, kv: true, version: 'test' });
    if (u.pathname === '/api/whoami') return json({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/registry') return json(registry);
    if (u.pathname === '/api/admin/kv') return json({ ok: true, keys: 12, bytes: 3456, groups: [{ prefix: 'book', keys: 3, bytes: 1234, unknownBytes: 0 }], writesToday: 7, lastReset: '2026-09-22' });
    if (u.pathname === '/api/admin/comments') return json({ ok: true, count: 1, slugs: 1, comments: [{ id: 'c1', slug: 'third-person', name: 'Bạn đọc', text: 'Một bình luận test', createdAt: '2026-09-22T01:00:00Z' }] });
    if (u.pathname === '/api/admin/reports') return json({ ok: true, count: 1, mail: false, items: [{ at: '2026-09-22T02:00:00Z', kind: 'Báo lỗi chữ', slug: 'third-person', title: 'Third Person', ch: 1, text: 'Sai chính tả test', url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-1/', image: '/api/img/report-test' }] });
    if (u.pathname === '/api/admin/stats') return json({ ok: true, items: { 'third-person': { views: 12, votes: 3, voters: 2, viewsToday: 1, votesToday: 1 } }, days: [{ day: '2026-09-22', views: 12, votes: 3 }] });
    if (u.pathname === '/api/admin/voters') return json({ ok: true, slug: u.searchParams.get('slug'), total: 3, counted: 3, base: 0, voters: 1, book: { count: 1, voters: [{ key: 'a:test', kindLabel: 'Thiết bị', id: 'test', at: '2026-09-22T03:00:00Z' }] }, chapters: {}, chapVotes: {} });
    if (u.pathname === '/api/admin/log') return json({ ok: true, count: 1, items: [{ at: '2026-09-22T04:00:00Z', text: 'log test', who: 'admin-key' }] });
    return json({ ok: false, error: 'missing mock ' + u.pathname }, false, 404);
  };

  const p = page('admin-v2.html', { fetch: apiFetch, url: 'https://ssochuz.pages.dev/admin-v2.html', config: { CZ_API: 'https://cms.test' } });
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
  await wait(400);
  input('#v2Api', 'https://cms.test');
  input('#v2Key', 'test-key');
  await wait(100);
  doc.querySelector('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1200);
  assert.ok(!doc.querySelector('.v2gate'), 'chưa qua auth gate');
  assert.ok(/Cloudflare KV/.test(doc.body.textContent), 'chưa vào mode online');

  click('button[data-tab="cmts"]');
  await wait(250);
  assert.ok(/Một bình luận test/.test(doc.querySelector('#pane-cmts').textContent), 'chưa render bình luận online');
  click('button[data-tab="reports"]');
  await wait(250);
  assert.ok(/Sai chính tả test/.test(doc.querySelector('#pane-reports').textContent), 'chưa render báo lỗi online');
  assert.ok([...doc.querySelectorAll('#pane-reports a')].some((a) => a.href === 'https://cms.test/api/img/report-test'), 'ảnh báo lỗi /api/img chưa đổi sang Worker URL');
  click('button[data-tab="stats"]');
  await wait(250);
  assert.ok(/12/.test(doc.querySelector('#pane-stats').textContent), 'chưa render stats online');
  click('button[data-tab="votes"]');
  await wait(250);
  click([...doc.querySelectorAll('#pane-votes button')].find((el) => /Xem|Đọc phiếu/.test(el.textContent)));
  await wait(250);
  assert.ok(/Thiết bị/.test(doc.querySelector('#pane-votes').textContent), 'chưa render voters online');
  click('button[data-tab="log"]');
  await wait(250);
  assert.ok(/log test/.test(doc.querySelector('#pane-log').textContent), 'chưa render log online');

  const out = { calls: calls.filter((x) => x.includes('/api/admin')).length, errors: p.errors };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đen: admin v2 online-mode đọc được các module KV giả.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
