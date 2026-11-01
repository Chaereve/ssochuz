#!/usr/bin/env node
/* ============================================================================
   gen.mjs · sinh mockup TĨNH cho nửa dưới trang chủ
   ----------------------------------------------------------------------------
   Vì sao sinh tĩnh: trang xem được ngay cả khi trình duyệt chặn JS (khung xem
   trong ứng dụng là một ví dụ) — trước đây toàn bộ nội dung do app.js dựng nên
   mở ra chỉ thấy khung rỗng.

   Chạy:  node docs/mockups/home/gen.mjs
   Nguồn: data/registry.json + assets/covers/*.webp (bìa thật của web).
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');

/* ---------- đọc dữ liệu thật ---------- */
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8'));
const coverFiles = new Set(
  fs.readdirSync(path.join(ROOT, 'assets/covers')).map((f) => f.replace(/\.webp$/, ''))
);

/* FNV-1a 32-bit — CÙNG hàm với src/shared/cover-mirror.js */
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

const BOOKS = reg.lib.map((b) => ({
  t: b.title,
  s: b.slug,
  a: b.author || '',
  c: b.couple || '',
  y: b.year || '',
  st: b.status || '',
  n: b.chapters || 0,
  e: !!b.is18,
  u: b.updated || '',
  img: coverOf(b)
}));

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
const vn = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const bySlug = (s) => BOOKS.find((b) => b.s === s) || null;

const ICON = {
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  dn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M8 3v18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l6 6L20 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>',
  rows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="5" width="16" height="5"/><rect x="4" y="14" width="16" height="5"/></svg>'
};

/* ---------- chọn dữ liệu cho từng khối ---------- */
const recent = BOOKS.slice().sort((a, b) => String(b.u).localeCompare(String(a.u))).slice(0, 12);
const doneAll = BOOKS.filter((b) => b.st === 'Hoàn thành');        /* đếm đúng cho chip lọc */
const doneList = BOOKS.filter((b) => b.st === 'Hoàn thành' && b.n > 20);  /* để chọn “Đáng xem” */
const soonList = BOOKS.filter((b) => b.st === 'Sắp ra mắt');
const adultList = BOOKS.filter((b) => b.e);
const runList = BOOKS.filter((b) => b.st === 'Đang cập nhật');

const RESUME = [
  ['pls-love', 34],
  ['love-on-hire', 18],
  ['yours-ever', 41],
  ['third-person', 27]
].map(([s, at]) => { const b = bySlug(s); return b ? { b, at } : null; }).filter(Boolean);

const RANK = [
  ['pls-love', 12480, 48210, 'up', 3],
  ['love-on-hire', 9240, 39120, 'up', 1],
  ['third-person', 7815, 31040, 'dn', 1],
  ['juliet-n-juliet', 6402, 28870, 'up', 2],
  ['yours-ever', 5190, 22140, 'eq', 0]
].map(([s, week, month, tr, d]) => { const b = bySlug(s); return b ? { b, week, month, tr, d } : null; }).filter(Boolean);

let WORTH = ['lunar-secret', 'bake-love-feelings', 'love-design'].map(bySlug).filter(Boolean);
if (WORTH.length < 3) WORTH = doneList.slice(0, 3);
function worthSix() {
  const seen = new Set();
  const out = [];
  for (const b of [...WORTH, ...doneList]) {
    if (!b || seen.has(b.s)) continue;
    seen.add(b.s);
    out.push(b);
  }
  return out.slice(0, 6);
}

const SCHED = [
  { wd: 'T2', dt: '03/11', t: 'Người Chồng Lạnh Lùng Của Cô Vợ Béo', s: 'nguoi-chong-lanh-lung-cua-co-vo-beo', ch: 12 },
  { wd: 'T3', dt: '04/11', t: 'Nakira Là Một Kẻ Nhẫn Tâm', s: 'nakira-la-mot-ke-nhan-tam', ch: 8 },
  { wd: 'T4', dt: '05/11', t: 'Cô Vợ Hờ Đanh Đá Của Tôi', s: 'co-vo-ho-danh-da-cua-toi', ch: 5 },
  { wd: 'T5', dt: '06/11', t: 'Bởi Chẳng Thể Ngăn Con Tim Rung Động', s: null, ch: 3 },
  { wd: 'T6', dt: '07/11', t: 'Càng Thêm Oán Hận', s: null, ch: 7 },
  { wd: 'T7', dt: '08/11', t: 'Juliet & Juliet', s: 'juliet-n-juliet', ch: 9 },
  { wd: 'CN', dt: '09/11', t: '', s: null, ch: 0, off: 'nghỉ' }
];
const TODAY = 3;

