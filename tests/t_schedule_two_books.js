/* ============================================================================
   Vòng 19 · LỊCH RA CHƯƠNG — ĐĂNG 2 BỘ TRONG CÙNG MỘT NGÀY

   Ca thật của chủ trang: “t có ý định đăng 2 bộ trong 1 ngày”. Dữ liệu vẫn hợp
   lệ (2 dòng lịch cùng thứ) nhưng TRANG CHỦ hiểu sai/thể hiện sai:

     L1  Cả 2 bộ đều ra hôm nay, nhưng chỉ bộ ĐẦU được làm tấm tiêu điểm, bộ thứ
         hai bị đẩy xuống “Còn lại trong tuần” với nhãn “Hôm nay” — người đọc
         thấy 1 bộ to + 1 bộ nhỏ, không biết hôm nay ra HAI bộ.
     L2  Không có chỗ nào nói “hôm nay có 2 bộ” — không có số đếm.
     L3  Danh sách “Còn lại trong tuần” trộn hôm nay với các thứ sau, và sắp
         theo thứ tự dòng trong KV chứ không theo NGÀY ⇒ đọc không ra tuần.
     L4  Dòng lịch của bộ ra NHIỀU THỨ chỉ hiện ở thứ ĐẦU TIÊN (dayIdx lấy
         days[0]) ⇒ bộ ra T3+T5 chỉ nằm ở T3, T5 mất hút.
     L5  Admin: bấm chip thứ không cho biết “thứ này đã có bộ khác”, không cảnh
         báo trùng ngày, cũng không có nút thêm nhanh “thêm bộ nữa cho cùng thứ”.
   ========================================================================== */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const prod = R('admin.html'), real = R('admin-real.js');
const reg = JSON.parse(R('data/registry.json'));
const resp = (x, st = 200) => ({ ok: st < 400, status: st, headers: { get: () => 'application/json' }, json: async () => x, text: async () => JSON.stringify(x) });

/* ---------- PHẦN A · TRANG CHỦ THẬT (cz-home.js) ---------- */
const { page, dataFetch } = require('./mk');
const S = reg.lib.slice(0, 4).map(b => b.slug);
/* “Hôm nay” là thứ mấy thì dựng lịch quanh đúng thứ đó để kiểm được ca 2 bộ. */
const WD = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const today = WD[(new Date().getDay() + 6) % 7];
const nextDay = WD[((new Date().getDay() + 6) % 7 + 1) % 7];
const day2 = WD[((new Date().getDay() + 6) % 7 + 2) % 7];
const ITEMS = [
  { slug: S[0], days: today, detail: 'Ra chương 19' },        /* 2 bộ cùng hôm nay */
  { slug: S[1], days: today, detail: 'Ra chương 7' },
  { slug: S[2], days: `${nextDay}, ${day2}`, detail: '' }     /* 1 bộ ra HAI thứ */
];
const api = (m) => {
  if (/^\/api\/schedule/.test(m)) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, items: ITEMS, note: 'Lịch có thể đổi' }), text: () => Promise.resolve('') });
  }
  return undefined;
};
/* /api/schedule trả lịch mới, nhưng registry tĩnh trong repo vẫn là lịch THẬT
   cũ; renderSched ưu tiên bên “dùng được nhiều hơn” nên phải đưa registry về
   đúng bộ dữ liệu đang kiểm, nếu không bài kiểm đo lịch của repo chứ không đo
   ca 2 bộ cùng ngày. */
const baseFetch = dataFetch({ api });
const fetcher = (url, opt) => {
  if (String(url).indexOf('/data/registry.json') >= 0) {
    const reg2 = JSON.parse(JSON.stringify(reg));
    reg2.schedule = { items: ITEMS, note: 'Lịch có thể đổi' };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reg2), text: () => Promise.resolve(JSON.stringify(reg2)) });
  }
  return baseFetch(url, opt);
};

const bad = []; let checks = 0;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (c, m) => { checks++; if (!c) bad.push(m); };

