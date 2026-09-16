/* ============================================================================
   sw.js · service worker của ssochuz library (PWA + đọc offline)
   ----------------------------------------------------------------------------
   · Precache app shell để mở web offline vẫn lên.
   · API đọc (registry/book/stats/schedule) + /data/*.json: stale-while-revalidate
     → thư viện và các chương ĐÃ MỞ đều đọc được offline, online thì tự mới.
   · Ảnh bìa (kể cả host ngoài): cache-first, tối đa 200 ảnh, tự dọn ảnh cũ nhất.
   · KHÔNG BAO GIỜ cache request ghi (POST/PUT/DELETE). Ngược lại: ghi xong thì
     xoá cache API liên quan để /admin không đọc phải số cũ.
   · Trang đã vào (kể cả /truyen/<slug>/) được lưu lại → offline vẫn mở được.

   ⚠ MỖI LẦN ĐỔI ?v= TĨNH (cz.css/cz-*.js): sửa cả PRECACHE dưới đây + tăng
   CZ_SW_VER → trình duyệt tự tải SW mới, hiện “Đã có bản cập nhật — tải lại”.
   ========================================================================== */
var CZ_SW_VER = '20260917h';

/* kho shell theo version (update là thay kho mới, xoá kho cũ);
   kho trang/API/ảnh KHÔNG theo version để dữ liệu offline còn lại sau update */
var C_SHELL = 'ssochuz-shell-' + CZ_SW_VER;
var C_PAGES = 'ssochuz-pages';
var C_API = 'ssochuz-api';
var C_IMG = 'ssochuz-img';
var IMG_MAX = 200;

var PRECACHE = [
  '/',
  '/truyen/',
  '/manifest.webmanifest',
  '/cz.css?v=20260917b',
  '/cz-app.js?v=20260917h',
  '/cz-home.js?v=20260917f',
  '/cz-story.js?v=20260917h',
  '/cz-config.js?v=20260917h',
  '/cz-auth.js?v=20260915j',
  '/ssochuz.png?v=1'
];

/* API đọc của Worker — khớp theo ĐƯỜNG DẪN nên CZ_API đặt host nào cũng trúng */
function isApiRead(path) {
  return path === '/api/registry' || path === '/api/stats' || path === '/api/schedule' ||
    path === '/api/book' || path.indexOf('/api/book/') === 0 || path.indexOf('/api/book?') === 0;
}
function isApiWrite(path) {
  return path === '/api/view' || path === '/api/vote' || path === '/api/report' ||
    path.indexOf('/api/comments') === 0 || path === '/api/book' || path.indexOf('/api/book/') === 0 ||
    path === '/api/registry' || path === '/api/stats' || path === '/api/schedule' ||
    path.indexOf('/api/stats/') === 0 || path.indexOf('/api/admin/') === 0 || path.indexOf('/api/auth/') === 0 ||
    path === '/api/seed' || path === '/api/sync' || path === '/api/import' || path === '/api/recount';
}

self.addEventListener('install', function (e) {
  /* precache “cố gắng hết sức”: 1 URL lỗi (vd môi trường dev không có rewrite
     /truyen/) cũng không được làm hỏng cả lần cài */
  e.waitUntil(caches.open(C_SHELL).then(function (cache) {
    return Promise.all(PRECACHE.map(function (u) {
      return cache.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      /* chỉ dọn kho shell CŨ — kho trang/API/ảnh giữ lại để còn đọc offline */
      if (k.indexOf('ssochuz-shell-') === 0 && k !== C_SHELL) return caches.delete(k);
      return null;
    }));
  }).then(function () { return self.clients.claim(); }));
});

/* trang mới bấm “Tải lại” trong thanh cập nhật → SW mới chiếm quyền ngay */
self.addEventListener('message', function (e) {
  if (e && e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ghi dữ liệu xong (PUT/POST/DELETE /api/*) → xoá cache API để lần đọc sau mới */
function invalidateApi() {
  caches.open(C_API).then(function (cache) {
    cache.keys().then(function (keys) {
      keys.forEach(function (k) { cache.delete(k); });
    });
  }).catch(function () {});
}

function netThenCache(req, cacheName, okOnly) {
  return fetch(req).then(function (res) {
    if (res && (okOnly ? res.ok : (res.ok || res.type === 'opaque'))) {
      var copy = res.clone();
      caches.open(cacheName).then(function (cache) { cache.put(req, copy); }).catch(function () {});
    }
    return res;
  });
}

/* stale-while-revalidate: có cache thì trả ngay, đồng thời tải mới cho lần sau */
function swr(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = netThenCache(req, cacheName, true).catch(function () { return hit || Response.error(); });
      return hit || net;
    });
  });
}

