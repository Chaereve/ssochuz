#!/usr/bin/env node
/* ============================================================================
   gen.mjs · mockup TĨNH nửa dưới trang chủ — bản 4
   ----------------------------------------------------------------------------
   · Dải bìa CUỘN NGANG (Đọc tiếp, Mới cập nhật): một hàng bìa, kéo qua lại
     được, có nút ‹ › và thanh cuộn mảnh.
   · Xếp hạng tuần & Đáng xem: HAI CỘT song song, cùng một kiểu danh sách 5 dòng.
   · Thư viện: thanh lọc gọn + lưới cùng cỡ bìa + phân trang 18 bộ/trang.
   · Lịch ra chương: tạm gác (sẽ làm lại), không có trong trang này.

   Dữ liệu: 67 bộ thật (data/registry.json) + bìa thật (assets/covers/).
   Chạy: node docs/mockups/home-v2/gen.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8'));
const coverFiles = new Set(
  fs.readdirSync(path.join(ROOT, 'assets/covers')).map((f) => f.replace(/\.webp$/, ''))
);

/* FNV-1a 32-bit — cùng hàm với src/shared/cover-mirror.js */
function coverKey(s) {
  const bytes = Buffer.from(String(s == null ? '' : s), 'utf8');
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}
function coverOf(b) {
  for (const c of [b.thumb, b.slide]) {
    if (!c) continue;
    const k = coverKey(c);
    if (coverFiles.has(k)) return `../../../assets/covers/${k}.webp`;
  }
  return '';
}

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

const BOOKS = reg.lib.map((b) => ({
  t: b.title,
  s: b.slug,
  a: b.author || '',
  st: b.status || '',
  n: b.chapters || 0,
  e: !!b.is18,
  u: String(b.updated || ''),
  img: coverOf(b),
  k: norm(b.title + ' ' + (b.author || ''))
}));
const bySlug = (s) => BOOKS.find((b) => b.s === s) || null;

/* thứ tự mặc định của lưới = “Đề xuất”: editorChoice thật rồi tới mới cập nhật */
const PICK = Array.isArray(reg.settings && reg.settings.editorChoice)
  ? reg.settings.editorChoice
  : Array.isArray(reg.editorChoice) ? reg.editorChoice : [];
const pickIdx = (b) => {
  const i = PICK.indexOf(b.s);
  return i < 0 ? 999 : i;
};
BOOKS.sort((a, b) =>
  pickIdx(a) - pickIdx(b) || (pickIdx(a) === 999 ? b.u.localeCompare(a.u) : 0)
);

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
const vn = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dmy = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] : '';
};
const stCls = (b) => (b.st === 'Hoàn thành' ? 'done' : b.st === 'Sắp ra mắt' ? 'soon' : 'run');

/* một bộ chỉ đứng ở MỘT dải phía trên thư viện */
const USED = new Set();
const pick = (slug) => {
  const b = bySlug(slug);
  if (!b || USED.has(slug)) return null;
  USED.add(slug);
  return b;
};

const RESUME = [
  ['pls-love', 0.62],
  ['love-on-hire', 0.38],
  ['yours-ever', 0.75],
  ['third-person', 0.52],
  ['hidden-heart', 0.44],
  ['love-design', 0.3],
  ['chain', 0.85],
  ['the-fire', 0.22],
  ['ghost-house', 0.58],
  ['juliet-n-juliet', 0.4]
]
  .map(([s, p]) => {
    const b = pick(s);
    if (!b) return null;
    const at = Math.max(3, Math.min(b.n || 99, Math.round((b.n || 12) * p)));
    return { b, at, left: (b.n || at) - at };
  })
  .filter(Boolean);

const RECENT = BOOKS.filter((b) => b.st !== 'Sắp ra mắt' && !USED.has(b.s))
  .slice()
  .sort((a, b) => b.u.localeCompare(a.u))
  .slice(0, 18)
  .map((b) => { USED.add(b.s); return b; });

/* lấy đúng N bộ chưa dùng: ưu tiên danh sách gợi ý, thiếu thì lấy tiếp */
function take(n, prefer) {
  const out = [];
  for (const slug of prefer) {
    if (out.length >= n) break;
    const b = pick(slug);
    if (b) out.push(b);
  }
  for (const b of BOOKS) {
    if (out.length >= n) break;
    if (USED.has(b.s)) continue;
    USED.add(b.s);
    out.push(b);
  }
  return out;
}

