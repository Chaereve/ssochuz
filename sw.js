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
var CZ_SW_VER = '20260924a';

/* kho shell theo version (update là thay kho mới, xoá kho cũ);
   kho trang/API/ảnh KHÔNG theo version để dữ liệu offline còn lại sau update */
var C_SHELL = 'ssochuz-shell-' + CZ_SW_VER;
var C_PAGES = 'ssochuz-pages';
var C_API = 'ssochuz-api';
var C_IMG = 'ssochuz-img';
var IMG_MAX = 200;
/* SW có được phép gọi mạng ra host ngoài không (đọc từ CSP của chính sw.js):
   null = chưa biết, true = được, false = bị chặn */
var IMG_REMOTE_OK = null;
var imgProbeAt = 0;
/* host ngoài bị chặn khi ĐANG offline (mạng đứt, không phải CSP) → nhớ riêng từng host */
var IMG_HOST_OFF = {};
/* URL đã nhường cho trình duyệt → đừng chặn lại lần nữa (chặn lại là thành vòng lặp) */
var IMG_HANDOFF = {};

var PRECACHE = [
  '/',
  '/truyen/',
  '/tac-gia/',
  '/couple/',
  '/my-space',
  '/profile',
  '/cz-space.js?v=20260924a',
  '/manifest.webmanifest',
  '/cz.css?v=20260924a',
  '/cz-app.js?v=20260924a',
  '/cz-home.js?v=20260924a',
  '/cz-story.js?v=20260924a',
  '/cz-people.js?v=20260924a',
  '/cz-config.js?v=20260924a',
  '/cz-auth.js?v=20260924a',
  '/ssochuz.png?v=1'
];

/* API đọc của Worker — khớp theo ĐƯỜNG DẪN nên CZ_API đặt host nào cũng trúng */
function isApiRead(path) {
  return path === '/api/registry' || path === '/api/stats' || path === '/api/schedule' ||
    path === '/api/book' || path.indexOf('/api/book/') === 0 || path.indexOf('/api/book?') === 0;
}
function isApiWrite(path) {
  return path === '/api/view' || path === '/api/vote' || path === '/api/rate' || path === '/api/report' ||
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
  imgProbe();      /* biết chắc CSP của mình trước khi đứng ra tải hộ ảnh bìa */
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

/* ===================== ẢNH BÌA ==============================================
   Bìa truyện phần lớn nằm ở host NGOÀI: cdn-local.mebmarket.com, pbs.twimg.com,
   m.media-amazon.com, i.mydramalist.com, image.tmdb.org… Service worker là một
   “văn bản” riêng, nên nó chịu **CSP của chính tệp sw.js** (xem `_headers`),
   không phải CSP của trang. connect-src trong đó chỉ mở 'self' + workers.dev/
   supabase/e2b → mọi lần SW đứng ra `fetch()` ảnh ở host ngoài đều bị chặn
   ngay, và bản cũ trả về ảnh lỗi ⇒ trang gỡ bìa đi.
   Triệu chứng đúng như người dùng báo: LẦN ĐẦU mở trang thì bìa hiện (SW chưa
   nắm quyền, trình duyệt tự tải), tới lúc F5 — SW đã nắm quyền — là mất sạch bìa.

   Nay, ba lớp theo thứ tự:
   1. TỰ ĐỌC CSP CỦA CHÍNH MÌNH — đọc header `connect-src` của phản hồi sw.js.
      Chỉ khi CSP thật sự cho ra ngoài thì SW mới đứng ra tải hộ bìa (⇒ cache
      được, đọc offline có bìa). Chưa biết / bị chặn ⇒ **để trình duyệt tải**:
      bìa vẫn hiện, không có request lỗi nào trong console.
   2. Nếu đang tải hộ mà bị chặn (CSP đổi sau khi SW đã cài, mạng đứt…) ⇒ trả
      **302 về đúng URL** để TRÌNH DUYỆT tự đi lấy, và nhớ lại (URL vừa nhường,
      host ngoài đang offline) ⇒ lần sau SW đứng ngoài luôn: không lặp chuyển
      hướng, không rác console.
   3. KHÔNG BAO GIỜ trả ảnh lỗi cho bìa (không `Response.error()`).
   `_headers` đã mở riêng `connect-src *` cho /sw.js nên bình thường SW vẫn tải
   hộ được — bìa vẫn nằm trong kho offline như thiết kế.
   ========================================================================= */
function isRemote(url) { return url.origin !== self.location.origin; }
/* CSP có cho gọi mạng ra host ngoài không (đọc đúng dòng connect-src).
   Chỉ nhận khi CSP mở cho MỌI nơi: `*` hoặc nguồn theo giao thức (`https:`).
   Kể cả khi CSP có `https://*.workers.dev` — vẫn KHÔNG tính là mở, vì host ảnh
   bìa (mebmarket, twimg, amazon…) không nằm trong danh sách đó. Có CSP mà không
   đọc được gì ⇒ coi như chặn (thà để trình duyệt tải bìa còn hơn thử rồi lỗi). */
function cspAllowsRemote(csp) {
  if (!csp) return true;                          /* không có CSP ⇒ không ai chặn */
  var m = /connect-src([^;]*)/i.exec(csp) || /default-src([^;]*)/i.exec(csp);
  var parts = (m ? m[1] : '').toLowerCase().split(/\s+/);
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === '*' || parts[i] === 'https:' || parts[i] === 'http:') return true;
  }
  return false;
}
/* hỏi chính phản hồi sw.js xem CSP đang áp cho mình là gì.
   Dùng cache: 'force-cache' — bản sw.js trong cache trình duyệt chính là phản hồi
   đã cài SW này (đúng CSP đang áp cho nó), lại không tốn request mỗi lần SW khởi
   động. Không đọc được (chưa có cache, mạng lỗi) ⇒ null = chưa biết. */
