/* ============================================================================
   t_chapter_light.mjs · TRANG ĐỌC DÙNG ĐƯỜNG NHẸ (bản 1.16.0)
   ----------------------------------------------------------------------------
   Vì sao có bài này: đường cũ mở 1 chương là tải CẢ bộ (trung bình 334 KB, bộ
   lớn 1,4 MB) — mỗi lượt mở chương tốn 1 lượt đọc KV + một lần JSON.parse cả
   bộ trong Worker. Bản 1.16.0 thêm:
     · GET /api/book/<slug>/toc          → đầu sách + tên chương (vài KB)
     · GET /api/book/<slug>/chapter/<n>  → đúng 1 chương
   Bài này chạy trang đọc THẬT (truyen.html + cz-*.js đã build) với Worker giả
   có 2 đường mới, và kiểm:
     1. mở trang truyện chỉ gọi /toc (+ 1 chương) — KHÔNG gọi /api/book/<slug>
     2. mở chương 3 → chỉ tải chương 3 (2 và 4 tải trước 2 bên)
     3. chuyển chương kế → hiện ngay (đã tải trước), không hiện khung chờ
     4. Worker CŨ (không có /toc) → tự rớt về đường tải cả bộ, trang vẫn chạy
     5. chương tải hỏng → hiện nút “Thử lại”, bấm là tải lại được
   Chạy:  cd tests && node t_chapter_light.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { page } = require('./mk.js');

const BASE = 'https://cms.test';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- sách giả: 6 chương, mỗi chương 1 câu để nhận diện ---------- */
const CH = [
  { t: 'Lời mở đầu', html: '<p>NOI-DUNG-MO-DAU</p>' },
  { t: 'Chương 1', html: '<p>NOI-DUNG-CHUONG-1</p>' },
  { t: 'Chương 2', html: '<p>NOI-DUNG-CHUONG-2</p>' },
  { t: 'Chương 3', html: '<p>NOI-DUNG-CHUONG-3</p>' },
  { t: 'Chương 4', html: '<p>NOI-DUNG-CHUONG-4</p>' },
  { t: 'Chương 5', html: '<p>NOI-DUNG-CHUONG-5</p>' },
];
const HEAD = {
  ok: true, slug: 'light-truyen', title: 'Light Truyện', author: 'TG Nhẹ', couple: 'A x B',
  syn: 'Mô tả ngắn.', synFull: 'Mô tả đầy đủ của bộ.', pending: 0, total: CH.length,
  chapters: CH.map((c) => ({ t: c.t })),
};

/* Worker giả có 2 đường mới. `log` ghi lại mọi lượt gọi để đếm request. */
function apiLight(log, opts = {}) {
  const fails = opts.failOnce || {};       /* { 'slug#n': số lần hỏng còn lại } */
  return (p, opt = {}) => {
    const J = (b, ok = true, st = 200) => Promise.resolve({
      ok, status: st, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)),
    });
    log.push((opt.method || 'GET') + ' ' + p);
    if (p === '/api/registry') return J(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8')));
    if (p === '/api/stats') return J({ ok: true, source: 'kv', items: {} });
    if (p === '/api/schedule') return J({ ok: true, items: [] });
    if (p === '/api/health') return J({ ok: true, version: '1.16.0', kv: true, auth: {} });
    if (p === '/api/view') return J({ ok: true, counted: false });
    if (p === '/api/rate/me') return J({ ok: true, rating: 0 });
    if (p.endsWith('/toc')) {
      if (opts.noToc) return undefined;                       /* Worker CŨ: để lộ rớt về đường cũ */
      return J(HEAD);
    }
    const mc = p.match(/\/chapter\/(\d+)$/);
    if (mc) {
      const n = Number(mc[1]);
      if (fails['light-truyen#' + n] > 0) { fails['light-truyen#' + n] -= 1; return J({ ok: false }, false, 500); }
      if (n < 1 || n > CH.length) return J({ ok: false, error: 'ngoài danh sách' }, false, 404);
      return J({ ...HEAD, index: n, sourceIndex: n - 1, chapter: CH[n - 1] });
    }
    if (p === '/api/book/light-truyen') {
      /* đường cũ: cả bộ (chỉ nên dùng khi Worker cũ / mất mạng) */
      return J({ title: 'Light Truyện', slug: 'light-truyen', author: 'TG Nhẹ', couple: 'A x B', synFull: 'Mô tả đầy đủ của bộ.', chapters: CH });
    }
    return undefined;
  };
}

