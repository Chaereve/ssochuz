/* ============================================================================
   Kiểm thử SỐ LIỆU THẬT (Firebase) — mặt trái của t_home.js
   t_home.js kiểm tra “Firebase bị chặn thì không hiện số nào”.
   Bài này kiểm tra “khi đọc được số thật thì web có dùng đúng số đó”:
   - bảng xếp hạng hiện lượt đọc / bình chọn thật, đổi tiêu chí đổi thứ tự
   - thư viện có thêm kiểu sắp xếp “Đọc nhiều nhất” và sắp đúng
   - trang đọc hiện chip số lượt đọc
   Chạy:  cd tests && node t_stats.js
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const path = require('path');
const STATS = path.join(__dirname, '_stats.json');
const p = page('index.html', { fetch: dataFetch({ stats: STATS, apiBase: 'https://cms.test' }) });
const { win, doc, errors } = p;
const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
const txt = s => { const e = $(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};
  await wait(1600);   /* đợi registry + số liệu Firebase (giả) về */

  out.stats = { on: !!(p.win.CZ._memo.stats && p.win.CZ._memo.stats.on), soBo: Object.keys((p.win.CZ._memo.stats || {}).items || {}).length };

  /* --- bảng xếp hạng: có số thật --- */
  out.rankTabs = $$('#rankTabs .tab').map(b => b.textContent.trim());
  out.rankTop = $$('#rank .rank').slice(0, 3).map(r => ({
    ten: r.querySelector('.tt b').textContent.trim(),
    so: r.querySelector('.v').textContent.trim()
  }));
  out.rankSrc = txt('#rankSrc');
  out.khongCoSoBia = !/ước lượng/.test(txt('#rankSrc'));

  /* --- đổi sang “Bình chọn” thì thứ tự đổi theo phiếu --- */
  const tabs = $$('#rankTabs .tab');
  const monthTab = tabs.find(b => /Tháng/.test(b.textContent));
  out.hasVoteTab = tabs.some(b => /Ngày|Tuần|Tháng/.test(b.textContent));
  if (monthTab) { click(monthTab); await wait(200); }
  out.rankVotes = $$('#rank .rank').slice(0, 3).map(r => r.querySelector('.v').textContent.trim());

  /* --- thư viện: có kiểu sắp xếp “Đọc nhiều nhất” và sắp đúng --- */
  const sel = $('#fSort');
  out.sortOptions = [...sel.options].map(o => o.textContent);
  out.hasViewsSort = out.sortOptions.includes('Đọc nhiều nhất');
  sel.value = 'views'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(250);
  out.viewsFirst = (($('#grid .card h3') || {}).textContent || '').trim();
  sel.value = 'new'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(150);

  /* --- trang đọc: chip số lượt đọc --- */
  const st = page('truyen.html', {
    url: 'https://chuseoz.pages.dev/truyen/third-person/#chuong-2',
    fetch: dataFetch({ stats: STATS, apiBase: 'https://cms.test' })
  });
  const D = st.doc, S = st.win;
  await wait(1500);
  const acts = D.querySelector('#rdActs');
  out.readerChip = {
    coChip: !!acts && /lượt đọc/.test(acts.textContent),
    text: acts ? (acts.querySelector('.chip') || {}).textContent : '',
    likeBtn: acts ? (acts.querySelector('#actLike span') || {}).textContent : ''
  };
  /* bấm Thích: nhãn phải kèm số phiếu thật của bộ này (56) */
  const like = D.querySelector('#actLike');
  if (like) { like.dispatchEvent(new S.MouseEvent('click', { bubbles: true })); await wait(200); }
  out.readerLike = like ? like.textContent.trim() : '';
  out.errStory = st.errors.slice(0, 4);

  out.errors0 = errors.slice(0, 5);
  console.log(JSON.stringify(out, null, 1));
  const bad = errors.length + st.errors.length;
  console.log(bad ? 'CÒN ' + bad + ' LỖI JS' : 'Không lỗi JS nào');
  process.exit(0);
})();