/* ---------- thành phần ---------- */
const stCls = (b) => (b.st === 'Hoàn thành' ? 'done' : b.st === 'Sắp ra mắt' ? 'soon' : 'run');

function poster(b) {
  return (
    `<a class="poster" href="#" data-st="${esc(b.st)}" data-18="${b.e ? 1 : 0}" data-y="${esc(b.y)}" data-c="${esc(b.c)}">` +
      `<div class="cv">` +
        `<img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy">` +
        `<div class="sc"></div>` +
        `<span class="st ${stCls(b)}"><i></i>${esc(b.st)}</span>` +
        (b.n ? `<span class="ch">${b.n} chương</span>` : '') +
        (b.e ? `<span class="b18">18+</span>` : '') +
      `</div>` +
      `<h3>${esc(b.t)}</h3>` +
      `<div class="mt">${esc(b.a || '—')}</div>` +
    `</a>`
  );
}

function resumeCard(r) {
  const b = r.b;
  const pct = b.n ? Math.round((r.at / b.n) * 100) : 0;
  const left = b.n ? b.n - r.at : 0;
  return (
    `<a class="resume" href="#">` +
      `<div class="cv"><img src="${esc(b.img)}" alt="" loading="lazy"></div>` +
      `<div class="bd">` +
        `<h3>${esc(b.t)}</h3>` +
        `<div class="sub"><b>Ch. ${r.at}</b> / ${b.n}${left ? ` · còn ${left}` : ''}</div>` +
        `<div class="bar"><i style="width:${pct}%"></i></div>` +
        `<span class="cta">${ICON.play}Đọc tiếp</span>` +
      `</div>` +
    `</a>`
  );
}

const STARTER = [
  { b: bySlug('pls-love') || doneList[0], n: '01', k: 'Chọn lọc' },
  { b: bySlug('love-design') || doneList[1], n: '02', k: 'Ngắn nhất' },
  { b: bySlug('lunar-secret') || doneList[2], n: '03', k: 'Được xem nhiều' }
].filter((x) => x.b);

function starterBlock() {
  return (
    `<div class="starter">` +
      STARTER.map((x) =>
        `<a class="s" href="#">` +
          `<img src="${esc(x.b.img)}" alt="" loading="lazy">` +
          `<div class="bd"><span class="n">${x.n} · ${x.k}</span>` +
            `<h3>${esc(x.b.t)}</h3><p>${x.b.n} chương</p></div>` +
        `</a>`
      ).join('') +
    `</div>`
  );
}

function chart(rows) {
  return (
    `<div class="chart">` +
      rows.map((r, i) => {
        const tr = r.tr === 'up' ? ICON.up + r.d : r.tr === 'dn' ? ICON.dn + r.d : '—';
        return (
          `<a class="chrow" href="#">` +
            `<span class="rk">${i + 1}</span>` +
            `<div class="cv"><img src="${esc(r.b.img)}" alt="" loading="lazy"></div>` +
            `<div class="tt"><h3>${esc(r.b.t)}</h3>` +
              `<div class="mt">${esc(r.b.a || '—')} · ${r.b.n || 0} chương</div></div>` +
            `<div class="vv"><span data-week>${vn(r.week)}</span>` +
              `<span class="tr ${r.tr}">${tr}</span></div>` +
          `</a>`
        );
      }).join('') +
    `</div>`
  );
}

function dayCard(d, i) {
  const b = d.s ? bySlug(d.s) : null;
  return (
    `<div class="day${i === TODAY ? ' today' : ''}">` +
      `<div class="wd">${d.wd}${i === TODAY ? ' · hôm nay' : ''}</div>` +
      `<div class="dt">${d.dt}</div>` +
      (d.off
        ? `<div class="off">${d.off}</div>`
        : `<div class="it">${b ? `<img src="${esc(b.img)}" alt="" loading="lazy">` : ''}` +
          `<span>${esc(d.t)}</span></div>` +
          `<div class="off hot">Ch. ${d.ch}</div>`) +
    `</div>`
  );
}
const weekStrip = () => `<div class="week">${SCHED.map(dayCard).join('')}</div>`;

