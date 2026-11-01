/* ============================================================================
   Kiểm thử RSS FEED (phía web tĩnh)
   - <head> có <link rel=alternate type=rss> feed chung (bot/feed reader đọc HTML thô)
   - footer có link RSS → CZ_API/feed.xml
   - trang truyện: thẻ alternate feed riêng (JS chèn) — KHÔNG còn nút RSS ở hero (đã bỏ ở r62)
   - file OG tĩnh của từng truyện có sẵn alternate feed riêng (bot không chạy JS)
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};
  /* ---------- trang chủ ---------- */
  const p = page('index.html', { fetch: dataFetch() });
  const { win, doc, errors } = p;
  await wait(900);
  out.errors0 = errors.slice(0, 5);
  const api = win.CZ && win.CZ.API ? win.CZ.API.replace(/\/+$/, '') : '';
  ok(api, 'thieu CZ.API (can de dung URL feed)');
  const alt = doc.querySelector('link[rel="alternate"][type="application/rss+xml"]');
  ok(alt, 'index.html thieu <link rel=alternate rss> trong <head>');
  ok(alt && alt.getAttribute('href') === api + '/feed.xml',
    'alternate trang chu phai la ' + api + '/feed.xml (thay: ' + (alt && alt.getAttribute('href')) + ')');
  const fl = doc.querySelector('#ftr a[href$="/feed.xml"]');
  ok(fl && /rss/i.test(fl.textContent), 'footer thieu link RSS → /feed.xml');
  ok(fl && fl.getAttribute('target') === '_blank', 'link RSS footer phai target=_blank');

  /* ---------- trang truyện ---------- */
  const RS = 'third-person';
  const r = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + RS + '/',
    fetch: dataFetch()
  });
  await wait(1300);
  const rdoc = r.doc;
  out.errors1 = r.errors.slice(0, 6);
  /* KHÔNG còn nút RSS ở hero: người dùng đã chốt bỏ lối tắt RSS/chia sẻ trên
     trang truyện (r62) và hero trang truyện được làm lại ở r95–r114. Kênh RSS
     cho feed reader vẫn nguyên — kiểm bằng thẻ <link rel=alternate> ngay dưới. */
  const alts = [...rdoc.querySelectorAll('link[rel="alternate"][type="application/rss+xml"]')]
    .map(x => x.getAttribute('href'));
  ok(alts.some(h => h === api + '/feed.xml'), 'trang truyen thieu alternate feed chung (thay: ' + JSON.stringify(alts) + ')');
  ok(alts.some(h => h === api + '/feed.xml?slug=' + RS), 'trang truyen thieu alternate feed rieng (thay: ' + JSON.stringify(alts) + ')');

  /* ---------- file OG tĩnh (bot chỉ đọc HTML thô) ---------- */
  try {
    const og = fs.readFileSync(path.join(ROOT, 'truyen', RS, 'index.html'), 'utf8');
    ok(og.includes('/feed.xml?slug=' + RS), 'file OG tinh thieu alternate feed rieng');
    ok(og.includes('rel="alternate"'), 'file OG tinh thieu the alternate');
  } catch (e) {
    ok(false, 'khong doc duoc file OG tinh: ' + e.message);
  }
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
