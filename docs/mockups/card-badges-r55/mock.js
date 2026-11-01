/* ============================================================================
   Huy hiệu trên bìa thẻ truyện — 3 phương án (vòng 55)
   Dùng dữ liệu THẬT (data/registry.json + bìa sao lưu /assets/covers) và đúng
   class của site (.card/.th/.foot/.b18/.stic/.bar) để bản xem là bản thật.
   ========================================================================== */
(function () {
  /* cùng thuật toán với src/shared/cover-mirror.js — để lấy bìa đã sao lưu */
  function coverKey(url) {
    var s = String(url == null ? '' : url);
    var bytes = new TextEncoder().encode(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function cover(n) {
    if (!n.thumb) return '';
    return /^https?:\/\//i.test(n.thumb) ? '/assets/covers/' + coverKey(n.thumb) + '.webp' : n.thumb;
  }
  function stCls(s) {
    return /hoàn thành|full/i.test(s || '') ? 'done' : /sắp|chưa|tạm dừng/i.test(s || '') ? 'soon' : 'run';
  }
  function stLab(s) {
    var c = stCls(s);
    return c === 'done' ? 'Hoàn thành' : c === 'soon' ? 'Sắp ra mắt' : 'Đang cập nhật';
  }
  /* số chương: KHÔNG bao giờ in “0/—” — chưa có chương thì nói thẳng */
  function chapText(n) {
    var c = parseInt(n.chapters, 10) || 0, d = parseInt(n.declared, 10) || 0;
    if (!c) return '';
    return d > c ? c + '/' + d + ' chương' : c + ' chương';
  }

  /* sáu bộ thật, đủ cảnh: hoàn thành / đang cập nhật / sắp ra mắt, có và không
     18+, một bộ “mới”, hai bộ chưa có chương (đúng ca “0/—” đang thấy) */
  var WANT = [
    { slug: 'third-person' },
    { slug: 'pls-love' },
    { slug: 'co-vo-ho-danh-da-cua-toi', fresh: 1 },
    { slug: 'juliet-n-juliet' },
    { slug: 'my-mermaid-om-tron-tieu-nhan-ngu' },
    { slug: 'busaba-lac-loi-giua-em-trang' }
  ];

  function cardHtml(n, fresh, cur) {
    var c = stCls(n.status), lab = stLab(n.status);
    /* bản “đang chạy” in đúng nhãn gốc của site, kể cả nhãn khó hiểu 0/— */
    var ch = cur ? (parseInt(n.chapters, 10) ? chapText(n) : (String(n.countLabel || '').trim() || '0 chương')) : chapText(n);
    var pct = n.chapters ? 62 : 0;
    return '<div class="cardwrap"><a class="card" href="#" tabindex="-1">' +
      '<div class="th">' +
        '<img src="' + cover(n) + '" alt="Bìa ' + n.title + '" width="300" height="450">' +
        '<span class="scrim"></span>' +
        /* kiểu hiện tại: vòng tròn icon 28px */
        '<span class="stic st-' + c + '" title="' + lab + '">' + ico(c) + '</span>' +
        /* kiểu C: viên chữ nhỏ có chấm màu */
        '<span class="spill t-' + c + '"><i class="d"></i>' + lab + '</span>' +
        (fresh ? '<span class="nw-bookmark"><span>NEW</span></span>' : '') +
        (n.is18 ? '<span class="corner18">18+</span>' : '') +
        /* kiểu hiện tại + B: hàng chân bìa */
        '<span class="foot">' +
          '<span class="sline t-' + c + '"><i class="d"></i>' + lab + '</span>' +
          (ch ? '<span class="ch">' + ch + '</span>' : '') +
          (n.is18 ? '<span class="b18">18+</span>' : '') +
        '</span>' +
        (pct ? '<span class="bar"><i style="width:' + pct + '%"></i></span>' : '') +
      '</div>' +
      '<h3>' + n.title + '</h3>' +
      '<div class="cb">' + (n.author || n.couple || '') + '</div>' +
      /* kiểu A: một dòng meta dưới tên truyện */
      '<div class="cmeta">' +
        '<span class="stext t-' + c + '"><i class="d"></i>' + lab + '</span>' +
        (ch ? '<span class="sep">·</span><span class="cch">' + ch + '</span>' : '') +
      '</div>' +
      '</a></div>';
  }
  /* icon Tabler giống site (chỉ dùng cho phương án hiện tại) */
  function ico(c) {
    var p = c === 'done' ? '<path d="M5 12l5 5l9 -10" />'
      : c === 'soon' ? '<path d="M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1z" /><path d="M6 4v2a6 6 0 1 0 12 0v-2" />'
      : '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />';
    return '<svg class="i i-s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  window.MOCK = {
    render: function (host, opt, count) {
      var lib = window.__LIB || [];
      var pick = WANT.slice(0, count || 6).map(function (w) {
        var n = lib.filter(function (x) { return x.slug === w.slug; })[0];
        return n ? { n: n, fresh: w.fresh } : null;
      }).filter(Boolean);
      var v = String(opt || 'a');
      host.className = 'v' + v.toUpperCase() + ' mgrid';
      host.innerHTML = pick.map(function (p) { return cardHtml(p.n, p.fresh, v === '0'); }).join('');
    },
    load: function () {
      return fetch('/data/registry.json').then(function (r) { return r.json(); })
        .then(function (d) { window.__LIB = d.lib || []; });
    }
  };

  var q = new URLSearchParams(location.search);
  window.MOCK.load().then(function () {
    var host = document.getElementById('pv');
    if (host) window.MOCK.render(host, q.get('o') || 'a', +(q.get('n') || 6));
    document.documentElement.setAttribute('data-ready', '1');
  });
})();
