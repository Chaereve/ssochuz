import { profileId } from './member-spaces.js';
export { MemberSpaces } from './member-spaces.js';
export { PrivateBooks } from './private-books.js';
import { dropOverflow, overflowStatusResolved, missingOverflowVars, persistBook, persistCover, persistChapterImage, persistImage, readBook, readBookChecked, readImage, materializeBookChecked, migrateOverflow, mirrorImages, sbPinUrl, sbPinReset as sbPinResetCache } from './overflow.js';
import { parseChapterTitle, nextMainChapterNo, chapterTextOf, chapterHasMedia } from '../src/shared/chapters.js';
import { isChapterPending, countVisibleChapters, countPendingChapters, nextScheduleMs, atMs, chapterAtMs, scheduleLabelOf } from '../src/shared/schedule.js';
import { KV_FLUSH, statsBudget, forcedFlushMs, budgetCredits, flushOnTimer } from '../src/shared/kv-budget.js';
import { cacheKeyOf, isJunkParam } from '../src/shared/cache-key.js';
/* Làm sạch HTML chương theo DANH SÁCH CHO PHÉP — bản dùng chung với bài kiểm
   tra trên 1.216 chương thật (tools/check_chapter_html.mjs). Bản cũ chặn theo
   danh sách cấm nên lọt <link>/<meta>/<base>/<svg onload>/<form>… */
import { sanitizeChapterHtml } from '../src/shared/sanitize.js';
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
                                           · bộ khóa mật mã: chỉ trả chương khi
                                             ?token=… đúng (do POST /api/lock cấp)
     GET    /api/book/<slug>/toc        → MỤC LỤC NHẸ: đầu sách + tên các chương
                                             đang hiện, KHÔNG kèm nội dung (1.16.0)
     GET    /api/book/<slug>/chapter/<n>→ ĐÚNG 1 chương (n = vị trí trong danh
                                             sách đang hiện) + mục lục (1.16.0)
                                             · trang đọc dùng 2 đường này để mở
                                               chương ~18 KB thay vì cả bộ 334 KB
     Cả 3 đường đọc bộ (1.16.1): 404 = KV KHÔNG có bộ; 502 = CÓ bộ mà Worker
     không đọc được nội dung (thiếu biến overflow) — body nêu tên biến thiếu
     (`missing`) + cách chữa (`hint`), không còn "(overflow?)" mù mờ.
     POST   /api/lock                   → nhập mật mã {slug, password} → token 6h (mở)
     GET    /api/img/<id>               → ảnh trong chương / ảnh bìa (mở, cache 1 năm)
     POST   /api/lock/set               → khóa/bỏ khóa/đổi mật mã {slug, password} (cần X-Admin-Key)
     POST   /api/img                    → upload ảnh {data, type, kind?} (cần X-Admin-Key)
                                           · kind=cover + SUPABASE_SERVICE_ROLE → Storage bucket `covers`
                                           · không kind / ảnh chương / báo lỗi → KV `img:<id>` như cũ
     GET    /api/admin/kv               → kiểm kho KV: số khoá + byte theo tiền tố (cần X-Admin-Key)
     GET    /api/schedule               → lịch ra chương (mở)
     GET    /api/stats                  → lượt đọc/bình chọn + ĐÁNH GIÁ SAO TỪ KV (mở)
     GET    /feed.xml                   → RSS 2.0: 30 chương mới nhất (mở)
     GET    /feed.xml?slug=<slug>       → RSS 2.0: chương mới của 1 bộ (mở)

     POST   /api/push-sub               → đăng ký / huỷ nhận thông báo đẩy {endpoint, keys} (mở)
                                           · lưu key push:<hash>, Cron 10 phút/lần gửi tối đa 45 tin/invocation

     POST   /api/view                   → đếm 1 lượt đọc {slug, vid, ch} (mở)
     POST   /api/vote                   → bầu/bỏ bầu {slug, ch?, vote:1|0, vid}
     POST   /api/rate                   → đánh giá sao 1..5 {slug, rating} (1 người 1 điểm, sửa được)
                                           · không gửi ch = phiếu cho cả bộ
                                           · ch = 12      = phiếu riêng chương 12
                                           trả về { votes, total, chapVotes, votesDay/Week/Month }

     PUT    /api/registry               → ghi dữ liệu thư viện      (cần X-Admin-Key)
     PUT    /api/book/<slug>            → ghi 1 bộ + chương, TỰ đếm lại số chương
                                           trong registry          (cần X-Admin-Key)
     DELETE /api/book/<slug>            → xoá 1 bộ                  (cần X-Admin-Key)
     POST   /api/recount                → đếm lại số chương của MỌI bộ, sửa registry
                                           (chữa bệnh "hiện 30 mà chỉ có 29") (cần X-Admin-Key)
     POST   /api/admin/mirror-images    → SAO LƯU ảnh NGOÀI về kho của mình (1.17.0)
                                           {limit?, only?: 'covers'|'chapters', edge?, dryRun?}
                                           · 63/63 bìa đang là link justwatch/amazon/twimg/
                                             blogger: host gỡ ảnh là mất bìa, repo không giữ byte nào
                                           · hỏi CHÍNH CDN đó bản nhỏ hơn (sửa URL theo luật host —
                                             src/shared/image-url.js) nên ảnh vẫn rõ mà nhẹ hơn
                                           · ghi Supabase Storage covers/images (không có thì KV),
                                             viết lại link trong registry + HTML chương
                                           · id theo BĂM URL → chạy lại không tạo bản sao
     POST   /api/admin/migrate-overflow → chuyển book/ảnh CŨ trong KV sang overflow
                                           {limit?, only?} — bìa → Storage `covers`,
                                           book/ảnh chương → ssochuz_blobs/R2 (cần X-Admin-Key)
     POST   /api/seed                   → nạp nhiều bộ một lần      (cần X-Admin-Key)
     POST   /api/sync                   → đồng bộ lại từ Blogger    (cần X-Admin-Key)
     POST   /api/import                 → 1 bài Blogger → 1 chương  (cần X-Admin-Key)
     POST   /api/stats/seed             → nạp số liệu cũ (Firebase/file) (cần X-Admin-Key)
     POST   /api/stats/import-firebase  → tự kéo số cũ từ Firestore (cần X-Admin-Key)
     POST   /api/stats/refresh          → ghi hết số đang đệm ra KV (cần X-Admin-Key)
     GET    /api/admin/comments         → mọi bình luận để kiểm duyệt (cần X-Admin-Key)
     GET    /api/admin/stats            → số liệu chi tiết + chuỗi 60 ngày (cần X-Admin-Key)
     GET    /api/admin/log              → nhật ký 200 thao tác gần nhất (cần X-Admin-Key)
     POST   /api/report                 → người đọc báo lỗi chữ trong chương (mở, có chống spam)
     GET    /api/admin/reports          → 300 báo lỗi gần nhất, ?q=TỪ KHOÁ (cần X-Admin-Key)
                                           · MỌI endpoint đều phải trả kèm `cors`: thiếu một
                                             dòng là trình duyệt chặn response (dù 200 OK) và
                                             trang quản trị chỉ báo "Failed to fetch"
                                             — đúng bệnh của bản ≤ 1.10.0 ở endpoint này
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
     SUPABASE_URL      (bắt buộc nếu đăng nhập Supabase HOẶC dùng overflow) = https://<ref>.supabase.co
                       ⚠ Đặt TRONG worker/wrangler.toml [vars] (đã làm sẵn từ 1.16.1), KHÔNG đặt tay
                         trên dashboard: `npx wrangler deploy` thay TOÀN BỘ biến thường bằng nội dung
                         wrangler.toml nên biến đặt tay BỊ XOÁ — sự cố 23/09 làm cả 63 bộ không đọc
                         được (xem BAO-CAO-SU-CO-DEPLOY-MAT-BIEN-SUPABASE.md). Secret thì wrangler giữ.
                       Nếu vẫn thiếu, Worker tự lấy Project URL quản trị lưu ở /admin → Cài đặt & đồng bộ.
     SUPABASE_JWT_SECRET (chỉ project cũ ký HS256) — Auth → Settings → JWT Secret
     SUPABASE_SERVICE_ROLE (secret, tuỳ chọn) — overflow book/img sang bảng ssochuz_blobs
                                            + bìa truyện (kind=cover) lên Storage bucket `covers`
                                            (KHÔNG BAO GIỜ đưa ra trình duyệt / registry)
     CZ_R2             (R2 binding, tuỳ chọn) — overflow song song, 10 GB free tier
     ADMIN_EMAILS      (secret/tuỳ chọn) — email được vào /admin; không đặt trong frontend/registry
     GOOGLE_CLIENT_ID  (secret/tuỳ chọn)    — Client ID của OAuth Web app (Google Identity Services)
     SESSION_SECRET    (secret, bắt buộc*)  — chuỗi ngẫu nhiên ≥ 32 ký tự, ký session bình luận/đăng nhập
                                            (*) bắt buộc nếu bật bình luận/đăng nhập người dùng
     STATS_FLUSH_MS    (tuỳ chọn)  — ép nhịp ghi số liệu (mili-giây), dùng khi thử nghiệm
                                       và cho bài kiểm thử; bản chạy thật tự giãn nhịp
     STATS_WRITE_BUDGET (tuỳ chọn) = 240 — trần lượt GHI khoá `stats` mỗi ngày (giữ chỗ
                                       cho các khoá khác trong hạn mức 1.000 ghi/ngày)
     FIREBASE_PROJECT  (KHÔNG cần nữa)      — chỉ dùng cho /api/stats/import-firebase
                                              khi muốn kéo số liệu cũ về KV một lần
     MAIL_TO           (tuỳ chọn)  — BẬT GỬI EMAIL báo lỗi chữ bằng FormSubmit, chỉ cần điền email nhận
                                     (lần đầu FormSubmit gửi 1 thư xác nhận, bấm Confirm là xong)
     RESEND_API_KEY    (tuỳ chọn)  — đường gửi chuyên nghiệp: khoá API resend.com (free 100 mail/ngày)
     MAIL_FROM         (tuỳ chọn)  — địa chỉ gửi của Resend, vd: ssochuz library <bao-loi@ten-mien-cua-ban>
     VAPID_PUBLIC      (bắt buộc nếu bật push) — khoá công khai VAPID base64url (nằm trong wrangler.toml, không nhạy cảm)
     VAPID_PRIVATE     (secret, bắt buộc nếu bật push) — khoá riêng VAPID base64url (`wrangler secret put VAPID_PRIVATE`)
   ============================================================================ */

const VERSION = '1.17.0';
const JSONH = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

/* ============================ LỐI VÀO WORKER ===============================
   `handler.fetch` chứa mọi endpoint. `export default` bên dưới chỉ thêm một lớp
   BẢO HIỂM: bảo đảm MỌI response đều mang header CORS.

   Vì sao cần lớp này: mỗi handler phải tự truyền `cors` vào json(); chỉ một
   handler quên là y như rằng… endpoint đó chết. Đúng cái bệnh của
   GET /api/admin/reports ở bản ≤ 1.10.0: Worker trả 200 OK, dữ liệu đúng,
   key đúng, nhưng không có `access-control-allow-origin` → TRÌNH DUYỆT chặn
   response, fetch() ném "Failed to fetch" và trang quản trị báo nhầm là
   "CORS, URL sai, Worker chưa deploy". Kiểm tra bằng mắt thường không ra. */
