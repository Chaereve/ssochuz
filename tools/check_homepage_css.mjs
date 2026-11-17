/* ============================================================================
   Soi CSS thật của màn Homepage mới: bắt lỗi “im lặng” mà jsdom không thấy —
     · lớp dùng trong HTML/JS mà KHÔNG có luật CSS nào (ô trống vô hình)
     · màu literal ngoài :root (phá quy ước “màu chỉ qua biến”)
     · nền/chữ trùng nhau (chữ vô hình) trong các lớp mới
     · lớp mới có khai báo nhưng không được dùng (CSS chết ⇒ nặng gói tải)
   Chạy: node tools/check_homepage_css.mjs     (thoát 1 nếu có lỗi)
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const MOCK = fs.readFileSync(path.join(ROOT, 'mockup/ssochuz-admin-mockup.html'), 'utf8');
const PROD = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

const cssOf = s => {
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out.join('\n');
};

const problems = [];
const mockCss = cssOf(MOCK), prodCss = cssOf(PROD);

/* ---- 1. lớp hp-* / mới dùng trong mã có luật CSS không ---- */
/* Lớp dùng thật: mọi class="…" — cắt phần nối chuỗi ('hp-day'+(on?' on':'')
   thành token riêng, KHÔNG lấy giá trị data-act/data-role (hp-preview,
   hp-reset… là tên hành vi, không phải lớp). */
const usedClasses = new Set();
const addTokens = v => v.split(/["'+(]/).forEach(t =>
  t.split(/\s+/).forEach(c => { if (/^[a-z][a-z0-9-]*$/.test(c)) usedClasses.add(c); }));
for (const m of MOCK.matchAll(/class="([^"]*)"/g)) addTokens(m[1]);
/* lớp truyền qua cover(b, 'hp-pv-thumb') / cover(b,'hp-series-cv') */
for (const m of MOCK.matchAll(/cover\([^,]+,\s*'([a-z0-9-]+)'/g)) usedClasses.add(m[1]);

const declared = new Set();
for (const m of mockCss.matchAll(/\.((?:hp|pv)-[a-z0-9-]+)/g)) declared.add(m[1]);

const newish = [...usedClasses].filter(c => /^hp-/.test(c));
for (const c of newish) {
  if (!declared.has(c)) problems.push(`mockup: lớp .${c} được dùng nhưng KHÔNG có luật CSS`);
}

/* ---- 2. màu literal ngoài :root, chỉ soi khối CSS mới của trang chủ ---- */
const hpCss = (mockCss.match(/\/\* =+\n\s+VÒNG 17[\s\S]*$/) || [''])[0];
if (!hpCss) problems.push('mockup: không tìm thấy khối CSS vòng 17 (đánh dấu bị đổi?)');
for (const m of hpCss.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
  problems.push(`CSS vòng 17 có màu literal ${m[0]} — phải dùng biến :root`);
}

/* ---- 3. .hp-day.on: chữ trên nền --acc phải là --ink (tương phản) ---- */
const dayOn = (hpCss.match(/\.hp-day\.on\{([^}]*)\}/) || [])[1] || '';
if (!/background:var\(--acc\)/.test(dayOn)) problems.push('.hp-day.on không dùng nền --acc');
if (!/color:var\(--ink\)/.test(dayOn)) problems.push('.hp-day.on không dùng chữ --ink (chữ sẽ chìm trên nền hồng)');
const dirty = (hpCss.match(/\.hp-dirty\{([^}]*)\}/) || [])[1] || '';
if (!/color:var\(--acc\)/.test(dirty)) problems.push('.hp-dirty không dùng --acc cho trạng thái “Chưa lưu”');

/* ---- 4. CSS chết: .hp-* khai báo mà không nơi nào dùng ---- */
for (const c of declared) {
  if (usedClasses.has(c)) continue;
  problems.push(`mockup: .${c} có luật CSS nhưng không lớp nào dùng (CSS chết)`);
}

/* ---- 5. bản phát hành không còn dấu vết “MẪU” trong trang chủ ---- */
const hpView = (PROD.match(/VÒNG 17 · Trang chủ[\s\S]*?12 · Thống kê/) || [''])[0];
for (const w of [/MẪU/, /mẫu/]) {
  if (w.test(hpView)) problems.push(`admin.html: màn trang chủ còn chữ “${w.source}” (prototype lọt ra bản thật)`);
}

/* ---- 6. bố cục 2 cột có nhánh hẹp, không tràn ngang ---- */
if (!/@media \(max-width:1240px\)\{[\s\S]{0,160}\.hp-cols\{grid-template-columns:minmax\(0,1fr\)\}/.test(hpCss))
  problems.push('thiếu nhánh @media ≤1240px đưa .hp-cols về 1 cột (màn 13" sẽ tràn ngang)');
if (!/\.hp-row\{[^}]*minmax\(0,1fr\)/.test(hpCss))
  problems.push('.hp-row không dùng minmax(0,1fr) ⇒ tên truyện dài làm tràn ô');
if (!/overflow:hidden/.test(hpCss)) problems.push('thiếu overflow:hidden cho chữ dài ⇒ tràn thẻ');

if (problems.length) {
  console.error('LỖI CSS trang chủ:\n  · ' + problems.join('\n  · '));
  process.exit(1);
}
console.log(`Đạt: ${newish.length} lớp mới đều có CSS, ${declared.size} lớp hp-* không chết, `
  + 'không màu literal, tương phản chip đúng, có nhánh hẹp.');
