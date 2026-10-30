#!/usr/bin/env node
/* ============================================================================
   gen.mjs · TRANG THÔNG TIN TRUYỆN — vòng 2
   ----------------------------------------------------------------------------
   Vòng 4: giữ nguyên phần đầu C và ba tab của vòng 3, chỉ LÀM GỌN TAB THÔNG TIN
   (dữ kiện 2 cột bên trái · bốn ô số liệu bên phải ngăn bằng một đường kẻ dọc).
   Phần dưới: ba cách bày KHÁC NHAU (thay cho khối “dùng chung” cũ):

      1 · Dải thông tin  — một cột, thông tin thành dải 6 ô, chương 4 cột
      2 · Mục lục + lề   — chương 3 cột bên trái, lề phải 264px (cảm xúc ·
                            cùng couple · cùng tác giả · chia sẻ)
      3 · Bảng chương    — chỉ mục dạng bảng có đầu cột, thông tin & cùng
                            tác giả hai bên dưới

   Dữ liệu thật: data/registry.json + bìa thật (assets/covers).
   Chạy: node docs/mockups/story-v2/gen.mjs
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

function coverKey(s) {
  const bytes = Buffer.from(String(s == null ? '' : s), 'utf8');
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}
const coverOf = (b) => {
  for (const c of [b.thumb, b.slide]) {
    if (!c) continue;
    const k = coverKey(c);
    if (coverFiles.has(k)) return `../../../assets/covers/${k}.webp`;
  }
  return '';
};
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const vn = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const pad2 = (n) => String(n).padStart(2, '0');

/* --------------------------------- dữ liệu -------------------------------- */
const SRC = reg.lib.find((b) => b.slug === 'hometown-romance') || reg.lib[0];
const S = {
  t: SRC.title,
  a: SRC.author || '—',
  c: SRC.couple || '',
  y: SRC.year || '',
  st: SRC.status || 'Đang cập nhật',
  n: SRC.chapters || 0,
  u: SRC.updated || '',
  e: !!SRC.is18,
  img: coverOf(SRC),
  syn: String(SRC.syn || '').trim()
};
const PARAS = S.syn
  .split(/(?<=[.!?…])\s+/)
  .reduce((acc, s) => {
    if (!acc.length || acc[acc.length - 1].length > 170) acc.push(s);
    else acc[acc.length - 1] += ' ' + s;
    return acc;
  }, [])
  .slice(0, 3);
if (!PARAS.length) PARAS.push('Chưa có giới thiệu cho bộ truyện này.');

const REL_AUTHOR = reg.lib.filter((b) => b.author === SRC.author && b.slug !== SRC.slug).slice(0, 4);
const REL_COUPLE = S.c
  ? reg.lib.filter((b) => b.couple === SRC.couple && b.slug !== SRC.slug).slice(0, 3)
  : [];
/* bộ đã nằm ở cột “cùng couple” thì không lặp lại ở cột “cùng tác giả” */
const REL_AUTHOR_VIEW = REL_AUTHOR.filter((b) => !REL_COUPLE.includes(b));
const CH = S.n;
/* tên chương thật: data/book/<slug>.json · chapters[].t = "Chương 12: Tên chương" */
let CHT = [];
try {
  const bk = JSON.parse(fs.readFileSync(path.join(ROOT, `data/book/${SRC.slug}.json`), 'utf8'));
  CHT = (bk.chapters || []).map((c) => String(c.t || '').replace(/^\s*chương\s*\d+\s*[:.\-–]\s*/i, '').trim());
} catch (e) { CHT = []; }
const chapName = (k) => CHT[k - 1] || `Chương ${k}`;
const PAGE = 20; /* số chương mỗi trang ở mockup (trang thật: 100) */
const STATS = { views: 12480, votes: 386, rating: 4.7, ratings: 52, follows: 214 };
const PROG = { read: 13, pct: 65 };

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.3v13.4a1 1 0 0 0 1.53.85l10.3-6.7a1 1 0 0 0 0-1.7L9.53 4.45A1 1 0 0 0 8 5.3z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.4C9.9 5 7 4.5 4.6 4.5v15c2.4 0 5.3.5 7.4 1.9 2.1-1.4 5-1.9 7.4-1.9v-15c-2.4 0-5.3.5-7.4 1.9z"/><path d="M12 6.4v15"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10.5 19a1.8 1.8 0 0 0 3 0"/></svg>',
  shelf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16l-7-4.5L5 20z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4"/></svg>',
  rss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 19h.01"/><path d="M5 12.5A6.5 6.5 0 0 1 11.5 19"/><path d="M5 6a13 13 0 0 1 13 13"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg>'
};

