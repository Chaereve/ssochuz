#!/usr/bin/env node
/* ============================================================================
   gen-rails.mjs · mockup PHƯƠNG ÁN cho hai mục “Mới cập nhật” và “Chuyển thể Series”
   ----------------------------------------------------------------------------
   Mỗi mục ba kiểu, cùng dữ liệu thật (data/registry.json + assets/covers):
     1A dải bìa cuộn ngang (glvietsubz)    2A dải bìa + nhãn SERIES
     1B bảng gọn ba cột (dạng “vừa lên chương”)  2B thẻ ngang: bìa dọc + chữ
     1C nhóm theo ngày (timeline)          2C băng ngang 16:10 cắt ảnh (glvietsub.org)

   Mốc thời gian của nhãn “x giờ trước” trong mockup là 30/09/2026 (ngày dữ liệu
   mới nhất) để nhãn trông thật; trang thật tính từ `updated` của registry.

   Chạy: node docs/mockups/home-v2/gen-rails.mjs
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

/* FNV-1a 32-bit — cùng hàm với src/shared/cover-mirror.js */
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

const BOOKS = reg.lib.map((b) => ({
  t: b.title,
  s: b.slug,
  a: b.author || '',
  st: b.status || '',
  n: b.chapters || 0,
  e: !!b.is18,
  y: String(b.year || ''),
  u: String(b.updated || ''),
  img: coverOf(b)
}));
const bySlug = (s) => BOOKS.find((b) => b.s === s) || null;

/* ---- “Mới cập nhật”: 18 bộ vừa lên chương, mới nhất trước ---- */
const NOW = Date.parse('2026-09-30T20:00:00');
const agoLabel = (iso, i) => {
  const d = Date.parse(iso + 'T12:00:00');
  const hours = Math.max(1, Math.round((NOW - d) / 36e5));
  if (hours < 10) return `${Math.max(1, hours)} giờ trước`;
  if (hours < 34) return 'Hôm qua';
  const days = Math.round(hours / 24);
  if (days < 8) return `${days} ngày trước`;
  const dd = iso.slice(8, 10), mm = iso.slice(5, 7);
  return `${dd}/${mm}`;
};
const RECENT = BOOKS.slice()
  .sort((a, b) => b.u.localeCompare(a.u) || b.n - a.n)
  .slice(0, 18)
  .map((b, i) => ({ ...b, ago: agoLabel(b.u, i) }));

/* nhãn trạng thái trên bìa: một nhãn duy nhất, đúng kiểu glvietsubz */
const pill = (b) => (b.st === 'Hoàn thành' ? `Trọn bộ ${b.n}` : b.st === 'Sắp ra mắt' ? 'Sắp ra mắt' : `Ch. ${b.n}`);
const pillCls = (b) => (b.st === 'Hoàn thành' ? 'done' : b.st === 'Sắp ra mắt' ? 'soon' : 'run');

/* dựng một thẻ bìa dùng lại đúng .card của mockup (đã có hover “Đọc ngay” kiểu B) */
function card(b, o = {}) {
  return (
    `<a class="card" href="#">` +
      `<div class="cv">` +
        `<img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy">` +
        `<span class="scrim"></span>` +
        (o.noPill ? '' : `<span class="pill ${pillCls(b)}"><i></i>${esc(pill(b))}</span>`) +
        (b.e ? '<span class="badge18">18+</span>' : '') +
        (o.ser ? '<span class="ser">Series</span>' : '') +
      `</div>` +
      `<h3>${esc(b.t)}</h3>` +
      `<div class="sub">${esc(o.sub || b.a || '—')}</div>` +
    `</a>`
  );
}

const head = (title, sub, more) =>
  `<div class="hr"><h2>${title}</h2><span class="hs">${sub}</span>` +
  `<span class="hm">${more} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ` +
  `stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span></div>`;

/* ============================ 1 · MỚI CẬP NHẬT ============================ */

