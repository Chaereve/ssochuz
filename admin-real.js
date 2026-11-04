/* ============================================================================
   admin-real.js · LỚP DỮ LIỆU THẬT CHO GIAO DIỆN QUẢN TRỊ MỚI
   ----------------------------------------------------------------------------
   admin.html được sinh từ mockup/ssochuz-admin-mockup.html (giữ nguyên CSS và
   toàn bộ hàm render). File này nạp NGAY SAU script inline, lấy cầu nối
   window.CZ_MOCKUP rồi:

     · đọc/ghi Cloudflare KV qua Worker với header x-admin-key (giống
       src/admin/api.js), lưu URL Worker ở localStorage và khoá ở sessionStorage;
     · đổ registry, bình luận, báo lỗi, phiếu bầu, thống kê, nhật ký, quota
       vào `state` của giao diện → mọi tab hiện DỮ LIỆU THẬT;
     · chặn các data-act GHI để gọi API thật thay vì toast mô phỏng.

   File mockup gốc (mở double-click) KHÔNG nạp file này, nên vẫn là prototype
   an toàn. Không có ADMIN_KEY ⇒ chuyển về màn đăng nhập / chế độ đọc tĩnh.
   ========================================================================== */
(function () {
  'use strict';
  var M = window.CZ_MOCKUP;
  if (!M) return;
  var S = M.state, D = document;
  var REG = { lib: [], slides: [], schedule: { items: [] }, settings: {} };
  var BOOK = null, BOOK_SLUG = '', WRITES = 0, READS = 0, KVINFO = null;
  var CFG = { base: '', key: '' };
  var STARTED = false;

  /* ---------------- 1 · tiện ích ---------------- */
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function norm(v) { v = String(v || '').trim().replace(/\/+$/, ''); if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v; return v; }
  function clone(o) { return JSON.parse(JSON.stringify(o || { lib: [] })); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function nowStamp() { return new Date().toISOString().slice(0, 16).replace('T', ' '); }
  function teaser(t, n) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, n || 220); }
  function textToHtml(t) {
    var raw = String(t || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return '';
    return raw.split(/\n{2,}/).map(function (p) {
      return '<p>' + p.trim().replace(/\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }).filter(function (p) { return p !== '<p></p>'; }).join('\n');
  }
  function slugify(v) {
    return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function touch(reg, note) {
    reg.rev = nowStamp();
    reg.source = { synced: new Date().toISOString(), note: note || 'sửa từ admin ssochuz (giao diện mới)' };
    return reg;
  }
  function replaceArr(a, items) { a.length = 0; items.forEach(function (x) { a.push(x); }); }
  function esc(s) { return M.esc(s); }
  function val(id) { var e = D.getElementById(id); return e ? String(e.value || '') : ''; }
  function checked(id) { var e = D.getElementById(id); return !!(e && e.checked); }
  function say(msg, kind) { M.toast(msg, kind || 'ok'); }
  function fail(e) { say('Lỗi: ' + ((e && e.message) || String(e)), 'bad'); }
  function go(route) { M.navigate(route); }
  function guard(fn) { return function () { Promise.resolve().then(fn).catch(fail); }; }
  var WRAPPED = false;
  function redraw() { if (WRAPPED) window.render(); else redraw(); }
  function findMeta(slug) { return (REG.lib || []).find(function (m) { return m.slug === slug; }); }
  function titleOf(slug) { var m = findMeta(slug); return m ? (m.title || slug) : slug; }
  function couplesOf(m) { return Array.isArray(m.couples) && m.couples.length ? m.couples.join(', ') : (m.couple || ''); }
  function metaToBook(m, i) {
    return {
      id: m.slug, slug: m.slug, t: m.title || m.slug || '', a: m.author || '', c: couplesOf(m),
      st: m.status || 'Đang cập nhật', pub: m.pubStatus || 'published', vis: m.visibility || 'public',
      lock: !!m.lock, adult: !!m.is18, ch: Number(m.chapters) || 0, d: m.updated || '',
      cv: (i % 6) + 1, miss: !m.thumb, thumb: m.thumb || '', year: m.year || '',
      syn: m.synFull || m.syn || ''
    };
  }

  /* ---------------- 2 · Worker API (theo src/admin/api.js) ---------------- */
  CFG.base = norm(lsGet('cz_kv_api'));
  CFG.key = ssGet('cz_kv_key');

  function classify(e) {
    var st = e && (e.status || e.httpStatus);
    var msg = String((e && e.message) || e || '');
    if (st === 401 || st === 403 || /unauthor|forbidden|admin_key|sai.*kho/i.test(msg)) return 'badkey';
    return 'workererr';
  }
  function setConn(c) { S.conn = c; try { redraw(); } catch (e) {} }
  function setQuota() {
    S.quota = WRITES >= 1000 ? 'blocked' : WRITES >= 950 ? 'bad' : WRITES >= 800 ? 'warn' : 'ok';
  }
  function ensureOnline() {
    if (S.conn !== 'online' || !CFG.key) {
      say('Cần nối Worker bằng ADMIN_KEY để ghi dữ liệu thật.', 'bad');
      return false;
    }
    return true;
  }

  async function apiCall(path, opts) {
    opts = opts || {};
    if (!CFG.base) throw new Error('Chưa có URL Worker — vào Đăng nhập / nối Worker.');
    var headers = { 'cache-control': 'no-store' };
    var hasBody = opts.body !== undefined && opts.body !== null;
    if (hasBody && !(opts.body instanceof FormData)) headers['content-type'] = 'application/json';
    if (opts.auth !== false && CFG.key) headers['x-admin-key'] = CFG.key;
    if (opts.importMode) headers['x-import-mode'] = opts.importMode;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var ms = opts.timeout || 12000, timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    try {
      var res = await fetch(CFG.base + path, {
        method: opts.method || 'GET', headers: headers, cache: 'no-store', mode: 'cors',
        signal: ctrl ? ctrl.signal : undefined,
        body: !hasBody ? undefined : (headers['content-type'] === 'application/json' ? JSON.stringify(opts.body) : opts.body)
      });
      var ct = res.headers && res.headers.get ? (res.headers.get('content-type') || '') : '';
      var data = ct.indexOf('application/json') >= 0 ? await res.json().catch(function () { return {}; }) : await res.text().catch(function () { return ''; });
      if (!res.ok || (data && data.ok === false)) {
        var err = new Error((data && data.error) || ('HTTP ' + res.status));
        err.status = res.status; err.payload = data;
        throw err;
      }
      return data;
    } catch (e) {
      if (e && e.name === 'AbortError') { e = new Error('Hết thời gian chờ Worker tại ' + CFG.base); e.kind = 'network'; }
      else if (/Failed to fetch|NetworkError|Load failed/i.test(String((e && e.message) || e))) {
        e = new Error('Không nối được Worker tại ' + CFG.base + ' (CORS, URL sai hoặc Worker chưa deploy).');
        e.kind = 'network';
      }
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }

  /* ---------------- 3 · đổ dữ liệu thật vào state ---------------- */
  function hydrate(reg) {
    REG = reg || { lib: [] };
    var lib = REG.lib || [];
    S.books = lib.map(metaToBook);
    S.picked = lib.slice(0, 3).map(function (m) { return m.slug; });
    if (!S.selectedBook || !S.books.some(function (b) { return b.id === S.selectedBook; }))
      S.selectedBook = S.books.length ? S.books[0].id : null;
    if (S.selectedBook) window.initEditModels(M.getBook(S.selectedBook));
    S.models['st-slug'] = S.books.length ? S.books[0].id : '';
    S.models['hp-text'] = S.hpText || ''; S.models['hp-href'] = S.hpHref || '';
    S.chapterBook = S.selectedBook;

    var slides = Array.isArray(REG.slides) ? REG.slides : [];
    S.slides = slides.slice(0, 8).map(function (x) {
      return { b: (typeof x === 'string' ? x : (x && x.slug) || ''), r: (x && (x.reason || x.note)) || '' };
    });
    var sch = (REG.schedule && Array.isArray(REG.schedule.items)) ? REG.schedule.items : [];
    S.schedule = sch.map(function (x) {
      return { d: x.days || x.day || '', b: x.slug || '', c: x.detail || x.title || '' };
    });
    var ann = (REG.settings && REG.settings.announcement) || {};
    S.hpNote = ann.text || ''; S.hpText = ann.text || ''; S.hpHref = ann.href || '';
    S.migrateResult = '';

    var totalCh = lib.reduce(function (n, m) { return n + (Number(m.chapters) || 0); }, 0);
    var adult = lib.filter(function (m) { return !!m.is18; }).length;
    var missing = lib.filter(function (m) { return !m.thumb || !(m.synFull || m.syn); }).length;
    replaceArr(M.SAMPLE_METRICS, [
      { n: String(lib.length), k: 'Bộ truyện', s: 'KV' },
      { n: String(totalCh), k: 'Chương đã đăng', s: 'KV' },
      { n: String(adult), k: 'Gắn 18+', s: 'KV' },
      { n: String(missing), k: 'Thiếu thông tin', s: 'KV' },
      { n: String(WRITES), k: 'Quota ghi hôm nay', s: 'KV' },
      { n: String(READS), k: 'Lượt đọc KV hôm nay', s: 'KV' }
    ]);
    var issues = [], seen = Object.create(null);
    lib.forEach(function (m) {
      if (seen[m.slug]) issues.push({ t: 'Slug trùng', b: m.title, d: m.slug, lv: 'bad' });
      seen[m.slug] = 1;
      if (!m.thumb) issues.push({ t: 'Thiếu bìa', b: m.title, d: 'chưa có thumb', lv: 'warn' });
      if (!(m.synFull || m.syn)) issues.push({ t: 'Thiếu mô tả', b: m.title, d: 'chưa có syn', lv: 'warn' });
      if (!(Number(m.chapters) > 0)) issues.push({ t: 'Chưa có chương', b: m.title, d: 'chapters = 0', lv: 'warn' });
    });
    replaceArr(M.SAMPLE_ISSUES, issues.slice(0, 12));
  }

  function applyBook(slug, book) {
    BOOK_SLUG = slug; BOOK = book || { chapters: [] };
    var arr = Array.isArray(BOOK.chapters) ? BOOK.chapters : [];
    S.chapters = arr.map(function (c, i) {
      return { t: c.t || ('Chương ' + (i + 1)), b: titleOf(slug), s: c.status || 'published', d: c.at || '', html: c.html || '' };
    });
    S.activeChapter = Math.max(0, Math.min(S.activeChapter || 0, Math.max(0, S.chapters.length - 1)));
    S.chapterStatus = (S.chapters[S.activeChapter] || {}).s || 'published';
    S.editorSeed = M.sanitizeEditorHtml((S.chapters[S.activeChapter] || {}).html || '<p></p>');
    S.chapterBook = slug;
  }
  function loadBook(slug, quiet) {
    if (!slug) return Promise.resolve(null);
    return apiCall('/api/book/' + encodeURIComponent(slug)).then(function (r) {
      var b = (r && r.book && Array.isArray(r.book.chapters)) ? r.book : r;
      applyBook(slug, b);
      if (!quiet) redraw();
      return b;
    });
  }
  function loadStaticBook(slug) {
    if (!slug) return Promise.resolve(null);
    return fetch('/data/book/' + encodeURIComponent(slug) + '.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (b) { if (b) applyBook(slug, b); redraw(); return b; })
      .catch(function () { return null; });
  }

  function loadComments() {
    return apiCall('/api/admin/comments?limit=800').then(function (r) {
      var list = r.comments || r.items || [];
      S.comments = list.map(function (c, i) {
        return {
          id: c.id || ('c' + i), r: c.name || c.uid || 'Bạn đọc', b: titleOf(c.slug),
          txt: c.text || '', d: String(c.createdAt || '').slice(0, 16).replace('T', ' '),
          spam: /https?:\/\/|kiếm tiền|inbox|kiếm thêm/i.test(String(c.text || '')),
          done: false, slug: c.slug || ''
        };
      });
    });
  }
  function loadReports() {
    return apiCall('/api/admin/reports').then(function (r) {
      var list = r.items || r.reports || [];
      S.reports = list.map(function (x, i) {
        return {
          id: x.id || ('r' + i), b: titleOf(x.slug), ch: x.ch ? ('Chương ' + x.ch) : (x.title || ''),
          txt: x.text || x.title || '', by: x.name || x.email || x.by || 'Độc giả',
          date: String(x.createdAt || x.at || '').slice(0, 16).replace('T', ' '), done: !!x.done
        };
      });
      var open = S.reports.filter(function (x) { return !x.done; }).length;
      var spam = S.comments.filter(function (x) { return x.spam; }).length;
      replaceArr(M.SAMPLE_NOTIFS, [
        { t: open + ' báo lỗi chưa xử lý', s: 'Cộng đồng · KV' },
        { t: spam + ' bình luận nghi spam', s: 'Kiểm duyệt · KV' },
        { t: (REG.lib || []).length + ' bộ trong registry', s: 'Cloudflare KV' }
      ]);
    });
  }
  function loadLog() {
    return apiCall('/api/admin/log').then(function (r) {
      var list = r.items || r.log || [];
      replaceArr(M.SAMPLE_LOGS, list.slice(0, 200).map(function (x) {
        return {
          t: String(x.at || '').slice(0, 16).replace('T', ' '), a: x.who || 'admin-key',
          x: x.text || x.action || 'Thao tác', o: x.target || x.text || '—',
          r: x.result === 'bad' ? 'bad' : (x.result === 'warn' ? 'warn' : 'ok')
        };
      }));
    });
  }
  function loadKv() {
    return apiCall('/api/admin/kv').then(function (r) {
      KVINFO = r;
      WRITES = Number(r.writesToday || 0); READS = Number(r.readsToday || 0);
      setQuota();
      var m = M.SAMPLE_METRICS[4], m2 = M.SAMPLE_METRICS[5];
      if (m) m.n = String(WRITES);
      if (m2) m2.n = String(READS);
    });
  }
  function loadStats() {
    return apiCall('/api/admin/stats').then(function (r) {
      var items = r.items || {}, days = r.days || [];
      var pairs = Object.keys(items).map(function (slug) {
        var it = items[slug] || {};
        return { slug: slug, name: titleOf(slug), views: Number(it.views || 0), votes: Number(it.votes || 0), today: Number(it.viewsDay || 0) };
      }).sort(function (a, b) { return b.views - a.views; }).slice(0, 5);
      while (pairs.length < 5) pairs.push({ slug: '', name: '—', views: 0, votes: 0, today: 0 });
      replaceArr(M.SAMPLE_STATS.reads, pairs.map(function (p) { return [p.name, p.views]; }));
      replaceArr(M.SAMPLE_STATS.likes, pairs.map(function (p) { return [p.name, p.votes]; }));
      replaceArr(M.SAMPLE_STATS.voters, pairs.map(function (p) { return [p.name, p.votes]; }));
      replaceArr(M.SAMPLE_STATS.today, pairs.map(function (p) { return [p.name, p.today]; }));
      replaceArr(M.SAMPLE_READS, days.slice(-14).map(function (d) { return Number(d.views || 0); }));
      if (!M.SAMPLE_READS.length) replaceArr(M.SAMPLE_READS, [0]);
    });
  }
  function loadVoters() {
    var slugs = (REG.lib || []).slice(0, 5).map(function (m) { return m.slug; });
    return Promise.all(slugs.map(function (slug) {
      return apiCall('/api/admin/voters?slug=' + encodeURIComponent(slug))
        .then(function (r) {
          var book = (r && (r.book || r.items)) || [];
          var list = Array.isArray(book) ? book : (Array.isArray(book.voters) ? book.voters : []);
          return list.map(function (v) {
            return { k: v.key || v.id || v.name || 'Độc giả', b: titleOf(slug), d: String(v.at || v.t || '').slice(0, 10) };
          });
        }).catch(function () { return []; });
    })).then(function (groups) {
      var flat = []; groups.forEach(function (g) { flat = flat.concat(g); });
      S.votes = flat.slice(0, 60);
    });
  }

  function loadAll() {
    return apiCall('/api/registry').then(function (reg) {
      hydrate(reg); redraw();
      return Promise.allSettled([
        loadComments(), loadReports(), loadStats(), loadLog(), loadKv(), loadVoters(), loadBook(S.selectedBook, true)
      ]);
    }).then(function () { setQuota(); redraw(); });
  }
  function loadStatic() {
    return fetch('/data/registry.json', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Không đọc được /data/registry.json');
      return r.json();
    }).then(function (reg) {
      hydrate(reg);
      S.comments = []; S.reports = []; S.votes = [];
      replaceArr(M.SAMPLE_LOGS, []); replaceArr(M.SAMPLE_NOTIFS, [{ t: 'Chế độ đọc tĩnh · chỉ đọc', s: '/data/registry.json' }]);
      replaceArr(M.SAMPLE_READS, [0]);
      redraw();
      return loadStaticBook(S.selectedBook);
    });
  }
  function reload() {
    if (S.conn === 'static') return loadStatic().catch(fail);
    if (!S.conn || S.conn === 'badkey' || S.conn === 'workererr') { go('dang-nhap'); return Promise.resolve(); }
    return loadAll().then(function () { say('Đã đọc lại dữ liệu thật từ KV.'); }).catch(function (e) { setConn(classify(e)); fail(e); });
  }

  /* ---------------- 4 · ghi dữ liệu thật ---------------- */
  function metaFromForm(base, m, couples) {
    var out = Object.assign({}, base || {});
    var cp = (couples || []).filter(function (x) { return String(x || '').trim(); });
    out.title = m.title || out.title || '';
    out.slug = m.slug || out.slug || '';
    out.author = m.author || '';
    out.couple = cp.join(', ');
    if (cp.length > 1) out.couples = cp.slice(); else delete out.couples;
    out.year = m.year || '';
    out.status = m.status || 'Đang cập nhật';
    out.countLabel = m.countLabel || out.countLabel || '0/—';
    out.is18 = !!m.is18;
    out.updated = m.updated || today();
    out.thumb = m.thumb === undefined ? (out.thumb || '') : m.thumb;
    out.slide = out.thumb;
    out.synFull = m.synopsis || '';
    out.syn = teaser(m.synopsis || out.synFull || out.syn || '', 220);
    out.genre = String(m.genre || out.genre || '').trim();
    out.pubStatus = m.pubStatus || out.pubStatus || 'published';
    out.visibility = m.visibility || out.visibility || 'public';
    out.publishedAt = m.publishedAt || out.publishedAt || '';
    if (out.pubStatus !== 'scheduled' && out.pubStatus === 'published' && !out.publishedAt) out.publishedAt = today();
    delete out.tags;
    return out;
  }
  function writeRegistry(reg, force) {
    var next = touch(clone(reg), 'ghi registry từ admin ssochuz');
    if (force) next.force = true;
    return apiCall('/api/registry', { method: 'PUT', body: next }).then(function () {
      REG = next; WRITES += 1; setQuota(); hydrate(next); redraw();
      return next;
    });
  }

  function realSubmitNew() {
    if (!ensureOnline()) return;
    var t = val('nb-t').trim(), sl = slugify(val('nb-slug') || t), a = val('nb-a').trim();
    M.clearErrors(['nb-t', 'nb-slug', 'nb-a']);
    if (!t) M.setErr('nb-t', 'Tên bộ không được để trống.');
    if (!sl) M.setErr('nb-slug', 'Slug không được để trống.');
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sl)) M.setErr('nb-slug', 'Slug chỉ gồm chữ thường, số và gạch ngang.');
    if (!a) M.setErr('nb-a', 'Tác giả gốc không được để trống.');
    if (S.errors['nb-t'] || S.errors['nb-slug'] || S.errors['nb-a']) { M.focusFirst(['nb-t', 'nb-slug', 'nb-a']); say('Form còn lỗi.', 'bad'); return; }
    if ((REG.lib || []).some(function (m) { return m.slug === sl; })) { say('Slug đã tồn tại: ' + sl, 'bad'); return; }
    var couples = (S.couples.nb || []).filter(function (x) { return String(x || '').trim(); });
    var first = val('nb-chapter').trim();
    var chapters = first ? [{ t: 'Chương 1', html: textToHtml(first), status: 'published' }] : [];
    var meta = metaFromForm({}, {
      title: t, slug: sl, author: a, year: val('nb-year') || String(new Date().getFullYear()),
      status: S.models['nb-st'] || 'Đang cập nhật', countLabel: chapters.length ? '1/1' : '0/—',
      is18: checked('nb-18'), synopsis: val('nb-sum'), pubStatus: S.models['nb-pub'] || 'draft',
      visibility: S.models['nb-vis'] || 'public', thumb: ''
    }, couples);
    meta.chapters = chapters.length;
    var book = { title: t, slug: sl, author: a, couple: meta.couple, chapters: chapters };
    if (meta.couples && meta.couples.length > 1) book.couples = meta.couples.slice();
    var next = clone(REG); next.lib = (next.lib || []).concat([meta]);
    apiCall('/api/book/' + encodeURIComponent(sl), { method: 'PUT', body: book, timeout: 120000 })
      .then(function () { WRITES += 1; return writeRegistry(next); })
      .then(function () {
        Object.keys(S.models).forEach(function (k) { if (k.indexOf('nb-') === 0) delete S.models[k]; });
        S.couples.nb = ['']; S.selectedBook = sl;
        say('Đã tạo bộ “' + t + '” và ghi lên KV.'); go('thu-vien');
      }).catch(fail);
  }

  function realSaveEdit() {
    if (!ensureOnline()) return;
    var oldSlug = S.selectedBook;
    if (!oldSlug) { say('Chọn một bộ trong Thư viện trước.', 'bad'); return; }
    var base = findMeta(oldSlug);
    if (!base) { say('Không tìm thấy bộ trong registry.', 'bad'); return; }
    var t = val('eb-t').trim(), sl = slugify(val('eb-slug') || t), a = val('eb-a').trim();
    M.clearErrors(['eb-t', 'eb-slug', 'eb-a']);
    if (!t) M.setErr('eb-t', 'Tên bộ không được để trống.');
    if (!sl) M.setErr('eb-slug', 'Slug không được để trống.');
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sl)) M.setErr('eb-slug', 'Slug chỉ gồm chữ thường, số và gạch ngang.');
    if (!a) M.setErr('eb-a', 'Tác giả gốc không được để trống.');
    if (S.errors['eb-t'] || S.errors['eb-slug'] || S.errors['eb-a']) { M.focusFirst(['eb-t', 'eb-slug', 'eb-a']); say('Form còn lỗi.', 'bad'); return; }
    if (sl !== oldSlug && (REG.lib || []).some(function (m) { return m.slug === sl; })) { say('Slug mới đã tồn tại: ' + sl, 'bad'); return; }
    var couples = (S.couples.eb || []).filter(function (x) { return String(x || '').trim(); });
    if (!couples.length) couples = String(base.couple || '').split(/,\s*/).filter(Boolean);
    var meta = metaFromForm(base, {
      title: t, slug: sl, author: a, year: val('eb-year') || base.year || '',
      status: S.models['eb-st'] || base.status, countLabel: base.countLabel,
      is18: checked('eb-18'), synopsis: val('eb-sum'), pubStatus: S.models['eb-pub'] || base.pubStatus || 'published',
      visibility: S.models['eb-vis'] || base.visibility || 'public', thumb: base.thumb || '',
      publishedAt: base.publishedAt || ''
    }, couples);
    meta.chapters = Number(base.chapters) || 0;
    var next = clone(REG);
    var idx = (next.lib || []).findIndex(function (m) { return m.slug === oldSlug; });
    if (idx < 0) { say('Registry không còn bộ này.', 'bad'); return; }
    next.lib[idx] = meta;
    function renameRefs(reg, from, to) {
      if (from === to) return;
      ['slides', 'editorChoice'].forEach(function (key) {
        if (!Array.isArray(reg[key])) return;
        reg[key] = reg[key].map(function (x) {
          var s = typeof x === 'string' ? x : (x && x.slug);
          if (s !== from) return x;
          return typeof x === 'string' ? to : Object.assign({}, x, { slug: to });
        });
      });
    }
    var chain;
    if (sl !== oldSlug) {
      chain = apiCall('/api/book/' + encodeURIComponent(oldSlug))
        .then(function (b) {
          var moved = Object.assign({}, b, { slug: sl, title: t, author: a, couple: meta.couple });
          if (meta.couples && meta.couples.length > 1) moved.couples = meta.couples.slice();
          return apiCall('/api/book/' + encodeURIComponent(sl), { method: 'PUT', body: moved, timeout: 120000 });
        })
        .then(function () { WRITES += 1; renameRefs(next, oldSlug, sl); return writeRegistry(next); })
        .then(function () { return apiCall('/api/book/' + encodeURIComponent(oldSlug), { method: 'DELETE' }).catch(function () {}); })
        .then(function () { WRITES += 1; });
    } else chain = writeRegistry(next);
    chain.then(function () {
      S.selectedBook = sl; window.initEditModels(M.getBook(sl));
      say('Đã lưu metadata “' + t + '” lên KV.'); redraw();
    }).catch(fail);
  }

  function realDeleteBook(id) {
    if (!ensureOnline()) return;
    var slug = id || S.selectedBook;
    var b = (REG.lib || []).find(function (m) { return m.slug === slug; });
    if (!b) { say('Không tìm thấy bộ.', 'bad'); return; }
    M.openStrong('Xoá bộ truyện khỏi KV', 'Gõ đúng slug để xoá vĩnh viễn bộ và toàn bộ chương trên KV.', slug, function () {
      var next = clone(REG);
      next.lib = (next.lib || []).filter(function (m) { return m.slug !== slug; });
      apiCall('/api/book/' + encodeURIComponent(slug), { method: 'DELETE' })
        .then(function () { WRITES += 1; return writeRegistry(next, !next.lib.length); })
        .then(function () {
          S.sel.delete(slug);
          if (S.selectedBook === slug) S.selectedBook = (S.books[0] || {}).id || null;
          say('Đã xoá “' + b.title + '” khỏi KV.'); redraw();
        }).catch(fail);
    }, 'Xoá vĩnh viễn');
  }

  function realSetLock(v) {
    if (!ensureOnline()) return;
    var slug = S.selectedBook;
    if (!slug) return;
    var b = M.getBook(slug);
    if (v === 1) {
      var p1 = val('eb-pass'), p2 = val('eb-pass2');
      if (p1.length < 8 || p1 !== p2) { say('Mật mã tối thiểu 8 ký tự và phải khớp nhau.', 'bad'); return; }
      M.openStrong('Đặt / đổi mật mã', 'Ghi mật mã mới lên KV cho bộ này.', 'ĐẶT KHOÁ', function () {
        apiCall('/api/lock/set', { method: 'POST', body: { slug: slug, password: p1 } })
          .then(function () { b.lock = true; say('Đã đặt mật mã trên KV.'); redraw(); }).catch(fail);
      }, 'Đặt khoá');
    } else {
      M.openStrong('Bỏ khoá mật mã', 'Gỡ mật mã khỏi KV. Gõ đúng slug để xác nhận.', slug, function () {
        apiCall('/api/lock/set', { method: 'POST', body: { slug: slug, password: '' } })
          .then(function () { b.lock = false; say('Đã bỏ khoá trên KV.'); redraw(); }).catch(fail);
      }, 'Bỏ khoá');
    }
  }

  function realCloneBook() {
    if (!ensureOnline()) return;
    var src = M.getBook(S.selectedBook);
    var slug = slugify(String(src.slug || '') + '-ban-sao');
    M.openStrong('Nhân bản bộ', 'Tạo bản sao thật trên KV: ' + (src.t || ''), 'NHÂN BẢN', function () {
      apiCall('/api/book/' + encodeURIComponent(src.slug)).then(function (book) {
        var moved = Object.assign({}, book, { slug: slug, title: (src.t || '') + ' (bản sao)' });
        var meta = Object.assign({}, findMeta(src.slug) || {}, { slug: slug, title: moved.title, chapters: (moved.chapters || []).length });
        var next = clone(REG); next.lib = (next.lib || []).concat([meta]);
        return apiCall('/api/book/' + encodeURIComponent(slug), { method: 'PUT', body: moved, timeout: 120000 })
          .then(function () { WRITES += 1; return writeRegistry(next); });
      }).then(function () { say('Đã nhân bản lên KV.'); go('thu-vien'); }).catch(fail);
    }, 'Nhân bản');
  }

  function realSaveChapter() {
    if (!ensureOnline()) return;
    var slug = BOOK_SLUG || S.selectedBook;
    if (!slug) { say('Chọn bộ trước khi lưu chương.', 'bad'); return; }
    var idx = S.activeChapter || 0;
    var title = val('chapterTitle') || (S.chapters[idx] || {}).t || ('Chương ' + (idx + 1));
    var ed = D.getElementById('editor');
    var html = M.sanitizeEditorHtml(ed ? ed.innerHTML : (S.editorSeed || ''));
    var body = { index: idx, chapter: { t: title, html: html, status: S.chapterStatus || 'published', at: S.chapterAt || '' } };
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: body, timeout: 120000 })
      .then(function () {
        WRITES += 1; setQuota();
        if (BOOK && Array.isArray(BOOK.chapters)) BOOK.chapters[idx] = body.chapter;
        if (S.chapters[idx]) { S.chapters[idx].t = title; S.chapters[idx].html = html; S.chapters[idx].s = body.chapter.status; }
        S.editorSeed = html; S.savedAt = new Date().toLocaleTimeString('vi-VN');
        say('Đã lưu chương "' + title + '" lên KV.'); redraw();
      }).catch(fail);
  }
  function realChapterAdd() {
    if (!ensureOnline()) return;
    var slug = BOOK_SLUG || S.selectedBook;
    if (!slug) return;
    var idx = S.chapters.length;
    var ch = { t: 'Chương ' + (idx + 1), html: '<p></p>', status: 'published' };
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { index: idx, chapter: ch } })
      .then(function () {
        WRITES += 1; if (BOOK && Array.isArray(BOOK.chapters)) BOOK.chapters[idx] = ch;
        S.chapters.push({ t: ch.t, b: titleOf(slug), s: 'published', d: '', html: ch.html });
        S.activeChapter = idx; S.chapterStatus = 'published'; S.editorSeed = '<p></p>';
        say('Đã thêm chương trên KV.'); redraw();
      }).catch(fail);
  }
  function realChapterDelete(idx) {
    if (!ensureOnline()) return;
    var slug = BOOK_SLUG || S.selectedBook;
    M.openStrong('Xoá chương khỏi KV', 'Xoá chương · không hoàn tác.', 'XOÁ', function () {
      apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { index: idx, remove: true } })
        .then(function () {
          WRITES += 1; if (BOOK && Array.isArray(BOOK.chapters)) BOOK.chapters.splice(idx, 1);
          S.chapters.splice(idx, 1);
          S.activeChapter = Math.max(0, Math.min(idx, S.chapters.length - 1));
          S.chapterStatus = (S.chapters[S.activeChapter] || {}).s || 'published';
          S.editorSeed = M.sanitizeEditorHtml((S.chapters[S.activeChapter] || {}).html || '<p></p>');
          say('Đã xoá chương trên KV.'); redraw();
        }).catch(fail);
    }, 'Xoá chương');
  }
  function realChapterMove(idx, dir) {
    if (!ensureOnline()) return;
    var to = idx + dir, slug = BOOK_SLUG || S.selectedBook;
    if (to < 0 || to >= S.chapters.length) return;
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { from: idx, to: to } })
      .then(function () {
        WRITES += 1;
        if (BOOK && Array.isArray(BOOK.chapters)) { var t = BOOK.chapters[idx]; BOOK.chapters[idx] = BOOK.chapters[to]; BOOK.chapters[to] = t; }
        var tmp = S.chapters[idx]; S.chapters[idx] = S.chapters[to]; S.chapters[to] = tmp;
        S.activeChapter = to; S.editorSeed = M.sanitizeEditorHtml((S.chapters[to] || {}).html || '<p></p>');
        say('Đã đổi thứ tự chương trên KV.'); redraw();
      }).catch(fail);
  }
  function syncChaptersToState() {
    S.editorSeed = M.sanitizeEditorHtml((S.chapters[S.activeChapter] || {}).html || '<p></p>');
    S.chapterStatus = (S.chapters[S.activeChapter] || {}).s || 'published';
  }

  function realDeleteComment(id) {
    if (!ensureOnline()) return;
    var c = S.comments.find(function (x) { return x.id === id; });
    if (!c) return;
    M.openSimple('Xác nhận lần 1 · xoá bình luận', 'Bước 2 sẽ yêu cầu gõ XOÁ.', function () {
      M.openStrong('Xác nhận lần 2 · xoá bình luận', 'Xoá vĩnh viễn bình luận khỏi KV.', 'XOÁ', function () {
        apiCall('/api/comments/' + encodeURIComponent(c.slug || '') + '/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () { WRITES += 1; S.comments = S.comments.filter(function (x) { return x.id !== id; }); say('Đã xoá bình luận trên KV.'); redraw(); })
          .catch(fail);
      }, 'Xoá vĩnh viễn');
    }, 'Tiếp tục', true);
  }
  function realToggleReport(id) {
    if (!ensureOnline()) return;
    var r = S.reports.find(function (x) { return x.id === id; });
    if (!r) return;
    apiCall('/api/admin/reports', { method: 'PATCH', body: { id: id, done: !r.done } })
      .then(function () { WRITES += 1; r.done = !r.done; say(r.done ? 'Đã đánh dấu xử lý trên KV.' : 'Đã mở lại báo lỗi trên KV.'); redraw(); })
      .catch(fail);
  }
  function realRemoveVotes() {
    if (!ensureOnline()) return;
    if (!S.voteSel.size) { say('Chọn ít nhất một phiếu.', 'warn'); return; }
    var chosen = []; S.voteSel.forEach(function (i) { if (S.votes[i]) chosen.push(S.votes[i]); });
    M.openStrong('Gỡ phiếu đã chọn', 'Gỡ ' + chosen.length + ' phiếu · không hoàn tác.', 'GỠ PHIẾU', function () {
      var slug = S.selectedBook || (REG.lib[0] || {}).slug || '';
      apiCall('/api/admin/vote-remove', { method: 'POST', body: { slug: slug, ch: 0, keys: chosen.map(function (v) { return v.k; }) } })
        .then(function () { WRITES += 1; S.votes = S.votes.filter(function (v, i) { return !S.voteSel.has(i); }); S.voteSel.clear(); say('Đã gỡ phiếu trên KV.'); redraw(); })
        .catch(fail);
    }, 'Gỡ phiếu');
  }
  function realResetVotes() {
    if (!ensureOnline()) return;
    var rc = D.querySelector('[data-role="reset-ch"]');
    var ch = rc ? String(rc.value || '') : '';
    M.openStrong('Reset phiếu bộ này', 'Phiếu về 0' + (ch ? ' ở chương ' + ch : '') + ' · không hoàn tác.', 'RESET', function () {
      apiCall('/api/admin/votes/reset', { method: 'POST', body: { slug: S.selectedBook, ch: ch } })
        .then(function () { WRITES += 1; S.votes = []; S.voteSel.clear(); S.votePage = 1; say('Đã reset phiếu trên KV.'); redraw(); })
        .catch(fail);
    }, 'Reset phiếu');
  }

  function currentRegistryFromState() {
    var next = clone(REG);
    var origSlides = Array.isArray(REG.slides) ? REG.slides : [];
    next.slides = S.slides.map(function (x, i) {
      var base = origSlides[i] || {};
      if (typeof base === 'string') return x.r ? { slug: x.b, reason: x.r } : x.b;
      var out = Object.assign({}, base, { slug: x.b });
      if (x.r) out.reason = x.r; else delete out.reason;
      return out;
    });
    var origItems = (REG.schedule && Array.isArray(REG.schedule.items)) ? REG.schedule.items : [];
    var nextItems = S.schedule.map(function (x, i) {
      return Object.assign({}, origItems[i] || {}, { days: x.d, slug: x.b, detail: x.c, title: (origItems[i] || {}).title || titleOf(x.b) });
    });
    next.schedule = Object.assign({}, REG.schedule || {}, { items: nextItems });
    next.settings = next.settings || {};
    next.settings.announcement = Object.assign({}, next.settings.announcement || {}, {
      enabled: !!(checked('hp-banner') || S.models['hp-banner']),
      text: val('hp-text') || S.hpText || '',
      href: val('hp-href') || S.hpHref || ''
    });
    return next;
  }
  function realSaveHomepage() {
    if (!ensureOnline()) return;
    if (!S.slides.length) { say('Cần ít nhất 1 slide trước khi lưu.', 'bad'); return; }
    if (S.schedule.some(function (x) { return !x.d || !x.b; })) { say('Lịch ra chương còn dòng thiếu thứ hoặc bộ.', 'bad'); return; }
    writeRegistry(currentRegistryFromState()).then(function () { say('Đã lưu trang chủ lên KV.'); }).catch(fail);
  }
  function realSlideChange(kind, idx, dir, el) {
    if (kind === 'add') {
      var sel = D.getElementById('addSlideSel');
      if (sel && S.slides.length < 8) S.slides.push({ b: sel.value, r: '' });
      else { say('Tối đa 8 slide.', 'warn'); return; }
    } else if (kind === 'move') {
      var j = idx + dir;
      if (j >= 0 && j < S.slides.length) { var t = S.slides[idx]; S.slides[idx] = S.slides[j]; S.slides[j] = t; }
    } else if (kind === 'remove') S.slides.splice(idx, 1);
    else if (kind === 'sched-add') S.schedule.push({ d: 'Thứ 5', b: (S.picked[0] || ''), c: '' });
    else if (kind === 'sched-remove') S.schedule.splice(idx, 1);
    writeRegistry(currentRegistryFromState()).then(function () { say('Đã lưu thay đổi trang chủ lên KV.'); }).catch(fail);
  }

  function realBulkApply(el) {
    if (!ensureOnline()) return;
    var act = S.bulkAction;
    if (!act) { say('Chọn một thao tác hàng loạt.', 'warn'); return; }
    if (!S.sel.size) { say('Chọn ít nhất một bộ.', 'warn'); return; }
    var next = clone(REG);
    (next.lib || []).forEach(function (m) {
      if (!S.sel.has(m.slug)) return;
      if (act.indexOf('st:') === 0) m.status = act.slice(3);
      else if (act.indexOf('pub:') === 0) m.pubStatus = act.slice(4);
      else if (act === '18:1') m.is18 = true;
      else if (act === '18:0') m.is18 = false;
    });
    writeRegistry(next).then(function () { say('Đã ghi ' + S.sel.size + ' bộ lên KV.'); }).catch(fail);
  }

  function realRecount() {
    if (!ensureOnline()) return;
    M.openStrong('Đếm lại số chương từ KV', 'Worker sẽ ghi lại registry nếu số chương lệch.', 'ĐẾM LẠI', function () {
      apiCall('/api/recount', { method: 'POST' }).then(function (r) {
        WRITES += 1; setQuota();
        say('Đã đếm lại: ' + ((r && (r.updated || r.fixed || r.count)) || 'xong') + '.');
        return reload();
      }).catch(fail);
    }, 'Đếm lại');
  }
  function realMigrate(only, label) {
    if (!ensureOnline()) return;
    M.openSimple('Chuyển ' + label + ' sang Supabase/R2', 'KV chỉ còn stub; bản đầy đủ nằm ở Supabase/R2.', function () {
      apiCall('/api/admin/migrate-overflow', { method: 'POST', body: { only: only }, timeout: 29000 })
        .then(function (r) {
          S.migrateResult = 'Đã chuyển: ' + (r.books || 0) + ' book · ' + (r.covers || 0) + ' bìa · ' + (r.images || 0) + ' ảnh chương — KV chỉ còn stub.';
          say('Đã chạy migration overflow.'); redraw();
        }).catch(fail);
    }, 'Chuyển');
  }
  function realBlogSync() {
    if (!ensureOnline()) return;
    M.openStrong('Đồng bộ metadata Blogger', 'Cập nhật registry từ list-novel; KV vẫn là nguồn thắng.', 'ĐỒNG BỘ', function () {
      apiCall('/api/sync', { method: 'POST' }).then(function () { say('Đã đồng bộ metadata Blogger.'); return reload(); }).catch(fail);
    }, 'Đồng bộ');
  }
  function realBloggerImport() {
    if (!ensureOnline()) return;
    M.clearErrors(['st-blogger-url']);
    var u = val('st-blogger-url');
    if (!u) M.setErr('st-blogger-url', 'Cần URL bài Blogger.');
    else if (!/^https?:\/\//.test(u)) M.setErr('st-blogger-url', 'URL phải bắt đầu bằng http:// hoặc https://');
    if (S.errors['st-blogger-url']) { M.focusFirst(['st-blogger-url']); say('Kiểm tra URL Blogger.', 'bad'); return; }
    var slug = val('st-slug') || S.selectedBook;
    apiCall('/api/import', { method: 'POST', body: { slug: slug, url: u }, importMode: val('st-mode') || 'append' })
      .then(function () { WRITES += 1; say('Đã nhập chương từ Blogger lên KV.'); return loadBook(slug, true); })
      .then(function () { redraw(); }).catch(fail);
  }
  function realBackup() {
    var payload = { note: 'Sao lưu thật từ Cloudflare KV · ' + new Date().toISOString(), registry: REG };
    M.download('ssochuz-backup-' + today() + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    say('Đã tải backup registry thật.');
  }
  function realExport(type) {
    var arr = S.books.filter(function (b) { return S.sel.has(b.id); });
    if (!arr.length) { say('Chọn ít nhất một bộ để xuất.', 'warn'); return; }
    if (type === 'csv') {
      var head = 'title,slug,author,couple,status,pubStatus,visibility,year,is18,chapters,updated';
      var rows = arr.map(function (b) {
        return [b.t, b.slug, b.a, b.c, b.st, b.pub, b.vis, b.year, b.adult ? 1 : 0, b.ch, b.d]
          .map(function (x) { return '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"'; }).join(',');
      });
      M.download('ssochuz-thu-vien-' + today() + '.csv', [head].concat(rows).join('\n'), 'text/csv;charset=utf-8');
    } else M.download('ssochuz-thu-vien-' + today() + '.json', JSON.stringify(arr, null, 2), 'application/json;charset=utf-8');
    say('Đã xuất ' + arr.length + ' bộ từ dữ liệu thật.');
  }

  /* ---------------- 5 · chặn action ghi (capture phase) ---------------- */
  var REAL_CLICK = {
    'delete-book': function (el) { realDeleteBook(el.dataset.id); },
    'clone-book': realCloneBook,
    'bulk-apply': realBulkApply,
    'chapter-add': realChapterAdd,
    'chapter-move': function (el) { realChapterMove(Number(el.dataset.idx), Number(el.dataset.dir)); },
    'chapter-delete': function (el) { realChapterDelete(Number(el.dataset.idx)); },
    'chapter-select': function (el) {
      var i = Number(el.dataset.idx);
      S.activeChapter = i; S.editorPreview = false; syncChaptersToState(); redraw();
      var ce = D.getElementById('editor'); if (ce) ce.focus();
    },
    'save-chapter': realSaveChapter,
    'schedule-chapter': function () { S.chapterStatus = 'scheduled'; say('Đã chọn Hẹn giờ · đặt mốc rồi bấm Lưu chương để ghi KV.'); redraw(); },
    'delete-comment': function (el) { realDeleteComment(el.dataset.id); },
    'toggle-report': function (el) { realToggleReport(el.dataset.id); },
    'remove-votes': realRemoveVotes,
    'reset-votes': realResetVotes,
    'slide-add': function (el) { realSlideChange('add', 0, 0, el); },
    'slide-move': function (el) { realSlideChange('move', Number(el.dataset.idx), Number(el.dataset.dir), el); },
    'slide-remove': function (el) { realSlideChange('remove', Number(el.dataset.idx), 0, el); },
    'sched-add': function (el) { realSlideChange('sched-add', 0, 0, el); },
    'sched-remove': function (el) { realSlideChange('sched-remove', Number(el.dataset.idx), 0, el); },
    'recount': realRecount,
    'migrate': function (el) {
      var only = el.dataset.only || '';
      realMigrate(only, only === 'books' ? 'chỉ book' : only === 'covers' ? 'chỉ bìa' : 'book + bìa + ảnh chương');
    },
    'blogger-sync': realBlogSync,
    'backup': realBackup,
    'export': function (el) { realExport(el.dataset.type); },
    'refresh': function () { reload(); },
    'scan': function () {
      if (!ensureOnline()) return;
      say('Đã quét ' + (REG.lib || []).length + ' bộ từ registry KV · ' + M.SAMPLE_ISSUES.length + ' vấn đề.');
    },
    'kv-audit': function () {
      if (!ensureOnline()) return;
      apiCall('/api/admin/kv').then(function (r) {
        KVINFO = r; WRITES = Number(r.writesToday || 0); READS = Number(r.readsToday || 0); setQuota();
        var g = r.groups || {};
        say('Audit KV: ' + (r.keys || r.totalKeys || 0) + ' khoá · ' + (Array.isArray(g) ? g.length : Object.keys(g).length) + ' prefix · ' + (r.bytes || r.totalBytes || 0) + ' byte.');
        redraw();
      }).catch(fail);
    },
    'fix-row': function () { say('Hãy sửa bộ đó trong Thư viện → Sửa bộ rồi bấm Lưu metadata để ghi KV.', 'info'); },
    'flush-stats': function () {
      if (!ensureOnline()) return;
      M.openSimple('Flush stats cache', 'Đẩy cache stats vào KV.', function () {
        apiCall('/api/stats/refresh', { method: 'POST' }).then(function () { WRITES += 1; say('Đã flush stats cache trên KV.'); return loadStats(); }).catch(fail);
      }, 'Flush stats', true);
    },
    'login-supabase': function () {
      say('Ghi KV cần ADMIN_KEY qua Worker. Supabase/Google chỉ dùng cho độc giả — nhập URL Worker + ADMIN_KEY bên dưới.', 'info');
    },
    'static-mode': function () {
      CFG.key = ''; delete S.models['gate-key']; setConn('static');
      loadStatic().then(function () { say('Chế độ đọc tĩnh · /data/registry.json (chỉ đọc).'); go('dashboard'); }).catch(fail);
    },
    'view-web': function () { window.open('/', '_blank', 'noopener'); },
    'restore-draft': function () { syncChaptersToState(); say('Đã nạp lại chương từ KV.'); redraw(); },
    'save-draft': function () {
      var ed = D.getElementById('editor');
      S.editorSeed = M.sanitizeEditorHtml(ed ? ed.innerHTML : S.editorSeed);
      S.savedAt = new Date().toLocaleTimeString('vi-VN');
      say('Nháp cục bộ đã cập nhật · bấm Lưu chương để ghi KV.'); redraw();
    },
    'manage-chapters': function () {
      var cb = S.chapterBook || S.selectedBook;
      if (cb && cb !== BOOK_SLUG) loadBook(cb).then(function () { redraw(); }).catch(fail);
      else redraw();
      say('Đang quản lý chương của ' + titleOf(cb) + ' · dữ liệu KV.');
    },
    'focus-editor': function () {
      if (S.editorPreview) { S.editorPreview = false; redraw(); }
      var card = D.getElementById('editorCard'), ed = D.getElementById('editor');
      if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (ed) ed.focus();
    },
    'reset-demo': function () { reload(); },
    'toast-demo': function () { say('Dữ liệu thật · Cloudflare KV.'); },
    'confirm-demo': function () {
      M.openStrong('Xác nhận mạnh', 'Ví dụ design system: gõ tên bộ. Thao tác thật gõ cụm hoặc slug.', 'VÍ DỤ', function () { say('Đã xác nhận.'); }, 'Xác nhận');
    },
    'set-mode': function (el) { S.modes[S.route] = el.dataset.mode; redraw(); },
    'connect': function () { realConnect(); }
  };

  /* ---------------- 6 · override hàm gọi tên trong switch ---------------- */
  function realConnect() {
    var api = val('gate-api'), key = val('gate-key'), staticMode = checked('gate-static');
    M.clearErrors(['gate-api', 'gate-key']);
    if (!api) M.setErr('gate-api', 'Cần địa chỉ Worker.');
    else if (!/^https:\/\//i.test(api)) M.setErr('gate-api', 'Địa chỉ Worker phải dùng https://');
    if (!staticMode && !key) M.setErr('gate-key', 'Cần ADMIN_KEY để ghi dữ liệu thật.');
    if (S.errors['gate-api'] || S.errors['gate-key']) { M.focusFirst(['gate-api', 'gate-key']); say('Kiểm tra thông tin kết nối.', 'bad'); return; }
    delete S.models['gate-key'];
    if (staticMode) {
      CFG.key = ''; setConn('static');
      loadStatic().then(function () { say('Đã mở dữ liệu tĩnh, chỉ đọc.'); go('dashboard'); }).catch(fail);
      return;
    }
    CFG.base = norm(api); CFG.key = key;
    setConn('checking');
    apiCall('/api/health', { auth: false })
      .then(function () { return apiCall('/api/whoami'); })
      .then(function () {
        lsSet('cz_kv_api', CFG.base); ssSet('cz_kv_key', CFG.key);
        setConn('online'); return loadAll();
      })
      .then(function () { say('Đã nối Worker · dữ liệu thật từ Cloudflare KV.'); go('dashboard'); })
      .catch(function (e) { setConn(classify(e)); fail(e); });
  }

  window.connect = realConnect;
  window.submitNew = realSubmitNew;
  window.saveEdit = realSaveEdit;
  window.setLock = realSetLock;
  window.saveHomepage = realSaveHomepage;
  window.bloggerImport = realBloggerImport;
  window.exportBooks = realExport;
  window.resetDemo = function () { reload(); };
  window.selectBook = function (id) {
    S.selectedBook = id; window.initEditModels(M.getBook(id));
    say('Đã chọn ' + (M.getBook(id).t || id) + ' · dữ liệu KV.', 'info');
    if (CFG.base) (S.conn === 'static' ? loadStaticBook(id) : loadBook(id)).catch(function () {});
  };
  window.initEditModels = function (b) {
    var meta = findMeta(b.id) || {};
    S.models['eb-t'] = b.t; S.models['eb-slug'] = b.slug || b.id;
    S.models['eb-a'] = b.a; S.models['eb-c'] = b.c;
    S.models['eb-st'] = b.st; S.models['eb-pub'] = b.pub;
    S.models['eb-year'] = meta.year || '';
    S.models['eb-vis'] = b.vis || 'public'; S.models['eb-18'] = !!b.adult;
    S.models['eb-sum'] = meta.synFull || meta.syn || b.syn || '';
    S.models['eb-pass'] = ''; S.models['eb-pass2'] = '';
    S.couples.eb = String(b.c || '').split(/,\s*/).filter(Boolean);
    if (!S.couples.eb.length) S.couples.eb = [''];
  };
  if (typeof window.shortcutSave === 'function') window.shortcutSave = function () {
    if (S.route === 'chuong') realSaveChapter();
    else if (S.route === 'sua-bo') realSaveEdit();
    else if (S.route === 'them-bo') realSubmitNew();
    else say('Không có gì để lưu ở màn này.', 'info');
  };
  if (typeof window.shortcutNewChapter === 'function') window.shortcutNewChapter = function () {
    if (S.route === 'chuong') realChapterAdd(); else say('Vào tab Chương để thêm chương.', 'info');
  };

  /* ---------------- 7 · nhãn giao diện: THẬT thay vì MẪU ---------------- */
  var origToast = M.toast;
  window.toast = function (msg, kind) {
    msg = String(msg || '')
      .replace(/\s*\(mô phỏng\)/g, '').replace(/mô phỏng/g, '')
      .replace(/DỮ LIỆU MẪU/g, 'DỮ LIỆU THẬT')
      .replace(/\s*·\s*MẪU/g, ' · KV').replace(/\s+MẪU/g, ' KV')
      .replace(/\s*\(mẫu\)/g, ' (KV)');
    return origToast(msg, kind);
  };
  window.sampleNote = function () {
    var host = CFG.base ? CFG.base.replace(/^https?:\/\//, '') : 'chưa nối Worker';
    return '<p class="sample-note">DỮ LIỆU THẬT · CLOUDFLARE KV · ' + esc(host) + '</p>';
  };
  var origCover = M.cover;
  window.cover = function (b, cls) {
    if (b && b.thumb && /^https?:\/\//i.test(b.thumb))
      return '<img class="cover ' + (cls || '') + '" src="' + esc(b.thumb) + '" alt="' + esc(b.t || '') + '" loading="lazy">';
    return origCover(b, cls);
  };
  var st = D.createElement('style');
  st.textContent = 'img.cover{object-fit:cover;display:block;padding:0}';
  D.head.appendChild(st);

  var origRender = M.render;
  window.render = function () {
    origRender();
    try {
      ['view', 'login', 'topbar', 'sidebar', 'modalRoot', 'toasts'].forEach(function (id) { scrub(D.getElementById(id)); });
    } catch (e) {}
  };
  WRAPPED = true;
  function scrub(root) {
    if (!root || !window.NodeFilter) return;
    var tw = D.createTreeWalker(root, window.NodeFilter.SHOW_TEXT, null, false), n;
    while ((n = tw.nextNode())) {
      var t = n.nodeValue;
      if (!/MẪU|mô phỏng|\(mẫu\)/i.test(t)) continue;
      n.nodeValue = t
        .replace(/DỮ LIỆU MẪU/g, 'DỮ LIỆU THẬT · KV')
        .replace(/\s*\(mô phỏng\)/g, '')
        .replace(/mô phỏng/g, 'thật')
        .replace(/\(mẫu\)/g, '(KV)')
        .replace(/\bMẪU\b/g, 'KV')
        .replace(/\bmẫu\b/g, 'KV');
    }
  }

  /* ---------------- 5b · upload, import, restore ---------------- */
  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(new Error('Không đọc được file.')); };
      fr.readAsDataURL(file);
    });
  }
  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(new Error('Không đọc được file.')); };
      fr.readAsText(file);
    });
  }
  function realRestoreFile(el) {
    if (!ensureOnline() || !(el.files && el.files.length)) return;
    var file = el.files[0]; el.value = '';
    readAsText(file).then(function (raw) {
      var payload = JSON.parse(raw);
      var reg = payload.registry || (payload.lib ? payload : null);
      if (!reg || !Array.isArray(reg.lib)) throw new Error('File backup không có registry.lib hợp lệ.');
      M.openStrong('Khôi phục từ JSON', 'Ghi đè registry và toàn bộ book lên KV · không hoàn tác.', 'KHÔI PHỤC', function () {
        writeRegistry(reg, true).then(function () {
          say('Đã khôi phục registry lên KV (' + reg.lib.length + ' bộ).');
          return reload();
        }).catch(fail);
      }, 'Khôi phục');
    }).catch(fail);
  }
  function realImportFile(el) {
    if (!ensureOnline() || !(el.files && el.files.length)) return;
    var files = Array.prototype.slice.call(el.files);
    var kind = el.dataset.kind, slug = BOOK_SLUG || S.selectedBook;
    el.value = '';
    Promise.all(files.map(readAsText)).then(function (texts) {
      if (kind === 'multi') {
        var base = S.chapters.length;
        var chain = Promise.resolve();
        texts.forEach(function (txt, i) {
          var ch = { t: files[i].name.replace(/\.(txt|docx)$/i, '') || ('Chương ' + (base + i + 1)), html: textToHtml(txt), status: 'published' };
          chain = chain.then(function () {
            return apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { index: base + i, chapter: ch } });
          });
        });
        return chain.then(function () { WRITES += 1; say('Đã nhập ' + texts.length + ' chương lên KV.'); return loadBook(slug, true); });
      }
      var raw = texts[0] || '';
      S.editorSeed = M.sanitizeEditorHtml(/<[a-z][\s\S]*>/i.test(raw) ? raw : textToHtml(raw));
      S.editorPreview = false;
      say('Đã nạp nội dung vào trình soạn · bấm Lưu chương để ghi KV.');
      redraw();
    }).then(function () { redraw(); }).catch(fail);
  }
  function realInsertImage(el) {
    if (!ensureOnline() || !(el.files && el.files.length)) return;
    var file = el.files[0]; el.value = '';
    readAsDataURL(file).then(function (url) {
      return apiCall('/api/img', { method: 'POST', body: { type: file.type || 'image/png', data: url, kind: 'chapter' }, timeout: 30000 });
    }).then(function (r) {
      var src = r.url || ('/api/img/' + r.id);
      S.editorPreview = false;
      S.editorSeed = M.sanitizeEditorHtml((S.editorSeed || '') + '<p><img src="' + esc(src) + '" alt="' + esc(file.name) + '"></p>');
      say('Đã tải ảnh lên KV và chèn vào chương.'); redraw();
    }).catch(fail);
  }
  function realCoverUpload(el) {
    if (!ensureOnline() || !(el.files && el.files.length)) return;
    var file = el.files[0]; el.value = '';
    readAsDataURL(file).then(function (url) {
      return apiCall('/api/img', { method: 'POST', body: { type: file.type || 'image/png', data: url, kind: 'cover' }, timeout: 30000 });
    }).then(function (r) {
      var src = r.url || ('/api/img/' + r.id);
      var meta = findMeta(S.selectedBook || BOOK_SLUG);
      if (!meta) throw new Error('Chọn bộ trước khi tải bìa.');
      var next = clone(REG);
      var hit = (next.lib || []).find(function (m) { return m.slug === meta.slug; });
      hit.thumb = src; hit.slide = src;
      return writeRegistry(next);
    }).then(function () { say('Đã lưu ảnh bìa lên KV.'); }).catch(fail);
  }

  D.addEventListener('change', function (e) {
    var el = e.target; if (!el || !el.dataset) return;
    var r = el.dataset.role;
    if (r === 'restore-file') { e.preventDefault(); e.stopPropagation(); realRestoreFile(el); }
    else if (r === 'import-file') { e.preventDefault(); e.stopPropagation(); realImportFile(el); }
    else if (r === 'chapter-image') { e.preventDefault(); e.stopPropagation(); realInsertImage(el); }
    else if (r === 'cover-upload') { e.preventDefault(); e.stopPropagation(); realCoverUpload(el); }
    else if (r === 'chapter-book') {
      e.preventDefault(); e.stopPropagation();
      S.chapterBook = el.value;
      (S.conn === 'static' ? loadStaticBook(el.value) : loadBook(el.value)).catch(function () {});
    }
  }, true);

  /* capture: chặn trước khi listener bubble của mockup chạy */
  D.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var fn = REAL_CLICK[el.dataset.act];
    if (!fn) return;
    e.preventDefault(); e.stopPropagation();
    try { fn(el); } catch (err) { fail(err); }
  }, true);

  /* ---------------- 8 · khởi động ---------------- */
  function boot() {
    if (STARTED) return; STARTED = true;
    window.render();
    if (CFG.base && CFG.key) {
      setConn('checking');
      apiCall('/api/whoami').then(function () { setConn('online'); return loadAll(); })
        .then(function () { say('Đã nối Worker · dữ liệu thật từ KV.'); })
        .catch(function (e) {
          setConn(classify(e)); fail(e);
          go('dang-nhap');
        });
    } else if (CFG.base) {
      setConn('static');
      loadStatic().then(function () { go('dashboard'); }).catch(fail);
    } else {
      setConn('static');
      go('dang-nhap');
      say('Nhập URL Worker + ADMIN_KEY để đọc và ghi dữ liệu thật.', 'info');
    }
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
