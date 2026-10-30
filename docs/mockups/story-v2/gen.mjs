#!/usr/bin/env node
/* ============================================================================
   gen.mjs · TRANG THÔNG TIN TRUYỆN — vòng 2
   ----------------------------------------------------------------------------
   Phần đầu: phương án C (nền bìa mờ) đã chọn, chỉnh lại cho gọn & sắc hơn.
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
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg>'
};

const statusCls = (st) => (/hoàn thành/i.test(st) ? 'done' : /sắp|chưa/i.test(st) ? 'soon' : 'run');

/* ------------------------------- khối dùng lại ---------------------------- */
const crumb = `<nav class="crumb"><a href="#">Trang chủ</a><i>/</i><a href="#">Thư viện</a><i>/</i><b>${esc(S.t)}</b></nav>`;

const statusPill = `<span class="pill ${statusCls(S.st)}"><i></i>${esc(S.st)}</span>`;

/* phần đầu · C+ : nền bìa mờ, gọn hơn bản C đầu tiên */
const hero =
`<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    <a class="cvC" href="#">${S.img ? `<img src="${esc(S.img)}" alt="Bìa ${esc(S.t)}" loading="lazy">` : ''}</a>
    <div class="txtC">
      <div class="kickC">Cập nhật ${dmy(S.u)}</div>
      <h1>${esc(S.t)}</h1>
      <div class="byC"><b>${esc(S.a)}</b>${S.c ? ` · ${esc(S.c)}` : ''}${S.y ? ` · ${S.y}` : ''}</div>
      <div class="chipC">
        ${statusPill}
        <span class="ch2">${ICON.book}${S.n} chương</span>
        <span class="ch2">${ICON.star}<b>${STATS.rating}</b>/${STATS.ratings}</span>
        <span class="ch2">${ICON.eye}${vn(STATS.views)}</span>
      </div>
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
    </div>
  </div>
</section>`;

const tabs = `<div class="tabs2">
  <button class="on">Danh sách chương <b>${CH}</b></button>
  <button>Thông tin</button>
  <button>Bình luận <b>38</b></button>
  <span class="tabEnd">Chương ${PROG.read} / ${CH} · ${PROG.pct}%</span>
</div>`;

const toolbar = (pager) => `<div class="tbar">
  <label class="srch">${ICON.search}<input type="search" placeholder="Tìm số chương hoặc tên chương…" aria-label="Tìm chương"><kbd>/</kbd></label>
  <span class="sort"><b>Cũ nhất</b><i></i><span>Mới nhất</span></span>
  <span class="jump">Đi tới <input type="number" placeholder="số" aria-label="Số chương"><button type="button">Đi</button></span>
  ${pager || `<span class="cnt">${CH} chương</span>`}
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

const cpChip = (label, n) => `<a href="#" class="cpChip">${esc(label)}<b>${n} bộ</b></a>`;

const coupleBlock = (headingCls) => `<div class="${headingCls}">Cùng couple</div>
  <div class="chipRow">${cpChip(S.c || '—', REL_COUPLE.length + 1)}</div>
  ${REL_COUPLE.length ? `<div class="mList">${REL_COUPLE.map(miniRow).join('')}</div>` : ''}`;

const miniRow = (b) => `<a class="mRow" href="#"><span class="mcv"><img src="${esc(coverOf(b))}" alt="" loading="lazy"></span>
  <span class="mtx"><b>${esc(b.title)}</b><span>${esc(b.status || '')} · ${b.chapters || 0} chương</span></span></a>`;

const relCard = (b) => `<a class="rCard" href="#"><span class="rcv"><img src="${esc(coverOf(b))}" alt="" loading="lazy"></span>
  <b>${esc(b.title)}</b><span>${esc(b.status || '')} · ${b.chapters || 0} chương</span></a>`;

const cmt = (h = '38 bình luận') => `<div class="cmtH"><h3>Bình luận</h3><span>${h}</span>
  <a class="cmtMore" href="#">Mở trang bình luận ${ICON.chev}</a></div>
  <div class="cmtBox">Khung giscus giữ nguyên — chỉ canh lại lề cho thẳng với phần trên.</div>`;

const infoPairs = [
  ['Tên khác', esc(S.t)],
  ['Tác giả', esc(S.a)],
  ['Couple', esc(S.c || '—')],
  ['Năm', esc(S.y)],
  ['Tình trạng', esc(S.st)],
  ['Số chương', S.n],
  ['Cập nhật', dmy(S.u)],
  ['Giới hạn', S.e ? '18+' : 'Mọi lứa tuổi']
];

/* ============================ 1 · DẢI THÔNG TIN ============================ */
const money1 = `<section class="low1">
  ${tabs}
  ${toolbar()}
  ${grid4()}
  ${pager(2, 1, `1–${PAGE} / ${CH}`)}
  <div class="facts">
    ${[['Tác giả', esc(S.a)], ['Couple', esc(S.c || '—')], ['Năm', esc(S.y)], ['Tình trạng', esc(S.st)], ['Cập nhật', dmy(S.u)], ['Giới hạn', S.e ? '18+' : 'Mọi lứa tuổi']]
    .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}
  </div>
  ${react('rxWide')}
  <div class="rel2">
    <div>
      <div class="shd"><h3>Cùng tác giả</h3><span>${REL_AUTHOR.length} bộ</span><a href="#">Xem tất cả ›</a></div>
      <div class="rel4">${REL_AUTHOR.slice(0, 4).map(relCard).join('')}</div>
    </div>
    <div>
      <div class="shd"><h3>Cùng couple</h3><span>${REL_COUPLE.length} bộ khác</span></div>
      <div class="chipRow" style="margin-bottom:4px">${cpChip(S.c || '—', REL_COUPLE.length + 1)}</div>
      ${REL_COUPLE.length ? `<div class="mList">${REL_COUPLE.map(miniRow).join('')}</div>` : ''}
    </div>
  </div>
  ${cmt()}
