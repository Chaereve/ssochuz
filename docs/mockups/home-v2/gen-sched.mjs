#!/usr/bin/env node
/* ============================================================================
   gen-sched.mjs · mockup PHƯƠNG ÁN cho mục “Lịch ra chương”
   ----------------------------------------------------------------------------
   Dữ liệu thật: data/registry.json → schedule.items (6 bộ) + bìa thật.
   Tuần minh hoạ: 26/10 – 01/11/2026 (hôm nay = Thứ 6, 30/10/2026).

     1 · Bảng tuần 7 cột      — mỗi ngày một cột mảnh, hôm nay tô son
     2 · Hàng đợi hai cột     — 6 dòng, mỗi dòng một bộ, gọn nhất
     3 · Hôm nay nổi bật      — bộ ra hôm nay to bên trái, cả tuần bên phải

   Chạy: node docs/mockups/home-v2/gen-sched.mjs
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

/* -------------------------------- dữ liệu -------------------------------- */
const by = {};
reg.lib.forEach((b) => { by[b.slug] = b; });

/* nhãn ngày → các thứ trong tuần (0 = CN) */
const DAYS = [
  { k: 1, l: 'Thứ 2', d: '26/10' },
  { k: 2, l: 'Thứ 3', d: '27/10' },
  { k: 3, l: 'Thứ 4', d: '28/10' },
  { k: 4, l: 'Thứ 5', d: '29/10' },
  { k: 5, l: 'Thứ 6', d: '30/10' },
  { k: 6, l: 'Thứ 7', d: '31/10' },
  { k: 0, l: 'CN', d: '01/11' }
];
const TODAY = 5; /* Thứ 6 */
const dayKeys = (label) => {
  const s = String(label || '');
  const out = [];
  [['Thứ 2', 1], ['Thứ 3', 2], ['Thứ 4', 3], ['Thứ 5', 4], ['Thứ 6', 5], ['Thứ 7', 6]]
    .forEach(([t, k]) => { if (s.includes(t)) out.push(k); });
  if (/\bCN\b|Chủ nhật/i.test(s)) out.push(0);
  return out;
};

const ITEMS = (reg.schedule.items || []).map((it) => {
  const b = by[it.slug] || {};
  return {
    title: it.title || b.title || '',
    slug: it.slug,
    detail: it.detail || '',
    days: dayKeys(it.days),
    dayLabel: it.days || '',
    img: coverOf(b),
    ch: b.chapters || 0,
    st: b.status || '',
    u: String(b.updated || '')
  };
});
const onDay = (k) => ITEMS.filter((it) => it.days.includes(k));
const NOW = ITEMS.filter((it) => it.days.includes(TODAY));
const NOTE = (reg.schedule.note || '').trim();
const dayLong = (k) => (k === 0 ? 'Chủ nhật' : 'Thứ ' + (k + 1));

/* phần đuôi mỗi dòng: số chương + tình trạng (detail nếu có thì ưu tiên) */
const meta = (it) => {
  const bits = [];
  if (it.detail) bits.push(it.detail);
  if (it.ch) bits.push(it.ch + ' chương');
  if (it.st) bits.push(it.st);
  return bits.join(' · ') || 'Chưa có chương';
};

const pillKind = (it) => (it.st === 'Hoàn thành' ? 'done' : it.st === 'Sắp ra mắt' ? 'soon' : 'run');

/* ============================== PHƯƠNG ÁN 1 ============================== */
const opt1 = `<div class="wk">${DAYS.map((d) => {
  const list = onDay(d.k);
  const today = d.k === TODAY;
  return (
    `<div class="wcol${today ? ' now' : ''}${list.length ? '' : ' off'}">` +
      `<div class="wd"><span class="wn2">${d.l}</span><span class="wd2">${d.d}</span>` +
      (today ? '<span class="wnow">hôm nay</span>' : '') + `</div>` +
      (list.length
        ? list.map((it) =>
            `<a class="witem" href="#">` +
              (it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : '<span class="wph"></span>') +
              `<span class="wt2"><b>${esc(it.title)}</b><span>${esc(meta(it))}</span></span>` +
            `</a>`
          ).join('')
        : '<span class="wnone">—</span>') +
    `</div>`
  );
}).join('')}</div>
${NOTE ? `<p class="snote">${esc(NOTE)}</p>` : ''}`;

