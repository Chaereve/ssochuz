/* ============================================================================
   ssochuz · HỆ THỐNG REACTION STICKER CUỐI CHƯƠNG (bản 1.19.0)
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

   DỮ LIỆU ĐANG NẰM Ở localStorage — ĐỌC KỸ PHẦN 2 TRƯỚC KHI NỐI MÁY CHỦ:
     · ssochuz-react-me-<slug>__u<uid> (đã đăng nhập) hoặc __d<mã máy>
                                 → { "<chương>": ["gach-da", …] }  (tôi đã thả gì)
     · ssochuz-react-ct-<slug>   → { "<chương>": { "gach-da": 5, … } }  (số đếm)
     · ssochuz-react-q           → hàng chờ gửi máy chủ khi mất mạng
   Mọi chỗ cần thay bằng API đều đánh dấu  TODO(API)  — kèm hợp đồng endpoint
   trong docs/features/tang-tuong-tac-doc-gia.md.

   GIẤY PHÉP ẢNH: sticker lấy từ Microsoft Fluent Emoji (MIT) — xem
   THIRD-PARTY-NOTICES.md và assets/stickers/CREDITS.txt.
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
  function uid() { try { return (w.CZ_AUTH && w.CZ_AUTH.user && w.CZ_AUTH.user()) ? (w.CZ_AUTH.user().uid || '') : ''; } catch (e) { return ''; } }

  /* ======================= 1. reactionConfig ============================
     MỘT sticker = một mục trong mảng này. Muốn thêm sticker mới:
       1. thả ảnh WebP vào assets/stickers/<id>.webp (128px là đủ, xem
          tools/make_stickers.py để tải lại từ Fluent Emoji),
       2. thêm một mục vào REACTIONS bên dưới,
       3. xong — không phải sửa component nào khác.
     Các trường bắt buộc: id, label, short_label, asset_light, asset_dark,
     fallback_emoji, animation_type, color, max_particles. */
  var REACTIONS = [
    {
      id: 'mu-bao-hiem',
      label: 'Đội mũ bảo hiểm gấp',
      short_label: 'Bảo hiểm',
      asset_light: '/assets/stickers/mu-bao-hiem.webp',
      asset_dark: '/assets/stickers/mu-bao-hiem.webp',   /* ảnh 3D đọc tốt trên cả hai nền */
      fallback_emoji: '🪖',
      animation_type: 'alarm',
      color: '#d99a24',
      color2: '#ffd76e',
      max_particles: 9,
      accent: 'warn',
      toast: 'Áo vào quần đây — đội mũ bảo hiểm gấp cho tác giả!',
      unToast: 'Đã bỏ mũ bảo hiểm'
    },
    {
      id: 'ngot-lim',
      label: 'Tiểu đường rồi',
      short_label: 'Ngọt lịm',
      asset_light: '/assets/stickers/ngot-lim.webp',
      asset_dark: '/assets/stickers/ngot-lim.webp',
      fallback_emoji: '🧁',
      animation_type: 'sweet',
      color: '#d2547f',
      color2: '#ffb3d1',
      max_particles: 12,
      accent: 'heart',
      toast: 'Ngọt lịm tim — nhớ đánh răng sau khi đọc nhé!',
      unToast: 'Đã bỏ vị ngọt'
    },
    {
      id: 'gach-da',
      label: 'Gửi gạch đá cho tác giả',
      short_label: 'Gạch đá',
      asset_light: '/assets/stickers/gach-da.webp',
      asset_dark: '/assets/stickers/gach-da.webp',
      fallback_emoji: '🧱',
      animation_type: 'thud',
      color: '#b4562c',
      color2: '#e39a6a',
      max_particles: 8,
      accent: 'smoke',
      toast: 'Đã ném gạch — nhưng nhớ góp gạch xây nhà cho tác giả nữa nhé!',
      unToast: 'Đã nhặt gạch về'
    },
    {
      id: 'cham-kem',
      label: 'Chầm kẽm',
      short_label: 'Chầm kẽm',
      asset_light: '/assets/stickers/cham-kem.webp',
      asset_dark: '/assets/stickers/cham-kem.webp',
      fallback_emoji: '😭',
      animation_type: 'tears',
      color: '#4a7fc1',
      color2: '#a8cdf5',
      max_particles: 12,
      accent: 'tear',
      toast: 'Chấm khăn đi bạn — chương sau sẽ khác mà…',
      unToast: 'Đã lau nước mắt'
    },
    {
      id: 'cay-nhu-trau',
      label: 'Cày như trâu',
      short_label: 'Cày',
      asset_light: '/assets/stickers/cay-nhu-trau.webp',
      asset_dark: '/assets/stickers/cay-nhu-trau.webp',
      fallback_emoji: '🐂',
      animation_type: 'grind',
      color: '#5f7a3f',
      color2: '#b9d18a',
      max_particles: 10,
      accent: 'zzz',
      toast: 'Cày như trâu — nhóm dịch ghi nhận công sức của bạn!',
      unToast: 'Đã cho trâu nghỉ'
    },
    {
      id: 'xin-chuong',
      label: 'Cho xin chương nữa',
      short_label: 'Mỏi tay',
      asset_light: '/assets/stickers/xin-chuong.webp',
      asset_dark: '/assets/stickers/xin-chuong.webp',
      fallback_emoji: '🙏',
      animation_type: 'plead',
      color: '#8a5fb8',
      color2: '#d3bcef',
      max_particles: 11,
      accent: 'spark',
      toast: 'Đã xin chương nữa — mỏi tay thì tác giả cũng mỏi tay!',
      unToast: 'Đã thôi xin chương'
    }
  ];
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

  /* ======================= 2. useReactions (kho dữ liệu) ================
     Một “hook” dạng hàm thuần cho môi trường không có framework: mọi thao tác
     đọc/ghi đều đi qua đây để chỗ nối máy chủ sau này chỉ phải sửa một nơi. */
  var K = {
    mine: 'ssochuz-react-me-',      /* tôi đã thả gì ở chương nào */
    count: 'ssochuz-react-ct-',     /* số đếm theo chương */
    queue: 'ssochuz-react-q',       /* hàng chờ đồng bộ */
    rate: 'ssochuz-react-rate'      /* mốc chống spam theo thiết bị */
  };
  var COOLDOWN_MS = 420;            /* cùng một sticker: 420ms mới ăn lần nữa */
  var RATE_MAX = 30, RATE_WINDOW = 60000;   /* cả hàng: 30 lượt/phút/thiết bị */

  function jget(k, dv) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? dv : v; } catch (e) { return dv; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function storeOK() { try { localStorage.setItem('ssochuz-react-probe', '1'); localStorage.removeItem('ssochuz-react-probe'); return true; } catch (e) { return false; } }

  var mem = {};                      /* bản dùng khi localStorage bị chặn (chế độ riêng tư) */

  /* Phiếu “tôi đã thả gì” thuộc về NGƯỜI, không thuộc về máy: đã đăng nhập (có
     CZ_AUTH) thì khoá theo uid — đổi máy vẫn còn phiếu của mình, hai người
     dùng chung một máy không thấy phiếu của nhau. Chưa đăng nhập thì theo mã
     máy. Số đếm vẫn theo máy, vì đó là phần đóng góp của chính máy này.
     Khi nối CZ_REACT_API thì máy chủ mới là nguồn thật (kèm user_id/device_id) */
  function owner() { return uid() ? ('u' + uid()) : ('d' + (vid() || 'x')); }
  function keyOf(slug, kind) {
    return K[kind] + slug + (kind === 'mine' ? '__' + owner() : '');
  }
  function read(slug, kind) {
    var key = keyOf(slug, kind);
    if (!storeOK()) return mem[key] || (mem[key] = {});
    var v = jget(key, {});
    return (v && typeof v === 'object') ? v : {};
  }
  function write(slug, kind, val) {
    var key = keyOf(slug, kind);
    mem[key] = val;
    jset(key, val);
  }

  /* Số nền minh hoạ khi CHƯA nối máy chủ.
     Vì sao không hiện 0 lung tung: một hàng sticker toàn số 0 trông như web
     lỗi. Số nền được băm từ slug + chương + id nên mỗi chương một khác, ổn
     định giữa các lần tải, và KHÔNG phải dữ liệu cộng đồng thật. Khi bật
     CZ_REACT_API thì bỏ hẳn phần này (server trả số thật). TODO(API). */
  function seed(slug, ch, id) {
    if (apiOn()) return 0;
    var s = String(slug) + '#' + ch + '#' + id, h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return 3 + (h % 40);
  }

  /* đếm thật của máy này (không tính số nền) */
  function localCount(slug, ch, id) {
    var all = read(slug, 'count');
    var per = all[String(ch)] || {};
    return Math.max(0, parseInt(per[id] || 0, 10) || 0);
  }
  function count(slug, ch, id) { return seed(slug, ch, id) + localCount(slug, ch, id); }
  function counts(slug, ch) {
    var out = {};
    REACTIONS.forEach(function (r) { out[r.id] = count(slug, ch, r.id); });
    return out;
  }
  function total(slug, ch) {
    var c = counts(slug, ch), n = 0;
    REACTIONS.forEach(function (r) { n += c[r.id] || 0; });
    return n;
  }
  function mine(slug, ch) {
    var all = read(slug, 'mine');
    var arr = all[String(ch)];
    return Array.isArray(arr) ? arr.filter(function (x) { return !!RX[x]; }) : [];
  }
  function isMine(slug, ch, id) { return mine(slug, ch).indexOf(id) >= 0; }

  /* chống spam theo THIẾT BỊ (chưa có tài khoản thì đây là thứ duy nhất chặn
     được một người bấm 500 lượt). Một sticker một lượt cho mỗi chương — muốn
     giảm thì bấm lại để bỏ. */
  var lastTap = {};
  function rateOK() {
    var now = Date.now(), arr = (jget(K.rate, []) || []).filter(function (t) { return now - t < RATE_WINDOW; });
    if (arr.length >= RATE_MAX) return false;
    arr.push(now);
    jset(K.rate, arr);
    return true;
  }
  function cooled(slug, ch, id) {
    var key = slug + '#' + ch + '#' + id, now = Date.now();
    if (lastTap[key] && now - lastTap[key] < COOLDOWN_MS) return false;
    lastTap[key] = now;
    return true;
  }

  /* --- hàng chờ đồng bộ: mất mạng thì giữ thao tác lại, lần sau gửi bù ------ */
  function apiOn() { return !!(w.CZ_REACT_API && CZ.hasAPI && w.fetch); }
  function qPush(op) {
    var q = jget(K.queue, []) || [];
    if (!Array.isArray(q)) q = [];
    q.push(op);
    jset(K.queue, q.slice(-80));       /* đủ để không phình localStorage */
  }
  function qFlush() {
    var q = jget(K.queue, []) || [];
    if (!apiOn() || !Array.isArray(q) || !q.length) return;
    var keep = q.slice();
    (function next() {
      var op = keep.shift();
      if (!op) { jset(K.queue, []); return; }
      post(op).then(function (ok) { if (!ok) jset(K.queue, keep.concat([op])); next(); });
    })();
  }
  /* TODO(API): hai endpoint dưới đây là hợp đồng với Worker — xem
     docs/features/tang-tuong-tac-doc-gia.md §“Hợp đồng API”. */
  function post(op) {
    return w.fetch(CZ.API + '/api/react', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(op)
    }).then(function (r) { return !!(r && r.ok); }).catch(function () { return false; });
  }
  function pull(ctx) {
    if (!apiOn()) { ctx.done(null); return; }
    var url = CZ.API + '/api/react?slug=' + encodeURIComponent(ctx.slug) + '&ch=' + encodeURIComponent(ctx.ch) +
      '&vid=' + encodeURIComponent(vid()) + (uid() ? '&uid=' + encodeURIComponent(uid()) : '');
    w.fetch(url, { headers: { accept: 'application/json' } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) { ctx.done(j && j.ok ? j : null); })
      .catch(function () { ctx.done(null); });
  }

  /* thả / bỏ một sticker — trả về trạng thái mới để UI vẽ ngay (optimistic) */
  function toggle(slug, ch, id) {
    var rx = reactionOf(id);
    if (!rx || !slug || !ch) return null;
    if (!cooled(slug, ch, id)) return { blocked: 'cooldown' };
    if (!rateOK()) return { blocked: 'rate' };

    var had = isMine(slug, ch, id);
    var allMine = read(slug, 'mine');
    var arr = (allMine[String(ch)] || []).filter(function (x) { return !!RX[x]; });
    var allCt = read(slug, 'count');
    var per = allCt[String(ch)] || {};

    if (had) {
      arr = arr.filter(function (x) { return x !== id; });
      per[id] = Math.max(0, (parseInt(per[id], 10) || 0) - 1);
    } else {
      arr.push(id);
      per[id] = (parseInt(per[id], 10) || 0) + 1;
    }
    allMine[String(ch)] = arr;
    allCt[String(ch)] = per;
    write(slug, 'mine', allMine);
    write(slug, 'count', allCt);

    /* TODO(API): thao tác này phải gửi lên máy chủ. Mất mạng thì giữ trong
       hàng chờ và nói thật với người đọc — không im lặng rồi mất dữ liệu. */
    var op = {
      reaction_id: id, reaction_type: id, story_id: slug, chapter_id: ch,
      on: had ? 0 : 1, count: 1, user_id: uid(), device_id: vid(), created_at: new Date().toISOString()
    };
    if (apiOn()) {
      post(op).then(function (ok) {
        if (!ok) { qPush(op); CZtoast('Chưa đồng bộ được lượt thả — đã lưu trên máy bạn.', 'err'); }
      });
    }
    return { id: id, on: !had, count: count(slug, ch, id), mine: arr.slice() };
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
  function stickerIcon(rx, cls) {
    /* ảnh WebP là chính; hỏng thì tự rơi về emoji (đúng yêu cầu fallback) */
    return '<img class="' + (cls || '') + '" src="' + esc(rx.asset_light) + '" alt="" width="48" height="48" ' +
      'decoding="async" loading="lazy" data-emo="' + esc(rx.fallback_emoji) + '">';
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
      ' aria-label="' + esc(rx.label + ' — ' + num(c) + ' lượt' + (mineOn ? ', bạn đã thả' : '')) + '"' +
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
          ? 'Số trên sticker là lượt thả của cả nhà — mỗi máy/nick một lượt cho mỗi loại.'
          : 'Bấm sticker để thả — mỗi máy một lượt cho mỗi loại, lưu trên máy bạn.') + '</span></div>' +
        '<div class="rx-head-act">' +
          '<span class="rx-total">' + num(total(ctx.slug, ctx.ch)) + ' lượt thả</span>' +
          '<button type="button" class="btn ghost sm" id="rxAll">Xem tất cả reaction</button>' +
        '</div>' +
      '</div>' +
      '<div class="rx-row" role="group" aria-label="Reaction cho ' + esc(ctx.label || 'chương này') + '">' +
        REACTIONS.map(function (r) { return stickerHTML(r, c[r.id], mineArr.indexOf(r.id) >= 0); }).join('') +
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
    /* giành lại hàng chờ còn kẹt từ lần trước (mất mạng lúc bấm) */
    qFlush();
    /* TODO(API): có máy chủ thì lấy số thật rồi vẽ đè lên số minh hoạ */
    pull({
      slug: ctx.slug, ch: ctx.ch,
      done: function (j) {
        if (!j || !j.counts || !ctxNow || ctxNow.slug !== ctx.slug || ctxNow.ch !== ctx.ch) return;
        var node = host;
        REACTIONS.forEach(function (r) {
          var ct = node.querySelector('[data-rx-ct="' + r.id + '"]');
          if (ct && j.counts[r.id] != null) ct.textContent = num(j.counts[r.id]);
        });
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

  /* bấm sticker: nảy nhẹ → thả hạt → cộng số → nói một câu cho vui */
  function onTap(btn) {
    var host = btn.closest('.rreact');
    var ctx = host && host.__rxCtx;
    if (!ctx) return;
    var id = btn.getAttribute('data-rx');
    var rx = reactionOf(id);
    var res = toggle(ctx.slug, ctx.ch, id);
    if (!res) return;
    if (res.blocked) {
      if (res.blocked === 'rate') CZtoast('Từ từ thôi bạn — thả chậm lại một chút nhé!', 'err');
      return;
    }
    var on = res.on;
    refresh(host);
    bump(btn);
    if (on) {
      var r = btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
      burst(btn, rx, r);
      sfx(rx.animation_type === 'thud' ? 'brick' : 'pop');
      CZtoast(rx.toast || ('Đã thả ' + rx.label + '!'), 'ok');
    } else {
      CZtoast(rx.unToast || ('Đã bỏ ' + rx.label), '');
    }
    if (apiOn()) {
      /* số hiển thị là optimistic; lần sau mở chương sẽ lấy số chuẩn từ máy chủ */
      pull({ slug: ctx.slug, ch: ctx.ch, done: function (j) {
        if (!j || !j.counts) return;
        REACTIONS.forEach(function (x) {
          var ct = host.querySelector('[data-rx-ct="' + x.id + '"]');
          if (ct && j.counts[x.id] != null) ct.textContent = num(j.counts[x.id]);
        });
      } });
    }
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
            '<span class="rx-art">' + stickerIcon(r, 'rx-img') +
              '<span class="rx-emo" aria-hidden="true">' + esc(r.fallback_emoji) + '</span>' +
              (on ? '<span class="rx-tick" aria-hidden="true">✓</span>' : '') + '</span>' +
            '<span class="pop-txt"><b>' + esc(r.label) + '</b>' +
              '<span class="pop-ct" data-rx-ct="' + esc(r.id) + '">' + num(count(ctx.slug, ctx.ch, r.id)) + ' lượt</span></span>' +
          '</button>';
        }).join('') +
        '<p class="sm muted pop-note">' + (apiOn()
          ? 'Số liệu lấy từ máy chủ; một nick/máy chỉ tính một lượt cho mỗi loại ở mỗi chương.'
          : 'Chưa nối máy chủ nên số hiện tại gồm lượt trên máy bạn và phần minh hoạ. Bấm lại sticker để bỏ lượt.') + '</p>' +
      '</div>' +
      '<div class="mf"><button class="btn ghost" data-close>Đóng</button></div>');
    bindImgFallback(m);
    m.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.pop-rx') : null;
      if (!b) return;
      var host = d.getElementById('rdReact');
      var res = toggle(ctx.slug, ctx.ch, b.getAttribute('data-rx'));
      if (!res || res.blocked) return;
      var on = res.on, rx = reactionOf(res.id);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var ct = b.querySelector('[data-rx-ct]');
      if (ct) ct.textContent = num(res.count) + ' lượt';
      var tick = b.querySelector('.rx-tick');
      var art = b.querySelector('.rx-art');
      if (on && !tick && art) { var t = d.createElement('span'); t.className = 'rx-tick'; t.setAttribute('aria-hidden', 'true'); t.textContent = '✓'; art.appendChild(t); }
      if (!on && tick) tick.remove();
      if (on) { burst(b, rx, b.getBoundingClientRect()); sfx('pop'); CZtoast(rx.toast || 'Đã thả sticker!', 'ok'); }
      else CZtoast(rx.unToast || 'Đã bỏ sticker', '');
      if (host) refresh(host);
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
    d.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var b = e.target && e.target.closest ? e.target.closest('.rreact .rx[data-rx]') : null;
      if (!b) return;
      e.preventDefault();
      onTap(b);
    });
  }

  w.CZReact = {
    VERSION: '1.19.0',
    REACTIONS: REACTIONS,
    reactionOf: reactionOf,
    counts: counts, count: count, total: total, mine: mine, isMine: isMine,
    toggle: toggle, pull: pull, flush: qFlush,
    mount: mount, afterChapterPaint: afterChapterPaint,
    popover: popover, burst: burst, sfx: sfx, layer: layer,
    apiOn: apiOn,
    /* để bài kiểm thử đọc được cấu hình chống spam mà không phải đoán */
    _cfg: { cooldownMs: COOLDOWN_MS, rateMax: RATE_MAX, rateWindowMs: RATE_WINDOW, liveMax: LIVE_MAX },
    _keys: K
  };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', bind);
  else bind();
})(window, document);
