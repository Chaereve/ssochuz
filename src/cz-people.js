/* ============================================================================
   ssochuz · TRANG TÁC GIẢ (/tac-gia/) + TRANG COUPLE (/couple/)
   ----------------------------------------------------------------------------
   Hai shell tĩnh dùng chung file này (gọi CZPeople.init('author' | 'couple')).
   Dữ liệu lấy từ CZ.registry() ĐÃ fetch sẵn — không thêm API mới.
   · /tac-gia/?q=Snow%20Leopard (hoặc slug snow-leopard, hoặc #snow-leopard)
     → tên, số truyện, trạng thái + lưới truyện giống thư viện
   · /tac-gia/ (không slug) → danh sách mọi tác giả kèm số truyện
   ========================================================================== */
(function () {
  'use strict';
  var KIND = 'author';   /* 'author' | 'couple' */
  function esc(s) { return CZ.esc(s); }
  function field(n) { return KIND === 'author' ? (n.author || '') : (n.couple || ''); }
  function kindLabel() { return KIND === 'author' ? 'Tác giả' : 'Couple'; }
  function kindPath() { return KIND === 'author' ? '/tac-gia/' : '/couple/'; }
  /* slug đọc từ ?q= (tên hoặc slug), ?slug=, hoặc #hash */
  function readQ() {
    var q = CZ.qs('q') || CZ.qs('slug') || '';
    if (!q && location.hash) {
      try { q = decodeURIComponent(location.hash.replace(/^#/, '')); } catch (e) { q = ''; }
    }
    return String(q || '').trim();
  }
  function allNames(lib) {
    var seen = {}, out = [];
    lib.forEach(function (n) {
      var v = field(n);
      if (v && !seen[v]) { seen[v] = 1; out.push(v); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'vi'); });
  }
  /* khớp tên chính xác trước (không phân biệt hoa/thường), rồi tới slug */
  function findName(lib, q) {
    var names = allNames(lib), ql = q.toLowerCase();
    var hit = names.filter(function (x) { return x.toLowerCase() === ql; })[0];
    if (hit) return hit;
    var qs = CZ.slugify(q);
    return names.filter(function (x) { return CZ.slugify(x) === qs; })[0] || '';
  }
  function personURL(name) { return kindPath() + '?q=' + encodeURIComponent(CZ.slugify(name)); }
  /* "3 truyện · 2 hoàn thành · 1 đang cập nhật" */
  function statusLine(rows) {
    var c = { done: 0, run: 0, soon: 0, other: 0 };
    rows.forEach(function (n) {
      if (c[n.statusCls] == null) c.other++;
      else c[n.statusCls]++;
    });
    var bits = [rows.length + ' truyện'];
    ['done', 'run', 'soon'].forEach(function (k) {
      if (c[k]) bits.push(c[k] + ' ' + CZ.statusLabel(k).toLowerCase());
    });
    if (c.other) bits.push(c.other + ' khác');
    return bits.join(' · ');
  }
  function setHead(title, desc) {
    try { document.title = title + ' · ssochuz library'; } catch (e) {}
    var md = document.querySelector('meta[name="description"]');
    if (md) { try { md.setAttribute('content', desc); } catch (e) {} }
  }
  function renderOne(name) {
    var lib = CZ.lib().filter(function (n) { return field(n) === name; });
    lib.sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); });
    document.querySelector('#crumb').innerHTML = '<a href="/">Trang chủ</a> <span>›</span> ' +
      '<a href="/#thu-vien">Thư viện</a> <span>›</span> ' +
      '<a href="' + kindPath() + '">Tất cả ' + kindLabel().toLowerCase() + '</a> <span>›</span> <b>' + esc(name) + '</b>';
    document.querySelector('#ppTitle').textContent = name;
    document.querySelector('#ppSub').textContent = kindLabel() + ' · ' + statusLine(lib);
    document.querySelector('#ppGrid').innerHTML = lib.length
      ? lib.map(function (n) { return CZ.card(n, { view: 'grid' }); }).join('')
      : '<div class="empty">Chưa có truyện nào.</div>';
    setHead(name + ' · ' + kindLabel(), statusLine(lib) + ' của ' + name + ' trên ssochuz library.');
    if (CZ.reveal) CZ.reveal();
  }
  function renderAll(missQ) {
    var lib = CZ.lib(), names = allNames(lib);
    var by = {};
    lib.forEach(function (n) {
      var v = field(n);
      if (v) (by[v] = by[v] || []).push(n);
    });
    document.querySelector('#crumb').innerHTML = '<a href="/">Trang chủ</a> <span>›</span> ' +
      '<a href="/#thu-vien">Thư viện</a> <span>›</span> <b>Tất cả ' + kindLabel().toLowerCase() + '</b>';
    document.querySelector('#ppTitle').textContent = 'Tất cả ' + kindLabel().toLowerCase();
    document.querySelector('#ppSub').textContent = names.length + ' ' + kindLabel().toLowerCase() + ' · chọn một mục để xem truyện';
    document.querySelector('#ppGrid').innerHTML =
      (missQ ? '<div class="empty" style="grid-column:1/-1">Không tìm thấy “' + esc(missQ) + '” — hiện tất cả ' + kindLabel().toLowerCase() + '.</div>' : '') +
      names.map(function (name) {
        var rows = (by[name] || []).sort(function (a, b) {
          return String(b.updated || '').localeCompare(String(a.updated || ''));
        });
        var thumbs = rows.slice(0, 3).map(function (n) {
          var im = n.thumb || n.slide || '';
          return im ? '<img src="' + esc(im) + '" alt="" loading="lazy" decoding="async">' : '';
        }).join('');
        return '<a class="pcard" href="' + personURL(name) + '">' +
          '<span class="pth">' + thumbs + '</span>' +
          '<span class="pbody"><b>' + esc(name) + '</b>' +
          '<span class="pmeta">' + esc(statusLine(rows)) + '</span></span></a>';
      }).join('');
    setHead('Tất cả ' + kindLabel().toLowerCase(), 'Danh sách ' + kindLabel().toLowerCase() + ' trên ssochuz library.');
    if (CZ.reveal) CZ.reveal();
  }
  function paint() {
    var lib = CZ.lib(), q = readQ();
    if (!lib.length) {
      document.querySelector('#ppGrid').innerHTML = '<div class="empty">Chưa tải được dữ liệu — thử tải lại trang.</div>';
      return;
    }
    if (!q) { renderAll(''); return; }
    var name = findName(lib, q);
    if (name) renderOne(name);
    else renderAll(q);
  }
  function init(kind) {
    KIND = kind === 'couple' ? 'couple' : 'author';
    CZ.mountShell({ active: 'library' });
    /* registry (KV → cache → file tĩnh) về mới có dữ liệu để vẽ */
    CZ.registry().then(function () { paint(); }).catch(function () { paint(); });
    /* đổi hash tay thì vẽ lại (link ?q= thường tải lại trang nên không cần popstate) */
    window.addEventListener('hashchange', paint);
  }
  window.CZPeople = { init: init };
})();
