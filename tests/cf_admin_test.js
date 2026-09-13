/* ============================================================================
   Kiểm thử TRANG QUẢN TRỊ với một Worker giả (giống worker/cms.js thật)
   - sai ADMIN_KEY → phải chặn
   - đúng khoá → mở được thư viện
   - đăng chương nhanh / mở chương từ tệp trên máy / sửa thông tin bộ / thêm bộ /
     đổi tình trạng hàng loạt / lưu slide + lịch + giscus  → đúng dữ liệu gửi lên
   - Firebase bị chặn → KHÔNG hiện số bịa
   - chưa nối Worker vẫn xem được dữ liệu tĩnh (chế độ nháp)
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, read } = require('./mk');

const KEY = 'khoa-quan-tri-dai-cho-du-24-ky-tu';
const BASE = 'https://cms.test';

function makeWorker() {
  const REG = JSON.parse(read('data/registry.json'));
  const books = {};
  const calls = [];
  function loadBook(slug) {
    if (!books[slug]) {
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
    calls.push((opt.method || 'GET') + ' ' + url.replace(BASE, ''));
    if (url.includes('firestore.googleapis.com')) return json({ error: { code: 403 } }, 403, false);
    if (!url.startsWith(BASE)) return json({ ok: false, error: 'không phải Worker' }, 404, false);
    const p = url.slice(BASE.length).split('?')[0];
    const h = opt.headers || {};
    const auth = h['x-admin-key'] === KEY;
    if (p === '/api/health') return json({ ok: true, version: '1.1.0', kv: true, books: Object.keys(books).length, novels: REG.lib.length, regRev: REG.rev, lastWrite: '2026-09-13T03:00:00Z' });
    if (p === '/api/whoami') return auth ? json({ ok: true, role: 'admin' }) : json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
    if (p === '/api/registry' && (opt.method || 'GET') === 'GET') return json(REG);
    if (p === '/api/registry' && opt.method === 'PUT') {
      if (!auth) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
      Object.assign(REG, JSON.parse(opt.body));
      return json({ ok: true, saved: 'now' });
    }
    const m = p.match(/^\/api\/book\/(.+)$/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      if ((opt.method || 'GET') === 'GET') {
        const b = loadBook(slug);
        return b ? json(b) : json({ ok: false, error: 'chưa có' }, 404, false);
      }
      if (opt.method === 'PUT') {
        if (!auth) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
        books[slug] = JSON.parse(opt.body);
        return json({ ok: true });
      }
      if (opt.method === 'DELETE') {
        if (!auth) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
        books[slug] = null;
        return json({ ok: true, deleted: slug });
      }
    }
    if (p === '/api/import') {
      if (!auth) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
      const body = JSON.parse(opt.body);
      const b = loadBook(body.slug) || { title: body.slug, slug: body.slug, chapters: [] };
      b.chapters = b.chapters || [];
      b.chapters.push({ t: 'Chương ' + (b.chapters.length + 1) + ': Từ Blogger', html: '<p>Nội dung lấy từ Blogger.</p>' });
      books[body.slug] = b;
      return json({ ok: true, added: 'Chương ' + b.chapters.length, chapters: b.chapters.length, url: 'https://chuseoz.blogspot.com/x', mode: h['x-import-mode'] || 'append' });
    }
    if (p === '/api/sync') return auth ? json({ ok: true, cards: 62, changed: 3, rev: '2026-09-13 10:00' }) : json({ ok: false, error: 'sai key' }, 401, false);
    if (p === '/api/seed') return auth ? json({ ok: true, books: 62 }) : json({ ok: false, error: 'sai key' }, 401, false);
    if (p === '/api/stats/refresh') return auth ? json({ ok: true, cleared: 'stats' }) : json({ ok: false, error: 'sai key' }, 401, false);
    if (p === '/api/stats') return json({ ok: false, error: 'chưa đọc được số liệu Firebase' }, 503, false);
    return json({ ok: false, error: 'không có endpoint ' + p }, 404, false);
  }
  return { fetchMock, calls, books, REG, loadBook };
}

const $ = (d, s) => d.querySelector(s), $$ = (d, s) => [...d.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms));

async function openAdmin(worker, key) {
  const p = page('admin.html', { fetch: worker.fetchMock });
  await wait(300);
  p.doc.querySelector('#inApi').value = BASE;
  p.doc.querySelector('#inKey').value = key;
  p.doc.querySelector('#btnConnect').dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  await wait(400);
  return p;
}

(async () => {
  const out = {};
  const w = makeWorker();

  /* ---------- 1. sai khoá ---------- */
  const bad = await openAdmin(w, 'khoa-sai');
  out.saiKhoa = {
    appHidden: $(bad.doc, '#scApp').classList.contains('hide'),
    msg: ($(bad.doc, '#msg') || {}).textContent.slice(0, 60),
    errors: bad.errors.slice(0, 3)
  };

  /* ---------- 2. đúng khoá ---------- */
  const p = await openAdmin(w, KEY);
  const doc = p.doc, win = p.win;
  const click = s => { const e = typeof s === 'string' ? $(doc, s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
  out.dungKhoa = {
    appOpen: !$(doc, '#scApp').classList.contains('hide'),
    libCount: ($(doc, '#libCount') || {}).textContent,
    rows: $$(doc, '#tb tbody tr').length,
    chip: ($(doc, '#chipDataTxt') || {}).textContent
  };

  /* ---------- 3. đăng chương nhanh ---------- */
  const slug = 'third-person';
  const before = w.loadBook(slug).chapters.length;
  $(doc, '#qkBook').value = slug;
  $(doc, '#qkTitle').value = 'Khởi Đầu Mới';
  $(doc, '#qkBody').value = 'Đoạn một.\n\nĐoạn hai.';
  click('#qkPub');
  await wait(600);
  const after = (w.books[slug] && w.books[slug].chapters.length) || 0;
  out.dangChuong = {
    truoc: before, sau: after,
    tieuDe: (w.books[slug].chapters[after - 1] || {}).t,
    soChuongReg: (w.REG.lib.find(n => n.slug === slug) || {}).chapters,
    html: (w.books[slug].chapters[after - 1] || {}).html,
    msg: ($(doc, '#msg') || {}).textContent.slice(0, 60)
  };

  /* ---------- 4. mở chương từ tệp trên máy (thay cho luồng Blogger cũ) ---------- */
  const fi = $(doc, '#qkFile');
  const file = new win.File(['Dòng một.\n\nDòng hai.'], 'chuong-10.txt', { type: 'text/plain' });
  Object.defineProperty(fi, 'files', { value: [file], configurable: true });
  fi.dispatchEvent(new win.Event('change', { bubbles: true }));
  await wait(400);
  out.moTep = {
    coNoiDung: $(doc, '#qkBody').value.indexOf('Dòng một') >= 0,
    tieuDe: $(doc, '#qkTitle').value,
    tenTep: ($(doc, '#qkFileName') || {}).textContent,
    kieu: $(doc, '#qkMode').value,
    soChuongSau: w.loadBook(slug).chapters.length
  };

  /* ---------- 5. sửa thông tin bộ ---------- */
  click($(doc, '#tb [data-edit="' + slug + '"]'));
  await wait(500);
  $(doc, '#fTitle').value = 'Third Person (đã sửa)';
  $(doc, '#fStatus').value = 'Hoàn thành';
  $(doc, '#fCount').value = '10/45';
  click('#btnSaveMeta');
  await wait(500);
  const entry = w.REG.lib.find(n => n.slug === slug);
  out.suaBo = { title: entry.title, status: entry.status, countLabel: entry.countLabel };

  /* ---------- 6. sửa/xoá/đổi thứ tự chương ---------- */
  const nCh = $(doc, '#chList').querySelectorAll('.row2').length;
  click($(doc, '#chList .row2 [data-up]'));
  await wait(120);
  click($(doc, '#chList .row2'));
  await wait(160);
  $(doc, '#chTitle').value = 'Chương 1 (sửa tay)';
  click('#chSave');
  await wait(120);
  click('#btnSaveCh');
  await wait(500);
  out.suaChuong = {
    soDong: nCh,
    chuongDaSua: w.loadBook(slug).chapters[10] ? w.loadBook(slug).chapters[10].t : '(không có)',
    msg: ($(doc, '#msg') || {}).textContent.slice(0, 50)
  };

  /* ---------- 7. thêm bộ ---------- */
  click('#btnAdd2'); await wait(80);
  $(doc, '#nTitle').value = 'Bộ Thử Nghiệm';
  $(doc, '#nAuthor').value = 'Tester';
  $(doc, '#nStatus').value = 'Sắp ra mắt';
  click('#btnNew');
  await wait(600);
  out.themBo = {
    coTrongReg: !!w.REG.lib.find(n => n.slug === 'bo-thu-nghiem'),
    soBo: w.REG.lib.length
  };

  /* ---------- 8. đổi tình trạng hàng loạt ---------- */
  const cks = $$(doc, '#tb [data-ck]');
  cks.slice(0, 3).forEach(c => { c.checked = true; c.dispatchEvent(new win.Event('change', { bubbles: true })); });
  $(doc, '#bulkStatus').value = 'Sắp ra mắt';
  click('#btnBulk');
  await wait(500);
  out.doiHangLoat = {
    soChon: ($(doc, '#selCount') || {}).textContent,
    soSapRaMat: w.REG.lib.filter(n => n.status === 'Sắp ra mắt').length
  };

  /* ---------- 9. cài đặt: slide + lịch + giscus ---------- */
  click($$(doc, '#tabs button').find(b => b.dataset.tab === 'settings'));
  await wait(120);
  const firstSlide = $(doc, '#slidePick [data-slide]');
  if (firstSlide) { firstSlide.checked = true; firstSlide.dispatchEvent(new win.Event('change', { bubbles: true })); }
  $(doc, '#sSched').value = 'Thứ 2 | Third Person | chương mới';
  $(doc, '#sSchedNote').value = 'Ghi chú thử';
  $(doc, '#sGiscusRepo').value = 'user/repo';
  $(doc, '#sGiscusId').value = 'R_123';
  click('#sSave');
  await wait(500);
  out.caiDat = {
    soSlide: (w.REG.slides || []).length,
    lich: (w.REG.schedule.items[0] || {}),
    giscus: (w.REG.settings.giscus || {}).repo
  };

  /* ---------- 10. số liệu: Firebase bị chặn → không bịa số ---------- */
  click($$(doc, '#tabs button').find(b => b.dataset.tab === 'stats'));
  await wait(600);
  out.soLieu = {
    trangThai: ($(doc, '#stState') || {}).textContent.slice(0, 70),
    bangRong: ($(doc, '#stTb') || {}).innerHTML === '',
    tiles: ($(doc, '#stTiles') || {}).textContent.slice(0, 40)
  };

  /* ---------- 11. đồng bộ Blogger ---------- */
  click($$(doc, '#tabs button').find(b => b.dataset.tab === 'settings'));
  await wait(100);
  click('#btnSync');
  await wait(200);
  const okBtn = $(doc, '#czOk');
  out.coHopThoaiXacNhan = !!okBtn;
  if (okBtn) { click(okBtn); await wait(500); }
  out.dongBo = ($(doc, '#msg') || {}).textContent.slice(0, 70);

  /* ---------- 12. chưa nối Worker vẫn xem được dữ liệu tĩnh ---------- */
  const off = page('admin.html', { fetch: (url, opt) => {
    url = String(url);
    if (url.startsWith('/data/registry.json')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(read('data/registry.json'))) });
    const m = url.match(/\/data\/book\/([\w.\-]+)\.json/);
    if (m) {
      const f = path.join(__dirname, '..', 'data/book', m[1] + '.json');
      return Promise.resolve(fs.existsSync(f)
        ? { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8'))) }
        : { ok: false, status: 404, json: () => Promise.resolve(null) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  } });
  await wait(700);
  /* mở trang là dùng được ngay: chưa có khoá thì tự mở dữ liệu tĩnh, không bắt bấm gì */
  out.tuMoDuLieuTinh = {
    rowsTruocKhiBam: off.doc.querySelectorAll('#tb tbody tr').length,
    khungKetNoiConHien: !off.doc.querySelector('#scConnect').classList.contains('hide'),
    apiDaDienSan: (off.doc.querySelector('#inApi') || {}).value || ''
  };
  off.doc.querySelector('#btnLocal').dispatchEvent(new off.win.MouseEvent('click', { bubbles: true }));
  await wait(500);
  out.cheDoTinh = {
    rows: off.doc.querySelectorAll('#tb tbody tr').length,
    libCount: (off.doc.querySelector('#libCount') || {}).textContent,
    errors: off.errors.slice(0, 4)
  };

  out.errors = p.errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