/* ============================== PHƯƠNG ÁN 2 ============================== */
const opt2 = `<div class="q2">${DAYS.flatMap((d) =>
  onDay(d.k).map((it) => {
    const today = d.k === TODAY;
    return (
      `<a class="qrow${today ? ' now' : ''}" href="#">` +
        `<span class="qday">${d.l.replace('Thứ ', 'T')}${d.k === 0 ? 'CN' : ''}` +
        `<em>${d.d}</em>` + (today ? '<i>hôm nay</i>' : '') + `</span>` +
        (it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : '<span class="qph"></span>') +
        `<span class="qt"><b>${esc(it.title)}</b><span>${esc(meta(it))}</span></span>` +
        `<span class="qst ${pillKind(it)}">${esc(it.st || 'Đang cập nhật')}</span>` +
      `</a>`
    );
  })
).join('')}</div>
${NOTE ? `<p class="snote">${esc(NOTE)}</p>` : ''}`;

/* ============================== PHƯƠNG ÁN 3 ============================== */
const hero = NOW[0] || ITEMS.find((it) => it.days.some((k) => k > TODAY)) || ITEMS[0];
const heroDay = hero ? hero.days.find((k) => k === TODAY) : TODAY;
const rest = ITEMS.filter((it) => it !== hero);
const opt3 = `<div class="feat">
  <a class="fcard" href="#">
    ${hero.img ? `<img src="${esc(hero.img)}" alt="" loading="lazy">` : ''}
    <span class="fsh"></span>
    <span class="fx">
      <span class="fk">${heroDay === TODAY ? 'Ra hôm nay' : 'Ra ' + dayLong(heroDay)} · ${(DAYS.find((d) => d.k === heroDay) || {}).d || ''}</span>
      <span class="fn">${esc(hero.title)}</span>
      <span class="fm">${esc(meta(hero))}</span>
    </span>
  </a>
  <div class="flist">${rest.map((it) => {
    const k = it.days[0];
    const today = it.days.includes(TODAY);
    return (
      `<a class="frow${today ? ' now' : ''}" href="#">` +
        `<span class="fd">${k === 0 ? 'CN' : 'T' + (k + 1)}</span>` +
        (it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : '') +
        `<span class="ft"><b>${esc(it.title)}</b><span>${esc(it.dayLabel)} · ${esc(meta(it))}</span></span>` +
      `</a>`
    );
  }).join('')}</div>
</div>
${NOTE ? `<p class="snote">${esc(NOTE)}</p>` : ''}`;