/* 1A · dải bìa cuộn ngang — glvietsubz: một hàng bìa, một nhãn, hai dòng chữ */
const opt1A = `${head('Mới cập nhật', '18 bộ vừa lên chương', 'Xem thêm')}
    <div class="track" style="--n:7">${RECENT.slice(0, 14)
      .map((b) => card(b, { sub: `${b.a} · ${b.ago}` }))
      .join('')}</div>`;

/* 1B · bảng gọn ba cột: bìa nhỏ, tên một dòng, cột phải là chương + lúc cập nhật */
const opt1B = `${head('Mới cập nhật', '18 bộ vừa lên chương', 'Xem thêm')}
    <div class="mlist">${RECENT.slice(0, 12)
      .map(
        (b) =>
          `<a class="mrow" href="#"><img src="${esc(b.img)}" alt="" loading="lazy">` +
          `<span class="mt"><b>${esc(b.t)}</b><span>${esc(b.a)}</span></span>` +
          `<span class="mn"><b>Ch. ${b.n}</b><span>${esc(b.ago)}</span></span></a>`
      )
      .join('')}</div>`;

/* 1C · nhóm theo ngày: nhãn ngày bên trái, mỗi ngày một hàng sáu bìa nhỏ */
const dayGroups = [
  ['Hôm nay', RECENT.slice(0, 6)],
  ['Hôm qua', RECENT.slice(6, 12)],
  ['28/09', RECENT.slice(12, 18)]
];
const opt1C = `${head('Mới cập nhật', '18 bộ vừa lên chương', 'Xem thêm')}
    <div class="days">${dayGroups
      .map(
        ([lab, list]) =>
          `<div class="drow"><span class="dlab">${lab}<em>${list.length}</em></span>` +
          `<div class="dgrid">${list
            .map(
              (b) =>
                `<a class="dmini" href="#"><span class="dcv"><img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy">` +
                `<span class="dpill">${esc(pill(b))}</span></span>` +
                `<b>${esc(b.t)}</b><span class="dm">${esc(b.ago)}</span></a>`
            )
            .join('')}</div></div>`
      )
      .join('')}</div>`;

/* ========================== 2 · CHUYỂN THỂ SERIES ========================= */

const PICK = Array.isArray(reg.settings && reg.settings.editorChoice)
  ? reg.settings.editorChoice
  : [];
const SERIES = PICK.map((s) => bySlug(typeof s === 'string' ? s : s && s.slug)).filter(Boolean);

/* 2A · dải bìa + nhãn SERIES góc trên phải */
const opt2A = `${head('Chuyển thể Series', `${SERIES.length} bộ đã lên sóng`, 'Xem thêm')}
    <div class="track" style="--n:6">${SERIES.slice(0, 12)
      .map((b) => card(b, { ser: true, sub: `${b.a} · ${b.y}` }))
      .join('')}</div>`;

/* 2B · thẻ ngang: bìa dọc bên trái, chữ bên phải — hai cột, không cắt ảnh */
const opt2B = `${head('Chuyển thể Series', `${SERIES.length} bộ đã lên sóng`, 'Xem thêm')}
    <div class="hcards">${SERIES.slice(0, 6)
      .map(
        (b) =>
          `<a class="hcard" href="#"><span class="hcv"><img src="${esc(b.img)}" alt="" loading="lazy">` +
          (b.e ? '<span class="h18">18+</span>' : '') +
          `</span><span class="ht"><b>${esc(b.t)}</b>` +
          `<span class="hk">Chuyển thể · ${esc(b.y)}</span>` +
          `<span class="hm2">${b.n} chương · ${esc(b.st)}</span></span>` +
          `<span class="hgo" aria-hidden="true">›</span></a>`
      )
      .join('')}</div>`;

