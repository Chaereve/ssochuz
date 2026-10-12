/* ============================================================================
   Worker community độc lập + D1 contract, chạy trên community-worker/index.js thật.
   CMS service binding được giả lập cho xác thực Supabase/public story lookup; D1 giả
   hiểu đúng prepared statements của endpoint và tuần tự hoá batch để mô
   phỏng transaction: kiểm JWT sub, toggle nguyên tử, aggregate trigger, unique
   gạch/ngày, allowlist sticker, validation story/chapter, CORS/rate errors.
   Migration SQL được kiểm chạy riêng bằng SQLite trong tools/check_community_sql.py.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(pathToFileURL(path.join(ROOT, 'community-worker', 'index.js')).href)).default;
const errors = [];
let checks = 0;
const check = (condition, label, got = null) => { checks += 1; if (!condition) errors.push({ label, got }); };
const HMAC = 'unit-test-supabase-jwt-secret-not-a-real-credential';
const b64u = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
function jwt(sub, overrides = {}) {
  const header = b64u({ alg: 'HS256', typ: 'JWT' });
  const payload = b64u(Object.assign({
    sub,
    aud: 'authenticated',
    iss: 'https://project.test/auth/v1',
    role: 'authenticated',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, overrides));
  const data = header + '.' + payload;
  return data + '.' + createHmac('sha256', HMAC).update(data).digest('base64url');
}

class FakeKV {
  constructor() { this.rows = new Map(); }
  async get(key, options = {}) {
    const value = this.rows.get(key);
    if (value == null) return null;
    if (options.type === 'json') { try { return JSON.parse(value); } catch (_) { return null; } }
    return value;
  }
  async put(key, value) { this.rows.set(key, String(value)); }
  async delete(key) { this.rows.delete(key); }
}
class FakeStatement {
  constructor(sql) { this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
}
class FakeD1 {
  constructor() {
    this.reactions = new Map();
    this.reactionTotals = new Map();
    this.bricks = new Set();
    this.brickTotals = new Map();
    this.prepared = [];
    this.tail = Promise.resolve();
  }
  prepare(sql) { this.prepared.push(sql); return new FakeStatement(sql); }
  batch(statements) {
    const run = this.tail.then(() => statements.map(statement => this.execute(statement)));
    this.tail = run.then(() => undefined, () => undefined);
    return run.then(results => results.map(rows => ({ results: rows })));
  }
  execute(statement) {
    const sql = statement.sql.toLowerCase().replace(/\s+/g, ' ').trim();
    const p = statement.params;
    if (sql.startsWith('insert into community_reactions')) {
      const [story, chapter, user, sticker] = p;
      const key = [story, chapter, user, sticker].join('|');
      const old = this.reactions.get(key);
      const active = old ? 1 - old.active : 1;
      this.reactions.set(key, { story, chapter, user, sticker, active });
      const totalKey = [story, chapter, sticker].join('|');
      const previous = this.reactionTotals.get(totalKey) || 0;
      this.reactionTotals.set(totalKey, Math.max(0, previous + (active - (old ? old.active : 0))));
      return [{ active }];
    }
    if (sql.includes('from community_reaction_totals')) {
      const [story, chapter] = p;
      return [...this.reactionTotals.entries()].filter(([key]) => key.startsWith(story + '|' + chapter + '|'))
        .map(([key, total]) => ({ stickerId: key.split('|')[2], total })).sort((a, b) => a.stickerId.localeCompare(b.stickerId));
    }
    if (sql.includes('from community_reactions')) {
      const [story, chapter, user] = p;
      return [...this.reactions.values()].filter(row => row.story === story && row.chapter === chapter && row.user === user && row.active === 1)
        .map(row => ({ stickerId: row.sticker }));
    }
    if (sql.startsWith('insert into community_bricks')) {
      const [story, user] = p;
      const day = new Date().toISOString().slice(0, 10);
      const key = [story, user, day].join('|');
      if (this.bricks.has(key)) return [];
      this.bricks.add(key);
      this.brickTotals.set(story, (this.brickTotals.get(story) || 0) + 1);
      return [{ story_id: story }];
    }
    if (sql.includes('from community_brick_totals')) {
      const [story] = p;
      const total = this.brickTotals.get(story) || 0;
      return total ? [{ total }] : [];
    }
    if (sql.includes('from community_bricks')) {
      const [story, user] = p;
      const day = new Date().toISOString().slice(0, 10);
      return this.bricks.has([story, user, day].join('|')) ? [{ given: 1 }] : [];
    }
    throw new Error('FakeD1 received an untested/non-prepared query: ' + statement.sql);
  }
}

class FakeCMS {
  constructor(kv) { this.kv = kv; }
  response(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      const match = String(request.headers.get('authorization') || '').match(/^Bearer\s+([^\s]+)$/i);
      const parts = match ? match[1].split('.') : [];
      if (parts.length !== 3) return this.response({ ok: false, error: 'invalid token' }, 401);
      let claims;
      try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch (_) { claims = null; }
      const signed = parts[0] + '.' + parts[1];
      const expected = createHmac('sha256', HMAC).update(signed).digest('base64url');
      if (!claims || parts[2] !== expected || Number(claims.exp) <= Math.floor(Date.now() / 1000) ||
          claims.iss !== 'https://project.test/auth/v1') {
        return this.response({ ok: false, error: 'invalid token' }, 401);
      }
      return this.response({ ok: true, user: { uid: claims.sub, exp: claims.exp } });
    }
    if (url.pathname === '/api/registry' && request.method === 'GET') {
      const registry = await this.kv.get('registry', { type: 'json' });
      const lib = (registry && Array.isArray(registry.lib) ? registry.lib : []).filter(entry =>
        entry && entry.visibility !== 'private' && entry.pubStatus !== 'draft');
      return this.response({ lib });
    }
    const bookMatch = url.pathname.match(/^\/api\/book\/([^/]+)\/toc$/);
    if (bookMatch && request.method === 'GET') {
      const slug = decodeURIComponent(bookMatch[1]);
      const registry = await this.kv.get('registry', { type: 'json' });
      const entry = (registry && registry.lib || []).find(row => row && row.slug === slug);
      if (!entry || entry.visibility === 'private' || entry.pubStatus === 'draft') return this.response({ ok: false }, 404);
      const book = await this.kv.get('book:' + slug, { type: 'json' });
      if (!book) return this.response({ ok: false }, 404);
      if (book.lock) return this.response({ ok: false, locked: true }, 403);
      const chapters = (Array.isArray(book.chapters) ? book.chapters : []).filter(chapter => !chapter.hidden && !chapter.scheduledAt);
      return this.response({ ok: true, slug, total: chapters.length, chapters: chapters.map(chapter => ({ t: chapter.t })) });
    }
    return this.response({ ok: false, error: 'not found' }, 404);
  }
}

const kv = new FakeKV();
const db = new FakeD1();
const chapters = Array.from({ length: 3 }, (_, i) => ({ t: 'Chương ' + (i + 1), c: '<p>Nội dung.</p>' }));
await kv.put('registry', JSON.stringify({ lib: [
  { slug: 'test-story', title: 'Truyện kiểm thử', chapters: 3, statusCls: 'run' },
  { slug: 'private-story', title: 'Truyện riêng', chapters: 1, visibility: 'private' },
  { slug: 'draft-story', title: 'Bản nháp', chapters: 1, pubStatus: 'draft' },
  { slug: 'done-story', title: 'Truyện đã hoàn thành', chapters: 1, statusCls: 'done' },
  { slug: 'locked-story', title: 'Truyện khóa', chapters: 1, statusCls: 'run' },
  { slug: 'race-story', title: 'Truyện kiểm thử đồng thời', chapters: 3, statusCls: 'run' },
] }));
for (const slug of ['test-story', 'private-story', 'draft-story', 'done-story', 'locked-story', 'race-story']) {
  await kv.put('book:' + slug, JSON.stringify({
    slug,
    chapters: slug === 'test-story' ? chapters : [{ t: 'Chương 1' }],
    ...(slug === 'locked-story' ? { lock: true } : {}),
  }));
}
const env = {
  CZ_DB: db,
  CMS: new FakeCMS(kv),
  ALLOW_ORIGIN: 'https://web.test',
};
const ctx = { waitUntil: promise => Promise.resolve(promise) };
async function call(url, { body = {}, token = '', origin = 'https://web.test', envOverride = null } = {}) {
  const headers = { origin, 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const response = await worker.fetch(new Request('https://worker.test' + url, {
    method: 'POST', headers, body: JSON.stringify(body),
  }), envOverride || env, ctx);
  const text = await response.text();
  let data = null; try { data = JSON.parse(text); } catch (_) {}
  return { status: response.status, data, headers: response.headers };
}

const healthResponse = await worker.fetch(new Request('https://community.test/api/health', {
  headers: { origin: 'https://web.test' },
}), env, ctx);
const healthData = await healthResponse.json();
check(healthResponse.status === 200 && healthData.worker === 'ssochuz-community' && healthData.d1 && healthData.cmsBinding,
  'standalone community Worker health reports D1 + existing CMS service binding', healthData);
const preflight = await worker.fetch(new Request('https://community.test/api/community/brick', {
  method: 'OPTIONS', headers: { origin: 'https://web.test', 'access-control-request-method': 'POST' },
}), env, ctx);
check(preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === 'https://web.test' &&
  preflight.headers.get('access-control-allow-credentials') === null,
  'community Worker preflight allows configured origin without credentials');
const userA = jwt('supabase-user-a');
const userB = jwt('supabase-user-b');
const storyId = 'test-story';
const chapterIndex = 2;

// Public reads, CORS and schema-not-bound handling.
let r = await call('/api/community/reactions', { body: { storyId, chapterIndex } });
check(r.status === 200 && r.data.ok === true && Array.isArray(r.data.mine), 'reaction summary public', r);
check(r.headers.get('access-control-allow-origin') === 'https://web.test', 'CORS allowlist reflects only configured origin');
check(!r.headers.has('access-control-allow-credentials'), 'no wildcard credentials/CORS credentials');
r = await call('/api/community/brick', { body: { storyId } });
check(r.status === 200 && r.data.total === 0 && r.data.givenToday === false, 'brick summary public', r);
r = await call('/api/community/reactions', { body: { action: 'not-a-toggle', storyId, chapterIndex } });
check(r.status === 400, 'unknown reaction action → 400', r.status);
r = await call('/api/community/brick', { body: { action: 'toggle', storyId } });
check(r.status === 400, 'unknown brick action → 400', r.status);
r = await call('/api/community/reactions', { body: { storyId, chapterIndex }, envOverride: { ...env, CZ_DB: undefined } });
check(r.status === 503, 'missing D1 → 503', r.status);

// Input validation and public-story visibility.
r = await call('/api/community/reactions', { body: { storyId: '../test', chapterIndex: 1 } });
check(r.status === 400, 'invalid story slug → 400', r.status);
r = await call('/api/community/reactions', { body: { storyId, chapterIndex: 0 } });
check(r.status === 400, 'invalid chapter index → 400', r.status);
r = await call('/api/community/reactions', { body: { storyId, chapterIndex: 4 } });
check(r.status === 400, 'unpublished/nonexistent chapter → 400', r.status);
r = await call('/api/community/brick', { body: { storyId: 'private-story' } });
check(r.status === 404, 'private story not public → 404', r.status);
r = await call('/api/community/brick', { body: { storyId: 'draft-story' } });
check(r.status === 404, 'draft story not public → 404', r.status);
r = await call('/api/community/brick', { body: { storyId: 'done-story' } });
check(r.status === 400, 'completed story rejects brick action → 400', r.status);
r = await call('/api/community/brick', { body: { storyId: 'locked-story' } });
check(r.status === 400, 'locked story rejects brick action → 400', r.status);
r = await call('/api/community/reactions', { body: { storyId: 'locked-story', chapterIndex: 1 } });
check(r.status === 404, 'locked story has no public chapter reactions → 404', r.status);

// Auth is from a verified Supabase JWT sub, never a caller-supplied UID.
r = await call('/api/community/reactions', { body: { action: 'toggle', storyId, chapterIndex, stickerId: 'sso-love-it', userId: 'victim' } });
check(r.status === 401, 'toggle without Bearer → 401', r.status);
r = await call('/api/community/brick', { body: { action: 'give', storyId, userId: 'victim' } });
check(r.status === 401, 'brick give without Bearer → 401', r.status);
r = await call('/api/community/reactions', { body: { action: 'toggle', storyId, chapterIndex, stickerId: 'sso-love-it' }, token: jwt('supabase-user-a', { exp: 1 }) });
check(r.status === 401, 'expired token → 401', r.status);
r = await call('/api/community/reactions', { body: { action: 'toggle', storyId, chapterIndex, stickerId: 'sso-love-it' }, token: jwt('anon', { aud: 'anon', role: 'anon' }) });
check(r.status === 401, 'Supabase anon-key JWT is not an authenticated user → 401', r.status);
r = await call('/api/community/reactions', { body: { action: 'toggle', storyId, chapterIndex, stickerId: '../not-allowlisted' }, token: userA });
check(r.status === 400, 'sticker allowlist rejects arbitrary ID → 400', r.status);

// Successful prepared-statement toggle and idempotent aggregate trigger behaviour.
r = await call('/api/community/reactions', { body: { action: 'toggle', storyId, chapterIndex, stickerId: 'sso-love-it', userId: 'victim' }, token: userA });
check(r.status === 200 && r.data.active === true && r.data.totals['sso-love-it'] === 1 && r.data.mine.includes('sso-love-it'),
  'reaction insert uses JWT sub, returns aggregate + mine', r);
check(![...db.reactions.values()].some(row => row.user === 'victim'), 'body userId is ignored; no forged-user row');
check([...db.reactions.values()].some(row => row.user === 'supabase-user-a'), 'D1 row user_id comes from verified sub');
const concurrent = await Promise.all([
  call('/api/community/reactions', { body: { action: 'toggle', storyId, chapterIndex, stickerId: 'sso-love-it' }, token: userA }),
  call('/api/community/reactions', { body: { action: 'toggle', storyId, chapterIndex, stickerId: 'sso-love-it' }, token: userA }),
]);
check(concurrent.every(item => item.status === 200), 'concurrent toggle requests succeed atomically');
check(db.reactionTotals.get([storyId, chapterIndex, 'sso-love-it'].join('|')) === 1,
  'two concurrent toggles leave total unchanged, without lost update');
check([...db.reactionTotals.values()].every(total => total >= 0), 'reaction aggregate never negative');
const readerB = await call('/api/community/reactions', { body: { action: 'toggle', storyId, chapterIndex, stickerId: 'sso-cry-flood' }, token: userB });
check(readerB.status === 200 && readerB.data.totals['sso-cry-flood'] === 1 && readerB.data.mine.includes('sso-cry-flood'),
  'each Supabase sub gets an independent reaction');

// Bricks: one per UTC day/user/story, D1 unique key wins under concurrent calls.
r = await call('/api/community/brick', { body: { action: 'give', storyId, userId: 'victim' }, token: userA });
check(r.status === 200 && r.data.added === true && r.data.total === 1 && r.data.givenToday === true,
  'first brick is recorded and aggregate increments once', r);
r = await call('/api/community/brick', { body: { action: 'give', storyId }, token: userA });
check(r.status === 409 && r.data.total === 1 && r.data.givenToday === true, 'same user/story/day duplicate → 409 without increment', r);
const brickRace = await Promise.all([
  call('/api/community/brick', { body: { action: 'give', storyId: 'race-story' }, token: userB }),
  call('/api/community/brick', { body: { action: 'give', storyId: 'race-story' }, token: userB }),
]);
check(brickRace.filter(item => item.status === 200).length === 1 && brickRace.filter(item => item.status === 409).length === 1,
  'concurrent same-day bricks: unique constraint allows exactly one winner', brickRace.map(item => item.status));
check(db.brickTotals.get('race-story') === 1 && [...db.brickTotals.values()].every(total => total >= 0),
  'brick total increments once and remains nonnegative');

// Public TOC endpoint is batched and does not require D1 or auth.
r = await call('/api/community/tocs', { body: { storyIds: [storyId] } });
check(r.status === 200 && r.data.items[0]?.chapterCount === 3 && r.data.items[0]?.chapters.length === 3,
  'TOC returns only published chapters', r);
r = await call('/api/community/tocs', { body: { storyIds: Array(21).fill(storyId) } });
check(r.status === 400, 'TOC max batch size is 20', r.status);

const stickerSource = readFileSync(path.join(ROOT, 'src/shared/stickers.js'), 'utf8');
const stickerIds = [...stickerSource.matchAll(/id: '(sso-[a-z-]+)'/g)].map(match => match[1]);
check(stickerIds.length === 14 && stickerIds.includes('sso-brick'), 'shared sticker registry has a unique allowlist, including brick', stickerIds.length);
check(db.prepared.length > 0 && db.prepared.every(sql => /^(select|insert)/i.test(sql.trim())), 
  'all D1 operations use prepared SELECT/INSERT statements', db.prepared.length);
check(!db.prepared.some(sql => /select\s+\*/i.test(sql)), 'no table scans/SELECT * over action history');

console.log(JSON.stringify({ errors0: errors, checks, preparedStatements: db.prepared.length, reactions: db.reactionTotals.size, bricks: db.brickTotals.size }, null, 1));
process.exit(errors.length ? 1 : 0);
