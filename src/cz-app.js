/* ============================================================================
   ssochuz · lõi dùng chung cho MỌI trang (chủ / truyện / đọc / quản trị)
   ----------------------------------------------------------------------------
   Gồm 4 phần, không phụ thuộc thư viện ngoài:
     1. DỮ LIỆU   : Worker KV → cache máy → /data/*.json ; số liệu xếp hạng cũng từ KV
     2. GHI NHỚ   : tiến độ đọc, tủ truyện, thích, đánh dấu, cài đặt đọc, sáng/tối
     3. GIAO DIỆN : bộ icon, thẻ truyện, đầu trang/chân trang, tìm kiếm nổi,
                    toast, hộp thoại, hiệu ứng cuộn
     4. TIỆN ÍCH  : esc, định dạng ngày/số, đường dẫn truyện/đọc
   Mọi trang chỉ cần nạp 2 file:  cz-config.js  →  cz-app.js
   ========================================================================== */
(function (w, d) {
  'use strict';

  /* ======================= ĐỔI TÊN chuseoz → ssochuz ====================
     Khoá localStorage cũ (chuseoz-*) được CHUYỂN SANG đầu ssochuz- một lần,
     giữ nguyên tiến độ đọc, tủ truyện, lượt thích, cài đặt… của người dùng. */
  try {
    var _OLDP = 'chuseoz-', _NEWP = 'ssochuz-', _ks = [], _i = 0;
    for (_i = 0; _i < localStorage.length; _i++) {
      var _k0 = localStorage.key(_i);
      if (_k0 && _k0.indexOf(_OLDP) === 0) _ks.push(_k0);
    }
    _ks.forEach(function (k0) {
      var k1 = _NEWP + k0.slice(_OLDP.length);
      try {
        if (localStorage.getItem(k1) == null) localStorage.setItem(k1, localStorage.getItem(k0));
        localStorage.removeItem(k0);
      } catch (e) {}
    });
  } catch (e) {}

  /* ======================= 0. CẤU HÌNH ================================= */
  function normalizeApi(u) {
    u = String(u == null ? '' : u).trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;   /* dán thiếu https:// vẫn chạy */
    return u;
  }
  var API = normalizeApi(w.CZ_API);
  var FB_PROJECT = w.CZ_FIREBASE_PROJECT || 'chuseoz-library';
  var TTL_REG = 6 * 3600 * 1000;    /* registry: 6 giờ khi không nối Worker */
  var TTL_STATS = 10 * 60 * 1000;   /* số liệu: 10 phút */

  /* ======================= 1. DỮ LIỆU ================================== */
  var memo = { reg: null, src: '', books: {}, stats: null, sched: null };
  /* Worker lỗi/chặn một lần trong phiên ⇒ các lần sau đi thẳng vào /data (khỏi chờ 9 giây mỗi trang) */
  var apiDown = false;

  function jget(url, ms) {
    var opt = {}, ctl = null, to = null;
    if (w.AbortController && ms !== -1) { ctl = new w.AbortController(); opt.signal = ctl.signal; to = setTimeout(function () { ctl.abort(); }, ms || 9000); }
    return fetch(url, opt).then(function (r) {
      if (to) clearTimeout(to);
      if (!r || !r.ok) return null;
      return r.json().catch(function () { return null; });
    }).catch(function () { if (to) clearTimeout(to); return null; });
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsGet(k, ttl) {
    try {
      var raw = localStorage.getItem(k); if (!raw) return null;
      var o = JSON.parse(raw);
      if (ttl && o && o.t && Date.now() - o.t > ttl) return null;
      return o && o.v;
    } catch (e) { return null; }
  }
  function revNum(r) { return r && r.rev ? String(r.rev).replace(/[^0-9]/g, '') : '0'; }
  function newer(a, b) { if (!a) return b; if (!b) return a; return revNum(a) >= revNum(b) ? a : b; }

  /* -- thư viện: ưu tiên KV → cache → file tĩnh ------------------------- */
  function registry() {
    if (memo.reg) return Promise.resolve({ reg: memo.reg, src: memo.src });
    var cached = lsGet('ssochuz-reg', TTL_REG);
    var useApi = !!API && !apiDown;
    var p = useApi ? jget(API + '/api/registry?_=' + Date.now(), 9000) : Promise.resolve(null);
    return p.then(function (api) {
      if (api && api.lib) {
        apiDown = false;
        memo.reg = api; memo.src = 'kv'; w.CZ_SRC = 'kv';
        lsSet('ssochuz-reg', { t: Date.now(), v: api });
        return { reg: api, src: 'kv' };
      }
      if (useApi) apiDown = true;
      return jget('/data/registry.json?_=' + Date.now(), 9000).then(function (stat) {
        var reg = newer(stat, cached) || { lib: [] };
        if (stat) lsSet('ssochuz-reg', { t: Date.now(), v: stat });
        memo.reg = reg; memo.src = 'static'; w.CZ_SRC = 'static';
        return { reg: reg, src: 'static' };
      });
    });
  }
  /* -- một bộ: chương + nội dung ---------------------------------------- */
  function book(slug) {
    slug = String(slug || '');
    if (!slug) return Promise.resolve(null);
    if (memo.books[slug]) return memo.books[slug];
    var p = (API && !apiDown ? jget(API + '/api/book/' + encodeURIComponent(slug), 15000) : Promise.resolve(null))
      .then(function (b) {
        if (b && b.chapters && b.chapters.length) return b;
        return jget('/data/book/' + encodeURIComponent(slug) + '.json', 20000);
      })
      .then(function (b) {
        memo.books[slug] = b || null;
        if (b && b.chapters && b.chapters.length) reconcileCount(slug, b.chapters.length);
        return b || null;
      })
      .catch(function () { memo.books[slug] = null; return null; });
    memo.books[slug] = p;
    return p;
  }
  /* -- số liệu xếp hạng: đọc từ Worker KV (không cần Firebase) ------------
     Worker đếm lượt đọc/bình chọn rồi trả về qua /api/stats. Không đọc được
     thì KHÔNG bịa số — bảng xếp hạng tự xếp theo số chương + ngày cập nhật.
     CZ_STATS_DIRECT = true mới gọi thẳng Firestore cũ (chỉ để đối chiếu). */
  function fbVal(v) {
    if (v == null) return null;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.timestampValue !== undefined) return v.timestampValue;
    return null;
  }
  function fromFirestore() {
    return jget('https://firestore.googleapis.com/v1/projects/' + FB_PROJECT +
      '/databases/(default)/documents/novelData?pageSize=300', 9000).then(function (r) {
      if (!r || !r.documents || !r.documents.length) return null;
      var items = {};
      r.documents.forEach(function (doc) {
        var key = decodeURIComponent(String(doc.name || '').split('/').pop()).replace(/\.html$/, '');
        var f = {};
        Object.keys(doc.fields || {}).forEach(function (k) { f[k] = fbVal(doc.fields[k]); });
        var rec = {
          views: f.views || 0, votes: f.votes || 0, chapterCount: f.chapterCount || 0,
          lastChapterTitle: f.lastChapterTitle || '', updatedAt: f.updatedAt || 0,
          trendingScore: f.trendingScore || 0
        };
        items[key] = rec;
        items[key.toLowerCase()] = rec;
      });
      return { on: true, items: items, source: 'firebase' };
    });
  }
  function stats() {
    if (memo.stats) return Promise.resolve(memo.stats);
    var cached = lsGet('ssochuz-stats', TTL_STATS);
    /* ?_=… : vượt mọi tầng cache (trình duyệt/CDN) — số liệu phải luôn mới,
       bệnh cũ: đáp ứng bị cache 60 giây nên vote/bỏ-vote không thấy đổi số */
    var p = (API && !apiDown ? jget(API + '/api/stats?_=' + Date.now(), 9000) : Promise.resolve(null)).then(function (r) {
      if (r && r.ok && r.items) {
        return { on: true, items: r.items, source: r.source || 'kv', saved: r.fetchedAt || r.saved || '' };
      }
      if (w.CZ_STATS_DIRECT !== true) return null;      /* mặc định: chỉ tin số trên KV */
      return fromFirestore();
    });
    return p.then(function (o) {
      if (o && o.on && o.items && Object.keys(o.items).length) {
        var had = memo.stats;
        memo.stats = o; lsSet('ssochuz-stats', { t: Date.now(), v: o });
        if (had) notifyStats();
        return o;
      }
      if (cached && cached.items && Object.keys(cached.items).length) {
        var st = { on: true, items: cached.items, source: cached.source || 'cache', stale: true };
        memo.stats = st;
        return st;
      }
      memo.stats = { on: false, items: {}, err: API ? 'chưa có lượt đọc/bình chọn nào trên KV' : 'chưa nối Worker nên không có số liệu' };
      return memo.stats;
    });
  }
  /* buộc lấy số mới từ Worker rồi báo cho mọi nơi đang hiển thị số liệu vẽ lại —
     dùng sau khi đếm lượt đọc/bình chọn để không phải chờ cache hay tải lại trang */
  function refreshStats() {
    if (!API || apiDown) return Promise.resolve(memo.stats);
    memo.stats = null;
    return stats();
  }

  /* -- ĐẾM LƯỢT ĐỌC / BÌNH CHỌN (gửi lên Worker, lưu trên KV) -----------
     vid = mã máy ẩn danh để 1 người không đếm/bầu nhiều lần; không phải định
     danh, xoá localStorage là mất. Bình luận/đăng nhập thì vẫn theo Google. */
  function vid() {
    var id = safeGet('ssochuz-vid');
    if (!id) {
      id = 'v' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      safeSet('ssochuz-vid', id);
    }
    return id;
  }
  function jpost(path, body, auth) {
    if (!API) return Promise.resolve(null);
    var h = { 'content-type': 'application/json' };
    if (auth) h.authorization = 'Bearer ' + auth;
    return fetch(API + path, {
      method: 'POST', headers: h, body: JSON.stringify(body || {}),
      keepalive: true, cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) { return (r.ok && d) ? d : null; });
    }).catch(function () { return null; });
  }
  function authToken() { try { return (w.CZ_AUTH && w.CZ_AUTH.token) ? (w.CZ_AUTH.token() || '') : ''; } catch (e) { return ''; } }
  /* 1 máy · 1 bộ · 1 ngày = 1 lượt đọc (phía máy và phía Worker đều khử trùng lặp) */
  function reportView(slug, ch) {
    if (!API || !slug) return Promise.resolve(null);
    var k = 'ssochuz-viewed-' + slug + '-' + new Date().toISOString().slice(0, 10);
    if (safeGet(k)) return Promise.resolve(null);
    safeSet(k, '1');
    return jpost('/api/view', { slug: slug, vid: vid(), ch: ch || 0 }).then(function (r) {
      if (r && r.counted) {
        /* cộng ngay vào số đang có để chip "lượt đọc" nhảy lên, rồi mới lấy số thật */
        if (memo.stats && memo.stats.items) {
          var it = memo.stats.items[slug];
          if (it) { it.views = (Number(it.views) || 0) + 1; it.viewsDay = (Number(it.viewsDay) || 0) + 1; }
        }
        notifyStats();
        /* lấy số chuẩn từ KV ngay (Worker đã tính cả phần đang đệm) */
        refreshStats();
      }
      return r;
    });
  }
  /* GỬI BÁO LỖI CHỮ: một lần bấm là nội dung đi thẳng tới hộp thư ban biên tập
     (Worker lo cả việc lưu lại + gửi email), không phải copy rồi mở Gmail nữa.
     Trả về { ok, mailed, note, error }; chưa nối được Worker thì trả lỗi để giao
     diện hiện đường dự phòng (copy / mở Gmail). */
  function sendReport(o) {
    if (!API) return Promise.resolve({ ok: false, error: 'offline' });
    return fetch(API + '/api/report', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(o || {}), keepalive: true, cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (d && d.ok) return d;
        var err = (d && d.error) || ('máy chủ trả ' + r.status);
        if (r.status === 404) err = 'Worker chưa có tính năng gửi báo lỗi — cập nhật worker/cms.js lên bản mới';
        return { ok: false, error: err, status: r.status };
      });
    }).catch(function () { return { ok: false, error: 'offline' }; });
  }
  /* bầu / bỏ bầu — ch = 0: phiếu cho cả bộ, ch > 0: phiếu riêng chương đó.
     Trả về { votes (số của nút), total (tổng phiếu của bộ), votesDay/Week/Month }.
     Số được sửa NGAY trong bộ nhớ + cache nên bảng xếp hạng tăng tức thì,
     không phải chờ 10 phút cache hay tải lại trang (bệnh cũ: vote rồi BXH đứng im). */
  function vote(slug, on, ch) {
    if (!API || !slug) return Promise.resolve(null);
    var c = Math.max(0, parseInt(ch, 10) || 0);
    return jpost('/api/vote', { slug: slug, vote: on ? 1 : 0, ch: c, vid: vid() }, authToken()).then(function (r) {
      if (r && r.ok) applyVote(slug, c, r);
      return r;
    });
  }
  function applyVote(slug, ch, r) {
    if (!memo.stats) memo.stats = { on: true, items: {}, source: 'local' };
    if (!memo.stats.items) memo.stats.items = {};
    var it = memo.stats.items[slug] || (memo.stats.items[slug] = { views: 0, votes: 0 });
    var total = r.total != null ? Number(r.total) : Number(r.votes || it.votes || 0);
    it.votes = Math.max(0, total);
    if (r.votesDay != null) it.votesDay = Number(r.votesDay) || 0;
    if (r.votesWeek != null) it.votesWeek = Number(r.votesWeek) || 0;
    if (r.votesMonth != null) it.votesMonth = Number(r.votesMonth) || 0;
    if (r.chapVotes) it.chapVotes = r.chapVotes;
    else if (ch > 0) {
      it.chapVotes = it.chapVotes || {};
      it.chapVotes[String(ch)] = Math.max(0, Number(r.votes) || 0);
      if (!it.chapVotes[String(ch)]) delete it.chapVotes[String(ch)];
    }
    it.trendingScore = Math.round((it.viewsDay || 0) + 0.4 * (it.viewsWeek || 0) + 2 * (it.votesDay || 0));
    memo.stats.on = true;
    lsSet('ssochuz-stats', { t: Date.now(), v: memo.stats });
    libCache = null;
    notifyStats();
    return it;
  }
  function schedule() {
    if (memo.sched) return Promise.resolve(memo.sched);
    return (API ? jget(API + '/api/schedule', 9000) : Promise.resolve(null)).then(function (r) {
      if (r && r.items) { memo.sched = r; return r; }
      return registry().then(function (o) { memo.sched = (o.reg && o.reg.schedule) || null; return memo.sched; });
    });
  }

  /* ======================= 2. GHI NHỚ TRONG MÁY ======================== */
  var LS = {
    prog: 'ssochuz-prog-', when: 'ssochuz-when-', shelf: 'ssochuz-shelf',
    like: 'ssochuz-like-', mark: 'ssochuz-mark-', read: 'ssochuz-reader', theme: 'ssochuz-theme', dir: 'ssochuz-dir'
  };
  function keysOf(n) { return [n && n.postId, n && n.slug].filter(Boolean); }

  function progress(n) {                       /* chương đang đọc dở, 0 = chưa đọc */
    var ks = keysOf(typeof n === 'string' ? { slug: n } : n);
    for (var i = 0; i < ks.length; i++) {
      var v = parseInt(safeGet(LS.prog + ks[i]) || '0', 10);
      if (v > 0) return v;
    }
    return 0;
  }
  function setProgress(n, ch) {
    keysOf(n).forEach(function (k) { safeSet(LS.prog + k, String(ch)); });
    keysOf(n).forEach(function (k) { safeSet(LS.when + k, String(Date.now())); });
  }
  function lastReadAt(n) {
    var ks = keysOf(typeof n === 'string' ? { slug: n } : n), best = 0;
    ks.forEach(function (k) { var v = parseInt(safeGet(LS.when + k) || '0', 10); if (v > best) best = v; });
    return best;
  }
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function jsonGet(k, dv) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? dv : v; } catch (e) { return dv; } }
  function jsonSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* tủ truyện — chỉ chứa bộ người dùng tự bấm lưu */
  function shelfIds() { var a = jsonGet(LS.shelf, []); return Array.isArray(a) ? a.filter(Boolean) : []; }
  function inShelf(n) { return !!n && shelfIds().indexOf(n.slug) >= 0; }
  function toggleShelf(n) {
    if (!n || !n.slug) return false;
    var ids = shelfIds(), i = ids.indexOf(n.slug);
    if (i >= 0) ids.splice(i, 1); else ids.push(n.slug);
    jsonSet(LS.shelf, ids);
    return i < 0;
  }
  function clearShelf() { jsonSet(LS.shelf, []); }

  /* ---- THÍCH: mỗi chương một phiếu thích riêng --------------------------
     Bệnh cũ: thích lưu theo BỘ (ssochuz-like-<slug>) nên thích chương 1 xong thì
     sang chương 2 nút vẫn "Đã thích" và bấm vào lại thành BỎ thích. Giờ khoá lưu
     là ssochuz-like-<slug>-<chương>; thích cả bộ (nút ở trang truyện) dùng khoá cũ. */
  function likeKey(n, ch) {
    var slug = (n && n.slug) || (typeof n === 'string' ? n : '');
    var c = Math.max(0, parseInt(ch, 10) || 0);
    return LS.like + slug + (c > 0 ? '-' + c : '');
  }
  function isLiked(n, ch) { return safeGet(likeKey(n, ch)) === '1'; }
  function toggleLike(n, ch) {
    var on = !isLiked(n, ch);
    safeSet(likeKey(n, ch), on ? '1' : '0');
    return on;
  }
  /* danh sách chương đã thích + có thích cả bộ không (để hiện ở mục My Space) */
  function likedChapters(n) {
    var slug = (n && n.slug) || '';
    var out = [];
    if (!slug) return out;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        if (k.indexOf(LS.like + slug + '-') !== 0) continue;
        var c = parseInt(k.slice((LS.like + slug + '-').length), 10);
        if (c > 0 && localStorage.getItem(k) === '1') out.push(c);
      }
    } catch (e) {}
    return out.sort(function (a, b) { return a - b; });
  }
  function likedCount(n) { return likedChapters(n).length + (isLiked(n, 0) ? 1 : 0); }
  /* số phiếu đang có (từ KV) của một chương / của cả bộ — chưa có số thì trả 0 */
  function likeCount(n, ch) {
    var st = statsOf(n);
    if (!st) return 0;
    var c = Math.max(0, parseInt(ch, 10) || 0);
    if (c > 0) return Number((st.chapVotes || {})[String(c)]) || 0;
    return Number(st.votes) || 0;
  }
  /* ---- ĐÁNH DẤU chương (thẻ bookmark) — khác với "lưu vào tủ" (icon tủ sách) ---- */
  function marks(n) { var a = jsonGet(LS.mark + (n && n.slug), []); return Array.isArray(a) ? a : []; }
  function toggleMark(n, ch) {
    var a = marks(n), i = a.indexOf(ch);
    if (i >= 0) a.splice(i, 1); else a.push(ch);
    jsonSet(LS.mark + n.slug, a);
    return i < 0;
  }
  function chaptersRead(n) {   /* số chương đã đi qua, suy từ tiến độ thật */
    var p = progress(n); return p > 0 ? p : 0;
  }

  /* cài đặt đọc — 2 font (serif / sans) · 3 nền (sang / kem / toi) */
  var RD_DEF = { mode: 'scroll', size: 18, font: 'serif', line: 1.85, para: 1.05, theme: 'kem', width: 720, justify: 0 };
  var RD_FONTS = { serif: 1, sans: 1 };
  var RD_THEMES = { sang: 1, kem: 1, toi: 1 };
  function rdGet() {
    var cur = jsonGet(LS.read, {}) || {};
    if (cur.font && !RD_FONTS[cur.font]) {
      cur.font = (cur.font === 'sans' || cur.font === 'bevn' || cur.font === 'roboto' || cur.font === 'inter' || cur.font === 'arial') ? 'sans' : 'serif';
    }
    if (cur.theme && !RD_THEMES[cur.theme]) {
      cur.theme = (cur.theme === 'xam') ? 'toi' : 'kem';
    }
    return Object.assign({}, RD_DEF, cur);
  }
  function rdSet(o) { var v = Object.assign(rdGet(), o || {}); jsonSet(LS.read, v); return v; }

  /* sáng / tối (mặc định: nền giấy sáng) */
  function themeInit() {
    var t = safeGet(LS.theme);
    if (!t) { var old = safeGet(LS.dir); t = old === 'ctoi' ? 'dark' : old ? 'light' : 'light'; }
    d.documentElement.setAttribute('data-theme', t);
    return t;
  }
  /* Sáng ⇄ tối.
     Bệnh cũ: bật .theming rồi bắt `*` transition background/color/border cho
     HÀNG NGHÌN phần tử trong .32s → mỗi lần bấm Theme là một cú khựng, máy yếu
     càng rõ. Nay:
       1. Trình duyệt có View Transitions (Chrome/Edge/Safari 18+, Firefox mới)
          → giao cho trình duyệt cross-fade 2 lớp ảnh chụp: chỉ 1 lớp mờ, không
          đụng tới từng phần tử nên mượt và rẻ hơn hẳn.
       2. Không có → đổi ngay, chỉ pha màu vài khối lớn (.hdr, .card2, .btn…),
          bỏ hẳn `*` cho khỏi lag. */
  function themeToggle() {
    var root = d.documentElement;
    var now = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    function apply() { root.setAttribute('data-theme', now); safeSet(LS.theme, now); }
    if (!reduce && typeof d.startViewTransition === 'function') {
      var vt = null;
      try {
        root.classList.add('theming-vt');       /* tắt transition từng phần tử cho sạch hình */
        vt = d.startViewTransition(apply);
      } catch (e) { root.classList.remove('theming-vt'); apply(); return now; }
      var done = function () { root.classList.remove('theming-vt'); };
      if (vt && vt.finished && vt.finished.then) vt.finished.then(done, done);
      else setTimeout(done, 500);
      return now;
    }
    if (!reduce) {
      root.classList.add('theming');
      setTimeout(function () { root.classList.remove('theming'); }, 260);
    }
    apply();
    return now;
  }

  /* ======================= 3. BỘ ICON ================================== */
  /* Bộ icon SVG lấy từ IconBuddy (iconbuddy.com/solar) — bộ **Solar** của
     480 Design, giấy phép CC BY 4.0 (ghi công ở chân trang). Tất cả 24×24,
     biến thể -linear nét 1.5px cho khớp kiểu tạp chí in. Hai icon thương hiệu
     Google / MoMo không có trong bộ này nên giữ bản vẽ tay.
     Muốn đổi biến thể (linear → bold/outline): sửa MAP trong
     tools/gen_icons_solar.mjs rồi chạy lại: node tools/gen_icons_solar.mjs */
  var P = {
    search: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><circle cx="11.5" cy="11.5" r="9.5"/><path stroke-linecap="round" d="M18.5 18.5L22 22"/></g></g>',
    book: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M4 8C4 5.17157 4 3.75736 4.87868 2.87868C5.75736 2 7.17157 2 10 2H14C16.8284 2 18.2426 2 19.1213 2.87868C20 3.75736 20 5.17157 20 8V16C20 18.8284 20 20.2426 19.1213 21.1213C18.2426 22 16.8284 22 14 22H10C7.17157 22 5.75736 22 4.87868 21.1213C4 20.2426 4 18.8284 4 16V8Z"/><path d="M19.8978 16H7.89778C6.96781 16 6.50282 16 6.12132 16.1022C5.08604 16.3796 4.2774 17.1883 4 18.2235"/><path stroke-linecap="round" d="M8 7H16"/><path stroke-linecap="round" d="M8 10.5H13"/></g></g>',
    library: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M19.5617 7C19.7904 5.69523 18.7863 4.5 17.4617 4.5H6.53788C5.21323 4.5 4.20922 5.69523 4.43784 7"/><path d="M17.4999 4.5C17.5283 4.24092 17.5425 4.11135 17.5427 4.00435C17.545 2.98072 16.7739 2.12064 15.7561 2.01142C15.6497 2 15.5194 2 15.2588 2H8.74099C8.48035 2 8.35002 2 8.24362 2.01142C7.22584 2.12064 6.45481 2.98072 6.45704 4.00434C6.45727 4.11135 6.47146 4.2409 6.49983 4.5"/><path stroke-linecap="round" d="M15 18H9"/><path d="M2.38351 13.793C1.93748 10.6294 1.71447 9.04765 2.66232 8.02383C3.61017 7 5.29758 7 8.67239 7H15.3276C18.7024 7 20.3898 7 21.3377 8.02383C22.2855 9.04765 22.0625 10.6294 21.6165 13.793L21.1935 16.793C20.8437 19.2739 20.6689 20.5143 19.7717 21.2572C18.8745 22 17.5512 22 14.9046 22H9.09536C6.44881 22 5.12553 22 4.22834 21.2572C3.33115 20.5143 3.15626 19.2739 2.80648 16.793L2.38351 13.793Z"/></g></g>',
    home: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M2 12.2039C2 9.91549 2 8.77128 2.5192 7.82274C3.0384 6.87421 3.98695 6.28551 5.88403 5.10813L7.88403 3.86687C9.88939 2.62229 10.8921 2 12 2C13.1079 2 14.1106 2.62229 16.116 3.86687L18.116 5.10812C20.0131 6.28551 20.9616 6.87421 21.4808 7.82274C22 8.77128 22 9.91549 22 12.2039V13.725C22 17.6258 22 19.5763 20.8284 20.7881C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.7881C2 19.5763 2 17.6258 2 13.725V12.2039Z"/><path stroke-linecap="round" d="M15 18H9"/></g></g>',
    trophy: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M12.0002 16C6.24021 16 5.21983 10.2595 5.03907 5.70647C4.98879 4.43998 4.96365 3.80673 5.43937 3.22083C5.91508 2.63494 6.48445 2.53887 7.62318 2.34674C8.74724 2.15709 10.2166 2 12.0002 2C13.7837 2 15.2531 2.15709 16.3771 2.34674C17.5159 2.53887 18.0852 2.63494 18.5609 3.22083C19.0367 3.80673 19.0115 4.43998 18.9612 5.70647C18.7805 10.2595 17.7601 16 12.0002 16Z"/><path stroke-linecap="round" d="M12 16V19"/><path stroke-linecap="round" stroke-linejoin="round" d="M15.5 22H8.5L8.83922 20.3039C8.93271 19.8365 9.34312 19.5 9.8198 19.5H14.1802C14.6569 19.5 15.0673 19.8365 15.1608 20.3039L15.5 22Z"/><path d="M19 5L19.9486 5.31621C20.9387 5.64623 21.4337 5.81124 21.7168 6.20408C22 6.59692 22 7.11873 21.9999 8.16234L21.9999 8.23487C21.9999 9.09561 21.9999 9.52598 21.7927 9.87809C21.5855 10.2302 21.2093 10.4392 20.4569 10.8572L17.5 12.5"/><path d="M4.99994 5L4.05132 5.31621C3.06126 5.64623 2.56623 5.81124 2.2831 6.20408C1.99996 6.59692 1.99997 7.11873 2 8.16234L2 8.23487C2.00003 9.09561 2.00004 9.52598 2.20723 9.87809C2.41441 10.2302 2.79063 10.4392 3.54305 10.8572L6.49994 12.5"/><path d="M11.1459 6.02251C11.5259 5.34084 11.7159 5 12 5C12.2841 5 12.4741 5.34084 12.8541 6.02251L12.9524 6.19887C13.0603 6.39258 13.1143 6.48944 13.1985 6.55334C13.2827 6.61725 13.3875 6.64097 13.5972 6.68841L13.7881 6.73161C14.526 6.89857 14.895 6.98205 14.9828 7.26432C15.0706 7.54659 14.819 7.84072 14.316 8.42898L14.1858 8.58117C14.0429 8.74833 13.9714 8.83191 13.9392 8.93531C13.9071 9.03872 13.9179 9.15023 13.9395 9.37327L13.9592 9.57632C14.0352 10.3612 14.0733 10.7536 13.8435 10.9281C13.6136 11.1025 13.2682 10.9435 12.5773 10.6254L12.3986 10.5431C12.2022 10.4527 12.1041 10.4075 12 10.4075C11.8959 10.4075 11.7978 10.4527 11.6014 10.5431L11.4227 10.6254C10.7318 10.9435 10.3864 11.1025 10.1565 10.9281C9.92674 10.7536 9.96476 10.3612 10.0408 9.57632L10.0605 9.37327C10.0821 9.15023 10.0929 9.03872 10.0608 8.93531C10.0286 8.83191 9.95713 8.74833 9.81418 8.58117L9.68403 8.42898C9.18097 7.84072 8.92945 7.54659 9.01723 7.26432C9.10501 6.98205 9.47396 6.89857 10.2119 6.73161L10.4028 6.68841C10.6125 6.64097 10.7173 6.61725 10.8015 6.55334C10.8857 6.48944 10.9397 6.39258 11.0476 6.19887L11.1459 6.02251Z"/><path stroke-linecap="round" d="M18 22H6"/></g></g>',
    calendar: '<g stroke-width="1.57" transform="translate(0.5 0.26) scale(0.958)"><g stroke="currentColor"><path d="M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12V14C22 17.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V12Z"/><path stroke-linecap="round" d="M7 4V2.5"/><path stroke-linecap="round" d="M17 4V2.5"/><path stroke-linecap="round" d="M2.5 9H21.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M17 13H17.0001"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 13H12.0001"/><path stroke-linecap="round" stroke-linejoin="round" d="M7 13H7.0001"/><path stroke-linecap="round" stroke-linejoin="round" d="M17 17.0234H17.0001"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 17.0234H12.0001"/><path stroke-linecap="round" stroke-linejoin="round" d="M7 17.0234H7.0001"/></g></g>',
    film: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"/><path stroke-linecap="round" d="M21.5 8H2.5"/><path stroke-linecap="round" d="M10.5 2.5L7 8"/><path stroke-linecap="round" d="M17 2.5L13.5 8"/></g></g>',
    tv: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M22 16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22L8 22C5.17157 22 3.75736 22 2.87868 21.1213C2 20.2426 2 18.8284 2 16L2 12C2 9.17157 2 7.75736 2.87868 6.87868C3.75736 6 5.17157 6 8 6L16 6C18.8284 6 20.2426 6 21.1213 6.87868C22 7.75736 22 9.17157 22 12V16Z"/><path stroke-linecap="round" d="M9 2L12 5.5L15 2"/><path stroke-linecap="round" d="M16 6V22"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 12H19.0001"/><path stroke-linecap="round" stroke-linejoin="round" d="M19 16H19.0001"/></g></g>',
    users: '<g stroke-width="1.49" transform="translate(0.44 0.44) scale(1.005)"><g stroke="currentColor"><circle cx="9" cy="6" r="4"/><path stroke-linecap="round" d="M15 9C16.6569 9 18 7.65685 18 6C18 4.34315 16.6569 3 15 3"/><ellipse cx="9" cy="17" rx="7" ry="4"/><path stroke-linecap="round" d="M18 14C19.7542 14.3847 21 15.3589 21 16.5C21 17.5293 19.9863 18.4229 18.5 18.8704"/></g></g>',
    pen: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><path stroke="currentColor" d="M14.3601 4.07866L15.2869 3.15178C16.8226 1.61607 19.3125 1.61607 20.8482 3.15178C22.3839 4.68748 22.3839 7.17735 20.8482 8.71306L19.9213 9.63993M14.3601 4.07866C14.3601 4.07866 14.4759 6.04828 16.2138 7.78618C17.9517 9.52407 19.9213 9.63993 19.9213 9.63993M19.9213 9.63993L11.4001 18.1612C10.8229 18.7383 10.5344 19.0269 10.2162 19.2751C9.84082 19.5679 9.43469 19.8189 9.00498 20.0237C8.6407 20.1973 8.25352 20.3263 7.47918 20.5844L4.19792 21.6782L3.39584 21.9456C3.01478 22.0726 2.59466 21.9734 2.31063 21.6894C2.0266 21.4053 1.92743 20.9852 2.05445 20.6042L2.32181 19.8021L3.41556 16.5208C3.67368 15.7465 3.80273 15.3593 3.97634 14.995C4.18114 14.5653 4.43213 14.1592 4.7249 13.7838C4.97308 13.4656 5.26166 13.1771 5.83882 12.5999L14.3601 4.07866M4.19792 21.6782L2.32181 19.8021"/></g>',
    play: '<g stroke-width="1.57" transform="translate(0.03 0.5) scale(0.958)"><path stroke="currentColor" d="M20.4086 9.35258C22.5305 10.5065 22.5305 13.4935 20.4086 14.6474L7.59662 21.6145C5.53435 22.736 3 21.2763 3 18.9671L3 5.0329C3 2.72368 5.53435 1.26402 7.59661 2.38548L20.4086 9.35258Z"/></g>',
    bookmark: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M21 16.0909V11.0975C21 6.80891 21 4.6646 19.682 3.3323C18.364 2 16.2426 2 12 2C7.75736 2 5.63604 2 4.31802 3.3323C3 4.6646 3 6.80891 3 11.0975V16.0909C3 19.1875 3 20.7358 3.73411 21.4123C4.08421 21.735 4.52615 21.9377 4.99692 21.9915C5.98402 22.1045 7.13673 21.0849 9.44216 19.0458C10.4612 18.1445 10.9708 17.6938 11.5603 17.5751C11.8506 17.5166 12.1494 17.5166 12.4397 17.5751C13.0292 17.6938 13.5388 18.1445 14.5578 19.0458C16.8633 21.0849 18.016 22.1045 19.0031 21.9915C19.4739 21.9377 19.9158 21.735 20.2659 21.4123C21 20.7358 21 19.1875 21 16.0909Z"/><path stroke-linecap="round" d="M15 6H9"/></g></g>',
    shelf: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M4 8C4 5.17157 4 3.75736 4.87868 2.87868C5.75736 2 7.17157 2 10 2H14C16.8284 2 18.2426 2 19.1213 2.87868C20 3.75736 20 5.17157 20 8V16C20 18.8284 20 20.2426 19.1213 21.1213C18.2426 22 16.8284 22 14 22H10C7.17157 22 5.75736 22 4.87868 21.1213C4 20.2426 4 18.8284 4 16V8Z"/><path d="M19.8978 16H7.89778C6.96781 16 6.50282 16 6.12132 16.1022C5.08604 16.3796 4.2774 17.1883 4 18.2235"/><path stroke-linecap="round" d="M7 16V2.5"/><path stroke-linecap="round" d="M13 16V19.5309C13 19.8065 13 19.9443 12.9051 20C12.8103 20.0557 12.6806 19.9941 12.4211 19.8708L11.1789 19.2808C11.0911 19.2391 11.0472 19.2182 11 19.2182C10.9528 19.2182 10.9089 19.2391 10.8211 19.2808L9.57889 19.8708C9.31943 19.9941 9.18971 20.0557 9.09485 20C9 19.9443 9 19.8065 9 19.5309V16.45"/></g></g>',
    user: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><circle cx="12" cy="6" r="4"/><path d="M20 17.5C20 19.9853 20 22 12 22C4 22 4 19.9853 4 17.5C4 15.0147 7.58172 13 12 13C16.4183 13 20 15.0147 20 17.5Z"/></g></g>',
    logout: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor" stroke-linecap="round"><path d="M9.00195 7C9.01406 4.82497 9.11051 3.64706 9.87889 2.87868C10.7576 2 12.1718 2 15.0002 2L16.0002 2C18.8286 2 20.2429 2 21.1215 2.87868C22.0002 3.75736 22.0002 5.17157 22.0002 8L22.0002 16C22.0002 18.8284 22.0002 20.2426 21.1215 21.1213C20.2429 22 18.8286 22 16.0002 22H15.0002C12.1718 22 10.7576 22 9.87889 21.1213C9.11051 20.3529 9.01406 19.175 9.00195 17"/><path stroke-linejoin="round" d="M15 12L2 12M5.5 15L2 12L5.5 9"/></g></g>',
    shield: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M3 10.4167C3 7.21907 3 5.62028 3.37752 5.08241C3.75503 4.54454 5.25832 4.02996 8.26491 3.00079L8.83772 2.80472C10.405 2.26824 11.1886 2 12 2C12.8114 2 13.595 2.26824 15.1623 2.80472L15.7351 3.00079C18.7417 4.02996 20.245 4.54454 20.6225 5.08241C21 5.62028 21 7.21907 21 10.4167C21 10.8996 21 11.4234 21 11.9914C21 17.6294 16.761 20.3655 14.1014 21.5273C13.38 21.8424 13.0193 22 12 22C10.9807 22 10.62 21.8424 9.89856 21.5273C7.23896 20.3655 3 17.6294 3 11.9914C3 11.4234 3 10.8996 3 10.4167Z"/><path d="M3 11L12 8L21 11"/><path d="M12 2V21.5"/></g></g>',
    pulse: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path stroke-linecap="round" d="M5 14.9999H6.39445C7.1804 14.9999 7.57337 14.9999 7.90501 15.1774C8.23665 15.3549 8.45463 15.6819 8.8906 16.3358L9.05039 16.5755C9.47306 17.2095 9.68439 17.5265 9.97087 17.5095C10.2573 17.4925 10.4297 17.1527 10.7743 16.4731L12.7404 12.5964C13.0987 11.8898 13.2779 11.5365 13.5711 11.5247C13.8642 11.5129 14.0711 11.8508 14.485 12.5264L15.1222 13.5668C15.5512 14.2671 15.7656 14.6172 16.1072 14.8086C16.4487 14.9999 16.8593 14.9999 17.6805 14.9999H19"/><path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"/></g></g>',
    inbox: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"/><path stroke-linecap="round" d="M2 13H5.16026C6.06543 13 6.51802 13 6.91584 13.183C7.31367 13.3659 7.60821 13.7096 8.19729 14.3968L8.80271 15.1032C9.39179 15.7904 9.68633 16.1341 10.0842 16.317C10.482 16.5 10.9346 16.5 11.8397 16.5H12.1603C13.0654 16.5 13.518 16.5 13.9158 16.317C14.3137 16.1341 14.6082 15.7904 15.1973 15.1032L15.8027 14.3968C16.3918 13.7096 16.6863 13.3659 17.0842 13.183C17.482 13 17.9346 13 18.8397 13H22"/><path stroke-linecap="round" d="M8 7H16"/><path stroke-linecap="round" d="M10 10.5H14"/></g></g>',
    history: '<g stroke-width="1.42" transform="translate(-0.67 -0.67) scale(1.056)"><g stroke="currentColor" stroke-linejoin="round"><path stroke-linecap="round" d="M12 8V12L14.5 14.5"/><path d="M4.33776 6.87052L5.60414 5.60414C9.10115 2.10713 14.7996 2.13576 18.3319 5.6681C21.8642 9.20044 21.8929 14.8988 18.3959 18.3959C14.8988 21.8929 9.20044 21.8642 5.6681 18.3319C3.57589 16.2397 2.71285 13.3876 3.08355 10.6831M4.32497 4.32497L4.33776 6.87052L6.88331 6.88331"/></g></g>',
    wand: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M12.6187 3.77783C14.7918 2.39036 15.8784 1.69663 16.7137 2.12656C17.5491 2.5565 17.58 3.82537 17.6418 6.36312L17.6578 7.01967C17.6753 7.74082 17.6841 8.10139 17.8327 8.4128C17.9813 8.7242 18.2529 8.95119 18.7961 9.40516L19.2906 9.81846C21.202 11.416 22.1577 12.2148 21.9787 13.1603C21.7997 14.1059 20.6046 14.572 18.2142 15.5043L17.5958 15.7454C16.9165 16.0104 16.5769 16.1428 16.3222 16.3918C16.0675 16.6409 15.9266 16.9783 15.6448 17.6531L15.3882 18.2675C14.3964 20.6423 13.9005 21.8297 12.9545 21.9842C12.0085 22.1386 11.2389 21.1578 9.69982 19.1963L9.30163 18.6888C8.86425 18.1314 8.64557 17.8526 8.33956 17.6952C8.03356 17.5377 7.67488 17.5192 6.95753 17.4823L6.30443 17.4487C3.78002 17.3189 2.51782 17.254 2.11218 16.4039C1.70653 15.5538 2.42609 14.4815 3.86521 12.3369L4.23753 11.7821C4.64648 11.1727 4.85096 10.868 4.91653 10.5216C4.9821 10.1752 4.90135 9.82639 4.73983 9.12875L4.59279 8.4936C4.02442 6.03855 3.74024 4.81103 4.43551 4.1312C5.13079 3.45136 6.34506 3.76944 8.77361 4.4056L9.40191 4.57019C10.092 4.75097 10.4371 4.84135 10.7836 4.78478C11.1301 4.7282 11.4389 4.53106 12.0565 4.13679L12.6187 3.77783Z"/><path stroke-linecap="round" d="M19 19L21 21"/></g></g>',
    heart: '<g stroke-width="1.57" transform="translate(0.5 0.62) scale(0.958)"><path stroke="currentColor" stroke-linejoin="round" d="M2 9.1371C2 14 6.01943 16.5914 8.96173 18.9109C10 19.7294 11 20.5 12 20.5C13 20.5 14 19.7294 15.0383 18.9109C17.9806 16.5914 22 14 22 9.1371C22 4.27416 16.4998 0.825464 12 5.50063C7.50016 0.825464 2 4.27416 2 9.1371Z"/></g>',
    share: '<g stroke-width="1.42" transform="translate(-0.14 -0.67) scale(1.056)"><g stroke="currentColor"><path d="M9 12C9 13.3807 7.88071 14.5 6.5 14.5C5.11929 14.5 4 13.3807 4 12C4 10.6193 5.11929 9.5 6.5 9.5C7.88071 9.5 9 10.6193 9 12Z"/><path stroke-linecap="round" d="M14 6.5L9 10"/><path stroke-linecap="round" d="M14 17.5L9 14"/><path d="M19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5Z"/><path d="M19 5.5C19 6.88071 17.8807 8 16.5 8C15.1193 8 14 6.88071 14 5.5C14 4.11929 15.1193 3 16.5 3C17.8807 3 19 4.11929 19 5.5Z"/></g></g>',
    check: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M8.5 12.5L10.5 14.5L15.5 9.5"/></g></g>',
    moon: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><path stroke="currentColor" stroke-linejoin="round" d="M12 22C17.5228 22 22 17.5228 22 12C22 11.5373 21.3065 11.4608 21.0672 11.8568C19.9289 13.7406 17.8615 15 15.5 15C11.9101 15 9 12.0899 9 8.5C9 6.13845 10.2594 4.07105 12.1432 2.93276C12.5392 2.69347 12.4627 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/></g>',
    sun: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><circle cx="12" cy="12" r="6"/><path stroke-linecap="round" d="M12 2V3"/><path stroke-linecap="round" d="M12 21V22"/><path stroke-linecap="round" d="M22 12L21 12"/><path stroke-linecap="round" d="M3 12L2 12"/><path stroke-linecap="round" d="M19.0708 4.92969L18.678 5.32252"/><path stroke-linecap="round" d="M5.32178 18.6777L4.92894 19.0706"/><path stroke-linecap="round" d="M19.0708 19.0703L18.678 18.6775"/><path stroke-linecap="round" d="M5.32178 5.32227L4.92894 4.92943"/></g></g>',
    x: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><g stroke="currentColor" stroke-linecap="round"><path d="M19.0068 5L5.00684 19"/><path d="M19 19L5 5"/></g></g>',
    star: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><path stroke="currentColor" d="M9.15316 5.40838C10.4198 3.13613 11.0531 2 12 2C12.9469 2 13.5802 3.13612 14.8468 5.40837L15.1745 5.99623C15.5345 6.64193 15.7144 6.96479 15.9951 7.17781C16.2757 7.39083 16.6251 7.4699 17.3241 7.62805L17.9605 7.77203C20.4201 8.32856 21.65 8.60682 21.9426 9.54773C22.2352 10.4886 21.3968 11.4691 19.7199 13.4299L19.2861 13.9372C18.8096 14.4944 18.5713 14.773 18.4641 15.1177C18.357 15.4624 18.393 15.8341 18.465 16.5776L18.5306 17.2544C18.7841 19.8706 18.9109 21.1787 18.1449 21.7602C17.3788 22.3417 16.2273 21.8115 13.9243 20.7512L13.3285 20.4768C12.6741 20.1755 12.3469 20.0248 12 20.0248C11.6531 20.0248 11.3259 20.1755 10.6715 20.4768L10.0757 20.7512C7.77268 21.8115 6.62118 22.3417 5.85515 21.7602C5.08912 21.1787 5.21588 19.8706 5.4694 17.2544L5.53498 16.5776C5.60703 15.8341 5.64305 15.4624 5.53586 15.1177C5.42868 14.773 5.19043 14.4944 4.71392 13.9372L4.2801 13.4299C2.60325 11.4691 1.76482 10.4886 2.05742 9.54773C2.35002 8.60682 3.57986 8.32856 6.03954 7.77203L6.67589 7.62805C7.37485 7.4699 7.72433 7.39083 8.00494 7.17781C8.28555 6.96479 8.46553 6.64194 8.82547 5.99623L9.15316 5.40838Z"/></g>',
    fire: '<g stroke-width="1.49" transform="translate(0.44 -0.56) scale(1.005)"><g stroke="currentColor"><path d="M20 13.1111C20 20.2222 13.9556 22 10.9333 22C8.28889 22 3 20.2222 3 13.1111C3 10.3295 4.46147 8.46138 5.85996 7.39454C6.63841 6.80069 7.6304 7.39197 7.73017 8.36598L7.816 9.20382C7.92052 10.2241 8.84932 11.0606 9.70932 10.5017C11.3938 9.40705 12 6.7752 12 5.33334V5.00971C12 3.58 13.4438 2.65985 14.6023 3.49767C17.1653 5.35127 20 8.58427 20 13.1111Z"/><path d="M8 18.4445C8 21.2889 10.4889 22 11.7333 22C12.8222 22 15 21.2889 15 18.4445C15 17.3435 14.4107 16.6002 13.8404 16.1713C13.4424 15.872 12.8828 16.1408 12.7459 16.6196C12.5675 17.2437 11.9228 17.636 11.5944 17.0759C11.2941 16.5638 11.2941 15.7957 11.2941 15.3334C11.2941 14.6968 10.6539 14.2847 10.1389 14.6589C9.10649 15.4091 8 16.6815 8 18.4445Z"/></g></g>',
    list: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><g stroke="currentColor" stroke-linecap="round"><path d="M20 7L4 7"/><path d="M15 12L4 12"/><path d="M9 17H4"/></g></g>',
    left: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M15 5L9 12L15 19"/></g>',
    right: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M9 5L15 12L9 19"/></g>',
    up: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19 15L12 9L5 15"/></g>',
    down: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19 9L12 15L5 9"/></g>',
    gear: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M13.7654 2.15224C13.3978 2 12.9319 2 12 2C11.0681 2 10.6022 2 10.2346 2.15224C9.74457 2.35523 9.35522 2.74458 9.15223 3.23463C9.05957 3.45834 9.0233 3.7185 9.00911 4.09799C8.98826 4.65568 8.70226 5.17189 8.21894 5.45093C7.73564 5.72996 7.14559 5.71954 6.65219 5.45876C6.31645 5.2813 6.07301 5.18262 5.83294 5.15102C5.30704 5.08178 4.77518 5.22429 4.35436 5.5472C4.03874 5.78938 3.80577 6.1929 3.33983 6.99993C2.87389 7.80697 2.64092 8.21048 2.58899 8.60491C2.51976 9.1308 2.66227 9.66266 2.98518 10.0835C3.13256 10.2756 3.3397 10.437 3.66119 10.639C4.1338 10.936 4.43789 11.4419 4.43786 12C4.43783 12.5581 4.13375 13.0639 3.66118 13.3608C3.33965 13.5629 3.13248 13.7244 2.98508 13.9165C2.66217 14.3373 2.51966 14.8691 2.5889 15.395C2.64082 15.7894 2.87379 16.193 3.33973 17C3.80568 17.807 4.03865 18.2106 4.35426 18.4527C4.77508 18.7756 5.30694 18.9181 5.83284 18.8489C6.07289 18.8173 6.31632 18.7186 6.65204 18.5412C7.14547 18.2804 7.73556 18.27 8.2189 18.549C8.70224 18.8281 8.98826 19.3443 9.00911 19.9021C9.02331 20.2815 9.05957 20.5417 9.15223 20.7654C9.35522 21.2554 9.74457 21.6448 10.2346 21.8478C10.6022 22 11.0681 22 12 22C12.9319 22 13.3978 22 13.7654 21.8478C14.2554 21.6448 14.6448 21.2554 14.8477 20.7654C14.9404 20.5417 14.9767 20.2815 14.9909 19.902C15.0117 19.3443 15.2977 18.8281 15.781 18.549C16.2643 18.2699 16.8544 18.2804 17.3479 18.5412C17.6836 18.7186 17.927 18.8172 18.167 18.8488C18.6929 18.9181 19.2248 18.7756 19.6456 18.4527C19.9612 18.2105 20.1942 17.807 20.6601 16.9999C21.1261 16.1929 21.3591 15.7894 21.411 15.395C21.4802 14.8691 21.3377 14.3372 21.0148 13.9164C20.8674 13.7243 20.6602 13.5628 20.3387 13.3608C19.8662 13.0639 19.5621 12.558 19.5621 11.9999C19.5621 11.4418 19.8662 10.9361 20.3387 10.6392C20.6603 10.4371 20.8675 10.2757 21.0149 10.0835C21.3378 9.66273 21.4803 9.13087 21.4111 8.60497C21.3592 8.21055 21.1262 7.80703 20.6602 7C20.1943 6.19297 19.9613 5.78945 19.6457 5.54727C19.2249 5.22436 18.693 5.08185 18.1671 5.15109C17.9271 5.18269 17.6837 5.28136 17.3479 5.4588C16.8545 5.71959 16.2644 5.73002 15.7811 5.45096C15.2977 5.17191 15.0117 4.65566 14.9909 4.09794C14.9767 3.71848 14.9404 3.45833 14.8477 3.23463C14.6448 2.74458 14.2554 2.35523 13.7654 2.15224Z"/></g></g>',
    expand: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15L2 22M2 16.1429V22H7.85714"/><path d="M15 9L22 2M22 7.85714V2H16.1429"/></g></g>',
    thumb: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor" stroke-linecap="round"><path d="M3 21.5127V10.2341"/><path d="M3 10.2342L3.9716 21.4707C3.99621 21.7553 3.77207 22 3.48671 22C3.21791 22 3 21.7818 3 21.5127"/><path d="M13.9951 5.22145C14.1027 4.56438 14.072 3.89203 13.9048 3.24756"/><path d="M8.59609 22C7.73231 22 7.01201 21.3386 6.93752 20.4771L6.12535 11.0844C6.07919 10.5506 6.29223 10.027 6.69789 9.67749L8.13663 8.43769C8.80416 7.86246 9.44635 7.24017 9.8617 6.46261C10.146 5.93045 10.3664 5.36723 10.5178 4.78374L10.9935 2.94989C11.0856 2.59473 11.3342 2.29611 11.6739 2.13239C11.9826 1.98365 12.3399 1.95918 12.6673 2.06435L12.8123 2.11093C13.354 2.28495 13.7659 2.71364 13.9044 3.24753"/><path d="M13.9951 5.22135L13.3325 9.26591C13.2493 9.77321 13.6404 10.2341 14.1539 10.2341H19.335"/><path d="M19.3351 10.2342C20.3681 10.2342 21.1517 11.1662 20.9755 12.1852L20.27 16.265C19.6976 19.5744 16.7266 22 13.2453 22H8.59668"/></g></g>',
    chat: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22Z"/><path stroke-linecap="round" d="M8 10.5H16"/><path stroke-linecap="round" d="M8 14H13.5"/></g></g>',
    alert: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M5.31171 10.7615C8.23007 5.58716 9.68925 3 12 3C14.3107 3 15.7699 5.58716 18.6883 10.7615L19.0519 11.4063C21.4771 15.7061 22.6897 17.856 21.5937 19.428C20.4978 21 17.7864 21 12.3637 21H11.6363C6.21356 21 3.50217 21 2.40626 19.428C1.31034 17.856 2.52291 15.7061 4.94805 11.4063L5.31171 10.7615Z"/><path stroke-linecap="round" d="M12 8V13"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 16H12.0001"/></g></g>',
    eye: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M3.27489 15.2957C2.42496 14.1915 2 13.6394 2 12C2 10.3606 2.42496 9.80853 3.27489 8.70433C4.97196 6.49956 7.81811 4 12 4C16.1819 4 19.028 6.49956 20.7251 8.70433C21.575 9.80853 22 10.3606 22 12C22 13.6394 21.575 14.1915 20.7251 15.2957C19.028 17.5004 16.1819 20 12 20C7.81811 20 4.97196 17.5004 3.27489 15.2957Z"/><path d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z"/></g></g>',
    clock: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8V12L14.5 14.5"/></g></g>',
    menu: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><g stroke="currentColor" stroke-linecap="round"><path d="M20 7L4 7"/><path d="M20 12L4 12"/><path d="M20 17L4 17"/></g></g>',
    plus: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><g stroke="currentColor" stroke-linecap="round"><path d="M4 12L20 12"/><path d="M12.0204 4L12.0205 20.0003"/></g></g>',
    trash: '<g stroke-width="1.49" transform="translate(-0.06 0.44) scale(1.005)"><g stroke="currentColor" stroke-linecap="round"><path d="M9.1709 4C9.58273 2.83481 10.694 2 12.0002 2C13.3064 2 14.4177 2.83481 14.8295 4"/><path d="M20.5001 6H3.5"/><path d="M18.8332 8.5L18.3732 15.3991C18.1962 18.054 18.1077 19.3815 17.2427 20.1907C16.3777 21 15.0473 21 12.3865 21H11.6132C8.95235 21 7.62195 21 6.75694 20.1907C5.89194 19.3815 5.80344 18.054 5.62644 15.3991L5.1665 8.5"/><path d="M9.5 11L10 16"/><path d="M14.5 11L14 16"/></g></g>',
    edit: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path stroke-linecap="round" d="M22 10.5V12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2H13.5"/><path d="M16.652 3.45506L17.3009 2.80624C18.3759 1.73125 20.1188 1.73125 21.1938 2.80624C22.2687 3.88124 22.2687 5.62415 21.1938 6.69914L20.5449 7.34795M16.652 3.45506C16.652 3.45506 16.7331 4.83379 17.9497 6.05032C19.1662 7.26685 20.5449 7.34795 20.5449 7.34795M16.652 3.45506L10.6872 9.41993C10.2832 9.82394 10.0812 10.0259 9.90743 10.2487C9.70249 10.5114 9.52679 10.7957 9.38344 11.0965C9.26191 11.3515 9.17157 11.6225 8.99089 12.1646L8.41242 13.9M8.41242 13.9L8.03811 15.0229C7.9492 15.2897 8.01862 15.5837 8.21744 15.7826C8.41626 15.9814 8.71035 16.0508 8.97709 15.9619L10.1 15.5876L11.8354 15.0091C12.3775 14.8284 12.6485 14.7381 12.9035 14.6166C13.2043 14.4732 13.4886 14.2975 13.7513 14.0926C13.9741 13.9188 14.1761 13.7168 14.5801 13.3128L20.5449 7.34795M10.1 15.5876L8.41242 13.9"/></g></g>',
    refresh: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3.67981 13L3.67981 11.3333C3.67981 6.73096 7.4402 3 12.0789 3C15.1178 3 17.7799 4.60136 19.2545 7M2 11.3333L3.67981 13L5.35962 11.3333"/><path d="M20.3139 11V12.6667C20.3139 17.269 16.5391 21 11.8827 21C8.83213 21 6.15995 19.3986 4.67969 17M22.0001 12.6667L20.3139 11L18.6277 12.6667"/></g></g>',
    download: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor" stroke-linecap="round"><path d="M17 9.00195C19.175 9.01406 20.3529 9.11051 21.1213 9.8789C22 10.7576 22 12.1718 22 15.0002V16.0002C22 18.8286 22 20.2429 21.1213 21.1215C20.2426 22.0002 18.8284 22.0002 16 22.0002H8C5.17157 22.0002 3.75736 22.0002 2.87868 21.1215C2 20.2429 2 18.8286 2 16.0002L2 15.0002C2 12.1718 2 10.7576 2.87868 9.87889C3.64706 9.11051 4.82497 9.01406 7 9.00195"/><path stroke-linejoin="round" d="M12 2L12 15M15 11.5L12 15L9 11.5"/></g></g>',
    upload: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor" stroke-linecap="round"><path d="M17 9.00195C19.175 9.01406 20.3529 9.11051 21.1213 9.8789C22 10.7576 22 12.1718 22 15.0002V16.0002C22 18.8286 22 20.2429 21.1213 21.1215C20.2426 22.0002 18.8284 22.0002 16 22.0002H8C5.17157 22.0002 3.75736 22.0002 2.87868 21.1215C2 20.2429 2 18.8286 2 16.0002L2 15.0002C2 12.1718 2 10.7576 2.87868 9.87889C3.64706 9.11051 4.82497 9.01406 7 9.00195"/><path stroke-linejoin="round" d="M12 15L12 2M9 5.5L12 2L15 5.5"/></g></g>',
    cloud: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><path stroke="currentColor" stroke-linecap="round" d="M14.381 9.02721C14.9767 8.81911 15.6178 8.70588 16.2857 8.70588C16.9404 8.70588 17.5693 8.81468 18.1551 9.01498M8.66667 12.2426C8.20528 11.9374 7.68059 11.7184 7.11616 11.6089C6.8475 11.5567 6.56983 11.5294 6.28571 11.5294C3.91878 11.5294 2 13.4256 2 15.7647C2 18.1038 3.91878 20 6.28571 20H16.2857C19.4416 20 22 17.4717 22 14.3529C22 11.8811 20.393 9.78024 18.1551 9.01498M7.11616 11.6089C6.88706 10.9978 6.7619 10.3369 6.7619 9.64706C6.7619 6.52827 9.32028 4 12.4762 4C15.4159 4 17.8371 6.19371 18.1551 9.01498"/></g>',
    key: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path stroke-linejoin="round" d="M15.6807 14.5869C19.1708 14.5869 22 11.7692 22 8.29344C22 4.81767 19.1708 2 15.6807 2C12.1907 2 9.3615 4.81767 9.3615 8.29344C9.3615 9.90338 10.0963 11.0743 10.0963 11.0743L2.45441 18.6849C2.1115 19.0264 1.63143 19.9143 2.45441 20.7339L3.33616 21.6121C3.67905 21.9048 4.54119 22.3146 5.2466 21.6121L6.27531 20.5876C7.30403 21.6121 8.4797 21.0267 8.92058 20.4412C9.65538 19.4167 8.77362 18.3922 8.77362 18.3922L9.06754 18.0995C10.4783 19.5045 11.7128 18.6849 12.1537 18.0995C12.8885 17.075 12.1537 16.0505 12.1537 16.0505C11.8598 15.465 11.272 15.465 12.0067 14.7333L12.8885 13.8551C13.5939 14.4405 15.0439 14.5869 15.6807 14.5869Z"/><path d="M17.8853 8.29353C17.8853 9.50601 16.8984 10.4889 15.681 10.4889C14.4635 10.4889 13.4766 9.50601 13.4766 8.29353C13.4766 7.08105 14.4635 6.09814 15.681 6.09814C16.8984 6.09814 17.8853 7.08105 17.8853 8.29353Z"/></g></g>',
    lock: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M2 16C2 13.1716 2 11.7574 2.87868 10.8787C3.75736 10 5.17157 10 8 10H16C18.8284 10 20.2426 10 21.1213 10.8787C22 11.7574 22 13.1716 22 16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22H8C5.17157 22 3.75736 22 2.87868 21.1213C2 20.2426 2 18.8284 2 16Z"/><path stroke-linecap="round" d="M6 10V8C6 4.68629 8.68629 2 12 2C15.3137 2 18 4.68629 18 8V10"/></g></g>',
    link: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor" stroke-linecap="round"><path d="M10.0464 14C8.54044 12.4882 8.67609 9.90087 10.3494 8.22108L15.197 3.35462C16.8703 1.67483 19.4476 1.53865 20.9536 3.05046C22.4596 4.56228 22.3239 7.14956 20.6506 8.82935L18.2268 11.2626"/><path d="M13.9536 10C15.4596 11.5118 15.3239 14.0991 13.6506 15.7789L11.2268 18.2121L8.80299 20.6454C7.12969 22.3252 4.55237 22.4613 3.0464 20.9495C1.54043 19.4377 1.67609 16.8504 3.34939 15.1706L5.77323 12.7373"/></g></g>',
    filter: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><path stroke="currentColor" d="M19 3H5C3.58579 3 2.87868 3 2.43934 3.4122C2 3.8244 2 4.48782 2 5.81466V6.50448C2 7.54232 2 8.06124 2.2596 8.49142C2.5192 8.9216 2.99347 9.18858 3.94202 9.72255L6.85504 11.3624C7.49146 11.7206 7.80967 11.8998 8.03751 12.0976C8.51199 12.5095 8.80408 12.9935 8.93644 13.5872C9 13.8722 9 14.2058 9 14.8729L9 17.5424C9 18.452 9 18.9067 9.25192 19.2613C9.50385 19.6158 9.95128 19.7907 10.8462 20.1406C12.7248 20.875 13.6641 21.2422 14.3321 20.8244C15 20.4066 15 19.4519 15 17.5424V14.8729C15 14.2058 15 13.8722 15.0636 13.5872C15.1959 12.9935 15.488 12.5095 15.9625 12.0976C16.1903 11.8998 16.5085 11.7206 17.145 11.3624L20.058 9.72255C21.0065 9.18858 21.4808 8.9216 21.7404 8.49142C22 8.06124 22 7.54232 22 6.50448V5.81466C22 4.48782 22 3.8244 21.5607 3.4122C21.1213 3 20.4142 3 19 3Z"/></g>',
    grid: '<g stroke-width="1.49" transform="translate(-0.06 -0.06) scale(1.005)"><g stroke="currentColor"><path d="M2.5 6.5C2.5 4.61438 2.5 3.67157 3.08579 3.08579C3.67157 2.5 4.61438 2.5 6.5 2.5C8.38562 2.5 9.32843 2.5 9.91421 3.08579C10.5 3.67157 10.5 4.61438 10.5 6.5C10.5 8.38562 10.5 9.32843 9.91421 9.91421C9.32843 10.5 8.38562 10.5 6.5 10.5C4.61438 10.5 3.67157 10.5 3.08579 9.91421C2.5 9.32843 2.5 8.38562 2.5 6.5Z"/><path d="M13.5 17.5C13.5 15.6144 13.5 14.6716 14.0858 14.0858C14.6716 13.5 15.6144 13.5 17.5 13.5C19.3856 13.5 20.3284 13.5 20.9142 14.0858C21.5 14.6716 21.5 15.6144 21.5 17.5C21.5 19.3856 21.5 20.3284 20.9142 20.9142C20.3284 21.5 19.3856 21.5 17.5 21.5C15.6144 21.5 14.6716 21.5 14.0858 20.9142C13.5 20.3284 13.5 19.3856 13.5 17.5Z"/><path d="M2.5 17.5C2.5 15.6144 2.5 14.6716 3.08579 14.0858C3.67157 13.5 4.61438 13.5 6.5 13.5C8.38562 13.5 9.32843 13.5 9.91421 14.0858C10.5 14.6716 10.5 15.6144 10.5 17.5C10.5 19.3856 10.5 20.3284 9.91421 20.9142C9.32843 21.5 8.38562 21.5 6.5 21.5C4.61438 21.5 3.67157 21.5 3.08579 20.9142C2.5 20.3284 2.5 19.3856 2.5 17.5Z"/><path d="M13.5 6.5C13.5 4.61438 13.5 3.67157 14.0858 3.08579C14.6716 2.5 15.6144 2.5 17.5 2.5C19.3856 2.5 20.3284 2.5 20.9142 3.08579C21.5 3.67157 21.5 4.61438 21.5 6.5C21.5 8.38562 21.5 9.32843 20.9142 9.91421C20.3284 10.5 19.3856 10.5 17.5 10.5C15.6144 10.5 14.6716 10.5 14.0858 9.91421C13.5 9.32843 13.5 8.38562 13.5 6.5Z"/></g></g>',
    rows: '<g stroke-width="1.29" transform="translate(-1.92 -1.92) scale(1.16)"><g stroke="currentColor" stroke-linecap="round"><path d="M4 17H11"/><path d="M4 12L11 12"/><path d="M4 7L11 7"/><path stroke-linejoin="round" d="M17 4L17 20M20 8L17 4L14 8M14 16L17 20L20 16"/></g></g>',
    info: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 17V11"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8H12.0001"/></g></g>',
    cloud2: '<g stroke-width="1.57" transform="translate(0.5 0.74) scale(0.958)"><g stroke="currentColor" stroke-linecap="round"><path d="M8.66667 11.2426C8.20528 10.9374 7.68059 10.7184 7.11616 10.6089C6.8475 10.5567 6.56983 10.5294 6.28571 10.5294C3.91878 10.5294 2 12.4256 2 14.7647C2 17.1038 3.91878 19 6.28571 19M14.381 8.02721C14.9767 7.81911 15.6178 7.70588 16.2857 7.70588C16.9404 7.70588 17.5693 7.81468 18.1551 8.01498M7.11616 10.6089C6.88706 9.9978 6.7619 9.33687 6.7619 8.64706C6.7619 5.52827 9.32028 3 12.4762 3C15.4159 3 17.8371 5.19371 18.1551 8.01498M18.1551 8.01498C20.393 8.78024 22 10.8811 22 13.3529C22 16.0599 20.0726 18.3221 17.5 18.8722"/><path d="M13.5 17.5L12 19M12 19L10.5 20.5M12 19L10.5 17.5M12 19L13.5 20.5"/></g></g>',
    chart: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path stroke-linecap="round" d="M22 22H2"/><path d="M21 22V14.5C21 13.6716 20.3284 13 19.5 13H16.5C15.6716 13 15 13.6716 15 14.5V22"/><path d="M15 22V5C15 3.58579 15 2.87868 14.5607 2.43934C14.1213 2 13.4142 2 12 2C10.5858 2 9.87868 2 9.43934 2.43934C9 2.87868 9 3.58579 9 5V22"/><path d="M9 22V9.5C9 8.67157 8.32843 8 7.5 8H4.5C3.67157 8 3 8.67157 3 9.5V22"/></g></g>',
    save: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M3.46447 20.5355C4.92893 22 7.28595 22 12 22C16.714 22 19.0711 22 20.5355 20.5355C22 19.0711 22 16.714 22 12C22 11.6585 22 11.4878 21.9848 11.3142C21.9142 10.5049 21.586 9.71257 21.0637 9.09034C20.9516 8.95687 20.828 8.83317 20.5806 8.58578L15.4142 3.41944C15.1668 3.17206 15.0431 3.04835 14.9097 2.93631C14.2874 2.414 13.4951 2.08581 12.6858 2.01515C12.5122 2 12.3415 2 12 2C7.28595 2 4.92893 2 3.46447 3.46447C2 4.92893 2 7.28595 2 12C2 16.714 2 19.0711 3.46447 20.5355Z"/><path d="M17 22V21C17 19.1144 17 18.1716 16.4142 17.5858C15.8284 17 14.8856 17 13 17H11C9.11438 17 8.17157 17 7.58579 17.5858C7 18.1716 7 19.1144 7 21V22"/><path stroke-linecap="round" d="M7 8H13"/></g></g>',
    sparkle: '<g stroke-width="1.42" transform="translate(-0.67 -0.67) scale(1.056)"><g stroke="currentColor"><path d="M8.03339 3.65784C8.37932 2.78072 9.62068 2.78072 9.96661 3.65785L11.0386 6.37599C11.1442 6.64378 11.3562 6.85576 11.624 6.96137L14.3422 8.03339C15.2193 8.37932 15.2193 9.62068 14.3422 9.96661L11.624 11.0386C11.3562 11.1442 11.1442 11.3562 11.0386 11.624L9.96661 14.3422C9.62067 15.2193 8.37932 15.2193 8.03339 14.3422L6.96137 11.624C6.85575 11.3562 6.64378 11.1442 6.37599 11.0386L3.65784 9.96661C2.78072 9.62067 2.78072 8.37932 3.65785 8.03339L6.37599 6.96137C6.64378 6.85575 6.85576 6.64378 6.96137 6.37599L8.03339 3.65784Z"/><path d="M16.4885 13.3481C16.6715 12.884 17.3285 12.884 17.5115 13.3481L18.3121 15.3781C18.368 15.5198 18.4802 15.632 18.6219 15.6879L20.6519 16.4885C21.116 16.6715 21.116 17.3285 20.6519 17.5115L18.6219 18.3121C18.4802 18.368 18.368 18.4802 18.3121 18.6219L17.5115 20.6519C17.3285 21.116 16.6715 21.116 16.4885 20.6519L15.6879 18.6219C15.632 18.4802 15.5198 18.368 15.3781 18.3121L13.3481 17.5115C12.884 17.3285 12.884 16.6715 13.3481 16.4885L15.3781 15.6879C15.5198 15.632 15.632 15.5198 15.6879 15.3781L16.4885 13.3481Z"/></g></g>',
    clock2: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8V12L14.5 14.5"/><path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"/></g></g>',
    mail: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12Z"/><path stroke-linecap="round" d="M6 8L8.1589 9.79908C9.99553 11.3296 10.9139 12.0949 12 12.0949C13.0861 12.0949 14.0045 11.3296 15.8411 9.79908L18 8"/></g></g>',
    heart_hand: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path stroke-linejoin="round" d="M7 4.71476C7 6.19986 8.72593 7.76428 10.1497 8.80219C10.9489 9.38471 11.3484 9.67598 12 9.67598C12.6516 9.67598 13.0512 9.38472 13.8503 8.8022C15.2741 7.7643 17 6.19988 17 4.71475C17 2.03759 14.2499 1.03807 12 3.10615C9.75008 1.03807 7 2.03759 7 4.71476Z"/><path stroke-linecap="round" d="M12.7518 17.5326C13.4312 17.5968 14.0435 17.5829 14.5668 17.5292C14.6038 17.5254 14.6403 17.5214 14.6764 17.5172M14.6764 17.5172C14.6399 17.525 14.6033 17.5292 14.5668 17.5292M14.6764 17.5172C14.7962 17.5033 14.911 17.4874 15.0206 17.4699C15.932 17.3245 16.697 16.8375 17.3974 16.3084L19.2046 14.9433C19.8417 14.462 20.7873 14.4619 21.4245 14.943C21.9982 15.3762 22.1736 16.0894 21.8109 16.6707C21.388 17.3487 20.7921 18.216 20.2199 18.7459C19.6469 19.2766 18.7939 19.7504 18.0975 20.0865C17.326 20.4589 16.4738 20.6734 15.6069 20.8138C13.8488 21.0983 12.0166 21.0549 10.2763 20.6964C9.29253 20.4937 8.27079 20.3884 7.25993 20.3884H5M14.6764 17.5172C14.8222 17.486 14.9669 17.396 15.1028 17.2775C15.746 16.7161 15.7866 15.77 15.2285 15.1431C15.0991 14.9977 14.9475 14.8764 14.7791 14.7759C11.9817 13.1074 7.62942 14.3782 5 16.2429"/><rect width="3" height="8" x="2" y="14" rx="1.5"/></g></g>',
    donate: '<g stroke-width="1.57" transform="translate(0.5 0.03) scale(0.958)"><g stroke="currentColor"><path d="M17.4142 10.4142C17.4142 10.4142 17.4142 10.4142 17.4142 10.4142C18 9.82843 18 8.88562 18 7C18 5.11438 18 4.17157 17.4142 3.58579M17.4142 10.4142C16.8284 11 15.8856 11 14 11H10C8.11438 11 7.17157 11 6.58579 10.4142M17.4142 3.58579C17.4142 3.58579 17.4142 3.58579 17.4142 3.58579C16.8284 3 15.8856 3 14 3L10 3C8.11438 3 7.17157 3 6.58579 3.58579M6.58579 3.58579C6.58579 3.58579 6.58579 3.58579 6.58579 3.58579C6 4.17157 6 5.11438 6 7C6 8.88562 6 9.82843 6.58579 10.4142C6.58579 10.4142 6.58579 10.4142 6.58579 10.4142"/><path d="M13 7C13 7.55228 12.5523 8 12 8C11.4477 8 11 7.55228 11 7C11 6.44772 11.4477 6 12 6C12.5523 6 13 6.44772 13 7Z"/><path stroke-linecap="round" d="M18 6C16.3431 6 15 4.65685 15 3"/><path stroke-linecap="round" d="M18 8C16.3431 8 15 9.34315 15 11"/><path stroke-linecap="round" d="M6 6C7.65685 6 9 4.65685 9 3"/><path stroke-linecap="round" d="M6 8C7.65685 8 9 9.34315 9 11"/><path stroke-linecap="round" d="M5 20.3884H7.25993C8.27079 20.3884 9.29253 20.4937 10.2763 20.6964C12.0166 21.0549 13.8488 21.0983 15.6069 20.8138C16.4738 20.6734 17.326 20.4589 18.0975 20.0865C18.7939 19.7504 19.6469 19.2766 20.2199 18.7459C20.7921 18.216 21.388 17.3487 21.8109 16.6707C22.1736 16.0894 21.9982 15.3762 21.4245 14.943C20.7873 14.4619 19.8417 14.462 19.2046 14.9433L17.3974 16.3084C16.697 16.8375 15.932 17.3245 15.0206 17.4699C14.911 17.4874 14.7962 17.5033 14.6764 17.5172M12.7518 17.5326C13.4312 17.5968 14.0434 17.5829 14.5668 17.5292C14.6038 17.5254 14.6403 17.5214 14.6764 17.5172M14.6764 17.5172C14.8222 17.486 14.9669 17.396 15.1028 17.2775C15.746 16.7161 15.7866 15.77 15.2285 15.1431C15.0991 14.9977 14.9475 14.8764 14.7791 14.7759C11.9817 13.1074 7.62942 14.3782 5 16.2429M14.6764 17.5172C14.6399 17.525 14.6033 17.5292 14.5668 17.5292"/><rect width="3" height="8" x="2" y="14" rx="1.5"/></g></g>',
    copy: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z"/><path d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5"/></g></g>',
    pencil: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path stroke-linecap="round" d="M4 22H20"/><path d="M13.8881 3.66293L14.6296 2.92142C15.8581 1.69286 17.85 1.69286 19.0786 2.92142C20.3071 4.14999 20.3071 6.14188 19.0786 7.37044L18.3371 8.11195M13.8881 3.66293C13.8881 3.66293 13.9807 5.23862 15.3711 6.62894C16.7614 8.01926 18.3371 8.11195 18.3371 8.11195M13.8881 3.66293L7.07106 10.4799C6.60933 10.9416 6.37846 11.1725 6.17992 11.4271C5.94571 11.7273 5.74491 12.0522 5.58107 12.396C5.44219 12.6874 5.33894 12.9972 5.13245 13.6167L4.25745 16.2417M4.25745 16.2417L4.04356 16.8833C3.94194 17.1882 4.02128 17.5243 4.2485 17.7515C4.47573 17.9787 4.81182 18.0581 5.11667 17.9564L5.75834 17.7426L8.38334 16.8675C9.00282 16.6611 9.31256 16.5578 9.60398 16.4189C9.94775 16.2551 10.2727 16.0543 10.5729 15.8201C10.8275 15.6215 11.0584 15.3907 11.5201 14.9289L18.3371 8.11195M5.75834 17.7426L4.25745 16.2417"/></g></g>',
    book_open: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M4 8C4 5.17157 4 3.75736 4.87868 2.87868C5.75736 2 7.17157 2 10 2H14C16.8284 2 18.2426 2 19.1213 2.87868C20 3.75736 20 5.17157 20 8V16C20 18.8284 20 20.2426 19.1213 21.1213C18.2426 22 16.8284 22 14 22H10C7.17157 22 5.75736 22 4.87868 21.1213C4 20.2426 4 18.8284 4 16V8Z"/><path d="M19.8978 16H7.89778C6.96781 16 6.50282 16 6.12132 16.1022C5.08604 16.3796 4.2774 17.1883 4 18.2235"/><path stroke-linecap="round" d="M8 7H16"/><path stroke-linecap="round" d="M8 10.5H13"/><path stroke-linecap="round" d="M19.5 19H8"/></g></g>',
    user_circle: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><circle cx="12" cy="9" r="3"/><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M17.9691 20C17.81 17.1085 16.9247 15 11.9999 15C7.07521 15 6.18991 17.1085 6.03076 20"/></g></g>',
    lock_open: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M2 16C2 13.1716 2 11.7574 2.87868 10.8787C3.75736 10 5.17157 10 8 10H16C18.8284 10 20.2426 10 21.1213 10.8787C22 11.7574 22 13.1716 22 16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22H8C5.17157 22 3.75736 22 2.87868 21.1213C2 20.2426 2 18.8284 2 16Z"/><circle cx="12" cy="16" r="2"/><path stroke-linecap="round" d="M6 10V8C6 4.68629 8.68629 2 12 2C14.7958 2 17.1449 3.91216 17.811 6.5"/></g></g>',
    hourglass: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><path stroke="currentColor" d="M12 12L9.0423 14.9289C6.11981 17.823 4.65857 19.27 5.06765 20.5185C5.10282 20.6258 5.14649 20.7302 5.19825 20.8307C5.80046 22 7.86697 22 12 22C16.133 22 18.1995 22 18.8017 20.8307C18.8535 20.7302 18.8972 20.6258 18.9323 20.5185C19.3414 19.27 17.8802 17.823 14.9577 14.9289L12 12ZM12 12L14.9577 9.07107C17.8802 6.177 19.3414 4.72997 18.9323 3.48149C18.8972 3.37417 18.8535 3.26977 18.8017 3.16926C18.1995 2 16.133 2 12 2C7.86697 2 5.80046 2 5.19825 3.16926C5.14649 3.26977 5.10282 3.37417 5.06765 3.48149C4.65857 4.72997 6.11981 6.177 9.0423 9.07107L12 12Z"/></g>',
    shield_off: '<g stroke-width="1.57" transform="translate(0.5 0.5) scale(0.958)"><g stroke="currentColor"><path d="M3 10.4167C3 7.21907 3 5.62028 3.37752 5.08241C3.75503 4.54454 5.25832 4.02996 8.26491 3.00079L8.83772 2.80472C10.405 2.26824 11.1886 2 12 2C12.8114 2 13.595 2.26824 15.1623 2.80472L15.7351 3.00079C18.7417 4.02996 20.245 4.54454 20.6225 5.08241C21 5.62028 21 7.21907 21 10.4167C21 10.8996 21 11.4234 21 11.9914C21 17.6294 16.761 20.3655 14.1014 21.5273C13.38 21.8424 13.0193 22 12 22C10.9807 22 10.62 21.8424 9.89856 21.5273C7.23896 20.3655 3 17.6294 3 11.9914C3 11.4234 3 10.8996 3 10.4167Z"/><path stroke-linecap="round" d="M14.5 9.5L9.50002 14.5M9.5 9.49998L14.5 14.5"/></g></g>',
    google: '<path d="M20.6 12.2c0-.6-.1-1.2-.2-1.7H12v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z"/><path d="M12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H3.9v2.3A9 9 0 0 0 12 21z"/><path d="M6.9 13.7a5.4 5.4 0 0 1 0-3.4V8H3.9a9 9 0 0 0 0 8z"/><path d="M12 6.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 3.9 8L6.9 10.3C7.6 8.1 9.6 6.6 12 6.6z"/>',
    momo: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.4 12c0-2 1.6-3.6 3.6-3.6s3.6 1.6 3.6 3.6-1.6 3.6-3.6 3.6S8.4 14 8.4 12z"/><circle cx="12" cy="12" r="1.2"/>'
  };

  function icon(name, cls) {
    var p = P[name] || P.info;
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* ======================= 4. TIỆN ÍCH ================================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function authorFix(a) {
    return String(a || '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^salmonlover$/i, 'SalmonLover');
  }
  function num(n) { return (Number(n) || 0).toLocaleString('vi-VN'); }
  function dateVN(s) {
    if (!s) return '—';
    var x = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s);
    if (isNaN(x)) return String(s);
    return x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function dateShort(s) {
    if (!s) return '—';
    var x = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s);
    if (isNaN(x)) return String(s);
    return x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }
  function timeAgo(s) {
    var x = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).getTime();
    if (!x || isNaN(x)) return '—';
    var diff = Date.now() - x, day = 864e5;
    if (diff < 3600e3) return 'vừa xong';
    if (diff < day) return Math.floor(diff / 3600e3) + ' giờ trước';
    if (diff < 30 * day) return Math.floor(diff / day) + ' ngày trước';
    return dateShort(s);
  }
  function statusCls(s) {
    return /hoàn thành|full/i.test(s || '') ? 'done' : /sắp|chưa|tạm dừng/i.test(s || '') ? 'soon' : 'run';
  }
  /* ba tình trạng duy nhất, dùng cùng chữ trên mọi trang */
  var STATUS_LABEL = { done: 'Hoàn thành', run: 'Đang cập nhật', soon: 'Sắp ra mắt' };
  function statusLabel(s) {
    if (s === 'done' || s === 'run' || s === 'soon') return STATUS_LABEL[s];
    return STATUS_LABEL[statusCls(s)] || 'Đang cập nhật';
  }
  function words(html) {
    var t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.split(' ').length : 0;
  }
  function storyURL(slug) { slug = String(slug||'').trim(); if (!slug) return '/truyen/'; return '/truyen/' + encodeURIComponent(slug) + '/'; }
  function readURL(slug, ch) { return storyURL(slug) + (ch ? '#chuong-' + ch : ''); }
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function qs(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }
  /* tải một tệp JSON về máy — có đường lùi cho trình duyệt cũ / môi trường thiếu Blob */
  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'application/json' });
      if (!w.URL || typeof w.URL.createObjectURL !== 'function') throw new Error('no-blob');
      var a = d.createElement('a');
      a.href = w.URL.createObjectURL(blob);
      a.download = name;
      d.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { try { w.URL.revokeObjectURL(a.href); } catch (e) {} }, 4000);
      return true;
    } catch (e) {
      try {
        var url = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
        var b = d.createElement('a');
        b.href = url; b.download = name; b.target = '_blank';
        d.body.appendChild(b); b.click(); b.remove();
        return true;
      } catch (e2) {
        toast('Trình duyệt không cho tải tệp — bạn copy nội dung trong bảng thay thế');
        return false;
      }
    }
  }
  function copy(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { toast(okMsg || 'Đã copy liên kết'); return true; })
        .catch(function () { toast(text); return false; });
    }
    toast(text);
    return Promise.resolve(false);
  }
  /* ---- SỐ CHƯƠNG THẬT (đối chiếu từ kho chương) ---------------------------
     Bệnh: sửa 30/30 → 29/29 trong file JSON trên GitHub nhưng web vẫn hiện 30,
     vì web đọc registry trên Cloudflare KV trước, và con số trong registry là
     bản chép tay nên dễ lệch với số chương thật của bộ.
     Chữa 3 lớp:
       1. Worker tự đếm lại mỗi lần ghi 1 bộ + có nút /api/recount (admin).
       2. Web mở bộ nào thì đối chiếu số chương thật của bộ đó và GHI NHỚ trong
          máy (ssochuz-realcounts) — từ đó trang chủ/thư viện hiện đúng số.
       3. norm() dưới đây luôn lấy số đã đối chiếu thay cho nhãn cũ.            */
  var LS_REAL = 'ssochuz-realcounts';
  var realMap = null;
  function realCounts() {
    if (realMap == null) { var m = jsonGet(LS_REAL, {}); realMap = (m && typeof m === 'object') ? m : {}; }
    return realMap;
  }
  function realCount(slug) {
    var m = realCounts(), v = m[slug];
    return v == null ? null : (parseInt(v, 10) || 0);
  }
  /* gọi sau khi tải xong 1 bộ: real = số chương thật trong kho */
  function reconcileCount(n, real) {
    var slug = typeof n === 'string' ? n : (n && n.slug);
    real = parseInt(real, 10);
    if (!slug || !(real >= 0)) return false;
    var m = realCounts();
    var changed = Number(m[slug]) !== real;
    m[slug] = real;
    if (changed) jsonSet(LS_REAL, m);
    /* sửa luôn bản registry đang nằm trong bộ nhớ để mọi khối vẽ lại cho đúng */
    var reg = memo.reg;
    if (reg && reg.lib) {
      reg.lib.forEach(function (x) {
        if (!x || x.slug !== slug) return;
        var was = Number(x.chapters) || 0;
        if (was !== real) {
          x.chapters = real;
          x.countFixed = true;
          /* cập nhật nhãn: nếu chưa có planned thì 29/29, nếu có planned lớn hơn thì 29/planned,
             nếu là 0 thì 0/— */
          var planned = parseInt(x.planned || x.declared || 0, 10) || 0;
          if (real === 0 && planned === 0) x.countLabel = '0/—';
          else x.countLabel = real + '/' + Math.max(real, planned || real);
          x.count = x.countLabel;
        }
      });
    }
    libCache = null;
    if (changed) {
      try { w.dispatchEvent(new CustomEvent('cz:count', { detail: { slug: slug, chapters: real } })); } catch (e) {}
    }
    return changed;
  }
  /* chuẩn hoá 1 bộ trong registry thành dạng dùng chung cho mọi trang */
  function norm(n) {
    var o = Object.assign({}, n || {});
    o.title = String(o.title || '').trim();
    o.author = authorFix(o.author);
    o.couple = String(o.couple || '').trim();
    o.chapters = parseInt(o.chapters, 10) || 0;
    /* số chương đã đối chiếu từ kho chương thật luôn thắng nhãn cũ trong registry */
    var rc = realCount(o.slug);
    if (rc != null && rc !== o.chapters) { o.chapters = rc; o.countFixed = true; }
    o.is18 = !!o.is18;
    o.statusCls = statusCls(o.status);
    o.status = statusLabel(o.status);
    /* nhãn: nếu chưa có hoặc là dạng "0 chương" thì tạo lại cho đúng (0/— hoặc 29/29) */
    var rawLabel = String(o.countLabel || o.count || '').trim();
    if (!rawLabel || /chương/i.test(rawLabel)) {
      if (o.chapters === 0) rawLabel = '0/—';
      else {
        var p = parseInt(o.planned || o.declared || 0, 10) || 0;
        rawLabel = o.chapters + '/' + Math.max(o.chapters, p || o.chapters);
      }
    }
    o.countLabel = rawLabel;
    var parts = String(o.countLabel || '').split('/');
    var second = String(parts[1] || '').trim();
    if (second === '—' || second === '' || second === '-') o.declared = o.chapters;
    else o.declared = parseInt(second, 10) || o.chapters;
    /* đã đối chiếu số thật thì đừng để nhãn "29/30" cũ làm người đọc tưởng còn thiếu */
    if (rc != null) {
      var planned = parseInt(o.planned, 10) || 0;
      o.declared = Math.max(o.chapters, planned || 0);
      /* đồng bộ lại nhãn cho khớp */
      if (o.chapters === 0) o.countLabel = '0/—';
      else o.countLabel = o.chapters + '/' + (o.declared || o.chapters);
    }
    /* Sắp ra mắt 0 chương thì nhãn 0/— là đúng, không phải thiếu */
    if (o.chapters === 0 && o.statusCls === 'soon' && !/^\d+\/\d+$/.test(o.countLabel)) {
      if (o.countLabel !== '0/—') {
        var pl = parseInt(o.planned || 0, 10) || 0;
        o.countLabel = pl > 0 ? ('0/' + pl) : '0/—';
        o.declared = pl || 0;
      }
    }
    o.url = storyURL(o.slug);
    o.canRead = o.chapters > 0;
    return o;
  }
  /* “10 chương”, hoặc “9/10 chương” khi thẻ truyện ghi tổng dự kiến nhiều hơn số đã đăng */
  function countText(n) {
    if (!n) return '0 chương';
    var c = parseInt(n.chapters, 10) || 0, d = parseInt(n.declared, 10) || 0;
    if (c === 0 && (String(n.countLabel || '').indexOf('—') >= 0 || d === 0)) {
      /* truyện chưa ra: hiện đúng nhãn gốc (0/— hoặc 0/18) cho rõ */
      var lbl = String(n.countLabel || '').trim();
      if (/^\d+\/—$/.test(lbl) || /^\d+\/\d+$/.test(lbl)) return lbl;
      return '0 chương';
    }
    return d > c ? (c + '/' + d + ' chương') : (c + ' chương');
  }

  /* ======================= 5. THÔNG BÁO & HỘP THOẠI ==================== */
  /* Thời lượng hiệu dụng: đọc từ token CSS (--t, --t-close) để đóng hộp thoại
     đúng lúc animation xong; máy bật “giảm chuyển động” thì coi như tức thì. */
  function ms(name, fallback) {
    if (reduce) return 0;
    try {
      var v = getComputedStyle(d.documentElement).getPropertyValue(name).trim();
      var n = parseFloat(v);
      if (!n) return fallback;
      return /ms$/.test(v) ? n : n * 1000;
    } catch (e) { return fallback; }
  }
  function toastBox() {
    var b = d.getElementById('toasts');
    if (!b) {
      b = d.createElement('div'); b.id = 'toasts'; b.className = 'toasts';
      /* trình đọc màn hình phải đọc được thông báo, không chỉ hiện cho mắt */
      b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite'); b.setAttribute('aria-atomic', 'false');
      d.body.appendChild(b);
    }
    return b;
  }
  function toast(msg, kind) {
    var b = toastBox(), el = d.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = msg;
    b.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('in'); });     /* trồi lên */
    setTimeout(function () {
      el.classList.remove('in');
      el.classList.add('out');                                         /* đi xuống, nhanh hơn */
      setTimeout(function () { el.remove(); }, ms('--t-close', 150) + 60);
    }, 2800);
  }
  function modal(id, html, opt) {
    opt = opt || {};
    var m = d.getElementById(id);
    if (!m) {
      m = d.createElement('div'); m.id = id; m.className = 'modal'; d.body.appendChild(m);
      m.addEventListener('click', function (e) {
        if (e.target.classList.contains('scrim') || e.target.closest('[data-close]')) close();
      });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && m.classList.contains('on')) close(); });
    }
    function close() {
      if (m._closing || !m.classList.contains('on')) return;
      m._closing = true;
      m.classList.add('closing');                                       /* chạy nhịp đóng 150ms */
      var wait = ms('--t-close', 150);
      setTimeout(function () {
        m.classList.remove('on');
        m.classList.remove('closing');
        m._closing = false;
        /* trả tiêu điểm về nút đã mở hộp thoại, để người dùng bàn phím không bị lạc */
        if (m._back && m._back.focus && d.contains(m._back)) { try { m._back.focus({ preventScroll: true }); } catch (e) { m._back.focus(); } }
        if (opt.onClose) opt.onClose();
      }, wait);
    }
    m.innerHTML = '<div class="scrim"></div><div class="box" role="dialog" aria-modal="true">' + html + '</div>';
    m._closing = false;
    m.classList.add('on');
    if (opt.shake) shake(m.querySelector('.box'));
    /* đưa tiêu điểm vào ô đầu tiên (bàn phím dùng được ngay, không phải Tab từ đầu trang) */
    m._back = d.activeElement;
    var first = m.querySelector('input:not([type=hidden]),textarea,select,button:not([data-close])');
    if (first && !reduce) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 40);
    else if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
    m._close = close;
    return m;
  }
  function closeModal(id) {
    var m = d.getElementById(id);
    if (m && m._close) m._close();
  }
  function confirmBox(text, okLabel) {
    return new Promise(function (res) {
      var done = false;
      function finish(v) { if (!done) { done = true; res(v); } }
      var m = modal('czConfirm',
        '<div class="mh"><h4>Xác nhận</h4></div><div class="mb" style="white-space:pre-line">' + esc(text) + '</div>' +
        '<div class="mf"><button class="btn ghost" data-close>Huỷ</button>' +
        '<button class="btn pri" id="czOk">' + esc(okLabel || 'Đồng ý') + '</button></div>',
        { onClose: function () { finish(false); } });
      m.querySelector('#czOk').addEventListener('click', function () { finish(true); m._close(); });
    });
  }

  /* ======================= 6. THẺ TRUYỆN & DẢI ========================= */
  function card(n, opts) {
    opts = opts || {};
    if (!n || !n.slug) return '<div class="card off" title="Thiếu slug — sửa trong trang quản trị">' +
      '<div class="th noimg"><span class="pill soon"><span class="d"></span>thiếu slug</span></div>' +
      '<h3>' + esc((n&&n.title)||'—') + '</h3><div class="cb">' + esc((n&&n.author)||'') + '</div></div>';
    var pg = progress(n), pct = n.chapters ? Math.min(100, Math.round(pg / n.chapters * 100)) : 0;
    var img = n.thumb || n.slide || '';
    if (opts.view === 'list') return cardList(n, img, pg, pct);
    return '<a class="card" href="' + esc(storyURL(n.slug)) + '" data-t="' + esc(n.title) + '" title="' + esc(n.title) + '">' +
      '<div class="th' + (img ? ' skel' : '') + '">' +
      (img ? '<img src="' + esc(img) + '" alt="Bìa ' + esc(n.title) + '" loading="lazy" decoding="async" width="300" height="450">' : '') +
      '<span class="scrim"></span>' +
      '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(statusLabel(n.statusCls || n.status)) + '</span>' +
      (n.is18 ? '<span class="b18">18+</span>' : '') +
      '<span class="foot"><span class="ch">' + esc(countText(n)) + '</span>' +
        (n.fresh ? '<span class="badge-new">Mới</span>' : '') + '</span>' +
      (pct ? '<span class="bar"><i style="width:' + pct + '%"></i></span>' : '') +
      '</div>' +
      '<h3>' + esc(n.title) + '</h3>' +
      '<div class="cb">' + (n.couple ? esc(n.couple) : esc(n.author || '')) + '</div>' +
      '</a>';
  }
  /* xem dạng danh sách: mỗi bộ một hàng, đủ thông tin để quyết định mở hay không */
  function cardList(n, img, pg, pct) {
    if (!n || !n.slug) return '<div class="card list off"><span class="cl-main"><span class="cl-top"><b class="cl-t">' + esc((n&&n.title)||'—') + '</b></span><span class="cl-meta">thiếu slug — sửa trong trang quản trị</span></span></div>';
    var bits = [n.couple, n.couple && n.author ? n.author : (n.couple ? '' : n.author), n.year].filter(Boolean);
    var read = pg > 0;
    return '<a class="card list st-' + esc(n.statusCls || 'soon') + '" href="' + esc(storyURL(n.slug)) + '" data-t="' + esc(n.title) + '" title="' + esc(n.title) + '">' +
      '<span class="cl-th' + (img ? ' skel' : '') + '">' +
        (img ? '<img src="' + esc(img) + '" alt="Bìa ' + esc(n.title) + '" loading="lazy" decoding="async" width="300" height="450">' : '') +
      '</span>' +
      '<span class="cl-main">' +
        '<span class="cl-top"><b class="cl-t">' + esc(n.title) + '</b>' +
          (n.is18 ? '<span class="b18">18+</span>' : '') +
          (n.fresh ? '<span class="badge-new">Mới</span>' : '') +
        '</span>' +
        '<span class="cl-meta">' + esc(bits.join(' · ') || '—') + '</span>' +
        '<span class="cl-syn">' + esc(n.syn || 'Chưa có mô tả cho bộ này.') + '</span>' +
        (pct ? '<span class="cl-prog" title="đã đọc ' + pct + '%"><i style="width:' + pct + '%"></i></span>' : '') +
      '</span>' +
      '<span class="cl-side">' +
        '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(statusLabel(n.statusCls || n.status)) + '</span>' +
        '<span class="cl-ch">' + esc(countText(n)) + '</span>' +
        '<span class="cl-year">' + esc(n.year ? 'Năm ' + n.year : '—') + '</span>' +
      '</span>' +
      '<span class="cl-go">' + (read ? 'Đọc tiếp' : 'Xem truyện') + icon('right', 'i-s') + '</span>' +
      '</a>';
  }
  /* hàng tiêu đề cho kiểu xem danh sách (chỉ là nhãn, không bấm được) */
  function listHead() {
    return '<div class="list-head" aria-hidden="true">' +
      '<span>Bộ truyện</span><span>Tình trạng · chương</span><span></span></div>';
  }
  function mountRail(el, list, opts) {
    if (!el) return;
    opts = opts || {};
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = list.map(function (n) { return card(n, opts); }).join('');
    if (!reduce) Array.prototype.forEach.call(el.querySelectorAll('.card'), function (c, i) {
      c.style.setProperty('--d', Math.min(i, 12) * 24 + 'ms');
    });
  }
  /* ---- ảnh hỏng (bị chặn hotlink, mạng yếu) → khung vẫn đẹp, không hiện icon vỡ ----
     Ảnh trong bài đọc thì giữ chỗ và hiện chữ thay thế; ảnh bìa thì bỏ ảnh,
     bỏ luôn khung xám chờ để không nhấp nháy mãi. Một chỗ duy nhất cho cả hai
     sự kiện: ảnh lỗi bị gỡ khỏi trang vẫn có thể bắn tiếp sự kiện lỗi. */
  function imgSettle(e) {
    var el = e.target;
    if (!el || String(el.tagName || '').toUpperCase() !== 'IMG') return;
    if (el.closest && el.closest('.rtext')) { if (e.type === 'error') el.classList.add('badimg'); return; }
    var box = el.closest && el.closest('.skel');
    if (box) box.classList.remove('skel');
    if (e.type !== 'error') return;
    box = el.parentNode;
    if (el.remove) el.remove();
    if (box && box.classList && box.classList !== d.body.classList) box.classList.add('noimg');
  }
  d.addEventListener('error', imgSettle, true);
  d.addEventListener('load', imgSettle, true);

  /* hiệu ứng hiện dần khi cuộn tới (tôn trọng giảm chuyển động) */
  var reduce = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function reveal(scope) {
    var els = (scope || d).querySelectorAll('.fade:not(.in)');
    if (reduce || !w.IntersectionObserver) { Array.prototype.forEach.call(els, function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -50px 0px' });
    Array.prototype.forEach.call(els, function (e) { io.observe(e); });
  }
  function countUp(el, to) {
    if (reduce) { el.textContent = num(to); return; }
    el.classList.add('numrun');
    setTimeout(function () { el.classList.remove('numrun'); }, 420);
    var t0 = (w.performance && performance.now) ? performance.now() : Date.now(), dur = 750;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = num(Math.round(to * e));
      if (k < 1) requestAnimationFrame(step); else el.textContent = num(to);
    })(t0);
  }
  function scaleFacts(root) {
    var nums = (root || d).querySelectorAll('[data-count]');
    if (!nums.length) return;
    if (reduce || !w.IntersectionObserver) { Array.prototype.forEach.call(nums, function (b) { b.textContent = num(+b.dataset.count || 0); }); return; }
    var fired = 0;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        fired++;
        if (!e.isIntersecting) return;
        countUp(e.target, +e.target.dataset.count || 0);
        io.unobserve(e.target);
      });
    }, { threshold: .4 });
    Array.prototype.forEach.call(nums, function (b) { b.textContent = '0'; io.observe(b); });
    /* lưới an toàn: nếu máy không gọi lại observer (bị chặn, khung ẩn…) thì điền số luôn */
    setTimeout(function () {
      if (fired) return;
      Array.prototype.forEach.call(nums, function (b) { b.textContent = num(+b.dataset.count || 0); });
    }, 2500);
  }
  /* vạch tiến độ cuộn trang + nút lên đầu */
  function scrollUI() {
    var bar = d.querySelector('#sprog i'), top = d.querySelector('#toTop'), tick = false, lastY = w.scrollY || 0;
    function run() {
      if (tick) return; tick = true;
      requestAnimationFrame(function () {
        var y = w.scrollY || 0;
        var h = d.documentElement.scrollHeight - w.innerHeight;
        if (bar) bar.style.width = (h > 0 ? Math.min(100, Math.max(0, y / h * 100)) : 0) + '%';
        if (top) top.classList.toggle('on', y > 700);
        d.body.classList.toggle('scrolled', y > 8);
        /* thanh trên không còn trượt theo / ẩn hiện khi cuộn — đứng yên với trang */
        lastY = y;
        tick = false;
      });
    }
    w.addEventListener('scroll', run, { passive: true }); run();
    if (top) top.addEventListener('click', function () { w.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  }
  /* ======================= 7. CHUYỂN ĐỘNG TƯƠNG TÁC ==================== */
  /* mở/đóng mượt một khối (menu máy nhỏ, khối gấp…) */
  function slide(el, on) {
    if (!el) return false;
    var open = typeof on === 'boolean' ? on : !el.classList.contains('on');
    /* .slid mới là thứ MỞ khối ra (xem .mnav trong cz.css) — phải thêm trước cả
       nhánh reduce. Bệnh cũ: máy bật "giảm chuyển động" (Android tiết kiệm pin
       cũng bật) đi vào nhánh dưới, chỉ bật .on mà thiếu .slid nên menu điện
       thoại vẫn display:none — bấm nút menu không thấy gì. */
    el.classList.add('slid');
    if (reduce) { el.classList.toggle('on', open); return open; }
    el.style.overflow = 'hidden';
    if (open) {
      el.classList.add('on');
      el.style.maxHeight = '0px';
      void el.offsetHeight;
      el.style.maxHeight = (el.scrollHeight + 2) + 'px';
      setTimeout(function () { if (el.classList.contains('on')) el.style.maxHeight = '1200px'; }, 440);
    } else {
      el.style.maxHeight = el.scrollHeight + 'px';
      void el.offsetHeight;
      el.style.maxHeight = '0px';
      el.classList.remove('on');
    }
    return open;
  }
  /* gợn sóng nhẹ ngay chỗ con trỏ khi bấm nút */
  function ripple(el, e) {
    if (reduce || !el || !d.createElement) return;
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!r || !r.width) return;
    var size = Math.max(r.width, r.height);
    var sp = d.createElement('span');
    sp.className = 'rip';
    sp.style.width = sp.style.height = size + 'px';
    sp.style.left = ((e.clientX || r.left + r.width / 2) - r.left - size / 2) + 'px';
    sp.style.top = ((e.clientY || r.top + r.height / 2) - r.top - size / 2) + 'px';
    el.appendChild(sp);
    setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 560);
  }
  /* nảy nhẹ khi vừa lưu / thích / đánh dấu — phản hồi rõ ràng cho một cú bấm */
  /* Thay icon NGAY TẠI CHỖ có chuyển động (thu nhỏ + nhoè) — theo “icon swap”. */
  function setIcon(el, name) {
    if (!el) return;
    var box = el.classList && el.classList.contains('i') ? el : null;
    var target = box || el;
    target.classList.remove('iswap');
    if (box) target.innerHTML = P[name] || P.info;
    else { target.innerHTML = icon(name, 'i-s'); target = target.querySelector('.i') || target; }
    if (reduce) return;
    void target.offsetWidth;
    target.classList.add('iswap');
    setTimeout(function () { target.classList.remove('iswap'); }, ms('--t', 250) + 60);
  }
  /* Lỗi thì rung một nhịp cho mắt biết, không chỉ đổi màu chữ. */
  function shake(el) {
    if (!el || !el.classList || reduce) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 420);
  }
  function pop(el) {
    if (!el || !el.classList) return;
    if (reduce) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    setTimeout(function () { if (el.classList) el.classList.remove('pop'); }, 480);
  }
  /* chuyển trang: vạch tiến độ trên cùng + nội dung hiện dần, không nhảy khô */
  function pageFx() {
    var bar = d.createElement('div');
    bar.id = 'nprog'; bar.setAttribute('aria-hidden', 'true'); bar.innerHTML = '<i></i>';
    d.body.appendChild(bar);
    var fill = bar.firstChild;
    d.body.classList.add('page-in');
    if (!reduce) {
      fill.style.width = '10%'; fill.style.opacity = '1';
      requestAnimationFrame(function () { fill.style.width = '64%'; });
      setTimeout(function () {
        fill.style.width = '100%';
        setTimeout(function () { fill.style.opacity = '0'; }, 220);
      }, 240);
    }
    /* bắt cú bấm: gợn sóng cho nút, và điệu chuyển trang cho liên kết nội bộ */
    d.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var el = e.target;
      if (!el || !el.closest) return;
      var hit = el.closest('.btn, .hbtn, .pg, .seg button, .qclr');
      if (hit) ripple(hit, e);
      var link = el.closest('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      var href = link.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto:|tel:)/i.test(href)) return;
      var u; try { u = new URL(link.href, w.location.href); } catch (err) { return; }
      if (u.origin !== w.location.origin) return;
      if (u.pathname === w.location.pathname && u.search === w.location.search) return;
      e.preventDefault();
      fill.style.opacity = '1'; fill.style.width = '92%';
      var go = function () { w.location.href = link.href; };
      if (reduce) go(); else setTimeout(go, 170);
    }, true);
  }

  /* ======================= 7b. GẠCH CHÂN TRƯỢT CHO DÃY TAB ============= */
  /* mọi dãy .tabs (trang chủ, quản trị…) đều có một viên nền / gạch chân trượt
     sang nút đang mở thay vì bật/tắt đột ngột */
  function ink(bar) {
    var el = typeof bar === 'string' ? d.querySelector(bar) : bar;
    if (!el || !el.querySelectorAll) return;
    var iv = null;
    Array.prototype.forEach.call(el.children, function (c) { if (c.classList && c.classList.contains('ink')) iv = c; });
    if (!iv) {
      iv = d.createElement('span');
      iv.className = 'ink';
      iv.setAttribute('aria-hidden', 'true');
      el.insertBefore(iv, el.firstChild);
    }
    var on = el.querySelector('button.on');
    if (!on) { iv.style.opacity = '0'; return; }
    var bar2 = el.classList.contains('bar');
    iv.style.left = on.offsetLeft + 'px';
    iv.style.top = (bar2 ? (el.offsetHeight - 2) : on.offsetTop) + 'px';
    iv.style.width = on.offsetWidth + 'px';
    iv.style.height = (bar2 ? 2 : on.offsetHeight) + 'px';
    iv.style.opacity = '1';
  }
  function inkAll() {
    Array.prototype.forEach.call(d.querySelectorAll('.tabs'), function (b) { ink(b); });
  }
  function inkSoon() { setTimeout(inkAll, 0); }
  w.addEventListener('resize', function () { inkSoon(); });
  d.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.tabs, .seg, [data-k], .stab')) inkSoon();
  });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', inkAll); else inkAll();

  /* ======================= 8. ĐẦU TRANG / CHÂN TRANG =================== */
  function mountHeader(host, active) {
    if (!host) return;
    /* header: chỉ icon + nhãn ngắn, nhưng là TIẾNG VIỆT cho khớp phần còn lại
       của web (trước đây để lẫn tiếng Anh: Library, Latest, Top vote, Schedule). */
    var NAV = [
      { k: 'library', l: 'Thư viện', vi: 'Thư viện truyện', i: 'library', h: '/#thu-vien' },
      { k: 'new', l: 'Mới', vi: 'Truyện mới cập nhật', i: 'sparkle', h: '/#moi-cap-nhat' },
      { k: 'rank', l: 'Bình chọn', vi: 'Bảng xếp hạng theo bình chọn', i: 'trophy', h: '/#bxh' },
      { k: 'sched', l: 'Lịch', vi: 'Lịch ra chương', i: 'calendar', h: '/#lich' }
    ];
    var links = NAV.map(function (n) {
      return '<a href="' + n.h + '" data-k="' + n.k + '"' + (n.k === active ? ' class="on"' : '') + ' title="' + esc(n.vi) + '" aria-label="' + esc(n.vi) + '">' +
        icon(n.i, 'i-s') + '<span class="nav-lbl">' + esc(n.l) + '</span></a>';
    }).join('');
    var mLinks = NAV.map(function (n) {
      return '<a href="' + n.h + '" data-k="' + n.k + '"' + (n.k === active ? ' class="on"' : '') + '>' +
        icon(n.i, 'i-s') + ' ' + esc(n.vi) + '</a>';
    }).join('');
    host.className = 'hdr';
    host.innerHTML = '<div class="in">' +
      '<a class="logo" href="/" title="ssochuz library"><span class="dot"></span>ssochuz<i> library</i></a>' +
      '<nav class="nav" id="czNav"><span class="ink" id="czInk" aria-hidden="true"></span>' + links + '</nav>' +
      '<span class="grow"></span>' +
      '<button class="hbtn" id="czJump" title="Tìm truyện, tác giả, couple (⌘K)" aria-label="Tìm kiếm">' + icon('search', 'i-s') +
        '<span class="searchbtn-txt">Tìm</span><span class="k">⌘K</span></button>' +
      /* công tắc sáng/tối — lấy cấu trúc của uiverse.io/catraco/brown-termite-67:
         rãnh bo tròn, biểu tượng trượt + xoay và đổi tông trời. Giữ id #czTheme
         / #czThemeIn để trạng thái cũ, bàn phím và các bài kiểm thử không vỡ. */
      '<label class="tsw switch-name" id="czTheme" title="Đổi nền sáng/tối">' +
        '<input type="checkbox" class="tsw-in checkbox" id="czThemeIn" role="switch" aria-label="Nền tối">' +
        '<span class="tsw-sl back" aria-hidden="true"></span>' +
        icon('moon', 'tsw-icon moon') + icon('sun', 'tsw-icon sun') +
      '</label>' +
      /* ---- ĐĂNG NHẬP: nút luôn có trên mọi trang (kể cả trang chủ) ---- */
      '<div class="hauth" id="czAuth">' +
        '<button class="hbtn authbtn" id="czAuthBtn" aria-haspopup="menu" aria-expanded="false">' +
          '<span class="authic" id="czAuthIc"></span><span class="nav-lbl" id="czAuthTxt">Đăng nhập</span>' +
        '</button>' +
        '<div class="amenu" id="czAuthMenu" role="menu" aria-label="Tài khoản"></div>' +
      '</div>' +
      '<button class="hbtn icon burger" id="czBurger" aria-label="Mở menu" aria-expanded="false" aria-controls="czMnav">' + icon('menu', 'i-s') + '</button>' +
      '</div>' +
      '<div class="mnav" id="czMnav">' + mLinks +
      '<a href="/#ban-doc">' + icon('shelf', 'i-s') + ' Bàn đọc của bạn</a>' +
      '<a href="/guide">' + icon('info', 'i-s') + ' Hướng dẫn</a>' +
      /* mục Quản trị được vẽ trong paintAuth(): người thường KHÔNG thấy */
      '<span id="czAuthMWrap"></span></div>';

    var tb = host.querySelector('#czTheme');
    var tin = host.querySelector('#czThemeIn');
    /* công tắc chỉ có 2 trạng thái (sáng ⇄ tối) nên chỉ cần đồng bộ lại ô chọn
       và nhãn đọc máy sau mỗi lần đổi — nhãn nói rõ đang ở nền nào */
    function paintTheme() {
      var dark = d.documentElement.getAttribute('data-theme') === 'dark';
      var lbl = dark ? 'Đang bật nền tối — bấm để về nền sáng' : 'Đang ở nền sáng — bấm để bật nền tối';
      if (tin) { tin.checked = dark; tin.setAttribute('aria-label', lbl); }
      tb.setAttribute('title', lbl);
      tb.setAttribute('aria-label', lbl);
    }
    paintTheme();
    /* KHÔNG gắn handler cho cú bấm: <label> đã bọc sẵn ô chọn nên trình duyệt tự
       chuyển cú bấm vào ô, ô lật checked rồi phát 'change' — dựng thêm handler
       bấm nữa là mỗi cú bấm đổi 2 lần thành ra… không đổi gì. Việc duy nhất cần
       làm ở đây là lật nền cho khớp với ô, và chỉ lật khi hai bên đang LỆCH nhau
       (nhờ vậy dù 'change' có bị phát thừa cũng không đổi hai lần). */
    if (tin) tin.addEventListener('change', function () {
      var dark = d.documentElement.getAttribute('data-theme') === 'dark';
      if (tin.checked !== dark) themeToggle();
      paintTheme();
    });

    /* ---- nút đăng nhập + menu tài khoản ----
       · Chưa đăng nhập: bấm là mở đăng nhập (Supabase → Google, hoặc link email).
       · Đã đăng nhập: bấm mở menu (tủ truyện, đang đọc, quản trị [nếu là admin], đăng xuất).
       · Mục "Quản trị" chỉ hiện với email nằm trong CZ_ADMIN_EMAILS — người đọc
         thường không thấy đường vào trang admin nữa. */
    function authUser() { return (w.CZ_AUTH && w.CZ_AUTH.current && w.CZ_AUTH.current()) || null; }
    function isAdmin() { return !!(w.CZ_AUTH && w.CZ_AUTH.isAdmin && w.CZ_AUTH.isAdmin()); }
    function closeMenu() {
      var m = host.querySelector('#czAuthMenu'), b = host.querySelector('#czAuthBtn');
      if (m) m.classList.remove('on');
      if (b) b.setAttribute('aria-expanded', 'false');
      d.body.classList.remove('authmenu-on');
    }
    function paintAuth() {
      var btn = host.querySelector('#czAuthBtn');
      if (!btn) return;
      var ic0 = host.querySelector('#czAuthIc'), txt = host.querySelector('#czAuthTxt');
      var menu = host.querySelector('#czAuthMenu');
      var mwrap = host.querySelector('#czAuthMWrap');
      var u = authUser();
      var ad = isAdmin();
      if (u) {
        var short = String(u.name || u.email || 'Bạn').split(' ')[0];
        btn.classList.add('hasuser');
        if (ic0) {
          ic0.innerHTML = u.picture
            ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">'
            : '<span class="ava">' + esc(String(u.name || u.email || 'B')[0].toUpperCase()) + '</span>';
        }
        if (txt) txt.textContent = short;
        btn.title = 'Đã đăng nhập: ' + (u.email || u.name) + ' — bấm để mở menu tài khoản';
        if (menu) {
          menu.innerHTML =
            '<div class="amtop">' +
              (u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">'
                         : '<span class="ava">' + esc(String(u.name || u.email || 'B')[0].toUpperCase()) + '</span>') +
              '<span><b>' + esc(u.name || 'Bạn đọc') + '</b><span>' + esc(u.email || '') + '</span>' +
              (ad ? '<em class="role">' + icon('shield', 'i-s') + 'quản trị</em>' : '') + '</span>' +
            '</div>' +
            '<button type="button" role="menuitem" id="czAuthEdit">' + icon('edit', 'i-s') + 'Chỉnh sửa hồ sơ</button>' +
            '<a href="/#ban-doc" role="menuitem">' + icon('shelf', 'i-s') + 'Tủ truyện của tôi</a>' +
            '<a href="/#ban-doc" role="menuitem">' + icon('clock', 'i-s') + 'Đang đọc dở</a>' +
            (ad ? '<a href="/admin" role="menuitem" class="adm">' + icon('gear', 'i-s') + 'Trang quản trị</a>' : '') +
            '<button type="button" role="menuitem" id="czAuthOut" class="out">' + icon('logout', 'i-s') + 'Đăng xuất</button>';
        }
        if (mwrap) {
          mwrap.innerHTML = (ad ? '<a href="/admin" id="czAuthMAdmin">' + icon('shield', 'i-s') + ' Quản trị</a>' : '') +
            '<a href="#" id="czAuthM">' + icon('logout', 'i-s') + ' <span id="czAuthMTxt">Đăng xuất</span></a>';
        }
      } else {
        btn.classList.remove('hasuser');
        if (ic0) ic0.innerHTML = icon('user', 'i-s');
        if (txt) txt.textContent = 'Đăng nhập';
        btn.title = 'Đăng nhập để bình luận và thích từng chương';
        if (menu) menu.innerHTML = '';
        if (mwrap) {
          mwrap.innerHTML = '<a href="#" id="czAuthM">' + icon('user', 'i-s') +
            ' <span id="czAuthMTxt">Đăng nhập</span></a>';
        }
      }
      /* gắn lại sự kiện vì innerHTML vừa được vẽ mới */
      var editBtn = host.querySelector('#czAuthEdit');
      if (editBtn) editBtn.addEventListener('click', function () {
        closeMenu();
        if (w.CZ_AUTH && w.CZ_AUTH.editProfileDialog) w.CZ_AUTH.editProfileDialog().catch(function () {});
      });
      var out = host.querySelector('#czAuthOut');
      if (out) out.addEventListener('click', function () {
        closeMenu();
        w.CZ_AUTH.logout().then(function () { paintAuth(); });
      });
      var mBtn = host.querySelector('#czAuthM');
      if (mBtn) mBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var mn = host.querySelector('#czMnav'); if (mn) mn.classList.remove('on');
        if (authUser()) w.CZ_AUTH.logout().then(function () { paintAuth(); });
        else w.CZ_AUTH.login().then(function () { paintAuth(); });
      });
      closeMenu();
    }
    host.querySelector('#czAuthBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = host.querySelector('#czAuthMenu');
      if (!authUser()) { w.CZ_AUTH.login().catch(function () {}); return; }
      var on = menu && menu.classList.contains('on');
      if (on) { closeMenu(); return; }
      paintAuth();
      if (menu) { menu.classList.add('on'); d.body.classList.add('authmenu-on'); }
      this.setAttribute('aria-expanded', 'true');
    });
    d.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#czAuth')) return;
      closeMenu();
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    if (w.CZ_AUTH && w.CZ_AUTH.onAuth) w.CZ_AUTH.onAuth(paintAuth); else paintAuth();

    navInk(host);
    var mnav = host.querySelector('#czMnav');
    var burger = host.querySelector('#czBurger');
    /* Nút menu (chỉ hiện trên điện thoại): phải báo rõ đang mở/đóng cho trình đọc
       màn hình, đóng được bằng phím Esc và bằng cú bấm ra ngoài — trước đây chỉ
       bấm lại đúng nút mới đóng. */
    burger.setAttribute('aria-controls', 'czMnav');
    function paintMenu() {
      var on = mnav.classList.contains('on');
      burger.setAttribute('aria-expanded', on ? 'true' : 'false');
      burger.setAttribute('aria-label', on ? 'Đóng menu' : 'Mở menu');
    }
    paintMenu();
    burger.addEventListener('click', function (e) {
      e.stopPropagation();                       /* để không bị chính handler "bấm ra ngoài" đóng ngay */
      slide(mnav);
      d.body.classList.remove('nav-up');
      paintMenu();
    });
    mnav.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) { slide(mnav, false); paintMenu(); } });
    d.addEventListener('click', function (e) {
      if (!mnav.classList.contains('on')) return;
      if (e.target.closest && (e.target.closest('#czMnav') || e.target.closest('#czBurger'))) return;
      slide(mnav, false); paintMenu();
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mnav.classList.contains('on')) { slide(mnav, false); paintMenu(); try { burger.focus(); } catch (err) {} }
    });
    host.querySelector('#czJump').addEventListener('click', function () { openJump(); });
    d.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); openJump(); }
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) { e.preventDefault(); openJump(); }
      if (e.key === 'Escape') { var jb = d.getElementById('czJumpBox'); if (jb && jb.classList.contains('on') && jb._close) jb._close(); }
    });
  }
  /* thanh mục ở đầu trang: gạch chân trượt sang mục đang xem, không chỉ là mấy chữ chết */
  function navInk(host) {
    var nav = host.querySelector('#czNav'), ink = host.querySelector('#czInk');
    if (!nav || !ink) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll('a[data-k]'));
    if (!links.length) return;
    var ids = links.map(function (a) { return (a.getAttribute('href') || '').split('#')[1] || ''; });
    var have = ids.filter(function (id) { return !!(id && d.getElementById(id)); }).length;
    function mark(el) {
      links.forEach(function (a) { a.classList.toggle('on', a === el); });
      if (!el) { ink.style.opacity = '0'; return; }
      ink.style.width = el.offsetWidth + 'px';
      ink.style.transform = 'translateX(' + el.offsetLeft + 'px)';
      ink.style.opacity = '1';
    }
    var here = links.filter(function (a) { return a.classList.contains('on'); })[0];
    if (have < 2) { mark(here || links[0]); return; }
    var tick = false;
    function spy() {
      tick = false;
      var y = (w.scrollY || 0) + 150, cur = null;
      ids.forEach(function (id, i) { var el = d.getElementById(id); if (el && el.offsetTop <= y) cur = i; });
      mark(cur == null ? links[0] : links[cur]);
    }
    function run() { if (tick) return; tick = true; requestAnimationFrame(spy); }
    w.addEventListener('scroll', run, { passive: true });
    w.addEventListener('resize', run);
    d.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('#czNav a'); if (a) mark(a); });
    run();
  }
  /* chân trang: logo · lời cảm ơn · Hướng dẫn / Facebook / Email / Khảo sát truyện */
  function mountFooter(host) {
    if (!host) return;
    host.className = 'ftr';
    var cfg = reportCfg();
    var email = cfg.email || 'chuseoz.ofc@gmail.com';
    var fb = 'https://www.facebook.com/profile.php?id=61592803761987';
    var survey = cfg.form || 'https://forms.gle/YW3PvtrNVQ7xt8nCA';
    host.innerHTML = '<div class="in">' +
      '<div class="fmain">' +
        '<div class="fbrand">' +
          '<a class="logo" href="/" title="ssochuz library"><span class="dot"></span>ssochuz<i> library</i></a>' +
          '<p class="fdesc">Cảm ơn bạn đã ủng hộ và đồng hành cùng ssochuz library!</p>' +
          '<p class="flinks">' +
            '<a href="/guide">Hướng dẫn</a>' +
            '<a href="' + esc(fb) + '" target="_blank" rel="noopener">Facebook</a>' +
            '<a href="mailto:' + esc(email) + '">Email</a>' +
            '<a href="' + esc(survey) + '" target="_blank" rel="noopener" title="Khảo sát truyện bạn muốn đọc tiếp">Khảo sát truyện</a>' +
          '</p>' +
          /* bộ icon Solar (480 Design) là CC BY 4.0 — bắt buộc ghi công */
          '<p class="fcred">Icon: <a href="https://iconbuddy.com/solar" target="_blank" rel="noopener">Solar · 480 Design</a> (CC BY 4.0)</p>' +
        '</div>' +
      '</div></div>';
  }
  function mountShell(opt) {
    opt = opt || {};
    if (d.getElementById('hdr')) mountHeader(d.getElementById('hdr'), opt.active);
    if (d.getElementById('ftr')) mountFooter(d.getElementById('ftr'));
  }

  /* -- tìm kiếm nổi (Ctrl+K) ------------------------------------------- */
  var jumpMounted = false, jumpList = [], jumpCur = 0;
  function openJump() {
    var box = d.getElementById('czJumpBox');
    if (!box) {
      box = d.createElement('div');
      box.id = 'czJumpBox'; box.className = 'jump';
      box.innerHTML = '<div class="scrim"></div><div class="box">' +
        '<div class="q">' + icon('search') +
        '<input id="czJumpInput" placeholder="Tìm truyện, tác giả, couple…" autocomplete="off" spellcheck="false">' +
        '<button class="btn ghost sm" data-close>Esc</button></div>' +
        '<div class="res" id="czJumpRes"></div>' +
        '<div class="foot"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span><kbd>Esc</kbd> đóng</span></div></div>';
      d.body.appendChild(box);
      box.addEventListener('click', function (e) { if (e.target.classList.contains('scrim') || e.target.closest('[data-close]')) close(); });
      var input = box.querySelector('#czJumpInput');
      input.addEventListener('input', function () { paint(input.value); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') return close();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          jumpCur = Math.max(0, Math.min(jumpList.length - 1, jumpCur + (e.key === 'ArrowDown' ? 1 : -1)));
          paintLast();
        }
        if (e.key === 'Enter') {
          var a = box.querySelectorAll('#czJumpRes a')[jumpCur];
          if (a) location.href = a.getAttribute('href');
        }
      });
      box._close = close;
      jumpMounted = true;
    }
    function close() {
      if (!box.classList.contains('on')) return;
      box.classList.add('closing');                                     /* nhịp đóng 150ms */
      setTimeout(function () {
        box.classList.remove('on'); box.classList.remove('closing');
        d.body.classList.remove('noscroll');
      }, ms('--t-close', 150));
    }
    box.classList.add('on');
    d.body.classList.add('noscroll');
    var inp = box.querySelector('#czJumpInput');
    inp.value = ''; paint('');
    setTimeout(function () { inp.focus(); }, 40);
    if (!memo.reg) registry().then(function () { paint(inp.value); });
  }
  function paint(q) {
    var box = d.getElementById('czJumpBox'); if (!box) return;
    var res = box.querySelector('#czJumpRes');
    var ql = String(q || '').trim().toLowerCase();
    var lib = libList();
    function score(n) {
      var t = n.title.toLowerCase(), s = 0;
      if (!ql) return 1;
      if (t.indexOf(ql) === 0) s += 6;
      else if (t.indexOf(ql) >= 0) s += 4;
      if (String(n.author || '').toLowerCase().indexOf(ql) >= 0) s += 2;
      if (String(n.couple || '').toLowerCase().indexOf(ql) >= 0) s += 2;
      if (String(n.year || '').indexOf(ql) >= 0) s += 1;
      return s;
    }
    jumpList = lib.map(function (n) { return { n: n, s: score(n) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || (b.n.chapters - a.n.chapters); })
      .slice(0, 24).map(function (x) { return x.n; });
    jumpCur = 0;
    res.innerHTML = jumpList.length ? jumpList.map(function (n, i) {
      return '<a href="' + esc(storyURL(n.slug)) + '" class="' + (i === 0 ? 'on' : '') + '">' +
        (n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy">' : '<img alt="">') +
        '<span><b>' + esc(n.title) + '</b><span>' + esc(n.author || '') +
        (n.couple ? ' · ' + esc(n.couple) : '') + ' · ' + esc(countText(n)) + '</span></span></a>';
    }).join('') : '<div class="empty" style="border:0;background:none">Không tìm thấy truyện nào khớp “' + esc(q) + '”.</div>';
  }
  function paintLast() {
    var box = d.getElementById('czJumpBox'); if (!box) return;
    var as = box.querySelectorAll('#czJumpRes a');
    Array.prototype.forEach.call(as, function (a, i) { a.classList.toggle('on', i === jumpCur); });
    if (as[jumpCur]) as[jumpCur].scrollIntoView({ block: 'nearest' });
  }

  /* ======================= 7c. BÌNH LUẬN (dùng chung) ======================
     Một khung bình luận tái sử dụng: trang truyện (tab "Đánh giá") và NGAY TRONG
     TRANG ĐỌC đều gọi chung hàm này, nên không còn cảnh phải thoát trang đọc mới
     bình luận được. Có lọc theo chương, đếm số, xoá bình luận của mình (quản trị
     xoá được của người khác), và tự hiện nút đăng nhập khi chưa đăng nhập.      */
  var CMT = (function () {
    var seq = 0;
    function mount(host, opt) {
      opt = opt || {};
      if (!host) return null;
      var id = 'czc' + (++seq);
      var slug = String(opt.slug || '');
      var chap = Math.max(0, parseInt(opt.ch, 10) || 0);
      /* chLabel: chữ hiện cho người đọc ("Chương 1", "Ngoại truyện 2"…). Số `chap` chỉ là
         vị trí trong kho chương nên không phải lúc nào cũng trùng tên chương thật. */
      var chLabel = String(opt.chLabel || '').trim();
      function chWord() { return chLabel || (chap ? 'chương ' + chap : ''); }
      var state = { all: [], byChap: {}, filter: chap > 0 && opt.chapterFilter !== false ? 'chap' : 'all', busy: false, count: 0, replyTo: '' };

      function u() { return (w.CZ_AUTH && w.CZ_AUTH.current && w.CZ_AUTH.current()) || null; }
      function tk() { return (w.CZ_AUTH && w.CZ_AUTH.token && w.CZ_AUTH.token()) || ''; }
      function base() { return API; }
      function head(txt, n) {
        return '<div class="cmt-head2"><b>' + esc(txt) + '</b>' +
          (n ? '<span class="cmt-n">' + num(n) + '</span>' : '') +
          (opt.hint ? '<span class="cmt-hint">' + esc(opt.hint) + '</span>' : '') + '</div>';
      }
      function filters() {
        if (opt.chapterFilter === false || !chap) return '';
        var nAll = state.count, nCh = Number(state.byChap[String(chap)]) || 0;
        return '<div class="cmt-filters" role="tablist">' +
          '<button class="tab' + (state.filter === 'chap' ? ' on' : '') + '" data-f="chap" role="tab">' + esc(chWord()) +
            (nCh ? ' <span class="ct">' + nCh + '</span>' : '') + '</button>' +
          '<button class="tab' + (state.filter === 'all' ? ' on' : '') + '" data-f="all" role="tab">Tất cả' +
            (nAll ? ' <span class="ct">' + nAll + '</span>' : '') + '</button></div>';
      }
      function ava(o) {
        return o && o.picture
          ? '<img class="cmt-ava" src="' + esc(o.picture) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
          : '<span class="cmt-ava cmt-ava--ph">' + esc(String((o && (o.name || 'B')) || 'B')[0].toUpperCase()) + '</span>';
      }
      function replyForm(c) {
        var me = u();
        var target = c && (c.name || 'Bạn đọc');
        return '<div class="cmt-reply-form" data-reply-form="' + esc(c.id) + '">' +
          '<div class="cmt-reply-label">Trả lời <b>' + esc(target) + '</b></div>' +
          (!me ? '<input class="cmt-name" data-reply-name maxlength="40" placeholder="Tên của bạn (không bắt buộc)" value="' + esc(guestName()) + '">' : '') +
          '<div class="cmt-reply-row"><textarea data-reply-text="' + esc(c.id) + '" maxlength="2000" rows="2" placeholder="Viết câu trả lời…"></textarea>' +
          '<div class="cmt-reply-actions"><span class="cmt-count" data-reply-count="' + esc(c.id) + '">0/2000</span>' +
          '<button class="btn ghost sm" data-reply-cancel="' + esc(c.id) + '" type="button">Huỷ</button>' +
          '<button class="btn pri sm" data-reply-send="' + esc(c.id) + '" type="button">Gửi trả lời</button></div></div>' +
        '</div>';
      }
      function itemHTML(c) {
        var meUser = u();
        var me = meUser && (c.uid === meUser.uid || String(c.uid) === String(meUser.uid));
        var admin = !!(w.CZ_AUTH && w.CZ_AUTH.isAdmin && w.CZ_AUTH.isAdmin());
        return '<div class="cmt-item" data-id="' + esc(c.id) + '">' + ava(c) +
          '<div class="cmt-body"><div class="cmt-h"><b>' + esc(c.name || 'Bạn đọc') + '</b>' +
            (c.guest ? '<span class="cmt-guest" title="Bình luận khi chưa đăng nhập">khách</span>' : '') +
            (c.ch ? '<span class="cmt-ch">chương ' + esc(c.ch) + '</span>' : '') +
            '<span class="cmt-time">' + esc(timeAgo(c.createdAt)) + '</span>' +
            '<button class="cmt-reply" data-reply="' + esc(c.id) + '" type="button">Trả lời</button>' +
            ((me || admin) ? '<button class="cmt-del" data-del="' + esc(c.id) + '" title="Xoá bình luận" aria-label="Xoá bình luận">✕</button>' : '') +
          '</div><div class="cmt-text">' + esc(c.text) + '</div>' +
          (state.replyTo === c.id ? replyForm(c) : '') + '</div></div>';
      }
      function list() {
        var rows = state.filter === 'chap' ? state.all.filter(function (c) { return (Number(c.ch) || 0) === chap; }) : state.all;
        if (!rows.length) {
          return '<div class="cmt-status">' + (state.filter === 'chap'
            ? 'Chưa có bình luận nào cho ' + chWord() + '. Viết câu đầu tiên đi!'
            : 'Chưa có bình luận nào. Hãy là người đầu tiên!') + '</div>';
        }
        var children = {};
        rows.forEach(function (c) {
          var parent = c.parentId ? String(c.parentId) : '';
          (children[parent] || (children[parent] = [])).push(c);
        });
        var roots = rows.filter(function (c) {
          var p = c.parentId ? String(c.parentId) : '';
          return !p || !rows.some(function (x) { return String(x.id) === p; });
        });
        function branch(c, level, path) {
          var id = String(c.id || '');
          if (path[id]) return '';
          var next = Object.assign({}, path); next[id] = true;
          var html = '<div class="cmt-thread' + (level ? ' is-reply' : '') + '">' + itemHTML(c);
          (children[id] || []).forEach(function (child) { html += branch(child, level + 1, next); });
          return html + '</div>';
        }
        return roots.map(function (c) { return branch(c, 0, {}); }).join('');
      }
      /* tên khách được nhớ trong máy để lần sau khỏi gõ lại */
      function guestName() { return safeGet('ssochuz-cmtname') || ''; }
      function form() {
        var me = u();
        if (!me) {
          /* KHÔNG bắt đăng nhập mới được bình luận: trang chưa bật Supabase thì người đọc
             vẫn viết được (bình luận gắn với mã máy ẩn danh). Có tài khoản thì tốt hơn. */
          return '<div class="cmt-form">' + ava({ name: guestName() || 'B' }) +
            '<div class="cmt-field">' +
              '<input class="cmt-name" data-name maxlength="40" placeholder="Tên của bạn (không bắt buộc)" value="' + esc(guestName()) + '">' +
              '<textarea data-text maxlength="2000" rows="' + (opt.compact ? 2 : 3) + '" placeholder="' +
                (chap ? 'Nghĩ gì về ' + chWord() + '…' : 'Viết bình luận…') + ' (tối đa 2000 ký tự)"></textarea>' +
              '<div class="cmt-actions">' +
                '<span class="cmt-meta">Gửi với tên khách · <button class="lk" data-login type="button">đăng nhập để có ảnh đại diện</button></span>' +
                '<span class="cmt-count" data-count>0/2000</span>' +
                '<button class="btn pri sm" data-send type="button">Gửi</button>' +
              '</div>' +
            '</div></div>';
        }
        return '<div class="cmt-form">' + ava(me) +
          '<div class="cmt-field">' +
            '<textarea data-text maxlength="2000" rows="' + (opt.compact ? 2 : 3) + '" placeholder="' +
              (chap ? 'Nghĩ gì về ' + chWord() + '…' : 'Viết bình luận…') + ' (tối đa 2000 ký tự)"></textarea>' +
            '<div class="cmt-actions">' +
              '<span class="cmt-meta"><b>' + esc(me.name || me.email || 'Bạn đọc') + '</b> · ' +
                '<button class="lk" data-editpf type="button">đổi tên/avatar</button> · ' +
                '<button class="lk" data-logout type="button">đăng xuất</button></span>' +
              '<span class="cmt-count" data-count>0/2000</span>' +
              '<button class="btn pri sm" data-send type="button">Gửi</button>' +
            '</div>' +
          '</div></div>';
      }
      function paint() {
        host.innerHTML = '<div class="cmt-wrap' + (opt.compact ? ' cmt-compact' : '') + '" id="' + id + '">' +
          head(opt.title || 'Bình luận', state.filter === 'chap' ? (Number(state.byChap[String(chap)]) || 0) : state.count) +
          filters() +
          '<div data-formbox>' + form() + '</div>' +
          '<div class="cmt-list" data-list>' + (state.busy ? '<div class="cmt-status">Đang tải bình luận…</div>' : list()) + '</div>' +
        '</div>';
        bind();
      }
      function bind() {
        var ta = host.querySelector('[data-text]');
        var cnt = host.querySelector('[data-count]');
        if (ta && cnt) {
          ta.addEventListener('input', function () { cnt.textContent = ta.value.length + '/2000'; });
          ta.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'enter') send();
          });
        }
        host.querySelectorAll('[data-f]').forEach(function (b) {
          b.addEventListener('click', function () { state.filter = b.dataset.f; paint(); });
        });
        var lg = host.querySelector('[data-login]');
        if (lg) lg.addEventListener('click', function () {
          if (w.CZ_AUTH && w.CZ_AUTH.login) w.CZ_AUTH.login().catch(function () {});
        });
        var ep = host.querySelector('[data-editpf]');
        if (ep) ep.addEventListener('click', function () {
          if (w.CZ_AUTH && w.CZ_AUTH.editProfileDialog) w.CZ_AUTH.editProfileDialog().then(function () { paint(); }).catch(function () {});
        });
        var lo = host.querySelector('[data-logout]');
        if (lo) lo.addEventListener('click', function () { if (w.CZ_AUTH) w.CZ_AUTH.logout().then(function () { paint(); }); });
        var sd = host.querySelector('[data-send]');
        if (sd) sd.addEventListener('click', send);
        host.querySelectorAll('[data-reply]').forEach(function (b) {
          b.addEventListener('click', function () {
            state.replyTo = state.replyTo === b.dataset.reply ? '' : b.dataset.reply;
            paint();
            var rt = host.querySelector('[data-reply-text="' + b.dataset.reply + '"]');
            if (rt) rt.focus();
          });
        });
        host.querySelectorAll('[data-reply-cancel]').forEach(function (b) {
          b.addEventListener('click', function () { state.replyTo = ''; paint(); });
        });
        host.querySelectorAll('[data-reply-text]').forEach(function (ta) {
          var id = ta.getAttribute('data-reply-text');
          var cnt = host.querySelector('[data-reply-count="' + id + '"]');
          if (cnt) ta.addEventListener('input', function () { cnt.textContent = ta.value.length + '/2000'; });
          ta.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'enter') sendReply(id);
          });
        });
        host.querySelectorAll('[data-reply-send]').forEach(function (b) {
          b.addEventListener('click', function () { sendReply(b.dataset.replySend); });
        });
        host.querySelectorAll('[data-del]').forEach(function (b) {
          b.addEventListener('click', function () { del(b.dataset.del); });
        });
        /* khi đăng nhập xong ở nơi khác, tự vẽ lại form để không còn là khách */
        if (!host._czAuthBound && w.CZ_AUTH && w.CZ_AUTH.onAuth) {
          host._czAuthBound = true;
          w.CZ_AUTH.onAuth(function () { try { paint(); } catch (e) {} });
        }
      }
      function makePayload(text, nameInput, parentId) {
        var me = u();
        var payload = { text: text, ch: chap, vid: vid() };
        if (parentId) payload.parentId = String(parentId);
        if (me) {
          payload.name = String(me.name || '').trim().slice(0, 40) || guestName();
          var pic = String(me.picture || '').trim();
          if (pic.indexOf('data:') === 0) pic = '';
          if (pic.length > 2000) pic = pic.slice(0, 2000);
          payload.picture = pic;
        } else {
          payload.name = guestName() || (nameInput ? String(nameInput.value || '').trim().slice(0, 40) : '');
        }
        return payload;
      }
      function addSent(j) {
        if (j.comment) {
          state.all.unshift(j.comment);
          state.count = j.count || (state.count + 1);
          var k = String(Number(j.comment.ch) || 0);
          state.byChap[k] = (Number(state.byChap[k]) || 0) + 1;
        }
      }
      function sendReply(parentId) {
        var safeId = String(parentId || '').replace(/[^A-Za-z0-9_-]/g, '');
        var ta = host.querySelector('[data-reply-text="' + safeId + '"]');
        var sd = host.querySelector('[data-reply-send="' + safeId + '"]');
        var nm = host.querySelector('[data-reply-form="' + safeId + '"] [data-reply-name]');
        var text = ta ? String(ta.value || '').replace(/[\r\n\t]+/g, ' ').trim() : '';
        if (!text) { toast('Viết câu trả lời đã rồi hãy gửi', 'err'); if (ta) ta.focus(); return; }
        if (!base()) { toast('Chưa nối Worker (cz-config.js) nên không gửi được trả lời', 'err'); return; }
        if (state.busy) return;
        state.busy = true;
        if (sd) { sd.disabled = true; sd.textContent = 'Đang gửi…'; }
        if (nm && String(nm.value || '').trim()) safeSet('ssochuz-cmtname', String(nm.value).trim().slice(0, 40));
        var token = tk();
        var payload = makePayload(text, nm, safeId);
        fetch(base() + '/api/comments/' + encodeURIComponent(slug), {
          method: 'POST',
          headers: token ? { 'content-type': 'application/json', authorization: 'Bearer ' + token }
                        : { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
            return j;
          });
        }).then(function (j) {
          state.busy = false;
          addSent(j);
          state.replyTo = '';
          paint();
          toast('Đã gửi trả lời', 'ok');
          if (opt.onChanged) opt.onChanged(state.count);
        }).catch(function (e) {
          state.busy = false;
          paint();
          toast(String(e.message || 'Không gửi được trả lời'), 'err');
        });
      }
      function send() {
        var ta = host.querySelector('[data-text]');
        var sd = host.querySelector('[data-send]');
        var text = ta ? String(ta.value || '').replace(/\s+/g, ' ').trim() : '';
        if (!text) { toast('Viết gì đó đã rồi hãy gửi', 'err'); if (ta) ta.focus(); return; }
        if (!base()) { toast('Chưa nối Worker (cz-config.js) nên không gửi được bình luận', 'err'); return; }
        if (state.busy) return;
        state.busy = true;
        if (sd) { sd.disabled = true; sd.textContent = 'Đang gửi…'; }
        var nm = host.querySelector('[data-name]');
        if (nm && String(nm.value || '').trim()) safeSet('ssochuz-cmtname', String(nm.value).trim().slice(0, 40));
        var token = tk();
        var payload = makePayload(text, nm, '');
        fetch(base() + '/api/comments/' + encodeURIComponent(slug), {
          method: 'POST',
          headers: token ? { 'content-type': 'application/json', authorization: 'Bearer ' + token }
                        : { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok || !j.ok) {
              if (r.status === 401 && token) {
                /* token hết hạn hoặc Worker chưa có SUPABASE_URL -> ưu tiên hiển thị
                   LÝ DO thật từ body Worker (bản mới trả kèm nguyên nhân cụ thể),
                   không âm thầm biến thành khách */
                throw new Error(j.error || 'Phiên đăng nhập hết hạn — hãy đăng nhập lại (hoặc kiểm tra cấu hình SUPABASE_URL/SESSION_SECRET trên Worker)');
              }
              throw new Error(j.error || ('HTTP ' + r.status));
            }
            return j;
          });
        }).then(function (j) {
          state.busy = false;
          addSent(j);
          paint();
          toast('Đã gửi bình luận', 'ok');
          if (opt.onChanged) opt.onChanged(state.count);
        }).catch(function (e) {
          state.busy = false;
          paint();
          toast(String(e.message || 'Không gửi được bình luận'), 'err');
        });
      }
      function del(cid) {
        if (!cid) return;
        confirmBox('Xoá bình luận này? Không khôi phục được.', 'Xoá').then(function (ok) {
          if (!ok) return;
          fetch(base() + '/api/comments/' + encodeURIComponent(slug) + '/' + encodeURIComponent(cid), {
            method: 'DELETE', headers: { authorization: 'Bearer ' + tk() }
          }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
              if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
              state.all = state.all.filter(function (c) { return c.id !== cid; });
              state.count = Math.max(0, state.count - 1);
              load(true);
              toast('Đã xoá bình luận', 'ok');
            });
          }).catch(function (e) { toast(String(e.message || 'Không xoá được'), 'err'); });
        });
      }
      function load(keepUI) {
        if (!base()) {
          host.innerHTML = '<div class="cmt-wrap"><div class="cmt-status">Chưa nối Worker (<code>cz-config.js</code>) nên chưa đọc được bình luận.</div></div>';
          return Promise.resolve(0);
        }
        if (!keepUI) { state.busy = true; paint(); }
        /* lấy bình luận:
           · trang truyện (ch=0, chapterFilter false) → chỉ lấy bình luận chung (ch=0)
           · trang đọc (chap>0) → lấy HẾT để có đủ byChapter cho tab “Tất cả”,
             rồi lọc ở client (list()).
           Trước đây dòng này là '?limit=200' + (chap ? '&ch=' : '') → ch rỗng nên
           luôn trả hết, và thiếu giá trị khi chap>0. */
        var q = '?limit=200';
        if (chap === 0 && opt.chapterFilter === false) q += '&ch=0';
        return fetch(base() + '/api/comments/' + encodeURIComponent(slug) + q)
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (j) {
            state.busy = false;
            state.all = (j && j.comments) || [];
            state.byChap = (j && j.byChapter) || {};
            state.count = (j && j.count) || state.all.length;
            paint();
            if (opt.onChanged) opt.onChanged(state.count);
            return state.count;
          })
          .catch(function (e) {
            state.busy = false;
            host.innerHTML = '<div class="cmt-wrap"><div class="cmt-status">Không tải được bình luận: ' + esc(e.message || 'lỗi mạng') + '</div></div>';
            return 0;
          });
      }
      paint();
      load(true);
      return {
        reload: function () { return load(); },
        setChapter: function (c, label) {
          var n = Math.max(0, parseInt(c, 10) || 0);
          if (label) chLabel = String(label).trim();
          if (n === chap) { paint(); return; }
          chap = n;
          state.filter = (chap > 0 && opt.chapterFilter !== false) ? 'chap' : 'all';
          paint();
        },
        chapter: function () { return chap; },
        count: function () { return state.count; },
        host: host
      };
    }
    return { mount: mount };
  })();

  /* ======================= 8. XUẤT RA NGOÀI ============================= */
  var libCache = null;
  function libList() {
    if (libCache) return libCache;
    var reg = memo.reg || {};
    var list = (reg.lib || []).map(norm);
    /* bộ nào lên chương trong 10 ngày gần nhất (so với bộ mới nhất) thì gắn nhãn “Mới” */
    var dates = list.map(function (n) { return String(n.updated || ''); }).sort();
    var top = Date.parse(dates[dates.length - 1] || '');
    if (!isNaN(top)) list.forEach(function (n) {
      var t = Date.parse(n.updated || '');
      n.fresh = !isNaN(t) && (top - t) <= 10 * 864e5;
    });
    libCache = list;
    return list;
  }
  function slides(reg) {
    reg = reg || memo.reg || {};
    var by = {};
    (reg.lib || []).forEach(function (n) { by[n.slug] = n; });
    /* registry chỉ giữ danh sách slug của khối hero — khỏi nhân đôi dữ liệu bộ truyện */
    var s = (reg.slides || []).map(function (x) { return by[typeof x === 'string' ? x : (x && x.slug)]; })
      .filter(Boolean).map(norm);
    if (s.length) return s;
    return (reg.lib || []).map(norm)
      .filter(function (n) { return n.canRead; })
      .sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); })
      .slice(0, 5);
  }
  function editorChoice(reg) {
    reg = reg || memo.reg || {};
    var by = {};
    (reg.lib || []).forEach(function (n) { by[n.slug] = n; });
    var raw = reg.editorChoice || (reg.settings && reg.settings.editorChoice) || [];
    var list = raw.map(function (x) { return by[typeof x === 'string' ? x : (x && x.slug)]; }).filter(Boolean).map(norm);
    return list;
  }
  function donationCfg(reg) {
    reg = reg || memo.reg || {};
    var d = (reg.settings && reg.settings.donation) || {};
    return d;
  }
  /* Cấu hình liên hệ: `email` = nơi nhận thư liên hệ (và là địa chỉ dự phòng khi
     nút Gửi báo lỗi trong trang đọc không gửi được), `form` = link KHẢO SÁT TRUYỆN
     (người đọc chọn truyện muốn web làm tiếp) — không phải nơi báo lỗi nữa. */
  function reportCfg(reg) {
    reg = reg || memo.reg || {};
    var r = (reg.settings && reg.settings.report) || {};
    return { email: r.email || 'chuseoz.ofc@gmail.com', form: r.form || 'https://forms.gle/YW3PvtrNVQ7xt8nCA' };
  }
  function findLib(id) {
    var lib = libList();
    for (var i = 0; i < lib.length; i++) if (lib[i].slug === id || lib[i].title === id) return lib[i];
    return null;
  }
  function statsOf(n) {
    if (!memo.stats || !memo.stats.on || !n) return null;
    var it = memo.stats.items;
    return it[n.slug] || it[String(n.slug || '').toLowerCase()] || (n.postId ? it[n.postId] : null) || null;
  }
  var statsWatchers = [];
  function onStats(fn) {
    if (memo.stats) { fn(memo.stats); return; }
    statsWatchers.push(fn);
    if (statsWatchers.length === 1) {
      stats().then(function (s) { statsWatchers.splice(0).forEach(function (f) { f(s); }); });
    }
  }
  /* ai muốn vẽ lại ngay khi số liệu đổi (bấm thích, đọc chương…) thì đăng ký ở đây */
  var statsListeners = [];
  function onStatsChange(fn) { statsListeners.push(fn); return fn; }
  function notifyStats() {
    var s = memo.stats;
    statsListeners.forEach(function (f) { try { f(s); } catch (e) {} });
    try { w.dispatchEvent(new CustomEvent('cz:stats', { detail: s })); } catch (e) {}
  }

  w.CZ = {
    API: API, normalizeApi: normalizeApi,
    registry: registry, book: book, stats: stats, refreshStats: refreshStats, schedule: schedule,
    vid: vid, reportView: reportView, sendReport: sendReport, vote: vote,
    lib: libList, slides: slides, editorChoice: editorChoice, donationCfg: donationCfg, reportCfg: reportCfg, findLib: findLib, statsOf: statsOf, onStats: onStats,
    progress: progress, setProgress: setProgress, lastReadAt: lastReadAt,
    shelfIds: shelfIds, inShelf: inShelf, toggleShelf: toggleShelf, clearShelf: clearShelf,
    isLiked: isLiked, toggleLike: toggleLike, likedChapters: likedChapters, likedCount: likedCount, likeCount: likeCount,
    marks: marks, toggleMark: toggleMark, chaptersRead: chaptersRead,
    realCount: realCount, reconcileCount: reconcileCount, onStatsChange: onStatsChange, notifyStats: notifyStats,
    rdGet: rdGet, rdSet: rdSet, themeInit: themeInit, themeToggle: themeToggle,
    icon: icon, esc: esc, num: num, dateVN: dateVN, dateShort: dateShort, timeAgo: timeAgo,
    statusCls: statusCls, statusLabel: statusLabel, words: words, norm: norm, countText: countText, listHead: listHead,
    storyURL: storyURL, readURL: readURL, slugify: slugify, qs: qs, copy: copy, download: download,
    card: card, mountRail: mountRail, reveal: reveal, countUp: countUp, scaleFacts: scaleFacts,
    scrollUI: scrollUI, slide: slide, pageFx: pageFx, pop: pop, setIcon: setIcon, shake: shake,
    msWait: function () { return ms('--t-close', 150); }, ink: ink, inkAll: inkAll,
    mountShell: mountShell, mountHeader: mountHeader, mountFooter: mountFooter,
    openJump: openJump, toast: toast, modal: modal, confirm: confirmBox,
    comments: CMT,
    reduce: reduce, hasAPI: !!API,
    _memo: memo, _setLib: function () { libCache = null; }
  };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { CZ.themeInit(); CZ.scrollUI(); CZ.pageFx(); });
  else { CZ.themeInit(); CZ.scrollUI(); CZ.pageFx(); }
})(window, document);