const handler = {
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
      if (p === '/api/me/space' || /^\/api\/profiles\/[a-f0-9]{64}$/.test(p)) {
        const owner = p === '/api/me/space';
        let id, seedName = '', seedPic = '';
        if (owner) {
          const auth = await userFromReq(req, env);
          const expired = auth.user && (!auth.user.uid || !auth.user.exp || auth.user.exp <= Date.now() / 1000);
          if (!auth.user || expired) {
            const why = expired ? 'Phiên đã hết hạn' : (auth.err ? auth.err : 'Chưa đăng nhập');
            return json({
              error: 'Chưa mở được không gian của bạn — ' + why + '. Vui lòng bấm “Đăng xuất & đăng nhập lại” rồi thử lại.',
              hint: 'Chủ trang: nếu lỗi nhắc ghim project Supabase, đặt biến SUPABASE_URL trên Worker hoặc lưu Project URL ở /admin → Cài đặt & đồng bộ → Đăng nhập (worker 1.9.9).',
            }, { status: 401, cors, headers: { 'cache-control': 'no-store' } });
          }
          id = await profileId(auth.user.uid);
          /* Danh tính đã xác thực — gửi kèm để hồ sơ MỚI không khởi tạo bằng
             "Bạn đọc" + ảnh rỗng (bệnh: đăng nhập Google xong My Space vẫn hiện
             tên chung chung cho tới khi người dùng tự lưu hồ sơ). */
          seedName = String(auth.user.name || '').slice(0, 40);
          seedPic = String(auth.user.picture || '').slice(0, 2048);
        } else {
          if (req.method !== 'GET') return json({ error: 'Không được phép.' }, { status: 405, cors });
          id = p.split('/').pop();
        }
        if (!env.MEMBER_SPACES) return json({ error: 'Kho hồ sơ chưa được triển khai. Tủ trên thiết bị vẫn dùng được.' }, { status: 503, cors });
        if (!['GET', 'PUT'].includes(req.method)) return json({ error: 'Không được phép.' }, { status: 405, cors });
        let raw;
        if (req.method === 'PUT') {
          if (!env.CZ_KV || !await rateLimit(env, 'rl:space:' + id, 120, 3600)) return json({ error: 'Thao tác quá nhanh, vui lòng thử lại sau.' }, { status: 429, cors });
          const reader = req.body && req.body.getReader();
          if (!reader) return json({ error: 'Thiếu dữ liệu.' }, { status: 400, cors });
          const chunks = []; let size = 0;
          while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 300000) { await reader.cancel(); return json({ error: 'Dữ liệu quá lớn.' }, { status: 413, cors }); } chunks.push(part.value); }
          raw = new Blob(chunks);
        }
        const stub = env.MEMBER_SPACES.get(env.MEMBER_SPACES.idFromName(id));
        const inner = { method: req.method, body: raw };
        if (owner && (seedName || seedPic)) {
          inner.headers = {
            'x-cz-name': encodeURIComponent(seedName),
            'x-cz-pic': encodeURIComponent(seedPic),
          };
        }
        const res = await stub.fetch(new Request('https://members.internal/' + (owner ? 'owner' : 'public'), inner));
        const data = await res.json();
        return json({ ...data, id }, { status: res.status, cors, headers: { 'cache-control': 'private, no-store' } });
      }
      if (p === '/api/rate/me' && req.method === 'POST') return await myRating(req, env, cors);

      // A reserved namespace: never fall through to public KV or cached book routes.
      const privateMatch = /^\/api\/(?:book|private)\/(private-[a-z0-9-]+)$/.exec(p);
      if (privateMatch) {
        if (!env.PRIVATE_BOOKS) return json({ error: 'Kho riêng tư chưa được triển khai.' }, { status: 503, cors });
        if (req.method === 'PUT' && !authed(req, env)) return json({ error: 'Cần quyền quản trị.' }, { status: 401, cors });
        if (!['POST', 'PUT'].includes(req.method) || !p.startsWith('/api/private/'))
          return json({ error: 'Truyện được bảo vệ bằng mật khẩu.' }, { status: 403, cors });
        const raw = await req.text();
        if (raw.length > (req.method === 'PUT' ? 2000000 : 4096)) return json({ error: 'Dữ liệu quá lớn.' }, { status: 413, cors });
        const stub = env.PRIVATE_BOOKS.get(env.PRIVATE_BOOKS.idFromName(privateMatch[1]));
        const result = await stub.fetch(new Request('https://private.internal/', { method: req.method, body: raw }));
        return new Response(result.body, { status: result.status, headers: { ...cors, ...JSONH, 'cache-control': 'private, no-store' } });
      }
      /* ---------- mở: chỉ đọc ---------- */
      if (p === '/' || p === '/api/health') return await health(env, cors);
      if (p === '/api/whoami' || p === '/api/auth') {
        if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
        return json({ ok: true, role: 'super_admin', permissions: ['*'], via: 'key', version: VERSION }, { cors });
      }
      if (p === '/api/registry' && req.method === 'GET') {
        if (authed(req, env)) return await getKV(env, 'registry', cors, 0, { admin: true });
        return await edgeCached(req, cors, EDGE_TTL.registry, () => getKV(env, 'registry', cors, EDGE_TTL.registry, { public: true }));
      }
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
      if (p === '/api/rate' && req.method === 'POST') {
        const rr = await postRate(req, env, cors);
        if (rr.ok) await edgePurge(org + '/api/stats');
        return rr;
      }
      /* báo lỗi chữ trong chương: người đọc bấm 1 nút là nội dung đi thẳng tới
         hộp thư ban biên tập — tự lưu vào KV, không cần copy/mở Gmail nữa */
      if (p === '/api/report-image' && req.method === 'POST') return await postReportImage(req, env, cors);
      if (p === '/api/report' && req.method === 'POST') return await postReport(req, env, ctx, cors);
      if (p === '/api/push-sub' && req.method === 'POST') return await pushSub(req, env, cors);

      /* ---------- người dùng: đăng nhập (Supabase/Google) + bình luận ---------- */
      if (p === '/api/auth/supabase' && req.method === 'POST') return await authSupabase(req, env, cors);
      if (p === '/api/auth/google' && req.method === 'POST') return await authGoogle(req, env, cors);
      if (p === '/api/auth/me' && req.method === 'GET') return await authMe(req, env, cors);
      if (p === '/api/auth/config' && req.method === 'GET') return await authConfig(env, cors);
      let mc = p.match(/^\/api\/comments\/([^/]+)\/([^/]+)$/);
      if (mc && req.method === 'DELETE') {
        const r = await deleteComment(decodeURIComponent(mc[1]), mc[2], req, env, cors);
        if (r.ok) await edgePurgePrefix(org, '/api/comments/' + mc[1]);
        return r;
      }
      let mc2 = p.match(/^\/api\/comments\/([^/]+)$/);
      /* Danh sách bình luận (ai cũng đọc được) lưu 15 giây ở biên: chương hot
         có 200 bình luận mà mỗi lượt mở là một lượt đọc KV. Bình luận mới →
         purge ngay nên người đọc vẫn thấy bình luận của mình tức thì. */
      if (mc2 && req.method === 'GET') {
        return await edgeCached(req, cors, EDGE_TTL.comments,
          () => getComments(decodeURIComponent(mc2[1]), req, env, cors), commentsKeyOf);
      }
      if (mc2 && req.method === 'POST') {
        const r = await postComment(decodeURIComponent(mc2[1]), req, env, cors);
        if (r.ok) await edgePurgePrefix(org, '/api/comments/' + mc2[1]);
        return r;
      }

      /* mục lục nhẹ + đọc 1 chương (1.16.0): xem getBookChapterPublic.
         Đặt TRƯỚC route /api/book/<slug> vì regex đó nuốt cả hai đường này. */
      let mtoc = p.match(/^\/api\/book\/(.+)\/toc$/);
      if (mtoc && req.method === 'GET') {
        return await getBookChapterPublic(req, env, cors, decodeURIComponent(mtoc[1]), 0, true);
      }
      let mchp = p.match(/^\/api\/book\/(.+)\/chapter\/(\d+)$/);
      if (mchp && req.method === 'GET') {
        return await getBookChapterPublic(req, env, cors, decodeURIComponent(mchp[1]), parseInt(mchp[2], 10) || 0, false);
      }

      /* chương của bộ ĐANG KHÓA MẬT MÃ chỉ trả khi token hợp lệ (xem
         getBookPublic) — không cho rớt về file tĩnh /data/book/*.json. */
      let m = p.match(/^\/api\/book\/(.+)$/);
      if (m && req.method === 'GET') return await getBookPublic(req, env, cors);

      /* Sửa MỘT chương trong bộ: PUT /api/book/<slug>/chapter
         { index, chapter } | { index, remove:true } | { from, to }
         Lý do có đường riêng: bản cũ bấm “Lưu chương” là gửi lại NGUYÊN bộ
         (mọi chương, có bộ vài MB) + ghi lại registry nên phản hồi rất lâu.
         Đường này chỉ gửi 1 chương, Worker tự ghép vào bản cũ trên KV. */
      let mch = p.match(/^\/api\/book\/(.+)\/chapter$/);
      if (mch && (req.method === 'PUT' || req.method === 'POST')) {
        const r = await putChapter(req, env, decodeURIComponent(mch[1]), cors);
        if (r.ok) {
          await edgePurge(org + '/api/book/' + mch[1], org + '/api/registry');
          /* biết chương nào vừa đổi để xoá đúng mục cache (đổi thứ tự/xoá thì xoá cả chùm) */
          const info = await r.clone().json().catch(() => null);
          if (info && info.ok) {
            await purgeChapterCache(org, mch[1], (parseInt(info.index, 10) || 0) + 1, info.action === 'move' || info.action === 'delete');
          } else {
            await purgeChapterCache(org, mch[1], 0, true);
          }
          await purgeFeed(org);
        }
        return r;
      }

      /* nhập mật mã truyện bị khóa → token 6 giờ (stateless, ký HMAC).
         Rate limit theo IP+slug chống dò mật mã. */
      if (p === '/api/lock' && req.method === 'POST') return await postLock(req, env, cors);

      /* ảnh trong chương / ảnh bìa: admin upload (base64 đã nén trong trình
         duyệt), người đọc đọc qua URL cố định — cache 1 năm (id ngẫu nhiên
         là khoá "immutable", không có chuyện trùng id). */
      if (p === '/api/img' && req.method === 'POST') return await postImage(req, env, cors);
      let mi = p.match(/^\/api\/img\/([A-Za-z0-9-]{12,64})$/);
      if (mi && req.method === 'GET') return await getImage(req, env, cors, mi[1]);

      /* ---------- cần khoá quản trị ---------- */
      if (p === '/api/registry' && req.method === 'PUT') {
        const r = await putKV(req, env, 'registry', cors, 'cập nhật thư viện (registry)');
        if (r.ok) { await edgePurge(org + '/api/registry'); await purgeFeed(org); }
        return r;
      }
      if (m && req.method === 'PUT') {
        const r = await putBook(req, env, decodeURIComponent(m[1]), cors);
        if (r.ok) {
          await edgePurge(org + '/api/book/' + m[1], org + '/api/registry');
          await purgeChapterCache(org, m[1], 0, true);
          await purgeFeed(org);
        }   /* m[1] còn nguyên mã hoá — đúng khoá cache lúc GET */
        return r;
      }
      if (m && req.method === 'DELETE') {
        if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
        if (!env.CZ_KV) return noKV(cors);
        const slug = decodeURIComponent(m[1]);
        await env.CZ_KV.delete('book:' + slug);
        await dropOverflow(env, 'book:' + slug);
        await syncCountToRegistry(env, slug, null);       /* registry không còn treo số chương của bộ đã xoá */
        await logAct(env, 'xoá bộ ' + slug, req);
        await edgePurge(org + '/api/book/' + m[1], org + '/api/registry');
        await purgeChapterCache(org, m[1], 0, true);
        await purgeFeed(org);
        return json({ ok: true, deleted: slug }, { cors });
      }
      /* khóa / bỏ khóa / đổi mật mã truyện (card vẫn công khai, chương thì khóa) */
      if (p === '/api/lock/set' && req.method === 'POST') {
        return await setLock(req, env, cors, org);
      }
      if (p === '/api/admin/migrate-overflow' && req.method === 'POST') {
        /* từng GET book/img vẫn materialize đúng nên không cần purge cache biên */
        return await migrateOverflowRun(req, env, cors);
      }
      if (p === '/api/admin/mirror-images' && req.method === 'POST') {
        /* sao lưu ảnh NGOÀI về kho của mình (1.17.0). Đổi link bìa trong
           registry nên phải purge cache biên của registry. */
        return await mirrorImagesRun(req, env, cors, org);
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
      if (p === '/api/admin/reports' && req.method === 'PATCH') return await patchReport(req, env, cors);
      if (p === '/api/admin/voters' && req.method === 'GET') return await adminVoters(req, env, cors);
      if (p === '/api/admin/kv' && req.method === 'GET') return await kvAudit(req, env, cors);
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
  /* Cron Trigger (10 phút/lần, cấu hình trong wrangler.toml) rút dần hàng đợi
     thông báo đẩy — mỗi invocation gửi tối đa 45 tin (free giới hạn 50 subrequest) */
  async scheduled(event, env, ctx) {
    /* 1) chương hẹn giờ tới mốc → cập nhật lại số chương trong registry + báo
          đẩy “chương mới” cho người theo dõi
       2) rút hàng đợi thông báo đẩy (tối đa 45 tin mỗi lần) */
    ctx.waitUntil(publishDueChapters(env).then(() => drainPushQueue(env)).catch(() => {}));
  },
};

export default {
  /* Lớp bảo hiểm CORS — xem ghi chú ở `handler` phía trên. */
  async fetch(req, env, ctx) {
    let res;
    try {
      res = await handler.fetch(req, env, ctx);
    } catch (e) {
      /* Lỗi lọt ra NGOÀI try/catch của handler (URL hỏng, adminThrottle chết…)
         thì Cloudflare trả trang lỗi 1101 không kèm CORS — trình duyệt chỉ báo
         "Failed to fetch", admin lại đoán sai là chưa deploy. Trả JSON 500 có
         header CORS + lý do thật để trang quản trị in đúng bệnh. */
      res = json({ ok: false, error: 'Worker lỗi nội bộ: ' + String((e && e.message) || e), version: VERSION },
        { status: 500, cors: corsHeaders(req, env) });
    }
    return ensureCors(res, req, env);
  },
  scheduled: (event, env, ctx) => handler.scheduled(event, env, ctx),
};

/* Đắp header CORS lên response nếu handler nào đó quên gửi. Response đã có
   `access-control-allow-origin` (kể cả bản đắp theo origin từ cache biên) thì
   giữ nguyên — không ghi đè origin đã được chọn đúng ở lớp trong. */
function ensureCors(res, req, env) {
  if (!res || !res.headers) return res;
  if (res.headers.get('access-control-allow-origin')) return res;
  try {
    const cors = corsHeaders(req, env);
    const h = new Headers(res.headers);
    Object.keys(cors).forEach((k) => { if (!h.has(k)) h.set(k, cors[k]); });
    return new Response(res.body, { status: res.status, statusText: res.statusText || undefined, headers: h });
  } catch (e) { return res; }
}

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
  /* bài chỉ có HÌNH (truyện tranh/webtoon) vẫn là chương hợp lệ:
     trước đây yêu cầu ≥40 chữ nên bài toàn ảnh bị từ chối “không có nội dung” */
  const tooShort = chapterTextOf(html).length < 40;
  if (!html || (tooShort && !chapterHasMedia(html))) {
    return json({ ok: false, error: 'bài này không có nội dung đọc được', url }, { status: 422, cors });
  }

  /* 1.16.1: bộ có trên KV mà KHÔNG đọc được (mất biến overflow) thì DỪNG,
     không dựng bộ mới 1 chương rồi ghi đè — đúng thứ đã suýt mất 63 bộ. */
  const prev = await readBookChecked(env, slug);
  if (prev.status === 'unreadable') return overflowFailResponse(cors, slug, prev);
  const book = prev.book || { title: (nov && nov.title) || slug, slug, chapters: [] };
  book.chapters = book.chapters || [];
  /* đặt tên chương theo parser dùng chung (src/shared/chapters.js):
     · tiêu đề đã có số (“Chương 5”, “Chap 3”, “Chương 0”) → giữ nguyên
     · lời mở đầu / giới thiệu nhân vật / thông báo → giữ nguyên, KHÔNG ép thành “Chương N”
     · ngoại truyện / phụ chương (và số của nó) → giữ nguyên
     · còn lại → “Chương <số chính kế tiếp>: <tiêu đề>” (mở đầu không đếm là Chương 1) */
  const info = parseChapterTitle(title);
  const chapTitle = (info.has || info.kind !== 'main')
    ? (title || info.name || title)
    : ('Chương ' + nextMainChapterNo(book.chapters) + (title ? ': ' + title : ''));
  const key = (req.headers.get('x-import-mode') || 'append').toLowerCase();   /* append | replace-last */
  if (key === 'replace-last' && book.chapters.length) book.chapters[book.chapters.length - 1] = { t: chapTitle, html };
  else book.chapters.push({ t: chapTitle, html });
  await persistBook(env, slug, book);

  if (nov) {
    nov.updated = new Date().toISOString().slice(0, 10);
    if (nov.status === 'Sắp ra mắt') nov.status = 'Đang cập nhật';
    await applyRealCounts(env, reg);            /* số chương + nhãn lấy theo chương thật */
    reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
    reg.source = { synced: new Date().toISOString(), note: 'nhập từ bài viết Blogger qua trang quản trị' };
    await env.CZ_KV.put('registry', registryJSON(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  }
  await logAct(env, 'nhập chương từ Blogger: ' + slug + ' → ' + chapTitle, req);
  const iorg = new URL(req.url).origin;
  await edgePurge(iorg + '/api/book/' + encodeURIComponent(slug), iorg + '/api/registry');
  await purgeChapterCache(iorg, encodeURIComponent(slug), 0, true);
  await purgeFeed(iorg);
  await enqueuePush(env, slug, book.chapters.length, chapTitle);   /* nhập từ Blogger cũng là chương mới */
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

/* ============================================================================
   THÔNG BÁO ĐẨY "RA CHƯƠNG MỚI" (Web Push + VAPID)
   ----------------------------------------------------------------------------
   Luồng: bấm "Theo dõi" → web hỏi bật thông báo → PushManager.subscribe →
   POST /api/push-sub lưu key `push:<hash>` (1 ghi/thiết bị, hiếm khi xảy ra).
   Admin lưu chương mới (PUT book / import) → ghi job vào key `pushq` (chỉ ghi
   khi đang có subscriber). Cron 10 phút/lần drain tối đa 45 tin/invocation
   (free giới hạn 50 subrequest). Push trả 404/410 → xoá subscription.
   Mã hoá aes128gcm (RFC 8291) + ký VAPID ES256 tự làm bằng WebCrypto, không
   thêm thư viện.
   ============================================================================ */
const PUSH_BATCH = 45;          /* số tin tối đa mỗi invocation cron */
const PUSH_TTL = 7 * 86400;     /* push service giữ tin 7 ngày nếu máy offline */
function pushKey(endpoint) {
  const tail = String(endpoint || '').replace(/[^a-zA-Z0-9]/g, '').slice(-10);
  return 'push:' + hash(String(endpoint || '')) + ':' + tail;
}
function b64uToBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(b) {
  let s = '';
  const v = new Uint8Array(b);
  for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmacSha256(keyBytes, dataBytes) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dataBytes));
}
/* HKDF-Expand 1 vòng (đủ vì chỉ cần ≤ 32 bytes): T = HMAC(PRK, info || 0x01) */
async function hkdfExpand(prk, infoStr, len) {
  const info = new TextEncoder().encode(infoStr);
  const data = new Uint8Array(info.length + 1);
  data.set(info, 0);
  data[info.length] = 1;
  return (await hmacSha256(prk, data)).slice(0, len);
}
/* JWT VAPID (ES256): ký bằng private key, sub là domain web */
async function vapidToken(env, aud) {
  const pub = b64uToBytes(env.VAPID_PUBLIC || '');
  const prv = b64uToBytes(env.VAPID_PRIVATE || '');
  if (pub.length !== 65 || prv.length !== 32) throw new Error('VAPID key sai định dạng');
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), d: bytesToB64u(prv),
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = bytesToB64u(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const pay = bytesToB64u(new TextEncoder().encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: String(env.SITE_BASE || 'https://ssochuz.pages.dev').replace(/\/+$/, '') || 'https://ssochuz.pages.dev',
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + pay));
  return head + '.' + pay + '.' + bytesToB64u(sig);
}
/* mã hoá payload theo RFC 8291 (aes128gcm, 1 record duy nhất) */
async function encryptPush(sub, payloadBytes) {
  const cliPub = b64uToBytes(sub.keys.p256dh);
  const auth = b64uToBytes(sub.keys.auth);
  if (cliPub.length !== 65 || auth.length !== 16) throw new Error('subscription keys sai');
  // ECDH always generates a key pair; Workers types also include symmetric keys.
  const srv = /** @type {CryptoKeyPair} */ (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const srvPubRaw = new Uint8Array(/** @type {ArrayBuffer} */ (await crypto.subtle.exportKey('raw', srv.publicKey)));
  const cliKey = await crypto.subtle.importKey('raw', cliPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // Web Crypto uses `public`, not `$public` from the generated Workers typings.
  const algorithm = { name: 'ECDH', public: cliKey };
  const shared = new Uint8Array(await crypto.subtle.deriveBits(algorithm, srv.privateKey, 256));
  const prk = await hmacSha256(auth, shared);   /* HKDF-Extract(salt=auth, ikm=shared) */
  const cek = await hkdfExpand(prk, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = await hkdfExpand(prk, 'Content-Encoding: nonce\0', 12);
  /* plaintext || 0x02 (delimiter, không pad thêm vì tin ngắn) */
  const pt = new Uint8Array(payloadBytes.length + 1);
  pt.set(payloadBytes, 0);
  pt[payloadBytes.length] = 2;
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, pt));
  const out = new Uint8Array(16 + 4 + 1 + 65 + ct.length);
  crypto.getRandomValues(out.subarray(0, 16));  /* salt */
  new DataView(out.buffer).setUint32(16, 4096); /* record size */
  out[20] = 65;
  out.set(srvPubRaw, 21);
  out.set(ct, 86);
  return out;
}
/* gửi 1 tin: trả {ok, dead} — dead=true khi sub đã chết (404/410) cần xoá */
async function sendPush(env, sub, payload) {
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidToken(env, aud);
  const body = await encryptPush(sub, new TextEncoder().encode(JSON.stringify(payload)));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'content-encoding': 'aes128gcm',
      ttl: String(PUSH_TTL),
      authorization: 'vapid t=' + jwt + ', k=' + String(env.VAPID_PUBLIC || '').trim(),
    },
    body,
  });
  if (r.status === 404 || r.status === 410) return { ok: false, dead: true };
  return { ok: r.ok, dead: false, status: r.status };
}
/* POST /api/push-sub {endpoint, keys:{p256dh, auth}} — đăng ký;
   {endpoint, remove:true} — huỷ. Mở cho mọi người đọc (không cần khoá admin). */