/* lượt đọc / hạng / điểm sao: số minh hoạ cho phần trình bày */
const READS = [12480, 9240, 7815, 6402, 5190, 4480];
const DELTA = [[3, 'up'], [1, 'up'], [1, 'dn'], [2, 'up'], [0, 'eq'], [4, 'up']];
const RANK = take(6, ['lunar-secret', 'bake-love-feelings', 'the-fire', 'chain'])
  .map((b, i) => ({ b, week: READS[i], d: DELTA[i][0], tr: DELTA[i][1] }));

const STARS = [4.8, 4.6, 4.5, 4.4, 4.3, 4.2];
const VOTES = [31, 24, 19, 17, 12, 9];
const WORTH = take(6, ['enemies-with-benefits', 'my-only-sunshine', 'by-your-side'])
  .map((b, i) => ({ b, star: STARS[i], votes: VOTES[i] }));

const PAGE_SIZE = 18;
const PAGES = Math.ceil(BOOKS.length / PAGE_SIZE);

const ICON = {
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>',
  rows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="5" width="16" height="5"/><rect x="4" y="14" width="16" height="5"/></svg>',
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.4C9.9 5 7 4.5 4.6 4.5v15c2.4 0 5.3.5 7.4 1.9 2.1-1.4 5-1.9 7.4-1.9v-15c-2.4 0-5.3.5-7.4 1.9z"/><path d="M12 6.4v15"/></svg>'
};

/* ------------------------------ THÀNH PHẦN ------------------------------- */
function card(b, o = {}) {
  return (
    `<a class="card" href="#"${o.lib ? ` data-st="${esc(b.st)}" data-18="${b.e ? 1 : 0}" data-k="${esc(b.k)}"` : ''}>` +
      `<div class="cv">` +
        `<img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy">` +
        `<span class="scrim"></span>` +
        (o.pill ? `<span class="pill ${o.cls || stCls(b)}"><i></i>${esc(o.pill)}</span>` : '') +
        (o.num ? `<span class="rankn${o.num === 1 ? ' one' : ''}">${o.num}</span>` : '') +
        (o.sc ? `<span class="sc">★ ${o.sc}</span>` : '') +
        (b.e ? '<span class="badge18">18+</span>' : '') +
        (o.pct ? `<span class="pbar"><i style="width:${o.pct}%"></i></span>` : '') +
        (o.lib
          ? `<span class="hov"><span class="hovIn">` +
              `<span class="goIc">${ICON.read}</span>` +
              `<span class="goTx">Đọc ngay</span>` +
            `</span></span>`
          : '') +
      `</div>` +
      `<h3>${esc(b.t)}</h3>` +
      `<div class="sub">${o.subHtml || esc(o.sub || b.a || '—')}</div>` +
    `</a>`
  );
}

function railHead(title, cnt, more, arrows) {
  return (
    `<div class="rhead"><h2>${title}</h2>` +
      (cnt ? `<span class="cnt">${cnt}</span>` : '') +
      `<div class="side">` +
        (arrows
          ? `<div class="arrows">` +
              `<button data-scroll="prev" class="off" aria-label="Về trước">${ICON.prev}</button>` +
              `<button data-scroll="next" aria-label="Xem tiếp">${ICON.next}</button>` +
            `</div>`
          : '') +
        `<a class="more" href="#">${more} ${ICON.chev}</a>` +
      `</div>` +
    `</div>`
  );
}

const resumeCards = () =>
  RESUME.map((r) => {
    const pct = r.b.n ? Math.round((r.at / r.b.n) * 100) : 0;
    return card(r.b, {
      pill: `Ch. ${r.at}/${r.b.n}`,
      cls: 'read',
      pct,
      sub: r.left ? `Còn ${r.left} chương` : 'Chương cuối'
    });
  }).join('');

const recentCards = () =>
  RECENT.map((b) =>
    card(b, {
      pill: b.st === 'Hoàn thành' ? `Trọn bộ ${b.n}` : `Ch. ${b.n}`,
      sub: `${b.a || '—'} · ${dmy(b.u)}`
    })
  ).join('');

