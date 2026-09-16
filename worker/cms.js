/* ============================================================================
   ssochuz — Worker đọc/ghi dữ liệu truyện + số liệu xếp hạng trên Cloudflare KV
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
     GET    /feed.xml                   → RSS 2.0: 30 chương mới nhất (mở)
     GET    /feed.xml?slug=<slug>       → RSS 2.0: chương mới của 1 bộ (mở)

     POST   /api/view                   → đếm 1 lượt đọc {slug, vid, ch} (mở)
     POST   /api/vote                   → bầu/bỏ bầu {slug, ch?, vote:1|0, vid}
                                           · không gửi ch = phiếu cho cả bộ
                                           · ch = 12      = phiếu riêng chương 12
                                           trả về { votes, total, chapVotes, votesDay/Week/Month }

     PUT    /api/registry               → ghi dữ liệu thư viện      (cần X-Admin-Key)
     PUT    /api/book/<slug>            → ghi 1 bộ + chương, TỰ đếm lại số chương
                                           trong registry          (cần X-Admin-Key)
     DELETE /api/book/<slug>            → xoá 1 bộ                  (cần X-Admin-Key)
     POST   /api/recount                → đếm lại số chương của MỌI bộ, sửa registry
                                           (chữa bệnh "hiện 30 mà chỉ có 29") (cần X-Admin-Key)
     POST   /api/seed                   → nạp nhiều bộ một lần      (cần X-Admin-Key)
     POST   /api/sync                   → đồng bộ lại từ Blogger    (cần X-Admin-Key)
     POST   /api/import                 → 1 bài Blogger → 1 chương  (cần X-Admin-Key)
     POST   /api/stats/seed             → nạp số liệu cũ (Firebase/file) (cần X-Admin-Key)
     POST   /api/stats/import-firebase  → tự kéo số cũ từ Firestore (cần X-Admin-Key)
     POST   /api/stats/refresh          → ghi hết số đang đệm ra KV (cần X-Admin-Key)
     GET    /api/admin/comments         → mọi bình luận để kiểm duyệt (cần X-Admin-Key)
     GET    /api/admin/stats            → số liệu chi tiết + chuỗi 60 ngày (cần X-Admin-Key)
     GET    /api/admin/log              → nhật ký 200 thao tác gần nhất (cần X-Admin-Key)
     GET    /api/admin/voters?slug=     → AI ĐÃ BẦU bộ này: phiếu cả bộ + phiếu từng
                                           chương, kèm khoá người bầu (cần X-Admin-Key)
     POST   /api/admin/vote-remove      → GỠ PHIẾU của người được chọn
                                           { slug, ch, keys: [...] } (cần X-Admin-Key)
     POST   /api/admin/votes/reset      → RESET dữ liệu bầu { slug?, ch? }
                                           · không có slug = reset MỌI bộ
                                           · không có ch   = xoá cả phiếu bộ lẫn phiếu chương
                                           (cần X-Admin-Key)

     POST   /api/auth/supabase          → access_token Supabase → session (mở)
     POST   /api/auth/google            → idToken Google → session (mở, cách cũ)
     GET    /api/auth/me                → user từ session           (cần Bearer)
     GET    /api/auth/config            → web đã bật đăng nhập chưa, bằng gì (mở)
     GET    /api/comments/<slug>        → đọc bình luận (?ch=12 để lọc theo chương) (mở)
                                           · trả thêm parentId để dựng chuỗi trả lời
     POST    /api/comments/<slug>       → gửi bình luận {text, ch}  (cần Bearer)
     DELETE /api/comments/<slug>/<id>   → xoá bình luận của mình (hoặc của ai nếu là
                                           quản trị: ADMIN_KEY / email trong ADMIN_EMAILS)

   ---------------------------------------------------------------------------
   BIẾN MÔI TRƯỜNG (Settings → Variables and Secrets)
     ADMIN_KEY         (secret, bắt buộc)  — khoá quản trị, dài ≥ 24 ký tự
     CZ_KV             (KV binding, bắt buộc)
     BLOG              (tuỳ chọn) = https://chuseoz.blogspot.com
     ALLOW_ORIGIN      (tuỳ chọn) = https://chuseoz.pages.dev  (nhiều domain: phẩy)
     SITE_BASE         (tuỳ chọn) = https://ssochuz.pages.dev  (gốc dựng link trong /feed.xml; để trống = domain này)
     SUPABASE_URL      (bắt buộc nếu đăng nhập Supabase) = https://<ref>.supabase.co
     SUPABASE_JWT_SECRET (chỉ project cũ ký HS256) — Auth → Settings → JWT Secret
     ADMIN_EMAILS      (secret/tuỳ chọn) — email được vào /admin; không đặt trong frontend/registry
     GOOGLE_CLIENT_ID  (secret/tuỳ chọn)    — Client ID của OAuth Web app (Google Identity Services)
     SESSION_SECRET    (secret, bắt buộc*)  — chuỗi ngẫu nhiên ≥ 32 ký tự, ký session bình luận/đăng nhập
                                            (*) bắt buộc nếu bật bình luận/đăng nhập người dùng
     STATS_FLUSH_MS    (tuỳ chọn) = 10000  — gom lượt đọc bao nhiêu mili-giây thì ghi KV
     FIREBASE_PROJECT  (KHÔNG cần nữa)      — chỉ dùng cho /api/stats/import-firebase
                                              khi muốn kéo số liệu cũ về KV một lần
     MAIL_TO           (tuỳ chọn)  — BẬT GỬI EMAIL báo lỗi chữ bằng FormSubmit, chỉ cần điền email nhận
                                     (lần đầu FormSubmit gửi 1 thư xác nhận, bấm Confirm là xong)
     RESEND_API_KEY    (tuỳ chọn)  — đường gửi chuyên nghiệp: khoá API resend.com (free 100 mail/ngày)
     MAIL_FROM         (tuỳ chọn)  — địa chỉ gửi của Resend, vd: ssochuz library <bao-loi@ten-mien-cua-ban>
   ============================================================================ */

const VERSION = '1.9.6';
const JSONH = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let p = url.pathname.replace(/\/+$/, '') || '/';
    const org = url.origin;   /* gốc dùng dựng khoá cache khi cần xoá sau mỗi lần ghi */

    /* Cổng chặn dò khoá: áp cho MỌI endpoint có gửi X-Admin-Key (kể cả /api/whoami) */
    if (req.headers.get('x-admin-key')) {
      const blocked = await adminThrottle(req, env, cors);
      if (blocked) return blocked;
    }

    /* Mọi handler đều `await`: không await thì lỗi bên trong lọt ra ngoài try/catch
       và Cloudflare trả trang lỗi 1101 thay vì JSON — rất khó đoán bệnh. */
    try {
      /* ---------- mở: chỉ đọc ---------- */
      if (p === '/' || p === '/api/health') return await health(env, cors);
      if (p === '/api/whoami' || p === '/api/auth') {
        if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
        return json({ ok: true, role: 'admin', version: VERSION }, { cors });
      }
      if (p === '/api/registry' && req.method === 'GET') return await edgeCached(req, cors, EDGE_TTL.registry, () => getKV(env, 'registry', cors, 60));
      if (p === '/api/schedule' && req.method === 'GET') return await getSchedule(env, ctx, cors);
      if (p === '/api/stats' && req.method === 'GET') return await edgeCached(req, cors, EDGE_TTL.stats, () => getStats(env, cors));
      if (p === '/feed.xml' && req.method === 'GET') return await edgeCached(req, cors, EDGE_TTL.feed, () => getFeed(req, env, cors), feedKeyOf);

      /* ---------- số liệu xếp hạng: đếm lượt đọc / bình chọn ----------
         Lượt đọc KHÔNG xoá cache (người đọc đông mà mỗi lượt lại xoá thì cache
         vô nghĩa — số đọc trễ tối đa 60 giây là chấp nhận được); bình chọn thì
         xoá để bảng xếp hạng thấy số mới ngay. */
      if (p === '/api/view' && req.method === 'POST') return await postView(req, env, ctx, cors);
      if (p === '/api/vote' && req.method === 'POST') {
        const vr = await postVote(req, env, cors);
        if (vr.ok) await edgePurge(org + '/api/stats');
        return vr;
      }
      /* báo lỗi chữ trong chương: người đọc bấm 1 nút là nội dung đi thẳng tới
         hộp thư ban biên tập — tự lưu vào KV, không cần copy/mở Gmail nữa */
      if (p === '/api/report' && req.method === 'POST') return await postReport(req, env, ctx, cors);

      /* ---------- người dùng: đăng nhập (Supabase/Google) + bình luận ---------- */
      if (p === '/api/auth/supabase' && req.method === 'POST') return await authSupabase(req, env, cors);
      if (p === '/api/auth/google' && req.method === 'POST') return await authGoogle(req, env, cors);
      if (p === '/api/auth/me' && req.method === 'GET') return await authMe(req, env, cors);
      if (p === '/api/auth/config' && req.method === 'GET') return await authConfig(env, cors);
      let mc = p.match(/^\/api\/comments\/([^/]+)\/([^/]+)$/);
      if (mc && req.method === 'DELETE') return await deleteComment(decodeURIComponent(mc[1]), mc[2], req, env, cors);
      let mc2 = p.match(/^\/api\/comments\/([^/]+)$/);
      if (mc2 && req.method === 'GET') return await getComments(decodeURIComponent(mc2[1]), req, env, cors);
      if (mc2 && req.method === 'POST') return await postComment(decodeURIComponent(mc2[1]), req, env, cors);

      let m = p.match(/^\/api\/book\/(.+)$/);
      if (m && req.method === 'GET') return await edgeCached(req, cors, EDGE_TTL.book, () => getKV(env, 'book:' + decodeURIComponent(m[1]), cors, 300));

      /* ---------- cần khoá quản trị ---------- */
      if (p === '/api/registry' && req.method === 'PUT') {
        const r = await putKV(req, env, 'registry', cors, 'cập nhật thư viện (registry)');
        if (r.ok) { await edgePurge(org + '/api/registry'); await purgeFeed(org); }
        return r;
      }
      if (m && req.method === 'PUT') {
        const r = await putBook(req, env, decodeURIComponent(m[1]), cors);
        if (r.ok) { await edgePurge(org + '/api/book/' + m[1], org + '/api/registry'); await purgeFeed(org); }   /* m[1] còn nguyên mã hoá — đúng khoá cache lúc GET */
        return r;
      }
      if (m && req.method === 'DELETE') {
        if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
        if (!env.CZ_KV) return noKV(cors);
        const slug = decodeURIComponent(m[1]);
        await env.CZ_KV.delete('book:' + slug);
        await syncCountToRegistry(env, slug, null);       /* registry không còn treo số chương của bộ đã xoá */
        await logAct(env, 'xoá bộ ' + slug, req);
        await edgePurge(org + '/api/book/' + m[1], org + '/api/registry');
        await purgeFeed(org);
        return json({ ok: true, deleted: slug }, { cors });
      }
      if (p === '/api/recount' && req.method === 'POST') {
        const r = await recount(req, env, cors);
        if (r.ok) await edgePurge(org + '/api/registry', org + '/api/stats');
        return r;
      }
      if (p === '/api/admin/comments' && req.method === 'GET') return await adminComments(req, env, cors);
      if (p === '/api/admin/log' && req.method === 'GET') return await adminLog(req, env, cors);
      if (p === '/api/admin/stats' && req.method === 'GET') return await adminStats(req, env, cors);
      if (p === '/api/admin/reports' && req.method === 'GET') return await adminReports(req, env, cors);
      if (p === '/api/admin/voters' && req.method === 'GET') return await adminVoters(req, env, cors);
      if (p === '/api/admin/vote-remove' && req.method === 'POST') {
        const r = await adminVoteRemove(req, env, cors);
        if (r.ok) await edgePurge(org + '/api/stats');
        return r;
      }
      if (p === '/api/admin/votes/reset' && req.method === 'POST') {
        const r = await adminVotesReset(req, env, cors);
        if (r.ok) await edgePurge(org + '/api/stats');
        return r;
      }
      if (p === '/api/seed' && req.method === 'POST') {
        const r = await seed(req, env, cors);
        if (r.ok) {
          await edgePurge(org + '/api/registry', org + '/api/stats');
          await edgePurgePrefix(org, '/api/book/');
          await purgeFeed(org);
        }
        return r;
      }
      if (p === '/api/sync' && req.method === 'POST') {
        const r = await syncBlogger(req, env, cors);
        if (r.ok) { await edgePurge(org + '/api/registry', org + '/api/stats'); await purgeFeed(org); }
        return r;
      }
      if (p === '/api/import' && req.method === 'POST') return await importPost(req, env, cors);
      if (p === '/api/stats/seed' && req.method === 'POST') {
        const r = await seedStats(req, env, cors);
        if (r.ok) await edgePurge(org + '/api/stats');
        return r;
      }
      if (p === '/api/stats/import-firebase' && req.method === 'POST') {
        const r = await importFirebaseStats(req, env, cors);
        if (r.ok) await edgePurge(org + '/api/stats');
        return r;
      }
      if (p === '/api/stats/refresh' && req.method === 'POST') {
        if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
        if (!env.CZ_KV) return noKV(cors);
        const flushed = await flushStats(env);
        await env.CZ_KV.delete('stats_cache');      /* khoá cache của bản cũ (nếu còn) */
        await edgePurge(org + '/api/stats');        /* và bản lưu ở biên của bản mới */
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
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
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
    nov.updated = new Date().toISOString().slice(0, 10);
    if (nov.status === 'Sắp ra mắt') nov.status = 'Đang cập nhật';
    await applyRealCounts(env, reg);            /* số chương + nhãn lấy theo chương thật */
    reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
    reg.source = { synced: new Date().toISOString(), note: 'nhập từ bài viết Blogger qua trang quản trị' };
    await env.CZ_KV.put('registry', registryJSON(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  }
  await env.CZ_KV.put('_last', new Date().toISOString());
  await logAct(env, 'nhập chương từ Blogger: ' + slug + ' → ' + chapTitle, req);
  const iorg = new URL(req.url).origin;
  await edgePurge(iorg + '/api/book/' + encodeURIComponent(slug), iorg + '/api/registry');
  await purgeFeed(iorg);
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
    keep.push(safeImageSrc(src));
    return '\u0000IMG' + (keep.length - 1) + '\u0000';
  });
  /* Bỏ MỌI thuộc tính ngoài href http(s) của thẻ <a>: chặn onclick/onerror và cả
     href="javascript:..." lọt từ bài Blogger vào thẳng trang đọc.
       · thẻ chữ (b/strong/i/em/u/p): gỡ hết thuộc tính
       · thẻ <a>: chỉ dựng lại khi href là http(s); còn lại bỏ thẻ, giữ chữ */
  h = h.replace(/<(b|strong|i|em|u|p)\b[^>]*>/gi, '<$1>')
       .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (m, inner) => {
         const href = (m.match(/href="(https?:\/\/[^"]+)"/i) || [])[1];
         return href ? '<a href="' + href + '" rel="noopener nofollow" target="_blank">' + inner + '</a>' : inner;
       })
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

