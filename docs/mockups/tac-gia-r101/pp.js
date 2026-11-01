/* ============================================================================
   r101 · trang Tác giả — ba phương án giao diện chạy được trên cùng một trang.
   Dữ liệu: data.js (window.MKA) chép từ data/registry.json của web.
   Mỗi phương án là MỘT cách phân cấp khác nhau, không phải ba bộ màu:
     A · Chỉ mục  — phân cấp bằng chữ cái (A–Z dính, nhóm lớn, dòng gọn)
     B · Bảng     — phân cấp bằng cột (hàng tiêu đề, số liệu thẳng cột, sắp xếp)
     C · Tạp chí  — phân cấp bằng cỡ (dải bìa lớn + danh sách đều, kiểu Thẻ/Gọn)
   ========================================================================== */
(function () {
  'use strict';

  var DATA = (window.MKA && window.MKA.a) || [];
  var LIVE = 'https://8081-inpi9mz09qz9bfup3iuwi.e2b.app/tac-gia/?q=';

  var V = 'C';            /* phương án đang xem (C đã duyệt) */
  var Q = '';             /* từ khoá lọc */
  var SORT = 'name';      /* name | count | new */
  var MODE = 'card';      /* C: card | compact */
  var H = '1';            /* kiểu đầu trang: 1 | 2 | 3 */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function $(s) { return document.querySelector(s); }
  function lower(s) { return String(s || '').toLowerCase(); }
  function plain(s) {
    return lower(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }
  function letterOf(name) {
    var c = plain(name).charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : '#';
  }
  function shortDate(u) {
    var p = String(u || '').split('-');
    return p.length === 3 ? p[2] + '-' + p[1] : '';
  }
  function total(a) { return a.c; }
  function statusLine(a) {
    var out = [];
    if (a.st.done) out.push('<span class="mst"><i class="done"></i>' + a.st.done + ' hoàn thành</span>');
    if (a.st.run) out.push('<span class="mst"><i class="run"></i>' + a.st.run + ' đang cập nhật</span>');
    if (a.st.soon) out.push('<span class="mst"><i class="soon"></i>' + a.st.soon + ' sắp ra mắt</span>');
    return out.join('');
  }
  function book(a, cls) {
    var k = a.cov && a.cov[0];
    var rem = a.rem && a.rem[0];
    if (!k) return '<span class="mbk ' + cls + '"></span>';
    return '<span class="mbk ' + cls + '"><img src="/assets/covers/' + k + '.webp" alt="" loading="lazy"' +
      ' decoding="async"' + (rem ? ' onerror="this.onerror=null;this.src=\'' + esc(rem) + '\'"' : '') + '></span>';
  }
  function href(a) { return LIVE + encodeURIComponent(a.s); }

  /* ---- lọc + sắp xếp ---------------------------------------------------- */
  function view() {
    var q = plain(Q).trim();
    var list = DATA.filter(function (a) { return !q || plain(a.n).indexOf(q) >= 0; });
    list.sort(function (x, y) {
      if (SORT === 'count') return (y.c - x.c) || x.n.localeCompare(y.n, 'vi');
      if (SORT === 'new') return String(y.u).localeCompare(String(x.u)) || x.n.localeCompare(y.n, 'vi');
      return x.n.localeCompare(y.n, 'vi');
    });
    return list;
  }

  /* ======================================================================== */
  /* A · CHỈ MỤC                                                              */
  /* ======================================================================== */
  function renderA(list) {
    var groups = {}, order = [];
    list.forEach(function (a) {
      var L = letterOf(a.n);
      if (!groups[L]) { groups[L] = []; order.push(L); }
      groups[L].push(a);
    });
    order.sort();
    var all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['#']);
    var bar = '<div class="azwrap"><div class="maz" role="group" aria-label="Nhảy tới nhóm chữ cái">' +
      all.map(function (L) {
        var on = !!groups[L];
        return '<button type="button" data-l="' + L + '"' + (on ? '' : ' disabled') + '>' + L + '</button>';
      }).join('') + '</div></div>';

    var body = order.map(function (L) {
      return '<section class="mgrp" id="pk-' + L + '">' +
        '<h2 class="mgh"><span class="l">' + L + '</span><span class="c">' + groups[L].length +
        ' tác giả</span><i class="r"></i></h2><div class="mrows">' +
        groups[L].map(function (a) {
          return '<a class="mrow" href="' + href(a) + '" target="_blank" rel="noopener">' +
            book(a, 'md') + '<span class="mtx"><span class="mnm">' + esc(a.n) + '</span>' +
            '<span class="mmt"><span class="mcnt">' + total(a) + ' truyện</span>' + statusLine(a) + '</span></span></a>';
        }).join('') + '</div></section>';
    }).join('');

    return bar + (list.length ? body : '<p class="mempty">Không có tác giả nào khớp “' + esc(Q) + '”.</p>');
  }

  /* ======================================================================== */
  /* B · BẢNG                                                                 */
  /* ======================================================================== */
  function renderB(list) {
    function head(key, label, cls) {
      var on = SORT === key;
      return '<button type="button" class="' + (cls || '') + '" data-sort="' + key + '" aria-pressed="' +
        on + '">' + label + (on ? '<span class="ar">▾</span>' : '') + '</button>';
    }
    var mrows = list.map(function (a) {
      return '<a class="mtrow" href="' + href(a) + '" target="_blank" rel="noopener">' +
        '<span class="mwho">' + book(a, 'sm') + '<span class="mnm">' + esc(a.n) + '</span></span>' +
        '<span class="mnum">' + total(a) + '<small>truyện</small></span>' +
        '<span class="mstw">' + statusLine(a) + '</span>' +
        '<span class="mwhen">' + shortDate(a.u) + '</span></a>';
    }).join('');
    return '<div class="mthead">' +
      head('name', 'Tác giả') + head('count', 'Truyện', 'cn') +
      '<span class="cst">Trạng thái</span>' + head('new', 'Cập nhật', 'cwhen') + '</div>' +
      (mrows || '<p class="mempty">Không có tác giả nào khớp “' + esc(Q) + '”.</p>');
  }

  /* ======================================================================== */
  /* C · TẠP CHÍ                                                              */
  /* ======================================================================== */
  function renderC(list) {
    var top = DATA.slice().sort(function (x, y) { return (y.c - x.c) || x.n.localeCompare(y.n, 'vi'); }).slice(0, 3);
    var feat = '<div class="mband"><div class="mband-hd"><h2>Nhiều truyện nhất</h2>' +
      '<span class="c">ba tác giả viết nhiều nhất</span><i class="r"></i></div><div class="mf3">' +
      top.map(function (a) {
        return '<a class="mf1" href="' + href(a) + '" target="_blank" rel="noopener">' + book(a, 'lg') +
          '<span class="mtx"><span class="mnm">' + esc(a.n) + '</span><span class="mmt">' +
          '<span class="mcnt">' + total(a) + ' truyện</span>' + statusLine(a) +
          '<span class="mlt">Mới nhất: ' + esc((a.rows[0] || {}).t || '—') + '</span></span></span></a>';
      }).join('') + '</div></div>';

    var mcards = list.map(function (a) {
      return '<a class="mcard" href="' + href(a) + '" target="_blank" rel="noopener">' +
        book(a, MODE === 'compact' ? 'md' : 'md') +
        '<span class="mtx"><span class="mnm">' + esc(a.n) + '</span>' +
        '<span class="mmt"><span class="mcnt">' + total(a) + ' truyện</span>' + statusLine(a) + '</span></span></a>';
    }).join('');

    /* khi đang tìm thì dải "nhiều truyện nhất" không còn nghĩa (nó là số liệu
       toàn thư viện), ẩn đi để kết quả tìm nằm ngay dưới ô tìm */
    if (Q.trim()) feat = '';
    return feat +
      '<div class="mallhd"><h2>Tất cả tác giả</h2><div class="mseg" role="group" aria-label="Kiểu xem">' +
      '<button type="button" data-mode="card" aria-pressed="' + (MODE === 'card') + '">Thẻ</button>' +
      '<button type="button" data-mode="compact" aria-pressed="' + (MODE === 'compact') + '">Gọn</button>' +
      '</div></div>' +
      '<div class="mcards' + (MODE === 'compact' ? ' compact' : '') + '">' +
      (mcards || '<p class="mempty">Không có tác giả nào khớp “' + esc(Q) + '”.</p>') + '</div>';
  }

  /* ======================================================================== */
  var HEADDESC = {
    '1': ' · Đầu trang 1 — ô tìm canh đáy, hẹp, ngang tầm dòng đếm.',
    '2': ' · Đầu trang 2 — ô tìm xuống dòng riêng, canh trái như thanh lọc.',
    '3': ' · Đầu trang 3 — ô tìm xuống thanh danh sách, đứng cạnh kiểu xem.'
  };
  var DESC = {
    A: 'A · Chỉ mục — chữ cái A–Z dính trên đầu là mốc phân cấp lớn nhất, mỗi nhóm một khối, trong nhóm là dòng tên gọn. Bấm chữ cái để nhảy nhóm.',
    B: 'B · Bảng — phân cấp bằng cột: hàng tiêu đề (TÁC GIẢ · TRUYỆN · TRẠNG THÁI · CẬP NHẬT) và số liệu thẳng cột. Bấm tiêu đề để sắp xếp.',
    C: 'C · Tạp chí — phân cấp bằng cỡ: dải “Nhiều truyện nhất” với bìa lớn mở đầu, rồi danh sách đều; đổi được kiểu Thẻ / Gọn.'
  };

  /* ô tìm nằm trong masthead hay trong thanh của danh sách (kiểu 3) */
  function placeSearch() {
    var box = document.getElementById('ppQWrap');
    if (!box) return;
    var home = document.querySelector('.mlead');
    var bar = document.querySelector('.mallhd');
    if (H === '3' && V === 'C' && bar) {
      if (box.parentNode !== bar) bar.appendChild(box);
    } else if (home && box.parentNode !== home) {
      home.appendChild(box);
    }
  }

  function paint(keepScroll) {
    var out = $('#out');
    var y = window.scrollY;
    var list = view();
    out.className = 'v' + V;
    out.innerHTML = V === 'A' ? renderA(list) : V === 'B' ? renderB(list) : renderC(list);
    $('#mkDesc').textContent = DESC[V] + (V === 'C' ? (HEADDESC[H] || '') : '');
    $('#ppSub').innerHTML = list.length === DATA.length
      ? '<b>' + DATA.length + '</b> tác giả · <b>' + total({ c: DATA.reduce(function (s, a) { return s + a.c; }, 0) }) + '</b> truyện'
      : 'Tìm thấy <b>' + list.length + '</b> / ' + DATA.length + ' tác giả';
    var qw = $('#ppQWrap');
    if (!qw) return;                  /* trang đã bị điều hướng đi trong lúc chờ gõ */
    qw.removeAttribute('hidden');
    var host = $('.m101');
    if (host) host.className = 'm101 hd' + H;
    placeSearch();
    if (keepScroll) window.scrollTo(0, y); else spy();
    spy();
  }

  /* ---- A: cuộn tới nhóm + tô sáng chữ cái đang xem ---------------------- */
  var raf = 0, jumping = 0;
  function spy() {
    if (V !== 'A') return;
    var bar = $('.maz');
    if (!bar) return;
    var groups = [].slice.call(document.querySelectorAll('#out .mgrp'));
    if (!groups.length) return;
    var top = bar.getBoundingClientRect().bottom + 24, hit = '';
    groups.forEach(function (g) {
      if (g.getBoundingClientRect().top - top <= 0) hit = g.id.replace('pk-', '');
    });
    if (!hit) hit = groups[0].id.replace('pk-', '');
    [].forEach.call(bar.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-current', String(b.getAttribute('data-l') === hit));
    });
  }
  window.addEventListener('scroll', function () {
    if (jumping || raf) return;
    raf = requestAnimationFrame(function () { raf = 0; spy(); });
  }, { passive: true });

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

  $('#mkHead').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-h]');
    if (!b) return;
    H = b.getAttribute('data-h');
    [].forEach.call(this.querySelectorAll('button'), function (x) {
      x.setAttribute('aria-selected', String(x === b));
    });
    document.querySelector('.m101').className = 'm101 hd' + H;
    placeSearch();
    $('#mkDesc').textContent = DESC[V] + (V === 'C' ? (HEADDESC[H] || '') : '');
  });

  $('#out').addEventListener('click', function (e) {
    var l = e.target.closest('.maz button[data-l]');
    if (l && !l.disabled) {
      var g = document.getElementById('pk-' + l.getAttribute('data-l'));
      if (g) {
        jumping = 1;
        var y = g.getBoundingClientRect().top + window.pageYOffset - ($('.maz').getBoundingClientRect().height + 56);
        window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
        setTimeout(function () { jumping = 0; spy(); }, 260);
      }
      return;
    }
    var s = e.target.closest('button[data-sort]');
    if (s) { SORT = s.getAttribute('data-sort'); paint(true); return; }
    var m = e.target.closest('button[data-mode]');
    if (m) { MODE = m.getAttribute('data-mode'); paint(true); }
  });

  var t = 0;
  $('#ppQ').addEventListener('input', function () {
    var v = this.value;
    clearTimeout(t);
    t = setTimeout(function () { Q = v; paint(true); }, 90);
  });

  function measureBar() {
    var bar = document.querySelector('.mkbar');
    if (bar) document.documentElement.style.setProperty('--mkbar-h', bar.offsetHeight + 'px');
  }
  measureBar();
  window.addEventListener('resize', measureBar);
  paint();
})();
