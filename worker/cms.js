/**
 * chuseoz CMS — Cloudflare Worker + KV
 * ---------------------------------------------------------------
 * Thay cho việc commit JSON vào GitHub rồi đợi Cloudflare build:
 *   • Admin ghi thẳng dữ liệu lên KV  -> web đọc thấy ngay (không build, không deploy)
 *   • Worker tự đồng bộ số chương / tình trạng / ngày cập nhật từ blogspot
 *     (chạy phía server nên không vướng CORS)
 *   • Worker gom số liệu thật từ Firebase Firestore (views/votes) và cache lại
 *
 * Endpoint
 *   GET    /api/health                 -> { ok, rev, keys }
 *   GET    /api/registry               -> registry.json (ETag, cache 60s)
 *   GET    /api/book/<slug>            -> book json   (ETag, cache 5 phút)
 *   GET    /api/stats                  -> { ok, rev, items:{slug:{views,votes,updatedAt,…}} }
 *   GET    /api/schedule               -> lịch ra chương thật (đọc từ trang /p/lich-ra-chuong.html)
 *   PUT    /api/registry               -> ghi registry (cần X-Admin-Key)
 *   PUT    /api/book/<slug>            -> ghi 1 bộ (cần X-Admin-Key)
 *   PUT    /api/stats                  -> ghi đè số liệu thủ công (cần X-Admin-Key)
 *   POST   /api/sync                   -> đồng bộ từ Blogger (cần X-Admin-Key)
 *   POST   /api/seed                   -> nạp cả registry + nhiều book một lần (cần X-Admin-Key)
 *   OPTIONS *                          -> CORS preflight
 *
 * Biến môi trường / binding
 *   CZ_KV          (KV namespace)   — bắt buộc
 *   ADMIN_KEY      (secret)         — bắt buộc cho mọi thao tác ghi
 *   ALLOW_ORIGIN   (biến thường)    — mặc định "*"; đặt domain web để chặt hơn
 *   BLOG           (biến thường)    — mặc định https://chuseoz.blogspot.com
 *   FIREBASE_PROJECT (biến thường)  — mặc định chuseoz-library
 */

const DEFAULT_BLOG = 'https://chuseoz.blogspot.com';
const DEFAULT_FB_PROJECT = 'chuseoz-library';
const UA = { 'user-agent': 'chuseoz-cms/1.0 (+cloudflare worker)' };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(env, req);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const p = url.pathname.replace(/\/+$/, '') || '/';
      if (p === '/' || p === '/api/health') return json(await health(env), { cors });

      if (p === '/api/registry' && req.method === 'GET') return getJSON(env, 'registry', cors, 60);
      if (p === '/api/registry' && req.method === 'PUT') return putJSON(req, env, 'registry', cors);

      if (p === '/api/stats' && req.method === 'GET') return getStats(env, ctx, cors);
      if (p === '/api/stats' && req.method === 'PUT') return putJSON(req, env, 'stats', cors);

      if (p === '/api/schedule' && req.method === 'GET') return getSchedule(env, ctx, cors);
      if (p === '/api/sync' && req.method === 'POST') return syncFromBlogger(req, env, cors);

      if (p === '/api/seed' && req.method === 'POST') return seed(req, env, cors);

      const m = p.match(/^\/api\/book\/([\w.-]+)$/);
      if (m) {
        const key = 'book:' + m[1];
        if (req.method === 'GET') return getJSON(env, key, cors, 300);
        if (req.method === 'PUT') return putJSON(req, env, key, cors);
      }
      return json({ ok: false, error: 'not found', path: p }, { status: 404, cors });
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) }, { status: 500, cors });
    }
  },
};

/* ------------------------------------------------------------------ CORS */
function corsHeaders(env, req) {
  const allow = (env && env.ALLOW_ORIGIN) || '*';
  const origin = req && req.headers.get('origin');
  const value = allow === '*' ? '*' : (origin && allow.split(',').map(s => s.trim()).includes(origin) ? origin : allow.split(',')[0].trim());
  return {
    'access-control-allow-origin': value,
    'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-admin-key,if-none-match',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}

/* ------------------------------------------------------------------ tiện ích */
function json(obj, { status = 200, cors = {}, headers = {} } = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors, headers),
  });
}

