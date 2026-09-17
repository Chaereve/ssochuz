/* ============================================================================
   t_lock_ui.js · TRANG TRUYỆN + TRANG CHỦ VỚI TRUYỆN KHÓA MẬT MÃ (jsdom)
   ----------------------------------------------------------------------------
   Kịch bản (y hệt người đọc thật):
     · registry có bộ `locked-story` mang cờ lock:1
     · Worker trả vỏ {locked:true, chapters:[]} khi chưa có token — KHÔNG có
       file data/book/locked-story.json (nếu web rớt về file tĩnh là lộ chữ)
     · thẻ truyện vẫn hiện ở trang chủ + huy hiệu ổ khóa
     · trang truyện: hero + giới thiệu công khai, phần chương là hộp nhập mật mã
     · mật mã sai → báo lỗi; đúng → token → danh sách chương hiện, hết hộp khóa
   Chạy:  node tests/t_lock_ui.js
   Điều kiện đạt: mọi khoá "errors*" là [] và thoát mã 0.
   ========================================================================== */
const { page } = require('./mk');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (doc, s) => doc.querySelector(s);
const $$ = (doc, s) => [...doc.querySelectorAll(s)];
const txt = (doc, s) => { const e = $(doc, s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };

const REG = {
  rev: '2026-09-17 10:00',
  lib: [
    {
      title: 'Truyện Có Mật Mã', slug: 'locked-story', author: 'Người Viết', couple: '',
      year: '2026', status: 'Đang cập nhật', chapters: 2, is18: false,
      thumb: '', countLabel: '2/2', updated: '2026-09-10',
      syn: 'Giới thiệu công khai — phần này ai cũng đọc được.', lock: 1,
    },
    { title: 'Truyện Thường', slug: 'plain-story', author: 'A', couple: '', year: '2026',
      status: 'Đang cập nhật', chapters: 1, is18: false, thumb: '', countLabel: '1/1',
      updated: '2026-09-01', syn: 'Bộ thường, không khóa.' },
  ],
};
const FULL_BOOK = {
  title: 'Truyện Có Mật Mã', slug: 'locked-story',
  chapters: [
    { t: 'Chương 1', html: '<p>Nội dung bí mật chương một.</p>' },
    { t: 'Chương 2', html: '<p>Nội dung bí mật chương hai.</p>' },
  ],
};

/* fetch giả: registry + book theo token + /api/lock (giữ nguyên query string) */
function lockFetch(log) {
  return (url, opt = {}) => {
    url = String(url); opt = opt || {};
    const method = (opt.method || 'GET').toUpperCase();
    log.push(method + ' ' + url);
    const ret = (b, ok, st) => Promise.resolve({
      ok: ok !== false, status: st || 200,
      json: () => Promise.resolve(b), text: () => Promise.resolve(typeof b === 'string' ? b : JSON.stringify(b)),
    });
    const u = new URL(url, 'https://x');
    if (u.host === 'cms.test') {
      if (u.pathname === '/api/registry') return ret(REG);
      if (u.pathname === '/api/stats') return ret({ ok: true, items: {} });
      if (u.pathname === '/api/schedule') return ret({ ok: true, items: [] });
      if (u.pathname === '/api/book/locked-story') {
        const tok = u.searchParams.get('token') || '';
        if (tok === 'good-token') return ret(Object.assign({}, FULL_BOOK, { locked: true, lockUntil: Math.floor(Date.now() / 1000) + 3600 }));
        return ret({ title: 'Truyện Có Mật Mã', slug: 'locked-story', locked: true, chapters: [] });
      }
      if (u.pathname === '/api/book/plain-story') return ret({ title: 'Truyện Thường', slug: 'plain-story', chapters: [{ t: 'Chương 1', html: '<p>thường thôi</p>' }] });
      if (u.pathname === '/api/lock' && method === 'POST') {
        const body = JSON.parse(opt.body || '{}');
        if (body.password === 'mat-ma-dung') return ret({ ok: true, token: 'good-token', exp: Math.floor(Date.now() / 1000) + 21600 });
        return ret({ ok: false, error: 'Mật mã không đúng.' }, false, 403);
      }
      return ret({ ok: false }, false, 404);
    }
    return ret({}, false, 404);
  };
}

(async () => {
  const out = { errors0: [] };

  /* ================= 1. TRANG TRUYỆN: hộp nhập mật mã ================= */
  const log = [];
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/locked-story/',
    fetch: lockFetch(log),
    config: { CZ_API: 'https://cms.test' },
  });
  const { win, doc, errors } = p;
  await wait(1500);
  out.errors0 = errors.slice(0, 5);
  out.gate = {
    present: !!$(doc, '#lockGate'),
    title: txt(doc, '#shero h1'),
    synVisible: txt(doc, '#shero .syn').includes('Giới thiệu công khai'),
    lockPill: !!$(doc, '#shero .pill.lock'),
    coverLock: !!$(doc, '#shero .lock-cover'),
    readBtn: txt(doc, '#shero .btn-row .btn.pri'),
    secretLeaked: doc.body.textContent.includes('NỘI DUNG BÍ MẬT') || doc.body.textContent.includes('Nội dung bí mật'),
    chapLinks: $$(doc, '#chapGrid .cha').length,
    cmtTabHidden: !$(doc, '#storyTabs [data-tab="cmt"]') || $(doc, '#storyTabs [data-tab="cmt"]').style.display === 'none',
  };
  if (out.gate.secretLeaked) out.errors0.push('bộ khóa MÀ CHƯA MỞ đã lộ nội dung chương!');
  if (out.gate.chapLinks !== 0) out.errors0.push('danh sách chương hiện ra khi chưa mở khóa');
  if (!out.gate.present) out.errors0.push('thiếu hộp nhập mật mã #lockGate');

  /* mật mã sai → báo lỗi, vẫn khóa */
  $(doc, '#unlockPw').value = 'sai-toan';
  $(doc, '#unlockForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(600);
  out.wrongPass = {
    msg: txt(doc, '#unlockMsg'),
    stillGated: !!$(doc, '#lockGate'),
  };
  if (out.wrongPass.msg.indexOf('không đúng') < 0 && out.wrongPass.msg.indexOf('Không') < 0) out.errors0.push('mật mã sai không báo lỗi: ' + out.wrongPass.msg);
  if (!out.wrongPass.stillGated) out.errors0.push('mật mã sai mà vẫn mở khóa');

  /* mật mã đúng → token → trang biến về bản đọc bình thường */
  $(doc, '#unlockPw').value = 'mat-ma-dung';
  $(doc, '#unlockForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1500);
  out.unlocked = {
    gateGone: !$(doc, '#lockGate'),
    chapLinks: $$(doc, '#chapGrid .cha').length,
    firstChap: txt(doc, '#chapGrid .cha .nm'),
    cmtTabBack: !!$(doc, '#storyTabs [data-tab="cmt"]') && $(doc, '#storyTabs [data-tab="cmt"]').style.display !== 'none',
    tokenStored: (win.sessionStorage.getItem('ssochuz-lock-locked-story') || '').includes('good-token'),
    contentVisible: doc.body.textContent.includes('Nội dung bí mật chương một') === false, /* chưa mở chương nào */
  };
  if (out.unlocked.chapLinks !== 2) out.errors0.push('sau mở khóa phải có 2 chương, thấy ' + out.unlocked.chapLinks);
  if (!out.unlocked.gateGone) out.errors0.push('hộp mật mã vẫn nằm đó sau khi mở khóa');
  if (!out.unlocked.tokenStored) out.errors0.push('token không được lưu vào sessionStorage');

  /* mở thẳng URL chương khi chưa khóa (tab khác, chưa có token): không lộ chữ */
  const log2 = [];
  const p2 = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/locked-story/chuong-1/',
    fetch: lockFetch(log2),
    config: { CZ_API: 'https://cms.test' },
  });
  const { doc: d2, errors: e2 } = p2;
  await wait(1500);
  out.directChapter = {
    errors: e2.slice(0, 3),
    gate: !!$(d2, '#lockGate'),
    leaked: d2.body.textContent.includes('Nội dung bí mật chương một'),
    readerOpen: d2.body.classList.contains('reading'),
  };
  if (out.directChapter.leaked) out.errors0.push('mở thẳng /chuong-1/ khi chưa khóa mà lộ nội dung!');
  if (out.directChapter.readerOpen) out.errors0.push('trang đọc mở ra khi chưa có token');

  /* ================= 2. TRANG CHỦ: thẻ khóa vẫn hiện + huy hiệu ================= */
  const p3 = page('index.html', {
    url: 'https://ssochuz.pages.dev/',
    fetch: lockFetch([]),
    config: { CZ_API: 'https://cms.test' },
    files: ['cz-config.js', 'cz-app.js', 'cz-home.js'],
  });
  const { doc: d3, errors: e3 } = p3;
  await wait(1500);
  const card = $$(d3, '.cardwrap a.card').find((a) => (a.getAttribute('href') || '').includes('locked-story'));
  out.home = {
    errors: e3.slice(0, 3),
    cardPresent: !!card,
    lockBadge: !!(card && (card.querySelector('.lock-bookmark') || card.querySelector('.locktag'))),
    plainCard: $$(d3, '.cardwrap a.card').some((a) => (a.getAttribute('href') || '').includes('plain-story')),
  };
  if (!out.home.cardPresent) out.errors0.push('truyện khóa BỊ BIẾN MẤT khỏi thẻ ở trang chủ');
  if (!out.home.lockBadge) out.errors0.push('thẻ khóa ở trang chủ thiếu huy hiệu ổ khóa');

  out.pass = !out.errors0.length && !out.directChapter.errors.length;
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.pass ? 0 : 1);
})().catch((e) => { console.error('LỖI THỬ:', e); process.exit(1); });
