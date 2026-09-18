/* ============================================================================
   gen_icons_tabler.mjs · sinh khối icon P trong src/cz-app.js từ TABLER ICONS
   ----------------------------------------------------------------------------
   Nguồn: @tabler/icons (github.com/tabler/tabler-icons), bộ outline, giấy phép
   MIT. SVG được nhúng thẳng vào mã web sau khi build — không tải font, CSS hay
   JavaScript từ bên ngoài lúc người đọc mở trang.

   Vì sao có công cụ thay vì dán tay: chỉ cần sửa MAP rồi chạy lại:

     npm install
     node tools/gen_icons_tabler.mjs
     npm run build && npm test

   MoMo không có icon chính thức trong Tabler nên giữ hình thương hiệu nhỏ hiện
   có; toàn bộ icon giao diện và Google đều lấy từ Tabler.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLER_ROOT = path.join(ROOT, 'node_modules', '@tabler', 'icons');
if (!fs.existsSync(path.join(TABLER_ROOT, 'icons.json'))) {
  throw new Error('thiếu @tabler/icons — chạy npm install trước');
}
const OUTLINE_ROOT = path.join(TABLER_ROOT, 'categories', 'outline');

/* khoá trong web → tên icon Tabler outline */
const MAP = {
  search: 'search',
  book: 'book',
  library: 'library',
  home: 'home',
  trophy: 'trophy',
  calendar: 'calendar',
  film: 'movie',
  tv: 'device-tv',
  users: 'users',
  pen: 'pencil',
  play: 'player-play',
  bookmark: 'bookmark',
  bell: 'bell',
  shelf: 'bookmarks',
  user: 'user',
  logout: 'logout',
  shield: 'shield',
  pulse: 'activity-heartbeat',
  inbox: 'inbox',
  history: 'history',
  wand: 'wand',
  heart: 'heart',
  share: 'share-3',
  check: 'check',
  moon: 'moon',
  sun: 'sun',
  x: 'x',
  star: 'star',
  fire: 'flame',
  list: 'list',
  left: 'chevron-left',
  right: 'chevron-right',
  up: 'chevron-up',
  down: 'chevron-down',
  gear: 'settings',
  expand: 'maximize',
  thumb: 'thumb-up',
  chat: 'messages',
  alert: 'alert-triangle',
  eye: 'eye',
  clock: 'clock',
  menu: 'menu',
  plus: 'plus',
  trash: 'trash',
  edit: 'edit',
  refresh: 'refresh',
  download: 'download',
  upload: 'upload',
  cloud: 'cloud',
  key: 'key',
  lock: 'lock',
  link: 'link',
  filter: 'filter',
  grid: 'layout-grid',
  rows: 'list-details',
  info: 'info-circle',
  cloud2: 'cloud-off',
  chart: 'chart-dots',
  save: 'device-floppy',
  sparkle: 'stars',
  clock2: 'clock-hour-4',
  mail: 'mail',
  heart_hand: 'heart-handshake',
  donate: 'heart-dollar',
  copy: 'copy',
  pencil: 'pencil',
  book_open: 'book-2',
  user_circle: 'user-circle',
  lock_open: 'lock-open',
  hourglass: 'hourglass',
  shield_off: 'shield-off',
  google: 'brand-google',
  /* --- nhóm soạn thảo kiểu Word (ribbon trong trang quản trị) --- */
  undo: 'arrow-back-up',
  redo: 'arrow-forward-up',
  bold: 'bold',
  italic: 'italic',
  uline: 'underline',
  strike: 'strikethrough',
  hilite: 'highlight',
  fontcolor: 'palette',
  aleft: 'align-left',
  acenter: 'align-center',
  aright: 'align-right',
  ajustify: 'align-justified',
  numlist: 'list-numbers',
  indin: 'indent-increase',
  indout: 'indent-decrease',
  quote: 'quote',
  lineheight: 'line-height',
  unlink: 'unlink',
  imgadd: 'photo-plus',
  table: 'table',
  hrline: 'separator-horizontal',
  clearfmt: 'clear-formatting',
  replace: 'replace',
  focus: 'focus-2',
  para: 'pilcrow',
  acase: 'letter-case',
  pastetxt: 'clipboard-text',
  zin: 'zoom-in',
  zout: 'zoom-out',
  h1: 'h-1',
  h2i: 'h-2',
  txtsize: 'text-size',
  eraser: 'eraser',
  filedown: 'file-download',
  navhide: 'layout-sidebar-left-collapse',
  send: 'send',
  dots: 'dots',
  database: 'database',
};

/* MoMo chưa có trong bộ Tabler — giữ đúng hình thương hiệu riêng, không phải
   icon giao diện của bộ cũ. */
