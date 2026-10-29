/* ============================================================================
   Kiểm thử HERO BANNER DÙNG CHUNG (src/cz-hero.js — khối “Nổi bật hôm nay”)
   ----------------------------------------------------------------------------
   Vì sao có bài này: hero vừa đổi từ “thẻ dọc có áp phích bên phải” sang banner
   full-bleed dùng chung một component, nên phải khoá lại đúng những thứ dễ hỏng
   lặng lẽ (không có lỗi JS, chỉ là hành vi/aria sai):

     1. TRANG THẬT (index.html): ảnh nền full-bleed nằm trong .hb-media, gradient
        .hb-scrim phủ lên, ảnh đầu tải ưu tiên (src + fetchpriority=high) còn ảnh
        sau để data-src (không tải sẵn 5 ảnh ngay lượt đầu); dải thumbnail và dot
        cùng trỏ về đúng slide; đổi slide thì tiêu đề, aria-current, aria-labelledby
        và live region “Mục x / y” phải đổi theo.
     2. BÀN PHÍM: ← → đổi slide khi focus ở trong khối, KHÔNG cướp phím khi đang
        gõ ở ô tìm kiếm, và không dời focus của người dùng.
     3. “LƯU VÀO TỦ” vẫn chạy: bấm trong hero → aria-pressed + nhãn + localStorage.
     4. FALLBACK của component khi nhận props: 1 mục thì không có điều khiển;
        không có mục thì ẩn cả section; thiếu thumbnail thì lấy ảnh nền.
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
  const media = $$('#hero .hb-media .hb-bg');

  /* ---------- 1. CẤU TRÚC BANNER ---------------------------------------- */
  out.cauTruc = {
    coHero: !!hero,
    slides: slides.length,
    dangHien: $$('#stage .slide.on').length,
    anhNen: media.length,
    coGradient: !!$('#hero .hb-scrim'),
    thumb: $$('#hStrip button').length,
    dot: $$('#hDots button').length,
    nutTruocSau: !!$('#hPrev') && !!$('#hNext'),
    nutTamDung: !!$('#hPlay'),
    khongConApPhich: !$('#hero .poster') && !$('#hero .idx'),
    khongConAnhBlurCu: !$('#hero .bg')
  };
  ok(out.cauTruc.slides === 5, 'hero phải có 5 slide', out.cauTruc.slides);
  ok(out.cauTruc.dangHien === 1, 'chỉ đúng 1 slide hiện tại một lúc', out.cauTruc.dangHien);
  ok(out.cauTruc.anhNen === out.cauTruc.slides, 'mỗi slide phải có một ảnh nền full-bleed');
  ok(out.cauTruc.coGradient, 'thiếu lớp gradient .hb-scrim ⇒ chữ có thể không đọc được trên ảnh');
  ok(out.cauTruc.thumb === 5 && out.cauTruc.dot === 5, 'thumbnail/dot phải đủ 5 mục');
  ok(out.cauTruc.nutTruocSau && out.cauTruc.nutTamDung, 'thiếu nút trước/sau hoặc nút tạm dừng');
  ok(out.cauTruc.khongConApPhich, 'vẫn còn markup áp phích cũ (.poster/.idx) trong hero');
  ok(out.cauTruc.khongConAnhBlurCu, 'vẫn còn .bg (nền blur cũ) trong hero');

  /* ảnh: mục đầu tải ưu tiên, các mục sau để dành (data-src) */
  const first = media[0] || {}, second = media[1] || {}, last = media[media.length - 1] || {};
  out.anh = {
    dauCoSrc: !!first.getAttribute && !!first.getAttribute('src'),
    dauUuTien: first.getAttribute && first.getAttribute('fetchpriority') === 'high',
    coKichThuoc: first.getAttribute && !!first.getAttribute('width') && !!first.getAttribute('height'),
    altTrangTri: first.getAttribute && first.getAttribute('alt') === '',
    /* mục kế được nạp sẵn để chuyển slide không bị trống, các mục xa thì chưa */
    keDuocNapSan: !!second.getAttribute && !!second.getAttribute('src'),
    xaChuaTai: !!last.getAttribute && !last.getAttribute('src') && !!last.getAttribute('data-src')
  };
  ok(out.anh.dauCoSrc && out.anh.dauUuTien, 'ảnh nền đầu tiên phải có src + fetchpriority="high"');
  ok(out.anh.coKichThuoc, 'ảnh nền phải có width/height để không nhảy bố cục (CLS)');
  ok(out.anh.altTrangTri, 'ảnh nền là ảnh trang trí ⇒ alt phải rỗng');
  ok(out.anh.keDuocNapSan, 'ảnh của mục kế phải được nạp sẵn để chuyển slide không trống');
  ok(out.anh.xaChuaTai, 'các mục ở xa KHÔNG được tải ngay (phải để data-src)');

  /* ---------- 2. ĐỔI SLIDE: tiêu đề / aria / live region ---------------- */
  const titleOf = k => (($$('#stage .slide')[k] || {}).querySelector ? $$('#stage .slide')[k].querySelector('h1').textContent.trim() : '');
  const truoc = titleOf(0), sau = titleOf(1);
  click($('#hNext'));
  await wait(80);
  out.doiSlide = {
    on: $$('#stage .slide.on').length,
    tieuDe: ($('#stage .slide.on h1') || {}).textContent.trim(),
    laballedby: hero.getAttribute('aria-labelledby'),
    h1ActiveId: ($('#stage .slide.on h1') || {}).id,
    live: ($('#hbLive') || {}).textContent,
    ariaAnSlideKhac: $$('#stage .slide').filter((s, i) => s.getAttribute('aria-hidden') === 'true').length,
    anhOn: $$('#hero .hb-media .hb-bg.on').length,
    currentThumb: $$('#hStrip button[aria-current="true"]').length,
    selectedDot: $$('#hDots button[aria-selected="true"]').length
  };
  ok(out.doiSlide.on === 1 && out.doiSlide.tieuDe === sau && sau !== truoc, 'bấm “sau” phải đổi đúng slide');
  ok(out.doiSlide.laballedby === out.doiSlide.h1ActiveId, 'aria-labelledby của section phải trỏ tiêu đề slide đang hiện');
  ok(/^Mục 2 \/ 5/.test(out.doiSlide.live), 'live region phải đọc “Mục 2 / 5 …”', out.doiSlide.live);
  ok(out.doiSlide.ariaAnSlideKhac === 4, 'các slide không hiện phải aria-hidden (trình đọc màn hình không đọc nhầm)');
  ok(out.doiSlide.anhOn === 1, 'chỉ ảnh của slide đang hiện được bật opacity');
  ok(out.doiSlide.currentThumb === 1 && out.doiSlide.selectedDot === 1, 'aria-current/aria-selected phải đúng một mục');

  /* bấm thumbnail thứ 3 */
  click($$('#hStrip button')[2]);
  await wait(80);
  out.bamThumb = {
    tieuDe: ($('#stage .slide.on h1') || {}).textContent.trim(),
    dung: (($('#stage .slide.on h1') || {}).textContent || '').trim() === titleOf(2)
  };
  ok(out.bamThumb.dung, 'bấm thumbnail phải mở đúng truyện');

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

  /* đang gõ ở ô tìm kiếm thì phím ← → không được đổi slide */
  const q = $('#q');
  const beforeTyping = ($('#stage .slide.on h1') || {}).textContent.trim();
  q.focus();
  q.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait(50);
  out.phimKhiDangGo = (($('#stage .slide.on h1') || {}).textContent || '').trim() === beforeTyping;
  ok(out.phimKhiDangGo, 'phím ← → trong ô nhập không được cướp để đổi slide');

  /* ---------- 4. “LƯU VÀO TỦ” VẪN CHẠY ---------------------------------- */
  const shelfBtn = $('#stage .slide.on [data-hb-act="1"]');
  const slug = (function () {
    const href = ($('#stage .slide.on h1 a') || {}).getAttribute ? $('#stage .slide.on h1 a').getAttribute('href') : '';
    return String(href || '').replace(/^\/truyen\//, '').replace(/\/$/, '');
  })();
  out.truocKhiLuu = { coNut: !!shelfBtn, pressed: shelfBtn && shelfBtn.getAttribute('aria-pressed') };
  if (shelfBtn) click(shelfBtn);
  await wait(60);
  out.sauKhiLuu = {
    pressed: shelfBtn && shelfBtn.getAttribute('aria-pressed'),
    nhan: shelfBtn && shelfBtn.textContent.trim(),
    ariaNhan: shelfBtn && shelfBtn.getAttribute('aria-label'),
    trongMay: (function () { try { return (win.localStorage.getItem('ssochuz-shelf') || '') + (win.localStorage.getItem('ssochuz-shelves') || ''); } catch (e) { return ''; } })()
  };
  ok(out.truocKhiLuu.coNut, 'hero phải còn nút “Lưu vào tủ”');
  ok(out.sauKhiLuu.pressed === 'true' && out.sauKhiLuu.nhan === 'Đã lưu', 'bấm Lưu phải đổi aria-pressed + nhãn', JSON.stringify(out.sauKhiLuu));
  ok(out.sauKhiLuu.ariaNhan === 'Đã lưu', 'aria-label của nút lưu phải đổi theo trạng thái', out.sauKhiLuu.ariaNhan);
  ok(out.sauKhiLuu.trongMay.indexOf(slug) >= 0, 'tủ truyện trong máy phải có slug vừa lưu', slug);

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
    coNutTruoc: !mot.root.querySelector('[data-hb-prev]').hidden,
    coNutSau: !mot.root.querySelector('[data-hb-next]').hidden,
    coDot: !mot.root.querySelector('.dots').hidden,
    coThumb: !mot.root.querySelector('.strip').hidden,
    thumbLayAnhNen: (function () {
      const im = mot.root.querySelector('.strip img');
      return !!im && im.getAttribute('src') === 'https://example.test/anh-1.jpg';
    })()
  };
  ok(out.motMuc.slides === 1, 'props 1 mục phải dựng đúng 1 slide');
  ok(!out.motMuc.coNutTruoc && !out.motMuc.coNutSau && !out.motMuc.coDot && !out.motMuc.coThumb,
    '1 mục thì KHÔNG được có nút trước/sau, dot hay dải thumbnail', JSON.stringify(out.motMuc));
  ok(out.motMuc.thumbLayAnhNen, 'thiếu thumbnail thì phải lấy ảnh nền làm thumbnail');

  const rong = mount({ items: [] });
  out.rong = { an: !!rong.root.hidden, rongRuot: rong.root.innerHTML === '' };
  ok(out.rong.an && out.rong.rongRuot, 'props rỗng thì ẩn cả section, không để khối trắng');

  /* nhiều mục: điều khiển quay lại, và đổi slide bằng dot của component mới */
  const nhieu = mount({ items: [makeItem(1), makeItem(2), makeItem(3)] });
  const dot2 = nhieu.root.querySelectorAll('.dots button')[2];
  if (dot2) dot2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(50);
  out.nhieuMuc = {
    slides: nhieu.root.querySelectorAll('.slide').length,
    dangHien: nhieu.root.querySelectorAll('.slide.on').length,
    tieuDe: (nhieu.root.querySelector('.slide.on h1') || {}).textContent,
    live: (nhieu.root.querySelector('#hbLive') || {}).textContent
  };
  ok(out.nhieuMuc.slides === 3 && out.nhieuMuc.dangHien === 1, 'nhiều mục: đúng 3 slide, 1 hiện');
  ok(out.nhieuMuc.tieuDe === 'Truyện 3', 'bấm dot phải mở đúng mục', out.nhieuMuc.tieuDe);
  ok(out.nhieuMuc.live === 'Mục 3 / 3: Truyện 3', 'live region của component phải đúng', out.nhieuMuc.live);

  /* dọn: component thứ hai cũng đặt id cũ (hPrev…) nên phải destroy trước khi
     bài kiểm tra khác dùng lại trang */
  if (mot.api && mot.api.destroy) mot.api.destroy();
  if (nhieu.api && nhieu.api.destroy) nhieu.api.destroy();

  out.errors0 = errors.slice(0, 5);
  ok(!out.errors0.length, 'trang chủ không được phát sinh lỗi JS', JSON.stringify(out.errors0));

  console.log(JSON.stringify(out, null, 1));
  console.log(bad.length ? 'CÒN ' + bad.length + ' LỖI HERO BANNER:\n - ' + bad.join('\n - ') : 'Hero banner đạt hết');
  process.exit(bad.length ? 1 : 0);
})();
