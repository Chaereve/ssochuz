const {page, dataFetch} = require('./mk');
const assert = require('node:assert/strict');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const posts = [], fallback = dataFetch();
  const p = page('index.html', {
    fetch(url, options) {
      if (String(url).endsWith('/api/push-sub')) {
        posts.push({body: JSON.parse(options.body), headers: options.headers});
        return Promise.resolve({ok: true, json: async () => ({ok: true})});
      }
      return fallback(url, options);
    },
    setup(w) {
      w.supabase = {createClient: () => ({auth: {
        getSession: async () => ({data: {session: null}}),
        onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}})
      }})};
      w.Notification = {permission: 'granted'}; w.PushManager = function() {};
      const sub = {toJSON: () => ({endpoint: 'https://push.test/device', keys: {p256dh: 'test', auth: 'test'}})};
      Object.defineProperty(w.navigator, 'serviceWorker', {value: {ready: Promise.resolve({pushManager: {getSubscription: async () => sub}})}});
    }
  });
  await wait(800);
  const w = p.win;
  const a = w.CZ.lib()[0].slug;
  await w.CZPersonal.toggleFollow(a); await wait(300);
  assert.deepEqual(posts.at(-1).body.topics, [a]);
  assert.equal(posts.at(-1).body.scopeVersion, 2);
  assert.equal(posts.at(-1).body.account, false);
  let mode = 'server', topics = {a: 1};
  w.CZPersonal = {...w.CZPersonal, mode: () => mode, followMap: () => topics, isFollowing: () => true, newChapters: () => 0};
  w.CZ_AUTH.current = () => ({uid: 'user-a'});
  w.CZ_AUTH.getClient = async () => ({auth: {getSession: async () => ({data: {session: {access_token: 'test-only-access-token'}}})}});
  const emit = () => w.dispatchEvent(new w.CustomEvent('cz:personal', {detail: {type: 'ready'}}));
  emit(); await wait(300);
  assert.equal(posts.at(-1).body.account, true);
  assert.deepEqual(posts.at(-1).body.topics, ['a']);
  assert.equal(posts.at(-1).headers.authorization, 'Bearer test-only-access-token');
  const count = posts.length; emit(); await wait(300);
  assert.equal(posts.length, count, 'same scope not written repeatedly');
  topics = {b: 1}; emit(); await wait(300);
  assert.deepEqual(posts.at(-1).body.topics, ['b'], 'replace, not append follows');
  mode = 'guest'; topics = {}; emit(); await wait(300);
  assert.equal(posts.at(-1).body.account, false);
  assert.deepEqual(posts.at(-1).body.topics, [], 'logout clears account audience');
  assert.equal(posts.at(-1).headers.authorization, undefined);
  assert.deepEqual(p.errors, []);
  p.dom.window.close();
  console.log(JSON.stringify({errors0: [], checked: 'legacy device migration, guest and account scope, auth, unfollow, logout, dedup'}));
})().catch(e => {console.error(e); process.exit(1);});
