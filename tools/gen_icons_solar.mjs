/* ============================================================================
   gen_icons_solar.mjs · sinh khối icon P trong src/cz-app.js từ bộ SOLAR
   ----------------------------------------------------------------------------
   Nguồn: iconbuddy.com/solar → bộ gốc "Solar" của 480 Design, giấy phép
   CC BY 4.0 (ghi công ở chân trang + src/README.md). Bản máy đọc được lấy qua
   npm: @iconify-json/solar (cùng nội dung trang IconBuddy, có đủ biến thể
   linear / bold / outline / broken — ở đây dùng **-linear** cho khớp nét mảnh
   của giao diện).

   Vì sao có công cụ thay vì dán tay: 72 icon, lần sau muốn đổi biến thể
   (linear → bold) chỉ cần sửa MAP rồi chạy lại:

     npm install
     node tools/gen_icons_solar.mjs
     npm run build && node tests/run.js

   Hai icon thương hiệu Google / MoMo không có trong bộ Solar nên công cụ đọc
   lại bản vẽ tay đang có trong mã rồi chèn vào đúng chỗ.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const solar = require('@iconify-json/solar/icons.json');

/* khoá trong web → tên icon Solar (đều là biến thể -linear) */
const MAP = {
  search: 'magnifier-linear',
  book: 'book-linear',
  library: 'library-linear',
  home: 'home-linear',
  trophy: 'cup-star-linear',
  calendar: 'calendar-linear',
  film: 'clapperboard-linear',
  tv: 'tv-linear',
  users: 'users-group-rounded-linear',
  pen: 'pen-linear',
  play: 'play-linear',
  bookmark: 'bookmark-linear',
  shelf: 'book-bookmark-minimalistic-linear',
  user: 'user-linear',
  logout: 'logout-2-linear',
  shield: 'shield-linear',
  pulse: 'pulse-linear',
  inbox: 'inbox-line-linear',
  history: 'history-linear',
  wand: 'magic-wand-linear',
  heart: 'heart-linear',
  share: 'share-linear',
  check: 'check-circle-linear',
  moon: 'moon-linear',
  sun: 'sun-linear',
  x: 'close-linear',
  star: 'star-linear',
  fire: 'fire-linear',
  list: 'list-linear',
  left: 'alt-arrow-left-linear',
  right: 'alt-arrow-right-linear',
  up: 'alt-arrow-up-linear',
  down: 'alt-arrow-down-linear',
  gear: 'settings-linear',
  expand: 'maximize-linear',
  thumb: 'like-linear',
  chat: 'chat-round-line-linear',
  alert: 'danger-triangle-linear',
  eye: 'eye-linear',
  clock: 'clock-circle-linear',
  menu: 'hamburger-menu-linear',
  plus: 'add-linear',
  trash: 'trash-bin-minimalistic-linear',
  edit: 'pen-new-square-linear',
  refresh: 'refresh-linear',
  download: 'download-linear',
  upload: 'upload-linear',
  cloud: 'cloud-linear',
  key: 'key-linear',
  lock: 'lock-linear',
  link: 'link-linear',
  filter: 'filter-linear',
  grid: 'widget-linear',
  rows: 'list-vertical-linear',
  info: 'info-circle-linear',
  cloud2: 'cloud-cross-linear',
  chart: 'chart-linear',
  save: 'diskette-linear',
  sparkle: 'stars-linear',
  clock2: 'clock-square-linear',
  mail: 'letter-linear',
  heart_hand: 'hand-heart-linear',
  donate: 'hand-money-linear',
  copy: 'copy-linear',
  pencil: 'pen-2-linear',
  book_open: 'book-2-linear',
  user_circle: 'user-circle-linear',
  lock_open: 'lock-keyhole-unlocked-linear',
  hourglass: 'hourglass-linear',
  shield_off: 'shield-cross-linear',
};
/* ---- chuẩn hoá cỡ hình -----------------------------------------------------
   Solar vẽ trên lưới 24 nhưng độ "đầy khung" mỗi icon một khác: mũi tên chỉ
   chiếm 15,5 đơn vị, dấu × 15,5, còn đa số 21,5 — để nguyên thì mũi tên và nút
   đóng trông nhỏ hẳn so với các icon khác. Vì vậy mỗi icon được ĐO hộp mực rồi
   bù lại: phóng/thu về ~20,6 đơn vị và dời về giữa khung 24.
   Bảng dưới là kết quả đo (render 96px bằng sharp rồi tìm pixel có mực):
   [hệ số phóng, tâm x, tâm y]. Nét vẽ được chia ngược cho hệ số phóng nên mọi
   icon vẫn mảnh đúng 1,5 đơn vị — không icon nào dày hơn icon nào.
   Cần đo lại (khi đổi bộ icon khác): node tools/measure_icons.mjs */
