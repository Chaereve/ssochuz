/* ============================================================================
   t_devserver.js · máy chủ xem thử trên máy phải phục vụ GIỐNG Cloudflare Pages
   ----------------------------------------------------------------------------
   `tools/dev_server.py` mô phỏng Pages (URL sạch, tự bỏ .html bằng 308, đọc
   `_redirects`) để xem thử trước khi deploy. Nhưng nó từng sai hai chỗ khiến
   **mọi trang truyện trên máy đều không mở được**:

     1. `/truyen` → 404: thư mục `truyen/` (chứa các trang truyện con) không có
        `index.html`, mà hàm tìm tệp lại bỏ cuộc luôn ở đó — quên mất tệp
        `truyen.html` nằm ngay cạnh (Pages vẫn phục vụ bình thường).
     2. `/truyen/<slug>/` → 508: mỗi bộ có luật `/truyen/<slug>/ → /truyen/<slug>/
        200` (tự trỏ về chính nó). Pages coi đó là KHÔNG viết lại gì, còn máy chủ
        xem thử hiểu là vòng lặp nên trả 508.

   Bài này bật máy chủ thật rồi gọi HTTP kiểm từng đường dẫn quan trọng, và kiểm
   luôn rằng **bộ bắt vòng lặp vẫn còn hoạt động** (dựng một thư mục tạm có
   `_redirects` sai như bản cũ → phải trả 508 kèm đường đi).

   Không cần jsdom, nhưng cần `python3`. Thiếu python3 thì bài tự bỏ qua.
   Chạy: node tests/t_devserver.js
   ========================================================================== */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function get(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: 4000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; if (body.length > 20000) body = body.slice(0, 20000); });
      res.on('end', () => resolve({ code: res.statusCode, loc: res.headers.location || '', body }));
    });
    req.on('error', e => resolve({ code: 0, loc: '', body: '', err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ code: 0, loc: '', body: '', err: 'timeout' }); });
  });
}

function start(root, port) {
  const p = spawn('python3', [path.join(root, 'tools', 'dev_server.py'), '--port', String(port), '--quiet'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {});
  p.stderr.on('data', () => {});
  return p;
}
async function ready(root, port, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const r = await get(port, '/');
    if (r.code) return true;
    await wait(150);
  }
  return false;
}

/* cổng trống: thử vài cổng cao, cổng nào máy chủ bật lên được thì dùng */
async function boot(root) {
  for (const port of [8791, 8792, 8793, 8794]) {
    const proc = start(root, port);
    if (await ready(root, port)) return { proc, port };
    try { proc.kill('SIGKILL'); } catch (e) {}
  }
  return null;
}

