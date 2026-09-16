/* ============================================================================
   Kiểm thử N11 — ĐÁNH GIÁ SAO (chỉ trang truyện)
   ----------------------------------------------------------------------------
   · 5 sao cạnh tên/tình trạng/số chương trong shero; KHÔNG ở thư viện/reader
   · bấm sao → POST /api/rate (rating 1..5), nhãn trung bình/số lượt cập nhật
   · ghi trượt → thử LẠI ĐÚNG 1 LẦN sau ~1,2s rồi mới bỏ cuộc
   · reader vẫn giữ nguyên nút thích theo chương (#actLike), không có sao
   Chạy:  node tests/t_rating.js
   ========================================================================== */
const { page, dataFetch, read, ROOT } = require('./mk');
const fs = require('fs'), path = require('path');
const BASE = 'https://cms.test';
const J = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = (d, s) => d.querySelector(s), $$ = (d, s) => [...d.querySelectorAll(s)];

const REG = JSON.parse(read('data/registry.json'));
const KV_ITEMS = { 'third-person': { views: 1234, votes: 56, rating: 4.5, ratingCount: 10 } };

function makeApi(log, opts = {}) {
  let ok = opts.ok !== false;      /* lần gọi rate đầu: false = trả lỗi để thử nhắc lại */
  let calls = { rate: 0 };
  return {
    calls,
    api: (p, opt) => {
      log.push((opt.method || 'GET') + ' ' + p);
      if (p === '/api/registry') return J(REG);
      const mb = p.match(/^\/api\/book\/(.+)$/);
      if (mb) {
        const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
        return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
      }
      if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: opts.items || KV_ITEMS });
      if (p === '/api/view' && opt.method === 'POST') return J({ ok: true, counted: true, day: '2026-09-16' });
      if (p === '/api/rate' && opt.method === 'POST') {
        calls.rate += 1;
        if (!ok) { ok = true; return J({ ok: false, error: 'giả lỗi' }, false, 500); }   /* lần 1 hỏng, lần 2 nên ok */
        return J({ ok: true, slug: JSON.parse(opt.body).slug, rating: JSON.parse(opt.body).rating, ratingAvg: 4.6, ratingCount: 11 });
      }
      if (p === '/api/vote' && opt.method === 'POST') return J({ ok: true, slug: 'third-person', votes: 1, total: 57 });
      return undefined;
    }
  };
}

(async () => {
  const out = {}, errs = [];
  const eq = (name, got, want) => { if (String(got) !== String(want)) errs.push(name + ' (nhận: ' + JSON.stringify(got) + ', cần: ' + JSON.stringify(want) + ')'); };

  /* ---------- 1. trang truyện: hiện 5 sao + số trung bình từ stats ---------- */
  const log = [];
  const api = makeApi(log, { ok: false });   /* lần gửi đầu trả lỗi để kiểm retry */
  const st = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: api.api, log })
  });
  await wait(1600);
  out.sheroSao = $$(st.doc, '#shero .stars [data-star]').length;
  out.sheroLabel = ($(st.doc, '#shero .rl') || {}).textContent;
  /* bấm sao 5 → gọi /api/rate, retry đúng 1 lần */
  const stars = $$(st.doc, '#shero .stars [data-star]');
  if (stars.length) { stars[4].dispatchEvent(new st.win.MouseEvent('click', { bubbles: true })); await wait(1600); }
  out.rateCalls = api.calls.rate;
  out.postRateLog = log.filter(u => /POST.*\/api\/rate/.test(u)).length;
  out.labelSauBam = ($(st.doc, '#shero .rl') || {}).textContent;

  /* ---------- 2. thư viện/trang chủ: KHÔNG có sao ---------- */
  const home = page('index.html', { config: { CZ_API: BASE }, fetch: dataFetch({ apiBase: BASE, api: makeApi([]).api }) });
  await wait(1200);
  out.homeSao = $$(home.doc, '.rating, .stars').length;

  /* ---------- 3. reader: nút thích chương giữ nguyên, không sao ---------- */
  const rd = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-2/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api: makeApi([]).api })
  });
  await wait(1600);
  out.readerSao = $$(rd.doc, '.rating, .stars').length                    /* toàn trang: sao shero vẫn còn, KHÔNG phải trong thanh đọc */
    - $$(rd.doc, '#rd .rating, #rd .stars, #rdActs .rating, #rdActs .stars').length;
  out.readerSaoTrongActs = $$(rd.doc, '#rdActs .stars').length;
  out.readerLikeKept = !!$(rd.doc, '#actLike');

  out.errors0 = st.errors.slice(0, 5).concat(home.errors.slice(0, 5), rd.errors.slice(0, 5));

  /* ---------- nghiệm thu ---------- */
  eq('rating/sheAll hero có 5 sao', out.sheroSao, 5);
  eq('rating/nhãn hiện trung bình', /4,5 \/ 5/.test(out.sheroLabel || ''), true);
  eq('rating/bấm sao POST /api/rate', out.postRateLog >= 1, true);
  eq('rating/ghi trượt retry đúng 1 lần', out.rateCalls, 2);
  eq('rating/sau bấm nhãn vẽ số mới', /4,6 \/ 5/.test(out.labelSauBam || ''), true);
  eq('rating/không có sao ở thư viện', out.homeSao, 0);
  eq('rating/không có sao trong thanh đọc (reader)', out.readerSaoTrongActs, 0);
  eq('rating/reader giữ nút thích chương', out.readerLikeKept, true);

  out.fail = errs;
  console.log(JSON.stringify(out, null, 1));
  console.log(errs.length ? 'CÒN ' + errs.length + ' LỖI N11' : 'N11 đạt hết');
  process.exit(errs.length ? 1 : 0);
})();