/* Ảnh từ Blogger là dữ liệu không tin cậy: chỉ giữ URL http(s), bỏ userinfo
   và control/quote để không thể biến thành javascript:/data: hoặc phá thuộc tính. */
function safeImageSrc(src) {
  const s = String(src || '').trim().slice(0, 1200);
  if (!/^https?:\/\//i.test(s) || /[\u0000-\u001f\u007f"'<>]/.test(s)) return '';
  try {
    const u = new URL(s);
    if (u.username || u.password) return '';
    return u.href;
  } catch (e) { return ''; }
}

function normTitle(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9à-ỹ]+/gi, '');
}

/* =========================== tiện ích =========================== */
function corsHeaders(req, env) {
  /* Production mặc định đóng theo hai domain thật; chỉ mở * khi quản trị chủ động
     đặt ALLOW_ORIGIN="*" (không khuyến nghị). */
  const allowRaw = String((env && env.ALLOW_ORIGIN) || 'https://ssochuz.pages.dev,https://chuseoz.blogspot.com').trim();
  const origin = req.headers.get('Origin') || '';
  let ao = '*';
  if (allowRaw === '*') {
    ao = '*';
  } else {
    const list = allowRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin) {
      /* So khớp theo TÊN MIỀN, đúng ranh giới dấu chấm: "chuseoz.pages.dev" chỉ nhận
         chuseoz.pages.dev và x.chuseoz.pages.dev, KHÔNG nhận "acchuseoz.pages.dev"
         (kiểu lỗi cũ: origin.endsWith(tên miền) nên bất kỳ tên miền nào có đuôi
         giống vậy cũng được phản chiếu lại → trang lạ gọi được API). */
      let host = '';
      try { host = new URL(origin).host.toLowerCase(); } catch (e) { host = ''; }
      const hostMatch = (d) => {
        let dh = String(d || '').trim().toLowerCase();
        if (!dh) return false;
        dh = dh.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/^\*\./, '');
        return !!host && (host === dh || host.endsWith('.' + dh));
      };
      if (list.includes(origin) || list.some(hostMatch)) {
        ao = origin;
      } else {
        /* Chỉ mở cho origin ĐỂ THỬ: localhost (máy chạy thử) và *.e2b.app (khung xem
           trước khi sửa). KHÔNG mở cho mọi *.pages.dev nữa — bản xem trước của chính
           web đã khớp ở luật đuôi tên miền bên trên (abc.ssochuz.pages.dev vẫn qua),
           còn *.pages.dev của người khác thì không. */
        const okPreview = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.e2b\.app)$/i.test(origin);
        if (okPreview || list.includes('*')) ao = origin;
        else ao = list[0] || '*' ;
      }
    } else {
      ao = list[0] || '*';
    }
  }
  const headers = {
    'access-control-allow-origin': ao,
    'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-admin-key,x-import-mode,authorization',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  /* KHÔNG gửi access-control-allow-credentials: web này xác thực bằng header
     (X-Admin-Key / Authorization), không dùng cookie phiên — nên không có lý do
     cho phép trình duyệt gửi kèm cookie từ một origin khác. */
  return headers;
}
function json(obj, { status = 200, cors = {}, headers = {} } = {}) {
  const h = { ...JSONH, ...cors, ...headers };
  Object.keys(h).forEach((k) => { if (h[k] === undefined || h[k] === null) delete h[k]; });
  return new Response(JSON.stringify(obj), { status, headers: h });
}
function noKV(cors) {
  return json({
    ok: false, kv: false,
    error: 'Worker chưa gắn KV CZ_KV — Settings → Bindings → KV namespace (Variable name CZ_KV), hoặc id trong wrangler.toml vẫn là DAN_ID_KV_VAO_DAY (placeholder). Tạo KV rồi dán id thật, deploy lại.',
  }, { status: 503, cors });
}
/* IP người gọi (Cloudflare luôn có cf-connecting-ip; x-forwarded-for chỉ là dự phòng). */
function clientIp(req) {
  if (!req || !req.headers) return '';
  return String(req.headers.get('cf-connecting-ip')
    || String(req.headers.get('x-forwarded-for') || '').split(',')[0]).trim().slice(0, 64);
}
/* Chống DÒ khoá quản trị: chỉ đếm các lần SAI (đúng thì không ảnh hưởng), quá
   25 lần sai trong 10 phút từ cùng một IP thì khoá tạm 10 phút. */
async function adminThrottle(req, env, cors) {
  if (!env.CZ_KV) return null;
  if (!req.headers.get('x-admin-key')) return null;
  if (authed(req, env)) return null;
  const ok = await rateLimit(env, 'rl:adm:' + hash(clientIp(req) || 'x'), 25, 600);
  if (ok) return null;
  return json({ ok: false, error: 'sai khoá quản trị quá nhiều lần — thử lại sau 10 phút' }, { status: 429, cors });
}

/* ADMIN_KEY thường bị dính khoảng trắng khi copy từ Dashboard/terminal.
   Chỉ bỏ khoảng trắng ở hai đầu — không đổi phần khoá ở giữa — để thao tác
   dán khoá an toàn hơn mà không làm giảm việc so sánh chính xác. */