async function pushSub(req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const endpoint = String(body.endpoint || '').trim().slice(0, 500);
  if (!/^https:\/\//.test(endpoint)) return json({ ok: false, error: 'thiếu endpoint push hợp lệ' }, { status: 400, cors });
  const key = pushKey(endpoint);
  if (body.remove) {
    await env.CZ_KV.delete(key);
    return json({ ok: true, removed: true }, { cors });
  }
  const keys = body.keys || {};
  let p, a;
  try { p = b64uToBytes(keys.p256dh); a = b64uToBytes(keys.auth); }
  catch (e) { return json({ ok: false, error: 'khoá push sai định dạng' }, { status: 400, cors }); }
  if (p.length !== 65 || a.length !== 16) return json({ ok: false, error: 'khoá push sai độ dài' }, { status: 400, cors });
  /* chống spam ghi KV: mỗi IP 30 lần/giờ */
  if (!await rateLimit(env, 'rl:push:' + hash(clientIp(req) || 'x'), 30, 3600)) {
    return json({ ok: false, error: 'thao tác hơi nhanh, thử lại sau ít phút' }, { status: 429, cors });
  }
  await env.CZ_KV.put(key, JSON.stringify({
    endpoint, keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) },
    ua: String(req.headers.get('user-agent') || '').slice(0, 120), at: new Date().toISOString(),
  }));
  return json({ ok: true, hash: key.slice('push:'.length) }, { cors });
}
/* đọc toàn bộ subscription còn sống (tối đa 1000 — đủ cho quy mô web này) */
async function listPushSubs(env) {
  const out = [];
  let cursor;
  do {
    const l = await env.CZ_KV.list({ prefix: 'push:', limit: 1000, cursor });
    for (const k of l.keys) {
      try {
        const s = await env.CZ_KV.get(k.name, { type: 'json' });
        if (s && s.endpoint && s.keys) out.push({ key: k.name, sub: s });
      } catch (e) {}
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return out;
}
/* admin vừa lưu chương mới → ghi job vào hàng đợi (chỉ khi đang có subscriber) */
async function enqueuePush(env, slug, ch, chapTitle) {
  if (!env.CZ_KV) return { queued: false };
  try {
    const reg = await env.CZ_KV.get('registry', { type: 'json' });
    const nov = reg && reg.lib ? reg.lib.find((n) => n.slug === slug) : null;
    const l = await env.CZ_KV.list({ prefix: 'push:', limit: 1 });
    if (!l.keys.length) return { queued: false, reason: 'no-subs' };
    const base = String(env.SITE_BASE || 'https://ssochuz.pages.dev').replace(/\/+$/, '') || 'https://ssochuz.pages.dev';
    const q = (await env.CZ_KV.get('pushq', { type: 'json' })) || [];
    /* gộp job trùng (lưu 2 lần liên tiếp cùng chương thì chỉ báo 1 lần) */
    if (!q.some((j) => j && j.slug === slug && j.ch === ch)) {
      q.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        slug, ch: ch || 0, chapTitle: String(chapTitle || '').slice(0, 140),
        title: (nov && nov.title) || slug,
        url: base + '/truyen/' + slug + '/chuong-' + ch + '/',
        at: new Date().toISOString(), sent: {},
      });
      if (q.length > 50) q.splice(0, q.length - 50);   /* hàng đợi không phình vô hạn */
      await env.CZ_KV.put('pushq', JSON.stringify(q));
    }
    return { queued: true };
  } catch (e) { return { queued: false, reason: String((e && e.message) || e) }; }
}
/* tách tên riêng của chương ("Chương 5: Cuốn Vở" → "Cuốn Vở") để ráp câu báo */
function pushChapName(chapTitle) {
  const m = /^(?:chương|chuong|chap|chapter)\s*\d+\s*[:.\-–—]?\s*(.*)$/i.exec(String(chapTitle || '').trim());
  return m ? m[1].trim() : String(chapTitle || '').trim();
}
/* ============================================================================
   CRON · CHƯƠNG HẸN GIỜ TỚI MỐC → LÊN SÓNG
   ----------------------------------------------------------------------------
   Nội dung chương hẹn giờ nằm sẵn trong book JSON; trang đọc tự lọc theo giờ
   (getBookPublic) nên chương hiện ra đúng lúc. Việc của Cron là hai thứ mà
   chỉ nó làm được khi không ai mở trang quản trị:
     · sửa lại số chương trong registry (thẻ truyện ngoài web hiện “N chương”)
     · báo đẩy “chương mới” ĐÚNG lúc lên sóng (chứ không phải lúc bấm hẹn giờ)
   Chỉ đụng tới những bộ có ghi chú hẹn giờ trong registry nên rất nhẹ. */
