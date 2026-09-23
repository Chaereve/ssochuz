/* ============================================================================
   Kiểm thử DỮ LIỆU của TRANG TÁC GIẢ (/tac-gia/) + TRANG COUPLE (/couple/)
   ---------------------------------------------------------------------------
   Bệnh đã xảy ra trên máy người đọc thật (23/09): mở hai trang này chỉ thấy
   “Chưa tải được dữ liệu — thử tải lại trang”, dòng đếm đứng ở “Đang tải…”,
   trong khi KV và file tĩnh đều đủ 63 bộ.

   NGUYÊN NHÂN (khác hẳn phán đoán “KV rỗng” trước đó):
     CZPeople.init() → CZ.mountShell() → mountHeader() → paintNotif()
       → notifItems() → findLib() → CZ.lib()
     chuỗi này chạy TRƯỚC khi registry về. libList() nhớ kết quả RỖNG đó vào
     `libCache`, và KHÔNG có chỗ nào xoá `libCache` khi registry về sau — nên
     paint() đọc mãi bản rỗng. Điều kiện dính lỗi: người đọc có THEO DÕI ít
     nhất 1 bộ (ssochuz-follow khác rỗng) — đúng là máy của chủ trang. Trình
     duyệt ẩn danh KHÔNG theo dõi bộ nào thì findLib() không chạy ⇒ không đóng
     băng ⇒ trang vẫn hiện, vì thế lỗi không tái hiện khi soi bằng bot.

   Bài này khoá lại 6 tình huống; mọi khoá "errors*" phải là [].
   ========================================================================== */
const { page } = require('./mk');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8'));
const APIB = 'https://chuseoz-cms.kimtong1906.workers.dev';
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* Số bộ kỳ vọng lấy thẳng từ file tĩnh (không bộ nào bị lọc công khai).
   Còn số TÁC GIẢ/COUPLE phải đếm trên danh sách ĐÃ CHUẨN HOÁ: dữ liệu có cả
   “SalmonLover” lẫn “Salmonlover”, client gộp làm một — đếm trên file thô sẽ
   lệch 1 (bài t_people.js cũng làm vậy). */
const N_LIB = (REG.lib || []).length;
let N_AU = 0, N_CP = 0;
const distinct = (lib, f) => { const m = {}; lib.forEach(n => { const v = n[f]; if (v) m[v] = 1; }); return Object.keys(m).length; };

/* fetch giả. `delay` BẮT BUỘC > 0: stub trả promise đã-resolve sẽ làm registry
   về TRƯỚC khi cz-people.js chạy init() (jsdom xả microtask giữa 2 thẻ script)
   ⇒ không tái hiện được thứ tự thật trên trình duyệt. */