/* 2C · băng ngang 16:10 cắt ảnh, chữ đè lên — kiểu “Phim AI” của glvietsub.org */
const opt2C = `${head('Chuyển thể Series', `${SERIES.length} bộ đã lên sóng`, 'Xem thêm')}
    <div class="wcards">${SERIES.slice(0, 6)
      .map(
        (b) =>
          `<a class="wcard" href="#"><img src="${esc(b.img)}" alt="${esc(b.t)}" loading="lazy">` +
          `<span class="wsh"></span>` +
          `<span class="wt"><span class="wk">Chuyển thể · ${esc(b.y)}</span>` +
          `<span class="wn">${esc(b.t)}</span>` +
          `<span class="wm">${b.n} chương · ${esc(b.st)}</span></span></a>`
      )
      .join('')}</div>`;

/* -------------------------------- TRANG --------------------------------- */
const CSS = `
  :root { --mk-bg: #0d0b09; }
  body { background: var(--mk-bg); }
  .wrap { max-width: 1216px; margin: 0 auto; padding: 22px 18px 80px; }
  h1 { font-family: var(--font-head); font-size: 23px; margin: 0 0 8px; }
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 6px; max-width: 92ch; }
  .note { color: var(--mut); font-size: 11.5px; margin: 10px 0 0; }
  .opt { border-top: 1px solid var(--bd); margin-top: 34px; padding-top: 20px; }
  .otag { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 6px;
    font: 800 10px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--acc); }
  .otag i { font-style: normal; padding: 3px 7px; border-radius: 5px;
    background: var(--acc-soft); letter-spacing: .06em; }
  .onote { color: var(--dim); font-size: 12px; margin: 0 0 18px; max-width: 96ch; }

  /* đầu mục: giống .sechead của trang thật — tên · phụ đề · “Xem thêm ›” */
  .hr { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
  .hr h2 { font-size: 20px; font-weight: 650; }
  .hs { font-size: 12.5px; color: var(--dim); }
  .hm { margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
    font-size: 12.5px; font-weight: 650; color: var(--mut); white-space: nowrap; }
  .hm svg { width: 11px; height: 11px; }
  .hr + .track { padding-bottom: 8px; }

  /* 1B · bảng gọn ba cột */
  .mlist { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 40px; }
  .mrow { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px;
    align-items: center; padding: 9px 6px 9px 0; border-bottom: 1px solid var(--bd-soft);
    border-radius: 6px; min-width: 0; }
  .mrow:hover { background: rgba(255, 240, 220, .035); }
  .mrow img { width: 34px; height: 48px; object-fit: cover; border-radius: 4px; background: var(--surf2); }
  .mt { min-width: 0; }
  .mt b { display: block; font-size: 13px; font-weight: 650; line-height: 1.35; color: var(--txt);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mrow:hover .mt b { color: var(--acc); }
  .mt span { display: block; font-size: 11px; color: var(--dim); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .mn { text-align: right; }
  .mn b { display: block; font: 700 11px/1 var(--font-mono); color: var(--mut); }
  .mn span { display: block; margin-top: 5px; font: 500 10px/1 var(--font-mono); color: var(--dim); }

  /* 1C · nhóm theo ngày */
  .days { display: flex; flex-direction: column; }
  .drow { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 20px;
    padding: 14px 0; border-top: 1px solid var(--bd-soft); align-items: start; }
  .drow:first-child { border-top: 0; padding-top: 0; }
  .dlab { display: flex; align-items: baseline; gap: 7px; padding-top: 2px;
    font: 700 10px/1 var(--font-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--mut); }
  .dlab em { font-style: normal; font: 600 10px/1 var(--font-mono); letter-spacing: 0; color: var(--dim); }
  .dgrid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; }
  .dmini { min-width: 0; }
  .dcv { position: relative; display: block; aspect-ratio: 2/3; border-radius: 5px; overflow: hidden;
    background: var(--surf2); transition: transform .18s ease, box-shadow .18s ease; }
  .dcv img { width: 100%; height: 100%; object-fit: cover; }
  .dmini:hover .dcv { transform: translateY(-2px); box-shadow: 0 12px 22px -16px #000; }
  .dpill { position: absolute; left: 5px; bottom: 5px; max-width: calc(100% - 10px);
    padding: 3px 6px; border-radius: 4px; background: rgba(12, 9, 6, .84);
    border: 1px solid rgba(255, 255, 255, .14); color: #fff;
    font: 700 8.5px/1 var(--font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dmini b { display: block; margin-top: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.35;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--txt); }
  .dmini:hover b { color: var(--acc); }
  .dmini .dm { display: block; margin-top: 2px; font: 500 9.5px/1.3 var(--font-mono); color: var(--dim); }

  /* 2A · nhãn SERIES trên bìa */
  .ser { position: absolute; top: 8px; right: 8px; z-index: 3; height: 18px; padding: 0 6px;
    display: inline-flex; align-items: center; border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, .42); background: rgba(12, 9, 6, .6);
    color: #fff; font: 800 8.5px/1 var(--font); letter-spacing: .09em; text-transform: uppercase; }

  /* 2B · thẻ ngang: bìa dọc + chữ */
  .hcards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 40px; }
  .hcard { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 14px;
    align-items: center; padding: 8px 10px 8px 0; border-radius: 8px; min-width: 0;
    border-bottom: 1px solid var(--bd-soft); transition: background-color .15s ease; }
  .hcard:hover { background: rgba(255, 240, 220, .035); }
  .hcv { position: relative; display: block; width: 64px; height: 96px; border-radius: 5px;
    overflow: hidden; background: var(--surf2); transition: transform .18s ease; }
  .hcard:hover .hcv { transform: translateY(-2px); }
  .hcv img { width: 100%; height: 100%; object-fit: cover; }
  .h18 { position: absolute; top: 4px; right: 4px; padding: 1px 4px; border-radius: 3px;
    background: #c2475a; color: #fff; font: 800 8px/1.5 var(--font); }
  .ht { min-width: 0; }
  .ht b { display: -webkit-box; font-size: 13.5px; font-weight: 650; line-height: 1.38;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .hcard:hover .ht b { color: var(--acc); }
  .hk { display: block; margin-top: 4px; font: 700 9.5px/1 var(--font-mono);
    letter-spacing: .08em; text-transform: uppercase; color: var(--acc); }
  .hm2 { display: block; margin-top: 6px; font-size: 11px; color: var(--dim); }
  .hgo { color: var(--dim); font-size: 17px; line-height: 1; transition: transform .18s ease, color .18s ease; }
  .hcard:hover .hgo { color: var(--acc); transform: translateX(3px); }

  /* 2C · băng ngang 16:10 cắt ảnh */
  .wcards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .wcard { position: relative; display: block; aspect-ratio: 16/10; border-radius: 9px;
    overflow: hidden; background: var(--surf2); }
  .wcard img { position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; object-position: center 26%; transition: transform .4s ease; }
  .wcard:hover img { transform: scale(1.04); }
  .wsh { position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(10, 7, 5, 0) 32%, rgba(10, 7, 5, .86) 100%); }
  .wt { position: absolute; left: 11px; right: 11px; bottom: 9px; display: block; }
  .wk { display: block; font: 800 8.5px/1 var(--font-mono); letter-spacing: .12em;
    text-transform: uppercase; color: var(--acc); }
  .wn { display: -webkit-box; margin-top: 5px; font-size: 13.5px; font-weight: 650; line-height: 1.3;
    color: #fff; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    overflow-wrap: anywhere; text-shadow: 0 1px 10px rgba(0, 0, 0, .6); }
  .wm { display: block; margin-top: 4px; font: 500 10px/1.3 var(--font-mono); color: rgba(255, 255, 255, .72); }

  @media (max-width: 900px) {
    .mlist { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 26px; }
    .dgrid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .hcards { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .wcards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 620px) {
    .mlist { grid-template-columns: minmax(0, 1fr); }
    .drow { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .dgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .wcards { grid-template-columns: minmax(0, 1fr); }
  }
`;

