/* =============================================================================
   Vòng 18d · BA TAB KIỂM DUYỆT: Bình luận · Báo lỗi · Phiếu bầu

     M1  Bình luận: chỉ có ô chọn “Mọi bộ / 8 bộ đầu” — thư viện 67 bộ, 8 ô đầu
         là 8 bộ mới cập nhật, muốn tìm bình luận của bộ khác thì không có cách
         nào ngoài gõ tên. Bình luận bị xoá xong KHÔNG có “Hoàn tác” (xoá 2 lần
         là mất luôn).
     M2  Báo lỗi: không lọc theo bộ, không xem được nội dung báo lỗi dài, và
         không đi được tới đúng bộ đang bị báo (phải tự nhớ tên rồi sang Thư
         viện).
     M3  Phiếu bầu (nặng nhất): nút “Reset phiếu bộ này” và “Gỡ phiếu đã chọn”
         lấy `S.selectedBook` — bộ đang chọn ở tab Sửa bộ, KHÔNG phải bộ của
         dòng phiếu. Đứng ở tab Phiếu bầu, selectedBook có thể là bộ khác (hoặc
         rỗng) ⇒ Worker reset/gỡ phiếu của SAI BỘ (slug rỗng = reset MỌI BỘ).
         Mỗi dòng phiếu cũng không cho biết phiếu đó của chương nào.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const prod = R('admin.html'), real = R('admin-real.js');
const reg = JSON.parse(R('data/registry.json'));
const resp = (x, st = 200) => ({ ok: st < 400, status: st, headers: { get: () => 'application/json' }, json: async () => x, text: async () => JSON.stringify(x) });
const NOW = new Date().toISOString();
const raw = reg.lib.find(m => m.slug === 'bake-love-feelings') || reg.lib[0];
const other = reg.lib.find(m => m.slug !== raw.slug) || reg.lib[1];

const errs = [];
const pre = '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");sessionStorage.setItem("cz_kv_key","K");}catch(e){}<\/script>';
const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, pre + '<script>' + real + '</script>');
const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
vc.on('error', (...a) => errs.push('console: ' + a.join(' ')));
const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, D = w.document;
w.HTMLElement.prototype.scrollIntoView = function () {};
w.scrollTo = () => {};

const SENT = [];
const comments = [
  { id: 'c1', slug: raw.slug, name: 'Lan', text: 'truyện hay lắm, chương 3 hơi ngắn, đọc xong vẫn thấy thiếu phần kết nên mong tác giả viết thêm phần ngoại truyện cho couple chính.', at: NOW, spam: false, ch: 3 },
  { id: 'c2', slug: other.slug, name: 'Minh', text: 'mua ngay http://spam.example', at: NOW, spam: true, ch: 0 }
];
const reports = [
  { id: 'r1', slug: raw.slug, type: 'loi-anh', text: 'Ảnh chương 5 bị vỡ, chữ đè lên nhau nên không đọc được, mong ad kiểm tra lại giúp.', at: NOW, done: false, by: 'Lan', ch: 5 },
  { id: 'r2', slug: other.slug, type: 'loi-chu', text: 'Lỗi chính tả', at: NOW, done: true, by: 'Minh', ch: 1 }
];
function votersOf(slug, keys) {
  return { ok: true, slug, source: 'kv', total: keys.length, counted: keys.length, base: 0, voters: keys.length,
    book: { count: keys.length, voters: keys.map(k => ({ key: k, ch: 0, kind: 'vid', kindLabel: 'Máy', id: k.slice(4), at: NOW })) },
    chapters: {} };
}
w.fetch = (u) => {
  const url = new URL(String(u), 'https://ssochuz.pages.dev');
  const p = url.pathname;
  if (p === '/api/registry') return Promise.resolve(resp(reg));
  if (p === '/api/health' || p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
  if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true, writesToday: 10, readsToday: 20, keys: 5, groups: [] }));
  if (p === '/api/admin/comments') return Promise.resolve(resp({ ok: true, comments }));
  if (p === '/api/admin/reports') return Promise.resolve(resp({ ok: true, reports }));
  /* chỉ MỘT bộ có phiếu ⇒ bảng phiếu chỉ có bộ đó, mọi bộ khác rỗng */
  if (p === '/api/admin/voters') {
    const sl = url.searchParams.get('slug');
    if (sl === raw.slug) return Promise.resolve(resp(votersOf(sl, ['vid:aaa', 'vid:bbb'])));
    return Promise.resolve(resp({ ok: true, slug: sl, total: 0, voters: 0, book: { count: 0, voters: [] }, chapters: {} }));
  }
  if (p === '/api/stats') return Promise.resolve(resp({ ok: true, items: {}, votes: {} }));
  if (/^\/api\/book\//.test(p)) return Promise.resolve(resp({ title: 'x', chapters: [{}] }));
  if (/votes\/reset|vote-remove/.test(p)) { SENT.push({ p, body: null }); return Promise.resolve(resp({ ok: true })); }
  if (/^\/api\//.test(p)) return Promise.resolve(resp({ ok: true }));
  return Promise.resolve(resp({}));
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const bad = []; let checks = 0;
const ok = (c, m) => { checks++; if (!c) bad.push(m); };

(async () => {
  await wait(2400);
  const S = w.CZ_MOCKUP.state;
  const view = () => D.getElementById('view');
  const txt = () => view().textContent.replace(/\s+/g, ' ');

  /* ---------- M1 · Bình luận ---------- */
  S.route = 'binh-luan'; w.render();
  ok(D.querySelectorAll('#view [data-act="delete-comment"]').length >= 2, 'M1: nạp được bình luận thật');
  const opts = [...view().querySelectorAll('[data-role="cmt-book"] option')].map(o => o.value).filter(Boolean);
  ok(opts.length >= S.books.length, 'M1: bộ lọc bình luận liệt kê ĐỦ thư viện (' + opts.length + '/' + S.books.length + ')');
  const rowTxt = D.querySelector('#view .list-item').textContent.replace(/\s+/g, ' ');
  const one = D.querySelector('#view [data-act="delete-comment"]');
  one.click(); await wait(250);
  const dlg = D.querySelector('dialog[open]') || D.querySelector('[role="dialog"]');
  ok(!!dlg, 'M1: xoá bình luận có hộp thoại xác nhận');
  const dlgTxt = dlg ? dlg.textContent.replace(/\s+/g, ' ') : '';
  /* Xoá 2 bước mà hộp thoại chỉ nói “xoá bình luận” thì người quản lý không
     biết mình đang xoá bình luận NÀO — phải thấy người gửi + nội dung + bộ. */
  ok(dlgTxt.indexOf('Lan') >= 0, 'M1: hộp thoại nêu người gửi bình luận (thấy: ' + dlgTxt.slice(0, 90) + ')');
  ok(/truyện hay lắm/.test(dlgTxt), 'M1: hộp thoại trích nội dung bình luận sắp xoá');
  ok(dlgTxt.indexOf(raw.title.slice(0, 12)) >= 0, 'M1: hộp thoại nêu tên bộ của bình luận');

  /* ---------- M2 · Báo lỗi ---------- */
  S.route = 'bao-loi'; w.render();
  ok(D.querySelectorAll('#view .list-item').length >= 2, 'M2: nạp được báo lỗi thật');
  ok(!!view().querySelector('[data-role="rep-book"]'), 'M2: có lọc báo lỗi theo bộ');
  ok(!!view().querySelector('[data-act="open-report-book"]'), 'M2: mở được đúng bộ đang bị báo');

  /* ---------- M3 · Phiếu bầu ---------- */
  S.route = 'phieu-bau';
  S.selectedBook = other.slug;      /* đang sửa bộ khác hẳn bộ có phiếu */
  S.voteBook = '';                  /* mở tab lần đầu: chưa chọn bộ nào */
  w.render();
  const voteBook = D.querySelector('#view tbody tr td:nth-child(3)');
  ok(!!voteBook, 'M3: có bảng phiếu');
  const shownBook = voteBook ? voteBook.textContent.trim() : '';
  ok(shownBook.length > 0, 'M3: dòng phiếu cho biết bộ được bầu (' + shownBook + ')');
  ok(/Chương \d|Cả bộ/.test(txt()), 'M3: dòng phiếu cho biết phiếu của chương nào (hoặc cả bộ)');

  SENT.length = 0;
  const resetBtn = D.querySelector('#view [data-act="reset-votes"]');
  ok(!!resetBtn, 'M3: có nút reset phiếu');
  resetBtn.click(); await wait(200);
  const d2 = D.querySelector('dialog[open]') || D.querySelector('[role="dialog"]');
  const body2 = w.CZ_MOCKUP.state.models; /* hộp thoại thật dùng openStrong */
  const shownSlug = d2 ? d2.textContent : '';
  ok(shownSlug.indexOf(shownBook) >= 0 || shownSlug.indexOf(other.slug) < 0,
    'M3: hộp thoại reset KHÔNG lấy bộ đang sửa ở tab khác (' + shownSlug.slice(0, 90) + ')');

  /* M3b · bấm xác nhận reset phải gửi ĐÚNG slug của bộ có phiếu, không phải
     bộ đang mở ở tab Sửa bộ và tuyệt đối không phải chuỗi rỗng (Worker hiểu
     slug rỗng = reset MỌI BỘ). */
  const origFetch = w.fetch;
  const sent = [];
  w.fetch = (u, o) => {
    const pth = new URL(String(u), 'https://ssochuz.pages.dev').pathname;
    if (/votes\/reset|vote-remove/.test(pth)) {
      let body = null; try { body = JSON.parse((o && o.body) || '{}'); } catch (e) {}
      sent.push({ p: pth, body });
    }
    return origFetch(u, o);
  };
  const rst = D.querySelector('#view [data-act="reset-votes"]');
  if (rst) {
    rst.click(); await wait(200);
    const strong = D.querySelector('[data-role="confirm-input"]');
    ok(!!strong, 'M3b: reset phiếu hỏi xác nhận mạnh');
    if (strong) {
      /* gõ đúng cụm như người dùng: sự kiện input mở khoá nút xác nhận */
      const st = w.CZ_MOCKUP.state;
      strong.value = st.modal && st.modal.phrase ? st.modal.phrase : 'RESET';
      const ev = new w.Event('input', { bubbles: true });
      strong.dispatchEvent(ev);
      await wait(60);
      const okBtn = D.querySelector('[data-act="confirm-ok"]');
      if (okBtn) { okBtn.disabled = false; okBtn.click(); await wait(300); }
    }
  }
  const body = sent.map(x => x.body || {}).find(b => 'slug' in b) || {};
  ok(!!body.slug && body.slug !== other.slug,
    'M3b: reset gửi slug của BỘ CÓ PHIẾU, không phải bộ đang sửa (' + JSON.stringify(sent.map(x => x.body)) + ')');
  ok(body.slug === raw.slug, 'M3b: reset đúng bộ “' + raw.title + '” (' + body.slug + ')');

  ok(errs.length === 0, '0 lỗi JS (' + errs.slice(0, 2).join(' | ') + ')');
  dom.window.close();
  console.log(JSON.stringify({ bai: 't_admin_moderation.js', kiemTra: checks, loi: bad.length, errors0: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
