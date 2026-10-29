#!/usr/bin/env node
/* ============================================================================
   gen.mjs · mockup TĨNH nửa dưới trang chủ — PHƯƠNG ÁN 2 “TẠP CHÍ” (bản 2)
   ----------------------------------------------------------------------------
   Dựng index.html từ data/registry.json + bìa thật trong assets/covers.
   Cấu trúc:
     Đọc tiếp        3 thẻ ngang (toàn chiều rộng)
     Mới cập nhật    6 bìa, một hàng
     ─ Thư viện ──────────────────────────────┬── cột phụ dính ──
       tìm kiếm · lọc · lưới 4 cột · phân trang │ xếp hạng tuần
                                                │ lịch ra chương
                                                │ đáng xem
                                                │ vừa hoàn thành
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
  y: b.year || '',
  st: b.status || '',
  n: b.chapters || 0,
  e: !!b.is18,
  u: String(b.updated || ''),
  img: coverOf(b),
  k: norm(b.title + ' ' + (b.author || ''))
}));
const bySlug = (s) => BOOKS.find((b) => b.s === s) || null;

/* Thứ tự mặc định của lưới = “Đề xuất”: danh sách editorChoice thật trong
   registry (12 bộ) rồi mới tới những bộ cập nhật gần nhất. Nhờ vậy trang 1 của
   lưới KHÔNG trùng 6 bìa “Mới cập nhật” ngay phía trên. */
const PICK = Array.isArray(reg.settings && reg.settings.editorChoice)
  ? reg.settings.editorChoice
  : Array.isArray(reg.editorChoice) ? reg.editorChoice : [];
const pickIdx = (b) => {
  const i = PICK.indexOf(b.s);
  return i < 0 ? 999 : i;
};
BOOKS.sort((a, b) =>
  pickIdx(a) - pickIdx(b) || (pickIdx(a) === 999 && pickIdx(b) === 999 ? b.u.localeCompare(a.u) : 0)
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

const ICON = {
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>',
  rows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="5" width="16" height="5"/><rect x="4" y="14" width="16" height="5"/></svg>'
};

/* ------------------------------- DỮ LIỆU -------------------------------- */
const stCls = (b) => (b.st === 'Hoàn thành' ? 'done' : b.st === 'Sắp ra mắt' ? 'soon' : 'run');

/* Một bộ chỉ xuất hiện ở MỘT khối phía trên lưới, để cả trang không lặp bìa. */
const USED = new Set();
const pick = (slug) => {
  const b = bySlug(slug);
  if (!b || USED.has(slug)) return null;
  USED.add(slug);
  return b;
};

/* Đọc tiếp: chương đang đọc suy ra từ số chương thật của bộ */
const RESUME = [
  ['pls-love', 0.62],
  ['love-on-hire', 0.38],
  ['yours-ever', 0.75]
]
  .map(([s, p]) => {
    const b = pick(s);
    if (!b) return null;
    const at = Math.max(3, Math.min(b.n || 99, Math.round((b.n || 12) * p)));
    return { b, at, left: (b.n || at) - at };
  })
  .filter(Boolean);

/* Mới cập nhật: bỏ “Sắp ra mắt” (chưa có chương), lấy 6 bộ cập nhật gần nhất */
const RECENT = BOOKS.filter((b) => b.st !== 'Sắp ra mắt' && !USED.has(b.s))
  .slice()
  .sort((a, b) => b.u.localeCompare(a.u))
  .slice(0, 6)
  .map((b) => { USED.add(b.s); return b; });

/* Xếp hạng: số lượt là số MINH HOẠ cho phần trình bày (registry không có lượt đọc) */
const RANK = [
  ['lunar-secret', 12480, 'up', 3],
  ['bake-love-feelings', 9240, 'up', 1],
  ['hidden-heart', 7815, 'dn', 1],
  ['the-fire', 6402, 'up', 2],
  ['chain', 5190, 'eq', 0]
]
  .map(([s, week, tr, d]) => {
    const b = pick(s);
    return b ? { b, week, tr, d } : null;
  })
  .filter(Boolean);

/* Đáng xem: điểm sao minh hoạ, mỗi bộ một điểm */
const STARS = new Map();
const WORTH = [
  ['enemies-with-benefits', 4.8],
  ['my-only-sunshine', 4.6],
  ['ghost-house', 4.4]
]
  .map(([s, star]) => {
    const b = pick(s);
    if (!b) return null;
    STARS.set(s, star);
    return b;
  })
  .filter(Boolean);

/* Vừa hoàn thành: thật — lọc status, sắp theo ngày cập nhật */
const DONE = BOOKS.filter((b) => b.st === 'Hoàn thành' && !USED.has(b.s))
  .slice()
  .sort((a, b) => b.u.localeCompare(a.u))
  .slice(0, 3);

/* Lịch: đúng items trong registry.schedule; tuần minh hoạ 02/11/2026, “hôm nay” = thứ 4 */
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONDAY = new Date(2026, 10, 2);
const TODAY = 2;
const dayOf = (i) => {
  const d = new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + i);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
};
/* “Thứ 2” … “Thứ 7”, “Chủ nhật”/“CN” → T2 … CN */
const WD_MAP = {
  'thu 2': 'T2', 'thu 3': 'T3', 'thu 4': 'T4', 'thu 5': 'T5', 'thu 6': 'T6', 'thu 7': 'T7',
  'cn': 'CN', 'chu nhat': 'CN', 't2': 'T2', 't3': 'T3', 't4': 'T4', 't5': 'T5', 't6': 'T6',
  't7': 'T7', '2': 'T2', '3': 'T3', '4': 'T4', '5': 'T5', '6': 'T6', '7': 'T7'
};
const dayKey = (s) => {
  const k = norm(s).replace(/[^a-z0-9 ]/g, '').trim();
  return WD_MAP[k] || WD_MAP[k.replace(/^thu\s*/, 'thu ')] || 'T2';
};
const SCHED = ((reg.schedule && reg.schedule.items) || [])
  .reduce((acc, it, idx) => {
    const days = [...new Set(String(it.days || '').split(/[,;·/]+/).map(dayKey))];
    days.forEach((wd) => acc.push({ wd, idx, title: it.title || '', b: bySlug(it.slug) || null }));
    return acc;
  }, [])
  .sort((a, b) => WD.indexOf(a.wd) - WD.indexOf(b.wd) || a.idx - b.idx);

