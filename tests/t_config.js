/* ============================================================================
   cz-config.js · URL Worker dán thiếu https:// hoặc thừa / ở cuối vẫn phải chạy.
   (Không chuẩn hoá thì trình duyệt hiểu đó là đường dẫn nội bộ web → mọi lệnh
    gọi KV thất bại âm thầm và web lặng lẽ quay về dữ liệu tĩnh — đúng lỗi đã gặp.)
   Để trống thì web dùng /data/*.json và KHÔNG gọi Worker.
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function run(rawApi, apiBase, rawCommunityApi = '') {
  const log = [];
  const p = page('index.html', { config: { CZ_API: rawApi, CZ_COMMUNITY_API: rawCommunityApi }, fetch: dataFetch({ apiBase: apiBase, log }) });
  await wait(900);
  const req = log.filter(u => u.includes('/api/'));
  return {
    CZ_API: p.win.CZ_API,
    CZ_norm: p.win.CZ.API,
    COMMUNITY_API: p.win.CZ.COMMUNITY_API,
    hasAPI: p.win.CZ.hasAPI,
    goiWorker: req.length > 0,
    urlDauTien: req[0] || '(không gọi Worker)',
    soThe: p.doc.querySelectorAll('#grid .card').length,
    errors: p.errors.slice(0, 3)
  };
}

(async () => {
  const out = {};
  out.thieuHttps = await run('cms.test', 'https://cms.test');        // dán thiếu https://
  out.thuaSlash = await run('cms.test/', 'https://cms.test');        // dán thừa /
  out.dungRoi = await run('https://cms.test', 'https://cms.test');   // dán đúng
  out.trongKhong = await run('', 'https://cms.test');                // để trống → dữ liệu tĩnh
  out.communityTachRieng = await run('https://cms.test', 'https://cms.test', 'community.test/');
  if (out.communityTachRieng.COMMUNITY_API !== 'https://community.test' || out.communityTachRieng.CZ_norm !== 'https://cms.test') {
    console.error(JSON.stringify({ errors0: ['community API phải chuẩn hóa riêng và không đổi CMS API'], out }, null, 1));
    process.exit(1);
  }
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