/* hai dải bìa: số hạng đè trên bìa, ▲▼ nằm cùng dòng với lượt đọc */
const rankCards = () =>
  RANK.map((r, i) => {
    const v = r.tr === 'up' ? `<span class="dv up">▲${r.d}</span>`
      : r.tr === 'dn' ? `<span class="dv dn">▼${r.d}</span>`
      : '<span class="dv eq">—</span>';
    return card(r.b, {
      num: i + 1,
      pill: r.b.st === 'Hoàn thành' ? `Trọn bộ ${r.b.n}` : `Ch. ${r.b.n}`,
      subHtml: `${vn(r.week)} lượt tuần ${v}`
    });
  }).join('');

const worthCards = () =>
  WORTH.map((w) =>
    card(w.b, {
      sc: w.star.toFixed(1),
      sub: `${w.votes} đánh giá · ${w.b.k || 'Truyện tranh'}`
    })
  ).join('');

function library() {
  const cnt = (f) => BOOKS.filter(f).length;
  const chips = [
    ['all', 'Tất cả', BOOKS.length],
    ['done', 'Hoàn thành', cnt((b) => b.st === 'Hoàn thành')],
    ['run', 'Đang cập nhật', cnt((b) => b.st === 'Đang cập nhật')],
    ['soon', 'Sắp ra mắt', cnt((b) => b.st === 'Sắp ra mắt')],
    ['18', '18+', cnt((b) => b.e)]
  ];
  return (
    `<div class="libtop filters">` +
      `<div class="srch" id="srch">${ICON.search}` +
        `<input id="q" type="search" placeholder="Tìm truyện, tác giả…" aria-label="Tìm trong thư viện">` +
        `<button type="button" class="clear" id="qclear" aria-label="Xoá từ khoá">✕</button></div>` +
      `<div class="lrow">` +
        `<span class="dd"><span class="lbl">Năm</span><span class="v">Tất cả</span>${ICON.caret}</span>` +
        `<span class="dd"><span class="lbl">Sắp xếp</span><span class="v">Đề xuất</span>${ICON.caret}</span>` +
        `<div class="vseg" role="group" aria-label="Kiểu hiển thị">` +
          `<button class="on" aria-label="Xem dạng lưới">${ICON.grid}</button>` +
          `<button aria-label="Xem dạng danh sách">${ICON.rows}</button>` +
        `</div>` +
      `</div>` +
    `</div>` +
    `<div class="frow"><div class="chips">` +
      chips.map(([f, label, n], i) =>
        `<button class="chip${i === 0 ? ' on' : ''}" data-f="${f}">${label}<b>${n}</b></button>`
      ).join('') +
    `</div><span class="count" id="libcount">1–${PAGE_SIZE} / ${BOOKS.length}</span></div>` +
    `<div class="grid" id="grid">` +
      BOOKS.map((b) => card(b, {
        lib: true,
        pill: b.st === 'Hoàn thành' ? `Trọn bộ ${b.n}` : `Ch. ${b.n}`,
        sub: `${b.a || '—'} · ${dmy(b.u)}`
      })).join('') +
    `</div>` +
    `<div class="pager">` +
      `<button class="nav off" aria-label="Trang trước">‹ Trước</button>` +
      `<span id="pnums">` +
        Array.from({ length: PAGES }, (_, i) => `<button class="${i === 0 ? 'on' : ''}">${i + 1}</button>`).join('') +
      `</span>` +
      `<button class="nav" aria-label="Trang sau">Sau ›</button>` +
      `<span class="pageinfo" id="pageinfo">Trang 1 / ${PAGES}</span>` +
    `</div>`
  );
}

/* -------------------------------- TRANG --------------------------------- */
const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · mockup nửa dưới trang chủ (dải bìa cuộn ngang)</title>
<link rel="stylesheet" href="mock2.css?v=b6">
</head>
<body data-w="desktop" class="hvB">

<div class="mkbar">
  <span class="ttl">ssochuz · nửa dưới trang chủ</span>
  <span>bản 6 · dải bìa kiểu glvietsubz · bìa và tên thật 67 bộ</span>
  <span class="fwv" id="fwv">khung —</span>
  <a href="variants.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">biến thể A/B</a>
  <a href="hover.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">nút rê chuột</a>
  <a href="rails.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">phương án 2 mục</a>
  <a href="schedule.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">lịch ra chương</a>
  <a href="../story-v5/index.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">trang truyện</a>
  <div class="wsw">
    <button data-w="desktop" class="on">Desktop</button>
    <button data-w="tablet">Tablet</button>
    <button data-w="mobile">Mobile</button>
  </div>
