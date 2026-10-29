#!/usr/bin/env node
/* ============================================================================
   gen.mjs · mockup TĨNH cho nửa dưới trang chủ (từ “Đọc tiếp” tới Thư viện)
   ----------------------------------------------------------------------------
   Sinh index.html bằng dữ liệu THẬT của web (67 bộ + bìa thật trong
   assets/covers) để bản xem trước không phải “bản vẽ tay”.

   Ba phương án trong một trang, cùng một bề rộng khung (nút Desktop/Tablet/
   Mobile ở thanh trên), nên so được từng phương án ở cùng một cỡ màn hình:
     E1 · KỆ BÌA   — nhịp của glvietsubz: mỗi mục là một hàng bìa, đầu mục có
                     “Xem thêm ›”, bìa chỉ một nhãn.
     E2 · TẠP CHÍ  — hàng bìa ở trên, rồi hai cột: thư viện là chính, cột phụ
                     dính bên phải giữ “Đọc tiếp · Lịch tuần · Đáng xem”.
     E3 · BẢNG     — bản đang chạy nhưng bỏ khung hộp: hai cột trên (Đọc tiếp |
                     Bảng xếp hạng), rồi hàng bìa choáng ngang, lịch, thư viện.

   Chạy:  node docs/mockups/home-v2/gen.mjs
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
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  dn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6-6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>',
  rows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="5" width="16" height="5"/><rect x="4" y="14" width="16" height="5"/></svg>',
  dice: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/></svg>'
};

/* --------------------------- chọn dữ liệu -------------------------------- */
const recent = BOOKS.slice()
  .sort((a, b) => String(b.u).localeCompare(String(a.u)))
  .slice(0, 6);

const RESUME = [
  ['pls-love', 34],
  ['love-on-hire', 18],
  ['yours-ever', 41]
].map(([s, at]) => { const b = bySlug(s); return b ? { b, at } : null; }).filter(Boolean);

const RANK = [
  ['pls-love', 12480, 41220, 'up', 3],
  ['love-on-hire', 9240, 30110, 'up', 1],
  ['juliet-n-juliet', 7815, 26042, 'dn', 1],
  ['third-person', 6402, 21870, 'up', 2],
  ['yours-ever', 5190, 18440, 'eq', 0]
].map(([s, week, month, tr, d]) => { const b = bySlug(s); return b ? { b, week, month, tr, d } : null; }).filter(Boolean);

const STARS = { 'lunar-secret': [4.8, 31], 'bake-love-feelings': [4.6, 24], 'love-design': [4.4, 18] };
const WORTH = Object.keys(STARS).map(bySlug).filter(Boolean);

const STARTER = [
  { b: bySlug('pls-love') || recent[0], k: 'Đọc trọn một mạch' },
  { b: bySlug('pgrace-khong-nhan-loi-yeu-au') || recent[1], k: 'Ngắn, đọc một tối' },
  { b: bySlug('nguoi-chong-lanh-lung-cua-co-vo-beo') || recent[2], k: 'Mới lên kệ' }
].filter((x) => x.b);

/* Lịch: lấy đúng items trong registry.schedule, chia theo thứ; tuần minh hoạ
   bắt đầu 02/11/2026 (thứ Hai) — thứ 4 là “hôm nay”. */
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WD_FULL = { 'T2': 'Thứ 2', 'T3': 'Thứ 3', 'T4': 'Thứ 4', 'T5': 'Thứ 5', 'T6': 'Thứ 6', 'T7': 'Thứ 7', 'CN': 'Chủ nhật' };
const MONDAY = new Date(2026, 10, 2);   /* 02/11/2026 */
const TODAY = 2;                          /* 0 = T2 → thứ Tư là “hôm nay” */
const SCHED_ITEMS = ((reg.schedule && reg.schedule.items) || []).map((it) => ({
  days: String(it.days || '').split(/[,;·/]+/).map((x) => x.trim()).filter(Boolean),
  title: it.title || '',
  detail: it.detail || '',
  b: bySlug(it.slug) || null
}));
const dt = (i) => {
  const d = new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + i);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
};
const dayName = (s) => (s.indexOf('CN') >= 0 ? 'CN' : s);

