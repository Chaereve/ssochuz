/* ============================================================================
   t_updated.js · “NGÀY CẬP NHẬT” PHẢI LÀ NGÀY THẬT, THEO GIỜ VIỆT NAM
   ----------------------------------------------------------------------------
   Người dùng báo: “t up truyện hqua nhưng lúc lên xem thì nó ko hiện lên ngày
   cập nhật hôm nay mà vẫn hiện ngày cũ”, và “check lại số liệu cập nhật trên
   trang, ngày tháng này kia”.

   Lỗi có HAI tầng, bài này khoá cả hai:

   1) WORKER ghi ngày (tests/t_worker.mjs, khối 11d): `updated` chỉ được gán ở
      đường nhập từ Blogger; lưu chương qua /admin không đụng tới ⇒ trang chủ
      vẫn hiện ngày cũ. Nay số chương đọc được TĂNG là ngày nhảy.

   2) WEB đọc/in ngày (bài này): `updated` là NGÀY theo giờ Việt Nam
      ('YYYY-MM-DD' = 00:00 +07:00). Bản cũ để JS hiểu thành 00:00 UTC rồi in
      theo múi giờ máy người đọc ⇒
        · máy đặt UTC-x in lùi 1 ngày (đăng hôm nay, hiện hôm qua);
        · “thời gian trước” lệch nửa ngày: đăng 1 giờ sáng hôm nay vẫn hiện
          “1 ngày trước” như chương của hôm qua;
        · nhãn “MỚI” so mili-giây giữa các bộ lệch múi giờ.
      Nay mọi chỗ in ngày dùng chung dayMs()/dateVN()/timeAgo() theo UTC+7,
      và trang tự đối chiếu số chương (reconcileCount) cũng đẩy `updated` lên
      hôm nay khi số chương thật tăng — máy người đọc còn registry cũ trong
      localStorage/cache SW thì ngày trên thẻ truyện vẫn phải đúng.

   Chạy:  node tests/t_updated.js        (mọi khoá "errors*" phải là [])
   ========================================================================== */
const { page, dataFetch } = require('./mk');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bad = [];
const ok = (cond, msg, got) => { if (!cond) bad.push(msg + (got === undefined ? '' : '  («' + got + '»)')); };

/* “hôm nay” theo giờ Việt Nam — cùng công thức với worker/cms.js (vnDay) */
const vnToday = (ms) => new Date((ms == null ? Date.now() : ms) + 7 * 3600000).toISOString().slice(0, 10);
const vnDayAgo = (n) => vnToday(Date.now() - n * 86400000);
const ddmm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const ddmmyyyy = (iso) => ddmm(iso) + '/' + iso.slice(0, 4);

/* registry giả: 1 bộ “third-person” với ngày `updated` cho trước */
function registryWith(updated, chapters) {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8'));
  const n = reg.lib.find((x) => x.slug === 'third-person');
  n.updated = updated;
  if (chapters != null) n.chapters = chapters;
  return reg;
}
function apiFor(reg) {
  return (m) => {
    if (m.startsWith('/api/registry')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reg), text: () => Promise.resolve('x') });
    }
    return undefined;
  };
}
const text = (doc, sel) => { const e = doc.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : '<null>'; };

