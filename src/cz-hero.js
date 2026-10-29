/* ============================================================================
   ssochuz · HERO DÙNG CHUNG — “BỘ BÀI” (hướng A · “Sạp báo”)
   ----------------------------------------------------------------------------
   LỊCH SỬ: trang chủ từng tự dựng hero trong `cz-home.js` (áp phích 2:3 + số
   thứ tự mờ), rồi chuyển sang banner full-bleed dùng ảnh bìa phóng to. Bản
   full-bleed KHÔNG ĐẠT vì kho chỉ có bìa DỌC 480×600 / 480×681 — phủ lên banner
   2,3:1 là phóng ~3 lần, nhoè và mất chủ thể. Hướng được duyệt (2026-10-29) là
   “BỘ BÀI”: **bìa chính là điều hướng**, 5 bìa xoè thành một quạt có tâm, bìa
   đang chọn sáng nhất; chữ đọc ở cột trái.

   MỘT component dùng chung `CZ.heroBanner(root, props)`:
     · nhận dữ liệu qua props (hợp đồng bên dưới), KHÔNG đọc registry hay
       localStorage — dùng được cho hero trang chủ và mọi khối “nổi bật” khác;
     · lo phần khó: quạt bìa (bìa nào cũng bấm được), chữ đổi theo bìa, tự
       chuyển 8 s + nút Tạm dừng, phím ← →, vuốt ngang, live region, fallback;
     · vị trí quạt nằm trong CSS (`data-pos` + `--fan-unit`), JS không đo đạc,
       không đặt toạ độ px — đổi breakpoint chỉ cần sửa CSS.

   HỢP ĐỒNG DỮ LIỆU (mọi trường tuỳ chọn trừ id/title):
     HeroBannerItem = {
       id, title, href?, description?, caption?, facts?,
       thumbnail: { src, alt? },            // bìa dùng cho quạt
       backgroundImage: { src, alt? },      // dự phòng khi thiếu thumbnail
       facts:  [{ label, value, num?, soft?, hideSm? }],   // “kệ nhãn”: CHƯƠNG · TÁC GIẢ · …
       badges: [{ label, tone?, dot?, icon? }],            // done/run/soon → con dấu; bad → 18+; lock → bỏ
       meta:   [{ icon?, label, strong?, title? }],         // dự phòng: tự đổi thành facts
       progress?: { current, total?, percent?, label? },
       primaryCta: { label, href?, icon?, title?, disabled? },
       secondaryCtas: [{ label, href?, onClick?, icon?, variant?, pressed?, title? }]
     }
   `caption` là dòng mono dưới bìa đang chọn (thường là tác giả); thiếu thì nhãn
   tự ẩn thay vì để lại dấu “·” trống.

   FALLBACK (đều có thật, không cần dữ liệu mới):
     · items rỗng   → ẩn cả section (không để khối trắng);
     · 1 item       → không dựng quạt, ticks, nút trước/sau hay nút tạm dừng;
     · thiếu bìa    → ô nền tối giữ chỗ, chữ vẫn đọc được, không nhảy bố cục;
     · ảnh lỗi      → `CZ.imgSettle` gỡ <img> hỏng, ô bìa vẫn giữ khung;
     · mô tả dài    → cắt 2 dòng bằng line-clamp; điện thoại ẩn hẳn.

   HIỆU NĂNG: ảnh đầu `fetchpriority="high"`, các bìa còn lại `loading="lazy"`
   (đều nằm trong khung nhìn nên trình duyệt tự quyết định) — khung bìa khoá
   bằng `aspect-ratio` nên không CLS. Chỉ animate `transform`/`opacity`.

   A11Y: mỗi bìa là <button> có nhãn “Xem: <tên truyện>” + `aria-current` cho bìa
   đang chọn; ticks cũng là <button> và cũng mang `aria-current`; section có
   `aria-roledescription="carousel"` + `aria-labelledby` trỏ <h1> của mục đang
   hiện; live region chỉ đọc khi NGƯỜI DÙNG đổi truyện (máy tự chuyển thì im
   lặng, không làm ồn trình đọc màn hình); tôn trọng `prefers-reduced-motion`.
   ========================================================================== */
