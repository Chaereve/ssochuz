/* ============================================================================
   KHUNG CẢM XÚC Ở TRANG ĐỌC — ĐÃ BỎ (r90), bài này canh chừng việc bỏ đó
   ----------------------------------------------------------------------------
   Bối cảnh: bộ reaction/sticker (cz-react.js, 16,6 kB) từng được gắn ở cuối mỗi
   chương qua hook `CZReact.afterChapterPaint`. Vòng r89e chủ trang chốt BỎ khối
   cảm xúc khỏi trang đọc, và r90 đã gỡ luôn hook đó — nhưng thẻ <script> vẫn
   còn nằm trong truyen.html, tức mọi trang truyện tải thêm 16,6 kB JS để… không
   gắn vào đâu cả. Bài này giữ đúng trạng thái đã chốt:
     1. Trang đọc KHÔNG tải cz-react.js (không còn lượt tải chết) và
        `window.CZReact` không tồn tại.
     2. Không còn `#rdReact` / `.rreact` trong DOM.
     3. Cuối chương vẫn có hàng hành động đã duyệt (#rdActs có nút) — không
        nhân tiện xoá luôn phần điều hướng chương.
   Chạy:  node tests/t_react.js
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const assert = require('node:assert/strict');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-2/',
    fetch: dataFetch()
  });
  await wait(1400);
  const d = p.doc, w = p.win;

  /* 1. không tải cz-react.js, không có API */
  const tags = [...d.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
  assert.equal(tags.filter(s => /cz-react/.test(s)).length, 0,
    'trang đọc vẫn tải cz-react.js dù khối cảm xúc đã bỏ ở r90');
  assert.equal(typeof w.CZReact, 'undefined', 'CZReact không được nạp ở trang đọc');

  /* 2. không còn khung cảm xúc trong DOM */
  assert.equal(d.querySelector('#rdReact'), null, '#rdReact vẫn còn trong DOM');
  assert.equal(d.querySelectorAll('.rreact').length, 0, 'vẫn còn phần tử .rreact');

  /* 3. hàng hành động cuối chương vẫn nguyên */
  const acts = d.querySelector('#rdActs');
  assert.ok(acts, 'mất #rdActs ở cuối chương');
  assert.ok(acts.querySelectorAll('button, a').length >= 3,
    'hàng hành động cuối chương phải còn nút (thấy ' + acts.querySelectorAll('button, a').length + ')');

  assert.deepEqual(p.errors, []);
  p.dom.window.close();
  console.log(JSON.stringify({
    errors0: [],
    checked: 'trang đọc không tải cz-react.js, không còn #rdReact/.rreact, hàng hành động cuối chương vẫn còn'
  }));
})().catch(e => { console.error(e.message || e); process.exit(1); });
