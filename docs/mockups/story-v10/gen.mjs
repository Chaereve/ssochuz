#!/usr/bin/env node
/* ============================================================================
   gen.mjs · TRANG THÔNG TIN TRUYỆN — vòng 2
   ----------------------------------------------------------------------------
   Vòng 10: tham khảo quy ước poster/app đọc truyện — TÁCH hai loại ký hiệu:
      trạng thái = chữ in hoa nhỏ;  tuổi = vòng tròn viền (nhãn kiểm duyệt).
      C1 chữ + vòng tròn · C2 tab góc · C3 chỉ vòng tròn trên bìa · C4 nhãn gấp mép
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
const BG = `${S.img ? `<img class="bgC" src="${esc(S.img)}" alt="" loading="lazy">` : ''}<span class="veilC"></span>`;
const cls = statusCls(S.st);

/* ký hiệu tuổi: vòng tròn viền — quy ước nhãn kiểm duyệt trên poster phim/ảnh bìa */
const ageRing = (mod = '') => S.e ? `<em class="ageRing ${mod}" aria-label="Dành cho 18 tuổi trở lên">18+</em>` : '';

const TEXT = (extra = '') => `<div class="txtC">
  <h1>${esc(S.t)}</h1>
  <div class="byC"><b>${esc(S.a)}</b>${S.c ? `<i>·</i>${esc(S.c)}` : ''}${S.y ? `<i>·</i>${esc(S.y)}` : ''}</div>
  ${extra}${SYN}${ACT}</div>`;

/* ===== C1 · CHỮ + KÝ HIỆU TRÒN — tách hẳn hai thứ ra hai kiểu ký hiệu ===== */
const heroC1 = `<section class="hC">
  ${BG}
  <div class="inC">
    <a class="cvC" href="#">${IMG}${BOOKMARK}
      ${ageRing('cornerTL')}
      <span class="shade"></span>
      <span class="cvBot"><b class="stT ${cls}"><i></i>${esc(S.st)}</b></span>
    </a>
    ${TEXT()}
  </div>
  ${PROGRESS}
</section>`;

/* ===== C2 · NHÃN GÓI GỌN GÓC — chữ trên tab tối, tuổi tròn góc phải ====== */
const heroC2 = `<section class="hC">
  ${BG}
  <div class="inC">
    <a class="cvC" href="#">${IMG}${BOOKMARK}
      <span class="shade"></span>
      <b class="tabSt ${cls}">${esc(S.st)}</b>${ageRing('corner')}
    </a>
    ${TEXT()}
  </div>
  ${PROGRESS}
</section>`;

/* ===== C3 · CHỈ KÝ HIỆU TRÊN BÌA — trạng thái ra ngoài, dưới tên truyện === */
const heroC3 = `<section class="hC">
  ${BG}
  <div class="inC">
    <a class="cvC" href="#">${IMG}${BOOKMARK}
      <span class="shadeSm"></span>
      ${ageRing('corner')}
    </a>
    ${TEXT(`<div class="stLine ${cls}"><i></i>${esc(S.st)}</div>`)}
  </div>
  ${PROGRESS}
</section>`;

