/* ============================================================================
   check_src.js · bản phát hành ở thư mục gốc có khớp mã nguồn trong src/ không?
   ----------------------------------------------------------------------------
   Vì sao cần: bản ở gốc là bản ĐÃ RÚT GỌN do `npm run build` sinh ra. Nếu ai đó
   sửa thẳng tệp ở gốc (hoặc sửa src/ mà quên build) thì web đang chạy một bản
   khác với mã nguồn — sửa tiếp sẽ mất công và rất dễ tưởng “sửa rồi mà không ăn”.
   Bài này rút gọn lại src/ rồi so từng ký tự với tệp ở gốc.

   Chạy:  node tools/check_src.js      (npm test cũng gọi bài này)
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = ['cz-app.js', 'cz-auth.js', 'cz-home.js', 'cz-story.js', 'admin.js'];
const CSS = ['cz.css'];

async function main() {
  let esbuild;
  try { esbuild = require('esbuild'); }
  catch (e) {
    console.log(JSON.stringify({ errors0: [], ghiChu: 'chưa cài esbuild (npm install) — bỏ qua phép so bản rút gọn' }, null, 1));
    return 0;
  }
  const errors = [];
  const rows = [];
  for (const f of [...JS, ...CSS]) {
    const srcPath = path.join(ROOT, 'src', f);
    const outPath = path.join(ROOT, f);
    if (!fs.existsSync(srcPath)) { errors.push('thiếu src/' + f); continue; }
    if (!fs.existsSync(outPath)) { errors.push('thiếu bản phát hành ' + f + ' — chạy: npm run build'); continue; }
    const opts = f.endsWith('.css')
      ? { entryPoints: [srcPath], write: false, minify: true, loader: { '.css': 'css' } }
      : {
        entryPoints: [srcPath], write: false, minify: true, bundle: false, legalComments: 'none',
        target: ['es2019'], charset: 'utf8',
        banner: { js: '/* ssochuz · bản rút gọn — sửa ở src/ rồi chạy npm run build */' },
      };
    const out = await esbuild.build(opts);
    const want = out.outputFiles[0].text + '\n';
    const got = fs.readFileSync(outPath, 'utf8');
    const same = want === got;
    rows.push({ file: f, khop: same, gocBytes: fs.statSync(outPath).size, srcBytes: fs.statSync(srcPath).size });
    if (!same) errors.push(f + ': bản ở thư mục gốc KHÁC mã nguồn src/ — chạy `npm run build` (hoặc đừng sửa thẳng tệp ở gốc)');
  }
  console.log(JSON.stringify({ khop: rows, errors0: errors }, null, 1));
  if (errors.length) { console.log('CÒN ' + errors.length + ' LỖI ĐỒNG BỘ'); return 1; }
  console.log('Bản phát hành (rút gọn) khớp mã nguồn src/');
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.log(JSON.stringify({ errors0: ['ngoại lệ: ' + (e && e.message || e)] }, null, 1));
  process.exit(1);
});
