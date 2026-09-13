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
  function safeDec(s) {
    try { return decodeURIComponent(s); } catch (e) { try { return decodeURI(s); } catch (e2) { return s; } }
  }
  function slugFromURL() {
    /* ưu tiên query trước để tránh lỗi path */
    var qSlug = CZ.qs('slug') || CZ.qs('truyen') || '';
    if (qSlug) return qSlug.trim();
    var raw = location.pathname || '';
    var rawParts = raw.split('/').filter(Boolean);
    var p = rawParts.map(safeDec);
    var reserved = { 'truyen': 1, 'reader': 1, 'admin': 1, 'api': 1, 'index': 1, 'guide': 1, 'data': 1 };
    /* /truyen/<slug>/ và /reader/<slug>/ — tên truyện nằm ngay sau */
    for (var i = 0; i < p.length; i++) {
      if (p[i] === 'truyen' || p[i] === 'reader') {
        var cand = p[i + 1] || '';
        cand = String(cand).trim();
        if (cand) {
          cand = cand.replace(/\.html?$/i, '');
          if (cand && !reserved[cand] && cand.indexOf('.') < 0) return cand;
        }
        break;
      }
    }
    /* nếu không có tiền tố truyen/reader, thử lấy segment cuối cùng không phải reserved */
    if (p.length) {
      var last = String(p[p.length - 1] || '').trim().replace(/\.html?$/i, '');
      if (last && !reserved[last] && last.length >= 2 && last.indexOf('.') < 0) {
        /* tránh nhầm file css/js */
        if (!/\.(js|css|json|png|jpg|jpeg|svg|ico)$/i.test(last)) return last;
      }
      /* thử từ cuối lên */
      for (var j = p.length - 1; j >= 0; j--) {
        var seg = String(p[j] || '').trim().replace(/\.html?$/i, '');
        if (seg && !reserved[seg] && seg.length >= 2 && seg.indexOf('.') < 0) {
          if (!/\.(js|css|json|png|jpg|jpeg|svg|ico)$/i.test(seg)) return seg;
        }
      }
    }
    return '';
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
  function chapKindOf(title) {
    var t = String(title || '').toLowerCase();
    if (/ngoại\s*truyện|phụ\s*chương|side\s*story|\bextra\b|hậu\s*truyện|\bepilogue\b|đặc\s*biệt/.test(t)) return 'extra';
    if (/lời\s*mở\s*đầu|mở\s*đầu|\bprologue\b|đôi\s*lời|lời\s*tác\s*giả|lời\s*ngỏ|author\s*note/.test(t)) return 'open';
    return 'main';
  }
  function chapSplit(c) {
    var t = String((c && c.t) || '').trim();
    var m = /^(?:chương|chap|chapter)\s*(\d+)\s*[:.\-–—]?\s*(.*)$/i.exec(t);
    if (m) {
      var no = parseInt(m[1], 10);
      var kind = no === 0 ? 'open' : chapKindOf(t);
      return { no: no, name: m[2] || t, full: t, kind: kind };
    }
    var e = /^(?:ngoại\s*truyện|phụ\s*chương|side\s*story|extra)\s*(\d+)?\s*[:.\-–—]?\s*(.*)$/i.exec(t);
    if (e) return { no: e[1] ? parseInt(e[1], 10) : 0, name: e[2] || t, full: t, kind: 'extra' };
    var kind = chapKindOf(t);
    return { no: 0, name: t || 'Chương', full: t, kind: kind };
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
            '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(CZ.statusLabel(n.statusCls || n.status)) + '</span>' +
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
      ['Tình trạng', CZ.statusLabel(n.statusCls || n.status)],
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
    var k = sp.kind || 'main';
    var no = k === 'open' ? 'Mở' : (k === 'extra' ? (sp.no ? 'NT' + sp.no : 'NT') : (sp.no || '—'));
    return '<a class="cha k-' + k + on + '" href="#chuong-' + x.i + '" data-ch="' + x.i + '" title="' + esc(x.c.t) + '">' +
      '<span class="no">' + no + '</span><span class="nm">' + hl(sp.name, q) + '</span>' +
      (marks.indexOf(x.i) >= 0 ? '<span class="done marked" title="Chương đã đánh dấu">' + ic('bookmark', 'i-s') + '</span>'
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
    function bindVols() {
      $$('#chapGrid .cvol').forEach(function (b) {
        b.addEventListener('click', function () {
          var gi = b.dataset.g;
          var grp = $('#chapGrid .cgroup[data-g="' + gi + '"]');
          if (!grp) return;
          var open = !grp.classList.contains('on');
          grp.classList.toggle('on', open);
          b.classList.toggle('on', open);
          b.setAttribute('aria-expanded', open ? 'true' : 'false');
          gopen[gi] = open;
        });
      });
    }
    function volBlock(key, title, rows, autoOpen) {
      if (!rows.length) return '';
      var open = gopen[key] == null ? autoOpen : !!gopen[key];
      gopen[key] = open;
      return '<button class="cvol' + (open ? ' on' : '') + '" data-g="' + key + '" type="button" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          ic('right', 'i-s') + title +
          '<span class="ct">' + rows.length + '</span></button>' +
        '<div class="cgroup' + (open ? ' on' : '') + '" data-g="' + key + '"><div class="chapgrid">' +
          rows.map(function (x) { return chapLink(x, prog, marks, q); }).join('') + '</div></div>';
    }
    if (!q) {
      var opens = [], mains = [], extras = [];
      list.forEach(function (x) {
        var k = chapSplit(x.c).kind || 'main';
        if (k === 'open') opens.push(x);
        else if (k === 'extra') extras.push(x);
        else mains.push(x);
      });
      var hasKinds = opens.length + extras.length > 0;
      if (hasKinds || mains.length > 24) {
        var html = '';
        var hasCur = list.some(function (x) { return x.i === prog; });
        if (opens.length) html += volBlock('open', 'Mở đầu / lời tác giả', opens, !hasCur || opens.some(function (x) { return x.i === prog; }));
        if (mains.length > 24) {
          var per = 24, gi, chunk;
          for (gi = 0; gi * per < mains.length; gi++) {
            chunk = mains.slice(gi * per, gi * per + per);
            var a = chapSplit(chunk[0].c).no || chunk[0].i;
            var b = chapSplit(chunk[chunk.length - 1].c).no || chunk[chunk.length - 1].i;
            var auto = chunk.some(function (x) { return x.i === prog; }) || (!hasCur && !opens.length && gi === 0);
            html += volBlock('m' + gi, 'Chương ' + a + '–' + b, chunk, auto);
          }
        } else if (mains.length) {
          html += volBlock('main', 'Chương', mains, !hasCur || mains.some(function (x) { return x.i === prog; }) || !opens.length);
        }
        if (extras.length) html += volBlock('extra', 'Ngoại truyện / đặc biệt', extras, extras.some(function (x) { return x.i === prog; }));
        $('#chapGrid').innerHTML = html;
        $('#chapPager').innerHTML = '';
        bindVols();
        return;
      }
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

  function relCard(n) {
    var img = n.thumb || n.slide || '';
    return '<a class="relcard" href="' + esc(CZ.storyURL(n.slug)) + '" title="' + esc(n.title) + '">' +
      '<span class="rc-th' + (img ? '' : ' noimg') + '">' +
        (img ? '<img src="' + esc(img) + '" alt="Bìa ' + esc(n.title) + '" loading="lazy" decoding="async" width="120" height="180">' : '') +
      '</span>' +
      '<span class="rc-body">' +
        '<b>' + esc(n.title) + '</b>' +
        '<span class="rc-meta">' + esc([n.author, n.couple].filter(Boolean).join(' · ') || '—') + '</span>' +
        '<span class="rc-foot">' +
          '<span class="pill ' + n.statusCls + '"><span class="d"></span>' + esc(CZ.statusLabel(n.statusCls || n.status)) + '</span>' +
          '<span class="rc-ch">' + esc(CZ.countText(n)) + '</span>' +
        '</span>' +
      '</span></a>';
  }
  function renderRelated() {
    var n = N;
    var lib = CZ.lib();
    var sameCouple = n.couple ? lib.filter(function (x) { return x.couple === n.couple && x.slug !== n.slug; }).slice(0, 6) : [];
    var sameAuthor = n.author ? lib.filter(function (x) { return x.author === n.author && x.slug !== n.slug; }).slice(0, 6) : [];
    var shown = 0;
    function put(sel, rows) {
      var el = $(sel);
      var wrap = el.parentElement;
      el.innerHTML = rows.map(relCard).join('');
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
  var RD_THEMES = [
    { k: 'sang', l: 'Sáng' }, { k: 'kem', l: 'Kem' }, { k: 'toi', l: 'Tối' }
  ];
  var FONTS = [
    { k: 'serif', l: 'Serif' },
    { k: 'sans', l: 'Sans' }
  ];
  var WIDTHS = [{ k: 640, l: 'Hẹp' }, { k: 720, l: 'Vừa' }, { k: 900, l: 'Rộng' }];
  function applyRD() {
    var s = CZ.rdGet();
    document.body.dataset.rd = s.theme;
    document.body.dataset.rdFont = s.font || 'serif';
    document.body.classList.toggle('rd-paged', s.mode === 'paged');
    document.body.classList.toggle('rd-scroll', s.mode !== 'paged');
    var el = $('#rdText');
    if (el) {
      el.classList.remove('nofont');
      el.classList.toggle('just', !!Number(s.justify));
    }
    document.documentElement.style.setProperty('--rd-size', (s.size||18) + 'px');
    document.documentElement.style.setProperty('--rd-line', s.line || 1.85);
    document.documentElement.style.setProperty('--rd-para', (s.para||1.05) + 'em');
    document.documentElement.style.setProperty('--rd-w', (s.width||720) + 'px');
    /* đảm bảo font family được áp ngay cả khi CSS cũ còn cache */
    if (el) {
      var fontMap = {
        'serif': 'var(--font-head)',
        'sans': '"Be Vietnam Pro", var(--font)'
      };
      var fam = fontMap[s.font] || 'var(--font-head)';
      el.style.fontFamily = fam;
    }
  }
  function paintSettings() {
    var s = CZ.rdGet();
    function row(label, key, opts) {
      return '<div class="srow2"><span>' + label + '</span><div class="opts">' + opts.map(function (o) {
        var on = String(s[key]) === String(o.k);
        return '<button data-set="' + key + '" data-v="' + o.k + '" class="' + (on ? 'on' : '') + '">' + o.l + '</button>';
      }).join('') + '</div></div>';
    }
    function grp(title, body) {
      return '<div class="sgrp"><h5>' + title + '</h5>' + body + '</div>';
    }
    function sliderRow(label, key, min, max, step, unit) {
      var v = s[key] != null ? s[key] : (key==='size'?18:key==='line'?1.85:key==='para'?1.05:720);
      return '<div class="srow2 sl"><div class="sl-head"><span>' + label + '</span><b id="sl-'+key+'">' + v + (unit||'') + '</b></div>' +
        '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" data-range="' + key + '" aria-label="' + label + '">' +
        '</div>';
    }
    $('#setBody').innerHTML =
      grp('Cách hiển thị',
        row('Kiểu xem', 'mode', [{ k: 'scroll', l: 'Cuộn liên tục' }, { k: 'paged', l: 'Phân trang' }]) +
        row('Độ rộng cột chữ', 'width', WIDTHS) +
        '<div class="srow2"><span>Toàn màn hình</span><div class="opts small"><button id="fsBtn">' + ic('expand','i-s') + ' Bật fullscreen</button></div></div>') +
      grp('Chữ',
        sliderRow('Cỡ chữ', 'size', 14, 28, 1, 'px') +
        row('Kiểu chữ', 'font', FONTS) +
        sliderRow('Giãn dòng', 'line', 1.4, 2.4, 0.05, '') +
        sliderRow('Giãn đoạn', 'para', 0.6, 1.8, 0.05, 'em') +
        row('Căn đều hai bên', 'justify', [{ k: 0, l: 'Tắt' }, { k: 1, l: 'Bật' }])) +
      grp('Nền đọc', row('Nền đọc', 'theme', RD_THEMES)) +
      '<div class="srow2" style="border:0"><span></span>' +
      '<button class="btn ghost sm" id="setReset">Về mặc định</button></div>';
    $$('#setBody [data-set]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.set, v = b.dataset.v;
        var patch = {};
        patch[key] = (key === 'size' || key === 'width' || key === 'line' || key === 'para') ? Number(v) : (key === 'justify' ? Number(v) : v);
        CZ.rdSet(patch);
        applyRD(); paintSettings(); relayout();
      });
    });
    $$('#setBody [data-range]').forEach(function (r) {
      var key = r.dataset.range;
      function update(val) {
        var patch = {}; patch[key] = Number(val);
        CZ.rdSet(patch);
        applyRD(); relayout();
        var lab = document.getElementById('sl-'+key);
        if (lab) lab.textContent = val + (key==='size'?'px':key==='para'?'em':'');
      }
      r.addEventListener('input', function () { update(this.value); });
      r.addEventListener('change', function () { update(this.value); });
    });
    var fsBtn = $('#fsBtn');
    if (fsBtn) fsBtn.addEventListener('click', function () {
      try {
        if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); toast('Đã vào fullscreen — bấm Esc để thoát'); }
        else { document.exitFullscreen(); }
      } catch(e) { toast('Trình duyệt không hỗ trợ fullscreen'); }
    });
    $('#setReset').addEventListener('click', function () {
      CZ.rdSet({ mode: 'scroll', size: 18, font: 'serif', line: 1.85, para: 1.05, theme: 'kem', width: 720, justify: 0 });
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
        (marks.indexOf(n) >= 0 ? '<span class="ck">' + ic('bookmark', 'i-s') + '</span>'
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
    // reading time & word count removed per request
    $('#rdMeta').innerHTML = [
      N.author ? '<span>' + ic('pen', 'i-s') + ' ' + esc(N.author) + '</span>' : ''
    ].filter(Boolean).join('');
    txt.innerHTML = cleanHTML(c.html);
    PAGES = []; PI = 0;
    if (s.mode === 'paged') { PAGES = measure(txt); paintPage(); } else renderNav(false);
    /* số liệu thật của bộ (không có thì không hiện số) */
    var st = CZ.statsOf(N);
    function actBtn(id, ico, label, on) {
      return '<button id="' + id + '" class="' + (on ? 'on' : '') + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
        ic(ico, 'i-s') + '<span class="lbl">' + esc(label) + '</span></button>';
    }
    var likeL = (CZ.isLiked(N) ? 'Đã thích' : 'Thích') + (st && st.votes ? ' · ' + num(st.votes) : '');
    var saveL = CZ.inShelf(N) ? 'Đã lưu' : 'Lưu vào tủ';
    var acts = [
      actBtn('actLike', 'thumb', likeL, CZ.isLiked(N)),
      actBtn('actSave', 'bookmark', saveL, CZ.inShelf(N)),
      actBtn('actMark', 'bookmark', CZ.marks(N).indexOf(cur) >= 0 ? 'Đã đánh dấu' : 'Đánh dấu', CZ.marks(N).indexOf(cur) >= 0),
      actBtn('actComment', 'chat', 'Bình luận', false),
      actBtn('actShare', 'share', 'Chia sẻ', false),
      actBtn('actReport', 'alert', 'Báo lỗi chữ', false)
    ];
    if (st && st.views) acts.unshift('<span class="chip" title="số liệu Firebase">' + ic('eye', 'i-s') + '<span class="lbl">' + num(st.views) + ' lượt đọc</span></span>');
    $('#rdActs').innerHTML = acts.join('');
    paintMark();
    $('#actLike').addEventListener('click', function () {
      var on = CZ.toggleLike(N);
      var stx = CZ.statsOf(N);
      var lab = (on ? 'Đã thích' : 'Thích') + (stx && stx.votes ? ' · ' + num(stx.votes) : '');
      this.classList.toggle('on', on);
      this.querySelector('span').textContent = lab;
      this.setAttribute('title', lab);
      this.setAttribute('aria-label', lab);
      CZ.pop(this);
      toast(on ? 'Đã thích (lưu trên máy bạn)' : 'Đã bỏ thích');
    });
    $('#actSave').addEventListener('click', function () {
      var on = CZ.toggleShelf(N);
      var lab = on ? 'Đã lưu' : 'Lưu vào tủ';
      this.classList.toggle('on', on);
      this.querySelector('span').textContent = lab;
      this.setAttribute('title', lab);
      this.setAttribute('aria-label', lab);
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
      var cfg = CZ.reportCfg ? CZ.reportCfg() : { email: 'chuseoz.ofc@gmail.com', form: 'https://forms.gle/YW3PvtrNVQ7xt8nCA' };
      var text = 'Báo lỗi · ' + N.title + ' · ' + chapLabel(cur) + '\n' + location.origin + location.pathname +
        '#chuong-' + cur + '\n\nChỗ cần sửa: ';
      var m = CZ.modal('czReport',
        '<div class="mh"><h4>Báo lỗi chữ</h4></div>' +
        '<div class="mb"><p class="sm muted">Ghi rõ chỗ sai. Bạn có thể gửi qua email hoặc form khảo sát — trang đã kèm sẵn tên bộ, số chương và link.</p>' +
        '<textarea class="inp ta" id="rpText" rows="5" spellcheck="false">' + esc(text) + '</textarea>' +
        '<div class="mt row"><a class="btn ghost sm" id="rpMail" href="#">' + ic('mail', 'i-s') + 'Gửi email</a>' +
        '<a class="btn ghost sm" id="rpForm" href="' + esc(cfg.form) + '" target="_blank" rel="noopener">' + ic('edit','i-s') + ' Mở form</a></div></div>' +
        '<div class="mf"><button class="btn ghost" data-close>Đóng</button>' +
        '<button class="btn pri" id="rpCopy">' + ic('copy','i-s') + 'Copy nội dung</button></div>');
      function mailHref(){
        var body = m.querySelector('#rpText').value;
        var subj = encodeURIComponent('Báo lỗi · ' + N.title + ' · ' + chapLabel(cur));
        var b = encodeURIComponent(body);
        return 'https://mail.google.com/mail/?fs=1&tf=cm&to=' + encodeURIComponent(cfg.email) + '&su=' + subj + '&body=' + b;
      }
      m.querySelector('#rpCopy').addEventListener('click', function () {
        CZ.copy(m.querySelector('#rpText').value, 'Đã copy nội dung báo lỗi');
      });
      var mailBtn = m.querySelector('#rpMail');
      if (mailBtn) mailBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.open(mailHref(), '_blank', 'noopener');
      });
    });
    /* cuối chương: đã bỏ dòng Hết chương / Chương kế tiếp theo yêu cầu */
    var last = cur >= CHS.length;
    $('#rdEnd').innerHTML = last
      ? '<div class="endrule" aria-hidden="true"></div><div class="endline"><span class="endsub">Bộ này đang cập nhật — lưu vào tủ truyện để quay lại khi có chương mới.</span></div><a class="btn ghost sm mt" href="' + esc(CZ.storyURL(N.slug)) + '" id="endInfo">' + ic('info', 'i-s') + 'Về trang truyện</a>'
      : '<div class="endrule" aria-hidden="true"></div>';
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
    var am = $('#actMark');
    if (am) {
      var lab = on ? 'Đã đánh dấu' : 'Đánh dấu';
      am.classList.toggle('on', on);
      var sp = am.querySelector('.lbl') || am.querySelector('span');
      if (sp) sp.textContent = lab;
      am.setAttribute('title', lab);
      am.setAttribute('aria-label', lab);
    }
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
    $('#rdMark').innerHTML = ic('bookmark', 'i-s');
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
  var idleT = null, rdLock = 0;
  function sleep() {
    if ($('#setSheet').classList.contains('on') || $('#tocSheet').classList.contains('on')) return;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
    document.body.classList.add('rd-hide');
  }
  function wake() {
    if (rdLock) return;
    document.body.classList.remove('rd-hide');
    clearTimeout(idleT);
    idleT = setTimeout(sleep, 3000);
  }
  ['pointerdown', 'pointermove', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (!reading) return;
      if (ev === 'pointerdown' || ev === 'keydown' || ev === 'touchstart') rdLock = 0;
      wake();
    }, { passive: true });
  });
  var rdLastY = 0;
  window.addEventListener('scroll', function () {
    if (!reading) return;
    var y = window.scrollY || 0, dy = y - rdLastY;
    /* cuộn xuống: khoá wake một nhịp để pointermove khỏi nhấp nháy thanh trên */
    if (Math.abs(dy) > 6) {
      if (dy >= 12 && y > 160 && !document.body.classList.contains('rd-focus')) {
        document.body.classList.add('rd-hide');
        rdLock = 1;
        clearTimeout(idleT);
        clearTimeout(wake._ul);
        wake._ul = setTimeout(function () { rdLock = 0; }, 320);
      } else if (dy < 0) { rdLock = 0; wake(); }
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