</div>

<div class="mkframe"><div class="frame">

  <header class="hdr">
    <span class="logo">ssochuz<i>.</i></span>
    <nav><a class="on" href="#">Trang chủ</a><a href="#">Thư viện</a><a href="#">My Space</a><a href="#">Vòng quay</a></nav>
    <span class="tail"><span class="sbtn">${ICON.search} Tìm</span><span>67 bộ</span></span>
  </header>

  <div class="hero"><span><b>Hero banner</b> — giữ nguyên, đã chốt ở vòng 19</span><span>↓ phần dưới là phần đang sửa</span></div>

  <main class="pg">

    <section class="rail">
      ${railHead('Đọc tiếp', `${RESUME.length} bộ đang đọc dở`, 'My Space', true)}
      <div class="track" id="resumeTrack">${resumeCards()}</div>
    </section>

    <section class="rail">
      ${railHead('Mới cập nhật', `${RECENT.length} bộ vừa lên chương`, 'Xem thêm', true)}
      <div class="track" id="newTrack">${recentCards()}</div>
    </section>

    <section class="rail">
      ${railHead('Xếp hạng tuần', 'theo lượt đọc', 'Toàn bảng', false)}
      <div class="track six" id="rankTrack">${rankCards()}</div>
    </section>

    <section class="rail">
      ${railHead('Đáng xem', 'điểm từ người đọc', 'Xem thêm', false)}
      <div class="track six" id="worthTrack">${worthCards()}</div>
    </section>

    <section class="rail">
      ${railHead('Thư viện', `${BOOKS.length} bộ chọn lọc`, 'Xem đầy đủ', false)}
      ${library()}
    </section>

    <footer class="foot">
      <span class="lg">ssochuz<i>.</i></span>
      <nav><a href="#">Giới thiệu</a><a href="#">Nội quy</a><a href="#">Liên hệ</a><a href="#">RSS</a></nav>
      <span class="r">67 bộ · cập nhật 30/10/2026</span>
    </footer>

  </main>
</div></div>

