/* ============================================================================
   Kiểm thử TRANG QUẢN TRỊ với một Worker giả (giống worker/cms.js thật)
   - sai ADMIN_KEY → phải chặn
   - đúng khoá → mở được thư viện
   - đăng chương nhanh / mở chương từ tệp trên máy / sửa thông tin bộ / thêm bộ /
     đổi tình trạng hàng loạt / lưu slide + lịch + giscus  → đúng dữ liệu gửi lên
   - KV chưa có lượt đọc nào → KHÔNG hiện số bịa (và báo rõ cách nạp số cũ)
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
  const log = [{ at: '2026-09-14T02:00:00.000Z', who: 'admin-key', text: 'nạp 62 bộ lên KV' }];
  const cmts = {
    'be-my-angel': [
      { id: 'c1', uid: 'u1', name: 'Bạn Đọc A', picture: '', text: 'Chương này hay quá', ch: 5, createdAt: '2026-09-14T01:00:00.000Z' },
      { id: 'c2', uid: 'g:abc', name: 'Khách', picture: '', text: 'Quảng cáo spam', ch: 0, guest: true, createdAt: '2026-09-14T01:05:00.000Z' }
    ]
  };
  function loadBook(slug) {
    if (!books[slug]) {
      const p = path.join(__dirname, '..', 'data/book', slug + '.json');
      books[slug] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    }
    return books[slug];
  }
  /* "Be My Angel" trên KV bị lệch: có 30 chương (bản cũ) trong khi repo có 29 —
     đúng cái bệnh người dùng gặp: sửa file trong repo rồi mà web vẫn hiện 30.
     Bộ nào admin vừa ghi lên KV (putted) thì KV trả bản mới, hết lệch. */
  /* phiếu bầu: khoá giống Worker thật (g: = tài khoản, a: = thiết bị, #ch = theo chương) */
  const voters = {
    'third-person': {
      'a:may-a': { t: '2026-09-10T10:00:00.000Z' },
      'a:may-b#2': { t: '2026-09-11T11:00:00.000Z' },
      'g:abc123#2': { t: '2026-09-12T12:00:00.000Z' },
      'a:may-c#3': { t: '2026-09-13T13:00:00.000Z' }
    }
  };
  function voteKeys(slug) { return Object.keys(voters[slug] || {}); }
  function voteTotals(slug) {
    const ks = voteKeys(slug);
    const chap = {};
    ks.forEach((k) => {
      const m = String(k).match(/#(\d+)$/);
      if (m) chap[m[1]] = (chap[m[1]] || 0) + 1;
    });
    return { book: ks.filter((k) => k.indexOf('#') < 0).length, chap, total: ks.length };
  }
  const reports = [
    { at: new Date(Date.now() - 3600e3).toISOString(), kind: 'Báo lỗi chữ', slug: 'be-my-angel', title: 'Be My Angel', ch: 12, url: 'https://web.test/truyen/be-my-angel/#chuong-12', text: 'Chương 12: “cô áy” viết sai, đúng là “cô ấy”.', who: 'docgia@gmail.com' },
    { at: new Date(Date.now() - 7200e3).toISOString(), kind: 'Báo lỗi chữ', slug: 'third-person', title: 'Third Person', ch: 2, url: 'https://web.test/truyen/third-person/#chuong-2', text: 'Thiếu dấu chấm cuối đoạn 3.', who: 'a:may-abc' }
  ];
  let mail = true;          /* Worker giả: đã cấu hình Resend */
  const putted = new Set();
  function kvBook(slug) {
    if (putted.has(slug)) return books[slug] || null;
    const b = loadBook(slug);
    if (!b) return null;
    if (slug === 'be-my-angel') {
      const c = JSON.parse(JSON.stringify(b));
      c.chapters = c.chapters.concat([{ t: 'Chương ma (bản KV cũ)', html: '<p>cũ</p>' }]);
      return c;
    }
    return b;
  }
  /* Worker thật: ghi 1 bộ xong thì sửa luôn chapters + countLabel trong registry */
  function syncCount(slug) {
    const b = books[slug];
    const n = REG.lib.find((x) => x.slug === slug);
    if (!b || !n || !Array.isArray(b.chapters)) return;
    n.chapters = b.chapters.length;
    n.countLabel = b.chapters.length + '/' + b.chapters.length;
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
    /* file tĩnh trong repo (bác sĩ dữ liệu đọc để đối chiếu) */
    if (!url.startsWith(BASE) && !url.startsWith('http')) {
      const m = String(url).split('?')[0].match(/^\/data\/book\/([\w.\-]+)\.json$/);
      if (m) {
        const f = path.join(__dirname, '..', 'data/book', m[1] + '.json');
        return fs.existsSync(f)
          ? json(JSON.parse(fs.readFileSync(f, 'utf8')))
          : json({ ok: false, error: 'không có file' }, 404, false);
      }
      if (String(url).split('?')[0] === '/data/registry.json') return json(REG);
      return json({ ok: false, error: 'không phải Worker' }, 404, false);
    }
    if (!url.startsWith(BASE)) return json({ ok: false, error: 'không phải Worker' }, 404, false);
    const p = url.slice(BASE.length).split('?')[0];
    const h = opt.headers || {};
    const auth = h['x-admin-key'] === KEY;
    if (p === '/api/health') return json({
      ok: true, version: '1.5.0', kv: true, books: Object.keys(books).length, novels: REG.lib.length,
      regRev: REG.rev, lastWrite: '2026-09-13T03:00:00Z',
      stats: { items: 2, views: 100, votes: 7 },
      auth: { supabase: true, supabaseUrl: 'https://xyz.supabase.co', supabaseHs256: true, google: false, session: true, adminEmails: ['boss@gmail.com'], mail: true }
    });
    if (p === '/api/auth/config') return json({ ok: true, supabase: true, supabaseUrl: 'https://xyz.supabase.co', google: false, session: true, adminEmails: ['boss@gmail.com'], version: '1.5.0' });
    if (p === '/api/recount') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      const fixed = [];
      REG.lib.forEach((n) => {
        const b = kvBook(n.slug);
        if (!b) return;
        const real = (b.chapters || []).length;
        if (Number(n.chapters) !== real || String(n.countLabel) !== real + '/' + real) {
          fixed.push({ slug: n.slug, title: n.title, was: n.chapters, now: real, labelWas: n.countLabel, labelNow: real + '/' + real });
          n.chapters = real; n.countLabel = real + '/' + real;
        }
      });
      log.unshift({ at: new Date().toISOString(), who: 'admin-key', text: 'đếm lại số chương: sửa ' + fixed.length + ' bộ' });
      return json({ ok: true, books: REG.lib.length, novels: REG.lib.length, fixed, missing: [], orphan: [], rev: REG.rev });
    }
    if (p === '/api/admin/comments') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      const out = [];
      Object.keys(cmts).forEach((slug) => cmts[slug].forEach((c) => out.push(Object.assign({ slug }, c))));
      return json({ ok: true, comments: out, count: out.length, slugs: Object.keys(cmts).length });
    }
    if (p === '/api/admin/log') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      return json({ ok: true, items: log, count: log.length });
    }
    if (p === '/api/admin/reports') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      const q = (new URL(url).searchParams.get('q') || '').toLowerCase();
      const items = q ? reports.filter((x) => (x.text + ' ' + (x.title || '')).toLowerCase().indexOf(q) >= 0) : reports;
      return json({ ok: true, items, count: items.length, mail: !!mail });
    }
    if (p === '/api/admin/stats') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      return json({
        ok: true, updatedAt: new Date().toISOString(),
        items: {
          'third-person': { views: 120, viewsDay: 5, viewsWeek: 30, votes: 8, votesWeek: 3, votesMonth: 6, voters: 7, chapVotes: { 2: 5, 3: 3 } },
          'be-my-angel': { views: 80, viewsDay: 2, viewsWeek: 9, votes: 4, votesWeek: 1, votesMonth: 2, voters: 4, chapVotes: { 5: 4 } }
        },
        days: [
          { day: '2026-09-12', views: 40, votes: 3 },
          { day: '2026-09-13', views: 55, votes: 5 },
          { day: '2026-09-14', views: 61, votes: 9 }
        ]
      });
    }
    if (p === '/api/admin/voters') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      const slug = new URL(url).searchParams.get('slug') || '';
      const ks = voteKeys(slug);
      const book = [], chapters = {};
      ks.forEach((k) => {
        const m = String(k).match(/#(\d+)$/);
        const ch = m ? Number(m[1]) : 0;
        const kind = k.startsWith('g:') ? 'user' : k.startsWith('a:') ? 'device' : 'ip';
        const info = { key: k, ch, kind, kindLabel: kind === 'user' ? 'Tài khoản' : kind === 'device' ? 'Thiết bị' : 'Địa chỉ IP',
          id: k.replace(/^[a-z]+:/, '').replace(/#\d+$/, ''), at: (voters[slug][k] || {}).t || '' };
        if (ch) (chapters[ch] || (chapters[ch] = { count: 0, voters: [] })).voters.push(info);
        else book.push(info);
      });
      Object.keys(chapters).forEach((ch) => { chapters[ch].count = chapters[ch].voters.length; });
      const t = voteTotals(slug);
      return json({ ok: true, slug, source: 'kv', total: t.total, counted: t.total, base: 0,
        voters: ks.length, book: { count: book.length, voters: book }, chapters, chapVotes: t.chap });
    }
    if (p === '/api/admin/vote-remove' && opt.method === 'POST') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      const b = JSON.parse(opt.body || '{}');
      const ch = Math.max(0, parseInt(b.ch, 10) || 0);
      let removed = 0;
      (b.keys || []).forEach((k) => {
        if (ch > 0 && !String(k).endsWith('#' + ch)) return;
        if (ch === 0 && String(k).indexOf('#') >= 0) return;
        if (voters[b.slug] && voters[b.slug][k] != null) { delete voters[b.slug][k]; removed++; }
      });
      log.unshift({ at: new Date().toISOString(), who: 'admin-key', text: 'gỡ ' + removed + ' phiếu · ' + b.slug });
      return json({ ok: true, slug: b.slug, ch, removed, total: voteTotals(b.slug).total });
    }
    if (p === '/api/admin/votes/reset' && opt.method === 'POST') {
      if (!auth) return json({ ok: false, error: 'sai key' }, 401, false);
      const b = JSON.parse(opt.body || '{}');
      const ch = b.ch ? Math.max(1, parseInt(b.ch, 10)) : 0;
      let cleared = 0, stories = 0;
      const targets = b.slug ? [b.slug] : Object.keys(voters);
      targets.forEach((s) => {
        const ks = voteKeys(s);
        const n = ks.filter((k) => (ch ? String(k).endsWith('#' + ch) : true)).length;
        if (ch) ks.forEach((k) => { if (String(k).endsWith('#' + ch)) delete voters[s][k]; });
        else voters[s] = {};
        if (n) stories++;
        cleared += n;
      });
      log.unshift({ at: new Date().toISOString(), who: 'admin-key', text: 'reset ' + cleared + ' phiếu' });
      return json({ ok: true, slug: b.slug || '', ch, stories, cleared });
    }
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
        const b = kvBook(slug);
        return b ? json(b) : json({ ok: false, error: 'chưa có' }, 404, false);
      }
      if (opt.method === 'PUT') {
        if (!auth) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
        books[slug] = JSON.parse(opt.body);
        putted.add(slug); syncCount(slug);
        return json({ ok: true, chapters: (books[slug].chapters || []).length });
      }
      if (opt.method === 'DELETE') {
        if (!auth) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
        books[slug] = null;
        return json({ ok: true, deleted: slug });
      }
    }
    const md = p.match(/^\/api\/comments\/([^/]+)\/([^/]+)$/);
    if (md && opt.method === 'DELETE') {
      if (!auth) return json({ ok: false, error: 'cần đăng nhập' }, 401, false);
      const arr = cmts[decodeURIComponent(md[1])] || [];
      const i = arr.findIndex((c) => c.id === decodeURIComponent(md[2]));
      if (i < 0) return json({ ok: false, error: 'không thấy' }, 404, false);
      arr.splice(i, 1);
      log.unshift({ at: new Date().toISOString(), who: 'admin-key', text: 'kiểm duyệt: xoá bình luận ' + md[2] });
      return json({ ok: true, deleted: md[2], count: arr.length, moderated: true });
    }
    if (p === '/api/import') {
      if (!auth) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, 401, false);
      const body = JSON.parse(opt.body);
      const b = loadBook(body.slug) || { title: body.slug, slug: body.slug, chapters: [] };
      b.chapters = b.chapters || [];
      b.chapters.push({ t: 'Chương ' + (b.chapters.length + 1) + ': Từ Blogger', html: '<p>Nội dung lấy từ Blogger.</p>' });
      books[body.slug] = b; putted.add(body.slug); syncCount(body.slug);
      return json({ ok: true, added: 'Chương ' + b.chapters.length, chapters: b.chapters.length, url: 'https://chuseoz.blogspot.com/x', mode: h['x-import-mode'] || 'append' });
    }
    if (p === '/api/sync') return auth ? json({ ok: true, cards: 62, changed: 3, rev: '2026-09-13 10:00' }) : json({ ok: false, error: 'sai key' }, 401, false);
    if (p === '/api/seed') return auth ? json({ ok: true, books: 62 }) : json({ ok: false, error: 'sai key' }, 401, false);
    if (p === '/api/stats/refresh') return auth ? json({ ok: true, cleared: 'stats_cache', flushed: 0 }) : json({ ok: false, error: 'sai key' }, 401, false);
    if (p === '/api/stats') return json({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    if (p === '/api/view' && opt.method === 'POST') return json({ ok: true, counted: true });
    if (p === '/api/vote' && opt.method === 'POST') return json({ ok: true, slug: JSON.parse(opt.body).slug, votes: 1, voted: true });
    if (p === '/api/stats/import-firebase') return auth
      ? json({ ok: false, error: 'chưa đọc được số liệu Firebase: Firestore trả về 403 (đang chặn quyền đọc — mở rules 1 lần rồi bấm lại)' }, 502, false)
      : json({ ok: false, error: 'sai key' }, 401, false);
    return json({ ok: false, error: 'không có endpoint ' + p }, 404, false);
  }
  return { fetchMock, calls, books, REG, loadBook, kvBook, cmts, log, voters, voteKeys, voteTotals, reports };
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

  /* ---------- 10. số liệu: KV trống → không bịa số ---------- */
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

  /* ---------- 12. NGƯỜI ĐỌC THƯỜNG: cổng quản trị phải đóng ---------- */
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
  out.congDong = {
    gateHien: !off.doc.querySelector('#gate').classList.contains('hide'),
    appAn: off.doc.querySelector('#scApp').classList.contains('hide'),
    coNutDangNhap: !!off.doc.querySelector('#gateLogin'),
    aiDuocVao: String((off.doc.querySelector('#gateWho') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 90),
    loi: off.errors.slice(0, 3)
  };
  /* bấm "xem dữ liệu tĩnh" cũng không lọt — không có quyền thì không thấy gì */
  off.doc.querySelector('#btnLocal').dispatchEvent(new off.win.MouseEvent('click', { bubbles: true }));
  await wait(400);
  out.congDongSauBam = {
    appVanAn: off.doc.querySelector('#scApp').classList.contains('hide'),
    rows: off.doc.querySelectorAll('#tb tbody tr').length,
    loi: off.errors.slice(0, 3)
  };

  /* ---------- 13. ĐĂNG NHẬP BẰNG EMAIL QUẢN TRỊ (Supabase) → vào được ---------- */
  /* lấy đúng email đang khai trong cz-config.js — không hardcode để test khỏi cũ */
  const bossEmail = (read('cz-config.js').match(/CZ_ADMIN_EMAILS\s*=\s*\[\s*'([^']+)'/) || [, ''])[1];
  const adminPage = page('admin.html', {
    fetch: w.fetchMock,
    setup(win) {
      /* máy của chủ trang: đã lưu URL Worker + ADMIN_KEY từ lần trước */
      win.localStorage.setItem('cz_kv_api', BASE);
      win.localStorage.setItem('cz_kv_key', KEY);
      win.localStorage.setItem('ssochuz-user', JSON.stringify({
        uid: 'sb-1', email: bossEmail, name: 'Chủ Trang', picture: '',
        exp: Math.floor(Date.now() / 1000) + 3600, provider: 'supabase'
      }));
      win.localStorage.setItem('ssochuz-auth-token', 'phien-gia-lap');
    }
  });
  await wait(500);
  const adoc = adminPage.doc, awin = adminPage.win;
  const aclick = s => { const e = typeof s === 'string' ? $(adoc, s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new awin.MouseEvent('click', { bubbles: true })); return 'ok'; };
  out.dangNhapQuanTri = {
    gateAn: $(adoc, '#gate').classList.contains('hide'),
    appMo: !$(adoc, '#scApp').classList.contains('hide'),
    aiDangNhap: String(($(adoc, '#whoBox') || {}).textContent || '').trim(),
    huyHieuQuanTri: $(adoc, '#roleBadge') && !$(adoc, '#roleBadge').classList.contains('hide'),
    coNutDangXuat: $(adoc, '#btnLogout') && !$(adoc, '#btnLogout').classList.contains('hide'),
    loi: adminPage.errors.slice(0, 3)
  };

  /* ---------- 14. BÁC SĨ DỮ LIỆU: bắt đúng bệnh KV lệch repo ---------- */
  aclick($$(adoc, '#tabs button').find(b => b.dataset.tab === 'doctor'));
  await wait(1600);
  const docRows = $$(adoc, '#docList .docrow');
  const angelRow = docRows.find(r => /be-my-angel/.test(r.textContent));
  out.bacSi = {
    daQuet: ($(adoc, '#docSel') || {}).textContent.slice(0, 60),
    tiles: String(($(adoc, '#docTiles') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 80),
    soVanDe: docRows.length,
    batDuocBeMyAngel: !!angelRow,
    noiDung: angelRow ? String(angelRow.textContent || '').replace(/\s+/g, ' ').slice(0, 180) : '(không thấy)',
    loi: adminPage.errors.slice(0, 3)
  };
  /* đếm lại trên KV → registry phải sửa nhãn cho khớp */
  aclick('#docRecount');
  await wait(900);
  const angel = w.REG.lib.find(n => n.slug === 'be-my-angel');
  out.bacSiDemLai = {
    chapters: angel.chapters, countLabel: angel.countLabel,
    msg: ($(adoc, '#msg') || {}).textContent.slice(0, 70)
  };

  /* ---------- 14b. CHỮA TẬN GỐC: nạp chương từ repo lên KV rồi đếm lại ---------- */
  aclick('#docFixKv');
  await wait(200);
  const okKv = $(adoc, '#czOk');
  out.napRepoCoXacNhan = !!okKv;
  if (okKv) { aclick(okKv); await wait(1400); }
  const kvAngel = w.kvBook('be-my-angel');
  out.napRepoLenKv = {
    chuongTrenKv: kvAngel ? (kvAngel.chapters || []).length : null,
    chuongTrongRepo: (w.loadBook('be-my-angel').chapters || []).length,
    msg: ($(adoc, '#msg') || {}).textContent.slice(0, 90)
  };
  const angel2 = w.REG.lib.find(n => n.slug === 'be-my-angel');
  out.napRepoXongRegistry = { chapters: angel2.chapters, countLabel: angel2.countLabel };

  /* ---------- 15. KIỂM DUYỆT BÌNH LUẬN ---------- */
  aclick($$(adoc, '#tabs button').find(b => b.dataset.tab === 'cmts'));
  await wait(700);
  const modRows = $$(adoc, '#cmList .modrow');
  out.kiemDuyet = {
    soDong: modRows.length,
    tiles: String(($(adoc, '#cmTiles') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 70),
    coChuong: /chương 5/.test((modRows[0] || {}).textContent || ''),
    coNhanKhach: /Khách/.test((modRows[1] || {}).textContent || ''),
    loi: adminPage.errors.slice(0, 3)
  };
  /* lọc theo chữ */
  $(adoc, '#cmQ').value = 'spam';
  $(adoc, '#cmQ').dispatchEvent(new awin.Event('input', { bubbles: true }));
  await wait(150);
  out.kiemDuyetLoc = { soDong: $$(adoc, '#cmList .modrow').length };
  $(adoc, '#cmQ').value = '';
  $(adoc, '#cmQ').dispatchEvent(new awin.Event('input', { bubbles: true }));
  await wait(150);
  /* xoá bình luận khách (có hộp xác nhận) */
  const delBtn = $$(adoc, '#cmList .modrow [data-modd]')[1];
  aclick(delBtn);
  await wait(150);
  const okBtn2 = $(adoc, '#czOk');
  out.kiemDuyetCoXacNhan = !!okBtn2;
  if (okBtn2) { aclick(okBtn2); await wait(500); }
  out.kiemDuyetXoa = {
    conLai: $$(adoc, '#cmList .modrow').length,
    trenWorker: (w.cmts['be-my-angel'] || []).length,
    nhatKy: (w.log[0] || {}).text
  };

  /* ---------- 16. NHẬT KÝ HOẠT ĐỘNG ---------- */
  aclick($$(adoc, '#tabs button').find(b => b.dataset.tab === 'log'));
  await wait(500);
  out.nhatKy = {
    soDong: $$(adoc, '#logList .logrow').length,
    trangThai: ($(adoc, '#logState') || {}).textContent.slice(0, 60),
    dongDau: String(($(adoc, '#logList .logrow') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 80),
    loi: adminPage.errors.slice(0, 3)
  };

  /* ---------- 17. SỐ LIỆU: biểu đồ + phiếu theo chương ---------- */
  aclick($$(adoc, '#tabs button').find(b => b.dataset.tab === 'stats'));
  await wait(700);
  out.soLieuMoi = {
    coBieuDo: !!$(adoc, '#stChart svg'),
    soCot: $$(adoc, '#stChart svg rect').length,
    tiles: String(($(adoc, '#stTiles') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 100),
    chuongThichNhieu: /ch2 \(5\)/.test(String(($(adoc, '#stTb') || {}).textContent || '')),
    trangThai: ($(adoc, '#stState') || {}).textContent.slice(0, 80),
    loi: adminPage.errors.slice(0, 3)
  };

  /* ---------- 18. CẤU HÌNH ĐĂNG NHẬP SUPABASE ---------- */
  aclick($$(adoc, '#tabs button').find(b => b.dataset.tab === 'settings'));
  await wait(300);
  $(adoc, '#aUrl').value = 'https://moinhat.supabase.co';
  $(adoc, '#aKey').value = 'anon-key-thu';
  $(adoc, '#aGoogle').value = '123.apps.googleusercontent.com';
  $(adoc, '#aAdmins').value = 'Boss@Gmail.com , ban2@gmail.com';
  $(adoc, '#aProvider').value = 'supabase';
  aclick('#sSave');
  await wait(600);
  const authSaved = (w.REG.settings || {}).auth || {};
  out.cauHinhDangNhap = {
    url: authSaved.supabaseUrl, key: authSaved.supabaseAnonKey, provider: authSaved.provider,
    emails: authSaved.adminEmails,
    google: authSaved.googleClientId
  };
  /* hỏi Worker xem đã bật Supabase chưa */
  aclick('#aCheck');
  await wait(400);
  out.cauHinhKiemTra = {
    chip: String(($(adoc, '#aState') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 110),
    loi: adminPage.errors.slice(0, 3)
  };

  /* ---------- 19. TAB PHIẾU BẦU: gỡ phiếu từng người + reset ---------- */
  aclick($$(adoc, '#tabs button').find(b => b.dataset.tab === 'votes'));
  $(adoc, '#voBook').value = 'third-person';
  $(adoc, '#voBook').dispatchEvent(new awin.Event('change', { bubbles: true }));
  await wait(700);
  const vGroups = $$(adoc, '#voList .vgroup');
  const vRows = $$(adoc, '#voList .vrow[data-k], #voList label.vrow');
  out.phieuBau = {
    soNhom: vGroups.length,
    soNguoi: $$(adoc, '#voList [data-k]').length,
    tiles: String(($(adoc, '#voTiles') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 80),
    chips: $$(adoc, '#voChap button').length,
    coNhanTaiKhoan: /Tài khoản/.test(String(($(adoc, '#voList') || {}).textContent || '')),
    loi: adminPage.errors.slice(0, 3)
  };
  /* lọc theo chương 2 (chip) */
  const chip2 = $$(adoc, '#voChap button').find(b => b.dataset.ch === '2');
  aclick(chip2);
  await wait(200);
  out.phieuBauLocChuong = {
    soNhom: $$(adoc, '#voList .vgroup').length,
    soNguoi: $$(adoc, '#voList [data-k]').length
  };
  /* tick 1 người ở chương 2 rồi gỡ */
  const firstCk = $$(adoc, '#voList [data-k]')[0];
  const removedKey = firstCk.dataset.k;
  firstCk.checked = true;
  firstCk.dispatchEvent(new awin.Event('change', { bubbles: true }));
  await wait(120);
  out.phieuBauChon = String(($(adoc, '#voSel') || {}).textContent || '');
  aclick('#voRemove');
  await wait(150);
  const okRm = $(adoc, '#czOk');
  out.phieuBauCoXacNhan = !!okRm;
  if (okRm) { aclick(okRm); await wait(800); }
  out.phieuBauGo = {
    daGo: w.voters['third-person'][removedKey] == null,
    conLai: w.voteKeys('third-person').length,
    msg: ($(adoc, '#msg') || {}).textContent.slice(0, 80)
  };
  /* reset toàn bộ phiếu của bộ đang chọn */
  $(adoc, '#rsScope').value = 'one';
  $(adoc, '#rsScope').dispatchEvent(new awin.Event('change', { bubbles: true }));
  aclick('#rsRun');
  await wait(150);
  const okRs = $(adoc, '#czOk');
  if (okRs) { aclick(okRs); await wait(800); }
  out.phieuBauReset = {
    conLai: w.voteKeys('third-person').length,
    soNguoiTrenBang: $$(adoc, '#voList [data-k]').length,
    msg: ($(adoc, '#msg') || {}).textContent.slice(0, 80),
    loi: adminPage.errors.slice(0, 3)
  };

  /* ---------- 20. NHÂN BẢN BỘ + TÌM CHỮ TRONG CHƯƠNG ---------- */
  aclick($$(adoc, '#tabs button').find(b => b.dataset.tab === 'list'));
  await wait(200);
  aclick($(adoc, '#tb [data-edit="be-my-angel"]'));
  await wait(700);
  $(adoc, '#chFind').value = 'chương';
  $(adoc, '#chFind').dispatchEvent(new awin.Event('input', { bubbles: true }));
  await wait(500);
  out.timTrongChuong = {
    soKetQua: $$(adoc, '#chFindRes .findrow').length,
    coToSang: !!$(adoc, '#chFindRes mark'),
    trangThai: ($(adoc, '#chFindStat') || {}).textContent.slice(0, 50),
    loi: adminPage.errors.slice(0, 3)
  };
  const soBoTruoc = w.REG.lib.length;
  aclick('#edDup');
  await wait(150);
  const okDup = $(adoc, '#czOk');
  out.nhanBanCoXacNhan = !!okDup;
  if (okDup) { aclick(okDup); await wait(1200); }
  const dupEntry = w.REG.lib.find(n => /-copy$/.test(n.slug || ''));
  out.nhanBan = {
    themBo: w.REG.lib.length - soBoTruoc,
    slug: dupEntry ? dupEntry.slug : '',
    coChuong: !!(dupEntry && w.books[dupEntry.slug] && (w.books[dupEntry.slug].chapters || []).length),
    loi: adminPage.errors.slice(0, 3)
  };

  /* ---------- 21. TAB BÁO LỖI: xem báo lỗi chữ người đọc gửi ---------- */
  aclick($$(adoc, '#tabs button').find(b => b.dataset.tab === 'reports'));
  await wait(700);
  out.baoLoiAdmin = {
    soDong: $$(adoc, '#rpList .reprow').length,
    tiles: String(($(adoc, '#rpTiles') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 70),
    trangThai: String(($(adoc, '#rpState') || {}).textContent || '').slice(0, 80),
    demTrenTab: String(($(adoc, '#tabRepCt') || {}).textContent || ''),
    coNutMo: $$(adoc, '#rpList a[target="_blank"]').length,
    coNutCopy: $$(adoc, '#rpList [data-repcopy]').length,
    coNutTraLoi: $$(adoc, '#rpList a[href^="mailto:"]').length,
    dongDau: String(($(adoc, '#rpList .reprow') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 90),
    loi: adminPage.errors.slice(0, 3)
  };
  /* lọc theo từ khoá */
  $(adoc, '#rpQ').value = 'cô ấy';
  $(adoc, '#rpQ').dispatchEvent(new awin.Event('input', { bubbles: true }));
  await wait(200);
  out.baoLoiLoc = { soDong: $$(adoc, '#rpList .reprow').length, tiles: String(($(adoc, '#rpTiles') || {}).textContent || '').replace(/\s+/g, ' ').slice(-30) };
  $(adoc, '#rpQ').value = '';
  $(adoc, '#rpQ').dispatchEvent(new awin.Event('input', { bubbles: true }));
  await wait(150);

  out.errors = p.errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
