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
    if (coverFiles.has(k)) return `../../assets/covers/${k}.webp`;
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
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l6 6L20 6"/></svg>'
};

/* ---------- chọn dữ liệu cho từng khối ---------- */
const recent = BOOKS.slice().sort((a, b) => String(b.u).localeCompare(String(a.u))).slice(0, 12);
const doneList = BOOKS.filter((b) => b.st === 'Hoàn thành' && b.n > 20);
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

const CHIPS = [
  { k: 'all', t: 'Tất cả', n: BOOKS.length },
  { k: 'done', t: 'Hoàn thành', n: doneList.length },
  { k: 'run', t: 'Đang cập nhật', n: runList.length },
  { k: 'soon', t: 'Sắp ra mắt', n: soonList.length },
  { k: '18', t: '18+', n: adultList.length }
];
const chipRow = (scope) =>
  CHIPS.map((c, i) =>
    `<button class="chip${i === 0 ? ' on' : ''}" data-f="${c.k}" data-scope="${scope}">${c.t}<b>${c.n}</b></button>`
  ).join('');

const libGrid = (list) => `<div class="lgrid">${list.map(poster).join('')}</div>`;
const PAGER = `<div class="pager"><button class="on">1</button><button>2</button><button>3</button>` +
  `<span class="gap">…</span><button>8</button></div>`;

const SORT = `<select class="sel" aria-label="Sắp xếp"><option>Sắp xếp: Mới cập nhật</option>` +
  `<option>Nhiều chương</option><option>Tên A→Z</option></select>`;
const YEAR = `<select class="sel" aria-label="Năm"><option>Năm: tất cả</option>` +
  `<option>2026</option><option>2025</option></select>`;
const VSEG = `<span class="seg" style="padding:2px"><button class="on">Tuần</button><button>Tháng</button></span>`;

/* ============================ PHƯƠNG ÁN A ================================= */
function variantA() {
  const resume = `<div class="when-hist"><div class="rgrid">` +
    RESUME.map(resumeCard).join('') + `</div></div>` +
    `<div class="when-new">${starterBlock()}` +
    `<div class="emptyhint" style="margin-top:12px"><span class="ic">${ICON.book}</span>` +
    `<span>Chưa có lịch sử đọc — mở một bộ bất kỳ là mục <b>Đọc tiếp</b> sẽ hiện ở đây.</span></div></div>`;

  return `<div class="pg">
  <section class="sec">
    ${head({ lb: 'My Space', t: 'Đọc tiếp', cnt: `${RESUME.length} bộ`, r: more('My Space') })}
    ${resume}
  </section>
  <section class="sec">
    ${head({ lb: 'Vừa lên kệ', t: 'Mới cập nhật', cnt: '12 bộ',
      r: `<button class="more">Hôm nay đọc gì?</button>${more('Xem tất cả')}` })}
    <div class="shelf wrap">${recent.map(poster).join('')}</div>
  </section>
  <section class="sec">
    ${head({ lb: 'Bảng xếp hạng', t: 'Ranking', cnt: 'tuần này',
      r: `${VSEG}${more('Toàn bảng')}` })}
    <div data-chart>${chart(RANK)}</div>
    <div style="margin-top:24px">
      ${head({ lb: 'Biên tập chọn', t: 'Đáng xem' })}
      <div class="shelf wrap">${worthSix().map(poster).join('')}</div>
    </div>
  </section>
  <section class="sec">
    ${head({ lb: 'Trong tuần', t: 'Lịch ra chương', cnt: '6 bộ', r: more('Xem lịch đầy đủ') })}
    ${weekStrip()}
  </section>
  <section class="sec">
    ${head({ lb: `Toàn bộ ${BOOKS.length} bộ`, t: 'Thư viện',
      r: `<span class="lbar">1–18 / ${BOOKS.length}</span>` })}
    <div class="ltool" style="margin-bottom:14px">
      <div class="chips" data-chips="A">${chipRow('A')}</div>
      <div class="end">${SORT}${YEAR}</div>
    </div>
    <div data-grid="A">${libGrid(BOOKS)}</div>
    ${PAGER}
  </section>
</div>`;
}

