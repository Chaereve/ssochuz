/* ============================================================================
   Kiểm thử URL RIÊNG CHO TỪNG CHƯƠNG + SEO (nhiệm vụ 6)
   - bấm link chương → thanh địa chỉ thành /truyen/<slug>/chuong-<n>/ (pushState,
     không tải lại), trang đọc mở, title/canonical/JSON-LD cập nhật theo chương
   - tải trực tiếp URL chương → vào thẳng đúng chương đó
   - link cũ #chuong-5 vẫn mở đúng + tự chuẩn hoá về URL chương
   - Back/Forward chuyển chương mượt (popstate)
   - CZ.readURL trả URL chương dạng path (không còn hash)
   - _redirects: /truyen/<slug>/chuong-7/ rewrite 200 về shell /truyen/<slug>/
   - sitemap.xml chứa đủ URL từng chương (1 + 62 + 1198)
   Chạy:  cd tests && node t_chapter_url.js
   ========================================================================== */
const { page, dataFetch, read, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
const BASE = 'https://cms.test';
const SLUG = 'co-vo-ho-anh-cua-toi';
const REG = JSON.parse(read('data/registry.json'));
const BOOK = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', SLUG + '.json'), 'utf8'));
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
  if (p === '/api/stats') return J({ ok: true, source: 'kv', items: {} });
  if (p === '/api/view' && opt.method === 'POST') return J({ ok: true, counted: true });
  if (p === '/api/vote' && opt.method === 'POST') return J({ ok: true, votes: 1, total: 1, liked: true });
  return undefined;
}
const mkpage = (url, log) => page('truyen.html', {
  url, config: { CZ_API: BASE }, fetch: dataFetch({ apiBase: BASE, api, log: log || [] }),
  setup(w) { try { w.localStorage.setItem('ssochuz-confirmed18', String(Date.now())); } catch (e) {} }
});
/* giả lập khớp luật _redirects của Pages: luật đầu trúng thì thắng */
function redirectTarget(reqPath) {
  const lines = read('_redirects').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  for (const l of lines) {
    const [src, dst, code] = l.split(/\s+/);
    if (!src || !dst) continue;
    let re = '^' + src.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
    if (new RegExp(re).test(reqPath)) return { dst, code: code || '301' };
  }
  return null;
}