/* --------------------------- thành phần ---------------------------------- */
const stCls = (b) => (b.st === 'Hoàn thành' ? 'done' : b.st === 'Sắp ra mắt' ? 'soon' : 'run');
const stLabel = (b) => (b.st === 'Hoàn thành' ? 'Hoàn thành' : b.st === 'Sắp ra mắt' ? 'Sắp ra mắt' : 'Đang cập nhật');

function poster(b, opt = {}) {
  const pill = opt.pill || stLabel(b);
  const cls = opt.pill ? (opt.pillCls || 'run') : stCls(b);
  return (
    `<a class="poster" href="#" data-st="${esc(b.st)}" data-18="${b.e ? 1 : 0}" data-y="${esc(b.y)}">` +
      `<div class="cv">` +
        `<img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy">` +
        `<span class="scrim"></span>` +
        `<span class="pill ${cls}"><i></i>${esc(pill)}</span>` +
        (b.e ? `<span class="badge18">18+</span>` : '') +
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
      `<span class="cv"><img src="${esc(b.img)}" alt="" loading="lazy"></span>` +
      `<div>` +
        `<h3>${esc(b.t)}</h3>` +
        `<div class="sub"><b>Ch. ${r.at}</b> / ${b.n}${left ? ` · còn ${left} chương` : ''}</div>` +
        `<span class="bar"><i style="width:${pct}%"></i></span>` +
        `<span class="cta">${ICON.play}Đọc tiếp</span>` +
      `</div>` +
    `</a>`
  );
}

/* một dòng “đọc tiếp” kiểu danh sách (E2/E3) */
function resumeRow(r) {
  const b = r.b;
  const pct = b.n ? Math.round((r.at / b.n) * 100) : 0;
  return (
    `<a class="resume" href="#">` +
      `<span class="cv"><img src="${esc(b.img)}" alt="" loading="lazy"></span>` +
      `<div>` +
        `<h3>${esc(b.t)}</h3>` +
        `<div class="sub"><b>Ch. ${r.at}</b> / ${b.n}</div>` +
        `<span class="bar"><i style="width:${pct}%"></i></span>` +
        `<span class="cta">Đọc tiếp ${ICON.chev}</span>` +
      `</div>` +
    `</a>`
  );
}

function starterBlock() {
  return (
    `<div class="starters">` +
      STARTER.map((x, i) =>
        `<a href="#"><img src="${esc(x.b.img)}" alt="" loading="lazy">` +
          `<div><span class="n">0${i + 1} · ${esc(x.k)}</span>` +
          `<b>${esc(x.b.t)}</b><span class="m">${x.b.n} chương</span></div></a>`
      ).join('') +
    `</div>`
  );
}

function chart(rows, opt = {}) {
  return (
    `<div class="chart">` +
      rows.map((r, i) => {
        const tr = r.tr === 'up' ? ICON.up + r.d : r.tr === 'dn' ? ICON.dn + r.d : '—';
        return (
          `<a href="#">` +
            `<span class="rk">${i + 1}</span>` +
            `<span class="cv"><img src="${esc(r.b.img)}" alt="" loading="lazy"></span>` +
            `<span class="tt"><h3>${esc(r.b.t)}</h3>` +
              `<span class="mt">${esc(r.b.y)} · ${esc(r.b.a || '—')}</span></span>` +
            `<span class="vv"><span class="n" data-week>${vn(r.week)}</span>` +
              `<span class="tr ${r.tr}">${tr}${opt.unit || ''}</span></span>` +
          `</a>`
        );
      }).join('') +
    `</div>`
  );
}

function worthCards(list) {
  return (
    `<div class="grid3">` +
      list.map((b) => {
        const st = STARS[b.s] || [0, 0];
        return (
          `<a class="poster" href="#">` +
            `<div class="cv"><img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy"><span class="scrim"></span></div>` +
            `<h3>${esc(b.t)}</h3>` +
            `<div class="score">★ ${st[0].toFixed(1)} · ${st[1]} đánh giá</div>` +
          `</a>`
        );
      }).join('') +
    `</div>`
  );
}

