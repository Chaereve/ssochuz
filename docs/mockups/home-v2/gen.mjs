#!/usr/bin/env node
/* ============================================================================
   gen.mjs · mockup TĨNH nửa dưới trang chủ — bản 3 “dải bìa” (glvietsubz.net)
   ----------------------------------------------------------------------------
   MỘT CỘT. Mỗi mục là một dải bìa, đầu mục giống nhau: tiêu đề · số lượng ·
   “Xem thêm ›”, đường kẻ mảnh phía trên, bìa cùng một cỡ trên toàn trang.

     Đọc tiếp        6 bìa · nhãn “Ch. 44/71” · thanh tiến độ trong bìa
     Mới cập nhật    12 bìa · nhãn “Ch. N” / “Trọn bộ N”
     Xếp hạng tuần   6 bìa · số thứ tự lớn ở góc bìa
     Đáng xem        6 bìa · nhãn “★ 4.8”
     Lịch ra chương  7 cột theo thứ, không hộp
     Thư viện        thanh lọc + lưới cùng cỡ bìa + phân trang

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
  y: b.year || '',
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
  ['love-design', 0.3]
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
  .slice(0, 12)
  .map((b) => { USED.add(b.s); return b; });

/* lấy đúng N bộ chưa dùng ở dải nào khác: ưu tiên danh sách gợi ý, thiếu thì
   lấy tiếp theo thứ tự lưới — để mọi dải luôn đủ một hàng 6 bìa */
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

/* lượt đọc là số minh hoạ (registry không có lượt) */
const READS = [12480, 9240, 7815, 6402, 5190, 4310];
const RANK = take(6, ['lunar-secret', 'bake-love-feelings', 'the-fire', 'chain', 'ghost-house'])
  .map((b, i) => ({ b, week: READS[i] }));

/* điểm sao minh hoạ */
const STARS = [4.8, 4.6, 4.5, 4.4, 4.3, 4.2];
const VOTES = [31, 24, 19, 17, 12, 9];
const WORTH = take(6, ['enemies-with-benefits', 'my-only-sunshine', 'by-your-side', 'santy-nextdoor'])
  .map((b, i) => ({ b, star: STARS[i], votes: VOTES[i] }));

/* Lịch: đúng items trong registry.schedule, tuần minh hoạ 02–08/11/2026 */
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONDAY = new Date(2026, 10, 2);
const TODAY = 2;
const dayOf = (i) => {
  const d = new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + i);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
};
const WD_MAP = {
  'thu 2': 'T2', 'thu 3': 'T3', 'thu 4': 'T4', 'thu 5': 'T5', 'thu 6': 'T6', 'thu 7': 'T7',
  'cn': 'CN', 'chu nhat': 'CN', 't2': 'T2', 't3': 'T3', 't4': 'T4', 't5': 'T5', 't6': 'T6',
  't7': 'T7', '2': 'T2', '3': 'T3', '4': 'T4', '5': 'T5', '6': 'T6', '7': 'T7'
};
const dayKey = (s) => WD_MAP[norm(s).replace(/[^a-z0-9 ]/g, '').trim()] || 'T2';
const SCHED = ((reg.schedule && reg.schedule.items) || [])
  .reduce((acc, it, idx) => {
    [...new Set(String(it.days || '').split(/[,;·/]+/).map(dayKey))]
      .forEach((wd) => acc.push({ wd, idx, title: it.title || '', b: bySlug(it.slug) || null }));
    return acc;
  }, [])
  .sort((a, b) => WD.indexOf(a.wd) - WD.indexOf(b.wd) || a.idx - b.idx);

const ICON = {
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
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
        (o.rank ? `<span class="rankno${o.rank <= 2 ? ' top' : ''}">${o.rank}</span>` : '') +
        (o.pct ? `<span class="pbar"><i style="width:${o.pct}%"></i></span>` : '') +
      `</div>` +
      `<h3>${esc(b.t)}</h3>` +
      `<div class="sub">${esc(o.sub || b.a || '—')}</div>` +
    `</a>`
  );
}

const th = (title, cnt, more) =>
  `<div class="rhead"><h2>${title}</h2>` +
    (cnt ? `<span class="cnt">${cnt}</span>` : '') +
    `<a class="more" href="#">${more} ${ICON.chev}</a></div>`;

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

