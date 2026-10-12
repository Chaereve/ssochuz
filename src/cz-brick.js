/* ============================================================================
   ssochuz · HỘP GÓP GẠCH — “Đòi nợ tác giả” (bản 1.19.0)
   ----------------------------------------------------------------------------
   Chỉ hiện với truyện ĐANG CẬP NHẬT (statusCls = 'run'): truyện đã hoàn thành
   thì góp gạch làm gì nữa. Cuối trang truyện có một hộp gạch: bấm là viên gạch
   rơi “cạch” vào đống, số đếm nhảy, thanh tiến độ chạy tới mốc 5.000 viên.

   NHIỆM VỤ CỦA KHỐI NÀY KHÔNG PHẢI LÀ GỬI DỮ LIỆU ĐI ĐÂU — đây là “MVP
   localStorage” đúng như yêu cầu: số gạch của MÁY NÀY được giữ trong
   localStorage, phần còn lại của con số là mốc minh hoạ (xem createSeed()).
   Chỗ cần thay bằng máy chủ đánh dấu  TODO(API)  — hợp đồng endpoint:

     GET  /api/brick?slug=<slug>&vid=<mã máy>
          → { ok:true, slug, count:<tổng viên của cả nhà>, mine:<viên của máy này>,
              goal:<mốc đang gom>, at:<ISO giờ góp gần nhất> }
     POST /api/brick  { story_id, brick_count:1, user_or_device_id, last_brick_at }
          → { ok:true, count, mine, goal, next_at:<mốc cooldown> }
   Chống spam phía máy chủ: 1 viên/người/ngày, hoặc cooldown ngắn (như bản
   localStorage dưới đây: 6 giây giữa hai viên, tối đa 20 viên/ngày/máy).
   ========================================================================== */
