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
  /* Thanh lọc không còn ô chọn tác giả/couple (mỗi couple tối đa 2 bộ), nhưng
     liên kết chia sẻ ?author=… / ?couple=… vẫn phải lọc được — nhận cả tên
     nguyên bản lẫn dạng slug trong /tac-gia/?q=… · /couple/?q=… */
  (function () {
    try {
      var qp = new URLSearchParams(location.search);
      if (qp.get('author')) state.author = qp.get('author');
      if (qp.get('couple')) state.couple = qp.get('couple');
    } catch (e) {}
  })();

  /* ======================= HERO (banner dùng chung) ===================== */
  /* VÁ (2026-10-29): trang chủ KHÔNG tự vẽ hero nữa. Nó chỉ đổi dữ liệu truyện
     sang đúng hợp đồng HeroBannerItem rồi giao cho `CZ.heroBanner`
     (src/cz-hero.js) — markup, chuyển slide, bàn phím, vuốt và live region chỉ
     tồn tại ở MỘT chỗ, nên khối “Nổi bật hôm nay” và mọi banner nổi bật sau này
     dùng chung đúng một component.
     Dữ liệu truyền vào vẫn là dữ liệu thật: tình trạng, số chương, tác giả,
     couple, ngày cập nhật, tiến độ đang đọc, CTA đọc/thông tin và “Lưu vào tủ”. */
  var heroApi = null;
  function heroItem(n, i) {
    var pg = CZ.progress(n), tot = n.chapters || 0;
    var pct = tot && pg ? Math.min(100, Math.round(pg / tot * 100)) : 0;
    var img = CZ.coverSrc(n) || '';
    /* bìa NGANG cho lớp nền: chỉ dùng khi registry có ảnh khác bìa dọc; thiếu thì
       component tự lấy gradient từ chính bìa dọc (canvas) — xem cz-hero.js */
    var wide = (n.slide && n.slide !== n.thumb) ? (CZ.coverSrc(n, n.slide) || '') : '';
    var badges = [{ label: CZ.statusLabel(n.statusCls || n.status), tone: n.statusCls || 'run', dot: true }];
    if (n.locked) badges.push({ label: 'Có mật mã', tone: 'lock', icon: 'lock' });
    if (n.is18) badges.push({ label: '18+', tone: 'bad' });
    if (n.fresh) badges.push({ label: 'MỚI', tone: 'acc' });
    /* Một hàng meta KHÔNG icon: bản trước nhét 5 “pill” có viền + 4 icon vào
       cùng một hàng, nhìn như một dãy nút bấm được. Nay chỉ còn chữ, cách nhau
       bằng dấu chấm mảnh (CSS lo phần dấu chấm). */
    var meta = [{ label: CZ.countText(n), strong: true, title: 'Số chương' }];
    if (n.author) meta.push({ label: n.author, title: 'Tác giả' });
    if (n.couple) meta.push({ label: n.couple, title: 'Couple' });
    if (n.updated) meta.push({ label: CZ.timeAgo(n.updated), title: 'Cập nhật gần nhất' });
    /* “KỆ NHÃN” của hero: 4 ô, ô nào không có dữ liệu thì KHÔNG dựng.
       Couple ẩn ở điện thoại (hideSm) — đó là thông tin phụ nhất trong bốn ô. */
    /* `slot` ghim ô vào ĐÚNG một cột của lưới (ch/au/cp/up): số chương dài
       ngắn khác nhau giữa các truyện nên nếu để lưới tự co thì mỗi lần đổi
       truyện cả hàng nhãn lại nhảy ngang. Ghim cột ⇒ nhãn đứng im. */
    var facts = [{ label: 'Chương', value: tot > 0 ? String(tot) : '—', num: true, slot: 'ch' }];
    if (n.author) facts.push({ label: 'Tác giả', value: n.author, soft: true, slot: 'au' });
    if (n.couple) facts.push({ label: 'Couple', value: n.couple, soft: true, hideSm: true, slot: 'cp' });
    if (n.updated) facts.push({ label: 'Cập nhật', value: CZ.timeAgo(n.updated), num: true, slot: 'up' });

    var primary = n.canRead
      ? (n.locked
        /* truyện khoá mật mã: dẫn về trang truyện (có chốt nhập mật mã),
           không dẫn thẳng vào chương — mở chương là lộ nội dung */
        /* nhãn ngắn "Mở khóa": mật mã là chuyện của trang truyện, nhồi cả câu
           giải thích vào nút chỉ làm nút dài và nặng hơn hành động. Lời giải
           thích đầy đủ nằm ở title (rê chuột) chứ không chiếm mặt nút. */
        ? { label: 'Mở khóa', href: CZ.storyURL(n.slug), icon: 'lock',
            title: 'Truyện có mật mã — mở trang truyện để nhập mật mã' }
        : { label: pg ? 'Đọc tiếp' : 'Đọc từ đầu', href: CZ.readURL(n.slug, pg || 1), icon: 'play',
            title: pg ? 'Mở đúng chỗ bạn đang đọc dở' : 'Bắt đầu từ chương đầu' })
      : { label: 'Sắp ra mắt', icon: 'clock', disabled: true };
    return {
      id: n.slug,
      title: n.title,
      href: CZ.storyURL(n.slug),
      description: n.syn || n.synFull || '',
      thumbnail: { src: img, alt: n.title },    /* bìa cho quạt — có alt để dự phòng */
      caption: n.author || '',                  /* dòng mono dưới bìa đang chọn */
      backdrop: wide ? { src: wide } : null,     /* bìa ngang cho nền (nếu có) */
      badges: badges,
      facts: facts,
      meta: meta,
      progress: pg ? {
        current: pg, total: tot, percent: pct,
        label: 'đang đọc <b>chương ' + pg + '</b>' + (tot ? ' / ' + tot : '') + ' · ' + pct + '%'
      } : null,
      primaryCta: primary,
      /* CTA phụ là nút ICON TRÒN 44px “i” (thông tin truyện) thay cho nút lưu:
         lưu vào tủ đã có ở trang truyện + thẻ truyện, còn ở đây người đọc cần
         một lối tắt sang trang thông tin (tác giả, thể loại, mục lục). */
      secondaryCtas: [
        { label: 'Thông tin truyện', href: CZ.storyURL(n.slug), icon: 'info', variant: 'outline',
          title: 'Thông tin truyện — tác giả, thể loại, danh sách chương' }
      ]
    };
  }
  function mountHero(list) {
    var root = $('#hero');
    if (!root) return;
    if (!CZ.heroBanner) {
      if (window.console && console.warn) console.warn('[ssochuz] thiếu cz-hero.js — không dựng được hero banner');
      return;
    }
    /* dựng lại (ví dụ khi quay lại tab) thì giữ đúng mục người đọc đang xem */
    var keep = heroApi && typeof heroApi.index === 'number' ? heroApi.index : 0;
    if (heroApi && heroApi.destroy) heroApi.destroy();
    heroApi = CZ.heroBanner(root, { items: (list || []).map(heroItem), autoPlay: true, initialIndex: keep });
  }

  /* ======================= MỚI CẬP NHẬT ================================ */
  /* Mới cập nhật: bảng gọn ba cột (30/10/2026). Mỗi dòng là bìa nhỏ · tên một dòng
     · tác giả, và cột phải canh thẳng “Ch. 42” + “2 giờ trước” — đọc lướt một màn là
     biết bộ nào vừa lên chương, khỏi cuộn ngang. */
  function renderNew() {
    var box = $('#newRail');
    if (!box) return;
    var rows = CZ.lib().slice().sort(function (a, b) {
      return String(b.updated || '').localeCompare(String(a.updated || '')) || (b.chapters - a.chapters);
    });
    var pick = rows.slice(0, 12);
    box.innerHTML = pick.map(function (n) {
      var src = CZ.coverSrc(n), ch = n.chapters ? 'Ch. ' + n.chapters : CZ.statusLabel(n.statusCls || n.status);
      return '<a class="mrow" href="' + esc(CZ.storyURL(n.slug)) + '">' +
        (src ? '<img src="' + esc(src) + '"' + CZ.coverFB(n, src) + ' alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '<span class="mrow-ph" aria-hidden="true"></span>') +
        '<span class="mt"><b>' + esc(n.title) + '</b><span>' + esc(n.author || n.couple || '') + '</span></span>' +
        '<span class="mn"><b>' + esc(ch) + '</b><span>' + esc(CZ.timeAgo(n.updated)) + '</span></span></a>';
    }).join('');
    var sub = $('#newSub');
    if (sub) sub.textContent = pick.length ? pick.length + ' bộ vừa lên chương' : '';
  }

  /* ===================== KHÔNG GIAN CÁ NHÂN ============================ */
  var personalRenderId = 0;
  function personalCard(n, title, href, progressPct, badge) {
    var image = CZ.coverSrc(n);
    var percent = Math.max(0, Math.min(100, Number(progressPct) || 0));
    return '<article class="personal-card">' +
      '<a class="personal-cover" href="' + esc(href) + '" aria-label="' + esc(title) + '">' +
      (image ? '<img src="' + esc(image) + '"' + CZ.coverFB(n, image) + ' alt="' + esc(n.title) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '<span class="personal-cover-fallback" aria-hidden="true">📖</span>') +
      '</a><div class="personal-card-body"><a class="personal-card-title" href="' + esc(href) + '">' + esc(n.title) + '</a>' +
      (badge ? '<span class="personal-card-badge">' + esc(badge) + '</span>' : '') +
      (progressPct == null ? '' : '<span class="personal-progress"><i style="width:' + percent.toFixed(0) + '%"></i></span>') +
      '<div class="personal-card-actions"><a class="btn primary sm" href="' + esc(href) + '">' + esc(badge && badge.indexOf('mới') >= 0 ? 'Đọc chương mới' : 'Đọc tiếp') + '</a>' +
      CZ.followBtn(n, 'personal-follow') + '</div></div></article>';
  }
  /* Ô “Đọc tiếp” của bento: phần nào chưa có dữ liệu thì ẩn HẲN (không bày
     khung rỗng), cả hai đều rỗng thì ô đổi thành “bắt đầu từ đâu” — nhờ vậy ô
     không bao giờ trống mà cũng không cao lêu nghêu vì dòng “chưa có…”. */
  function setPersonalParts(hasResume, hasFollow, showStarter, resumeCount) {
    var r = $('#resumeSec'), f = $('#followUpdatesSec'), st = $('#starterBox'), sub = $('#resumeSub');
    if (r) r.hidden = !hasResume;
    if (f) f.hidden = !hasFollow;
    if (sub) sub.textContent = hasResume && resumeCount ? resumeCount + ' bộ đang đọc' : '';
    if (st) { st.hidden = !showStarter; if (showStarter) renderStarter(); }
  }
  var starterDone = false;
  function renderStarter() {
    var box = $('#starterBox');
    if (!box || starterDone) return;
    starterDone = true;
    var lib = CZ.lib();
    var done = lib.filter(function (n) { return n.statusCls === 'done' && n.chapters > 0; });
    var longest = done.slice().sort(function (a, b) { return b.chapters - a.chapters; })[0];
    var shortest = done.slice().sort(function (a, b) { return a.chapters - b.chapters; })[0];
    var freshest = lib.filter(function (n) { return n.chapters > 0; })
      .sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); })[0];
    var picks = [
      { n: longest, k: 'Đọc trọn một mạch' },
      { n: shortest, k: 'Ngắn, đọc một tối' },
      { n: freshest, k: 'Mới lên kệ' }
    ].filter(function (x, i, all) { return x.n && all.findIndex(function (y) { return y.n === x.n; }) === i; });
    if (!picks.length) { box.hidden = true; return; }
    box.innerHTML = '<div class="bth lt"><h3 class="blb dim">Bắt đầu từ đâu?</h3></div>' +
      picks.map(function (x, i) {
        var img = CZ.coverSrc(x.n);
        return '<a class="s" href="' + esc(CZ.storyURL(x.n.slug)) + '">' +
          '<span class="s-th">' + (img ? '<img src="' + esc(img) + '"' + CZ.coverFB(x.n, img) + ' alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>' +
          '<span class="s-bd"><span class="s-n">0' + (i + 1) + ' · ' + esc(x.k) + '</span>' +
          '<b>' + esc(x.n.title) + '</b><span class="s-m">' + esc(CZ.countText(x.n)) + '</span></span></a>';
      }).join('');
  }
  function renderPersonalBlocks() {
    var service = window.CZPersonal;
    var resumeSection = $('#resumeSec'), followSection = $('#followUpdatesSec');
    if (!resumeSection || !followSection) return;
    if (!service) { setPersonalParts(false, false, true); return; }
    var requestId = ++personalRenderId;
    var mode = service.mode();
    var resumeRail = $('#resumeRail'), followRail = $('#followUpdatesRail');
    /* Đang đồng bộ / lỗi: ô vẫn phải có nội dung — hiện “bắt đầu từ đâu” thay vì
       một ô trống chỉ có cái nhãn (vừa xấu vừa làm trang nhảy khi dữ liệu về). */
    if (mode === 'loading' || mode === 'error') { setPersonalParts(false, false, true); return; }
    var library = CZ.lib();
    var known = Object.create(null);
    library.forEach(function (story) { known[story.slug] = story; });
    var progressRows = service.progressRows().filter(function (row) {
      return row && row.chapterIndex > 0 && known[row.storyId];
    }).sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }).slice(0, 3);
    resumeRail.innerHTML = progressRows.map(function (row) {
      var story = known[row.storyId];
      var url = CZ.readURL(story.slug, row.chapterIndex);
      var progress = Number(row.scrollPercent) || 0;
      var chapterLabel = 'Chương ' + row.chapterIndex + (row.completedAt ? ' · đã đọc' : '');
      return personalCard(story, chapterLabel, url, progress, chapterLabel);
    }).join('');
    var hasResume = progressRows.length > 0;
    var follows = service.followRows().filter(function (row) { return row && known[row.storyId]; });
    if (!follows.length) {
      followRail.innerHTML = '';
      setPersonalParts(hasResume, false, !hasResume, progressRows.length);
      return;
    }
    service.fetchTocs(follows.map(function (row) { return row.storyId; })).then(function (tocRows) {
      if (requestId !== personalRenderId) return;
      var bySlug = Object.create(null);
      var tocList = Array.isArray(tocRows) ? tocRows : Object.keys(tocRows || {}).map(function (key) { return tocRows[key]; });
      tocList.forEach(function (toc) {
        if (toc && (toc.slug || toc.storyId)) bySlug[toc.slug || toc.storyId] = toc;
      });
      var updates = follows.map(function (row) {
        var story = known[row.storyId], toc = bySlug[row.storyId] || {};
        var count = Number(toc.chapterCount);
        if (!Number.isFinite(count) || count < 0) count = CZ.realCount(story.slug);
        if (!Number.isFinite(count) || count < 0) count = story.chapters;
        var unseen = service.newChapters(story.slug, count);
        return { story: story, toc: toc, count: count, unseen: unseen };
      }).filter(function (item) { return item.unseen > 0; })
        .sort(function (a, b) { return b.unseen - a.unseen || String(b.toc.updatedAt || '').localeCompare(String(a.toc.updatedAt || '')); });
      followRail.innerHTML = updates.slice(0, 3).map(function (item) {
        var last = item.toc.chapters && item.toc.chapters.length ? item.toc.chapters[item.toc.chapters.length - 1] : null;
        var index = Math.max(1, Number(last && last.index) || item.count);
        var title = last && last.title ? last.title : 'Chương ' + index;
        var url = item.story.locked ? CZ.storyURL(item.story.slug) : CZ.readURL(item.story.slug, index);
        return personalCard(item.story, title, url, null, item.unseen + ' chương mới');
      }).join('');
      setPersonalParts(hasResume, updates.length > 0, !hasResume && !updates.length, progressRows.length);
    }).catch(function () {
      if (requestId === personalRenderId) { followRail.innerHTML = ''; setPersonalParts(hasResume, false, !hasResume, progressRows.length); }
    });
  }
  var personalRenderTimer = 0;
  window.addEventListener('cz:personal', function () {
    clearTimeout(personalRenderTimer);
    personalRenderTimer = setTimeout(renderPersonalBlocks, 60);
  });

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
      .sort(function (a, b) { return b.rating - a.rating || b.count - a.count || a.n.slug.localeCompare(b.n.slug); }).slice(0, 5) : [];
    var box = rail.closest('.worth-section');
    if (!rows.length) {
      rail.innerHTML = statsOn() ? '<p class="empty">Chưa có truyện được đánh giá sao.</p>' : '';
      if (box) box.hidden = true;
      return;
    }
    if (box) box.hidden = false;
    /* Hai bên cùng một nhịp: cột trái là hàng xếp hạng, cột phải là hàng đáng xem —
       cùng cỡ số, cùng cỡ bìa, cùng chỗ đặt điểm số, chỉ khác đơn vị (lượt / ★). */
    var top = rows[0] ? rows[0].rating : 0;
    rail.innerHTML = rows.map(function (row, i) {
      var n = row.n, src = CZ.coverSrc(n), ratio = top ? Math.max(.12, row.rating / top) : 0;
      return '<a class="rank wrank" href="' + esc(CZ.storyURL(n.slug)) + '" style="--d:' + (i * 55) + 'ms;--w:' + ratio.toFixed(3) + '">' +
        '<span class="n' + (i < 3 ? ' top t' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
        '<span class="rk-th' + (src ? '' : ' noimg') + '">' +
        (src ? '<img src="' + esc(src) + '"' + CZ.coverFB(n, src) + ' alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>' +
        '<span class="tt"><b>' + esc(n.title) + '</b><span>' + num(row.count) + ' đánh giá</span></span>' +
        '<span class="v">★<b>' + row.rating.toFixed(1) + '</b></span><i class="bar" aria-hidden="true"></i></a>';
    }).join('');
    if (CZ.inkAll) CZ.inkAll();
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
      .sort(function (a, b) { return b.score - a.score || a.n.slug.localeCompare(b.n.slug); }).slice(0, 5) : [];
    $('#rankSummary').textContent = (rankMode === 'views' ? 'Lượt đọc' : 'Lượt thích') + ' · ' + tabs.find(function (t) { return t.k === rankBy; }).l;
    var peak = rows.length ? rows[0].score : 0;
    /* Không có số liệu thì KHÔNG bịa gì trong #rank (bài kiểm canh đúng chỗ này);
       trạng thái “chưa có số” nói ở phụ đề cạnh tiêu đề. */
    var rankSub = $('#rankSub');
    if (rankSub) rankSub.textContent = rows.length ? rows.length + ' bộ dẫn đầu' : (on ? '' : 'chưa có số liệu');
    $('#rank').innerHTML = rows.map(function (row, i) {
      var n = row.n, ratio = peak ? Math.max(.12, row.score / peak) : 0;
      return '<a class="rank" href="' + esc(CZ.storyURL(n.slug)) + '" style="--d:' + (i * 55) + 'ms;--w:' + ratio.toFixed(3) + '">' +
        '<span class="n' + (i < 3 ? ' top t' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
        '<span class="rk-th' + (CZ.coverSrc(n) ? '' : ' noimg') + '">' +
        (CZ.coverSrc(n) ? '<img src="' + esc(CZ.coverSrc(n)) + '"' + CZ.coverFB(n, CZ.coverSrc(n)) + ' alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>' +
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
  var WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /* Lịch ra chương = DẢI 7 NGÀY của tuần này (thứ Hai → Chủ nhật). Mỗi bộ nằm ở
     đúng cột thứ của nó, hôm nay tô sáng; bộ chưa ghi thứ thì xuống hàng riêng
     bên dưới chứ không bị bỏ sót. Mỗi mục vẫn giữ lớp .sched như trước nên các
     chỗ khác (và bài kiểm) không phải đổi. */
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
    var cell = function (it) {
      var n = schedFind(it);
      var im = n && CZ.coverSrc(n);
      var title = (n && n.title) || it.title || '';
      var meta = n ? (n.canRead ? CZ.countText(n) : CZ.statusLabel(n.statusCls)) : (it.detail || '');
      return '<a class="sched' + (n ? ' clk' : '') + '"' + (n ? ' href="' + esc(CZ.storyURL(n.slug)) + '"' : '') + '>' +
        '<span class="sch-th' + (im ? '' : ' noimg') + '">' +
        (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>' +
        '<span class="sch-info"><b>' + esc(title) + '</b><span>' + esc(meta) + '</span></span></a>';
    };
    var dated = items.map(function (it) { return { it: it, days: parseDays(it.days) }; });
    var unplaced = dated.filter(function (x) { return !x.days.length; });
    var now = new Date();
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    var cols = WD.map(function (wd, i) {
      var d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      var today = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      var rows = dated.filter(function (x) { return x.days.indexOf(wd) >= 0; });
      return '<div class="day' + (today ? ' today' : '') + '">' +
        '<div class="wd">' + wd + (today ? '<span>· hôm nay</span>' : '') + '</div>' +
        '<div class="dt">' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '</div>' +
        (rows.length ? rows.map(function (x) { return cell(x.it); }).join('') : '<div class="dayoff">nghỉ</div>') +
        '</div>';
    }).join('');
    el.innerHTML = '<div class="week">' + cols + '</div>' +
      (unplaced.length ? '<div class="schedlist">' + unplaced.map(function (x) { return cell(x.it); }).join('') + '</div>' : '') +
      (sch && sch.note ? '<p class="schnote">' + esc(sch.note) + '</p>' : '');
    var count = $('#lichCount');
    if (count) count.textContent = items.length + ' bộ · tuần này';
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
    /* Chuyển thể Series: băng ngang 16:10, chữ đè chân ảnh (30/10/2026).
       Bìa là ảnh dọc nên cắt ở 26% chiều cao để giữ mặt nhân vật. */
    rail.innerHTML = list.slice(0, 6).map(function (n) {
      var src = CZ.coverSrc(n), meta = [];
      if (n.chapters) meta.push(n.chapters + ' chương');
      meta.push(CZ.statusLabel(n.statusCls || n.status));
      return '<a class="wcard" href="' + esc(CZ.storyURL(n.slug)) + '">' +
        (src ? '<img src="' + esc(src) + '"' + CZ.coverFB(n, src) + ' alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') +
        '<span class="wsh" aria-hidden="true"></span>' +
        '<span class="wt"><span class="wk">Chuyển thể' + (n.year ? ' · ' + esc(n.year) : '') + '</span>' +
        '<span class="wn">' + esc(n.title) + '</span>' +
        '<span class="wm">' + esc(meta.join(' · ')) + '</span></span></a>';
    }).join('');
  }

  /* ======================= THƯ VIỆN ==================================== */
  function buildFilters() {
    var lib = CZ.lib();
    var uniq = function (a) { var seen = {}; return a.filter(function (v) { if (!v || seen[v]) return false; seen[v] = 1; return true; }); };
    var years = uniq(lib.map(function (n) { return n.year; })).sort(function (a, b) { return b - a; });
    var yearCount = {};
    lib.forEach(function (n) { if (n.year) yearCount[n.year] = (yearCount[n.year] || 0) + 1; });
    /* Năm kèm số bộ: chọn năm nào là biết ngay còn bao nhiêu truyện, không phải
       bấm rồi mới thấy lưới trống. Tác giả/couple không còn ô chọn riêng —
       mỗi couple chỉ có tối đa 2 bộ, một danh sách dài như thế không giúp gì. */
    $('#fYear').innerHTML = '<option value="">Tất cả</option>' + years.map(function (y) {
      return '<option value="' + esc(y) + '">' + esc(y) + ' (' + yearCount[y] + ')</option>';
    }).join('');
    var sorts = [['new', 'Mới nhất'], ['year-desc', 'Năm mới nhất'], ['year-asc', 'Năm cũ nhất'],
      ['chap-desc', 'Nhiều chương nhất'], ['az', 'Tên A → Z']];
    if (statsOn()) sorts.push(['views', 'Đọc nhiều nhất']);   /* chỉ khi có số thật */
    $('#fSort').innerHTML = sorts.map(function (o) {
      return '<option value="' + o[0] + '">' + o[1] + '</option>';
    }).join('');
    renderChips();
  }
  /* Chips lọc: tình trạng là một nhóm chọn-một, 18+ là công tắc riêng — hai thứ
     GHÉP ĐƯỢC với nhau và với Năm, nên “Hoàn thành + 18+” ra đúng 4 bộ chứ
     không phải thay thế lẫn nhau như dãy tab cũ. Số trên chip luôn là số của
     toàn thư viện (không co theo bộ lọc đang bật) để người đọc không bị đếm
     trượt. */
  function adultCount() {
    return CZ.lib().filter(function (n) { return n.is18; }).length;
  }
  function renderChips() {
    var box = $('#tabs');
    if (!box) return;
    var defs = tabDefs().map(function (t) { return { k: t.k, l: t.l, c: t.c }; });
    var n18 = adultCount();
    if (n18) defs.push({ k: '18', l: '18+', c: n18 });
    /* số liệu đọc về sau (KV) chỉ đổi phần đếm — dựng lại y nguyên thì chip
       đang được bàn phím trỏ tới sẽ mất focus, nên chỉ vẽ khi thật sự khác */
    var sig = defs.map(function (t) { return t.k + ':' + t.c; }).join('|');
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = defs.map(function (t) {
      var on = t.k === '18' ? !!state.adult : t.k === state.tab;
      return '<button class="chip' + (on ? ' on' : '') + '" data-k="' + t.k + '" aria-pressed="' + on + '">' +
        esc(t.l) + '<b>' + t.c + '</b></button>';
    }).join('');
  }
  /* chip tình trạng (chọn một) — nhãn 18+ là chip riêng, ghép được với nhau */
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
  function filtered() {
    var lib = CZ.lib().slice(), s = state.tab;
    if (s === 'done' || s === 'run' || s === 'soon') lib = lib.filter(function (n) { return n.statusCls === s; });
    if (state.adult) lib = lib.filter(function (n) { return n.is18; });
    if (state.year) lib = lib.filter(function (n) { return String(n.year) === state.year; });
    if (state.author) {
      var auWant = CZ.slugify(state.author);
      lib = lib.filter(function (n) {
        return n.author === state.author || CZ.slugify(n.author) === auWant;
      });
    }
    if (state.couple) {
      var cpWant = CZ.slugify(state.couple);
      lib = lib.filter(function (n) {
        if (n.couple === state.couple) return true;
        var cs = CZ.couplesOf ? CZ.couplesOf(n) : [];
        return cs.some(function (c) { return c === state.couple || CZ.slugify(c) === cpWant; });
      });
    }
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
    var libSub = $('#libSub');
    if (libSub) libSub.textContent = CZ.lib().length + ' bộ · ' + state.per + ' bộ mỗi trang';
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
    /* Chip trên thanh lọc đã hiện tình trạng và nhãn 18+, nên hàng này chỉ
       còn những điều kiện KHÔNG nhìn thấy được: từ khoá, năm, tác giả/couple
       (hai cái sau đi vào bằng liên kết chia sẻ). Bật bất cứ bộ lọc nào là
       hàng này xuất hiện kèm nút xoá nhanh. */
    var picked = [];
    ['year', 'author', 'couple'].forEach(function (k) { if (state[k]) picked.push([k, state[k]]); });
    if (state.q) picked.push(['q', '“' + state.q + '”']);
    var anyFilter = picked.length > 0 || state.tab !== 'all' || state.adult;
    $('#fpick').innerHTML = !anyFilter ? '' : picked.map(function (p, i) {
        return '<span class="fchip">' + esc(p[1]) + '<span data-rm="' + i + '" title="Bỏ lọc">' + ic('x', 'i-s') + '</span></span>';
      }).join('') + '<button class="lnk" id="clrAll2">Xoá lọc</button>';
    $('#qClr').classList.toggle('hide', !state.q);
    /* “1–24 / 67”: đang xem bao nhiêu trên tổng bao nhiêu, gọn hơn câu
       “67 truyện · đang lọc 2 tiêu chí · trang 1/3” mà vẫn đủ thông tin. */
    var from = list.length ? (state.page - 1) * state.per + 1 : 0;
    var to = Math.min(list.length, state.page * state.per);
    $('#fcount').innerHTML = (list.length ? '<b>' + from + '–' + to + '</b> / ' + list.length : '0 / 0') +
      /* lọc theo tác giả/couple thì dẫn sang trang riêng của người đó */
      (state.author ? ' · <a href="/tac-gia/?q=' + encodeURIComponent(CZ.slugify(state.author)) + '">Xem tất cả truyện của ' + esc(state.author) + '</a>' : '') +
      (state.couple ? ' · <a href="/couple/?q=' + encodeURIComponent(CZ.slugify(state.couple)) + '">Xem tất cả truyện của ' + esc(state.couple) + '</a>' : '');
    $$('[data-rm]', $('#fpick')).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = picked[+b.dataset.rm][0];
        if (k === 'q') { state.q = ''; $('#q').value = ''; }
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
    if ($('#tabs .chip')) $('#tabs .chip').focus({ preventScroll: true });
  }
  function syncFilterUI() {
    $$('#tabs .chip').forEach(function (c) {
      var on = c.dataset.k === '18' ? !!state.adult : c.dataset.k === state.tab;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('#fYear').value = state.year;
    /* danh sách sắp xếp đổi theo việc có số liệu thật hay không — chỉ gán khi
       lựa chọn đang giữ còn tồn tại, tránh ô chọn rỗng */
    if ($('#fSort').querySelector('option[value="' + state.sort + '"]')) $('#fSort').value = state.sort;
  }
  var qTimer = null;
  $('#q').addEventListener('input', function (e) {
    clearTimeout(qTimer);
    var v = e.target.value;
    qTimer = setTimeout(function () { state.q = v.trim(); state.page = 1; render(); }, 160);
  });
  $('#q').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.target.value = ''; state.q = ''; state.page = 1; render(); } });
  $('#fYear').addEventListener('change', function (e) { state.year = e.target.value; state.page = 1; render(); });
  $('#fSort').addEventListener('change', function (e) { state.sort = e.target.value; state.page = 1; render(); });
  /* Một chỗ duy nhất xử lý cả nhóm: tình trạng là chọn-một, 18+ là công tắc
     riêng, cả hai ghép được với Năm và từ khoá. */
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.k === '18') state.adult = !state.adult;
    else state.tab = b.dataset.k;
    state.page = 1; render();
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
      mountHero(CZ.slides(reg).slice(0, 5));
      renderNew();
      renderPersonalBlocks();
      renderRank();
      renderEditorChoice();
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
        renderNew(); renderPersonalBlocks(); renderRank(); render();
      });
    } catch (e) { fail('lỗi dựng trang chủ', e); }
  }
  /* quay lại tab (hoặc bấm Back) → dựng lại bàn đọc cho khớp dữ liệu trong máy */
  /* quay lại tab/Back: dựng lại hero để nhãn “Đã lưu” khớp tủ trong máy */
  window.addEventListener('pageshow', function () { if (CZ._memo.reg) mountHero(CZ.slides().slice(0, 5)); });
  skeleton(12);
  CZ.registry().then(function (r) { boot(r.reg); })
    .catch(function (e) { fail('lỗi tải registry', e); });
})();