(async () => {
  const out = { chuong: BOOK.chapters.length };
  ok(BOOK.chapters.length >= 5, 'du lieu doi: can >= 5 chuong de test');

  /* ---------- A. bam link chuong → pushState path, meta theo chuong ---------- */
  const a = mkpage('https://ssochuz.pages.dev/truyen/' + SLUG + '/');
  await wait(1500);
  const links = a.doc.querySelectorAll('a.cha[href*="/chuong-"]');
  ok(links.length >= 5, 'A: link chuong phai o dang path /chuong-n/ (thay ' + links.length + ')');
  ok(a.doc.querySelectorAll('a.cha[href^="#"]').length === 0, 'A: khong con link chuong dang hash');
  links[2].click(); await wait(700);
  ok(a.win.location.pathname === '/truyen/' + SLUG + '/chuong-3/', 'A: bam chuong 3 → path /chuong-3/ (thay ' + a.win.location.pathname + ')');
  ok(a.doc.body.classList.contains('reading'), 'A: mo trang doc');
  /* nhãn hiển thị lấy từ tiêu đề: vị trí 3 là "Chương 1" (chapLabel rút gọn) */
  ok(/^chương 1 ·/i.test(a.win.document.title), 'A: title tab theo chuong (thay ' + a.win.document.title.slice(0, 60) + ')');
  const canonA = a.doc.querySelector('link[rel="canonical"]');
  ok(canonA && canonA.getAttribute('href').endsWith('/chuong-3/'), 'A: canonical theo chuong');
  const ldA = JSON.parse(a.doc.querySelector('script[type="application/ld+json"]').textContent || '{}');
  ok(ldA['@type'] === 'Chapter' && ldA.position === 3, 'A: JSON-LD Chapter position=3 (thay ' + (ldA['@type'] || '?') + ')');

  /* ---------- B. tai truc tiep URL chuong ---------- */
  const b = mkpage('https://ssochuz.pages.dev/truyen/' + SLUG + '/chuong-2/');
  await wait(1500);
  ok(b.doc.body.classList.contains('reading'), 'B: tai /chuong-2/ vao thang trang doc');
  ok(/giới thiệu nhân vật/i.test(b.win.document.title), 'B: title la chuong 2 (thay ' + b.win.document.title.slice(0, 60) + ')');

  /* ---------- C. link cu #chuong-5 van chay + chuan hoa URL ---------- */
  const c = mkpage('https://ssochuz.pages.dev/truyen/' + SLUG + '/#chuong-5');
  await wait(1500);
  ok(c.doc.body.classList.contains('reading'), 'C: #chuong-5 mo duoc trang doc');
  ok(c.win.location.pathname === '/truyen/' + SLUG + '/chuong-5/', 'C: URL chuan hoa ve path (thay ' + c.win.location.pathname + c.win.location.hash + ')');

  /* ---------- D. Back/Forward ---------- */
  const d = mkpage('https://ssochuz.pages.dev/truyen/' + SLUG + '/');
  await wait(1500);
  const dl = d.doc.querySelectorAll('a.cha[href*="/chuong-"]');
  dl[0].click(); await wait(500);
  dl[1].click(); await wait(500);
  ok(d.win.location.pathname.endsWith('/chuong-2/'), 'D: dang o chuong 2');
  d.win.history.back(); await wait(700);
  ok(d.win.location.pathname.endsWith('/chuong-1/') && /lời mở đầu/i.test(d.win.document.title),
    'D: Back ve chuong 1 (' + d.win.location.pathname + ' | ' + d.win.document.title.slice(0, 40) + ')');
  ok(d.doc.body.classList.contains('reading'), 'D: Back van o trang doc');
  d.win.history.forward(); await wait(700);
  ok(d.win.location.pathname.endsWith('/chuong-2/') && /giới thiệu nhân vật/i.test(d.win.document.title),
    'D: Forward toi chuong 2 (' + d.win.location.pathname + ' | ' + d.win.document.title.slice(0, 40) + ')');

  /* ---------- E. readURL + link copy ---------- */
  ok(a.win.CZ.readURL('be-my-angel', 5) === '/truyen/be-my-angel/chuong-5/', 'E: CZ.readURL dang path');
  ok(a.win.CZ.readURL('be-my-angel', 0) === '/truyen/be-my-angel/', 'E: CZ.readURL khong chuong → trang truyen');

  /* ---------- F. _redirects rewrite 200 ---------- */
  ['lunar-secret', 'be-my-angel', SLUG].forEach(s => {
    const r = redirectTarget('/truyen/' + s + '/chuong-7/');
    ok(r && r.code === '200' && r.dst === '/truyen/' + s + '/', 'F: /truyen/' + s + '/chuong-7/ → 200 ve shell (' + JSON.stringify(r) + ')');
  });
  const rIdx = redirectTarget('/truyen/be-my-angel/');
  ok(rIdx && rIdx.code === '200', 'F: URL truyen van 200');

  /* ---------- G. sitemap du URL chuong ---------- */
  const sm = read('sitemap.xml');
  ok(sm.includes('/truyen/be-my-angel/chuong-5/'), 'G: sitemap co URL chuong-5/be-my-angel');
  const nUrl = (sm.match(/<url>/g) || []).length;
  let total = 1 + REG.lib.length;
  REG.lib.forEach(n => {
    try { total += JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book', n.slug + '.json'), 'utf8')).chapters.length; } catch (e) {}
  });
  ok(nUrl === total, 'G: sitemap du ' + total + ' URL (thay ' + nUrl + ')');

  out.errors0 = a.errors.slice(0, 5);
  out.errors1 = [...b.errors, ...c.errors, ...d.errors].slice(0, 5);
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
