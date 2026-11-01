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

const ACT = (dark = true) => `<div class="actC">
  <a class="btnPri" href="#">${ICON.play}Đọc từ đầu</a>
  <a class="btnGho${dark ? ' onDark' : ''}" href="#">${ICON.book}Chương mới nhất</a>
  <a class="btnGho${dark ? ' onDark' : ''}" href="#">${ICON.bell}Theo dõi</a>
  <a class="btnGho${dark ? ' onDark' : ''}" href="#">${ICON.shelf}Tủ truyện</a>
</div>`;

const SYN = `<div class="synC"><p>${esc(PARAS[0])}</p>
  <button class="synMore" type="button">Đọc giới thiệu đầy đủ ${ICON.chev}</button></div>`;

const PROGRESS = `<div class="hProg"><span>Đang đọc chương ${PROG.read} / ${CH} · còn ${CH - PROG.read} chương</span>
  <div class="pb"><i style="width:${PROG.pct}%"></i></div><em>${PROG.pct}%</em></div>`;

const cover = (extra = '') => `<a class="cvC" href="#">${S.img ? `<img src="${esc(S.img)}" alt="Bìa ${esc(S.t)}" loading="lazy">` : ''}${extra}</a>`;

/* ======================= A · DÒNG SON (chữ đầu dòng) ====================== */
const heroA = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover()}
    <div class="txtC">
      <h1>${esc(S.t)}</h1>
      <div class="byA"><b class="st ${statusCls(S.st)}">${esc(S.st)}</b><i>·</i>${esc(S.a)}
        ${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${S.y}` : ''}${S.e ? '<i>·</i><em class="age">18+</em>' : ''}</div>
      ${SYN}
      ${ACT()}
    </div>
  </div>
  ${PROGRESS}
</section>`;

/* ========================= B · NHỊP SỐ (số chương) ======================== */
const heroB = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover()}
    <div class="txtC">
      <h1>${esc(S.t)}</h1>
      <div class="byB"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${esc(S.y)}` : ''}</div>
      <div class="numB">
        <span class="nb"><b>${CH}</b>chương</span>
        <span class="nb st ${statusCls(S.st)}"><i></i>${esc(S.st)}</span>
        ${S.e ? '<span class="nb age">18+</span>' : ''}
      </div>
      ${SYN}
      ${ACT()}
    </div>
  </div>
  ${PROGRESS}
</section>`;

/* ====================== C · DẢI CHÂN (rời khỏi tiêu đề) =================== */
const heroC = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover()}
    <div class="txtC">
      <h1>${esc(S.t)}</h1>
      <div class="byC"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${esc(S.y)}` : ''}</div>
      ${SYN}
      ${ACT()}
    </div>
  </div>
  <div class="hProg footC">
    <span class="ftSt"><b class="st ${statusCls(S.st)}">${esc(S.st)}</b>${S.e ? '<i>·</i>18+' : ''}</span>
    <span class="ftDiv"></span>
    <span class="pgTxt">Đang đọc chương ${PROG.read} / ${CH}</span>
    <div class="pb"><i style="width:${PROG.pct}%"></i></div><em>${PROG.pct}%</em>
  </div>
</section>`;

/* ========================= D · NHÃN TRÊN BÌA ============================= */
const heroD = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover(`
      <span class="cvScrim"></span>
      <span class="cvSt ${statusCls(S.st)}"><i></i>${esc(S.st)}</span>
      ${S.e ? '<span class="cvAge">18+</span>' : ''}`)}
    <div class="txtC">
      <h1>${esc(S.t)}</h1>
      <div class="byC"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${esc(S.y)}` : ''}</div>
      ${SYN}
      ${ACT()}
    </div>
  </div>
  ${PROGRESS}
</section>`;

