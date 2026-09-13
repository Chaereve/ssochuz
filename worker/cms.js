/* ============================================================================
   chuseoz — Worker đọc/ghi dữ liệu truyện + số liệu xếp hạng trên Cloudflare KV
   ----------------------------------------------------------------------------
   Vì sao dùng cái này: sửa truyện/chương trên trang quản trị là người đọc thấy
   NGAY (1–2 giây). Không commit GitHub, không đợi build, không tốn phút CI.
   Từ bản 1.4.0: lượt đọc / bình chọn cũng nằm trên KV — KHÔNG cần Firebase nữa.

   ---------------------------------------------------------------------------
   BẢNG API
     GET    /api/health                 → tình trạng KV, số bộ, rev, tổng số liệu (mở)
     GET    /api/whoami                 → kiểm tra ADMIN_KEY          (cần X-Admin-Key)
     GET    /api/registry               → toàn bộ dữ liệu thư viện  (mở)
     GET    /api/book/<slug>            → 1 bộ: tiêu đề + các chương (mở)
     GET    /api/schedule               → lịch ra chương (mở)
     GET    /api/stats                  → lượt đọc/bình chọn TỪ KV (mở)

     POST   /api/view                   → đếm 1 lượt đọc {slug, vid, ch} (mở)
     POST   /api/vote                   → bầu/bỏ bầu {slug, vote:1|0, vid} (mở)

     PUT    /api/registry               → ghi dữ liệu thư viện      (cần X-Admin-Key)
     PUT    /api/book/<slug>            → ghi 1 bộ + chương         (cần X-Admin-Key)
     DELETE /api/book/<slug>            → xoá 1 bộ                  (cần X-Admin-Key)
     POST   /api/seed                   → nạp nhiều bộ một lần      (cần X-Admin-Key)
     POST   /api/sync                   → đồng bộ lại từ Blogger    (cần X-Admin-Key)
     POST   /api/import                 → 1 bài Blogger → 1 chương  (cần X-Admin-Key)
     POST   /api/stats/seed             → nạp số liệu cũ (Firebase/file) (cần X-Admin-Key)
     POST   /api/stats/import-firebase  → tự kéo số cũ từ Firestore (cần X-Admin-Key)
     POST   /api/stats/refresh          → ghi hết số đang đệm ra KV (cần X-Admin-Key)

     POST   /api/auth/google            → idToken Google → session (mở)
     GET    /api/auth/me                → user từ session           (cần Bearer)
     GET    /api/comments/<slug>        → đọc bình luận             (mở)
     POST   /api/comments/<slug>        → gửi bình luận             (cần Bearer)
     DELETE /api/comments/<slug>/<id>   → xoá bình luận của mình    (cần Bearer)

   ---------------------------------------------------------------------------
   BIẾN MÔI TRƯỜNG (Settings → Variables and Secrets)
     ADMIN_KEY         (secret, bắt buộc)  — khoá quản trị, dài ≥ 24 ký tự
     CZ_KV             (KV binding, bắt buộc)
     BLOG              (tuỳ chọn) = https://chuseoz.blogspot.com
     ALLOW_ORIGIN      (tuỳ chọn) = https://chuseoz.pages.dev  (nhiều domain: phẩy)
     GOOGLE_CLIENT_ID  (secret/tuỳ chọn)    — Client ID của OAuth Web app (Google Identity Services)
     SESSION_SECRET    (secret, bắt buộc*)  — chuỗi ngẫu nhiên ≥ 32 ký tự, ký session bình luận/đăng nhập
                                            (*) bắt buộc nếu bật bình luận/đăng nhập người dùng
     STATS_FLUSH_MS    (tuỳ chọn) = 20000  — gom lượt đọc bao nhiêu mili-giây thì ghi KV
     FIREBASE_PROJECT  (KHÔNG cần nữa)      — chỉ dùng cho /api/stats/import-firebase
                                              khi muốn kéo số liệu cũ về KV một lần
   ============================================================================ */