function imgProbeNow() {
  return fetch(self.location.href, { cache: 'force-cache' }).then(function (res) {
    return cspAllowsRemote((res && res.headers.get('content-security-policy')) || '');
  }).catch(function () { return null; });
}
/* dò một lần cho mỗi lần SW khởi động (thử lại cách nhau 60 giây nếu chưa ra kết quả) */
function imgProbe() {
  if (IMG_REMOTE_OK !== null) return;
  var now = Date.now();
  if (imgProbeAt && now - imgProbeAt < 60000) return;
  imgProbeAt = now;
  imgProbeNow().then(function (v) { if (v !== null) IMG_REMOTE_OK = v; }).catch(function () {});
}
/* đã nhường cho trình duyệt rồi thì đừng chặn lại */
function imgSkip(url) {
  if (IMG_HANDOFF[url.href] === 1) return true;
  return isRemote(url) && IMG_HOST_OFF[url.host] === 1;   /* host ngoài hỏng khi đang offline */
}
/* chỉ lưu ảnh thật: vài CDN trả trang HTML 200 khi chặn hotlink — lưu vào là hỏng bìa mãi */
function isImgRes(res) {
  if (!res) return false;
  if (res.type === 'opaque') return true;      /* không đọc được header → cứ thử lưu */
  if (!res.ok) return false;
  var ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct === '' || ct.indexOf('image/') === 0;
}
/* 302 về đúng URL: lần này để trình duyệt đi lấy ảnh, không qua CSP của sw.js */
function imgHandoff(req) {
  IMG_HANDOFF[req.url] = 1;
  try {
    var u = new URL(req.url);
    IMG_HANDOFF[u.href] = 1;
    if (!isRemote(u)) return handOffRes(req.url);
    var nav = self.navigator || {};
    /* Đang có mạng mà fetch vẫn bị từ chối ⇒ gần như chắc chắn CSP chặn host ngoài,
       không phải mạng hỏng. Từ đây thôi đứng ra tải hộ ảnh host ngoài, để không
       phải nếm lại lỗi đó cho từng tên miền ảnh một (rác console).
       Nếu đang OFFLINE thì chỉ nhớ riêng host đó — mở lại web là thử lại. */
    if (nav.onLine === false) IMG_HOST_OFF[u.host] = 1;
    else IMG_REMOTE_OK = false;
  } catch (e) {}
  return handOffRes(req.url);
}
function handOffRes(url) {
  return new Response('', { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}

/* ảnh: cache-first + giới hạn 200 mục (xoá ảnh cũ nhất khi đầy) */
function imgFirst(req) {
  return caches.open(C_IMG).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) {
        /* chạm lại để ảnh hay xem không bị dọn (keys() trả theo thứ tự chèn) */
        /* Cache.put() consumes its Response. Clone before re-inserting so the
           response returned to the page remains readable and Chrome does not log
           “Response body is already used”. */
        cache.delete(req).then(function () { cache.put(req, hit.clone()); }).catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (isImgRes(res)) {
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
      }).catch(function () {
        /* bị CSP chặn (hoặc mạng đứt): TUYỆT ĐỐI không trả ảnh lỗi nữa — mất bìa */
        return imgHandoff(req);
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

  // Never persist authenticated/profile responses, including public shelf visibility.
  if ((req.headers && req.headers.has('authorization')) || /^\/api\/(me\/|profiles\/|rate\/me)/.test(url.pathname)) { e.respondWith(fetch(req, { cache: 'no-store' })); return; }

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
  if (req.destination === 'image' || /\.(png|jpe?g|gif|webp|svg|ico|avif)(\?|#|$)/i.test(url.pathname)) {
    /* bìa ở host NGOÀI: chỉ đứng ra tải hộ khi CHẮC CHẮN được phép (xem khối ẢNH BÌA).
       Chưa biết thì kịp dò CSP và lần này để trình duyệt tự tải — bìa luôn hiện. */
    if (isRemote(url) && IMG_REMOTE_OK !== true) { imgProbe(); return; }
    /* URL/host vừa nhường cho trình duyệt: đi thẳng, không chặn lại (chặn lại là mất bìa) */
    if (!imgSkip(url)) e.respondWith(imgFirst(req));
    return;
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
