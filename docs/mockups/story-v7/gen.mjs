#!/usr/bin/env node
/* ============================================================================
   gen.mjs · TRANG THÔNG TIN TRUYỆN — vòng 2
   ----------------------------------------------------------------------------
   Vòng 7: chốt D (nhãn nằm trên bìa) nhưng D1 cũ bị chìm. Bốn cách làm nổi:
      1 · dải đen đặc          4 · dải son đặc
      2 · dải đen + gờ son     3 · hai nhãn nổi, không dải
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

/* bookmark “MỚI” đúng trang thật: góc trên phải, không được đụng vào */
const BOOKMARK = `<span class="nwBook" aria-hidden="true"><span>MỚI</span></span>`;
const cover = (inner = '') => `<a class="cvC" href="#">${S.img ? `<img src="${esc(S.img)}" alt="Bìa ${esc(S.t)}" loading="lazy">` : ''}${BOOKMARK}${inner}</a>`;

const TEXT = `<div class="txtC">
  <h1>${esc(S.t)}</h1>
  <div class="byC"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${esc(S.y)}` : ''}</div>
  ${SYN}${ACT}</div>`;

const shell = (cvExtra) => `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover(cvExtra)}
    ${TEXT}
  </div>
  ${PROGRESS}
</section>`;

/* ============ 1 · DẢI ĐEN ĐẶC — nền liền, không gradient ================= */
const hero1 = shell(`<span class="barSolid">
  <b class="lbSt ${statusCls(S.st)}"><i></i>${esc(S.st)}</b>
  ${S.e ? '<em class="lbAge ring">18+</em>' : ''}
</span>`);

/* ================= 2 · DẢI ĐEN + GỜ SON (2px cạnh trên) ================= */
const hero2 = shell(`<span class="barSolid edgeAcc">
  <b class="lbSt ${statusCls(S.st)}"><i></i>${esc(S.st)}</b>
  ${S.e ? '<em class="lbAge ring">18+</em>' : ''}
</span>`);

/* ===================== 3 · HAI NHÃN NỔI, KHÔNG DẢI ====================== */
const hero3 = shell(`<span class="floatRow">
  <b class="plate ${statusCls(S.st)}"><i></i>${esc(S.st)}</b>
  ${S.e ? '<em class="plate age">18+</em>' : ''}
</span>`);

/* ======================= 4 · DẢI SON ĐẶC (nổi nhất) ===================== */
const hero4 = shell(`<span class="barAcc">
  <b class="lbSt onAcc">${esc(S.st)}</b>
  ${S.e ? '<em class="lbAge onAcc">18+</em>' : ''}