<script>
(function () {
  var PAGE = ${PAGE_SIZE};
  var cards = Array.prototype.slice.call(document.querySelectorAll('#grid .card'));
  var countEl = document.getElementById('libcount');
  var pageEl = document.getElementById('pageinfo');
  var numsEl = document.getElementById('pnums');
  var qEl = document.getElementById('q');
  var prev = document.querySelector('.pager .nav');
  var next = document.querySelectorAll('.pager .nav')[1];
  var state = { f: 'all', q: '', page: 1 };

  function plain(s) {
    return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  }
  function match(p) {
    if (state.f === 'all') return true;
    if (state.f === '18') return p.dataset['18'] === '1';
    if (state.f === 'done') return p.dataset.st === 'Hoàn thành';
    if (state.f === 'run') return p.dataset.st === 'Đang cập nhật';
    if (state.f === 'soon') return p.dataset.st === 'Sắp ra mắt';
    return true;
  }
  function selected() {
    return cards.filter(function (p) {
      return match(p) && (!state.q || (p.dataset.k || '').indexOf(state.q) >= 0);
    });
  }
  function paint() {
    var list = selected();
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (state.page > pages) state.page = 1;
    var from = (state.page - 1) * PAGE;
    var visible = list.slice(from, from + PAGE);
    cards.forEach(function (p) { p.style.display = visible.indexOf(p) >= 0 ? 'block' : 'none'; });
    if (countEl) countEl.textContent = (list.length ? from + 1 : 0) + '–' +
      (from + visible.length) + ' / ' + list.length;
    if (pageEl) pageEl.textContent = 'Trang ' + state.page + ' / ' + pages;
    if (numsEl) {
      numsEl.innerHTML = '';
      for (var i = 1; i <= pages; i++) {
        var b = document.createElement('button');
        b.textContent = i;
        if (i === state.page) b.className = 'on';
        b.addEventListener('click', pageTo.bind(null, i));
        numsEl.appendChild(b);
      }
    }
    if (prev) prev.classList.toggle('off', state.page === 1);
    if (next) next.classList.toggle('off', state.page === pages);
  }
  function pageTo(n) { state.page = n; paint(); }

  /* ---- dải cuộn ngang: nút ‹ › + trạng thái khoá ở hai đầu ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.rail'), function (rail) {
    var track = rail.querySelector('.track');
    if (!track) return;
    var btns = rail.querySelectorAll('.arrows button');
    if (btns.length < 2) return;
    var back = btns[0], fwd = btns[1];

    function step() {
      var card = track.querySelector('.card');
      if (!card) return track.clientWidth * 0.8;
      var gap = parseFloat(getComputedStyle(track).columnGap) || 14;
      return (card.getBoundingClientRect().width + gap) * 2;
    }
    function sync() {
      var max = track.scrollWidth - track.clientWidth;
      back.classList.toggle('off', track.scrollLeft < 4);
      fwd.classList.toggle('off', track.scrollLeft > max - 4);
    }
    back.addEventListener('click', function () {
      track.scrollBy({ left: -step(), behavior: 'smooth' });
    });
    fwd.addEventListener('click', function () {
      track.scrollBy({ left: step(), behavior: 'smooth' });
    });
    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();

    /* kéo bằng chuột (cảm ứng thì trình duyệt tự lo) */
    var down = false, startX = 0, startL = 0, moved = 0;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      down = true; moved = 0; startX = e.clientX; startL = track.scrollLeft;
      track.classList.add('dragging');
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      moved = Math.abs(dx);
      if (moved > 4) track.scrollLeft = startL - dx;
    });
    window.addEventListener('pointerup', function () {
      down = false;
      track.classList.remove('dragging');
    });
    track.addEventListener('click', function (e) {
      if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  });

  document.addEventListener('click', function (e) {
    var w = e.target.closest('.mkbar .wsw button');
    if (w) {
      document.body.setAttribute('data-w', w.getAttribute('data-w'));
      Array.prototype.forEach.call(document.querySelectorAll('.mkbar .wsw button'),
        function (b) { b.classList.toggle('on', b === w); });
      return;
    }
    var chip = e.target.closest('.chip[data-f]');
    if (chip) {
      state.f = chip.getAttribute('data-f');
      state.page = 1;
      Array.prototype.forEach.call(chip.parentNode.children,
        function (c) { c.classList.toggle('on', c === chip); });
      paint();
    }
  });

  var srchEl = document.getElementById('srch');
  var qClear = document.getElementById('qclear');
  function syncQ() {
    if (srchEl) srchEl.classList.toggle('hasq', !!qEl.value);
  }
  if (qEl) qEl.addEventListener('input', function () {
    state.q = plain(qEl.value.trim());
    state.page = 1;
    syncQ();
    paint();
  });
  if (qClear) qClear.addEventListener('click', function (e) {
    e.preventDefault();
    qEl.value = '';
    state.q = '';
    state.page = 1;
    syncQ();
    paint();
    qEl.focus();
  });
  if (prev) prev.addEventListener('click', function () { if (state.page > 1) pageTo(state.page - 1); });
  if (next) next.addEventListener('click', function () {
    if (state.page < Math.ceil(selected().length / PAGE)) pageTo(state.page + 1);
  });

  var frame = document.querySelector('.frame');
  var fwv = document.getElementById('fwv');
  function showW() {
    if (!frame || !fwv) return;
    var w = Math.round(frame.getBoundingClientRect().width);
    fwv.textContent = w > 120 ? 'khung ' + w + 'px' : 'khung —';
  }
  if (window.ResizeObserver) new window.ResizeObserver(showW).observe(frame);
  else window.addEventListener('resize', showW);
  showW();

  paint();
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'index.html'), HTML);

/* ------------------------------ TRANG BIẾN THỂ --------------------------- */
const vStrip = (o = {}) =>
  RANK.slice(0, 3).map((r, i) => {
    const arrow = r.tr === 'dn' ? '▼' : '▲';
    const dv = `<span class="dv ${r.tr}">${arrow}${r.d}</span>`;
    const sub = o.numFirst
      ? `<span class="dv ${r.tr}">${r.d}${arrow}</span> ${vn(r.week)} lượt`
      : `${vn(r.week)} lượt ${dv}`;
    return card(r.b, { num: i + 1, subHtml: sub, sc: o.sc ? '4.8' : null });
  }).join('');

