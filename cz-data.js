/* ============================================================================
   chuseoz — lớp dữ liệu dùng chung cho mọi trang (index / reader / admin)
   ----------------------------------------------------------------------------
   Thứ tự ưu tiên:
     1. Worker Cloudflare (window.CZ_API)  → dữ liệu mới nhất, sửa là thấy ngay
     2. Bản cache trong máy (localStorage) → mở trang tức thì / dùng khi mất mạng
     3. File tĩnh /data/*.json trong repo  → luôn có, không bao giờ trắng trang
   Số liệu đọc/bình chọn: chỉ lấy từ Firebase thật. Không đọc được thì trả null,
   KHÔNG bịa số.
   ============================================================================ */
(function (w) {
  'use strict';
  function normalizeApi(u) {
    u = String(u || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;   /* thiếu https:// thì tự thêm */
    return u;
  }
  var API = normalizeApi(w.CZ_API);
  var LS_REG = 'chuseoz-reg-v1';
  var LS_STATS = 'chuseoz-stats-v1';
  var TTL_REG = 6 * 3600 * 1000;   /* cache registry 6h khi không có Worker */
  var TTL_STATS = 10 * 60 * 1000;  /* số liệu sống 10 phút */
  var memo = { reg: null, books: {}, stats: null };

  function jget(url, ms) {
    var ctl = null, to = null;
    var opt = {};
    if (w.AbortController && ms !== -1) { ctl = new w.AbortController(); opt.signal = ctl.signal; to = setTimeout(function () { ctl.abort(); }, ms || 8000); }
    return fetch(url, opt).then(function (r) {
      if (to) clearTimeout(to);
      if (!r.ok) return null;
      return r.json();
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
  function newer(a, b) {  /* lấy bản có rev mới hơn */
    if (!a) return b; if (!b) return a;
    return revNum(a) >= revNum(b) ? a : b;
  }

  /* ---- registry: dữ liệu toàn thư viện ---- */
  function registry() {
    if (memo.reg) return Promise.resolve({ reg: memo.reg, src: memo.src || 'cache' });
    var cached = lsGet(LS_REG, TTL_REG);
    var apiP = API ? jget(API + '/api/registry?_=' + Date.now(), 9000) : Promise.resolve(null);
    return apiP.then(function (api) {
      if (api && api.lib) {
        memo.reg = api; memo.src = 'kv'; w.CZ_SRC = 'kv';
        lsSet(LS_REG, { t: Date.now(), v: api });
        return { reg: api, src: 'kv' };
      }
      return jget('/data/registry.json', 9000).then(function (stat) {
        var reg = newer(stat, cached) || { lib: [] };
        if (stat) lsSet(LS_REG, { t: Date.now(), v: stat });
        memo.reg = reg; memo.src = 'static'; w.CZ_SRC = 'static';
        return { reg: reg, src: 'static' };
      });
    });
  }

  /* ---- 1 bộ truyện (các chương) ---- */
  function book(slug) {
    if (memo.books[slug]) return Promise.resolve(memo.books[slug]);
    var apiP = API ? jget(API + '/api/book/' + encodeURIComponent(slug), 12000) : Promise.resolve(null);
    return apiP.then(function (b) {
      if (b && b.chapters) { memo.books[slug] = b; return b; }
      return jget('/data/book/' + encodeURIComponent(slug) + '.json', 15000).then(function (s) {
        if (s) memo.books[slug] = s;
        return s;
      });
    });
  }

  /* ---- số liệu thật (Firebase) ---- */
  function fbVal(v) {
    if (v == null) return null;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.timestampValue !== undefined) return v.timestampValue;
    return null;
  }
  function fromFirestore(project) {
    return jget('https://firestore.googleapis.com/v1/projects/' + (project || 'chuseoz-library') +
      '/databases/(default)/documents/novelData?pageSize=300', 9000).then(function (d) {
      if (!d || !d.documents || !d.documents.length) return null;
      var items = {};
      d.documents.forEach(function (doc) {
        var key = decodeURIComponent(doc.name.split('/').pop()).replace(/\.html$/, '');
        var slug = key.split('/').filter(Boolean).pop() || key;
        var f = {};
        Object.keys(doc.fields || {}).forEach(function (k) { f[k] = fbVal(doc.fields[k]); });
        var rec = {
          views: f.views || 0, votes: f.votes || 0, chapterCount: f.chapterCount || 0,
          lastChapterTitle: f.lastChapterTitle || '', updatedAt: f.updatedAt || 0, trendingScore: f.trendingScore || 0
        };
        items[slug] = rec;
        try { lc(items, key, rec); } catch (e) {}
        function lc(o, k, r) { o[String(k).toLowerCase()] = r; }
      });
      return { ok: true, items: items, source: 'firebase' };
    });
  }
  function stats() {
    if (memo.stats) return Promise.resolve(memo.stats);
    var cached = lsGet(LS_STATS, TTL_STATS);
    var apiP = API ? jget(API + '/api/stats', 9000) : Promise.resolve(null);
    return apiP.then(function (d) {
      if (d && d.ok && d.items && Object.keys(d.items).length) {
        var o = { ok: true, items: d.items, source: d.source || 'firebase', fetchedAt: d.fetchedAt };
        memo.stats = o; lsSet(LS_STATS, { t: Date.now(), v: o });
        return o;
      }
      if (w.CZ_STATS_DIRECT === false) return cached;
      return fromFirestore(w.CZ_FIREBASE_PROJECT).then(function (f) {
        if (f) { memo.stats = f; lsSet(LS_STATS, { t: Date.now(), v: f }); return f; }
        return cached;   /* có thể là bản cũ trong máy; không có thì trả null */
      });
    });
  }

  /* ---- lịch ra chương ---- */
  function schedule() {
    var apiP = API ? jget(API + '/api/schedule', 9000) : Promise.resolve(null);
    return apiP.then(function (d) {
      if (d && d.items) return d;
      return registry().then(function (r) { return (r.reg && r.reg.schedule) || null; });
    });
  }

  /* ---- tiến độ đọc (thật, lưu trong máy) ---- */
  function progressKey(n) { return 'chuseoz-prog-' + ((n && (n.postId || n.slug)) || 'x'); }
  function progressOf(n) {
    var keys = [n.postId, n.slug].filter(Boolean);
    for (var i = 0; i < keys.length; i++) {
      var v = parseInt(localStorage.getItem('chuseoz-prog-' + keys[i]) || '0', 10);
      if (v) return v;
    }
    return 0;
  }
  function setProgress(slug, id, n) {
    try { localStorage.setItem('chuseoz-prog-' + (id || slug), String(n)); } catch (e) {}
  }

  w.CZ = {
    API: API, normalizeApi: normalizeApi, registry: registry, book: book, stats: stats, schedule: schedule,
    progressOf: progressOf, setProgress: setProgress, progressKey: progressKey,
    hasAPI: !!API
  };
})(window);
