/* ============================================================================
   t_comment_anchor.js · “bình luận chương này bị lẫn vào chương khác”
   ----------------------------------------------------------------------------
   GỐC BỆNH: bình luận lưu `ch` = VỊ TRÍ trong danh sách chương ĐANG HIỆN, mà
   danh sách này thay đổi theo thời gian — chương hẹn giờ lên sóng giữa danh
   sách, admin xoá / đảo / chèn chương — nên mọi vị trí sau điểm đổi dịch
   chuyển và bình luận cũ dính sang chương hàng xóm.

   THUỐC: mỗi bình luận mang `chTitle` (tên chương đầy đủ lúc gửi) làm MỎ NEO.
   Khi hiển thị, ưu tiên tìm chương HIỆN TẠI đúng tên đó (gần vị trí cũ nhất
   khi trùng tên); không thấy → chương đã xoá/đổi tên: chỉ hiện ở “Tất cả” với
   đúng tên đã lưu, KHÔNG dính vào chương nào khác. Bình luận cũ chưa có
   chTitle thì hành xử như trước (theo vị trí).

   Chạy:  node tests/t_comment_anchor.js
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, dataFetch, read, ROOT } = require('./mk');

const BASE = 'https://cms.test';
const J = (b, ok, st) => Promise.resolve({ ok: ok !== false, status: st || 200, json: () => Promise.resolve(b) });
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Worker giả đúng hành vi thật (worker/cms.js postComment): bình luận gốc nhận
   chTitle từ client; trả lời kế thừa CẢ ch lẫn chTitle của bình luận cha. */
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
          stickerId: b.stickerId || '', ch: parent ? (Number(parent.ch) || 0) : (Number(b.ch) || 0),
          chTitle: parent ? String(parent.chTitle || '') : String(b.chTitle || '').replace(/\s+/g, ' ').trim().slice(0, 200),
          parentId: parent ? parent.id : '', guest: true, createdAt: new Date().toISOString()
        };
        arr.unshift(c);
        return J({ ok: true, comment: c, count: arr.length, guest: true, reply: !!parent });
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
  /* third-person: vị trí 2 = “Chương 1: Học Sinh Mới”, vị trí 3 = “Chương 2:
     Hạt Mầm”, vị trí 4 = “Chương 3: Thịt Viên…”, vị trí 6 = “Chương 5: Cuốn
     Vở”. Bốn bình luận dưới đây TƯỜNG TƯỢNG đã gửi khi kho chương còn khác —
     `ch` trôi, chỉ có chTitle còn đúng. */
  const S = { cmts: { 'third-person': [
    /* chung của bộ */
    { id: 'a0', uid: 'g:a', name: 'Lan', text: 'TXT-CHUNG', ch: 0, chTitle: '', guest: true, createdAt: new Date(Date.now() - 900e3).toISOString() },
    /* neo “Chương 2” nhưng ch trôi về 2 (giờ Chương 2 nằm ở vị trí 3) */
    { id: 'a1', uid: 'g:b', name: 'Minh', text: 'TXT-NEO-CH2', ch: 2, chTitle: 'Chương 2: Hạt Mầm', guest: true, createdAt: new Date(Date.now() - 800e3).toISOString() },
    /* neo “Chương 5”, ch = 6 khớp vị trí hiện tại */
    { id: 'a2', uid: 'g:c', name: 'Hà', text: 'TXT-NEO-CH5', ch: 6, chTitle: 'Chương 5: Cuốn Vở', guest: true, createdAt: new Date(Date.now() - 700e3).toISOString() },
    /* chương đã bị xoá — không được dính vào chương nào */
    { id: 'a3', uid: 'g:d', name: 'Nam', text: 'TXT-MO-COI', ch: 4, chTitle: 'Chương 40: Đã Bị Xoá', guest: true, createdAt: new Date(Date.now() - 600e3).toISOString() },
    /* bình luận đời cũ: không có chTitle → theo vị trí như trước */
    { id: 'a4', uid: 'g:e', name: 'Vy', text: 'TXT-CU-KHONG-CO-TITLE', ch: 4, chTitle: '', guest: true, createdAt: new Date(Date.now() - 500e3).toISOString() }
  ] }, items: {} };
  const api = makeApi(log, S);
  const fetchMock = dataFetch({ apiBase: BASE, api, log });

  /* mở thẳng /chuong-3/ (vị trí 3 = “Chương 2: Hạt Mầm”) */
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/chuong-3/',
    config: { CZ_API: BASE },
    fetch: fetchMock
  });
  const { win, doc, errors } = p;
  const $ = s => doc.querySelector(s);
  await wait(1800);

  const box = $('#rdCmts');
  const tabOn = () => ((box.querySelector('.cmt-filters .tab.on') || {}).textContent || '').trim();
  const rows = () => [...box.querySelectorAll('.cmt-item')];
  const texts = () => rows().map(r => (r.querySelector('.cmt-text') || {}).textContent || '');
  const badges = () => rows().map(r => (r.querySelector('.cmt-ch') || {}).textContent || '');
  const tabDau = tabOn();

  ok(/^Chương 2/.test(tabOn()), '1. tab đang mở phải là “Chương 2” (đang: ' + tabOn() + ')');

  /* 1 — neo lại theo tên: TXT-NEO-CH2 (ch trôi) phải về đúng tab “Chương 2” */
  const t = texts().join('|');
  ok(t.indexOf('TXT-NEO-CH2') >= 0, '1. bình luận neo “Chương 2: Hạt Mầm” phải hiện ở tab Chương 2 dù ch đã trôi');
  ok(t.indexOf('TXT-CHUNG') >= 0, '1. bình luận chung của bộ vẫn hiện');
  ok(t.indexOf('TXT-CU-KHONG-CO-TITLE') < 0, '1b. bình luận vị trí 4 (không có neo) không được lọt vào tab này');
  ok(t.indexOf('TXT-NEO-CH5') < 0, '1c. bình luận neo chương khác không được lọt vào');
  ok(t.indexOf('TXT-MO-COI') < 0, '1d. bình luận của chương ĐÃ XOÁ không được dính vào chương nào');
  /* con số trên tab = số dòng đang hiện */
  const tabCount = (box.querySelector('.cmt-filters .tab.on .ct') || {}).textContent || '0';
  ok(tabCount === String(rows().length), '2. số trên tab phải bằng số dòng đang hiện (' + tabCount + ' vs ' + rows().length + ')');

  /* 3 — gửi bình luận mới: payload phải mang chTitle của chương đang mở */
  const openBtn = box.querySelector('[data-openform]');
  if (openBtn) openBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(120);
  const ta = box.querySelector('[data-text]');
  ok(!!ta, '3. phải mở được ô viết bình luận');
  if (ta) {
    ta.value = 'TXT-MOI-GUI-TU-CHUONG-2';
    box.querySelector('[data-send]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(400);
  }
  const postBody = JSON.parse((log.filter(l => /^POST \{/.test(l)).slice(-1)[0] || 'POST {}').slice(5) || '{}');
  ok(postBody.ch === 3, '3. gửi lên phải là vị trí chương (3), đang: ' + postBody.ch);
  ok(postBody.chTitle === 'Chương 2: Hạt Mầm', '3b. gửi lên phải kèm chTitle “Chương 2: Hạt Mầm” (đang: ' + postBody.chTitle + ')');
  ok(texts().join('|').indexOf('TXT-MOI-GUI-TU-CHUONG-2') >= 0, '3c. câu vừa gửi phải nằm ngay trong tab chương');

  /* 4 — lật sang vị trí 4 (Chương 3): chỉ bình luận đời cũ theo vị trí */
  $('#navNext').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(700);
  const t4 = texts().join('|');
  ok(/^Chương 3/.test(tabOn()), '4. lật chương thì tab phải đổi sang “Chương 3” (đang: ' + tabOn() + ')');
  ok(t4.indexOf('TXT-CU-KHONG-CO-TITLE') >= 0, '4. bình luận đời cũ (không neo) vẫn theo vị trí như trước');
  ok(t4.indexOf('TXT-NEO-CH2') < 0, '4b. bình luận neo “Chương 2” không được lẫn sang đây');
  ok(t4.indexOf('TXT-MOI-GUI-TU-CHUONG-2') < 0, '4c. bình luận vừa gửi ở chương trước không lẫn sang');

  /* 5 — “Tất cả”: mồ côi hiện với ĐÚNG tên đã lưu, không gán vào chương nào */
  const fAll = box.querySelector('.cmt-filters [data-f="all"]');
  fAll.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(250);
  const items = rows();
  const orphan = items.find(r => (r.querySelector('.cmt-text') || {}).textContent === 'TXT-MO-COI');
  ok(!!orphan, '5. bình luận của chương đã xoá phải hiện ở “Tất cả”');
  ok(!!orphan && (orphan.querySelector('.cmt-ch') || {}).textContent === 'Chương 40: Đã Bị Xoá',
    '5b. nhãn của nó phải là tên chương đã lưu (đang: ' + (orphan && (orphan.querySelector('.cmt-ch') || {}).textContent) + ')');
  const neo = items.find(r => (r.querySelector('.cmt-text') || {}).textContent === 'TXT-NEO-CH2');
  ok(!!neo && (neo.querySelector('.cmt-ch') || {}).textContent === 'Chương 2',
    '5c. nhãn của bình luận neo phải là “Chương 2” (đang: ' + (neo && (neo.querySelector('.cmt-ch') || {}).textContent) + ')');

  /* 6 — trả lời một bình luận mồ côi: câu trả lời dính neo của cha, không dính
     vào chương người đọc đang mở */
  const repBtn = orphan && orphan.querySelector('[data-reply]');
  if (repBtn) repBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(150);
  const rootId = orphan && orphan.getAttribute('data-id');
  const replyTa = rootId ? doc.querySelector('#rdCmts [data-reply-text="' + rootId + '"]') : null;
  if (replyTa) {
    replyTa.value = 'TXT-TRA-LOI-MO-COI';
    replyTa.dispatchEvent(new win.Event('input', { bubbles: true }));
  }
  const sendBtn = rootId ? box.querySelector('[data-reply-send="' + rootId + '"]') : null;
  if (sendBtn) sendBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await wait(400);
  const replyBody = JSON.parse((log.filter(l => /^POST \{/.test(l)).slice(-1)[0] || 'POST {}').slice(5) || '{}');
  ok(replyBody.parentId === rootId, '6. trả lời phải gửi kèm parentId của bình luận cha');
  const posted = S.cmts['third-person'].find(c => c.text === 'TXT-TRA-LOI-MO-COI');
  ok(!!posted && posted.chTitle === 'Chương 40: Đã Bị Xoá',
    '6b. trả lời phải kế thừa chTitle của bình luận cha (đang: ' + (posted && posted.chTitle) + ')');

  if (errors.length) bad.push('lỗi JS khi chạy: ' + errors.slice(0, 3).join(' | '));

  console.log(JSON.stringify({
    errors0: bad,
    daKiem: {
      tabLucDau: tabDau,
      soDong: rows().length,
      chuGuiLen: { ch: postBody.ch, chTitle: postBody.chTitle },
      traLoiKeThua: posted && posted.chTitle
    }
  }, null, 1));
  if (bad.length) { bad.forEach(b => console.error('✗ ' + b)); process.exit(1); }
})();