function weekList() {
  return (
    `<div class="vweek">` +
      SCHED.map((d, i) => {
        const b = d.s ? bySlug(d.s) : null;
        return (
          `<div class="d${i === TODAY ? ' today' : ''}">` +
            `<span class="wd">${d.wd}</span>` +
            `<div>` +
              (d.off
                ? `<span class="off">${d.off}</span>`
                : `<div class="it">${b ? `<img src="${esc(b.img)}" alt="" loading="lazy">` : ''}` +
                  `<span>${esc(d.t)}</span></div>` +
                  `<span class="off hot">Ch. ${d.ch}</span>`) +
            `</div>` +
          `</div>`
        );
      }).join('') +
    `</div>`
  );
}

const head = (o) =>
  `<div class="shead"><div class="tt">` +
    (o.lb ? `<span class="lb">${o.lb}</span>` : '') +
    `<h2>${o.t}${o.cnt ? ` <span class="cnt">${o.cnt}</span>` : ''}</h2>` +
  `</div>` +
  (o.r ? `<div class="r">${o.r}</div>` : '') +
  `</div>`;
const more = (txt) => `<a class="more" href="#">${txt}${ICON.chev}</a>`;

const libGrid = (list) => `<div class="lgrid">${list.map(poster).join('')}</div>`;
const PAGER = `<div class="pager"><button class="on">1</button><button>2</button><button>3</button>` +
  `<span class="gap">…</span><button>8</button></div>`;

const SORT = `<select class="sel" aria-label="Sắp xếp"><option>Sắp xếp: Mới cập nhật</option>` +
  `<option>Nhiều chương</option><option>Tên A→Z</option></select>`;
const YEAR = `<select class="sel" aria-label="Năm"><option>Năm: tất cả</option>` +
  `<option>2026</option><option>2025</option></select>`;
const VSEG = `<span class="seg" style="padding:2px"><button class="on">Tuần</button><button>Tháng</button></span>`;

/* ============================ PHƯƠNG ÁN C ================================= */
/* (A và B đã bỏ — đã chốt C; trang này giờ chỉ còn C + 3 cách làm THƯ VIỆN) */
function variantC() {
  const big = RESUME[0];
  const resumeTile = `<div class="tile b-resume">
    <div class="th"><span class="lb">Đọc tiếp</span>${more('My Space')}</div>
    <div class="when-hist">
      <div class="resume" style="grid-template-columns:64px minmax(0,1fr);padding:0;border:0;background:none">
        <div class="cv" style="width:64px"><img src="${esc(big.b.img)}" alt="" loading="lazy"></div>
        <div class="bd">
          <h3 style="font-size:14.5px">${esc(big.b.t)}</h3>
          <div class="sub"><b>Ch. ${big.at}</b> / ${big.b.n} · còn ${big.b.n - big.at}</div>
          <div class="bar"><i style="width:${Math.round((big.at / big.b.n) * 100)}%"></i></div>
          <span class="cta">${ICON.play}Đọc tiếp</span>
        </div>
      </div>
      <div style="margin-top:12px;display:grid;gap:8px">
        ${RESUME.slice(1, 3).map((r) =>
          `<a class="resume" style="grid-template-columns:34px minmax(0,1fr);padding:7px;gap:9px" href="#">` +
            `<div class="cv" style="width:34px"><img src="${esc(r.b.img)}" alt="" loading="lazy"></div>` +
            `<div class="bd"><h3 style="font-size:12px;margin-bottom:4px">${esc(r.b.t)}</h3>` +
            `<div class="bar" style="margin-bottom:0"><i style="width:${Math.round((r.at / r.b.n) * 100)}%"></i></div></div>` +
          `</a>`).join('')}
      </div>
    </div>
    <div class="when-new">${starterBlock()}</div>
  </div>`;

  const newTile = `<div class="tile b-new">
    <div class="th"><span class="lb">Mới cập nhật</span>${more('Xem tất cả')}</div>
    <div class="mini">${recent.slice(0, 6).map(poster).join('')}</div>
  </div>`;

  const rankTile = `<div class="tile b-rank">
    <div class="th"><span class="lb">Ranking · tuần</span>${more('Toàn bảng')}</div>
    <div class="chart">
      ${RANK.slice(0, 3).map((r, i) =>
        `<a class="chrow" style="grid-template-columns:20px 34px minmax(0,1fr);padding:6px 2px" href="#">` +
          `<span class="rk" style="font-size:${i === 0 ? 21 : 17}px">${i + 1}</span>` +
          `<div class="cv" style="width:34px"><img src="${esc(r.b.img)}" alt="" loading="lazy"></div>` +
          `<div class="tt"><h3 style="font-size:12px">${esc(r.b.t)}</h3>` +
          `<div class="mt" style="font-size:9px">${vn(r.week)} lượt</div></div>` +
        `</a>`).join('')}
    </div>
    <div style="margin-top:11px;padding-top:10px;border-top:1px solid var(--bd)">
      <div class="th" style="margin-bottom:8px"><span class="lb" style="color:var(--dim)">Đáng xem</span></div>
      <div class="worth">${WORTH.map(poster).join('')}</div>
    </div>
  </div>`;

  return `<div class="pg">
  <section class="sec" style="padding-top:22px">
    ${head({ lb: 'Tổng quan', t: 'Hôm nay', r: `<span class="lbar">cập nhật 12 phút trước</span>` })}
    <div class="bento">${resumeTile}${newTile}${rankTile}</div>
  </section>
  <section class="sec">
    ${head({ lb: 'Trong tuần', t: 'Lịch ra chương', cnt: '6 bộ', r: more('Xem lịch đầy đủ') })}
    ${weekStrip()}
  </section>
  <section class="sec">
    ${head({ lb: `Toàn bộ ${BOOKS.length} bộ`, t: 'Thư viện', r: `<span class="lbar">xem 3 cách bên dưới ↓</span>` })}
    <div class="phint">Phần lọc + lưới của Thư viện đang được làm lại — 3 cách bày ngay bên dưới.</div>
  </section>
</div>`;
}