function adminKey(env) {
  /* Dashboard/password manager đôi khi thêm ký tự zero-width khi copy secret. */
  return String((env && env.ADMIN_KEY) || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}
function adminAuthError(env) {
  return adminKey(env)
    ? 'sai X-Admin-Key — Worker đã nhận yêu cầu nhưng ADMIN_KEY không khớp secret đang chạy'
    : 'Worker chưa đặt secret ADMIN_KEY — vào Settings → Variables and Secrets → Secret → ADMIN_KEY rồi Deploy lại';
}
function authed(req, env) {
  const want = adminKey(env);
  const got = String(req.headers.get('x-admin-key') || '').trim();
  if (!want) return false;
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
/* Registry là API công khai. Chỉ cho qua đúng các trường cấu hình đăng nhập vốn
   bắt buộc phải công khai trong trình duyệt; xoá email quản trị, email nhận thư
   và mọi trường lạ để một lần dán nhầm secret không biến thành rò rỉ lâu dài. */
function isSafePublishableKey(value) {
  const key = String(value || '').trim();
  if (!key || /^sb_secret_/i.test(key)) return false;
  /* Legacy anon/service_role đều là JWT: đọc claim role (không cần verify chỉ để
     phân loại dữ liệu cấu hình). service_role tuyệt đối không được phát hành. */
  if (key.split('.').length === 3) {
    try {
      let p = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      const role = String(JSON.parse(atob(p)).role || '').toLowerCase();
      if (role === 'service_role') return false;
    } catch (e) { return false; }
  }
  return true;
}
function stripPrivateRegistrySettings(reg) {
  if (!reg || typeof reg !== 'object') return reg;
  const settings = reg.settings;
  if (!settings || typeof settings !== 'object') return reg;
  const auth = settings.auth;
  if (auth && typeof auth === 'object' && !Array.isArray(auth)) {
    const publicAuth = {};
    ['provider', 'supabaseUrl', 'googleClientId'].forEach((k) => {
      if (auth[k] !== undefined && auth[k] !== null && auth[k] !== '') publicAuth[k] = auth[k];
    });
    if (isSafePublishableKey(auth.supabaseAnonKey)) publicAuth.supabaseAnonKey = auth.supabaseAnonKey;
    if (Object.keys(publicAuth).length) settings.auth = publicAuth;
    else delete settings.auth;
  } else if (Object.prototype.hasOwnProperty.call(settings, 'auth')) delete settings.auth;
  const report = settings.report;
  if (report && typeof report === 'object' && !Array.isArray(report) && report.form) {
    settings.report = { form: report.form };
  } else if (Object.prototype.hasOwnProperty.call(settings, 'report')) delete settings.report;
  return reg;
}
function registryJSON(reg) { return JSON.stringify(stripPrivateRegistrySettings(reg)); }
/* ================= CACHE BIÊN CHO 3 ĐƯỜNG ĐỌC NHIỀU ==================
   GET /api/registry, /api/book/<slug>, /api/stats: hàng trăm người cùng đọc
   trong một phút thì KV chỉ bị đọc 1 lần — các lần sau Worker phục vụ từ bản
   lưu ở biên (edge), không chạm KV nên không tốn quota đọc.
   · Worker TỰ quản lý hạn dùng: lúc ghi dán mốc giờ vào header nội bộ
     `x-cz-cached-at`, lần đọc sau quá hạn thì coi như trượt và đọc lại từ KV
     (không trông chờ tầng ngoài tôn trọng Cache-Control).
   · CORS theo từng origin nên PHẢI lột sạch trước khi ghi — khi đọc trúng thì
     đắp CORS mới đúng origin người đang hỏi (nếu không người sau nhận nhầm
     origin của người trước, trình duyệt chặn oan).
   · URL có query (dạng phá cache `?_=…` của bản web cũ) đi thẳng KV, không
     ghi/đọc bản lưu — vừa luôn mới vừa tránh bị bơm đầy cache bằng khoá rác.
   · Mỗi lần GHI thành công (PUT/DELETE/vote/seed/…) đều xoá đúng mục cache
     liên quan nên “sửa thấy ngay” vẫn giữ nguyên. Header `x-cz-cache`
     (HIT/MISS/BYPASS) để ngoài trình duyệt kiểm chứng được bằng DevTools. */
function edgeCache() {
  try { return (typeof caches !== 'undefined' && caches.default) || null; } catch (e) { return null; }
}
const EDGE_TTL = { registry: 60, book: 300, stats: 60, feed: 600 };   /* giây, theo URL */
async function edgeCached(req, cors, secs, load, keyFn) {
  let key = req.url;
  if (key.indexOf('?') >= 0) {
    /* URL có query: chỉ cache khi caller đưa hàm chuẩn hoá khoá (như feed dùng
       feedKeyOf) — nếu không vẫn đi thẳng KV để tránh bị bơm đầy cache bằng
       khoá rác (?_=123, ?_=124…). */
    key = (typeof keyFn === 'function' && keyFn(req)) || '';
    if (!key) {
      const raw = await load();
      try { raw.headers.set('x-cz-cache', 'BYPASS'); } catch (e) {}
      return raw;
    }
  }
  const box = edgeCache();
  if (box) {
    let hit = null;
    try { hit = await box.match(key); } catch (e) { hit = null; }
    if (hit) {
      let fresh = false;
      try { fresh = (Date.now() - (parseInt(hit.headers.get('x-cz-cached-at') || '0', 10) || 0)) < secs * 1000; } catch (e) { fresh = false; }
      if (fresh) {
        try {
          const h = new Headers(hit.headers);
          h.delete('x-cz-cached-at');
          Object.keys(cors).forEach((k) => h.set(k, cors[k]));
          h.set('x-cz-cache', 'HIT');
          return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
        } catch (e) { /* đọc ra hỏng thì làm lại từ KV bên dưới */ }
      } else { try { await box.delete(key); } catch (e) {} }
    }
  }
  const res = await load();
  /* chỉ lưu đáp ứng thành công — lỗi (404/503/…) luôn đọc lại từ KV */
  if (box && res && res.status === 200) {
    try {
      const h = new Headers(res.headers);
      ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers',
       'access-control-max-age', 'vary', 'x-cz-cache'].forEach((k) => h.delete(k));
      h.set('x-cz-cached-at', String(Date.now()));
      await box.put(key, new Response(res.clone().body, { status: res.status, statusText: res.statusText, headers: h }));
    } catch (e) { /* ghi cache hỏng thì bỏ qua — đáp ứng thật vẫn trả bình thường */ }
  }
  try { res.headers.set('x-cz-cache', 'MISS'); } catch (e) {}
  return res;
}
async function edgePurge(...urls) {
  const box = edgeCache();
  if (!box) return;
  for (const u of urls) { try { await box.delete(u); } catch (e) {} }
}
/* xoá cả chùm /api/book/* (khi seed chạm nhiều bộ một lúc) */
async function edgePurgePrefix(origin, prefix) {
  const box = edgeCache();
  if (!box || typeof box.keys !== 'function') return;
  let keys = [];
  try { keys = await box.keys(); } catch (e) { return; }
  for (const k of keys) {
    const u = String((k && k.url) || k || '');
    if (u === origin + prefix || u.startsWith(origin + prefix)) {
      try { await box.delete(u); } catch (e) {}
    }
  }
}
/* feed RSS cũng lưu ở biên: xoá cả feed chung lẫn feed từng bộ khi truyện/chương đổi */
async function purgeFeed(org) {
  await edgePurge(org + '/feed.xml');
  await edgePurgePrefix(org, '/feed.xml?');
}
/* ==================== RSS 2.0: /feed.xml và /feed.xml?slug= ====================
   Feed reader (Feedly/Inoreader/…) poll nhiều lần mỗi ngày nên Worker TỰ cache
   10 phút ở biên. Mỗi lần làm mới feed chung chỉ đọc tối đa 13 khoá KV
   (1 registry + 12 bộ mới cập nhật nhất) — khoảng 1.9k lượt đọc/ngày, nằm gọn
   trong free tier. Mỗi lần ghi chương (PUT/DELETE/import/seed/sync/…) đều xoá
   bản lưu nên chương mới lên feed ngay. */
function feedKeyOf(req) {
  /* khoá cache CHUẨN của feed: tối đa 63 mục (1 feed chung + 62 bộ), tham số rác
     (?slug=x&utm=1,2,…) gộp hết về một khoá nên không bơm đầy cache được */
  try {
    const u = new URL(req.url);
    const raw = u.searchParams.get('slug') || '';
    const s = cleanSlug(raw);
    if (raw && !s) return '';   /* slug bậy: không cache, để handler trả 400 */
    return u.origin + '/feed.xml' + (s ? '?slug=' + s : '');
  } catch (e) { return ''; }
}
function escXml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function rfc822(s) {
  const d = s ? new Date(s) : new Date();
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}
function chapSnippet(html, len) {
  const t = String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  if (t.length <= len) return t;
  return t.slice(0, len).replace(/\s+\S*$/, '') + '…';
}
function feedChapTitle(c, i) {
  return String((c && c.t) || '').trim() || ('Chương ' + (i + 1));
}
async function getFeed(req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const u = new URL(req.url);
  const rawSlug = String(u.searchParams.get('slug') || '');
  const slug = cleanSlug(rawSlug);
  if (rawSlug && !slug) return json({ ok: false, error: 'slug không hợp lệ' }, { status: 400, cors });
  const base = String(env.SITE_BASE || 'https://ssochuz.pages.dev').replace(/\/+$/, '') || 'https://ssochuz.pages.dev';
  const reg = (await env.CZ_KV.get('registry', { type: 'json' })) || { lib: [] };
  const lib = Array.isArray(reg.lib) ? reg.lib : [];
  const bySlug = {};
  lib.forEach((n) => { if (n && n.slug) bySlug[n.slug] = n; });
  let chan, items = [];
  if (slug) {
    const nov = bySlug[slug];
    const book = await env.CZ_KV.get('book:' + slug, { type: 'json' });
    const chs = (book && Array.isArray(book.chapters)) ? book.chapters : [];
    if (!chs.length) return json({ ok: false, error: 'bộ này chưa có chương nào' }, { status: 404, cors });
    const title = (nov && nov.title) || (book && book.title) || slug;
    chan = {
      title: title + ' — ssochuz library',
      link: base + '/truyen/' + slug + '/',
      desc: (nov && nov.syn) || (book && book.syn) || ('Đọc truyện ' + title + ' trên ssochuz library.'),
    };
    const pub = rfc822((nov && nov.updated) || (reg && reg.rev));
    items = chs.map((c, i) => ({
      t: feedChapTitle(c, i),
      link: base + '/truyen/' + slug + '/chuong-' + (i + 1) + '/',
      pub, desc: chapSnippet(c.html, 300),
    })).reverse().slice(0, 50);
  } else {
    const cands = lib.filter((n) => n && n.slug && (parseInt(n.chapters, 10) || 0) > 0)
      .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || ''))).slice(0, 12);
    const books = await Promise.all(cands.map((n) => env.CZ_KV.get('book:' + n.slug, { type: 'json' }).catch(() => null)));
    cands.forEach((n, k) => {
      const book = books[k];
      const chs = (book && Array.isArray(book.chapters)) ? book.chapters : [];
      const take = chs.slice(-5);
      take.forEach((c, j) => {
        const pos = chs.length - take.length + j + 1;
        items.push({
          t: (n.title || n.slug) + ' — ' + feedChapTitle(c, pos - 1),
          link: base + '/truyen/' + n.slug + '/chuong-' + pos + '/',
          pub: rfc822(n.updated || (reg && reg.rev)),
          desc: chapSnippet(c.html, 300),
          date: String(n.updated || ''),
        });
      });
    });
    items.sort((a, b) => String(b.date).localeCompare(String(a.date))).splice(30);
    chan = {
      title: 'ssochuz library — Chương mới',
      link: base + '/',
      desc: 'Chương mới đăng trên ssochuz library — cập nhật mỗi 10 phút.',
    };
  }
  const self = u.origin + '/feed.xml' + (slug ? '?slug=' + slug : '');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n' +
    '  <title>' + escXml(chan.title) + '</title>\n' +
    '  <link>' + escXml(chan.link) + '</link>\n' +
    '  <description>' + escXml(chan.desc) + '</description>\n' +
    '  <language>vi-vn</language>\n' +
    '  <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n' +
    '  <atom:link href="' + escXml(self) + '" rel="self" type="application/rss+xml" />\n' +
    items.map((it) => '  <item>\n    <title>' + escXml(it.t) + '</title>\n' +
      '    <link>' + escXml(it.link) + '</link>\n' +
      '    <guid isPermaLink="true">' + escXml(it.link) + '</guid>\n' +
      '    <pubDate>' + it.pub + '</pubDate>\n' +
      '    <description>' + escXml(it.desc) + '</description>\n  </item>').join('\n') +
    '\n</channel>\n</rss>\n';
  return new Response(xml, {
    headers: {
      ...cors,
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=600',
    },
  });
}
async function getKV(env, key, cors, cacheSec) {
  if (!env.CZ_KV) return noKV(cors);
  const { value, metadata } = await env.CZ_KV.getWithMetadata(key, { type: 'text' });
  if (value == null) return json({ ok: false, error: 'chưa có dữ liệu cho khoá ' + key }, { status: 404, cors });
  let publicValue = value;
  if (key === 'registry') {
    try { publicValue = registryJSON(JSON.parse(value)); } catch (e) { publicValue = value; }
  }
  /* max-age=0: trình duyệt luôn hỏi lại → trúng cache biên (nhanh mà không tốn
     lượt đọc KV); s-maxage: bản lưu ở biên dùng được từng này giây. */
  const h = { ...JSONH, ...cors, 'cache-control': 'public, max-age=0, s-maxage=' + (cacheSec || 60), 'x-kv-key': key };
  /* ETag cũ mô tả bản chưa lọc nên không gửi cho registry đã được làm sạch. */
  if (key !== 'registry' && metadata && metadata.etag) h.etag = metadata.etag;
  return new Response(publicValue, { headers: h });
}
async function putKV(req, env, key, cors, label) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  let body = await req.text();
  if (new TextEncoder().encode(body).length > 24 * 1024 * 1024) return json({ ok: false, error: 'dữ liệu quá lớn (>24MB)' }, { status: 413, cors });
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { return json({ ok: false, error: 'JSON lỗi: ' + e.message }, { status: 400, cors }); }
  if (key === 'registry') body = registryJSON(parsed);
  const bytes = new TextEncoder().encode(body).length;
  const saved = new Date().toISOString();
  await env.CZ_KV.put(key, body, { metadata: { saved, rev: parsed.rev || '', bytes } });
  await env.CZ_KV.put('_last', saved);           // mốc thời gian ghi gần nhất
  if (label) await logAct(env, label, req);
  return json({ ok: true, key, bytes, saved }, { cors });
}

