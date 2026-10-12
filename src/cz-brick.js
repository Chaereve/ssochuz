/* ============================================================================
   Hộp góp gạch cộng đồng — mỗi tài khoản góp tối đa một viên/ngày/truyện.
   Aggregate/action source of truth: Cloudflare D1. Đây là tương tác ảo miễn phí,
   không thanh toán, không coin, không quà quy đổi và không ghi localStorage.
   ========================================================================== */
(function (w, d) {
  'use strict';

  var CZ = w.CZ || {};
  var GOAL = 5000;       /* mốc hiển thị thân thiện, không phải phần thưởng */
  var stateBySlug = Object.create(null);
  var pendingBySlug = Object.create(null);
  var pullPending = Object.create(null);
  var PULL_CACHE_MS = 15000;
  var sticker = (Array.isArray(w.CZStickers) ? w.CZStickers : []).filter(function (item) { return item.id === 'sso-brick'; })[0] || {
    label: 'Góp gạch', alt: 'Sso cầm viên gạch', full: '', fallback: '🧱'
  };

  function esc(value) { return CZ.esc ? CZ.esc(value) : String(value == null ? '' : value); }
  function num(value) { return CZ.num ? CZ.num(value) : String(value); }
  function toast(message, kind) { if (CZ.toast) CZ.toast(message, kind); }
  function rd() { return CZ.rdGet ? CZ.rdGet() : {}; }
  function apiOn() { return !!(CZ.API && w.CZPersonal && w.CZPersonal.communityRequest); }
  function state(slug) {
    var current = stateBySlug[slug];
    if (!current) current = stateBySlug[slug] = { total: 0, givenToday: false, loaded: false, error: '', owner: '', at: 0 };
    return current;
  }
  function currentUid() {
    try {
      if (w.CZPersonal) return w.CZPersonal.mode && w.CZPersonal.mode() === 'server' ? String(w.CZPersonal.uid && w.CZPersonal.uid() || '') : '';
      var user = w.CZ_AUTH && w.CZ_AUTH.current && w.CZ_AUTH.current();
      return String(user && (user.uid || user.id) || '');
    } catch (e) { return ''; }
  }
  function loggedIn() { return !!currentUid(); }
  function applySummary(slug, data, owner) {
    if (!data || data.ok !== true) return false;
    var current = state(slug);
    current.total = Math.max(0, Math.floor(Number(data.total) || 0));
    current.givenToday = !!data.givenToday;
    current.loaded = true;
    current.owner = owner == null ? currentUid() : owner;
    current.at = Date.now();
    current.error = '';
    return true;
  }
  function pull(slug, host, force) {
    if (!apiOn()) return Promise.resolve(null);
    var ownerAtRequest = currentUid();
    var key = ownerAtRequest + '#' + slug;
    var current = state(slug);
    if (!force && current.owner === ownerAtRequest && current.at && Date.now() - current.at < PULL_CACHE_MS) {
      if (host && host.__bkCtx && host.__bkCtx.slug === slug) paint(host, slug);
      return Promise.resolve({ ok: true, total: current.total, givenToday: current.givenToday });
    }
    var request = pullPending[key];
    if (!request) {
      request = w.CZPersonal.communityRequest('/api/community/brick', { storyId: slug }).then(function (data) {
        if (ownerAtRequest !== currentUid()) return null;
        if (applySummary(slug, data, ownerAtRequest) && host && host.__bkCtx && host.__bkCtx.slug === slug) paint(host, slug);
        return data;
      }).catch(function (error) {
        if (ownerAtRequest === currentUid()) {
          current.error = String(error && error.message || error);
          current.owner = ownerAtRequest;
          current.at = Date.now();
        }
        return null; /* community lỗi không ảnh hưởng reader */
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
      if (host && host.__bkCtx && host.__bkCtx.slug === slug) paint(host, slug);
      return data;
    });
  }
  function total(slug) { return Math.max(0, Number(state(slug).total) || 0); }
  function goalOf(slug) { return (Math.floor(total(slug) / GOAL) + 1) * GOAL; }
  function percent(slug) { return Math.max(2, Math.min(100, Math.round((total(slug) / goalOf(slug)) * 100))); }

  function boxHTML(slug, story) {
    var current = state(slug), count = total(slug), goal = goalOf(slug);
    var pct = percent(slug);
    var buttonText = current.givenToday ? 'Đã góp hôm nay' : (loggedIn() ? 'Góp gạch miễn phí' : 'Đăng nhập góp gạch miễn phí');
    return '<div class="bk-head">' +
        '<div class="bk-ttl"><b>' + (CZ.icon ? CZ.icon('wall', 'i-s') : '') + 'Góp gạch</b>' +
        '<span class="bk-sub">Cổ vũ truyện ra chương mới</span></div>' +
        '<div class="bk-num"><b data-bk-total>' + num(count) + '</b><span data-bk-goal>viên · mốc ' + num(goal) + '</span></div>' +
      '</div>' +
      '<div class="bk-stage">' +
        '<div class="bk-bucket" aria-hidden="true"><span class="bk-pile" data-bk-pile style="transform:scaleY(' + (0.12 + pct / 130).toFixed(3) + ')"></span>' +
          '<span class="bk-drop" data-bk-drop></span></div>' +
        '<div class="bk-barwrap"><div class="bk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + count + '" ' +
          'aria-label="Số gạch ảo miễn phí đã góp cho truyện này" data-bk-bar><i style="transform:scaleX(' + (pct / 100).toFixed(3) + ')"></i></div>' +
          '<p class="bk-motto" data-bk-motto>' + (count >= GOAL
            ? 'Đã đạt mốc ' + num(Math.floor(count / GOAL) * GOAL) + ' viên!'
            : 'Mỗi ngày 1 viên / tài khoản.') + '</p></div>' +
      '</div>' +
      '<div class="bk-foot">' +
        '<button type="button" class="btn pri bk-send" id="bkSend" aria-label="' + esc(sticker.label) + ' — ' + esc(buttonText) + '"' + (current.givenToday ? ' disabled' : '') + '>' +
          '<span class="bk-sticker"><img src="' + esc(sticker.full) + '" alt="" width="40" height="40" loading="eager" decoding="async"><span aria-hidden="true">' + esc(sticker.fallback) + '</span></span>' +
          '<span data-bk-label>' + esc(buttonText) + '</span></button>' +
        '<span class="bk-mine" data-bk-hint>Miễn phí · không thanh toán hay quà quy đổi.</span>' +
      '</div>';
  }
  function paint(host, slug) {
    var current = state(slug), count = total(slug), goal = goalOf(slug), pct = percent(slug);
    var totalNode = host.querySelector('[data-bk-total]');
    if (totalNode) totalNode.textContent = num(count);
    var goalNode = host.querySelector('[data-bk-goal]');
    if (goalNode) goalNode.textContent = 'viên · mốc ' + num(goal);
    var bar = host.querySelector('[data-bk-bar]');
    if (bar) {
      var fill = bar.querySelector('i');
      if (fill) fill.style.transform = 'scaleX(' + (pct / 100).toFixed(3) + ')';
      bar.setAttribute('aria-valuenow', String(count));
      bar.setAttribute('aria-valuemax', String(goal));
    }
    var pile = host.querySelector('[data-bk-pile]');
    if (pile) pile.style.transform = 'scaleY(' + (0.12 + pct / 130).toFixed(3) + ')';
    var motto = host.querySelector('[data-bk-motto]');
    if (motto) motto.textContent = count >= GOAL
      ? 'Đã đạt mốc ' + num(Math.floor(count / GOAL) * GOAL) + ' viên!'
      : 'Mỗi ngày 1 viên / tài khoản.';
    var button = host.querySelector('#bkSend');
    if (button) {
      var label = current.givenToday ? 'Đã góp hôm nay' : (loggedIn() ? 'Góp gạch miễn phí' : 'Đăng nhập góp gạch miễn phí');
      button.disabled = !!current.givenToday || !!pendingBySlug[slug];
      button.setAttribute('aria-label', sticker.alt + ' — ' + label);
      var buttonLabel = button.querySelector('[data-bk-label]');
      if (buttonLabel) buttonLabel.textContent = label;
    }
  }

  function dropBrick(host) {
    if (CZ.reduce) return;
    var drop = host.querySelector('[data-bk-drop]');
    if (!drop) return;
    drop.classList.remove('go');
    void drop.offsetWidth;
    drop.classList.add('go');
    var pile = host.querySelector('[data-bk-pile]');
    if (pile) { pile.classList.remove('bump'); void pile.offsetWidth; pile.classList.add('bump'); }
    setTimeout(function () { drop.classList.remove('go'); }, 900);
  }
  function fallbackImage(host) {
    var img = host.querySelector('.bk-sticker img');
    if (!img || img.__bkFallback) return;
    img.__bkFallback = true;
    img.addEventListener('error', function () { img.hidden = true; });
  }
  function give(host, slug) {
    if (!apiOn()) { toast('Máy chủ góp gạch chưa được cấu hình.', 'err'); return; }
    if (!loggedIn()) { toast('Đăng nhập Supabase để góp gạch miễn phí.', 'err'); return; }
    if (pendingBySlug[slug] || state(slug).givenToday) return;
    pendingBySlug[slug] = true;
    var ownerAtRequest = currentUid();
    paint(host, slug);
    w.CZPersonal.communityRequest('/api/community/brick', { action: 'give', storyId: slug }, { requireAuth: true }).then(function (data) {
      if (ownerAtRequest !== currentUid() || !host.__bkCtx || host.__bkCtx.slug !== slug) return;
      applySummary(slug, data);
      dropBrick(host);
      paint(host, slug);
      if (CZ.sfx) CZ.sfx('brick');
      toast('Đã góp một viên gạch ảo miễn phí. Cảm ơn bạn đã cổ vũ!', 'ok');
    }).catch(function (error) {
      if (ownerAtRequest !== currentUid()) return;
      if (error && error.status === 409 && error.data) applySummary(slug, error.data);
      if (host.__bkCtx && host.__bkCtx.slug === slug) paint(host, slug);
      if (error && error.status === 401) toast('Đăng nhập Supabase để góp gạch miễn phí.', 'err');
      else if (error && error.status === 409) toast('Bạn đã góp gạch cho truyện này hôm nay.', 'err');
      else if (error && error.status === 429) toast('Bạn thao tác hơi nhanh — thử lại sau.', 'err');
      else toast((error && error.message) || 'Chưa gửi được gạch; thử lại sau.', 'err');
      pull(slug, host);
    }).finally(function () {
      delete pendingBySlug[slug];
      if (host.__bkCtx && host.__bkCtx.slug === slug) paint(host, slug);
    });
  }
  function bind(host, ctx) {
    host.innerHTML = boxHTML(ctx.slug, ctx.story);
    host.__bkCtx = ctx;
    fallbackImage(host);
    var button = host.querySelector('#bkSend');
    if (button) button.addEventListener('click', function () { give(host, ctx.slug); });
    pull(ctx.slug, host).then(function () { if (host.__bkCtx && host.__bkCtx.slug === ctx.slug) paint(host, ctx.slug); });
  }
  function eligible(story) {
    if (!story || story.locked) return false;
    return String(story.statusCls || '') === 'run';
  }
  function mount(host, story) {
    if (!host) return;
    if (!eligible(story)) { host.hidden = true; host.innerHTML = ''; host.__bkCtx = null; return; }
    host.hidden = false;
    if (host.__bkCtx && host.__bkCtx.slug === story.slug) { paint(host, story.slug); return; }
    bind(host, { slug: story.slug, story: story });
  }
  w.addEventListener('cz:personal', function (event) {
    var info = event && event.detail || {};
    var host = d.getElementById('storyBrick') || d.getElementById('rdBrick');
    if (!host || !host.__bkCtx || (info.type !== 'ready' && info.type !== 'loading')) return;
    if (info.type === 'loading') { state(host.__bkCtx.slug).givenToday = false; paint(host, host.__bkCtx.slug); }
    if (info.type === 'ready') pull(host.__bkCtx.slug, host);
  });

  w.CZBrick = { GOAL: GOAL, PER_DAY: 1, mount: mount, eligible: eligible, pull: pull, _state: state };
})(window, document);
