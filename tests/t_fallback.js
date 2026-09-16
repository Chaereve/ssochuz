/* ============================================================================
   Kiểm thử N13 — DỌN DẸP + PHAO CỨU SINH
   ----------------------------------------------------------------------------
   · không còn <link rel="preconnect" href="https://firestore.googleapis.com">
   · Worker trượt → thử lại ĐÚNG 1 lần → rớt về /data/*.json, hiện banner dự phòng
   · ghi nhớ fallback 10 phút (ssochuz-fallback) để không đập cửa Worker liên tục
   Chạy:  node tests/t_fallback.js
   ========================================================================== */
const { page, dataFetch, read, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
const BASE = 'https://cms.test';
const REG = JSON.parse(read('data/registry.json'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = (d, s) => d.querySelector(s);
const J = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });

/* Worker giả: ĐẾM số lần gọi registry; 2 lần đầu trượt (mạng), lần 3 mới nối */
function flakyApi(calls) {
  return (p, opt) => {
    if (p === '/api/registry') {
      calls.reg++;
      if (calls.reg <= 2) return Promise.reject(new TypeError('Failed to fetch'));
      return J(REG);
    }
    if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
    const mb = p.match(/^\/api\/book\/(.+)$/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
    }
    return undefined;
  };
}

(async () => {
  const out = {};

  /* ---------- A. preconnect Firestore đã bỏ ---------- */
  const htmls = [path.join(ROOT, 'index.html'), path.join(ROOT, 'truyen.html')]
    .concat(fs.readdirSync(path.join(ROOT, 'truyen')).map(d => path.join(ROOT, 'truyen', d, 'index.html')));
  out.conPreconnect = htmls.filter(f => fs.existsSync(f) && /<link[^>]+rel=["']preconnect["'][^>]*firestore/i.test(fs.readFileSync(f, 'utf8'))).length;

  /* ---------- B. Worker trượt 2 lần → retry 1 lần → rớt tĩnh + banner ---------- */
  const calls = { reg: 0 };
  const b = page('index.html', {
    config: { CZ_API: BASE },
    fetch: dataFetch({ api: flakyApi(calls) })
  });
  await wait(1600);
  out.kvRetry = {
    lanGoiRegistry: calls.reg,
    nguonDuLieu: b.win.CZ_SRC,
    bannerFallback: !!($(b.doc, '#czFallback') && !$(b.doc, '#czFallback').hidden),
    nho10Phut: !!b.win.localStorage.getItem('ssochuz-fallback')
  };

  /* ---------- C. bộ truyện lấy book cũng rớt → dùng /data/book ---------- */
  const callsB = { reg: 0 };
  const c = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: dataFetch({
      api: flakyApi(callsB)
    })
  });
  await wait(1700);
  out.book = {
    coTitle: !!($(c.doc, '#shero h1') && $(c.doc, '#shero h1').textContent),
    title: ($(c.doc, '#shero h1') || {}).textContent || ''
  };

  /* ---------- D. ghi nhớ fallback: lần mở kế không đập cửa Worker ---------- */
  const d = page('index.html', {
    config: { CZ_API: BASE },
    fetch: dataFetch({
      api: (p, opt) => {
        if (p === '/api/registry') { calls.reg2 = (calls.reg2 || 0) + 1; return J(REG); }
        if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: {} });
        return undefined;
      }
    }),
    setup(w) {
      try { w.localStorage.setItem('ssochuz-fallback', String(Date.now() + 10 * 60 * 1000)); } catch (e) {}
    }
  });
  await wait(1400);
  out.khongGoiLai = (calls.reg2 || 0) === 0;

  out.errors0 = [...b.errors, ...c.errors, ...d.errors].slice(0, 6);

  const errs = [];
  const eq = (n, g, w) => { if (String(g) !== String(w)) errs.push(n + ' (nhận: ' + JSON.stringify(g) + ', cần: ' + JSON.stringify(w) + ')'); };
  eq('N13/không còn preconnect firestore', out.conPreconnect, 0);
  eq('N13/registry trượt → gọi đúng 2 lần (gọi + retry 1)', out.kvRetry.lanGoiRegistry, 2);
  eq('N13/rớt về dữ liệu tĩnh', out.kvRetry.nguonDuLieu, 'static');
  eq('Tải dự phòng im lặng, không hiện banner', out.kvRetry.bannerFallback, false);
  eq('N13/ghi nhớ fallback 10 phút', out.kvRetry.nho10Phut, true);
  eq('N13/book rớt → vẫn đọc được từ /data', out.book.title.length > 0, true);
  eq('N13/10 phút sau mới thử lại Worker', out.khongGoiLai, true);

  out.fail = errs;
  console.log(JSON.stringify(out, null, 1));
  console.log(errs.length ? 'CÒN ' + errs.length + ' LỖI N13' : 'N13 thành phần đạt hết');
  process.exit(errs.length ? 1 : 0);
})();