const demoCards = (n = 5) => RECENT.slice(0, n).map((b) =>
  card(b, {
    lib: true,
    pill: b.st === 'Hoàn thành' ? `Trọn bộ ${b.n}` : `Ch. ${b.n}`,
    sub: `${b.a || '—'} · ${dmy(b.u)}`
  })).join('');

const vToolbar = (cls) => library().split('<div class="frow">')[0]
  .replace('<div class="libtop filters">', `<div class="libtop ${cls}">`)
  .replace(/ id="[^"]*"/g, '');

const VARIANTS = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · biến thể cho 4 chỗ vừa sửa</title>
<link rel="stylesheet" href="mock2.css?v=b6">
<style>
  body { background: #0d0b09; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 26px 22px 60px; }
  .vhead { position: static; }
  h1 { font-family: var(--font-head); font-size: 22px; margin-bottom: 6px; }
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 26px; }
  .vsec { border-top: 1px solid var(--bd); padding-top: 22px; margin-top: 26px; }
  .vsec h2 { font-size: 16px; margin-bottom: 14px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .stack { display: grid; gap: 14px; }
  .box { container-type: inline-size; border: 1px solid var(--bd); border-radius: 14px;
    padding: 16px 14px; background: var(--bg); }
  .tag { display: inline-block; margin-bottom: 10px; font: 800 10px/1 var(--font-mono);
    letter-spacing: .12em; text-transform: uppercase; color: var(--acc); }
  .plist { margin: 0; padding: 0; list-style: none; }
  @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } }

  /* ---- B1: số nhỏ, nằm góc trên bìa ---- */
  .b1 .rankn { top: 7px; bottom: auto; left: 8px; font-size: 13px; font-weight: 700;
    color: var(--txt); text-shadow: 0 1px 6px rgba(0,0,0,.8); }
  .b1 .rankn.one { color: var(--acc); }
  /* ---- B2: số đứng trước, mũi tên sau ---- */
  .b2 .dv { margin-right: 4px; }
  /* ---- B3: dropdown không viền ---- */
  .b3 .dd { border-color: transparent; background: none; padding: 0 6px; gap: 5px; }
  .b3 .dd:hover { background: var(--surf2); border-color: transparent; }
  /* ---- B4: hover kiểu nút son đặc ---- */
  .force .cv::after { opacity: 1; }
  .force .go { opacity: 1; transform: translate(-50%, -50%); }
  .b4 .cv::after { background: linear-gradient(180deg, rgba(10,7,5,.1), rgba(10,7,5,.62)); }
  .pair .card, .trio .card { max-width: 170px; }
  .trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
  @media (max-width: 720px) { .trio { grid-template-columns: 1fr; } }
  /* hiện sẵn trạng thái rê chuột */
  .force .hov { opacity: 1; }
  .force .hovIn { transform: none; }
  .force .goIc { transform: none; }
  .force .goTx::after { width: 46px; }
  .force .cv::before { opacity: 1; }
  .track.mini { --n: 3; --g: 10px; overflow: visible; padding: 0; margin: 0; cursor: default; }
</style>
</head>
<body>

<div class="mkbar vhead">
  <span class="ttl">ssochuz · biến thể</span>
  <span>bốn chỗ vừa sửa · mỗi chỗ hai kiểu</span>
  <a href="index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← về trang chính</a>
</div>

