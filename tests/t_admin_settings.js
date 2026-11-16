/* =============================================================================
   Vòng 18c · TAB “CÀI ĐẶT” (Hệ thống)

     K1  “Tải backup JSON” tải đúng `{registry}`. Ở trang này registry LÀ toàn bộ
         dữ liệu ⇒ bản sao lưu KHÔNG chứa thông báo trang chủ, editorChoice, lịch
         ra chương, bình luận, báo lỗi, phiếu bầu, số liệu đọc. Bản sao lưu hụt
         nguy hiểm hơn không có bản sao lưu: khôi phục lại tưởng đã đủ.
     K2  Ô chọn file khôi phục nói “Ghi đè gõ KHÔI PHỤC” nhưng không có ô nào
         để gõ — khoá xác nhận nằm trong hộp thoại, câu hướng dẫn sai địa chỉ.
     K3  “Đồng bộ metadata Blogger” ghi đè registry ngay, không nêu bao nhiêu bộ
         sẽ bị sửa và không nhắc tạo backup trước.
     K4  Không có bảng sức khoẻ KV (số khoá/byte theo tiền tố) dù tab khác dùng
         /api/admin/kv — “Bảo trì số liệu” chỉ có 2 nút mà không thấy tình trạng.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const prod = R('admin.html'), real = R('admin-real.js');
const reg = JSON.parse(R('data/registry.json'));
const resp = (x, st = 200) => ({ ok: st < 400, status: st, headers: { get: () => 'application/json' }, json: async () => x, text: async () => JSON.stringify(x) });

const errs = [];
const pre = '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");sessionStorage.setItem("cz_kv_key","K");}catch(e){}<\/script>';
const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, pre + '<script>' + real + '</script>');
const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
vc.on('error', (...a) => errs.push('console: ' + a.join(' ')));
const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, D = w.document;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.scrollTo = () => {};
/* bắt mọi lần tải file để xem backup chứa gì */
const downloads = [];
w.URL.createObjectURL = (blob) => { downloads.push(blob); return 'blob:qa'; };
w.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };

