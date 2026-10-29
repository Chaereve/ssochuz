/* ============================================================================
   Kiểm thử HERO DÙNG CHUNG (src/cz-hero.js — khối “Nổi bật hôm nay”)
   ----------------------------------------------------------------------------
   Hero đã đổi từ banner full-bleed (phủ ảnh bìa dọc lên khung ngang ⇒ nhoè) sang
   hướng “BỘ BÀI”: 5 bìa xoè thành quạt, bìa đang chọn là tâm và là điều hướng.
   Bài này khoá lại đúng những thứ dễ hỏng lặng lẽ (không có lỗi JS, chỉ là
   hành vi/aria/bố cục sai):

     1. CẤU TRÚC: 5 slide chữ + 1 quạt 5 bìa; chỉ 1 slide hiện; bìa
        đang chọn mang aria-current và nằm đúng tâm (data-pos="0"); các bìa khác
        xếp quanh nó theo khoảng cách 1..4; KHÔNG còn lớp ảnh nền full-bleed cũ.
     2. ĐỔI TRUYỆN: bấm bìa / nút sau đều đổi tiêu đề, aria-labelledby,
        aria-current, số “02 / 05”, nhãn “số · tác giả” và live region — kể cả
        quạt phải xếp lại (bìa vừa chọn về giữa).
     3. BÀN PHÍM: ← → chỉ đổi khi focus ở trong khối, không dời focus, đang gõ ở
        ô tìm kiếm thì không cướp phím.
     4. NÚT “i”: thay nút lưu bằng link icon 44px sang trang thông tin truyện
        (chữ nằm trong aria-label, không phải nút chữ).
     5. ẢNH: bìa đầu tải ưu tiên, các bìa sau để lazy ⇒ không tải 5 ảnh cùng lúc
        ngay lượt đầu; mọi ảnh bìa là ảnh trang trí (alt rỗng, tên nằm ở nhãn nút).
     5. NỀN: mỗi truyện một lớp .hb-bg (bìa ngang mờ hoặc gradient lấy từ bìa)
        + .veil nửa gradient; và thanh điều khiển GỘP dưới quạt: ‹ · số đếm · tác giả · › · ⏸.
     6. FALLBACK của component: 1 mục ⇒ không quạt/thanh điều khiển/nút; 0 mục ⇒ ẩn cả
        section; thiếu thumbnail ⇒ lấy backgroundImage; destroy() gỡ sạch
        listener (mount lại không bị cộng dồn).
   ========================================================================== */
const { page, dataFetch } = require('./mk');

const wait = ms => new Promise(r => setTimeout(r, ms));
const bad = [];
const ok = (cond, msg, extra) => { if (!cond) bad.push(msg + (extra ? ' → ' + extra : '')); };

