/* ============================================================================
   Kiểm thử PWA + đọc offline (kiểm tĩnh + jsdom nhẹ, vì jsdom không có SW thật)
   - mọi trang đều gắn manifest; manifest đủ trường installable, icon đúng cỡ
   - sw.js có CZ_SW_VER, precache khớp ?v= trong HTML, KHÔNG cache request ghi,
     ảnh giới hạn 200 mục, có SKIP_WAITING
   - bìa truyện KHÔNG BAO GIỜ mất vì service worker: bị CSP chặn tải hộ thì phải
     nhường cho trình duyệt (302), và _headers phải có luật CSP riêng cho /sw.js
   - trang chủ: nút Cài app ẩn sẵn, thanh offline/cập nhật ẩn sẵn, offline hiện banner
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* đọc kích thước PNG (không cần thư viện ngoài) */
const pngSize = f => {
  const b = fs.readFileSync(path.join(ROOT, f));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

(async () => {
  const out = {};
  /* ---------- manifest trong mọi trang ---------- */
  const PAGES = ['index.html', 'truyen.html', 'admin.html', 'guide.html', '404.html'];
  PAGES.forEach(f => {
    ok(read(f).includes('<link rel="manifest" href="/manifest.webmanifest">'), f + ' thieu link manifest');
  });

  /* ---------- 62 TRANG truyen/<slug>/index.html PHẢI ĐỒNG BỘ VỚI truyen.html ----------
     tools/build_og.mjs lấy truyen.html làm khuôn rồi sinh ra 62 trang tĩnh (đang
     được commit) để crawler và người đọc vào thẳng /truyen/<slug>/ nhận ngay thẻ
     OG + JSON-LD. Vì là BẢN SAO nên mỗi lần sửa truyen.html hoặc bump ?v= mà quên
     chạy `npm run og` thì 62 trang đó âm thầm cũ: thiếu nút mới và bắt trình duyệt
     dùng bản JS/CSS đã cache từ đời trước. Đã xảy ra thật với ô #tocFull (Cụm 7).
     Chốt ở đây: mọi id của khuôn phải có trong từng trang, và ?v= phải giống hệt. */
  {
    const shellSrc = read('truyen.html');
    const idsShell = new Set((shellSrc.match(/id="[A-Za-z0-9_-]+"/g) || []));
    const vShell = JSON.stringify([...new Set(shellSrc.match(/\?v=[0-9a-z]+/g) || [])].sort());
    const dirs = fs.existsSync(path.join(ROOT, 'truyen')) ? fs.readdirSync(path.join(ROOT, 'truyen')) : [];
    const pre = dirs.map(d => path.join('truyen', d, 'index.html'))
      .filter(f => fs.existsSync(path.join(ROOT, f)));
    ok(pre.length >= 50, 'phải có ít nhất 50 trang truyen/<slug>/index.html, thấy ' + pre.length);
    let lechId = [], lechV = [];
    pre.forEach(f => {
      const s = read(f);
      const ids = new Set(s.match(/id="[A-Za-z0-9_-]+"/g) || []);
      const thieu = [...idsShell].filter(x => !ids.has(x));
      if (thieu.length) lechId.push(f + ' thiếu ' + thieu.join(','));
      const v = JSON.stringify([...new Set(s.match(/\?v=[0-9a-z]+/g) || [])].sort());
      if (v !== vShell) lechV.push(f + ' = ' + v);
    });
    ok(lechId.length === 0,
      lechId.length + '/62 trang prerender lệch cấu trúc với truyen.html — chạy `npm run og`: ' + lechId.slice(0, 3).join(' | '));
    ok(lechV.length === 0,
      lechV.length + '/62 trang prerender lệch ?v= với truyen.html — chạy `npm run og`: ' + lechV.slice(0, 3).join(' | '));
  }

  /* ---------- LINK "BỎ QUA TỚI NỘI DUNG" (bàn phím / trình đọc màn hình) ----------
     Phải là PHẦN TỬ ĐẦU TIÊN trong <body>, trỏ tới một id CÓ THẬT trong cùng
     trang, và KHÔNG được ẩn bằng display:none — ẩn kiểu đó thì phím Tab bỏ qua
     luôn, coi như không có. */
  {
    const TRANG = ['index.html', 'truyen.html', 'admin.html', 'guide.html',
      'my-space.html', 'profile.html', '404.html'];
    TRANG.forEach(f => {
      const s = read(f);
      const m = s.match(/<body[^>]*>\s*([\s\S]{0,200})/);
      ok(!!m && /<a class="skip"/.test(m[1]), f + ': link bỏ qua không nằm ngay đầu <body>');
      const href = (s.match(/<a class="skip" href="#([A-Za-z0-9_-]+)"/) || [])[1];
      ok(!!href, f + ': link bỏ qua thiếu href="#…"');
      ok(!!href && new RegExp('id="' + href + '"').test(s),
        f + ': link bỏ qua trỏ #' + href + ' nhưng trang không có id đó');
      ok(/Bỏ qua/.test(s), f + ': link bỏ qua không có chữ cho trình đọc màn hình');
    });
    const css = read('cz.css');
    ok(/\.skip\s*{/.test(css), 'cz.css thiếu luật .skip');
    const khoi = (css.match(/\.skip\s*{[^}]*}/) || [''])[0];
    ok(/position:\s*fixed|position:\s*absolute/.test(khoi), '.skip phải được đẩy ra ngoài khung nhìn bằng position');
    ok(!/display:\s*none/.test(khoi), '.skip KHÔNG được ẩn bằng display:none — ẩn vậy thì không focus được');
    ok(/\.skip:focus/.test(css), 'thiếu .skip:focus để hiện ra khi dùng bàn phím');
    /* 62 trang prerender là BẢN SAO của truyen.html — cũng phải có link bỏ qua */
    const preDirs = fs.existsSync(path.join(ROOT, 'truyen')) ? fs.readdirSync(path.join(ROOT, 'truyen')) : [];
    const preFiles = preDirs.map(d => path.join('truyen', d, 'index.html'))
      .filter(f => fs.existsSync(path.join(ROOT, f)));
    const thieuSkip = preFiles.filter(f => !/<a class="skip"/.test(read(f)));
    ok(preFiles.length >= 50 && thieuSkip.length === 0,
      thieuSkip.length + '/' + preFiles.length + ' trang prerender thiếu link bỏ qua — chạy `npm run og`');
  }

  /* ---------- sitemap.xml PHẢI THEO KỊP data/ ----------
     Không gọi Python trong bài kiểm thử; đối chiếu thẳng số đường dẫn và từng
     đường dẫn chương với data/registry.json + data/book/*.json. */
  {
    const sm = read('sitemap.xml');
    const locs = sm.match(/<loc>([^<]+)<\/loc>/g) || [];
    const reg = JSON.parse(read('data/registry.json'));
    const books = (reg.lib || []).map(n => String(n.slug || '')).filter(Boolean);
    let chuong = 0;
    const thieu = [];
    books.forEach(slug => {
      const f = path.join('data/book', slug + '.json');
      if (!fs.existsSync(path.join(ROOT, f))) return;
      const b = JSON.parse(read(f));
      const n = (b.chapters || []).length;
      chuong += n;
      if (sm.indexOf('/truyen/' + slug + '/') < 0) thieu.push('trang truyện ' + slug);
      for (let i = 1; i <= n; i++) {
        if (sm.indexOf('/truyen/' + slug + '/chuong-' + i + '/') < 0) { thieu.push(slug + '/chuong-' + i); break; }
      }
    });
    const mongDoi = 1 + books.length + chuong;
    ok(locs.length === mongDoi,
      'sitemap có ' + locs.length + ' đường dẫn, dữ liệu thật cần ' + mongDoi +
      ' (1 trang chủ + ' + books.length + ' truyện + ' + chuong + ' chương) — chạy `npm run build`');
    ok(thieu.length === 0, 'sitemap thiếu: ' + thieu.slice(0, 4).join(', '));
    ok(/<loc>https:\/\/ssochuz\.pages\.dev\/<\/loc>/.test(sm), 'sitemap thiếu trang chủ');
    ok(read('robots.txt').indexOf('Sitemap:') >= 0, 'robots.txt không trỏ tới sitemap');
  }


  let mf = null;
  try { mf = JSON.parse(read('manifest.webmanifest')); } catch (e) { ok(false, 'manifest.webmanifest hong JSON: ' + e.message); }
  if (mf) {
    ok(mf.name === 'ssochuz library' && mf.short_name === 'ssochuz library', 'manifest thieu name/short_name');
    ok(mf.lang === 'vi', 'manifest thieu lang=vi');
    ok(mf.display === 'standalone' && mf.start_url === '/', 'manifest thieu display/start_url');
    ok(mf.theme_color && mf.background_color, 'manifest thieu theme/background color');
    (mf.icons || []).forEach(ic => {
      const rel = String(ic.src || '').replace(/^\//, '');
      ok(fs.existsSync(path.join(ROOT, rel)), 'manifest icon khong co file: ' + ic.src);
      if (fs.existsSync(path.join(ROOT, rel))) {
        const [w, h] = pngSize(rel);
        ok(w + 'x' + h === ic.sizes, 'icon ' + ic.src + ' co that ' + w + 'x' + h + ' khac ' + ic.sizes);
      }
      ok(/maskable/.test(ic.purpose || ''), 'icon ' + ic.src + ' thieu purpose maskable');
    });
    ok((mf.icons || []).some(i => i.sizes === '192x192'), 'manifest thieu icon 192');
    ok((mf.icons || []).some(i => i.sizes === '512x512'), 'manifest thieu icon 512');
  }
  out.manifest = mf ? { icons: mf.icons.map(i => i.sizes).join(',') } : null;

  /* ---------- sw.js ---------- */
  const sw = read('sw.js');
  ok(/var CZ_SW_VER = '[^']+'/.test(sw), 'sw.js thieu hang so CZ_SW_VER');
  ok(/req\.method !== 'GET'/.test(sw), 'sw.js phai chan request ghi truoc moi chien luoc cache');
  ok(!/cache\.put\(req, res\.clone\(\)\)/.test(sw.split("req.method !== 'GET'")[0] || ''), 'sw.js khong duoc cache truoc khi chan POST');
  ok(/SKIP_WAITING/.test(sw), 'sw.js thieu SKIP_WAITING cho nut Tai lai');
  ok(/IMG_MAX = 200/.test(sw), 'sw.js anh phai gioi han 200 muc');
  ok(/\/api\/registry/.test(sw) && /\/api\/book/.test(sw) && /\/api\/stats/.test(sw), 'sw.js phai cache API registry/book/stats');
  /* precache phai khop ?v= trong HTML (chong lech version) */
  const htmlVs = {};
  PAGES.forEach(f => {
    [...read(f).matchAll(/\/(cz(?:\.css|-app\.js|-home\.js|-story\.js|-config\.js|-auth\.js))\?v=([0-9a-z]+)/g)]
      .forEach(m => { htmlVs[m[1]] = m[2]; });
  });
  Object.keys(htmlVs).forEach(f => {
    ok(sw.includes('/' + f + '?v=' + htmlVs[f]), 'sw.js precache lech version ' + f + ' (HTML: ?v=' + htmlVs[f] + ')');
  });
  ['/', '/truyen/', '/ssochuz.png'].forEach(u => ok(sw.includes("'" + u), 'sw.js precache thieu ' + u));

  /* ---------- bìa truyện: SW không được làm mất bìa ---------- */
  const imgSec = sw.slice(sw.indexOf('function imgFirst'), sw.indexOf('function navFallback'));
  ok(imgSec.length > 0, 'sw.js thieu phan xu ly anh bia');
  ok(!/Response\.error\(\)/.test(imgSec), 'sw.js khong duoc tra anh loi cho bia (dung loi "F5 la mat bia")');
  ok(/status: 302/.test(sw), 'sw.js phai nhuong (302) cho trinh duyet tu tai bia khi bi chan');
  ok(/IMG_REMOTE_OK/.test(sw) && /IMG_HANDOFF/.test(sw), 'sw.js phai nho host/URL da nhuong de khong chan lai');
  ok(/navigator/.test(sw), 'sw.js phai phan biet CSP chan voi mat mang (navigator.onLine)');
  ok(/cspAllowsRemote/.test(sw) && /content-security-policy/i.test(sw), 'sw.js phai tu doc CSP cua chinh no truoc khi dung ra tai ho anh bia');

  /* ---------- _headers ---------- */
  const hd = read('_headers');
  ok(/\/sw\.js[\s\S]*?Cache-Control: no-cache/.test(hd), '_headers thieu no-cache cho /sw.js');
  ok(/manifest\.webmanifest[\s\S]*?application\/manifest\+json/.test(hd), '_headers thieu MIME cho manifest');
  /* sw.js chịu CSP của CHÍNH nó: thiếu luật riêng là SW bị chặn khi tải hộ ảnh bìa */
  const swRule = hd.slice(hd.indexOf('\n/sw.js') + 1);
  ok(/^\/sw\.js/.test(swRule), '_headers: khong tim thay khoi luat /sw.js');
  ok(/^\/sw\.js[\s\S]*?! Content-Security-Policy/.test(swRule), '_headers: /sw.js phai bo CSP chung (! Content-Security-Policy)');
  ok(/^\/sw\.js[\s\S]*?connect-src \*/.test(swRule), '_headers: CSP rieng cua /sw.js phai mo connect-src * (de SW tai ho anh bia host ngoai)');
  /* luật bỏ CSP phải nằm SAU luật đã đặt CSP — Cloudflare áp theo thứ tự trong tệp */
  ok(hd.indexOf('\n/sw.js') > hd.indexOf('\n/*\n'), '_headers: khoi /sw.js phai nam SAU khoi /* (bo CSP chung moi co tac dung)');
  /* trang và mọi tệp khác vẫn phải giữ CSP nghiêm như cũ */
  const allRule = hd.slice(hd.indexOf('\n/*\n') + 1);
  ok(/connect-src 'self' https:\/\/\*\.workers\.dev/.test(allRule), '_headers: luat /* phai giu CSP nghiêm cho trang');

  /* ---------- jsdom: nut cai app + thanh banner ---------- */
  const p = page('index.html', { fetch: dataFetch() });
  const { win, doc, errors } = p;
  await wait(900);
  out.errors0 = errors.slice(0, 5);
  const ins = doc.querySelector('#czInstall');
  ok(ins, 'header thieu nut #czInstall');
  ok(ins && ins.hidden === true, 'nut Cai app phai an san khi chua cai duoc');
  ok(doc.querySelector('#czNet #czOffline') && doc.querySelector('#czNet #czUpdate'), 'thieu thanh banner offline/cap nhat');
  ok(doc.querySelector('#czOffline').hidden && doc.querySelector('#czUpdate').hidden, 'banner phai an san khi online');
  try {
    Object.defineProperty(win.navigator, 'onLine', { value: false, configurable: true });
    win.dispatchEvent(new win.Event('offline')); await wait(60);
    ok(!doc.querySelector('#czOffline').hidden && /Đang offline/.test(doc.querySelector('#czOffline').textContent),
      'offline phai hien banner “Đang offline — đọc bản đã lưu”');
    Object.defineProperty(win.navigator, 'onLine', { value: true, configurable: true });
    win.dispatchEvent(new win.Event('online')); await wait(60);
    ok(doc.querySelector('#czOffline').hidden, 'online lai thi banner phai an');
  } catch (e) { ok(false, 'khong gia lap duoc offline: ' + e.message); }
  /* ma Cài app iOS + dang ky SW co trong ban build */
  const built = read('cz-app.js');
  ok(/Thêm vào Màn hình chính/.test(built), 'ban build thieu huong dan Cai app iOS');
  ok(/serviceWorker.*register.*sw\.js|register.*\/sw\.js/.test(built), 'ban build chua dang ky /sw.js');

  out.errors1 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