const KV_GROUPS = [
  { prefix: 'book', keys: 60, bytes: 240000 },
  { prefix: 'img', keys: 18, bytes: 90000 },
  { prefix: 'registry', keys: 1, bytes: 51200 },
  { prefix: 'log', keys: 1, bytes: 800 }
];
w.fetch = (u) => {
  const p = new URL(String(u), 'https://ssochuz.pages.dev').pathname;
  if (p === '/api/registry') return Promise.resolve(resp(reg));
  if (p === '/api/health' || p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
  if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 137, readsToday: 4021, keys: 80, bytes: 382000, unknownBytes: 0, groups: KV_GROUPS }));
  if (p === '/api/admin/comments') return Promise.resolve(resp({ ok: true, comments: [{ id: 'c1', slug: reg.lib[0].slug, name: 'A', text: 'spam http://x', at: new Date().toISOString(), spam: true }, { id: 'c2', slug: reg.lib[1].slug, name: 'B', text: 'hay', at: new Date().toISOString() }] }));
  if (p === '/api/reports') return Promise.resolve(resp({ ok: true, reports: [{ id: 'r1', slug: reg.lib[0].slug, type: 'loi-anh', text: 'ảnh hỏng', at: new Date().toISOString(), done: false }] }));
  if (p === '/api/stats') return Promise.resolve(resp({ ok: true, items: {}, votes: {} }));
  if (/^\/api\/book\//.test(p)) return Promise.resolve(resp({ slug: 'x', title: 'x', chapters: [{}, {}] }));
  if (/^\/api\//.test(p)) return Promise.resolve(resp({ ok: true, items: [] }));
  return Promise.resolve(resp({}));
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const bad = []; let checks = 0;
const ok = (c, m) => { checks++; if (!c) bad.push(m); };

(async () => {
  await wait(2200);
  const S = w.CZ_MOCKUP.state;
  const view = () => D.getElementById('view');
  const txt = () => view().textContent.replace(/\s+/g, ' ');

  /* K1 · backup phải đủ khoá, không chỉ registry */
  S.route = 'cai-dat'; w.render();
  const bbtn = view().querySelector('[data-act="backup"]');
  ok(!!bbtn, 'K1: có nút tải backup');
  downloads.length = 0;
  /* jsdom không phải lúc nào cũng có Blob.text ⇒ bắt thẳng nội dung qua
     constructor, đúng thứ người dùng nhận được khi tải tệp. */
  const parts = [];
  const OrigBlob = w.Blob;
  w.Blob = function (p, o) { parts.push((p || []).join('')); return new OrigBlob(p, o); };
  bbtn.click(); await wait(300);
  w.Blob = OrigBlob;
  let payload = null;
  try {
    const raw = parts.find(t => /^\s*\{/.test(String(t)));
    payload = raw ? JSON.parse(raw) : null;
  } catch (e) { payload = null; }
  ok(!!payload, 'K1: backup tải ra JSON đọc được');
  const keys = payload ? Object.keys(payload) : [];
  ok(keys.indexOf('registry') >= 0, 'K1: backup có registry (' + keys.join(',') + ')');
  ['comments', 'reports', 'stats', 'settings', 'schedule'].forEach(k => {
    ok(keys.indexOf(k) >= 0, 'K1: backup có khoá “' + k + '” để khôi phục lại được đủ');
  });
  /* nội dung trang chủ (thông báo / Series / lịch) nằm TRONG registry.settings
     và registry.schedule ⇒ backup phải mang nguyên khối đó, không chỉ lib. */
  const regOut = payload && payload.registry;
  ok(!!regOut && typeof regOut === 'object', 'K1: backup có nguyên registry');
  ok(!!regOut && !!regOut.settings && typeof regOut.settings === 'object',
    'K1: backup giữ settings (thông báo trang chủ + Series)');
  ok(!!regOut && !!regOut.schedule && typeof regOut.schedule === 'object',
    'K1: backup giữ schedule (lịch ra chương + ghi chú)');

  /* K2 · hướng dẫn khôi phục phải khớp chỗ gõ */
  ok(!/Ghi đè gõ KHÔI PHỤC/.test(txt()) || !!view().querySelector('[data-role="restore-word"]'),
    'K2: câu “gõ KHÔI PHỤC” phải có ô để gõ, hoặc đổi câu cho đúng');

  /* K3 · đồng bộ Blogger phải nói rõ hậu quả trước khi chạy */
  const sync = view().querySelector('[data-act="blogger-sync"]');
  sync.click(); await wait(300);
  const dlg = D.querySelector('dialog[open]') || D.querySelector('.modal[open]') || D.querySelector('[role="dialog"]');
  const dlgTxt = dlg ? dlg.textContent : '';
  ok(/backup|sao lưu/i.test(dlgTxt), 'K3: hộp thoại đồng bộ nhắc tạo backup trước (thấy: ' + dlgTxt.slice(0, 80) + ')');
  ok(/\d+\s*bộ/.test(dlgTxt), 'K3: hộp thoại nêu số bộ sẽ bị ghi đè');

  /* K4 · phải thấy sức khoẻ KV ngay trong Cài đặt */
  S.route = 'cai-dat'; w.render();
  const t2 = txt();
  ok(/Sức khoẻ KV|Dung lượng KV/i.test(t2), 'K4: có khối sức khoẻ KV');
  ok(/book/.test(t2) && /registry/.test(t2), 'K4: khối sức khoẻ liệt kê nhóm khoá (book/registry)');

  ok(errs.length === 0, '0 lỗi JS (' + errs.slice(0, 2).join(' | ') + ')');
  dom.window.close();
  console.log(JSON.stringify({ bai: 't_admin_settings.js', kiemTra: checks, loi: bad.length, errors0: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
