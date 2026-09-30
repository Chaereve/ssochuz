/* G3b — lỗi TẢI book không bao giờ được coi là "bộ không có book".

   Trước đây getBook() nuốt mọi lỗi thành null ⇒ 3 thao tác ghi hiểu nhầm một
   lần Worker chập chờn thành "bộ này không có chương":
   - Quét toàn vẹn → dòng "Thiếu book JSON/KV" → bấm Sửa (không hỏi lại) ⇒ PUT
     book RỖNG đè lên bộ đang có chương = MẤT DỮ LIỆU.
   - Đổi slug ⇒ bỏ qua bước chuyển book nhưng vẫn PUT registry slug mới ⇒ chương
     mồ côi dưới book:<slug cũ>, truyện biến khỏi web.
   - Nhân bản ⇒ PUT bản sao rỗng.

   Hợp đồng: tải lỗi (không phải 404) ⇒ KHÔNG ghi gì; quét ghi dòng riêng "lỗi
   tải" không tự sửa; và trước khi tạo book trống phải đọc lại Worker, chỉ ghi
   khi Worker trả đúng 404. Bộ thiếu thật (404) vẫn sửa được như cũ. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

const BROKEN = 'third-person';        /* GET luôn 500: Worker chập chờn */
const APPEARS = 'lunar-secret';       /* GET lần đầu 404, sau đó có (tab khác vừa ghi) */
const MISSING = 'bake-love-feelings'; /* GET luôn 404: thiếu book thật */

