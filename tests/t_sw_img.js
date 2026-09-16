/* ============================================================================
   t_sw_img.js · kiểm thử sw.js ở mức CHẠY THẬT (giả lập self/caches/fetch)
   ----------------------------------------------------------------------------
   Bắt đúng lỗi “lần đầu vào trang thì còn bìa, F5 một cái là mất sạch bìa”:

   Service worker chịu CSP của CHÍNH tệp sw.js. CSP đó (connect-src) chỉ mở
   'self' + workers.dev/supabase/e2b, nên khi SW đứng ra fetch() ảnh bìa ở host
   ngoài (mebmarket, twimg, amazon…) thì trình duyệt chặn ngay → promise reject.
   Bản cũ trả về ảnh lỗi ⇒ trang gỡ bìa đi. Vì SW chỉ nắm quyền từ lần tải thứ
   hai trở đi, người dùng thấy: vào lần đầu bìa hiện, F5 là mất.

   Ba lớp phải cùng đúng:
     1. SW tự đọc CSP của mình (header của phản hồi sw.js): chỉ đứng ra tải hộ
        bìa host ngoài khi CSP thật sự cho ra ngoài; chưa biết/bị chặn thì để
        trình duyệt tải — bìa vẫn hiện, console không có request lỗi nào.
     2. Nếu đang tải hộ mà bị chặn (CSP đổi sau khi SW cài, mạng đứt…) thì trả
        302 về đúng URL cho trình duyệt tự lấy, nhớ lại để không chặn lại nữa
        (không lặp chuyển hướng, không rác console).
     3. Được phép thì vẫn tải hộ + lưu kho ssochuz-img (đọc offline còn bìa),
        nhưng không lưu trang HTML 200 của CDN chặn hotlink.

   jsdom không có service worker thật nên bài này tự dựng môi trường: vm + self
   giả + Cache API giả + fetch giả. Chạy: node tests/t_sw_img.js
   ========================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SW_CODE = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ORIGIN = 'https://ssochuz.pages.dev';
const SW_URL = ORIGIN + '/sw.js';

const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = (ms = 0) => new Promise(r => setTimeout(r, ms));
/* sw.js bản cũ để promise của respondWith reject → trình duyệt ghi "Uncaught (in promise)
   TypeError: Failed to fetch" rồi coi là ảnh lỗi. Node thì mặc định làm sập tiến trình —
   hứng lại để bài kiểm thử báo thành một dòng lỗi đọc được. */
process.on('unhandledRejection', (e) => { bad.push('SW tra promise loi (bia se hong): ' + ((e && e.message) || e)); });

/* CSP y như bản deploy: trang thì nghiêm, tệp sw.js (sau khi sửa _headers) thì mở */
const CSP_PAGE = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
  "img-src 'self' data: blob: https:; connect-src 'self' https://*.workers.dev https://*.supabase.co; frame-ancestors 'self'";
const CSP_SW = "default-src 'self'; script-src 'self'; connect-src *; img-src *; style-src 'unsafe-inline'";

const cover = 'https://cdn-local.mebmarket.com/meb/server1/425190/Thumbnail/book_detail_large.gif?2';
const cover2 = 'https://cdn-local.mebmarket.com/meb/server1/430310/Thumbnail/book_detail_large.gif?14';
const twimg = 'https://pbs.twimg.com/media/HQuHMUUbYAAx7RG?format=jpg&name=4096x4096';
const ownImg = ORIGIN + '/assets/pwa-192.png';