(async () => {
  const out = {};
  const hasPy = (() => {
    try { require('child_process').execSync('python3 --version', { stdio: 'ignore' }); return true; }
    catch (e) { return false; }
  })();
  if (!hasPy) {
    console.log(JSON.stringify({ errors0: [], ghiChu: 'không có python3 — bỏ qua bài kiểm thử máy chủ xem thử' }, null, 1));
    process.exit(0);
  }

  /* ============ 1. phục vụ đúng như Cloudflare Pages ====================== */
  const srv = await boot(ROOT);
  if (!srv) { console.log(JSON.stringify({ errors0: ['không bật được tools/dev_server.py'] }, null, 1)); process.exit(1); }
  const { port, proc } = srv;
  try {
    const cases = [
      /* đường dẫn · mã mong đợi · vì sao */
      ['/', 200, 'trang chủ'],
      ['/truyen', 200, 'trang thư viện (truyen.html) — thư mục truyen/ không có index.html'],
      ['/truyen/', 200, 'thư viện với dấu / (luật /truyen/ → /truyen 200)'],
      ['/truyen.html', 200, 'luật /truyen.html → /truyen 200'],
      ['/truyen/third-person', 200, 'trang một bộ truyện (không dấu /)'],
      ['/truyen/third-person/', 200, 'trang một bộ (có dấu /) — luật tự trỏ về chính nó, KHÔNG được là 508'],
      ['/truyen/third-person/?ch=3', 200, 'trang bộ kèm query — query phải được giữ nguyên'],
      ['/reader/third-person/', 200, 'link đời cũ /reader/<slug>/'],
      ['/reader?slug=third-person&ch=3', 200, 'link đời cũ /reader?slug=…'],
      ['/truyen/?slug=third-person', 200, 'trang bộ qua query'],
      ['/guide', 200, 'trang hướng dẫn'],
      ['/guide/', 200, 'trang hướng dẫn (dấu /)'],
      ['/couple/', 200, 'trang couple (thư mục có index.html)'],
      ['/tac-gia/', 200, 'trang tác giả'],
      ['/admin', 200, 'trang quản trị v2 sau cutover'],
      ['/admin/', 200, 'trang quản trị v2 sau cutover (dấu /)'],
      ['/admin-v2', 200, 'alias trang quản trị v2'],
      ['/admin-v2/', 200, 'alias trang quản trị v2 với dấu /'],
      ['/admin-legacy', 200, 'admin cũ giữ lại trong giai đoạn theo dõi'],
      ['/admin-legacy/', 200, 'admin cũ với dấu /'],
      ['/data/registry.json', 200, 'dữ liệu tĩnh'],
      ['/sw.js', 200, 'service worker'],
      ['/khong-ton-tai', 404, 'đường dẫn không có thật'],
    ];
    out.duongDan = {};
    for (const [p, want, why] of cases) {
      const r = await get(port, p);
      ok(r.code === want, `${p} phải trả ${want} (đang ${r.code || r.err || '?'}) — ${why}`);
      out.duongDan[p] = r.code;
    }
    /* /admin.html phải là 308 về /admin — đúng như Pages, và là nguồn của lỗi
       ERR_TOO_MANY_REDIRECTS năm xưa nên phải giữ nguyên hành vi này */
    const adm = await get(port, '/admin.html');
    ok(adm.code === 308 && adm.loc === '/admin', '/admin.html phải 308 về /admin (đang ' + adm.code + ' → ' + adm.loc + ')');
    out.adminHtml = { code: adm.code, location: adm.loc };

    /* nội dung phải là TRANG CỦA ĐÚNG BỘ, không phải trang thư viện */
    const story = await get(port, '/truyen/third-person/');
    ok(/Third Person/.test(story.body), '/truyen/third-person/ phải là trang của bộ Third Person');
    const lib = await get(port, '/truyen');
    ok(/<html/i.test(lib.body) && lib.body.length > 3000, '/truyen phải trả về trang thật (không phải trang lỗi)');
    const adminNow = await get(port, '/admin');
    ok(/adminV2Root/.test(adminNow.body) && /admin-v2\.js/.test(adminNow.body), '/admin phải trả về admin-v2.html sau cutover');
    const adminV2 = await get(port, '/admin-v2');
    ok(/adminV2Root/.test(adminV2.body) && /admin-v2\.js/.test(adminV2.body), '/admin-v2 phải trả về admin-v2.html');
    const legacy = await get(port, '/admin-legacy');
    ok(/trang quản trị/i.test(legacy.body) && /id="gate"/.test(legacy.body), '/admin-legacy phải trả về admin cũ');
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
  }

  /* ============ 2. bộ bắt vòng lặp _redirects vẫn phải hoạt động ========== */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssochuz-devserver-'));
  try {
    fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'tools', 'dev_server.py'), path.join(tmp, 'tools', 'dev_server.py'));
    fs.writeFileSync(path.join(tmp, 'index.html'), '<html>home</html>');
    fs.writeFileSync(path.join(tmp, 'truyen.html'), '<html>truyen</html>');
    /* đúng kiểu _redirects từng làm chết trang truyện: đích là tệp .html */
    fs.writeFileSync(path.join(tmp, '_redirects'),
      '/truyen/*   /truyen.html  200\n/truyen     /truyen.html  200\n');
    const bad_srv = await boot(tmp);
    if (!bad_srv) ok(false, 'không bật được máy chủ xem thử ở thư mục tạm');
    else {
      try {
        const loop = await get(bad_srv.port, '/truyen/ten-truyen/');
        ok(loop.code === 508, '_redirects tự lặp phải trả 508 (đang ' + loop.code + ')');
        ok(/Đường đi:/.test(loop.body), 'trang 508 phải chỉ ra đường đi của vòng lặp');
        const home = await get(bad_srv.port, '/');
        ok(home.code === 200, 'trang chủ vẫn phải chạy khi _redirects có luật lỗi');
        out.vongLap = { code: loop.code };
      } finally { try { bad_srv.proc.kill('SIGKILL'); } catch (e) {} }
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(JSON.stringify(Object.assign({ errors0: [], xemThu: out }, bad.length ? { loi: bad } : {}), null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch(e => {
  console.log(JSON.stringify({ errors0: ['bai kiem thu dev_server loi: ' + (e && e.stack || e)] }, null, 1));
  process.exit(1);
});