(function (w) {
  'use strict';
  var CZ = w.CZ || (w.CZ = {});
  function esc(s) { return CZ.esc ? CZ.esc(s) : String(s == null ? '' : s); }
  function ic(name, cls) { return CZ.icon ? CZ.icon(name, cls) : ''; }
  function pad2(n) { n = parseInt(n, 10) || 0; return (n < 10 ? '0' : '') + n; }
  var PICK_LABEL = 'Chọn truyện nổi bật';

  /* ---------- 1. MẢNH MARKUP -------------------------------------------------
     Tách nhỏ để mỗi quy tắc fallback nằm ngay chỗ quyết định. */

  /* ---------- “KỆ NHÃN”: dòng badge + lưới 4 ô thông tin -------------------
     Bản cũ nhét trạng thái + 5 mục thông tin vào MỘT hàng chữ, cách nhau bằng
     dấu chấm: truyện khoá mật mã có 7 mục ⇒ tự xuống 2 dòng, dấu chấm rơi vào
     đầu dòng, và trạng thái đứng ngang hàng với tác giả nên không ai đọc ra
     “đây là tình trạng bộ truyện”. Nay tách làm hai tầng:
       · .head  = badge trạng thái (kiểu con dấu) + 18+ + nhãn phụ hiếm
       · .spec  = lưới dt/dd: CHƯƠNG · TÁC GIẢ · [COUPLE] · CẬP NHẬT
     “Có mật mã” KHÔNG còn là chip: nó nằm trong nhãn nút (“Nhập mật mã để
     đọc”) nên hành động nói thay trạng thái. */
  var ST_TONES = { done: 1, run: 1, soon: 1 };

  function statusHTML(badges) {
    for (var i = 0; i < badges.length; i++) {
      var b = badges[i];
      if (b && b.label && ST_TONES[b.tone || 'run']) {
        return '<span class="hb-st ' + esc(b.tone || 'run') + '">' + esc(b.label) + '</span>';
      }
    }
    return '';
  }
  function extraBadgesHTML(badges) {
    var out = '';
    for (var i = 0; i < badges.length; i++) {
      var b = badges[i];
      if (!b || !b.label) continue;
      if (ST_TONES[b.tone || 'run'] || b.tone === 'lock') continue;  /* lock → trong CTA */
      if (b.tone === 'bad') out += '<span class="hb-b18">' + esc(b.label) + '</span>';
      else out += '<span class="hb-st acc">' + esc(b.label) + '</span>';
    }
    return out;
  }
  /* `facts` là hợp đồng mới; `meta` cũ vẫn dựng được để component không phụ
     thuộc một trường duy nhất (title của meta thành nhãn ô). */
  function factsOf(item) {
    if (item.facts && item.facts.length) return item.facts;
    return (item.meta || []).map(function (m) {
      if (!m || !m.label) return null;
      return { label: m.title || '', value: m.label, num: !!m.strong, soft: !m.strong };
    }).filter(Boolean);
  }
  function factsHTML(item) {
    var f = factsOf(item).filter(function (x) { return x && x.label && x.value != null && x.value !== ''; });
    if (!f.length) return '';
    /* `slot` (ch/au/cp/up) được CSS ghim vào một cột cố định: hàng nhãn không
       nhảy ngang khi đổi truyện (số chương, tên tác giả dài ngắn khác nhau).
       Không có `slot` thì thẻ rơi về lưới tự động — component vẫn dựng được
       `facts` từ nơi khác mà không cần biết chuyện này. */
    return '<dl class="spec">' + f.map(function (x) {
      var cls = x.num ? 'num' : (x.soft ? 'soft' : '');
      return '<div class="c' + (x.hideSm ? ' sm-hide' : '') + '"' +
        (x.slot ? ' data-slot="' + esc(x.slot) + '"' : '') + '>' +
        '<dt>' + esc(x.label) + '</dt>' +
        '<dd' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(String(x.value)) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function primaryHTML(cta) {
    if (!cta || !cta.label) return '';
    var inner = (cta.icon ? ic(cta.icon, 'i-s') : '') +
      '<span class="hb-cta-lbl">' + esc(cta.label) + '</span>';
    if (cta.disabled || !cta.href) {
      return '<button class="btn pri lg hb-cta off" type="button" disabled>' + inner + '</button>';
    }
    return '<a class="btn pri lg hb-cta" href="' + esc(cta.href) + '"' +
      (cta.title ? ' title="' + esc(cta.title) + '"' : '') + '>' + inner + '</a>';
  }

  /* Nút phụ trong hero chỉ còn ICON tròn 44px (CSS ẩn .hb-cta-lbl), nhưng nhãn
     vẫn nằm ở aria-label/title nên trình đọc màn hình và tooltip không mất gì. */
  function secondaryHTML(cta, k) {
    if (!cta || !cta.label) return '';
    var cls = 'btn lg hb-cta' + (cta.variant === 'ghost' ? ' ghost' : '') + (cta.pressed ? ' on' : '');
    var inner = (cta.icon ? ic(cta.icon, 'i-s') : '') +
      '<span class="hb-cta-lbl">' + esc(cta.label) + '</span>';
    if (cta.onClick || !cta.href) {
      return '<button class="' + cls + '" type="button" data-hb-act="' + k + '"' +
        ' aria-label="' + esc(cta.label) + '"' +
        (cta.pressed == null ? '' : ' aria-pressed="' + (cta.pressed ? 'true' : 'false') + '"') +
        ' title="' + esc(cta.title || cta.label) + '">' + inner + '</button>';
    }
    return '<a class="' + cls + '" href="' + esc(cta.href) + '" aria-label="' + esc(cta.label) + '"' +
      ' title="' + esc(cta.title || cta.label) + '">' + inner + '</a>';
  }

  function slideHTML(item, i, total) {
    var badges = item.badges || [];
    var head = statusHTML(badges) + extraBadgesHTML(badges);
    var secondary = (item.secondaryCtas || []).map(secondaryHTML).join('');
    var titleHTML = item.title
      ? (item.href ? '<a href="' + esc(item.href) + '">' + esc(item.title) + '</a>' : esc(item.title))
      : '—';
    /* Các slide xếp chồng trong MỘT ô lưới (grid-area: 1/1) nên khung không đổi
       chiều cao khi đổi truyện ⇒ không layout shift. Slide không hiện dùng
       visibility:hidden (không tab được vào link bên trong) + aria-hidden. */
    return '<div class="slide' + (i === 0 ? ' on' : '') + '" data-i="' + i + '"' +
      ' role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' / ' + total + '"' +
      (i === 0 ? '' : ' aria-hidden="true"') + '>' +
        '<div class="info">' +
          (head ? '<div class="head">' + head + '</div>' : '') +
          '<h1 id="hbTitle-' + i + '"><span class="hb-t">' + titleHTML + '</span></h1>' +
          factsHTML(item) +
          '<div class="btn-row">' + primaryHTML(item.primaryCta) + secondary + '</div>' +
        '</div>' +
      '</div>';
  }

  /* ---------- NỀN: bìa ngang mờ + “nửa gradient” --------------------------
     Mỗi mục có một lớp nền riêng, xếp chồng và mờ dần khi đổi truyện:
       · có `backdrop` (bìa ngang)  → ảnh phóng to, làm mờ 30px
       · không có                   → gradient 2 màu LẤY TỪ CHÍNH BÌA (canvas
                                      12×18, chia nửa trên/dưới) ⇒ bộ nào cũng
                                      có nền ăn màu bìa, không cần thêm tệp.
     Luôn phủ thêm `.veil`: nửa trái gần đặc để chữ trắng đọc được, nửa phải để
     ảnh lộ ra sau quạt bìa. */
  var PAL = {};                       /* cache màu theo src — đổi qua lại không vẽ lại */

  function bgHTML(item, i) {
    var src = (item.backdrop && item.backdrop.src) || '';
    var cov = coverOf(item);
    /* Ba lớp ảnh, CÙNG một tệp bìa nên không thêm byte nào:
         .pic   bìa ngang (nếu có) — nền chính
         .ghost bìa DỌC phóng to, mờ đục — cho nền có hình khối, không phải
                một tảng gradient phẳng (đây là thứ làm nền “đặc sắc” hơn)
         .glow  quầng sáng màu accent ngay sau quạt bìa
       `loading` chỉ đặt cho lớp đầu: ảnh sau dùng lại đúng URL đã tải. */
    return '<div class="hb-scene">' +
      (src ? '<img class="pic" src="' + esc(src) + '" alt="" aria-hidden="true" decoding="async"' +
        (i === 0 ? '' : ' loading="lazy"') + '>' : '') +
      (cov ? '<img class="ghost" src="' + esc(cov) + '" alt="" aria-hidden="true" decoding="async"' +
        (i === 0 ? '' : ' loading="lazy"') + '>' : '') +
      '<i class="wash"></i><i class="glow"></i><i class="veil"></i></div>';
  }

  function shade(rgb, k) {
    return 'rgb(' + rgb.map(function (v) { return Math.max(0, Math.min(255, Math.round(v * k))); }).join(',') + ')';
  }
  function applyPalette(el, pair) {
    if (!el || !pair) return;
    el.style.setProperty('--hb-bg-a', pair[0]);
    el.style.setProperty('--hb-bg-b', pair[1]);
  }
  /* Lấy 2 màu đại diện của bìa. Không đọc được (CORS / không có canvas) thì thôi:
     CSS đã có gradient mặc định nên nền vẫn đúng tông tối. */
  function washFromCover(el, src) {
    if (!src) return;
    if (PAL[src]) { applyPalette(el, PAL[src]); return; }
    try {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () {
        try {
          var c = document.createElement('canvas'), W = 12, H = 18;
          c.width = W; c.height = H;
          var x = c.getContext('2d');
          if (!x) return;
          x.drawImage(im, 0, 0, W, H);
          var d = x.getImageData(0, 0, W, H).data;
          var top = [0, 0, 0], bot = [0, 0, 0], nt = 0, nb = 0;
          for (var i = 0; i < d.length; i += 4) {
            var row = Math.floor((i / 4) / W);
            var t = row < H / 2 ? top : bot;
            if (row < H / 2) nt++; else nb++;
            t[0] += d[i]; t[1] += d[i + 1]; t[2] += d[i + 2];
          }
          if (!nt || !nb) return;
          /* 0.46/0.62 → 0.62/0.84: nền cũ gần như đen, bìa màu mấy cũng ra
             một tảng xám. Vẫn tối hơn bìa thật để chữ trắng còn đọc được. */
          var a = shade([top[0] / nt, top[1] / nt, top[2] / nt], 0.62);
          var b = shade([bot[0] / nb, bot[1] / nb, bot[2] / nb], 0.84);
          PAL[src] = [a, b];
          applyPalette(el, PAL[src]);
        } catch (e) { /* canvas bị “bẩn” vì ảnh khác nguồn — bỏ qua */ }
      };
      im.src = src;
    } catch (e) { /* không tạo được Image — bỏ qua */ }
  }

  /* Bìa dùng cho quạt: ưu tiên `thumbnail`, thiếu thì rơi về `backgroundImage`
     (hợp đồng cũ) để component không phụ thuộc một trường duy nhất. */
  function coverOf(item) {
    return (item.thumbnail && item.thumbnail.src) ||
      (item.backgroundImage && item.backgroundImage.src) || '';
  }

  function fanHTML(items, index) {
    var n = items.length;
    var btns = items.map(function (it, k) {
      var src = coverOf(it), on = k === index;
      /* thứ tự tab = thứ tự DOM (đúng thứ tự truyện), vị trí trong quạt = data-pos */
      return '<button type="button" class="coverbtn' + (on ? ' on' : '') + '"' +
        ' data-hb-go="' + k + '" data-pos="' + ((k - index + n) % n) + '"' +
        (on ? ' aria-current="true"' : '') +
        ' aria-label="Xem: ' + esc(it.title || ('mục ' + (k + 1))) + '"' +
        ' title="' + esc(it.title || '') + '">' +
        (src
          ? '<img src="' + esc(src) + '" alt="" decoding="async" referrerpolicy="no-referrer"' +
            (k === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + '>'
          : '<span class="noimg" aria-hidden="true"></span>') +
        '</button>';
    }).join('');
    /* Thanh điều khiển gộp nằm ngoài các <button> bìa (nút có overflow:hidden)
       và luôn ở tâm quạt. */
    return btns + fanBarHTML();
  }

  /* ---------- THANH ĐIỀU KHIỂN GỘP (dưới quạt) ------------------------------
     Bản trước có BA thứ đứng cùng một chỗ: 5 vạch ticks + “02 / 05” + cụm ‹ › ⏸
     ở cột chữ, rồi thêm dòng “02 · tác giả” dưới bìa — ticks trùng với chính quạt
     (bấm bìa là chọn được), số đếm trùng với nhãn dưới bìa. Nay gộp làm MỘT viên
     duy nhất nằm ngay dưới quạt, đúng chỗ mắt đang nhìn:

         ‹   02 / 05 · KRATAI DUEAN   ›    ⏸

     Quạt vẫn là cách chọn chính (bấm bìa), ‹ › để lướt, số đếm cho biết đang ở
     đâu, ⏸ để dừng tự chuyển. Không còn vạch ticks nào để đếm trùng. */
  function fanBarHTML() {
    return '<div class="fanbar" role="group" aria-label="' + PICK_LABEL + '">' +
      '<button class="arrow" id="hPrev" type="button" data-hb-prev aria-label="Xem mục trước">' +
        ic('left', 'i-s') + '</button>' +
      '<span class="fanbar-mid">' +
        '<span class="count" id="hCount" aria-hidden="true"></span>' +
        '<i class="fanbar-dot" aria-hidden="true"></i>' +
        '<span class="who" id="hWho" aria-hidden="true"></span>' +
      '</span>' +
      '<button class="arrow" id="hNext" type="button" data-hb-next aria-label="Xem mục tiếp theo">' +
        ic('right', 'i-s') + '</button>' +
      '<button class="arrow play" id="hPlay" type="button" data-hb-play aria-label="Tạm dừng tự chuyển truyện"></button>' +
    '</div>';
  }

  /* ---------- 2. COMPONENT ------------------------------------------------- */

  function HeroBanner(root, props) {
    this.root = root;
    this.props = props || {};
    this.items = (this.props.items || []).filter(Boolean);
    this.total = this.items.length;
    this.loop = this.props.loop !== false;
    this.autoPlay = !!this.props.autoPlay;
    this.userPaused = false;
    this.interval = Math.max(3000, parseInt(this.props.autoPlayInterval, 10) || 8000);
    this.timer = null;
    this.hovered = false;
    this.focused = false;
    this.index = 0;
    this._onDocKey = null;
    this._onVis = null;
    this._bound = [];
    this._idleTimer = null;
    if (!this.total) { root.hidden = true; root.innerHTML = ''; return; }
    var start = parseInt(this.props.initialIndex, 10) || 0;
    this.index = Math.max(0, Math.min(this.total - 1, start));
    this.render();
    this.bind();
    if (this.autoPlay && !CZ.reduce) this.start();
  }

  HeroBanner.prototype.render = function () {
    var root = this.root, self = this;
    root.hidden = false;
    root.classList.add('hero', 'hb-deck');
    root.setAttribute('aria-roledescription', 'carousel');
    root.setAttribute('aria-labelledby', 'hbTitle-' + this.index);
    root.innerHTML =
      '<div class="hb-bgs" aria-hidden="true">' +
        this.items.map(function (it, i) { return bgHTML(it, i); }).join('') +
      '</div>' +
      '<div class="hb-grid">' +
        '<div class="hb-col">' +
          '<div class="stage" id="stage">' +
            this.items.map(function (it, i) { return slideHTML(it, i, self.total); }).join('') +
          '</div>' +
        '</div>' +
        '<div class="fan" id="hFan">' + fanHTML(this.items, this.index) + '</div>' +
      '</div>' +
      '<div class="bar" aria-hidden="true"><i id="heroBar"></i></div>' +
      '<p class="sr-only" id="hbLive" aria-live="polite" aria-atomic="true"></p>';

    this.bgs = Array.prototype.slice.call(root.querySelectorAll('.hb-scene'));
    this.slides = Array.prototype.slice.call(root.querySelectorAll('.slide'));
    this.covers = Array.prototype.slice.call(root.querySelectorAll('.coverbtn'));
    this.fan = root.querySelector('.fan');
    this.barEl = root.querySelector('.fanbar');
    this.who = root.querySelector('.fanbar .who');
    this.count = root.querySelector('.count');
    this.live = root.querySelector('#hbLive');
    this.playBtn = root.querySelector('[data-hb-play]');

    /* Chỉ một mục ⇒ không có gì để chuyển: ẩn quạt + ticks + nút trước/sau. */
    var many = this.total > 1;
    if (!many) {
      this.fan.hidden = true;
      root.querySelector('[data-hb-prev]').hidden = true;
      root.querySelector('[data-hb-next]').hidden = true;
    }
    /* `showThumbnails: false` / `showDots: false` giữ nguyên tên cũ: tắt quạt /
       tắt thanh điều khiển — hai thứ đóng cùng vai trò “chọn mục”. */
    if (this.props.showThumbnails === false) this.fan.hidden = true;
    if (this.props.showDots === false && this.barEl) this.barEl.hidden = true;
    /* không có gì để tạm dừng khi: chưa bật autoplay, chỉ 1 mục, hoặc máy đang
       bật “giảm chuyển động” (khi đó component cố ý KHÔNG tự chuyển truyện) */
    if (!this.autoPlay || !many || CZ.reduce) this.playBtn.hidden = true;

    this.paint(this.index, false);
  };

  HeroBanner.prototype.paint = function (i, announce) {
    var n = this.total, item = this.items[i] || {};
    this.index = i;
    this.slides.forEach(function (s, k) {
      s.classList.toggle('on', k === i);
      if (k === i) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
    });
    /* Bìa: đang chọn luôn ở data-pos="0" (tâm); các bìa khác xếp vòng quanh theo
       khoảng cách tới nó — nhờ vậy đổi truyện nào quạt cũng xếp lại đúng nhịp. */
    this.covers.forEach(function (b, k) {
      var on = k === i;
      b.setAttribute('data-pos', String((k - i + n) % n));
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    var hasWide = !!(item.backdrop && item.backdrop.src);
    this.bgs.forEach(function (b, k) { b.classList.toggle('on', k === i); });
    if (this.bgs[i] && !hasWide) washFromCover(this.bgs[i], coverOf(item));
    if (this.count) {
      this.count.innerHTML = '<b>' + pad2(i + 1) + '</b> / ' + pad2(n);
    }
    this.root.setAttribute('aria-labelledby', 'hbTitle-' + i);
    if (this.who) this.who.textContent = item.caption || '';
    /* không có tác giả thì bỏ luôn dấu chấm + khoảng trống, thanh gọn lại */
    if (this.barEl) this.barEl.classList.toggle('no-who', !item.caption);
    if (announce && this.live) {
      this.live.textContent = 'Mục ' + (i + 1) + ' / ' + n + ': ' + (item.title || '');
    }
  };

  HeroBanner.prototype.goTo = function (i) {
    var n = this.total;
    if (!n) return;
    if (this.loop) i = ((i % n) + n) % n;
    else i = Math.max(0, Math.min(n - 1, i));
    if (i === this.index) { this.restart(); return; }
    this.paint(i, true);
    this.restart();
  };

  HeroBanner.prototype.next = function () {
    if (!this.loop && this.index === this.total - 1) return;
    this.goTo(this.index + 1);
  };
  HeroBanner.prototype.prev = function () {
    if (!this.loop && this.index === 0) return;
    this.goTo(this.index - 1);
  };

  HeroBanner.prototype.bar = function (running) {
    var bar = this.root.querySelector('.bar i');
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(0)';
    if (!running) return;
    var self = this;
    var raf = w.requestAnimationFrame || function (fn) { setTimeout(fn, 16); };
    raf(function () {
      bar.style.transition = 'transform ' + self.interval + 'ms linear';
      bar.style.transform = 'scaleX(1)';
    });
  };

  HeroBanner.prototype.start = function () {
    var self = this;
    this.stop();
    if (this.userPaused || CZ.reduce || this.total < 2) return;
    this.timer = setInterval(function () { self.next(); }, this.interval);
    this.bar(true);
  };

  HeroBanner.prototype.stop = function () {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.bar(false);
  };

  /* autoplay chỉ chạy khi: bật autoplay + người dùng chưa bấm Tạm dừng + chuột
     không nằm trên khối + focus bàn phím không ở trong khối + tab đang hiện. */
  HeroBanner.prototype.restart = function () {
    if (!this.autoPlay) return;
    if (this.userPaused || this.hovered || this.focused || w.document.hidden) { this.stop(); return; }
    this.start();
  };

  HeroBanner.prototype.setPlayLabel = function () {
    if (!this.playBtn) return;
    var paused = this.userPaused;
    this.playBtn.innerHTML = paused ? ic('play', 'i-s') : ic('pause', 'i-s');
    this.playBtn.setAttribute('aria-label', paused ? 'Tiếp tục tự chuyển truyện' : 'Tạm dừng tự chuyển truyện');
    this.playBtn.setAttribute('title', paused ? 'Tiếp tục tự chuyển truyện' : 'Tạm dừng tự chuyển truyện');
    this.playBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
  };

  /* gắn listener và NHỚ chúng: destroy() gỡ sạch, nên mount lại (ví dụ quay lại
     tab) không bị cộng dồn listener cũ trên cùng một <section>. */
  HeroBanner.prototype.on = function (el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    this._bound.push([el, type, fn, opts]);
  };

  HeroBanner.prototype.bind = function () {
    var self = this, root = this.root;

    this.on(root, 'click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var go = t.closest('[data-hb-go]');
      if (go) { self.goTo(parseInt(go.getAttribute('data-hb-go'), 10) || 0); return; }
      if (t.closest('[data-hb-prev]')) { self.prev(); return; }
      if (t.closest('[data-hb-next]')) { self.next(); return; }
      if (t.closest('[data-hb-play]')) {
        self.userPaused = !self.userPaused;
        self.setPlayLabel();
        if (self.userPaused) self.stop(); else self.start();
        return;
      }
      /* hành động phụ (Lưu vào tủ, …): callback do nơi gọi truyền vào */
      var act = t.closest('[data-hb-act]');
      if (act) {
        var slide = act.closest('.slide');
        var item = slide ? self.items[parseInt(slide.getAttribute('data-i'), 10)] : null;
        var cta = item && item.secondaryCtas && item.secondaryCtas[parseInt(act.getAttribute('data-hb-act'), 10)];
        if (cta && cta.onClick) cta.onClick(act, item, self);
      }
    });

    /* bàn phím: chỉ khi focus đang ở trong khối (theo đúng phạm vi carousel) */
    this.on(root, 'keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); self.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); self.prev(); }
      else if (e.key === 'Home') { e.preventDefault(); self.goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); self.goTo(self.total - 1); }
    });
    /* giữ phím tắt toàn trang như bản cũ, nhưng nhường phím khi người dùng đang
       gõ ở ô nhập. */
    this._onDocKey = function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      var tag = String((e.target && e.target.tagName) || '').toUpperCase();
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
      if (root.contains(e.target)) return;           /* đã xử lý ở handler trên */
      if (e.key === 'ArrowRight') self.next();
      else if (e.key === 'ArrowLeft') self.prev();
    };
    w.document.addEventListener('keydown', this._onDocKey);

    this.on(root, 'mouseenter', function () { self.hovered = true; self.stop(); });
    this.on(root, 'mouseleave', function () { self.hovered = false; self.restart(); });
    this.on(root, 'focusin', function () { self.focused = true; self.stop(); });
    this.on(root, 'focusout', function (e) {
      if (root.contains(e.relatedTarget)) return;
      self.focused = false;
      self.restart();
    });
    this._onVis = function () { if (w.document.hidden) self.stop(); else self.restart(); };
    w.document.addEventListener('visibilitychange', this._onVis);

    /* vuốt ngang trên điện thoại: chỉ tính khi quãng ngang > 44px và lớn hơn dọc */
    var x0 = null, y0 = null;
    this.on(root, 'touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    this.on(root, 'touchend', function (e) {
      if (x0 == null || !e.changedTouches || !e.changedTouches.length) { x0 = y0 = null; return; }
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) self.next(); else self.prev();
      }
      x0 = y0 = null;
    }, { passive: true });

    this.setPlayLabel();
  };

  /* đổi nhãn một nút phụ sau khi hành động chạy xong (Lưu/Đã lưu) */
  HeroBanner.prototype.actionLabel = function (btn, label, pressed) {
    if (!btn) return;
    var span = btn.querySelector('.hb-cta-lbl');
    if (span) span.textContent = label;
    btn.setAttribute('aria-label', label);
    if (pressed != null) btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    btn.classList.toggle('on', !!pressed);
  };

  HeroBanner.prototype.destroy = function () {
    this.stop();
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (this._onDocKey) w.document.removeEventListener('keydown', this._onDocKey);
    if (this._onVis) w.document.removeEventListener('visibilitychange', this._onVis);
    (this._bound || []).forEach(function (b) { b[0].removeEventListener(b[1], b[2], b[3]); });
    this._bound = [];
    this.root.innerHTML = '';
    this.root.removeAttribute('aria-roledescription');
    this.root.removeAttribute('aria-labelledby');
  };

  CZ.heroBanner = function (root, props) {
    if (!root) return null;
    root.classList.add('hero');
    return new HeroBanner(root, props || {});
  };
  CZ.HeroBanner = HeroBanner;
})(window);