/* ảnh: cache-first + giới hạn 200 mục (xoá ảnh cũ nhất khi đầy) */
function imgFirst(req) {
  return caches.open(C_IMG).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) {
        /* chạm lại để ảnh hay xem không bị dọn (keys() trả theo thứ tự chèn) */
        cache.delete(req).then(function () { cache.put(req, hit); }).catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          cache.put(req, copy).then(function () {
            cache.keys().then(function (keys) {
              var extra = keys.length - IMG_MAX, i = 0;
              (function next() {
                if (i < extra) cache.delete(keys[i++]).then(next, next);
              })();
            });
          }).catch(function () {});
        }
        return res;
      });
    });
  });
}

/* chuyển trang: online thì lưu lại bản mới; offline thì mở bản đã lưu */
function navFallback(req) {
  return netThenCache(req, C_PAGES, true).catch(function () {
    return caches.match(req).then(function (hit) {
      if (hit) return hit;
      var path = '/';
      try { path = new URL(req.url).pathname; } catch (e) {}
      /* truyện chưa từng mở mà offline: ít nhất cũng lên được shell + báo rõ */
      if (path.indexOf('/truyen/') === 0 || path.indexOf('/reader') === 0) return caches.match('/truyen/');
      return caches.match('/');
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* ---- KHÔNG cache request ghi; ghi API xong thì xoá cache API ---- */
  if (req.method !== 'GET') {
    if (isApiWrite(url.pathname)) {
      e.respondWith(fetch(req).then(function (res) { invalidateApi(); return res; }));
    }
    return;   /* POST/PUT khác: để trình duyệt tự xử, SW không động vào */
  }

  if (req.mode === 'navigate') { e.respondWith(navFallback(req)); return; }
  if (isApiRead(url.pathname)) { e.respondWith(swr(req, C_API)); return; }
  if (url.origin === self.location.origin && url.pathname.indexOf('/data/') === 0) {
    e.respondWith(swr(req, C_API)); return;
  }
  /* ảnh bìa có khi không gắn destination (trình duyệt cũ) → bắt thêm theo đuôi */
  if (req.destination === 'image' || /\.(png|jpe?g|gif|webp|svg|ico)(\?|#|$)/i.test(url.pathname)) {
    e.respondWith(imgFirst(req)); return;
  }
  /* tệp tĩnh cùng host (js/css/manifest/icon): có mới dùng mới, offline dùng cũ */
  if (url.origin === self.location.origin) { e.respondWith(swr(req, C_SHELL)); return; }
  /* còn lại (Giscus, Supabase, Google…): mạng trực tiếp, không cache */
});

/* ================= THÔNG BÁO ĐẨY "RA CHƯƠNG MỚI" =====================
   Worker gửi payload {title, body, url, tag} đã mã hoá; SW hiện notification,
   bấm vào thì mở thẳng URL chương (ưu tiên tab đang mở của web). */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  var title = d.title || 'ssochuz library';
  var opt = {
    body: d.body || 'Có chương mới!',
    icon: '/ssochuz.png',
    badge: '/ssochuz.png',
    tag: d.tag || 'chuong-moi',
    renotify: true,
    lang: 'vi',
    data: { url: d.url || '/' }
  };
  e.waitUntil(self.registration.showNotification(title, opt));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    /* ưu tiên tab đang mở của web: chuyển thẳng tới chương rồi focus */
    for (var i = 0; i < list.length; i++) {
      try {
        if (new URL(list[i].url).origin === self.location.origin && 'focus' in list[i]) {
          var c = list[i];
          return ('navigate' in c ? c.navigate(url) : Promise.resolve(c)).then(function (x) { return x.focus(); });
        }
      } catch (err) { /* url lạ thì bỏ qua tab này */ }
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
