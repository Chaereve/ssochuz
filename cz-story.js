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
    if (p[0] === 'truyen' && p[1]) return decodeURIComponent(p[1]);
    /* /reader cũ (và mọi trang .html) → lấy slug trong query */
    if (p[0] === 'reader' || !p.length || /\.html?$/i.test(p[0] || '')) {
      return CZ.qs('slug') || CZ.qs('truyen') || '';
    }
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
     Nội dung lấy từ Blogger/KV nên vẫn giữ in đậm/nghiêng/ảnh/link, nhưng bỏ
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
     Dữ liệu Blogger hay mở đầu bằng “Lời Mở Đầu”, nên số thứ tự trong danh
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
        '<div class="cover">' + (im ? '<img src="' + esc(im) + '" alt="Bìa ' + esc(n.title) + '" width="300" height="450" fetchpriority="high">' : '') +
          (n.is18 ? '<span class="b18">18+</span>' : '') + '</div>' +
        '<div>' +
          '<h1>' + esc(n.title) + '</h1>' +
          '<div class="meta">' +
            '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(n.status || '—') + '</span>' +
            '<span>' + ic('book', 'i-s') + ' <b>' + esc(CZ.countText(n)) + '</b></span>' +
            (n.author ? '<span>' + ic('pen', 'i-s') + ' ' + esc(n.author) + '</span>' : '') +
            (n.couple ? '<span>' + ic('users', 'i-s') + ' ' + esc(n.couple) + '</span>' : '') +
            (n.year ? '<span>' + esc(n.year) + '</span>' : '') +
            '<span>' + ic('film', 'i-s') + ' ' + esc(CZ.adaptText(n)) + '</span>' +
            '<span>' + ic('refresh', 'i-s') + ' ' + esc(CZ.timeAgo(n.updated)) + '</span>' +
            statChip() +
          '</div>' +
          '<p class="syn clamp" id="synBox">' + esc(syn) + '</p>' +
          '<div class="btn-row">' + readBtn(n, ch) +
            (n.canRead && ch && ch < n.chapters ? '<a class="btn ghost lg" href="#chuong-' + n.chapters + '">' + ic('up', 'i-s') + 'Chương mới nhất</a>' : '') +
            '<button class="btn ghost" id="shelfBtn" aria-pressed="' + CZ.inShelf(n) + '">' + ic('bookmark', 'i-s') +
              '<span>' + (CZ.inShelf(n) ? 'Đã lưu' : 'Tủ truyện') + '</span></button>' +
            '<button class="btn ghost" id="shareBtn">' + ic('share', 'i-s') + 'Chia sẻ</button>' +
            (n.blog ? '<a class="btn ghost" href="' + esc(n.blog) + '" target="_blank" rel="noopener">' + ic('link', 'i-s') + 'Bài gốc</a>' : '') +
          '</div>' +
          (ch && n.chapters ? '<div class="prog"><div class="lbl"><span>Tiến độ đọc của bạn</span>' +
            '<span>còn ' + Math.max(0, n.chapters - ch) + ' chương · ' + progressPct(n, ch) + '%</span></div>' +
            '<div class="bar"><i style="width:' + progressPct(n, ch) + '%"></i></div></div>' : '') +
          (n.synFull && n.synFull.length > (n.syn || '').length
            ? '<button class="synbtn mt" id="synMore">Xem mô tả đầy đủ</button>' : '') +
        '</div>' +
      '</div>';
    var sb = $('#synBox');
    if (sb && syn.length < 200) sb.classList.remove('clamp');
    var more = $('#synMore');
    if (more) more.addEventListener('click', function () {
      $('#synBox').classList.toggle('clamp');
      this.textContent = $('#synBox').classList.contains('clamp') ? 'Xem mô tả đầy đủ' : 'Thu gọn mô tả';
    });
    var sh = $('#shelfBtn');
    if (sh) sh.addEventListener('click', function () {
      var on = CZ.toggleShelf(n);
      sh.setAttribute('aria-pressed', on);
      sh.classList.toggle('on', on);
      sh.querySelector('span').textContent = on ? 'Đã lưu' : 'Tủ truyện';
      CZ.toast(on ? 'Đã thêm vào tủ truyện' : 'Đã bỏ khỏi tủ truyện');
    });
    $('#shareBtn').addEventListener('click', function () { CZ.copy(location.origin + CZ.storyURL(n.slug), 'Đã copy link bộ truyện'); });
    $('#crumb').innerHTML = '<a href="/">Trang chủ</a> ' + ic('right', 'i-s') + ' <a href="/#thu-vien">Thư viện</a> ' +
      ic('right', 'i-s') + ' <b>' + esc(n.title) + '</b>';
    $('#chapTop').setAttribute('href', n.canRead ? '#chuong-' + n.chapters : '#');
    $('#chapTop').style.display = n.canRead ? '' : 'none';
    $('#chapCount').textContent = n.canRead
      ? (n.declared > n.chapters
        ? 'đang có ' + n.chapters + '/' + n.declared + ' chương'
        : n.chapters + ' chương')
      : 'chưa có chương nào — đang ở trạng thái “Sắp ra mắt”';
  }

  function renderChapters() {
    if (!N || !N.canRead) {
      $('#chapGrid').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">Bộ này chưa đăng chương nào</div>' +
        'Đang ở trạng thái <b>Sắp ra mắt</b>. Theo dõi thông báo chương mới trên ' +
        '<a href="' + esc(N && N.blog || CZ.BLOG + '/p/list-novel.html') + '" target="_blank" rel="noopener" style="color:var(--acc)">Blogger</a>.</div>';
      $('#chapPager').innerHTML = '';
      return;
    }
    var prog = CZ.progress(N);
    var marks = CZ.marks(N);
    var q = chState.q.toLowerCase();
    var list = CHS.map(function (c, i) { return { c: c, i: i + 1 }; })
      .filter(function (x) { return !q || x.c.t.toLowerCase().indexOf(q) >= 0 || String(x.i) === q; });
    if (chState.sort === 'new') list.reverse();
    var total = Math.max(1, Math.ceil(list.length / chState.per));
    if (chState.page > total) chState.page = 1;
    var slice = list.slice((chState.page - 1) * chState.per, chState.page * chState.per);
    function hl(t) {
      if (!q) return esc(t);
      try { return esc(t).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark class="hit">$1</mark>'); }
      catch (e) { return esc(t); }
    }
    $('#chapGrid').innerHTML = slice.length ? slice.map(function (x) {
      var on = x.i === prog ? ' now' : '';
      var sp = chapSplit(x.c);
      return '<a class="cha' + on + '" href="#chuong-' + x.i + '" data-ch="' + x.i + '" title="' + esc(x.c.t) + '">' +
        '<span class="no">' + (sp.no || '—') + '</span><span class="nm">' + hl(sp.name) + '</span>' +
        (marks.indexOf(x.i) >= 0 ? '<span class="done" title="Chương đã đánh dấu">' + ic('star', 'i-s') + '</span>'
          : (x.i < prog ? '<span class="done" title="Đã đọc">' + ic('check', 'i-s') + '</span>' : '')) + '</a>';
    }).join('') : '<div class="empty" style="grid-column:1/-1">Không tìm thấy chương nào khớp.</div>';
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
  $('#chapJump').addEventListener('change', function (e) {
    var want = parseInt(e.target.value, 10);
    if (!want || !CHS.length) return;
    e.target.value = '';
    location.hash = '#chuong-' + Math.max(1, Math.min(CHS.length, want));
  });

  function renderRelated() {
    var n = N;
    var lib = CZ.lib();
    var grp = (CZ.series() || []).filter(function (g) { return (g.parts || []).indexOf(n.title) >= 0; })[0];
    var sameSeries = grp ? grp.parts.filter(function (t) { return t !== n.title; })
      .map(function (t) { return lib.filter(function (x) { return x.title === t; })[0]; }).filter(Boolean) : [];
    var sameCouple = n.couple ? lib.filter(function (x) { return x.couple === n.couple && x.slug !== n.slug; }).slice(0, 6) : [];
    var sameAuthor = n.author ? lib.filter(function (x) { return x.author === n.author && x.slug !== n.slug; }).slice(0, 6) : [];
    var shown = 0;
    function put(sel, rows) {
      var wrap = $(sel).parentElement;      /* khối <div> bọc tiêu đề + danh sách */
      CZ.mountRail($(sel), rows);
      wrap.style.display = rows.length ? '' : 'none';
      if (rows.length) shown++;
    }
    put('#relSeries', sameSeries); put('#relCouple', sameCouple); put('#relAuthor', sameAuthor);
    $('#relSec').style.display = shown ? '' : 'none';
  }

  function renderGiscus() {
    var g = ((CZ._memo.reg || {}).settings || {}).giscus || {};
    var box = $('#giscus');
    if (!g.repo || !g.repoId) {
      $('#cmtNote').innerHTML = 'Chưa gắn bình luận. Bạn có thể đọc & bình luận bài gốc trên ' +
        '<a href="' + esc(N && N.blog || CZ.BLOG) + '" target="_blank" rel="noopener">Blogger</a>.';
      return;
    }
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
    $('#setBody').innerHTML =
      row('Kiểu xem', 'mode', [{ k: 'scroll', l: 'Cuộn liên tục' }, { k: 'paged', l: 'Phân trang' }]) +
      row('Cỡ chữ', 'size', SIZES) +
      row('Kiểu chữ', 'font', [{ k: 'serif', l: 'Có chân' }, { k: 'sans', l: 'Không chân' }]) +
      row('Giãn dòng', 'line', LINES) +
      row('Nền đọc', 'theme', RD_THEMES) +
      row('Độ rộng cột chữ', 'width', WIDTHS) +
      row('Căn đều hai bên', 'justify', [{ k: 0, l: 'Tắt' }, { k: 1, l: 'Bật' }]) +
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
    $('#tocSub').textContent = CHS.length + ' chương';
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
  function renderCur(keepScroll) {
    var c = CHS[cur - 1];
    if (!c) return;
    var s = CZ.rdGet();
    var txt = $('#rdText');
    $('#rdTitle').textContent = N.title;
    $('#rdSub').textContent = chapLabel(cur) + (chapTotal() ? ' / ' + chapTotal() : '');
    $('#rdCrumb').innerHTML = '<a href="/">Thư viện</a> ' + ic('right', 'i-s') +
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
      (N.blog ? '<a class="btn ghost sm" href="' + esc(N.blog) + '" target="_blank" rel="noopener">' + ic('alert', 'i-s') + 'Báo lỗi / bài gốc</a>' : ''),
      '<button id="actShare">' + ic('share', 'i-s') + '<span>Chia sẻ</span></button>'
    ];
    if (st && st.views) acts.unshift('<span class="chip">' + ic('eye', 'i-s') + ' ' + num(st.views) + ' lượt đọc (Firebase)</span>');
    $('#rdActs').innerHTML = acts.join('');
    paintMark();
    $('#actLike').addEventListener('click', function () {
      var on = CZ.toggleLike(N);
      var stx = CZ.statsOf(N);
      this.classList.toggle('on', on);
      this.querySelector('span').textContent = (on ? 'Đã thích' : 'Thích') + (stx && stx.votes ? ' · ' + num(stx.votes) : '');
      toast(on ? 'Đã thích (lưu trên máy bạn)' : 'Đã bỏ thích');
    });
    $('#actSave').addEventListener('click', function () {
      var on = CZ.toggleShelf(N);
      this.classList.toggle('on', on);
      this.querySelector('span').textContent = on ? 'Đã lưu' : 'Lưu vào tủ';
      toast(on ? 'Đã thêm vào tủ truyện' : 'Đã bỏ khỏi tủ truyện');
    });
    $('#actMark').addEventListener('click', function () {
      var on = CZ.toggleMark(N, cur);
      paintMark(); paintTOC();
      toast(on ? 'Đã đánh dấu ' + chapLabel(cur) : 'Đã bỏ đánh dấu ' + chapLabel(cur));
    });
    $('#actComment').addEventListener('click', function () { exitReader(true); });
    $('#actShare').addEventListener('click', shareChapter);
    /* cuối chương */
    $('#rdEnd').innerHTML = cur < CHS.length
      ? '<div class="card2"><div class="grow"><b>Hết ' + esc(chapLabel(cur)) + '</b><div class="sm muted">Tiếp theo: ' + esc(CHS[cur].t) + '</div></div>' +
        '<button class="btn pri" id="endNext">Chương ' + (cur + 1) + ' ' + ic('right', 'i-s') + '</button></div>'
      : '<div class="card2"><div class="grow"><b>Bạn đã đọc tới chương cuối (' + CHS.length + ')</b>' +
        '<div class="sm muted">Bộ này đang cập nhật — lưu vào tủ truyện để quay lại sau.</div></div>' +
        '<a class="btn ghost" href="' + esc(CZ.storyURL(N.slug)) + '" id="endInfo">Về trang truyện</a></div>';
    var en = $('#endNext');
    if (en) en.addEventListener('click', function () { go(cur + 1); });
    if (!keepScroll) window.scrollTo({ top: 0, behavior: 'auto' });
    $('#rdProgFill').style.width = (CHS.length ? Math.round(cur / CHS.length * 100) : 0) + '%';
    CZ.setProgress(N, cur);
    try { document.title = c.t + ' · ' + N.title + ' — chuseoz'; } catch (e) {}
    paintTOC();
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
    cur = ch;
    if (!reading) { storyScroll = window.scrollY; reading = true; document.body.classList.add('reading'); }
    $('#rdBack').innerHTML = ic('left', 'i-s');
    $('#rdToc').innerHTML = ic('list', 'i-s');
    $('#rdSet').innerHTML = ic('gear', 'i-s');
    $('#rdFocus').innerHTML = ic('expand', 'i-s');
    $('#rdShare').innerHTML = ic('share', 'i-s');
    applyRD();
    renderCur();
    wake();
  }
  function exitReader(toComments) {
    reading = false;
    document.body.classList.remove('reading');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    try { document.title = N.title + ' · chuseoz'; } catch (e) {}
    window.scrollTo({ top: toComments ? ($('#cmts').offsetTop - 60) : storyScroll, behavior: 'auto' });
    if (toComments) { $('#cmts').scrollIntoView({ behavior: CZ.reduce ? 'auto' : 'smooth' }); }
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
  window.addEventListener('scroll', function () {
    if (!reading) return;
    wake();
    /* tiến độ đọc trong chương (theo vị trí cuộn) */
    if (CZ.rdGet().mode === 'paged') return;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (h > 0) $('#rdProgFill').style.width = Math.min(100, Math.max(0, window.scrollY / h * 100)) + '%';
  }, { passive: true });

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
  function showError(title, html) {
    $('#shero').innerHTML = '<div class="in" style="grid-template-columns:1fr"><div>' +
      '<h1>' + esc(title) + '</h1>' + html + '<div class="btn-row mt"><a class="btn pri" href="/">Về thư viện</a></div></div></div>';
    $('#chapSec').style.display = 'none';
    $('#relSec').style.display = 'none';
    $('#cmts').style.display = 'none';
    $('#rd').style.display = 'none';
  }
  CZ.mountShell({ active: 'library' });          /* đầu trang hiện ngay */
  function boot(reg) {
    CZ.mountShell({ active: 'library' });
    if (!SLUG) { showError('Không rõ truyện nào', '<p class="muted">Đường dẫn thiếu tên truyện. Chọn một bộ trong thư viện để bắt đầu đọc.</p>'); return; }
    var meta = CZ.findLib(SLUG);
    if (reg && (!CZ._memo.reg)) CZ._memo.reg = reg;
    CZ.book(SLUG).then(function (bk) {
      if (!bk || !bk.chapters) {
        if (meta) {
          N = meta;
          showError(meta.title, '<p class="muted">Chưa tải được nội dung bộ này. ' +
            (meta.blog ? 'Đọc bài gốc trên <a href="' + esc(meta.blog) + '" target="_blank" rel="noopener" style="color:var(--acc)">Blogger</a> hoặc ' : '') +
            'thử lại sau ít phút.</p>');
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
      renderStory(); renderChapters(); renderRelated(); renderGiscus();
      CZ.reveal();
      route();
      /* nhắc khi vào bằng link chương cụ thể */
      var ch = chapterFromHash();
      if (ch && CHS.length) setTimeout(function () { toast('Mở thẳng ' + chapLabel(ch) + '.'); }, 400);
      CZ.onStats(function () { renderStory(); if (reading) renderCur(true); });
    }).catch(function (e) {
      showError('Lỗi tải truyện', '<p class="muted">' + esc(e && e.message || e) + '</p>');
    });
  }
  CZ.registry().then(function (r) { boot(r.reg); }).catch(function () { boot(null); });
})();