/* ============================================================================
   SỐ CHƯƠNG LUÔN KHỚP VỚI CHƯƠNG THẬT
   ----------------------------------------------------------------------------
   Bệnh cũ: sửa file JSON trên GitHub (30/30 → 29/29) nhưng web vẫn hiện 30, vì
   web đọc registry TRÊN KV trước, file trong repo chỉ là đường dự phòng. Con số
   trong registry lại là bản chép tay nên dễ lệch với số chương thật của bộ.
   Cách chữa: (1) mỗi lần ghi 1 bộ, Worker tự đếm lại chương và sửa registry;
   (2) có nút POST /api/recount để quét toàn bộ KV một lần;
   (3) web tự đối chiếu số chương thật khi mở bộ truyện (cz-app.js → reconcile).
   ============================================================================ */
function chapLen(book) {
  const c = book && Array.isArray(book.chapters) ? book.chapters : null;
  return c ? c.length : null;
}
/* Nhãn số chương: "<đã đăng>/<dự kiến>". Dự kiến lấy từ trường `planned` (nếu
   biên tập viên khai) — KHÔNG moi lại con số cũ trong nhãn, vì chính con số cũ
   đó là thứ làm web hiện "30 chương" sau khi đã xoá chương và sửa nhãn thành 29/29. */
function countLabelOf(n, real) {
  real = Math.max(0, parseInt(real, 10) || 0);
  const plannedRaw = parseInt((n && (n.planned || n.declared)) || 0, 10) || 0;
  if (real === 0 && plannedRaw === 0) return '0/—';
  const planned = Math.max(real, plannedRaw);
  if (planned === 0) return real + '/—';
  return real + '/' + planned;
}
/* ghi lại số chương thật vào registry; trả về {changed, was, now, label} */
async function syncCountToRegistry(env, slug, book) {
  if (!env.CZ_KV || !slug) return { changed: false };
  const reg = await env.CZ_KV.get('registry', { type: 'json' });
  if (!reg || !Array.isArray(reg.lib)) return { changed: false };
  const n = reg.lib.find((x) => x && x.slug === slug);
  if (!n) return { changed: false };
  const real = chapLen(book);
  if (real == null) return { changed: false };          /* không có sách → không đoán */
  const was = Number(n.chapters) || 0;
  const labelWas = String(n.countLabel || '');
  const labelNow = countLabelOf(n, real);
  const changed = was !== real || labelWas !== labelNow;
  if (!changed) return { changed: false, was, now: real };
  n.chapters = real;
  n.countLabel = labelNow;
  n.count = labelNow;
  n.canRead = real > 0;
  reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await env.CZ_KV.put('registry', registryJSON(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  await env.CZ_KV.put('_last', new Date().toISOString());
  return { changed: true, was, now: real, labelWas, labelNow, rev: reg.rev };
}
/* PUT /api/book/<slug> — ghi 1 bộ RỒI tự sửa số chương trong registry */
async function putBook(req, env, slug, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.text();
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > 24 * 1024 * 1024) return json({ ok: false, error: 'dữ liệu quá lớn (>24MB)' }, { status: 413, cors });
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { return json({ ok: false, error: 'JSON lỗi: ' + e.message }, { status: 400, cors }); }
  if (!Array.isArray(parsed.chapters)) parsed.chapters = [];
  /* bỏ chương rỗng cả tiêu đề lẫn nội dung — chính chúng là thủ phạm làm lệch số chương */
  const before = parsed.chapters.length;
  parsed.chapters = parsed.chapters.filter((c) => c && (String(c.t || '').trim() || String(c.html || '').trim()));
  const dropped = before - parsed.chapters.length;
  parsed.slug = slug;
  const saved = new Date().toISOString();
  await env.CZ_KV.put('book:' + slug, JSON.stringify(parsed), { metadata: { saved, chapters: parsed.chapters.length, bytes } });
  await env.CZ_KV.put('_last', saved);
  const sync = await syncCountToRegistry(env, slug, parsed);
  await logAct(env, 'lưu bộ ' + slug + ' (' + parsed.chapters.length + ' chương)', req);
  return json({ ok: true, key: 'book:' + slug, bytes, saved, chapters: parsed.chapters.length, dropped, registry: sync }, { cors });
}
/* POST /api/recount — quét mọi bộ trên KV, đếm lại chương, sửa registry một lượt.
   Đây là nút "chữa cháy" cho những bộ đang hiện sai số chương ngoài web. */
/* đếm lại số chương THẬT của mọi bộ có trong KV rồi sửa registry.
   Dùng chung cho /api/recount, /api/seed và /api/sync (3 chỗ từng làm lệch số). */
async function applyRealCounts(env, reg) {
  const out = { fixed: [], missing: [], orphan: [], books: 0 };
  if (!env.CZ_KV || !reg || !Array.isArray(reg.lib)) return out;
  const keys = [];
  let cursor;
  do {
    const l = await env.CZ_KV.list({ prefix: 'book:', limit: 1000, cursor });
    l.keys.forEach((k) => keys.push(k.name));
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  out.books = keys.length;
  const bySlug = {};
  reg.lib.forEach((n) => { if (n && n.slug) bySlug[n.slug] = n; });
  for (const k of keys) {
    const slug = decodeURIComponent(k.slice('book:'.length));
    const book = await env.CZ_KV.get(k, { type: 'json' });
    const real = chapLen(book);
    /* KV chưa có chương nào (bộ mới, hoặc dữ liệu chưa được nạp lên) thì ĐỪNG sửa:
       ép về 0/0 sẽ xoá mất nhãn đúng vừa đồng bộ từ Blogger. */
    if (real == null || real === 0) continue;
    const n = bySlug[slug];
    if (!n) { out.orphan.push({ slug, chapters: real }); continue; }
    const was = Number(n.chapters) || 0;
    const labelWas = String(n.countLabel || '');
    const labelNow = countLabelOf(n, real);
    if (was !== real || labelWas !== labelNow) {
      n.chapters = real; n.countLabel = labelNow; n.count = labelNow; n.canRead = real > 0;
      out.fixed.push({ slug, title: n.title || '', was, now: real, labelWas, labelNow });
    }
  }
  reg.lib.forEach((n) => {
    if (!n || !n.slug) return;
    if (keys.indexOf('book:' + n.slug) < 0) out.missing.push({ slug: n.slug, title: n.title || '', chapters: Number(n.chapters) || 0 });
  });
  if (out.fixed.length) reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return out;
}
/* POST /api/recount — nút "đếm lại số chương" trong trang quản trị.
   Chữa đúng bệnh: web hiện 30 chương dù bộ chỉ có 29 (registry treo số cũ). */
async function recount(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const reg = (await env.CZ_KV.get('registry', { type: 'json' })) || { lib: [] };
  reg.lib = reg.lib || [];
  const res = await applyRealCounts(env, reg);
  if (res.fixed.length) {
    reg.source = { synced: new Date().toISOString(), note: 'đếm lại số chương từ kho chương trên KV (/api/recount)' };
    await env.CZ_KV.put('registry', registryJSON(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
    await env.CZ_KV.put('_last', new Date().toISOString());
    await logAct(env, 'đếm lại số chương: sửa ' + res.fixed.length + ' bộ', req);
  }
  return json({ ok: true, books: res.books, novels: reg.lib.length, fixed: res.fixed, missing: res.missing, orphan: res.orphan, rev: reg.rev || '' }, { cors });
}

/* ============================================================================
   NHẬT KÝ HOẠT ĐỘNG (activity log) — 200 dòng gần nhất, khoá KV `log`
   ============================================================================ */
async function logAct(env, text, req) {
  if (!env.CZ_KV) return;
  try {
    const arr = (await env.CZ_KV.get('log', { type: 'json' })) || [];
    let who = 'admin-key';
    try {
      const h = (req && req.headers && req.headers.get('authorization')) || '';
      const a = h ? await userFromReq(req, env) : null;
      if (a && a.user && a.user.email) who = a.user.email;
    } catch (e) {}
    arr.unshift({ at: new Date().toISOString(), text: String(text || '').slice(0, 200), who });
    if (arr.length > 200) arr.length = 200;
    await env.CZ_KV.put('log', JSON.stringify(arr));
  } catch (e) { /* nhật ký không được làm hỏng thao tác chính */ }
}
async function adminLog(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const arr = (await env.CZ_KV.get('log', { type: 'json' })) || [];
  return json({ ok: true, items: arr, count: arr.length }, { cors, headers: { 'cache-control': 'no-store' } });
}
/* GET /api/admin/comments?slug=&limit= — gộp bình luận của mọi bộ để kiểm duyệt */
async function adminComments(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const u = new URL(req.url);
  const only = String(u.searchParams.get('slug') || '');
  const limit = Math.min(parseInt(u.searchParams.get('limit') || '500', 10) || 500, 2000);
  const keys = [];
  let cursor;
  do {
    const l = await env.CZ_KV.list({ prefix: 'cmt:', limit: 1000, cursor });
    l.keys.forEach((k) => keys.push(k.name));
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  const out = [];
  for (const k of keys) {
    const slug = decodeURIComponent(k.slice('cmt:'.length));
    if (only && slug !== only) continue;
    const arr = (await env.CZ_KV.get(k, { type: 'json' })) || [];
    arr.forEach((c) => out.push(Object.assign({ slug }, publicComment(c))));
    if (out.length >= limit) break;
  }
  out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return json({ ok: true, comments: out.slice(0, limit), count: out.length, slugs: keys.length },
    { cors, headers: { 'cache-control': 'no-store' } });
}
/* GET /api/admin/stats — số liệu chi tiết (kèm chuỗi ngày + phiếu theo chương) */
async function adminStats(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  await flushStats(env);
  const st = await readStats(env);
  const today = dayStr();
  const items = {};
  const series = {};
  Object.keys(st.items).forEach((slug) => {
    const it = st.items[slug] || {};
    items[slug] = publicStat(it, today);
    items[slug].voters = Object.keys(it.voters || {}).length;
    items[slug].chapVotes = it.chap || {};
    const days = it.days || {};
    Object.keys(days).forEach((d) => {
      const s = series[d] || (series[d] = { views: 0, votes: 0 });
      s.views += days[d].v || 0; s.votes += days[d].o || 0;
    });
  });
  const days = Object.keys(series).sort().slice(-60).map((d) => Object.assign({ day: d }, series[d]));
  return json({ ok: true, updatedAt: st.updatedAt || '', items, days }, { cors, headers: { 'cache-control': 'no-store' } });
}
/* ============================================================================
   QUẢN TRỊ PHIẾU BẦU (gỡ phiếu của từng người · reset dữ liệu bầu)
   ----------------------------------------------------------------------------
   Khoá trong `voters` có dạng:
     `g:<hash>` / `a:<vid>` / `i:<hash>`         → phiếu cho CẢ BỘ
     `g:<hash>#12` / `a:<vid>#12` / …            → phiếu cho CHƯƠNG 12
   Trang quản trị đọc danh sách này để hiện từng người kèm ô tick; tick ai thì
   gọi /api/admin/vote-remove để gỡ đúng phiếu của người đó.
   Giá trị mỗi khoá: { t: <ISO lúc bầu> } — bản cũ lưu số 1, vẫn đọc được.
   ============================================================================ */
function voterKind(key) {
  const s = String(key || '');
  if (s.startsWith('g:')) return 'user';
  if (s.startsWith('a:')) return 'device';
  if (s.startsWith('i:')) return 'ip';
  return 'other';
}
const VOTER_KIND_VI = { user: 'Tài khoản', device: 'Thiết bị', ip: 'Địa chỉ IP', other: 'Khác' };
function voterInfo(key, ch) {
  const raw = String(key || '');
  const body = ch > 0 ? raw.replace(/#\d+$/, '') : raw;
  const kind = voterKind(body);
  return {
    key: raw,
    ch: ch || 0,
    kind,
    kindLabel: VOTER_KIND_VI[kind] || 'Khác',
    id: body.replace(/^[a-z]+:/, ''),
    at: '',
  };
}
/* GET /api/admin/voters?slug= — ai đã bầu bộ này, theo từng chương */
/* ---------------------------------------------------------------------------
   BÁO LỖI CHỮ  (POST /api/report)
   Người đọc chỉ bấm “Gửi báo lỗi” là xong: Worker lưu báo lỗi vào KV rồi GỬI
   EMAIL tới mọi địa chỉ trong ADMIN_EMAILS, kèm tên bộ + chương + link. Không
   phải copy nội dung rồi tự mở Gmail nữa.
   · Gửi email cần 2 biến (không bắt buộc): RESEND_API_KEY, MAIL_FROM
     (vd MAIL_FROM = "ssochuz library <bao-loi@ten-mien-cua-ban>").
     Chưa cấu hình thì báo lỗi vẫn được lưu vào KV và hiện ở trang quản trị,
     chỉ là không có email — hàm trả mailed:false kèm lý do.
   · Chống spam: 6 lần/giờ cho mỗi máy, 40 lần/giờ cho mỗi IP.
   --------------------------------------------------------------------------- */
/* Link người dùng gửi kèm báo lỗi: CHỈ nhận http/https (bỏ javascript:, data:,
   vbscript:…). Trang quản trị in link này ra nút “Mở” nên nếu nhận bừa thì
   người lạ có thể nhét javascript: vào và chạy mã trong phiên quản trị. */
function safeLink(u, env) {
  const s = String(u || '').trim().slice(0, 300);
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    const h = new URL(s).host.toLowerCase();
    const allow = String((env && env.ALLOW_ORIGIN) || '').split(',').map((x) => x.trim().replace(/^https?:\/\//, '').replace(/^\*\./, '')).filter(Boolean);
    if (allow.length && allow.indexOf('*') < 0) {
      const ok = allow.some((d) => h === d || h.endsWith('.' + d)
        || /\.(pages\.dev|e2b\.app|blogspot\.com)$/i.test(h) || h === 'localhost');
      if (!ok) return '';
    }
    return s;
  } catch (e) { return ''; }
}
async function postReport(req, env, ctx, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').trim().slice(0, 4000);
  if (text.length < 3) return json({ ok: false, error: 'nội dung báo lỗi quá ngắn' }, { status: 400, cors });
  const ip = clientIp(req);
  const who = viewerOf(req, body);
  if (!(await rateLimit(env, 'rl:report:' + (who || ('ip:' + hash(ip))), 6, 3600)) ||
      !(await rateLimit(env, 'rl:report-ip:' + hash(ip || 'x'), 40, 3600))) {
    return json({ ok: false, error: 'bạn đã gửi hơi nhiều báo lỗi — thử lại sau ít phút nhé' }, { status: 429, cors });
  }
  let user = null;
  try { user = (await userFromReq(req, env)).user; } catch (e) { user = null; }
  const it = {
    at: new Date().toISOString(),
    kind: String(body.kind || 'Báo lỗi chữ').replace(/[\r\n]+/g, ' ').slice(0, 60),
    slug: cleanSlug(body.slug) || '',
    title: String(body.title || '').replace(/[\r\n]+/g, ' ').slice(0, 140),
    ch: Math.max(0, parseInt(body.ch, 10) || 0),
    url: safeLink(body.url, env),
    text,
    who: (user && user.email) || who || 'khách',
  };
  const list = (await env.CZ_KV.get('report', { type: 'json' })) || [];
  list.unshift(it);
  if (list.length > 300) list.length = 300;
  await env.CZ_KV.put('report', JSON.stringify(list));
  await logAct(env, 'báo lỗi mới: ' + (it.title || it.slug || '?') + (it.ch ? ' · chương ' + it.ch : ''), req);
  const mail = await mailReport(env, it);
  return json({ ok: true, mailed: !!mail.sent, note: mail.reason || '', at: it.at }, { cors });
}

/* gửi email báo lỗi (Resend). Chưa cấu hình thì trả sent:false + lý do, KHÔNG ném lỗi. */
/* Gửi email báo lỗi cho quản trị. Hai đường, tự chọn:
   1) RESEND_API_KEY + MAIL_FROM  → Resend (thư đẹp, cần tên miền đã xác thực).
   2) MAIL_TO                     → FormSubmit (KHÔNG cần khoá, không cần tên miền:
      điền email nhận là xong; lần gửi đầu FormSubmit gửi 1 thư xác nhận, bấm
      Confirm trong thư đó là từ đó về sau thư về đều).
   Chưa đặt gì thì báo lỗi vẫn được lưu vào KV và hiện ở tab Báo lỗi trong /admin. */
async function mailReport(env, it) {
  const to = String(env.MAIL_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  const admins = adminEmails(env);
  const line = 'Báo lỗi · ' + (it.title || it.slug || 'không rõ bộ') + (it.ch ? ' · chương ' + it.ch : '');
  const body = [
    line,
    it.url ? it.url : '(không có link)',
    '',
    it.text,
    '',
    '— Gửi từ ssochuz library lúc ' + it.at + ' · người gửi: ' + it.who,
  ].join('\n');
  const key = env.RESEND_API_KEY, from = env.MAIL_FROM;
  if (key && from) {
    if (!admins.length) return { sent: false, reason: 'chưa đặt ADMIN_EMAILS nên không biết gửi cho ai' };
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: admins, subject: line, text: body, reply_to: (it.who && it.who.indexOf('@') > 0) ? it.who : undefined }),
      });
      await r.json().catch(() => ({}));
      if (r.ok) return { sent: true, reason: 'đã chuyển email tới ban biên tập' };
      return { sent: false, reason: 'dịch vụ email tạm từ chối (' + r.status + ')' };
    } catch (e) {
      return { sent: false, reason: 'chưa kết nối được dịch vụ email' };
    }
  }
  const box = to.length ? to : admins;
  if (key && !from) return { sent: false, reason: 'thiếu MAIL_FROM (địa chỉ gửi) — điền địa chỉ đã xác thực trong Resend' };
  if (!box.length) return { sent: false, reason: 'chưa đặt MAIL_TO (hoặc ADMIN_EMAILS) nên chưa biết gửi email cho ai' };
  try {
    const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(box[0]), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        _subject: line,
        _template: 'table',
        _captcha: 'false',
        'Truyện': it.title || it.slug || '',
        'Chương': it.ch ? String(it.ch) : 'cả bộ',
        'Link': it.url || '',
        'Người gửi': it.who || 'khách',
        'Nội dung báo lỗi': it.text,
      }),
    });
    const d = await r.json().catch(() => ({}));
    const msg = String((d && (d.message || d.error)) || '');
    if (r.ok && String(d && d.success) === 'true') return { sent: true, reason: 'đã chuyển email tới ban biên tập' };
    if (/confirm|activat|xác nhận/i.test(msg)) {
      return { sent: false, reason: 'quản trị cần mở hộp thư nhận và bấm “Confirm/Activate” FormSubmit một lần' };
    }
    return { sent: false, reason: 'dịch vụ email tạm từ chối (' + r.status + ')' };
  } catch (e) {
    return { sent: false, reason: 'chưa kết nối được dịch vụ email' };
  }
}

