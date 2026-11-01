/* Mục lục trong trang đọc — ba kiểu, thao tác được. */
(function () {
  'use strict';
  if (!window.CHAPDATA) return;
  var D = window.CHAPDATA, CH = D.ch, BOOK = D.book || 'Third Person';
  var KEY = 'sso-rd-r89b';
  var NCHAP = CH.filter(function (c) { return /^Chương\s+\d/.test(c.t); }).length;

  var B = document.body;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function ic(p, w) {
    return '<svg viewBox="0 0 24 24" width="' + (w || 20) + '" height="' + (w || 20) + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + p + '</svg>';
  }
  var I = {
    back: '<path d="M15 6l-6 6l6 6"/>',
    toc: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    mark: '<path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3l-5 3V6a2 2 0 0 1 2-2"/>',
    set: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6l-12 12"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/>'
  };

  function chapNo(t) { var m = /^Chương\s+(\d+)/.exec(t); return m ? +m[1] : 0; }
  function nameOf(t) { return t.replace(/^Chương\s+\d+\s*:\s*/, ''); }
  function kindOf(t) {
    if (/^Lời\s+mở\s+đầu/i.test(t)) return { k: 'intro', h: 'Mở đầu' };
    if (/^Chương\s+\d/i.test(t)) return { k: 'chap', h: 'Chương' };
    if (/^Ngoại\s+truyện/i.test(t)) return { k: 'extra', h: 'Ngoại truyện' };
    if (/^Lời\s+tác\s+giả/i.test(t)) return { k: 'note', h: 'Lời tác giả' };
    if (/^Lời\s+kết/i.test(t)) return { k: 'end', h: 'Lời kết' };
    return { k: 'other', h: 'Khác' };
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }
  function words(ps) { return ps.join(' ').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length; }

  /* nhóm theo thứ tự đăng (không đổi thứ tự chương) */
  function groups() {
    var out = [], map = {};
    CH.forEach(function (c, i) {
      var k = kindOf(c.t).k;
      if (!map[k]) { map[k] = { k: k, h: kindOf(c.t).h, items: [] }; out.push(map[k]); }
      map[k].items.push({ i: i, t: c.t, n: chapNo(c.t) });
    });
    return out;
  }

  /* trạng thái */
  var hash = (location.hash || '').replace('#', '');
  var S = { t: /^[abc]$/.test(hash) ? hash : 'a', ch: 2, q: '' };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    if (saved.v) { /* giữ trang đọc C */ }
    if (saved.ch !== undefined) S.ch = saved.ch;
    if (saved.mark) S.mark = saved.mark;
    if (saved.rd) B.dataset.rd = saved.rd;
  } catch (e) {}
  S.mark = S.mark || {};

  var SHEET = $('#sheet'), SCRIM = $('#scrim'), TBTN = $('#toggle');

  /* ---------- nền: trang đọc ---------- */
  function paintBackdrop() {
    var c = CH[S.ch], n = chapNo(c.t), w = c.w || words(c.ps);
    $('#bgTitle').textContent = nameOf(c.t);
    $('#bgSub').textContent = BOOK + ' · ' + (n ? n + ' / ' + NCHAP : 'mở đầu');
    $('#bgOver').innerHTML = (n ? 'Chương ' + n : 'Mở đầu') + '<span class="dot"></span>' + esc(BOOK);
    $('#bgH1').textContent = nameOf(c.t);
    $('#bgMeta').innerHTML = '<span>' + w.toLocaleString('vi-VN') + ' từ</span>' +
      '<span class="sep">·</span><span>' + Math.max(1, Math.round(w / 250)) + ' phút đọc</span>';
    $('#bgTxt').innerHTML = c.ps.slice(0, 7).map(function (p) {
      if (p.length < 26 && /^\d{1,2}:\d{2}/.test(p)) return '<p class="beat">' + p + '</p>';
      return '<p>' + p + '</p>';
    }).join('');
  }

  /* ---------- các kiểu mục lục ---------- */
  function rowHtml(it, extra) {
    var cur = it.i === S.ch;
    var cls = 'row-t' + (cur ? ' cur' : '');
    var note = cur ? '<span class="note">đang đọc</span>' : '';
    var bk = (!cur && S.mark[it.i]) ? '<span class="bk" title="đã đánh dấu"></span>' : '';
    return '<button type="button" class="' + cls + (extra || '') + '" data-i="' + it.i + '">' +
      '<span class="num">' + (it.n || '') + '</span>' +
      '<span class="tt">' + esc(it.n ? nameOf(it.t) : it.t) + '</span>' + bk + note + '</button>';
  }

  function listHtml(filter) {
    var out = '', gs = groups();
    gs.forEach(function (g) {
      var items = g.items.filter(function (it) {
        if (!filter) return true;
        var key = norm(it.t + ' ' + (it.n || ''));
        return key.indexOf(filter) >= 0;
      });
      if (!items.length) return;
      out += '<div class="tg"><span>' + g.h + '</span><i>' + items.length + '</i></div>' +
        '<div class="rows">' + items.map(function (it) { return rowHtml(it); }).join('') + '</div>';
    });
    return out || '<p class="tempty">Không có mục nào khớp “' + esc(S.q) + '”.</p>';
  }

  function gridHtml() {
    var chap = [], others = [];
    CH.forEach(function (c, i) {
      var it = { i: i, t: c.t, n: chapNo(c.t) };
      (it.n ? chap : others).push(it);
    });
    var cells = chap.map(function (it) {
      return '<button type="button" class="cell' + (it.i === S.ch ? ' cur' : '') +
        '" data-i="' + it.i + '" aria-label="' + esc(it.t) + '" title="' + esc(nameOf(it.t)) + '">' +
        it.n + (S.mark[it.i] ? '<span class="dot"></span>' : '') + '</button>';
    }).join('');
    var rest = others.length
      ? '<div class="tg"><span>Mục khác</span><i>' + others.length + '</i></div>' +
        '<div class="listother">' + others.map(function (it) { return rowHtml({ i: it.i, t: it.t, n: 0 }); }).join('') + '</div>'
      : '';
    return '<div class="gridwrap"><div class="gridcap"><span>Chương</span><span>' +
      chap.length + '</span></div><div class="gridc">' + cells + '</div></div>' + rest;
  }

  function colsHtml() {
    var out = '', gs = groups();
    gs.forEach(function (g) {
      out += '<div class="tg"><span>' + g.h + '</span><i>' + g.items.length + '</i></div>';
      out += g.k === 'chap'
        ? '<div class="cols2">' + g.items.map(function (it) { return rowHtml(it); }).join('') + '</div>'
        : '<div class="rows">' + g.items.map(function (it) { return rowHtml(it); }).join('') + '</div>';
    });
    return out;
  }

  function footHtml() {
    var c = CH[S.ch], n = chapNo(c.t);
    var pct = n ? Math.round(n / NCHAP * 100) : 0;
    return '<div class="tfoot"><span class="pos">' + (n ? n + '/' + NCHAP : '—') + '</span>' +
      '<span class="bar2"><i style="width:' + pct + '%"></i></span>' +
      '<b>' + esc(nameOf(c.t)) + '</b></div>';
  }

  function render() {
    SHEET.classList.toggle('toc-wide', S.t === 'c');
    var head = '<div class="sh-h"><b>Mục lục</b><span class="sub">' +
      (CH.length) + ' mục · ' + NCHAP + ' chương</span>' +
      '<button class="x" type="button" data-close aria-label="Đóng mục lục">' + ic(I.x) + '</button></div>';
    var search = S.t === 'a'
      ? '<div class="tsearch">' + ic(I.search, 17) +
        '<input type="search" id="tq" placeholder="Tìm chương hoặc số…" value="' + esc(S.q) + '" ' +
        'autocomplete="off" aria-label="Tìm chương">' +
        '<button class="clr" type="button" data-clear aria-label="Xóa tìm kiếm"' + (S.q ? '' : ' hidden') + '>' +
        ic(I.x, 15) + '</button></div>'
      : '';
    var body = S.t === 'a' ? listHtml(norm(S.q)) : (S.t === 'b' ? gridHtml() : colsHtml());
    SHEET.innerHTML = head + '<div class="sh-b">' + search + body + '</div>' + footHtml();
    if (S.t === 'a') {
      var inp = $('#tq');
      if (inp) {
        inp.addEventListener('input', function () {
          S.q = inp.value; render(); keepScroll(); focusSearch();
        });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { e.stopPropagation(); S.q = ''; render(); }
        });
      }
    }
    markCur();
  }

  var lastScroll = 0;
  function keepScroll() {
    var b = $('.sh-b');
    if (b) b.scrollTop = lastScroll;
  }
  function focusSearch() {
    var i = $('#tq'); if (!i) return;
    i.focus({ preventScroll: true });
    var v = i.value; i.value = ''; i.value = v;
  }
  function markCur() {
    $$('[data-i]').forEach(function (el) { el.classList.toggle('cur', +el.dataset.i === S.ch); });
  }
  function scrollToCur(center) {
    var b = $('.sh-b'); if (!b) return;
    var cur = $('.row-t.cur') || $('.cell.cur');
    if (!cur) return;
    var r = cur.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (center) {
      b.scrollTop += (r.top - br.top) - (br.height / 2 - r.height / 2);
    } else if (r.top < br.top || r.bottom > br.bottom) {
      b.scrollTop += (r.top - br.top) - 12;
    }
    lastScroll = b.scrollTop;
  }

  /* ---------- mở / đóng ---------- */
  var open = false;
  function setOpen(v) {
    open = v;
    SHEET.classList.toggle('open', v);
    SCRIM.hidden = !v;
    TBTN.textContent = v ? 'Đóng' : 'Mở';
    B.classList.toggle('sheet-open', v);
    B.style.overflow = v ? 'hidden' : '';
    if (v) { render(); requestAnimationFrame(function () { scrollToCur(true); }); }
  }

  /* ---------- sự kiện ---------- */
  document.addEventListener('click', function (e) {
    var row = e.target.closest('[data-i]');
    if (row) {
      S.ch = +row.dataset.i;
      try {
        var st = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
        st.ch = S.ch; localStorage.setItem(KEY, JSON.stringify(st));
      } catch (err) {}
      paintBackdrop();
      markCur();
      var foot = $('.tfoot');
      if (foot) foot.outerHTML = footHtml();
      var el = $('[data-i="' + S.ch + '"]');
      if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
      return;
    }
    if (e.target.closest('[data-close]')) { setOpen(false); return; }
    if (e.target.closest('[data-clear]')) {
      S.q = ''; render(); focusSearch(); return;
    }
    if (e.target.closest('#scrim')) { setOpen(false); return; }
    var t = e.target.closest('[data-t]');
    if (t) {
      S.t = t.dataset.t;
      $$('[data-t]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === t)); });
      render(); requestAnimationFrame(function () { scrollToCur(true); });
      return;
    }
    var rd = e.target.closest('[data-rd]');
    if (rd) {
      B.dataset.rd = rd.dataset.rd;
      $$('[data-rd]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === rd)); });
      return;
    }
  });

  TBTN.addEventListener('click', function () { setOpen(!open); });

  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    if (!/^[abc]$/.test(h)) return;
    S.t = h;
    $$('[data-t]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.t === h)); });
    render(); requestAnimationFrame(function () { scrollToCur(true); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && open && !$('#tq:focus')) setOpen(false);
  });

  /* ---------- khởi động ---------- */
  $('#bgBack').innerHTML = ic(I.back);
  $('#bgToc').innerHTML = ic(I.toc);
  $('#bgMark').innerHTML = ic(I.mark);
  $('#bgSet').innerHTML = ic(I.set);
  paintBackdrop();
  $$('[data-t]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.t === S.t)); });
  setOpen(true);
})();
