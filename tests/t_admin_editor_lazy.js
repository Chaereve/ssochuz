/* Trình soạn thảo chương (Tiptap/ProseMirror) tải RIÊNG khi cần — admin-editor.js.

   Vì sao: Tiptap + ProseMirror ≈ 315 KB = ~62% admin.js; admin.js đã 509,6/520 KB
   (t_admin_budget.js) nên mọi tính năng admin mới sắp bị chặn. Chỉ khung soạn
   chương cần trình soạn thảo ⇒ các màn khác (thư viện, tổng quan, người dùng…)
   không phải tải nó nữa.

   Hợp đồng kiểm ở đây:
   1. admin.js KHÔNG chứa mã @tiptap/prosemirror/linkify (đọc sourcemap), và nhỏ
      hơn hẳn trước (< 260 KB); admin-editor.js tồn tại, < 360 KB.
   2. URL tải = /admin-editor.js?v=<10 ký tự đầu sha1 của đúng tệp đó> — phiên bản
      sinh tự động khi build, không có chuyện quên nâng ?v=.
   3. Tải lỗi (mạng) ⇒ role=alert "Không tải được trình soạn thảo" + nút Thử lại;
      thanh công cụ vẫn khoá; KHÔNG có lệnh ghi nào lên Worker. Thử lại ⇒ tải lại
      thật (lỗi không bị nhớ) ⇒ trình soạn thảo hiện, gõ/Lưu chạy như cũ.
   4. Trong lúc đang tải: có dòng "Đang tải trình soạn thảo…". Đổi sang bộ khác
      giữa chừng ⇒ đúng MỘT trình soạn thảo, không lỗi. Đã tải rồi thì mở bộ khác
      không tải lại tệp.

   Chạy tải thật bằng ResourceLoader của jsdom (phục vụ tệp từ repo) — không dùng
   bản nhúng sẵn như các bài admin khác (mk.page preload mặc định). */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ResourceLoader } = require('jsdom');
const { page, read } = require('./mk');
const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- 1 + 2: tĩnh ---------- */
const adminBytes = fs.statSync(path.join(ROOT, 'admin.js')).size;
const map = JSON.parse(read('admin.js.map'));
const heavy = (map.sources || []).filter((s) => /node_modules\/(@tiptap|prosemirror-|linkifyjs|rope-sequence|orderedmap)/.test(s));
assert.deepStrictEqual(heavy, [], 'admin.js vẫn gộp mã trình soạn thảo: ' + heavy.slice(0, 5).join(', '));
assert.ok(adminBytes < 260 * 1024, 'admin.js phải nhỏ lại sau khi tách trình soạn thảo, thấy ' + (adminBytes / 1024).toFixed(1) + ' KB');
assert.ok(fs.existsSync(path.join(ROOT, 'admin-editor.js')), 'thiếu admin-editor.js — chạy npm run build:admin');
const editorSrc = fs.readFileSync(path.join(ROOT, 'admin-editor.js'));
const editorBytes = editorSrc.length;
assert.ok(editorBytes < 360 * 1024, 'admin-editor.js vượt budget 360 KB: ' + (editorBytes / 1024).toFixed(1) + ' KB');
const wantVer = crypto.createHash('sha1').update(editorSrc).digest('hex').slice(0, 10);