const KEEP = ['momo'];
const BASE_STROKE = 1.7;
/* Tabler thường vẽ nét 18/24; phóng nhẹ để hộp mực sau khi đặt vào .i (0,94em)
   ngang với chữ và các nút cũ. Mũi tên / dấu cộng nhỏ hơn nên được bù riêng. */
const SCALE = {
  default: 1.06,
  left: 1.42, right: 1.42, up: 1.42, down: 1.42,
  x: 1.18, plus: 1.18, menu: 1.12,
};

function listSvgFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listSvgFiles(full, out);
    else if (ent.isFile() && ent.name.endsWith('.svg')) out.push(full);
  }
  return out;
}

const svgByName = new Map();
for (const file of listSvgFiles(OUTLINE_ROOT)) {
  const name = path.basename(file, '.svg');
  if (!svgByName.has(name)) svgByName.set(name, file);
}

const FILE = path.join(ROOT, 'src', 'cz-app.js');
let src = fs.readFileSync(FILE, 'utf8');
const HEADER = '  /* ======================= 3. BỘ ICON ================================== */';
const at = src.indexOf(HEADER);
if (at < 0) throw new Error('không thấy mục "3. BỘ ICON" trong src/cz-app.js');
const blockStart = src.indexOf('  var P = {\n', at);
const blockEnd = src.indexOf('\n  };\n', blockStart);
if (blockStart < 0 || blockEnd < 0) throw new Error('không thấy khối var P = { … };');
const oldBlock = src.slice(blockStart, blockEnd);

/* đọc hình MoMo riêng đang có trong mã */
const kept = {};
const oldLines = oldBlock.split('\n');
for (const key of KEEP) {
  const prefix = key + ": '";
  const line = oldLines.find((item) => item.trim().startsWith(prefix));
  if (!line) throw new Error('không đọc được icon thương hiệu: ' + key);
  let value = line.trim().slice(prefix.length);
  const end = value.lastIndexOf("'");
  if (end < 0) throw new Error('icon thương hiệu hỏng dấu nháy: ' + key);
  kept[key] = value.slice(0, end);
}

/* giữ thứ tự khối cũ để diff và cache dễ đọc */
const oldKeys = oldBlock
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => /^[a-z_0-9]+: '/.test(line))
  .map((line) => line.slice(0, line.indexOf(':')));
const ordered = oldKeys.filter((key) => MAP[key]).concat(Object.keys(MAP).filter((key) => !oldKeys.includes(key)));

const missing = ordered.filter((key) => !svgByName.has(MAP[key]));
if (missing.length) {
  throw new Error('Tabler thiếu icon cho: ' + missing.map((key) => key + ' → ' + MAP[key]).join(', '));
}

function svgBody(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const start = raw.indexOf('>');
  const end = raw.lastIndexOf('</svg>');
  if (start < 0 || end < 0 || end <= start) throw new Error('SVG Tabler hỏng: ' + file);
  return raw.slice(start + 1, end)
    .replace(/<path\s+stroke="none"[^>]*\/?>/g, '')
    .replace(/\s+(?:width|height|xmlns|viewBox|fill|stroke-width|stroke-linecap|stroke-linejoin)="[^"]*"/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/'/g, "\\'");
}

function iconBody(key) {
  const scale = SCALE[key] || SCALE.default;
  const offset = Math.round((12 - 12 * scale) * 100) / 100;
  const stroke = Math.round((BASE_STROKE / scale) * 100) / 100;
  return '<g stroke-width="' + stroke + '" transform="translate(' + offset + ' ' + offset + ') scale(' + scale + ')">' +
    svgBody(svgByName.get(MAP[key])) + '</g>';
}

const lines = ordered.map((key) => '    ' + key + ": '" + iconBody(key) + "',");
KEEP.forEach((key, index) => {
  lines.push('    ' + key + ": '" + kept[key] + "'" + (index === KEEP.length - 1 ? '' : ','));
});

const header = [
  HEADER,
  '  /* Bộ icon SVG từ Tabler Icons (tabler.io) — bộ outline, giấy phép MIT.',
  '     Tất cả icon được nhúng trong mã phát hành, không tải font / CSS / JS',
  '     icon từ bên ngoài. MoMo là hình thương hiệu riêng vì Tabler chưa có icon',
  '     tương ứng. Muốn đổi icon: sửa MAP trong tools/gen_icons_tabler.mjs rồi',
  '     chạy lại: node tools/gen_icons_tabler.mjs */',
].join('\n');
const newBlock = header + '\n  var P = {\n' + lines.join('\n') + '\n  };';
src = src.slice(0, at) + newBlock + src.slice(blockEnd + '\n  };'.length);
fs.writeFileSync(FILE, src);
console.log('Đã ghi ' + lines.length + ' icon Tabler vào src/cz-app.js');
console.log('Nhớ: npm run build  ·  npm test');