(async () => {
  const out = {};
  const p = page('index.html', { fetch: dataFetch() });
  const { win, doc, errors } = p;
  const $ = s => doc.querySelector(s);
  const $$ = s => [...doc.querySelectorAll(s)];
  const click = el => { if (el) el.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };
  await wait(900);

  const hero = $('#hero');
  const slides = $$('#stage .slide');
  const covers = $$('#hero .coverbtn');
  const fanbar = $('#hero .fanbar');

  /* ---------- 1. CẤU TRÚC “BỘ BÀI” -------------------------------------- */
  out.cauTruc = {
    coHero: !!hero,
    slides: slides.length,
    dangHien: $$('#stage .slide.on').length,
    bia: covers.length,
    thanhGop: !!fanbar,
    nutTruocSau: !!$('#hPrev') && !!$('#hNext'),
    nutTamDung: !!$('#hPlay'),
    dem: ($('#hCount') || {}).textContent,
    /* vòng 8: bỏ vạch ticks + bỏ tên tác giả (đã có trong kệ nhãn); ‹ › tách ra
       hai MÉP quạt, số đếm + ⏸ gom vào góc trên-phải */
    mepTrai: !!$('#hero .fan .arrow.edge.prev'),
    mepPhai: !!$('#hero .fan .arrow.edge.next'),
    conTicks: !!$('#hTicks') || !!$('#hero .ticks'),
    conTenTacGia: !!$('#hero .fanbar .who'),
    conAnhNenFullBleed: !!$('#hero .hb-media') || !!$('#hero .hb-scrim') || !!$('#hero .hb-bg')
  };
  ok(out.cauTruc.slides === 5, 'hero phải có 5 slide chữ', out.cauTruc.slides);
  ok(out.cauTruc.dangHien === 1, 'chỉ đúng 1 slide hiện tại một lúc', out.cauTruc.dangHien);
  ok(out.cauTruc.bia === 5, 'quạt phải có đủ 5 bìa', out.cauTruc.bia);
  ok(out.cauTruc.thanhGop, 'phải có thanh điều khiển gộp (.fanbar) dưới quạt');
  ok(!$('#hTicks') && !$('#hero .ticks'), 'không còn 5 vạch ticks rời (đã gộp vào .fanbar)');
  ok(out.cauTruc.nutTruocSau && out.cauTruc.nutTamDung, 'thiếu nút trước/sau hoặc nút tạm dừng');
  ok(/^01 \/ 05$/.test(out.cauTruc.dem || ''), 'số đếm phải là “01 / 05”', out.cauTruc.dem);
  ok(out.cauTruc.mepTrai && out.cauTruc.mepPhai, '‹ › phải nằm ở hai mép quạt');
  ok(!out.cauTruc.conTicks, 'không được quay lại 5 vạch ticks');
  ok(!out.cauTruc.conTenTacGia, 'tên tác giả không lặp lại ở cụm điều khiển (đã có trong kệ nhãn)');
  ok(!out.cauTruc.conAnhNenFullBleed, 'vẫn còn lớp ảnh nền full-bleed của bản cũ trong hero');

  /* ---------- 1b. “KỆ NHÃN”: badge trạng thái + lưới thông tin -------------
     C2 đã chốt: bỏ nhãn mục, trạng thái thành badge “con dấu” đứng một dòng,
     thông tin thành lưới dt/dd (CHƯƠNG · TÁC GIẢ · [COUPLE] · CẬP NHẬT), ô nào
     không có dữ liệu thì không dựng, “Có mật mã” nằm trong nhãn nút. */
  const active = $('#stage .slide.on');
  const cells = $$('#stage .slide.on .spec .c');
  out.keNhan = {
    badge: (active.querySelector('.head .hb-st') || {}).textContent || '',
    coHead: !!active.querySelector('.head .hb-st'),
    soOTreSlideDau: cells.length,
    nhanO: cells.map(c => (c.querySelector('dt') || {}).textContent),
    giaTriO: cells.map(c => (c.querySelector('dd') || {}).textContent),
    eyebrowConLai: $$('#hero .eyebrow').length,
    chuongLapDonVi: $$('#hero .spec dd').some(d => /chương/i.test(d.textContent || '')),
    b18: $$('#hero .hb-b18').length,
    chipMatMa: /Có mật mã/.test(hero.innerHTML),
    ctaMatMa: /Nhập mật mã để đọc/.test(hero.innerHTML),
    soOTreSlide3: $$('#stage .slide')[2].querySelectorAll('.spec .c').length
  };
  ok(out.keNhan.coHead && out.keNhan.badge.length > 0,
    'slide phải có badge trạng thái trong .head', JSON.stringify(out.keNhan.badge));
  ok(out.keNhan.eyebrowConLai === 0, 'hero không còn nhãn mục (eyebrow)', out.keNhan.eyebrowConLai);
  ok(out.keNhan.soOTreSlideDau >= 3 && out.keNhan.soOTreSlideDau <= 4,
    'kệ nhãn phải có 3–4 ô', out.keNhan.soOTreSlideDau);
  ok(out.keNhan.nhanO[0] === 'Chương' && /^\d+$/.test(out.keNhan.giaTriO[0] || ''),
    'ô đầu là CHƯƠNG + con số thuần', out.keNhan.nhanO.join(',') + ' / ' + out.keNhan.giaTriO.join(','));
  ok(!out.keNhan.chuongLapDonVi, 'ô chương không được lặp lại chữ “chương” (nhãn đã nói đơn vị)');
  ok(out.keNhan.soOTreSlide3 === 3, 'truyện không có couple phải bỏ ô COUPLE', out.keNhan.soOTreSlide3);
  ok(out.keNhan.b18 >= 1, 'truyện 18+ phải có chip 18+ (.hb-b18)');
  ok(!out.keNhan.chipMatMa && out.keNhan.ctaMatMa,
    '“Có mật mã” phải nằm trong NHÃN NÚT, không phải chip riêng');

  /* bìa đang chọn ở tâm, 4 bìa còn lại xếp quanh theo khoảng cách 1..4 */
  const posOf = b => b.getAttribute('data-pos');
  out.quat = {
    dangChon: covers.filter(b => b.getAttribute('aria-current') === 'true').length,
    pos: covers.map(posOf),
    tam: (covers.find(b => b.classList.contains('on')) || {}).getAttribute
      ? posOf(covers.find(b => b.classList.contains('on'))) : null,
    bamDuoc: covers.every(b => b.tagName === 'BUTTON'),
    coNhan: covers.every(b => /^Xem: /.test(b.getAttribute('aria-label') || '')),
    altRong: covers.every(b => { const i = b.querySelector('img'); return !i || i.getAttribute('alt') === ''; })
  };
  ok(out.quat.dangChon === 1, 'đúng một bìa mang aria-current', out.quat.dangChon);
  ok(out.quat.tam === '0', 'bìa đang chọn phải ở tâm (data-pos="0")', out.quat.tam);
  ok(new Set(out.quat.pos).size === 5 && out.quat.pos.every(v => /^[0-4]$/.test(v)),
    '5 bìa phải nằm ở 5 vị trí khác nhau 0..4', out.quat.pos.join(','));
  ok(out.quat.bamDuoc && out.quat.coNhan, 'mỗi bìa phải là <button> có nhãn “Xem: …”');
  ok(out.quat.altRong, 'ảnh bìa là ảnh trang trí (tên truyện đã ở nhãn nút) ⇒ alt phải rỗng');

  /* ảnh: bìa đầu tải ưu tiên, các bìa sau lazy */
  const first = covers[0].querySelector('img'), rest = covers.slice(1).map(b => b.querySelector('img'));
  out.anh = {
    dauUuTien: !!first && first.getAttribute('fetchpriority') === 'high',
    conLaiLazy: rest.every(i => i && i.getAttribute('loading') === 'lazy'),
    coSrc: covers.every(b => { const i = b.querySelector('img'); return !!i && !!i.getAttribute('src'); })
  };
  ok(out.anh.coSrc, 'mọi bìa phải có <img src>');
  ok(out.anh.dauUuTien, 'bìa đầu tiên phải có fetchpriority="high"');
  ok(out.anh.conLaiLazy, 'các bìa còn lại phải loading="lazy" (không tải 5 ảnh cùng lúc)');

  /* ---------- 2. ĐỔI TRUYỆN --------------------------------------------- */
  const titleOf = k => (slides[k].querySelector('h1').textContent || '').trim();
  const truoc = titleOf(0), sau = titleOf(1);
  click($('#hNext'));
  await wait(80);
  out.doiSlide = {
    on: $$('#stage .slide.on').length,
    tieuDe: ($('#stage .slide.on h1') || {}).textContent.trim(),
    labelledby: hero.getAttribute('aria-labelledby'),
    h1ActiveId: ($('#stage .slide.on h1') || {}).id,
    live: ($('#hbLive') || {}).textContent,
    ariaAnSlideKhac: slides.filter(s => s.getAttribute('aria-hidden') === 'true').length,
    currentBia: covers.filter(b => b.getAttribute('aria-current') === 'true').length,
    thanhDem: ($('#hCount') || {}).textContent,
    dem: ($('#hCount') || {}).textContent,
    soO: ($('#hCount') || {}).textContent,
    tam: posOf(covers.find(b => b.classList.contains('on')) || covers[0])
  };
  ok(out.doiSlide.on === 1 && out.doiSlide.tieuDe === sau && sau !== truoc, 'bấm “sau” phải đổi đúng slide');
  ok(out.doiSlide.labelledby === out.doiSlide.h1ActiveId, 'aria-labelledby phải trỏ tiêu đề slide đang hiện');
  ok(/^Mục 2 \/ 5/.test(out.doiSlide.live), 'live region phải đọc “Mục 2 / 5 …”', out.doiSlide.live);
  ok(out.doiSlide.ariaAnSlideKhac === 4, '4 slide không hiện phải aria-hidden');
  ok(out.doiSlide.currentBia === 1, 'aria-current phải đúng một bìa');
  ok(/^02 \/ 05$/.test(out.doiSlide.dem || ''), 'số đếm phải cập nhật “02 / 05”', out.doiSlide.dem);
  ok(out.doiSlide.tam === '0', 'sau khi đổi, bìa vừa chọn phải về tâm quạt', out.doiSlide.tam);
  ok(/^02 \/ 05$/.test(out.doiSlide.thanhDem || ''), 'thanh gộp phải cập nhật số đếm “02 / 05”', out.doiSlide.thanhDem);

  /* bấm bìa thứ 3 (quạt) */
  click(covers[2]);
  await wait(80);
  out.bamBia = {
    tieuDe: ($('#stage .slide.on h1') || {}).textContent.trim(),
    dung: (($('#stage .slide.on h1') || {}).textContent || '').trim() === titleOf(2),
    h1ActiveId: ($('#stage .slide.on h1') || {}).id
  };
  ok(out.bamBia.dung, 'bấm bìa trong quạt phải mở đúng truyện', out.bamBia.tieuDe);

  /* bấm bìa thứ 5 (quạt là cách chọn chính, không còn ticks) */
  click(covers[4]);
  await wait(80);
  ok((($('#stage .slide.on h1') || {}).textContent || '').trim() === titleOf(4),
    'bấm bìa ngoài cùng phải mở đúng truyện');

  /* ---------- 3. BÀN PHÍM ------------------------------------------------- */
  const nut = $('#hNext');
  nut.focus();
  const before = ($('#stage .slide.on h1') || {}).textContent.trim();
  nut.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait(60);
  out.phim = {
    doi: (($('#stage .slide.on h1') || {}).textContent || '').trim() !== before,
    focusGiuNguyen: doc.activeElement === nut,
    live: ($('#hbLive') || {}).textContent
  };
  ok(out.phim.doi, '← → phải đổi slide khi focus ở trong hero');
  ok(out.phim.focusGiuNguyen, 'không được dời focus của người dùng khi đổi slide');
  ok(/^Mục \d+ \/ 5/.test(out.phim.live), 'live region phải cập nhật sau khi đổi bằng bàn phím', out.phim.live);

  const q = $('#q');
  const beforeTyping = ($('#stage .slide.on h1') || {}).textContent.trim();
  q.focus();
  q.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait(50);
  out.phimKhiDangGo = (($('#stage .slide.on h1') || {}).textContent || '').trim() === beforeTyping;
  ok(out.phimKhiDangGo, 'phím ← → trong ô nhập không được cướp để đổi slide');

  /* ---------- 4. NÚT “i” THÔNG TIN TRUYỆN (thay nút lưu) ----------------- */
  const infoBtn = $('#stage .slide.on .btn-row a[aria-label="Thông tin truyện"]');
  const slug = (function () {
    const href = ($('#stage .slide.on h1 a') || {}).getAttribute ? $('#stage .slide.on h1 a').getAttribute('href') : '';
    return String(href || '').replace(/^\/truyen\//, '').replace(/\/$/, '');
  })();
  out.nutInfo = {
    co: !!infoBtn,
    nhan: infoBtn && infoBtn.getAttribute('aria-label'),
    href: infoBtn && infoBtn.getAttribute('href'),
    coIcon: !!(infoBtn && infoBtn.querySelector('svg.i')),
    chuTrongNut: infoBtn && infoBtn.textContent.trim(),
    conNutLuu: !!$('#hero [aria-label="Lưu vào tủ"]')
  };
  ok(out.nutInfo.co, 'hero phải có nút “i” thông tin truyện');
  ok(out.nutInfo.nhan === 'Thông tin truyện', 'nút “i” phải có nhãn cho trình đọc màn hình', out.nutInfo.nhan);
  ok(out.nutInfo.href === '/truyen/' + slug + '/', 'nút “i” phải dẫn về trang truyện', out.nutInfo.href);
  ok(out.nutInfo.coIcon && !!$('#stage .slide.on .btn-row a[aria-label="Thông tin truyện"] .hb-cta-lbl'),
    'nút “i” là icon tròn; chữ nằm trong .hb-cta-lbl (CSS ẩn) + aria-label cho trình đọc màn hình');
  ok(!out.nutInfo.conNutLuu, 'nút “Lưu vào tủ” đã được thay bằng nút “i”');

  /* ---------- 4b. NỀN: bìa ngang mờ / gradient lấy từ bìa ---------------- */
  const bgs = $$('#hero .hb-bgs .hb-scene');
  out.nen = {
    soLop: bgs.length,
    dangHien: bgs.filter(b => b.classList.contains('on')).length,
    coVeil: bgs.every(b => !!b.querySelector('.veil')),
    coWash: bgs.every(b => !!b.querySelector('.wash')),
    anhNgang: bgs.filter(b => !!b.querySelector('img.pic')).length,
    khongAnhNen: $$('#hero .hb-media').length
  };
  ok(out.nen.soLop === 5, 'mỗi truyện phải có một lớp nền riêng', out.nen.soLop);
  ok(out.nen.dangHien === 1, 'chỉ đúng một lớp nền hiện tại một lúc', out.nen.dangHien);
  ok(out.nen.coVeil && out.nen.coWash, 'lớp nền phải có .veil (nửa gradient) và .wash (màu bìa)');
  ok(!out.nen.khongAnhNen, 'không được quay lại lớp ảnh nền full-bleed cũ');

  /* ---------- 4c. ĐIỀU KHIỂN: một hàng, số đếm có phần “đang xem” -------- */
  const bar = $('#hero .fanbar');
  const kids = bar ? [...bar.children].map(n => n.className.split(' ')[0]) : [];
  out.dieuKhien = {
    thuTu: kids,
    soDemHtml: ($('#hCount') || {}).innerHTML,
    soNut: $$('#hero .arrow').length,
    nutMep: $$('#hero .fan .arrow.edge').length,
    trongQuat: !!(bar && bar.closest('.fan')),
    cotChuSach: !!$('#hero .hb-col .foot')
  };
  ok(out.dieuKhien.thuTu.join(',') === 'count,arrow',
    'cụm góc chỉ còn số đếm + ⏸ (không ticks, không tên tác giả)', out.dieuKhien.thuTu.join(','));
  ok(out.dieuKhien.nutMep === 2, 'phải có đúng 2 nút chuyển ở hai mép quạt', out.dieuKhien.nutMep);
  ok(out.dieuKhien.soNut === 3, 'phải có đúng 3 nút ‹ › ⏸', out.dieuKhien.soNut);
  ok(out.dieuKhien.trongQuat, 'cụm điều khiển phải nằm trong quạt');
  ok(!out.dieuKhien.cotChuSach, 'cột chữ không còn hàng điều khiển riêng');
  ok(/<b>01<\/b>/.test(out.dieuKhien.soDemHtml || ''),
    'số đếm phải tách phần đang xem (<b>01</b> / 05) để in đậm như các số khác', out.dieuKhien.soDemHtml);

  /* ---------- 5. COMPONENT NHẬN PROPS: fallback ------------------------- */
  const CZ = win.CZ;
  ok(typeof CZ.heroBanner === 'function', 'thiếu CZ.heroBanner (component dùng chung)');

  function makeItem(t) {
    return {
      id: 'thu-' + t,
      title: 'Truyện ' + t,
      eyebrow: 'Nổi bật hôm nay',
      description: 'Mô tả ngắn.',
      backgroundImage: { src: 'https://example.test/anh-' + t + '.jpg', alt: '' },
      caption: 'Tác giả ' + t,
      primaryCta: { label: 'Đọc từ đầu', href: '/truyen/thu-' + t + '/' }
    };
  }
  function mount(props) {
    const root = doc.createElement('section');
    root.id = 'heroThu';
    doc.body.appendChild(root);
    return { root: root, api: CZ.heroBanner(root, props) };
  }

  const mot = mount({ items: [makeItem(1)] });
  out.motMuc = {
    slides: mot.root.querySelectorAll('.slide').length,
    bia: mot.root.querySelectorAll('.coverbtn').length,
    quatAn: !!mot.root.querySelector('.fan').hidden,
    thanhAn: !mot.root.querySelector('.fan') || !!mot.root.querySelector('.fan').hidden,
    coNutTruoc: !mot.root.querySelector('[data-hb-prev]').hidden,
    coNutSau: !mot.root.querySelector('[data-hb-next]').hidden,
    playAn: !!mot.root.querySelector('[data-hb-play]').hidden,
    biaLayAnhNen: (function () {
      const im = mot.root.querySelector('.coverbtn img');
      return !!im && im.getAttribute('src') === 'https://example.test/anh-1.jpg';
    })()
  };
  ok(out.motMuc.slides === 1, 'props 1 mục phải dựng đúng 1 slide');
  ok(!out.motMuc.coNutTruoc && !out.motMuc.coNutSau, '1 mục thì KHÔNG được có nút trước/sau', JSON.stringify(out.motMuc));
  ok(out.motMuc.quatAn && out.motMuc.thanhAn, '1 mục thì ẩn cả quạt lẫn thanh điều khiển');
  ok(out.motMuc.biaLayAnhNen, 'thiếu thumbnail thì quạt phải lấy backgroundImage làm bìa');

  const rong = mount({ items: [] });
  out.rong = { an: !!rong.root.hidden, rongRuot: rong.root.innerHTML === '' };
  ok(out.rong.an && out.rong.rongRuot, 'props rỗng thì ẩn cả section, không để khối trắng');

  const nhieu = mount({ items: [makeItem(1), makeItem(2), makeItem(3)] });
  const next2 = nhieu.root.querySelector('[data-hb-next]');
  if (next2) {
    next2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    next2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
  await wait(50);
  out.nhieuMuc = {
    slides: nhieu.root.querySelectorAll('.slide').length,
    bia: nhieu.root.querySelectorAll('.coverbtn').length,
    dangHien: nhieu.root.querySelectorAll('.slide.on').length,
    tieuDe: (nhieu.root.querySelector('.slide.on h1') || {}).textContent,
    live: (nhieu.root.querySelector('#hbLive') || {}).textContent
  };
  ok(out.nhieuMuc.slides === 3 && out.nhieuMuc.dangHien === 1, 'nhiều mục: đúng 3 slide, 1 hiện');
  ok(out.nhieuMuc.tieuDe === 'Truyện 3', 'bấm tick phải mở đúng mục', out.nhieuMuc.tieuDe);
  ok(out.nhieuMuc.live === 'Mục 3 / 3: Truyện 3', 'live region của component phải đúng', out.nhieuMuc.live);

  /* destroy(): gỡ listener — mount lại KHÔNG được cộng dồn (bấm 1 lần chỉ tiến 1 mục) */
  const tam = mount({ items: [makeItem(1), makeItem(2), makeItem(3), makeItem(4)] });
  const api2 = CZ.heroBanner(tam.root, { items: [makeItem(1), makeItem(2), makeItem(3), makeItem(4)] });
  tam.root.querySelector('[data-hb-next]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(30);
  out.mountLai = {
    chiTien1: (tam.root.querySelector('.slide.on h1') || {}).textContent === 'Truyện 2'
  };
  ok(out.mountLai.chiTien1, 'mount lại cùng một section không được cộng dồn listener (chỉ tiến 1 mục)', JSON.stringify(out.mountLai));

  if (mot.api && mot.api.destroy) mot.api.destroy();
  if (nhieu.api && nhieu.api.destroy) nhieu.api.destroy();
  if (api2 && api2.destroy) api2.destroy();

  out.errors0 = errors.slice(0, 5);
  ok(!out.errors0.length, 'trang chủ không được phát sinh lỗi JS', JSON.stringify(out.errors0));

  console.log(JSON.stringify(out, null, 1));
  console.log(bad.length ? 'CÒN ' + bad.length + ' LỖI HERO BANNER:\n - ' + bad.join('\n - ') : 'Hero banner đạt hết');
  process.exit(bad.length ? 1 : 0);
})();