/* ======================== THƯ VIỆN — 3 CÁCH BÀY ========================== */
function topCount(key, take) {
  const c = {};
  BOOKS.forEach((b) => { if (b[key]) c[b[key]] = (c[b[key]] || 0) + 1; });
  return Object.keys(c).sort((a, b) => c[b] - c[a] || String(b).localeCompare(String(a)))
    .slice(0, take).map((k) => ({ v: k, t: k, n: c[k] }));
}
const STATUS = [
  { k: 'all', t: 'Tất cả', n: BOOKS.length },
  { k: 'done', t: 'Hoàn thành', n: doneAll.length },
  { k: 'run', t: 'Đang cập nhật', n: runList.length },
  { k: 'soon', t: 'Sắp ra mắt', n: soonList.length }
];

const srch = (hint, kbd) =>
  `<label class="srch"><span class="ic">${ICON.search}</span>` +
  `<input type="search" placeholder="${hint}" aria-label="Tìm trong thư viện">` +
  (kbd ? `<kbd>${kbd}</kbd>` : '') + `</label>`;

const dd = (t) => `<button class="dd" type="button">${t}${ICON.caret}</button>`;
const viewSeg = `<span class="seg vseg" role="group" aria-label="Kiểu hiển thị">` +
  `<button class="on" aria-label="Lưới">${ICON.grid}</button>` +
  `<button aria-label="Danh sách">${ICON.rows}</button></span>`;
const countTag = (sc) => `<span class="lcount" data-libcount="${sc}">1–18 / ${BOOKS.length}</span>`;

function libBlock(sc) {
  return `<div class="libd"><div data-grid="${sc}">${libGrid(BOOKS)}</div>${PAGER}</div>`;
}

