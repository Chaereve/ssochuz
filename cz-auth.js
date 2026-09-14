/* ============================================================================
   chuseoz · ĐĂNG NHẬP (Supabase Auth — mặc định) + phiên làm việc với Worker
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
  var LS_USER = 'chuseoz-user';
  var LS_TOKEN = 'chuseoz-auth-token';
  var SB_STORAGE = 'chuseoz-sb';
  var LS_PROFILE_PFX = 'chuseoz-profile-';   /* custom name/picture override per uid */
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
    if (u) u = mergeCustom(u);
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
  function editProfileDialog() {
    if (!w.CZ || !w.CZ.modal) return Promise.reject(new Error('Chưa sẵn sàng'));
    var u = current();
    if (!u) { toast('Đăng nhập trước đã', 'err'); return Promise.reject(new Error('Chưa đăng nhập')); }
    var curName = u.name || '';
    var curPic = u.picture || '';
    var m = w.CZ.modal('czProfile',
      '<div class=\"mh\"><h4>Chỉnh sửa hồ sơ</h4></div>' +
      '<div class=\"mb\">' +
        '<p class=\"sm muted\">Tên và ảnh đại diện sẽ hiện khi bạn bình luận và ở mục My Space. Ảnh có thể là link https:// hoặc chọn tệp từ máy (sẽ lưu dưới dạng data URL trong máy bạn).</p>' +
        '<label class=\"fl\" for=\"czPfName\">Tên hiển thị</label>' +
        '<input class=\"inp\" id=\"czPfName\" maxlength=\"40\" value=\"' + w.CZ.esc(curName) + '\" placeholder=\"Tên của bạn\">' +
        '<label class=\"fl mt\" for=\"czPfPic\">Avatar URL</label>' +
        '<input class=\"inp\" id=\"czPfPic\" value=\"' + w.CZ.esc(curPic) + '\" placeholder=\"https://... hoặc để trống\">' +
        '<div class=\"row mt\"><input type=\"file\" id=\"czPfFile\" accept=\"image/*\" class=\"hide\"><button class=\"btn ghost sm\" id=\"czPfPick\">Chọn ảnh từ máy…</button><span class=\"sm muted\" id=\"czPfFileName\"></span></div>' +
        '<div class=\"row mt\" id=\"czPfPrev\" style=\"align-items:center;gap:12px\">' +
          (curPic ? '<img src=\"' + w.CZ.esc(curPic) + '\" alt=\"\" style=\"width:48px;height:48px;border-radius:50%;object-fit:cover\">' : '<span class=\"ava\" style=\"width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--surf2)\">' + w.CZ.esc(String(curName||'B')[0].toUpperCase()) + '</span>') +
          '<span class=\"sm muted\">Xem trước</span></div>' +
      '</div>' +
      '<div class=\"mf\"><button class=\"btn ghost\" data-close>Huỷ</button><button class=\"btn pri\" id=\"czPfSave\">Lưu</button></div>');
    var inpName = m.querySelector('#czPfName');
    var inpPic = m.querySelector('#czPfPic');
    var prev = m.querySelector('#czPfPrev');
    var fileIn = m.querySelector('#czPfFile');
    var fileName = m.querySelector('#czPfFileName');
    function paintPrev() {
      var n = inpName.value.trim() || 'B';
      var p = inpPic.value.trim();
      prev.innerHTML = (p ? '<img src="' + w.CZ.esc(p) + '" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover" onerror="this.style.display=\'none\'">'
        : '<span class="ava" style="width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--surf2)">' + w.CZ.esc(String(n)[0].toUpperCase()) + '</span>') +
        '<span><b>' + w.CZ.esc(n) + '</b><br><span class="sm muted">' + w.CZ.esc(u.email || '') + '</span></span>';
    }
    inpName.addEventListener('input', paintPrev);
    inpPic.addEventListener('input', paintPrev);
    m.querySelector('#czPfPick').addEventListener('click', function () { fileIn.click(); });
    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      if (f.size > 800 * 1024) { toast('Ảnh quá lớn (>800KB) — chọn ảnh nhỏ hơn', 'err'); return; }
      var rd = new FileReader();
      rd.onload = function () {
        var dataUrl = String(rd.result || '');
        inpPic.value = dataUrl;
        fileName.textContent = f.name + ' · ' + Math.round(f.size / 1024) + 'KB';
        paintPrev();
        toast('Đã nạp ảnh từ máy', 'ok');
      };
      rd.onerror = function () { toast('Không đọc được tệp ảnh', 'err'); };
      rd.readAsDataURL(f);
    });
    var deferred = {};
    var promise = new Promise(function (res, rej) { deferred.res = res; deferred.rej = rej; });
    function closeWith(v) {
      if (m._close) m._close();
      deferred.res(v);
    }
    m._czClose = function () { deferred.res(null); };
    /* khi modal đóng bằng nút Huỷ / Esc / scrim thì resolve null */
    var origClose = m._close;
    m._close = function () {
      try { if (origClose) origClose(); } catch (e) {}
      deferred.res(null);
    };
    m.querySelector('#czPfSave').addEventListener('click', function () {
      var nm = inpName.value.trim();
      var pc = inpPic.value.trim();
      if (!nm) { toast('Tên không được trống', 'err'); return; }
      updateProfile({ name: nm, picture: pc }).then(function (merged) {
        if (m._close) {
          /* tạm gỡ resolver để không double-resolve */
          var r = deferred.res; deferred.res = function () {};
          try { origClose(); } catch (e) {}
          r(merged);
        } else {
          deferred.res(merged);
        }
      }).catch(function (e) { toast(e.message || 'Không lưu được', 'err'); });
    });
    setTimeout(function () { if (inpName) inpName.focus(); }, 80);
    return promise;
  }

  /* ------------------------------------------------------------------ admin */
  function adminEmails() {
    var list = (w.CZ_ADMIN_EMAILS || []).map(function (x) { return String(x || '').trim().toLowerCase(); });
    /* Worker có thể khai thêm trong registry.settings.auth.adminEmails */
    try {
      var reg = (w.CZ && w.CZ._memo && w.CZ._memo.reg) || null;
      var extra = reg && reg.settings && reg.settings.auth && reg.settings.auth.adminEmails;
      if (typeof extra === 'string') extra = extra.split(',');
      (Array.isArray(extra) ? extra : []).forEach(function (x) {
        x = String(x || '').trim().toLowerCase();
        if (x && list.indexOf(x) < 0) list.push(x);
      });
    } catch (e) {}
    return list.filter(Boolean);
  }
  function isAdmin() {
    if (!user) return false;
    if (user.admin === true || user.role === 'admin') return true;
    var e = String(user.email || '').trim().toLowerCase();
    return !!e && adminEmails().indexOf(e) >= 0;
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
          global: { headers: { 'x-client-info': 'chuseoz-web' } }
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
  function exchange(u, accessToken) {
    var base = api();
    if (!base || !accessToken) { save(Object.assign({}, u, { local: !base }), accessToken || ''); return Promise.resolve(u); }
    return fetch(base + '/api/auth/supabase', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken: accessToken, provider: 'supabase' })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j && j.ok && j.token) {
          var merged = Object.assign({}, u, j.user || {}, { admin: !!(j.admin || u.admin) });
          save(merged, j.token);
          return merged;
        }
        /* Worker chưa đặt SUPABASE_URL/JWT secret → vẫn cho đăng nhập, dùng token Supabase */
        save(Object.assign({}, u, { admin: u.admin }), accessToken);
        return u;
      });
    }).catch(function () { save(u, accessToken); return u; });
  }
  /* dọn URL sau khi Supabase trả code về (bỏ ?code=… cho sạch, tránh reload lại đổi lần nữa) */
  function cleanURL() {
    try {
      var u = new URL(w.location.href);
      var changed = false;
      ['code', 'error', 'error_description', 'state', 'provider_token', 'provider_refresh_token'].forEach(function (k) {
        if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; }
      });
      if (changed && w.history && w.history.replaceState) {
        w.history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
      }
    } catch (e) {}
  }
  function syncFromSession(silent) {
    return client().then(function (c) {
      return c.auth.getSession().then(function (r) {
        var sess = r && r.data && r.data.session;
        if (sess && sess.access_token && sess.user) {
          var u = fromSupabase(sess.user, sess.access_token);
          /* giữ cờ admin Worker đã xác nhận (nếu user cũ trùng email) */
          if (user && user.admin && String(user.email || '').toLowerCase() === String(u.email || '').toLowerCase()) u.admin = true;
          return exchange(u, sess.access_token).then(function () { cleanURL(); return u; });
        }
        if (user && !silent) save(null, null);
        return null;
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
        return null;                       /* trình duyệt sẽ chuyển trang sang Supabase */
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
          if (j && j.ok && j.user) save(Object.assign({}, user, j.user, { admin: !!(j.admin || (user && user.admin)) }), token);
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
    if (s.adminEmails) {
      var a = typeof s.adminEmails === 'string' ? s.adminEmails.split(',') : s.adminEmails;
      if (Array.isArray(a)) {
        w.CZ_ADMIN_EMAILS = a.map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(Boolean);
      }
    }
    if (sbReady() && !sb) syncFromSession(true);
  }
  function isSettingsApplied() { return settingsApplied; }

  /* ---------------------------------------------------------------- khởi động */
  load();
  w.CZ_AUTH = {
    /* mới */
    login: login, loginEmail: loginEmail, loginDialog: loginDialog,
    provider: provider, configured: configured, isAdmin: isAdmin, adminEmails: adminEmails,
    applySettings: applySettings, settingsApplied: isSettingsApplied, supabase: function () { return sb; },
    updateProfile: updateProfile, editProfileDialog: editProfileDialog,
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
    if (sbReady()) {
      /* trang vừa quay về từ Supabase (?code=…) hay mở lại tab: đồng bộ phiên */
      syncFromSession(false);
      d.addEventListener('visibilitychange', function () { if (!d.hidden && sb) syncFromSession(true); });
    } else if (token && api()) refresh();
    if (gisReadyCfg()) { try { ensureGIS(); } catch (e) {} }
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