/* --------------------------------- CSS ---------------------------------- */
const CSS = `
  body { background: #0d0b09; }
  .wrap { max-width: 1216px; margin: 0 auto; padding: 22px 18px 80px; }
  h1 { font-family: var(--font-head); font-size: 23px; margin: 0 0 8px; }
  .lead { color: var(--dim); font-size: 12.5px; margin: 0 0 6px; max-width: 94ch; }
  .note { color: var(--mut); font-size: 11.5px; margin: 10px 0 0; }
  .opt { border-top: 1px solid var(--bd); margin-top: 34px; padding-top: 20px; }
  .otag { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 6px;
    font: 800 10px/1 var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--acc); }
  .otag i { font-style: normal; padding: 3px 7px; border-radius: 5px; background: var(--acc-soft);
    letter-spacing: .06em; }
  .onote { color: var(--dim); font-size: 12px; margin: 0 0 18px; max-width: 96ch; }
  .onote b { color: var(--mut); font-weight: 650; }
  /* đầu mục giống .sechead của trang thật */
  .hr { display: flex; align-items: baseline; gap: 10px; padding-bottom: 12px;
    border-bottom: 1px solid var(--bd); margin-bottom: 16px; }
  .hr h2 { font-size: 20px; font-weight: 650; }
  .hs { font-size: 12.5px; color: var(--dim); }
  .hm { margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
    font-size: 12.5px; font-weight: 650; color: var(--mut); white-space: nowrap; }
  .hm svg { width: 11px; height: 11px; }
  .snote { margin: 12px 0 0; font-size: 11.5px; color: var(--dim); }

  /* ---- 1 · bảng tuần 7 cột ---- */
  .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr));
    border-top: 1px solid var(--bd-soft); }
  .wcol { min-width: 0; padding: 12px 12px 14px; border-right: 1px solid var(--bd-soft); }
  .wcol:last-child { border-right: 0; }
  .wcol.now { background: color-mix(in srgb, var(--acc) 5%, transparent); }
  .wd { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 11px;
    padding-bottom: 9px; border-bottom: 1px solid var(--bd-soft); }
  .wn2 { font: 700 9.5px/1 var(--font-mono); letter-spacing: .12em; text-transform: uppercase;
    color: var(--mut); }
  .wd2 { font: 600 10.5px/1 var(--font-mono); color: var(--dim); }
  .wnow { margin-left: auto; font: 700 8.5px/1 var(--font-mono); letter-spacing: .06em;
    text-transform: uppercase; color: var(--acc); }
  .wcol.now .wn2, .wcol.now .wd2 { color: var(--acc); }
  .witem { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 9px;
    align-items: start; min-width: 0; padding: 3px 0; }
  .witem + .witem { margin-top: 8px; }
  .witem img, .wph { width: 32px; aspect-ratio: 2/3; object-fit: cover; border-radius: 4px;
    background: var(--surf2); }
  .wt2 { min-width: 0; }
  .wt2 b { display: -webkit-box; font-size: 11.5px; font-weight: 600; line-height: 1.32;
    color: var(--txt); -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    overflow-wrap: anywhere; transition: color .15s ease; }
  .witem:hover .wt2 b { color: var(--acc); }
  .wt2 span { display: block; margin-top: 3px; font: 500 9px/1.3 var(--font-mono);
    color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wcol.off .wnone { display: block; padding: 2px 0; font-size: 12px; color: var(--dim); }

  /* ---- 2 · hàng đợi hai cột ---- */
  .q2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 44px; }
  .qrow { display: grid; grid-template-columns: 42px 34px minmax(0, 1fr) auto; gap: 12px;
    align-items: center; min-width: 0; padding: 11px 0;
    border-bottom: 1px solid var(--bd-soft); }
  .qrow.now { box-shadow: inset 2px 0 0 var(--acc); padding-left: 10px; }
  .qday { display: block; font: 700 10px/1 var(--font-mono); letter-spacing: .1em;
    text-transform: uppercase; color: var(--mut); }
  .qday em { display: block; margin-top: 4px; font-style: normal; font: 500 9.5px/1 var(--font-mono);
    color: var(--dim); }
  .qrow.now .qday, .qrow.now .qday em { color: var(--acc); }
  .qday i { display: block; margin-top: 5px; font-style: normal; font: 700 8px/1 var(--font-mono);
    letter-spacing: .06em; text-transform: uppercase; color: var(--acc); }
  .qrow img, .qph { width: 34px; aspect-ratio: 2/3; object-fit: cover; border-radius: 4px;
    background: var(--surf2); }
  .qt { min-width: 0; }
  .qt b { display: block; font-size: 13.5px; font-weight: 650; line-height: 1.35; color: var(--txt);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color .15s ease; }
  .qrow:hover .qt b { color: var(--acc); }
  .qt span { display: block; margin-top: 3px; font-size: 11px; color: var(--dim);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qst { font: 700 9px/1 var(--font-mono); letter-spacing: .06em; text-transform: uppercase;
    white-space: nowrap; }
  .qst.run { color: var(--mut); }
  .qst.done { color: var(--ok); }
  .qst.soon { color: #b9b2d6; }

  /* ---- 3 · hôm nay nổi bật ---- */
  .feat { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 34px;
    align-items: stretch; }
  .fcard { position: relative; display: block; min-height: 214px; border-radius: 10px;
    overflow: hidden; background: var(--surf2); }
  .fcard img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    object-position: center 22%; transition: transform .4s ease; }
  .fcard:hover img { transform: scale(1.03); }
  .fsh { position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(10,7,5,.94) 0%, rgba(10,7,5,.72) 46%, rgba(10,7,5,.15) 100%); }
  .fx { position: absolute; left: 20px; bottom: 18px; right: 40%; display: block; }
  .fk { display: block; font: 800 9px/1 var(--font-mono); letter-spacing: .13em;
    text-transform: uppercase; color: var(--acc); }
  .fn { display: block; margin-top: 7px; font-family: var(--font-head); font-size: 21px;
    font-weight: 700; line-height: 1.24; color: #fff; text-shadow: 0 2px 16px rgba(0,0,0,.6); }
  .fm { display: block; margin-top: 7px; font: 500 10.5px/1.4 var(--font-mono);
    color: rgba(255,255,255,.74); }
  .flist { display: flex; flex-direction: column; }
  .frow { display: grid; grid-template-columns: 34px 30px minmax(0, 1fr); gap: 12px;
    align-items: center; min-width: 0; padding: 10px 0; border-bottom: 1px solid var(--bd-soft); }
  .frow:first-child { padding-top: 0; }
  .frow:last-child { border-bottom: 0; padding-bottom: 0; }
  .frow img { width: 30px; aspect-ratio: 2/3; object-fit: cover; border-radius: 4px;
    background: var(--surf2); }
  .fd { font: 700 9.5px/1 var(--font-mono); letter-spacing: .1em; text-transform: uppercase;
    color: var(--mut); }
  .frow.now .fd { color: var(--acc); }
  .ft { min-width: 0; }
  .ft b { display: block; font-size: 12.5px; font-weight: 650; line-height: 1.35; color: var(--txt);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .frow:hover .ft b { color: var(--acc); }
  .ft span { display: block; margin-top: 2px; font-size: 10.5px; color: var(--dim);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  @media (max-width: 960px) {
    .wk { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .wcol:nth-child(4n) { border-right: 0; }
    .q2 { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .feat { grid-template-columns: minmax(0, 1fr); gap: 22px; }
    .fcard { min-height: 180px; }
    .fx { right: 30%; }
  }
  @media (max-width: 620px) {
    .wk { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .wcol:nth-child(2n) { border-right: 0; }
    .qrow { grid-template-columns: 38px 32px minmax(0, 1fr); }
    .qst { grid-column: 3; margin-top: 4px; }
  }
`;

