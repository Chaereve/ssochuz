// No real network: exercise the shipped bundle, request coalescing, auth state and offline.
const { page, dataFetch } = require('./mk');
const assert = require('node:assert/strict');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const base = dataFetch(); let complete, calls = 0;
  const p = page('index.html', {
    fetch: (url, opts) => {
      if (String(url).endsWith('/api/registry') && opts?.cache === 'no-store') {
        calls++;
        return new Promise(resolve => { complete = resolve; });
      }
      return base(url, opts);
    },
    setup(w) {
      w.supabase = { createClient: () => ({ auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      } }) };
    }
  });
  const {win: w, doc: d} = p;
  await wait(850);
  const a = w.CZ.lib()[0], b = w.CZ.lib()[1];
  await w.CZPersonal.toggleFollow(a.slug);
  const registry = { lib: JSON.parse(JSON.stringify(w.CZ.lib())) };
  registry.lib.find(n => n.slug === a.slug).chapters += 2;
  registry.lib.find(n => n.slug === b.slug).chapters += 3;
  const button = d.querySelector('#czNotifBtn'), menu = d.querySelector('#czNotifMenu');
  button.click();
  assert.match(menu.textContent, /Đang tải/);
  assert.doesNotMatch(menu.textContent, /Chưa có chương mới/);
  button.click(); button.click();
  Object.defineProperty(d, 'hidden', { configurable: true, value: false });
  d.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(calls, 1, 'concurrent clicks and tab return must coalesce');
  complete({ok: true, json: async () => registry}); await wait(50);
  assert.equal(d.querySelector('#czNotifCount').textContent, '2');
  assert.match(menu.textContent, new RegExp(a.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(menu.querySelectorAll('a').length, 1, 'B is not followed');
  assert.doesNotMatch(menu.textContent, /chưa đọc/);
  d.dispatchEvent(new w.Event('visibilitychange')); await wait(20);
  assert.equal(calls, 1, '60 second throttle');
  const realNow = w.Date.now;
  w.Date.now = () => realNow() + 61000;
  d.dispatchEvent(new w.Event('visibilitychange'));
  assert.equal(calls, 2, 'tab return after cooldown refreshes');
  complete({ok: false}); await wait(50);
  assert.match(menu.textContent, /Không tải được/);
  assert.doesNotMatch(menu.textContent, /Chưa có chương mới/);
  // Offline doesn't contact API or convert failure to an empty inbox.
  w.Date.now = () => realNow() + 122000;
  Object.defineProperty(w.navigator, 'onLine', {configurable: true, value: false});
  d.dispatchEvent(new w.Event('visibilitychange')); await wait(50);
  assert.equal(calls, 2);
  assert.match(menu.textContent, /Không tải được/);
  // Logged-in follows use account service, not guest localStorage.
  w.CZPersonal = {...w.CZPersonal, mode: () => 'server', followMap: () => ({[b.slug]: b.chapters}),
    isFollowing: slug => slug === b.slug, newChapters: (slug, total) => total - b.chapters};
  w.dispatchEvent(new w.CustomEvent('cz:personal', {detail: {type: 'ready'}}));
  assert.equal(menu.querySelectorAll('a').length, 1);
  assert.equal(menu.querySelector('a').getAttribute('href'), w.CZ.storyURL(b.slug));
  w.CZPersonal.mode = () => 'error';
  w.dispatchEvent(new w.CustomEvent('cz:personal', {detail: {type: 'error'}}));
  assert.match(menu.textContent, /Không tải được/);
  assert.equal(menu.querySelectorAll('a').length, 0, 'no guest leak on account error');
  assert.deepEqual(p.errors, []);
  p.dom.window.close();
  console.log(JSON.stringify({errors0: [], checked: 'refresh, throttle, coalescing, guest/account A/B, offline, auth failure'}));
})().catch(e => { console.error(e); process.exit(1); });