</section>`;

/* ========================== 2 · MỤC LỤC + LỀ PHẢI ========================= */
const money2 = `<section class="low2">
  <div class="l2main">
    ${tabs}
    ${toolbar()}
    ${grid3()}
    ${pager(2, 1, `1–${PAGE} / ${CH}`)}
    <div class="shd"><h3>Thông tin truyện</h3><span>nhãn xám — giá trị trắng</span></div>
    <div class="infoT">${infoPairs.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    ${cmt()}
  </div>
  <aside class="l2side">
    ${react('rxStack')}
    <div class="sBox">${coupleBlock('sH')}</div>
    <div class="sBox">
      <div class="sH">Cùng tác giả</div>
      <div class="mList">${REL_AUTHOR.slice(0, 4).map(miniRow).join('')}</div>
    </div>
    <div class="sActs">
      <a class="btnGho wide" href="#">${ICON.share}Chia sẻ bộ này</a>
      <a class="btnGho wide" href="#">${ICON.rss}Theo dõi RSS</a>
    </div>
  </aside>
</section>`;

/* ============================ 3 · BẢNG CHƯƠNG ============================== */
const money3 = `<section class="low3">
  ${tabs}
  ${toolbar(pagerIn(2, 1, `1–${PAGE} / ${CH}`))}
  ${table2()}
  <div class="two3">
    <div>
      <div class="shd"><h3>Thông tin truyện</h3><span>${S.e ? '18+' : 'Mọi lứa tuổi'}</span></div>
      <div class="infoT infoT2">${infoPairs.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    </div>
    <div>
      <div class="shd"><h3>Cùng tác giả</h3><span>${REL_AUTHOR.length} bộ</span></div>
      <div class="mList">${REL_AUTHOR.slice(0, 4).map(miniRow).join('')}</div>
      <div class="sb3">${coupleBlock('sH sH2')}</div>
    </div>
  </div>
  ${react('rxWide')}
  ${cmt()}
</section>`;

/* ----------------------------------- CSS ---------------------------------- */
const CSS = `
  body { background: #0d0b09; }
  .wrap { max-width: 1216px; margin: 0 auto; padding: 20px 18px 80px; }
  h1 { margin: 0; }
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 6px; max-width: 96ch; }
  .note { color: var(--mut); font-size: 11.5px; margin: 10px 0 0; max-width: 100ch; }
  .hd h2 { font-size: 23px; margin: 0 0 8px; }
  .opt { border-top: 1px solid var(--bd); margin-top: 34px; padding-top: 20px; }
  .otag { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 6px;
    font: 800 10px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--acc); }
  .otag i { font-style: normal; padding: 3px 7px; border-radius: 5px; background: var(--acc-soft); letter-spacing: .06em; }
  .onote { color: var(--dim); font-size: 12px; margin: 0 0 16px; max-width: 108ch; line-height: 1.65; }
  .onote b { color: var(--mut); font-weight: 650; }
  .frame { container-type: inline-size; border: 1px solid var(--bd); border-radius: 12px;
    padding: 20px 22px 24px; background: var(--bg); }

  /* ------------------------------- dùng chung ------------------------------ */
  .crumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dim); margin-bottom: 14px; }
  .crumb a { color: var(--mut); } .crumb a:hover { color: var(--acc); }
  .crumb i { font-style: normal; opacity: .5; } .crumb b { color: var(--txt); font-weight: 600; }
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px;
    border-radius: 99px; border: 1px solid rgba(255, 255, 255, .2); background: rgba(12, 9, 6, .55);
    font: 700 10.5px/1 var(--font); white-space: nowrap; }
  .pill i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .pill.run { color: #f3dfb8; } .pill.run i { background: var(--warn); }
  .pill.done { color: #c8ead6; } .pill.done i { background: var(--ok); }
  .pill.soon { color: #d6d2ea; } .pill.soon i { background: #8f83c7; }
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
  .wide { justify-content: center; width: 100%; }
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
  .inC { display: grid; grid-template-columns: 176px minmax(0, 1fr); gap: 26px; align-items: center; }
  .cvC { display: block; border-radius: 9px; overflow: hidden;
    box-shadow: 0 22px 40px -18px #000, 0 0 0 1px rgba(255, 255, 255, .18); }
  .cvC img { display: block; width: 100%; aspect-ratio: 2/3; object-fit: cover; }
  .kickC { font: 800 9px/1 var(--font-mono); letter-spacing: .16em; text-transform: uppercase; color: var(--acc); }
  .txtC h1 { margin-top: 9px; font-family: var(--font-head); font-size: 30px; font-weight: 700;
    line-height: 1.15; letter-spacing: -.022em; color: #fff; text-shadow: 0 2px 20px rgba(0, 0, 0, .5);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .byC { margin-top: 8px; font-size: 12.5px; color: rgba(255, 255, 255, .66); }
  .byC b { color: rgba(255, 255, 255, .9); font-weight: 600; }
  .chipC { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
  .ch2 { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px;
    border-radius: 6px; background: rgba(12, 9, 6, .38); border: 1px solid rgba(255, 255, 255, .13);
    font: 600 10.5px/1 var(--font-mono); color: rgba(255, 255, 255, .8); }
  .ch2 b { color: var(--warn); font-weight: 700; }
  .ch2 svg { width: 11px; height: 11px; opacity: .82; }
  .synC { margin-top: 12px; max-width: 76ch; }
  .synMore { display: inline-flex; align-items: center; gap: 3px; margin-top: 4px; padding: 0;
    border: 0; background: none; font: 650 11.5px/1 var(--font); color: var(--acc); cursor: pointer; }
  .synMore svg { width: 9px; height: 9px; }
  .synC p { margin: 0; font-size: 13px; line-height: 1.68; color: rgba(255, 255, 255, .74);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .actC { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; }
  .icRow { display: inline-flex; gap: 8px; margin-left: 2px; }

  /* ------------------------- tab · thanh công cụ · chương ------------------ */
  .tabs2 { display: flex; align-items: center; gap: 24px; margin: 22px 0 0;
    border-bottom: 1px solid var(--bd); }
  .tabs2 button { position: relative; height: 38px; padding: 0; border: 0; background: none;
    font: 600 13px/1 var(--font); color: var(--mut); cursor: pointer; }
  .tabs2 button b { margin-left: 5px; font: 700 10px/1 var(--font-mono); color: var(--dim); }
  .tabs2 button.on { color: var(--txt); }
  .tabs2 button.on b { color: var(--acc); }
  .tabs2 button.on::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px;
    height: 2px; border-radius: 2px; background: var(--acc); }
  .tabEnd { margin-left: auto; font: 500 10.5px/1 var(--font-mono); color: var(--dim); }

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
  .cnt { margin-left: auto; font: 500 10.5px/1 var(--font-mono); color: var(--dim); letter-spacing: .04em; }

  .cg4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 30px; margin-top: 4px; }
  .ch4 { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: baseline; gap: 9px;
    min-width: 0; padding: 9px 0;
    border-bottom: 1px solid var(--bd-soft); font-size: 12.5px; color: var(--mut); }
  .ch4 em { font: 500 10px/1 var(--font-mono); color: var(--dim); font-style: normal; }
  .ch4 span, .ch3 span, .ctr span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ch4:hover { color: var(--acc); }
  .ch4:hover em { color: var(--acc); }
  .ch4.cur { color: var(--acc); font-weight: 650; }
  .ch4.cur em { color: var(--acc); }

  .cg3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 26px; }
  .ch3 { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: baseline;
    gap: 9px; padding: 9px 0; border-bottom: 1px solid var(--bd-soft); font-size: 12.5px; color: var(--mut); }
  .ch3 em { font: 500 10px/1 var(--font-mono); color: var(--dim); font-style: normal; }
  .ch3 i { font-style: normal; font: 500 9.5px/1 var(--font-mono); color: var(--dim); }
  .ch3:hover { color: var(--acc); } .ch3:hover i { color: var(--acc); }
  .ch3.cur { color: var(--acc); font-weight: 650; } .ch3.cur i, .ch3.cur em { color: var(--acc); }

  .ctab { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 34px; }
  .ccol { display: flex; flex-direction: column; }
  .cth { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: baseline; gap: 10px;
    padding: 9px 0 8px; border-bottom: 1px solid var(--bd); }
  .cth span { font: 700 9px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase;
    color: var(--dim); }
  .cth span + span { grid-column: 2; }
  .ctr { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: baseline; gap: 10px;
    padding: 9px 0; border-bottom: 1px solid var(--bd-soft); font-size: 12.5px; color: var(--mut); }
  .ctr em { font: 500 10px/1 var(--font-mono); color: var(--dim); font-style: normal; }
  .ctr i { font-style: normal; font: 500 9.5px/1 var(--font-mono); color: var(--dim); }
  .ctr:hover { color: var(--acc); } .ctr:hover i { color: var(--acc); }
  .ctr.cur { color: var(--acc); font-weight: 650; } .ctr.cur i, .ctr.cur em { color: var(--acc); }

  .pgr { display: flex; align-items: center; gap: 12px; padding: 12px 0 0; }
  .pgIn { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .pgrR { font: 500 10.5px/1 var(--font-mono); color: var(--dim); }
  .pgrB { display: inline-flex; align-items: center; gap: 2px; margin-left: auto; }
  .pgrB button { min-width: 26px; height: 26px; padding: 0 6px; border: 0; border-radius: 6px;
    background: none; color: var(--dim); font: 600 11.5px/1 var(--font-mono); cursor: pointer; }
  .pgrB button:hover { color: var(--txt); background: var(--surf2); }
  .pgrB button.on { color: var(--txt); background: var(--surf2); }

  /* ------------------------------ dải thông tin --------------------------- */
  .facts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0 26px;
    margin-top: 22px; padding: 14px 0; border-top: 1px solid var(--bd); border-bottom: 1px solid var(--bd); }
  .facts div { min-width: 0; }
  .facts span { display: block; font: 700 9px/1 var(--font-mono); letter-spacing: .13em;
    text-transform: uppercase; color: var(--dim); }
  .facts b { display: block; margin-top: 6px; font-size: 12.5px; font-weight: 600; color: var(--txt);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
  .rxWide { margin-top: 20px; }
  .rxStack { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .rxStack .rxH { grid-column: 1 / -1; margin: 0 0 2px; }
  .rxStack .stk { height: 30px; justify-content: center; border-radius: 8px; }

  /* --------------------------- mục con · truyện liên quan ----------------- */
  .shd { display: flex; align-items: baseline; gap: 10px; margin: 26px 0 12px;
    padding-bottom: 8px; border-bottom: 1px solid var(--bd); }
  .shd h3 { margin: 0; font-family: var(--font-head); font-size: 16px; font-weight: 650; }
  .shd span { font-size: 11.5px; color: var(--dim); }
  .shd a { margin-left: auto; font-size: 11.5px; font-weight: 650; color: var(--mut); }
  .shd a:hover { color: var(--acc); }
  .sH { font: 700 9.5px/1 var(--font-mono); letter-spacing: .13em; text-transform: uppercase;
    color: var(--dim); margin-bottom: 10px; }
  .sH2 { margin-top: 18px; }
  .rel2 { display: grid; grid-template-columns: minmax(0, 1fr) 268px; gap: 34px; align-items: start; }
  .rel4 { display: grid; grid-template-columns: repeat(auto-fill, minmax(146px, 1fr)); gap: 0 16px; }
  .rCard { min-width: 0; }
  .rCard .rcv { display: block; aspect-ratio: 2/3; border-radius: 6px; overflow: hidden; background: var(--surf2); }
  .rCard .rcv img { width: 100%; height: 100%; object-fit: cover; }
  .rCard b { display: -webkit-box; margin-top: 7px; font-size: 12px; font-weight: 650; line-height: 1.35;
    color: var(--txt); -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rCard > span:last-child { display: block; margin-top: 2px; font-size: 10px; color: var(--dim);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rCard:hover b { color: var(--acc); }
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
  .chipRow { display: flex; flex-wrap: wrap; gap: 6px; }
  .cpChip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px;
    border: 1px solid var(--bd); border-radius: 99px; font-size: 11.5px; color: var(--mut); }
  .cpChip b { font: 600 9.5px/1 var(--font-mono); color: var(--dim); }
  .cpChip:hover { border-color: var(--acc); color: var(--txt); }

  /* -------------------------------- bình luận ------------------------------ */
  .cmtH { display: flex; align-items: baseline; gap: 10px; margin: 26px 0 12px;
    padding-bottom: 10px; border-bottom: 1px solid var(--bd); }
  .cmtH h3 { margin: 0; font-family: var(--font-head); font-size: 16px; font-weight: 650; }
  .cmtH span { font-size: 11.5px; color: var(--dim); }
  .cmtMore { margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
    font-size: 11.5px; font-weight: 650; color: var(--mut); }
  .cmtMore:hover { color: var(--acc); }
  .cmtMore svg { width: 9px; height: 9px; }
  .cmtBox { border: 1px solid var(--bd); border-radius: 10px; padding: 16px; background: var(--surf);
    color: var(--dim); font-size: 12.5px; }

  /* ------------------------------ 2 · lề phải ----------------------------- */
  .low2 { display: grid; grid-template-columns: minmax(0, 1fr) 264px; gap: 38px; align-items: start; }
  .low2 .tabs2 { margin-top: 22px; }
  .l2side { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 14px; }
  .sBox { padding-top: 14px; border-top: 1px solid var(--bd); }
  .sActs { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px solid var(--bd); }
  .infoT { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 34px; }
  .infoT div { display: grid; grid-template-columns: 96px minmax(0, 1fr); align-items: baseline; gap: 10px;
    padding: 9px 0; border-bottom: 1px solid var(--bd-soft); font-size: 12.5px; min-width: 0; }
  .infoT span { color: var(--dim); }
  .infoT b { color: var(--txt); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ------------------------------ 3 · hai bên ----------------------------- */
  .two3 { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 40px; align-items: start; }

  /* ------------------------------- màn hẹp -------------------------------- */
  @container (max-width: 960px) {
    .inC { grid-template-columns: 148px minmax(0, 1fr); gap: 20px; }
    .txtC h1 { font-size: 26px; }
    .cg4 { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 22px; }
    .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 22px; }
    .low2 { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .l2side { position: static; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 26px; }
    .rxStack { grid-column: 1 / -1; grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .rxStack .rxH { grid-column: 1 / -1; }
    .rel2 { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .two3 { grid-template-columns: minmax(0, 1fr); gap: 0; }
  }
  @container (max-width: 660px) {
    .hC { padding: 18px; }
    .inC { grid-template-columns: 106px minmax(0, 1fr); gap: 14px; }
    .txtC h1 { font-size: 21px; }
    .kickC { display: none; }
    .synC { margin-top: 8px; }
    .synC p { font-size: 12px; }
    .cg4, .cg3 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
    .ctab { grid-template-columns: minmax(0, 1fr); }
    .cth { display: none; }
    .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rel4 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .l2side { grid-template-columns: minmax(0, 1fr); }
    .tabEnd { display: none; }
    .tabs2 { gap: 16px; overflow-x: auto; }
    .jump { display: none; }
  }
`;

const opt = (id, tag, title, note, html) =>
  `<section class="opt">
    <span class="otag"><i>${id}</i>${title}${tag ? ' · ' + tag : ''}</span>
    <p class="onote">${note}</p>
    <div class="frame">${crumb}${hero}${html}</div>
  </section>`;

const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · trang thông tin truyện · phương án phần dưới</title>
<link rel="stylesheet" href="../home-v2/mock2.css?v=story2">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · trang thông tin truyện</span>
  <span>3 cách bày phần dưới · dữ liệu và bìa thật</span>
  <a href="../story-v1/index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← vòng 1 (A/B/C)</a>
  <a href="../home-v2/index.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">trang chủ</a>
</div>

<div class="wrap">
  <div class="hd">
    <h2>Trang thông tin truyện — phần dưới, ba cách</h2>
    <p class="lead">Phần đầu giữ <b>phương án C</b> (nền bìa mờ) bạn đã chọn, siết lại cho gọn: tiêu đề 30px,
      giới thiệu 2 dòng, chip số liệu nhỏ hơn, hai nút chia sẻ / RSS thành nút biểu tượng.
      Ba khung dưới đây khác nhau ở <b>cách bày phần dưới</b> — chương, thông tin, cảm xúc, truyện liên quan.</p>
    <p class="note">Truyện mẫu: <b>${esc(S.t)}</b> · ${S.n} chương · ${esc(S.st)}. Cả ba đều giữ đủ: danh sách chương
      (tìm · sắp xếp · đi tới · phân trang), thông tin, 4 cảm xúc, cùng couple, cùng tác giả, bình luận.
      Bạn chọn mã, ví dụ <b>2</b>.</p>
  </div>

  ${opt('1', 'dải thông tin', 'Một cột · thông tin thành dải',
    'Bỏ hẳn mục “Thông tin truyện” dạng bảng: sáu dữ kiện (tác giả · couple · năm · tình trạng · cập nhật · giới hạn) ' +
    'gộp thành <b>một dải giữa hai đường kẻ</b>, nhãn in hoa nhỏ phía trên giá trị. Chương chia bốn cột, số thứ tự mono ' +
    'đứng trước. Bên dưới: hàng cảm xúc, rồi <b>cùng tác giả (4 bìa) và cùng couple (danh sách 30px) đứng cạnh nhau</b>, ' +
    'cuối cùng là bình luận full chiều ngang. <b>Gọn nhất, ít khối nhất.</b>',
    money1)}

  ${opt('2', 'mục lục + lề phải', 'Hai cột · lề phải dính',
    'Chương ba cột ở cột trái, lề phải 264px <b>dính khi cuộn</b> chứa: cảm xúc xếp dọc (bấm là thấy số ngay), ' +
    'cùng couple dạng chip, cùng tác giả 4 dòng bìa 30px, hai nút chia sẻ / RSS. Bảng thông tin vẫn giữ nhưng ' +
    'nằm dưới danh sách chương, hai cột. <b>Tiện nhất khi vừa đọc vừa bấm, giống trang tài liệu.</b>',
    money2)}

  ${opt('3', 'bảng chương', 'Hai cột · chỉ mục dạng bảng',
    'Danh sách chương thành <b>bảng có đầu cột</b> (CHƯƠNG · NGÀY ĐĂNG), hai cột, dòng 30px — quét mắt nhanh nhất, ' +
    'phân trang nằm luôn trên thanh công cụ cho khỏi tốn một dòng. Dưới bảng: thông tin bên trái, cùng tác giả + ' +
    'cùng couple bên phải. <b>Đậm chất “mục lục sách”, nhiều chương cỡ 200–500 vẫn gọn.</b>',
    money3)}

</div>
</body>
</html>
`;

fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi story-v2/index.html ·', Math.round(HTML.length / 1024), 'kB ·',
  'truyện', S.t, '· chương', CH, '· cùng tác giả', REL_AUTHOR.length,
  '· cùng couple', REL_COUPLE.length, '· bìa thiếu',
  [SRC].concat(REL_AUTHOR, REL_COUPLE).filter((b) => !coverOf(b)).length);
