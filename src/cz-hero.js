/* ============================================================================
   ssochuz · FEATURE HERO BANNER — khối “nổi bật” dạng banner full-bleed
   ----------------------------------------------------------------------------
   VÁ (2026-10-29): trước đây trang chủ tự dựng hero trong `cz-home.js` theo
   kiểu THẺ DỌC — áp phích 2:3 bên phải, số thứ tự “01” mờ phía sau, nền phẳng.
   Kiểu đó chỉ hợp một khối, không dùng lại được, và mỗi lần cần một banner nữa
   là một lần chép markup + chép logic chuyển slide.

   Nay tách thành MỘT component dùng chung `CZ.heroBanner(root, props)`:
     · nhận dữ liệu qua props (`items` theo đúng hợp đồng HeroBannerItem bên
       dưới), KHÔNG đọc registry/localStorage — nhờ vậy dùng được cho cả hero
       trang chủ, hero “Nổi bật hôm nay”, hay bất kỳ khối nổi bật nào khác;
     · lo phần khó: ảnh nền full-bleed, hai lớp gradient, chuyển slide mờ dần,
       autoplay có nút Tạm dừng/Tiếp tục, bàn phím, vuốt, live region, fallback.
   Màu/khoảng cách vẫn lấy từ token trong `cz.css` (khối “5. HERO”), không có
   mã màu nào nằm trong tệp này.

   HỢP ĐỒNG DỮ LIỆU (mọi trường đều tuỳ chọn trừ id/title):
     HeroBannerItem = {
       id, title, href?, eyebrow?, description?,
       backgroundImage: { src, srcSet?, sizes?, alt?, width?, height? },
       thumbnail: { src, alt? },
       badges: [{ label, tone?, dot?, icon? }],
       meta:   [{ icon?, label, strong? }],
       progress?: { current, total?, percent?, label? },
       primaryCta: { label, href?, icon?, disabled? },
       secondaryCtas: [{ label, href?, onClick?, icon?, variant?, pressed? }]
     }
   Nhiều trường là phần MỞ RỘNG so với bản gốc (tone/dot/href/progress/pressed/…)
   để giữ đủ dữ liệu cũ (tình trạng, số chương, tác giả, couple, ngày cập nhật,
   tiến độ đang đọc, “Lưu vào tủ”) mà không phải nhét HTML vào props.

   FALLBACK (đều có thật, không cần dữ liệu mới):
     · items rỗng  → ẩn cả section (không để khối trắng);
     · 1 item      → không dựng nút trước/sau, dải thumbnail hay dot;
     · thiếu thumbnail → dùng chính ảnh nền;
     · ảnh lỗi     → nền tối của `.hb-media` giữ nguyên, chữ vẫn đọc được
                     (`imgSettle` trong cz-app.js gỡ <img> hỏng, không đụng chữ);
     · mô tả rỗng/quá dài → bỏ hẳn hoặc cắt 3 dòng bằng CSS (line-clamp).

   HIỆU NĂNG: ảnh đầu tải ưu tiên (`fetchpriority="high"`), ảnh còn lại để
   `data-src` rồi nạp khi rảnh hoặc đúng lúc chuyển tới — không tải sẵn 5 ảnh
   lớn cho một khung hình đầu. Khung ảnh có width/height nên không nhảy bố cục.
   ========================================================================== */
