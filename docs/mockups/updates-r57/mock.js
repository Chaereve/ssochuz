/* ============================================================================
   “Mới cập nhật” — 4 khung (vòng 57). Dữ liệu THẬT từ data/registry.json,
   bìa thật từ /assets/covers (bản sao lưu), đúng thứ tự sắp xếp của site.
   Khung: ?o=now | a | b | c
   ========================================================================== */
(function () {
  /* cùng thuật toán với src/shared/cover-mirror.js */
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
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* y hệt src/cz-app.js: dateShort + timeAgo */
  function dateShort(s) {
    if (!s) return '—';
    var x = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s);
    if (isNaN(x)) return String(s);
    return x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }
  function timeAgo(s) {
    var x = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).getTime();
    if (!x || isNaN(x)) return '—';
    var diff = Date.now() - x, day = 864e5;
    if (diff < 3600e3) return 'vừa xong';
    if (diff < day) return Math.floor(diff / 3600e3) + ' giờ trước';
    if (diff < 30 * day) return Math.floor(diff / day) + ' ngày trước';
    return dateShort(s);
  }
  function stCls(s) {
    return /hoàn thành|full/i.test(s || '') ? 'done' : /sắp|chưa|tạm dừng/i.test(s || '') ? 'soon' : 'run';
  }
  function stLab(s) {
    var c = stCls(s);
    return c === 'done' ? 'Hoàn thành' : c === 'soon' ? 'Sắp ra mắt' : 'Đang cập nhật';
  }
  function ch(n) { return parseInt(n.chapters, 10) || 0; }

  var O = (new URLSearchParams(location.search).get('o') || 'now').toLowerCase();
  var CLS = { now: 'vNow', a: 'vA', b: 'vB', c: 'vC' };
  if (!CLS[O]) O = 'now';
  document.body.classList.add(CLS[O]);

  fetch('/data/registry.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var lib = data.lib || [];
      var rows = lib.slice().sort(function (a, b) {
        return String(b.updated || '').localeCompare(String(a.updated || '')) || (b.chapters - a.chapters);
      });
      /* A/B/C: “vừa lên chương” thì chỉ lấy bộ đã có chương.
         Khung “now” giữ nguyên danh sách đang chạy để thấy đúng cái đang rối. */
      if (O !== 'now') rows = rows.filter(function (n) { return ch(n) > 0; });
      var pick = rows.slice(0, 12);

      var html = pick.map(function (n) {
        var src = cover(n), img = src
          ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
          : '<span class="mrow-ph" aria-hidden="true"></span>';
        var who = esc(n.author || n.couple || '');
        var tm = esc(timeAgo(n.updated));
        var num = ch(n);

        if (O === 'now') {
          /* đúng như renderNew() đang chạy: chưa có chương thì in nhãn tình trạng */
          var now = num ? 'Ch. ' + num : stLab(n.status);
          return '<a class="mrow" href="#">' + img +
            '<span class="mt"><b>' + esc(n.title) + '</b><span>' + who + '</span></span>' +
            '<span class="mn"><b>' + esc(now) + '</b><span>' + tm + '</span></span></a>';
        }
        if (O === 'a') {
          return '<a class="mrow" href="#">' + img +
            '<span class="mt"><b>' + esc(n.title) + '</b><span>' + who + '</span></span>' +
            '<span class="mn"><b><i>Ch.</i>' + num + '</b><span class="tm">' + tm + '</span></span></a>';
        }
        if (O === 'b') {
          return '<a class="mrow" href="#">' +
            '<span class="cv">' + img + '<span class="cch">' + num + '</span></span>' +
            '<span class="mt"><b>' + esc(n.title) + '</b><span>' + who + '</span></span>' +
            '<span class="mn"><span class="tm">' + tm + '</span></span></a>';
        }
        /* C */
        return '<a class="mrow" href="#">' + img +
          '<span class="mt"><b>' + esc(n.title) + '</b>' +
          '<span class="meta2"><span class="who">' + who + '</span>' +
          '<span class="num"><b>Ch. ' + num + '</b><span class="sp"> · </span>' + tm + '</span></span></span></a>';
      }).join('');

      var box = document.getElementById('newRail');
      box.innerHTML = html;
      var sub = document.getElementById('newSub');
      if (sub) sub.textContent = pick.length + ' bộ vừa lên chương';
      /* index.html đọc số này để co giãn iframe */
      document.documentElement.setAttribute('data-ready', '1');
    });
})();