/* ---- D1 · “Hai tầng”: tìm + 2 ô chọn ở tầng 1, tình trạng ở tầng 2 ---- */
function libD1() {
  return `<div class="libd">
    <div class="libbar">
      ${srch('Tìm truyện, tác giả, couple…', '⌘K')}
      ${dd('Năm')}${dd('Sắp xếp: Mới cập nhật')}
      <div class="end">${viewSeg}</div>
    </div>
    <div class="librow">
      <div class="chips" data-chips="D1">
        ${STATUS.map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-f="${c.k}" data-scope="D1">${c.t}<b>${c.n}</b></button>`).join('')}
        <button class="chip" data-f="18" data-scope="D1">18+<b>${adultList.length}</b></button>
      </div>
      <div class="end">${countTag('D1')}</div>
    </div>
    <div data-grid="D1">${libGrid(BOOKS)}</div>
    ${PAGER}
  </div>`;
}

/* ---- D2 · “Một hàng”: gom hết vào một dòng, tình trạng thành ô chọn ---- */
function libD2() {
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  return `<div class="libd">
    <div class="libbar">
      ${srch('Tìm truyện, tác giả, couple…')}
      <select class="sel" data-filter="D2" aria-label="Tình trạng">
        ${opt('all', 'Tình trạng: tất cả')}${opt('done', `Hoàn thành (${doneAll.length})`)}
        ${opt('run', `Đang cập nhật (${runList.length})`)}${opt('soon', `Sắp ra mắt (${soonList.length})`)}
        ${opt('18', `18+ (${adultList.length})`)}
      </select>
      <select class="sel" aria-label="Năm"><option>Năm: tất cả</option>${topCount('y', 3).map((o) => `<option>${esc(o.v)}</option>`).join('')}</select>
      <select class="sel" aria-label="Sắp xếp"><option>Mới cập nhật</option><option>Nhiều chương</option><option>Tên A→Z</option></select>
      <div class="end">${countTag('D2')}${viewSeg}</div>
    </div>
    <div data-grid="D2">${libGrid(BOOKS)}</div>
    ${PAGER}
  </div>`;
}

/* ---- D3 · “Mở ra khi cần”: một dòng, bộ lọc nằm trong tấm mở ra ---- */
function libD3() {
  return `<div class="libd">
    <div class="libbar">
      ${srch('Tìm truyện, tác giả, couple…', '⌘K')}
      <button class="dd open" type="button">${ICON.filter}Bộ lọc <b class="badge">2</b></button>
      <select class="sel" aria-label="Sắp xếp"><option>Sắp xếp: Mới cập nhật</option><option>Nhiều chương</option></select>
      <div class="end">${countTag('D3')}${viewSeg}</div>
    </div>
    <div class="fpanel">
      <div class="fph"><span class="lb">Bộ lọc</span>
        <button class="x" type="button" aria-label="Đóng bộ lọc">${ICON.x}</button></div>
      <div class="fpgrid">
        <div class="fg"><span class="t">Tình trạng</span>
          <div class="chips">${STATUS.map((c, i) =>
            `<button class="chip${i === 0 ? ' on' : ''}" data-f="${c.k}" data-scope="D3">${c.t}<b>${c.n}</b></button>`).join('')}</div></div>
        <div class="fg"><span class="t">Nhãn</span>
          <div class="chips"><button class="chip" data-f="18" data-scope="D3">18+<b>${adultList.length}</b></button></div></div>
        <div class="fg"><span class="t">Năm</span>
          <div class="chips">${topCount('y', 3).map((o) => `<button class="chip" data-f="y:${esc(o.v)}" data-scope="D3">${esc(o.v)}<b>${o.n}</b></button>`).join('')}</div></div>
      </div>
      <div class="fpf">
        <button class="lnk" type="button">Xoá lọc</button>
        <span class="grow"></span>
        <span class="lcount" data-libcount="D3">1–18 / ${BOOKS.length}</span>
        <button class="btn-pri" type="button">Xem kết quả</button>
      </div>
    </div>
    <div data-grid="D3">${libGrid(BOOKS)}</div>
    ${PAGER}
  </div>`;
}

/* ------------------------------- trang ------------------------------- */
const VHEADS = {
  C: {
    t: 'Bento — phần đầu trang (đã chốt)',
    p: `Ba khối đầu (Đọc tiếp · Mới cập nhật · Ranking) gộp thành một dải bento 12 cột nên vùng đầu
        trang gọn trong một màn hình. Đây là phần <b>đã chốt</b> — ba cách bày Thư viện ở dưới chỉ thay
        phần lọc + lưới, không đụng gì tới khối này.`,
    pts: [
      '<b>Một màn hình</b> là thấy đủ: đang đọc gì, có gì mới, ai đang dẫn đầu',
      '<b>Lịch tuần</b> giữ nguyên dải 7 ngày',
      'Phần Thư viện tách ra làm lại — xem D1 · D2 · D3'
    ],
    ref: 'glvietsubz.net — khối tổng hợp;<br>glvietsub.org — bento chủ đề, số đếm'
  },
  D1: {
    t: 'Thư viện · Hai tầng — tìm ở tầng 1, tình trạng ở tầng 2',
    p: `<b>Tầng 1:</b> ô tìm + Năm + Sắp xếp + kiểu xem. <b>Tầng 2:</b> tình trạng để dạng chip có số
        lượng, kèm số kết quả bên phải. Tình trạng là bộ lọc dùng nhiều nhất nên cho nó một tầng riêng
        — thấy ngay, bấm một phát, không phải mở menu.`,
    pts: [
      '<b>Bốn ô chọn ngang + 2 hàng chip</b> của bản cũ gộp còn <b>2 ô chọn + 1 hàng chip</b>',
      '<b>Bỏ bộ lọc “Couple”</b>: mỗi couple chỉ 1–2 bộ, lọc theo danh sách dài không ai dùng — gõ tên vào ô tìm là ra',
      '<b>Tình trạng</b> thành chip có số: “Hoàn thành 46” — biết trước khi bấm',
      'Chỉ <b>một</b> cơ chế lọc, không chip + cột lọc trùng nhau như bản trước'
    ],
    ref: 'glvietsubz.net — hàng tab tình trạng có số;<br>NetTruyen/Mangadex — tìm + ô chọn gọn'
  },
  D2: {
    t: 'Thư viện · Một hàng — gom hết vào một dòng',
    p: `Tất cả nằm trên <b>đúng một dòng</b>: tìm, tình trạng, năm, sắp xếp, kiểu xem. Gọn nhất về
        chiều cao. Đổi lại tình trạng phải mở ô chọn mới thấy số lượng, và trên máy hẹp hàng này tự
        xuống dòng.`,
    pts: [
      'Cao đúng <b>một dòng</b> — lưới truyện lên cao hơn ~40px so với D1',
      'Tình trạng thành ô chọn: gọn nhưng <b>giấu số lượng</b>',
      'Ô chọn gốc của trình duyệt: nhẹ, quen tay, tự cuộn được trên điện thoại',
      'Máy hẹp: hàng tự xuống 2–3 dòng, không vỡ'
    ],
    ref: 'MyAnimeList / AniList — thanh lọc một dòng;<br>glvietsubz.net — ô chọn gốc'
  },
  D3: {
    t: 'Thư viện · Mở ra khi cần — một dòng, bộ lọc trong tấm',
    p: `Mặc định chỉ còn ô tìm + nút <b>Bộ lọc</b> (có số điều kiện đang bật) + Sắp xếp. Bấm Bộ lọc thì
        một tấm mở ra ngay dưới thanh, gom đủ tình trạng · nhãn · năm · couple có số lượng, và một nút
        “Xem kết quả”. Sạch nhất khi chưa lọc, nhưng thêm một cú bấm khi cần lọc.`,
    pts: [
      'Chưa lọc thì chỉ còn <b>2 nút</b> — sạch nhất trong ba cách',
      'Bấm “Bộ lọc 2” là biết đang bật mấy điều kiện',
      'Tấm lọc dùng lại đúng cho điện thoại (mở toàn bề ngang)',
      'Thêm một cú bấm mỗi lần lọc — đổi lại đầu trang gọn hơn'
    ],
    ref: 'glvietsub.org — tấm lọc bung ra;<br>Viki / iQIYI — lọc trong sheet'
  }
};

const variantSection = (k, body) => {
  const v = VHEADS[k];
  return `<section class="var" id="${k}">
  <div class="vhead">
    <div class="txt">
      <h2><span class="tag">${k}</span>${v.t}</h2>
      <p>${v.p}</p>
      <ul class="vpts">${v.pts.map((x) => `<li>${x}</li>`).join('')}</ul>
    </div>
    <div class="vref">Tham khảo<br>${v.ref}</div>
  </div>
  <div class="stage"><div class="site">${body}</div></div>
