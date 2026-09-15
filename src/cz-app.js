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
  /* GỬI BÁO LỖI CHỮ: một lần bấm là nội dung đi thẳng tới Worker. Địa chỉ nhận
     thư chỉ nằm trong Secret MAIL_TO/ADMIN_EMAILS phía máy chủ, không gửi xuống
     trình duyệt. Khi mất mạng, giao diện chỉ cho copy nội dung để tránh lộ email. */
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
    themeMeta();
    return t;
  }
  /* Thanh trình duyệt điện thoại tô theo <meta name="theme-color">. Không cập nhật
     nó thì lật sang nền tối mà thanh địa chỉ vẫn trắng — đúng cái cảm giác “lệch
     pha” trong lúc cả trang đang chuyển cảnh. Đọc thẳng TOKEN (không đọc
     backgroundColor đã tính) để lấy màu ĐÍCH ngay trong frame đầu tiên, thay vì
     giá trị đang dở chuyển tiếp; trang đọc thì lấy theo nền đọc (--rd-bg). */
  function themeMeta() {
    var m = d.querySelector('meta[name="theme-color"]');
    if (!m) return;
    var rd = !!(d.body && d.body.classList.contains('reading'));
    var c = '';
    try {
      c = (w.getComputedStyle(rd ? d.body : d.documentElement).getPropertyValue(rd ? '--rd-bg' : '--bg') || '').trim();
    } catch (e) {}
    if (!/^(#|rgb|hsl)/i.test(c)) c = d.documentElement.getAttribute('data-theme') === 'dark' ? '#14110e' : '#faf8f4';
    if (m.getAttribute('content') !== c) m.setAttribute('content', c);
  }
  /* Sáng ⇄ tối: đổi token trên html ngay trong cùng một frame.
     Không dùng View Transitions hoặc transition hàng nghìn phần tử: trình duyệt
     phải chụp lại toàn trang rồi blend, gây trễ rõ trên điện thoại và trang đọc.
     Các thành phần cần chuyển động riêng (nút, menu, switch) vẫn có transition
     cục bộ trong CSS; đổi theme nền tảng thì ưu tiên phản hồi tức thì. */
  function themeToggle() {
    var root = d.documentElement;
    var now = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', now);
    safeSet(LS.theme, now);
    themeMeta();
    return now;
  }

  /* ======================= 3. BỘ ICON ================================== */
  /* Bộ icon SVG từ Tabler Icons (tabler.io) — bộ outline, giấy phép MIT.
     Tất cả icon được nhúng trong mã phát hành, không tải font / CSS / JS
     icon từ bên ngoài. MoMo là hình thương hiệu riêng vì Tabler chưa có icon
     tương ứng. Muốn đổi icon: sửa MAP trong tools/gen_icons_tabler.mjs rồi
     chạy lại: node tools/gen_icons_tabler.mjs */
  var P = {
    search: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /> <path d="M21 21l-6 -6" /></g>',
    book: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /> <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /> <path d="M3 6l0 13" /> <path d="M12 6l0 13" /> <path d="M21 6l0 13" /></g>',
    library: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M7 5.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /> <path d="M4.012 7.26a2.005 2.005 0 0 0 -1.012 1.737v10c0 1.1 .9 2 2 2h10c.75 0 1.158 -.385 1.5 -1" /> <path d="M11 7h5" /> <path d="M11 10h6" /> <path d="M11 13h3" /></g>',
    home: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M5 12l-2 0l9 -9l9 9l-2 0" /> <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /> <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" /></g>',
    trophy: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M8 21l8 0" /> <path d="M12 17l0 4" /> <path d="M7 4l10 0" /> <path d="M17 4v8a5 5 0 0 1 -10 0v-8" /> <path d="M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /></g>',
    calendar: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12" /> <path d="M16 3v4" /> <path d="M8 3v4" /> <path d="M4 11h16" /> <path d="M11 15h1" /> <path d="M12 15v3" /></g>',
    film: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" /> <path d="M8 4l0 16" /> <path d="M16 4l0 16" /> <path d="M4 8l4 0" /> <path d="M4 16l4 0" /> <path d="M4 12l16 0" /> <path d="M16 8l4 0" /> <path d="M16 16l4 0" /></g>',
    tv: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9" /> <path d="M16 3l-4 4l-4 -4" /></g>',
    users: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /> <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /> <path d="M16 3.13a4 4 0 0 1 0 7.75" /> <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></g>',
    pen: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /> <path d="M13.5 6.5l4 4" /></g>',
    play: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M7 4v16l13 -8l-13 -8" /></g>',
    bookmark: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4" /></g>',
    shelf: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M15 10v11l-5 -3l-5 3v-11a3 3 0 0 1 3 -3h4a3 3 0 0 1 3 3" /> <path d="M11 3h5a3 3 0 0 1 3 3v11" /></g>',
    user: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /> <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></g>',
    logout: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /> <path d="M9 12h12l-3 -3" /> <path d="M18 15l3 -3" /></g>',
    shield: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></g>',
    pulse: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 12h4.5l1.5 -6l4 12l2 -9l1.5 3h4.5" /></g>',
    inbox: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" /> <path d="M4 13h3l3 3h4l3 -3h3" /></g>',
    history: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M12 8l0 4l2 2" /> <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" /></g>',
    wand: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M6 21l15 -15l-3 -3l-15 15l3 3" /> <path d="M15 6l3 3" /> <path d="M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" /> <path d="M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" /></g>',
    heart: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" /></g>',
    share: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M13 4v4c-6.575 1.028 -9.02 6.788 -10 12c-.037 .206 5.384 -5.962 10 -6v4l8 -7l-8 -7" /></g>',
    check: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M5 12l5 5l10 -10" /></g>',
    moon: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008" /></g>',
    sun: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /> <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" /></g>',
    x: '<g stroke-width="1.44" transform="translate(-2.16 -2.16) scale(1.18)"><path d="M18 6l-12 12" /> <path d="M6 6l12 12" /></g>',
    star: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" /></g>',
    fire: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235" /></g>',
    list: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M9 6l11 0" /> <path d="M9 12l11 0" /> <path d="M9 18l11 0" /> <path d="M5 6l0 .01" /> <path d="M5 12l0 .01" /> <path d="M5 18l0 .01" /></g>',
    left: '<g stroke-width="1.2" transform="translate(-5.04 -5.04) scale(1.42)"><path d="M15 6l-6 6l6 6" /></g>',
    right: '<g stroke-width="1.2" transform="translate(-5.04 -5.04) scale(1.42)"><path d="M9 6l6 6l-6 6" /></g>',
    up: '<g stroke-width="1.2" transform="translate(-5.04 -5.04) scale(1.42)"><path d="M6 15l6 -6l6 6" /></g>',
    down: '<g stroke-width="1.2" transform="translate(-5.04 -5.04) scale(1.42)"><path d="M6 9l6 6l6 -6" /></g>',
    gear: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" /> <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></g>',
    expand: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 8v-2a2 2 0 0 1 2 -2h2" /> <path d="M4 16v2a2 2 0 0 0 2 2h2" /> <path d="M16 4h2a2 2 0 0 1 2 2v2" /> <path d="M16 20h2a2 2 0 0 0 2 -2v-2" /></g>',
    thumb: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M7 11v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1h3a4 4 0 0 0 4 -4v-1a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1 -2 2h-7a3 3 0 0 1 -3 -3" /></g>',
    chat: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /> <path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" /></g>',
    alert: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M12 9v4" /> <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0" /> <path d="M12 16h.01" /></g>',
    eye: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /> <path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></g>',
    clock: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /> <path d="M12 7v5l3 3" /></g>',
    menu: '<g stroke-width="1.52" transform="translate(-1.44 -1.44) scale(1.12)"><path d="M4 8l16 0" /> <path d="M4 16l16 0" /></g>',
    plus: '<g stroke-width="1.44" transform="translate(-2.16 -2.16) scale(1.18)"><path d="M12 5l0 14" /> <path d="M5 12l14 0" /></g>',
    trash: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 7l16 0" /> <path d="M10 11l0 6" /> <path d="M14 11l0 6" /> <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /> <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></g>',
    edit: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /> <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415" /> <path d="M16 5l3 3" /></g>',
    refresh: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /> <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></g>',
    download: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /> <path d="M7 11l5 5l5 -5" /> <path d="M12 4l0 12" /></g>',
    upload: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /> <path d="M7 9l5 -5l5 5" /> <path d="M12 4l0 12" /></g>',
    cloud: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878" /></g>',
    key: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0" /> <path d="M15 9h.01" /></g>',
    lock: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6" /> <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /> <path d="M8 11v-4a4 4 0 1 1 8 0v4" /></g>',
    link: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M9 15l6 -6" /> <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" /> <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" /></g>',
    filter: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227" /></g>',
    grid: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" /> <path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" /> <path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" /> <path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" /></g>',
    rows: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M13 5h8" /> <path d="M13 9h5" /> <path d="M13 15h8" /> <path d="M13 19h5" /> <path d="M3 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" /> <path d="M3 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" /></g>',
    info: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /> <path d="M12 9h.01" /> <path d="M11 12h1v4h1" /></g>',
    cloud2: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M9.58 5.548c.24 -.11 .492 -.207 .752 -.286c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 .957 -.383 1.824 -1.003 2.454m-2.997 1.033h-11.343c-2.572 -.004 -4.657 -2.011 -4.657 -4.487c0 -2.475 2.085 -4.482 4.657 -4.482c.13 -.582 .37 -1.128 .7 -1.62" /> <path d="M3 3l18 18" /></g>',
    chart: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 3v18h18" /> <path d="M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M17 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M12 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M10.16 10.62l2.34 2.88" /> <path d="M15.088 13.328l2.837 -4.586" /></g>',
    save: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" /> <path d="M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M14 4l0 4l-6 0l0 -4" /></g>',
    sparkle: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M17.8 19.817l-2.172 1.138a.392 .392 0 0 1 -.568 -.41l.415 -2.411l-1.757 -1.707a.389 .389 0 0 1 .217 -.665l2.428 -.352l1.086 -2.193a.392 .392 0 0 1 .702 0l1.086 2.193l2.428 .352a.39 .39 0 0 1 .217 .665l-1.757 1.707l.414 2.41a.39 .39 0 0 1 -.567 .411l-2.172 -1.138" /> <path d="M6.2 19.817l-2.172 1.138a.392 .392 0 0 1 -.568 -.41l.415 -2.411l-1.757 -1.707a.389 .389 0 0 1 .217 -.665l2.428 -.352l1.086 -2.193a.392 .392 0 0 1 .702 0l1.086 2.193l2.428 .352a.39 .39 0 0 1 .217 .665l-1.757 1.707l.414 2.41a.39 .39 0 0 1 -.567 .411l-2.172 -1.138" /> <path d="M12 9.817l-2.172 1.138a.392 .392 0 0 1 -.568 -.41l.415 -2.411l-1.757 -1.707a.389 .389 0 0 1 .217 -.665l2.428 -.352l1.086 -2.193a.392 .392 0 0 1 .702 0l1.086 2.193l2.428 .352a.39 .39 0 0 1 .217 .665l-1.757 1.707l.414 2.41a.39 .39 0 0 1 -.567 .411l-2.172 -1.138" /></g>',
    clock2: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /> <path d="M12 12l3 2" /> <path d="M12 7v5" /></g>',
    mail: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10" /> <path d="M3 7l9 6l9 -6" /></g>',
    heart_hand: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" /> <path d="M12 6l-3.293 3.293a1 1 0 0 0 0 1.414l.543 .543c.69 .69 1.81 .69 2.5 0l1 -1a3.182 3.182 0 0 1 4.5 0l2.25 2.25" /> <path d="M12.5 15.5l2 2" /> <path d="M15 13l2 2" /></g>',
    donate: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M13 19l-1 1l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 0 1 8.785 4.444" /> <path d="M21 15h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5" /> <path d="M19 21v1m0 -8v1" /></g>',
    copy: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /> <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></g>',
    pencil: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /> <path d="M13.5 6.5l4 4" /></g>',
    book_open: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12" /> <path d="M19 16h-12a2 2 0 0 0 -2 2" /> <path d="M9 8h6" /></g>',
    user_circle: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /> <path d="M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /> <path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" /></g>',
    lock_open: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6" /> <path d="M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /> <path d="M8 11v-5a4 4 0 0 1 8 0" /></g>',
    hourglass: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M6.5 7h11" /> <path d="M6.5 17h11" /> <path d="M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1" /> <path d="M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1" /></g>',
    shield_off: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M17.67 17.667a12 12 0 0 1 -5.67 3.333a12 12 0 0 1 -8.5 -15c.794 .036 1.583 -.006 2.357 -.124m3.128 -.926a11.997 11.997 0 0 0 3.015 -1.95a12 12 0 0 0 8.5 3a12 12 0 0 1 -1.116 9.376" /> <path d="M3 3l18 18" /></g>',
    google: '<g stroke-width="1.6" transform="translate(-0.72 -0.72) scale(1.06)"><path d="M20.945 11a9 9 0 1 1 -3.284 -5.997l-2.655 2.392a5.5 5.5 0 1 0 2.119 6.605h-4.125v-3h7.945" /></g>',
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
  /* Bản rút gọn của một đoạn chữ dài, dùng cho thẻ truyện, hero trang chủ và
     meta description. KHÉP Ở DẤU CÂU khi còn chỗ; không khép được thì mới cắt ở
     khoảng trắng — cắt cứng theo số ký tự (.slice(0, 220)) là thứ đã tạo ra
     những câu đứt ngang giữa một từ trong registry trước đây.
     Cùng một luật với syn_teaser() trong tools/sync_blogger.py. */
  function teaser(text, limit) {
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    var lim = parseInt(limit, 10) || 200;
    if (s.length <= lim) return s;
    var head = s.slice(0, lim);
    var m = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'));
    if (m >= Math.floor(lim * 0.55)) return s.slice(0, m + 1).trim();
    return head.slice(0, head.lastIndexOf(' ')).replace(/[\s,;:·|-]+$/, '') + '…';
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
  /* ký hiệu icon cho từng tình trạng (dùng chung bộ Tabler trong var P):
       done → check (đã xong), run → refresh (đang ra tiếp), soon → hourglass (sắp ra).
     Thẻ lưới chỉ hiện icon (gọn, không đè lên huy hiệu 18+); chữ đầy đủ vẫn nằm
     trong title + aria-label để trỏ chuột và trình đọc màn hình đọc được. */
  var STATUS_ICON = { done: 'check', run: 'refresh', soon: 'hourglass' };
  function statusIcon(s) {
    var k = (s === 'done' || s === 'run' || s === 'soon') ? s : statusCls(s);
    return STATUS_ICON[k] || 'clock';
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
    /* thẻ lưới: tình trạng là KÝ HIỆU TRÒN ở góc trái bìa; “Mới” là BOOKMARK thả
       từ cạnh trên-phải (đuôi cắt chữ V, chữ xếp dọc); 18+ nằm ở hàng chân bìa
       cạnh số chương. Ba thứ ba góc nên không bao giờ chồng nhau.
       Chữ tình trạng đầy đủ vẫn có trong title/aria-label. */
    var stCls = n.statusCls || 'run';
    var stLab = statusLabel(n.statusCls || n.status);
    return '<a class="card" href="' + esc(storyURL(n.slug)) + '" data-t="' + esc(n.title) + '" title="' + esc(n.title) + '">' +
      '<div class="th' + (img ? ' skel' : '') + '">' +
      (img ? '<img src="' + esc(img) + '" alt="Bìa ' + esc(n.title) + '" loading="lazy" decoding="async" width="300" height="450">' : '') +
      '<span class="scrim"></span>' +
      '<span class="stic st-' + stCls + '" title="' + esc(stLab) + '" aria-label="Tình trạng: ' + esc(stLab) + '" role="img">' + icon(STATUS_ICON[stCls] || 'clock', 'i-s') + '</span>' +
      (n.fresh ? '<span class="nw-bookmark"><span>Mới</span></span>' : '') +
      '<span class="foot"><span class="ch">' + esc(countText(n)) + '</span>' +
        (n.is18 ? '<span class="b18">18+</span>' : '') + '</span>' +
      (pct ? '<span class="bar"><i style="width:' + pct + '%"></i></span>' : '') +
      '</div>' +
      '<h3>' + esc(n.title) + '</h3>' +
      /* dòng ngay dưới tên truyện là TÁC GIẢ. Bản cũ ưu tiên couple nên 25 bộ có
         couple bị đề tên cặp đôi thay vì người viết — couple vẫn còn chỗ riêng của
         nó ở bộ lọc, ở hero và trong trang truyện. */
      '<div class="cb">' + esc(n.author || n.couple || '') + '</div>' +
      '</a>';
  }
  /* xem dạng danh sách: mỗi bộ một hàng, đủ thông tin để quyết định mở hay không */
  function cardList(n, img, pg, pct) {
    if (!n || !n.slug) return '<div class="card list off"><span class="cl-main"><span class="cl-top"><b class="cl-t">' + esc((n&&n.title)||'—') + '</b></span><span class="cl-meta">thiếu slug — sửa trong trang quản trị</span></span></div>';
    /* tác giả trước, couple sau — cùng thứ tự với thẻ lưới và với trang truyện */
    var bits = [n.author, n.couple, n.year].filter(Boolean);
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
        /* scaleX chứ không phải width: ghi width mỗi khung hình vừa bắt layout lại
           vừa biến lần đọc scrollHeight ở khung kế thành đọc-cưỡng-bức. */
        if (bar) bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, Math.max(0, y / h)) : 0) + ')';
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
      fill.style.transform = 'scaleX(.1)'; fill.style.opacity = '1';
      requestAnimationFrame(function () { fill.style.transform = 'scaleX(.64)'; });
      setTimeout(function () {
        fill.style.transform = 'scaleX(1)';
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
      fill.style.opacity = '1'; fill.style.transform = 'scaleX(.92)';
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
    /* vị trí bằng translate3d (compositor); cỡ vẫn đặt width/height vì khung này
       có viền 1px + bo góc, scale không đều sẽ làm viền méo. */
    iv.style.transform = 'translate3d(' + on.offsetLeft + 'px,' +
      (bar2 ? (el.offsetHeight - 2) : on.offsetTop) + 'px,0)';
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
    /* Một nhãn dùng chung cho header desktop, menu mobile và tiêu đề các khối
       trên trang. Trước đây desktop dùng tên rút gọn còn mobile dùng `vi`, nên
       cùng một điểm đến lại hiện hai cách gọi khác nhau. */
    var NAV = [
      { k: 'library', label: 'Thư viện', i: 'library', h: '/#thu-vien' },
      { k: 'new', label: 'Mới cập nhật', i: 'sparkle', h: '/#moi-cap-nhat' },
      { k: 'rank', label: 'Bình chọn nhiều nhất', i: 'trophy', h: '/#bxh' },
      { k: 'sched', label: 'Lịch ra chương', i: 'calendar', h: '/#lich' }
    ];
    var links = NAV.map(function (n) {
      return '<a href="' + n.h + '" data-k="' + n.k + '"' + (n.k === active ? ' class="on"' : '') + ' title="' + esc(n.label) + '" aria-label="' + esc(n.label) + '">' +
        icon(n.i, 'i-s') + '<span class="nav-lbl">' + esc(n.label) + '</span></a>';
    }).join('');
    var mLinks = NAV.map(function (n) {
      return '<a href="' + n.h + '" data-k="' + n.k + '"' + (n.k === active ? ' class="on"' : '') + ' aria-label="' + esc(n.label) + '">' +
        icon(n.i, 'i-s') + ' ' + esc(n.label) + '</a>';
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
      '<a href="/#ban-doc">' + icon('shelf', 'i-s') + ' My Space</a>' +
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
       · Mục "Quản trị" chỉ hiện khi Worker trả admin:true sau khi xác thực;
         danh sách email quản trị không nằm trong mã web. */
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
            '<a href="/#ban-doc" role="menuitem">' + icon('shelf', 'i-s') + 'Tủ truyện</a>' +
            '<a href="/#ban-doc" role="menuitem">' + icon('clock', 'i-s') + 'Đang đọc dở</a>' +
            (ad ? '<a href="/admin" role="menuitem" class="adm">' + icon('gear', 'i-s') + 'Quản trị</a>' : '') +
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
      /* .nav .ink có nền 100px: scaleX(w/100) cho đúng độ dài, không animate width */
      ink.style.transform = 'translateX(' + el.offsetLeft + 'px) scaleX(' + (el.offsetWidth / 100) + ')';
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
  /* Chân trang nền tối: logo (đồng bộ đầu trang) + câu cảm ơn + 3 liên kết,
     dồn cột trái. Nền tối CỐ ĐỊNH ở cả hai tông sáng/tối để luôn giống mẫu. */
  function mountFooter(host) {
    if (!host) return;
    host.className = 'ftr';
    var cfg = reportCfg();
    var fb = 'https://www.facebook.com/profile.php?id=61592803761987';
    var survey = cfg.form || 'https://forms.gle/YW3PvtrNVQ7xt8nCA';
    host.innerHTML = '<div class="in">' +
      '<a class="logo" href="/" title="ssochuz library"><span class="dot"></span>ssochuz<i>library</i></a>' +
      '<p class="fthanks">Cảm ơn bạn đã ủng hộ và đồng hành cùng ssochuz library!</p>' +
      '<nav class="flinks" aria-label="Trợ giúp và kênh liên lạc">' +
        '<a href="/guide">Hướng dẫn</a>' +
        '<a href="' + esc(fb) + '" target="_blank" rel="noopener">Facebook</a>' +
        '<a href="' + esc(survey) + '" target="_blank" rel="noopener">Khảo sát truyện</a>' +
      '</nav>' +
    '</div>';
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
  /* Cấu hình công khai chỉ còn link khảo sát. Email nhận báo lỗi nằm trong Secret
     MAIL_TO/ADMIN_EMAILS của Worker và tuyệt đối không đi vào registry/frontend. */
  function reportCfg(reg) {
    reg = reg || memo.reg || {};
    var r = (reg.settings && reg.settings.report) || {};
    return { form: r.form || 'https://forms.gle/YW3PvtrNVQ7xt8nCA' };
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
    rdGet: rdGet, rdSet: rdSet, themeInit: themeInit, themeToggle: themeToggle, themeMeta: themeMeta,
    icon: icon, esc: esc, num: num, dateVN: dateVN, dateShort: dateShort, timeAgo: timeAgo, teaser: teaser,
    statusCls: statusCls, statusLabel: statusLabel, statusIcon: statusIcon, words: words, norm: norm, countText: countText, listHead: listHead,
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