const rankCards = () =>
  RANK.map((r, i) =>
    card(r.b, { rank: i + 1, sub: `${vn(r.week)} lượt tuần này` })
  ).join('');

const worthCards = () =>
  WORTH.map((w) =>
    card(w.b, {
      pill: `★ ${w.star.toFixed(1)}`,
      cls: 'star',
      sub: `${w.votes} đánh giá`
    })
  ).join('');

function weekStrip() {
  return `<div class="week">` + WD.map((wd, i) => {
    const rows = SCHED.filter((it) => it.wd === wd);
    return (
      `<div class="day${i === TODAY ? ' today' : ''}">` +
        `<div class="wd">${wd}${i === TODAY ? '<em>· hôm nay</em>' : ''}</div>` +
        `<div class="dt">${dayOf(i)}</div>` +
        (rows.length
          ? rows.map((it) => (
              `<a class="it" href="#">` +
                (it.b && it.b.img ? `<img src="${esc(it.b.img)}" alt="" loading="lazy">` : '') +
                `<b>${esc(it.title || '—')}</b>` +
              `</a>`
            )).join('')
          : '<div class="off">nghỉ</div>') +
      `</div>`
    );
  }).join('') + `</div>`;
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
    `<div class="filters">` +
      `<label class="srch">${ICON.search}` +
        `<input id="q" type="search" placeholder="Tìm truyện, tác giả…" aria-label="Tìm trong thư viện">` +
        `<kbd>⌘K</kbd></label>` +
      `<span class="dd"><b>Năm</b><span class="v">Tất cả</span>${ICON.caret}</span>` +
      `<span class="dd"><b>Sắp xếp</b><span class="v">Đề xuất</span>${ICON.caret}</span>` +
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
      `<button class="nav off">‹ Trước</button>` +
      `<span id="pnums">` +
        Array.from({ length: PAGES }, (_, i) => `<button class="${i === 0 ? 'on' : ''}">${i + 1}</button>`).join('') +
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
<title>ssochuz · mockup nửa dưới trang chủ (dải bìa)</title>
<link rel="stylesheet" href="mock2.css">
</head>
<body data-w="desktop">

<div class="mkbar">
  <span class="ttl">ssochuz · nửa dưới trang chủ</span>
  <span>dải bìa · bìa và tên thật 67 bộ</span>
  <span class="fwv" id="fwv">khung —</span>
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
      ${th('Đọc tiếp', `${RESUME.length} bộ đang đọc dở`, 'My Space')}
      <div class="grid">${resumeCards()}</div>
    </section>

    <section class="rail">
      ${th('Mới cập nhật', `${RECENT.length} bộ vừa lên chương`, 'Xem thêm')}
      <div class="grid">${recentCards()}</div>
    </section>

    <section class="rail">
      ${th('Xếp hạng tuần', 'theo lượt đọc', 'Toàn bảng')}
      <div class="grid">${rankCards()}</div>
    </section>

    <section class="rail">
      ${th('Đáng xem', 'điểm từ người đọc', 'Xem thêm')}
      <div class="grid">${worthCards()}</div>
    </section>

    <section class="rail">
      ${th('Lịch ra chương', 'tuần này', 'Cả lịch')}
      ${weekStrip()}
    </section>

    <section class="rail">
      ${th('Thư viện', `${BOOKS.length} bộ chọn lọc`, 'Xem đầy đủ')}
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

  if (qEl) qEl.addEventListener('input', function () {
    state.q = plain(qEl.value.trim());
    state.page = 1;
    paint();
  });
  if (prev) prev.addEventListener('click', function () { if (state.page > 1) pageTo(state.page - 1); });
  if (next) next.addEventListener('click', function () {
    if (state.page < Math.ceil(selected().length / PAGE)) pageTo(state.page + 1);
  });

  /* bề rộng khung thật, để biết đang xem ở cỡ nào */
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
console.log('đã ghi index.html ·', Math.round(HTML.length / 1024), 'kB · bìa thiếu:',
  BOOKS.filter((b) => !b.img).length, '· đọc tiếp', RESUME.length,
  '· mới', RECENT.length, '· hạng', RANK.length, '· đáng xem', WORTH.length,
  '· lịch', SCHED.length);
