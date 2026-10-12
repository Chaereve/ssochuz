/* ============================================================================
   ssochuz · HỆ THỐNG REACTION STICKER CUỐI CHƯƠNG (bản 1.20.0)
   ----------------------------------------------------------------------------
   VÌ SAO CÓ TỆP NÀY: nút Thích cũ chỉ là một icon tim — bấm rồi chẳng có gì vui,
   cũng chẳng nói được người đọc đang nghĩ gì. Hàng reaction dưới đây thay cảm
   giác đó bằng 6 sticker dễ thương (đội mũ bảo hiểm gấp, tiểu đường rồi, gửi
   gạch đá, chầm kẽm, cày như trâu, cho xin chương nữa): bấm là sticker bay lên
   như reaction livestream, có tiếng, có số đếm.

   NĂM MẢNH, TÁCH RỜI ĐỂ DỄ SỬA:
     1. reactionConfig  — danh sách sticker (thêm/bớt/đổi ảnh chỉ ở đây)
     2. useReactions    — kho dữ liệu: đếm, chống spam, hàng chờ đồng bộ
     3. ReactionSticker — một nút sticker (ảnh + số + tooltip + trạng thái)
     4. ReactionBar     — hàng sticker cuối chương + nút “Xem tất cả reaction”
     5. ReactionPopover — bảng đầy đủ (mở bằng CZ.modal nên có sẵn Esc/scrim)
     …cộng thêm ReactionAnimationLayer (lớp sticker bay) và sfx() (tiếng “cạch”).

   Reaction cộng đồng được đọc/ghi qua Cloudflare Worker + D1; trình duyệt chỉ
   giữ trạng thái chương hiện tại trong RAM. Sticker dùng registry và WebP Sso
   có sẵn trong public/stickers/sso/ (thumb/full). Không có coin hay thanh toán.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var CZ = w.CZ || {};
  function CZtoast(msg, kind) { if (CZ.toast) CZ.toast(msg, kind); }
  function rd() { return CZ.rdGet ? CZ.rdGet() : {}; }
  function reduce() { return !!CZ.reduce; }
  function esc(s) { return CZ.esc ? CZ.esc(s) : String(s == null ? '' : s); }
  function num(n) { return CZ.num ? CZ.num(n) : String(n); }
  function vid() { try { return CZ.vid ? CZ.vid() : ''; } catch (e) { return ''; } }

  /* ======================= 1. sticker registry =========================
     Registry duy nhất nằm ở src/shared/stickers.js; cz-stickers.js nạp cùng
     registry cho trình duyệt. Quick reactions và animation dùng ảnh full; bộ
     sưu tập dùng thumbnail, còn nhãn/alt/path/quick đều lấy từ registry. */
  var STICKER_REGISTRY = Array.isArray(w.CZStickers) ? w.CZStickers : [];
  var STYLE = {
    'sso-brick': { animation_type: 'thud', color: '#b4562c', color2: '#e39a6a', max_particles: 8, accent: 'smoke', toast: 'Đã thả sticker Góp gạch!' },
    'sso-love-it': { animation_type: 'sweet', color: '#d2547f', color2: '#ffb3d1', max_particles: 12, accent: 'heart', toast: 'Yêu thích quá trời!' },
    'sso-cry-flood': { animation_type: 'tears', color: '#4a7fc1', color2: '#a8cdf5', max_particles: 12, accent: 'tear', toast: 'Chương cảm động quá…' },
    'sso-plot-twist': { animation_type: 'alarm', color: '#d99a24', color2: '#ffd76e', max_particles: 9, accent: 'warn', toast: 'Plot twist làm bạn bất ngờ!' },
    'sso-popcorn-spy': { animation_type: 'pop', color: '#8a5fb8', color2: '#d3bcef', max_particles: 11, accent: 'spark', toast: 'Cùng hóng diễn biến tiếp theo!' },
    'sso-more': { animation_type: 'plead', color: '#8a5fb8', color2: '#d3bcef', max_particles: 11, accent: 'spark', toast: 'Đã xin thêm chương!' },
    'sso-crown-chaos': { animation_type: 'alarm', color: '#d99a24', color2: '#ffd76e', max_particles: 9, accent: 'warn' },
    'sso-fighting': { animation_type: 'grind', color: '#5f7a3f', color2: '#b9d18a', max_particles: 10, accent: 'zzz' },
    'sso-flattened': { animation_type: 'pop', color: '#4a7fc1', color2: '#a8cdf5', max_particles: 9, accent: 'tear' },
    'sso-no-sleep': { animation_type: 'grind', color: '#5f7a3f', color2: '#b9d18a', max_particles: 10, accent: 'zzz' },
    'sso-rage-roomba': { animation_type: 'alarm', color: '#b4562c', color2: '#e39a6a', max_particles: 9, accent: 'smoke' },
    'sso-secondhand-shame': { animation_type: 'pop', color: '#8a5fb8', color2: '#d3bcef', max_particles: 9, accent: 'spark' },
    'sso-sugar-overload': { animation_type: 'sweet', color: '#d2547f', color2: '#ffb3d1', max_particles: 12, accent: 'heart' },
    'sso-witness-protection': { animation_type: 'pop', color: '#5f7a3f', color2: '#b9d18a', max_particles: 9, accent: 'zzz' }
  };
  var REACTIONS = STICKER_REGISTRY.map(function (sticker) {
    var style = STYLE[sticker.id] || {};
    return Object.assign({}, sticker, style, {
      short_label: sticker.label,
      asset_light: sticker.full,
      asset_dark: sticker.full,
      fallback_emoji: sticker.fallback
    });
  });
  var QUICK_REACTIONS = REACTIONS.filter(function (reaction) { return reaction.quick; });
  var RX = {};
  REACTIONS.forEach(function (r) { RX[r.id] = r; });
  function reactionOf(id) { return RX[id] || null; }

  /* logo nhỏ vẽ bằng SVG (không tốn request) cho các hạt phụ bay kèm sticker */
  var ACCENT = {
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6 22.2 20H1.8L12 2.6Zm-1.3 6.2.35 6.1h1.9l.35-6.1h-2.6Zm1.3 8.2a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7Z" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8.4-4.9-8.4-10.3A4.8 4.8 0 0 1 12 7.4a4.8 4.8 0 0 1 8.4 3.3C20.4 16.1 12 21 12 21Z" fill="currentColor"/></svg>',
    smoke: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 14c2.2-2.6 4.4-2.6 6.6 0s4.4 2.6 6.6 0"/><path d="M6 8.5c1.7-2 3.4-2 5.1 0s3.4 2 5.1 0"/></g></svg>',
    tear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8c3.2 4 5.6 6.9 5.6 9.7a5.6 5.6 0 0 1-11.2 0c0-2.8 2.4-5.7 5.6-9.7Z" fill="currentColor"/></svg>',
    zzz: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h5.5L4 14h6"/><path d="M14 3h5l-5 6h5"/></g></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Z" fill="currentColor"/><path d="M19 15.5l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4Z" fill="currentColor" opacity=".8"/></svg>'
  };

  /* ======================= 2. D1-backed community state =================
     D1 is authoritative. This module keeps only an in-memory view for the
     current chapter; it never writes aggregate/action rows to localStorage/KV. */
  var COOLDOWN_MS = 420;
  var RATE_MAX = 30, RATE_WINDOW = 60000;
  var chapterState = Object.create(null);
  var pending = Object.create(null);
  var pullPending = Object.create(null);
  var PULL_CACHE_MS = 15000;
  var lastTap = Object.create(null);
  var rateTimes = Object.create(null);

  function stateKey(slug, ch) { return String(slug || '') + '#' + String(ch || ''); }
  function currentUid() {
    try {
      if (w.CZPersonal) {
        if (!w.CZPersonal.mode || w.CZPersonal.mode() !== 'server') return '';
        return String(w.CZPersonal.uid && w.CZPersonal.uid() || '');
      }
      var user = w.CZ_AUTH && w.CZ_AUTH.current && w.CZ_AUTH.current();
      return String(user && (user.uid || user.id) || '');
    } catch (e) { return ''; }
  }
  function stateFor(slug, ch) {
    var key = stateKey(slug, ch), state = chapterState[key];
    if (!state) state = chapterState[key] = { totals: Object.create(null), mine: [], owner: '', at: 0 };
    if (state.owner !== currentUid()) state.mine = [];
    return state;
  }
  function apiOn() { return !!(CZ.API && w.CZPersonal && w.CZPersonal.communityRequest && w.fetch); }
  function normalizeTotals(input) {
    var out = Object.create(null);
    REACTIONS.forEach(function (reaction) {
      var value = Number(input && input[reaction.id]);
      out[reaction.id] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    });
    return out;
  }
  function applyServer(slug, ch, data, ownerAtRequest) {
    if (!data || !data.totals) return null;
    var state = stateFor(slug, ch);
    state.totals = normalizeTotals(data.totals);
    state.at = Date.now();
    if (ownerAtRequest === currentUid()) {
      state.owner = ownerAtRequest;
      state.mine = Array.isArray(data.mine) ? data.mine.filter(function (id) { return !!RX[id]; }) : [];
    }
    return state;
  }
  function count(slug, ch, id) { return stateFor(slug, ch).totals[id] || 0; }
  function counts(slug, ch) {
    var state = stateFor(slug, ch), out = Object.create(null);
    REACTIONS.forEach(function (reaction) { out[reaction.id] = state.totals[reaction.id] || 0; });
    return out;
  }
  function total(slug, ch) {
    var all = counts(slug, ch), sum = 0;
    REACTIONS.forEach(function (reaction) { sum += all[reaction.id] || 0; });
    return sum;
  }
  function mine(slug, ch) { return stateFor(slug, ch).mine.slice(); }
  function isMine(slug, ch, id) { return mine(slug, ch).indexOf(id) >= 0; }
  function cooled(slug, ch, id) {
    var key = currentUid() + '#' + slug + '#' + ch + '#' + id, now = Date.now();
    if (lastTap[key] && now - lastTap[key] < COOLDOWN_MS) return false;
    lastTap[key] = now;
    return true;
  }
  function rateOK() {
    var owner = currentUid() || 'guest', now = Date.now();
    var rows = (rateTimes[owner] || []).filter(function (time) { return now - time < RATE_WINDOW; });
    if (rows.length >= RATE_MAX) return false;
    rows.push(now); rateTimes[owner] = rows;
    return true;
  }
  function pull(ctx, force) {
    if (!apiOn()) { if (ctx && ctx.done) ctx.done(null); return Promise.resolve(null); }
    var ownerAtRequest = currentUid();
    var key = ownerAtRequest + '#' + stateKey(ctx.slug, ctx.ch);
    var current = stateFor(ctx.slug, ctx.ch);
    if (!force && current.owner === ownerAtRequest && current.at && Date.now() - current.at < PULL_CACHE_MS) {
      var cached = { ok: true, totals: current.totals, mine: current.mine.slice() };
      if (ctx.done) ctx.done(cached);
      return Promise.resolve(cached);
    }
    var request = pullPending[key];
    if (!request) {
      request = w.CZPersonal.communityRequest('/api/community/reactions', {
        storyId: ctx.slug, chapterIndex: Number(ctx.ch)
      }).then(function (data) {
        var state = applyServer(ctx.slug, ctx.ch, data, ownerAtRequest);
        return state ? data : null;
      }).catch(function () {
        if (ownerAtRequest === currentUid()) {
          current.owner = ownerAtRequest;
          current.at = Date.now();
          current.mine = [];
        }
        return null;
      }).then(function (data) {
        delete pullPending[key];
        return data;
      }, function (error) {
        delete pullPending[key];
        throw error;
      });
      pullPending[key] = request;
    }
    return request.then(function (data) {
      if (ctx.done) ctx.done(data);
      return data;
    });
  }
  function toggle(slug, ch, id) {
    var reaction = reactionOf(id);
    if (!reaction || !slug || !Number(ch)) return Promise.resolve(null);
    if (!apiOn()) return Promise.reject(new Error('Máy chủ community chưa được cấu hình.'));
    if (!currentUid()) {
      var loginError = new Error('Đăng nhập Supabase để thả reaction sticker.');
      loginError.status = 401;
      return Promise.reject(loginError);
    }
    if (!cooled(slug, ch, id)) return Promise.resolve({ blocked: 'cooldown' });
    if (!rateOK()) return Promise.resolve({ blocked: 'rate' });
    var ownerAtRequest = currentUid();
    var key = ownerAtRequest + '#' + stateKey(slug, ch) + '#' + id;
    if (pending[key]) return pending[key];
    pending[key] = w.CZPersonal.communityRequest('/api/community/reactions', {
      action: 'toggle', storyId: slug, chapterIndex: Number(ch), stickerId: id
    }, { requireAuth: true }).then(function (data) {
      var state = applyServer(slug, ch, data, ownerAtRequest);
      if (!state) throw new Error('Máy chủ trả dữ liệu reaction không hợp lệ.');
      return { id: id, on: data.active === true, count: state.totals[id] || 0, mine: state.mine.slice(), data: data };
    }).finally(function () { delete pending[key]; });
    return pending[key];
  }

  /* ======================= 3. ReactionAnimationLayer ====================
     Lớp sticker bay. VÌ SAO dùng Web Animations thay vì CSS class: mỗi hạt cần
     một quỹ đạo ngẫu nhiên (lệch trái/phải, xoay, rơi) — viết ra CSS thì vừa
     phải sinh keyframes động, vừa phải dọn DOM. animate() chạy trên
     compositor (transform/opacity), xong tự huỷ, và máy bật “giảm chuyển
     động” thì bỏ qua toàn bộ. */
  var LIVE = 0, LIVE_MAX = 60;     /* trần an toàn: không bao giờ quá 60 hạt */
  function layer() {
    var l = d.getElementById('czFx');
    if (!l) {
      l = d.createElement('div');
      l.id = 'czFx'; l.className = 'czfx';
      l.setAttribute('aria-hidden', 'true');
      d.body.appendChild(l);
    }
    return l;
  }
  function spawn(el, sx, sy, kf, dur) {
    el.style.left = sx + 'px';
    el.style.top = sy + 'px';
    var box = layer();
    box.appendChild(el);
    LIVE += 1;
    function done() {
      LIVE -= 1;
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    if (el.animate && !reduce()) {
      var a = el.animate(kf, { duration: dur, easing: 'cubic-bezier(.2,.72,.3,1)', fill: 'forwards' });
      a.onfinish = done;
      a.oncancel = done;
      /* lưới an toàn: máy chậm/tab bị ẩn có thể không bắn onfinish */
      setTimeout(done, dur + 400);
    } else {
      el.style.opacity = '0';
      setTimeout(done, 60);
    }
  }
  function stickerIcon(rx, cls, useThumb) {
    /* Full: hàng reaction và animation; thumbnail: bộ sưu tập để giảm tải. */
    var src = useThumb ? rx.thumb : rx.full;
    var loading = useThumb || !rx.quick ? 'lazy' : 'eager';
    return '<img class="' + (cls || '') + '" src="' + esc(src || rx.full || '') + '" alt="" width="48" height="48" ' +
      'decoding="async" loading="' + loading + '" data-emo="' + esc(rx.fallback_emoji) + '">';
  }
  function burst(btn, rx, rect) {
    if (reduce()) return;
    if (LIVE >= LIVE_MAX) return;
    var n = Math.max(4, Math.min(12, rx.max_particles || 9));
    if (LIVE + n > LIVE_MAX) n = Math.max(2, LIVE_MAX - LIVE);
    var sx = (rect ? rect.left + rect.width / 2 : w.innerWidth / 2);
    var sy = (rect ? rect.top + rect.height / 2 : w.innerHeight / 2);
    var isThud = rx.animation_type === 'thud';
    var isTear = rx.animation_type === 'tears';

    for (var i = 0; i < n; i++) {
      var el = d.createElement('span');
      el.className = 'czfx-p';
      /* 3/4 là sticker, còn lại là hạt phụ (tim, tia, khói…) cho khỏi đơn điệu */
      if (i % 4 === 3 && ACCENT[rx.accent]) el.innerHTML = ACCENT[rx.accent];
      else el.innerHTML = stickerIcon(rx);
      el.style.color = i % 2 ? rx.color : (rx.color2 || rx.color);
      if (!el.style.color) el.style.color = rx.color;

      var dx = (Math.random() * 2 - 1) * 120;
      var rot = (Math.random() * 2 - 1) * 220;
      var dur = 900 + Math.random() * 700;
      var scale = 0.5 + Math.random() * 0.55;
      var kf;
      if (isThud) {
        /* gạch: bay lên rồi rơi xuống như thật */
        var peak = -120 - Math.random() * 70;
        kf = [
          { transform: 'translate(-50%,-50%) scale(.4) rotate(0deg)', opacity: 0 },
          { transform: 'translate(calc(-50% + ' + (dx * 0.5) + 'px), calc(-50% + ' + peak + 'px)) scale(' + scale + ') rotate(' + (rot * 0.5) + 'deg)', opacity: 1, offset: 0.45 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(50% + 40px)) scale(' + (scale * 0.9) + ') rotate(' + rot + 'deg)', opacity: 0 }
        ];
      } else if (isTear) {
        /* nước mắt: lên chậm rồi rơi nhanh */
        kf = [
          { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
          { transform: 'translate(calc(-50% + ' + (dx * 0.4) + 'px), calc(-50% + ' + (-90 - Math.random() * 50) + 'px)) scale(' + scale + ') rotate(' + (rot * 0.4) + 'deg)', opacity: 1, offset: 0.4 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(50% + 60px)) scale(' + (scale * 0.8) + ') rotate(' + rot + 'deg)', opacity: 0 }
        ];
      } else {
        kf = [
          { transform: 'translate(-50%,-50%) scale(.35) rotate(0deg)', opacity: 0 },
          { transform: 'translate(calc(-50% + ' + (dx * 0.45) + 'px), calc(-50% + ' + (-70 - Math.random() * 40) + 'px)) scale(' + scale + ') rotate(' + (rot * 0.45) + 'deg)', opacity: 1, offset: 0.35 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + (-150 - Math.random() * 90) + 'px)) scale(' + (scale * 0.75) + ') rotate(' + rot + 'deg)', opacity: 0 }
        ];
      }
      spawn(el, sx, sy, kf, dur);
    }
    /* vòng “cảnh báo” màu vàng của mũ bảo hiểm: thêm một lớp sáng quanh nút */
    if (rx.animation_type === 'alarm' && btn && btn.classList && !reduce()) {
      btn.classList.remove('rx-alarm');
      void btn.offsetWidth;
      btn.classList.add('rx-alarm');
      setTimeout(function () { btn.classList.remove('rx-alarm'); }, 700);
    }
  }

  /* ======================= 4. ReactionSticker =========================== */
  function stickerHTML(rx, c, mineOn) {
    return '<button type="button" class="rx' + (mineOn ? ' on' : '') + '" data-rx="' + esc(rx.id) + '"' +
      ' aria-pressed="' + (mineOn ? 'true' : 'false') + '"' +
      ' aria-label="' + esc(rx.alt + ' — ' + num(c) + ' lượt' + (mineOn ? ', bạn đã thả' : '')) + '"' +
      ' title="' + esc(rx.label) + '" style="--rx:' + esc(rx.color) + ';--rx2:' + esc(rx.color2 || rx.color) + '">' +
      '<span class="rx-art">' + stickerIcon(rx, 'rx-img') +
        '<span class="rx-emo" aria-hidden="true">' + esc(rx.fallback_emoji) + '</span>' +
        (mineOn ? '<span class="rx-tick" aria-hidden="true">✓</span>' : '') +
      '</span>' +
      '<span class="rx-ct" data-rx-ct="' + esc(rx.id) + '">' + num(c) + '</span>' +
      '<span class="rx-lbl" aria-hidden="true">' + esc(rx.short_label) + '</span>' +
      '</button>';
  }
  /* ảnh sticker hỏng (chặn host, offline lần đầu) → hiện emoji dự phòng */
  function bindImgFallback(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.rx-img, .pop-it .rx-img'), function (im) {
      if (im.__rxfb) return;
      im.__rxfb = 1;
      im.addEventListener('error', function () {
        var p = im.parentNode;
        if (p) p.classList.add('noimg');
        im.remove();
      });
    });
  }

  function bump(btn) {
    if (!btn) return;
    var ct = btn.querySelector('.rx-ct');
    if (!ct || reduce()) return;
    ct.classList.remove('rx-bump', 'rx-down');
    void ct.offsetWidth;
    ct.classList.add(btn.classList.contains('on') ? 'rx-bump' : 'rx-down');
    setTimeout(function () { ct.classList.remove('rx-bump', 'rx-down'); }, 520);
  }

  /* ======================= 5. ReactionBar + Popover ===================== */
  var ctxNow = null;

  function barHTML(ctx) {
    var c = counts(ctx.slug, ctx.ch), mineArr = mine(ctx.slug, ctx.ch);
    var st = (ctx.story && (ctx.story.statusCls || '')) || '';   /* 'run' = đang cập nhật */
    return '<div class="rx-head">' +
        '<div class="rx-title"><b>Chương này thế nào?</b>' +
        '<span class="rx-sub">' + (apiOn()
          ? 'Reaction cộng đồng đồng bộ trên mọi thiết bị. Cần đăng nhập; có thể bật hoặc bỏ từng sticker.'
          : 'Dữ liệu reaction cộng đồng hiện chưa kết nối được máy chủ.') + '</span></div>' +
        '<div class="rx-head-act">' +
          '<span class="rx-total">' + num(total(ctx.slug, ctx.ch)) + ' lượt thả</span>' +
          '<button type="button" class="btn ghost sm" id="rxAll">Xem tất cả reaction</button>' +
        '</div>' +
      '</div>' +
      '<div class="rx-row" role="group" aria-label="Reaction nhanh cho ' + esc(ctx.label || 'chương này') + '">' +
        QUICK_REACTIONS.map(function (r) { return stickerHTML(r, c[r.id], mineArr.indexOf(r.id) >= 0); }).join('') +
      '</div>' +
      (st === 'run' ? '<p class="rx-foot">Bực vì chưa có chương mới? Kéo xuống dưới góp gạch cho tác giả 👇</p>' : '');
  }

  function mount(host, ctx) {
    if (!host) return;
    ctxNow = ctx;
    if (host.__rxCtx && host.__rxCtx.slug === ctx.slug && host.__rxCtx.ch === ctx.ch && host.__rxCtx.label === ctx.label) {
      refresh(host);            /* cùng chương: chỉ cập nhật số, không dựng lại */
      return;
    }
    host.__rxCtx = ctx;
    host.innerHTML = barHTML(ctx);
    host.classList.add('on');
    var all = host.querySelector('#rxAll');
    if (all) all.addEventListener('click', function () { popover(ctx); });
    bindImgFallback(host);
    pull({
      slug: ctx.slug, ch: ctx.ch,
      done: function () {
        if (!ctxNow || ctxNow.slug !== ctx.slug || ctxNow.ch !== ctx.ch) return;
        refresh(host);
      }
    });
  }
  function refresh(host) {
    var ctx = host.__rxCtx;
    if (!ctx) return;
    var c = counts(ctx.slug, ctx.ch), mineArr = mine(ctx.slug, ctx.ch);
    REACTIONS.forEach(function (r) {
      var btn = host.querySelector('.rx[data-rx="' + r.id + '"]');
      if (!btn) return;
      var ct = btn.querySelector('.rx-ct');
      if (ct) ct.textContent = num(c[r.id]);
      var on = mineArr.indexOf(r.id) >= 0;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', r.label + ' — ' + num(c[r.id]) + ' lượt' + (on ? ', bạn đã thả' : ''));
      var art = btn.querySelector('.rx-art');
      if (on && !btn.querySelector('.rx-tick') && art) {
        var t = d.createElement('span'); t.className = 'rx-tick'; t.setAttribute('aria-hidden', 'true'); t.textContent = '✓'; art.appendChild(t);
      } else if (!on) {
        var old = btn.querySelector('.rx-tick');
        if (old) old.remove();
      }
    });
    var tot = host.querySelector('.rx-total');
    if (tot) tot.textContent = num(total(ctx.slug, ctx.ch)) + ' lượt thả';
  }

  /* Animation/audio chỉ chạy sau khi server xác nhận thao tác; không ghi
     action ở localStorage và lỗi community không tác động phần đọc chương. */
  function onTap(btn) {
    var host = btn.closest('.rreact');
    var ctx = host && host.__rxCtx;
    if (!ctx || btn.disabled) return;
    var id = btn.getAttribute('data-rx');
    var rx = reactionOf(id);
    if (!rx) return;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    toggle(ctx.slug, ctx.ch, id).then(function (res) {
      btn.disabled = false; btn.removeAttribute('aria-busy');
      if (!res) return;
      if (res.blocked) {
        if (res.blocked === 'rate') CZtoast('Từ từ thôi bạn — thả chậm lại một chút nhé!', 'err');
        return;
      }
      refresh(host);
      bump(btn);
      if (res.on) {
        var rect = btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
        burst(btn, rx, rect);
        sfx(rx.animation_type === 'thud' ? 'brick' : 'pop');
        CZtoast(rx.toast || ('Đã thả ' + rx.label + '!'), 'ok');
      } else {
        CZtoast('Đã bỏ ' + rx.label, '');
      }
    }).catch(function (error) {
      btn.disabled = false; btn.removeAttribute('aria-busy');
      if (error && error.status === 401) CZtoast('Đăng nhập Supabase để thả reaction sticker.', 'err');
      else if (error && error.status === 429) CZtoast('Bạn thao tác hơi nhanh — thử lại sau.', 'err');
      else CZtoast((error && error.message) || 'Reaction chưa đồng bộ được; thử lại sau.', 'err');
    });
  }

  /* ReactionPopover — bảng đầy đủ, dùng lại CZ.modal để có sẵn scrim/Esc/focus */
  function popover(ctx) {
    if (!CZ.modal) return;
    var m = CZ.modal('czReactBox',
      '<div class="mh"><h4>Tất cả reaction</h4>' +
        '<span class="sm muted">' + esc(ctx.label || '') + '</span></div>' +
      '<div class="mb pop-it">' +
        REACTIONS.map(function (r) {
          var on = isMine(ctx.slug, ctx.ch, r.id);
          return '<button type="button" class="pop-rx' + (on ? ' on' : '') + '" data-rx="' + esc(r.id) + '"' +
            ' aria-pressed="' + (on ? 'true' : 'false') + '" style="--rx:' + esc(r.color) + '">' +
            '<span class="rx-art">' + stickerIcon(r, 'rx-img', true) +
              '<span class="rx-emo" aria-hidden="true">' + esc(r.fallback_emoji) + '</span>' +
              (on ? '<span class="rx-tick" aria-hidden="true">✓</span>' : '') + '</span>' +
            '<span class="pop-txt"><b>' + esc(r.label) + '</b>' +
              '<span class="pop-ct" data-rx-ct="' + esc(r.id) + '">' + num(count(ctx.slug, ctx.ch, r.id)) + ' lượt</span></span>' +
          '</button>';
        }).join('') +
        '<p class="sm muted pop-note">' + (apiOn()
          ? 'Số liệu được tổng hợp trên máy chủ; cần đăng nhập để thêm hoặc bỏ reaction.'
          : 'Máy chủ reaction chưa kết nối nên hiện chưa tải được số liệu.') + '</p>' +
      '</div>' +
      '<div class="mf"><button class="btn ghost" data-close>Đóng</button></div>');
    bindImgFallback(m);
    m.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.pop-rx') : null;
      if (!b || b.disabled) return;
      var id = b.getAttribute('data-rx'), rx = reactionOf(id);
      if (!rx) return;
      b.disabled = true;
      toggle(ctx.slug, ctx.ch, id).then(function (res) {
        b.disabled = false;
        if (!res || res.blocked) return;
        var host = d.getElementById('rdReact');
        REACTIONS.forEach(function (item) {
          var button = m.querySelector('.pop-rx[data-rx="' + item.id + '"]');
          if (!button) return;
          var active = isMine(ctx.slug, ctx.ch, item.id);
          button.classList.toggle('on', active);
          button.setAttribute('aria-pressed', active ? 'true' : 'false');
          var ct = button.querySelector('[data-rx-ct]');
          if (ct) ct.textContent = num(count(ctx.slug, ctx.ch, item.id)) + ' lượt';
          var tick = button.querySelector('.rx-tick'), art = button.querySelector('.rx-art');
          if (active && !tick && art) { var mark = d.createElement('span'); mark.className = 'rx-tick'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = '✓'; art.appendChild(mark); }
          if (!active && tick) tick.remove();
        });
        if (host) refresh(host);
        if (res.on) { burst(b, rx, b.getBoundingClientRect()); sfx('pop'); CZtoast(rx.toast || 'Đã thả sticker!', 'ok'); }
        else CZtoast('Đã bỏ ' + rx.label, '');
      }).catch(function (error) {
        b.disabled = false;
        if (error && error.status === 401) CZtoast('Đăng nhập Supabase để thả reaction sticker.', 'err');
        else if (error && error.status === 429) CZtoast('Bạn thao tác hơi nhanh — thử lại sau.', 'err');
        else CZtoast((error && error.message) || 'Reaction chưa đồng bộ được; thử lại sau.', 'err');
      });
    });
  }

  /* ======================= 6. Âm thanh (chỉ sau cú bấm) =================
     Tiếng “pop” dùng chung một chỗ với tiếng “cạch” của hộp gạch: CZ.sfx() trong
     cz-app.js (tệp nào cũng có). Ở đây chỉ còn phần gọi cho gọn — bản tổng hợp
     WebAudio nằm một nơi, không nhân đôi mã. */
  function sfx(kind) { if (CZ.sfx) CZ.sfx(kind || 'pop'); }

  /* ======================= 7. GẮN VÀO TRANG ============================= */
  /* Trang đọc gọi hook này mỗi lần vẽ xong một chương (xem
     paintChapter() trong src/cz-story.js) — một điểm nối duy nhất, không rải
     sự kiện khắp nơi. */
  function afterChapterPaint(txt, info) {
    var host = d.getElementById('rdReact');
    if (!host || !info) return;
    var s = rd();
    if (String(s.react) === '0') { host.hidden = true; host.innerHTML = ''; host.__rxCtx = null; return; }
    host.hidden = false;
    mount(host, {
      slug: info.slug, ch: info.ch,
      label: (info.title ? info.title + ' · ' : '') + 'chương ' + info.ch,
      story: info.story || null
    });
  }
  function bind() {
    /* một listener duy nhất cho cả trang: nút nào có data-rx cũng chạy */
    d.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.rreact .rx[data-rx]') : null;
      if (b) { e.preventDefault(); onTap(b); }
    });
  }

  w.addEventListener('cz:personal', function (event) {
    var type = event && event.detail && event.detail.type;
    if (!ctxNow || (type !== 'loading' && type !== 'ready')) return;
    var host = d.getElementById('rdReact');
    if (host) refresh(host);
    if (type === 'ready') pull({ slug: ctxNow.slug, ch: ctxNow.ch, done: function () { if (host) refresh(host); } });
  });

  w.CZReact = {
    VERSION: '2.0.0',
    REACTIONS: REACTIONS,
    QUICK_REACTIONS: QUICK_REACTIONS,
    reactionOf: reactionOf,
    counts: counts, count: count, total: total, mine: mine, isMine: isMine,
    toggle: toggle, pull: pull, flush: function () { return ctxNow ? pull({ slug: ctxNow.slug, ch: ctxNow.ch }, true) : Promise.resolve(null); },
    mount: mount, afterChapterPaint: afterChapterPaint,
    popover: popover, burst: burst, sfx: sfx, layer: layer,
    apiOn: apiOn,
    _cfg: { cooldownMs: COOLDOWN_MS, rateMax: RATE_MAX, rateWindowMs: RATE_WINDOW, liveMax: LIVE_MAX }
  };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', bind);
  else bind();
})(window, document);