const NORM = {
  search: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  book: [0.958, 12, 12],  /* hộp mực 17.5×21.5 */
  library: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  home: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  trophy: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  calendar: [0.958, 12, 12.25],  /* hộp mực 21.5×21 */
  film: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  tv: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  users: [1.005, 11.5, 11.5],  /* hộp mực 20.5×20.5 */
  pen: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  play: [0.958, 12.5, 12],  /* hộp mực 20.5×21.5 */
  bookmark: [0.958, 12, 12],  /* hộp mực 19.5×21.5 */
  shelf: [0.958, 12, 12],  /* hộp mực 17.5×21.5 */
  user: [0.958, 12, 12],  /* hộp mực 17.5×21.5 */
  logout: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  shield: [0.958, 12, 12],  /* hộp mực 19.5×21.5 */
  pulse: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  inbox: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  history: [1.056, 12, 12],  /* hộp mực 19.5×19.5 */
  wand: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  heart: [0.958, 12, 11.88],  /* hộp mực 21.5×18.8 */
  share: [1.056, 11.5, 12],  /* hộp mực 16.5×19.5 */
  check: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  moon: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  sun: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  x: [1.16, 12, 12],  /* hộp mực 15.5×15.5 */
  star: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  fire: [1.005, 11.5, 12.5],  /* hộp mực 18.5×20.5 */
  list: [1.16, 12, 12],  /* hộp mực 17.5×11.5 */
  left: [1.16, 12, 12],  /* hộp mực 7.5×15.5 */
  right: [1.16, 12, 12],  /* hộp mực 7.5×15.5 */
  up: [1.16, 12, 12],  /* hộp mực 15.5×7.5 */
  down: [1.16, 12, 12],  /* hộp mực 15.5×7.5 */
  gear: [0.958, 12, 12],  /* hộp mực 20.5×21.5 */
  expand: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  thumb: [0.958, 12, 12],  /* hộp mực 19.5×21.5 */
  chat: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  alert: [0.958, 12, 12],  /* hộp mực 21.5×19.5 */
  eye: [0.958, 12, 12],  /* hộp mực 21.5×17.5 */
  clock: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  menu: [1.16, 12, 12],  /* hộp mực 17.5×11.5 */
  plus: [1.16, 12, 12],  /* hộp mực 17.5×17.5 */
  trash: [1.005, 12, 11.5],  /* hộp mực 18.5×20.5 */
  edit: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  refresh: [0.958, 12, 12],  /* hộp mực 21.5×19.5 */
  download: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  upload: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  cloud: [0.958, 12, 12],  /* hộp mực 21.5×17.5 */
  key: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  lock: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  link: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  filter: [0.958, 12, 12],  /* hộp mực 21.5×19.5 */
  grid: [1.005, 12, 12],  /* hộp mực 20.5×20.5 */
  rows: [1.16, 12, 12],  /* hộp mực 17.5×17.5 */
  info: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  cloud2: [0.958, 12, 11.75],  /* hộp mực 21.5×19 */
  chart: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  save: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  sparkle: [1.056, 12, 12],  /* hộp mực 19.5×19.5 */
  clock2: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  mail: [0.958, 12, 12],  /* hộp mực 21.5×17.5 */
  heart_hand: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  donate: [0.958, 12, 12.5],  /* hộp mực 21.5×20.5 */
  copy: [0.958, 12, 12],  /* hộp mực 19.5×21.5 */
  pencil: [0.958, 12, 12],  /* hộp mực 17.5×21.5 */
  book_open: [0.958, 12, 12],  /* hộp mực 17.5×21.5 */
  user_circle: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  lock_open: [0.958, 12, 12],  /* hộp mực 21.5×21.5 */
  hourglass: [0.958, 12, 12],  /* hộp mực 15.5×21.5 */
  shield_off: [0.958, 12, 12],  /* hộp mực 19.5×21.5 */
};

/* hai icon thương hiệu: giữ bản vẽ tay đang có trong mã */
const KEEP = ['google', 'momo'];