const statusCls = (st) => (/hoàn thành/i.test(st) ? 'done' : /sắp|chưa/i.test(st) ? 'soon' : 'run');

/* ------------------------------- khối dùng lại ---------------------------- */
const crumb = `<nav class="crumb"><a href="#">Trang chủ</a><i>/</i><a href="#">Thư viện</a><i>/</i><b>${esc(S.t)}</b></nav>`;

/* trạng thái: chữ mono in hoa + chấm màu — không đóng hộp */
const statusLine = `<div class="stC ${statusCls(S.st)}"><i></i>${esc(S.st)}${S.e ? '<em>18+</em>' : ''}</div>`;

/* phần đầu · C+ : nền bìa mờ, gọn hơn bản C đầu tiên */
const hero =
`<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    <a class="cvC" href="#">${S.img ? `<img src="${esc(S.img)}" alt="Bìa ${esc(S.t)}" loading="lazy">` : ''}</a>
    <div class="txtC">
      ${statusLine}
      <h1>${esc(S.t)}</h1>
      <div class="byC"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${S.y}` : ''}</div>
      <div class="synC"><p>${esc(PARAS[0])}</p>
        <button class="synMore" type="button">Đọc giới thiệu đầy đủ ${ICON.chev}</button></div>
      <div class="actC">
        <a class="btnPri" href="#">${ICON.play}Đọc từ đầu</a>
        <a class="btnGho onDark" href="#">${ICON.book}Chương mới nhất</a>
        <a class="btnGho onDark" href="#">${ICON.bell}Theo dõi</a>
        <a class="btnGho onDark" href="#">${ICON.shelf}Tủ truyện</a>
        <span class="icRow">
          <a class="iconBtn" href="#" aria-label="Chia sẻ">${ICON.share}</a>
          <a class="iconBtn" href="#" aria-label="RSS">${ICON.rss}</a>
        </span>
      </div>
      <div class="hProg"><span>Đang đọc chương ${PROG.read} / ${CH} · còn ${CH - PROG.read} chương</span>
        <div class="pb"><i style="width:${PROG.pct}%"></i></div></div>
    </div>
  </div>
</section>`;

const tabs = `<div class="tabs2" role="tablist">
  <button type="button" class="on" data-p="chap" role="tab" aria-selected="true">Danh sách chương <b>${CH}</b></button>
  <button type="button" data-p="info" role="tab" aria-selected="false">Thông tin</button>
  <button type="button" data-p="cmt" role="tab" aria-selected="false">Bình luận <b>38</b></button>
</div>`;

const toolbar = (pager) => `<div class="tbar">
  <label class="srch">${ICON.search}<input type="search" placeholder="Tìm số chương hoặc tên chương…" aria-label="Tìm chương"><kbd>/</kbd></label>
  <span class="sort"><b>Cũ nhất</b><i></i><span>Mới nhất</span></span>
  <span class="jump">Đi tới <input type="number" placeholder="số" aria-label="Số chương"><button type="button">Đi</button></span>

