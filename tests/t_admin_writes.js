/* Admin v2 online write smoke: các thao tác ghi nhạy cảm vẫn đi đúng endpoint + confirm mạnh. */
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
function bodyOf(opt) {
  try { return opt && opt.body ? JSON.parse(opt.body) : {}; } catch (e) { return {}; }
}
function click(win, el) {
  assert.ok(el, 'missing clickable element');
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}
function input(win, el, value) {
  assert.ok(el, 'missing input element');
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}

(async () => {
  const registry = JSON.parse(read('data/registry.json'));
  const targetSlug = 'third-person';
  const firstBook = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', targetSlug + '.json'), 'utf8'));
  let voters = [{ key: 'a:test-device', kindLabel: 'Thiết bị', id: 'test-device', at: '2026-09-22T03:00:00Z' }];
  const calls = [];
  const apiFetch = (url, opt = {}) => {
    const method = opt.method || 'GET';
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    calls.push({ method, path: u.pathname, search: u.search, body: bodyOf(opt), mode: opt.headers && (opt.headers['x-import-mode'] || opt.headers['X-Import-Mode']) });
    if (u.origin !== 'https://cms.test') return response({ ok: false, error: 'unexpected origin ' + u.origin }, false, 404);
    if (u.pathname === '/api/health') return response({ ok: true, adminConfigured: true, kv: true, version: 'test' });
    if (u.pathname === '/api/whoami') return response({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/registry') {
      if (method === 'PUT') return response({ ok: true, key: 'registry' });
      return response(registry);
    }
    if (u.pathname === '/api/admin/kv') return response({ ok: true, keys: 10, bytes: 1000, groups: [], writesToday: 3, lastReset: '2026-09-22' });
    if (u.pathname === '/api/admin/reports') return response({ ok: true, count: 0, items: [] });
    if (u.pathname === '/api/admin/comments') return response({ ok: true, count: 1, slugs: 1, comments: [{ id: 'c1', slug: targetSlug, name: 'Bạn đọc', text: 'Bình luận cần xoá', createdAt: '2026-09-22T01:00:00Z' }] });
    if (u.pathname === '/api/admin/stats') return response({ ok: true, items: {}, days: [] });
    if (u.pathname === '/api/admin/log') return response({ ok: true, items: [] });
    if (u.pathname === '/api/book/' + encodeURIComponent(targetSlug)) {
      if (method === 'PUT') return response({ ok: true, key: 'book:' + targetSlug });
      return response(firstBook);
    }
    if (u.pathname === '/api/lock/set') {
      const b = bodyOf(opt);
      const meta = registry.lib.find((item) => item.slug === b.slug);
      if (meta) { if (b.password) meta.lock = 1; else delete meta.lock; }
      return response({ ok: true, slug: b.slug, locked: !!b.password });
    }
    if (u.pathname === '/api/comments/' + encodeURIComponent(targetSlug) + '/c1' && method === 'DELETE') return response({ ok: true, deleted: 'c1', deletedCount: 1 });
    if (u.pathname === '/api/admin/voters') return response({ ok: true, slug: u.searchParams.get('slug'), total: voters.length, counted: voters.length, base: 0, voters: voters.length, book: { count: voters.length, voters }, chapters: {}, chapVotes: {} });
    if (u.pathname === '/api/admin/vote-remove') {
      const n = voters.length;
      voters = [];
      return response({ ok: true, removed: n, total: 0, chapVotes: {} });
    }
    if (u.pathname === '/api/admin/votes/reset') return response({ ok: true, stories: 1, cleared: 5 });
    if (u.pathname === '/api/stats/refresh') return response({ ok: true, cleared: 'stats_cache', flushed: { writes: 1 } });
    if (u.pathname === '/api/import') return response({ ok: true, added: 'Chương test', chapters: 14, url: 'https://chuseoz.blogspot.com/test', title: 'Chương test' });
    if (u.pathname === '/api/sync') return response({ ok: true, cards: 63, changed: 2, rev: '2026-09-22 10:00', recount: [] });
    if (u.pathname === '/api/recount') return response({ ok: true, books: 46, novels: 63, fixed: [], missing: [], orphan: [] });
    return response({ ok: false, error: 'missing mock ' + method + ' ' + u.pathname }, false, 404);
  };

  const p = page('admin.html', { fetch: apiFetch, url: 'https://ssochuz.pages.dev/admin.html', config: { CZ_API: 'https://cms.test' } });
  const { doc, win } = p;
  await wait(500);
  win.CZ.confirm = () => Promise.resolve(true);
  win.prompt = (message) => {
    const s = String(message || '');
    if (/GỠ PHIẾU/.test(s)) return 'GỠ PHIẾU';
    if (/RESET/.test(s)) return 'RESET';
    if (/ĐẾM LẠI/.test(s)) return 'ĐẾM LẠI';
    if (/ĐỒNG BỘ/.test(s)) return 'ĐỒNG BỘ';
    if (/XOÁ/.test(s)) return 'XOÁ';
    return targetSlug;
  };
  input(win, doc.querySelector('#v2Api'), 'https://cms.test');
  input(win, doc.querySelector('#v2Key'), 'test-key');
  await wait(100);
  doc.querySelector('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1200);
  assert.ok(!doc.querySelector('.v2gate'), 'chưa nối online');

  click(win, doc.querySelector('button[data-tab="list"]'));
  await wait(150);
  /* mở ĐÚNG bộ third-person (danh sách sắp theo ngày cập nhật nên dòng đầu
     có thể là bộ khác — trước đây bài test cứ bấm dòng đầu rồi so slug) */
  const targetRow = [...doc.querySelectorAll('.v2book-table tbody tr')]
    .find((tr) => tr.textContent.includes(targetSlug));
  assert.ok(targetRow, 'không thấy dòng ' + targetSlug + ' ở trang 1');
  click(win, targetRow.querySelector('.v2actions button'));
  await wait(1200);
  const pwInputs = [...doc.querySelectorAll('#pane-edit input[type="password"]')];
  input(win, pwInputs[0], 'matma-test-123');
  input(win, pwInputs[1], 'matma-test-123');
  await wait(100);
  click(win, [...doc.querySelectorAll('#pane-edit button')].find((el) => /Đặt \/ đổi mật mã/.test(el.textContent)));
  await wait(600);
  const lockCall = calls.find((c) => c.path === '/api/lock/set');
  assert.ok(lockCall && lockCall.body.slug === targetSlug && lockCall.body.password === 'matma-test-123', 'không gọi lock/set đúng slug/password');

  click(win, doc.querySelector('button[data-tab="cmts"]'));
  await wait(250);
  click(win, [...doc.querySelectorAll('#pane-cmts button')].find((el) => /^Xoá$/.test(el.textContent.trim())));
  await wait(700);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/api/comments/' + targetSlug + '/c1'), 'không gọi DELETE comment');

  click(win, doc.querySelector('button[data-tab="votes"]'));
  await wait(200);
  click(win, [...doc.querySelectorAll('#pane-votes button')].find((el) => /Xem/.test(el.textContent)));
  await wait(300);
  click(win, doc.querySelector('#pane-votes input[type="checkbox"]'));
  await wait(100);
  click(win, [...doc.querySelectorAll('#pane-votes button')].find((el) => /Gỡ phiếu/.test(el.textContent)));
  await wait(800);
  assert.ok(calls.some((c) => c.path === '/api/admin/vote-remove' && Array.isArray(c.body.keys) && c.body.keys[0] === 'a:test-device'), 'không gọi vote-remove');
  click(win, [...doc.querySelectorAll('#pane-votes button')].find((el) => /Reset phiếu bộ này/.test(el.textContent)));
  await wait(600);
  assert.ok(calls.some((c) => c.path === '/api/admin/votes/reset'), 'không gọi votes/reset');

  click(win, doc.querySelector('button[data-tab="settings"]'));
  await wait(200);
  click(win, [...doc.querySelectorAll('#pane-settings button')].find((el) => /Flush stats cache/.test(el.textContent)));
  await wait(600);
  assert.ok(calls.some((c) => c.path === '/api/stats/refresh'), 'không gọi stats/refresh');
  click(win, [...doc.querySelectorAll('#pane-settings button')].find((el) => /^Nhập chương$/.test(el.textContent.trim())));
  await wait(800);
  assert.ok(calls.some((c) => c.path === '/api/import' && c.body.slug && c.mode === 'append'), 'không gọi import Blogger');
  click(win, [...doc.querySelectorAll('#pane-settings button')].find((el) => /Đồng bộ Blogger/.test(el.textContent)));
  await wait(800);
  assert.ok(calls.some((c) => c.path === '/api/sync'), 'không gọi sync Blogger');
  click(win, [...doc.querySelectorAll('#pane-settings button')].find((el) => /Đếm lại số chương/.test(el.textContent)));
  await wait(800);
  assert.ok(calls.some((c) => c.path === '/api/recount'), 'không gọi recount');

  const out = {
    writes: calls.filter((c) => c.method !== 'GET').map((c) => c.method + ' ' + c.path),
    lockBody: lockCall.body,
    errors: p.errors,
  };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đen: admin v2 gọi đúng các endpoint ghi có xác nhận.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
