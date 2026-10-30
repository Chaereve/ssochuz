#!/usr/bin/env node
/* ============================================================================
   gen.mjs · TRANG THÔNG TIN TRUYỆN — vòng 2
   ----------------------------------------------------------------------------
   Vòng 8: bốn bản trước (dải/miếng dán ngang lên ảnh) đều bị chê. Bốn hướng khác:
      1 · hai khối dính mép (ăn góc bìa)
      2 · băng ôbi giấy    3 · nhãn dọc ngoài bìa    4 · chú thích dưới bìa
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
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg>'
};

const statusCls = (st) => (/hoàn thành/i.test(st) ? 'done' : /sắp|chưa/i.test(st) ? 'soon' : 'run');

/* ------------------------------- khối dùng lại ---------------------------- */
const crumb = `<nav class="crumb"><a href="#">Trang chủ</a><i>/</i><a href="#">Thư viện</a><i>/</i><b>${esc(S.t)}</b></nav>`;

const ACT = `<div class="actC">
  <a class="btnPri" href="#">${ICON.play}Đọc từ đầu</a>
  <a class="btnGho onDark" href="#">${ICON.book}Chương mới nhất</a>
  <a class="btnGho onDark" href="#">${ICON.bell}Theo dõi</a>
  <a class="btnGho onDark" href="#">${ICON.shelf}Tủ truyện</a>
</div>`;

const SYN = `<div class="synC"><p>${esc(PARAS[0])}</p>
  <button class="synMore" type="button">Đọc giới thiệu đầy đủ ${ICON.chev}</button></div>`;

const PROGRESS = `<div class="hProg"><span>Đang đọc chương ${PROG.read} / ${CH} · còn ${CH - PROG.read} chương</span>
  <div class="pb"><i style="width:${PROG.pct}%"></i></div><em>${PROG.pct}%</em></div>`;

const BOOKMARK = `<span class="nwBook" aria-hidden="true"><span>MỚI</span></span>`;
const IMG = `<img src="${esc(S.img)}" alt="Bìa ${esc(S.t)}" loading="lazy">`;

const TEXT = `<div class="txtC">
  <h1>${esc(S.t)}</h1>
  <div class="byC"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${esc(S.y)}` : ''}</div>
  ${SYN}${ACT}</div>`;

const BG = `${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}<span class="veilC"></span>`;

/* ============ 1 · KHỐI GÓC DÍNH MÉP — hai khối, không dải ngang ======== */
const hero1 = `<section class="hC">
  ${BG}
  <div class="inC">
    <a class="cvC" href="#">${IMG}${BOOKMARK}
      <b class="blkSt ${statusCls(S.st)}">${esc(S.st)}</b>
      ${S.e ? '<em class="blkAge">18+</em>' : ''}
    </a>
    ${TEXT}
  </div>
  ${PROGRESS}
</section>`;

/* =============== 2 · BĂNG ÔBI GIẤY — băng giấy màu giấy ================ */
const hero2 = `<section class="hC">
  ${BG}
  <div class="inC">
    <a class="cvC obi" href="#">${IMG}${BOOKMARK}
      <span class="obiBand"><b>${esc(S.st)}</b>${S.e ? '<em>18+</em>' : ''}</span>
    </a>
    ${TEXT}
  </div>
  ${PROGRESS}
</section>`;

/* ============ 3 · NHÃN DỌC NGOÀI BÌA — không chạm vào ảnh ============== */
const hero3 = `<section class="hC">
  ${BG}
  <div class="inC wide">
    <span class="sideLb">
      <b class="${statusCls(S.st)}">${esc(S.st)}</b>${S.e ? '<i>18+</i>' : ''}
    </span>
    <a class="cvC" href="#">${IMG}${BOOKMARK}</a>
    ${TEXT}
  </div>
  ${PROGRESS}