/* fetch giả: /data/*.json thật + mọi thứ khác qua api() */
function fetchWith(api, log) {
  return (url, opt = {}) => {
    url = String(url);
    const J = (b, ok = true, st = 200) => Promise.resolve({
      ok, status: st, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)),
    });
    if (url.startsWith('/data/registry.json')) return J(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/registry.json'), 'utf8')));
    if (url.includes(BASE)) {
      const p = url.replace(BASE, '').split('?')[0];
      const r = api(p, opt);
      if (r !== undefined) return r;
      if (log) log.push('MISS ' + p);
      return J({ ok: false, error: 'không có trong mock' }, false, 404);
    }
    return J({}, false, 404);
  };
}

const checks = [];
const ck = (name, ok, got, want) => checks.push({ name, ok: !!ok, got, want });
const eq = (name, got, want) => ck(name, JSON.stringify(got) === JSON.stringify(want), got, want);

const mk = (opts = {}) => {
  const log = [];
  const api = apiLight(log, opts);
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/light-truyen/',
    config: { CZ_API: BASE },
    fetch: fetchWith(api, log),
  });
  return { p, log };
};
const txtOf = (p, sel) => {
  const e = p.doc.querySelector(sel);
  return e ? e.textContent.replace(/\s+/g, ' ').trim() : '<null>';
};
const clickSel = (p, sel) => { const e = p.doc.querySelector(sel); if (e) e.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true })); return !!e; };

/* ============================ 1. MỞ CHƯƠNG TỪ ĐẦU ========================= */
{
  const { p, log } = mk();
  await wait(1500);
  const tocCalls = log.filter((l) => l.includes('/toc')).length;
  const fullCalls = log.filter((l) => l.trim().endsWith('/api/book/light-truyen')).length;
  const chapCalls = log.filter((l) => /\/chapter\/\d+$/.test(l)).map((l) => Number(l.match(/\/chapter\/(\d+)$/)[1]));
  ck('mở trang truyện → CÓ gọi /toc', tocCalls >= 1, log, 'có /toc');
  eq('mở trang truyện → KHÔNG tải cả bộ', fullCalls, 0);
  eq('trang truyện KHÔNG cần tải chương nào', chapCalls.length, 0);
  eq('trang truyện dựng đủ danh sách chương', p.doc.querySelectorAll('#chapGrid .cha').length, CH.length);
  ck('số request để mở trang truyện rất ít (≤ 5)', log.length <= 5, log, '≤ 5 request');
  eq('không có lỗi JS', p.errors.length, 0);
}

/* ============================ 2. MỞ CHƯƠNG 3 ============================= */
{
  const log = [];
  const api = apiLight(log);
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/light-truyen/chuong-3/',
    config: { CZ_API: BASE },
    fetch: fetchWith(api, log),
  });
  await wait(1600);
  const calls = log.filter((l) => l.includes('/chapter/')).map((l) => Number(l.match(/\/chapter\/(\d+)$/)[1]));
  ck('mở thẳng chuong-3 → có tải đúng vị trí 3', calls.includes(3), calls, 'có 3');
  ck('mở thẳng chuong-3 → KHÔNG tải vị trí 1 (không tải thừa)', !calls.includes(1), calls, 'không tải 1');
  ck('mở thẳng chương 3 → KHÔNG tải cả bộ', !log.some((l) => l.trim().endsWith('/api/book/light-truyen')), log.slice(-6), 'không tải cả bộ');
  /* vị trí 3 trong sách = “Chương 2” (vì “Lời mở đầu” chiếm vị trí 1) */
  const body = p.doc.querySelector('#rdText') ? p.doc.querySelector('#rdText').textContent : '';
  ck('nội dung đúng vị trí 3 hiện ra', body.includes('NOI-DUNG-CHUONG-2'), body.slice(0, 80), 'có chữ của vị trí 3');
  eq('tiêu đề chương đúng', txtOf(p, '#rdHead'), 'Chương 2');
  eq('không có lỗi JS', p.errors.length, 0);
}

/* ============================ 3. CHUYỂN CHƯƠNG NHANH ===================== */
{
  const log = [];
  const api = apiLight(log);
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/light-truyen/chuong-3/',
    config: { CZ_API: BASE },
    fetch: fetchWith(api, log),
  });
  await wait(1600);
  const beforeChap = log.filter((l) => l.includes('/chapter/')).length;
  clickSel(p, '#navNext');
  await wait(300);                     /* hiệu ứng chuyển chương 170ms */
  const body = p.doc.querySelector('#rdText').textContent || '';
  ck('bấm “Tiếp” → hiện chương kế (vị trí 4)', body.includes('NOI-DUNG-CHUONG-3'), body.slice(0, 60), 'có chữ vị trí 4');
  /* chương đang mở (vị trí 4) phải đã nằm sẵn trong máy; request mới (nếu có)
     chỉ được là TẢI TRƯỚC chương kế — không phải chương đang xem */
  const newChap = log.filter((l) => l.includes('/chapter/')).slice(beforeChap)
    .map((l) => Number(l.match(/\/chapter\/(\d+)$/)[1]));
  ck('bấm “Tiếp” → chương đang xem không phải tải lại', newChap.indexOf(4) < 0, newChap, 'không tải vị trí 4');
  ck('bấm “Tiếp” → chỉ có thể là tải trước chương kế', newChap.every((n) => n === 5), newChap, 'chỉ vị trí 5');
  ck('bấm “Tiếp” → vẫn đếm lượt đọc (POST /api/view)', log.some((l) => l.indexOf('POST /api/view') === 0), log.filter((l) => l.includes('/api/view')), 'có /api/view');
  clickSel(p, '#navPrev');
  await wait(300);
  const body2 = p.doc.querySelector('#rdText').textContent || '';
  ck('bấm “Trước” → hiện lại vị trí 3', body2.includes('NOI-DUNG-CHUONG-2'), body2.slice(0, 60), 'có chữ vị trí 3');
  eq('không có lỗi JS', p.errors.length, 0);
}