const opt = (id, tag, title, note, html) =>
  `<section class="opt">
    <span class="otag"><i>${id}</i>${title}${tag ? ' · ' + tag : ''}</span>
    <p class="onote">${note}</p>
    <div class="hr"><h2>Lịch ra chương</h2><span class="hs">${ITEMS.length} bộ · tuần này</span>
      <span class="hm">Cả tuần
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
          stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span></div>
    ${html}
  </section>`;

const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ssochuz · phương án cho “Lịch ra chương”</title>
<link rel="stylesheet" href="mock2.css?v=sched1">
<style>${CSS}</style>
</head>
<body>

<div class="mkbar">
  <span class="ttl">ssochuz · lịch ra chương</span>
  <span>3 phương án · dữ liệu thật 6 bộ</span>
  <a href="index.html" style="margin-left:auto;color:var(--mut);text-decoration:underline;text-underline-offset:3px">← trang chính</a>
  <a href="rails.html" style="color:var(--mut);text-decoration:underline;text-underline-offset:3px">phương án 2 mục</a>
</div>

<div class="wrap">
  <h1>Lịch ra chương — ba cách bày</h1>
  <p class="lead">Dữ liệu thật từ <b>registry.schedule</b>: 6 bộ, mỗi bộ một thứ (bộ cuối phủ cả
    Thứ 7 và CN). Tuần minh hoạ 26/10 – 01/11/2026, “hôm nay” là Thứ 6 30/10.</p>
  <p class="note">Sáu bộ, nhưng bộ cuối phủ cả Thứ 7 và CN nên bảy ngày đều có lịch. Ngày nào trống
    thì mỗi phương án xử lý khác nhau (dấu “—”, hoặc ẩn hẳn dòng). Bạn chọn số, ví dụ <b>2</b>.</p>

  ${opt('1', 'bảng tuần 7 cột', 'Bảng tuần',
    'Bảy cột mảnh, mỗi ngày một cột: thứ + ngày ở trên, dưới là bìa nhỏ 32px và tên hai dòng. ' +
    'Cột hôm nay tô son nhạt, chữ ngày màu son. Ngày trống hiện dấu “—” chứ không phải ô rỗng. ' +
    '<b>Ưu:</b> thấy cả tuần trong một cái liếc, đúng nghĩa “lịch”. <b>Nhược:</b> cột hẹp nên tên bị cắt 2 dòng.',
    opt1)}

  ${opt('2', 'hàng đợi hai cột', 'Danh sách theo ngày',
    'Sáu dòng chia hai cột (3 + 3): nhãn thứ + ngày bên trái, bìa 34px, tên một dòng và dòng phụ ' +
    '(số chương · tình trạng), cuối dòng là nhãn tình trạng. Dòng của hôm nay có vạch son bên trái. ' +
    '<b>Ưu:</b> gọn nhất, không có ô trống nào, cùng nhịp với bảng “Mới cập nhật” bạn vừa chốt. ' +
    '<b>Nhược:</b> không thấy “tuần” như một tờ lịch.',
    opt2)}

  ${opt('3', 'hôm nay nổi bật', 'Tiêu điểm hôm nay',
    'Bên trái là bộ ra hôm nay, ảnh lớn 214px, chữ đè trên nền tối (nhãn “RA HÔM NAY · 30/10”). ' +
    'Bên phải là năm bộ còn lại, mỗi dòng một bộ kèm thứ. ' +
    '<b>Ưu:</b> có điểm nhấn, khác hẳn các mục khác. <b>Nhược:</b> hôm nay không có bộ nào thì phải ' +
    'lấy bộ kế tiếp và đổi nhãn thành “Ra Thứ 7” (mình đã xử lý sẵn).',
    opt3)}
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(HERE, 'schedule.html'), HTML);
console.log('đã ghi schedule.html ·', Math.round(HTML.length / 1024), 'kB ·',
  'mục lịch', ITEMS.length, '· hôm nay', NOW.length, '· bìa thiếu', ITEMS.filter((i) => !i.img).length);
