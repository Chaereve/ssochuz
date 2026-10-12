/* ============================================================================
   Cloudflare D1-backed virtual bricks: only ongoing public stories, no coins,
   payment or local action database; one free brick/account/story/UTC day.
   ========================================================================== */
const { page, dataFetch, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
const BASE = 'https://cms.test';
const RUN = 'co-vo-ho-danh-da-cua-toi';
const DONE = 'third-person';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const J = (body, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
function makeApi(route, options = {}) {
  if (route === '/api/registry') return J(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8')));
  const book = route.match(/^\/api\/book\/([^/?]+)/);
  if (book) {
    const file = path.join(ROOT, 'data/book', decodeURIComponent(book[1]) + '.json');
    return fs.existsSync(file) ? J(JSON.parse(fs.readFileSync(file, 'utf8'))) : J({ ok: false }, false, 404);
  }
  if (route === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
  if (route === '/api/schedule') return J({ items: [] });
  return undefined;
}
function supabaseStub(w) {
  w.supabase = { createClient() { return { auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } }; } };
}
function fakeCommunity() {
  const records = Object.create(null), calls = [];
  let uid = 'reader-a';
  const key = slug => slug;
  return {
    calls,
    service: {
      uid: () => uid,
      mode: () => 'server',
      communityRequest(route, body, options) {
        calls.push({ route, body: { ...body }, options: options || {}, uid });
        const row = records[key(body.storyId)] || (records[key(body.storyId)] = { total: 0, given: Object.create(null) });
        if (body.action === 'give') {
          if (row.given[uid]) {
            const error = new Error('Bạn đã góp gạch cho truyện này hôm nay.');
            error.status = 409; error.data = { ok: false, total: row.total, givenToday: true };
            return Promise.reject(error);
          }
          row.total += 1; row.given[uid] = true;
          return Promise.resolve({ ok: true, added: true, total: row.total, givenToday: true });
        }
        return Promise.resolve({ ok: true, total: row.total, givenToday: !!row.given[uid] });
      },
    },
    otherUser() { uid = 'reader-b'; },
  };
}

(async () => {
  const out = { errors0: [] };
  const err = message => out.errors0.push(message);
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + RUN + '/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi, log: [] }),
    setup: supabaseStub,
    css: true,
  });
  await wait(1600);
  const box = p.doc.querySelector('#storyBrick');
  if (!box || box.hidden) err('truyện đang ra chương phải hiện hộp góp gạch');
  if (!box) { console.log(JSON.stringify(out, null, 1)); process.exit(1); }
  const send = box.querySelector('#bkSend');
  const bar = box.querySelector('[data-bk-bar]');
  if (!send || !/miễn phí/i.test(send.textContent)) err('CTA cần ghi rõ gạch ảo miễn phí');
  if (!bar || bar.getAttribute('role') !== 'progressbar' || bar.getAttribute('aria-valuemin') !== '0') err('progress bar phải accessible');
  if (!/miễn phí|không thanh toán|không quà/i.test(box.textContent)) err('phải nói rõ không có thanh toán/coin/quà quy đổi');
  const image = send && send.querySelector('img');
  if (!image || !image.src.includes('/stickers/sso/full/sso-brick.webp')) err('gạch dùng full asset sso-brick');
  if (send && p.win.getComputedStyle(send).minHeight !== '48px') err('nút góp gạch phải có touch target tối thiểu 44px');

  const community = fakeCommunity();
  p.win.CZPersonal = community.service;
  await p.win.CZBrick.pull(RUN, box);
  await wait(10);
  const firstTotal = Number(box.querySelector('[data-bk-total]').textContent.replace(/\./g, ''));
  if (firstTotal !== 0) err('aggregate mới phải hiển thị đúng 0, không giả lập/seed local');
  const sfx = [];
  const realSfx = p.win.CZ.sfx;
  p.win.CZ.sfx = kind => sfx.push(kind);
  if (sfx.length) err('không autoplay âm thanh khi nạp trang');
  send.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(40);
  const after = Number(box.querySelector('[data-bk-total]').textContent.replace(/\./g, ''));
  if (after !== firstTotal + 1 || !box.querySelector('#bkSend').disabled) err('server success phải cộng một viên và khóa nút trong ngày');
  if (!box.querySelector('[data-bk-drop].go') && !box.querySelector('[data-bk-pile].bump')) err('sau xác nhận mới chạy animation gạch');
  if (!sfx.length) err('âm thanh chỉ phát sau thao tác người dùng/server success');
  if (!community.calls.some(call => call.route === '/api/community/brick' && call.body.action === 'give' && call.body.storyId === RUN && call.options.requireAuth)) {
    err('nút phải gửi POST /api/community/brick có yêu cầu JWT Supabase');
  }
  const actionKeys = [];
  for (let i = 0; i < p.win.localStorage.length; i++) {
    const k = p.win.localStorage.key(i) || '';
    if (/ssochuz:(community-bricks|brick)/.test(k)) actionKeys.push(k);
  }
  if (actionKeys.length) err('không ghi gạch/aggregate vào localStorage');

  // Per-user view is fetched from D1; account B should not inherit A's daily flag.
  community.otherUser();
  await p.win.CZBrick.pull(RUN, box);
  if (box.querySelector('#bkSend').disabled) err('account B không được thừa hưởng givenToday của account A');
  box.querySelector('#bkSend').dispatchEvent(new p.win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(40);
  if (Number(box.querySelector('[data-bk-total]').textContent.replace(/\./g, '')) !== 2) err('user B được phép góp một viên độc lập');

  // Existing UI stays silent/hidden for a completed book.
  const done = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + DONE + '/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi, log: [] }),
    setup: supabaseStub,
  });
  await wait(1500);
  const completedBox = done.doc.querySelector('#storyBrick');
  if (completedBox && !completedBox.hidden) err('truyện hoàn thành không được hiện hộp góp gạch');
  if (completedBox && completedBox.innerHTML.trim()) err('truyện hoàn thành không được dựng nội dung hộp gạch');

  p.win.CZ.sfx = realSfx;
  if (p.errors.length || done.errors.length) out.errors0.push(...p.errors, ...done.errors);
  console.log(JSON.stringify({ ...out, communityCalls: community.calls.length, actionKeys }, null, 1));
  p.dom.window.close(); done.dom.window.close();
  process.exit(out.errors0.length ? 1 : 0);
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
