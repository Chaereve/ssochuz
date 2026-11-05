/* ============================================================================
   t_v16.js · VÒNG 16 — TRANG CHỦ + ĐỒNG BỘ ADMIN ↔ WEB
   ----------------------------------------------------------------------------
   1. Sạp báo (hero BỘ BÀI) CHỈ nhỏ lại ở desktop ≥1024px; mobile không đổi.
   2. Ranking / Đáng xem gom trong .rankpair 2 cột, bỏ thanh hồng chạy dài.
   3. Chuyển thể Series có nút Xem thêm → trang /chuyen-the liệt kê TOÀN BỘ
      editorChoice (trang chủ vẫn 8), có luật URL sạch + precache SW.
   4. Bốn dữ liệu do Homepage CMS ghi mà web từng bỏ qua phải hiện thật:
      settings.announcement · slides[].reason · schedule.items[].detail ·
      editorChoice dài hơn 8. Không có dữ liệu mẫu, không tự bịa số liệu.
   ========================================================================== */
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { page, dataFetch, read } = require('./mk');
const ROOT = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const exists = f => fs.existsSync(path.join(ROOT, f));
const reg0 = JSON.parse(read('data/registry.json'));
const J = body => Promise.resolve({ ok: true, status: 200,
  json: async () => body, text: async () => JSON.stringify(body) });

