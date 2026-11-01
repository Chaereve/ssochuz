/* ============================================================================
   BẢN DỰNG r100b — trang Tác giả · phần chạy thử
   Dữ liệu thật (40 tác giả · 67 truyện) lấy từ registry, sinh sẵn ở data.js.
   Chỉ để bấm thử: tìm, sắp xếp, lọc trạng thái, nhảy A–Z, mở bảng chi tiết.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.MK;
  var A = D.authors;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var ST = [
    { k: 'run', label: 'Đang cập nhật' },
    { k: 'soon', label: 'Sắp ra mắt' },
    { k: 'done', label: 'Hoàn thành' }
  ];
  var STNAME = { run: 'đang cập nhật', soon: 'sắp ra mắt', done: 'hoàn thành' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd').toLowerCase();
  }
  function letterOf(name) {
    var c = norm(name).charAt(0);
    return /[a-z]/.test(c) ? c.toUpperCase() : '#';
  }
  function shortDate(u) {
    var p = String(u || '').split('-');
    return p.length === 3 ? p[2] + '-' + p[1] : '';
  }
  function longDate(u) {
    var p = String(u || '').split('-');
    return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : '';
  }
  function personURL(slug) { return '/site/tac-gia/?q=' + encodeURIComponent(slug); }

  /* bìa: nếp gáy in trong bìa + khối giấy bên phải */
  function book(a) {
    var im = a.cov && a.cov[0];
    var cv = im
      ? '<span class="cv"><img src="' + esc(im) + '" alt="" loading="lazy" decoding="async"></span>'
      : '<span class="cv"><span>' + esc(a.ini) + '</span></span>';
    return '<span class="bk' + (im ? '' : ' noimg') + '" aria-hidden="true">' + cv +
      '<span class="pp"></span></span>';
  }

  function stBits(a) {
    var on = ST.filter(function (x) { return a.st[x.k] > 0; });
    var multi = on.length > 1;   /* một trạng thái thì khỏi lặp lại con số vừa nêu */
    return on.map(function (x) {
      return '<span><i class="xdot ' + x.k + '"></i>' +
        (multi ? a.st[x.k] + ' ' : '') + STNAME[x.k] + '</span>';
    }).join('');
  }

  /* ---------------- trạng thái + URL ---------------- */
  var S = { q: '', sort: 'az', st: '' };

  function readURL() {
    var p = new URLSearchParams(location.search);
    S.q = (p.get('q') || '').trim();
    var so = p.get('sort');
    S.sort = (so === 'count' || so === 'new') ? so : 'az';
    var st = p.get('st') || '';
    S.st = ST.some(function (x) { return x.k === st; }) ? st : '';
  }
  function writeURL() {
    var p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    if (S.sort !== 'az') p.set('sort', S.sort);
    if (S.st) p.set('st', S.st);
    var q = p.toString();
    history.replaceState(null, '', q ? '?' + q : location.pathname);
  }
  function filtering() { return !!S.q || !!S.st; }

  function list() {
    var out = A.filter(function (a) {
      if (S.q && norm(a.n).indexOf(norm(S.q)) < 0) return false;
      if (S.st && !(a.st[S.st] > 0)) return false;
      return true;
    });
    out.sort(function (x, y) {
      if (S.sort === 'count') return (y.c - x.c) || x.n.localeCompare(y.n, 'vi');
      if (S.sort === 'new') return String(y.u).localeCompare(String(x.u)) || x.n.localeCompare(y.n, 'vi');
      return x.n.localeCompare(y.n, 'vi');
    });
    return out;
  }

  /* ---------------- dải "nhiều truyện nhất" ---------------- */
  function paintShelf() {
    var rows = D.feat.map(function (s) {
      return A.filter(function (a) { return a.s === s; })[0];
    }).filter(Boolean);
    $('#mkShelfRow').innerHTML = rows.map(function (a, i) {
      return '<a class="xsh-i" href="' + personURL(a.s) + '" data-s="' + esc(a.s) + '" aria-haspopup="dialog">' +
        book(a) +
        '<span class="xb">' +
        '<span class="xrk">' + ('0' + (i + 1)).slice(-2) + '</span>' +
        '<b class="xn" title="' + esc(a.n) + '">' + esc(a.n) + '</b>' +
        '<span class="xd">' + a.c + ' truyện · ' + shortDate(a.u) + '</span>' +
        '<span class="xl">Mới nhất: ' + esc(a.lt) + '</span>' +
        '</span></a>';
    }).join('');
  }

  /* ---------------- danh sách ---------------- */
  function cardHTML(a) {
    return '<a class="xcard" href="' + personURL(a.s) + '" data-s="' + esc(a.s) + '" aria-haspopup="dialog">' +
      book(a) +
      '<span class="xb"><b class="xn" title="' + esc(a.n) + '">' + esc(a.n) + '</b>' +
      '<span class="xd">' + a.c + ' truyện · ' + shortDate(a.u) + '</span>' +
      '<span class="xs">' + (stBits(a) || '<span>' + a.c + ' truyện</span>') + '</span></span></a>';
  }

  function paint() {
    var rows = list();
    var out = $('#mkOut');

    var nStories = rows.reduce(function (n, a) { return n + a.c; }, 0);
    $('.mkhead .xsub').innerHTML = '<b>' + rows.length + '</b> tác giả<span class="xsep">·</span>' +
      '<b>' + nStories + '</b> truyện<span class="xsep xwhen">·</span>' +
      '<span class="xwhen">cập nhật 01-11</span>';

    /* dải nổi bật: chỉ khi chưa lọc và đang xếp A–Z */
    $('#mkShelf').hidden = filtering() || S.sort !== 'az';

    if (!rows.length) {
      out.innerHTML = '<div class="xempty"><b>Không có tác giả nào khớp</b>' +
        '<p>Thử từ khoá khác, hoặc bỏ bộ lọc trạng thái.</p>' +
        '<button type="button" class="btn pri" id="mkEmptyX">Xoá bộ lọc</button></div>';
      $('#mkAZbar').hidden = true;
      $('#mkEnd').hidden = true;
    } else if (S.sort !== 'az') {
      out.innerHTML = '<div class="xgrp"><div class="xg">' + rows.map(cardHTML).join('') + '</div></div>';
      $('#mkAZbar').hidden = true;
      $('#mkEnd').hidden = filtering();
    } else {
      var html = '', cur = null, buf = [];
      function flush() {
        if (!buf.length) return;
        html += buf.join('') + '</div></section>';
        buf = [];
      }
      rows.forEach(function (a) {
        var L = letterOf(a.n);
        if (L !== cur) {
          flush();
          cur = L;
          buf = ['<section class="xgrp" id="mkG-' + L + '">' +
            '<h2 class="xgh"><span class="xl">' + L + '</span>' +
            '<span class="xc">—</span><span class="xr"></span></h2><div class="xg">'];
        }
        buf.push(cardHTML(a));
      });
      flush();
      out.innerHTML = html;
      $$('.xgrp', out).forEach(function (g) {
        var n = g.querySelectorAll('.xcard').length;
        g.querySelector('.xgh .xc').textContent = n + ' tác giả';
      });
      $('#mkAZbar').hidden = false;
      $('#mkEnd').hidden = filtering();
    }

    paintAZ(rows);

    /* dòng "đang lọc" */
    var act = $('#mkAct');
    if (filtering()) {
      var bits = [];
      if (S.q) bits.push('“' + esc(S.q) + '”');
      if (S.st) bits.push(ST.filter(function (x) { return x.k === S.st; })[0].label.toLowerCase());
      act.hidden = false;
      act.innerHTML = 'Đang lọc ' + bits.join(' · ') + ' — <b>' + rows.length + '</b> tác giả' +
        '<button type="button" class="xall" id="mkActX">Xoá bộ lọc</button>';
    } else {
      act.hidden = true;
      act.innerHTML = '';
    }

    spyTick();
  }

  /* ---------------- thanh A–Z ---------------- */
  function paintAZ(rows) {
    var cnt = {};
    rows.forEach(function (a) { var k = letterOf(a.n); cnt[k] = (cnt[k] || 0) + 1; });
    $('#mkAZ').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('').map(function (k) {
      var n = cnt[k] || 0;
      return '<button type="button" data-l="' + k + '"' + (n ? '' : ' disabled') +
        ' aria-label="Nhóm ' + k + (n ? ' — ' + n + ' tác giả' : ' — không có') + '">' + k + '</button>';
    }).join('');
  }

  /* ---------------- tìm / sắp xếp / lọc ---------------- */
  var t = 0;
  $('#mkQ').addEventListener('input', function (e) {
    var v = e.target.value;
    $('#mkClr').hidden = !v;
    clearTimeout(t);
    t = setTimeout(function () { S.q = v.trim(); writeURL(); paint(); }, 120);
  });
  $('#mkClr').addEventListener('click', function () {
    var i = $('#mkQ');
    i.value = ''; S.q = ''; $('#mkClr').hidden = true; i.focus(); writeURL(); paint();
  });
  $$('#mkSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      S.sort = b.getAttribute('data-sort');
      $$('#mkSeg button').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      writeURL(); paint();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });
  function paintChips() {
    $('#mkSt').innerHTML = ST.map(function (x) {
      return '<button type="button" class="xchip" data-st="' + x.k + '" aria-pressed="' +
        String(S.st === x.k) + '"><i class="xdot ' + x.k + '"></i>' + x.label + '</button>';
    }).join('') + '<button type="button" class="xchip" data-st="" aria-pressed="' +
      String(!S.st) + '">Tất cả</button>';
    $$('#mkSt .xchip').forEach(function (b) {
      b.addEventListener('click', function () {
        S.st = b.getAttribute('data-st');
        paintChips(); writeURL(); paint();
        if (window.innerWidth < 640) {
          $('#mkStWrap').classList.remove('xopen');
          $('#mkFilter').setAttribute('aria-expanded', 'false');
        }
      });
    });
    var n = $('#mkFilterN');
    n.hidden = !S.st; n.textContent = S.st ? '1' : '0';
  }
  $('#mkFilter').addEventListener('click', function () {
    var w = $('#mkStWrap'), on = w.classList.toggle('xopen');
    this.setAttribute('aria-expanded', String(on));
  });
  document.addEventListener('click', function (e) {
    var x = e.target.closest && e.target.closest('#mkActX, #mkEmptyX');
    if (!x) return;
    S.q = ''; S.st = ''; $('#mkQ').value = ''; $('#mkClr').hidden = true;
    paintChips(); writeURL(); paint();
  });

  /* ---------------- nhảy A–Z + theo dõi khi cuộn ---------------- */
  var jumping = 0, activeL = '';
  function barH() { var b = $('#mkAZbar'); return b.hidden ? 0 : b.offsetHeight; }
  function setActive(L) {
    if (L === activeL) return;
    activeL = L;
    $$('#mkAZ button').forEach(function (b) {
      if (b.getAttribute('data-l') === L) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }
  function spyTick() {
    if ($('#mkAZbar').hidden) return;
    var top = barH() + 30, hit = '';
    var gs = $$('#mkOut .xgrp');
    gs.forEach(function (g) {
      if (g.getBoundingClientRect().top - top <= 0) hit = g.id.replace('mkG-', '');
    });
    if (!hit && gs.length) hit = gs[0].id.replace('mkG-', '');   /* đầu trang: nhóm đầu tiên */
    if (!hit) return;
    setActive(hit);
    var b = $('#mkAZ button[aria-current="true"]');
    if (b && b.parentNode.scrollWidth > b.parentNode.clientWidth) {
      var box = b.parentNode;
      var l = b.offsetLeft - box.clientWidth / 2 + b.offsetWidth / 2;
      if (Math.abs(box.scrollLeft - l) > 40) box.scrollLeft = Math.max(0, l);
    }
  }
  var raf = 0;
  window.addEventListener('scroll', function () {
    if (jumping || raf) return;
    raf = requestAnimationFrame(function () { raf = 0; spyTick(); });
  }, { passive: true });
  $('#mkAZ').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-l]');
    if (!b || b.disabled) return;
    var L = b.getAttribute('data-l');
    var g = document.getElementById('mkG-' + L);
    if (!g) return;
    setActive(L);
    jumping = Date.now();
    g.scrollIntoView({ behavior: 'instant', block: 'start' });
    setTimeout(function () { jumping = 0; spyTick(); }, 260);
  });

  /* ---------------- bảng chi tiết ---------------- */
  var modal = $('#mkModal'), lastFocus = null;
  function openCard(a) {
    lastFocus = document.activeElement;
    $('#mkMFig').innerHTML = book(a);
    $('#mkMTitle').textContent = a.n;
    $('#mkMMeta').innerHTML = a.c + ' truyện · cập nhật ' + shortDate(a.u);
    $('#mkMMeta').setAttribute('title', longDate(a.u));
    $('#mkMSt').innerHTML = stBits(a);
    $('#mkMGo').href = personURL(a.s);
    $('#mkMLab').textContent = 'Truyện · ' + a.c;
    $('#mkMList').innerHTML = a.rows.map(function (r) {
      return '<li><a href="/site/truyen/' + esc(r.s) + '/">' +
        '<span class="xth">' + (r.cov ? '<img src="' + esc(r.cov) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
        '<span class="xtx"><b>' + esc(r.t) + '</b>' +
        '<span class="xm"><span><i class="xdot ' + r.st + '"></i>' + STNAME[r.st] + '</span>' +
        (r.c > 0 ? '<span>' + r.c + ' chương</span>' : '') +
        '<span>' + shortDate(r.u) + '</span></span></span></a></li>';
    }).join('');
    var body = $('.xmbody');
    if (body) body.scrollTop = 0;
    modal.hidden = false;
    document.body.classList.add('mk-lock');
    requestAnimationFrame(function () { modal.classList.add('xopen'); });
    setTimeout(function () { var box = $('.xmbox'); if (box) box.focus(); }, 40);
  }
  function closeCard() {
    if (modal.hidden) return;
    modal.classList.remove('xopen');
    document.body.classList.remove('mk-lock');
    setTimeout(function () {
      if (!modal.classList.contains('xopen')) modal.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 200);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.xcard, a.xsh-i');
    if (a && a.getAttribute('data-s')) {
      e.preventDefault();
      var hit = A.filter(function (x) { return x.s === a.getAttribute('data-s'); })[0];
      if (hit) openCard(hit);
      return;
    }
    if (e.target.closest && e.target.closest('[data-close]')) closeCard();
  });
  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeCard(); return; }
    if (e.key !== 'Tab') return;
    var f = $$('a[href], button, input, [tabindex]:not([tabindex="-1"])', modal)
      .filter(function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------------- khởi động ---------------- */
  var note = $('#mkNoteX');
  if (note) note.addEventListener('click', function () { $('#mkNote').hidden = true; });
  readURL();
  $('#mkQ').value = S.q;
  $('#mkClr').hidden = !S.q;
  $$('#mkSeg button').forEach(function (x) {
    x.setAttribute('aria-pressed', String(x.getAttribute('data-sort') === S.sort));
  });
  paintShelf();
  paintChips();
  paint();
})();
