/* Kiểm thử Chromium thật, gồm CSP thật và Web Worker thật.
   Chạy riêng: CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node tests/t_docx_browser.js
   Hoặc cài browser mặc định bằng npx playwright install chromium trong tests/. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { makeDocx } = require('./docx_fixture');
const ROOT = path.join(__dirname, '..');
(async () => {
  const { sanitizeChapterHtml } = await import('../src/shared/sanitize.js');
  let book = { slug: 'docx-browser', title: 'Truyện kiểm thử DOCX', chapters: [{ t: 'Chương cũ', html: '<p>Cũ</p>' }] };
  const chapterWrites = [];
  const writes = [], errors = [], workerUrls = [], external = [];
  const csp = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n/*\n')[1].split('\n').find((line) => line.includes('Content-Security-Policy:')).split('Content-Security-Policy:')[1].trim();
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://test').pathname;
    res.setHeader('Content-Security-Policy', csp);
    if (pathname.startsWith('/api/')) {
      let value = { ok: true, items: [], groups: [], count: 0 };
      if (pathname === '/api/health') value = { ok: true, adminConfigured: true, kv: true };
      if (pathname === '/api/whoami') value = { ok: true, role: 'admin', permissions: ['*'] };
      if (pathname === '/api/registry') value = { lib: [{ slug: book.slug, title: book.title, chapters: book.chapters.length }], slides: [], settings: {} };
      if (pathname === '/api/book/' + book.slug) {
        if (req.method === 'PUT') {
          let body = ''; for await (const chunk of req) body += chunk;
          writes.push({ bytes: Buffer.byteLength(body), body: JSON.parse(body) });
          book = JSON.parse(body);
          book.chapters.forEach((c) => { c.html = sanitizeChapterHtml(c.html); });
          value = { ok: true };
        } else value = book;
      }
      if (pathname === '/api/book/' + book.slug + '/chapter' && req.method === 'PUT') {
        let body = ''; for await (const chunk of req) body += chunk;
        const data = JSON.parse(body); chapterWrites.push(data);
        book.chapters[data.index] = { ...data.chapter, html: sanitizeChapterHtml(data.chapter.html) };
        value = { ok: true, index: data.index, chapters: book.chapters.length, live: book.chapters.length };
      }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return;
    }
    const name = pathname === '/admin' ? 'admin.html' : pathname.slice(1);
    const file = path.resolve(ROOT, name);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('worker', (w) => workerUrls.push(w.url()));
    page.on('console', (msg) => { if (/Content Security Policy|Refused to/.test(msg.text())) errors.push(msg.text()); });
    await context.route('**/*', (route) => {
      if (!route.request().url().startsWith(origin)) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.addInitScript(({ origin }) => {
      window.CZ_API = origin;
      localStorage.setItem('cz_kv_api', origin);
      sessionStorage.setItem('cz_kv_key', 'test-key');
      window.uiTicks = 0; setInterval(() => window.uiTicks++, 10);
    }, { origin });
    await page.goto(origin + '/admin');
    await page.locator('button[data-tab="list"]').click();
    await page.locator('.v2book-table .v2actions button').first().click();
    const input = page.locator('input[accept*=".docx"]');
    const big = await makeDocx([
      [{ t: 'Chương 1', b: true }],
      [{ t: 'Đậm', b: true }, { t: ' ' }, { t: 'Nghiêng', i: true }, { t: ' ' }, { t: 'Cả hai', b: true, i: true }],
      'Chương 2', [{ t: 'Nội dung cuối', i: true }],
    ], { imageBytes: 12 * 1024 * 1024 });
    const start = Date.now();
    await input.setInputFiles({ name: 'truyen-12mb.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: big });
    await page.locator('.v2import-preview').waitFor({ timeout: 30000 });
    const info = await page.locator('.v2import-preview').innerText();
    assert.match(info, /Phát hiện 2 chương/);
    assert.match(info, /Đã bỏ 1 ảnh/);
    assert.match(info, /12.*MB/);
    assert.strictEqual(writes.length, 0);
    assert.strictEqual(workerUrls.length, 1);
    assert.ok(await page.evaluate(() => window.uiTicks > 2));
    await page.locator('.v2import-preview summary').click();
    assert.strictEqual(await page.locator('.v2import-preview strong em').innerText(), 'Cả hai');
    await page.locator('.v2import-preview .btn.pri').click();
    await page.locator('.v2import-preview').waitFor({ state: 'hidden' });
    assert.strictEqual(writes.length, 1);
    assert.ok(writes[0].bytes < 1024, 'không upload DOCX/ảnh base64');
    assert.strictEqual(writes[0].body.chapters.length, 3);
    const expected = '<p><strong>Đậm</strong> <em>Nghiêng</em> <strong><em>Cả hai</em></strong></p>';
    assert.strictEqual(book.chapters[1].html, expected);
    await page.waitForFunction(() => document.querySelector('.ProseMirror strong em')?.textContent === 'Cả hai');
    await page.locator('.v2chap-actions .btn.pri').click();
    // Editor -> Lưu chương -> sanitizer cũng không mất mark.
    await page.waitForFunction(() => !document.querySelector('.v2chap-actions .btn.pri').disabled);

    assert.strictEqual(chapterWrites.length, 1);
    assert.strictEqual(book.chapters[1].html, expected);

    // Thay thế ngay tại index 0: nháp cũ không phục hồi đè lên file vừa nhập.
    await page.locator('.v2chapter-list button').first().click();
    const title = page.locator('.v2chapter-editor input.inp').first();
    await page.waitForFunction(() => document.querySelector('.v2chapter-editor input.inp').value === 'Chương cũ');
    await title.fill('Nháp cũ cần bỏ');
    await page.waitForFunction(() => !!localStorage.getItem('ssochuz_admin_v2_chdraft:docx-browser:0'));
    await input.setInputFiles({ name: 'replace.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await makeDocx(['Chương 9', [{ t: 'Mới hoàn toàn', b: true, i: true }]]) });
    await page.locator('.v2import-preview select').selectOption('replace');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.v2import-preview .btn.pri').click();
    await page.locator('.v2import-preview').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('.ProseMirror strong em')?.textContent === 'Mới hoàn toàn');
    assert.strictEqual(await title.inputValue(), 'Chương 9');
    assert.strictEqual(book.chapters.length, 1);
    await page.reload();
    await page.locator('button[data-tab="list"]').click();
    await page.locator('.v2book-table .v2actions button').first().click();
    await page.waitForFunction(() => document.querySelector('.ProseMirror strong em')?.textContent === 'Mới hoàn toàn');
    assert.deepStrictEqual(errors, [], 'không lỗi JS/CSP');
    assert.ok(!external.some((url) => /evil|docx|convert/i.test(url)), 'không gửi tài liệu ra dịch vụ ngoài');
    console.log(JSON.stringify({ browser: await browser.version(), inputBytes: big.length, uploadBytes: writes[0].bytes, workflowMs: Date.now() - start, workerUrls, errors }));
    console.log('Chromium thật: DOCX 12 MB, Worker/CSP, preview đậm nghiêng, ghi/đọc lại, replace cùng index và nháp cũ đều đạt.');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
