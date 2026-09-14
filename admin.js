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
  function normalizeApi(u) {
    u = String(u == null ? '' : u).trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }
  function api(path, opt) {
    opt = opt || {};
    var base = normalizeApi(API || '');
    if (!base) return Promise.reject(new Error('chưa nối Worker — nhập URL Worker (vd https://xxx.workers.dev)'));
    var headers = {};
    if (opt.body != null) headers['content-type'] = 'application/json';
    if (opt.auth !== false && KEY) headers['x-admin-key'] = KEY;
    if (opt.mode) headers['x-import-mode'] = opt.mode;
    return fetch(base + path, {
      method: opt.method || 'GET', headers: headers, cache: 'no-store', mode: 'cors',
      body: opt.body != null ? JSON.stringify(opt.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) throw new Error(d.error || ('HTTP ' + r.status + (r.status === 503 ? ' — Worker chưa gắn KV CZ_KV hoặc id trong wrangler.toml còn là placeholder' : '')));
        return d;
      });
    }).catch(function (e) {
      /* fetch lỗi mạng (Failed to fetch) → báo rõ hơn */
      var m = String((e && e.message) || e || '');
      if (/Failed to fetch|NetworkError|Load failed/i.test(m)) {
        throw new Error('Failed to fetch — không nối được Worker tại ' + base +
          ' (CORS, URL sai, Worker chưa deploy, hoặc KV id trong wrangler.toml còn là DAN_ID_KV_VAO_DAY). Mở ' + base + '/api/health trên tab mới để kiểm tra.');
      }
      throw e;
    });
  }
  function setConn(kind, text) {
    var c = $('#chipConn');
    c.className = 'chip ' + (kind || '');
    $('#chipConnTxt').textContent = text;
  }
  function connect() {
    API = normalizeApi(CZ.normalizeApi($('#inApi').value) || $('#inApi').value);
    KEY = $('#inKey').value.trim();
    if (!API) return msg('Nhập URL Worker đã (vd https://xxx.workers.dev).', 'err');
    if (!KEY) return msg('Nhập ADMIN_KEY đã.', 'err');
    var b = $('#btnConnect');
    b.disabled = true; b.innerHTML = '<span class="spin"></span> đang kiểm tra…';
    /* Gọi health trước để phân biệt rõ: URL/CORS chết, Worker thiếu secret,
       hay Worker có secret nhưng khoá vừa nhập không khớp. Promise.all trước đây
       làm cả ba bệnh đều bị gom thành một câu "sai hoặc thiếu X-Admin-Key". */
    api('/api/health', { auth: false })
      .then(function (h) {
        if (h.adminConfigured === false) {
          throw new Error('Worker chưa nhận được secret ADMIN_KEY — đặt secret trên đúng Worker này rồi Deploy lại');
        }
        return api('/api/whoami').then(function () { return h; });
      })
      .then(function (h) {
        try { localStorage.setItem(LS.api, API); localStorage.setItem(LS.key, KEY); } catch (e) {}
        ONLINE = true;
        msg('Kết nối OK · ' + (h.kv ? 'KV sẵn sàng' : 'KV chưa gắn') + ' · ' + num(h.books) + ' bộ trên KV · rev ' + (h.regRev || '—'), 'ok');
        openApp();
      })
      .catch(function (e) {
        ONLINE = false;
        var detail = String((e && e.message) || e || 'lỗi không xác định');
        msg('Không nối được: ' + detail + ' — kiểm tra URL Worker, binding CZ_KV và secret ADMIN_KEY.', 'err');
        if (!isAdmin()) gateHold('Khoá ADMIN_KEY chưa đúng hoặc Worker chưa reachable: ' + detail +
          ' — đăng nhập bằng tài khoản quản trị, hoặc nhập lại khoá.', 'err');
      })
      .then(function () { b.disabled = false; b.textContent = 'Kiểm tra & kết nối'; });
  }
  function openApp() {
    gatePass(ONLINE ? 'key' : 'local');
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
      task('noyear', 'Thiếu năm', 'Dùng cho bộ lọc năm và dòng thông tin trên thẻ',
        lib.filter(function (n) { return !String(n.year || '').trim(); })),
      task('count', 'Nhãn số chương lệch', 'Nhãn ghi “x/y” nhưng số chương đã đăng không khớp x (bỏ qua Sắp ra mắt 0 chương)',
        lib.filter(function (n) {
          /* cho phép 0/— cho truyện chưa ra, không coi là lệch */
          if ((n.chapters || 0) === 0 && CZ.statusCls(n.status) === 'soon') return false;
          var m = String(n.countLabel || '').match(/^(\d+)\s*\/\s*(\d+|—)$/);
          if (!m) return false;
          if (m[2] === '—') return parseInt(m[1], 10) !== 0 ? true : false;
          return m && parseInt(m[1], 10) !== (n.chapters || 0);
        })),
      task('stale', '“Sắp ra mắt” đã lâu', 'Đăng hơn 45 ngày vẫn chưa có chương nào',
        lib.filter(function (n) { return !(n.chapters || 0) && daysSince(n.updated) > 45; }))
    ].filter(function (t) { return t.n > 0; });

    /* số liệu thật (nếu đã đọc) + tình trạng kênh đăng nhập: quản trị mở trang là thấy ngay */
    var stItems = (CZ._memo.stats && CZ._memo.stats.on && CZ._memo.stats.items) || {};
    var stKeys = Object.keys(stItems);
    var sumF = function (f) { return stKeys.reduce(function (a, k) { return a + (Number(stItems[k][f]) || 0); }, 0); };
    var tiles = [
      { n: lib.length, l: 'Bộ truyện' },
      { n: has, l: 'Đã có chương' },
      { n: soon, l: 'Sắp ra mắt' },
      { n: chap, l: 'Chương đã đăng' },
      { n: eighteen, l: 'Gắn 18+' },
      { n: Object.keys(picked).length, l: 'Thiếu thông tin' },
      { n: stKeys.length, l: 'Bộ có số liệu' },
      { n: sumF('views'), l: 'Lượt đọc (KV)' },
      { n: sumF('votes'), l: 'Phiếu thích (KV)' }
    ];
    $('#ovTiles').innerHTML = tiles.map(function (t) {
      return '<div class="tile"><b>' + num(t.n) + '</b><span>' + t.l + '</span></div>';
    }).join('');
    paintAuthPanel();

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
            (k === 'noyear' && !String(n.year || '').trim()) ||
            (k === 'stale' && !(n.chapters || 0) && daysSince(n.updated) > 45) ||
            (k === 'count' && (function () {
              if ((n.chapters || 0) === 0 && CZ.statusCls(n.status) === 'soon') return false;
              var m = String(n.countLabel || '').match(/^(\d+)\s*\/\s*(\d+|—)$/);
              if (!m) return false;
              if (m[2] === '—') return parseInt(m[1], 10) !== 0;
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
  /* ô tình trạng hệ thống trong tab Tổng quan: đăng nhập, Worker, số chương lệch */
  function paintAuthPanel() {
    var box = $('#ovAuth');
    if (!box) return;
    var authCfg = (REG && REG.settings && REG.settings.auth) || {};
    var sbCode = !!(window.CZ_SUPABASE_URL && window.CZ_SUPABASE_ANON_KEY);
    var sbKv = !!(authCfg.supabaseUrl && authCfg.supabaseAnonKey);
    var sbOn = sbCode || sbKv;
    var emails = (window.CZ_AUTH && CZ_AUTH.adminEmails) ? CZ_AUTH.adminEmails() : [];
    var docBad = DOC.rows.filter(function (r) { return r.issues.indexOf('regVsReal') >= 0 || r.issues.indexOf('kvVsRepo') >= 0; }).length;
    box.innerHTML =
      '<div class="docrow ' + (sbOn ? 'good' : 'warn') + '"><span class="di">' + ic(sbOn ? 'check' : 'alert', 'i-s') + '</span>' +
        '<span class="dt"><b>Đăng nhập người đọc: ' + (sbOn ? (sbCode ? 'Supabase (cz-config.js)' : 'Supabase (lưu trên KV)') : 'CHƯA bật') + '</b>' +
        '<span>' + (sbOn
          ? 'Người đọc bấm "Đăng nhập" ở đầu trang là qua Supabase → Google, không dính lỗi origin_mismatch. Email quản trị: ' + esc(emails.join(', ') || '(chưa khai)')
          : 'Vào tab <b>Cài đặt &amp; đồng bộ</b> → mục <b>Đăng nhập người đọc (Supabase)</b>, dán Project URL + anon key rồi Lưu. ' +
            'Hoặc điền thẳng vào <code>cz-config.js</code>. Chi tiết: HUONG-DAN-DANG-NHAP-BINH-LUAN.md') + '</span></span>' +
        '<button class="btn ghost sm" data-go2="settings">' + ic('gear', 'i-s') + 'Mở cài đặt</button></div>' +
      '<div class="docrow ' + (docBad ? 'bad' : 'good') + '"><span class="di">' + ic(docBad ? 'alert' : 'pulse', 'i-s') + '</span>' +
        '<span class="dt"><b>Số chương: ' + (DOC.rows.length ? (docBad ? docBad + ' bộ đang lệch' : 'khớp nhau') : 'chưa soi lần nào') + '</b>' +
        '<span>Đối chiếu registry (số hiện ngoài web) ↔ KV (bản người đọc nhận) ↔ file trong repo GitHub. ' +
        'Web hiện sai số chương thì soi ở đây ra ngay chỗ lệch.</span></span>' +
        '<button class="btn ghost sm" id="ovDoc">' + ic('pulse', 'i-s') + (DOC.rows.length ? 'Soi lại' : 'Soi dữ liệu') + '</button></div>' +
      '<div class="docrow ' + (ONLINE ? 'good' : 'warn') + '"><span class="di">' + ic(ONLINE ? 'cloud' : 'info', 'i-s') + '</span>' +
        '<span class="dt"><b>Worker: ' + (ONLINE ? 'đã nối KV' : 'chưa nối — đang xem dữ liệu tĩnh') + '</b>' +
        '<span>' + (ONLINE ? 'Sửa ở đây là người đọc thấy sau 1–2 giây, không cần build/deploy.'
          : 'Mở khung "Nối Cloudflare Worker" rồi nhập URL + ADMIN_KEY để ghi thẳng lên KV.') + '</span></span>' +
        '<button class="btn ghost sm" id="ovConn">' + ic('key', 'i-s') + (ONLINE ? 'Kiểm tra lại' : 'Nối Worker') + '</button></div>';
    var od = box.querySelector('#ovDoc');
    if (od) od.addEventListener('click', function () { show('doctor'); runDoctor(); });
    var oc = box.querySelector('#ovConn');
    if (oc) oc.addEventListener('click', function () {
      $('#scConnect').classList.remove('hide'); setSetup(true);
      $('#scConnect').scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (ONLINE) health();
    });
    box.querySelectorAll('[data-go2]').forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.go2); });
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
    ['overview', 'list', 'quick', 'new', 'edit', 'doctor', 'cmts', 'stats', 'log', 'settings', 'help'].forEach(function (k) {
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
    var raw = String(CUR.countLabel || '');
    var sec = raw.split('/')[1] || '';
    var declared = sec.trim() === '—' ? 0 : (parseInt(sec, 10) || 0);
    if (BOOK.chapters.length === 0) {
      CUR.countLabel = declared > 0 ? ('0/' + declared) : '0/—';
    } else {
      CUR.countLabel = BOOK.chapters.length + '/' + Math.max(declared, BOOK.chapters.length);
    }
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
    renderAuthCfg();
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
    /* cấu hình đăng nhập: lưu trên KV để KHÔNG phải sửa cz-config.js rồi deploy lại.
       cz-config.js vẫn thắng nếu đã điền sẵn ở đó (xem cz-auth.js → applySettings). */
    var auth = {
      provider: $('#aProvider') ? $('#aProvider').value : 'supabase',
      supabaseUrl: $('#aUrl') ? $('#aUrl').value.trim().replace(/\/+$/, '') : '',
      supabaseAnonKey: $('#aKey') ? $('#aKey').value.trim() : '',
      googleClientId: $('#aGoogle') ? $('#aGoogle').value.trim() : '',
      adminEmails: ($('#aAdmins') ? $('#aAdmins').value : '').split(',')
        .map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean)
    };
    REG.settings = Object.assign({}, REG.settings, {
      giscus: { repo: $('#sGiscusRepo').value.trim(), repoId: $('#sGiscusId').value.trim() },
      donation: don,
      report: rep,
      auth: auth,
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
  /* Lượt đọc/bình chọn do Worker đếm rồi lưu trên KV — không cần Firebase nữa. */
  function loadStats(force) {
    var st = $('#stState');
    st.className = 'msgbar show info';
    st.innerHTML = '<span class="spin"></span> đang đọc số liệu từ KV…';
    var p = force && ONLINE ? api('/api/stats/refresh', { method: 'POST' }).catch(function () {}) : Promise.resolve();
    p.then(function () {
      if (force) CZ._memo.stats = null;
      /* Worker bản mới có /api/admin/stats: kèm chuỗi 60 ngày + phiếu theo từng chương */
      if (!ONLINE) return CZ.stats().then(function (d) { return { d: d, days: null, detail: false }; });
      return api('/api/admin/stats').then(function (a) {
        return { d: { on: true, items: a.items || {}, source: 'kv', saved: a.updatedAt }, days: a.days || [], detail: true };
      }).catch(function () {
        return CZ.stats().then(function (d) { return { d: d, days: null, detail: false }; });
      });
    }).then(function (pack) {
      var d = pack.d, items = (d && d.items) || {};
      var keys = Object.keys(items);
      var by = {}; (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
      var sum = function (f) { return keys.reduce(function (a, k) { return a + (Number(items[k][f]) || 0); }, 0); };
      var chapTotal = keys.reduce(function (a, k) {
        var cv = items[k].chapVotes || {};
        return a + Object.keys(cv).reduce(function (b, c) { return b + (Number(cv[c]) || 0); }, 0);
      }, 0);
      $('#stTiles').innerHTML = [['Bộ có số liệu', num(keys.length)], ['Tổng lượt đọc', num(sum('views'))],
        ['Lượt đọc hôm nay', num(sum('viewsDay'))], ['Tổng phiếu thích', num(sum('votes'))],
        ['Phiếu trong tuần', num(sum('votesWeek'))], ['Phiếu theo chương', num(chapTotal)]]
        .map(function (r) { return '<div class="tile"><b>' + r[1] + '</b><span>' + r[0] + '</span></div>'; }).join('');
      STATS_LAST = { items: items, by: by };
      drawChart(pack.days);
      if (!keys.length) {
        st.className = 'msgbar show err';
        st.innerHTML = 'Chưa có lượt đọc/bình chọn nào trên KV. Số sẽ tự tăng khi người đọc mở chương hoặc bấm <b>Thích</b> ' +
          'trên web (Worker ghi qua <code>/api/view</code>, <code>/api/vote</code>). Muốn giữ số của site cũ thì bấm ' +
          '<b>Nhập số cũ từ Firebase</b> — chỉ cần làm 1 lần.';
        $('#stTb').innerHTML = '';
        return;
      }
      st.className = 'msgbar show ok';
      st.textContent = 'Số liệu thật · nguồn: ' + (d.source || 'kv') + (d.saved ? ' · cập nhật ' + CZ.timeAgo(d.saved) : '') +
        (d.stale ? ' (bản lưu trong máy)' : '') + (pack.detail ? '' : ' · Worker bản cũ nên chưa có chuỗi ngày/phiếu theo chương');
      var list = keys.map(function (k) { return Object.assign({ _k: k }, items[k]); })
        .sort(function (a, b) { return (b.views || 0) - (a.views || 0); }).slice(0, 80);
      var maxV = Math.max(1, list.reduce(function (a, r) { return Math.max(a, r.views || 0); }, 0));
      $('#stTb').innerHTML = '<thead><tr><th>#</th><th>Bộ truyện</th><th>Lượt đọc</th><th>Hôm nay</th>' +
        '<th>Phiếu thích</th><th>Tuần</th><th>Người bầu</th><th>Chương được thích nhiều</th></tr></thead><tbody>' +
        list.map(function (r, i) {
          var n = by[r._k] || {};
          var cv = r.chapVotes || {};
          var top = Object.keys(cv).sort(function (a, b) { return cv[b] - cv[a]; }).slice(0, 3)
            .map(function (c) { return 'ch' + c + ' (' + cv[c] + ')'; }).join(', ');
          return '<tr><td>' + (i + 1) + '</td>' +
            '<td>' + (n.title ? esc(n.title) : esc(r._k)) + '</td>' +
            '<td><b>' + num(r.views) + '</b><i class="minibar" style="width:' + Math.round(60 * (r.views || 0) / maxV) + 'px"></i></td>' +
            '<td>' + num(r.viewsDay) + '</td>' +
            '<td><b>' + num(r.votes) + '</b></td><td>' + num(r.votesWeek) + '</td>' +
            '<td>' + num(r.voters || 0) + '</td>' +
            '<td class="sm">' + esc(top || '—') + '</td></tr>';
        }).join('') + '</tbody>';
    }).catch(function (e) {
      st.className = 'msgbar show err';
      st.textContent = 'Lỗi đọc số liệu: ' + e.message;
    });
  }
  var STATS_LAST = { items: {}, by: {} };
  /* kéo số lượt đọc/phiếu của site cũ (Firestore) về KV — làm 1 lần là đủ */
  function importFbStats() {
    var st = $('#stState');
    st.className = 'msgbar show info';
    st.innerHTML = '<span class="spin"></span> đang đọc số cũ từ Firebase…';
    api('/api/stats/import-firebase', { method: 'POST' }).then(function (r) {
      msg('Đã nạp số cũ của ' + num(r.updated) + ' bộ vào KV.', 'ok');
      loadStats(true);
    }).catch(function (e) {
      st.className = 'msgbar show err';
      st.innerHTML = 'Không nhập được: ' + esc(e.message) +
        ' — Firestore đang chặn quyền đọc. Mở rules 1 lần (worker/README.md §5) rồi bấm lại, hoặc bỏ qua: web vẫn đếm số mới bình thường.';
    });
  }

  /* ======================= BÁC SĨ DỮ LIỆU =================================
     Đối chiếu 3 nguồn cho từng bộ:
       · registry  — con số đang hiện ngoài web (trang chủ, trang truyện, mục lục)
       · KV        — kho chương người đọc THẬT SỰ nhận (bản này thắng)
       · repo      — file /data/book/<slug>.json trên GitHub
     Lệch nhau là web hiện sai số chương. Đây chính là bệnh "Be My Angel chỉ có 29
     chương mà web vẫn hiện 30": sửa file trong repo nhưng bản trên KV chưa được nạp lại. */
  var DOC = { rows: [], at: '', scanned: 0 };
  function docState(text, kind) {
    var el = $('#docState');
    if (!el) return;
    el.className = 'msgbar' + (text ? ' show ' + (kind || 'info') : '');
    el.innerHTML = text || '';
  }
  function fetchRepoBook(slug) {
    return fetch('/data/book/' + encodeURIComponent(slug) + '.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function fetchKvBook(slug) {
    if (!ONLINE) return Promise.resolve(null);
    return api('/api/book/' + encodeURIComponent(slug), { auth: false })
      .then(function (b) { return (b && b.chapters) ? b : null; })
      .catch(function () { return null; });
  }
  /* chạy nhiều việc cùng lúc nhưng giới hạn số luồng để không nghẽn trình duyệt */
  function pool(items, limit, run) {
    var i = 0, busy = 0;
    return new Promise(function (res) {
      function next() {
        if (i >= items.length && !busy) return res();
        while (busy < limit && i < items.length) {
          (function (it) {
            busy++;
            Promise.resolve(run(it)).then(function () { busy--; next(); }, function () { busy--; next(); });
          })(items[i++]);
        }
      }
      next();
    });
  }
  /* Gom những tiêu đề chương xuất hiện hơn một lần. Hai bệnh này khác nhau hẳn,
     đừng gộp làm một mà bảo người dùng "chắc đăng trùng":
       · lặp cả tiêu đề LẪN nội dung → chương bị đăng trùng 2 lần → phải xoá 1 bản;
       · lặp mỗi tiêu đề, chữ khác nhau → hai chương thật khác nhau bị đặt TRÙNG TÊN
         (thường là đánh số nhầm: Be My Angel có 2 chương cùng ghi "Chương 16", rồi nhảy
         thẳng sang 18 → chương thứ hai thực ra là Chương 17, chỉ sửa tên, xoá là mất truyện). */
  function chapWords(html) {
    /* Bản đảo chữ của một chương để đem so: bỏ <style>/<script>, bỏ thẻ, mở entity,
       rồi bỏ mọi dấu câu/thặng thừa. Chỉ cần biết "chữ có giống nhau không" — so nguyên
       chuỗi HTML thì 2 bản giống hết vẫn bị báo khác vì đổi <p> thành <div>. */
    var t = String(html || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ');
    t = t.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ');
    t = t.replace(/&quot;|&#39;|&apos;|&lt;|&gt;|&amp;/gi, ' ');
    t = t.toLowerCase().replace(/[^a-z0-9\u00c0-\u1eff\s]/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }
  function dupGroups(chs) {
    var by = {}, order = [];
    (chs || []).forEach(function (c, i) {
      var t = String((c && c.t) || '').trim();
      if (!t) return;
      var k = t.toLowerCase();
      if (!by[k]) { by[k] = { t: t, at: [], body: [] }; order.push(k); }
      by[k].at.push(i + 1);
      by[k].body.push(chapWords(c && c.html));
    });
    return order.map(function (k) {
      var g = by[k], word = g.body.filter(function (b) { return b; });
      return {
        t: g.t, n: g.at.length, at: g.at,
        same: word.length > 1 && word.every(function (b) { return b === word[0]; }),
        countable: word.length > 1
      };
    }).filter(function (g) { return g.n > 1; });
  }
  /* số chương bị nhảy (đã có "Chương 5" và "Chương 7" mà thiếu 6) — bằng chứng cho ca đặt tên nhầm */
  function chapterGaps(chs) {
    var have = {}, out = [];
    (chs || []).forEach(function (c) {
      var m = /^\s*(?:chương|chuong)\s*(\d+)/i.exec(String((c && c.t) || ''));
      if (m) have[parseInt(m[1], 10)] = 1;
    });
    var ks = Object.keys(have).map(Number).sort(function (a, b) { return a - b; });
    if (ks.length < 2) return out;
    for (var i = ks[0]; i <= ks[ks.length - 1]; i++) if (!have[i]) out.push(i);
    return out;
  }
  function runDoctor() {
    if (!REG) return;
    var lib = (REG.lib || []).slice();
    DOC = { rows: [], at: new Date().toISOString(), scanned: lib.length };
    docState('<span class="spin"></span> đang đối chiếu ' + lib.length + ' bộ · registry ↔ KV ↔ repo…', 'info');
    var done = 0;
    return pool(lib, 5, function (n) {
      var slug = n.slug;
      if (!slug) {
        DOC.rows.push({ n: n, slug: '', reg: Number(n.chapters) || 0, kv: null, repo: null, issues: ['noslug'] });
        return;
      }
      return Promise.all([fetchKvBook(slug), fetchRepoBook(slug)]).then(function (rs) {
        var kv = rs[0], repo = rs[1];
        var kvN = kv && kv.chapters ? kv.chapters.length : null;
        var repoN = repo && repo.chapters ? repo.chapters.length : null;
        var regN = Number(n.chapters) || 0;
        /* số "thật" để đối chiếu: KV thắng (đó là thứ người đọc nhận), repo là phương án 2 */
        var real = kvN != null ? kvN : repoN;
        var issues = [];
        var lab = String(n.countLabel || '').trim();
        /* cho phép 0/— cho truyện chưa ra, không báo lỗi */
        var m = /^(\d+)\s*\/\s*(\d+|—)$/.exec(lab);
        if (!m) {
          /* nếu là Sắp ra mắt 0 chương mà không có nhãn, cũng không coi là lỗi */
          if (!(regN === 0 && CZ.statusCls(n.status) === 'soon' && !lab)) issues.push('label');
        } else {
          if (m[2] === '—') {
            if (regN !== 0 && parseInt(m[1], 10) !== regN) issues.push('labelReg');
          } else if (parseInt(m[1], 10) !== regN) issues.push('labelReg');
        }
        if (real != null && regN !== real) {
          /* truyện chưa ra (0 chương) thì không báo thiếu — đúng theo yêu cầu */
          if (!(regN === 0 && CZ.statusCls(n.status) === 'soon' && real === 0)) issues.push('regVsReal');
        }
        if (kvN != null && repoN != null && kvN !== repoN) issues.push('kvVsRepo');
        if (ONLINE && kvN == null && regN > 0) issues.push('kvMissing');
        if (kvN == null && repoN == null && regN > 0) issues.push('noSource');
        var src = kv || repo;
        var dups = [], gaps = [];
        if (src && src.chapters) {
          dups = dupGroups(src.chapters);
          if (dups.length) gaps = chapterGaps(src.chapters);
          var sameN = dups.filter(function (d) { return d.same; }).length;
          var diffN = dups.length - sameN;
          if (sameN) issues.push('dupSame:' + sameN);
          if (diffN) issues.push('dupTitle:' + diffN);
          var empty = src.chapters.filter(function (c) { return !String((c && c.html) || '').trim(); }).length;
          if (empty) issues.push('empty:' + empty);
        }
        if (!String(n.thumb || '').trim()) issues.push('nothumb');
        if (!String(n.syn || n.synFull || '').trim()) issues.push('nosyn');
        if (!String(n.author || '').trim()) issues.push('noauthor');
        if (!String(n.year || '').trim()) issues.push('noyear');
        DOC.rows.push({ n: n, slug: slug, reg: regN, kv: kvN, repo: repoN, real: real,
          dups: dups, gaps: gaps, issues: issues });
        done++;
        if (done % 10 === 0) docState('<span class="spin"></span> đã soi ' + done + '/' + lib.length + ' bộ…', 'info');
      });
    }).then(function () { renderDoctor(); });
  }
  var DOC_LABEL = {
    regVsReal: ['bad', 'Số chương ngoài web ≠ số chương thật', 'registry ghi {reg}, kho chương có {real} — người đọc thấy sai số'],
    kvVsRepo: ['bad', 'KV lệch file trong repo GitHub', 'KV có {kv} chương, repo có {repo} — bạn sửa repo nhưng chưa nạp lên KV. Bấm "Nạp chương từ repo lên KV"'],
    kvMissing: ['warn', 'KV chưa có chương nào', 'registry nói có {reg} chương nhưng KV trống — người đọc bấm vào sẽ không thấy chữ'],
    noSource: ['warn', 'Không tìm thấy chương ở đâu cả', 'cả KV lẫn repo đều không có file chương'],
    label: ['warn', 'Nhãn số chương sai định dạng', 'đang là "{lab}", nên là "29/29" hoặc "0/—" cho truyện chưa ra'],
    labelReg: ['warn', 'Nhãn lệch với trường số chương', 'nhãn "{lab}" nhưng trường chapters = {reg}'],
    nothumb: ['warn', 'Thiếu ảnh bìa', ''],
    nosyn: ['warn', 'Thiếu mô tả', ''],
    noauthor: ['warn', 'Thiếu tác giả', ''],
    noyear: ['warn', 'Thiếu năm', ''],
    noslug: ['bad', 'Thiếu slug', 'không mở được trang truyện'],
    dupSame: ['bad', 'Chương bị đăng trùng (cùng tên, cùng nội dung)',
      'mở tab Sửa bộ → Sửa chương, xoá bản thừa, rồi bấm "Nạp chương từ repo lên KV" + "Đếm lại số chương trên KV"'],
    dupTitle: ['warn', 'Trùng tiêu đề nhưng nội dung khác — chương bị đặt nhầm tên/nhầm số',
      'KHÔNG phải đăng trùng. Mở tab Sửa bộ → Sửa chương rồi đổi lại tên cho đúng (xoá là mất 1 chương thật)']
  };
  /* dòng mô tả chi tiết cho 2 loại trùng tiêu đề: chỉ rõ chương nào, tên gì, có nhảy số không */
  function dupText(r, same) {
    var g = (r.dups || []).filter(function (x) { return !!x.same === same; });
    if (!g.length) return '';
    var s = g.map(function (x) {
      return 'chương #' + (x.at || []).join(', #') + ' cùng tên “' + x.t + '”' +
        (x.same ? ' — chữ giống nhau' : (x.countable ? ' — chữ khác nhau' : ' — chưa so được vì chương rỗng'));
    }).join(' · ');
    if (!same && (r.gaps || []).length) {
      s += ' · dãy chương nhảy số, thiếu Chương ' + r.gaps.join(' & Chương ') +
        ' → bản đứng sau chính là Chương ' + r.gaps[0];
    }
    return s;
  }
  function renderDoctor() {
    var rows = DOC.rows;
    var bad = rows.filter(function (r) { return r.issues.some(function (i) { return (DOC_LABEL[i.split(':')[0]] || [])[0] === 'bad'; }); });
    var warn = rows.filter(function (r) { return !bad.includes(r) && r.issues.length; });
    var ok = rows.length - bad.length - warn.length;
    var tiles = [
      ['Đã soi', num(rows.length)], ['Sai nghiêm trọng', num(bad.length)],
      ['Cần xem lại', num(warn.length)], ['Gọn gàng', num(ok)]
    ];
    $('#docTiles').innerHTML = tiles.map(function (t) {
      return '<div class="tile"><b>' + t[1] + '</b><span>' + t[0] + '</span></div>';
    }).join('');
    var order = bad.concat(warn);
    $('#docSel').textContent = DOC.at ? ('soi lúc ' + new Date(DOC.at).toLocaleTimeString('vi-VN') +
      (ONLINE ? ' · nguồn KV: có' : ' · chưa nối Worker nên chỉ so repo')) : '';
    if (!order.length) {
      $('#docList').innerHTML = '<div class="docrow good"><span class="di">' + ic('check', 'i-s') + '</span>' +
        '<span class="dt"><b>Dữ liệu khớp nhau cả ba nguồn</b><span>registry, KV và repo đang nói cùng một số chương. ' +
        'Nếu ngoài web vẫn hiện số cũ thì đó là cache trình duyệt — bấm Ctrl+F5 hoặc vào tab Cài đặt → "Xoá cache số liệu".</span></span></div>';
      docState('Xong: ' + rows.length + ' bộ, không thấy lệch.', 'ok');
      return;
    }
    $('#docList').innerHTML = order.slice(0, 200).map(function (r, i) {
      var lvl = bad.indexOf(r) >= 0 ? 'bad' : 'warn';
      /* bệnh nằm ở kho chương (trùng tên, chương rỗng) thì mở thẳng vào danh sách chương */
      var onChap = r.issues.some(function (k) { return /^(dupSame|dupTitle|empty)$/.test(k.split(':')[0]); });
      var bits = r.issues.map(function (k) {
        var key = k.split(':')[0], extra = k.indexOf(':') > 0 ? k.slice(k.indexOf(':') + 1) : '';
        var L = DOC_LABEL[key] || ['warn', key, ''];
        var txt = L[2]
          .replace('{reg}', r.reg).replace('{real}', r.real == null ? '—' : r.real)
          .replace('{kv}', r.kv == null ? '—' : r.kv).replace('{repo}', r.repo == null ? '—' : r.repo)
          .replace('{lab}', String(r.n.countLabel || ''));
        if (key === 'dupSame' || key === 'dupTitle') {
          /* 'extra' chỉ là số nhóm trùng — vô dụng khi đã liệt kê đúng chương nào ở dưới */
          txt = dupText(r, key === 'dupSame') + (txt ? ' — ' + txt : '');
        }
        if (key === 'empty') txt = extra + ' chương chưa có nội dung';
        return '<b>' + esc(L[1]) + '</b>' + (txt ? '<span>' + esc(txt) + '</span>' : '');
      }).join('');
      return '<div class="docrow ' + lvl + '"><span class="di">' + ic(lvl === 'bad' ? 'alert' : 'info', 'i-s') + '</span>' +
        '<span class="dt"><b>' + esc(r.n.title || r.slug || '(thiếu tên)') + '</b>' +
        '<span class="sm muted">slug <code>' + esc(r.slug || '—') + '</code> · registry <b>' + r.reg +
        '</b> · KV <b>' + (r.kv == null ? '—' : r.kv) + '</b> · repo <b>' + (r.repo == null ? '—' : r.repo) + '</b></span>' +
        bits + '</span>' +
        '<span class="row" style="gap:6px"><button class="btn ghost sm" data-docedit="' + i + '" data-docfocus="' + (onChap ? 'chap' : 'meta') + '">' + ic('edit', 'i-s') + (onChap ? 'Sửa chương' : 'Sửa') + '</button></span></div>';
    }).join('');
    $$('#docList [data-docedit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = order[parseInt(b.dataset.docedit, 10)];
        if (r && r.slug) openEdit(r.slug, b.dataset.docfocus === 'chap' ? 'chap' : 'meta');
      });
    });
    docState('Xong: ' + bad.length + ' bộ sai nghiêm trọng, ' + warn.length + ' bộ cần xem lại (trong ' + rows.length + ' bộ đã soi).', bad.length ? 'err' : 'ok');
  }
  /* sửa nhãn + số chương trong registry theo số thật vừa soi được */
  function docFixRegistry() {
    if (!DOC.rows.length) return toast('Quét trước đã', 'err');
    var n = 0;
    DOC.rows.forEach(function (r) {
      if (r.real == null || !r.n) return;
      var wantLabel = r.real === 0 ? '0/—' : (r.real + '/' + r.real);
      if (Number(r.n.chapters) === r.real && String(r.n.countLabel) === wantLabel) return;
      r.n.chapters = r.real;
      r.n.countLabel = wantLabel;
      r.n.count = r.n.countLabel;
      n++;
    });
    if (!n) return toast('Không có gì phải sửa trong registry', 'info');
    saveRegistry('Đã sửa số chương của ' + n + ' bộ theo kho chương thật').then(function () { renderList(); renderOverview(); });
  }
  function docRecount() {
    if (!ONLINE) return msg('Cần nối Worker để đếm lại trên KV.', 'err');
    var b = $('#docRecount'); b.disabled = true; b.innerHTML = '<span class="spin"></span> đang đếm…';
    api('/api/recount', { method: 'POST' }).then(function (r) {
      msg('Đã đếm lại ' + num(r.books) + ' bộ trên KV · sửa ' + num((r.fixed || []).length) + ' bộ' +
        ((r.missing || []).length ? ' · ' + r.missing.length + ' bộ không có chương trên KV' : ''), (r.fixed || []).length ? 'ok' : 'info');
      toast('Đã đếm lại số chương', 'ok');
      return loadRegistry().then(function () { return runDoctor(); });
    }).catch(function (e) {
      msg('Không đếm lại được: ' + e.message + (String(e.message).indexOf('không có endpoint') >= 0
        ? ' — Worker đang chạy là bản cũ, dán lại worker/cms.js rồi Deploy (xem worker/README.md).' : ''), 'err');
    }).then(function () { b.disabled = false; b.textContent = 'Đếm lại số chương trên KV'; });
  }
  /* nạp chương từ repo lên KV — chữa tận gốc khi KV lệch repo */
  function docPushRepo() {
    if (!ONLINE) return msg('Cần nối Worker trước.', 'err');
    var targets = DOC.rows.filter(function (r) {
      return r.repo != null && (r.kv == null || r.kv !== r.repo || r.reg !== r.repo);
    });
    if (!targets.length) targets = DOC.rows.filter(function (r) { return r.repo != null; });
    if (!targets.length) return msg('Không tìm thấy file chương nào trong repo để nạp.', 'err');
    CZ.confirm('Nạp ' + targets.length + ' bộ từ file trong repo lên KV?\nChương trên KV của những bộ này sẽ bị ghi đè bằng bản trong repo (bản bạn đã sửa trên GitHub).', 'Nạp lên KV')
      .then(function (ok) {
        if (!ok) return;
        var b = $('#docFixKv'); b.disabled = true;
        var done = 0, fail = [];
        return pool(targets, 4, function (r) {
          b.innerHTML = '<span class="spin"></span> ' + (++done) + '/' + targets.length;
          return fetchRepoBook(r.slug).then(function (bk) {
            if (!bk) { fail.push(r.slug); return; }
            return api('/api/book/' + encodeURIComponent(r.slug), { method: 'PUT', body: bk })
              .catch(function () { fail.push(r.slug); });
          });
        }).then(function () {
          b.disabled = false; b.textContent = '↑ Nạp chương từ repo lên KV (sửa gốc)';
          msg('Đã nạp ' + (targets.length - fail.length) + '/' + targets.length + ' bộ lên KV' +
            (fail.length ? ' · lỗi: ' + fail.slice(0, 6).join(', ') : ''), fail.length ? 'err' : 'ok');
          toast('Đã nạp chương từ repo lên KV', 'ok');
          return loadRegistry().then(function () { renderList(); renderOverview(); return runDoctor(); });
        });
      });
  }

  /* ======================= KIỂM DUYỆT BÌNH LUẬN =========================== */
  var MOD = { all: [], q: '', slug: '' };
  function modState(text, kind) {
    var el = $('#cmState');
    if (!el) return;
    el.className = 'msgbar' + (text ? ' show ' + (kind || 'info') : '');
    el.innerHTML = text || '';
  }
  function fillModBooks() {
    var sel = $('#cmBook');
    if (!sel || !REG) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">Mọi bộ truyện</option>' + (REG.lib || []).slice()
      .sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'vi'); })
      .map(function (n) { return '<option value="' + esc(n.slug) + '">' + esc(n.title) + '</option>'; }).join('');
    sel.value = cur;
  }
  function loadMod() {
    if (!ONLINE) { modState('Cần nối Worker để đọc bình luận (bình luận nằm trên KV).', 'err'); return Promise.resolve(); }
    modState('<span class="spin"></span> đang đọc bình luận từ KV…', 'info');
    return api('/api/admin/comments?limit=800').then(function (r) {
      MOD.all = r.comments || [];
      paintMod();
      modState('Có ' + num(MOD.all.length) + ' bình luận trên ' + num(r.slugs || 0) + ' bộ.', 'ok');
    }).catch(function (e) {
      /* Worker bản cũ chưa có /api/admin/comments → gom từng bộ một */
      var lib = (REG && REG.lib) || [];
      return pool(lib, 5, function (n) {
        return api('/api/comments/' + encodeURIComponent(n.slug) + '?limit=200', { auth: false }).then(function (r) {
          (r.comments || []).forEach(function (c) { MOD.all.push(Object.assign({ slug: n.slug }, c)); });
        }).catch(function () {});
      }).then(function () {
        MOD.all.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
        paintMod();
        modState('Worker chưa có /api/admin/comments nên đã gom từng bộ: ' + num(MOD.all.length) + ' bình luận. ' +
          'Dán worker/cms.js mới rồi Deploy để có trang kiểm duyệt đầy đủ.', 'info');
      });
    });
  }
  function paintMod() {
    var q = MOD.q.toLowerCase(), by = {};
    if (REG) (REG.lib || []).forEach(function (n) { by[n.slug] = n; });
    var rows = MOD.all.filter(function (c) {
      if (MOD.slug && c.slug !== MOD.slug) return false;
      if (!q) return true;
      return (String(c.text || '') + ' ' + String(c.name || '') + ' ' + String(c.slug || '')).toLowerCase().indexOf(q) >= 0;
    });
    var byDay = {};
    MOD.all.forEach(function (c) { var d = String(c.createdAt || '').slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
    var today = new Date().toISOString().slice(0, 10);
    $('#cmTiles').innerHTML = [
      ['Tổng bình luận', num(MOD.all.length)], ['Hôm nay', num(byDay[today] || 0)],
      ['Người gửi khác nhau', num(Object.keys(MOD.all.reduce(function (a, c) { a[c.uid || c.name] = 1; return a; }, {})).length)],
      ['Đang hiện', num(rows.length)]
    ].map(function (t) { return '<div class="tile"><b>' + t[1] + '</b><span>' + t[0] + '</span></div>'; }).join('');
    var box = $('#cmList');
    if (!rows.length) { box.innerHTML = '<div class="empty sm">Chưa có bình luận nào khớp.</div>'; return; }
    box.innerHTML = rows.slice(0, 400).map(function (c) {
      var n = by[c.slug] || {};
      var av = c.picture ? '<img class="modava" src="' + esc(c.picture) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
        : '<span class="modava">' + esc(String(c.name || 'B')[0].toUpperCase()) + '</span>';
      return '<div class="modrow" data-id="' + esc(c.id) + '" data-slug="' + esc(c.slug) + '">' + av +
        '<span class="mb2"><span class="mh2"><b>' + esc(c.name || 'Bạn đọc') + '</b>' +
          '<span>' + esc(CZ.timeAgo(c.createdAt)) + '</span>' +
          (c.ch ? '<span class="pill acc">chương ' + esc(c.ch) + '</span>' : '') +
          (c.parentId ? '<span class="pill">trả lời</span>' : '') +
          '<a class="mslug" href="' + esc(CZ.storyURL(c.slug)) + '" target="_blank" rel="noopener">' + esc(n.title || c.slug) + ' ↗</a></span>' +
          '<span class="mt2">' + esc(c.text) + '</span></span>' +
        '<button class="btn ghost sm" data-modd title="Xoá bình luận này">' + ic('trash', 'i-s') + '</button></div>';
    }).join('');
    $$('#cmList [data-modd]').forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('.modrow');
        delMod(row.dataset.slug, row.dataset.id);
      });
    });
  }
  function delMod(slug, id) {
    CZ.confirm('Xoá bình luận này khỏi KV? Không khôi phục được.', 'Xoá').then(function (ok) {
      if (!ok) return;
      api('/api/comments/' + encodeURIComponent(slug) + '/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () {
          MOD.all = MOD.all.filter(function (c) { return c.id !== id; });
          paintMod(); toast('Đã xoá bình luận', 'ok');
        })
        .catch(function (e) {
          toast('Không xoá được: ' + e.message, 'err');
        });
    });
  }

  /* ======================= NHẬT KÝ HOẠT ĐỘNG ============================= */
  function loadLog() {
    if (!ONLINE) { $('#logState').className = 'msgbar show err'; $('#logState').textContent = 'Cần nối Worker để đọc nhật ký.'; return; }
    $('#logState').className = 'msgbar show info';
    $('#logState').innerHTML = '<span class="spin"></span> đang đọc nhật ký…';
    api('/api/admin/log').then(function (r) {
      var items = r.items || [];
      $('#logState').className = 'msgbar show ok';
      $('#logState').textContent = items.length ? (items.length + ' thao tác gần nhất (Worker giữ tối đa 200 dòng).') : 'Chưa có thao tác nào được ghi.';
      $('#logList').innerHTML = items.map(function (l) {
        return '<div class="logrow"><time>' + esc(String(l.at || '').replace('T', ' ').slice(0, 19)) + '</time>' +
          '<span class="lw">' + esc(l.who || '—') + '</span><b>' + esc(l.text || '') + '</b></div>';
      }).join('') || '<div class="empty sm">Trống.</div>';
    }).catch(function (e) {
      $('#logState').className = 'msgbar show err';
      $('#logState').textContent = 'Không đọc được nhật ký: ' + e.message +
        (String(e.message).indexOf('không có endpoint') >= 0 ? ' — Worker đang là bản cũ, dán worker/cms.js mới rồi Deploy.' : '');
    });
  }

  /* ======================= BIỂU ĐỒ + CSV SỐ LIỆU ========================= */
  function drawChart(days) {
    var box = $('#stChart');
    if (!box) return;
    var d = (days || []).slice(-30);
    if (!d.length) { box.innerHTML = '<div class="empty sm">Chưa có dữ liệu theo ngày trên KV (Worker bản mới ghi chuỗi ngày khi có lượt đọc/phiếu).</div>'; return; }
    var W = 900, H = 150, pad = 18;
    var max = Math.max(1, d.reduce(function (a, x) { return Math.max(a, x.views || 0, x.votes || 0); }, 0));
    var bw = (W - pad * 2) / d.length;
    function h(v) { return Math.round((H - 26) * (v / max)); }
    var bars = d.map(function (x, i) {
      var x0 = pad + i * bw;
      var hv = h(x.views || 0), ho = h(x.votes || 0);
      var t = x.day + ': ' + (x.views || 0) + ' lượt đọc, ' + (x.votes || 0) + ' phiếu';
      return '<rect x="' + (x0 + bw * 0.14).toFixed(1) + '" y="' + (H - 16 - hv) + '" width="' + (bw * 0.36).toFixed(1) + '" height="' + hv + '" fill="var(--acc)" rx="1.5"><title>' + esc(t) + '</title></rect>' +
        '<rect x="' + (x0 + bw * 0.52).toFixed(1) + '" y="' + (H - 16 - ho) + '" width="' + (bw * 0.36).toFixed(1) + '" height="' + ho + '" fill="var(--ok)" rx="1.5"><title>' + esc(t) + '</title></rect>';
    }).join('');
    var labels = [0, Math.floor(d.length / 2), d.length - 1].map(function (i) {
      if (!d[i]) return '';
      return '<text class="ax" x="' + (pad + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(String(d[i].day).slice(5)) + '</text>';
    }).join('');
    box.innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Lượt đọc và phiếu thích 30 ngày">' +
      '<line x1="' + pad + '" y1="' + (H - 16) + '" x2="' + (W - pad) + '" y2="' + (H - 16) + '" stroke="var(--bd)" />' +
      '<text class="ax" x="' + pad + '" y="10">cao nhất ' + num(max) + '</text>' + bars + labels + '</svg>';
  }
  function statsCsv(items, by) {
    var head = ['slug', 'ten', 'luot_doc', 'doc_hom_nay', 'doc_tuan', 'phieu', 'phieu_tuan', 'phieu_thang', 'so_nguoi_bau'];
    var lines = [head.join(',')];
    Object.keys(items).forEach(function (k) {
      var r = items[k] || {}, n = by[k] || {};
      lines.push([k, '"' + String(n.title || '').replace(/"/g, '""') + '"', r.views || 0, r.viewsDay || 0, r.viewsWeek || 0,
        r.votes || 0, r.votesWeek || 0, r.votesMonth || 0, r.voters || ''].join(','));
    });
    return lines.join('\n');
  }

  /* ======================= CẤU HÌNH ĐĂNG NHẬP (SUPABASE) ================= */
  function renderAuthCfg() {
    var a = (REG && REG.settings && REG.settings.auth) || {};
    function set(id, v) { var el = $(id); if (el && !el.value) el.value = v || ''; }
    set('#aUrl', a.supabaseUrl || '');
    set('#aKey', a.supabaseAnonKey || '');
    set('#aGoogle', a.googleClientId || '');
    set('#aProvider', a.provider || '');
    if (a.provider && $('#aProvider')) $('#aProvider').value = a.provider;
    set('#aAdmins', Array.isArray(a.adminEmails) ? a.adminEmails.join(', ') : (a.adminEmails || ''));
    paintAuthState();
  }
  function paintAuthState(h) {
    var c = $('#aState');
    if (!c) return;
    if (!h) { c.className = 'chip'; c.innerHTML = '<span class="d"></span><span>chưa kiểm tra</span>'; return; }
    var bits = [];
    bits.push(h.supabase ? 'Supabase: sẵn sàng' : 'Supabase: thiếu SUPABASE_URL');
    bits.push(h.session ? 'session: ok' : 'session: thiếu SESSION_SECRET');
    bits.push(h.google ? 'Google ID: có' : 'Google ID: không');
    bits.push('ADMIN_EMAILS: ' + ((h.adminEmails || []).length || 0));
    c.className = 'chip ' + (h.supabase && h.session ? 'ok' : 'err');
    c.innerHTML = '<span class="d"></span><span>' + esc(bits.join(' · ')) + '</span>';
  }
  function checkAuthWorker() {
    var st = $('#aState');
    if (!ONLINE) { paintAuthState(null); return msg('Cần nối Worker để kiểm tra.', 'err'); }
    if (st) { st.className = 'chip'; st.innerHTML = '<span class="spin"></span><span>đang hỏi Worker…</span>'; }
    api('/api/health', { auth: false }).then(function (h) {
      paintAuthState(h.auth || null);
      if (!h.auth) msg('Worker đang là bản cũ (không có mục auth trong /api/health) — dán worker/cms.js mới rồi Deploy.', 'err');
      else msg('Worker: ' + (h.auth.supabase ? 'đã bật Supabase' : 'CHƯA bật Supabase (thiếu SUPABASE_URL)') +
        ' · ' + (h.auth.session ? 'có SESSION_SECRET' : 'thiếu SESSION_SECRET'), h.auth.supabase ? 'ok' : 'err');
    }).catch(function (e) { msg('Không hỏi được Worker: ' + e.message, 'err'); });
  }

  /* biểu tượng viết trong HTML: <span data-ic="search"> → hình thật */
  $$('[data-ic]').forEach(function (el) { el.outerHTML = ic(el.dataset.ic); });

  /* ======================= CỔNG VÀO TRANG QUẢN TRỊ ========================
     Người đọc thường KHÔNG vào được: mục Quản trị ngoài web đã bị ẩn, và ở đây
     cũng chặn. Hai cách qua cổng:
       (a) đăng nhập Google/Supabase bằng email nằm trong danh sách quản trị;
       (b) nhập đúng ADMIN_KEY của Worker (dành cho lúc chưa bật Supabase).    */
  var AUTHED = false;
  function authUser() { return (window.CZ_AUTH && CZ_AUTH.current && CZ_AUTH.current()) || null; }
  function isAdmin() { return !!(window.CZ_AUTH && CZ_AUTH.isAdmin && CZ_AUTH.isAdmin()); }
  function gateMsg(text, kind) {
    var g = $('#gateMsg');
    if (!g) return;
    g.className = 'msgbar' + (text ? ' show ' + (kind || 'info') : '');
    g.textContent = text || '';
  }
  function paintWho() {
    var u = authUser(), box = $('#whoBox'), rb = $('#roleBadge'), lo = $('#btnLogout');
    var ge = $('#gateEmails');
    var emails = (window.CZ_AUTH && CZ_AUTH.adminEmails) ? CZ_AUTH.adminEmails() : (window.CZ_ADMIN_EMAILS || []);
    if (ge) ge.textContent = emails.length ? emails.join(', ') : '(chưa khai email nào trong cz-config.js)';
    if (box) {
      box.classList.toggle('hide', !u);
      box.innerHTML = u
        ? (u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">'
                     : '<span class="ava">' + esc(String(u.name || u.email || 'A')[0].toUpperCase()) + '</span>') +
          '<span>' + esc(u.name || u.email || '') + '</span>'
        : '';
    }
    if (rb) {
      rb.classList.toggle('hide', !(u && isAdmin()));
      rb.innerHTML = ic('shield', 'i-s') + 'quản trị';
    }
    if (lo) lo.classList.toggle('hide', !u);
    var gw = $('#gateWho');
    if (gw) {
      gw.innerHTML = u
        ? 'Đang đăng nhập: <b>' + esc(u.email || u.name) + '</b> · ' +
          (isAdmin() ? 'có quyền quản trị.' : '<b>không</b> nằm trong danh sách quản trị nên không vào được trang này.')
        : 'Chưa đăng nhập. Email quản trị đang cho phép: <b>' + esc(emails.join(', ') || '—') + '</b>';
    }
  }
  function gatePass(how) {
    AUTHED = true;
    var g = $('#gate'); if (g) g.classList.add('hide');
    paintWho();
  }
  function gateHold(text, kind) {
    AUTHED = false;
    var g = $('#gate'); if (g) g.classList.remove('hide');
    var app = $('#scApp'); if (app) app.classList.add('hide');
    gateMsg(text || '', kind || 'info');
    paintWho();
  }
  function gateTry() {
    if (isAdmin()) { gatePass('login'); return true; }
    return false;
  }

  /* -------------------- lúc mở trang: qua cổng rồi mới làm việc ------------- */
  (function boot() {
    show('overview');                                      /* mở sẵn bảng tổng quan */
    paintWho();
    var savedApi = '', savedKey = '';
    try { savedApi = localStorage.getItem(LS.api) || ''; savedKey = localStorage.getItem(LS.key) || ''; } catch (e) {}
    if (savedApi) $('#inApi').value = savedApi;
    else if (CZ.API) $('#inApi').value = CZ.API;
    if (savedKey) $('#inKey').value = savedKey;
    /* (a) đã đăng nhập đúng tài khoản quản trị → vào thẳng */
    if (gateTry()) {
      if (savedApi && savedKey) { connect(); return; }
      viewStatic(true);
      msg('Đã vào bằng tài khoản quản trị. Nối Worker ở khung trên để sửa là người đọc thấy ngay.', 'ok');
      return;
    }
    /* (b) có khoá ADMIN_KEY đã lưu → thử lại khoá (connect() tự mở cổng nếu đúng) */
    if (savedApi && savedKey) { connect(); return; }
    gateHold('Chọn một cách đăng nhập để vào trang quản trị.', 'info');
  })();
  /* trạng thái đăng nhập đổi (vừa quay về từ Supabase / đăng xuất) → xét lại cổng */
  if (window.CZ_AUTH && CZ_AUTH.onAuth) CZ_AUTH.onAuth(function () {
    paintWho();
    if (isAdmin() && !AUTHED) {
      gatePass('login');
      msg('Đã xác nhận tài khoản quản trị — chào bạn!', 'ok');
      var savedApi = '', savedKey = '';
      try { savedApi = localStorage.getItem(LS.api) || ''; savedKey = localStorage.getItem(LS.key) || ''; } catch (e) {}
      if (savedApi && savedKey) connect(); else viewStatic(true);
    } else if (!isAdmin() && AUTHED && !ONLINE) {
      /* vừa đăng xuất: đóng lại nếu không có khoá quản trị */
      gateHold('Đã đăng xuất. Đăng nhập lại bằng tài khoản quản trị để tiếp tục.', 'info');
    }
  });

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
    if (!AUTHED && !isAdmin()) {
      gateHold('Trang này không mở cho người đọc. Đăng nhập bằng tài khoản quản trị hoặc nhập ADMIN_KEY.', 'err');
      return;
    }
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
      if (k === 'doctor' && !DOC.rows.length) runDoctor();
      if (k === 'cmts') { fillModBooks(); loadMod(); }
      if (k === 'log') loadLog();
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
  ['#sSched', '#sSchedNote', '#sGiscusRepo', '#sGiscusId', '#aUrl', '#aKey', '#aGoogle', '#aAdmins']
    .forEach(function (s) {
      var el = $(s); if (el) el.addEventListener('input', function () { dirty.set = true; markDirty(); });
    });
  ['#aProvider'].forEach(function (s) {
    var el = $(s); if (el) el.addEventListener('change', function () { dirty.set = true; markDirty(); });
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
  $('#btnStatsFb').addEventListener('click', function () { importFbStats(); });
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
    var map = {
      1: 'overview', 2: 'list', 3: 'quick', 4: 'new', 5: 'edit',
      6: 'doctor', 7: 'cmts', 8: 'stats', 9: 'log', 0: 'settings'
    };
    if (map[e.key]) {
      var k = map[e.key];
      if (k === 'edit' && !CUR) return;
      if (k === 'stats') loadStats(false);
      if (k === 'overview') renderOverview();
      if (k === 'doctor' && !DOC.rows.length) runDoctor();
      if (k === 'cmts') { fillModBooks(); loadMod(); }
      if (k === 'log') loadLog();
      show(k);
    }
  });


  /* ------------------- nút ở CỔNG đăng nhập + thanh trên ------------------ */
  $('#gateLogin').addEventListener('click', function () {
    var b = this;
    b.disabled = true; b.innerHTML = '<span class="spin"></span> đang mở đăng nhập…';
    gateMsg('Đang chuyển sang trang đăng nhập… Nếu trình duyệt chặn cửa sổ, hãy cho phép pop-up.', 'info');
    (window.CZ_AUTH ? CZ_AUTH.login() : Promise.resolve(null))
      .then(function () {
        if (!isAdmin()) {
          var u = authUser();
          gateHold(u ? ('Tài khoản ' + (u.email || u.name) + ' KHÔNG nằm trong danh sách quản trị. ' +
            'Thêm email đó vào CZ_ADMIN_EMAILS (cz-config.js) hoặc ADMIN_EMAILS (Worker), hoặc đăng nhập bằng tài khoản khác.')
            : 'Chưa đăng nhập được — kiểm tra cấu hình Supabase trong cz-config.js.', 'err');
        }
      })
      .catch(function () {})
      .then(function () { b.disabled = false; b.textContent = 'Đăng nhập bằng Google / Supabase'; });
  });
  $('#gateKey').addEventListener('click', function () {
    var sc = $('#scConnect');
    if (sc) sc.classList.remove('hide');
    setSetup(true);
    $('#scConnect').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { try { $('#inKey').focus(); } catch (e) {} }, 320);
    gateMsg('Nhập URL Worker + ADMIN_KEY rồi bấm "Kiểm tra & kết nối".', 'info');
  });
  $('#btnLogout').addEventListener('click', function () {
    if (!window.CZ_AUTH) return;
    CZ_AUTH.logout().then(function () {
      paintWho();
      if (!ONLINE) gateHold('Đã đăng xuất.', 'info');
      else msg('Đã đăng xuất tài khoản — phiên này vẫn mở bằng ADMIN_KEY.', 'info');
    });
  });

  /* ------------------------------ BÁC SĨ DỮ LIỆU ------------------------- */
  $('#docRun').addEventListener('click', function () {
    var b = this; b.disabled = true; b.innerHTML = '<span class="spin"></span> đang quét…';
    runDoctor().then(function () { b.disabled = false; b.textContent = 'Quét lại'; },
      function () { b.disabled = false; b.textContent = 'Quét lại'; });
  });
  $('#docFixKv').addEventListener('click', docPushRepo);
  $('#docRecount').addEventListener('click', docRecount);
  $('#docFixReg').addEventListener('click', docFixRegistry);
  $('#docExport').addEventListener('click', function () {
    var rep = {
      at: DOC.at, online: ONLINE, scanned: DOC.scanned,
      rows: DOC.rows.map(function (r) {
        return { slug: r.slug, title: r.n && r.n.title, registry: r.reg, kv: r.kv, repo: r.repo,
          issues: r.issues,
          /* trùng tiêu đề: same=true là đăng trùng thật, same=false là đặt tên nhầm */
          dupTitles: (r.dups || []).map(function (d) { return { t: d.t, at: d.at, same: d.same }; }),
          missingChapterNumbers: r.gaps || [] };
      })
    };
    CZ.download('chuseoz-doctor-' + today() + '.json', JSON.stringify(rep, null, 1));
    toast('Đã tải báo cáo', 'ok');
  });

  /* ------------------------------ BÌNH LUẬN ------------------------------ */
  $('#cmReload').addEventListener('click', function () { MOD.all = []; loadMod(); });
  $('#cmQ').addEventListener('input', function () { MOD.q = this.value.trim(); paintMod(); });
  $('#cmBook').addEventListener('change', function () { MOD.slug = this.value; paintMod(); });
  $('#cmExport').addEventListener('click', function () {
    CZ.download('chuseoz-comments-' + today() + '.json', JSON.stringify(MOD.all, null, 1));
    toast('Đã xuất ' + MOD.all.length + ' bình luận', 'ok');
  });

  /* ------------------------------- NHẬT KÝ ------------------------------- */
  $('#logReload').addEventListener('click', loadLog);

  /* ------------------------------- SỐ LIỆU ------------------------------- */
  $('#btnStatsCsv').addEventListener('click', function () {
    var items = STATS_LAST.items || {};
    if (!Object.keys(items).length) return toast('Chưa có số liệu để xuất', 'err');
    CZ.download('chuseoz-stats-' + today() + '.csv', statsCsv(items, STATS_LAST.by || {}), 'text/csv');
    toast('Đã xuất CSV', 'ok');
  });

  /* --------------------------- CẤU HÌNH ĐĂNG NHẬP ------------------------ */
  $('#aCheck').addEventListener('click', checkAuthWorker);

  /* ------------------------------ khởi động ---------------------------- */
  (function init() {
    CZ.themeInit();
    $('#btnTheme').innerHTML = ic(document.documentElement.getAttribute('data-theme') === 'light' ? 'sun' : 'moon', 'i-s');
    fillStatusFilter();
    var savedApi = '', savedKey = '';
    try { savedApi = localStorage.getItem(LS.api) || ''; savedKey = localStorage.getItem(LS.key) || ''; } catch (e) {}
    if (savedApi) $('#inApi').value = savedApi;
    if (!savedApi && CZ.API) $('#inApi').value = CZ.API;     /* gợi ý từ cz-config.js */
    /* việc nối Worker do boot() ở trên lo — không gọi hai lần */
  })();
})();
