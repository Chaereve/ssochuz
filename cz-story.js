/* ============================================================================
   chuseoz · TRANG TRUYỆN + TRANG ĐỌC  (một trang, hai chế độ)
   ----------------------------------------------------------------------------
   URL:  /truyen/<slug>/            → thông tin truyện + danh sách chương
         /truyen/<slug>/#chuong-12  → mở thẳng chương 12 (đọc tại chỗ, không tải lại)
         /truyen/<slug>/#page-12    → link cũ, vẫn chạy
   Vì sao gộp: người đọc bấm “Đọc chương 5” là chữ hiện ngay (sách đã nằm trong máy),
   không phải chờ tải trang mới; và nút Back của trình duyệt trả về đúng danh sách chương.
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = CZ.esc, ic = CZ.icon, num = CZ.num;

  function paintIcons(root) {
    $$('[data-ic]', root || document).forEach(function (el) { el.outerHTML = ic(el.dataset.ic); });
  }
  paintIcons();

  /* ======================= 0. ĐỌC URL ==================================== */
  function slugFromURL() {
    var p = location.pathname.split('/').filter(Boolean);
    /* /truyen/<slug>/  và  /reader/<slug>/ (đời cũ) — tên truyện nằm ngay trong đường dẫn */
    if ((p[0] === 'truyen' || p[0] === 'reader') && p[1]) return decodeURIComponent(p[1]);
    /* /truyen, /reader, /truyen.html… : đường dẫn không có tên truyện → đọc query ?slug= */
    if (!p.length || p[0] === 'truyen' || p[0] === 'reader' || /\.html?$/i.test(p[0] || '')) {
      return CZ.qs('slug') || CZ.qs('truyen') || '';
    }
    /* đường dẫn lạ (mở thẳng tệp khi xem thử trên máy) → lấy khúc cuối */
    if (p.length) return decodeURIComponent(p[p.length - 1]);
    return CZ.qs('slug') || '';
  }
  function chapterFromHash() {
    var m = /^#(?:chuong|page|chapter)-(\d+)$/i.exec(location.hash || '');
    return m ? parseInt(m[1], 10) : 0;
  }
  /* link cũ kiểu /reader?slug=x&ch=5 hoặc ?chuong=5 vẫn mở đúng chương */
  function chapterFromQuery() {
    var q = parseInt(CZ.qs('ch') || CZ.qs('chuong') || '0', 10);
    return q > 0 ? q : 0;
  }
  function chapterWanted() { return chapterFromHash() || chapterFromQuery(); }
  var SLUG = slugFromURL();

  /* ======================= 1. TRẠNG THÁI ================================= */
  var BOOK = null;         /* {title, slug, author, couple, chapters:[{t,html}]} */
  var N = null;            /* mục trong registry (đã chuẩn hoá) */
  var CHS = [];            /* danh sách chương */
  var cur = 0;             /* chương đang đọc (1-based) */
  var reading = false;
  var storyScroll = 0;
  var chState = { q: '', sort: 'old', page: 1, per: 24 };
  var PAGES = [], PI = 0;  /* chế độ phân trang */

  /* ======================= 2. DỌN HTML CHƯƠNG ===========================
     Nội dung lấy từ kho chương trên web nên vẫn giữ in đậm/nghiêng/ảnh/link, nhưng bỏ
     mọi thứ nguy hiểm (script, iframe, thuộc tính on*, link javascript:).      */
  function cleanHTML(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    $$('script,style,iframe,form,object,embed,link,meta,input,button', tmp).forEach(function (el) { el.remove(); });
    $$('*', tmp).forEach(function (el) {
      Array.prototype.slice.call(el.attributes || []).forEach(function (a) {
        var n = String(a.name || '').toLowerCase(), v = String(a.value || '');
        if (n.indexOf('on') === 0 || ((n === 'href' || n === 'src') && /^\s*(javascript|data):/i.test(v))) el.removeAttribute(a.name);
      });
      if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener nofollow'); }
      if (el.tagName === 'IMG') { el.setAttribute('loading', 'lazy'); el.setAttribute('decoding', 'async'); el.removeAttribute('width'); el.removeAttribute('height'); }
    });
    /* <div> chỉ chứa chữ → <p> cho đúng nhịp đoạn văn */
    $$('div', tmp).forEach(function (d) {
      if (!d.querySelector('div,p,ul,ol,blockquote,table,img,figure,h1,h2,h3,h4')) {
        var p = document.createElement('p');
        p.innerHTML = d.innerHTML;
        d.parentNode.replaceChild(p, d);
      }
    });
    return tmp.innerHTML;
  }

  /* ---- số chương lấy từ CHÍNH tiêu đề ----------------------------------
     Nhiều bộ mở đầu bằng “Lời Mở Đầu”, nên số thứ tự trong danh
     sách lệch với số ghi trên tiêu đề (“Chương 1”, “Chương 2”…). Chỗ nào
     người đọc thấy thì dùng số trong tiêu đề; chương không ghi số thì gọi
     bằng đúng tên của nó. */
  function chapSplit(c) {
    var t = String((c && c.t) || '').trim();
    var m = /^(?:chương|chap|chapter)\s*(\d+)\s*[:.\-–—]?\s*(.*)$/i.exec(t);
    if (m) return { no: parseInt(m[1], 10), name: m[2] || t, full: t };
    return { no: 0, name: t || 'Chương', full: t };
  }
  function chapLabel(i) {                     /* i: vị trí 1-based trong sách */
    var c = CHS[i - 1];
    if (!c) return 'Chương ' + i;
    var x = chapSplit(c);
    return x.no ? 'Chương ' + x.no : (x.name || ('Chương ' + i));
  }
  function chapTotal() {
    var mx = 0;
    for (var i = 0; i < CHS.length; i++) mx = Math.max(mx, chapSplit(CHS[i]).no);
    return mx || CHS.length;
  }

  /* ======================= 3. TRANG TRUYỆN ============================== */
  /* Ba khối: Giới thiệu · Danh sách chương · Đánh giá.
     Gạch chân trượt sang tab đang mở; nội dung hiện lên bằng fade + trượt nhẹ. */
  var TAB = { cur: 'chap', loaded: {} };
  function tabPane(k) { return k === 'info' ? $('#pane-info') : k === 'cmt' ? $('#pane-cmt') : $('#chapSec'); }
  function paintInk() {
    var bar = $('#storyTabs'), ink = $('#stInk');
    if (!bar || !ink) return;
    var on = bar.querySelector('.stab.on');
    if (!on) { ink.style.opacity = '0'; return; }
    ink.style.width = on.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    ink.style.opacity = '1';
  }
  function showTab(k, scroll) {
    if (!tabPane(k)) k = 'chap';
    TAB.cur = k;
    ['info', 'chap', 'cmt'].forEach(function (x) {
      var p = tabPane(x);
      if (p) p.hidden = x !== k;
    });
    $$('#storyTabs .stab').forEach(function (b) {
      var on = b.dataset.tab === k;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var pane = tabPane(k);
    if (pane && !CZ.reduce) {
      pane.classList.remove('pin');
      void pane.offsetWidth;
      pane.classList.add('pin');
    }
    if (k === 'cmt' && !TAB.loaded.cmt) { TAB.loaded.cmt = true; mountGiscus(); }
    paintInk();
    if (scroll && pane) {
      var y = pane.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: y, behavior: CZ.reduce ? 'auto' : 'smooth' });
    }
  }
  function progressPct(n, ch) {
    var tot = n.chapters || 0;
    if (!tot || !ch) return 0;
    return Math.max(1, Math.min(100, Math.round(ch / tot * 100)));
  }
  function readBtn(n, ch) {
    if (!n.canRead) return '<button class="btn pri lg off" disabled>' + ic('clock', 'i-s') + 'Chưa có chương — sắp ra mắt</button>';
    return '<a class="btn pri lg" href="#chuong-' + (ch || 1) + '" title="' +
      (ch > 1 ? 'Mở đúng chỗ bạn đang đọc dở' : 'Bắt đầu từ chương đầu') + '">' + ic('play', 'i-s') +
      (ch > 1 ? 'Đọc tiếp' : 'Đọc từ đầu') + '</a>';
  }
  /* số liệu thật đọc từ Firebase: chỉ hiện khi đọc được, không đoán số */
  function statChip() {
    var st = CZ.statsOf(N);
    if (!st) return '';
    var bits = [];
    if (st.views) bits.push(num(st.views) + ' lượt đọc');
    if (st.votes) bits.push(num(st.votes) + ' phiếu');
    if (!bits.length) return '';
    return '<span title="số liệu thật từ Firebase chuseoz-library">' + ic('eye', 'i-s') + ' ' + bits.join(' · ') + '</span>';
  }
  function renderStory() {
    var n = N, ch = CZ.progress(n);
    var im = n.thumb || n.slide || '';
    var syn = n.synFull || n.syn || '';
    $('#shero').innerHTML =
      '<div class="in">' +
        '<div class="cover" data-t="' + esc(n.title) + '">' + (im ? '<img src="' + esc(im) + '" alt="Bìa ' + esc(n.title) + '" width="300" height="450" fetchpriority="high">' : '') +
          (n.is18 ? '<span class="b18">18+</span>' : '') + '</div>' +
        '<div>' +
          '<h1>' + esc(n.title) + '</h1>' +
          '<div class="meta">' +
            '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(n.status || '—') + '</span>' +
            '<span>' + ic('book', 'i-s') + ' <b>' + esc(CZ.countText(n)) + '</b></span>' +
            (n.author ? '<span>' + ic('pen', 'i-s') + ' ' + esc(n.author) + '</span>' : '') +
            (n.couple ? '<span>' + ic('users', 'i-s') + ' ' + esc(n.couple) + '</span>' : '') +
            (n.year ? '<span>' + esc(n.year) + '</span>' : '') +
            '<span>' + ic('refresh', 'i-s') + ' ' + esc(CZ.timeAgo(n.updated)) + '</span>' +
            statChip() +
          '</div>' +
          '<p class="syn clamp" id="synBox">' + esc(syn) + '</p>' +
          '<div class="btn-row">' + readBtn(n, ch) +
            (n.canRead && ch && ch < n.chapters ? '<a class="btn ghost lg" href="#chuong-' + n.chapters + '">' + ic('up', 'i-s') + 'Chương mới nhất</a>' : '') +
            '<button class="btn ghost" id="shelfBtn" aria-pressed="' + CZ.inShelf(n) + '">' + ic('bookmark', 'i-s') +
              '<span>' + (CZ.inShelf(n) ? 'Đã lưu' : 'Tủ truyện') + '</span></button>' +
            '<button class="btn ghost" id="shareBtn">' + ic('share', 'i-s') + 'Chia sẻ</button>' +
          '</div>' +
          (ch && n.chapters ? '<div class="prog"><div class="lbl"><span>Tiến độ đọc của bạn</span>' +
            '<span>còn ' + Math.max(0, n.chapters - ch) + ' chương · ' + progressPct(n, ch) + '%</span></div>' +
            '<div class="bar"><i style="width:' + progressPct(n, ch) + '%"></i></div></div>' : '') +
          (n.synFull && n.synFull.length > (n.syn || '').length
            ? '<button class="synbtn mt" id="synMore">Xem giới thiệu đầy đủ</button>' : '') +
        '</div>' +
      '</div>';
    /* bìa hỏng / chưa có ảnh: khung vẫn có tên truyện thay vì để trống trơn */
    var cw = $('#shero .cover'), cim = cw ? cw.querySelector('img') : null;
    if (cim) cim.addEventListener('error', function () { if (cw && cw.isConnected) cw.classList.add('noimg'); });
    if (cw && (!cim || (cim.complete && !cim.naturalWidth))) cw.classList.add('noimg');
    var sb = $('#synBox');
    if (sb && syn.length < 200) sb.classList.remove('clamp');
    var more = $('#synMore');
    if (more) more.addEventListener('click', function () { showTab('info', true); });
    var sh = $('#shelfBtn');
    if (sh) sh.addEventListener('click', function () {
      var on = CZ.toggleShelf(n);
      sh.setAttribute('aria-pressed', on);
      sh.classList.toggle('on', on);
      sh.querySelector('span').textContent = on ? 'Đã lưu' : 'Tủ truyện';
      CZ.pop(sh);
      CZ.toast(on ? 'Đã thêm vào tủ truyện' : 'Đã bỏ khỏi tủ truyện');
    });
    $('#shareBtn').addEventListener('click', function () { CZ.copy(location.origin + CZ.storyURL(n.slug), 'Đã copy link bộ truyện'); });
    renderInfo();
    var ct = $('#tabChapCt');
    if (ct) ct.textContent = n.canRead ? n.chapters : '';
    $('#crumb').innerHTML = '<a href="/">Trang chủ</a> ' + ic('right', 'i-s') + ' <a href="/#thu-vien">Thư viện</a> ' +
      ic('right', 'i-s') + ' <b>' + esc(n.title) + '</b>';
    $('#chapTop').setAttribute('href', n.canRead ? '#chuong-' + n.chapters : '#');
    $('#chapTop').style.display = n.canRead ? '' : 'none';
    $('#chapCount').textContent = n.canRead
      ? (n.declared > n.chapters
        ? 'Đang có ' + n.chapters + '/' + n.declared + ' chương'
        : 'Đang có ' + n.chapters + ' chương')
      : 'chưa có chương nào — đang ở trạng thái “Sắp ra mắt”';
  }

  /* khối “Giới thiệu”: mô tả đầy đủ + bảng thông tin đọc được, không lặp lại phần đầu trang */
  function renderInfo() {
    var n = N, ch = CZ.progress(n), st = CZ.statsOf(n);
    var full = (n.synFull || n.syn || '').trim();
    var box = $('#synFull');
    if (box) {
      box.className = 'synfull';
      box.textContent = full || 'Bộ này chưa có mô tả.';
    }
    var sub = $('#synSub');
    if (sub) sub.textContent = full ? words(full) + ' từ · cập nhật ' + CZ.timeAgo(n.updated) : '';
    var rows = [
      ['Tác giả', n.author || '—'],
      ['Couple', n.couple || '—'],
      ['Năm', n.year || '—'],
      ['Tình trạng', n.status || '—'],
      ['Số chương', n.canRead ? CZ.countText(n) : 'chưa có chương'],
      ['Bạn đã đọc', ch && n.chapters ? ch + '/' + n.chapters + ' chương (' + progressPct(n, ch) + '%)' : 'chưa đọc chương nào'],
      ['Cập nhật gần nhất', n.updated ? CZ.dateVN(n.updated) : '—']
    ];
    if (st && (st.views || st.votes)) {
      rows.push(['Số liệu thật', (st.views ? num(st.views) + ' lượt đọc' : '') +
        (st.views && st.votes ? ' · ' : '') + (st.votes ? num(st.votes) + ' phiếu' : '')]);
    }
    var info = $('#storyInfo');
    if (info) info.innerHTML = rows.map(function (r) {
      return '<div class="r"><span>' + esc(r[0]) + '</span><b>' + esc(String(r[1])) + '</b></div>';
    }).join('');
  }
  function words(t) { return String(t || '').trim().split(/\s+/).filter(Boolean).length; }

  /* một dòng chương: số · tên (tô sáng khi tìm) · dấu đã đọc / đã đánh dấu */
  function chapLink(x, prog, marks, q) {
    var on = x.i === prog ? ' now' : '';
    var sp = chapSplit(x.c);
    return '<a class="cha' + on + '" href="#chuong-' + x.i + '" data-ch="' + x.i + '" title="' + esc(x.c.t) + '">' +
      '<span class="no">' + (sp.no || '—') + '</span><span class="nm">' + hl(sp.name, q) + '</span>' +
      (marks.indexOf(x.i) >= 0 ? '<span class="done" title="Chương đã đánh dấu">' + ic('star', 'i-s') + '</span>'
        : (x.i < prog ? '<span class="done" title="Đã đọc">' + ic('check', 'i-s') + '</span>' : '')) + '</a>';
  }
  function hl(t, q) {
    if (!q) return esc(t);
    try { return esc(t).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark class="hit">$1</mark>'); }
    catch (e) { return esc(t); }
  }
  /* bộ nhiều chương: gom thành từng nhóm 24 chương, mở nhóm đang đọc, các nhóm khác gấp lại
     (mở/đóng bằng grid-template-rows nên chiều cao chạy mượt, không giật) */
  function renderChapters() {
    if (!N || !N.canRead) {
      $('#chapGrid').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">Bộ này chưa đăng chương nào</div>' +
        'Đang ở trạng thái <b>Sắp ra mắt</b> — chương đầu sẽ hiện ở đây ngay khi được đăng.</div>';
      $('#chapPager').innerHTML = '';
      return;
    }
    var prog = CZ.progress(N);
    var marks = CZ.marks(N);
    var q = chState.q.toLowerCase();
    var list = CHS.map(function (c, i) { return { c: c, i: i + 1 }; })
      .filter(function (x) { return !q || x.c.t.toLowerCase().indexOf(q) >= 0 || String(x.i) === q; });
    if (chState.sort === 'new') list.reverse();
    var gopen = chState.gopen || (chState.gopen = {});
    var grouped = !q && list.length > 24;
    if (grouped) {
      var per = 24, groups = [], i;
      for (i = 0; i < list.length; i += per) groups.push(list.slice(i, i + per));
      var hasCur = list.some(function (x) { return x.i === prog; });
      $('#chapGrid').innerHTML = groups.map(function (g, gi) {
        var first = g[0].i, last = g[g.length - 1].i;
        var auto = g.some(function (x) { return x.i === prog; }) || (!hasCur && gi === 0);
        var open = gopen[gi] == null ? auto : !!gopen[gi];
        gopen[gi] = open;
        return '<button class="cvol' + (open ? ' on' : '') + '" data-g="' + gi + '" type="button" aria-expanded="' + (open ? 'true' : 'false') + '">' +
            ic('right', 'i-s') + 'Chương ' + first + '–' + last +
            '<span class="ct">' + g.length + ' chương</span></button>' +
          '<div class="cgroup' + (open ? ' on' : '') + '" data-g="' + gi + '"><div class="chapgrid">' +
            g.map(function (x) { return chapLink(x, prog, marks, q); }).join('') + '</div></div>';
      }).join('');
      $('#chapPager').innerHTML = '';
      $$('#chapGrid .cvol').forEach(function (b) {
        b.addEventListener('click', function () {
          var gi = +b.dataset.g;
          var grp = $('#chapGrid .cgroup[data-g="' + gi + '"]');
          if (!grp) return;
          var open = !grp.classList.contains('on');
          grp.classList.toggle('on', open);
          b.classList.toggle('on', open);
          b.setAttribute('aria-expanded', open ? 'true' : 'false');
          gopen[gi] = open;
        });
      });
      return;
    }
    var total = Math.max(1, Math.ceil(list.length / chState.per));
    if (chState.page > total) chState.page = 1;
    var slice = list.slice((chState.page - 1) * chState.per, chState.page * chState.per);
    $('#chapGrid').innerHTML = slice.length
      ? slice.map(function (x) { return chapLink(x, prog, marks, q); }).join('')
      : '<div class="empty" style="grid-column:1/-1">Không tìm thấy chương nào khớp.</div>';
    $('#chapPager').innerHTML = total > 1
      ? '<button class="pg ' + (chState.page === 1 ? 'off' : '') + '" data-go="' + (chState.page - 1) + '">' + ic('left', 'i-s') + 'Trước</button>' +
        '<span class="pg dots">Trang ' + chState.page + '/' + total + '</span>' +
        '<button class="pg ' + (chState.page === total ? 'off' : '') + '" data-go="' + (chState.page + 1) + '">Sau' + ic('right', 'i-s') + '</button>'
      : '';
    $$('#chapPager [data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = +b.dataset.go;
        if (p < 1 || p > total) return;
        chState.page = p; renderChapters();
        $('#chapSec').scrollIntoView({ behavior: CZ.reduce ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }
  var chapQT = null;
  $('#chapQ').addEventListener('input', function (e) {
    clearTimeout(chapQT);
    var v = e.target.value;
    chapQT = setTimeout(function () { chState.q = v.trim(); chState.page = 1; renderChapters(); }, 150);
  });
  $('#chapSort').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    chState.sort = b.dataset.sort; chState.page = 1;
    $$('#chapSort button').forEach(function (x) { x.classList.toggle('on', x === b); });
    renderChapters();
  });
  /* người đọc gõ số chương nhìn thấy trên danh sách — số đó lấy từ tên chương nên
     có thể lệch vị trí (truyện có “Lời Mở Đầu”), vì vậy dò theo nhãn trước */
  function gotoChapter(want) {
    if (!want || !CHS.length) return;
    var pos = 0;
    for (var i = 0; i < CHS.length; i++) {
      if (chapSplit(CHS[i]).no === want) { pos = i + 1; break; }
    }
    if (!pos) pos = Math.max(1, Math.min(CHS.length, want));
    location.hash = '#chuong-' + pos;
  }
  function jumpFrom(el) {
    var want = parseInt(el.value, 10);
    if (!want) return;
    el.value = '';
    gotoChapter(want);
  }
  $('#chapJump').addEventListener('change', function (e) { jumpFrom(e.target); });
  $('#chapJump').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); jumpFrom(e.target); }
  });
  var goBtn = $('#chapGo');
  if (goBtn) goBtn.addEventListener('click', function () { jumpFrom($('#chapJump')); });

  function renderRelated() {
    var n = N;
    var lib = CZ.lib();
    var sameCouple = n.couple ? lib.filter(function (x) { return x.couple === n.couple && x.slug !== n.slug; }).slice(0, 6) : [];
    var sameAuthor = n.author ? lib.filter(function (x) { return x.author === n.author && x.slug !== n.slug; }).slice(0, 6) : [];
    var shown = 0;
    function put(sel, rows) {
      var wrap = $(sel).parentElement;      /* khối <div> bọc tiêu đề + danh sách */
      CZ.mountRail($(sel), rows);
      wrap.style.display = rows.length ? '' : 'none';
      if (rows.length) shown++;
    }
    put('#relCouple', sameCouple); put('#relAuthor', sameAuthor);
    $('#relSec').style.display = shown ? '' : 'none';
  }

  /* khối Đánh giá chỉ dựng khi người đọc mở tab (không kéo script bình luận từ đầu) */
  function mountGiscus() {
    var g = ((CZ._memo.reg || {}).settings || {}).giscus || {};
    var box = $('#giscus');
    if (!box) return;
    var note = $('#cmtNote'), sub = $('#cmtSub');
    if (!g.repo || !g.repoId) {
      box.innerHTML = '<div class="empty">Chưa gắn hệ thống bình luận.<div class="mt">Khi chủ web điền repo giscus trong trang quản trị, ô đánh giá sẽ hiện ở đây — web không dẫn người đọc sang nơi khác.</div></div>';
      if (note) note.textContent = 'Đánh giá chạy trên GitHub Discussions (giscus), gắn trong trang quản trị.';
      if (sub) sub.textContent = '';
      return;
    }
    if (note) note.textContent = 'Bình luận chạy trên GitHub Discussions (giscus) — không cần tài khoản riêng của web.';
    if (sub) sub.textContent = 'góp ý cho bộ truyện này';
    box.innerHTML = '';
    var s = document.createElement('script');
    s.src = 'https://giscus.app/client.js'; s.async = true;
    s.setAttribute('data-repo', g.repo); s.setAttribute('data-repo-id', g.repoId);
    s.setAttribute('data-mapping', 'pathname'); s.setAttribute('data-term', location.pathname);
    s.setAttribute('data-reactions-enabled', '1'); s.setAttribute('data-theme', 'preferred_color_scheme');
    s.setAttribute('data-lang', 'vi'); s.crossOrigin = 'anonymous';
    box.appendChild(s);
  }

  /* ======================= 4. TRANG ĐỌC ================================= */
  var RD_THEMES = [{ k: 'sang', l: 'Sáng' }, { k: 'kem', l: 'Kem' }, { k: 'xam', l: 'Xám' }, { k: 'toi', l: 'Tối' }];
  var SIZES = [{ k: 16, l: 'Nhỏ' }, { k: 18, l: 'Vừa' }, { k: 20, l: 'Lớn' }, { k: 23, l: 'Rất lớn' }];
  var WIDTHS = [{ k: 640, l: 'Hẹp' }, { k: 720, l: 'Vừa' }, { k: 900, l: 'Rộng' }];
  var LINES = [{ k: 1.6, l: 'Chặt' }, { k: 1.85, l: 'Vừa' }, { k: 2.1, l: 'Thoáng' }];
  function applyRD() {
    var s = CZ.rdGet();
    document.body.dataset.rd = s.theme;
    document.body.classList.toggle('rd-paged', s.mode === 'paged');
    document.body.classList.toggle('rd-scroll', s.mode !== 'paged');
    var el = $('#rdText');
    if (el) {
      el.classList.toggle('nofont', s.font === 'sans');
      el.classList.toggle('just', !!Number(s.justify));
    }
    document.documentElement.style.setProperty('--rd-size', s.size + 'px');
    document.documentElement.style.setProperty('--rd-line', s.line);
    document.documentElement.style.setProperty('--rd-w', s.width + 'px');
  }
  function paintSettings() {
    var s = CZ.rdGet();
    function row(label, key, opts, cast) {
      return '<div class="srow2"><span>' + label + '</span><div class="opts">' + opts.map(function (o) {
        var on = String(s[key]) === String(o.k);
        return '<button data-set="' + key + '" data-v="' + o.k + '" class="' + (on ? 'on' : '') + '">' + o.l + '</button>';
      }).join('') + '</div></div>';
    }
    function grp(title, body) {
      return '<div class="sgrp"><h5>' + title + '</h5>' + body + '</div>';
    }
    $('#setBody').innerHTML =
      grp('Cách hiển thị',
        row('Kiểu xem', 'mode', [{ k: 'scroll', l: 'Cuộn liên tục' }, { k: 'paged', l: 'Phân trang' }]) +
        row('Độ rộng cột chữ', 'width', WIDTHS)) +
      grp('Chữ',
        row('Cỡ chữ', 'size', SIZES) +
        row('Kiểu chữ', 'font', [{ k: 'serif', l: 'Có chân' }, { k: 'sans', l: 'Không chân' }]) +
        row('Giãn dòng', 'line', LINES) +
        row('Căn đều hai bên', 'justify', [{ k: 0, l: 'Tắt' }, { k: 1, l: 'Bật' }])) +
      grp('Nền đọc', row('Tông nền', 'theme', RD_THEMES)) +
      '<div class="srow2" style="border:0"><span class="sm muted">Mọi thay đổi áp dụng ngay và được nhớ cho lần sau.</span>' +
      '<button class="btn ghost sm" id="setReset">Mặc định</button></div>';
    $$('#setBody [data-set]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.set, v = b.dataset.v;
        var patch = {};
        patch[key] = (key === 'size' || key === 'width' || key === 'line') ? Number(v) : (key === 'justify' ? Number(v) : v);
        CZ.rdSet(patch);
        applyRD(); paintSettings(); relayout();
      });
    });
    $('#setReset').addEventListener('click', function () {
      CZ.rdSet({ mode: 'scroll', size: 18, font: 'serif', line: 1.85, theme: 'kem', width: 720, justify: 0 });
      applyRD(); paintSettings(); relayout(); CZ.toast('Đã về mặc định');
    });
  }
  function paintTOC() {
    $('#tocName').textContent = N.title;
    var pr = CZ.progress(N);
    $('#tocSub').textContent = CHS.length + ' chương' + (pr ? ' · đang ở chương ' + pr : '');
    var q = ($('#tocQ').value || '').trim().toLowerCase();
    var prog = CZ.progress(N), marks = CZ.marks(N);
    $('#tocList').innerHTML = CHS.map(function (c, i) {
      var n = i + 1;
      if (q && c.t.toLowerCase().indexOf(q) < 0 && String(n) !== q) return '';
      var sp = chapSplit(c);
      return '<a href="#chuong-' + n + '" data-ch="' + n + '" class="' + (n === cur ? 'on' : '') + (n < prog ? ' read' : '') + '">' +
        '<span class="no">' + (sp.no || '—') + '</span><span class="nm">' + esc(sp.name) + '</span>' +
        (marks.indexOf(n) >= 0 ? '<span class="ck">' + ic('star', 'i-s') + '</span>'
          : (n < prog ? '<span class="ck">' + ic('check', 'i-s') + '</span>' : '<span></span>')) + '</a>';
    }).join('') || '<div class="empty" style="border:0;background:none">Không có chương nào khớp.</div>';
  }
  $('#tocQ').addEventListener('input', paintTOC);
  function sheet(id, on) {
    var el = $(id);
    el.classList.toggle('on', on);
    document.body.classList.toggle('noscroll', on);
  }
  $$('[data-shut]').forEach(function (el) { el.addEventListener('click', function () { sheet('#tocSheet', false); sheet('#setSheet', false); }); });
  $$('#tocSheet .ibo, #setSheet .ibo').forEach(function (b) { b.innerHTML = ic('x', 'i-s'); });
  /* hai nút chuyển chương nhanh ngay trên thanh đọc (khỏi cuộn xuống cuối) */
  (function topNav() {
    var pv = $('#rdPrev'), nx = $('#rdNext');
    if (!pv || !nx) return;
    pv.innerHTML = ic('left', 'i-s');
    nx.innerHTML = ic('right', 'i-s');
    pv.addEventListener('click', function () { go(cur - 1); });
    nx.addEventListener('click', function () { go(cur + 1); });
  })();
  function paintTopNav() {
    var pv = $('#rdPrev'), nx = $('#rdNext');
    if (!pv) return;
    pv.disabled = cur <= 1;
    nx.disabled = cur >= CHS.length;
  }

  function toast(msg) {
    var t = $('#rdToast');
    t.innerHTML = msg; t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 2800);
  }
  /* ---- phân trang kiểu sách: cắt theo chiều cao thật của màn hình -------- */
  function rdAvail() {
    var bar = $('#rdBar');
    return Math.max(300, window.innerHeight - (bar ? bar.offsetHeight : 90) - 120);
  }
  function measure(txt) {
    var kids = Array.prototype.slice.call(txt.children);
    if (!kids.length) return [[0, 0]];
    var avail = rdAvail(), pages = [], start = 0, top0 = kids[0].offsetTop;
    kids.forEach(function (el, i) {
      if (i > start && (el.offsetTop + el.offsetHeight - top0) > avail) { pages.push([start, i - 1]); start = i; top0 = el.offsetTop; }
    });
    pages.push([start, kids.length - 1]);
    return pages;
  }
  function paintPage() {
    var seg = PAGES[PI] || [0, 0];
    var txt = $('#rdText');
    var kids = Array.prototype.slice.call(txt.children);
    if (!kids.length) return;
    kids.forEach(function (el, i) { el.style.display = (i >= seg[0] && i <= seg[1]) ? '' : 'none'; });
    $('#rdProgFill').style.width = (PAGES.length > 1 ? Math.round((PI + 1) / PAGES.length * 100) : 100) + '%';
    renderNav(true);
  }
  function repaginate() {
    var txt = $('#rdText');
    var kids = Array.prototype.slice.call(txt.children);
    kids.forEach(function (el) { el.style.display = ''; });
    if (CZ.rdGet().mode !== 'paged') { PAGES = []; PI = 0; return; }
    PAGES = measure(txt);
    PI = Math.min(PI, PAGES.length - 1);
    paintPage();
  }
  /* đổi cỡ chữ / nền / kiểu xem giữa chừng: đo lại mà KHÔNG mất chỗ đang đọc */
  function relayout() {
    repaginate();
    renderNav(CZ.rdGet().mode === 'paged' && PAGES.length > 0);
  }
  function renderNav(isPage) {
    var s = CZ.rdGet();
    var prev = cur > 1, next = cur < CHS.length;
    var first = !isPage || PI === 0, last = !isPage || PI >= PAGES.length - 1;
    var paged = s.mode === 'paged' && PAGES.length > 0;
    var left = paged
      ? (first ? (prev ? chapLabel(cur - 1) : 'Đầu bộ') : 'Trang ' + PI)
      : (prev ? chapLabel(cur - 1) : 'Đầu bộ');
    var right = paged
      ? (last ? (next ? chapLabel(cur + 1) : 'Hết bộ') : 'Trang ' + (PI + 2))
      : (next ? chapLabel(cur + 1) : 'Hết bộ');
    $('#rdNav').innerHTML =
      '<button id="navPrev" class="' + ((paged ? (first && !prev) : !prev) ? 'off' : '') + '"' +
        ((paged ? (first && !prev) : !prev) ? ' disabled' : '') + '>' +
        '<b>' + ic('left', 'i-s') + ' ' + (paged ? (first ? 'Chương trước' : 'Trang trước') : 'Chương trước') + '</b>' +
        '<small>' + esc(left) + '</small></button>' +
      '<button id="navToc" class="mid"><b>' + ic('list', 'i-s') + ' Mục lục</b><small>' + esc(chapLabel(cur)) +
        (paged ? ' · trang ' + (PI + 1) + '/' + PAGES.length : '') + '</small></button>' +
      '<button id="navNext" class="main' + ((paged ? (last && !next) : !next) ? ' off' : '') + '"' +
        ((paged ? (last && !next) : !next) ? ' disabled' : '') + '>' +
        '<b>' + (paged ? (last ? 'Chương tiếp theo' : 'Trang sau') : 'Chương tiếp theo') + ' ' + ic('right', 'i-s') + '</b>' +
        '<small>' + esc(right) + '</small></button>';
    $('#navPrev').addEventListener('click', function () { turn(-1); });
    $('#navNext').addEventListener('click', function () { turn(1); });
    $('#navToc').addEventListener('click', function () { sheet('#tocSheet', true); paintTOC(); });
  }
  function turn(dir) {
    var s = CZ.rdGet();
    if (s.mode === 'paged' && PAGES.length) {
      var target = PI + dir;
      if (target >= 0 && target < PAGES.length) { PI = target; paintPage(); return; }
      return go(cur + (dir > 0 ? 1 : -1), dir < 0 ? 'last' : 0);
    }
    return go(cur + dir);
  }
  function go(ch, pageHint) {
    if (ch < 1) return toast('Đây là chương đầu tiên.');
    if (ch > CHS.length) return toast('Bạn đã ở chương cuối.');
    location.hash = '#chuong-' + ch;
    if (pageHint === 'last') setTimeout(function () { PI = Math.max(0, PAGES.length - 1); paintPage(); }, 30);
  }
  /* đổi chương: nội dung cũ mờ dần rồi trượt sang trái, chương mới trượt vào từ phải.
     Vạch tiến độ trên thanh đọc chạy qua lại trong lúc chờ để mắt biết trang đang đổi. */
  var swapping = false;
  function renderCur(keepScroll, dir) {
    if (!CHS[cur - 1]) return;
    var box = $('#rd'), bar = $('#rdBar');
    /* hai kiểu chuyển chương: cuộn liên tục thì mờ dần + vệt quét (không xê dịch
       ngang, mắt đang ở giữa trang), phân trang thì trượt trái → vào từ phải */
    if (dir && !keepScroll && !CZ.reduce && box && !swapping) {
      var paged = CZ.rdGet().mode === 'paged';
      swapping = true;
      box.classList.add(paged ? 'cut-out' : 'cut-fade');
      if (bar) bar.classList.add('loading');
      setTimeout(function () {
        paintChapter(keepScroll);
        swapping = false;
        box.classList.remove('cut-out', 'cut-fade');
        box.classList.add(paged ? 'cut-in' : 'cut-in-soft');
        if (bar) setTimeout(function () { bar.classList.remove('loading'); }, 120);
        setTimeout(function () { box.classList.remove('cut-in', 'cut-in-soft'); }, 470);
      }, 170);
      return;
    }
    paintChapter(keepScroll);
  }
  function paintChapter(keepScroll) {
    var c = CHS[cur - 1];
    if (!c) return;
    var s = CZ.rdGet();
    var txt = $('#rdText');
    $('#rdTitle').textContent = N.title;
    $('#rdSub').textContent = chapLabel(cur) + (chapTotal() ? ' / ' + chapTotal() : '');
    $('#rdCrumb').innerHTML = '<a href="/#thu-vien">Thư viện</a> ' + ic('right', 'i-s') +
      ' <a href="' + esc(CZ.storyURL(N.slug)) + '" id="crumbStory">' + esc(N.title) + '</a> ' + ic('right', 'i-s') +
      ' <b>' + esc(chapLabel(cur)) + '</b>';
    $('#rdHead').textContent = c.t;
    var w = CZ.words(c.html);
    $('#rdMeta').innerHTML = [
      N.author ? '<span>' + ic('pen', 'i-s') + ' ' + esc(N.author) + '</span>' : '',
      w ? '<span>' + ic('clock', 'i-s') + ' ~' + Math.max(1, Math.round(w / 200)) + ' phút đọc</span>' : '',
      '<span>' + ic('eye', 'i-s') + ' ' + num(w) + ' từ</span>'
    ].join('');
    txt.innerHTML = cleanHTML(c.html);
    PAGES = []; PI = 0;
    if (s.mode === 'paged') { PAGES = measure(txt); paintPage(); } else renderNav(false);
    /* số liệu thật của bộ (không có thì không hiện số) */
    var st = CZ.statsOf(N);
    var acts = [
      '<button id="actLike" class="' + (CZ.isLiked(N) ? 'on' : '') + '">' + ic('thumb', 'i-s') + '<span>' +
        (CZ.isLiked(N) ? 'Đã thích' : 'Thích') + (st && st.votes ? ' · ' + num(st.votes) : '') + '</span></button>',
      '<button id="actSave" class="' + (CZ.inShelf(N) ? 'on' : '') + '">' + ic('bookmark', 'i-s') + '<span>' +
        (CZ.inShelf(N) ? 'Đã lưu' : 'Lưu vào tủ') + '</span></button>',
      '<button id="actMark">' + ic('star', 'i-s') + '<span>Đánh dấu</span></button>',
      '<button id="actComment">' + ic('chat', 'i-s') + '<span>Bình luận</span></button>',
      '<button id="actShare">' + ic('share', 'i-s') + '<span>Chia sẻ</span></button>',
      '<button id="actReport" class="ghost">' + ic('alert', 'i-s') + '<span>Báo lỗi chữ</span></button>'
    ];
    if (st && st.views) acts.unshift('<span class="chip">' + ic('eye', 'i-s') + ' ' + num(st.views) + ' lượt đọc (Firebase)</span>');
    $('#rdActs').innerHTML = acts.join('');
    paintMark();
    $('#actLike').addEventListener('click', function () {
      var on = CZ.toggleLike(N);
      var stx = CZ.statsOf(N);
      this.classList.toggle('on', on);
      this.querySelector('span').textContent = (on ? 'Đã thích' : 'Thích') + (stx && stx.votes ? ' · ' + num(stx.votes) : '');
      CZ.pop(this);
      toast(on ? 'Đã thích (lưu trên máy bạn)' : 'Đã bỏ thích');
    });
    $('#actSave').addEventListener('click', function () {
      var on = CZ.toggleShelf(N);
      this.classList.toggle('on', on);
      this.querySelector('span').textContent = on ? 'Đã lưu' : 'Lưu vào tủ';
      CZ.pop(this);
      toast(on ? 'Đã thêm vào tủ truyện' : 'Đã bỏ khỏi tủ truyện');
    });
    $('#actMark').addEventListener('click', function () {
      var on = CZ.toggleMark(N, cur);
      paintMark(); paintTOC();
      CZ.pop(this);
      toast(on ? 'Đã đánh dấu ' + chapLabel(cur) : 'Đã bỏ đánh dấu ' + chapLabel(cur));
    });
    $('#actComment').addEventListener('click', function () { exitReader(true); });
    $('#actShare').addEventListener('click', shareChapter);
    var rp = $('#actReport');
    if (rp) rp.addEventListener('click', function () {
      var text = 'Báo lỗi · ' + N.title + ' · ' + chapLabel(cur) + '\n' + location.origin + location.pathname +
        '#chuong-' + cur + '\n\nChỗ cần sửa: ';
      var m = CZ.modal('czReport',
        '<div class="mh"><h4>Báo lỗi chữ</h4></div>' +
        '<div class="mb"><p class="sm muted">Ghi rõ chỗ sai rồi copy nội dung dưới đây gửi cho chủ web (chat, mail…). ' +
        'Trang đã kèm sẵn tên bộ, số chương và đường dẫn.</p>' +
        '<textarea class="inp ta" id="rpText" rows="5" spellcheck="false">' + esc(text) + '</textarea></div>' +
        '<div class="mf"><button class="btn ghost" data-close>Đóng</button>' +
        '<button class="btn pri" id="rpCopy">' + ic('share', 'i-s') + 'Copy nội dung</button></div>');
      m.querySelector('#rpCopy').addEventListener('click', function () {
        CZ.copy(m.querySelector('#rpText').value, 'Đã copy nội dung báo lỗi');
      });
    });
    /* cuối chương: chỉ còn một lời dẫn, việc chuyển chương để thanh điều hướng dưới làm
       (bản trước vừa có nút “Chương tiếp theo” ở đây vừa có thanh dưới — trùng nhau) */
    var last = cur >= CHS.length;
    $('#rdEnd').innerHTML =
      '<div class="endrule" aria-hidden="true"></div>' +
      '<div class="endline">' +
        '<span class="endmark">' + (last ? 'Hết bộ' : 'Hết ' + esc(chapLabel(cur))) + '</span>' +
        (last
          ? '<span class="endsub">Bộ này đang cập nhật — lưu vào tủ truyện để quay lại khi có chương mới.</span>'
          : '<span class="endsub">Chương kế tiếp: <b>' + esc(CHS[cur].t) + '</b></span>') +
      '</div>' + (last ? '<a class="btn ghost sm mt" href="' + esc(CZ.storyURL(N.slug)) + '" id="endInfo">' + ic('info', 'i-s') + 'Về trang truyện</a>' : '');
    if (!keepScroll) window.scrollTo({ top: 0, behavior: 'auto' });
    $('#rdProgFill').style.width = (CHS.length ? Math.round(cur / CHS.length * 100) : 0) + '%';
    var pct = $('#rdPct');
    if (pct) pct.textContent = Math.round((CZ.rdGet().mode === 'paged' && PAGES.length ? (PI + 1) / PAGES.length : 1 / Math.max(1, CHS.length)) * 100) + '%';
    CZ.setProgress(N, cur);
    try { document.title = c.t + ' · ' + N.title + ' — chuseoz'; } catch (e) {}
    paintTOC(); paintTopNav();
    var cr = $('#crumbStory');
    if (cr) cr.addEventListener('click', function (e) { e.preventDefault(); exitReader(); });
  }
  function paintMark() {
    var on = CZ.marks(N).indexOf(cur) >= 0;
    $('#rdMark').classList.toggle('on', on);
    $('#rdMark').title = on ? 'Bỏ đánh dấu chương này (B)' : 'Đánh dấu chương này (B)';
  }
  function shareChapter() {
    CZ.copy(location.origin + CZ.storyURL(N.slug) + '#chuong-' + cur, 'Đã copy link ' + chapLabel(cur));
  }
  /* ---- vào / ra chế độ đọc --------------------------------------------- */
  function enterReader(ch) {
    if (!CHS.length) return;
    ch = Math.max(1, Math.min(CHS.length, ch || 1));
    var dir = reading && ch !== cur ? (ch > cur ? 1 : -1) : 0;
    cur = ch;
    if (!reading) { storyScroll = window.scrollY; reading = true; document.body.classList.add('reading'); }
    $('#rdBack').innerHTML = ic('left', 'i-s');
    $('#rdToc').innerHTML = ic('list', 'i-s');
    $('#rdSet').innerHTML = ic('gear', 'i-s');
    $('#rdFocus').innerHTML = ic('expand', 'i-s');
    $('#rdShare').innerHTML = ic('share', 'i-s');
    applyRD();
    renderCur(false, dir);
    wake();
  }
  function exitReader(toComments) {
    reading = false;
    document.body.classList.remove('reading');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    try { document.title = N.title + ' · chuseoz'; } catch (e) {}
    if (toComments) showTab('cmt', true);
    else window.scrollTo({ top: storyScroll, behavior: 'auto' });
    renderStory(); renderChapters();
  }
  /* ---- thanh công cụ tự ẩn sau 3 giây ---------------------------------- */
  var idleT = null;
  function sleep() {
    if ($('#setSheet').classList.contains('on') || $('#tocSheet').classList.contains('on')) return;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
    document.body.classList.add('rd-hide');
  }
  function wake() {
    document.body.classList.remove('rd-hide');
    clearTimeout(idleT);
    idleT = setTimeout(sleep, 3000);
  }
  ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (reading) wake(); }, { passive: true });
  });
  var rdLastY = 0;
  window.addEventListener('scroll', function () {
    if (!reading) return;
    var y = window.scrollY || 0, dy = y - rdLastY;
    /* cuộn xuống để đọc → thanh trượt lên khỏi tầm mắt; cuộn ngược lên một chút → hiện lại ngay */
    if (Math.abs(dy) > 6) {
      if (dy > 0 && y > 140 && !document.body.classList.contains('rd-focus')) {
        document.body.classList.add('rd-hide');
        clearTimeout(idleT);
      } else if (dy < 0) wake();
      rdLastY = y;
    }
    /* tiến độ đọc trong chương (theo vị trí cuộn) */
    if (CZ.rdGet().mode === 'paged') return;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (h > 0) {
      var p = Math.min(100, Math.max(0, y / h * 100));
      $('#rdProgFill').style.width = p + '%';
      var pc = $('#rdPct');
      if (pc) pc.textContent = Math.round(p) + '%';
    }
  }, { passive: true });

  $('#storyTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.stab');
    if (b) showTab(b.dataset.tab);
  });
  $('#storyTabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var bs = $$('#storyTabs .stab'), i = bs.indexOf(e.target.closest('.stab'));
    if (i < 0) return;
    e.preventDefault();
    var to = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
    showTab(to.dataset.tab);
    to.focus();
  });
  window.addEventListener('resize', paintInk);
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(paintInk);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && reading) return;      /* Esc trong trang đọc do phần đọc lo */
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return;
    if (!reading) {
      if (e.key === '1' && !e.ctrlKey && !e.metaKey) showTab('info');
      if (e.key === '2' && !e.ctrlKey && !e.metaKey) showTab('chap');
      if (e.key === '3' && !e.ctrlKey && !e.metaKey) showTab('cmt');
    }
  });
  $('#rdBack').addEventListener('click', function () { exitReader(); });
  $('#rdSet').addEventListener('click', function () { sheet('#setSheet', true); paintSettings(); });
  $('#rdToc').addEventListener('click', function () {
    sheet('#tocSheet', true); paintTOC();
    setTimeout(function () { $('#tocQ').focus(); }, 50);
  });
  $('#rdMark').addEventListener('click', function () {
    var on = CZ.toggleMark(N, cur);
    paintMark(); paintTOC();
    toast(on ? 'Đã đánh dấu ' + chapLabel(cur) : 'Đã bỏ đánh dấu ' + chapLabel(cur));
  });
  $('#rdFocus').addEventListener('click', function () {
    var on = document.body.classList.toggle('rd-focus');
    this.classList.toggle('on', on);
    toast(on ? 'Chế độ tập trung: chỉ còn nội dung truyện' : 'Đã tắt chế độ tập trung');
  });
  $('#rdShare').addEventListener('click', shareChapter);
  document.addEventListener('click', function (e) {
    var a = e.target.closest('#tocList a[data-ch]');
    if (a) { sheet('#tocSheet', false); }
  });
  /* ảnh trong chương: bấm để xem lớn */
  document.addEventListener('click', function (e) {
    var img = e.target.closest('#rdText img');
    if (img) { $('#lightbox').querySelector('img').src = img.src; $('#lightbox').classList.add('on'); return; }
    if (e.target.id === 'lightbox' || e.target.closest('#lightbox')) $('#lightbox').classList.remove('on');
  });
  document.addEventListener('keydown', function (e) {
    if (!reading) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return;
    if (e.key === 'Escape') {
      if ($('#lightbox').classList.contains('on')) { $('#lightbox').classList.remove('on'); return; }
      if ($('#setSheet').classList.contains('on') || $('#tocSheet').classList.contains('on')) { sheet('#setSheet', false); sheet('#tocSheet', false); return; }
      exitReader(); return;
    }
    var paged = CZ.rdGet().mode === 'paged';
    if (e.key === 'ArrowRight' || (paged && (e.key === 'PageDown' || e.key === ' '))) { e.preventDefault(); turn(1); }
    else if (e.key === 'ArrowLeft' || (paged && e.key === 'PageUp')) { e.preventDefault(); turn(-1); }
    else if (e.key === 'b' || e.key === 'B') $('#rdMark').click();
    else if (e.key === 'f' || e.key === 'F') $('#rdFocus').click();
    else if (e.key === 'l' || e.key === 'L') $('#rdToc').click();
    else if (e.key === '?') toast('← → chuyển chương · Space xuống trang · B đánh dấu · F tập trung · L mục lục · Esc về trang truyện');
  });
  /* vuốt ngang để chuyển chương */
  (function () {
    var x0 = null, y0 = null;
    document.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (x0 == null || !reading || CZ.rdGet().mode === 'paged') { x0 = null; return; }
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) turn(dx < 0 ? 1 : -1);
      x0 = y0 = null;
    }, { passive: true });
  })();
  window.addEventListener('resize', function () {
    clearTimeout(window.__rdRT);
    window.__rdRT = setTimeout(function () { if (reading) repaginate(); }, 180);
  });

  /* ---- định tuyến theo hash -------------------------------------------- */
  function route(ev) {
    var ch = chapterWanted();
    /* link ?ch=… : chuẩn hoá về hash để Back/Forward hoạt động như nhau */
    if (ch && !chapterFromHash() && location.search) {
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { ev = ev; }
    }
    if (ch) enterReader(ch);
    else if (reading) exitReader();
  }
  window.addEventListener('hashchange', function () { route(); });

  /* ======================= 5. KHỞI ĐỘNG ================================= */
  function showError(title, html, reload) {
    $('#shero').innerHTML = '<div class="in" style="grid-template-columns:1fr"><div>' +
      '<h1>' + esc(title) + '</h1>' + html +
      '<div class="btn-row mt"><a class="btn pri" href="/">Về thư viện</a>' +
      (reload ? '<button class="btn ghost" type="button" id="errReload">Tải lại trang</button>' : '') +
      '</div></div></div>';
    var rb = $('#errReload');
    if (rb) rb.addEventListener('click', function () { location.reload(); });
    try { document.title = title + ' · chuseoz'; } catch (e) {}
    $('#chapSec').style.display = 'none';
    $('#relSec').style.display = 'none';
    $('#pane-cmt').style.display = 'none';
    $('#pane-info').style.display = 'none';
    $('#storyTabs').style.display = 'none';
    $('#rd').style.display = 'none';
  }
  /* khung xám chờ: hiện ngay khi mở trang, nội dung thật về là thay */
  function skeletonStory() {
    var hero = $('#shero');
    if (hero && !hero.innerHTML) {
      hero.innerHTML = '<div class="skhero" aria-hidden="true">' +
        '<span class="cv rskel"></span>' +
        '<div><span class="ln big rskel"></span><span class="ln mid rskel"></span><span class="ln sm rskel"></span>' +
        '<span class="ln mid rskel"></span><span class="bx rskel"></span></div></div>';
    }
    var grid = $('#chapGrid');
    if (grid && !grid.innerHTML) {
      var one = '<span class="skchap rskel" aria-hidden="true"></span>';
      grid.innerHTML = new Array(9).join(one);
    }
  }
  CZ.mountShell({ active: 'library' });          /* đầu trang hiện ngay */
  skeletonStory();
  function boot(reg) {
    CZ.mountShell({ active: 'library' });
    if (!SLUG) { showError('Không rõ truyện nào', '<p class="muted">Đường dẫn thiếu tên truyện. Chọn một bộ trong thư viện để bắt đầu đọc.</p>'); return; }
    var meta = CZ.findLib(SLUG);
    if (reg && (!CZ._memo.reg)) CZ._memo.reg = reg;
    CZ.book(SLUG).then(function (bk) {
      if (!bk || !bk.chapters) {
        if (meta) {
          N = meta;
          showError(meta.title, '<p class="muted">Chưa tải được nội dung bộ này — thử tải lại trang sau ít phút.</p>', true);
        } else {
          showError('Không tìm thấy truyện “' + SLUG + '”', '<p class="muted">Bộ này không có trong thư viện. Xem danh sách đầy đủ ở trang chủ.</p>');
        }
        return;
      }
      BOOK = bk;
      CHS = bk.chapters.map(function (c) { return { t: String(c.t || '').trim() || 'Chương', html: c.html || '' }; });
      N = CZ.norm(Object.assign({}, meta || {}, {
        title: (meta && meta.title) || bk.title || SLUG, slug: SLUG,
        author: (meta && meta.author) || bk.author || '', couple: (meta && meta.couple) || bk.couple || '',
        chapters: CHS.length, countLabel: (meta && meta.countLabel) || (CHS.length + ' chương')
      }));
      N.url = CZ.storyURL(SLUG);
      N.canRead = CHS.length > 0;
      try { document.title = N.title + ' · chuseoz'; } catch (e) {}
      var md = document.querySelector('meta[name="description"]');
      if (md) md.setAttribute('content', (N.syn || N.title) .slice(0, 180));
      renderStory(); renderChapters(); renderRelated();
      showTab(/danh-gia|binh-luan/.test(location.hash) ? 'cmt' : (/gioi-thieu/.test(location.hash) ? 'info' : 'chap'));
      CZ.reveal();
      route();
      /* nhắc khi vào bằng link chương cụ thể */
      var ch = chapterFromHash();
      if (ch && CHS.length) setTimeout(function () { toast('Mở thẳng ' + chapLabel(ch) + '.'); }, 400);
      CZ.onStats(function () { renderStory(); if (reading) renderCur(true); });
    }).catch(function (e) {
      showError('Lỗi tải truyện', '<p class="muted">' + esc(e && e.message || e) + '</p>', true);
    });
  }
  CZ.registry().then(function (r) { boot(r.reg); }).catch(function () { boot(null); });
})();