/* ===================== D2 · NHÃN TRÊN BÌA + NHỊP SỐ ===================== */
/* bìa mang trạng thái; cột chữ giữ hàng số “25 chương │ 18+” để không mất nhịp */
const heroD2 = `<section class="hC">
  ${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}
  <span class="veilC"></span>
  <div class="inC">
    ${cover(`
      <span class="cvScrim"></span>
      <span class="cvSt ${statusCls(S.st)}"><i></i>${esc(S.st)}</span>
      ${S.e ? '<span class="cvAge">18+</span>' : ''}`)}
    <div class="txtC">
      <h1>${esc(S.t)}</h1>
      <div class="byB"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${esc(S.y)}` : ''}</div>
      <div class="numB">
        <span class="nb"><b>${CH}</b>chương</span>
        ${S.e ? '<span class="nb age">18+</span>' : ''}
      </div>
      ${SYN}
      ${ACT()}
    </div>
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
  .cvC { position: relative; display: block; border-radius: 8px; overflow: hidden; background: var(--surf2);
    box-shadow: 0 26px 44px -22px rgba(0, 0, 0, .95), 0 0 0 1px rgba(255, 243, 230, .14); }
  .cvC img { display: block; width: 100%; aspect-ratio: 2/3; object-fit: cover; object-position: center top; }
  .txtC { min-width: 0; }
  .txtC h1 { font-family: var(--font-head); font-size: 32px; font-weight: 700; line-height: 1.13;
    letter-spacing: -.024em; color: #fff; text-shadow: 0 2px 20px rgba(0, 0, 0, .5);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

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
  .hProg .pb { flex: 1; min-width: 60px; height: 3px; border-radius: 99px;
    background: rgba(255, 255, 255, .15); overflow: hidden; }
  .hProg .pb i { display: block; height: 100%; border-radius: 99px; background: var(--acc); }
  .hProg em { font: 700 10px/1 var(--font-mono); font-style: normal; color: rgba(255, 255, 255, .82); }

  /* ======================= A · DÒNG SON (chữ đầu dòng) ==================== */
  .byA { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 11px;
    font-size: 12.5px; color: rgba(255, 255, 255, .64); }
  .byA i { font-style: normal; opacity: .45; }
  .byA .st { font-size: 13px; font-weight: 700; color: #fff; letter-spacing: .01em; }
  .byA .st.done { color: #a9e3c2; }
  .byA .st.run { color: #f2d7a2; }
  .byA .st.soon { color: #cdc3f0; }
  .byA .st::after { content: ""; display: none; }
  .byA .age { font: 700 10px/1 var(--font-mono); letter-spacing: .08em;
    color: rgba(255, 255, 255, .55); }

  /* ========================= B · NHỊP SỐ (số chương) ====================== */
  .byB { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px;
    font-size: 12.5px; color: rgba(255, 255, 255, .62); }
  .byB i { font-style: normal; opacity: .45; }
  .byB b { color: rgba(255, 255, 255, .9); font-weight: 600; }
  .numB { display: flex; align-items: center; gap: 0; margin-top: 16px; padding-top: 2px; }
  .nb { display: inline-flex; align-items: baseline; gap: 7px; padding: 0 18px; white-space: nowrap;
    border-left: 1px solid rgba(255, 255, 255, .17); font: 500 10px/1 var(--font-mono);
    letter-spacing: .12em; text-transform: uppercase; color: rgba(255, 255, 255, .5); }
  .nb:first-child { padding-left: 0; border-left: 0; }
  .nb b { font-family: var(--font-head); font-size: 25px; font-weight: 700; line-height: 1;
    letter-spacing: -.02em; color: #fff; text-transform: none; }
  .nb.st { align-items: center; gap: 6px; font: 700 10.5px/1 var(--font-mono);
    letter-spacing: .12em; }
  .nb.st i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .nb.st.done { color: #a9e3c2; } .nb.st.run { color: #f2d7a2; } .nb.st.soon { color: #cdc3f0; }
  .nb.age { font: 700 10.5px/1 var(--font-mono); letter-spacing: .1em; color: rgba(255, 255, 255, .5); }

  /* ===================== C · DẢI CHÂN (rời khỏi tiêu đề) ================== */
  .byC { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px;
    font-size: 12.5px; color: rgba(255, 255, 255, .62); }
  .byC i { font-style: normal; opacity: .45; }
  .byC b { color: rgba(255, 255, 255, .9); font-weight: 600; }
  .footC { gap: 12px; }
  .ftDiv { width: 1px; height: 12px; background: rgba(255, 255, 255, .2); flex: none; }
  .footC > span.ftSt { display: inline-flex; align-items: center; gap: 6px;
    font: 700 10px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase;
    color: rgba(255, 255, 255, .55); }
  .footC .st { font-weight: 700; }
  .footC .st.done { color: #a9e3c2; } .footC .st.run { color: #f2d7a2; } .footC .st.soon { color: #cdc3f0; }
  .footC i { font-style: normal; opacity: .5; margin: 0 2px; }
  .pgTxt { font: 600 10px/1 var(--font-mono); letter-spacing: .09em; text-transform: uppercase;
    color: rgba(255, 255, 255, .5); white-space: nowrap; }

  /* ========================= D · NHÃN TRÊN BÌA =========================== */
  .cvScrim { position: absolute; left: 0; right: 0; bottom: 0; height: 42%;
    background: linear-gradient(0deg, rgba(0, 0, 0, .82), rgba(0, 0, 0, 0)); }
  .cvSt { position: absolute; left: 10px; bottom: 10px; display: inline-flex; align-items: center;
    gap: 6px; font: 800 9px/1 var(--font-mono); letter-spacing: .13em; text-transform: uppercase;
    color: #fff; text-shadow: 0 1px 6px rgba(0, 0, 0, .8); }
  .cvSt i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .cvSt.done { color: #a9e3c2; } .cvSt.run { color: #f2d7a2; } .cvSt.soon { color: #cdc3f0; }
  .cvAge { position: absolute; right: 8px; top: 8px; padding: 3px 6px; border-radius: 4px;
    background: rgba(12, 9, 6, .7); border: 1px solid rgba(255, 255, 255, .3);
    font: 800 9px/1 var(--font-mono); letter-spacing: .06em; color: #fff; }

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

  /* ------------------------- danh sách chương (bối cảnh) ----------------- */
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
    .numB { margin-top: 12px; flex-wrap: wrap; row-gap: 6px; }
    .nb { padding: 0 10px; }
    .nb b { font-size: 20px; }
    .nb.st, .nb.age { font-size: 9.5px; letter-spacing: .08em; }
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
<title>ssochuz · trạng thái &amp; 18+ · năm phương án</title>
<link rel="stylesheet" href="../home-v2/mock2.css?v=story5">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · trạng thái truyện</span>
  <span>năm phương án bày “Hoàn thành” và “18+”, không dùng viên thuốc</span>
  <a href="../story-v4/index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← vòng 4</a>
  <a href="../home-v2/index.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">trang chủ</a>
</div>

<div class="wrap">
  <div class="hd">
    <h2>Trạng thái &amp; 18+ — bỏ viên thuốc thì bày thế nào</h2>
    <p class="lead">Năm phương án, cùng một khối đầu trang (nền bìa mờ, bìa 186px, tiêu đề 32px,
      bốn nút, thanh tiến độ ở đáy). Khác nhau <b>duy nhất ở chỗ đặt trạng thái và mốc 18+</b>.</p>
    <p class="note">Không phương án nào dùng viên thuốc có viền. Bìa và tên chương là dữ liệu thật
      (HOMETOWN ROMANCE · 25 chương · ${esc(S.st)} · 18+).</p>
  </div>

  ${opt('A', 'Dòng son · trạng thái là chữ đầu dòng',
    'Không có nhãn riêng: <b>“Hoàn thành”</b> đứng đầu dòng tác giả, in đậm màu son, rồi tới ' +
    '· Lambo · Lookmhee x Sonya · 2025 · 18+. Mọi thứ thành một dòng chữ, tiêu đề là thứ duy nhất nổi. ' +
    '<b>Gọn nhất, sạch nhất</b> — nhưng trạng thái hơi lẫn vào dòng phụ.',
    body(heroA))}

  ${opt('B', 'Nhịp số · số chương làm mốc',
    'Dưới dòng tác giả là một hàng số: <b>25</b> chương │ ● Hoàn thành │ 18+, ngăn bằng đường kẻ dọc mảnh. ' +
    'Số chương in serif lớn nên mắt bắt được ngay, trạng thái là chữ + chấm màu. ' +
    '<b>Có nhịp, đọc như bảng số</b> — thêm một hàng chữ so với A.',
    body(heroB))}

  ${opt('C', 'Dải chân · trạng thái rời khỏi tiêu đề',
    'Vùng tiêu đề sạch tuyệt đối: chỉ tên truyện, tác giả, giới thiệu, nút. Trạng thái và 18+ ' +
    '<b>rời xuống dải đáy</b>, đứng cạnh thanh tiến độ: HOÀN THÀNH · 18+ … Đang đọc 13/25 … 65%. ' +
    '<b>Cân nhất</b>, nhưng trạng thái kém nổi — phải nhìn xuống đáy khối.',
    body(heroC))}

  ${opt('D', 'Nhãn trên bìa · trả lại sự trong cho cột chữ',
    'Trạng thái in <b>trên chính bìa</b> (dưới trái, trên dải tối), 18+ thành ô nhỏ góc trên phải bìa. ' +
    'Cột chữ chỉ còn tên truyện · tác giả · giới thiệu · nút. ' +
    '<b>Chuyên nghiệp kiểu bìa sách thật</b> — nhưng phụ thuộc ảnh bìa: bìa sáng quá thì nhãn chìm.',
    body(heroD))}

  ${opt('D2', 'Bìa có nhãn + hàng số ở cột chữ',
    'Như D nhưng giữ thêm hàng số <b>25</b> chương │ 18+ dưới tên tác giả — trạng thái thì nằm trên bìa. ' +
    'Dành cho trường hợp bạn thích D mà vẫn muốn cột chữ có nhịp số như B.',
    body(heroD2))}
</div>
</body>
</html>
`;

fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi story-v5/index.html ·', Math.round(HTML.length / 1024), 'kB ·',
  'truyện', S.t, '· chương', CH, '· tên chương đầu:', chapName(1));