/* ------------------------------ THÀNH PHẦN ------------------------------- */
function poster(b, p) {
  return (
    `<a class="poster" href="#" data-st="${esc(b.st)}" data-18="${b.e ? 1 : 0}" data-k="${esc(b.k)}">` +
      `<div class="cv">` +
        `<img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy">` +
        `<span class="scrim"></span>` +
        `<span class="pill ${stCls(b)}"><i></i>${esc(p)}</span>` +
        (b.e ? '<span class="badge18">18+</span>' : '') +
      `</div>` +
      `<h3>${esc(b.t)}</h3>` +
      `<div class="mt">${esc(b.a || '—')}${b.u ? ' · ' + dmy(b.u) : ''}</div>` +
    `</a>`
  );
}

function rcard(r) {
  const b = r.b;
  const pct = b.n ? Math.round((r.at / b.n) * 100) : 0;
  return (
    `<a class="rcard" href="#">` +
      `<span class="cv"><img src="${esc(b.img)}" alt="" loading="lazy"></span>` +
      `<div>` +
        `<h3>${esc(b.t)}</h3>` +
        `<div class="meta">Ch. <b>${r.at}</b> / ${b.n}</div>` +
        `<span class="bar"><i style="width:${pct}%"></i></span>` +
        `<div class="row">` +
          `<span class="cta">Đọc tiếp ${ICON.play}</span>` +
          `<span class="pct">${pct}%${r.left ? ` · còn ${r.left}` : ''}</span>` +
        `</div>` +
      `</div>` +
    `</a>`
  );
}

