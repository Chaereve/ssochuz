/* ============================================================================
   Kiểm thử GƯƠNG MẶT MỚI của trang quản trị (bản 1.10.0)
   - sườn .ashell: sidebar dọc (mặt bàn) + 11 tab, KHÔNG còn quick/private/help
   - huy hiệu quyền: vào bằng ADMIN_KEY → “quản trị · khoá”
   - trình soạn chương: #edBody contenteditable + thanh định dạng + đếm từ
   - thẻ khóa mật mã: đặt khóa qua UI → gọi đúng /api/lock/set, badge đổi
   - kiểm kho KV: bấm Làm mới → đọc /api/admin/kv, vẽ nhóm + tỉ trọng
   - nút nguy hiểm xác nhận 2 bước: bấm lần 1 chỉ “vũ trang”, lần 2 mới chạy
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, read } = require('./mk');

const KEY = 'khoa-quan-tri-dai-cho-du-24-ky-tu';
const BASE = 'https://cms.test';
const $ = (d, s) => d.querySelector(s), $$ = (d, s) => [...d.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms));

function makeWorker() {
  const REG = JSON.parse(read('data/registry.json'));
  const books = {};
  const calls = [];
  function loadBook(slug) {
    if (books[slug] === undefined) {
      const p = path.join(__dirname, '..', 'data/book', slug + '.json');
      books[slug] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    }
    return books[slug];
  }
  function json(body, status, ok) {
    return Promise.resolve({
      ok: ok !== false, status: status || 200,
      json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body))
    });
  }
  function fetchMock(url, opt) {
    url = String(url); opt = opt || {};
    if (!url.startsWith(BASE)) {
      const m = url.split('?')[0].match(/^\/data\/book\/([\w.\-]+)\.json$/);
      if (m) {
        const f = path.join(__dirname, '..', 'data/book', m[1] + '.json');
        return fs.existsSync(f) ? json(JSON.parse(fs.readFileSync(f, 'utf8')))
          : json({ ok: false, error: 'không có file' }, 404, false);
      }
      if (url.split('?')[0] === '/data/registry.json') return json(REG);
      return json({ ok: false, error: 'không phải Worker' }, 404, false);
    }
    const p = url.slice(BASE.length).split('?')[0];
    const h = opt.headers || {};
    const auth = h['x-admin-key'] === KEY;
    calls.push((opt.method || 'GET') + ' ' + p);
    if (p === '/api/health') return json({ ok: true, version: '1.10.0', kv: true,
      books: Object.keys(books).length, novels: REG.lib.length, regRev: REG.rev,
      lastWrite: '2026-09-13T03:00:00Z', stats: { items: 0, views: 0, votes: 0 },
      auth: { supabase: true, supabaseUrl: 'https://x.supabase.co', google: false,
        session: true, adminConfigured: true, mail: false } });
    if (p === '/api/whoami') return auth
      ? json({ ok: true, admin: true, via: 'key' })
      : json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
    if (p === '/api/registry') {
      if (opt.method === 'PUT') { if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
        REG.lib = JSON.parse(opt.body).lib || REG.lib; return json({ ok: true, saved: true }); }
      return json(REG);
    }
    const mb = p.match(/^\/api\/book\/([\w.\-]+)$/);
    if (mb) {
      const slug = mb[1];
      if (!auth) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
      if (opt.method === 'PUT') {
        const b = JSON.parse(opt.body); books[slug] = b;
        const n = REG.lib.find(x => x.slug === slug);
        if (n && Array.isArray(b.chapters)) { n.chapters = b.chapters.length; n.countLabel = b.chapters.length + '/' + b.chapters.length; }
        return json({ ok: true, chapters: (b.chapters || []).length });
      }
      if (opt.method === 'DELETE') { books[slug] = null; return json({ ok: true, deleted: slug }); }
      const b = loadBook(slug);
      if (!b) return json({ ok: false, error: 'chưa có' }, 404, false);
      return json(b);
    }
    if (p === '/api/lock/set' && opt.method === 'POST') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      const b = JSON.parse(opt.body); const slug = b.slug;
      const book = books[slug] = loadBook(slug) || { title: slug, slug, chapters: [] };
      const pw = String(b.password == null ? '' : b.password).trim();
      if (!pw) { delete book.lock; return json({ ok: true, slug, locked: false }); }
      if (pw.length < 8) return json({ ok: false, error: 'Mật mã cần từ 8 đến 256 ký tự.' }, 400, false);
      book.lock = { salt: [1], hash: [2], set: new Date().toISOString() };
      const n = REG.lib.find(x => x.slug === slug); if (n) n.lock = 1;
      return json({ ok: true, slug, locked: true });
    }
    if (p === '/api/admin/kv') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      return json({ ok: true, keys: 120, bytes: 25 * 1024 * 1024, groups: [
        { prefix: 'book:', keys: 62, bytes: 18 * 1024 * 1024, unknownBytes: 0 },
        { prefix: 'img:', keys: 30, bytes: 6 * 1024 * 1024, unknownBytes: 0 },
        { prefix: 'cmt:', keys: 20, bytes: 512 * 1024, unknownBytes: 0 },
        { prefix: 'voters', keys: 5, bytes: 64 * 1024, unknownBytes: 0 },
        { prefix: '(khác)', keys: 3, bytes: 1024, unknownBytes: 1024 }
      ] });
    }
    return json({ ok: false, error: 'không có endpoint ' + p }, 404, false);
  }
  return { fetchMock, calls, books, REG, loadBook };
}

function openAdmin(worker, key) {
  return new Promise((resolve) => {
    const p = page('admin.html', { fetch: worker.fetchMock });
    setTimeout(() => {
      p.doc.querySelector('#inApi').value = BASE;
      p.doc.querySelector('#inKey').value = key;
      p.doc.querySelector('#btnConnect').dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
      setTimeout(() => resolve(p), 500);
    }, 350);
  });
}

(async () => {
  const out = {};
  const w = makeWorker();
  const p = await openAdmin(w, KEY);
  const doc = p.doc, win = p.win;
  const click = (s) => { const e = typeof s === 'string' ? $(doc, s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };

  /* ---------- 1. sườn mới + bộ tab ---------- */
  const tabs = $$(doc, '#tabs button[data-tab]').map(b => b.dataset.tab);
  out.suanMoi = {
    shellAuthed: !!(doc.querySelector('#ashell') && doc.querySelector('#ashell').classList.contains('authed')),
    soTab: tabs.length,
    tap: tabs.join(','),
    khongConQuick: tabs.indexOf('quick') < 0,
    khongConPrivate: tabs.indexOf('private') < 0,
    khongConHelp: tabs.indexOf('help') < 0,
    huyHieu: String($(doc, '#roleBadge') ? $(doc, '#roleBadge').textContent : '').trim(),
    laKho: /khoá/i.test($(doc, '#roleBadge') ? $(doc, '#roleBadge').textContent : '')
  };

  /* ---------- 2. trình soạn chương ---------- */
  click($(doc, '#tb [data-edit="third-person"]'));
  await wait(700);
  const ed = $(doc, '#edBody');
  out.trinhSoan = {
    coEdBody: !!ed,
    coContenteditable: ed ? ed.getAttribute('contenteditable') === 'true' : false,
    soNuotToolbar: $$(doc, '#edToolbar button').length,
    coGachChang: !!$$(doc, '#edToolbar button').find(b => b.dataset.cmd === 'underline'),
    coH2: !!$$(doc, '#edToolbar button').find(b => b.dataset.block === 'h2'),
    coCanhGiua: !!$$(doc, '#edToolbar button').find(b => b.dataset.align === 'center'),
    coChenAnh: !!$$(doc, '#edToolbar button').find(b => b.dataset.img !== undefined),
    nutUpAnh: !!$(doc, '#edImg')
  };
  /* mở chương đầu tiên (CHAP ≥ 0) rồi gõ: đếm từ/ký tự cập nhật + chưa lưu */
  click($$(doc, '#chList .row2')[0]);
  await wait(200);
  ed.innerHTML = '<p>Đoạn đầu tiên.</p>';
  ed.dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(120);
  out.trinhSoan.demTu = String($(doc, '#chStat').textContent || '');
  /* ảnh /api/img/… : trong trình soạn phải render đúng (URL Worker tuyệt đối),
     nhưng khi lưu phải trả về TƯƠNG ĐỐI — nội dung không dính cứng tên miền.
     Đi đúng luồng thật: gõ ảnh → lưu → mở lại chương (openChap viết lại URL). */
  ed.innerHTML = '<p>Hình minh hoạ</p><p><img src="/api/img/1234-abc" alt=""></p>';
  ed.dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(120);
  click('#chSave');
  await wait(120);
  click('#btnSaveCh');
  await wait(500);
  const savedHtml = ((w.books['third-person'] || {}).chapters || []).map(c => c.html).join('');
  out.trinhSoan.anchTrongDuLieu = savedHtml.indexOf('src="/api/img/1234-abc"') >= 0
    ? 'duong-dan-tuong-doi' : (savedHtml.indexOf('cms.test/api/img') >= 0 ? 'DICH-CUNG-TEN-MIEN' : 'khong-thay-anh');
  click($(doc, '#chList .row2.on'));       /* mở lại chương vừa lưu */
  await wait(200);
  out.trinhSoan.anchTrongSoan = String(ed.querySelector('img') ? ed.querySelector('img').getAttribute('src') : '');

  /* ---------- 3. thẻ khóa mật mã ---------- */
  out.khoaTruoc = String($(doc, '#lockState').textContent || '').trim();
  $(doc, '#lockPw').value = 'mat-ma-thu-123';
  $(doc, '#lockPw2').value = 'mat-ma-thu-123';
  click('#btnLock');                    /* lần 1: chỉ vũ trang */
  await wait(120);
  out.khoaT1 = { armed: !!(doc.querySelector('#btnLock') && doc.querySelector('#btnLock').classList.contains('armed')) };
  click('#btnLock');                    /* lần 2: chạy thật */
  await wait(500);
  out.khoaSau = {
    badge: String($(doc, '#lockState').textContent || '').trim(),
    goiDuoc: w.calls.indexOf('POST /api/lock/set') >= 0,
    lockTrenReg: (w.REG.lib.find(n => n.slug === 'third-person') || {}).lock
  };
  /* hai ô không khớp → phải chặn, không gọi Worker */
  const callsBefore = w.calls.length;
  $(doc, '#lockPw').value = 'abc';
  $(doc, '#lockPw2').value = 'xyz';
  click('#btnLock'); click('#btnLock');
  await wait(300);
  out.khoaLoi = {
    khongGoi: w.calls.slice(callsBefore).indexOf('POST /api/lock/set') < 0,
    loi: String($(doc, '#msg').textContent || '').slice(0, 50)
  };

  /* ---------- 4. kiểm kho KV ---------- */
  click('#kvRun');
  await wait(400);
  out.kiemKho = {
    coTile: $$(doc, '#kvAudit .kvtile').length,
    soDongNhom: $$(doc, '#kvAudit .kvtab tbody tr').length,
    nhomDau: String($$(doc, '#kvAudit .kvtab tbody tr td code').map(c => c.textContent).join(',')),
    goiDuoc: w.calls.indexOf('GET /api/admin/kv') >= 0
  };

  /* ---------- 4b. chấm điểm SEO trong tab Bác sĩ dữ liệu ----------
     Quét trước rồi mới chấm: điểm lấy từ dữ liệu vừa đối chiếu 3 nguồn. */
  click('#docRun');
  await wait(1500);
  click('#docSeo');
  await wait(500);
  out.seo = {
    coNut: !!$(doc, '#docSeo') && !!$(doc, '#docSeo').title,
    soTile: $$(doc, '#docTiles .tile').length,
    nhanTile: $$(doc, '#docTiles .tile span').map(e => e.textContent.trim()),
    trungBinh: String(($$(doc, '#docTiles .tile b')[0] || {}).textContent || '').trim(),
    soDong: $$(doc, '#docList .docrow').length,
    coOdiem: $$(doc, '#docList .di.seoscore').length,
    diemDau: String(($$(doc, '#docList .di.seoscore')[0] || {}).textContent || '').trim(),
    /* danh sách xếp THẤP lên cao: ô điểm đầu phải ≤ ô điểm cuối */
    thapLenCao: (() => {
      const ds = $$(doc, '#docList .di.seoscore').map(e => parseInt(e.textContent, 10));
      return ds.length > 1 && ds[0] <= ds[ds.length - 1];
    })(),
    moiDongCoLyDo: $$(doc, '#docList .docrow').every(r =>
      /đủ hết, không có gì để sửa/.test(r.textContent) || r.querySelectorAll('.dt > b').length > 0),
    trangThai: String($(doc, '#docState').textContent || '').trim().replace(/\s+/g, ' ').slice(0, 110),
  };

  /* ---------- 5. nút nguy hiểm xác nhận 2 bước (xoá bộ) ---------- */
  const libBefore = w.REG.lib.length;
  click('#btnDelBook');                 /* lần 1: vũ trang, CHƯA xoá */
  await wait(150);
  out.arm2 = {
    armed: !!(doc.querySelector('#btnDelBook') && doc.querySelector('#btnDelBook').classList.contains('armed')),
    chuaXoa: w.REG.lib.length === libBefore
  };
  click('#btnDelBook');                 /* lần 2: xoá thật */
  await wait(700);
  out.arm2.xoaXong = w.REG.lib.length === libBefore - 1;
  out.arm2.gone = !w.REG.lib.some(x => x.slug === 'third-person');

  out.errors = p.errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  const hard = [];
  if (!out.suanMoi.shellAuthed) hard.push('shell chưa authed');
  if (out.suanMoi.soTab !== 11) hard.push('sai số tab: ' + out.suanMoi.soTab);
  if (!out.suanMoi.khongConQuick || !out.suanMoi.khongConPrivate || !out.suanMoi.khongConHelp) hard.push('còn tab thừa');
  if (!out.suanMoi.laKho) hard.push('huy hiệu chưa chỉ rõ vào bằng khoá');
  if (!out.trinhSoan.coEdBody || !out.trinhSoan.coContenteditable) hard.push('trình soạn chưa có/ chưa contenteditable');
  if (!/từ/.test(out.trinhSoan.demTu)) hard.push('chưa đếm từ: ' + out.trinhSoan.demTu);
  if (out.trinhSoan.anchTrongSoan.indexOf('http') !== 0) hard.push('ảnh trong trình soạn không trỏ về Worker: ' + out.trinhSoan.anchTrongSoan);
  if (out.trinhSoan.anchTrongDuLieu !== 'duong-dan-tuong-doi') hard.push('ảnh lưu sai — phải để đường dẫn tương đối: ' + out.trinhSoan.anchTrongDuLieu);
  if (!out.khoaSau.goiDuoc) hard.push('khóa không gọi /api/lock/set');
  if (!/mật mã/i.test(out.khoaSau.badge)) hard.push('badge khóa chưa đổi: ' + out.khoaSau.badge);
  if (out.khoaLoi.khongGoi === false) hard.push('khóa vẫn gọi Worker dù hai ô không khớp');
  if (!out.kiemKho.goiDuoc) hard.push('kiểm kho không gọi /api/admin/kv');
  if (out.kiemKho.soDongNhom !== 5) hard.push('kiểm kho vẽ sai số nhóm: ' + out.kiemKho.soDongNhom);
  if (!out.arm2.armed) hard.push('lần 1 không vũ trang nút');
  if (!out.arm2.chuaXoa) hard.push('lần 1 đã xoá (sai — phải đợi lần 2)');
  if (!out.arm2.xoaXong || !out.arm2.gone) hard.push('lần 2 chưa xoá bộ');
  if (!out.seo.coNut) hard.push('chưa có nút Chấm điểm SEO');
  if (out.seo.soDong < 1) hard.push('chấm SEO không vẽ dòng nào');
  if (out.seo.coOdiem !== out.seo.soDong) hard.push('mỗi dòng phải có 1 ô điểm: ' + out.seo.coOdiem + '/' + out.seo.soDong);
  if (!/^\d+$/.test(out.seo.diemDau)) hard.push('ô điểm không phải con số: ' + out.seo.diemDau);
  if (!out.seo.thapLenCao) hard.push('danh sách SEO phải xếp từ thấp lên cao');
  if (!out.seo.moiDongCoLyDo) hard.push('có dòng SEO không nêu lý do bị trừ');
  if (out.errors.length) hard.push('có lỗi JS: ' + out.errors.join(' | '));
  if (hard.length) { console.log('TRẮNG: ' + hard.join(' · ')); process.exit(1); }
  console.log('Đen: gương mặt quản trị mới hoạt động đúng.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