function worthRows(list) {
  return (
    `<div class="worthRows">` +
      list.map((b) => {
        const st = STARS[b.s] || [0, 0];
        return (
          `<a href="#">` +
            `<img src="${esc(b.img)}" alt="" loading="lazy">` +
            `<span><b>${esc(b.t)}</b><span class="m">${esc(b.a || '—')}</span></span>` +
            `<span class="st">★ ${st[0].toFixed(1)}</span>` +
          `</a>`
        );
      }).join('') +
    `</div>`
  );
}

function weekStrip() {
  return (
    `<div class="week">` +
      WD.map((wd, i) => {
        const rows = SCHED_ITEMS.filter((it) => it.days.some((d) => dayName(d) === wd));
        const today = i === TODAY;
        return (
          `<div class="day${today ? ' today' : ''}">` +
            `<div class="wd">${wd}${today ? '<em>· hôm nay</em>' : ''}</div>` +
            `<div class="dt">${dt(i)}</div>` +
            (rows.length
              ? rows.map((it) => {
                  const img = it.b && it.b.img;
                  return (
                    `<a class="it" href="#">` +
                      (img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span></span>`) +
                      `<span><b>${esc(it.title || (it.b && it.b.t) || '—')}</b>` +
                      `<span>${esc(it.detail || (it.b ? it.b.n + ' chương' : ''))}</span></span>` +
                    `</a>`
                  );
                }).join('')
              : '<div class="off">nghỉ</div>') +
          `</div>`
        );
      }).join('') +
    `</div>`
  );
}

function weekList() {
  const rows = [];
  WD.forEach((wd, i) => {
    SCHED_ITEMS.filter((it) => it.days.some((d) => dayName(d) === wd)).forEach((it) => {
      rows.push({ wd, i, it });
    });
  });
  return (
    `<div class="weekList">` +
      rows.map(({ wd, i, it }) => {
        const img = it.b && it.b.img;
        return (
          `<a class="row${i === TODAY ? ' today' : ''}" href="#">` +
            `<span class="d">${wd} ${dt(i)}</span>` +
            (img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span></span>`) +
            `<span><b>${esc(it.title || '—')}</b>` +
            `<span class="m">${esc(it.detail || (it.b ? it.b.n + ' chương' : ''))}</span></span>` +
          `</a>`
        );
      }).join('') +
    `</div>`
  );
}

function top5() {
  return (
    `<div class="top5">` +
      RANK.map((r, i) =>
        `<a href="#">` +
          `<span class="rk">${i + 1}</span>` +
          `<img src="${esc(r.b.img)}" alt="" loading="lazy">` +
          `<span class="tt"><b>${esc(r.b.t)}</b><span>${vn(r.week)} lượt tuần này</span></span>` +
        `</a>`
      ).join('') +
    `</div>`
  );
}

/* thanh lọc + lưới + pager: dùng chung cho cả ba phương án */
function library(scope) {
  const done = BOOKS.filter((b) => b.st === 'Hoàn thành').length;
  const run = BOOKS.filter((b) => b.st === 'Đang cập nhật').length;
  const soon = BOOKS.filter((b) => b.st === 'Sắp ra mắt').length;
  const adult = BOOKS.filter((b) => b.e).length;
  return (
    `<div class="libbar">` +
      `<div class="srch">${ICON.search}<input placeholder="Tìm truyện, tác giả, couple…" aria-label="Tìm trong thư viện"><kbd>⌘K</kbd></div>` +
      `<span class="dd"><b>Năm</b><span class="v">Tất cả</span><span class="cv">${ICON.caret}</span></span>` +
      `<span class="dd"><b>Sắp xếp</b><span class="v">Mới cập nhật</span><span class="cv">${ICON.caret}</span></span>` +
      `<div class="vseg"><button class="on" aria-label="Lưới">${ICON.grid}</button><button aria-label="Danh sách">${ICON.rows}</button></div>` +
    `</div>` +
    `<div class="librow"><div class="chips">` +
      `<button class="chip on" data-scope="${scope}" data-f="all">Tất cả<b>${BOOKS.length}</b></button>` +
      `<button class="chip" data-scope="${scope}" data-f="done">Hoàn thành<b>${done}</b></button>` +
      `<button class="chip" data-scope="${scope}" data-f="run">Đang cập nhật<b>${run}</b></button>` +
      `<button class="chip" data-scope="${scope}" data-f="soon">Sắp ra mắt<b>${soon}</b></button>` +
      `<button class="chip" data-scope="${scope}" data-f="18">18+<b>${adult}</b></button>` +
    `</div><span class="libcount" data-libcount="${scope}">1–18 / ${BOOKS.length}</span></div>` +
    `<div class="gridlib" data-grid="${scope}">` +
      BOOKS.map((b) => poster(b)).join('') +
    `</div>` +
    `<div class="pager">` +
      `<button class="off">Trước</button><button class="on">1</button><button>2</button>` +
      `<button>3</button><button class="dots">…</button><button>Sau</button>` +
    `</div>`
  );
}

function secHead(title, cnt, more) {
  return (
    `<div class="shead"><h2>${title}</h2>` +
      (cnt ? `<span class="cnt">${cnt}</span>` : '') +
      (more ? `<a class="more" href="#">${more} ›</a>` : '') +
    `</div>`
  );
}

function periodSeg() {
  return `<div class="seg"><button class="on">Tuần</button><button>Tháng</button><button>Mọi lúc</button></div>`;
}

/* --------------------------- ba phương án -------------------------------- */
const NEW = secHead('Mới cập nhật', `${recent.length} bộ vừa lên chương`, 'Xem tất cả');
const RESUME_SEC = secHead('Đọc tiếp', `${RESUME.length} bộ đang đọc`, 'My Space');
const RANK_SEC = `<div class="shead"><h2>Bảng xếp hạng</h2><span class="cnt">tuần này · theo lượt đọc</span>${periodSeg()}</div>`;

const OPT_E1 = `
<div class="pg">
  <section class="sec">${RESUME_SEC}<div class="resumeRow">${RESUME.map(resumeCard).join('')}</div></section>
  <section class="sec">${NEW}<div class="grid6">${recent.map((b) => poster(b, { pill: b.n + ' chương', pillCls: stCls(b) })).join('')}</div></section>
  <section class="sec">${RANK_SEC}
    <div class="rankWrap">
      <div>${chart(RANK)}</div>
      <div><div class="worthHead"><h3>Đáng xem</h3><a class="more" href="#">Xem tất cả ›</a></div>${worthCards(WORTH)}</div>
    </div>
  </section>
  <section class="sec">${secHead('Lịch ra chương', '7 bộ · tuần này', 'Cả lịch')}${weekStrip()}</section>
  <section class="sec">${secHead('Thư viện', BOOKS.length + ' bộ chọn lọc')}${library('E1')}</section>
</div>`;

const OPT_E2 = `
<div class="pg">
  <section class="sec">${NEW}<div class="grid6">${recent.map((b) => poster(b, { pill: b.n + ' chương', pillCls: stCls(b) })).join('')}</div></section>
  <section class="sec">${secHead('Top tuần', 'theo lượt đọc', 'Toàn bảng')}${top5()}</section>
  <section class="sec">
    <div class="side">
      <div class="pane">${secHead('Thư viện', BOOKS.length + ' bộ chọn lọc')}${library('E2')}</div>
      <aside class="blk pin">${secHead('Đọc tiếp', '', 'My Space')}<div class="rlist">${RESUME.map(resumeRow).join('')}</div></aside>
      <aside class="blk rest">
        <div>${secHead('Lịch tuần', '', 'Cả lịch')}${weekList()}</div>
        <div><div class="worthHead"><h3>Đáng xem</h3><a class="more" href="#">Xem cả ›</a></div>${worthRows(WORTH)}</div>
      </aside>
    </div>
  </section>
</div>`;

const OPT_E3 = `
<div class="pg">
  <section class="sec">
    <div class="two">
      <div class="pane">${RESUME_SEC}<div class="rlist">${RESUME.map(resumeRow).join('')}</div>
        <div class="blk"><div class="worthHead"><h3>Chưa biết đọc gì?</h3><a class="more" href="#">Thư viện ›</a></div>${starterBlock()}</div></div>
      <div class="pane">${secHead('Bảng xếp hạng', 'tuần này', 'Toàn bảng')}${chart(RANK)}
        <div class="worthHead" style="margin-top:18px"><h3>Đáng xem</h3></div>${worthCards(WORTH)}
      </div>
    </div>
  </section>
  <section class="sec">${NEW}<div class="grid6">${recent.map((b) => poster(b, { pill: b.n + ' chương', pillCls: stCls(b) })).join('')}</div></section>
  <section class="sec">${secHead('Lịch ra chương', '7 bộ · tuần này', 'Cả lịch')}${weekStrip()}</section>
  <section class="sec">${secHead('Thư viện', BOOKS.length + ' bộ chọn lọc')}${library('E3')}</section>
</div>`;

const NOTE_E1 = 'Hàng bìa là chính, mỗi mục một hàng đúng nhịp glvietsubz: dễ quét, không khung, không hộp lồng hộp. Bìa 176px bằng cỡ bìa thư viện.';
const NOTE_E2 = 'Thư viện là nhân vật chính; cột phụ dính bên phải giữ “Đọc tiếp · Lịch tuần · Đáng xem” luôn thấy khi cuộn lưới. Hợp với người đọc vào để đọc tiếp.';
const NOTE_E3 = 'Bản đang chạy nhưng bỏ khung hộp: hai cột trên, hàng bìa choáng ngang ở giữa, rồi lịch và thư viện. Ít thay đổi cấu trúc nhất.';

function frame(id, title, note, body) {
  return `
<section class="opt" id="${id}">
  <div class="optHead"><span class="k">Phương án ${id.slice(1)}</span><h2>${title}</h2><p>${note}</p></div>
  <div class="mkframe"><div class="frame">
    <div class="hdr">
      <span class="logo">ssochuz<i>.</i></span>
      <nav><a>Trang chủ</a><a>Thư viện</a><a>My Space</a><a>Vòng quay</a></nav>
      <span class="tail"><span class="k">${ICON.search} Tìm</span><span>67 bộ</span></span>
    </div>
    <div class="heroStub"><span><b>Hero banner</b> — giữ nguyên (đã chốt ở vòng 19)</span><span>↓ phần dưới đây là thứ cần chọn</span></div>
    ${body}
  </div></div>
</section>`;
}

const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · mockup nửa dưới trang chủ (E1 · E2 · E3)</title>
<link rel="stylesheet" href="mock.css">
</head>
<body data-w="desktop">

<div class="mkbar">
  <b>ssochuz · nửa dưới trang chủ</b>
  <span class="hint">ba phương án · dữ liệu thật 67 bộ · bìa thật</span>
  <div class="wsw">
    <button data-w="desktop" class="on">Desktop</button>
    <button data-w="tablet">Tablet</button>
    <button data-w="mobile">Mobile</button>
  </div>
</div>

${frame('o1', 'Kệ bìa', NOTE_E1, OPT_E1)}
${frame('o2', 'Tạp chí', NOTE_E2, OPT_E2)}
${frame('o3', 'Bảng', NOTE_E3, OPT_E3)}

<div class="cmpWrap">
  <h2>So sánh nhanh</h2>
  <p>Ba phương án dùng cùng một bộ thành phần (đầu mục · bìa · bảng đánh số · lịch · thanh lọc D1), khác nhau ở <b>thứ tự và chỗ đặt khối</b>.</p>
  <div class="cmpScroll"><table class="cmp">
    <thead><tr><th>Tiêu chí</th><th>E1 · Kệ bìa</th><th>E2 · Tạp chí</th><th>E3 · Bảng</th></tr></thead>
    <tbody>
      <tr><th>Thứ tự mắt đọc</th><td class="good">Đọc tiếp → Mới → Bảng → Lịch → Thư viện</td><td>Mới → Top tuần → Thư viện (+ cột phụ)</td><td>Đọc tiếp/Bảng → Mới → Lịch → Thư viện</td></tr>
      <tr><th>“Mới cập nhật”</th><td class="good">6 bìa 176px, cả hàng</td><td class="good">6 bìa 176px, cả hàng</td><td class="good">6 bìa 176px, cả hàng</td></tr>
      <tr><th>Đọc tiếp</th><td>3 thẻ ngang, trên cùng</td><td class="good">3 dòng trong cột phụ dính</td><td>3 dòng, cột trái</td></tr>
      <tr><th>Lưới thư viện</th><td class="good">6–7 cột, rộng nhất</td><td class="warn">4–5 cột (nhường chỗ cột phụ)</td><td class="good">6–7 cột</td></tr>
      <tr><th>Cá nhân hoá</th><td>Chỉ thấy khi ở đầu trang</td><td class="good">Luôn thấy khi cuộn</td><td>Chỉ thấy khi ở đầu trang</td></tr>
      <tr><th>Khác bản đang chạy</th><td class="warn">Nhiều (bỏ khung, đổi thứ tự)</td><td class="warn">Nhiều nhất (thêm cột phụ)</td><td class="good">Ít nhất</td></tr>
      <tr><th>Hợp với</th><td>Người mới, quét nhanh “có gì”</td><td>Người đọc quay lại hằng ngày</td><td>Bản nâng cấp an toàn của hiện tại</td></tr>
    </tbody>
  </table></div>
</div>

<script>
(function () {
  var body = document.body;
  var PAGE = 18;
  var SNAP = {};
  ['E1', 'E2', 'E3'].forEach(function (sc) {
    var g = document.querySelector('[data-grid="' + sc + '"]');
    if (g) SNAP[sc] = Array.prototype.slice.call(g.querySelectorAll('.poster'));
  });

  function match(p, f) {
    var ds = p.dataset;
    if (!f || f === 'all') return true;
    if (f === '18') return ds['18'] === '1';
    if (f === 'done') return ds.st === 'Hoàn thành';
    if (f === 'run') return ds.st === 'Đang cập nhật';
    if (f === 'soon') return ds.st === 'Sắp ra mắt';
    return true;
  }
  function paint(sc, f) {
    var shown = 0, total = 0;
    (SNAP[sc] || []).forEach(function (p) {
      var ok = match(p, f);
      if (ok) total++;
      var vis = ok && shown < PAGE;
      if (vis) shown++;
      p.style.display = vis ? 'block' : 'none';
    });
    var c = document.querySelector('[data-libcount="' + sc + '"]');
    if (c) c.textContent = (shown ? '1–' + shown : '0') + ' / ' + total;
  }

  document.addEventListener('click', function (e) {
    var w = e.target.closest('.mkbar .wsw button');
    if (w) {
      body.setAttribute('data-w', w.getAttribute('data-w'));
      document.querySelectorAll('.mkbar .wsw button').forEach(function (b) { b.classList.toggle('on', b === w); });
      return;
    }
    var seg = e.target.closest('.seg button');
    if (seg) {
      seg.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === seg); });
      return;
    }
    var chip = e.target.closest('.chip[data-f]');
    if (chip) {
      var sc = chip.getAttribute('data-scope');
      chip.parentNode.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c === chip); });
      paint(sc, chip.getAttribute('data-f'));
    }
  });

  Object.keys(SNAP).forEach(function (sc) { paint(sc, 'all'); });
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi index.html ·', Math.round(HTML.length / 1024), 'kB ·', BOOKS.length, 'bộ ·',
  'bìa thiếu:', BOOKS.filter((b) => !b.img).length, '· lịch:', SCHED_ITEMS.length, 'mục');
