/* ============================================================================
   Kiểm thử TRANG TÁC GIẢ (/tac-gia/) + TRANG COUPLE (/couple/)
   - ?q=<tên> hoặc ?q=<slug> hoặc #<slug> → tên + số truyện + trạng thái + lưới truyện
   - không slug → danh sách mọi tác giả/couple kèm số truyện
   - q lạ → hiện tất cả + ghi chú không tìm thấy
   - trang truyện (tab Giới thiệu) + bộ lọc thư viện có link "Xem tất cả..."
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8')).lib;
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* kỳ vọng đếm từ CZ.lib() (đã chuẩn hoá tên) chứ không phải file thô:
   dữ liệu có cả "SalmonLover" lẫn "Salmonlover", client gộp làm một */
const byCount = (lib, f) => {
  const m = {};
  lib.forEach(n => { const v = n[f]; if (v) m[v] = (m[v] || 0) + 1; });
  return Object.keys(m).sort((a, b) => m[b] - m[a]).map(k => [k, m[k]]);
};

(async () => {
  const out = {};
  /* ---------- A. tác giả theo tên ---------- */
  const p = page('tac-gia/index.html', {
    url: 'https://ssochuz.pages.dev/tac-gia/',
    fetch: dataFetch(),
  });
  await wait(1000);
  out.errors0 = p.errors.slice(0, 5);
  const LIB = p.win.CZ.lib();
  const AUTHORS = byCount(LIB, 'author'), COUPLES = byCount(LIB, 'couple');
  out.authors = AUTHORS.length;
  out.couples = COUPLES.length;
  const [AU, AU_N] = AUTHORS[0];
  const [CP, CP_N] = COUPLES[0];
  const pA = page('tac-gia/index.html', {
    url: 'https://ssochuz.pages.dev/tac-gia/?q=' + encodeURIComponent(AU),
    fetch: dataFetch(),
  });
  await wait(1000);
  ok(pA.doc.querySelector('#ppTitle').textContent === AU, 'tac-gia ?q=ten phai hien ten tac gia (thay: ' + pA.doc.querySelector('#ppTitle').textContent + ')');
  const cards = pA.doc.querySelectorAll('#ppGrid .cardwrap');
  ok(cards.length === AU_N, 'tac-gia phai hien du ' + AU_N + ' truyen (thay: ' + cards.length + ')');
  ok(new RegExp(AU_N + ' truyện').test(pA.doc.querySelector('#ppSub').textContent), 'tac-gia thieu dong so truyen + trang thai');

  /* ---------- B. tác giả theo slug ---------- */
  const slugAU = pA.win.CZ.slugify(AU);
  const p2 = page('tac-gia/index.html', {
    url: 'https://ssochuz.pages.dev/tac-gia/?q=' + slugAU,
    fetch: dataFetch(),
  });
  await wait(1000);
  ok(p2.doc.querySelector('#ppTitle').textContent === AU, '?q=slug phai ra cung tac gia (thay: ' + p2.doc.querySelector('#ppTitle').textContent + ')');

  /* ---------- C. không slug → danh sách ---------- */
  const p3 = page('tac-gia/index.html', { url: 'https://ssochuz.pages.dev/tac-gia/', fetch: dataFetch() });
  await wait(1000);
  const plist = p3.doc.querySelectorAll('#ppGrid .pcard');
  ok(plist.length === AUTHORS.length, 'tac-gia khong slug phai liet ke ' + AUTHORS.length + ' tac gia (thay: ' + plist.length + ')');
  ok(/truyện/.test(p3.doc.querySelector('#ppGrid').textContent), 'danh sach tac gia thieu so truyen');

  /* ---------- D. couple ---------- */
  const p4 = page('couple/index.html', {
    url: 'https://ssochuz.pages.dev/couple/?q=' + encodeURIComponent(CP),
    fetch: dataFetch(),
  });
  await wait(1000);
  out.errors1 = p4.errors.slice(0, 5);
  ok(p4.doc.querySelector('#ppTitle').textContent === CP, 'couple ?q=ten sai (thay: ' + p4.doc.querySelector('#ppTitle').textContent + ')');
  ok(p4.doc.querySelectorAll('#ppGrid .cardwrap').length === CP_N, 'couple phai du ' + CP_N + ' truyen');
  const p5 = page('couple/index.html', { url: 'https://ssochuz.pages.dev/couple/', fetch: dataFetch() });
  await wait(1000);
  ok(p5.doc.querySelectorAll('#ppGrid .pcard').length === COUPLES.length, 'couple khong slug phai liet ke ' + COUPLES.length + ' couple');

  /* ---------- E. hash + q lạ ---------- */
  const p6 = page('tac-gia/index.html', {
    url: 'https://ssochuz.pages.dev/tac-gia/#' + slugAU,
    fetch: dataFetch(),
  });
  await wait(1000);
  ok(p6.doc.querySelector('#ppTitle').textContent === AU, '#hash slug phai ra dung tac gia');
  const p7 = page('tac-gia/index.html', {
    url: 'https://ssochuz.pages.dev/tac-gia/?q=khong-co-nguoi-nay-xyz',
    fetch: dataFetch(),
  });
  await wait(1000);
  ok(/Không tìm thấy/.test(p7.doc.querySelector('#ppGrid').textContent), 'q la phai bao khong tim thay + hien tat ca');
  ok(p7.doc.querySelectorAll('#ppGrid .pcard').length === AUTHORS.length, 'q la phai hien full danh sach');

  /* ---------- F. ô lọc tên + mục nav ---------- */
  const navHrefs = [...p3.doc.querySelectorAll('#czNav a')].map(a => a.getAttribute('href'));
  ok(navHrefs.includes('/tac-gia/') && navHrefs.includes('/couple/'), 'nav thieu muc Tac gia/Couple (thay: ' + JSON.stringify(navHrefs) + ')');
  ok(p3.doc.querySelector('#czNav a[href="/tac-gia/"].on'), 'o trang tac-gia thi muc Tac gia phai sang');
  const q = p3.doc.querySelector('#ppQ');
  ok(q && !p3.doc.querySelector('#ppQWrap').hasAttribute('hidden'), 'trang danh sach phai co o loc ten');
  if (q) {
    const probe = p3.win.CZ.slugify(AUTHORS[AUTHORS.length - 1][0]).slice(0, 5);
    q.value = probe;
    q.dispatchEvent(new p3.win.Event('input', { bubbles: true }));
    await wait(120);
    const shown = [...p3.doc.querySelectorAll('#ppGrid .pcard')].filter(c => c.style.display !== 'none').length;
    ok(shown >= 1 && shown < AUTHORS.length, 'go loc phai thu hep danh sach (thay: ' + shown + '/' + AUTHORS.length + ')');
    ok(/Tìm thấy/.test(p3.doc.querySelector('#ppSub').textContent), 'loc phai cap nhat dong dem');
    q.value = 'zzzz-khong-co';
    q.dispatchEvent(new p3.win.Event('input', { bubbles: true }));
    await wait(120);
    ok(/Không có tác giả nào khớp/.test(p3.doc.querySelector('#ppGrid').textContent), 'loc khong khop phai bao ro');
  }

  /* ---------- G. link từ trang truyện ---------- */
  const RS = 'third-person';
  const meta = LIB.find(n => n.slug === RS);
  const r = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/' + RS + '/',
    fetch: dataFetch(),
  });
  await wait(1300);
  const infoLinks = [...r.doc.querySelectorAll('#storyInfo a')].map(a => a.getAttribute('href'));
  const expAU = '/tac-gia/?q=' + encodeURIComponent(r.win.CZ.slugify(meta.author));
  ok(infoLinks.includes(expAU), 'tab Gioi thieu thieu link tac gia (thay: ' + JSON.stringify(infoLinks) + ')');
  if (meta.couple) {
    const expCP = '/couple/?q=' + encodeURIComponent(r.win.CZ.slugify(meta.couple));
    ok(infoLinks.includes(expCP), 'tab Gioi thieu thieu link couple');
  }

  /* ---------- H. link từ bộ lọc thư viện ---------- */
  const h = page('index.html', { fetch: dataFetch() });
  await wait(1000);
  const sel = h.doc.querySelector('#fAuthor');
  ok(sel && sel.options.length > 1, 'thieu dropdown tac gia');
  if (sel) {
    sel.value = AU;
    sel.dispatchEvent(new h.win.Event('change', { bubbles: true }));
    await wait(250);
    const fl = h.doc.querySelector('#fcount a[href^="/tac-gia/?q="]');
    ok(fl && fl.textContent.includes(AU), 'loc theo tac gia phai co link Xem tat ca (thay: ' + (h.doc.querySelector('#fcount') || {}).textContent + ')');
  }
  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
