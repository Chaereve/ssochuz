/* ============================================================================
   REGISTRY CÓ DÒNG RÁC — trang chủ KHÔNG được sập
   ----------------------------------------------------------------------------
   Bối cảnh (lượt rà 2026-11-12): `CZ.slides()` và `CZ.editorChoice()` đọc
   thẳng `n.slug` của từng dòng trong `reg.lib`, còn `renderSched()` đọc
   `it.slug` của từng mục lịch. Một dòng `null` (import hỏng, sửa KV tay, mảng
   JSON thừa dấu phẩy) ⇒ TypeError NGAY GIỮA lúc dựng trang chủ, khối thư viện
   rơi vào khung “Chưa tải được dữ liệu truyện” dù 66 bộ khác vẫn tốt.
   Số chương âm cũng từng hiện nguyên xi (“-3/-3”) trên thẻ truyện.

   Bài này khoá lại: dữ liệu rác KHÔNG làm mất truyện tốt, số chương luôn >= 0,
   và không có lỗi JS nào.
   Chạy:  node tests/t_registry_dirty.js
   ========================================================================== */
const { page } = require('./mk');
const assert = require('node:assert/strict');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ret = (b, ok = true, status = 200) => Promise.resolve({
  ok, status, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)),
});

const GOOD = { slug: 'good-story', title: 'Truyện Tốt', chapters: 7, year: 2024, updated: '2026-11-01', status: 'run' };
const REG = {
  ok: true, rev: '2026-11-12 09:00',
  lib: [null, GOOD, { slug: 'am', title: 'Số Âm', chapters: -3, year: 2023, updated: '2026-10-01' }, 0, 'rác'],
  /* hero + Chuyển thể Series + lịch: mỗi khối đều có dòng null/rác */
  slides: [null, { slug: 'good-story' }, { title: 'thiếu slug' }, 'không-có-slug-này'],
  editorChoice: [null, { slug: 'good-story' }, null],
  schedule: { items: [null, { slug: 'good-story', days: 'Thứ 3', detail: 'chương mới' }, { days: '' }] },
};

(async () => {
  const errors = [];
  const p = page('index.html', {
    url: 'https://ssochuz.pages.dev/',
    fetch: (u) => {
      const path = String(u).replace('https://cms.test', '').split('?')[0];
      if (path === '/api/registry') return ret(REG);
      if (path === '/api/stats') return ret({ ok: true, books: {} });
      if (path === '/api/schedule') return ret({ ok: true, items: REG.schedule.items });
      return ret({}, false, 404);
    },
    config: { CZ_API: 'https://cms.test' },
    setup: (w) => {
      w.__warns = [];
      const ow = w.console.warn;
      w.console.warn = (...a) => { w.__warns.push(a.map(String).join(' ')); if (ow) ow.apply(w.console, a); };
    },
  });
  await wait(1500);
  const w = p.win, d = p.doc;
  errors.push(...(p.errors || []));

  /* 1) LỖI NẶNG: dòng null từng làm cả trang chủ rơi vào khung lỗi */
  assert.equal((w.__warns || []).some((s) => /lỗi dựng trang chủ/.test(s)), false,
    'trang chủ ném lỗi khi dựng: ' + JSON.stringify((w.__warns || []).slice(0, 2)));
  const gridText = (d.querySelector('#grid') || {}).textContent || '';
  assert.equal(/Chưa tải được dữ liệu truyện/.test(gridText), false, 'trang chủ rơi vào khung lỗi tải dữ liệu');

  /* 2) truyện tốt vẫn còn + số chương âm phải kẹp về 0 */
  const lib = w.CZ.lib();
  const slugs = lib.map((n) => n.slug);
  assert.deepEqual(slugs.includes('good-story'), true, 'một dòng rác làm mất luôn truyện tốt khỏi thư viện');
  assert.equal(d.querySelectorAll('#grid .card').length >= 1, true, 'lưới thư viện rỗng dù còn truyện tốt');
  const am = lib.find((n) => n.slug === 'am');
  assert.equal(am && am.chapters, 0, 'số chương âm phải kẹp về 0 (bản cũ hiện nhãn "-3/-3")');

  /* hero: slides có dòng rác nhưng vẫn dựng được (và không nhân bản mục) */
  const hero = d.querySelector('#hero');
  assert.ok(hero, 'mất khối hero');
  assert.equal(/Truyện Tốt/.test(hero.textContent || ''), true, 'hero không hiện truyện tốt');

  /* lịch: chỉ mục hợp lệ được vẽ */
  const sched = d.querySelector('#sched');
  assert.ok(sched, 'mất khối lịch');
  assert.equal(/Truyện Tốt/.test(sched.textContent || ''), true, 'lịch không vẽ được mục hợp lệ');

  assert.deepEqual(errors, []);
  p.dom.window.close();
  console.log(JSON.stringify({
    errors0: [],
    checked: 'registry có null/rác + số chương âm: trang chủ vẫn vẽ thư viện, hero, lịch; số chương kẹp >= 0',
    lib: slugs,
  }));
})().catch((e) => { console.error(e.stack || e.message || e); process.exit(1); });
