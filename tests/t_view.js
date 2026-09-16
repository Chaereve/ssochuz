/* ============================================================================
   Kiểm thử ĐẾM LƯỢT ĐỌC TIẾT KIỆM QUOTA (nhiệm vụ 5)
   - mở chương 1 rồi sang chương 2 (cùng truyện, cùng ngày) → chỉ 1 POST /api/view
   - localStorage ghi khoá ssochuz-viewsent-<slug>-<yyyymmdd>
   - khoá cũ ssochuz-viewed-… vẫn chặn gửi (không đếm trùng khi chuyển bản)
   - URL /api/registry và /api/stats KHÔNG còn ?_=… (để trúng cache biên)
   - sau khi đếm lượt đọc, web KHÔNG gọi lại /api/stats (tránh nhận số cũ từ cache)
   Chạy:  cd tests && node t_view.js
   ========================================================================== */
const { page, dataFetch, read, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
const BASE = 'https://cms.test';
const SLUG = 'co-vo-ho-anh-cua-toi';
const REG = JSON.parse(read('data/registry.json'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const bad = [];
const ok = (c, m) => { if (!c) bad.push(m); };
const J = b => Promise.resolve({
  ok: true, status: 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b))
});

function api(p, opt) {
  opt = opt || {};
  if (p === '/api/registry') return J(REG);
  if (p === '/api/health') return J({ ok: true, version: '1.9.5', kv: true });
  const mb = p.match(/^\/api\/book\/([^/?]+)/);
  if (mb) {
    const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
    return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false });
  }
  if (p === '/api/stats') return J({ ok: true, source: 'kv', items: { [SLUG]: { views: 10, votes: 3, viewsDay: 1, votesDay: 0 } } });
  if (p === '/api/view' && opt.method === 'POST') return J({ ok: true, counted: true });
  return undefined;
}

(async () => {
  const out = {};
  /* ---------- A. mo 2 chuong cung truyen → chi 1 POST ---------- */
  const log = [];
  const a = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + SLUG + '/',
    config: { CZ_API: BASE }, fetch: dataFetch({ apiBase: BASE, api, log }),
    setup(w) { try { w.localStorage.setItem('ssochuz-confirmed18', String(Date.now())); } catch (e) {} }
  });
  await wait(1500);
  a.win.location.hash = '#chuong-1'; await wait(600);
  ok(a.doc.body.classList.contains('reading'), 'A: mo chuong 1 phai vao trang doc');
  a.win.location.hash = '#chuong-2'; await wait(600);
  const posts = log.filter(u => u.startsWith('POST ' + BASE + '/api/view'));
  ok(posts.length === 1, 'A: 2 chuong cung truyen chi 1 POST /api/view (thay ' + posts.length + ')');
  const d = new Date();
  const ymd = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  ok(a.win.localStorage.getItem('ssochuz-viewsent-' + SLUG + '-' + ymd) === '1',
    'A: phai ghi khoa ssochuz-viewsent-' + SLUG + '-' + ymd);
  ok(!log.some(u => u.includes('/api/registry?')), 'A: /api/registry khong duoc co query pha cache (de trung cache bien)');
  ok(!log.some(u => u.includes('/api/stats?')), 'A: /api/stats khong duoc co query pha cache');
  ok(log.filter(u => u.includes(' /api/stats') || u.includes(BASE + '/api/stats')).length === 1,
    'A: /api/stats chi goi 1 lan (khong goi lai sau khi dem luot doc)');
  /* ---------- B. khoa cu van chan (tuong thich ban cu) ---------- */
  const logB = [];
  const b = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + SLUG + '/',
    config: { CZ_API: BASE }, fetch: dataFetch({ apiBase: BASE, api, log: logB }),
    setup(w) {
      try { w.localStorage.setItem('ssochuz-viewed-' + SLUG + '-' + new Date().toISOString().slice(0, 10), '1'); } catch (e) {}
      try { w.localStorage.setItem('ssochuz-confirmed18', String(Date.now())); } catch (e) {}
    }
  });
  await wait(1500);
  b.win.location.hash = '#chuong-1'; await wait(600);
  ok(!logB.some(u => u.startsWith('POST ' + BASE + '/api/view')),
    'B: khoa cu ssochuz-viewed-… phai chan gui (khong dem trung khi chuyen ban)');
  out.errors0 = a.errors.slice(0, 5);
  out.errors1 = b.errors.slice(0, 5);
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
