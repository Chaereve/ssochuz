/* Trang đọc — bản dựng lại (r89). Ba cách sắp xếp, một bộ tương tác.
   Không thư viện ngoài. Trạng thái lưu trong localStorage. */
(function () {
  'use strict';
  if (!window.CHAPDATA) return;
  var D = window.CHAPDATA, CH = D.ch, KEY = 'sso-rd-r89b';
  var NCHAP = CH.filter(function (c) { return /^Chương\s+\d/.test(c.t); }).length;
  var BOOK = D.book || 'Third Person';

  var ICON = {
    back: '<path d="M15 6l-6 6l6 6"/>',
    next: '<path d="M9 6l6 6l-6 6"/>',
    toc: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    set: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    mark: '<path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3l-5 3V6a2 2 0 0 1 2-2"/>',
    focus: '<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M4 16v2a2 2 0 0 0 2 2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M16 20h2a2 2 0 0 0 2-2v-2"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6l-12 12"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    heart: '<path d="M19.5 12.6L12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6z"/>',
    shelf: '<path d="M4 19V5a1 1 0 0 1 1-1h4v16H5a1 1 0 0 1-1-1z"/><path d="M11 4h4a1 1 0 0 1 1 1v14h-5"/><path d="M18 4l2 .7a1 1 0 0 1 .7 1.2L18 19"/>',
    bell: '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3l1 2H5l1-2v-3a7 7 0 0 1 4-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-1.5 4L16 12H5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/>',
    chev: '<path d="M6 9l6 6l6-6"/>',
    comment: '<path d="M8 9h8"/><path d="M8 13h5"/><path d="M21 12c0 4.4-4 8-9 8c-1 0-2-.14-2.9-.4L4 21l1.4-4.2A7.6 7.6 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/>'
  };
  function ic(name, w) {
    return '<svg viewBox="0 0 24 24" width="' + (w || 20) + '" height="' + (w || 20) + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + ICON[name] + '</svg>';
  }
  var ST = ['sso-brick', 'sso-love-it', 'sso-cry-flood', 'sso-crown-chaos', 'sso-fighting', 'sso-flattened'];
  var STNAME = { 'sso-brick': 'Sụp đổ', 'sso-love-it': 'Mê rồi', 'sso-cry-flood': 'Khóc lụt nhà',
    'sso-crown-chaos': 'Đội vương miện', 'sso-fighting': 'Sẵn sàng chiến', 'sso-flattened': 'Bị đè bẹp' };

  /* ---------------- trạng thái ---------------- */
  var DEF = { rd: 'kem', size: 18, line: 1.8, w: 720, para: 1.05, font: 'serif', just: 0 };
  var S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { S = {}; }
  Object.keys(DEF).forEach(function (k) { if (S[k] === undefined) S[k] = DEF[k]; });
  if (!S.v) S.v = 'c';
  if (!S.toc) S.toc = 'a';
  S.openC = S.openC || {};
  if (S.ch === undefined) S.ch = 2;
  S.cm = S.cm || {}; S.mark = S.mark || {}; S.like = S.like || {};
  if (!S.seeded) {
    S.cm[2] = [
      { n: 'Minh Anh', tm: '2 giờ trước', x: 'Đoạn tả bức tường đọc mà buồn cười, kiểu gì cũng có chuyện.' },
      { n: 'hạt mầm', tm: 'hôm qua', x: 'Chương này ngắn mà dẫn truyện khéo ghê.', s: 'sso-love-it' }
    ];
    S.seeded = 1;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var B = document.body;
  var BAR = $('#bar'), HEAD = $('#head'), OVER = $('#overline'), H1 = $('#h1'), META = $('#meta'),
      TXT = $('#txt'), TAIL = $('#tail'), CMTS = $('#cmts'), DOCK = $('#dock');

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function chapNo(t) { var m = /^Chương\s+(\d+)/.exec(t); return m ? +m[1] : 0; }
  function titleName(t) { return t.replace(/^Chương\s+\d+\s*:\s*/, '').replace(/^Lời\s+Mở\s+Đầu$/i, 'Lời mở đầu'); }
  function shortName(t) { var n = chapNo(t); return n ? 'Chương ' + n : titleName(t); }
  function kindOf(t) {
    if (/^Lời\s+mở\s+đầu/i.test(t)) return { k: 'intro', h: 'Mở đầu' };
    if (/^Chương\s+\d/i.test(t)) return { k: 'chap', h: 'Chương' };
    if (/^Ngoại\s+truyện/i.test(t)) return { k: 'extra', h: 'Ngoại truyện' };
    if (/^Lời\s+tác\s+giả/i.test(t)) return { k: 'note', h: 'Lời tác giả' };
    if (/^Lời\s+kết/i.test(t)) return { k: 'end', h: 'Lời kết' };
    return { k: 'other', h: 'Khác' };
  }
  function wordCount(ps) {
    return ps.join(' ').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
  }
  function fmt(n) { return n.toLocaleString('vi-VN'); }

  /* ---------------- toast ---------------- */
  var TOASTS = $('#toasts');
  function toast(msg, sticker) {
    var d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = (sticker ? '<img src="st/' + sticker + '.webp" alt="">' : '') + '<span>' + esc(msg) + '</span>';
    TOASTS.appendChild(d);
    setTimeout(function () {
      d.classList.add('out');
      d.addEventListener('animationend', function () { d.remove(); }, { once: true });
      setTimeout(function () { if (d.parentNode) d.remove(); }, 300);
    }, 2200);
  }

  /* ---------------- hiển thị ---------------- */
  function apply(animate) {
    B.dataset.rd = S.rd;
    var st = B.style;
    st.setProperty('--fs', S.size + 'px');
    st.setProperty('--lh', String(S.line));
    st.setProperty('--w', S.w + 'px');
    st.setProperty('--para', S.para + 'em');
    st.setProperty('--read', S.font === 'sans' ? 'var(--sans)' : 'var(--serif)');
    TXT.classList.toggle('just', !!+S.just);
    syncSet();
    save();
  }

  /* ---------------- thanh trên ---------------- */
  function barHtml() {
    var v = S.v, c = CH[S.ch], n = chapNo(c.t);
    var kind = n ? 'Chương ' + n + ' / ' + NCHAP : kindOf(CH[S.ch].t).h.toLowerCase();
    var sub = v === 'a' ? kind : (BOOK + ' · ' + kind);
    var title = v === 'a' ? BOOK : titleName(c.t);
    var acts = '';
    acts += '<button class="ibo" type="button" data-act="toc" aria-label="Mục lục" title="Mục lục">' + ic('toc') + '</button>';
    acts += '<button class="ibo" type="button" data-act="mark" aria-label="Đánh dấu chương" title="Đánh dấu" aria-pressed="false">' + ic('mark') + '</button>';
    if (v === 'a') acts += '<button class="ibo" type="button" data-act="focus" aria-label="Chế độ tập trung" title="Tập trung">' + ic('focus') + '</button>';
    acts += '<button class="ibo" type="button" data-act="set" aria-label="Cài đặt đọc" title="Cài đặt">' + ic('set') + '</button>';
    var mid = '';
    if (v === 'b') mid = '<span class="pct" id="pct">0%</span>';
    if (v === 'c') mid = '<div class="ticks" id="ticks" aria-hidden="true">' +
      '<i></i><i></i><i></i><i></i><i></i><i></i></div>';
    return '<div class="bin">' +
      '<button class="ibo" type="button" data-act="back" aria-label="Quay lại truyện">' + ic('back') + '</button>' +
      '<a class="bti" href="#" data-act="back"><b>' + esc(title) + '</b><span class="sub">' + esc(sub) + '</span></a>' +
      mid + '<div class="bacts">' + acts + '</div></div>' +
      '<div class="prog"><i id="progBar"></i></div>';
  }

  /* ---------------- cuối chương ---------------- */
  function actsHtml(kind) {
    var items = [['heart', 'Thích', 'like'], ['shelf', 'Lưu', 'shelf'], ['bell', 'Theo dõi', 'follow'],
      ['comment', 'Bình luận', 'cmt'], ['flag', 'Báo lỗi', 'report']];
    return '<div class="acts ' + kind + '">' + items.map(function (it) {
      return '<a href="#" data-act="' + it[2] + '" aria-pressed="false">' + ic(it[0]) +
        '<span>' + it[1] + '</span></a>';
    }).join('') + '</div>';
  }
  function navHtml(v) {
    var i = S.ch, pv = i > 0 ? CH[i - 1] : null, nx = i < CH.length - 1 ? CH[i + 1] : null;
    if (v === 'b') {
      return '<nav class="rnav b">' +
        '<a class="row" href="#" data-act="next"' + (nx ? '' : ' data-off') + '>' +
        '<span class="k">Chương tiếp theo</span><span class="v">' + esc(nx ? titleName(nx.t) : 'Hết') +
        ' ' + ic('next', 16) + '</span></a>' +
        '<a class="row" href="#" data-act="prev"' + (pv ? '' : ' data-off') + '>' +
        '<span class="k">Chương trước</span><span class="v">' + ic('back', 16) + ' ' +
        esc(pv ? titleName(pv.t) : 'Hết') + '</span></a>' +
        '<button class="row mid" type="button" data-act="toc"><span class="k">Mục lục</span>' +
        '<span class="v">' + CH.length + ' mục ' + ic('next', 16) + '</span></button></nav>';
    }
    if (v === 'c') {
      return '<nav class="rnav c">' +
        '<a class="pv" href="#" data-act="prev"' + (pv ? '' : ' data-off') + '>' +
        '<span class="k">' + ic('back', 14) +
          esc(pv ? (chapNo(pv.t) ? shortName(pv.t) : 'Mục trước') : 'Chương đầu') + '</span>' +
        '<span class="v">' + esc(pv ? titleName(pv.t) : 'Đây là chương đầu') + '</span></a>' +
        '<a class="nx" href="#" data-act="next"' + (nx ? '' : ' data-off') + '>' +
        '<span class="k">' + esc(nx ? (chapNo(nx.t) ? shortName(nx.t) : 'Mục tiếp') : 'Hết') +
          ic('next', 14) + '</span>' +
        '<span class="v">' + esc(nx ? titleName(nx.t) : 'Hết truyện') + '</span></a></nav>';
    }
    return '<nav class="rnav a">' +
      '<a class="nb" href="#" data-act="prev"' + (pv ? '' : ' data-off') + '>' +
      '<span class="k">' + ic('back', 14) + ' Chương trước</span><span class="v">' +
      esc(pv ? titleName(pv.t) : 'Hết') + '</span></a>' +
      '<button class="nb mid" type="button" data-act="toc"><span class="k">Mục lục</span>' +
      '<span class="v">' + CH.length + ' mục</span></button>' +
      '<a class="nb nex" href="#" data-act="next"' + (nx ? '' : ' data-off') + '>' +
      '<span class="k">Chương tiếp theo ' + ic('next', 14) + '</span><span class="v">' +
      esc(nx ? titleName(nx.t) : 'Hết') + '</span></a></nav>';
  }
  function tailHtml() {
    var v = S.v, n = chapNo(CH[S.ch].t);
    var acts = v === 'b' ? actsHtml('strip') : actsHtml(v === 'c' ? 'link tight' : 'link');
    var mid = v === 'a'
      ? '<a class="nb mid" href="#" data-act="toc"><span class="k">Mục lục</span><span class="v">' + CH.length + ' mục</span></a>'
      : '';
    return '<div class="hend"><span>' + (n ? 'Hết chương ' + n : 'Hết mục') + '</span></div>' +
      acts + (v === 'a' ? navHtml('a') : navHtml(v));
  }
  function dockHtml() {
    var it = [['toc', 'Mục lục'], ['mark', 'Đánh dấu'], ['focus', 'Tập trung'],
      ['full', 'Toàn màn'], ['set', 'Cài đặt']];
    return it.map(function (x) {
      return '<button class="dk" type="button" data-act="' + x[0] + '" aria-label="' + x[1] +
        '" aria-pressed="false">' + ic(x[0], 19) + '<span>' + x[1] + '</span></button>';
    }).join('');
  }

  /* ---------------- bình luận ---------------- */
  function cmtsHtml() {
    var v = S.v;
    var form = '<form class="cform" id="cmtForm" novalidate>' +
      '<label class="fl"><span>Tên hiển thị</span><input type="text" id="cmtName" value="Khách" maxlength="24" autocomplete="off"></label>' +
      '<label class="fl"><span>Nội dung</span><textarea id="cmtText" rows="3" maxlength="600" placeholder="Cảm nhận của bạn về chương này…"></textarea></label>' +
      '<div class="crow"><button type="button" class="sticker" id="cmtStickerBtn" aria-expanded="false">' +
      ic('comment', 18) + '<span>Kèm sticker</span></button><span class="cstick" id="cmtStick" hidden></span>' +
      '<button type="submit" class="btn-pri" id="cmtSend">Gửi</button></div>' +
      '<div class="pickrow" id="cmtPick" hidden>' + ST.map(function (s) {
        return '<button type="button" data-pick="' + s + '" aria-label="' + STNAME[s] + '">' +
          '<img src="st/' + s + '.webp" alt=""></button>';
      }).join('') + '</div><p class="err" id="cmtErr" hidden>Bạn chưa viết gì.</p></form>';
    var body = v === 'c'
      ? '<details class="fold" id="cmtFold"><summary><span class="pl">' + ic('plus', 17) +
        '</span><span class="pl2">Viết bình luận…</span></summary>' + form + '</details>'
      : form;
    return '<div class="chead"><h2>Bình luận</h2><span class="cnt" id="cmtCount">0</span>' +
      '<button class="sort" type="button" data-act="sort" aria-label="Đổi thứ tự bình luận">' +
      '<span id="sortLbl">Mới nhất</span>' + ic('chev', 14) + '</button></div>' +
      '<div class="clist" id="cmtList"></div>' + body +
      '<p class="fine">Bình luận hiển thị công khai. Vui lòng giữ lịch sự.</p>';
  }

  /* ---------------- vẽ lại ---------------- */
  function paintBar() {
    BAR.innerHTML = barHtml();
    BAR.firstChild.classList.add('swap-in');
    var m = $('[data-act=mark]', BAR); if (m) m.setAttribute('aria-pressed', String(!!S.mark[S.ch]));
    progress();
  }
  function paintTail() {
    TAIL.innerHTML = tailHtml();
    TAIL.classList.add('swap-in');
    syncChapterUI();
  }
  function paintDock() {
    DOCK.innerHTML = S.v === 'a' ? dockHtml() : '';
    syncChapterUI();
  }
  function paintCmts() {
    CMTS.innerHTML = cmtsHtml();
    renderCmts();
    if (S.v === 'c' && S.foldOpen) { var f = $('#cmtFold'); if (f) f.open = true; }
  }
  function paintAll() {
    B.dataset.v = S.v;
    paintBar(); paintTail(); paintDock(); paintCmts(); paintHead();
    save();
  }
  function paintHead() {
    var c = CH[S.ch], n = chapNo(c.t);
    HEAD.classList.remove('swap-in'); void HEAD.offsetWidth; HEAD.classList.add('swap-in');
    var kd = kindOf(c.t);
    OVER.innerHTML = esc(kd.k === 'chap' ? 'Chương ' + n : kd.h) + '<span class="dot"></span>' + esc(BOOK);
    H1.textContent = titleName(c.t);
    var w = c.w || wordCount(c.ps);
    c.w = w;
    META.innerHTML = '<span>' + fmt(w) + ' từ</span><span class="sep">·</span><span>' +
      Math.max(1, Math.round(w / 250)) + ' phút đọc</span><span class="sep">·</span><span>' +
      (n ? 'Chương ' + n + ' / ' + NCHAP : esc(kindOf(c.t).h).toLowerCase()) + '</span>';
  }
  function paintTxt(instant) {
    var c = CH[S.ch];
    var html = c.ps.map(function (p) {
      if (p === '§') return '<hr>';
      if (p.length < 26 && /^\d{1,2}:\d{2}/.test(p)) return '<p class="beat">' + p + '</p>';
      return '<p>' + p + '</p>';
    }).join('');
    if (instant) { TXT.innerHTML = html; return; }
    TXT.classList.add('swap');
    setTimeout(function () {
      TXT.innerHTML = html;
      TXT.classList.remove('swap');
    }, 170);
  }

  /* ---------------- đồng bộ trạng thái ---------------- */
  function syncChapterUI() {
    setLabel('like', S.like[S.ch] ? 'Đã thích' : 'Thích');
    setLabel('shelf', S.shelf ? 'Đã lưu' : 'Lưu');
    setLabel('follow', S.follow ? 'Đã theo dõi' : 'Theo dõi');
    ['like', 'shelf', 'follow'].forEach(function (a) {
      var on = a === 'like' ? !!S.like[S.ch] : !!S[a];
      $$('[data-act="' + a + '"]').forEach(function (el) { el.setAttribute('aria-pressed', String(on)); });
    });
    var marked = !!S.mark[S.ch];
    $$('[data-act="mark"]').forEach(function (el) { el.setAttribute('aria-pressed', String(marked)); });
    var cnt = cmtsOf(S.ch).length;
    setLabel('cmt', cnt ? 'Bình luận ' + cnt : 'Bình luận');
  }
  function setLabel(act, text) {
    $$('[data-act="' + act + '"]').forEach(function (el) {
      var s = el.querySelector('span'); if (s) s.textContent = text;
    });
  }
  /* ---------------- chương ---------------- */
  function load(i, opts) {
    opts = opts || {};
    i = Math.max(0, Math.min(CH.length - 1, i));
    var changed = i !== S.ch;
    S.ch = i; save();
    if (changed && !opts.keepScroll) window.scrollTo(0, 0);
    paintTxt();
    setTimeout(function () { paintHead(); paintBar(); paintTail(); paintDock(); paintCmts(); }, changed ? 90 : 0);
    document.title = CH[i].t + ' · ' + BOOK;
    markCur();
  }

  /* ---------------- mục lục: ba kiểu, chọn ngay trong ngăn kéo ------------- */
  var TQ = '';
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }
  function chapList() {
    var out = [];
    CH.forEach(function (c, i) { var n = chapNo(c.t); if (n) out.push({ i: i, t: c.t, n: n }); });
    return out;
  }
  function otherList() {
    var out = [];
    CH.forEach(function (c, i) { if (!chapNo(c.t)) out.push({ i: i, t: c.t, n: 0 }); });
    return out;
  }
  function curNo() { return chapNo(CH[S.ch].t); }
  function curName() { return titleName(CH[S.ch].t); }

  /* dải ngữ cảnh: đang ở đâu trong truyện */
  function ctxHtml() {
    var n = curNo(), pct = n ? Math.round(n / NCHAP * 100) : 0;
    return '<div class="mctx"><span class="eyebrow">Đang đọc</span>' +
      '<span class="ct">' + esc(n ? 'Chương ' + n + ' · ' + curName() : curName()) + '</span>' +
      '<span class="cn">' + (n ? n + ' / ' + NCHAP : '—') + '</span>' +
      '<span class="mbar"><i style="width:' + pct + '%"></i></span></div>';
  }
  function rowHtml(x) {
    var cur = x.i === S.ch;
    return '<button class="row-t' + (cur ? ' cur' : '') + '" type="button" data-i="' + x.i + '">' +
      '<span class="num">' + (x.n || '') + '</span>' +
      '<span class="tt">' + esc(titleName(x.t)) + '</span>' +
      (!cur && S.mark[x.i] ? '<span class="dot" aria-label="đã đánh dấu"></span>' : '') + '</button>';
  }
  /* --- kiểu 1: danh sách gọn, có tìm --- */
  function listOne() {
    var q = norm(TQ), out = '', last = '', buf = [];
    function flush() {
      if (!buf.length) return;
      out += '<div class="mg"><span>' + last + '</span><i>' + buf.length + '</i></div>' +
        '<div class="rows">' + buf.join('') + '</div>';
      buf = [];
    }
    CH.forEach(function (c, i) {
      var n = chapNo(c.t);
      if (q && norm(c.t + ' ' + n).indexOf(q) < 0) return;
      var h = kindOf(c.t).h;
      if (h !== last) { flush(); last = h; }
      buf.push(rowHtml({ i: i, t: c.t, n: n }));
    });
    flush();
    return out || '<p class="tempty">Không có mục nào khớp “' + esc(TQ) + '”.</p>';
  }
  /* --- kiểu 2: lưới số --- */
  function gridTwo() {
    var cs = chapList(), os = otherList();
    var cells = cs.map(function (x) {
      return '<button class="cell' + (x.i === S.ch ? ' cur' : '') + '" type="button" data-i="' + x.i +
        '" aria-label="' + esc(x.t) + '" title="' + esc(x.t) + '">' + x.n +
        (x.i !== S.ch && S.mark[x.i] ? '<span class="dot"></span>' : '') + '</button>';
    }).join('');
    var rest = os.length
      ? '<div class="mg"><span>Mục khác</span><i>' + os.length + '</i></div><div class="rows">' +
        os.map(function (x) { return rowHtml(x); }).join('') + '</div>'
      : '';
    return '<div class="mgrid">' + cells + '</div>' + rest;
  }
  /* --- kiểu 3: nhóm mười chương gập mở --- */
  function accThree() {
    var cs = chapList(), blocks = [], out = '';
    for (var k = 0; k < cs.length; k += 10) blocks.push(cs.slice(k, k + 10));
    out += blocks.map(function (g, gi) {
      var id = 'b' + gi;
      var has = g.some(function (x) { return x.i === S.ch; });
      var open = S.openC[id] === undefined ? has : !!S.openC[id];
      return '<div class="acc' + (open ? ' on' : '') + '">' +
        '<button class="acch" type="button" data-acc="' + id + '" aria-expanded="' + open + '">' +
        '<span class="tt">Chương ' + g[0].n + '–' + g[g.length - 1].n + '</span>' +
        (has ? '<span class="here">đang đọc</span>' : '') +
        '<i>' + g.length + '</i>' + ic('chev', 16) + '</button>' +
        (open ? '<div class="accb">' + g.map(rowHtml).join('') + '</div>' : '') + '</div>';
    }).join('');
    var os = otherList();
    if (os.length) out += '<div class="mg"><span>Mục khác</span><i>' + os.length + '</i></div>' +
      '<div class="rows">' + os.map(rowHtml).join('') + '</div>';
    return out;
  }
  function tocBody() {
    return S.toc === 'b' ? gridTwo() : (S.toc === 'c' ? accThree() : listOne());
  }
  function markCur() {
    $$('[data-i]').forEach(function (b) { b.classList.toggle('cur', +b.dataset.i === S.ch); });
  }
  function paintTocBody() {
    var r = $('#tocRows'); if (!r) return;
    r.innerHTML = tocBody();
    var clr = $('[data-act="tqClr"]'); if (clr) clr.hidden = !TQ;
  }
  function renderToc() {
    var s = $('#sheetToc'); if (!s) return;
    var search = S.toc === 'a'
      ? '<div class="msearch">' + ic('search', 17) +
        '<input type="search" id="tq" placeholder="Tìm chương hoặc số…" value="' + esc(TQ) + '" ' +
        'autocomplete="off" spellcheck="false" aria-label="Tìm chương">' +
        '<button class="clr" type="button" data-act="tqClr" aria-label="Xóa tìm kiếm"' +
        (TQ ? '' : ' hidden') + '>' + ic('x', 15) + '</button></div>'
      : '';
    s.innerHTML =
      '<div class="sh-h"><b>Mục lục</b><span class="sub">' + NCHAP + ' chương · ' +
        (CH.length - NCHAP) + ' mục khác</span>' +
        '<button class="x" type="button" data-close aria-label="Đóng mục lục">' + ic('x') + '</button></div>' +
      ctxHtml() +
      '<div class="sh-b">' + search + '<div id="tocRows">' + tocBody() + '</div></div>' +
      '<div class="mcut"><span>Kiểu mục lục</span>' +
        ['a', 'b', 'c'].map(function (k, idx) {
          return '<button type="button" data-toc="' + k + '" aria-pressed="' +
            String(S.toc === k) + '" title="Kiểu ' + (idx + 1) + '">' + (idx + 1) + '</button>';
        }).join('') + '</div>';
    var inp = $('#tq');
    if (inp) inp.addEventListener('input', function () { TQ = this.value; paintTocBody(); });
  }
  function scrollTocToCur() {
    var b = $('#sheetToc .sh-b'), cur = $('#tocRows .cur');
    if (!b || !cur) return;
    var r = cur.getBoundingClientRect(), br = b.getBoundingClientRect();
    b.scrollTop += (r.top - br.top) - (br.height / 2 - r.height / 2);
  }

  /* ---------------- bảng ---------------- */
  var HOST = $('#sheetHost'), scrim = null, activeSheet = null;
  function buildSheets() {
    HOST.innerHTML =
      '<div class="scrim" id="scrim" hidden></div>' +
      '<aside class="sheet left toc" id="sheetToc" role="dialog" aria-modal="true" aria-label="Mục lục" hidden></aside>' +
      '<aside class="sheet right" id="sheetSet" role="dialog" aria-modal="true" aria-label="Cài đặt đọc" hidden>' +
      '<div class="sh-h"><b>Cài đặt đọc</b><span class="sub">Nhớ cho lần sau</span>' +
      '<button class="x" type="button" data-close aria-label="Đóng cài đặt">' + ic('x') + '</button></div>' +
      '<div class="sh-b">' + setHtml() + '</div></aside>' +
      '<aside class="sheet right" id="sheetHelp" role="dialog" aria-modal="true" aria-label="Hướng dẫn" hidden>' +
      '<div class="sh-h"><b>Thao tác thử</b>' +
      '<button class="x" type="button" data-close aria-label="Đóng hướng dẫn">' + ic('x') + '</button></div>' +
      '<div class="sh-b">' + helpHtml() + '</div></aside>';
    scrim = $('#scrim');
    scrim.addEventListener('click', closeSheets);
    renderToc();
    bindSet();
  }
  function setHtml() {
    return '<div class="srow"><span class="sk">Nền đọc</span>' +
      '<div class="seg" data-k="rd"><span class="thumb"></span>' +
      ['sang', 'kem', 'toi'].map(function (v, i) {
        return '<button type="button" data-v="' + v + '" aria-pressed="false">' +
          ['Sáng', 'Kem', 'Tối'][i] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="srow"><span class="sk">Ví dụ <em>theo cài đặt</em></span>' +
      '<div class="preview" id="prevBox">Hạt mầm nằm im trong đất. Rồi một sáng, nó tự nhớ ra phải lớn.</div></div>' +
      '<div class="srow"><span class="sk">Cỡ chữ <em id="vsSize">18 px</em></span>' +
      '<input type="range" data-k="size" min="16" max="26" step="1" aria-label="Cỡ chữ"></div>' +
      '<div class="srow"><span class="sk">Giãn dòng <em id="vsLine">1,8</em></span>' +
      '<input type="range" data-k="line" min="1.4" max="2.2" step="0.05" aria-label="Giãn dòng"></div>' +
      '<div class="srow"><span class="sk">Độ rộng cột <em id="vsW">720 px</em></span>' +
      '<input type="range" data-k="w" min="560" max="900" step="20" aria-label="Độ rộng cột"></div>' +
      '<div class="srow"><span class="sk">Khoảng cách đoạn <em id="vsPara">1,05 em</em></span>' +
      '<input type="range" data-k="para" min="0.6" max="1.8" step="0.05" aria-label="Khoảng cách đoạn"></div>' +
      '<div class="srow"><span class="sk">Kiểu chữ</span>' +
      '<div class="seg" data-k="font"><span class="thumb"></span>' +
      '<button type="button" data-v="serif" aria-pressed="true">Có chân</button>' +
      '<button type="button" data-v="sans" aria-pressed="false">Không chân</button></div></div>' +
      '<div class="srow"><span class="sk">Canh đều hai bên</span>' +
      '<div class="seg" data-k="just"><span class="thumb"></span>' +
      '<button type="button" data-v="0" aria-pressed="true">Tắt</button>' +
      '<button type="button" data-v="1" aria-pressed="false">Bật</button></div></div>' +
      '<div class="srow2"><button class="wide" type="button" data-act="focus">Chế độ tập trung</button>' +
      '<button class="wide" type="button" data-act="full">Toàn màn hình</button></div>' +
      '<button class="reset" type="button" data-act="reset">Về mặc định</button>';
  }
  function helpHtml() {
    return '<p style="margin:2px 0 14px;font-size:13px;color:var(--mut);line-height:1.65">' +
      'Bản này bấm được hết. Thử lần lượt:</p>' +
      '<ol style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.85">' +
      '<li><b>Mục lục</b> → chọn chương khác (nội dung thật).</li>' +
      '<li><b>Cài đặt</b> → nền Tối, cỡ 22, rộng 620, canh đều.</li>' +
      '<li>Cuối chương: Thích / Lưu / Theo dõi, chuyển chương.</li>' +
      '<li><b>Bình luận</b> — sticker giờ chỉ nằm ở đây.</li>' +
      '<li><b>Đánh dấu</b>, <b>Tập trung</b>, <b>Toàn màn hình</b>.</li>' +
      '<li>Phím ← → đổi chương, Esc đóng bảng.</li>' +
      '<li>Thanh dưới đáy: đổi <b>A / B / C</b> và xem khổ điện thoại.</li>' +
      '</ol>';
  }

  function openSheet(id) {
    if (activeSheet) closeSheets(true);
    var s = $('#' + id); if (!s) return;
    s.hidden = false; s.classList.remove('closing');
    scrim.hidden = false;
    scrim.style.animation = 'none'; void scrim.offsetWidth; scrim.style.animation = '';
    if (id === 'sheetToc') { renderToc(); requestAnimationFrame(scrollTocToCur); }
    if (id === 'sheetSet') syncSet();
    B.style.overflow = 'hidden';
    activeSheet = s;
    s.setAttribute('tabindex', '-1');
    s.focus({ preventScroll: true });
    B.classList.add('sheet-open');
  }
  function closeSheets(instant) {
    var s = activeSheet; if (!s) return;
    activeSheet = null;
    B.style.overflow = '';
    B.classList.remove('sheet-open');
    if (scrim) scrim.hidden = true;
    if (instant) { s.hidden = true; return; }
    s.classList.add('closing');
    setTimeout(function () { s.hidden = true; s.classList.remove('closing'); }, 200);
  }

  /* ---------------- cài đặt ---------------- */
  function segPaint(seg) {
    var btns = $$('button', seg), i = -1;
    btns.forEach(function (b, k) { if (b.getAttribute('aria-pressed') === 'true') i = k; });
    seg.style.setProperty('--n', String(btns.length));
    seg.style.setProperty('--i', String(Math.max(0, i)));
    var th = seg.querySelector('.thumb');
    if (th) { th.style.width = 'calc((100% - 6px) / ' + btns.length + ')'; th.style.transform = 'translateX(' + (Math.max(0, i) * 100) + '%)'; }
  }
  function syncSet() {
    var m = { size: ['vsSize', function (v) { return v + ' px'; }],
      line: ['vsLine', function (v) { return String(v).replace('.', ','); }],
      w: ['vsW', function (v) { return v + ' px'; }],
      para: ['vsPara', function (v) { return String(v).replace('.', ',') + ' em'; }] };
    Object.keys(m).forEach(function (k) {
      var el = $('input[data-k="' + k + '"]'); if (!el) return;
      el.value = S[k];
      var lab = $('#' + m[k][0]); if (lab) lab.textContent = m[k][1](S[k]);
    });
    [['rd', S.rd], ['font', S.font], ['just', String(+S.just)]].forEach(function (p) {
      var seg = $('.seg[data-k="' + p[0] + '"]'); if (!seg) return;
      $$('button', seg).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === p[1])); });
      segPaint(seg);
    });
    var pv = $('#prevBox');
    if (pv) {
      pv.style.fontFamily = S.font === 'sans' ? 'var(--sans)' : 'var(--serif)';
      pv.style.fontSize = Math.round(S.size * 0.8) + 'px';
      pv.style.lineHeight = String(S.line);
      pv.style.textAlign = +S.just ? 'justify' : 'left';
    }
  }
  function bindSet() {
    $$('input[data-k]').forEach(function (el) {
      var k = el.dataset.k;
      el.addEventListener('input', function () {
        S[k] = (k === 'size' || k === 'w') ? +el.value : parseFloat(el.value);
        apply(); progress();
      });
    });
    $$('.seg').forEach(function (seg) {
      $$('button', seg).forEach(function (b) {
        b.addEventListener('click', function () {
          var k = seg.dataset.k;
          S[k] = k === 'just' ? +b.dataset.v : b.dataset.v;
          apply();
          if (k === 'rd') apply(true);
        });
      });
    });
  }

  /* ---------------- bình luận ---------------- */
  function cmtsOf(i) { S.cm[i] = S.cm[i] || []; return S.cm[i]; }
  function renderCmts() {
    var host = $('#cmtList'); if (!host) return;
    var arr = cmtsOf(S.ch).slice();
    if (S.sort === 'old') arr.reverse();
    host.innerHTML = arr.length ? arr.map(function (c, idx) {
      return '<div class="cmt" style="animation-delay:' + Math.min(idx, 6) * 35 + 'ms">' +
        '<div class="av">' + esc((c.n || 'K').trim()[0].toUpperCase()) + '</div><div class="cb">' +
        '<div class="who"><span class="nm">' + esc(c.n) + '</span>' +
        '<span class="tm">' + esc(c.tm) + '</span></div>' +
        (c.x ? '<p>' + esc(c.x) + '</p>' : '') +
        (c.s ? '<img src="st/' + c.s + '.webp" alt="' + STNAME[c.s] + '">' : '') + '</div></div>';
    }).join('') : '<p class="empty">Chưa có bình luận nào. Bạn mở màn nhé.</p>';
    var cnt = $('#cmtCount'); if (cnt) cnt.textContent = arr.length;
    var sort = $('#sortLbl');
    if (sort) {
      sort.textContent = S.sort === 'old' ? 'Cũ nhất' : 'Mới nhất';
      sort.parentNode.dataset.on = S.sort === 'old' ? 'old' : 'new';
    }
    setLabel('cmt', arr.length ? 'Bình luận ' + arr.length : 'Bình luận');
  }
  var pending = null;
  function drawStick() {
    var stick = $('#cmtStick'); if (!stick) return;
    stick.innerHTML = pending ? '<img src="st/' + pending + '.webp" alt="' + STNAME[pending] +
      '"><button type="button" class="rm" data-act="rmstick" aria-label="Bỏ sticker">×</button>' : '';
    stick.hidden = !pending;
  }

  /* ---------------- tiến độ ---------------- */
  function progress() {
    var bar = $('#progBar');
    var hgt = document.documentElement.scrollHeight - window.innerHeight;
    var p = hgt > 0 ? Math.min(1, Math.max(0, window.scrollY / hgt)) : 0;
    if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    var pct = $('#pct'); if (pct) pct.textContent = Math.round(p * 100) + '%';
    var ticks = $('#ticks');
    if (ticks) {
      var lit = Math.round(p * 6);
      $$('i', ticks).forEach(function (el, k) { el.classList.toggle('on', k < lit); });
    }
    BAR.classList.toggle('stuck', window.scrollY > 6);
  }
  window.addEventListener('scroll', progress, { passive: true });
  window.addEventListener('resize', progress);

  /* ---------------- sự kiện ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.dataset.act;
    if (t.hasAttribute('data-off')) { e.preventDefault(); return; }
    if (act === 'prev' || act === 'next') {
      e.preventDefault(); load(S.ch + (act === 'next' ? 1 : -1)); return;
    }
    if (act === 'pick') { e.preventDefault(); return; }
    e.preventDefault();
    switch (act) {
      case 'toc': openSheet('sheetToc'); break;
      case 'set': openSheet('sheetSet'); break;
      case 'help': openSheet('sheetHelp'); break;
      case 'back': toast('Trang truyện không có trong mockup — dùng mục lục để đổi chương.'); break;
      case 'mark':
        S.mark[S.ch] = !S.mark[S.ch]; save(); syncChapterUI(); paintBar();
        toast(S.mark[S.ch] ? 'Đã đánh dấu ' + shortName(CH[S.ch].t) : 'Đã bỏ đánh dấu');
        break;
      case 'focus':
        if (activeSheet) closeSheets(true);
        B.classList.toggle('focus');
        toast(B.classList.contains('focus') ? 'Chế độ tập trung — chỉ còn chữ' : 'Đã thoát chế độ tập trung');
        break;
      case 'full':
        if (activeSheet) closeSheets(true);
        if (!document.fullscreenElement) {
          if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
          toast('Toàn màn hình — Esc để thoát');
        } else if (document.exitFullscreen) document.exitFullscreen();
        break;
      case 'like':
        S.like[S.ch] = !S.like[S.ch]; save(); syncChapterUI();
        toast(S.like[S.ch] ? 'Đã thích chương này' : 'Đã bỏ thích'); break;
      case 'shelf':
        S.shelf = !S.shelf; save(); syncChapterUI();
        toast(S.shelf ? 'Đã lưu truyện vào tủ' : 'Đã bỏ khỏi tủ'); break;
      case 'follow':
        S.follow = !S.follow; save(); syncChapterUI();
        toast(S.follow ? 'Đang theo dõi truyện' : 'Đã bỏ theo dõi'); break;
      case 'report': toast('Đã gửi báo lỗi chữ tới tác giả'); break;
      case 'sort': S.sort = S.sort === 'old' ? 'new' : 'old'; save(); renderCmts(); break;
      case 'reset':
        Object.keys(DEF).forEach(function (k) { S[k] = DEF[k]; });
        apply(); syncSet(); toast('Đã về mặc định'); break;
      case 'cmt': {
        if (S.v === 'c') {
          var f = $('#cmtFold'); if (f && !f.open) { f.open = true; S.foldOpen = 1; }
        }
        CMTS.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(function () { var ta = $('#cmtText'); if (ta) ta.focus({ preventScroll: true }); }, 380);
        break;
      }
      case 'rmstick': pending = null; drawStick(); break;
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-act="tqClr"]')) {
      TQ = ''; var tqi = $('#tq'); if (tqi) { tqi.value = ''; tqi.focus(); }
      paintTocBody(); return;
    }
    /* đổi kiểu mục lục ngay trong ngăn kéo */
    var tk = e.target.closest('[data-toc]');
    if (tk) {
      S.toc = tk.dataset.toc; save(); TQ = '';
      renderToc();
      requestAnimationFrame(scrollTocToCur);
      return;
    }
    /* mở/đóng một nhóm mười chương (kiểu 3) */
    var ac = e.target.closest('[data-acc]');
    if (ac) {
      var id = ac.dataset.acc;
      S.openC[id] = !ac.closest('.acc').classList.contains('on');
      save(); paintTocBody();
      return;
    }
    /* chọn chương: ngăn kéo GIỮ MỞ để so ba kiểu, dải ngữ cảnh cập nhật ngay */
    var ti = e.target.closest('[data-i]');
    if (ti) {
      var wasOpen = !!$('#sheetToc') && !$('#sheetToc').hidden;
      TQ = '';
      load(+ti.dataset.i);
      if (wasOpen) {
        var ctx = $('#sheetToc .mctx');
        if (ctx) ctx.outerHTML = ctxHtml();
        markCur();
        var tgr = $('#tq'); if (tgr) tgr.value = '';
        var clr = $('[data-act="tqClr"]'); if (clr) clr.hidden = true;
      } else closeSheets();
      return;
    }
    if (e.target.closest('[data-close]')) { closeSheets(); return; }
    var pick = e.target.closest('[data-pick]');
    if (pick) {
      pending = pick.dataset.pick; drawStick();
      var pr = $('#cmtPick'); if (pr) pr.hidden = true;
      var sb = $('#cmtStickerBtn'); if (sb) sb.setAttribute('aria-expanded', 'false');
      return;
    }
    var sb2 = e.target.closest('#cmtStickerBtn');
    if (sb2) {
      var pr2 = $('#cmtPick'); if (!pr2) return;
      pr2.hidden = !pr2.hidden;
      sb2.setAttribute('aria-expanded', String(!pr2.hidden));
    }
  });

  document.addEventListener('submit', function (e) {
    if (!e.target.matches('#cmtForm')) return;
    e.preventDefault();
    var nameEl = $('#cmtName'), textEl = $('#cmtText'), err = $('#cmtErr');
    var name = (nameEl && nameEl.value.trim()) || 'Khách';
    var text = (textEl && textEl.value.trim()) || '';
    if (!text && !pending) {
      if (err) err.hidden = false;
      if (textEl) textEl.focus();
      return;
    }
    if (err) err.hidden = true;
    cmtsOf(S.ch).unshift({ n: name, tm: 'vừa xong', x: text, s: pending || undefined });
    pending = null; drawStick();
    if (textEl) textEl.value = '';
    save(); renderCmts(); syncChapterUI();
    toast('Đã gửi bình luận');
  });

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === 'Escape') {
      if (activeSheet) { closeSheets(); return; }
      if (B.classList.contains('focus')) { B.classList.remove('focus'); return; }
      if (devFrame) { closeDev(); return; }
    }
    if (typing) return;
    if (e.key === 'ArrowRight' && S.ch < CH.length - 1) load(S.ch + 1);
    if (e.key === 'ArrowLeft' && S.ch > 0) load(S.ch - 1);
  });

  /* ---------------- thanh công cụ ---------------- */
  var TB = $('#tb');
  function setVariant(v) {
    if (S.v === v) return;
    S.v = v; save();
    B.dataset.v = v;
    paintBar(); paintTail(); paintDock(); paintCmts();
    $$('[data-v]', TB).forEach(function (b) { if (b.dataset.dev === undefined) b.setAttribute('aria-pressed', String(b.dataset.v === v)); });
    var names = { a: 'A — dải công cụ bên phải', b: 'B — nút gọn dưới chương', c: 'C — một vùng cuối chương' };
    toast('Phương án ' + names[v]);
  }
  var devFrame = null;
  function openDev() {
    if (devFrame) return;
    var w = document.createElement('div');
    w.className = 'devw'; w.id = 'devw';
    w.innerHTML = '<div class="devb"><div class="devh"><span>390 px</span>' +
      '<button type="button" aria-label="Đóng">' + ic('x', 18) + '</button></div>' +
      '<iframe src="?pane=1&t=' + Date.now() + '" title="Bản xem trên điện thoại"></iframe></div>';
    w.addEventListener('click', function (e) {
      if (e.target === w || e.target.closest('.devh')) closeDev();
    });
    document.body.appendChild(w);
    devFrame = w;
  }
  function closeDev() {
    if (devFrame) { devFrame.remove(); devFrame = null; }
    setDevBtn('d');
  }
  function setDevBtn(which) {
    $$('[data-dev]', TB).forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.dev === which));
    });
  }

  TB.addEventListener('click', function (e) {
    var v = e.target.closest('button[data-v]');
    if (v && v.dataset.dev === undefined) { setVariant(v.dataset.v); return; }
    var d = e.target.closest('[data-dev]');
    if (d) {
      if (d.dataset.dev === 'm') { openDev(); setDevBtn('m'); }
      else { closeDev(); }
    }
  });

  /* thanh công cụ tự mờ đi khi không dùng */
  var idleT = null;
  function wake() {
    TB.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(function () { TB.classList.add('idle'); }, 2600);
  }
  ['mousemove', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
    document.addEventListener(ev, wake, { passive: true });
  });

  /* ---------------- khởi động ---------------- */
  var pane = /[?&]pane=1/.test(location.search);
  if (pane) B.classList.add('pane');
  B.dataset.v = S.v;
  apply();
  buildSheets();
  paintBar(); paintTail(); paintDock(); paintCmts(); paintHead();
  paintTxt(true);
  document.title = CH[S.ch].t + ' · ' + BOOK;
  progress();
  $$('[data-v]', TB).forEach(function (b) {
    if (b.dataset.dev === undefined) b.setAttribute('aria-pressed', String(b.dataset.v === S.v));
  });
  if (pane) { var alone = $('#alone'); if (alone) alone.href = location.pathname; }
  wake();
})();
