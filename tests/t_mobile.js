/* ============================================================================
   Kiểm thử MÁY NHỎ & CHUYỂN ĐỘNG (đúng các lỗi người dùng báo)
   ----------------------------------------------------------------------------
   1. MENU ĐIỆN THOẠI mở được cả khi máy bật “giảm chuyển động”. Bệnh cũ: hàm
      slide() ở nhánh reduced-motion chỉ bật .on mà QUÊN thêm .slid — mà .mnav
      chỉ hiện nhờ .slid/.on, nên bấm nút menu không thấy mục nào. Bài này cố
      tình giả lập matchMedia trả về matches:true cho prefers-reduced-motion.
   2. Công tắc sáng/tối (uiverse · brown-termite-67): bấm đâu cũng chỉ đổi
      ĐÚNG MỘT lần, có nhớ trong localStorage, nhãn đọc máy nói đúng trạng thái.
   3. CSS: .mnav phải mở bằng CẢ .slid lẫn .on (chống tái phát); shimmer theo
      mẫu uiverse · light-husky-91 dùng dải gradient trượt bằng transform; công
      tắc mới giữ cấu trúc back + icon cùng cấp và trượt bằng transform.
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');

const SRC_CSS = fs.readFileSync(path.join(__dirname, '..', 'src/cz.css'), 'utf8');
const ROOT_CSS = fs.readFileSync(path.join(__dirname, '..', 'cz.css'), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};

  /* ---------- 1 + 2: trang chủ, MÁY BẬT GIẢM CHUYỂN ĐỘNG ---------- */
  const p = page('index.html', {
    fetch: dataFetch(),
    setup(w) {
      /* giả lập “máy bật giảm chuyển động / tiết kiệm pin” */
      w.matchMedia = q => ({
        matches: /prefers-reduced-motion/.test(q) ? true : false,
        media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}
      });
    }
  });
  const { win, doc, errors } = p;
  const $ = s => doc.querySelector(s);
  const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) { out.thieu = s; return; } e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };
  await wait(900);

  out.reduce = win.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  const mnav = $('#czMnav'), burger = $('#czBurger');
  out.menuTruocKhiBam = { on: mnav.classList.contains('on'), slid: mnav.classList.contains('slid') };

  click('#czBurger'); await wait(60);
  const desktopLabels = [...doc.querySelectorAll('#czNav a')].map(a => a.textContent.trim());
  const mobileLabels = [...mnav.querySelectorAll('a')].slice(0, desktopLabels.length).map(a => a.textContent.trim());
  out.menuSauKhiBam = {
    on: mnav.classList.contains('on'),
    slid: mnav.classList.contains('slid'),
    aria: burger.getAttribute('aria-expanded'),
    soMuc: mnav.querySelectorAll('a').length,
    nhan: mobileLabels,
    dongBoTen: JSON.stringify(desktopLabels) === JSON.stringify(mobileLabels)
  };
  /* bấm lại lần nữa phải đóng được */
  click('#czBurger'); await wait(60);
  out.menuDongLai = !mnav.classList.contains('on') && burger.getAttribute('aria-expanded') === 'false';
  /* Esc cũng đóng */
  click('#czBurger'); await wait(40);
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(40);
  out.menuEscDong = !mnav.classList.contains('on');

  /* ---------- công tắc sáng/tối ---------- */
  const sw = $('#czTheme'), tin = $('#czThemeIn');
  out.tsw = { co: !!sw && !!tin, the: tin && tin.getAttribute('type'), vaiTro: tin && tin.getAttribute('role') };
  const t0 = doc.documentElement.getAttribute('data-theme');
  click(sw); await wait(120);
  const t1 = doc.documentElement.getAttribute('data-theme');
  out.themeMotLan = { truoc: t0, sau: t1, doiDungMotLan: t0 !== t1, checkbox: tin.checked, nho: win.localStorage.getItem('ssochuz-theme') };
  /* bấm thẳng vào ô chọn (chuột hoặc phím Space) */
  tin.checked = !tin.checked;
  tin.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(120);
  out.themeMotLanNua = { sau: doc.documentElement.getAttribute('data-theme'), khacLanTruoc: doc.documentElement.getAttribute('data-theme') === t0, checkbox: tin.checked };
  /* 'change' phát thừa (ô đã khớp nền) KHÔNG được đổi nền lần nữa */
  tin.dispatchEvent(new win.Event('change', { bubbles: true })); await wait(80);
  out.themeChangeThua = doc.documentElement.getAttribute('data-theme') === t0;
  /* nhãn đọc máy phải nói đúng trạng thái đang có */
  const dark = doc.documentElement.getAttribute('data-theme') === 'dark';
  out.themeNhan = { dark: dark, aria: tin.getAttribute('aria-label'), title: sw.getAttribute('title'), khop: tin.checked === dark };

  out.errors0 = errors.slice(0, 5);

  /* ---------- 3: CSS ---------- */
  const css = { src: SRC_CSS, root: ROOT_CSS };
  out.css = {};
  for (const [k, t] of Object.entries(css)) {
    const mnavOpen = (t.match(/\.mnav[^{]*\{[^}]*display:\s*block/g) || []).join(' ');
    const shim = (t.match(/@keyframes shimmer\s*\{[^}]*\}[^}]*\}/) || [''])[0].replace(/\s+/g, ' ');
    out.css[k] = {
      mnavMoBangSlid: /\.mnav\.slid/.test(mnavOpen),
      mnavMoBangOn: /\.mnav\.on/.test(mnavOpen),
      shimmer: /translateX?\(-100%\)/.test(shim) && /translateX?\(100%\)/.test(shim),
      shimmerCoBefore: /\.skel:{1,2}before|\.rskel:{1,2}before|\.skcard \.skth:{1,2}before/.test(t),
      shimmerNenDungTransform: /@keyframes shimmer/.test(t) && !/@keyframes shimmer[\s\S]{0,200}background-position/.test(t),
      tsw: /\.tsw-sl\s*\{/.test(t) && /\.tsw-in:checked\s*(?:\+|~)\s*\.tsw-sl/.test(t) &&
        /\.tsw-in:checked\s*~\s*\.tsw-icon\.moon/.test(t) && /\.tsw-icon\.sun/.test(t),
      tswUiverseLayout: /\.tsw-icon\s*\{/.test(t) && /translate(?:X)?\(-100%\) rotate\(-180deg\)/.test(t)
    };
  }
  /* icon Tabler trong bản phát hành có được chuẩn hoá (mỗi icon một hệ số) không */
  const app = fs.readFileSync(path.join(__dirname, '..', 'cz-app.js'), 'utf8');
  const srcApp = fs.readFileSync(path.join(__dirname, '..', 'src', 'cz-app.js'), 'utf8');
  /* thân từng icon = các dòng "    tên: '…'," trong bộ icon */
  const bodies = srcApp.split('\n').filter(l => /^    [a-z_0-9]+: '/.test(l)).join('\n');
  out.icon = {
    soIconTabler: (app.match(/transform="translate\(|-?\d+ \d+\) scale\(/g) || []).length,
    coTabler: /Bộ icon SVG từ Tabler Icons/.test(srcApp) && /@tabler\/icons/.test(fs.readFileSync(path.join(__dirname, '..', 'tools', 'gen_icons_tabler.mjs'), 'utf8')),
    coGoogle: /google:/.test(app), coMomo: /momo:/.test(app),
    /* thân icon KHÔNG được tự đặt fill="none": trạng thái .on (tim đã thích,
       sao đã đánh dấu) tô bằng fill:currentColor từ CSS, còn fill="none" ở
       attribute thì CSS không ghi đè được */
    khongConFillNone: !/ fill="none"/.test(bodies),
    /* nét vẽ nằm ở lớp bọc (chia theo hệ số phóng) chứ không phải từng path */
    netONgoai: /stroke-width="\d+(\.\d+)?" transform="translate\(/.test(bodies)
  };

  /* ---------- công tắc ở trang quản trị: hồi quy HTML bị xoá nhầm ----------
     admin.html có công tắc tĩnh, còn hai SVG được admin.js chèn vào. Trước đây
     init() gán innerHTML cho cả label sau khi khởi động, làm mất checkbox và
     khiến trang quản trị không đổi nền được. */
  const ap = page('admin.html', {
    fetch: dataFetch(),
    files: ['cz-config.js', 'cz-app.js', 'cz-auth.js', 'admin.js']
  });
  await wait(420);
  const asw = ap.doc.querySelector('#btnTheme');
  const ain = ap.doc.querySelector('#btnThemeIn');
  const a0 = ap.doc.documentElement.getAttribute('data-theme');
  if (ain) ain.click();
  await wait(120);
  out.adminTheme = {
    input: !!ain,
    icons: asw ? asw.querySelectorAll('.tsw-icon').length : 0,
    changed: a0 !== ap.doc.documentElement.getAttribute('data-theme'),
    errors: ap.errors.slice(0, 5)
  };
  out.errors1 = ap.errors.slice(0, 5);

  /* ---------- kết luận ---------- */
  const loi = [];
  if (!out.reduce) loi.push('không giả lập được chế độ giảm chuyển động');
  if (!out.menuSauKhiBam.on || !out.menuSauKhiBam.slid) loi.push('menu không mở khi bật giảm chuyển động');
  if (!out.menuSauKhiBam.soMuc || out.menuSauKhiBam.soMuc < 4) loi.push('menu mở nhưng không có mục nào');
  if (!out.menuSauKhiBam.dongBoTen) loi.push('tên menu mobile lệch với header web');
  if (out.menuSauKhiBam.aria !== 'true') loi.push('aria-expanded không đổi');
  if (!out.menuDongLai) loi.push('bấm lần hai không đóng menu');
  if (!out.menuEscDong) loi.push('Esc không đóng menu');
  if (!out.tsw.co || out.tsw.the !== 'checkbox') loi.push('công tắc sáng/tối không phải ô chọn');
  if (!out.themeMotLan.doiDungMotLan) loi.push('công tắc không đổi nền');
  if (!out.themeMotLanNua.khacLanTruoc) loi.push('bấm vào ô chọn làm đổi 2 lần');
  if (out.themeNhan.aria !== out.themeNhan.title) loi.push('nhãn công tắc lệch nhau');
  if (/Đang bật nền tối/.test(out.themeNhan.aria) !== out.themeNhan.dark) loi.push('nhãn công tắc nói sai trạng thái');
  for (const k of ['src', 'root']) {
    const c = out.css[k];
    if (!c.mnavMoBangSlid || !c.mnavMoBangOn) loi.push('cz.css(' + k + '): .mnav chưa mở bằng cả .slid lẫn .on');
    if (!c.shimmer || !c.shimmerCoBefore || !c.shimmerNenDungTransform) loi.push('cz.css(' + k + '): shimmer chưa theo mẫu (dải trượt bằng transform)');
    if (!c.tsw || !c.tswUiverseLayout) loi.push('cz.css(' + k + '): công tắc chưa theo cấu trúc brown-termite-67');
  }
  if (!out.themeChangeThua) loi.push("'change' phát thừa làm đổi nền lần nữa");
  if (!out.icon.khongConFillNone) loi.push('thân icon còn fill="none" (trạng thái .on không tô được)');
  if (!out.icon.netONgoai) loi.push('nét vẽ icon chưa gom ra lớp bọc chuẩn hoá');
  if (!out.icon.coTabler) loi.push('bản phát hành chưa đánh dấu bộ Tabler local');
  if (out.icon.soIconTabler < 60) loi.push('quá ít icon Tabler được chuẩn hoá: ' + out.icon.soIconTabler);
  if (!out.adminTheme || !out.adminTheme.input || out.adminTheme.icons !== 2 || !out.adminTheme.changed) {
    loi.push('công tắc trang quản trị mất checkbox/icon hoặc không đổi nền');
  }
  if (!out.icon.coGoogle || !out.icon.coMomo) loi.push('mất icon thương hiệu Google/MoMo');
  out.loi = loi;

  console.log(JSON.stringify(out, null, 1));
  process.exit(loi.length ? 1 : 0);
})();
