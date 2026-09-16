/* ============================================================================
   Kiểm thử THEO DÕI + huy hiệu “N chương mới” (chi phí 0 request)
   - nút chuông NẰM Ở hero trang truyện (không còn trên card/hàng trang chủ cho gọn)
   - bấm chuông → lưu ssochuz-follow {slug: số chương lúc theo dõi}
   - registry tăng 2 chương → huy hiệu đỏ “2 chương mới” trên card, không request
   - hero và nút reader #actFollow đổi trạng thái theo nhau
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
  /* ---------- trang chủ: KHÔNG chuông, VẪN huy hiệu ---------- */
  const log = [];
  const p = page('index.html', { fetch: dataFetch({ log }) });
  const { win, doc, errors } = p;
  const CZ = win.CZ;
  const LS = win.localStorage;
  const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
  const click = el => { el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); };
  await wait(900);
  out.errors0 = errors.slice(0, 5);

  ok(!doc.querySelector('#grid [data-followbtn]'), 'card trang chu phai BO nut chuong cho gon');
  ok(!doc.querySelector('#contRow [data-followbtn]'), 'hang dang-doc-do phai BO nut chuong');
  /* huy hiệu vẫn hiện khi có chương mới (giả đã theo dõi từ trước, mốc cũ) */
  const firstCard = $('#grid .cardwrap [data-t]');
  const slug = firstCard ? firstCard.getAttribute('href').split('/').filter(Boolean).pop() : '';
  const n = CZ.findLib(slug);
  const ch0 = n ? n.chapters : 0;
  LS.setItem('ssochuz-follow', JSON.stringify({ [slug]: ch0 }));
  n.chapters = ch0 + 2;
  click($('[data-view="list"]')); await wait(200);
  let badge = doc.querySelector('#grid [data-newbadge="' + slug + '"]');
  ok(badge && !badge.hasAttribute('hidden') && /2 chương mới/.test(badge.textContent),
    'registry +2 chuong phai hien “2 chương mới” (thay: ' + (badge ? badge.textContent : '<thieu>') + ')');
  const posts = log.filter(u => /^POST/.test(u));
  ok(posts.length === 0, 'huy hieu khong duoc phat sinh request (thay POST: ' + posts.join(',') + ')');
  /* hàng tủ truyện: có huy hiệu, không chuông */
  LS.setItem('ssochuz-shelf', JSON.stringify([slug]));
  win.dispatchEvent(new win.Event('pageshow')); await wait(250);
  const shelfTab = $$('#banTabs .tab').find(b => b.dataset.ban === 'shelf');
  if (shelfTab) { click(shelfTab); await wait(150); }
  win.dispatchEvent(new win.Event('pageshow')); await wait(250);
  ok(!doc.querySelector('#shelfRow [data-followbtn]'), 'hang tu truyen phai BO nut chuong');
  const sbadge = doc.querySelector('#shelfRow [data-newbadge="' + slug + '"]');
  ok(sbadge && !sbadge.hasAttribute('hidden') && /chương mới/.test(sbadge.textContent),
    'tu truyen phai hien huy hieu chuong moi (thay: ' + (sbadge ? sbadge.textContent : '<thieu>') + ')');

  /* ---------- trang truyện: hero CÓ chuông, đồng bộ với reader ---------- */
  const RS = 'third-person';
  const bookLen = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book/' + RS + '.json'), 'utf8')).chapters.length;
  const regLen = (REG.find(x => x.slug === RS) || {}).chapters || 0;
  const r = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + RS + '/',
    fetch: dataFetch()
  });
  await wait(1300);
  const rdoc = r.doc, rwin = r.win;
  const heroBtn = rdoc.querySelector('#shero [data-followbtn="' + RS + '"]');
  ok(heroBtn, 'hero trang truyen thieu nut chuong [data-followbtn]');
  ok(heroBtn && heroBtn.getAttribute('aria-pressed') === 'false', 'chuong hero ban dau phai aria-pressed=false');
  ok(heroBtn && heroBtn.querySelector('svg') && /theo dõi/i.test(heroBtn.textContent), 'nut hero phai co icon + nhan Theo doi');
  if (heroBtn) {
    heroBtn.dispatchEvent(new rwin.MouseEvent('click', { bubbles: true, cancelable: true })); await wait(60);
    const fm = JSON.parse(rwin.localStorage.getItem('ssochuz-follow') || '{}');
    ok(fm[RS] === Math.max(bookLen, regLen), 'bam chuong hero phai luu moc ' + Math.max(bookLen, regLen) + ' (thay: ' + JSON.stringify(fm) + ')');
    ok(heroBtn.classList.contains('on') && heroBtn.getAttribute('aria-pressed') === 'true' && /đang theo dõi/i.test(heroBtn.textContent),
      'nut hero khong doi trang thai sau khi bam');
  }
  /* reader đồng bộ theo hero */
  rwin.location.hash = '#chuong-1'; await wait(400);
  const ab = rdoc.querySelector('#actFollow');
  ok(ab && ab.classList.contains('on') && /đang theo dõi/i.test(ab.textContent), 'reader #actFollow phai hien Đang theo doi theo hero');
  if (ab) {
    ab.dispatchEvent(new rwin.MouseEvent('click', { bubbles: true, cancelable: true })); await wait(60);
    const fm2 = JSON.parse(rwin.localStorage.getItem('ssochuz-follow') || '{}');
    ok(!(RS in fm2), 'bam chuong trong reader phai bo theo doi (thay: ' + JSON.stringify(fm2) + ')');
    const heroBtn2 = rdoc.querySelector('#shero [data-followbtn="' + RS + '"]');
    ok(heroBtn2 && !heroBtn2.classList.contains('on') && heroBtn2.getAttribute('aria-pressed') === 'false',
      'bo theo doi trong reader thi nut hero phai tat theo');
  }
  /* mở truyện cập nhật mốc (theo dõi lại với mốc cũ rồi mở) */
  rwin.localStorage.setItem('ssochuz-follow', JSON.stringify({ [RS]: bookLen - 2 }));
  rwin.CZ.markFollowSeen(RS);
  ok(rwin.CZ.newChapters(RS) === 0, 'mo truyen phai cap nhat moc (newChapters=' + rwin.CZ.newChapters(RS) + ')');
  out.errors1 = r.errors.slice(0, 6);
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