/* ---------- 3 + 4: chạy thật ---------- */
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
  const calls = [];
  const apiFetch = (url, opt = {}) => {
    const method = opt.method || 'GET';
    calls.push(method + ' ' + url);
    const u = new URL(String(url), 'https://ssochuz.pages.dev');
    if (u.origin !== 'https://cms.test') return json({ ok: false, error: 'unexpected url ' + url }, false, 404);
    if (u.pathname === '/api/health') return json({ ok: true, adminConfigured: true, kv: true, version: 'test' });
    if (u.pathname === '/api/whoami') return json({ ok: true, role: 'admin', permissions: ['*'] });
    if (u.pathname === '/api/registry') return json(registry);
    const m = u.pathname.match(/^\/api\/book\/([^/]+)$/);
    if (m && method === 'GET') return json(Object.assign({}, goodBook, { slug: m[1] }));
    return json({ ok: false, error: 'missing mock ' + method + ' ' + u.pathname }, false, 404);
  };

  /* máy chủ tệp tĩnh giả cho jsdom: admin-editor.js lấy từ repo; lần đầu lỗi mạng */
  const loads = [];
  let failNext = 1, delay = 0;
  class RepoLoader extends ResourceLoader {
    fetch(url) {
      const u = new URL(url);
      if (u.pathname !== '/admin-editor.js') return Promise.resolve(Buffer.from(''));
      loads.push(u.pathname + u.search);
      if (failNext > 0) { failNext--; return Promise.reject(new Error('mạng rớt (test)')); }
      return wait(delay).then(() => editorSrc);
    }
  }
  const newPage = () => page('admin.html', {
    fetch: apiFetch, url: 'https://ssochuz.pages.dev/admin.html', config: { CZ_API: 'https://cms.test' },
    preload: [], resources: new RepoLoader(),
  });

  let p = newPage();
  let doc = p.doc, win = p.win;
  const $ = (sel) => doc.querySelector(sel);
  const $$ = (sel) => [...doc.querySelectorAll(sel)];
  const click = (el, what) => { assert.ok(el, 'không thấy ' + what); el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };
  const inputEv = (el, value) => { assert.ok(el, 'không thấy ô nhập'); el.value = value; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  async function until(fn, msg, tries = 80) {
    for (let i = 0; i < tries; i++) { if (fn()) return; await wait(50); }
    assert.fail(typeof msg === 'function' ? msg() : msg);
  }
  const chapterCard = () => $$('#pane-edit section.card2').find((s) => /^\s*Chương/.test((s.querySelector('h3') || {}).textContent || ''));
  const cardText = () => ((chapterCard() || {}).textContent || '').replace(/\s+/g, ' ');
  const writes = () => calls.filter((c) => !/^GET /.test(c));
  async function openBook(title, slug) {
    click($('button[data-tab="list"]'), 'tab Thư viện');
    await wait(150);
    inputEv($('#pane-list .v2toolbar input.inp'), title);
    await wait(150);
    const row = $$('.v2book-table tbody tr').find((r) => r.textContent.indexOf(slug) >= 0);
    click(row && [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sửa'), 'nút Sửa của ' + slug);
  }

  async function login() {
    inputEv($('#v2Api'), 'https://cms.test');
    inputEv($('#v2Key'), 'test-key');
    await wait(100);
    $('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => !$('.v2gate'), 'chưa qua auth gate');
  }

  await wait(400);
  assert.strictEqual(loads.length, 0, 'mở admin (chưa vào khung soạn chương) KHÔNG được tải trình soạn thảo');
  await login();
  await wait(300);
  assert.strictEqual(loads.length, 0, 'tổng quan/thư viện KHÔNG được tải trình soạn thảo, thấy ' + JSON.stringify(loads));

  /* 3) lần tải đầu lỗi mạng */
  await openBook('Third Person', 'third-person');
  await until(() => /Không tải được trình soạn thảo/.test(cardText()), () => 'tải trình soạn thảo lỗi mà không báo: ' + cardText().slice(0, 500) + ' loads=' + JSON.stringify(loads));
  assert.strictEqual(loads.length, 1);
  assert.strictEqual(loads[0], '/admin-editor.js?v=' + wantVer, 'URL phải mang phiên bản = sha1 của tệp, thấy ' + loads[0]);
  const alertBox = [...chapterCard().querySelectorAll('[role="alert"]')].find((a) => /trình soạn thảo/.test(a.textContent));
  assert.ok(alertBox, 'thông báo lỗi tải trình soạn thảo phải có role="alert"');
  assert.ok(!chapterCard().querySelector('.ProseMirror'), 'lỗi tải thì không thể có trình soạn thảo');
  const boldBtn = [...chapterCard().querySelectorAll('button')].find((b) => b.textContent.trim() === 'B');
  if (boldBtn) assert.ok(boldBtn.disabled, 'thanh công cụ phải khoá khi chưa có trình soạn thảo');
  assert.deepStrictEqual(writes(), [], 'tải trình soạn thảo lỗi KHÔNG được ghi gì lên Worker: ' + JSON.stringify(writes()));

  /* Thử lại → tải thật lần 2, có dòng "đang tải" trong lúc chờ */
  delay = 400;
  click([...alertBox.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Thử lại'), 'nút Thử lại (trình soạn thảo)');
  await until(() => /Đang tải trình soạn thảo/.test(cardText()), () => 'trong lúc tải phải có "Đang tải trình soạn thảo…": ' + cardText().slice(0, 300));
  await until(() => chapterCard() && chapterCard().querySelector('.v2tiphost .ProseMirror'), () => 'Thử lại xong không có trình soạn thảo: ' + cardText().slice(0, 400) + ' loads=' + JSON.stringify(loads));
  assert.strictEqual(loads.length, 2, 'Thử lại phải tải lại tệp đúng 1 lần (lỗi không bị nhớ), thấy ' + loads.length);
  assert.ok(!/Không tải được trình soạn thảo/.test(cardText()), 'tải lại được rồi mà thông báo lỗi còn');
  assert.ok(!/Đang tải trình soạn thảo/.test(cardText()), 'tải xong mà dòng "đang tải" còn');
  const firstPara = String(goodBook.chapters[0].html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
  assert.ok(chapterCard().querySelector('.ProseMirror').textContent.replace(/\s+/g, ' ').indexOf(firstPara) >= 0, 'trình soạn thảo phải hiện nội dung chương đầu');

  /* 4a) đã tải rồi: mở bộ khác dùng lại tệp, đúng 1 trình soạn thảo */
  const bake = registry.lib.find((b) => b.slug === 'bake-love-feelings');
  await openBook(bake.title, 'bake-love-feelings');
  await wait(50);
  await openBook('Lunar', 'lunar-secret');
  await until(() => chapterCard() && chapterCard().querySelector('.v2tiphost .ProseMirror'), 'mở bộ khác không có trình soạn thảo');
  await wait(600);
  assert.strictEqual($$('.v2tiphost .ProseMirror').length, 1, 'phải có đúng 1 trình soạn thảo, thấy ' + $$('.v2tiphost .ProseMirror').length);
  assert.strictEqual(loads.length, 2, 'đã tải rồi thì mở bộ khác không tải lại tệp, thấy ' + JSON.stringify(loads));
  assert.deepStrictEqual(writes(), [], 'chỉ mở/đổi bộ thì không được ghi gì: ' + JSON.stringify(writes()));

  const errorsFirst = p.errors;
  p.win.close();

  /* 4b) đổi bộ GIỮA LÚC ĐANG TẢI (trang mới, tệp chậm 800 ms): kết quả của khung
     cũ phải bị bỏ — không có 2 trình soạn thảo chồng lên cùng một vùng */
  loads.length = 0; failNext = 0; delay = 800;
  p = newPage(); doc = p.doc; win = p.win;
  await wait(400);
  await login();
  await openBook('Third Person', 'third-person');
  await until(() => loads.length === 1, 'mở khung soạn chương phải bắt đầu tải trình soạn thảo');
  await openBook(bake.title, 'bake-love-feelings');
  await until(() => chapterCard() && chapterCard().querySelector('.v2tiphost .ProseMirror'), 'tải chậm xong không có trình soạn thảo');
  await wait(600);
  assert.strictEqual($$('.ProseMirror').length, 1, 'đổi bộ giữa lúc tải: phải đúng 1 trình soạn thảo, thấy ' + $$('.ProseMirror').length);
  assert.strictEqual(loads.length, 1, 'hai khung cùng chờ phải dùng chung MỘT lượt tải, thấy ' + loads.length);
  assert.deepStrictEqual(writes(), [], 'không được ghi gì: ' + JSON.stringify(writes()));
  p.errors.unshift(...errorsFirst);

  const out = { adminKB: +(adminBytes / 1024).toFixed(1), editorKB: +(editorBytes / 1024).toFixed(1), loads, errors: p.errors };
  console.log(JSON.stringify(out, null, 1));
  assert.deepStrictEqual(p.errors, []);
  console.log('Đạt: trình soạn thảo tải riêng khi cần, lỗi có Thử lại, không ghi gì, phiên bản tự sinh.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
