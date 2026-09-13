/* ============================================================================
   chuseoz · TRANG CHỦ (bố cục hero landing)
   ----------------------------------------------------------------------------
   Thứ tự trang: hero → dải số liệu → Bàn đọc (đang đọc dở / tủ truyện) →
   Khám phá (mới cập nhật · xếp hạng · lịch ra chương · chuyển thể) → Thư viện.
   “Khám phá” gom 4 mục vào 4 tab để trang không dài lê thê; mọi mục vẫn dựng
   sẵn nội dung nên mở tab là thấy ngay, và link cũ (#bxh, #lich, #chuyen-the)
   vẫn nhảy đúng tab.
   Số liệu đọc chỉ lấy từ Firebase thật; không đọc được thì KHÔNG hiện số nào.
   ========================================================================== */
(function () {
  'use strict';
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

  var state = { tab: 'all', year: '', author: '', couple: '', q: '', sort: 'new', view: 'grid', page: 1, per: 24 };

  /* ======================= HERO ======================================== */
  var hero = { list: [], i: 0, timer: null, auto: 8000 };
  function heroSlide(n, i) {
    var p = CZ.progress(n), resume = p || 1;
    var inShelf = CZ.inShelf(n);
    return '<article class="slide' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" aria-label="' + esc(n.title) + '">' +
      '<div class="col">' +
        '<div class="info">' +
          '<span class="eyebrow">' + (i === 0 ? 'Nổi bật' : 'Đề xuất cho bạn') + '</span>' +
          '<h1>' + esc(n.title) + '</h1>' +
          '<div class="meta">' +
            '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(n.status || '—') + '</span>' +
            '<span><b>' + esc(CZ.countText(n)) + '</b></span>' +
            (n.author ? '<span>Tác giả ' + esc(n.author) + '</span>' : '') +
            (n.couple ? '<span>' + esc(n.couple) + '</span>' : '') +
            (n.adaptName ? '<span>Chuyển thể · ' + esc(n.adaptName) + '</span>' : '') +
          '</div>' +
          '<p class="syn">' + esc(n.synFull || n.syn || '') + '</p>' +
          '<div class="btn-row">' +
            (n.canRead
              ? '<a class="btn pri lg" href="' + esc(CZ.readURL(n.slug, resume)) + '">' + ic('play', 'i-s') +
                (p ? 'Đọc tiếp chương ' + resume : 'Đọc từ chương 1') + '</a>'
              : '<button class="btn lg off" disabled>' + ic('clock', 'i-s') + 'Sắp ra mắt</button>') +
            '<a class="btn lg" href="' + esc(CZ.storyURL(n.slug)) + '">' + ic('info', 'i-s') + 'Trang truyện</a>' +
            '<button class="btn lg" data-shelf="' + esc(n.slug) + '" aria-pressed="' + (inShelf ? 'true' : 'false') + '">' +
              ic('bookmark', 'i-s') + '<span>' + (inShelf ? 'Đã lưu' : 'Lưu vào tủ') + '</span></button>' +
          '</div>' +
        '</div>' +
        '<a class="poster" href="' + esc(CZ.storyURL(n.slug)) + '" aria-label="' + esc(n.title) + '">' +
          (n.thumb || n.slide ? '<img src="' + esc(n.thumb || n.slide) + '" alt="Bìa ' + esc(n.title) + '" width="300" height="450"' +
            (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">' : '') +
          (n.is18 ? '<span class="b18">18+</span>' : '') +
        '</a>' +
      '</div></article>';
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
        (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" decoding="async">' : '') + '</button>';
    }).join('');
    $('#hCount').textContent = (hero.i + 1) + '/' + hero.list.length;
    if (animate) restart();
  }
  function goSlide(i) {
    if (!hero.list.length) return;
    var all = $$('.slide'), dots = $$('#hDots button'), strip = $$('#hStrip button');
    all[hero.i].classList.remove('on'); dots[hero.i].classList.remove('on'); strip[hero.i].classList.remove('on');
    hero.i = (i + hero.list.length) % hero.list.length;
    all[hero.i].classList.add('on'); dots[hero.i].classList.add('on'); strip[hero.i].classList.add('on');
    $('#hCount').textContent = (hero.i + 1) + '/' + hero.list.length;
    restart();
  }
  function restart() {
    var bar = $('#heroBar');
    if (!bar) return;
    bar.style.transition = 'none'; bar.style.width = '0%';
    clearInterval(hero.timer);
    if (CZ.reduce || document.hidden) return;
    requestAnimationFrame(function () {
      bar.style.transition = 'width ' + hero.auto + 'ms linear';
      bar.style.width = '100%';
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
        s.querySelector('span').textContent = on ? 'Đã lưu' : 'Lưu vào tủ';
        s.classList.toggle('on', on);
        renderBan();
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
    var ser = lib.filter(function (n) { return n.adapt === 'series'; }).length;
    var facts = [
      { n: lib.length, l: 'Bộ truyện' },
      { n: chap, l: 'Chương đã đăng' },
      { n: done, l: 'Đã hoàn thành' },
      { n: ser, l: 'Bộ chuyển thể' }
    ];
    $('#facts').innerHTML = facts.map(function (f) {
      return '<div class="f"><b data-count="' + f.n + '">0</b><span>' + f.l + '</span></div>';
    }).join('');
    CZ.scaleFacts($('#facts'));
  }

  /* ======================= BÀN ĐỌC ===================================== */
  function contRow(n) {
    var p = CZ.progress(n), tot = n.chapters, pct = tot ? Math.min(100, Math.round(p / tot * 100)) : 0;
    return '<article class="cont" data-open="' + esc(n.slug) + '" role="button" tabindex="0" title="Đọc tiếp ' + esc(n.title) + '">' +
      (n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy" decoding="async">' : '<img alt="">') +
      '<div><b>' + esc(n.title) + '</b>' +
      '<span class="st">chương ' + p + '/' + tot + (CZ.lastReadAt(n) ? ' · ' + CZ.timeAgo(new Date(CZ.lastReadAt(n)).toISOString()) : '') + '</span>' +
      '<div class="pb"><i style="width:' + pct + '%"></i></div></div>' +
      '<span class="go">Chương ' + Math.min(tot, p || 1) + '</span></article>';
  }
  var banTab = 'doc';
  function docList() {
    return CZ.lib().filter(function (n) { return n.canRead && CZ.progress(n) > 0; })
      .sort(function (a, b) { return CZ.lastReadAt(b) - CZ.lastReadAt(a); });
  }
  function shelfList() {
    return CZ.shelfIds().map(function (s) { return CZ.findLib(s); }).filter(Boolean);
  }
  function renderBan() {
    var sec = $('#ban-doc');
    if (!sec) return;
    var docs = docList(), shelf = shelfList();
    var empty = !docs.length && !shelf.length;
    sec.hidden = empty;
    $('#contRow').innerHTML = ''; $('#shelfRow').innerHTML = '';
    if (empty) return;
    if (banTab === 'doc' && !docs.length) banTab = 'shelf';
    if (banTab === 'shelf' && !shelf.length) banTab = 'doc';
    $('#banDocCount').textContent = docs.length ? String(docs.length) : '';
    $('#banShelfCount').textContent = shelf.length ? String(shelf.length) : '';
    $$('#banTabs .tab').forEach(function (b) { b.classList.toggle('on', b.dataset.ban === banTab); });
    $('#contRow').classList.toggle('hide', banTab !== 'doc');
    $('#shelfRow').classList.toggle('hide', banTab !== 'shelf');
    $('#banSub').textContent = banTab === 'doc'
      ? 'lưu trong máy bạn — ' + docs.length + ' bộ đang đọc dở'
      : shelf.length + ' bộ đã lưu';
    var clr = $('#banClear');
    clr.textContent = banTab === 'doc' ? 'Xoá lịch sử đọc' : 'Bỏ hết khỏi tủ';
    if (banTab === 'doc') {
      $('#contRow').innerHTML = docs.slice(0, 8).map(contRow).join('');
    } else {
      $('#shelfRow').innerHTML = shelf.map(function (n) {
        var p = CZ.progress(n), tot = n.chapters;
        return '<article class="cont" data-open="' + esc(n.slug) + '" role="button" tabindex="0">' +
          (n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy" decoding="async">' : '<img alt="">') +
          '<div><b>' + esc(n.title) + '</b><span class="st">' +
          (tot ? (p ? 'đang ở chương ' + p + '/' + tot : num(tot) + ' chương') : 'sắp ra mắt') + '</span>' +
          (tot && p ? '<div class="pb"><i style="width:' + Math.round(p / tot * 100) + '%"></i></div>' : '') + '</div>' +
          (tot ? '<span class="go">Đọc tiếp</span>' : '<span class="go"></span>') +
          '<span class="rm" data-rm="' + esc(n.slug) + '" title="Bỏ khỏi tủ">' + ic('x', 'i-s') + '</span></article>';
      }).join('');
    }
  }
  $('#banTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    banTab = b.dataset.ban; renderBan();
  });
  $('#contRow').addEventListener('click', function (e) {
    var c = e.target.closest('[data-open]'); if (!c) return;
    var n = CZ.findLib(c.dataset.open); if (n) location.href = CZ.readURL(n.slug, CZ.progress(n) || 1);
  });
  $('#shelfRow').addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rm]');
    if (rm) { CZ.toggleShelf({ slug: rm.dataset.rm }); renderBan(); CZ.toast('Đã bỏ khỏi tủ truyện'); return; }
    var c = e.target.closest('[data-open]'); if (!c) return;
    var n = CZ.findLib(c.dataset.open);
    if (n) location.href = n.canRead ? CZ.readURL(n.slug, CZ.progress(n) || 1) : CZ.storyURL(n.slug);
  });
  $('#banClear').addEventListener('click', function () {
    if (banTab === 'shelf') {
      if (!CZ.shelfIds().length) return;
      CZ.confirm('Bỏ hết ' + CZ.shelfIds().length + ' bộ khỏi tủ truyện?', 'Bỏ hết').then(function (ok) {
        if (!ok) return;
        CZ.clearShelf(); renderBan(); CZ.toast('Đã xoá tủ truyện');
      });
      return;
    }
    CZ.confirm('Xoá lịch sử đọc trong máy này? Tiến độ đọc của mọi bộ sẽ mất.', 'Xoá').then(function (ok) {
      if (!ok) return;
      CZ.lib().forEach(function (n) {
        [n.postId, n.slug].filter(Boolean).forEach(function (k) {
          try { localStorage.removeItem('chuseoz-prog-' + k); localStorage.removeItem('chuseoz-when-' + k); } catch (e) {}
        });
      });
      renderBan(); heroPaint(false); CZ.toast('Đã xoá lịch sử đọc');
    });
  });

  /* ======================= KHÁM PHÁ: 4 TAB ============================= */
  var EXP = ['new', 'rank', 'sched', 'adapt'];
  function showExp(k) {
    if (EXP.indexOf(k) < 0) k = 'new';
    $$('#expTabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.exp === k); });
    $('#moi-cap-nhat').classList.toggle('hide', k !== 'new');
    $('#bxh').classList.toggle('hide', k !== 'rank');
    $('#lich').classList.toggle('hide', k !== 'sched');
    $('#chuyen-the').classList.toggle('hide', k !== 'adapt');
  }
  $('#expTabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    showExp(b.dataset.exp);
  });
  /* link cũ /#bxh, /#lich, /#chuyen-the, /#moi-cap-nhat → mở đúng tab */
  function expFromHash() {
    var h = (location.hash || '').replace('#', '');
    if (h === 'bxh') return 'rank';
    if (h === 'lich') return 'sched';
    if (h === 'chuyen-the') return 'adapt';
    if (h === 'moi-cap-nhat') return 'new';
    return '';
  }
  window.addEventListener('hashchange', function () { var k = expFromHash(); if (k) showExp(k); });

  /* ======================= MỚI CẬP NHẬT ================================ */
  function renderNew() {
    var rows = CZ.lib().slice().sort(function (a, b) {
      return String(b.updated || '').localeCompare(String(a.updated || '')) || (b.chapters - a.chapters);
    });
    $('#expNew').textContent = rows.length;
    $('#newSub').textContent = rows.length + ' bộ · cập nhật gần nhất ' + CZ.dateVN(rows[0] && rows[0].updated);
    CZ.mountRail($('#newRail'), rows.slice(0, 12));
  }

  /* ======================= XẾP HẠNG ==================================== */
  function statsOn() { return !!(CZ._memo.stats && CZ._memo.stats.on); }
  function rankTabs() {
    /* chưa đọc được số liệu Firebase thì không bày tab “lượt đọc / bình chọn” rỗng nghĩa */
    return statsOn()
      ? [{ k: 'views', l: 'Lượt đọc' }, { k: 'votes', l: 'Bình chọn' }, { k: 'new', l: 'Mới cập nhật' }, { k: 'chap', l: 'Nhiều chương' }]
      : [{ k: 'new', l: 'Mới cập nhật' }, { k: 'chap', l: 'Nhiều chương' }, { k: 'votes', l: 'Bình chọn' }];
  }
  var rankBy = '';   /* rỗng = tự chọn: đọc được số thật thì xếp theo lượt đọc */
  function renderRank() {
    var lib = CZ.lib(), on = statsOn();
    var tabs = rankTabs();
    var by = (rankBy && tabs.some(function (t) { return t.k === rankBy; })) ? rankBy : (on ? 'views' : 'new');
    $('#rankTabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (t.k === by ? ' on' : '') + '" data-k="' + t.k + '" role="tab" aria-selected="' +
        (t.k === by) + '">' + t.l + '</button>';
    }).join('');
    var val = function (n, k) {
      var s = CZ.statsOf(n) || {};
      if (k === 'votes') return s.votes || 0;
      if (k === 'views') return s.views || 0;
      if (k === 'chap') return n.chapters || 0;
      return Date.parse(String(n.updated || '') + 'T00:00:00') || 0;
    };
    var list = lib.slice().sort(function (a, b) {
      return (val(b, by) - val(a, by)) || (b.chapters - a.chapters);
    }).slice(0, 8);
    var max = Math.max(1, val(list[0] || {}, by));
    $('#rank').innerHTML = list.map(function (n, i) {
      var s = CZ.statsOf(n) || {};
      var text = '—', w = 0;
      if (by === 'new') text = n.updated ? CZ.timeAgo(n.updated) : '—';
      else if (by === 'chap') { text = n.chapters + ' chương'; w = Math.round(100 * n.chapters / max); }
      else if (on) { text = num(s[by] || 0) + (by === 'views' ? ' lượt' : ' phiếu'); w = Math.round(100 * (s[by] || 0) / max); }
      return '<a class="rank" href="' + esc(CZ.storyURL(n.slug)) + '" title="' + esc(n.title) + '">' +
        '<span class="n ' + (i < 3 ? 'top' : '') + '">' + (i + 1) + '</span>' +
        (n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy" decoding="async">' : '<img alt="">') +
        '<span class="tt"><b>' + esc(n.title) + '</b><span>' + esc(n.couple || n.author || '') +
        (on && s.chapterCount ? ' · ' + s.chapterCount + ' chương' : '') + '</span></span>' +
        '<span class="v">' + text + '</span>' +
        (w ? '<i class="bar" style="width:' + w + '%"></i>' : '') + '</a>';
    }).join('') || '<div class="empty">Chưa có dữ liệu.</div>';
    var src = $('#rankSrc');
    if (on) {
      src.className = 'src';
      src.innerHTML = '<span class="dot"></span><span>số liệu thật từ Firebase (chuseoz-library)' +
        (CZ._memo.stats.saved ? ' · ' + CZ.timeAgo(CZ._memo.stats.saved) : '') +
        (CZ._memo.stats.stale ? ' · bản lưu trong máy' : '') + '</span>';
    } else {
      src.className = 'src err';
      src.innerHTML = '<span class="dot"></span><span>chưa đọc được số liệu Firebase (quyền đọc đang chặn) — ' +
        'bảng xếp theo <b>ngày cập nhật / số chương</b>, web không hiện số ước lượng</span>';
    }
  }
  $('#rankTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    rankBy = b.dataset.k; renderRank();
  });

  /* ======================= LỊCH RA CHƯƠNG ============================== */
  function normTitle(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9à-ỹ]+/gi, ''); }
  function renderSched(sch) {
    var items = (sch && sch.items) || [];
    var el = $('#sched');
    $('#expSched').textContent = items.length;
    if (!items.length) {
      el.innerHTML = '<div class="empty">Chưa có lịch ra chương.</div>';
      $('#schedSrc').innerHTML = '<span class="dot"></span><span>nguồn: trang <b>Lịch ra chương</b> trên Blogger</span>';
      return;
    }
    el.innerHTML = items.slice(0, 8).map(function (it) {
      var n = null;
      CZ.lib().some(function (x) { if (normTitle(x.title) === normTitle(it.title)) { n = x; return true; } return false; });
      return '<a class="sched' + (n ? ' clk' : '') + '" ' + (n ? 'href="' + esc(CZ.storyURL(n.slug)) + '"' : '') + '>' +
        '<div class="day">' + esc(it.days || '') + '</div>' +
        '<div class="info"><b>' + esc(it.title || '') + '</b><span>' +
        (n ? (n.canRead ? esc(CZ.countText(n)) : 'sắp ra mắt') : esc(it.detail || '')) + '</span></div></a>';
    }).join('');
    $('#schedSrc').innerHTML = '<span class="dot"></span><span>nguồn thật: <a href="' +
      esc(sch.source || 'https://chuseoz.blogspot.com/p/lich-ra-chuong.html') + '" target="_blank" rel="noopener">trang Lịch ra chương</a>' +
      (sch.updated ? ' · ' + CZ.dateVN(sch.updated) : '') + (sch.note ? ' — ' + esc(sch.note) : '') + '</span>';
  }

  /* ======================= CHUYỂN THỂ ================================== */
  var ltab = null, lAll = false;
  function byTitle(t) { return CZ.lib().find(function (x) { return x.title === t; }); }
  function srowHTML(parts, name) {
    var covers = parts.slice(0, 4).map(function (t) {
      var n = byTitle(t);
      return n && n.thumb ? '<img src="' + esc(n.thumb) + '" alt="" loading="lazy" decoding="async">' : '';
    }).join('');
    var first = byTitle(parts[0]) || {};
    var yrs = parts.map(function (t) { var n = byTitle(t); return n && n.year; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    return '<a class="srow" href="' + esc(CZ.storyURL(first.slug || '')) + '" title="' + esc(name) + '">' +
      '<span class="sc">' + covers + '</span>' +
      '<span class="st"><b>' + esc(name) + '</b><em>' + (parts.length > 1 ? parts.length + ' phần · ' : '') +
      esc(yrs.join(', ')) + (first.chapters ? ' · ' + esc(CZ.countText(first)) : '') + '</em></span>' +
      (parts.length > 1 ? '<span class="mul">×' + parts.length + '</span>' : '') + '</a>';
  }
  function renderLadder() {
    var lib = CZ.lib(), reg = CZ._memo.reg || {};
    var groups = (reg.series || []).map(function (g) { return { name: g.name, parts: g.parts || [] }; });
    var movies = lib.filter(function (n) { return n.adapt === 'phim'; });
    var none = lib.filter(function (n) { return !n.adapt; });
    var LT = [
      { k: 'series', l: 'Series', c: groups.length, i: 'tv', d: 'Truyện đã dựng thành series truyền hình — nhóm theo tên phim, bộ nhiều phần xếp trước.' },
      { k: 'phim', l: 'Phim điện ảnh', c: movies.length, i: 'film', d: 'Truyện đã dựng thành phim điện ảnh.' },
      { k: 'none', l: 'Chưa chuyển thể', c: none.length, i: 'book', d: 'Truyện chưa gắn nhãn chuyển thể trong dữ liệu.' }
    ];
    if (!ltab) ltab = (LT.find(function (t) { return t.c > 0; }) || LT[0]).k;
    $('#expAdapt').textContent = groups.length + movies.length;
    $('#ltabs').innerHTML = LT.map(function (t) {
      return '<button class="tab' + (t.k === ltab ? ' on' : '') + '" data-k="' + t.k + '" role="tab" aria-selected="' +
        (t.k === ltab) + '">' + ic(t.i, 'i-s') + t.l + '<span class="ct">' + t.c + '</span></button>';
    }).join('');
    var cur = LT.find(function (t) { return t.k === ltab; }) || LT[0];
    $('#ldesc').textContent = cur.d;
    $('#adSub').textContent = groups.length + ' series · ' + movies.length + ' phim · ' + none.length + ' chưa chuyển thể / ' + lib.length + ' bộ';
    var box = $('#lcontent');
    if (ltab === 'phim') {
      box.innerHTML = movies.length
        ? '<div class="sgrid">' + movies.map(function (n) { return srowHTML([n.title], n.adaptName || n.title); }).join('') + '</div>'
        : '<div class="empty"><div class="big">Chưa có bộ nào gắn nhãn phim điện ảnh</div>' +
          'Toàn bộ ' + groups.length + ' bộ đã chuyển thể hiện là <b>series truyền hình</b> — xem tab <b>Series</b>.</div>';
      return;
    }
    var items = ltab === 'series' ? groups.slice().sort(function (a, b) { return b.parts.length - a.parts.length; })
      : none.map(function (n) { return { name: n.title, parts: [n.title] }; });
    var show = lAll ? items : items.slice(0, 12);
    box.innerHTML = '<div class="sgrid">' + show.map(function (g) { return srowHTML(g.parts, g.name); }).join('') + '</div>' +
      (items.length > 12 ? '<div class="btn-row mt"><button class="btn ghost sm" id="lmore">' +
        (lAll ? 'Thu gọn' : 'Xem tất cả ' + items.length + ' mục') + '</button></div>' : '');
    var m = $('#lmore');
    if (m) m.addEventListener('click', function () { lAll = !lAll; renderLadder(); });
  }
  $('#ltabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    ltab = b.dataset.k; lAll = false; renderLadder();
  });

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
  }
  /* dãy tab tình trạng / chuyển thể / 18+ — cũng là nguồn nhãn cho chip lọc */
  function tabDefs() {
    var lib = CZ.lib();
    var byStatus = function (k) { return lib.filter(function (n) { return n.statusCls === k; }).length; };
    var TABS = [
      { k: 'all', l: 'Tất cả', c: lib.length },
      { k: 'done', l: 'Hoàn thành', c: byStatus('done') },
      { k: 'run', l: 'Đang cập nhật', c: byStatus('run') },
      { k: 'soon', l: 'Sắp ra mắt', c: byStatus('soon') },
      { k: 'series', l: 'Series', c: lib.filter(function (n) { return n.adapt === 'series'; }).length },
      { k: 'phim', l: 'Movie', c: lib.filter(function (n) { return n.adapt === 'phim'; }).length },
      { k: '18', l: '18+', c: lib.filter(function (n) { return n.is18; }).length }
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
    else if (s === 'series') lib = lib.filter(function (n) { return n.adapt === 'series'; });
    else if (s === 'phim') lib = lib.filter(function (n) { return n.adapt === 'phim'; });
    else if (s === '18') lib = lib.filter(function (n) { return n.is18; });
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
    var list = filtered();
    var total = Math.max(1, Math.ceil(list.length / state.per));
    if (state.page > total) state.page = 1;
    var slice = list.slice((state.page - 1) * state.per, state.page * state.per);
    var grid = $('#grid');
    grid.className = 'grid' + (state.view === 'list' ? ' list-view' : '');
    grid.innerHTML = slice.length ? slice.map(function (n) { return CZ.card(n, { view: state.view }); }).join('')
      : '<div class="empty" style="grid-column:1/-1"><div class="big">Không có truyện nào khớp</div>Thử bỏ một vài tiêu chí lọc.' +
        '<div class="mt"><button class="btn ghost" id="clrAll">Xoá tất cả lọc</button></div></div>';
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
    ['year', 'author', 'couple'].forEach(function (k) { if (state[k]) picked.push([k, state[k]]); });
    if (state.q) picked.push(['q', '“' + state.q + '”']);
    $('#fpick').innerHTML = picked.length
      ? picked.map(function (p, i) {
        return '<span class="fchip">' + esc(p[1]) + '<span data-rm="' + i + '" title="Bỏ lọc">' + ic('x', 'i-s') + '</span></span>';
      }).join('') + '<button class="btn ghost sm" id="clrAll2">Xoá tất cả lọc</button>'
      : '';
    $('#fcount').innerHTML = '<b>' + list.length + '</b> truyện' +
      (picked.length ? ' · đang lọc ' + picked.length + ' tiêu chí' : '') +
      (total > 1 ? ' · trang ' + state.page + '/' + total : '');
    $$('[data-rm]', $('#fpick')).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = picked[+b.dataset.rm][0];
        if (k === 'q') { state.q = ''; $('#q').value = ''; }
        else if (k === 'tab') state.tab = 'all';
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
  function clearAll() {
    state.tab = 'all'; state.year = state.author = state.couple = state.q = '';
    $('#q').value = ''; syncFilterUI(); state.page = 1; render();
  }
  function syncFilterUI() {
    $$('#tabs .tab').forEach(function (t) { t.classList.toggle('on', t.dataset.k === state.tab); });
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
  $('#viewSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.view = b.dataset.view;
    $$('#viewSeg button').forEach(function (x) { x.classList.toggle('on', x === b); });
    try { localStorage.setItem('chuseoz-view', state.view); } catch (err) {}
    render();
  });

  /* ======================= KHỞI ĐỘNG ================================== */
  function fail(msg, err) {
    if (window.console && console.warn) console.warn('[chuseoz]', msg, err || '');
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
      try { var v = localStorage.getItem('chuseoz-view'); if (v === 'list') state.view = 'list'; } catch (e) {}
      $$('#viewSeg button').forEach(function (x) { x.classList.toggle('on', x.dataset.view === state.view); });
      hero.list = CZ.slides(reg).slice(0, 5);
      heroInit();
      renderFacts(lib);
      renderBan();
      renderNew();
      renderRank();
      CZ.schedule().then(renderSched).catch(function () { renderSched(null); });
      renderLadder();
      buildFilters();
      render();
      showExp(expFromHash() || 'new');
      CZ.reveal();
      /* số liệu Firebase về sau thì vẽ lại phần xếp hạng */
      CZ.onStats(function () { renderRank(); buildFilters(); render(); });
    } catch (e) { fail('lỗi dựng trang chủ', e); }
  }
  /* quay lại tab (hoặc bấm Back) → dựng lại bàn đọc cho khớp dữ liệu trong máy */
  window.addEventListener('pageshow', function () { if (CZ._memo.reg) { renderBan(); heroPaint(false); } });
  CZ.registry().then(function (r) { boot(r.reg); })
    .catch(function (e) { fail('lỗi tải registry', e); });
})();