(async () => {
  const registry = JSON.parse(read('data/registry.json'));
  const calls = [];
  let appearsSeen = 0;
  const bookFile = (slug) => {
    const f = path.join(__dirname, '..', 'data', 'book', slug + '.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  };
  const apiFetch = (url, opt = {}) => {
    const method = opt.method || 'GET';
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    calls.push(method + ' ' + u.pathname);
    if (u.origin !== 'https://cms.test') return json({ ok: false, error: 'unexpected url ' + url }, false, 404);
    if (method !== 'GET') return json({ ok: true });
    if (u.pathname === '/api/health') return json({ ok: true, adminConfigured: true, kv: true, version: 'test' });
    if (u.pathname === '/api/whoami') return json({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/registry') return json(registry);
    if (u.pathname === '/api/admin/kv') return json({ ok: true, keys: 1, bytes: 1, groups: [], writesToday: 0, lastReset: '2026-09-30' });
    const m = u.pathname.match(/^\/api\/book\/([^/]+)$/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      if (slug === BROKEN) return json({ ok: false, error: 'KV tạm lỗi (test)' }, false, 500);
      if (slug === MISSING) return json({ ok: false, error: 'chưa có dữ liệu cho khoá book:' + slug }, false, 404);
      if (slug === APPEARS && appearsSeen++ === 0) return json({ ok: false, error: 'chưa có dữ liệu cho khoá book:' + slug }, false, 404);
      const b = bookFile(slug);
      return b ? json(b) : json({ ok: false, error: 'chưa có dữ liệu cho khoá book:' + slug }, false, 404);
    }
    return json({ ok: false, error: 'missing mock ' + u.pathname }, false, 404);
  };

  const p = page('admin.html', { fetch: apiFetch, url: 'https://ssochuz.pages.dev/admin.html', config: { CZ_API: 'https://cms.test' } });
  const { doc, win } = p;
  const $ = (sel) => doc.querySelector(sel);
  const $$ = (sel) => [...doc.querySelectorAll(sel)];
  const click = (el, what) => {
    assert.ok(el, 'không thấy ' + what);
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  };
  const inputEv = (el, value, what) => {
    assert.ok(el, 'không thấy ô ' + (what || 'nhập'));
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
  };
  async function until(fn, msg, tries = 80) {
    for (let i = 0; i < tries; i++) { if (fn()) return; await wait(50); }
    assert.fail(typeof msg === 'function' ? msg() : msg);
  }
  const writes = () => calls.filter((c) => !c.startsWith('GET '));
  const bookGets = (slug) => calls.filter((c) => c === 'GET /api/book/' + slug).length;
  async function openBook(slug) {
    const title = registry.lib.find((b) => b.slug === slug).title;
    click($('button[data-tab="list"]'), 'tab Thư viện');
    await wait(150);
    inputEv($('#pane-list .v2toolbar input.inp'), title, 'tìm');
    await wait(150);
    const row = $$('.v2book-table tbody tr').find((r) => r.textContent.indexOf(slug) >= 0);
    click(row && [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sửa'), 'nút Sửa của ' + slug);
  }

  await wait(400);
  inputEv($('#v2Api'), 'https://cms.test');
  inputEv($('#v2Key'), 'test-key');
  await wait(100);
  $('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !$('.v2gate'), 'chưa qua auth gate');
  win.CZ.confirm = () => Promise.resolve(true);

  /* 1) đổi slug khi book đang tải lỗi ⇒ không ghi gì */
  await openBook(BROKEN);
  await until(() => /Không tải được dữ liệu chương/.test($('#pane-edit').textContent), 'bộ lỗi chưa hiện trạng thái lỗi');
  let before = writes().length;
  const slugInput = $$('#pane-edit label.fl').find((l) => /^\s*Slug/.test(l.textContent));
  inputEv(slugInput && slugInput.querySelector('input'), BROKEN + '-moi', 'Slug');
  await wait(100);
  const metaForm = $('#pane-edit form.v2form');
  metaForm.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => bookGets(BROKEN) >= 2, 'đổi slug phải đọc lại book cũ trước khi chuyển');
  await wait(400);
  assert.deepStrictEqual(writes().slice(before), [], 'đổi slug khi book tải lỗi KHÔNG được ghi gì (registry mồ côi chương): ' + JSON.stringify(writes().slice(before)));

  /* 2) nhân bản khi book đang tải lỗi ⇒ không ghi gì */
  win.prompt = () => BROKEN + '-ban-sao';
  before = writes().length;
  const getsBefore = bookGets(BROKEN);
  click($$('#pane-edit button').find((b) => b.textContent.trim() === 'Nhân bản bộ'), 'nút Nhân bản bộ');
  await until(() => bookGets(BROKEN) > getsBefore, 'nhân bản phải đọc book nguồn');
  await wait(400);
  assert.deepStrictEqual(writes().slice(before), [], 'nhân bản khi book tải lỗi KHÔNG được tạo bản sao rỗng: ' + JSON.stringify(writes().slice(before)));

  /* 3) quét toàn vẹn: lỗi tải ≠ thiếu book; bấm Sửa không ghi đè */
  click($('button[data-tab="doctor"]'), 'tab Kiểm tra dữ liệu');
  await wait(150);
  click($$('#pane-doctor button').find((b) => /Quét book/.test(b.textContent)), 'nút Quét book');
  const rowOf = (slug) => $$('#pane-doctor tbody tr').find((r) => r.textContent.indexOf(slug) >= 0 || r.querySelector('a[href*="/' + slug + '/"]'));
  await until(() => rowOf(BROKEN) && rowOf(MISSING), () => 'quét chưa ra dòng cho ' + BROKEN + '/' + MISSING + ': ' + $('#pane-doctor').textContent.slice(0, 400));
  const brokenIssue = rowOf(BROKEN).textContent;
  assert.ok(!/Thiếu book JSON\/KV/.test(brokenIssue), 'lỗi tải bị quét thành "Thiếu book" ⇒ nút Sửa sẽ ghi đè bộ rỗng: ' + brokenIssue);
  assert.ok(/lỗi tải/i.test(brokenIssue), 'dòng quét phải nói rõ là lỗi tải: ' + brokenIssue);
  before = writes().length;
  const brokenFix = [...rowOf(BROKEN).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sửa');
  if (brokenFix) { click(brokenFix, 'Sửa dòng lỗi tải'); await wait(500); }
  assert.ok(!writes().slice(before).some((c) => c === 'PUT /api/book/' + BROKEN), 'Sửa dòng lỗi tải đã PUT book rỗng đè lên ' + BROKEN);

  /* 4) phòng thủ: dòng "Thiếu book" cũ nhưng lúc bấm Sửa book đã có ⇒ không ghi đè */
  assert.ok(rowOf(APPEARS) && /Thiếu book JSON\/KV/.test(rowOf(APPEARS).textContent), 'kịch bản 4 cần ' + APPEARS + ' bị quét là thiếu (404 lần đầu)');
  before = writes().length;
  click([...rowOf(APPEARS).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sửa'), 'Sửa dòng ' + APPEARS);
  await wait(600);
  assert.ok(!writes().slice(before).some((c) => c === 'PUT /api/book/' + APPEARS), 'book đã có lại mà Sửa vẫn PUT book rỗng đè lên ' + APPEARS);

  /* 5) thiếu book thật (404) vẫn sửa được như trước */
  await until(() => rowOf(MISSING), 'mất dòng ' + MISSING + ' sau khi quét lại');
  before = writes().length;
  click([...rowOf(MISSING).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sửa'), 'Sửa dòng ' + MISSING);
  await until(() => writes().slice(before).includes('PUT /api/book/' + MISSING), () => 'bộ thiếu thật phải được tạo book trống như cũ: ' + JSON.stringify(writes().slice(before)));

  const out = { writes: writes(), errors: p.errors };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đạt: lỗi tải book không bị coi là thiếu book ở đổi slug / nhân bản / quét + sửa.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