/* ===== C4 · NHÃN GẤP MÉP — góc bìa gấp lại, chữ nằm trên nếp gấp ========= */
const heroC4 = `<section class="hC">
  ${BG}
  <div class="inC">
    <a class="cvC" href="#">${IMG}${BOOKMARK}
      <span class="dog ${cls}"><b>${esc(S.st)}</b></span>
      ${ageRing('corner')}
    </a>
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
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 6px; max-width: 96ch; }
  .note { color: var(--mut); font-size: 11.5px; margin: 8px 0 0; max-width: 104ch; }
  .hd h2 { font-size: 23px; margin: 0 0 8px; }
  .opt { border-top: 1px solid var(--bd); margin-top: 34px; padding-top: 20px; }
  .otag { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 6px;
    font: 800 10px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--acc); }
  .otag i { font-style: normal; padding: 3px 7px; border-radius: 5px; background: var(--acc-soft); letter-spacing: .06em; }
  .onote { color: var(--dim); font-size: 12px; margin: 0 0 16px; max-width: 108ch; line-height: 1.65; }
  .onote b { color: var(--mut); font-weight: 650; }
  .onote em { font-style: normal; color: var(--dim); }
  .frame { container-type: inline-size; border: 1px solid var(--bd); border-radius: 12px;
    padding: 20px 22px 22px; background: var(--bg); }

  .crumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dim); margin-bottom: 14px; }
  .crumb a { color: var(--mut); } .crumb a:hover { color: var(--acc); }
  .crumb i { font-style: normal; opacity: .5; } .crumb b { color: var(--txt); font-weight: 600; }

  .hC { position: relative; overflow: hidden; border-radius: 12px; isolation: isolate;
    padding: 26px 26px 18px; background: var(--surf2); }
  .bgC { position: absolute; inset: -10%; width: 120%; height: 120%; object-fit: cover;
    object-position: center 24%; filter: blur(26px) saturate(1.1) brightness(.44); z-index: -2; }
  .veilC { position: absolute; inset: 0; z-index: -1;
    background: linear-gradient(96deg, rgba(10, 7, 5, .95) 6%, rgba(10, 7, 5, .76) 48%, rgba(10, 7, 5, .28)); }
  /* hàng bìa + chữ: bìa canh đỉnh với tiêu đề, hàng nút canh đáy với bìa */
  .inC { display: grid; grid-template-columns: 172px minmax(0, 1fr); gap: 30px; align-items: stretch; }
  .cvC { position: relative; display: block; align-self: start; border-radius: 6px; overflow: hidden;
    background: var(--surf2);
    box-shadow: 0 24px 40px -22px rgba(0, 0, 0, .95), 0 0 0 1px rgba(255, 243, 230, .13); }
  .cvC img { display: block; width: 100%; aspect-ratio: 2/3; object-fit: cover; object-position: center top; }
  .txtC { display: flex; flex-direction: column; min-width: 0; }
  .txtC h1 { margin-left: -2px; font-family: var(--font-head); font-size: 32px; font-weight: 700; line-height: 1.13;
    letter-spacing: -.024em; color: #fff; text-shadow: 0 2px 20px rgba(0, 0, 0, .5);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .byC { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px;
    font-size: 12.5px; color: rgba(255, 255, 255, .62); }
  .byC i { font-style: normal; opacity: .45; }
  .byC b { color: rgba(255, 255, 255, .9); font-weight: 600; }

  .nwBook { position: absolute; top: 0; right: 9px; z-index: 4; width: 18px; height: 47px;
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
  .actC { display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    margin-top: auto; padding-top: 10px; }

  .synC { margin-top: 14px; max-width: 78ch; }
  .synC p { margin: 0; font-size: 13px; line-height: 1.68; color: rgba(255, 255, 255, .72);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .synMore { display: inline-flex; align-items: center; gap: 3px; margin-top: 5px; padding: 0;
    border: 0; background: none; font: 650 11.5px/1 var(--font); color: var(--acc); cursor: pointer; }
  .synMore svg { width: 9px; height: 9px; }

  .hProg { display: flex; align-items: center; gap: 14px; margin-top: 18px; padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, .13); }
  .hProg span { font: 600 10px/1 var(--font-mono); letter-spacing: .09em; text-transform: uppercase;
    color: rgba(255, 255, 255, .58); white-space: nowrap; }
  .hProg .pb { flex: 1; min-width: 60px; height: 3px; border-radius: 99px;
    background: rgba(255, 255, 255, .15); overflow: hidden; }
  .hProg .pb i { display: block; height: 100%; border-radius: 99px; background: var(--acc); }
  .hProg em { font: 700 10px/1 var(--font-mono); font-style: normal; color: rgba(255, 255, 255, .82); }

  /* ------------------------ hai ký hiệu tách hẳn nhau --------------------- */
  /* 1 · trạng thái = chữ, không hộp */
  .stT { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
    font: 800 9.5px/1 var(--font-mono); letter-spacing: .16em; text-transform: uppercase;
    color: #fff; text-shadow: 0 1px 10px rgba(0, 0, 0, .95); }
  .stT i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .stT.done i { background: #6ce8a5; box-shadow: 0 0 8px #6ce8a5; }
  .stT.run i { background: #ffcb78; box-shadow: 0 0 8px #ffcb78; }
  .stT.soon i { background: #b0a3f5; box-shadow: 0 0 8px #b0a3f5; }

  /* 2 · tuổi = vòng tròn viền, quy ước nhãn kiểm duyệt */
  .ageRing { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, .92); color: #fff;
    font: 800 8.5px/1 var(--font-mono); font-style: normal; letter-spacing: .01em;
    text-shadow: 0 1px 6px rgba(0, 0, 0, .9); }
  .ageRing.onImg { background: rgba(8, 6, 4, .34); }
  .ageRing.corner { position: absolute; right: 8px; bottom: 8px; z-index: 3;
    background: rgba(8, 6, 4, .62); backdrop-filter: blur(4px); }
  .ageRing.cornerTL { position: absolute; left: 8px; top: 8px; z-index: 3;
    background: rgba(8, 6, 4, .58); backdrop-filter: blur(4px);
    box-shadow: 0 2px 10px -2px rgba(0, 0, 0, .8); }

  /* dải mờ đáy bìa */
  .shade { position: absolute; left: 0; right: 0; bottom: 0; height: 44%; z-index: 1;
    background: linear-gradient(0deg, rgba(4, 3, 2, .93) 16%, rgba(4, 3, 2, 0)); }
  .shadeSm { position: absolute; right: 0; bottom: 0; width: 62px; height: 62px; z-index: 1;
    background: radial-gradient(circle at 100% 100%, rgba(4, 3, 2, .62), rgba(4, 3, 2, 0) 70%); }
  .cvBot { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
    display: flex; align-items: center; gap: 8px; padding: 0 9px 8px; }

  /* C2 · tab tối gói gọn */
  .tabSt { position: absolute; left: 0; bottom: 0; z-index: 3; display: inline-flex; align-items: center;
    padding: 7px 11px 8px; border-top-right-radius: 6px; background: rgba(6, 4, 3, .88);
    font: 800 9px/1 var(--font-mono); letter-spacing: .15em; text-transform: uppercase; color: #fff;
    box-shadow: 0 -1px 0 rgba(255, 255, 255, .14); }
  .tabSt::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
    background: currentColor; }
  .tabSt.done { color: #8ff0bb; } .tabSt.run { color: #ffd79a; } .tabSt.soon { color: #cbc1f5; }

  /* C3 · trạng thái ra ngoài cột chữ */
  .stLine { display: inline-flex; align-items: center; gap: 7px; margin-top: 11px; padding-left: 1px;
    font: 800 9px/1 var(--font-mono); letter-spacing: .18em; text-transform: uppercase;
    color: rgba(255, 255, 255, .72); }
  .stLine i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .stLine.done { color: #a9e9c4; } .stLine.run { color: #ffd79a; } .stLine.soon { color: #cbc1f5; }

  /* C4 · nhãn gấp mép */
  .dog { position: absolute; left: 0; bottom: 0; z-index: 3; width: 27px; height: auto; max-height: 74%;
    display: grid; place-items: center; padding: 12px 0 14px;
    background: rgba(6, 4, 3, .9); border-top-right-radius: 6px;
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, .16); }
  .dog::after { content: ""; position: absolute; left: 0; bottom: 0; width: 26px; height: 26px;
    background: linear-gradient(135deg, rgba(255, 255, 255, .16), rgba(255, 255, 255, 0) 62%);
    clip-path: polygon(0 100%, 100% 0, 100% 100%); }
  .dog > b { writing-mode: vertical-rl; text-orientation: mixed; white-space: nowrap;
    font: 800 8.5px/1 var(--font-mono); letter-spacing: .24em; text-transform: uppercase;
    color: #fff; }
  .dog.done > b { color: #a9e9c4; } .dog.run > b { color: #ffd79a; } .dog.soon > b { color: #cbc1f5; }

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
    .txtC h1 { font-size: 26px; }
    .cg4 { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 22px; }
  }
  @container (max-width: 660px) {
    .hC { padding: 18px; }
    .inC { grid-template-columns: 108px minmax(0, 1fr); gap: 14px; align-items: start; }
    .txtC { display: block; }
    .txtC h1 { font-size: 21px; }
    .synC { margin-top: 8px; }
    .synC p { font-size: 12px; }
    .synMore { font-size: 11px; white-space: nowrap; }
    .actC { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 16px; }
    .btnPri, .btnGho { justify-content: center; width: 100%; }
    .stT { font-size: 7px; letter-spacing: .07em; gap: 4px; }
    .stT i { width: 4px; height: 4px; }
    .ageRing { width: 19px; height: 19px; font-size: 7px; border-width: 1px; }
    .ageRing.corner { right: 5px; bottom: 5px; }
    .ageRing.cornerTL { left: 5px; top: 5px; }
    .cvBot { padding: 0 6px 6px; gap: 5px; }
    .shade { height: 48%; }
    .tabSt { font-size: 7px; letter-spacing: .1em; padding: 5px 7px 6px; }
    .stLine { font-size: 7.5px; letter-spacing: .1em; margin-top: 8px; }
    .dog { width: 20px; max-height: 78%; padding: 9px 0 11px; }
    .dog::after { width: 20px; height: 20px; }
    .dog > b { font-size: 7px; letter-spacing: .14em; }
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
<title>ssochuz · badge trên bìa · bốn cách theo quy ước thiết kế</title>
<link rel="stylesheet" href="../home-v2/mock2.css?v=story10">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · badge trên bìa</span>
  <span>tách “trạng thái” và “18+” thành hai loại ký hiệu khác nhau</span>
  <a href="../story-v9/index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← vòng 9</a>
  <a href="../home-v2/index.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">trang chủ</a>
</div>

<div class="wrap">
  <div class="hd">
    <h2>Badge trên bìa — theo quy ước của poster &amp; app đọc truyện</h2>
    <p class="lead">Vấn đề của các bản trước: <b>hai thứ khác loại bị bắt mặc cùng một bộ đồ</b> —
      “Hoàn thành” là trạng thái (chữ), “18+” là nhãn kiểm duyệt (ký hiệu). Tham khảo cách
      poster phim, bìa sách và app đọc truyện làm: <b>trạng thái = chữ nhỏ in hoa</b>,
      <b>tuổi = vòng tròn viền</b> (ký hiệu kiểm duyệt quốc tế, thấy trên mọi poster).</p>
    <p class="note">Bốn bản dưới giữ đúng chỗ của D1 (nửa dưới bìa, chừa băng rôn MỚI góc trên phải) nhưng
      xử lý hai nhãn theo bốn cách khác nhau. Bìa mẫu rất sáng để thử tương phản.</p>
  </div>

  ${opt('C1', 'Chữ + vòng tròn tuổi · hai đầu dải',
    `Đúng quy ước nhất: đáy bìa có <b>chữ trạng thái</b> bên trái (chấm màu phát sáng) và
    <b>vòng tròn 18+</b> bên phải. Hai ký hiệu khác loại nên không tranh nhau.
    <em>Giống cách poster phim đặt nhãn tuổi ở góc và thể loại ở dòng dưới.</em>`,
    body(heroC1))}

  ${opt('C2', 'Tab gói gọn góc trái · vòng tròn góc phải',
    `Trạng thái nằm trên một <b>tab nền mực ôm góc dưới trái</b>, có <b>gờ màu 2px</b> ở cạnh trên —
    đọc như nhãn dán trên kệ sách. 18+ là vòng tròn ở góc đối diện. Không có dải chạy ngang ảnh.`,
    body(heroC2))}

  ${opt('C3', 'Bìa chỉ còn ký hiệu tuổi',
    `Trên bìa <b>chỉ có vòng tròn 18+</b> (góc dưới phải, có quầng tối cục bộ để đọc được).
    Trạng thái <b>rời ra cột chữ</b>, thành một dòng in hoa ngay dưới tên truyện, có chấm màu.
    Bìa sạch nhất có thể mà vẫn đủ thông tin.`,
    body(heroC3))}

  ${opt('C4', 'Nhãn gấp mép · chữ dọc ở gáy dưới',
    `Trạng thái thành <b>nếp gấp giấy</b> ở góc dưới trái: dải mực 26px, chữ dọc, có vệt sáng ở
    đường gấp. 18+ vòng tròn góc phải. Chất “bìa sách thật”, không đụng băng rôn MỚI.`,
    body(heroC4))}
</div>
</body>
</html>
`;

fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, 'index.html'), HTML);
console.log('đã ghi story-v10/index.html ·', Math.round(HTML.length / 1024), 'kB ·', S.t, '· chương', CH);
