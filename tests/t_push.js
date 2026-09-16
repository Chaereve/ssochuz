/* ============================================================================
   Kiểm thử WEB PUSH "ra chương mới" (phía web + service worker)
   A. CZ_VAPID_PUBLIC_KEY đúng định dạng P-256 (65 bytes, đầu 0x04)
   B. Bấm "Theo dõi" → hiện modal hỏi bật thông báo
   C. Bấm "Bật thông báo" → subscribe + POST /api/push-sub đúng payload
   D. "Để sau" → 7 ngày không hỏi lại; từ chối quyền → không hỏi
   E. Bỏ follow truyện cuối → unsubscribe + POST remove:true
   F. sw.js: sự kiện push hiện đúng tiêu đề/nội dung; bấm vào mở đúng URL chương
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* trình duyệt giả có Web Push */
function pushSetup(w, o) {
  o = o || {};
  const st = { subscribed: null, unsubscribed: 0, asked: 0 };
  w.Notification = {
    permission: o.permission || 'default',
    requestPermission: function () { st.asked++; return Promise.resolve(o.grant === false ? 'denied' : 'granted'); },
  };
  w.PushManager = function () {};
  const sub = {
    endpoint: 'https://push.test/may-test',
    toJSON: function () {
      return { endpoint: 'https://push.test/may-test', keys: { p256dh: 'PX', auth: 'AX' } };
    },
    unsubscribe: function () { st.unsubscribed++; st.subscribed = null; return Promise.resolve(true); },
  };
  const pm = {
    getSubscription: function () { return Promise.resolve(st.subscribed); },
    subscribe: function (opts) {
      st.subOpts = opts;
      if (!opts || !opts.applicationServerKey || opts.applicationServerKey.length !== 65) {
        return Promise.reject(new Error('thiếu VAPID key'));
      }
      st.subscribed = sub;
      return Promise.resolve(sub);
    },
  };
  try {
    Object.defineProperty(w.navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: pm }) }, configurable: true,
    });
  } catch (e) { w.navigator.serviceWorker = { ready: Promise.resolve({ pushManager: pm }) }; }
  w.__push = st;
  return st;
}