<div class="wrap">
  <h1>Chọn kiểu cho bốn chỗ</h1>
  <p class="lead">Bên trái là kiểu mình vừa làm trong trang chính. Bên phải là kiểu khác để so.</p>

  <section class="vsec">
    <h2>1 · Vị trí truyện (Xếp hạng / Đáng xem)</h2>
    <div class="pair">
      <div class="box"><span class="tag">A · số lớn trên bìa</span><div class="track mini">${vStrip()}</div></div>
      <div class="box b1"><span class="tag">B · số nhỏ góc trên</span><div class="track mini">${vStrip()}</div></div>
    </div>
  </section>

  <section class="vsec">
    <h2>2 · Số tăng/giảm và số sao</h2>
    <div class="pair">
      <div class="box"><span class="tag">A · ▲3 (dấu trước)</span><div class="track mini">${vStrip()}</div></div>
      <div class="box b2"><span class="tag">B · 3▲ (số trước)</span><div class="track mini">${vStrip({ numFirst: 1 })}</div></div>
    </div>
  </section>

  <section class="vsec">
    <h2>3 · Thanh lọc thư viện</h2>
    <div class="stack">
      <div class="box"><span class="tag">A · có viền (đang dùng)</span>${vToolbar('')}</div>
      <div class="box b3"><span class="tag">B · không viền</span>${vToolbar('')}</div>
    </div>
  </section>

  <section class="vsec">
    <h2>4 · Nút khi rê chuột — ba kiểu mới</h2>
    <p class="lead" style="margin:-8px 0 14px">Ô dưới đây hiện sẵn cho bạn nhìn; muốn thử rê chuột thật thì mở
      <a href="hover.html" style="color:var(--acc)">hover.html</a>.</p>
    <div class="trio">
      <div class="box force hvA"><span class="tag">A · nút tròn son</span>${card(RECENT[0], { lib: true, pill: 'Ch. ' + RECENT[0].n, sub: RECENT[0].a })}</div>
      <div class="box force hvB"><span class="tag">B · chữ lớn + gạch son</span>${card(RECENT[1], { lib: true, pill: 'Ch. ' + RECENT[1].n, sub: RECENT[1].a })}</div>
      <div class="box force hvC"><span class="tag">C · thanh son từ đáy</span>${card(RECENT[2], { lib: true, pill: 'Ch. ' + RECENT[2].n, sub: RECENT[2].a })}</div>
    </div>
  </section>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'variants.html'), VARIANTS);

/* ------------------------------ TRANG RÊ CHUỘT --------------------------- */
const HOVER = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · ba kiểu nút khi rê chuột lên bìa</title>
<link rel="stylesheet" href="mock2.css?v=b6">
<style>
  .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 22px 70px; }
  h1 { font-family: var(--font-head); font-size: 22px; margin-bottom: 8px; }
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 4px; }
  .vsec { border-top: 1px solid var(--bd); padding-top: 24px; margin-top: 30px; }
  .vsec h2 { font-size: 17px; margin-bottom: 4px; }
  .vsec .lead { margin-bottom: 18px; }
  .tag { display: inline-block; margin-bottom: 9px; font: 800 10px/1 var(--font-mono);
    letter-spacing: .12em; text-transform: uppercase; color: var(--acc); }
  .track.demo { --n: 5; --g: 16px; overflow: visible; cursor: default; padding-bottom: 0; }
</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · nút khi rê chuột</span>
  <span>rê chuột lên từng bìa để xem</span>
  <a href="index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← trang chính</a>
  <a href="variants.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">biến thể khác</a>
</div>

<div class="wrap">
  <h1>Ba kiểu nút khi rê chuột lên bìa</h1>
  <p class="lead">Cả ba đều làm tối bìa trước, rồi mới bật nút lên — kiểu A đang dùng trong trang chính.</p>

  <section class="vsec hvA">
    <span class="tag">Kiểu A · nút tròn son</span>
    <h2>Một vòng son bật lên giữa bìa</h2>
    <p class="lead">Nút tròn 46px màu son, bên trong là <b>biểu tượng sách mở</b>, phóng ra bằng nhịp nảy nhẹ; dưới là chữ “Đọc ngay” 10px giãn chữ, in hoa.</p>
    <div class="track demo">${demoCards()}</div>
  </section>

  <section class="vsec hvB">
    <span class="tag">Kiểu B · chữ lớn + gạch son</span>
    <h2>Chữ serif lớn, gạch son chạy ra dưới chân chữ</h2>
    <p class="lead">Không nút, không viên nền: chữ “Đọc ngay” 20px trên bìa tối, một gạch son 46px trượt ra; viền son 2px ôm lấy bìa.</p>
    <div class="track demo">${demoCards()}</div>
  </section>

  <section class="vsec hvC">
    <span class="tag">Kiểu C · thanh son từ đáy</span>
    <h2>Thanh son trượt lên từ đáy bìa</h2>
    <p class="lead">Một dải son đặc cao 34px trượt lên, chữ đậm màu nền — tương phản mạnh nhất trong ba kiểu.</p>
    <div class="track demo">${demoCards()}</div>
  </section>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'hover.html'), HOVER);
console.log('đã ghi index.html ·', Math.round(HTML.length / 1024), 'kB · bìa thiếu:',
  BOOKS.filter((b) => !b.img).length, '· đọc tiếp', RESUME.length, '· mới', RECENT.length,
  '· hạng', RANK.length, '· đáng xem', WORTH.length, '· trang', PAGES);