/* fetch giả: registry tuỳ biến + các tệp /data khác lấy từ repo như thường */
function registryFetch(reg) {
  const base = dataFetch({});
  return (url, opt = {}) => {
    const u = String(url);
    if (u.startsWith('/data/registry.json') || u.includes('/api/registry')) return J(reg);
    return base(u, opt);
  };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function openPage(file, reg) {
  return page(file, { config: { CZ_API: '' }, fetch: registryFetch(reg), css: true });
}

(async () => {
  /* ---------------- 1 · cấu trúc HTML / routes / SW ---------------------- */
  const idx = read('index.html');
  assert.ok(idx.includes('<div class="rankpair">'), 'thiếu khung .rankpair');
  assert.ok(idx.indexOf('<div class="rankpair">') < idx.indexOf('id="bxh"'), '#bxh phải nằm trong .rankpair');
  assert.ok(idx.indexOf('id="dang-xem"') < idx.indexOf('</div><!-- /.rankpair -->'), '#dang-xem phải nằm trong .rankpair');
  assert.ok(/<a class="btm" href="\/chuyen-the">Xem thêm ›<\/a>/.test(idx), 'Chuyển thể Series thiếu nút Xem thêm');
  assert.ok(/<div class="announce" id="announce" role="note" hidden>/.test(idx), 'thiếu #announce ẩn mặc định');
  assert.ok(idx.includes('?v=20261102r121'), 'đổi ?v= phải sửa PRECACHE + CZ_SW_VER (xem t_pwa.js)');

  assert.ok(exists('chuyen-the.html'), 'thiếu trang /chuyen-the');
  const series = read('chuyen-the.html');
  assert.ok(series.includes('/cz-series.js'), 'trang /chuyen-the không nạp cz-series.js');
  assert.ok(series.includes('id="seriesGrid"') && series.includes('<h1'), 'trang /chuyen-the thiếu h1 / lưới thẻ');
  assert.ok(!series.includes('Tuyển tập · Chủ trang chọn lọc'), 'trang Series còn kicker đã yêu cầu bỏ');
  assert.ok(!series.includes('do chủ trang tuyển chọn'), 'trang Series còn cụm lead đã yêu cầu bỏ');
  assert.ok(series.includes('Những bộ truyện được chuyển thể thành phim.'), 'lead trang Series sai sau khi rút gọn');
  assert.ok(exists('cz-series.js') && exists('src/cz-series.js'), 'cz-series.js chưa được build / thiếu nguồn');

  const rd = read('_redirects');
  assert.ok(/\/chuyen-the\.html\s+\/chuyen-the\s+200/.test(rd), 'thiếu luật /chuyen-the.html → URL sạch');
  assert.ok(/\/chuyen-the\/\s+\/chuyen-the\s+200/.test(rd), 'thiếu luật /chuyen-the/ → URL sạch');
  assert.ok(!/\/chuyen-the\s+\/chuyen-the\.html\s+200/.test(rd), 'đích .html sinh vòng lặp 308');

  const sw = read('sw.js');
  assert.ok(sw.includes("var CZ_SW_VER = '20261104v16'"), 'chưa tăng phiên bản SW (CSS/JS đổi nội dung)');
  assert.ok(sw.includes("'/chuyen-the'") && sw.includes("'/cz-series.js"), 'PRECACHE thiếu trang/script mới');

  /* ---------------- 2 · CSS vòng 16 -------------------------------------- */
  const css = read('src/cz.css');
  const v16 = css.slice(css.indexOf('VÒNG 16 · TRANG CHỦ'));
  assert.ok(v16.length > 1000, 'khối CSS vòng 16 mất');
  assert.ok(/@media \(min-width: 1024px\)[\s\S]*?--cover-w: clamp\(176px, 18vw, 244px\)/.test(v16),
    'desktop chưa thu nhỏ bìa sạp báo');
  assert.ok(/@media \(min-width: 1024px\)[\s\S]*?\.hero \{ min-height: calc\(clamp\(176px, 18vw, 244px\)/.test(v16),
    'khung hero desktop chưa hạ theo bìa mới');
  assert.ok(!/@media \(max-width: 639px\)/.test(v16), 'khối vòng 16 không được đụng vào mobile hero');
  assert.ok(/\.rankpair \{ display: grid; grid-template-columns: minmax\(0, 1\.06fr\) minmax\(0, 1fr\)/.test(v16),
    'Ranking / Đáng xem chưa thành 2 ô song song');
  assert.ok(/\.rankpair \.rank \.bar \{ display: none !important; \}/.test(v16), 'thanh hồng chưa bị bỏ');
  assert.ok(/@media \(max-width: 900px\) \{ \.rankpair \{ grid-template-columns: minmax\(0, 1fr\)/.test(v16),
    'thiếu bố cục 1 cột trên máy nhỏ');
  assert.ok(/#doc-tiep, #moi-cap-nhat \{ gap: 12px; \}/.test(v16),
    'Đọc tiếp / Mới cập nhật chưa rút gap đầu mục');
  assert.ok(/#doc-tiep > \.sechead, #moi-cap-nhat > \.sechead \{ margin-bottom: 0; \}/.test(v16),
    'Đọc tiếp / Mới cập nhật còn margin thừa dưới tiêu đề');
  assert.ok(!/\.series-kick/.test(css), 'còn CSS của kicker Series đã bỏ');
  /* invariant: khối mới không thêm màu literal */
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(v16), 'khối CSS vòng 16 có màu literal — dùng biến :root');

  /* ---------------- 3 · nguồn JS ------------------------------------------ */
  const home = read('src/cz-home.js');
  assert.equal((home.match(/function renderEditorChoice\(\)/g) || []).length, 1, 'vẫn có hàm trùng tên renderEditorChoice');
  assert.ok(/function renderAnnouncement\(reg\)/.test(home) && /renderAnnouncement\(reg\);/.test(home),
    'chưa đọc settings.announcement trong boot()');
  assert.ok(/n\._reason/.test(home), 'chưa hiện lý do giới thiệu của slide');
  assert.ok(/rowNote/.test(home), 'chưa hiện ghi chú lịch ra chương');
  const sjs = read('src/cz-series.js');
  assert.ok(/CZ\.editorChoice\(reg\)/.test(sjs), 'trang Series không đọc editorChoice thật');
  assert.ok(!/slice\(0, ?8\)/.test(sjs), 'trang Series KHÔNG được cắt 8 như trang chủ');
  assert.ok(/CZ\.card\(n\)/.test(sjs), 'trang Series phải dùng chung thẻ CZ.card');

  /* ---------------- 4 · chạy thật: banner thông báo ---------------------- */
  const withAnn = clone(reg0);
  withAnn.settings.announcement = { enabled: true, text: 'Lịch ra chương tuần này dời sang 20:00.', href: '/#lich' };
  const p1 = openPage('index.html', withAnn);
  await wait(500);
  const ann = p1.doc.querySelector('#announce');
  assert.equal(ann.hidden, false, 'bật banner nhưng #announce vẫn ẩn');
  assert.ok(ann.textContent.includes('Lịch ra chương tuần này dời sang 20:00.'), 'nội dung banner không phải dữ liệu KV');
  assert.equal(ann.querySelector('.an-link').getAttribute('href'), '/#lich', 'link banner sai');
  assert.equal(p1.errors.length, 0, 'lỗi JS khi hiện banner: ' + p1.errors.join(' | '));
  p1.dom.window.close();

  /* link lạ phải bị bỏ, tắt công tắc phải ẩn */
  const unsafe = clone(withAnn);
  unsafe.settings.announcement.href = 'javascript:alert(1)';
  const p2 = openPage('index.html', unsafe);
  await wait(500);
  assert.equal(p2.doc.querySelectorAll('#announce .an-link').length, 0, 'link javascript: lọt ra web');
  p2.dom.window.close();

  const off = clone(withAnn);
  off.settings.announcement.enabled = false;
  const p3 = openPage('index.html', off);
  await wait(500);
  assert.equal(p3.doc.querySelector('#announce').hidden, true, 'tắt banner nhưng vẫn hiện');
  p3.dom.window.close();

  /* ---------------- 5 · chạy thật: lý do slide + ghi chú lịch ------------ */
  const rich = clone(reg0);
  rich.slides = [{ slug: reg0.lib[0].slug, reason: 'Bản dịch mới ra mắt' }];
  rich.schedule = clone(reg0.schedule);
  rich.schedule.items[0].detail = 'Ra sớm hai ngày';
  const p4 = openPage('index.html', rich);
  await wait(600);
  assert.ok(p4.doc.querySelector('#hero').innerHTML.includes('Bản dịch mới ra mắt'),
    'slides[].reason (ô Lý do trong Homepage CMS) vẫn bị bỏ qua');
  assert.ok(p4.doc.querySelector('#sched').textContent.includes('Ra sớm hai ngày'),
    'schedule.items[].detail (ô Ghi chú) vẫn bị bỏ qua');
  assert.equal(p4.doc.querySelector('#lichNote').hidden, false, 'schedule.note không hiện');
  assert.ok(/,/.test(p4.doc.querySelector('#lichToday').textContent), '#lichToday rỗng');
  assert.equal(p4.errors.length, 0, 'lỗi JS khi dựng lịch / hero: ' + p4.errors.join(' | '));
  p4.dom.window.close();

  /* ---------------- 6 · chạy thật: trang Xem thêm ----------------------- */
  const many = clone(reg0);
  /* 20 bộ đã chọn → trang chủ 8, trang riêng phải hiện đủ 20 (vòng 15 bỏ trần) */
  many.editorChoice = reg0.lib.slice(0, 20).map(n => n.slug);
  many.settings.editorChoice = many.editorChoice.slice();
  const p5 = openPage('chuyen-the.html', many);
  await wait(500);
  assert.equal(p5.doc.querySelectorAll('#seriesGrid .card').length, 20,
    'trang /chuyen-the cắt bớt editorChoice');
  assert.equal(p5.doc.querySelector('#seriesCount').textContent, '20 bộ', 'bộ đếm sai');
  assert.ok(p5.doc.querySelector('#seriesGrid').innerHTML.includes(reg0.lib[19].slug), 'bộ thứ 20 mất');
  assert.equal(p5.errors.length, 0, 'lỗi JS trang /chuyen-the: ' + p5.errors.join(' | '));
  p5.dom.window.close();

  const p6 = openPage('index.html', many);
  await wait(500);
  assert.equal(p6.doc.querySelectorAll('#editRail .wcard').length, 8, 'trang chủ vẫn phải gọn 8 tấm');
  assert.equal(p6.doc.querySelector('#bien-tap .btm').getAttribute('href'), '/chuyen-the', 'nút Xem thêm sai đích');
  assert.equal(p6.errors.length, 0, 'lỗi JS trang chủ: ' + p6.errors.join(' | '));
  p6.dom.window.close();

  /* ---------------- 7 · mockup preview tự dựng được từ dữ liệu thật ------ */
  assert.ok(exists('mockup/home-preview.html'), 'thiếu mockup preview vòng 16');
  assert.ok(read('mockup/home-preview.html').includes("href=\"/chuyen-the\""),
    'mockup không có nút Xem thêm trỏ tới trang thật');
  const p7 = openPage('mockup/home-preview.html', many);
  await wait(400);
  assert.equal(p7.doc.querySelectorAll('#rank .rank').length, 5, 'mockup: Ranking trống');
  assert.equal(p7.doc.querySelectorAll('#worthRail .rank').length, 5, 'mockup: Đáng xem trống');
  assert.equal(p7.doc.querySelectorAll('#editRail .wcard').length, 8, 'mockup: dải Series sai');
  assert.equal(p7.doc.querySelectorAll('#pvFan img').length, 5, 'mockup: quạt sạp báo trống');
  assert.ok(p7.doc.querySelector('#pvSeriesNote').textContent.includes('20 bộ'),
    'mockup: ghi chú không phản ánh đúng tổng editorChoice');
  assert.equal(p7.errors.length, 0, 'lỗi JS mockup: ' + p7.errors.join(' | '));
  p7.dom.window.close();

  console.log(JSON.stringify({ v16: 'ok', banner: 3, slideReason: 1, scheduleDetail: 1,
    seriesPageCards: 20, homeCards: 8, mockup: 'rendered', errors0: [] }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
