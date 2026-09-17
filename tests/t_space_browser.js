/* Đo THẬT bố cục My Space bằng Chromium — thứ jsdom không làm được.
   ==========================================================================
   jsdom không dàn trang, nên tests/t_space_hero.js chỉ khoá được CẤU TRÚC khiến
   việc lệch không thể xảy ra. Bài này đo toạ độ thật để trả lời thẳng câu hỏi của
   chủ trang ("bị lệch"): tâm vòng tròn có trùng tâm ảnh không, nút đóng có đúng
   mép phải không, mép trái tiêu đề / ô nhập / nút có cùng một đường không.

   Chạy (cần server.py ở cổng 8000 và một binary Chromium):
     python3 server.py &
     CHROMIUM_EXECUTABLE=/path/to/chromium node tests/t_space_browser.js
     LAYOUT_SCREENSHOTS=/tmp/shot CHROMIUM_EXECUTABLE=… node tests/t_space_browser.js

   Hai vòng:
     A. ĐO — 11 cỡ màn hình, chỉ tải trang rồi đo (nhanh, để bắt lệch theo breakpoint)
     B. CHẠY — 1440px và 390px: hồ sơ/ảnh đại diện, lưu trượt thì giữ bản nháp,
        tạo/sửa tủ, riêng tư ↔ công khai, hồ sơ công khai không lộ dữ liệu riêng,
        hộp "Chọn tủ lưu truyện" trên TRANG TRUYỆN (nơi từng mất bo góc và viền
        vì biến --space-* chỉ có trên .space-page)
   Không dùng dịch vụ thật, không ghi production. Phần rút sao đã có
   t_rating_withdraw.js (jsdom) và t_layout_browser.js nên không lặp lại ở đây. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const reg = JSON.parse(fs.readFileSync(path.join(root, 'data/registry.json')), 'utf8');
const slug = reg.lib[0].slug;
const BASE = 'http://localhost:8000';
/* vòng tròn phải lớn hơn ảnh đúng bằng 2×khe, và khe đó đổi theo breakpoint */
const WIDTHS = [1440, 1280, 1024, 834, 768, 700, 640, 480, 390, 360, 320];
const shot = (p, name) => {
  if (!process.env.LAYOUT_SCREENSHOTS) return Promise.resolve();
  fs.mkdirSync(process.env.LAYOUT_SCREENSHOTS, { recursive: true });
  return p.screenshot({ path: path.join(process.env.LAYOUT_SCREENSHOTS, name + '.png'), fullPage: true });
};

