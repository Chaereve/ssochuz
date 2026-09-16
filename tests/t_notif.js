/* ============================================================================
   Kiểm thử TRUNG TÂM THÔNG BÁO (chuông ở đầu trang) + modal push mới
   - chuông hiện tổng số chương mới của truyện đã follow, bấm mở panel liệt kê
   - bấm ngoài / Esc đóng panel; mở truyện (markFollowSeen) thì tắt số
   - chưa follow gì → không badge, panel báo "Chưa có chương mới"
   - modal hỏi bật push có giao diện mới (.pushbox + icon + 3 lợi ích)
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};
  /* ---------- chuông + badge + panel ---------- */
  const p = page('index.html', { fetch: dataFetch() });
  const { win, doc, errors } = p;
  const CZ = win.CZ;
  await wait(900);
  out.errors0 = errors.slice(0, 5);
  const btn = doc.querySelector('#czNotifBtn');
  const dot = doc.querySelector('#czNotifCount');
  const menu = doc.querySelector('#czNotifMenu');
  ok(btn && dot && menu, 'header thieu chuong thong bao (#czNotifBtn/#czNotifCount/#czNotifMenu)');
  ok(dot && dot.hasAttribute('hidden'), 'chua follow gi thi badge phai an');
  /* giả đã follow 1 truyện từ trước, mốc cũ, registry tăng 2 chương */
  const slug = doc.querySelector('#grid .cardwrap [data-t]').getAttribute('href').split('/').filter(Boolean).pop();
  const n = CZ.findLib(slug);
  win.localStorage.setItem('ssochuz-follow', JSON.stringify({ [slug]: n.chapters }));
  n.chapters += 2;
  CZ.refreshFollowUI(slug);
  await wait(60);
  ok(dot && !dot.hasAttribute('hidden') && dot.textContent === '2', 'co 2 chuong moi thi badge phai hien "2" (thay: ' + (dot && dot.textContent) + ')');
  ok(btn.classList.contains('hasnew'), 'nut chuong phai co class hasnew khi co tin');
  ok(btn.getAttribute('aria-label').includes('2 chương chưa đọc'), 'aria-label phai doc so tin (thay: ' + btn.getAttribute('aria-label') + ')');
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(60);
  ok(menu.classList.contains('on') && btn.getAttribute('aria-expanded') === 'true', 'bam chuong phai mo panel');
  const item = menu.querySelector('a[role="menuitem"]');
  ok(item && item.textContent.includes(n.title), 'panel phai liet ke ten truyen');
  ok(item && item.textContent.includes('2 chương mới'), 'panel phai ghi "2 chương mới"');
  ok(item && item.getAttribute('href') === CZ.storyURL(slug), 'bam item phai sang trang truyen (thay: ' + (item && item.getAttribute('href')) + ')');
  /* bấm ra ngoài → đóng; mở lại + Esc → đóng */
  doc.body.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(60);
  ok(!menu.classList.contains('on'), 'bam ra ngoai phai dong panel');
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(60);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(60);
  ok(!menu.classList.contains('on'), 'bam Esc phai dong panel');
  /* mở truyện → tắt số */
  CZ.markFollowSeen(slug);
  await wait(60);
  ok(dot.hasAttribute('hidden'), 'mo truyen (markFollowSeen) thi badge phai tat');
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(60);
  ok(/Chưa có chương mới/.test(menu.textContent), 'het tin thi panel phai bao "Chua co chuong moi"');

  /* ---------- modal push giao diện mới ---------- */
  const r = page('index.html', {
    fetch: dataFetch(),
    setup: (w) => {
      w.Notification = { permission: 'default', requestPermission: () => Promise.resolve('granted') };
      w.PushManager = function () {};
      const pm = { getSubscription: () => Promise.resolve(null), subscribe: () => Promise.reject(new Error('x')) };
      try {
        Object.defineProperty(w.navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager: pm }) }, configurable: true });
      } catch (e) { w.navigator.serviceWorker = { ready: Promise.resolve({ pushManager: pm }) }; }
    },
  });
  await wait(900);
  out.errors1 = r.errors.slice(0, 5);
  r.win.CZ.followPushHook(true);
  await wait(200);
  const m = r.doc.querySelector('#czPush.on');
  ok(m, 'followPushHook phai mo modal push');
  ok(m && m.querySelector('.pushbox .pushic svg'), 'modal push phai co icon chuong .pushic');
  ok(m && m.querySelectorAll('.pushbox li').length === 3, 'modal push phai liet ke 3 loi ich');
  ok(m && m.querySelector('#pushOk'), 'modal push phai co nut #pushOk');
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