/* ============================ PHƯƠNG ÁN B ================================= */
function variantB() {
  const resume = `<div class="when-hist">${RESUME.slice(0, 3).map(resumeCard).join('')}</div>` +
    `<div class="when-new" style="margin-top:10px">${starterBlock()}</div>`;

  const side = `<aside class="side">
    <div class="blk pin">
      <div class="h"><span class="lb">Đọc tiếp</span>${more('My Space')}</div>
      ${resume}
      <div class="when-hist" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bd)">
        <div class="h" style="margin-bottom:8px"><span class="lb" style="color:var(--dim)">Theo dõi có chương mới</span></div>
        <div class="mini">${doneList.slice(0, 3).map(poster).join('')}</div>
      </div>
    </div>
    <div class="blk">
      <div class="h"><span class="lb">Lịch ra chương</span>${more('Tuần này')}</div>
      ${weekList()}
    </div>
    <div class="blk">
      <div class="h"><span class="lb">Đáng xem</span></div>
      <div class="worth">${WORTH.map(poster).join('')}</div>
    </div>
  </aside>`;

  const main = `<div class="main">
  <section class="sec" style="padding-top:0">
    ${head({ lb: 'Vừa lên kệ', t: 'Mới cập nhật', cnt: '12 bộ',
      r: `<button class="more">Hôm nay đọc gì?</button>${more('Xem tất cả')}` })}
    <div class="shelf wrap c4">${recent.map(poster).join('')}</div>
  </section>
  <section class="sec">
    ${head({ lb: 'Bảng xếp hạng', t: 'Ranking', cnt: 'tuần này', r: `${VSEG}${more('Toàn bảng')}` })}
    <div data-chart>${chart(RANK)}</div>
  </section>
  <section class="sec">
    ${head({ lb: `Toàn bộ ${BOOKS.length} bộ`, t: 'Thư viện',
      r: `<span class="lbar">1–18 / ${BOOKS.length}</span>` })}
    <div class="ltool" style="margin-bottom:14px">
      <div class="chips" data-chips="B">${chipRow('B')}</div>
      <div class="end">${SORT}</div>
    </div>
    <div data-grid="B">${libGrid(BOOKS)}</div>
    ${PAGER}
  </section>
</div>`;

  return `<div class="pg"><div class="two">${side}${main}</div></div>`;
}

/* ============================ PHƯƠNG ÁN C ================================= */
function fgroup(title, kind, opts) {
  return `<div class="grp"><div class="t">${title}</div>` +
    opts.map((o, i) =>
      `<div class="op${i === 0 ? ' on' : ''}" data-k="${kind}" data-v="${esc(o.v)}">` +
        `<span class="bx">${i === 0 ? ICON.check : ''}</span>${esc(o.t)}` +
        `<span class="n">${o.n}</span></div>`
    ).join('') + `</div>`;
}
function topCount(key, take) {
  const c = {};
  BOOKS.forEach((b) => { if (b[key]) c[b[key]] = (c[b[key]] || 0) + 1; });
  return Object.keys(c).sort((a, b) => c[b] - c[a] || String(b).localeCompare(String(a)))
    .slice(0, take).map((k) => ({ v: k, t: k, n: c[k] }));
}

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

  const fcol = `<div class="fcol" data-fcol>` +
    fgroup('Tình trạng', 'st', [
      { v: '', t: 'Tất cả', n: BOOKS.length },
      { v: 'Hoàn thành', t: 'Hoàn thành', n: doneList.length },
      { v: 'Đang cập nhật', t: 'Đang cập nhật', n: runList.length },
      { v: 'Sắp ra mắt', t: 'Sắp ra mắt', n: soonList.length }
    ]) +
    fgroup('Nhãn', '18', [
      { v: '', t: 'Tất cả', n: BOOKS.length },
      { v: '1', t: '18+', n: adultList.length }
    ]) +
    fgroup('Năm', 'y', [{ v: '', t: 'Tất cả', n: BOOKS.length }, ...topCount('y', 3)]) +
    fgroup('Couple', 'c', [{ v: '', t: 'Tất cả', n: BOOKS.length }, ...topCount('c', 3)]) +
    `</div>`;

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
    ${head({ lb: `Toàn bộ ${BOOKS.length} bộ`, t: 'Thư viện',
      r: `<span class="lbar" data-libcount>1–18 / ${BOOKS.length}</span>` })}
    <div class="lib2">${fcol}
      <div>
        <div class="ltool" style="margin-bottom:4px">
          <div class="chips" data-chips="C">${chipRow('C')}</div>
          <div class="end">${SORT}</div>
        </div>
        <div data-grid="C">${libGrid(BOOKS)}</div>
        ${PAGER}
      </div>
    </div>
  </section>