(async () => {
  const out = {};
  /* ---------- A. VAPID key ---------- */
  const p0 = page('index.html', { fetch: dataFetch() });
  await wait(700);
  out.errors0 = p0.errors.slice(0, 5);
  const vk = String(p0.win.CZ_VAPID_PUBLIC_KEY || '');
  let vkRaw = null;
  try { vkRaw = Buffer.from(vk.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); } catch (e) {}
  ok(vkRaw && vkRaw.length === 65 && vkRaw[0] === 4, 'CZ_VAPID_PUBLIC_KEY phai la point P-256 (65 bytes, dau 04)');

  /* ---------- B+C. bấm Theo dõi → hỏi → bật → POST ---d----- */
  const log = [];
  const r = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    fetch: dataFetch({ log }),
    setup: (w) => pushSetup(w),
  });
  await wait(1300);
  const rdoc = r.doc, rwin = r.win;
  out.errors1 = r.errors.slice(0, 6);
  const heroBtn = rdoc.querySelector('#shero [data-followbtn="third-person"]');
  ok(heroBtn, 'thieu nut chuong hero de test push');
  if (heroBtn) {
    heroBtn.dispatchEvent(new rwin.MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(150);
    const modal = rdoc.querySelector('#czPush.on');
    ok(modal && /Bật thông báo chương mới/.test(modal.textContent), 'bam Theo doi phai hien modal hoi bat thong bao');
    const btn = rdoc.querySelector('#pushOk');
    ok(btn, 'modal thieu nut #pushOk');
    if (btn) {
      btn.dispatchEvent(new rwin.MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(250);
    }
  }
  const posts = log.filter(u => u.indexOf('POST') === 0 && u.indexOf('/api/push-sub') > 0);
  ok(posts.length === 1, 'bat thong bao phai POST /api/push-sub 1 lan (thay: ' + JSON.stringify(posts) + ')');
  ok(rwin.__push && rwin.__push.subscribed, 'PushManager.subscribe chua duoc goi');
  ok(rwin.__push && rwin.__push.subOpts && rwin.__push.subOpts.userVisibleOnly === true, 'subscribe thieu userVisibleOnly');

  /* ---------- D. Để sau → 7 ngày không hỏi; denied → không hỏi ---------- */
  const r2 = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/beauty-and-bike/',
    fetch: dataFetch(),
    setup: (w) => pushSetup(w),
  });
  await wait(1300);
  r2.win.localStorage.setItem('ssochuz-push-ask', JSON.stringify(Date.now()));
  r2.win.CZ.followPushHook(true);
  await wait(150);
  ok(!r2.doc.querySelector('#czPush.on'), 'vua bam De sau thi 7 ngay khong duoc hoi lai');
  const r3 = page('index.html', { fetch: dataFetch(), setup: (w) => pushSetup(w, { permission: 'denied' }) });
  await wait(700);
  r3.win.CZ.followPushHook(true);
  await wait(150);
  ok(!r3.doc.querySelector('#czPush.on'), 'quyen denied thi khong duoc hoi');

  /* ---------- E. bỏ follow cuối → huỷ đăng ký ---------- */
  const log5 = [];
  const r5 = page('index.html', {
    fetch: dataFetch({ log: log5 }),
    setup: (w) => {
      const st = pushSetup(w, { permission: 'granted' });
      /* giả đã đăng ký push từ trước */
      const old = w.navigator.serviceWorker.ready;
      void old;
      st.subscribed = {
        endpoint: 'https://push.test/may-test',
        toJSON: function () { return { endpoint: 'https://push.test/may-test', keys: {} }; },
        unsubscribe: function () { st.unsubscribed++; st.subscribed = null; return Promise.resolve(true); },
      };
    },
  });
  await wait(700);
  r5.win.localStorage.setItem('ssochuz-follow', JSON.stringify({}));
  await r5.win.CZ.followPushHook(false);
  await wait(250);
  ok(r5.win.__push.unsubscribed === 1, 'bo follow cuoi phai unsubscribe push');
  ok(log5.some(u => u.indexOf('POST') === 0 && u.indexOf('/api/push-sub') > 0), 'huỷ push phai POST remove ve server');

  /* ---------- F. service worker: push + click ---------- */
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const handlers = {};
  const shown = [];
  let opened = '';
  const fakeSelf = {
    location: { origin: 'https://ssochuz.pages.dev' },
    registration: { showNotification: function (t, o) { shown.push({ t, o }); return Promise.resolve(); } },
    addEventListener: function (ev, fn) { handlers[ev] = fn; },
  };
  const fakeClients = {
    matchAll: function () { return Promise.resolve([]); },
    openWindow: function (u) { opened = u; return Promise.resolve({}); },
  };
  const runSW = new Function('self', 'clients', 'caches', 'fetch', 'URL', 'Response', 'Request', 'console',
    swSrc + '\n;return self;');
  runSW(fakeSelf, fakeClients, {}, function () {}, URL, Response, Request, console);
  ok(handlers.push && handlers.notificationclick, 'sw.js thieu handler push/notificationclick');
  if (handlers.push) {
    let waited = null;
    handlers.push({
      data: { json: () => ({ title: '📖 Truyện Push', body: 'Chương 3: Tin vui đã ra mắt!', url: 'https://ssochuz.pages.dev/truyen/x/chuong-3/', tag: 'chuong-moi-x-3' }) },
      waitUntil: function (p) { waited = p; },
    });
    await waited;
    ok(shown.length === 1 && shown[0].t === '📖 Truyện Push', 'push phai hien dung tieu de (thay: ' + JSON.stringify(shown.map(s => s.t)) + ')');
    ok(shown[0] && shown[0].o.body === 'Chương 3: Tin vui đã ra mắt!', 'push phai hien dung noi dung');
    ok(shown[0] && shown[0].o.data.url === 'https://ssochuz.pages.dev/truyen/x/chuong-3/', 'push phai giu URL chuong');
  }
  if (handlers.notificationclick) {
    let waited2 = null;
    handlers.notificationclick({
      notification: { close: function () {}, data: { url: 'https://ssochuz.pages.dev/truyen/x/chuong-3/' } },
      waitUntil: function (p) { waited2 = p; },
    });
    await waited2;
    ok(opened === 'https://ssochuz.pages.dev/truyen/x/chuong-3/', 'bam thong bao phai mo dung URL chuong (thay: ' + opened + ')');
  }
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