/* ==================== 4. WORKER CŨ → RỚT VỀ ĐƯỜNG CẢ BỘ ================== */
{
  const log = [];
  const api = apiLight(log, { noToc: true });
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/light-truyen/',
    config: { CZ_API: BASE },
    fetch: fetchWith(api, log),
  });
  await wait(1700);
  ck('Worker cũ: có gọi /toc rồi rớt về đường cả bộ', log.some((l) => l.includes('/toc')) && log.some((l) => l.trim().endsWith('/api/book/light-truyen')), log.slice(0, 6), 'gọi cả hai');
  eq('Worker cũ: vẫn dựng đủ danh sách chương', p.doc.querySelectorAll('#chapGrid .cha').length, CH.length);
  /* mở chương bằng hash như bản cũ vẫn phải chạy (chữ đã nằm sẵn trong máy) */
  p.win.location.hash = '#chuong-3';
  await wait(500);
  const body = p.doc.querySelector('#rdText') ? p.doc.querySelector('#rdText').textContent : '';
  ck('Worker cũ: mở chương từ hash vẫn ra đúng vị trí 3', body.includes('NOI-DUNG-CHUONG-2'), body.slice(0, 60), 'có chữ vị trí 3');
  const beforeChap2 = log.filter((l) => l.includes('/chapter/')).length;
  clickSel(p, '#navNext');
  await wait(320);
  const body2 = p.doc.querySelector('#rdText') ? p.doc.querySelector('#rdText').textContent : '';
  ck('Worker cũ: chuyển chương kế vẫn chạy', body2.includes('NOI-DUNG-CHUONG-3'), body2.slice(0, 60), 'có chữ vị trí 4');
  eq('Worker cũ: KHÔNG gọi đường /chapter/ nào', log.filter((l) => l.includes('/chapter/')).length, beforeChap2);
  ck('Worker cũ: dùng đúng đường tải cả bộ', log.some((l) => l.trim().endsWith('/api/book/light-truyen')), log.slice(0, 6), 'có gọi cả bộ');
  eq('Worker cũ: không có lỗi JS', p.errors.length, 0);
}

/* ==================== 5. CHƯƠNG TẢI HỎNG → NÚT THỬ LẠI ================== */
{
  const log = [];
  const api = apiLight(log, { failOnce: { 'light-truyen#2': 1 } });
  const p = page('truyen.html', {
    url: 'https://ssochuz.pages.dev/truyen/light-truyen/chuong-2/',
    config: { CZ_API: BASE },
    fetch: fetchWith(api, log),
  });
  await wait(1600);
  const body = p.doc.querySelector('#rdText').textContent || '';
  ck('chương tải hỏng → báo rõ, không trắng trang im lặng', body.includes('Không tải được'), body.slice(0, 80), 'có lời báo');
  const btn = p.doc.querySelector('#rdRetry');
  ck('chương tải hỏng → có nút “Thử lại”', !!btn, body.slice(0, 60), 'có nút');
  if (btn) btn.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  await wait(400);
  const body2 = p.doc.querySelector('#rdText').textContent || '';
  ck('bấm “Thử lại” → tải được đúng chương đó', body2.includes('NOI-DUNG-CHUONG-1'), body2.slice(0, 60), 'có chữ vị trí 2');
  eq('không có lỗi JS', p.errors.length, 0);
}

/* ------------------------------- kết quả --------------------------------- */
const bad = checks.filter((c) => !c.ok);
console.log(JSON.stringify({
  tongSo: checks.length,
  dat: checks.length - bad.length,
  loi: bad.map((c) => c.name + ' (nhận: ' + JSON.stringify(c.got) + ', cần: ' + JSON.stringify(c.want) + ')'),
}, null, 1));
process.exit(bad.length ? 1 : 0);
