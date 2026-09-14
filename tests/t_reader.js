/* ============================================================================
   Kiểm thử những thứ NGƯỜI DÙNG YÊU CẦU (bản 1.5.0)
   ----------------------------------------------------------------------------
   1. Thích THEO TỪNG CHƯƠNG: thích chương 2 rồi sang chương 3 vẫn chưa thích,
      mỗi chương một phiếu, số phiếu hiện ngay trên nút.
   2. Bấm thích phải làm BẢNG XẾP HẠNG (Top vote) nhảy số, không phải chờ tải lại.
   3. Bình luận nằm NGAY TRONG TRANG ĐỌC, gắn với chương đang đọc, lọc theo chương.
   4. Khách chưa đăng nhập vẫn bình luận được (kèm mã máy), có ô nhập tên.
   5. Icon "Lưu vào tủ" (tủ sách) KHÁC icon "Đánh dấu" (thẻ đánh dấu).
   6. Số chương phải đúng: registry nói 30 nhưng kho chương có 29 → web hiện 29.
   7. Trang chủ có nút ĐĂNG NHẬP cho người đọc thường; mục Quản trị chỉ hiện
      với đúng email quản trị.
   Chạy:  cd tests && node t_reader.js
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { page, dataFetch, read, ROOT } = require('./mk');

const BASE = 'https://cms.test';
const ADMIN_EMAIL = (read('cz-config.js').match(/CZ_ADMIN_EMAILS\s*=\s*\[\s*'([^']+)'/) || [, 'admin@gmail.com'])[1];
const J = (b, ok, st) => Promise.resolve({
  ok: ok !== false, status: st || 200, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b))
});
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Worker giả: phiếu thích theo từng chương + bình luận có chương (đúng dáng 1.5.0) */
function makeApi(log, S) {
  const REG = JSON.parse(read('data/registry.json'));
  return (p, opt) => {
    opt = opt || {};
    log.push((opt.method || 'GET') + ' ' + p + (opt.body ? ' ' + String(opt.body).slice(0, 90) : ''));
    if (p === '/api/registry') return J(REG);
    if (p === '/api/health') return J({ ok: true, version: '1.5.0', kv: true, auth: { supabase: true, session: true, adminEmails: [ADMIN_EMAIL] } });
    if (p === '/api/auth/config') return J({ ok: true, supabase: true, supabaseUrl: 'https://xyz.supabase.co', session: true, adminEmails: [ADMIN_EMAIL] });
    const mb = p.match(/^\/api\/book\/([^/?]+)/);
    if (mb) {
      const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
      return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
    }
    if (p === '/api/stats') return J({ ok: true, source: 'kv', fetchedAt: new Date().toISOString(), items: S.items });
    if (p === '/api/view' && opt.method === 'POST') return J({ ok: true, counted: true });
    if (p === '/api/vote' && opt.method === 'POST') {
      const b = JSON.parse(opt.body || '{}');
      const slug = b.slug, ch = Number(b.ch) || 0;
      const cur = S.items[slug] || (S.items[slug] = { views: 10, votes: 0, viewsDay: 0, votesDay: 0, viewsWeek: 0, votesWeek: 0, viewsMonth: 0, votesMonth: 0 });
      const chap = cur.chapVotes || (cur.chapVotes = {});
      const who = slug + '#' + ch;
      const had = !!S.voted[who];
      if (!!b.vote === had) return J({ ok: true, slug: slug, ch: ch, changed: false, voted: had, votes: chap[ch] || 0, total: cur.votes || 0, chapVotes: chap });
      if (b.vote) { S.voted[who] = 1; chap[ch] = (chap[ch] || 0) + 1; cur.votes = (cur.votes || 0) + 1; cur.votesDay = (cur.votesDay || 0) + 1; cur.votesWeek = (cur.votesWeek || 0) + 1; cur.votesMonth = (cur.votesMonth || 0) + 1; }
      else { delete S.voted[who]; chap[ch] = Math.max(0, (chap[ch] || 0) - 1); cur.votes = Math.max(0, (cur.votes || 0) - 1); }
      return J({ ok: true, slug: slug, ch: ch, changed: true, voted: !!b.vote, votes: chap[ch] || 0, total: cur.votes, chapVotes: chap, votesDay: cur.votesDay, votesWeek: cur.votesWeek, votesMonth: cur.votesMonth });
    }
    const mc = p.match(/^\/api\/comments\/([^/?]+)$/);
    if (mc) {
      const slug = decodeURIComponent(mc[1]);
      const arr = S.cmts[slug] || (S.cmts[slug] = []);
      if (opt.method === 'POST') {
        const b = JSON.parse(opt.body || '{}');
        if (!String(b.text || '').trim()) return J({ ok: false, error: 'bình luận không được trống' }, false, 400);
        if (!b.vid && !b.uid) return J({ ok: false, error: 'không nhận được mã máy' }, false, 400);
        const parentId = String(b.parentId || '');
        const parent = parentId ? arr.find(c => c.id === parentId) : null;
        if (parentId && !parent) return J({ ok: false, error: 'bình luận gốc không còn tồn tại' }, false, 400);
        const c = { id: 'c' + (arr.length + 1), uid: 'g:' + (b.vid || 'x'), name: b.name || 'Bạn đọc', picture: '', text: b.text, ch: parent ? parent.ch : (Number(b.ch) || 0), parentId: parent ? parent.id : '', guest: true, createdAt: new Date().toISOString() };
        arr.unshift(c);
        return J({ ok: true, comment: c, count: arr.length, guest: true, reply: !!parent });
      }
      const copy = JSON.parse(JSON.stringify(arr));       /* Worker thật trả JSON mới mỗi lần */
      const byChap = {};
      copy.forEach((c) => { const k = String(Number(c.ch) || 0); byChap[k] = (byChap[k] || 0) + 1; });
      return J({ ok: true, comments: copy, count: copy.length, shown: copy.length, slug: slug, byChapter: byChap });
    }
    return undefined;
  };
}
/* dataFetch cắt query nên phải tự tách ?ch= để kiểm tra lọc theo chương */
function chFromLog(log) {
  const g = log.filter(l => /GET \/api\/comments\//.test(l));
  return g[g.length - 1] || '';
}

(async () => {
  const out = {};
  const log = [];
  const S = {
    items: { 'third-person': { views: 1234, votes: 56, viewsDay: 12, votesDay: 2, viewsWeek: 120, votesWeek: 20, viewsMonth: 400, votesMonth: 40, chapVotes: {} } },
    voted: {}, cmts: {}
  };
  const api = makeApi(log, S);
  const fetchMock = dataFetch({ apiBase: BASE, api: api, log });

  /* =====================================================================
     1 + 2 + 3 + 5. TRANG ĐỌC: thích theo chương, bình luận trong trang đọc
     ===================================================================== */
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/third-person/',
    config: { CZ_API: BASE },
    fetch: fetchMock
  });
  const { win, doc, errors } = p;
  const LS = win.localStorage;
  const $ = s => doc.querySelector(s), $$ = s => [...doc.querySelectorAll(s)];
  const txt = s => { const e = $(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
  const click = s => { const e = typeof s === 'string' ? $(s) : s; if (!e) return 'MISSING ' + s; e.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); return 'ok'; };
  await wait(1400);

  /* --- vào chương 2 --- */
  win.location.hash = '#chuong-2'; await wait(500);
  out.docChuong2 = {
    sub: txt('#rdSub'),
    nutThich: txt('#actLike'),
    daThich: $('#actLike').classList.contains('on')
  };

  /* --- thích chương 2 --- */
  click('#actLike'); await wait(350);
  out.thichCh2 = {
    lsTheoChuong: LS.getItem('ssochuz-like-third-person-2'),
    lsCuTheoBo: LS.getItem('ssochuz-like-third-person'),      /* khoá cũ phải KHÔNG dùng nữa */
    nut: txt('#actLike'),
    on: $('#actLike').classList.contains('on'),
    goiVote: log.filter(l => l.indexOf('POST /api/vote') === 0).slice(-1)[0] || '',
    tongPhieuTrenChip: txt('#rdVotes')
  };

  /* --- sang chương 3: phiếu của chương 2 không được đi theo --- */
  win.location.hash = '#chuong-3'; await wait(600);
  out.sangCh3 = {
    sub: txt('#rdSub'),
    nutThich: txt('#actLike'),
    daThich: $('#actLike').classList.contains('on'),
    lsCh3: LS.getItem('ssochuz-like-third-person-3')
  };
  /* thích cả chương 3 → hai chương hai phiếu riêng */
  click('#actLike'); await wait(350);
  out.thichCh3 = {
    lsCh2: LS.getItem('ssochuz-like-third-person-2'),
    lsCh3: LS.getItem('ssochuz-like-third-person-3'),
    nut: txt('#actLike'),
    chapVotesTrenWorker: JSON.stringify(S.items['third-person'].chapVotes),
    tongPhieu: S.items['third-person'].votes
  };
  /* bỏ thích chương 3 → chương 2 vẫn còn */
  click('#actLike'); await wait(350);
  out.boThichCh3 = {
    lsCh2: LS.getItem('ssochuz-like-third-person-2'),
    lsCh3: LS.getItem('ssochuz-like-third-person-3'),
    chapVotesTrenWorker: JSON.stringify(S.items['third-person'].chapVotes),
    tongPhieu: S.items['third-person'].votes,
    nut: txt('#actLike')
  };

  /* --- 5. icon tủ sách khác icon thẻ đánh dấu --- */
  const svgSave = ($('#actSave svg') || {}).innerHTML || '';
  const svgMark = ($('#actMark svg') || {}).innerHTML || '';
  out.icons = {
    save: txt('#actSave'), mark: txt('#actMark'),
    khacNhau: !!svgSave && !!svgMark && svgSave !== svgMark,
    saveLaTuSach: /shelf|book/i.test($('#actSave').outerHTML) || svgSave.length > 40,
    savePath: svgSave.replace(/\s+/g, ' ').slice(0, 70),
    markPath: svgMark.replace(/\s+/g, ' ').slice(0, 70)
  };
  /* lưu vào tủ vẫn hoạt động riêng với đánh dấu chương */
  click('#actSave'); await wait(150);
  click('#actMark'); await wait(150);
  out.tuVaDanhDau = {
    shelf: LS.getItem('ssochuz-shelf'),
    mark: LS.getItem('ssochuz-mark-third-person'),
    nutLuu: txt('#actSave'),
    nutDanhDau: txt('#actMark')
  };

  /* --- 3 + 4. bình luận ngay trong trang đọc --- */
  click('#actComment'); await wait(700);
  const cbox = $('#rdCmts');
  out.binhLuanTrongTrangDoc = {
    coKhung: !!cbox && !!cbox.querySelector('.cmt-wrap'),
    moRong: cbox ? cbox.classList.contains('on') : false,
    dauDe: txt('#rdCmts .cmt-head2 b'),
    ghiChuChuong: txt('#rdCmts .cmt-hint'),
    coONhap: !!$( '#rdCmts [data-text]'),
    khachVanGuiDuoc: !!$('#rdCmts [data-send]'),
    coOTen: !!$('#rdCmts [data-name]'),
    goiLoad: chFromLog(log)
  };
  /* gửi bình luận khi chưa đăng nhập → phải kèm ch + vid */
  const ta = $('#rdCmts [data-text]');
  const nm = $('#rdCmts [data-name]');
  if (nm) { nm.value = 'Người Thử'; nm.dispatchEvent(new win.Event('input', { bubbles: true })); }
  if (ta) { ta.value = 'Chương 3 hay quá!'; ta.dispatchEvent(new win.Event('input', { bubbles: true })); }
  click('#rdCmts [data-send]'); await wait(500);
  const postLog = log.filter(l => l.indexOf('POST /api/comments/third-person') === 0).slice(-1)[0] || '';
  out.guiBinhLuan = {
    goi: postLog,
    coChuong: /"ch":3/.test(postLog),
    coMaMay: /"vid":"/.test(postLog),
    coTenKhach: postLog.indexOf('Người Thử') >= 0 || (LS.getItem('ssochuz-cmtname') === 'Người Thử'),
    hienTrongDanhSach: txt('#rdCmts .cmt-list').indexOf('Chương 3 hay quá') >= 0,
    soBinhLuan: txt('#rdCmts .cmt-n'),
    tenMay: LS.getItem('ssochuz-cmtname')
  };
  /* reply ngay dưới bình luận của người khác */
  const rootComment = $('#rdCmts .cmt-item');
  const rootId = rootComment && rootComment.getAttribute('data-id');
  click(rootComment && rootComment.querySelector('[data-reply]')); await wait(150);
  const replyTa = rootId ? doc.querySelector('#rdCmts [data-reply-text="' + rootId + '"]') : null;
  if (replyTa) { replyTa.value = 'Mình cũng thích chương này!'; replyTa.dispatchEvent(new win.Event('input', { bubbles: true })); }
  click(rootId ? '#rdCmts [data-reply-send="' + rootId + '"]' : 'missing'); await wait(500);
  const replyLog = log.filter(l => l.indexOf('POST /api/comments/third-person') === 0).slice(-1)[0] || '';
  out.traLoiBinhLuan = {
    coNutTraLoi: !!rootId,
    coFormTraLoi: !!replyTa,
    guiDungCha: replyLog.indexOf('"parentId":"' + rootId + '"') >= 0,
    hienThiChuoi: !!$('#rdCmts .cmt-thread.is-reply') && txt('#rdCmts .cmt-list').indexOf('Mình cũng thích chương này') >= 0,
    soRepliesTrongKho: S.cmts['third-person'].filter(c => c.parentId === rootId).length
  };

  /* lọc theo chương: chỉ chương 3 */
  const fChap = $('#rdCmts .cmt-filters [data-f="chap"]');
  const fAll = $('#rdCmts .cmt-filters [data-f="all"]');
  click(fChap); await wait(250);
  const soKhiLocChuong = $$('#rdCmts .cmt-item').length;
  click(fAll); await wait(250);
  const soKhiXemTatCa = $$('#rdCmts .cmt-item').length;
  out.locTheoChuong = {
    coNutLoc: !!fChap && !!fAll,
    nhanNut: fChap ? fChap.textContent.trim().replace(/\s+/g, ' ') : '<null>',
    soKhiLocChuong: soKhiLocChuong,
    soKhiXemTatCa: soKhiXemTatCa,
    chuongCuaBinhLuan: (S.cmts['third-person'][0] || {}).ch
  };

  /* =====================================================================
     6. SỐ CHƯƠNG: registry nói 30, kho chương có 29 → web phải hiện 29
     ===================================================================== */
  {
    const reg2 = JSON.parse(read('data/registry.json'));
    const angel = reg2.lib.find(n => n.slug === 'be-my-angel');
    const thatTrongFile = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data/book/be-my-angel.json'), 'utf8')).chapters || []).length;
    const soSai = thatTrongFile + 1;                     /* 30 — con số web đang hiện sai */
    angel.chapters = soSai;
    angel.countLabel = soSai + '/' + soSai;
    const api2 = (p, opt) => {
      opt = opt || {};
      if (p === '/api/registry') return J(JSON.parse(JSON.stringify(reg2)));
      const mb = p.match(/^\/api\/book\/([^/?]+)/);
      if (mb) {
        const f = path.join(ROOT, 'data/book', decodeURIComponent(mb[1]) + '.json');
        return fs.existsSync(f) ? J(JSON.parse(fs.readFileSync(f, 'utf8'))) : J({ ok: false }, false, 404);
      }
      if (p === '/api/stats') return J({ ok: true, source: 'kv', items: {} });
      if (p === '/api/view' && opt.method === 'POST') return J({ ok: true, counted: true });
      return undefined;
    };
    const p2 = page('truyen.html', {
      url: 'https://ssochuz.pages.dev/truyen/be-my-angel/',
      config: { CZ_API: BASE },
      fetch: dataFetch({ apiBase: BASE, api: api2 })
    });
    await wait(1600);
    const d2 = p2.doc;
    const t2 = s => { const e = d2.querySelector(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
    const infoRows = [...d2.querySelectorAll('#storyInfo .r')]
      .map(r => r.textContent.replace(/\s+/g, ' ').trim())
      .filter(x => /chương/i.test(x));
    out.soChuong = {
      registryNoi: soSai,
      chuongThat: thatTrongFile,
      dongChuong: t2('#chapCount'),
      oThongTin: infoRows.slice(0, 2),
      soChuongTrongLuoi: d2.querySelectorAll('#chapGrid .cha').length,
      daTuSuaTrongMay: p2.win.localStorage.getItem('ssochuz-realcounts'),
      hienDungSo: t2('#chapCount').indexOf(String(thatTrongFile)) >= 0 && t2('#chapCount').indexOf(String(soSai)) < 0,
      khongConSoSai: !/\b30\b/.test(t2('#chapCount')),
      loi: p2.errors.slice(0, 3)
    };
  }

  /* =====================================================================
     7. TRANG CHỦ: nút đăng nhập cho người đọc; Quản trị chỉ hiện với admin
     ===================================================================== */
  {
    /* (a) người đọc thường, chưa đăng nhập */
    const g = page('index.html', { config: { CZ_API: BASE }, fetch: fetchMock });
    await wait(1400);
    const gd = g.doc;
    const gtxt = s => { const e = gd.querySelector(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
    out.trangChuKhach = {
      coNutDangNhap: !!gd.querySelector('#czAuthBtn'),
      chuTrenNut: gtxt('#czAuthBtn'),
      thayNguoi: !!gd.querySelector('#czAuth .i'),
      lienKetQuanTri: [...gd.querySelectorAll('a[href="/admin"], a[href="/admin.html"]')].length,
      menuCoQuanTri: /quản trị|admin/i.test((gd.querySelector('#czAuthMenu') || {}).innerHTML || ''),
      theQuanTriTrongNav: !!gd.querySelector('#czNav a[href="/admin"], #czNav a[href="/admin.html"]'),
      oDangNhapTrongMySpace: !!gd.querySelector('#banAuth'),
      loi: g.errors.slice(0, 3)
    };
    /* mục Quản trị trong menu điện thoại cũng phải ẩn */
    const burger = gd.querySelector('#czBurger');
    if (burger) burger.dispatchEvent(new g.win.MouseEvent('click', { bubbles: true }));
    await wait(200);
    out.menuMobileKhach = {
      coMucQuanTri: /quản trị/i.test((gd.querySelector('#czMnav') || {}).textContent || ''),
      coDangNhap: /đăng nhập/i.test((gd.querySelector('#czMnav') || {}).textContent || '')
    };

    /* (b) đúng tài khoản quản trị (email trong cz-config.js) */
    const a = page('index.html', {
      config: { CZ_API: BASE }, fetch: fetchMock,
      setup(win) {
        win.localStorage.setItem('ssochuz-user', JSON.stringify({
          uid: 'sb-admin', email: ADMIN_EMAIL, name: 'Chủ Trang', picture: '',
          exp: Math.floor(Date.now() / 1000) + 3600, provider: 'supabase'
        }));
        win.localStorage.setItem('ssochuz-auth-token', 'phien-gia-lap');
      }
    });
    await wait(1400);
    const ad = a.doc;
    const atxt = s => { const e = ad.querySelector(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : '<null>'; };
    out.trangChuQuanTri = {
      nutHienTen: atxt('#czAuthBtn'),
      menuCoMucQuanTri: /quản trị/i.test((ad.querySelector('#czAuthMenu') || {}).textContent || ''),
      duongDan: (ad.querySelector('#czAuthMenu a[href="/admin"]') || {}).getAttribute
        ? ad.querySelector('#czAuthMenu a[href="/admin"]').getAttribute('href') : '<null>',
      huyHieu: /quản trị/i.test((ad.querySelector('#czAuthMenu') || {}).textContent || ''),
      coNutDangXuat: !!ad.querySelector('#czAuthOut'),
      loi: a.errors.slice(0, 3)
    };

    /* (c) người đọc có đăng nhập nhưng KHÔNG phải quản trị */
    const n = page('index.html', {
      config: { CZ_API: BASE }, fetch: fetchMock,
      setup(win) {
        win.localStorage.setItem('ssochuz-user', JSON.stringify({
          uid: 'sb-thuong', email: 'docgia@gmail.com', name: 'Đọc Giả', picture: '',
          exp: Math.floor(Date.now() / 1000) + 3600, provider: 'supabase'
        }));
        win.localStorage.setItem('ssochuz-auth-token', 'phien-gia-lap');
      }
    });
    await wait(1400);
    const nd = n.doc;
    out.trangChuNguoiDongDaDangNhap = {
      nutHienTen: (nd.querySelector('#czAuthBtn') || {}).textContent.trim().replace(/\s+/g, ' '),
      menuCoQuanTri: /quản trị/i.test((nd.querySelector('#czAuthMenu') || {}).textContent || ''),
      coDangXuat: !!nd.querySelector('#czAuthOut'),
      loi: n.errors.slice(0, 3)
    };
  }

  /* =====================================================================
     2b. BẢNG XẾP HẠNG: phiếu thích phải làm Top vote nhảy số
     ===================================================================== */
  {
    const log2 = [];
    const S2 = { items: { 'third-person': { views: 1234, votes: 56, viewsDay: 12, votesDay: 2, viewsWeek: 120, votesWeek: 20, viewsMonth: 400, votesMonth: 40, chapVotes: {} } }, voted: {}, cmts: {} };
    const h = page('index.html', {
      config: { CZ_API: BASE },
      fetch: dataFetch({ apiBase: BASE, api: makeApi(log2, S2), log: log2 })
    });
    await wait(1500);
    const hd = h.doc;
    const rowOf = () => {
      const rows = [...hd.querySelectorAll('#rank a, #rank .rk, #rankBody tr, #rankBody a')];
      const r = rows.find(x => /Third Person/i.test(x.textContent || ''));
      return r ? r.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : '<không thấy Third Person>';
    };
    const truoc = rowOf();
    /* bầu thẳng qua API của web (đúng đường người đọc bấm Thích) */
    await h.win.CZ.vote('third-person', true, 4);
    await wait(500);
    const sau = rowOf();
    out.bangXepHang = {
      truoc: truoc,
      sau: sau,
      daDoi: truoc !== sau,
      phieuTrenWorker: S2.items['third-person'].votes,
      goiVote: log2.filter(l => l.indexOf('POST /api/vote') === 0).slice(-1)[0] || ''
    };
    out.loiTrangChu = h.errors.slice(0, 4);
  }

  out.errors = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
