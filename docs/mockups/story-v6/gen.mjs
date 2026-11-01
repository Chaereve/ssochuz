#!/usr/bin/env node
/* ============================================================================
   gen.mjs · TRANG THÔNG TIN TRUYỆN — vòng 2
   ----------------------------------------------------------------------------
   Vòng 5: BỎ HẲN nhãn trạng thái / 18+ kiểu viên thuốc. Bốn phương án bày trạng thái:
      A · dòng son   — trạng thái là chữ đầu tiên của dòng tác giả, màu son
      B · nhịp số    — “25 chương · Hoàn thành · 18+” thành một hàng chữ có số serif lớn
      C · dải chân   — trạng thái + 18+ rời xuống dải đáy, cạnh thanh tiến độ
      D · nhãn trên bìa — trạng thái in trên bìa (dưới trái), 18+ góc trên phải bìa
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

/* bìa: có bookmark “MỚI” đúng như trang thật (góc trên phải) để thấy rõ chỗ nào không được đụng */
const BOOKMARK = `<span class="nwBook" aria-hidden="true"><span>MỚI</span></span>`;
const cover = (inner = '') => `<a class="cvC" href="#">${S.img ? `<img src="${esc(S.img)}" alt="Bìa ${esc(S.t)}" loading="lazy">` : ''}${BOOKMARK}${inner}</a>`;

const TEXT = (extra = '') => `<div class="txtC">
  <h1>${esc(S.t)}</h1>
  <div class="byC"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${esc(S.y)}` : ''}</div>
  ${extra}${SYN}${ACT}</div>`;

/* =============== D1 · DẢI CHÂN BÌA — cả hai nhãn ở đáy bìa =============== */
const heroD1 = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover(`<span class="cvFoot"><b class="cvSt ${statusCls(S.st)}"><i></i>${esc(S.st)}</b>${S.e ? '<em class="cvAge">18+</em>' : ''}</span>`)}
    ${TEXT()}
  </div>
  ${PROGRESS}
</section>`;

/* ================= D2 · KÍNH MỜ — dải kính ở đáy bìa ===================== */
const heroD2 = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover(`<span class="cvGlass"><b class="cvSt ${statusCls(S.st)}"><i></i>${esc(S.st)}</b>${S.e ? '<em class="cvAge box">18+</em>' : ''}</span>`)}
    ${TEXT()}
  </div>
  ${PROGRESS}
</section>`;

/* ============== D3 · CHÚ THÍCH DƯỚI BÌA — không phủ lên ảnh ============= */
const heroD3 = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    <div class="cvWrap">
      ${cover()}
      <div class="cvCap"><b class="cvSt ${statusCls(S.st)}"><i></i>${esc(S.st)}</b>${S.e ? '<i class="capSep">·</i><em class="cvAge">18+</em>' : ''}</div>
    </div>
    ${TEXT()}
  </div>
  ${PROGRESS}
</section>`;