/* GET /api/admin/reports — danh sách báo lỗi gần nhất để trang quản trị xem lại */
async function adminReports(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const items = (await env.CZ_KV.get('report', { type: 'json' })) || [];
  const q = String(new URL(req.url).searchParams.get('q') || '').toLowerCase();
  const out = q ? items.filter((x) => (x.text + ' ' + x.title + ' ' + x.slug).toLowerCase().indexOf(q) >= 0) : items;
  return json({ ok: true, items: out.slice(0, 100), count: out.length, mail: !!env.RESEND_API_KEY && !!env.MAIL_FROM });
}

async function adminVoters(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const u = new URL(req.url);
  const slug = cleanSlug(u.searchParams.get('slug'));
  if (!slug) return json({ ok: false, error: 'thiếu slug hợp lệ' }, { status: 400, cors });
  await flushStats(env);
  const st = await readStats(env);
  const it = statOf(st, slug);
  const book = [];
  const chapters = {};
  Object.keys(it.voters || {}).forEach((key) => {
    const m = String(key).match(/#(\d+)$/);
    const ch = m ? parseInt(m[1], 10) : 0;
    const val = it.voters[key];
    const info = voterInfo(key, ch);
    info.at = (val && typeof val === 'object' && val.t) ? val.t : '';
    if (ch > 0) {
      const box = chapters[ch] || (chapters[ch] = { count: 0, voters: [] });
      box.voters.push(info);
    } else book.push(info);
  });
  Object.keys(chapters).forEach((ch) => { chapters[ch].count = chapters[ch].voters.length; });
  const pub = publicStat(it, dayStr());
  return json({
    ok: true, slug, source: 'kv',
    total: pub.votes,                                   /* tổng phiếu đang hiện trên web */
    counted: Math.max(0, (it.got || {}).votes || 0),    /* phần web tự đếm được */
    base: Math.max(0, (it.base || {}).votes || 0),      /* số cũ nhập từ Firebase/file */
    voters: Object.keys(it.voters || {}).length,
    book: { count: book.length, voters: book },
    chapters, chapVotes: pub.chapVotes,
    updatedAt: it.updatedAt || '',
  }, { cors, headers: { 'cache-control': 'no-store' } });
}
/* Trừ phiếu khỏi tổng: ưu tiên trừ phần web đếm được, hết thì trừ tiếp số cũ,
   và trừ dần vào lịch sử ngày gần nhất để biểu đồ không đứng số cũ. */
function decVotes(it, n) {
  n = Math.max(0, Math.round(Number(n) || 0));
  if (!n) return;
  it.got = it.got || { views: 0, votes: 0 };
  it.base = it.base || { views: 0, votes: 0 };
  const cut = Math.min(it.got.votes || 0, n);
  it.got.votes = Math.max(0, (it.got.votes || 0) - cut);
  let left = n - cut;
  if (left > 0) { it.base.votes = Math.max(0, (it.base.votes || 0) - left); left = 0; }
  let rest = n;
  Object.keys(it.days || {}).sort().reverse().forEach((k) => {
    if (rest <= 0) return;
    const d = it.days[k];
    const take = Math.min(d.o || 0, rest);
    d.o = (d.o || 0) - take;
    rest -= take;
  });
}
/* POST /api/admin/vote-remove { slug, ch, keys: [...] } — gỡ phiếu của người được chọn */
async function adminVoteRemove(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  if (!slug) return json({ ok: false, error: 'thiếu slug hợp lệ' }, { status: 400, cors });
  const ch = Math.max(0, Math.min(99999, parseInt(body.ch, 10) || 0));
  const keys = (Array.isArray(body.keys) ? body.keys : [])
    .map((k) => String(k || '').slice(0, 120)).filter(Boolean);
  if (!keys.length) return json({ ok: false, error: 'chưa chọn phiếu nào để gỡ' }, { status: 400, cors });
  const bad = keys.filter((k) => (ch > 0 ? !k.endsWith('#' + ch) : k.includes('#')));
  if (bad.length) {
    return json({ ok: false, error: 'có phiếu không thuộc ' + (ch > 0 ? ('chương ' + ch) : 'phiếu cả bộ') }, { status: 400, cors });
  }
  await flushStats(env);
  const st = await readStats(env);
  const it = statOf(st, slug);
  let removed = 0;
  keys.forEach((k) => { if (it.voters[k] != null) { delete it.voters[k]; removed++; } });
  if (removed) {
    decVotes(it, removed);
    if (ch > 0) {
      it.chap[ch] = Math.max(0, (Number(it.chap[ch]) || 0) - removed);
      if (!it.chap[ch]) delete it.chap[ch];
    }
    it.updatedAt = new Date().toISOString();
    await writeStats(env, st);
  }
  await logAct(env, 'gỡ ' + removed + ' phiếu ' + (ch > 0 ? ('chương ' + ch) : 'cả bộ') + ' · ' + slug, req);
  const pub = publicStat(it, dayStr());
  return json({ ok: true, slug, ch, removed, total: pub.votes, chapVotes: pub.chapVotes },
    { cors, headers: { 'cache-control': 'no-store' } });
}
/* POST /api/admin/votes/reset { slug?, ch? } — đưa phiếu về 0 để bắt đầu lại
   · không có slug → reset MỌI bộ
   · không có ch   → xoá cả phiếu cả bộ lẫn phiếu từng chương (GIỮ lượt đọc)
   · ch = 12       → chỉ xoá phiếu của chương 12 (của 1 bộ, hoặc của mọi bộ) */
async function adminVotesReset(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  const hasCh = body.ch != null && body.ch !== '';
  const ch = hasCh ? Math.max(1, Math.min(99999, parseInt(body.ch, 10) || 0)) : 0;
  await flushStats(env);
  const st = await readStats(env);
  const targets = slug ? [slug] : Object.keys(st.items || {});
  let stories = 0, cleared = 0;
  targets.forEach((s) => {
    const it = statOf(st, s);
    it.got = it.got || { views: 0, votes: 0 };
    it.base = it.base || { views: 0, votes: 0 };
    it.days = it.days || {};
    let n = 0;
    if (ch > 0) {
      Object.keys(it.voters || {}).forEach((k) => { if (String(k).endsWith('#' + ch)) { delete it.voters[k]; n++; } });
      const shown = Number(it.chap[ch]) || 0;
      if (shown > n) n = shown;                    /* số phiếu chương có thể lớn hơn số khoá còn lại */
      if (it.chap[ch]) delete it.chap[ch];
      decVotes(it, n);
    } else {
      n = Math.max(Object.keys(it.voters || {}).length,
        (Number(it.got.votes) || 0) + (Number(it.base.votes) || 0));
      it.voters = {};
      it.chap = {};
      it.got.votes = 0;
      it.base.votes = 0;
      Object.keys(it.days).forEach((d) => { it.days[d].o = 0; });
    }
    it.updatedAt = new Date().toISOString();
    if (n) stories++;
    cleared += n;
  });
  await writeStats(env, st);
  await logAct(env, 'reset phiếu ' + (slug ? ('bộ ' + slug) : 'TẤT CẢ bộ') +
    (ch > 0 ? (' · chỉ chương ' + ch) : '') + ' — xoá ' + cleared + ' phiếu', req);
  return json({ ok: true, slug: slug || '', ch, stories, cleared },
    { cors, headers: { 'cache-control': 'no-store' } });
}
/* LƯU Ý: health PHẢI gửi kèm header CORS. Trang quản trị (admin.js) gọi
   /api/health từ domain khác bằng fetch — nếu response thiếu
   Access-Control-Allow-Origin thì trình duyệt CHẶN kết quả (dù status 200),
   fetch ném "Failed to fetch" và admin báo nhầm là Worker chưa deploy. */
async function health(env, cors) {
  if (!env.CZ_KV) return json({ ok: true, version: VERSION, kv: false, books: 0, novels: 0, regRev: '', lastWrite: '', now: new Date().toISOString(), adminConfigured: !!adminKey(env), hint: 'chưa bind CZ_KV' }, { cors });
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
    ok: true, version: VERSION, kv: true, books, adminConfigured: !!adminKey(env), regRev: (reg && reg.rev) || '',
    novels: reg ? (reg.lib || []).length : 0, lastWrite: last, now: new Date().toISOString(),
    stats: { items: Object.keys(st.items).length, views, votes },
    /* để trang quản trị biết kênh đăng nhập đã sẵn sàng chưa, thiếu biến nào */
    auth: {
      supabase: !!supabaseURL(env), supabaseUrl: supabaseURL(env),
      supabaseHs256: !!(env.SUPABASE_JWT_SECRET), google: !!env.GOOGLE_CLIENT_ID,
      session: !!env.SESSION_SECRET, adminConfigured: adminEmails(env).length > 0,
      mail: (!!env.RESEND_API_KEY && !!env.MAIL_FROM) || !!env.MAIL_TO,
    },
  }, { cors });
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
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  let d; try { d = await req.json(); } catch (e) { return json({ ok: false, error: 'JSON lỗi' }, { status: 400, cors }); }
  const out = { books: 0, failed: [] };
  if (d.registry) await env.CZ_KV.put('registry', registryJSON(d.registry), { metadata: { saved: new Date().toISOString(), rev: d.registry.rev || '' } });
  const books = d.books || {};
  for (const slug of Object.keys(books)) {
    try { await env.CZ_KV.put('book:' + slug, JSON.stringify(books[slug])); out.books++; }
    catch (e) { out.failed.push(slug); }
  }
  await env.CZ_KV.put('_last', new Date().toISOString());
  /* nạp xong: đếm lại số chương để registry không treo con số cũ (bệnh "30 chương") */
  let counts = { fixed: 0 };
  if (d.registry) {
    const reg2 = await env.CZ_KV.get('registry', { type: 'json' });
    counts = await applyRealCounts(env, reg2);
    if (counts.fixed.length) {
      await env.CZ_KV.put('registry', registryJSON(reg2), { metadata: { saved: new Date().toISOString(), rev: reg2.rev || '' } });
    }
  }
  await logAct(env, 'nạp dữ liệu: ' + out.books + ' bộ' + (counts.fixed && counts.fixed.length ? ' · sửa số chương ' + counts.fixed.length + ' bộ' : ''), req);
  return json({ ok: true, ...out, registry: !!d.registry, recount: counts.fixed || [] }, { cors });
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
const FLUSH_MS = 10000;      /* gom lượt đọc trong RAM bao lâu thì ghi (đổi bằng biến STATS_FLUSH_MS) */
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
function blankStat() { return { base: { views: 0, votes: 0 }, got: { views: 0, votes: 0 }, days: {}, voters: {}, chap: {}, updatedAt: '' }; }
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
  it.chap = it.chap || {};          /* phiếu theo từng chương: { '12': 3 } */
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
  const chapVotes = {};
  Object.keys(it.chap || {}).forEach((k) => {
    const v = Math.max(0, Number(it.chap[k]) || 0);
    if (v) chapVotes[k] = v;
  });
  return {
    views: ((it.base || {}).views || 0) + ((it.got || {}).views || 0),
    /* votes = TỔNG phiếu của bộ (phiếu chung + phiếu của từng chương) → bảng xếp hạng tăng thật */
    votes: Math.max(0, ((it.base || {}).votes || 0) + ((it.got || {}).votes || 0)),
    viewsDay: b.vd, votesDay: b.od,
    viewsWeek: b.vw, votesWeek: b.ow,
    viewsMonth: b.vm, votesMonth: b.om,
    chapVotes,
    trendingScore: Math.round(b.vd + 0.4 * b.vw + 2 * b.ow),
    updatedAt: it.updatedAt || '',
  };
}