function rankRows() {
  return RANK.map((r, i) => {
    const tr = r.tr === 'up' ? `<span class="up">▲${r.d}</span>`
      : r.tr === 'dn' ? `<span class="dn">▼${r.d}</span>` : `<span>—</span>`;
    return (
      `<a class="rr" href="#">` +
        `<span class="n">${i + 1}</span>` +
        `<img src="${esc(r.b.img)}" alt="" loading="lazy">` +
        `<span class="tt"><b>${esc(r.b.t)}</b>` +
          `<span class="m">${vn(r.week)} lượt ${tr}</span></span>` +
      `</a>`
    );
  }).join('');
}

function schedRows() {
  return SCHED.map((it) => {
    const i = WD.indexOf(it.wd);
    const img = it.b && it.b.img;
    return (
      `<a class="sch${i === TODAY ? ' today' : ''}" href="#">` +
        `<span class="d"><b>${it.wd}</b>${dayOf(i)}</span>` +
        (img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span></span>`) +
        `<span class="tt"><b>${esc(it.title || '—')}</b>` +
          `<span class="m">${it.b ? it.b.n + ' chương' : ''}</span></span>` +
      `</a>`
    );
  }).join('');
}

function worthRows() {
  return WORTH.map((b) =>
    `<a class="mini" href="#">` +
      `<img src="${esc(b.img)}" alt="" loading="lazy">` +
      `<span class="tt"><b>${esc(b.t)}</b><span class="m">${esc(b.a || '—')}</span></span>` +
      `<span class="v">★ ${STARS.get(b.s).toFixed(1)}</span>` +
    `</a>`
  ).join('');
}

function doneRows() {
  return DONE.map((b) =>
    `<a class="mini" href="#">` +
      `<img src="${esc(b.img)}" alt="" loading="lazy">` +
      `<span class="tt"><b>${esc(b.t)}</b><span class="m">${esc(b.a || '—')}</span></span>` +
      `<span class="v green">${b.n}/${b.n}</span>` +
    `</a>`
  ).join('');
}

const PAGE_SIZE = 12;
const PAGES = Math.ceil(BOOKS.length / PAGE_SIZE);

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
    `<div class="libbar">` +
      `<label class="srch">${ICON.search}` +
        `<input id="q" type="search" placeholder="Tìm truyện, tác giả…" aria-label="Tìm trong thư viện">` +
        `<kbd>⌘K</kbd></label>` +
      `<span class="dd"><b>Năm</b><span class="v">Tất cả</span>${ICON.caret}</span>` +
      `<span class="dd"><b>Sắp xếp</b><span class="v">Đề xuất</span>${ICON.caret}</span>` +
      `<div class="vseg"><button class="on" aria-label="Xem lưới">${ICON.grid}</button>` +
        `<button aria-label="Xem danh sách">${ICON.rows}</button></div>` +
    `</div>` +
    `<div class="librow"><div class="chips">` +
      chips.map(([f, label, n], i) =>
        `<button class="chip${i === 0 ? ' on' : ''}" data-f="${f}">${label}<b>${n}</b></button>`
      ).join('') +
    `</div><span class="libcount" id="libcount">1–${PAGE_SIZE} / ${BOOKS.length}</span></div>` +
    `<div class="gridlib" id="grid">` +
      BOOKS.map((b) =>
        poster(b, b.st === 'Hoàn thành' ? `Trọn bộ ${b.n}` : `Ch. ${b.n}`)
      ).join('') +
    `</div>` +
    `<div class="pager" id="pager">` +
      `<button class="nav off">‹ Trước</button>` +
      `<span id="pnums">` +
        Array.from({ length: PAGES }, (_, i) =>
          `<button class="${i === 0 ? 'on' : ''}">${i + 1}</button>`
        ).join('') +
      `</span>` +
      `<button class="nav">Sau ›</button>` +
    `</div>`
  );
}

/* -------------------------------- TRANG --------------------------------- */
const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · mockup phương án 2 (tạp chí) · nửa dưới trang chủ</title>
<link rel="stylesheet" href="mock2.css">
</head>
<body data-w="desktop">

<div class="mkbar">
  <span class="ttl">ssochuz · nửa dưới trang chủ</span>
  <span class="hint">phương án 2 “tạp chí” · bản 2 · bìa và tên thật (67 bộ)</span>
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

    <section class="band">
      <div class="shead"><h2>Đọc tiếp</h2><span class="cnt">${RESUME.length} bộ đang đọc dở</span>
        <span class="rule"></span><a class="more" href="#">My Space ${ICON.chev}</a></div>
      <div class="resumeRow">${RESUME.map(rcard).join('')}</div>
    </section>

    <section class="band">
      <div class="shead"><h2>Mới cập nhật</h2><span class="cnt">6 bộ vừa lên chương</span>
        <span class="rule"></span><a class="more" href="#">Xem tất cả ${ICON.chev}</a></div>
      <div class="grid6">${RECENT.map((b) =>
        poster(b, b.st === 'Hoàn thành' ? `Trọn bộ ${b.n}` : `Ch. ${b.n}`)).join('')}</div>
    </section>

    <section class="band">
      <div class="zoneHead"><h2>Thư viện</h2><span class="cnt">67 bộ chọn lọc</span>
        <span class="right">Cập nhật <b>hôm nay</b> · 4 bộ đang ra</span></div>
      <div class="side">
        <div class="pane">${library()}</div>
        <div class="railCol"><aside class="rail">
          <div class="rblk">
            <div class="rhead"><h3>Xếp hạng tuần</h3><a class="more" href="#">Toàn bảng ›</a></div>
            ${rankRows()}
          </div>
          <div class="rblk">
            <div class="rhead"><h3>Lịch ra chương</h3><a class="more" href="#">Cả lịch ›</a></div>
            ${schedRows()}
          </div>
          <div class="rblk">
            <div class="rhead"><h3>Đáng xem</h3><a class="more" href="#">Xem cả ›</a></div>
            ${worthRows()}
          </div>
          <div class="rblk">
            <div class="rhead"><h3>Vừa hoàn thành</h3><a class="more" href="#">Trọn bộ ›</a></div>
            ${doneRows()}
          </div>
        </aside></div>
      </div>
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
  var cards = Array.prototype.slice.call(document.querySelectorAll('#grid .poster'));
  var countEl = document.getElementById('libcount');
  var numsEl = document.getElementById('pnums');
  var q = document.getElementById('q');
  var prev = document.querySelector('.pager .nav');
  var state = { f: 'all', q: '', page: 1 };

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
    var set = visible.indexOf ? visible : Array.prototype.slice.call(visible);
    cards.forEach(function (p) { p.style.display = set.indexOf(p) >= 0 ? 'block' : 'none'; });
    countEl.textContent = (list.length ? from + 1 : 0) + '–' + (from + visible.length) +
      ' / ' + list.length;
    numsEl.innerHTML = '';
    for (var i = 1; i <= pages; i++) {
      var b = document.createElement('button');
      b.textContent = i;
      if (i === state.page) b.className = 'on';
      b.addEventListener('click', pageTo.bind(null, i));
      numsEl.appendChild(b);
    }
    prev.classList.toggle('off', state.page === 1);
  }
  function pageTo(n) { state.page = n; paint(); }

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

  function plain(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  }
  if (q) q.addEventListener('input', function () {
    state.q = plain(q.value.trim());
    state.page = 1;
    paint();
  });
  if (prev) prev.addEventListener('click', function () {
    if (state.page > 1) pageTo(state.page - 1);
  });
  document.querySelectorAll('.pager .nav').forEach(function (b, i) {
    if (i === 1) b.addEventListener('click', function () {
      var pages = Math.max(1, Math.ceil(selected().length / PAGE));
      if (state.page < pages) pageTo(state.page + 1);
    });
  });

  paint();
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi index.html ·', Math.round(HTML.length / 1024), 'kB ·',
  BOOKS.length, 'bộ · bìa thiếu:', BOOKS.filter((b) => !b.img).length,
  '· lịch:', SCHED.length, '· đọc tiếp:', RESUME.map((r) => r.b.s + ' ' + r.at + '/' + r.b.n).join(', '));