(function (w) {
  'use strict';
  var CZ = w.CZ || (w.CZ = {});
  function esc(s) { return CZ.esc ? CZ.esc(s) : String(s == null ? '' : s); }
  function ic(name, cls) { return CZ.icon ? CZ.icon(name, cls) : ''; }
  var DOTS_LABEL = 'Chọn truyện nổi bật';

  /* ---------- 1. MẢNH MARKUP -------------------------------------------------
     Tách nhỏ để đọc được và để mỗi quy tắc fallback nằm ngay chỗ quyết định. */

  function badgeHTML(b) {
    if (!b || !b.label) return '';
    return '<span class="pill ' + esc(b.tone || '') + '">' +
      (b.dot ? '<span class="d"></span>' : (b.icon ? ic(b.icon, 'i-s') : '')) +
      esc(b.label) + '</span>';
  }

  function metaHTML(m) {
    if (!m || !m.label) return '';
    return '<span' + (m.title ? ' title="' + esc(m.title) + '"' : '') + '>' +
      (m.icon ? ic(m.icon, 'i-s') + ' ' : '') +
      (m.strong ? '<b>' + esc(m.label) + '</b>' : esc(m.label)) + '</span>';
  }

  function progressHTML(p) {
    if (!p) return '';
    var pct = Math.max(0, Math.min(100, Number(p.percent) || 0));
    var label = p.label || ('đang đọc <b>chương ' + esc(p.current || 1) + '</b>' +
      (p.total ? ' / ' + esc(p.total) : '') + ' · ' + Math.round(pct) + '%');
    return '<div class="prog"><span class="pb"><i style="width:' + pct + '%"></i></span>' +
      '<span>' + label + '</span></div>';
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

  /* Nút phụ: có onClick thì là <button> (hành động tại chỗ, ví dụ “Lưu vào tủ”),
     còn lại là <a>. `aria-label` luôn đặt để bản chỉ-có-icon trên điện thoại
     vẫn đọc được tên nút. */
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
    var badges = (item.badges || []).map(badgeHTML).join('');
    var meta = (item.meta || []).map(metaHTML).join('');
    var secondary = (item.secondaryCtas || []).map(secondaryHTML).join('');
    var head = item.title
      ? (item.href ? '<a href="' + esc(item.href) + '">' + esc(item.title) + '</a>' : esc(item.title))
      : '—';
    /* slide là <div role="group"> (không phải <article>): axe-core chỉ cho
       aria-roledescription đi cùng role group ở đây, và mỗi slide đã có <h1>
       riêng nên không cần thêm vai trò article. */
    return '<div class="slide' + (i === 0 ? ' on' : '') + '" data-i="' + i + '"' +
      ' role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' / ' + total + '"' +
      (i === 0 ? '' : ' aria-hidden="true"') + '>' +
        '<div class="hb-inner"><div class="col"><div class="info">' +
          (item.eyebrow ? '<span class="eyebrow">' + esc(item.eyebrow) + '</span>' : '') +
          '<h1 id="hbTitle-' + i + '">' + head + '</h1>' +
          ((badges || meta) ? '<div class="meta">' + badges + meta + '</div>' : '') +
          (item.description ? '<p class="syn">' + esc(item.description) + '</p>' : '') +
          progressHTML(item.progress) +
          '<div class="btn-row">' + primaryHTML(item.primaryCta) + secondary + '</div>' +
          '<div class="keys">' +
            '<span><kbd>←</kbd><kbd>→</kbd> đổi truyện</span>' +
            '<span><kbd>⌘</kbd><kbd>K</kbd> tìm nhanh</span>' +
          '</div>' +
        '</div></div></div>' +
      '</div>';
  }

  /* Ảnh nền: <img> thật (không background-image) để đặt được fetchpriority/
     loading/width/height. Ảnh đầu có src ngay; ảnh sau để `data-src` — xem
     hydrate() — vì cả 5 ảnh đều “nằm trong khung nhìn” nên loading="lazy"
     một mình sẽ bị tải hết ngay lượt đầu. */
  function mediaHTML(item, i) {
    var bg = item.backgroundImage || {};
    var src = bg.src ? String(bg.src) : '';
    if (!src) return '';
    var eager = i === 0;
    return '<img class="hb-bg' + (eager ? ' on' : '') + '" data-i="' + i + '"' +
      (eager ? ' src="' + esc(src) + '"' : ' data-src="' + esc(src) + '"') +
      (bg.srcSet ? (eager ? ' srcset' : ' data-srcset') + '="' + esc(bg.srcSet) + '"' : '') +
      (bg.sizes ? ' sizes="' + esc(bg.sizes) + '"' : '') +
      ' alt="' + esc(bg.alt || '') + '"' +
      ' width="' + (parseInt(bg.width, 10) || 1600) + '" height="' + (parseInt(bg.height, 10) || 900) + '"' +
      ' decoding="async" referrerpolicy="no-referrer"' +
      (eager ? ' fetchpriority="high"' : ' loading="lazy"') + '>';
  }

  function thumbSrc(item) {
    return (item.thumbnail && item.thumbnail.src) || (item.backgroundImage && item.backgroundImage.src) || '';
  }

  function controlsHTML(dots) {
    return '<div class="foot">' +
      '<div class="footin">' +
        '<button class="arrow" id="hPrev" type="button" data-hb-prev aria-label="Xem mục trước">' + ic('left', 'i-s') + '</button>' +
        '<div class="dots" id="hDots" role="tablist" aria-label="' + DOTS_LABEL + '">' + dots + '</div>' +
        '<span class="count" id="hCount" aria-hidden="true"></span>' +
        '<div class="strip" id="hStrip"></div>' +
        '<button class="arrow play" id="hPlay" type="button" data-hb-play aria-label="Tạm dừng tự chuyển truyện"></button>' +
        '<button class="arrow" id="hNext" type="button" data-hb-next aria-label="Xem mục tiếp theo">' + ic('right', 'i-s') + '</button>' +
      '</div>' +
      '<div class="bar" aria-hidden="true"><i id="heroBar"></i></div>' +
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
    if (!this.total) { root.hidden = true; root.innerHTML = ''; return; }
    var start = parseInt(this.props.initialIndex, 10) || 0;
    this.index = Math.max(0, Math.min(this.total - 1, start));
    this.render();
    this.bind();
    if (this.autoPlay && !CZ.reduce) this.start();
  }

  HeroBanner.prototype.render = function () {
    var root = this.root, self = this;
    var thumbs = this.items.map(function (it, k) {
      var im = thumbSrc(it);
      return '<button type="button" data-hb-go="' + k + '" class="' + (k === self.index ? 'on' : '') + '"' +
        (k === self.index ? ' aria-current="true"' : '') +
        ' aria-label="Xem: ' + esc(it.title || ('mục ' + (k + 1))) + '" title="' + esc(it.title || '') + '">' +
        (im ? '<img src="' + esc(im) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') +
        '</button>';
    }).join('');
    var dots = this.items.map(function (it, k) {
      return '<button type="button" role="tab" data-hb-go="' + k + '" class="' + (k === self.index ? 'on' : '') + '"' +
        ' aria-selected="' + (k === self.index ? 'true' : 'false') + '"' +
        ' aria-label="' + esc(it.title || ('mục ' + (k + 1))) + '"></button>';
    }).join('');
    root.hidden = false;
    root.classList.add('hero');
    root.setAttribute('aria-roledescription', 'carousel');
    root.setAttribute('aria-labelledby', 'hbTitle-' + this.index);
    root.innerHTML =
      '<div class="hb-media" aria-hidden="true">' +
        this.items.map(mediaHTML).join('') +
      '</div>' +
      '<div class="hb-scrim" aria-hidden="true"></div>' +
      '<div class="stage" id="stage">' + this.items.map(function (it, i) { return slideHTML(it, i, self.total); }).join('') + '</div>' +
      controlsHTML(dots) +
      '<p class="sr-only" id="hbLive" aria-live="polite" aria-atomic="true"></p>';

    this.strip = root.querySelector('.strip');
    this.strip.innerHTML = thumbs;
    this.dotBox = root.querySelector('.dots');
    this.media = Array.prototype.slice.call(root.querySelectorAll('.hb-bg'));
    this.slides = Array.prototype.slice.call(root.querySelectorAll('.slide'));
    this.dots = Array.prototype.slice.call(root.querySelectorAll('.dots button'));
    this.thumbs = Array.prototype.slice.call(root.querySelectorAll('.strip button'));
    this.foot = root.querySelector('.foot');
    this.live = root.querySelector('#hbLive');
    this.playBtn = root.querySelector('[data-hb-play]');

    /* Chỉ một mục ⇒ không có gì để chuyển: bỏ hết điều khiển (đúng yêu cầu
       “1 item thì ẩn prev/next, thumbnail và dot”). */
    var many = this.total > 1;
    if (this.props.showThumbnails === false || !many) this.strip.hidden = true;
    if (this.props.showDots === false || !many) this.dotBox.hidden = true;
    if (!many) {
      root.querySelector('[data-hb-prev]').hidden = true;
      root.querySelector('[data-hb-next]').hidden = true;
    }
    /* không có gì để tạm dừng khi: chưa bật autoplay, chỉ 1 mục, hoặc máy đang
       bật “giảm chuyển động” (khi đó component cố ý KHÔNG tự chuyển slide) */
    if (!this.autoPlay || !many || CZ.reduce) this.playBtn.hidden = true;
    this.count = root.querySelector('.count');
    this.count.textContent = (this.index + 1) + '/' + this.total;
    this.paint(this.index, false);
    this.scheduleIdleLoad();
  };

  /* ảnh của các mục còn lại: nạp khi máy rảnh (2,5 s) để không tranh băng thông
     với ảnh đầu, và nạp ngay khi người dùng chuyển tới trước giờ đó. */
  HeroBanner.prototype.scheduleIdleLoad = function () {
    var self = this;
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(function () {
      for (var i = 0; i < self.items.length; i++) self.hydrate(i);
    }, 2500);
  };

  HeroBanner.prototype.hydrate = function (i) {
    var img = this.media[i];
    if (!img || !img.getAttribute('data-src')) return;
    var src = img.getAttribute('data-src'), srcset = img.getAttribute('data-srcset');
    img.removeAttribute('data-src'); img.removeAttribute('data-srcset');
    if (srcset) img.setAttribute('srcset', srcset);
    img.setAttribute('src', src);
  };

  HeroBanner.prototype.paint = function (i, announce) {
    var self = this;
    this.index = i;
    this.slides.forEach(function (s, k) {
      s.classList.toggle('on', k === i);
      if (k === i) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
    });
    this.media.forEach(function (m, k) { m.classList.toggle('on', k === i); });
    this.dots.forEach(function (b, k) {
      b.classList.toggle('on', k === i);
      b.setAttribute('aria-selected', k === i ? 'true' : 'false');
    });
    this.thumbs.forEach(function (b, k) {
      b.classList.toggle('on', k === i);
      if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    if (this.count) this.count.textContent = (i + 1) + '/' + this.total;
    this.root.setAttribute('aria-labelledby', 'hbTitle-' + i);
    /* cuộn dải thumbnail để mục đang chọn luôn lọt vào khung (dải hẹp ở tablet) */
    var active = this.thumbs[i];
    if (active && this.strip && this.strip.scrollWidth > this.strip.clientWidth) {
      if (active.offsetLeft < this.strip.scrollLeft) this.strip.scrollLeft = Math.max(0, active.offsetLeft - 8);
      else if (active.offsetLeft + active.offsetWidth > this.strip.scrollLeft + this.strip.clientWidth) {
        this.strip.scrollLeft = active.offsetLeft + active.offsetWidth - this.strip.clientWidth + 8;
      }
    }
    if (announce && this.live) {
      var item = this.items[i] || {};
      this.live.textContent = 'Mục ' + (i + 1) + ' / ' + this.total + ': ' + (item.title || '');
    }
    this.hydrate(i);
    if (this.media[i + 1]) this.hydrate(i + 1);
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
  };

  HeroBanner.prototype.bind = function () {
    var self = this, root = this.root;

    root.addEventListener('click', function (e) {
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
    root.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); self.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); self.prev(); }
      else if (e.key === 'Home') { e.preventDefault(); self.goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); self.goTo(self.total - 1); }
    });
    /* giữ phím tắt toàn trang như bản cũ (“← → đổi truyện” ghi trong khối),
       nhưng nhường phím khi người dùng đang gõ ở ô nhập. */
    this._onDocKey = function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      var tag = String((e.target && e.target.tagName) || '').toUpperCase();
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
      if (root.contains(e.target)) return;           /* đã xử lý ở handler trên */
      if (e.key === 'ArrowRight') self.next();
      else if (e.key === 'ArrowLeft') self.prev();
    };
    w.document.addEventListener('keydown', this._onDocKey);

    root.addEventListener('mouseenter', function () { self.hovered = true; self.stop(); });
    root.addEventListener('mouseleave', function () { self.hovered = false; self.restart(); });
    root.addEventListener('focusin', function () { self.focused = true; self.stop(); });
    root.addEventListener('focusout', function (e) {
      if (root.contains(e.relatedTarget)) return;
      self.focused = false;
      self.restart();
    });
    this._onVis = function () { if (w.document.hidden) self.stop(); else self.restart(); };
    w.document.addEventListener('visibilitychange', this._onVis);

    /* vuốt ngang trên điện thoại: chỉ tính khi quãng ngang > 44px và lớn hơn dọc */
    var x0 = null, y0 = null;
    root.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
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
    this.root.innerHTML = '';
  };

  CZ.heroBanner = function (root, props) {
    if (!root) return null;
    root.classList.add('hero');
    return new HeroBanner(root, props || {});
  };
  CZ.HeroBanner = HeroBanner;
})(window);
