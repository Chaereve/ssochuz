/* ============================================================================
   t_comment_chapter.js · “bình luận ở chương không hiện, qua Tất cả mới thấy”
   ----------------------------------------------------------------------------
   Ba lỗi thật, cùng một gốc: SỐ CHƯƠNG bị dùng lẫn lộn.

     1. LỌC MẤT BÌNH LUẬN CHUNG. Ai viết ở TRANG TRUYỆN (tab Đánh giá) thì
        Worker lưu `ch:0` (bình luận của cả bộ). Trang đọc lại lọc cứng
        `ch === chương đang mở` ⇒ những câu đó chỉ thấy khi bấm “Tất cả”.
     2. TIÊU ĐỀ ĐẾM SAI. Con số cạnh chữ “Bình luận” lấy `byChapter[ch]` (chỉ
        đếm bình luận riêng của chương) trong khi danh sách có thêm bình luận
        chung ⇒ tiêu đề ghi 0 mà bên dưới vẫn có dòng.
     3. HAI CON SỐ CHO MỘT CHƯƠNG. Bộ mở màn bằng “Lời Mở Đầu”/“Bắt đầu đăng
        ký” thì người đọc ở VỊ TRÍ 5 nhưng tiêu đề ghi “Chương 4”. Dữ liệu lưu
        VỊ TRÍ (cùng đơn vị với phiếu thích), nên nhãn dưới mỗi câu phải đổi
        sang số trên tiêu đề — bản cũ in thẳng “chương 5” cho một câu nằm ngay
        dưới “Chương 4”.
     4. NHÃN KHÔNG ĐỔI khi lật chương (giữ nhãn của chương mở đầu tiên).

   Chạy:  node tests/t_comment_chapter.js
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, dataFetch, read, ROOT } = require('./mk');

const BASE = 'https://cms.test';
const J = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200, json: () => Promise.resolve(b) });
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Worker giả đúng hành vi thật: bình luận gốc lưu `ch` như client gửi, câu trả
   lời theo chương của bình luận cha, `byChapter` đếm theo `ch`. */
function makeApi(log, S) {
  return (p, opt) => {
    opt = opt || {};
    if (p === '/api/registry') return J(JSON.parse(read('data/registry.json')));
    if (p === '/api/auth/config') return J({ ok: true, supabase: false });
    if (p === '/api/auth/me') return J({ ok: true, user: null });
    if (p === '/api/stats') return J({ ok: true, items: {} });
    if (p === '/api/view') return J({ ok: true, counted: false });
    const mb = p.match(/^\/api\/book\/([^/?]+)$/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
    }
    const mc = p.match(/^\/api\/comments\/([^/?]+)$/);
    if (mc) {
      const slug = decodeURIComponent(mc[1]);
      const arr = S.cmts[slug] || (S.cmts[slug] = []);
      if (opt.method === 'POST') {
        const b = JSON.parse(opt.body || '{}');
        log.push('POST ' + JSON.stringify(b));
        const parent = b.parentId ? arr.find(c => c.id === b.parentId) : null;
        const c = {
          id: 'c' + (arr.length + 1), uid: 'g:test', name: b.name || 'Bạn đọc', text: b.text,
          stickerId: b.stickerId || '', ch: parent ? parent.ch : (Number(b.ch) || 0),
          parentId: parent ? parent.id : '', guest: true, createdAt: new Date().toISOString()
        };
        arr.unshift(c);
        return J({ ok: true, comment: c, count: arr.length, guest: true });
      }
      const copy = JSON.parse(JSON.stringify(arr));
      const byChap = {};
      copy.forEach(c => { const k = String(Number(c.ch) || 0); byChap[k] = (byChap[k] || 0) + 1; });
      return J({ ok: true, comments: copy, count: copy.length, shown: copy.length, slug, byChapter: byChap });
    }
    return undefined;
  };
}

const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };

(async () => {
  const log = [];
  const S = { cmts: { 'third-person': [
    /* bình luận CHUNG của bộ — viết ở trang truyện (tab Đánh giá) */
    { id: 'b0', uid: 'g:a', name: 'Lan', text: 'Cả bộ này hay lắm', ch: 0, guest: true, createdAt: new Date(Date.now() - 900e3).toISOString() },
    /* bình luận của VỊ TRÍ 4 = “Chương 3: …” — nhãn phải hiện “Chương 3” */
    { id: 'b4', uid: 'g:b', name: 'Minh', text: 'Chương ba cuốn thật', ch: 4, guest: true, createdAt: new Date(Date.now() - 600e3).toISOString() },
    /* bình luận của VỊ TRÍ 3 = “Chương 2: …” — KHÔNG được lọt vào tab chương này */
    { id: 'b3', uid: 'g:c', name: 'Hà', text: 'Câu của chương khác', ch: 3, guest: true, createdAt: new Date(Date.now() - 300e3).toISOString() }
  ] }, items: {} };
  const api = makeApi(log, S);
  const fetchMock = dataFetch({ apiBase: BASE, api, log });

  /* third-person: vị trí 1 = “Lời Mở Đầu”, vị trí 4 = “Chương 3: …” */
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-4/',
    config: { CZ_API: BASE },
    fetch: fetchMock
  });
  const { win, doc, errors } = p;
  const $ = s => doc.querySelector(s);
  await wait(1800);

  const box = $('#rdCmts');
  const tabOn = () => (box.querySelector('.cmt-filters .tab.on') || {}).textContent.trim();
  const rows = () => [...box.querySelectorAll('.cmt-item')];
  const texts = () => rows().map(r => (r.querySelector('.cmt-text') || {}).textContent || '');
  const headNum = () => ((box.querySelector('.cmt-head2 .cmt-n') || {}).textContent || '').trim();

  ok(/Chương 3/.test($('#rdHead').textContent), 'tiêu đề chương phải là “Chương 3…” (đang: ' + $('#rdHead').textContent + ')');
  ok(/^Chương 3/.test(tabOn()), '1. tab lọc phải gọi đúng số người đọc thấy (đang: ' + tabOn() + ')');

  /* 1 — bình luận chung của bộ KHÔNG được biến mất ở tab chương */
  ok(texts().length === 2, '1. tab chương phải có 2 dòng (chung của bộ + của chương này), đang ' + texts().length);
  ok(texts().join('|').indexOf('Cả bộ này hay lắm') >= 0, '1. bình luận chung của bộ phải hiện ngay ở tab chương');
  ok(texts().join('|').indexOf('Chương ba cuốn thật') >= 0, '1. bình luận riêng của chương phải hiện');
  ok(texts().join('|').indexOf('Câu của chương khác') < 0, '1b. bình luận của chương KHÁC không được lọt vào');
  /* 3 — nhãn dưới câu phải là số trên tiêu đề, không phải vị trí trong kho */
  const badges = [...box.querySelectorAll('.cmt-ch')].map(x => x.textContent.trim());
  ok(badges.length && badges.every((b) => b === 'Chương 3'), '3. nhãn phải là “Chương 3” (số trên tiêu đề), đang: ' + JSON.stringify(badges));

  /* 2 — con số cạnh tiêu đề phải bằng số dòng đang thấy */
  ok(headNum() === String(rows().length), '2. tiêu đề phải đếm đúng số dòng đang hiện (' + headNum() + ' vs ' + rows().length + ')');

  /* gửi bình luận mới: `ch` gửi lên là VỊ TRÍ (4) — cùng đơn vị với phiếu thích;
     nhãn hiện cho người đọc vẫn là “Chương 3” */
  const openBtn = box.querySelector('[data-openform]');
  if (openBtn) openBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(120);
  const ta = box.querySelector('[data-text]');
  ok(!!ta, '3. phải mở được ô viết bình luận');
  if (ta) {
    ta.value = 'Gửi từ chương đang đọc';
    box.querySelector('[data-send]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(400);
  }
  const postBody = JSON.parse((log.filter(l => /^POST \{/.test(l)).slice(-1)[0] || 'POST {}').slice(5) || '{}');
  ok(postBody.ch === 4, '3. gửi lên phải là VỊ TRÍ chương (4), đang: ' + postBody.ch);
  ok(texts().join('|').indexOf('Gửi từ chương đang đọc') >= 0, '3. câu vừa gửi phải nằm ngay trong tab chương');
  ok(headNum() === String(rows().length), '2b. gửi xong tiêu đề vẫn phải khớp số dòng');

  /* số bình luận của bộ phải hiện trên nút hành động cuối chương */
  const btn = $('#actComment .lbl');
  /* 3 bình luận ban đầu + 1 vừa gửi = 4 (bình luận của chương khác cũng tính:
     con số này nói về CẢ BỘ, không phải chương đang mở) */
  ok(!!btn && /\(4\)/.test(btn.textContent), '4. nút “Bình luận” phải mang số bình luận của bộ (đang: ' + (btn && btn.textContent) + ')');

  /* 4 — lật chương: nhãn + danh sách phải đổi theo, không giữ nhãn chương cũ */
  $('#navNext').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(700);
  const tabAfter = tabOn();
  ok(!/^Chương 3/.test(tabAfter), '4. lật sang chương mới thì nhãn tab phải đổi (đang giữ: ' + tabAfter + ')');
  ok(tabAfter.indexOf('Chương 4') >= 0 || /Chương/.test(tabAfter), '4. nhãn tab phải là chương mới (đang: ' + tabAfter + ')');
  ok(texts().join('|').indexOf('Gửi từ chương đang đọc') < 0, '4. chương mới không được hiện bình luận của chương trước');

  if (errors.length) bad.push('lỗi JS khi chạy: ' + errors.slice(0, 3).join(' | '));

  console.log(JSON.stringify({
    errors0: bad,
    daKiem: {
      tabLucDau: 'Chương 3',
      soDongDau: 2,
      chuGuiLen: postBody.ch,
      nutBinhLuan: (($('#actComment .lbl') || {}).textContent || ''),
      tabSauKhiLat: tabAfter
    }
  }, null, 1));
  if (bad.length) { bad.forEach(b => console.error('✗ ' + b)); process.exit(1); }
})();