async function publishDueChapters(env) {
  const stat = { books: 0, published: 0, pushed: 0 };
  if (!env.CZ_KV) return stat;
  let reg = null;
  try { reg = await env.CZ_KV.get('registry', { type: 'json' }); } catch (e) { return stat; }
  if (!reg || !Array.isArray(reg.lib)) return stat;
  const due = reg.lib.filter((n) => n && n.slug && (n.schedNext || n.pending));
  stat.books = due.length;
  if (!due.length) return stat;
  const now = Date.now();
  let writeReg = false;
  for (const n of due) {
    const book = await readBook(env, n.slug).catch(() => null);
    if (!book || !Array.isArray(book.chapters)) continue;
    /* chương hẹn giờ ĐÃ tới mốc: báo đẩy một lần rồi đánh dấu */
    const last = book.chapters[book.chapters.length - 1];
    if (last && String(last.status || '').toLowerCase() === 'scheduled' && !last.notified && !isChapterPending(last, now)) {
      last.notified = true;
      await enqueuePush(env, n.slug, book.chapters.length, last.t || '');
      await persistBook(env, n.slug, book);
      stat.pushed++;
      {
        const sorg = new URL(env.SITE_BASE || 'https://ssochuz.pages.dev').origin;
        await edgePurge(sorg + '/api/book/' + encodeURIComponent(n.slug), sorg + '/api/registry');
        /* chương hẹn giờ lên sóng → mục lục đổi (vị trí mới) nên xoá cả chùm */
        await purgeChapterCache(sorg, encodeURIComponent(n.slug), 0, true);
      }
    }
    const meta = scheduleMetaOf(book);
    if (meta.pending) { n.pending = meta.pending; if (meta.schedNext) n.schedNext = meta.schedNext; else delete n.schedNext; }
    else {
      if (n.pending || n.schedNext) stat.published++;
      delete n.pending; delete n.schedNext;
    }
    const live = countVisibleChapters(book.chapters, now);
    const labelNow = countLabelOf(n, live, meta.pending);
    if (Number(n.chapters) !== live || String(n.countLabel || '') !== labelNow) {
      n.chapters = live; n.countLabel = labelNow;
    }
    writeReg = true;
  }
  if (writeReg) {
    reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
    await env.CZ_KV.put('registry', registryJSON(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  }
  return stat;
}
/* Cron drain: gửi tối đa PUSH_BATCH tin, sub chết thì xoá, job xong thì gỡ */
async function drainPushQueue(env) {
  const stat = { sent: 0, failed: 0, removed: 0, jobs: 0, jobsLeft: 0 };
  if (!env.CZ_KV) return stat;
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return stat;   /* chưa cấu hình VAPID */
  let q = [];
  try { q = (await env.CZ_KV.get('pushq', { type: 'json' })) || []; } catch (e) { return stat; }
  if (!q.length) return stat;
  const subs = await listPushSubs(env);
  if (!subs.length) {   /* không còn ai nhận → dọn sạch hàng đợi */
    await env.CZ_KV.put('pushq', '[]');
    return stat;
  }
  let budget = PUSH_BATCH;
  const deadKeys = [];
  for (const job of q) {
    if (budget <= 0) break;
    job.sent = job.sent || {};
    const todo = subs.filter((s) => !job.sent[s.key] && deadKeys.indexOf(s.key) < 0).slice(0, budget);
    if (!todo.length) { job.done = true; continue; }
    const nm = pushChapName(job.chapTitle);
    const payload = {
      title: '📖 ' + job.title,
      body: 'Chương ' + job.ch + (nm ? ': ' + nm : '') + ' đã ra mắt!',
      url: job.url, tag: 'chuong-moi-' + job.slug + '-' + job.ch,
    };
    /* gửi song song từng đợt 9 tin cho nhanh mà vẫn gọn log */
    for (let i = 0; i < todo.length; i += 9) {
      const batch = todo.slice(i, i + 9);
      const res = await Promise.all(batch.map((s) =>
        sendPush(env, s.sub, payload).then((r) => ({ s, r })).catch(() => ({ s, r: { ok: false } }))
      ));
      for (const it of res) {
        job.sent[it.s.key] = 1;
        budget--;
        if (it.r.ok) stat.sent++;
        else if (it.r.dead) { stat.removed++; deadKeys.push(it.s.key); }
        else stat.failed++;
      }
    }
    if (subs.every((s) => job.sent[s.key])) job.done = true;
  }
  for (const k of deadKeys) { try { await env.CZ_KV.delete(k); } catch (e) {} }
  const left = q.filter((j) => !j.done);
  stat.jobs = q.length - left.length;
  stat.jobsLeft = left.length;
  await env.CZ_KV.put('pushq', JSON.stringify(left));
  if (stat.sent || stat.removed || stat.failed) {
    await logAct(env, 'push chương mới: gửi ' + stat.sent + ' tin' +
      (stat.removed ? ' · xoá ' + stat.removed + ' sub chết' : '') +
      (stat.failed ? ' · lỗi ' + stat.failed : ''), null);
  }
  return stat;
}
/* =========================== tiện ích =========================== */
function corsHeaders(req, env) {
  /* Production mặc định đóng theo hai domain thật; chỉ mở * khi quản trị chủ động
     đặt ALLOW_ORIGIN="*" (không khuyến nghị). */
  const allowRaw = String((env && env.ALLOW_ORIGIN) || 'https://ssochuz.pages.dev,https://chuseoz.pages.dev,https://chuseoz.blogspot.com').trim();
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
    'access-control-allow-methods': 'GET,PUT,PATCH,POST,DELETE,OPTIONS',
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
function isPubliclyListed(n) {
  if (!n || typeof n !== 'object') return false;
  const vis = String(n.visibility || 'public').toLowerCase();
  if (vis === 'private') return false;
  const pub = String(n.pubStatus || 'published').toLowerCase();
  if (pub === 'draft' || pub === 'pending_review' || pub === 'pending' || pub === 'rejected' || pub === 'archived') return false;
  if (pub === 'scheduled') {
    const at = Date.parse(n.publishedAt || n.published_at || '');
    if (!at || at > Date.now()) return false;
  }
  return true;
}
function publicRegistryJSON(reg) {
  let copy;
  try { copy = JSON.parse(JSON.stringify(reg || {})); } catch (e) { copy = reg || {}; }
  if (copy.settings && typeof copy.settings === 'object') {
    delete copy.settings.staff;
    delete copy.settings.roles;
  }
  if (Array.isArray(copy.lib)) copy.lib = copy.lib.filter(isPubliclyListed);
  return JSON.stringify(stripPrivateRegistrySettings(copy));
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
   · URL có query: KHOÁ CACHE bỏ hết tham số rác (`?fbclid=…`, `?utm_source=…`,
     `?_=…`) — xem src/shared/cache-key.js. Link chia sẻ qua Facebook/Zalo vì
     thế dùng CHUNG bản lưu với URL sạch (bản cũ: mọi link có `fbclid` đều đi
     thẳng KV, mỗi lượt mở là một lần đọc + phân tích cả bộ JSON).
     Tham số THẬT (vd `token=` của truyện khoá) vẫn đi thẳng KV, không cache.
   · Mỗi mục lưu có thể tự khai hạn dùng riêng bằng header nội bộ `x-cz-ttl`
     (giây): bộ còn chương hẹn giờ thì để 60 giây cho chương tự lên sóng đúng
     giờ, bộ thường thì dài (xem EDGE_TTL).
   · Mỗi lần GHI thành công (PUT/DELETE/vote/seed/…) đều xoá đúng mục cache
     liên quan nên “sửa thấy ngay” vẫn giữ nguyên. Header `x-cz-cache`
     (HIT/MISS/BYPASS) để ngoài trình duyệt kiểm chứng được bằng DevTools. */
function edgeCache() {
  try { return (typeof caches !== 'undefined' && caches.default) || null; } catch (e) { return null; }
}
const EDGE_TTL = {
  /* giây, theo URL. Registry đổi khi thêm/sửa bộ, chương đổi khi sửa chữ —
     mọi đường ghi đều purge đúng URL nên để dài là an toàn (mỗi lần trượt
     cache là 1 lượt đọc KV + một lần JSON.parse cả bộ 334 KB trong Worker).
     Bộ CÒN chương hẹn giờ tự hạ xuống EDGE_TTL.pending cho chương lên sóng
     đúng giờ (xem `ttlOf`). */
  registry: 300, book: 1800, pending: 60, stats: 60, feed: 600,
  toc: 1800, chapter: 86400, comments: 15,
};
/* Trần cho `s-maxage` gửi RA NGOÀI. Bản lưu trong Worker (Cache API) là thứ mình
   XOÁ ĐƯỢC mỗi lần ghi, nên để dài (x-cz-ttl tới 24 giờ). Còn `s-maxage` nói với
   các tầng cache KHÁC (proxy/CDN trung gian) — mình không xoá được chúng, nên
   giữ tối đa 10 phút: sửa xong, cùng lắm 10 phút là mọi nơi thấy bản mới. */
const EDGE_SMAXAGE_MAX = 600;
const outerTTL = (secs) => Math.min(Number(secs) > 0 ? Number(secs) : 60, EDGE_SMAXAGE_MAX);
/* hạn dùng riêng của một mục cache: header nội bộ `x-cz-ttl` thắng `secs` mặc
   định của caller (dùng cho bộ có chương hẹn giờ). */
function ttlOfKey(req, secs) {
  return Number(secs) > 0 ? Number(secs) : EDGE_TTL.book;
}
async function edgeCached(req, cors, secs, load, keyFn) {
  let key = req.url;
  if (key.indexOf('?') >= 0) {
    /* URL có query: caller có hàm chuẩn hoá riêng (feed, bình luận) thì dùng;
       không thì bỏ tham số rác (fbclid/utm…). Còn tham số THẬT → BYPASS. */
    key = (typeof keyFn === 'function' && keyFn(req)) || cacheKeyOf(req.url) || '';
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
      let fresh = false, ttl = ttlOfKey(req, secs);
      try {
        const own = parseFloat(hit.headers.get('x-cz-ttl') || '');
        if (own > 0) ttl = own;
        fresh = (Date.now() - (parseInt(hit.headers.get('x-cz-cached-at') || '0', 10) || 0)) < ttl * 1000;
      } catch (e) { fresh = false; }
      if (fresh) {
        try {
          const h = new Headers(hit.headers);
          h.delete('x-cz-cached-at');
          h.delete('x-cz-ttl');
          Object.keys(cors).forEach((k) => h.set(k, cors[k]));
          h.set('x-cz-cache', 'HIT');
          return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
        } catch (e) { /* đọc ra hỏng thì làm lại từ KV bên dưới */ }
      } else { try { await box.delete(key); } catch (e) {} }
    }
  }
  const res = await load();
  /* Lưu cả 200 (nội dung tải từ KV) LẪN 302 (ảnh nằm trên Supabase Storage —
     Worker chỉ chuyển hướng). Bản cũ chỉ lưu 200 nên mỗi lượt xem một tấm bìa
     là một lượt ĐỌC KV: trang chủ 60 bìa × mỗi lần mở trang = vài chục nghìn
     lượt/ngày. URL ảnh là bất biến (id theo nội dung) nên chuyển hướng an toàn.
     Lỗi (404/503/…) vẫn luôn đọc lại từ KV. */
  if (box && res && (res.status === 200 || res.status === 302)) {
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
  if (!box || !('keys' in box) || typeof box.keys !== 'function') return;
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
/* Xoá bản lưu MỤC LỤC NHẸ + CHƯƠNG vừa đổi (bản 1.16.0).
   all = true khi vị trí các chương có thể đã đổi (xoá chương, đổi thứ tự, nạp
   lại cả bộ, chương hẹn giờ vừa lên sóng…) → xoá cả chùm /chapter/*. */
async function purgeChapterCache(org, rawSlug, idx, all) {
  const bases = [String(rawSlug || '')];
  let enc = '';
  try { enc = encodeURIComponent(decodeURIComponent(bases[0])); } catch (e) { enc = ''; }
  if (enc && bases.indexOf(enc) < 0) bases.push(enc);
  const urls = [];
  bases.forEach((b) => {
    if (!b) return;
    urls.push(org + '/api/book/' + b + '/toc');
    if (!all && idx > 0) urls.push(org + '/api/book/' + b + '/chapter/' + idx);
  });
  await edgePurge(...urls);
  if (all) for (const b of bases) if (b) await edgePurgePrefix(org, '/api/book/' + b + '/chapter/');
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
    /* chương của truyện khóa mật mã KHÔNG được lọt ra feed RSS */
    if (nov && nov.lock) return json({ ok: false, error: 'bộ này đã được khóa mật mã — không có feed công khai' }, { status: 404, cors });
    const book = await readBook(env, slug);
    const chs = (book && Array.isArray(book.chapters)) ? book.chapters : [];
    if (!chs.length) return json({ ok: false, error: 'bộ này chưa có chương nào' }, { status: 404, cors });
    const title = (nov && nov.title) || (book && book.title) || slug;
    chan = {
      title: title + ' — ssochuz library',
      link: base + '/truyen/' + slug + '/',
      desc: (nov && nov.syn) || (book && book.syn) || ('Đọc truyện ' + title + ' trên ssochuz library.'),
    };
    const pub = rfc822((nov && nov.updated) || (reg && reg.rev));
    /* chương hẹn giờ chưa tới mốc / đang Ẩn KHÔNG được lọt vào RSS (giữ đúng
       số thứ tự chương: vị trí tính theo mảng gốc) */
    items = chs.map((c, i) => ({ c, i })).filter((x) => !isChapterPending(x.c))
      .map(({ c, i }) => ({
        t: feedChapTitle(c, i),
        link: base + '/truyen/' + slug + '/chuong-' + (i + 1) + '/',
        pub, desc: chapSnippet(c.html, 300),
      })).reverse().slice(0, 50);
  } else {
    /* bỏ luôn truyện khóa mật mã — feed chỉ dành cho nội dung công khai */
    const cands = lib.filter((n) => n && n.slug && !n.lock && (parseInt(n.chapters, 10) || 0) > 0)
      .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || ''))).slice(0, 12);
    const books = await Promise.all(cands.map((n) => readBook(env, n.slug).catch(() => null)));
    cands.forEach((n, k) => {
      const book = books[k];
      const chs = (book && Array.isArray(book.chapters)) ? book.chapters : [];
      /* 5 chương ĐANG HIỆN mới nhất (bỏ chương hẹn giờ chưa tới mốc / đang Ẩn) */
      const take = chs.map((c, i) => ({ c, i })).filter((x) => !isChapterPending(x.c)).slice(-5);
      take.forEach(({ c, i }) => {
        const pos = i + 1;
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
async function getKV(env, key, cors, cacheSec, mode) {
  if (!env.CZ_KV) return noKV(cors);
  const { value, metadata } = await env.CZ_KV.getWithMetadata(key, { type: 'text' });
  if (value == null) return json({ ok: false, error: 'chưa có dữ liệu cho khoá ' + key }, { status: 404, cors });
  let publicValue = value;
  if (key === 'registry') {
    try {
      const parsed = JSON.parse(value);
      publicValue = (mode && mode.admin) ? registryJSON(parsed) : publicRegistryJSON(parsed);
    } catch (e) { publicValue = value; }
  }
  /* max-age=0: trình duyệt luôn hỏi lại → trúng cache biên (nhanh mà không tốn
     lượt đọc KV); s-maxage: bản lưu ở biên dùng được từng này giây. */
  const h = { ...JSONH, ...cors, 'cache-control': (mode && mode.admin ? 'private, no-store' : 'public, max-age=0, s-maxage=' + outerTTL(cacheSec || 60)), 'x-kv-key': key };
  /* ETag cũ mô tả bản chưa lọc nên không gửi cho registry đã được làm sạch. */
  if (key !== 'registry' && metadata && metadata.etag) h.etag = metadata.etag;
  return new Response(publicValue, { headers: h });
}

/* ============================================================================
   KHÓA TRUYỆN BẰNG MẬT MÃ (bản 1.10.0)
   ----------------------------------------------------------------------------
   Yêu cầu: card truyện VẪN hiện ở trang chủ/thư viện (mang cờ `lock:1` trong
   registry — chỉ là cờ, không chứa mật mã), nhưng danh sách chương + nội dung
   chỉ trả khi trình giữ token đúng. Mật mã băm PBKDF2-SHA256 (100.000 vòng,
   salt 128-bit) nằm trong bản ghi `book:<slug>` — KHÔNG nằm trong registry
   công khai. Token là HMAC-SHA256(slug|exp) ký bằng SESSION_SECRET (dự phòng
   ADMIN_KEY), có hạn 6 giờ, stateless nên không tốn khoá KV.
   Chương bị khóa KHÔNG rớt về file tĩnh /data/book/*.json, KHÔNG vào RSS.
   ========================================================================== */
const LOCK_TTL = 6 * 3600;   /* giây — token mở truyện có hạn 6 giờ */
const PBKDF2_ITER = 100000;
async function pbkdf2Bits(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: PBKDF2_ITER }, key, 256));
}
function lockSecret(env) {
  return String((env && (env.SESSION_SECRET || env.ADMIN_KEY)) || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}
function b64uFromBytes(b) {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesFromB64(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function lockSig(env, slug, exp) {
  const secret = lockSecret(env);
  if (!secret) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(slug + '|' + exp)));
  return b64uFromBytes(sig);
}
async function makeLockToken(env, slug) {
  const exp = Math.floor(Date.now() / 1000) + LOCK_TTL;
  const sig = await lockSig(env, slug, exp);
  return sig ? sig + '.' + exp : '';
}
async function verifyLockToken(env, slug, token) {
  token = String(token || '');
  const i = token.lastIndexOf('.');
  if (i < 8) return 0;
  const exp = parseInt(token.slice(i + 1), 10) || 0;
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now || exp - now > 30 * 86400) return 0;   /* hết hạn hoặc xa vô lý */
  const cand = token.slice(0, i);
  const want = await lockSig(env, slug, exp);
  if (!want || want.length !== cand.length) return 0;
  let diff = 0;
  for (let k = 0; k < want.length; k++) diff |= want.charCodeAt(k) ^ cand.charCodeAt(k);
  return diff === 0 ? exp : 0;
}
/* HTTP 502 khi KV chỉ còn STUB mà Worker không lấy được bản đầy đủ (1.16.1).
   Vì sao phải nói rõ: sự cố 23/09 (`wrangler deploy` xoá biến SUPABASE_URL) làm
   cả 63 bộ unreadable mà lỗi chỉ ghi "không đọc được dữ liệu bộ (overflow?)" —
   không ai đoán được là thiếu biến nào, và /toc còn báo 404 "chưa có dữ liệu"
   khiến tưởng bộ bị xoá. Nay lỗi nêu TÊN biến thiếu + 2 cách chữa. */
function overflowFailResponse(cors, slug, detail) {
  const miss = (detail && detail.missing) || [];
  const tried = ((detail && detail.why) || []).slice(0, 3).map((s) => String(s).slice(0, 200));
  return json({
    ok: false,
    error: 'Không đọc được nội dung bộ "' + slug + '": dữ liệu nằm NGOÀI KV (overflow) mà Worker không lấy được'
      + (miss.length ? ' — thiếu biến ' + miss.join(', ') : '') + '.',
    slug: slug,
    missing: miss,
    tried: tried,
    hint: 'Chữa 1 trong 2 cách: (A) Workers & Pages → Settings → Variables and Secrets → thêm SUPABASE_URL = https://<ref>.supabase.co (Text) → Save;'
      + ' (B) SUPABASE_URL đã nằm trong worker/wrangler.toml nên `cd worker && npx wrangler deploy` là đủ.'
      + ' Thiếu secret thì `cd worker && npx wrangler secret put SUPABASE_SERVICE_ROLE`.'
      + ' Không deploy lại cũng được nếu Project URL đã lưu ở /admin → Cài đặt & đồng bộ.',
  }, { status: 502, cors });
}
/* GET /api/book/<slug> — bản công khai: tự bóc khóa, che chương khi chưa mở */
async function getBookPublic(req, env, cors) {
  const u = new URL(req.url);
  const slug = decodeURIComponent(u.pathname.replace(/^\/api\/book\//, ''));
  /* quản trị (X-Admin-Key đúng) luôn đọc được TRỌN bộ — kể cả khi đang khóa.
     Không có đường này, sửa chương cho bộ khóa là sửa trên vỏ rỗng và bấm
     Lưu sẽ ghi đè mất chương. Admin PHẢI đi thẳng KV, không qua cache biên:
     cache chung theo URL, để bản trọn vào đó là bộ khóa lộ ra cho người đọc
     khi cùng URL trúng cache. */
  if (authed(req, env)) {
    if (!env.CZ_KV) return noKV(cors);
    const raw = await env.CZ_KV.get('book:' + slug, { type: 'text' });
    if (raw == null) return json({ ok: false, error: 'chưa có dữ liệu cho khoá book:' + slug }, { status: 404, cors });
    const got = await materializeBookChecked(env, raw, slug);
    if (!got.book) return overflowFailResponse(cors, slug, got);
    const book = got.book;
    const ah = { ...JSONH, ...cors, 'cache-control': 'private, no-store', 'x-kv-key': 'book:' + slug };
    return new Response(JSON.stringify(book), { headers: ah });
  }
  return await edgeCached(req, cors, EDGE_TTL.book, async () => {
    if (!env.CZ_KV) return noKV(cors);
    const { value, metadata } = await env.CZ_KV.getWithMetadata('book:' + slug, { type: 'text' });
    if (value == null) return json({ ok: false, error: 'chưa có dữ liệu cho khoá book:' + slug }, { status: 404, cors });
    const got = await materializeBookChecked(env, value, slug);
    /* KV có khoá mà không đọc được ⇒ 502 kèm tên biến thiếu (KHÔNG phải 404:
       bộ vẫn còn, chỉ là Worker mất đường lấy nội dung) */
    if (!got.book) return overflowFailResponse(cors, slug, got);
    const book = got.book;
    /* bộ còn chương hẹn giờ: bản lưu chỉ sống 60 giây, đủ để chương lên sóng
       gần đúng mốc giờ (bản cũ: 300 giây; nếu để 1.800 giây như bộ thường thì
       chương hẹn giờ hiện trễ tới nửa tiếng — đúng thứ người viết cần nhất). */
    const ttl = bookPending(book) ? EDGE_TTL.pending : EDGE_TTL.book;
    const h = {
      ...JSONH, ...cors, 'cache-control': 'public, max-age=0, s-maxage=' + outerTTL(ttl), 'x-kv-key': 'book:' + slug,
      'x-cz-ttl': String(ttl),
    };
    if (metadata && metadata.etag) h.etag = metadata.etag;
    const pub = publicBookShape(book);
    if (book && book.lock) {
      const exp = await verifyLockToken(env, slug, u.searchParams.get('token'));
      if (!exp) {
        /* chỉ trả vỏ: KHÔNG có chương, không synFull, không salt/hash */
        return new Response(JSON.stringify({ title: book.title || slug, slug: slug, locked: true, chapters: [] }), { headers: h });
      }
      const out = Object.assign({}, pub, { locked: true, lockUntil: exp });
      delete out.lock;
      return new Response(JSON.stringify(out), { headers: h });
    }
    return new Response(JSON.stringify(pub), { headers: h });
  });
}
/* số chương đang bị giữ (hẹn giờ chưa tới / ẩn) — dùng để chọn hạn cache */
function bookPending(book) {
  return (book && Array.isArray(book.chapters)) ? countPendingChapters(book.chapters) : 0;
}
/* ============================================================================
   ĐỌC 1 CHƯƠNG + MỤC LỤC NHẸ  (bản 1.16.0)
     GET /api/book/<slug>/toc            → đầu sách + DANH SÁCH TÊN chương
     GET /api/book/<slug>/chapter/<n>    → đầu sách + đúng 1 chương (n = vị trí
                                           1-based trong danh sách ĐANG HIỆN)
   ----------------------------------------------------------------------------
   Vì sao có: trang đọc cũ tải CẢ bộ cho mỗi lần mở chương — trung bình 334 KB,
   bộ lớn 1,4 MB (1.216 chương thật trong repo). Mỗi lượt mở chương = 1 lượt đọc
   KV + một lần JSON.parse cả bộ trong Worker (tốn CPU 10 ms/request của free
   tier). Hai đường này chỉ trả phần cần dùng (chương trung bình 18 KB) và lưu ở
   biên rất lâu (EDGE_TTL.chapter = 24 giờ) vì mọi lần ghi chương/đổi thứ tự/xoá
   đều purge đúng URL.
   · /api/book/<slug> GIỮ NGUYÊN — trang đọc vẫn có đường lùi khi Worker cũ chưa
     deploy, và RSS/admin vẫn dùng.
   · Truyện khoá mật mã: chưa có token hợp lệ → chỉ trả vỏ {locked:true}; có
     `?token=…` thì đi thẳng KV (BYPASS cache) — không để nội dung riêng của
     người này lọt vào bản lưu chung.
   · Chương đang bị giữ (hẹn giờ chưa tới / ẩn) KHÔNG trả nội dung, trả 404
     kèm lý do; mục lục cũng không liệt kê chúng.
   ========================================================================== */
function bookHead(book, pub, slug) {
  const list = (pub && Array.isArray(pub.chapters) ? pub.chapters : []).map((c, i) => ({
    t: String((c && c.t) || '').trim() || ('Chương ' + (i + 1)),
  }));
  return {
    ok: true, slug: slug,
    title: String((book && book.title) || slug),
    author: String((book && book.author) || ''),
    couple: String((book && book.couple) || ''),
    syn: String((book && book.syn) || '').slice(0, 600),
    synFull: String((book && book.synFull) || ''),
    pending: bookPending(book),
    total: list.length,
    chapters: list,
  };
}
/* HTTP 404 cho chương đang bị giữ — nói rõ vì sao để trang đọc báo đúng */
async function getBookChapterPublic(req, env, cors, slug, n, tocOnly) {
  const u = new URL(req.url);
  const admin = authed(req, env);
  const ttl = tocOnly ? EDGE_TTL.toc : EDGE_TTL.chapter;
  const load = async () => {
    if (!env.CZ_KV) return noKV(cors);
    /* 1.16.1: phân biệt "chưa có bộ" (404) với "có mà không đọc được" (502).
       Bản 1.16.0 trả 404 cho CẢ HAI vì readBook trả null chung — đúng lúc mất
       biến SUPABASE_URL, 63 bộ đang có bỗng báo "chưa có dữ liệu". */
    const got = await readBookChecked(env, slug).catch((e) => ({ status: 'unreadable', book: null, missing: missingOverflowVars(env), why: [String((e && e.message) || e)] }));
    const book = got.book;
    if (!book) {
      if (got.status === 'unreadable') return overflowFailResponse(cors, slug, got);
      return json({ ok: false, error: 'chưa có dữ liệu cho khoá book:' + slug }, { status: 404, cors });
    }
    /* bộ khoá mật mã: chỉ trả khi token hợp lệ, và KHÔNG qua cache chung */
    if (book.lock) {
      const exp = await verifyLockToken(env, slug, u.searchParams.get('token'));
      if (!exp) {
        return json({ ok: false, locked: true, error: 'Truyện đang khoá mật mã.', slug: slug },
          { status: 403, cors, headers: { 'cache-control': 'private, no-store' } });
      }
    }
    const pub = publicBookShape(book);
    const head = bookHead(book, pub, slug);
    const pending = bookPending(book);
    /* chương đang hẹn giờ/ẩn: bản lưu chỉ sống 60 giây để chương tự lên sóng */
    const useTtl = pending ? EDGE_TTL.pending : ttl;
    const h = {
      ...JSONH, ...cors, 'x-kv-key': 'book:' + slug, 'x-cz-ttl': String(useTtl),
      'cache-control': 'public, max-age=0, s-maxage=' + outerTTL(useTtl),
    };
    if (tocOnly) return new Response(JSON.stringify(head), { headers: h });
    const total = head.total;
    if (!(n >= 1) || n > total) {
      return json({ ok: false, error: 'Bộ này chỉ có ' + total + ' chương đang hiện.', slug: slug, total: total }, { status: 404, cors });
    }
    /* chương gốc bị giữ (ẩn/hẹn giờ) nằm TRƯỚC vị trí n đang hỏi → khi chương
       đó lên sóng, đánh số vị trí đổi. Muốn biết vị trí n ứng với chương nào
       thì phải bỏ đúng những chương đang bị giữ, giống publicBookShape. */
    const vis = [];
    book.chapters.forEach((c, i) => { if (!isChapterPending(c)) vis.push({ c: c, i: i }); });
    if (!vis.length) return json({ ok: false, error: 'Bộ này chưa có chương nào đang hiện.' }, { status: 404, cors });
    const hit = vis[Math.min(n, vis.length) - 1];
    const ch = hit.c;
    const out = Object.assign({}, head, {
      index: Math.min(n, vis.length),
      sourceIndex: hit.i,
      at: chapterAtMs(ch) ? new Date(chapterAtMs(ch)).toISOString() : '',
      chapter: { t: String((ch && ch.t) || '').trim(), html: String((ch && ch.html) || '') },
      nextAt: nextScheduleMs(book.chapters) ? new Date(nextScheduleMs(book.chapters)).toISOString() : '',
    });
    return new Response(JSON.stringify(out), { headers: h });
  };
  if (admin || slug.indexOf('private-') === 0) {
    /* quản trị / truyện riêng tư: đi thẳng KV, không cache biên */
    const raw = await load();
    try { raw.headers.set('x-cz-cache', 'BYPASS'); } catch (e) {}
    return raw;
  }
  return await edgeCached(req, cors, ttl, load);
}
/* Bản công khai của 1 bộ: BỎ chương chưa tới giờ hẹn và chương đang Ẩn.
   Vì sao lọc ở Worker chứ không ở trang đọc: giấu nội dung ở phía trình duyệt
   là giấu bằng niềm tin — ai mở DevTools cũng đọc được chương chưa tới giờ. */
function publicBookShape(book) {
  if (!book || typeof book !== 'object') return book;
  const out = Object.assign({}, book);
  if (!Array.isArray(book.chapters)) return out;
  const pending = countPendingChapters(book.chapters);
  out.chapters = book.chapters.filter((c) => !isChapterPending(c));
  if (pending) out.pendingChapters = pending;   /* số chương đang chờ — web đọc bỏ qua */
  return out;
}

/* POST /api/lock { slug, password } — nhập mật mã → token 6 giờ */
async function postLock(req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  const pw = String(body.password == null ? '' : body.password);
  if (!slug) return json({ ok: false, error: 'thiếu slug hợp lệ' }, { status: 400, cors });
  if (!await rateLimit(env, 'rl:lock:' + hash(clientIp(req) || 'x') + ':' + slug, 20, 900)) {
    return json({ ok: false, error: 'Quá nhiều lần thử. Vui lòng quay lại sau 15 phút.' }, { status: 429, cors, headers: { 'cache-control': 'private, no-store' } });
  }
  const gotBook = await readBookChecked(env, slug);
  if (!gotBook.book && gotBook.status === 'unreadable') return overflowFailResponse(cors, slug, gotBook);
  const book = gotBook.book;
  const rec = book && book.lock;
  if (!rec || !Array.isArray(rec.salt) || !Array.isArray(rec.hash)) {
    return json({ ok: false, error: 'Truyện này không yêu cầu mật mã.' }, { status: 400, cors, headers: { 'cache-control': 'private, no-store' } });
  }
  let diff = 0;
  /* luôn chạy PBKDF2 đủ vòng dù mật khẩu quá dài — giữ thời gian phản hồi đều */
  const got = await pbkdf2Bits(pw.slice(0, 256), new Uint8Array(rec.salt));
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ rec.hash[i];
  if (diff) return json({ ok: false, error: 'Mật mã không đúng.' }, { status: 403, cors, headers: { 'cache-control': 'private, no-store' } });
  const token = await makeLockToken(env, slug);
  return json({ ok: true, token: token, exp: Math.floor(Date.now() / 1000) + LOCK_TTL },
    { cors, headers: { 'cache-control': 'private, no-store' } });
}
/* cờ `lock:1` trong registry — chỉ CỜ để thẻ truyện hiện huy hiệu + trang đọc
   biết phải chặn; mật mã/băm KHÔNG bao giờ nằm trong registry công khai. */
async function setLockFlag(env, slug, on) {
  if (!env.CZ_KV || !slug) return;
  const reg = (await env.CZ_KV.get('registry', { type: 'json' })) || { lib: [] };
  if (!Array.isArray(reg.lib)) return;
  const n = reg.lib.find((x) => x && x.slug === slug);
  if (!n) return;
  const was = n.lock ? 1 : 0, now = on ? 1 : 0;
  if (was === now) return;
  if (now) n.lock = 1; else delete n.lock;
  reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await env.CZ_KV.put('registry', registryJSON(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
}
/* POST /api/lock/set { slug, password } (quản trị) — password rỗng = bỏ khóa */
async function setLock(req, env, cors, org) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  if (!slug) return json({ ok: false, error: 'thiếu slug hợp lệ' }, { status: 400, cors });
  const gotLock = await readBookChecked(env, slug);
  /* không đọc được bộ thì KHÔNG khoá: khoá là ghi lại book, ghi trên vỏ rỗng
     là xoá sạch chương (1.16.1) */
  if (!gotLock.book) {
    if (gotLock.status === 'unreadable') return overflowFailResponse(cors, slug, gotLock);
    return json({ ok: false, error: 'Bộ chưa có trên KV — nạp dữ liệu lên KV trước khi khóa.' }, { status: 404, cors });
  }
  const book = gotLock.book;
  const pw = String(body.password == null ? '' : body.password).trim();
  if (!pw) {
    if (book.lock) {
      delete book.lock;
      await persistBook(env, slug, book);
    }
    await setLockFlag(env, slug, 0);
    await logAct(env, 'bỏ khóa ' + slug, req);
    await edgePurge(org + '/api/book/' + encodeURIComponent(slug), org + '/api/registry');
    await purgeChapterCache(org, encodeURIComponent(slug), 0, true);
    await purgeFeed(org);
    return json({ ok: true, slug: slug, locked: false }, { cors });
  }
  if (pw.length < 8 || pw.length > 256) {
    return json({ ok: false, error: 'Mật mã cần từ 8 đến 256 ký tự.' }, { status: 400, cors });
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashb = await pbkdf2Bits(pw, salt);
  book.lock = { salt: Array.from(salt), hash: Array.from(hashb), set: new Date().toISOString() };
  await persistBook(env, slug, book);
  await setLockFlag(env, slug, 1);
  await logAct(env, 'khóa/đổi mật mã ' + slug, req);
  await edgePurge(org + '/api/book/' + encodeURIComponent(slug), org + '/api/registry');
  await purgeChapterCache(org, encodeURIComponent(slug), 0, true);
  await purgeFeed(org);
  return json({ ok: true, slug: slug, locked: true }, { cors });
}

/* ============================================================================
   ẢNH TRONG CHƯƠNG + ẢNH BÌA — lưu base64 đã nén trên KV, key `img:<id>`
   ----------------------------------------------------------------------------
   Web là trang tĩnh nên ảnh upload phải sống trên KV. Trình duyệt NÉN ảnh
   (WebP, tối đa ~1400px) rồi gửi base64; Worker chỉ kiểm kiểu + kích thước.
   URL /api/img/<id> là "immutable" (id ngẫu nhiên) → cache 1 năm không lo ảnh
   cũ dính khi đổi ảnh (đổi ảnh = id mới = URL mới).
   ========================================================================== */
async function postImage(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  if (!await rateLimit(env, 'rl:img:' + hash(clientIp(req) || 'x'), 120, 3600)) {
    return json({ ok: false, error: 'Lên ảnh hơi nhanh — thử lại sau ít phút.' }, { status: 429, cors });
  }
  const body = await req.json().catch(() => ({}));
  const type = String(body.type || '');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(type) < 0) {
    return json({ ok: false, error: 'Chỉ nhận JPEG, PNG hoặc WebP.' }, { status: 400, cors });
  }
  const data = String(body.data || '').replace(/^data:[^;,]+;base64,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]{16,}={0,2}$/.test(data)) {
    return json({ ok: false, error: 'Dữ liệu ảnh không hợp lệ.' }, { status: 400, cors });
  }
  if (data.length > 11 * 1024 * 1024) {
    return json({ ok: false, error: 'Ảnh quá lớn — giảm kích thước rồi thử lại (giới hạn ~8 MB).' }, { status: 413, cors });
  }
  const kind = String(body.kind || '').trim().toLowerCase();
  /* base64: 4 ký tự → 3 byte (bỏ ký tự đệm '=' — chính nó làm cách tính
     naob 0.75 bị thừa 1–2 byte với ảnh thật) */
  const bytesIn = Math.floor(data.replace(/=+$/, '').length * 3 / 4);
  /* ID do trình duyệt đặt theo NỘI DUNG ảnh (hash) → dán lại cùng một ảnh
     không tốn thêm chỗ: thấy khoá `img:<id>` đã có thì trả luôn URL cũ.
     Bản cũ dùng UUID ngẫu nhiên nên mỗi lần upload là một bản sao mới. */
  const wantId = String(body.id || '').trim().toLowerCase();
  const hashedId = /^[a-z0-9][a-z0-9-]{9,63}$/.test(wantId) ? wantId : '';
  if (hashedId) {
    const existed = await readImage(env, hashedId).catch(() => null);
    if (existed) {
      return json({
        ok: true, id: hashedId, url: existed.url || ('/api/img/' + hashedId),
        bytes: bytesIn, overflow: existed.url ? 'supabase-storage' : '', dedupe: true,
      }, { cors });
    }
  }
  const id = hashedId || ((typeof crypto.randomUUID === 'function') ? crypto.randomUUID()
    : 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  let stored;
  try {
    if (kind === 'cover') stored = await persistCover(env, id, data, type);
    else stored = await persistChapterImage(env, id, data, type);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, { status: 502, cors });
  }
  await logAct(env, 'lên ảnh ' + (kind === 'cover' ? 'bìa ' : '') + id.slice(0, 8) + '… (' + Math.max(1, Math.round(stored.bytes / 1024)) + ' KB)', req);
  const url = stored.url || ('/api/img/' + id);
  return json({ ok: true, id: id, url, bytes: stored.bytes, overflow: stored.overflow || '', dedupe: false }, { cors });
}
async function getImage(req, env, cors, id) {
  if (!env.CZ_KV) return noKV(cors);
  return await edgeCached(req, cors, 31536000, async () => {
    const img = await readImage(env, id);
    if (!img) return json({ ok: false, error: 'không tìm thấy ảnh' }, { status: 404, cors });
    if (img.url && /^https:\/\//i.test(img.url)) {
      return new Response(null, {
        status: 302,
        headers: {
          ...cors,
          location: img.url,
          'cache-control': 'public, max-age=86400',
          'x-kv-key': 'img:' + id,
        },
      });
    }
    if (img.data == null) return json({ ok: false, error: 'không tìm thấy ảnh' }, { status: 404, cors });
    const h = {
      ...cors,
      'content-type': img.type || 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-kv-key': 'img:' + id,
    };
    return new Response(bytesFromB64(img.data), { headers: h });
  });
}

/* ============================================================================
   KIỂM KHO DỮ LIỆU KV (GET /api/admin/kv) — cho tab Kiểm tra dữ liệu
   ----------------------------------------------------------------------------
   Nhóm theo tiền tố khoá, đếm số khoá + tổng byte (từ metadata.bytes khi có).
   Dùng để trả lời "dữ liệu đang phình ở đâu, phần nào nên dọn".
   ========================================================================== */
async function kvAudit(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const groups = {};
  let totalKeys = 0, totalBytes = 0, unknown = 0;
  const add = (name, meta) => {
    const pre = String(name || '').split(':')[0] || 'other';
    const g = groups[pre] || (groups[pre] = { keys: 0, bytes: 0, unknownBytes: 0 });
    g.keys++;
    totalKeys++;
    const b = meta && meta.bytes;
    if (typeof b === 'number' && b >= 0) { g.bytes += b; totalBytes += b; }
    else { g.unknownBytes++; unknown++; }
  };
  let cursor;
  let writesToday = 0;
  const today = dayStr();
  for (let guard = 0; guard < 60; guard++) {
    const l = await env.CZ_KV.list({ limit: 1000, cursor });
    (l.keys || []).forEach((k) => {
      add(k.name, k.metadata);
      /* đếm lượt ghi HÔM NAY cho quota: key nào có mốc ghi (metadata.saved của
         book/registry, metadata.at của ảnh) đúng hôm nay tính 1 lần ghi */
      const stamp = (k.metadata && (k.metadata.saved || k.metadata.at)) || '';
      if (String(stamp).slice(0, 10) === today) writesToday++;
    });
    cursor = l.list_complete ? null : l.cursor;
    if (!cursor) break;
  }
  /* các thao tác không có metadata (lock/vote/import/sync/xoá bình luận…) đều
     ghi vào `log` — mỗi mục log hôm nay tính thêm 1 lượt ghi */
  try {
    const logs = (await env.CZ_KV.get('log', { type: 'json' })) || [];
    logs.forEach((x) => { if (String((x && x.at) || '').slice(0, 10) === today) writesToday++; });
  } catch (e) {}
  const order = ['book', 'img', 'cmt', 'voters', 'rateagg', 'stats_cache', 'registry', 'log', 'push', 'rl', 'seenview', 'other'];
  const out = [];
  const push = (p) => { const g = groups[p]; if (g) { out.push(Object.assign({ prefix: p }, g)); delete groups[p]; } };
  order.forEach(push);
  Object.keys(groups).forEach(push);
  return json({
    ok: true, keys: totalKeys, bytes: totalBytes, unknownBytes: unknown, groups: out,
    writesToday: Math.min(writesToday, 5000), lastReset: today + 'T00:00:00.000Z', quotaSupported: true,
  }, { cors });
}

async function putKV(req, env, key, cors, label) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  let body = await req.text();
  if (new TextEncoder().encode(body).length > 24 * 1024 * 1024) return json({ ok: false, error: 'dữ liệu quá lớn (>24MB)' }, { status: 413, cors });
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { return json({ ok: false, error: 'JSON lỗi: ' + e.message }, { status: 400, cors }); }
  /* tối ưu registry: tự bóc các trường CŨ/trùng lặp mỗi lần ghi — KV tự lành
     sau lần lưu đầu tiên. `postId` là di sản Blogger/Firebase cũ (không nơi
     nào đọc nữa); `count`/`canRead` là bản sao của `countLabel` + số chương
     (mọi trang tự tính lại qua CZ.norm). */
  if (key === 'registry' && parsed && Array.isArray(parsed.lib)) {
    parsed.lib.forEach((n) => {
      if (n && typeof n === 'object') { delete n.postId; delete n.count; delete n.canRead; }
    });
  }
  /* CHẶN GHI ĐÈ MẤT DỮ LIỆU (23/09): admin cũ đọc registry bản public đã lọc
     rồi PUT lại → mỗi lần lưu là một lần xoá sách khỏi KV, rỗng dần tới
     {lib: []} khiến trang tác giả/couple báo “Chưa tải được dữ liệu”. Nay từ
     chối ghi bản rỗng đè lên kho đang có sách, trừ khi client gửi kèm
     force:true (chỉ luồng “xoá bộ” đã gõ slug xác nhận mới gửi). */
  if (key === 'registry' && parsed && Array.isArray(parsed.lib) && parsed.lib.length === 0 && parsed.force !== true) {
    let cur = null;
    try { cur = await env.CZ_KV.get('registry', { type: 'json' }); } catch (e) { cur = null; }
    if (cur && Array.isArray(cur.lib) && cur.lib.length) {
      return json({ ok: false, error: 'từ chối ghi registry rỗng đè lên ' + cur.lib.length + ' bộ đang có — hãy đọc lại registry đầy đủ (kèm ADMIN_KEY) rồi lưu lại, hoặc dùng Khôi phục backup' }, { status: 400, cors });
    }
  }
  if (parsed && typeof parsed === 'object') delete parsed.force;
  if (key === 'registry') body = registryJSON(parsed);
  const bytes = new TextEncoder().encode(body).length;
  const saved = new Date().toISOString();
  await env.CZ_KV.put(key, body, { metadata: { saved, rev: parsed.rev || '', bytes } });
  if (key === 'registry') sbPinReset(env);       // ghim Supabase (nếu đổi) có hiệu lực ngay
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
  if (!book) return null;
  /* đếm theo chương ĐANG HIỆN: chương hẹn giờ chưa tới mốc hoặc đang Ẩn không
     được tính vào “N chương” mà độc giả thấy (trước đây đếm hết nên web hiện
     31 chương trong khi chỉ đọc được 30). */
  if (Array.isArray(book.chapters)) return countVisibleChapters(book.chapters);
  if (typeof book.chapters === 'number') return book.chapters; /* stub overflow */
  return null;
}
/* Thông tin hàng đợi hẹn giờ của 1 bộ — ghi vào registry để tab Chương và
   danh sách bộ biết đang có chương chờ lên sóng mà KHÔNG phải tải full HTML. */
function scheduleMetaOf(book) {
  const chapters = book && Array.isArray(book.chapters) ? book.chapters : [];
  const next = nextScheduleMs(chapters);
  return {
    pending: countPendingChapters(chapters),
    schedNext: next ? new Date(next).toISOString() : '',
  };
}
function applyScheduleMeta(n, book) {
  const meta = scheduleMetaOf(book);
  if (meta.pending) {
    n.pending = meta.pending;
    if (meta.schedNext) n.schedNext = meta.schedNext; else delete n.schedNext;
  } else {
    delete n.pending;
    delete n.schedNext;
  }
  return meta;
}
/* Nhãn số chương: "<đã đăng>/<dự kiến>". Dự kiến lấy từ trường `planned` (nếu
   biên tập viên khai) — KHÔNG moi lại con số cũ trong nhãn, vì chính con số cũ
   đó là thứ làm web hiện "30 chương" sau khi đã xoá chương và sửa nhãn thành 29/29. */
function countLabelOf(n, real, pending) {
  real = Math.max(0, parseInt(real, 10) || 0);
  pending = Math.max(0, parseInt(pending, 10) || 0);
  const plannedRaw = parseInt((n && (n.planned || n.declared)) || 0, 10) || 0;
  /* chương đang hẹn giờ/đang Ẩn vẫn là chương SẼ đọc được: cộng vào phần “dự
     kiến” để thẻ truyện hiện “12/13 chương” (còn nữa) thay vì “12/12” như đã
     xong — độc giả khỏi tưởng bộ đã hoàn thành. */
  const planned = Math.max(real + pending, plannedRaw);
  if (real === 0 && planned === 0) return '0/—';
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
  const schedMeta = book ? scheduleMetaOf(book) : { pending: 0, schedNext: '' };
  const labelNow = countLabelOf(n, real, schedMeta.pending);
  const wasPending = Number(n.pending) || 0;
  const wasNext = String(n.schedNext || '');
  const changed = was !== real || labelWas !== labelNow || wasPending !== schedMeta.pending || wasNext !== String(schedMeta.schedNext || '');
  if (!changed) return { changed: false, was, now: real };
  n.chapters = real;
  n.countLabel = labelNow;   /* KHÔNG ghi lại `count`/`canRead`: web tự tính (CZ.norm),
                               registry chỉ giữ một nguồn sự thật cho nhãn */
  if (book) applyScheduleMeta(n, book);
  reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await env.CZ_KV.put('registry', registryJSON(reg), { metadata: { saved: new Date().toISOString(), rev: reg.rev } });
  return { changed: true, was, now: real, labelWas, labelNow, rev: reg.rev, pending: schedMeta.pending, schedNext: schedMeta.schedNext };
}
/* Chương có nội dung thật không? Chuỗi '<p></p>' hay '<p>&nbsp;</p>' KHÔNG phải
   nội dung — trước đây chỉ so chuỗi thô nên chương rỗng vẫn lọt vào bộ và làm
   lệch số chương. Ảnh (kể cả ảnh không chữ) vẫn tính là có nội dung. */
function chapterHasContent(c) {
  if (!c || typeof c !== 'object') return false;
  if (String(c.t || '').trim()) return true;
  const h = String(c.html || '');
  if (/<img\b/i.test(h)) return true;
  return h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-z#0-9]+;/gi, ' ').trim().length > 0;
}
/* PUT /api/book/<slug> — ghi 1 bộ RỒI tự sửa số chương trong registry */
async function putBook(req, env, slug, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  /* đọc bản cũ để biết có THÊM chương mới không (push chỉ báo chương mới, không báo sửa chữ) */
  const oldBook = await readBook(env, slug).catch(() => null);
  const oldLen = oldBook && Array.isArray(oldBook.chapters) ? oldBook.chapters.length : 0;
  const body = await req.text();
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > 24 * 1024 * 1024) return json({ ok: false, error: 'dữ liệu quá lớn (>24MB)' }, { status: 413, cors });
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) { return json({ ok: false, error: 'JSON lỗi: ' + e.message }, { status: 400, cors }); }
  if (!Array.isArray(parsed.chapters)) parsed.chapters = [];
  parsed.chapters.forEach((c) => { if (c) c.html = sanitizeChapterHtml(c.html); });
  /* bỏ chương rỗng cả tiêu đề lẫn nội dung — chính chúng là thủ phạm làm lệch số chương */
  const before = parsed.chapters.length;
  parsed.chapters = parsed.chapters.filter(chapterHasContent);
  const dropped = before - parsed.chapters.length;
  parsed.slug = slug;
  /* khóa mật mã do /api/lock/set quản lý — web KHÔNG gửi trường `lock` lên
     (không thấy được nó), nên giữ nguyên bản cũ để tránh lưu chương là tự mở khóa */
  if (oldBook && oldBook.lock && !parsed.lock) parsed.lock = oldBook.lock;
  /* ghi book + cập nhật registry SONG SONG: hai việc độc lập nhau, chạy nối
     tiếp chỉ làm phản hồi chậm thêm một vòng KV (~100–200ms). */
  const [stored, sync] = await Promise.all([
    persistBook(env, slug, parsed),
    syncCountToRegistry(env, slug, parsed),
  ]);
  const last = parsed.chapters[parsed.chapters.length - 1] || {};
  if (parsed.chapters.length > oldLen && !isChapterPending(last)) {
    last.notified = true;
    await enqueuePush(env, slug, parsed.chapters.length, last.t || '');
  }
  await logAct(env, 'lưu bộ ' + slug + ' (' + parsed.chapters.length + ' chương)', req);
  return json({ ok: true, key: 'book:' + slug, bytes: stored.bytes, saved: stored.saved, chapters: parsed.chapters.length, dropped, registry: sync, overflow: stored.overflow || '' }, { cors });
}

/* ============================================================================
   PUT /api/book/<slug>/chapter — ghi MỘT chương (nút “Lưu chương”)
   ----------------------------------------------------------------------------
   Bản cũ: sửa 1 chương = gửi lại cả bộ (mọi chương, có bộ vài MB) → phản hồi
   vài giây; mỗi lần lưu còn ghi lại cả registry. Đường này chỉ nhận 1 chương:
     { index, chapter }        → thay/thêm chương ở vị trí index (index = số
                                 chương hiện có nghĩa là thêm vào cuối)
     { index, remove: true }   → xoá chương
     { from, to }              → đổi thứ tự (kéo-thả / nút Lên-Xuống)
   Worker tự ghép vào bản cũ trên KV nên giữ nguyên các trường lạ của chương
   (notified, ghi chú…), tự đếm lại số chương ĐANG HIỆN + hàng đợi hẹn giờ.
   ========================================================================== */
async function putChapter(req, env, slug, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'JSON lỗi hoặc rỗng.' }, { status: 400, cors });
  const gotCh = await readBookChecked(env, slug).catch((e) => ({ status: 'unreadable', book: null, missing: missingOverflowVars(env), why: [String((e && e.message) || e)] }));
  if (!gotCh.book || typeof gotCh.book !== 'object') {
    /* 1.16.1: "có bộ mà không đọc được" ≠ "chưa có bộ". Lưu chương là ghi lại
       CẢ bộ — ghi trên vỏ rỗng sẽ xoá sạch chương, nên phải chặn kèm lý do. */
    if (gotCh.status === 'unreadable') return overflowFailResponse(cors, slug, gotCh);
    return json({ ok: false, error: 'Bộ chưa có trên KV — nạp dữ liệu bộ trước khi lưu chương.' }, { status: 404, cors });
  }
  const book = gotCh.book;
  book.chapters = Array.isArray(book.chapters) ? book.chapters : [];
  const oldLen = book.chapters.length;
  let action = '';
  let idx = -1;

  if (body.from !== undefined && body.to !== undefined) {
    /* đổi thứ tự: kéo-thả hoặc nút Lên/Xuống */
    const from = parseInt(body.from, 10), to = parseInt(body.to, 10);
    if (!(from >= 0 && from < oldLen) || !(to >= 0 && to < oldLen) || from === to) {
      return json({ ok: false, error: 'Vị trí đổi thứ tự không hợp lệ.' }, { status: 400, cors });
    }
    const [item] = book.chapters.splice(from, 1);
    book.chapters.splice(to, 0, item);
    idx = to;
    action = 'move';
  } else {
    const index = parseInt(body.index, 10);
    if (!(index >= 0) || index > oldLen) return json({ ok: false, error: 'Vị trí chương không hợp lệ.' }, { status: 400, cors });
    if (body.remove) {
      if (!book.chapters[index]) return json({ ok: false, error: 'Không thấy chương cần xoá.' }, { status: 404, cors });
      book.chapters.splice(index, 1);
      action = 'delete';
    } else {
      const incoming = body.chapter && typeof body.chapter === 'object' ? body.chapter : {};
      const prev = book.chapters[index] || {};
      const next = Object.assign({}, prev, {
        t: String(incoming.t == null ? prev.t || '' : incoming.t).slice(0, 300),
        html: sanitizeChapterHtml(incoming.html == null ? prev.html || '' : incoming.html),
        status: String(incoming.status || prev.status || 'published').toLowerCase(),
      });
      /* mốc hẹn giờ: nhận ISO (admin gửi lên) hoặc bản cũ 'YYYY-MM-DD HH:mm'
         — dùng atMs() cho CHUỖI, chapterAtMs() chỉ dành cho object chương */
      const at = atMs(incoming.at !== undefined ? incoming.at : prev.at);
      if (next.status === 'scheduled' && at) next.at = new Date(at).toISOString();
      else if (incoming.at === '' || incoming.at === null || next.status !== 'scheduled') delete next.at;
      if (!chapterHasContent(next)) {
        return json({ ok: false, error: 'Chương rỗng cả tiêu đề lẫn nội dung — không ghi để khỏi lệch số chương.' }, { status: 400, cors });
      }
      /* có nội dung/giờ mới → cho phép báo đẩy lần sau (chương hẹn giờ báo lúc lên sóng) */
      const contentChanged = String(prev.html || '') !== String(next.html || '') || String(prev.t || '') !== String(next.t || '');
      if (contentChanged) delete next.notified;
      book.chapters[index] = next;
      idx = index;
      action = oldLen === index ? 'append' : 'update';
    }
  }

  const stored = await persistBook(env, slug, book);
  const sync = await syncCountToRegistry(env, slug, book);
  /* push: chỉ báo khi có CHƯƠNG MỚI đã lên sóng ở cuối bộ; chương hẹn giờ để
     Cron báo đúng lúc tới giờ (publishDueChapters). */
  const last = book.chapters[book.chapters.length - 1];
  let push = null;
  if (action === 'append' && last && !isChapterPending(last) && !last.notified) {
    last.notified = true;
    push = await enqueuePush(env, slug, book.chapters.length, last.t || '');
    if (push && push.queued) await persistBook(env, slug, book);
  }
  await logAct(env, 'lưu chương ' + slug + ' #' + (idx + 1) + ' (' + action + ')', req);
  const pending = countPendingChapters(book.chapters);
  const nextMs = nextScheduleMs(book.chapters);
  return json({
    ok: true, slug, index: idx, action,
    chapters: book.chapters.length, live: chapLen(book), pending,
    schedNext: nextMs ? new Date(nextMs).toISOString() : '',
    schedLabel: nextMs ? scheduleLabelOf(book.chapters.find((c) => chapterAtMs(c) === nextMs) || {}) : '',
    bytes: stored.bytes, saved: stored.saved, overflow: stored.overflow || '',
    registry: sync, push: push && push.queued ? 'queued' : '',
  }, { cors });
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
    const schedMeta = book ? scheduleMetaOf(book) : { pending: 0, schedNext: '' };
    const labelNow = countLabelOf(n, real, schedMeta.pending);
    const wasPending = Number(n.pending) || 0, wasNext = String(n.schedNext || '');
    const pendingChanged = wasPending !== schedMeta.pending || wasNext !== String(schedMeta.schedNext || '');
    if (was !== real || labelWas !== labelNow || pendingChanged) {
      n.chapters = real; n.countLabel = labelNow;
      if (book) applyScheduleMeta(n, book);
      out.fixed.push({ slug, title: n.title || '', was, now: real, labelWas, labelNow, pending: schedMeta.pending });
    }
  }
  reg.lib.forEach((n) => {
    if (!n || !n.slug) return;
    if (keys.indexOf('book:' + n.slug) < 0) out.missing.push({ slug: n.slug, title: n.title || '', chapters: Number(n.chapters) || 0 });
  });
  if (out.fixed.length) reg.rev = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return out;
}
/* POST /api/admin/migrate-overflow — nút "chuyển data sang Supabase/R2" trong
   tab Kiểm tra dữ liệu. Chuyển book/ảnh CŨ khỏi KV theo lô nhỏ (mỗi lần gọi
   Worker chỉ nên làm vài chục subrequest); admin gọi lặp tới khi done:true. */