/* GET /api/stats — web đọc chỗ này để vẽ bảng xếp hạng (không cần Firebase)
   · Đọc kèm phần đang ĐỆM trong RAM (chưa kịp ghi KV) để lượt đọc/bình chọn
     hiện ngay tức thì, không phải chờ đợt gom ~10 giây.
   · Bản lưu ở biên dùng được 60 giây (tiết kiệm lượt đọc KV). Bệnh cũ “vote
     xong không thấy tăng vì cache” nay khỏi bằng 2 lớp: Worker tự XOÁ cache
     sau mỗi lần ghi số liệu, còn web vẽ số mới ngay khi bấm (lạc quan). */
async function getStats(env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const st = await readStats(env);
  const today = dayStr();
  const items = {};
  Object.keys(st.items).forEach((slug) => { items[slug] = publicStat(st.items[slug], today); });
  /* cộng phần đang đệm (của cả những bộ chưa có mặt trong KV) */
  for (const [slug, d] of _buf) {
    if (!d.v && !d.o) continue;
    const it = st.items[slug] || blankStat();
    const clone = {
      base: it.base || { views: 0, votes: 0 },
      got: { views: ((it.got || {}).views || 0) + d.v, votes: ((it.got || {}).votes || 0) + d.o },
      days: Object.assign({}, it.days), voters: it.voters, chap: it.chap, updatedAt: today,
    };
    const dd = Object.assign({ v: 0, o: 0 }, clone.days[today] || {});
    dd.v += d.v; dd.o += d.o;
    clone.days[today] = dd;
    items[slug] = publicStat(clone, today);
  }
  return json({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), updatedAt: st.updatedAt || '', items },
    { cors, headers: { 'cache-control': 'public, max-age=0, s-maxage=60' } });
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
  /* Mã máy (vid) do web gửi nên có thể bị đổi liên tục để thổi số. Chặn theo IP
     làm lớp thứ hai: quá 600 lượt/giờ từ một IP thì thôi không đếm nữa —
     KHÔNG báo lỗi, người đọc bình thường (kể cả sau NAT) không thấy gì khác. */
  if (!await rateLimit(env, 'rl:view-ip:' + hash(clientIp(req) || 'x'), 600, 3600)) {
    return json({ ok: true, counted: false }, { cors, headers: { 'cache-control': 'no-store' } });
  }
  const c = _buf.get(slug) || { v: 0, o: 0 };
  c.v += 1; _buf.set(slug, c);
  if (!_bufAt) _bufAt = Date.now();
  if (Date.now() - _bufAt >= flushMs(env)) await flushStats(env);
  else scheduleFlush(env, ctx);
  return json({ ok: true, counted: true, day }, { cors, headers: { 'cache-control': 'no-store' } });
}