</section>`;

/* ============ 4 · CHÚ THÍCH DƯỚI BÌA — bìa sạch, có gạch son =========== */
const hero4 = `<section class="hC">
  ${BG}
  <div class="inC">
    <div class="cvWrap">
      <a class="cvC" href="#">${IMG}${BOOKMARK}</a>
      <div class="capRow"><b class="${statusCls(S.st)}">${esc(S.st)}</b>${S.e ? '<i>·</i><em>18+</em>' : ''}</div>
    </div>
    ${TEXT}
  </div>
  ${PROGRESS}
</section>`;

const tabs = `<div class="tabs2">
  <button class="on">Danh sách chương <b>${CH}</b></button>
  <button>Thông tin</button>
  <button>Bình luận <b>38</b></button>
</div>`;

/* ----------------------------------- CSS ---------------------------------- */
const CSS = `
  body { background: #0d0b09; }
  .wrap { max-width: 1216px; margin: 0 auto; padding: 18px 18px 80px; }
  h1 { margin: 0; }
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 6px; max-width: 96ch; }
  .note { color: var(--mut); font-size: 11.5px; margin: 8px 0 0; max-width: 104ch; }
  .hd h2 { font-size: 23px; margin: 0 0 8px; }
  .opt { border-top: 1px solid var(--bd); margin-top: 34px; padding-top: 20px; }
  .otag { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 6px;
    font: 800 10px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--acc); }
  .otag i { font-style: normal; padding: 3px 7px; border-radius: 5px; background: var(--acc-soft); letter-spacing: .06em; }
  .onote { color: var(--dim); font-size: 12px; margin: 0 0 16px; max-width: 108ch; line-height: 1.65; }
  .onote b { color: var(--mut); font-weight: 650; }
  .frame { container-type: inline-size; border: 1px solid var(--bd); border-radius: 12px;
    padding: 20px 22px 22px; background: var(--bg); }

  .crumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dim); margin-bottom: 14px; }
  .crumb a { color: var(--mut); } .crumb a:hover { color: var(--acc); }
  .crumb i { font-style: normal; opacity: .5; } .crumb b { color: var(--txt); font-weight: 600; }

  /* ------------------------------ khối đầu chung -------------------------- */
  .hC { position: relative; overflow: hidden; border-radius: 12px; isolation: isolate;
    padding: 26px 26px 18px; background: var(--surf2); }
  .bgC { position: absolute; inset: -10%; width: 120%; height: 120%; object-fit: cover;
    object-position: center 24%; filter: blur(26px) saturate(1.1) brightness(.44); z-index: -2; }
  .veilC { position: absolute; inset: 0; z-index: -1;
    background: linear-gradient(96deg, rgba(10, 7, 5, .95) 6%, rgba(10, 7, 5, .76) 48%, rgba(10, 7, 5, .28)); }
  .inC { display: grid; grid-template-columns: 172px minmax(0, 1fr); gap: 30px; align-items: center; }
  .cvWrap { min-width: 0; }
  .cvC { position: relative; display: block; border-radius: 6px; overflow: hidden; background: var(--surf2);
    box-shadow: 0 24px 40px -22px rgba(0, 0, 0, .95), 0 0 0 1px rgba(255, 243, 230, .13); }
  .cvC img { display: block; width: 100%; aspect-ratio: 2/3; object-fit: cover; object-position: center top; }
  .txtC { min-width: 0; }
  .txtC h1 { font-family: var(--font-head); font-size: 32px; font-weight: 700; line-height: 1.13;
    letter-spacing: -.024em; color: #fff; text-shadow: 0 2px 20px rgba(0, 0, 0, .5);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .byC { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px;
    font-size: 12.5px; color: rgba(255, 255, 255, .62); }
  .byC i { font-style: normal; opacity: .45; }
  .byC b { color: rgba(255, 255, 255, .9); font-weight: 600; }

  .nwBook { position: absolute; top: 0; right: 9px; z-index: 3; width: 18px; height: 47px;
    display: grid; place-items: center; padding: 5px 0 11px; background: #b23a52; color: #fff;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 8px), 0 100%);
    filter: drop-shadow(0 2px 3px rgba(10, 6, 4, .45)); }
  .nwBook > span { writing-mode: vertical-rl; text-orientation: upright;
    font-family: var(--font-head); font-size: 7.5px; font-weight: 700; line-height: 1; letter-spacing: .14em; }

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
  .actC { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 18px; }

  .synC { margin-top: 14px; max-width: 78ch; }
  .synC p { margin: 0; font-size: 13px; line-height: 1.68; color: rgba(255, 255, 255, .72);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .synMore { display: inline-flex; align-items: center; gap: 3px; margin-top: 5px; padding: 0;
    border: 0; background: none; font: 650 11.5px/1 var(--font); color: var(--acc); cursor: pointer; }
  .synMore svg { width: 9px; height: 9px; }

  .hProg { display: flex; align-items: center; gap: 14px; margin-top: 22px; padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, .13); }
  .hProg span { font: 600 10px/1 var(--font-mono); letter-spacing: .09em; text-transform: uppercase;
    color: rgba(255, 255, 255, .58); white-space: nowrap; }
  .hProg .pb { flex: 1; min-width: 60px; height: 3px; border-radius: 99px;
    background: rgba(255, 255, 255, .15); overflow: hidden; }
  .hProg .pb i { display: block; height: 100%; border-radius: 99px; background: var(--acc); }
  .hProg em { font: 700 10px/1 var(--font-mono); font-style: normal; color: rgba(255, 255, 255, .82); }

  /* ============ 1 · HAI KHỐI GÓC DÍNH MÉP ================================= */
  .blkSt { position: absolute; left: 0; bottom: 0; z-index: 2; display: flex; align-items: center;
    gap: 6px; padding: 6px 10px 7px; background: rgba(8, 6, 4, .9); color: #fff;
    font: 800 9px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase;
    border-top-right-radius: 5px; }
  .blkSt::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .blkSt.done { color: #a9e9c4; } .blkSt.run { color: #ffd79a; } .blkSt.soon { color: #cbc1f5; }
  .blkAge { position: absolute; right: 0; bottom: 0; z-index: 2; display: grid; place-items: center;
    height: 25px; padding: 0 7px; background: #efe3d0; color: #1d1310;
    font: 800 9px/1 var(--font-mono); font-style: normal; letter-spacing: .04em;
    border-top-left-radius: 5px; }

  /* ============ 2 · BĂNG ÔBI GIẤY ======================================== */
  .cvC.obi { border-radius: 5px; }
  .obiBand { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: flex;
    align-items: center; justify-content: space-between; gap: 6px; height: 27px; padding: 0 9px;
    background: #efe3d0; color: #2a1a12;
    box-shadow: 0 -1px 0 rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .5); }
  .obiBand > b { font-family: var(--font-head); font-size: 11.5px; font-weight: 700;
    letter-spacing: -.01em; white-space: nowrap; }
  .obiBand > em { display: grid; place-items: center; height: 17px; padding: 0 5px;
    background: #2a1a12; color: #efe3d0; font: 800 8.5px/1 var(--font-mono); font-style: normal;
    letter-spacing: .04em; border-radius: 2px; }

  /* ============ 3 · NHÃN DỌC NGOÀI BÌA =================================== */
  .inC.wide { grid-template-columns: 20px 172px minmax(0, 1fr); grid-template-rows: 1fr; column-gap: 0; }
  .inC.wide .sideLb { grid-area: 1 / 1; align-self: stretch; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    border-right: 1px solid rgba(255, 255, 255, .16); }
  .sideLb > b { writing-mode: vertical-rl; font: 800 8.5px/1 var(--font-mono);
    letter-spacing: .26em; text-transform: uppercase; color: #fff; }
  .sideLb > b.done { color: #a9e9c4; } .sideLb > b.run { color: #ffd79a; } .sideLb > b.soon { color: #cbc1f5; }
  .sideLb > i { writing-mode: vertical-rl; font: 700 7px/1 var(--font-mono); font-style: normal;
    letter-spacing: .16em; color: rgba(255, 255, 255, .5); }
  .inC.wide .cvC { grid-area: 1 / 2; margin: 0 28px 0 14px; }
  .inC.wide .txtC { grid-area: 1 / 3; }

  /* ============ 4 · CHÚ THÍCH DƯỚI BÌA =================================== */
  .capRow { display: flex; align-items: center; gap: 6px; margin-top: 9px; padding-left: 1px; }
  .capRow::before { content: ""; width: 16px; height: 2px; background: #b23a52; flex: none;
    margin-right: 2px; }
  .capRow > b { font: 800 9px/1 var(--font-mono); letter-spacing: .16em; text-transform: uppercase;
    color: rgba(255, 255, 255, .82); white-space: nowrap; }
  .capRow > i { font-style: normal; color: rgba(255, 255, 255, .28); }
  .capRow > em { font: 700 9px/1 var(--font-mono); font-style: normal; letter-spacing: .06em;
    color: rgba(255, 255, 255, .55); }

  /* --------------------------------- tab --------------------------------- */
  .tabs2 { display: flex; align-items: center; gap: 24px; margin: 22px 0 0;
    border-bottom: 1px solid var(--bd); }
  .tabs2 button { position: relative; height: 38px; padding: 0; border: 0; background: none;
    font: 600 13px/1 var(--font); color: var(--mut); cursor: pointer; white-space: nowrap; flex: none; }
  .tabs2 button b { margin-left: 5px; font: 700 10px/1 var(--font-mono); color: var(--dim); }
  .tabs2 button.on { color: var(--txt); }
  .tabs2 button.on b { color: var(--acc); }
  .tabs2 button.on::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px;
    height: 2px; border-radius: 2px; background: var(--acc); }

  .cg4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 30px; margin-top: 6px; }
  .ch4 { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: baseline; gap: 9px;
    min-width: 0; padding: 9px 0; border-bottom: 1px solid var(--bd-soft);
    font-size: 12.5px; color: var(--mut); }
  .ch4 em { font: 500 10px/1 var(--font-mono); color: var(--dim); font-style: normal; }
  .ch4 span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ch4:hover { color: var(--acc); }
  .ch4.cur { color: var(--acc); font-weight: 650; }

  @container (max-width: 960px) {
    .inC { grid-template-columns: 150px minmax(0, 1fr); gap: 24px; }
    .inC.wide { grid-template-columns: 18px 150px minmax(0, 1fr); grid-template-rows: 1fr; }
    .inC.wide .cvC { margin: 0 22px 0 12px; }
    .txtC h1 { font-size: 26px; }
    .cg4 { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 22px; }
  }
  @container (max-width: 660px) {
    .hC { padding: 18px; }
    .inC { grid-template-columns: 108px minmax(0, 1fr); gap: 14px; align-items: start; }
    .inC.wide { grid-template-columns: 15px 108px minmax(0, 1fr); }
    .inC.wide .cvC { margin: 0 14px 0 9px; }
    .sideLb > b { font-size: 6.5px; letter-spacing: .14em; }
    .txtC h1 { font-size: 21px; }
    .synC { margin-top: 8px; }
    .synC p { font-size: 12px; }
    .synMore { font-size: 11px; white-space: nowrap; }
    .actC { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 16px; }
    .btnPri, .btnGho { justify-content: center; width: 100%; }
    .blkSt { font-size: 7px; letter-spacing: .06em; padding: 4px 6px 5px; gap: 4px; }
    .blkSt::before { width: 4px; height: 4px; }
    .blkAge { height: 18px; font-size: 7px; padding: 0 4px; }
    .obiBand { height: 22px; padding: 0 6px; gap: 4px; }
    .obiBand > b { font-size: 9.5px; }
    .obiBand > em { height: 14px; font-size: 7px; padding: 0 3px; }
    .capRow { margin-top: 7px; gap: 5px; }
    .capRow::before { width: 12px; }
    .capRow > b { font-size: 7.5px; letter-spacing: .1em; }
    .capRow > em { font-size: 7.5px; }
    .hProg { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; margin-top: 16px; }
    .hProg > span { grid-area: 1 / 1; font-size: 9px; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; }
    .hProg em { grid-area: 1 / 2; align-self: center; }
    .hProg .pb { grid-area: 2 / 1 / 3 / 3; }
    .cg4 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
    .tabs2 { gap: 16px; overflow-x: auto; }
  }