async function migrateOverflowRun(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const res = await migrateOverflow(env, body || {});
  if (!res.ok) return json(res, { status: 409, cors });
  const m = res.moved || { books: 0, covers: 0, images: 0 };
  if ((m.books | 0) || (m.covers | 0) || (m.images | 0)) {
    await logAct(env, 'chuyển overflow (' + (res.status && res.status.supabase ? 'supabase' : 'r2') + '): ' +
      (m.books | 0) + ' book, ' + (m.covers | 0) + ' bìa, ' + (m.images | 0) + ' ảnh' + (res.done ? ' · xong' : ''), req);
  }
  return json(res, { cors });
}

/* POST /api/admin/mirror-images — SAO LƯU ẢNH NGOÀI VỀ KHO (bản 1.17.0)
   body: { limit?, only?: 'covers'|'chapters', edge?, dryRun? }
   Vì sao: 63/63 bìa trong registry là link justwatch/amazon/twimg/blogger —
   host kia gỡ ảnh là mất bìa, repo không giữ byte nào để khôi phục. Endpoint
   này tải về (lấy bản nhỏ hơn từ chính CDN khi host có luật), ghi vào
   Supabase Storage/KV rồi viết lại link. Xem worker/overflow.js → mirrorImages. */
async function mirrorImagesRun(req, env, cors, org) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const res = await mirrorImages(env, body || {});
  if (!res.ok) return json(res, { status: 409, cors });
  /* bìa vừa đổi link → bản lưu registry ở biên phải bỏ, không thì thẻ truyện
     còn trỏ link cũ tới hết TTL */
  if (!res.dryRun && res.rewrites) await edgePurge(String(org || '') + '/api/registry');
  if (!res.dryRun && (res.mirrored || res.rewrites)) {
    await logAct(env, 'sao lưu ảnh ngoài: ' + res.mirrored + ' ảnh, ' + res.rewrites + ' link viết lại'
      + (res.failed.length ? ', ' + res.failed.length + ' lỗi' : '') + (res.done ? ' · xong' : ' · còn'), req);
  }
  return json(res, { cors });
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
async function postReportImage(req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  if (!await rateLimit(env, 'rl:report-image:' + hash(clientIp(req) || 'x'), 12, 3600)) {
    return json({ ok: false, error: 'Bạn đã tải lên hơi nhiều ảnh — thử lại sau ít phút nhé.' }, { status: 429, cors });
  }
  const body = await req.json().catch(() => ({}));
  const type = String(body.type || '');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    return json({ ok: false, error: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.' }, { status: 400, cors });
  }
  const data = String(body.data || '').replace(/^data:[^;,]+;base64,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]{16,}={0,2}$/.test(data)) {
    return json({ ok: false, error: 'Dữ liệu ảnh không hợp lệ.' }, { status: 400, cors });
  }
  /* 4 MB sau khi nén, đủ cho ảnh chụp màn hình nhưng không cho phép lạm dụng KV. */
  if (data.length > 5.5 * 1024 * 1024) {
    return json({ ok: false, error: 'Ảnh quá lớn — ảnh chụp sẽ được nén tự động, giới hạn 4 MB.' }, { status: 413, cors });
  }
  const id = (typeof crypto.randomUUID === 'function') ? crypto.randomUUID()
    : 'ri' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const stored = await persistImage(env, id, data, type, { report: true });
  return json({ ok: true, url: '/api/img/' + id, bytes: stored.bytes, overflow: stored.overflow || '' }, { cors });
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
    image: /^\/api\/img\/[a-z0-9-]{10,80}$/i.test(String(body.image || '')) ? String(body.image) : '',
    text,
    who: (user && user.email) || who || 'khách',
  };
  it.id = reportIdOf(it);
  const list = (await env.CZ_KV.get('report', { type: 'json' })) || [];
  list.unshift(it);
  if (list.length > 300) list.length = 300;
  await env.CZ_KV.put('report', JSON.stringify(list));
  await logAct(env, 'báo lỗi mới: ' + (it.title || it.slug || '?') + (it.ch ? ' · chương ' + it.ch : ''), req);
  const mail = await mailReport(env, it);
  return json({ ok: true, mailed: !!mail.sent, note: mail.reason || '', at: it.at }, { cors });
}

