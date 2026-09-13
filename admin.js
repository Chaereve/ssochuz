/* ============================================================================
   chuseoz · trang quản trị — đăng thẳng lên Cloudflare KV (Worker)
   ----------------------------------------------------------------------------
   Không còn GitHub Contents API: không commit, không build, không đợi deploy.
     Lưu truyện  → PUT  /api/registry      (toàn bộ thư viện)
     Lưu chương  → PUT  /api/book/<slug>   (tiêu đề + các chương)
     Đồng bộ     → POST /api/sync          (đọc lại Blogger)
   Nếu chưa nối Worker, admin vẫn mở được nhưng chỉ xem; mọi thay đổi sẽ được
   giữ trong máy (nháp) và có thể Xuất JSON để nạp thủ công.
   ============================================================================ */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var LS = { api: 'cz_kv_api', key: 'cz_kv_key', draft: 'cz_admin_draft', slides: 'cz_admin_slides', dir: 'chuseoz-dir' };
  var API = '', KEY = '', REG = null, BOOK = null, CUR = null, CHAP = -1;
  var BOOKS = {};           /* slug → book (cache) */
  var dirtyMeta = false, dirtyBook = false, dirtySet = false;
  var selected = {};        /* slug → true */

  /* ------------------------------ tiện ích ------------------------------ */
  function toast(msg, kind) {
    var box = $('#toasts'); var el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    if (kind === 'err') el.style.background = 'var(--err)';
    else if (kind === 'ok') el.style.background = 'var(--ok)';
    box.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }
  function msg(text, kind) {
    var m = $('#msg');
    if (!text) { m.className = 'msg'; m.textContent = ''; return; }
    m.className = 'msg show ' + (kind || 'ok'); m.textContent = text;
    clearTimeout(msg._t); msg._t = setTimeout(function () { m.className = 'msg'; }, 6000);
  }
  function msgConn(text, kind) { var m = $('#msgConn'); m.className = 'msg show ' + (kind || 'info'); m.innerHTML = text; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function num(n) { return (n || 0).toLocaleString('vi-VN'); }
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function stCls(s) { return /hoàn thành/i.test(s || '') ? 'done' : /sắp/i.test(s || '') ? 'soon' : 'run'; }
  function textToHtml(t, mode) {
    t = String(t || '').replace(/\r\n/g, '\n').trim();
    if (mode === 'raw') return t;
    var parts = mode === 'br' ? t.split(/\n+/) : t.split(/\n{2,}/);
    return parts.map(function (p) {
      return '<p>' + p.trim().replace(/\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }).filter(function (p) { return p !== '<p></p>'; }).join('\n');
  }
  function words(html) {
    var t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.split(' ').length : 0;
  }

  /* ------------------------------ gọi Worker ------------------------------ */
  function api(path, opt) {
    opt = opt || {};
    if (!API) return Promise.reject(new Error('chưa nối Worker'));
    var headers = {};
    if (opt.body != null) headers['content-type'] = 'application/json';
    if (opt.auth !== false && KEY) headers['x-admin-key'] = KEY;
    return fetch(API + path, {
      method: opt.method || 'GET',
      headers: headers,
      body: opt.body != null ? JSON.stringify(opt.body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) throw new Error(d.error || ('HTTP ' + r.status));
        return d;
      });
    });
  }

  /* ------------------------------ kết nối ------------------------------ */
  function normalizeApi(u) {
    if (window.CZ && window.CZ.normalizeApi) return window.CZ.normalizeApi(u);
    u = String(u || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }
  function setConn(kind, text) {
    var c = $('#chConn'); c.className = 'chip ' + (kind || '');
    $('#chConnTxt').textContent = text;
  }
  function connect() {
    API = normalizeApi($('#inApi').value); KEY = $('#inKey').value.trim();
    if (!API) { msgConn('Nhập URL Worker đã.', 'err'); return; }
    if (!KEY) { msgConn('Nhập ADMIN_KEY đã.', 'err'); return; }
    var btn = $('#btnConnect'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>đang kiểm tra…';
    Promise.all([
      api('/api/health', { auth: false }),
      api('/api/whoami').catch(function () { throw new Error('ADMIN_KEY không đúng (hoặc Worker chưa đặt secret ADMIN_KEY)'); })
    ])
      .then(function (rs) {
        var h = rs[0];
        localStorage.setItem(LS.api, API); localStorage.setItem(LS.key, KEY);
        msgConn('Kết nối OK · <b>' + esc(h.kv ? 'KV sẵn sàng' : 'KV chưa gắn') + '</b> · ' + num(h.books) + ' bộ đã nạp · rev ' + esc(h.regRev || '—'), 'ok');
        openApp();
      })
      .catch(function (e) {
        msgConn('Không nối được: ' + esc(e.message) + '<br><span class="sm">Kiểm tra lại URL Worker, biến <code>CZ_KV</code> và secret <code>ADMIN_KEY</code>.</span>', 'err');
      })
      .then(function () { btn.disabled = false; btn.textContent = 'Kiểm tra & kết nối'; });
  }
  function openApp() {
    $('#scConnect').classList.add('hide');
    $('#scApp').classList.remove('hide');
    $('#btnDisconnect').classList.remove('hide');
    setConn('ok', 'Cloudflare KV');
    loadRegistry().then(function () { refreshHealth(); });
  }
  function disconnect() {
    localStorage.removeItem(LS.key);
    API = ''; KEY = ''; REG = null;
    $('#scConnect').classList.remove('hide'); $('#scApp').classList.add('hide');
    $('#btnDisconnect').classList.add('hide'); setConn('', 'chưa nối');
  }
  function refreshHealth() {
    api('/api/health', { auth: false }).then(function (h) {
      $('#health').innerHTML = [
        ['Worker', esc(API)], ['Phiên bản', esc(h.version || '—')],
        ['Số bộ trong KV', num(h.books)], ['Số bộ trong registry', num(h.novels)],
        ['rev dữ liệu', esc(h.regRev || '—')], ['Ghi gần nhất', esc(h.lastWrite || '—')]
      ].map(function (r) { return '<b>' + r[0] + '</b><span>' + r[1] + '</span>'; }).join('');
      $('#chData').classList.remove('hide');
      $('#chData').className = 'chip ok';
      $('#chDataTxt').textContent = num(h.books) + ' bộ trên KV';
    }).catch(function () {
      $('#chData').className = 'chip err'; $('#chDataTxt').textContent = 'KV lỗi';
    });
  }

  /* ------------------------------ dữ liệu ------------------------------ */
  function loadRegistry(keepDraft) {
    var draft = null;
    if (keepDraft !== false) { try { draft = JSON.parse(localStorage.getItem(LS.draft) || 'null'); } catch (e) {} }
    var fromApi = API ? api('/api/registry').catch(function () { return null; }) : Promise.resolve(null);
    return fromApi.then(function (d) {
      if (d && d.lib) return d;
      return fetch('/data/registry.json').then(function (r) { return r.ok ? r.json() : null; });
    }).then(function (reg) {
      REG = (draft && draft.reg && draft.reg.lib && (!reg || draft.reg.lib.length >= reg.lib.length)) ? draft.reg : reg;
      if (!REG) { msg('Không tải được dữ liệu thư viện.', 'err'); return; }
      if (!(REG.lib || []).length) msg('KV đang trống — bấm “↑ Nạp dữ liệu lên KV”.', 'info');
      fillStatusFilter(); fillQuickBooks(); renderSlides(); renderSched(); renderList();
      $('#chDataTxt').textContent = num((REG.lib || []).length) + ' bộ';
    });
  }
  function bookOf(slug) {
    if (BOOKS[slug]) return Promise.resolve(BOOKS[slug]);
    var p = API ? api('/api/book/' + encodeURIComponent(slug)).catch(function () { return null; }) : Promise.resolve(null);
    return p.then(function (b) {
      if (b && b.chapters) { BOOKS[slug] = b; return b; }
      return fetch('/data/book/' + encodeURIComponent(slug) + '.json').then(function (r) { return r.ok ? r.json() : null; })
        .then(function (s) { if (s) BOOKS[slug] = s; return s; });
    });
  }

  /* ------------------------------ thư viện ------------------------------ */
  function fillStatusFilter() {
    var sts = {};
    (REG.lib || []).forEach(function (n) { if (n.status) sts[n.status] = 1; });
    $('#flStatus').innerHTML = '<option value="">Tất cả</option>' +
      Object.keys(sts).map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
  }
  function fillQuickBooks() {
    var list = (REG.lib || []).slice().sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'vi'); });
    $('#qkBook').innerHTML = list.map(function (n) {
      return '<option value="' + esc(n.slug) + '">' + esc(n.title) + ' — ' + num(n.chapters) + ' chương</option>';
    }).join('');
  }
  function viewsOf(n) { var st = (window.__STATS || {})[n.slug]; return st ? st.views || 0 : 0; }
  function renderList() {
    var q = $('#q').value.trim().toLowerCase(), fst = $('#flStatus').value, sort = $('#fSort').value;
    var arr = (REG.lib || []).slice();
    if (q) arr = arr.filter(function (n) { return [n.title, n.slug, n.author, n.couple].join(' ').toLowerCase().indexOf(q) >= 0; });
    if (fst) arr = arr.filter(function (n) { return n.status === fst; });
    arr.sort(function (a, b) {
      if (sort === 'name') return String(a.title).localeCompare(String(b.title), 'vi');
      if (sort === 'chapters') return (b.chapters || 0) - (a.chapters || 0);
      if (sort === 'views') return viewsOf(b) - viewsOf(a);
      return String(b.updated || '').localeCompare(String(a.updated || ''));
    });
    $('#tb').innerHTML = arr.map(function (n) {
      var st = stCls(n.status);
      return '<tr data-slug="' + esc(n.slug) + '">' +
        '<td><input type="checkbox" data-ck="' + esc(n.slug) + '" style="width:auto"' + (selected[n.slug] ? ' checked' : '') + '></td>' +
        '<td>' + (n.thumb ? '<img class="cv" src="' + esc(n.thumb) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '') + '</td>' +
        '<td><b>' + esc(n.title) + '</b><div class="sm">' + esc(n.author || '') + (n.couple ? ' · ' + esc(n.couple) : '') + '</div></td>' +
        '<td>' + esc(n.countLabel || (num(n.chapters) + ' chương')) + '</td>' +
        '<td><span class="pill ' + st + '">' + esc(n.status || '—') + '</span></td>' +
        '<td class="sm">' + esc(n.updated || '—') + '</td>' +
        '<td><button class="gho" data-edit="' + esc(n.slug) + '">Sửa</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="sm">Không có bộ nào khớp.</td></tr>';
    $('#listInfo').textContent = arr.length + '/' + (REG.lib || []).length + ' bộ';
    $$('#tb [data-edit]').forEach(function (b) { b.addEventListener('click', function () { openEdit(b.dataset.edit); }); });
    $$('#tb [data-ck]').forEach(function (c) {
      c.addEventListener('change', function () {
        if (c.checked) selected[c.dataset.ck] = 1; else delete selected[c.dataset.ck];
        updateBulk();
      });
    });
    if ($('#fSort').value === 'views' && !window.__STATS) loadStats();
  }
  function updateBulk() {
    var n = Object.keys(selected).length;
    $('#bulkArea').classList.toggle('hide', !n);
    $('#selN').textContent = n;
  }

  /* ------------------------------ sửa truyện ------------------------------ */
  function showPane(name) {
    if (name === 'stats') loadStats();
    var panes = ['list', 'quick', 'new', 'edit', 'stats', 'settings', 'help'];
    panes.forEach(function (p) { var el = $('#pane-' + p); if (el) el.classList.toggle('hide', p !== name); });
    $$('#tabs button').forEach(function (b) {
      var t = b.dataset.tab;
      if (t === 'edit') { b.classList.toggle('hide', name !== 'edit'); b.classList.toggle('on', name === 'edit'); return; }
      b.classList.toggle('on', t === name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openEdit(slug) {
    CUR = (REG.lib || []).find(function (n) { return n.slug === slug; });
    if (!CUR) return;
    showPane('edit');
    $('#edHead').textContent = 'Sửa: ' + CUR.title;
    $('#fTitle').value = CUR.title || ''; $('#fSlug').value = CUR.slug || '';
    $('#fAuthor').value = CUR.author || ''; $('#fCouple').value = CUR.couple || '';
    $('#fYear').value = CUR.year || ''; $('#fStatus').value = CUR.status || 'Đang cập nhật';
    $('#fCount').value = CUR.countLabel || ''; $('#fChapters').value = CUR.chapters || 0;
    $('#f18').value = CUR.is18 ? '1' : '0'; $('#fAdapt').value = CUR.adapt || '';
    $('#fAdaptName').value = CUR.adaptName || ''; $('#fUpdated').value = CUR.updated || today();
    $('#fBlog').value = CUR.blog || ''; $('#fPostId').value = CUR.postId || '';
    $('#fThumb').value = CUR.thumb || CUR.slide || ''; $('#fSyn').value = CUR.synFull || CUR.syn || '';
    dirtyMeta = false; markDirty();
    BOOK = null; CHAP = -1;
    $('#chList').innerHTML = '<div class="i sm" style="padding:10px">đang tải chương…</div>';
    bookOf(slug).then(function (b) { BOOK = b || { chapters: [] }; renderChapters(); });
  }
  function markDirty() {
    var d = dirtyMeta || dirtyBook || dirtySet;
    $$('.dirty').forEach(function (el) { el.textContent = d ? '● có thay đổi chưa lưu' : ''; });
  }
  function renderChapters() {
    var ch = (BOOK && BOOK.chapters) || [];
    $('#chN').textContent = ch.length;
    if (!ch.length) { $('#chList').innerHTML = '<div class="i sm" style="padding:10px">bộ này chưa có chương nào</div>'; return; }
    var order = ch.map(function (_, i) { return i; }).reverse();   /* mới nhất lên trên */
    $('#chList').innerHTML = order.map(function (i, pos) {
      var c = ch[i];
      return '<div class="i' + (i === CHAP ? ' on' : '') + '" data-i="' + i + '">' +
        '<span class="n">' + (i + 1) + '</span>' +
        '<span class="t">' + esc(c.t || ('Chương ' + (i + 1))) + '</span>' +
        (pos === 0 ? '<span class="pill soon">mới nhất</span>' : '') +
        '<span class="mv" data-up="' + i + '" title="Đưa lên">↑</span>' +
        '<span class="mv" data-dn="' + i + '" title="Đưa xuống">↓</span>' +
        '<span class="mv" data-go="' + i + '" title="Sửa chương này">✎</span></div>';
    }).join('');
    $$('#chList .i').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('.mv')) return; openChap(+row.dataset.i);
      });
    });
    $$('#chList [data-go]').forEach(function (b) { b.addEventListener('click', function () { openChap(+b.dataset.go); }); });
    $$('#chList [data-up]').forEach(function (b) { b.addEventListener('click', function () { moveChap(+b.dataset.up, -1); }); });
    $$('#chList [data-dn]').forEach(function (b) { b.addEventListener('click', function () { moveChap(+b.dataset.dn, 1); }); });
  }
  function moveChap(i, dir) {
    var ch = BOOK.chapters, j = i + dir;
    if (j < 0 || j >= ch.length) return;
    var t = ch[i]; ch[i] = ch[j]; ch[j] = t;
    dirtyBook = true; markDirty(); renderChapters();
  }
  function openChap(i) {
    var ch = (BOOK && BOOK.chapters) || [];
    if (i < 0 || i >= ch.length) return;
    CHAP = i;
    $('#chHead').textContent = 'Nội dung chương ' + (i + 1) + (i === ch.length - 1 ? ' (cuối — chương mới nhất)' : '');
    $('#chTitle').value = ch[i].t || ''; $('#chBody').value = ch[i].html || '';
    renderChapters();
  }

  /* ------------------------------ lưu ------------------------------ */
  function saveRegistry(okMsg) {
    if (!REG) return Promise.resolve();
    REG.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
    REG.source = { synced: new Date().toISOString(), note: 'sửa từ trang quản trị chuseoz' };
    if (!API) { saveDraft(); msg('Chưa nối Worker — đã lưu nháp trong máy. Dùng “Sao lưu toàn bộ” để xuất JSON.', 'info'); return Promise.resolve(); }
    return api('/api/registry', { method: 'PUT', body: REG }).then(function () {
      dirtyMeta = false; dirtySet = false; markDirty();
      msg(okMsg + ' · ' + new Date().toLocaleTimeString('vi-VN'), 'ok'); toast(okMsg, 'ok');
      refreshHealth(); renderList();
    }).catch(function (e) { msg('Lưu thất bại: ' + e.message, 'err'); toast('Lỗi: ' + e.message, 'err'); });
  }
  function saveBook(okMsg) {
    if (!BOOK || !CUR) return Promise.resolve();
    BOOK.slug = CUR.slug; BOOK.title = CUR.title;
    BOOK.chapters = BOOK.chapters || [];
    if (!API) { saveDraft(); msg('Chưa nối Worker — đã lưu nháp trong máy.', 'info'); return Promise.resolve(); }
    return api('/api/book/' + encodeURIComponent(CUR.slug), { method: 'PUT', body: BOOK })
      .then(function () {
        dirtyBook = false; markDirty();
        msg(okMsg, 'ok'); toast(okMsg, 'ok');
      }).catch(function (e) { msg('Lưu chương thất bại: ' + e.message, 'err'); });
  }
  function saveDraft() {
    try {
      var books = {};
      Object.keys(BOOKS).forEach(function (s) { books[s] = BOOKS[s]; });
      localStorage.setItem(LS.draft, JSON.stringify({ at: Date.now(), reg: REG, books: books }));
    } catch (e) { toast('Nháp quá lớn để lưu trong máy', 'err'); }
  }

  /* ------------------------------ sự kiện UI ------------------------------ */
  $('#btnConnect').addEventListener('click', connect);
  $('#btnGuide').addEventListener('click', function () { $('#guide').classList.toggle('hide'); });
  $('#btnDisconnect').addEventListener('click', disconnect);
  $('#btnView').addEventListener('click', function () { window.open('/', '_blank'); });
  $('#btnDir').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-dir') === 'ctoi' ? '' : 'ctoi';
    document.documentElement.setAttribute('data-dir', cur);
    try { localStorage.setItem(LS.dir, cur); } catch (e) {}
  });
  $('#inKey').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
  $('#inApi').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
  $$('#tabs button').forEach(function (b) { b.addEventListener('click', function () { showPane(b.dataset.tab); }); });

  $('#q').addEventListener('input', renderList);
  $('#flStatus').addEventListener('change', renderList);
  $('#fSort').addEventListener('change', renderList);
  $('#ckAll').addEventListener('change', function () {
    var on = $('#ckAll').checked;
    $$('#tb [data-ck]').forEach(function (c) { c.checked = on; if (on) selected[c.dataset.ck] = 1; else delete selected[c.dataset.ck]; });
    updateBulk();
  });
  $('#bulkClear').addEventListener('click', function () { selected = {}; $('#ckAll').checked = false; renderList(); updateBulk(); });
  $('#bulkApply').addEventListener('click', function () {
    var st = $('#bulkStatus').value; var n = 0;
    Object.keys(selected).forEach(function (s) {
      var it = (REG.lib || []).find(function (x) { return x.slug === s; });
      if (it && st) { it.status = st; n++; }
      it && (it.updated = today());
    });
    if (!n) { toast('Chọn tình trạng mới trước', 'err'); return; }
    saveRegistry('Đã đổi tình trạng ' + n + ' bộ').then(function () { selected = {}; $('#ckAll').checked = false; renderList(); updateBulk(); });
  });
  $('#bulk18').addEventListener('click', function () {
    Object.keys(selected).forEach(function (s) {
      var it = (REG.lib || []).find(function (x) { return x.slug === s; });
      if (it) it.is18 = !it.is18;
    });
    saveRegistry('Đã bật/tắt 18+ cho ' + Object.keys(selected).length + ' bộ').then(function () { selected = {}; renderList(); updateBulk(); });
  });

  /* form sửa */
  $$('#pane-edit input,#pane-edit select,#pane-edit textarea').forEach(function (el) {
    el.addEventListener('input', function () { dirtyMeta = true; markDirty(); });
  });
  $('#btnSaveMeta').addEventListener('click', function () {
    if (!CUR) return;
    var oldSlug = CUR.slug, newSlug = slugify($('#fSlug').value) || oldSlug;
    var b = $('#fBlog').value.trim();
    Object.assign(CUR, {
      title: $('#fTitle').value.trim() || CUR.title, slug: newSlug,
      author: $('#fAuthor').value.trim(), couple: $('#fCouple').value.trim(), year: $('#fYear').value.trim(),
      status: $('#fStatus').value, countLabel: $('#fCount').value.trim(),
      chapters: Math.max(0, parseInt($('#fChapters').value, 10) || 0),
      is18: $('#f18').value === '1', adapt: $('#fAdapt').value, adaptName: $('#fAdaptName').value.trim(),
      thumb: $('#fThumb').value.trim(), slide: $('#fThumb').value.trim(),
      syn: ($('#fSyn').value.trim() || '').slice(0, 220), synFull: $('#fSyn').value.trim(),
      blog: b, postId: $('#fPostId').value.trim(), updated: $('#fUpdated').value.trim() || today()
    });
    if (oldSlug !== newSlug && BOOKS[oldSlug]) { BOOKS[newSlug] = BOOKS[oldSlug]; delete BOOKS[oldSlug]; }
    saveRegistry('Đã lưu thông tin truyện');
  });
  $('#btnSaveBook').addEventListener('click', function () { saveBook('Đã lưu ' + ((BOOK && BOOK.chapters) || []).length + ' chương'); });
  $('#btnDelNovel').addEventListener('click', function () {
    if (!CUR) return;
    if (!confirm('Xoá truyện "' + CUR.title + '" khỏi thư viện (và xoá chương trên KV)?')) return;
    var slug = CUR.slug;
    REG.lib = (REG.lib || []).filter(function (n) { return n.slug !== slug; });
    var p = API ? api('/api/book/' + encodeURIComponent(slug), { method: 'DELETE' }).catch(function () {}) : Promise.resolve();
    p.then(function () { return saveRegistry('Đã xoá truyện'); }).then(function () { showPane('list'); renderList(); });
  });

  /* chương */
  $('#chAdd').addEventListener('click', function () {
    if (!BOOK) return;
    BOOK.chapters = BOOK.chapters || [];
    BOOK.chapters.push({ t: 'Chương ' + (BOOK.chapters.length + 1), html: '' });
    dirtyBook = true; markDirty(); renderChapters(); openChap(BOOK.chapters.length - 1);
  });
  $('#chPaste').addEventListener('click', function () {
    if (!BOOK) return;
    var raw = prompt('Dán nhiều chương. Mỗi chương ngăn bởi một dòng chỉ chứa ---CHAP---\nDòng đầu của mỗi chương nếu bắt đầu bằng "Chương …" sẽ thành tiêu đề.');
    if (!raw || !raw.trim()) return;
    var parts = raw.split(/^\s*---CHAP---\s*$/m).map(function (s) { return s.trim(); }).filter(Boolean);
    var mode = $('#qkMode').value;
    parts.forEach(function (p) {
      var lines = p.split(/\n/);
      var t = null;
      if (/^\s*chương\s*\d+/i.test(lines[0] || '')) { t = lines.shift().trim(); }
      var idx = BOOK.chapters.length + 1;
      BOOK.chapters.push({ t: t || ('Chương ' + idx), html: textToHtml(lines.join('\n'), mode === 'raw' ? 'raw' : 'para') });
    });
    dirtyBook = true; markDirty(); renderChapters();
    toast('Đã thêm ' + parts.length + ' chương — nhớ bấm Lưu chương', 'ok');
  });
  $('#chReload').addEventListener('click', function () {
    if (!CUR) return;
    delete BOOKS[CUR.slug];
    bookOf(CUR.slug).then(function (b) { BOOK = b || { chapters: [] }; renderChapters(); toast('Đã tải lại chương từ KV'); });
  });
  $('#chSave').addEventListener('click', function () { saveBook('Đã lưu chương ' + (CHAP + 1)); });
  $('#chText2Html').addEventListener('click', function () {
    $('#chBody').value = textToHtml($('#chBody').value, 'para'); dirtyBook = true; markDirty();
  });
  $('#chPreview').addEventListener('click', function () {
    var box = $('#chPrev'); box.classList.toggle('hide');
    box.innerHTML = '<b>' + esc($('#chTitle').value) + '</b>' + $('#chBody').value;
  });
  $('#chDel').addEventListener('click', function () {
    if (!BOOK || CHAP < 0) return;
    if (!confirm('Xoá chương ' + (CHAP + 1) + '?')) return;
    BOOK.chapters.splice(CHAP, 1); dirtyBook = true;
    CHAP = Math.min(CHAP, BOOK.chapters.length - 1);
    renderChapters(); if (CHAP >= 0) openChap(CHAP); else { $('#chTitle').value = ''; $('#chBody').value = ''; }
  });
  $('#chTitle').addEventListener('input', function () {
    if (BOOK && CHAP >= 0) { BOOK.chapters[CHAP].t = $('#chTitle').value; dirtyBook = true; markDirty(); renderChapters(); }
  });
  $('#chBody').addEventListener('input', function () {
    if (BOOK && CHAP >= 0) { BOOK.chapters[CHAP].html = $('#chBody').value; dirtyBook = true; markDirty(); }
  });

  /* đăng chương nhanh */
  $('#qkBody').addEventListener('input', function () {
    var w = words(textToHtml(this.value, $('#qkMode').value));
    $('#qkInfo').textContent = this.value.trim() ? (num(w) + ' từ · khoảng ' + Math.max(1, Math.round(w / 200)) + ' phút đọc') : '';
  });
  $('#qkMode').addEventListener('change', function () { $('#qkBody').dispatchEvent(new Event('input')); });
  $('#qkPreview').addEventListener('click', function () {
    var box = $('#qkPrev'); box.classList.toggle('hide');
    box.innerHTML = $('#qkBody').value ? textToHtml($('#qkBody').value, $('#qkMode').value) : '<span class="sm">chưa có nội dung</span>';
  });
  $('#qkClear').addEventListener('click', function () { $('#qkBody').value = ''; $('#qkInfo').textContent = ''; });
  $('#qkPost').addEventListener('click', function () {
    var slug = $('#qkBook').value;
    var body = $('#qkBody').value.trim();
    if (!slug) { toast('Chọn truyện trước', 'err'); return; }
    if (!body) { toast('Dán nội dung chương trước', 'err'); return; }
    if (!API) { toast('Chưa nối Worker — không đăng được', 'err'); return; }
    var btn = $('#qkPost'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>đang đăng…';
    bookOf(slug).then(function (bk) {
      var b = bk || { chapters: [] };
      b.chapters = b.chapters || [];
      var n = b.chapters.length + 1;
      var title = $('#qkTitle').value.trim() || ('Chương ' + n);
      b.chapters.push({ t: title, html: textToHtml(body, $('#qkMode').value) });
      return api('/api/book/' + encodeURIComponent(slug), { method: 'PUT', body: b }).then(function () {
        BOOKS[slug] = b;
        var it = (REG.lib || []).find(function (x) { return x.slug === slug; });
        if (it) {
          it.chapters = b.chapters.length;
          it.updated = today();
          var tot = parseInt(String(it.countLabel || '').split('/')[1], 10) || 0;
          if (tot < b.chapters.length) tot = b.chapters.length;      /* tổng không thể nhỏ hơn số đã đăng */
          it.countLabel = b.chapters.length + '/' + tot;
          if (it.status === 'Sắp ra mắt') it.status = 'Đang cập nhật';
          return saveRegistry('Đã đăng “' + title + '” (' + b.chapters.length + ' chương)');
        }
      });
    }).then(function () {
      $('#qkBody').value = ''; $('#qkTitle').value = ''; $('#qkInfo').textContent = '';
      toast('Đăng xong — người đọc thấy ngay', 'ok');
    }).catch(function (e) { toast('Lỗi: ' + e.message, 'err'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Đăng chương lên KV'; });
  });

  /* lấy chương thẳng từ bài viết Blogger */
  function fetchFromBlogger(mode) {
    var slug = $('#qkBook').value;
    if (!slug) { toast('Chọn truyện trước', 'err'); return; }
    if (!API) { toast('Chưa nối Worker — không lấy được', 'err'); return; }
    var btn = mode === 'replace-last' ? $('#qkFetchReplace') : $('#qkFetch');
    var old = btn.textContent; btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>đang lấy…';
    fetch(API + '/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': KEY, 'x-import-mode': mode || 'append' },
      body: JSON.stringify({ slug: slug, url: $('#qkUrl').value.trim() })
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok || d.ok === false) throw new Error(d.error || ('HTTP ' + r.status)); return d; }); })
      .then(function (d) {
        msg('Đã lấy “' + d.added + '” từ Blogger · bộ này giờ có ' + d.chapters + ' chương', 'ok');
        toast('Đã đăng chương từ Blogger', 'ok');
        delete BOOKS[slug];
        return loadRegistry();
      })
      .catch(function (e) { msg('Lấy từ Blogger lỗi: ' + e.message, 'err'); toast('Lỗi: ' + e.message, 'err'); })
      .then(function () { btn.disabled = false; btn.textContent = old; });
  }
  $('#qkFetch').addEventListener('click', function () { fetchFromBlogger('append'); });
  $('#qkFetchReplace').addEventListener('click', function () { fetchFromBlogger('replace-last'); });

  /* thêm truyện */
  $('#nTitle').addEventListener('input', function () {
    if (!$('#nSlug').dataset.touched) $('#nSlug').value = slugify(this.value);
  });
  $('#nSlug').addEventListener('input', function () { this.dataset.touched = '1'; });
  $('#btnNew').addEventListener('click', function () {
    var title = $('#nTitle').value.trim();
    if (!title) { msg('Nhập tên truyện đã.', 'err'); return; }
    var slug = slugify($('#nSlug').value || title);
    if ((REG.lib || []).some(function (n) { return n.slug === slug; })) { msg('Slug đã tồn tại: ' + slug, 'err'); return; }
    var chapRaw = $('#nChap').value.trim();
    var chapters = chapRaw ? [{ t: 'Chương 1', html: textToHtml(chapRaw, 'para') }] : [];
    var entry = {
      title: title, slug: slug, url: '/truyen/' + slug + '/', author: $('#nAuthor').value.trim(),
      couple: $('#nCouple').value.trim(), year: $('#nYear').value.trim() || String(new Date().getFullYear()),
      status: $('#nStatus').value, adapt: $('#nAdapt').value, adaptName: $('#nAdaptName').value.trim(),
      is18: $('#n18').value === '1', thumb: $('#nThumb').value.trim(), slide: $('#nThumb').value.trim(),
      syn: $('#nSyn').value.trim().slice(0, 220), synFull: $('#nSyn').value.trim(),
      chapters: chapters.length, countLabel: chapters.length ? chapters.length + '/' + chapters.length : '0/—',
      updated: today(), blog: '', postId: ''
    };
    var p = Promise.resolve();
    if (chapters.length && API) p = api('/api/book/' + encodeURIComponent(slug), { method: 'PUT', body: { title: title, slug: slug, author: entry.author, chapters: chapters } });
    p.then(function () {
      REG.lib = REG.lib || []; REG.lib.push(entry);
      return saveRegistry('Đã tạo truyện “' + title + '”');
    }).then(function () {
      ['#nTitle', '#nSlug', '#nAuthor', '#nCouple', '#nYear', '#nThumb', '#nSyn', '#nChap', '#nAdaptName'].forEach(function (s) { $(s).value = ''; });
      $('#nSlug').dataset.touched = ''; fillQuickBooks(); renderList(); showPane('list');
    }).catch(function (e) { msg('Tạo truyện lỗi: ' + e.message, 'err'); });
  });

  /* cài đặt */
  function renderSlides() {
    var cur = ((REG.slides || []).map(function (s) { return s.slug; }));
    var list = (REG.lib || []).filter(function (n) { return (n.chapters || 0) > 0; })
      .sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); });
    $('#slidePick').innerHTML = list.map(function (n) {
      return '<label class="tile" style="display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:600;color:inherit">' +
        '<input type="checkbox" data-slide="' + esc(n.slug) + '" style="width:auto"' + (cur.indexOf(n.slug) >= 0 ? ' checked' : '') + '>' +
        '<span>' + esc(n.title) + '<br><span class="sm">' + esc(n.author || '') + ' · ' + num(n.chapters) + ' chương</span></span></label>';
    }).join('');
  }
  function renderSched() {
    var s = REG.schedule || {};
    $('#sSched').value = (s.items || []).map(function (i) {
      return [i.days, i.title, i.detail || ''].join(' | ');
    }).join('\n');
    $('#sSchedNote').value = s.note || '';
    $('#sGiscusRepo').value = ((REG.settings || {}).giscus || {}).repo || '';
    $('#sGiscusId').value = ((REG.settings || {}).giscus || {}).repoId || '';
  }
  $$('#pane-settings input,#pane-settings textarea').forEach(function (el) {
    el.addEventListener('input', function () { dirtySet = true; markDirty(); });
  });
  $$('#slidePick').forEach(function (el) { el.addEventListener('change', function () { dirtySet = true; markDirty(); }); });
  $('#sSave').addEventListener('click', function () {
    var picks = $$('#slidePick [data-slide]:checked').map(function (c) { return c.dataset.slide; }).slice(0, 6);
    var by = {}; (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
    REG.slides = picks.map(function (s) { return by[s]; }).filter(Boolean).map(function (n) {
      return {
        title: n.title, slug: n.slug, url: n.url || ('/truyen/' + n.slug + '/'), author: n.author, couple: n.couple,
        year: n.year, status: n.status, count: n.countLabel, chapters: n.chapters, is18: n.is18,
        thumb: n.thumb, countLabel: n.countLabel, updated: n.updated, syn: n.syn, adapt: n.adapt, adaptName: n.adaptName,
        synFull: n.synFull, blog: n.blog, postId: n.postId
      };
    });
    var items = $('#sSched').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      return { days: p[0] || '', title: p[1] || '', detail: p[2] || '' };
    });
    REG.schedule = { items: items, note: $('#sSchedNote').value.trim(), source: (REG.schedule || {}).source || 'https://chuseoz.blogspot.com/p/lich-ra-chuong.html', updated: today() };
    REG.settings = Object.assign({}, REG.settings, { giscus: { repo: $('#sGiscusRepo').value.trim(), repoId: $('#sGiscusId').value.trim() } });
    saveRegistry('Đã lưu cài đặt');
  });

  /* đồng bộ / nạp / sao lưu */
  function syncBlogger() {
    if (!API) { msg('Cần nối Worker mới đồng bộ được.', 'err'); return; }
    if (!confirm('Đọc lại trang danh sách + lịch ra chương trên Blogger và ghép vào dữ liệu KV?')) return;
    var b = $('#btnSync'); b.disabled = true; b.innerHTML = '<span class="spin"></span>đang đồng bộ…';
    api('/api/sync', { method: 'POST' }).then(function (r) {
      msg('Đồng bộ xong: ' + r.changed + ' thay đổi · ' + r.cards + ' thẻ truyện · rev ' + r.rev, 'ok');
      toast('Đồng bộ xong', 'ok');
      return loadRegistry();
    }).catch(function (e) { msg('Đồng bộ lỗi: ' + e.message, 'err'); })
      .then(function () { b.disabled = false; b.textContent = '⟳ Đồng bộ từ Blogger'; });
  }
  $('#btnSync').addEventListener('click', syncBlogger);
  $('#setSync').addEventListener('click', syncBlogger);
  function seedKV() {
    if (!API) { msg('Cần nối Worker trước.', 'err'); return; }
    if (!confirm('Nạp TOÀN BỘ registry + các bộ trong repo lên KV?\nDữ liệu đang có trên KV sẽ bị ghi đè.')) return;
    var b = $('#btnSeed'); b.disabled = true; var old = b.textContent;
    fetch('/data/registry.json').then(function (r) { return r.json(); }).then(function (reg) {
      return api('/api/registry', { method: 'PUT', body: reg }).then(function () { return reg; });
    }).then(function (reg) {
      var lib = reg.lib || [], done = 0, fail = [];
      var step = function (i) {
        if (i >= lib.length) {
          msg('Đã nạp ' + done + '/' + lib.length + ' bộ lên KV' + (fail.length ? ' · lỗi: ' + fail.join(', ') : ''), 'ok');
          return loadRegistry().then(function () { refreshHealth(); });
        }
        var n = lib[i];
        b.innerHTML = '<span class="spin"></span>' + (i + 1) + '/' + lib.length;
        return fetch('/data/book/' + encodeURIComponent(n.slug) + '.json')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (bk) {
            if (!bk) { return; }
            return api('/api/book/' + encodeURIComponent(n.slug), { method: 'PUT', body: bk })
              .then(function () { done++; }).catch(function () { fail.push(n.slug); });
          })
          .then(function () { return step(i + 1); });
      };
      return step(0);
    }).catch(function (e) { msg('Nạp lỗi: ' + e.message, 'err'); })
      .then(function () { b.disabled = false; b.textContent = old; });
  }
  $('#btnSeed').addEventListener('click', seedKV);
  $('#setSeed').addEventListener('click', seedKV);
  $('#setHealth').addEventListener('click', refreshHealth);
  function backup() {
    var dump = { _: 'chuseoz-backup', at: new Date().toISOString(), registry: REG, books: {} };
    var lib = (REG.lib || []), i = 0;
    var step = function () {
      if (i >= lib.length) {
        var blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'chuseoz-backup-' + today() + '.json'; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        msg('Đã tải bản sao lưu (' + Object.keys(dump.books).length + ' bộ).', 'ok');
        return;
      }
      var n = lib[i++];
      msg('Đang gom dữ liệu ' + i + '/' + lib.length + '…', 'info');
      return bookOf(n.slug).then(function (bk) { if (bk) dump.books[n.slug] = bk; return step(); });
    };
    step();
  }
  $('#btnBackup').addEventListener('click', backup);
  $('#btnRestore').addEventListener('click', function () { $('#fileRestore').click(); });
  $('#fileRestore').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    if (!confirm('Phục hồi từ "' + f.name + '"? Dữ liệu trên KV sẽ bị ghi đè.')) return;
    f.text().then(function (t) {
      var dump = JSON.parse(t);
      if (!dump.registry) throw new Error('file không đúng định dạng');
      REG = dump.registry; BOOKS = Object.assign({}, dump.books || {});
      return saveRegistry('Đã phục hồi registry').then(function () {
        var slugs = Object.keys(BOOKS), i = 0;
        var step = function () {
          if (i >= slugs.length) { msg('Phục hồi xong ' + slugs.length + ' bộ.', 'ok'); return renderList(); }
          var s = slugs[i++]; msg('Đang phục hồi chương ' + i + '/' + slugs.length + '…', 'info');
          if (!API) return Promise.resolve(step());
          return api('/api/book/' + encodeURIComponent(s), { method: 'PUT', body: BOOKS[s] }).catch(function () {}).then(step);
        };
        return step();
      });
    }).catch(function (err) { msg('Phục hồi lỗi: ' + err.message, 'err'); });
    e.target.value = '';
  });

  /* số liệu */
  function loadStats() {
    if (!REG) { $('#stState').textContent = 'Đang tải dữ liệu thư viện…'; return; }
    $('#stState').innerHTML = '<span class="spin"></span> đang đọc số liệu từ Firebase…';
    window.CZ.stats().then(function (d) {
      var items = (d && d.items) || {};
      window.__STATS = items;
      var keys = Object.keys(items);
      var tv = keys.reduce(function (a, k) { return a + (items[k].views || 0); }, 0);
      var tvv = keys.reduce(function (a, k) { return a + (items[k].votes || 0); }, 0);
      $('#stTiles').innerHTML = [
        ['Bộ có số liệu', num(keys.length)], ['Tổng lượt đọc', num(tv)], ['Tổng bình chọn', num(tvv)]
      ].map(function (r) { return '<div class="tile"><b>' + r[1] + '</b><span>' + r[0] + '</span></div>'; }).join('');
      if (!keys.length) {
        $('#stState').className = 'msg show err';
        $('#stState').innerHTML = 'Chưa đọc được số liệu Firebase (quyền đọc đang chặn). ' +
          'Mở Firebase Console → Firestore → Rules → cho phép <code>read</code> với collection <code>novelData</code> ' +
          '(mẫu ở <code>worker/README.md §5</code>). Web sẽ <b>không hiện số nào</b> cho tới lúc đó.';
        $('#stTb').innerHTML = '';
        return;
      }
      $('#stState').className = 'msg show ok';
      $('#stState').textContent = 'Số liệu thật · nguồn: ' + (d.source || 'firebase') + (d.fetchedAt ? ' · cập nhật ' + d.fetchedAt.slice(0, 16).replace('T', ' ') : '');
      var by = {}; (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
      var rows = keys.map(function (k) { return Object.assign({ _k: k }, items[k]); })
        .sort(function (a, b) { return (b.views || 0) - (a.views || 0); }).slice(0, 60);
      $('#stTb').innerHTML = rows.map(function (r, i) {
        var n = by[r._k] || {};
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(n.title || r._k) + '</b></td><td>' + num(r.views) +
          '</td><td>' + num(r.votes) + '</td><td>' + num(r.chapterCount) + '</td></tr>';
      }).join('');
      renderList();
    });
  }
  $('#stRefresh').addEventListener('click', loadStats);
  $('#stClear').addEventListener('click', function () {
    if (!API) { toast('Cần nối Worker', 'err'); return; }
    api('/api/stats/refresh', { method: 'POST' }).then(function () { toast('Đã xoá cache, đang đọc lại…', 'ok'); loadStats(); })
      .catch(function (e) { toast('Lỗi: ' + e.message, 'err'); });
  });

  /* phím tắt + cảnh báo rời trang */
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!$('#pane-edit').classList.contains('hide')) { if (dirtyBook) saveBook('Đã lưu chương'); else $('#btnSaveMeta').click(); }
      else if (!$('#pane-settings').classList.contains('hide')) $('#sSave').click();
      else saveRegistry('Đã lưu dữ liệu');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q').focus(); return; }
    if (typing) return;
    var map = { '1': 'list', '2': 'quick', '3': 'new', '4': 'stats', '5': 'settings', '6': 'help' };
    if (map[e.key]) showPane(map[e.key]);
  });
  window.addEventListener('beforeunload', function (e) {
    if (dirtyMeta || dirtyBook || dirtySet) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ------------------------------ khởi động ------------------------------ */
  (function boot() {
    try {
      var d = localStorage.getItem(LS.dir); if (d) document.documentElement.setAttribute('data-dir', d);
    } catch (e) {}
    var a = localStorage.getItem(LS.api), k = localStorage.getItem(LS.key);
    if (a) $('#inApi').value = a;
    if (a && k) { API = normalizeApi(a); KEY = k; openApp(); }
    else { setConn('', 'chưa nối'); }
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(LS.draft) || 'null'); } catch (e) {}
    if (draft) msg('Có bản nháp lưu trong máy lúc ' + new Date(draft.at).toLocaleString('vi-VN') + '. Mở Thư viện để xem, hoặc Phục hồi.', 'info');
    window.CZ.registry().then(function (r) {
      if (!REG && r && r.reg) { REG = r.reg; fillStatusFilter(); fillQuickBooks(); renderList(); }
    }).catch(function () {});
  })();
})();