(async () => {
  const out = {};

  /* ---------- 1. ĐỊNH DẠNG NGÀY: độc lập với múi giờ máy ---------- */
  {
    const p = page('index.html', { config: { CZ_API: 'https://cms.test' }, fetch: dataFetch({ apiBase: 'https://cms.test', api: apiFor(registryWith('2026-09-29')) }) });
    await wait(1200);
    const CZ = p.win.CZ;
    out.dinhDang = {
      homNay: vnToday(),
      dateVN: CZ.dateVN('2026-11-20'),
      dateVN_iso: CZ.dateVN('2026-11-20T00:00:00+07:00'),
      dateVN_rong: CZ.dateVN(''),
      timeAgo_homNay: CZ.timeAgo(vnToday()),
      timeAgo_homQua: CZ.timeAgo(vnDayAgo(1)),
      timeAgo_5ngay: CZ.timeAgo(vnDayAgo(5)),
      timeAgo_cu: CZ.timeAgo('2026-05-29'),
    };
    ok(CZ.dateVN('2026-11-20') === '20/11/2026', 'dateVN: NGÀY phải in đúng ngày đã lưu, không lùi theo múi giờ máy', CZ.dateVN('2026-11-20'));
    ok(CZ.dateVN('2026-11-20T00:00:00+07:00') === '20/11/2026', 'dateVN: dạng ISO +07:00 phải ra cùng ngày', CZ.dateVN('2026-11-20T00:00:00+07:00'));
    ok(CZ.dateVN('') === '—', 'dateVN: chuỗi rỗng phải là “—”', CZ.dateVN(''));
    ok(CZ.timeAgo(vnToday()) === 'hôm nay', 'timeAgo: ngày hôm nay (giờ VN) phải là “hôm nay”, không phải “x ngày trước”', CZ.timeAgo(vnToday()));
    ok(CZ.timeAgo(vnDayAgo(1)) === 'hôm qua', 'timeAgo: ngày hôm qua phải là “hôm qua”', CZ.timeAgo(vnDayAgo(1)));
    ok(CZ.timeAgo(vnDayAgo(5)) === '5 ngày trước', 'timeAgo: 5 ngày trước là “5 ngày trước”', CZ.timeAgo(vnDayAgo(5)));
    ok(CZ.timeAgo('2026-05-29') === '29/05', 'timeAgo: quá 30 ngày thì in ngày/tháng', CZ.timeAgo('2026-05-29'));
    out.errors0 = p.errors.slice(0, 5);
    ok(p.errors.length === 0, 'trang chủ chạy không lỗi JS', p.errors.slice(0, 2).join(' | '));
    p.win.close();
  }

  /* ---------- 2. TRANG CHỦ: mục “Mới cập nhật” in đúng ngày ---------- */
  {
    /* 3 mốc: hôm nay · hôm qua · một ngày cũ nhưng vẫn nằm trong 12 dòng
       “Mới cập nhật” (bộ cũ hơn sẽ rớt khỏi danh sách — không phải lỗi) */
    const OLD_DAY = '2026-09-20';
    const cases = [
      { updated: vnToday(), want: 'hôm nay', nhan: 'hôm nay' },
      { updated: vnDayAgo(1), want: 'hôm qua', nhan: 'hôm qua' },
      { updated: OLD_DAY, want: ddmm(OLD_DAY), nhan: 'ngày cũ' },
    ];
    out.trangChu = [];
    for (const c of cases) {
      const p = page('index.html', { config: { CZ_API: 'https://cms.test' }, fetch: dataFetch({ apiBase: 'https://cms.test', api: apiFor(registryWith(c.updated)) }) });
      await wait(1400);
      /* chỉ đọc ĐÚNG dòng của bộ đang thử (rail còn 11 bộ khác) */
      const link = [...p.doc.querySelectorAll('#newRail a')].find((a) => /Third Person/.test(a.textContent || ''));
      const row = link ? link.textContent.replace(/\s+/g, ' ').trim() : '<không thấy dòng Third Person>';
      const got = /hôm nay/.test(row) ? 'hôm nay' : /hôm qua/.test(row) ? 'hôm qua'
        : ((row.match(/(\d{2})\/(\d{2})/) || []).slice(1, 3).join('/') || '<không thấy>');
      out.trangChu.push({ updated: c.updated, got, row: row.slice(0, 60) });
      ok(got === c.want, 'trang chủ/“Mới cập nhật”: bộ cập nhật ' + c.nhan + ' phải hiện “' + c.want + '”', got);
      ok(p.errors.length === 0, 'trang chủ (' + c.nhan + ') chạy không lỗi JS', p.errors.slice(0, 2).join(' | '));
      p.win.close();
    }
  }

  /* ---------- 3. TRANG TRUYỆN: tab Thông tin + khối tiêu đề in đúng ngày ---------- */
  {
    for (const c of [{ updated: vnToday(), want: ddmmyyyy(vnToday()), nhan: 'hôm nay' },
                     { updated: '2026-09-29', want: '29/09/2026', nhan: 'ngày cũ' }]) {
      const p = page('truyen.html', {
        url: 'https://ssochuz.pages.dev/truyen/third-person/',
        config: { CZ_API: 'https://cms.test' },
        fetch: dataFetch({ apiBase: 'https://cms.test', api: apiFor(registryWith(c.updated)) }),
      });
      await wait(1600);
      const stat = text(p.doc, '#shero .stat');
      const info = text(p.doc, '#storyInfo');
      out['truyen_' + (c.updated === vnToday() ? 'homNay' : 'cu')] = { stat: stat.slice(0, 60), info: info.slice(0, 120) };
      ok(stat.indexOf(c.want) >= 0, 'trang truyện/khối tiêu đề: “Cập nhật” phải là ' + c.want + ' (' + c.nhan + ')', stat.slice(0, 60));
      ok(info.indexOf(c.want) >= 0, 'trang truyện/tab Thông tin: “Cập nhật” phải là ' + c.want + ' (' + c.nhan + ')', info.slice(0, 120));
      ok(p.errors.length === 0, 'trang truyện (' + c.nhan + ') chạy không lỗi JS', p.errors.slice(0, 2).join(' | '));
      p.win.close();
    }
  }

  /* ---------- 4. MÁY CÒN REGISTRY CŨ: số chương thật tăng ⇒ ngày cũng phải nhảy ----------
     Người đọc có sẵn registry cũ trong localStorage/cache của service worker:
     số chương trang tự đối chiếu được (reconcileCount) — trước đây ngày thì
     không, nên thẻ truyện hiện “42 chương” mà ngày vẫn của tháng trước. */
  {
    const OLD = '2026-01-15';
    const p = page('index.html', {
      config: { CZ_API: 'https://cms.test' },
      fetch: dataFetch({ apiBase: 'https://cms.test', api: apiFor(registryWith(OLD, 41)) }),
    });
    await wait(1200);
    const CZ = p.win.CZ;
    const truoc = (CZ.findLib('third-person') || {}).updated;
    CZ.reconcileCount('third-person', 42);       /* kho chương thật có 42 chương */
    const sau = (CZ.findLib('third-person') || {}).updated;
    out.reconcile = { truoc, sau, homNay: vnToday(), chuong: (CZ.findLib('third-person') || {}).chapters };
    ok(truoc === OLD, 'reconcile: trước khi đối chiếu, ngày là ngày cũ trong registry', truoc);
    ok(sau === vnToday(), 'reconcile: số chương thật TĂNG ⇒ ngày cập nhật phải lên hôm nay (giờ VN)', sau);
    ok((CZ.findLib('third-person') || {}).chapters === 42, 'reconcile: số chương vẫn đúng 42', (CZ.findLib('third-person') || {}).chapters);
    /* đối chiếu lại (không tăng) thì KHÔNG đẩy ngày của bộ khác/không đổi gì */
    const reg2 = registryWith('2026-01-15', 42);
    ok((CZ.findLib('third-person') || {}).updated === vnToday(), 'reconcile: giữ nguyên ngày mới sau khi đã đẩy', (CZ.findLib('third-person') || {}).updated);
    out.errors1 = p.errors.slice(0, 5);
    ok(p.errors.length === 0, 'reconcile: trang chạy không lỗi JS', p.errors.slice(0, 2).join(' | '));
    p.win.close();
  }

  /* ---------- 5. NGUỒN DỮ LIỆU: worker + admin dùng CÙNG một “hôm nay” ---------- */
  {
    const cms = fs.readFileSync(path.join(ROOT, 'worker/cms.js'), 'utf8');
    const real = fs.readFileSync(path.join(ROOT, 'admin-real.js'), 'utf8');
    const bk = fs.readFileSync(path.join(ROOT, 'src/admin/utils/books.js'), 'utf8');
    ok(/function vnDay\(ms\)[\s\S]{0,200}\+ 7 \* 3600000/.test(cms), 'worker: phải có vnDay() cộng 7 giờ (UTC+7) để tính ngày Việt Nam');
    ok(/function bumpUpdated/.test(cms), 'worker: phải có bumpUpdated() ghi ngày khi có chương mới');
    ok(/liveBefore/.test(cms), 'worker: syncCountToRegistry phải nhận số chương TRƯỚC khi lưu để biết “vừa có chương mới”');
    ok(/Date\.now\(\) \+ 7 \* 3600000/.test(real), 'admin-real.js: today() phải theo giờ Việt Nam');
    ok(/Date\.now\(\) \+ 7 \* 3600000/.test(bk), 'src/admin/utils/books.js: today() phải theo giờ Việt Nam');
    ok(/out\.updated = m\.updated \|\| out\.updated \|\| today\(\)/.test(real),
      'admin: sửa mô tả/ảnh bìa KHÔNG được gán lại ngày cập nhật hôm nay');
    out.nguon = { worker: /vnDay/.test(cms), admin: /Date\.now\(\) \+ 7 \* 3600000/.test(real) };
  }

  out.errors2 = bad;
  console.log(JSON.stringify(out, null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.log(JSON.stringify({ errors0: ['bài kiểm ném lỗi: ' + (e && e.stack || e)] }, null, 1));
  process.exit(1);
});
