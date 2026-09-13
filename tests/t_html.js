/* ============================================================================
   Soi HTML tĩnh bằng bộ kiểm tra trong tools/check_html.js
   (thuộc tính trùng, liên kết nội bộ hỏng, data-ic không có thật)
   Chạy:  cd tests && node t_html.js
   ========================================================================== */
const { execFileSync } = require('child_process');
const path = require('path');
const tool = path.join(__dirname, '..', 'tools', 'check_html.js');
let out = '', code = 0;
try {
  out = execFileSync('node', [tool], { encoding: 'utf8' });
} catch (e) {
  out = String((e.stdout || '') + (e.stderr || '')); code = e.status || 1;
}
console.log(out.trim());
if (code) { console.log('LỖI: HTML chưa sạch'); process.exit(1); }
console.log('✓ HTML tĩnh đạt');
