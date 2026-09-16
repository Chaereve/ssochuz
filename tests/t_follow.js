/* ============================================================================
   Kiểm thử THEO DÕI + huy hiệu “N chương mới” (chi phí 0 request)
   - thẻ lưới/danh sách, hàng tủ truyện/đang-đọc-dở, reader đều có nút chuông
   - bấm chuông → lưu ssochuz-follow {slug: số chương lúc theo dõi}
   - registry tăng 2 chương → huy hiệu đỏ “2 chương mới”, không gọi thêm request
   - mở truyện (markFollowSeen) → mốc cập nhật, huy hiệu tắt
   - bỏ theo dõi → xoá mốc, huy hiệu tắt
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8')).lib;
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};
  /* ---------- trang chủ ---------- */
  const log = [];
  const p = page('index.html', { fetch: dataFetch({ log }) });
  const { win, doc, errors } = p;
  const CZ = win.CZ;
  const LS = win.localStorage;
  const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
  const click = el => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); };
  await wait(900);
  out.errors0 = errors.slice(0, 5);

  const btn = $('#grid [data-followbtn]');
  ok(btn, 'the luoi thieu nut chuong [data-followbtn]');
  const slug = btn ? btn.getAttribute('data-followbtn') : '';
  const n = CZ.findLib(slug);
  const ch0 = n ? n.chapters : 0;
  ok(btn && btn.getAttribute('aria-pressed') === 'false', 'chuong ban dau phai aria-pressed=false');
  ok(btn && btn.querySelector('svg'), 'nut chuong thieu icon svg');

  click(btn); await wait(60);
  let fm = JSON.parse(LS.getItem('ssochuz-follow') || '{}');
  ok(fm[slug] === ch0, 'bam chuong phai luu {slug: ' + ch0 + '} (thay: ' + JSON.stringify(fm) + ')');
  ok(btn.classList.contains('on') && btn.getAttribute('aria-pressed') === 'true', 'nut chuong khong doi trang thai sau khi bam');
  let badge = doc.querySelector('#grid [data-newbadge="' + slug + '"]');
  ok(badge && badge.hasAttribute('hidden'), 'vua theo doi (0 chuong moi) thi huy hieu phai an');

  /* admin thêm 2 chương demo → render lại bằng cách chuyển chế độ xem (giữ nguyên sort) */
  n.chapters = ch0 + 2;
  click($('[data-view="list"]')); await wait(200);
  badge = doc.querySelector('#grid [data-newbadge="' + slug + '"]');
  ok(badge && !badge.hasAttribute('hidden') && /2 chương mới/.test(badge.textContent),
    'registry +2 chuong phai hien “2 chương mới” o che do danh sach (thay: ' + (badge ? badge.textContent : '<thieu>') + ')');
  ok(doc.querySelector('#grid .cardwrap.listwrap [data-followbtn="' + slug + '"]'), 'che do danh sach thieu nut chuong');
  click($('[data-view="grid"]')); await wait(200);
  badge = doc.querySelector('#grid [data-newbadge="' + slug + '"]');
  ok(badge && !badge.hasAttribute('hidden') && /2 chương mới/.test(badge.textContent),
    'registry +2 chuong phai hien “2 chương mới” o the luoi (thay: ' + (badge ? badge.textContent : '<thieu>') + ')');
  const posts = log.filter(u => /^POST/.test(u));
  ok(posts.length === 0, 'theo doi/huy hieu khong duoc phat sinh request (thay POST: ' + posts.join(',') + ')');

  /* bo theo doi → huy hieu tat */
  click(doc.querySelector('#grid [data-followbtn="' + slug + '"]')); await wait(60);
  fm = JSON.parse(LS.getItem('ssochuz-follow') || '{}');
  ok(!(slug in fm), 'bo theo doi phai xoa moc (thay: ' + JSON.stringify(fm) + ')');
  badge = doc.querySelector('#grid [data-newbadge="' + slug + '"]');
  ok(badge && badge.hasAttribute('hidden'), 'bo theo doi thi huy hieu phai an');

  /* theo doi lai + mo truyen (markFollowSeen) → huy hieu tat */
  click(doc.querySelector('#grid [data-followbtn="' + slug + '"]')); await wait(60);
  n.chapters = ch0 + 4;
  CZ.markFollowSeen(slug);
  ok(CZ.newChapters(slug) === 0, 'mo truyen phai cap nhat moc (newChapters=' + CZ.newChapters(slug) + ')');

  /* hang tu truyen: co chuong + huy hieu */
  LS.setItem('ssochuz-shelf', JSON.stringify([slug]));
  win.dispatchEvent(new win.Event('pageshow')); await wait(250);
  const shelfTab = $$('#banTabs .tab').find(b => b.dataset.ban === 'shelf');
  if (shelfTab) { click(shelfTab); await wait(150); }
  n.chapters = ch0 + 6;
  win.dispatchEvent(new win.Event('pageshow')); await wait(250);
  const sbadge = doc.querySelector('#shelfRow [data-newbadge="' + slug + '"]');
  ok(doc.querySelector('#shelfRow [data-followbtn="' + slug + '"]'), 'hang tu truyen thieu nut chuong');
  ok(sbadge && !sbadge.hasAttribute('hidden') && /chương mới/.test(sbadge.textContent),
    'tu truyen phai hien huy hieu chuong moi (thay: ' + (sbadge ? sbadge.textContent : '<thieu>') + ')');
  out.follow = { slug, ch0: ch0, badge: sbadge ? sbadge.textContent.trim() : null };

  /* ---------- trang truyen: mo truyen tu xoa huy hieu + reader co nut chuong ---------- */
  const RS = 'third-person';
  const bookLen = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book/' + RS + '.json'), 'utf8')).chapters.length;
  const regLen = (REG.find(x => x.slug === RS) || {}).chapters || 0;
  const r = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + RS + '/',
    fetch: dataFetch(),
    setup(w) { w.localStorage.setItem('ssochuz-follow', JSON.stringify({ [RS]: bookLen - 2 })); }
  });
  await wait(1300);
  const rfm = JSON.parse(r.win.localStorage.getItem('ssochuz-follow') || '{}');
  ok(rfm[RS] === Math.max(bookLen, regLen), 'mo truyen phai cap nhat moc ve ' + Math.max(bookLen, regLen) + ' (thay: ' + rfm[RS] + ')');
  r.win.location.hash = '#chuong-1'; await wait(350);
  const ab = r.doc.querySelector('#actFollow');
  ok(ab, 'reader thieu nut #actFollow');
  if (ab) {
    const wasOn = ab.classList.contains('on');
    ab.dispatchEvent(new r.win.MouseEvent('click', { bubbles: true, cancelable: true })); await wait(60);
    const rfm2 = JSON.parse(r.win.localStorage.getItem('ssochuz-follow') || '{}');
    ok(wasOn && !(RS in rfm2), 'bam chuong trong reader phai bo theo doi (trang thai cu on=' + wasOn + ', moc moi: ' + JSON.stringify(rfm2) + ')');
  }
  out.errors1 = r.errors.slice(0, 6);
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
