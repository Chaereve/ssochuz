/* Community actions — all writes are prepared D1 statements. Authenticated
 * actions accept only a verified Supabase access token with a JWT `sub` claim;
 * never read a user identifier from the request body or query string.
 */
import { STICKER_BY_ID } from '../src/shared/stickers.js';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,119}$/i;
const MAX_CHAPTER = 100000;
const rateWindows = new Map();

async function bodyJSON(req) {
  const length = Number(req.headers.get('content-length') || 0);
  if (length > 4096) return { tooLarge: true };
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return { tooLarge: true };
    return JSON.parse(raw);
  } catch (error) { return null; }
}
function integer(value, min, max) {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))) return 0;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : 0;
}
function validSlug(value) {
  const slug = String(value || '').trim();
  return SLUG_RE.test(slug) ? slug : '';
}
function rowsOf(result) {
  return result && Array.isArray(result.results) ? result.results : [];
}
function jwtSubject(req) {
  const match = String(req.headers.get('authorization') || '').match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return '';
  const pieces = match[1].split('.');
  if (pieces.length !== 3) return '';
  try {
    let part = pieces[1].replace(/-/g, '+').replace(/_/g, '/');
    while (part.length % 4) part += '=';
    const payload = JSON.parse(atob(part));
    return String(payload && payload.sub || '').trim();
  } catch (error) { return ''; }
}
async function authenticatedUser(req, env, userFromReq, json, cors) {
  const sub = jwtSubject(req);
  if (!sub) return { response: json({ ok: false, error: 'Cần Bearer JWT Supabase hợp lệ có claim sub.' }, { status: 401, cors }) };
  const auth = await userFromReq(req, env);
  const aud = auth && auth.user && (Array.isArray(auth.user.aud) ? auth.user.aud : [auth.user.aud]);
  const exp = Number(auth && auth.user && auth.user.exp) || 0;
  if (!auth || auth.source !== 'supabase' || !auth.user || auth.user.role !== 'authenticated' ||
      !aud || aud.indexOf('authenticated') < 0 || !exp || exp <= Math.floor(Date.now() / 1000) || !auth.user.iss ||
      String(auth.user.uid || '') !== sub) {
    return { response: json({ ok: false, error: 'Không xác thực được phiên Supabase.' }, { status: 401, cors }) };
  }
  return { userId: sub };
}
function limited(key, limit, windowMs) {
  const now = Date.now();
  if (rateWindows.size > 5000) {
    for (const [k, value] of rateWindows) if (value.until <= now) rateWindows.delete(k);
    if (rateWindows.size > 5000) rateWindows.clear();
  }
  let value = rateWindows.get(key);
  if (!value || value.until <= now) value = { count: 0, until: now + windowMs };
  value.count += 1;
  rateWindows.set(key, value);
  return value.count <= limit;
}
function requireDb(env, json, cors) {
  if (!env.CZ_DB || typeof env.CZ_DB.prepare !== 'function') {
    return json({ ok: false, error: 'Cloudflare D1 chưa được bind dưới tên CZ_DB.' }, { status: 503, cors });
  }
  return null;
}
function validateChapter(body, json, cors) {
  const storyId = validSlug(body && (body.storyId || body.slug));
  const chapterIndex = integer(body && (body.chapterIndex != null ? body.chapterIndex : body.chapter), 1, MAX_CHAPTER);
  if (!storyId || !chapterIndex) return { response: json({ ok: false, error: 'storyId hoặc chapterIndex không hợp lệ.' }, { status: 400, cors }) };
  return { storyId, chapterIndex };
}
async function publicStory(slug, lookupStory, json, cors) {
  const story = await lookupStory(slug);
  if (!story || !story.public) return { response: json({ ok: false, error: 'Không tìm thấy truyện công khai.' }, { status: 404, cors }) };
  return story;
}
async function validateVisibleChapter(storyId, chapterIndex, lookupStory, json, cors) {
  const story = await publicStory(storyId, lookupStory, json, cors);
  if (story.response) return story;
  if (story.book && story.book.lock) {
    return { response: json({ ok: false, error: 'Chương của truyện khóa không khả dụng trong community.' }, { status: 404, cors }) };
  }
  const chapters = Array.isArray(story.visibleChapters) ? story.visibleChapters : [];
  if (chapterIndex > chapters.length) {
    return { response: json({ ok: false, error: 'Chương không tồn tại hoặc chưa được xuất bản.' }, { status: 400, cors }) };
  }
  return story;
}
async function readReactionSummary(env, storyId, chapterIndex, userId) {
  const statements = [
    env.CZ_DB.prepare(
      'SELECT sticker_id AS stickerId, total FROM community_reaction_totals WHERE story_id = ? AND chapter_index = ? ORDER BY sticker_id'
    ).bind(storyId, chapterIndex),
  ];
  if (userId) {
    statements.push(env.CZ_DB.prepare(
      'SELECT sticker_id AS stickerId FROM community_reactions WHERE story_id = ? AND chapter_index = ? AND user_id = ? AND active = 1 ORDER BY sticker_id'
    ).bind(storyId, chapterIndex, userId));
  }
  const results = await env.CZ_DB.batch(statements);
  const totals = Object.create(null);
  rowsOf(results && results[0]).forEach((row) => { totals[row.stickerId] = Math.max(0, Number(row.total) || 0); });
  const mine = userId ? rowsOf(results && results[1]).map((row) => row.stickerId) : [];
  return { totals, mine };
}
async function postReactions(req, env, cors, deps) {
  const dbError = requireDb(env, deps.json, cors);
  if (dbError) return dbError;
  const body = await bodyJSON(req);
  if (!body || body.tooLarge) return deps.json({ ok: false, error: body && body.tooLarge ? 'Yêu cầu quá lớn.' : 'JSON không hợp lệ.' }, { status: body && body.tooLarge ? 413 : 400, cors });
  const input = validateChapter(body, deps.json, cors);
  if (input.response) return input.response;
  const story = await validateVisibleChapter(input.storyId, input.chapterIndex, deps.lookupStory, deps.json, cors);
  if (story.response) return story.response;

  const bearer = req.headers.get('authorization') || '';
  let userId = '';
  if (bearer) {
    const auth = await authenticatedUser(req, env, deps.userFromReq, deps.json, cors);
    if (auth.response) return auth.response;
    userId = auth.userId;
  }
  const action = String(body.action || '').toLowerCase();
  if (action && action !== 'toggle') return deps.json({ ok: false, error: 'action chỉ nhận toggle hoặc bỏ trống để xem tổng.' }, { status: 400, cors });
  if (action !== 'toggle') {
    const summary = await readReactionSummary(env, input.storyId, input.chapterIndex, userId);
    return deps.json({ ok: true, storyId: input.storyId, chapterIndex: input.chapterIndex, totals: summary.totals, mine: summary.mine }, { cors, headers: { 'cache-control': userId ? 'private, no-store' : 'public, max-age=0, s-maxage=15' } });
  }
  if (!userId) return deps.json({ ok: false, error: 'Đăng nhập Supabase để thả reaction.' }, { status: 401, cors });
  if (!limited('react:' + userId, 60, 60 * 1000)) return deps.json({ ok: false, error: 'Bạn thả reaction quá nhanh; thử lại sau.' }, { status: 429, cors });
  const stickerId = String(body.stickerId || '').trim();
  if (!Object.prototype.hasOwnProperty.call(STICKER_BY_ID, stickerId)) {
    return deps.json({ ok: false, error: 'Sticker không nằm trong danh sách cho phép.' }, { status: 400, cors });
  }
  const results = await env.CZ_DB.batch([
    env.CZ_DB.prepare(
      `INSERT INTO community_reactions (story_id, chapter_index, user_id, sticker_id, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, unixepoch(), unixepoch())
       ON CONFLICT (story_id, chapter_index, user_id, sticker_id)
       DO UPDATE SET active = 1 - community_reactions.active, updated_at = unixepoch()
       RETURNING active`
    ).bind(input.storyId, input.chapterIndex, userId, stickerId),
    env.CZ_DB.prepare(
      'SELECT sticker_id AS stickerId, total FROM community_reaction_totals WHERE story_id = ? AND chapter_index = ? ORDER BY sticker_id'
    ).bind(input.storyId, input.chapterIndex),
    env.CZ_DB.prepare(
      'SELECT sticker_id AS stickerId FROM community_reactions WHERE story_id = ? AND chapter_index = ? AND user_id = ? AND active = 1 ORDER BY sticker_id'
    ).bind(input.storyId, input.chapterIndex, userId),
  ]);
  const changed = rowsOf(results && results[0])[0] || {};
  const totals = Object.create(null);
  rowsOf(results && results[1]).forEach((row) => { totals[row.stickerId] = Math.max(0, Number(row.total) || 0); });
  const mine = rowsOf(results && results[2]).map((row) => row.stickerId);
  return deps.json({ ok: true, storyId: input.storyId, chapterIndex: input.chapterIndex, stickerId, active: Number(changed.active) === 1, totals, mine }, { cors, headers: { 'cache-control': 'private, no-store' } });
}
async function postBrick(req, env, cors, deps) {
  const dbError = requireDb(env, deps.json, cors);
  if (dbError) return dbError;
  const body = await bodyJSON(req);
  if (!body || body.tooLarge) return deps.json({ ok: false, error: body && body.tooLarge ? 'Yêu cầu quá lớn.' : 'JSON không hợp lệ.' }, { status: body && body.tooLarge ? 413 : 400, cors });
  const storyId = validSlug(body.storyId || body.slug);
  if (!storyId) return deps.json({ ok: false, error: 'storyId không hợp lệ.' }, { status: 400, cors });
  const story = await publicStory(storyId, deps.lookupStory, deps.json, cors);
  if (story.response) return story.response;
  if ((story.book && story.book.lock) || !story.entry || story.entry.statusCls !== 'run') {
    return deps.json({ ok: false, error: 'Chỉ truyện đang ra chương mới nhận góp gạch.' }, { status: 400, cors });
  }

  const bearer = req.headers.get('authorization') || '';
  let userId = '';
  if (bearer) {
    const auth = await authenticatedUser(req, env, deps.userFromReq, deps.json, cors);
    if (auth.response) return auth.response;
    userId = auth.userId;
  }
  const action = String(body.action || '').toLowerCase();
  if (action && action !== 'give') return deps.json({ ok: false, error: 'action chỉ nhận give hoặc bỏ trống để xem tổng.' }, { status: 400, cors });
  if (action !== 'give') {
    const results = userId ? await env.CZ_DB.batch([
      env.CZ_DB.prepare('SELECT total FROM community_brick_totals WHERE story_id = ?').bind(storyId),
      env.CZ_DB.prepare("SELECT 1 AS given FROM community_bricks WHERE story_id = ? AND user_id = ? AND day_utc = date('now') LIMIT 1").bind(storyId, userId),
    ]) : await env.CZ_DB.batch([
      env.CZ_DB.prepare('SELECT total FROM community_brick_totals WHERE story_id = ?').bind(storyId),
    ]);
    const total = Math.max(0, Number(rowsOf(results && results[0])[0] && rowsOf(results[0])[0].total) || 0);
    const givenToday = !!(userId && rowsOf(results && results[1])[0]);
    return deps.json({ ok: true, storyId, total, givenToday }, { cors, headers: { 'cache-control': userId ? 'private, no-store' : 'public, max-age=0, s-maxage=15' } });
  }
  if (!userId) return deps.json({ ok: false, error: 'Đăng nhập Supabase để góp gạch.' }, { status: 401, cors });
  if (!limited('brick:' + userId, 30, 60 * 60 * 1000)) return deps.json({ ok: false, error: 'Bạn thao tác góp gạch quá nhanh; thử lại sau.' }, { status: 429, cors });
  const results = await env.CZ_DB.batch([
    env.CZ_DB.prepare(
      `INSERT INTO community_bricks (story_id, user_id, day_utc, sticker_id, created_at)
       VALUES (?, ?, date('now'), 'sso-brick', unixepoch())
       ON CONFLICT (story_id, user_id, day_utc) DO NOTHING
       RETURNING story_id`
    ).bind(storyId, userId),
    env.CZ_DB.prepare('SELECT total FROM community_brick_totals WHERE story_id = ?').bind(storyId),
    env.CZ_DB.prepare("SELECT 1 AS given FROM community_bricks WHERE story_id = ? AND user_id = ? AND day_utc = date('now') LIMIT 1").bind(storyId, userId),
  ]);
  const inserted = rowsOf(results && results[0]).length > 0;
  const total = Math.max(0, Number(rowsOf(results && results[1])[0] && rowsOf(results[1])[0].total) || 0);
  return deps.json({ ok: inserted, storyId, total, givenToday: !!(rowsOf(results && results[2])[0]), added: inserted,
    error: inserted ? undefined : 'Bạn đã góp gạch cho truyện này hôm nay.' },
  { status: inserted ? 200 : 409, cors, headers: { 'cache-control': 'private, no-store' } });
}
async function postTocs(req, env, cors, deps) {
  const body = await bodyJSON(req);
  if (!body || body.tooLarge) return deps.json({ ok: false, error: body && body.tooLarge ? 'Yêu cầu quá lớn.' : 'JSON không hợp lệ.' }, { status: body && body.tooLarge ? 413 : 400, cors });
  const ids = Array.isArray(body.storyIds) ? body.storyIds : [];
  if (ids.length > 20) return deps.json({ ok: false, error: 'Tối đa 20 truyện mỗi yêu cầu.' }, { status: 400, cors });
  const unique = Array.from(new Set(ids.map(validSlug).filter(Boolean)));
  if (unique.length !== ids.length) return deps.json({ ok: false, error: 'Danh sách storyIds không hợp lệ.' }, { status: 400, cors });
  const items = await Promise.all(unique.map(async (storyId) => {
    const story = await deps.lookupStory(storyId);
    if (!story || !story.public) return null;
    const chapters = Array.isArray(story.visibleChapters) ? story.visibleChapters : [];
    const visible = chapters.length;
    const locked = !!(story.book && story.book.lock);
    const recent = locked ? [] : chapters.slice(Math.max(0, visible - 10)).map((chapter, offset) => ({
      index: visible - Math.min(10, visible) + offset + 1,
      title: String((chapter && chapter.t) || '').slice(0, 240),
    }));
    return { storyId, chapterCount: visible, updatedAt: String((story.entry && story.entry.updated) || ''), chapters: recent };
  }));
  return deps.json({ ok: true, items: items.filter(Boolean) }, { cors, headers: { 'cache-control': 'public, max-age=0, s-maxage=30' } });
}

export async function handleCommunity(req, env, cors, deps) {
  const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
  if (path === '/api/community/tocs' && req.method === 'POST') return postTocs(req, env, cors, deps);
  if (path === '/api/community/reactions' && req.method === 'POST') return postReactions(req, env, cors, deps);
  if (path === '/api/community/brick' && req.method === 'POST') return postBrick(req, env, cors, deps);
  return null;
}
