/* ============================================================================
   BẢN DỰNG r96 — trang Tác giả · phần chạy thử
   Dữ liệu thật (40 tác giả) lấy từ data.js, sinh từ /data/registry.json.
   Mọi thứ dưới đây chỉ để bấm thử: tìm, sắp xếp, lọc trạng thái, nhảy A–Z.
   ========================================================================== */
(function () {
  'use strict';
  var A = window.MK.authors;
  var FEAT = window.MK.feat;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var base = location.pathname.replace(/[^/]*$/, '');

  var ST = [
    { k: 'run', label: 'Đang cập nhật' },
    { k: 'soon', label: 'Sắp ra mắt' },
    { k: 'done', label: 'Hoàn thành' }
  ];
  var SORTS = { az: 'A–Z', count: 'Nhiều truyện nhất', 'new': 'Mới cập nhật' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase(); }
  function letterOf(name) {
    var c = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : '#';
  }
  /* ảnh bìa là đường dẫn gốc của site (/assets/covers/…) — mockup trỏ tới
     thư mục assets của kho qua liên kết tượng trưng docs/mockups/assets */
  function cover(u) { return String(u || ''); }
  function personURL(slug) { return 'site/tac-gia/?q=' + encodeURIComponent(slug); }

  /* ---------------- trạng thái ---------------- */
  var S = { q: '', sort: 'az', st: {} };

  function readURL() {
    var p = new URLSearchParams(location.search);
    S.q = (p.get('s') || '').trim();
    var so = p.get('sort');
    S.sort = SORTS[so] ? so : 'az';
    S.st = {};
    (p.get('st') || '').split(',').forEach(function (k) { if (ST.some(function (x) { return x.k === k; })) S.st[k] = 1; });
  }
  function writeURL() {
    var p = new URLSearchParams();
    if (S.q) p.set('s', S.q);
    if (S.sort !== 'az') p.set('sort', S.sort);
    var on = ST.filter(function (x) { return S.st[x.k]; }).map(function (x) { return x.k; });
    if (on.length) p.set('st', on.join(','));
    var q = p.toString();
    history.replaceState(null, '', q ? '?' + q : location.pathname);
  }
  function stCount() { return ST.filter(function (x) { return S.st[x.k]; }).length; }
  function filtering() { return !!S.q || stCount() > 0; }

  function match(a) {
    if (S.q && norm(a.n).indexOf(norm(S.q)) < 0) return false;
    var on = ST.filter(function (x) { return S.st[x.k]; });
    if (!on.length) return true;
    return on.some(function (x) { return a.st[x.k] > 0; });
  }
  function cmp(a, b) {
    if (S.sort === 'count') return (b.c - a.c) || a.n.localeCompare(b.n, 'vi');
    if (S.sort === 'new') return String(b.u).localeCompare(String(a.u)) || a.n.localeCompare(b.n, 'vi');
    return a.n.localeCompare(b.n, 'vi');
  }

  /* ---------------- mảnh HTML ---------------- */
  function stackHTML(a, big) {
    if (!a.cov || !a.cov.length) {
      return '<span class="ava" aria-hidden="true">' + esc(a.ini) + '</span>';
    }
    var inner = a.cov.slice(0, 3).map(function (c) {
      return '<i><img src="' + esc(cover(c)) + '" alt="" loading="lazy" decoding="async"></i>';
    }).join('');
    var more = a.c > 3 ? '<span class="pmore" aria-hidden="true">+' + (a.c - 3) + '</span>' : '';
    return '<span class="stack" aria-hidden="true">' + inner + more + '</span>';
  }
  function statusHTML(a) {
    var bits = ST.filter(function (x) { return a.st[x.k] > 0; }).map(function (x) {
      return '<span><i class="dot ' + x.k + '"></i>' + a.st[x.k] + ' ' + x.label.toLowerCase() + '</span>';
    });
    if (!bits.length) return '';
    return '<span class="stline">' + bits.join('') + '</span>';
  }
  /* trên desktop, ngày nằm ở dòng "Mới nhất" của thẻ nổi bật; trên điện thoại
     dòng đó ẩn đi nên ngày quay lại dòng số — một chỗ, không lặp hai lần */
  function metaHTML(a) {
    return '<span class="meta">' + a.c + ' truyện' +
      (a.lu ? '<span class="d"> · cập nhật ' + esc(a.lu) + '</span>' : '') + '</span>';
  }
  function cardHTML(a) {
    return '<a class="ac" href="' + personURL(a.s) + '">' +
      stackHTML(a) +
      '<span class="body"><b>' + esc(a.n) + '</b>' + metaHTML(a) + statusHTML(a) + '</span></a>';
  }
  function featHTML(a, i) {
    var latest = a.lt ? '<span class="last">Mới nhất: ' + esc(a.lt) +
      (a.lu ? '<span class="d"> · ' + esc(a.lu) + '</span>' : '') + '</span>' : '';
    return '<a class="fc" href="' + personURL(a.s) + '" title="' + esc(a.n) + '">' +
      stackHTML(a, true) +
      '<span class="body"><b>' + esc(a.n) + '</b>' + metaHTML(a) + latest + statusHTML(a) + '</span></a>';
  }

  var AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat('#');
  function azHTML(letters) {
    return AZ.map(function (L) {
      var on = letters.indexOf(L) >= 0;
      return '<button type="button" data-l="' + L + '"' + (on ? '' : ' disabled') +
        ' aria-label="Tới nhóm ' + L + '">' + L + '</button>';
    }).join('');
  }

  /* ---------------- vẽ ---------------- */
  var EL = {
    q: $('#mkQ'), clr: $('#mkClr'),
    tools: $('#mkTools'), seg: $('#mkSeg'), stchips: $('#mkStChips'),
    stwrap: $('#mkStWrap'), fbtn: $('#mkFilter'), act: $('#mkAct'),
    feat: $('#mkFeat'), fgrid: $('#mkFeatGrid'),
    az: $('#mkAZBar'), azin: $('#mkAZ'), out: $('#mkOut')
  };
  var groups = [];

  function render() {
    var rows = A.filter(match).sort(cmp);
    var f = filtering();
    writeURL();

    /* đếm */
    $('#mkSub').innerHTML = f
      ? '<b>' + rows.length + '</b> / ' + A.length + ' tác giả'
      : '<b>' + A.length + '</b> tác giả <span class="sep">·</span> <b>' + A.reduce(function (n, a) { return n + a.c; }, 0) + '</b> truyện';
    EL.clr.hidden = !S.q;

    /* chip trạng thái */
    EL.stchips.innerHTML = ST.map(function (x) {
      return '<button type="button" class="stchip" data-st="' + x.k + '" aria-pressed="' + (!!S.st[x.k]) + '">' +
        '<i class="dot ' + x.k + '"></i>' + x.label + '</button>';
    }).join('');
    EL.seg.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.sort === S.sort));
    });
    var nst = stCount();
    EL.fbtn.querySelector('.n').textContent = nst;
    EL.fbtn.querySelector('.n').hidden = !nst;
    EL.fbtn.setAttribute('aria-expanded', String(EL.stwrap.classList.contains('on')));

    /* dòng đang lọc */
    var chips = ST.filter(function (x) { return S.st[x.k]; }).map(function (x) {
      return '<span class="a">' + x.label + '<button type="button" data-un="' + x.k + '" aria-label="Bỏ lọc ' + x.label + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M18 6 6 18M6 6l12 12"></path></svg></button></span>';
    });
    EL.act.innerHTML = chips.join('') + (chips.length > 1 ? '<button type="button" class="all" data-clear>Xoá tất cả</button>' : '');
    EL.act.hidden = !chips.length;

    /* nổi bật */
    var showFeat = !f;
    EL.feat.hidden = !showFeat;
    if (showFeat) {
      EL.fgrid.innerHTML = A.slice().sort(function (a, b) { return b.c - a.c || a.n.localeCompare(b.n, 'vi'); })
        .slice(0, 3).map(featHTML).join('');
    }

    /* danh sách */
    groups = [];
    var grouped = S.sort === 'az' && !f;
    var letters = [];
    if (grouped) {
      var m = {};
      rows.forEach(function (a) { (m[letterOf(a.n)] = m[letterOf(a.n)] || []).push(a); });
      letters = Object.keys(m).sort(function (x, y) { return x === '#' ? 1 : y === '#' ? -1 : x < y ? -1 : 1; });
      EL.out.innerHTML = letters.map(function (L) {
        return '<section class="grp" data-l="' + L + '">' +
          '<h2 class="gh"><span class="l">' + L + '</span><span class="c">' + m[L].length + ' tác giả</span><span class="r"></span></h2>' +
          '<div class="grid">' + m[L].map(cardHTML).join('') + '</div></section>';
      }).join('');
      groups = [].slice.call(EL.out.querySelectorAll('.grp'));
    } else {
      EL.out.innerHTML = '<div class="grid" style="padding-top:16px">' + rows.map(cardHTML).join('') + '</div>';
    }
    if (!rows.length) {
      EL.out.innerHTML = '<div class="empty"><b>Không tìm thấy tác giả phù hợp</b>' +
        '<p>Thử bỏ từ khoá hoặc bộ lọc trạng thái.</p>' +
        '<button type="button" data-clear>Xoá bộ lọc</button></div>';
    }

    /* A–Z */
    EL.az.hidden = !grouped;
    if (grouped) {
      EL.azin.innerHTML = azHTML(letters);
      spyNow();
    }
  }

  /* ---------------- A–Z: nhảy + biết đang ở đâu ---------------- */
  var curL = '';
  function spyNow() {
    if (!groups.length) return;
    var line = 96, best = groups[0];
    groups.forEach(function (g) { if (g.getBoundingClientRect().top <= line) best = g; });
    var L = best.dataset.l;
    if (L === curL) return;
    curL = L;
    EL.azin.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-current', String(b.dataset.l === L));
    });
  }
  function spy() {
    if (EL.az.hidden || !groups.length) return;
    var line = 96, best = groups[0];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].getBoundingClientRect().top - line <= 0) best = groups[i]; else break;
    }
    var L = best.dataset.l;
    if (L === curL) return;
    curL = L;
    EL.azin.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-current', String(b.dataset.l === L));
    });
  }
  var tick = false;
  addEventListener('scroll', function () {
    if (tick) return;
    tick = true;
    requestAnimationFrame(function () { tick = false; spy(); });
  }, { passive: true });

  function jump(L) {
    var g = EL.out.querySelector('.grp[data-l="' + L + '"]');
    if (!g) return;
    var y = g.getBoundingClientRect().top + window.pageYOffset - (EL.az.offsetHeight + 12);
    window.scrollTo({ top: y, behavior: 'smooth' });
    g.querySelector('a')?.focus({ preventScroll: true });
  }

  /* ---------------- sự kiện ---------------- */
  var qt = 0;
  EL.q.addEventListener('input', function () {
    clearTimeout(qt);
    qt = setTimeout(function () { S.q = EL.q.value.trim(); render(); }, 140);
  });
  EL.clr.addEventListener('click', function () { EL.q.value = ''; S.q = ''; render(); EL.q.focus(); });

  EL.seg.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sort]');
    if (!b) return;
    S.sort = b.dataset.sort; render();
    window.scrollTo({ top: Math.min(window.pageYOffset, EL.feat.getBoundingClientRect().top + window.pageYOffset - 20), behavior: 'smooth' });
  });
  EL.stchips.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-st]');
    if (!b) return;
    var k = b.dataset.st;
    if (S.st[k]) delete S.st[k]; else S.st[k] = 1;
    render();
  });
  EL.fbtn.addEventListener('click', function () {
    EL.stwrap.classList.toggle('on');
    EL.fbtn.setAttribute('aria-expanded', String(EL.stwrap.classList.contains('on')));
  });
  EL.act.addEventListener('click', function (e) {
    var u = e.target.closest('button[data-un]');
    if (u) { delete S.st[u.dataset.un]; render(); return; }
    if (e.target.closest('[data-unq]')) { EL.q.value = ''; S.q = ''; render(); return; }
    if (e.target.closest('[data-clear]')) { EL.q.value = ''; S.q = ''; S.st = {}; render(); }
  });
  EL.azin.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-l]');
    if (b && !b.disabled) jump(b.dataset.l);
  });
  EL.out.addEventListener('click', function (e) {
    if (e.target.closest('[data-clear]')) { EL.q.value = ''; S.q = ''; S.st = {}; render(); }
  });

  /* ghi chú bản dựng */
  var note = $('#mkNote');
  if (innerWidth < 900) note.hidden = true;   /* trên máy nhỏ, ghi chú che mất thiết kế */
  $('#mkNoteX').addEventListener('click', function () {
    note.hidden = true;
    document.documentElement.style.setProperty('--note-off', '1');
  });

  readURL();
  EL.q.value = S.q;
  render();
  if (S.q || stCount()) EL.stwrap.classList.add('on');
})();
