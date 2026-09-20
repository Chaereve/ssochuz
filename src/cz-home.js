/* ============================================================================
   ssochuz · TRANG CHỦ (bố cục hero landing)
   ----------------------------------------------------------------------------
   Thứ tự trang: hero → dải số liệu → My Space (đang đọc dở / tủ truyện) →
   Mới cập nhật → Thư viện → Bình chọn nhiều nhất → Lịch ra chương.
   Mỗi mục là MỘT KHỐI RIÊNG (không gom vào tab “Khám phá” như trước) nên cuộn
   là thấy hết, bấm menu là nhảy đúng khối, và mỗi khối tự đứng một mình.
   Số liệu đọc/bình chọn lấy từ Worker (KV); không đọc được thì KHÔNG hiện số nào.
   ========================================================================== */
(function () {
  'use strict';
  if (location.hash === '#ban-doc') { location.replace('/my-space'); return; }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = CZ.esc, ic = CZ.icon, num = CZ.num;

  /* icon cho các ô <span data-ic="..."> viết trong HTML */
  function paintIcons(root) {
    $$('[data-ic]', root || document).forEach(function (el) {
      el.outerHTML = ic(el.dataset.ic, el.dataset.icsz || '');
    });
  }
  paintIcons();

  var state = { tab: 'all', adult: false, year: '', author: '', couple: '', q: '', sort: 'new', view: 'grid', page: 1, per: 24 };

  /* ======================= HERO ======================================== */
  var hero = { list: [], i: 0, timer: null, auto: 8000, bg: 0 };
  function pad2(k) { return (k < 10 ? '0' : '') + k; }
  /* nền mờ phía sau lấy từ chính ảnh bìa; hai lớp chồng nhau để đổi mờ dần */
  function heroBg(im) {
    var box = $('#heroBg');
    if (!box || !box.children.length || CZ.reduce) return;
    var k = hero.bg ? 0 : 1;
    box.children[k].style.backgroundImage = im ? 'url("' + im + '")' : 'none';
    box.children[k].classList.toggle('on', !!im);
    box.children[hero.bg].classList.remove('on');
    hero.bg = k;
  }
  function heroSlide(n, i) {
    var p = CZ.progress(n), resume = p || 1, tot = n.chapters || 0;
    var inShelf = CZ.inShelf(n), im = n.thumb || n.slide || '';
    var pct = tot && p ? Math.min(100, Math.round(p / tot * 100)) : 0;
    var eyebrow = (n._reason && n._reason.trim()) || (i === 0 ? 'Nổi bật hôm nay' : 'Đề xuất cho bạn');
    return '<article class="slide' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" aria-label="' + esc(n.title) + '">' +
      '<div class="col">' +
        '<div class="info">' +
          '<span class="eyebrow">' + esc(eyebrow) + '</span>' +
          '<h1><a href="' + esc(CZ.storyURL(n.slug)) + '">' + esc(n.title) + '</a></h1>' +
          '<div class="meta">' +
            '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(CZ.statusLabel(n.statusCls || n.status)) + '</span>' +
            (n.locked ? '<span class="pill lock" title="Truyện có mật mã — cần mật mã để đọc">' + ic('lock', 'i-s') + 'Có mật mã</span>' : '') +
            (n.fresh ? '<span class="badge-new">NEW</span>' : '') +
            '<span>' + ic('book', 'i-s') + ' <b>' + esc(CZ.countText(n)) + '</b></span>' +
            (n.author ? '<span>' + ic('pen', 'i-s') + ' ' + esc(n.author) + '</span>' : '') +
            (n.couple ? '<span>' + ic('users', 'i-s') + ' ' + esc(n.couple) + '</span>' : '') +
            (n.updated ? '<span>' + ic('refresh', 'i-s') + ' ' + esc(CZ.timeAgo(n.updated)) + '</span>' : '') +
          '</div>' +
          /* hero trang chủ chỉ cần đoạn mở đầu: mô tả đầy đủ (có thể tới 3.300 ký
             tự) nằm trong tệp chương và dành cho trang truyện */
          '<p class="syn">' + esc(n.syn || n.synFull || '') + '</p>' +
          (pct ? '<div class="prog"><span class="pb"><i style="width:' + pct + '%"></i></span>' +
            '<span>đang đọc <b>chương ' + p + '</b>' + (tot ? ' / ' + tot : '') + ' · ' + pct + '%</span></div>' : '') +
          '<div class="btn-row">' +
            (n.canRead
              ? (n.locked
                /* truyện khóa mật mã: dẫn về trang truyện (có chốt nhập mật mã),
                   không dẫn thẳng vào chương — mở chương là lộ nội dung */
                ? '<a class="btn pri lg" href="' + esc(CZ.storyURL(n.slug)) + '" title="Truyện này có mật mã — vào trang truyện để nhập mật mã">' + ic('lock', 'i-s') + 'Nhập mật mã để đọc</a>'
                : '<a class="btn pri lg" href="' + esc(CZ.readURL(n.slug, resume)) + '" title="' +
                    (p ? 'Mở đúng chỗ bạn đang đọc dở' : 'Bắt đầu từ chương đầu') + '">' + ic('play', 'i-s') +
                  (p ? 'Đọc tiếp' : 'Đọc từ đầu') + '</a>')
              : '<button class="btn lg off" disabled>' + ic('clock', 'i-s') + 'Sắp ra mắt</button>') +
            '<a class="btn lg" href="' + esc(CZ.storyURL(n.slug)) + '" title="Thông tin bộ truyện, mục lục, bình luận">' + ic('info', 'i-s') + 'Thông tin</a>' +
            '<button class="btn lg' + (inShelf ? ' on' : '') + '" data-shelf="' + esc(n.slug) + '" aria-pressed="' + (inShelf ? 'true' : 'false') + '" title="Lưu vào tủ truyện (icon tủ sách)">' +
              ic('shelf', 'i-s') + '<span>' + (inShelf ? 'Đã lưu' : 'Lưu vào tủ') + '</span></button>' +
          '</div>' +
          '<div class="keys">' +
            '<span><kbd>←</kbd><kbd>→</kbd> đổi truyện</span>' +
            '<span><kbd>⌘</kbd><kbd>K</kbd> tìm nhanh</span>' +
            (n.canRead ? '<span>' + ic('book', 'i-s') + ' đọc ngay trên web</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="posterwrap">' +
          '<span class="idx" aria-hidden="true">' + pad2(i + 1) + '</span>' +
          '<a class="poster" href="' + esc(CZ.storyURL(n.slug)) + '" aria-label="' + esc(n.title) + '">' +
            (im ? '<img src="' + esc(im) + '"' + CZ.coverFB(n, im) + ' alt="Bìa ' + esc(n.title) + '" width="300" height="450"' +
              (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async" referrerpolicy="no-referrer">' : '') +
            '<span class="gloss"></span>' +
            (n.is18 ? '<span class="b18">18+</span>' : '') +
            (n.locked ? '<span class="lock-cover" title="Truyện có mật mã" aria-label="Truyện có mật mã">' + ic('lock', 'i-s') + '</span>' : '') +
            (n.fresh ? '<span class="nw-bookmark"><span>NEW</span></span>' : '') +
          '</a>' +
          '<span class="pcap">' + (n.author || n.couple ? '<b>' + esc(n.author || n.couple) + '</b>' : '') +
            (n.year ? (n.author || n.couple ? ' · ' : '') + 'năm ' + esc(n.year) : '') + '</span>' +
        '</div>' +
      '</div></article>';
  }
  /* vẽ lại đúng một bộ: lớp .on, chấm, dải bìa, số đếm và nền mờ */
  function paintSlide(i) {
    var all = $$('#stage .slide');
    if (!all.length) return;
    hero.i = i;
    all.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    $$('#hDots button').forEach(function (b, k) { b.classList.toggle('on', k === i); });
    $$('#hStrip button').forEach(function (b, k) { b.classList.toggle('on', k === i); });
    var c = $('#hCount');
    if (c) c.textContent = (i + 1) + '/' + hero.list.length;
    var n = hero.list[i] || {};
    heroBg(n.thumb || n.slide || '');
  }
  function heroPaint(animate) {
    var stage = $('#stage');
    if (!stage) return;
    stage.innerHTML = hero.list.map(heroSlide).join('');
    $('#hDots').innerHTML = hero.list.map(function (n, k) {
      return '<button data-go="' + k + '" class="' + (k === hero.i ? 'on' : '') + '" role="tab" aria-label="' + esc(n.title) + '"></button>';
    }).join('');
    $('#hStrip').innerHTML = hero.list.map(function (n, k) {
      var im = n.thumb || n.slide;
      return '<button data-go="' + k + '" class="' + (k === hero.i ? 'on' : '') + '" title="' + esc(n.title) + '">' +
        (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</button>';
    }).join('');
    paintSlide(hero.i);
    if (animate) restart();
  }
  /* đổi bộ nổi bật: bộ cũ trượt sang trái rồi mờ đi (giữ lại một bản .ghost),
     bộ mới trượt vào từ bên phải; chiều cao khối được khoá nên không nhảy bố cục */
  function goSlide(i) {
    if (!hero.list.length) return;
    i = (i + hero.list.length) % hero.list.length;
    var stage = $('#stage');
    if (i === hero.i || !stage) { if (i !== hero.i) paintSlide(i); restart(); return; }
    if (!CZ.reduce) {
      var all = $$('.slide', stage), cur = all[hero.i];
      if (cur && cur.cloneNode) {
        var ghost = cur.cloneNode(true);
        ghost.className = 'slide ghost';
        ghost.setAttribute('aria-hidden', 'true');
        var h = stage.offsetHeight;
        if (h) stage.style.height = h + 'px';
        stage.appendChild(ghost);
        requestAnimationFrame(function () { ghost.classList.add('out'); });
        setTimeout(function () {
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          if (!$$('.slide.ghost', stage).length) stage.style.height = '';
        }, 480);
      }
    }
    paintSlide(i);
    restart();
  }
  function restart() {
    var bar = $('#heroBar');
    if (!bar) return;
    bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)';
    clearInterval(hero.timer);
    if (CZ.reduce || document.hidden) return;
    requestAnimationFrame(function () {
      /* transform thay cho width: vạch này chạy suốt thời gian chờ, để width thì
         mỗi khung hình một lần layout + paint ngay giữa lúc người dùng đang cuộn. */
      bar.style.transition = 'transform ' + hero.auto + 'ms linear';
      bar.style.transform = 'scaleX(1)';
    });
    hero.timer = setInterval(function () { goSlide(hero.i + 1); }, hero.auto);
  }
  function heroInit() {
    var stage = $('#stage');
    if (!stage || !hero.list.length) return;
    heroPaint(false);
    $('#hPrev').innerHTML = ic('left', 'i-s'); $('#hNext').innerHTML = ic('right', 'i-s');
    $('#hPrev').addEventListener('click', function () { goSlide(hero.i - 1); });
    $('#hNext').addEventListener('click', function () { goSlide(hero.i + 1); });
    document.addEventListener('click', function (e) {
      var d = e.target.closest('[data-go]');
      if (d) goSlide(+d.dataset.go);
      var s = e.target.closest('[data-shelf]');
      if (s) {
        var n = CZ.findLib(s.dataset.shelf);
        if (!n) return;
        var on = CZ.toggleShelf(n);
        s.setAttribute('aria-pressed', on ? 'true' : 'false');
        s.classList.toggle('on', on);
        CZ.pop(s);
        s.querySelector('span').textContent = on ? 'Đã lưu' : 'Lưu vào tủ';

        CZ.toast(on ? 'Đã thêm vào tủ truyện' : 'Đã bỏ khỏi tủ truyện');
      }
    });
    $('#hero').addEventListener('mouseenter', function () { clearInterval(hero.timer); $('#heroBar').style.transition = 'none'; });
    $('#hero').addEventListener('mouseleave', restart);
    document.addEventListener('visibilitychange', function () { if (document.hidden) clearInterval(hero.timer); else restart(); });
    document.addEventListener('keydown', function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return;
      if (e.key === 'ArrowRight') goSlide(hero.i + 1);
      if (e.key === 'ArrowLeft') goSlide(hero.i - 1);
    });
    /* vuốt ngang trên điện thoại */
    var x0 = null, y0 = null;
    stage.addEventListener('touchstart', function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) goSlide(hero.i + (dx < 0 ? 1 : -1));
      x0 = y0 = null;
    }, { passive: true });
    restart();
  }

  /* ======================= DẢI SỐ LIỆU ================================= */
  function renderFacts(lib) {
    var chap = lib.reduce(function (a, n) { return a + n.chapters; }, 0);
    var done = lib.filter(function (n) { return n.statusCls === 'done'; }).length;
    var soon = lib.filter(function (n) { return n.statusCls === 'soon'; }).length;
    var facts = [
      { n: lib.length, l: 'Bộ truyện' },
      { n: chap, l: 'Chương đã đăng' },
      { n: done, l: 'Hoàn thành' },
      { n: soon, l: 'Sắp ra mắt' }
    ];
    $('#facts').innerHTML = facts.map(function (f) {
      return '<div class="f"><b data-count="' + f.n + '">0</b><span>' + f.l + '</span></div>';
    }).join('');
    CZ.scaleFacts($('#facts'));
  }

  /* ======================= MỚI CẬP NHẬT ================================ */
  function renderNew() {
    var rows = CZ.lib().slice().sort(function (a, b) {
      return String(b.updated || '').localeCompare(String(a.updated || '')) || (b.chapters - a.chapters);
    });
    CZ.mountRail($('#newRail'), rows.slice(0, 12));
  }

  /* navCounts removed per request - badges caused overlap and clutter */
  function navCounts() {
    // intentionally empty - no count badges in header
  }

  /* Ranking uses period counters only: never mix lifetime totals or recency. */
  function statsOn() { return !!(CZ._memo.stats && CZ._memo.stats.on); }
  function rankTabs() {
    return [{ k: 'day', l: 'Ngày' }, { k: 'week', l: 'Tuần' }, { k: 'month', l: 'Tháng' }];
  }
  var rankBy = 'week', rankMode = 'views';
  function positive(value) { var n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; }
  function renderRecommended() {
    var rail = $('#worthRail');
    if (!rail) return;
    var rows = statsOn() ? CZ.lib().map(function (n) {
      var s = CZ.statsOf(n) || {};
      return { n: n, rating: positive(s.rating), count: positive(s.ratingCount) };
    }).filter(function (r) { return r.rating > 0 && r.rating <= 5 && r.count > 0; })
      .sort(function (a, b) { return b.rating - a.rating || b.count - a.count || a.n.slug.localeCompare(b.n.slug); }).slice(0, 12) : [];
    if (!rows.length) {
      rail.innerHTML = statsOn() ? '<p class="empty">Chưa có truyện được đánh giá sao.</p>' : '';
      return;
    }
    CZ.mountRail(rail, rows.map(function (r) { return r.n; }));
    rail.querySelectorAll('.card').forEach(function (card, i) {
      var score = document.createElement('span');
      score.className = 'worth-score';
      score.textContent = '★ ' + rows[i].rating.toFixed(1) + '/5 · ' + num(rows[i].count) + ' đánh giá';
      card.appendChild(score);
    });
  }
  function renderRank() {
    var on = statsOn(), tabs = rankTabs();
    $('#bxh').hidden = false;
    $('#rankModes').querySelectorAll('button').forEach(function (b) {
      var active = b.dataset.mode === rankMode;
      b.classList.toggle('on', active); b.setAttribute('aria-pressed', String(active));
    });
    $('#rankTabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (t.k === rankBy ? ' on' : '') + '" data-k="' + t.k + '" aria-pressed="' + (t.k === rankBy) + '">' + t.l + '</button>';
    }).join('');
    var key = rankMode + ({ day: 'Day', week: 'Week', month: 'Month' }[rankBy]);
    var rows = on ? CZ.lib().map(function (n) { return { n: n, score: positive((CZ.statsOf(n) || {})[key]) }; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.n.slug.localeCompare(b.n.slug); }).slice(0, 8) : [];
    $('#rankSummary').textContent = (rankMode === 'views' ? 'Top View' : 'Top Vote') + ' · ' + tabs.find(function (t) { return t.k === rankBy; }).l;
    var peak = rows.length ? rows[0].score : 0;
    $('#rank').innerHTML = rows.map(function (row, i) {
      var n = row.n, ratio = peak ? Math.max(.12, row.score / peak) : 0;
      return '<a class="rank" href="' + esc(CZ.storyURL(n.slug)) + '" style="--d:' + (i * 55) + 'ms;--w:' + ratio.toFixed(3) + '">' +
        '<span class="n' + (i < 3 ? ' top t' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
        '<span class="rk-th' + (n.thumb ? '' : ' noimg') + '">' +
        (n.thumb ? '<img src="' + esc(n.thumb) + '"' + CZ.coverFB(n, n.thumb) + ' alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>' +
        '<span class="tt"><b>' + esc(n.title) + '</b><span>' + esc(n.author || n.couple || '') + '</span></span>' +
        '<span class="v"><b>' + num(row.score) + '</b>' + (rankMode === 'views' ? ' lượt đọc' : ' lượt thích') + '</span><i class="bar" aria-hidden="true"></i></a>';
    }).join('') || (on ? '<p class="empty">Chưa có hoạt động trong khoảng thời gian này.</p>' : '');
    renderRecommended();
    if (CZ.inkAll) CZ.inkAll();
  }
  $('#rankTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]'); if (!b) return;
    rankBy = b.dataset.k; renderRank();
    $('#rankTabs [data-k="' + rankBy + '"]').focus({ preventScroll: true });
  });
  $('#rankModes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b) return;
    rankMode = b.dataset.mode; renderRank();
  });

  /* ======================= LỊCH RA CHƯƠNG ============================== */
  function parseDays(s) {
    s = String(s || '').trim();
    if (!s) return [];
    var parts = s.split(/[,/–—]+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var out = [];
    parts.forEach(function (p) {
      if (/^\d+$/.test(p)) out.push('T' + p);
      else {
        var n = p.match(/(\d+)/);
        if (/chủ|\bcn\b/i.test(p)) out.push('CN');
        else if (n) out.push('T' + n[1]);
        else out.push(p);
      }
    });
    return out;
  }
  function schedFind(it) {
    if (it && it.slug) {
      var hit = CZ.findLib(it.slug);
      if (hit) return hit;
    }
    /* Không đoán theo title: các truyện có tên gần giống nhau từng khiến lịch
       hiển thị nhầm bìa/tựa. Dữ liệu mới bắt buộc dùng slug; title chỉ là
       fallback cho dữ liệu cũ và phải khớp tuyệt đối (không prefix match). */
    var want = String(it && it.title || '').trim().toLowerCase();
    if (!want) return null;
    return CZ.lib().find(function (x) {
      return String(x.title || '').trim().toLowerCase() === want;
    }) || null;
  }
  function renderSched(sch) {
    var el = $('#sched');
    if (!el) return;
    var items = (sch && sch.items) || [];
    var local = ((CZ._memo.reg || {}).schedule || {}).items || [];
    var usable = function (list) {
      return list.filter(function (it) { return !!schedFind(it); });
    };
    if (local.length && usable(items).length < usable(local).length) {
      items = local;
      sch = (CZ._memo.reg || {}).schedule || sch;
    }
    if (!items.length) {
      el.innerHTML = '<div class="empty">Chưa có lịch ra chương.</div>';
      return;
    }
    el.innerHTML = '<div class="schedlist">' + items.map(function (it) {
      var n = schedFind(it);
      var days = parseDays(it.days).map(function (d) { return '<i>' + esc(d) + '</i>'; }).join('');
      var title = (n && n.title) || it.title || '';
      var im = n && (n.thumb || n.slide);
      var href = n ? 'href="' + esc(CZ.storyURL(n.slug)) + '"' : '';
      var meta = n
        ? (n.canRead ? esc(CZ.countText(n)) : CZ.statusLabel(n.statusCls))
        : esc(it.detail || '');
      return '<a class="sched' + (n ? ' clk' : '') + '" ' + href + '>' +
        '<span class="sch-th' + (im ? '' : ' noimg') + '">' +
          (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>' +
        '<span class="sch-days">' + (days || '<i>—</i>') + '</span>' +
        '<span class="sch-info"><b>' + esc(title) + '</b><span>' + meta + '</span></span></a>';
    }).join('') + '</div>' +
      (sch.note ? '<p class="schnote">' + esc(sch.note) + '</p>' : '');
  }
  /* ============== VÌ BẠN ĐÃ ĐỌC X ========================================
     Gợi ý xếp theo CÙNG TÁC GIẢ và CẶP NHÂN VẬT với những bộ người đọc đã đọc.
     Thư viện KHÔNG có trường thể loại (registry chỉ có title, slug, author,
     couple, year, status, chapters, is18, thumb, countLabel, updated, slide,
     syn) nên không thể soi theo thể loại mà không bịa nhãn — vì vậy căn cứ được
     ghi rõ ngay trên giao diện. Toàn bộ chạy trong máy: đọc localStorage rồi
     lọc lib, không gửi gì đi đâu, không ghi KV, không dùng AI. */
  function renderBecause() {
    var el = $('#vi-ban-da-doc'), rail = $('#vbdRail');
    if (!el || !rail) return;
    var dem = {};
    try { dem = CZ.readSlugs ? CZ.readSlugs() : {}; } catch (e) { dem = {}; }
    var lib = [];
    try { lib = CZ.lib() || []; } catch (e2) { lib = []; }
    var by = {};
    lib.forEach(function (n) { if (n && n.slug) by[n.slug] = n; });
    /* sức nặng của từng tác giả / cặp trong các bộ ĐÃ đọc: couple đặc hiệu hơn
       tác giả nên nhân hệ số cao hơn */
    var wA = {}, wC = {}, docNhieu = '', nhieuNhat = 0;
    Object.keys(dem).forEach(function (s) {
      var n = by[s];
      if (!n) return;
      var a = String(n.author || '').trim().toLowerCase();
      var c = String(n.couple || '').trim().toLowerCase();
      if (a) wA[a] = (wA[a] || 0) + dem[s];
      if (c) wC[c] = (wC[c] || 0) + dem[s] * 2;
      if (dem[s] > nhieuNhat) { nhieuNhat = dem[s]; docNhieu = n.title; }
    });
    var ung = [];
    lib.forEach(function (n) {
      if (!n || !n.slug || dem[n.slug]) return;         /* đã đọc thì không gợi ý lại */
      var a = String(n.author || '').trim().toLowerCase();
      var c = String(n.couple || '').trim().toLowerCase();
      var diem = (a && wA[a] ? wA[a] : 0) + (c && wC[c] ? wC[c] : 0);
      if (diem > 0) ung.push({ n: n, diem: diem });
    });
    if (!ung.length) { el.hidden = true; return; }
    ung.sort(function (x, y) {
      return (y.diem - x.diem) ||
        String(y.n.updated || '').localeCompare(String(x.n.updated || ''));
    });
    /* kể đúng căn cứ: liệt kê tác giả/cặp đã khớp kèm số bộ, không nói chung chung */
    var topA = Object.keys(wA).sort(function (x, y) { return wA[y] - wA[x]; }).slice(0, 2);
    var topC = Object.keys(wC).sort(function (x, y) { return wC[y] - wC[x]; }).slice(0, 1);
    var tenA = topA.map(function (k) { return (by[Object.keys(dem).filter(function (s) {
      return by[s] && String(by[s].author || '').trim().toLowerCase() === k;
    })[0]] || {}).author || k; });
    var tenC = topC.map(function (k) { return (by[Object.keys(dem).filter(function (s) {
      return by[s] && String(by[s].couple || '').trim().toLowerCase() === k;
    })[0]] || {}).couple || k; });
    var soBoDaDoc = Object.keys(dem).filter(function (s) { return by[s]; }).length;
    var vi = [];
    if (tenA.length) vi.push('cùng tác giả ' + tenA.map(function (t) { return '“' + esc(t) + '”'; }).join(' và '));
    if (tenC.length) vi.push('cùng cặp ' + tenC.map(function (t) { return '“' + esc(t) + '”'; }).join(' và '));
    $('#vbdTitle').textContent = 'Vì bạn đã đọc' + (docNhieu ? ' ' + docNhieu : '');
    $('#vbdWhy').innerHTML = 'Bạn đã đọc <b>' + soBoDaDoc + '</b> bộ trong thư viện này — ' +
      'đây là những bộ khác ' + vi.join(' và ') + ', bạn chưa đọc. ' +
      'Xếp hạng tính ngay trong máy bạn từ lịch sử đọc, không gửi dữ liệu đi đâu và không dùng AI.';
    el.hidden = false;
    CZ.mountRail(rail, ung.slice(0, 12).map(function (x) { return x.n; }));
  }
  function renderEditorChoice() {
    var el = $('#bien-tap'), rail = $('#editRail');
    if (!el || !rail) return;
    var list = [];
    try { list = CZ.editorChoice ? CZ.editorChoice() : []; } catch(e) { list = []; }
    if (!list || !list.length) {
      // Try fallback from registry raw
      try {
        var reg = CZ._memo && CZ._memo.reg;
        var raw = (reg && (reg.editorChoice || (reg.settings && reg.settings.editorChoice))) || [];
        if (raw && raw.length) {
          var by = {};
          (reg.lib || []).forEach(function(n){ by[n.slug]=n; });
          list = raw.map(function(x){ var sl = typeof x==='string'?x:(x&&x.slug); return by[sl]; }).filter(Boolean).map(CZ.norm);
        }
      } catch(e) {}
    }
    if (!list || !list.length) { el.hidden = true; return; }
    el.hidden = false;
    CZ.mountRail(rail, list.slice(0, 12));
  }

  /* ======================= THƯ VIỆN ==================================== */
  function buildFilters() {
    var lib = CZ.lib();
    var uniq = function (a) { var seen = {}; return a.filter(function (v) { if (!v || seen[v]) return false; seen[v] = 1; return true; }); };
    var years = uniq(lib.map(function (n) { return n.year; })).sort(function (a, b) { return b - a; });
    var authors = uniq(lib.map(function (n) { return n.author; })).sort(function (a, b) { return a.localeCompare(b, 'vi'); });
    var couples = uniq(lib.map(function (n) { return n.couple; })).sort(function (a, b) { return a.localeCompare(b, 'vi'); });
    var fill = function (sel, label, list) {
      sel.innerHTML = '<option value="">' + label + '</option>' + list.map(function (v) {
        return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
      }).join('');
    };
    fill($('#fYear'), 'Mọi năm', years);
    fill($('#fAuthor'), 'Mọi tác giả', authors);
    fill($('#fCouple'), 'Mọi couple', couples);
    var sorts = [['new', 'Mới cập nhật'], ['year-desc', 'Năm mới nhất'], ['year-asc', 'Năm cũ nhất'],
      ['chap-desc', 'Nhiều chương nhất'], ['az', 'Tên A → Z']];
    if (statsOn()) sorts.push(['views', 'Đọc nhiều nhất']);   /* chỉ khi có số thật */
    $('#fSort').innerHTML = sorts.map(function (o) {
      return '<option value="' + o[0] + '">' + o[1] + '</option>';
    }).join('');
    $('#tabs').innerHTML = tabDefs().map(function (t) {
      return '<button class="tab' + (t.k === state.tab ? ' on' : '') + '" data-k="' + t.k + '" role="tab" aria-selected="' +
        (t.k === state.tab) + '">' + t.l + '<span class="ct">' + t.c + '</span></button>';
    }).join('');
    retab();
  }
  function retab() { if (CZ.inkAll) CZ.inkAll(); }
  /* dãy tab chỉ còn TÌNH TRẠNG; nhãn 18+ tách ra nhóm riêng bên cạnh */
  function tabDefs() {
    var lib = CZ.lib();
    var byStatus = function (k) { return lib.filter(function (n) { return n.statusCls === k; }).length; };
    var TABS = [
      { k: 'all', l: 'Tất cả', c: lib.length },
      { k: 'done', l: 'Hoàn thành', c: byStatus('done') },
      { k: 'run', l: 'Đang cập nhật', c: byStatus('run') },
      { k: 'soon', l: 'Sắp ra mắt', c: byStatus('soon') }
    ];
    return TABS.filter(function (t) { return t.k === 'all' || t.c > 0; });
  }
  function tabLabel(k) {
    var t = tabDefs().filter(function (x) { return x.k === k; })[0];
    return t ? t.l : k;
  }
  function filtered() {
    var lib = CZ.lib().slice(), s = state.tab;
    if (s === 'done' || s === 'run' || s === 'soon') lib = lib.filter(function (n) { return n.statusCls === s; });
    if (state.adult) lib = lib.filter(function (n) { return n.is18; });
    if (state.year) lib = lib.filter(function (n) { return String(n.year) === state.year; });
    if (state.author) lib = lib.filter(function (n) { return n.author === state.author; });
    if (state.couple) lib = lib.filter(function (n) { return n.couple === state.couple; });
    if (state.q) {
      var q = state.q.toLowerCase();
      lib = lib.filter(function (n) {
        return n.title.toLowerCase().indexOf(q) >= 0 || String(n.author || '').toLowerCase().indexOf(q) >= 0 ||
          String(n.couple || '').toLowerCase().indexOf(q) >= 0 || String(n.year || '').indexOf(q) >= 0;
      });
    }
    var so = state.sort;
    lib.sort(function (a, b) {
      if (so === 'az') return a.title.localeCompare(b.title, 'vi');
      if (so === 'year-desc') return (b.year - a.year) || a.title.localeCompare(b.title, 'vi');
      if (so === 'year-asc') return (a.year - b.year) || a.title.localeCompare(b.title, 'vi');
      if (so === 'chap-desc') return (b.chapters - a.chapters) || a.title.localeCompare(b.title, 'vi');
      if (so === 'views') {
        var sa = CZ.statsOf(a) || {}, sb = CZ.statsOf(b) || {};
        return ((sb.views || 0) - (sa.views || 0)) || (b.chapters - a.chapters);
      }
      return String(b.updated || '').localeCompare(String(a.updated || '')) || (b.chapters - a.chapters);
    });
    return lib;
  }
  function pageList(total, cur) {
    var out = [];
    if (total <= 7) { for (var i = 1; i <= total; i++) out.push(i); return out; }
    out.push(1); if (cur > 3) out.push('…');
    for (var j = Math.max(2, cur - 1); j <= Math.min(total - 1, cur + 1); j++) out.push(j);
    if (cur < total - 2) out.push('…');
    out.push(total);
    return out;
  }
  function render() {
    syncFilterUI();                      /* dãy tab phải chạy theo trạng thái lọc */
    var list = filtered();
    var total = Math.max(1, Math.ceil(list.length / state.per));
    if (state.page > total) state.page = 1;
    var slice = list.slice((state.page - 1) * state.per, state.page * state.per);
    var grid = $('#grid');
    grid.className = 'grid' + (state.view === 'list' ? ' list-view' : '');
    grid.innerHTML = (slice.length && state.view === 'list' ? CZ.listHead() : '') +
      (slice.length ? slice.map(function (n) { return CZ.card(n, { view: state.view }); }).join('')
      : '<div class="empty" style="grid-column:1/-1"><div class="big">Không có truyện nào khớp</div>Thử bỏ một vài tiêu chí lọc.' +
        '<div class="mt"><button class="btn ghost" id="clrAll">Xoá tất cả lọc</button></div></div>');
    stagger(grid);
    $('#pager').innerHTML = total > 1
      ? '<button class="pg ' + (state.page === 1 ? 'off' : '') + '" data-go="' + (state.page - 1) + '">' + ic('left', 'i-s') + 'Trước</button>' +
        pageList(total, state.page).map(function (p) {
          return p === '…' ? '<span class="pg dots">…</span>'
            : '<button class="pg' + (p === state.page ? ' on' : '') + '" data-go="' + p + '">' + p + '</button>';
        }).join('') +
        '<button class="pg ' + (state.page === total ? 'off' : '') + '" data-go="' + (state.page + 1) + '">Sau' + ic('right', 'i-s') + '</button>'
      : '';
    var picked = [];
    if (state.tab !== 'all') picked.push(['tab', tabLabel(state.tab)]);
    if (state.adult) picked.push(['adult', '18+']);
    ['year', 'author', 'couple'].forEach(function (k) { if (state[k]) picked.push([k, state[k]]); });
    if (state.q) picked.push(['q', '“' + state.q + '”']);
    $('#fpick').innerHTML = picked.length
      ? picked.map(function (p, i) {
        return '<span class="fchip">' + esc(p[1]) + '<span data-rm="' + i + '" title="Bỏ lọc">' + ic('x', 'i-s') + '</span></span>';
      }).join('') + '<button class="btn ghost sm" id="clrAll2">Xoá tất cả lọc</button>'
      : '';
    $('#qClr').classList.toggle('hide', !state.q);
    $('#fcount').innerHTML = '<b>' + list.length + '</b> truyện' +
      (picked.length ? ' · đang lọc ' + picked.length + ' tiêu chí' : '') +
      (total > 1 ? ' · trang ' + state.page + '/' + total : '') +
      /* lọc theo tác giả/couple thì dẫn sang trang riêng của người đó */
      (state.author ? ' · <a href="/tac-gia/?q=' + encodeURIComponent(CZ.slugify(state.author)) + '">Xem tất cả truyện của ' + esc(state.author) + '</a>' : '') +
      (state.couple ? ' · <a href="/couple/?q=' + encodeURIComponent(CZ.slugify(state.couple)) + '">Xem tất cả truyện của ' + esc(state.couple) + '</a>' : '');
    $$('[data-rm]', $('#fpick')).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = picked[+b.dataset.rm][0];
        if (k === 'q') { state.q = ''; $('#q').value = ''; }
        else if (k === 'tab') state.tab = 'all';
        else if (k === 'adult') state.adult = false;
        else state[k] = '';
        syncFilterUI(); state.page = 1; render();
      });
    });
    var clr = $('#clrAll') || $('#clrAll2');
    if (clr) clr.addEventListener('click', clearAll);
    $$('#pager [data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = +b.dataset.go;
        if (p < 1 || p > total || p === state.page) return;
        state.page = p; render();
        $('#thu-vien').scrollIntoView({ behavior: CZ.reduce ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }
  /* thẻ mới hiện ra lần lượt — nhịp 22ms, dừng ở thẻ thứ 14 cho khỏi chờ lâu */
  function stagger(root) {
    if (CZ.reduce || !root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.card'), function (c, i) {
      c.style.setProperty('--d', Math.min(i, 14) * 22 + 'ms');
    });
  }
  function clearAll() {
    state.tab = 'all'; state.adult = false; state.year = state.author = state.couple = state.q = '';
    $('#q').value = ''; syncFilterUI(); state.page = 1; render();
  }
  function syncFilterUI() {
    $$('#tabs .tab').forEach(function (t) {
      var on = t.dataset.k === state.tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('#ageTabs .tab').forEach(function (t) {
      t.classList.toggle('on', state.adult);
      t.setAttribute('aria-pressed', state.adult ? 'true' : 'false');
    });
    $('#fYear').value = state.year; $('#fAuthor').value = state.author; $('#fCouple').value = state.couple;
  }
  var qTimer = null;
  $('#q').addEventListener('input', function (e) {
    clearTimeout(qTimer);
    var v = e.target.value;
    qTimer = setTimeout(function () { state.q = v.trim(); state.page = 1; render(); }, 160);
  });
  $('#q').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.target.value = ''; state.q = ''; state.page = 1; render(); } });
  $('#fYear').addEventListener('change', function (e) { state.year = e.target.value; state.page = 1; render(); });
  $('#fAuthor').addEventListener('change', function (e) { state.author = e.target.value; state.page = 1; render(); });
  $('#fCouple').addEventListener('change', function (e) { state.couple = e.target.value; state.page = 1; render(); });
  $('#fSort').addEventListener('change', function (e) { state.sort = e.target.value; state.page = 1; render(); });
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    state.tab = b.dataset.k; state.page = 1; render();
  });
  $('#ageTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    state.adult = !state.adult; state.page = 1; render();
    if (CZ.inkAll) CZ.inkAll();          /* nhãn 18+ cũng có viên nền trượt */
  });
  $('#qClr').addEventListener('click', function () {
    $('#q').value = ''; state.q = ''; state.page = 1; render();
    $('#q').focus();
  });
  $('#viewSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.view = b.dataset.view;
    $$('#viewSeg button').forEach(function (x) { x.classList.toggle('on', x === b); });
    try { localStorage.setItem('ssochuz-view', state.view); } catch (err) {}
    render();
  });

  /* ======================= KHỞI ĐỘNG ================================== */
  /* khung xám chờ: hiện ngay khi mở trang, dữ liệu về là thay bằng thẻ thật */
  function skeleton(n) {
    var grid = $('#grid');
    if (!grid) return;
    var one = '<div class="skcard" aria-hidden="true"><span class="skth"></span><span class="skl"></span><span class="skl short"></span></div>';
    grid.innerHTML = new Array(n + 1).join(one);
    $('#pager').innerHTML = '';
    $('#fcount').textContent = 'đang tải dữ liệu…';
    skeletonNumbers();    /* N12: dải số liệu cũng có khung xám chờ thay vì trống trơn */
  }
  /* N12: khối số liệu hiện khung xương trước, số thật (đã đối chiếu realcounts)
     về là thế chỗ ngay — không nhấp nháy như bản cũ. */
  function skeletonNumbers() {
    var box = $('#facts');
    if (!box) return;
    box.innerHTML = new Array(5).join('<div class="f fsk"><span class="ln rskel"></span><span class="ln sm rskel"></span></div>');
  }
  function fail(msg, err) {
    if (window.console && console.warn) console.warn('[ssochuz]', msg, err || '');
    var grid = $('#grid');
    if (grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">Chưa tải được dữ liệu truyện</div>' +
      'Kiểm tra mạng rồi tải lại trang. Dữ liệu vẫn còn nguyên trong kho.</div>';
  }
  CZ.mountShell({ active: 'home' });          /* đầu trang hiện ngay, không chờ dữ liệu */
  function boot(reg) {
    try {
      CZ._setLib();
      var lib = CZ.lib();
      CZ.mountShell({ active: 'home' });       /* dựng lại để chân trang có rev mới */
      try { var v = localStorage.getItem('ssochuz-view'); if (v === 'list') state.view = 'list'; } catch (e) {}
      $$('#viewSeg button').forEach(function (x) { x.classList.toggle('on', x.dataset.view === state.view); });
      hero.list = CZ.slides(reg).slice(0, 5);
      heroInit();
      renderFacts(lib);

      renderNew();
      renderRank();
      renderEditorChoice();
      renderBecause();
      CZ.schedule().then(renderSched).catch(function () { renderSched(null); });
      buildFilters();
      render();
      CZ.reveal();
      navCounts();
      /* số liệu KV về sau thì vẽ lại phần xếp hạng */
      CZ.onStats(function () { renderRank(); buildFilters(); render(); });
      /* bấm Thích (ở trang này hoặc vừa quay lại) → BXH phải nhảy lên ngay */
      window.addEventListener('cz:stats', function () { renderRank(); });
      /* một bộ vừa được đối chiếu số chương thật → vẽ lại thẻ cho đúng */
      window.addEventListener('cz:count', function () {
        try { CZ._setLib(); } catch (e) {}
        renderFacts(CZ.lib()); renderNew(); renderRank(); render();
      });
    } catch (e) { fail('lỗi dựng trang chủ', e); }
  }
  /* quay lại tab (hoặc bấm Back) → dựng lại bàn đọc cho khớp dữ liệu trong máy */
  window.addEventListener('pageshow', function () { if (CZ._memo.reg) {  heroPaint(false); } });
  skeleton(12);
  CZ.registry().then(function (r) { boot(r.reg); })
    .catch(function (e) { fail('lỗi tải registry', e); });
})();
