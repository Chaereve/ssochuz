/* ============================================================================
   app.js · dựng 3 phương án cho nửa dưới trang chủ bằng DỮ LIỆU THẬT
   (books.js lấy từ data/registry.json, bìa lấy từ /assets/covers/).
   Chỉ để xem bố cục — không phải mã của web thật.
   ========================================================================== */
(function () {
  'use strict';
  var B = (window.MOCK_BOOKS || []).slice();
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function vn(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  var IC = {
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    dn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M8 3v18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l6 6L20 6"/></svg>'
  };

  /* ---------------------- chọn dữ liệu cho từng khối ---------------------- */
  function bySlug(s) { for (var i = 0; i < B.length; i++) if (B[i].s === s) return B[i]; return null; }
  var recent = B.slice().sort(function (a, b) { return String(b.u).localeCompare(String(a.u)); }).slice(0, 12);
  var done = B.filter(function (b) { return b.st === 'Hoàn thành' && b.n > 20; });
  var soon = B.filter(function (b) { return b.st === 'Sắp ra mắt'; });
  var adult = B.filter(function (b) { return b.e; });

  var RESUME = [
    { s: 'pls-love', at: 34 },
    { s: 'love-on-hire', at: 18 },
    { s: 'yours-ever', at: 41 },
    { s: 'third-person', at: 27 }
  ].map(function (r) { var b = bySlug(r.s); return b ? { b: b, at: r.at } : null; }).filter(Boolean);

  var RANK = [
    { s: 'pls-love', week: 12480, month: 48210, tr: 'up', d: 3 },
    { s: 'love-on-hire', week: 9240, month: 39120, tr: 'up', d: 1 },
    { s: 'third-person', week: 7815, month: 31040, tr: 'dn', d: 1 },
    { s: 'juliet-n-juliet', week: 6402, month: 28870, tr: 'up', d: 2 },
    { s: 'yours-ever', week: 5190, month: 22140, tr: 'eq', d: 0 }
  ].map(function (r) { var b = bySlug(r.s); return b ? Object.assign({ b: b }, r) : null; }).filter(Boolean);

  var WORTH = ['lunar-secret', 'bake-love-feelings', 'love-design']
    .map(bySlug).filter(Boolean);
  if (WORTH.length < 3) WORTH = done.slice(0, 3);

  /* lịch thật trong data/registry.json (6 mục, “Thứ 7, CN” gộp hai ngày) */
  var SCHED = [
    { wd: 'T2', dt: '03/11', t: 'Người Chồng Lạnh Lùng Của Cô Vợ Béo', s: 'nguoi-chong-lanh-lung-cua-co-vo-beo', ch: 12 },
    { wd: 'T3', dt: '04/11', t: 'Nakira Là Một Kẻ Nhẫn Tâm', s: 'nakira-la-mot-ke-nhan-tam', ch: 8 },
    { wd: 'T4', dt: '05/11', t: 'Cô Vợ Hờ Đanh Đá Của Tôi', s: 'co-vo-ho-danh-da-cua-toi', ch: 5 },
    { wd: 'T5', dt: '06/11', t: 'Bởi Chẳng Thể Ngăn Con Tim Rung Động', s: null, ch: 3 },
    { wd: 'T6', dt: '07/11', t: 'Càng Thêm Oán Hận', s: null, ch: 7 },
    { wd: 'T7', dt: '08/11', t: 'Juliet & Juliet', s: 'juliet-n-juliet', ch: 9 },
    { wd: 'CN', dt: '09/11', t: '', s: null, ch: 0, off: 'nghỉ' }
  ];
  var TODAY = 4;   /* “hôm nay” giả định là T5 để thấy trạng thái nổi bật */

  /* ------------------------------ thành phần ------------------------------ */
  function stCls(b) { return b.st === 'Hoàn thành' ? 'done' : (b.st === 'Sắp ra mắt' ? 'soon' : 'run'); }

  function poster(b, o) {
    o = o || {};
    return '<a class="poster' + (o.big ? ' big' : '') + '" href="/truyen/' + esc(b.s) + '/">' +
      '<span class="cv">' +
        '<img src="' + esc(b.img) + '" alt="' + esc(b.t) + '" loading="lazy">' +
        '<span class="sc"></span>' +
        '<span class="st ' + stCls(b) + '"><i></i>' + esc(b.st) + '</span>' +
        (b.n ? '<span class="ch">' + b.n + ' chương</span>' : '') +
        (b.e ? '<span class="b18">18+</span>' : '') +
      '</span>' +
      '<h3>' + esc(b.t) + '</h3>' +
      '<span class="mt">' + esc(b.a || '—') + '</span>' +
      (o.p ? '<span class="prog"><i style="width:' + o.p + '%"></i></span>' : '') +
      '</a>';
  }

  function resumeCard(r, compact) {
    var b = r.b, pct = b.n ? Math.round(r.at / b.n * 100) : 0, left = b.n ? b.n - r.at : 0;
    return '<a class="resume" href="/doc/' + esc(b.s) + '/">' +
      '<span class="cv"><img src="' + esc(b.img) + '" alt="' + esc(b.t) + '" loading="lazy"></span>' +
      '<span class="bd">' +
        '<h3>' + esc(b.t) + '</h3>' +
        '<span class="sub"><b>Ch. ' + r.at + '</b> / ' + b.n +
          (left && !compact ? ' · còn ' + left : '') + '</span>' +
        '<span class="bar"><i style="width:' + pct + '%"></i></span>' +
        (compact ? '' : '<span class="cta">' + IC.play + 'Đọc tiếp</span>') +
      '</span></a>';
  }

  function starter() {
    var picks = [
      { b: bySlug('pls-love') || done[0], n: '01', k: 'Chọn lọc' },
      { b: bySlug('love-design') || done[1], n: '02', k: 'Ngắn nhất' },
      { b: bySlug('lunar-secret') || done[2], n: '03', k: 'Được xem nhiều' }
    ].filter(function (x) { return x.b; });
    return '<div class="starter">' + picks.map(function (x) {
      return '<a class="s" href="/truyen/' + esc(x.b.s) + '/">' +
        '<img src="' + esc(x.b.img) + '" alt="' + esc(x.b.t) + '" loading="lazy">' +
        '<span><span class="n">' + x.n + ' · ' + x.k + '</span><h3>' + esc(x.b.t) + '</h3>' +
        '<p>' + x.b.n + ' chương</p></span></a>';
    }).join('') + '</div>';
  }

  function chart(rows, mode) {
    return '<div class="chart">' + rows.map(function (r, i) {
      var v = mode === 'month' ? r.month : r.week;
      var tr = r.tr === 'up' ? IC.up + r.d : (r.tr === 'dn' ? IC.dn + r.d : '—');
      return '<a class="chrow" href="/truyen/' + esc(r.b.s) + '/">' +
        '<span class="rk">' + (i + 1) + '</span>' +
        '<span class="cv"><img src="' + esc(r.b.img) + '" alt="" loading="lazy"></span>' +
        '<span class="tt"><h3>' + esc(r.b.t) + '</h3>' +
          '<span class="mt">' + esc(r.b.a || '—') + ' · ' + (r.b.n || 0) + ' chương</span></span>' +
        '<span class="vv">' + vn(v) + '<span class="tr ' + r.tr + '">' + tr + '</span></span>' +
        '</a>';
    }).join('') + '</div>';
  }

  function dayCard(d, i) {
    var b = d.s ? bySlug(d.s) : null;
    return '<div class="day' + (i === TODAY ? ' today' : '') + '">' +
      '<div class="wd">' + d.wd + (i === TODAY ? ' · hôm nay' : '') + '</div>' +
      '<div class="dt">' + d.dt + '</div>' +
      (d.off ? '<div class="off">' + d.off + '</div>'
        : '<div class="it">' + (b ? '<img src="' + esc(b.img) + '" alt="" loading="lazy">' : '<img src="/ssochuz.png" alt="" style="object-fit:contain;background:#241d19">') +
          '<span>' + esc(d.t) + '</span></div>' +
          '<div class="off" style="color:var(--acc)">Ch. ' + d.ch + '</div>') +
      '</div>';
  }

  function weekStrip() { return '<div class="week">' + SCHED.map(dayCard).join('') + '</div>'; }

  function weekList() {
    return '<div class="vweek">' + SCHED.map(function (d, i) {
      var b = d.s ? bySlug(d.s) : null;
      return '<div class="d' + (i === TODAY ? ' today' : '') + '">' +
        '<span class="wd">' + d.wd + '</span>' +
        '<span>' + (d.off ? '<span class="off">' + d.off + '</span>'
          : '<span class="it">' + (b ? '<img src="' + esc(b.img) + '" alt="" loading="lazy">' : '') +
            '<span>' + esc(d.t) + '</span></span>' +
            '<span class="off" style="color:var(--acc)">Ch. ' + d.ch + '</span>') +
        '</span></div>';
    }).join('') + '</div>';
  }

  function head(o) {
    return '<div class="shead"><div class="tt">' +
      (o.lb ? '<span class="lb">' + o.lb + '</span>' : '') +
      '<h2>' + o.t + (o.cnt ? ' <span class="cnt">' + o.cnt + '</span>' : '') + '</h2>' +
      '</div>' +
      (o.r ? '<div class="r">' + o.r + '</div>' : '') + '</div>';
  }
  var more = function (txt, href) {
    return '<a class="more" href="' + (href || '#') + '">' + txt + IC.chev + '</a>';
  };

  function chipRow(scope) {
    var items = [
      { k: 'all', t: 'Tất cả', n: B.length },
      { k: 'done', t: 'Hoàn thành', n: done.length },
      { k: 'run', t: 'Đang cập nhật', n: B.filter(function (b) { return b.st === 'Đang cập nhật'; }).length },
      { k: 'soon', t: 'Sắp ra mắt', n: soon.length },
      { k: '18', t: '18+', n: adult.length }
    ];
    return items.map(function (c, i) {
      return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-f="' + c.k + '" data-scope="' + scope + '">' +
        c.t + '<b>' + c.n + '</b></button>';
    }).join('');
  }

  function topYear() {
    var c = {};
    B.forEach(function (b) { if (b.y) c[b.y] = (c[b.y] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || b.localeCompare(a); }).slice(0, 3);
  }
  function topCouple() {
    var c = {};
    B.forEach(function (b) { if (b.c) c[b.c] = (c[b.c] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 3)
      .map(function (k) { return [k, c[k]]; });
  }
  function fgroup(title, kind, opts) {
    return '<div class="grp"><div class="t">' + title + '</div>' + opts.map(function (o, i) {
      return '<div class="op' + (i === 0 ? ' on' : '') + '" data-k="' + kind + '" data-v="' + esc(o.v) + '">' +
        '<span class="bx">' + (i === 0 ? IC.check : '') + '</span>' + esc(o.t) +
        '<span class="n">' + o.n + '</span></div>';
    }).join('') + '</div>';
  }
  function libGrid(list) {
    return '<div class="lgrid">' + list.slice(0, 18).map(function (b) { return poster(b); }).join('') + '</div>';
  }
  function worthSix() {
    var seen = {}, out = [];
    WORTH.concat(done).forEach(function (b) {
      if (!b || seen[b.s]) return;
      seen[b.s] = 1; out.push(b);
    });
    return out.slice(0, 6);
  }
  var PAGER = '<div class="pager"><button class="on">1</button><button>2</button><button>3</button>' +
    '<span class="gap">…</span><button>8</button></div>';

  /* ------------------------------ PHƯƠNG ÁN A ----------------------------- */
  function variantA(hasHistory) {
    var resume = hasHistory
      ? '<div class="rgrid">' +
          RESUME.slice(0, 4).map(function (r) { return resumeCard(r); }).join('') + '</div>'
      : starter() + '<div class="emptyhint" style="margin-top:12px"><span class="ic">' + IC.book +
          '</span><span>Chưa có lịch sử đọc — mở một bộ bất kỳ là mục <b>Đọc tiếp</b> sẽ hiện ở đây.</span></div>';

    return '<div class="pg">' +
      '<section class="sec" data-anchor="resume">' +
        head({ lb: 'My Space', t: 'Đọc tiếp', cnt: hasHistory ? RESUME.length + ' bộ' : 'chưa có',
               r: more('My Space', '/my-space') }) +
        resume +
      '</section>' +

      '<section class="sec" data-anchor="new">' +
        head({ lb: 'Vừa lên kệ', t: 'Mới cập nhật', cnt: '12 bộ',
               r: '<button class="more">Hôm nay đọc gì?</button>' + more('Xem tất cả', '/#thu-vien') }) +
        '<div class="shelf wrap">' + recent.map(function (b) { return poster(b); }).join('') + '</div>' +
      '</section>' +

      '<section class="sec" data-anchor="rank">' +
        head({ lb: 'Bảng xếp hạng', t: 'Ranking', cnt: 'tuần này',
               r: '<span class="seg" data-rankmode style="padding:2px"><button class="on" data-mode="week">Tuần</button><button data-mode="month">Tháng</button></span>' +
                  more('Toàn bảng', '/#bxh') }) +
        '<div data-chart>' + chart(RANK, 'week') + '</div>' +
        '<div style="margin-top:22px">' +
          head({ lb: 'Biên tập chọn', t: 'Đáng xem' }) +
          '<div class="shelf wrap">' + worthSix().map(function (b) { return poster(b); }).join('') + '</div>' +
        '</div>' +
      '</section>' +

      '<section class="sec" data-anchor="sched">' +
        head({ lb: 'Trong tuần', t: 'Lịch ra chương', cnt: '6 bộ', r: more('Xem lịch đầy đủ', '/#lich') }) +
        weekStrip() +
      '</section>' +

      '<section class="sec" data-anchor="lib">' +
        head({ lb: 'Toàn bộ ' + B.length + ' bộ', t: 'Thư viện',
               r: '<span class="lbar">1–18 / ' + B.length + '</span>' }) +
        '<div class="ltool" style="margin-bottom:14px">' +
          '<span class="chips" data-chips="A">' + chipRow('A') + '</span>' +
          '<span class="end">' +
            '<select class="sel"><option>Sắp xếp: Mới cập nhật</option><option>Nhiều chương</option><option>Tên A→Z</option></select>' +
            '<select class="sel"><option>Năm: tất cả</option></select>' +
          '</span>' +
        '</div>' +
        '<div data-grid="A">' + libGrid(B) + '</div>' + PAGER +
      '</section>' +
    '</div>';
  }

  /* ------------------------------ PHƯƠNG ÁN B ----------------------------- */
  function variantB(hasHistory) {
    var resume = hasHistory
      ? RESUME.slice(0, 3).map(function (r) { return resumeCard(r); }).join('')
      : '<div class="emptyhint"><span class="ic">' + IC.book + '</span><span>Chưa có lịch sử đọc.</span></div>';

    var side = '<aside class="side">' +
      '<div class="blk pin" data-anchor="resume">' +
        '<div class="h"><span class="lb">Đọc tiếp</span>' + more('My Space', '/my-space') + '</div>' +
        resume +
        (hasHistory ? '<div style="margin-top:9px;padding-top:9px;border-top:1px solid var(--bd)">' +
          '<div class="h" style="margin-bottom:8px"><span class="lb" style="color:var(--dim)">Theo dõi có chương mới</span></div>' +
          '<div class="mini" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
            done.slice(0, 3).map(function (b) { return poster(b); }).join('') + '</div></div>' : '<div style="margin-top:10px">' + starter() + '</div>') +
      '</div>' +
      '<div class="blk" data-anchor="sched">' +
        '<div class="h"><span class="lb">Lịch ra chương</span>' + more('Tuần này', '/#lich') + '</div>' +
        weekList() +
      '</div>' +
      '<div class="blk">' +
        '<div class="h"><span class="lb">Đáng xem</span></div>' +
        '<div class="worth">' + WORTH.map(function (b) { return poster(b); }).join('') + '</div>' +
      '</div>' +
    '</aside>';

    var main = '<div class="main">' +
      '<section class="sec" data-anchor="new" style="padding-top:0">' +
        head({ lb: 'Vừa lên kệ', t: 'Mới cập nhật', cnt: '12 bộ',
               r: '<button class="more">Hôm nay đọc gì?</button>' + more('Xem tất cả', '/#thu-vien') }) +
        '<div class="shelf wrap c4">' + recent.map(function (b) { return poster(b); }).join('') + '</div>' +
      '</section>' +

      '<section class="sec" data-anchor="rank">' +
        head({ lb: 'Bảng xếp hạng', t: 'Ranking', cnt: 'tuần này',
               r: '<span class="seg" data-rankmode style="padding:2px"><button class="on" data-mode="week">Tuần</button><button data-mode="month">Tháng</button></span>' +
                  more('Toàn bảng', '/#bxh') }) +
        '<div data-chart>' + chart(RANK, 'week') + '</div>' +
      '</section>' +

      '<section class="sec" data-anchor="lib">' +
        head({ lb: 'Toàn bộ ' + B.length + ' bộ', t: 'Thư viện',
               r: '<span class="lbar">1–18 / ' + B.length + '</span>' }) +
        '<div class="ltool" style="margin-bottom:14px">' +
          '<span class="chips" data-chips="B">' + chipRow('B') + '</span>' +
          '<span class="end"><select class="sel"><option>Sắp xếp: Mới cập nhật</option><option>Nhiều chương</option></select></span>' +
        '</div>' +
        '<div data-grid="B">' + libGrid(B) + '</div>' + PAGER +
      '</section>' +
    '</div>';

    return '<div class="pg"><div class="two">' + side + main + '</div></div>';
  }

  /* ------------------------------ PHƯƠNG ÁN C ----------------------------- */
  function variantC(hasHistory) {
    var big = RESUME[0];
    var resumeTile = '<div class="tile b-resume" data-anchor="resume">' +
      '<div class="th"><span class="lb">Đọc tiếp</span>' + more('My Space', '/my-space') + '</div>' +
      (hasHistory && big
        ? '<div class="resume" style="grid-template-columns:64px minmax(0,1fr);padding:0;border:0;background:none">' +
            '<span class="cv" style="width:64px"><img src="' + esc(big.b.img) + '" alt="" loading="lazy"></span>' +
            '<span class="bd"><h3 style="font-size:14.5px">' + esc(big.b.t) + '</h3>' +
            '<span class="sub"><b>Ch. ' + big.at + '</b> / ' + big.b.n + ' · còn ' + (big.b.n - big.at) + '</span>' +
            '<span class="bar"><i style="width:' + Math.round(big.at / big.b.n * 100) + '%"></i></span>' +
            '<span class="cta">' + IC.play + 'Đọc tiếp</span></span></div>' +
          '<div style="margin-top:12px;display:grid;gap:8px">' +
            RESUME.slice(1, 3).map(function (r) {
              return '<a class="resume" style="grid-template-columns:34px minmax(0,1fr);padding:7px;gap:9px" href="/doc/' + esc(r.b.s) + '/">' +
                '<span class="cv" style="width:34px"><img src="' + esc(r.b.img) + '" alt="" loading="lazy"></span>' +
                '<span class="bd"><h3 style="font-size:12px;margin-bottom:4px">' + esc(r.b.t) + '</h3>' +
                '<span class="bar" style="margin-bottom:0"><i style="width:' + Math.round(r.at / r.b.n * 100) + '%"></i></span></span></a>';
            }).join('') + '</div>'
        : starter()) +
      '</div>';

    var newTile = '<div class="tile b-new" data-anchor="new">' +
      '<div class="th"><span class="lb">Mới cập nhật</span>' + more('Xem tất cả', '/#thu-vien') + '</div>' +
      '<div class="mini">' + recent.slice(0, 6).map(function (b) { return poster(b); }).join('') + '</div>' +
      '</div>';

    var rankTile = '<div class="tile b-rank" data-anchor="rank">' +
      '<div class="th"><span class="lb">Ranking · tuần</span>' + more('Toàn bảng', '/#bxh') + '</div>' +
      '<div class="chart">' + RANK.slice(0, 3).map(function (r, i) {
        return '<a class="chrow" style="grid-template-columns:20px 34px minmax(0,1fr);padding:6px 2px" href="/truyen/' + esc(r.b.s) + '/">' +
          '<span class="rk" style="font-size:' + (i === 0 ? 21 : 17) + 'px">' + (i + 1) + '</span>' +
          '<span class="cv" style="width:34px"><img src="' + esc(r.b.img) + '" alt="" loading="lazy"></span>' +
          '<span class="tt"><h3 style="font-size:12px">' + esc(r.b.t) + '</h3>' +
          '<span class="mt" style="font-size:9px">' + vn(r.week) + ' lượt</span></span></a>';
      }).join('') + '</div>' +
      '<div style="margin-top:11px;padding-top:10px;border-top:1px solid var(--bd)">' +
        '<div class="th" style="margin-bottom:8px"><span class="lb" style="color:var(--dim)">Đáng xem</span></div>' +
        '<div class="worth">' + WORTH.map(function (b) { return poster(b); }).join('') + '</div>' +
      '</div></div>';

    var fcol = '<div class="fcol" data-fcol>' + fgroup('Tình trạng', 'st', [
      { v: '', t: 'Tất cả', n: B.length },
      { v: 'Hoàn thành', t: 'Hoàn thành', n: B.filter(function (b) { return b.st === 'Hoàn thành'; }).length },
      { v: 'Đang cập nhật', t: 'Đang cập nhật', n: B.filter(function (b) { return b.st === 'Đang cập nhật'; }).length },
      { v: 'Sắp ra mắt', t: 'Sắp ra mắt', n: soon.length }
    ]) + fgroup('Nhãn', '18', [
      { v: '', t: 'Tất cả', n: B.length },
      { v: '1', t: '18+', n: adult.length }
    ]) + fgroup('Năm', 'y', [{ v: '', t: 'Tất cả', n: B.length }].concat(
      topYear().map(function (y) { return { v: y, t: y, n: B.filter(function (b) { return b.y === y; }).length }; })
    )) + fgroup('Couple', 'c', [{ v: '', t: 'Tất cả', n: B.length }].concat(
      topCouple().map(function (c) { return { v: c[0], t: c[0], n: c[1] }; })
    )) + '</div>';

    return '<div class="pg">' +
      '<section class="sec" style="padding-top:22px">' +
        head({ lb: 'Tổng quan', t: 'Hôm nay', r: '<span class="lbar">cập nhật 12 phút trước</span>' }) +
        '<div class="bento">' + resumeTile + newTile + rankTile + '</div>' +
      '</section>' +

      '<section class="sec" data-anchor="sched">' +
        head({ lb: 'Trong tuần', t: 'Lịch ra chương', cnt: '6 bộ', r: more('Xem lịch đầy đủ', '/#lich') }) +
        weekStrip() +
      '</section>' +

      '<section class="sec" data-anchor="lib">' +
        head({ lb: 'Toàn bộ ' + B.length + ' bộ', t: 'Thư viện',
               r: '<span class="lbar" data-libcount>1–18 / ' + B.length + '</span>' }) +
        '<div class="lib2">' + fcol +
          '<div><div class="ltool" style="margin-bottom:4px">' +
            '<span class="chips" data-chips="C">' + chipRow('C') + '</span>' +
            '<span class="end">' +
              '<select class="sel"><option>Sắp xếp: Mới cập nhật</option><option>Nhiều chương</option></select>' +
              '<span class="seg" style="padding:2px"><button class="on" aria-label="Lưới">▦</button><button aria-label="Danh sách">☰</button></span>' +
            '</span></div>' +
            '<div data-grid="C">' + libGrid(B) + '</div>' + PAGER + '</div>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  /* ------------------------------- hành vi -------------------------------- */
  var hasHistory = true;

  function renderAll() {
    var map = { A: variantA, B: variantB, C: variantC };
    $$('[data-render]').forEach(function (el) {
      var k = el.getAttribute('data-render');
      el.innerHTML = map[k](hasHistory);
    });
    bindChips();
    bindChipsFilter();
    bindJump();
    bindRank();
  }

  function bindChips() {
    $$('[data-chips]').forEach(function (box) {
      var scope = box.getAttribute('data-chips');
      var gridBox = $('[data-grid="' + scope + '"]');
      var base = scope === 'B' ? B : B;
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-f]');
        if (!b) return;
        $$('[data-f]', box).forEach(function (x) { x.classList.toggle('on', x === b); });
        var f = b.getAttribute('data-f');
        var list = base.filter(function (x) {
          if (f === 'all') return true;
          if (f === '18') return x.e;
          if (f === 'done') return x.st === 'Hoàn thành';
          if (f === 'run') return x.st === 'Đang cập nhật';
          if (f === 'soon') return x.st === 'Sắp ra mắt';
          return true;
        });
        if (gridBox) gridBox.innerHTML = libGrid(list);
      });
    });
  }

  /* cột lọc của phương án C: chọn được thật, kết hợp được nhiều điều kiện */
  function bindChipsFilter() {
    var box = $('[data-fcol]');
    if (!box) return;
    var picked = { st: '', '18': '', y: '', c: '' };
    box.addEventListener('click', function (e) {
      var op = e.target.closest('[data-k]');
      if (!op) return;
      var k = op.getAttribute('data-k');
      picked[k] = op.getAttribute('data-v');
      $$('[data-k="' + k + '"]', box).forEach(function (x) {
        var on = x === op;
        x.classList.toggle('on', on);
        $('.bx', x).innerHTML = on ? IC.check : '';
      });
      var list = B.filter(function (b) {
        if (picked.st && b.st !== picked.st) return false;
        if (picked['18'] && !b.e) return false;
        if (picked.y && b.y !== picked.y) return false;
        if (picked.c && b.c !== picked.c) return false;
        return true;
      });
      var g = $('[data-grid="C"]');
      if (g) g.innerHTML = libGrid(list);
      var cnt = $('[data-libcount]');
      if (cnt) cnt.textContent = '1–' + Math.min(list.length, 18) + ' / ' + list.length;
    });
  }

  function bindRank() {
    $$('[data-rankmode]').forEach(function (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mode]');
        if (!b) return;
        $$('[data-mode]', seg).forEach(function (x) { x.classList.toggle('on', x === b); });
        var box = $('[data-chart]', seg.closest('.sec'));
        if (box) box.innerHTML = chart(RANK, b.getAttribute('data-mode'));
      });
    });
  }

  function bindJump() {
    $$('.jump').forEach(function (bar) {
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-go]');
        if (!b) return;
        var frame = bar.parentNode;
        var t = $('[data-anchor="' + b.getAttribute('data-go') + '"]', frame);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* đổi bề rộng khung: Desktop / Tablet / Mobile */
  var WID = { d: 1240, t: 834, m: 390 };
  function setWidth(k) {
    $$('.frame').forEach(function (f) { f.style.width = WID[k] + 'px'; f.style.maxWidth = '100%'; });
    $$('.vhead').forEach(function (h) { h.style.setProperty('--fw', WID[k] + 'px'); });
    $$('[data-width] button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-w') === k);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderAll();
    setWidth('d');
    $$('[data-width]').forEach(function (box) {
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-w]');
        if (b) setWidth(b.getAttribute('data-w'));
      });
    });
    var chk = $('#histChk');
    if (chk) chk.addEventListener('change', function () { hasHistory = chk.checked; renderAll(); });
  });
})();