</div>`;

const chapters = Array.from({ length: CH }, (_, i) => i + 1);
const isCur = (k) => k === PROG.read;

/* chương: 4 cột, số thứ tự mono + tên chương thật */
const grid4 = (n = PAGE) => `<div class="cg4">${chapters.slice(0, n).map((k) =>
  `<a class="ch4${isCur(k) ? ' cur' : ''}" href="#" title="Chương ${k}: ${esc(chapName(k))}"><em>${pad2(k)}</em><span>${esc(chapName(k))}</span></a>`
).join('')}</div>`;

/* chương: 3 cột, đánh dấu chương đang đọc */
const grid3 = (n = PAGE) => `<div class="cg3">${chapters.slice(0, n).map((k) =>
  `<a class="ch3${isCur(k) ? ' cur' : ''}" href="#" title="Chương ${k}: ${esc(chapName(k))}"><em>${pad2(k)}</em><span>${esc(chapName(k))}</span>${isCur(k) ? '<i>đang đọc</i>' : ''}</a>`
).join('')}</div>`;

/* chương: bảng 2 cột có đầu cột */
const ctr = (k) => `<a class="ctr${isCur(k) ? ' cur' : ''}" href="#" title="Chương ${k}: ${esc(chapName(k))}"><em>${pad2(k)}</em><span>${esc(chapName(k))}</span>${isCur(k) ? '<i>đang đọc</i>' : ''}</a>`;
const ccol = (list) => `<div class="ccol">
  <div class="cth"><span>Số</span><span>Tên chương</span></div>
  ${list.map(ctr).join('')}
</div>`;
const table2 = (n = PAGE) => {
  const list = chapters.slice(0, n);
  const half = Math.ceil(list.length / 2);
  return `<div class="ctab">${ccol(list.slice(0, half))}${ccol(list.slice(half))}</div>`;
};

const pgBtn = (total = 1, cur = 1) => `<button type="button" aria-label="Trang trước">‹</button>${
  Array.from({ length: total }, (_, i) => `<button type="button" class="${i + 1 === cur ? 'on' : ''}">${i + 1}</button>`).join('')
}<button type="button" aria-label="Trang sau">›</button>`;
const pager = (total = 1, cur = 1, range = `1–${CH} / ${CH}`) => `<div class="pgr">
  <span class="pgrR">${range}</span>
  <span class="pgrB">${pgBtn(total, cur)}</span>
</div>`;
const pagerIn = (total = 1, cur = 1, range = `1–${CH} / ${CH}`) => `<span class="pgIn">
  <span class="pgrR">${range}</span>
  <span class="pgrB">${pgBtn(total, cur)}</span>
</span>`;

const react = (cls = '') => `<div class="rx ${cls}">
  <span class="rxH">Cảm xúc</span>
  <button type="button" class="stk" aria-label="Cảm xúc yêu thích, 128 lượt">😍 <b>128</b></button>
  <button type="button" class="stk" aria-label="Cảm xúc hay, 74 lượt">🔥 <b>74</b></button>
  <button type="button" class="stk" aria-label="Cảm xúc buồn, 42 lượt">😢 <b>42</b></button>
  <button type="button" class="stk" aria-label="Cảm xúc bất ngờ, 19 lượt">😮 <b>19</b></button>
  <button type="button" class="stk add" aria-label="Thêm cảm xúc">＋</button>
</div>`;

const miniRow = (b) => `<a class="mRow" href="#"><span class="mcv"><img src="${esc(coverOf(b))}" alt="" loading="lazy"></span>
  <span class="mtx"><b>${esc(b.title)}</b><span>${esc(b.status || '')} · ${b.chapters || 0} chương</span></span></a>`;

/* ================================ CÁC MỤC ================================= */
/* 1 · Danh sách chương — chỉ có thanh công cụ, danh sách và phân trang */
const paneChap = `<div class="pane on" data-p="chap" data-label="Danh sách chương">
  ${toolbar()}
  ${grid4()}
  ${pager(2, 1, `1–${PAGE} / ${CH}`)}