`;

const opt = (id, name, note, html) =>
  `<section class="opt">
    <span class="otag"><i>${id}</i>${name}</span>
    <p class="onote">${note}</p>
    <div class="frame">${html}</div>
  </section>`;

const chapters = Array.from({ length: CH }, (_, i) => i + 1);
const grid = (n = 8) => `<div class="cg4">${chapters.slice(0, n).map((k) =>
  `<a class="ch4${k === PROG.read ? ' cur' : ''}" href="#" title="Chương ${k}: ${esc(chapName(k))}"><em>${pad2(k)}</em><span>${esc(chapName(k))}</span></a>`
).join('')}</div>`;

const body = (hero) => `${crumb}${hero}${tabs}${grid()}`;

const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · nhãn trạng thái · hướng khác</title>
<link rel="stylesheet" href="../home-v2/mock2.css?v=story8">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · nhãn trạng thái</span>
  <span>bỏ kiểu “dải dán lên ảnh” — bốn hướng khác hẳn</span>
  <a href="../story-v7/index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← vòng 7</a>
  <a href="../home-v2/index.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">trang chủ</a>
</div>

<div class="wrap">
  <div class="hd">
    <h2>Nhãn trạng thái — bốn hướng khác</h2>
    <p class="lead">Bốn bản trước đều là <b>một dải/miếng dán ngang lên ảnh bìa</b> — nhìn kiểu gì cũng giống
      thanh công cụ của app dán lên poster. Bốn hướng dưới đây bỏ hẳn suy nghĩ đó: hai cái vẫn nằm trên bìa
      nhưng <b>ăn theo mép</b> (như thiết kế bìa sách thật), hai cái <b>ra ngoài bìa</b>.</p>
    <p class="note">Vẫn chừa băng rôn MỚI ở góc trên phải. Bìa mẫu là bìa rất sáng để thử độ tương phản.</p>
  </div>

  ${opt('1', 'Hai khối dính mép · không dải ngang',
    'Trạng thái là <b>khối nền mực dính góc dưới trái</b>, 18+ là <b>ô giấy dính góc dưới phải</b> — ' +
    'hai khối ăn liền hai mép bìa, chỉ bo góc phía trong. Không chạy ngang qua ảnh nên không cắt poster; ' +
    'nhìn như nhà phát hành in tên mình lên góc bìa.',
    body(hero1))}

  ${opt('2', 'Băng ôbi giấy · băng giấy màu giấy',
    'Băng <b>ôbi</b> kiểu sách Nhật: dải giấy màu <b>giấy ấm</b> cao 27px ở đáy bìa, chữ <b>serif mực đậm</b>, ' +
    '18+ là ô mực nhỏ. Vì là giấy đặc chứ không phải kính mờ, nó đọc như một vật thể thật dán quanh bìa — ' +
    'và ăn đúng hệ màu giấy của web.',
    body(hero2))}

  ${opt('3', 'Nhãn dọc ngoài bìa · không chạm ảnh',
    'Trạng thái chạy <b>dọc theo gáy, nằm ngoài ảnh bìa</b> (cột 20px bên trái, có đường kẻ mảnh ngăn cách). ' +
    'Ảnh bìa <b>không bị phủ một điểm nào</b>, mà nhãn vẫn ở ngay cạnh bìa như nhãn gáy sách. ' +
    '18+ gộp vào cuối dòng cho gọn.',
    body(hero3))}

  ${opt('4', 'Chú thích dưới bìa · có gạch son',
    'Bìa sạch tuyệt đối; ngay dưới bìa là một dòng chú thích: <b>gạch son 16px</b> + tên trạng thái + 18+. ' +
    'Không nền, không viền, không gradient — chỉ chữ và một nét son, đúng ngôn ngữ “hairline + type” của web.',
    body(hero4))}
</div>
</body>
</html>
`;

fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi story-v8/index.html ·', Math.round(HTML.length / 1024), 'kB ·', S.t, '· chương', CH);
