/* chuseoz · ĐĂNG NHẬP GOOGLE (Google Identity Services) + session Worker
   ------------------------------------------------------------------------
   · Người dùng bấm "Đăng nhập" → Google trả về idToken (JWT).
   · Frontend gửi idToken cho Worker (POST /api/auth/google). Worker xác thực
     chữ ký bằng khoá công khai của Google, rồi cấp session token (HS256).
   · Session token lưu trong localStorage, gửi kèm header Authorization khi
     đăng bình luận. Không cần Firebase để đăng nhập.
   · Thiếu CZ_GOOGLE_CLIENT_ID → nút báo lỗi rõ ràng (không còn "local mock").
   ========================================================================== */
(function (w, d) {
  'use strict';
  var LS_USER = 'chuseoz-user';
  var LS_TOKEN = 'chuseoz-auth-token';
  var user = null;
  var token = null;
  var listeners = [];
  var gisReady = null;

  function load() {
    try {
      var raw = localStorage.getItem(LS_USER);
      if (raw) user = JSON.parse(raw);
      var t = localStorage.getItem(LS_TOKEN);
      if (t) token = t;
    } catch (e) { user = null; token = null; }
    // client kiểm tra hạn session nhẹ (server vẫn xác thực lại mỗi request)
    if (token && user && user.exp && user.exp * 1000 < Date.now()) { user = null; token = null; }
  }
  function save(u, t) {
    user = u || null; token = t || null;
    try {
      if (user) localStorage.setItem(LS_USER, JSON.stringify(user)); else localStorage.removeItem(LS_USER);
      if (token) localStorage.setItem(LS_TOKEN, token); else localStorage.removeItem(LS_TOKEN);
    } catch (e) {}
    listeners.forEach(function (fn) { try { fn(user); } catch (e) {} });
  }
  function onAuth(fn) { listeners.push(fn); if (user) fn(user); }
  function current() { return user; }
  function getToken() { return token; }
  function api() { return w.CZ_API || ''; }
  function toast(msg, kind) { if (w.CZ && w.CZ.toast) w.CZ.toast(msg, kind); }

  /* tải Google Identity Services sớm (nếu có Client ID) để nút bấm không bị gián đoạn */
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

  function exchange(credential) {
    var base = api();
    if (!base) return Promise.reject(new Error('Chưa cấu hình CZ_API (cz-config.js)'));
    return fetch(base + '/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: credential }),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || ('Xác thực thất bại (' + r.status + ')'));
        return j;
      });
    }).then(function (j) {
      save(j.user, j.token);
      toast('Đăng nhập: ' + (j.user.name || j.user.email), 'ok');
      return j.user;
    });
  }

  function loginGoogle() {
    var cid = w.CZ_GOOGLE_CLIENT_ID;
    if (!cid) {
      toast('Chưa cấu hình Google Client ID — xem worker/README.md §7', 'err');
      return Promise.reject(new Error('thiếu CZ_GOOGLE_CLIENT_ID'));
    }
    return ensureGIS().then(function () {
      return new Promise(function (resolve, reject) {
        var settled = false;
        function cb(resp) {
          if (settled) return; settled = true;
          if (resp && resp.credential) { exchange(resp.credential).then(resolve, reject); }
          else { reject(new Error(resp && resp.error ? ('Google: ' + resp.error) : 'Đăng nhập bị huỷ')); }
        }
        try {
          w.google.accounts.id.initialize({ client_id: cid, callback: cb, auto_select: false, cancel_on_tap_outside: true });
        } catch (e) { reject(e); return; }
        w.google.accounts.id.prompt(function (notice) {
          if (settled) return;
          if (notice.isNotDisplayed && notice.isNotDisplayed()) {
            // One Tap không hiện (chính sách/đã từ chối) → dùng nút Google thật
            fallbackButton(cid, cb).then(resolve, reject);
          } else if (notice.isSkipped && notice.isSkipped()) {
            fallbackButton(cid, cb).then(resolve, reject);
          } else if (notice.isDismissed && notice.isDismissed()) {
            reject(new Error('Đăng nhập bị huỷ'));
          }
        });
        // an toàn: nếu không có phản hồi nào (ví dụ đang cooldown), không treo vĩnh viễn
        setTimeout(function () { if (!settled) reject(new Error('Hết thời gian chờ đăng nhập')); }, 25000);
      });
    });
  }

  /* nút Google thật (dự phòng khi One Tap bị chặn) */
  function fallbackButton(cid, cb) {
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
          if (btn) btn.click(); else reject(new Error('không render được nút Google'));
        }, 80);
      });
    });
  }

  function logout() {
    save(null, null);
    toast('Đã đăng xuất');
    return Promise.resolve();
  }

  /* làm tươi user từ Worker (ảnh/tên có thể đổi); gọi khi khởi động */
  function refresh() {
    if (!token) return;
    var base = api();
    if (!base) return;
    fetch(base + '/api/auth/me', { headers: { authorization: 'Bearer ' + token } })
      .then(function (r) {
        return r.json().then(function (j) {
          if (j.ok && j.user) save(Object.assign({}, user, j.user), token);
          else if (r.status === 401) save(null, null);
        });
      })
      .catch(function () {});
  }

  load();
  w.CZ_AUTH = {
    loginGoogle: loginGoogle,
    logout: logout,
    current: current,
    token: getToken,
    onAuth: onAuth,
    refresh: refresh,
    saveUser: save,
  };
  // làm tươi nhẹ khi load (nếu đã đăng nhập)
  if (d.readyState !== 'loading') refresh(); else d.addEventListener('DOMContentLoaded', refresh);
  // tải GIS sớm nếu có Client ID
  if (w.CZ_GOOGLE_CLIENT_ID) { try { ensureGIS(); } catch (e) {} }
})(window, document);