</div>`;

/* 2 · Thông tin — gọn: dữ kiện hai cột bên trái, số liệu bên phải */
const FACTS_MAIN = [
  ['Tác giả', esc(S.a)],
  ['Couple', esc(S.c || '—')],
  ['Năm', esc(S.y)],
  ['Số chương', String(S.n)],
  ['Cập nhật', dmy(S.u)],
  ['Giới hạn', S.e ? '18+' : 'Mọi lứa tuổi']
];

const paneInfo = `<div class="pane" data-p="info" data-label="Thông tin">
  <div class="infoWrap">
    <div class="infoFacts">
      ${FACTS_MAIN.map(([k, v]) => `<div class="iF"><span>${k}</span><b>${v}</b></div>`).join('')}
    </div>
    <div class="infoStats">
      <div class="iS"><span>Điểm ★</span><b>${STATS.rating}<em>/ ${STATS.ratings} đánh giá</em></b></div>
      <div class="iS"><span>Lượt đọc</span><b>${vn(STATS.views)}</b></div>
      <div class="iS"><span>Lượt thích</span><b>${vn(STATS.votes)}</b></div>
      <div class="iS"><span>Theo dõi</span><b>${STATS.follows}</b></div>
    </div>
  </div>
  ${react('rxInfo')}
</div>`;

/* 3 · Bình luận */
const paneCmt = `<div class="pane" data-p="cmt" data-label="Bình luận">
  <div class="cmtBox">Khung bình luận giscus giữ nguyên — chừa đúng một khối, canh lề thẳng với phần trên.</div>
</div>`;

/* ============================= TRUYỆN LIÊN QUAN =========================== */
const relCol = (title, sub, rows, extra = '') => `<div class="relCol">
  <div class="relH"><h3>${title}</h3><span>${sub}</span><a href="#">Xem tất cả ›</a></div>
  ${extra}${rows.length ? `<div class="mList">${rows.map(miniRow).join('')}</div>` : ''}
</div>`;

const relSec = `<section class="relSec">
  <div class="relCols">
    ${relCol('Cùng couple', `${esc(S.c || '—')} · ${REL_COUPLE.length + 1} bộ`, REL_COUPLE)}
    ${relCol('Cùng tác giả', `${esc(S.a)} · ${REL_AUTHOR_VIEW.length + 1} bộ`, REL_AUTHOR_VIEW)}
  </div>