(function (w, d) {
  'use strict';

  var CZ = w.CZ || {};
  function esc(s) { return CZ.esc ? CZ.esc(s) : String(s == null ? '' : s); }
  function num(n) { return CZ.num ? CZ.num(n) : String(n); }
  function toast(m, k) { if (CZ.toast) CZ.toast(m, k); }
  function rd() { return CZ.rdGet ? CZ.rdGet() : {}; }

  var GOAL = 5000;              /* mốc mặc định: 5.000 viên gạch */
  var COOLDOWN_MS = 6000;       /* hai viên liên tiếp phải cách nhau 6 giây */
  var MAX_PER_DAY = 20;         /* trần một máy một ngày */
  var K = 'ssochuz-brick-';     /* + slug → { n, day, today, at } */

  function jget(k, dv) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? dv : v; } catch (e) { return dv; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function day() { var t = new Date(); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }

  /* ---- mốc minh hoạ khi CHƯA có máy chủ -------------------------------
     Băm slug thành một con số ổn định trong khoảng 900–3.900 để hộp gạch không
     trông như bảng trắng. KHÔNG phải dữ liệu cộng đồng thật — nối máy chủ thì
     phần này biến mất (xem TODO(API) ở đầu tệp). */
  function createSeed(slug) {
    if (w.CZ_BRICK_API && CZ.hasAPI) return 0;
    var h = 2166136261, s = String(slug || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return 900 + (h % 3000);
  }
  function state(slug) {
    var st = jget(K + slug, null);
    if (!st || typeof st !== 'object') st = { n: 0, day: day(), today: 0, at: 0 };
    if (st.day !== day()) { st.day = day(); st.today = 0; }
    return st;
  }
  function save(slug, st) { jset(K + slug, st); }
  function mine(slug) { return Math.max(0, parseInt(state(slug).n, 10) || 0); }
  function total(slug) { return createSeed(slug) + mine(slug); }
  /* mốc đang gom: 5.000 → 10.000 → 15.000… (đủ mốc thì mở mốc kế tiếp) */
  function goalOf(slug) { return Math.max(GOAL, (Math.floor(total(slug) / GOAL) + 1) * GOAL); }

  var FX_HINT = {
    intro: 'Góp gạch để giục chương mới. Mỗi máy góp được ' + MAX_PER_DAY +
      ' viên một ngày, mỗi lần cách nhau vài giây — đủ để vui, không thành spam.'
  };

  function boxHTML(slug, story) {
    var t = total(slug), g = goalOf(slug), m = mine(slug);
    var pct = Math.max(2, Math.min(100, Math.round((t / g) * 100)));
    var done = t >= GOAL && g > GOAL;
    return '<div class="bk-head">' +
        '<div class="bk-ttl"><b>' + (CZ.icon ? CZ.icon('wall', 'i-s') : '') + 'Hộp góp gạch</b>' +
        '<span class="bk-sub">' + esc(story && story.title ? story.title : slug) + ' đang cập nhật — góp gạch để giục chương mới.</span></div>' +
        '<div class="bk-num"><b data-bk-total>' + num(t) + '</b><span data-bk-goal>/ ' + num(g) + ' viên gạch</span></div>' +
      '</div>' +
      '<div class="bk-stage">' +
        '<div class="bk-bucket" aria-hidden="true"><span class="bk-pile" data-bk-pile style="transform:scaleY(' + (0.12 + pct / 130).toFixed(3) + ')"></span>' +
          '<span class="bk-drop" data-bk-drop></span></div>' +
        '<div class="bk-barwrap"><div class="bk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + g + '" aria-valuenow="' + t + '" ' +
          'aria-label="Số gạch đã góp cho truyện này" data-bk-bar><i style="transform:scaleX(' + (pct / 100).toFixed(3) + ')"></i></div>' +
          '<p class="bk-motto" data-bk-motto>' + (done
            ? 'Nhà đã xây xong — giờ đòi chương mới! (mốc tiếp theo: ' + num(g) + ' viên)'
            : 'Đã gom đủ ' + num(g) + ' viên gạch xây nhà cho nhóm dịch/tác giả.') + '</p></div>' +
      '</div>' +
      '<div class="bk-foot">' +
        '<button type="button" class="btn pri bk-send" id="bkSend">' + (CZ.icon ? CZ.icon('wall', 'i-s') : '') + 'Gửi gạch giục chương mới</button>' +
        '<span class="bk-mine">Máy bạn đã góp <b data-bk-mine>' + num(m) + '</b> viên' +
          '<i class="bk-tip" title="' + esc(FX_HINT.intro) + '">?</i></span>' +
      '</div>';
  }

  function paint(host, slug) {
    var t = total(slug), g = goalOf(slug);
    var pct = Math.max(2, Math.min(100, Math.round((t / g) * 100)));
    var tot = host.querySelector('[data-bk-total]');
    if (tot) tot.textContent = num(t);
    var gl = host.querySelector('[data-bk-goal]');
    if (gl) gl.textContent = '/ ' + num(g) + ' viên gạch';
    var mineEl = host.querySelector('[data-bk-mine]');
    if (mineEl) mineEl.textContent = num(mine(slug));
    var bar = host.querySelector('[data-bk-bar]');
    if (bar) {
      var i = bar.querySelector('i');
      if (i) i.style.transform = 'scaleX(' + (pct / 100).toFixed(3) + ')';
      bar.setAttribute('aria-valuenow', t);
      bar.setAttribute('aria-valuemax', g);
    }
    var pile = host.querySelector('[data-bk-pile]');
    if (pile) pile.style.transform = 'scaleY(' + (0.12 + pct / 130).toFixed(3) + ')';
    var motto = host.querySelector('[data-bk-motto]');
    if (motto) motto.textContent = (t >= GOAL && g > GOAL)
      ? 'Nhà đã xây xong — giờ đòi chương mới! (mốc tiếp theo: ' + num(g) + ' viên)'
      : 'Đã gom đủ ' + num(g) + ' viên gạch xây nhà cho nhóm dịch/tác giả.';
  }

  /* viên gạch rơi vào xô: chỉ dùng transform/opacity, xong là dọn DOM */
  function dropBrick(host) {
    var drop = host.querySelector('[data-bk-drop]');
    if (!drop) return;
    drop.classList.remove('go');
    void drop.offsetWidth;
    drop.classList.add('go');
    var pile = host.querySelector('[data-bk-pile]');
    if (pile) { pile.classList.remove('bump'); void pile.offsetWidth; pile.classList.add('bump'); }
    setTimeout(function () { drop.classList.remove('go'); }, 900);
  }

  function bind(host, ctx) {
    var slug = ctx.slug;
    host.innerHTML = boxHTML(slug, ctx.story);
    host.__bkCtx = ctx;
    var btn = host.querySelector('#bkSend');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var st = state(slug);
      var now = Date.now();
      if (now - (parseInt(st.at, 10) || 0) < COOLDOWN_MS) {
        toast('Từ từ — gạch đang nằm trong tay bạn rồi!', 'err');
        return;
      }
      if (st.today >= MAX_PER_DAY) {
        toast('Hôm nay bạn góp đủ ' + MAX_PER_DAY + ' viên rồi — để mai góp tiếp nhé!', 'err');
        return;
      }
      st.n = (parseInt(st.n, 10) || 0) + 1;
      st.today = (parseInt(st.today, 10) || 0) + 1;
      st.at = now;
      save(slug, st);
      /* tiếng “cạch” — chỉ kêu SAU cú bấm của người dùng, và tắt được ở Cài đặt đọc */
      if (CZ.sfx) CZ.sfx('brick');
      dropBrick(host);
      paint(host, slug);
      var t = total(slug);
      toast(w.CZ_BRICK_API && CZ.hasAPI
        ? 'Đã gửi 1 viên gạch — tổng ' + num(t) + ' viên.'
        : 'Đã góp 1 viên gạch (lưu trên máy bạn). Tổng ' + num(t) + ' viên.', 'ok');
      /* TODO(API): gửi lên máy chủ, mất mạng thì xếp hàng chờ như reaction */
      if (w.CZ_BRICK_API && CZ.hasAPI) {
        w.fetch(CZ.API + '/api/brick', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            story_id: slug, brick_count: 1, user_or_device_id: CZ.vid(), last_brick_at: new Date().toISOString()
          })
        }).then(function (r) {
          if (!r || !r.ok) toast('Chưa gửi được lên máy chủ — viên gạch đã lưu trên máy bạn.', 'err');
          else return r.json().then(function (j) { if (j && j.count != null) paint(host, slug); }).catch(function () {});
        }).catch(function () { toast('Chưa gửi được lên máy chủ — viên gạch đã lưu trên máy bạn.', 'err'); });
      }
    });
  }

  /* Hộp gạch chỉ có nghĩa với truyện ĐANG RA. Truyện hoàn thành / sắp ra mắt /
     truyện khoá mật mã chưa mở thì ẩn hẳn — không bày một cái hộp vô nghĩa. */
  function eligible(story) {
    if (!story) return false;
    if (story.locked) return false;
    return String(story.statusCls || '') === 'run';
  }
  function mount(host, story) {
    if (!host) return;
    if (!eligible(story)) { host.hidden = true; host.innerHTML = ''; host.__bkCtx = null; return; }
    host.hidden = false;
    if (host.__bkCtx && host.__bkCtx.slug === story.slug) return;   /* đã dựng rồi */
    bind(host, { slug: story.slug, story: story });
    /* TODO(API): lấy con số thật của cả nhà nếu Worker đã có /api/brick */
    if (w.CZ_BRICK_API && CZ.hasAPI) {
      w.fetch(CZ.API + '/api/brick?slug=' + encodeURIComponent(story.slug) + '&vid=' + encodeURIComponent(CZ.vid()),
        { headers: { accept: 'application/json' } })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && j.ok && host.__bkCtx && host.__bkCtx.slug === story.slug) paint(host, story.slug);
        }).catch(function () {});
    }
  }

  w.CZBrick = { GOAL: GOAL, COOLDOWN_MS: COOLDOWN_MS, MAX_PER_DAY: MAX_PER_DAY, mount: mount, eligible: eligible, _state: state, _keys: K };
})(window, document);
