/* ============================================================================
   Quét "bấm hết mọi thứ": tự động bấm mọi nút / tab / liên kết trong trang,
   ghi lại lỗi JS phát sinh. Mục đích: tìm lỗi mà bài kiểm thử theo kịch bản
   không chạm tới (nút chết, hàm thiếu, phần tử null…).
   Chạy:  cd tests && node t_sweep.js
   ========================================================================== */
const { page, dataFetch } = require('./mk');

const wait = ms => new Promise(r => setTimeout(r, ms));

const SKIP_TEXT = /đăng xuất|xóa toàn bộ|sao lưu|phục hồi|xóa hết|xoá hết|xoá lịch sử|xóa lịch sử/i;

async function sweep(label, p, opt = {}) {
  const { win, doc, errors } = p;
  const log = [];
  const seenNodes = new WeakSet();
  let clicks = 0;
  const max = opt.max || 160;

  for (let round = 0; round < 10 && clicks < max; round++) {
    const els = [...doc.querySelectorAll('button, [role="tab"], a[href^="#"], input[type=checkbox], summary')]
      .filter(e => !seenNodes.has(e))
      .filter(e => {
        const t = (e.textContent || '').trim();
        return !SKIP_TEXT.test(t) && !e.hidden && !(e.closest && e.closest('[hidden]'));
      });
    if (!els.length) break;
    for (const el of els) {
      if (clicks >= max) break;
      seenNodes.add(el);
      const before = errors.length;
      const tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
        (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : '') +
        ' “' + (el.textContent || '').trim().slice(0, 22) + '”';
      try {
        el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      } catch (e) {
        errors.push('throw khi bấm ' + tag + ': ' + e.message);
      }
      clicks++;
      await wait(45);
      if (errors.length > before) log.push({ tag, err: errors.slice(before, before + 2) });
    }
  }
  return {
    label, clicks,
    errors: errors.slice(0, 8),
    loiKhiBam: log.slice(0, 8),
    conLoi: errors.length
  };
}

(async () => {
  const out = {};

  const home = page('index.html', {
    url: 'https://chuseoz.pages.dev/',
    fetch: dataFetch({ apiBase: 'https://cms.test' })
  });
  /* gieo sẵn dữ liệu để kệ Đọc tiếp / Tủ truyện có mặt */
  home.win.localStorage.setItem('chuseoz-prog-third-person', JSON.stringify({ ch: 3, at: Date.now() }));
  home.win.localStorage.setItem('chuseoz-shelf', JSON.stringify(['third-person']));
  await wait(1200);
  out.home = await sweep('trang chủ', home);

  const story = page('truyen.html', {
    url: 'https://chuseoz.pages.dev/truyen/third-person/',
    fetch: dataFetch({ apiBase: 'https://cms.test' })
  });
  await wait(1300);
  out.story = await sweep('trang truyện + trang đọc', story, { max: 220 });

  /* quản trị ở chế độ tĩnh (không có Worker): bấm hết các tab/nút */
  const admin = page('admin.html', { url: 'https://chuseoz.pages.dev/admin', fetch: dataFetch({ apiBase: 'https://cms.test' }) });
  await wait(700);
  out.admin = await sweep('trang quản trị (không Worker)', admin, { max: 90 });

  const locked = page('truyen.html', {
    url: 'https://chuseoz.pages.dev/truyen/my-boss/',
    fetch: dataFetch({ apiBase: 'https://cms.test' })
  });
  await wait(1100);
  out.locked = await sweep('truyện 0 chương', locked, { max: 60 });

  console.log(JSON.stringify(out, null, 1));
  const bad = Object.keys(out).filter(k => out[k].errors.length);
  console.log(bad.length ? 'CÒN LỖI: ' + bad.join(', ') : 'Không lỗi JS nào khi bấm hết mọi thứ');
  process.exit(0);
})();
