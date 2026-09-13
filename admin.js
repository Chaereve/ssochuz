/* ============================================================================
   chuseoz · TRANG QUẢN TRỊ (bản viết lại)
   ----------------------------------------------------------------------------
   Cách hoạt động: không đụng tới GitHub. Sửa xong bấm Lưu là ghi thẳng lên
   Cloudflare KV qua Worker, người đọc thấy sau 1–2 giây.
     PUT  /api/registry        ghi toàn bộ dữ liệu thư viện
     PUT  /api/book/<slug>     ghi 1 bộ (tiêu đề + các chương)
     DELETE /api/book/<slug>   xoá 1 bộ
     POST /api/seed            nạp dữ liệu trong repo lên KV
     POST /api/stats/refresh   xoá cache số liệu
   Chưa nối Worker vẫn mở được dữ liệu tĩnh trong repo để xem/sửa nháp, và
   xuất JSON để nạp thủ công.
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = CZ.esc, num = CZ.num, ic = CZ.icon;
  var LS = { api: 'cz_kv_api', key: 'cz_kv_key', draft: 'cz_admin_draft' };

  var API = '', KEY = '', ONLINE = false;
  var REG = null, BOOK = null, CUR = null, CHAP = -1;
  var BOOKS = {};
  var dirty = { meta: false, book: false, set: false };
  var selected = {};

  /* ------------------------------ tiện ích ------------------------------ */
  function toast(msg, kind) {
    var box = $('#toasts'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 2600);
    setTimeout(function () { el.remove(); }, 3100);
  }
  function msg(text, kind) {
    var m = $('#msg');
    if (!text) { m.className = 'msgbar'; m.textContent = ''; return; }
    m.className = 'msgbar show ' + (kind || 'info');
    m.textContent = text;
    clearTimeout(msg._t);
    msg._t = setTimeout(function () { m.className = 'msgbar'; }, 7000);
  }
  function slugify(s) { return CZ.slugify(s); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function textToHtml(t, mode) {
    t = String(t || '').replace(/\r\n/g, '\n').trim();
    if (!t) return '';
    if (mode === 'raw') return t;
    var parts = mode === 'br' ? t.split(/\n+/) : t.split(/\n{2,}/);
    return parts.map(function (p) {
      return '<p>' + p.trim().replace(/\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }).filter(function (p) { return p !== '<p></p>'; }).join('\n');
  }
  function markDirty() {
    var on = dirty.meta || dirty.book || dirty.set;
    $$('.dirty').forEach(function (el) { el.textContent = on ? '● có thay đổi chưa lưu' : ''; });
    $('#dirtyTxt').textContent = on ? '● chưa lưu' : '';
  }

  /* ------------------------------ gọi Worker ---------------------------- */
  function api(path, opt) {
    opt = opt || {};
    if (!API) return Promise.reject(new Error('chưa nối Worker'));
    var headers = {};
    if (opt.body != null) headers['content-type'] = 'application/json';
    if (opt.auth !== false && KEY) headers['x-admin-key'] = KEY;
    if (opt.mode) headers['x-import-mode'] = opt.mode;
    return fetch(API + path, {
      method: opt.method || 'GET', headers: headers, cache: 'no-store',
      body: opt.body != null ? JSON.stringify(opt.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) throw new Error(d.error || ('HTTP ' + r.status));
        return d;
      });
    });
  }
  function setConn(kind, text) {
    var c = $('#chipConn');
    c.className = 'chip ' + (kind || '');
    $('#chipConnTxt').textContent = text;
  }
  function connect() {
    API = CZ.normalizeApi($('#inApi').value);
    KEY = $('#inKey').value.trim();
    if (!API) return msg('Nhập URL Worker đã.', 'err');
    if (!KEY) return msg('Nhập ADMIN_KEY đã.', 'err');
    var b = $('#btnConnect');
    b.disabled = true; b.innerHTML = '<span class="spin"></span> đang kiểm tra…';
    Promise.all([api('/api/health', { auth: false }), api('/api/whoami')])
      .then(function (rs) {
        var h = rs[0];
        try { localStorage.setItem(LS.api, API); localStorage.setItem(LS.key, KEY); } catch (e) {}
        ONLINE = true;
        msg('Kết nối OK · ' + (h.kv ? 'KV sẵn sàng' : 'KV chưa gắn') + ' · ' + num(h.books) + ' bộ trên KV · rev ' + (h.regRev || '—'), 'ok');
        openApp();
      })
      .catch(function (e) {
        ONLINE = false;
        msg('Không nối được: ' + e.message + ' — kiểm tra URL Worker, binding CZ_KV và secret ADMIN_KEY.', 'err');
      })
      .then(function () { b.disabled = false; b.textContent = 'Kiểm tra & kết nối'; });
  }
  function openApp() {
    /* nối được Worker rồi thì giấu hẳn phần thiết lập; chưa nối thì thu gọn lại một dòng */
    $('#scConnect').classList.toggle('hide', ONLINE);
    setSetup(false);
    $('#scApp').classList.remove('hide');
    $('#btnOut').classList.toggle('hide', !ONLINE);   /* chưa nối thì không có gì để ngắt */
    setConn(ONLINE ? 'ok' : 'warn', ONLINE ? 'Cloudflare KV' : 'xem dữ liệu tĩnh');
    loadRegistry().then(function () { renderOverview(); if (ONLINE) health(); });
  }
  function disconnect() {
    try { localStorage.removeItem(LS.key); } catch (e) {}
    API = ''; KEY = ''; ONLINE = false;
    $('#btnOut').classList.add('hide');
    setConn('', 'chưa nối Worker');
    $('#chipData').classList.add('hide');
    location.reload();
  }
  function health() {
    return api('/api/health', { auth: false }).then(function (h) {
      $('#health').innerHTML = [
        ['Worker', esc(API)], ['Phiên bản', esc(h.version || '—')], ['Số bộ trên KV', num(h.books)],
        ['Số bộ trong registry', num(h.novels)], ['rev dữ liệu', esc(h.regRev || '—')],
        ['Ghi gần nhất', esc(h.lastWrite ? String(h.lastWrite).replace('T', ' ').slice(0, 16) : '—')]
      ].map(function (r) { return '<b>' + r[0] + '</b><span>' + r[1] + '</span>'; }).join('');
      var c = $('#chipData');
      c.classList.remove('hide'); c.className = 'chip ok';
      $('#chipDataTxt').textContent = num(h.books) + ' bộ trên KV';
      return h;
    }).catch(function () {
      var c = $('#chipData');
      c.classList.remove('hide'); c.className = 'chip bad';
      $('#chipDataTxt').textContent = 'KV lỗi';
    });
  }

  /* ------------------------------ dữ liệu ------------------------------- */
  function loadRegistry() {
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(LS.draft) || 'null'); } catch (e) {}
    var p = ONLINE
      ? api('/api/registry').catch(function () { return fetch('/data/registry.json').then(function (r) { return r.json(); }); })
      : fetch('/data/registry.json').then(function (r) { return r.json(); });
    return p.then(function (reg) {
      REG = reg || { lib: [] };
      REG.lib = REG.lib || [];
      REG.editorChoice = REG.editorChoice || (REG.settings && REG.settings.editorChoice) || [];
      if (draft && draft.reg && confirm('Có bản nháp trong máy lưu lúc ' +
        new Date(draft.at).toLocaleString('vi-VN') + '.\nDùng bản nháp đó?')) {
        REG = draft.reg; BOOKS = draft.books || {}; dirty.meta = dirty.set = true;
      }
      dirty.meta = dirty.set = false; markDirty();
      renderList(); fillQuickBooks(); renderSlides(); renderSched(); renderSettings(); renderOverview();
      $('#libCount').textContent = num(REG.lib.length);
      return REG;
    });
  }
  function bookOf(slug) {
    if (BOOKS[slug]) return Promise.resolve(BOOKS[slug]);
    var p = ONLINE
      ? api('/api/book/' + encodeURIComponent(slug)).catch(function () { return null; })
      : Promise.resolve(null);
    return p.then(function (b) {
      if (b && b.chapters) { BOOKS[slug] = b; return b; }
      return fetch('/data/book/' + encodeURIComponent(slug) + '.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (s) { BOOKS[slug] = s; return s; });
    });
  }

  /* ------------------------------ thư viện ------------------------------ */
  function fillStatusFilter() {
    var sel = $('#fStatus');
    var vals = ['Tất cả', 'Hoàn thành', 'Đang cập nhật', 'Sắp ra mắt', 'Đang cập nhật hoặc sắp ra mắt'];
    sel.innerHTML = vals.map(function (v) { return '<option>' + v + '</option>'; }).join('');
  }
  function rows() {
    var q = $('#q').value.trim().toLowerCase();
    var st = $('#fStatus').value, sort = $('#fSort').value;
    var l = (REG.lib || []).slice();
    if (q) l = l.filter(function (n) {
      return (n.title || '').toLowerCase().indexOf(q) >= 0 || (n.author || '').toLowerCase().indexOf(q) >= 0 ||
        (n.slug || '').toLowerCase().indexOf(q) >= 0 || (n.couple || '').toLowerCase().indexOf(q) >= 0;
    });
    if (st && st !== 'Tất cả') {
      if (/hoặc/.test(st)) l = l.filter(function (n) { return n.status !== 'Hoàn thành'; });
      else l = l.filter(function (n) { return (n.status || '') === st; });
    }
    if (sort === 'az') l.sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'vi'); });
    else if (sort === 'chap') l.sort(function (a, b) { return (b.chapters || 0) - (a.chapters || 0); });
    else l.sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); });
    return l;
  }
  function renderList() {
    if (!REG) return;
    var tb = $('#tb tbody');
    var l = rows();
    if (OV_FILTER) l = l.filter(function (n) { return OV_FILTER[n.slug]; });
    $('#ovClear').classList.toggle('hide', !OV_FILTER);
    if (!l.length) { tb.innerHTML = '<tr><td colspan="7" class="sm muted">Không có bộ nào khớp.</td></tr>'; return; }
    tb.innerHTML = l.map(function (n) {
      var idx = (REG.lib || []).indexOf(n);
      var ck = selected[n.slug] ? ' checked' : '';
      var slugDisp = n.slug || '<span style="color:#c33">(thiếu slug)</span>';
      return '<tr>' +
        '<td><input type="checkbox" data-ck="' + esc(n.slug) + '" data-idx="' + idx + '"' + ck + ' style="width:auto"></td>' +
        '<td><span class="ttl">' + esc(n.title) + '</span><span class="sub">' + slugDisp + (n.is18 ? ' · 18+' : '') + '</span></td>' +
        '<td><span class="sm">' + esc(n.author || '—') + '</span><br><span class="sub">' + esc(n.couple || '') + '</span></td>' +
        '<td><b>' + num(n.chapters || 0) + '</b><span class="sub"> ' + esc(n.countLabel || '') + '</span></td>' +
        '<td><span class="pill ' + CZ.statusCls(n.status) + '"><span class="d"></span>' + esc(n.status || '—') + '</span></td>' +
        '<td class="sm">' + esc(CZ.dateVN(n.updated)) + '</td>' +
        '<td class="row" style="gap:4px">' +
          '<button class="btn ghost sm" data-edit="' + esc(n.slug) + '" data-idx="' + idx + '">' + ic('edit', 'i-s') + 'Sửa</button>' +
          '<button class="btn ghost sm" data-chap="' + esc(n.slug) + '" data-idx="' + idx + '">' + ic('list', 'i-s') + '</button>' +
          '<button class="btn ghost sm" data-del="' + esc(n.slug) + '" data-idx="' + idx + '" title="Xoá bộ">' + ic('trash', 'i-s') + '</button>' +
        '</td></tr>';
    }).join('');
    $$('#tb [data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(b.dataset.idx,10);
        if (!b.dataset.edit && !isNaN(idx) && REG.lib[idx]) openEditByIdx(idx, 'meta');
        else openEdit(b.dataset.edit, 'meta');
      });
    });
    $$('#tb [data-chap]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(b.dataset.idx,10);
        if (!b.dataset.chap && !isNaN(idx) && REG.lib[idx]) openEditByIdx(idx, 'chap');
        else openEdit(b.dataset.chap, 'chap');
      });
    });
    $$('#tb [data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(b.dataset.idx,10);
        if (!b.dataset.del && !isNaN(idx) && REG.lib[idx]) delBookByIdx(idx);
        else delBook(b.dataset.del);
      });
    });
    $$('#tb [data-ck]').forEach(function (c) {
      c.addEventListener('change', function () {
        if (c.checked) selected[c.dataset.ck] = 1; else delete selected[c.dataset.ck];
        $('#selCount').textContent = Object.keys(selected).length ? Object.keys(selected).length + ' bộ được chọn' : '';
      });
    });
    $('#selCount').textContent = Object.keys(selected).length ? Object.keys(selected).length + ' bộ được chọn' : '';
  }
  /* ------------------------------ tổng quan ----------------------------- */
  function daysSince(d) {
    if (!d) return 9999;
    var t = Date.parse(String(d) + 'T00:00:00');
    if (isNaN(t)) return 9999;
    return Math.round((Date.now() - t) / 86400000);
  }
  function renderOverview() {
    if (!REG) return;
    var lib = REG.lib || [];
    var has = lib.filter(function (n) { return (n.chapters || 0) > 0; }).length;
    var soon = lib.filter(function (n) { return CZ.statusCls(n.status) === 'soon'; }).length;
    var chap = lib.reduce(function (a, n) { return a + (n.chapters || 0); }, 0);
    var eighteen = lib.filter(function (n) { return n.is18; }).length;

    /* những việc nên xem lại — mỗi việc kèm tối đa 6 bộ để bấm vào sửa luôn */
    var picked = {};
    function task(k, title, hint, list) {
      var ids = list.map(function (n) { return n.slug; });
      ids.forEach(function (s) { picked[s] = 1; });
      return { k: k, t: title, d: hint, n: list.length, items: list.slice(0, 6) };
    }
    var tasks = [
      task('nosyn', 'Thiếu mô tả', 'Trang truyện và thẻ ở thư viện sẽ trống phần giới thiệu',
        lib.filter(function (n) { return !String(n.syn || '').trim(); })),
      task('nothumb', 'Thiếu ảnh bìa', 'Thẻ truyện chỉ còn khung giấy có chữ mờ',
        lib.filter(function (n) { return !String(n.thumb || '').trim(); })),
      task('noslug', 'Thiếu slug / tác giả', 'Slug là đường dẫn của bộ, thiếu là không mở được trang truyện',
        lib.filter(function (n) { return !String(n.slug || '').trim() || !String(n.author || '').trim(); })),
      task('nocouple', 'Thiếu couple', 'Dùng cho bộ lọc couple ở thư viện và dải “Cùng couple”',
        lib.filter(function (n) { return !String(n.couple || '').trim(); })),
      task('noyear', 'Thiếu năm', 'Dùng cho bộ lọc năm và dòng thông tin trên thẻ',
        lib.filter(function (n) { return !String(n.year || '').trim(); })),
      task('count', 'Nhãn số chương lệch', 'Nhãn ghi “x/y” nhưng số chương đã đăng không khớp x',
        lib.filter(function (n) {
          var m = String(n.countLabel || '').match(/^(\d+)\s*\/\s*(\d+)$/);
          return m && parseInt(m[1], 10) !== (n.chapters || 0);
        })),
      task('stale', '“Sắp ra mắt” đã lâu', 'Đăng hơn 45 ngày vẫn chưa có chương nào',
        lib.filter(function (n) { return !(n.chapters || 0) && daysSince(n.updated) > 45; }))
    ].filter(function (t) { return t.n > 0; });

    var tiles = [
      { n: lib.length, l: 'Bộ truyện' },
      { n: has, l: 'Đã có chương' },
      { n: soon, l: 'Sắp ra mắt' },
      { n: chap, l: 'Chương đã đăng' },
      { n: eighteen, l: 'Gắn 18+' },
      { n: has, l: 'Đã mở đọc' },
      { n: Object.keys(picked).length, l: 'Thiếu thông tin' }
    ];
    $('#ovTiles').innerHTML = tiles.map(function (t) {
      return '<div class="tile"><b>' + num(t.n) + '</b><span>' + t.l + '</span></div>';
    }).join('');

    $('#ovTasks').innerHTML = tasks.length
      ? '<div class="ovhead">Việc nên xem lại</div>' + tasks.map(function (t) {
        return '<div class="ovtask"><div class="ovrow">' +
          '<span class="ovpill">' + num(t.n) + '</span>' +
          '<span class="ovtt"><b>' + t.t + '</b><span>' + t.d + '</span></span>' +
          '<span class="grow"></span><button class="btn ghost sm" data-ovlist="' + t.k + '">Xem danh sách</button></div>' +
          '<div class="ovchips">' + t.items.map(function (n) {
            var idx = (REG.lib || []).indexOf(n);
            return '<button class="ovchip" data-ovopen="' + esc(n.slug) + '" data-idx="' + idx + '">' + esc(n.title) +
              (t.n > t.items.length ? '' : '') + '</button>';
          }).join('') + (t.n > t.items.length ? '<span class="sm muted">… và ' + (t.n - t.items.length) + ' bộ nữa</span>' : '') +
          '</div></div>';
      }).join('')
      : '<div class="ovhead">Việc nên xem lại</div><div class="empty sm">Dữ liệu đang gọn gàng — không có việc nào cần xử lý.</div>';

    var recent = lib.slice().sort(function (a, b) {
      return String(b.updated || '').localeCompare(String(a.updated || ''));
    }).slice(0, 6);
    $('#ovRecent').innerHTML = recent.map(function (n) {
      var idx = (REG.lib || []).indexOf(n);
      return '<button class="ovrec" data-ovopen="' + esc(n.slug) + '" data-idx="' + idx + '">' +
        '<span class="ovth' + (n.thumb ? ' skel' : '') + '">' +
          (n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
        '<span class="ovtt"><b>' + esc(n.title) + '</b><span>' + esc(n.author || '') + ' · ' + esc(CZ.countText(n)) + '</span></span>' +
        '<span class="ovwhen">' + esc(CZ.dateVN(n.updated)) + '</span></button>';
    }).join('') || '<div class="empty sm">Chưa có bộ nào.</div>';

    $$('#pane-overview [data-ovopen]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(b.dataset.idx,10);
        if (!b.dataset.ovopen && !isNaN(idx)) openEditByIdx(idx, 'meta');
        else openEdit(b.dataset.ovopen, 'meta');
      });
    });
    $$('#pane-overview [data-ovlist]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.ovlist, t = tasks.filter(function (x) { return x.k === k; })[0];
        if (!t) return;
        var ids = {};
        lib.forEach(function (n) {
          var hit = (k === 'nosyn' && !String(n.syn || '').trim()) ||
            (k === 'nothumb' && !String(n.thumb || '').trim()) ||
            (k === 'noslug' && (!String(n.slug || '').trim() || !String(n.author || '').trim())) ||
            (k === 'nocouple' && !String(n.couple || '').trim()) ||
            (k === 'noyear' && !String(n.year || '').trim()) ||
            (k === 'stale' && !(n.chapters || 0) && daysSince(n.updated) > 45) ||
            (k === 'count' && (function () {
              var m = String(n.countLabel || '').match(/^(\d+)\s*\/\s*(\d+)$/);
              return m && parseInt(m[1], 10) !== (n.chapters || 0);
            })()) ||
            false;
          if (hit) ids[n.slug] = 1;
        });
        OV_FILTER = ids;
        show('list');
        renderList();
        msg('Đang lọc ' + num(t.n) + ' bộ theo mục “' + t.t + '”. Bấm “Bỏ lọc” để xem tất cả.', 'info');
        $('#tb').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
  var OV_FILTER = null;
  function fillQuickBooks() {
    var sel = $('#qkBook');
    var cur = sel.value;
    sel.innerHTML = (REG.lib || []).slice().sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'vi'); })
      .filter(function (n) { return n.slug; })
      .map(function (n) { return '<option value="' + esc(n.slug) + '">' + esc(n.title) + ' (' + num(n.chapters || 0) + ' chương)</option>'; }).join('');
    if (cur) sel.value = cur;
  }

  /* ------------------------------ sửa bộ -------------------------------- */
  function show(pane) {
    ['overview', 'list', 'quick', 'new', 'edit', 'settings', 'stats', 'help'].forEach(function (k) {
      var el = $('#pane-' + k);
      if (el) el.classList.toggle('hide', k !== pane);
    });
    $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === pane); });
    $('#tabs button[data-tab="edit"]').classList.toggle('hide', !CUR);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function openEdit(slug, focus) {
    CUR = (REG.lib || []).find(function (n) { return n.slug === slug; });
    if (!CUR) return;
    CUR._oldSlug = CUR.slug;
    show('edit');
    $('#edHead').textContent = 'Sửa: ' + CUR.title;
    $('#edView').href = CZ.storyURL(CUR.slug);
    $('#fTitle').value = CUR.title || ''; $('#fSlug').value = CUR.slug || '';
    $('#fAuthor').value = CUR.author || ''; $('#fCouple').value = CUR.couple || '';
    $('#fYear').value = CUR.year || ''; $('#fStatus').value = CUR.status || 'Đang cập nhật';
    $('#fCount').value = CUR.countLabel || ''; $('#f18').value = CUR.is18 ? '1' : '0';
    $('#fUpdated').value = CUR.updated || today();
    $('#fThumb').value = CUR.thumb || CUR.slide || ''; $('#fSyn').value = CUR.synFull || CUR.syn || '';
    dirty.meta = false; markDirty();
    BOOK = null; CHAP = -1;
    $('#chList').innerHTML = '<div class="row2 sm muted" style="padding:10px">đang tải chương…</div>';
    bookOf(slug).then(function (b) { BOOK = b || { title: CUR.title, slug: slug, chapters: [] }; renderChapters(); });
    if (focus === 'chap') setTimeout(function () { $('#chList').scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
  }
  function openEditByIdx(idx, focus) {
    var n = (REG.lib || [])[idx];
    if (!n) return;
    if (n.slug) return openEdit(n.slug, focus);
    CUR = n;
    CUR._oldSlug = '';
    show('edit');
    $('#edHead').textContent = 'Sửa: ' + CUR.title + ' (thiếu slug)';
    $('#edView').href = '#';
    $('#fTitle').value = CUR.title || ''; $('#fSlug').value = '';
    $('#fAuthor').value = CUR.author || ''; $('#fCouple').value = CUR.couple || '';
    $('#fYear').value = CUR.year || ''; $('#fStatus').value = CUR.status || 'Đang cập nhật';
    $('#fCount').value = CUR.countLabel || ''; $('#f18').value = CUR.is18 ? '1' : '0';
    $('#fUpdated').value = CUR.updated || today();
    $('#fThumb').value = CUR.thumb || CUR.slide || ''; $('#fSyn').value = CUR.synFull || CUR.syn || '';
    dirty.meta = true; markDirty();
    BOOK = null; CHAP = -1;
    $('#chList').innerHTML = '<div class="row2 sm muted" style="padding:10px">bộ này chưa có slug — nhập slug mới rồi bấm Lưu thông tin.</div>';
    if (focus === 'chap') setTimeout(function () { $('#chList').scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
  }
  function renderChapters() {
    var ch = (BOOK && BOOK.chapters) || [];
    $('#chN').textContent = ch.length;
    if (!ch.length) {
      /* bộ chưa có chương: một dòng trống, vẫn bấm được để bắt đầu viết */
    $('#chList').innerHTML = '<div class="row2 sm muted" style="padding:12px 14px">bộ này chưa có chương nào — ' +
      'bấm <b>Thêm chương trống</b> rồi dán nội dung.</div>';
      return;
    }
    var order = ch.map(function (_, i) { return i; });      /* chương 1 ở trên, giống trang đọc */
    $('#chList').innerHTML = order.map(function (i, pos) {
      return '<div class="row2' + (i === CHAP ? ' on' : '') + '" data-i="' + i + '">' +
        '<span class="no">#' + (i + 1) + '</span>' +
        '<span class="nm">' + esc(ch[i].t || ('Chương ' + (i + 1))) + '</span>' +
        '<span class="row" style="gap:0">' + (pos === order.length - 1 ? '<span class="pill soon">mới nhất</span>' : '') +
        '<button class="mv" data-up="' + i + '" title="Đưa lên" aria-label="Đưa lên">' + ic('up', 'i-s') + '</button>' +
        '<button class="mv" data-dn="' + i + '" title="Đưa xuống" aria-label="Đưa xuống">' + ic('down', 'i-s') + '</button>' +
        '<button class="mv" data-go="' + i + '" title="Sửa chương" aria-label="Sửa chương">' + ic('edit', 'i-s') + '</button></span></div>';
    }).join('');
    $$('#chList .row2').forEach(function (r) {
      r.addEventListener('click', function (e) { if (!e.target.closest('.mv')) openChap(+r.dataset.i); });
    });
    $$('#chList [data-up]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); moveChap(+b.dataset.up, -1); }); });
    $$('#chList [data-dn]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); moveChap(+b.dataset.dn, 1); }); });
    $$('#chList [data-go]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); openChap(+b.dataset.go); }); });
  }
  function moveChap(i, dir) {
    var ch = BOOK.chapters, j = i + dir;
    if (j < 0 || j >= ch.length) return;
    var t = ch[i]; ch[i] = ch[j]; ch[j] = t;
    if (CHAP === i) CHAP = j; else if (CHAP === j) CHAP = i;
    dirty.book = true; markDirty(); renderChapters();
  }
  function openChap(i) {
    var ch = (BOOK && BOOK.chapters) || [];
    if (i < 0 || i >= ch.length) return;
    CHAP = i;
    $('#chTitle').value = ch[i].t || '';
    $('#chBody').value = ch[i].html || '';
    $('#chStat').textContent = num(CZ.words(ch[i].html)) + ' từ';
    renderChapters();
  }

  /* ------------------------------ lưu ----------------------------------- */
  function saveMeta() {
    if (!CUR) return Promise.resolve();
    var oldSlug = CUR._oldSlug || CUR.slug;
    var rawSlug = ($('#fSlug').value || '').trim();
    var newSlug = rawSlug ? slugify(rawSlug) : oldSlug;
    if (!newSlug) {
      msg('Slug không được để trống — dùng chữ thường, số và dấu gạch ngang', 'err');
      return Promise.resolve();
    }
    if (newSlug !== oldSlug) {
      if ((REG.lib || []).some(function (n) { return n.slug === newSlug && n !== CUR; })) {
        msg('Slug đã tồn tại: ' + newSlug + ' — chọn slug khác', 'err');
        $('#fSlug').value = oldSlug;
        return Promise.resolve();
      }
    }
    CUR.title = $('#fTitle').value.trim() || CUR.title;
    CUR.slug = newSlug;
    CUR.author = $('#fAuthor').value.trim(); CUR.couple = $('#fCouple').value.trim();
    CUR.year = $('#fYear').value.trim(); CUR.status = $('#fStatus').value;
    CUR.countLabel = $('#fCount').value.trim() || CUR.countLabel;
    CUR.is18 = $('#f18').value === '1';
    CUR.updated = $('#fUpdated').value || today();
    CUR.thumb = $('#fThumb').value.trim(); CUR.slide = CUR.thumb;
    CUR.synFull = $('#fSyn').value.trim(); CUR.syn = CUR.synFull.slice(0, 220);

    var renamePromise = Promise.resolve();
    if (newSlug !== oldSlug) {
      if (BOOKS[oldSlug]) {
        BOOKS[newSlug] = BOOKS[oldSlug];
        delete BOOKS[oldSlug];
      }
      if (BOOK && (BOOK.slug === oldSlug || !BOOK.slug)) BOOK.slug = newSlug;
      if (REG.slides) {
        REG.slides.forEach(function (s) { if (s.slug === oldSlug) s.slug = newSlug; });
      }
      if (REG.editorChoice) {
        REG.editorChoice = REG.editorChoice.map(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl === oldSlug ? newSlug : sl; });
      }
      if (REG.settings && REG.settings.editorChoice) {
        REG.settings.editorChoice = REG.settings.editorChoice.map(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl === oldSlug ? newSlug : sl; });
      }
      if (REG.schedule && REG.schedule.items) {
        REG.schedule.items.forEach(function (it) { if (it.slug === oldSlug) it.slug = newSlug; });
      }
      if (selected[oldSlug]) { selected[newSlug] = 1; delete selected[oldSlug]; }
      if (ONLINE) {
        var bookToMove = BOOKS[newSlug] || BOOK;
        if (bookToMove) {
          bookToMove.slug = newSlug;
          renamePromise = api('/api/book/' + encodeURIComponent(newSlug), { method: 'PUT', body: bookToMove })
            .then(function () {
              return api('/api/book/' + encodeURIComponent(oldSlug), { method: 'DELETE' }).catch(function () {});
            })
            .catch(function (e) { msg('Đổi slug: lỗi khi chuyển chương sang slug mới: ' + e.message, 'err'); });
        } else {
          renamePromise = api('/api/book/' + encodeURIComponent(oldSlug), { method: 'DELETE' }).catch(function () {});
        }
      }
      CUR._oldSlug = newSlug;
    }

    return renamePromise.then(function () {
      return saveRegistry('Đã lưu thông tin “' + CUR.title + '”' + (newSlug !== oldSlug ? ' · slug mới: ' + newSlug : '')).then(function () {
        $('#edHead').textContent = 'Sửa: ' + CUR.title;
        $('#edView').href = CZ.storyURL(CUR.slug);
        $('#fSlug').value = CUR.slug;
        if (newSlug !== oldSlug) {
          renderList(); fillQuickBooks(); renderSlides();
          toast('Đã đổi slug: ' + oldSlug + ' → ' + newSlug, 'ok');
        }
      });
    });
  }
  function saveRegistry(okMsg) {
    if (!REG) return Promise.resolve();
    REG.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
    REG.source = { synced: new Date().toISOString(), note: 'sửa từ trang quản trị chuseoz' };
    if (!ONLINE) {
      saveDraft(); dirty.meta = dirty.set = false; markDirty();
      msg('Chưa nối Worker — đã lưu nháp trong máy. Dùng “Sao lưu toàn bộ” để xuất JSON.', 'info');
      return Promise.resolve();
    }
    return api('/api/registry', { method: 'PUT', body: REG }).then(function () {
      dirty.meta = dirty.set = false; markDirty();
      msg(okMsg + ' · ' + new Date().toLocaleTimeString('vi-VN'), 'ok');
      toast(okMsg, 'ok'); renderList(); fillQuickBooks(); renderSlides(); renderOverview(); health();
    }).catch(function (e) { msg('Lưu thất bại: ' + e.message, 'err'); toast('Lỗi: ' + e.message, 'err'); });
  }
  function saveBook(okMsg) {
    if (!BOOK || !CUR) return Promise.resolve();
    BOOK.slug = CUR.slug; BOOK.title = CUR.title; BOOK.author = CUR.author; BOOK.couple = CUR.couple;
    BOOK.chapters = BOOK.chapters || [];
    CUR.chapters = BOOK.chapters.length;
    var declared = parseInt(String(CUR.countLabel || '').split('/')[1], 10) || 0;
    CUR.countLabel = BOOK.chapters.length + '/' + Math.max(declared, BOOK.chapters.length);
    CUR.count = CUR.countLabel;
    CUR.updated = today();
    if (!ONLINE) {
      saveDraft(); dirty.book = false; markDirty();
      msg('Chưa nối Worker — đã lưu nháp trong máy.', 'info');
      return Promise.resolve();
    }
    return api('/api/book/' + encodeURIComponent(CUR.slug), { method: 'PUT', body: BOOK }).then(function () {
      dirty.book = false; markDirty();
      msg(okMsg, 'ok'); toast(okMsg, 'ok');
      return saveRegistry('Đã cập nhật thư viện');
    }).catch(function (e) { msg('Lưu chương thất bại: ' + e.message, 'err'); toast('Lỗi: ' + e.message, 'err'); });
  }
  function saveDraft() {
    try {
      localStorage.setItem(LS.draft, JSON.stringify({ at: Date.now(), reg: REG, books: BOOKS }));
      // cũng cập nhật cache mà trang chủ đọc, để đổi slug thấy ngay cả khi chưa nối Worker
      try {
        localStorage.setItem('chuseoz-reg', JSON.stringify({ t: Date.now(), v: REG }));
        // clear memo để CZ.lib() đọc lại
        if (window.CZ && CZ._memo) { CZ._memo.reg = null; CZ._setLib(); }
      } catch (e2) {}
      toast('Đã lưu nháp trong máy', 'ok');
    } catch (e) { toast('Nháp quá lớn để lưu trong máy', 'err'); }
  }
  function delBook(slug) {
    var n = (REG.lib || []).find(function (x) { return x.slug === slug; });
    CZ.confirm('Xoá bộ “' + (n ? n.title : slug) + '” khỏi thư viện' + (ONLINE ? ' và trên KV' : ' (chỉ trong bản nháp)') + '?', 'Xoá').then(function (ok) {
      if (!ok) return;
      REG.lib = REG.lib.filter(function (x) { return x.slug !== slug; });
      REG.slides = (REG.slides || []).filter(function (x) { return x.slug !== slug; });
      REG.editorChoice = (REG.editorChoice || []).filter(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl !== slug; });
      if (REG.settings && REG.settings.editorChoice) REG.settings.editorChoice = (REG.settings.editorChoice || []).filter(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl !== slug; });
      delete BOOKS[slug];
      var done = ONLINE ? api('/api/book/' + encodeURIComponent(slug), { method: 'DELETE' }).catch(function () {}) : Promise.resolve();
      done.then(function () { return saveRegistry('Đã xoá “' + (n ? n.title : slug) + '”'); }).then(function () {
        if (CUR && CUR.slug === slug) { CUR = null; show('list'); }
        renderList();
      });
    });
  }
  function delBookByIdx(idx) {
    var n = (REG.lib || [])[idx];
    if (!n) return;
    CZ.confirm('Xoá bộ “' + n.title + '” (thiếu slug) khỏi thư viện?', 'Xoá').then(function (ok) {
      if (!ok) return;
      REG.lib.splice(idx,1);
      if (REG.slides) REG.slides = REG.slides.filter(function (x) { return x !== n && x.slug !== n.slug; });
      if (REG.editorChoice) REG.editorChoice = REG.editorChoice.filter(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl !== n.slug && x !== n; });
      if (REG.settings && REG.settings.editorChoice) REG.settings.editorChoice = REG.settings.editorChoice.filter(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl !== n.slug && x !== n; });
      delete BOOKS[n.slug];
      saveRegistry('Đã xoá “' + n.title + '”').then(function () {
        if (CUR === n) { CUR = null; show('list'); }
        renderList();
      });
    });
  }

  /* ------------------------------ đăng chương --------------------------- */
  function quickPublish() {
    var slug = $('#qkBook').value;
    var n = (REG.lib || []).find(function (x) { return x.slug === slug; });
    if (!n) return toast('Chọn truyện trước', 'err');
    var body = $('#qkBody').value;
    if (!body.trim()) return toast('Chưa có nội dung chương', 'err');
    var b = $('#qkPub'); b.disabled = true; b.innerHTML = '<span class="spin"></span> đang đăng…';
    bookOf(slug).then(function (bk) {
      var book = bk || { title: n.title, slug: slug, author: n.author, couple: n.couple, chapters: [] };
      book.chapters = book.chapters || [];
      var num2 = book.chapters.length + 1;
      var title = $('#qkTitle').value.trim() || ('Chương ' + num2);
      if (!/^\s*(chương|chương\s*\d+)/i.test(title)) title = 'Chương ' + num2 + ': ' + title;
      book.chapters.push({ t: title, html: textToHtml(body, $('#qkMode').value) });
      BOOKS[slug] = book;
      BOOK = book; CUR = n;
      return saveBook('Đã đăng “' + title + '” · bộ này giờ có ' + book.chapters.length + ' chương');
    }).then(function () {
      $('#qkBody').value = ''; $('#qkTitle').value = ''; $('#qkStat').textContent = '0 từ';
      fillQuickBooks(); renderList();
    }).catch(function (e) { msg('Đăng lỗi: ' + e.message, 'err'); })
      .then(function () { b.disabled = false; b.textContent = 'Đăng chương'; });
  }
  /* ------------------------------ thêm bộ ------------------------------- */
  function addBook() {
    var title = $('#nTitle').value.trim();
    if (!title) return msg('Nhập tên truyện đã.', 'err');
    var slug = slugify($('#nSlug').value || title);
    if ((REG.lib || []).some(function (n) { return n.slug === slug; })) return msg('Slug đã tồn tại: ' + slug, 'err');
    var chapRaw = $('#nChap').value.trim();
    var chapters = chapRaw ? [{ t: 'Chương 1', html: textToHtml(chapRaw, 'para') }] : [];
    var entry = {
      title: title, slug: slug, author: $('#nAuthor').value.trim(),
      couple: $('#nCouple').value.trim(), year: $('#nYear').value.trim() || String(new Date().getFullYear()),
      status: $('#nStatus').value,
      is18: $('#n18').value === '1', thumb: $('#nThumb').value.trim(), slide: $('#nThumb').value.trim(),
      syn: $('#nSyn').value.trim().slice(0, 220), synFull: $('#nSyn').value.trim(),
      chapters: chapters.length, countLabel: chapters.length ? chapters.length + '/' + chapters.length : '0/—',
      updated: today()
    };
    var p = Promise.resolve();
    if (chapters.length) {
      var bk = { title: title, slug: slug, author: entry.author, couple: entry.couple, chapters: chapters };
      BOOKS[slug] = bk;
      p = ONLINE ? api('/api/book/' + encodeURIComponent(slug), { method: 'PUT', body: bk })
        .catch(function (e) { throw new Error('ghi chương: ' + e.message); }) : Promise.resolve();
    }
    p.then(function () {
      REG.lib.push(entry);
      return saveRegistry('Đã tạo truyện “' + title + '”');
    }).then(function () {
      ['#nTitle', '#nSlug', '#nAuthor', '#nCouple', '#nYear', '#nThumb', '#nSyn', '#nChap'].forEach(function (s) { $(s).value = ''; });
      renderList(); fillQuickBooks(); show('list');
    }).catch(function (e) { msg('Tạo truyện lỗi: ' + e.message, 'err'); });
  }

  /* ------------------------------ cài đặt ------------------------------- */
  /* danh sách truyện đang chọn cho khối hero: đúng thứ tự, có ảnh bìa, sửa được ngay */
  function slidePicks() {
    return (REG.slides || []).map(function (s) { return s.slug; }).filter(Boolean);
  }
  function editPicks() {
    var raw = REG.editorChoice || (REG.settings && REG.settings.editorChoice) || [];
    return raw.map(function (x) { return typeof x === 'string' ? x : (x && x.slug); }).filter(Boolean);
  }
  function renderSlides() {
    var picks = slidePicks();
    var by = {};
    (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
    $('#slidePick').innerHTML = picks.length
      ? picks.map(function (slug, i) {
        var n = by[slug] || {};
        return '<div class="hprow" data-slug="' + esc(slug) + '">' +
          '<span class="hpno">' + (i + 1) + '</span>' +
          '<span class="hpth' + (n.thumb ? ' skel' : '') + '">' +
            (n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
          '<span class="hpinfo"><b>' + esc(n.title || slug) + '</b><span>' + esc(n.author || '') +
            (n.chapters ? ' · ' + num(n.chapters) + ' chương' : '') + '</span></span>' +
          '<span class="hpbtns">' +
            '<button class="mv" data-up="' + i + '" title="Lên một bậc" aria-label="Lên một bậc"' + (i === 0 ? ' disabled' : '') + '>' + ic('up', 'i-s') + '</button>' +
            '<button class="mv" data-down="' + i + '" title="Xuống một bậc" aria-label="Xuống một bậc"' + (i === picks.length - 1 ? ' disabled' : '') + '>' + ic('down', 'i-s') + '</button>' +
            '<button class="mv" data-drop="' + i + '" title="Bỏ khỏi khối hero" aria-label="Bỏ khỏi khối hero">' + ic('x', 'i-s') + '</button>' +
          '</span></div>';
      }).join('')
      : '<div class="empty sm">Chưa chọn bộ nào — trang chủ sẽ tự lấy các bộ mới cập nhật.</div>';
    $('#hpCount').textContent = picks.length ? picks.length + '/6 bộ đang chọn' : 'đang để tự động';
  }
  function renderEdit() {
    var picks = editPicks();
    var by = {};
    (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
    var el = document.getElementById('editPick');
    if (!el) return;
    el.innerHTML = picks.length
      ? picks.map(function (slug, i) {
        var n = by[slug] || {};
        return '<div class="hprow" data-eslug="' + esc(slug) + '">' +
          '<span class="hpno">' + (i + 1) + '</span>' +
          '<span class="hpth' + (n.thumb ? ' skel' : '') + '">' +
            (n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
          '<span class="hpinfo"><b>' + esc(n.title || slug) + '</b><span>' + esc(n.author || '') +
            (n.chapters ? ' · ' + num(n.chapters) + ' chương' : '') + '</span></span>' +
          '<span class="hpbtns">' +
            '<button class="mv" data-eup="' + i + '" title="Lên"' + (i === 0 ? ' disabled' : '') + '>' + ic('up', 'i-s') + '</button>' +
            '<button class="mv" data-edown="' + i + '" title="Xuống"' + (i === picks.length - 1 ? ' disabled' : '') + '>' + ic('down', 'i-s') + '</button>' +
            '<button class="mv" data-edrop="' + i + '" title="Bỏ">' + ic('x', 'i-s') + '</button>' +
          '</span></div>';
      }).join('')
      : '<div class="empty sm">Chưa chọn bộ nào cho Góc biên tập viên.</div>';
    var cnt = document.getElementById('epCount');
    if (cnt) cnt.textContent = picks.length ? picks.length + ' bộ đang chọn' : 'chưa chọn';
  }
  function epMove(from, to) {
    var picks = editPicks();
    if (to < 0 || to >= picks.length) return;
    var list = picks.slice();
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    REG.editorChoice = list;
    if (REG.settings) REG.settings.editorChoice = list;
    dirty.set = true; markDirty(); renderEdit();
  }
  function epDrop(i) {
    var picks = editPicks();
    var list = picks.slice(); list.splice(i, 1);
    REG.editorChoice = list;
    if (REG.settings) REG.settings.editorChoice = list;
    dirty.set = true; markDirty(); renderEdit(); epSearch();
  }
  function epSearch() {
    var box = document.getElementById('epFound'), inp = document.getElementById('epFind');
    if (!box || !inp) return;
    var q = (inp.value || '').trim().toLowerCase();
    if (!q) { box.classList.add('hide'); box.innerHTML = ''; return; }
    var picks = editPicks();
    var hits = (REG.lib || []).filter(function (n) { return picks.indexOf(n.slug) < 0; })
      .filter(function (n) {
        return String(n.title || '').toLowerCase().indexOf(q) >= 0 || String(n.author || '').toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
    box.classList.remove('hide');
    box.innerHTML = hits.length
      ? hits.map(function (n) {
        return '<button class="hphit" data-eadd="' + esc(n.slug) + '"><b>' + esc(n.title) + '</b>' +
          '<span>' + esc(n.author || '') + ' · ' + num(n.chapters || 0) + ' chương</span></button>';
      }).join('')
      : '<div class="sm muted" style="padding:10px 12px">Không tìm thấy.</div>';
  }
  function epAdd(slug) {
    var picks = editPicks();
    if (picks.indexOf(slug) >= 0) return;
    var n = (REG.lib || []).find(function (x) { return x.slug === slug; });
    if (!n) return;
    picks.push(slug);
    REG.editorChoice = picks;
    if (REG.settings) REG.settings.editorChoice = picks;
    dirty.set = true; markDirty();
    var inp = document.getElementById('epFind');
    if (inp) inp.value = '';
    renderEdit(); epSearch();
  }
  function hpMove(from, to) {
    var picks = slidePicks();
    if (to < 0 || to >= picks.length) return;
    var by = {};
    (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
    var list = picks.slice();
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    REG.slides = list.map(function (s) { return by[s]; }).filter(Boolean);
    dirty.set = true; markDirty(); renderSlides();
  }
  function hpDrop(i) {
    var picks = slidePicks();
    var by = {};
    (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
    var list = picks.slice(); list.splice(i, 1);
    REG.slides = list.map(function (s) { return by[s]; }).filter(Boolean);
    dirty.set = true; markDirty(); renderSlides(); hpSearch();
  }
  function hpSearch() {
    var box = $('#hpFound'), q = ($('#hpFind').value || '').trim().toLowerCase();
    if (!q) { box.classList.add('hide'); box.innerHTML = ''; return; }
    var picks = slidePicks();
    var hits = (REG.lib || []).filter(function (n) { return (n.chapters || 0) > 0 && picks.indexOf(n.slug) < 0; })
      .filter(function (n) {
        return String(n.title || '').toLowerCase().indexOf(q) >= 0 || String(n.author || '').toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
    box.classList.remove('hide');
    box.innerHTML = hits.length
      ? hits.map(function (n) {
        return '<button class="hphit" data-add="' + esc(n.slug) + '"><b>' + esc(n.title) + '</b>' +
          '<span>' + esc(n.author || '') + ' · ' + num(n.chapters || 0) + ' chương</span></button>';
      }).join('')
      : '<div class="sm muted" style="padding:10px 12px">Không tìm thấy bộ nào khớp (chỉ liệt kê bộ đã có chương).</div>';
  }
  function hpAdd(slug) {
    var picks = slidePicks();
    if (picks.indexOf(slug) >= 0) return;
    if (picks.length >= 6) return toast('Tối đa 6 bộ cho khối hero', 'err');
    var n = (REG.lib || []).find(function (x) { return x.slug === slug; });
    if (!n) return;
    REG.slides = picks.concat([slug]).map(function (s) { return s === slug ? n : (REG.lib || []).find(function (x) { return x.slug === s; }); }).filter(Boolean);
    dirty.set = true; markDirty();
    $('#hpFind').value = '';
    renderSlides(); hpSearch();
  }
  function renderSched() {
    var s = REG.schedule || {};
    $('#sSched').value = (s.items || []).map(function (i) { return [i.days, i.title, i.detail || ''].join(' | '); }).join('\n');
    $('#sSchedNote').value = s.note || $('#sSchedNote').value || '';
    $('#sGiscusRepo').value = ((REG.settings || {}).giscus || {}).repo || '';
    $('#sGiscusId').value = ((REG.settings || {}).giscus || {}).repoId || '';
    var don = (REG.settings && REG.settings.donation) || {};
    var rep = (REG.settings && REG.settings.report) || {};
    if ($('#dEnabled')) $('#dEnabled').value = don.enabled ? '1' : '0';
    if ($('#dBank')) $('#dBank').value = don.bank || '';
    if ($('#dAccNo')) $('#dAccNo').value = don.accountNo || '';
    if ($('#dAccName')) $('#dAccName').value = don.accountName || '';
    if ($('#dMomo')) $('#dMomo').value = don.momo || '';
    if ($('#dQr')) $('#dQr').value = don.qr || '';
    if ($('#dMsg')) $('#dMsg').value = don.message || '';
    if ($('#rEmail')) $('#rEmail').value = rep.email || 'chuseoz.ofc@gmail.com';
    if ($('#rForm')) $('#rForm').value = rep.form || 'https://forms.gle/YW3PvtrNVQ7xt8nCA';
    renderEdit();
  }
  function renderSettings() {
    var s = REG.schedule || {};
    if (!$('#sSchedNote').value) $('#sSchedNote').value = s.note || 'Lịch có thể thay đổi nếu có việc đột xuất.';
  }
  function saveSettings() {
    var by = {}; (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
    REG.slides = slidePicks().slice(0, 6).map(function (s) { return by[s]; }).filter(Boolean);
    var ePicks = editPicks();
    REG.editorChoice = ePicks;
    var items = $('#sSched').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      return { days: p[0] || '', title: p[1] || '', detail: p[2] || '' };
    });
    REG.schedule = {
      items: items, note: $('#sSchedNote').value.trim(),
      updated: today()
    };
    var don = {
      enabled: $('#dEnabled') && $('#dEnabled').value === '1',
      bank: $('#dBank') ? $('#dBank').value.trim() : '',
      accountNo: $('#dAccNo') ? $('#dAccNo').value.trim() : '',
      accountName: $('#dAccName') ? $('#dAccName').value.trim() : '',
      momo: $('#dMomo') ? $('#dMomo').value.trim() : '',
      qr: $('#dQr') ? $('#dQr').value.trim() : '',
      message: $('#dMsg') ? $('#dMsg').value.trim() : ''
    };
    var rep = {
      email: $('#rEmail') ? $('#rEmail').value.trim() : 'chuseoz.ofc@gmail.com',
      form: $('#rForm') ? $('#rForm').value.trim() : 'https://forms.gle/YW3PvtrNVQ7xt8nCA'
    };
    REG.settings = Object.assign({}, REG.settings, {
      giscus: { repo: $('#sGiscusRepo').value.trim(), repoId: $('#sGiscusId').value.trim() },
      donation: don,
      report: rep,
      editorChoice: ePicks
    });
    saveRegistry('Đã lưu cài đặt');
  }

  /* ------------------------------ nạp dữ liệu --------------------------- */
  function seedKV() {
    if (!ONLINE) return msg('Cần nối Worker trước.', 'err');
    CZ.confirm('Nạp TOÀN BỘ registry + các bộ trong repo lên KV?\nDữ liệu đang có trên KV sẽ bị ghi đè.', 'Nạp lên KV').then(function (ok) {
      if (!ok) return;
      var b = $('#btnSeed'); b.disabled = true;
      fetch('/data/registry.json').then(function (r) { return r.json(); }).then(function (reg) {
        return api('/api/registry', { method: 'PUT', body: reg }).then(function () { return reg; });
      }).then(function (reg) {
        var lib = reg.lib || [], done = 0, fail = [];
        var step = function (i) {
          if (i >= lib.length) {
            msg('Đã nạp ' + done + '/' + lib.length + ' bộ lên KV' + (fail.length ? ' · lỗi: ' + fail.join(', ') : ''), fail.length ? 'err' : 'ok');
            return loadRegistry().then(function () { health(); });
          }
          var n = lib[i];
          b.innerHTML = '<span class="spin"></span> ' + (i + 1) + '/' + lib.length;
          return fetch('/data/book/' + encodeURIComponent(n.slug) + '.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (bk) {
              if (!bk) return;
              return api('/api/book/' + encodeURIComponent(n.slug), { method: 'PUT', body: bk })
                .then(function () { done++; }).catch(function () { fail.push(n.slug); });
            })
            .then(function () { return step(i + 1); });
        };
        return step(0);
      }).catch(function (e) { msg('Nạp lỗi: ' + e.message, 'err'); })
        .then(function () { b.disabled = false; b.textContent = '↑ Nạp dữ liệu repo lên KV'; });
    });
  }
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
  function restore(file) {
    file.text().then(function (t) {
      var dump = JSON.parse(t);
      if (!dump.registry) throw new Error('file không đúng định dạng');
      return CZ.confirm('Phục hồi từ "' + file.name + '"? Dữ liệu hiện có sẽ bị ghi đè.', 'Phục hồi').then(function (ok) {
        if (!ok) return;
        REG = dump.registry; BOOKS = Object.assign({}, dump.books || {});
        return saveRegistry('Đã phục hồi registry').then(function () {
          var slugs = Object.keys(BOOKS), i = 0;
          var step = function () {
            if (i >= slugs.length) { msg('Phục hồi xong ' + slugs.length + ' bộ.', 'ok'); return renderList(); }
            var s = slugs[i++];
            msg('Đang phục hồi chương ' + i + '/' + slugs.length + '…', 'info');
            if (!ONLINE) return Promise.resolve(step());
            return api('/api/book/' + encodeURIComponent(s), { method: 'PUT', body: BOOKS[s] }).catch(function () {}).then(step);
          };
          return step();
        });
      });
    }).catch(function (e) { msg('Phục hồi lỗi: ' + e.message, 'err'); });
  }

  /* ------------------------------ số liệu ------------------------------- */
  function loadStats(force) {
    var st = $('#stState');
    st.className = 'msgbar show info';
    st.innerHTML = '<span class="spin"></span> đang đọc số liệu từ Firebase…';
    var p = force && ONLINE ? api('/api/stats/refresh', { method: 'POST' }).catch(function () {}) : Promise.resolve();
    p.then(function () { return CZ.stats(); }).then(function (d) {
      if (force) { CZ._memo.stats = null; }
      var items = (d && d.items) || {};
      var keys = Object.keys(items).filter(function (k) { return k === k.toLowerCase(); });
      var tv = keys.reduce(function (a, k) { return a + (items[k].views || 0); }, 0);
      var tvv = keys.reduce(function (a, k) { return a + (items[k].votes || 0); }, 0);
      $('#stTiles').innerHTML = [['Bộ có số liệu', num(keys.length)], ['Tổng lượt đọc', num(tv)], ['Tổng bình chọn', num(tvv)]]
        .map(function (r) { return '<div class="tile"><b>' + r[1] + '</b><span>' + r[0] + '</span></div>'; }).join('');
      if (!keys.length) {
        st.className = 'msgbar show err';
        st.innerHTML = 'Chưa đọc được số liệu Firebase (quyền đọc đang chặn). Mở Firebase Console → Firestore → Rules → cho phép ' +
          '<code>read</code> với collection <code>novelData</code> (mẫu ở <code>worker/README.md §5</code>). Trong lúc đó web ngoài ' +
          '<b>không hiện số nào</b> — không bịa số.';
        $('#stTb').innerHTML = '';
        return;
      }
      st.className = 'msgbar show ok';
      st.textContent = 'Số liệu thật · nguồn: ' + (d.source || 'firebase') + (d.stale ? ' (bản lưu trong máy)' : '');
      var by = {}; (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
      var list = keys.map(function (k) { return Object.assign({ _k: k }, items[k]); })
        .sort(function (a, b) { return (b.views || 0) - (a.views || 0); }).slice(0, 60);
      $('#stTb').innerHTML = '<thead><tr><th>#</th><th>Bộ truyện</th><th>Lượt đọc</th><th>Bình chọn</th><th>Chương</th></tr></thead><tbody>' +
        list.map(function (r, i) {
          var n = by[r._k] || {};
          return '<tr><td>' + (i + 1) + '</td><td>' + (n.title ? esc(n.title) : esc(r._k)) + '</td>' +
            '<td><b>' + num(r.views) + '</b></td><td>' + num(r.votes) + '</td><td>' + num(r.chapterCount) + '</td></tr>';
        }).join('') + '</tbody>';
    }).catch(function (e) {
      st.className = 'msgbar show err';
      st.textContent = 'Lỗi đọc số liệu: ' + e.message;
    });
  }

  /* biểu tượng viết trong HTML: <span data-ic="search"> → hình thật */
  $$('[data-ic]').forEach(function (el) { el.outerHTML = ic(el.dataset.ic); });

  /* -------------------- lúc mở trang: dùng được ngay --------------------- */
  (function boot() {
    show('overview');                                      /* mở sẵn bảng tổng quan */
    var savedApi = '', savedKey = '';
    try { savedApi = localStorage.getItem(LS.api) || ''; savedKey = localStorage.getItem(LS.key) || ''; } catch (e) {}
    if (savedApi) $('#inApi').value = savedApi;
    else if (CZ.API) $('#inApi').value = CZ.API;
    if (savedKey) $('#inKey').value = savedKey;
    if (savedApi && savedKey) { connect(); return; }        /* tự nối lại Worker đã lưu */
    viewStatic(true);                                      /* còn lại: xem dữ liệu tĩnh ngay */
    msg('Đang xem dữ liệu tĩnh /data/*.json — nối Worker ở khung trên để sửa là người đọc thấy ngay.', 'info');
  })();

  /* ------------------------------ gắn sự kiện ---------------------------- */
  $('#btnConnect').addEventListener('click', connect);
  $('#inKey').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
  $('#inApi').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
  $('#btnGuide').addEventListener('click', function () { $('#guide').classList.toggle('hide'); });
  /* khung “Nối Cloudflare Worker”: mặc định thu gọn để phần việc chính lên đầu trang */
  function setSetup(open) {
    var body = $('#setupBody'), b = $('#btnSetup');
    if (!body || !b) return;
    body.classList.toggle('hide', !open);
    b.textContent = open ? 'Thu gọn' : 'Mở phần kết nối';
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  $('#btnSetup').addEventListener('click', function () { setSetup($('#setupBody').classList.contains('hide')); });
  $('#btnLocal').addEventListener('click', viewStatic);
  function viewStatic(quiet) {
    ONLINE = false; API = ''; KEY = '';
    setConn('warn', 'dữ liệu tĩnh trong repo');
    openApp();
    if (!quiet) msg('Đang xem dữ liệu tĩnh /data/*.json. Mọi thay đổi chỉ lưu nháp trong máy.', 'info');
  }
  $('#btnOut').addEventListener('click', disconnect);
  $('#btnTheme').innerHTML = ic('sun', 'i-s');
  $('#btnTheme').addEventListener('click', function () {
    var t = CZ.themeToggle();
    this.innerHTML = ic(t === 'light' ? 'sun' : 'moon', 'i-s');
  });
  $$('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.tab;
      if (k === 'stats') loadStats(false);
      if (k === 'overview') renderOverview();
      if (k === 'edit' && !CUR) return;
      show(k);
    });
  });
  $('#ovReload').addEventListener('click', function () {
    OV_FILTER = null;
    loadRegistry().then(function () { renderOverview(); toast('Đã đọc lại dữ liệu'); });
  });
  $('#q').addEventListener('input', renderList);
  $('#fStatus').addEventListener('change', renderList);
  $('#ovClear').addEventListener('click', function () { OV_FILTER = null; renderList(); msg(''); });
  $('#fSort').addEventListener('change', renderList);
  $('#ckAll').addEventListener('change', function () {
    var on = this.checked;
    $$('#tb [data-ck]').forEach(function (c) { c.checked = on; if (on) selected[c.dataset.ck] = 1; else delete selected[c.dataset.ck]; });
    $('#selCount').textContent = Object.keys(selected).length ? Object.keys(selected).length + ' bộ được chọn' : '';
  });
  $('#btnBulk').addEventListener('click', function () {
    var v = $('#bulkStatus').value;
    if (!v) return toast('Chọn việc cần làm trước đã', 'err');
    var ids = Object.keys(selected);
    if (!ids.length) return toast('Chưa chọn bộ nào', 'err');
    var kind = v.split(':')[0], val = v.slice(kind.length + 1);
    ids.forEach(function (s) {
      var n = (REG.lib || []).find(function (x) { return x.slug === s; });
      if (!n) return;
      if (kind === 'st') n.status = val;
      else if (kind === '18') n.is18 = val === '1';
    });
    selected = {}; $('#ckAll').checked = false;
    var what = kind === 'st' ? 'Đã đổi tình trạng ' + ids.length + ' bộ thành “' + val + '”'
      : 'Đã ' + (val === '1' ? 'gắn' : 'bỏ') + ' nhãn 18+ cho ' + ids.length + ' bộ';
    saveRegistry(what).then(function () { renderList(); });
  });
  $('#btnExport').addEventListener('click', function () {
    CZ.download('chuseoz-registry-' + today() + '.json', JSON.stringify(REG, null, 1));
  });
  $('#btnAdd2').addEventListener('click', function () { show('new'); });
  $('#qkBody').addEventListener('input', function () { $('#qkStat').textContent = num(CZ.words(this.value)) + ' từ'; });
  $('#qkPub').addEventListener('click', quickPublish);
  /* mở tệp từ máy: .txt / .md / .html → đổ vào ô soạn, tên tệp thành tiêu đề chương */
  $('#qkFileBtn').addEventListener('click', function () { $('#qkFile').click(); });
  $('#qkFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var txt = String(rd.result || '');
      var isHtml = /\.html?$/i.test(f.name) || /^\s*<[a-z][\s\S]*>/i.test(txt.slice(0, 200));
      $('#qkBody').value = txt;
      $('#qkMode').value = isHtml ? 'raw' : 'para';
      if (!$('#qkTitle').value.trim()) {
        var base = f.name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').trim();
        $('#qkTitle').value = base;
      }
      $('#qkStat').textContent = num(CZ.words(txt)) + ' từ';
      $('#qkFileName').textContent = f.name + ' · ' + num(CZ.words(txt)) + ' từ';
      toast('Đã mở ' + f.name, 'ok');
    };
    rd.onerror = function () { toast('Không đọc được tệp này', 'err'); };
    rd.readAsText(f);
  });
  $('#qkPreview').addEventListener('click', function () {
    $('#qkPrevBox').classList.remove('hide');
    $('#qkPrev').innerHTML = textToHtml($('#qkBody').value, $('#qkMode').value) ||
      '<span class="sm muted">Chưa có nội dung.</span>';
  });
  $('#btnNew').addEventListener('click', addBook);
  $('#nTitle').addEventListener('input', function () {
    if (!$('#nSlug').dataset.touched) $('#nSlug').value = slugify(this.value);
  });
  $('#nSlug').addEventListener('input', function () { this.dataset.touched = '1'; });
  $('#edBack').addEventListener('click', function () { show('list'); });
  ['#fTitle', '#fSlug', '#fAuthor', '#fCouple', '#fYear', '#fStatus', '#fCount', '#f18', '#fUpdated', '#fThumb', '#fSyn']
    .forEach(function (s) { $(s).addEventListener('input', function () { dirty.meta = true; markDirty(); }); });
  $('#fSlug').addEventListener('blur', function () {
    var v = this.value.trim();
    if (!v) return;
    var norm = slugify(v);
    if (norm && norm !== v) {
      this.value = norm;
      dirty.meta = true; markDirty();
      toast('Slug đã chuẩn hoá thành: ' + norm, 'info');
    }
  });
  $('#btnSaveMeta').addEventListener('click', function () { saveMeta(); });
  $('#btnDraft').addEventListener('click', saveDraft);
  $('#chTitle').addEventListener('input', function () { dirty.book = true; markDirty(); });
  $('#chBody').addEventListener('input', function () { dirty.book = true; markDirty(); $('#chStat').textContent = num(CZ.words(this.value)) + ' từ'; });
  $('#chSave').addEventListener('click', function () {
    if (!BOOK || CHAP < 0) return toast('Chọn một chương trong danh sách trước', 'err');
    BOOK.chapters[CHAP] = { t: $('#chTitle').value.trim() || ('Chương ' + (CHAP + 1)), html: $('#chBody').value };
    dirty.book = true; markDirty(); renderChapters();
    toast('Đã cập nhật chương ' + (CHAP + 1) + ' (nhớ bấm Lưu toàn bộ chương)', 'ok');
  });
  $('#chDel').addEventListener('click', function () {
    if (!BOOK || CHAP < 0) return;
    var i = CHAP;
    CZ.confirm('Xoá chương ' + (i + 1) + ' — ' + (BOOK.chapters[i].t || '') + '?', 'Xoá').then(function (ok) {
      if (!ok) return;
      BOOK.chapters.splice(i, 1); CHAP = -1;
      $('#chTitle').value = ''; $('#chBody').value = '';
      dirty.book = true; markDirty(); renderChapters();
    });
  });
  $('#chNew').addEventListener('click', function () {
    if (!BOOK) return;
    BOOK.chapters.push({ t: 'Chương ' + (BOOK.chapters.length + 1), html: '' });
    CHAP = BOOK.chapters.length - 1;
    openChap(CHAP);
    dirty.book = true; markDirty();
  });
  $('#btnSaveCh').addEventListener('click', function () {
    if (CHAP >= 0 && BOOK) BOOK.chapters[CHAP] = { t: $('#chTitle').value.trim() || ('Chương ' + (CHAP + 1)), html: $('#chBody').value };
    saveBook('Đã lưu chương');
  });
  $('#btnDelBook').addEventListener('click', function () { if (CUR) delBook(CUR.slug); });
  $('#sSave').addEventListener('click', saveSettings);
  ['#sSched', '#sSchedNote', '#sGiscusRepo', '#sGiscusId'].forEach(function (s) {
    $(s).addEventListener('input', function () { dirty.set = true; markDirty(); });
  });
  $('#slidePick').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var i = parseInt(b.dataset.up || b.dataset.down || b.dataset.drop, 10);
    if (isNaN(i)) return;
    if (b.dataset.up !== undefined) hpMove(i, i - 1);
    else if (b.dataset.down !== undefined) hpMove(i, i + 1);
    else hpDrop(i);
  });
  $('#hpFind').addEventListener('input', hpSearch);
  $('#hpFound').addEventListener('click', function (e) {
    var b = e.target.closest('[data-add]'); if (b) hpAdd(b.dataset.add);
  });
  $('#hpAuto').addEventListener('click', function () {
    REG.slides = []; dirty.set = true; markDirty();
    $('#hpFind').value = ''; renderSlides(); hpSearch();
    toast('Trang chủ sẽ tự chọn bộ mới cập nhật');
  });
  var epEl = $('#editPick');
  if (epEl) epEl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var i = parseInt(b.dataset.eup || b.dataset.edown || b.dataset.edrop, 10);
    if (isNaN(i)) return;
    if (b.dataset.eup !== undefined) epMove(i, i - 1);
    else if (b.dataset.edown !== undefined) epMove(i, i + 1);
    else epDrop(i);
  });
  var epFind = $('#epFind');
  if (epFind) epFind.addEventListener('input', epSearch);
  var epFound = $('#epFound');
  if (epFound) epFound.addEventListener('click', function (e) {
    var b = e.target.closest('[data-eadd]'); if (b) epAdd(b.dataset.eadd);
  });
  var epAuto = $('#epAuto');
  if (epAuto) epAuto.addEventListener('click', function () {
    REG.editorChoice = []; if (REG.settings) REG.settings.editorChoice = [];
    dirty.set = true; markDirty();
    var inp = $('#epFind'); if (inp) inp.value = '';
    renderEdit(); epSearch();
    toast('Đã xoá hết Editor\'s Choice');
  });
  ['#dEnabled','#dBank','#dAccNo','#dAccName','#dMomo','#dQr','#dMsg','#rEmail','#rForm'].forEach(function (s) {
    var el = $(s); if (el) el.addEventListener('input', function () { dirty.set = true; markDirty(); });
  });
  
  $('#btnSeed').addEventListener('click', seedKV);
  $('#btnHealth').addEventListener('click', function () { health().then(function () { toast('Đã kiểm tra Worker', 'ok'); }); });
  $('#btnStatsClear').addEventListener('click', function () { loadStats(true); show('stats'); });
  $('#btnBackup').addEventListener('click', backup);
  $('#btnRestore').addEventListener('click', function () { $('#fileRestore').click(); });
  $('#fileRestore').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (f) restore(f);
    e.target.value = '';
  });
  $('#btnStats').addEventListener('click', function () { loadStats(true); });
  window.addEventListener('beforeunload', function (e) {
    if (dirty.meta || dirty.book || dirty.set) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
      e.preventDefault();
      if (!$('#pane-edit').classList.contains('hide')) { saveMeta(); saveBook('Đã lưu bộ & chương'); }
      else if (!$('#pane-settings').classList.contains('hide')) saveSettings();
      else if (!$('#pane-quick').classList.contains('hide')) quickPublish();
      else toast('Không có gì để lưu ở tab này');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); $('#q').focus(); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return;
    var map = { 1: 'overview', 2: 'list', 3: 'quick', 4: 'new', 5: 'edit', 6: 'settings', 7: 'stats', 8: 'help' };
    if (map[e.key]) {
      var k = map[e.key];
      if (k === 'edit' && !CUR) return;
      if (k === 'stats') loadStats(false);
      if (k === 'overview') renderOverview();
      show(k);
    }
  });

  /* ------------------------------ khởi động ---------------------------- */
  (function init() {
    CZ.themeInit();
    $('#btnTheme').innerHTML = ic(document.documentElement.getAttribute('data-theme') === 'light' ? 'sun' : 'moon', 'i-s');
    fillStatusFilter();
    var savedApi = '', savedKey = '';
    try { savedApi = localStorage.getItem(LS.api) || ''; savedKey = localStorage.getItem(LS.key) || ''; } catch (e) {}
    if (savedApi) $('#inApi').value = savedApi;
    if (!savedApi && CZ.API) $('#inApi').value = CZ.API;     /* gợi ý từ cz-config.js */
    if (savedKey) {
      $('#inKey').value = savedKey;
      API = CZ.normalizeApi(savedApi || CZ.API); KEY = savedKey;
      api('/api/whoami').then(function () {
        ONLINE = true; openApp();
        msg('Đã tự kết nối lại bằng khoá đã lưu. Nếu đây không phải máy của bạn, bấm “Ngắt kết nối”.', 'info');
      }).catch(function () { setConn('warn', 'khoá đã lưu không dùng được'); });
    }
  })();
})();