</div>`;
}

/* ------------------------------- trang ------------------------------- */
const VHEADS = {
  A: {
    t: 'Kệ sách — giữ nguyên thứ tự mục, làm lại từng khối',
    p: `Thứ tự mục như hiện tại (Đọc tiếp → Mới cập nhật → Ranking → Lịch → Thư viện) nhưng mỗi khối
        được làm lại theo cách các web cùng loại đang làm: bìa có nhãn tình trạng <b>và</b> số chương
        nằm ngay trên ảnh, đầu mục có số lượng + “Xem tất cả”, bảng xếp hạng dùng số thứ tự lớn, lịch
        ra chương thành dải 7 ngày. Ít rủi ro nhất, dễ duyệt nhất.`,
    pts: [
      '<b>Bìa:</b> nhãn tình trạng + “39 chương” trên ảnh, tên 2 dòng, tác giả dòng mono',
      '<b>Kệ:</b> 6 cột cố định trên desktop — hết cảnh 12 bộ mà 5 bộ bị giấu sau thanh cuộn ngang',
      '<b>Ranking:</b> 5 dòng có số thứ tự lớn + mũi tên tăng/giảm',
      '<b>Đọc tiếp:</b> thẻ rộng có thanh tiến độ + “Ch. 34/71 · còn 37”'
    ],
    ref: 'glvietsubz.net — bìa + nhãn trên ảnh, “Xem thêm”;<br>glvietsub.org — BXH số lớn, dải lịch'
  },
  B: {
    t: 'Bảng tin — hai cột, cột phụ dính bên phải',
    p: `Toàn bộ phần “của riêng bạn” (Đọc tiếp, Theo dõi, Lịch tuần, Đáng xem) gom vào một cột phụ
        bên phải, khối “Đọc tiếp” dính lại nên vẫn thấy khi đã cuộn sâu trong lưới thư viện. Cột chính
        chỉ còn nội dung để lướt: Mới cập nhật → Ranking → Thư viện. Trên máy hẹp, cột phụ tự nhảy lên
        trên nên “Đọc tiếp” vẫn là thứ đầu tiên gặp được.`,
    pts: [
      '<b>Đọc tiếp</b> thành chồng 3 thẻ dọc, có tiến độ — không cần cuộn ngang',
      '<b>Lịch tuần</b> dạng danh sách dọc, hôm nay tô nền hồng nhạt',
      '<b>Thư viện</b> chiếm trọn cột chính: lưới rộng hơn, ít mắt phải nhảy hơn',
      'Cột phụ chỉ dính khối Đọc tiếp (dính cả cột thì cột cao hơn màn hình, phần dưới không cuộn tới được)'
    ],
    ref: 'glvietsubz.net — cột chính + cột phụ;<br>glvietsub.org — khối danh sách có số'
  },
  C: {
    t: 'Bento — gom 3 khối đầu thành một dải, thư viện có cột lọc',
    p: `Ba khối đầu (Đọc tiếp · Mới cập nhật · Ranking) gộp thành một dải bento 12 cột nên vùng đầu
        trang gọn trong một màn hình. Thư viện được nâng thành trang con thực thụ: cột lọc bên trái
        (tình trạng, nhãn, năm, couple — có số lượng) + chip lọc nhanh phía trên lưới.`,
    pts: [
      '<b>Một màn hình</b> là thấy đủ: đang đọc gì, có gì mới, ai đang dẫn đầu',
      '<b>Lọc dạng cột</b> thay vì 4 ô chọn ngang — nhìn được số lượng từng lựa chọn',
      '<b>Thư viện</b> lưới dày, đầu trang ít khoảng trống',
      'Nhiều thay đổi nhất — cần duyệt kỹ phần lọc'
    ],
    ref: 'glvietsubz.net — khối tổng hợp + lọc cột;<br>glvietsub.org — bento chủ đề, số đếm'
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
  <h2>So nhanh ba phương án</h2>
  <p>Bìa và tên truyện là dữ liệu thật trong <code>data/registry.json</code>. Lượt xem và tiến độ đọc
     là số giả để thấy hình dạng thông tin.</p>
  <table>
    <thead><tr><th scope="col"><span class="sr">Tiêu chí</span></th>` +
  `<th scope="col">A · Kệ sách</th><th scope="col">B · Bảng tin</th><th scope="col">C · Bento</th></tr></thead>
    <tbody>
      <tr><th scope="row">Thay đổi</th><td>ít nhất — chỉ ruột từng khối</td><td>vừa — thêm cột phụ</td><td>nhiều nhất</td></tr>
      <tr><th scope="row">Mạnh</th><td>dễ duyệt, không đụng điều hướng</td><td>“đang đọc gì” luôn trong tầm mắt</td><td>gọn nhất, lọc tốt nhất</td></tr>
      <tr><th scope="row">Yếu</th><td>vẫn 5 mục dài, phải cuộn lên đầu</td><td>cột phụ 322px nên bìa nhỏ</td><td>phải duyệt lại phần lọc</td></tr>
      <tr><th scope="row">Công dựng</th><td>~1 buổi</td><td>~1 buổi</td><td>~1,5 buổi</td></tr>
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
  <h1><span>ssochuz · mockup</span>Nửa dưới trang chủ — 3 phương án</h1>
  <div class="grow"></div>
  <nav class="mk-nav" aria-label="Phương án"><span class="lbl">Xem</span>
    <a href="#A">A</a><a href="#B">B</a><a href="#C">C</a></nav>
  <div class="seg" data-width role="group" aria-label="Bề rộng khung xem">
    <span class="lbl">Khung</span>
    <button data-w="d" class="on">Máy tính</button>
    <button data-w="t">Tablet 834</button>
    <button data-w="m">Điện thoại 390</button>
  </div>
  <label class="chk"><input type="checkbox" id="histChk" checked>Đã có lịch sử đọc</label>
</div>

<div class="wrap-mk">
${variantSection('A', variantA())}
${variantSection('B', variantB())}
${variantSection('C', variantC())}
${CMP}
</div>

<script>
/* Lớp tương tác TIỆN XEM — không phần nội dung nào phụ thuộc vào đoạn này:
   tắt JS vẫn thấy đủ mọi khối (trước đây toàn bộ nội dung do JS dựng nên mở ra
   chỉ có khung rỗng — đó là lỗi). */
(function () {
  var body = document.body;
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l6 6L20 6"/></svg>';

  /* Lưới dựng ĐỦ 67 bộ trong HTML; JS chỉ ẩn những bộ không khớp và chỉ chừa
     18 bộ khớp đầu tiên (đúng như một trang của pager). Nhờ vậy:
       · tắt JS  → vẫn thấy đủ (chỉ là không phân trang)
       · lọc     → luôn tính từ toàn bộ thư viện, không phải từ 18 bộ đang hiện */
  var PAGE = 18;
  var SNAP = {};
  ['A', 'B', 'C'].forEach(function (sc) {
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
      p.style.display = vis ? '' : 'none';
    });
    var c = document.querySelector('[data-libcount]');
    if (c) c.textContent = (shown ? '1–' + shown : '0') + ' / ' + total;
  }
  function match(p, o) {
    var ds = p.dataset;
    if (o.f && o.f !== 'all') {
      if (o.f === '18') { if (ds['18'] !== '1') return false; }
      else if (o.f === 'done') { if (ds.st !== 'Hoàn thành') return false; }
      else if (o.f === 'run') { if (ds.st !== 'Đang cập nhật') return false; }
      else if (o.f === 'soon') { if (ds.st !== 'Sắp ra mắt') return false; }
    }
    if (o.st && ds.st !== o.st) return false;
    if (o.n18 && ds['18'] !== '1') return false;
    if (o.y && ds.y !== o.y) return false;
    if (o.c && ds.c !== o.c) return false;
    return true;
  }
  function filterScope(sc, o) { paint(sc, o); }

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
    /* chip lọc nhanh */
    var chip = e.target.closest('.chip[data-f]');
    if (chip) {
      var box = chip.parentNode;
      box.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('on', x === chip); });
      filterScope(chip.getAttribute('data-scope'), { f: chip.getAttribute('data-f') });
      return;
    }
    /* cột lọc của phương án C (kết hợp được nhiều điều kiện) */
    var op = e.target.closest('.fcol .op');
    if (op) {
      var k = op.getAttribute('data-k');
      op.closest('.fcol').querySelectorAll('[data-k="' + k + '"]').forEach(function (x) {
        var on = x === op;
        x.classList.toggle('on', on);
        x.querySelector('.bx').innerHTML = on ? CHECK : '';
      });
      var o = {};
      op.closest('.fcol').querySelectorAll('.op.on').forEach(function (x) {
        var kk = x.getAttribute('data-k'), v = x.getAttribute('data-v');
        if (!v) return;
        if (kk === '18') o.n18 = true; else o[kk] = v;
      });
      filterScope('C', o);
    }
  });

  ['A', 'B', 'C'].forEach(function (sc) { if (SNAP[sc]) paint(sc, {}); });

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
