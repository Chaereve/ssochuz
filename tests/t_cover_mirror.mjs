/* G7 (bản tĩnh $0) — bìa sao lưu thành tệp tĩnh trên Cloudflare Pages.

   Vì sao không dùng Supabase Storage như kế hoạch cũ: người đọc tải bìa từ
   Supabase là tính vào 5 GB egress/tháng (chặn khi vượt, ảnh chương chết theo).
   Tệp tĩnh trên Pages không tính băng thông ⇒ không có trần nào để chạm.

   Hợp đồng kiểm ở đây:
   A. coverKey ổn định (cùng URL → cùng khoá, trình duyệt lẫn Node), mirrorPath
      chỉ trả đường dẫn tĩnh khi khoá có trong manifest và URL là http(s).
   B. Bất biến repo: mọi khoá trong manifest có tệp assets/covers/<k>.webp, mọi
      tệp ở đó có trong manifest, và cz-app.js ĐÃ BUILD chứa đủ các khoá.
   C. Mã thật của cz-app (build với manifest thử): bìa đã sao lưu ⇒ src là tệp
      tĩnh + data-fb là link gốc (tệp tĩnh lỗi vẫn còn bìa); bìa chưa sao lưu ⇒
      giữ nguyên hành vi cũ.
   D. tools/mirror_covers.mjs chạy thật với máy chủ ảnh cục bộ: tải, đổi WebP
      ≤ 480×720, ghi manifest, dọn tệp không còn dùng; KHÔNG gọi ghi nào lên
      Worker. Bỏ qua phần này nếu máy không có ImageMagick (convert). */
import assert from 'node:assert';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { coverKey, mirrorPath, MIRROR_DIR } = await import(pathToFileURL(path.join(ROOT, 'src/shared/cover-mirror.js')).href);
const out = { errors0: [] };
/* spawn BẤT ĐỒNG BỘ: máy chủ ảnh thử chạy trong chính tiến trình này — spawnSync
   sẽ chặn event loop, máy chủ không trả lời được, công cụ chờ tới hết giờ */
function runTool(argv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}

/* ---------- A. hàm thuần ---------- */
const u1 = 'https://cdn-local.mebmarket.com/meb/server1/430310/Thumbnail/book_detail_large.gif?14';
assert.match(coverKey(u1), /^[0-9a-f]{8}$/, 'coverKey phải là 8 ký tự hex');
assert.strictEqual(coverKey(u1), coverKey(String(u1)), 'coverKey phải ổn định');
assert.notStrictEqual(coverKey(u1), coverKey(u1 + 'x'), 'URL khác phải ra khoá khác');
/* giá trị cố định: đổi thuật toán băm là đổi tên mọi tệp đã sao lưu ⇒ phải cố ý */
assert.strictEqual(coverKey(''), '811c9dc5', 'FNV-1a 32 của chuỗi rỗng phải là 811c9dc5');
assert.strictEqual(coverKey('a'), 'e40c292c', 'FNV-1a 32 của "a" phải là e40c292c');
assert.strictEqual(MIRROR_DIR, '/assets/covers/');
assert.strictEqual(mirrorPath(u1, [coverKey(u1)]), '/assets/covers/' + coverKey(u1) + '.webp');
assert.strictEqual(mirrorPath(u1, []), '', 'chưa sao lưu thì không đổi link');
assert.strictEqual(mirrorPath('/api/img/abc', [coverKey('/api/img/abc')]), '', 'link tương đối không bao giờ bị đổi (chỉ http/https tuyệt đối)');
assert.strictEqual(mirrorPath('data:image/png;base64,xx', [coverKey('data:image/png;base64,xx')]), '');

