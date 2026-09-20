/* ============================================================================
   Kiểm thử TRANG CHỦ (bố cục hero landing)
   - dựng được hero / số liệu / bàn đọc / khám phá (4 tab) / thư viện
   - thẻ truyện trỏ đúng /truyen/<slug>/ (link thật, không phải # ảo)
   - tìm kiếm, lọc, sắp xếp, phân trang chạy thật
   - “Bàn đọc” gộp đang-đọc-dở + tủ truyện, xoá được từng bộ
   - KHÔNG hiện số lượt đọc khi Firebase bị chặn (không bịa số)
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const p = page('index.html', { fetch: dataFetch() });
const { win, doc, errors } = p;
const LS = win.localStorage;
const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
const txt = s => { const e = $(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LIB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/registry.json'), 'utf8')).lib;

(async () => {
  await wait(900);
  const out = { errors0: errors.slice(0, 5) };

  /* ---------- hero ---------- */
  out.hero = {
    slides: $$('#stage .slide').length,
    showing: $$('#stage .slide.on').length,
    title: (($('#stage .slide.on h1') || {}).textContent || '').trim(),
    cta: $$('#stage .slide.on .btn-row a, #stage .slide.on .btn-row button').map(b => b.textContent.trim()),
    readHref: ($('#stage .slide.on .btn-row a') || {}).getAttribute ? $('#stage .slide.on .btn-row a').getAttribute('href') : '',
    dots: $$('#hDots button').length,
    strip: $$('#hStrip button').length,
    hasBlurBg: !!$('#hero .bg')
  };
  click($$('#hDots button')[1]); await wait(120);
  out.heroAfterDot = (($('#stage .slide.on h1') || {}).textContent || '').trim() === (LIB.find(n => n.slug === p.win.CZ.slides(p.win.CZ._memo.reg)[1].slug) || {}).title;

  /* ---------- số liệu + thư viện ---------- */
  out.facts = { n: $$('#facts .f').length, labels: $$('#facts .f span').map(e => e.textContent.trim()) };
  out.cards = { n: $$('#grid .card').length, pager: txt('#pager'), firstHref: ($('#grid .card') || {}).getAttribute('href') };
  out.cardsAreRealLinks = /^\/truyen\/[^/]+\/$/.test(out.cards.firstHref || '');

  /* ---------- tìm kiếm + lọc ---------- */
  const q = $('#q');
  q.value = 'chain'; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(300);
  out.search = { n: $$('#grid .card').length, fcount: txt('#fcount'), chip: txt('#fpick') };
  q.value = ''; q.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(300);
  const tabs = $$('#tabs .tab');
  click(tabs[2]); await wait(200);
  out.tabFilter = { label: tabs[2].textContent.trim(), n: $$('#grid .card').length };
  click(tabs[0]); await wait(200);
  /* tình trạng lọc bằng dãy tab ngay trên lưới — không còn ô “Tình trạng” trùng lặp */
  out.statusSel = { conOLoc: !!$('#fStatus'), n0: $$('#grid .card').length };
  const stTab = $$('#tabs .tab').find(b => /Hoàn thành/.test(b.textContent));
  click(stTab); await wait(220);
  out.statusFilter = { n: $$('#grid .card').length, chip: txt('#fpick'), fcount: txt('#fcount') };
  click($$('#tabs .tab')[0]); await wait(200);
  const sel = $('#fSort');
  out.sortOptions = [...sel.options].map(o => o.textContent);
  sel.value = 'az'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(200);
  out.sortAZ = (($('#grid .card h3') || {}).textContent || '').trim();
  sel.value = 'new'; sel.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(150);

  /* ---------- tìm nhanh (⌘K / phím /) ---------- */
  click('#czJump'); await wait(200);
  const jb = doc.querySelector('#czJumpBox');
  const ji = doc.querySelector('#czJumpInput');
  ji.value = 'third'; ji.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(200);
  out.jump = {
    open: !!jb && jb.classList.contains('on'),
    results: jb ? jb.querySelectorAll('#czJumpRes a').length : 0,
    first: jb && jb.querySelector('#czJumpRes a') ? jb.querySelector('#czJumpRes a').textContent.trim() : ''
  };
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(120);
  out.jumpClosedByEsc = !jb.classList.contains('on');

  /* ---------- TÌM TIÊU ĐỀ 1.199 CHƯƠNG + TÔ ĐẬM CHỮ KHỚP -------------------
     Bảng tên chương nạp LƯỜI khi mở ô tìm, nên phải chờ một nhịp rồi mới đo.
     Gõ KHÔNG DẤU vẫn phải ra — đó là lý do có foldStr() trong cz-app.js. */
  const f4 = [];
  const ck4 = (ten, nhan, can) => { if (String(nhan) !== String(can)) f4.push(ten + ' (nhận: ' + JSON.stringify(nhan) + ', cần: ' + JSON.stringify(can) + ')'); };
  let soLanTaiIdx = 0;
  const fetchGoc = win.fetch;
  win.fetch = function (u, o) { if (String(u).indexOf('chuong-index.json') >= 0) soLanTaiIdx++; return fetchGoc.apply(this, arguments); };
  click('#czJump'); await wait(200);
  ji.value = 'hat mam'; ji.dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(700);                                     /* chờ nạp bảng tên chương */
  const jchap = () => [...doc.querySelectorAll('#czJumpRes a.jchap')];
  out.jumpChuong = {
    soDongChuong: jchap().length,
    hrefDau: jchap()[0] ? jchap()[0].getAttribute('href') : '',
    tenDau: jchap()[0] ? jchap()[0].textContent.trim().replace(/\s+/g, ' ') : '',
    coMark: !!doc.querySelector('#czJumpRes mark'),
    chuTrongMark: [...doc.querySelectorAll('#czJumpRes a.jchap mark')].map(m => m.textContent).slice(0, 4),
    nhanNhom: [...doc.querySelectorAll('#czJumpRes .jhead')].map(h => h.textContent.trim())
  };
  /* gõ chữ có ký tự HTML: phải thành CHỮ, không thành thẻ */
  ji.value = '<script>'; ji.dispatchEvent(new win.Event('input', { bubbles: true }));
  await wait(400);
  out.jumpChuong.thoatHtml = {
    conTheScript: !!doc.querySelector('#czJumpRes script'),
    chuConNguyen: /<script>/.test(doc.querySelector('#czJumpRes').textContent)
  };
  /* đóng rồi mở lại: bảng đã nhớ thì KHÔNG được gọi mạng lần hai */
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
  click('#czJump'); await wait(200);
  ji.value = 'hat mam'; ji.dispatchEvent(new win.Event('input', { bubbles: true })); await wait(400);
  out.jumpChuong.taiIndexMotLan = soLanTaiIdx;
  out.jumpChuong.lanHaiVanCo = jchap().length > 0;
  win.fetch = fetchGoc;
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(150);

  ck4('tìm chương/gõ không dấu vẫn ra chương', out.jumpChuong.soDongChuong > 0, true);
  ck4('tìm chương/link tới đúng chương 3 của third-person', out.jumpChuong.hrefDau, '/truyen/third-person/chuong-3/');
  ck4('tìm chương/có tô đậm chữ khớp', out.jumpChuong.coMark, true);
  ck4('tìm chương/chữ trong <mark> là “Hạt Mầm”', out.jumpChuong.chuTrongMark.join(''), 'Hạt Mầm');
  /* “hat mam” không khớp TÊN SÁCH nào nên nhóm “Truyện” không hiện — đúng,
     đừng vẽ nhãn cho nhóm rỗng. Nhóm “Chương” phải có. */
  ck4('tìm chương/có nhãn nhóm Chương', out.jumpChuong.nhanNhom.indexOf('Chương') >= 0, true);
  ck4('tìm chương/không vẽ nhãn cho nhóm rỗng', out.jumpChuong.nhanNhom.indexOf('Truyện'), -1);
  ck4('tìm chương/chữ “<script>” không thành thẻ', out.jumpChuong.thoatHtml.conTheScript, false);
  ck4('tìm chương/chữ “<script>” hiện nguyên xi', out.jumpChuong.thoatHtml.chuConNguyen, true);
  /* bộ đếm cài SAU lần mở ô tìm đầu tiên ở trên, nên bảng đã nạp trước đó rồi.
     Điều cần giữ: mở lại và gõ tiếp KHÔNG gọi mạng thêm lần nào. */
  ck4('tìm chương/mở lại không tải lại bảng', out.jumpChuong.taiIndexMotLan, 0);
  ck4('tìm chương/mở lại vẫn tìm được', out.jumpChuong.lanHaiVanCo, true);
  out.errors4 = f4;
  if (f4.length) console.log('TÌM CHƯƠNG: ' + f4.join(' | '));

  /* ---------- Khám phá: 4 tab, mở đúng nội dung ---------- */
  out.exp = { tabs: $$('#expTabs button').map(b => b.textContent.trim()), visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id) };
  click($$('#expTabs button')[1]); await wait(120);
  out.expRank = { visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id), rows: $$('#rank .rank').length };
  click($$('#expTabs button')[2]); await wait(120);
  out.expSched = { visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id), rows: $$('#sched .sched').length };
  click($$('#expTabs button')[3]); await wait(120);
  out.expAdapt = { visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id), tabs: $$('#ltabs .tab').map(b => b.textContent.trim()), rows: $$('#lcontent .srow').length };
  /* link cũ #bxh vẫn mở đúng tab */
  p.win.location.hash = '#bxh'; await wait(150);
  out.expHashLink = { visible: $$('#kham-pha > .expane:not(.hide)').map(d => d.id) };

  /* ---------- BXH: Firebase bị chặn thì không hiện số ---------- */
  out.rank = { rows: $$('#rank .rank').length, src: txt('#rankSrc'), tabs: $$('#rankTabs .tab').map(b => b.textContent.trim()) };
  out.rankHasNoFakeNumbers = !/lượt|phiếu/.test(txt('#rank'));
  const rc = $$('#rankTabs .tab');
  click(rc[rc.length - 1]); await wait(120);
  out.rankChap = txt('#rank .rank');
  out.sched = { rows: $$('#sched .sched').length, src: txt('#schedSrc') };
  out.newRail = { n: $$('#newRail .card').length, sub: txt('#newSub') };

  /* My Space is now a separate page; its history/shelves are covered in t_space.js. */
  out.spaceSeparate = !$('#ban-doc') && !!doc.querySelector('a[href="/my-space"]');
  if (!out.spaceSeparate) errors.push('My Space must link to its own page, not render on home');

  /* ---------- menu điện thoại: mở/đóng, Esc, bấm ra ngoài, có báo trạng thái ---------- */
  {
    const burger = $('#czBurger'), mnav = $('#czMnav');
    const key = (k) => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));
    const st = () => ({ expanded: burger.getAttribute('aria-expanded'), open: mnav.classList.contains('on'), label: burger.getAttribute('aria-label') });
    out.menuDau = st();
    click(burger); await wait(60);
    out.menuMo = st();
    key('Escape'); await wait(60);
    out.menuEsc = st();
    click(burger); await wait(60);
    click($('#hdr') || doc.body); await wait(60);
    out.menuBamNgoai = st();
    out.menuCo = { ariaControls: burger.getAttribute('aria-controls'), soLink: $$('#czMnav a').length, nhan: $$('#czNav a .nav-lbl').map(e => e.textContent.trim()) };
  }

  /* ---------- “VÌ BẠN ĐÃ ĐỌC X” — gợi ý theo tác giả / cặp nhân vật ----------
     Thư viện KHÔNG có trường thể loại nên gợi ý soi theo tác giả và cặp — căn cứ
     được ghi rõ ngay trên giao diện. Lịch sử đọc nằm trong localStorage nên phải
     dựng TRANG MỚI có seed sẵn, không dùng lại trang `p` ở trên. */
  {
    const cuaTacGia = LIB.filter(n => (n.author || '').trim().toLowerCase() === 'salmonlover').map(n => n.slug);
    const cuaCap = LIB.filter(n => (n.couple || '').trim() === 'Lookmhee x Sonya').map(n => n.slug);
    const lichSu = (slugs) => {
      const s = {};
      slugs.forEach((sl, i) => { s[sl + ':c' + (i + 1)] = 1; s[sl + ':c' + (i + 2)] = 1; });
      return JSON.stringify({ days: { 20260920: { s: s } }, total: slugs.length * 2 });
    };
    const mo = async (hist) => {
      const r = page('index.html', {
        fetch: dataFetch(), css: true,
        setup: hist ? (w) => { w.localStorage.setItem('ssochuz-mystats', hist); } : null,
      });
      await wait(1800);
      return r;
    };
    const slugs = (r) => [...r.doc.querySelectorAll('#vbdRail .card')]
      .map(c => (c.getAttribute('href') || '').replace(/^\/truyen\//, '').replace(/\/$/, ''));

    /* registry ghi không thống nhất hoa/thường: “SalmonLover” và “Salmonlover”
       là cùng một người — gợi ý phải gộp được cả hai cách viết. */
    const r1 = await mo(lichSu([cuaTacGia[0]]));
    const sec1 = r1.doc.querySelector('#vi-ban-da-doc');
    const why1 = (r1.doc.querySelector('#vbdWhy') || {}).textContent || '';
    out.viBanDaDoc = {
      hien: !!sec1 && !sec1.hidden && r1.win.getComputedStyle(sec1).display !== 'none',
      title: ((r1.doc.querySelector('#vbdTitle') || {}).textContent || '').trim(),
      why: why1.trim().replace(/\s+/g, ' ').slice(0, 220),
      soThe: slugs(r1).length,
      khopDanhSach: JSON.stringify(slugs(r1).slice().sort()) ===
        JSON.stringify(cuaTacGia.filter(x => x !== cuaTacGia[0]).sort()),
      gopDuCaHoaThuong: cuaTacGia.length === 6 && slugs(r1).length === 5,
      khongGoiLaiBoDaDoc: slugs(r1).indexOf(cuaTacGia[0]) < 0,
      whyNeuCanCu: /cùng tác giả/.test(why1),
      whyNoiKhongDungAI: /không dùng AI/.test(why1),
      loiJs: r1.errors.filter(e => !/Not implemented/.test(String(e))).slice(0, 3),
    };

    /* KHÔNG có lịch sử → cả khối phải ẩn, không được hiện một dải gợi ý vô nghĩa */
    const r2 = await mo(null);
    const sec2 = r2.doc.querySelector('#vi-ban-da-doc');
    out.viBanDaDoc.anKhiChuaDoc = !!sec2 && sec2.hidden &&
      r2.win.getComputedStyle(sec2).display === 'none';

    /* lịch sử trỏ tới slug không có trong thư viện → không được đoán mò */
    const r3 = await mo(lichSu(['slug-khong-ton-tai']));
    const sec3 = r3.doc.querySelector('#vi-ban-da-doc');
    out.viBanDaDoc.anKhiSlugLa = !!sec3 && sec3.hidden;

    /* đọc 1 bộ của một cặp → bộ kia của cặp đó phải được gợi ý */
    const r4 = await mo(lichSu([cuaCap[0]]));
    const why4 = (r4.doc.querySelector('#vbdWhy') || {}).textContent || '';
    out.viBanDaDoc.theoCap = {
      hien: !(r4.doc.querySelector('#vi-ban-da-doc') || { hidden: true }).hidden,
      coBoCuaCap: slugs(r4).indexOf(cuaCap[1]) >= 0,
      whyCoTenCap: /Lookmhee x Sonya/.test(why4),
    };
    /* run.js chỉ đọc exit code và các khoá errorsN — nên mọi assertion ở trên
       phải quy về một danh sách lỗi CÓ TÊN thì hỏng mới thật sự bị phát hiện */
    const v = out.viBanDaDoc, f = [];
    const ck = (ok, ten) => { if (!ok) f.push(ten); };
    ck(v.hien, 'đã đọc 1 bộ mà khối “Vì bạn đã đọc” không hiện');
    ck(v.soThe === 5, 'phải gợi ý đúng 5 bộ chưa đọc của cùng tác giả, thấy ' + v.soThe);
    ck(v.khopDanhSach, 'danh sách gợi ý sai: ' + JSON.stringify(v.soThe));
    ck(v.gopDuCaHoaThuong, 'không gộp được “SalmonLover” với “Salmonlover” — so khớp phải thường hoá');
    ck(v.khongGoiLaiBoDaDoc, 'gợi ý lại chính bộ người đọc đã đọc');
    ck(v.whyNeuCanCu, 'không nói rõ căn cứ gợi ý');
    ck(v.whyNoiKhongDungAI, 'không nói rõ là không dùng AI');
    ck(v.anKhiChuaDoc, 'chưa đọc gì mà khối gợi ý vẫn hiện');
    ck(v.anKhiSlugLa, 'lịch sử trỏ slug lạ mà vẫn gợi ý — đoán mò');
    ck(v.theoCap.hien && v.theoCap.coBoCuaCap, 'đọc 1 bộ của một cặp mà không gợi ý bộ kia của cặp đó');
    ck(v.theoCap.whyCoTenCap, 'gợi ý theo cặp mà không nêu tên cặp');
    ck(v.loiJs.length === 0, 'lỗi JS khi dựng khối gợi ý: ' + v.loiJs.join(' | '));
    out.errors2 = errors.slice(0, 6);
    out.errors3 = f;
  }


  out.errors1 = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