</section>`;

/* ----------------------------------- CSS ---------------------------------- */
const CSS = `
  body { background: #0d0b09; }
  .wrap { max-width: 1216px; margin: 0 auto; padding: 18px 18px 80px; }
  h1 { margin: 0; }
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 6px; max-width: 96ch; }
  .note { color: var(--mut); font-size: 11.5px; margin: 8px 0 0; max-width: 104ch; }
  .hd h2 { font-size: 23px; margin: 0 0 8px; }
  .mkall { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--mut); }
  .mkall input { accent-color: var(--acc); }
  .frame { container-type: inline-size; border: 1px solid var(--bd); border-radius: 12px;
    padding: 20px 22px 22px; background: var(--bg); }

  /* ------------------------------- dùng chung ------------------------------ */
  .crumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dim); margin-bottom: 14px; }
  .crumb a { color: var(--mut); } .crumb a:hover { color: var(--acc); }
  .crumb i { font-style: normal; opacity: .5; } .crumb b { color: var(--txt); font-weight: 600; }
  .btnPri, .btnGho { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 15px;
    border-radius: 9px; font-size: 12.5px; font-weight: 650; white-space: nowrap;
    transition: background .16s ease, border-color .16s ease, color .16s ease, transform .16s ease; }
  .btnPri { background: var(--acc); color: #2a1016; box-shadow: 0 10px 22px -14px rgba(224, 133, 155, .9); }
  .btnPri:hover { transform: translateY(-1px); }
  .btnPri svg { width: 13px; height: 13px; }
  .btnGho { border: 1px solid var(--bd); color: var(--mut); background: none; }
  .btnGho:hover { border-color: var(--bd2); color: var(--txt); background: var(--surf2); }
  .btnGho svg { width: 14px; height: 14px; }
  .btnGho.onDark { border-color: rgba(255, 255, 255, .24); color: #fff; background: rgba(18, 12, 9, .3); }
  .btnGho.onDark:hover { background: rgba(18, 12, 9, .6); border-color: rgba(255, 255, 255, .4); }
  .iconBtn { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px;
    border: 1px solid rgba(255, 255, 255, .24); border-radius: 9px; color: #fff; background: rgba(18, 12, 9, .3); }
  .iconBtn svg { width: 15px; height: 15px; }
  .iconBtn:hover { background: rgba(18, 12, 9, .62); border-color: rgba(255, 255, 255, .42); }

  /* ------------------------------ phần đầu C+ ----------------------------- */
  .hC { position: relative; overflow: hidden; border-radius: 12px; isolation: isolate;
    padding: 24px 26px 22px; background: var(--surf2); }
  .bgC { position: absolute; inset: -10%; width: 120%; height: 120%; object-fit: cover;
    object-position: center 24%; filter: blur(24px) saturate(1.1) brightness(.46); z-index: -2; }
  .veilC { position: absolute; inset: 0; z-index: -1;
    background: linear-gradient(96deg, rgba(10, 7, 5, .94) 8%, rgba(10, 7, 5, .74) 50%, rgba(10, 7, 5, .3)); }
  .inC { display: grid; grid-template-columns: 178px minmax(0, 1fr); gap: 28px; align-items: start; }
  .cvC { position: relative; display: block; border-radius: 8px; overflow: hidden; background: var(--surf2);
    margin-top: 2px;
    box-shadow: 0 26px 44px -20px rgba(0, 0, 0, .92), 0 0 0 1px rgba(255, 243, 230, .16); }
  .cvC img { display: block; width: 100%; aspect-ratio: 2/3; object-fit: cover; object-position: center top; }
  .cvC::after { content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(90deg, rgba(0, 0, 0, .38) 0, rgba(0, 0, 0, .1) 7%,
      rgba(255, 255, 255, 0) 16%, rgba(255, 255, 255, 0) 93%, rgba(255, 255, 255, .16) 100%),
      linear-gradient(0deg, rgba(0, 0, 0, .22), rgba(0, 0, 0, 0) 18%); }

  /* trạng thái bằng chữ, không hộp */
  .stC { display: flex; align-items: center; gap: 7px; margin-bottom: 10px;
    font: 800 9.5px/1 var(--font-mono); letter-spacing: .17em; text-transform: uppercase; }
  .stC i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .stC em { margin-left: 6px; padding-left: 10px; font-style: normal; letter-spacing: .1em;
    color: rgba(255, 255, 255, .62); border-left: 1px solid rgba(255, 255, 255, .24); }
  .stC.run { color: #f0cd97; } .stC.done { color: #9fd8b8; } .stC.soon { color: #c3baea; }
  .txtC h1 { font-family: var(--font-head); font-size: 32px; font-weight: 700;
    line-height: 1.13; letter-spacing: -.024em; color: #fff; text-shadow: 0 2px 20px rgba(0, 0, 0, .5);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .byC { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 9px;
    font-size: 12.5px; color: rgba(255, 255, 255, .66); }
  .byC i { font-style: normal; opacity: .5; }
  .byC b { color: rgba(255, 255, 255, .9); font-weight: 600; }
  .synC { margin-top: 12px; max-width: 76ch; }
  .synC p { margin: 0; font-size: 13px; line-height: 1.68; color: rgba(255, 255, 255, .74);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .synMore { display: inline-flex; align-items: center; gap: 3px; margin-top: 4px; padding: 0;
    border: 0; background: none; font: 650 11.5px/1 var(--font); color: var(--acc); cursor: pointer; }
  .synMore svg { width: 9px; height: 9px; }
  .actC { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; }
  .icRow { display: inline-flex; gap: 8px; margin-left: auto; }

  /* ---------------------------------- tab --------------------------------- */
  .tabs2 { display: flex; align-items: center; gap: 24px; margin: 22px 0 0;
    border-bottom: 1px solid var(--bd); }
  .tabs2 button { position: relative; height: 38px; padding: 0; border: 0; background: none;
    font: 600 13px/1 var(--font); color: var(--mut); cursor: pointer; }
  .tabs2 button b { margin-left: 5px; font: 700 10px/1 var(--font-mono); color: var(--dim); }
  .tabs2 button.on { color: var(--txt); }
  .tabs2 button.on b { color: var(--acc); }
  .tabs2 button.on::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px;
    height: 2px; border-radius: 2px; background: var(--acc); }

  .pane { display: none; animation: pfade .18s ease; }
  .pane.on { display: block; }
  @keyframes pfade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  body.all .pane { display: block; }
  body.all .pane + .pane { margin-top: 24px; padding-top: 22px; border-top: 1px dashed var(--bd); }
  body.all .pane::before { content: attr(data-label); display: block; margin-bottom: 12px;
    font: 800 9px/1 var(--font-mono); letter-spacing: .16em; text-transform: uppercase; color: var(--acc); }

  /* -------------------------- thanh công cụ · chương ---------------------- */
  .tbar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    padding: 10px 0; border-bottom: 1px solid var(--bd); }
  .srch { flex: 1 1 260px; display: flex; align-items: center; gap: 9px; min-width: 180px;
    height: 30px; color: var(--dim); }
  .srch:focus-within { color: var(--acc); }
  .srch svg { width: 14px; height: 14px; flex: none; }
  .srch input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: none;
    color: var(--txt); font-size: 13px; }
  .srch kbd { font: 600 10px/1 var(--font-mono); color: var(--dim); border: 1px solid var(--bd);
    border-radius: 4px; padding: 2px 5px; }
  .sort { display: flex; align-items: center; gap: 10px; height: 30px; font-size: 12px; color: var(--dim); }
  .sort b { color: var(--txt); font-weight: 650; }
  .sort i { width: 1px; height: 12px; background: var(--bd); }
  .jump { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--dim); }
  .jump input { width: 46px; height: 28px; padding: 0 7px; border: 1px solid var(--bd); border-radius: 6px;
    background: none; color: var(--txt); font-size: 12px; text-align: center; }
  .jump button { height: 28px; padding: 0 9px; border: 1px solid var(--bd); border-radius: 6px;
    background: none; color: var(--mut); font: 600 11.5px/1 var(--font); cursor: pointer; }
  .jump button:hover { border-color: var(--bd2); color: var(--txt); }

  .cg4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 30px; margin-top: 4px; }
  .ch4 { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: baseline; gap: 9px;
    min-width: 0; padding: 9px 0; border-bottom: 1px solid var(--bd-soft);
    font-size: 12.5px; color: var(--mut); }
  .ch4 em { font: 500 10px/1 var(--font-mono); color: var(--dim); font-style: normal; }
  .ch4 span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ch4:hover { color: var(--acc); } .ch4:hover em { color: var(--acc); }
  .ch4.cur { color: var(--acc); font-weight: 650; }
  .ch4.cur em { color: var(--acc); }

  .pgr { display: flex; align-items: center; gap: 12px; padding: 12px 0 0; }
  .pgrR { font: 500 10.5px/1 var(--font-mono); color: var(--dim); }
  .pgrB { display: inline-flex; align-items: center; gap: 2px; margin-left: auto; }
  .pgrB button { min-width: 26px; height: 26px; padding: 0 6px; border: 0; border-radius: 6px;
    background: none; color: var(--dim); font: 600 11.5px/1 var(--font-mono); cursor: pointer; }
  .pgrB button:hover { color: var(--txt); background: var(--surf2); }
  .pgrB button.on { color: var(--txt); background: var(--surf2); }

  /* -------------------------------- thông tin ----------------------------- */
  .infoWrap { display: grid; grid-template-columns: minmax(0, 1fr) 316px;
    margin-top: 16px; align-items: start; }
  .infoFacts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 40px;
    align-content: start; padding-right: 34px; }
  .iF { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 10px; align-items: baseline;
    min-width: 0; padding: 9px 0; border-bottom: 1px solid var(--bd-soft); }
  .iF span { font: 700 9px/1.5 var(--font-mono); letter-spacing: .11em; text-transform: uppercase;
    color: var(--dim); }
  .iF b { min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--txt);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .infoStats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px;
    align-self: stretch; padding-left: 30px; border-left: 1px solid var(--bd); align-content: space-between; }
  .iS { min-width: 0; }
  .iS > span { display: block; font: 700 9px/1 var(--font-mono); letter-spacing: .13em;
    text-transform: uppercase; color: var(--dim); }
  .iS > b { display: flex; align-items: baseline; gap: 6px; margin-top: 7px;
    font-family: var(--font-head); font-size: 20px; font-weight: 700; line-height: 1;
    color: var(--txt); font-variant-numeric: tabular-nums; }
  .iS em { font: 500 10px/1 var(--font-mono); font-style: normal; color: var(--dim);
    letter-spacing: .02em; }
  .hProg { margin-top: 14px; max-width: 320px; }
  .hProg span { display: block; font: 500 10px/1 var(--font-mono); letter-spacing: .03em;
    color: rgba(255, 255, 255, .56); }
  .hProg .pb { height: 3px; margin-top: 6px; border-radius: 99px;
    background: rgba(255, 255, 255, .16); overflow: hidden; }
  .hProg .pb i { display: block; height: 100%; border-radius: 99px; background: var(--acc); }

  /* --------------------------------- cảm xúc ------------------------------ */
  .rx { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .rxH { font: 700 9px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase;
    color: var(--dim); margin-right: 2px; }
  .stk { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px;
    border: 1px solid var(--bd); border-radius: 99px; background: none;
    font: 600 11px/1 var(--font); color: var(--mut); cursor: pointer; }
  .stk b { font: 600 10px/1 var(--font-mono); color: var(--dim); }
  .stk:hover { border-color: var(--acc); color: var(--txt); }
  .stk:hover b { color: var(--acc); }
  .stk.add { padding: 0 11px; color: var(--dim); }
  .rxInfo { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--bd); }

  /* --------------------------- truyện liên quan --------------------------- */
  .relSec { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--bd); }
  .relCols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 44px; align-items: start; }
  .relH { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .relH h3 { margin: 0; font-family: var(--font-head); font-size: 15px; font-weight: 650; }
  .relH span { font-size: 11.5px; color: var(--dim); }
  .relH a { margin-left: auto; font-size: 11.5px; font-weight: 650; color: var(--mut); }
  .relH a:hover { color: var(--acc); }
  .mList { display: flex; flex-direction: column; }
  .mRow { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 10px; align-items: center;
    padding: 7px 0; border-bottom: 1px solid var(--bd-soft); }
  .mRow:last-child { border-bottom: 0; }
  .mcv { display: block; width: 30px; border-radius: 4px; overflow: hidden; background: var(--surf2); }
  .mcv img { display: block; width: 100%; aspect-ratio: 2/3; object-fit: cover; }
  .mtx { min-width: 0; }
  .mtx b { display: block; font-size: 12px; font-weight: 650; line-height: 1.3; color: var(--txt);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mtx span { display: block; margin-top: 1px; font-size: 10px; color: var(--dim); }
  .mRow:hover .mtx b { color: var(--acc); }

  /* -------------------------------- bình luận ------------------------------ */
  .cmtBox { margin-top: 18px; border: 1px solid var(--bd); border-radius: 10px; padding: 18px;
    background: var(--surf); color: var(--dim); font-size: 12.5px; }

  /* ------------------------------- màn hẹp -------------------------------- */
  @container (max-width: 960px) {
    .inC { grid-template-columns: 150px minmax(0, 1fr); gap: 22px; }
    .txtC h1 { font-size: 26px; }
    .cg4 { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 22px; }
    .infoWrap { grid-template-columns: minmax(0, 1fr); }
    .infoFacts { padding-right: 0; }
    .infoStats { margin-top: 16px; padding: 16px 0 0; border-left: 0; border-top: 1px solid var(--bd); }
    .relCols { gap: 0 30px; }
  }
  @container (max-width: 660px) {
    .hC { padding: 18px; }
    .inC { grid-template-columns: 104px minmax(0, 1fr); gap: 14px; }
    .txtC h1 { font-size: 21px; }
    .stC { font-size: 8.5px; margin-bottom: 7px; }
    .cvC::after { display: none; }
    .synC { margin-top: 8px; }
    .synC p { font-size: 12px; }
    .cg4 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
    .relCols { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .relCol + .relCol { margin-top: 20px; }
    .tabs2 { gap: 16px; overflow-x: auto; }
    .jump { display: none; }
    .iF { grid-template-columns: 84px minmax(0, 1fr); }
    .infoFacts { grid-template-columns: minmax(0, 1fr); }
  }
`;

const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · trang thông tin truyện · vòng 4</title>
<link rel="stylesheet" href="../home-v2/mock2.css?v=story4">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · trang thông tin truyện</span>
  <span>vòng 4 · đã bỏ phần thừa</span>
  <label class="mkall"><input type="checkbox" id="allToggle"> hiện cả ba mục</label>
  <a href="../story-v3/index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← vòng 3</a>
  <a href="../home-v2/index.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">trang chủ</a>
</div>

<div class="wrap">
  <div class="hd">
    <h2>Trang thông tin truyện</h2>
    <p class="lead">Phần đầu <b>C · nền bìa mờ</b>. Ba mục dưới là ba tab thật — <b>bấm tab để xem</b>,
      hoặc tích “hiện cả ba mục”. Dữ kiện của bộ truyện <b>chỉ nằm trong tab Thông tin</b>, không nhắc lại
      ở dưới danh sách chương.</p>
    <p class="note">Truyện mẫu: <b>${esc(S.t)}</b> · ${S.n} chương · ${esc(S.st)} · tên chương thật.
      <b>Thông tin</b> gọn lại: sáu dữ kiện chính hai cột bên trái, giới hạn + tên khác dồn thành
      một dòng phụ; bốn ô số liệu bên phải, ngăn bằng một đường kẻ dọc; cảm xúc một hàng dưới cùng.
      Truyện cùng couple / cùng tác giả nằm ngoài tab, dưới cùng, chia hai cột bằng một đường kẻ.</p>
  </div>

  <div class="frame" style="margin-top:14px">
    ${crumb}
    ${hero}
    ${tabs}
    ${paneChap}
    ${paneInfo}
    ${paneCmt}
    ${relSec}
  </div>
</div>

<script>
  var tabs = [].slice.call(document.querySelectorAll('.tabs2 [data-p]'));
  var panes = [].slice.call(document.querySelectorAll('.pane'));
  function show(p) {
    tabs.forEach(function (b) {
      var on = b.getAttribute('data-p') === p;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panes.forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-p') === p); });
  }
  tabs.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-p')); }); });
  var all = document.getElementById('allToggle');
  if (all) all.addEventListener('change', function () { document.body.classList.toggle('all', all.checked); });
</script>
</body>
</html>
`;

fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi story-v4/index.html ·', Math.round(HTML.length / 1024), 'kB ·',
  'truyện', S.t, '· chương', CH, '· cùng tác giả', REL_AUTHOR.length,
  '· cùng couple', REL_COUPLE.length, '· bìa thiếu',
  [SRC].concat(REL_AUTHOR, REL_COUPLE).filter((b) => !coverOf(b)).length);
