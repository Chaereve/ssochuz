/* ============================================================================
   chuseoz · lõi dùng chung cho MỌI trang (chủ / truyện / đọc / quản trị)
   ----------------------------------------------------------------------------
   Gồm 4 phần, không phụ thuộc thư viện ngoài:
     1. DỮ LIỆU   : Worker KV → cache máy → /data/*.json ; số liệu CHỈ từ Firebase
     2. GHI NHỚ   : tiến độ đọc, tủ truyện, thích, đánh dấu, cài đặt đọc, sáng/tối
     3. GIAO DIỆN : bộ icon, thẻ truyện, đầu trang/chân trang, tìm kiếm nổi,
                    toast, hộp thoại, hiệu ứng cuộn
     4. TIỆN ÍCH  : esc, định dạng ngày/số, đường dẫn truyện/đọc
   Mọi trang chỉ cần nạp 2 file:  cz-config.js  →  cz-app.js
   ========================================================================== */
(function (w, d) {
  'use strict';

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
    var cached = lsGet('chuseoz-reg', TTL_REG);
    var useApi = !!API && !apiDown;
    var p = useApi ? jget(API + '/api/registry?_=' + Date.now(), 9000) : Promise.resolve(null);
    return p.then(function (api) {
      if (api && api.lib) {
        apiDown = false;
        memo.reg = api; memo.src = 'kv'; w.CZ_SRC = 'kv';
        lsSet('chuseoz-reg', { t: Date.now(), v: api });
        return { reg: api, src: 'kv' };
      }
      if (useApi) apiDown = true;
      return jget('/data/registry.json?_=' + Date.now(), 9000).then(function (stat) {
        var reg = newer(stat, cached) || { lib: [] };
        if (stat) lsSet('chuseoz-reg', { t: Date.now(), v: stat });
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
      .then(function (b) { memo.books[slug] = b || null; return b || null; })
      .catch(function () { memo.books[slug] = null; return null; });
    memo.books[slug] = p;
    return p;
  }
  /* -- số liệu THẬT (Firebase) — không đọc được thì KHÔNG bịa số -------- */
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
    var cached = lsGet('chuseoz-stats', TTL_STATS);
    var p = (API ? jget(API + '/api/stats', 9000) : Promise.resolve(null)).then(function (r) {
      if (r && r.ok && r.items && Object.keys(r.items).length) {
        return { on: true, items: r.items, source: r.source || 'firebase', saved: r.fetchedAt || r.saved || '' };
      }
      if (w.CZ_STATS_DIRECT === false) return null;
      return fromFirestore();
    });
    return p.then(function (o) {
      if (o && o.on && o.items && Object.keys(o.items).length) {
        memo.stats = o; lsSet('chuseoz-stats', { t: Date.now(), v: o });
        return o;
      }
      if (cached && cached.items && Object.keys(cached.items).length) {
        var st = { on: true, items: cached.items, source: cached.source || 'cache', stale: true };
        memo.stats = st;
        return st;
      }
      memo.stats = { on: false, items: {}, err: 'chưa đọc được số liệu Firebase (quyền đọc đang chặn)' };
      return memo.stats;
    });
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
    prog: 'chuseoz-prog-', when: 'chuseoz-when-', shelf: 'chuseoz-shelf',
    like: 'chuseoz-like-', mark: 'chuseoz-mark-', read: 'chuseoz-reader', theme: 'chuseoz-theme', dir: 'chuseoz-dir'
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

  /* thích / đánh dấu chương */
  function isLiked(n) { return !!n && safeGet(LS.like + n.slug) === '1'; }
  function toggleLike(n) { var on = !isLiked(n); safeSet(LS.like + n.slug, on ? '1' : '0'); return on; }
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

  /* cài đặt đọc */
  var RD_DEF = { mode: 'scroll', size: 18, font: 'serif', line: 1.85, para: 1.05, theme: 'kem', width: 720, justify: 0 };
  function rdGet() { var cur=jsonGet(LS.read, {})||{}; if(cur && cur.font && ['roboto','inter','arial','times','georgia','serif','sans'].indexOf(cur.font)<0){ cur.font='serif'; } return Object.assign({}, RD_DEF, cur); }
  function rdSet(o) { var v = Object.assign(rdGet(), o || {}); jsonSet(LS.read, v); return v; }

  /* sáng / tối (mặc định: nền giấy sáng) */
  function themeInit() {
    var t = safeGet(LS.theme);
    if (!t) { var old = safeGet(LS.dir); t = old === 'ctoi' ? 'dark' : old ? 'light' : 'light'; }
    d.documentElement.setAttribute('data-theme', t);
    return t;
  }
  function themeToggle() {
    var now = d.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    d.documentElement.setAttribute('data-theme', now);
    safeSet(LS.theme, now);
    return now;
  }

  /* ======================= 3. BỘ ICON ================================== */
  var P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M19 18v3H6.5A2.5 2.5 0 0 1 4 18.5"/>',
    library: '<path d="M4 4h5v16H4zM15 4h5v16h-5zM9 8h6M9 16h6"/>',
    home: '<path d="m4 10.5 8-6.5 8 6.5V20H4z"/><path d="M9.5 20v-6h5v6"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H5a2 2 0 0 0 2 4M17 6h2a2 2 0 0 1-2 4"/><path d="M12 14v3M9 20h6M10 17h4"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    film: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M8 4.5v15M16 4.5v15M3 12h18M3 8.2h5M3 15.8h5M16 8.2h5M16 15.8h5"/>',
    tv: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="m8.5 3 3.5 4 3.5-4"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.4M17 14.6a5.5 5.5 0 0 1 3.5 5.4"/>',
    pen: '<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5 17.5 10.5"/>',
    play: '<path d="M7 4.5 19 12 7 19.5z"/>',
    bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
    heart: '<path d="M12 20s-7.5-4.4-7.5-9.4A4.1 4.1 0 0 1 12 7.9a4.1 4.1 0 0 1 7.5 2.7c0 5-7.5 9.4-7.5 9.4z"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.3 10.8 15.7 6.7M8.3 13.2l7.4 4.1"/>',
    check: '<path d="m5 13 4.5 4.5L19 7"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    star: '<path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"/>',
    fire: '<path d="M12 21a4 4 0 0 0 4-4c0-2-2-4-4-6-2 2-4 4-4 6a4 4 0 0 0 4 4z"/><path d="M12 3s2 2 2 4"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    left: '<path d="m14 6-6 6 6 6"/>',
    right: '<path d="m10 6 6 6-6 6"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>',
    expand: '<path d="M9 3H4v5M15 3h5v5M9 21H4v-5M15 21h5v-5"/>',
    thumb: '<path d="M7 21V10l5-7 1.2.6a2 2 0 0 1 1 2.3L13.5 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7z"/><path d="M7 10H4v11h3"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
    alert: '<path d="M12 3.5 21 20H3z"/><path d="M12 9v5M12 17h.01"/>',
    eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5 17.5 10.5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>',
    upload: '<path d="M12 20V9m0 0 4 4m-4-4-4 4"/><path d="M5 5h14"/>',
    cloud: '<path d="M7 18a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.6 1.6A3.5 3.5 0 0 1 17.5 18z"/>',
    key: '<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 7-7 2 2-2 2 1.5 1.5-2 2L15.5 11l-2.5 2.5"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    link: '<path d="M10 13a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7L11.5 5.8"/><path d="M14 11a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.1-1.1"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    rows: '<rect x="4" y="5" width="16" height="4" rx="1.5"/><rect x="4" y="15" width="16" height="4" rx="1.5"/><rect x="4" y="10.2" width="16" height="3.6" rx="1.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    cloud2: '<path d="M6 18a3.5 3.5 0 0 1 .5-7A5 5 0 0 1 16 9.5 3.7 3.7 0 0 1 16.5 18z"/>',
    chart: '<path d="M4 20V6M10 20V10M16 20v-7M22 20H2"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 4v5h6V4M8 20v-6h8v6"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    clock2: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5l3 1.5"/>'
  };
  function icon(name, cls) {
    var p = P[name] || P.info;
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
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
  /* chuẩn hoá 1 bộ trong registry thành dạng dùng chung cho mọi trang */
  function norm(n) {
    var o = Object.assign({}, n || {});
    o.title = String(o.title || '').trim();
    o.author = authorFix(o.author);
    o.couple = String(o.couple || '').trim();
    o.chapters = parseInt(o.chapters, 10) || 0;
    o.is18 = !!o.is18;
    o.statusCls = statusCls(o.status);
    o.countLabel = o.countLabel || o.count || (o.chapters ? o.chapters + ' chương' : '0 chương');
    var parts = String(o.countLabel || '').split('/');
    o.declared = parseInt(parts[1], 10) || o.chapters;         /* tổng dự kiến */
    o.url = storyURL(o.slug);
    o.canRead = o.chapters > 0;
    return o;
  }
  /* “10 chương”, hoặc “9/10 chương” khi thẻ truyện ghi tổng dự kiến nhiều hơn số đã đăng */
  function countText(n) {
    if (!n) return '0 chương';
    var c = parseInt(n.chapters, 10) || 0, d = parseInt(n.declared, 10) || c;
    return d > c ? (c + '/' + d + ' chương') : (c + ' chương');
  }

  /* ======================= 5. THÔNG BÁO & HỘP THOẠI ==================== */
  function toastBox() {
    var b = d.getElementById('toasts');
    if (!b) { b = d.createElement('div'); b.id = 'toasts'; b.className = 'toasts'; d.body.appendChild(b); }
    return b;
  }
  function toast(msg, kind) {
    var b = toastBox(), el = d.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = msg;
    b.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .35s'; el.style.opacity = '0'; }, 2800);
    setTimeout(function () { el.remove(); }, 3300);
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
    function close() { m.classList.remove('on'); if (opt.onClose) opt.onClose(); }
    m.innerHTML = '<div class="scrim"></div><div class="box" role="dialog" aria-modal="true">' + html + '</div>';
    m.classList.add('on');
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
      '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(n.status || 'Đang cập nhật') + '</span>' +
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
        '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(n.status || 'Đang cập nhật') + '</span>' +
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
        /* cuộn xuống thì thanh trên trượt đi, cuộn lên là hiện lại (trừ lúc đang mở menu) */
        var dy = y - lastY;
        if (Math.abs(dy) > 6) {
          var menu = d.querySelector('#czMnav.on');
          d.body.classList.toggle('nav-up', !reduce && !menu && dy > 0 && y > 320);
          lastY = y;
        }
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
    if (reduce) { el.classList.toggle('on', open); return open; }
    el.classList.add('slid');
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
    /* thứ tự mục khớp đúng thứ tự trên trang chủ: mới cập nhật → xếp hạng → lịch → thư viện */
    var NAV = [
      { k: 'new', l: 'Mới cập nhật', i: 'sparkle', h: '/#moi-cap-nhat' },
      { k: 'rank', l: 'Xếp hạng', i: 'trophy', h: '/#bxh' },
      { k: 'sched', l: 'Lịch ra chương', i: 'calendar', h: '/#lich' },
      { k: 'library', l: 'Thư viện', i: 'library', h: '/#thu-vien' }
    ];
    var links = NAV.map(function (n) {
      return '<a href="' + n.h + '" data-k="' + n.k + '"' + (n.k === active ? ' class="on"' : '') + '>' +
        icon(n.i, 'i-s') + ' ' + n.l + '</a>';
    }).join('');
    host.className = 'hdr';
    host.innerHTML = '<div class="in">' +
      '<a class="logo" href="/"><span class="dot"></span>chuseoz<i>.</i></a>' +
      '<nav class="nav" id="czNav"><span class="ink" id="czInk" aria-hidden="true"></span>' + links + '</nav>' +
      '<span class="grow"></span>' +
      '<button class="hbtn" id="czJump" title="Tìm truyện (Ctrl/Cmd + K)">' + icon('search', 'i-s') +
        '<span class="searchbtn-txt">Tìm truyện…</span><span class="k">⌘K</span></button>' +
      '<button class="hbtn" id="czAuthBtn" title="Đăng nhập Google">' + icon('users', 'i-s') + '<span class="searchbtn-txt" id="czAuthTxt">Đăng nhập</span></button>' +
      '<button class="hbtn icon" id="czTheme" title="Sáng / Tối" aria-label="Đổi nền sáng tối">' + icon('moon', 'i-s') + '</button>' +
      '<a class="hbtn icon" href="/admin" title="Trang quản trị" aria-label="Trang quản trị">' + icon('gear', 'i-s') + '</a>' +
      '<button class="hbtn icon burger" id="czBurger" aria-label="Mở menu">' + icon('menu', 'i-s') + '</button>' +
      '</div>' +
      '<div class="mnav" id="czMnav">' + links +
      '<a href="/#ban-doc">' + icon('bookmark', 'i-s') + ' Bàn đọc của bạn</a>' +
      '<a href="/admin">' + icon('gear', 'i-s') + ' Trang quản trị</a>' +
      '<a href="#" id="czAuthM">' + icon('users', 'i-s') + ' <span id="czAuthMTxt">Đăng nhập</span></a></div>';

    var tb = host.querySelector('#czTheme');
    function paintTheme() {
      var t = d.documentElement.getAttribute('data-theme');
      tb.innerHTML = icon(t === 'light' ? 'sun' : 'moon', 'i-s');
    }
    paintTheme();
    tb.addEventListener('click', function () { themeToggle(); paintTheme(); });
    // Auth button
    function paintAuth(){
      var au = host.querySelector('#czAuthBtn'), txt = host.querySelector('#czAuthTxt');
      var am = host.querySelector('#czAuthM'), mtxt = host.querySelector('#czAuthMTxt');
      var u = (w.CZ_AUTH && w.CZ_AUTH.current && w.CZ_AUTH.current()) || null;
      if(!au) return;
      if(u){
        if(txt) txt.textContent = (u.name || u.email || 'Bạn').split(' ')[0];
        if(mtxt) mtxt.textContent = u.name || u.email;
        au.title = 'Đã đăng nhập: '+(u.email||u.name)+' — bấm để đăng xuất';
        am.title = au.title;
      } else {
        if(txt) txt.textContent = 'Đăng nhập';
        if(mtxt) mtxt.textContent = 'Đăng nhập';
        au.title = 'Đăng nhập Google (một chạm)';
        if(am) am.title = au.title;
      }
    }
    paintAuth();
    var authBtn = host.querySelector('#czAuthBtn');
    if(authBtn) authBtn.addEventListener('click', function(){
      var u = (w.CZ_AUTH && w.CZ_AUTH.current && w.CZ_AUTH.current()) || null;
      if(u){ w.CZ_AUTH.logout().then(paintAuth); }
      else { w.CZ_AUTH.loginGoogle().then(paintAuth); }
    });
    var authM = host.querySelector('#czAuthM');
    if(authM) authM.addEventListener('click', function(e){
      e.preventDefault();
      var u = (w.CZ_AUTH && w.CZ_AUTH.current && w.CZ_AUTH.current()) || null;
      if(u){ w.CZ_AUTH.logout().then(function(){ paintAuth(); host.querySelector('#czMnav').classList.remove('on'); }); }
      else { w.CZ_AUTH.loginGoogle().then(function(){ paintAuth(); host.querySelector('#czMnav').classList.remove('on'); }); }
    });
    if(w.CZ_AUTH && w.CZ_AUTH.onAuth) w.CZ_AUTH.onAuth(paintAuth);

    navInk(host);
    var mnav = host.querySelector('#czMnav');
    host.querySelector('#czBurger').addEventListener('click', function () {
      slide(mnav);
      d.body.classList.remove('nav-up');
    });
    mnav.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) slide(mnav, false); });
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
  /* chân trang: chỉ còn những gì thật cần — logo, bốn lối vào nội dung, một dòng meta */
  function mountFooter(host) {
    if (!host) return;
    host.className = 'ftr';
    host.innerHTML = '<div class="in">' +
      '<div class="fmain">' +
        '<div class="fcol fbrand">' +
          '<a class="logo" href="/"><span class="dot"></span>chuseoz<i>.</i></a>' +
          '<p class="fdesc">Thư viện truyện chuyển thể — dự án phi lợi nhuận, duy trì vì đam mê.</p>' +
        '</div>' +
        '<div class="fcol">' +
          '<h4>Contact</h4>' +
          '<a href="https://www.facebook.com/profile.php?id=61592803761987" target="_blank" rel="noopener">' + icon('users','i-s') + ' Facebook</a>' +
          '<a href="https://mail.google.com/mail/u/0/?fs=1&tf=cm&to=chuseoz.ofc@gmail.com" target="_blank" rel="noopener">' + icon('share','i-s') + ' chuseoz.ofc@gmail.com</a>' +
          '<a href="https://forms.gle/YW3PvtrNVQ7xt8nCA" target="_blank" rel="noopener">' + icon('edit','i-s') + ' Form khảo sát</a>' +
        '</div>' +
        '<div class="fcol">' +
          '<h4>Follow us</h4>' +
          '<div class="fsocial">' +
            '<a href="https://www.facebook.com/profile.php?id=61592803761987" target="_blank" rel="noopener" title="Facebook">' + icon('users','i-s') + '</a>' +
            '<a href="https://mail.google.com/mail/u/0/?fs=1&tf=cm&to=chuseoz.ofc@gmail.com" target="_blank" rel="noopener" title="Email">' + icon('share','i-s') + '</a>' +
            '<a href="/guide" title="Hướng dẫn">' + icon('info','i-s') + '</a>' +
          '</div>' +
          '<div class="flinks">' +
            '<a href="/guide">Hướng dẫn sử dụng</a>' +
            '<a href="/#thu-vien">Thư viện</a>' +
            '<a href="/#bxh">Xếp hạng</a>' +
            '<a href="/#lich">Lịch ra chương</a>' +
          '</div>' +
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
    function close() { box.classList.remove('on'); d.body.classList.remove('noscroll'); }
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

  w.CZ = {
    API: API, normalizeApi: normalizeApi,
    registry: registry, book: book, stats: stats, schedule: schedule,
    lib: libList, slides: slides, editorChoice: editorChoice, donationCfg: donationCfg, reportCfg: reportCfg, findLib: findLib, statsOf: statsOf, onStats: onStats,
    progress: progress, setProgress: setProgress, lastReadAt: lastReadAt,
    shelfIds: shelfIds, inShelf: inShelf, toggleShelf: toggleShelf, clearShelf: clearShelf,
    isLiked: isLiked, toggleLike: toggleLike, marks: marks, toggleMark: toggleMark, chaptersRead: chaptersRead,
    rdGet: rdGet, rdSet: rdSet, themeInit: themeInit, themeToggle: themeToggle,
    icon: icon, esc: esc, num: num, dateVN: dateVN, dateShort: dateShort, timeAgo: timeAgo,
    statusCls: statusCls, words: words, norm: norm, countText: countText, listHead: listHead,
    storyURL: storyURL, readURL: readURL, slugify: slugify, qs: qs, copy: copy, download: download,
    card: card, mountRail: mountRail, reveal: reveal, countUp: countUp, scaleFacts: scaleFacts,
    scrollUI: scrollUI, slide: slide, pageFx: pageFx, pop: pop, ink: ink, inkAll: inkAll,
    mountShell: mountShell, mountHeader: mountHeader, mountFooter: mountFooter,
    openJump: openJump, toast: toast, modal: modal, confirm: confirmBox,
    reduce: reduce, hasAPI: !!API,
    _memo: memo, _setLib: function () { libCache = null; }
  };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { CZ.themeInit(); CZ.scrollUI(); CZ.pageFx(); });
  else { CZ.themeInit(); CZ.scrollUI(); CZ.pageFx(); }
})(window, document);
