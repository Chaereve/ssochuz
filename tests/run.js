/* Chạy toàn bộ kiểm thử giao diện (jsdom).
   Cài 1 lần:   npm i jsdom       (chạy trong thư mục tests/ hoặc thư mục gốc repo)
   Chạy:        node tests/run.js
   Mỗi bài in ra JSON; mọi khoá "errors*" phải là [] thì mới coi là đạt.       */
const path = require('path'), { spawnSync } = require('child_process');
const cands = (process.env.CZ_TEST_MODULES || '').split(path.delimiter).filter(Boolean)
  .concat([path.join(__dirname, 'node_modules'), path.join(__dirname, '..', 'node_modules')]);
const env = Object.assign({}, process.env, { NODE_PATH: cands.join(path.delimiter) });
const files = ['t_config.js', 't_home.js', 't_reader.js', 't_locked.js', 'cf_admin_test.js'];
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 180000, env });
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim().split('\n').slice(0, 3).join(' | ');
  const badErr = (out.match(/"errors\d*":\s*\[[^\]]/g) || []).length;
  const ok = r.status === 0 && !badErr;
  if (!ok) bad++;
  console.log((ok ? '✓ ĐẠT  ' : '✗ LỖI  ') + f + (err ? '  → ' + err : ''));
  if (!ok) console.log((out + '\n' + err).slice(0, 1200));
}
console.log(bad ? '\n' + bad + ' bài lỗi' : '\nTất cả bài kiểm thử đều đạt');
process.exit(bad ? 1 : 0);
