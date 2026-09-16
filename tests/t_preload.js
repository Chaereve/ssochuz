/* ============================================================================
   Kiểm thử PRELOAD chương kế (đúng 1 chương N+1, không hơn)
   - đọc chương 1 quá 5 giây → ảnh chương 2 được tải trước (thấy trong log mạng)
   - cuộn quá nửa chương → preload ngay, khỏi đợi 5 giây
   - chương 6 (cách 4 chương) KHÔNG được tải → chứng minh chỉ preload N+1
   - đang ở chương cuối → không preload gì, không lỗi
   (Dữ liệu thật: co-vo-ho-anh-cua-toi có ảnh ở chương 2 và 6.)
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const BOOK = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book/co-vo-ho-anh-cua-toi.json'), 'utf8'));
const imgsOf = i => ((BOOK.chapters[i - 1] || {}).html || '').match(/<img[^>]+src="([^"]+)"/gi) || [];
const srcOf = tag => (tag.match(/src="([^"]+)"/i) || [])[1] || '';
const IMG2 = imgsOf(2).map(srcOf), IMG6 = imgsOf(6).map(srcOf);

(async () => {
  const out = { img2: IMG2.length, img6: IMG6.length };
  ok(IMG2.length > 0 && IMG6.length > 0, 'du lieu doi: can anh o chuong 2 va 6 de test');

  /* ---------- A. hen gio 5 giay ---------- */
  const logA = [];
  const a = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/co-vo-ho-anh-cua-toi/',
    fetch: dataFetch({ log: logA })
  });
  await wait(1200);
  out.errors0 = a.errors.slice(0, 5);
  a.win.location.hash = '#chuong-1'; await wait(400);
  ok(a.doc.body.classList.contains('reading'), 'mo #chuong-1 phai vao trang doc');
  const hadEarly = logA.some(u => IMG2.some(s => u.includes(s)));
  await wait(5600);
  const got2 = IMG2.filter(s => logA.some(u => u.includes(s)));
  ok(!hadEarly, 'anh chuong 2 khong duoc tai ngay khi moi mo chuong 1');
  ok(got2.length === IMG2.length, 'sau 5 giay phai preload du ' + IMG2.length + ' anh chuong 2 (thay ' + got2.length + ')');
  ok(!IMG6.some(s => logA.some(u => u.includes(s))), 'KHONG duoc preload anh chuong 6 (chi 1 chuong ke)');

  /* ---------- B. cuon qua nua chuong → preload ngay ---------- */
  const logB = [];
  const b = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/co-vo-ho-anh-cua-toi/',
    fetch: dataFetch({ log: logB })
  });
  await wait(1200);
  b.win.location.hash = '#chuong-1'; await wait(400);
  Object.defineProperty(b.doc.documentElement, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(b.win, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(b.win, 'scrollY', { value: 700, configurable: true });
  b.win.dispatchEvent(new b.win.Event('scroll')); await wait(400);
  const got2b = IMG2.filter(s => logB.some(u => u.includes(s)));
  ok(got2b.length === IMG2.length, 'cuon 58% phai preload ngay anh chuong 2 (thay ' + got2b.length + ')');

  /* ---------- C. chuong cuoi: khong preload, khong loi ---------- */
  const logC = [];
  const c = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/co-vo-ho-anh-cua-toi/',
    fetch: dataFetch({ log: logC })
  });
  await wait(1200);
  c.win.location.hash = '#chuong-7'; await wait(400);
  await wait(5600);
  ok(!logC.some(u => /blogger\.googleusercontent|blogspot/.test(u)), 'chuong cuoi khong duoc preload anh nao');
  out.errors1 = [...a.errors, ...b.errors, ...c.errors].slice(0, 6);
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