</span>`);

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
  .inC { display: grid; grid-template-columns: 186px minmax(0, 1fr); gap: 30px; align-items: center; }
  .cvC { position: relative; display: block; border-radius: 8px; overflow: hidden; background: var(--surf2);
    box-shadow: 0 26px 44px -22px rgba(0, 0, 0, .95), 0 0 0 1px rgba(255, 243, 230, .14); }
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

  /* --------------------------- nhãn trạng thái ---------------------------- */
  .lbSt { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
    font: 800 9.5px/1 var(--font-mono); letter-spacing: .13em; text-transform: uppercase; color: #fff; }
  .lbSt i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .lbSt.done i { background: #63dd9d; box-shadow: 0 0 7px #63dd9d; }
  .lbSt.run i { background: #ffbe5c; box-shadow: 0 0 7px #ffbe5c; }
  .lbSt.soon i { background: #a99bf0; box-shadow: 0 0 7px #a99bf0; }
  .lbAge { display: inline-flex; align-items: center; height: 17px; padding: 0 5px; border-radius: 3px;
    font: 800 9px/1 var(--font-mono); font-style: normal; letter-spacing: .06em; color: #fff; }
  .lbAge.ring { border: 1px solid rgba(255, 255, 255, .55); }
  .lbAge.onAcc { background: rgba(255, 255, 255, .2); border: 1px solid rgba(255, 255, 255, .42); }
  .lbSt.onAcc { color: #fff; }

  /* 1 · dải đen đặc */
  .barSolid { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    height: 30px; padding: 0 10px; background: #0b0806;
    border-top: 1px solid rgba(255, 255, 255, .16); }
  /* 2 · thêm gờ son */
  .barSolid.edgeAcc { border-top: 2px solid #b23a52; background: linear-gradient(180deg, #17100c, #0b0806 60%); }

  /* 3 · hai nhãn nổi */
  .floatRow { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 2;
    display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: nowrap; }
  .plate { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px;
    white-space: nowrap; flex: none;
    border-radius: 5px; background: #0b0806; border: 1px solid rgba(255, 255, 255, .2);
    font: 800 9px/1 var(--font-mono); letter-spacing: .12em; text-transform: uppercase; color: #fff;
    box-shadow: 0 4px 12px -4px rgba(0, 0, 0, .9); }
  .plate i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .plate.done i { background: #63dd9d; box-shadow: 0 0 6px #63dd9d; }
  .plate.run i { background: #ffbe5c; box-shadow: 0 0 6px #ffbe5c; }
  .plate.soon i { background: #a99bf0; box-shadow: 0 0 6px #a99bf0; }
  .plate.age { font-style: normal; letter-spacing: .06em; background: #fff; color: #1a1210;
    border-color: #fff; }

  /* 4 · dải son đặc */
  .barAcc { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    height: 30px; padding: 0 10px; background: #9d3348;
    border-top: 1px solid rgba(255, 255, 255, .22); }

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
    .inC { grid-template-columns: 152px minmax(0, 1fr); gap: 24px; }
    .txtC h1 { font-size: 26px; }
    .cg4 { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 22px; }
  }
  @container (max-width: 660px) {
    .hC { padding: 18px; }
    .inC { grid-template-columns: 112px minmax(0, 1fr); gap: 14px; align-items: start; }
    .txtC h1 { font-size: 21px; }
    .synC { margin-top: 8px; }
    .synC p { font-size: 12px; }
    .actC { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 16px; }
    .btnPri, .btnGho { justify-content: center; width: 100%; }
    .barSolid, .barAcc { height: 24px; padding: 0 7px; }
    .lbSt { font-size: 7.5px; letter-spacing: .05em; gap: 4px; }
    .lbSt i { width: 4px; height: 4px; }
    .lbAge { height: 14px; padding: 0 4px; font-size: 7.5px; }
    .floatRow { left: 4px; right: 4px; bottom: 4px; gap: 4px; }
    .plate { height: 17px; padding: 0 5px; font-size: 6.8px; letter-spacing: .02em; gap: 3px; }
    .plate i { width: 4px; height: 4px; }
    .synMore { font-size: 11px; white-space: nowrap; }
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
<title>ssochuz · nhãn trên bìa · bốn cách làm nổi</title>
<link rel="stylesheet" href="../home-v2/mock2.css?v=story7">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · nhãn trên bìa</span>
  <span>D1 nhưng nhãn phải nổi — bốn cách xử lý tương phản</span>
  <a href="../story-v6/index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← vòng 6</a>
  <a href="../home-v2/index.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">trang chủ</a>
</div>

<div class="wrap">
  <div class="hd">
    <h2>Nhãn ở đáy bìa — bốn cách cho khỏi chìm</h2>
    <p class="lead">Bố cục giữ nguyên D1 (hai nhãn ở nửa dưới bìa, chừa băng rôn MỚI góc trên phải).
      Nguyên nhân chìm của D1 cũ: dải <b>gradient mỏng</b> + chữ <b>8,5px màu nhạt</b> ⇒ trên bìa sáng là mất.
      Bốn cách dưới đây bỏ gradient, dùng <b>nền đặc</b>, chữ trắng 9–9,5px.</p>
    <p class="note">Bìa mẫu cố tình rất sáng (trời xanh, đồng cỏ) — đúng ca khó nhất. Băng rôn MỚI vẫn ở
      góc trên phải như trang thật, không bị đụng.</p>
  </div>

  ${opt('1', 'Dải đen đặc · chữ trắng',
    'Thay gradient bằng <b>dải đen đặc #0b0806 cao 30px</b>, có đường kẻ sáng 1px ở cạnh trên. ' +
    'Trạng thái: chữ trắng + chấm màu phát sáng; 18+ trắng đóng khung. ' +
    '<b>Chắc chắn đọc được trên mọi bìa</b>, nhưng trông như thanh thông tin của app.',
    body(hero1))}

  ${opt('2', 'Dải đen + gờ son',
    'Như 1 nhưng cạnh trên là <b>gờ son 2px</b> và dải chuyển nhẹ từ nâu đen sang đen. ' +
    'Gờ son nối màu với <b>băng rôn MỚI</b> nên nhìn ra một hệ, và dải không còn “dán” lên ảnh. ' +
    '<b>Cân nhất giữa nổi và tinh tế.</b>',
    body(hero2))}

  ${opt('3', 'Hai nhãn nổi · không dải',
    'Bỏ dải: mỗi nhãn là một <b>viên nền đen đặc, viền sáng mảnh, bo 5px</b>, đặt hai góc dưới bìa. ' +
    'Bìa không bị cắt ngang. 18+ đảo thành <b>nền trắng chữ đen</b> nên nổi nhất trên bìa. ' +
    '<b>Gọn và “sạch bìa” nhất.</b>',
    body(hero3))}

  ${opt('4', 'Dải son đặc',
    'Cả dải đáy bìa tô <b>son đậm #9d3348</b>, chữ trắng, 18+ là ô sáng mờ bên phải. ' +
    '<b>Nổi nhất tuyệt đối</b> và cùng họ màu băng rôn — nhưng nặng, và át màu ảnh bìa.',
    body(hero4))}
</div>
</body>
</html>
`;

fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi story-v7/index.html ·', Math.round(HTML.length / 1024), 'kB ·', S.t, '· chương', CH);