</section>`;
};

const CMP = `<section class="cmp">
  <h2>So nhanh ba cách bày Thư viện</h2>
  <p>Bìa và tên truyện là dữ liệu thật trong <code>data/registry.json</code> (67 bộ: 46 hoàn thành ·
     17 sắp ra mắt · 4 đang cập nhật · 29 bộ 18+). Lượt xem và tiến độ đọc là số giả.</p>
  <table>
    <thead><tr><th scope="col"><span class="sr">Tiêu chí</span></th>` +
  `<th scope="col">D1 · Hai tầng</th><th scope="col">D2 · Một hàng</th><th scope="col">D3 · Mở ra khi cần</th></tr></thead>
    <tbody>
      <tr><th scope="row">Chiều cao thanh lọc</th><td>2 dòng (~78px)</td><td><b>1 dòng (~44px)</b></td><td>1 dòng (~44px)</td></tr>
      <tr><th scope="row">Số điều kiện thấy ngay</th><td><b>4 tình trạng + 18+</b></td><td>0 (phải mở ô chọn)</td><td>0 (phải mở tấm)</td></tr>
      <tr><th scope="row">Số cú bấm để lọc</th><td><b>1</b></td><td>2</td><td>2</td></tr>
      <tr><th scope="row">Máy hẹp</th><td>chip xuống dòng, vẫn rõ</td><td>ô chọn cuộn được</td><td>tấm mở toàn ngang</td></tr>
      <tr><th scope="row">Hợp khi</th><td>muốn thấy số lượng, lọc nhanh</td><td>cần tiết kiệm chỗ nhất</td><td>thư viện lớn, ít lọc</td></tr>
    </tbody>
  </table>
