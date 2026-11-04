/* ============================================================================
   t_admin_kv_chip.js · VÒNG 13: CHIP KV GỌN, ICON THẲNG TRỤC, SỐ QUOTA THẬT
   ----------------------------------------------------------------------------
   Owner gửi ảnh 2 pill topbar: "● Cloudflare KV · Online" và "KV 120/1000",
   kèm "vẫn còn lệch icon và 1 số chỗ bố cục bị dài dòng, thiếu chuyên nghiệp
   và gọn gàng / sao t chưa sửa j mà kv worker lại hiện như hình".

   Giải thích (khoá trong bài này để không tái diễn):
     • "Online" là THẬT: admin-real.js gọi /api/whoami rồi setConn('online').
     • "120/1000" là HẰNG SỐ CỨNG của prototype (QUOTA.ok.txt). Vòng 12 đã
       gỡ nút đổi trạng thái demo nhưng bỏ sót hằng này; renderTopbar() vẫn
       đọc q.txt/q.banner. WRITES lấy từ /api/admin/kv chỉ dùng để chọn MÀU.
       ⇒ Không phải chủ trang sửa, không phải Worker mock cục bộ còn chạy.

   Bài này khoá 4 tầng:
     (1) NGUỒN: không còn txt/banner quota cứng, không còn 2 pill, render đầu
         tiên mặc định "checking" (không tự nhận Online), CSS canh giữa tuyệt
         đối cho chấm icon và mọi con chip.
     (2) DOM ONLINE (writesToday=137): đúng 1 chip, hiện 137/1000, Dashboard
         sysrow cũng 137/1000, banner im lặng, title/aria-label giải thích đủ.
     (3) DOM QUOTA CAO (850): banner tự sinh 850/1000; DOM CHƯA CẤU HÌNH:
         chip "Chỉ đọc", KHÔNG "Online"; DOM PARSE-TIME (chưa nạp admin-real):
         chip "Đang nối", KHÔNG "Online", KHÔNG 120.
     (4) CONTRACT: admin-real.js đẩy WRITES/READS xuống state trước mọi render;
         prototype mockup vẫn giữ thiết kế 2 chip MẪU (không sửa file thiết kế);
         tài liệu lịch sử vẫn giữ chữ MẪU.

   Chạy: node tests/t_admin_kv_chip.js   (hoặc npm test)
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const bad = [];
let checks = 0;
const ok = (c, m) => { checks++; if (!c) bad.push(m); };

const prod = R('admin.html');
const mock = R('mockup/ssochuz-admin-mockup.html');
const real = R('admin-real.js');
const reg = JSON.parse(R('data/registry.json'));
const bookSeed = JSON.parse(R('data/book/bake-love-feelings.json'));

/* Tách đúng khối tài liệu lịch sử (DOCS_HTML) để không nhầm chữ MẪU/120. */
const docsStart = prod.indexOf('const DOCS_HTML =');
const docsEndMark = "\n'</ul></div>';";
const docsEnd = prod.indexOf(docsEndMark, docsStart) + docsEndMark.length;
ok(docsStart > 0 && docsEnd > docsStart, 'xác định được khối DOCS_HTML');
const prodUI = prod.slice(0, docsStart) + prod.slice(docsEnd);
const docsHTML = prod.slice(docsStart, docsEnd);