function mkFetch({ apiBody = REG, apiOk = true, staticOk = true, delay = 120 } = {}) {
  const mk = (b, o, st) => ({ ok: o !== false, status: st || 200,
    json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
  return (url) => {
    url = String(url);
    const later = (b, o, st) => new Promise(r => setTimeout(() => r(mk(b, o, st)), delay));
    if (url.startsWith(APIB)) return later(apiBody, apiOk, apiOk ? 200 : 503);
    if (url.startsWith('/data/registry.json')) return staticOk ? later(REG, true) : later({}, false, 404);
    return later({}, false, 404);
  };
}
/* Cache của service worker giả: giữ sẵn /api/registry BẢN RỖNG như máy từng dính
   lỗi, và ghi lại những khoá đã bị purgeRegistry() xoá. */
function fakeSW(w, deleted) {
  const entries = [
    { url: APIB + '/api/registry' },
    { url: 'https://ssochuz.pages.dev/data/registry.json?_=1758000000000' },
    { url: 'https://ssochuz.pages.dev/cz-app.js?v=20260923a' },
  ];
  const cache = {
    keys: () => Promise.resolve(entries.slice()),
    delete: (k) => { deleted.push(String(k && k.url)); const i = entries.indexOf(k); if (i >= 0) entries.splice(i, 1); return Promise.resolve(true); },
  };
  w.caches = { keys: () => Promise.resolve(['ssochuz-api', 'ssochuz-shell-20260923a']), open: () => Promise.resolve(cache) };
}
/* Người đọc có theo dõi 2 bộ — điều kiện kích hoạt lỗi đóng băng libCache. */
const follower = (w) => w.localStorage.setItem('ssochuz-follow', JSON.stringify({ chain: 12, 'lunar-secret': 30 }));

function open(file, url, { setup = null, fetch } = {}) {
  return page(file, {
    url, fetch: fetch || mkFetch(),
    setup: (w) => { fakeSW(w, w.__deleted = []); follower(w); if (setup) setup(w); },
  });
}
const state = (p) => ({
  cards: p.doc.querySelectorAll('#ppGrid .pcard').length,
  sub: (p.doc.querySelector('#ppSub') || {}).textContent,
  err: /Chưa tải được dữ liệu/.test(p.doc.querySelector('#ppGrid').textContent || ''),
  retry: !!p.doc.querySelector('#ppRetry'),
  lib: p.win.CZ.lib().length,
  src: p.win.CZ_SRC,
});

(async () => {
  const out = {};

  /* ---------- A. BỆNH CHÍNH: có theo dõi truyện, registry về sau init() ---- */
  const pA = open('tac-gia/index.html', 'https://ssochuz.pages.dev/tac-gia/');
  await wait(1600);
  out.errors0 = pA.errors.slice(0, 5);
  const a = state(pA);
  out.A = a;
  ok(a.lib === N_LIB, 'A: registry ve roi ma CZ.lib() van ' + a.lib + '/' + N_LIB + ' — libCache dong bang o ban rong');
  /* chốt mốc đếm từ danh sách đã chuẩn hoá (chỉ khi danh sách đã đủ bộ) */
  N_AU = distinct(pA.win.CZ.lib(), 'author'); N_CP = distinct(pA.win.CZ.lib(), 'couple');
  out.expect = { lib: N_LIB, authors: N_AU, couples: N_CP };
  ok(N_AU > 30 && N_CP > 20, 'A: moc dem sanh khong hop le (' + N_AU + ' tac gia / ' + N_CP + ' couple)');
  ok(a.cards === N_AU, 'A: /tac-gia/ phai liet ke ' + N_AU + ' tac gia (thay ' + a.cards + ')');
  ok(!a.err, 'A: /tac-gia/ khong duoc bao "Chua tai duoc du lieu"');
  ok(!/Đang tải/.test(String(a.sub)), 'A: dong dem khong duoc dung o "Dang tai…" (thay: ' + a.sub + ')');

  const pB = open('couple/index.html', 'https://ssochuz.pages.dev/couple/');
  await wait(1600);
  out.errors1 = pB.errors.slice(0, 5);
  const b = state(pB);
  out.B = b;
  ok(b.cards === N_CP, 'B: /couple/ phai liet ke ' + N_CP + ' couple (thay ' + b.cards + ')');
  ok(!b.err, 'B: /couple/ khong duoc bao "Chua tai duoc du lieu"');

  /* ---------- C. Worker trả {lib: []} → phải rớt về file tĩnh -------------- */
  const pC = open('tac-gia/index.html', 'https://ssochuz.pages.dev/tac-gia/', { fetch: mkFetch({ apiBody: { rev: '0', lib: [] } }) });
  await wait(1600);
  out.C = state(pC);
  ok(out.C.cards === N_AU, 'C: KV rong phai rot ve file tinh du ' + N_AU + ' tac gia (thay ' + out.C.cards + ')');
  ok(out.C.src === 'static', 'C: KV rong thi nguon phai la static (thay ' + out.C.src + ')');

  /* ---------- D. localStorage + cache service worker nhiễm bản rỗng -------- */
  const pD = open('tac-gia/index.html', 'https://ssochuz.pages.dev/tac-gia/', {
    fetch: mkFetch({ apiBody: { rev: '0', lib: [] } }),
    setup: (w) => {
      w.localStorage.setItem('ssochuz-reg', JSON.stringify({ t: Date.now(), v: { rev: '0', lib: [] } }));
      w.localStorage.setItem('ssochuz-fallback', String(Date.now() + 600000));   /* cờ cấm Worker 10 phút */
    },
  });
  await wait(1600);
  out.D = state(pD);
  ok(out.D.cards === N_AU, 'D: cache nhiem ban rong van phai hien du ' + N_AU + ' tac gia (thay ' + out.D.cards + ')');

  /* ---------- E. sạch mọi nguồn: phải báo lỗi CÓ nút "Thử lại" chạy thật --- */
  const alive = { on: false };   /* bật lên trước khi bấm “Thử lại” */
  const pE = open('tac-gia/index.html', 'https://ssochuz.pages.dev/tac-gia/', {
    fetch: (u) => (alive.on ? mkFetch()(u) : mkFetch({ apiOk: false, staticOk: false })(u)),
    setup: (w) => w.localStorage.setItem('ssochuz-reg', JSON.stringify({ t: Date.now(), v: { rev: '0', lib: [] } })),
  });
  await wait(2200);
  const e = state(pE);
  out.E = e;
  ok(e.err, 'E: mat ca Worker lan file tinh thi phai bao loi ro rang');
  ok(e.retry, 'E: bao loi phai kem nut "Thu lai" (truoc day la ngo cut, chi biet tai lai trang)');
  ok(!/Đang tải/.test(String(e.sub)), 'E: dong dem khong duoc dung o "Dang tai…" (thay: ' + e.sub + ')');
  /* purgeRegistry phải dọn đúng 2 khoá registry trong cache service worker,
     và KHÔNG đụng tới tệp tĩnh khác (cz-app.js). */
  const del = pE.win.__deleted || [];
  ok(del.some(u => u.indexOf('/api/registry') !== -1), 'E: purgeRegistry phai xoa /api/registry trong cache service worker');
  ok(del.some(u => u.indexOf('/data/registry.json') !== -1), 'E: purgeRegistry phai xoa /data/registry.json trong cache service worker');
  ok(!del.some(u => /cz-app\.js/.test(u)), 'E: purgeRegistry khong duoc xoa file tinh khong lien quan');
  ok(!pE.win.localStorage.getItem('ssochuz-reg'), 'E: purgeRegistry phai xoa ban registry rong trong localStorage');
  /* bấm "Thử lại": Worker/file tĩnh đã sống lại thì trang phải hiện đủ */
  alive.on = true;
  const btn = pE.doc.querySelector('#ppRetry');
  if (btn) btn.click();
  await wait(1600);
  const e2 = state(pE);
  out.E2 = e2;
  ok(!!btn, 'E: thieu nut "Thu lai" de bam');
  ok(e2.cards === N_AU, 'E: bam "Thu lai" xong phai hien du ' + N_AU + ' tac gia (thay ' + e2.cards + ')');

  /* ---------- F. CZ.lib() gọi sớm không được đóng băng (mọi trang) --------- */
  const pF = page('guide.html', { url: 'https://ssochuz.pages.dev/guide', fetch: mkFetch(), setup: follower });
  const early = pF.win.CZ.lib().length;
  await pF.win.CZ.registry();
  out.F = { early, after: pF.win.CZ.lib().length };
  ok(out.F.after === N_LIB, 'F: goi CZ.lib() truoc khi registry ve xong van phai co du ' + N_LIB + ' bo (thay ' + out.F.after + ')');
  ok(typeof pF.win.CZ.purgeRegistry === 'function', 'F: thieu CZ.purgeRegistry() de doc lai registry tu dau');

  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