async function getJSON(env, key, cors, maxAge = 60) {
  const { value, metadata } = await env.CZ_KV.getWithMetadata(key, { type: 'text' });
  if (value == null) return json({ ok: false, error: 'chưa có dữ liệu cho khoá ' + key }, { status: 404, cors });
  const etag = '"' + (metadata && metadata.etag ? metadata.etag : hash(value)) + '"';
  return new Response(value, {
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=' + maxAge,
      'etag': etag,
    }, cors),
  });
}

async function putJSON(req, env, key, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  const body = await req.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { return json({ ok: false, error: 'JSON lỗi: ' + e.message }, { status: 400, cors }); }
  const value = JSON.stringify(parsed);
  await env.CZ_KV.put(key, value, { metadata: { etag: hash(value), saved: new Date().toISOString() } });
  return json({ ok: true, key, bytes: value.length, saved: new Date().toISOString() }, { cors });
}

function authed(req, env) {
  const key = req.headers.get('x-admin-key') || '';
  const want = (env && env.ADMIN_KEY) || '';
  if (!want) return false;
  if (key.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

function hash(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (h2 + s.charCodeAt(i) * (i + 7)) >>> 0;
  }
  return h1.toString(16) + h2.toString(16);
}

async function health(env) {
  const list = await env.CZ_KV.list({ limit: 1000 });
  const keys = list.keys.map(k => k.name);
  const reg = await env.CZ_KV.get('registry', { type: 'json' });
  return {
    ok: true,
    rev: reg && reg.rev ? reg.rev : null,
    novels: reg && reg.lib ? reg.lib.length : 0,
    books: keys.filter(k => k.startsWith('book:')).length,
    keys: keys.slice(0, 200),
    now: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ Blogger */
async function fetchFeed(env, kind, params = '') {
  const blog = (env && env.BLOG) || DEFAULT_BLOG;
  const url = `${blog}/feeds/${kind}/default?alt=json&${params}`;
  const r = await fetch(url, { headers: UA, cf: { cacheTtl: 120, cacheEverything: true } });
  if (!r.ok) throw new Error('feed ' + kind + ' trả về ' + r.status);
  return r.json();
}

function textOf(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function normKey(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Đồng bộ số chương / tình trạng / ngày cập nhật / postId từ Blogger vào registry. */
async function syncFromBlogger(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'cần X-Admin-Key' }, { status: 401, cors });
  const reg = await env.CZ_KV.get('registry', { type: 'json' });
  if (!reg) return json({ ok: false, error: 'chưa có registry trong KV' }, { status: 404, cors });

  const [postsFeed, pagesFeed] = await Promise.all([
    fetchFeed(env, 'posts/summary', 'max-results=150'),
    fetchFeed(env, 'pages', 'max-results=150'),
  ]);

  // bài viết: slug -> {postId, updated, published, url}
  const posts = {};
  for (const e of (postsFeed.feed && postsFeed.feed.entry) || []) {
    const url = (e.link.find(l => l.rel === 'alternate') || {}).href || '';
    const slug = url.replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '');
    const m = /post-(\d+)/.exec(e.id.$t);
    posts[slug] = {
      postId: m ? m[1] : '', url,
      updated: (e.updated && e.updated.$t || '').slice(0, 10),
      published: (e.published && e.published.$t || '').slice(0, 10),
    };
  }
  // trang /p/: "Tình trạng: X" + syn
  const pages = {};
  for (const e of (pagesFeed.feed && pagesFeed.feed.entry) || []) {
    const url = (e.link.find(l => l.rel === 'alternate') || {}).href || '';
    const t = textOf(e.content && e.content.$t);
    const st = /Tình trạng:\s*(.+?)\s*Tác giả:/.exec(t);
    pages[url] = { title: e.title.$t, updated: (e.updated && e.updated.$t || '').slice(0, 10), status: st ? st[1].trim() : '' };
  }

  const canon = (raw) => {
    const k = normKey(raw);
    if (k.startsWith('hoan thanh') || k.startsWith('hoàn thành')) return 'Hoàn thành';
    if (k.startsWith('sap ra mat')) return 'Sắp ra mắt';
    if (k.startsWith('sap dich')) return 'Sắp ra mắt';
    if (k.startsWith('dang tien hanh') || k.startsWith('dang cap nhat')) return 'Đang cập nhật';
    return '';
  };

  const changes = [];
  for (const n of reg.lib) {
    const card = `https://chuseoz.blogspot.com/p/${n.slug}.html`;
    const post = posts[n.slug];
    const page = pages[card] || pages[(n.blog || '').replace(/^http:/, 'https:')];
    const before = { chapters: n.chapters, status: n.status, updated: n.updated, postId: n.postId };
    if (post) {
      n.postId = post.postId || n.postId;
      n.blog = post.url || n.blog;
      n.updated = post.updated || n.updated;
      n.published = post.published || n.published;
    } else if (page) {
      n.updated = page.updated || n.updated;
    }
    if (page && page.status) {
      const s = canon(page.status);
      if (s) n.status = n.chapters > 0 ? s : 'Sắp ra mắt';
    }
    if (n.chapters <= 0) n.status = 'Sắp ra mắt';
    if (JSON.stringify(before) !== JSON.stringify({ chapters: n.chapters, status: n.status, updated: n.updated, postId: n.postId })) {
      changes.push({ slug: n.slug, before, after: { chapters: n.chapters, status: n.status, updated: n.updated, postId: n.postId } });
    }
  }
  reg.rev = new Date().toISOString().slice(0, 10);
  reg.source = Object.assign({}, reg.source, { synced: new Date().toISOString(), via: 'worker' });
  const value = JSON.stringify(reg);
  await env.CZ_KV.put('registry', value, { metadata: { etag: hash(value), saved: new Date().toISOString() } });
  await env.CZ_KV.delete('schedule');           // để lần gọi sau lấy lại lịch mới
  return json({ ok: true, rev: reg.rev, posts: Object.keys(posts).length, pages: Object.keys(pages).length, changes }, { cors });
}

/** Đếm số chương thật của 1 bài viết (đọc HTML, không cần API Blogger). */
async function countChapters(env, url) {
  const r = await fetch(url, { headers: UA, cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) return null;
  const h = await r.text();
  const m = h.match(/class="chapter-page[\s"]/g);
  const t = h.match(/<h2 class="chapter-title">([\s\S]*?)<\/h2>/g) || [];
  return { chapters: m ? m.length : 0, titles: t.length };
}

/* ------------------------------------------------------------------ stats: Firestore */
async function getStats(env, ctx, cors) {
  const cached = await env.CZ_KV.get('stats', { type: 'json' });
  const fresh = cached && cached.saved && (Date.now() - Date.parse(cached.saved) < 10 * 60 * 1000);
  if (cached && fresh) return json(cached, { cors });

  try {
    const project = (env && env.FIREBASE_PROJECT) || DEFAULT_FB_PROJECT;
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/novelData?pageSize=300`;
    const r = await fetch(url, { headers: UA });
    if (!r.ok) throw new Error('firestore ' + r.status);
    const d = await r.json();
    const items = {};
    for (const doc of d.documents || []) {
      const key = doc.name.split('/').pop();
      const f = {};
      for (const [k, v] of Object.entries(doc.fields || {})) {
        f[k] = v.integerValue !== undefined ? Number(v.integerValue)
          : v.doubleValue !== undefined ? Number(v.doubleValue)
            : v.stringValue !== undefined ? v.stringValue
              : v.booleanValue !== undefined ? v.booleanValue
                : v.timestampValue !== undefined ? v.timestampValue : null;
      }
      const slug = decodeURIComponent(key).replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '');
      items[slug] = {
        views: f.views || 0, viewsWeek: f.viewsWeek || 0, viewsMonth: f.viewsMonth || 0,
        votes: f.votes || 0, votersCount: f.votersCount || 0,
        updatedAt: f.updatedAt || 0, chapterCount: f.chapterCount || 0,
        lastChapterTitle: f.lastChapterTitle || '', lastChapterUrl: f.lastChapterUrl || '',
        trendingScore: f.trendingScore || 0, title: f.title || '',
      };
    }
    const out = { ok: true, saved: new Date().toISOString(), count: Object.keys(items).length, items };
    // giữ bản cũ nếu Firebase trả rỗng (tránh ghi đè bằng số 0)
    if (out.count === 0 && cached && cached.count) return json(cached, { cors });
    await env.CZ_KV.put('stats', JSON.stringify(out), { metadata: { saved: out.saved } });
    return json(out, { cors });
  } catch (e) {
    // Firebase chưa mở quyền đọc -> trả bản cache (nếu có), KHÔNG bịa số
    if (cached) return json(Object.assign({}, cached, { stale: true, error: String(e.message || e) }), { cors });
    return json({ ok: false, error: String(e.message || e), hint: 'Mở quyền đọc cho collection novelData trong Firestore rules, hoặc PUT /api/stats để tự nạp số liệu.' }, { status: 200, cors });
  }
}

/* ------------------------------------------------------------------ lịch ra chương */
async function getSchedule(env, ctx, cors) {
  const cached = await env.CZ_KV.get('schedule', { type: 'json' });
  if (cached && cached.saved && (Date.now() - Date.parse(cached.saved) < 30 * 60 * 1000)) return json(cached, { cors });
  try {
    const blog = (env && env.BLOG) || DEFAULT_BLOG;
    const feed = await fetchFeed(env, 'pages', 'max-results=150');
    const page = ((feed.feed && feed.feed.entry) || []).find(e => /lịch ra chương/i.test(e.title.$t));
    if (!page) throw new Error('không thấy trang "Lịch ra chương"');
    const text = textOf(page.content && page.content.$t);
    const items = [];
    const re = /(Thứ[^:]{0,20}):\s*([\s\S]*?)(?=\s*Thứ\s|\s*Lịch có thể|$)/g;
    let m;
    while ((m = re.exec(text))) {
      const days = m[1].trim();
      for (const t of m[2].split(/\s{2,}|,(?=\s*$)/)) {
        const title = t.trim();
        if (title.length > 2) items.push({ days, title });
      }
    }
    const out = { ok: true, saved: new Date().toISOString(), source: (page.link.find(l => l.rel === 'alternate') || {}).href || '', text, items };
    await env.CZ_KV.put('schedule', JSON.stringify(out), { metadata: { saved: out.saved } });
    return json(out, { cors });
  } catch (e) {
    if (cached) return json(Object.assign({}, cached, { stale: true }), { cors });
    return json({ ok: false, error: String(e.message || e) }, { status: 200, cors });
  }
}

/* ------------------------------------------------------------------ seed hàng loạt */
async function seed(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'cần X-Admin-Key' }, { status: 401, cors });
  const body = await req.json();
  const saved = [];
  if (body.registry) {
    const v = JSON.stringify(body.registry);
    await env.CZ_KV.put('registry', v, { metadata: { etag: hash(v), saved: new Date().toISOString() } });
    saved.push('registry');
  }
  for (const [slug, book] of Object.entries(body.books || {})) {
    const v = JSON.stringify(book);
    await env.CZ_KV.put('book:' + slug, v, { metadata: { etag: hash(v), saved: new Date().toISOString() } });
    saved.push(slug);
  }
  const count = (await env.CZ_KV.list({ limit: 1000 })).keys.length;
  return json({ ok: true, saved: saved.length, detail: saved.slice(0, 20), keys: count }, { cors });
}
