/* ============================================================================
   Dữ liệu cá nhân: Supabase RLS + cache khách có phiên bản
   - server row mới hơn luôn thắng guest/cache cũ
   - guest-only/newer row được gộp sau login; kho guest được dọn sau khi commit
   - upsert tiến độ được debounce theo UID/truyện (không ghi mỗi scroll)
   - chuyển tài khoản/logout không trộn dữ liệu giữa UID
   - communityRequest dùng Supabase access_token; TOC được gửi theo lô ≤20
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const now = Date.now();
const iso = (n) => new Date(n).toISOString();
const bad = [];
const ok = (cond, message) => { if (!cond) bad.push(message); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class Query {
  constructor(client, table) { this.client = client; this.table = table; this.op = 'select'; this.filters = []; this.payload = null; this.options = {}; }
  select() { this.op = 'select'; return this; }
  insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
  upsert(payload, options) { this.op = 'upsert'; this.payload = payload; this.options = options || {}; return this; }
  delete() { this.op = 'delete'; return this; }
  update(payload) { this.op = 'update'; this.payload = payload; return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async execute() {
    const tableRows = this.client.db[this.table];
    if (!tableRows) return { data: null, error: { message: 'unknown table ' + this.table } };
    const actor = this.client.authState.user && this.client.authState.user.uid;
    const matches = row => row.user_id === actor && this.filters.every(([key, value]) => row[key] === value);
    if (this.op === 'select') return { data: tableRows.filter(matches).map(row => ({ ...row })), error: null };
    const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).filter(Boolean);
    if (incoming.some(row => row.user_id !== actor)) return { data: null, error: { message: 'row-level security violation' } };
    if (this.op === 'insert' || this.op === 'upsert') {
      for (const row of incoming) {
        const conflict = tableRows.find(old => old.user_id === row.user_id && old.story_id === row.story_id);
        if (conflict) {
          if (this.op === 'upsert' && !this.options.ignoreDuplicates) {
            const incomingAt = Date.parse(row.updated_at || '') || 0;
            const currentAt = Date.parse(conflict.updated_at || '') || 0;
            if (this.table !== 'reading_progress' || incomingAt > currentAt) Object.assign(conflict, row);
          }
        } else tableRows.push({ ...row });
        this.client.writes.push({ table: this.table, op: this.op, row: { ...row }, options: this.options });
      }
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      tableRows.filter(matches).forEach(row => Object.assign(row, this.payload));
      this.client.writes.push({ table: this.table, op: this.op, filters: this.filters.slice(), row: { ...this.payload } });
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      const keep = tableRows.filter(row => !matches(row));
      this.client.db[this.table].splice(0, tableRows.length, ...keep);
      this.client.writes.push({ table: this.table, op: this.op, filters: this.filters.slice() });
      return { data: null, error: null };
    }
    return { data: null, error: { message: 'unknown operation ' + this.op } };
  }
}

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.ssochuz.invalid/', runScripts: 'dangerously' });
  const w = dom.window;
  const uidA = 'user-a';
  const uidB = 'user-b';
  const authState = { user: { uid: uidA } };
  const client = {
    db: {
      story_follows: [{ user_id: uidA, story_id: 'server-follow', last_seen_chapter_index: 20, created_at: iso(now - 120000), last_seen_at: iso(now - 5000) }],
      reading_progress: [{ user_id: uidA, story_id: 'server-progress', chapter_id: 'ch-8', chapter_index: 8, scroll_percent: 45, completed_at: null, updated_at: iso(now - 5000) }],
    },
    writes: [],
    authState,
    auth: { getSession: () => Promise.resolve({
      data: { session: authState.user ? { user: { id: authState.user.uid }, access_token: 'header.payload.signature' } : null }, error: null
    }) },
    from(table) { return new Query(this, table); },
  };
  const listeners = [];
  w.CZ = {
    API: 'https://worker.test',
    findLib: slug => ({ slug, chapters: 50 }),
    toast() {},
  };
  w.CZ_AUTH = {
    current: () => authState.user,
    state: () => authState.user ? 'in' : 'out',
    whenSettled: () => Promise.resolve(authState.user),
    onAuth(fn) { listeners.push(fn); fn(authState.user); return fn; },
    getClient: () => Promise.resolve(client),
    token: () => 'worker-session-not-for-community',
  };

  const guestProgress = [
    { storyId: 'server-progress', chapterIndex: 99, scrollPercent: 90, updatedAt: iso(now - 60000) },
    { storyId: 'guest-new-progress', chapterIndex: 3, scrollPercent: 27, updatedAt: iso(now - 1000) },
  ];
  const guestFollows = [
    { storyId: 'server-follow', lastSeenChapterIndex: 2, createdAt: iso(now - 60000), lastSeenAt: iso(now - 60000) },
    { storyId: 'guest-new-follow', lastSeenChapterIndex: 1, createdAt: iso(now - 1000), lastSeenAt: iso(now - 1000) },
  ];
  w.localStorage.setItem('ssochuz:progress:v1', JSON.stringify(guestProgress));
  w.localStorage.setItem('ssochuz:follows:v1', JSON.stringify(guestFollows));
  w.localStorage.setItem('ssochuz:progress-cache:user-a:v1', JSON.stringify([
    { storyId: 'server-progress', chapterIndex: 1, scrollPercent: 0, updatedAt: iso(now - 120000) },
  ]));

  const fetchLog = [];
  w.fetch = (url, options = {}) => {
    fetchLog.push({ url: String(url), options });
    let body = { ok: true, items: [] };
    try {
      const parsed = JSON.parse(options.body || '{}');
      if (String(url).includes('/api/community/tocs')) body.items = (parsed.storyIds || []).map(storyId => ({ storyId, chapterCount: 4, chapters: [] }));
    } catch (_) {}
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };

  w.eval(fs.readFileSync(path.join(ROOT, 'cz-personal.js'), 'utf8'));
  const personal = w.CZPersonal;
  await personal.whenReady();
  await wait(20);

  ok(personal.mode() === 'server' && personal.uid() === uidA, 'đăng nhập phải chuyển service sang chế độ server đúng UID');
  ok(personal.progressFor('server-progress').chapterIndex === 8, 'progress server mới hơn phải thắng cache/local dù local có số chương cao hơn');
  ok(personal.progressFor('guest-new-progress').chapterIndex === 3, 'progress guest chưa có trên server phải được gộp');
  ok(personal.isFollowing('server-follow') && personal.newChapters('server-follow', 25) === 5,
    'follow server hiện hữu phải giữ mốc server (20), không bị guest baseline cũ (2) ghi đè');
  ok(personal.isFollowing('guest-new-follow'), 'follow guest mới phải được gộp vào server');
  ok(client.db.story_follows.find(row => row.user_id === uidA && row.story_id === 'server-follow').last_seen_chapter_index === 20,
    'merge follow không được sửa row đã có trên server');
  ok(client.db.reading_progress.find(row => row.user_id === uidA && row.story_id === 'guest-new-progress'),
    'guest progress mới phải được upsert với user_id lấy từ phiên hiện hành');
  ok(!w.localStorage.getItem('ssochuz:progress:v1') && !w.localStorage.getItem('ssochuz:follows:v1'),
    'chỉ dọn guest cache sau khi merge và đọc lại thành công');

  /* Một loạt scroll/đổi vị trí trong cùng 650 ms chỉ ghi trạng thái mới nhất. */
  const beforeProgressWrites = client.writes.filter(row => row.table === 'reading_progress').length;
  personal.setProgress('debounced-story', 1, 10, false);
  personal.setProgress('debounced-story', 1, 45, false);
  personal.setProgress('debounced-story', 2, 12, false);
  await wait(850);
  const progressWrites = client.writes.filter(row => row.table === 'reading_progress').slice(beforeProgressWrites);
  ok(progressWrites.length === 1, 'progress phải được debounce, không ghi D1/KV hay Supabase mỗi lần scroll');
  ok(client.db.reading_progress.find(row => row.user_id === uidA && row.story_id === 'debounced-story')?.chapter_index === 2,
    'debounce phải ghi chapter mới nhất');
  personal.setProgress('cross-device-story', 1, 20, false);
  client.db.reading_progress.push({ user_id: uidA, story_id: 'cross-device-story', chapter_id: 'ch-9', chapter_index: 9,
    scroll_percent: 66, completed_at: null, updated_at: iso(Date.now() + 30000) });
  await wait(850);
  ok(client.db.reading_progress.find(row => row.user_id === uidA && row.story_id === 'cross-device-story')?.chapter_index === 9
    && personal.progressFor('cross-device-story')?.chapterIndex === 9,
    'row server mới hơn trên thiết bị khác thắng upsert stale và cache nhận lại tiến độ server');

  /* Client giữ Supabase JWT riêng cho endpoint community, không gửi worker session. */
  await personal.communityRequest('/api/community/reactions', { storyId: 'third-person', chapterIndex: 1 });
  const authHeader = fetchLog.find(item => item.url.endsWith('/api/community/reactions'))?.options.headers.authorization;
  ok(authHeader === 'Bearer header.payload.signature', 'community endpoint phải nhận Supabase access_token, không phải Worker session token');

  const ids = Array.from({ length: 23 }, (_, i) => 'story-' + i);
  await personal.fetchTocs(ids);
  const tocPosts = fetchLog.filter(item => item.url.endsWith('/api/community/tocs'));
  ok(tocPosts.length === 2, 'mục lục được gửi theo lô 20, không tạo request N+1');
  ok(tocPosts.every(item => JSON.parse(item.options.body).storyIds.length <= 20), 'mỗi lô TOC tối đa 20 storyIds');

  /* Chuyển tài khoản: dữ liệu A không được lộ/ghi sang B; UID không lấy từ body. */
  authState.user = { uid: uidB };
  client.db.story_follows.push({ user_id: uidB, story_id: 'b-only-follow', last_seen_chapter_index: 6, created_at: iso(now), last_seen_at: iso(now) });
  client.db.reading_progress.push({ user_id: uidB, story_id: 'b-only-progress', chapter_id: 'ch-6', chapter_index: 6, scroll_percent: 10, completed_at: null, updated_at: iso(now) });
  listeners.forEach(fn => fn(authState.user));
  await personal.whenReady();
  ok(personal.uid() === uidB && !personal.progressFor('server-progress') && personal.progressFor('b-only-progress')?.chapterIndex === 6,
    'khi đổi tài khoản phải thay bằng data của B, không trộn data của A');
  personal.setProgress('b-new-progress', 4, 35, false);
  await wait(850);
  ok(client.db.reading_progress.some(row => row.user_id === uidB && row.story_id === 'b-new-progress'),
    'progress sau đổi tài khoản phải gắn UID B từ Supabase session');
  ok(!client.db.reading_progress.some(row => row.user_id === uidA && row.story_id === 'b-new-progress'),
    'không ghi tiến độ UID B sang row UID A');

  /* Reader mở trong lúc Auth đang tải: tiến độ phát sinh ở trạng thái loading
     phải vào cache đúng UID và được merge sau khi phiên Supabase hoàn tất. */
  const uidC = 'user-c';
  let resolveSession;
  const normalGetSession = client.auth.getSession;
  client.auth.getSession = () => new Promise(resolve => { resolveSession = resolve; });
  authState.user = { uid: uidC };
  listeners.forEach(fn => fn(authState.user));
  await wait(0);
  ok(personal.mode() === 'loading' && personal.uid() === uidC, 'hydrate C phải giữ trạng thái loading trong khi phiên Supabase chưa về');
  personal.setProgress('late-auth-progress', 4, 33, false);
  resolveSession({ data: { session: { user: { id: uidC }, access_token: 'token-c' } }, error: null });
  await personal.whenReady();
  client.auth.getSession = normalGetSession;
  ok(personal.progressFor('late-auth-progress')?.chapterIndex === 4
    && client.db.reading_progress.some(row => row.user_id === uidC && row.story_id === 'late-auth-progress'),
    'progress phát sinh lúc loading không bị hydrate ghi mất và chỉ merge vào UID C');

  authState.user = null;
  listeners.forEach(fn => fn(null));
  await personal.whenReady();
  ok(personal.mode() === 'guest' && personal.uid() === '' && !personal.progressFor('b-only-progress'),
    'logout phải chuyển về kho guest tách biệt, không lộ data tài khoản vừa đăng xuất');

  const out = { errors0: bad, checked: 19, writes: client.writes.length, tocBatches: tocPosts.length };
  console.log(JSON.stringify(out, null, 1));
  dom.window.close();
  process.exit(bad.length ? 1 : 0);
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