/* POST /api/vote { slug, vote: 1|0, vid } — bầu/bỏ bầu, 1 người 1 phiếu */
/* POST /api/vote { slug, ch?, vote: 1|0, vid }
   · ch = 0 / không gửi  → phiếu cho CẢ BỘ (như cũ)
   · ch = 12              → phiếu cho riêng CHƯƠNG 12
   Mỗi người được thích MỖI CHƯƠNG MỘT LẦN (khoá voters là `who#ch`), và tổng
   phiếu của bộ vẫn tăng để bảng xếp hạng ngoài trang chủ phản ánh đúng.
   BỎ PHIẾU: nhận cả khoá đăng nhập (g:…) lẫn khoá máy (a:vid/i:ip) — phiếu
   đặt lúc ẩn danh vẫn gỡ được sau khi đăng nhập (và ngược lại), không còn
   cảnh "bỏ thích mà số không giảm". */
async function postVote(req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  if (!slug) return json({ ok: false, error: 'thiếu slug hợp lệ' }, { status: 400, cors });
  const u = (await userFromReq(req, env)).user;
  const ids = [];
  if (u) ids.push('g:' + hash(u.uid));
  const anon = viewerOf(req, body);
  if (anon && ids.indexOf(anon) < 0) ids.push(anon);
  if (!ids.length) return json({ ok: false, error: 'thiếu vid (mã máy) để chống bầu nhiều lần' }, { status: 400, cors });
  const who = ids[0];
  const ch = Math.max(0, Math.min(99999, parseInt(body.ch, 10) || 0));
  const want = (body.vote === 1 || body.vote === true || body.vote === '1') ? 1 : 0;
  /* mỗi chương một phiếu nên hạn mức rộng hơn trước (40/giờ → 400/giờ) */
  if (!await rateLimit(env, 'rl:vote:' + who, 400, 3600)) {
    return json({ ok: false, error: 'thao tác hơi nhanh, thử lại sau ít phút' }, { status: 429, cors });
  }
  /* Lớp theo IP: đổi vid liên tục cũng không bơm phiếu vô hạn được */
  if (!await rateLimit(env, 'rl:vote-ip:' + hash(clientIp(req) || 'x'), 150, 3600)) {
    return json({ ok: false, error: 'thao tác hơi nhanh, thử lại sau ít phút' }, { status: 429, cors });
  }
  await flushStats(env);
  const st = await readStats(env);
  const it = statOf(st, slug);
  const vkeys = ids.map((x) => (ch > 0 ? x + '#' + ch : x));
  const vkey = vkeys[0];
  const existing = vkeys.filter((k) => !!it.voters[k]);
  let changed = false;
  if (want && !existing.length) {
    if (Object.keys(it.voters).length < VOTER_CAP) it.voters[vkey] = { t: new Date().toISOString() };
    it.got.votes += 1; addDay(it, dayStr(), 0, 1);
    if (ch > 0) it.chap[ch] = (Number(it.chap[ch]) || 0) + 1;
    changed = true;
  } else if (!want && existing.length) {
    existing.forEach((k) => { delete it.voters[k]; });
    it.got.votes = Math.max(0, it.got.votes - existing.length); addDay(it, dayStr(), 0, -existing.length);
    if (ch > 0) {
      it.chap[ch] = Math.max(0, (Number(it.chap[ch]) || 0) - existing.length);
      if (!it.chap[ch]) delete it.chap[ch];
    }
    changed = true;
  }
  if (changed) { it.updatedAt = new Date().toISOString(); await writeStats(env, st); }
  const pub = publicStat(it, dayStr());
  return json({
    ok: true, slug, ch, changed, voted: want === 1,
    votes: ch > 0 ? (Number(it.chap[ch]) || 0) : pub.votes,   /* con số hiện ngay trên nút */
    total: pub.votes,                                            /* tổng phiếu của bộ (bảng xếp hạng) */
    votesDay: pub.votesDay, votesWeek: pub.votesWeek, votesMonth: pub.votesMonth,
    chapVotes: pub.chapVotes,
  }, { cors, headers: { 'cache-control': 'no-store' } });
}

/* POST /api/stats/seed { items: { slug: { views, votes } } }  (cần khoá)
   Nạp số cũ (từ Firebase hoặc file) làm “nền”; chạy lại bao nhiêu lần cũng vậy. */
async function seedStats(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
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
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
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
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
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
  /* nhãn "30/30" trên Blogger có thể cũ hơn kho chương: số chương THẬT trong KV thắng.
     (đây chính là chỗ từng kéo số chương đã xoá quay lại 30) */
  const rc = await applyRealCounts(env, reg);
  reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  reg.source = { synced: new Date().toISOString(), note: 'đồng bộ từ blogspot (list-novel + lịch ra chương)' };
  await env.CZ_KV.put('registry', registryJSON(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  await env.CZ_KV.put('_last', new Date().toISOString());
  return json({ ok: true, cards: cards.length, changed, rev: reg.rev, schedule: !!sched, log: log.slice(0, 20), recount: rc.fixed }, { cors });
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
/* ============================================================================
   XÁC THỰC TOKEN SUPABASE (JWT do Supabase Auth cấp)
   ----------------------------------------------------------------------------
   Supabase ký JWT bằng 1 trong 2 cách, Worker này nhận CẢ HAI:
     · HS256 với "JWT Secret" (project cũ)  → đặt biến SUPABASE_JWT_SECRET
     · RS256/ES256 với Signing Key mới      → không cần secret nào: Worker tự đọc
       JWKS tại <SUPABASE_URL>/auth/v1/.well-known/jwks.json rồi kiểm chữ ký.
   Chỉ cần đặt SUPABASE_URL (vd https://abcdef.supabase.co) là chạy.
   ============================================================================ */
function supabaseURL(env) { return String((env && env.SUPABASE_URL) || '').replace(/\/+$/, ''); }
const _sbKeys = new Map();          /* kid -> CryptoKey (JWKS của Supabase) */
async function supabaseJWKS(env) {
  const base = supabaseURL(env);
  if (!base) throw new Error('Worker chưa đặt biến SUPABASE_URL');
  const r = await fetch(base + '/auth/v1/.well-known/jwks.json', { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) throw new Error('không đọc được JWKS của Supabase (' + r.status + ')');
  const jwks = await r.json();
  return (jwks && jwks.keys) || [];
}
async function supabasePubKey(env, kid, alg) {
  const ck = kid + '|' + alg;
  if (_sbKeys.has(ck)) return _sbKeys.get(ck);
  const keys = await supabaseJWKS(env);
  const k = keys.find((x) => x.kid === kid) || keys[0];
  if (!k) throw new Error('JWKS của Supabase không có khoá nào');
  const upper = String(alg || k.alg || 'RS256').toUpperCase();
  let algo, key;
  if (upper === 'ES256') {
    algo = { name: 'ECDSA', namedCurve: 'P-256' };
    key = await crypto.subtle.importKey('jwk', { kty: k.kty || 'EC', crv: k.crv || 'P-256', x: k.x, y: k.y, alg: k.alg || 'ES256', ext: true }, algo, false, ['verify']);
  } else {
    algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    key = await crypto.subtle.importKey('jwk', { kty: k.kty || 'RSA', n: k.n, e: k.e, alg: k.alg || 'RS256', ext: true }, algo, false, ['verify']);
  }
  /* BUG ĐÃ SỬA: trước đây cache chỉ cất CryptoKey trần nhưng hàm trả về
     { key, algo, alg } — lần verify THỨ HAI với cùng kid sẽ destruct ra
     key = undefined → SubtleCrypto.verify ném lỗi → đăng nhập/bình luận 401. */
  const entry = { key, algo, alg: upper };
  _sbKeys.set(ck, entry);
  if (_sbKeys.size > 12) _sbKeys.delete(_sbKeys.keys().next().value);
  return entry;
}
async function verifySupabaseToken(tok, env) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 3) throw new Error('access_token sai định dạng');
  const header = JSON.parse(_dec(_b64.toBytes(parts[0], true)));
  const payload = JSON.parse(_dec(_b64.toBytes(parts[1], true)));
  const alg = String(header.alg || '').toUpperCase();
  const data = _enc(parts[0] + '.' + parts[1]);
  const sig = _b64.toBytes(parts[2], true);
  let ok = false;
  if (alg === 'HS256') {
    const sec = env.SUPABASE_JWT_SECRET || env.SUPABASE_SECRET || '';
    if (!sec) throw new Error('token Supabase ký HS256 mà Worker chưa đặt SUPABASE_JWT_SECRET');
    ok = await crypto.subtle.verify('HMAC', await hmacKey(sec), sig, data);
  } else if (alg === 'RS256' || alg === 'ES256') {
    const { key, algo, alg: a } = await supabasePubKey(env, header.kid, alg);
    ok = a === 'ES256'
      ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data)
      : await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
  } else throw new Error('thuật toán token không hỗ trợ: ' + alg);
  if (!ok) throw new Error('chữ ký token Supabase không hợp lệ');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('phiên đăng nhập đã hết hạn — đăng nhập lại');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => a === 'authenticated' || a === 'anon')) throw new Error('token sai audience: ' + aud.join(','));
  const base = supabaseURL(env);
  if (base && payload.iss && String(payload.iss).indexOf(base) !== 0 && String(payload.iss).indexOf(base.replace(/^https?:\/\//, '')) < 0) {
    throw new Error('token sai issuer — token do "' + payload.iss + '" cấp nhưng Worker đang đặt SUPABASE_URL="' + base + '" (đặt SUPABASE_URL trên Worker đúng project Supabase của web)');
  }
  if (payload.email && payload.email_verified === false) throw new Error('email chưa xác thực');
  return payload;
}
/* payload Supabase → user của web */
function userFromSupabase(p) {
  const md = p.user_metadata || {};
  const am = p.app_metadata || {};
  const email = p.email || md.email || '';
  return {
    uid: String(p.sub || p.user_id || ''),
    email,
    name: md.full_name || md.name || md.user_name || email || 'Bạn đọc',
    picture: md.avatar_url || md.picture || '',
    provider: am.provider || p.provider || 'supabase',
    exp: Number(p.exp) || 0,
  };
}
/* ai được coi là quản trị: ADMIN_EMAILS trong Worker, hoặc app_metadata.role */
function adminEmails(env) {
  return String((env && env.ADMIN_EMAILS) || '').split(',')
    .map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function isAdminUser(u, env) {
  if (!u) return false;
  if (u.role === 'admin' || u.admin === true) return true;
  const e = String(u.email || '').trim().toLowerCase();
  return !!e && adminEmails(env).indexOf(e) >= 0;
}
/* Trả { user, err }: err là LÝ DO token bị từ chối (hết hạn, sai chữ ký, sai
   issuer, Worker thiếu biến …) để endpoint trả 401 kèm nguyên nhân thật —
   người dùng không còn bị báo nhầm "phiên hết hạn" khi bệnh là cấu hình Worker. */
async function userFromReq(req, env) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return { user: null, err: '' };
  const tok = m[1];
  const secret = env.SESSION_SECRET || '';
  if (secret) {
    const s = await verifySession(tok, secret);
    if (s) return { user: s, err: '' };
  }
  /* chưa phải session của Worker → thử luôn access_token Supabase
     (để bình luận chạy được kể cả khi web chưa đổi token kịp) */
  if (supabaseURL(env) || env.SUPABASE_JWT_SECRET) {
    try { return { user: userFromSupabase(await verifySupabaseToken(tok, env)), err: '' }; }
    catch (e) { return { user: null, err: String((e && e.message) || e) }; }
  }
  return { user: null, err: 'Worker chưa đặt SUPABASE_URL (hoặc SUPABASE_JWT_SECRET) nên không xác thực được token Supabase' };
}
/* exp gửi kèm để web tự biết khi nào hết phiên (không phải gọi /api/auth/me) */
function publicUser(u, env) {
  let exp = 0;
  try { exp = (u && u.exp) || 0; } catch (e) {}
  return {
    uid: u.uid, email: u.email || '', name: u.name || 'Bạn đọc', picture: u.picture || '', exp,
    provider: u.provider || '', admin: isAdminUser(u, env),
  };
}
function publicComment(c) {
  return {
    id: c.id, uid: c.uid, name: c.name || 'Bạn đọc', picture: c.picture || '', text: c.text,
    ch: Number(c.ch) || 0, parentId: c.parentId ? String(c.parentId) : '',
    guest: !!c.guest, createdAt: c.createdAt,
  };
}

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
  const user = { uid: payload.sub, email: payload.email || '', name: payload.name || payload.email || 'Bạn đọc', picture: payload.picture || '', exp, provider: 'google' };
  const token = await signSession(user, secret);
  return json({ ok: true, token, user: publicUser(user, env), admin: isAdminUser(user, env) }, { cors });
}
/* POST /api/auth/supabase { accessToken } — đổi access_token Supabase lấy session
   token của Worker (HS256). Nếu Worker chưa đặt SESSION_SECRET thì vẫn trả user
   để web dùng thẳng access_token (Worker xác thực được ở mọi endpoint cần Bearer). */
