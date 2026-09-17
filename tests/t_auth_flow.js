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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SB_ERROR = 'Worker chưa ghim project Supabase — đặt biến SUPABASE_URL trên Worker, hoặc /admin → Cài đặt & đồng bộ → Đăng nhập rồi Lưu';
const ME_ERROR = 'Chưa mở được không gian của bạn — token Supabase ký ES256 mà Worker chưa ghim project. Vui lòng bấm “Đăng xuất & đăng nhập lại” rồi thử lại.';

function fakeSDK(win, state) {
  win.supabase = {
    createClient(url, key, opts) {
      state.clientOpts = opts;
      return { auth: {
        async verifyOtp(p) { state.verifyOtp = p; return { data: { user: { id: 'u9', email: 'a@b.c' } }, error: null }; },
        async getSession() { return { data: { session: state.session || null } }; },
        onAuthStateChange(cb) { state.cb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
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


  /* ---------- D. Quay về từ Google: phiên về MUỘN qua onAuthStateChange ----------
     Bệnh thật (17/09): supabase-js còn đang đổi `?code=…`, trang đọc session được
     null rồi kết luận ngay "khách" — đăng nhập Google xong vẫn thấy lời mời đăng
     nhập, tên/ảnh không hiện, phải F5 mới đúng. */
  {
    const state = {};
    const { doc, win, errors } = await mk.page('/my-space.html', {
      url: 'https://ssochuz.pages.dev/my-space?code=abc123',
      fetch: (url) => {
        const u = String(url);
        if (u.includes('/api/auth/supabase')) return Promise.resolve(new Response(JSON.stringify({ ok: true, token: 'worker-tok', user: { uid: 'u9', name: 'Bạn Thử', email: 'a@b.c', picture: 'https://lh3.googleusercontent.com/a/photo' }, admin: false })));
        if (u.includes('/api/me/space')) return Promise.resolve(new Response(JSON.stringify({ id: 'a'.repeat(64), version: 0, profile: { name: 'Bạn đọc', bio: '', avatar: '' }, shelves: [] })));
        if (u.includes('/api/registry')) return Promise.resolve(new Response(JSON.stringify({ rev: 'x', lib: [] })));
        return Promise.resolve(new Response('{}'));
      },
      config: { CZ_API: 'https://api.test' },
      files: ['cz-config.js', 'cz-app.js', 'cz-auth.js', 'cz-space.js'],
      setup(w) { fakeSDK(w, state); state.session = null; },
    });
    await wait(250);
    ok('D/chưa chốt được phiên thì KHÔNG mời đăng nhập', doc.querySelector('#spaceGuest').hidden === true, doc.querySelector('#spaceGuest').hidden);
    ok('D/trạng thái phiên là "checking"', win.CZ_AUTH.state() === 'checking', win.CZ_AUTH.state());
    state.session = sbSession();                       /* supabase-js đổi code xong */
    if (state.cb) state.cb('SIGNED_IN', state.session);
    await wait(400);
    ok('D/phiên chốt là "in"', win.CZ_AUTH.state() === 'in', win.CZ_AUTH.state());
    ok('D/lời mời đăng nhập biến mất', doc.querySelector('#spaceGuest').hidden === true);
    ok('D/hero hiện tên tài khoản Google', /Bạn Thử/.test(doc.querySelector('#spaceHero').textContent), doc.querySelector('#spaceHero').textContent.slice(0, 60));
    ok('D/không lỗi JS', errors.length === 0, errors.join(' | '));
  }

  /* ---------- E. Hồ sơ máy chủ không được xoá ảnh Google ----------
     applyServerProfile cũ gán picture = avatar || '' — hồ sơ mới chưa chọn ảnh
     (avatar rỗng) là ảnh Google trên thanh đầu trang bị xoá ngay khi mở My Space. */
  {
    const { win, errors } = await mk.page('/my-space.html', {
      url: 'https://ssochuz.pages.dev/my-space',
      fetch: (url) => {
        const u = String(url);
        if (u.includes('/api/me/space')) return Promise.resolve(new Response(JSON.stringify({ id: 'a'.repeat(64), version: 0, profile: { name: 'Bạn đọc', bio: '', avatar: '' }, shelves: [] })));
        if (u.includes('/api/registry')) return Promise.resolve(new Response(JSON.stringify({ rev: 'x', lib: [] })));
        return Promise.resolve(new Response('{}'));
      },
      config: { CZ_API: 'https://api.test' },
      files: ['cz-config.js', 'cz-app.js', 'cz-auth.js', 'cz-space.js'],
      setup(w) {
        w.localStorage.setItem('ssochuz-user', JSON.stringify({ uid: 'u1', name: 'Nguyễn Văn A', email: 'a@b.c', picture: 'https://lh3.googleusercontent.com/a/photo', exp: Math.floor(Date.now() / 1000) + 9999 }));
        w.localStorage.setItem('ssochuz-auth-token', 'tok');
      },
    });
    await wait(250);
    const A = win.CZ_AUTH;
    A.applyServerProfile({ name: 'Bạn đọc', bio: '', avatar: '' });
    ok('E/hồ sơ trống không xoá ảnh Google', A.current().picture === 'https://lh3.googleusercontent.com/a/photo', A.current().picture);
    ok('E/hồ sơ trống không kéo tên về "Bạn đọc"', A.current().name === 'Nguyễn Văn A', A.current().name);
    A.applyServerProfile({ name: 'A Tí', bio: 'thích đọc', avatar: '' });
    ok('E/tên trong hồ sơ thì thắng', A.current().name === 'A Tí', A.current().name);
    ok('E/chưa chọn ảnh vẫn giữ ảnh Google', A.current().picture === 'https://lh3.googleusercontent.com/a/photo');
    A.applyServerProfile({ name: 'A Tí', bio: 'thích đọc', avatar: '', avatarOff: true });
    ok('E/bấm "Bỏ ảnh" thì ảnh mới bị xoá', A.current().picture === '', A.current().picture);
    A.applyServerProfile({ name: 'A Tí', bio: 'thích đọc', avatar: 'data:image/jpeg;base64,AAAA' });
    ok('E/ảnh tự cắt thì được áp', A.current().picture === 'data:image/jpeg;base64,AAAA');
    ok('E/không lỗi JS', errors.length === 0, errors.join(' | '));
  }

  console.log(JSON.stringify({ dat: pass.length, errors0: [] }, null, 2));
})().catch((e) => { console.error('FAIL:', e && (e.stack || e.message)); process.exit(1); });
