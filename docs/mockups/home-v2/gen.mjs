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
const READS = [12480, 9240, 7815, 6402, 5190];
const DELTA = [[3, 'up'], [1, 'up'], [1, 'dn'], [2, 'up'], [0, 'eq']];
const RANK = take(5, ['lunar-secret', 'bake-love-feelings', 'the-fire', 'chain'])
  .map((b, i) => ({ b, week: READS[i], d: DELTA[i][0], tr: DELTA[i][1] }));

const STARS = [4.8, 4.6, 4.5, 4.4, 4.3];
const VOTES = [31, 24, 19, 17, 12];
const WORTH = take(5, ['enemies-with-benefits', 'my-only-sunshine', 'by-your-side'])
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
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
};

/* ------------------------------ THÀNH PHẦN ------------------------------- */
function card(b, o = {}) {
  return (
    `<a class="card" href="#"${o.lib ? ` data-st="${esc(b.st)}" data-18="${b.e ? 1 : 0}" data-k="${esc(b.k)}"` : ''}>` +
      `<div class="cv">` +
        `<img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy">` +
        `<span class="scrim"></span>` +
        (o.pill ? `<span class="pill ${o.cls || stCls(b)}"><i></i>${esc(o.pill)}</span>` : '') +
        (b.e ? '<span class="badge18">18+</span>' : '') +
        (o.pct ? `<span class="pbar"><i style="width:${o.pct}%"></i></span>` : '') +
        (o.lib ? `<span class="go">Đọc ngay ›</span>` : '') +
      `</div>` +
      `<h3>${esc(b.t)}</h3>` +
      `<div class="sub">${esc(o.sub || b.a || '—')}</div>` +
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

/* hai cột: cùng cấu trúc hàng, chỉ khác cột số bên phải */
function prow(i, b, meta, vhtml) {
  return (
    `<li><a class="prow" href="#">` +
      `<span class="n">${i + 1}</span>` +
      `<img src="${esc(b.img)}" alt="" loading="lazy">` +
      `<span class="tt"><b>${esc(b.t)}</b><span class="m">${esc(meta)}</span></span>` +
      vhtml +
    `</a></li>`
  );
}

const rankList = () =>
  RANK.map((r, i) => {
    const v = r.tr === 'up' ? `<span class="v up">▲<b>${r.d}</b></span>`
      : r.tr === 'dn' ? `<span class="v dn">▼<b>${r.d}</b></span>`
      : '<span class="v eq">—</span>';
    return prow(i, r.b, `${vn(r.week)} lượt tuần`, v);
  }).join('');

const worthList = () =>
  WORTH.map((w, i) =>
    prow(i, w.b, `${w.votes} đánh giá`,
      `<span class="v star">★<b>${w.star.toFixed(1)}</b></span>`)
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
      `<span class="dd"><span class="lbl">Năm</span><span class="v">Tất cả</span>${ICON.caret}</span>` +
      `<span class="dd"><span class="lbl">Sắp xếp</span><span class="v">Đề xuất</span>${ICON.caret}</span>` +
      `<div class="vseg" role="group" aria-label="Kiểu hiển thị">` +
        `<button class="on" aria-label="Xem dạng lưới">${ICON.grid}</button>` +
        `<button aria-label="Xem dạng danh sách">${ICON.rows}</button>` +
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
<link rel="stylesheet" href="mock2.css">
</head>
<body data-w="desktop">

<div class="mkbar">
  <span class="ttl">ssochuz · nửa dưới trang chủ</span>
  <span>dải bìa cuộn ngang · bìa và tên thật 67 bộ</span>
  <span class="fwv" id="fwv">khung —</span>
  <a href="variants.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">biến thể A/B</a>
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
      <div class="twoside">
        <div class="panel">
          <div class="phead"><h3>Xếp hạng tuần</h3><span class="cnt">theo lượt đọc</span>
            <a class="more" href="#">Toàn bảng ›</a></div>
          <ol class="plist">${rankList()}</ol>
        </div>
        <div class="panel">
          <div class="phead"><h3>Đáng xem</h3><span class="cnt">điểm từ người đọc</span>
            <a class="more" href="#">Xem thêm ›</a></div>
          <ol class="plist">${worthList()}</ol>
        </div>
      </div>
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
const vRows = () => RANK.slice(0, 3).map((r, i) => {
  const v = r.tr === 'up' ? `<span class="v up">▲<b>${r.d}</b></span>`
    : r.tr === 'dn' ? `<span class="v dn">▼<b>${r.d}</b></span>`
    : '<span class="v eq">—</span>';
  return prow(i, r.b, `${vn(r.week)} lượt tuần`, v);
}).join('');

const vToolbar = (cls) => library().split('<div class="frow">')[0]
  .replace('<div class="libtop filters">', `<div class="libtop ${cls}">`)
  .replace(/ id="[^"]*"/g, '');

const VARIANTS = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · biến thể cho 4 chỗ vừa sửa</title>
<link rel="stylesheet" href="mock2.css">
<style>
  body { background: #0d0b09; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 26px 22px 60px; }
  .vhead { position: static; }
  h1 { font-family: var(--font-head); font-size: 22px; margin-bottom: 6px; }
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 26px; }
  .vsec { border-top: 1px solid var(--bd); padding-top: 22px; margin-top: 26px; }
  .vsec h2 { font-size: 16px; margin-bottom: 14px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .box { border: 1px solid var(--bd); border-radius: 14px; padding: 16px 14px; background: var(--bg); }
  .tag { display: inline-block; margin-bottom: 10px; font: 800 10px/1 var(--font-mono);
    letter-spacing: .12em; text-transform: uppercase; color: var(--acc); }
  .plist { margin: 0; padding: 0; list-style: none; }
  @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } }

  /* ---- B1: số trong ô vuông mờ ---- */
  .b1 .prow .n { width: 26px; height: 26px; display: grid; place-items: center;
    border-radius: 7px; background: rgba(255,240,220,.07); font-size: 14px;
    color: var(--txt); text-align: center; }
  .b1 .prow:nth-child(1) .n { background: var(--acc-soft); color: var(--acc); font-size: 15px; }
  .b1 .prow:nth-child(2) .n { color: #e6bcc7; }
  /* ---- B2: số đứng trước, mũi tên sau ---- */
  .b2 .prow .v { flex-direction: row-reverse; justify-content: flex-start; }
  .b2 .prow .v b { font-size: 13px; }
  /* ---- B3: dropdown không viền ---- */
  .b3 .dd { border-color: transparent; background: none; padding: 0 6px; gap: 5px; }
  .b3 .dd:hover { background: var(--surf2); border-color: transparent; }
  /* ---- B4: hover kiểu nút son đặc ---- */
  .force .cv::after { opacity: 1; }
  .force .go { opacity: 1; transform: translate(-50%, -50%); }
  .b4 .go { background: var(--acc); border-color: transparent; color: #20100f;
    font-weight: 750; box-shadow: 0 10px 24px -12px rgba(0,0,0,.8); }
  .b4 .cv::after { background: linear-gradient(180deg, rgba(10,7,5,.1), rgba(10,7,5,.62)); }
  .pair .card { max-width: 170px; }
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
      <div class="box"><span class="tag">A · chữ số lớn</span><ol class="plist">${vRows()}</ol></div>
      <div class="box b1"><span class="tag">B · số trong ô mờ</span><ol class="plist">${vRows()}</ol></div>
    </div>
  </section>

  <section class="vsec">
    <h2>2 · Số tăng/giảm và số sao</h2>
    <div class="pair">
      <div class="box"><span class="tag">A · ▲3 (dấu trước)</span><ol class="plist">${vRows()}</ol></div>
      <div class="box b2"><span class="tag">B · 3▲ (số trước)</span><ol class="plist">${vRows()}</ol></div>
    </div>
  </section>

  <section class="vsec">
    <h2>3 · Thanh lọc thư viện</h2>
    <div class="pair">
      <div class="box"><span class="tag">A · có viền</span>${vToolbar('')}</div>
      <div class="box b3"><span class="tag">B · không viền</span>${vToolbar('')}</div>
    </div>
  </section>

  <section class="vsec">
    <h2>4 · Rê chuột lên bìa (hiện sẵn để so)</h2>
    <div class="pair">
      <div class="box force"><span class="tag">A · nút viền mảnh</span>${card(RECENT[0], { lib: true, pill: 'Ch. ' + RECENT[0].n, sub: RECENT[0].a })}</div>
      <div class="box force b4"><span class="tag">B · nút son đặc</span>${card(RECENT[1], { lib: true, pill: 'Ch. ' + RECENT[1].n, sub: RECENT[1].a })}</div>
    </div>
  </section>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'variants.html'), VARIANTS);
console.log('đã ghi index.html ·', Math.round(HTML.length / 1024), 'kB · bìa thiếu:',
  BOOKS.filter((b) => !b.img).length, '· đọc tiếp', RESUME.length, '· mới', RECENT.length,
  '· hạng', RANK.length, '· đáng xem', WORTH.length, '· trang', PAGES);