/* ---------- Cache API giả (giữ trong RAM, đủ dùng cho sw.js) ---------- */
function fakeCaches() {
  const stores = new Map();
  const bucket = n => { if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
  return {
    stores,
    open: async name => {
      const b = bucket(name);
      return {
        match: async req => { const r = b.get(String(req.url)); return r ? r.clone() : undefined; },
        put: async (req, res) => { b.set(String(req.url), res.clone()); },
        delete: async req => b.delete(String(req.url) || ''),
        keys: async () => Array.from(b.keys()).map(u => new Request(u)),
        add: async req => { const u = typeof req === 'string' ? req : req.url; b.set(u, new Response('shell')); },
      };
    },
    match: async req => {
      for (const b of stores.values()) { const r = b.get(String(req.url)); if (r) return r.clone(); }
      return undefined;
    },
    delete: async name => stores.delete(name),
    keys: async () => Array.from(stores.keys()),
  };
}

/* ---------- nạp sw.js vào một “phạm vi” giả, trả về bộ xử lý sự kiện ----------
   csp   : CSP mà phản hồi /sw.js mang (null = không có header, false = tải lỗi)
   image : phản hồi cho các URL ảnh (mặc định: ảnh PNG thật) */
function loadSW({ csp = CSP_SW, image = null, onLine = true } = {}) {
  const handlers = {};
  const calls = [];
  const caches = fakeCaches();
  const imgFetch = image || (() => Promise.resolve(
    new Response('img', { status: 200, headers: { 'content-type': 'image/png' } })));
  const fetchImpl = (req) => {
    const url = String(req.url || req);
    if (url === SW_URL) {                        /* SW tự hỏi CSP của chính mình */
      if (csp === false) return Promise.reject(new TypeError('Failed to fetch'));
      const headers = new Headers();
      if (csp) headers.set('content-security-policy', csp);
      return Promise.resolve(new Response('// sw.js', { status: 200, headers }));
    }
    return imgFetch(url);
  };
  const ctx = {
    self: {
      location: { origin: ORIGIN, href: SW_URL },
      navigator: { onLine },
      addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
      skipWaiting() {},
      clients: { matchAll: async () => [], claim: async () => {}, openWindow: async () => null },
      registration: { showNotification: async () => {} },
    },
    caches,
    fetch: (req, opt) => { calls.push(String(req.url || req)); return fetchImpl(req, opt); },
    Response, Request, Headers, URL, console, Promise, setTimeout, clearTimeout, Date,
  };
  ctx.clients = ctx.self.clients;
  vm.createContext(ctx);
  vm.runInContext(SW_CODE, ctx);
  return {
    ctx, handlers, caches, calls,
    fetchCount: url => calls.filter(u => u === url).length,
    /* số lần SW thử tải hộ ảnh (không tính request dò CSP của chính nó) */
    imgAttempts: () => calls.filter(u => u !== SW_URL).length,
    runActivate: () => handlers.activate && handlers.activate.forEach(fn => fn({ waitUntil() {} })),
  };
}

/* ---------- bắn một fetch event; undefined = SW đứng ngoài, trình duyệt tự tải ---------- */
function fire(handlers, request) {
  let out;
  (handlers.fetch || []).forEach(fn => fn({ request, respondWith(p) { out = p; } }));
  return out;
}
const imgReq = url => ({ url, method: 'GET', mode: 'no-cors', destination: 'image', headers: new Headers() });
const blocked = () => Promise.reject(new TypeError('Failed to fetch'));

(async () => {
  const out = {};

  /* ==== 1. CSP của sw.js MỞ (đúng như sau khi sửa _headers) ================== */
  {
    const sw = loadSW({ csp: CSP_SW });
    sw.runActivate();                                  /* SW dò CSP ngay khi kích hoạt */
    await wait(5);
    const r = await fire(sw.handlers, imgReq(cover));
    ok(r && r.status === 200, 'CSP mo: phai tai ho duoc bia (dang la ' + (r && r.status) + ')');
    ok(r && (r.headers.get('content-type') || '').indexOf('image/') === 0, 'CSP mo: phai tra dung kieu anh');
    await wait();
    const stored = sw.caches.stores.get('ssochuz-img') || new Map();
    ok(stored.has(cover), 'CSP mo: anh phai duoc luu vao kho offline ssochuz-img');
    const before = sw.calls.length;
    const r2 = await fire(sw.handlers, imgReq(cover));
    ok(r2 && r2.status === 200 && sw.calls.length === before, 'CSP mo: lan sau phai doc tu cache, khong goi mang');
    /* ảnh ở host khác cũng được tải hộ (đã biết chắc là được phép) */
    ok(fire(sw.handlers, imgReq(twimg)) !== undefined, 'CSP mo: host ngoai khac van tai ho binh thuong');
    out.cspMo = { status: r && r.status, cache: stored.size };
  }

  /* ==== 2. CSP của sw.js CHẶN host ngoài (bản deploy cũ) → không đứng ra nữa === */
  {
    const sw = loadSW({ csp: CSP_PAGE, image: blocked });
    sw.runActivate();
    await wait(5);
    ok(fire(sw.handlers, imgReq(cover)) === undefined, 'CSP chan: lan dau SW phai dung ngoai (de trinh duyet tai bia)');
    await wait(5);                                     /* chờ kết quả dò CSP */
    ok(fire(sw.handlers, imgReq(cover)) === undefined, 'CSP chan: khong duoc chan lai lan sau');
    ok(fire(sw.handlers, imgReq(twimg)) === undefined, 'CSP chan: host ngoai khac cung phai dung ngoai');
    ok(sw.imgAttempts() === 0, 'CSP chan: KHONG duoc thu fetch anh nao (dia chi console sach) khong goi ' + sw.imgAttempts() + ' lan');
    ok(sw.fetchCount(SW_URL) === 1, 'CSP chan: chi duoc do CSP mot lan moi lan SW khoi dong');
    /* ảnh cùng host của web vẫn do SW phục vụ (cache-first) */
    ok(fire(sw.handlers, imgReq(ownImg)) !== undefined, 'CSP chan: anh cung host van qua SW');
    out.cspChan = { imgAttempts: sw.imgAttempts(), probe: sw.fetchCount(SW_URL) };
  }

  /* ==== 3. Không đọc được CSP (mạng lỗi) → coi như chưa biết, để trình duyệt tải = */
  {
    const sw = loadSW({ csp: false, image: blocked });
    ok(fire(sw.handlers, imgReq(cover)) === undefined, 'chua biet CSP: phai de trinh duyet tai bia');
    await wait(5);
    ok(fire(sw.handlers, imgReq(cover2)) === undefined, 'chua biet CSP: khong duoc chan lai');
    ok(sw.imgAttempts() === 0, 'chua biet CSP: khong duoc thu fetch anh nao');
    ok(fire(sw.handlers, imgReq(ownImg)) !== undefined, 'chua biet CSP: anh cung host van qua SW');
  }

  /* ==== 4. Không có CSP (máy chủ xem thử trên máy) → tải hộ bình thường ======== */
  {
    const sw = loadSW({ csp: null });
    sw.runActivate();
    await wait(5);
    const r = await fire(sw.handlers, imgReq(cover));
    ok(r && r.status === 200, 'khong CSP: phai tai ho duoc bia');
  }

  /* ==== 5. Lớp chắn cuối: biết là được phép nhưng fetch vẫn bị chặn =========== */
  {
    const sw = loadSW({ csp: CSP_SW, image: blocked });
    sw.runActivate();
    await wait(5);
    const r = await fire(sw.handlers, imgReq(cover));
    ok(r && r.status === 302, 'bi chan bat ngo: phai tra 302 nhuong cho trinh duyet (dang la ' + (r && r.status) + ')');
    ok(r && r.headers.get('location') === cover, 'bi chan bat ngo: 302 phai tro ve dung URL anh');
    ok(r && String(r.headers.get('cache-control') || '').indexOf('no-store') >= 0, 'bi chan bat ngo: 302 phai no-store');
    const before = sw.imgAttempts();
    ok(fire(sw.handlers, imgReq(cover)) === undefined, 'bi chan bat ngo: lan hai khong duoc chan lai (tranh vong lap)');
    ok(fire(sw.handlers, imgReq(cover2)) === undefined, 'bi chan bat ngo: het tai ho cho host ngoai');
    ok(fire(sw.handlers, imgReq(twimg)) === undefined, 'bi chan bat ngo: host khac cung dung ngoai (cung CSP)');
    ok(sw.imgAttempts() === before, 'bi chan bat ngo: khong thu them fetch nao');
    ok(!(sw.caches.stores.get('ssochuz-img') || new Map()).has(cover), 'bi chan bat ngo: khong luu anh loi vao kho');
    out.biChanBatNgo = { status: r && r.status, attempts: sw.imgAttempts() };
  }

  /* ==== 6. Đang OFFLINE: nhớ riêng từng host, host khác vẫn thử ============== */
  {
    const sw = loadSW({ csp: CSP_SW, image: blocked, onLine: false });
    sw.runActivate();
    await wait(5);
    ok((await fire(sw.handlers, imgReq(cover))).status === 302, 'offline: van phai nhuong cho trinh duyet');
    ok(fire(sw.handlers, imgReq(cover)) === undefined, 'offline: host da nhớ, khong chan lai');
    ok(fire(sw.handlers, imgReq(twimg)) !== undefined, 'offline: host khac van phai duoc thu tai ho');
  }

  /* ==== 7. CDN trả trang HTML 200 (chặn hotlink) → KHÔNG lưu vào kho ảnh ===== */
  {
    const sw = loadSW({
      csp: CSP_SW,
      image: () => Promise.resolve(new Response('<html>blocked</html>',
        { status: 200, headers: { 'content-type': 'text/html' } })),
    });
    sw.runActivate();
    await wait(5);
    await fire(sw.handlers, imgReq(cover));
    await wait();
    ok(!(sw.caches.stores.get('ssochuz-img') || new Map()).has(cover), 'trang HTML 200 khong duoc luu vao kho anh');
  }

  /* ==== 8. Không phá các đường khác (trang, dữ liệu, request ghi) =========== */
  {
    const sw = loadSW({ csp: CSP_SW });
    const html = () => Promise.resolve(new Response('<html>ok</html>',
      { status: 200, headers: { 'content-type': 'text/html' } }));
    sw.ctx.fetch = (req, opt) => { sw.calls.push(String(req.url || req)); return html(); };
    const nav = { url: ORIGIN + '/', method: 'GET', mode: 'navigate', destination: 'document', headers: new Headers() };
    const r = await fire(sw.handlers, nav);
    ok(r && r.status === 200, 'chuyen trang: van phai tra HTML binh thuong');
    const data = { url: ORIGIN + '/data/registry.json', method: 'GET', mode: 'cors', destination: '', headers: new Headers() };
    ok(fire(sw.handlers, data) !== undefined, 'du lieu /data: van phai di qua SW (doc offline)');
    let writeOut;
    (sw.handlers.fetch || []).forEach(fn => fn({
      request: { url: ORIGIN + '/api/view', method: 'POST', mode: 'cors', destination: '', headers: new Headers() },
      respondWith(p) { writeOut = p; },
    }));
    ok(!!writeOut, 'POST /api/view: phai di qua SW de xoa cache API sau khi ghi');
  }

  console.log(JSON.stringify(Object.assign({ errors0: [], swKiemThu: out }, bad.length ? { loi: bad } : {}), null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch(e => {
  console.log(JSON.stringify({ errors0: ['bai kiem thu sw.js loi: ' + (e && e.stack || e)] }, null, 1));
  process.exit(1);
});
