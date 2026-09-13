/* cz-config.js: URL Worker dán thiếu https:// hoặc thừa / ở cuối vẫn phải chạy đúng.
   (Nếu không chuẩn hoá, trình duyệt coi đó là đường dẫn nội bộ web → mọi lệnh gọi Worker
    thất bại âm thầm và web lặng lẽ dùng dữ liệu tĩnh — đúng lỗi đã gặp.) */
const { page, dataFetch } = require('./mk');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function run(rawApi, apiBase) {
  const log = [];
  const p = page('index.html', { config: { CZ_API: rawApi }, fetch: dataFetch({ apiBase: apiBase, log }) });
  await wait(900);
  const req = log.filter(u => u.includes('/api/'));
  return {
    CZ_API: p.win.CZ_API,
    CZ_hasAPI: !!(p.win.CZ && p.win.CZ.hasAPI),
    goiWorker: req.length > 0,
    urlDauTien: req[0] || '(không gọi Worker)',
    tenTruyen: (p.doc.querySelector('#grid .card b, #grid .card') || {}).textContent ? true : false,
    soThe: p.doc.querySelectorAll('#grid .card').length,
    errors: p.errors.slice(0, 3)
  };
}

(async () => {
  const out = {};
  out.thieuHttps = await run('cms.test', 'https://cms.test');          // dán thiếu https://
  out.thuaSlash = await run('cms.test/', 'https://cms.test');          // dán thừa /
  out.dungRoi  = await run('https://cms.test', 'https://cms.test');    // dán đúng
  out.trongKhong = await run('', 'https://cms.test');                  // để trống → dùng dữ liệu tĩnh
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