(async () => {
  const p = page('index.html', { fetch: fetcher });
  await new Promise(r => setTimeout(r, 1500));
  const w = p.win, doc = p.doc, $ = s => doc.querySelector(s);
  const sched = $('#sched');
  const text = () => (sched.textContent || '').replace(/\s+/g, ' ');

  ok(!!sched && sched.innerHTML.length > 50, 'A: khối lịch dựng được với 2 bộ cùng ngày');
  const feats = [...sched.querySelectorAll('.w3feat')];
  const rows = [...sched.querySelectorAll('.w3r')];
  ok(feats.length === 1, 'A: đúng 1 tấm tiêu điểm');

  /* L1 — cả 2 bộ ra hôm nay đều phải được nhìn thấy như “hôm nay” */
  const heroTxt = feats[0] ? feats[0].textContent.replace(/\s+/g, ' ') : '';
  ok(/Ra hôm nay|Hôm nay/.test(heroTxt), 'L1: tấm tiêu điểm ghi “ra hôm nay” (' + heroTxt.slice(0, 60) + ')');
  const todayRows = rows.filter(r => /Hôm nay/.test(r.textContent));
  ok(todayRows.length >= 1 || /hôm nay/i.test(heroTxt),
    'L1: bộ thứ hai ra cùng hôm nay vẫn hiện (không bị ẩn)');
  /* L1b — phải nói rõ HÔM NAY CÓ BAO NHIÊU BỘ, không chỉ “1 tấm + phần còn lại” */
  ok(/hôm nay[^.]{0,16}2 bộ|2 bộ[^.]{0,24}hôm nay/i.test(text()),
    'L2: nói rõ hôm nay có 2 bộ (' + text().slice(0, 120) + ')');
  ok(text().indexOf('Chỉ một bộ ra hôm nay') < 0,
    'L2b: không được nói “chỉ một bộ ra hôm nay” khi thật ra có 2');

  /* L3 — nhóm “còn lại” phải sắp theo NGÀY trong tuần, không theo thứ tự KV */
  const order = rows.map(r => (r.querySelector('.w3d') || {}).textContent || '');
  const rank = t => ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].indexOf(t);
  const todayRank = (new Date().getDay() + 6) % 7;
  /* lịch chạy vòng quanh hôm nay: T4 → T5 → T6 → T7 → CN → T2 (không phải 0..6) */
  const seq = order.map(rank).filter(n => n >= 0).map(n => (n - todayRank + 7) % 7);
  ok(seq.every((n, i) => i === 0 || seq[i - 1] <= n),
    'L3: danh sách sắp theo NGÀY kể từ hôm nay (' + order.join(' ') + ')');

  /* L4 — bộ ra NHIỀU thứ phải xuất hiện ở MỌI thứ, không chỉ thứ đầu */
  const multiTitle = (reg.lib.find(b => b.slug === S[2]) || {}).title || '';
  const rowsOfMulti = rows.concat(feats).filter(e => e.textContent.indexOf(multiTitle.slice(0, 12)) >= 0);
  ok(rowsOfMulti.length >= 2,
    'L4: bộ ra HAI thứ hiện ở cả hai ngày (thấy ' + rowsOfMulti.length + ' lần)');
  const shownDays = rowsOfMulti.map(e => (e.querySelector('.w3d') || {}).textContent || '—');
  ok(shownDays.filter(d => d !== '—').length >= 2,
    'L4b: hai lần đó nằm ở hai thứ khác nhau (' + shownDays.join(' ') + ')');

  /* ---------- PHẦN B · ADMIN: thêm 2 bộ cho CÙNG một thứ ---------- */
  const errs = [];
  const pre = '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");sessionStorage.setItem("cz_kv_key","K");}catch(e){}<\/script>';
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console: ' + a.join(' ')));
  const reg2 = JSON.parse(JSON.stringify(reg));
  reg2.schedule = { items: [
    { days: today, slug: S[0], title: '', detail: 'Ra chương 19' },
    { days: today, slug: S[1], title: '', detail: 'Ra chương 7' }
  ], note: '' };
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, pre + '<script>' + real + '</script>');
  const dom = new JSDOM(html, { url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const W = dom.window, D = W.document;
  W.HTMLElement.prototype.scrollIntoView = function () {};
  W.scrollTo = () => {};
  W.fetch = (u) => {
    const pth = new URL(String(u), 'https://ssochuz.pages.dev').pathname;
    if (pth === '/api/registry') return Promise.resolve(resp(reg2));
    if (pth === '/api/health' || pth === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
    if (pth === '/api/admin/kv') return Promise.resolve(resp({ ok: true, keys: 5, groups: [] }));
    if (/^\/api\//.test(pth)) return Promise.resolve(resp({ ok: true, items: [] }));
    return Promise.resolve(resp({}));
  };
  await new Promise(r => setTimeout(r, 2300));
  const ST = W.CZ_MOCKUP.state;
  ST.route = 'homepage-cms'; W.render();
  const view = D.getElementById('view');
  const vtxt = () => view.textContent.replace(/\s+/g, ' ');

  /* L5a — admin phải nói rõ thứ này đang có 2 bộ, ngay trên dòng lịch */
  ok(/2 bộ cùng|trùng thứ|cùng thứ/i.test(vtxt()) || view.querySelectorAll('.hp-day-n').length > 0,
    'L5a: admin cho biết thứ đang có 2 bộ (trùng lịch) — thấy: ' + vtxt().slice(0, 160));
  /* L5b — chip thứ phải mang số bộ của thứ đó để bấm là biết */
  const dayChips = [...view.querySelectorAll('.hp-sched')][0].querySelectorAll('.hp-day');
  ok(dayChips.length >= 7, 'L5: dòng lịch có đủ chip thứ');
  ok([...dayChips].some(c => /1|2/.test(c.textContent.replace(/^T\d|^CN/, ''))) ||
    !!view.querySelector('[data-role="day-count"]') || /Đang có \d+ bộ/.test(vtxt()),
    'L5b: chip/ô thứ hiện số bộ đang ra trong ngày đó');
  /* L5c — thêm nhanh “một bộ nữa cho cùng thứ” */
  ok(!!view.querySelector('[data-act="sched-dup-day"]') || /Thêm bộ nữa/.test(vtxt()),
    'L5c: có lối thêm bộ thứ hai cho CÙNG một thứ (không phải bấm Thêm dòng rồi chọn lại thứ)');

  /* L5d — bấm “+” phải THẬT SỰ thêm một dòng cùng thứ, chọn bộ CHƯA có trong
     lịch, và không ghi KV (vẫn là bản nháp chờ bấm Lưu trang chủ). */
  const plus = view.querySelector('[data-act="sched-dup-day"]');
  const before = ST.schedule.length;
  const beforeDays = ST.schedule.map(x => x.d);
  plus.click(); await wait(300);
  ok(ST.schedule.length === before + 1, 'L5d: bấm “+” thêm đúng 1 dòng lịch (' + before + ' → ' + ST.schedule.length + ')');
  const added = ST.schedule[ST.schedule.length - 1] || {};
  ok(beforeDays.indexOf(added.d) >= 0, 'L5d: dòng mới giữ ĐÚNG thứ của dòng gốc (' + added.d + ')');
  ok(!!added.b && beforeDays.length >= 0 && !ST.schedule.slice(0, before).some(x => x.b === added.b),
    'L5d: dòng mới chọn bộ khác (không tạo hai dòng y hệt) — ' + added.b);
  /* và bảng đếm phải nhảy lên 2 bộ cho ngày đó */
  W.render();
  const multi = [...D.querySelectorAll('.hp-dcount.multi')];
  ok(multi.length >= 1, 'L5e: bảng đếm theo ngày báo đúng ngày có >1 bộ (' + multi.map(e => e.textContent.trim()).join(', ') + ')');
  const chipN = [...D.querySelectorAll('.hp-day-n')].some(e => Number(e.dataset.n) >= 2);
  ok(chipN, 'L5f: chip thứ có số 2 trên ngày vừa thêm bộ thứ hai');

  ok(errs.length === 0, 'B: admin 0 lỗi JS (' + errs.slice(0, 2).join(' | ') + ')');
  dom.window.close();

  console.log(JSON.stringify({ bai: 't_schedule-two-books.js', kiemTra: checks, loi: bad.length, errors0: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
