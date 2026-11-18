/* ============================================================================
   t_chapter_draft.js · CHƯƠNG MỚI LÀ NHÁP, KHÔNG TỰ LÊN SÓNG
   ----------------------------------------------------------------------------
   Lỗi người dùng báo: “tab Chương mặc định set public chương chưa đăng, đáng
   ra là để nháp xong admin chỉnh mới xuất bản”.

   Bài này khoá lại cả 3 tầng của hành vi đó:

     1. LUẬT DÙNG CHUNG (src/shared/schedule.js):
        · status 'draft' ⇒ bị giữ lại (isChapterPending = true)
        · chương không có trường status (dữ liệu cũ) VẪN hiện — không được
          biến việc thêm luật mới thành lỗi “mất chương của người ta”
        · countVisibleChapters bỏ chương nháp

     2. ADMIN (/admin → tab Chương, admin.html + admin-real.js):
        · “+ Thêm” tạo chương với status 'draft' (trước là 'published')
        · ô Trạng thái hiện Nháp + câu giải thích “độc giả CHƯA đọc được”
        · danh sách chương có nhãn Nháp / đếm “· n nháp”
        · “Xuất bản ngay” ghi 1 lượt PUT status 'published' (không bắt lưu 2 lần)

     3. WORKER THẬT (worker/cms.js + KV giả):
        · chương nháp không lọt ra /api/book công khai, /feed.xml, số chương
        · admin vẫn đọc được để sửa
        · trạng thái rác bị chuẩn hoá về trạng thái đang có (không tự ẩn/hiện)

   Chạy: node tests/t_chapter_draft.js
   Điều kiện đạt: errors0 rỗng, thoát mã 0.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bad = [];
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) bad.push(msg); };

/* ---------------------------------------------------------------- 1 · luật */
(async () => {
  const sched = await import(path.join(ROOT, 'src', 'shared', 'schedule.js').replace(/\\/g, '/'));
  const { isChapterPending, countVisibleChapters, chapterStatusLabel, scheduleLabelOf, chapterPendingReason } = sched;

  ok(isChapterPending({ status: 'draft' }) === true, 'draft phải bị coi là CHƯA xuất bản (isChapterPending)');
  ok(chapterPendingReason({ status: 'draft' }) === 'draft', 'lý do giữ chương nháp phải là "draft"');
  ok(isChapterPending({}) === false, 'chương không có trạng thái (dữ liệu cũ) vẫn hiện — không mất chương');
  ok(isChapterPending({ status: 'published' }) === false, 'published vẫn hiện');
  ok(isChapterPending({ status: 'hidden' }) === true, 'hidden vẫn bị giữ');
  ok(isChapterPending({ status: 'scheduled', at: new Date(Date.now() + 3600e3).toISOString() }) === true, 'hẹn giờ tương lai vẫn bị giữ');
  ok(isChapterPending({ status: 'scheduled', at: new Date(Date.now() - 3600e3).toISOString() }) === false, 'hẹn giờ đã qua vẫn hiện');

  const list = [
    { t: 'a', status: 'published' },
    { t: 'b', status: 'draft' },
    { t: 'c', status: 'hidden' },
    { t: 'd', status: 'scheduled', at: new Date(Date.now() + 7200e3).toISOString() },
    { t: 'e' }
  ];
  ok(countVisibleChapters(list) === 2, 'đếm chương đang hiện bỏ nháp/ẩn/hẹn giờ (nhận ' + countVisibleChapters(list) + ')');
  ok(/chưa xuất bản/i.test(chapterStatusLabel('draft') === 'Nháp' ? 'Nháp chưa xuất bản' : chapterStatusLabel('draft')), 'nhãn draft vẫn là Nháp');
  ok(/nháp/i.test(scheduleLabelOf({ status: 'draft' })), 'nhãn danh sách chương nói rõ đang là nháp');

  /* ------------------------------------------------------- 2 · admin (DOM) */
  const BASE = 'https://cms.test';
  const SLUG = 'draft-test-book';
  const EMPTY = 'empty-book';
  const registry = {
    rev: 'r', lib: [
      { slug: SLUG, title: 'Bộ kiểm nháp', chapters: 1, countLabel: '1/1', updated: '2026-11-17', pubStatus: 'published', visibility: 'public' },
      { slug: EMPTY, title: 'Bộ chưa có chương', chapters: 0, countLabel: '0/—', updated: '2026-11-17', pubStatus: 'draft', visibility: 'public' }
    ]
  };
  const KV = {
    registry: JSON.parse(JSON.stringify(registry)),
    books: {
      [SLUG]: { title: 'Bộ kiểm nháp', slug: SLUG, chapters: [{ t: 'Chương 1 · đã đăng', html: '<p>Nội dung đã đăng.</p>', status: 'published' }] },
      [EMPTY]: { title: 'Bộ chưa có chương', slug: EMPTY, chapters: [] }
    },
    comments: [], reports: [], log: [], stats: { items: {}, days: [] }
  };
  const calls = [];
  const resp = (data, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data))
  });
  const fakeFetch = (url, opt = {}) => {
    const p = new URL(String(url), BASE).pathname;
    const method = String((opt && opt.method) || 'GET').toUpperCase();
    let body = opt && opt.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
    calls.push({ p, method, body });
    if (p === '/api/health') return Promise.resolve(resp({ ok: true }));
    if (p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
    if (p === '/api/registry') {
      if (method === 'PUT') { KV.registry = body; return Promise.resolve(resp({ ok: true })); }
      return Promise.resolve(resp(KV.registry));
    }
    if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 1, softCap: 900, hardCap: 1000 }));
    if (p === '/api/admin/comments') return Promise.resolve(resp({ ok: true, comments: [] }));
    if (p === '/api/admin/reports') return Promise.resolve(resp({ ok: true, items: [] }));
    if (p === '/api/admin/stats') return Promise.resolve(resp({ ok: true, items: {}, days: [] }));
    if (p === '/api/admin/log') return Promise.resolve(resp({ ok: true, items: [] }));
    let m = p.match(/^\/api\/book\/([^/]+)\/chapter$/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      const b = KV.books[slug] || (KV.books[slug] = { title: slug, slug, chapters: [] });
      if (method === 'PUT') {
        if (body.remove) b.chapters.splice(body.index, 1);
        else if (body.from !== undefined) { const [x] = b.chapters.splice(body.from, 1); b.chapters.splice(body.to, 0, x); }
        else b.chapters[body.index] = body.chapter;
        return Promise.resolve(resp({ ok: true, index: body.index }));
      }
    }
    m = p.match(/^\/api\/book\/([^/]+)$/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      if (method === 'PUT') { KV.books[slug] = body; return Promise.resolve(resp({ ok: true })); }
      return Promise.resolve(KV.books[slug] ? resp(KV.books[slug]) : resp({ ok: false }, 404));
    }
    return Promise.resolve(resp({ ok: true }));
  };

  const html = R('admin.html').replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, '');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, { url: BASE + '/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.addEventListener('error', (e) => errors.push('window.error: ' + ((e && e.message) || e)));
  w.fetch = fakeFetch;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.eval(R('admin-real.js'));
  const D = w.document;
  const $ = (s) => D.querySelector(s);
  const setVal = (sel, v) => {
    const e = D.getElementById(sel) || $(sel);
    if (!e) throw new Error('không thấy ' + sel);
    e.value = v;
    e.dispatchEvent(new w.Event('input', { bubbles: true }));
    e.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const tick = async (k = 10) => { for (let i = 0; i < k; i++) await sleep(20); };

  await sleep(200);
  setVal('gate-api', BASE);
  setVal('gate-key', 'TEST_DRAFT_KEY');
  $('[data-act="connect"]').click();
  await tick(14);

  const S = w.CZ_MOCKUP.state;
  ok(S.conn === 'online', 'admin nối Worker giả (online)');
  S.selectedBook = SLUG; S.chapterBook = SLUG; S.route = 'chuong';
  w.render();
  $('[data-act="manage-chapters"]').click();
  await tick(12);

  /* 2a · thêm chương mới ⇒ NHÁP */
  const before = calls.filter((c) => /\/chapter$/.test(c.p) && c.method === 'PUT').length;
  $('[data-act="chapter-add"]').click();
  await tick(14);
  const addCall = calls.filter((c) => /\/chapter$/.test(c.p) && c.method === 'PUT').slice(before)[0];
  ok(!!addCall, 'bấm + Thêm có gọi PUT /api/book/<slug>/chapter');
  ok(addCall && addCall.body && addCall.body.chapter && addCall.body.chapter.status === 'draft',
    'CHƯƠNG MỚI phải lưu với status=draft (nhận: ' + (addCall && addCall.body && addCall.body.chapter && addCall.body.chapter.status) + ')');
  const kvCh = (KV.books[SLUG] || {}).chapters || [];
  ok(kvCh.length === 2 && kvCh[1] && kvCh[1].status === 'draft',
    'KV nhận đúng chương mới ở dạng nháp (chapters=' + JSON.stringify(kvCh.map((c) => c && c.status)) + ', add=' + JSON.stringify(addCall && addCall.body) + ')');

  const sel = $('#chapterStatus');
  ok(!!sel && sel.value === 'draft', 'ô Trạng thái chương hiện "Nháp" ngay sau khi thêm (thấy: ' + (sel && sel.value) + ')');
  const hint = $('#chapterStatusHint');
  ok(!!hint && /chưa|CHƯA/.test(hint.textContent || ''), 'có câu giải thích chương nháp chưa hiện ngoài web');
  const listTxt = ($('.ch-list-scroll') || {}).textContent || '';
  ok(/Nháp/.test(listTxt), 'danh sách chương có nhãn Nháp cho chương mới');
  const listHead = Array.from(D.querySelectorAll('.card-hd')).find((h) => /Danh sách chương/.test(h.textContent || ''));
  ok(!!listHead && /nháp/.test((listHead.querySelector('.right') || {}).textContent || ''),
    'tiêu đề danh sách đếm số chương nháp (thấy: ' + (listHead && listHead.textContent) + ')');

  /* 2b · xuất bản ngay = 1 lượt ghi */
  const beforePub = calls.filter((c) => /\/chapter$/.test(c.p) && c.method === 'PUT').length;
  const pubBtn = $('[data-act="publish-chapter"]');
  ok(!!pubBtn, 'có nút "Xuất bản ngay" khi chương đang là nháp');
  if (pubBtn) pubBtn.click();
  await tick(14);
  const pubCalls = calls.filter((c) => /\/chapter$/.test(c.p) && c.method === 'PUT').slice(beforePub);
  ok(pubCalls.length === 1, 'Xuất bản chỉ ghi ĐÚNG 1 lượt KV (nhận ' + pubCalls.length + ')');
  ok(pubCalls[0] && pubCalls[0].body.chapter.status === 'published', 'Xuất bản gửi status=published');
  ok(KV.books[SLUG].chapters[1] && KV.books[SLUG].chapters[1].status === 'published', 'KV chuyển chương sang published');
  ok(!$('[data-act="publish-chapter"]'), 'xuất bản xong thì nút "Xuất bản ngay" biến mất');
  ok(/xuất bản/i.test((($('#chapterStatusHint') || {}).textContent || '')), 'gợi ý trạng thái đổi theo trạng thái mới');

  /* 2d · mở một bộ CHƯA CÓ CHƯƠNG nào ⇒ trạng thái mặc định của chương sắp
     viết phải là Nháp, không phải Xuất bản. */
  {
    const pick = $('[data-role="chapter-book"]');
    ok(!!pick, 'tab Chương có ô chọn bộ');
    if (pick) {
      pick.value = EMPTY;
      pick.dispatchEvent(new w.Event('change', { bubbles: true }));
      $('[data-act="manage-chapters"]').click();
      await tick(14);
      ok(String((w.CZ_MOCKUP.state.chapterBook || '')) === EMPTY, 'đã chuyển sang bộ chưa có chương');
      const selEmpty = $('#chapterStatus');
      ok(!!selEmpty && selEmpty.value === 'draft',
        'bộ 0 chương: trạng thái mặc định là Nháp (thấy: ' + (selEmpty && selEmpty.value) + ')');
    }
  }

  /* 2c · thêm bộ mới: chương đầu cũng phải là nháp */
  S.route = 'them-bo';
  w.render();
  setVal('nb-t', 'Bộ nháp kiểm thử');
  setVal('nb-a', 'Tác giả kiểm thử');
  setVal('nb-slug', 'bo-nhap-kiem-thu');
  setVal('nb-chapter', 'Chương đầu tiên vừa dán vào.');
  const beforeNew = calls.filter((c) => c.p === '/api/book/bo-nhap-kiem-thu' && c.method === 'PUT').length;
  $('[data-act="submit-new"]').click();
  await tick(16);
  const newBook = calls.filter((c) => c.p === '/api/book/bo-nhap-kiem-thu' && c.method === 'PUT').slice(beforeNew)[0];
  ok(!!newBook, 'Tạo bộ mới có PUT /api/book/<slug>');
  ok(newBook && newBook.body && newBook.body.chapters && newBook.body.chapters[0] && newBook.body.chapters[0].status === 'draft',
    'chương đầu của BỘ MỚI cũng là nháp (nhận: ' + (newBook && newBook.body && newBook.body.chapters && newBook.body.chapters[0] && newBook.body.chapters[0].status) + ')');

  ok(errors.length === 0, 'không lỗi JS khi chạy admin.html: ' + errors.slice(0, 2).join(' | '));

  /* ------------------------------------------------------ 3 · worker thật */
  const { default: worker } = await import(path.join(ROOT, 'worker', 'cms.js').replace(/\\/g, '/'));
  class FakeKV {
    constructor() { this.m = new Map(); }
    async get(k, opt) {
      const v = this.m.get(k);
      if (v === undefined) return null;
      if (opt && opt.type === 'json') { try { return JSON.parse(v.value); } catch (e) { return null; } }
      return v.value;
    }
    async getWithMetadata(k, opt) {
      const v = this.m.get(k);
      if (v === undefined) return { value: null, metadata: null };
      return { value: opt && opt.type === 'json' ? JSON.parse(v.value) : v.value, metadata: v.metadata || null };
    }
    async put(k, value, opt) { this.m.set(k, { value: String(value), metadata: (opt && opt.metadata) || null }); }
    async delete(k) { this.m.delete(k); }
    async list({ prefix = '', limit = 1000 } = {}) {
      const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
      return { keys: all.slice(0, limit).map((name) => ({ name })), list_complete: true };
    }
  }
  const kv = new FakeKV();
  const ADMIN = 'khoa-quan-tri-dai-cho-du-24-ky-tu';
  const env = { ADMIN_KEY: ADMIN, CZ_KV: kv, SITE_BASE: 'https://ssochuz.pages.dev', ALLOW_ORIGIN: 'https://web.test' };
  const waits = [];
  const wctx = { waitUntil: (p) => waits.push(Promise.resolve(p)) };
  async function call(method, p, body, headers = {}) {
    const h = Object.assign({ origin: 'https://web.test' }, headers);
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await worker.fetch(new Request('https://cms.test' + p, {
      method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
    }), env, wctx);
    await Promise.all(waits.splice(0));
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    return { status: res.status, body: j, text: txt };
  }
  const ADMH = { 'x-admin-key': ADMIN };

  await kv.put('registry', JSON.stringify({
    rev: 'w', lib: [{ slug: 'wbook', title: 'Sách worker', chapters: 1, countLabel: '1/1', pubStatus: 'published', visibility: 'public' }]
  }));
  await kv.put('book:wbook', JSON.stringify({
    title: 'Sách worker', slug: 'wbook',
    chapters: [{ t: 'Chương 1', html: '<p>đã đăng</p>', status: 'published' }]
  }));

  const add = await call('PUT', '/api/book/wbook/chapter', { index: 1, chapter: { t: 'Chương 2 nháp', html: '<p>chưa xuất bản</p>', status: 'draft' } }, ADMH);
  ok(add.status === 200 && add.body.live === 1 && add.body.pending === 1,
    'worker: chương nháp không tính vào số chương đang hiện (live=' + (add.body && add.body.live) + ', pending=' + (add.body && add.body.pending) + ')');

  const pub = await call('GET', '/api/book/wbook');
  ok(pub.body && pub.body.chapters.length === 1, 'worker: /api/book công khai KHÔNG trả chương nháp (nhận ' + (pub.body && pub.body.chapters.length) + ')');
  ok(pub.body && pub.body.chapters.every((c) => c.status !== 'draft'), 'worker: không chương nháp nào lọt ra công khai');
  ok(pub.body && pub.body.pendingChapters === 1, 'worker: báo pendingChapters cho web biết còn chương chưa lên sóng');

  const admBook = await call('GET', '/api/book/wbook', undefined, ADMH);
  ok(admBook.body && admBook.body.chapters.length === 2, 'worker: admin vẫn thấy đủ 2 chương để sửa');
  const reg = await kv.get('registry', { type: 'json' });
  ok(reg.lib[0].chapters === 1, 'worker: registry đếm số chương đang hiện, bỏ nháp (nhận ' + reg.lib[0].chapters + ')');

  const feed = await call('GET', '/feed.xml?slug=wbook');
  ok((feed.text.match(/<item>/g) || []).length === 1, 'worker: RSS chỉ có chương đã xuất bản');

  const chapter1 = await call('GET', '/api/book/wbook/chapter/1');
  ok(chapter1.status === 200 && /đã đăng/.test(chapter1.text), 'worker: đọc chương 1 công khai vẫn bình thường');

  /* trạng thái rác không được tự đổi chương đang ẩn thành hiện */
  const junk = await call('PUT', '/api/book/wbook/chapter', { index: 1, chapter: { t: 'Chương 2 nháp', html: '<p>sửa</p>', status: 'nhap-lung-tung' } }, ADMH);
  ok(junk.status === 200, 'worker: vẫn lưu được khi trạng thái lạ');
  const afterJunk = JSON.parse((await kv.get('book:wbook')) || '{}');
  ok(afterJunk.chapters[1].status === 'draft', 'worker: trạng thái rác quy về trạng thái đang có (draft), không tự đổi thành published (nhận ' + afterJunk.chapters[1].status + ')');

  /* dữ liệu cũ chưa có trường status vẫn phải hiện */
  await kv.put('book:legacybook', JSON.stringify({ title: 'Cũ', slug: 'legacybook', chapters: [{ t: 'Chương 1', html: '<p>cũ</p>' }] }));
  const reg2 = await kv.get('registry', { type: 'json' });
  reg2.lib.push({ slug: 'legacybook', title: 'Cũ', chapters: 1, countLabel: '1/1', pubStatus: 'published', visibility: 'public' });
  await kv.put('registry', JSON.stringify(reg2));
  const legacyPub = await call('GET', '/api/book/legacybook');
  ok(legacyPub.body && legacyPub.body.chapters.length === 1, 'worker: chương cũ không có status vẫn hiện (không phá dữ liệu đang chạy)');

  /* nhật ký có CẤU TRÚC: trước chỉ {at,text,who} nên tab Nhật ký phải in cùng
     một chuỗi ở 2 cột và luôn “Thành công”. Nay mỗi bản ghi có kind + target. */
  const logArr = JSON.parse((await kv.get('log')) || '[]');
  ok(logArr.length >= 2, 'worker: thao tác ghi có tạo bản ghi nhật ký (nhận ' + logArr.length + ')');
  const chLog = logArr.filter((x) => /lưu chương wbook/.test(x.text || ''))[0];
  ok(chLog && chLog.kind === 'chuong' && chLog.target === 'wbook',
    'worker: nhật ký lưu chương có kind="chuong"/target=slug (nhận ' + JSON.stringify(chLog || null).slice(0, 120) + ')');
  const KINDS = ['chuong', 'bo', 'registry', 'binh-luan', 'bao-loi', 'phieu', 'anh', 'bao-mat', 'he-thong'];
  ok(logArr.every((x) => KINDS.indexOf(x.kind) >= 0), 'worker: kind của mọi bản ghi nằm trong bộ lọc của giao diện (' + JSON.stringify(logArr.map((x) => x.kind)) + ')');
  ok(logArr.every((x) => typeof x.who === 'string' && x.who.length > 0), 'worker: mọi bản ghi có người thực hiện');

  const out = { kiemTra: n, dat: n - bad.length, loi: bad, errors0: bad };
  console.log(JSON.stringify(out, null, 1));
  console.log(bad.length ? 'CÒN ' + bad.length + ' LỖI NHÁP/XUẤT BẢN' : 'Nháp = chưa xuất bản: đạt ' + n + ' kiểm tra');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.log(JSON.stringify({ errors0: ['ngoại lệ: ' + (e && e.stack || e)] }, null, 1));
  process.exit(1);
});
