/* ============================================================================
   r102 · trang Tác giả — ba cấu trúc bố cục chạy được trên cùng một trang.
   Dữ liệu: data.js (window.MKA) chép từ data/registry.json của web.
     X · Mục lục       — danh sách + bảng xem trước dính bên phải
     Y · Sổ danh mục   — nhóm theo chữ cái, mỗi mục kèm tên truyện
     Z · Bảng xếp hạng — chia bậc theo số tác phẩm, có số thứ tự
   ========================================================================== */
(function () {
  'use strict';

  var DATA = (window.MKA && window.MKA.a) || [];
  var LIVE = 'https://8081-inpi9mz09qz9bfup3iuwi.e2b.app/tac-gia/?q=';

  var V = 'X';            /* cấu trúc đang xem */
  var Q = '';             /* từ khoá lọc */
  var SORT = 'count';     /* Z: count | az */
  var CUR = null;         /* X: tác giả đang xem trước */

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

  function cover(a, size) {
    var k = a.cov && a.cov[0];
    var rem = a.rem && a.rem[0];
    var im = k ? '<img src="/assets/covers/' + k + '.webp" alt="" loading="lazy" decoding="async"' +
      (rem ? ' onerror="this.onerror=null;this.src=\'' + esc(rem) + '\'"' : '') + '>' : '';
    return '<span class="ix-cv ' + (size || '') + '">' + im + '</span>';
  }
  function statuses(a) {
    var out = [];
    if (a.st.done) out.push('<span class="ix-st"><i class="done"></i>' + a.st.done + ' hoàn thành</span>');
    if (a.st.run) out.push('<span class="ix-st"><i class="run"></i>' + a.st.run + ' đang cập nhật</span>');
    if (a.st.soon) out.push('<span class="ix-st"><i class="soon"></i>' + a.st.soon + ' sắp ra mắt</span>');
    return out.join('');
  }

  /* ---- lọc + sắp xếp ---------------------------------------------------- */
  function filtered() {
    var q = plain(Q).trim();
    return DATA.filter(function (a) { return !q || plain(a.n).indexOf(q) >= 0; });
  }
  function byName(x, y) { return x.n.localeCompare(y.n, 'vi'); }

  /* ======================================================================== */
  /* X · MỤC LỤC                                                            */
  /* ======================================================================== */
  function renderX(list) {
    if (!list.length) return '<p class="ix-empty">Không có tác giả nào khớp “' + esc(Q) + '”.</p>';
    var lastL = '';
    var rows = list.map(function (a) {
      var L = letterOf(a.n), showL = L !== lastL;
      lastL = L;
      return '<a class="ix-row" href="' + href(a) + '" target="_blank" rel="noopener"' +
        ' data-s="' + esc(a.s) + '">' +
        '<span class="lt">' + (showL ? L : '') + '</span>' +
        cover(a) +
        '<span class="tx"><span class="nm">' + esc(a.n) + '</span>' +
        '<span class="mt"><span class="c">' + a.c + ' truyện</span>' + statuses(a) + '</span></span>' +
        '<span class="c">' + shortDate(a.u) + '</span></a>';
    }).join('');
    var first = CUR && list.some(function (a) { return a.s === CUR.s; }) ? CUR : list[0];
    return '<div class="ix-wrap"><div class="ix-list">' + rows + '</div>' +
      '<aside class="ix-pan" id="ixPan" aria-live="polite"></aside></div>';
  }

  function paintPan(a) {
    var pan = $('#ixPan');
    if (!pan || !a) return;
    CUR = a;
    pan.innerHTML = '<div class="hd">' + cover(a, 'lg') +
      '<div class="tt"><p class="k">Tác giả</p><h2>' + esc(a.n) + '</h2>' +
      '<span class="mt" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">' +
      '<span class="ix-num">' + a.c + ' truyện</span><span class="ix-st">cập nhật ' + shortDate(a.u) + '</span></span>' +
      '<div class="st">' + statuses(a) + '</div>' +
      '<a class="go" href="' + href(a) + '" target="_blank" rel="noopener">Xem trang tác giả →</a></div></div>' +
      '<div class="bk-hd"><b>Truyện</b><span>' + a.c + '</span></div><ul>' +
      a.rows.map(function (r) {
        return '<li><a href="/site/truyen/' + esc(r.s) + '/" target="_blank" rel="noopener">' +
          '<span class="tx"><b>' + esc(r.t) + '</b>' +
          '<span class="mt"><span class="ix-st"><i class="' + r.st + '"></i>' +
          (r.st === 'done' ? 'hoàn thành' : r.st === 'run' ? 'đang cập nhật' : 'sắp ra mắt') + '</span>' +
          '<span>' + (r.c ? r.c + ' chương' : 'chưa có chương') + '</span>' +
          '<span>' + shortDate(r.u) + '</span></span></span></a></li>';
      }).join('') + '</ul>';
  }

  /* ======================================================================== */
  /* Y · SỔ DANH MỤC                                                        */
  /* ======================================================================== */
  function renderY(list) {
    if (!list.length) return '<p class="ix-empty">Không có tác giả nào khớp “' + esc(Q) + '”.</p>';
    var groups = {}, order = [];
    list.forEach(function (a) {
      var L = letterOf(a.n);
      if (!groups[L]) { groups[L] = []; order.push(L); }
      groups[L].push(a);
    });
    order.sort();
    return order.map(function (L) {
      return '<section class="ix-grp"><h2 class="ix-gh"><span class="l">' + L + '</span>' +
        '<span class="c">' + groups[L].length + ' tác giả</span><i class="r"></i></h2><div class="ix-ents">' +
        groups[L].map(function (a) {
          var titles = a.rows.slice(0, 3).map(function (r) { return esc(r.t); }).join(' · ');
          return '<a class="ix-ent" href="' + href(a) + '" target="_blank" rel="noopener">' + cover(a) +
            '<span><span class="nm">' + esc(a.n) + '</span>' +
            '<span class="mt"><span class="ix-num">' + a.c + ' truyện</span>' + statuses(a) + '</span>' +
            '<span class="tl"><em>Gồm:</em> ' + titles + (a.c > 3 ? ' …' : '') + '</span></span></a>';
        }).join('') + '</div></section>';
    }).join('');
  }

  /* ======================================================================== */
  /* Z · BẢNG XẾP HẠNG                                                      */
  /* ======================================================================== */
  function renderZ(list) {
    var bar = '<div class="ix-zbar"><span class="hint">' +
      (SORT === 'count' ? 'Xếp theo số tác phẩm' : 'Xếp theo tên A–Z') +
      '</span><div class="seg" role="group" aria-label="Cách xếp">' +
      '<button type="button" data-sort="count" aria-pressed="' + (SORT === 'count') + '">Nhiều truyện</button>' +
      '<button type="button" data-sort="az" aria-pressed="' + (SORT === 'az') + '">A–Z</button>' +
      '</div></div>';
    if (!list.length) return bar + '<p class="ix-empty">Không có tác giả nào khớp “' + esc(Q) + '”.</p>';

    var sorted = list.slice();
    if (SORT === 'count') sorted.sort(function (x, y) { return (y.c - x.c) || byName(x, y); });
    else sorted.sort(byName);

    var max = sorted.reduce(function (m, a) { return Math.max(m, a.c); }, 1);
    var n = 0;
    function row(a) {
      n++;
      return '<a class="ix-rk" href="' + href(a) + '" target="_blank" rel="noopener">' +
        '<span class="no">' + ('0' + n).slice(-2) + '</span>' + cover(a) +
        '<span class="tx"><span class="nm">' + esc(a.n) + '</span>' +
        '<span class="mt">' + statuses(a) + '</span></span>' +
        '<span class="bar"><i style="width:' + Math.round(a.c / max * 100) + '%"></i></span>' +
        '<span class="c">' + a.c + '<small>truyện</small></span></a>';
    }
    function tier(title, hint, rows) {
      if (!rows.length) return '';
      return '<section class="ix-tier"><div class="th"><h2>' + title + '</h2>' +
        '<span class="c">' + hint + '</span><i class="r"></i></div>' + rows.map(row).join('') + '</section>';
    }

    if (SORT === 'az') {
      return bar + '<section class="ix-tier">' + sorted.map(row).join('') + '</section>';
    }
    return bar +
      tier('Nhiều tác phẩm', 'từ ba truyện trở lên', sorted.filter(function (a) { return a.c >= 3; })) +
      tier('Hai tác phẩm', 'đang viết hai bộ', sorted.filter(function (a) { return a.c === 2; })) +
      tier('Một tác phẩm', 'mỗi người một bộ', sorted.filter(function (a) { return a.c === 1; }));
  }

  /* ======================================================================== */
  var DESC = {
    X: 'X · Mục lục — danh sách tên chạy một cột bên trái để đọc lướt; rê hoặc Tab vào một tên là bảng bên phải đổi sang tác giả đó (bìa, trạng thái, toàn bộ truyện).',
    Y: 'Y · Sổ danh mục — chữ cái là mốc lớn, mỗi mục in kèm tên truyện nên không phải mở ra mới biết họ viết gì.',
    Z: 'Z · Bảng xếp hạng — chia ba bậc theo số tác phẩm, mỗi dòng có số thứ tự và một vạch so sánh độ dài; đổi được sang A–Z.'
  };

  function paint(keepScroll) {
    var out = $('#out');
    if (!out) return;
    var y = window.scrollY, list = filtered();
    out.className = 'v' + V;
    out.innerHTML = V === 'X' ? renderX(list) : V === 'Y' ? renderY(list) : renderZ(list);
    $('#mkDesc').textContent = DESC[V];
    $('#ppSub').innerHTML = list.length === DATA.length
      ? '<b>' + DATA.length + '</b> tác giả · <b>' +
        DATA.reduce(function (s, a) { return s + a.c; }, 0) + '</b> truyện'
      : 'Tìm thấy <b>' + list.length + '</b> / ' + DATA.length + ' tác giả';
    var qw = $('#ppQWrap');
    if (qw) qw.removeAttribute('hidden');
    if (V === 'X' && list.length) {
      var pick = (CUR && list.filter(function (a) { return a.s === CUR.s; })[0]) || list[0];
      paintPan(pick);
      mark(pick.s);
    }
    if (keepScroll) window.scrollTo(0, y);
  }

  function mark(slug) {
    [].forEach.call(document.querySelectorAll('.ix-row'), function (r) {
      r.classList.toggle('is-on', r.getAttribute('data-s') === slug);
    });
  }

  /* ---- sự kiện ---------------------------------------------------------- */
  $('#mkSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]');
    if (!b) return;
    V = b.getAttribute('data-v');
    [].forEach.call(this.querySelectorAll('button'), function (x) {
      x.setAttribute('aria-selected', String(x === b));
    });
    window.scrollTo(0, 0);
    paint();
  });

  var out = $('#out');
  out.addEventListener('mouseover', function (e) {
    var r = e.target.closest('.ix-row');
    if (!r || V !== 'X') return;
    var a = DATA.filter(function (x) { return x.s === r.getAttribute('data-s'); })[0];
    if (a && (!CUR || CUR.s !== a.s)) { paintPan(a); mark(a.s); }
  });
  out.addEventListener('focusin', function (e) {
    var r = e.target.closest('.ix-row');
    if (!r || V !== 'X') return;
    var a = DATA.filter(function (x) { return x.s === r.getAttribute('data-s'); })[0];
    if (a) { paintPan(a); mark(a.s); }
  });
  out.addEventListener('click', function (e) {
    var s = e.target.closest('button[data-sort]');
    if (s) { SORT = s.getAttribute('data-sort'); paint(true); }
  });

  /* mũi tên lên/xuống để đi trong danh sách mục lục */
  out.addEventListener('keydown', function (e) {
    if (V !== 'X' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    var rows = [].slice.call(document.querySelectorAll('.ix-row'));
    var i = rows.indexOf(document.activeElement);
    if (i < 0) return;
    var next = rows[e.key === 'ArrowDown' ? i + 1 : i - 1];
    if (next) { e.preventDefault(); next.focus(); }
  });

  var t = 0;
  $('#ppQ').addEventListener('input', function () {
    var v = this.value;
    clearTimeout(t);
    t = setTimeout(function () { Q = v; paint(true); }, 90);
  });

  paint();
})();
