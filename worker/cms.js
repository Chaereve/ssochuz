/* ============================================================================
   chuseoz — Worker đọc/ghi dữ liệu truyện trên Cloudflare KV
   ----------------------------------------------------------------------------
   Vì sao dùng cái này: sửa truyện/chương trên trang quản trị là người đọc thấy
   NGAY (1–2 giây). Không commit GitHub, không đợi build, không tốn phút CI.

   ---------------------------------------------------------------------------
   BẢNG API
     GET  /api/health                 → tình trạng KV, số bộ, rev  (mở)
     GET  /api/whoami                 → kiểm tra ADMIN_KEY          (cần X-Admin-Key)
     GET  /api/registry               → toàn bộ dữ liệu thư viện  (mở)
     GET  /api/book/<slug>            → 1 bộ: tiêu đề + các chương (mở)
     GET  /api/stats                  → số liệu thật từ Firebase, cache 10' (mở)
     GET  /api/schedule               → lịch ra chương (mở)

     PUT  /api/registry               → ghi dữ liệu thư viện      (cần X-Admin-Key)
     PUT  /api/book/<slug>            → ghi 1 bộ + chương         (cần X-Admin-Key)
     DELETE /api/book/<slug>          → xoá 1 bộ                  (cần X-Admin-Key)
     POST /api/seed                   → nạp nhiều bộ một lần      (cần X-Admin-Key)
     POST /api/sync                   → đồng bộ lại từ Blogger    (cần X-Admin-Key)
     POST /api/stats/refresh          → xoá cache số liệu         (cần X-Admin-Key)

   ---------------------------------------------------------------------------
   BIẾN MÔI TRƯỜNG (Settings → Variables and Secrets)
     ADMIN_KEY         (secret, bắt buộc)  — khoá quản trị, dài ≥ 24 ký tự
     CZ_KV             (KV binding, bắt buộc)
     BLOG              (tuỳ chọn) = https://chuseoz.blogspot.com
     ALLOW_ORIGIN      (tuỳ chọn) = https://chuseoz.pages.dev  (nhiều domain: phẩy)
     FIREBASE_PROJECT  (tuỳ chọn) = chuseoz-library
     GOOGLE_CLIENT_ID  (secret/tuỳ chọn)    — Client ID của OAuth Web app (Google Identity Services)
     SESSION_SECRET    (secret, bắt buộc*)  — chuỗi ngẫu nhiên ≥ 32 ký tự, ký session bình luận/đăng nhập
                                            (*) bắt buộc nếu bật bình luận/đăng nhập người dùng
   ============================================================================ */