</section>`;

const CSS = fs.readFileSync(path.join(HERE, 'mock.css'), 'utf8');

const HTML = `<!DOCTYPE html>
<html lang="vi" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mockup · nửa dưới trang chủ (3 phương án)</title>
<meta name="robots" content="noindex">
<style>
${CSS}
/* chỉ có trong trang mockup: bật/tắt trạng thái “đã có lịch sử đọc” */
.when-new{display:none}
body[data-hist="0"] .when-hist{display:none}
body[data-hist="0"] .when-new{display:block}
</style>
</head>
<body data-w="d" data-hist="1">

<div class="mk-top">
  <h1><span>ssochuz · mockup</span>Phương án C + 3 cách bày Thư viện</h1>
  <div class="grow"></div>
  <nav class="mk-nav" aria-label="Phương án"><span class="lbl">Xem</span>
    <a href="#C">C</a><a href="#D1">D1</a><a href="#D2">D2</a><a href="#D3">D3</a></nav>
  <div class="seg" data-width role="group" aria-label="Bề rộng khung xem">
    <span class="lbl">Khung</span>
    <button data-w="d" class="on">Máy tính</button>
    <button data-w="t">Tablet 834</button>
    <button data-w="m">Điện thoại 390</button>
  </div>
  <label class="chk"><input type="checkbox" id="histChk" checked>Đã có lịch sử đọc</label>
</div>

<div class="wrap-mk">
${variantSection('C', variantC())}
${variantSection('D1', libD1())}
${variantSection('D2', libD2())}
${variantSection('D3', libD3())}
${CMP}
</div>

<script>
/* Lớp tương tác TIỆN XEM — không phần nội dung nào phụ thuộc vào đoạn này:
   tắt JS vẫn thấy đủ mọi khối (trước đây toàn bộ nội dung do JS dựng nên mở ra
   chỉ có khung rỗng — đó là lỗi). */
