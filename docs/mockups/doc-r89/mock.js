/* Mockup trang đọc r89 — cho phép thao tác thật: mục lục, cài đặt, cảm xúc,
   bình luận, đánh dấu, tập trung, chuyển chương. Trạng thái nhớ trong localStorage. */
(function () {
  if (!window.CHAPDATA) { return; }
  var D = window.CHAPDATA, CH = D.ch, KEY = 'sso-rd-r89';
  var NCHAP = CH.filter(function (c) { return /^Chương\s+\d/.test(c.t); }).length;

  var DEF = { rd: 'kem', size: 18, line: 1.8, w: 720, para: 1.05, font: 'serif', just: 0 };
  var S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { S = {}; }
  ['rd', 'size', 'line', 'w', 'para', 'font', 'just'].forEach(function (k) {
    if (S[k] === undefined) S[k] = DEF[k];
  });
  S.cm = S.cm || {}; S.rx = S.rx || {}; S.mark = S.mark || {}; S.like = S.like || {};
  if (S.ch === undefined) S.ch = 2;
  if (!S.seeded) {
    S.cm[2] = [
      { n: 'Minh Anh', tm: '2 giờ trước', x: 'Đoạn tả bức tường đọc mà buồn cười, kiểu gì cũng có chuyện.' },
      { n: 'hạt mầm', tm: 'hôm qua', x: 'Chương này ngắn mà dẫn truyện khéo ghê.', s: 'sso-love-it' }
    ];
    S.seeded = 1;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var B = document.body;

  /* ---------------- tiện ích ---------------- */
  var STNAME = { 'sso-brick': 'Sụp đổ', 'sso-love-it': 'Mê rồi', 'sso-cry-flood': 'Khóc lụt nhà',
    'sso-crown-chaos': 'Đội vương miện', 'sso-fighting': 'Sẵn sàng chiến', 'sso-flattened': 'Bị đè bẹp' };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function chapNo(t) { var m = /^Chương\s+(\d+)/.exec(t); return m ? +m[1] : 0; }
  function shortName(t) { var n = chapNo(t); return n ? 'Chương ' + n : t.replace(/\s*\(.*\)$/, ''); }
  function kindOf(t) {
    if (/^Lời\s+mở\s+đầu/i.test(t)) return { k: 'intro', h: 'Mở đầu' };
    if (/^Chương\s+\d/i.test(t)) return { k: 'chap', h: 'Chương' };
    if (/^Ngoại\s+truyện/i.test(t)) return { k: 'extra', h: 'Ngoại truyện' };
    if (/^Lời\s+tác\s+giả/i.test(t)) return { k: 'note', h: 'Lời tác giả' };
    if (/^Lời\s+kết/i.test(t)) return { k: 'end', h: 'Lời kết' };
    return { k: 'other', h: 'Khác' };
  }
  function words(ps) { return ps.join(' ').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length; }

  var toasts = $('#toasts'), toastT = null;
  function toast(msg) {
    var d = document.createElement('div');
    d.className = 'toast'; d.textContent = msg;
    toasts.innerHTML = ''; toasts.appendChild(d);
    clearTimeout(toastT);
    toastT = setTimeout(function () { toasts.innerHTML = ''; }, 2400);
  }

  /* ---------------- cài đặt hiển thị ---------------- */
  function apply() {
    B.dataset.rd = S.rd;
    var st = B.style;
    st.setProperty('--fs', S.size + 'px');
    st.setProperty('--lh', String(S.line));
    st.setProperty('--w', S.w + 'px');
    st.setProperty('--para', S.para + 'em');
    st.setProperty('--read', S.font === 'sans' ? 'var(--sans)' : 'var(--serif)');
    var tx = $('#txt'); if (tx) tx.classList.toggle('just', !!+S.just);
    syncSetUI(); save();
  }
  function syncSetUI() {
    var m = { iSize: ['size', function (v) { return v + ' px'; }],
              iLine: ['line', function (v) { return String(v).replace('.', ','); }],
              iWidth: ['w', function (v) { return v + ' px'; }],
              iPara: ['para', function (v) { return String(v).replace('.', ',') + ' em'; }] };
    Object.keys(m).forEach(function (id) {
      var el = $('#' + id); if (!el) return;
      var k = m[id][0]; el.value = S[k];
      var lab = $('#v' + id.slice(1)); if (lab) lab.textContent = m[id][1](S[k]);
    });
    segSet('segTheme', S.rd); segSet('segFont', S.font); segSet('segJust', String(+S.just));
  }
  function segSet(id, val) {
    var box = $('#' + id); if (!box) return;
    $$('button', box).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === val)); });
  }

  /* ---------------- mục lục ---------------- */
  function buildToc() {
    var host = $('#tocList'); if (!host) return;
    var html = '', last = null, cnt = {};
    CH.forEach(function (c, i) { var k = kindOf(c.t).k; cnt[k] = (cnt[k] || 0) + 1; });
    CH.forEach(function (c, i) {
      var kd = kindOf(c.t);
      if (kd.h !== last) {
        var cell = cnt[kd.k] ? '<div class="tg"><span>' + kd.h + '</span><span>' + cnt[kd.k] + '</span></div>' : '';
        html += cell; last = kd.h;
      }
      var n = chapNo(c.t);
      html += '<button type="button" class="ti" data-i="' + i + '">' +
        '<span class="n">' + (n ? n : '·') + '</span><span>' + esc(c.t) + '</span></button>';
    });
    host.innerHTML = html;
    $$('.ti', host).forEach(function (b) {
      b.addEventListener('click', function () {
        load(+b.dataset.i); closeSheets(); window.scrollTo(0, 0);
      });
    });
    var sub = $('#tocSub');
    if (sub) sub.textContent = CH.length + ' mục · ' + NCHAP + ' chương';
    markCur();
  }
  function markCur() {
    $$('.ti').forEach(function (b) { b.classList.toggle('cur', +b.dataset.i === S.ch); });
  }

  /* ---------------- đổ chương ---------------- */
  var txt = $('#txt');
  function load(i, keepScroll) {
    i = Math.max(0, Math.min(CH.length - 1, i));
    S.ch = i; save();
    var c = CH[i], n = chapNo(c.t);
    c.w = c.w || words(c.ps);
    var html = c.ps.map(function (p) {
      if (p === '§') return '<hr>';
      if (p.length < 26 && /^\d{1,2}:\d{2}/.test(p)) return '<p class="beat">' + p + '</p>';
      return '<p>' + p + '</p>';
    }).join('');
    if (txt) txt.innerHTML = html;

    var h1 = $('#h1'); if (h1) h1.textContent = c.t;
    var meta = $('#meta');
    if (meta) meta.innerHTML = '<span>' + c.w.toLocaleString('vi-VN') + ' từ</span>' +
      '<span class="d">·</span><span>' + Math.max(1, Math.round(c.w / 250)) + ' phút đọc</span>';

    var bt = $('#bTitle'), bs = $('#bSub');
    if (bt) bt.textContent = B.dataset.v === 'a' ? (D.book || 'Third Person') : c.t;
    if (bs) bs.textContent = B.dataset.v === 'a'
      ? (n ? 'Chương ' + n + ' / ' + NCHAP : 'Phần mở đầu')
      : ((D.book || 'Third Person') + ' · ' + (n ? n + '/' + NCHAP : 'mở đầu'));

    var he = $('#hend');
    if (he) he.textContent = n ? 'Hết chương ' + n : 'Hết mục';

    var pv = i > 0 ? CH[i - 1] : null, nx = i < CH.length - 1 ? CH[i + 1] : null;
    var slots = { prevName: pv && pv.t, nextName: nx && nx.t,
                  prevShort: pv && shortName(pv.t), nextShort: nx && shortName(nx.t) };
    Object.keys(slots).forEach(function (k) {
      $$('[data-slot="' + k + '"]').forEach(function (el) { el.textContent = slots[k] || ''; });
    });
    $$('[data-act="prev"]').forEach(function (a) { a.toggleAttribute('data-off', !pv); });
    $$('[data-act="next"]').forEach(function (a) { a.toggleAttribute('data-off', !nx); });

    document.title = c.t + ' · ' + (D.book || 'Third Person');
    syncChapterUI(); markCur();
    if (!keepScroll) progress();
  }

  /* trạng thái theo chương: cảm xúc, thích, đánh dấu, bình luận */
  function syncChapterUI() {
    var rx = S.rx[S.ch] || {};
    $$('.rxb').forEach(function (b) { b.setAttribute('aria-pressed', String(!!rx[b.dataset.s])); });
    var total = Object.keys(rx).filter(function (k) { return rx[k]; }).length;
    var t = $('#rxTotal'); if (t) t.textContent = total + ' lượt';
    var list = $('#rxList');
    if (list && !list.hidden) renderRxList();

    var liked = !!S.like[S.ch];
    $$('[data-act="like"]').forEach(function (a) { a.setAttribute('aria-pressed', String(liked)); });
    setLabel('like', liked ? 'Đã thích' : 'Thích');
    setLabel('shelf', S.shelf ? 'Đã lưu' : 'Lưu');
    setLabel('follow', S.follow ? 'Đã theo dõi' : 'Theo dõi');
    $$('[data-act="shelf"]').forEach(function (a) { a.setAttribute('aria-pressed', String(!!S.shelf)); });
    $$('[data-act="follow"]').forEach(function (a) { a.setAttribute('aria-pressed', String(!!S.follow)); });

    var marked = !!S.mark[S.ch];
    $$('[data-act="mark"]').forEach(function (b) { b.setAttribute('aria-pressed', String(marked)); });

    renderCmts();
  }
  function setLabel(act, text) {
    $$('[data-act="' + act + '"]').forEach(function (a) {
      var s = a.querySelector('span'); if (s) s.textContent = text;
    });
  }
  function renderRxList() {
    var list = $('#rxList'), rx = S.rx[S.ch] || {};
    var out = Object.keys(rx).filter(function (k) { return rx[k]; })
      .map(function (k) { return STNAME[k]; });
    list.textContent = out.length ? 'Bạn đã thả: ' + out.join(' · ') : 'Chưa có cảm xúc nào ở chương này.';
  }

  /* ---------------- bình luận ---------------- */
  function cmtsOf(i) { S.cm[i] = S.cm[i] || []; return S.cm[i]; }
  function renderCmts() {
    var host = $('#cmtList'), arr = cmtsOf(S.ch);
    if (!host) return;
    var list = arr.slice();
    if (S.sort === 'old') list.reverse();
    host.innerHTML = list.map(function (c) {
      return '<div class="cmt"><div class="av">' + esc((c.n || 'K')[0].toUpperCase()) + '</div>' +
        '<div class="cb"><div><span class="nm">' + esc(c.n) + '</span>' +
        '<span class="tm">' + esc(c.tm) + '</span></div>' +
        (c.x ? '<p>' + esc(c.x) + '</p>' : '') +
        (c.s ? '<img src="st/' + c.s + '.webp" alt="' + STNAME[c.s] + '">' : '') + '</div></div>';
    }).join('');
    var cnt = $('#cmtCount'); if (cnt) cnt.textContent = arr.length;
    setLabel('cmt', arr.length ? 'Bình luận ' + arr.length : 'Bình luận');
  }

  /* ---------------- bảng trượt ---------------- */
  var scrim = $('#scrim'), openSheet = null;
  function open(id) {
    var s = $('#' + id); if (!s) return;
    closeSheets();
    s.classList.add('open'); s.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.hidden = false;
    B.style.overflow = 'hidden'; openSheet = s;
  }
  function closeSheets() {
    $$('.sheet').forEach(function (s) { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); });
    if (scrim) scrim.hidden = true;
    B.style.overflow = ''; openSheet = null;
  }
  if (scrim) scrim.addEventListener('click', closeSheets);
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeSheets); });

  /* ---------------- tiến độ đọc ---------------- */
  function progress() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
    var bar = $('#ptBar'); if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    var pct = $('#bPct'); if (pct) pct.textContent = Math.round(p * 100) + '%';
    var tick = $('#bTick');
    if (tick) {
      var lit = Math.round(p * 6);
      $$('i', tick).forEach(function (el, k) { el.classList.toggle('on', k < lit); });
    }
  }
  window.addEventListener('scroll', progress, { passive: true });
  window.addEventListener('resize', progress);

  /* ---------------- gắn sự kiện ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.dataset.act;
    if (act === 'prev' || act === 'next') {
      e.preventDefault();
      if (t.hasAttribute('data-off')) return;
      load(S.ch + (act === 'next' ? 1 : -1)); window.scrollTo(0, 0);
      return;
    }
    e.preventDefault();
    if (act === 'toc') { open('tocSheet'); return; }
    if (act === 'set') { open('setSheet'); return; }
    if (act === 'back') { toast('Trang truyện không có trong mockup — dùng mục lục để đổi chương.'); return; }
    if (act === 'mark') {
      S.mark[S.ch] = !S.mark[S.ch]; save(); syncChapterUI();
      toast(S.mark[S.ch] ? 'Đã đánh dấu ' + shortName(CH[S.ch].t) : 'Đã bỏ đánh dấu');
      return;
    }
    if (act === 'focus') {
      if (openSheet) closeSheets();
      B.classList.toggle('focus');
      toast(B.classList.contains('focus') ? 'Chế độ tập trung — chỉ còn chữ' : 'Đã thoát chế độ tập trung');
      return;
    }
    if (act === 'full') {
      if (openSheet) closeSheets();
      if (!document.fullscreenElement) {
        (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
        toast('Toàn màn hình — Esc để thoát');
      } else { document.exitFullscreen(); }
      return;
    }
    if (act === 'like') { S.like[S.ch] = !S.like[S.ch]; save(); syncChapterUI(); toast(S.like[S.ch] ? 'Đã thích chương này' : 'Đã bỏ thích'); return; }
    if (act === 'shelf') { S.shelf = !S.shelf; save(); syncChapterUI(); toast(S.shelf ? 'Đã lưu truyện vào tủ' : 'Đã bỏ khỏi tủ'); return; }
    if (act === 'follow') { S.follow = !S.follow; save(); syncChapterUI(); toast(S.follow ? 'Đã theo dõi truyện' : 'Đã bỏ theo dõi'); return; }
    if (act === 'report') { toast('Đã gửi báo lỗi chữ tới tác giả'); return; }
    if (act === 'cmt') {
      e.preventDefault();
      if (B.dataset.v === 'c') { var f = $('#cmtFold'); if (f) f.open = true; }
      var c = $('#cmts'); if (c) c.scrollIntoView({ block: 'start' });
      var ta = $('#cmtText'); if (ta) setTimeout(function () { ta.focus(); }, 30);
      return;
    }
  });

  $$('.rxb').forEach(function (b) {
    b.addEventListener('click', function () {
      var rx = S.rx[S.ch] = S.rx[S.ch] || {};
      var k = b.dataset.s;
      rx[k] = !rx[k]; save(); syncChapterUI();
      toast(rx[k] ? 'Đã thả cảm xúc: ' + STNAME[k] : 'Đã bỏ cảm xúc');
    });
  });
  var rxMore = $('#rxMore');
  if (rxMore) rxMore.addEventListener('click', function () {
    var l = $('#rxList'); if (!l) return;
    l.hidden = !l.hidden;
    if (!l.hidden) renderRxList();
    rxMore.textContent = l.hidden ? 'Chi tiết' : 'Ẩn';
  });

  /* cài đặt */
  function bindRange(id, key, fmt) {
    var el = $('#' + id); if (!el) return;
    el.addEventListener('input', function () {
      S[key] = key === 'size' || key === 'w' ? +el.value : parseFloat(el.value);
      var lab = $('#v' + id.slice(1)); if (lab) lab.textContent = fmt(S[key]);
      apply();
    });
  }
  bindRange('iSize', 'size', function (v) { return v + ' px'; });
  bindRange('iLine', 'line', function (v) { return String(v).replace('.', ','); });
  bindRange('iWidth', 'w', function (v) { return v + ' px'; });
  bindRange('iPara', 'para', function (v) { return String(v).replace('.', ',') + ' em'; });

  [['segTheme', 'rd', function (v) { return v; }],
   ['segFont', 'font', function (v) { return v; }],
   ['segJust', 'just', function (v) { return +v; }]].forEach(function (cfg) {
    var box = $('#' + cfg[0]); if (!box) return;
    $$('button', box).forEach(function (b) {
      b.addEventListener('click', function () {
        S[cfg[1]] = cfg[2](b.dataset.v);
        apply();
        if (cfg[1] === 'rd') toast('Nền ' + b.textContent.toLowerCase());
      });
    });
  });
  var reset = $('#setReset');
  if (reset) reset.addEventListener('click', function () {
    ['rd', 'size', 'line', 'w', 'para', 'font', 'just'].forEach(function (k) { S[k] = DEF[k]; });
    apply(); toast('Đã về mặc định');
  });

  /* bình luận */
  var pending = null;
  var pick = $('#cmtPick'), pickBtn = $('#cmtStickerBtn'), stick = $('#cmtStick');
  function drawStick() {
    if (!stick) return;
    stick.innerHTML = pending
      ? '<img src="st/' + pending + '.webp" alt="' + STNAME[pending] + '"><button type="button" class="rm" aria-label="Bỏ sticker">×</button>'
      : '';
    stick.hidden = !pending;
  }
  if (pickBtn) pickBtn.addEventListener('click', function () {
    if (!pick) return;
    pick.hidden = !pick.hidden;
    pickBtn.setAttribute('aria-expanded', String(!pick.hidden));
  });
  if (pick) $$('button', pick).forEach(function (b) {
    b.addEventListener('click', function () {
      pending = b.dataset.pick; drawStick();
      pick.hidden = true; pickBtn.setAttribute('aria-expanded', 'false');
    });
  });
  if (stick) stick.addEventListener('click', function (e) {
    if (e.target.closest('.rm')) { pending = null; drawStick(); }
  });
  var form = $('#cmtForm');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var nameEl = $('#cmtName'), textEl = $('#cmtText'), err = $('#cmtErr');
    var name = (nameEl && nameEl.value.trim()) || 'Khách';
    var text = (textEl && textEl.value.trim()) || '';
    if (!text && !pending) { if (err) err.hidden = false; if (textEl) textEl.focus(); return; }
    if (err) err.hidden = true;
    cmtsOf(S.ch).unshift({ n: name, tm: 'vừa xong', x: text, s: pending || undefined });
    pending = null; drawStick();
    if (textEl) textEl.value = '';
    save(); renderCmts();
    toast('Đã gửi bình luận');
  });
  var sortBtn = $('#cmtSort');
  if (sortBtn) sortBtn.addEventListener('click', function () {
    S.sort = S.sort === 'old' ? 'new' : 'old'; save(); renderCmts();
    sortBtn.textContent = S.sort === 'old' ? 'Cũ nhất' : 'Mới nhất';
  });

  /* phím tắt */
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === 'Escape') {
      if (openSheet) { closeSheets(); return; }
      if (B.classList.contains('focus')) { B.classList.remove('focus'); return; }
    }
    if (typing) return;
    if (e.key === 'ArrowRight' && S.ch < CH.length - 1) { load(S.ch + 1); window.scrollTo(0, 0); }
    if (e.key === 'ArrowLeft' && S.ch > 0) { load(S.ch - 1); window.scrollTo(0, 0); }
  });

  /* khung xem điện thoại */
  var pane = /[?&]pane=1/.test(location.search);
  if (pane) { B.classList.add('pane'); }
  else {
    var sw = $('#switch');
    if (sw) {
      $$('button', sw).forEach(function (b) {
        b.addEventListener('click', function () {
          var m = b.dataset.m;
          B.classList.toggle('ism', m === 'm');
          $$('button', sw).forEach(function (x) { x.classList.toggle('on', x === b); });
          var f = $('.devw iframe');
          if (m === 'm' && f) f.src = '?pane=1&t=' + Date.now();
        });
      });
      var w = document.createElement('div');
      w.className = 'devw';
      w.innerHTML = '<div class="devb"><div class="devh"><span>390 px</span>' +
        '<button type="button" aria-label="Đóng">×</button></div>' +
        '<iframe src="?pane=1" title="Bản xem trên điện thoại"></iframe></div>';
      w.addEventListener('click', function (e) {
        if (e.target === w || e.target.tagName === 'BUTTON') {
          B.classList.remove('ism');
          $('[data-m=d]', sw).classList.add('on');
          $('[data-m=m]', sw).classList.remove('on');
        }
      });
      B.appendChild(w);
    }
  }

  /* khởi động */
  apply(); buildToc(); load(S.ch, true);
  if (sortBtn && S.sort === 'old') sortBtn.textContent = 'Cũ nhất';
  progress();
})();