const VERSION = '1.2.0';
const JSONH = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let p = url.pathname.replace(/\/+$/, '') || '/';

    try {
      /* ---------- mở: chỉ đọc ---------- */
      if (p === '/' || p === '/api/health') return json(await health(env), { cors });
      if (p === '/api/whoami' || p === '/api/auth') {
        if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
        return json({ ok: true, role: 'admin', version: VERSION }, { cors });
      }
      if (p === '/api/registry' && req.method === 'GET') return getKV(env, 'registry', cors, 30);
      if (p === '/api/schedule' && req.method === 'GET') return getSchedule(env, ctx, cors);
      if (p === '/api/stats' && req.method === 'GET') return getStats(env, ctx, cors);

      /* ---------- người dùng: đăng nhập Google + bình luận ---------- */
      if (p === '/api/auth/google' && req.method === 'POST') return authGoogle(req, env, cors);
      if (p === '/api/auth/me' && req.method === 'GET') return authMe(req, env, cors);
      let mc = p.match(/^\/api\/comments\/([^/]+)\/([^/]+)$/);
      if (mc && req.method === 'DELETE') return deleteComment(decodeURIComponent(mc[1]), mc[2], req, env, cors);
      let mc2 = p.match(/^\/api\/comments\/([^/]+)$/);
      if (mc2 && req.method === 'GET') return getComments(decodeURIComponent(mc2[1]), req, env, cors);
      if (mc2 && req.method === 'POST') return postComment(decodeURIComponent(mc2[1]), req, env, cors);

      let m = p.match(/^\/api\/book\/(.+)$/);
      if (m && req.method === 'GET') return getKV(env, 'book:' + decodeURIComponent(m[1]), cors, 300);

      /* ---------- cần khoá quản trị ---------- */
      if (p === '/api/registry' && req.method === 'PUT') return putKV(req, env, 'registry', cors);
      if (m && req.method === 'PUT') return putKV(req, env, 'book:' + decodeURIComponent(m[1]), cors);
      if (m && req.method === 'DELETE') {
        if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
        await env.CZ_KV.delete('book:' + decodeURIComponent(m[1]));
        return json({ ok: true, deleted: decodeURIComponent(m[1]) }, { cors });
      }
      if (p === '/api/seed' && req.method === 'POST') return seed(req, env, cors);
      if (p === '/api/sync' && req.method === 'POST') return syncBlogger(req, env, cors);
      if (p === '/api/import' && req.method === 'POST') return importPost(req, env, cors);
      if (p === '/api/stats/refresh' && req.method === 'POST') {
        if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
        await env.CZ_KV.delete('stats');
        return json({ ok: true, cleared: 'stats' }, { cors });
      }
      return json({ ok: false, error: 'không có endpoint này', path: p }, { status: 404, cors });
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e), version: VERSION }, { status: 500, cors });
    }
  },
};

/* ==================== lấy 1 bài viết Blogger thành chương ====================
   POST /api/import  { slug, url? }
   · Không truyền url: tự tìm bài mới nhất có tiêu đề khớp tên truyện.
   · Có url: lấy thẳng bài đó.
   Nội dung được làm sạch (bỏ script/quảng cáo/bình luận) rồi ghép vào cuối bộ
   và ghi lại registry — người đọc thấy ngay, không cần build.                 */