const VERSION = '1.4.0';
const JSONH = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let p = url.pathname.replace(/\/+$/, '') || '/';

    /* Mọi handler đều `await`: không await thì lỗi bên trong lọt ra ngoài try/catch
       và Cloudflare trả trang lỗi 1101 thay vì JSON — rất khó đoán bệnh. */
    try {
      /* ---------- mở: chỉ đọc ---------- */
      if (p === '/' || p === '/api/health') return await health(env);
      if (p === '/api/whoami' || p === '/api/auth') {
        if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
        return json({ ok: true, role: 'admin', version: VERSION }, { cors });
      }
      if (p === '/api/registry' && req.method === 'GET') return await getKV(env, 'registry', cors, 30);
      if (p === '/api/schedule' && req.method === 'GET') return await getSchedule(env, ctx, cors);
      if (p === '/api/stats' && req.method === 'GET') return await getStats(env, cors);

      /* ---------- số liệu xếp hạng: đếm lượt đọc / bình chọn ---------- */
      if (p === '/api/view' && req.method === 'POST') return await postView(req, env, ctx, cors);
      if (p === '/api/vote' && req.method === 'POST') return await postVote(req, env, cors);

      /* ---------- người dùng: đăng nhập Google + bình luận ---------- */
      if (p === '/api/auth/google' && req.method === 'POST') return await authGoogle(req, env, cors);
      if (p === '/api/auth/me' && req.method === 'GET') return await authMe(req, env, cors);
      let mc = p.match(/^\/api\/comments\/([^/]+)\/([^/]+)$/);
      if (mc && req.method === 'DELETE') return await deleteComment(decodeURIComponent(mc[1]), mc[2], req, env, cors);
      let mc2 = p.match(/^\/api\/comments\/([^/]+)$/);
      if (mc2 && req.method === 'GET') return await getComments(decodeURIComponent(mc2[1]), req, env, cors);
      if (mc2 && req.method === 'POST') return await postComment(decodeURIComponent(mc2[1]), req, env, cors);

      let m = p.match(/^\/api\/book\/(.+)$/);
      if (m && req.method === 'GET') return await getKV(env, 'book:' + decodeURIComponent(m[1]), cors, 300);

      /* ---------- cần khoá quản trị ---------- */
      if (p === '/api/registry' && req.method === 'PUT') return await putKV(req, env, 'registry', cors);
      if (m && req.method === 'PUT') return await putKV(req, env, 'book:' + decodeURIComponent(m[1]), cors);
      if (m && req.method === 'DELETE') {
        if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
        if (!env.CZ_KV) return noKV(cors);
        await env.CZ_KV.delete('book:' + decodeURIComponent(m[1]));
        return json({ ok: true, deleted: decodeURIComponent(m[1]) }, { cors });
      }
      if (p === '/api/seed' && req.method === 'POST') return await seed(req, env, cors);
      if (p === '/api/sync' && req.method === 'POST') return await syncBlogger(req, env, cors);
      if (p === '/api/import' && req.method === 'POST') return await importPost(req, env, cors);
      if (p === '/api/stats/seed' && req.method === 'POST') return await seedStats(req, env, cors);
      if (p === '/api/stats/import-firebase' && req.method === 'POST') return await importFirebaseStats(req, env, cors);
      if (p === '/api/stats/refresh' && req.method === 'POST') {
        if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
        if (!env.CZ_KV) return noKV(cors);
        const flushed = await flushStats(env);
        await env.CZ_KV.delete('stats_cache');      /* khoá cache của bản cũ (nếu còn) */
        return json({ ok: true, cleared: 'stats_cache', flushed }, { cors });
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
  if (!env.CZ_KV) return noKV(cors);

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
    /* thiếu x-import-mode thì nút “Lấy từ Blogger & đăng (thay chương cuối)” của
       trang quản trị bị trình duyệt chặn ngay ở preflight — đã từng lỗi chỗ này. */
    'access-control-allow-headers': 'content-type,x-admin-key,x-import-mode,authorization',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}
function json(obj, { status = 200, cors = {}, headers = {} } = {}) {
  const h = { ...JSONH, ...cors, ...headers };
  Object.keys(h).forEach((k) => { if (h[k] === undefined || h[k] === null) delete h[k]; });
  return new Response(JSON.stringify(obj), { status, headers: h });
}
function noKV(cors) {
  return json({ ok: false, kv: false, error: 'Worker chưa gắn KV — Settings → Bindings → KV namespace, đặt Variable name là CZ_KV' }, { status: 503, cors });
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
  if (!env.CZ_KV) return noKV(cors);
  const { value, metadata } = await env.CZ_KV.getWithMetadata(key, { type: 'text' });
  if (value == null) return json({ ok: false, error: 'chưa có dữ liệu cho khoá ' + key }, { status: 404, cors });
  const h = { ...JSONH, ...cors, 'cache-control': 'public, max-age=' + (cacheSec || 30), 'x-kv-key': key };
  if (metadata && metadata.etag) h.etag = metadata.etag;
  return new Response(value, { headers: h });
}
async function putKV(req, env, key, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.text();
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > 24 * 1024 * 1024) return json({ ok: false, error: 'dữ liệu quá lớn (>24MB)' }, { status: 413, cors });
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { return json({ ok: false, error: 'JSON lỗi: ' + e.message }, { status: 400, cors }); }
  const saved = new Date().toISOString();
  await env.CZ_KV.put(key, body, { metadata: { saved, rev: parsed.rev || '', bytes } });
  await env.CZ_KV.put('_last', saved);           // mốc thời gian ghi gần nhất
  return json({ ok: true, key, bytes, saved }, { cors });
}
async function health(env) {
  if (!env.CZ_KV) return json({ ok: true, version: VERSION, kv: false, books: 0, novels: 0, regRev: '', lastWrite: '', now: new Date().toISOString(), hint: 'chưa bind CZ_KV' });
  const last = (await env.CZ_KV.get('_last')) || '';
  const reg = await env.CZ_KV.get('registry', { type: 'json' });
  let books = 0;
  let cursor;
  do {
    const l = await env.CZ_KV.list({ prefix: 'book:', limit: 1000, cursor });
    books += l.keys.length;
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  const st = await readStats(env);
  let views = 0, votes = 0;
  Object.keys(st.items).forEach((k) => {
    const it = st.items[k] || {};
    views += ((it.base || {}).views || 0) + ((it.got || {}).views || 0);
    votes += Math.max(0, ((it.base || {}).votes || 0) + ((it.got || {}).votes || 0));
  });
  return json({
    ok: true, version: VERSION, kv: true, books, regRev: (reg && reg.rev) || '',
    novels: reg ? (reg.lib || []).length : 0, lastWrite: last, now: new Date().toISOString(),
    stats: { items: Object.keys(st.items).length, views, votes },
  });
}
async function getSchedule(env, ctx, cors) {
  if (!env.CZ_KV) return noKV(cors);
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
  if (!env.CZ_KV) return noKV(cors);
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

/* ============================================================================
   SỐ LIỆU XẾP HẠNG TRÊN KV (thay cho Firebase)
   ----------------------------------------------------------------------------
   Tất cả nằm trong 1 khoá KV `stats`:
     { updatedAt, items: { <slug>: {
         base:   { views, votes }   ← số cũ mang sang (nạp 1 lần, không cộng dồn lại)
         got:    { views, votes }   ← số web đếm được từ khi dùng Worker
         days:   { 'YYYY-MM-DD': { v: lượt đọc, o: phiếu } }   ← giữ 45 ngày
         voters: { <uid|vid>: 1 }   ← để 1 người chỉ 1 phiếu, bỏ phiếu được
     } } }
   Số hiện ra = base + got.
   Lượt đọc được ĐỆM trong RAM của isolate rồi mới ghi (mỗi ~20 giây 1 lần) để
   không đụng trần ghi của KV; bình chọn thì ghi ngay vì ít.
   Muốn chính xác tuyệt đối ở lưu lượng lớn thì nâng lên Durable Object — với
   quy mô web này KV là đủ và rẻ hơn nhiều.
   ============================================================================ */
const STATS_KEY = 'stats';
const FLUSH_MS = 20000;      /* gom lượt đọc trong RAM bao lâu thì ghi (đổi bằng biến STATS_FLUSH_MS) */
const DAY_KEEP = 45;         /* giữ bao nhiêu ngày để xếp hạng ngày/tuần/tháng */
const VOTER_CAP = 20000;     /* tối đa bao nhiêu người bầu/bộ (chống phình khoá) */
let _buf = new Map();        /* slug -> { v: lượt đọc, o: phiếu } đang đệm */
let _bufAt = 0;
let _flushing = null;
let _seen = new Set();       /* khử trùng lặp lượt đọc trong cùng isolate */
let _seenQ = [];
let _timer = null;           /* hẹn giờ ghi phần đang đệm, phòng khi không còn request nào nữa */

function flushMs(env) {
  const n = parseInt((env && env.STATS_FLUSH_MS) || '', 10);
  return n > 0 ? Math.min(n, 30000) : FLUSH_MS;
}
/* Không ai gọi tiếp thì vẫn ghi sau ~FLUSH_MS (waitUntil giữ tiến trình sống tối đa 30s) */
function scheduleFlush(env, ctx) {
  if (_timer || !_buf.size || !ctx || !ctx.waitUntil) return;
  const ms = flushMs(env);
  _timer = setTimeout(() => { _timer = null; }, ms + 500);
  ctx.waitUntil(new Promise((r) => setTimeout(r, ms))
    .then(() => flushStats(env))
    .catch(() => {})
    .then(() => { if (_timer) { clearTimeout(_timer); _timer = null; } }));
}

function dayStr(d) { return (d || new Date()).toISOString().slice(0, 10); }
function cleanSlug(s) {
  s = String(s || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(s) ? s : '';
}
function blankStat() { return { base: { views: 0, votes: 0 }, got: { views: 0, votes: 0 }, days: {}, voters: {}, updatedAt: '' }; }
async function readStats(env) {
  if (!env.CZ_KV) return { updatedAt: '', items: {} };
  let s = null;
  try { s = await env.CZ_KV.get(STATS_KEY, { type: 'json' }); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') return { updatedAt: '', items: {} };
  if (!s.items || typeof s.items !== 'object') s.items = {};
  return s;
}
async function writeStats(env, st) {
  st.updatedAt = new Date().toISOString();
  await env.CZ_KV.put(STATS_KEY, JSON.stringify(st), { metadata: { saved: st.updatedAt, items: Object.keys(st.items).length } });
}
function statOf(st, slug) {
  const it = st.items[slug] || (st.items[slug] = blankStat());
  it.base = it.base || { views: 0, votes: 0 };
  it.got = it.got || { views: 0, votes: 0 };
  it.days = it.days || {};
  it.voters = it.voters || {};
  return it;
}
function addDay(it, day, v, o) {
  const d = it.days[day] || (it.days[day] = { v: 0, o: 0 });
  d.v += v; d.o += o;
  const ks = Object.keys(it.days).sort();
  while (ks.length > DAY_KEEP) { delete it.days[ks.shift()]; }
}
/* ghi phần đang đệm xuống KV; lỗi thì nhét lại vào đệm để khỏi mất số */
async function flushStats(env) {
  if (!env.CZ_KV || !_buf.size) return 0;
  if (_flushing) { await _flushing; return 0; }
  const take = _buf; _buf = new Map(); _bufAt = Date.now();
  _flushing = (async () => {
    try {
      const st = await readStats(env);
      const day = dayStr();
      for (const [slug, d] of take) {
        const it = statOf(st, slug);
        it.got.views += d.v; it.got.votes += d.o;
        addDay(it, day, d.v, d.o);
        it.updatedAt = new Date().toISOString();
      }
      await writeStats(env, st);
    } catch (e) {
      for (const [slug, d] of take) {
        const c = _buf.get(slug) || { v: 0, o: 0 };
        c.v += d.v; c.o += d.o; _buf.set(slug, c);
      }
      throw e;
    } finally { _flushing = null; }
  })();
  await _flushing;
  return take.size;
}
function seenView(key) {
  if (_seen.has(key)) return true;
  _seen.add(key); _seenQ.push(key);
  while (_seenQ.length > 8000) _seen.delete(_seenQ.shift());
  return false;
}
/* mã người xem: vid do web gửi, không có thì lấy IP (đã băm) */
function viewerOf(req, body) {
  const vid = String((body && body.vid) || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
  if (vid) return 'a:' + vid;
  const ip = req.headers.get('cf-connecting-ip') || '';
  return ip ? 'i:' + hash(ip) : '';
}
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function buckets(it, today) {
  const t = Date.parse(today + 'T00:00:00Z');
  const out = { vd: 0, od: 0, vw: 0, ow: 0, vm: 0, om: 0 };
  Object.keys(it.days || {}).forEach((k) => {
    const d = it.days[k], at = Date.parse(k + 'T00:00:00Z');
    if (!at || at > t) return;
    const age = (t - at) / 86400000;
    const v = d.v || 0, o = d.o || 0;
    if (age < 1) { out.vd += v; out.od += o; }
    if (age < 7) { out.vw += v; out.ow += o; }
    if (age < 31) { out.vm += v; out.om += o; }
  });
  ['vd', 'od', 'vw', 'ow', 'vm', 'om'].forEach((k) => { out[k] = Math.max(0, Math.round(out[k])); });
  return out;
}
function publicStat(it, today) {
  const b = buckets(it, today);
  return {
    views: ((it.base || {}).views || 0) + ((it.got || {}).views || 0),
    votes: Math.max(0, ((it.base || {}).votes || 0) + ((it.got || {}).votes || 0)),
    viewsDay: b.vd, votesDay: b.od,
    viewsWeek: b.vw, votesWeek: b.ow,
    viewsMonth: b.vm, votesMonth: b.om,
    trendingScore: Math.round(b.vd + 0.4 * b.vw + 2 * b.ow),
    updatedAt: it.updatedAt || '',
  };
}

/* GET /api/stats — web đọc chỗ này để vẽ bảng xếp hạng (không cần Firebase) */
async function getStats(env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  await flushStats(env);
  const st = await readStats(env);
  const today = dayStr();
  const items = {};
  Object.keys(st.items).forEach((slug) => { items[slug] = publicStat(st.items[slug], today); });
  return json({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), updatedAt: st.updatedAt || '', items },
    { cors, headers: { 'cache-control': 'public, max-age=60' } });
}

/* POST /api/view { slug, vid, ch } — 1 máy/1 bộ/1 ngày chỉ tính 1 lượt */
async function postView(req, env, ctx, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  if (!slug) return json({ ok: false, error: 'thiếu slug hợp lệ' }, { status: 400, cors });
  const who = viewerOf(req, body);
  const day = dayStr();
  if (who && seenView(slug + '|' + who + '|' + day)) return json({ ok: true, counted: false }, { cors, headers: { 'cache-control': 'no-store' } });
  const c = _buf.get(slug) || { v: 0, o: 0 };
  c.v += 1; _buf.set(slug, c);
  if (!_bufAt) _bufAt = Date.now();
  if (Date.now() - _bufAt >= flushMs(env)) await flushStats(env);
  else scheduleFlush(env, ctx);
  return json({ ok: true, counted: true, day }, { cors, headers: { 'cache-control': 'no-store' } });
}

/* POST /api/vote { slug, vote: 1|0, vid } — bầu/bỏ bầu, 1 người 1 phiếu */
async function postVote(req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  if (!slug) return json({ ok: false, error: 'thiếu slug hợp lệ' }, { status: 400, cors });
  const u = await userFromReq(req, env);
  const who = u ? 'g:' + hash(u.uid) : viewerOf(req, body);
  if (!who) return json({ ok: false, error: 'thiếu vid (mã máy) để chống bầu nhiều lần' }, { status: 400, cors });
  const want = (body.vote === 1 || body.vote === true || body.vote === '1') ? 1 : 0;
  if (!await rateLimit(env, 'rl:vote:' + who, 40, 3600)) {
    return json({ ok: false, error: 'thao tác hơi nhanh, thử lại sau ít phút' }, { status: 429, cors });
  }
  await flushStats(env);
  const st = await readStats(env);
  const it = statOf(st, slug);
  const has = !!it.voters[who];
  let changed = false;
  if (want && !has) {
    if (Object.keys(it.voters).length < VOTER_CAP) it.voters[who] = 1;
    it.got.votes += 1; addDay(it, dayStr(), 0, 1); changed = true;
  } else if (!want && has) {
    delete it.voters[who];
    it.got.votes = Math.max(0, it.got.votes - 1); addDay(it, dayStr(), 0, -1); changed = true;
  }
  if (changed) { it.updatedAt = new Date().toISOString(); await writeStats(env, st); }
  const votes = Math.max(0, it.base.votes + it.got.votes);
  return json({ ok: true, slug, votes, voted: want === 1, changed }, { cors, headers: { 'cache-control': 'no-store' } });
}

/* POST /api/stats/seed { items: { slug: { views, votes } } }  (cần khoá)
   Nạp số cũ (từ Firebase hoặc file) làm “nền”; chạy lại bao nhiêu lần cũng vậy. */
async function seedStats(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const items = body.items || {};
  await flushStats(env);
  const st = await readStats(env);
  let n = 0;
  const skipped = [];
  Object.keys(items).forEach((k) => {
    const slug = cleanSlug(k);
    if (!slug) { skipped.push(k); return; }
    const it = statOf(st, slug);
    it.base.views = Math.max(0, Math.round(Number(items[k].views) || 0));
    it.base.votes = Math.max(0, Math.round(Number(items[k].votes) || 0));
    it.updatedAt = new Date().toISOString();
    n++;
  });
  await writeStats(env, st);
  return json({ ok: true, updated: n, skipped: skipped.slice(0, 10), source: 'seed' }, { cors });
}

/* POST /api/stats/import-firebase (cần khoá) — kéo số cũ từ Firestore về KV 1 lần.
   Chỉ cần khi muốn giữ số lượt đọc/phiếu của site cũ; Firestore đang chặn đọc
   thì phải mở rules 1 lần (worker/README.md §5). Sau đó không dùng Firebase nữa. */
async function importFirebaseStats(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const project = env.FIREBASE_PROJECT || 'chuseoz-library';
  const items = {};
  let pageToken = '', pages = 0;
  try {
    do {
      const u = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/novelData?pageSize=300` +
        (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      const r = await fetch(u, { headers: { 'user-agent': 'chuseoz-worker/' + VERSION } });
      if (!r.ok) throw new Error('Firestore trả về ' + r.status + (r.status === 403 ? ' (đang chặn quyền đọc — mở rules 1 lần rồi bấm lại)' : ''));
      const d = await r.json();
      (d.documents || []).forEach((doc) => {
        const key = cleanSlug(decodeURIComponent(String(doc.name || '').split('/').pop()).replace(/\.html$/, ''));
        if (!key) return;
        const f = {};
        Object.entries(doc.fields || {}).forEach(([k, v]) => { f[k] = fbVal(v); });
        items[key] = { views: Number(f.views) || 0, votes: Number(f.votes) || 0 };
      });
      pageToken = d.nextPageToken || '';
    } while (pageToken && ++pages < 10);
  } catch (e) {
    return json({ ok: false, error: 'chưa đọc được số liệu Firebase: ' + e.message, hint: 'mở quyền đọc Firestore cho novelData (worker/README.md §5) hoặc dán file JSON vào /api/stats/seed' }, { status: 502, cors });
  }
  if (!Object.keys(items).length) return json({ ok: false, error: 'Firestore không có bản ghi novelData nào' }, { status: 404, cors });
  await flushStats(env);
  const st = await readStats(env);
  Object.keys(items).forEach((slug) => {
    const it = statOf(st, slug);
    it.base.views = Math.max(it.base.views || 0, items[slug].views);
    it.base.votes = Math.max(it.base.votes || 0, items[slug].votes);
    it.updatedAt = new Date().toISOString();
  });
  await writeStats(env, st);
  return json({ ok: true, updated: Object.keys(items).length, source: 'firebase:' + project + '/novelData' }, { cors });
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

/* chống spam đơn giản bằng KV: khoá rl:* tự hết hạn */
async function rateLimit(env, key, limit, ttlSec) {
  if (!env.CZ_KV) return true;
  const cur = parseInt((await env.CZ_KV.get(key)) || '0', 10) || 0;
  if (cur >= limit) return false;
  await env.CZ_KV.put(key, String(cur + 1), { expirationTtl: ttlSec });
  return true;
}

/* ---------------------------------------------------------------------------
   Đồng bộ lại metadata từ Blogger: trang /p/list-novel.html có 62 thẻ
   <div class="truyen-card" data-author data-couple data-series data-year>
   → lấy tên (span.truyen-card-title), slug, ảnh bìa, nhãn đếm, tình trạng, 18+
   rồi ghép vào registry đang có trong KV. Chương thì đã nằm trong KV.
   --------------------------------------------------------------------------- */
async function syncBlogger(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: 'sai hoặc thiếu X-Admin-Key' }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const blog = (env.BLOG || 'https://chuseoz.blogspot.com').replace(/\/+$/, '');
  const [listRes, sched] = await Promise.all([
    fetch(blog + '/p/list-novel.html', { headers: { 'user-agent': 'chuseoz-worker/1.0' }, cf: { cacheTtl: 120, cacheEverything: true } }),
    readScheduleFromBlog(env),
  ]);
  if (!listRes.ok) return json({ ok: false, error: 'không tải được trang danh sách: ' + listRes.status }, { status: 502, cors });
  const html = await listRes.text();
  const cards = parseCards(html);
  if (!cards.length) {
    return json({ ok: false, error: 'không thấy thẻ truyện nào trong trang danh sách (định dạng trang đã đổi?)', cards: 0 }, { status: 422, cors });
  }
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
    ['author', 'couple', 'year', 'thumb', 'status', 'is18'].forEach((f) => {
      if (c[f] !== undefined && String(c[f]) !== String(n[f] === undefined ? '' : n[f])) { n[f] = c[f]; changed++; }
    });
    if (c.count) {
      if (String(c.count) !== String(n.countLabel || '')) { n.countLabel = c.count; changed++; }
      const have = parseInt(String(c.count).split('/')[0], 10) || 0;
      if (have > (n.chapters || 0)) { n.chapters = have; changed++; }
    }
    n.statusRaw = c.status || n.statusRaw;
  }
  if (sched) reg.schedule = { ...sched, note: sched.note || 'Lịch có thể thay đổi nếu có việc đột xuất.' };
  reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  reg.source = { synced: new Date().toISOString(), note: 'đồng bộ từ blogspot (list-novel + lịch ra chương)' };
  await env.CZ_KV.put('registry', JSON.stringify(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  await env.CZ_KV.put('_last', new Date().toISOString());
  return json({ ok: true, cards: cards.length, changed, rev: reg.rev, schedule: !!sched, log: log.slice(0, 20) }, { cors });
}
/* thẻ truyện trên Blogger là <div class="truyen-card" ...> (có <div> lồng bên
   trong) nên không bắt cặp <div>…</div> bằng regex được: cắt theo thẻ mở rồi
   đọc phần nội dung tới thẻ mở kế tiếp. */
function parseCards(html) {
  const out = [];
  const re = /<div[^>]+class="[^"]*truyen-card[^"]*"[^>]*>/g;
  const opens = [];
  let m;
  while ((m = re.exec(String(html)))) opens.push({ tag: m[0], end: m.index + m[0].length });
  for (let i = 0; i < opens.length; i++) {
    const tag = opens[i].tag;
    const body = String(html).slice(opens[i].end, i + 1 < opens.length ? opens[i + 1].end - opens[i + 1].tag.length : undefined);
    const attr = (k) => { const x = tag.match(new RegExp('data-' + k + '="([^"]*)"')); return x ? unesc(x[1]) : ''; };
    const titleSpan = body.match(/class="[^"]*truyen-card-title[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const title = (titleSpan ? titleSpan[1] : '').replace(/<[^>]+>/g, '').trim() || attr('title');
    const href = (body.match(/href="([^"]+)"/) || [, ''])[1];
    const img = (body.match(/<img[^>]+src="([^"]+)"/) || [, ''])[1];
    const count = (body.match(/class="[^"]*badge-count[^"]*"[^>]*>([^<]*)</) || [, ''])[1].replace(/\s+/g, ' ').trim();
    const status = (body.match(/class="[^"]*badge-chapters[^"]*"[^>]*>([^<]*)</) || [, ''])[1].replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const series = attr('series').replace(/^series-/, '');
    const pslug = (href.match(/\/p\/([^/.]+)\.html/) || [, ''])[1];
    out.push({
      title: unesc(title), slug: series || pslug || slugify(title), url: href, thumb: img,
      author: attr('author'), couple: attr('couple'), year: attr('year'),
      is18: /badge-18/.test(body), count, status: status || '',
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
     Google (cache theo kid), rồi cấp session token (HS256, ký bằng SESSION_SECRET).
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

/* Khoá công khai Google: JWKS trả cả n/e lẫn x5c. Bản cũ lấy x5c (là CHỨNG CHỈ
   X.509) đưa thẳng vào importKey('spki', …) → DataError: Invalid keyData, nên
   đăng nhập Google KHÔNG BAO GIỜ thành công. Giờ ưu tiên n/e, và nếu chỉ có x5c
   thì tự tách SubjectPublicKeyInfo ra khỏi chứng chỉ. */
const _keys = new Map();     /* kid -> CryptoKey */
async function googlePubKey(kid) {
  if (kid && _keys.has(kid)) return _keys.get(kid);
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) throw new Error('không tải được khoá công khai Google (' + r.status + ')');
  const jwks = await r.json();
  const cert = (jwks.keys || []).find((k) => k.kid === kid) || (kid ? null : (jwks.keys || [])[0]);
  if (!cert) throw new Error('không tìm thấy khoá kid=' + kid);
  const alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  let key = null;
  if (cert.n && cert.e) {
    key = await crypto.subtle.importKey('jwk', { kty: cert.kty || 'RSA', n: cert.n, e: cert.e, alg: 'RS256', ext: true }, alg, false, ['verify']);
  } else if (cert.x5c && cert.x5c[0]) {
    key = await crypto.subtle.importKey('spki', spkiFromCert(_b64.toBytes(cert.x5c[0], false)), alg, false, ['verify']);
  } else throw new Error('khoá Google thiếu cả n/e lẫn x5c');
  if (kid) { _keys.set(kid, key); if (_keys.size > 12) _keys.delete(_keys.keys().next().value); }
  return key;
}
/* đọc SubjectPublicKeyInfo ra khỏi chứng chỉ X.509 (DER) — chỉ cần đi qua vài
   trường ASN.1: version, serial, signature, issuer, validity, subject, SPKI */
function spkiFromCert(buf) {
  const len = (b, i) => {
    const f = b[i++];
    if (!(f & 0x80)) return [f, i];
    let n = f & 0x7f, v = 0;
    for (let j = 0; j < n; j++) v = (v << 8) | b[i++];
    return [v, i];
  };
  let i = 0;
  if (buf[i++] !== 0x30) throw new Error('chứng chỉ Google sai định dạng');
  [, i] = len(buf, i);                       /* Certificate */
  if (buf[i++] !== 0x30) throw new Error('chứng chỉ Google sai định dạng (TBS)');
  [, i] = len(buf, i);                       /* TBSCertificate */
  let j = i;
  if (buf[j] === 0xa0) { const [l, nx] = len(buf, j + 1); j = nx + l; }   /* version [0] */
  const skip = () => { const [l, nx] = len(buf, j + 1); j = nx + l; };
  skip(); skip(); skip(); skip(); skip();    /* serial, sigAlg, issuer, validity, subject */
  if (buf[j] !== 0x30) throw new Error('không thấy SubjectPublicKeyInfo trong chứng chỉ');
  const [l, start] = len(buf, j + 1);
  return buf.subarray(j, start + l);
}
async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('idToken sai định dạng');
  const header = JSON.parse(_dec(_b64.toBytes(parts[0], true)));
  if (header.alg && String(header.alg).toUpperCase() !== 'RS256') throw new Error('idToken dùng thuật toán không hỗ trợ: ' + header.alg);
  const payload = JSON.parse(_dec(_b64.toBytes(parts[1], true)));
  const sig = _b64.toBytes(parts[2], true);
  const data = _enc(parts[0] + '.' + parts[1]);
  const key = await googlePubKey(header.kid);
  const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
  if (!ok) throw new Error('chữ ký idToken không hợp lệ');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('idToken đã hết hạn');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) throw new Error('idToken sai audience (cần khớp GOOGLE_CLIENT_ID)');
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') throw new Error('idToken sai issuer');
  if (payload.email_verified === false) throw new Error('email Google chưa xác thực');
  return payload;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', _enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(user, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const payload = {
    uid: user.uid, email: user.email || '', name: user.name || '', picture: user.picture || '',
    iat: Math.floor(Date.now() / 1000), exp,
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
/* exp gửi kèm để web tự biết khi nào hết phiên (không phải gọi /api/auth/me) */
function publicUser(u) {
  let exp = 0;
  try { exp = (u && u.exp) || 0; } catch (e) {}
  return { uid: u.uid, email: u.email || '', name: u.name || 'Bạn đọc', picture: u.picture || '', exp };
}
function publicComment(c) { return { id: c.id, uid: c.uid, name: c.name || 'Bạn đọc', picture: c.picture || '', text: c.text, createdAt: c.createdAt }; }

async function authGoogle(req, env, cors) {
  const secret = env.SESSION_SECRET || '';
  const cid = env.GOOGLE_CLIENT_ID || '';
  if (!secret) return json({ ok: false, error: 'Worker chưa đặt secret SESSION_SECRET' }, { status: 500, cors });
  if (!cid) return json({ ok: false, error: 'Worker chưa đặt biến GOOGLE_CLIENT_ID' }, { status: 500, cors });
  const body = await req.json().catch(() => ({}));
  const cred = String(body.credential || '');
  if (!cred) return json({ ok: false, error: 'thiếu credential (idToken)' }, { status: 400, cors });
  if (!await rateLimit(env, 'rl:login:' + hash(req.headers.get('cf-connecting-ip') || 'x'), 30, 600)) {
    return json({ ok: false, error: 'thử đăng nhập hơi nhiều, đợi 10 phút nữa' }, { status: 429, cors });
  }
  let payload;
  try { payload = await verifyGoogleIdToken(cred, cid); }
  catch (e) { return json({ ok: false, error: 'xác thực Google thất bại: ' + e.message }, { status: 401, cors }); }
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const user = { uid: payload.sub, email: payload.email || '', name: payload.name || payload.email || 'Bạn đọc', picture: payload.picture || '', exp };
  const token = await signSession(user, secret);
  return json({ ok: true, token, user: publicUser(user) }, { cors });
}
async function authMe(req, env, cors) {
  const u = await userFromReq(req, env);
  if (!u) return json({ ok: false, error: 'chưa đăng nhập' }, { status: 401, cors });
  return json({ ok: true, user: publicUser(u) }, { cors });
}
async function getComments(slug, req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const arr = (await env.CZ_KV.get('cmt:' + slug, { type: 'json' })) || [];
  let limit = 200;
  try { limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '200', 10) || 200, 300); } catch (e) {}
  const comments = arr.slice(0, limit).map(publicComment);
  return json({ ok: true, comments, count: arr.length, slug }, { cors, headers: { 'cache-control': 'public, max-age=15' } });
}
async function postComment(slug, req, env, cors) {
  const u = await userFromReq(req, env);
  if (!u) return json({ ok: false, error: 'bạn cần đăng nhập để bình luận' }, { status: 401, cors });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (text.length < 1) return json({ ok: false, error: 'bình luận không được trống' }, { status: 400, cors });
  if (!env.CZ_KV) return noKV(cors);
  if (!await rateLimit(env, 'rl:cmt:' + hash(u.uid), 3, 600)) {
    return json({ ok: false, error: 'bạn bình luận hơi nhanh — 10 phút nữa hãy gửi tiếp' }, { status: 429, cors });
  }
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
  if (!env.CZ_KV) return noKV(cors);
  const key = 'cmt:' + slug;
  const arr = (await env.CZ_KV.get(key, { type: 'json' })) || [];
  const idx = arr.findIndex((c) => c.id === id);
  if (idx < 0) return json({ ok: false, error: 'không thấy bình luận' }, { status: 404, cors });
  if (arr[idx].uid !== u.uid) return json({ ok: false, error: 'chỉ xoá được bình luận của chính bạn' }, { status: 403, cors });
  arr.splice(idx, 1);
  await env.CZ_KV.put(key, JSON.stringify(arr));
  return json({ ok: true, deleted: id }, { cors });
}