const FILE = path.join(ROOT, 'src', 'cz-app.js');
let src = fs.readFileSync(FILE, 'utf8');

const HEADER = '  /* ======================= 3. BỘ ICON ================================== */';
const at = src.indexOf(HEADER);
if (at < 0) throw new Error('không thấy mục "3. BỘ ICON" trong src/cz-app.js');
const blockStart = src.indexOf('  var P = {\n', at);
const blockEnd = src.indexOf('\n  };\n', blockStart);
if (blockStart < 0 || blockEnd < 0) throw new Error('không thấy khối var P = { … };');
const oldBlock = src.slice(blockStart, blockEnd);

/* lấy nguyên văn hai icon vẽ tay còn giữ (indexOf, không dùng regex cho chắc) */
const kept = {};
const oldLines = oldBlock.split('\n');
for (const k of KEEP) {
  const tag = k + ": '";
  const ln = oldLines.filter((x) => x.trim().indexOf(tag) === 0)[0];
  if (!ln) throw new Error('không đọc được icon vẽ tay: ' + k);
  let v = ln.trim().slice(tag.length);
  const stop = v.lastIndexOf("'");
  if (stop < 0) throw new Error('icon vẽ tay hỏng dấu nháy: ' + k);
  kept[k] = v.slice(0, stop);
}

/* thứ tự icon: theo đúng khối cũ để bản diff dễ đọc */
const oldKeys = oldBlock
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^[a-z_0-9]+: '/.test(l))
  .map((l) => l.slice(0, l.indexOf(':')));
const ordered = oldKeys.filter((k) => MAP[k]).concat(Object.keys(MAP).filter((k) => oldKeys.indexOf(k) < 0));

const missing = ordered.filter((k) => !solar.icons[MAP[k]]);
if (missing.length) {
  console.error('Bộ Solar thiếu icon cho: ' + missing.map((k) => k + ' → ' + MAP[k]).join(', '));
  process.exit(1);
}
const BASE_STROKE = 1.5;   /* nét chuẩn của Solar ở khung 24 */
const body = (k) => {
  let svg = String(solar.icons[MAP[k]].body)
    /* bỏ fill="none": CSS .i đặt fill:none, còn trạng thái .on (tim đã thích,
       sao đã đánh dấu, đã đọc…) cần fill:currentColor mới ăn vào hình */
    .replace(/ fill="none"/g, '')
    /* nét vẽ giao cho lớp bọc bên ngoài, sau khi đã tính hệ số phóng */
    .replace(/ stroke-width="[\d.]+"/g, '')
    .replace(/\s*\n\s*/g, ' ').trim().replace(/'/g, "\\'");
  const n = NORM[k];
  if (!n) return svg;
  const s = n[0];
  const dx = Math.round((12 - s * n[1]) * 100) / 100;
  const dy = Math.round((12 - s * n[2]) * 100) / 100;
  const sw = Math.round((BASE_STROKE / s) * 100) / 100;
  return '<g stroke-width="' + sw + '" transform="translate(' + dx + ' ' + dy + ') scale(' + s + ')">' + svg + '</g>';
};

const lines = ordered.map((k) => "    " + k + ": '" + body(k) + "',");
KEEP.forEach((k, i) => {
  lines.push("    " + k + ": '" + kept[k] + "'" + (i === KEEP.length - 1 ? '' : ','));
});

const header = [
  HEADER,
  '  /* Bộ icon SVG lấy từ IconBuddy (iconbuddy.com/solar) — bộ **Solar** của',
  '     480 Design, giấy phép CC BY 4.0 (ghi công ở chân trang). Tất cả 24×24,',
  '     biến thể -linear nét 1.5px cho khớp kiểu tạp chí in. Hai icon thương hiệu',
  '     Google / MoMo không có trong bộ này nên giữ bản vẽ tay.',
  '     Muốn đổi biến thể (linear → bold/outline): sửa MAP trong',
  '     tools/gen_icons_solar.mjs rồi chạy lại: node tools/gen_icons_solar.mjs */',
].join('\n');

const newBlock = header + '\n  var P = {\n' + lines.join('\n') + '\n  };';
src = src.slice(0, at) + newBlock + src.slice(blockEnd + '\n  };'.length);
fs.writeFileSync(FILE, src);
console.log('Đã ghi ' + lines.length + ' icon Solar vào src/cz-app.js');
console.log('Nhớ: npm run build  ·  node tests/run.js');
