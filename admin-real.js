/* admin-real.js · Lớp dữ liệu thật KV cho giao diện quản trị mới (admin.html) */
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
  /* Ngày “hôm nay” theo GIỜ VIỆT NAM (UTC+7) — khớp vnDay() của worker/cms.js.
     Bản cũ lấy toISOString() (UTC) nên từ 0h tới 7h sáng giờ VN vẫn ra ngày
     HÔM QUA: tạo bộ / lưu ngày cập nhật lúc 1 giờ sáng là web ghi ngày cũ. */
  function today() { return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); }
  function nowStamp() { return new Date().toISOString().slice(0, 16).replace('T', ' '); }
  function teaser(t, n) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, n || 220); }
  function textToHtml(t) {
    var raw = String(t || '').replace(/\r\n?/g, '\n').trim();
    if (!raw) return '';
    return raw.split(/\n+/).map(function (ln) { return ln.trim(); }).filter(Boolean).map(function (ln) {
      return '<p>' + ln.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }).join('');
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
  var SAMPLE_CLEARED = false;

  /* Vòng 12: dọn sạch seed prototype ngay tại boot() trước render đầu tiên. */
  function clearPrototypeSeed() {
    if (SAMPLE_CLEARED) return;
    SAMPLE_CLEARED = true;
    S.books = []; S.chapters = []; S.activeChapter = 0; S.editorSeed = '<p></p>';
    S.votes = []; S.comments = []; S.reports = []; S.slides = []; S.schedule = [];
    S.picked = []; S.selectedBook = null; S.chapterBook = null;
    S.savedAt = ''; S.chapterAt = ''; S.hpNote = ''; S.hpText = ''; S.hpHref = '';
    S.migrateResult = ''; S.demoOpen = false;
    /* Vòng 13: counter KV thật, renderTopbar() đọc để vẽ chip. */
    S.kvWrites = 0; S.kvReads = 0;
    S.couples = { nb: [''], eb: [''] };
    var zeroRows = [['—', 0], ['—', 0], ['—', 0], ['—', 0], ['—', 0]];
    ['reads', 'likes', 'voters', 'today'].forEach(function (k) {
      replaceArr(M.SAMPLE_STATS[k], zeroRows.map(function (r) { return r.slice(); }));
    });
    replaceArr(M.SAMPLE_METRICS, [
      { n: '0', k: 'Bộ truyện', s: 'KV' },
      { n: '0', k: 'Chương đã đăng', s: 'KV' },
      { n: '0', k: 'Gắn 18+', s: 'KV' },
      { n: '0', k: 'Thiếu thông tin', s: 'KV' },
      { n: '0', k: 'Quota ghi hôm nay', s: 'KV' },
      { n: '0', k: 'Lượt đọc KV hôm nay', s: 'KV' }
    ]);
    replaceArr(M.SAMPLE_ISSUES, []);
    replaceArr(M.SAMPLE_LOGS, []);
    replaceArr(M.SAMPLE_NOTIFS, []);
    replaceArr(M.SAMPLE_READS, [0]);
  }

  /* Mỗi lần render: ép bảng demo luôn ĐÓNG + RỖNG. Dù còn sót một
     data-act="demo" nào đó trong tương lai, panel không bao giờ hiện. */
  function redraw() {
    S.demoOpen = false;
    /* Chip KV phải hiện writesToday thật, không phải hằng 120/1000 của prototype. */
    S.kvWrites = WRITES; S.kvReads = READS;
    var demo = D.getElementById('demo');
    if (demo) { demo.hidden = true; if (demo.innerHTML) demo.innerHTML = ''; }
    if (WRAPPED) window.render(); else M.render();
  }
  function findMeta(slug) {
    return (Array.isArray(REG.lib) ? REG.lib : []).find(function (m) { return !!m && m.slug === slug; });
  }
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
  function setConn(c) { if (S.conn === c) return; S.conn = c; try { redraw(); } catch (e) {} }
  function setQuota() {
    S.quota = WRITES >= 1000 ? 'blocked' : WRITES >= 950 ? 'bad' : WRITES >= 800 ? 'warn' : 'ok';
    S.kvWrites = WRITES; S.kvReads = READS;
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
    /* Chỉ gửi header nằm trong access-control-allow-headers của worker/cms.js; dùng cache:'no-store'. */
    var headers = {};
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
        e = new Error('Không nối được Worker tại ' + CFG.base + ' — trình duyệt chặn request (preflight CORS / CSP connect-src), URL sai hoặc Worker chưa deploy. Mở tab Network để thấy lý do cụ thể.');
        e.kind = 'network';
      }
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }

  /* ---------------- 3 · đổ dữ liệu thật vào state ---------------- */
  function hydrate(reg) {
    REG = reg || { lib: [] };
    /* Bỏ dòng rác (null/không slug): metaToBook(null), findMeta() từng ném TypeError khi mở /admin. */
    var lib = (Array.isArray(REG.lib) ? REG.lib : []).filter(function (m) {
      return !!m && typeof m === 'object' && !Array.isArray(m) && String(m.slug || '').trim() !== '';
    });
    REG.lib = lib;      /* findMeta/titleOf đọc REG.lib — để nguyên dòng rác là ném lỗi */
    S.books = lib.map(metaToBook);
    var choice = (Array.isArray(REG.editorChoice) && REG.editorChoice.length)
      ? REG.editorChoice
      : ((REG.settings && Array.isArray(REG.settings.editorChoice)) ? REG.settings.editorChoice : []);
    S.picked = choice.map(function (x) { return typeof x === 'string' ? x : ((x && x.slug) || ''); })
      .filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    clearPrototypeSeed();
    if (!S.selectedBook || !S.books.some(function (b) { return b.id === S.selectedBook; }))
      S.selectedBook = S.books.length ? S.books[0].id : null;
    if (S.selectedBook) window.initEditModels(M.getBook(S.selectedBook));
    S.models['st-slug'] = S.books.length ? S.books[0].id : '';
    S.chapterBook = BOOK_SLUG || S.selectedBook;

    var slides = Array.isArray(REG.slides) ? REG.slides : [];
    S.slides = slides.filter(function (x) { return !!x && (typeof x === 'string' || typeof x === 'object'); }).slice(0, 8).map(function (x) {
      return { b: (typeof x === 'string' ? x : (x && x.slug) || ''), r: (x && (x.reason || x.note)) || '' };
    });
    var sch = (REG.schedule && Array.isArray(REG.schedule.items)) ? REG.schedule.items : [];
    /* dòng lịch rác (null, số, object rỗng) không dẫn được tới bộ nào, lại làm
       realSaveHomepage() từ chối lưu (“thiếu thứ hoặc bộ”) ⇒ bỏ ngay từ hydrate.
       Dòng CHỈ có title là dạng syncBlogger ghi ra (trang chủ ghép bộ theo tên),
       giữ lại kèm title để bấm Lưu không xoá mất lịch cũ. */
    S.schedule = sch.filter(function (x) {
      return !!x && typeof x === 'object' &&
        (String(x.slug || '').trim() !== '' || String(x.title || '').trim() !== '');
    }).map(function (x) {
      /* detail là GHI CHÚ (thường rỗng); title là TÊN BỘ — trước đây gộp
         title vào ô ghi chú rồi ghi ngược lại vào KV. */
      return { d: x.days || x.day || '', b: x.slug || '', c: x.detail || x.note || '',
        t: x.slug ? '' : (x.title || '') };
    });
    window.hpSortSchedule(S.schedule); // Lấy mốc hoàn tác sau khi xếp lịch cũ theo thứ.
    var ann = (REG.settings && REG.settings.announcement) || {};
    S.hpNote = (REG.schedule && REG.schedule.note) || '';
    S.hpText = ann.text || ''; S.hpHref = ann.href || '';
    /* Gán SAU khi đã đọc ann: trước đây gán trước nên 2 ô luôn rỗng dù KV có
       nội dung thông báo, và công tắc banner luôn tắt. */
    S.models['hp-text'] = S.hpText;
    S.models['hp-href'] = S.hpHref;
    S.models['hp-banner'] = !!ann.enabled;
    S.models['hp-note'] = S.hpNote;
    /* Vòng 17: trang chủ sửa tại chỗ rồi lưu MỘT lần, nên cần mốc “đã lưu”
       để biết khi nào có thay đổi chưa ghi và nút Hoàn tác quay về đâu.
       `hpKeep` là bản sao của đúng dữ liệu KV vừa nạp. */
    try {
      S.hpBase = window.hpSnapshot ? window.hpSnapshot() : null;
      S.hpKeep = S.hpBase ? JSON.parse(S.hpBase) : null;
    } catch (e) { S.hpBase = null; S.hpKeep = null; }
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
      if (seen[m.slug]) issues.push({ t: 'Slug trùng', b: m.title, slug: m.slug, d: m.slug, reg: '', lv: 'bad' });
      seen[m.slug] = 1;
      if (!m.thumb) issues.push({ t: 'Thiếu bìa', b: m.title, slug: m.slug, d: 'chưa có thumb', reg: '', lv: 'warn' });
      if (!(m.synFull || m.syn)) issues.push({ t: 'Thiếu mô tả', b: m.title, slug: m.slug, d: 'chưa có syn', reg: '', lv: 'warn' });
      if (!(Number(m.chapters) > 0)) issues.push({ t: 'Chưa có chương', b: m.title, slug: m.slug, d: '0 chương', reg: '', lv: 'warn' });
    });
    /* Vòng 18b: mỗi dòng phải mang SLUG (để nút “Sửa” mở đúng bộ) và ô
       registry/book TÁCH RIÊNG — trước đây nhồi một chuỗi “chapters = 0” rồi
       tách bằng dấu “·” nên cột Book luôn “—”, người quản lý không biết
       registry ghi 0 hay book thật sự 0 chương. */
    issues.forEach(function (x) { x.reg = x.d; x.book = ''; });
    replaceArr(M.SAMPLE_ISSUES, issues.slice(0, 60));
    /* Nạp số chương THẬT của book ngay sau khi có registry (nền, không chặn vẽ
       màn hình) — trước đây cột Book luôn “—” nên không ai thấy lệch. */
    try { setTimeout(function () { loadIssueBooks(); }, 0); } catch (e) {}
  }

  /* Đối chiếu registry ↔ book thật: chỉ hỏi những bộ ĐANG có vấn đề, chạy nền
     để bảng hiện ngay. Kết quả ghi vào issues.book rồi vẽ lại bảng. */
  var ISSUE_BOOKS = {};      /* slug → số chương thật | 'missing' */
  function loadIssueBooks() {
    var slugs = [];
    (M.SAMPLE_ISSUES || []).forEach(function (x) { if (x.slug && slugs.indexOf(x.slug) < 0) slugs.push(x.slug); });
    if (!slugs.length) return Promise.resolve();
    return Promise.allSettled(slugs.slice(0, 24).map(function (slug) {
      return apiCall('/api/book/' + encodeURIComponent(slug)).then(function (b) {
        var n = b && Array.isArray(b.chapters) ? b.chapters.length : (b && Number(b.count)) || 0;
        ISSUE_BOOKS[slug] = n;
        (M.SAMPLE_ISSUES || []).forEach(function (x) {
          if (x.slug !== slug) return;
          x.book = n + ' chương';
          if (n > 0 && x.t === 'Chưa có chương') x.note = 'registry ghi 0 nhưng book có ' + n;
        });
      }).catch(function (e) {
        ISSUE_BOOKS[slug] = 'missing';
        (M.SAMPLE_ISSUES || []).forEach(function (x) { if (x.slug === slug) x.book = 'chưa có book'; });
      });
    })).then(function () { try { redraw(); } catch (e) {} });
  }
  window.__czIssueBooks = function () { return ISSUE_BOOKS; };
  /* Tab Cài đặt cần thấy tình trạng kho KV ngay (khối “Sức khoẻ KV”). */
  window.__czKv = function () { return KVINFO; };

  window.__CZ_REAL_EDITOR__ = true;
  var FORCE_EDITOR_SEED = false;
  var DIRTY_CHAPTER = false;
  var DRAFT_SAVED_AT = '';
  var LAST_EDITOR_RANGE = null;
  var EDITOR_AUTOSAVE_TIMER = null;
  var PENDING_IMPORT = null;
  /* Trạng thái TẢI BỘ cho tab Chương. Trước đây loadBook() chỉ reject rồi im
     lặng: bộ 404/500 vẫn hiện khung soạn của bộ CŨ (hoặc rỗng) nên người sửa
     tưởng đang sửa đúng bộ. Giờ mỗi lần tải đều ghi lại kết quả để khung
     chương dựng được thông báo + nút Thử lại. */
  var CHAPTER_LOAD = { slug: '', status: 'idle', error: '', missing: false, at: '' };
  window.__czChapterLoad = function () { return CHAPTER_LOAD; };

  /* ==========================================================================
     TRÌNH SOẠN CHƯƠNG & XEM TRƯỚC ĐỘC GIẢ (chuẩn truyen.html + sanitize.js)
     ========================================================================== */
  function toSetMap(csv) {
    var m = {};
    csv.split(',').forEach(function (k) { m[k] = 1; });
    return m;
  }
  function boxFromHtml(html) {
    var tmpl = D.createElement('template');
    tmpl.innerHTML = String(html || '');
    var box = D.createElement('div');
    box.appendChild(tmpl.content.cloneNode(true));
    return box;
  }
  var SAFE_EDITOR_TAGS = toSetMap('p,div,span,br,hr,b,strong,i,em,u,s,strike,del,ins,mark,small,sub,sup,code,pre,q,cite,abbr,time,blockquote,ul,ol,li,dl,dt,dd,a,img,figure,figcaption,picture,source,video,audio,table,caption,thead,tbody,tfoot,tr,th,td,h1,h2,h3,h4,h5,h6,details,summary');
  var DROP_EDITOR_TAGS = toSetMap('script,style,template,iframe,frame,frameset,noframes,noscript,object,embed,applet,param,form,input,button,select,option,optgroup,textarea,label,fieldset,legend,link,meta,base,title,head,html,body,svg,math,dialog,marquee,blink,portal');
  var SAFE_EDITOR_ATTRS = toSetMap('class,style,title,dir,lang,align,href,target,rel,src,srcset,sizes,alt,width,height,loading,decoding,colspan,rowspan,scope,start,reversed,type,cite,datetime,controls,poster,open,data-original-height,data-original-width');
  var WIDGET_CLS_RE = /(^|\s)(pagination-container|pagination|page-nav|pagenav|pager|paging)(\s|$)/i;
  var BLOCK_CHILD_SEL = 'div,p,ul,ol,blockquote,table,figure,h1,h2,h3,h4,h5,h6,pre,hr,details';

  function safeEditorUrl(raw) {
    var v = String(raw == null ? '' : raw).replace(/[\u0000-\u001F\u007F\s]+/g, '').trim();
    if (!v) return '';
    if (/^(https?:|mailto:|tel:|\/\/)/i.test(v)) return String(raw).trim();
    if (/^[#/?]/.test(v) || /^\.{0,2}\//.test(v)) return String(raw).trim();
    return '';
  }
  function safeEditorSrcset(raw) {
    return String(raw == null ? '' : raw).split(',').map(function (p) {
      var piece = String(p).trim();
      var m = piece.match(/^(\S+)(\s+[\d.]+[wx])?$/);
      if (!m || !safeEditorUrl(m[1])) return '';
      return m[1] + (m[2] || '');
    }).filter(Boolean).join(', ');
  }
  function safeEditorStyle(raw, fromPaste) {
    var v = String(raw == null ? '' : raw).replace(/\/\*[\s\S]*?\*\//g, ' ');
    if (!v.trim()) return '';
    if (/expression\s*\(|javascript:|vbscript:|-moz-binding|behaviou?r\s*:|@import|@charset/i.test(v)) return '';
    if (fromPaste) {
      var align = v.match(/text-align\s*:\s*(center|right|left|justify)/i);
      return align ? ('text-align: ' + align[1].toLowerCase()) : '';
    }
    v = v.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, function (_, q, u) {
      var ok = safeEditorUrl(u);
      return ok ? ('url(' + q + ok + q + ')') : '';
    });
    v = v.replace(/\bposition\s*:\s*fixed/gi, 'position:static').replace(/[\u0000-\u001F\u007F]/g, ' ');
    return v.replace(/\s+/g, ' ').trim();
  }
  function cleanInertNode(parent, opts) {
    opts = opts || {};
    Array.prototype.slice.call(parent.childNodes).forEach(function (ch) {
      if (ch.nodeType === 8) { ch.remove(); return; }
      if (ch.nodeType !== 1) return;
      var tag = (ch.tagName || '').toLowerCase();
      if (DROP_EDITOR_TAGS[tag]) { ch.remove(); return; }
      var cls = ch.getAttribute('class') || '';
      if (WIDGET_CLS_RE.test(cls)) { ch.remove(); return; }
      if (opts.fromPaste && (tag === 'b' || tag === 'strong')) {
        var bSt = ch.getAttribute('style') || '';
        if (/font-weight\s*:\s*(normal|400)\b/i.test(bSt) || /^docs-internal-guid/i.test(ch.getAttribute('id') || '')) {
          cleanInertNode(ch, opts);
          while (ch.firstChild) parent.insertBefore(ch.firstChild, ch);
          ch.remove();
          return;
        }
      }
      if (opts.fromPaste && tag === 'span') {
        var spSt = ch.getAttribute('style') || '';
        cleanInertNode(ch, opts);
        var wrapTags = [];
        if (/font-weight\s*:\s*(bold|[6-9]00)\b/i.test(spSt)) wrapTags.push('strong');
        if (/font-style\s*:\s*italic\b/i.test(spSt)) wrapTags.push('em');
        if (/text-decoration[^;]*underline/i.test(spSt)) wrapTags.push('u');
        if (/text-decoration[^;]*line-through/i.test(spSt)) wrapTags.push('s');
        if (wrapTags.length) {
          var outer = D.createElement(wrapTags[0]), inner = outer;
          for (var wi = 1; wi < wrapTags.length; wi++) {
            var nxt = D.createElement(wrapTags[wi]);
            inner.appendChild(nxt); inner = nxt;
          }
          while (ch.firstChild) inner.appendChild(ch.firstChild);
          parent.replaceChild(outer, ch);
        } else {
          while (ch.firstChild) parent.insertBefore(ch.firstChild, ch);
          ch.remove();
        }
        return;
      }
      if (tag === 'center') {
        var cp = D.createElement('p');
        cp.setAttribute('style', 'text-align: center');
        while (ch.firstChild) cp.appendChild(ch.firstChild);
        parent.replaceChild(cp, ch);
        ch = cp; tag = 'p';
      } else if (tag === 'font') {
        var sp = D.createElement('span');
        while (ch.firstChild) sp.appendChild(ch.firstChild);
        parent.replaceChild(sp, ch);
        ch = sp; tag = 'span';
      }
      cleanInertNode(ch, opts);
      if (!SAFE_EDITOR_TAGS[tag]) {
        while (ch.firstChild) parent.insertBefore(ch.firstChild, ch);
        ch.remove();
        return;
      }
      Array.prototype.slice.call(ch.attributes).forEach(function (at) {
        var n = at.name.toLowerCase(), v = at.value;
        if (n.indexOf('on') === 0 || !SAFE_EDITOR_ATTRS[n]) { ch.removeAttribute(at.name); return; }
        if (n === 'href' || n === 'src' || n === 'poster' || n === 'cite') {
          var u = safeEditorUrl(v);
          if (!u) ch.removeAttribute(at.name); else ch.setAttribute(n, u);
          return;
        }
        if (n === 'srcset') {
          var ss = safeEditorSrcset(v);
          if (!ss) ch.removeAttribute(at.name); else ch.setAttribute('srcset', ss);
          return;
        }
        if (n === 'style') {
          var stv = safeEditorStyle(v, opts.fromPaste);
          if (!stv) ch.removeAttribute('style'); else ch.setAttribute('style', stv);
          return;
        }
        if (n === 'target') {
          if (!/^_(blank|self|parent|top)$/i.test(v)) ch.removeAttribute('target');
          else ch.setAttribute('target', v.toLowerCase());
          return;
        }
        if (n === 'align' && !/^(left|center|right|justify)$/i.test(v)) ch.removeAttribute('align');
      });
      if (tag === 'a' && ch.getAttribute('target') === '_blank' && !ch.getAttribute('rel')) {
        ch.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
  function realSanitizeEditorHtml(html, opts) {
    var src = String(html == null ? '' : html);
    if (!src) return '';
    var tmpl = D.createElement('template');
    tmpl.innerHTML = src;
    cleanInertNode(tmpl.content, opts);
    var holder = D.createElement('div');
    holder.appendChild(tmpl.content.cloneNode(true));
    return holder.innerHTML;
  }
  function rewriteImgForEditor(html) {
    var out = String(html || '');
    if (!CFG.base) return out;
    return out.replace(/(\bsrc\s*=\s*['"])\/api\/img\//gi, '$1' + CFG.base + '/api/img/');
  }
  function rewriteImgForStorage(html) {
    var out = String(html || '');
    if (CFG.base) out = out.split(CFG.base + '/api/img/').join('/api/img/');
    return out;
  }
  var KEEP_MEDIA_SEL = 'img,picture,source,video,audio,hr,table,figure,ul,ol,blockquote,pre,details,h1,h2,h3,h4,h5,h6';
  var DOUBLE_BR_RE = /(?:<br\s*\/?>(?:\s|&nbsp;|\u00a0)*){2,}/i;
  var DOUBLE_BR_SPLIT = /(?:<br\s*\/?>(?:\s|&nbsp;|\u00a0)*){2,}/gi;
  var BLK_TAG_RE = /^(div|p|ul|ol|li|blockquote|table|figure|h[1-6]|pre|hr|details)$/i;
  function isWsNode(n) {
    return !!(n && n.nodeType === 3 && !String(n.nodeValue || '').replace(/[\s\u00a0\u200b\ufeff]+/g, ''));
  }
  function isSpacerBlock(el) {
    if (!el || el.nodeType !== 1) return false;
    var tg = (el.tagName || '').toLowerCase();
    if (tg !== 'p' && tg !== 'div') return false;
    if (el.classList && (el.classList.contains('ch-sep') || el.classList.contains('chat-container') || el.classList.contains('msg'))) return false;
    if (el.querySelector(KEEP_MEDIA_SEL)) return false;
    return !String(el.textContent || '').replace(/[\s\u00a0\u200b\ufeff]+/g, '');
  }
  function copyBlockAttrs(srcEl, dstEl) {
    if (srcEl.className) dstEl.className = srcEl.className;
    var st = srcEl.getAttribute('style');
    if (st) dstEl.setAttribute('style', st);
    var al = srcEl.getAttribute('align');
    if (al) dstEl.setAttribute('align', al);
  }
  function normalizeBlocksInContainer(box) {
    Array.prototype.slice.call(box.querySelectorAll('hr')).forEach(function (hr) {
      if (!hr.parentNode) return;
      var sp = D.createElement('p');
      sp.className = 'ch-sep';
      sp.textContent = '✦';
      hr.parentNode.replaceChild(sp, hr);
    });
    if (!box.querySelector(BLOCK_CHILD_SEL) && DOUBLE_BR_RE.test(box.innerHTML)) {
      box.innerHTML = box.innerHTML.split(DOUBLE_BR_SPLIT).map(function (s) { return s.trim(); }).filter(Boolean)
        .map(function (s) { return '<p>' + s + '</p>'; }).join('');
    }
    Array.prototype.slice.call(box.querySelectorAll('p,div')).forEach(function (el) {
      if (!el.parentNode) return;
      if (el.classList && (el.classList.contains('chat-container') || el.classList.contains('msg') || el.classList.contains('ch-sep'))) return;
      if (el.querySelector(BLOCK_CHILD_SEL) || el.querySelector('img,video,audio,picture,figure,table')) return;
      if (DOUBLE_BR_RE.test(el.innerHTML)) {
        var frag = D.createDocumentFragment();
        el.innerHTML.split(DOUBLE_BR_SPLIT).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (part) {
          var p = D.createElement('p');
          copyBlockAttrs(el, p);
          p.innerHTML = part;
          frag.appendChild(p);
        });
        el.parentNode.replaceChild(frag, el);
      }
    });
    Array.prototype.slice.call(box.querySelectorAll('div')).reverse().forEach(function (d) {
      if (!d.parentNode) return;
      if (d.classList && (d.classList.contains('chat-container') || d.classList.contains('msg'))) return;
      if (isSpacerBlock(d)) { d.remove(); return; }
      if (!d.querySelector(BLOCK_CHILD_SEL)) {
        var p = D.createElement('p');
        copyBlockAttrs(d, p);
        while (d.firstChild) p.appendChild(d.firstChild);
        d.parentNode.replaceChild(p, d);
      } else if (!d.getAttribute('class') && !d.getAttribute('style') && !d.getAttribute('align')) {
        var onlyBlk = Array.prototype.every.call(d.childNodes, function (c) {
          return isWsNode(c) || (c.nodeType === 1 && (c.tagName === 'BR' || BLK_TAG_RE.test(c.tagName)));
        });
        if (onlyBlk) {
          var par = d.parentNode;
          while (d.firstChild) par.insertBefore(d.firstChild, d);
          d.remove();
        }
      }
    });
    Array.prototype.slice.call(box.querySelectorAll('br')).forEach(function (br) {
      if (!br.parentNode) return;
      var prev = br.previousSibling; while (prev && isWsNode(prev)) prev = prev.previousSibling;
      var next = br.nextSibling; while (next && isWsNode(next)) next = next.nextSibling;
      if ((prev && prev.nodeType === 1 && BLK_TAG_RE.test(prev.tagName)) || (next && next.nodeType === 1 && BLK_TAG_RE.test(next.tagName))) br.remove();
    });
    Array.prototype.slice.call(box.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6')).forEach(function (el) {
      while (el.firstChild && (isWsNode(el.firstChild) || (el.firstChild.nodeType === 1 && el.firstChild.tagName === 'BR'))) {
        if (isWsNode(el.firstChild) && el.firstChild.nextSibling && el.firstChild.nextSibling.tagName !== 'BR') break;
        el.removeChild(el.firstChild);
      }
      while (el.lastChild && (isWsNode(el.lastChild) || (el.lastChild.nodeType === 1 && el.lastChild.tagName === 'BR'))) {
        if (isWsNode(el.lastChild) && el.lastChild.previousSibling && el.lastChild.previousSibling.tagName !== 'BR') break;
        el.removeChild(el.lastChild);
      }
    });
    Array.prototype.slice.call(box.querySelectorAll('p,div')).reverse().forEach(function (el) {
      if (isSpacerBlock(el)) el.remove();
    });
    var hasBlock = !!box.querySelector(BLOCK_CHILD_SEL);
    if (!hasBlock && (box.textContent || '').trim()) {
      var wrap = D.createElement('p');
      while (box.firstChild) wrap.appendChild(box.firstChild);
      box.appendChild(wrap);
    }
    var sepRawRe = /^(?:(?:\*(?:\s*\*){2,})|(?:•(?:\s*•){2,})|(?:·(?:\s*·){2,})|(?:[-–―−─━_~=](?:\s*[-–―−─━_~=]){2,})|(?:[—⸺](?:\s*[—⸺])+)|⸻+|✦)$/u;
    var sepDefRe = /^(?:(?:•(?:\s*•)*)|(?:·(?:\s*·)*)|(?:\*(?:\s*\*){2,})|(?:[-–―−─━_~=](?:\s*[-–―−─━_~=]){2,})|(?:[—⸺](?:\s*[—⸺])+)|⸻+|✦)?$/u;
    Array.prototype.slice.call(box.querySelectorAll('p')).forEach(function (p) {
      var stxt = String(p.textContent || '').replace(/[\s\u00a0\u200b\ufeff]+/g, ' ').trim();
      if (p.classList && p.classList.contains('ch-sep')) {
        if (sepDefRe.test(stxt)) p.textContent = '✦';
        p.removeAttribute('style'); p.removeAttribute('align');
      } else if (!(p.classList && (p.classList.contains('chat-container') || p.classList.contains('msg'))) && !p.querySelector('img,video,audio,a,table,figure,br') && sepRawRe.test(stxt)) {
        p.className = 'ch-sep';
        p.removeAttribute('style'); p.removeAttribute('align');
        p.textContent = '✦';
      }
    });
  }
  function htmlForEditor(rawHtml) {
    var box = boxFromHtml(realSanitizeEditorHtml(rewriteImgForEditor(rawHtml)));
    normalizeBlocksInContainer(box);
    return box.innerHTML.trim() || '<p><br></p>';
  }
  function htmlForStorage(rawHtml) {
    var box = boxFromHtml(realSanitizeEditorHtml(rewriteImgForStorage(rawHtml)));
    normalizeBlocksInContainer(box);
    return box.innerHTML.trim() || '<p></p>';
  }
  /* Dựng HTML xem trước khớp 1:1 với cleanHTML() của src/cz-story.js trên truyen.html */
  function renderReaderHtml(rawHtml) {
    var tmp = boxFromHtml(realSanitizeEditorHtml(rewriteImgForEditor(rawHtml)));
    Array.prototype.slice.call(tmp.querySelectorAll('a')).forEach(function (a) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener nofollow');
    });
    Array.prototype.slice.call(tmp.querySelectorAll('img')).forEach(function (im) {
      im.setAttribute('loading', 'lazy');
      im.setAttribute('decoding', 'async');
      im.removeAttribute('width');
      im.removeAttribute('height');
    });
    normalizeBlocksInContainer(tmp);
    return tmp.innerHTML.trim() || '<p class="mut"><em>Chương chưa có nội dung văn bản.</em></p>';
  }

  /* Đếm từ / ký tự / thời gian đọc & hẹn giờ chuẩn ISO <-> datetime-local */
  function chapterPlainStats(html) {
    var tmpl = D.createElement('template');
    tmpl.innerHTML = String(html || '').replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '</$1> ').replace(/<br\s*\/?>/gi, ' ');
    var text = (tmpl.content.textContent || '').replace(/\s+/g, ' ').trim();
    var words = text ? text.split(' ').filter(Boolean).length : 0;
    var chars = text.length;
    var mins = Math.max(1, Math.round(words / 240));
    return { words: words, chars: chars, mins: words ? mins : 0 };
  }
  function formatChapterStats(html) {
    var st = chapterPlainStats(html);
    if (!st.words) return '0 từ · 0 ký tự';
    return st.words.toLocaleString('vi-VN') + ' từ · ' + st.chars.toLocaleString('vi-VN') + ' ký tự · ~' + st.mins + ' phút đọc';
  }
  function parseAtMs(valStr) {
    var s = String(valStr == null ? '' : valStr).trim();
    if (!s) return 0;
    var t = Date.parse(s);
    if (isNaN(t)) t = Date.parse(s.replace(' ', 'T'));
    return isNaN(t) ? 0 : t;
  }
  function isoToLocalInput(iso) {
    var t = parseAtMs(iso);
    if (!t) return '';
    var d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }
  function localInputToIso(valStr) {
    var s = String(valStr == null ? '' : valStr).trim();
    if (!s) return '';
    var t = Date.parse(s);
    return isNaN(t) ? '' : new Date(t).toISOString();
  }
  function localInputPlusHours(hours) {
    var base = Date.now() + Number(hours || 1) * 3600000;
    return isoToLocalInput(new Date(base).toISOString());
  }
  function defaultScheduleLocalInput() {
    var d = new Date();
    d.setHours(20, 0, 0, 0);
    var ms = d.getTime() > Date.now() ? d.getTime() : (Date.now() + 3600000);
    return isoToLocalInput(new Date(ms).toISOString());
  }
  /* Mốc Date ĐÃ CỘNG +07:00 — đọc getDate()/getHours() ra LỊCH/ GIỜ Việt Nam
     trên mọi máy. Admin mở ở múi giờ khác từng thấy nhãn hẹn giờ lệch 7 tiếng
     so với lúc chương thật sự lên sóng. */
  function vnDate(ms) { return new Date((Number(ms) || Date.now()) + 7 * 3600000); }
  function vnStamp(ms) {
    var d = vnDate(ms);
    var z = function (n) { return ('0' + n).slice(-2); };
    return z(d.getUTCDate()) + '/' + z(d.getUTCMonth() + 1) + ' ' + z(d.getUTCHours()) + ':' + z(d.getUTCMinutes());
  }
  function chapterRowBadge(c) {
    if (!c) return '';
    var st = String(c.s || 'published').toLowerCase();
    var out = '';
    if (st === 'scheduled') {
      var ms = parseAtMs(c.d);
      if (!ms) out += M.badge ? '' : '';
      var lbl = 'Hẹn giờ';
      if (ms > Date.now()) lbl = 'Hẹn ' + vnStamp(ms);
      out += '<span class="badge tone-info">' + esc(lbl) + '</span>';
    } else if (st === 'hidden') {
      out += '<span class="badge tone-slate">Ẩn</span>';
    } else if (st === 'draft') {
      out += '<span class="badge tone-warn">Nháp</span>';
    }
    if (c._dirty) out += '<span class="badge tone-warn">Chưa lưu</span>';
    return out;
  }

  /* Bản nháp cục bộ theo từng (slug, index) trong localStorage */
  function draftStorageKey(slug, idx) {
    return slug ? ('cz_chapter_draft:' + slug + ':' + Number(idx || 0)) : '';
  }
  function readChapterDraft(slug, idx) {
    var k = draftStorageKey(slug, idx);
    if (!k) return null;
    var raw = lsGet(k);
    if (!raw) return null;
    try {
      var obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : null;
    } catch (e) { return null; }
  }
  function writeChapterDraft(slug, idx, payload) {
    var k = draftStorageKey(slug, idx);
    if (!k) return;
    lsSet(k, JSON.stringify({
      t: String(payload.t || ''),
      html: String(payload.html || ''),
      s: String(payload.s || 'published'),
      d: String(payload.d || ''),
      savedAt: payload.savedAt || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }));
  }
  function clearChapterDraft(slug, idx) {
    var k = draftStorageKey(slug, idx);
    if (!k) return;
    try { localStorage.removeItem(k); } catch (e) {}
  }
  function updateSaveNoteDom() {
    var n = D.getElementById('saveNote');
    if (!n) return;
    var slug = BOOK_SLUG || S.chapterBook || S.selectedBook || '';
    var draft = DIRTY_CHAPTER ? null : readChapterDraft(slug, S.activeChapter);
    if (S.conn === 'static') {
      n.textContent = 'Chế độ đọc tĩnh · chỉ đọc';
    } else if (DIRTY_CHAPTER) {
      n.textContent = '● Chưa lưu KV' + (DRAFT_SAVED_AT ? ' · giữ nháp ' + DRAFT_SAVED_AT : '');
    } else if (S.savedAt) {
      n.innerHTML = window.icon('check', 'xs') + ' Đã lưu KV lúc ' + esc(S.savedAt);
    } else if (draft && draft.savedAt) {
      n.textContent = '● Có nháp cục bộ lúc ' + draft.savedAt;
    } else {
      n.innerHTML = window.icon('check', 'xs') + ' Đã đồng bộ KV';
    }
  }
  function updateChapterStatsDom(html) {
    var el = D.getElementById('chapterStats');
    if (el) el.textContent = formatChapterStats(html);
  }
  function snapshotLiveEditor() {
    var ed = D.getElementById('editor');
    var curSlug = String(BOOK_SLUG || S.chapterBook || S.selectedBook || '');
    if (!ed || ed.getAttribute('data-book') !== curSlug) return;
    var idx = Number(ed.getAttribute('data-ch-idx'));
    if (isNaN(idx) || idx !== S.activeChapter) return;
    var rawStorage = htmlForStorage(ed.innerHTML);
    var tEl = D.getElementById('chapterTitle');
    var curTitle = tEl ? String(tEl.value || '') : ((S.chapters[idx] || {}).t || '');
    S.editorSeed = htmlForEditor(rawStorage);
    if (DIRTY_CHAPTER && S.chapters[idx]) {
      S.chapters[idx].t = curTitle;
      S.chapters[idx].html = rawStorage;
      S.chapters[idx].s = S.chapterStatus || 'published';
      S.chapters[idx].d = S.chapterStatus === 'scheduled' ? localInputToIso(S.chapterAt) : '';
      S.chapters[idx]._dirty = true;
      var stamp = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      DRAFT_SAVED_AT = stamp;
      writeChapterDraft(curSlug, idx, { t: curTitle, html: rawStorage, s: S.chapters[idx].s, d: S.chapters[idx].d, savedAt: stamp });
    }
  }

  /* Tách tên chương & tách nhiều chương .txt / .docx (khớp src/shared/chapters.js + docxChapters.js) */
  var CHAP_NUM_RE = /^(?:chương|chuong|chap|chapter|quyển|quyen|khổ|kho|hồi|hoi|tập|tap|ep(?:isode)?)\b\s*[-–—.]?\s*(\d+(?:[.,]\d+)?|[ivxlcdm]+)\s*[:.\-–—]?\s*(.*)$/i;
  var END_RE = /^(lời\s*kết|loi\s*ket|kết\s*truyện|ket\s*truyen|lời\s*bạt|loi\s*bat|bạt\s*truyện|bat\s*truyen|epilogue|hậu\s*truyện|hau\s*truyen)\s*(\d+(?:[.,]\d+)?)?\s*[:.\-–—]?\s*(.*)$/i;
  var AUTHOR_RE = /^(lời\s*tác\s*giả|loi\s*tac\s*gia|đôi\s*lời|doi\s*loi|lời\s*ngõ|loi\s*ngo|author'?s?\s*note|thông\s*báo|thong\s*bao|notice|credits?)\s*(\d+(?:[.,]\d+)?)?\s*[:.\-–—]?\s*(.*)$/i;
  var EXTRA_RE = /^(ngoại\s*truyện|ngoai\s*truyen|phụ\s*chương|phu\s*chuong|phiên\s*ngoại|phien\s*ngoai|side\s*story|extra|đặc\s*biệt|dac\s*biet)\s*(\d+(?:[.,]\d+)?|[ivxlcdm]+)?\s*[:.\-–—]?\s*(.*)$/i;
  var OPEN_RE = /^(lời\s*mở\s*đầu|loi\s*mo\s*dau|mở\s*đầu|mo\s*dau|prologue|giới\s*thiệu|gioi\s*thieu(\s*\S+)?|nhân\s*vật|nhan\s*vat)\s*(\d+(?:[.,]\d+)?)?\s*[:.\-–—]?\s*(.*)$/i;
  function isChapHeadingLine(line) {
    var t = String(line || '').trim();
    if (!t || t.length > 90) return false;
    var bare = t.replace(/^#{1,3}\s+/, '');
    if (CHAP_NUM_RE.test(bare) || EXTRA_RE.test(bare) || OPEN_RE.test(bare) || END_RE.test(bare) || AUTHOR_RE.test(bare)) return true;
    return /^#{1,3}\s+\S/.test(t) && t.length <= 60;
  }
  function suggestNextChapTitle(list) {
    var arr = Array.isArray(list) ? list : [];
    var maxMain = 0, mainCount = 0;
    arr.forEach(function (c) {
      var full = String((c && c.t) || '').trim();
      if (!full) return;
      if (EXTRA_RE.test(full) || END_RE.test(full) || OPEN_RE.test(full) || AUTHOR_RE.test(full)) return;
      var m = CHAP_NUM_RE.exec(full);
      if (m) {
        var n = parseFloat(String(m[1] || '').replace(',', '.')) || 0;
        if (n === 0) return;
        mainCount++;
        if (n > maxMain) maxMain = n;
        return;
      }
      mainCount++;
    });
    return 'Chương ' + (maxMain > 0 ? (Math.floor(maxMain) + 1) : (mainCount + 1));
  }
  function splitTxtIntoChapters(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [], cur = null;
    function flush() {
      if (!cur) return;
      var body = cur.lines.join('\n').trim();
      if (body) out.push({ t: cur.t || suggestNextChapTitle(out), html: textToHtml(body) });
      cur = null;
    }
    lines.forEach(function (line) {
      if (isChapHeadingLine(line)) {
        flush();
        cur = { t: line.trim().replace(/^#{1,3}\s*/, ''), lines: [] };
      } else {
        if (!cur) cur = { t: '', lines: [] };
        cur.lines.push(line);
      }
    });
    flush();
    return out;
  }
  function splitDocxHtmlIntoChapters(html) {
    var BLOCKS = toSetMap('p,div,h1,h2,h3,h4,h5,h6,blockquote,li,ul,ol,table,tr,td,th');
    var DROP = toSetMap('script,style,iframe,object,embed,svg,math,template,img,video,audio,input,button');
    var MARKS = { b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u', s: 's', strike: 's', del: 's', sub: 'sub', sup: 'sup' };
    var ORDER = ['strong', 'em', 'u', 's', 'sub', 'sup'];
    var root = D.createElement('template');
    root.innerHTML = String(html || '');
    var out = [], cur = null, runs = [], paragraph = [], hasText = false;
    function flushCh() { if (cur && cur.body.length) out.push({ t: cur.t || suggestNextChapTitle(out), html: cur.body.join('') }); cur = null; }
    function flushP() { if (hasText) { if (!cur) cur = { t: '', body: [] }; cur.body.push('<p>' + paragraph.join('<br>') + '</p>'); } paragraph = []; hasText = false; }
    function flushLn() {
      var text = runs.map(function (r) { return r.text.join(''); }).join('');
      if (isChapHeadingLine(text)) { flushP(); flushCh(); cur = { t: text.trim().replace(/^#{1,3}\s*/, ''), body: [] }; }
      else {
        paragraph.push(runs.map(function (r) {
          var s = esc(r.text.join(''));
          return r.marks.map(function (m) { return '<' + m + '>'; }).join('') + s + r.marks.slice().reverse().map(function (m) { return '</' + m + '>'; }).join('');
        }).join(''));
        if (text.trim()) hasText = true;
      }
      runs = [];
    }
    function boundary() { if (runs.length) flushLn(); flushP(); }
    var stack = [{ node: root.content, marks: [] }];
    while (stack.length) {
      var item = stack.pop();
      if (item.end) { boundary(); continue; }
      var node = item.node, marks = item.marks;
      if (node.nodeType === 3) {
        if (!node.nodeValue) continue;
        var key = marks.join(','), last = runs[runs.length - 1];
        if (last && last.key === key) last.text.push(node.nodeValue);
        else runs.push({ key: key, marks: marks, text: [node.nodeValue] });
        continue;
      }
      if (node.nodeType !== 1 && node.nodeType !== 11) continue;
      var tag = (node.localName || '').toLowerCase();
      if (DROP[tag]) continue;
      if (tag === 'br') { flushLn(); continue; }
      if (BLOCKS[tag]) { boundary(); stack.push({ end: true }); }
      var mark = MARKS[tag];
      var nextMarks = (mark && marks.indexOf(mark) < 0) ? ORDER.filter(function (m) { return m === mark || marks.indexOf(m) >= 0; }) : marks;
      for (var ch = node.lastChild; ch; ch = ch.previousSibling) stack.push({ node: ch, marks: nextMarks });
    }
    boundary(); flushCh();
    return out;
  }
  function convertDocxBuffer(arrayBuffer) {
    return new Promise(function (resolve, reject) {
      if (typeof Worker === 'undefined') {
        reject(new Error('Trình duyệt không hỗ trợ đọc file Word (.docx).'));
        return;
      }
      var worker, timer, settled = false;
      function done(err, data) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (worker) worker.terminate();
        if (err) reject(err); else resolve(data);
      }
      try {
        worker = new Worker('/admin-docx.js');
        worker.onmessage = function (ev) {
          var d = ev && ev.data;
          if (!d || typeof d.html !== 'string') done(new Error((d && d.error) || 'Không đọc được nội dung file DOCX.'));
          else done(null, d);
        };
        worker.onerror = function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          done(new Error('Không khởi chạy được bộ đọc Word (/admin-docx.js).'));
        };
        timer = setTimeout(function () { done(new Error('Đọc file Word quá 90 giây. Hãy chia nhỏ file.')); }, 90000);
        worker.postMessage(arrayBuffer, [arrayBuffer]);
      } catch (err) {
        done(new Error('Không đọc được file DOCX: ' + (err.message || err)));
      }
    });
  }

  /* Worker là nguồn sự thật của số chương VÀ NGÀY CẬP NHẬT (xem
     syncCountToRegistry trong worker/cms.js): nó ghi `updated` khi có chương
     mới lên sóng. Bản registry admin đang giữ trong bộ nhớ thì cũ, nên phải vá
     theo đúng phản hồi vừa nhận — nếu không, lần bấm “Lưu trang chủ” kế tiếp
     (ghi CẢ registry) sẽ đẩy ngày cũ trở lại KV, xoá mất việc Worker vừa làm.
     Ngày chỉ TIẾN: phản hồi cũ/vắng thì giữ nguyên ngày đang có. */
  /* Trước khi ghi registry từ trang Sửa bộ: số chương + nhãn của bộ đang sửa
     phải lấy theo BẢN LƯU, không lấy bản trong RAM. Ca thật: mở admin (RAM có
     18 chương) → đăng thêm 6 chương (bản lưu 24) → bấm Lưu bộ ⇒ đường cũ ghi
     \`chapters: 18\` trở lại KV, web lại hiện số cũ. Hàm này trả về bản meta của
     bộ đang sửa đã đắp số chương thật; lỗi đọc thì trả null (giữ nguyên). */
  /* đếm chương ĐANG HIỆN của bộ đang mở trong admin (khớp isChapterPending của
     web/admin); bộ khác hoặc chưa tải thì trả -1 = “không biết, đừng sửa” */
  function liveCountOfBook(slug) {
    if (!slug || BOOK_SLUG !== slug || !BOOK || !Array.isArray(BOOK.chapters)) return -1;
    var live = 0;
    BOOK.chapters.forEach(function (c) {
      var st = String((c && (c.status || c.s)) || 'published').toLowerCase();
      var at = parseAtMs(c && (c.at || c.d));
      if (!(st === 'hidden' || st === 'draft' || (st === 'scheduled' && at > Date.now()))) live++;
    });
    return live;
  }
  /* vá meta của MỘT bộ trong bản registry sắp ghi: số chương lấy từ bản lưu,
     nhãn tính lại, và chỉ đặt ngày khi bộ CHƯA có ngày (không đè ngày mới hơn
     mà Worker vừa ghi). */
  function syncMetaCounts(reg, slug, live) {
    if (!reg || !Array.isArray(reg.lib) || !slug || !(live >= 0)) return false;
    var m = null;
    for (var i = 0; i < reg.lib.length; i++) { if (reg.lib[i] && reg.lib[i].slug === slug) { m = reg.lib[i]; break; } }
    if (!m) return false;
    var changed = false;
    if (Number(m.chapters) !== live) { m.chapters = live; changed = true; }
    var raw = String(m.countLabel || '');
    var plannedRaw = raw.split('/')[1] || '';
    var planned = plannedRaw.trim() === '—' ? 0 : (parseInt(plannedRaw, 10) || 0);
    var label = live ? (live + '/' + Math.max(planned, live)) : (planned > 0 ? '0/' + planned : '0/—');
    if (String(m.countLabel || '') !== label) { m.countLabel = label; changed = true; }
    if (!m.updated) { m.updated = today(); changed = true; }
    return changed;
  }

  function applySyncMeta(m, sync) {
    if (!m || !sync) return false;
    var changed = false;
    /* số chương + nhãn: chép đúng con số Worker vừa tính (cả tăng lẫn giảm —
       xoá chương là giảm thật, không được giữ số cũ) */
    if (Number.isFinite(Number(sync.now)) && Number(m.chapters) !== Number(sync.now)) { m.chapters = Number(sync.now); changed = true; }
    if (sync.labelNow && String(m.countLabel || '') !== String(sync.labelNow)) { m.countLabel = String(sync.labelNow); changed = true; }
    var upd = String(sync.updated || '').slice(0, 10);
    if (upd && upd > String(m.updated || '').slice(0, 10)) { m.updated = upd; changed = true; }
    if (sync.pending) { m.pending = sync.pending; if (sync.schedNext) m.schedNext = sync.schedNext; else delete m.schedNext; }
    else { delete m.pending; delete m.schedNext; }
    return changed;
  }

  function syncBookCountsInState(slug, chaptersArr) {
    var list = Array.isArray(chaptersArr) ? chaptersArr : [];
    var now = Date.now();
    var pending = 0, visible = 0;
    list.forEach(function (c) {
      var st = String((c && (c.status || c.s)) || 'published').toLowerCase();
      var at = parseAtMs(c && (c.at || c.d));
      /* phải khớp isChapterPending() của src/shared/schedule.js: nháp cũng là
         “chưa lên sóng”, nếu không admin đếm 3 chương còn web chỉ thấy 2. */
      var held = st === 'hidden' || st === 'draft' || (st === 'scheduled' && at > now);
      if (held) pending++; else visible++;
    });
    var b = (S.books || []).find(function (x) { return x.id === slug; });
    if (b) { b.ch = visible; b.pending = pending; }
    var m = findMeta(slug);
    if (m) { m.chapters = visible; m.pending = pending; }
  }

  function applyBook(slug, book, keepIdx) {
    BOOK_SLUG = slug; BOOK = book || { chapters: [] };
    var arr = Array.isArray(BOOK.chapters) ? BOOK.chapters : [];
    S.chapters = arr.map(function (c, i) {
      return { t: c.t || c.title || ('Chương ' + (i + 1)), b: titleOf(slug), s: c.status || c.s || 'published', d: c.at || c.d || '', html: c.html || '', _dirty: false };
    });
    S.activeChapter = keepIdx
      ? Math.max(0, Math.min(S.activeChapter || 0, Math.max(0, S.chapters.length - 1)))
      : 0;
    S.chapterBook = slug;
    delete S.models['chapter-title'];
    S.savedAt = '';
    syncChaptersToState();
    syncBookCountsInState(slug, arr);
  }
  function loadBook(slug, quiet, keepIdx) {
    if (!slug) return Promise.resolve(null);
    CHAPTER_LOAD = { slug: slug, status: 'loading', error: '', missing: false, at: '' };
    return apiCall('/api/book/' + encodeURIComponent(slug)).then(function (r) {
      var b = (r && r.book && Array.isArray(r.book.chapters)) ? r.book : r;
      applyBook(slug, b, keepIdx);
      CHAPTER_LOAD = { slug: slug, status: 'ok', error: '', missing: false, at: '' };
      if (!quiet) redraw();
      return b;
    }).catch(function (e) {
      /* 404 = bộ chưa có dữ liệu chương (không phải lỗi hệ thống) — vẫn mở được
         khung soạn để tạo chương đầu. 500/mạng = lỗi tải, phải hiện Thử lại. */
      var st = e && e.status;
      CHAPTER_LOAD = {
        slug: slug, status: 'error',
        error: String((e && e.message) || 'Không rõ lỗi'),
        missing: st === 404, at: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      if (!quiet) redraw();
      throw e;
    });
  }
  function loadStaticBook(slug) {
    if (!slug) return Promise.resolve(null);
    CHAPTER_LOAD = { slug: slug, status: 'loading', error: '', missing: false, at: '' };
    return fetch('/data/book/' + encodeURIComponent(slug) + '.json', { cache: 'no-store' })
      .then(function (r) {
        if (r.ok) return r.json();
        CHAPTER_LOAD = { slug: slug, status: 'error', error: 'Không thấy tệp /data/book/' + slug + '.json', missing: r.status === 404, at: '' };
        redraw();
        return null;
      })
      .then(function (b) { if (b) { applyBook(slug, b); CHAPTER_LOAD = { slug: slug, status: 'ok', error: '', missing: false, at: '' }; } redraw(); return b; })
      .catch(function (e) {
        CHAPTER_LOAD = { slug: slug, status: 'error', error: String((e && e.message) || 'Không đọc được tệp'), missing: false, at: '' };
        redraw();
        return null;
      });
  }

  function revertChapterBook() {
    if (BOOK_SLUG && S.chapterBook !== BOOK_SLUG) {
      S.chapterBook = BOOK_SLUG;
      redraw();
    }
  }

  function loadComments() {
    return apiCall('/api/admin/comments?limit=800').then(function (r) {
      var list = r.comments || r.items || [];
      S.comments = list.map(function (c, i) {
        return {
          id: c.id || ('c' + i), r: c.name || c.uid || 'Bạn đọc', b: titleOf(c.slug),
          /* giữ số chương: trước bị bỏ nên mọi bình luận của một bộ trông giống
             nhau, không biết đang nói về chương nào */
          ch: Number(c.ch) || 0,
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
          /* vòng 18d: giữ slug để nút “Mở bộ” trên dòng báo lỗi đi đúng chỗ */
          slug: x.slug || '',
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
  function fmtLogTime(at) {
    var d = new Date(at);
    if (!at || isNaN(d.getTime())) return String(at || '').slice(0, 16).replace('T', ' ');
    /* giờ Việt Nam: Worker ghi log bằng ISO UTC, đọc theo giờ máy thì người mở
       admin ở múi giờ khác thấy lệch (và lệch cả ngày khi qua nửa đêm) */
    var v = vnDate(d.getTime());
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(v.getUTCDate()) + '/' + p(v.getUTCMonth() + 1) + '/' + v.getUTCFullYear() + ' ' + p(v.getUTCHours()) + ':' + p(v.getUTCMinutes());
  }
  function guessLogKind(text) {
    var t = String(text || '');
    if (/chương|chapter/i.test(t)) return 'chuong';
    if (/xoá bộ|lưu bộ|tạo bộ|bộ /.test(t)) return 'bo';
    if (/registry|homepage/i.test(t)) return 'registry';
    if (/bình luận/i.test(t)) return 'binh-luan';
    if (/báo lỗi/i.test(t)) return 'bao-loi';
    if (/phiếu/i.test(t)) return 'phieu';
    if (/ảnh|bìa/i.test(t)) return 'anh';
    if (/khóa|mật mã|đăng nhập|đăng xuất/i.test(t)) return 'bao-mat';
    return 'he-thong';
  }
  function loadLog() {
    return apiCall('/api/admin/log').then(function (r) {
      var list = r.items || r.log || [];
      replaceArr(M.SAMPLE_LOGS, list.slice(0, 200).map(function (x) {
        /* Bản ghi cũ (trước 18/11) chỉ có {at,text,who}: kind suy từ tiền tố
           câu chữ để bộ lọc vẫn dùng được; target để trống chứ KHÔNG lặp lại
           nguyên câu “Thao tác” ở cột Đối tượng như trước. */
        return {
          t: fmtLogTime(x.at),
          a: x.who || 'admin-key',
          k: x.kind || guessLogKind(x.text || ''),
          x: x.text || x.action || 'Thao tác',
          o: x.target || ''
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
  var STATS_ITEMS = {};   /* /api/admin/stats · dùng để biết bộ nào CÓ phiếu */
  /* Toàn bộ dữ liệu tab Thống kê, giữ đúng những gì Worker trả về. */
  var STATS = { items: {}, days: [], chapters: [], top: 0, votes: 0 };
  function loadStats() {
    return apiCall('/api/admin/stats').then(function (r) {
      var items = r.items || {}, days = r.days || [];
      STATS_ITEMS = items;
      var all = Object.keys(items).map(function (slug) {
        var it = items[slug] || {};
        return { slug: slug, name: titleOf(slug), views: Number(it.views || 0),
          votes: Number(it.votes || 0), voters: Number(it.voters || 0),
          today: Number(it.viewsDay || 0), chap: it.chapVotes || {} };
      });
      var pairs = all.filter(function (x) { return x.views || x.votes; })
        .sort(function (a, b) { return b.views - a.views; }).slice(0, 5);
      /* KHÔNG đệm dòng “—” cho đủ 5: dòng tên “—” với 0 lượt đọc trông y như
         một bộ thật tên “—” trong KV. Ít dữ liệu thì hiện ít dòng. */
      replaceArr(M.SAMPLE_STATS.reads, pairs.map(function (p) { return [p.name, p.views]; }));
      replaceArr(M.SAMPLE_STATS.likes, pairs.map(function (p) { return [p.name, p.votes]; }));
      replaceArr(M.SAMPLE_STATS.voters, pairs.map(function (p) { return [p.name, p.voters]; }));
      replaceArr(M.SAMPLE_STATS.today, pairs.map(function (p) { return [p.name, p.today]; }));

      /* S1: “Phiếu theo chương” phải đọc chapVotes của Worker. Bản trước đọc
         state.votes (danh sách NGƯỜI bầu) nên luôn rỗng dù KV có phiếu. */
      var chapters = [];
      all.forEach(function (x) {
        Object.keys(x.chap || {}).forEach(function (ch) {
          var n = Number(x.chap[ch] || 0);
          if (n > 0) chapters.push({ book: x.name, ch: String(ch), n: n });
        });
      });
      chapters.sort(function (a, b) { return b.n - a.n; });
      STATS = {
        items: items, days: days,
        chapters: chapters.slice(0, 12),
        top: all.filter(function (x) { return x.views || x.votes; }).length,
        votes: pairs.reduce(function (a, x) { return a + x.votes; }, 0),
        views: pairs.reduce(function (a, x) { return a + x.views; }, 0),
      };
      replaceArr(M.SAMPLE_READS, days.slice(-30).map(function (d) { return Number(d.views || 0); }));
      if (!M.SAMPLE_READS.length) replaceArr(M.SAMPLE_READS, [0]);
    });
  }
  window.__czStats = function () { return STATS; };
  function loadVoters() {
    var all = (REG.lib || []).map(function (m) { return m.slug; }).filter(Boolean);
    var hot = all.filter(function (sl) {
      var it = STATS_ITEMS[sl] || {};
      return (Number(it.voters) || 0) > 0 ||
        (it.chapVotes && Object.keys(it.chapVotes).length > 0);
    });
    var slugs = (hot.length ? hot : all.slice(0, 12)).slice(0, 40);
    return Promise.all(slugs.map(function (slug) {
      return apiCall('/api/admin/voters?slug=' + encodeURIComponent(slug))
        .then(function (r) {
          var book = (r && (r.book || r.items)) || [];
          var list = Array.isArray(book) ? book : (Array.isArray(book.voters) ? book.voters : []);
          var rows = list.map(function (v) {
            return {
              k: v.key || v.id || v.name || 'Độc giả', b: titleOf(slug), d: String(v.at || v.t || '').slice(0, 10),
              /* giữ bộ + chương của CHÍNH phiếu: trước đây gỡ/reset phiếu lấy
                 S.selectedBook (bộ đang sửa) nên rất dễ ghi sai bộ. */
              s: slug, ch: Number(v.ch) || 0, kind: v.kindLabel || ''
            };
          });
          /* phiếu từng chương nằm ở r.chapters, không ở book.voters */
          Object.keys((r && r.chapters) || {}).forEach(function (n) {
            (((r.chapters || {})[n] || {}).voters || []).forEach(function (v) {
              rows.push({
                k: v.key || v.id || 'Độc giả', b: titleOf(slug), d: String(v.at || v.t || '').slice(0, 10),
                s: slug, ch: Number(n) || 0, kind: v.kindLabel || ''
              });
            });
          });
          return rows;
        }).catch(function () { return []; });
    })).then(function (groups) {
      var flat = []; groups.forEach(function (g) { flat = flat.concat(g); });
      S.votes = flat.slice(0, 200);
    });
  }

  function loadAll(regP) {
    var first = regP || apiCall('/api/registry').then(function (reg) {
      hydrate(reg); redraw();
    });
    return first.then(function () {
      return Promise.allSettled([
        loadComments(), loadReports(),
        loadStats() /* voters gắn sau loadStats — cần STATS_ITEMS */.then(function () { return loadVoters().catch(function () {}); }),
        loadLog(), loadKv(), loadBook(S.selectedBook, true)
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
    /* Nạp lại dữ liệu thì trang chủ lấy bản mới làm mốc “đã lưu” (nếu không
       sẽ báo ● Chưa lưu oan cho mọi thay đổi của người khác). */
    if (typeof window.hpClear === 'function') window.hpClear();
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
    /* `updated` = NGÀY CÓ CHƯƠNG MỚI (worker tự ghi khi số chương đọc được
       tăng). Sửa mô tả / ảnh bìa / tình trạng mà gán lại hôm nay là bịa “vừa
       cập nhật”: trang chủ nhảy ngày dù độc giả chẳng có chương nào mới. Chỉ
       dùng ngày hôm nay cho BỘ MỚI (chưa có ngày). */
    out.updated = m.updated || out.updated || today();
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
  /* --------------------------------------------------------------------------
     CHẶN GHI ĐÈ NGÀY CẬP NHẬT Ở TẦNG GHI (đừng bỏ, rất dễ tái phát)
     --------------------------------------------------------------------------
     REG là ẢNH CHỤP registry lúc mở /admin. Worker thì tự bump `updated` của
     một bộ ngay khi có chương mới lên sóng (syncCountToRegistry). Admin ghi lại
     cả registry (Lưu trang chủ, lưu metadata, mốc lịch, xoá bộ, nhân bản…) mà
     dùng bản trong RAM là mỗi lần lưu lại đẩy NGÀY CŨ trở lại KV — đăng chương
     xong trang chủ vẫn hiện ngày cũ (đúng lỗi chủ trang báo 20/11).
     Nên: đọc bản mới nhất từ KV rồi hợp nhất NGÀY (chỉ tiến). Chỉ trường
     `updated` được lấy từ KV; `chapters`/`countLabel` giữ nguyên bản admin vì
     chủ trang có thể vừa sửa tay. Đọc lỗi thì ghi như cũ (không chặn thao tác).
  ------------------------------------------------------------------------- */
  function mergeNewerUpdated(next, current) {
    if (!next || !current || !Array.isArray(next.lib) || !Array.isArray(current.lib)) return false;
    var fresh = {};
    current.lib.forEach(function (m) { if (m && m.slug) fresh[String(m.slug)] = String(m.updated || '').slice(0, 10); });
    var touched = false;
    next.lib.forEach(function (m) {
      if (!m || !m.slug) return;
      var kvDay = fresh[String(m.slug)] || '';
      if (kvDay && kvDay > String(m.updated || '').slice(0, 10)) { m.updated = kvDay; touched = true; }
    });
    return touched;
  }
  function putRegistryLatest(next) {
    return apiCall('/api/registry').then(function (current) {
      /* chỉ nhận object registry hợp lệ; lỗi/khác kiểu thì bỏ qua */
      if (current && Array.isArray(current.lib)) mergeNewerUpdated(next, current);
      return null;
    }, function () { return null; }).then(function () {
      return apiCall('/api/registry', { method: 'PUT', body: next });
    });
  }
  function writeRegistry(reg, force) {
    var next = touch(clone(reg), 'ghi registry từ admin ssochuz');
    if (force) next.force = true;
    return putRegistryLatest(next).then(function () {
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
    /* Chương đầu tiên của bộ mới cũng là NHÁP: bộ vừa tạo chưa ai đọc lại.
       countLabel đếm theo chương ĐANG HIỆN nên bộ mới = 0/1, không phải 1/1. */
    var chapters = first ? [{ t: 'Chương 1', html: textToHtml(first), status: 'draft' }] : [];
    var meta = metaFromForm({}, {
      title: t, slug: sl, author: a, year: val('nb-year') || String(new Date().getFullYear()),
      status: S.models['nb-st'] || 'Đang cập nhật', countLabel: chapters.length ? '0/1' : '0/—',
      is18: checked('nb-18'), synopsis: val('nb-sum'), pubStatus: S.models['nb-pub'] || 'draft',
      visibility: S.models['nb-vis'] || 'public', thumb: S.models['nb-cover'] || ''
    }, couples);
    meta.chapters = 0;
    var book = { title: t, slug: sl, author: a, couple: meta.couple, chapters: chapters };
    if (meta.couples && meta.couples.length > 1) book.couples = meta.couples.slice();
    var next = clone(REG); next.lib = (next.lib || []).concat([meta]);
    apiCall('/api/book/' + encodeURIComponent(sl), { method: 'PUT', body: book, timeout: 120000 })
      .then(function () { WRITES += 1; return writeRegistry(next); })
      .then(function () {
        Object.keys(S.models).forEach(function (k) { if (k.indexOf('nb-') === 0) delete S.models[k]; });
        S.couples.nb = ['']; S.selectedBook = sl;
        applyBook(sl, book);
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
    /* Chỉ dự phòng lấy couple cũ khi form CHƯA nạp couple (S.couples.eb chưa là mảng).
       Khi đã nạp — kể cả chọn "Không có couple" ⇒ mảng rỗng — phải tôn trọng giá trị
       form, không quay lại couple cũ, nếu không clear couple không生效. */
    if (!couples.length && !Array.isArray(S.couples.eb)) couples = String(base.couple || '').split(/,\s*/).filter(Boolean);
    var meta = metaFromForm(base, {
      title: t, slug: sl, author: a, year: val('eb-year') || base.year || '',
      status: S.models['eb-st'] || base.status, countLabel: base.countLabel,
      is18: checked('eb-18'), synopsis: val('eb-sum'), pubStatus: S.models['eb-pub'] || base.pubStatus || 'published',
      visibility: S.models['eb-vis'] || base.visibility || 'public', thumb: S.models['eb-cover'] || base.thumb || '',
      publishedAt: base.publishedAt || ''
    }, couples);
    meta.chapters = Number(base.chapters) || 0;
    var next = clone(REG);
    var idx = (next.lib || []).findIndex(function (m) { return m.slug === oldSlug; });
    if (idx < 0) { say('Registry không còn bộ này.', 'bad'); return; }
    next.lib[idx] = meta;
    /* số chương/nhãn của bộ ĐANG SỬA lấy theo bản lưu đã tải (nguồn sự thật),
       không theo con số cũ trong RAM — xem syncMetaCounts(). */
    try { syncMetaCounts(next, oldSlug, liveCountOfBook(oldSlug)); } catch (e) {}
    function renameRefs(reg, from, to) {
      if (from === to) return;
      function ren(list) {
        return list.map(function (x) {
          var s = typeof x === 'string' ? x : (x && x.slug);
          if (s !== from) return x;
          return typeof x === 'string' ? to : Object.assign({}, x, { slug: to });
        });
      }
      ['slides', 'editorChoice'].forEach(function (key) {
        if (Array.isArray(reg[key])) reg[key] = ren(reg[key]);
      });
      if (reg.settings && Array.isArray(reg.settings.editorChoice)) {
        reg.settings.editorChoice = ren(reg.settings.editorChoice);
      }
      if (reg.schedule && Array.isArray(reg.schedule.items)) {
        reg.schedule.items = reg.schedule.items.map(function (x) {
          return (x && x.slug === from) ? Object.assign({}, x, { slug: to }) : x;
        });
      }
    }
    var chain, moved = null;
    if (sl !== oldSlug) {
      chain = apiCall('/api/book/' + encodeURIComponent(oldSlug))
        .then(function (b) {
          moved = Object.assign({}, b, { slug: sl, title: t, author: a, couple: meta.couple });
          if (meta.couples && meta.couples.length > 1) moved.couples = meta.couples.slice();
          return apiCall('/api/book/' + encodeURIComponent(sl), { method: 'PUT', body: moved, timeout: 120000 });
        })
        .then(function () { WRITES += 1; renameRefs(next, oldSlug, sl); return writeRegistry(next); })
        .then(function () { return apiCall('/api/book/' + encodeURIComponent(oldSlug), { method: 'DELETE' }).catch(function () {}); })
        .then(function () { WRITES += 1; });
    } else chain = writeRegistry(next);
    chain.then(function () {
      S.selectedBook = sl; window.initEditModels(M.getBook(sl));
      if (sl !== oldSlug && moved && (BOOK_SLUG === oldSlug || !BOOK_SLUG)) {
        applyBook(sl, moved, true);
      }
      say('Đã lưu metadata “' + t + '” lên KV.'); redraw();
    }).catch(fail);
  }

  function dropBookRefs(reg, slug) {
    function keep(x) {
      var s = typeof x === 'string' ? x : x && x.slug;
      return s !== slug;
    }
    ['slides', 'editorChoice'].forEach(function (key) {
      if (Array.isArray(reg[key])) reg[key] = reg[key].filter(keep);
    });
    if (reg.settings && Array.isArray(reg.settings.editorChoice)) {
      reg.settings.editorChoice = reg.settings.editorChoice.filter(keep);
    }
    if (reg.schedule && Array.isArray(reg.schedule.items)) {
      reg.schedule.items = reg.schedule.items.filter(function (x) { return !(x && x.slug === slug); });
    }
  }
  function realDeleteBook(id) {
    if (!ensureOnline()) return;
    var slug = id || S.selectedBook;
    var b = (REG.lib || []).find(function (m) { return m.slug === slug; });
    if (!b) { say('Không tìm thấy bộ.', 'bad'); return; }
    M.openStrong('Xoá bộ truyện khỏi KV', 'Gõ đúng slug để xoá vĩnh viễn bộ và toàn bộ chương trên KV.', slug, function () {
      var next = clone(REG);
      next.lib = (next.lib || []).filter(function (m) { return m.slug !== slug; });
      dropBookRefs(next, slug);
      apiCall('/api/book/' + encodeURIComponent(slug), { method: 'DELETE' })
        .then(function () { WRITES += 1; return writeRegistry(next, !next.lib.length); })
        .then(function () {
          S.sel.delete(slug);
          if (S.selectedBook === slug) S.selectedBook = (S.books[0] || {}).id || null;
          if (BOOK_SLUG === slug) {
            BOOK_SLUG = ''; BOOK = null; S.chapters = []; S.activeChapter = 0;
            delete S.models['chapter-title']; syncChaptersToState();
            S.chapterBook = S.selectedBook;
            if (S.selectedBook) loadBook(S.selectedBook).catch(function () {});
          } else if (S.chapterBook === slug) {
            S.chapterBook = BOOK_SLUG || S.selectedBook;
          }
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

  function realSaveChapter(forceStatus) {
    if (!ensureOnline()) return;
    var slug = BOOK_SLUG;
    if (!slug) { say('Chưa nạp dữ liệu chương — chọn bộ rồi bấm Quản lý chương.', 'bad'); return; }
    var idx = Math.max(0, Math.min(S.activeChapter || 0, S.chapters.length));
    var titleEl = D.getElementById('chapterTitle');
    var title = String(titleEl ? titleEl.value : ((S.chapters[idx] || {}).t || '')).trim() || suggestNextChapTitle(S.chapters.slice(0, idx));
    var ed = D.getElementById('editor');
    var rawDom = ed ? ed.innerHTML : (S.editorSeed || '');
    if (/\bsrc\s*=\s*['"]?\s*(?:blob:|data:)/i.test(rawDom)) {
      say('Còn ảnh tạm (blob:/data:) chưa tải lên Worker — hãy dùng nút Ảnh vào chương.', 'bad');
      return;
    }
    var html = htmlForStorage(rawDom);
    /* Không có trạng thái đang chọn (chương hoàn toàn mới) ⇒ NHÁP, không phải
       xuất bản: bản cũ mặc định 'published' nên bấm Lưu là lên sóng luôn. */
    var status = forceStatus || S.chapterStatus || (S.chapters[idx] && S.chapters[idx].s) || 'draft';
    S.chapterStatus = status;
    var atIso = status === 'scheduled' ? localInputToIso(S.chapterAt) : '';
    var body = { index: idx, chapter: { t: title, html: html, status: status, at: atIso } };
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: body, timeout: 120000 })
      .then(function (res) {
        WRITES += 1; setQuota();
        /* vá số chương + NGÀY CẬP NHẬT theo Worker (nó vừa ghi ngày mới) */
        applySyncMeta(findMeta(slug), res && res.registry);
        if (!BOOK || typeof BOOK !== 'object') BOOK = { chapters: [] };
        if (!Array.isArray(BOOK.chapters)) BOOK.chapters = [];
        BOOK.chapters[idx] = body.chapter;
        var row = { t: title, b: titleOf(slug), s: status, d: atIso, html: html, _dirty: false };
        if (S.chapters[idx]) S.chapters[idx] = row;
        else S.chapters.push(row);
        S.activeChapter = idx;
        delete S.models['chapter-title'];
        clearChapterDraft(slug, idx);
        DIRTY_CHAPTER = false; DRAFT_SAVED_AT = '';
        S.editorSeed = htmlForEditor(html);
        FORCE_EDITOR_SEED = true;
        S.savedAt = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        syncBookCountsInState(slug, BOOK.chapters);
        say(status === 'draft'
          ? ('Đã lưu NHÁP "' + title + '" · độc giả chưa thấy — bấm Xuất bản khi soạn xong.')
          : status === 'published'
            ? ('Đã xuất bản "' + title + '" · độc giả đọc được ngay.')
            : status === 'scheduled'
              ? ('Đã lưu "' + title + '" · chương lên sóng đúng mốc giờ đã đặt.')
              : ('Đã lưu "' + title + '" ở trạng thái Ẩn · độc giả không thấy.'));
        redraw();
      }).catch(fail);
  }
  function realChapterAdd() {
    if (!ensureOnline()) return;
    var slug = BOOK_SLUG;
    if (!slug) { say('Chưa nạp dữ liệu chương — chọn bộ rồi bấm Quản lý chương.', 'bad'); return; }
    snapshotLiveEditor();
    var idx = S.chapters.length;
    var nextTitle = suggestNextChapTitle(S.chapters);
    /* Chương mới LUÔN vào dạng nháp: nội dung còn trống, chưa ai biên tập.
       Bản cũ để 'published' nên vừa bấm Thêm là độc giả đã thấy một chương
       rỗng ngoài web. */
    var ch = { t: nextTitle, html: '<p>' + esc(nextTitle) + '</p>', status: 'draft' };
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { index: idx, chapter: ch } })
      .then(function (res) {
        WRITES += 1; setQuota();
        applySyncMeta(findMeta(slug), res && res.registry);
        if (!BOOK || typeof BOOK !== 'object') BOOK = { chapters: [] };
        if (!Array.isArray(BOOK.chapters)) BOOK.chapters = [];
        BOOK.chapters[idx] = ch;
        S.chapters.push({ t: ch.t, b: titleOf(slug), s: 'draft', d: '', html: ch.html, _dirty: false });
        S.activeChapter = idx;
        S.editorPreview = false;
        delete S.models['chapter-title'];
        syncChaptersToState();
        syncBookCountsInState(slug, BOOK.chapters);
        say('Đã thêm "' + ch.t + '" ở dạng NHÁP · độc giả chưa thấy. Soạn xong bấm Xuất bản.', 'info');
        redraw();
        var tInp = D.getElementById('chapterTitle');
        if (tInp) { tInp.focus(); try { tInp.select(); } catch (e) {} }
      }).catch(fail);
  }
  function realChapterDelete(idx) {
    if (!ensureOnline()) return;
    var slug = BOOK_SLUG;
    if (!slug) { say('Chưa nạp dữ liệu chương — chọn bộ rồi bấm Quản lý chương.', 'bad'); return; }
    if (!S.chapters[idx]) return;
    var victimTitle = S.chapters[idx].t || ('Chương ' + (idx + 1));
    M.openStrong('Xoá chương khỏi KV', 'Xoá "' + victimTitle + '" · không hoàn tác.', 'XOÁ', function () {
      apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { index: idx, remove: true } })
        .then(function (res) {
          WRITES += 1; setQuota();
          applySyncMeta(findMeta(slug), res && res.registry);
          clearChapterDraft(slug, idx);
          if (BOOK && Array.isArray(BOOK.chapters)) BOOK.chapters.splice(idx, 1);
          S.chapters.splice(idx, 1);
          S.activeChapter = Math.max(0, Math.min(idx, Math.max(0, S.chapters.length - 1)));
          delete S.models['chapter-title'];
          syncChaptersToState();
          syncBookCountsInState(slug, BOOK ? BOOK.chapters : []);
          say('Đã xoá chương "' + victimTitle + '" trên KV.');
          redraw();
        }).catch(fail);
    }, 'Xoá chương');
  }
  function realChapterMove(idx, dir) {
    if (!ensureOnline()) return;
    var to = idx + dir, slug = BOOK_SLUG;
    if (!slug) { say('Chưa nạp dữ liệu chương — chọn bộ rồi bấm Quản lý chương.', 'bad'); return; }
    if (to < 0 || to >= S.chapters.length) return;
    snapshotLiveEditor();
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { from: idx, to: to } })
      .then(function (res) { applySyncMeta(findMeta(slug), res && res.registry); return res; })
      .then(function () {
        WRITES += 1; setQuota();
        if (BOOK && Array.isArray(BOOK.chapters)) { var t = BOOK.chapters[idx]; BOOK.chapters[idx] = BOOK.chapters[to]; BOOK.chapters[to] = t; }
        var tmp = S.chapters[idx]; S.chapters[idx] = S.chapters[to]; S.chapters[to] = tmp;
        if (S.activeChapter === idx) S.activeChapter = to;
        else if (S.activeChapter === to) S.activeChapter = idx;
        delete S.models['chapter-title'];
        syncChaptersToState();
        say('Đã đổi thứ tự chương trên KV.');
        redraw();
      }).catch(fail);
  }
  function syncChaptersToState() {
    var cur = S.chapters[S.activeChapter] || null;
    S.editorSeed = htmlForEditor(cur ? cur.html : '');
    /* Chưa có chương nào để mở ⇒ đang viết chương MỚI ⇒ mặc định Nháp.
       Chương đã có luôn mang trạng thái của chính nó (dữ liệu cũ không có
       trường status được applyBook quy về 'published'). */
    S.chapterStatus = (cur && cur.s) || 'draft';
    S.chapterAt = cur && cur.d ? isoToLocalInput(cur.d) : '';
    DIRTY_CHAPTER = !!(cur && cur._dirty);
    DRAFT_SAVED_AT = '';
    FORCE_EDITOR_SEED = true;
  }

  function realDeleteComment(id) {
    if (!ensureOnline()) return;
    var c = S.comments.find(function (x) { return x.id === id; });
    if (!c) return;
    /* Vòng 18d: xoá 2 bước mà hộp thoại chỉ nói “xoá bình luận” thì người quản
       lý không biết mình đang xoá bình luận NÀO — phải thấy người gửi, nội
       dung và bộ. */
    var who = c.r || 'Bạn đọc';
    var excerpt = String(c.txt || '').slice(0, 140) + (String(c.txt || '').length > 140 ? '…' : '');
    var about = '"' + excerpt + '" — ' + who + ' · ' + (c.b || '') + (c.date ? ' · ' + c.date : '');
    M.openSimple('Xác nhận lần 1 · xoá bình luận', 'Bình luận: ' + about + '\n\nBước 2 sẽ yêu cầu gõ XOÁ.', function () {
      M.openStrong('Xác nhận lần 2 · xoá bình luận', 'Xoá vĩnh viễn khỏi KV: ' + about, 'XOÁ', function () {
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
  /* Vòng 18d — lỗi nặng nhất của tab Phiếu bầu: cả “Gỡ phiếu đã chọn” lẫn
     “Reset phiếu bộ này” đều gửi `S.selectedBook`, tức bộ đang chọn ở tab SỬA
     BỘ, chứ không phải bộ của dòng phiếu người quản lý đang nhìn. Đứng ở tab
     Phiếu bầu mà selectedBook trỏ bộ khác (hoặc rỗng) là reset/gỡ phiếu của
     SAI BỘ — slug rỗng còn bị Worker hiểu là reset MỌI BỘ. Nay khoá theo bộ
     của chính dòng phiếu (mỗi dòng đã mang `s`), và từ chối khi trộn nhiều bộ. */
  function voteSlugOf(v) {
    return (v && (v.s || v.slug)) || '';
  }
  function voteBookLabel(v) {
    return (v && voteSlugOf(v)) ? titleOf(voteSlugOf(v)) : (v && v.b) || '';
  }
  function realRemoveVotes() {
    if (!ensureOnline()) return;
    if (!S.voteSel.size) { say('Chọn ít nhất một phiếu.', 'warn'); return; }
    var chosen = []; S.voteSel.forEach(function (i) { if (S.votes[i]) chosen.push(S.votes[i]); });
    var slugs = [];
    chosen.forEach(function (v) { var sl = voteSlugOf(v); if (sl && slugs.indexOf(sl) < 0) slugs.push(sl); });
    if (slugs.length !== 1) {
      say(slugs.length ? 'Các phiếu đang chọn thuộc ' + slugs.length + ' bộ khác nhau — chọn phiếu của MỘT bộ mỗi lần.'
        : 'Các phiếu này không rõ thuộc bộ nào; bấm “Đọc lại KV” rồi thử lại.', 'warn');
      return;
    }
    var slug = slugs[0];
    var names = chosen.map(function (v) { return v.k + ' · Chương ' + (Number(v.ch) || 0); }).slice(0, 6).join(', ');
    M.openStrong('Gỡ phiếu đã chọn',
      'Bộ “' + titleOf(slug) + '” · gỡ ' + chosen.length + ' phiếu: ' + names + (chosen.length > 6 ? '…' : '') + ' · không hoàn tác.',
      'GỠ PHIẾU', function () {
        apiCall('/api/admin/vote-remove', { method: 'POST', body: { slug: slug, ch: 0, keys: chosen.map(function (v) { return v.k; }) } })
          .then(function () { WRITES += 1; S.votes = S.votes.filter(function (v, i) { return !S.voteSel.has(i); }); S.voteSel.clear(); say('Đã gỡ ' + chosen.length + ' phiếu của “' + titleOf(slug) + '”.'); redraw(); })
          .catch(fail);
      }, 'Gỡ phiếu');
  }
  function realResetVotes() {
    if (!ensureOnline()) return;
    var rc = D.querySelector('[data-role="reset-ch"]');
    var ch = rc ? String(rc.value || '') : '';
    /* Bộ để reset: bộ đang lọc ở bảng phiếu (state.voteBook) → bộ của dòng
       được chọn → bộ đang mở ở Sửa bộ. Không bao giờ rơi về chuỗi rỗng, vì
       Worker hiểu slug rỗng là reset TOÀN BỘ bộ. */
    /* Bộ đang chọn đọc THẲNG từ ô select trên màn hình: nextTick/render có thể
       chưa kịp ghi `S.voteBook` (cùng lý do như collectHomepageDraft). */
    var box = D.querySelector('[data-role="vote-book"]');
    var fromBox = box && box.value ? String(box.value) : '';
    var picked = null;
    S.voteSel.forEach(function (i) { if (!picked && S.votes[i]) picked = S.votes[i]; });
    var slug = fromBox || S.voteBook || voteSlugOf(picked) || '';
    if (!slug) { say('Chọn bộ cần reset phiếu ở ô lọc phía trên trước.', 'warn'); return; }
    if (!/^\d+$/.test(ch) && ch !== '') { say('Số chương phải là số (để trống nếu reset cả bộ).', 'warn'); return; }
    M.openStrong('Reset phiếu bộ “' + titleOf(slug) + '”',
      'Phiếu về 0' + (ch ? ' ở chương ' + ch : ' (cả bộ + mọi chương, giữ lượt đọc)') + ' · không hoàn tác.',
      'RESET', function () {
        apiCall('/api/admin/votes/reset', { method: 'POST', body: { slug: slug, ch: ch } })
          .then(function () { WRITES += 1; S.votes = S.votes.filter(function (v) { return voteSlugOf(v) !== slug; }); S.voteSel.clear(); S.votePage = 1; say('Đã reset phiếu của “' + titleOf(slug) + '” trên KV.'); redraw(); })
          .catch(fail);
      }, 'Reset phiếu');
  }

  /* Vòng 17b: giá trị NGƯỜI DÙNG ĐANG GÕ chưa chắc đã vào state — handler
     ‘input’ chỉ chạy khi trình duyệt phát sự kiện, còn bấm Lưu bằng chuột ngay
     sau khi gõ (chưa blur) vẫn có thể lệch một nhịp. Trước khi dựng registry,
     đọc thẳng những ô đang có trên màn hình. */
  function collectHomepageDraft() {
    var each = function (sel, fn) { Array.prototype.forEach.call(D.querySelectorAll(sel), fn); };
    each('[data-role="slide-reason"]', function (el) {
      var x = S.slides[Number(el.dataset.idx)];
      if (x) x.r = el.value;
    });
    each('[data-role="sched-ch"]', function (el) {
      var x = S.schedule[Number(el.dataset.idx)];
      if (x) x.c = el.value;
    });
    each('[data-role="sched-book"]', function (el) {
      var x = S.schedule[Number(el.dataset.idx)];
      if (x && el.value) x.b = el.value;
    });
    var note = D.getElementById('hp-note'); if (note) S.models['hp-note'] = S.hpNote = note.value;
    var tx = D.getElementById('hp-text'); if (tx) S.models['hp-text'] = tx.value;
    var href = D.getElementById('hp-href'); if (href) S.models['hp-href'] = href.value;
    var sw = D.getElementById('hp-banner'); if (sw) S.models['hp-banner'] = !!sw.checked;
  }

  function currentRegistryFromState() {
    collectHomepageDraft();
    var next = clone(REG);
    var origSlides = Array.isArray(REG.slides) ? REG.slides : [];
    var origSlug = function (o) { return typeof o === 'string' ? o : (o && o.slug) || ''; };
    next.slides = S.slides.map(function (x) {
      /* Khớp bản cũ theo SLUG, không theo vị trí: đổi thứ tự hay chèn slide thì
         bản cũ vẫn ôm nhầm khoá lạ (`reason` của bộ khác) sang dòng mới. */
      var base = origSlides.filter(function (o) { return origSlug(o) === x.b; })[0];
      if (typeof base === 'string') return x.r ? { slug: x.b, reason: x.r } : x.b;
      var out = Object.assign({}, base || {}, { slug: x.b });
      if (x.r) out.reason = x.r; else delete out.reason;
      return out;
    });
    var origItems = (REG.schedule && Array.isArray(REG.schedule.items)) ? REG.schedule.items : [];
    var nextItems = S.schedule.map(function (x, i) {
      /* Khớp dòng theo slug/ngày thay vì theo vị trí: xoá hay chèn một dòng
         không còn làm “base” của các dòng sau lệch sang dòng khác (bản cũ dùng
         origItems[i], tức là đọc nhầm title của dòng khác). */
      var base = origItems.filter(function (o) {
        return o && ((x.b && o.slug === x.b) || (!x.b && o.slug == null && String(o.days || '') === String(x.d || '')));
      })[0] || {};
      var out = Object.assign({}, base, { days: x.d, detail: x.c });
      if (x.b) out.slug = x.b; else delete out.slug;
      var t = x.b ? (titleOf(x.b) || base.title || '') : (x.t || base.title || '');
      if (t) out.title = t; else delete out.title;
      return out;
    });
    next.schedule = Object.assign({}, REG.schedule || {}, {
      items: nextItems,
      note: val('hp-note') || S.hpNote || '',
      updated: today()
    });
    /* Vòng 14: checkbox "Chuyển thể Series" phải ghi ra editorChoice, nếu không
       bấm xong chuyển tab là mất sạch lựa chọn thật của chủ trang (vòng 15 bỏ
       trần 12 nên ghi nguyên vẹn, có thể hơn 12). */
    var picked = S.picked.slice();
    next.editorChoice = picked;
    next.settings = next.settings || {};
    next.settings.editorChoice = picked.slice();
    next.settings.announcement = Object.assign({}, next.settings.announcement || {}, {
      enabled: !!(checked('hp-banner') || S.models['hp-banner']),
      text: val('hp-text') || S.hpText || '',
      href: val('hp-href') || S.hpHref || ''
    });
    return next;
  }
  /* Vòng 17b: overlay “Chuyển thể Series” là một TRANG RIÊNG có nút Lưu riêng.
     Bản trước nó gọi saveHomepage() ⇒ ghi TOÀN BỘ registry, kéo theo cả bản
     nháp trang chủ mà người dùng đang sửa dở nhưng CHƯA bấm Lưu (banner, ghi
     chú, lịch…). Nay chỉ ghi đúng thứ trang đó quản lý: editorChoice +
     settings.editorChoice; các phần khác giữ nguyên bản đang có trên KV. */
  function realSaveSeriesOnly() {
    if (!ensureOnline()) return;
    var next = clone(REG);
    var picked = S.picked.slice();
    next.editorChoice = picked;
    next.settings = Object.assign({}, next.settings || {});
    next.settings.editorChoice = picked.slice();
    writeRegistry(next).then(function () {
      say('Đã lưu ' + picked.length + ' bộ Chuyển thể Series lên KV.');
      /* Lưu xong thì đóng trang Series (nút “Đóng”/Esc vẫn dùng được), và
         phần trang chủ trong state vẫn là bản nháp: giữ nguyên ● Chưa lưu. */
      if (typeof window.closeSeriesPage === 'function') { try { window.closeSeriesPage(); } catch (e) {} }
      else redraw();
    }).catch(fail);
  }
  window.realSaveSeriesOnly = realSaveSeriesOnly;

  function realSaveHomepage() {
    if (!ensureOnline()) return;
    /* registry thật có slides:[] là HỢP LỆ (web tự lấy 5 bộ mới nhất). Bắt
       phải có >=1 slide khiến nút Lưu trang chủ luôn báo lỗi dù chỉ muốn sửa
       lịch / Series / thông báo — đó là lỗi owner gặp ở Homepage CMS. */
    /* Chặn MỀM có chỉ đích: báo rõ dòng nào thiếu gì, không chỉ “còn dòng
       thiếu thứ hoặc bộ”. Vẫn cho lưu phần còn lại — nhưng lịch thiếu thứ thì
       trang chủ xếp vào nhóm “Chưa hẹn”, nên nói thẳng ra. */
    var bad = [];
    (S.schedule || []).forEach(function (x, i) {
      if (!x) return;
      if (!String(x.d || '').trim()) bad.push('dòng ' + (i + 1) + ' thiếu thứ');
      else if (!x.b && !String(x.t || '').trim()) bad.push('dòng ' + (i + 1) + ' chưa chọn bộ');
    });
    if (bad.length) { say('Lịch ra chương: ' + bad.join(' · ') + '.', 'bad'); return; }
    writeRegistry(currentRegistryFromState()).then(function () {
      /* Mốc sạch mới: hydrate() đã nạp lại dữ liệu vừa ghi, nên “Chưa lưu”
         phải tắt và nút Hoàn tác quay về đúng bản vừa lưu. */
      try { S.hpBase = window.hpSnapshot ? window.hpSnapshot() : null; S.hpKeep = S.hpBase ? JSON.parse(S.hpBase) : null; } catch (e) {}
      redraw();
      say(S.slides.length ? 'Đã lưu trang chủ lên KV.'
        : 'Đã lưu lịch, Series và thông báo lên KV · không có slide, web tự lấy 5 bộ mới nhất.');
    }).catch(fail);
  }
  /* Vòng 17: mọi thao tác trên trang chủ chỉ đổi STATE, không ghi KV.
     Bản cũ gọi writeRegistry() sau TỪNG lần bấm ⇒ mỗi lần thêm/nhích slide là
     một lượt ghi quota, và vì registry vừa ghi lại được hydrate() nạp đè lên
     state nên người dùng mất luôn phần đang sửa dở ở các card khác. Nay:
     sửa → thấy ngay ở cột “Xem trước” → bấm Lưu trang chủ (một lượt ghi). */
  function realSlideChange(kind, idx, dir, el) {
    var changed = true;
    if (kind === 'add') {
      var sel = D.getElementById('addSlideSel');
      if (!sel || !sel.value) { say('Chọn một bộ trước khi thêm slide.', 'warn'); return; }
      if (S.slides.length >= 8) { say('Tối đa 8 slide.', 'warn'); return; }
      if (S.slides.some(function (x) { return x.b === sel.value; })) { say('Bộ này đã có trong hero.', 'warn'); return; }
      S.slides.push({ b: sel.value, r: '' });
    } else if (kind === 'move') {
      var j = idx + dir;
      if (j < 0 || j >= S.slides.length) changed = false;
      else { var t = S.slides[idx]; S.slides[idx] = S.slides[j]; S.slides[j] = t; }
    } else if (kind === 'remove') S.slides.splice(idx, 1);
    else if (kind === 'sched-add') {
      /* Vòng 17b: dòng mới phải DÙNG ĐƯỢC NGAY. Bản trước tạo dòng không có
         thứ ⇒ bấm Lưu bị chặn ngay (“dòng N thiếu thứ”), người dùng phải tự đi
         bấm chip. Nay mặc định lấy thứ HÔM NAY (vẫn đổi được bằng chip), chọn
         bộ đang có ở Series hoặc bộ đầu thư viện. */
      var wd = (typeof window.HP_DAYS !== 'undefined' && window.HP_DAYS)
        ? window.HP_DAYS[(new Date().getDay() + 6) % 7][0] : 'T2';
      S.schedule.push({
        d: window.hpDaysText ? window.hpDaysText([wd]) : 'Thứ 2',
        b: (S.picked[0] || (S.books[0] || {}).id || ''), c: '', t: ''
      });
    } else if (kind === 'sched-remove') S.schedule.splice(idx, 1);
    if (!changed) return;
    redraw();
    /* Báo rõ là CHƯA ghi, để không ai tưởng thao tác đã lên KV. */
    if (kind === 'sched-add') say('Đã thêm dòng lịch cho hôm nay — đổi thứ bằng chip rồi bấm Lưu trang chủ.', 'info');
    else say('Đã đổi trang chủ trong bản nháp — bấm Lưu trang chủ để ghi KV.', 'info');
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
        return Promise.resolve(reload()).then(function () { return loadIssueBooks(); });
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
    /* K3: nói rõ nó ghi đè cái gì, bao nhiêu bộ, và nhắc backup trước — trước
       đây chỉ có một câu “KV vẫn là nguồn thắng” rồi ghi ngay. */
    var n = (REG.lib || []).length;
    M.openStrong('Đồng bộ metadata Blogger',
      'Ghi đè metadata của ' + n + ' bộ trong registry bằng list-novel lấy từ Blogger '
      + '(tên, tác giả, bìa, tình trạng). Chương và nội dung KHÔNG bị đổi. '
      + 'Nên tải backup JSON ở cột bên trái trước khi đồng bộ — thao tác này không hoàn tác được.',
      'ĐỒNG BỘ', function () {
        apiCall('/api/sync', { method: 'POST' }).then(function () { say('Đã đồng bộ metadata của ' + n + ' bộ từ Blogger.'); return reload(); }).catch(fail);
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
  /* Vòng 18c: trang này registry LÀ toàn bộ dữ liệu (thông báo trang chủ,
     editorChoice, lịch ra chương nằm trong registry.settings/schedule) nhưng
     bình luận, báo lỗi, số liệu đọc/phiếu nằm ở khoá RIÊNG trên KV. Bản backup
     cũ chỉ có `registry` ⇒ khôi phục lại tưởng đã đủ mà mất sạch 3 thứ đó.
     Nay gom thêm comments/reports/stats/settings/schedule từ Worker. */
  var BACKUP_PARTS = ['registry', 'comments', 'reports', 'stats', 'settings', 'schedule'];
  function realBackup() {
    say('Đang gom dữ liệu để sao lưu…', 'info');
    var jobs = [
      apiCall('/api/admin/comments').then(function (r) { return { k: 'comments', v: (r && r.comments) || [] }; }).catch(function () { return { k: 'comments', v: [] }; }),
      apiCall('/api/admin/reports').then(function (r) { return { k: 'reports', v: (r && r.reports) || [] }; }).catch(function () { return { k: 'reports', v: [] }; }),
      apiCall('/api/stats').then(function (r) { return { k: 'stats', v: { items: (r && r.items) || {}, votes: (r && r.votes) || {} } }; }).catch(function () { return { k: 'stats', v: { items: {}, votes: {} } }; })
    ];
    return Promise.all(jobs).then(function (parts) {
      var payload = {
        note: 'Sao lưu thật từ Cloudflare KV · ' + new Date().toISOString(),
        parts: BACKUP_PARTS.slice(),
        registry: REG,
        settings: (REG && REG.settings) || {},
        schedule: (REG && REG.schedule) || {}
      };
      parts.forEach(function (x) { payload[x.k] = x.v; });
      M.download('ssochuz-backup-' + today() + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      var rc = payload.comments.length, rr = payload.reports.length, rv = Object.keys(payload.stats.items || {}).length;
      say('Đã tải backup: registry ' + ((REG.lib || []).length) + ' bộ · ' + rc + ' bình luận · ' + rr + ' báo lỗi · ' + rv + ' bộ có số liệu.');
    }).catch(fail);
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

  /* ---------------- 4b · công cụ soạn thảo, chèn link/ảnh, nhập file ---------------- */
  var EXTRA_ICONS = {
    underline: '<path d="M6 4v7a6 6 0 0 0 12 0V4M4 20h16"/>',
    h3: '<path d="M4 5v14M12 5v14M4 12h8M16 10h4l-2.2 3.8a2.6 2.6 0 1 1-1.3 4.6"/>',
    alignLeft: '<path d="M4 6h16M4 12h10M4 18h14"/>',
    alignCenter: '<path d="M4 6h16M7 12h10M5 18h14"/>',
    hr: '<path d="M4 12h16"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'
  };
  var origIcon = window.icon;
  if (typeof origIcon === 'function') {
    window.icon = function (name, cls) {
      if (EXTRA_ICONS[name]) {
        return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + EXTRA_ICONS[name] + '</svg>';
      }
      return origIcon(name, cls);
    };
  }
  var origRenderModal = window.renderModal;
  if (typeof origRenderModal === 'function') {
    window.renderModal = function () {
      var c = S.modal;
      if (c && c.kind === 'custom') {
        var root = D.getElementById('modalRoot');
        if (!root) return;
        root.innerHTML = '<div class="modal-scrim" data-act="close-modal">' + c.html + '</div>';
        if (typeof window.hydrateIcons === 'function') window.hydrateIcons(root);
        if (S.modalJustOpened) {
          S.modalJustOpened = false;
          var f = (c.focusSel && root.querySelector(c.focusSel)) || root.querySelector('input,select,button');
          if (f && f.focus) try { f.focus(); } catch (e) {}
        }
        return;
      }
      return origRenderModal();
    };
  }
  function openCustomModal(html, focusSel) {
    S.lastFocus = D.activeElement;
    S.modal = { kind: 'custom', html: html, focusSel: focusSel || '' };
    S.modalJustOpened = true;
    window.renderModal();
  }

  function saveEditorSelection() {
    var ed = D.getElementById('editor');
    if (!ed || !window.getSelection) return;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    if (ed.contains(r.commonAncestorContainer)) LAST_EDITOR_RANGE = r.cloneRange();
  }
  function restoreEditorSelection(ed) {
    if (!ed || !window.getSelection) return null;
    ed.focus();
    var sel = window.getSelection();
    if (!sel) return null;
    if (LAST_EDITOR_RANGE && ed.contains(LAST_EDITOR_RANGE.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(LAST_EDITOR_RANGE);
      return LAST_EDITOR_RANGE;
    }
    var r = D.createRange();
    r.selectNodeContents(ed);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    LAST_EDITOR_RANGE = r.cloneRange();
    return r;
  }
  function placeCaretAfter(node) {
    if (!node || !node.parentNode) return;
    var after = D.createRange();
    if (node.nodeType === 1 && node.childNodes.length) {
      after.selectNodeContents(node);
      after.collapse(false);
    } else {
      after.setStartAfter(node);
      after.collapse(true);
    }
    var sel = window.getSelection && window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(after); }
    LAST_EDITOR_RANGE = after.cloneRange();
  }
  function insertHtmlAtEditorCursor(ed, htmlSnippet) {
    if (!ed) return;
    var isBlkSnippet = /<(p|div|h[1-6]|blockquote|ul|ol|table|figure|hr)\b/i.test(htmlSnippet);
    if (isBlkSnippet && !String(ed.textContent || '').replace(/[\s\u00a0\u200b\ufeff]+/g, '') && !ed.querySelector('img,video,hr,table,figure')) {
      ed.innerHTML = htmlSnippet;
      if (ed.lastChild) placeCaretAfter(ed.lastChild);
      saveEditorSelection();
      return;
    }
    var r = restoreEditorSelection(ed);
    if (isBlkSnippet && r) {
      var blkAnc = r.startContainer;
      while (blkAnc && blkAnc !== ed && blkAnc.parentNode !== ed) blkAnc = blkAnc.parentNode;
      if (blkAnc && blkAnc !== ed && isSpacerBlock(blkAnc)) {
        var tmpl0 = D.createElement('template');
        tmpl0.innerHTML = htmlSnippet;
        var last0 = tmpl0.content.lastChild;
        blkAnc.parentNode.replaceChild(tmpl0.content, blkAnc);
        placeCaretAfter(last0);
        saveEditorSelection();
        return;
      }
    }
    var before = ed.innerHTML, done = false;
    try {
      if (D.execCommand) done = D.execCommand('insertHTML', false, htmlSnippet);
    } catch (e) { done = false; }
    if (!done || ed.innerHTML === before) {
      var tmpl = D.createElement('template');
      tmpl.innerHTML = htmlSnippet;
      var frag = tmpl.content;
      var lastNode = frag.lastChild;
      if (r) {
        r.deleteContents();
        var topBlk = isBlkSnippet ? r.startContainer : null;
        while (topBlk && topBlk !== ed && topBlk.parentNode !== ed) topBlk = topBlk.parentNode;
        if (topBlk && topBlk !== ed && /^(P|H[1-6])$/.test(topBlk.tagName || '')) {
          var tail = r.cloneRange();
          tail.selectNodeContents(topBlk);
          tail.setStart(r.endContainer, r.endOffset);
          var tailFrag = tail.extractContents();
          var refNext = topBlk.nextSibling;
          ed.insertBefore(frag, refNext);
          if (String(tailFrag.textContent || '').trim() || (tailFrag.querySelector && tailFrag.querySelector('img,br'))) {
            var tailP = D.createElement(topBlk.tagName.toLowerCase());
            copyBlockAttrs(topBlk, tailP);
            tailP.appendChild(tailFrag);
            if (!isSpacerBlock(tailP)) ed.insertBefore(tailP, refNext);
          }
          if (isSpacerBlock(topBlk)) topBlk.remove();
        } else {
          r.insertNode(frag);
        }
        placeCaretAfter(lastNode);
      } else {
        ed.insertAdjacentHTML('beforeend', htmlSnippet);
      }
    }
    saveEditorSelection();
  }
  function findAncestorInEditor(ed, tagNames) {
    var sel = window.getSelection && window.getSelection();
    var node = sel && sel.rangeCount ? sel.anchorNode : (LAST_EDITOR_RANGE ? LAST_EDITOR_RANGE.startContainer : null);
    while (node && node !== ed) {
      if (node.nodeType === 1) {
        var tg = node.tagName.toLowerCase();
        if (tagNames[tg]) return node;
      }
      node = node.parentNode;
    }
    return null;
  }
  function updateToolbarActiveState() {
    var ed = D.getElementById('editor');
    var bar = D.querySelector('.ed-toolbar');
    if (!ed || !bar) return;
    var sel = window.getSelection && window.getSelection();
    if (!sel || !sel.rangeCount || !ed.contains(sel.anchorNode)) return;
    var block = findAncestorInEditor(ed, { p: 1, div: 1, h1: 1, h2: 1, h3: 1, h4: 1, blockquote: 1, li: 1 });
    var inQuote = !!findAncestorInEditor(ed, { blockquote: 1 });
    var align = block ? String(block.style.textAlign || block.getAttribute('align') || '').toLowerCase() : '';
    function qState(cmd) { try { return !!(D.queryCommandState && D.queryCommandState(cmd)); } catch (e) { return false; } }
    var activeMap = {
      bold: qState('bold') || !!findAncestorInEditor(ed, { b: 1, strong: 1 }),
      italic: qState('italic') || !!findAncestorInEditor(ed, { i: 1, em: 1 }),
      underline: qState('underline') || !!findAncestorInEditor(ed, { u: 1 }),
      quote: inQuote,
      'align-center': align === 'center',
      'align-left': align === 'left'
    };
    Array.prototype.slice.call(bar.querySelectorAll('[data-act="format"]')).forEach(function (btn) {
      var c = btn.dataset.cmd;
      if (!(c in activeMap)) return;
      var on = !!activeMap[c];
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function markEditorDirtyAndAutosave() {
    var ed = D.getElementById('editor');
    if (!ed) return;
    DIRTY_CHAPTER = true;
    updateSaveNoteDom();
    clearTimeout(EDITOR_AUTOSAVE_TIMER);
    EDITOR_AUTOSAVE_TIMER = setTimeout(function () {
      var e2 = D.getElementById('editor');
      if (e2) updateChapterStatsDom(e2.innerHTML);
      snapshotLiveEditor();
      updateSaveNoteDom();
    }, 550);
  }
  function ensureEditingMode() {
    if (!S.editorPreview) return;
    S.editorPreview = false;
    var ed = D.getElementById('editor');
    var pv = D.getElementById('readerPreview');
    var btn = D.querySelector('[data-act="toggle-preview"]');
    if (ed) ed.hidden = false;
    if (pv) pv.remove();
    if (btn) btn.innerHTML = window.icon('eye', 's') + 'Xem trước độc giả';
  }
  function toggleBlockquote(ed) {
    restoreEditorSelection(ed);
    var bq = findAncestorInEditor(ed, { blockquote: 1 });
    if (bq && bq.parentNode) {
      var p = D.createElement('p');
      while (bq.firstChild) {
        var fc = bq.firstChild;
        if (fc.nodeType === 1 && (fc.tagName.toLowerCase() === 'p' || fc.tagName.toLowerCase() === 'div')) {
          while (fc.firstChild) p.appendChild(fc.firstChild);
          fc.remove();
        } else {
          p.appendChild(fc);
        }
      }
      if (!p.childNodes.length) p.appendChild(D.createElement('br'));
      bq.parentNode.replaceChild(p, bq);
      var r = D.createRange();
      r.selectNodeContents(p);
      r.collapse(false);
      var sel = window.getSelection && window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(r); }
      LAST_EDITOR_RANGE = r.cloneRange();
      return;
    }
    var ok = false;
    try { if (D.execCommand) ok = D.execCommand('formatBlock', false, 'blockquote'); } catch (e) { ok = false; }
    if (!ok) {
      var cur = findAncestorInEditor(ed, { p: 1, div: 1, h2: 1, h3: 1 });
      if (cur && cur !== ed) {
        var q = D.createElement('blockquote');
        cur.parentNode.insertBefore(q, cur);
        q.appendChild(cur);
      }
    }
  }
  function setBlockAlign(ed, align) {
    restoreEditorSelection(ed);
    var block = findAncestorInEditor(ed, { p: 1, div: 1, h1: 1, h2: 1, h3: 1, h4: 1, blockquote: 1 });
    if (!block || block === ed) {
      if (!ed.firstElementChild) ed.innerHTML = '<p><br></p>';
      block = ed.firstElementChild;
    }
    if (!block) return;
    var cur = String(block.style.textAlign || block.getAttribute('align') || '').toLowerCase();
    block.removeAttribute('align');
    if (align === 'left' || cur === align) block.style.removeProperty('text-align');
    else block.style.textAlign = align;
    if (!block.getAttribute('style')) block.removeAttribute('style');
  }
  function execEditorFormat(cmd) {
    ensureEditingMode();
    var ed = D.getElementById('editor');
    if (!ed) return;
    restoreEditorSelection(ed);
    if (cmd === 'quote') toggleBlockquote(ed);
    else if (cmd === 'align-left') setBlockAlign(ed, 'left');
    else if (cmd === 'align-center') setBlockAlign(ed, 'center');
    else if (cmd === 'undo' || cmd === 'redo') {
      try { if (D.execCommand) D.execCommand(cmd, false, null); } catch (e) {}
    } else {
      var ok = false;
      try { if (D.execCommand) ok = D.execCommand(cmd, false, null); } catch (e) { ok = false; }
      if (!ok && LAST_EDITOR_RANGE && !LAST_EDITOR_RANGE.collapsed) {
        var wrapMap = { bold: 'strong', italic: 'em', underline: 'u' };
        if (wrapMap[cmd]) {
          var w = D.createElement(wrapMap[cmd]);
          w.appendChild(LAST_EDITOR_RANGE.extractContents());
          LAST_EDITOR_RANGE.insertNode(w);
        }
      }
    }
    saveEditorSelection();
    markEditorDirtyAndAutosave();
    updateToolbarActiveState();
  }
  function realInsertSeparator() {
    ensureEditingMode();
    var ed = D.getElementById('editor');
    var sep = '<p class="ch-sep">✦</p><p><br></p>';
    if (!ed) {
      S.editorSeed = htmlForEditor((S.editorSeed || '') + sep);
      FORCE_EDITOR_SEED = true;
      redraw();
      return;
    }
    insertHtmlAtEditorCursor(ed, sep);
    markEditorDirtyAndAutosave();
    say('Đã chèn dấu ngăn cách cảnh.');
  }
  function renderPreviewCardHtml(bookSlug, idx, curTitle, curHtml) {
    var b = M.getBook(bookSlug) || {};
    var bookTitle = b.t || titleOf(bookSlug) || 'Truyện';
    var author = b.a || (findMeta(bookSlug) || {}).author || 'Tác giả';
    var total = Math.max(1, S.chapters.length);
    var st = chapterPlainStats(curHtml);
    var statTxt = st.words ? (st.words.toLocaleString('vi-VN') + ' từ · ~' + st.mins + ' phút đọc') : '0 từ';
    var bodyHtml = renderReaderHtml(curHtml);
    return '<div class="reader-preview" id="readerPreview">' +
      '<div class="rd-preview-bar">' +
        '<span class="lb">' + window.icon('eye', 'xs') + ' Xem trước giao diện độc giả · truyen.html</span>' +
        '<div class="row" style="gap:10px"><span class="xs mut">' + esc(statTxt) + '</span>' +
        '<button class="btn sm" data-act="toggle-preview">Quay lại chỉnh sửa</button></div>' +
      '</div>' +
      '<div class="rd-stage" tabindex="0" role="region" aria-label="Bản xem trước chương">' +
        '<header class="rdhead">' +
          '<div class="rd-crumb">Thư viện › ' + esc(bookTitle) + ' › Chương ' + (idx + 1) + ' / ' + total + '</div>' +
          '<h3 class="rd-title">' + esc(curTitle || ('Chương ' + (idx + 1))) + '</h3>' +
          '<div class="rd-meta"><span>✎ ' + esc(author) + '</span><span>·</span><span>' + esc(statTxt) + '</span></div>' +
        '</header>' +
        '<article class="rtext">' + bodyHtml + '</article>' +
      '</div></div>';
  }
  function realTogglePreview() {
    var ed = D.getElementById('editor');
    if (ed) saveEditorSelection();
    S.editorPreview = !S.editorPreview;
    if (ed) {
      var slug = BOOK_SLUG || S.chapterBook || S.selectedBook || '';
      var tEl = D.getElementById('chapterTitle');
      var curTitle = tEl ? tEl.value : ((S.chapters[S.activeChapter] || {}).t || '');
      var oldPv = D.getElementById('readerPreview');
      if (oldPv) oldPv.remove();
      if (S.editorPreview) {
        ed.hidden = true;
        ed.insertAdjacentHTML('afterend', renderPreviewCardHtml(slug, S.activeChapter || 0, curTitle, ed.innerHTML));
        var pvRoot = D.getElementById('readerPreview');
        if (pvRoot && typeof window.hydrateIcons === 'function') window.hydrateIcons(pvRoot);
      } else {
        ed.hidden = false;
        restoreEditorSelection(ed);
      }
      var btn = D.querySelector('.ed-toolbar [data-act="toggle-preview"]');
      if (btn) btn.innerHTML = window.icon('eye', 's') + (S.editorPreview ? 'Đóng xem trước' : 'Xem trước độc giả');
      return;
    }
    redraw();
  }
  function realRestoreDraft() {
    var slug = BOOK_SLUG || S.chapterBook || S.selectedBook;
    var idx = S.activeChapter || 0;
    var draft = readChapterDraft(slug, idx);
    if (!draft) {
      syncChaptersToState();
      say('Không có bản nháp cục bộ — đã nạp lại bản đang có trên KV.', 'info');
      redraw();
      return;
    }
    if (S.chapters[idx]) {
      if (draft.t) S.chapters[idx].t = draft.t;
      S.chapters[idx].html = draft.html || '';
      S.chapters[idx].s = draft.s || S.chapters[idx].s || 'published';
      S.chapters[idx].d = draft.d || '';
      S.chapters[idx]._dirty = true;
    }
    delete S.models['chapter-title'];
    S.editorPreview = false;
    syncChaptersToState();
    DIRTY_CHAPTER = true;
    DRAFT_SAVED_AT = draft.savedAt || '';
    say('Đã khôi phục bản nháp cục bộ' + (draft.savedAt ? ' lúc ' + draft.savedAt : '') + ' · bấm Lưu chương để ghi lên KV.');
    redraw();
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
      if (isNaN(i) || !S.chapters[i]) return;
      snapshotLiveEditor();
      S.activeChapter = i;
      S.editorPreview = false;
      delete S.models['chapter-title'];
      S.savedAt = '';
      syncChaptersToState();
      redraw();
      var ce = D.getElementById('editor');
      if (ce) ce.focus();
    },
    'chapter-pick-book': function (el) { openChapterBook(el.dataset.id, false); },
    /* Từ Thư viện / Dashboard: mở đúng bộ đó ở tab Chương (1 cú bấm, không phải
       nhớ slug rồi sang tab kia chọn lại). */
    'open-chapters': function (el) { openChapterBook(el.dataset.id, true); },
    'log-kind': function (el) {
      S.logKind = String((el && el.dataset && el.dataset.k) || 'all');
      S.logPage = 1;
      redraw();
    },
    'retry-chapter': function () {
      var slug = String(BOOK_SLUG || S.chapterBook || '');
      if (!slug) { say('Chưa chọn bộ để tải chương.', 'warn'); return; }
      say('Đang tải lại chương của “' + (titleOf(slug) || slug) + '”…', 'info');
      var p = (S.conn === 'static' ? loadStaticBook(slug) : loadBook(slug, true));
      p.then(function (b) {
        if (b) { say('Đã tải lại ' + (S.chapters.length) + ' chương của “' + (titleOf(slug) || slug) + '”.'); redraw(); }
        else { say('Vẫn chưa tải được chương của bộ này.', 'bad'); }
      }).catch(function () { say('Vẫn chưa tải được chương của “' + (titleOf(slug) || slug) + '” — xem chi tiết trong khung.', 'bad'); });
    },
    'chapter-filter': function (el) {
      snapshotLiveEditor();
      S.chapterFilter = String((el && el.dataset && el.dataset.f) || 'all');
      redraw();
    },
    'lib-pub-filter': function (el) {
      var pub = String((el && el.dataset && el.dataset.pub) || '');
      S.lib = S.lib || { q: '', status: 'all', pub: '', vis: '', lock: '', adult: '', sort: 'new', page: 1 };
      S.lib.pub = pub; S.lib.page = 1;
      go('thu-vien');
      say(pub === 'draft' ? 'Thư viện · đang lọc bộ Nháp.' : 'Thư viện · đang lọc bộ ' + (PUB_LABEL[pub] || pub) + '.', 'info');
    },
    'format': function (el) { execEditorFormat(el.dataset.cmd); },
    'insert-separator': realInsertSeparator,
    'toggle-preview': realTogglePreview,
    'import-confirm': function () { confirmMultiImport(); },
    'sched-plus': function (el) {
      S.chapterStatus = 'scheduled';
      S.chapterAt = localInputPlusHours(Number(el.dataset.hours || 1));
      var inp = D.getElementById('chapterAt');
      if (inp) inp.value = S.chapterAt;
      DIRTY_CHAPTER = true;
      updateSaveNoteDom();
      say('Đã đặt mốc hẹn giờ · bấm Lưu chương để ghi lên KV.', 'info');
    },
    'save-chapter': function () { realSaveChapter(); },
    /* Xuất bản = ghi 1 lượt: lưu nội dung hiện tại + đặt trạng thái Xuất bản.
       Không bắt người sửa phải Lưu rồi đổi trạng thái rồi Lưu lần nữa (2 lượt
       ghi KV mà người dùng quota chỉ có 1.000 lượt/ngày). */
    'publish-chapter': function () {
      S.chapterStatus = 'published';
      DIRTY_CHAPTER = true;
      realSaveChapter('published');
    },
    'schedule-chapter': function () {
      snapshotLiveEditor();
      S.chapterStatus = 'scheduled';
      if (!S.chapterAt) S.chapterAt = defaultScheduleLocalInput();
      DIRTY_CHAPTER = true;
      say('Đã chọn Hẹn giờ · đặt mốc rồi bấm Lưu chương để ghi KV.');
      redraw();
    },
    'delete-comment': function (el) { realDeleteComment(el.dataset.id); },
    'toggle-report': function (el) { realToggleReport(el.dataset.id); },
    'remove-votes': realRemoveVotes,
    /* “Đọc lại KV” ở trạng thái rỗng của bảng phiếu: nạp lại thư viện + phiếu
       thay vì đứng yên như trước. */
    'vote-reload': function () {
      if (!ensureOnline()) return;
      say('Đang đọc lại phiếu từ KV…', 'info');
      reload().then(function () { say('Đã đọc lại phiếu bầu từ KV.'); }).catch(fail);
    },
    'reset-votes': realResetVotes,
    'slide-add': function (el) { realSlideChange('add', 0, 0, el); },
    /* Lối tắt “Sửa bộ” ngay trên dòng slide: chọn bộ rồi sang tab Sửa bộ với
       đúng bộ đó, khỏi phải nhớ slug rồi quay lại Thư viện tìm. */
    'hp-edit-book': function (el) {
      var id = el.dataset.id;
      if (!id) return;
      S.selectedBook = id;
      go('sua-bo');
      say('Đang sửa bộ: ' + (titleOf(id) || id));
    },
    'hp-day': function (el) {
      /* Chip thứ của dòng lịch: đổi state rồi vẽ lại đúng card đó, KHÔNG ghi KV
         (xem realSlideChange). */
      if (!window.hpToggleDay) return;
      window.hpToggleDay(Number(el.dataset.idx), el.dataset.day);
      redraw();
    },
    'hp-reset': function () {
      if (!window.hpResetAll) return;
      window.hpResetAll();
      redraw();
      say('Đã hoàn tác về dữ liệu đang lưu trên KV.', 'info');
    },
    'slide-move': function (el) { realSlideChange('move', Number(el.dataset.idx), Number(el.dataset.dir), el); },
    'slide-remove': function (el) { realSlideChange('remove', Number(el.dataset.idx), 0, el); },
    'sched-add': function (el) { realSlideChange('sched-add', 0, 0, el); },
    'sched-remove': function (el) { realSlideChange('sched-remove', Number(el.dataset.idx), 0, el); },
    /* Vòng 19: thêm MỘT BỘ NỮA cho đúng thứ của dòng đang xem — ca “đăng 2 bộ
       trong một ngày”. Trước đây muốn vậy phải Thêm dòng rồi bấm lại đúng chip
       thứ và tự nhớ mình đã chọn thứ nào. Chép nguyên chuỗi thứ của dòng gốc,
       chọn sẵn một bộ CHƯA có trong lịch để không tạo hai dòng y hệt. */
    'sched-dup-day': function (el) {
      var i = Number(el && el.dataset && el.dataset.idx);
      var it = S.schedule[i];
      if (!it) { say('Không tìm thấy dòng lịch để nhân bản.', 'warn'); return; }
      var used = {};
      (S.schedule || []).forEach(function (x) { if (x && x.b) used[x.b] = 1; });
      var pick = ((S.books || []).filter(function (b) { return !used[b.id]; })[0] || S.books[0] || {}).id || '';
      var days = window.hpDaysOf ? window.hpDaysOf(it.d) : [];
      S.schedule.push({
        d: it.d,
        b: pick, c: '', t: ''
      });
      var dayTxt = days.length ? days.join(', ') : (it.d || 'cùng ngày');
      var title = titleOf(pick) || pick || 'bộ mới';
      redraw();
      say('Đã thêm “' + title + '” vào ' + dayTxt + ' — giờ ngày đó có 2 bộ. Chọn bộ khác nếu cần rồi bấm Lưu trang chủ.', 'info');
    },
    'series-save': function (e) {
      /* overlay chặn nổi bọt ⇒ phải bắt ở capture (xem capture click cuối file) */
      realSaveSeriesOnly();
    },
    'series-page': function () {
      /* Overlay dựng bằng mã của mockup và nằm NGOÀI #view nên render() không
         xoá. Lớp KV chỉ cần MỞ nó và đồng bộ bộ đếm — trước đây hàm này chỉ
         đồng bộ mà không mở, nên nút Xem thêm im lặng. */
      if (typeof window.openSeriesPage === 'function') { try { window.openSeriesPage(); } catch (e) { fail(e); } }
      if (typeof window.syncSeriesCount === 'function') { try { window.syncSeriesCount(); } catch (e) {} }
    },
    'recount': realRecount,
    'migrate': function (el) {
      var only = el.dataset.only || '';
      realMigrate(only, only === 'books' ? 'chỉ book' : only === 'covers' ? 'chỉ bìa' : 'book + bìa + ảnh chương');
    },
    'blogger-sync': realBlogSync,
    'backup': realBackup,
    'export': function (el) { realExport(el.dataset.type); },
    'refresh': function () {
      /* Vòng 17b: trang chủ giữ bản nháp trong state. Nạp lại dữ liệu là XOÁ
         bản nháp đó, nên phải hỏi trước — bản trước xoá im lặng, ai đang sửa
         dở mất trắng mà không hiểu vì sao. */
      var draft = false;
      try { draft = typeof window.hpDirty === 'function' && window.hpDirty(); } catch (e) { draft = false; }
      if (draft && !window.confirm('Trang chủ đang có thay đổi CHƯA lưu.\nĐọc lại dữ liệu sẽ bỏ các thay đổi đó. Tiếp tục?')) return;
      reload();
    },
    /* “Quét book” trước đây chỉ báo lại đúng những gì registry đã có — quét mà
       không đọc gì cả. Nay đọc số chương THẬT của từng bộ đang có vấn đề để
       cột Book trên bảng có số, và nêu rõ bao nhiêu bộ lệch. */
    'scan': function () {
      if (!ensureOnline()) return;
      say('Đã quét ' + (REG.lib || []).length + ' bộ từ registry KV · ' + M.SAMPLE_ISSUES.length + ' vấn đề.');
      loadIssueBooks().then(function () {
        var diff = (M.SAMPLE_ISSUES || []).filter(function (x) { return x.note; }).length;
        say('Đối chiếu book thật: ' + Object.keys(ISSUE_BOOKS).length + ' bộ đã đọc · ' + diff + ' bộ lệch registry.', diff ? 'warn' : 'ok');
      }).catch(function () {});
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
    /* Vòng 18b: đây là bảng ĐỂ SỬA — nút “Sửa” phải mở đúng bộ, không phải
       toast rồi đứng yên. */
    'fix-row': function (el) {
      var slug = (el && el.dataset && el.dataset.id) || '';
      if (!slug) { say('Dòng này không có slug để mở bộ.', 'warn'); return; }
      S.selectedBook = slug;
      go('sua-bo');
      say('Đang sửa bộ: ' + (titleOf(slug) || slug));
    },
    /* Sửa cả nhóm cùng một loại vấn đề: mở bộ đầu tiên và nêu rõ còn bao nhiêu
       bộ nữa, kèm danh sách slug trong toast để không phải dò lại từ đầu. */
    'fix-all': function (el) {
      var type = (el && el.dataset && el.dataset.type) || '';
      var list = (M.SAMPLE_ISSUES || []).filter(function (x) { return !type || x.t === type; });
      if (!list.length) { say('Không còn dòng nào thuộc nhóm này.', 'info'); return; }
      var first = list[0];
      if (first.slug) S.selectedBook = first.slug;
      say('Nhóm “' + (type || 'vấn đề') + '”: ' + list.length + ' bộ — đang mở “' + (first.b || '') + '”. Còn lại: '
        + list.slice(1, 4).map(function (x) { return x.b; }).join(', ') + (list.length > 4 ? '…' : ''));
      if (first.slug) go('sua-bo');
    },
    'flush-stats': function () {
      if (!ensureOnline()) return;
      M.openSimple('Flush stats cache', 'Đẩy cache stats vào KV.', function () {
        apiCall('/api/stats/refresh', { method: 'POST' }).then(function () { WRITES += 1; say('Đã flush stats cache trên KV.'); return loadStats(); }).catch(fail);
      }, 'Flush stats', true);
    },
    'login-supabase': function () {
      say('Supabase chỉ dành cho độc giả. Quản trị: nhập URL Worker + ADMIN_KEY.', 'info');
    },
    'static-mode': function () {
      CFG.key = ''; delete S.models['gate-key']; setConn('static');
      loadStatic().then(function () { say('Chế độ đọc tĩnh · /data/registry.json (chỉ đọc).'); go('dashboard'); }).catch(fail);
    },
    'view-web': function () { window.open('/', '_blank', 'noopener'); },
    'restore-draft': realRestoreDraft,
    'save-draft': function () {
      DIRTY_CHAPTER = true;
      snapshotLiveEditor();
      updateSaveNoteDom();
      say('Đã lưu nháp cục bộ · bấm Lưu chương để ghi lên KV.');
    },
    'manage-chapters': function () {
      snapshotLiveEditor();
      var selEl = D.querySelector('[data-role="chapter-book"]');
      var cb = (selEl && selEl.value) || S.chapterBook || S.selectedBook || (S.books[0] || {}).id;
      if (!cb) return;
      S.chapterBook = cb; S.selectedBook = cb; S.editorPreview = false;
      var p = (cb !== BOOK_SLUG) ? (S.conn === 'static' ? loadStaticBook(cb) : loadBook(cb)) : Promise.resolve('ok');
      p.then(function (b) {
        if (!b) { say('Không tải được dữ liệu chương của bộ này — xem thông báo trong khung.', 'bad'); return; }
        redraw();
        var mc = D.getElementById('editorCard') || D.getElementById('chapterLoadError');
        if (mc && mc.scrollIntoView) mc.scrollIntoView({ behavior: 'smooth', block: 'start' });
        say('Đang quản lý chương của ' + titleOf(cb) + '.');
      }).catch(function () {
        /* Không revert: quay về bộ cũ sẽ GIẤU lỗi và người sửa tưởng đang ở bộ
           mình vừa chọn. Khung chương dựng thông báo + nút Thử lại. */
        say('Không tải được chương của “' + (titleOf(cb) || cb) + '” — bấm Thử lại trong khung.', 'bad');
        redraw();
      });
    },
    'focus-editor': function () {
      ensureEditingMode();
      var card = D.getElementById('editorCard'), ed = D.getElementById('editor');
      if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (ed) ed.focus();
    },
    'insert-image': function () {
      ensureEditingMode();
      var img = $('[data-role="chapter-image"]');
      if (img) img.click();
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

  window.__CZ_SANITIZE__ = realSanitizeEditorHtml;
  M.sanitizeEditorHtml = realSanitizeEditorHtml;
  window.sanitizeEditorHtml = realSanitizeEditorHtml;
  window.sanitizeEditorDom = function () {};
  window.insertSeparator = realInsertSeparator;
  window.editorHtml = function () {
    var curSlug = String(BOOK_SLUG || S.chapterBook || S.selectedBook || '');
    var el = D.getElementById('editor');
    if (!FORCE_EDITOR_SEED && el && el.getAttribute('data-book') === curSlug && Number(el.getAttribute('data-ch-idx')) === S.activeChapter) {
      return realSanitizeEditorHtml(el.innerHTML);
    }
    return S.editorSeed || '<p><br></p>';
  };
  var CH_STATUS_LABELS = { published: 'Xuất bản', scheduled: 'Hẹn giờ', hidden: 'Ẩn', draft: 'Nháp' };
  var CH_STATUS_HINTS = {
    published: 'Xuất bản — độc giả đọc được ngay sau khi lưu.',
    scheduled: 'Chương chỉ hiện khi tới mốc giờ đã đặt.',
    hidden: 'Chương nằm trong bộ nhưng độc giả không thấy.',
    draft: 'Nháp — chỉ admin thấy, độc giả CHƯA đọc được cho tới khi bấm Xuất bản.'
  };
  /* ---------------- Tab Chương · chọn bộ + tìm/lọc chương ---------------- */
  var CH_FILTERS = [
    ['all', 'Tất cả'], ['draft', 'Nháp'], ['published', 'Xuất bản'], ['scheduled', 'Hẹn giờ'], ['hidden', 'Ẩn']
  ];
  var PUB_LABEL = { draft: 'Nháp', pending_review: 'Chờ duyệt', approved: 'Đã duyệt', scheduled: 'Hẹn giờ', published: 'Xuất bản', rejected: 'Từ chối', archived: 'Lưu trữ' };
  /* Mở 1 bộ ở tab Chương. Dùng chung cho chip “mới cập nhật”, nút “Chương” ở
     Thư viện và nút Quản lý chương — một đường, một cách báo lỗi. */
  function openChapterBook(slug, nav) {
    if (!slug) return;
    snapshotLiveEditor();
    S.chapterBook = slug; S.selectedBook = slug; S.editorPreview = false;
    if (nav) go('chuong');
    var p = (S.conn === 'static' ? loadStaticBook(slug) : loadBook(slug));
    p.then(function (b) {
      if (!b) { say('Không tải được dữ liệu chương của bộ này — xem thông báo trong khung.', 'bad'); return; }
      say('Đang quản lý chương của “' + (titleOf(slug) || slug) + '”.');
      var card = D.getElementById(nav ? 'chapterListBody' : 'editorCard');
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function () {
      say('Không tải được chương của “' + (titleOf(slug) || slug) + '” — bấm Thử lại trong khung.', 'bad');
    });
  }
  function chapterStatusKey(c) { return String((c && c.s) || 'published').toLowerCase(); }
  function chapterCounts() {
    var n = { all: (S.chapters || []).length, draft: 0, published: 0, scheduled: 0, hidden: 0 };
    (S.chapters || []).forEach(function (c) { var k = chapterStatusKey(c); n[k] = (n[k] || 0) + 1; });
    return n;
  }
  function chapterVisibleRows() {
    var q = String(S.chapterQuery || '').trim().toLowerCase().replace(/^#/, '');
    var f = String(S.chapterFilter || 'all').toLowerCase();
    var out = [];
    (S.chapters || []).forEach(function (c, i) {
      if (f !== 'all' && chapterStatusKey(c) !== f) return;
      if (q) {
        var hit = String((c && c.t) || '').toLowerCase().indexOf(q) >= 0 || String(i + 1) === q;
        if (!hit) return;
      }
      out.push({ c: c, i: i });
    });
    return out;
  }
  /* Bộ mới cập nhật trước — chuyển bộ bằng 1 cú bấm thay vì mở select 67 dòng. */
  function chapterRecentBooks(n) {
    var lib = (REG.lib || []).slice();
    lib.sort(function (a, b) {
      var d = String(b && b.updated || '').localeCompare(String(a && a.updated || ''));
      return d !== 0 ? d : String(a && a.title || '').localeCompare(String(b && b.title || ''));
    });
    return lib.slice(0, n || 6);
  }
  function chapterPickerHtml(curSlug) {
    var books = S.books || [];
    var inList = books.some(function (b) { return b.id === curSlug; });
    var opts = books.map(function (b) {
      return '<option value="' + esc(b.id) + '"' + (b.id === curSlug ? ' selected' : '') + '>' + esc(b.t || b.id) + '</option>';
    }).join('');
    if (curSlug && !inList) opts = '<option value="' + esc(curSlug) + '" selected>' + esc(titleOf(curSlug) || curSlug) + '</option>' + opts;
    var recent = chapterRecentBooks(6).filter(function (m) { return m && m.slug; });
    var chips = recent.length
      ? '<div class="ch-recent" role="group" aria-label="Bộ mới cập nhật">' +
          '<span class="lb">Mới cập nhật:</span>' +
          recent.map(function (m) {
            var on = m.slug === curSlug;
            return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="chapter-pick-book" data-id="' + esc(m.slug) + '"' +
              (on ? ' aria-current="true"' : '') + ' data-tip="' + esc(m.title || m.slug) + '">' +
              esc(String(m.title || m.slug).slice(0, 26)) + '</button>';
          }).join('') +
        '</div>'
      : '';
    var q = chapterCounts();
    var books_ = S.books || [];
    var qDraft = books_.filter(function (b) { return String(b.pub || '') === 'draft'; }).length;
    var qPending = books_.filter(function (b) { return String(b.pub || '') === 'pending_review'; }).length;
    var qSched = books_.filter(function (b) { return String(b.pub || '') === 'scheduled'; }).length;
    var qWait = books_.filter(function (b) { return Number(b.pending) > 0; }).length;
    var queue = '<div class="ch-queue" aria-label="Hàng đợi xuất bản">' +
      '<span class="lb">Hàng đợi:</span>' +
      '<button type="button" class="chip ' + (qDraft ? 't-slate' : '') + '" data-act="lib-pub-filter" data-pub="draft" data-tip="Xem các bộ đang là nháp ở Thư viện">Nháp <b>' + qDraft + '</b></button>' +
      '<button type="button" class="chip ' + (qPending ? 't-warn' : '') + '" data-act="lib-pub-filter" data-pub="pending_review" data-tip="Xem các bộ chờ duyệt ở Thư viện">Chờ duyệt <b>' + qPending + '</b></button>' +
      '<button type="button" class="chip ' + (qSched ? 't-info' : '') + '" data-act="lib-pub-filter" data-pub="scheduled" data-tip="Xem các bộ hẹn giờ ở Thư viện">Hẹn giờ <b>' + qSched + '</b></button>' +
      '<span class="chip ' + (qWait ? 't-warn' : '') + '" data-tip="Số bộ còn chương nháp / hẹn giờ / ẩn chưa lên sóng">Chưa lên sóng <b>' + qWait + '</b></span>' +
      '</div>';
    return '<div class="card"><div class="card-hd"><h3>Chọn bộ để quản lý chương</h3>' +
      '<span class="right">' + books.length + ' bộ</span></div>' +
      '<div class="card-bd ch-picker">' +
        '<div class="row wrap" style="gap:8px">' +
          '<span class="sel" style="flex:1 1 260px"><select class="inp" data-role="chapter-book" aria-label="Chọn bộ cần quản lý chương">' + opts + '</select></span>' +
          '<button class="btn sm" data-act="manage-chapters">' + window.icon('list', 's') + 'Quản lý chương</button>' +
        '</div>' +
        chips + queue +
      '</div></div>';
  }
  function chapterLoadErrorHtml(load) {
    var name = titleOf(load.slug) || load.slug || 'bộ này';
    if (load.missing) {
      return '<div class="card" id="chapterLoadError"><div class="card-hd"><h3>Bộ này chưa có dữ liệu chương</h3>' +
        '<span class="right">404 · ' + esc(load.slug) + '</span></div><div class="card-bd">' +
        '<div class="state" style="min-height:150px;border:0" role="status">' + window.icon('inbox') +
          '<h3>Chưa có tệp chương</h3>' +
          '<p>Registry có “' + esc(name) + '” nhưng KV chưa có nội dung bộ. Mở tab Sửa bộ để tạo bộ trống rồi quay lại viết chương đầu.</p>' +
          '<div class="row wrap" style="gap:8px;justify-content:center">' +
            '<button class="btn sm" data-act="retry-chapter">' + window.icon('refresh', 's') + 'Thử lại</button>' +
            '<button class="btn sm ghost" data-act="go" data-id="sua-bo">Mở Sửa bộ</button>' +
          '</div></div></div></div>';
    }
    return '<div class="card" id="chapterLoadError" role="alert"><div class="card-hd"><h3>Không tải được dữ liệu chương</h3>' +
      '<span class="right">' + esc(load.at || '') + '</span></div><div class="card-bd">' +
      '<div class="state bad" style="min-height:150px;border:0">' + window.icon('alert') +
        '<h3>Lỗi tải dữ liệu chương</h3>' +
        '<p>“' + esc(name) + '” · ' + esc(load.error || 'Không rõ lỗi') + '. Chưa có gì bị ghi lên KV — thử lại trước khi sửa.</p>' +
        '<div class="row wrap" style="gap:8px;justify-content:center">' +
          '<button class="btn pri sm" data-act="retry-chapter">' + window.icon('refresh', 's') + 'Thử lại</button>' +
          '<button class="btn sm ghost" data-act="go" data-id="thu-vien">Về Thư viện</button>' +
          '<button class="btn sm ghost" data-act="go" data-id="cai-dat">Mở Cài đặt</button>' +
        '</div></div></div></div>';
  }
  function chapterRowHtml(c, i) {
    var isAct = i === S.activeChapter;
    var viTri = i === 0 ? -1 : i;
    return '<div class="list-item ch' + (isAct ? ' active' : '') + '" style="gap:6px">' +
      '<button class="btn ghost sm" style="flex:1;min-width:0;text-align:left;justify-content:flex-start;overflow:hidden" data-act="chapter-select" data-idx="' + i + '">' +
        '<span class="mono xs dim" style="flex:none">#' + (i + 1) + '</span>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap' + (isAct ? ';color:var(--acc);font-weight:600' : '') + '">' + esc(c.t || ('Chương ' + (i + 1))) + '</span>' +
      '</button>' +
      chapterRowBadge(c) +
      '<button class="btn icon ghost sm" data-act="chapter-move" data-dir="-1" data-idx="' + i + '"' + (viTri < 0 ? ' disabled' : '') + ' aria-label="Di chuyển lên">' + window.icon('arrowup', 's') + '</button>' +
      '<button class="btn icon ghost sm" data-act="chapter-move" data-dir="1" data-idx="' + i + '"' + (i === S.chapters.length - 1 ? ' disabled' : '') + ' aria-label="Di chuyển xuống">' + window.icon('arrowdown', 's') + '</button>' +
      '<button class="btn icon ghost sm" data-act="chapter-delete" data-idx="' + i + '" aria-label="Xóa chương">' + window.icon('trash', 's') + '</button>' +
    '</div>';
  }
  function chapterListBodyHtml() {
    if (!S.chapters.length) {
      return '<div class="state" style="min-height:110px;border:0"><p>Bộ này chưa có chương nào · bấm <b>+ Thêm</b> hoặc nhập tiêu đề và nội dung bên dưới rồi bấm <b>Lưu chương</b>.</p></div>';
    }
    var rows = chapterVisibleRows();
    if (!rows.length) {
      return '<div class="state" style="min-height:110px;border:0" role="status"><p>Không có chương nào khớp “' + esc(S.chapterQuery || '') + '”. ' +
        '<button class="btn ghost sm" data-act="chapter-filter" data-f="all">Xoá lọc</button></p></div>';
    }
    return rows.map(function (r) { return chapterRowHtml(r.c, r.i); }).join('');
  }
  function chapterListCountText() {
    var n = chapterCounts();
    var rows = chapterVisibleRows().length;
    var head = rows === S.chapters.length ? (S.chapters.length + ' chương') : (rows + '/' + S.chapters.length + ' chương');
    return head + (n.draft ? ' · ' + n.draft + ' nháp' : '');
  }
  function renderChapterListOnly() {
    var body = D.getElementById('chapterListBody');
    if (body) body.innerHTML = chapterListBodyHtml();
    var count = D.getElementById('chapterListCount');
    if (count) count.textContent = chapterListCountText();
    var tabs = D.querySelectorAll('[data-act="chapter-filter"]');
    Array.prototype.forEach.call(tabs, function (b) {
      var on = String(b.dataset.f || 'all') === String(S.chapterFilter || 'all');
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-pressed', 'true'); else b.setAttribute('aria-pressed', 'false');
    });
    updateSaveNoteDom();
  }

  window.__CZ_CHAPTER_VIEW__ = window.chapterEditorHTML = function () {
    /* Ưu tiên bộ ĐANG CHỌN ở tab Chương: khi tải lỗi, ô chọn vẫn phải chỉ đúng
       bộ người dùng vừa bấm (nếu lấy BOOK_SLUG trước, lỗi sẽ hiện dưới tên bộ cũ
       và nút “Thử lại” tải nhầm bộ). */
    var curSlug = String(S.chapterBook || BOOK_SLUG || S.selectedBook || (S.books[0] || {}).id || '');
    var curBookTitle = titleOf(curSlug) || 'Chưa chọn bộ';
    var active = S.chapters[S.activeChapter] || { t: '', s: 'draft', d: '', html: '' };
    var statusNow = String(S.chapterStatus || (active && active.s) || 'draft').toLowerCase();
    var curHtml = window.editorHtml();
    var curTitle = S.models['chapter-title'] != null ? S.models['chapter-title'] : (active.t || '');
    var draft = readChapterDraft(curSlug, S.activeChapter);
    var saveNoteHtml = S.conn === 'static'
      ? 'Chế độ đọc tĩnh · chỉ đọc'
      : DIRTY_CHAPTER
        ? ('● Chưa lưu KV' + (DRAFT_SAVED_AT ? ' · giữ nháp ' + esc(DRAFT_SAVED_AT) : ''))
        : S.savedAt
          ? (window.icon('check', 'xs') + ' Đã lưu KV lúc ' + esc(S.savedAt))
          : (draft && draft.savedAt ? ('● Có nháp cục bộ lúc ' + esc(draft.savedAt)) : (window.icon('check', 'xs') + ' Đã đồng bộ KV'));

    var counts = chapterCounts();
    var chFilter = String(S.chapterFilter || 'all');
    var filterBar = '<div class="ch-tools mb">' +
      '<div class="search">' + window.icon('search', 'xs') +
        '<input class="inp" type="search" id="chapterQuery" data-role="chapter-q" value="' + esc(S.chapterQuery || '') + '" placeholder="Tìm chương theo tên hoặc số…" aria-label="Tìm chương">' +
      '</div>' +
      '<div class="tabs" role="group" aria-label="Lọc chương theo trạng thái">' +
        CH_FILTERS.map(function (f) {
          var on = f[0] === chFilter;
          return '<button class="tab' + (on ? ' on' : '') + '" type="button" data-act="chapter-filter" data-f="' + f[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
            f[1] + (counts[f[0]] ? ' <span class="mono xs dim">' + counts[f[0]] + '</span>' : '') + '</button>';
        }).join('') +
      '</div>' +
      '</div>';

    var left = '<div class="card"><div class="card-hd"><h3>Danh sách chương · ' + esc(curBookTitle) + '</h3>' +
      '<span class="right" id="chapterListCount">' + esc(chapterListCountText()) + '</span>' +
      '<button class="btn sm" data-act="chapter-add">' + window.icon('plus', 's') + 'Thêm</button></div>' +
      '<div class="card-bd" style="padding:12px 12px 0">' + filterBar + '</div>' +
      '<div class="card-bd tight ch-list-scroll" id="chapterListBody" style="padding:6px 10px" tabindex="0" role="region" aria-label="Danh sách chương">' + chapterListBodyHtml() + '</div></div>';

    var tools = [
      ['bold', 'bold', 'In đậm (Ctrl+B)'],
      ['italic', 'italic', 'In nghiêng (Ctrl+I)'],
      ['underline', 'underline', 'Gạch chân (Ctrl+U)'],
      '|',
      ['quote', 'quote', 'Trích dẫn'],
      ['alignLeft', 'align-left', 'Căn trái'],
      ['alignCenter', 'align-center', 'Căn giữa'],
      '|',
      ['undo', 'undo', 'Hoàn tác (Ctrl+Z)'],
      ['redo', 'redo', 'Làm lại (Ctrl+Y)']
    ];
    var toolbarHtml = '<div class="ed-toolbar mb" role="toolbar" aria-label="Định dạng nội dung chương">' +
      tools.map(function (t) {
        if (t === '|') return '<span class="ed-sep" aria-hidden="true"></span>';
        return '<button class="btn icon sm" type="button" data-act="format" data-cmd="' + t[1] + '" data-tip="' + esc(t[2]) + '" aria-label="' + esc(t[2]) + '">' + window.icon(t[0], 's') + '</button>';
      }).join('') +
      '<button class="btn icon sm" type="button" data-act="insert-image" data-tip="Tải ảnh vào vị trí con trỏ" aria-label="Tải ảnh vào chương">' + window.icon('image', 's') + '</button>' +
      '<button class="btn sm" type="button" data-act="insert-separator" data-tip="Chèn dấu ngăn cách cảnh (─── ✦ ───)" aria-label="Chèn dấu ngăn cách nội dung">' + window.icon('separator', 's') + 'Ngăn cách</button>' +
      '<span class="grow"></span>' +
      '<button class="btn sm" type="button" data-act="toggle-preview">' + window.icon('eye', 's') + (S.editorPreview ? 'Đóng xem trước' : 'Xem trước độc giả') + '</button>' +
      '</div>';

    var schedExtra = S.chapterStatus === 'scheduled'
      ? '<div class="field mb"><label for="chapterAt">Chương lên sóng lúc</label>' +
          '<div class="row wrap" style="gap:8px"><input class="inp" id="chapterAt" data-role="chapter-at" type="datetime-local" style="max-width:260px" value="' + esc(S.chapterAt || defaultScheduleLocalInput()) + '">' +
          '<button class="btn ghost sm" type="button" data-act="sched-plus" data-hours="1">+1 giờ</button>' +
          '<button class="btn ghost sm" type="button" data-act="sched-plus" data-hours="24">+1 ngày</button>' +
          '<button class="btn ghost sm" type="button" data-act="sched-plus" data-hours="168">+1 tuần</button></div>' +
          '<span class="hint">Độc giả chỉ thấy chương khi tới mốc giờ đã đặt.</span></div>'
      : '';

    var imports = [
      ['single', 'Import .txt/.html', '.txt,.html,.htm'],
      ['multi', 'Nhập nhiều chương .txt/.docx', '.txt,.docx']
    ];

    var editor = '<div class="card" id="editorCard"><div class="card-hd"><h3>Trình soạn chương</h3>' +
      '<span class="right" id="saveNote" aria-live="polite">' + saveNoteHtml + '</span></div><div class="card-bd">' +
      '<div class="field mb"><label for="chapterTitle">Tên chương</label>' +
        '<div class="row title-case"><input class="inp" id="chapterTitle" data-role="chapter-title" value="' + esc(curTitle) + '" placeholder="Chương 1: Tiêu đề chương…">' +
          '<span class="sel"><select class="inp" data-role="case-mode" aria-label="Đổi kiểu chữ tên chương">' +
          '<option value="">Đổi kiểu chữ tên…</option><option value="upper">CHỮ HOA</option><option value="lower">chữ thường</option>' +
          '<option value="title">Chữ Hoa Mỗi Từ</option><option value="sentence">Định dạng câu</option></select></span></div>' +
        '<span class="hint">Chỉ đổi kiểu chữ tên chương, không chạm nội dung truyện.</span></div>' +
      '<div class="grid2 mb" style="gap:10px">' +
        '<div class="field"><label for="chapterStatus">Trạng thái chương</label>' +
          '<span class="sel"><select class="inp" id="chapterStatus" data-role="chapter-status">' +
          Object.keys(CH_STATUS_LABELS).map(function (k) { return '<option value="' + k + '"' + (k === statusNow ? ' selected' : '') + '>' + esc(CH_STATUS_LABELS[k]) + '</option>'; }).join('') +
          '</select></span>' +
          '<span class="hint" id="chapterStatusHint">' + esc(CH_STATUS_HINTS[statusNow] || CH_STATUS_HINTS.draft) + '</span></div>' +
        '<div class="field"><span class="lb">Số liệu chương</span><span class="sm mut" id="chapterStats">' + esc(formatChapterStats(curHtml)) + '</span></div>' +
      '</div>' +
      schedExtra +
      toolbarHtml +
      '<div id="editor" class="inp" data-role="editor" data-book="' + esc(curSlug) + '" data-ch-idx="' + (S.activeChapter || 0) + '" data-placeholder="Nhập hoặc dán nội dung chương tại đây…" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Nội dung chương"' + (S.editorPreview ? ' hidden' : '') + '>' + curHtml + '</div>' +
      (S.editorPreview ? renderPreviewCardHtml(curSlug, S.activeChapter || 0, curTitle, curHtml) : '') +
      '<div class="row wrap mt" style="gap:8px"><span class="lb">Nhập tệp:</span>' + imports.map(function (im) {
        return '<label class="btn sm">' + esc(im[1]) + '<input type="file" class="sr-only" accept="' + esc(im[2]) + '" data-role="import-file" data-kind="' + im[0] + '" aria-label="Nhập ' + esc(im[1]) + '"></label>';
      }).join('') + '<label class="btn sm">' + window.icon('image', 's') + 'Ảnh vào chương<input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp,image/*" data-role="chapter-image" aria-label="Tải ảnh vào chương"></label></div>' +
      '<div class="row wrap mt" style="gap:8px"><span class="grow"></span>' +
        '<button class="btn sm" type="button" data-act="restore-draft">' + (draft ? 'Khôi phục nháp cục bộ' : 'Nạp lại từ KV') + '</button>' +
        '<button class="btn pri sm" type="button" data-act="save-chapter">' + window.icon('save', 's') + 'Lưu chương</button>' +
        (statusNow === 'published' ? '' : '<button class="btn sm" type="button" data-act="publish-chapter" data-tip="Lưu và cho độc giả đọc ngay">' + window.icon('upload', 's') + 'Xuất bản ngay</button>') +
        '<button class="btn danger sm" type="button" data-act="chapter-delete" data-idx="' + (S.activeChapter || 0) + '"' + (S.chapters.length ? '' : ' disabled') + '>' + window.icon('trash', 's') + 'Xoá chương</button></div>' +
      '<div class="state-note mt">' + window.icon('info', 's') + ' Chương mới / chương nhập từ tệp mặc định là <b>Nháp</b> — độc giả chưa thấy, bấm <b>Xuất bản ngay</b> khi đã soát xong. Ctrl/Cmd+S lưu chương lên KV · Ctrl/Cmd+Alt+N thêm chương mới · Dán trực tiếp từ Word/Google Docs giữ nguyên đậm/nghiêng/đoạn văn.</div>' +
      '</div></div>';

    var load = (CHAPTER_LOAD && CHAPTER_LOAD.slug === curSlug && CHAPTER_LOAD.status === 'error') ? CHAPTER_LOAD : null;
    return chapterPickerHtml(curSlug) + (load
      ? '<div class="mt">' + chapterLoadErrorHtml(load) + '</div>'
      : '<div class="mt">' + left + '</div><div class="mt">' + editor + '</div>');
  };

  window.connect = realConnect;
  window.submitNew = realSubmitNew;
  window.saveEdit = realSaveEdit;
  window.setLock = realSetLock;
  window.saveHomepage = realSaveHomepage;
  window.bloggerImport = realBloggerImport;
  window.exportBooks = realExport;
  window.resetDemo = function () { reload(); };
  window.selectBook = function (id) {
    snapshotLiveEditor();
    S.selectedBook = id; S.chapterBook = id; window.initEditModels(M.getBook(id));
    say('Đã chọn ' + (M.getBook(id).t || id) + ' · dữ liệu KV.', 'info');
    if (CFG.base) {
      (S.conn === 'static' ? loadStaticBook(id) : loadBook(id))
        .then(function (b) {
          if (!b) say('Không tải được dữ liệu chương của bộ này — xem thông báo trong khung.', 'bad');
        })
        .catch(function () {
          say('Không tải được chương của “' + (titleOf(id) || id) + '” — bấm Thử lại trong khung.', 'bad');
        });
    }
  };
  window.initEditModels = function (b) {
    if (!b) return;                       /* không có bộ đang chọn — đừng ném TypeError */
    var meta = findMeta(b.id) || {};
    S.models['eb-t'] = b.t; S.models['eb-slug'] = b.slug || b.id;
    S.models['eb-a'] = b.a; S.models['eb-c'] = b.c;
    S.models['eb-st'] = b.st; S.models['eb-pub'] = b.pub;
    S.models['eb-year'] = meta.year || '';
    S.models['eb-vis'] = b.vis || 'public'; S.models['eb-18'] = !!b.adult;
    S.models['eb-sum'] = meta.synFull || meta.syn || b.syn || '';
    S.models['eb-cover'] = meta.thumb || b.thumb || '';
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
    if (S.route === 'chuong' || S.route === 'sua-bo') {
      if (S.route !== 'chuong') go('chuong');
      realChapterAdd();
    } else say('Vào tab Chương để thêm chương.', 'info');
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
  /* Vòng 17b: cột “Xem trước” dính theo cuộn, nhưng chỉ dính khi nó THẤP hơn
     màn hình. Cao hơn thì phải để nó cuộn theo trang, nếu không phần dưới
     (lịch, chân thẻ) bị cắt và không có cách nào xem — lỗi rất dễ gặp ở màn
     900px. Đo bằng JS chứ không đoán bằng CSS. */
  function fitPreviewColumn() {
    var side = D.querySelector('.hp-side'), card = D.querySelector('.hp-pv-card');
    if (!side || !card) return;
    side.style.position = '';
    var h = card.getBoundingClientRect ? card.getBoundingClientRect().height : 0;
    var limit = (window.innerHeight || 900) - 90;
    if (h > limit) {
      side.style.position = 'static';
      card.setAttribute('data-own-scroll', '1');
    } else {
      card.removeAttribute('data-own-scroll');
    }
  }

  window.cover = function (b, cls) {
    var u = b && String(b.thumb || '').trim();
    if (u && /^https?:\/\//i.test(u))
      return '<img class="cover ' + (cls || '') + '" src="' + esc(u) + '" alt="Bìa ' + esc(b.t || '') +
        '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-cover="1" data-fb-text="' +
        esc(String(b.t || '').slice(0, 3)) + '">';
    return origCover(b, cls);
  };
  var resizeT = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (S.route === 'homepage-cms') { try { fitPreviewColumn(); } catch (e) {} } }, 120);
  });

  var st = D.createElement('style');
  st.textContent = 'img.cover{object-fit:cover;display:block;padding:0}';
  D.head.appendChild(st);

  var origRender = M.render;
  /* đồng hồ trên thanh quản trị = giờ VIỆT NAM (chủ trang người Việt), không
     phải giờ của máy đang mở admin */
  var CLOCK = (function () {
    function z(n) { return ('0' + n).slice(-2); }
    var d = vnDate();
    return z(d.getUTCDate()) + '/' + z(d.getUTCMonth() + 1) + ' ' + z(d.getUTCHours()) + ':' + z(d.getUTCMinutes());
  })();
  window.render = function () {
    S.kvWrites = WRITES; S.kvReads = READS;
    origRender();
    /* sau khi vẽ: đo lại cột xem trước — chỉ trang chủ mới có .hp-side */
    if (S.route === 'homepage-cms') { try { fitPreviewColumn(); } catch (e) {} }
    FORCE_EDITOR_SEED = false;
    try {
      var clock = D.getElementById('czClock');
      if (clock) clock.textContent = 'LÚC ' + CLOCK;
      S.demoOpen = false;
      var panel = D.getElementById('demo');
      if (panel) { panel.hidden = true; if (panel.innerHTML) panel.innerHTML = ''; }
      var inDocs = !!D.getElementById('docsTitle');
      ['view', 'login', 'topbar', 'sidebar', 'quotaBanner',
       inDocs ? null : 'modalRoot', 'toasts']
        .forEach(function (id) { if (id) scrub(D.getElementById(id)); });
      if (S.route === 'chuong') {
        var actRow = D.querySelector('.ch-list-scroll .list-item.ch.active');
        if (actRow && actRow.scrollIntoView) actRow.scrollIntoView({ block: 'nearest' });
      }
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
        .replace(/DỮ LIỆU MẪU/g, 'DỮ LIỆU THẬT')
        .replace(/\s*·\s*MẪU/g, '')
        .replace(/\s*\(mô phỏng\)/g, '')
        .replace(/mô phỏng/g, 'thật')
        .replace(/\s*\(mẫu\)/g, '')
        .replace(/\bMẪU\b/g, 'THẬT');
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
  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('Không đọc được file nhị phân.')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function prepareImagePayload(file, maxDim) {
    return readAsDataURL(file).then(function (dataUrl) {
      var fallbackType = (file && file.type && /^image\/(jpeg|png|webp)$/i.test(file.type)) ? file.type : 'image/png';
      if (typeof Image === 'undefined' || !file || file.size < 180 * 1024) {
        return { data: dataUrl, type: fallbackType, id: '' };
      }
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth || img.width || 0, h = img.naturalHeight || img.height || 0;
            if (!w || !h) { resolve({ data: dataUrl, type: fallbackType, id: '' }); return; }
            var lim = maxDim || 1400;
            if (w > lim || h > lim) {
              var sc = lim / Math.max(w, h);
              w = Math.max(1, Math.round(w * sc));
              h = Math.max(1, Math.round(h * sc));
            }
            var cv = D.createElement('canvas');
            cv.width = w; cv.height = h;
            var ctx = cv.getContext && cv.getContext('2d');
            if (!ctx) { resolve({ data: dataUrl, type: fallbackType, id: '' }); return; }
            ctx.drawImage(img, 0, 0, w, h);
            var webp = cv.toDataURL('image/webp', 0.85);
            if (webp && webp.indexOf('data:image/webp') === 0 && webp.length < dataUrl.length) {
              resolve({ data: webp, type: 'image/webp', id: '' });
            } else {
              resolve({ data: dataUrl, type: fallbackType, id: '' });
            }
          } catch (e) {
            resolve({ data: dataUrl, type: fallbackType, id: '' });
          }
        };
        img.onerror = function () { resolve({ data: dataUrl, type: fallbackType, id: '' }); };
        img.src = dataUrl;
      });
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
  function parseSingleImportFile(file) {
    if (/\.docx$/i.test(file.name || '')) {
      return readAsArrayBuffer(file).then(convertDocxBuffer).then(function (d) {
        var parts = splitDocxHtmlIntoChapters(d.html);
        if (!parts.length) return { t: '', html: htmlForEditor(d.html) };
        if (parts.length === 1) return { t: parts[0].t, html: htmlForEditor(parts[0].html) };
        return {
          t: parts[0].t,
          html: htmlForEditor(parts.map(function (p) { return (p.t ? '<h2>' + esc(p.t) + '</h2>' : '') + p.html; }).join(''))
        };
      });
    }
    return readAsText(file).then(function (raw) {
      if (/\.html?$/i.test(file.name || '') || /<(p|div|br|h[1-6]|blockquote|img|strong|em|b|i)\b/i.test(raw)) {
        var bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        var inner = bodyMatch ? bodyMatch[1] : raw;
        return { t: '', html: htmlForEditor(inner) };
      }
      var lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
      var firstNonEmpty = '';
      var startIdx = 0;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].trim()) { firstNonEmpty = lines[i].trim(); startIdx = i; break; }
      }
      if (firstNonEmpty && isChapHeadingLine(firstNonEmpty)) {
        return { t: firstNonEmpty.replace(/^#{1,3}\s*/, ''), html: htmlForEditor(textToHtml(lines.slice(startIdx + 1).join('\n'))) };
      }
      return { t: '', html: htmlForEditor(textToHtml(raw)) };
    });
  }
  function parseMultiImportFile(file) {
    if (!/\.(txt|docx)$/i.test(file.name || '')) {
      return Promise.reject(new Error('Chỉ hỗ trợ tệp .txt hoặc .docx cho nhập nhiều chương.'));
    }
    if (file.size > 20 * 1024 * 1024) {
      return Promise.reject(new Error('Tệp quá lớn (tối đa 20 MB). Hãy chia nhỏ tệp.'));
    }
    if (/\.docx$/i.test(file.name || '')) {
      return readAsArrayBuffer(file).then(convertDocxBuffer).then(function (res) {
        var parts = splitDocxHtmlIntoChapters(res.html);
        return { file: file.name, bytes: file.size, parts: parts, imagesSkipped: res.imagesSkipped || 0 };
      });
    }
    return readAsText(file).then(function (txt) {
      var parts = splitTxtIntoChapters(txt);
      return { file: file.name, bytes: file.size, parts: parts, imagesSkipped: 0 };
    });
  }
  function openMultiImportModal(info, slug) {
    PENDING_IMPORT = { slug: slug, parts: info.parts, file: info.file };
    var kbLabel = info.bytes >= 1048576
      ? (info.bytes / 1048576).toFixed(2) + ' MB'
      : Math.max(1, Math.round(info.bytes / 1024)) + ' KB';
    var previewList = info.parts.slice(0, 12).map(function (p, i) {
      return '<li style="padding:3px 0;border-bottom:1px solid var(--bd)"><span class="mono xs dim">#' + (i + 1) + '</span> ' + esc(p.t) + '</li>';
    }).join('');
    var more = info.parts.length > 12 ? '<p class="xs dim mt">… và ' + (info.parts.length - 12) + ' chương nữa.</p>' : '';
    var imgWarn = info.imagesSkipped ? '<p class="xs mut mt">Đã bỏ qua ' + info.imagesSkipped + ' ảnh nhúng trong Word để tránh lưu base64 nặng.</p>' : '';
    var html = '<div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="importModalTitle">' +
      '<div class="modal-hd">' + window.icon('upload', 's') + '<h3 id="importModalTitle">Xem trước nhập nhiều chương</h3>' +
        '<button class="btn icon ghost sm" data-act="close-modal" aria-label="Đóng">' + window.icon('x', 's') + '</button></div>' +
      '<div class="modal-bd">' +
        '<p class="sm">Phát hiện <b>' + info.parts.length + ' chương</b> từ tệp <b>' + esc(info.file) + '</b> (' + esc(kbLabel) + ') cho bộ <b>' + esc(titleOf(slug)) + '</b>.</p>' +
        imgWarn +
        '<ul style="max-height:200px;overflow-y:auto;margin:10px 0;padding:0;list-style:none">' + previewList + '</ul>' +
        more +
        '<div class="field mt"><label for="importModeSel">Cách ghi vào bộ</label>' +
          '<span class="sel"><select class="inp" id="importModeSel">' +
            '<option value="append">Nối thêm vào cuối bộ (' + S.chapters.length + ' + ' + info.parts.length + ' chương)</option>' +
            '<option value="replace">Thay thế toàn bộ chương hiện có (' + info.parts.length + ' chương)</option>' +
          '</select></span></div>' +
      '</div>' +
      '<div class="modal-ft">' +
        '<button class="btn sm" data-act="close-modal">Huỷ</button>' +
        '<button class="btn pri sm" data-act="import-confirm">Xác nhận ghi lên KV</button>' +
      '</div></div>';
    openCustomModal(html, '#importModeSel');
  }
  function confirmMultiImport() {
    if (!PENDING_IMPORT || !ensureOnline()) return;
    var job = PENDING_IMPORT;
    var modeEl = D.getElementById('importModeSel');
    var mode = modeEl ? modeEl.value : 'append';
    PENDING_IMPORT = null;
    if (typeof window.closeModal === 'function') window.closeModal();
    var slug = job.slug;
    /* Nhập từ tệp = nội dung thô vừa đọc vào, chưa ai đọc lại ⇒ NHÁP. Xuất
       bản từng chương (hoặc cả bộ) sau khi đã soát. */
    var incoming = job.parts.map(function (p) {
      return { t: p.t, html: htmlForStorage(p.html), status: 'draft' };
    });
    var ensureBook = (BOOK_SLUG === slug && BOOK && Array.isArray(BOOK.chapters))
      ? Promise.resolve(BOOK)
      : apiCall('/api/book/' + encodeURIComponent(slug)).catch(function () { return { slug: slug, title: titleOf(slug), chapters: [] }; });
    ensureBook.then(function (baseBook) {
      var nextBook = clone(baseBook || {});
      nextBook.slug = slug;
      nextBook.title = nextBook.title || titleOf(slug);
      var existing = Array.isArray(nextBook.chapters) ? nextBook.chapters : [];
      nextBook.chapters = mode === 'replace' ? incoming : existing.concat(incoming);
      return apiCall('/api/book/' + encodeURIComponent(slug), { method: 'PUT', body: nextBook, timeout: 120000 })
        .then(function () {
          WRITES += 1; setQuota();
          applyBook(slug, nextBook);
          S.activeChapter = mode === 'replace' ? 0 : Math.max(0, nextBook.chapters.length - incoming.length);
          syncChaptersToState();
          say('Đã nhập ' + incoming.length + ' chương từ "' + job.file + '" vào dạng NHÁP · độc giả chưa thấy. Soát xong rồi xuất bản.', 'info');
          redraw();
        });
    }).catch(fail);
  }
  function realImportFile(el) {
    if (!(el.files && el.files.length)) return;
    var file = el.files[0];
    var kind = el.dataset.kind;
    var slug = BOOK_SLUG;
    el.value = '';
    if (!slug) { say('Chưa nạp dữ liệu chương — chọn bộ rồi bấm Quản lý chương.', 'bad'); return; }
    if (kind === 'multi') {
      if (!ensureOnline()) return;
      say('Đang đọc và tách chương từ "' + file.name + '"…', 'info');
      parseMultiImportFile(file).then(function (info) {
        if (!info.parts.length) throw new Error('Không tìm thấy nội dung chương hợp lệ trong tệp này.');
        openMultiImportModal(info, slug);
      }).catch(fail);
      return;
    }
    parseSingleImportFile(file).then(function (parsed) {
      S.editorPreview = false;
      S.editorSeed = parsed.html || '<p><br></p>';
      FORCE_EDITOR_SEED = true;
      var cur = S.chapters[S.activeChapter];
      if (parsed.t && cur) {
        cur.t = parsed.t;
        delete S.models['chapter-title'];
      }
      DIRTY_CHAPTER = true;
      redraw();
      snapshotLiveEditor();
      updateSaveNoteDom();
      say('Đã nạp "' + file.name + '" vào trình soạn · bấm Lưu chương để ghi KV.');
    }).catch(fail);
  }
  function realInsertImageFile(file) {
    if (!file || !ensureOnline()) return Promise.resolve();
    ensureEditingMode();
    var ed = D.getElementById('editor');
    if (ed) saveEditorSelection();
    say('Đang tối ưu và tải ảnh lên Worker…', 'info');
    return prepareImagePayload(file, 1400).then(function (img) {
      return apiCall('/api/img', { method: 'POST', body: { type: img.type, data: img.data, kind: 'chapter', id: img.id || '' }, timeout: 30000 });
    }).then(function (r) {
      var rawSrc = (r && (r.url || (r.id ? '/api/img/' + r.id : ''))) || '';
      if (!rawSrc) throw new Error('Worker không trả URL ảnh.');
      var editorSrc = rewriteImgForEditor('src="' + rawSrc + '"').slice(5, -1);
      var altText = String(file.name || '').replace(/\.[^.]+$/, '');
      var snippet = '<p><img class="story-inline-image" src="' + esc(editorSrc) + '" alt="' + esc(altText) + '"></p><p><br></p>';
      var liveEd = D.getElementById('editor');
      if (liveEd) {
        insertHtmlAtEditorCursor(liveEd, snippet);
        markEditorDirtyAndAutosave();
      } else {
        S.editorSeed = htmlForEditor((S.editorSeed || '') + snippet);
        FORCE_EDITOR_SEED = true;
        DIRTY_CHAPTER = true;
        redraw();
      }
      say('Đã tải ảnh lên Worker và chèn tại vị trí con trỏ.');
    }).catch(fail);
  }
  function realInsertImage(el) {
    if (!(el.files && el.files.length)) return;
    var file = el.files[0]; el.value = '';
    realInsertImageFile(file);
  }
  function realCoverUpload(el) {
    if (!ensureOnline() || !(el.files && el.files.length)) return;
    var file = el.files[0]; el.value = '';
    prepareImagePayload(file, 1200).then(function (img) {
      return apiCall('/api/img', { method: 'POST', body: { type: img.type, data: img.data, kind: 'cover' }, timeout: 30000 });
    }).then(function (r) {
      var src = r.url || ('/api/img/' + r.id);
      if (/^\/api\/img\//i.test(src) && CFG.base) src = CFG.base + src;
      if (el.dataset.target === 'nb-cover-preview') {
        S.models['nb-cover'] = src;
        var pv = D.getElementById('nb-cover-preview');
        if (pv) pv.innerHTML = '<img class="cover lg" src="' + esc(src) + '" alt="Ảnh bìa xem trước">';
        var nu = D.getElementById('nb-cover'); if (nu) nu.value = src;
        say('Đã tải ảnh — sẽ ghi cùng lúc tạo bộ.');
        return;
      }
      var meta = findMeta(S.selectedBook || BOOK_SLUG);
      if (!meta) throw new Error('Chọn bộ trước khi tải bìa.');
      var next = clone(REG);
      var hit = (next.lib || []).find(function (m) { return m.slug === meta.slug; });
      hit.thumb = src; hit.slide = src;
      S.models['eb-cover'] = src;
      var eu = D.getElementById('eb-cover'); if (eu) eu.value = src;
      var ep = D.getElementById('eb-cover-preview');
      if (ep) ep.innerHTML = '<img class="cover lg" src="' + esc(src) + '" alt="Ảnh bìa xem trước">';
      /* Tạo bộ đã báo riêng */
      return writeRegistry(next).then(function () { say('Đã lưu ảnh bìa lên KV.'); });
    }).catch(fail);
  }

  /* Dán nội dung thông minh vào #editor: giữ đậm/nghiêng/gạch chân/tiêu đề/đoạn văn
     từ Word/Google Docs/HTML qua <template> trơ (chặn mọi script & onerror),
     hoặc tải ảnh nếu dán ảnh từ clipboard. */
  D.addEventListener('paste', function (e) {
    var t = e.target;
    var ed = t && t.closest ? t.closest('#editor') : null;
    if (!ed) return;
    var cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    var items = cd.items ? Array.prototype.slice.call(cd.items) : [];
    var htmlData = String(cd.getData('text/html') || '');
    var textData = String(cd.getData('text/plain') || '');
    var imgItem = items.find(function (it) { return it && it.kind === 'file' && /^image\//i.test(it.type || ''); });
    if (imgItem && !textData.trim() && !htmlData.trim()) {
      var imgFile = imgItem.getAsFile && imgItem.getAsFile();
      if (imgFile) {
        e.preventDefault(); e.stopPropagation();
        realInsertImageFile(imgFile);
        return;
      }
    }
    e.preventDefault(); e.stopPropagation();
    saveEditorSelection();
    var toInsert = '';
    if (!e.shiftKey && htmlData && /<[a-z][\s\S]*>/i.test(htmlData)) {
      var bodyM = htmlData.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      var rawFrag = (bodyM ? bodyM[1] : htmlData).replace(/<!--StartFragment-->|<!--EndFragment-->/g, '');
      var box = boxFromHtml(realSanitizeEditorHtml(rewriteImgForEditor(rawFrag), { fromPaste: true }));
      normalizeBlocksInContainer(box);
      toInsert = box.innerHTML.trim();
    }
    if (!toInsert) {
      var normalizedTxt = textData.replace(/\r\n?/g, '\n');
      toInsert = /\n/.test(normalizedTxt) ? textToHtml(normalizedTxt) : esc(normalizedTxt);
    }
    if (toInsert) {
      insertHtmlAtEditorCursor(ed, toInsert);
      markEditorDirtyAndAutosave();
      updateToolbarActiveState();
    }
  }, true);

  D.addEventListener('focusin', function (e) {
    var ed = e.target && e.target.id === 'editor' ? e.target : null;
    if (!ed) return;
    try { if (D.execCommand) D.execCommand('defaultParagraphSeparator', false, 'p'); } catch (err) {}
    saveEditorSelection(); updateToolbarActiveState();
  });
  ['keyup', 'mouseup'].forEach(function (evName) {
    D.addEventListener(evName, function (e) {
      if (e.target && e.target.closest && e.target.closest('#editor')) { saveEditorSelection(); updateToolbarActiveState(); }
    });
  });
  D.addEventListener('input', function (e) {
    var el = e.target;
    if (!el) return;
    if (el.id === 'editor' || (el.closest && el.closest('#editor'))) {
      saveEditorSelection();
      markEditorDirtyAndAutosave();
      return;
    }
    if (el.dataset && (el.dataset.role === 'chapter-title' || el.dataset.role === 'chapter-at')) {
      DIRTY_CHAPTER = true;
      if (el.dataset.role === 'chapter-at') S.chapterAt = el.value;
      clearTimeout(EDITOR_AUTOSAVE_TIMER);
      EDITOR_AUTOSAVE_TIMER = setTimeout(function () { snapshotLiveEditor(); updateSaveNoteDom(); }, 550);
      updateSaveNoteDom();
    }
  }, true);
  D.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    var ed = e.target && e.target.closest ? e.target.closest('#editor') : null;
    if (!ed) return;
    var sepEl = findAncestorInEditor(ed, { p: 1, div: 1 });
    if (sepEl && sepEl.classList && sepEl.classList.contains('ch-sep') && sepEl.parentNode) {
      e.preventDefault();
      var nextP = D.createElement('p');
      nextP.appendChild(D.createElement('br'));
      sepEl.parentNode.insertBefore(nextP, sepEl.nextSibling);
      placeCaretAfter(nextP.firstChild);
      markEditorDirtyAndAutosave();
    }
  });

  /* Ô tìm chương: cập nhật TẠI CHỖ danh sách (không redraw toàn trang) để
     không mất focus / không rơi chữ đang gõ trong trình soạn. */
  D.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.dataset) return;
    if (el.dataset.role === 'cover-url') {
      /* Đường dẫn ảnh bìa (URL): xem trước trực tiếp khi gõ, không cần đợi lưu. */
      var v = String(el.value || '').trim();
      var pv = D.getElementById(String(el.id || '').replace('-cover', '-cover-preview'));
      if (pv && v) pv.innerHTML = '<img class="cover lg" src="' + esc(v) + '" alt="Ảnh bìa xem trước">';
      return;
    }
    if (el.dataset.role !== 'chapter-q') return;
    S.chapterQuery = String(el.value || '');
    renderChapterListOnly();
  });

  D.addEventListener('change', function (e) {
    var el = e.target; if (!el || !el.dataset) return;
    var r = el.dataset.role;
    if (r === 'restore-file') { e.preventDefault(); e.stopPropagation(); realRestoreFile(el); }
    else if (r === 'import-file') { e.preventDefault(); e.stopPropagation(); realImportFile(el); }
    else if (r === 'chapter-image') { e.preventDefault(); e.stopPropagation(); realInsertImage(el); }
    else if (r === 'cover-upload') { e.preventDefault(); e.stopPropagation(); realCoverUpload(el); }
    else if (r === 'chapter-status') {
      e.preventDefault(); e.stopPropagation();
      snapshotLiveEditor();
      S.chapterStatus = el.value;
      if (S.chapterStatus === 'scheduled' && !S.chapterAt) S.chapterAt = defaultScheduleLocalInput();
      DIRTY_CHAPTER = true;
      redraw();
    }
    else if (r === 'case-mode') {
      if (el.value && typeof window.applyCase === 'function') {
        e.preventDefault(); e.stopPropagation();
        window.applyCase(el.value);
        el.value = '';
        DIRTY_CHAPTER = true;
        snapshotLiveEditor();
        updateSaveNoteDom();
      }
    }
    else if (r === 'log-q') {
      /* Tìm trong nhật ký: chạy ở 'change' (Enter / rời ô) để không dựng lại
         cả trang sau từng phím — dựng lại sẽ cướp focus khỏi ô đang gõ. */
      e.preventDefault(); e.stopPropagation();
      S.logQ = String(el.value || ''); S.logPage = 1;
      redraw();
    }
    else if (r === 'chapter-book') {
      /* Đổi bộ qua ô chọn: đi CÙNG một đường với chip/nút “Chương” để lỗi tải
         hiện đúng khung + Thử lại, không lặng lẽ quay về bộ cũ. */
      e.preventDefault(); e.stopPropagation();
      openChapterBook(el.value, false);
    }
    else if (r === 'picked') {
      e.preventDefault(); e.stopPropagation();
      var pid = el.dataset.id, at = S.picked.indexOf(pid);
      if (el.checked && at < 0) S.picked.push(pid);
      else if (!el.checked && at >= 0) S.picked.splice(at, 1);
      ['hpPickedCount', 'seriesPageCount', 'seriesPageFootCount'].forEach(function (id) {
        var n = D.getElementById(id); if (n) n.textContent = String(S.picked.length);
      });
    }
  }, true);

  /* CSP có script-src-attr 'none' nên KHÔNG dùng onerror inline. Ảnh bìa lỗi:
     ẩn <img> để lộ chữ dự phòng (cover() luôn đặt sẵn .cv-fb bên dưới). */
  D.addEventListener('error', function (e) {
    var im = e.target;
    if (!im || im.tagName !== 'IMG' || !im.getAttribute('data-cover')) return;
    im.removeAttribute('data-cover');
    var out = D.createElement('span');
    out.className = 'cover cv-miss ' + String(im.className || '').replace(/\bcover\b/g, '').trim();
    out.setAttribute('aria-label', 'Bìa bị thiếu');
    out.textContent = im.getAttribute('data-fb-text') || '—';
    if (im.parentNode) im.parentNode.replaceChild(out, im);
  }, true);

  /* capture: chặn trước khi listener bubble của mockup chạy */
  D.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var fn = REAL_CLICK[el.dataset.act];
    if (!fn) return;
    /* Vòng 17b: overlay #seriesPage gắn listener RIÊNG ở chính nó và tự
       stopPropagation. Nếu ta chặn ở capture với mọi data-act thì nút
       “Lưu lựa chọn” trong overlay bị chặn luôn trước khi tới listener đó ⇒
       bấm không có gì xảy ra. Chỉ nhường những act overlay thật sự xử lý. */
    var OVERLAY = { 'series-close': 1, 'series-all': 1, 'series-none': 1 };
    if (el.closest('#seriesPage') && OVERLAY[el.dataset.act]) return;
    e.preventDefault(); e.stopPropagation();
    try { fn(el); } catch (err) { fail(err); }
  }, true);

  /* ---------------- 8 · khởi động ---------------- */
  function boot() {
    if (STARTED) return; STARTED = true;
    clearPrototypeSeed();
    window.render();
    if (CFG.base && CFG.key) {
      setConn('checking');
      var regP = apiCall('/api/registry').then(function (reg) { hydrate(reg); redraw(); });
      regP.catch(function () {});
      apiCall('/api/whoami').then(function () { setConn('online'); return loadAll(regP); })
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
