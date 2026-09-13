#!/usr/bin/env node
/* Kiểm tra gọi hàm “ma”: hàm được gọi nhưng không hề được định nghĩa ở đâu trong repo.
   Bắt đúng loại lỗi vừa xảy ra (hero gọi renderShelf() trong khi hàm đã đổi tên).

   Chạy:  node tools/check_calls.js
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['cz-app.js', 'cz-home.js', 'cz-story.js', 'admin.js', 'cz-config.js'];

const defined = new Set();
for (const f of FILES) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)|(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function)/g)) {
    defined.add(m[1] || m[2]);
  }
  /* hàm gán qua object/IIFE cũng tính:  key: function () {} */
  for (const m of s.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*function/gm)) defined.add(m[1]);
  /* bí danh:  var ic = CZ.icon, esc = CZ.esc  → coi như đã định nghĩa */
  for (const m of s.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*CZ\.[\w$.]+/g)) defined.add(m[1]);
  for (const m of s.matchAll(/const\s*\{\s*([^}]+)\}\s*=\s*CZ/g)) m[1].split(',').forEach(x => defined.add(x.trim().split(':').pop().trim()));
}

const BUILTIN = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'fetch', 'require',
  'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'encodeURIComponent', 'decodeURIComponent', 'alert', 'confirm', 'prompt', 'String', 'Number', 'Boolean', 'Array',
  'Object', 'JSON', 'Promise', 'Date', 'Math', 'RegExp', 'Error', 'Set', 'Map', 'Image', 'URLSearchParams', 'escape',
  'unescape', 'do', 'else', 'new', 'delete', 'void', 'in', 'of', 'instanceof', 'yield', 'await', 'async', 'super', 'this']);

let bad = 0;
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lines = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const m of code.matchAll(/(^|[^.\w$])([a-z_$][\w$]*)\s*\(/g)) {
      const name = m[2];
      if (BUILTIN.has(name) || defined.has(name)) continue;
      if (/^(i|s|e|t|r|a|b|n|x|y|p|w|d|u|v|el|ev|obj|opt|o|k|m|f|c|h|_)$/.test(name)) continue; /* tham số ngắn */
      if (!/^(render|paint|show|open|close|make|load|save|build|apply|mount|draw|update|init|boot|bind|toggle|move|del|add|do|set|get|fill|sort|filter|find|put|clear|strip|norm|esc|mount)[A-Z_]/.test(name)) continue; /* chỉ soi hàm nội bộ */
      console.log(`${f}:${i + 1}  gọi ${name}()  — không thấy định nghĩa`);
      bad++;
    }
  });
}
console.log(bad ? `\n${bad} chỗ cần xem lại` : 'Không có hàm “ma” nào');
process.exit(0);
