/* G3 — khung soạn chương phải TÁCH "tải lỗi" khỏi "bộ chưa có dữ liệu chương".

   Trước đây cả hai cùng hiện một câu "Chưa có dữ liệu chương trong cache." và
   nút "Đọc dữ liệu chương" không làm gì (BookEditor không truyền onLoad) ⇒ biên
   tập viên gặp Worker chập chờn thì tưởng bộ trống, không có cách thử lại trừ F5.

   Hợp đồng kiểm ở đây:
   1. GET /api/book/<slug> lỗi (500) ⇒ hộp role=alert "Không tải được dữ liệu
      chương" + lý do + nút "Thử lại"; bấm "Thử lại" ⇒ gọi lại API và khi thành
      công thì hiện danh sách chương (kết quả lỗi KHÔNG bị cache).
   2. GET /api/book/<slug> trả 404 (Worker: chưa có khoá book:<slug>) ⇒ câu
      "Bộ này chưa có dữ liệu chương", KHÔNG phải thông báo lỗi. */
const assert = require('assert');
const { page, read } = require('./mk');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Trễ như mạng thật (Worker ~100–300 ms): mock trả NGAY thì request đã xong
   trước khi effect kịp chạy — không đo được việc gộp request đang bay. */
const LATENCY = 150;
function json(body, ok = true, status = 200) {
  return wait(LATENCY).then(() => ({
    ok, status,
    headers: { get: (name) => /content-type/i.test(name) ? 'application/json' : '' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }));
}

(async () => {
  const registry = JSON.parse(read('data/registry.json'));
  const goodBook = JSON.parse(read('data/book/third-person.json'));
  const firstTitle = String((goodBook.chapters[0] && goodBook.chapters[0].t) || '').trim();
  assert.ok(firstTitle, 'bộ mẫu third-person phải có chương đầu có tên');
  const calls = [];
  let failLeft = 2;   /* lần mở đầu + lần bấm Sửa lại đều lỗi, lần Thử lại thì được */
  const apiFetch = (url, opt = {}) => {
    const method = opt.method || 'GET';
    calls.push(method + ' ' + url);
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    if (u.origin !== 'https://cms.test') return json({ ok: false, error: 'unexpected url ' + url }, false, 404);
    if (u.pathname === '/api/health') return json({ ok: true, adminConfigured: true, kv: true, version: 'test' });
    if (u.pathname === '/api/whoami') return json({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/registry') return json(registry);
    if (u.pathname === '/api/book/third-person') {
      if (failLeft > 0) { failLeft--; return json({ ok: false, error: 'KV tạm lỗi (test)' }, false, 500); }
      return json(goodBook);
    }
    if (u.pathname === '/api/book/bake-love-feelings') return json(Object.assign({}, goodBook, { slug: 'bake-love-feelings' }));
    if (u.pathname === '/api/book/lunar-secret') return json({ ok: false, error: 'chưa có dữ liệu cho khoá book:lunar-secret' }, false, 404);
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
  const inputEv = (el, value) => {
    assert.ok(el, 'không thấy ô nhập');
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
  };
  const n0 = (slug) => calls.filter((c) => c === 'GET https://cms.test/api/book/' + slug).length;
  async function until(fn, msg, tries = 60) {
    for (let i = 0; i < tries; i++) { if (fn()) return; await wait(50); }
    assert.fail(typeof msg === 'function' ? msg() : msg);
  }
  const chapterCard = () => $$('#pane-edit section.card2').find((s) => /^\s*Chương/.test((s.querySelector('h3') || {}).textContent || ''));
  const cardText = () => ((chapterCard() || {}).textContent || '').replace(/\s+/g, ' ');
  async function openBook(title, slug) {
    click($('button[data-tab="list"]'), 'tab Thư viện');
    await wait(150);
    inputEv($('#pane-list .v2toolbar input.inp'), title);
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

  /* 1) tải lỗi → thông báo lỗi + Thử lại */
  await openBook('Third Person', 'third-person');
  await until(() => /Không tải được dữ liệu chương/.test(cardText()), () => 'API book 500 mà khung soạn chương không báo lỗi: ' + cardText().slice(0, 600) + ' | calls=' + JSON.stringify(calls.filter((c) => c.includes('/api/book/'))));
  let alertBox = chapterCard().querySelector('[role="alert"]');
  assert.ok(alertBox, 'thông báo lỗi tải phải có role="alert" để trình đọc màn hình đọc ngay');
  assert.ok(/KV tạm lỗi \(test\)/.test(alertBox.textContent), 'thông báo lỗi phải kèm lý do từ Worker: ' + alertBox.textContent);
  assert.ok(!/chưa có dữ liệu chương/i.test(cardText()), 'lỗi tải KHÔNG được nói là bộ chưa có dữ liệu');
  /* lời gọi CHỦ ĐỘNG (bấm Sửa lại) phải tải lại dù vừa lỗi — cùng nhánh với
     đổi slug / nhân bản / sao lưu; nếu nhánh này bỏ qua thì nhân bản ra bộ rỗng */
  await wait(300);
  assert.strictEqual(n0('third-person'), 1, 'mở bộ lỗi: đúng 1 GET, effect không được tự gọi lại, thấy ' + n0('third-person'));
  await openBook('Third Person', 'third-person');
  await until(() => n0('third-person') === 2, () => 'bấm Sửa lại sau khi lỗi phải gọi lại GET /api/book (thấy ' + n0('third-person') + ')');
  await until(() => /Không tải được dữ liệu chương/.test(cardText()), () => 'lần lỗi thứ 2 cũng phải hiện thông báo lỗi: ' + cardText().slice(0, 300));
  const bookCallsBefore = calls.filter((c) => c === 'GET https://cms.test/api/book/third-person').length;
  click([...chapterCard().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Thử lại'), 'nút "Thử lại"');
  await until(() => cardText().indexOf(firstTitle) >= 0, () => 'bấm Thử lại xong vẫn không hiện chương: ' + cardText().slice(0, 600));
  const bookCallsAfter = calls.filter((c) => c === 'GET https://cms.test/api/book/third-person').length;
  assert.strictEqual(bookCallsAfter, bookCallsBefore + 1, '"Thử lại" phải gọi lại GET /api/book đúng 1 lần');
  assert.ok(!/Không tải được dữ liệu chương/.test(cardText()), 'tải lại thành công mà thông báo lỗi còn đó');

  /* 1b) đã tải xong thì không còn tự gọi thêm */
  await wait(300);
  assert.strictEqual(n0('third-person'), 3, 'third-person: 2 lần lỗi (mở + Sửa lại) + 1 lần Thử lại, không có lượt tự động dư');

  /* 2) 404 → "chưa có dữ liệu chương", không phải lỗi */
  await openBook('Lunar Secret', 'lunar-secret');
  await until(() => /Bộ này chưa có dữ liệu chương/.test(cardText()), () => 'API book 404 mà không báo "chưa có dữ liệu chương": ' + cardText().slice(0, 600));
  assert.ok(!/Không tải được dữ liệu chương/.test(cardText()), '404 (chưa có dữ liệu) KHÔNG được báo như lỗi tải');
  assert.ok(!chapterCard().querySelector('[role="alert"]'), '404 không phải lỗi — không dùng role="alert"');

  const n = (slug) => calls.filter((c) => c === 'GET https://cms.test/api/book/' + slug).length;
  await wait(300);
  assert.strictEqual(n('lunar-secret'), 1, 'bộ chưa có dữ liệu (404) chỉ được đọc 1 lần, không tự đọc lại');

  /* 3) mở bộ bình thường: đúng 1 GET (trước G3 là 3 GET song song = gấp 3 lượt đọc KV) */
  const bakeTitle = registry.lib.find((b) => b.slug === 'bake-love-feelings').title;
  await openBook(bakeTitle, 'bake-love-feelings');
  await until(() => cardText().indexOf(firstTitle) >= 0, () => 'mở bộ bình thường không hiện chương: ' + cardText().slice(0, 300));
  await wait(300);
  assert.strictEqual(n('bake-love-feelings'), 1, 'mở 1 bộ phải chỉ gọi GET /api/book đúng 1 lần, thấy ' + n('bake-love-feelings'));

  const out = { bookCalls: calls.filter((c) => c.includes('/api/book/')), errors: p.errors };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đạt: khung soạn chương tách tải lỗi (có Thử lại) khỏi bộ chưa có dữ liệu.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