async function authSupabase(req, env, cors) {
  if (!supabaseURL(env) && !env.SUPABASE_JWT_SECRET) {
    return json({
      ok: false,
      error: 'Worker chưa đặt biến SUPABASE_URL (vd https://abcdef.supabase.co)',
      hint: 'Workers → Settings → Variables: SUPABASE_URL, và SUPABASE_JWT_SECRET nếu project ký JWT bằng HS256. Xem worker/README.md §7.',
    }, { status: 500, cors });
  }
  const body = await req.json().catch(() => ({}));
  const tok = String(body.accessToken || body.access_token || body.token || '');
  if (!tok) return json({ ok: false, error: 'thiếu accessToken' }, { status: 400, cors });
  if (!await rateLimit(env, 'rl:login:' + hash(req.headers.get('cf-connecting-ip') || 'x'), 60, 600)) {
    return json({ ok: false, error: 'thử đăng nhập hơi nhiều, đợi 10 phút nữa' }, { status: 429, cors });
  }
  let payload;
  try { payload = await verifySupabaseToken(tok, env); }
  catch (e) {
    /* trả kèm SUPABASE_URL đang cấu hình để web/dev đối chiếu ngay với project
       thật (lỗi phổ biến nhất: Worker đặt URL của project Supabase KHÁC) */
    return json({
      ok: false,
      error: 'xác thực Supabase thất bại: ' + e.message,
      supabaseUrl: supabaseURL(env), hs256: !!(env.SUPABASE_JWT_SECRET),
    }, { status: 401, cors });
  }
  const user = userFromSupabase(payload);
  const secret = env.SESSION_SECRET || '';
  if (!secret) {
    return json({ ok: true, token: tok, user: publicUser(user, env), admin: isAdminUser(user, env), session: 'supabase-direct' }, { cors });
  }
  const session = Object.assign({}, user, { exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 });
  const token = await signSession(session, secret);
  return json({ ok: true, token, user: publicUser(user, env), admin: isAdminUser(user, env), session: 'worker' }, { cors });
}
/* GET /api/auth/config — chỉ trả trạng thái công khai. Không trả email quản trị,
   khoá ký token, ADMIN_KEY, khoá gửi mail hay bất kỳ secret nào. */
async function authConfig(env, cors) {
  return json({
    ok: true,
    supabase: !!supabaseURL(env),
    supabaseUrl: supabaseURL(env),
    google: !!env.GOOGLE_CLIENT_ID,
    session: !!env.SESSION_SECRET,
    adminConfigured: adminEmails(env).length > 0,
    version: VERSION,
  }, { cors, headers: { 'cache-control': 'no-store' } });
}
async function authMe(req, env, cors) {
  const { user: u, err } = await userFromReq(req, env);
  if (!u) return json({ ok: false, error: err ? ('token không hợp lệ: ' + err) : 'chưa đăng nhập' }, { status: 401, cors });
  return json({ ok: true, user: publicUser(u, env), admin: isAdminUser(u, env) }, { cors });
}
async function getComments(slug, req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const arr = (await env.CZ_KV.get('cmt:' + slug, { type: 'json' })) || [];
  let limit = 200, ch = null;
  try {
    const q = new URL(req.url).searchParams;
    limit = Math.min(parseInt(q.get('limit') || '200', 10) || 200, 500);
    if (q.get('ch') != null && q.get('ch') !== '') ch = parseInt(q.get('ch'), 10) || 0;
  } catch (e) {}
  /* ch = số chương: chỉ trả bình luận của chương đó (0 = bình luận chung của bộ) */
  const pool = ch == null ? arr : arr.filter((c) => (Number(c.ch) || 0) === ch);
  const comments = pool.slice(0, limit).map(publicComment);
  const byChap = {};
  arr.forEach((c) => { const k = String(Number(c.ch) || 0); byChap[k] = (byChap[k] || 0) + 1; });
  return json({ ok: true, comments, count: arr.length, shown: comments.length, slug, ch: ch, byChapter: byChap },
    { cors, headers: { 'cache-control': 'public, max-age=15' } });
}
async function postComment(slug, req, env, cors) {
  const authHeader = req.headers.get('authorization') || '';
  const hasAuth = /^Bearer\s+/i.test(authHeader);
  const { user: u, err: authErr } = await userFromReq(req, env);
  /* Nếu gửi kèm Bearer nhưng Worker không xác thực được (token hết hạn, hoặc Worker chưa có
     SUPABASE_URL/SESSION_SECRET) thì TRẢ 401 chứ không âm thầm biến thành khách. */
  if (hasAuth && !u) {
    return json({
      ok: false,
      error: 'Không xác thực được phiên đăng nhập' + (authErr ? ' — ' + authErr : ' — hãy đăng nhập lại') + '.',
      hint: 'Nếu bạn là chủ trang, kiểm tra biến SUPABASE_URL (đúng project) và SESSION_SECRET trên Worker.',
    }, { status: 401, cors });
  }
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (text.length < 1) return json({ ok: false, error: 'bình luận không được trống' }, { status: 400, cors });
  if (!env.CZ_KV) return noKV(cors);
  /* Khách chưa đăng nhập vẫn bình luận được — gắn với mã máy ẩn danh. */
  const vid = String(body.vid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (!u && !vid) {
    return json({ ok: false, error: 'không nhận được mã máy — tải lại trang rồi thử lại' }, { status: 400, cors });
  }
  const uid = u ? u.uid : 'g:' + hash(vid);
  const name = u
    ? (String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || u.name || 'Bạn đọc')
    : (String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Bạn đọc');
  /* Ảnh đại diện: chỉ nhận http/https (bỏ data:, javascript:…), tối đa 300 ký tự */
  var rawPic = String(body.picture || '').trim().slice(0, 2000);
  if (!/^https?:\/\//i.test(rawPic)) rawPic = '';
  var sessPic = String((u && u.picture) || '').trim();
  if (!/^https?:\/\//i.test(sessPic)) sessPic = '';
  const picture = u ? (rawPic || sessPic || '') : '';
  const ch = Math.max(0, Math.min(99999, parseInt(body.ch, 10) || 0));
  /* parentId là id của bình luận mà người đọc đang trả lời. Chỉ nhận id trong
     cùng bộ; ch của reply được giữ theo bình luận cha để bộ lọc chương không
     làm rơi mất câu trả lời. Cho phép trả lời reply tiếp (thread nhiều tầng). */
  const parentId = String(body.parentId || body.replyTo || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const key = 'cmt:' + slug;
  const arr = (await env.CZ_KV.get(key, { type: 'json' })) || [];
  let parent = null;
  if (parentId) {
    parent = arr.find((c) => String(c.id) === parentId);
    if (!parent) return json({ ok: false, error: 'bình luận gốc không còn tồn tại — tải lại trang rồi thử lại' }, { status: 400, cors });
  }
  const finalCh = parent ? (Number(parent.ch) || 0) : ch;
  /* hai lớp chặn spam: theo mỗi chương và toàn trang. Reply dùng cùng giới hạn. */
  const perChap = u ? 3 : 2, perAll = u ? 12 : 6;
  if (!await rateLimit(env, 'rl:cmt:' + hash(uid) + ':' + slug + ':' + finalCh, perChap, 600) ||
      !await rateLimit(env, 'rl:cmt:' + hash(uid), perAll, 600)) {
    return json({ ok: false, error: 'bạn bình luận hơi nhanh — 10 phút nữa hãy gửi tiếp' }, { status: 429, cors });
  }
  const c = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    uid, name, picture, text, ch: finalCh, parentId: parent ? String(parent.id) : '', guest: !u,
    createdAt: new Date().toISOString(),
  };
  arr.unshift(c);
  if (arr.length > 500) arr.length = 500;
  await env.CZ_KV.put(key, JSON.stringify(arr));
  return json({ ok: true, comment: publicComment(c), count: arr.length, guest: !u, reply: !!parent }, { cors });
}
async function deleteComment(slug, id, req, env, cors) {
  const byKey = authed(req, env);            /* quản trị (ADMIN_KEY) xoá được mọi bình luận */
  const u = (await userFromReq(req, env)).user;
  const mod = byKey || isAdminUser(u, env);
  if (!u && !byKey) return json({ ok: false, error: 'cần đăng nhập' }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const key = 'cmt:' + slug;
  const arr = (await env.CZ_KV.get(key, { type: 'json' })) || [];
  const idx = arr.findIndex((c) => c.id === id);
  if (idx < 0) return json({ ok: false, error: 'không thấy bình luận' }, { status: 404, cors });
  if (!mod && arr[idx].uid !== (u && u.uid)) {
    return json({ ok: false, error: 'chỉ xoá được bình luận của chính bạn' }, { status: 403, cors });
  }
  const removed = new Set([id]);
  /* Xoá luôn các câu trả lời nằm dưới bình luận gốc; nếu có thread nhiều tầng,
     dọn tiếp tới khi không còn reply mồ côi. */
  let changed = true;
  while (changed) {
    changed = false;
    arr.forEach((c) => {
      if (c.parentId && removed.has(String(c.parentId)) && !removed.has(String(c.id))) {
        removed.add(String(c.id)); changed = true;
      }
    });
  }
  const kept = arr.filter((c) => !removed.has(String(c.id)));
  await env.CZ_KV.put(key, JSON.stringify(kept));
  if (mod) await logAct(env, 'kiểm duyệt: xoá bình luận ' + id + ' của bộ ' + slug, req);
  return json({ ok: true, deleted: id, deletedCount: arr.length - kept.length, count: kept.length, moderated: !!mod }, { cors });
}