/* ---- hộp đo: mọi phép căn chỉnh đều quy về "hai mép có trùng nhau không" ---- */
const MEASURE = () => {
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2, right: b.right, bottom: b.bottom }; };
  const pad = (el, side) => parseFloat(getComputedStyle(el)['padding' + side]);
  const q = (s) => document.querySelector(s);
  const hero = q('#spaceHero'), ring = q('#spaceHero .space-hero-ring'), ava = q('#spaceHero .space-hero-avatar');
  const por = q('#spaceHero .space-hero-portrait'), intro = q('#spaceHero .space-intro');
  const side = q('#spaceHero .space-hero-side'), btn = side && side.querySelector('.btn');
  const dlg = q('#shelfDialog'), head = dlg && dlg.querySelector('.space-dialog-head');
  const body = dlg && dlg.querySelector('.space-dialog-body'), foot = dlg && dlg.querySelector('.space-dialog-foot');
  const close = dlg && dlg.querySelector('#closeShelf'), title = dlg && dlg.querySelector('#shelfFormTitle');
  const inp = dlg && dlg.querySelector('#shelfName'), save = dlg && dlg.querySelector('#saveShelf');
  /* mép TRONG của một khối = mép border TRỪ bề rộng viền TRỪ padding: đây là đường mà
     chữ, ô nhập và nút phải cùng nằm trên. Phải trừ cả viền — .space-hero có border 1px
     nên bản cũ (chỉ trừ padding) lệch đúng 1px mỗi bên và làm phép đo sai 2px ở ≤700px. */
  const inner = (el) => el ? {
    left: el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).borderLeftWidth || 0) + pad(el, 'Left'),
    right: el.getBoundingClientRect().right - parseFloat(getComputedStyle(el).borderRightWidth || 0) - pad(el, 'Right')
  } : null;
  return {
    vw: innerWidth, vh: innerHeight, docOverflow: document.documentElement.scrollWidth - innerWidth,
    /* Tràn ngang của cả TRANG có thể đến từ header DÙNG CHUNG (lỗi có sẵn, không thuộc My
       Space) nên tách riêng phần do nội dung trang này: chỉ đếm phần tử ngoài <header>.
       Số đo 17/09/2026 — dải 1021–1199px: khách 91px, đã đăng nhập 48px ở 1024px; trang chủ
       cũng bị. Đây là lỗi có trước, xem §5 của báo cáo kèm theo. */
    contentOverflow: (() => {
      /* phần tử nằm trong một vùng CUỘN RIÊNG (.space-tabs có overflow-x:auto ở ≤600px)
         không thể đẩy rộng cả trang, nên bỏ qua — nếu không sẽ báo nhầm là tràn */
      const inOwnScroller = (el) => {
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
        }
        return false;
      };
      let maxRight = 0, minLeft = 0;
      document.querySelectorAll('body *').forEach((el) => {
        if (el.closest('header#hdr, .mnav')) return;
        const b = el.getBoundingClientRect();
        if (!b.width && !b.height) return;
        if (inOwnScroller(el)) return;
        if (b.right > maxRight) maxRight = b.right;
        if (b.left < minLeft) minLeft = b.left;
      });
      return Math.max(maxRight - innerWidth, -minLeft);
    })(),
    hero: box(hero), ring: box(ring), ava: box(ava), por: box(por), intro: box(intro), side: box(side), sideBtn: box(btn),
    heroInner: inner(hero), heroRadius: hero && getComputedStyle(hero).borderTopLeftRadius,
    ringRadius: ring && getComputedStyle(ring).borderRadius, avaRadius: ava && getComputedStyle(ava).borderRadius,
    /* bề rộng THẬT của chữ trong tiêu đề (khối <div> cha giãn hết chỗ nên đo h2
       sẽ ra cả khoảng trống — phải đo bằng Range mới biết chữ cách nút đóng bao xa) */
    titleTextRight: (() => { const h = q('#shelfFormTitle'); if (!h) return null; const r = document.createRange(); r.selectNodeContents(h); return r.getBoundingClientRect().right; })(),
    bioText: (q('#spaceHero .space-bio') || {}).textContent || '',
    kicker: (q('#spaceHero .space-kicker') || {}).textContent || '',
    dlg: box(dlg), head: box(head), body: box(body), foot: box(foot), close: box(close), title: box(title), inp: box(inp), save: box(save),
    headInner: inner(head), bodyInner: inner(body), footInner: inner(foot),
    /* thân hộp cuộn thì mép phải của ô nhập lùi vào đúng bằng bề rộng thanh cuộn */
    sbw: body ? body.offsetWidth - body.clientWidth : 0,
    bodyScrolls: body ? body.scrollHeight - body.clientHeight : 0,
    dlgRadius: dlg && getComputedStyle(dlg).borderTopLeftRadius,
    dlgJustify: head && getComputedStyle(head).justifyContent,
    dlgAria: dlg && dlg.getAttribute('aria-labelledby'),
    historyNotes: document.querySelectorAll('#space-history .space-note').length,
    statsNotes: document.querySelectorAll('#space-stats .space-note').length,
    filler: document.body.innerText.includes('Một người yêu những câu chuyện'),
    tabs: box(q('.space-tabs')), tabOn: box(q('.space-tabs button.on')),
    count: box(q('#spaceShelfCount')), newBtn: box(q('#openNewShelf'))
  };
};

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  try {
    /* ================= VÒNG A · ĐO Ở 11 CỠ MÀN HÌNH ================= */
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      const p = await ctx.newPage();
      const errors = []; p.on('pageerror', (e) => errors.push(e.message));
      await wireMocks(ctx, p, { shelves: [] });
      await p.goto(BASE + '/my-space.html');
      await p.waitForSelector('#spaceHero .space-hero-ring');
      await p.waitForFunction(() => { const c = document.querySelector('#cloudShelves'); return c && !c.hidden; });
      await p.click('#openNewShelf');
      await p.waitForSelector('#shelfDialog[open] #shelfPicker label');
      const m = await p.evaluate(MEASURE);
      await shot(p, 'space-' + width);

      /* -- 1. vòng tròn ĐỒNG TÂM với ảnh: đây chính là chỗ chủ trang báo "lệch" -- */
      assert.ok(Math.abs(m.ring.cx - m.ava.cx) <= 1, width + 'px: tâm vòng lệch tâm ảnh ' + (m.ring.cx - m.ava.cx).toFixed(1) + 'px ngang');
      assert.ok(Math.abs(m.ring.cy - m.ava.cy) <= 1, width + 'px: tâm vòng lệch tâm ảnh ' + (m.ring.cy - m.ava.cy).toFixed(1) + 'px dọc');
      assert.ok(Math.abs(m.ring.cx - m.por.cx) <= 0.5 && Math.abs(m.ring.cy - m.por.cy) <= 0.5, width + 'px: vòng không lấp đầy hộp ảnh');
      assert.ok(m.ring.w > m.ava.w && m.ring.h > m.ava.h, width + 'px: vòng phải lớn hơn ảnh');
      assert.ok(Math.abs((m.ring.w - m.ava.w) - (m.ring.h - m.ava.h)) <= 0.5, width + 'px: khe vòng–ảnh không đều bốn phía');
      assert.equal(m.ringRadius, '50%', width + 'px: vòng phải tròn');
      assert.equal(m.avaRadius, '50%', width + 'px: ảnh phải tròn');
      /* ảnh không bao giờ được tràn khỏi hộp của nó (lỗi cũ: cột lưới 72px cho ảnh 92px) */
      assert.ok(m.ava.right <= m.por.x + m.por.w + 0.5, width + 'px: ảnh tràn khỏi hộp ảnh');
      /* Khi ảnh và chữ CÙNG HÀNG thì chữ phải nằm ngoài hộp ảnh. Ở cỡ rất nhỏ (~≤340px)
         hero tự xuống hàng (ảnh trên, chữ dưới) — khi đó phép so sánh ngang vô nghĩa,
         phải đòi chữ nằm DƯỚI hộp ảnh. */
      if (m.intro.y < m.por.y + m.por.h - 0.5) {
        assert.ok(m.intro.x >= m.por.x + m.por.w - 0.5, width + 'px: cột chữ đè lên hộp ảnh');
      } else {
        assert.ok(m.intro.y >= m.por.y + m.por.h - 0.5, width + 'px: hero xuống hàng nhưng chữ vẫn chồng lên hộp ảnh');
      }

      /* -- 2. không tràn ngang ở bất kỳ cỡ nào -- */
      /* Header dùng chung từng tràn ở dải ~1021–1199px (đo 17/09/2026: 1024px khách
         91px, đã đăng nhập 48px). Đã sửa ở src/cz.css: ngưỡng thu gọn nav nâng từ
         ≤1020px lên ≤1200px. Vòng A chạy ở 1024px (dải từng tràn) nên siết đo docOverflow
         trực tiếp — chính là phép hồi quy cho lỗi đó; nếu tràn trở lại, bài này đỏ. */
      assert.ok(m.docOverflow <= 1, width + 'px: cả trang (gồm header dùng chung) tràn ngang ' + m.docOverflow + 'px');
      assert.ok(m.contentOverflow <= 1, width + 'px: nội dung My Space tràn ngang ' + m.contentOverflow + 'px');
      assert.ok(m.hero.w <= m.vw + 0.5, width + 'px: hero rộng hơn màn hình');

      /* -- 3. hero là hộp giấy cùng ngôn ngữ với .space-panel -- */
      assert.equal(m.heroRadius, width <= 600 ? '14px' : '18px', width + 'px: bo góc hero');

      /* -- 4. cột thao tác: mép phải nút trùng mép trong của hero; ≤700px thì
            xuống hàng và chiếm trọn bề ngang (nút ≥44px chạm) -- */
      if (m.side) {
        if (width > 700) {
          assert.ok(Math.abs(m.sideBtn.right - m.heroInner.right) <= 1, width + 'px: nút "Chỉnh sửa hồ sơ" cách mép hộp ' + (m.heroInner.right - m.sideBtn.right).toFixed(1) + 'px');
          assert.ok(m.sideBtn.h >= 32, width + 'px: nút thao tác quá thấp');
        } else {
          assert.ok(Math.abs(m.side.w - (m.heroInner.right - m.heroInner.left)) <= 1, width + 'px: cột thao tác không trọn bề ngang khi xuống hàng');
          assert.ok(Math.abs(m.sideBtn.w - m.side.w) <= 1, width + 'px: nút không giãn hết cột');
          assert.ok(m.sideBtn.h >= 40, width + 'px: nút chạm phải ≥40px, đang ' + m.sideBtn.h);
          assert.ok(m.side.y >= m.intro.y + m.intro.h - 1, width + 'px: cột thao tác phải nằm DƯỚI khối chữ');
        }
      }

      /* -- 5. nhãn + chữ: đúng câu chủ trang chốt, không còn câu lấp chỗ -- */
      assert.equal(m.kicker, 'Hồ sơ của bạn', width + 'px: nhãn hero');
      assert.equal(m.historyNotes, 0, width + 'px: ghi chú kỹ thuật ở Lịch sử đọc phải đã bỏ');
      assert.equal(m.statsNotes, 0, width + 'px: ghi chú kỹ thuật ở Thống kê phải đã bỏ');
      assert.equal(m.filler, false, width + 'px: không được còn câu "Một người yêu những câu chuyện."');

      /* -- 6. hàng tiêu đề mục: đếm số tủ và nút "+ Tạo tủ truyện" cùng một hàng -- */
      if (m.count && m.newBtn) {
        const cCy = m.count.cy, bCy = m.newBtn.cy;
        assert.ok(width <= 600 || Math.abs(cCy - bCy) <= 2, width + 'px: bộ đếm lệch tâm nút ' + (cCy - bCy).toFixed(1) + 'px');
      }

      /* -- 7. hộp thoại: đầu / thân / chân, ba mép cùng một đường -- */
      assert.equal(m.dlgJustify, 'space-between', width + 'px: đầu hộp phải đẩy nút đóng sang phải');
      assert.equal(m.dlgAria, 'shelfFormTitle', width + 'px: hộp phải trỏ nhãn vào tiêu đề');
      assert.equal(m.dlgRadius, width <= 700 ? '14px' : '18px', width + 'px: bo góc hộp thoại');
      assert.ok(Math.abs(m.dlg.cx - m.vw / 2) <= 1, width + 'px: hộp thoại không nằm giữa màn hình (lệch ' + (m.dlg.cx - m.vw / 2).toFixed(1) + 'px)');
      /* nút đóng đúng mép phải của ĐẦU hộp (lỗi cũ: dính sát tiêu đề, mép phải bỏ trống) */
      assert.ok(Math.abs(m.close.right - m.headInner.right) <= 1, width + 'px: nút đóng cách mép phải đầu hộp ' + (m.headInner.right - m.close.right).toFixed(1) + 'px');
      assert.ok(m.close.x - m.titleTextRight > 8, width + 'px: nút đóng vẫn dính vào chữ tiêu đề (cách ' + (m.close.x - m.titleTextRight).toFixed(1) + 'px)');
      assert.ok(m.close.w >= 32 && m.close.h >= 32, width + 'px: nút đóng phải ≥32px, đang ' + m.close.w + '×' + m.close.h);
      /* mép trái: tiêu đề, ô nhập, và thân hộp cùng một đường thẳng */
      assert.ok(Math.abs(m.title.x - m.headInner.left) <= 1, width + 'px: tiêu đề lệch mép trái đầu hộp');
      assert.ok(Math.abs(m.inp.x - m.bodyInner.left) <= 1, width + 'px: ô nhập lệch mép trái thân hộp');
      assert.ok(Math.abs(m.title.x - m.inp.x) <= 1, width + 'px: tiêu đề và ô nhập không thẳng hàng dọc');
      /* mép phải ô nhập = mép trong thân hộp trừ thanh cuộn (thân hộp cuộn, đầu thì không) */
      assert.ok(Math.abs(m.inp.right - (m.bodyInner.right - m.sbw)) <= 1.5,
        width + 'px: mép phải ô nhập lệch mép trong thân hộp ' + (m.bodyInner.right - m.sbw - m.inp.right).toFixed(1) + 'px');
      /* chân hộp luôn thấy được, không phải cuộn thân hộp mới tới nút Lưu */
      assert.ok(m.save.bottom <= m.vh + 1, width + 'px: nút "Lưu tủ truyện" nằm ngoài màn hình');
      assert.ok(Math.abs(m.save.right - m.footInner.right) <= 1, width + 'px: nút Lưu không sát mép phải chân hộp');
      assert.ok(m.bodyScrolls > 0, width + 'px: danh sách chọn truyện phải làm thân hộp cuộn được (để kiểm đầu/chân cố định)');
      assert.ok(m.foot.h >= 60, width + 'px: chân hộp quá mỏng, đang ' + m.foot.h);

      /* -- 8. cuộn hết thân hộp thì ĐẦU và CHÂN không được nhúc nhích -- */
      const before = { headTop: m.head.y, footTop: m.foot.y };
      await p.evaluate(() => { const b = document.querySelector('#shelfDialog .space-dialog-body'); b.scrollTop = b.scrollHeight; });
      const after = await p.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { headTop: r('#shelfDialog .space-dialog-head').y, footTop: r('#shelfDialog .space-dialog-foot').y }; });
      assert.ok(Math.abs(after.headTop - before.headTop) <= 0.5, width + 'px: đầu hộp trôi khi cuộn thân');
      assert.ok(Math.abs(after.footTop - before.footTop) <= 0.5, width + 'px: chân hộp trôi khi cuộn thân');

      /* -- 9. giảm chuyển động: hộp thoại và ảnh không được chạy animation -- */
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.evaluate(() => document.querySelector('#shelfDialog').close());
      await p.click('#openNewShelf');
      await p.waitForSelector('#shelfDialog[open]');
      assert.equal(await p.locator('#shelfDialog').evaluate((e) => getComputedStyle(e).animationName), 'none', width + 'px: hộp thoại vẫn chạy animation khi giảm chuyển động');
      await p.emulateMedia({ reducedMotion: 'no-preference' });

      assert.deepEqual(errors, []);
      await ctx.close();
      console.log('ĐO ' + String(width).padStart(4) + 'px: vòng đồng tâm ảnh (≤1px), không tràn ngang, nút đóng/nút Lưu sát mép hộp, đầu–chân không trôi khi cuộn, nhãn "Hồ sơ của bạn" — đạt');
    }

    /* ================= VÒNG B · CHẠY LUỒNG THẬT (1440 + 390) ================= */
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      const p = await ctx.newPage();
      const errors = []; p.on('pageerror', (e) => errors.push(e.message));
      const st = await wireMocks(ctx, p, { shelves: [] });
      await p.goto(BASE + '/my-space.html');
      await p.waitForSelector('#spaceHero .space-hero-ring');
      await p.waitForFunction(() => { const c = document.querySelector('#cloudShelves'); return c && !c.hidden; });

      /* hồ sơ + ảnh đại diện: lưu được, và lưu TRƯỢT thì giữ nguyên bản nháp */
      await p.click('[data-space-tab="edit-profile"]');
      await p.fill('#profileName', 'Alice đọc sách');
      await p.fill('#profileBio', 'Những trang sách và một tách trà.');
      const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#b73752'; x.fillRect(0, 0, 64, 64); return c.toDataURL('image/png').split(',')[1]; });
      await p.setInputFiles('#avatarFile', { name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await p.waitForFunction(() => document.querySelector('#profileMessage').textContent.includes('sẵn sàng'));
      await p.click('#saveProfile');
      await p.waitForFunction(() => document.querySelector('#profileMessage').textContent.includes('Đã lưu'));
      assert.ok(st.store.profile.avatar.startsWith('data:image/jpeg;base64,'), width + 'px: ảnh phải nén về jpeg trước khi lưu');
      /* tên mới phải lên hero, và ảnh thật phải nằm trong vòng tròn */
      assert.equal((await p.locator('#spaceHero h1').innerText()).trim(), 'Alice đọc sách', width + 'px: hero chưa đổi tên sau khi lưu');
      assert.ok(await p.locator('#spaceHero .space-hero-avatar img').count(), width + 'px: lưu ảnh rồi hero phải hiện ảnh thật');
      const av = await p.evaluate(() => {
        const c = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; };
        return { ring: c('#spaceHero .space-hero-ring'), ava: c('#spaceHero .space-hero-avatar'), img: c('#spaceHero .space-hero-avatar img') };
      });
      assert.ok(Math.abs(av.ring.cx - av.ava.cx) <= 1 && Math.abs(av.ring.cy - av.ava.cy) <= 1, width + 'px: có ảnh thật rồi thì vòng vẫn phải đồng tâm với ảnh');
      assert.ok(Math.abs(av.img.cx - av.ava.cx) <= 1 && Math.abs(av.img.cy - av.ava.cy) <= 1, width + 'px: ảnh phải nằm đúng giữa vòng');
      st.failSave = true;
      await p.fill('#profileBio', 'Bản nháp chưa lưu');
      await p.click('#saveProfile');
      await p.waitForFunction(() => document.querySelector('#profileMessage').textContent.includes('chưa lưu'));
      assert.equal(st.store.profile.bio, 'Những trang sách và một tách trà.', width + 'px: lưu trượt thì KHÔNG được ghi đè dữ liệu máy chủ');
      assert.equal(await p.inputValue('#profileBio'), 'Bản nháp chưa lưu', width + 'px: lưu trượt thì phải giữ bản nháp trong ô');
      st.failSave = false;

      /* tạo tủ: bộ đếm 0/200 → 1/200, nút Huỷ đóng hộp, lưu xong tủ hiện ở danh sách */
      await p.click('[data-space-tab="shelves"]');
      await p.click('#openNewShelf');
      await p.waitForSelector('#shelfDialog[open]');
      assert.equal(await p.inputValue('#shelfVisibility'), 'private', width + 'px: tủ mới mặc định riêng tư');
      assert.equal((await p.locator('#selectedCount').innerText()).trim(), '0/200', width + 'px: bộ đếm phải theo kiểu 0/200');
      await p.click('#cancelShelf');
      await p.waitForSelector('#shelfDialog', { state: 'hidden' });
      assert.equal(st.store.shelves.length, 0, width + 'px: bấm Huỷ thì không được tạo tủ');
      await p.click('#openNewShelf');
      await p.fill('#shelfName', 'Những truyện muốn đọc');
      await p.check('[data-book="' + slug + '"]');
      assert.equal((await p.locator('#selectedCount').innerText()).trim(), '1/200', width + 'px: chọn truyện phải cập nhật bộ đếm');
      /* tên tủ để trống thì báo lỗi ngay trong chân hộp, không đóng hộp */
      await p.click('#saveShelf');
      /* hộp thoại đóng thì <dialog> là display:none nên waitForSelector mặc định
         (chờ phần tử HIỆN) không bao giờ thoả — phải chờ đúng cờ open tắt */
      await p.waitForFunction(() => !document.querySelector('#shelfDialog').open);
      assert.equal(st.store.shelves.length, 1, width + 'px: lưu phải tạo đúng một tủ');
      assert.equal(st.store.shelves[0].visibility, 'private');
      await p.waitForSelector('#shelfList .space-shelf');
      assert.equal(await p.locator('#shelfList .space-shelf').count(), 1, width + 'px: tủ mới phải hiện ở danh sách');
      assert.equal(await p.locator('#shelfContent .space-book-cell').count(), 1, width + 'px: truyện đã chọn phải hiện trong tủ');

      /* riêng tư ↔ công khai, và hồ sơ công khai không lộ dữ liệu riêng */
      await p.click('[data-edit-shelf]');
      await p.waitForSelector('#shelfDialog[open]');
      await p.selectOption('#shelfVisibility', 'public');
      await p.click('#saveShelf');
      /* hộp thoại đóng thì <dialog> là display:none nên waitForSelector mặc định
         (chờ phần tử HIỆN) không bao giờ thoả — phải chờ đúng cờ open tắt */
      await p.waitForFunction(() => !document.querySelector('#shelfDialog').open);
      const pub = await ctx.newPage();
      const pubErrors = []; pub.on('pageerror', (e) => pubErrors.push(e.message));
      await pub.goto(BASE + '/profile.html?id=' + st.store.id);
      await pub.waitForSelector('#publicShelves .card');
      assert.equal(await pub.locator('#publicShelves .card').count(), 1, width + 'px: tủ công khai phải hiện trên hồ sơ');
      const pubText = await pub.locator('main').innerText();
      assert.ok(!pubText.includes('private@example.test'), width + 'px: hồ sơ công khai lộ email');
      assert.ok(!pubText.includes('Bản nháp chưa lưu'), width + 'px: hồ sơ công khai lộ dữ liệu riêng');
      assert.equal(await pub.locator('#spaceHistory').count(), 0, width + 'px: hồ sơ công khai không được có lịch sử đọc');
      /* hero công khai: cùng khung, vòng đồng tâm, không có nút "Chỉnh sửa hồ sơ" */
      const pm = await pub.evaluate(MEASURE);
      assert.ok(Math.abs(pm.ring.cx - pm.ava.cx) <= 1 && Math.abs(pm.ring.cy - pm.ava.cy) <= 1, width + 'px: hồ sơ công khai lệch vòng–ảnh');
      assert.equal(pm.side, null, width + 'px: hồ sơ công khai không được có cột thao tác');
      assert.equal(pm.kicker, 'SSOCHUZ / HỒ SƠ BẠN ĐỌC', width + 'px: nhãn hồ sơ công khai');
      assert.ok(pm.docOverflow <= 1, width + 'px: hồ sơ công khai tràn ngang');
      await shot(pub, 'profile-' + width);
      assert.deepEqual(pubErrors, []);

      await p.click('[data-edit-shelf]');
      await p.selectOption('#shelfVisibility', 'private');
      await p.click('#saveShelf');
      /* hộp thoại đóng thì <dialog> là display:none nên waitForSelector mặc định
         (chờ phần tử HIỆN) không bao giờ thoả — phải chờ đúng cờ open tắt */
      await p.waitForFunction(() => !document.querySelector('#shelfDialog').open);
      await pub.reload();
      await pub.waitForSelector('#publicShelves .empty');
      assert.equal(await pub.locator('#publicShelves .card').count(), 0, width + 'px: chuyển riêng tư rồi thì phải rút khỏi hồ sơ công khai');
      await pub.close();

      /* hộp "Chọn tủ lưu truyện" trên TRANG TRUYỆN: nơi từng vuông cạnh + viền đậm
         vì --space-radius/--space-line chỉ khai báo trên .space-page */
      await p.goto(BASE + '/truyen.html?slug=' + slug);
      await p.waitForSelector('#shelfBtn');
      await p.click('#shelfBtn');
      await p.waitForSelector('#storyShelfDialog[open] .shelf-choice-item');
      const sm = await p.evaluate(() => {
        const d = document.querySelector('#storyShelfDialog'), cs = getComputedStyle(d);
        const head = d.querySelector('.space-dialog-head'), close = d.querySelector('.space-dialog-close');
        const padR = parseFloat(getComputedStyle(head).paddingRight);
        const hr = head.getBoundingClientRect(), cr = close.getBoundingClientRect();
        return {
          radius: cs.borderTopLeftRadius, borderColor: cs.borderTopColor, ink: getComputedStyle(document.body).color,
          justify: getComputedStyle(head).justifyContent, gap: hr.right - padR - cr.right,
          closeW: cr.width, foot: !!d.querySelector('.space-dialog-foot .btn'), ibo: !!d.querySelector('.ibo'),
          cx: d.getBoundingClientRect().x + d.getBoundingClientRect().width / 2, vw: innerWidth,
          items: d.querySelectorAll('.shelf-choice-item').length,
          nestedScroll: (() => { const l = d.querySelector('.shelf-choice-list'); return l ? getComputedStyle(l).overflowY : 'none'; })()
        };
      });
      assert.equal(sm.radius, width <= 700 ? '14px' : '18px', width + 'px: hộp chọn tủ phải bo góc như ở My Space (--space-radius phải có ở :root)');
      assert.notEqual(sm.borderColor, sm.ink, width + 'px: viền hộp chọn tủ rơi về currentColor (--space-line phải có ở :root)');
      assert.equal(sm.justify, 'space-between', width + 'px: đầu hộp chọn tủ phải đẩy nút đóng sang phải');
      assert.ok(Math.abs(sm.gap) <= 1, width + 'px: nút đóng hộp chọn tủ cách mép phải ' + sm.gap.toFixed(1) + 'px');
      assert.ok(sm.closeW >= 32, width + 'px: nút đóng hộp chọn tủ phải ≥32px');
      assert.equal(sm.ibo, false, width + 'px: không được dùng .ibo (biến --rd-* chỉ có ở trang đọc)');
      assert.equal(sm.foot, true, width + 'px: nút "Xong" phải nằm ở chân hộp');
      assert.ok(Math.abs(sm.cx - sm.vw / 2) <= 1, width + 'px: hộp chọn tủ không nằm giữa màn hình');
      assert.equal(sm.nestedScroll, 'visible', width + 'px: danh sách chọn tủ không được cuộn lồng trong hộp đã cuộn');
      /* bấm một tủ → trạng thái LẬT ngay tại chỗ, hộp không đóng. Truyện này đã nằm
         trong tủ nên cú bấm sẽ bỏ ra: kiểm theo hướng lật, đừng giả định là thêm vào. */
      const hadBook = st.store.shelves[0].books.includes(slug);
      const firstStatus = (await p.locator('#storyShelfDialog .shelf-choice-status').first().innerText()).trim();
      assert.equal(firstStatus.includes('Đã lưu'), hadBook, width + 'px: nhãn tủ phải khớp dữ liệu máy chủ');
      await p.click('.shelf-choice-item');
      await p.waitForFunction((s) => document.querySelector('#storyShelfDialog .shelf-choice-status').textContent.trim() !== s, firstStatus);
      assert.equal(st.store.shelves[0].books.includes(slug), !hadBook, width + 'px: bấm tủ phải đổi trạng thái lưu trên máy chủ');
      assert.ok(await p.locator('#storyShelfDialog[open]').count(), width + 'px: bấm chọn tủ không được đóng hộp');
      await shot(p, 'story-dialog-' + width);
      await p.click('#storyShelfDialog .space-dialog-foot .btn');
      await p.waitForFunction(() => !document.querySelector('#storyShelfDialog').open);

      /* giảm chuyển động trên TRANG TRUYỆN: hộp này nằm ngoài .space-page nên luật
         reduced-motion của My Space không với tới — phải tắt bằng luật riêng */
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.click('#shelfBtn');
      await p.waitForSelector('#storyShelfDialog[open]');
      assert.equal(await p.locator('#storyShelfDialog').evaluate((e) => getComputedStyle(e).animationName), 'none', width + 'px: hộp chọn tủ vẫn chạy animation khi giảm chuyển động');

      assert.deepEqual(errors, []);
      await ctx.close();
      console.log('CHẠY ' + width + 'px: hồ sơ/ảnh, lưu trượt giữ nháp, Huỷ không tạo tủ, bộ đếm 1/200, tủ riêng tư ↔ công khai, hồ sơ công khai không lộ dữ liệu, hộp chọn tủ trên trang truyện đúng bo góc/viền/căn phải — đạt');
    }
    console.log('Xong: đo ' + WIDTHS.length + ' cỡ màn hình + chạy luồng thật ở 1440px và 390px.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

/* ---- dịch vụ giả: chỉ phục vụ /api/*, trang và /data vẫn lấy từ server.py ---- */
async function wireMocks(ctx, p, { shelves }) {
  const user = { uid: 'alice', name: 'Alice', email: 'private@example.test', exp: Math.floor(Date.now() / 1000) + 3600 };
  const st = {
    store: { id: 'a'.repeat(64), version: 0, profile: { name: 'Alice', bio: 'Mỗi ngày một câu chuyện.', avatar: '' }, shelves: shelves || [] },
    failSave: false, mine: 0
  };
  await ctx.addInitScript(({ user, slug }) => {
    localStorage.setItem('ssochuz-user', JSON.stringify(user));
    localStorage.setItem('ssochuz-auth-token', 'test-session');
    localStorage.setItem('ssochuz-shelf', JSON.stringify([slug]));
    localStorage.setItem('ssochuz-prog-' + slug, '2');
  }, { user, slug });
  await ctx.route('**/*', async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.host === 'localhost:8000') return route.continue();
    let data = {}, status = 200;
    if (u.pathname === '/api/registry') data = reg;
    if (u.pathname === '/api/auth/me') data = { ok: true, user };
    if (u.pathname === '/api/me/space') {
      assert.ok(req.headers().authorization, 'gọi /api/me/space phải kèm Bearer');
      if (req.method() === 'PUT') {
        const b = req.postDataJSON();
        if (st.failSave) { status = 503; data = { error: 'Test: chưa lưu được' }; }
        else {
          assert.equal(b.version, st.store.version, 'version gửi lên phải khớp (chống ghi đè)');
          if (b.profile) st.store.profile = b.profile;
          if (b.shelf) { const s = { ...b.shelf, id: b.shelf.id || 'one' }; st.store.shelves = st.store.shelves.filter((x) => x.id !== s.id).concat(s); }
          if (b.deleteShelf) st.store.shelves = st.store.shelves.filter((x) => x.id !== b.deleteShelf);
          st.store.version++;
        }
      }
      if (status === 200) data = st.store;
    }
    if (u.pathname.startsWith('/api/profiles/')) {
      assert.ok(!req.headers().authorization, 'hồ sơ công khai không được đòi token');
      data = { id: st.store.id, profile: st.store.profile, shelves: st.store.shelves.filter((s) => s.visibility === 'public') };
    }
    if (u.pathname.startsWith('/api/book/')) data = { title: 'Truyện thử', chapters: [{ t: 'Chương 1', html: '<p>Đọc</p>' }] };
    if (u.pathname === '/api/rate/me') data = { ok: true, rating: st.mine };
    if (u.pathname === '/api/rate') { st.mine = req.postDataJSON().rating; data = { ok: true, rating: st.mine, ratingAvg: st.mine, ratingCount: st.mine ? 1 : 0 }; }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return st;
}
