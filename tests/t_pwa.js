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
  /* moi trang phai tu nhat quan: tat ca ?v= cz.* trong CUNG mot trang chi duoc
     1 version (18/09: admin.html tung lech CSS ?v=a + JS ?v=f -> trinh duyet
     chay JS cu tren HTML moi, ribbon hien toan icon "i" la) */
  ['index.html', 'truyen.html', 'admin.html', 'guide.html', '404.html', 'my-space.html', 'profile.html'].forEach(f => {
    const vs = [...read(f).matchAll(/\/(?:cz(?:\.css|-[a-z]+\.js)|admin\.js)\?v=([0-9a-z]+)/g)].map(m => m[1]);
    const uniq = [...new Set(vs)];
    ok(uniq.length <= 1, f + ' lech version trong trang: ' + uniq.join(', '));
  });

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
