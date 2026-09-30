/* ============================================================================
   check_version.mjs · G10 — kiểm & đồng bộ số phiên bản từ một nguồn duy nhất
   ----------------------------------------------------------------------------
   Nguồn chuẩn: `src/shared/version.js` (`export const VERSION = '…'`).
   Các nơi phải khớp nguồn chuẩn:
     1. `package.json` (`"version"`)
     2. `package-lock.json` (`"version"` + `packages[""].version`)
     3. `worker/cms.js` (nhập `VERSION` từ `../src/shared/version.js`, không tự gán)
     4. `worker/README.md` (mục `## 0. Deploy bản <VERSION>` và các mốc kiểm
        `/api/health` trong mục 0)

   Chạy kiểm tra (trong `npm test`):
     node tools/check_version.mjs
   Nâng / đồng bộ phiên bản:
     node tools/check_version.mjs --write [phiên-bản-mới]
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const writeIdx = args.indexOf('--write');
const doWrite = writeIdx >= 0;
const nextVerArg = doWrite && args[writeIdx + 1] && !args[writeIdx + 1].startsWith('--') ? args[writeIdx + 1].trim() : '';

const verFile = path.join(ROOT, 'src/shared/version.js');
if (nextVerArg) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(nextVerArg)) {
    console.error('Số phiên bản không hợp lệ: ' + nextVerArg);
    process.exit(1);
  }
  const curSrc = readFileSync(verFile, 'utf8');
  writeFileSync(verFile, curSrc.replace(/export const VERSION = '[^']+';/, "export const VERSION = '" + nextVerArg + "';"));
}

const verSrc = readFileSync(verFile, 'utf8');
const verMatch = verSrc.match(/export const VERSION = '([^']+)';/);
const VERSION = verMatch ? verMatch[1] : '';
const errors0 = [];
if (!VERSION) errors0.push('src/shared/version.js: thiếu khai báo export const VERSION = "..."');

/* 1. package.json */
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (pkg.version !== VERSION) {
  if (doWrite) {
    pkg.version = VERSION;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } else {
    errors0.push(`package.json: version="${pkg.version}" lệch src/shared/version.js ("${VERSION}") — chạy: node tools/check_version.mjs --write`);
  }
}

/* 2. package-lock.json */
const lockPath = path.join(ROOT, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const lockRootVer = lock.packages && lock.packages[''] && lock.packages[''].version;
if (lock.version !== VERSION || lockRootVer !== VERSION) {
  if (doWrite) {
    lock.version = VERSION;
    if (lock.packages && lock.packages['']) lock.packages[''].version = VERSION;
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  } else {
    errors0.push(`package-lock.json: version="${lock.version}" / packages[""].version="${lockRootVer}" lệch "${VERSION}" — chạy: node tools/check_version.mjs --write`);
  }
}

/* 3. worker/cms.js */
const cmsPath = path.join(ROOT, 'worker/cms.js');
const cms = readFileSync(cmsPath, 'utf8');
if (!/import\s*\{\s*VERSION\s*\}\s*from\s*['"]\.\.\/src\/shared\/version\.js['"]/.test(cms)) {
  errors0.push('worker/cms.js: phải import { VERSION } from "../src/shared/version.js"');
}
if (/^\s*const\s+VERSION\s*=/m.test(cms)) {
  errors0.push('worker/cms.js: không được khai báo lại const VERSION = … (dùng bản từ src/shared/version.js)');
}

/* 4. worker/README.md (mục 0. Deploy bản <VERSION>) */
const readmePath = path.join(ROOT, 'worker/README.md');
let readme = readFileSync(readmePath, 'utf8');
const sec0Match = readme.match(/## 0\. Deploy bản ([0-9A-Za-z.-]+) —[\s\S]*?(?=\n## |\n$)/);
if (!sec0Match) {
  errors0.push('worker/README.md: không tìm thấy mục "## 0. Deploy bản <VERSION> —"');
} else {
  const sec0Ver = sec0Match[1];
  const sec0Body = sec0Match[0];
  const wantHeader = `## 0. Deploy bản ${VERSION} —`;
  const wantHealth = `"version": "${VERSION}"`;
  const wantNote = `(bản này: \`${VERSION}\`)`;
  if (sec0Ver !== VERSION || !sec0Body.includes(wantHealth) || !sec0Body.includes(wantNote)) {
    if (doWrite) {
      const updatedSec0 = sec0Body
        .replace(/## 0\. Deploy bản [0-9A-Za-z.-]+ —/, wantHeader)
        .replace(/"version":\s*"[0-9A-Za-z.-]+"/g, wantHealth)
        .replace(/\(bản này:\s*`[0-9A-Za-z.-]+`\)/g, wantNote);
      readme = readme.replace(sec0Body, updatedSec0);
      writeFileSync(readmePath, readme);
    } else {
      errors0.push(`worker/README.md mục 0 đang ghi bản "${sec0Ver}" thay vì "${VERSION}" — chạy: node tools/check_version.mjs --write`);
    }
  }
}

console.log(JSON.stringify({ version: VERSION, synced: errors0.length === 0, errors0 }, null, 1));
if (errors0.length) {
  console.error('CÒN ' + errors0.length + ' LỖI LỆCH SỐ PHIÊN BẢN');
  process.exit(1);
}
console.log('Phiên bản thống nhất (' + VERSION + ') giữa src/shared/version.js, package.json, Worker và README.');
