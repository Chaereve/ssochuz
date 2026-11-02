/* ============================================================================
   ssochuz · TRANG “HÔM NAY ĐỌC GÌ?” (/vong-quay/ · bản 1.20.0)
   ----------------------------------------------------------------------------
   Cơ chế: BỐC BÀI. Một xấp bài úp nằm giữa trang; bấm “Bốc một lá” thì lá trên
   cùng nhấc lên, lật tại chỗ (rotateY) và đáp xuống — không bay ngang, không có
   bánh xe nhiều màu. Bốc tiếp thì lá cũ chìm về xấp rồi lá mới lật lên.

   BỘ BÀI: mỗi lần bốc LẤY MỘT LÁ RA khỏi xấp, nên trong một lượt không bao giờ
   lặp lại; hết xấp thì tự xáo lại. Số lá còn lại hiện ngay dưới xấp.

   NGUỒN TRUYỆN — TOÀN BỘ kho truyện đọc được trên trang, không chỉ truyện bạn
   theo dõi: ai cũng bốc được mọi bộ, kể cả bộ chưa từng mở. Danh sách xếp theo
   `updated` mới nhất trước để lúc xáo bài trộn đều, và không bịa truyện nào
   ngoài registry.
   BỘ LỌC: tình trạng (đang ra / hoàn thành), bỏ qua 18+ khi máy chưa xác nhận,
   thể loại khi kho có dữ liệu, và BỎ QUA truyện vừa đọc trong 14 ngày nếu vẫn
   còn đủ lựa chọn (CZ.lastReadAt).

   Chỉ dùng transform/opacity cho chuyển động; tôn trọng prefers-reduced-motion.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var CZ = w.CZ || {};
  function esc(s) { return CZ.esc ? CZ.esc(s) : String(s == null ? '' : s); }
  function num(n) { return CZ.num ? CZ.num(n) : String(n); }
  function reduce() { return !!CZ.reduce || (w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  var DICE_URL = '/vong-quay/';
  var LOGO = '/assets/brand/ssochuz-logo.png';
  var FLIP_MS = 640;            /* thời gian lật một lá */
  var FOLD_MS = 240;            /* lá cũ chìm về xấp */
  var LS = { last: 'ssochuz:dice:last:v1', opt: 'ssochuz:dice:options:v1' };
  var LEGACY_LS = { last: 'ssochuz-dice-last', opt: 'ssochuz-dice-opt' };
  var S = { deck: [], pool: [], busy: false, hasCard: false, gen: 0, pick: null, panel: null };
  var CZDice = { _S: S, url: DICE_URL };

  function jget(k, dv) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? dv : v; } catch (e) { return dv; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function readVersioned(key, legacyKey, fallback) {
    var current = jget(key, null);
    if (current != null) return current;
    var legacy = jget(legacyKey, null);
    if (legacy != null) jset(key, legacy);
    return legacy == null ? fallback : legacy;
  }
  function opts() {
    var o = readVersioned(LS.opt, LEGACY_LS.opt, {}) || {};
    return { run: o.run !== false, done: o.done !== false, adult: !!o.adult, genre: o.genre || '' };
  }
  function saveOpts(o) { jset(LS.opt, o); }

  function lib() { try { return (CZ.lib && CZ.lib()) || []; } catch (e) { return []; } }
  function readable(n) { return n && n.canRead && !n.locked; }

  /* Bộ bài = MỌI truyện đọc được trong kho, đã qua bộ lọc của người đọc.
     Trước đây nhóm “đang theo dõi” được ưu tiên tuyệt đối: hễ máy có theo dõi
     ít nhất một bộ thì bộ bài bị thu về đúng nhóm đó, nên người theo dõi một
     bộ chỉ bốc trúng bộ ấy. Nay theo dõi không còn thu hẹp bộ bài. */
  function candidates() {
    var o = opts();
    var all = lib().filter(function (n) {
      if (!readable(n)) return false;
      if (n.statusCls === 'run' && !o.run) return false;
      if (n.statusCls === 'done' && !o.done) return false;
      if (!o.run && !o.done) return false;
      if (n.is18 && !o.adult) return false;
      if (o.genre && String(n.genre || '').indexOf(o.genre) < 0) return false;
      return true;
    });
    if (!all.length) return [];
    var tier = all.slice().sort(function (a, b) {
      return String(b.updated || '').localeCompare(String(a.updated || ''));
    });
    /* bỏ truyện vừa đọc gần đây — chỉ khi vẫn còn đủ phương án để bốc */
    var recent = tier.filter(function (n) { return (Date.now() - (CZ.lastReadAt ? CZ.lastReadAt(n) : 0)) < 14 * 86400000; });
    if (tier.length - recent.length >= 4) tier = tier.filter(function (n) { return recent.indexOf(n) < 0; });
    /* không lặp kết quả vừa bốc nếu còn lựa chọn */
    var last = readVersioned(LS.last, LEGACY_LS.last, '');
    if (last && tier.length > 1) {
      var trimmed = tier.filter(function (n) { return n.slug !== last; });
      if (trimmed.length) tier = trimmed;
    }
    return tier;
  }

  function shuffleArr(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function coverTag(n, eager) {
    var src = CZ.coverSrc ? CZ.coverSrc(n) : (n.thumb || '');
    var ch = esc((n && n.title ? n.title : '?').slice(0, 1));
    if (!src) return '<span class="dc-ph" aria-hidden="true">' + ch + '</span>';
    return '<img src="' + esc(src) + '"' + (CZ.coverFB ? CZ.coverFB(n, src) : '') +
      ' alt="" width="240" height="360"' + (eager ? ' loading="eager"' : ' loading="lazy"') +
      ' decoding="async" referrerpolicy="no-referrer">';
  }

  function todayHTML() {
    var now = new Date();
    var days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    var dd = String(now.getDate()).padStart(2, '0'), mm = String(now.getMonth() + 1).padStart(2, '0');
    return '<b><i></i>' + days[now.getDay()] + ', ' + dd + '/' + mm + '</b><span>Hôm nay</span>';
  }

  function filtersHTML(total) {
    var o = opts();
    var genres = {};
    lib().forEach(function (n) { String(n.genre || '').split(/[,;/|]/).forEach(function (g) { g = g.trim(); if (g) genres[g] = (genres[g] || 0) + 1; }); });
    var gk = Object.keys(genres).sort();
    return '<div class="dc-fbar">' +
      '<div class="dc-chips" role="group" aria-label="Lọc truyện">' +
        '<button type="button" class="dc-chip' + (o.run ? ' on' : '') + '" data-opt="run" aria-pressed="' + o.run + '">Đang ra</button>' +
        '<button type="button" class="dc-chip' + (o.done ? ' on' : '') + '" data-opt="done" aria-pressed="' + o.done + '">Hoàn thành</button>' +
        '<button type="button" class="dc-chip' + (o.adult ? ' on' : '') + '" data-opt="adult" aria-pressed="' + o.adult + '">Gồm 18+</button>' +
        (gk.length ? gk.map(function (g) {
          return '<button type="button" class="dc-chip' + (o.genre === g ? ' on' : '') + '" data-genre="' + esc(g) + '" aria-pressed="' + (o.genre === g) + '">' + esc(g) + '</button>';
        }).join('') : '') +
      '</div>' +
      '<p class="dc-count"><b id="dcCount">' + num(total == null ? candidates().length : total) + '</b> truyện trong vòng</p>' +
    '</div>';
  }

  function hintHTML() {
    return '<p class="dc-kick">Bốc bài</p>' +
      '<h2 class="dc-tt">Một lá cho hôm nay</h2>' +
      '<p class="dc-sub">Bộ bài gồm mọi truyện trên trang, đã lọc theo lựa chọn của bạn. Bốc một lá, lật ra rồi đọc.</p>';
  }

  function cardHTML(n, ch) {
    var o = opts();
    return '<p class="dc-kick">Chọn cho hôm nay</p>' +
      '<h2 class="dc-tt">' + esc(n.title) + '</h2>' +
      '<p class="dc-meta">' + [n.author ? esc(n.author) : '', n.couple ? esc(n.couple) : '',
        esc(CZ.countText ? CZ.countText(n) : '')].filter(Boolean).join(' · ') +
        (n.status ? ' <em>· ' + esc(n.status) + '</em>' : '') + '</p>' +
      '<p class="dc-meta dc-latest" data-latest>' + (ch ? ('Đang đọc chương ' + ch) : 'Chưa đọc chương nào') + '</p>';
  }

  function idleActsHTML() {
    return '<button class="btn pri" id="dcDraw" data-act="draw" type="button">Bốc một lá</button>';
  }
  function idleFootHTML(n) {
    return '<button class="dc-q" id="dcShuffle" data-act="shuffle" type="button">Xáo bài</button>' +
      '<span class="dc-dot" aria-hidden="true"></span>' +
      '<span class="dc-cnt"><b>' + num(n) + '</b> lá trong bộ bài</span>';
  }
  function doneActsHTML(n, ch) {
    return '<a class="btn pri" href="' + esc(CZ.readURL ? CZ.readURL(n.slug, Math.max(1, ch || 1)) : n.url) + '" data-dice-read>' +
        (CZ.icon ? CZ.icon('play', 'i-s') : '') + 'Đọc ngay</a>' +
      '<a class="btn ghost" href="' + esc(n.url || (CZ.storyURL ? CZ.storyURL(n.slug) : '/truyen/')) + '">Trang truyện</a>';
  }
  function doneFootHTML(n) {
    return '<button class="dc-q" id="dcAgain" data-act="draw" type="button">Bốc lá khác</button>' +
      '<span class="dc-dot" aria-hidden="true"></span>' +
      '<button class="dc-q" id="dcShuffle" data-act="shuffle" type="button">Xáo bài</button>' +
      '<span class="dc-dot" aria-hidden="true"></span>' +
      (n ? '<span class="dc-cnt"><b>' + num(n) + '</b> lá còn lại</span>'
         : '<span class="dc-cnt">Hết xấp · lá sau sẽ xáo lại</span>');
  }

  /* -------------------------------------------------------------------------
     Dựng toàn bộ khu bốc bài (gọi lại mỗi khi đổi bộ lọc)
     ---------------------------------------------------------------------- */
  function renderBox(m, first) {
    if (!m) return;
    var body = m.querySelector('#dcBody') || m;
    var todayEl = d.querySelector('#dcToday');
    if (todayEl && !todayEl.innerHTML) todayEl.innerHTML = todayHTML();

    refreshPool();
    if (!S.pool.length) {
      body.innerHTML = filtersHTML(0) +
        '<div class="dc-empty"><b>Chưa có truyện khớp bộ lọc.</b>' +
        '<p class="sm muted">Thử bật thêm tình trạng hoặc “Gồm 18+”.</p></div>';
      bindBody(m);
      return;
    }
    body.innerHTML = filtersHTML(S.pool.length) +
      '<div class="dc-draw" id="dcDrawWrap">' +
        '<div class="dc-board" id="dcBoard">' +
          '<div class="dc-pile" id="dcPile" aria-hidden="true">' +
            '<span class="dc-bk u3"></span>' +
            '<span class="dc-bk u2"></span>' +
            '<span class="dc-bk u1"><img src="' + LOGO + '" width="699" height="98" alt="" decoding="async"></span>' +
          '</div>' +
          '<div class="dc-face" id="dcFace" hidden></div>' +
          '<span class="dc-ring" id="dcRing" aria-hidden="true"></span>' +
          '<span class="dc-sheen" aria-hidden="true"><i id="dcSheen"></i></span>' +
        '</div>' +
        '<div class="dc-floor" aria-hidden="true"></div>' +
        '<div class="dc-copy" id="dcCopy">' +
          '<div id="dcHint">' + hintHTML() + '</div>' +
          '<div id="dcResult" tabindex="-1" hidden></div>' +
        '</div>' +
        '<div class="dc-acts" id="dcActs">' + idleActsHTML() + '</div>' +
        '<div class="dc-foot" id="dcFoot">' + idleFootHTML(S.pool.length) + '</div>' +
        '<p class="dc-live" role="status" aria-live="polite" id="dcLive">Sẵn sàng · ' + num(S.pool.length) + ' lá</p>' +
      '</div>';

    S.hasCard = false;
    S.pick = null;
    bindBody(m);
    if (first) {
      var sp = m.querySelector('#dcDraw');
      if (sp) { try { sp.focus({ preventScroll: true }); } catch (e) {} }
    }
  }

  /* dựng lại thanh lọc làm mất focus — trả lại đúng chip vừa bấm */
  function keepFocus(m, sel) {
    var el = m.querySelector(sel);
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* xấp bài mới: xáo lại toàn bộ truyện khớp bộ lọc */
  function refreshPool() {
    S.pool = shuffleArr(candidates());
    S.deck = S.pool.slice();
  }

  function bindBody(m) {
    var body = m.querySelector('#dcBody') || m;
    Array.prototype.forEach.call(body.querySelectorAll('[data-opt]'), function (b) {
      b.addEventListener('click', function () {
        var o = opts(), k = b.dataset.opt;
        o[k] = !o[k];
        if (!o.run && !o.done) o[k] = true;
        saveOpts(o);
        renderBox(m, false);
        keepFocus(m, '[data-opt="' + k + '"]');
      });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-genre]'), function (b) {
      b.addEventListener('click', function () {
        var o = opts(), g = b.dataset.genre;
        o.genre = o.genre === g ? '' : g;
        saveOpts(o);
        renderBox(m, false);
        keepFocus(m, '[data-genre="' + g + '"]');
      });
    });
    if (body.__dcBound) return;
    body.__dcBound = 1;
    body.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (act) {
        if (act.dataset.act === 'draw') drawCard(m);
        else if (act.dataset.act === 'shuffle') shuffleDeck(m);
        return;
      }
      if (e.target.closest('#dcPile') && !S.hasCard) drawCard(m);
    });
  }

  /* một lá rút ra khỏi xấp (hết xấp thì xáo lại) */
  function nextCard() {
    if (!S.deck.length) S.deck = shuffleArr(S.pool);
    if (!S.deck.length) return null;
    var last = readVersioned(LS.last, LEGACY_LS.last, '');
    var card = S.deck.pop();
    /* không lặp lá vừa bốc: đẩy xuống đáy xấp rồi rút lá kế */
    if (card && card.slug === last && S.deck.length) {
      S.deck.unshift(card);
      card = S.deck.pop();
    }
    return card;
  }

  /* Web Animations có thể không tồn tại (jsdom, trình duyệt cũ) — luôn có đường lùi */
  function anim(el, kf, opt) {
    if (!el || reduce() || typeof el.animate !== 'function') return null;
    try { return el.animate(kf, opt); } catch (e) { return null; }
  }
  function done(a, fn) {
    if (a && a.finished && a.finished.then) a.finished.then(fn).catch(fn);
    else fn();
  }

  function setBusy(on) {
    S.busy = on;
    var wrap = d.querySelector('#dcDrawWrap');
    if (wrap) wrap.classList.toggle('busy', on);
  }

  function drawCard(m) {
    if (S.busy || !S.pool.length) return;
    var book = nextCard();
    if (!book) return;
    setBusy(true);
    var gen = S.gen;
    var draw = m.querySelector('#dcDraw');
    if (draw) { draw.disabled = true; draw.textContent = 'Đang bốc…'; }
    var live = m.querySelector('#dcLive');
    if (live) live.textContent = 'Đang bốc…';
    if (S.pick) jset(LS.last, S.pick.slug);

    if (!S.hasCard) { flipIn(book, gen); return; }

    /* lá cũ chìm về xấp rồi mới rút lá mới */
    var face = m.querySelector('#dcFace');
    S.hasCard = false;
    if (!face) { flipIn(book, gen); return; }
    var fold = anim(face, [
      { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
      { transform: 'translate3d(0,16px,0) scale(.95)', opacity: 0 }
    ], { duration: FOLD_MS, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'both' });
    var go = function () {
      if (fold) { try { fold.cancel(); } catch (e) {} }
      face.hidden = true;
      face.style.opacity = '';
      if (gen !== S.gen) return;
      var pile = m.querySelector('#dcPile');
      if (pile) pile.hidden = false;
      if (reduce() || !pile) { flipIn(book, gen); return; }
      var back = anim(pile, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear', fill: 'both' });
      done(back, function () { if (back) { try { back.cancel(); } catch (e) {} } flipIn(book, gen); });
    };
    done(fold, go);
  }

  /* lá lật tại chỗ: nhấc lên, xoay 3D 180°, đáp xuống */
  function flipIn(book, gen) {
    var m = d.querySelector('#czDiceBox') || d;
    var board = m.querySelector('#dcBoard'), pile = m.querySelector('#dcPile'), face = m.querySelector('#dcFace');
    if (!board || !face) { settle(); return; }
    var ch = CZ.progress ? (CZ.progress(book) || 0) : 0;
    var el = d.createElement('div');
    el.className = 'dc-flip';
    el.innerHTML =
      '<span class="dc-fc back"><img src="' + LOGO + '" width="699" height="98" alt="" decoding="async"></span>' +
      '<span class="dc-fc front">' + coverTag(book, true) + '</span>';
    board.appendChild(el);

    var D = reduce() ? 0 : FLIP_MS;
    var flip = null;
    if (D) {
      flip = anim(el, [
        { transform: 'translate3d(0,0,0) rotateY(0deg) scale(1)' },
        { transform: 'translate3d(0,-20px,0) rotateY(88deg) scale(1.035)', offset: .46 },
        { transform: 'translate3d(0,0,0) rotateY(180deg) scale(1)' }
      ], { duration: D, easing: 'cubic-bezier(.30,.72,.24,1)', fill: 'both' });
      var floor = m.querySelector('.dc-floor');
      if (floor) anim(floor, [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: .35, transform: 'scale(.86)', offset: .46 },
        { opacity: 1, transform: 'scale(1)' }
      ], { duration: D, easing: 'cubic-bezier(.30,.72,.24,1)' });
      if (pile) {
        var u1 = pile.querySelector('.u1');
        if (u1) anim(u1, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'linear', fill: 'both' });
        Array.prototype.forEach.call(pile.querySelectorAll('.u2, .u3'), function (n) {
          anim(n, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, delay: 40, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'both' });
        });
      }
    } else if (pile) {
      pile.style.opacity = '0';
    }

    var settle = function () {
      el.remove();
      if (gen !== S.gen) { setBusy(false); return; }
      if (pile) { pile.hidden = true; pile.style.opacity = ''; }
      face.innerHTML = coverTag(book, true);
      face.classList.remove('noart');
      face.hidden = false;
      land(book, ch, gen);
    };
    if (flip) done(flip, settle);
    else if (reduce()) settle();          /* giảm chuyển động: lật tức thì */
    else setTimeout(settle, 120);          /* trình duyệt không có Web Animations */
  }

  function land(book, ch, gen) {
    var m = d.querySelector('#czDiceBox') || d;
    var hint = m.querySelector('#dcHint'), res = m.querySelector('#dcResult');
    var acts = m.querySelector('#dcActs'), foot = m.querySelector('#dcFoot');
    var live = m.querySelector('#dcLive');
    if (res) {
      res.innerHTML = cardHTML(book, ch);
      res.hidden = false;
    }
    if (hint) hint.hidden = true;
    if (acts) acts.innerHTML = doneActsHTML(book, ch);
    if (foot) foot.innerHTML = doneFootHTML(S.deck.length);

    {
      var ring = m.querySelector('#dcRing');
      if (ring) anim(ring, [{ opacity: .85, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.05)' }],
        { duration: 620, easing: 'cubic-bezier(.2,.8,.3,1)' });
      var sheen = m.querySelector('#dcSheen');
      if (sheen) {
        anim(sheen, [{ transform: 'translateX(-160%) rotate(14deg)', opacity: 0 },
          { opacity: .75, offset: .18 }, { opacity: 0 }], { duration: 700, delay: 80, easing: 'ease-out' });
        anim(sheen, [{ transform: 'translateX(-160%) rotate(14deg)' },
          { transform: 'translateX(300%) rotate(14deg)' }],
          { duration: 700, delay: 80, easing: 'cubic-bezier(.25,.7,.3,1)' });
      }
      if (res) anim(res, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
      if (acts) anim(acts, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, delay: 70, easing: 'cubic-bezier(.22,1,.36,1)' });
    }

    S.hasCard = true;
    S.pick = book;
    jset(LS.last, book.slug);
    setBusy(false);
    if (res) { try { res.focus({ preventScroll: true }); } catch (e) {} }
    if (live) live.textContent = 'Đã bốc: ' + book.title;

    if (CZ.toc) {
      CZ.toc(book.slug).then(function (head) {
        if (gen !== S.gen) return;
        var slot = m.querySelector('[data-latest]');
        if (!slot || !head || !head.ok || !head.chapters || !head.chapters.length) return;
        var last = head.chapters[head.chapters.length - 1];
        var t = String((last && last.t) || '').trim();
        slot.textContent = 'Mới nhất: ' + (t || ('chương ' + head.chapters.length)) +
          (ch ? ' · đang đọc chương ' + ch : '');
      }).catch(function () {});
    }
  }

  function shuffleDeck(m) {
    if (S.busy) return;
    refreshPool();
    var live = m.querySelector('#dcLive');
    var pile = m.querySelector('#dcPile');
    if (pile && !reduce() && !pile.hidden) {
      Array.prototype.forEach.call(pile.querySelectorAll('.u2, .u3'), function (n, i) {
        var base = i ? 'translate(-13px,-13px) rotate(-5.4deg) scale(.972)' : 'translate(-6px,-7px) rotate(-2.2deg) scale(.986)';
        anim(n, [{ transform: base },
          { transform: i ? 'translate(-16px,-26px) rotate(-9deg) scale(.97)' : 'translate(-8px,-19px) rotate(4deg) scale(.982)' },
          { transform: base }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
      });
    }
    var foot = m.querySelector('#dcFoot');
    if (foot) foot.innerHTML = S.hasCard ? doneFootHTML(S.deck.length) : idleFootHTML(S.deck.length);
    if (live) live.textContent = 'Đã xáo · ' + num(S.deck.length) + ' lá';
  }

  /* ---- nút dẫn sang trang riêng /vong-quay/ ở trang chủ ---- */
  function buttons() {
    var hosts = Array.prototype.slice.call(d.querySelectorAll('[data-dice]'));
    hosts.forEach(function (h) {
      if (h.__dice) return;
      h.__dice = 1;
      var a = d.createElement('a');
      a.href = DICE_URL;
      a.className = 'btn ghost sm dicebtn';
      a.innerHTML = (CZ.icon ? CZ.icon('dice', 'i-s') : '') + '<span>Hôm nay đọc gì?</span>';
      a.setAttribute('title', 'Mở trang bốc bài chọn truyện ngẫu nhiên trong toàn bộ truyện trên trang');
      h.appendChild(a);
    });
  }

  function open() {
    var pageBox = d.querySelector('#czDiceBox.dicepage-box');
    if (pageBox) {
      renderBox(pageBox, true);
      return pageBox;
    }
    try { w.location.assign(DICE_URL); } catch (e) { w.location.href = DICE_URL; }
    return null;
  }

  function close() {}

  function initPage() {
    var pageBox = d.querySelector('#czDiceBox.dicepage-box');
    if (!pageBox) return;
    if (CZ.mountShell) CZ.mountShell('dice');
    var ready = (CZ.registry ? CZ.registry() : Promise.resolve()).then(function () {
      if (w.CZPersonal && w.CZPersonal.whenReady) return w.CZPersonal.whenReady(1200);
    }).catch(function () {});
    ready.then(function () {
      renderBox(pageBox, true);
      if (CZ.reveal) CZ.reveal();
    });
    w.addEventListener('cz:personal', function (e) {
      var dt = (e && e.detail) || {};
      if (dt.type === 'ready' && !S.busy && !S.hasCard) renderBox(pageBox, false);
    });
  }

  function boot() {
    buttons();
    initPage();
  }

  CZDice.open = open; CZDice.close = close; CZDice.buttons = buttons;
  CZDice.candidates = candidates; CZDice.mount = renderBox;
  w.CZDice = CZDice;

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
  d.addEventListener('cz:stats', function () { setTimeout(buttons, 30); });
  w.addEventListener('load', function () { setTimeout(buttons, 60); });
})(window, document);