async function importPost(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug || '').trim();
  if (!slug) return json({ ok: false, error: 'thiếu slug' }, { status: 400, cors });
  if (!env.CZ_KV) return json({ ok: false, error: 'chưa gắn CZ_KV' }, { status: 500, cors });

  const blog = (env.BLOG || 'https://chuseoz.blogspot.com').replace(/\/+$/, '');
  const reg = (await env.CZ_KV.get('registry', { type: 'json' })) || { lib: [] };
  const nov = (reg.lib || []).find((n) => n.slug === slug);
  let url = String(body.url || '').trim();
  let title = '', raw = '';

  if (url) {
    if (!/^https?:\/\/([a-z0-9-]+\.)*blogspot\.com\//i.test(url)) {
      return json({ ok: false, error: 'chỉ nhận link blogspot.com' }, { status: 400, cors });
    }
    const r = await fetch(url, { headers: { 'user-agent': 'chuseoz-cms/' + VERSION } });
    if (!r.ok) return json({ ok: false, error: 'không tải được bài: HTTP ' + r.status }, { status: 502, cors });
    const t = await r.text();
    const tm = t.match(/<title>([^<]+)<\/title>/i);
    title = (tm ? tm[1] : '').replace(/\s*[|·—-]\s*chuseoz.*$/i, '').trim();
    raw = postBody(t);
  } else {
    const want = normTitle((nov && nov.title) || slug);
    const feed = await (await fetch(blog + '/feeds/posts/default?alt=json&max-results=60')).json();
    const ents = (feed && feed.feed && feed.feed.entry) || [];
    let hit = ents.find((e) => normTitle(e.title.$t) === want)
           || ents.find((e) => normTitle(e.title.$t).indexOf(want) >= 0 || want.indexOf(normTitle(e.title.$t)) >= 0);
    if (!hit) {
      return json({ ok: false, error: 'Không thấy bài nào khớp “' + ((nov && nov.title) || slug) + '”. Dán thẳng link bài viết vào ô bên dưới rồi bấm lại.' }, { status: 404, cors });
    }
    title = hit.title.$t;
    const alt = (hit.link || []).find((l) => l.rel === 'alternate');
    url = alt ? alt.href : '';
    raw = (hit.content && hit.content.$t) || '';
  }

  const html = cleanPost(raw);
  if (!html || html.replace(/<[^>]+>/g, '').trim().length < 40) {
    return json({ ok: false, error: 'bài này không có nội dung đọc được', url }, { status: 422, cors });
  }

  const bkey = 'book:' + slug;
  const book = (await env.CZ_KV.get(bkey, { type: 'json' })) || { title: (nov && nov.title) || slug, slug, chapters: [] };
  book.chapters = book.chapters || [];
  const n = book.chapters.length + 1;
  const chapTitle = /^\s*ch[ưu][ơo]ng\s*\d+/i.test(title) ? title : ('Chương ' + n + (title ? ': ' + title : ''));
  const key = (req.headers.get('x-import-mode') || 'append').toLowerCase();   /* append | replace-last */
  if (key === 'replace-last' && book.chapters.length) book.chapters[book.chapters.length - 1] = { t: chapTitle, html };
  else book.chapters.push({ t: chapTitle, html });
  await env.CZ_KV.put(bkey, JSON.stringify(book), { metadata: { saved: new Date().toISOString() } });

  if (nov) {
    nov.chapters = book.chapters.length;
    const tot = parseInt(String(nov.countLabel || '').split('/')[1], 10) || 0;
    nov.countLabel = book.chapters.length + '/' + Math.max(tot, book.chapters.length);
    nov.updated = new Date().toISOString().slice(0, 10);
    if (nov.status === 'Sắp ra mắt') nov.status = 'Đang cập nhật';
    reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
    reg.source = { synced: new Date().toISOString(), note: 'nhập từ bài viết Blogger qua trang quản trị' };
    await env.CZ_KV.put('registry', JSON.stringify(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  }
  await env.CZ_KV.put('_last', new Date().toISOString());
  return json({ ok: true, added: chapTitle, chapters: book.chapters.length, url, title }, { cors });
}

function postBody(t) {
  let m = t.match(/<div[^>]+class="[^"]*post-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class="[^"]*(post-footer|comments)/i);
  if (m) return m[1];
  m = t.match(/<div[^>]+class="[^"]*post-body[^"]*"[^>]*>([\s\S]*)/i);
  return m ? m[1].split(/<div[^>]+class="[^"]*(post-footer|comments|blog-pager)/i)[0] : t;
}

