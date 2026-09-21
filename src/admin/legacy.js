/* ============================================================================
   ssochuz · TRANG QUẢN TRỊ (bản viết lại)
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
  /* Cầu nối sang trình soạn chương mới (TipTap) — xem src/admin/editor/.
     Dùng qua window.CZEditor để mã cũ trong tệp này không phải import gì cả;
     nếu trình soạn chưa gắn được thì mọi chỗ tự rơi về contenteditable cũ. */
  var w = window;
  var esc = CZ.esc, num = CZ.num, ic = CZ.icon;
  var LS = { api: 'cz_kv_api', key: 'cz_kv_key', draft: 'cz_admin_draft' };
  /* ADMIN_KEY không được ghi lâu dài vào localStorage. Nó chỉ sống trong tab hiện
     tại (sessionStorage) và biến nhớ; đóng tab là mất. Xoá luôn bản localStorage
     của các phiên bản cũ để giảm rủi ro khi máy bị dùng chung hoặc dính XSS. */
  function keySave() {
    try { localStorage.removeItem(LS.key); sessionStorage.setItem(LS.key, KEY); } catch (e) {}
  }
  function keyLoad() {
    try {
      localStorage.removeItem(LS.key);              /* dọn bản "ghi nhớ" cũ */
      return sessionStorage.getItem(LS.key) || '';
    } catch (e) { return ''; }
  }
  function keyDrop() {
    try { localStorage.removeItem(LS.key); } catch (e) {}
    try { sessionStorage.removeItem(LS.key); } catch (e) {}
  }

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
  function setTabCt(id, n) {
    var el = $('#' + id);
    if (el) el.textContent = n ? String(n) : '';
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
    /* Đừng để admin bị treo vô hạn khi URL Worker cũ hoặc DNS đang chết. AbortController
       được kiểm tra có tồn tại để bản xem thử/Trình duyệt cũ vẫn chạy như trước. */
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;
    return fetch(base + path, {
      method: opt.method || 'GET', headers: headers, cache: 'no-store', mode: 'cors',
      signal: controller ? controller.signal : undefined,
      body: opt.body != null ? JSON.stringify(opt.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) {
          /* Gắn httpStatus vào error để nơi gọi phân biệt được 404 (Worker bản cũ
             chưa có endpoint) với 401 (sai khoá) — mỗi bệnh một câu chữa khác nhau. */
          var er = new Error(d.error || ('HTTP ' + r.status + (r.status === 503 ? ' — Worker chưa gắn KV CZ_KV hoặc id trong wrangler.toml còn là placeholder' : '')));
          er.httpStatus = r.status;
          throw er;
        }
        return d;
      });
    }).catch(function (e) {
      /* Luôn dọn timer; nếu abort do timeout thì nói đúng bệnh thay vì giả là sai key. */
      if (timer) clearTimeout(timer);
      var m = String((e && e.message) || e || '');
      if (e && e.name === 'AbortError') {
        throw new Error('Hết thời gian chờ Worker (12 giây) tại ' + base +
          '. Kiểm tra URL/deploy bằng cách mở ' + base + '/api/health.');
      }
      if (/Failed to fetch|NetworkError|Load failed/i.test(m)) {
        /* "Failed to fetch" KHÔNG chỉ nghĩa là Worker chết: nếu MỘT endpoint quên trả
           header CORS thì trình duyệt chặn response (dù Worker trả 200 OK, key đúng)
           và fetch cũng ném đúng câu này. Vì vậy phải gợi ý cả cách phân biệt:
           health chạy OK mà endpoint kia chết → bệnh ở Worker (bản cũ), không phải
           ở URL/KV. Worker 1.10.1 có lớp bảo hiểm đắp CORS lên mọi response. */
        throw new Error('Failed to fetch — không nối được Worker tại ' + base +
          ' (CORS, URL sai, Worker chưa deploy, hoặc Worker bản cũ thiếu header CORS ở endpoint này). ' +
          'Mở ' + base + '/api/health trên tab mới để kiểm tra: nếu JSON hiện ra bình thường ' +
          'mà chức năng này vẫn lỗi → dán worker/cms.js mới (≥ 1.10.1) vào Worker rồi Deploy lại.');
      }
      throw e;
    }).finally(function () { if (timer) clearTimeout(timer); });
  }
  function setConn(kind, text) {
    var c = $('#chipConn');
    c.className = 'chip ' + (kind || '');
    $('#chipConnTxt').textContent = text;
  }
  function connect() {
    API = normalizeApi(CZ.normalizeApi($('#inApi').value) || $('#inApi').value);
    /* Một số trình quản lý mật khẩu dán kèm ký tự zero-width. Bỏ chúng ở
       đầu/cuối để khoá được gửi đúng chuỗi secret trong Cloudflare. */
    KEY = String($('#inKey').value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!API) return msg('Nhập URL Worker đã (ví dụ: https://ten-worker.workers.dev).', 'err');
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
        try { localStorage.setItem(LS.api, API); } catch (e) {}
        keySave();
        ONLINE = true;
        msg('Kết nối OK · ' + (h.kv ? 'KV sẵn sàng' : 'KV chưa gắn') + ' · ' + num(h.books) + ' bộ trên KV · rev ' + (h.regRev || '—'), 'ok');
        openApp();
      })
      .catch(function (e) {
        ONLINE = false;
        var detail = String((e && e.message) || e || 'lỗi không xác định');
        msg('Không nối được: ' + detail + ' — đang mở chế độ dữ liệu tĩnh để không bị kẹt.', 'err');
        /* Lỗi Worker không được khóa toàn bộ trang quản trị. Người quản trị vẫn có thể
           xem dữ liệu local, sửa nháp/xuất JSON; khi Worker sống lại chỉ cần bấm kết nối
           lại. Trước đây gateHold giữ nguyên màn hình lỗi khiến cảm giác như trang chết. */
        openApp();
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
    loadRegistry().then(function () { renderOverview(); if (ONLINE) { health(); loadReports(); } });
  }
  function disconnect() {
    keyDrop();
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
      dirty.meta = dirty.set = false; markDirty();
      renderList(); fillVoteBooks(); renderSlides(); renderSched(); renderSettings(); renderOverview();
      $('#libCount').textContent = num(REG.lib.length);
      setTabCt('tabLibCt', REG.lib.length);
      paintDraftChip();      /* có nháp thì hiện nút nhỏ trên thanh trên — KHÔNG hỏi bằng hộp thoại */
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
      /* huy hiệu ổ khóa: bộ đang có mật mã (thẻ công khai, chương khóa) */
      var lockIc = (n.lock === 1 || n.lock === true)
        ? '<span class="locki" title="Đang có mật mã — thẻ công khai, chương khóa">' + ic('lock', 'i-s') + '</span>'
        : '';
      return '<tr>' +
        '<td class="cck"><input type="checkbox" data-ck="' + esc(n.slug) + '" data-idx="' + idx + '"' + ck + ' style="width:auto"></td>' +
        '<td data-lb="Bộ"><span class="ttl">' + lockIc + esc(n.title) + '</span><span class="sub">' + slugDisp + (n.is18 ? ' · 18+' : '') + '</span></td>' +
        '<td data-lb="Tác giả"><span class="sm">' + esc(n.author || '—') + '</span><br><span class="sub">' + esc(n.couple || '') + '</span></td>' +
        '<td data-lb="Chương"><b>' + num(n.chapters || 0) + '</b><span class="sub"> ' + esc(n.countLabel || '') + '</span></td>' +
        '<td data-lb="Tình trạng"><span class="pill ' + CZ.statusCls(n.status) + '"><span class="d"></span>' + esc(n.status || '—') + '</span></td>' +
        '<td data-lb="Cập nhật" class="sm">' + esc(CZ.dateVN(n.updated)) + '</td>' +
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
    /* đếm cả 2 chiều lệch KV ↔ repo (repoAhead / kvAhead) — mỗi chiều chữa một kiểu */
    var docBad = DOC.rows.filter(function (r) {
      return r.issues.some(function (k) { return /^(regVsReal|repoAhead|kvAhead)$/.test(k.split(':')[0]); });
    }).length;
    box.innerHTML =
      '<div class="docrow ' + (sbOn ? 'good' : 'warn') + '"><span class="di">' + ic(sbOn ? 'check' : 'alert', 'i-s') + '</span>' +
        '<span class="dt"><b>Đăng nhập người đọc: ' + (sbOn ? (sbCode ? 'Supabase (cz-config.js)' : 'Supabase (lưu trên KV)') : 'CHƯA bật') + '</b>' +
        '<span>' + (sbOn
          ? 'Người đọc bấm "Đăng nhập" ở đầu trang là qua Supabase → Google. Quyền quản trị được Worker xác nhận; danh sách email không gửi xuống web.'
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
    /* Worker phải GHIM đúng project Supabase (bản 1.9.8): web có bật đăng nhập
       mà Worker chưa ghim thì người đọc đăng nhập xong vẫn bị mọi API 401 —
       đúng bệnh "My Space lỗi nghiêm trọng / đánh giá sao không lưu". */
    if (ONLINE && sbOn) {
      api('/api/health', { auth: false }).then(function (h) {
        var a = h && h.auth;
        if (!a) return;                       /* Worker bản cũ: dòng health trong tab Cài đặt đã nhắc dán worker mới */
        if (a.supabase) return;
        /* paintAuthPanel() chạy lại mỗi lần vào tab Tổng quan (và sau mọi tác
           vụ) — mỗi lần lại bắn một request /api/health nữa. Nếu append thẳng,
           hai request chồng nhau sẽ dựng HAI thẻ 401 giống hệt. Trước khi ghép
           thẻ mới thì gỡ mọi thẻ cũ (dấu .row-sbpin) ra khỏi hộp. */
        box.querySelectorAll('.row-sbpin').forEach(function (n) { n.remove(); });
        var wrap = document.createElement('div');
        wrap.innerHTML =
          '<div class="docrow bad row-sbpin"><span class="di">' + ic('alert', 'i-s') + '</span>' +
          '<span class="dt"><b>Worker chưa ghim project Supabase — đăng nhập sẽ lỗi 401</b>' +
          '<span>Web đã bật Supabase nhưng Worker không biết Project URL nên không xác thực được phiên ' +
          '(project dùng khoá <code>sb_publishable_…</code> ký ES256). Người đọc đăng nhập xong vẫn bị My Space, ' +
          'bình luận, đánh giá sao từ chối. Sửa: dán <code>worker/cms.js</code> bản 1.9.8 rồi đặt biến ' +
          '<code>SUPABASE_URL</code> trên Worker, hoặc vào tab <b>Cài đặt &amp; đồng bộ</b> điền Project URL + anon key rồi Lưu.</span></span>' +
          '<button class="btn ghost sm" data-go2="settings">' + ic('gear', 'i-s') + 'Sửa ngay</button></div>';
        var row = wrap.firstElementChild;
        row.querySelector('[data-go2]').addEventListener('click', function () { show('settings'); });
        box.appendChild(row);
      }).catch(function () {});
    }
  }
  var OV_FILTER = null;

  /* ------------------------------ sửa bộ -------------------------------- */
  function show(pane) {
    ['overview', 'list', 'new', 'edit', 'doctor', 'cmts', 'reports', 'stats', 'votes', 'log', 'settings'].forEach(function (k) {
      var el = $('#pane-' + k);
      if (el) el.classList.toggle('hide', k !== pane);
    });
    $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === pane); b.setAttribute('aria-current', b.dataset.tab === pane ? 'page' : 'false'); });
    $('#tabs button[data-tab="edit"]').classList.toggle('hide', !CUR);
    var on = $('#tabs button.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  /* vỏ tab Sửa bộ: ảnh bìa xem trước + huy hiệu khóa + nhãn tab */
  function paintEditChrome() {
    var img = $('#coverImg'), prev = $('#coverPrev');
    if (img && prev) {
      var u = $('#fThumb').value.trim();
      img.src = u || '';
      prev.classList.toggle('empty', !u);
      if (u) img.onerror = function () { prev.classList.add('empty'); };
    }
    paintLockState();
    var eb = $('#tabs button[data-tab="edit"] .ct');
    if (eb) { eb.textContent = CUR ? CUR.title : ''; eb.title = CUR ? ('Đang sửa: ' + CUR.title) : ''; }
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
    $('#fYear').value = CUR.year || ''; $('#edStatus').value = CUR.status || 'Đang cập nhật';
    $('#fCount').value = CUR.countLabel || ''; $('#f18').value = CUR.is18 ? '1' : '0';
    $('#fUpdated').value = CUR.updated || today();
    $('#fThumb').value = CUR.thumb || CUR.slide || ''; $('#fSyn').value = CUR.synFull || CUR.syn || '';
    dirty.meta = false; markDirty();
    paintEditChrome();
    BOOK = null; CHAP = -1;
    $('#chList').innerHTML = '<div class="row2 sm muted" style="padding:10px">đang tải chương…</div>';
    bookOf(slug).then(function (b) {
      BOOK = b || { title: CUR.title, slug: slug, chapters: [] };
      /* Mô tả ĐẦY ĐỦ nằm trong tệp chương, còn ô nhập mới chỉ thấy bản rút gọn
         trong registry. Không nạp bù vào thì lần “Lưu thông tin” kế tiếp sẽ ghi
         đúng bản rút gọn ấy thành synFull và ÂM THẦM XOÁ phần còn lại của mô tả.
         Chỉ điền khi người dùng chưa gõ gì (dirty.meta còn tắt) để không đè chữ. */
      var fSyn = $('#fSyn');
      if (BOOK.synFull && fSyn && !dirty.meta) fSyn.value = BOOK.synFull;
      renderChapters();
    });
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
    $('#fYear').value = CUR.year || ''; $('#edStatus').value = CUR.status || 'Đang cập nhật';
    $('#fCount').value = CUR.countLabel || ''; $('#f18').value = CUR.is18 ? '1' : '0';
    $('#fUpdated').value = CUR.updated || today();
    $('#fThumb').value = CUR.thumb || CUR.slide || ''; $('#fSyn').value = CUR.synFull || CUR.syn || '';
    dirty.meta = true; markDirty();
    paintEditChrome();
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
    /* trình soạn chữ thật: nội dung là HTML, giữ nguyên định dạng cũ
       (chương xưa lưu dạng <div>…</div> — trình đọc tự quy về <p>) */
    var ed = $('#edBody');
    /* Bản 2.0 dùng trình soạn TipTap (src/admin/editor). Nó tự lo việc đổi
       /api/img/… sang URL tuyệt đối của Worker. Nếu vì lý do nào đó trình soạn
       chưa gắn được thì rơi về contenteditable như bản cũ. */
    if (w.CZEditor && w.CZEditor.ready()) {
      w.CZEditor.setHtml(ch[i].html || '', API ? normalizeApi(API) : '');
    } else {
      ed.innerHTML = ch[i].html || '';
      if (API) $$('.rte img', ed).forEach(function (im) {
        var s = String(im.getAttribute('src') || '');
        if (/^\s*\/api\/img\//.test(s)) im.setAttribute('src', normalizeApi(API) + s.replace(/^\s+/, ''));
      });
    }
    chStat();
    renderChapters();
    if (boTuLuu) boTuLuu.huy();
    datChipTuLuu('');
    if (CUR) hoiKhoiPhuc(CUR.slug, i, ch[i].html || '');
    try { ed.focus(); } catch (e) {}
  }
  function chStat() {
    var st = $('#chStat');
    if (!st) return;
    if (w.CZEditor && w.CZEditor.ready()) {
      var s2 = w.CZEditor.stats(API ? normalizeApi(API) : '');
      st.textContent = num(s2.words) + ' từ · ' + num(s2.chars) + ' ký tự · ~' + s2.minutes + ' phút đọc';
      return;
    }
    var ed = $('#edBody');
    var n = CZ.words(ed ? (ed.innerHTML || '') : '');
    st.textContent = num(n) + ' từ · ' + num((ed ? (ed.textContent || '').trim().length : 0)) + ' ký tự';
  }
  /* thu nội dung từ trình soạn — giữ HTML thật, chỉ dọn nốt:
     bỏ thẻ bị vấy style inline vô nghĩa, giữ lại img/br/định dạng cơ bản.
     KHÔNG sanitize thô như trang đọc: đây là dữ liệu NGUỒN, trang đọc sẽ
     sanitize khi hiển thị (cleanHTML).
     FIX blank-line duplication: gộp <p><br></p> liên tiếp thành 1, bỏ trống đầu/cuối,
     gộp <br><br> trong cùng đoạn, chuẩn hoá <div> → <p>. */
  function edHtml() {
    var ed = $('#edBody');
    if (!ed) return '';
    /* Trình soạn mới đã trả HTML đúng hợp đồng (src/admin/lib/html-contract.js),
       không cần chạy lại bộ dọn thủ công phía dưới. */
    if (w.CZEditor && w.CZEditor.ready()) return w.CZEditor.getHtml(API ? normalizeApi(API) : '');
    var html = ed.innerHTML;
    if (API) {
      var abs = normalizeApi(API) + '/api/img/';
      html = html.split(abs).join('/api/img/');
    }
    var t = html.trim();
    if (!t || t === '<br>' || t === '<div><br></div>' || t === '<p><br></p>') return '';
    try {
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      function isEmptyBlock(el) {
        if (!el || el.nodeType !== 1) return false;
        var tag = (el.tagName || '').toLowerCase();
        if (tag !== 'p' && tag !== 'div') return false;
        if (el.querySelector('img, iframe, video, hr, table, ul, ol, blockquote, h1, h2, h3, h4, figure')) return false;
        var txt = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
        var inner = (el.innerHTML || '').replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').replace(/\s+/g, '').trim();
        return !txt && !inner;
      }
      // Chuẩn hoá <div> chỉ chứa chữ thành <p> để tránh <div><br></div> nhân đôi
      var divs = Array.prototype.slice.call(tmp.querySelectorAll('div'));
      divs.forEach(function (d) {
        if (d.querySelector('div,p,ul,ol,blockquote,table,img,figure,h1,h2,h3,h4,hr')) return;
        var p = document.createElement('p');
        p.innerHTML = d.innerHTML || '<br>';
        if (d.parentNode) d.parentNode.replaceChild(p, d);
      });
      // Gộp <br> liên tiếp trong cùng 1 đoạn
      Array.prototype.slice.call(tmp.querySelectorAll('p')).forEach(function (p) {
        if (p.querySelector('img')) return;
        p.innerHTML = p.innerHTML.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>');
      });
      // Gộp khối trống liên tiếp thành 1 ở mỗi parent
      function collapse(parent) {
        var kids = Array.prototype.slice.call(parent.childNodes);
        var prevEmpty = false;
        kids.forEach(function (node) {
          if (node.nodeType !== 1) { prevEmpty = false; return; }
          if (isEmptyBlock(node)) {
            if (prevEmpty) { try { node.remove(); } catch (e2) {} }
            else { prevEmpty = true; }
          } else {
            prevEmpty = false;
            if (node.childNodes && node.childNodes.length) collapse(node);
          }
        });
      }
      collapse(tmp);
      // Bỏ trống đầu/cuối
      var top = Array.prototype.slice.call(tmp.childNodes);
      for (var i = 0; i < top.length; i++) {
        var n = top[i];
        if (n.nodeType !== 1) continue;
        if (isEmptyBlock(n)) { try { n.remove(); } catch (e3) {} } else break;
      }
      top = Array.prototype.slice.call(tmp.childNodes);
      for (var j = top.length - 1; j >= 0; j--) {
        var nj = top[j];
        if (nj.nodeType !== 1) continue;
        if (isEmptyBlock(nj)) { try { nj.remove(); } catch (e4) {} } else break;
      }
      html = tmp.innerHTML.trim();
    } catch (e) {}
    if (!html || html === '<br>' || html === '<p><br></p>' || html === '<div><br></div>') return '';
    return html;
  }
  /* ---------------- TỰ LƯU CHƯƠNG ĐANG VIẾT VÀO MÁY ----------------------
     Lưới an toàn cho tình huống đóng nhầm tab / mất điện / trình duyệt sập.
     Ghi vào IndexedDB sau 2 giây ngừng gõ, mỗi chương một bản ghi.
     KHÔNG thay nút Lưu: đây chỉ là bản trong máy, chưa lên KV. */
  var boTuLuu = w.CZAutosave && w.CZAutosave.taoBoLuu ? w.CZAutosave.taoBoLuu({
    onLuu: function () { datChipTuLuu('Đã tự lưu trong máy lúc ' + new Date().toLocaleTimeString('vi-VN')); },
  }) : null;
  function datChipTuLuu(text) {
    var el = $('#chAuto');
    if (el) el.textContent = text || '';
  }
  function henTuLuu() {
    if (!boTuLuu || !CUR || !BOOK || CHAP < 0) return;
    boTuLuu.dat(CUR.slug, CHAP, ($('#chTitle').value || '').trim(), edHtml());
  }
  /* Bỏ nháp của chương vừa ghi lên KV (đã an toàn, không cần lưới nữa). */
  function boNhapChuong(slug, idx) {
    if (w.CZAutosave && w.CZAutosave.xoa) w.CZAutosave.xoa(slug, idx);
  }
  /* Mở chương: nếu trong máy còn bản mới hơn bản trên KV thì mời khôi phục. */
  function hoiKhoiPhuc(slug, idx, htmlKV) {
    if (!w.CZAutosave || !w.CZAutosave.doc) return;
    w.CZAutosave.doc(slug, idx).then(function (d) {
      if (!d || !d.html) return;
      /* giống hệt bản trên KV thì nháp vô nghĩa — dọn luôn cho sạch */
      if (String(d.html) === String(htmlKV || '')) { boNhapChuong(slug, idx); return; }
      /* chỉ mời khi vẫn đang ở đúng chương đó */
      if (!CUR || CUR.slug !== slug || CHAP !== idx) return;
      datChipTuLuu('');
      CZ.confirm('Máy này còn bản tự lưu lúc ' + new Date(d.at).toLocaleString('vi-VN') +
        ' cho chương này, khác với bản đang có trên KV.\n' +
        'Dùng bản trong máy? (Bấm Bỏ qua để giữ bản trên KV và xoá bản tự lưu.)', 'Dùng bản trong máy')
        .then(function (ok) {
          if (!CUR || CUR.slug !== slug || CHAP !== idx) return;
          if (!ok) { boNhapChuong(slug, idx); datChipTuLuu(''); return; }
          if (w.CZEditor && w.CZEditor.ready()) w.CZEditor.setHtml(d.html, API ? normalizeApi(API) : '');
          else $('#edBody').innerHTML = d.html;
          if (d.title) $('#chTitle').value = d.title;
          dirty.book = true; markDirty(); chStat();
          datChipTuLuu('Đã khôi phục bản tự lưu — kiểm tra rồi bấm Lưu');
        });
    });
  }
  function edSaveCurrent(silent) {
    if (!BOOK || CHAP < 0) return false;
    BOOK.chapters[CHAP] = { t: ($('#chTitle').value || '').trim() || ('Chương ' + (CHAP + 1)), html: edHtml() };
    dirty.book = true; markDirty();
    /* nội dung đã nằm trong BOOK -> nháp tự lưu của chương này hết nhiệm vụ */
    if (boTuLuu) boTuLuu.huy();
    if (CUR) boNhapChuong(CUR.slug, CHAP);
    datChipTuLuu('');
    if (!silent) { toast('Đã cập nhật chương ' + (CHAP + 1) + ' (nhớ bấm “Lưu toàn bộ chương”)', 'ok'); }
    return true;
  }
  /* ---------------- trình soạn chuyên nghiệp (bản 1.10.0) ----------------
     · định dạng: đậm/nghiêng/gạch chân/gạch ngang · H2/H3/đoạn/trích dẫn
       · đường phân cách · canh trái-giữa-phải
     · ảnh: lên từ máy → nén WebP trong TRÌNH DUYỆT (cạnh lớn ≤1400px,
       quality 0.82) → POST /api/img (KV Worker) → chèn <img src="/api/img/<id>">
     · nạp tệp .txt/.md/.html vào chương đang sửa (mỗi dòng trống = 1 đoạn)
   Mọi thứ chạy contenteditable — không cần thư viện ngoài, HTML ra đúng
   dạng web đang dùng (thẻ block, img, br).                                    */
  function edExec(cmd, val) {
    var ed = $('#edBody');
    if (!ed) return;
    if (w.CZEditor && w.CZEditor.ready() && w.CZEditor.cmd(cmd, val)) {
      dirty.book = true; markDirty(); chStat(); return;
    }
    ed.focus();
    try { document.execCommand(cmd, false, val || null); } catch (e) {}
    dirty.book = true; markDirty(); chStat();
  }
  function edBlock(tag) {
    var ed = $('#edBody');
    if (!ed) return;
    if (w.CZEditor && w.CZEditor.ready()) {
      w.CZEditor.block(tag);
      dirty.book = true; markDirty(); chStat(); return;
    }
    ed.focus();
    try { document.execCommand('formatBlock', false, tag); } catch (e) {}
    dirty.book = true; markDirty();
  }
  /* nén ảnh trong trình duyệt: resize tối đa 1400px rồi encode WebP.
     Trả về Promise<{type, data (base64), bytes}>. */
  function compressImage(file, maxPx) {
    maxPx = maxPx || 1400;
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error('Không đọc được tệp ảnh.')); };
      rd.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Tệp này không phải ảnh hợp lệ.')); };
        img.onload = function () {
          try {
            var w = img.naturalWidth, h = img.naturalHeight;
            if (!w || !h) throw new Error('Ảnh rỗng.');
            var k = Math.min(1, maxPx / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * k)), ch2 = Math.max(1, Math.round(h * k));
            var cv = document.createElement('canvas');
            cv.width = cw; cv.height = ch2;
            var cx = cv.getContext('2d');
            /* nền trắng trước khi vẽ: ảnh PNG trong suốt không ra ảnh viền đen */
            cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cw, ch2);
            cx.drawImage(img, 0, 0, cw, ch2);
            var data = cv.toDataURL('image/webp', 0.82);
            var b64 = data.slice(data.indexOf(',') + 1);
            resolve({ type: 'image/webp', data: b64, bytes: Math.floor(b64.replace(/=+$/, '').length * 3 / 4) });
          } catch (e) { reject(e); }
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }
  function uploadImgData(c) {
    return api('/api/img', { method: 'POST', body: { data: c.data, type: c.type } })
      .then(function (r) {
        if (!r || !r.ok || !r.url) throw new Error((r && r.error) || 'Lên ảnh thất bại.');
        return r;
      });
  }
  function uploadImageFile(file, onBusy) {
    if (!file) return Promise.resolve(null);
    if (!/image\/(jpeg|png|webp)/.test(file.type)) return Promise.reject(new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP.'));
    if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error('Ảnh quá lớn (trên 12 MB) — hãy giảm kích thước trước.'));
    onBusy('Đang nén ảnh trong trình duyệt…');
    return compressImage(file, 1400)
      .then(function (c) {
        onBusy('Đang lên ' + Math.max(1, Math.round(c.bytes / 1024)) + ' KB lên Worker…');
        return uploadImgData(c).then(function (r) { onBusy(''); return r; });
      })
      .catch(function (e) { onBusy(''); throw e; });
  }
  /* chèn ảnh vào vị trí con trỏ trong chương. Nội dung LƯU là đường dẫn
     tương đối /api/img/…; để admin thấy ảnh ngay trong trình soạn, hiển thị
     bằng URL tuyệt đối của Worker (edHtml sẽ viết ngược khi lưu). */
  function edInsertImage(url, alt) {
    var ed = $('#edBody');
    if (!ed) return;
    if (w.CZEditor && w.CZEditor.ready()) {
      w.CZEditor.image(url, alt, API ? normalizeApi(API) : '');
      dirty.book = true; markDirty(); chStat(); return;
    }
    ed.focus();
    var src = API && /^\s*\//.test(url) ? normalizeApi(API) + url.replace(/^\s+/, '') : url;
    var html = '<p><img src="' + esc(src) + '" alt="' + esc(alt || '') + '" style="max-width:100%;height:auto"></p>';
    try { document.execCommand('insertHTML', false, html); }
    catch (e) { ed.insertAdjacentHTML('beforeend', html); }
    dirty.book = true; markDirty(); chStat();
  }
  /* nạp tệp .txt/.md/.html vào chương đang mở (gộp thêm vào nội dung có sẵn) */
  function importChapterFile(file) {
    if (!file) return;
    var rd = new FileReader();
    rd.onerror = function () { toast('Không đọc được tệp này', 'err'); };
    rd.onload = function () {
      var txt = String(rd.result || '');
      var isHtml = /\.html?$/i.test(file.name) || /^\s*<[a-z][\s\S]*>/i.test(txt.slice(0, 300));
      var html;
      if (isHtml) {
        /* giữ HTML thật của tệp, chỉ chèn vào — người viết sẽ xem lại rồi lưu */
        html = txt.trim();
      } else {
        /* chữ thường / markdown thô: mỗi dòng trống = 1 đoạn (mã textToHtml cũ) */
        html = textToHtml(txt, 'para');
      }
      if (!edSaveCurrent(true)) {
        /* chưa có chương nào: tạo một chương mới nhận tệp */
        if (!BOOK) return toast('Mở một bộ trước đã', 'err');
        BOOK.chapters.push({ t: '', html: '' });
        CHAP = BOOK.chapters.length - 1;
        openChap(CHAP);
      }
      if (!$('#chTitle').value.trim()) {
        $('#chTitle').value = file.name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').trim();
      }
      /* Như trên: phải đi qua trình soạn, không chèn thẳng vào DOM. */
      if (w.CZEditor && w.CZEditor.ready()) w.CZEditor.append(html, API ? normalizeApi(API) : '');
      else $('#edBody').insertAdjacentHTML('beforeend', html);
      dirty.book = true; markDirty(); chStat();
      toast('Đã nạp “' + file.name + '” — kiểm tra lại rồi bấm Lưu chương này', 'ok');
      renderChapters();
    };
    rd.readAsText(file);
  }
  /* ---------------- trạng thái khóa mật mã trong tab Sửa bộ --------------- */
  function paintLockState() {
    var st = $('#lockState');
    if (!st || !CUR) return;
    var on = !!(CUR.lock === 1 || CUR.lock === true);
    st.className = 'pill ' + (on ? 'acc' : '');
    st.innerHTML = on
      ? ic('lock', 'i-s') + 'đang có mật mã'
      : ic('lock_open', 'i-s') + 'chưa khóa';
    if (on) $('#btnUnlock').classList.remove('hide'); else $('#btnUnlock').classList.add('hide');
  }
  function lockBook(password) {
    if (!CUR || !CUR.slug) return Promise.reject(new Error('Bộ này chưa có slug — lưu thông tin trước.'));
    if (!ONLINE) return Promise.reject(new Error('Chưa nối Worker — khóa mật mã cần KV thật.'));
    return api('/api/lock/set', { method: 'POST', body: { slug: CUR.slug, password: password } })
      .then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || 'Không làm được.');
        if (r.locked) { CUR.lock = 1; } else { delete CUR.lock; }
        paintLockState(); renderList();
        return r;
      });
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
    CUR.year = $('#fYear').value.trim(); CUR.status = $('#edStatus').value;
    CUR.countLabel = $('#fCount').value.trim() || CUR.countLabel;
    CUR.is18 = $('#f18').value === '1';
    CUR.updated = $('#fUpdated').value || today();
    CUR.thumb = $('#fThumb').value.trim(); CUR.slide = CUR.thumb;
    CUR.synFull = $('#fSyn').value.trim(); CUR.syn = CZ.teaser(CUR.synFull, 220);

    var renamePromise = Promise.resolve();
    if (newSlug !== oldSlug) {
      if (BOOKS[oldSlug]) {
        BOOKS[newSlug] = BOOKS[oldSlug];
        delete BOOKS[oldSlug];
      }
      if (BOOK && (BOOK.slug === oldSlug || !BOOK.slug)) BOOK.slug = newSlug;
      if (REG.slides) {
        REG.slides = REG.slides.map(function (s) {
          var sl = slideSlug(s);
          if (sl !== oldSlug) return s;
          return (sl && s && typeof s === 'object') ? Object.assign({}, s, { slug: newSlug }) : newSlug;
        });
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
          renderList(); renderSlides();
          toast('Đã đổi slug: ' + oldSlug + ' → ' + newSlug, 'ok');
        }
      });
    });
  }
  function saveRegistry(okMsg) {
    if (!REG) return Promise.resolve();
    REG.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
    REG.source = { synced: new Date().toISOString(), note: 'sửa từ trang quản trị ssochuz' };
    if (!ONLINE) {
      saveDraft(); dirty.meta = dirty.set = false; markDirty();
      msg('Chưa nối Worker — đã lưu nháp trong máy. Dùng “Sao lưu toàn bộ” để xuất JSON.', 'info');
      return Promise.resolve();
    }
    return api('/api/registry', { method: 'PUT', body: REG }).then(function () {
      dirty.meta = dirty.set = false; markDirty();
      msg(okMsg + ' · ' + new Date().toLocaleTimeString('vi-VN'), 'ok');
      toast(okMsg, 'ok'); renderList(); fillVoteBooks(); renderSlides(); renderOverview(); health();
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
    /* KHÔNG ghi `count` nữa — bản sao chết của countLabel, web tự tính (CZ.norm) */
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
        localStorage.setItem('ssochuz-reg', JSON.stringify({ t: Date.now(), v: REG }));
        // clear memo để CZ.lib() đọc lại
        if (window.CZ && CZ._memo) { CZ._memo.reg = null; CZ._setLib(); }
      } catch (e2) {}
      toast('Đã lưu nháp trong máy', 'ok');
      paintDraftChip();
    } catch (e) { toast('Nháp quá lớn để lưu trong máy', 'err'); }
  }
  function delBook(slug) {
    var n = (REG.lib || []).find(function (x) { return x.slug === slug; });
    CZ.confirm('Xoá bộ “' + (n ? n.title : slug) + '” khỏi thư viện' + (ONLINE ? ' và trên KV' : ' (chỉ trong bản nháp)') + '?', 'Xoá').then(function (ok) {
      if (!ok) return;
      REG.lib = REG.lib.filter(function (x) { return x.slug !== slug; });
      REG.slides = (REG.slides || []).filter(function (x) { return slideSlug(x) !== slug; });
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
  /* xoá bộ không hỏi lại — dùng cho nút đã BẤM HAI LẦN (arm2) trong tab Sửa */
  function delBookRun(slug) {
    var n = (REG.lib || []).find(function (x) { return x.slug === slug; });
    REG.lib = (REG.lib || []).filter(function (x) { return x.slug !== slug; });
    REG.slides = (REG.slides || []).filter(function (x) { return slideSlug(x) !== slug; });
    REG.editorChoice = (REG.editorChoice || []).filter(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl !== slug; });
    if (REG.settings && REG.settings.editorChoice) REG.settings.editorChoice = (REG.settings.editorChoice || []).filter(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl !== slug; });
    /* bộ bị xoá cũng phải ra khỏi lịch cập nhật — nếu không "Lưu cài đặt"
       sẽ báo "Lịch có slug không tồn tại" (lỗi thật 17/09/2026) */
    if (REG.schedule && REG.schedule.items) {
      REG.schedule.items = REG.schedule.items.filter(function (it) { return (it.slug || '') !== slug; });
      if ($('#sSched')) renderSched();
    }
    delete BOOKS[slug];
    var done = ONLINE ? api('/api/book/' + encodeURIComponent(slug), { method: 'DELETE' }).catch(function () {}) : Promise.resolve();
    done.then(function () { return saveRegistry('Đã xoá “' + (n ? n.title : slug) + '”'); }).then(function () {
      if (CUR && CUR.slug === slug) { CUR = null; show('list'); }
      renderList();
    });
  }
  /* xác nhận hai bước cho thao tác nguy hiểm: lần 1 nút đổi màu + chữ
     “xác nhận”, lần 2 mới chạy. Quên bấm trong 8 giây thì tự huỷ. */
  function arm2(btn, label2, fn) {
    if (!btn) return;
    if (btn._armed) {
      btn._armed = false;
      clearTimeout(btn._armT);
      btn.classList.remove('armed');
      btn.innerHTML = btn._armHtml || '';
      delete btn._armHtml;
      fn();
      return;
    }
    btn._armed = true;
    btn._armHtml = btn.innerHTML;
    btn.classList.add('armed');
    btn.innerHTML = ic('alert', 'i-s') + label2;
    btn._armT = setTimeout(function () {
      if (!btn._armed) return;
      btn._armed = false;
      clearTimeout(btn._armT);
      btn.classList.remove('armed');
      btn.innerHTML = btn._armHtml || '';
      delete btn._armHtml;
    }, 8000);
  }
  function delBookByIdx(idx) {
    var n = (REG.lib || [])[idx];
    if (!n) return;
    CZ.confirm('Xoá bộ “' + n.title + '” (thiếu slug) khỏi thư viện?', 'Xoá').then(function (ok) {
      if (!ok) return;
      REG.lib.splice(idx,1);
      if (REG.slides) REG.slides = REG.slides.filter(function (x) { return x !== n && slideSlug(x) !== n.slug; });
      if (REG.editorChoice) REG.editorChoice = REG.editorChoice.filter(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl !== n.slug && x !== n; });
      if (REG.settings && REG.settings.editorChoice) REG.settings.editorChoice = REG.settings.editorChoice.filter(function (x) { var sl = typeof x === 'string' ? x : (x && x.slug); return sl !== n.slug && x !== n; });
      delete BOOKS[n.slug];
      saveRegistry('Đã xoá “' + n.title + '”').then(function () {
        if (CUR === n) { CUR = null; show('list'); }
        renderList();
      });
    });
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
      syn: CZ.teaser($('#nSyn').value.trim(), 220), synFull: $('#nSyn').value.trim(),
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
      renderList(); show('list');
    }).catch(function (e) { msg('Tạo truyện lỗi: ' + e.message, 'err'); });
  }

  /* ------------------------------ cài đặt ------------------------------- */
  /* danh sách truyện đang chọn cho khối hero: đúng thứ tự, có ảnh bìa, sửa được ngay */
  /* N12: danh sách hero trả về object {slug, reason} — chuỗi cũ vẫn chạy bình thường. */
  function slideSlug(x) { return typeof x === 'string' ? x : (x && x.slug); }
  function slidePicks() {
    return (REG.slides || []).map(function (s) {
      return {
        slug: slideSlug(s) || '',
        reason: (s && typeof s === 'object' && s.reason != null) ? String(s.reason) : ''
      };
    }).filter(function (s) { return s.slug; });
  }
  /* ghi lại danh sách hero: không có nhãn thì để chuỗi slug gọn, có nhãn thì để object */
  function slideStore(list) {
    return list.map(function (s) {
      var reason = String((s && s.reason) || '').trim();
      return reason ? { slug: s.slug, reason: reason } : s.slug;
    });
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
      ? picks.map(function (s, i) {
        var n = by[s.slug] || {};
        return '<div class="hprow" data-slug="' + esc(s.slug) + '">' +
          '<span class="hpno">' + (i + 1) + '</span>' +
          '<span class="hpth' + (n.thumb ? ' skel' : '') + '">' +
            (n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
          '<span class="hpinfo"><b>' + esc(n.title || s.slug) + '</b><span>' + esc(n.author || '') +
            (n.chapters ? ' · ' + num(n.chapters) + ' chương' : '') + '</span>' +
            '<input class="hpreason" type="text" data-r="' + i + '" value="' + esc(s.reason) + '" maxlength="60" ' +
            'placeholder="Nhãn slide (mặc định: Nổi bật hôm nay / Đề xuất cho bạn)" aria-label="Nhãn giới thiệu slide ' + (i + 1) + '"></span>' +
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
    var list = picks.slice();
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    REG.slides = slideStore(list);
    dirty.set = true; markDirty(); renderSlides();
  }
  function hpDrop(i) {
    var list = slidePicks();
    list.splice(i, 1);
    REG.slides = slideStore(list);
    dirty.set = true; markDirty(); renderSlides(); hpSearch();
  }
  function hpSearch() {
    var box = $('#hpFound'), q = ($('#hpFind').value || '').trim().toLowerCase();
    if (!q) { box.classList.add('hide'); box.innerHTML = ''; return; }
    var picks = slidePicks();
    var hits = (REG.lib || []).filter(function (n) { return (n.chapters || 0) > 0 && !picks.some(function (p) { return p.slug === n.slug; }); })
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
    if (picks.some(function (p) { return p.slug === slug; })) return;
    if (picks.length >= 6) return toast('Tối đa 6 bộ cho khối hero', 'err');
    var n = (REG.lib || []).find(function (x) { return x.slug === slug; });
    if (!n) return;
    picks.push({ slug: slug, reason: '' });
    REG.slides = slideStore(picks);
    dirty.set = true; markDirty();
    $('#hpFind').value = '';
    renderSlides(); hpSearch();
  }
  function renderSched() {
    var s = REG.schedule || {};
    $('#sSched').value = (s.items || []).map(function (i) {
      /* Hiển thị slug để admin không vô tình sửa nhầm tựa truyện. */
      return [i.days, i.slug || i.title || '', i.detail || ''].join(' | ');
    }).join('\n');
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
    var schedDropped = [];
    /* N12: giữ cả nhãn `reason`; chỉ giữ bộ còn tồn tại trong thư viện */
    REG.slides = slideStore(slidePicks().slice(0, 6).filter(function (s) { return by[s.slug]; }));
    var ePicks = editPicks();
    REG.editorChoice = ePicks;
    var items = $('#sSched').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      var slug = p[1] || '';
      var book = (REG.lib || []).find(function (x) { return x.slug === slug; });
      /* dòng lịch trỏ tới bộ không có thật thì BỎ dòng đó kèm cảnh báo, không
         làm chết cả lần lưu cài đặt (dòng thừa thường đến từ bộ vừa xoá hoặc
         lịch sync từ KV chưa khớp thư viện) */
      if (!book) { schedDropped.push(slug || '(trống)'); return null; }
      return { days: p[0] || '', slug: slug, title: book.title, detail: p[2] || '' };
    }).filter(Boolean);
    if (schedDropped.length) toast('Lịch: bỏ ' + schedDropped.length + ' dòng không có bộ: ' + schedDropped.join(', '), 'info');
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
    /* Địa chỉ nhận báo lỗi nằm trong Secret MAIL_TO/ADMIN_EMAILS của Worker,
       registry công khai chỉ giữ link khảo sát. */
    var rep = {
      form: $('#rForm') ? $('#rForm').value.trim() : 'https://forms.gle/YW3PvtrNVQ7xt8nCA'
    };
    /* cấu hình đăng nhập: lưu trên KV để KHÔNG phải sửa cz-config.js rồi deploy lại.
       cz-config.js vẫn thắng nếu đã điền sẵn ở đó (xem cz-auth.js → applySettings). */
    var auth = {
      provider: $('#aProvider') ? $('#aProvider').value : 'supabase',
      supabaseUrl: $('#aUrl') ? $('#aUrl').value.trim().replace(/\/+$/, '') : '',
      supabaseAnonKey: $('#aKey') ? $('#aKey').value.trim() : '',
      googleClientId: $('#aGoogle') ? $('#aGoogle').value.trim() : ''
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
    CZ.confirm('Nạp TOÀN BỘ registry + các bộ trong repo lên KV?\nDữ liệu đang có trên KV sẽ bị ghi đè.' +
      '\n\n⚠ Bộ nào bạn vừa ĐĂNG CHƯƠNG TRONG TRANG QUẢN TRỊ mà chưa lưu về repo (Bác sĩ dữ liệu báo ' +
      '"KV nhiều chương hơn repo") sẽ BỊ MẤT chương — vào Bác sĩ dữ liệu bấm "↓ Lưu file repo từ KV", ' +
      'commit lên GitHub rồi hãy nạp.', 'Nạp lên KV').then(function (ok) {
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
    var dump = { _: 'ssochuz-backup', at: new Date().toISOString(), registry: REG, books: {} };
    var lib = (REG.lib || []), i = 0;
    var step = function () {
      if (i >= lib.length) {
        var blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'ssochuz-backup-' + today() + '.json'; a.click();
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
      setTabCt('tabVotesCt', keys.filter(function (k) { return (Number(items[k].voters) || 0) > 0; }).length);
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
     Lệch registry ↔ KV là web hiện sai số chương — đúng bệnh "Be My Angel chỉ có 29
     chương mà web vẫn hiện 30": sửa file trong repo nhưng bản trên KV chưa được nạp lại.
     Lệch KV ↔ repo thì PHẢI xét chiều (xem syncIssue), vì hai chiều chữa NGƯỢC nhau:
       · repo > KV → sửa file trên GitHub chưa nạp lên KV → "↑ Nạp chương từ repo lên KV";
       · KV > repo → đăng chương trong trang quản trị, file repo chưa theo kịp
                     → "↓ Lưu file repo từ KV" rồi commit; nạp đè repo lên KV ở chiều này
                       là xoá mất chương vừa đăng. */
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
    /* đọc BẰNG KHOÁ QUẢN TRỊ: bộ đang khóa mật mã mà đọc kiểu khách thì Worker chỉ trả
       vỏ {locked:true, chapters:[]} → bác sĩ tưởng bộ đó 0 chương rồi xui "nạp repo lên
       KV", tức là ghi đè bản rỗng lên kho chương thật. Khoá sai/hết hạn thì Worker tự
       trả bản công khai như cũ, không mất gì. */
    return api('/api/book/' + encodeURIComponent(slug), {})
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
  /* ---------------- kiểm kho KV (bản 1.10.0) ---------------------------
     GET /api/admin/kv → tổng dung lượng + nhóm theo tiền tố khoá. Giúp trả
     lời "KV phình vì thứ gì": chương (book:), ảnh (img:), bình luận (cmt:),
     phiếu (voters) hay registry. Nhóm chưa biết tên hiện ở cuối. */
  function loadKV() {
    var box = $('#kvAudit'), st = $('#kvState');
    if (!box) return;
    if (!ONLINE) {
      if (st) st.innerHTML = 'Chưa nối Worker — kiểm kho cần KV thật.';
      box.innerHTML = '';
      return;
    }
    if (st) st.innerHTML = '<span class="spin"></span> đang liệt kê kho…';
    box.innerHTML = '';
    api('/api/admin/kv').then(function (r) {
      var keys = r.keys || 0, bytes = r.bytes || 0;
      var groups = r.groups || [];
      var total = 0;
      groups.forEach(function (g) { total += g.bytes || 0; });
      var html = '<div class="kvtiles">' +
        '<div class="kvtile"><b>' + num(keys) + '</b><span>khoá trên KV</span></div>' +
        '<div class="kvtile"><b>' + kb(bytes) + '</b><span>dung lượng (chưa nén? KV tính byte gốc)</span></div>' +
      '</div>';
      if (!groups.length) {
        html += '<div class="sm muted">Kho trống.</div>';
      } else {
        /* nhóm to nhất lên trước để thấy ngay thứ đang phình */
        groups = groups.slice().sort(function (a, b) { return (b.bytes || 0) - (a.bytes || 0); });
        var maxB = Math.max.apply(null, groups.map(function (g) { return g.bytes || 0; }).concat([1]));
        html += '<table class="tbl kvtab"><thead><tr><th>Nhóm khoá</th><th>Số khoá</th><th style="text-align:right">Dung lượng</th><th>Tỉ trọng</th></tr></thead><tbody>';
        groups.forEach(function (g) {
          var pct = Math.min(100, Math.round(((g.bytes || 0) / maxB) * 100));
          html += '<tr><td><code>' + esc(g.prefix) + '</code></td><td>' + num(g.keys) + '</td>' +
            '<td style="text-align:right">' + kb(g.bytes || 0) + '</td>' +
            '<td><span class="kvbar"><span style="width:' + pct + '%"></span></span></td></tr>';
        });
        html += '</tbody></table>';
      }
      if (st) st.innerHTML = '';
      box.innerHTML = html;
    }).catch(function (e) {
      if (st) st.innerHTML = esc(e.message);
      box.innerHTML = '';
    });
  }
  function kb(n) {
    n = n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
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
        var sync = syncIssue(kvN, repoN);
        if (sync) issues.push(sync);
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
    repoAhead: ['bad', 'File trong repo GitHub chưa được nạp lên KV',
      'repo có {repo} chương, KV chỉ {kv} — bạn sửa/thêm chương trong file trên GitHub mà chưa nạp lên KV nên người đọc vẫn nhận bản cũ. Bấm "↑ Nạp chương từ repo lên KV"'],
    /* CHIỀU NGƯỢC LẠI, chữa ngược lại — gộp chung 2 chiều vào một câu "KV lệch repo"
       rồi xui "nạp repo lên KV" là xui người dùng ghi đè bản ÍT chương hơn lên KV:
       đúng bệnh "Vượt Khỏi Đường Chân Trời (Special) — KV 1 · repo 0", chương vừa đăng
       trong trang quản trị sẽ bị xoá sạch nếu bấm theo lời nhắc cũ. */
    kvAhead: ['warn', 'Chương trên KV chưa được lưu về file repo',
      'KV có {kv} chương, file repo chỉ {repo} — bạn đăng/sửa chương ngay trong trang quản trị (ghi thẳng lên KV) nên file data/book/<slug>.json chưa theo kịp. ' +
      'Người đọc KHÔNG bị ảnh hưởng, web vẫn hiện đủ {kv} chương. Muốn hết báo: bấm "↓ Lưu file repo từ KV" rồi commit file đó lên GitHub. ' +
      'ĐỪNG bấm "↑ Nạp chương từ repo lên KV" cho bộ này — bản repo đang ít hơn sẽ xoá mất {diff} chương trên KV. ' +
      'Nếu KV đúng là đang thừa chương rác/đăng trùng thì sửa trong tab Sửa bộ → Sửa chương rồi mới nạp repo lên KV.'],
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
      'mở tab Sửa bộ → Sửa chương, xoá bản thừa. Chương trùng nằm trong file repo thì xoá ở đó rồi bấm "↑ Nạp chương từ repo lên KV"; chỉ KV bị thì xoá thẳng trong trang quản trị là đủ'],
    dupTitle: ['warn', 'Trùng tiêu đề nhưng nội dung khác — chương bị đặt nhầm tên/nhầm số',
      'KHÔNG phải đăng trùng. Mở tab Sửa bộ → Sửa chương rồi đổi lại tên cho đúng (xoá là mất 1 chương thật)']
  };
  /* KV và file repo lệch nhau thì PHẢI nói rõ lệch về phía nào — hai phía chữa NGƯỢC
     nhau, nói nhầm một câu là mất chương:
       · repo > KV : sửa/thêm chương trong file trên GitHub mà chưa nạp lên KV
                     → chữa bằng "↑ Nạp chương từ repo lên KV";
       · KV  > repo: đăng/sửa chương ngay trong trang quản trị (ghi thẳng KV) nên file
                     repo chưa theo kịp → chữa bằng "↓ Lưu file repo từ KV" rồi commit.
                     Nạp repo lên KV ở phía này là ghi đè bản ít chương hơn = xoá chương
                     đã đăng (bệnh thật: Special "endless blue beyond" KV 1 · repo 0).
     Thiếu một trong hai nguồn (null) thì chưa đủ căn cứ, không kết luận. */
  function syncIssue(kvN, repoN) {
    if (kvN == null || repoN == null || kvN === repoN) return '';
    return repoN > kvN ? 'repoAhead' : 'kvAhead';
  }
  /* điền số vào dòng mô tả bệnh — tách thành hàm riêng để kiểm thử được bằng Node */
  function docText(key, r) {
    r = r || {};
    var vals = {
      reg: r.reg == null ? '—' : r.reg,
      real: r.real == null ? '—' : r.real,
      kv: r.kv == null ? '—' : r.kv,
      repo: r.repo == null ? '—' : r.repo,
      diff: Math.max(0, (r.kv || 0) - (r.repo || 0)),
      lab: String((r.n && r.n.countLabel) || '')
    };
    /* thế MỌI lần lặp của cùng một biến: lời nhắc kvAhead nhắc {kv} tới 2 lần, mà
       String.replace với chuỗi mẫu chỉ thế chỗ ĐẦU TIÊN (sót lại "{kv}" trên màn hình) */
    return String((DOC_LABEL[key] || [])[2] || '').replace(/\{(reg|real|kv|repo|diff|lab)\}/g, function (m, k) {
      return vals[k] == null ? '—' : vals[k];
    });
  }
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
      /* KV đang nhiều chương hơn file repo → cho nút lưu về repo NGAY TẠI DÒNG đó,
         để người dùng không phải đoán xem nên bấm nút nào ở thanh công cụ */
      var canPull = r.issues.indexOf('kvAhead') >= 0 && ONLINE;
      var bits = r.issues.map(function (k) {
        var key = k.split(':')[0], extra = k.indexOf(':') > 0 ? k.slice(k.indexOf(':') + 1) : '';
        var L = DOC_LABEL[key] || ['warn', key, ''];
        var txt = docText(key, r);
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
        '<span class="row" style="gap:6px">' +
        (canPull ? '<button class="btn ghost sm" data-docpull="' + i + '" title="Tải file data/book/' + esc(r.slug || '') + '.json đúng bằng bản trên KV để commit lên GitHub">' +
          ic('download', 'i-s') + 'Lưu file repo</button>' : '') +
        '<button class="btn ghost sm" data-docedit="' + i + '" data-docfocus="' + (onChap ? 'chap' : 'meta') + '">' + ic('edit', 'i-s') + (onChap ? 'Sửa chương' : 'Sửa') + '</button></span></div>';
    }).join('');
    $$('#docList [data-docpull]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = order[parseInt(b.dataset.docpull, 10)];
        if (r && r.slug) pullRepo([r]);
      });
    });
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
  /* nạp chương từ repo lên KV — chữa tận gốc khi file repo MỚI HƠN kho chương trên KV */
  function docPushRepo() {
    if (!ONLINE) return msg('Cần nối Worker trước.', 'err');
    var targets = DOC.rows.filter(function (r) {
      return r.repo != null && (r.kv == null || r.kv !== r.repo || r.reg !== r.repo);
    });
    if (!targets.length) targets = DOC.rows.filter(function (r) { return r.repo != null; });
    if (!targets.length) return msg('Không tìm thấy file chương nào trong repo để nạp.', 'err');
    /* Bộ mà KV đang có NHIỀU chương hơn repo: nạp repo lên là XOÁ bớt chương trên KV.
       Không cấm — có khi KV đúng là đang thừa chương rác (Be My Angel từng thừa 1
       chương ma) — nhưng phải kể tên từng bộ trước khi người dùng bấm xác nhận. */
    var risky = targets.filter(function (r) { return r.kv != null && r.kv > r.repo; });
    var lost = risky.reduce(function (a, r) { return a + (r.kv - r.repo); }, 0);
    var note = 'Nạp ' + targets.length + ' bộ từ file trong repo lên KV?\n' +
      'Chương trên KV của những bộ này sẽ bị ghi đè bằng bản trong repo (bản bạn đã sửa trên GitHub).';
    if (risky.length) {
      note += '\n\n⚠ ' + risky.length + ' bộ đang có KV NHIỀU chương hơn repo — nạp là MẤT ' + lost + ' chương trên KV:\n' +
        risky.slice(0, 8).map(function (r) {
          return '· ' + ((r.n && r.n.title) || r.slug) + ' (KV ' + r.kv + ' → repo ' + r.repo + ')';
        }).join('\n') + (risky.length > 8 ? '\n· … và ' + (risky.length - 8) + ' bộ nữa' : '') +
        '\n\nNếu những bộ này lệch vì bạn ĐĂNG CHƯƠNG TRONG TRANG QUẢN TRỊ (chứ không phải vì KV thừa chương rác) ' +
        'thì đừng nạp đè — bấm "↓ Lưu file repo từ KV" để lấy bản KV về commit lên GitHub.';
    }
    CZ.confirm(note, 'Nạp lên KV')
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

  /* LƯU CHƯƠNG TỪ KV VỀ FILE data/book/<slug>.json — chiều NGƯỢC của nút nạp repo lên KV.
     Đăng/sửa chương trong trang quản trị là ghi thẳng lên KV, file trong GitHub không tự
     theo kịp nên bác sĩ cứ báo "KV lệch file trong repo" mãi. Nút này tải ĐÚNG BẢN KV
     xuống máy (nguyên từng ký tự, không gõ lại tay) để bỏ vào data/book/ rồi commit.
     Chưa commit thì bác sĩ vẫn báo — đó là nhắc đúng việc còn thiếu, không phải lỗi web. */
  function pullRepo(rows) {
    if (!ONLINE) return msg('Cần nối Worker trước.', 'err');
    rows = (rows && rows.length) ? rows.slice()
      : DOC.rows.filter(function (r) { return r.issues.indexOf('kvAhead') >= 0; });
    rows = rows.filter(function (r) { return r && r.slug && r.kv != null; });
    if (!rows.length) return msg('Không có bộ nào cần lưu về repo — chỉ bộ nào KV nhiều chương hơn file repo mới cần.', 'info');
    var okN = 0, fail = [], i = 0;
    function next() {
      if (i >= rows.length) return finish();
      var r = rows[i++];
      /* đọc bằng khoá quản trị để lấy TRỌN bộ: bộ đang khóa mật mã mà đọc kiểu khách thì
         chỉ nhận được vỏ rỗng, lưu về repo thành ra làm mất chương */
      return api('/api/book/' + encodeURIComponent(r.slug), {}).then(function (bk) {
        if (!bk || !Array.isArray(bk.chapters)) throw new Error('KV không trả chương');
        if (bk.lock) delete bk.lock;          /* mật mã/băm không bao giờ được nằm trong repo */
        CZ.download(r.slug + '.json', JSON.stringify(bk) + '\n');
        okN++;
      }).catch(function () { fail.push(r.slug); }).then(function () {
        /* rải đều: trình duyệt hay chặn khi một trang tải nhiều file cùng một lúc */
        return new Promise(function (res) { setTimeout(res, i < rows.length ? 400 : 0); });
      }).then(next);
    }
    function finish() {
      msg('Đã tải ' + okN + '/' + rows.length + ' file — bỏ vào thư mục data/book/ của repo (đè lên file cùng tên) rồi commit lên GitHub; deploy xong là hết báo lệch.' +
        (fail.length ? ' Không tải được: ' + fail.slice(0, 5).join(', ') + '.' : ''), fail.length ? 'err' : 'ok');
      toast(okN ? ('Đã tải ' + okN + ' file data/book') : 'Không tải được file nào', okN ? 'ok' : 'err');
    }
    msg('Đang lấy ' + rows.length + ' bộ từ KV về máy…', 'info');
    return next();
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
    setTabCt('tabCmtCt', MOD.all.length);
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

  /* ================== BÁO LỖI CHỮ NGƯỜI ĐỌC GỬI =========================
     Mỗi lần người đọc bấm “Gửi báo lỗi” ở trang đọc, Worker nhận và (nếu đã
     cấu hình Resend hoặc Mail) gửi luôn email cho quản trị; ở đây đọc lại toàn bộ để
     khỏi phải vào KV bằng tay.                                            */
  var REP = { all: [], q: '' };
  function loadReports() {
    if (!ONLINE) {
      repState('Cần nối Worker để đọc báo lỗi (báo lỗi nằm trên KV).', 'err');
      paintReports();
      return Promise.resolve();
    }
    repState('<span class="spin"></span> đang đọc báo lỗi từ KV…', 'info');
    return api('/api/admin/reports').then(function (r) {
      REP.all = r.items || [];
      paintReports();
      repState(REP.all.length
        ? ('Có ' + num(REP.all.length) + ' báo lỗi gần nhất' + (r.mail ? ' · Worker đã bật gửi email cho quản trị.' : ' · Worker CHƯA bật gửi email (thiếu RESEND_API_KEY / MAIL_FROM hoặc MAIL_TO / ADMIN_EMAILS).'))
        : 'Chưa có báo lỗi nào — yên tâm.', 'ok');
    }).catch(function (e) {
      var m = String((e && e.message) || e);
      if (String(e && e.httpStatus) === '404' || m.indexOf('không có endpoint') >= 0) {
        repState('Không đọc được báo lỗi: Worker chưa có endpoint /api/admin/reports — dán worker/cms.js mới rồi Deploy.', 'err');
        paintReports();
        return;
      }
      if (!/Failed to fetch|NetworkError|Load failed/i.test(m)) {
        repState('Không đọc được báo lỗi: ' + esc(m), 'err');
        paintReports();
        return;
      }
      /* "Failed to fetch" ở ĐÚNG tab này trong khi các tab khác của admin vẫn chạy
         = Worker chặn trình duyệt ĐỌC response (thiếu access-control-allow-origin),
         không phải sai URL. Bản ≤ 1.10.0 quên header này ở /api/admin/reports.
         Thử /api/health (endpoint mở, luôn có CORS) để phân biệt hai bệnh:
           health OK     → dán worker/cms.js mới vào Worker rồi Deploy (không cần
                           đụng tới KV, ADMIN_KEY, wrangler.toml hay địa chỉ Worker);
           cũng không OK → đúng là URL sai / Worker chưa deploy / domain chưa nằm
                           trong ALLOW_ORIGIN.                                    */
      repState('<span class="spin"></span> đang đọc báo lỗi… — không nối được, đang kiểm tra Worker.', 'info');
      return api('/api/health', { auth: false }).then(function (h) {
        repState('Không đọc được báo lỗi: ' + esc(m) +
          ' → nhưng <b>/api/health vẫn trả OK</b>' + (h && h.version ? ' (Worker bản <b>' + esc(String(h.version)) + '</b>)' : '') +
          ', nên KHÔNG phải sai URL, chưa deploy, thiếu KV hay sai ADMIN_KEY. Bệnh thật: Worker đang chạy ' +
          'bản cũ, endpoint <code>/api/admin/reports</code> trả dữ liệu mà quên header CORS nên trình duyệt chặn. ' +
          'Chữa: mở Worker trong Cloudflare → <b>Quick Edit</b> → dán TOÀN BỘ tệp <code>worker/cms.js</code> bản mới → ' +
          '<b>Save and Deploy</b>. Xong mở <code>' + esc(normalizeApi(API)) + '/api/health</code> thấy ' +
          '<code>"version": "1.10.1"</code> là bấm Đọc lại được.', 'err');
        paintReports();
      }, function () {
        repState('Không đọc được báo lỗi: ' + esc(m) + ' — và /api/health cũng không gọi được, nên đúng là ' +
          'Worker chưa deploy / sai URL / domain của trang quản trị chưa nằm trong <code>ALLOW_ORIGIN</code> của Worker. ' +
          'Mở <code>' + esc(normalizeApi(API)) + '/api/health</code> trên tab mới: nếu không hiện JSON thì chữa nối trước ' +
          '(xem mục “Kết nối” ở đầu trang), nếu hiện JSON mà vẫn lỗi thì Worker đang chạy bản ≤ 1.10.0 — dán ' +
          '<code>worker/cms.js</code> mới rồi Deploy.', 'err');
        paintReports();
      });
    });
  }
  function repState(html, kind) {
    var el = $('#rpState');
    if (!el) return;
    el.className = 'msgbar show ' + (kind || 'info');
    el.innerHTML = html;
  }
  function paintReports() {
    if (!$('#rpList')) return;
    var q = REP.q.toLowerCase(), bySlug = {};
    if (REG && REG.lib) {
      REG.lib.forEach(function (n) { if (n.slug) bySlug[n.slug] = n; });
    }
    var rows = REP.all.filter(function (r) {
      if (!q) return true;
      var book = bySlug[r.slug] || {};
      var t = r.title || book.title || '';
      var chStr = r.ch ? ('chương ' + r.ch + ' ' + r.ch) : 'cả bộ';
      return (String(r.text || '') + ' ' + t + ' ' + String(r.slug || '') + ' ' + String(r.who || '') + ' ' + chStr).toLowerCase().indexOf(q) >= 0;
    });
    setTabCt('tabRepCt', REP.all.length);
    var today = new Date().toISOString().slice(0, 10);
    var byDay = {};
    REP.all.forEach(function (r) { var d = String(r.at || '').slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
    $('#rpTiles').innerHTML = [
      ['Tổng báo lỗi', num(REP.all.length)],
      ['Hôm nay', num(byDay[today] || 0)],
      ['Số bộ bị báo', num(Object.keys(REP.all.reduce(function (a, r) { if (r.slug) a[r.slug] = 1; return a; }, {})).length)],
      ['Đang hiện', num(rows.length)]
    ].map(function (t) { return '<div class="tile"><b>' + t[1] + '</b><span>' + t[0] + '</span></div>'; }).join('');
    var box = $('#rpList');
    if (!rows.length) {
      var emptyMsg = !ONLINE
        ? 'Cần nối Worker để đọc báo lỗi (báo lỗi nằm trên KV).'
        : (REP.all.length ? 'Không có báo lỗi nào khớp từ khoá.' : 'Chưa có báo lỗi nào.');
      box.innerHTML = '<div class="empty sm">' + emptyMsg + '</div>';
      return;
    }
    box.innerHTML = rows.slice(0, 300).map(function (r, i) {
      var chap = r.ch ? 'chương ' + esc(r.ch) : 'cả bộ';
      var book = bySlug[r.slug] || {};
      var title = r.title || book.title || r.slug || 'Không rõ bộ';
      var openUrl = r.url || (r.slug ? (r.ch ? CZ.readURL(r.slug, r.ch) : CZ.storyURL(r.slug)) : '#');
      return '<div class="reprow" data-i="' + i + '">' +
        '<span class="mb2"><span class="mh2"><b>' + esc(title) + '</b>' +
          '<span class="pill acc">' + chap + '</span>' +
          '<span>' + esc(CZ.timeAgo(r.at)) + '</span>' +
          '<span class="sm muted">' + esc(r.who || 'khách') + '</span></span>' +
          '<span class="mt2">' + esc(r.text) + '</span>' +
          (r.image ? '<a class="sm" href="' + esc(CZ.normalizeApi(API) + r.image) + '" target="_blank" rel="noopener">🖼️ Xem ảnh chụp</a>' : '') +
          '</span>' +
        '<span class="ract">' +
          '<a class="btn ghost sm" href="' + esc(openUrl) + '" target="_blank" rel="noopener" title="Mở đúng chương bị báo">' + ic('link', 'i-s') + ' Mở</a>' +
          '<button class="btn ghost sm" data-repcopy="' + i + '" title="Copy nội dung báo lỗi">' + ic('copy', 'i-s') + '</button>' +
          '<a class="btn ghost sm" href="mailto:' + esc(r.who && r.who.indexOf('@') > 0 ? r.who : '') + '?subject=' + encodeURIComponent('Báo lỗi · ' + title) + '&body=' + encodeURIComponent(String(r.text || '')) + '" title="Trả lời người báo">' + ic('mail', 'i-s') + '</a>' +
        '</span></div>';
    }).join('');
    box.querySelectorAll('.reprow').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('.ract') || e.target.closest('a') || e.target.closest('button')) return;
        var a = row.querySelector('.ract a');
        if (a && a.href && a.href !== '#' && !a.href.startsWith('mailto:')) {
          window.open(a.href, '_blank', 'noopener');
        }
      });
    });
    $$('#rpList [data-repcopy]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        CZ.copy(String((rows[+b.dataset.repcopy] || {}).text || ''), 'Đã copy nội dung báo lỗi');
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
    paintAuthState();
  }
  function paintAuthState(h) {
    var c = $('#aState');
    if (!c) return;
    if (!h) { c.className = 'chip'; c.innerHTML = '<span class="d"></span><span>chưa kiểm tra</span>'; return; }
    var bits = [];
    bits.push(h.supabase ? ('Supabase: sẵn sàng' + (h.supabaseKv ? ' (ghim từ KV)' : (h.supabaseEnv ? ' (biến Worker)' : '')))
                         : 'Supabase: CHƯA ghim project — đặt biến SUPABASE_URL trên Worker hoặc điền Project URL + anon key ở đây rồi Lưu');
    bits.push(h.session ? 'session: ok' : 'session: thiếu SESSION_SECRET');
    bits.push(h.google ? 'Google ID: có' : 'Google ID: không');
    bits.push(h.adminConfigured ? 'quản trị: đã cấu hình kín' : 'quản trị: thiếu ADMIN_EMAILS');
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
      else if (h.auth.supabase) msg('Worker: đã bật Supabase' + (h.auth.supabaseKv ? ' (ghim project từ KV — đổi ở mục Đăng nhập bên dưới rồi Lưu)' : '') +
        ' · ' + (h.auth.session ? 'có SESSION_SECRET' : 'thiếu SESSION_SECRET'), 'ok');
      else msg('Worker: CHƯA ghim project Supabase — người đọc đăng nhập xong vẫn bị mọi API từ chối (401). Người đọc vẫn thấy "lỗi phiên". Xử lý: dán worker/cms.js bản 1.9.8 rồi (1) đặt biến SUPABASE_URL trên Worker, hoặc (2) điền Project URL + anon key ở mục Đăng nhập dưới đây rồi Lưu.', 'err');
    }).catch(function (e) { msg('Không hỏi được Worker: ' + e.message, 'err'); });
  }

  /* biểu tượng viết trong HTML: <span data-ic="search"> → hình thật */
  $$('[data-ic]').forEach(function (el) { el.outerHTML = ic(el.dataset.ic); });

  /* ======================= PHIẾU BẦU: GỠ TỪNG NGƯỜI + RESET =============
     Phiếu nằm trong khoá `voters` của từng bộ trên KV (xem worker/cms.js).
     Mỗi dòng dưới đây là MỘT người đã bầu: tick rồi bấm “Gỡ phiếu đã chọn”
     là Worker xoá đúng khoá đó và trừ số phiếu — kể cả phiếu đặt lúc chưa
     đăng nhập (khoá máy `a:…`) hay phiếu cũ trước khi có tính năng này.      */
  function titleOf(slug) {
    var n = (REG && REG.lib || []).find(function (x) { return x.slug === slug; });
    return (n && n.title) || slug || '—';
  }
  var VO = { slug: '', data: null, chap: 'all', sel: {} };

  function voState(text, kind) {
    var el = $('#voState');
    if (!el) return;
    if (!text) { el.className = 'msgbar'; el.textContent = ''; return; }
    el.className = 'msgbar show ' + (kind || 'info');
    el.innerHTML = text;
  }
  function fillVoteBooks() {
    var sel = $('#voBook');
    if (!sel || !REG) return;
    var q = (($('#voFind') && $('#voFind').value) || '').trim().toLowerCase();
    var lib = (REG.lib || []).slice().sort(function (a, b) {
      return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
    });
    if (q) {
      lib = lib.filter(function (n) {
        return (String(n.title || '') + ' ' + String(n.slug || '') + ' ' + String(n.author || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    var html = lib.map(function (n) {
      return '<option value="' + esc(n.slug) + '">' + esc(n.title || n.slug) + '</option>';
    }).join('');
    if (!html && VO.slug) html = '<option value="' + esc(VO.slug) + '">' + esc(titleOf(VO.slug)) + '</option>';
    sel.innerHTML = html || '<option value="">— không có bộ nào khớp —</option>';
    sel.value = VO.slug || (lib[0] && lib[0].slug) || '';
    if (!VO.slug) VO.slug = sel.value || '';
  }
  function loadVoters(slug) {
    slug = slug || VO.slug || (($('#voBook') && $('#voBook').value) || '');
    if (!slug) { voState('Chưa chọn bộ nào — chọn một bộ ở ô bên trên.', 'err'); return Promise.resolve(); }
    if (!ONLINE) {
      VO.data = null; VO.slug = slug; paintVotes();
      voState('Cần nối Worker để đọc và gỡ phiếu (phiếu nằm trên KV). Chưa nối thì chỉ xem được dữ liệu tĩnh trong repo.', 'err');
      return Promise.resolve();
    }
    VO.slug = slug; VO.sel = {};
    voState('<span class="spin"></span> đang đọc danh sách người bầu của “' + esc(titleOf(slug)) + '”…', 'info');
    return api('/api/admin/voters?slug=' + encodeURIComponent(slug)).then(function (r) {
      VO.data = r; VO.chap = 'all';
      paintVotes();
      voState('“' + esc(titleOf(slug)) + '”: ' + num(r.voters || 0) + ' người đã bầu · tổng ' + num(r.total || 0) +
        ' phiếu (web đếm được ' + num(r.counted || 0) + ' + số cũ ' + num(r.base || 0) + ').', 'ok');
    }).catch(function (e) {
      VO.data = null; paintVotes();
      voState('Không đọc được danh sách phiếu: ' + esc(e.message) +
        (String(e.message).indexOf('không có endpoint') >= 0 ? ' — Worker đang là bản cũ, dán <code>worker/cms.js</code> mới rồi Deploy.' : ''), 'err');
    });
  }
  function voGroups() {
    var d = VO.data || {};
    var out = [{ ch: 0, label: 'Phiếu cho cả bộ', voters: ((d.book || {}).voters) || [], count: ((d.book || {}).count) || 0, shown: 0 }];
    Object.keys(d.chapters || {}).map(Number).sort(function (a, b) { return a - b; }).forEach(function (ch) {
      var g = d.chapters[ch] || {};
      out.push({ ch: ch, label: 'Chương ' + ch, voters: g.voters || [], count: g.count || 0, shown: Number((d.chapVotes || {})[String(ch)]) || 0 });
    });
    return out;
  }
  function voRow(v) {
    return '<label class="vrow"><input type="checkbox" data-k="' + esc(v.key) + '"' + (VO.sel[v.key] ? ' checked' : '') + '>' +
      '<span class="pill ' + (v.kind === 'user' ? 'acc' : '') + '">' + esc(v.kindLabel || 'Khác') + '</span>' +
      '<code>' + esc(v.key) + '</code>' +
      '<span class="grow"></span>' +
      '<time>' + (v.at ? 'bầu ' + esc(CZ.timeAgo(v.at)) : 'bầu trước đây') + '</time></label>';
  }
  function paintVotes() {
    var tiles = $('#voTiles'), chips = $('#voChap'), list = $('#voList');
    if (!tiles || !list) return;
    var d = VO.data;
    if (!d) {
      tiles.innerHTML = ''; chips.innerHTML = '';
      list.innerHTML = '<div class="empty sm">Chọn một bộ ở ô phía trên để xem ai đã bầu bộ đó.</div>';
      paintVoBar();
      return;
    }
    tiles.innerHTML = [
      ['Người đã bầu', num(d.voters || 0)],
      ['Tổng phiếu (số web hiện)', num(d.total || 0)],
      ['Web đếm được', num(d.counted || 0)],
      ['Số cũ nhập vào', num(d.base || 0)]
    ].map(function (t) { return '<div class="tile"><b>' + t[1] + '</b><span>' + t[0] + '</span></div>'; }).join('');
    var groups = voGroups();
    chips.innerHTML = '<button data-ch="all" class="' + (VO.chap === 'all' ? 'on' : '') + '">Tất cả<span class="ct">' +
        num(d.voters || 0) + '</span></button>' +
      groups.map(function (g) {
        if (!g.count) return '';
        return '<button data-ch="' + g.ch + '" class="' + (String(VO.chap) === String(g.ch) ? 'on' : '') + '">' +
          esc(g.ch ? ('Chương ' + g.ch) : 'Cả bộ') + '<span class="ct">' + num(g.count) + '</span></button>';
      }).join('');
    var show = groups.filter(function (g) { return VO.chap === 'all' || String(VO.chap) === String(g.ch); });
    list.innerHTML = show.map(function (g) {
      return '<div class="vgroup"><div class="vgroup-head"><b>' + esc(g.label) + '</b>' +
        '<span class="ct">' + num(g.count) + ' người</span>' +
        (g.shown ? '<span class="ct">· web hiện ' + num(g.shown) + ' phiếu</span>' : '') +
        '<span class="grow"></span>' +
        (g.voters.length ? '<button class="btn ghost sm" data-all="' + g.ch + '">Chọn cả nhóm</button>' : '') + '</div>' +
        (g.voters.length
          ? g.voters.slice(0, 500).map(voRow).join('')
          : '<div class="vrow none">Không còn khoá người bầu nào trong nhóm này' +
            (g.shown ? ' — số ' + num(g.shown) + ' phiếu hiện trên web đến từ số cũ đã nhập.' : '.') + '</div>') +
        '</div>';
    }).join('') || '<div class="empty sm">Bộ này chưa có phiếu nào.</div>';
    $$('#voList [data-k]').forEach(function (c) {
      c.addEventListener('change', function () {
        if (c.checked) VO.sel[c.dataset.k] = 1; else delete VO.sel[c.dataset.k];
        paintVoBar();
      });
    });
    $$('#voList [data-all]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = groups.filter(function (x) { return String(x.ch) === b.dataset.all; })[0];
        if (!g) return;
        var on = g.voters.some(function (v) { return !VO.sel[v.key]; });
        g.voters.forEach(function (v) { if (on) VO.sel[v.key] = 1; else delete VO.sel[v.key]; });
        paintVotes();
      });
    });
    $$('#voChap [data-ch]').forEach(function (b) {
      b.addEventListener('click', function () {
        VO.chap = b.dataset.ch === 'all' ? 'all' : Number(b.dataset.ch);
        paintVotes();
      });
    });
    paintVoBar();
  }
  function voSelected() { return Object.keys(VO.sel).filter(function (k) { return VO.sel[k]; }); }
  function paintVoBar() {
    var n = voSelected().length;
    var sel = $('#voSel');
    if (sel) sel.textContent = n ? (n + ' phiếu được chọn') : 'chưa chọn phiếu nào';
    var btn = $('#voRemove');
    if (btn) { btn.disabled = !n; btn.classList.toggle('off', !n); }
    var all = $('#voAll');
    if (all) {
      var vis = $$('#voList [data-k]').map(function (c) { return c.dataset.k; });
      all.checked = vis.length > 0 && vis.every(function (k) { return VO.sel[k]; });
    }
  }
  function removeVotes() {
    var keys = voSelected();
    if (!keys.length) return toast('Chưa chọn phiếu nào', 'err');
    if (!ONLINE) return toast('Cần nối Worker để gỡ phiếu', 'err');
    var byCh = {};
    keys.forEach(function (k) {
      var m = String(k).match(/#(\d+)$/);
      var ch = m ? parseInt(m[1], 10) : 0;
      (byCh[ch] || (byCh[ch] = [])).push(k);
    });
    var parts = Object.keys(byCh).map(function (ch) {
      return (ch === '0' ? 'cả bộ' : 'chương ' + ch) + ': ' + byCh[ch].length + ' phiếu';
    });
    CZ.confirm('Gỡ ' + keys.length + ' phiếu của bộ “' + titleOf(VO.slug) + '”?\n(' + parts.join(' · ') +
      ')\nSố phiếu ngoài web giảm ngay. Không khôi phục được.', 'Gỡ phiếu').then(function (ok) {
      if (!ok) return;
      voState('<span class="spin"></span> đang gỡ phiếu…', 'info');
      var jobs = Object.keys(byCh).map(function (ch) {
        return api('/api/admin/vote-remove', { method: 'POST', body: { slug: VO.slug, ch: Number(ch), keys: byCh[ch] } });
      });
      Promise.all(jobs).then(function (res) {
        var n = res.reduce(function (a, r) { return a + ((r && r.removed) || 0); }, 0);
        if (window.CZ && CZ._memo) CZ._memo.stats = null;
        toast('Đã gỡ ' + n + ' phiếu', 'ok');
        msg('Đã gỡ ' + n + ' phiếu khỏi “' + titleOf(VO.slug) + '” — người đọc thấy số mới ngay.', 'ok');
        return loadVoters(VO.slug).then(function () { loadStats(false); });
      }).catch(function (e) {
        voState('Gỡ phiếu lỗi: ' + esc(e.message), 'err');
        toast('Lỗi: ' + e.message, 'err');
      });
    });
  }
  function resetVotes() {
    var scope = $('#rsScope').value, what = $('#rsWhat').value;
    var ch = what === 'ch' ? (parseInt($('#rsCh').value, 10) || 0) : 0;
    if (what === 'ch' && !ch) { toast('Nhập số chương cần xoá phiếu', 'err'); $('#rsCh').focus(); return; }
    if (scope === 'one' && !VO.slug) { toast('Chọn một bộ trước đã', 'err'); return; }
    if (!ONLINE) { toast('Cần nối Worker mới reset được', 'err'); return; }
    var body = {};
    if (scope === 'one') body.slug = VO.slug;
    if (ch) body.ch = ch;
    var where = scope === 'one' ? ('bộ “' + titleOf(VO.slug) + '”') : ('TẤT CẢ ' + num(((REG && REG.lib) || []).length) + ' bộ trong thư viện');
    var whatTxt = ch ? ('phiếu của chương ' + ch) : 'toàn bộ phiếu (cả bộ + phiếu từng chương)';
    CZ.confirm('Reset ' + whatTxt + ' của ' + where + '?\nPhiếu về 0 và danh sách người bầu bị xoá — không hoàn tác được.\nLượt đọc và bình luận giữ nguyên.',
      'Reset phiếu').then(function (ok) {
      if (!ok) return;
      voState('<span class="spin"></span> đang reset dữ liệu bầu…', 'info');
      api('/api/admin/votes/reset', { method: 'POST', body: body }).then(function (r) {
        if (window.CZ && CZ._memo) CZ._memo.stats = null;
        toast('Đã reset ' + num(r.cleared || 0) + ' phiếu ở ' + num(r.stories || 0) + ' bộ', 'ok');
        msg('Reset xong: xoá ' + num(r.cleared || 0) + ' phiếu ở ' + num(r.stories || 0) + ' bộ.', 'ok');
        loadStats(false);
        if (VO.slug) loadVoters(VO.slug);
      }).catch(function (e) {
        voState('Reset lỗi: ' + esc(e.message), 'err');
        toast('Lỗi: ' + e.message, 'err');
      });
    });
  }

  /* ------------- TÌM CHỮ TRONG TOÀN BỘ CHƯƠNG CỦA MỘT BỘ ---------------
     Soạn 60 chương thì “tên nhân vật này viết sai ở chương nào” là câu hỏi
     thường gặp. Ô dưới quét cả bộ, trả về từng chương kèm đoạn chữ quanh chỗ
     khớp; bấm một dòng là mở đúng chương đó để sửa.                        */
  function plainText(html) {
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ').trim();
  }
  function hl(text, q) {
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function findInChapters() {
    var q = ($('#chFind').value || '').trim();
    var box = $('#chFindRes'), stat = $('#chFindStat');
    $('#chFindClear').classList.toggle('hide', !q);
    if (!q || !BOOK) {
      box.classList.add('hide'); box.innerHTML = ''; stat.textContent = '';
      if (q && !BOOK) toast('Chưa nạp được chương của bộ này', 'err');
      return;
    }
    var needle = q.toLowerCase(), rows = [], total = 0;
    (BOOK.chapters || []).forEach(function (c, i) {
      var txt = plainText(c.html);
      var low = txt.toLowerCase(), pos = low.indexOf(needle), hits = 0;
      if (pos < 0) return;
      while (pos >= 0 && hits < 3 && rows.length < 80) {
        var from = Math.max(0, pos - 70), to = Math.min(txt.length, pos + needle.length + 90);
        rows.push({ i: i, no: i + 1, t: c.t || ('Chương ' + (i + 1)),
          snip: (from ? '…' : '') + hl(txt.slice(from, to), q) + (to < txt.length ? '…' : '') });
        hits++; total++;
        pos = low.indexOf(needle, pos + needle.length);
      }
      if (pos >= 0) total++;          /* còn nữa nhưng đã đủ 3 đoạn/chương */
    });
    if (!rows.length) {
      box.classList.remove('hide');
      box.innerHTML = '<div class="empty sm">Không thấy “' + esc(q) + '” trong ' + num(((BOOK.chapters || []).length)) + ' chương.</div>';
      stat.textContent = 'không có kết quả';
      return;
    }
    box.classList.remove('hide');
    box.innerHTML = rows.map(function (r) {
      return '<button class="findrow" data-i="' + r.i + '"><span class="fno"><b>#' + r.no + '</b>' + esc(String(r.t).slice(0, 40)) + '</span>' +
        '<span class="ftxt">' + r.snip + '</span></button>';
    }).join('');
    stat.textContent = rows.length + ' đoạn khớp trong ' + Object.keys(rows.reduce(function (a, r) { a[r.i] = 1; return a; }, {})).length + ' chương';
    $$('#chFindRes [data-i]').forEach(function (b) {
      b.addEventListener('click', function () {
        openChap(Number(b.dataset.i));
        var box2 = $('#edBody');
        if (box2) box2.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }
  function clearFind() {
    $('#chFind').value = '';
    $('#chFindRes').classList.add('hide');
    $('#chFindRes').innerHTML = '';
    $('#chFindStat').textContent = '';
    $('#chFindClear').classList.add('hide');
  }

  /* ------------------------ NHÂN BẢN MỘT BỘ ----------------------------- */
  /* Bộ mới thường giống bộ cũ (cùng tác giả, cùng couple, cùng kiểu mô tả):
     nhân bản lấy cả chương rồi sửa lại nhanh hơn tạo từ số 0 rất nhiều.     */
  function dupBook() {
    if (!CUR || !BOOK) return toast('Chưa chọn bộ nào để nhân bản', 'err');
    var base = (CUR.slug || 'bo-moi') + '-copy';
    var slug = base, i = 2;
    while (((REG && REG.lib) || []).some(function (n) { return n.slug === slug; })) slug = base + '-' + (i++);
    CZ.confirm('Tạo bản sao của “' + CUR.title + '”?\nSlug mới: ' + slug +
      '\nBản sao gồm cả ' + ((BOOK.chapters || []).length) + ' chương — xong nhớ sửa tên, mô tả và ảnh bìa.', 'Nhân bản').then(function (ok) {
      if (!ok) return;
      var meta = JSON.parse(JSON.stringify(CUR));
      delete meta._oldSlug;
      meta.title = (CUR.title || 'Bộ mới') + ' (bản sao)';
      meta.slug = slug;
      meta.updated = today();
      /* bản sao lấy mô tả đầy đủ từ tệp chương đang mở nếu ô nhập chưa có */
      meta.synFull = String(meta.synFull || (BOOK && BOOK.synFull) || '').trim();
      meta.syn = CZ.teaser(meta.synFull, 220);
      var book = { title: meta.title, slug: slug, author: meta.author, couple: meta.couple,
        synFull: meta.synFull,
        chapters: JSON.parse(JSON.stringify(BOOK.chapters || [])) };
      (REG.lib || []).push(meta);
      BOOKS[slug] = book;
      dirty.meta = true; markDirty();
      var chain = ONLINE
        ? api('/api/book/' + encodeURIComponent(slug), { method: 'PUT', body: book })
        : Promise.resolve();
      chain.then(function () {
        return saveRegistry('Đã nhân bản “' + CUR.title + '”');
      }).then(function () {
        renderList(); fillVoteBooks(); renderOverview();
        openEdit(slug);
        toast('Đã nhân bản thành “' + meta.title + '” — sửa tên rồi lưu', 'ok');
      }).catch(function (e) { toast('Nhân bản lỗi: ' + e.message, 'err'); });
    });
  }

  /* -------------------- NHÁP TRONG MÁY (không hỏi khi mở trang) ----------
     Bản nháp là lưới an toàn khi chưa nối Worker hoặc lỡ tay. Trước đây mỗi
     lần mở trang nó bật hộp thoại hỏi “Dùng bản nháp đó?” — chủ trang thấy
     phiền, nên giờ chỉ còn một nút nhỏ trên thanh trên khi THẬT SỰ có nháp.  */
  function draftRead() {
    try { return JSON.parse(localStorage.getItem(LS.draft) || 'null'); } catch (e) { return null; }
  }
  function paintDraftChip() {
    var d = draftRead();
    var when = d ? new Date(d.at).toLocaleString('vi-VN') : '';
    ['#btnDraftRestore', '#btnDraftUse', '#btnDraftDrop'].forEach(function (s) {
      var el = $(s); if (el) el.classList.toggle('hide', !d);
    });
    var info = $('#draftInfo');
    if (info) info.textContent = d ? ('Bản nháp lưu trong máy này lúc ' + when) : '';
    var chip = $('#btnDraftRestore');
    if (chip && d) chip.title = 'Máy này còn nháp lưu lúc ' + when + ' — bấm để xem lại và dùng';
  }
  function useDraft() {
    var d = draftRead();
    if (!d || !d.reg) { toast('Không có bản nháp nào trong máy', 'err'); paintDraftChip(); return; }
    CZ.confirm('Nạp bản nháp lưu lúc ' + new Date(d.at).toLocaleString('vi-VN') + ' vào trang này?\n' +
      'Dữ liệu đang xem sẽ được thay bằng bản nháp (chỉ ở trong máy — bấm Lưu mới ghi lên KV).', 'Dùng nháp').then(function (ok) {
      if (!ok) return;
      REG = d.reg; BOOKS = d.books || {};
      REG.lib = REG.lib || [];
      REG.editorChoice = REG.editorChoice || (REG.settings && REG.settings.editorChoice) || [];
      dirty.meta = dirty.set = true; markDirty();
      renderList(); fillVoteBooks(); renderSlides(); renderSched(); renderSettings(); renderOverview();
      $('#libCount').textContent = num(REG.lib.length);
      msg('Đã nạp bản nháp trong máy — kiểm tra rồi bấm Lưu để ghi lên KV.', 'info');
      toast('Đã nạp bản nháp', 'ok');
    });
  }
  function dropDraft() {
    CZ.confirm('Xoá bản nháp trong máy này? (Không ảnh hưởng dữ liệu trên KV)', 'Xoá nháp').then(function (ok) {
      if (!ok) return;
      try { localStorage.removeItem(LS.draft); } catch (e) {}
      paintDraftChip(); toast('Đã xoá bản nháp trong máy');
    });
  }

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
    if (box) {
      box.classList.toggle('hide', !u);
      box.innerHTML = u
        ? (u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">'
                     : '<span class="ava">' + esc(String(u.name || u.email || 'A')[0].toUpperCase()) + '</span>') +
          '<span>' + esc(u.name || u.email || '') + '</span>'
        : '';
    }
    if (rb) {
      /* huy hiệu quyền: nói rõ vào bằng TÀI KHOẢN hay bằng KHOÁ ADMIN_KEY */
      if (!(u && isAdmin()) && MODE !== 'key') {
        rb.classList.add('hide'); rb.innerHTML = '';
      } else {
        var viaKey = MODE === 'key' || (!u && MODE === 'key');
        rb.classList.remove('hide');
        rb.title = viaKey
          ? 'Quản trị bằng khoá ADMIN_KEY của Worker (không gắn tài khoản)'
          : 'Quản trị bằng tài khoản Google trong danh sách Worker (ADMIN_EMAILS)';
        rb.innerHTML = ic(viaKey ? 'key' : 'shield', 'i-s') + (viaKey ? 'quản trị · khoá' : 'quản trị · Google');
      }
    }
    if (lo) lo.classList.toggle('hide', !u);
    var gw = $('#gateWho');
    if (gw) {
      gw.innerHTML = u
        ? 'Đang đăng nhập: <b>' + esc(u.email || u.name) + '</b> · ' +
          (isAdmin() ? 'Worker đã xác nhận quyền quản trị.' : '<b>không</b> có quyền quản trị trên Worker.')
        : 'Chưa đăng nhập. Danh sách tài khoản quản trị được giữ kín trên Worker.';
    }
  }
  /* MODE = cách đã qua cổng: 'login' (tài khoản Google/Supabase) | 'key'
     (ADMIN_KEY) | 'local' (dữ liệu tĩnh). Huy hiệu ở thanh trên nói rõ
     quyền này đến từ đâu — cùng một mức quyền, khác nguồn xác nhận. */
  var MODE = '';
  function gatePass(how) {
    AUTHED = true;
    MODE = how;
    var g = $('#gate'); if (g) g.classList.add('hide');
    var sh = $('#ashell'); if (sh) sh.classList.add('authed');
    paintWho();
  }
  function gateHold(text, kind) {
    AUTHED = false;
    MODE = '';
    var g = $('#gate'); if (g) g.classList.remove('hide');
    var app = $('#scApp'); if (app) app.classList.add('hide');
    var sh = $('#ashell'); if (sh) sh.classList.remove('authed');
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
    try { savedApi = localStorage.getItem(LS.api) || ''; savedKey = keyLoad(); } catch (e) {}
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
      try { savedApi = localStorage.getItem(LS.api) || ''; savedKey = keyLoad(); } catch (e) {}
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
  /* công tắc sáng/tối — cùng cấu trúc Uiverse với đầu trang web */
  (function () {
    var tb = $('#btnTheme'), tin = $('#btnThemeIn');
    var sl = tb && tb.querySelector('.tsw-sl');
    /* admin.html là HTML tĩnh, nên chèn hai SVG vào sau rãnh; không chèn vào
       .tsw-sl vì mẫu Uiverse dùng các anh em cùng cấp với back. */
    if (tb && sl && !tb.querySelector('.tsw-icon')) {
      sl.insertAdjacentHTML('afterend', ic('moon', 'tsw-icon moon') + ic('sun', 'tsw-icon sun'));
    }
    function paint() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var lbl = dark ? 'Đang bật nền tối — bấm để về nền sáng' : 'Đang ở nền sáng — bấm để bật nền tối';
      if (tin) { tin.checked = dark; tin.setAttribute('aria-label', lbl); }
      if (tb) { tb.setAttribute('title', lbl); tb.setAttribute('aria-label', lbl); }
    }
    paint();
    /* xem chú thích ở src/cz-app.js: chỉ nghe 'change' và chỉ lật khi đang lệch */
    if (tin) tin.addEventListener('change', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (tin.checked !== dark) CZ.themeToggle();
      paint();
    });
  })();
  $$('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.tab;
      if (k === 'stats') loadStats(false);
      if (k === 'votes') { fillVoteBooks(); if (ONLINE && !VO.data) loadVoters($('#voBook').value); paintVotes(); }
      if (k === 'overview') renderOverview();
      if (k === 'doctor') { if (!DOC.rows.length) runDoctor(); if (ONLINE) loadKV(); }
      if (k === 'cmts') { fillModBooks(); loadMod(); }
      if (k === 'reports') loadReports();
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
    CZ.download('ssochuz-registry-' + today() + '.json', JSON.stringify(REG, null, 1));
  });
  $('#btnAdd2').addEventListener('click', function () { show('new'); });
  $('#btnNew').addEventListener('click', addBook);
  $('#nTitle').addEventListener('input', function () {
    if (!$('#nSlug').dataset.touched) $('#nSlug').value = slugify(this.value);
  });
  $('#nSlug').addEventListener('input', function () { this.dataset.touched = '1'; });
  $('#edBack').addEventListener('click', function () { show('list'); });
  ['#fTitle', '#fSlug', '#fAuthor', '#fCouple', '#fYear', '#edStatus', '#fCount', '#f18', '#fUpdated', '#fThumb', '#fSyn']
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
  $('#chTitle').addEventListener('input', function () { dirty.book = true; markDirty(); henTuLuu(); });
  /* trình soạn: gõ là tính lại từ/ký tự + đánh dấu chưa lưu
     Đặt defaultParagraphSeparator='p' để tránh <div><br></div> nhân đôi dòng trống */
  var edIn = $('#edBody');
  if (edIn) {
    /* Bản 2.0: gắn trình soạn TipTap vào đúng phần tử #edBody. Gắn được thì
       không cần execCommand nữa; gắn không được thì giữ nguyên đường cũ. */
    var gan = w.CZEditor && w.CZEditor.mount(edIn, function () {
      dirty.book = true; markDirty(); chStat(); henTuLuu();
    }, {
      /* menu "/" → mục "Chèn ảnh" dùng lại đúng nút tải ảnh sẵn có */
      onImage: function () { var f = $('#edImg'); if (f) f.click(); },
    });
    if (!gan) {
      edIn.addEventListener('input', function () { dirty.book = true; markDirty(); chStat(); henTuLuu(); });
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
      edIn.addEventListener('focus', function () {
        try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e2) {}
      });
    }
  }
  /* thanh định dạng: B/I/U/S · H2/H3/Đoạn/trích dẫn · gạch phân cách · canh */
  $('#edToolbar').addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (b.dataset.cmd) edExec(b.dataset.cmd, null);
    else if (b.dataset.block) edBlock(b.dataset.block);
    else if (b.dataset.align) edExec('justify' + b.dataset.align.charAt(0).toUpperCase() + b.dataset.align.slice(1), null);
    else if (b.dataset.img !== undefined) $('#edImg').click();
  });
  /* Ctrl+B/I/U vẫn hoạt động tự nhiên trong contenteditable — chỉ giữ focus
     cho khu soạn khi bấm chuột vào khung */
  if (edIn) edIn.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') { /* Tab = thụt dòng 2 nấc (lời hứa của trình soạn) */
      e.preventDefault();
      try { document.execCommand('insertText', false, '  '); } catch (x) {}
    }
  });
  /* ảnh trong chương: lên từ máy → nén WebP → KV → chèn <img> */
  $('#edImg').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    var ed2 = $('#edBody');
    uploadImageFile(f, function (busy) {
      if (busy) {
        /* Không chèn ô "đang tải" vào trong khung soạn khi dùng trình soạn mới:
           ProseMirror sở hữu vùng DOM đó, chèn thẳng vào sẽ bị xoá lúc vẽ lại
           hoặc lọt vào nội dung chương. Báo bằng toast cho an toàn. */
        if (w.CZEditor && w.CZEditor.ready()) { toast(busy, 'info'); return; }
        var old = ed2.innerHTML;
        if (old.indexOf('img-uploading') < 0) ed2.insertAdjacentHTML('beforeend', '<p class="img-uploading"><span class="spin"></span> ' + esc(busy) + '</p>');
        return;
      }
    }).then(function (r) {
      var tag = $('#edBody .img-uploading'); if (tag) tag.remove();
      if (!r) return;
      edInsertImage(r.url, $('#chTitle').value.trim() || '');
      toast('Đã chèn ảnh (' + Math.max(1, Math.round(r.bytes / 1024)) + ' KB) — bấm “Lưu chương này” rồi “Lưu toàn bộ chương”', 'ok');
    }).catch(function (e) {
      var tag = $('#edBody .img-uploading'); if (tag) tag.remove();
      toast(e.message, 'err');
    });
  });
  /* mở tệp chương từ máy: .txt/.md/.html */
  $('#chFileBtn').addEventListener('click', function () { $('#chFile').click(); });
  $('#chFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (f) importChapterFile(f);
  });
  $('#chSave').addEventListener('click', function () {
    if (!edSaveCurrent(true)) return toast('Chọn một chương trong danh sách trước', 'err');
    renderChapters();
  });
  $('#chDel').addEventListener('click', function () {
    if (!BOOK || CHAP < 0) return;
    var i = CHAP;
    CZ.confirm('Xoá chương ' + (i + 1) + ' — ' + (BOOK.chapters[i].t || '') + '?', 'Xoá').then(function (ok) {
      if (!ok) return;
      BOOK.chapters.splice(i, 1); CHAP = -1;
      $('#chTitle').value = '';
      /* Trình soạn mới tự quản DOM: phải gọi clear(), gán innerHTML='' vô tác
         dụng (chữ của chương vừa xoá sẽ còn nguyên trong khung). */
      if (w.CZEditor && w.CZEditor.ready()) w.CZEditor.clear();
      else edIn.innerHTML = '';
      chStat();
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
    if (edSaveCurrent(true)) saveBook('Đã lưu chương');
  });
  /* xoá bộ: BẤM HAI LẦN (nút tự chuyển thành “xác nhận” 8 giây) */
  $('#btnDelBook').addEventListener('click', function () {
    if (!CUR) return;
    var self = this;
    arm2(this, 'Bấm lần nữa để XOÁ TOÀN BỘ', function () { delBookRun(CUR.slug); self.blur(); });
  });
  /* ảnh bìa: lên từ máy → nén WebP → KV → điền URL vào ô */
  $('#btnCoverUp').addEventListener('click', function () { $('#coverFile').click(); });
  $('#coverFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    var busy = $('#coverBusy');
    uploadImageFile(f, function (t) { busy.textContent = t || ''; })
      .then(function (r) {
        busy.textContent = '';
        if (!r) return;
        /* ảnh sống trên Worker (domain khác web) → URL tuyệt đối */
        var abs = CZ.API ? (CZ.API.replace(/\/+$/, '') + r.url) : r.url;
        $('#fThumb').value = abs;
        var im = $('#coverImg'); if (im) im.src = abs;
        var prev = $('#coverPrev'); if (prev) prev.classList.remove('empty');
        CUR = CUR || {}; CUR.thumb = abs; CUR.slide = abs;
        dirty.meta = true; markDirty();
        toast('Đã lên ảnh bìa (' + Math.max(1, Math.round(r.bytes / 1024)) + ' KB) — nhớ bấm “Lưu thông tin”', 'ok');
      })
      .catch(function (e) { busy.textContent = ''; toast(e.message, 'err'); });
  });
  $('#fThumb').addEventListener('input', function () {
    var im = $('#coverImg'), prev = $('#coverPrev');
    if (im) { im.src = this.value.trim(); }
    if (prev) prev.classList.toggle('empty', !this.value.trim());
  });
  /* khóa mật mã */
  $('#btnLock').addEventListener('click', function () {
    if (!CUR) return;
    var p1 = $('#lockPw').value, p2 = $('#lockPw2').value;
    if (p1.length < 8) return msg('Mật mã cần tối thiểu 8 ký tự.', 'err');
    if (p1 !== p2) return msg('Hai ô mật mã không khớp nhau.', 'err');
    var self = this;
    arm2(this, 'Khóa/đổi mật mã — bấm lần nữa', function () {
      self.blur();
      var busy2 = $('#lockBusy');
      busy2.textContent = 'Đang gửi lên Worker…';
      lockBook(p1).then(function () {
        busy2.textContent = '';
        $('#lockPw').value = ''; $('#lockPw2').value = '';
        toast(CUR.lock ? 'Đã khóa “' + CUR.title + '” — chương chỉ mở với mật mã' : 'Đã bỏ khóa', 'ok');
        msg('Mật mã đã đổi trên Worker. Người đọc sẽ nhập mật mã mới; token cũ (còn hạn) vẫn mở tới khi hết hạn.', 'ok');
      }).catch(function (e) {
        busy2.textContent = '';
        msg(e.message, 'err');
      });
    });
  });
  $('#btnUnlock').addEventListener('click', function () {
    if (!CUR) return;
    var self = this;
    arm2(this, 'Bỏ khóa — bấm lần nữa', function () {
      self.blur();
      var busy3 = $('#lockBusy');
      busy3.textContent = 'Đang bỏ khóa…';
      lockBook('').then(function () {
        busy3.textContent = '';
        toast('Đã bỏ khóa “' + CUR.title + '” — chương công khai trở lại', 'ok');
      }).catch(function (e) { busy3.textContent = ''; msg(e.message, 'err'); });
    });
  });
  $('#sSave').addEventListener('click', saveSettings);
  ['#sSched', '#sSchedNote', '#sGiscusRepo', '#sGiscusId', '#aUrl', '#aKey', '#aGoogle']
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
  /* N12: gõ nhãn giới thiệu từng slide (mất focus là nhớ vào REG + báo chưa lưu) */
  $('#slidePick').addEventListener('input', function (e) {
    var inp = e.target && e.target.closest && e.target.closest('input.hpreason');
    if (!inp) return;
    var i = parseInt(inp.dataset.r, 10);
    if (isNaN(i)) return;
    var list = slidePicks();
    if (!list[i]) return;
    list[i].reason = inp.value;
    REG.slides = slideStore(list);
    dirty.set = true; markDirty();
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
  ['#dEnabled','#dBank','#dAccNo','#dAccName','#dMomo','#dQr','#dMsg','#rForm'].forEach(function (s) {
    var el = $(s); if (el) el.addEventListener('input', function () { dirty.set = true; markDirty(); });
  });
  
  $('#btnSeed').addEventListener('click', function () {
    /* nạp đè toàn bộ KV — xác nhận 2 bước (nút) + 1 bước (hộp thoại) */
    var self = this;
    arm2(this, 'Nạp đè toàn bộ KV — bấm lần nữa', function () { self.blur(); seedKV(); });
  });
  $('#btnHealth').addEventListener('click', function () { health().then(function () { toast('Đã kiểm tra Worker', 'ok'); }); });
  $('#btnStatsClear').addEventListener('click', function () { loadStats(true); show('stats'); });
  $('#btnBackup').addEventListener('click', backup);
  $('#btnRestore').addEventListener('click', function () {
    /* phục hồi từ file ghi đè dữ liệu — xác nhận 2 bước trước khi mở chọn tệp */
    var self = this;
    arm2(this, 'Phục hồi từ file — bấm lần nữa', function () { self.blur(); $('#fileRestore').click(); });
  });
  $('#fileRestore').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (f) restore(f);
    e.target.value = '';
  });
  $('#btnStats').addEventListener('click', function () { loadStats(true); });
  $('#btnStatsFb').addEventListener('click', function () { importFbStats(); });
  window.addEventListener('beforeunload', function (e) {
    /* còn chữ chưa kịp tự lưu thì ghi ngay, đừng chờ hết 2 giây */
    if (boTuLuu && boTuLuu.dangCho()) boTuLuu.ghiNgay();
    if (dirty.meta || dirty.book || dirty.set) { e.preventDefault(); e.returnValue = ''; }
  });
  /* Chuyển tab / khoá máy cũng là lúc dễ mất bài: trình duyệt di động có thể
     huỷ trang mà KHÔNG chạy beforeunload, nhưng visibilitychange thì có. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && boTuLuu && boTuLuu.dangCho()) boTuLuu.ghiNgay();
  });
  /* dọn nháp tự lưu quá 7 ngày, chạy nền không chặn gì */
  if (w.CZAutosave && w.CZAutosave.don) { try { w.CZAutosave.don(); } catch (e) {} }
  /* KHÔNG có phím tắt ở trang quản trị (yêu cầu của chủ trang 17/09/2026):
     những tổ hợp như Ctrl+S/Ctrl+K hay bấm số để đổi tab gây phiền khi gõ nội
     dung và dễ bấm nhầm. Muốn lưu hay đổi tab thì bấm nút trên giao diện.
     Riêng Enter trong ô nhập (kết nối, tìm chương) và Tab trong ô soạn chương
     vẫn giữ — đó là thao tác gõ chữ thông thường, không phải phím tắt. */


  /* ------------------- nút ở CỔNG đăng nhập + thanh trên ------------------ */
  $('#gateLogin').addEventListener('click', function () {
    var b = this;
    b.disabled = true; b.innerHTML = '<span class="spin"></span> đang mở đăng nhập…';
    gateMsg('Đang chuyển sang trang đăng nhập… Nếu trình duyệt chặn cửa sổ, hãy cho phép pop-up.', 'info');
    (window.CZ_AUTH ? CZ_AUTH.login() : Promise.resolve(null))
      .then(function () {
        if (!isAdmin()) {
          var u = authUser();
          gateHold(u ? ('Tài khoản ' + (u.email || u.name) + ' không được Worker cấp quyền quản trị. ' +
            'Thêm tài khoản vào Secret ADMIN_EMAILS trên Worker rồi đăng nhập lại, hoặc dùng tài khoản khác.')
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
  $('#kvRun').addEventListener('click', loadKV);
  $('#docFixKv').addEventListener('click', function () {
    /* nạp chương từ repo ghi đè kho chương trên KV — xác nhận 2 bước */
    var self = this;
    arm2(this, 'Nạp đè chương từ repo — bấm lần nữa', function () { self.blur(); docPushRepo(); });
  });
  $('#docRecount').addEventListener('click', docRecount);
  $('#docFixReg').addEventListener('click', docFixRegistry);
  $('#docPullRepo').addEventListener('click', function () {
    /* chiều ngược của nút nạp repo lên KV: lấy bản KV về file data/book/<slug>.json.
       Không ghi gì lên KV nên không cần xác nhận 2 bước. */
    pullRepo();
  });
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
    CZ.download('ssochuz-doctor-' + today() + '.json', JSON.stringify(rep, null, 1));
    toast('Đã tải báo cáo', 'ok');
  });

  /* ------------------------------ BÌNH LUẬN ------------------------------ */
  $('#cmReload').addEventListener('click', function () { MOD.all = []; loadMod(); });
  $('#cmQ').addEventListener('input', function () { MOD.q = this.value.trim(); paintMod(); });
  $('#cmBook').addEventListener('change', function () { MOD.slug = this.value; paintMod(); });
  $('#cmExport').addEventListener('click', function () {
    CZ.download('ssochuz-comments-' + today() + '.json', JSON.stringify(MOD.all, null, 1));
    toast('Đã xuất ' + MOD.all.length + ' bình luận', 'ok');
  });

  /* ------------------------------- NHẬT KÝ ------------------------------- */
  $('#rpReload').addEventListener('click', loadReports);
  $('#rpQ').addEventListener('input', function () { REP.q = this.value.trim(); paintReports(); });
  $('#rpExport').addEventListener('click', function () {
    if (!REP.all.length) { toast('Chưa có báo lỗi nào để xuất', 'err'); return; }
    CZ.download('ssochuz-bao-loi-' + today() + '.json', JSON.stringify(REP.all, null, 1));
    toast('Đã xuất ' + REP.all.length + ' báo lỗi', 'ok');
  });
  $('#logReload').addEventListener('click', loadLog);

  /* ------------------------------- PHIẾU BẦU ----------------------------- */
  $('#voBook').addEventListener('change', function () { loadVoters(this.value); });
  $('#voReload').addEventListener('click', function () { loadVoters($('#voBook').value); });
  var voFT = null;
  $('#voFind').addEventListener('input', function () {
    clearTimeout(voFT);
    voFT = setTimeout(function () { fillVoteBooks(); }, 180);
  });
  $('#voRemove').addEventListener('click', removeVotes);
  $('#voClearSel').addEventListener('click', function () { VO.sel = {}; paintVotes(); });
  $('#voAll').addEventListener('change', function () {
    var on = this.checked;
    $$('#voList [data-k]').forEach(function (c) { if (on) VO.sel[c.dataset.k] = 1; else delete VO.sel[c.dataset.k]; });
    paintVotes();
  });
  $('#rsWhat').addEventListener('change', function () {
    var isCh = this.value === 'ch';
    $('#rsCh').classList.toggle('hide', !isCh);
    if (isCh) $('#rsCh').focus();
    $('#rsHint').textContent = isCh ? 'chỉ xoá phiếu của 1 chương trong phạm vi đã chọn' : '';
  });
  $('#rsScope').addEventListener('change', function () {
    $('#rsHint').textContent = this.value === 'one'
      ? ('bộ: ' + (VO.slug ? titleOf(VO.slug) : 'chưa chọn — sang ô trên chọn bộ'))
      : 'mọi bộ trong thư viện';
  });
  $('#rsRun').addEventListener('click', function () {
    /* reset phiếu không hoàn tác được — xác nhận 2 bước (nút) + 1 bước (hộp thoại) */
    var self = this;
    arm2(this, 'Reset phiếu — bấm lần nữa', function () { self.blur(); resetVotes(); });
  });

  /* --------------------- NHÂN BẢN + TÌM TRONG CHƯƠNG ---------------------- */
  $('#edDup').addEventListener('click', dupBook);
  var chFT = null;
  $('#chFind').addEventListener('input', function () {
    clearTimeout(chFT);
    chFT = setTimeout(findInChapters, 220);
  });
  $('#chFind').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); findInChapters(); } });
  $('#chFindGo').addEventListener('click', findInChapters);
  $('#chFindClear').addEventListener('click', clearFind);

  /* ------------------------------ NHÁP TRONG MÁY ------------------------- */
  $('#btnDraftRestore').addEventListener('click', useDraft);
  $('#btnDraftUse').addEventListener('click', useDraft);
  $('#btnDraftDrop').addEventListener('click', dropDraft);

  /* ------------------------------- SỐ LIỆU ------------------------------- */
  $('#btnStatsCsv').addEventListener('click', function () {
    var items = STATS_LAST.items || {};
    if (!Object.keys(items).length) return toast('Chưa có số liệu để xuất', 'err');
    CZ.download('ssochuz-stats-' + today() + '.csv', statsCsv(items, STATS_LAST.by || {}), 'text/csv');
    toast('Đã xuất CSV', 'ok');
  });

  /* --------------------------- CẤU HÌNH ĐĂNG NHẬP ------------------------ */
  $('#aCheck').addEventListener('click', checkAuthWorker);

  /* ------------------------------ khởi động ---------------------------- */
  (function init() {
    CZ.themeInit();
    fillStatusFilter();
    var savedApi = '', savedKey = '';
    try { savedApi = localStorage.getItem(LS.api) || ''; savedKey = keyLoad(); } catch (e) {}
    if (savedApi) $('#inApi').value = savedApi;
    if (!savedApi && CZ.API) $('#inApi').value = CZ.API;     /* gợi ý từ cz-config.js */
    paintDraftChip();                    /* có nháp thì hiện nút, không hỏi hộp thoại */
    /* việc nối Worker do boot() ở trên lo — không gọi hai lần */
  })();

})();