/* ---------- B. bất biến repo ---------- */
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'src/shared/covers-manifest.json'), 'utf8'));
assert.ok(Array.isArray(manifest.keys), 'manifest phải có mảng keys');
const dir = path.join(ROOT, 'assets', 'covers');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f !== '.gitkeep') : [];
for (const k of manifest.keys) if (!files.includes(k + '.webp')) out.errors0.push('manifest có ' + k + ' nhưng thiếu assets/covers/' + k + '.webp');
for (const f of files) if (!/^[0-9a-f]{8}\.webp$/.test(f) || !manifest.keys.includes(f.slice(0, 8))) out.errors0.push('assets/covers/' + f + ' không có trong manifest (tệp thừa)');
const builtApp = readFileSync(path.join(ROOT, 'cz-app.js'), 'utf8');
for (const k of manifest.keys) if (!builtApp.includes(k)) out.errors0.push('cz-app.js đã build thiếu khoá ' + k + ' — chạy npm run build');
out.mirrored = manifest.keys.length;

/* ---------- C. mã thật của cz-app với manifest thử ---------- */
const { build } = require('esbuild');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'cz-cover-'));
try {
  const mirrored = 'https://pbs.twimg.com/media/test-cover.jpg';
  const plain = 'https://i.mydramalist.com/plain.jpg';
  const fakeManifest = path.join(tmp, 'covers-manifest.json');
  writeFileSync(fakeManifest, JSON.stringify({ keys: [coverKey(mirrored)] }));
  const res = await build({
    entryPoints: [path.join(ROOT, 'src/cz-app.js')], bundle: true, write: false, format: 'iife', target: ['es2019'],
    plugins: [{ name: 'fake-manifest', setup(b) { b.onResolve({ filter: /covers-manifest\.json$/ }, () => ({ path: fakeManifest })); } }],
  });
  const { JSDOM, VirtualConsole } = require('jsdom');
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM('<!doctype html><html><body><script>window.CZ_API="https://cms.test";</script><script>' + res.outputFiles[0].text + '</script></body></html>',
    { runScripts: 'dangerously', url: 'https://ssochuz.pages.dev/', virtualConsole: vc, beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.fetch = () => Promise.reject(new Error('offline test'));
    } });
  const CZ = dom.window.CZ;
  assert.ok(CZ && CZ.coverSrc && CZ.bookCover, 'cz-app không xuất CZ.coverSrc/bookCover');
  const m = { slug: 'a', title: 'A', thumb: mirrored, slide: 'https://example.com/slide.jpg' };
  assert.strictEqual(CZ.coverSrc(m), '/assets/covers/' + coverKey(mirrored) + '.webp', 'bìa đã sao lưu phải dùng tệp tĩnh');
  const html = CZ.bookCover(m);
  assert.ok(html.includes('src="/assets/covers/' + coverKey(mirrored) + '.webp"'), 'bookCover chưa dùng tệp tĩnh: ' + html);
  assert.ok(html.includes('data-fb="' + mirrored + '"'), 'tệp tĩnh lỗi phải rơi về LINK GỐC (data-fb): ' + html);
  const p = { slug: 'b', title: 'B', thumb: plain, slide: 'https://example.com/s2.jpg' };
  assert.strictEqual(CZ.coverSrc(p), plain, 'bìa chưa sao lưu phải giữ link cũ');
  assert.ok(CZ.bookCover(p).includes('data-fb="https://example.com/s2.jpg"'), 'bìa chưa sao lưu: dự phòng vẫn là slide như cũ');
  assert.strictEqual(CZ.coverSrc({ thumb: '/api/img/xyz' }), 'https://cms.test/api/img/xyz', 'ảnh /api/img chưa sao lưu vẫn ghép CZ_API như cũ');
  const apiAbs = 'https://cms.test/api/img/mirrored';
  /* ảnh Worker (/api/img) cũng sao lưu được: khoá tính trên URL tuyệt đối sau khi ghép CZ_API */
  assert.strictEqual(mirrorPath(apiAbs, [coverKey(apiAbs)]), '/assets/covers/' + coverKey(apiAbs) + '.webp');

  /* ---------- D. công cụ sao lưu chạy thật ---------- */
  let hasConvert = false;
  try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); hasConvert = true; } catch (e) { hasConvert = false; }
  if (!hasConvert) {
    out.toolSkipped = 'không có ImageMagick (convert) — bỏ qua phần chạy thật của mirror_covers.mjs';
  } else {
    const png = readFileSync(path.join(ROOT, 'assets', 'pwa-512.png'));
    const writes = [];
    const srv = http.createServer((req, resp) => {
      if (req.method !== 'GET') { writes.push(req.method + ' ' + req.url); resp.writeHead(405); return resp.end(); }
      if (req.url.startsWith('/img/ok')) { resp.writeHead(200, { 'content-type': 'image/png' }); return resp.end(png); }
      resp.writeHead(404); resp.end('nope');
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + srv.address().port;
    try {
      const work = path.join(tmp, 'site');
      mkdirSync(path.join(work, 'assets', 'covers'), { recursive: true });
      mkdirSync(path.join(work, 'src', 'shared'), { recursive: true });
      writeFileSync(path.join(work, 'assets', 'covers', 'deadbeef.webp'), 'old');   /* tệp cũ không còn dùng ⇒ phải bị dọn */
      writeFileSync(path.join(work, 'src', 'shared', 'covers-manifest.json'), JSON.stringify({ keys: ['deadbeef'] }));
      const reg = { lib: [
        { slug: 'ok1', thumb: base + '/img/ok1.png' },
        { slug: 'ok2', thumb: base + '/img/ok2.png', slide: base + '/img/ok1.png' },
        { slug: 'dead', thumb: base + '/img/dead.png' },
        { slug: 'own', thumb: '/assets/pwa-192.png' },
      ] };
      writeFileSync(path.join(tmp, 'reg.json'), JSON.stringify(reg));
      const toolArgs = [path.join(ROOT, 'tools', 'mirror_covers.mjs'), '--registry', path.join(tmp, 'reg.json'), '--root', work, '--api', base];
      const run = await runTool(toolArgs);
      assert.strictEqual(run.status, 0, 'mirror_covers.mjs lỗi: ' + (run.stderr || run.stdout));
      const summary = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
      const got = readdirSync(path.join(work, 'assets', 'covers')).sort();
      const want = [coverKey(base + '/img/ok1.png'), coverKey(base + '/img/ok2.png')].map((k) => k + '.webp').sort();
      assert.deepStrictEqual(got, want, 'tệp sao lưu sai (phải có đúng 2 ảnh tải được, dọn deadbeef): ' + JSON.stringify(got));
      const man = JSON.parse(readFileSync(path.join(work, 'src', 'shared', 'covers-manifest.json'), 'utf8'));
      assert.deepStrictEqual(man.keys, want.map((f) => f.slice(0, 8)), 'manifest phải khớp đúng các tệp');
      const f0 = readFileSync(path.join(work, 'assets', 'covers', want[0]));
      assert.strictEqual(f0.slice(0, 4).toString(), 'RIFF', 'tệp phải là WebP');
      assert.strictEqual(f0.slice(8, 12).toString(), 'WEBP', 'tệp phải là WebP');
      const dims = execFileSync('identify', ['-format', '%w %h', path.join(work, 'assets', 'covers', want[0])], { encoding: 'utf8' }).split(' ').map(Number);
      assert.ok(dims[0] <= 480 && dims[1] <= 720, 'ảnh phải thu về ≤ 480×720, thấy ' + dims.join('×'));
      assert.ok(f0.length < png.length, 'WebP phải nhỏ hơn ảnh gốc');
      assert.ok(summary.failed.some((f) => f.url.endsWith('/img/dead.png')), 'ảnh 404 phải nằm trong danh sách failed');
      assert.deepStrictEqual(writes, [], 'công cụ sao lưu KHÔNG được gọi ghi nào (chỉ GET)');
      /* chạy lại: không tải lại ảnh đã có */
      const again = await runTool(toolArgs);
      const s2 = JSON.parse(again.stdout.slice(again.stdout.indexOf('{')));
      assert.strictEqual(s2.downloaded, 0, 'chạy lại không được tải lại ảnh đã sao lưu');
      out.tool = { downloaded: summary.downloaded, failed: summary.failed.length, bytes: f0.length, dims };
    } finally { srv.close(); }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(JSON.stringify(out, null, 1));
if (out.errors0.length) process.exit(1);
console.log('Đạt: bìa sao lưu tĩnh — khoá ổn định, manifest khớp tệp + bundle, fallback về link gốc, công cụ chỉ đọc.');