/* biến HTML bài viết thành HTML chương: chỉ giữ chữ, ảnh, in đậm/nghiêng, link */
function cleanPost(raw) {
  let h = String(raw || '');
  h = h.replace(/<script[\s\S]*?<\/script>/gi, '')
       .replace(/<style[\s\S]*?<\/style>/gi, '')
       .replace(/<ins[\s\S]*?<\/ins>/gi, '')
       .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
       .replace(/<form[\s\S]*?<\/form>/gi, '')
       .replace(/<div[^>]+class="[^"]*(share|comment|reaction|related|adsbygoogle|post-footer|blog-pager)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  const keep = [];   /* giữ ảnh đúng thứ tự */
  h = h.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (mm, src) => {
    keep.push(src);
    return '\u0000IMG' + (keep.length - 1) + '\u0000';
  });
  h = h.replace(/<(b|strong|i|em|u)[^>]*>/gi, '<$1>')
       .replace(/<a [^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '<a href="$1" rel="noopener" target="_blank">$2</a>')
       .replace(/<\/(?!p>|b>|strong>|i>|em>|u>|a>)[a-z0-9]+>/gi, '')
       .replace(/<(?!\/?p[ >]|\/?b[ >]|\/?strong[ >]|\/?i[ >]|\/?em[ >]|\/?u[ >]|\/?a[ >])[a-z0-9]+[^>]*>/gi, '');
  const out = [];
  h.split(/<\/p>|<br\s*\/?>|\n{2,}/i).forEach((chunk) => {
    let c = chunk.replace(/<\/?p[^>]*>/gi, '').trim();
    const imgs = [];
    c = c.replace(/\u0000IMG(\d+)\u0000/g, (mm, i) => { imgs.push(keep[+i]); return ''; });
    const txt = c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (txt) out.push('<p>' + c.replace(/\s+/g, ' ').trim() + '</p>');
    imgs.forEach((src) => { if (src) out.push('<p><img src="' + src.replace(/"/g, '') + '" alt="" loading="lazy"></p>'); });
  });
  return out.join('\n');
}

function normTitle(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9à-ỹ]+/gi, '');
}

/* =========================== tiện ích =========================== */
function corsHeaders(req, env) {
  const allow = (env && env.ALLOW_ORIGIN) || '*';
  const origin = req.headers.get('Origin') || '';
  let ao = allow;
  if (allow !== '*' && origin) {
    const list = allow.split(',').map((s) => s.trim()).filter(Boolean);
    ao = list.includes(origin) ? origin : list[0] || '*';
  }
  return {
    'access-control-allow-origin': ao,
    'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-admin-key,authorization',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}
function json(obj, { status = 200, cors = {}, headers = {} } = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { ...JSONH, ...cors, ...headers } });
}
function authed(req, env) {
  const want = (env && env.ADMIN_KEY) || '';
  const got = req.headers.get('x-admin-key') || '';
  if (!want) return false;
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
async function getKV(env, key, cors, cacheSec) {
  const { value, metadata } = await env.CZ_KV.getWithMetadata(key, { type: 'text' });
  if (value == null) return json({ ok: false, error: 'chưa có dữ liệu cho khoá ' + key }, { status: 404, cors });
  return new Response(value, {
    headers: { ...JSONH, ...cors, 'cache-control': 'public, max-age=' + (cacheSec || 30), 'x-kv-key': key, etag: (metadata && metadata.etag) || undefined },
  });
}
async function putKV(req, env, key, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  const body = await req.text();
  if (body.length > 24 * 1024 * 1024) return json({ ok: false, error: 'dữ liệu quá lớn (>24MB)' }, { status: 413, cors });
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { return json({ ok: false, error: 'JSON lỗi: ' + e.message }, { status: 400, cors }); }
  const saved = new Date().toISOString();
  await env.CZ_KV.put(key, body, { metadata: { saved, rev: parsed.rev || '', bytes: body.length } });
  await env.CZ_KV.put('_last', saved);           // mốc thời gian ghi gần nhất
  return json({ ok: true, key, bytes: body.length, saved }, { cors });
}
async function health(env) {
  const last = (await env.CZ_KV.get('_last')) || '';
  const reg = await env.CZ_KV.get('registry', { type: 'json' });
  let books = 0;
  let cursor;
  do {
    const l = await env.CZ_KV.list({ prefix: 'book:', limit: 1000, cursor });
    books += l.keys.length;
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return {
    ok: true, version: VERSION, kv: true, books, regRev: (reg && reg.rev) || '',
    novels: reg ? (reg.lib || []).length : 0, lastWrite: last, now: new Date().toISOString(),
  };
}
async function getSchedule(env, ctx, cors) {
  const reg = await env.CZ_KV.get('registry', { type: 'json' });
  const sch = (reg && reg.schedule) || null;
  if (sch) return json({ ok: true, ...sch, source: (sch.source || (env.BLOG || 'https://chuseoz.blogspot.com') + '/p/lich-ra-chuong.html') }, { cors });
  const fresh = await readScheduleFromBlog(env);
  if (fresh) { ctx.waitUntil(env.CZ_KV.put('schedule_cache', JSON.stringify(fresh), { expirationTtl: 21600 })); return json({ ok: true, ...fresh }, { cors }); }
  const cached = await env.CZ_KV.get('schedule_cache', { type: 'json' });
  if (cached) return json({ ok: true, ...cached, stale: true }, { cors });
  return json({ ok: false, error: 'chưa có lịch ra chương' }, { status: 404, cors });
}
async function readScheduleFromBlog(env) {
  const blog = (env.BLOG || 'https://chuseoz.blogspot.com').replace(/\/+$/, '');
  /* dùng feed JSON của Blogger: nhẹ, không cần parse HTML nặng */
  const u = blog + '/feeds/pages/default?alt=json&path=' + encodeURIComponent('/p/lich-ra-chuong.html');
  const r = await fetch(u, { headers: { 'user-agent': 'chuseoz-worker/1.0' }, cf: { cacheTtl: 600, cacheEverything: true } });
  if (!r.ok) return null;
  let d; try { d = await r.json(); } catch (e) { return null; }
  const e0 = d && d.feed && d.feed.entry && d.feed.entry[0];
  if (!e0) return null;
  const html = (e0.content && e0.content.$t) || '';
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const items = [];
  const re = /(Thứ\s*[0-9](?:\s*[,và]+\s*Thứ\s*[0-9])?)\s*[:\-–]?\s*([^:]{0,90}?)\s*(?:[:\-–]\s*)(.{0,160})/gi;
  let m;
  while ((m = re.exec(text)) && items.length < 12) {
    items.push({ days: m[1].trim(), title: m[2].trim(), detail: m[3].trim().slice(0, 160) });
  }
  const note = (text.match(/Lịch có thể[^.]*\./) || [''])[0];
  return { items, note, updated: new Date().toISOString().slice(0, 10), source: blog + '/p/lich-ra-chuong.html' };
}
async function seed(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  let d; try { d = await req.json(); } catch (e) { return json({ ok: false, error: 'JSON lỗi' }, { status: 400, cors }); }
  const out = { books: 0, failed: [] };
  if (d.registry) await env.CZ_KV.put('registry', JSON.stringify(d.registry), { metadata: { saved: new Date().toISOString(), rev: d.registry.rev || '' } });
  const books = d.books || {};
  for (const slug of Object.keys(books)) {
    try { await env.CZ_KV.put('book:' + slug, JSON.stringify(books[slug])); out.books++; }
    catch (e) { out.failed.push(slug); }
  }
  await env.CZ_KV.put('_last', new Date().toISOString());
  return json({ ok: true, ...out, registry: !!d.registry }, { cors });
}
async function getStats(env, ctx, cors) {
  const cached = await env.CZ_KV.get('stats', { type: 'json' });
  const now = Date.now();
  const fresh = cached && cached.fetchedAt && now - Date.parse(cached.fetchedAt) < 10 * 60 * 1000;
  if (fresh) return json(cached, { cors });
  const project = env.FIREBASE_PROJECT || 'chuseoz-library';
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/novelData?pageSize=300`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'chuseoz-worker/1.0' } });
    if (!r.ok) throw new Error('firestore ' + r.status);
    const d = await r.json();
    const items = {};
    (d.documents || []).forEach((doc) => {
      const key = decodeURIComponent(doc.name.split('/').pop());
      const f = {};
      Object.entries(doc.fields || {}).forEach(([k, v]) => { f[k] = fbVal(v); });
      items[key] = {
        views: f.views || 0, votes: f.votes || 0, chapterCount: f.chapterCount || 0,
        lastChapterTitle: f.lastChapterTitle || '', updatedAt: f.updatedAt || 0,
        trendingScore: f.trendingScore || 0,
      };
    });
    const payload = { ok: true, fetchedAt: new Date().toISOString(), source: 'firebase:chuseoz-library/novelData', items };
    ctx.waitUntil(env.CZ_KV.put('stats', JSON.stringify(payload)));
    return json(payload, { cors });
  } catch (e) {
    if (cached) return json({ ...cached, stale: true, error: String(e.message) }, { cors });
    return json({ ok: false, error: 'chưa đọc được số liệu Firebase: ' + e.message, hint: 'mở quyền đọc Firestore cho novelData (xem worker/README.md §5)' }, { status: 503, cors });
  }
}
function fbVal(v) {
  if (v == null) return null;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fbVal);
  if (v.mapValue !== undefined) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fbVal(x); }); return o; }
  return null;
}
/* ---------------------------------------------------------------------------
   Đồng bộ lại metadata từ Blogger: 1 request lấy trang danh sách (62 thẻ truyện:
   tên, tác giả, couple, năm, ảnh bìa, nhãn đếm, tình trạng, 18+) rồi ghép vào
   registry đang có trong KV. Chương thì đã nằm trong KV (do admin sửa).
   --------------------------------------------------------------------------- */
async function syncBlogger(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  const blog = (env.BLOG || 'https://chuseoz.blogspot.com').replace(/\/+$/, '');
  const [listRes, sched] = await Promise.all([
    fetch(blog + '/p/list-novel.html', { headers: { 'user-agent': 'chuseoz-worker/1.0' }, cf: { cacheTtl: 120, cacheEverything: true } }),
    readScheduleFromBlog(env),
  ]);
  if (!listRes.ok) return json({ ok: false, error: 'không tải được trang danh sách: ' + listRes.status }, { status: 502, cors });
  const html = await listRes.text();
  const cards = parseCards(html);
  const reg = (await env.CZ_KV.get('registry', { type: 'json' })) || { lib: [] };
  const bySlug = {};
  (reg.lib || []).forEach((n) => { if (n.slug) bySlug[n.slug] = n; });
  let changed = 0;
  const log = [];
  for (const c of cards) {
    const key = c.slug || slugify(c.title);
    let n = bySlug[key];
    if (!n) n = (reg.lib || []).find((x) => sameTitle(x.title, c.title));
    if (!n) { log.push({ action: 'mới (chưa có trong KV)', title: c.title }); continue; }
    ['author', 'couple', 'year', 'thumb', 'status', 'count', 'is18'].forEach((f) => {
      if (c[f] && String(c[f]) !== String(n[f] || '')) { n[f] = c[f]; changed++; }
    });
    if (c.count) n.countLabel = c.count;
    n.statusRaw = c.status || n.statusRaw;
  }
  if (sched) reg.schedule = { ...sched, note: sched.note || 'Lịch có thể thay đổi nếu có việc đột xuất.' };
  reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  reg.source = { synced: new Date().toISOString(), note: 'đồng bộ từ blogspot (list-novel + lịch ra chương)' };
  await env.CZ_KV.put('registry', JSON.stringify(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  await env.CZ_KV.put('_last', new Date().toISOString());
  return json({ ok: true, cards: cards.length, changed, rev: reg.rev, schedule: !!sched, log: log.slice(0, 20) }, { cors });
}
function parseCards(html) {
  const out = [];
  const re = /<article[^>]*class="[^"]*truyen-card[^"]*"([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const attr = (k) => { const x = tag.match(new RegExp('data-' + k + '="([^"]*)"')); return x ? unesc(x[1]) : ''; };
    const title = attr('title');
    const href = (tag.match(/href="([^"]+)"/) || [, ''])[1];
    const img = (tag.match(/<img[^>]+src="([^"]+)"/) || [, ''])[1];
    const count = (tag.match(/class="[^"]*badge-count[^"]*"[^>]*>([^<]*)</) || [, ''])[1].replace(/\s+/g, ' ').trim();
    const status = (tag.match(/class="[^"]*badge-chapters[^"]*"[^>]*>([^<]*)</) || [, ''])[1].replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const pslug = (href.match(/\/p\/([^/.]+)\.html/) || [, ''])[1];
    out.push({
      title: unesc(title), slug: pslug || slugify(title), url: href, thumb: img,
      author: attr('author'), couple: attr('couple'), year: attr('year'),
      is18: /badge-18/.test(tag), count, status: status || '',
    });
  }
  return out;
}
function unesc(s) { return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim(); }
function slugify(s) {
  return unesc(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function sameTitle(a, b) {
  const f = (x) => unesc(x).toLowerCase().replace(/[^a-z0-9à-ỹ]+/gi, '');
  return f(a) === f(b);
}

/* ============================================================================
   ĐĂNG NHẬP GOOGLE + BÌNH LUẬN (người dùng cuối)
   · Frontend lấy idToken từ Google Identity Services (GIS), gửi lên
     POST /api/auth/google. Worker xác thực chữ ký JWT bằng khoá công khai của
     Google (cache 1h), rồi cấp một session token (HS256, ký bằng SESSION_SECRET).
   · Bình luận POST lên /api/comments/<slug> kèm header Authorization: Bearer
     <token>, lưu trong KV (khoá cmt:<slug>, mới nhất ở đầu, tối đa 500/bộ).
   · GET /api/comments/<slug> lấy danh sách công khai.
   ============================================================================ */
const _b64 = {
  toBytes(s, url) {
    s = String(s);
    if (url) s = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  fromBytes(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
};
const _enc = (s) => new TextEncoder().encode(s);
const _dec = (b) => new TextDecoder().decode(b);

let _gcerts = null, _gcertsAt = 0;
async function googlePubKey(kid) {
  const now = Date.now();
  if (!_gcerts || now - _gcertsAt > 3600 * 1000) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!r.ok) throw new Error('không tải được khoá công khai Google (' + r.status + ')');
    _gcerts = await r.json();
    _gcertsAt = now;
  }
  const cert = (_gcerts.keys || []).find((k) => k.kid === kid);
  if (!cert) throw new Error('không tìm thấy khoá kid=' + kid);
  const der = _b64.toBytes(cert.x5c[0], false);
  return crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}
async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('idToken sai định dạng');
  const header = JSON.parse(_dec(_b64.toBytes(parts[0], true)));
  const payload = JSON.parse(_dec(_b64.toBytes(parts[1], true)));
  const sig = _b64.toBytes(parts[2], true);
  const data = _enc(parts[0] + '.' + parts[1]);
  const key = await googlePubKey(header.kid);
  const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
  if (!ok) throw new Error('chữ ký idToken không hợp lệ');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('idToken đã hết hạn');
  if (payload.aud !== clientId) throw new Error('idToken sai audience (cần khớp GOOGLE_CLIENT_ID)');
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') throw new Error('idToken sai issuer');
  if (payload.email_verified === false) throw new Error('email Google chưa xác thực');
  return payload;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', _enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(user, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    uid: user.uid, email: user.email || '', name: user.name || '', picture: user.picture || '',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
  const data = _b64.fromBytes(_enc(JSON.stringify(header))) + '.' + _b64.fromBytes(_enc(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), _enc(data));
  return data + '.' + _b64.fromBytes(new Uint8Array(sig));
}
async function verifySession(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const data = parts[0] + '.' + parts[1];
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), _b64.toBytes(parts[2], true), _enc(data));
  if (!ok) return null;
  try {
    const p = JSON.parse(_dec(_b64.toBytes(parts[1], true)));
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch (e) { return null; }
}
async function userFromReq(req, env) {
  const secret = env.SESSION_SECRET || '';
  if (!secret) return null;
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return verifySession(m[1], secret);
}
function publicUser(u) { return { uid: u.uid, email: u.email || '', name: u.name || 'Bạn đọc', picture: u.picture || '' }; }
function publicComment(c) { return { id: c.id, uid: c.uid, name: c.name || 'Bạn đọc', picture: c.picture || '', text: c.text, createdAt: c.createdAt }; }

async function authGoogle(req, env, cors) {
  const secret = env.SESSION_SECRET || '';
  const cid = env.GOOGLE_CLIENT_ID || '';
  if (!secret) return json({ ok: false, error: 'Worker chưa đặt secret SESSION_SECRET' }, { status: 500, cors });
  if (!cid) return json({ ok: false, error: 'Worker chưa đặt biến GOOGLE_CLIENT_ID' }, { status: 500, cors });
  const body = await req.json().catch(() => ({}));
  const cred = String(body.credential || '');
  if (!cred) return json({ ok: false, error: 'thiếu credential (idToken)' }, { status: 400, cors });
  let payload;
  try { payload = await verifyGoogleIdToken(cred, cid); }
  catch (e) { return json({ ok: false, error: 'xác thực Google thất bại: ' + e.message }, { status: 401, cors }); }
  const user = { uid: payload.sub, email: payload.email || '', name: payload.name || payload.email || 'Bạn đọc', picture: payload.picture || '' };
  const token = await signSession(user, secret);
  return json({ ok: true, token, user: publicUser(user) }, { cors });
}
async function authMe(req, env, cors) {
  const u = await userFromReq(req, env);
  if (!u) return json({ ok: false, error: 'chưa đăng nhập' }, { status: 401, cors });
  return json({ ok: true, user: publicUser(u) }, { cors });
}
async function getComments(slug, req, env, cors) {
  if (!env.CZ_KV) return json({ ok: false, error: 'chưa gắn CZ_KV' }, { status: 500, cors });
  const arr = (await env.CZ_KV.get('cmt:' + slug, { type: 'json' })) || [];
  let limit = 200;
  try { limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '200', 10) || 200, 300); } catch (e) {}
  const comments = arr.slice(0, limit).map(publicComment);
  return json({ ok: true, comments, count: arr.length, slug }, { cors });
}
async function postComment(slug, req, env, cors) {
  const u = await userFromReq(req, env);
  if (!u) return json({ ok: false, error: 'bạn cần đăng nhập để bình luận' }, { status: 401, cors });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (text.length < 1) return json({ ok: false, error: 'bình luận không được trống' }, { status: 400, cors });
  if (!env.CZ_KV) return json({ ok: false, error: 'chưa gắn CZ_KV' }, { status: 500, cors });
  const key = 'cmt:' + slug;
  const arr = (await env.CZ_KV.get(key, { type: 'json' })) || [];
  const c = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    uid: u.uid, name: u.name || 'Bạn đọc', picture: u.picture || '', text,
    createdAt: new Date().toISOString(),
  };
  arr.unshift(c);
  if (arr.length > 500) arr.length = 500;
  await env.CZ_KV.put(key, JSON.stringify(arr));
  return json({ ok: true, comment: publicComment(c) }, { cors });
}
async function deleteComment(slug, id, req, env, cors) {
  const u = await userFromReq(req, env);
  if (!u) return json({ ok: false, error: 'cần đăng nhập' }, { status: 401, cors });
  if (!env.CZ_KV) return json({ ok: false, error: 'chưa gắn CZ_KV' }, { status: 500, cors });
  const key = 'cmt:' + slug;
  const arr = (await env.CZ_KV.get(key, { type: 'json' })) || [];
  const idx = arr.findIndex((c) => c.id === id);
  if (idx < 0) return json({ ok: false, error: 'không thấy bình luận' }, { status: 404, cors });
  if (arr[idx].uid !== u.uid) return json({ ok: false, error: 'chỉ xoá được bình luận của chính bạn' }, { status: 403, cors });
  arr.splice(idx, 1);
  await env.CZ_KV.put(key, JSON.stringify(arr));
  return json({ ok: true, deleted: id }, { cors });
}
