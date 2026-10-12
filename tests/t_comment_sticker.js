/* Sticker picker is an additive UI on CZ.comments (the existing Worker/KV
   comments API): keyboard-accessible selection, thumbnail paths/fallbacks, and
   sticker-only root/reply comments remain part of that same API. */
const { page, dataFetch } = require('./mk');
const BASE = 'https://cms.test';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function supabaseStub(w) {
  w.supabase = { createClient() { return { auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } }; } };
}
const calls = [];
let nextId = 0;
function api(route, opt = {}) {
  if (!route.startsWith('/api/comments/third-person')) return undefined;
  if (opt.method === 'POST') {
    const body = JSON.parse(opt.body || '{}');
    calls.push(body);
    const comment = {
      id: 'comment-' + (++nextId), uid: 'g:test', name: body.name || 'Bạn đọc',
      text: body.text || '', stickerId: body.stickerId || '', ch: body.ch || 0,
      parentId: body.parentId || '', guest: true, createdAt: new Date().toISOString(),
    };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, comment, count: nextId }) });
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, comments: [], count: 0, byChapter: {} }) });
}

(async () => {
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-1/',
    config: { CZ_API: BASE },
    fetch: dataFetch({ apiBase: BASE, api, log: [] }),
    setup: supabaseStub,
    css: true,
  });
  await wait(900);
  const host = p.doc.createElement('section');
  host.id = 'comment-sticker-test';
  p.doc.body.appendChild(host);
  const instance = p.win.CZ.comments.mount(host, { slug: 'third-person', ch: 1, title: 'Bình luận chương 1' });
  await wait(60);
  const err = message => p.errors.push(message);
  const open = scope => host.querySelector('[data-sticker-open="' + scope + '"]');
  const choose = (scope, id) => host.querySelector('[data-sticker-scope="' + scope + '"][data-sticker-id="' + id + '"]');

  const picker = host.querySelector('[data-sticker-picker="main"]');
  if (!picker || !picker.hidden) err('picker bình luận phải bắt đầu đóng');
  if (picker && picker.querySelectorAll('.cmt-sticker-option').length !== 14) err('picker phải dùng đủ registry 14 sticker');
  const nonQuick = choose('main', 'sso-witness-protection');
  const nonQuickImg = nonQuick && nonQuick.querySelector('img');
  if (!nonQuickImg || nonQuickImg.getAttribute('loading') !== 'lazy' || !/\/stickers\/sso\/thumb\//.test(nonQuickImg.src)) {
    err('sticker ngoài quick set phải dùng thumbnail lazy-load');
  }
  if (nonQuick && nonQuick.getAttribute('aria-label') !== 'Hong thấy gì hết nha. Sso giả vờ không nhìn thấy chuyện vừa xảy ra') {
    err('option phải có accessible name/alt rõ ràng');
  }
  const launch = open('main');
  launch && launch.click();
  if (!picker || picker.hidden || launch?.getAttribute('aria-expanded') !== 'true') err('mở picker phải đồng bộ hidden và aria-expanded');
  if (p.doc.activeElement !== (picker && picker.querySelector('.cmt-sticker-option'))) err('mở picker phải đưa focus bàn phím tới sticker đầu tiên');

  const rootSticker = choose('main', 'sso-love-it');
  rootSticker && rootSticker.click();
  if (host.querySelector('[data-sticker-picker="main"]')?.hidden !== true) err('chọn sticker phải đóng picker');
  if (!host.querySelector('.cmt-sticker-selected img')?.src.includes('/stickers/sso/thumb/sso-love-it.webp')) err('sticker đang chọn dùng asset thumbnail, không full size');
  const send = host.querySelector('[data-send]');
  send && send.click(); // sticker-only comment is allowed; text is empty
  await wait(80);
  if (calls.length !== 1 || calls[0].text !== '' || calls[0].stickerId !== 'sso-love-it' || calls[0].ch !== 1) {
    err('comment sticker-only phải gửi qua endpoint comments hiện có với stickerId allowlist');
  }
  const posted = host.querySelector('.cmt-item .cmt-sticker-posted');
  if (!posted || !posted.getAttribute('aria-label').includes('Toẹt')) err('sticker bình luận đã gửi phải render trong luồng comments hiện có');
  const postedImg = posted && posted.querySelector('img');
  if (!postedImg || !postedImg.src.includes('/stickers/sso/thumb/sso-love-it.webp') || postedImg.getAttribute('loading') !== 'lazy') {
    err('sticker trong comment phải dùng thumbnail lazy-load');
  }

  // Broken image falls back to the registry emoji without blocking submission.
  const broken = host.querySelector('.cmt-item .cmt-sticker-posted img');
  if (broken) {
    const brokenCard = broken.closest('.cmt-sticker-card');
    broken.dispatchEvent(new p.win.Event('error'));
    if (!broken.hidden || !brokenCard || !brokenCard.querySelector('.cmt-sticker-emoji.show')) err('ảnh lỗi phải hiện emoji fallback');
  }

  // Reply sticker picker is also the existing comment system, and sticker-only replies work.
  const replyButton = host.querySelector('.cmt-item [data-reply]');
  replyButton && replyButton.click();
  const replyOpen = open('comment-1');
  replyOpen && replyOpen.click();
  const replySticker = choose('comment-1', 'sso-brick');
  replySticker && replySticker.click();
  const replySend = host.querySelector('[data-reply-send="comment-1"]');
  replySend && replySend.click();
  await wait(80);
  if (calls.length !== 2 || calls[1].text !== '' || calls[1].stickerId !== 'sso-brick' || calls[1].parentId !== 'comment-1') {
    err('reply sticker-only phải giữ parentId và đi qua endpoint comments hiện có');
  }
  if (!host.querySelector('.cmt-thread.is-reply .cmt-sticker-posted')) err('reply sticker phải hiển thị trong thread hiện có');
  if (p.errors.length) {
    console.log(JSON.stringify({ errors0: p.errors, calls: calls.length }, null, 1));
    process.exit(1);
  }
  console.log(JSON.stringify({ errors0: [], rootSticker: calls[0].stickerId, replySticker: calls[1].stickerId, endpoint: 'POST /api/comments/:slug' }, null, 1));
  p.dom.window.close();
  process.exit(0);
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
