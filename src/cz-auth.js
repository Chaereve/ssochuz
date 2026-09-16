/* ============================================================================
   ssochuz · ĐĂNG NHẬP (Supabase Auth — mặc định) + phiên làm việc với Worker
   ----------------------------------------------------------------------------
   Vì sao bỏ Google Identity Services làm mặc định:
     GIS bắt khai đúng "JavaScript origins" trong Google Cloud Console. Thiếu một
     origin (domain mới, bản xem trước, http/https…) là Google chặn thẳng với
     `Lỗi 400: origin_mismatch` và người dùng không thể đăng nhập.
     Supabase Auth nhận redirect URL mềm hơn nhiều, tự xử lý PKCE/refresh token,
     và vẫn cho đăng nhập bằng Google (Supabase làm trung gian OAuth).

   Luồng:
     1. Người đọc bấm "Đăng nhập" → chuyển sang Supabase → Google → quay về web.
     2. Supabase JS tự đổi `?code=…` lấy phiên (session) và cất trong localStorage.
     3. Web gửi access_token cho Worker (POST /api/auth/supabase) → Worker kiểm chữ ký
        bằng JWKS của Supabase rồi cấp session token (HS256) dùng cho bình luận.
        Nếu Worker chưa cấu hình, web dùng THẲNG access_token của Supabase
        (Worker vẫn xác thực được) nên bình luận không bị chặn.
     4. `CZ_AUTH.isAdmin()` quyết định hiện/ẩn mục Quản trị.

   Không cấu hình Supabase? Đặt CZ_AUTH_PROVIDER='google' trong cz-config.js để
   dùng lại cách cũ (vẫn còn trong file này), hoặc để '' để tắt đăng nhập.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var LS_USER = 'ssochuz-user';
  var LS_TOKEN = 'ssochuz-auth-token';
  var SB_STORAGE = 'ssochuz-sb';
  var LS_PROFILE_PFX = 'ssochuz-profile-';   /* custom name/picture override per uid */
  var user = null;          /* {uid,email,name,picture,exp,provider,admin,local} */
  var token = null;         /* session token của Worker, hoặc access_token Supabase */
  var listeners = [];
  var sb = null;            /* Supabase client */
  var sbLoading = null;
  var gisReady = null;
  var settingsApplied = false;

  function profileKey(uid) { return LS_PROFILE_PFX + (uid ? String(uid) : 'guest'); }
  function getCustomProfile(uid) {
    if (!uid) return null;
    try { return JSON.parse(lsGet(profileKey(uid)) || 'null'); } catch (e) { return null; }
  }
  function setCustomProfile(uid, data) {
    if (!uid) return;
    try {
      if (!data) localStorage.removeItem(profileKey(uid));
      else localStorage.setItem(profileKey(uid), JSON.stringify(data));
    } catch (e) {}
  }
  function mergeCustom(u) {
    if (!u || !u.uid) return u;
    var cp = getCustomProfile(u.uid);
    if (!cp) return u;
    var out = Object.assign({}, u);
    if (cp.name && String(cp.name).trim()) out.name = String(cp.name).trim().slice(0, 40);
    /* picture có thể là data URL ~1MB, nên cho phép dài hơn 500 */
    if (cp.picture && String(cp.picture).trim()) out.picture = String(cp.picture).trim().slice(0, 1200000);
    out._custom = true;
    return out;
  }

  /* ---------------------------------------------------------------- tiện ích */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  function api() { return w.CZ_API || ''; }
  function toast(msg, kind) { if (w.CZ && w.CZ.toast) w.CZ.toast(msg, kind); }
  function provider() {
    var p = String(w.CZ_AUTH_PROVIDER == null ? 'supabase' : w.CZ_AUTH_PROVIDER).toLowerCase();
    if (p === 'google' || p === 'gis') return 'google';
    if (p === 'none' || p === 'off' || p === '') return '';
    return 'supabase';
  }
  function sbURL() { return String(w.CZ_SUPABASE_URL || '').trim(); }
  function sbKey() { return String(w.CZ_SUPABASE_ANON_KEY || '').trim(); }
  function googleId() { return String(w.CZ_GOOGLE_CLIENT_ID || '').trim(); }
  function sbReady() { return provider() === 'supabase' && !!sbURL() && !!sbKey(); }
  function gisReadyCfg() { return provider() === 'google' && !!googleId(); }
  /* web đã cấu hình đăng nhập chưa (để giao diện biết nên hiện nút hay hiện hướng dẫn) */
  function configured() { return sbReady() || gisReadyCfg(); }

  function save(u, t) {
    if (u && u.uid) u = mergeCustom(u);
    user = u || null; token = t || null;
    lsSet(LS_USER, user ? JSON.stringify(user) : null);
    lsSet(LS_TOKEN, token || null);
    listeners.forEach(function (fn) { try { fn(user); } catch (e) {} });
    try { w.dispatchEvent(new CustomEvent('cz:auth', { detail: { user: user } })); } catch (e) {}
  }
  function load() {
    var u = lsJSON(LS_USER), t = lsGet(LS_TOKEN);
    if (u && u.exp && u.exp * 1000 < Date.now() - 60000) { u = null; t = null; }
    if (u) {
      u = mergeCustom(u);
      /* localStorage do chính trình duyệt sửa được, nên cờ quyền cũ không đáng tin.
         boot() sẽ hỏi Worker và cấp lại admin:true nếu phiên còn hợp lệ. */
      u.admin = false;
      delete u.role;
    }
    user = u; token = t || null;
  }
  function onAuth(fn) { listeners.push(fn); try { fn(user); } catch (e) {} return fn; }
  function current() { return user ? mergeCustom(user) : null; }
  function getToken() { return token; }

  /* chỉnh sửa tên + avatar cho người dùng (lưu local + đẩy lên Supabase nếu có) */
  function updateProfile(patch) {
    patch = patch || {};
    var name = String(patch.name || '').trim().slice(0, 40);
    var picture = String(patch.picture || '').trim();
    /* data URL có thể dài ~1MB, chỉ cắt khi quá lớn để không làm hỏng ảnh */
    if (picture.length > 1200000) picture = picture.slice(0, 1200000);
    else if (picture.indexOf('data:') !== 0 && picture.length > 2000) picture = picture.slice(0, 2000);
    if (!user || !user.uid) return Promise.reject(new Error('Chưa đăng nhập'));
    if (!name) return Promise.reject(new Error('Tên không được trống'));
    var custom = { name: name, picture: picture, at: Date.now() };
    setCustomProfile(user.uid, custom);
    var merged = Object.assign({}, user, custom, { _custom: true });
    save(merged, token);
    toast('Đã cập nhật hồ sơ', 'ok');
    /* đẩy lên Supabase để lần sau đăng nhập vẫn giữ — data URL thì bỏ qua vì Supabase chỉ nhận https */
    var picForSupa = picture.indexOf('data:') === 0 ? '' : picture;
    if (sb) {
      try {
        return sb.auth.updateUser({ data: { full_name: name, name: name, avatar_url: picForSupa || undefined, picture: picForSupa || undefined } })
          .then(function (r) {
            if (r && r.error) throw new Error(r.error.message || 'Không cập nhật được Supabase');
            return merged;
          }).catch(function (e) {
            /* lỗi Supabase không chặn việc lưu local */
            return merged;
          });
      } catch (e) { return Promise.resolve(merged); }
    }
    return Promise.resolve(merged);
  }

  /* ---------- CẮT ẢNH ĐẠI DIỆN: kéo di chuyển · thu phóng · chụm 2 ngón -------
     Mở hộp cắt, trả về data URL ảnh vuông 320px (phần trong vòng tròn).
     Huỷ / lỗi thì resolve(null) để giữ ảnh cũ. */
  function cropDialog(src) {
    if (!w.CZ || !w.CZ.modal) return Promise.resolve(null);
    var deferred = {}, settled = false;
    var promise = new Promise(function (res) { deferred.res = res; });
    function finish(value) { if (!settled) { settled = true; deferred.res(value); } }
    var m = w.CZ.modal('czCrop',
      '<div class="mh"><h4>Cắt ảnh đại diện</h4></div>' +
      '<div class="mb">' +
        '<div class="czcrop" id="czCropStage"><img alt="" draggable="false"></div>' +
        '<div class="czcrop-tools">' +
          '<button class="btn ghost sm" id="czCrOut" type="button" title="Thu nhỏ" aria-label="Thu nhỏ">−</button>' +
          '<input type="range" id="czCrZoom" min="1" max="4" step="0.01" value="1" aria-label="Thu phóng ảnh">' +
          '<button class="btn ghost sm" id="czCrIn" type="button" title="Phóng to" aria-label="Phóng to">+</button>' +
          '<button class="btn ghost sm" id="czCrReset" type="button">Căn giữa</button>' +
        '</div>' +
        '<p class="sm muted mt">Kéo để di chuyển · lăn chuột hoặc chụm hai ngón để thu phóng. Phần nằm trong vòng tròn sẽ là ảnh đại diện.</p>' +
      '</div>' +
      '<div class="mf"><button class="btn ghost" data-close>Huỷ</button><button class="btn pri" id="czCrDone">Dùng ảnh này</button></div>',
      { onClose: function () { finish(null); } });
    var origClose = m._close;
    m._close = function () { try { if (origClose) origClose(); } catch (e) {} finish(null); };

    var stage = m.querySelector('#czCropStage');
    var img = m.querySelector('img');
    var zoomIn = m.querySelector('#czCrZoom');
    var st = { z: 1, x: 0, y: 0, base: 1, iw: 0, ih: 0, sw: 0, sh: 0, ready: false };

    function clampPos() {
      var s = st.base * st.z;
      var mw = st.iw * s, mh = st.ih * s;
      st.x = Math.min(0, Math.max(st.sw - mw, st.x));
      st.y = Math.min(0, Math.max(st.sh - mh, st.y));
    }
    function apply() {
      var s = st.base * st.z;
      img.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + s + ')';
      if (zoomIn) zoomIn.value = String(st.z);
    }
    function setZoom(z, cx, cy) {
      z = Math.max(1, Math.min(4, z));
      var s0 = st.base * st.z, s1 = st.base * z;
      /* giữ điểm (cx,cy) đứng yên khi phóng — phóng đúng chỗ chạm */
      st.x = cx - (cx - st.x) * (s1 / s0);
      st.y = cy - (cy - st.y) * (s1 / s0);
      st.z = z;
      clampPos(); apply();
    }
    function center() {
      var s = st.base * st.z;
      st.x = (st.sw - st.iw * s) / 2;
      st.y = (st.sh - st.ih * s) / 2;
      clampPos(); apply();
    }

    img.onload = function () {
      st.sw = stage.clientWidth || 260; st.sh = stage.clientHeight || 260;
      st.iw = img.naturalWidth || 1; st.ih = img.naturalHeight || 1;
      st.base = Math.max(st.sw / st.iw, st.sh / st.ih);
      st.ready = true; st.z = 1; center();
    };
    img.onerror = function () { toast('Không đọc được ảnh', 'err'); if (m._close) m._close(); };
    try { img.crossOrigin = 'anonymous'; } catch (e) {}   /* ảnh https cho phép CORS thì cắt được */
    img.src = src;

    /* kéo + chụm: theo dõi tối đa 2 đầu chạm */
    var pts = {};
    function dist2() {
      var a = Object.keys(pts);
      if (a.length < 2) return 0;
      var p = pts[a[0]], q = pts[a[1]];
      return Math.hypot(p.x - q.x, p.y - q.y);
    }
    var pinch0 = 0, zoom0 = 1;
    stage.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pts).length === 2) { pinch0 = dist2(); zoom0 = st.z; }
    });
    stage.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId] || !st.ready) return;
      var n = Object.keys(pts).length;
      if (n === 1) {
        var p = pts[e.pointerId];
        st.x += e.clientX - p.x; st.y += e.clientY - p.y;
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        clampPos(); apply();
      } else if (n === 2 && pinch0) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var d = dist2();
        var r = stage.getBoundingClientRect();
        setZoom(zoom0 * (d / pinch0), e.clientX - r.left, e.clientY - r.top);
      }
    });
    function up(e) { delete pts[e.pointerId]; pinch0 = 0; }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function (e) {
      if (!st.ready) return;
      e.preventDefault();
      var r = stage.getBoundingClientRect();
      setZoom(st.z * (e.deltaY < 0 ? 1.12 : 0.9), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    if (zoomIn) zoomIn.addEventListener('input', function () { setZoom(Number(zoomIn.value) || 1, st.sw / 2, st.sh / 2); });
    var bi = m.querySelector('#czCrIn'), bo = m.querySelector('#czCrOut');
    if (bi) bi.addEventListener('click', function () { setZoom(st.z * 1.25, st.sw / 2, st.sh / 2); });
    if (bo) bo.addEventListener('click', function () { setZoom(st.z / 1.25, st.sw / 2, st.sh / 2); });
    var br = m.querySelector('#czCrReset');
    if (br) br.addEventListener('click', function () { st.z = 1; center(); });

    m.querySelector('#czCrDone').addEventListener('click', function () {
      if (!st.ready) return;
      try {
        var OUT = 320;
        var cv = d.createElement('canvas');
        cv.width = OUT; cv.height = OUT;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT);
        var s = st.base * st.z;
        ctx.drawImage(img, (-st.x) / s, (-st.y) / s, st.sw / s, st.sh / s, 0, 0, OUT, OUT);
        var out = cv.toDataURL('image/jpeg', 0.92);
        finish(out);
        try { origClose(); } catch (e) {}
      } catch (e) {
        toast('Không cắt được ảnh này (trang nguồn chặn đọc ảnh)', 'err');
      }
    });
    return promise;
  }

  function editProfileDialog() {
    location.href = '/my-space#edit-profile';
    return Promise.resolve();
  }
  function applyServerProfile(profile) {
    if (!user) return;
    setCustomProfile(user.uid, { name: profile.name, picture: profile.avatar || '', at: Date.now() });
    save(Object.assign({}, user, { name: profile.name, picture: profile.avatar || '' }), token);
  }
  function isAdmin() {
    return !!(user && (user.admin === true || user.role === 'admin'));
  }

  /* ============================== SUPABASE ================================ */
  function loadSDK() {
    if (w.supabase && w.supabase.createClient) return Promise.resolve(w.supabase);
    if (sbLoading) return sbLoading;
    var urls = [
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
      'https://unpkg.com/@supabase/supabase-js@2'
    ];
    sbLoading = new Promise(function (resolve, reject) {
      var i = 0;
      (function next() {
        if (w.supabase && w.supabase.createClient) return resolve(w.supabase);
        if (i >= urls.length) return reject(new Error('Không tải được thư viện Supabase (mạng/CDN bị chặn?)'));
        var s = d.createElement('script');
        s.src = urls[i++]; s.async = true;
        s.onload = function () { (w.supabase && w.supabase.createClient) ? resolve(w.supabase) : next(); };
        s.onerror = function () { s.remove(); next(); };
        d.head.appendChild(s);
      })();
    });
    return sbLoading;
  }
  function client() {
    if (sb) return Promise.resolve(sb);
    if (!sbReady()) {
      return Promise.reject(new Error('Chưa cấu hình Supabase — dán Project URL + anon key vào cz-config.js hoặc lưu trong trang /admin'));
    }
    return loadSDK().then(function (lib) {
      if (!sb) {
        sb = lib.createClient(sbURL(), sbKey(), {
          auth: {
            persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
            flowType: 'pkce', storageKey: SB_STORAGE
          },
          global: { headers: { 'x-client-info': 'ssochuz-web' } }
        });
      }
      return sb;
    });
  }
  /* user Supabase → user của web (giữ đúng shape cũ để mọi trang không phải sửa) */
  function fromSupabase(su, accessToken) {
    var md = (su && (su.user_metadata || {})) || {};
    var exp = 0;
    try { exp = su && su.expires_at ? Number(su.expires_at) : 0; } catch (e) {}
    if (!exp && accessToken) {
      try {
        var p = JSON.parse(atob(String(accessToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        exp = Number(p.exp) || 0;
      } catch (e) {}
    }
    var email = (su && su.email) || md.email || '';
    var base = {
      uid: (su && su.id) || '',
      email: email,
      name: md.full_name || md.name || md.user_name || email || 'Bạn đọc',
      picture: md.avatar_url || md.picture || '',
      provider: (su && ((su.app_metadata && su.app_metadata.provider) || '')) || 'supabase',
      exp: exp || (Math.floor(Date.now() / 1000) + 3600)
    };
    return mergeCustom(base);
  }
  /* gửi access_token cho Worker để lấy session token; Worker chưa sẵn sàng thì
     dùng luôn access_token (Worker vẫn xác thực được bằng JWKS của Supabase) */
  function recordVerifyError(status, error) {
    /* ghi lại để My Space / trang quản trị giải thích tại sao phiên "đăng nhập
       rồi mà vẫn 401" (bệnh hay gặp: Worker chưa ghim project Supabase) */
    try { w.CZ_AUTH._verify = { at: Date.now(), status: status, error: String(error || 'không rõ lý do') }; } catch (e) {}
  }
  function justLoggedIn() {
    try { return w.sessionStorage.getItem('ssochuz-auth-pending') === '1'; } catch (e) { return false; }
  }
  function markLoginPending() {
    try { w.sessionStorage.setItem('ssochuz-auth-pending', '1'); } catch (e) {}
  }
  function clearLoginPending() {
    try { w.sessionStorage.removeItem('ssochuz-auth-pending'); } catch (e) {}
  }
  function exchange(u, accessToken) {
    var base = api();
    if (!base || !accessToken) { save(Object.assign({}, u, { local: !base }), accessToken || ''); return Promise.resolve(u); }
    /* Supabase redirect + visibilitychange có thể gọi exchange hai lần. Một lần
       retry có backoff giúp tránh 429 mà không tạo vòng lặp request. */
    function request(attempt) {
      return fetch(base + '/api/auth/supabase', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: accessToken, provider: 'supabase' })
      }).then(function (r) {
        if (r.status === 429 && attempt < 1) {
          return new Promise(function (resolve) { setTimeout(resolve, 1800); }).then(function () { return request(attempt + 1); });
        }
        return r;
      });
    }
    return request(0).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j && j.ok && j.token) {
          var merged = Object.assign({}, u, j.user || {}, { admin: !!j.admin });
          clearLoginPending();
          try { w.CZ_AUTH._verify = null; } catch (e) {}
          save(merged, j.token);
          return merged;
        }
        /* Worker từ chối đổi token → ghi LÝ DO ra console để dễ bắt bệnh
           (hay gặp nhất: Worker chưa ghim đúng project Supabase — bản token mới
           của Supabase ký ES256 nên bắt buộc Worker phải có Project URL).
           Vẫn cho đăng nhập bằng token Supabase thô — nhưng bình luận sẽ chỉ chạy
           khi Worker tự verify được token đó. */
        var reason = (j && j.error) || ('máy chủ trả ' + r.status);
        try {
          console.warn('[cz-auth] Worker không đổi được session (' + r.status + '):', reason,
            (j && j.supabaseUrl) ? ('SUPABASE_URL trên Worker: ' + j.supabaseUrl) : '');
        } catch (e) {}
        recordVerifyError(r.status, reason);
        if (justLoggedIn()) {
          clearLoginPending();
          toast('Đã đăng nhập Google, nhưng Worker chưa xác thực được phiên này (' + reason + '). Vui lòng báo quản trị — chi tiết nằm ở trang My Space.', 'err');
        }
        var unverified = Object.assign({}, u, { admin: false });
        save(unverified, accessToken);
        return unverified;
      });
    }).catch(function () {
      recordVerifyError(0, 'mất mạng — không gọi được Worker');
      var unverified = Object.assign({}, u, { admin: false });
      save(unverified, accessToken);
      return unverified;
    });
  }
  /* dọn URL sau khi Supabase trả code về (bỏ ?code=… cho sạch, tránh reload lại đổi lần nữa).
     Bổ sung token_hash/type: link qua email quay về dạng ?token_hash=…&type=magiclink —
     thiếu là F5 một cái web lại chạy verifyOtp lần nữa (và báo "link hết hiệu lực"). */
  function cleanURL() {
    try {
      var u = new URL(w.location.href);
      var changed = false;
      ['code', 'error', 'error_description', 'state', 'provider_token', 'provider_refresh_token', 'token_hash', 'type'].forEach(function (k) {
        if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; }
      });
      if (changed && w.history && w.history.replaceState) {
        w.history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
      }
    } catch (e) {}
  }
  /* Link qua email quay về dạng ?token_hash=…&type=magiclink (khác ?code= của
     Google OAuth) — supabase-js KHÔNG tự đổi dạng này, phải gọi verifyOtp.
     Trước đây bỏ sót nên "link qua email" bấm xong vẫn chưa đăng nhập được. */
  function consumeMagicLink(c) {
    var q = null;
    try { q = new URL(w.location.href).searchParams; } catch (e) { return Promise.resolve(null); }
    var hash = q.get('token_hash') || '';
    var type = String(q.get('type') || 'magiclink').toLowerCase();
    var ok = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'].indexOf(type) >= 0 ? type : 'magiclink';
    if (!hash || !q.get('type')) return Promise.resolve(null);
    return c.auth.verifyOtp({ tokenHash: hash, type: ok }).then(function (r) {
      if (r && r.error) throw new Error(r.error.message || 'Link đăng nhập không còn hiệu lực');
      return r;
    });
  }
  function syncFromSession(silent) {
    return client().then(function (c) {
      /* link email (?)token_hash=…) phải đổi TRƯỚC khi đọc session */
      return consumeMagicLink(c).catch(function (e) {
        if (justLoggedIn()) { clearLoginPending(); toast(e && e.message ? e.message : 'Link đăng nhập không còn hiệu lực', 'err'); }
        return null;
      }).then(function () {
        return c.auth.getSession().then(function (r) {
          var sess = r && r.data && r.data.session;
          if (sess && sess.access_token && sess.user) {
            var u = fromSupabase(sess.user, sess.access_token);
            /* Mỗi lần đồng bộ đều hỏi lại Worker; không giữ cờ admin cũ ở localStorage. */
            return exchange(u, sess.access_token).then(function (verified) { cleanURL(); return verified; });
          }
          if (user && !silent) save(null, null);
          return null;
        });
      });
    }).catch(function () { return null; });
  }
  function loginSupabase(how) {
    if (!sbReady()) return Promise.reject(new Error('Chưa cấu hình Supabase'));
    return client().then(function (c) {
      var back = w.location.origin + w.location.pathname;
      if (how === 'email') {
        var email = String(w.__czEmail || '').trim();
        if (!email) return Promise.reject(new Error('Nhập email trước đã'));
        return c.auth.signInWithOtp({
          email: email,
          options: { emailRedirectTo: back }
        }).then(function (r) {
          if (r && r.error) throw new Error(r.error.message || 'Không gửi được link đăng nhập');
          markLoginPending();
          toast('Đã gửi link đăng nhập tới ' + email + ' — mở email và bấm link đó', 'ok');
          return null;
        });
      }
      return c.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: back,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
          skipBrowserRedirect: false
        }
      }).then(function (r) {
        if (r && r.error) throw new Error(r.error.message || 'Supabase từ chối mở đăng nhập Google');
        markLoginPending();                 /* trình duyệt sẽ chuyển trang sang Supabase */
        return null;
      });
    });
  }
  function loginEmail(email) { w.__czEmail = email; return loginSupabase('email'); }

  /* ====================== GOOGLE (cách cũ — vẫn giữ) ====================== */
  function ensureGIS() {
    if (w.google && w.google.accounts && w.google.accounts.id) return Promise.resolve();
    if (gisReady) return gisReady;
    gisReady = new Promise(function (resolve, reject) {
      var s = d.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Không tải được Google Identity Services (mạng?)')); };
      d.head.appendChild(s);
    });
    return gisReady;
  }
  function exchangeGoogle(credential) {
    var base = api();
    if (!base) return Promise.reject(new Error('Chưa cấu hình CZ_API (cz-config.js)'));
    return fetch(base + '/api/auth/google', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: credential })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || ('Xác thực thất bại (' + r.status + ')'));
        return j;
      });
    }).then(function (j) {
      save(Object.assign({}, j.user, { provider: 'google', admin: !!j.admin }), j.token);
      toast('Đăng nhập: ' + (j.user.name || j.user.email), 'ok');
      return j.user;
    });
  }
  function loginGoogleDirect() {
    var cid = googleId();
    if (!cid) return Promise.reject(new Error('Thiếu CZ_GOOGLE_CLIENT_ID'));
    return ensureGIS().then(function () {
      return new Promise(function (resolve, reject) {
        var settled = false;
        function cb(resp) {
          if (settled) return; settled = true;
          if (resp && resp.credential) exchangeGoogle(resp.credential).then(resolve, reject);
          else reject(new Error(resp && resp.error ? ('Google: ' + resp.error) : 'Đăng nhập bị huỷ'));
        }
        try {
          w.google.accounts.id.initialize({ client_id: cid, callback: cb, auto_select: false, cancel_on_tap_outside: true });
        } catch (e) { reject(e); return; }
        w.google.accounts.id.prompt(function (notice) {
          if (settled) return;
          if ((notice.isNotDisplayed && notice.isNotDisplayed()) || (notice.isSkipped && notice.isSkipped())) {
            fallbackButton(cb).then(resolve, reject);
          } else if (notice.isDismissed && notice.isDismissed()) reject(new Error('Đăng nhập bị huỷ'));
        });
        setTimeout(function () { if (!settled) reject(new Error('Hết thời gian chờ đăng nhập')); }, 25000);
      });
    });
  }
  function fallbackButton(cb) {
    return ensureGIS().then(function () {
      return new Promise(function (resolve, reject) {
        var host = d.getElementById('czGisHost');
        if (!host) {
          host = d.createElement('div'); host.id = 'czGisHost';
          host.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
          d.body.appendChild(host);
        }
        host.innerHTML = '';
        w.google.accounts.id.renderButton(host, { theme: 'outline', size: 'large', type: 'standard', width: 240 });
        setTimeout(function () {
          var btn = host.querySelector('div[role="button"], button');
          if (btn) btn.click(); else reject(new Error('Không render được nút Google'));
        }, 80);
      });
    });
  }

  /* ================================ API CHUNG ============================= */
  /* Hộp thoại chọn cách đăng nhập — dùng khi chưa cấu hình hoặc muốn đăng nhập email */
  function loginDialog() {
    if (!w.CZ || !w.CZ.modal) return Promise.reject(new Error('Chưa sẵn sàng'));
    var why = sbReady() ? '' :
      '<div class="mb"><div class="note warn"><b>Chưa bật đăng nhập.</b> Dán <code>Project URL</code> và ' +
      '<code>anon key</code> của Supabase vào <code>cz-config.js</code> (hoặc lưu trong trang quản trị → ' +
      'Cài đặt &amp; đồng bộ → mục Đăng nhập). Hướng dẫn 3 bước: <code>HUONG-DAN-DANG-NHAP-BINH-LUAN.md</code>.</div></div>';
    var m = w.CZ.modal('czLogin',
      '<div class="mh"><h4>Đăng nhập</h4></div>' + why +
      '<div class="mb">' +
        '<p class="sm muted">Đăng nhập để bình luận, thích từng chương và giữ danh tính của bạn trên web. ' +
        'Truyện đang đọc và tủ truyện vẫn lưu trong máy kể cả khi chưa đăng nhập.</p>' +
        (sbReady()
          ? '<div class="row mt"><button class="btn pri" id="czLgGoogle">Tiếp tục với Google</button>' +
            '<button class="btn ghost" id="czLgEmail">Link qua email</button></div>' +
            '<div class="hide mt" id="czMailBox"><label class="fl" for="czMail">Email của bạn</label>' +
            '<input class="inp" id="czMail" type="email" placeholder="ban@example.com" autocomplete="email">' +
            '<button class="btn ghost sm mt" id="czMailSend">Gửi link đăng nhập</button></div>'
          : (gisReadyCfg() ? '<div class="row mt"><button class="btn pri" id="czLgGoogle2">Tiếp tục với Google</button></div>' : '')) +
      '</div>' +
      '<div class="mf"><button class="btn ghost" data-close>Đóng</button></div>');
    function bind(id, fn) { var b = m.querySelector(id); if (b) b.addEventListener('click', fn); }
    bind('#czLgGoogle', function () { m._close(); doLogin('oauth'); });
    bind('#czLgGoogle2', function () { m._close(); doLogin('google'); });
    bind('#czLgEmail', function () { var b = m.querySelector('#czMailBox'); if (b) b.classList.toggle('hide'); var i = m.querySelector('#czMail'); if (i) i.focus(); });
    bind('#czMailSend', function () {
      var i = m.querySelector('#czMail');
      var e = i ? String(i.value || '').trim() : '';
      if (!/^\S+@\S+\.\S+$/.test(e)) { toast('Email chưa đúng', 'err'); return; }
      loginEmail(e).then(function () { if (m._close) m._close(); })
        .catch(function (er) { toast(er.message || 'Không gửi được', 'err'); });
    });
    return Promise.resolve(null);
  }

  function doLogin(how) {
    var p;
    if (how === 'google' || (how !== 'oauth' && provider() === 'google')) p = loginGoogleDirect();
    else if (sbReady()) p = loginSupabase(how === 'email' ? 'email' : 'oauth');
    else if (gisReadyCfg()) p = loginGoogleDirect();
    else {
      toast('Chưa cấu hình đăng nhập — xem HUONG-DAN-DANG-NHAP-BINH-LUAN.md', 'err');
      return loginDialog().then(function () { return null; }).catch(function () { return null; });
    }
    return p.then(function (u) {
      if (u) toast('Đăng nhập: ' + (u.name || u.email), 'ok');
      return u;
    }).catch(function (e) {
      var m = (e && e.message) || 'Đăng nhập thất bại';
      toast(m, 'err');
      throw e;
    });
  }
  /* mọi chỗ gọi đều đi qua đây để không bao giờ có promise bị bỏ rơi */
  function login(how) {
    if (!configured()) return loginDialog().then(function () { return null; }).catch(function () { return null; });
    return doLogin(how).catch(function () { return null; });
  }
  function logout() {
    var p = Promise.resolve();
    if (sb) { try { p = sb.auth.signOut().catch(function () {}); } catch (e) { p = Promise.resolve(); } }
    return p.then(function () {
      save(null, null);
      try { localStorage.removeItem(SB_STORAGE); } catch (e) {}
      toast('Đã đăng xuất');
      return null;
    });
  }
  /* làm tươi user (ảnh/tên có thể đổi) — gọi lúc khởi động và khi quay lại tab */
  function refresh() {
    if (sbReady()) { syncFromSession(true); return; }
    if (!token || !api()) return;
    fetch(api() + '/api/auth/me', { headers: { authorization: 'Bearer ' + token } })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (j && j.ok && j.user) save(Object.assign({}, user, j.user, { admin: !!j.admin }), token);
          else if (r.status === 401 && provider() !== 'supabase') save(null, null);
        });
      }).catch(function () {});
  }
  /* nhận cấu hình từ KV (registry.settings.auth) — dán trong /admin là dùng được ngay */
  function applySettings(s) {
    s = s || {};
    settingsApplied = true;
    if (s.supabaseUrl && !sbURL()) w.CZ_SUPABASE_URL = String(s.supabaseUrl).trim().replace(/\/+$/, '');
    if (s.supabaseAnonKey && !sbKey()) w.CZ_SUPABASE_ANON_KEY = String(s.supabaseAnonKey).trim();
    if (s.googleClientId && !googleId()) w.CZ_GOOGLE_CLIENT_ID = String(s.googleClientId).trim();
    if (s.provider) w.CZ_AUTH_PROVIDER = s.provider;
    /* adminEmails cố ý không đọc từ cấu hình công khai; quyền chỉ do Worker cấp. */
    if (sbReady() && !sb) syncFromSession(true);
  }
  function isSettingsApplied() { return settingsApplied; }

  /* ---------------------------------------------------------------- khởi động */
  load();
  w.CZ_AUTH = {
    /* mới */
    login: login, loginEmail: loginEmail, loginDialog: loginDialog,
    provider: provider, configured: configured, isAdmin: isAdmin,
    applySettings: applySettings, settingsApplied: isSettingsApplied, supabase: function () { return sb; },
    applyServerProfile: applyServerProfile, updateProfile: updateProfile, editProfileDialog: editProfileDialog, cropAvatar: cropDialog,
    getCustomProfile: getCustomProfile,
    /* giữ tên cũ để các trang/kiểm thử không phải sửa */
    loginGoogle: function () { return login(provider() === 'google' ? 'google' : 'oauth'); },
    logout: logout, current: current, token: getToken, onAuth: onAuth, refresh: refresh, saveUser: save
  };

  function boot() {
    /* cấu hình đăng nhập có thể nằm trong KV (dán ở trang /admin): đọc rồi áp dụng.
       Đã cấu hình sẵn trong cz-config.js thì bỏ qua để không ghi đè ngược. */
    if (w.CZ && w.CZ.registry && !configured()) {
      w.CZ.registry().then(function (o) {
        var s = o && o.reg && o.reg.settings && o.reg.settings.auth;
        if (s) applySettings(s);
      }).catch(function () {});
    }
    /* Cờ admin trong localStorage đã bị xoá ở load(); hỏi Worker trước để phiên cũ
       chỉ mở lại menu quản trị sau khi máy chủ xác nhận. */
    if (token && api()) refresh();
    if (sbReady()) {
      /* trang vừa quay về từ Supabase (?code=…) hay mở lại tab: đồng bộ phiên */
      syncFromSession(false);
      d.addEventListener('visibilitychange', function () { if (!d.hidden && sb) syncFromSession(true); });
    }
    if (gisReadyCfg()) { try { ensureGIS(); } catch (e) {} }
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
