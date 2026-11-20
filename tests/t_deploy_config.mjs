/* ============================================================================
   t_deploy_config.mjs · CẤU HÌNH DEPLOY WORKER phải đúng — vì "sửa mã mà không
   deploy" đã hai lần làm người dùng tưởng bản vá không ăn (20/11: RSS vẫn đọc
   ngày theo UTC dù `rfc822` trong git đã sửa).

   Kiểm những thứ chỉ lộ ra LÚC DEPLOY hoặc SAU khi deploy:
     1. worker/wrangler.toml: mọi biến thường phải nằm TRONG [vars]. Trước đây
        FIREBASE_PROJECT nằm dưới [observability] ⇒ wrangler cảnh báo
        "Unexpected fields found in triggers field" và Worker production KHÔNG
        nhận được biến đó.
     2. Không còn placeholder id KV.
     3. Có workflow deploy tự động, và nó không chạy khi CI đỏ.
     4. SITE_BASE / ALLOW_ORIGIN vẫn là host thật (RSS + CORS dựa vào đó).
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors0 = [];
const ok = (cond, msg) => { if (!cond) errors0.push(msg); };

/* ---------- 1. wrangler.toml ---------- */
const tomlPath = path.join(ROOT, 'worker', 'wrangler.toml');
const toml = readFileSync(tomlPath, 'utf8');

/* tách các bảng [ten] và biến thuộc bảng nào (đủ dùng cho tệp này: không có
   bảng lồng nhau, giá trị đều là chuỗi một dòng) */
let table = '';
const inTable = {};
toml.split('\n').forEach((line) => {
  const t = line.trim();
  if (/^\[\[?[^\]]+\]\]?$/.test(t)) { table = t.replace(/[[\]]/g, ''); return; }
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (m && table) inTable[m[1]] = table;
});

const VAR_BINDS = ['SUPABASE_URL', 'BLOG', 'ALLOW_ORIGIN', 'SITE_BASE', 'VAPID_PUBLIC', 'FIREBASE_PROJECT'];
VAR_BINDS.forEach((k) => {
  ok(k in inTable, 'wrangler.toml thiếu biến ' + k);
  ok(inTable[k] === 'vars', 'wrangler.toml: ' + k + ' nằm trong [' + inTable[k] + '] — phải nằm trong [vars] (nằm sai bảng thì Worker production KHÔNG nhận được)');
});

/* chỉ tính dòng KHÔNG phải chú thích — placeholder trong chú thích hướng dẫn là
   bình thường, placeholder ở giá trị thật mới là lỗi */
const tomlCode = toml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
ok(!/DAN_ID_KV_VAO_DAY/.test(tomlCode), 'wrangler.toml còn placeholder id KV');
ok(/id\s*=\s*"[0-9a-f]{32}"/.test(toml), 'wrangler.toml: id KV namespace không đúng dạng 32 ký tự hex');
ok(/binding\s*=\s*"CZ_KV"/.test(toml), 'wrangler.toml thiếu binding CZ_KV');
ok(/crons\s*=\s*\[/.test(toml), 'wrangler.toml thiếu cron (cron lo: hẹn giờ chương, tự chữa ngày, đẩy push)');
ok(/\[observability\]/.test(toml) && /enabled\s*=\s*true/.test(toml), 'wrangler.toml thiếu [observability] enabled = true');

const siteBase = (toml.match(/SITE_BASE\s*=\s*"([^"]+)"/) || [])[1] || '';
ok(/^https:\/\/[a-z0-9.-]+$/.test(siteBase), 'SITE_BASE phải là https://<host> (RSS dựng link chương từ đây), đang là: ' + siteBase);
const allow = (toml.match(/ALLOW_ORIGIN\s*=\s*"([^"]*)"/) || [])[1] || '';
ok(allow.includes('https://ssochuz.pages.dev'), 'ALLOW_ORIGIN thiếu https://ssochuz.pages.dev (trình duyệt sẽ chặn CORS)');

/* mọi tệp worker import phải tồn tại — wrangler gộp lúc deploy, thiếu 1 tệp là
   hỏng cả lần deploy, không liên quan gì tới test chạy máy */
const cms = readFileSync(path.join(ROOT, 'worker', 'cms.js'), 'utf8');
const imports = [...cms.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]);
ok(imports.length >= 8, 'worker/cms.js: chỉ thấy ' + imports.length + ' import — có vẻ đọc sai tệp?');
imports.forEach((rel) => {
  const p = path.resolve(ROOT, 'worker', rel);
  ok(existsSync(p), 'worker/cms.js import tệp không tồn tại: ' + rel + ' (deploy sẽ hỏng)');
});

/* ---------- 2. workflow deploy ---------- */
const wfPath = path.join(ROOT, '.github', 'workflows', 'deploy-worker.yml');
if (!existsSync(wfPath)) {
  errors0.push('thiếu .github/workflows/deploy-worker.yml — sửa worker/cms.js sẽ không bao giờ lên production');
} else {
  const wf = readFileSync(wfPath, 'utf8');
  ok(/workflow_run:/.test(wf), 'deploy-worker.yml phải chạy sau CI (workflow_run) để không deploy mã chưa kiểm');
  ok(/conclusion\s*==\s*'success'/.test(wf), 'deploy-worker.yml phải chặn khi CI đỏ (conclusion == success)');
  ok(/CLOUDFLARE_API_TOKEN/.test(wf), 'deploy-worker.yml thiếu CLOUDFLARE_API_TOKEN');
  ok(/wrangler@?\d*\s+deploy|wrangler.*deploy/.test(wf), 'deploy-worker.yml không chạy wrangler deploy');
  ok(/--dry-run/.test(wf), 'deploy-worker.yml nên dry-run trước khi deploy thật (bắt lỗi cấu hình ngay trong CI)');
  ok(/head_sha/.test(wf), 'deploy-worker.yml phải checkout đúng head_sha mà CI đã kiểm');
}

/* ---------- 3. README phải nói rõ deploy là bắt buộc ---------- */
const rd = readFileSync(path.join(ROOT, 'worker', 'README.md'), 'utf8');
ok(/npx wrangler deploy/.test(rd), 'worker/README.md thiếu lệnh deploy');
ok(/\/api\/health/.test(rd) && /version/.test(rd), 'worker/README.md nên chỉ cách kiểm đã deploy (xem "version" ở /api/health)');

if (errors0.length) {
  console.error(JSON.stringify({ soLoi: errors0.length, errors0 }, null, 1));
  process.exit(1);
}
console.log(JSON.stringify({
  dat: true,
  bienTrongVars: VAR_BINDS.filter((k) => inTable[k] === 'vars'),
  importWorker: imports.length,
  workflowDeploy: existsSync(wfPath),
  ghiChu: 'cấu hình deploy đúng: biến nằm trong [vars], có workflow tự deploy sau CI xanh',
}, null, 1));
