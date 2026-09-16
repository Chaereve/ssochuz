/* t_auth_flow.js · Luồng đăng nhập Supabase sau bản vá 1.9.8 (jsdom).
   ------------------------------------------------------------------------------
   Bệnh thật của chủ trang (16/09): project Supabase dùng khoá public `sb_publishable_…`
   nên access_token ký ES256; Worker bản cũ (chỉ có SUPABASE_JWT_SECRET) không verify
   được → người đọc đăng nhập Google xong vẫn bị MỌI API trả 401: My Space báo lỗi,
   đánh giá sao/bình luận không lưu. Bài này khoá các hành vi đã vá:

     A. Link qua email (?token_hash=…&type=magiclink) phải gọi verifyOtp rồi DỌN URL
        (trước đây bỏ sót: F5 là chạy lại verifyOtp và báo "link hết hiệu lực").
     B. Worker từ chối đổi token (401/500) → vẫn giữ phiên dự phòng bằng token thô
        (người dùng không bị văng ra), lý do được ghi vào CZ_AUTH._verify để
        My Space/admin giải thích đúng bệnh thay vì báo chung chung.
     C. My Space gặp 401 từ /api/me/space → hiện nút "Thử lại" VÀ nút
        "Đăng xuất & đăng nhập lại" ngay tại chỗ, kèm lý do thật từ Worker.

   Chạy:  node tests/t_auth_flow.js   (cần jsdom: cd tests && npm i)
*/
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const mk = require('./mk.js');

const SB_ERROR = 'Worker chưa ghim project Supabase — đặt biến SUPABASE_URL trên Worker, hoặc /admin → Cài đặt & đồng bộ → Đăng nhập rồi Lưu';
const ME_ERROR = 'Chưa mở được không gian của bạn — token Supabase ký ES256 mà Worker chưa ghim project. Vui lòng bấm “Đăng xuất & đăng nhập lại” rồi thử lại.';

function fakeSDK(win, state) {
  win.supabase = {
    createClient(url, key, opts) {
      state.clientOpts = opts;
      return { auth: {
        async verifyOtp(p) { state.verifyOtp = p; return { data: { user: { id: 'u9', email: 'a@b.c' } }, error: null }; },
        async getSession() { return { data: { session: state.session || null } }; },
        async signOut() { state.signedOut = true; return { error: null }; },
      } };
    },
  };
}
function sbSession() {
  return {
    access_token: 'tok', user: { id: 'u9', email: 'a@b.c', user_metadata: { full_name: 'Bạn Thử' } },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}
const pass = [];
function ok(name, cond, extra) { if (!cond) { console.error('LỖI:', name, extra || ''); process.exit(1); } pass.push(name); }

(async () => {
  /* ---------- A. magic link: verifyOtp + dọn URL ---------- */
  {
    const state = {};
    const { win, errors } = await mk.page('/index.html', {
      url: 'https://ssochuz.pages.dev/?token_hash=abc123&type=magiclink',
      fetch: () => Promise.resolve(new Response(JSON.stringify({ ok: false, error: SB_ERROR }), { status: 500 })),
      config: { CZ_API: 'https://api.test' },
      files: ['cz-config.js', 'cz-app.js', 'cz-auth.js'],
      setup(w) { fakeSDK(w, state); state.session = sbSession(); },
    });
    await new Promise((r) => setTimeout(r, 250));
    ok('A/verifyOtp nhận token_hash + type', state.verifyOtp && state.verifyOtp.tokenHash === 'abc123' && state.verifyOtp.type === 'magiclink', JSON.stringify(state.verifyOtp));
    const q = new URL(win.location.href).searchParams;
    ok('A/URL sạch sau khi đổi link', !q.has('token_hash') && !q.has('type'), win.location.href);
    ok('A/không lỗi JS', errors.length === 0, errors.join(' | '));
  }

  /* ---------- B. Worker từ chối đổi token: giữ phiên dự phòng + ghi lý do ---------- */
  {
    const state = {};
    const { win, errors } = await mk.page('/my-space.html', {
      url: 'https://ssochuz.pages.dev/my-space',
      fetch: (url) => (String(url).includes('/api/auth/supabase')
        ? Promise.resolve(new Response(JSON.stringify({ ok: false, error: SB_ERROR }), { status: 500 }))
        : Promise.resolve(new Response('{}'))),
      config: { CZ_API: 'https://api.test' },
      files: ['cz-config.js', 'cz-app.js', 'cz-auth.js', 'cz-space.js'],
      setup(w) { fakeSDK(w, state); state.session = sbSession(); },
    });
    await new Promise((r) => setTimeout(r, 250));
    const cur = win.CZ_AUTH.current();
    ok('B/vẫn coi là đã đăng nhập (token thô dự phòng)', cur && cur.uid === 'u9', JSON.stringify(cur));
    ok('B/lý do được ghi vào _verify', win.CZ_AUTH._verify && /ghim project Supabase/.test(win.CZ_AUTH._verify.error || ''), JSON.stringify(win.CZ_AUTH._verify));
    ok('B/không lỗi JS', errors.length === 0, errors.join(' | '));
  }

  /* ---------- C. My Space 401: nút Thử lại + Đăng xuất & đăng nhập lại ---------- */
  {
    const { doc, errors } = await mk.page('/my-space.html', {
      url: 'https://ssochuz.pages.dev/my-space',
      fetch: (url) => {
        if (String(url).includes('/api/me/space')) return Promise.resolve(new Response(JSON.stringify({ error: ME_ERROR }), { status: 401 }));
        if (String(url).includes('/api/registry')) return Promise.resolve(new Response(JSON.stringify({ rev: 'x', lib: [] })));
        if (String(url).includes('/api/stats')) return Promise.resolve(new Response(JSON.stringify({ items: {} })));
        return Promise.resolve(new Response('{}'));
      },
      config: { CZ_API: 'https://api.test' },
      files: ['cz-config.js', 'cz-app.js', 'cz-auth.js', 'cz-space.js'],
      setup(w) {
        w.localStorage.setItem('ssochuz-user', JSON.stringify({ uid: 'u1', name: 'Thử', email: 't@e.st', exp: Math.floor(Date.now() / 1000) + 9999 }));
        w.localStorage.setItem('ssochuz-auth-token', 'raw-token');
      },
    });
    await new Promise((r) => setTimeout(r, 300));
    const btns = [...doc.querySelectorAll('#spaceStatus button')].map((b) => b.textContent);
    ok('C/nút Thử lại', btns.some((t) => /Thử lại/.test(t)), btns.join(' | '));
    ok('C/nút Đăng xuất & đăng nhập lại', btns.some((t) => /Đăng xuất & đăng nhập lại/.test(t)), btns.join(' | '));
    ok('C/status nêu đúng lý do từ Worker', /ghim project|ES256/.test(doc.querySelector('#spaceStatus').textContent), doc.querySelector('#spaceStatus').textContent.slice(0, 120));
    ok('C/không lỗi JS', errors.length === 0, errors.join(' | '));
  }

  console.log(JSON.stringify({ dat: pass.length, errors0: [] }, null, 2));
})().catch((e) => { console.error('FAIL:', e && (e.stack || e.message)); process.exit(1); });
