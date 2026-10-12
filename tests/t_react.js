/* ============================================================================
   Reaction sticker community client contract (Cloudflare Worker + D1).
   Verifies quick set/assets/accessibility, server-backed toggle, no local action
   storage, account scoping, chapter scoping, popover, reduced-motion and setting.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, dataFetch, ROOT } = require('./mk');
const BASE = 'https://cms.test';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const J = (body, ok = true, status = 200) => Promise.resolve({
  ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)),
});
function makeApi(log) {
  return (route, options = {}) => {
    log.push({ route, options });
    if (route === '/api/registry') return J(require('../data/registry.json'));
    const book = route.match(/^\/api\/book\/([^/?]+)/);
    if (book) {
      const file = path.join(ROOT, 'data/book', decodeURIComponent(book[1]) + '.json');
      return fs.existsSync(file) ? J(JSON.parse(fs.readFileSync(file, 'utf8'))) : J({ ok: false }, false, 404);
    }
    if (route === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    if (route === '/api/schedule') return J({ items: [] });
    if (route === '/api/health') return J({ ok: true, version: '1.20.0' });
    if (route === '/api/view' && options.method === 'POST') return J({ ok: true, counted: false });
    return undefined;
  };
}
function serverFor() {
  const rows = Object.create(null);
  const calls = [];
  let uid = 'reader-a';
  function key(story, chapter) { return story + '#' + chapter; }
  return {
    calls,
    uid(value) { if (value !== undefined) uid = value; return uid; },
    service: {
      uid: () => uid,
      mode: () => 'server',
      communityRequest(route, body) {
        calls.push({ route, body: JSON.parse(JSON.stringify(body || {})), uid });
        const k = key(body.storyId, Number(body.chapterIndex || 0));
        const state = rows[k] || (rows[k] = { totals: Object.create(null), mine: Object.create(null) });
        const mine = state.mine[uid] || (state.mine[uid] = new Set());
        if (body.action === 'toggle') {
          const active = !mine.has(body.stickerId);
          if (active) { mine.add(body.stickerId); state.totals[body.stickerId] = (state.totals[body.stickerId] || 0) + 1; }
          else { mine.delete(body.stickerId); state.totals[body.stickerId] = Math.max(0, (state.totals[body.stickerId] || 0) - 1); }
          return Promise.resolve({ ok: true, storyId: body.storyId, chapterIndex: Number(body.chapterIndex), stickerId: body.stickerId,
            active, totals: { ...state.totals }, mine: [...mine] });
        }
        return Promise.resolve({ ok: true, storyId: body.storyId, chapterIndex: Number(body.chapterIndex),
          totals: { ...state.totals }, mine: [...mine] });
      },
    },
  };
}
function supabaseStub(w) {
  w.supabase = { createClient() { return { auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } }; } };
}

(async () => {
  const out = { errors0: [] };
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-1/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi([]), log: [] }),
    setup: supabaseStub,
  });
  const { win, doc } = p;
  const $ = selector => doc.querySelector(selector);
  const $$ = selector => [...doc.querySelectorAll(selector)];
  await wait(1500);
  const store = serverFor();
  win.CZPersonal = store.service;
  const bar = $('#rdReact');
  if (!bar) { out.errors0.push('không thấy #rdReact ở cuối chương'); console.log(JSON.stringify(out, null, 1)); process.exit(1); }
  const ctx = bar.__rxCtx || { slug: 'third-person', ch: 1, label: 'Chương 1' };
  await win.CZReact.pull({ slug: 'third-person', ch: 1 });
  win.CZReact.mount(bar, ctx);

  const stickers = $$('#rdReact .rx');
  out.soSticker = stickers.length;
  if (stickers.length !== win.CZReact.REACTIONS.length || win.CZReact.QUICK_REACTIONS.length !== 6) out.errors0.push('khung cảm xúc phải hiện đầy đủ ' + win.CZReact.REACTIONS.length + ' sticker trong registry');
  const first = stickers[0];
  const id = first && first.getAttribute('data-rx');
  const image = first && first.querySelector('img.rx-img');
  out.asset = image && image.getAttribute('src');
  if (!first || first.tagName !== 'BUTTON' || !first.getAttribute('aria-label') || first.getAttribute('aria-pressed') !== 'false') {
    out.errors0.push('quick reaction phải là button có accessible label/aria-pressed');
  }
  if (!image || !/\/stickers\/sso\/full\/.*\.webp$/.test(image.src)) out.errors0.push('quick reaction phải dùng asset full WebP');
  if (image && !fs.existsSync(path.join(ROOT, image.getAttribute('src').replace(/^\//, 'public/')))) out.errors0.push('thiếu asset full: ' + image.src);
  if (image && !['lazy', 'eager'].includes(image.getAttribute('loading'))) out.errors0.push('ảnh quick sticker phải có loading policy');

  const before = parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10);
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(25);
  const after = parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10);
  out.afterToggle = { before, after, mine: first.getAttribute('aria-pressed'), endpoint: store.calls[store.calls.length - 1] };
  if (after !== before + 1 || first.getAttribute('aria-pressed') !== 'true') out.errors0.push('sau phản hồi Worker, toggle phải cập nhật count + aria state');
  if (!store.calls.some(call => call.route === '/api/community/reactions' && call.body.action === 'toggle' && call.body.storyId === 'third-person' && call.body.chapterIndex === 1 && call.body.stickerId === id)) {
    out.errors0.push('reaction toggle phải POST story/chapter/sticker tới endpoint Worker');
  }
  if ($$('#czFx .czfx-p').length > 20) out.errors0.push('animation bị giới hạn hạt, không vượt quá 20 hạt/lượt');

  // Action history is never mirrored to localStorage.
  const actionKeys = [];
  for (let i = 0; i < win.localStorage.length; i++) {
    const key = win.localStorage.key(i) || '';
    if (/ssochuz:(community-reactions|react|community-bricks|brick)/.test(key)) actionKeys.push(key);
  }
  if (actionKeys.length) out.errors0.push('reaction/brick action không được lưu localStorage: ' + actionKeys.join(','));

  // Cooldown prevents repeated taps before allowing an actual toggle-off.
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(20);
  if (parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10) !== after) out.errors0.push('cooldown phải chặn tap lặp ngay lập tức');
  await wait(450);
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(30);
  if (first.getAttribute('aria-pressed') !== 'false' || parseInt(first.querySelector('.rx-ct').textContent.replace(/\./g, ''), 10) !== before) {
    out.errors0.push('toggle lần hai phải bỏ reaction, giảm aggregate đúng một');
  }

  // Account-specific votes and chapter-specific state.
  await win.CZReact.pull({ slug: 'third-person', ch: 1 });
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(30);
  store.uid('reader-b');
  await win.CZReact.pull({ slug: 'third-person', ch: 1 });
  win.CZReact.mount(bar, ctx);
  if (win.CZReact.isMine('third-person', 1, id)) out.errors0.push('reaction của reader A không được hiện thành reaction của reader B');
  store.uid('reader-a');
  await win.CZReact.pull({ slug: 'third-person', ch: 2 });
  if (win.CZReact.isMine('third-person', 2, id)) out.errors0.push('reaction phải được tách theo chapter');

  // Full reaction popover and setting toggle remain keyboard-capable.
  const allButton = $('#rxAll');
  allButton && allButton.click();
  await wait(50);
  const pop = $('#czReactBox');
  if (!pop || pop.querySelectorAll('.pop-rx').length !== win.CZStickers.length) out.errors0.push('popover phải liệt kê toàn bộ sticker từ registry');
  const popImage = pop && pop.querySelector('.pop-rx img');
  if (popImage && !popImage.src.includes('/stickers/sso/thumb/')) out.errors0.push('popover phải dùng thumbnail');
  const close = pop && pop.querySelector('[data-close]'); close && close.click();

  $('#rdSet') && $('#rdSet').click();
  await wait(80);
  const off = $('#setBody [data-set="react"][data-v="0"]');
  off && off.click();
  await wait(50);
  if (!bar.hidden || bar.querySelectorAll('.rx').length) out.errors0.push('Cài đặt phải có thể tắt reaction');
  const on = $('#setBody [data-set="react"][data-v="1"]');
  on && on.click();
  await wait(50);
  if (bar.hidden || bar.querySelectorAll('.rx').length !== win.CZReact.REACTIONS.length) out.errors0.push('bật lại phải dựng đủ ' + win.CZReact.REACTIONS.length + ' reaction');

  const reduced = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-1/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi([]), log: [] }),
    setup(w) {
      supabaseStub(w);
      w.matchMedia = q => ({ matches: /reduced-motion/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    },
  });
  await wait(1500);
  reduced.win.CZPersonal = serverFor().service;
  const rb = reduced.doc.querySelector('#rdReact');
  if (rb && rb.querySelector('.rx')) {
    const button = rb.querySelector('.rx');
    button.dispatchEvent(new reduced.win.MouseEvent('click', { bubbles: true }));
    await wait(25);
    if (!reduced.win.CZ.reduce) out.errors0.push('test must enable prefers-reduced-motion');
    if (reduced.doc.querySelectorAll('#czFx .czfx-p').length) out.errors0.push('reduced-motion không được dựng animation particle');
  }

  if (p.errors.length || reduced.errors.length) out.errors0.push(...p.errors, ...reduced.errors);
  console.log(JSON.stringify({ ...out, localActionKeys: actionKeys, calls: store.calls.length }, null, 1));
  p.dom.window.close(); reduced.dom.window.close();
  process.exit(out.errors0.length ? 1 : 0);
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
