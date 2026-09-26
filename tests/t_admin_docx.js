/* Luồng DOCX thật: ZIP/XML -> bundle trình duyệt -> preview -> PUT book.
   Không mock bộ chuyển đổi Word hay FileReader. */
const assert = require('assert');
const { makeDocx: docx } = require('./docx_fixture');
const { page, read } = require('./mk');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label) {
  for (let n = 0; n < 100; n++) { if (fn()) return; await wait(30); }
  assert.fail('Hết thời gian chờ: ' + label);
}


(async () => {
  const original = { slug: 'test-docx', title: 'Truyện thử', chapters: [{ t: 'Chương 1', html: '<p>Nội dung cũ</p>' }] };
  const writes = [], notices = [];
  let loads = 0, failLoad = true, failSave = false, finishSave;
  const response = (body, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
  const p = page('admin.html', {
    config: { CZ_API: 'https://cms.test' },
    fetch(url, opt = {}) {
      const path = new URL(String(url), 'https://ssochuz.pages.dev').pathname;
      if (path === '/api/health') return response({ ok: true, adminConfigured: true, kv: true });
      if (path === '/api/whoami') return response({ ok: true, role: 'admin', permissions: ['*'] });
      if (path === '/api/registry') return response({ lib: [{ ...original, chapters: 1 }], slides: [], settings: {} });
      if (path === '/api/book/test-docx') {
        if (opt.method === 'PUT') {
          writes.push(JSON.parse(opt.body));
          if (failSave) return response({ error: 'Lỗi ghi thử nghiệm' }, false);
          return new Promise((resolve) => { finishSave = () => resolve(response({ ok: true })); });
        }
        return response(original);
      }
      return response({ ok: true, items: [], groups: [], comments: [], count: 0 });
    },
    setup(w) {
      w.confirm = () => true;
      // Các API trình duyệt chưa đủ trong jsdom (postMessage thiếu event.source).
      w.setImmediate = setImmediate;
      w.clearImmediate = clearImmediate;
      w.TextDecoder = TextDecoder;
      w.TextEncoder = TextEncoder;
      // Giả lập kênh Web Worker của jsdom; chạy bundle thật không có DOM.
      w.Worker = class {
        constructor(url) { assert.match(url, /admin-docx\.js/); loads++; this.stopped = false; }
        terminate() { this.stopped = true; }
        postMessage(buffer, transfer) {
          assert.strictEqual(transfer[0], buffer, 'chuyển quyền sở hữu buffer');
          setTimeout(() => {
            if (this.stopped) return;
            if (failLoad) { failLoad = false; this.onerror({ preventDefault() {} }); return; }
            const vm = require('vm');
            const ctx = vm.createContext({ setTimeout, clearTimeout, setImmediate, clearImmediate, TextDecoder, TextEncoder, console });
            ctx.self = ctx;
            ctx.postMessage = (data) => { if (!this.stopped) this.onmessage({ data }); };
            vm.runInContext(read('admin-docx.js'), ctx);
            // Tạo buffer đúng realm của worker như structured clone.
            ctx.inputBytes = Array.from(new w.Uint8Array(buffer));
            vm.runInContext('self.onmessage({data: new Uint8Array(inputBytes).buffer})', ctx);
          }, 20);
        }
      };
    },
  });
  const { win, doc } = p;
  const $ = (s) => doc.querySelector(s);
  const click = (el) => { assert.ok(el); el.click(); };
  const input = (el, value) => { el.value = value; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  await until(() => $('#v2Key'), 'form đăng nhập');
  input($('#v2Api'), 'https://cms.test'); input($('#v2Key'), 'test-key');
  await wait(100);
  $('.v2connect').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !$('.v2gate'), 'đăng nhập');
  win.CZ.toast = (message) => notices.push(message);
  click($('button[data-tab="list"]'));
  await until(() => $('.v2book-table .v2actions button'), 'thư viện');
  click($('.v2book-table .v2actions button'));
  await until(() => $('input[accept*=".docx"]'), 'editor');
  await wait(150);
  const multi = () => $('input[accept*=".docx"]');
  const choose = (file) => {
    Object.defineProperty(multi(), 'files', { value: [file], configurable: true });
    multi().dispatchEvent(new win.Event('change', { bubbles: true }));
  };
  const preview = () => $('.v2import-preview');
  const confirm = () => $('.v2import-preview .btn.pri');
  const cancel = () => $('.v2import-preview .btn.ghost');
  const titles = () => [...doc.querySelectorAll('.v2import-preview li')].map((el) => el.textContent);
  const file = new win.File([await docx(['Lời mở đầu', [{ t: 'Xin chào.', b: true, i: true }], 'Chương 2: Tiếng Việt', 'Đoạn một & hai.', '<script>alert(1)</script>', 'Chương III: Tiếp nối', 'Kết thúc.'])], 'truyen.DOCX');

  assert.strictEqual(loads, 0, 'không tải Word khi mở admin');
  choose(new win.File(['Chương 8\r\nĐoạn TXT.'], 'cu.txt'));
  await until(preview, 'preview TXT');
  assert.deepStrictEqual(titles(), ['Chương 8']);
  assert.strictEqual(loads, 0, 'TXT không tải Word');
  click(cancel()); await until(() => !preview(), 'huỷ TXT');
  assert.strictEqual(writes.length, 0, 'huỷ không ghi');

  choose(file);
  await until(() => notices.some((s) => /Kiểm tra mạng/.test(s)), 'báo lỗi tải bundle');
  assert.ok(!preview());
  choose(file);
  await until(preview, 'preview DOCX sau khi thử lại');
  assert.strictEqual(loads, 2);
  assert.deepStrictEqual(titles(), ['Lời mở đầu', 'Chương 2: Tiếng Việt', 'Chương III: Tiếp nối']);
  assert.strictEqual(writes.length, 0, 'chưa xác nhận thì không ghi');
  assert.ok(/DOCX giữ đậm\/nghiêng/.test(doc.body.textContent));
  assert.strictEqual($('.v2import-preview select').value, 'append');
  click(confirm()); click(confirm()); // bấm lặp ngay trong cùng một tick
  await until(() => writes.length === 1, 'ghi nối cuối');
  await until(() => confirm().disabled, 'chặn bấm lặp khi đang ghi');
  click(confirm());
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].chapters.length, 4);
  assert.deepStrictEqual(writes[0].chapters[0], original.chapters[0]);
  assert.strictEqual(writes[0].chapters[2].html, '<p>Đoạn một &amp; hai.</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  finishSave();
  await until(() => !preview(), 'ghi hoàn tất');

  await until(() => $('.ProseMirror strong em'), 'đậm nghiêng hiện trong editor');
  const first = $('#pane-edit .v2chapter-list button'); click(first); await wait(120);
  const titleInput = $('#pane-edit .v2chapter-editor input.inp');
  input(titleInput, 'Nháp không được khôi phục vào chương mới'); await wait(750);
  assert.ok(win.localStorage.getItem('ssochuz_admin_v2_chdraft:test-docx:0'));
  choose(file); await until(preview, 'chọn lại cùng file');
  assert.strictEqual(loads, 3, 'worker mới cho file mới, bộ đọc do HTTP cache quản lý');
  const mode = $('.v2import-preview select'); mode.value = 'replace';
  mode.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(60);
  win.confirm = () => false;
  click(confirm()); await wait(60);
  assert.strictEqual(writes.length, 1, 'huỷ xác nhận thay thế không ghi');
  win.confirm = () => true;
  failSave = true; click(confirm());
  await until(() => writes.length === 2 && notices.some(s => /Lưu chương lỗi/.test(s)) && confirm() && !confirm().disabled, 'ghi lỗi');
  assert.ok(preview(), 'giữ preview sau lỗi để thử lại');
  failSave = false; click(confirm());
  await until(() => writes.length === 3, 'thử lại ghi');
  assert.strictEqual(writes[2].chapters.length, 3);
  assert.strictEqual(writes[2].chapters[0].t, 'Lời mở đầu');
  finishSave(); await until(() => !preview(), 'thay thế xong');
  await until(() => $('.ProseMirror strong em') && $('#pane-edit .v2chapter-editor input.inp').value === 'Lời mở đầu', 'replace cùng index: editor và tiêu đề nạp nội dung mới');
  await wait(800);
  assert.strictEqual(win.localStorage.getItem('ssochuz_admin_v2_chdraft:test-docx:0'), null, 'nháp chương cũ không phục hồi đè chương mới');

  for (const [bad, message] of [
    [new win.File(['not a zip'], 'hong.docx'), /Không đọc được file DOCX/],
    [new win.File([await docx([])], 'rong.docx'), /Không tìm thấy nội dung/],
    [new win.File(['old'], 'cu.doc'), /Chỉ hỗ trợ/],
    [new win.File(['html'], 'cu.html'), /Chỉ hỗ trợ/],
  ]) {
    const before = notices.length;
    choose(bad);
    await until(() => notices.slice(before).some((s) => message.test(s)), bad.name);
    assert.ok(!preview(), 'file lỗi không để lại preview');
  }
  const large = new win.File(['small'], 'lon.docx');
  Object.defineProperty(large, 'size', { value: 20 * 1024 * 1024 + 1 });
  choose(large); await until(() => notices.some((s) => /File quá lớn/.test(s)), 'giới hạn dung lượng');
  assert.strictEqual(writes.length, 3, 'file lỗi không ghi dữ liệu');

  choose(new win.File([await docx(['Văn bản không có tiêu đề.', 'Đoạn hai.'])], 'don.docx'));
  await until(preview, 'DOCX không có tiêu đề');
  assert.deepStrictEqual(titles(), ['Chương 1']);
  click(cancel()); await until(() => !preview(), 'huỷ');

  // Đọc chậm rồi rời editor: kết quả cũ không xuất hiện khi mở lại.
  const NativeReader = win.FileReader;
  win.FileReader = class {
    abort() {}
    readAsArrayBuffer() { setTimeout(() => { this.result = new win.ArrayBuffer(0); this.onload(); }, 200); }
  };
  choose(file); await wait(40);
  click($('button[data-tab="list"]')); await wait(300);
  click($('.v2book-table .v2actions button'));
  await until(multi, 'mở lại editor'); await wait(100);
  assert.ok(!preview(), 'bỏ kết quả import sau khi rời editor');
  win.FileReader = NativeReader;

  assert.deepStrictEqual(p.errors, []);
  p.dom.window.close();
  console.log('DOCX: tách chương, UTF-8, escape HTML, worker/retry, preview, huỷ, append/replace, lỗi ghi/file và TXT đều đạt.');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