/* ------------------------------------------------------- 1 · NGUỒN PHÁT HÀNH */
[
  'KV write 120/1000', 'KV write 800/1000', 'KV write 950/1000',
  '1000/1000 · bị chặn', 'Cloudflare KV · Online', 'KV&nbsp;',
  'class="quota ', 'q.txt', 'q.banner', 'quotaOpts', '800/1000', '950/1000'
].forEach(s => ok(!prodUI.includes(s), 'ngoài docs: không còn "' + s + '"'));
ok(!/const QUOTA = \{[\s\S]{0,400}txt:/.test(prodUI), 'QUOTA không còn txt cứng');
ok(!/const QUOTA = \{[\s\S]{0,400}banner:/.test(prodUI), 'QUOTA không còn banner cứng');
ok(/const QUOTA = \{ok:\{tone:'t-ok'\}/.test(prodUI), 'QUOTA chỉ còn tone (màu)');
ok(/id="czKvChip"/.test(prodUI), 'chip KV có id ổn định #czKvChip');
ok(/route:'dashboard', modes:\{\}, conn:'checking', quota:'ok',/.test(prodUI),
  'render đầu tiên mặc định "checking" — không tự nhận Online khi chưa kiểm tra');
ok((prodUI.match(/<span class="chip /g) || []).length === 2,
  'chỉ 1 chip topbar + 1 chip màn đăng nhập (không còn pill quota riêng)');

/* Nhãn trạng thái ngắn, không lặp "Cloudflare KV · ". */
ok(/checking:\['Đang nối','t-warn'\],online:\['Online','t-ok'\]/.test(prodUI),
  'CONN rút gọn: Đang nối / Online');
ok(/static:\['Chỉ đọc','t-slate'\]/.test(prodUI), 'CONN.static = "Chỉ đọc" (bỏ "Dữ liệu tĩnh · ")');
ok(!/Dữ liệu tĩnh · Chỉ đọc/.test(prodUI), 'bỏ luôn "Dữ liệu tĩnh · Chỉ đọc" dài dòng');
ok(/nfmt\(state\.kvWrites\|\|0\)\+'\/1000/.test(prodUI), 'số ghi đọc từ state.kvWrites');
ok(/var qw=Number\(state\.kvWrites\|\|0\)/.test(prodUI), 'banner quota đọc từ state.kvWrites');
ok(/qw>=1000/.test(prodUI) && /qw>=800/.test(prodUI), 'banner theo ngưỡng 800 / 1000 thật');
ok(/<b>Quota ghi KV: '\+nfmt\(state\.kvWrites\|\|0\)\+'\/1000<\/b>/.test(prodUI),
  'Dashboard sysrow dùng writesToday thật');

/* --------------------------------------------------- 2 · CSS: ICON THẲNG TRỤC */
ok(/\.chip\{[^}]*display:inline-flex;align-items:center/.test(prodUI),
  '.chip là flex + align-items:center');
ok(/\.chip\{[^}]*gap:6px;height:28px/.test(prodUI), '.chip gọn: gap 6px / cao 28px');
ok(!/\.chip\{[^}]*letter-spacing/.test(prodUI),
  'bỏ letter-spacing:.02em trên .chip (nguyên nhân cảm giác icon lệch)');
ok(/\.chip \.dot\{[^}]*width:6px;height:6px[^}]*align-self:center;margin:0\}/.test(prodUI),
  'chấm 6px, align-self:center, margin:0');
['.chip>b{', '.chip .chip-num{', '.chip .chip-state{'].forEach(sel => {
  const m = prodUI.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^}]*)\\}'));
  ok(!!m && /align-self:center;line-height:1/.test(m[1]),
    sel + ' canh cùng trục với chấm icon');
});
ok(!/^\.quota\{/m.test(prodUI), 'CSS .quota (pill thứ hai) đã gỡ');
ok(!/\.chip,\.quota\{/.test(prodUI) && /\.chip\{height:30px\}/.test(prodUI),
  'media query chỉ còn .chip');
ok(!/max-width:132px;overflow:hidden;text-overflow:ellipsis/.test(prodUI),
  'chip ngắn không còn bị cắt "…" thiếu chuyên nghiệp');
ok(/\.topbar \.chip\{max-width:none;overflow:visible/.test(prodUI),
  'topbar chip không bị giới hạn 132px');

/* --------------------------------------------------------- 3 · LỚP KV THẬT */
ok(/S\.kvWrites = 0; S\.kvReads = 0;/.test(real), 'boot khởi tạo counter KV = 0');
ok(/function setQuota\(\) \{[\s\S]{0,240}S\.kvWrites = WRITES; S\.kvReads = READS;/.test(real),
  'setQuota() đẩy WRITES thật xuống state');
ok(/function redraw\(\) \{[\s\S]{0,240}S\.kvWrites = WRITES; S\.kvReads = READS;/.test(real),
  'redraw() đẩy counter trước khi vẽ lại chip');
ok(/window\.render = function \(\) \{[\s\S]{0,240}S\.kvWrites = WRITES; S\.kvReads = READS;\s*\n\s*origRender\(\);/.test(real),
  'window.render() đẩy counter TRƯỚC origRender()');
ok(/cache:\s*'no-store'/.test(real) && /var headers = \{\};/.test(real),
  'giữ nguyên fix preflight vòng 10');

/* ------------------------------------------------------------- 4 · CONTRACT */
ok(/txt:'KV write 120\/1000'/.test(mock), 'prototype vẫn giữ hằng 120/1000 (file thiết kế)');
ok(/Cloudflare KV · Online/.test(mock), 'prototype vẫn giữ nhãn dài (file thiết kế)');
ok(/id="demoToggle"/.test(mock), 'prototype vẫn là bản MẪU offline');
ok(/MẪU/.test(docsHTML), 'tài liệu lịch sử vẫn giữ chữ MẪU (có chủ đích)');
ok(!/MẪU/.test(prodUI), 'bản phát hành không còn MẪU ngoài docs');

/* ------------------------------------------------------------------ DOM THẬT */
const resp = (x, st = 200) => ({ ok: st < 400, status: st,
  headers: { get: n => n === 'content-type' ? 'application/json' : '' },
  json: async () => x, text: async () => JSON.stringify(x) });

function buildDom(mode, writes) {
  let inject;
  if (mode === 'parsetime') inject = '';              // KHÔNG nạp admin-real.js
  else {
    const pre = mode === 'nocfg' ? '' :
      '<script>try{localStorage.setItem("cz_kv_api","https://qa-worker.workers.dev");' +
      'sessionStorage.setItem("cz_kv_key","ADMIN_KEY_QA");}catch(e){}<\/script>';
    inject = pre + '<script>' + real + '</script>';
  }
  const html = prod.replace(/<script src="\/admin-real\.js[^"]*"><\/script>/, inject);
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push('jsdom: ' + ((e && e.message) || e)));
  vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, {
    url: 'https://ssochuz.pages.dev/admin', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: vc
  });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.scrollTo = () => {};
  if (mode === 'online' || mode === 'high') {
    w.fetch = (u) => {
      const url = new URL(String(u), 'https://ssochuz.pages.dev');
      const p = url.pathname;
      if (p === '/api/health') return Promise.resolve(resp({ ok: true }));
      if (p === '/api/whoami') return Promise.resolve(resp({ ok: true, role: 'super_admin' }));
      if (p === '/api/registry') return Promise.resolve(resp(reg));
      if (p === '/api/admin/kv') return Promise.resolve(resp({ ok: true,
        writesToday: writes, readsToday: 4021, keys: 82, bytes: 123456,
        groups: [{ prefix: 'book', keys: 67 }] }));
      if (p === '/api/admin/comments') return Promise.resolve(resp({ ok: true, comments: [] }));
      if (p === '/api/admin/reports') return Promise.resolve(resp({ ok: true, items: [] }));
      if (p === '/api/admin/stats') return Promise.resolve(resp({ ok: true, items: {}, days: [] }));
      if (p === '/api/admin/log') return Promise.resolve(resp({ ok: true, items: [] }));
      if (p === '/api/admin/voters') return Promise.resolve(resp({ ok: true, book: { count: 0, voters: [] } }));
      if (/^\/api\/book\//.test(p)) return Promise.resolve(resp(bookSeed));
      if (p === '/data/registry.json') return Promise.resolve(resp(reg));
      return Promise.resolve(resp({ ok: true }));
    };
  }
  return { w, D: w.document, errs, dom };
}

async function main() {
  /* 4 DOM dựng song song, 1 lần chờ duy nhất, rồi đọc chi tiết từng kịch bản. */
  const live = [
    ['ONLINE 137', buildDom('online', 137), 137, 'online'],
    ['QUOTA CAO 850', buildDom('high', 850), 850, 'online'],
    ['CHƯA CẤU HÌNH', buildDom('nocfg'), 0, 'static'],
    ['PARSE-TIME', buildDom('parsetime'), undefined, 'checking']
  ];
  await new Promise(r => setTimeout(r, 2300));
  live.forEach(([tag, ctx, expectWrites, expectConn]) => {
    const { w, D, errs } = ctx;
    const topbar = D.getElementById('topbar');
    const chips = topbar ? topbar.querySelectorAll('.chip') : [];
    ok(chips.length === 1, tag + ': topbar có ĐÚNG 1 chip KV (thực ' + chips.length + ')');
    ok(topbar && topbar.querySelectorAll('.quota').length === 0,
      tag + ': không còn pill .quota thứ hai');
    const chip = chips[0];
    const txt = chip ? (chip.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const aria = chip ? (chip.getAttribute('aria-label') || '') : '';
    if (chip) {
      ok(!/Cloudflare/.test(txt), tag + ': chip không lặp "Cloudflare" dài dòng → "' + txt + '"');
      ok(!/120\/1000/.test(txt), tag + ': chip KHÔNG còn 120/1000 → "' + txt + '"');
      ok(/^KV/.test(txt), tag + ': chip bắt đầu bằng nhãn KV → "' + txt + '"');
      ok(!/·/.test(txt), tag + ': chip không còn dấu · rườm rà → "' + txt + '"');
      ok(!!chip.querySelector('.dot'), tag + ': chip có chấm icon');
      ok(/1000 lượt ghi hôm nay/.test(aria), tag + ': aria-label giải thích đủ ngữ cảnh KV');
      ok(chip.getAttribute('title') === aria,
        tag + ': title trùng aria-label (hover/a11y không lệch thông tin)');
      ok(!chip.hasAttribute('data-act'), tag + ': chip chỉ hiển thị, không phải nút đổi trạng thái demo');
      ok(chip.id === 'czKvChip', tag + ': chip có id ổn định #czKvChip');
    }
    const S = w.CZ_MOCKUP && w.CZ_MOCKUP.state;
    const banner = (D.getElementById('quotaBanner') || {}).textContent || '';
    const view = (D.getElementById('view') || {}).textContent || '';

    ok(!!S && S.conn === expectConn, tag + ': conn = ' + expectConn + ' (thực ' + (S && S.conn) + ')');
    if (expectWrites !== undefined)
      ok(S && S.kvWrites === expectWrites,
        tag + ': state.kvWrites = ' + expectWrites + ' từ /api/admin/kv (thực ' + (S && S.kvWrites) + ')');
    ok(errs.length === 0, tag + ': 0 lỗi JS');
    ok(!/Online/.test(txt) || expectConn === 'online',
      tag + ': không tự nhận Online khi chưa nối Worker → "' + txt + '"');

    if (tag === 'ONLINE 137') {
      ok(/137\/1000/.test(txt), 'ONLINE: chip hiện 137/1000 THẬT → "' + txt + '"');
      ok(/137\/1000 lượt ghi hôm nay/.test(aria), 'ONLINE: aria-label có số thật');
      ok(!banner.trim(), 'ONLINE 137: không hiện banner cảnh báo');
      ok(/Quota ghi KV: 137\/1000/.test(view), 'ONLINE: Dashboard sysrow = 137/1000');
      ok(!/Quota ghi KV: 120\/1000/.test(view), 'ONLINE: Dashboard không còn 120/1000');
    }
    if (tag === 'QUOTA CAO 850') {
      ok(/850\/1000/.test(txt), 'QUOTA CAO: chip hiện 850/1000');
      ok(/850\/1000/.test(banner) && /cân nhắc dời thao tác/.test(banner),
        'QUOTA CAO: banner tự sinh từ writesToday (không phải câu cứng 800/1000)');
      ok(!/Quota 800\/1000/.test(banner), 'QUOTA CAO: banner không in cứng 800/1000');
      ok(/Quota ghi KV: 850\/1000/.test(view), 'QUOTA CAO: Dashboard sysrow = 850/1000');
    }
    if (tag === 'CHƯA CẤU HÌNH') {
      ok(/Chỉ đọc/.test(txt) && !/Online/.test(txt),
        'CHƯA CẤU HÌNH: chip "KV Chỉ đọc", không "Online" → "' + txt + '"');
      ok(!/\d+\/1000/.test(txt), 'CHƯA CẤU HÌNH: không hiện số ghi khi chỉ đọc tĩnh');
      ok(!banner.trim(), 'CHƯA CẤU HÌNH: không banner quota');
    }
    if (tag === 'PARSE-TIME') {
      ok(/Đang nối/.test(txt) && !/Online/.test(txt),
        'PARSE-TIME: chip "Đang nối" trước khi /api/whoami trả lời → "' + txt + '"');
      ok(!/120\/1000/.test(txt), 'PARSE-TIME: không flash 120/1000');
      ok(!banner.trim(), 'PARSE-TIME: không banner');
    }
  });

  console.log(JSON.stringify({ bai: 't_admin_kv_chip.js / vòng 13', loi: bad.length,
    kiemTra: checks, errors0: bad }, null, 1));
  process.exit(bad.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
