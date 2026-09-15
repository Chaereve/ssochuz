/* ============================================================================
   measure_icons.mjs · đo hộp mực của từng icon Solar trong khung 24×24
   ----------------------------------------------------------------------------
   Vì sao cần: bộ Solar vẽ trên lưới 24 nhưng độ "đầy khung" mỗi icon một khác
   (mũi tên 15,5 đơn vị, dấu × 15,5, đa số 21,5). Không bù thì icon nhỏ nằm cạnh
   icon lớn trông lệch hẳn. Công cụ này render từng icon rồi tìm hộp mực (pixel
   có mực) để biết cần phóng bao nhiêu và dời đi đâu cho hình nằm giữa khung.

   Chạy:   node tools/measure_icons.mjs           (in sẵn khối NORM để dán vào
                                                   tools/gen_icons_solar.mjs)
   Cần:    npm i sharp   (chỉ để đo một lần; web chạy thật không cần)
   Sau khi dán: node tools/gen_icons_solar.mjs && npm run build && npm test
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let sharp;
try { sharp = require('sharp'); } catch (e) {
  console.error('Chưa có sharp — chạy: npm i sharp  (hoặc npm i -D sharp)');
  process.exit(1);
}

const gen = fs.readFileSync(path.join(ROOT, 'tools', 'gen_icons_solar.mjs'), 'utf8');
const at = gen.indexOf('const MAP = {') + 'const MAP = '.length;
const MAP = eval('(' + gen.slice(at, gen.indexOf('};', at) + 1) + ')');
const solar = require('@iconify-json/solar/icons.json');

const R = 96;              /* độ phân giải render để đo */
const U = R / 24;          /* pixel mỗi đơn vị lưới */
const TARGET = 20.6;       /* hộp mực lớn nhất mong muốn (đơn vị lưới) */
const MIN = 0.85;          /* đừng thu nhỏ quá kẻo icon bé tí */
const MAX = 1.16;          /* đừng phóng quá kẻo nét vẽ tràn khung */

const rows = [];
for (const [key, name] of Object.entries(MAP)) {
  const body = String(solar.icons[name].body).replace(/ fill="none"/g, '');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + R + '" height="' + R + '" viewBox="0 0 24 24" ' +
    'fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const w = (x1 - x0 + 1) / U, h = (y1 - y0 + 1) / U;
  const cx = (x0 + x1 + 1) / 2 / U, cy = (y0 + y1 + 1) / 2 / U;
  const s = Math.round(Math.max(MIN, Math.min(MAX, TARGET / Math.max(w, h))) * 1000) / 1000;
  rows.push('  ' + key + ': [' + s + ', ' + Math.round(cx * 100) / 100 + ', ' + Math.round(cy * 100) / 100 +
    '],' + ' '.repeat(Math.max(1, 12 - key.length)) + '/* hộp mực ' + Math.round(w * 10) / 10 + '×' + Math.round(h * 10) / 10 + ' */');
}
console.log('const NORM = {');
console.log(rows.join('\n'));
console.log('};');
