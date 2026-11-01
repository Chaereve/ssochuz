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
  function fields(n) {
    if (!n) return [];
    if (KIND === 'author') {
      var a = String(n.author || '').trim();
      return a ? [a] : [];
    }
    if (CZ.couplesOf) return CZ.couplesOf(n);
    var c = String(n.couple || '').trim();
    return c ? [c] : [];
  }
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
      fields(n).forEach(function (v) {
        if (v && !seen[v]) { seen[v] = 1; out.push(v); }
      });
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
  /* ô lọc tên (chỉ ở trang danh sách): gõ có/không dấu đều khớp nhờ slugify */
  function bindFilter(total) {
    var w = document.querySelector('#ppQWrap'), q = document.querySelector('#ppQ');
    if (!w || !q) return;
    w.removeAttribute('hidden');
    q.value = '';
    q.oninput = function () {
      var needle = CZ.slugify(q.value), shown = 0;
      Array.prototype.forEach.call(document.querySelectorAll('#ppGrid .pcard'), function (c) {
        var hit = !needle || (c.getAttribute('data-name') || '').indexOf(needle) !== -1;
        c.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      var em = document.querySelector('#ppEmpty');
      if (!em) {
        em = document.createElement('div');
        em.className = 'empty'; em.id = 'ppEmpty'; em.style.gridColumn = '1/-1';
        document.querySelector('#ppGrid').appendChild(em);
      }
      em.style.display = shown ? 'none' : '';
      em.textContent = 'Không có ' + kindLabel().toLowerCase() + ' nào khớp “' + q.value.trim() + '”.';
      document.querySelector('#ppSub').textContent = needle
        ? ('Tìm thấy ' + shown + ' / ' + total + ' ' + kindLabel().toLowerCase())
        : (total + ' ' + kindLabel().toLowerCase());
    };
  }
  function renderOne(name) {
    var w = document.querySelector('#ppQWrap');
    if (w) w.setAttribute('hidden', '');
    PP.hide();
    var g1 = document.querySelector('#ppGrid');
    if (g1) g1.setAttribute('data-mode', 'one');   /* .grid gốc: lưới thẻ truyện */   /* .people #ppGrid là block; lưới thẻ cần grid */
    var lib = CZ.lib().filter(function (n) { return fields(n).indexOf(name) >= 0 || field(n) === name; });
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
    var g0 = document.querySelector('#ppGrid');
    if (g0) g0.setAttribute('data-mode', 'one');
    var by = {};
    lib.forEach(function (n) {
      fields(n).forEach(function (v) {
        if (v) (by[v] = by[v] || []).push(n);
      });
    });
    document.querySelector('#crumb').innerHTML = '<a href="/">Trang chủ</a> <span>›</span> ' +
      '<a href="/#thu-vien">Thư viện</a> <span>›</span> <b>Tất cả ' + kindLabel().toLowerCase() + '</b>';
    document.querySelector('#ppTitle').textContent = 'Tất cả ' + kindLabel().toLowerCase();
    document.querySelector('#ppSub').textContent = names.length + ' ' + kindLabel().toLowerCase();
    document.querySelector('#ppGrid').innerHTML =
      (missQ ? '<div class="empty" style="grid-column:1/-1">Không tìm thấy “' + esc(missQ) + '” — hiện tất cả ' + kindLabel().toLowerCase() + '.</div>' : '') +
      names.map(function (name) {
        var rows = (by[name] || []).sort(function (a, b) {
          return String(b.updated || '').localeCompare(String(a.updated || ''));
        });
        var thumbs = rows.slice(0, 3).map(function (n) {
          var im = n.thumb || n.slide || '';
          return im ? '<img src="' + esc(im) + '"' + CZ.coverFB(n, im) + ' alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '';
        }).join('');
        return '<a class="pcard" href="' + personURL(name) + '" data-name="' + esc(CZ.slugify(name)) + '">' +
          '<span class="pth">' + thumbs + '</span>' +
          '<span class="pbody"><b>' + esc(name) + '</b>' +
          '<span class="pmeta">' + esc(statusLine(rows)) + '</span></span></a>';
      }).join('');
    bindFilter(names.length);
    setHead('Tất cả ' + kindLabel().toLowerCase(), 'Danh sách ' + kindLabel().toLowerCase() + ' trên ssochuz library.');
    if (CZ.reveal) CZ.reveal();
  }
  /* Registry về mà thư viện vẫn TRẮNG: đừng báo lỗi ngay, cũng đừng để trang đứng
     ở “Đang tải…”. Máy từng dính lỗi còn giữ bản {lib: []} ở ba chỗ (localStorage,
     cờ cấm Worker 10 phút, cache của service worker) nên đọc lại suông vẫn ra
     trắng — phải DỌN cả ba rồi đọc lại. Tự làm đúng 1 lần; vẫn trắng mới báo lỗi,
     và báo kèm nút “Thử lại” chạy thật. */
  var healed = false;
  function reloadData() {
    var sub = document.querySelector('#ppSub');
    if (sub) sub.textContent = 'Đang đọc lại dữ liệu…';
    var grid = document.querySelector('#ppGrid');
    if (grid) grid.innerHTML = '';
    var go = CZ.purgeRegistry ? CZ.purgeRegistry() : Promise.resolve();
    return go.then(function () { return CZ.registry(true); }, function () { return CZ.registry(true); })
      .then(paint, paint);
  }
  function paintFail() {
    if (!healed) { healed = true; return reloadData(); }
    var sub = document.querySelector('#ppSub');
    if (sub) sub.textContent = 'Chưa đọc được thư viện (nguồn dữ liệu: ' + (window.CZ_SRC || 'không rõ') + ').';
    var grid = document.querySelector('#ppGrid');
    if (grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">' +
      'Chưa tải được dữ liệu — kiểm tra kết nối rồi bấm Thử lại.' +
      '<div style="margin-top:14px"><button class="btn pri" id="ppRetry" type="button">Thử lại</button></div></div>';
    var b = document.querySelector('#ppRetry');
    if (b) b.onclick = function () { b.disabled = true; return reloadData(); };
  }
  /* danh sách: trang tác giả dùng bộ vẽ "kệ sách" mới, /couple/ giữ bản cũ */
  function renderList(missQ) {
    if (KIND === 'author' && PP.ready()) { PP.show(missQ); return; }
    renderAll(missQ);
  }
  function paint() {
    var lib = CZ.lib(), q = readQ();
    if (!lib.length) { paintFail(); return; }
    healed = false;
    if (!q) { renderList(''); return; }
    var name = findName(lib, q);
    if (name) renderOne(name);
    else renderList(q);
  }
  function init(kind) {
    KIND = kind === 'couple' ? 'couple' : 'author';
    CZ.mountShell({ active: KIND === 'couple' ? 'couples' : 'authors' });
    /* registry (KV → cache → file tĩnh) về mới có dữ liệu để vẽ */
    CZ.registry().then(function () { paint(); }).catch(function () { paint(); });
    /* đổi hash tay thì vẽ lại (link ?q= thường tải lại trang nên không cần popstate) */
    window.addEventListener('hashchange', paint);
  }
  /* ======================================================================
     DANH SÁCH TÁC GIẢ (r95) — "kệ sách tác giả"
     ----------------------------------------------------------------------
     Bốn phần: tìm kiếm + chip sắp xếp/lọc · 3 tác giả nổi bật (sách 3D lớn)
     · chỉ mục A–Z dính đỉnh · lưới thẻ gom theo chữ cái (hoặc lưới phẳng khi
     đang tìm/lọc/sắp theo số truyện).

     Dữ liệu: chỉ CZ.lib() — không thêm API, không đổi schema. Mỗi mục tính
     sẵn số truyện theo từng trạng thái để dựng badge.

     Trạng thái nằm trên query string để chia sẻ link được:
        ?s=<từ khoá>   ?sort=az|count|new   ?st=run,soon,done
     `?q=` VẪN là "mở đúng một tác giả" như cũ — đường dẫn đó không đổi.
     ====================================================================== */
  var PP = (function () {
    var AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    var ST = ['run', 'soon', 'done'];
    var SORTS = ['az', 'count', 'new'];
    var ST_LABEL = { run: 'Đang cập nhật', soon: 'Sắp ra mắt', done: 'Hoàn thành' };
    var q = '', sort = 'az', stv = '', miss = '', data = [];
    var bound = false, timer = null, spy = 0, curLetter = '', jumpTo = 0;

    function el(s) { return document.querySelector(s); }
    function ready() { return !!el('#ppAZ'); }

    /* chữ cái đầu sau khi bỏ dấu; không phải A–Z thì vào nhóm "#" */
    function letterOf(name) {
      var s = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D').trim();
      var c = s ? s.charAt(0).toUpperCase() : '';
      return /[A-Z]/.test(c) ? c : '#';
    }
    function groupId(L) { return 'ppL-' + (L === '#' ? 'num' : L); }
    /* "2026-08-28" → "28-08" */
    function dmy(s) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
      return m ? m[3] + '-' + m[2] : '';
    }

    /* gom tác giả từ thư viện; CZ đã chuẩn hoá tên nên không lệch hoa/thường */
    function buildIndex(lib) {
      var map = {}, out = [];
      lib.forEach(function (n) {
        fields(n).forEach(function (name) {
          var e = map[name];
          if (!e) {
            e = map[name] = { name: name, slug: CZ.slugify(name), books: [], st: { done: 0, run: 0, soon: 0 } };
            out.push(e);
          }
          e.books.push(n);
        });
      });
      out.forEach(function (e) {
        e.books.sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); });
        e.count = e.books.length;
        e.updated = String((e.books[0] || {}).updated || '');
        e.books.forEach(function (b) {
          var k = CZ.statusCls(b.status);
          if (e.st[k] == null) e.st[k] = 0;
          e.st[k]++;
        });
        /* trạng thái hiển thị = trạng thái nhiều truyện nhất; hoà thì lấy của
           truyện mới nhất. Bảng đầy đủ nằm trong title của ô. */
        var best = '', bestN = -1;
        ST.forEach(function (k) {
          if (e.st[k] > bestN) { bestN = e.st[k]; best = k; }
        });
        e.key = best;
        e.cover = CZ.coverSrc(e.books[0]);
        e.title = e.count + ' truyện' + ST.filter(function (k) { return e.st[k] > 0; })
          .map(function (k) { return ' · ' + e.st[k] + ' ' + ST_LABEL[k].toLowerCase(); }).join('');
        e.letter = letterOf(e.name);
      });
      return out;
    }

    function rowHTML(e) {
      var src = e.cover;
      return '<a class="ppr pacard" href="' + personURL(e.name) + '" data-name="' + esc(e.slug) + '">' +
        '<span class="ppcv">' + (src
          ? '<img src="' + esc(src) + '"' + CZ.coverFB(e.books[0], src) +
            ' alt="" width="36" height="52" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
          : '') + '</span>' +
        '<span class="ppn">' + esc(e.name) + '</span>' +
        '<span class="ppsm">' +
          '<span class="ppc">' + e.count + ' truyện</span>' +
          (e.updated ? '<span class="ppd">' + dmy(e.updated) + '</span>' : '<span class="ppd"></span>') +
          '<span class="pps ' + e.key + '" title="' + esc(e.title) + '">' +
            ST_LABEL[e.key] + '</span>' +
        '</span></a>';
    }
    /* ---- banner “sạp báo” ------------------------------------------------
       Số liệu đi vào “sạp nhãn” (4 ô), bìa của 5 tác giả nhiều truyện nhất
       đi vào quạt bên phải — đúng cách banner trang chủ bày bìa. Quạt là bàn
       tay vào truyện, không phải trang trí: mỗi bìa là một liên kết. */
    function paintStand() {
      var n = data.length, books = 0, run = 0, up = '';
      data.forEach(function (e) {
        books += e.count;
        if (e.st.run > 0) run++;
        if (e.updated && e.updated > up) up = e.updated;
      });
      var set = function (id, v) { var el2 = el(id); if (el2) el2.textContent = v; };
      set('#ppStN', String(n));
      set('#ppStB', String(books));
      set('#ppStRun', String(run));
      set('#ppStUp', up ? dmy(up) : '—');

      var fan = el('#ppFan');
      if (!fan) return;
      var top = data.filter(function (e) { return !!e.cover; })
        .slice().sort(function (a, b) { return (b.count - a.count) || a.slug.localeCompare(b.slug, 'vi'); })
        .slice(0, 5);
      fan.innerHTML = top.map(function (e, i) {
        return '<a href="' + personURL(e.name) + '" data-pos="' + i + '"' +
          ' aria-label="' + esc(e.name + ' — ' + e.count + ' truyện') + '"' +
          ' title="' + esc(e.name + ' · ' + e.count + ' truyện') + '">' +
          '<img src="' + esc(e.cover) + '"' + CZ.coverFB(e.books[0], e.cover) +
          ' alt="" width="292" height="438" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>';
      }).join('');
      var cap = el('#ppFanCap');
      if (cap) {
        /* trên điện thoại phần "— N truyện" bị ẩn (không đủ chỗ), xem pp.css */
        cap.innerHTML = top.length
          ? '<b>01</b> · <span class="cn">' + esc(top[0].name) + '</span>' +
            '<span class="cc"> — ' + top[0].count + ' truyện</span>'
          : '';
      }
    }

    function emptyHTML() {
      return '<div class="ppempty"><b>Không có tác giả nào khớp</b>' +
        '<p>Thử từ khoá khác, hoặc bỏ bộ lọc trạng thái.</p>' +
        '<button type="button" data-ppclear>Xoá bộ lọc</button></div>';
    }

    function cmp(mode) {
      return function (a, b) {
        if (mode === 'count') return (b.count - a.count) || a.slug.localeCompare(b.slug, 'vi');
        if (mode === 'new') return String(b.updated).localeCompare(String(a.updated)) ||
          a.slug.localeCompare(b.slug, 'vi');
        return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
      };
    }

    /* đọc/ghi trạng thái lên query string (không đụng ?q= của trang tác giả) */
    function readState() {
      var sq = CZ.qs('s'); if (sq != null) q = String(sq);
      var ss = String(CZ.qs('sort') || '');
      sort = SORTS.indexOf(ss) >= 0 ? ss : 'az';
      var sx = String(CZ.qs('st') || '').split(',')[0];
      stv = ST.indexOf(sx) >= 0 ? sx : '';
    }
    function sync() {
      try {
        var u = new URL(location.href);
        if (q) u.searchParams.set('s', q); else u.searchParams.delete('s');
        if (sort !== 'az') u.searchParams.set('sort', sort); else u.searchParams.delete('sort');
        if (stv) u.searchParams.set('st', stv); else u.searchParams.delete('st');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (e) {}
    }
    function mark() {
      var so = el('#ppSort'), st = el('#ppSt'), cl = el('#ppClear');
      if (so) so.value = sort;
      if (st) st.value = stv;
      if (cl) cl.hidden = !q && !stv && sort === 'az';
    }

    /* ---- chỉ mục chữ cái ------------------------------------------------- */
    function setCur(L) {
      if (L === curLetter) return;
      curLetter = L;
      var azin = el('#ppAZin');
      if (!azin) return;
      Array.prototype.forEach.call(azin.querySelectorAll('button[data-l]'), function (b) {
        if (b.getAttribute('data-l') === L) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      var on = azin.querySelector('button[aria-current="true"]');
      if (on && azin.scrollWidth > azin.clientWidth + 2) {
        azin.scrollLeft = Math.max(0, on.offsetLeft - azin.clientWidth / 2 + on.offsetWidth / 2);
      }
    }
    function spyOn() {
      if (spy) return;
      spy = 1;
      window.addEventListener('scroll', function () {
        if (spy !== 1) return;
        spy = 2;
        requestAnimationFrame(function () {
          spy = 1;
          /* vừa bấm một chữ cái: trong ~1s tới, giữ đúng chữ đó thay vì để
             con trỏ chạy theo quán tính của cú cuộn mượt */
          if (jumpTo && Date.now() < jumpTo) return;
          var az = el('#ppAZ');
          if (!az || az.hidden) return;
          var groups = document.querySelectorAll('#ppGrid .ppg[id]');
          if (!groups.length) return;
          var y = az.getBoundingClientRect().height + 10, cur = groups[0].id;
          Array.prototype.forEach.call(groups, function (g) {
            if (g.getBoundingClientRect().top <= y) cur = g.id;
          });
          setCur(cur.replace('ppL-', '').replace('num', '#'));
        });
      }, { passive: true });
    }

    function apply() {
      var root = el('#ppGrid');
      if (!root) return;
      var qq = CZ.slugify(q);
      var list = data.filter(function (e) {
        if (qq && e.slug.indexOf(qq) === -1) return false;
        return !stv || e.st[stv] > 0;
      });
      list.sort(cmp(sort));
      var filtered = !!qq || !!stv;
      var grouped = sort === 'az' && !filtered;

      var sub = el('#ppSub');
      if (sub) {
        sub.textContent = filtered
          ? ('Tìm thấy ' + list.length + ' / ' + data.length + ' tác giả')
          : 'Tất cả người viết có truyện trong thư viện.';
      }

      /* chỉ mục A–Z: chỉ có nghĩa khi đang gom theo chữ cái */
      var az = el('#ppAZ'), azin = el('#ppAZin');
      if (az && azin) {
        if (!grouped || !list.length) az.hidden = true;
        else {
          var have = {};
          list.forEach(function (e) { have[e.letter] = 1; });
          azin.innerHTML = AZ.concat(['#']).map(function (L) {
            return '<button type="button" data-l="' + L + '"' + (have[L] ? '' :
              ' class="off" disabled aria-hidden="true"') + '>' + L + '</button>';
          }).join('');
          az.hidden = false;
          curLetter = '';
          setCur(list[0].letter);
        }
      }

      var cols = el('#ppCols');
      if (cols) cols.hidden = !grouped;

      /* thân danh mục */
      root.setAttribute('data-mode', 'pp');
      var note = miss ? '<p class="ppnote">Không tìm thấy “' + esc(miss) +
        '” — đang hiện tất cả tác giả.</p>' : '';
      if (!list.length) {
        root.innerHTML = note + emptyHTML();
      } else if (grouped) {
        var buckets = {}, order = [];
        list.forEach(function (e) {
          if (!buckets[e.letter]) { buckets[e.letter] = []; order.push(e.letter); }
          buckets[e.letter].push(e);
        });
        order.sort(function (a, b) { return a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b); });
        root.innerHTML = note + order.map(function (L) {
          var rows = buckets[L];
          return '<section class="ppg" id="' + groupId(L) + '">' +
            '<span class="l">' + (L === '#' ? '#' : L) + '</span>' +
            '<span class="c">' + rows.length + ' tác giả</span><span class="r"></span></section>' +
            rows.map(rowHTML).join('');
        }).join('');
      } else {
        root.innerHTML = note + list.map(rowHTML).join('');
      }
      spyOn();
    }

    function clearAll() {
      q = ''; sort = 'az'; stv = '';
      var qi = el('#ppQ'); if (qi) qi.value = '';
      mark(); apply(); sync();
    }

    /* ảnh bìa hỏng: bỏ ảnh, giữ ô nền --surf2 (không hiện icon vỡ) */
    function onImgError(ev) {
      var im = ev.target;
      if (!im || im.tagName !== 'IMG') return;
      im.removeAttribute('src');
      im.style.display = 'none';
    }

    function bind() {
      if (bound) return;
      bound = true;
      var qi = el('#ppQ');
      if (qi) {
        qi.addEventListener('input', function () {
          q = qi.value;
          clearTimeout(timer);
          timer = setTimeout(function () { mark(); apply(); sync(); }, 90);
        });
      }
      var so = el('#ppSort');
      if (so) so.addEventListener('change', function () { sort = so.value; mark(); apply(); sync(); });
      var st = el('#ppSt');
      if (st) st.addEventListener('change', function () { stv = st.value; mark(); apply(); sync(); });
      var cl = el('#ppClear');
      if (cl) cl.addEventListener('click', clearAll);
      var az = el('#ppAZ');
      if (az) {
        az.addEventListener('click', function (ev) {
          var b = ev.target.closest('button[data-l]');
          if (!b || b.disabled) return;
          var g = document.getElementById(groupId(b.getAttribute('data-l')));
          if (!g) return;
          var y = g.getBoundingClientRect().top + window.pageYOffset - az.getBoundingClientRect().height - 8;
          jumpTo = Date.now() + 1000;
          window.scrollTo({ top: y, behavior: CZ.reduce ? 'auto' : 'smooth' });
          setCur(b.getAttribute('data-l'));
        });
      }
      var grid = el('#ppGrid');
      if (grid) {
        grid.addEventListener('click', function (ev) {
          if (ev.target.closest('[data-ppclear]')) { clearAll(); return; }
        });
        grid.addEventListener('error', onImgError, true);
      }
    }

    function show(missQ) {
      if (!ready()) return;
      miss = missQ || '';
      data = buildIndex(CZ.lib());
      readState();
      bind(); mark();
      paintStand();
      ['#ppSpec', '#ppFanWrap'].forEach(function (s2) {
        var n2 = el(s2); if (n2) n2.hidden = false;
      });
      var tools = el('#ppTools'); if (tools) tools.hidden = false;
      var wrap = el('#ppQWrap'); if (wrap) wrap.removeAttribute('hidden');
      var qi = el('#ppQ'); if (qi) qi.value = q;
      apply();
      sync();
    }
    function hide() {
      ['#ppTools', '#ppAZ', '#ppCols', '#ppSpec', '#ppFanWrap'].forEach(function (s) {
        var n = el(s); if (n) n.hidden = true;
      });
      var g = el('#ppGrid'); if (g) g.removeAttribute('data-mode');
    }
    return { ready: ready, show: show, hide: hide };
  })();

  window.CZPeople = { init: init };
})();
