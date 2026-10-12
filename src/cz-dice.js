/* ============================================================================
   ssochuz · VÒNG QUAY “HÔM NAY ĐỌC GÌ?” (bản 1.20.0)
   ----------------------------------------------------------------------------
   Đôi khi mở web mà không biết đọc gì. Nút này quay một vòng 2,6 giây rồi chốt
   một bộ truyện, kèm nút Đọc ngay.

   NGUỒN TRUYỆN — theo đúng thứ tự ưu tiên, không bịa dữ liệu:
     1. truyện bạn ĐANG THEO DÕI (CZ.followMap) mà đang ra chương;
     2. truyện MỚI CẬP NHẬT (theo trường `updated`);
     3. toàn bộ truyện đọc được.
   BỘ LỌC: tình trạng (đang cập nhật / hoàn thành), bỏ qua 18+ (máy này chưa xác
   nhận 18+ thì mặc định bỏ qua), thể loại khi kho có dữ liệu, và BỎ QUA truyện
   vừa đọc trong 14 ngày gần đây nếu vẫn còn đủ lựa chọn (CZ.lastReadAt).
   Không lặp lại kết quả vừa quay nếu còn phương án khác.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var CZ = w.CZ || {};
  function esc(s) { return CZ.esc ? CZ.esc(s) : String(s == null ? '' : s); }
  function num(n) { return CZ.num ? CZ.num(n) : String(n); }
  function toast(m, k) { if (CZ.toast) CZ.toast(m, k); }
  function reduce() { return !!CZ.reduce; }

  var MAX_SLICES = 10;          /* quá 10 lát thì vòng quay rối mắt */
  var SPIN_MS = 2600;
  var LS = { last: 'ssochuz:dice:last:v1', opt: 'ssochuz:dice:options:v1' };
  var LEGACY_LS = { last: 'ssochuz-dice-last', opt: 'ssochuz-dice-opt' };
  var S = { rot: 0, spinning: false, cands: [], pick: null };
  var CZDice = { _S: S };       /* API công khai, gán tiếp ở cuối tệp */

  function jget(k, dv) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? dv : v; } catch (e) { return dv; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function readVersioned(key, legacyKey, fallback) {
    var current = jget(key, null);
    if (current != null) return current;
    var legacy = jget(legacyKey, null);
    if (legacy != null) jset(key, legacy); /* import old option once; future writes are versioned */
    return legacy == null ? fallback : legacy;
  }
  function opts() {
    var o = readVersioned(LS.opt, LEGACY_LS.opt, {}) || {};
    return { run: o.run !== false, done: o.done !== false, adult: !!o.adult, genre: o.genre || '' };
  }
  function saveOpts(o) { jset(LS.opt, o); }

  function lib() { try { return (CZ.lib && CZ.lib()) || []; } catch (e) { return []; } }
  function readable(n) { return n && n.canRead && !n.locked; }

  /* thứ tự ưu tiên: đang theo dõi → mới cập nhật → cả thư viện */
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
    var follow = CZ.followMap ? CZ.followMap() : {};
    var followed = all.filter(function (n) { return Object.prototype.hasOwnProperty.call(follow, n.slug); });
    var tier = followed.length ? followed : all.slice().sort(function (a, b) {
      return String(b.updated || '').localeCompare(String(a.updated || ''));
    });
    /* bỏ truyện vừa đọc gần đây — chỉ khi vẫn còn đủ phương án để quay */
    var recent = tier.filter(function (n) { return (Date.now() - (CZ.lastReadAt ? CZ.lastReadAt(n) : 0)) < 14 * 86400000; });
    if (tier.length - recent.length >= 4) tier = tier.filter(function (n) { return recent.indexOf(n) < 0; });
    /* không lặp kết quả vừa quay nếu còn lựa chọn */
    var last = readVersioned(LS.last, LEGACY_LS.last, '');
    if (last && tier.length > 1) {
      var trimmed = tier.filter(function (n) { return n.slug !== last; });
      if (trimmed.length) tier = trimmed;
    }
    return tier;
  }
  /* chọn ngẫu nhiên tối đa MAX_SLICES lát cho vòng quay */
  function wheelSet(list) {
    if (list.length <= MAX_SLICES) return list.slice();
    var pool = list.slice(), out = [];
    while (out.length < MAX_SLICES && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }

  function coverTag(n) {
    var src = CZ.coverSrc ? CZ.coverSrc(n) : (n.thumb || '');
    if (!src) return '<span class="dc-ph" aria-hidden="true">' + esc(n.title.slice(0, 1)) + '</span>';
    return '<img src="' + esc(src) + '"' + (CZ.coverFB ? CZ.coverFB(n, src) : '') + ' alt="" width="60" height="90" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  }
  function palette(i) {
    var c = ['#a63a52', '#2f6b4f', '#8a5f18', '#4a7fc1', '#8a5fb8', '#b4562c', '#3f7d7a', '#c2954a', '#7a5c9e', '#5f7a3f'];
    return c[i % c.length];
  }

  function wheelHTML(list) {
    var step = 360 / list.length;
    var stops = list.map(function (n, i) {
      return palette(i) + ' ' + (i * step).toFixed(2) + 'deg ' + ((i + 1) * step).toFixed(2) + 'deg';
    }).join(', ');
    return '<div class="dc-wheelwrap">' +
        '<div class="dc-pointer" aria-hidden="true"></div>' +
        '<div class="dc-wheel" id="dcWheel" style="background:conic-gradient(' + stops + ')">' +
          list.map(function (n, i) {
            var a = i * step + step / 2;
            return '<span class="dc-slot" style="transform:rotate(' + a.toFixed(2) + 'deg) translateY(-38%) rotate(' + (-a).toFixed(2) + 'deg)">' +
              coverTag(n) + '</span>';
          }).join('') +
          '<span class="dc-hub" aria-hidden="true">?</span>' +
        '</div>' +
        '<p class="dc-live" role="status" aria-live="polite" id="dcLive">Sẵn sàng quay — ' + num(list.length) + ' truyện trong vòng.</p>' +
      '</div>';
  }

  function filtersHTML() {
    var o = opts();
    var genres = {};
    lib().forEach(function (n) { String(n.genre || '').split(/[,;/|]/).forEach(function (g) { g = g.trim(); if (g) genres[g] = (genres[g] || 0) + 1; }); });
    var gk = Object.keys(genres).sort();
    return '<div class="dc-filters">' +
      '<span class="dc-fl">Tình trạng</span>' +
      '<button type="button" class="dc-chip' + (o.run ? ' on' : '') + '" data-opt="run" aria-pressed="' + o.run + '">Đang cập nhật</button>' +
      '<button type="button" class="dc-chip' + (o.done ? ' on' : '') + '" data-opt="done" aria-pressed="' + o.done + '">Hoàn thành</button>' +
      '<span class="dc-fl">Nhãn</span>' +
      '<button type="button" class="dc-chip' + (o.adult ? ' on' : '') + '" data-opt="adult" aria-pressed="' + o.adult + '">Gồm 18+</button>' +
      (gk.length ? '<span class="dc-fl">Thể loại</span>' + gk.map(function (g) {
        return '<button type="button" class="dc-chip' + (o.genre === g ? ' on' : '') + '" data-genre="' + esc(g) + '">' + esc(g) + '</button>';
      }).join('') : '') +
      '</div>';
  }

  function emptyHTML() {
    return '<div class="dc-empty"><b>Chưa có truyện nào khớp bộ lọc.</b>' +
      '<p class="sm muted">Thử bật thêm tình trạng hoặc chọn “Gồm 18+”.</p></div>';
  }

  function renderBox(m, first) {
    var list = candidates();
    S.cands = wheelSet(list);
    S.pick = null;
    var body = m.querySelector('#dcBody');
    if (!S.cands.length) { body.innerHTML = filtersHTML() + emptyHTML(); }
    else {
      body.innerHTML = filtersHTML() +
        '<div class="dc-stage">' + wheelHTML(S.cands) +
          '<div class="dc-result" id="dcResult" hidden></div>' +
        '</div>' +
        '<div class="dc-actions"><button class="btn pri dc-spin" id="dcSpin">Quay</button>' +
          '<button class="btn ghost" id="dcAgain" hidden>Quay lại</button>' +
          '<span class="sm muted dc-note">' + (list.length !== S.cands.length
            ? ('Cả thư viện có ' + num(list.length) + ' truyện — vòng quay lấy ngẫu nhiên ' + num(S.cands.length) + ' bộ mỗi lượt.')
            : 'Nguồn: truyện bạn theo dõi, rồi truyện mới cập nhật.') + '</span>' +
        '</div>';
    }
    bindBody(m);
    if (first) {
      var sp = m.querySelector('#dcSpin');
      if (sp) { try { sp.focus({ preventScroll: true }); } catch (e) {} }
    }
  }

  function bindBody(m) {
    var body = m.querySelector('#dcBody');
    Array.prototype.forEach.call(body.querySelectorAll('[data-opt]'), function (b) {
      b.addEventListener('click', function () {
        var o = opts(), k = b.dataset.opt;
        o[k] = !o[k];
        if (!o.run && !o.done) o[k] = true;      /* luôn còn ít nhất một tình trạng */
        saveOpts(o);
        renderBox(m, false);
      });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-genre]'), function (b) {
      b.addEventListener('click', function () {
        var o = opts();
        o.genre = o.genre === b.dataset.genre ? '' : b.dataset.genre;
        saveOpts(o);
        renderBox(m, false);
      });
    });
    var spin = m.querySelector('#dcSpin');
    if (spin) spin.addEventListener('click', function () { spinWheel(m); });
    var again = m.querySelector('#dcAgain');
    if (again) again.addEventListener('click', function () { spinWheel(m); });
  }

  function spinWheel(m) {
    if (S.spinning || !S.cands.length) return;
    /* CHỐT danh sách cho lượt quay này. Người dùng có thể bấm đổi bộ lọc giữa
       lúc vòng đang quay (renderBox dựng lại S.cands) — đọc S.cands lúc kết
       thúc là lấy phần tử của danh sách khác, hoặc undefined, rồi đổ vỡ. */
    var list = S.cands.slice();
    var spinId = S.spin = (S.spin || 0) + 1;
    var wheel = m.querySelector('#dcWheel'), live = m.querySelector('#dcLive');
    /* KHÔNG lặp lại kết quả vừa ra khi vẫn còn lát khác: kết quả vừa quay trong
       lượt này (S.pick) hoặc bộ vừa đọc ở lần mở bảng trước (LS.last) đều bị
       loại khỏi lần bốc, nên “Quay lại” luôn đổi bộ. Chỉ khi vòng quay có đúng
       một lát thì đành chịu — lúc đó không còn phương án nào khác. */
    var avoid = (S.pick && S.pick.slug) || readVersioned(LS.last, LEGACY_LS.last, '');
    var pool = [];
    for (var pi = 0; pi < list.length; pi++) {
      if (!avoid || list[pi].slug !== avoid) pool.push(pi);
    }
    if (!pool.length) { for (pi = 0; pi < list.length; pi++) pool.push(pi); }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    var step = 360 / list.length;
    /* con trỏ ở đỉnh (12 giờ): xoay sao cho tâm lát `pick` dừng ngay dưới nó */
    var target = 360 * 4 + (360 - (pick * step + step / 2));
    S.rot = Math.floor(S.rot / 360) * 360 + target;
    S.spinning = true;
    var spin = m.querySelector('#dcSpin'), again = m.querySelector('#dcAgain');
    if (spin) { spin.disabled = true; spin.textContent = 'Đang quay…'; }
    if (again) again.hidden = true;
    m.querySelector('#dcResult').hidden = true;
    if (live) live.textContent = 'Đang quay…';
    if (reduce()) {
      if (wheel) wheel.style.transition = 'none';
      if (wheel) wheel.style.transform = 'rotate(' + S.rot + 'deg)';
      finish(0);
    } else {
      if (wheel) {
        wheel.style.transition = 'transform ' + SPIN_MS + 'ms cubic-bezier(.16,.86,.22,1)';
        wheel.style.transform = 'rotate(' + S.rot + 'deg)';
      }
      setTimeout(finish, SPIN_MS + 40);
    }

    function finish() {
      S.spinning = false;
      if (spinId !== S.spin) return;            /* bộ lọc đã đổi — bỏ lượt quay này */
      S.pick = list[pick] || null;
      if (!S.pick) return;
      if (spin) { spin.disabled = false; spin.textContent = 'Quay'; }
      if (again) again.hidden = false;
      jset(LS.last, S.pick.slug);
      if (live) live.textContent = 'Kết quả: ' + S.pick.title;
      paintResult(m, S.pick);
      if (CZ.sfx) CZ.sfx('pop');
    }
  }

  function paintResult(m, n) {
    var box = m.querySelector('#dcResult');
    if (!box) return;
    var ch = CZ.progress ? (CZ.progress(n) || 0) : 0;
    box.hidden = false;
    box.innerHTML =
      '<div class="dc-card">' +
        '<div class="dc-cv">' + coverTag(n) + '</div>' +
        '<div class="dc-info">' +
          '<span class="pill ' + esc(n.statusCls || 'run') + '"><span class="d"></span>' + esc(n.status || '') + '</span>' +
          '<h4>' + esc(n.title) + '</h4>' +
          '<p class="sm muted">' + [n.author ? esc(n.author) : '', n.couple ? esc(n.couple) : '', esc(CZ.countText ? CZ.countText(n) : '')]
            .filter(Boolean).join(' · ') + '</p>' +
          '<p class="dc-latest sm" data-latest>' + (ch ? ('Bạn đang đọc tới chương ' + ch + '.') : 'Chưa đọc chương nào.') + '</p>' +
          '<div class="dc-cardbtn">' +
            '<a class="btn pri" href="' + esc(CZ.readURL ? CZ.readURL(n.slug, Math.max(1, ch || 1)) : n.url) + '" data-dice-read>' +
              (CZ.icon ? CZ.icon('play', 'i-s') : '') + 'Đọc ngay</a>' +
            '<a class="btn ghost" href="' + esc(n.url || (CZ.storyURL ? CZ.storyURL(n.slug) : '/truyen/')) + '">Trang truyện</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    var rd = box.querySelector('[data-dice-read]');
    if (rd) rd.addEventListener('click', function () { if (CZDice.close) CZDice.close(); });
    /* chương mới nhất: chỉ hỏi mục lục khi đã có kết quả (1 request, không tải trước) */
    if (CZ.toc) {
      CZ.toc(n.slug).then(function (head) {
        var slot = box.querySelector('[data-latest]');
        if (!slot || !head || !head.ok || !head.chapters || !head.chapters.length) return;
        var last = head.chapters[head.chapters.length - 1];
        var t = String((last && last.t) || '').trim();
        slot.textContent = 'Chương mới nhất: ' + (t || ('chương ' + head.chapters.length)) +
          (ch ? ' · bạn đang ở chương ' + ch : '');
      }).catch(function () {});
    }
  }

  /* ---- nút: gắn vào mọi chỗ có [data-dice] (trang chủ, trang truyện, menu) ---- */
  function buttons() {
    var hosts = Array.prototype.slice.call(d.querySelectorAll('[data-dice]'));
    hosts.forEach(function (h) {
      if (h.__dice) return;
      h.__dice = 1;
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'btn ghost sm dicebtn';
      b.innerHTML = (CZ.icon ? CZ.icon('dice', 'i-s') : '') + '<span>Hôm nay đọc gì?</span>';
      b.setAttribute('title', 'Quay vòng chọn truyện ngẫu nhiên — ưu tiên truyện bạn theo dõi');
      b.addEventListener('click', function () { open(b); });
      h.appendChild(b);
    });
  }

  function open(from) {
    if (!CZ.modal) return;
    var m = CZ.modal('czDiceBox',
      '<div class="mh"><h4>Hôm nay đọc gì?</h4><span class="sm muted">Quay một vòng rồi chốt.</span></div>' +
      '<div class="mb dc-body" id="dcBody"></div>' +
      '<div class="mf"><button class="btn ghost" data-close>Đóng</button></div>');
    m.classList.add('dicebox');
    renderBox(m, true);
    CZDice._back = from || null;
    CZDice._modal = m;
  }
  function close() { if (CZDice._modal && CZDice._modal._close) CZDice._modal._close(); }

  CZDice.open = open; CZDice.close = close; CZDice.buttons = buttons; CZDice.candidates = candidates;
  w.CZDice = CZDice;

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', buttons);
  else buttons();
  /* trang chủ dựng lại nội dung theo dữ liệu → nút có thể sinh sau lần gắn đầu */
  d.addEventListener('cz:stats', function () { setTimeout(buttons, 30); });
  w.addEventListener('load', function () { setTimeout(buttons, 60); });
})(window, document);
