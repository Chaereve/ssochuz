/* DOCX thật + Web Worker adapter chạy worker_threads (không mock chuyển đổi).
   Kiểm thử định dạng, tối ưu file 12 MB, an toàn HTML và giới hạn dung lượng. */
const assert = require('assert');
const { Worker: Thread } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { build } = require('esbuild');
const { makeDocx } = require('./docx_fixture');
const ROOT = path.join(__dirname, '..');
(async () => {
  const bundle = await build({ stdin: { contents: "export * from './src/admin/utils/chapterImport.js'; export * from './src/admin/utils/docxChapters.js'; export * from './src/admin/utils/docxArchive.js';", resolveDir: ROOT }, bundle: true, write: false, format: 'iife', globalName: 'Importer', platform: 'browser' });
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  const w = dom.window;
  let started = 0, terminated = 0, ticks = 0;
  w.Worker = class {
    constructor() {
      started++;
      const source = 'const {parentPort} = require("worker_threads"); globalThis.self = globalThis; self.postMessage = data => parentPort.postMessage(data); parentPort.on("message", data => self.onmessage({data}));\n' + fs.readFileSync(path.join(ROOT, 'admin-docx.js'), 'utf8');
      this.thread = new Thread(source, { eval: true });
      this.thread.on('message', (data) => this.onmessage && this.onmessage({ data }));
      this.thread.on('error', (error) => this.onerror && this.onerror({ preventDefault() {}, message: error.message }));
    }
    postMessage(buffer, transfer) { this.thread.postMessage(buffer, transfer); assert.strictEqual(buffer.byteLength, 0, 'buffer thực sự được transfer'); }
    terminate() { terminated++; this.thread.terminate(); }
  };
  w.eval(bundle.outputFiles[0].text);
  const { importChapterFile, splitChaptersHtml, jsonBytes, MAX_CHAPTER_FILE_BYTES, MAX_BOOK_BYTES, checkDocxArchive } = w.Importer;
  const file = (bytes, name = 'test.docx') => new w.File([bytes], name);
  const raw = await makeDocx([
    [{ t: 'Chương ', b: true }, { t: '1: Mở đầu', b: true, i: true }],
    [{ t: 'Thường ' }, { t: 'đậm', b: true }, { t: ' ' }, { t: 'nghiêng', i: true }, { t: ' ' }, { t: 'cả hai', b: true, i: true }, { t: ' thường lại', b: false, i: false }],
    [{ t: 'A', b: true }, { t: 'B', b: true }, { t: 'C', b: true }],
    [{ t: 'Style nghiêng', style: 'Emphasis' }, { t: 'Style đậm', style: 'Strong' }],
    [{ t: 'Dòng một', i: true }, { br: true }, { t: 'Dòng hai', b: true }, { br: true }, { t: 'Chương 2: Xuống dòng mềm', b: true }, { br: true }, { t: 'Nội dung chương hai', i: true }],
    '<img src=x onerror=alert(1)> & tiếng Việt 😀',
    'Chương 3: Rỗng',
  ]);
  const result = await importChapterFile(file(raw));
  assert.deepStrictEqual(Array.from(result.parts, (c) => c.t), ['Chương 1: Mở đầu', 'Chương 2: Xuống dòng mềm']);
  assert.strictEqual(result.skippedEmpty, 1);
  assert.strictEqual(result.parts[0].html, '<p>Thường <strong>đậm</strong> <em>nghiêng</em> <strong><em>cả hai</em></strong> thường lại</p><p><strong>ABC</strong></p><p><em>Style nghiêng</em><strong>Style đậm</strong></p><p><em>Dòng một</em><br><strong>Dòng hai</strong></p>');
  assert.strictEqual(result.parts[1].html, '<p><em>Nội dung chương hai</em></p><p>&lt;img src=x onerror=alert(1)&gt; &amp; tiếng Việt 😀</p>');
  assert.strictEqual(result.contentBytes, Buffer.byteLength(JSON.stringify(result.parts)));
  assert.ok(!/style=|class=|<img|data:/.test(result.parts[0].html));

  const dirty = '<p><strong>Chương 7</strong></p><p onclick="bad()" class="Mso"><strong><strong>A</strong></strong><strong>B</strong><span style="font-size:99px"><em>C</em></span><a href="javascript:bad()">D</a><img src="https://evil.test/a"><script>bad()</script><svg onload="bad()">bad()</svg></p>';
  const safe = await splitChaptersHtml(dirty);
  assert.strictEqual(safe.parts[0].html, '<p><strong>AB</strong><em>C</em>D</p>');
  assert.strictEqual(w.document.querySelectorAll('img,script').length, 0);
  const leadingBlank = await splitChaptersHtml('<p> </p><p><br></p><p><b>Chương 1</b></p><p><i>Chữ</i></p>');
  assert.strictEqual(leadingBlank.parts.length, 1, 'không tạo chương ma trước tiêu đề');
  const deep = await splitChaptersHtml('<p>' + '<span>'.repeat(200) + '<strong>Sâu</strong>' + '</span>'.repeat(200) + '</p>');
  assert.strictEqual(deep.parts[0].html, '<p><strong>Sâu</strong></p>');

  const controller = new w.AbortController(); controller.abort();
  await assert.rejects(() => importChapterFile(file(raw), { signal: controller.signal }), (e) => e.name === 'AbortError');
  const controller2 = new w.AbortController();
  const pending = importChapterFile(file(raw), { signal: controller2.signal });
  setTimeout(() => controller2.abort(), 10);
  await assert.rejects(() => pending, (e) => e.name === 'AbortError');
  const controller3 = new w.AbortController();
  const splitting = splitChaptersHtml('<p>X</p>'.repeat(10000), { signal: controller3.signal });
  setTimeout(() => controller3.abort(), 0);
  await assert.rejects(() => splitting, (e) => e.name === 'AbortError');

  // DOCX thật >12 MiB nhờ ảnh nhúng STORE: ảnh không hề được đọc/encode base64.
  const big = await makeDocx(['Chương 1', [{ t: 'Chữ đậm được giữ.', b: true }]], { imageBytes: 12 * 1024 * 1024 });
  assert.ok(big.length > 12 * 1024 * 1024 && big.length < MAX_CHAPTER_FILE_BYTES);
  const heartbeat = setInterval(() => ticks++, 5);
  const t0 = Date.now();
  const large = await importChapterFile(file(big, '12mb.docx'));
  clearInterval(heartbeat);
  assert.strictEqual(large.imagesSkipped, 1);
  assert.strictEqual(large.parts[0].html, '<p><strong>Chữ đậm được giữ.</strong></p>');
  assert.ok(large.contentBytes < 200);
  assert.ok(ticks > 0, 'UI tiếp tục chạy trong khi worker đọc file lớn');
  console.log(JSON.stringify({ inputBytes: big.length, chapterJsonBytes: large.contentBytes, elapsedMs: Date.now() - t0, uiTicks: ticks }));

  // Văn bản dài có nhiều chương/runs — kiểm chữ cuối, không cắt ngầm khi tối ưu.
  const paragraphs = [];
  for (let ch = 1; ch <= 100; ch++) {
    paragraphs.push('Chương ' + ch);
    for (let j = 0; j < 40; j++) paragraphs.push([{ t: ('Đoạn ' + ch + '.' + j + ' — chữ thường. ').repeat(100) }, { t: 'Đậm và nghiêng.', b: true, i: true }]);
  }
  const textHeavy = await makeDocx(paragraphs, { compression: 'STORE' });
  assert.ok(textHeavy.length >= 12 * 1024 * 1024 && textHeavy.length < MAX_CHAPTER_FILE_BYTES);
  const textStart = Date.now();
  const long = await importChapterFile(file(textHeavy));
  console.log(JSON.stringify({ textHeavyInputBytes: textHeavy.length, chapterJsonBytes: long.contentBytes, elapsedMs: Date.now() - textStart }));
  assert.strictEqual(long.parts.length, 100);
  assert.ok(long.parts[99].html.includes('Đoạn 100.39'));
  assert.ok(long.parts[99].html.endsWith('<strong><em>Đậm và nghiêng.</em></strong></p>'));

  const tooLarge = file('tiny'); Object.defineProperty(tooLarge, 'size', { value: MAX_CHAPTER_FILE_BYTES + 1 });
  await assert.rejects(() => importChapterFile(tooLarge), /tối đa 20 MB/);
  // 12 MiB ký tự Việt !=12 MiB JSON: kiểm giới hạn theo UTF-8, không string.length.
  const text = 'ộ'.repeat(9 * 1024 * 1024);
  assert.ok(jsonBytes({ chapters: [{ html: text }] }) > MAX_BOOK_BYTES);
  // Directory khai tổng giải nén khổng lồ: từ chối trước khi inflate.
  const expanded = Buffer.from(raw);
  const central = expanded.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  expanded.writeUInt32LE(65 * 1024 * 1024, central + 24);
  const bytes = new w.Uint8Array(expanded);
  assert.throws(() => checkDocxArchive(bytes.buffer), /giải nén vượt 64 MB/);
  await assert.rejects(() => importChapterFile(file(expanded)), /giải nén vượt 64 MB/);
  await assert.rejects(() => importChapterFile(file(Buffer.from('bad'))), /Không đọc được file DOCX/);
  assert.strictEqual(started, terminated, 'mọi worker đều được dọn sau thành công/lỗi/huỷ');
  dom.window.close();
  console.log('DOCX content: đậm/nghiêng/lồng nhau, break mềm, XSS, gộp runs, 12 MB, 100 chương, UTF-8, abort và giới hạn giải nén đạt.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