/* ================= D4 · GÁY BÌA — trạng thái chạy dọc mép trái ========== */
const heroD4 = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover(`<span class="cvSpine ${statusCls(S.st)}"><span>${esc(S.st)}</span></span>${S.e ? '<em class="cvAge corner">18+</em>' : ''}`)}
    ${TEXT()}
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
  .inC { display: grid; grid-template-columns: 186px minmax(0, 1fr); gap: 30px; align-items: center; }
  .cvWrap { min-width: 0; }
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

  /* bookmark “MỚI” đúng trang thật: góc trên phải, không được đụng vào */
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

  /* --------------------------- nhãn trạng thái chung ---------------------- */
  .cvSt { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
    font: 800 8.5px/1 var(--font-mono);
    letter-spacing: .15em; text-transform: uppercase; color: #fff;
    text-shadow: 0 1px 5px rgba(0, 0, 0, .75); }
  .cvSt i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex: none;
    box-shadow: 0 0 6px currentColor; }
  .cvSt.done { color: #b7f0ce; } .cvSt.run { color: #ffdfab; } .cvSt.soon { color: #d5ccff; }
  .cvAge { font: 700 8.5px/1 var(--font-mono); font-style: normal; letter-spacing: .1em;
    color: rgba(255, 255, 255, .78); text-shadow: 0 1px 5px rgba(0, 0, 0, .75); }

  /* D1 · dải chân bìa */
  .cvFoot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center;
    justify-content: space-between; gap: 8px; padding: 24px 11px 10px;
    background: linear-gradient(0deg, rgba(6, 4, 3, .96) 34%, rgba(6, 4, 3, 0)); }
  .cvFoot .cvSt { font-size: 9px; }
  .cvFoot .cvAge { font-size: 9px; letter-spacing: .08em; }

  /* D2 · kính mờ */
  .cvGlass { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center;
    justify-content: space-between; gap: 8px; padding: 8px 10px;
    background: rgba(14, 10, 7, .52); border-top: 1px solid rgba(255, 255, 255, .16);
    backdrop-filter: blur(9px) saturate(1.1); -webkit-backdrop-filter: blur(9px) saturate(1.1); }
  .cvAge.box { padding: 3px 5px; border: 1px solid rgba(255, 255, 255, .34); border-radius: 3px;
    color: #fff; letter-spacing: .06em; text-shadow: none; }

  /* D3 · chú thích dưới bìa */
  .cvCap { display: flex; align-items: center; gap: 6px; margin-top: 9px; padding-left: 1px; }
  .cvCap .cvSt, .cvCap .cvAge { text-shadow: none; }
  .cvCap .cvSt { font-size: 9.5px; letter-spacing: .16em; color: rgba(255, 255, 255, .8); }
  .cvCap .cvAge { font-size: 9.5px; color: rgba(255, 255, 255, .55); }
  .capSep { font-style: normal; color: rgba(255, 255, 255, .3); }

  /* D4 · gáy bìa */
  .cvSpine { position: absolute; left: 0; top: 0; bottom: 0; width: 26px; display: grid;
    place-items: center; padding: 12px 0;
    background: rgba(8, 5, 4, .78);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, .14); }
  .cvSpine > span { writing-mode: vertical-rl; text-orientation: mixed;
    font: 800 9px/1 var(--font-mono); letter-spacing: .24em; text-transform: uppercase;
    color: #fff; text-shadow: 0 1px 6px rgba(0, 0, 0, .9); }
  .cvSpine.done > span { color: #b7f0ce; } .cvSpine.run > span { color: #ffdfab; }
  .cvSpine.soon > span { color: #d5ccff; }
  .cvAge.corner { position: absolute; right: 8px; bottom: 8px; padding: 2px 4px;
    border: 1px solid rgba(255, 255, 255, .3); border-radius: 3px; color: #fff; text-shadow: none; }

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
    .inC { grid-template-columns: 106px minmax(0, 1fr); gap: 14px; align-items: start; }
    .txtC h1 { font-size: 21px; }
    .synC { margin-top: 8px; }
    .synC p { font-size: 12px; }
    .actC { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 16px; }
    .btnPri, .btnGho { justify-content: center; width: 100%; }
    .cvSt { font-size: 6.8px; letter-spacing: .06em; gap: 3px; }
    .cvSt i { width: 4px; height: 4px; }
    .cvAge { font-size: 7px; letter-spacing: .04em; }
    .cvFoot { padding: 14px 6px 6px; }
    .cvGlass { padding: 5px 6px; }
    .cvAge.box { padding: 2px 3px; }
    .cvSpine { width: 20px; }
    .cvSpine > span { font-size: 7px; letter-spacing: .16em; }
    .byC { font-size: 11.5px; gap: 6px; }
    .cvCap { margin-top: 7px; gap: 5px; }
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
<title>ssochuz · nhãn trên bìa · bốn cách</title>
<link rel="stylesheet" href="../home-v2/mock2.css?v=story6">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · nhãn trên bìa</span>
  <span>bốn cách làm nhãn trạng thái &amp; 18+ đẹp hơn, không đụng băng rôn MỚI</span>
  <a href="../story-v5/index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← vòng 5</a>
  <a href="../home-v2/index.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">trang chủ</a>
</div>

<div class="wrap">
  <div class="hd">
    <h2>Nhãn trên bìa — bốn cách, đều tránh băng rôn</h2>
    <p class="lead">Bạn chọn <b>D · nhãn trên bìa</b>. Vấn đề: trang thật đã có <b>bookmark “MỚI” ở góc trên
      phải</b> bìa và trước đây badge 18+ nằm <b>góc trên trái</b>. Nên cả hai nhãn mới đều dời xuống
      <b>nửa dưới bìa</b> — bốn cách bày khác nhau, cùng một nguyên tắc: không chồng lên băng rôn.</p>
    <p class="note">Bìa trong mockup đã vẽ đúng bookmark MỚI đỏ ở góc trên phải như trang thật để bạn thấy
      chỗ nào còn trống. Nhãn dùng chấm màu + chữ mono in hoa, không viền, không nền thuốc.</p>
  </div>

  ${opt('D1', 'Dải chân bìa · hai nhãn hai đầu',
    'Một dải tối mờ ở đáy bìa: <b>● Hoàn thành</b> bên trái, <b>18+</b> bên phải, cùng cỡ chữ mono 8,5px. ' +
    'Không hộp, chỉ là chữ trên nền tối dần — đọc được trên mọi ảnh bìa. ' +
    '<b>Sạch và an toàn nhất.</b>',
    body(heroD1))}

  ${opt('D2', 'Kính mờ · dải kính ở đáy bìa',
    'Dải <b>kính mờ</b> thật (blur nền bìa xuyên qua) cao 28px, có đường kẻ sáng 1px ở trên; ' +
    'trạng thái bên trái, <b>18+</b> đóng khung 1px bên phải. ' +
    '<b>Sang và “app” nhất</b>, tách hẳn khỏi ảnh mà không cần nền đặc.',
    body(heroD2))}

  ${opt('D3', 'Chú thích dưới bìa · không phủ lên ảnh',
    'Bìa <b>sạch tuyệt đối</b>: hai nhãn in ra ngoài, ngay dưới bìa như chú thích ảnh — ' +
    '● Hoàn thành · 18+. Không che một điểm ảnh nào, nên bìa nào cũng hợp, kể cả bìa sáng. ' +
    '<b>An toàn nhất về thị giác</b>, nhưng nhãn rời khỏi bìa.',
    body(heroD3))}

  ${opt('D4', 'Gáy bìa · trạng thái chạy dọc',
    'Trạng thái thành <b>gáy sách</b>: dải 19px mép trái, chữ chạy dọc, đúng kiểu sách đóng gáy; ' +
    '<b>18+</b> đóng khung nhỏ ở góc dưới phải. Rất “bìa sách”, không đụng băng rôn. ' +
    '<b>Đẹp nhất nếu bạn thích chất sách</b>, nhưng chữ dọc khó đọc hơn.',
    body(heroD4))}
</div>
</body>
</html>
`;

fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi story-v6/index.html ·', Math.round(HTML.length / 1024), 'kB ·', S.t, '· chương', CH);