(function () {
  var body = document.body;

  /* Lưới dựng ĐỦ 67 bộ trong HTML; JS chỉ ẩn những bộ không khớp và chỉ chừa
     18 bộ khớp đầu tiên (đúng như một trang của pager). Nhờ vậy:
       · tắt JS  → vẫn thấy đủ (chỉ là không phân trang)
       · lọc     → luôn tính từ toàn bộ thư viện, không phải từ 18 bộ đang hiện */
  var PAGE = 18;
  var SNAP = {};
  var SCOPES = ['D1', 'D2', 'D3'];
  SCOPES.forEach(function (sc) {
    var g = document.querySelector('[data-grid="' + sc + '"]');
    if (g) SNAP[sc] = Array.prototype.slice.call(g.querySelectorAll('.poster'));
  });

  function paint(sc, o) {
    var shown = 0, total = 0;
    SNAP[sc].forEach(function (p) {
      var ok = match(p, o);
      if (ok) total++;
      var vis = ok && shown < PAGE;
      if (vis) shown++;
      p.style.display = vis ? 'block' : 'none';   /* inline thắng luật :nth-child */
    });
    var c = document.querySelector('[data-libcount="' + sc + '"]');
    if (c) c.textContent = (shown ? '1–' + shown : '0') + ' / ' + total;
  }
  /* Bộ lọc: {f} = một điều kiện đơn (D2), hoặc {st, n18, y} ghép được nhiều
     điều kiện (D1, D3 — tình trạng + 18+ + năm cộng lại). */
  var S = { D1: { st: '', n18: false, y: '' }, D3: { st: '', n18: false, y: '' } };

  function match(p, o) {
    var ds = p.dataset;
    if (o.f && o.f !== 'all') {
      if (o.f === '18' && ds['18'] !== '1') return false;
      if (o.f === 'done' && ds.st !== 'Hoàn thành') return false;
      if (o.f === 'run' && ds.st !== 'Đang cập nhật') return false;
      if (o.f === 'soon' && ds.st !== 'Sắp ra mắt') return false;
    }
    if (o.st && ds.st !== o.st) return false;
    if (o.n18 && ds['18'] !== '1') return false;
    if (o.y && ds.y !== o.y) return false;
    return true;
  }

  function syncChips(sc) {
    var st = S[sc].st, n18 = S[sc].n18, y = S[sc].y;
    document.querySelectorAll('.chip[data-scope="' + sc + '"]').forEach(function (c) {
      var f = c.getAttribute('data-f'), on;
      if (f === 'all') on = !st;
      else if (f === '18') on = n18;
      else if (f.indexOf('y:') === 0) on = y === f.slice(2);
      else on = st === f;
      c.classList.toggle('on', on);
    });
    var badge = document.querySelector('.dd .badge');
    if (badge && sc === 'D3') {
      var n = (st ? 1 : 0) + (n18 ? 1 : 0) + (y ? 1 : 0);
      badge.textContent = n;
      badge.style.display = n ? '' : 'none';
    }
  }

  var STMAP = { done: 'Hoàn thành', run: 'Đang cập nhật', soon: 'Sắp ra mắt' };

  function toggleChip(sc, f) {
    var st = S[sc];
    if (f === 'all') { st.st = ''; st.n18 = false; st.y = ''; }
    else if (f === '18') st.n18 = !st.n18;
    else if (f.indexOf('y:') === 0) st.y = st.y === f.slice(2) ? '' : f.slice(2);
    else st.st = STMAP[f] || '';
    syncChips(sc);
    paint(sc, st);
  }

  document.addEventListener('click', function (e) {
    /* đổi bề rộng khung */
    var w = e.target.closest('[data-width] button');
    if (w) {
      body.setAttribute('data-w', w.getAttribute('data-w'));
      document.querySelectorAll('[data-width] button').forEach(function (b) {
        b.classList.toggle('on', b === w);
      });
      return;
    }
    /* chip lọc */
    var chip = e.target.closest('.chip[data-f]');
    if (chip) {
      var sc = chip.getAttribute('data-scope');
      if (S[sc]) toggleChip(sc, chip.getAttribute('data-f'));
      else paint(sc, { f: chip.getAttribute('data-f') });
    }
  });

  SCOPES.forEach(function (sc) { if (SNAP[sc]) paint(sc, {}); });
  S.D3 = { st: 'Hoàn thành', n18: true, y: '' };
  syncChips('D3');
  paint('D3', S.D3);

  /* “Xoá lọc” trong tấm bộ lọc */
  var clear = document.querySelector('.fpf .lnk');
  if (clear) clear.addEventListener('click', function () {
    S.D3 = { st: '', n18: false, y: '' };
    syncChips('D3');
    paint('D3', S.D3);
  });

  /* ô chọn gốc (phương án D2): đổi là lọc luôn */
  document.addEventListener('change', function (e) {
    var sel = e.target.closest('select[data-filter]');
    if (!sel) return;
    paint(sel.getAttribute('data-filter'), { f: sel.value });
  });

  var hist = document.getElementById('histChk');
  if (hist) hist.addEventListener('change', function () {
    body.setAttribute('data-hist', hist.checked ? '1' : '0');
  });
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi index.html ·', Math.round(HTML.length / 1024), 'kB ·', BOOKS.length, 'bộ ·',
  'bìa thiếu:', BOOKS.filter((b) => !b.img).length);
