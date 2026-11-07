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
  function today() { return new Date().toISOString().slice(0, 10); }
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
    var lib = REG.lib || [];
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
    S.chapterBook = S.selectedBook;

    var slides = Array.isArray(REG.slides) ? REG.slides : [];
    S.slides = slides.slice(0, 8).map(function (x) {
      return { b: (typeof x === 'string' ? x : (x && x.slug) || ''), r: (x && (x.reason || x.note)) || '' };
    });
    var sch = (REG.schedule && Array.isArray(REG.schedule.items)) ? REG.schedule.items : [];
    S.schedule = sch.map(function (x) {
      /* detail là GHI CHÚ (thường rỗng); title là TÊN BỘ — trước đây gộp
         title vào ô ghi chú rồi ghi ngược lại vào KV. */
      return { d: x.days || x.day || '', b: x.slug || '', c: x.detail || x.note || '' };
    });
    var ann = (REG.settings && REG.settings.announcement) || {};
    S.hpNote = (REG.schedule && REG.schedule.note) || '';
    S.hpText = ann.text || ''; S.hpHref = ann.href || '';
    /* Gán SAU khi đã đọc ann: trước đây gán trước nên 2 ô luôn rỗng dù KV có
       nội dung thông báo, và công tắc banner luôn tắt. */
    S.models['hp-text'] = S.hpText;
    S.models['hp-href'] = S.hpHref;
    S.models['hp-banner'] = !!ann.enabled;
    S.models['hp-note'] = S.hpNote;
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

  window.__CZ_REAL_EDITOR__ = true;
  var FORCE_EDITOR_SEED = false;
  var DIRTY_CHAPTER = false;
  var DRAFT_SAVED_AT = '';
  var LAST_EDITOR_RANGE = null;
  var EDITOR_AUTOSAVE_TIMER = null;
  var PENDING_IMPORT = null;

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
  function chapterRowBadge(c) {
    if (!c) return '';
    var st = String(c.s || 'published').toLowerCase();
    var out = '';
    if (st === 'scheduled') {
      var ms = parseAtMs(c.d);
      if (!ms) out += M.badge ? '' : '';
      var lbl = 'Hẹn giờ';
      if (ms > Date.now()) {
        var dt = new Date(ms);
        var z = function (n) { return ('0' + n).slice(-2); };
        lbl = 'Hẹn ' + z(dt.getDate()) + '/' + z(dt.getMonth() + 1) + ' ' + z(dt.getHours()) + ':' + z(dt.getMinutes());
      }
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
    var draft = readChapterDraft(slug, S.activeChapter);
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

  function syncBookCountsInState(slug, chaptersArr) {
    var list = Array.isArray(chaptersArr) ? chaptersArr : [];
    var now = Date.now();
    var pending = 0, visible = 0;
    list.forEach(function (c) {
      var st = String((c && (c.status || c.s)) || 'published').toLowerCase();
      var at = parseAtMs(c && (c.at || c.d));
      var held = st === 'hidden' || (st === 'scheduled' && at > now);
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
    return apiCall('/api/book/' + encodeURIComponent(slug)).then(function (r) {
      var b = (r && r.book && Array.isArray(r.book.chapters)) ? r.book : r;
      applyBook(slug, b, keepIdx);
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
  var STATS_ITEMS = {};   /* /api/admin/stats · dùng để biết bộ nào CÓ phiếu */
  function loadStats() {
    return apiCall('/api/admin/stats').then(function (r) {
      var items = r.items || {}, days = r.days || [];
      STATS_ITEMS = items;
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
          return list.map(function (v) {
            return { k: v.key || v.id || v.name || 'Độc giả', b: titleOf(slug), d: String(v.at || v.t || '').slice(0, 10) };
          });
        }).catch(function () { return []; });
    })).then(function (groups) {
      var flat = []; groups.forEach(function (g) { flat = flat.concat(g); });
      S.votes = flat.slice(0, 200);
    });
  }

  function loadAll() {
    return apiCall('/api/registry').then(function (reg) {
      hydrate(reg); redraw();
      return Promise.allSettled([
        loadComments(), loadReports(), loadStats(), loadLog(), loadKv(), loadBook(S.selectedBook, true)
      ]);
    }).then(function () {
      /* loadVoters() đọc STATS_ITEMS nên phải chạy SAU loadStats(). */
      return loadVoters().catch(function () {});
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
    var slug = BOOK_SLUG || S.chapterBook || S.selectedBook;
    if (!slug) { say('Chọn bộ trước khi lưu chương.', 'bad'); return; }
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
    var status = S.chapterStatus || 'published';
    var atIso = status === 'scheduled' ? localInputToIso(S.chapterAt) : '';
    var body = { index: idx, chapter: { t: title, html: html, status: status, at: atIso } };
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: body, timeout: 120000 })
      .then(function () {
        WRITES += 1; setQuota();
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
        say('Đã lưu chương "' + title + '" lên KV.');
        redraw();
      }).catch(fail);
  }
  function realChapterAdd() {
    if (!ensureOnline()) return;
    var slug = BOOK_SLUG || S.chapterBook || S.selectedBook;
    if (!slug) { say('Chọn bộ trước khi thêm chương.', 'bad'); return; }
    snapshotLiveEditor();
    var idx = S.chapters.length;
    var nextTitle = suggestNextChapTitle(S.chapters);
    var ch = { t: nextTitle, html: '<p>' + esc(nextTitle) + '</p>', status: 'published' };
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { index: idx, chapter: ch } })
      .then(function () {
        WRITES += 1; setQuota();
        if (!BOOK || typeof BOOK !== 'object') BOOK = { chapters: [] };
        if (!Array.isArray(BOOK.chapters)) BOOK.chapters = [];
        BOOK.chapters[idx] = ch;
        S.chapters.push({ t: ch.t, b: titleOf(slug), s: 'published', d: '', html: ch.html, _dirty: false });
        S.activeChapter = idx;
        S.editorPreview = false;
        delete S.models['chapter-title'];
        syncChaptersToState();
        syncBookCountsInState(slug, BOOK.chapters);
        say('Đã thêm "' + ch.t + '" trên KV.');
        redraw();
        var tInp = D.getElementById('chapterTitle');
        if (tInp) { tInp.focus(); try { tInp.select(); } catch (e) {} }
      }).catch(fail);
  }
  function realChapterDelete(idx) {
    if (!ensureOnline()) return;
    var slug = BOOK_SLUG || S.chapterBook || S.selectedBook;
    if (!slug || !S.chapters[idx]) return;
    var victimTitle = S.chapters[idx].t || ('Chương ' + (idx + 1));
    M.openStrong('Xoá chương khỏi KV', 'Xoá "' + victimTitle + '" · không hoàn tác.', 'XOÁ', function () {
      apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { index: idx, remove: true } })
        .then(function () {
          WRITES += 1; setQuota();
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
    var to = idx + dir, slug = BOOK_SLUG || S.chapterBook || S.selectedBook;
    if (!slug || to < 0 || to >= S.chapters.length) return;
    snapshotLiveEditor();
    apiCall('/api/book/' + encodeURIComponent(slug) + '/chapter', { method: 'PUT', body: { from: idx, to: to } })
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
    S.chapterStatus = (cur && cur.s) || 'published';
    S.chapterAt = cur && cur.d ? isoToLocalInput(cur.d) : '';
    DIRTY_CHAPTER = !!(cur && cur._dirty);
    DRAFT_SAVED_AT = '';
    FORCE_EDITOR_SEED = true;
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
  function realSaveHomepage() {
    if (!ensureOnline()) return;
    /* registry thật có slides:[] là HỢP LỆ (web tự lấy 5 bộ mới nhất). Bắt
       phải có >=1 slide khiến nút Lưu trang chủ luôn báo lỗi dù chỉ muốn sửa
       lịch / Series / thông báo — đó là lỗi owner gặp ở Homepage CMS. */
    if (S.schedule.some(function (x) { return !x.d || !x.b; })) { say('Lịch ra chương còn dòng thiếu thứ hoặc bộ.', 'bad'); return; }
    writeRegistry(currentRegistryFromState()).then(function () {
      say(S.slides.length ? 'Đã lưu trang chủ lên KV.'
        : 'Đã lưu lịch, Series và thông báo lên KV · không có slide, web tự lấy 5 bộ mới nhất.');
    }).catch(fail);
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
    updateChapterStatsDom(ed.innerHTML);
    updateSaveNoteDom();
    clearTimeout(EDITOR_AUTOSAVE_TIMER);
    EDITOR_AUTOSAVE_TIMER = setTimeout(function () {
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
    'chapter-pick-book': function (el) {
      var pickSlug = el.dataset.id;
      if (!pickSlug) return;
      snapshotLiveEditor();
      S.chapterBook = pickSlug; S.selectedBook = pickSlug; S.editorPreview = false;
      (S.conn === 'static' ? loadStaticBook(pickSlug) : loadBook(pickSlug)).then(function () {
        say('Đang quản lý chương của ' + titleOf(pickSlug) + '.');
        var card = D.getElementById('editorCard');
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(fail);
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
    'save-chapter': realSaveChapter,
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
      var p = (cb !== BOOK_SLUG) ? (S.conn === 'static' ? loadStaticBook(cb) : loadBook(cb)) : Promise.resolve();
      p.then(function () {
        redraw();
        var mc = D.getElementById('editorCard');
        if (mc && mc.scrollIntoView) mc.scrollIntoView({ behavior: 'smooth', block: 'start' });
        say('Đang quản lý chương của ' + titleOf(cb) + '.');
      }).catch(fail);
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
  window.__CZ_CHAPTER_VIEW__ = window.chapterEditorHTML = function () {
    var curSlug = String(BOOK_SLUG || S.chapterBook || S.selectedBook || (S.books[0] || {}).id || '');
    var curBookTitle = titleOf(curSlug) || 'Chưa chọn bộ';
    var active = S.chapters[S.activeChapter] || { t: '', s: 'published', d: '', html: '' };
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

    var leftBody = S.chapters.length
      ? S.chapters.map(function (c, i) {
          var isAct = i === S.activeChapter;
          return '<div class="list-item ch' + (isAct ? ' active' : '') + '" style="gap:6px">' +
            '<button class="btn ghost sm" style="flex:1;min-width:0;text-align:left;justify-content:flex-start;overflow:hidden" data-act="chapter-select" data-idx="' + i + '">' +
              '<span class="mono xs dim" style="flex:none">#' + (i + 1) + '</span>' +
              '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap' + (isAct ? ';color:var(--acc);font-weight:600' : '') + '">' + esc(c.t || ('Chương ' + (i + 1))) + '</span>' +
            '</button>' +
            chapterRowBadge(c) +
            '<button class="btn icon ghost sm" data-act="chapter-move" data-dir="-1" data-idx="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Di chuyển lên">' + window.icon('arrowup', 's') + '</button>' +
            '<button class="btn icon ghost sm" data-act="chapter-move" data-dir="1" data-idx="' + i + '"' + (i === S.chapters.length - 1 ? ' disabled' : '') + ' aria-label="Di chuyển xuống">' + window.icon('arrowdown', 's') + '</button>' +
            '<button class="btn icon ghost sm" data-act="chapter-delete" data-idx="' + i + '" aria-label="Xóa chương">' + window.icon('trash', 's') + '</button>' +
          '</div>';
        }).join('')
      : '<div class="state" style="min-height:110px;border:0"><p>Bộ này chưa có chương nào · bấm <b>+ Thêm</b> hoặc nhập tiêu đề và nội dung bên dưới rồi bấm <b>Lưu chương</b>.</p></div>';

    var left = '<div class="card"><div class="card-hd"><h3>Danh sách chương · ' + esc(curBookTitle) + '</h3>' +
      '<span class="right">' + S.chapters.length + ' chương</span>' +
      '<button class="btn sm" data-act="chapter-add">' + window.icon('plus', 's') + 'Thêm</button></div>' +
      '<div class="card-bd tight ch-list-scroll" style="padding:6px 10px" tabindex="0" role="region" aria-label="Danh sách chương">' + leftBody + '</div></div>';

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
          Object.keys(CH_STATUS_LABELS).map(function (k) { return '<option value="' + k + '"' + (k === S.chapterStatus ? ' selected' : '') + '>' + esc(CH_STATUS_LABELS[k]) + '</option>'; }).join('') +
          '</select></span></div>' +
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
        '<button class="btn danger sm" type="button" data-act="chapter-delete" data-idx="' + (S.activeChapter || 0) + '"' + (S.chapters.length ? '' : ' disabled') + '>' + window.icon('trash', 's') + 'Xoá chương</button></div>' +
      '<div class="state-note mt">' + window.icon('info', 's') + ' Ctrl/Cmd+S lưu chương lên KV · Ctrl/Cmd+Alt+N thêm chương mới · Dán trực tiếp từ Word/Google Docs giữ nguyên đậm/nghiêng/đoạn văn.</div>' +
      '</div></div>';

    return window.chapterPipeline() + '<div class="mt">' + left + '</div><div class="mt">' + editor + '</div>';
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
  window.cover = function (b, cls) {
    var u = b && String(b.thumb || '').trim();
    if (u && /^https?:\/\//i.test(u))
      return '<img class="cover ' + (cls || '') + '" src="' + esc(u) + '" alt="Bìa ' + esc(b.t || '') +
        '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-cover="1" data-fb-text="' +
        esc(String(b.t || '').slice(0, 3)) + '">';
    return origCover(b, cls);
  };
  var st = D.createElement('style');
  st.textContent = 'img.cover{object-fit:cover;display:block;padding:0}';
  D.head.appendChild(st);

  var origRender = M.render;
  var CLOCK = (function () {
    function z(n) { return ('0' + n).slice(-2); }
    var d = new Date();
    return z(d.getDate()) + '/' + z(d.getMonth() + 1) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  })();
  window.render = function () {
    S.kvWrites = WRITES; S.kvReads = READS;
    origRender();
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
    var incoming = job.parts.map(function (p) {
      return { t: p.t, html: htmlForStorage(p.html), status: 'published' };
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
          say('Đã nhập ' + incoming.length + ' chương từ "' + job.file + '" lên KV.');
          redraw();
        });
    }).catch(fail);
  }
  function realImportFile(el) {
    if (!(el.files && el.files.length)) return;
    var file = el.files[0];
    var kind = el.dataset.kind;
    var slug = BOOK_SLUG || S.chapterBook || S.selectedBook;
    el.value = '';
    if (!slug) { say('Chọn một bộ trước khi nhập chương.', 'bad'); return; }
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
      var meta = findMeta(S.selectedBook || BOOK_SLUG);
      if (!meta) throw new Error('Chọn bộ trước khi tải bìa.');
      var next = clone(REG);
      var hit = (next.lib || []).find(function (m) { return m.slug === meta.slug; });
      hit.thumb = src; hit.slide = src;
      return writeRegistry(next);
    }).then(function () { say('Đã lưu ảnh bìa lên KV.'); }).catch(fail);
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
    else if (r === 'chapter-book') {
      e.preventDefault(); e.stopPropagation();
      snapshotLiveEditor();
      S.chapterBook = el.value; S.selectedBook = el.value; S.editorPreview = false;
      (S.conn === 'static' ? loadStaticBook(el.value) : loadBook(el.value)).catch(function () {});
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