/* id ổn định của 1 báo lỗi (báo lỗi cũ trong KV không có id — tính tại chỗ theo
   nội dung để PATCH đánh dấu đã xử lý mà không phải migrate dữ liệu cũ) */
function reportIdOf(it) {
  return hash([it.at, it.slug, it.ch, it.text].join('|'));
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
    it.image ? 'Ảnh chụp: ' + new URL(it.image, String(env.SITE_BASE || 'https://ssochuz.pages.dev')).href : '',
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
        'Ảnh chụp': it.image || '(không có)',
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

/* GET /api/admin/reports — danh sách báo lỗi gần nhất để trang quản trị xem lại
   PATCH /api/admin/reports — đánh dấu đã xử lý / mở lại 1 báo lỗi {id, done} */
async function adminReports(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const items = ((await env.CZ_KV.get('report', { type: 'json' })) || []).map((x) => (
    Object.assign({}, x, { id: x.id || reportIdOf(x), done: !!x.done })
  ));
  const q = String(new URL(req.url).searchParams.get('q') || '').toLowerCase();
  const out = q ? items.filter((x) => (x.text + ' ' + x.title + ' ' + x.slug).toLowerCase().indexOf(q) >= 0) : items;
  const open = items.filter((x) => !x.done).length;
  const hasMail = (!!env.RESEND_API_KEY && !!env.MAIL_FROM) || !!env.MAIL_TO || !!(env.ADMIN_EMAILS && String(env.ADMIN_EMAILS).trim());
  /* Bản ≤ 1.10.0 thiếu `{ cors, … }` ở dòng dưới → trình duyệt chặn response
     (200 OK mà không có Access-Control-Allow-Origin), tab Báo lỗi chỉ báo
     "Failed to fetch" trong khi mọi tab khác vẫn chạy. ĐỪNG BỎ: endpoint admin
     nào cũng phải trả `cors`, và `no-store` vì danh sách này có email người đọc. */
  return json({ ok: true, items: out.slice(0, 300), count: out.length, open, mail: hasMail },
    { cors, headers: { 'cache-control': 'no-store' } });
}

async function patchReport(req, env, cors) {
  if (!authed(req, env)) return json({ ok: false, error: adminAuthError(env) }, { status: 401, cors });
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  const done = !!body.done;
  if (!id) return json({ ok: false, error: 'thiếu id báo lỗi' }, { status: 400, cors });
  const list = (await env.CZ_KV.get('report', { type: 'json' })) || [];
  const it = list.find((x) => reportIdOf(x) === id);
  if (!it) return json({ ok: false, error: 'không thấy báo lỗi cần đổi trạng thái' }, { status: 404, cors });
  it.done = done;
  it.doneAt = done ? new Date().toISOString() : '';
  await env.CZ_KV.put('report', JSON.stringify(list));
  await logAct(env, (done ? 'đã xử lý báo lỗi: ' : 'mở lại báo lỗi: ') + (it.title || it.slug || '?'), req);
  const open = list.filter((x) => !x.done).length;
  return json({ ok: true, id, done, open }, { cors, headers: { 'cache-control': 'no-store' } });
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
  /* Mốc ghi gần nhất nay nằm trong metadata của chính `registry` — bỏ hẳn khoá
     `_last` (mỗi thao tác lưu trước đây tốn thêm 1 lượt GHI chỉ để ghi mốc). */
  const regMeta = await env.CZ_KV.getWithMetadata('registry', { type: 'json' }).catch(() => ({ value: null, metadata: null }));
  const last = (regMeta && regMeta.metadata && regMeta.metadata.saved) || '';
  const reg = regMeta && regMeta.value;
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
    stats: {
      items: Object.keys(st.items).length, views, votes,
      /* theo dõi hạn mức: số lượt ghi khoá `stats` trong ngày + trần đang đặt */
      writesToday: Number(st.swd === dayStr() ? st.sw : 0) || 0,
      writeBudget: statsBudget(env), buffered: _buf.size,
    },
    overflow: await overflowStatusResolved(env),
    /* để trang quản trị biết kênh đăng nhập đã sẵn sàng chưa, thiếu biến nào.
       supabaseUrl = GHIM đang có hiệu lực (biến trên Worker hoặc URL quản trị
       lưu trong KV); supabaseKv = ghim đang lấy từ KV (không cần deploy lại). */
    auth: await (async () => {
      const pin = await supabasePin(env);
      return {
        supabase: !!pin, supabaseUrl: pin,
        supabaseEnv: !!supabaseURL(env), supabaseKv: !supabaseURL(env) && !!pin,
        supabaseHs256: !!(env.SUPABASE_JWT_SECRET), google: !!env.GOOGLE_CLIENT_ID,
        session: !!env.SESSION_SECRET, adminConfigured: adminEmails(env).length > 0,
        mail: (!!env.RESEND_API_KEY && !!env.MAIL_FROM) || !!env.MAIL_TO,
      };
    })(),
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
  if (d.registry) { await env.CZ_KV.put('registry', registryJSON(d.registry), { metadata: { saved: new Date().toISOString(), rev: d.registry.rev || '' } }); sbPinReset(env); }
  const books = d.books || {};
  for (const slug of Object.keys(books)) {
    try {
      /* giữ khóa mật mã đang có — nạp lại dữ liệu KHÔNG được tự mở khóa */
      const oldB = await env.CZ_KV.get('book:' + slug, { type: 'json' }).catch(() => null);
      if (oldB && oldB.lock && !books[slug].lock) books[slug].lock = oldB.lock;
      await env.CZ_KV.put('book:' + slug, JSON.stringify(books[slug])); out.books++;
    }
    catch (e) { out.failed.push(slug); }
  }
  /* nạp xong: đếm lại số chương để registry không treo con số cũ (bệnh "30 chương") */
  let counts = { fixed: [], missing: [], orphan: [], books: 0 };
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
/* ---------------------------------------------------------------------------
   NHỊP GHI KV — TIẾT KIỆM HẠN MỨC MIỄN PHÍ (bản 1.11.0)
   ---------------------------------------------------------------------------
   Gói miễn phí của Cloudflare chỉ cho ~1.000 lượt GHI mỗi ngày. Bản cũ ghi
   khoá `stats` mỗi 10 giây bất kể có ai xem hay không → riêng một khoá đã tốn
   8.640 lượt/ngày, vượt hạn mức, KV trả 429 và mọi thứ ghi được (số liệu,
   phiếu, lưu chương) bắt đầu lỗi.
   Nay số liệu gom trong RAM rồi chỉ ghi khi THẬT SỰ đáng ghi:
     · đệm đủ KV_FLUSH.events thay đổi → ghi ngay (web đông, không mất số);
     · hết giờ hẹn KV_FLUSH.timerMs    → ghi nếu có ≥3 thay đổi, hoặc nếu bản
       trong RAM đã giữ quá KV_FLUSH.holdMs, hoặc nếu còn “tem” hạn mức của
       ngày (xem budgetCredits — ngân sách chia đều theo thời gian trong ngày);
     · hết ngân sách thì nằm chờ trong RAM, vẫn hiện đủ trên /api/stats.
   Số lượt ghi đã dùng của ngày nằm ngay trong khoá `stats` (`sw`/`swd`) nên
   nhiều isolate vẫn nhìn chung một ngân sách. Ghi hỏng thì nhét lại vào đệm,
   không mất số. Người đọc không thấy chậm: /api/stats luôn cộng phần đang đệm
   trong RAM, còn bảng xếp hạng vốn đã lưu ở biên 60 giây.
   Đổi trần ghi bằng biến STATS_WRITE_BUDGET (mặc định 240 lượt/ngày).
   --------------------------------------------------------------------------- */
/* Các con số nhịp ghi nằm ở src/shared/kv-budget.js (Worker + bài kiểm thử dùng
   chung một nguồn): FLUSH_EVENTS, FLUSH_EVENTS_TIMER, FLUSH_TIMER_MS,
   FLUSH_HOLD_MAX, STATS_WRITE_BUDGET… */
const DAY_KEEP = 45;         /* giữ bao nhiêu ngày để xếp hạng ngày/tuần/tháng */
const VOTER_CAP = 20000;     /* tối đa bao nhiêu người bầu/bộ (chống phình khoá) */
let _buf = new Map();        /* slug -> { v: lượt đọc, o: phiếu } đang đệm */
let _bufAt = 0;              /* lúc ghi xong lần gần nhất */
let _bufOps = 0;             /* bao nhiêu thay đổi đang nằm trong đệm */
let _bufStart = 0;           /* lúc thay đổi ĐẦU TIÊN còn đang đệm */
let _chain = Promise.resolve();  /* hàng đợi đọc–sửa–ghi khoá `stats` */
let _swUsed = 0;             /* đã ghi khoá `stats` bao nhiêu lượt trong ngày */
let _swDay = '';
let _seen = new Set();       /* khử trùng lặp lượt đọc trong cùng isolate */
let _seenQ = [];
let _timer = null;           /* hẹn giờ ghi phần đang đệm, phòng khi không còn request nào nữa */

/* Tới giờ hẹn thì có nên ghi không? (web đông / giữ lâu / còn “tem” hạn mức) */
function shouldFlushOnTimer(env) {
  if (!_buf.size) return false;
  return flushOnTimer({
    ops: _bufOps,
    heldMs: Date.now() - (_bufStart || Date.now()),
    used: _swUsed,
    credits: budgetCredits(env),
  });
}
/** Mọi thao tác đọc–sửa–ghi khoá `stats` đi qua hàng đợi này: hai lượt ghi
   chồng nhau (ghi số liệu + ghi phiếu bầu) không còn xoá số của nhau.
   @template T
   @param {() => Promise<T>} fn
   @returns {Promise<T>} */
/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function statsLock(fn) {
  const run = _chain.then(fn, fn);
  _chain = run.then(() => {}, () => {});
  return run;
}
/* Không ai gọi tiếp thì vẫn ghi sau ít lâu (waitUntil giữ tiến trình sống ≤30s) */
function scheduleFlush(env, ctx) {
  if (_timer || !_buf.size || !ctx || !ctx.waitUntil) return;
  const forced = forcedFlushMs(env);
  const ms = forced || KV_FLUSH.timerMs;
  _timer = setTimeout(() => { _timer = null; }, ms + 500);
  ctx.waitUntil(new Promise((r) => setTimeout(r, ms))
    .then(() => ((forced || shouldFlushOnTimer(env)) ? flushStats(env) : 0))
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
  /* học số lượt ghi của ngày từ chính khoá `stats` (nhiều isolate chung ngân sách) */
  if (s.swd === dayStr() && Number(s.sw) > _swUsed) _swUsed = Number(s.sw) || 0;
  return s;
}
async function writeStats(env, st) {
  const day = dayStr();
  /* đếm lượt ghi của khoá `stats` theo ngày — dùng cho ngân sách ở trên */
  st.sw = (st.swd === day ? (Number(st.sw) || 0) : 0) + 1;
  st.swd = day;
  st.updatedAt = new Date().toISOString();
  _swUsed = st.sw; _swDay = day;
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
/* ghi phần đang đệm xuống KV; lỗi thì nhét lại vào đệm để khỏi mất số.
   KHÔNG ném lỗi ra ngoài: hết hạn mức KV (429) thì lượt đọc chỉ chậm lại,
   không được làm trang đọc báo lỗi. */
async function flushStats(env) {
  if (!env.CZ_KV || !_buf.size) return 0;
  const count = _buf.size;
  await statsLock(async () => {
    if (!_buf.size) return;
    const take = _buf, ops = _bufOps, startAt = _bufStart;
    _buf = new Map(); _bufOps = 0; _bufStart = 0; _bufAt = Date.now();
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
      _bufOps += ops;
      if (!_bufStart) _bufStart = startAt || Date.now();
    }
  });
  return count;
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
  /* N11: + trung bình sao / số lượt đánh giá (KV rateagg:<slug>) — hòa vào cùng
     đáp ứng /api/stats để web KHÔNG phải thêm request mới. */
  await insertRatings(env, items);
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
     làm lớp thứ hai: quá 1.800 lượt trong 6 giờ từ một IP thì thôi không đếm
     nữa — KHÔNG báo lỗi, người đọc bình thường (kể cả sau NAT) không thấy gì
     khác. Cửa sổ 6 giờ (thay vì 1 giờ) giữ nguyên tốc độ chặn nhưng mỗi IP chỉ
     tốn 1 lượt GHI KV cho cả buổi thay vì 1 lượt mỗi giờ. */
  if (!await rateLimit(env, 'rl:view-ip:' + hash(clientIp(req) || 'x'), 1800, 21600, 200)) {
    return json({ ok: true, counted: false }, { cors, headers: { 'cache-control': 'no-store' } });
  }
  const c = _buf.get(slug) || { v: 0, o: 0 };
  c.v += 1; _buf.set(slug, c);
  if (!_bufStart) _bufStart = Date.now();
  if (!_bufAt) _bufAt = Date.now();
  _bufOps++;
  /* web đông: đệm đủ 25 thay đổi là ghi ngay; thưa thì hẹn giờ (xem đầu mục
     SỐ LIỆU XẾP HẠNG — nhịp ghi tự giãn theo ngân sách trong ngày) */
  if (_bufOps >= KV_FLUSH.events) await flushStats(env);
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
  if (!await rateLimit(env, 'rl:vote-ip:' + hash(clientIp(req) || 'x'), 150, 3600, 30)) {
    return json({ ok: false, error: 'thao tác hơi nhanh, thử lại sau ít phút' }, { status: 429, cors });
  }
  /* đọc–sửa–ghi nằm trong hàng đợi chung (statsLock): lượt ghi số liệu và lượt
     ghi phiếu không còn đè lên nhau, và KHÔNG phải flushStats trước mỗi phiếu
     nữa (bản cũ tốn thêm 1 đọc + 1 ghi cho mỗi phiếu). Phần lượt đọc đang đệm
     trong RAM vẫn nguyên vẹn vì bầu và đọc khác trường — đợt ghi sau cộng vào. */
  const voted = await statsLock(async () => {
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
      existing.forEach((k) => {
        // Remove from the original voting day, not today's unrelated votes.
        const originalDay = String(it.voters[k].t || '').slice(0, 10);
        if (it.days[originalDay]) it.days[originalDay].o = Math.max(0, (Number(it.days[originalDay].o) || 0) - 1);
        delete it.voters[k];
      });
      it.got.votes = Math.max(0, it.got.votes - existing.length);
      if (ch > 0) {
        it.chap[ch] = Math.max(0, (Number(it.chap[ch]) || 0) - existing.length);
        if (!it.chap[ch]) delete it.chap[ch];
      }
      changed = true;
    }
    if (changed) { it.updatedAt = new Date().toISOString(); await writeStats(env, st); }
    return { it, changed };
  });
  const it = voted.it;
  const changed = voted.changed;
  const pub = publicStat(it, dayStr());
  return json({
    ok: true, slug, ch, changed, voted: want === 1,
    votes: ch > 0 ? (Number(it.chap[ch]) || 0) : pub.votes,   /* con số hiện ngay trên nút */
    total: pub.votes,                                            /* tổng phiếu của bộ (bảng xếp hạng) */
    votesDay: pub.votesDay, votesWeek: pub.votesWeek, votesMonth: pub.votesMonth,
    chapVotes: pub.chapVotes,
  }, { cors, headers: { 'cache-control': 'no-store' } });
}

/* ---- ĐÁNH GIÁ SAO (N11) -------------------------------------------------
   KHAY RIÊNG với bình chọn cũ: `rate:<slug>:<uid>` (điểm của từng người) +
   `rateagg:<slug>` (tổng khối lượng {sum, n} để tính trung bình). vote cũ và
   chapVotes KHÔNG đổi dáng. 1 người 1 điểm, gửi lại là SỬA điểm đó; rating 0
   = gỡ điểm. Khoá người dùng theo đăng nhập (`g:` băm uid) nếu có, nếu không
   mới về vid máy/IP (`a:…`) — tránh thay vid là bùng điểm. */
function ratingWho(ids) { return ids && ids[0] ? ids[0] : ''; }
/* ---- TỔNG ĐÁNH GIÁ GOM VỀ MỘT KHOÁ (bản 1.15.0) ---------------------------
   Bản cũ: mỗi bộ một khoá `rateagg:<slug>` → mỗi lần /api/stats trượt cache
   biên (mỗi 60 giây) là 1 lượt LIST + N lượt ĐỌC, mà LIST chỉ có 1.000
   lượt/ngày ở gói miễn phí — hết hạn mức chỉ vì bảng xếp hạng.
   Nay: một khoá `rateagg` = { v:1, m:1, a: { <slug>: { sum, n } } }
     · `m:1` = đã gộp các khoá `rateagg:<slug>` cũ (chạy đúng một lần);
     · bản trong RAM dùng lại trong 60 giây → /api/stats thường KHÔNG chạm KV;
     · lúc chấm điểm mới ghi (ghi cả kho = 1 lượt ghi, thay vì 1 đọc + 1 ghi).
   Khoá `rate:<slug>:<who>` (điểm của riêng từng người) giữ nguyên như cũ. */
const RATEAGG_KEY = 'rateagg';
const RATEAGG_TTL = 60000;
let _rateAgg = null;          /* { at, data } — bản trong RAM của khoá `rateagg` */
let _rateaggAt = 0;           /* lúc ghi khoá này (KV: tối đa 1 ghi/giây/khoá) */
function rateAggData(blob) { return (blob && blob.a && typeof blob.a === 'object') ? blob.a : {}; }
/* gom các khoá `rateagg:<slug>` của bản cũ về 1 khoá; trả null khi đọc lỗi
   (để KHÔNG ghi bản rỗng đè mất điểm đang có) */
async function legacyRateAgg(env) {
  const out = {};
  let cursor;
  try {
    do {
      const l = await env.CZ_KV.list({ prefix: 'rateagg:', limit: 1000, cursor });
      for (const k of l.keys) {
        const r = await env.CZ_KV.get(k.name, { type: 'json' }).catch(() => null);
        const n = Math.max(0, Math.round((r && r.n) || 0));
        const sum = Math.max(0, Math.round((r && r.sum) || 0));
        if (n > 0) out[k.name.slice('rateagg:'.length)] = { sum, n };
      }
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);
  } catch (e) { return null; }
  return out;
}
async function rateAggOf(env, force) {
  const now = Date.now();
  if (!force && _rateAgg && now - _rateAgg.at < RATEAGG_TTL) return _rateAgg.data;
  let blob = null;
  try { blob = await env.CZ_KV.get(RATEAGG_KEY, { type: 'json' }); } catch (e) { blob = null; }
  if (!blob || !blob.v || !blob.m) {
    const legacy = await legacyRateAgg(env);
    if (legacy) {
      blob = { v: 1, m: 1, a: Object.assign({}, legacy, rateAggData(blob)) };
      try { await env.CZ_KV.put(RATEAGG_KEY, JSON.stringify(blob)); _rateaggAt = Date.now(); } catch (e) {}
    } else {
      blob = { v: 1, m: 0, a: rateAggData(blob) };
    }
  }
  _rateAgg = { at: now, data: rateAggData(blob) };
  return _rateAgg.data;
}
async function saveRateAgg(env, data) {
  const wait = _rateaggAt + 1100 - Date.now();     /* KV tối đa 1 ghi/giây/khoá */
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _rateaggAt = Date.now();
  const blob = { v: 1, m: 1, a: data };
  await env.CZ_KV.put(RATEAGG_KEY, JSON.stringify(blob));
  _rateAgg = { at: Date.now(), data };
}
/* + trung bình/số lượt vào danh sách items của /api/stats — bản trong RAM dùng
   lại 60 giây nên đa số lần gọi KHÔNG tốn lượt đọc/list nào. */
async function insertRatings(env, items) {
  if (!env.CZ_KV) return;
  try {
    const a = await rateAggOf(env, false);
    Object.keys(a).forEach((slug) => {
      const box = a[slug] || {};
      const n = Math.max(0, Math.round(box.n) || 0);
      const sum = Math.max(0, Math.round(box.sum) || 0);
      if (n <= 0) return;
      const it = items[slug] || (items[slug] = { views: 0, votes: 0 });
      it.rating = Math.round((sum / n) * 10) / 10;
      it.ratingCount = n;
    });
  } catch (e) { /* lỗi đọc KV không được chặn /api/stats — bỏ phần sao đi */ }
}
let ratingWrites = new Map();   /* chặn 2 lần ghi cùng key trong <1s (KV tối đa 1 ghi/giây/key) */
function ratingLastKey(k) { return ratingWrites.get(k) || 0; }
function ratingSetLast(k, t) {
  ratingWrites.set(k, t);
  if (ratingWrites.size > 400) ratingWrites = new Map();
}
async function myRating(req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  if (!slug) return json({ error: 'Thiếu truyện.' }, { status: 400, cors });
  const auth = await userFromReq(req, env);
  if (req.headers.has('authorization') && !auth.user) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, { status: 401, cors });
  const who = auth.user ? 'g:' + hash(auth.user.uid) : viewerOf(req, body);
  if (!who) return json({ error: 'Thiếu danh tính.' }, { status: 400, cors });
  const r = await env.CZ_KV.get('rate:' + slug + ':' + who, { type: 'json' });
  return json({ ok: true, rating: (r && r.s) || 0 }, { cors, headers: { 'cache-control': 'private, no-store' } });
}
async function postRate(req, env, cors) {
  if (!env.CZ_KV) return noKV(cors);
  const body = await req.json().catch(() => ({}));
  const slug = cleanSlug(body.slug);
  if (!slug) return json({ ok: false, error: 'thiếu slug hợp lệ' }, { status: 400, cors });
  const u = (await userFromReq(req, env)).user;
  if (req.headers.has('authorization') && !u) return json({ error: 'Phiên đăng nhập không hợp lệ.' }, { status: 401, cors });
  const ids = [];
  if (u) ids.push('g:' + hash(u.uid));
  const anon = viewerOf(req, body);
  if (anon && ids.indexOf(anon) < 0) ids.push(anon);
  if (!ids.length) return json({ ok: false, error: 'thiếu vid (mã máy) để chống đánh giá nhiều lần' }, { status: 400, cors });
  const raw = body.rating;
  const wantF = (raw === 0 || raw === '0') ? 0 : Number(raw);
  if (!(raw !== null && raw !== undefined && raw !== '' && Number.isFinite(wantF) && Number.isInteger(wantF) && wantF >= 0 && wantF <= 5)) {
    return json({ ok: false, error: 'rating phải là số nguyên 1..5 (0 = gỡ điểm)' }, { status: 400, cors });
  }
  const want = wantF;
  const who = ratingWho(ids);
  if (!await rateLimit(env, 'rl:rate:' + who, 60, 3600)) {
    return json({ ok: false, error: 'thao tác hơi nhanh, thử lại sau ít phút' }, { status: 429, cors });
  }
  const KEY = 'rate:' + slug + ':' + who;
  const hold = ratingLastKey(KEY);
  const wait = hold + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  let prev = null; let mine = { sum: 0, n: 0 }; let error = null;
  try {
    prev = await env.CZ_KV.get(KEY, { type: 'json' }) || { s: 0, t: '' };
    for (let attempt = 0; attempt < 2; attempt++) {
      ratingSetLast(KEY, Date.now());
      try {
        const all = await rateAggOf(env, true);        /* tổng của MỌI bộ: 1 khoá duy nhất */
        const agg = all[slug] || (all[slug] = { sum: 0, n: 0 });
        const prevStar = Math.max(1, Math.min(5, parseInt(prev.s, 10) || 5));
        if (prev.s) { agg.sum = Math.max(0, (agg.sum || 0) - prevStar); agg.n = Math.max(0, (agg.n || 0) - 1); }
        if (want > 0) { agg.sum = (agg.sum || 0) + want; agg.n = (agg.n || 0) + 1; }
        mine = { sum: Math.max(0, agg.sum || 0), n: Math.max(0, agg.n || 0) };
        if (mine.n <= 0) delete all[slug];
        await saveRateAgg(env, all);
        if (want > 0) await env.CZ_KV.put(KEY, JSON.stringify({ s: want, t: new Date().toISOString() }));
        else await env.CZ_KV.delete(KEY);
        prev = { s: want, t: new Date().toISOString() };
        error = null;
        break;                                     /* ghi xong là ra, không thử lại */
      } catch (e) { error = String((e && e.message) || e); }
    }
    if (error != null) return json({ ok: false, error: 'ghi KV lỗi, thử lại: ' + error }, { status: 502, cors });
  } catch (e) {
    return json({ ok: false, error: 'đọc KV lỗi: ' + String((e && e.message) || e) }, { status: 502, cors });
  }
  const n = mine.n;
  const avg = n > 0 ? Math.round(mine.sum / n * 10) / 10 : 0;
  return json({ ok: true, slug, rating: want, ratingCount: n, ratingAvg: avg, source: 'kv' },
    { cors, headers: { 'cache-control': 'no-store' } });
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

/* ============================================================================
   CHỐNG SPAM KHÔNG ĐỐT HẠN MỨC KV (bản 1.15.0)
   ----------------------------------------------------------------------------
   Bản cũ: mỗi lượt xem/bình chọn/bình luận = 1 lượt ĐỌC + 1 lượt GHI khoá
   `rl:*`. Một người đọc lướt web 100 lượt là 200 lượt KV, còn gói miễn phí chỉ
   cho 1.000 lượt ghi/ngày cho TOÀN BỘ hệ thống → đọc báo buổi tối là hết.
   Nay bộ đếm nằm trong RAM của isolate (khoá, số đếm, hạn dùng):
     · lượt đầu của mỗi cửa sổ: đọc KV 1 lần rồi ghi 1 lần (mốc để máy khác
       và lần khởi động sau vẫn biết đã có người dùng);
     · các lượt sau trong cùng cửa sổ: chỉ cộng trong RAM, KHÔNG chạm KV;
     · chạm trần: ghi 1 lần cho các isolate khác biết là đã chặn, rồi từ chối
       luôn mà không đọc/ghi thêm (kẻ spam càng nhiều càng ít tốn).
   Đổi lại: hạn mức chính xác theo từng isolate thay vì toàn cầu — với quy mô
   web này là đánh đổi đúng (KV vốn đã "eventual" 60 giây). Muốn siết tuyệt đối
   thì phải dùng Durable Object.
   Tham số thứ 5 `persistAt`: khoá theo IP (lượng người qua lại rất lớn) đặt mốc
   ghi cao (200 lượt) nên người đọc bình thường tốn 0 lượt ghi, chỉ IP có dấu
   hiệu bất thường mới bắt đầu ghi xuống KV.
   KV lỗi (hết hạn mức trả 429) → cho qua, KHÔNG chặn người đọc bình thường.
   ========================================================================== */
let _rl = new Map();         /* key -> { n, exp } — bộ đếm trong RAM của isolate */
async function putRL(env, key, n, ttl) {
  try { await env.CZ_KV.put(key, String(n), { expirationTtl: ttl }); } catch (e) {}
}
/* persistAt = chỉ ghi KV từ lượt thứ mấy của cửa sổ (mặc định 1 = ghi ngay lượt
   đầu). Với khoá đông người qua lại (theo IP) đặt 200: người đọc bình thường
   KHÔNG tốn lượt ghi nào, chỉ những IP có dấu hiệu bất thường mới bắt đầu ghi —
   mà lúc đó ghi là đúng việc cần làm. */
async function rateLimit(env, key, limit, ttlSec, persistAt) {
  if (!env.CZ_KV) return true;
  const now = Date.now();
  const ttl = Math.max(60, parseInt(ttlSec, 10) || 60);   /* KV: expirationTtl ≥ 60 */
  const at = Math.max(1, parseInt(persistAt, 10) || 1);
  if (_rl.size > 4000) _rl = new Map();                   /* isolate sống lâu: dọn bộ đếm */
  const mem = _rl.get(key);
  if (mem && mem.exp > now) {
    if (mem.n >= limit) return false;
    mem.n += 1;
    /* chạm mốc cần ghi hoặc chạm trần → 1 lượt ghi để máy khác cũng biết */
    if (mem.n >= limit || mem.n === at) await putRL(env, key, mem.n, ttl);
    return true;
  }
  let cur = 0;
  try { cur = parseInt((await env.CZ_KV.get(key)) || '0', 10) || 0; } catch (e) { return true; }
  if (cur >= limit) {
    _rl.set(key, { n: limit, exp: now + ttl * 1000 });    /* nhớ luôn: khỏi đọc lại KV */
    return false;
  }
  const n = cur + 1;
  _rl.set(key, { n, exp: now + ttl * 1000 });
  /* lượt đầu cửa sổ (hoặc mốc đã hẹn, hoặc chạm trần) — KHÔNG ghi mỗi request */
  if (n >= limit || n === at) await putRL(env, key, n, ttl);
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
const _sbKeys = new Map();          /* '<base>|kid|alg' -> CryptoKey (JWKS của Supabase) */
/* --- GHIM PROJECT SUPABASE (bản 1.9.8) -------------------------------------
   Vì sao cần: project đang dùng khoá public mới `sb_publishable_…` và Supabase
   ký access_token bằng cặp khoá BẤT ĐỐI XỨNG (ES256 — xem
   /auth/v1/.well-known/jwks.json của project). HS256 với "JWT secret" cũ thì
   KHÔNG còn đủ: token mới mang header alg=ES256, verify bằng secret cũ luôn
   thất bại ⇒ đăng nhập xong vẫn bị mọi API trả 401 (đúng bệnh "My Space lỗi
   nghiêm trọng / đánh giá sao không lưu được" của chủ trang).
   Worker phải biết ĐÚNG project để (a) lấy JWKS kiểm chữ ký, (b) chặn token do
   project KHÁC cấp — không ghim thì kẻ xấu tự tạo project riêng, tự ký token
   mang email quản trị là vào được trang quản trị.
   Ghim lấy theo thứ tự: biến SUPABASE_URL trên Worker → URL quản trị lưu trong
   KV (registry.settings.auth.supabaseUrl, dán ở /admin → Cài đặt & đồng bộ →
   Đăng nhập rồi Lưu). Nhờ đường KV mà sửa ghim KHÔNG cần deploy lại Worker. */
async function supabasePin(env) {
  const envUrl = supabaseURL(env);
  if (envUrl) return envUrl;
  /* từ 1.16.1 logic ghim nằm trong overflow.js để PHẦN ĐỌC TRUYỆN dùng chung
     một ghim (đường cứu hộ khi wrangler deploy xoá mất biến SUPABASE_URL) */
  return sbPinUrl(env);
}
/* quản trị vừa Lưu registry (đổi ghim?) → bỏ cache để hiệu lực ngay */
function sbPinReset(env) { sbPinResetCache(env); }
async function supabaseJWKS(env, base) {
  if (!base) throw new Error('Worker chưa ghim project Supabase — đặt biến SUPABASE_URL trên Worker, hoặc /admin → Cài đặt & đồng bộ → Đăng nhập rồi Lưu');
  const r = await fetch(base + '/auth/v1/.well-known/jwks.json', { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) throw new Error('không đọc được JWKS của Supabase (' + r.status + ')');
  const jwks = await r.json();
  return (jwks && jwks.keys) || [];
}
async function supabasePubKey(env, kid, alg, base) {
  const ck = base + '|' + kid + '|' + alg;
  if (_sbKeys.has(ck)) return _sbKeys.get(ck);
  const keys = await supabaseJWKS(env, base);
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
  /* ghim project TRƯỚC khi chọn đường verify — cả ES256/RS256 (JWKS) lẫn
     kiểm tra issuer đều phải trỏ đúng project đã ghim */
  const base = await supabasePin(env);
  let ok = false;
  if (alg === 'HS256') {
    const sec = env.SUPABASE_JWT_SECRET || env.SUPABASE_SECRET || '';
    if (!sec) throw new Error('token Supabase ký HS256 mà Worker chưa đặt SUPABASE_JWT_SECRET');
    ok = await crypto.subtle.verify('HMAC', await hmacKey(sec), sig, data);
  } else if (alg === 'RS256' || alg === 'ES256') {
    if (!base) throw new Error('token Supabase ký ' + alg + ' (khoá bất đối xứng — project dùng khoá public mới) mà Worker chưa ghim project: đặt biến SUPABASE_URL trên Worker (https://<ref>.supabase.co) hoặc /admin → Cài đặt & đồng bộ → Đăng nhập rồi Lưu');
    const { key, algo, alg: a } = await supabasePubKey(env, header.kid, alg, base);
    ok = a === 'ES256'
      ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data)
      : await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
  } else throw new Error('thuật toán token không hỗ trợ: ' + alg);
  if (!ok) throw new Error('chữ ký token Supabase không hợp lệ');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('phiên đăng nhập đã hết hạn — đăng nhập lại');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => a === 'authenticated' || a === 'anon')) throw new Error('token sai audience: ' + aud.join(','));
  if (base && payload.iss && String(payload.iss).indexOf(base) !== 0 && String(payload.iss).indexOf(base.replace(/^https?:\/\//, '')) < 0) {
    throw new Error('token sai issuer — token do "' + payload.iss + '" cấp nhưng Worker đang ghim project "' + base + '" (đặt SUPABASE_URL trên Worker đúng project Supabase của web, hoặc sửa lại Project URL ở /admin)');
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
  if (supabaseURL(env) || env.SUPABASE_JWT_SECRET || (await supabasePin(env))) {
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
  const pinned = await supabasePin(env);
  if (!pinned && !env.SUPABASE_JWT_SECRET) {
    return json({
      ok: false,
      error: 'Worker chưa ghim project Supabase — đặt biến SUPABASE_URL (vd https://abcdef.supabase.co) trên Worker, hoặc /admin → Cài đặt & đồng bộ → Đăng nhập rồi Lưu (không cần deploy lại)',
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
  const pin = await supabasePin(env);
  return json({
    ok: true,
    supabase: !!pin,
    supabaseUrl: pin,
    supabaseEnv: !!supabaseURL(env),
    supabaseKv: !supabaseURL(env) && !!pin,
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
/* Khoá cache của danh sách bình luận: giữ `ch` (lọc theo chương) + `limit`
   (số lượng) vì chúng đổi nội dung trả về; bỏ tham số rác; còn tham số lạ thì
   KHÔNG cache (trả '') để không trả nhầm bản của người khác. */
function commentsKeyOf(req) {
  try {
    const u = new URL(req.url);
    const ch = u.searchParams.get('ch');
    const limit = u.searchParams.get('limit');
    let other = 0;
    u.searchParams.forEach((v, k) => {
      if (k === 'ch' || k === 'limit') return;
      if (!isJunkParam(k)) other++;
    });
    if (other) return '';
    const hasCh = ch != null && ch !== '';
    let key = u.origin + u.pathname;
    if (hasCh) key += '?ch=' + encodeURIComponent(ch);
    if (limit) key += (hasCh ? '&' : '?') + 'limit=' + encodeURIComponent(limit);
    return key;
  } catch (e) { return ''; }
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
  const comments = await Promise.all(pool.slice(0, limit).map(async c => ({ ...publicComment(c), profileId: !c.guest && c.uid ? await profileId(c.uid) : '' })));
  const byChap = {};
  arr.forEach((c) => { const k = String(Number(c.ch) || 0); byChap[k] = (byChap[k] || 0) + 1; });
  /* max-age=0 để trình duyệt luôn hỏi lại (trúng bản lưu 15 giây ở biên) —
     người vừa đăng bình luận không bị dính bản cũ trong tab của mình. */
  return json({ ok: true, comments, count: arr.length, shown: comments.length, slug, ch: ch, byChapter: byChap },
    { cors, headers: { 'cache-control': 'public, max-age=0, s-maxage=' + EDGE_TTL.comments } });
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
  let name = u
    ? (String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || u.name || 'Bạn đọc')
    : (String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Bạn đọc');
  /* Ảnh đại diện: chỉ nhận http/https (bỏ data:, javascript:…), tối đa 300 ký tự */
  var rawPic = String(body.picture || '').trim().slice(0, 2000);
  if (!/^https?:\/\//i.test(rawPic)) rawPic = '';
  var sessPic = String((u && u.picture) || '').trim();
  if (!/^https?:\/\//i.test(sessPic)) sessPic = '';
  let picture = u ? (rawPic || sessPic || '') : '';
  if (u && env.MEMBER_SPACES) {
    const id = await profileId(u.uid);
    const response = await env.MEMBER_SPACES.get(env.MEMBER_SPACES.idFromName(id)).fetch(new Request('https://members.internal/public'));
    if (response.ok) { const member = await response.json(); name = member.profile.name; picture = member.profile.avatar; }
  }
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
  return json({ ok: true, comment: { ...publicComment(c), profileId: u ? await profileId(u.uid) : '' }, count: arr.length, guest: !u, reply: !!parent }, { cors });
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
