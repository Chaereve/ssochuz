/* Truyện chưa có chương (17 bộ "Sắp ra mắt"):
   · trang chủ: nút đọc phải bị khoá, ghi rõ "sắp ra mắt"
   · trang đọc: phải báo rõ chưa có chương, KHÔNG được hiện chữ mẫu hay nội dung bộ khác */
const { page, dataFetch } = require('./mk');
const $ = (d, s) => d.querySelector(s);
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};
  /* --- trang đọc của bộ 0 chương --- */
  const r = page('reader.html', { url: 'https://chuseoz.pages.dev/truyen/my-boss/', fetch: dataFetch() });
  await wait(800);
  const body = r.doc.body.textContent.replace(/\s+/g, ' ').trim();
  out.reader = {
    noDemoText: !/Lunar Secret/.test(body),
    saysNoChapter: /chưa đăng chương nào|Sắp ra mắt/i.test(body),
    hasBlogLink: /blogspot\.com/.test(r.doc.body.innerHTML),
    errors: r.errors.slice(0, 3)
  };
  /* --- truyện thường vẫn đọc được bình thường --- */
  const r2 = page('reader.html', { url: 'https://chuseoz.pages.dev/truyen/third-person/', fetch: dataFetch() });
  await wait(800);
  out.normal = {
    title: ($(r2.doc, '#barTitle').textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    noDemoText: !/Lunar Secret/.test(r2.doc.body.textContent),
    errors: r2.errors.slice(0, 3)
  };
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
