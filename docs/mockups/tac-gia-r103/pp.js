/* ============================================================================
   r103 · trang Tác giả — một bố cục, đủ công cụ:
     · tìm theo tên (không dấu vẫn khớp), ⌘K / "/" để nhảy vào ô tìm
     · lọc trạng thái (chạy được nhiều lựa chọn) kèm SỐ ĐẾM thật
     · sắp xếp: A–Z · nhiều truyện · mới cập nhật
     · trạng thái nằm trong URL: ?q= &st= &sort=
   Dữ liệu: data.js (window.MKA) chép từ data/registry.json của web.
   ========================================================================== */
(function () {
  'use strict';

  var DATA = (window.MKA && window.MKA.a) || [];
  var LIVE = 'https://8081-inpi9mz09qz9bfup3iuwi.e2b.app/tac-gia/?q=';

  var ST = [
    { k: 'done', label: 'Hoàn thành' },
    { k: 'run', label: 'Đang ra' },
    { k: 'soon', label: 'Sắp ra' }
  ];
  var SORTS = [
    { k: 'az', label: 'Tên A–Z' },
    { k: 'count', label: 'Nhiều truyện' },
    { k: 'new', label: 'Mới cập nhật' }
  ];

  var S = { q: '', st: '', sort: 'az' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function $(s) { return document.querySelector(s); }
  function plain(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }
  function letterOf(name) {
    var c = plain(name).charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : '#';
  }
  function shortDate(u) {
    var p = String(u || '').split('-');
    return p.length === 3 ? p[2] + '-' + p[1] : '';
  }
  function href(a) { return LIVE + encodeURIComponent(a.s); }
  function label(k) {
    var h = ST.filter(function (x) { return x.k === k; })[0];
    return h ? h.label : '';
  }

  /* ---- URL <-> trạng thái ---------------------------------------------- */
  function readURL() {
    var p = new URLSearchParams(location.search);
    S.q = (p.get('q') || '').trim();
    S.st = ST.some(function (x) { return x.k === p.get('st'); }) ? p.get('st') : '';
    S.sort = SORTS.some(function (x) { return x.k === p.get('sort'); }) ? p.get('sort') : 'az';
  }
  function writeURL() {
    var p = new URLSearchParams();
    if (S.q) p.set('q', S.q);
    if (S.st) p.set('st', S.st);
    if (S.sort !== 'az') p.set('sort', S.sort);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  /* ---- lọc / sắp -------------------------------------------------------- */
  function matchQ(a) {
    var q = plain(S.q).trim();
    return !q || plain(a.n).indexOf(q) >= 0;
  }
  function matchSt(a, st) { return !st || a.st[st] > 0; }
  function filtered() {
    var list = DATA.filter(function (a) { return matchQ(a) && matchSt(a, S.st); });
    list.sort(function (x, y) {
      if (S.sort === 'count') return (y.c - x.c) || x.n.localeCompare(y.n, 'vi');
      if (S.sort === 'new') return String(y.u).localeCompare(String(x.u)) || x.n.localeCompare(y.n, 'vi');
      return x.n.localeCompare(y.n, 'vi');
    });
    return list;
  }

  /* ---- thẻ tác giả ------------------------------------------------------ */
  function cover(a) {
    var k = a.cov && a.cov[0], rem = a.rem && a.rem[0];
    if (!k) return '<span class="cv"></span>';
    return '<span class="cv"><img src="/assets/covers/' + k + '.webp" alt="" loading="lazy"' +
      ' decoding="async"' + (rem ? ' onerror="this.onerror=null;this.src=\'' + esc(rem) + '\'"' : '') + '></span>';
  }
  function stBits(a) {
    var out = ST.filter(function (x) { return a.st[x.k] > 0; }).map(function (x) {
      var multi = ST.filter(function (y) { return a.st[y.k] > 0; }).length > 1;
      return '<span class="s"><i class="' + x.k + '"></i>' + (multi ? a.st[x.k] + ' ' : '') +
        x.label.toLowerCase() + '</span>';
    });
    return out.join('');
  }
  function rowHTML(a) {
    return '<a class="ta-row" href="' + href(a) + '" target="_blank" rel="noopener">' + cover(a) +
      '<span class="tx"><span class="nm">' + esc(a.n) + '</span>' +
      '<span class="mt"><span class="c">' + a.c + ' truyện</span>' + stBits(a) + '</span></span>' +
      '<span class="dt">' + shortDate(a.u) + '</span></a>';
  }

  /* ---- vẽ danh sách ----------------------------------------------------- */
  function paint(keep) {
    var out = $('#taOut');
    var list = filtered();
    var y = window.scrollY;

    if (!list.length) {
      out.innerHTML = '<div class="ta-empty"><b>Không có tác giả nào khớp</b>' +
        '<p>' + (S.q ? 'Không tìm thấy tên chứa “' + esc(S.q) + '”' : 'Không có tác giả ở trạng thái này') +
        (S.st ? ' trong nhóm “' + label(S.st) + '”' : '') + '.</p>' +
        '<button type="button" id="taReset">Xoá bộ lọc</button></div>';
    } else if (S.sort === 'az') {
      var groups = {}, order = [];
      list.forEach(function (a) {
        var L = letterOf(a.n);
        if (!groups[L]) { groups[L] = []; order.push(L); }
        groups[L].push(a);
      });
      order.sort();
      out.innerHTML = order.map(function (L) {
        return '<section class="ta-grp"><span class="ta-let" aria-hidden="true">' + L + '</span>' +
          '<div class="ta-grid">' + groups[L].map(rowHTML).join('') + '</div></section>';
      }).join('');
    } else {
      out.innerHTML = '<section class="ta-grp ta-grp-flat"><span class="ta-let" aria-hidden="true"></span>' +
        '<div class="ta-grid">' + list.map(rowHTML).join('') + '</div></section>';
    }

    paintChips();
    paintNow(list.length);
    if (keep) window.scrollTo(0, y);
  }

  function paintChips() {
    var base = DATA.filter(matchQ);
    $('#taF').innerHTML =
      '<button type="button" data-st="" aria-pressed="' + (!S.st) + '">Tất cả' +
      '<span class="n">' + base.length + '</span></button>' +
      ST.map(function (x) {
        var n = base.filter(function (a) { return a.st[x.k] > 0; }).length;
        return '<button type="button" data-st="' + x.k + '" aria-pressed="' + (S.st === x.k) +
          '"><i class="d ' + x.k + '"></i>' + x.label +
          '<span class="n">' + n + '</span></button>';
      }).join('');
  }

  function paintNow(n) {
    var now = $('#taNow');
    var parts = [];
    if (S.q) parts.push('tên chứa <b>“' + esc(S.q) + '”</b>');
    if (S.st) parts.push('<b>' + label(S.st) + '</b>');
    if (!parts.length) { now.className = 'ta-now'; now.innerHTML = ''; return; }
    now.className = 'ta-now on';
    now.innerHTML = '<span>Đang lọc: ' + parts.join(' · ') + '</span>' +
      (n ? '<button type="button" class="x" id="taReset2">Xoá bộ lọc</button>' : '');
  }

  function syncControls() {
    var inp = $('#taQ');
    inp.value = S.q;
    $('#taSearch').classList.toggle('has-q', !!S.q);
    [].forEach.call($('#taSortMenu').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-sort') === S.sort));
    });
    $('#taSortLabel').textContent = (SORTS.filter(function (x) { return x.k === S.sort; })[0] || SORTS[0]).label;
    var total = DATA.length, works = DATA.reduce(function (s, a) { return s + a.c; }, 0);
    $('#taSub').innerHTML = S.q || S.st
      ? 'Tìm thấy <b>' + filtered().length + '</b> / ' + total + ' tác giả'
      : '<b>' + total + '</b> tác giả · <b>' + works + '</b> truyện';
  }

  function reset() {
    S.q = ''; S.st = '';
    writeURL(); syncControls(); paint();
    $('#taQ').focus({ preventScroll: true });
  }

  /* ---- sự kiện ---------------------------------------------------------- */
  var t = 0;
  $('#taQ').addEventListener('input', function () {
    S.q = this.value;
    $('#taSearch').classList.toggle('has-q', !!S.q);
    clearTimeout(t);
    t = setTimeout(function () { writeURL(); syncControls(); paint(true); }, 90);
  });
  $('#taQ').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); reset(); }
  });
  $('#taClr').addEventListener('click', function () {
    S.q = ''; writeURL(); syncControls(); paint(true); $('#taQ').focus({ preventScroll: true });
  });

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      $('#taQ').focus();
      $('#taQ').select();
    }
    if (e.key === 'Escape') closeSort();
  });

  $('#taF').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-st]');
    if (!b || b.disabled) return;
    var v = b.getAttribute('data-st');
    S.st = (S.st === v) ? '' : v;
    writeURL(); syncControls(); paint(true);
  });

  function closeSort() { $('#taSortBox').classList.remove('open'); $('#taSortBtn').setAttribute('aria-expanded', 'false'); }
  $('#taSortBtn').addEventListener('click', function () {
    var box = $('#taSortBox'), on = box.classList.toggle('open');
    this.setAttribute('aria-expanded', String(on));
  });
  $('#taSortMenu').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sort]');
    if (!b) return;
    S.sort = b.getAttribute('data-sort');
    closeSort(); writeURL(); syncControls(); paint(true);
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#taSortBox')) closeSort();
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('#taReset, #taReset2')) reset();
  });

  /* ---- khởi động -------------------------------------------------------- */
  readURL();
  syncControls();
  paint();
  window.addEventListener('popstate', function () { readURL(); syncControls(); paint(); });
})();