const opt = (id, tag, title, note, html) =>
  `<section class="opt">
    <span class="otag"><i>${id}</i>${title}</span>
    <p class="onote">${note}</p>
    ${html}
  </section>`;

const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · phương án cho “Mới cập nhật” và “Chuyển thể Series”</title>
<link rel="stylesheet" href="mock2.css?v=rails1">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · phương án hai mục</span>
  <span>Mới cập nhật · Chuyển thể Series</span>
  <a href="index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← trang chính</a>
  <a href="hover.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">nút rê chuột</a>
</div>

<div class="wrap">
  <h1>Hai mục đang cần làm lại</h1>
  <p class="lead">Mỗi mục ba kiểu, đặt đúng khổ 1180px của trang thật, cùng dữ liệu và bìa thật
    (67 bộ · 12 bộ thuộc “Chuyển thể Series”). Bạn chỉ cần chọn số, ví dụ <b>1B · 2B</b>.</p>
  <p class="note">Nhãn thời gian (“2 giờ trước”, “Hôm qua”) tính theo mốc 30/09/2026 — ngày dữ liệu mới nhất —
    để nhìn cho thật; trang thật sẽ tự tính từ mốc cập nhật của từng bộ.</p>

  ${opt(
    '1A',
    'Dải bìa cuộn ngang',
    'glvietsubz',
    'Một hàng bìa cuộn ngang, mỗi bìa MỘT nhãn duy nhất (“Ch. 42” / “Trọn bộ 10”), dưới là tên và dòng “tác giả · 2 giờ trước”. Gọn nhất, quen mắt nhất, nhưng không cho thấy mục này mới đến mức nào.',
    opt1A
  )}

  ${opt(
    '1B',
    'Bảng gọn ba cột',
    'dạng “vừa lên chương”',
    'Mười hai dòng, ba cột: bìa nhỏ 34×48, tên một dòng, cột phải là <b>Ch. 42</b> và <b>2 giờ trước</b> canh phải. Mật độ cao nhất — nhìn một màn là biết bộ nào vừa lên chương, mà không cần cuộn ngang.',
    opt1B
  )}

  ${opt(
    '1C',
    'Nhóm theo ngày',
    'timeline',
    'Nhãn ngày bên trái (Hôm nay · Hôm qua · 28/09), mỗi ngày một hàng sáu bìa nhỏ. Đọc được “hôm nay có gì mới” trong một cái liếc; vẫn giữ hình bìa để nhận ra truyện. Cao hơn hai kiểu trên khoảng 120px.',
    opt1C
  )}

  ${opt(
    '2A',
    'Dải bìa + nhãn Series',
    'glvietsubz',
    'Giống dải bìa thường nhưng thêm nhãn <b>SERIES</b> ở góc trên phải bìa — nhìn là biết đây là truyện đã chuyển thể, không lẫn với các dải khác. An toàn, đồng bộ với cả trang.',
    opt2A
  )}

  ${opt(
    '2B',
    'Thẻ ngang: bìa dọc + chữ',
    'hai cột',
    'Bìa dọc giữ nguyên (không cắt ảnh), bên phải là tên hai dòng, nhãn “CHUYỂN THỂ · 2026” màu son, và số chương + tình trạng. Sáu bộ vừa một khối gọn, đọc như một danh sách biên tập.',
    opt2B
  )}

  ${opt(
    '2C',
    'Băng ngang 16:10',
    'kiểu “Phim AI” của glvietsub.org',
    'Ba tấm ảnh ngang mỗi hàng, chữ đè lên chân ảnh — đúng chất trang phim, khác hẳn các dải bìa dọc. Lưu ý: bìa của mình là ảnh dọc nên phải cắt giữa, mặt nhân vật có thể bị cắt; chỉ nên chọn nếu bạn thấy ổn.',
    opt2C
  )}
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'rails.html'), HTML);
console.log(
  'đã ghi rails.html ·', Math.round(HTML.length / 1024), 'kB ·',
  'mới cập nhật', RECENT.length, '· chuyển thể', SERIES.length,
  '· bìa thiếu', RECENT.concat(SERIES).filter((b) => !b.img).length
);
