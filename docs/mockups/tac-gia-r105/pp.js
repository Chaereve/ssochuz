/* ============================================================================
   r105 · trang Tác giả — lưới bìa
   · tìm theo tên (bỏ dấu vẫn khớp) · ⌘K hoặc "/" để nhảy vào ô tìm
   · lọc trạng thái = một thanh phân đoạn 4 mục, có số đếm trong nhãn
   · sắp xếp A–Z / nhiều truyện / mới cập nhật
   · trạng thái nằm trong URL: ?q= ?st= ?sort=
   Chỉ hai dòng chữ dưới mỗi bìa: tên và "N truyện" + chấm màu trạng thái.
   ========================================================================== */
(function () {
  'use strict';

  var DATA = (window.MKA && window.MKA.a) || [];

  /* Trang tác giả thật nằm ở /tac-gia/?q=<slug>. Bản thật dùng đường dẫn tương
     đối; bản xem thử (chạy ở cổng 8087 của máy này) trỏ sang cổng 8081 để bấm
     vào là mở được trang thật — không ghi cứng tên miền nào. */
  var LIVE = (function () {
    var h = location.hostname, m = h.match(/^(\d+)-(.*)$/);
    if (m) return location.protocol + '//8081-' + m[2] + '/tac-gia/?q=';
    if (/^(localhost|127\.|\[::1\])/.test(h)) {
      return location.protocol + '//' + h + ':8081/tac-gia/?q=';
    }
    return '/tac-gia/?q=';
  })();

  var ST = [
    { k: 'done', label: 'Hoàn thành' },
    { k: 'run', label: 'Đang ra' },
    { k: 'soon', label: 'Sắp ra' }
  ];
  var SORTS = [
    { k: 'az', short: 'A–Z', label: 'Tên A–Z' },
    { k: 'count', short: 'Nhiều truyện', label: 'Nhiều truyện' },
    { k: 'new', short: 'Mới nhất', label: 'Mới cập nhật' }
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
  function href(a) { return LIVE + encodeURIComponent(a.s); }
  function label(k) {
    var h = ST.filter(function (x) { return x.k === k; })[0];
    return h ? h.label : '';
  }
  function sortMeta(k) {
    return SORTS.filter(function (x) { return x.k === k; })[0] || SORTS[0];
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
  function filtered() {
    var list = DATA.filter(function (a) { return matchQ(a) && (!S.st || a.st[S.st] > 0); });
    list.sort(function (x, y) {
      if (S.sort === 'count') return (y.c - x.c) || x.n.localeCompare(y.n, 'vi');
      if (S.sort === 'new') return String(y.u).localeCompare(String(x.u)) || x.n.localeCompare(y.n, 'vi');
      return x.n.localeCompare(y.n, 'vi');
    });
    return list;
  }

  /* ---- một tác giả = một bìa -------------------------------------------- */
  function cover(a) {
    var k = a.cov && a.cov[0], rem = a.rem && a.rem[0];
    if (!k) return '<span class="ta-cv"></span>';
    return '<span class="ta-cv"><img src="/assets/covers/' + k + '.webp" alt="" loading="lazy"' +
      ' decoding="async"' + (rem ? ' onerror="this.onerror=null;this.src=\'' + esc(rem) + '\'"' : '') + '></span>';
  }
  function dots(a) {
    var have = ST.filter(function (x) { return a.st[x.k] > 0; });
    if (!have.length) return '';
    return '<span class="ds">' + have.map(function (x) {
      return '<i class="' + x.k + '"></i>';
    }).join('') + '</span>';
  }
  function card(a) {
    var have = ST.filter(function (x) { return a.st[x.k] > 0; }).map(function (x) {
      return x.label.toLowerCase();
    });
    var say = a.n + ' — ' + a.c + ' truyện' + (have.length ? ' · ' + have.join(', ') : '');
    return '<a class="ta-card" href="' + href(a) + '" target="_blank" rel="noopener" aria-label="' +
      esc(say) + '">' + cover(a) +
      '<span class="ta-nm" aria-hidden="true">' + esc(a.n) + '</span>' +
      '<span class="ta-ct" aria-hidden="true">' + dots(a) + a.c + ' truyện</span></a>';
  }

  /* ---- vẽ ---------------------------------------------------------------- */
  function paint(keep) {
    var out = $('#taOut');
    var list = filtered();
    var y = window.scrollY;

    out.innerHTML = list.length
      ? '<div class="ta-grid">' + list.map(card).join('') + '</div>'
      : '<div class="ta-empty"><b>Không tìm thấy tác giả</b>' +
        '<p>' + (S.q
          ? 'Không có tên nào chứa “' + esc(S.q) + '”' + (S.st ? ' trong nhóm ' + label(S.st).toLowerCase() : '') + '.'
          : 'Chưa có tác giả nào ở trạng thái ' + label(S.st).toLowerCase() + '.') + '</p>' +
        '<button type="button" id="taReset">Xoá bộ lọc</button></div>';

    chips();
    syncSub(list.length);
    if (keep) window.scrollTo(0, y);
  }

  function chips() {
    var base = DATA.filter(matchQ);
    $('#taSeg').innerHTML =
      '<button type="button" data-st="" aria-pressed="' + (!S.st) + '">Tất cả' +
      '<span class="n">' + base.length + '</span></button>' +
      ST.map(function (x) {
        var n = base.filter(function (a) { return a.st[x.k] > 0; }).length;
        return '<button type="button" data-st="' + x.k + '" aria-pressed="' + (S.st === x.k) +
          '"><i class="d ' + x.k + '"></i>' + x.label + '<span class="n">' + n + '</span></button>';
      }).join('');
  }

  function syncSub(n) {
    var total = DATA.length, works = DATA.reduce(function (s, a) { return s + a.c; }, 0);
    $('#taSub').innerHTML = (S.q || S.st)
      ? '<b>' + n + '</b> / ' + total + ' tác giả'
      : '<b>' + total + '</b> tác giả · <b>' + works + '</b> truyện';
  }

  function syncSort() {
    [].forEach.call($('#taSortMenu').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-sort') === S.sort));
    });
    $('#taSortLabel').textContent = sortMeta(S.sort).short;
  }

  function reset() {
    S.q = ''; S.st = '';
    writeURL(); syncSort(); syncSearch(); syncSub(filtered().length); paint();
    $('#taQ').focus({ preventScroll: true });
  }

  function syncSearch() {
    $('#taQ').value = S.q;
    $('#taSearch').classList.toggle('has-q', !!S.q);
  }

  /* ---- sự kiện ---------------------------------------------------------- */
  var t = 0;
  $('#taQ').addEventListener('input', function () {
    S.q = this.value;
    $('#taSearch').classList.toggle('has-q', !!S.q);
    clearTimeout(t);
    t = setTimeout(function () { writeURL(); paint(true); }, 90);
  });
  $('#taQ').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); reset(); }
  });
  $('#taClr').addEventListener('click', function () {
    S.q = ''; writeURL(); syncSearch(); paint(true); $('#taQ').focus({ preventScroll: true });
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

  $('#taSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-st]');
    if (!b) return;
    var v = b.getAttribute('data-st');
    S.st = (S.st === v) ? '' : v;
    writeURL(); paint(true);
  });

  function closeSort() {
    $('#taSortBox').classList.remove('open');
    $('#taSortBtn').setAttribute('aria-expanded', 'false');
  }
  $('#taSortBtn').addEventListener('click', function () {
    var on = $('#taSortBox').classList.toggle('open');
    this.setAttribute('aria-expanded', String(on));
  });
  $('#taSortMenu').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sort]');
    if (!b) return;
    S.sort = b.getAttribute('data-sort');
    closeSort(); writeURL(); syncSort(); paint(true);
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#taSortBox')) closeSort();
    if (e.target.closest('#taReset')) reset();
  });

  /* ---- khởi động -------------------------------------------------------- */
  readURL();
  syncSearch(); syncSort(); paint();
  window.addEventListener('popstate', function () { readURL(); syncSearch(); syncSort(); paint(); });
})();
